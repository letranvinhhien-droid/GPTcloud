import { randomUUID } from "node:crypto";
export const uid = () => randomUUID();
export const iso = () => new Date().toISOString();
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function text(value, name, max = 5000) {
  requireValue(
    typeof value === "string" && value.trim().length > 0 && value.length <= max,
    `${name} is required and must be under ${max} characters.`,
  );
  return value.trim();
}
export function number(value, name, min = 0, max = 100) {
  requireValue(
    value !== null &&
      value !== "" &&
      Number.isFinite(Number(value)) &&
      Number(value) >= min &&
      Number(value) <= max,
    `${name} must be between ${min} and ${max}.`,
  );
  return Number(value);
}
export function initial(name) {
  return name
    .split(" ")
    .map((v) => v[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    initials: initial(user.name),
  };
}
export function gradeRow(enrollment, user, course) {
  const grades = enrollment.grades || {};
  const weights = course.weights;
  const categories = ["quizzes", "assignments", "participation"];
  const graded = categories.filter(
    (k) => grades[k] !== null && grades[k] !== undefined,
  );
  const denominator = graded.reduce((n, k) => n + weights[k], 0);
  const total = denominator
    ? Math.round(
        (graded.reduce((n, k) => n + grades[k] * weights[k], 0) / denominator) *
          10,
      ) / 10
    : null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    initials: initial(user.name),
    quizzes: grades.quizzes ?? null,
    assignments: grades.assignments ?? null,
    participation: grades.participation ?? null,
    total,
    letter:
      total === null
        ? "—"
        : total >= 90
          ? "A"
          : total >= 80
            ? "B"
            : total >= 70
              ? "C"
              : total >= 60
                ? "D"
                : "F",
    completed: !!enrollment.completed,
  };
}
export function validateCourse(body, current = {}, store) {
  const merged = { ...current, ...body };
  const result = { ...current };
  result.title = text(merged.title, "Course title", 180);
  result.code = text(
    merged.code || "CRS" + Date.now().toString().slice(-5),
    "Course code",
    30,
  );
  result.description = String(merged.description || "").slice(0, 8000);
  result.category = String(merged.category || "General").slice(0, 80);
  result.color = /^#[a-fA-F0-9]{6}$/.test(merged.color)
    ? merged.color
    : "#69806b";
  result.status = merged.status || "draft";
  requireValue(
    ["published", "draft", "archived"].includes(result.status),
    "Invalid course status.",
  );
  result.pace = merged.pace || "self-paced";
  requireValue(
    ["self-paced", "instructor-led"].includes(result.pace),
    "Invalid course pacing.",
  );
  result.enrollment = merged.enrollment || "open";
  requireValue(
    ["open", "invite"].includes(result.enrollment),
    "Invalid enrollment setting.",
  );
  result.cover = merged.cover || "design";
  requireValue(
    ["design", "code", "marketing", "photo", "business", "data"].includes(
      result.cover,
    ),
    "Invalid cover style.",
  );
  result.startDate = merged.startDate || "";
  result.endDate = merged.endDate || "";
  for (const k of ["startDate", "endDate"]) {
    requireValue(
      !result[k] ||
        (/^\d{4}-\d{2}-\d{2}$/.test(result[k]) &&
          !Number.isNaN(Date.parse(result[k]))),
      `Invalid ${k}.`,
    );
  }
  requireValue(
    !result.startDate || !result.endDate || result.startDate <= result.endDate,
    "End date must be on or after the start date.",
  );
  result.passingScore = number(merged.passingScore ?? 70, "Passing score");
  result.weights = merged.weights || {
    quizzes: 40,
    assignments: 40,
    participation: 20,
  };
  result.weights = Object.fromEntries(
    ["quizzes", "assignments", "participation"].map((k) => [
      k,
      number(result.weights[k], `${k} weight`),
    ]),
  );
  requireValue(
    Math.abs(Object.values(result.weights).reduce((a, b) => a + b, 0) - 100) <
      0.001,
    "Grade weights must add up to 100%.",
  );
  result.prerequisites = merged.prerequisites || [];
  requireValue(
    Array.isArray(result.prerequisites) && result.prerequisites.length <= 20,
    "Prerequisites must be a list of courses.",
  );
  result.prerequisites = [...new Set(result.prerequisites)];
  for (const id of result.prerequisites) {
    requireValue(
      typeof id === "string" && store.get("courses", id),
      "A prerequisite course does not exist.",
    );
    const seen = new Set();
    const visit = (courseId) => {
      requireValue(
        courseId !== current.id,
        "Course prerequisites cannot create a cycle.",
      );
      if (seen.has(courseId)) return;
      seen.add(courseId);
      for (const child of store.get("courses", courseId)?.prerequisites || [])
        visit(child);
    };
    visit(id);
  }
  return result;
}
export function validateQuiz(body, current = {}) {
  const merged = { ...current, ...body };
  const out = {
    ...current,
    title: text(merged.title, "Quiz title", 180),
    description: String(merged.description || "").slice(0, 5000),
    timeLimit: number(merged.timeLimit ?? 20, "Time limit", 0, 300),
    attempts: number(merged.attempts ?? 3, "Attempts", 1, 100),
    passingScore: number(merged.passingScore ?? 70, "Passing score"),
    published: merged.published === true,
  };
  requireValue(
    Number.isInteger(out.attempts),
    "Attempts must be a whole number.",
  );
  requireValue(
    Array.isArray(merged.questions) &&
      merged.questions.length >= 1 &&
      merged.questions.length <= 100,
    "A quiz needs between 1 and 100 questions.",
  );
  out.questions = merged.questions.map((q) => {
    const r = {
      id: typeof q.id === "string" ? q.id : uid(),
      type: q.type,
      prompt: text(q.prompt, "Question prompt", 5000),
      points: number(q.points ?? 1, "Question points", 1, 1000),
    };
    requireValue(
      ["multiple-choice", "true-false", "short-answer", "essay"].includes(
        r.type,
      ),
      "Unsupported question type.",
    );
    if (["multiple-choice", "true-false"].includes(r.type)) {
      r.options = r.type === "true-false" ? ["True", "False"] : q.options;
      requireValue(
        Array.isArray(r.options) &&
          r.options.length >= 2 &&
          r.options.length <= 10 &&
          r.options.every(
            (v) => typeof v === "string" && v.trim() && v.length <= 1000,
          ),
        "Choice questions need 2–10 nonempty options.",
      );
      r.options = r.options.map((v) => v.trim());
      requireValue(
        new Set(r.options).size === r.options.length,
        "Answer choices must be unique.",
      );
      let answer = q.answer;
      if (typeof answer === "number") answer = r.options[answer];
      r.answer = r.options.find(
        (v) => v.toLowerCase() === String(answer).toLowerCase(),
      );
      requireValue(!!r.answer, "Select a correct answer from the options.");
    } else if (r.type === "short-answer")
      r.answer = text(q.answer, "Correct answer", 1000);
    else r.answer = "";
    return r;
  });
  requireValue(
    new Set(out.questions.map((q) => q.id)).size === out.questions.length,
    "Question IDs must be unique.",
  );
  return out;
}
