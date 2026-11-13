import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { createLocalAccount, verifyPassword } from "../server/auth.js";

const initialPassword = "A memorable testing phrase";
const updatedPassword = "Another memorable testing phrase";
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
    async request(path, { method = "GET", body, cookie, headers = {} } = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        headers: response.headers,
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    },
  };
}
const registration = (email = "learner@example.test") => ({
  name: "New Learner",
  email,
  password: initialPassword,
});

test("real learner registration persists a salted password and excludes credentials from responses", async (t) => {
  const { store, request } = await fixture(t);
  assert.deepEqual((await request("/auth/config")).data, {
    demoEnabled: false,
    registrationEnabled: true,
  });
  const result = await request("/auth/register", {
    method: "POST",
    body: registration("  LEARNER@EXAMPLE.TEST  "),
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.email, "learner@example.test");
  assert.equal(result.data.user.role, "learner");
  assert.equal(result.data.user.passwordHash, undefined);
  assert.ok(result.headers.get("set-cookie").includes("HttpOnly"));
  assert.ok(result.headers.get("set-cookie").includes("SameSite=Lax"));
  const saved = store.get("users", result.data.user.id);
  assert.match(saved.passwordHash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword(initialPassword, saved.passwordHash), true);
  const bootstrap = await request("/bootstrap", { cookie: result.cookie });
  assert.equal(bootstrap.data.user.id, saved.id);
  assert.equal(
    JSON.stringify(bootstrap.data).includes(saved.passwordHash),
    false,
  );
  assert.equal(
    (
      await request("/courses", {
        method: "POST",
        cookie: result.cookie,
        body: { title: "Unauthorized", code: "NO" },
      })
    ).status,
    403,
  );
});

test("registration rejects duplicates, invalid data and attempted instructor escalation", async (t) => {
  const { request, store } = await fixture(t);
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: { ...registration(), role: "instructor" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: { ...registration(), password: "too short" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: registration("invalid-email"),
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/auth/register", { method: "POST", body: registration() }))
      .status,
    201,
  );
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: registration(" LEARNER@example.test "),
      })
    ).status,
    409,
  );
  assert.equal(store.all("users").length, 1);
});

test("concurrent normalized registration creates only one account", async (t) => {
  const { request, store } = await fixture(t);
  const responses = await Promise.all([
    request("/auth/register", { method: "POST", body: registration() }),
    request("/auth/register", {
      method: "POST",
      body: registration("LEARNER@example.test"),
    }),
  ]);
  assert.deepEqual(responses.map((result) => result.status).sort(), [201, 409]);
  assert.equal(store.all("users").length, 1);
});

test("login fails consistently, rotates the current session and logout revokes access", async (t) => {
  const { request } = await fixture(t);
  const registered = await request("/auth/register", {
    method: "POST",
    body: registration(),
  });
  const incorrect = await request("/auth/login", {
    method: "POST",
    body: { email: "learner@example.test", password: "incorrect phrase" },
  });
  const missing = await request("/auth/login", {
    method: "POST",
    body: { email: "absent@example.test", password: initialPassword },
  });
  assert.equal(incorrect.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(incorrect.data, missing.data);
  const login = await request("/auth/login", {
    method: "POST",
    cookie: registered.cookie,
    body: { email: "LEARNER@EXAMPLE.TEST", password: initialPassword },
  });
  assert.equal(login.status, 200);
  assert.notEqual(login.cookie, registered.cookie);
  assert.equal(
    (await request("/bootstrap", { cookie: registered.cookie })).data.user,
    null,
  );
  assert.equal(
    (await request("/bootstrap", { cookie: login.cookie })).data.user.email,
    "learner@example.test",
  );
  assert.equal(
    (
      await request("/auth/logout", {
        method: "POST",
        cookie: login.cookie,
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/bootstrap", { cookie: login.cookie })).data.user,
    null,
  );
});

test("password changes require the current password and revoke all prior sessions", async (t) => {
  const { request } = await fixture(t);
  const first = await request("/auth/register", {
    method: "POST",
    body: registration(),
  });
  const second = await request("/auth/login", {
    method: "POST",
    body: { email: "learner@example.test", password: initialPassword },
  });
  assert.equal(
    (
      await request("/auth/password", {
        method: "PATCH",
        cookie: first.cookie,
        body: { currentPassword: "wrong", newPassword: updatedPassword },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/password", {
        method: "PATCH",
        cookie: first.cookie,
        body: { currentPassword: initialPassword, newPassword: "short" },
      })
    ).status,
    400,
  );
  const changed = await request("/auth/password", {
    method: "PATCH",
    cookie: first.cookie,
    body: { currentPassword: initialPassword, newPassword: updatedPassword },
  });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.cookie, first.cookie);
  assert.equal(
    (await request("/bootstrap", { cookie: first.cookie })).data.user,
    null,
  );
  assert.equal(
    (await request("/bootstrap", { cookie: second.cookie })).data.user,
    null,
  );
  assert.equal(
    (await request("/bootstrap", { cookie: changed.cookie })).data.user.id,
    first.data.user.id,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: "learner@example.test", password: initialPassword },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: "learner@example.test", password: updatedPassword },
      })
    ).status,
    200,
  );
});

