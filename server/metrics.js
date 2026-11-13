import { gradeRow, requireValue, text, iso } from "./domain.js";

const DAY = 24 * 60 * 60 * 1000;
const WINDOWS = [7, 30, 90];
const staff = (user) => ["instructor", "admin"].includes(user?.role);
const round = (value) => Math.round(value * 10) / 10;
const mean = (values) =>
  values.length
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;
const percent = (numerator, denominator) =>
  denominator ? round((numerator / denominator) * 100) : null;

export const metricCatalog = [
  {
    measure: "engagement_rate",
    name: "Active learning",
    category: "health",
    unit: "%",
    scope: "window",
    description:
      "Percentage of enrollments with learner activity during the selected lookback window. Instructor edits and grading actions are excluded.",
  },
  {
    measure: "completion_rate",
    name: "Course completion",
    category: "progress",
    unit: "%",
    scope: "snapshot",
    description:
      "Percentage of current course enrollments marked complete. This is a current snapshot, independent of the lookback window.",
  },
  {
    measure: "average_progress",
    name: "Average activity progress",
    category: "progress",
    unit: "%",
    scope: "snapshot",
    description:
      "Average percentage of published native activities completed per enrollment. Enrollments with no available activities are excluded unless marked complete.",
  },
  {
    measure: "average_grade",
    name: "Average weighted grade",
    category: "achievement",
    unit: "%",
    scope: "snapshot",
    description:
      "Average current weighted course grade across graded enrollments. Ungraded enrollments are excluded.",
  },
  {
    measure: "achievement_rate",
    name: "Course achievement",
    category: "achievement",
    unit: "%",
    scope: "snapshot",
    description:
      "Percentage of graded enrollments whose current weighted grade meets the course passing score. Ungraded enrollments are excluded.",
  },
  {
    measure: "assessment_pass_rate",
    name: "Quiz and game pass rate",
    category: "achievement",
    unit: "%",
    scope: "window",
    description:
      "Percentage of graded native quiz and game attempts that meet their saved passing score during the lookback window. Pending essays and assignments are excluded.",
  },
];
const catalogByMeasure = new Map(
  metricCatalog.map((entry) => [entry.measure, entry]),
);
const defaults = [
  {
    id: "health-engagement",
    name: "Learning engagement",
    category: "health",
    measure: "engagement_rate",
    target: 70,
    warningThreshold: 50,
    windowDays: 7,
    enabled: true,
  },
  {
    id: "progress-activities",
    name: "Activity progress",
    category: "progress",
    measure: "average_progress",
    target: 60,
    warningThreshold: 40,
    windowDays: 30,
    enabled: true,
  },
  {
    id: "achievement-course",
    name: "Course achievement",
    category: "achievement",
    measure: "achievement_rate",
    target: 75,
    warningThreshold: 55,
    windowDays: 30,
    enabled: true,
  },
];

export function validateMetricRules(rules) {
  requireValue(
    Array.isArray(rules) && rules.length <= 12,
    "Configure up to 12 metrics.",
  );
  const ids = new Set();
  return rules.map((rule) => {
    requireValue(
      rule && typeof rule === "object" && !Array.isArray(rule),
      "Each metric must be an object.",
    );
    requireValue(
      typeof rule.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(rule.id),
      "Each metric needs an ID containing letters, numbers, underscores, or hyphens.",
    );
    requireValue(!ids.has(rule.id), "Metric IDs must be unique.");
    ids.add(rule.id);
    const definition = catalogByMeasure.get(rule.measure);
    requireValue(definition, "Choose a supported metric measure.");
    requireValue(
      rule.category === definition.category,
      "The metric category must match its measure.",
    );
    for (const key of ["target", "warningThreshold"]) {
      requireValue(
        typeof rule[key] === "number" &&
          Number.isFinite(rule[key]) &&
          rule[key] >= 0 &&
          rule[key] <= 100,
        "Targets and warning thresholds must be numbers from 0 to 100.",
      );
    }
    requireValue(
      rule.target > rule.warningThreshold,
      "The target must be higher than the warning threshold.",
    );
    requireValue(
      WINDOWS.includes(rule.windowDays),
      "Choose a 7, 30, or 90 day lookback window.",
    );
    requireValue(
      typeof rule.enabled === "boolean",
      "Metric enabled status must be true or false.",
    );
    return {
      id: rule.id,
      name: text(rule.name, "Metric name", 80),
      category: definition.category,
      measure: definition.measure,
      target: rule.target,
      warningThreshold: rule.warningThreshold,
      windowDays: rule.windowDays,
      enabled: rule.enabled,
    };
  });
}

