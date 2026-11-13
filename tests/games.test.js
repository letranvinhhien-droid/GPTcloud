import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { seedNativeGames } from "../server/games.js";

const pairs = [
  { id: "one", prompt: "One", answer: "First" },
  { id: "two", prompt: "Two", answer: "Second" },
  { id: "three", prompt: "Three", answer: "Third" },
];
const steps = [
  { id: "plan", text: "Plan" },
  { id: "build", text: "Build" },
  { id: "test", text: "Test" },
];
async function fixture(t, { persistent = false, ...overrides } = {}) {
  const temporary = persistent
    ? mkdtempSync(join(tmpdir(), "meridian-games-"))
    : null;
  const database = temporary ? join(temporary, "games.sqlite") : ":memory:";
  const { app, store } = createApp({ database, demo: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  });
  const cookies = {};
  for (const role of ["instructor", "learner"]) {
    const response = await fetch(base + "/auth/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    assert.equal(response.status, 200);
    cookies[role] = response.headers.get("set-cookie").split(";")[0];
  }
  async function api(
    path,
    { role = "instructor", method = "GET", body, cookie } = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie || role ? { Cookie: cookie || cookies[role] } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  const created = await api("/courses", {
    method: "POST",
    body: {
      title: "Native games test",
      code: "G" + randomUUID().slice(0, 20),
      status: "published",
      weights: { quizzes: 40, assignments: 40, participation: 20 },
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const course = created.data.course;
  const response = await api(`/courses/${course.id}/games`, {
    method: "POST",
    body: {
      title: "Match the numbers",
      type: "matching",
      pairs,
      published: true,
      timeLimit: 5,
      attempts: 3,
      passingScore: 70,
      ...overrides,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const game = response.data.game;
  const enrollment = await api(`/courses/${course.id}/enroll`, {
    role: "learner",
    method: "POST",
    body: {},
  });
  assert.equal(enrollment.status, 201);
  const path = `/courses/${course.id}/games/${game.id}`;
  const start = async () =>
    api(path + "/start", { role: "learner", method: "POST", body: {} });
  const submit = async (started, answers, extra = {}) =>
    api(path + "/submit", {
      role: "learner",
      method: "POST",
      body: { attemptId: started.attemptId, answers, ...extra },
    });
  return { api, store, database, course, game, path, start, submit };
}
function matchingAnswers(started, definitions = pairs) {
  return Object.fromEntries(
    started.game.prompts.map((prompt) => [
      prompt.id,
      started.game.choices.find(
        (choice) =>
          choice.text ===
          definitions.find((pair) => pair.prompt === prompt.text).answer,
      ).id,
    ]),
  );
}
function sequenceAnswers(started, definitions = steps) {
  return definitions.map(
    (step) => started.game.items.find((item) => item.text === step.text).id,
  );
}

test("seeded game module activities link to valid games and preserve edits", (t) => {
  const { store } = createApp({ database: ":memory:", demo: true });
  t.after(() => store.close());
  const games = store.all("games");
  assert.equal(games.length, 2);
  for (const game of games) {
    const item = store.get("items", `${game.id}-activity`);
    assert.equal(item.gameId, game.id);
    assert.equal(item.courseId, game.courseId);
    assert.equal(item.type, "game");
    assert.ok(store.get("modules", item.moduleId));
  }
  const game = { ...games[0], title: "An instructor's revised game" };
  store.put("games", game);
  const count = store.all("items").length;
  seedNativeGames(store);
  assert.equal(store.get("games", game.id).title, game.title);
  assert.equal(store.all("items").length, count);
  assert.equal(
    store.all("attempts").filter((a) => a.type === "game").length,
    0,
  );
});

test("matching metadata and per-attempt choices do not expose answer mappings", async (t) => {
  const f = await fixture(t);
  const listed = await f.api(`/courses/${f.course.id}/games`, {
    role: "learner",
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.games[0].itemCount, 3);
  assert.equal(listed.data.games[0].pairs, undefined);
  assert.equal(listed.data.games[0].sequence, undefined);
  const staff = await f.api(`/courses/${f.course.id}/games`);
  assert.deepEqual(staff.data.games[0].pairs, pairs);
  const started = await f.start();
  assert.equal(started.status, 201);
  const publicAttempt = started.data;
  assert.equal(publicAttempt.game.pairs, undefined);
  assert.equal(publicAttempt.gameSolution, undefined);
  assert.equal(publicAttempt.quizSnapshot, undefined);
  assert.equal(publicAttempt.game.prompts.length, 3);
  assert.equal(publicAttempt.game.choices.length, 3);
  assert.ok(
    publicAttempt.game.choices.every(
      (choice) => !pairs.some((pair) => pair.id === choice.id),
    ),
  );
  assert.ok(
    publicAttempt.game.prompts.every(
      (prompt) =>
        !publicAttempt.game.choices.some((choice) => choice.id === prompt.id),
    ),
  );
  const resumed = await f.start();
  assert.equal(resumed.status, 200);
  assert.deepEqual(resumed.data, publicAttempt);
});

test("matching scores are server-graded and persist in gradebook, activity completion and analytics", async (t) => {
  const f = await fixture(t, { persistent: true });
  const {
    data: { module },
  } = await f.api(`/courses/${f.course.id}/modules`, {
    method: "POST",
    body: { title: "Play and learn" },
  });
  const item = await f.api(
    `/courses/${f.course.id}/modules/${module.id}/items`,
    {
      method: "POST",
      body: { title: f.game.title, type: "game", gameId: f.game.id },
    },
  );
  assert.equal(item.status, 201, JSON.stringify(item.data));
  const started = (await f.start()).data;
  const result = await f.submit(started, matchingAnswers(started), {
    score: 999999,
    maxScore: 1,
    percentage: 999,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.score, 3);
  assert.equal(result.data.maxScore, 3);
  assert.equal(result.data.percentage, 100);
  assert.equal(result.data.passed, true);
  assert.ok(result.data.feedback.every((row) => row.correct));
  assert.ok(result.data.feedback.every((row) => !Object.hasOwn(row, "answer")));
  const gradebook = await f.api(`/courses/${f.course.id}/gradebook`);
  assert.equal(gradebook.data.rows[0].quizzes, 100);
  assert.equal(gradebook.data.rows[0].completed, true);
  assert.equal(gradebook.data.submissions[0].type, "game");
  assert.equal(gradebook.data.submissions[0].quizTitle, f.game.title);
  const learnerGradebook = await f.api(`/courses/${f.course.id}/gradebook`, {
    role: "learner",
  });
  assert.ok(
    learnerGradebook.data.submissions[0].questions.every(
      (q) => !Object.hasOwn(q, "answer"),
    ),
  );
  const analytics = await f.api("/analytics");
  assert.equal(
    analytics.data.analytics.coursePerformance.find(
      (course) => course.courseId === f.course.id,
    ).averageGrade,
    100,
  );
  const reopened = createStore(f.database);
  assert.equal(reopened.get("attempts", started.attemptId).percentage, 100);
  assert.equal(
    reopened.get("enrollments", `${f.course.id}:learner`).grades.quizzes,
    100,
  );
  reopened.close();
  const stored = f.store.get("attempts", started.attemptId);
  assert.ok(Number.isFinite(stored.durationSeconds));
  assert.ok(
    f.store
      .all("activities")
      .some((a) => a.type === "game_started" && a.courseId === f.course.id),
  );
  assert.ok(
    f.store
      .all("activities")
      .some((a) => a.type === "submission" && a.courseId === f.course.id),
  );
});

test("incorrect and omitted matching answers earn partial scores regardless of submitted score claims", async (t) => {
  const f = await fixture(t);
  const started = (await f.start()).data;
  const answers = matchingAnswers(started);
  delete answers[Object.keys(answers)[0]];
  const result = await f.submit(started, answers, {
    score: 3,
    percentage: 100,
    passed: true,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.score, 2);
  assert.equal(result.data.percentage, 66.7);
  assert.equal(result.data.passed, false);
  assert.equal(result.data.feedback.filter((row) => row.correct).length, 2);
  const override = await f.api(
    `/courses/${f.course.id}/submissions/${started.attemptId}`,
    { method: "PATCH", body: { score: 3 } },
  );
  assert.equal(override.status, 400);
  assert.equal(f.store.get("attempts", started.attemptId).score, 2);
  assert.equal(
    (await f.api(`/courses/${f.course.id}/gradebook`)).data.rows[0].quizzes,
    66.7,
  );
});

test("duplicate or unknown choices and prompts are rejected without consuming the active submission", async (t) => {
  const f = await fixture(t);
  const started = (await f.start()).data;
  const valid = matchingAnswers(started);
  const keys = Object.keys(valid);
  assert.equal(
    (await f.submit(started, { ...valid, [keys[1]]: valid[keys[0]] })).status,
    400,
  );
  assert.equal(
    (await f.submit(started, { ...valid, [keys[0]]: "unknown-choice" })).status,
    400,
  );
  assert.equal(
    (await f.submit(started, { ...valid, unknown: "unknown-choice" })).status,
    400,
  );
  assert.equal((await f.submit(started, [])).status, 400);
  assert.equal(
    f.store.get("attempts", started.attemptId).submittedAt,
    undefined,
  );
  assert.equal((await f.submit(started, valid)).status, 200);
  assert.equal((await f.submit(started, valid)).status, 409);
});

test("sequencing uses opaque attempt IDs and automatically grades positions", async (t) => {
  const f = await fixture(t, { type: "sequence", sequence: steps });
  const started = (await f.start()).data;
  assert.equal(started.game.sequence, undefined);
  assert.equal(started.game.items.length, 3);
  assert.ok(
    started.game.items.every(
      (item) => !steps.some((step) => step.id === item.id),
    ),
  );
  const ordered = sequenceAnswers(started);
  assert.equal(
    (await f.submit(started, [ordered[0], ordered[0], ordered[2]])).status,
    400,
  );
  assert.equal(
    (await f.submit(started, [ordered[0], ordered[1], "unknown"])).status,
    400,
  );
  assert.equal((await f.submit(started, ordered.slice(0, 2))).status, 400);
  const result = await f.submit(started, [ordered[1], ordered[0], ordered[2]]);
  assert.equal(result.status, 200);
  assert.equal(result.data.score, 1);
  assert.equal(result.data.maxScore, 3);
  assert.equal(result.data.percentage, 33.3);
  assert.equal(result.data.feedback[2].response, "Test");
  const next = (await f.start()).data;
  assert.notDeepEqual(
    next.game.items.map((i) => i.id).sort(),
    started.game.items.map((i) => i.id).sort(),
  );
  const passed = await f.submit(next, sequenceAnswers(next));
  assert.equal(passed.data.percentage, 100);
});

test("game and native quiz grades share the weighted assessments category using each best result", async (t) => {
  const f = await fixture(t);
  const quiz = await f.api(`/courses/${f.course.id}/quizzes`, {
    method: "POST",
    body: {
      title: "Quiz result",
      published: true,
      timeLimit: 0,
      attempts: 1,
      questions: [
        {
          id: "q",
          type: "true-false",
          prompt: "True?",
          answer: "True",
          points: 1,
        },
      ],
    },
  });
  assert.equal(quiz.status, 201);
  const quizPath = `/courses/${f.course.id}/quizzes/${quiz.data.quiz.id}`;
  const quizStart = await f.api(quizPath + "/start", {
    role: "learner",
    method: "POST",
    body: {},
  });
  const quizResult = await f.api(quizPath + "/submit", {
    role: "learner",
    method: "POST",
    body: { attemptId: quizStart.data.attemptId, answers: { q: "False" } },
  });
  assert.equal(quizResult.data.percentage, 0);
  const started = (await f.start()).data;
  await f.submit(started, matchingAnswers(started));
  const grades = await f.api(`/courses/${f.course.id}/gradebook`);
  assert.equal(grades.data.rows[0].quizzes, 50);
  assert.equal(grades.data.rows[0].total, 50);
  const next = (await f.start()).data;
  await f.submit(next, {});
  assert.equal(
    (await f.api(`/courses/${f.course.id}/gradebook`)).data.rows[0].quizzes,
    50,
  );
});

test("attempt caps, timers and original snapshots remain enforced after editing a game", async (t) => {
  const f = await fixture(t, { attempts: 1 });
  const started = (await f.start()).data;
  const edited = await f.api(f.path, {
    method: "PATCH",
    body: {
      type: "sequence",
      sequence: steps,
      published: false,
      title: "Different game",
    },
  });
  assert.equal(edited.status, 200);
  assert.equal((await f.start()).status, 404);
  const result = await f.submit(started, matchingAnswers(started));
  assert.equal(result.data.percentage, 100);
  assert.equal(
    f.store.get("attempts", started.attemptId).quizSnapshot.title,
    "Match the numbers",
  );
  await f.api(f.path, { method: "PATCH", body: { published: true } });
  assert.equal((await f.start()).status, 409);
  const timed = await fixture(t, { attempts: 1 });
  const timeStart = (await timed.start()).data;
  const stored = timed.store.get("attempts", timeStart.attemptId);
  timed.store.put("attempts", {
    ...stored,
    deadline: new Date(Date.now() - 60000).toISOString(),
  });
  assert.equal(
    (await timed.submit(timeStart, matchingAnswers(timeStart))).status,
    409,
  );
  assert.equal((await timed.start()).status, 409);
});

test("game access and submissions cannot bypass enrollment, course dates, ownership or native quiz routes", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.api(`/courses/${f.course.id}/games`, {
        role: "learner",
        method: "POST",
        body: { title: "Unauthorized", type: "matching", pairs },
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.api(f.path + "/start", { method: "POST", body: {} })).status,
    403,
  );
  const started = (await f.start()).data;
  const nativeBypass = await f.api(
    `/courses/${f.course.id}/quizzes/${f.game.id}/submit`,
    {
      role: "learner",
      method: "POST",
      body: { attemptId: started.attemptId, answers: {} },
    },
  );
  assert.equal(nativeBypass.status, 404);
  assert.equal(
    f.store.get("attempts", started.attemptId).submittedAt,
    undefined,
  );
  const other = await f.api("/auth/register", {
    method: "POST",
    role: null,
    body: {
      name: "Other player",
      email: "other-player@example.test",
      password: "A separate player testing phrase",
    },
  });
  assert.equal(other.status, 201);
  assert.equal(
    (
      await f.api(f.path + "/start", {
        method: "POST",
        cookie: other.cookie,
        body: {},
      })
    ).status,
    403,
  );
  await f.api(`/courses/${f.course.id}/enroll`, {
    method: "POST",
    cookie: other.cookie,
    body: {},
  });
  assert.equal(
    (
      await f.api(f.path + "/submit", {
        method: "POST",
        cookie: other.cookie,
        body: {
          attemptId: started.attemptId,
          answers: matchingAnswers(started),
        },
      })
    ).status,
    404,
  );
  await f.api(`/courses/${f.course.id}`, {
    method: "PATCH",
    body: { endDate: "2000-01-01", startDate: "" },
  });
  assert.equal((await f.submit(started, matchingAnswers(started))).status, 403);
});

test("game author validation rejects ambiguous content and invalid attempt settings", async (t) => {
  const f = await fixture(t);
  const path = `/courses/${f.course.id}/games`;
  const base = { title: "Validation", type: "matching", pairs };
  for (const override of [
    { pairs: [pairs[0]] },
    { pairs: [pairs[0], { ...pairs[1], answer: "FIRST" }] },
    { pairs: [pairs[0], { ...pairs[1], id: "one" }] },
    {
      pairs: Array.from({ length: 13 }, (_, i) => ({
        id: "pair" + i,
        prompt: "Prompt" + i,
        answer: "Answer" + i,
      })),
    },
    { attempts: 1.5 },
    { attempts: 21 },
    { timeLimit: -1 },
    { published: "yes" },
    { type: "sequence", sequence: [steps[0]] },
  ]) {
    const response = await f.api(path, {
      method: "POST",
      body: { ...base, ...override },
    });
    assert.equal(response.status, 400, JSON.stringify(override));
  }
});
