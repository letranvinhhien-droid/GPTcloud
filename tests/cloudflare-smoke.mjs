import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "meridian-cloudflare-"));
const port = Number(process.env.CLOUDFLARE_TEST_PORT || 3113);
const base = `http://127.0.0.1:${port}`;
// Exercise the minimum accepted length and punctuation in the Workers runtime.
const setupToken = `${randomBytes(15).toString("hex")}.!`;
const password = randomBytes(24).toString("hex");
const sensitive = [setupToken, password];
const config = JSON.parse(
  readFileSync(join(root, "wrangler.jsonc"), "utf8").replace(
    /,\s*([}\]])/g,
    "$1",
  ),
);
delete config.$schema;
config.main = resolve(root, config.main);
config.assets.directory = resolve(root, config.assets.directory);
const configPath = join(temp, "wrangler.json");
writeFileSync(configPath, JSON.stringify(config, null, 2));
writeFileSync(join(temp, ".dev.vars"), `LMS_SETUP_TOKEN=${setupToken}\n`, {
  mode: 0o600,
});
let current, browser;
const browserErrors = [];
const redact = (value) =>
  sensitive
    .filter(Boolean)
    .reduce(
      (result, secret) => result.replaceAll(secret, "[redacted]"),
      String(value),
    );

function launch() {
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--local",
      "--config",
      configPath,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      "0",
      "--persist-to",
      join(temp, "state"),
      "--show-interactive-dev-session=false",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        XDG_CONFIG_HOME: join(temp, "config"),
        WRANGLER_LOG_PATH: join(temp, "wrangler.log"),
        BROWSER: "none",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  const state = { child, log: "", exited: false };
  const append = (data) => {
    state.log = (state.log + data).slice(-20000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  state.closed = new Promise((resolveClosed) => {
    child.once("error", (error) => {
      state.error = error;
    });
    child.once("close", () => {
      state.exited = true;
      resolveClosed();
    });
  });
  return state;
}

function signalGroup(state, signal) {
  try {
    process.kill(-state.child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
async function stop() {
  if (!current) return;
  const state = current;
  current = null;
  signalGroup(state, "SIGTERM");
  const timeout = setTimeout(() => signalGroup(state, "SIGKILL"), 5000);
  try {
    await state.closed;
  } finally {
    clearTimeout(timeout);
  }
}
async function start() {
  current = launch();
  for (let attempt = 0; attempt < 120; attempt++) {
    if (current.error || current.exited)
      throw new Error(
        `Local Wrangler failed: ${current.error?.message || current.log}`,
      );
    // Wait for this process's ready message so an occupied port cannot pass.
    if (/Ready on http/.test(current.log)) {
      const health = await fetch(base + "/api/health", {
        signal: AbortSignal.timeout(10000),
      });
      const text = await health.text();
      assert.equal(health.status, 200, `Worker health: ${text}`);
      assert.deepEqual(JSON.parse(text), { ok: true, service: "meridian-lms" });
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Local Wrangler startup timed out: ${current.log}`);
}

async function api(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(method !== "GET" ? { Origin: base } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `${path} returned ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  const setCookie = response.headers.get("set-cookie") || "";
  const sessionCookie = setCookie.split(";")[0];
  if (setCookie)
    sensitive.push(setCookie, sessionCookie, sessionCookie.split("=")[1]);
  return {
    status: response.status,
    data,
    cookie: sessionCookie,
    setCookie,
    headers: response.headers,
  };
}
function status(result, expected) {
  assert.equal(result.status, expected, JSON.stringify(result.data));
  return result.data;
}

try {
  assert.ok(
    existsSync(join(root, "dist/index.html")),
    "Run npm run build first.",
  );
  await start();
  const pageResponse = await fetch(base);
  const html = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(html, /<title>Meridian/);
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(asset);
  const assetResponse = await fetch(base + asset);
  assert.equal(assetResponse.status, 200);
  assert.match(assetResponse.headers.get("content-type"), /javascript/);
  assert.ok(
    !(await assetResponse.text()).includes(setupToken),
    "Setup secret is never bundled into the frontend",
  );

  const initialConfig = status(await api("/auth/config"), 200);
  assert.deepEqual(initialConfig, {
    demoEnabled: false,
    registrationEnabled: false,
    setupRequired: true,
    setupEnabled: true,
  });
  assert.ok(!JSON.stringify(initialConfig).includes(setupToken));
  status(await api("/metrics"), 401);
  status(
    await api("/auth/demo", { method: "POST", body: { role: "admin" } }),
    403,
  );
  status(
    await api("/auth/register", {
      method: "POST",
      body: { name: "Early Learner", email: "early@example.test", password },
    }),
    403,
  );
  for (const token of [undefined, "incorrect-key"]) {
    status(
      await api("/auth/setup", {
        method: "POST",
        body: {
          setupToken: token,
          name: "Owner",
          email: "owner@example.test",
          password,
        },
      }),
      403,
    );
  }

  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Set up your workspace.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Instructor demo", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(/^Setup key/).fill(setupToken);
  await page.getByLabel("Full name", { exact: true }).fill("Cloudflare Owner");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  const setupResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/setup") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Create administrator account", exact: true })
    .click();
  const setup = await setupResponse;
  assert.equal(setup.status(), 201, await setup.text());
  const setupData = await setup.json();
  assert.equal(setupData.user.role, "admin");
  assert.equal(setupData.user.passwordHash, undefined);
  await expect(
    page.getByRole("heading", {
      name: "Welcome back, Cloudflare.",
      exact: true,
    }),
  ).toBeVisible();
  const secretCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === "meridian_session",
  );
  assert.ok(
    secretCookie,
    "Browser accepts the localhost secure session cookie",
  );
  assert.equal(secretCookie.secure, true);
  assert.equal(secretCookie.httpOnly, true);
  assert.equal(secretCookie.sameSite, "Lax");
  const adminCookie = `meridian_session=${secretCookie.value}`;
  sensitive.push(secretCookie.value, adminCookie);
  const bootstrap = status(
    await api("/bootstrap", { cookie: adminCookie }),
    200,
  );
  assert.deepEqual(bootstrap.courses, []);
  assert.deepEqual(bootstrap.learners, []);
  assert.equal(status(await api("/auth/config"), 200).setupRequired, false);
  status(
    await api("/auth/setup", {
      method: "POST",
      body: {
        setupToken,
        name: "Other owner",
        email: "other@example.test",
        password,
      },
    }),
    409,
  );

  const course = status(
    await api("/courses", {
      method: "POST",
      cookie: adminCookie,
      body: {
        title: "Persistent Cloudflare course",
        code: "CF101",
        status: "published",
        weights: { quizzes: 100, assignments: 0, participation: 0 },
      },
    }),
    201,
  ).course;
  const pairs = [
    { id: "one", prompt: "One", answer: "First" },
    { id: "two", prompt: "Two", answer: "Second" },
  ];
  const game = status(
    await api(`/courses/${course.id}/games`, {
      method: "POST",
      cookie: adminCookie,
      body: {
        title: "Connect the numbers",
        type: "matching",
        pairs,
        published: true,
        timeLimit: 5,
        attempts: 1,
        passingScore: 70,
      },
    }),
    201,
  ).game;
  const module = status(
    await api(`/courses/${course.id}/modules`, {
      method: "POST",
      cookie: adminCookie,
      body: { title: "Practice" },
    }),
    201,
  ).module;
  status(
    await api(`/courses/${course.id}/modules/${module.id}/items`, {
      method: "POST",
      cookie: adminCookie,
      body: { title: "Match the numbers", type: "game", gameId: game.id },
    }),
    201,
  );

  const registration = await api("/auth/register", {
    method: "POST",
    body: {
      name: "Cloudflare Learner",
      email: "learner@example.test",
      password,
    },
  });
  assert.equal(status(registration, 201).user.role, "learner");
  assert.match(registration.setCookie, /;\s*Secure(?:;|$)/i);
  assert.match(registration.setCookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(registration.setCookie, /;\s*SameSite=Lax(?:;|$)/i);
  const learnerCookie = registration.cookie;
  status(
    await api(`/courses/${course.id}/enroll`, {
      method: "POST",
      cookie: learnerCookie,
      body: {},
    }),
    201,
  );
  const gamePath = `/courses/${course.id}/games/${game.id}`;
  const started = status(
    await api(gamePath + "/start", {
      method: "POST",
      cookie: learnerCookie,
      body: {},
    }),
    201,
  );
  const answers = Object.fromEntries(
    started.game.prompts.map((prompt) => [
      prompt.id,
      started.game.choices.find(
        (choice) =>
          choice.text ===
          pairs.find((pair) => pair.prompt === prompt.text).answer,
      ).id,
    ]),
  );
  const result = status(
    await api(gamePath + "/submit", {
      method: "POST",
      cookie: learnerCookie,
      body: { attemptId: started.attemptId, answers, score: 0 },
    }),
    200,
  );
  assert.equal(result.percentage, 100);
  assert.equal(result.passed, true);
  const grades = status(
    await api(`/courses/${course.id}/gradebook`, { cookie: learnerCookie }),
    200,
  );
  assert.equal(grades.rows[0].quizzes, 100);
  assert.equal(grades.rows[0].completed, true);
  const metrics = status(
    await api(`/metrics?courseId=${course.id}&days=7`, { cookie: adminCookie }),
    200,
  );
  assert.equal(metrics.assessments[0].averageScore, 100);
  assert.equal(
    metrics.activity.reduce((total, day) => total + day.attempts, 0),
    1,
  );
  assert.equal(
    metrics.activity.reduce((total, day) => total + day.completions, 0),
    1,
  );

  await page.locator(".profile").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Setup key/)).toHaveCount(0);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Welcome back, Cloudflare.",
      exact: true,
    }),
  ).toBeVisible();
  const replacement = (await page.context().cookies()).find(
    (cookie) => cookie.name === "meridian_session",
  );
  const persistentAdminCookie = `meridian_session=${replacement.value}`;
  sensitive.push(replacement.value, persistentAdminCookie);
  assert.deepEqual(browserErrors, []);
  await browser.close();
  browser = null;

  await stop();
  await start();
  const restored = status(
    await api("/bootstrap", { cookie: persistentAdminCookie }),
    200,
  );
  assert.equal(restored.user.role, "admin");
  assert.ok(restored.courses.some((entry) => entry.id === course.id));
  assert.equal(
    status(
      await api(`/courses/${course.id}/gradebook`, { cookie: learnerCookie }),
      200,
    ).rows[0].quizzes,
    100,
  );
  assert.equal(
    status(
      await api(`/metrics?courseId=${course.id}&days=7`, {
        cookie: learnerCookie,
      }),
      200,
    ).assessments[0].averageScore,
    100,
  );
  assert.equal(status(await api("/auth/config"), 200).setupRequired, false);
  status(
    await api("/auth/setup", {
      method: "POST",
      body: {
        setupToken,
        name: "Other owner",
        email: "other@example.test",
        password,
      },
    }),
    409,
  );

  let limited;
  for (let attempt = 0; attempt < 16; attempt++) {
    limited = await api("/auth/login", {
      method: "POST",
      body: {
        email: "owner@example.test",
        password: "deliberately-wrong-password",
      },
      headers: {
        "x-meridian-client-address": `forged-${attempt}`,
        "x-forwarded-for": `198.51.100.${attempt + 1}`,
      },
    });
    assert.ok([401, 429].includes(limited.status));
  }
  assert.equal(
    limited.status,
    429,
    "Forged internal and forwarding headers cannot bypass the limiter",
  );
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  console.log(
    "PASS: real local Workers/Durable Object runtime; frontend and browser first-admin setup; no demo seed; secure auth; native game scoring/gradebook/analytics; persisted data and sessions across restart; setup replay protection; forged-header rate-limit protection. No cloud resources or accounts were created.",
  );
} catch (error) {
  console.error(redact(error.stack || error));
  if (current?.log) console.error(redact(current.log));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stop();
  rmSync(temp, { recursive: true, force: true });
}
