import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../server/store.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "meridian-production-"));
const database = join(temp, "persistent", "lms.sqlite");
const port = Number(process.env.PRODUCTION_TEST_PORT || 3112);
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("hex");
const sensitive = [password];
const env = {
  ...process.env,
  NODE_ENV: "production",
  LMS_SEED: "false",
  LMS_DEMO: "false",
  LMS_COOKIE_SECURE: "true",
  LMS_DB: database,
  PORT: String(port),
};
let current;

function redact(value) {
  return sensitive
    .filter(Boolean)
    .reduce(
      (result, secret) => result.replaceAll(secret, "[redacted]"),
      String(value),
    );
}

function launch(args, stdin = "ignore") {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: [stdin, "pipe", "pipe"],
  });
  const state = { child, log: "", exited: false, error: null };
  const append = (chunk) => {
    state.log = (state.log + chunk).slice(-12000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  state.closed = new Promise((resolveClosed) => {
    child.once("error", (error) => {
      state.error = error;
    });
    child.once("close", (code, signal) => {
      state.exited = true;
      resolveClosed({ code, signal });
    });
  });
  return state;
}

async function stop(state) {
  if (!state || state.exited) return;
  state.child.kill("SIGTERM");
  const timer = setTimeout(() => state.child.kill("SIGKILL"), 5000);
  try {
    await state.closed;
  } finally {
    clearTimeout(timer);
  }
}

async function start() {
  current = launch(["server/index.js"]);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (current.error || current.exited)
      throw new Error(`Production server failed to start: ${current.log}`);
    // Wait for our own listener before probing, so an occupied port fails safely.
    if (current.log.includes(`Meridian LMS listening on port ${port}`)) {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 200, "Production health endpoint");
      assert.deepEqual(await response.json(), {
        ok: true,
        service: "meridian-lms",
      });
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Production server startup timed out: ${current.log}`);
}

async function request(path, { method = "GET", body, cookie } = {}) {
  return fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== "GET" ? { Origin: base } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

try {
  assert.ok(
    existsSync(join(root, "dist", "index.html")),
    "Run npm run build before the production smoke test.",
  );
  await start();

  const page = await request("/");
  assert.equal(page.status, 200, "Built production page is served");
  const html = await page.text();
  assert.match(html, /<title>Meridian/);
  const assetPath = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(assetPath, "Production page references a built JavaScript asset");
  const asset = await request(assetPath);
  assert.equal(asset.status, 200, "Built JavaScript asset is served");
  assert.ok(
    /javascript/.test(asset.headers.get("content-type")),
    "Asset is JavaScript rather than an HTML fallback",
  );
  assert.ok((await asset.text()).length > 1000, "Built asset has content");

  const config = await (await request("/api/auth/config")).json();
  assert.equal(
    config.demoEnabled,
    false,
    "Public deployment disables demo access",
  );
  const initialStore = createStore(database);
  try {
    assert.equal(
      initialStore.all("users").length,
      0,
      "No demo accounts seeded",
    );
    assert.equal(
      initialStore.all("courses").length,
      0,
      "No sample courses seeded",
    );
  } finally {
    initialStore.close();
  }
  assert.equal(
    (
      await request("/api/auth/demo", {
        method: "POST",
        body: { role: "admin" },
      })
    ).status,
    403,
    "Demo admin login is unavailable in production",
  );
  assert.equal(
    (await request("/api/metrics")).status,
    401,
    "Anonymous analytics access is denied",
  );
  assert.equal(
    (
      await request("/api/courses", {
        method: "POST",
        body: { title: "Unauthorized" },
      })
    ).status,
    401,
    "Anonymous course creation is denied",
  );

  const provision = launch(
    [
      "server/manage-users.js",
      "create-admin",
      "--name",
      "Production Operator",
      "--email",
      "production-smoke@meridian.example",
      "--password-stdin",
    ],
    "pipe",
  );
  provision.child.stdin.end(password + "\n");
  const provisionTimer = setTimeout(
    () => provision.child.kill("SIGKILL"),
    10000,
  );
  let provisionResult;
  try {
    provisionResult = await provision.closed;
  } finally {
    clearTimeout(provisionTimer);
  }
  assert.equal(
    provisionResult.code,
    0,
    `Admin provisioning failed: ${redact(provision.log)}`,
  );
  assert.ok(
    !provision.log.includes(password),
    "Provisioning never prints the password",
  );

  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "production-smoke@meridian.example", password },
  });
  assert.equal(login.status, 200, "CLI-provisioned admin signs in");
  const loginBody = await login.json();
  assert.equal(loginBody.user.role, "admin");
  assert.equal(
    loginBody.user.passwordHash,
    undefined,
    "Password hash stays private",
  );
  const setCookie = login.headers.get("set-cookie") || "";
  sensitive.push(setCookie);
  assert.ok(
    /;\s*HttpOnly(?:;|$)/i.test(setCookie),
    "Session cookie is HttpOnly",
  );
  assert.ok(
    /;\s*Secure(?:;|$)/i.test(setCookie),
    "Session cookie requires HTTPS",
  );
  assert.ok(
    /;\s*SameSite=Lax(?:;|$)/i.test(setCookie),
    "Session cookie is SameSite=Lax",
  );
  const cookie = setCookie.split(";")[0];
  assert.ok(
    cookie.startsWith("meridian_session="),
    "A real session was issued",
  );
  sensitive.push(cookie, cookie.slice("meridian_session=".length));
  // The HTTP test client forwards the cookie explicitly. Render terminates HTTPS;
  // this verifies the configured cookie flags, not browser TLS behavior.
  const created = await request("/api/courses", {
    method: "POST",
    cookie,
    body: {
      title: "Persistent production course",
      code: "PROD101",
      status: "published",
    },
  });
  assert.equal(created.status, 201, "Admin can create a course");
  const course = (await created.json()).course;

  await stop(current);
  current = null;
  await start();
  const restored = await request("/api/bootstrap", { cookie });
  assert.equal(restored.status, 200);
  const restoredBody = await restored.json();
  assert.equal(
    restoredBody.user?.id,
    loginBody.user.id,
    "Session survives a process restart",
  );
  assert.equal(
    restoredBody.courses.length,
    1,
    "Restart does not seed demo courses",
  );
  assert.equal(
    restoredBody.courses[0].id,
    course.id,
    "Course survives a process restart",
  );
  assert.equal(restoredBody.courses[0].title, "Persistent production course");
  assert.equal(
    (await request(`/api/courses/${course.id}`)).status,
    401,
    "Persisted course remains private to authenticated users",
  );

  console.log(
    "PASS: production page/assets and health; empty persistent database; demo disabled; CLI admin sign-in; Secure/HttpOnly/SameSite cookies; protected API; course and session survive process restart. Uses temporary local storage; no Render account or live service is modified.",
  );
} catch (error) {
  console.error(redact(error.stack || error.message || error));
  process.exitCode = 1;
} finally {
  await stop(current);
  rmSync(temp, { recursive: true, force: true });
}