test("demo-disabled deployments still allow real instructor sign-in", async (t) => {
  const { request, store } = await fixture(t);
  await createLocalAccount(store, {
    name: "Instructor One",
    email: "teacher@example.test",
    password: initialPassword,
    role: "instructor",
  });
  assert.equal(
    (
      await request("/auth/demo", {
        method: "POST",
        body: { role: "instructor" },
      })
    ).status,
    403,
  );
  const login = await request("/auth/login", {
    method: "POST",
    body: { email: "teacher@example.test", password: initialPassword },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, "instructor");
  assert.equal(
    (
      await request("/courses", {
        method: "POST",
        cookie: login.cookie,
        body: { title: "Real course", code: "REAL1" },
      })
    ).status,
    201,
  );
});

test("demo accounts cannot be claimed using their email or password endpoints", async (t) => {
  const { request } = await fixture(t, { seed: true, demo: true });
  const demo = await request("/auth/demo", {
    method: "POST",
    body: { role: "instructor" },
  });
  assert.equal(demo.status, 200);
  assert.equal(
    (
      await request("/auth/register", {
        method: "POST",
        body: registration(demo.data.user.email),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/auth/password", {
        method: "PATCH",
        cookie: demo.cookie,
        body: {
          currentPassword: initialPassword,
          newPassword: updatedPassword,
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/login", {
        method: "POST",
        body: { email: demo.data.user.email, password: initialPassword },
      })
    ).status,
    401,
  );
});

test("login and registration limits cannot be bypassed with forwarded IP headers", async (t) => {
  const { request } = await fixture(t);
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await request("/auth/login", {
          method: "POST",
          body: { email: "absent@example.test", password: "wrong" },
          headers: { "X-Forwarded-For": `192.0.2.${i + 1}` },
        })
      ).status,
      401,
    );
  const limited = await request("/auth/login", {
    method: "POST",
    body: { email: "absent@example.test", password: "wrong" },
    headers: { "X-Forwarded-For": "198.51.100.1" },
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await request("/auth/register", {
          method: "POST",
          body: { ...registration(), role: "instructor" },
          headers: { "X-Forwarded-For": `192.0.2.${i + 1}` },
        })
      ).status,
      400,
    );
  assert.equal(
    (await request("/auth/register", { method: "POST", body: registration() }))
      .status,
    429,
  );
});

