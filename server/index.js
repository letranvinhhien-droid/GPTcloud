import express from "express";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { createStore } from "./store.js";
import { seedStore } from "./seed.js";
import { installAccountRoutes } from "./auth.js";
import { installGameRoutes, publicGame, seedNativeGames } from "./games.js";
import { installMetricRoutes } from "./metrics.js";
import {
  HttpError,
  requireValue,
  text,
  number,
  initial,
  publicUser,
  uid,
  iso,
  gradeRow,
  validateCourse,
  validateQuiz,
} from "./domain.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (v) => createHash("sha256").update(v).digest("hex");
const average = (values) =>
  values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    : 0;
export function createApp({
  database = process.env.LMS_DB || resolve(root, ".data/lms.sqlite"),
  demo = process.env.LMS_DEMO === "true" ||
    (process.env.LMS_DEMO !== "false" && process.env.NODE_ENV !== "production"),
  seed = process.env.LMS_SEED !== "false",
} = {}) {
  const store = createStore(database);
  if (seed)
    store.transaction(() => {
      seedStore(store);
      if (store.get("users", "instructor") && !store.get("users", "admin"))
        store.put("users", {
          id: "admin",
          name: "Alex Morgan",
          email: "admin@meridian.example",
          role: "admin",
          createdAt: iso(),
        });
      seedNativeGames(store);
    });
  const app = express();
  app.disable("x-powered-by");
  app.use(
    express.json({
      limit: "1mb",
      verify(req, res, buffer) {
        req.rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      try {
        requireValue(
          new URL(req.headers.origin).host === req.headers.host,
          "Request origin is not allowed.",
          403,
        );
      } catch (e) {
        return next(
          e instanceof HttpError
            ? e
            : new HttpError(403, "Invalid request origin."),
        );
      }
    }
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("meridian_session="))
      ?.slice(17);
    const session = token ? store.get("sessions", hash(token)) : null;
    const sessionUser =
      session && session.expiresAt > Date.now()
        ? store.get("users", session.userId)
        : null;
    req.user =
      sessionUser && (demo || sessionUser.passwordHash) ? sessionUser : null;
    req.session = session;
    next();
  });
  const auth = (req, res, next) => {
    if (!req.user)
      return next(new HttpError(401, "Please sign in to continue."));
    next();
  };
  const instructor = (req, res, next) => {
    if (!["instructor", "admin"].includes(req.user?.role))
      return next(
        new HttpError(403, "This action requires an instructor account."),
      );
    next();
  };
  const courseById = (id) => {
    const c = store.get("courses", id);
    requireValue(c, "Course not found.", 404);
    return c;
  };
  const enrollmentFor = (courseId, userId) =>
    store.get("enrollments", `${courseId}:${userId}`);
  const courseRows = (c) =>
    store
      .all("enrollments")
      .filter((e) => e.courseId === c.id)
      .map((e) => gradeRow(e, store.get("users", e.userId), c));
  const learnerCompletion = (c, e) => {
    if (e.completed) return 100;
    const items = publishedItems(c);
    const done = store
      .all("completions")
      .filter(
        (x) =>
          x.courseId === c.id &&
          x.userId === e.userId &&
          items.some((i) => i.id === x.itemId),
      ).length;
    return items.length ? Math.round((done / items.length) * 100) : 0;
  };
  const publishedItems = (c) =>
    store
      .all("items")
      .filter(
        (i) =>
          i.courseId === c.id &&
          i.type !== "h5p" &&
          (i.type !== "quiz" || store.get("quizzes", i.quizId)?.published) &&
          (i.type !== "game" || store.get("games", i.gameId)?.published),
      );
  const presentCourse = (c, user) => {
    const enrolls = store.all("enrollments").filter((e) => e.courseId === c.id);
    const relevant =
      user?.role === "learner"
        ? enrolls.filter((e) => e.userId === user.id)
        : enrolls;
    return {
      ...c,
      studentCount: enrolls.length,
      completion: average(relevant.map((e) => learnerCompletion(c, e))),
      modulesCount: store.all("modules").filter((m) => m.courseId === c.id)
        .length,
    };
  };
  function eligibility(c, user, joining = false) {
    if (user.role !== "learner") return { allowed: true, reason: "" };
    if (c.status !== "published")
      return {
        allowed: false,
        reason: "This course is not currently published.",
      };
    const now = new Date().toISOString().slice(0, 10);
    if (c.startDate && c.startDate > now)
      return { allowed: false, reason: `This course opens on ${c.startDate}.` };
    if (c.endDate && c.endDate < now)
      return { allowed: false, reason: `This course ended on ${c.endDate}.` };
    const missing = c.prerequisites.filter(
      (id) => !enrollmentFor(id, user.id)?.completed,
    );
    if (missing.length)
      return {
        allowed: false,
        reason: `Complete ${missing.map((id) => courseById(id).title).join(", ")} first.`,
      };
    if (joining && c.enrollment === "invite")
      return {
        allowed: false,
        reason:
          "This course is invitation-only. Contact your instructor to enroll.",
      };
    return { allowed: true, reason: "" };
  }
  const accessCourse = (req, c, { enrolled = false, active = false } = {}) => {
    if (req.user.role !== "learner") return;
    requireValue(c.status === "published", "Course not found.", 404);
    if (enrolled)
      requireValue(
        enrollmentFor(c.id, req.user.id),
        "Enroll in this course to access its activities.",
        403,
      );
    if (active) {
      const e = eligibility(c, req.user);
      requireValue(e.allowed, e.reason, 403);
    }
  };
  const event = (type, message, courseId, userId) =>
    store.put("activities", {
      id: uid(),
      type,
      text: message,
      courseId,
      userId,
      createdAt: iso(),
    });
  const safeQuiz = (q, user) => ({
    ...q,
    questionCount: q.questions.length,
    questions: q.questions.map((question) => {
      if (user.role !== "learner") return question;
      const { answer, ...safe } = question;
      return safe;
    }),
  });
  function analytics(user) {
    const isInstructor = user.role !== "learner";
    const enrollments = store
      .all("enrollments")
      .filter((e) => isInstructor || e.userId === user.id);
    const courses = store
      .all("courses")
      .filter(
        (c) => isInstructor || enrollments.some((e) => e.courseId === c.id),
      );
    const rows = courses.flatMap((c) =>
      enrollments
        .filter((e) => e.courseId === c.id)
        .map((e) => gradeRow(e, store.get("users", e.userId), c)),
    );
    const activities = store
      .all("activities")
      .filter((a) => isInstructor || a.userId === user.id);
    const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - 6 + i);
      const key = date.toISOString().slice(0, 10);
      const events = activities.filter((a) => a.createdAt.startsWith(key));
      return {
        day: date.toLocaleDateString("en-US", {
          weekday: "short",
          timeZone: "UTC",
        }),
        active: new Set(events.map((a) => a.userId)).size,
        completed: events.filter((a) =>
          ["completed", "completion", "submission", "quiz"].includes(a.type),
        ).length,
      };
    });
    return {
      totalLearners: new Set(enrollments.map((e) => e.userId)).size,
      activeCourses: courses.filter((c) => c.status === "published").length,
      completionRate: enrollments.length
        ? Math.round(
            (enrollments.filter((e) => e.completed).length /
              enrollments.length) *
              100,
          )
        : 0,
      averageGrade: average(
        rows.filter((r) => r.total !== null).map((r) => r.total),
      ),
      weeklyActivity,
      coursePerformance: courses.map((c) => {
        const enrolled = enrollments.filter((e) => e.courseId === c.id);
        const cr = rows.filter((r) =>
          enrolled.some((e) => e.userId === r.userId && e.courseId === c.id),
        );
        return {
          courseId: c.id,
          title: c.title,
          learners: enrolled.length,
          completion: average(enrolled.map((e) => learnerCompletion(c, e))),
          averageGrade: average(
            enrolled
              .map((e) => gradeRow(e, store.get("users", e.userId), c).total)
              .filter((x) => x !== null),
          ),
        };
      }),
      gradeDistribution: ["A", "B", "C", "D", "F"].map((label) => ({
        label,
        count: rows.filter((r) => r.letter === label).length,
      })),
    };
  }
  function learners() {
    return store
      .all("users")
      .filter((u) => u.role === "learner")
      .map((u) => {
        const en = store.all("enrollments").filter((e) => e.userId === u.id);
        const rows = en.map((e) => gradeRow(e, u, courseById(e.courseId)));
        const events = store
          .all("activities")
          .filter((a) => a.userId === u.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return {
          ...publicUser(u),
          enrollments: en.length,
          averageGrade: average(
            rows.map((r) => r.total).filter((v) => v !== null),
          ),
          status:
            events[0] &&
            Date.parse(events[0].createdAt) > Date.now() - 7 * 864e5
              ? "active"
              : "inactive",
          lastActive: events[0]?.createdAt || u.createdAt || iso(),
        };
      });
  }
  installAccountRoutes(app, { store, demo, auth });
  installGameRoutes(app, {
    store,
    auth,
    instructor,
    courseById,
    accessCourse,
    event,
    applyQuizGrade,
    refreshCourseCompletion,
  });
  installMetricRoutes(app, { store, auth, courseById });
  app.get("/api/health", (req, res) =>
    res.json({ ok: true, service: "meridian-lms" }),
  );
  app.get("/api/bootstrap", (req, res) => {
    if (!req.user)
      return res.json({
        user: null,
        courses: [],
        learners: [],
        activities: [],
        tasks: [],
        analytics: null,
      });
    const user = req.user;
    const courses = store
      .all("courses")
      .filter((c) => user.role !== "learner" || c.status === "published");
    const activities = store
      .all("activities")
      .filter((a) => user.role !== "learner" || a.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map((a) => ({
        ...a,
        courseTitle:
          store.get("courses", a.courseId)?.title || "Your workspace",
        userName: store.get("users", a.userId)?.name || "Meridian",
      }));
    const pending = store
      .all("attempts")
      .filter(
        (a) =>
          a.submittedAt &&
          a.pendingReview &&
          (user.role !== "learner" || a.userId === user.id),
      );
    const tasks = pending.map((a) => ({
      id: a.id,
      title: `Review ${a.quizSnapshot.title}`,
      courseId: a.courseId,
      courseTitle: courseById(a.courseId).title,
      type: "grading",
      dueDate: a.submittedAt,
      count: 1,
    }));
    for (const c of courses.filter((c) => c.status === "draft"))
      tasks.push({
        id: c.id,
        title: `Publish ${c.title}`,
        courseId: c.id,
        courseTitle: c.title,
        type: "course",
        dueDate: c.startDate || iso(),
        count: 1,
      });
    for (const q of store
      .all("quizzes")
      .filter((q) => q.published && courses.some((c) => c.id === q.courseId))
      .slice(0, 3)) {
      const c = courseById(q.courseId);
      tasks.push({
        id: q.id,
        title: q.title,
        courseId: c.id,
        courseTitle: c.title,
        type: "quiz",
        dueDate: c.endDate || iso(),
        count: store
          .all("attempts")
          .filter((a) => a.quizId === q.id && a.submittedAt).length,
      });
    }
    res.json({
      user: publicUser(user),
      courses: courses.map((c) => presentCourse(c, user)),
      learners:
        user.role !== "learner"
          ? learners()
          : learners().filter((u) => u.id === user.id),
      activities,
      tasks: tasks.slice(0, 6),
      analytics: analytics(user),
    });
  });
  app.use("/api", auth);
  app.get("/api/analytics", (req, res) =>
    res.json({ analytics: analytics(req.user) }),
  );
  app.patch("/api/profile", (req, res) => {
    const user = { ...req.user, name: text(req.body.name, "Name", 100) };
    store.put("users", user);
    res.json({ user: publicUser(user) });
  });
  app.post("/api/courses", instructor, (req, res) => {
    const data = validateCourse(req.body, {}, store);
    requireValue(
      !store
        .all("courses")
        .some((c) => c.code.toLowerCase() === data.code.toLowerCase()),
      "A course with that code already exists.",
    );
    const c = store.put("courses", { ...data, id: uid(), createdAt: iso() });
    event("course", `Created ${c.title}`, c.id, req.user.id);
    res.status(201).json({ course: presentCourse(c, req.user) });
  });
  app.patch("/api/courses/:id", instructor, (req, res) => {
    const c = courseById(req.params.id);
    const next = validateCourse(req.body, c, store);
    requireValue(
      !store
        .all("courses")
        .some(
          (x) =>
            x.id !== c.id && x.code.toLowerCase() === next.code.toLowerCase(),
        ),
      "A course with that code already exists.",
    );
    store.put("courses", next);
    refreshCourseCompletion(next);
    event("course", `Updated ${next.title}`, c.id, req.user.id);
    res.json({ course: presentCourse(next, req.user) });
  });
  app.get("/api/courses/:id", (req, res) => {
    const c = courseById(req.params.id);
    accessCourse(req, c);
    const enrollment = enrollmentFor(c.id, req.user.id);
    const eligible = eligibility(c, req.user, !enrollment);
    const canRead =
      req.user.role !== "learner" || (enrollment && eligible.allowed);
    const completions = store
      .all("completions")
      .filter((x) => x.userId === req.user.id);
    const quizzes = store
      .all("quizzes")
      .filter(
        (q) =>
          q.courseId === c.id && (req.user.role !== "learner" || q.published),
      );
    const games = store
      .all("games")
      .filter(
        (g) =>
          g.courseId === c.id && (req.user.role !== "learner" || g.published),
      );
    const modules = store
      .all("modules")
      .filter((m) => m.courseId === c.id)
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        ...m,
        items: store
          .all("items")
          .filter(
            (i) =>
              i.moduleId === m.id &&
              i.type !== "h5p" &&
              (i.type !== "quiz" || quizzes.some((q) => q.id === i.quizId)) &&
              (i.type !== "game" || games.some((g) => g.id === i.gameId)),
          )
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            ...i,
            content: canRead ? i.content : "",
            url: canRead ? i.url : "",
            completed: completions.some((x) => x.itemId === i.id),
            submission:
              i.type === "assignment"
                ? store
                    .all("attempts")
                    .filter(
                      (a) =>
                        a.type === "assignment" &&
                        a.itemId === i.id &&
                        a.userId === req.user.id,
                    )
                    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
                    .map((a) => ({
                      id: a.id,
                      content: a.answers.response,
                      score: a.score,
                      maxScore: a.maxScore,
                      pendingReview: a.pendingReview,
                      submittedAt: a.submittedAt,
                    }))[0] || null
                : undefined,
          })),
      }));
    res.json({
      course: presentCourse(c, req.user),
      modules,
      quizzes: canRead ? quizzes.map((q) => safeQuiz(q, req.user)) : [],
      games: canRead ? games.map((g) => publicGame(g, req.user)) : [],
      enrollment,
      eligibility: eligible,
    });
  });
  app.post("/api/courses/:id/modules", instructor, (req, res) => {
    courseById(req.params.id);
    const module = store.put("modules", {
      id: uid(),
      courseId: req.params.id,
      title: text(req.body.title, "Module title", 180),
      position: store.all("modules").filter((m) => m.courseId === req.params.id)
        .length,
    });
    res.status(201).json({ module: { ...module, items: [] } });
  });
  app.post(
    "/api/courses/:id/modules/:moduleId/items",
    instructor,
    (req, res) => {
      const c = courseById(req.params.id);
      const m = store.get("modules", req.params.moduleId);
      requireValue(m?.courseId === c.id, "Module not found.", 404);
      const type = req.body.type;
      requireValue(
        ["lesson", "quiz", "game", "assignment"].includes(type),
        "Unsupported activity type.",
      );
      let url = "",
        quizId = "";
      let gameId = "";
      if (type === "game") {
        const game = store.get("games", req.body.gameId);
        requireValue(
          game?.courseId === c.id,
          "Select a game from this course.",
        );
        gameId = game.id;
      }
      if (type === "quiz") {
        const q = store.get("quizzes", req.body.quizId);
        requireValue(q?.courseId === c.id, "Select a quiz from this course.");
        quizId = q.id;
      }
      const item = store.put("items", {
        id: uid(),
        courseId: c.id,
        moduleId: m.id,
        title: text(req.body.title, "Activity title", 180),
        type,
        content: String(req.body.content || "").slice(0, 50000),
        url,
        quizId,
        gameId,
        position: store.all("items").filter((i) => i.moduleId === m.id).length,
      });
      synchronizeAssessmentItem(c, item);
      refreshCourseCompletion(c);
      res.status(201).json({ item });
    },
  );
  app.patch("/api/courses/:id/modules/:moduleId", instructor, (req, res) => {
    courseById(req.params.id);
    const module = store.get("modules", req.params.moduleId);
    requireValue(module?.courseId === req.params.id, "Module not found.", 404);
    module.title = text(req.body.title, "Module title", 180);
    store.put("modules", module);
    res.json({ module });
  });
  app.patch(
    "/api/courses/:id/modules/:moduleId/items/:itemId",
    instructor,
    (req, res) => {
      courseById(req.params.id);
      const item = store.get("items", req.params.itemId);
      requireValue(
        item?.courseId === req.params.id &&
          item?.moduleId === req.params.moduleId,
        "Activity not found.",
        404,
      );
      requireValue(
        !req.body.type || req.body.type === item.type,
        "Create a new activity to change its type.",
      );
      item.title = text(req.body.title, "Activity title", 180);
      if (item.type === "game") {
        const game = store.get("games", req.body.gameId);
        requireValue(
          game?.courseId === req.params.id,
          "Select a game from this course.",
        );
        item.gameId = game.id;
      }
      if (item.type === "lesson" || item.type === "assignment")
        item.content = text(req.body.content, "Activity content", 50000);
      if (item.type === "quiz") {
        const quiz = store.get("quizzes", req.body.quizId);
        requireValue(
          quiz?.courseId === req.params.id,
          "Select a quiz from this course.",
        );
        item.quizId = quiz.id;
      }
      store.transaction(() => {
        store.put("items", item);
        synchronizeAssessmentItem(courseById(item.courseId), item);
        refreshCourseCompletion(courseById(item.courseId));
      });
      res.json({ item });
    },
  );
  app.delete(
    "/api/courses/:id/modules/:moduleId/items/:itemId",
    instructor,
    (req, res) => {
      courseById(req.params.id);
      const i = store.get("items", req.params.itemId);
      requireValue(
        i?.courseId === req.params.id && i?.moduleId === req.params.moduleId,
        "Activity not found.",
        404,
      );
      store.transaction(() => {
        store.remove("items", i.id);
        for (const done of store
          .all("completions")
          .filter((x) => x.itemId === i.id))
          store.remove("completions", done.id);
        refreshCourseCompletion(courseById(i.courseId));
      });
      res.json({ ok: true });
    },
  );
  app.post("/api/courses/:id/enroll", (req, res) => {
    const c = courseById(req.params.id);
    requireValue(
      req.user.role === "learner",
      "Switch to learner view to enroll.",
    );
    const existing = enrollmentFor(c.id, req.user.id);
    if (existing) return res.json({ enrollment: existing });
    const e = eligibility(c, req.user, true);
    requireValue(e.allowed, e.reason, 403);
    const enrollment = store.put("enrollments", {
      id: `${c.id}:${req.user.id}`,
      courseId: c.id,
      userId: req.user.id,
      completed: false,
      grades: { quizzes: null, assignments: null, participation: null },
      createdAt: iso(),
    });
    event("enrollment", `Enrolled in ${c.title}`, c.id, req.user.id);
    res.status(201).json({ enrollment });
  });
  app.post("/api/courses/:id/enrollments", instructor, (req, res) => {
    const c = courseById(req.params.id);
    const learner = store.get("users", req.body.userId);
    requireValue(learner?.role === "learner", "Choose a valid learner.", 400);
    const existing = enrollmentFor(c.id, learner.id);
    if (existing)
      return res.json({ enrollment: existing, alreadyEnrolled: true });
    const missing = c.prerequisites.filter(
      (id) => !enrollmentFor(id, learner.id)?.completed,
    );
    requireValue(
      !missing.length,
      `Complete ${missing.map((id) => courseById(id).title).join(", ")} first.`,
      403,
    );
    const enrollment = store.put("enrollments", {
      id: `${c.id}:${learner.id}`,
      courseId: c.id,
      userId: learner.id,
      completed: false,
      grades: { quizzes: null, assignments: null, participation: null },
      createdAt: iso(),
    });
    event(
      "enrollment",
      `Enrolled ${learner.name} in ${c.title}`,
      c.id,
      learner.id,
    );
    res.status(201).json({ enrollment });
  });
  app.post("/api/courses/:id/items/:itemId/view", (req, res) => {
    const c = courseById(req.params.id);
    requireValue(
      req.user.role === "learner",
      "Only learners record learning activity.",
      403,
    );
    accessCourse(req, c, { enrolled: true, active: true });
    const item = store.get("items", req.params.itemId);
    requireValue(
      item?.courseId === c.id && ["lesson", "assignment"].includes(item.type),
      "Learning activity not found.",
      404,
    );
    const today = iso().slice(0, 10);
    const id = `view:${item.id}:${req.user.id}:${today}`;
    if (!store.get("activities", id))
      store.put("activities", {
        id,
        type: "lesson_view",
        text: `Viewed ${item.title}`,
        courseId: c.id,
        itemId: item.id,
        userId: req.user.id,
        createdAt: iso(),
      });
    res.json({ ok: true });
  });
  app.post("/api/courses/:id/items/:itemId/complete", (req, res) => {
    const c = courseById(req.params.id);
    requireValue(
      req.user.role === "learner",
      "Switch to learner view to complete activities.",
    );
    accessCourse(req, c, { enrolled: true, active: true });
    const item = store.get("items", req.params.itemId);
    requireValue(item?.courseId === c.id, "Activity not found.", 404);
    requireValue(item.type !== "h5p", "This activity has been retired.", 410);
    if (item.type === "game") {
      const game = store.get("games", item.gameId);
      requireValue(
        game?.published &&
          store
            .all("attempts")
            .some(
              (a) =>
                a.type === "game" &&
                a.gameId === game.id &&
                a.userId === req.user.id &&
                a.submittedAt &&
                !a.pendingReview &&
                a.percentage >= a.quizSnapshot.passingScore,
            ),
        "Pass this game before marking it complete.",
      );
    }
    if (item.type === "assignment") {
      const reviewed = store
        .all("attempts")
        .some(
          (a) =>
            a.type === "assignment" &&
            a.itemId === item.id &&
            a.userId === req.user.id &&
            !a.pendingReview &&
            a.percentage >= c.passingScore,
        );
      requireValue(
        reviewed,
        "Your instructor must grade this assignment with a passing score first.",
      );
    }
    if (item.type === "quiz") {
      const q = store.get("quizzes", item.quizId);
      requireValue(q?.published, "Quiz not found.", 404);
      const passed = store
        .all("attempts")
        .some(
          (a) =>
            a.userId === req.user.id &&
            a.quizId === q?.id &&
            a.submittedAt &&
            !a.pendingReview &&
            a.percentage >= a.quizSnapshot.passingScore,
        );
      requireValue(passed, "Pass this quiz before marking it complete.");
    }
    if (recordCompletion(c.id, item.id, req.user.id))
      event("completed", `Completed ${item.title}`, c.id, req.user.id);
    updateCompletion(c, req.user.id);
    res.json({ ok: true });
  });

  app.post("/api/courses/:id/items/:itemId/submit", (req, res) => {
    const c = courseById(req.params.id);
    requireValue(
      req.user.role === "learner",
      "Switch to learner view to submit assignments.",
    );
    accessCourse(req, c, { enrolled: true, active: true });
    const item = store.get("items", req.params.itemId);
    requireValue(
      item?.courseId === c.id && item.type === "assignment",
      "Assignment not found.",
      404,
    );
    const content = text(req.body.content, "Assignment response", 50000);
    const pending = store
      .all("attempts")
      .find(
        (a) =>
          a.type === "assignment" &&
          a.itemId === item.id &&
          a.userId === req.user.id &&
          a.pendingReview,
      );
    const submission = store.put("attempts", {
      id: pending?.id || uid(),
      type: "assignment",
      itemId: item.id,
      quizId: item.id,
      courseId: c.id,
      userId: req.user.id,
      quizSnapshot: {
        title: item.title,
        passingScore: c.passingScore,
        questions: [
          {
            id: "response",
            type: "essay",
            prompt: item.content || item.title,
            points: 100,
          },
        ],
      },
      answers: { response: content },
      score: 0,
      maxScore: 100,
      percentage: 0,
      pendingReview: true,
      submittedAt: iso(),
    });
    event("submission", `Submitted ${item.title}`, c.id, req.user.id);
    res
      .status(201)
      .json({ submission: { id: submission.id, pendingReview: true } });
  });
  function applyAssignmentGrade(attempt) {
    const c = courseById(attempt.courseId);
    const enrollment = enrollmentFor(c.id, attempt.userId);
    const graded = store
      .all("attempts")
      .filter(
        (a) =>
          a.type === "assignment" &&
          a.courseId === c.id &&
          a.userId === attempt.userId &&
          a.submittedAt &&
          !a.pendingReview,
      )
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    const scores = new Map();
    for (const a of graded) scores.set(a.itemId, a.percentage);
    enrollment.grades.assignments = average([...scores.values()]);
    store.put("enrollments", enrollment);
    if (attempt.percentage >= c.passingScore)
      recordCompletion(c.id, attempt.itemId, attempt.userId);
    updateCompletion(c, attempt.userId);
  }
  function recordCompletion(courseId, itemId, userId) {
    const id = `${itemId}:${userId}`;
    if (store.get("completions", id)) return false;
    store.put("completions", {
      id,
      courseId,
      itemId,
      userId,
      createdAt: iso(),
    });
    return true;
  }
  function synchronizeAssessmentItem(c, item) {
    if (!["quiz", "game"].includes(item.type)) return;
    const passed = new Set(
      store
        .all("attempts")
        .filter(
          (a) =>
            a.courseId === c.id &&
            a.submittedAt &&
            !a.pendingReview &&
            a.percentage >= a.quizSnapshot?.passingScore &&
            (item.type === "game"
              ? a.type === "game" && a.gameId === item.gameId
              : (!a.type || a.type === "quiz") && a.quizId === item.quizId),
        )
        .map((a) => a.userId),
    );
    for (const completion of store
      .all("completions")
      .filter((x) => x.itemId === item.id))
      if (!passed.has(completion.userId))
        store.remove("completions", completion.id);
    for (const userId of passed)
      if (enrollmentFor(c.id, userId)) recordCompletion(c.id, item.id, userId);
  }
  function refreshCourseCompletion(c) {
    for (const enrollment of store
      .all("enrollments")
      .filter((e) => e.courseId === c.id))
      updateCompletion(c, enrollment.userId);
  }
  function updateCompletion(c, userId) {
    const e = enrollmentFor(c.id, userId);
    // Retain explicit staff overrides and historical completed records.
    if (!e || (e.completed && e.completionSource !== "automatic")) return;
    const items = publishedItems(c);
    const done = store
      .all("completions")
      .filter(
        (x) =>
          x.courseId === c.id &&
          x.userId === userId &&
          items.some((i) => i.id === x.itemId),
      ).length;
    const row = gradeRow(e, store.get("users", userId), c);
    const completed = Boolean(
      items.length &&
      done >= items.length &&
      row.total !== null &&
      row.total >= c.passingScore,
    );
    if (
      e.completed !== completed ||
      (completed && e.completionSource !== "automatic")
    ) {
      e.completed = completed;
      e.completionSource = "automatic";
      store.put("enrollments", e);
    }
  }
  app.post("/api/courses/:id/quizzes", instructor, (req, res) => {
    courseById(req.params.id);
    const quiz = store.put("quizzes", {
      ...validateQuiz(req.body),
      id: uid(),
      courseId: req.params.id,
      createdAt: iso(),
    });
    res.status(201).json({ quiz: safeQuiz(quiz, req.user) });
  });
  app.patch("/api/courses/:id/quizzes/:quizId", instructor, (req, res) => {
    courseById(req.params.id);
    const q = store.get("quizzes", req.params.quizId);
    requireValue(q?.courseId === req.params.id, "Quiz not found.", 404);
    const quiz = store.put("quizzes", validateQuiz(req.body, q));
    refreshCourseCompletion(courseById(req.params.id));
    res.json({ quiz: safeQuiz(quiz, req.user) });
  });
  app.post("/api/courses/:id/quizzes/:quizId/start", (req, res) => {
    const c = courseById(req.params.id);
    requireValue(
      req.user.role === "learner",
      "Switch to learner view to take quizzes.",
    );
    accessCourse(req, c, { enrolled: true, active: true });
    const quiz = store.get("quizzes", req.params.quizId);
    requireValue(
      quiz?.courseId === c.id && quiz.published,
      "Quiz not found.",
      404,
    );
    const previous = store
      .all("attempts")
      .filter((a) => a.quizId === quiz.id && a.userId === req.user.id);
    const active = previous.find(
      (a) =>
        !a.submittedAt && (!a.deadline || Date.parse(a.deadline) > Date.now()),
    );
    if (active)
      return res.json({
        attemptId: active.id,
        startedAt: active.startedAt,
        deadline: active.deadline,
        quiz: safeQuiz(active.quizSnapshot, req.user),
      });
    requireValue(
      previous.length < quiz.attempts,
      "You have used all available attempts.",
      409,
    );
    const startedAt = iso();
    const attempt = store.put("attempts", {
      id: uid(),
      courseId: c.id,
      quizId: quiz.id,
      userId: req.user.id,
      startedAt,
      deadline: quiz.timeLimit
        ? new Date(Date.now() + quiz.timeLimit * 60000).toISOString()
        : null,
      quizSnapshot: quiz,
    });
    event("quiz_started", `Started ${quiz.title}`, c.id, req.user.id);
    res.status(201).json({
      attemptId: attempt.id,
      startedAt,
      deadline: attempt.deadline,
      quiz: safeQuiz(quiz, req.user),
    });
  });
  function applyQuizGrade(attempt) {
    const c = courseById(attempt.courseId);
    const enrollment = enrollmentFor(c.id, attempt.userId);
    const submissions = store
      .all("attempts")
      .filter(
        (a) =>
          (!a.type || a.type === "quiz" || a.type === "game") &&
          a.courseId === c.id &&
          a.userId === attempt.userId &&
          a.submittedAt &&
          !a.pendingReview,
      );
    const best = new Map();
    for (const a of submissions)
      best.set(a.quizId, Math.max(best.get(a.quizId) || 0, a.percentage));
    enrollment.grades.quizzes = average([...best.values()]);
    store.put("enrollments", enrollment);
    for (const item of store
      .all("items")
      .filter(
        (i) =>
          i.courseId === c.id &&
          (i.quizId === attempt.quizId ||
            (attempt.type === "game" && i.gameId === attempt.gameId)),
      ))
      synchronizeAssessmentItem(c, item);
    updateCompletion(c, attempt.userId);
  }
  app.post("/api/courses/:id/quizzes/:quizId/submit", (req, res) => {
    const c = courseById(req.params.id);
    requireValue(
      req.user.role === "learner",
      "Switch to learner view to submit quizzes.",
    );
    accessCourse(req, c, { enrolled: true, active: true });
    const attempt = store.get("attempts", req.body.attemptId);
    requireValue(
      attempt?.type !== "game" &&
        attempt?.userId === req.user.id &&
        attempt?.quizId === req.params.quizId &&
        attempt?.courseId === c.id,
      "Start a quiz attempt before submitting.",
      404,
    );
    requireValue(
      !attempt.submittedAt,
      "This attempt has already been submitted.",
      409,
    );
    requireValue(
      !attempt.deadline || Date.now() <= Date.parse(attempt.deadline) + 5000,
      "The quiz time limit has expired.",
      409,
    );
    const answers = req.body.answers;
    requireValue(
      answers && typeof answers === "object" && !Array.isArray(answers),
      "Answers must be an object.",
    );
    const questions = attempt.quizSnapshot.questions;
    const safeAnswers = {};
    let score = 0;
    let maxScore = 0;
    let pendingReview = false;
    for (const q of questions) {
      let answer = answers[q.id] ?? "";
      requireValue(
        ["string", "number", "boolean"].includes(typeof answer),
        "Invalid answer value.",
      );
      answer = String(answer).slice(0, 20000);
      safeAnswers[q.id] = answer;
      maxScore += q.points;
      if (q.type === "essay") {
        pendingReview = true;
        continue;
      }
      if (answer.trim().toLowerCase() === String(q.answer).trim().toLowerCase())
        score += q.points;
    }
    const percentage = Math.round((score / maxScore) * 1000) / 10;
    Object.assign(attempt, {
      answers: safeAnswers,
      score,
      maxScore,
      percentage,
      pendingReview,
      submittedAt: iso(),
      durationSeconds: Math.max(
        0,
        Math.round((Date.now() - Date.parse(attempt.startedAt)) / 1000),
      ),
    });
    store.transaction(() => {
      store.put("attempts", attempt);
      if (!pendingReview) applyQuizGrade(attempt);
      event(
        "submission",
        `Submitted ${attempt.quizSnapshot.title}`,
        c.id,
        req.user.id,
      );
    });
    res.json({
      score,
      maxScore,
      percentage,
      passed: !pendingReview && percentage >= attempt.quizSnapshot.passingScore,
      pendingReview,
    });
  });
  app.get("/api/courses/:id/gradebook", (req, res) => {
    const c = courseById(req.params.id);
    accessCourse(req, c, { enrolled: true });
    const isInstructor = req.user.role !== "learner";
    const rows = courseRows(c).filter(
      (r) => isInstructor || r.userId === req.user.id,
    );
    const submissions = store
      .all("attempts")
      .filter(
        (a) =>
          a.courseId === c.id &&
          a.submittedAt &&
          (isInstructor || a.userId === req.user.id),
      )
      .map((a) => ({
        id: a.id,
        type: a.type || "quiz",
        userId: a.userId,
        userName: store.get("users", a.userId)?.name,
        quizId: a.quizId,
        quizTitle: a.quizSnapshot.title,
        answers: a.answers,
        questions: safeQuiz(a.quizSnapshot, req.user).questions,
        score: a.score,
        maxScore: a.maxScore,
        pendingReview: a.pendingReview,
        submittedAt: a.submittedAt,
      }));
    res.json({ course: presentCourse(c, req.user), rows, submissions });
  });
  app.patch("/api/courses/:id/grades/:userId", instructor, (req, res) => {
    const c = courseById(req.params.id);
    const e = enrollmentFor(c.id, req.params.userId);
    requireValue(e, "Learner is not enrolled in this course.", 404);
    for (const key of ["quizzes", "assignments", "participation"])
      if (Object.hasOwn(req.body, key))
        e.grades[key] =
          req.body[key] === null ? null : number(req.body[key], `${key} grade`);
    if (Object.hasOwn(req.body, "completed")) {
      requireValue(
        typeof req.body.completed === "boolean",
        "Completion must be true or false.",
      );
      e.completed = req.body.completed;
      e.completionSource = "manual";
    }
    store.put("enrollments", e);
    if (!Object.hasOwn(req.body, "completed")) updateCompletion(c, e.userId);
    event(
      "grading",
      `Updated grades for ${store.get("users", e.userId).name}`,
      c.id,
      req.user.id,
    );
    res.json({
      row: gradeRow(
        enrollmentFor(c.id, e.userId),
        store.get("users", e.userId),
        c,
      ),
    });
  });
  app.patch(
    "/api/courses/:id/submissions/:submissionId",
    instructor,
    (req, res) => {
      const c = courseById(req.params.id);
      const a = store.get("attempts", req.params.submissionId);
      requireValue(
        a?.courseId === c.id && a.submittedAt,
        "Submission not found.",
        404,
      );
      requireValue(
        a.type !== "game",
        "Game scores are calculated automatically. Use the gradebook category override to adjust a learner’s grade.",
        400,
      );
      a.score = number(req.body.score, "Submission score", 0, a.maxScore);
      a.percentage = Math.round((a.score / a.maxScore) * 1000) / 10;
      a.pendingReview = false;
      a.reviewedAt = iso();
      store.transaction(() => {
        store.put("attempts", a);
        if (a.type === "assignment") applyAssignmentGrade(a);
        else applyQuizGrade(a);
        event("grading", `Graded ${a.quizSnapshot.title}`, c.id, req.user.id);
      });
      res.json({ ok: true });
    },
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API endpoint not found." }),
  );
  app.use((err, req, res, next) => {
    if (!req.path.startsWith("/api")) return next(err);
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({
      error: err.status ? err.message : "An unexpected server error occurred.",
    });
  });
  return { app, store };
}
export async function startServer(options = {}) {
  const { app, store } = createApp(options);
  const server = createServer(app);
  let vite;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      root,
      server: { middlewareMode: true, allowedHosts: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(resolve(root, "dist")));
    app.use((req, res) => {
      if (existsSync(resolve(root, "dist/index.html")))
        res.sendFile(resolve(root, "dist/index.html"));
      else
        res
          .status(503)
          .send(
            "Build the frontend with npm run build before starting in production.",
          );
    });
  }
  const port = Number(process.env.PORT || 3000);
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  console.log(`Meridian LMS listening on port ${port}`);
  return { server, store, vite };
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
