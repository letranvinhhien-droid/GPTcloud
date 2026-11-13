import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.js";
import { createLocalAccount, verifyPassword } from "../server/auth.js";

const setupToken = randomBytes(32).toString("hex");
const password = "A long first administrator passphrase";
const owner = {
  name: "Workspace Owner",
  email: "owner@example.test",
  password,
  setupToken,
};

async function fixture(t, options = {}) {
  const { app, store } = createApp({
    database: ":memory:",
    seed: false,
    demo: false,
    bootstrap: true,
    setupToken,
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await new Promise((resolve) => server.close(resolve));
    store.close();
  }
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
        cookie: response.headers.get("set-cookie")?.split(";")[0],
        retryAfter: response.headers.get("retry-after"),
      };
    },
  };
}

test("bootstrap readiness requires a server setup key and blocks learner registration", async (t) => {
  for (const configured of [undefined, "too-short"]) {
    const f = await fixture(t, { setupToken: configured });
    const config = await f.request("/auth/config");
    assert.deepEqual(config.data, {
      demoEnabled: false,
      registrationEnabled: false,
      setupRequired: true,
      setupEnabled: false,
    });
    assert.equal(
      (await f.request("/auth/setup", { method: "POST", body: owner })).status,
      503,
    );
    assert.equal(
      (await f.request("/auth/register", { method: "POST", body: owner }))
        .status,
      403,
    );
    assert.equal(f.store.all("users").length, 0);
    assert.equal(f.store.all("sessions").length, 0);
  }
});

test("setup key and account validation reject invalid requests without leaking credentials", async (t) => {
  const f = await fixture(t);
  const config = await f.request("/auth/config");
  assert.equal(config.data.setupEnabled, true);
  assert.equal(JSON.stringify(config.data).includes(setupToken), false);
  for (const attempted of [undefined, 123, "wrong-key", "x".repeat(513)]) {
    const response = await f.request("/auth/setup", {
      method: "POST",
      body: { ...owner, setupToken: attempted },
    });
    assert.equal(response.status, 403);
    assert.equal(response.cookie, undefined);
    assert.equal(JSON.stringify(response.data).includes(password), false);
    assert.equal(JSON.stringify(response.data).includes(setupToken), false);
  }
  const weak = await f.request("/auth/setup", {
    method: "POST",
    body: { ...owner, password: "short" },
  });
  assert.equal(weak.status, 400);
  assert.equal(f.store.all("users").length, 0);
  assert.equal(f.store.get("system", "admin-setup-complete"), null);
  const second = await fixture(t);
  assert.equal(
    (await second.request("/auth/setup", { method: "POST", body: [] })).status,
    400,
  );
  assert.equal(
    (
      await second.request("/auth/setup", {
        method: "POST",
        body: { ...owner, email: "invalid" },
      })
    ).status,
    400,
  );
});

