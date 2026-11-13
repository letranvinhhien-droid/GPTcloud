import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/index.js";

async function fixture(t, type) {
  const { app, store } = createApp({ database: ":memory:", demo: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
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
  async function api(path, { role = "instructor", method = "GET", body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookies[role] },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  const courseResponse = await api("/courses", {
    method: "POST",
    body: {
      title: "Completion lifecycle",
      code: "COMP101",
      status: "published",
    },
  });
  assert.equal(courseResponse.status, 201);
  const course = courseResponse.data.course;
  const path = `/courses/${course.id}`;
  const moduleResponse = await api(path + "/modules", {
    method: "POST",
    body: { title: "Native activities" },
  });
  assert.equal(moduleResponse.status, 201);
  const itemPath = `${path}/modules/${moduleResponse.data.module.id}/items`;
  assert.equal(
    (await api(path + "/enroll", { role: "learner", method: "POST", body: {} }))
      .status,
    201,
  );

  const assessmentPath = path + (type === "game" ? "/games" : "/quizzes");
  async function createAssessment(title) {
    const body = {
      title,
      published: true,
      attempts: 1,
      timeLimit: 0,
      passingScore: 70,
      ...(type === "game"
        ? {
            type: "sequence",
            sequence: [
              { id: "first", text: "First step" },
              { id: "second", text: "Second step" },
            ],
          }
        : {
            questions: [
              {
                id: "check",
                type: "true-false",
                prompt: "This is true.",
                answer: "True",
                points: 1,
              },
            ],
          }),
    };
    const result = await api(assessmentPath, { method: "POST", body });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data[type];
  }
  async function pass(assessment) {
    const start = await api(`${assessmentPath}/${assessment.id}/start`, {
      role: "learner",
      method: "POST",
      body: {},
    });
    assert.equal(start.status, 201, JSON.stringify(start.data));
    const answers =
      type === "game"
        ? ["First step", "Second step"].map(
            (text) =>
              start.data.game.items.find((item) => item.text === text).id,
          )
        : { check: "True" };
    const result = await api(`${assessmentPath}/${assessment.id}/submit`, {
      role: "learner",
      method: "POST",
      body: { attemptId: start.data.attemptId, answers },
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.equal(result.data.percentage, 100);
    return structuredClone(store.get("attempts", start.data.attemptId));
  }
  const link = (assessment) => ({
    title: "Required assessment",
    type,
    [type === "game" ? "gameId" : "quizId"]: assessment.id,
  });
  const enrollment = () => store.get("enrollments", `${course.id}:learner`);
  const learnerItem = async (id) => {
    const response = await api(path, { role: "learner" });
    assert.equal(response.status, 200);
    return response.data.modules
      .flatMap((module) => module.items)
      .find((item) => item.id === id);
  };
  return {
    api,
    store,
    path,
    itemPath,
    assessmentPath,
    createAssessment,
    pass,
    link,
    enrollment,
    learnerItem,
  };
}

for (const type of ["game", "quiz"]) {
  test(`${type} links reconcile passing history without requiring another attempt`, async (t) => {
    const f = await fixture(t, type);
    const first = await f.createAssessment("Assessment A");
    const second = await f.createAssessment("Assessment B");
    const firstAttempt = await f.pass(first);
    assert.equal(
      (
        await f.api(`${f.assessmentPath}/${first.id}/start`, {
          role: "learner",
          method: "POST",
          body: {},
        })
      ).status,
      409,
    );

    const added = await f.api(f.itemPath, {
      method: "POST",
      body: f.link(first),
    });
    assert.equal(added.status, 201);
    const itemId = added.data.item.id;
    assert.equal(
      (await f.learnerItem(itemId)).completed,
      true,
      "A previously passed assessment must complete a new required link",
    );
    assert.equal(f.enrollment().completed, true);
    assert.equal(f.enrollment().completionSource, "automatic");
    assert.deepEqual(f.store.get("attempts", firstAttempt.id), firstAttempt);

    const changed = await f.api(`${f.itemPath}/${itemId}`, {
      method: "PATCH",
      body: f.link(second),
    });
    assert.equal(changed.status, 200);
    assert.equal(
      (await f.learnerItem(itemId)).completed,
      false,
      "An old assessment's completion must not transfer to a new assessment",
    );
    assert.equal(f.enrollment().completed, false);
    assert.deepEqual(f.store.get("attempts", firstAttempt.id), firstAttempt);
    const metrics = await f.api(`/metrics?courseId=${first.courseId}&days=7`, {
      role: "learner",
    });
    assert.equal(metrics.status, 200);
    assert.equal(
      metrics.data.metrics.find(
        (metric) => metric.measure === "average_progress",
      ).value,
      0,
    );

    assert.equal(
      (
        await f.api(`${f.itemPath}/${itemId}`, {
          method: "PATCH",
          body: f.link(first),
        })
      ).status,
      200,
    );
    assert.equal(
      (await f.learnerItem(itemId)).completed,
      true,
      "Relinking to a passed assessment must restore credit",
    );
    const secondAttempt = await f.pass(second);
    assert.equal(
      (
        await f.api(`${f.itemPath}/${itemId}`, {
          method: "PATCH",
          body: f.link(second),
        })
      ).status,
      200,
    );
    assert.equal((await f.learnerItem(itemId)).completed, true);
    assert.equal(f.enrollment().completed, true);
    assert.deepEqual(f.store.get("attempts", firstAttempt.id), firstAttempt);
    assert.deepEqual(f.store.get("attempts", secondAttempt.id), secondAttempt);
    const gradebook = await f.api(f.path + "/gradebook", { role: "learner" });
    assert.equal(gradebook.data.rows[0].quizzes, 100);
    assert.equal(gradebook.data.submissions.length, 2);
  });
}

test("content changes recalculate automatic completion but preserve an explicit instructor override", async (t) => {
  const f = await fixture(t, "game");
  const first = await f.createAssessment("Assessment A");
  const second = await f.createAssessment("Assessment B");
  await f.pass(first);
  const linked = await f.api(f.itemPath, {
    method: "POST",
    body: f.link(first),
  });
  assert.equal(f.enrollment().completed, true);
  const lesson = await f.api(f.itemPath, {
    method: "POST",
    body: {
      title: "A new required lesson",
      type: "lesson",
      content: "Read this lesson.",
    },
  });
  assert.equal(lesson.status, 201);
  assert.equal(
    f.enrollment().completed,
    false,
    "Adding incomplete content must update automatic completion",
  );
  assert.equal(
    (await f.api(`${f.itemPath}/${lesson.data.item.id}`, { method: "DELETE" }))
      .status,
    200,
  );
  assert.equal(
    f.enrollment().completed,
    true,
    "Removing the only incomplete activity must recalculate completion",
  );

  assert.equal(
    (
      await f.api(f.path + "/grades/learner", {
        method: "PATCH",
        body: { completed: true },
      })
    ).status,
    200,
  );
  assert.equal(f.enrollment().completionSource, "manual");
  assert.equal(
    (
      await f.api(`${f.itemPath}/${linked.data.item.id}`, {
        method: "PATCH",
        body: f.link(second),
      })
    ).status,
    200,
  );
  assert.equal((await f.learnerItem(linked.data.item.id)).completed, false);
  assert.equal(
    f.enrollment().completed,
    true,
    "An explicit instructor course override must survive link changes",
  );
  assert.equal(f.enrollment().completionSource, "manual");
});
