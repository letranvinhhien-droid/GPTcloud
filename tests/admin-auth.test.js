import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createApp } from "../server/index.js";
import { createLocalAccount, verifyPassword } from "../server/auth.js";

const password = "A distinct administrator test phrase";
async function fixture(t, options = {}) {
  const { app, store } = createApp({
    database: ":memory:",
    seed: false,
    demo: false,
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise((resolve) => server.close(resolve));
    store.close();
  };
  t.after(close);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return {
    store,
    close,
    async request(path, { method = "GET", body, cookie } = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    },
  };
}

test("operator CLI provisions a real administrator who signs in with demo mode disabled", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "meridian-admin-cli-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const database = join(temp, "admin.sqlite");
  const created = spawnSync(
    process.execPath,
    [
      "server/manage-users.js",
      "create-admin",
      "--name",
      "Workspace Administrator",
      "--email",
      "ADMIN@EXAMPLE.TEST",
      "--password-stdin",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, LMS_DB: database },
      input: password + "\n",
      encoding: "utf8",
    },
  );
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /Administrator account created/);
  assert.equal((created.stdout + created.stderr).includes(password), false);
  const { request, store } = await fixture(t, { database });
  const saved = store
    .all("users")
    .find((user) => user.email === "admin@example.test");
  assert.equal(saved.role, "admin");
  assert.equal(await verifyPassword(password, saved.passwordHash), true);
  const login = await request("/auth/login", {
    method: "POST",
    body: { email: "ADMIN@EXAMPLE.TEST", password },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, "admin");
  assert.equal(login.data.user.passwordHash, undefined);
  const bootstrap = await request("/bootstrap", { cookie: login.cookie });
  assert.equal(bootstrap.data.user.role, "admin");
  assert.equal(
    JSON.stringify(bootstrap.data).includes(saved.passwordHash),
    false,
  );
  const course = await request("/courses", {
    method: "POST",
    cookie: login.cookie,
    body: { title: "Administrator course", code: "ADMIN101" },
  });
  assert.equal(course.status, 201, JSON.stringify(course.data));
  const duplicate = spawnSync(
    process.execPath,
    [
      "server/manage-users.js",
      "create-admin",
      "--name",
      "Duplicate",
      "--email",
      "admin@example.test",
      "--password-stdin",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, LMS_DB: database },
      input: password + "\n",
      encoding: "utf8",
    },
  );
  assert.notEqual(duplicate.status, 0);
  assert.equal(store.all("users").length, 1);
});

test("public registration and profile updates cannot escalate a learner to administrator", async (t) => {
  const { request, store } = await fixture(t);
  const denied = await request("/auth/register", {
    method: "POST",
    body: {
      name: "New Admin",
      email: "new@example.test",
      password,
      role: "admin",
    },
  });
  assert.equal(denied.status, 400);
  assert.equal(store.all("users").length, 0);
  const learner = await request("/auth/register", {
    method: "POST",
    body: { name: "New Learner", email: "learner@example.test", password },
  });
  assert.equal(learner.status, 201);
  assert.equal(learner.data.user.role, "learner");
  const update = await request("/profile", {
    method: "PATCH",
    cookie: learner.cookie,
    body: { name: "Updated Learner", role: "admin" },
  });
  assert.equal(update.status, 200);
  assert.equal(update.data.user.role, "learner");
  assert.equal(store.get("users", learner.data.user.id).role, "learner");
  const demo = await request("/auth/demo", {
    method: "POST",
    cookie: learner.cookie,
    body: { role: "admin" },
  });
  assert.equal(demo.status, 403);
});

test("administrator demo requires an enabled demo workspace and a matching demo account", async (t) => {
  const { request, store } = await fixture(t, { demo: true });
  store.remove("users", "admin");
  assert.equal(
    (await request("/auth/demo", { method: "POST", body: { role: "admin" } }))
      .status,
    503,
  );
  store.put("users", {
    id: "admin",
    name: "Demo Administrator",
    email: "demo-admin@example.test",
    role: "learner",
  });
  assert.equal(
    (await request("/auth/demo", { method: "POST", body: { role: "admin" } }))
      .status,
    503,
  );
  store.put("users", {
    id: "admin",
    name: "Demo Administrator",
    email: "demo-admin@example.test",
    role: "admin",
  });
  const login = await request("/auth/demo", {
    method: "POST",
    body: { role: "admin" },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, "admin");
  assert.equal(login.data.user.id, "admin");
  const change = await request("/auth/password", {
    method: "PATCH",
    cookie: login.cookie,
    body: {
      currentPassword: password,
      newPassword: "A replacement administrator phrase",
    },
  });
  assert.equal(change.status, 400);
  assert.equal(store.get("users", "admin").passwordHash, undefined);
});

test("disabling demo rejects persisted admin demo sessions while keeping real admin sessions", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "meridian-admin-sessions-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const database = join(temp, "sessions.sqlite");
  const enabled = await fixture(t, { database, demo: true });
  enabled.store.put("users", {
    id: "admin",
    name: "Demo Administrator",
    email: "demo-admin@example.test",
    role: "admin",
  });
  await createLocalAccount(enabled.store, {
    name: "Real Administrator",
    email: "real-admin@example.test",
    password,
    role: "admin",
  });
  const demo = await enabled.request("/auth/demo", {
    method: "POST",
    body: { role: "admin" },
  });
  const real = await enabled.request("/auth/login", {
    method: "POST",
    body: { email: "real-admin@example.test", password },
  });
  assert.equal(demo.status, 200);
  assert.equal(real.status, 200);
  await enabled.close();
  const disabled = await fixture(t, { database, demo: false });
  assert.equal(
    (await disabled.request("/bootstrap", { cookie: demo.cookie })).data.user,
    null,
  );
  assert.equal(
    (
      await disabled.request("/courses", {
        method: "POST",
        cookie: demo.cookie,
        body: { title: "Forbidden", code: "NO" },
      })
    ).status,
    401,
  );
  const bootstrap = await disabled.request("/bootstrap", {
    cookie: real.cookie,
  });
  assert.equal(bootstrap.data.user.role, "admin");
  assert.equal(bootstrap.data.user.email, "real-admin@example.test");
});