test("operator CLI creates instructors and resets passwords without printing credentials", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "meridian-account-cli-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const database = join(temp, "accounts.sqlite");
  const invoke = (args, password) =>
    spawnSync(
      process.execPath,
      ["server/manage-users.js", ...args, "--password-stdin"],
      {
        cwd: process.cwd(),
        env: { ...process.env, LMS_DB: database },
        input: password + "\n",
        encoding: "utf8",
      },
    );
  const created = invoke(
    [
      "create-instructor",
      "--name",
      "CLI Instructor",
      "--email",
      "cli@example.test",
    ],
    initialPassword,
  );
  assert.equal(created.status, 0, created.stderr);
  assert.equal(created.stdout.includes(initialPassword), false);
  assert.equal(created.stderr.includes(initialPassword), false);
  let store = createStore(database);
  let user = store.all("users")[0];
  assert.equal(user.role, "instructor");
  assert.equal(await verifyPassword(initialPassword, user.passwordHash), true);
  store.put("sessions", {
    id: "old-session",
    userId: user.id,
    expiresAt: Date.now() + 10000,
  });
  store.close();
  const duplicate = invoke(
    ["create-instructor", "--name", "Another", "--email", "CLI@example.test"],
    initialPassword,
  );
  assert.equal(duplicate.status, 1);
  const reset = invoke(
    ["reset-password", "--email", "cli@example.test"],
    updatedPassword,
  );
  assert.equal(reset.status, 0, reset.stderr);
  assert.equal(reset.stdout.includes(updatedPassword), false);
  store = createStore(database);
  user = store.all("users")[0];
  assert.equal(await verifyPassword(updatedPassword, user.passwordHash), true);
  assert.equal(store.all("sessions").length, 0);
  store.close();
});

test("concurrent password changes cannot overwrite credentials verified before another change", async (t) => {
  const { request } = await fixture(t);
  const account = await request("/auth/register", {
    method: "POST",
    body: registration(),
  });
  const passwords = [
    "First replacement testing phrase",
    "Second replacement testing phrase",
  ];
  const changes = await Promise.all(
    passwords.map((newPassword) =>
      request("/auth/password", {
        method: "PATCH",
        cookie: account.cookie,
        body: { currentPassword: initialPassword, newPassword },
      }),
    ),
  );
  assert.deepEqual(changes.map((x) => x.status).sort(), [200, 409]);
  const winner = changes.findIndex((x) => x.status === 200);
  const loggedIn = await request("/auth/login", {
    method: "POST",
    body: { email: registration().email, password: passwords[winner] },
  });
  assert.equal(loggedIn.status, 200);
  const rejected = await request("/auth/login", {
    method: "POST",
    body: { email: registration().email, password: passwords[1 - winner] },
  });
  assert.equal(rejected.status, 401);
});

test("account mutation endpoints reject non-object JSON without internal server errors", async (t) => {
  const { request } = await fixture(t);
  for (const path of ["/auth/register", "/auth/login", "/auth/demo"]) {
    const result = await request(path, { method: "POST", body: [] });
    assert.equal(result.status, 400);
  }
});

test("disabling demo access rejects persisted demo sessions while preserving real account sessions", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "meridian-demo-transition-"));
  const database = join(temp, "accounts.sqlite");
  let development, production;
  try {
    development = await fixture(t, { database, seed: true, demo: true });
    const demoCookies = [];
    for (const role of ["instructor", "learner"]) {
      const login = await development.request("/auth/demo", {
        method: "POST",
        body: { role },
      });
      assert.equal(login.status, 200);
      assert.equal(
        (await development.request("/bootstrap", { cookie: login.cookie })).data
          .user.role,
        role,
      );
      demoCookies.push(login.cookie);
    }
    await createLocalAccount(development.store, {
      name: "Real Instructor",
      email: "persisted@example.test",
      password: initialPassword,
      role: "instructor",
    });
    const realLogin = await development.request("/auth/login", {
      method: "POST",
      body: { email: "persisted@example.test", password: initialPassword },
    });
    assert.equal(realLogin.status, 200);
    await development.close();

    production = await fixture(t, { database, seed: false, demo: false });
    for (const cookie of demoCookies) {
      const bootstrap = await production.request("/bootstrap", { cookie });
      assert.equal(bootstrap.data.user, null);
      const denied = await production.request("/courses", {
        method: "POST",
        cookie,
        body: { title: "Unauthorized course", code: "DEMO-DENIED" },
      });
      assert.equal(denied.status, 401);
    }
    const realBootstrap = await production.request("/bootstrap", {
      cookie: realLogin.cookie,
    });
    assert.equal(realBootstrap.data.user.email, "persisted@example.test");
    assert.equal(realBootstrap.data.user.passwordHash, undefined);
    const allowed = await production.request("/courses", {
      method: "POST",
      cookie: realLogin.cookie,
      body: { title: "Real instructor course", code: "REAL-PERSISTED" },
    });
    assert.equal(allowed.status, 201);
  } finally {
    await development?.close();
    await production?.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
