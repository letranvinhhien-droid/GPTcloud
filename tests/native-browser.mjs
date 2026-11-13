import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "meridian-native-browser-"));
const port = Number(process.env.NATIVE_TEST_PORT || 3110);
const base = `http://127.0.0.1:${port}`;
let browser;
let server;
let serverLog = "";

async function capture(page, name) {
  await expect(page.locator(".toast[role=status]")).toHaveCount(0, {
    timeout: 7000,
  });
  await page.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await page.screenshot({
    path: join(root, "test-results", name),
    fullPage: true,
    animations: "disabled",
  });
}

async function switchRole(page, role) {
  await page.locator(".profile").click();
  await page.getByRole("button", { name: `${role} view`, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome back,/ }),
  ).toBeVisible();
}

async function responseJson(response) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function openGame(page, title) {
  const card = page
    .locator(".native-game-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("button", { name: "Play game", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start game", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Submit game", exact: true }),
  ).toBeVisible();
}

async function submitGame(page, expectedScore) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/submit") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Submit game", exact: true }).click();
  const result = await responseJson(await pending);
  expect(result.percentage).toBe(expectedScore);
  await expect(page.locator(".native-score")).toHaveText(`${expectedScore}%`);
  await expect(page.getByRole("dialog")).toContainText("gradebook");
  await page
    .getByRole("button", { name: "Back to games", exact: true })
    .click();
}