function configuration(store) {
  const saved = store.get("metrics-config", "workspace");
  return {
    rules: saved?.rules ?? structuredClone(defaults),
    catalog: metricCatalog,
    updatedAt: saved?.updatedAt || null,
  };
}
function windowStart(days, now) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return today.getTime() - (days - 1) * DAY;
}
function inWindow(value, days, now) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= windowStart(days, now) && time <= now;
}
function isAssessment(attempt) {
  return !attempt.type || ["quiz", "game"].includes(attempt.type);
}
function attemptScore(attempt) {
  if (
    typeof attempt.percentage === "number" &&
    Number.isFinite(attempt.percentage) &&
    attempt.percentage >= 0 &&
    attempt.percentage <= 100
  )
    return attempt.percentage;
  if (
    typeof attempt.score === "number" &&
    typeof attempt.maxScore === "number" &&
    Number.isFinite(attempt.score) &&
    Number.isFinite(attempt.maxScore) &&
    attempt.maxScore > 0 &&
    attempt.score >= 0 &&
    attempt.score <= attempt.maxScore
  )
    return round((attempt.score / attempt.maxScore) * 100);
  return null;
}
function duration(attempt) {
  if (
    typeof attempt.durationSeconds === "number" &&
    Number.isFinite(attempt.durationSeconds) &&
    attempt.durationSeconds >= 0
  )
    return attempt.durationSeconds;
  const elapsed =
    Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0
    ? round(elapsed / 1000)
    : null;
}
const learningTypes = new Set([
  "activity",
  "lesson",
  "lesson_view",
  "activity_view",
  "quiz",
  "quiz_started",
  "quiz_submitted",
  "game_started",
  "game_submitted",
  "assessment_started",
  "assessment_submitted",
  "submission",
  "completed",
  "completion",
]);

