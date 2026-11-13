import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createStore } from "../server/store.js";
import { createLocalAccount } from "../server/auth.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "meridian-account-browser-"));
const database = join(temp, "accounts.sqlite");
const base = "http://127.0.0.1:3108";
const passwords = Array.from({ length: 4 }, () =>
  randomBytes(24).toString("hex"),
);
const [
  instructorPassword,
  learnerPassword,
  replacementPassword,
  wrongPassword,
] = passwords;
const instructorEmail = "operator@meridian.example";
const learnerEmail = "account-browser@meridian.example";
let server;
let browser;
let store;
let serverLog = "";

async function signIn(page, email, password) {
  const form = page.locator(".auth-form");
  await form.getByLabel("Email address", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOut(page) {
  await page.locator(".profile").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
  ).toBeVisible();
}

try {
  store = createStore(database);
  await createLocalAccount(store, {
    name: "Morgan Operator",
    email: instructorEmail,
    password: instructorPassword,
    role: "instructor",
  });
  store.close();
  store = null;
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      LMS_DEMO: "false",
      LMS_COOKIE_SECURE: "false",
      PORT: "3108",
      LMS_DB: database,
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
      throw new Error(`Account test server exited: ${serverLog}`);
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    if (attempt === 59)
      throw new Error(`Account test server did not start: ${serverLog}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Instructor demo|Learner demo/ }),
  ).toHaveCount(0);
  await expect(page.locator(".auth-form input[type=password]")).toHaveValue("");
  mkdirSync(join(root, "test-results"), { recursive: true });
  await page.screenshot({
    path: join(root, "test-results", "account-login-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(
    page
      .locator(".auth-form")
      .getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: join(root, "test-results", "account-login-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await signIn(page, instructorEmail, wrongPassword);
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email or password",
  );
  await expect(
    page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
  ).toBeVisible();
  await signIn(page, instructorEmail, instructorPassword);
  await expect(
    page.getByRole("heading", { name: "Welcome back, Morgan.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a course", exact: true }).first(),
  ).toBeVisible();
  await page.locator(".profile").click();
  await expect(
    page.getByRole("button", { name: "Instructor view", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Learner view", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
  ).toBeVisible();
  const anonymous = await page.request.get(base + "/api/bootstrap");
  expect((await anonymous.json()).user).toBeNull();

  await page
    .locator(".auth-mode-tabs")
    .getByRole("button", { name: "Create learner account", exact: true })
    .click();
  const registration = page.locator(".auth-form");
  await registration
    .getByLabel("Full name", { exact: true })
    .fill("Taylor Learner");
  await registration
    .getByLabel("Email address", { exact: true })
    .fill(learnerEmail);
  await registration
    .getByLabel("Password", { exact: true })
    .fill(learnerPassword);
  await registration
    .getByLabel("Confirm password", { exact: true })
    .fill(learnerPassword);
  await registration
    .getByRole("button", { name: "Create learner account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Create (a )?course/i }),
  ).toHaveCount(0);
  const learner = await page.request.get(base + "/api/bootstrap");
  expect((await learner.json()).user.role).toBe("learner");
  const blocked = await page.request.post(base + "/api/courses", {
    data: { title: "Unauthorized creation", code: "DENIED" },
  });
  expect(blocked.status()).toBe(403);

  await page.goto(base + "/#settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Taylor Updated");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "profile has been updated",
  );
  const security = page.locator(".account-security");
  await expect(
    security.getByRole("heading", { name: "Account security", exact: true }),
  ).toBeVisible();
  await security
    .getByLabel("Current password", { exact: true })
    .fill(learnerPassword);
  await security.getByLabel(/^New password/).fill(replacementPassword);
  await security
    .getByLabel("Confirm new password", { exact: true })
    .fill(replacementPassword);
  await security
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(security.locator(".account-security-success")).toContainText(
    "password has been updated",
  );
  await expect(security.locator("input[type=password]").first()).toHaveValue(
    "",
  );
  await signOut(page);
  await signIn(page, learnerEmail, learnerPassword);
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email or password",
  );
  await signIn(page, learnerEmail, replacementPassword);
  await expect(
    page.getByRole("heading", { name: "Welcome back, Taylor.", exact: true }),
  ).toBeVisible();
  await page.goto(base + "/#settings");
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Taylor Updated",
  );
  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Taylor Updated",
  );
  await expect(page.getByLabel("Workspace role", { exact: true })).toHaveValue(
    "learner",
  );
  await signOut(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome to Meridian.", exact: true }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
  console.log(
    "PASS: real instructor login and incorrect credentials; persistent sign-out; learner registration and permissions; profile persistence; password change with old-password rejection/new-password login; demo controls hidden; mobile auth layout; no browser exceptions.",
  );
} catch (error) {
  let safeMessage = String(error.stack || error);
  for (const password of passwords)
    safeMessage = safeMessage.replaceAll(password, "[redacted test password]");
  console.error(safeMessage);
  process.exitCode = 1;
} finally {
  await browser?.close();
  store?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const timer = setTimeout(() => {
        server.kill("SIGKILL");
      }, 3000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  rmSync(temp, { recursive: true, force: true });
}
