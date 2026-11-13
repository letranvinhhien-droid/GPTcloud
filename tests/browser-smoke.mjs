import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const temp = mkdtempSync(join(tmpdir(), "meridian-browser-"));
const port = 3107;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    LMS_DEMO: "true",
    PORT: String(port),
    LMS_DB: join(temp, "browser.sqlite"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (s) => (serverLog += s));
server.stderr.on("data", (s) => (serverLog += s));
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    if (i === 59) throw new Error("Server did not start: " + serverLog);
    await new Promise((r) => setTimeout(r, 250));
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
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Instructor demo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create a course", exact: true })
    .click();
  await page
    .getByLabel("Course name", { exact: true })
    .fill("Browser test course");
  await page.getByLabel("Course code", { exact: true }).fill("E2E101");
  await page
    .getByLabel("About this course")
    .fill("A browser-tested learning experience.");
  await page
    .getByRole("button", { name: "Create course", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser test course", exact: true }),
  ).toBeVisible();
  const courseHash = new URL(page.url()).hash;
  await page.getByRole("button", { name: "Add module", exact: true }).click();
  await page.getByLabel("Module name").fill("First steps");
  await page
    .getByRole("button", { name: "Create module", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "First steps" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await page.getByLabel("Activity title").fill("Welcome lesson");
  await page
    .getByLabel("Lesson content")
    .fill("Welcome to this lesson. Think about what you want to learn.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add activity", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Welcome lesson/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Quizzes/ }).click();
  await page.getByRole("button", { name: /Create quiz/ }).click();
  await page.getByLabel("Quiz title").fill("A thoughtful check");
  await page
    .getByLabel("Question 1 prompt", { exact: true })
    .fill("Which answer is correct?");
  for (const [i, choice] of ["First", "Second", "Third", "Fourth"].entries())
    await page
      .getByLabel(`Question 1 choice ${i + 1}`, { exact: true })
      .fill(choice);
  await page
    .getByLabel("Mark answer 1 correct for question 1", { exact: true })
    .check();
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await page.getByLabel("Question 2 type").selectOption("essay");
  await page
    .getByLabel("Question 2 prompt", { exact: true })
    .fill("Explain your reasoning.");
  await page
    .getByLabel("Publish quiz and make it available to enrolled learners")
    .check();
  await page.getByRole("button", { name: "Save quiz", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A thoughtful check" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Course settings", exact: true })
    .click();
  await page.getByLabel("Visibility").selectOption("published");
  await page.getByLabel("Enrollment", { exact: true }).selectOption("invite");
  await page.getByLabel("quizzes weight", { exact: true }).fill("60");
  await page.getByLabel("assignments weight", { exact: true }).fill("30");
  await page.getByLabel("participation weight", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".toast[role=status]")).toContainText("saved");
  await page.locator('a[href="#people"]').click();
  await page.getByLabel("Search all learners").fill("Jamie");
  await page.getByRole("button", { name: /View Jamie/ }).click();
  await page
    .getByLabel("Enrollment course")
    .selectOption({ label: "Browser test course · Invitation only" });
  await page
    .getByRole("button", { name: "Enroll learner", exact: true })
    .click();
  await expect(page.locator(".toast[role=status]")).toContainText("enrolled");
  await page.locator(".profile").click();
  await page.getByRole("button", { name: "Learner view" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toContainText("Jamie");
  await page.goto(base + "/" + courseHash);
  await expect(page.locator(".workspace-enrolled")).toContainText("Enrolled");
  await page.getByRole("button", { name: /^Welcome lesson/ }).click();
  await expect(
    page.getByText(
      "Welcome to this lesson. Think about what you want to learn.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await page.getByRole("button", { name: /^Quizzes/ }).click();
  await page.getByRole("button", { name: "Take quiz", exact: true }).click();
  await page.getByRole("button", { name: "Start quiz", exact: true }).click();
  await page.getByRole("radio", { name: "First", exact: true }).check();
  await page
    .getByLabel("Answer to question 2")
    .fill("The first answer applies the principles in the lesson.");
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(
    page.getByRole("heading", { name: "Submitted for review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to course" }).click();
  await page.locator(".profile").click();
  await page.getByRole("button", { name: "Instructor view" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toContainText("Alex");
  await page.goto(base + "/" + courseHash);
  await page.getByRole("button", { name: "Gradebook", exact: true }).click();
  await page.getByRole("button", { name: /Submissions/ }).click();
  await page.getByRole("button", { name: "Grade submission" }).click();
  await expect(
    page.getByText("The first answer applies the principles in the lesson."),
  ).toBeVisible();
  await page.getByLabel("Awarded points").fill("18");
  await page.getByRole("button", { name: "Save final score" }).click();
  await expect(page.locator(".toast[role=status]")).toContainText("graded");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".reports-grade").first()).toContainText("90%");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export grades" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("E2E101-gradebook.csv");
  for (const [route, heading] of [
    ["analytics", "Learning analytics"],
    ["library", "Content library"],
    ["settings", "Settings"],
  ]) {
    await page.goto(base + "/#" + route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await page.getByLabel("Full name").fill("Alex Morgan Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".toast[role=status]")).toContainText("updated");
  await page.reload();
  await expect(page.getByLabel("Full name")).toHaveValue("Alex Morgan Updated");
  await page.goto(base + "/#overview");
  await expect(
    page.getByRole("heading", { name: "Welcome back, Alex." }),
  ).toBeVisible();
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.locator('a[href="#courses"]').click();
  await expect(
    page.getByRole("heading", { name: "My courses", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).not.toHaveClass(/mobile-open/);
  await page.screenshot({
    path: "test-results/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  for (const route of ["analytics", "gradebook", "people", "settings"]) {
    await page.goto(base + "/#" + route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `No horizontal overflow on ${route}`,
    ).toBeTruthy();
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS: create course/module/lesson/quiz; publish & weights; instructor enrollment; learner lesson completion & quiz submission; essay grading & CSV export; analytics/library/profile; mobile navigation and overflow; no browser exceptions.",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((r) =>
    server.exitCode !== null ? r() : server.once("exit", r),
  );
  rmSync(temp, { recursive: true, force: true });
}
