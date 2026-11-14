import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "meridian-loading-"));
const port = Number(process.env.LOADING_TEST_PORT || 3114);
const base = `http://127.0.0.1:${port}`;
const screenshots = join(root, "test-results");
const opening = "Opening your workspace…";
let server, browser;
let serverLog = "";

function gate() {
  let release;
  const pending = new Promise((resolveGate) => {
    release = resolveGate;
  });
  return { pending, release };
}

async function runningAnimations(page) {
  return page.evaluate(
    () =>
      document.getAnimations().filter((item) => item.playState === "running")
        .length,
  );
}

async function loadingFlow({
  name,
  viewport,
  reducedMotion = "no-preference",
}) {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  const scripts = gate(),
    styles = gate(),
    api = gate();
  const scriptRequests = [],
    styleRequests = [];
  const apiRequests = new Set();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "script") {
      scriptRequests.push(url.pathname);
      await scripts.pending;
    } else if (request.resourceType() === "stylesheet") {
      styleRequests.push(url.pathname);
      await styles.pending;
    } else if (["/api/bootstrap", "/api/auth/config"].includes(url.pathname)) {
      apiRequests.add(url.pathname);
      await api.pending;
    }
    await route.continue();
  });
  try {
    // Module scripts delay DOMContentLoaded, so inspect after the HTML arrives.
    await page.goto(base, { waitUntil: "commit" });
    const status = page.getByRole("status").filter({ hasText: opening });
    await expect(status).toBeVisible();
    await expect(page.getByText(opening, { exact: true })).toBeVisible();
    await expect.poll(() => scriptRequests.length).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance
            .getEntriesByType("paint")
            .some((entry) => entry.name === "first-contentful-paint"),
        ),
      )
      .toBe(true);
    const bounds = await status.boundingBox();
    assert.ok(
      bounds && bounds.width > 0 && bounds.height > 0,
      "The HTML loading screen occupies visible space",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    if (reducedMotion === "reduce")
      await expect.poll(() => runningAnimations(page)).toBe(0);
    else await expect.poll(() => runningAnimations(page)).toBeGreaterThan(0);
    await page.screenshot({
      path: join(screenshots, `loading-${name}.png`),
      fullPage: true,
    });

    // Let the small entry script run, but keep the application's CSS delayed.
    scripts.release();
    await expect.poll(() => styleRequests.length).toBeGreaterThan(0);
    await expect(status).toBeVisible();
    await expect(page.getByText(opening, { exact: true })).toBeVisible();

    // React can now render, while the real bootstrap requests remain pending.
    styles.release();
    await expect.poll(() => apiRequests.size).toBe(2);
    await expect(status).toBeVisible();
    await expect(page.getByText(opening, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
    ).toHaveCount(0);
    if (reducedMotion === "reduce")
      await expect.poll(() => runningAnimations(page)).toBe(0);

    api.release();
    await expect(
      page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(opening, { exact: true })).toHaveCount(0);
    assert.deepEqual(
      errors,
      [],
      "Delayed startup should not cause browser exceptions",
    );
  } finally {
    scripts.release();
    styles.release();
    api.release();
    await context.close();
  }
}

async function failedBundleFlow() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let failBundle = true,
    failures = 0;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/assets/*.js", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (failBundle && /\/bootstrap-[^/]+\.js$/.test(path)) {
      failures++;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("We couldn’t open Meridian.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
    assert.ok(
      failures > 0,
      "The real application bundle request was deliberately failed",
    );
    await page.screenshot({
      path: join(screenshots, "loading-retry-mobile.png"),
      fullPage: true,
    });

    failBundle = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toHaveCount(0);
    assert.deepEqual(
      errors,
      [],
      "A failed dynamic import should be handled visibly, not left uncaught",
    );
  } finally {
    await context.close();
  }
}

try {
  assert.ok(
    existsSync(join(root, "dist/index.html")),
    "Run npm run build before the loading browser test.",
  );
  mkdirSync(screenshots, { recursive: true });
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      LMS_DEMO: "false",
      LMS_SEED: "false",
      LMS_COOKIE_SECURE: "false",
      LMS_DB: join(temp, "loading.sqlite"),
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    serverLog = (serverLog + chunk).slice(-10000);
  });
  server.stderr.on("data", (chunk) => {
    serverLog = (serverLog + chunk).slice(-10000);
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Loading test server exited: ${serverLog}`);
    if (serverLog.includes(`Meridian LMS listening on port ${port}`)) {
      const response = await fetch(base + "/api/health", {
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 200);
      break;
    }
    if (attempt === 59)
      throw new Error(`Loading test server did not start: ${serverLog}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  await loadingFlow({
    name: "desktop",
    viewport: { width: 1440, height: 1000 },
  });
  await loadingFlow({ name: "mobile", viewport: { width: 390, height: 844 } });
  await loadingFlow({
    name: "reduced-motion",
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await failedBundleFlow();
  console.log(
    "PASS: visible first paint before JavaScript and CSS; loading continues through delayed API startup; desktop/mobile layout; reduced motion; failed bundle recovery and retry; no browser exceptions.",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    await new Promise((resolveExit) => server.once("exit", resolveExit));
    clearTimeout(timer);
  }
  rmSync(temp, { recursive: true, force: true });
}
