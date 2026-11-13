import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { metricCatalog } from "../server/metrics.js";

const DAY = 86400000;
function ago(days, seconds = 0) {
  return new Date(Date.now() - days * DAY - seconds * 1000).toISOString();
}
function rulesForAllMeasures() {
  return metricCatalog.map((entry) => ({
    id: entry.measure,
    name: entry.name,
    measure: entry.measure,
    category: entry.category,
    target: 80,
    warningThreshold: 50,
    windowDays: 7,
    enabled: true,
  }));
}
async function fixture(t, { persistent = false } = {}) {
  const temporary = persistent
    ? mkdtempSync(join(tmpdir(), "meridian-metrics-"))
    : null;
  const database = temporary ? join(temporary, "metrics.sqlite") : ":memory:";
  const { app, store } = createApp({ database, demo: true, seed: false });
  for (const role of ["admin", "instructor", "learner"]) {
    store.put("users", {
      id: role,
      role,
      name: `${role} Test`,
      email: `${role}@example.test`,
    });
  }
  store.put("users", {
    id: "other",
    role: "learner",
    name: "Private Learner",
    email: "private@example.test",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookies = {};
  for (const role of ["admin", "instructor", "learner"]) {
    const response = await fetch(base + "/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    assert.equal(response.status, 200);
    cookies[role] = response.headers.get("set-cookie").split(";")[0];
  }
  async function api(path, { role = "admin", method = "GET", body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(role ? { Cookie: cookies[role] } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  const course = (id = "course", fields = {}) =>
    store.put("courses", {
      id,
      title: `Course ${id}`,
      status: "published",
      passingScore: 70,
      weights: { quizzes: 40, assignments: 40, participation: 20 },
      ...fields,
    });
  const enroll = (courseId = "course", userId = "learner", fields = {}) =>
    store.put("enrollments", {
      id: `${courseId}:${userId}`,
      courseId,
      userId,
      completed: false,
      grades: {},
      createdAt: ago(60),
      ...fields,
    });
  const configure = async (rules = rulesForAllMeasures()) => {
    const result = await api("/metrics/config", {
      method: "PUT",
      body: { rules },
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data;
  };
  const metrics = async (query = "", role = "admin") => {
    const result = await api(`/metrics${query}`, { role });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return {
      ...result.data,
      byMeasure: Object.fromEntries(
        result.data.metrics.map((metric) => [metric.measure, metric]),
      ),
    };
  };
  return { store, database, api, course, enroll, configure, metrics };
}

test("metric configuration is admin-only, validated, persisted and resettable", async (t) => {
  const f = await fixture(t, { persistent: true });
  const initial = await f.api("/metrics/config");
  assert.equal(initial.status, 200);
  assert.deepEqual(
    initial.data.rules.map(({ measure, target }) => [measure, target]),
    [
      ["engagement_rate", 70],
      ["average_progress", 60],
      ["achievement_rate", 75],
    ],
  );
  assert.equal(initial.data.canEdit, true);
  assert.equal(initial.data.catalog.length, 6);
  assert.equal((await f.api("/metrics/config", { role: null })).status, 401);
  assert.equal((await f.api("/metrics", { role: null })).status, 401);
  for (const role of ["instructor", "learner"]) {
    assert.equal(
      (await f.api("/metrics/config", { role })).data.canEdit,
      false,
    );
    assert.equal(
      (
        await f.api("/metrics/config", {
          role,
          method: "PUT",
          body: { rules: [] },
        })
      ).status,
      403,
    );
  }
  const custom = rulesForAllMeasures();
  custom[0].name = "Weekly participation";
  custom[0].target = 90;
  custom[0].warningThreshold = 75;
  const saved = await f.configure(custom);
  assert.deepEqual(saved.rules, custom);
  assert.ok(saved.updatedAt);
  const reopened = createStore(f.database);
  assert.deepEqual(reopened.get("metrics-config", "workspace").rules, custom);
  reopened.close();
  const base = custom[0];
  const invalid = [
    null,
    [null],
    [{ ...base, target: 50, warningThreshold: 50 }],
    [{ ...base, target: 49 }],
    [{ ...base, target: 101 }],
    [{ ...base, warningThreshold: -1 }],
    [{ ...base, target: "90" }],
    [{ ...base, windowDays: 14 }],
    [{ ...base, category: "achievement" }],
    [{ ...base, measure: "invented" }],
    [{ ...base, enabled: "true" }],
    [{ ...base, name: " " }],
    [{ ...base, id: "../bad" }],
    [base, base],
    Array.from({ length: 13 }, (_, index) => ({
      ...base,
      id: `rule-${index}`,
    })),
  ];
  for (const rules of invalid) {
    const rejected = await f.api("/metrics/config", {
      method: "PUT",
      body: { rules },
    });
    assert.equal(rejected.status, 400, JSON.stringify(rules));
  }
  assert.deepEqual((await f.api("/metrics/config")).data.rules, custom);
  await f.configure(initial.data.rules);
  assert.deepEqual(
    (await f.api("/metrics/config")).data.rules,
    initial.data.rules,
  );
});

test("empty courses report no data, never a healthy score, and metrics can be disabled", async (t) => {
  const f = await fixture(t);
  f.course();
  await f.configure();
  const result = await f.metrics("?days=7");
  assert.equal(result.activity.length, 7);
  assert.ok(
    result.activity.every(
      (day) =>
        day.attempts === 0 && day.completions === 0 && day.activeLearners === 0,
    ),
  );
  assert.ok(
    result.metrics.every(
      (metric) =>
        metric.value === null &&
        metric.sampleSize === 0 &&
        metric.state === "no-data" &&
        metric.gap === null,
    ),
  );
  assert.equal(result.courseHealth[0].healthScore, null);
  assert.deepEqual(result.assessments, []);
  await f.configure(
    rulesForAllMeasures().map((rule) => ({ ...rule, enabled: false })),
  );
  assert.deepEqual((await f.metrics()).metrics, []);
  assert.equal((await f.metrics()).courseHealth[0].healthScore, null);
  await f.configure([]);
  assert.deepEqual((await f.metrics()).rules, []);
  for (const query of [
    "?days=1",
    "?days=abc",
    "?courseId=",
    "?courseId=missing",
  ]) {
    assert.equal(
      (await f.api(`/metrics${query}`)).status,
      query.includes("missing") ? 404 : 400,
    );
  }
});

test("snapshot metrics use weighted grades and eligible native activities with correct denominators", async (t) => {
  const f = await fixture(t);
  f.course();
  f.enroll("course", "learner", {
    completed: true,
    grades: { quizzes: 90, assignments: 70 },
  });
  f.enroll("course", "other", { grades: { quizzes: 60 } });
  f.store.put("quizzes", { id: "draft-quiz", published: false });
  f.store.put("games", { id: "draft-game", published: false });
  f.store.put("games", { id: "live-game", published: true });
  for (const item of [
    { id: "lesson", type: "lesson" },
    { id: "game", type: "game", gameId: "live-game" },
    { id: "h5p", type: "h5p" },
    { id: "draft-quiz", type: "quiz", quizId: "draft-quiz" },
    { id: "draft-game", type: "game", gameId: "draft-game" },
  ])
    f.store.put("items", { ...item, courseId: "course" });
  for (const [id, itemId] of [
    ["done", "lesson"],
    ["duplicate", "lesson"],
    ["retired", "h5p"],
    ["draft", "draft-game"],
    ["deleted", "missing"],
  ]) {
    f.store.put("completions", {
      id,
      itemId,
      courseId: "course",
      userId: "other",
      createdAt: ago(40),
    });
  }
  await f.configure();
  const result = await f.metrics();
  const values = result.byMeasure;
  assert.equal(values.completion_rate.value, 50);
  assert.equal(values.average_progress.value, 75);
  assert.equal(values.average_grade.value, 70);
  assert.equal(values.achievement_rate.value, 50);
  for (const name of [
    "completion_rate",
    "average_progress",
    "average_grade",
    "achievement_rate",
  ]) {
    assert.equal(values[name].sampleSize, 2);
    assert.equal(values[name].scope, "snapshot");
  }
  assert.equal(values.average_progress.state, "watch");
  assert.equal(values.average_progress.gap, 5);
  assert.equal(values.engagement_rate.state, "at-risk");
  assert.equal(values.assessment_pass_rate.state, "no-data");
  assert.equal(result.courseHealth[0].healthScore, 61.3);
  await f.configure(
    rulesForAllMeasures().map((rule) => ({ ...rule, windowDays: 90 })),
  );
  const wider = await f.metrics();
  assert.equal(wider.byMeasure.average_progress.value, 75);
  assert.equal(wider.byMeasure.average_grade.value, 70);
  assert.equal(wider.byMeasure.engagement_rate.value, 50);
});

test("engagement uses learner learning events and individual rule windows, with UTC calendar series", async (t) => {
  const f = await fixture(t);
  f.course();
  f.enroll();
  f.enroll("course", "other");
  f.store.put("activities", {
    id: "recent",
    type: "lesson_view",
    courseId: "course",
    userId: "learner",
    createdAt: ago(1),
  });
  f.store.put("activities", {
    id: "old",
    type: "quiz_started",
    courseId: "course",
    userId: "other",
    createdAt: ago(10),
  });
  f.store.put("activities", {
    id: "staff-edit",
    type: "activity",
    courseId: "course",
    userId: "instructor",
    createdAt: ago(1),
  });
  f.store.put("activities", {
    id: "non-learning",
    type: "grading",
    courseId: "course",
    userId: "other",
    createdAt: ago(1),
  });
  f.store.put("activities", {
    id: "future",
    type: "lesson_view",
    courseId: "course",
    userId: "other",
    createdAt: ago(-10),
  });
  const engagement = rulesForAllMeasures().find(
    (rule) => rule.measure === "engagement_rate",
  );
  await f.configure([
    engagement,
    { ...engagement, id: "monthly", windowDays: 30 },
  ]);
  const result = await f.metrics("?days=7");
  assert.equal(result.metrics[0].value, 50);
  assert.equal(result.metrics[0].state, "watch");
  assert.equal(result.metrics[1].value, 100);
  assert.equal(result.metrics[1].state, "healthy");
  assert.equal(result.metrics[1].gap, -20);
  assert.equal(result.scope.timeZone, "UTC");
  assert.equal(result.activity.length, 7);
  assert.equal(
    result.activity.at(-1).date,
    new Date().toISOString().slice(0, 10),
  );
  assert.equal(
    result.activity.reduce((sum, day) => sum + day.activeLearners, 0),
    1,
  );
  const longer = await f.metrics("?days=30");
  assert.equal(longer.metrics[0].value, 50);
  assert.equal(
    longer.activity.reduce((sum, day) => sum + day.activeLearners, 0),
    2,
  );
});

test("native quiz and game attempts feed pass rates, durations, activity and engagement without legacy H5P", async (t) => {
  const f = await fixture(t);
  f.course();
  f.enroll();
  f.enroll("course", "other");
  const attempt = (id, fields = {}) =>
    f.store.put("attempts", {
      id,
      courseId: "course",
      userId: "learner",
      quizId: "quiz",
      type: "quiz",
      submittedAt: ago(1),
      startedAt: ago(1, 120),
      percentage: 80,
      pendingReview: false,
      quizSnapshot: {
        title: "Quiz practice",
        passingScore: 90,
        questions: [{ answer: "SECRET" }],
      },
      ...fields,
    });
  attempt("quiz"); // Below this attempt's saved passing score, despite exceeding the course pass mark.
  attempt("game", {
    type: "game",
    gameId: "game",
    quizId: "game",
    userId: "other",
    percentage: 60,
    durationSeconds: 45,
    quizSnapshot: { title: "Native matching", passingScore: 50 },
  });
  attempt("pending", { pendingReview: true, percentage: 100 });
  attempt("unsubmitted", {
    submittedAt: null,
    startedAt: ago(1),
    percentage: null,
  });
  attempt("old", { submittedAt: ago(10), startedAt: ago(10, 120) });
  attempt("future", { submittedAt: ago(-10), startedAt: ago(-10, 120) });
  attempt("assignment", { type: "assignment" });
  attempt("legacy", { type: "h5p" });
  attempt("staff", { userId: "instructor" });
  f.store.put("items", { id: "lesson", type: "lesson", courseId: "course" });
  f.store.put("completions", {
    id: "completed",
    itemId: "lesson",
    userId: "learner",
    courseId: "course",
    createdAt: ago(1),
  });
  f.store.put("completions", {
    id: "completed-duplicate",
    itemId: "lesson",
    userId: "learner",
    courseId: "course",
    createdAt: ago(1),
  });
  await f.configure();
  const result = await f.metrics("?days=7");
  assert.equal(result.byMeasure.assessment_pass_rate.value, 50);
  assert.equal(result.byMeasure.assessment_pass_rate.sampleSize, 2);
  assert.equal(result.byMeasure.engagement_rate.value, 100);
  assert.equal(
    result.activity.reduce((sum, day) => sum + day.attempts, 0),
    3,
  );
  assert.equal(
    result.activity.reduce((sum, day) => sum + day.completions, 0),
    1,
  );
  assert.equal(
    result.activity.reduce((sum, day) => sum + day.activeLearners, 0),
    2,
  );
  assert.equal(result.assessments.length, 2);
  const quiz = result.assessments.find((row) => row.type === "quiz");
  assert.deepEqual(
    [
      quiz.attempts,
      quiz.gradedAttempts,
      quiz.pendingReview,
      quiz.averageScore,
      quiz.passRate,
      quiz.averageDurationSeconds,
    ],
    [2, 1, 1, 80, 0, 120],
  );
  const game = result.assessments.find((row) => row.type === "game");
  assert.deepEqual(
    [
      game.attempts,
      game.averageScore,
      game.passRate,
      game.averageDurationSeconds,
    ],
    [1, 60, 100, 45],
  );
  assert.ok(!JSON.stringify(result).includes("SECRET"));
});

test("learner metrics include only their own work in published enrolled courses", async (t) => {
  const f = await fixture(t);
  f.course();
  f.course("draft", { status: "draft", title: "Hidden draft title" });
  f.course("private", { title: "Other learner private course" });
  f.enroll("course", "learner", { grades: { quizzes: 20 } });
  f.enroll("course", "other", { completed: true, grades: { quizzes: 100 } });
  f.enroll("draft", "learner", { completed: true, grades: { quizzes: 100 } });
  f.enroll("private", "other", { completed: true, grades: { quizzes: 100 } });
  for (const [id, courseId, userId, percentage] of [
    ["own", "course", "learner", 20],
    ["other", "course", "other", 100],
    ["draft", "draft", "learner", 100],
    ["private", "private", "other", 100],
  ]) {
    f.store.put("attempts", {
      id,
      quizId: id,
      courseId,
      userId,
      percentage,
      submittedAt: ago(1),
      startedAt: ago(1, 20),
      quizSnapshot: { title: `${id} assessment`, passingScore: 70 },
    });
  }
  await f.configure();
  const own = await f.metrics("", "learner");
  assert.equal(own.scope.personal, true);
  assert.equal(own.canEdit, false);
  assert.equal(own.byMeasure.average_grade.value, 20);
  assert.equal(own.byMeasure.average_grade.sampleSize, 1);
  assert.equal(own.byMeasure.completion_rate.value, 0);
  assert.equal(own.byMeasure.achievement_rate.value, 0);
  assert.equal(own.byMeasure.assessment_pass_rate.value, 0);
  assert.deepEqual(
    own.courseHealth.map((course) => course.courseId),
    ["course"],
  );
  assert.deepEqual(
    own.assessments.map((row) => row.id),
    ["own"],
  );
  assert.equal(
    own.activity.reduce((sum, day) => sum + day.attempts, 0),
    1,
  );
  assert.ok(!JSON.stringify(own).includes("Hidden draft title"));
  assert.ok(!JSON.stringify(own).includes("private@example.test"));
  for (const courseId of ["draft", "private", "missing"]) {
    const denied = await f.api(`/metrics?courseId=${courseId}`, {
      role: "learner",
    });
    assert.equal(denied.status, 404);
    assert.equal(denied.data.error, "Course not found.");
  }
  const global = await f.metrics("", "instructor");
  assert.equal(global.scope.personal, false);
  assert.equal(global.byMeasure.average_grade.value, 80);
  assert.equal(global.byMeasure.average_grade.sampleSize, 4);
  assert.equal(global.courseHealth.length, 3);
  assert.equal(global.assessments.length, 4);
  const courseOnly = await f.metrics("?courseId=course", "instructor");
  assert.equal(courseOnly.byMeasure.average_grade.value, 60);
  assert.equal(courseOnly.byMeasure.average_grade.sampleSize, 2);
});

test("ungraded enrollments and pending assessments do not create achievement data", async (t) => {
  const f = await fixture(t);
  f.course();
  f.enroll();
  f.store.put("attempts", {
    id: "pending",
    courseId: "course",
    userId: "learner",
    quizId: "essay",
    submittedAt: ago(1),
    pendingReview: true,
    percentage: 0,
    quizSnapshot: { title: "Essay quiz", passingScore: 70 },
  });
  await f.configure();
  const result = await f.metrics();
  for (const measure of [
    "average_grade",
    "achievement_rate",
    "assessment_pass_rate",
    "average_progress",
  ]) {
    assert.equal(result.byMeasure[measure].value, null, measure);
    assert.equal(result.byMeasure[measure].sampleSize, 0, measure);
    assert.equal(result.byMeasure[measure].state, "no-data", measure);
  }
  assert.equal(result.byMeasure.completion_rate.value, 0);
  assert.equal(result.byMeasure.engagement_rate.value, 100);
  assert.equal(result.assessments[0].averageScore, null);
  assert.equal(result.assessments[0].passRate, null);
  assert.equal(result.assessments[0].averageDurationSeconds, null);
});

test("real native submissions update gradebook and metric charts while content edits preserve completion dates", async (t) => {
  const f = await fixture(t);
  async function post(path, body, role = "admin") {
    const result = await f.api(path, { method: "POST", body, role });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
    return result.data;
  }
  const { course } = await post("/courses", {
    title: "Native metric integration",
    code: "METRICS",
    status: "published",
  });
  const base = `/courses/${course.id}`;
  const { quiz } = await post(base + "/quizzes", {
    title: "Native quiz",
    published: true,
    attempts: 2,
    passingScore: 70,
    questions: [
      {
        id: "question",
        type: "multiple-choice",
        prompt: "Choose yes",
        options: ["Yes", "No"],
        answer: "Yes",
        points: 1,
      },
    ],
  });
  const { game } = await post(base + "/games", {
    title: "Native sequence",
    type: "sequence",
    published: true,
    sequence: [
      { id: "a", text: "Plan" },
      { id: "b", text: "Build" },
      { id: "c", text: "Test" },
    ],
  });
  const { module } = await post(base + "/modules", {
    title: "Learning activities",
  });
  await post(`${base}/modules/${module.id}/items`, {
    title: quiz.title,
    type: "quiz",
    quizId: quiz.id,
  });
  const { item: gameItem } = await post(`${base}/modules/${module.id}/items`, {
    title: game.title,
    type: "game",
    gameId: game.id,
  });
  await post(base + "/enroll", {}, "learner");
  const startedQuiz = await post(
    `${base}/quizzes/${quiz.id}/start`,
    {},
    "learner",
  );
  await post(
    `${base}/quizzes/${quiz.id}/submit`,
    { attemptId: startedQuiz.attemptId, answers: { question: "Yes" } },
    "learner",
  );
  const startedGame = await post(
    `${base}/games/${game.id}/start`,
    {},
    "learner",
  );
  const answers = ["Plan", "Build", "Test"].map(
    (text) => startedGame.game.items.find((item) => item.text === text).id,
  );
  await post(
    `${base}/games/${game.id}/submit`,
    { attemptId: startedGame.attemptId, answers },
    "learner",
  );
  await f.configure();
  const result = await f.metrics(`?courseId=${course.id}&days=7`);
  assert.ok(
    result.metrics.every(
      (metric) => metric.value === 100 && metric.state === "healthy",
    ),
  );
  assert.equal(result.byMeasure.assessment_pass_rate.sampleSize, 2);
  assert.equal(result.courseHealth[0].healthScore, 100);
  assert.equal(
    result.activity.reduce((sum, day) => sum + day.attempts, 0),
    2,
  );
  assert.equal(
    result.activity.reduce((sum, day) => sum + day.completions, 0),
    2,
  );
  assert.equal(
    result.activity.reduce((sum, day) => sum + day.activeLearners, 0),
    1,
  );
  assert.deepEqual(
    new Set(result.assessments.map((row) => row.type)),
    new Set(["quiz", "game"]),
  );
  const gradebook = await f.api(base + "/gradebook");
  assert.equal(
    gradebook.data.rows[0].quizzes,
    result.byMeasure.average_grade.value,
  );
  const completion = f.store
    .all("completions")
    .find((entry) => entry.itemId === gameItem.id);
  const originalCompletionDate = ago(40);
  f.store.put("completions", {
    ...completion,
    createdAt: originalCompletionDate,
  });
  const edited = await f.api(`${base}/games/${game.id}`, {
    method: "PATCH",
    body: { title: "Renamed sequence" },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assert.equal(
    f.store.get("completions", completion.id).createdAt,
    originalCompletionDate,
  );
  const after = await f.metrics(`?courseId=${course.id}&days=7`);
  assert.equal(after.byMeasure.average_progress.value, 100);
  assert.equal(
    after.activity.reduce((sum, day) => sum + day.completions, 0),
    1,
  );
});