test("first administrator setup issues a private session and enables ordinary learner registration", async (t) => {
  const f = await fixture(t);
  const response = await f.request("/auth/setup", {
    method: "POST",
    body: { ...owner, email: "OWNER@EXAMPLE.TEST", role: "learner" },
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.user.role, "admin");
  assert.equal(response.data.user.email, owner.email);
  assert.ok(response.cookie);
  const saved = f.store.get("users", response.data.user.id);
  assert.equal(await verifyPassword(password, saved.passwordHash), true);
  for (const privateValue of [password, setupToken, saved.passwordHash])
    assert.equal(JSON.stringify(response.data).includes(privateValue), false);
  assert.equal(response.data.user.passwordHash, undefined);
  assert.equal(f.store.get("system", "admin-setup-complete").adminId, saved.id);
  assert.equal(
    JSON.stringify(f.store.all("system")).includes(setupToken),
    false,
  );
  const current = await f.request("/bootstrap", { cookie: response.cookie });
  assert.equal(current.data.user.id, saved.id);
  const config = await f.request("/auth/config");
  assert.deepEqual(config.data, {
    demoEnabled: false,
    registrationEnabled: true,
    setupRequired: false,
    setupEnabled: false,
  });
  const registration = await f.request("/auth/register", {
    method: "POST",
    body: { name: "Learner", email: "learner@example.test", password },
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.data.user.role, "learner");
  const replay = await f.request("/auth/setup", {
    method: "POST",
    body: { ...owner, email: "second@example.test" },
  });
  assert.equal(replay.status, 409);
  assert.equal(
    f.store.all("users").filter((user) => user.role === "admin").length,
    1,
  );
});

test("concurrent setup requests create exactly one administrator and the completion marker cannot be reopened", async (t) => {
  const f = await fixture(t);
  const requests = await Promise.all([
    f.request("/auth/setup", { method: "POST", body: owner }),
    f.request("/auth/setup", {
      method: "POST",
      body: { ...owner, email: "other-owner@example.test" },
    }),
  ]);
  assert.deepEqual(
    requests.map((response) => response.status).sort(),
    [201, 409],
  );
  assert.equal(f.store.all("users").length, 1);
  assert.equal(f.store.all("sessions").length, 1);
  const marker = f.store.get("system", "admin-setup-complete");
  assert.ok(marker);
  f.store.remove("users", marker.adminId);
  assert.equal((await f.request("/auth/config")).data.setupRequired, false);
  assert.equal(
    (await f.request("/auth/setup", { method: "POST", body: owner })).status,
    409,
  );
  assert.equal(f.store.all("users").length, 0);
});

test("existing administrators suppress bootstrap and ordinary Node deployments keep setup disabled", async (t) => {
  const existing = await fixture(t);
  await createLocalAccount(existing.store, { ...owner, role: "admin" });
  assert.equal(
    (await existing.request("/auth/config")).data.setupRequired,
    false,
  );
  assert.equal(
    (await existing.request("/auth/setup", { method: "POST", body: owner }))
      .status,
    409,
  );
  const normal = await fixture(t, { bootstrap: false });
  assert.deepEqual((await normal.request("/auth/config")).data, {
    demoEnabled: false,
    registrationEnabled: true,
  });
  assert.equal(
    (await normal.request("/auth/setup", { method: "POST", body: owner }))
      .status,
    404,
  );
  assert.equal(normal.store.all("users").length, 0);
});

test("setup throttles forged forwarding headers and accepts only an explicitly injected client resolver", async (t) => {
  const defaultIdentity = await fixture(t);
  for (let i = 0; i < 5; i++) {
    assert.equal(
      (
        await defaultIdentity.request("/auth/setup", {
          method: "POST",
          body: { ...owner, setupToken: "incorrect" },
          headers: { "X-Forwarded-For": `192.0.2.${i}` },
        })
      ).status,
      403,
    );
  }
  const blocked = await defaultIdentity.request("/auth/setup", {
    method: "POST",
    body: owner,
    headers: { "X-Forwarded-For": "192.0.2.100" },
  });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.retryAfter) > 0);
  const verifiedIdentity = await fixture(t, {
    clientAddress: (req) => req.headers["x-test-edge-client"],
  });
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await verifiedIdentity.request("/auth/setup", {
          method: "POST",
          body: { ...owner, setupToken: "incorrect" },
          headers: { "x-test-edge-client": "verified-client-a" },
        })
      ).status,
      403,
    );
  assert.equal(
    (
      await verifiedIdentity.request("/auth/setup", {
        method: "POST",
        body: owner,
        headers: { "x-test-edge-client": "verified-client-a" },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await verifiedIdentity.request("/auth/setup", {
        method: "POST",
        body: owner,
        headers: { "x-test-edge-client": "verified-client-b" },
      })
    ).status,
    201,
  );
});

test("administrator setup state survives reopening the persistent store", async (t) => {
  const temp = mkdtempSync(join(tmpdir(), "meridian-bootstrap-"));
  const database = join(temp, "workspace.sqlite");
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const first = await fixture(t, { database });
  const created = await first.request("/auth/setup", {
    method: "POST",
    body: owner,
  });
  assert.equal(created.status, 201);
  await first.close();
  const reopened = await fixture(t, { database });
  assert.equal(
    (await reopened.request("/auth/config")).data.setupRequired,
    false,
  );
  assert.equal(
    (await reopened.request("/bootstrap", { cookie: created.cookie })).data.user
      .id,
    created.data.user.id,
  );
  assert.equal(
    (await reopened.request("/auth/setup", { method: "POST", body: owner }))
      .status,
    409,
  );
});
