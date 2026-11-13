import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { gradeRow } from "../server/domain.js";

let server, store, url;
const cookies = {};
const temp = mkdtempSync(join(tmpdir(), "meridian-test-"));
const database = join(temp, "test.sqlite");
before(async () => {
  const result = createApp({ database, demo: true });
  store = result.store;
  server = result.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  url = `http://127.0.0.1:${server.address().port}`;
  for (const role of ["instructor", "learner"]) {
    const response = await fetch(url + "/api/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    assert.equal(response.status, 200);
    cookies[role] = response.headers.get("set-cookie").split(";")[0];
  }
});
after(async () => {
  await new Promise((r) => server.close(r));
  store.close();
  rmSync(temp, { recursive: true, force: true });
});
async function api(
  path,
  { role = "instructor", method = "GET", body, headers = {} } = {},
) {
  const response = await fetch(url + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { Cookie: cookies[role] } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const basicCourse = (title = "Test course") => ({
  title,
  code: "T" + Math.random().toString(36).slice(2, 8),
  status: "published",
  weights: { quizzes: 40, assignments: 40, participation: 20 },
});
async function createCourse(body = {}) {
  const response = await api("/courses", {
    method: "POST",
    body: { ...basicCourse(), ...body },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.course;
}
async function createQuiz(
  course,
  questionType = "multiple-choice",
  extra = {},
) {
  const response = await api(`/courses/${course.id}/quizzes`, {
    method: "POST",
    body: {
      title: "Knowledge check",
      published: true,
      timeLimit: 10,
      attempts: 1,
      passingScore: 70,
      questions: [
        {
          id: "q1",
          type: questionType,
          prompt: "What is correct?",
          options: ["Yes", "No"],
          answer: questionType === "essay" ? "" : "Yes",
          points: 10,
        },
      ],
      ...extra,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.quiz;
}
async function enroll(course) {
  const r = await api(`/courses/${course.id}/enroll`, {
    role: "learner",
    method: "POST",
    body: {},
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
}

test("bootstrap returns seeded data and protects private information", async () => {
  const r = await api("/bootstrap");
  assert.equal(r.status, 200);
  assert.equal(r.data.courses.length, 6);
  assert.equal(r.data.learners.length, 16);
  assert.equal(r.data.user.role, "instructor");
  assert.equal(r.data.analytics.totalLearners, 16);
  const anon = await api("/bootstrap", { role: null });
  assert.equal(anon.data.user, null);
  assert.deepEqual(anon.data.courses, []);
  const learner = await api("/bootstrap", { role: "learner" });
  assert.equal(learner.data.courses.length, 4);
  assert.equal(learner.data.learners.length, 1);
});
test("learners cannot change courses or read other students grades", async () => {
  const denied = await api("/courses", {
    role: "learner",
    method: "POST",
    body: basicCourse(),
  });
  assert.equal(denied.status, 403);
  const grades = await api("/courses/design/gradebook", { role: "learner" });
  assert.equal(grades.status, 200);
  assert.equal(grades.data.rows.length, 1);
  assert.equal(grades.data.rows[0].userId, "learner");
  const csrf = await api("/profile", {
    method: "PATCH",
    body: { name: "Hacked" },
    headers: { Origin: "https://other.example" },
  });
  assert.equal(csrf.status, 403);
});
test("course settings validate weights, dates and prerequisite cycles", async () => {
  assert.equal(
    (
      await api("/courses", {
        method: "POST",
        body: {
          ...basicCourse(),
          weights: { quizzes: 50, assignments: 40, participation: 20 },
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/courses", {
        method: "POST",
        body: {
          ...basicCourse(),
          startDate: "2026-12-01",
          endDate: "2026-01-01",
        },
      })
    ).status,
    400,
  );
  const a = await createCourse({ title: "A" });
  const b = await createCourse({ title: "B", prerequisites: [a.id] });
  const cycle = await api(`/courses/${a.id}`, {
    method: "PATCH",
    body: { prerequisites: [b.id] },
  });
  assert.equal(cycle.status, 400);
});
test("prerequisites and course dates gate enrollment and activity access", async () => {
  const prereq = await createCourse({ title: "Prerequisite" });
  const next = await createCourse({
    title: "Advanced",
    prerequisites: [prereq.id],
  });
  await enroll(prereq);
  assert.equal(
    (
      await api(`/courses/${next.id}/enroll`, {
        role: "learner",
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
  await api(`/courses/${prereq.id}/grades/learner`, {
    method: "PATCH",
    body: { completed: true },
  });
  await enroll(next);
  const future = await createCourse({
    startDate: "2099-01-01",
    endDate: "2099-12-01",
  });
  assert.equal(
    (
      await api(`/courses/${future.id}/enroll`, {
        role: "learner",
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
  const invite = await createCourse({ enrollment: "invite" });
  assert.equal(
    (
      await api(`/courses/${invite.id}/enroll`, {
        role: "learner",
        method: "POST",
        body: {},
      })
    ).status,
    403,
  );
});
test("quiz attempts auto-grade, hide answers, prevent replay and honor attempt limits", async () => {
  const c = await createCourse();
  const q = await createQuiz(c);
  await enroll(c);
  const detail = await api(`/courses/${c.id}`, { role: "learner" });
  assert.ok(!Object.hasOwn(detail.data.quizzes[0].questions[0], "answer"));
  const started = await api(`/courses/${c.id}/quizzes/${q.id}/start`, {
    role: "learner",
    method: "POST",
    body: {},
  });
  assert.equal(started.status, 201);
  const attemptId = started.data.attemptId;
  const resumed = await api(`/courses/${c.id}/quizzes/${q.id}/start`, {
    role: "learner",
    method: "POST",
    body: {},
  });
  assert.equal(resumed.data.attemptId, attemptId);
  const submitted = await api(`/courses/${c.id}/quizzes/${q.id}/submit`, {
    role: "learner",
    method: "POST",
    body: { attemptId, answers: { q1: "Yes" } },
  });
  assert.equal(submitted.data.percentage, 100);
  assert.equal(submitted.data.passed, true);
  assert.equal(
    (
      await api(`/courses/${c.id}/quizzes/${q.id}/submit`, {
        role: "learner",
        method: "POST",
        body: { attemptId, answers: { q1: "Yes" } },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await api(`/courses/${c.id}/quizzes/${q.id}/start`, {
        role: "learner",
        method: "POST",
        body: {},
      })
    ).status,
    409,
  );
  const gb = await api(`/courses/${c.id}/gradebook`);
  assert.equal(gb.data.rows[0].quizzes, 100);
  assert.equal(gb.data.rows[0].total, 100);
});
test("expired quiz attempts cannot submit answers", async () => {
  const c = await createCourse();
  const q = await createQuiz(c);
  await enroll(c);
  const start = await api(`/courses/${c.id}/quizzes/${q.id}/start`, {
    role: "learner",
    method: "POST",
    body: {},
  });
  const attempt = store.get("attempts", start.data.attemptId);
  store.put("attempts", {
    ...attempt,
    deadline: new Date(Date.now() - 60000).toISOString(),
  });
  const expired = await api(`/courses/${c.id}/quizzes/${q.id}/submit`, {
    role: "learner",
    method: "POST",
    body: { attemptId: attempt.id, answers: { q1: "Yes" } },
  });
  assert.equal(expired.status, 409);
});
test("essay submissions remain ungraded until instructor review", async () => {
  const c = await createCourse();
  const q = await createQuiz(c, "essay");
  await enroll(c);
  const started = await api(`/courses/${c.id}/quizzes/${q.id}/start`, {
    role: "learner",
    method: "POST",
    body: {},
  });
  const result = await api(`/courses/${c.id}/quizzes/${q.id}/submit`, {
    role: "learner",
    method: "POST",
    body: {
      attemptId: started.data.attemptId,
      answers: { q1: "My thoughtful response." },
    },
  });
  assert.equal(result.data.pendingReview, true);
  assert.equal(
    (await api(`/courses/${c.id}/gradebook`)).data.rows[0].quizzes,
    null,
  );
  const review = await api(
    `/courses/${c.id}/submissions/${started.data.attemptId}`,
    { method: "PATCH", body: { score: 8 } },
  );
  assert.equal(review.status, 200);
  const gb = await api(`/courses/${c.id}/gradebook`);
  assert.equal(gb.data.rows[0].quizzes, 80);
  assert.equal(gb.data.submissions[0].pendingReview, false);
});
test("retired activities are rejected and native module content persists", async () => {
  const c = await createCourse();
  const m = await api(`/courses/${c.id}/modules`, {
    method: "POST",
    body: { title: "Interactive module" },
  });
  assert.equal(m.status, 201);
  const path = `/courses/${c.id}/modules/${m.data.module.id}/items`;
  assert.equal(
    (
      await api(path, {
        method: "POST",
        body: { title: "Retired embed", type: "h5p" },
      })
    ).status,
    400,
  );
  const added = await api(path, {
    method: "POST",
    body: {
      title: "Exploration",
      type: "lesson",
      content: "Explore this topic.",
    },
  });
  assert.equal(added.status, 201);
  const reopened = createStore(database);
  assert.equal(
    reopened.get("items", added.data.item.id).content,
    "Explore this topic.",
  );
  reopened.close();
  assert.equal(
    (await api(path + "/" + added.data.item.id, { method: "DELETE" })).status,
    200,
  );
});
test("weighted grades calculate and ungraded categories are normalized", () => {
  const user = { id: "x", name: "Test User", email: "x@example.test" };
  const course = {
    weights: { quizzes: 50, assignments: 30, participation: 20 },
  };
  assert.equal(
    gradeRow(
      { grades: { quizzes: 80, assignments: 60, participation: 100 } },
      user,
      course,
    ).total,
    78,
  );
  assert.equal(
    gradeRow(
      { grades: { quizzes: 80, assignments: null, participation: null } },
      user,
      course,
    ).total,
    80,
  );
  assert.equal(gradeRow({ grades: {} }, user, course).total, null);
});
test("lesson analytics deduplicate daily views and preserve first completion timestamps", async () => {
  const c = await createCourse();
  const module = (
    await api(`/courses/${c.id}/modules`, {
      method: "POST",
      body: { title: "Learning" },
    })
  ).data.module;
  const item = (
    await api(`/courses/${c.id}/modules/${module.id}/items`, {
      method: "POST",
      body: { title: "Read and reflect", type: "lesson", content: "A lesson." },
    })
  ).data.item;
  const viewPath = `/courses/${c.id}/items/${item.id}/view`;
  assert.equal(
    (await api(viewPath, { role: "learner", method: "POST", body: {} })).status,
    403,
  );
  await api(`/courses/${c.id}/enroll`, {
    role: "learner",
    method: "POST",
    body: {},
  });
  assert.equal((await api(viewPath, { method: "POST", body: {} })).status, 403);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await api(viewPath, { role: "learner", method: "POST", body: {} }))
        .status,
      200,
    );
  assert.equal(
    store
      .all("activities")
      .filter((a) => a.itemId === item.id && a.type === "lesson_view").length,
    1,
  );
  const metrics = await api(`/metrics?courseId=${c.id}&days=7`, {
    role: "learner",
  });
  assert.equal(
    metrics.data.metrics.find((m) => m.measure === "engagement_rate").value,
    100,
  );
  assert.equal(metrics.data.activity.at(-1).activeLearners, 1);
  const completePath = `/courses/${c.id}/items/${item.id}/complete`;
  await api(completePath, { role: "learner", method: "POST", body: {} });
  const completion = store.get("completions", `${item.id}:learner`);
  const originalDate = new Date(Date.now() - 86400000).toISOString();
  store.put("completions", { ...completion, createdAt: originalDate });
  await api(completePath, { role: "learner", method: "POST", body: {} });
  assert.equal(store.get("completions", completion.id).createdAt, originalDate);
  assert.equal(
    store
      .all("activities")
      .filter((a) => a.courseId === c.id && a.type === "completed").length,
    1,
  );
  const refreshed = await api(`/metrics?courseId=${c.id}&days=7`, {
    role: "learner",
  });
  assert.equal(refreshed.data.activity.at(-2).completions, 1);
  assert.equal(refreshed.data.activity.at(-1).completions, 0);
});
test("assignment responses require instructor grading and update the assignments category", async () => {
  const c = await createCourse();
  const m = await api(`/courses/${c.id}/modules`, {
    method: "POST",
    body: { title: "Projects" },
  });
  const item = await api(`/courses/${c.id}/modules/${m.data.module.id}/items`, {
    method: "POST",
    body: {
      title: "Final project",
      type: "assignment",
      content: "Explain what you learned.",
    },
  });
  await enroll(c);
  const result = await api(
    `/courses/${c.id}/items/${item.data.item.id}/submit`,
    {
      role: "learner",
      method: "POST",
      body: { content: "I learned how to apply this concept." },
    },
  );
  assert.equal(result.status, 201);
  assert.equal(
    (
      await api(`/courses/${c.id}/items/${item.data.item.id}/complete`, {
        role: "learner",
        method: "POST",
        body: {},
      })
    ).status,
    400,
  );
  const submissionId = result.data.submission.id;
  const review = await api(`/courses/${c.id}/submissions/${submissionId}`, {
    method: "PATCH",
    body: { score: 91 },
  });
  assert.equal(review.status, 200);
  const gb = await api(`/courses/${c.id}/gradebook`);
  assert.equal(gb.data.rows[0].assignments, 91);
  assert.equal(gb.data.rows[0].quizzes, null);
  assert.equal(gb.data.rows[0].completed, true);
  const detail = await api(`/courses/${c.id}`, { role: "learner" });
  assert.equal(detail.data.modules[0].items[0].submission.score, 91);
  assert.equal(detail.data.modules[0].items[0].completed, true);
});

test("instructor enrollment supports invitation-only courses and enforces prerequisites", async () => {
  const prerequisite = await createCourse({ title: "Enrollment prerequisite" });
  const course = await createCourse({
    enrollment: "invite",
    prerequisites: [prerequisite.id],
  });
  const path = `/courses/${course.id}/enrollments`;
  assert.equal(
    (
      await api(path, {
        method: "POST",
        role: "learner",
        body: { userId: "learner" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await api(path, { method: "POST", body: { userId: "learner" } })).status,
    403,
  );
  await enroll(prerequisite);
  await api(`/courses/${prerequisite.id}/grades/learner`, {
    method: "PATCH",
    body: { completed: true },
  });
  assert.equal(
    (await api(path, { method: "POST", body: { userId: "learner" } })).status,
    201,
  );
  const duplicate = await api(path, {
    method: "POST",
    body: { userId: "learner" },
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.alreadyEnrolled, true);
  const detail = await api(`/courses/${course.id}`, { role: "learner" });
  assert.equal(detail.data.eligibility.allowed, true);
  assert.equal(detail.data.enrollment.userId, "learner");
});

test("instructors can revise modules and activities without changing identity or learner permissions", async () => {
  const course = await createCourse();
  const {
    data: { module },
  } = await api(`/courses/${course.id}/modules`, {
    method: "POST",
    body: { title: "Original module" },
  });
  const path = `/courses/${course.id}/modules/${module.id}`;
  assert.equal(
    (await api(path, { method: "PATCH", body: { title: "Revised module" } }))
      .status,
    200,
  );
  const {
    data: { item },
  } = await api(path + "/items", {
    method: "POST",
    body: { title: "Original lesson", type: "lesson", content: "Original" },
  });
  const edited = await api(path + "/items/" + item.id, {
    method: "PATCH",
    body: { title: "Updated lesson", content: "Revised content" },
  });
  assert.equal(edited.data.item.id, item.id);
  assert.equal(edited.data.item.content, "Revised content");
  assert.equal(
    (
      await api(path + "/items/" + item.id, {
        role: "learner",
        method: "PATCH",
        body: { title: "Unauthorized", content: "No" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(path + "/items/" + item.id, {
        method: "PATCH",
        body: { title: "Wrong type", type: "h5p", url: "https://example.com" },
      })
    ).status,
    400,
  );
});