function collect(store, user, requestedCourseId) {
  const allCourses = store.all("courses");
  const users = new Map(
    store
      .all("users")
      .filter((person) => person.role === "learner")
      .map((person) => [person.id, person]),
  );
  const allEnrollments = store
    .all("enrollments")
    .filter(
      (entry) =>
        users.has(entry.userId) && (staff(user) || entry.userId === user.id),
    );
  const visible = allCourses.filter(
    (course) =>
      staff(user) ||
      (course.status === "published" &&
        allEnrollments.some((entry) => entry.courseId === course.id)),
  );
  if (requestedCourseId !== "all")
    requireValue(
      visible.some((course) => course.id === requestedCourseId),
      "Course not found.",
      404,
    );
  const courses = visible.filter(
    (course) => requestedCourseId === "all" || course.id === requestedCourseId,
  );
  const courseMap = new Map(courses.map((course) => [course.id, course]));
  const seen = new Set();
  const enrollments = allEnrollments.filter((entry) => {
    const id = `${entry.courseId}:${entry.userId}`;
    if (!courseMap.has(entry.courseId) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const enrolled = (entry) => seen.has(`${entry.courseId}:${entry.userId}`);
  const quizzes = new Map(store.all("quizzes").map((quiz) => [quiz.id, quiz]));
  const games = new Map(store.all("games").map((game) => [game.id, game]));
  const items = store.all("items").filter((item) => {
    if (!courseMap.has(item.courseId)) return false;
    if (item.type === "quiz")
      return quizzes.get(item.quizId)?.published === true;
    if (item.type === "game") return games.get(item.gameId)?.published === true;
    return ["lesson", "assignment"].includes(item.type);
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const completions = store
    .all("completions")
    .filter(
      (entry) =>
        enrolled(entry) &&
        itemMap.get(entry.itemId)?.courseId === entry.courseId,
    );
  const completedItems = new Map();
  for (const entry of completions) {
    const key = `${entry.courseId}:${entry.userId}`;
    if (!completedItems.has(key)) completedItems.set(key, new Set());
    completedItems.get(key).add(entry.itemId);
  }
  const activities = store
    .all("activities")
    .filter(
      (entry) =>
        enrolled(entry) &&
        users.has(entry.userId) &&
        learningTypes.has(entry.type),
    );
  const assessments = store
    .all("attempts")
    .filter((attempt) => enrolled(attempt) && isAssessment(attempt));
  // Attempts and completion records are authoritative sources even when an older activity log lacks an event.
  const learning = [...activities];
  for (const attempt of assessments) {
    if (attempt.startedAt)
      learning.push({ ...attempt, createdAt: attempt.startedAt });
    if (attempt.submittedAt)
      learning.push({ ...attempt, createdAt: attempt.submittedAt });
  }
  for (const completion of completions) learning.push(completion);
  const rows = enrollments.map((entry) => ({
    courseId: entry.courseId,
    enrollment: entry,
    row: gradeRow(
      entry,
      users.get(entry.userId),
      courseMap.get(entry.courseId),
    ),
  }));
  return {
    courses,
    courseMap,
    enrollments,
    rows,
    items,
    completions,
    completedItems,
    assessments,
    learning,
  };
}
function scoped(data, courseId) {
  const include = (record) => record.courseId === courseId;
  return {
    ...data,
    courses: data.courses.filter((course) => course.id === courseId),
    enrollments: data.enrollments.filter(include),
    rows: data.rows.filter(include),
    items: data.items.filter(include),
    completions: data.completions.filter(include),
    assessments: data.assessments.filter(include),
    learning: data.learning.filter(include),
  };
}
function calculate(rule, data, now) {
  let value = null,
    sampleSize = 0;
  const graded = data.rows.filter(
    ({ row }) => row.total !== null && Number.isFinite(row.total),
  );
  if (rule.measure === "completion_rate") {
    sampleSize = data.enrollments.length;
    value = percent(
      data.enrollments.filter((entry) => entry.completed).length,
      sampleSize,
    );
  } else if (rule.measure === "average_progress") {
    const values = data.enrollments
      .map((entry) => {
        if (entry.completed) return 100;
        const count = data.items.filter(
          (item) => item.courseId === entry.courseId,
        ).length;
        if (!count) return null;
        const completed =
          data.completedItems.get(`${entry.courseId}:${entry.userId}`)?.size ||
          0;
        return Math.min(100, (completed / count) * 100);
      })
      .filter((entry) => entry !== null);
    sampleSize = values.length;
    value = mean(values);
  } else if (rule.measure === "average_grade") {
    sampleSize = graded.length;
    value = mean(graded.map(({ row }) => row.total));
  } else if (rule.measure === "achievement_rate") {
    sampleSize = graded.length;
    value = percent(
      graded.filter(
        ({ row, courseId }) =>
          row.total >= data.courseMap.get(courseId).passingScore,
      ).length,
      sampleSize,
    );
  } else if (rule.measure === "engagement_rate") {
    sampleSize = data.enrollments.length;
    const active = new Set(
      data.learning
        .filter((entry) => inWindow(entry.createdAt, rule.windowDays, now))
        .map((entry) => `${entry.courseId}:${entry.userId}`),
    );
    value = percent(active.size, sampleSize);
  } else if (rule.measure === "assessment_pass_rate") {
    const attempts = data.assessments.filter(
      (attempt) =>
        attempt.submittedAt &&
        !attempt.pendingReview &&
        attemptScore(attempt) !== null &&
        inWindow(attempt.submittedAt, rule.windowDays, now),
    );
    sampleSize = attempts.length;
    value = percent(
      attempts.filter(
        (attempt) =>
          attemptScore(attempt) >=
          (attempt.quizSnapshot?.passingScore ??
            data.courseMap.get(attempt.courseId).passingScore),
      ).length,
      sampleSize,
    );
  }
  const definition = catalogByMeasure.get(rule.measure);
  const state =
    value === null
      ? "no-data"
      : value >= rule.target
        ? "healthy"
        : value >= rule.warningThreshold
          ? "watch"
          : "at-risk";
  return {
    ...rule,
    value,
    sampleSize,
    state,
    gap: value === null ? null : round(rule.target - value),
    description: definition.description,
    scope: definition.scope,
    unit: "%",
  };
}
function timeSeries(data, days, now) {
  const start = windowStart(days, now);
  const daysMap = new Map(
    Array.from({ length: days }, (_, index) => {
      const value = new Date(start + index * DAY);
      const date = value.toISOString().slice(0, 10);
      return [
        date,
        {
          date,
          label: value.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }),
          attempts: 0,
          completions: 0,
          people: new Set(),
          completionKeys: new Set(),
        },
      ];
    }),
  );
  for (const attempt of data.assessments) {
    if (!inWindow(attempt.submittedAt, days, now)) continue;
    const day = daysMap.get(
      new Date(attempt.submittedAt).toISOString().slice(0, 10),
    );
    if (day) day.attempts += 1;
  }
  for (const entry of data.completions) {
    if (!inWindow(entry.createdAt, days, now)) continue;
    daysMap
      .get(new Date(entry.createdAt).toISOString().slice(0, 10))
      ?.completionKeys.add(`${entry.courseId}:${entry.itemId}:${entry.userId}`);
  }
  for (const entry of data.learning) {
    if (!inWindow(entry.createdAt, days, now)) continue;
    daysMap
      .get(new Date(entry.createdAt).toISOString().slice(0, 10))
      ?.people.add(entry.userId);
  }
  return [...daysMap.values()].map(({ people, completionKeys, ...day }) => ({
    ...day,
    completions: completionKeys.size,
    activeLearners: people.size,
  }));
}
function assessmentSummary(data, days, now) {
  const groups = new Map();
  for (const attempt of data.assessments) {
    if (!inWindow(attempt.submittedAt, days, now)) continue;
    const id = attempt.gameId || attempt.quizId;
    if (!id) continue;
    const type = attempt.type === "game" ? "game" : "quiz";
    const key = `${attempt.courseId}:${type}:${id}`;
    if (!groups.has(key))
      groups.set(key, {
        id,
        title: attempt.quizSnapshot?.title || "Untitled assessment",
        type,
        courseId: attempt.courseId,
        attempts: 0,
        pendingReview: 0,
        scores: [],
        passed: 0,
        durations: [],
      });
    const group = groups.get(key);
    group.attempts += 1;
    const score = attemptScore(attempt);
    if (!attempt.pendingReview && score !== null) {
      group.scores.push(score);
      if (
        score >=
        (attempt.quizSnapshot?.passingScore ??
          data.courseMap.get(attempt.courseId).passingScore)
      )
        group.passed += 1;
    } else group.pendingReview += 1;
    const seconds = duration(attempt);
    if (seconds !== null) group.durations.push(seconds);
  }
  return [...groups.values()]
    .map(({ scores, passed, durations, ...group }) => ({
      ...group,
      gradedAttempts: scores.length,
      averageScore: mean(scores),
      passRate: percent(passed, scores.length),
      averageDurationSeconds: mean(durations),
    }))
    .sort((a, b) => b.attempts - a.attempts || a.title.localeCompare(b.title));
}

export function installMetricRoutes(app, { store, auth }) {
  app.get("/api/metrics/config", auth, (req, res) =>
    res.json({ ...configuration(store), canEdit: req.user.role === "admin" }),
  );
  app.put("/api/metrics/config", auth, (req, res) => {
    requireValue(
      req.user.role === "admin",
      "Only workspace admins can configure course metrics.",
      403,
    );
    const rules = validateMetricRules(req.body?.rules);
    const saved = store.put("metrics-config", {
      id: "workspace",
      rules,
      updatedAt: iso(),
    });
    res.json({
      rules: saved.rules,
      catalog: metricCatalog,
      updatedAt: saved.updatedAt,
      canEdit: true,
    });
  });
  app.get("/api/metrics", auth, (req, res) => {
    const courseId = req.query.courseId ?? "all";
    const days = Number(req.query.days ?? 30);
    requireValue(
      typeof courseId === "string" &&
        courseId.length > 0 &&
        courseId.length <= 128,
      "Choose a valid course.",
    );
    requireValue(
      WINDOWS.includes(days),
      "Choose a 7, 30, or 90 day chart window.",
    );
    const config = configuration(store);
    const now = Date.now();
    const data = collect(store, req.user, courseId);
    const enabled = config.rules.filter((rule) => rule.enabled);
    const metrics = enabled.map((rule) => calculate(rule, data, now));
    const courseHealth = data.courses.map((course) => {
      const results = enabled.map((rule) =>
        calculate(rule, scoped(data, course.id), now),
      );
      const targets = results
        .filter((result) => result.value !== null)
        .map((result) =>
          Math.max(0, Math.min(100, (result.value / result.target) * 100)),
        );
      return {
        courseId: course.id,
        title: course.title,
        metrics: results.map(({ id, value, state, sampleSize }) => ({
          id,
          value,
          state,
          sampleSize,
        })),
        healthScore: mean(targets),
      };
    });
    res.json({
      rules: config.rules,
      catalog: metricCatalog,
      metrics,
      courseHealth,
      activity: timeSeries(data, days, now),
      assessments: assessmentSummary(data, days, now),
      updatedAt: new Date(now).toISOString(),
      configUpdatedAt: config.updatedAt,
      canEdit: req.user.role === "admin",
      healthScoreDescription:
        "Mean percentage of configured targets reached, capped at 100% per enabled metric. Metrics without data are excluded.",
      scope: {
        courseId,
        courseTitle:
          courseId === "all"
            ? "All courses"
            : data.courseMap.get(courseId).title,
        days,
        personal: !staff(req.user),
        timeZone: "UTC",
      },
    });
  });
}