try {
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      LMS_DEMO: "true",
      LMS_COOKIE_SECURE: "false",
      PORT: String(port),
      LMS_DB: join(temp, "native.sqlite"),
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
      throw new Error(`Native test server exited: ${serverLog}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    if (attempt === 59)
      throw new Error(`Native test server did not start: ${serverLog}`);
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
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Admin demo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /^Welcome back,/ }),
  ).toBeVisible();
  await page.goto(`${base}/#analytics`);
  await page
    .getByRole("button", { name: "Configure metrics", exact: true })
    .click();
  await page
    .getByLabel("Metric 1 name", { exact: true })
    .fill("Native game pass rate");
  await page
    .getByLabel("Metric 1 category", { exact: true })
    .selectOption("achievement");
  await page
    .getByLabel("Metric 1 measure", { exact: true })
    .selectOption("assessment_pass_rate");
  await page.getByLabel("Metric 1 target", { exact: true }).fill("90");
  await page.getByLabel("Metric 1 watch threshold", { exact: true }).fill("70");
  await page
    .getByLabel("Metric 1 lookback", { exact: true })
    .selectOption("30");
  await page.getByRole("button", { name: /^Add metric/ }).click();
  await page
    .getByLabel("Metric 4 name", { exact: true })
    .fill("Practice engagement");
  await page.getByLabel("Metric 4 target", { exact: true }).fill("80");
  await page.getByRole("button", { name: "Save metrics", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const config = await responseJson(
    await page.request.get(`${base}/api/metrics/config`),
  );
  expect(config.rules[0]).toMatchObject({
    name: "Native game pass rate",
    category: "achievement",
    measure: "assessment_pass_rate",
    target: 90,
    warningThreshold: 70,
    windowDays: 30,
  });
  expect(config.rules[3]).toMatchObject({
    name: "Practice engagement",
    measure: "engagement_rate",
    target: 80,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Native game pass rate", exact: true }),
  ).toBeVisible();

  await switchRole(page, "Instructor");
  await page
    .getByRole("button", { name: "Create a course", exact: true })
    .click();
  await page
    .getByLabel("Course name", { exact: true })
    .fill("Native learning lab");
  await page.getByLabel("Course code", { exact: true }).fill("NATIVE101");
  await page
    .getByLabel("About this course")
    .fill(
      "A course that exercises native learning games and measured achievement.",
    );
  await page
    .getByRole("button", { name: "Create course", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Native learning lab", exact: true }),
  ).toBeVisible();
  const courseHash = new URL(page.url()).hash;
  const courseId = courseHash.split("/")[1];
  await page.getByRole("button", { name: /^Games/ }).click();

  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page
    .getByLabel("Game title", { exact: true })
    .fill("Connect the colors");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Match each color with its familiar example.");
  await page.getByLabel("Pair 1 prompt", { exact: true }).fill("Blue");
  await page.getByLabel("Pair 1 answer", { exact: true }).fill("Ocean");
  await page.getByLabel("Pair 2 prompt", { exact: true }).fill("Green");
  await page.getByLabel("Pair 2 answer", { exact: true }).fill("Forest");
  await page.getByLabel("Publish this game for enrolled learners").check();
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connect the colors", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Preview game", exact: true }).click();
  await page
    .getByRole("button", { name: "Start game preview", exact: true })
    .click();
  await page
    .getByLabel("Match for Blue", { exact: true })
    .selectOption({ label: "Ocean" });
  await page
    .getByLabel("Match for Green", { exact: true })
    .selectOption({ label: "Forest" });
  await page.getByRole("button", { name: "Submit game", exact: true }).click();
  await expect(page.locator(".native-score")).toHaveText("100%");
  await expect(page.getByRole("dialog")).toContainText(
    "This preview does not affect grades.",
  );
  await page
    .getByRole("button", { name: "Back to games", exact: true })
    .click();
  const previewGrades = await responseJson(
    await page.request.get(`${base}/api/courses/${courseId}/gradebook`),
  );
  expect(previewGrades.submissions).toHaveLength(0);

  await page.getByRole("button", { name: "Create game", exact: true }).click();
  await page.getByRole("button", { name: /Put it in order/ }).click();
  await page.getByLabel("Game title", { exact: true }).fill("A growing idea");
  for (const [index, text] of [
    "Plant a seed",
    "Water the soil",
    "Watch it grow",
  ].entries())
    await page.getByLabel(`Step ${index + 1} text`, { exact: true }).fill(text);
  await page.getByLabel("Publish this game for enrolled learners").check();
  await page.getByRole("button", { name: "Save game", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A growing idea", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Course content/ }).click();
  await page.getByRole("button", { name: "Add module", exact: true }).click();
  await page.getByLabel("Module name").fill("Play and practice");
  await page
    .getByRole("button", { name: "Create module", exact: true })
    .click();
  for (const title of ["Connect the colors", "A growing idea"]) {
    await page
      .getByRole("button", { name: "Add activity", exact: true })
      .click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("button", { name: "Game", exact: true }).click();
    await page.getByLabel("Activity title").fill(title);
    await page.getByLabel("Link a game").selectOption({ label: title });
    await modal
      .getByRole("button", { name: "Add activity", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: new RegExp(`^${title}`) }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Course settings", exact: true })
    .click();
  await page.getByLabel("Visibility").selectOption("published");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".toast[role=status]")).toContainText("saved");
  const gameData = await responseJson(
    await page.request.get(`${base}/api/courses/${courseId}/games`),
  );
  expect(gameData.games).toHaveLength(2);

  await page.goto(`${base}/#analytics`);
  await expect(
    page.getByRole("button", { name: "Configure metrics", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Analytics course").selectOption(courseId);
  const metricCard = page.locator(".cm-metric").filter({
    has: page.getByRole("heading", {
      name: "Native game pass rate",
      exact: true,
    }),
  });
  await expect(metricCard).toContainText("No data");
  expect(
    (
      await page.request.put(`${base}/api/metrics/config`, {
        data: { rules: config.rules },
      })
    ).status(),
  ).toBe(403);

  await switchRole(page, "Learner");
  await page.goto(`${base}/${courseHash}`);
  await page
    .getByRole("button", { name: "Enroll in course", exact: true })
    .click();
  await expect(page.locator(".workspace-enrolled")).toContainText("Enrolled");
  const publicGames = await responseJson(
    await page.request.get(`${base}/api/courses/${courseId}/games`),
  );
  expect(
    publicGames.games.every(
      (game) => !game.pairs && !game.sequence && !game.solution,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /^Connect the colors/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start game", exact: true })
    .click();
  // An unfilled attempt records zero, proving results are not just success placeholders.
  await submitGame(page, 0);
  await openGame(page, "Connect the colors");
  await page
    .getByLabel("Match for Blue", { exact: true })
    .selectOption({ label: "Ocean" });
  await page
    .getByLabel("Match for Green", { exact: true })
    .selectOption({ label: "Forest" });
  await submitGame(page, 100);
  await openGame(page, "A growing idea");
  const steps = ["Plant a seed", "Water the soil", "Watch it grow"];
  for (const [desiredIndex, step] of steps.entries()) {
    let current = await page
      .locator(".native-sequence-board li strong")
      .allTextContents();
    while (current.indexOf(step) > desiredIndex) {
      await page
        .getByRole("button", { name: `Move ${step} up`, exact: true })
        .click();
      current = await page
        .locator(".native-sequence-board li strong")
        .allTextContents();
    }
  }
  await expect(page.locator(".native-sequence-board li strong")).toHaveText(
    steps,
  );
  await submitGame(page, 100);

  const gradebook = await responseJson(
    await page.request.get(`${base}/api/courses/${courseId}/gradebook`),
  );
  expect(gradebook.rows).toHaveLength(1);
  expect(gradebook.rows[0]).toMatchObject({
    quizzes: 100,
    total: 100,
    completed: true,
  });
  expect(gradebook.submissions).toHaveLength(3);
  expect(
    gradebook.submissions.every((attempt) => attempt.type === "game"),
  ).toBe(true);
  await page.getByRole("button", { name: "My grades", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: /Quizzes & games/ }),
  ).toBeVisible();
  await expect(page.locator(".reports-table tbody tr").first()).toContainText(
    "100",
  );

  await page.goto(`${base}/#analytics`);
  await expect(
    page.getByRole("button", { name: "Configure metrics", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Analytics course").selectOption(courseId);
  await expect(metricCard).toContainText("66.7%");
  await expect(metricCard).toContainText("Sample: 3");
  await expect(metricCard).toContainText("Needs attention");
  await page.getByLabel("Analytics activity range").selectOption("7");
  await page
    .getByRole("button", { name: "Show activity data table", exact: true })
    .click();
  await expect(page.getByRole("table").first()).toContainText("3");
  const metrics = await responseJson(
    await page.request.get(`${base}/api/metrics?courseId=${courseId}&days=7`),
  );
  expect(metrics.scope.personal).toBe(true);
  expect(
    metrics.metrics.find((metric) => metric.name === "Native game pass rate"),
  ).toMatchObject({ value: 66.7, sampleSize: 3, state: "at-risk" });
  expect(
    metrics.assessments.find(
      (assessment) => assessment.title === "Connect the colors",
    ),
  ).toMatchObject({ attempts: 2, averageScore: 50, passRate: 50 });
  expect(
    metrics.assessments.find(
      (assessment) => assessment.title === "A growing idea",
    ),
  ).toMatchObject({ attempts: 1, averageScore: 100, passRate: 100 });
  expect(metrics.activity.reduce((total, day) => total + day.attempts, 0)).toBe(
    3,
  );
  expect(
    metrics.activity.reduce((total, day) => total + day.completions, 0),
  ).toBe(2);
  expect(
    (
      await page.request.put(`${base}/api/metrics/config`, {
        data: { rules: config.rules },
      })
    ).status(),
  ).toBe(403);
  mkdirSync(join(root, "test-results"), { recursive: true });
  await page
    .getByRole("button", { name: "Show activity chart", exact: true })
    .click();
  await capture(page, "native-metrics-desktop.png");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await capture(page, "native-metrics-mobile.png");
  await page.goto(`${base}/${courseHash}/games`);
  await expect(
    page.getByRole("heading", { name: "Small games. Lasting understanding." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await capture(page, "native-games-mobile.png");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, "native-games-desktop.png");
  await page.goto(`${base}/#library`);
  await expect(
    page.getByRole("heading", { name: "Content library", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Connect the colors", exact: true }),
  ).toBeVisible();
  await capture(page, "native-library-desktop.png");
  await page
    .getByLabel("Search activities", { exact: true })
    .fill("Connect the colors");
  await expect(page.locator(".nl-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Play game", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Connect the colors", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close game dialog", exact: true })
    .click();
  expect(errors).toEqual([]);
  console.log(
    "PASS: admin metric configuration persists; instructors create and publish matching/sequence games and link course modules; learner zero/success attempts record best scores and completion in gradebooks; measured pass rate, assessment performance and activity charts reflect real attempts; learner/instructor metric permissions; native metadata privacy; desktop/mobile layouts; no browser exceptions.",
  );
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => {
      const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  rmSync(temp, { recursive: true, force: true });
}
