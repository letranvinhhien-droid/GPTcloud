import { randomInt } from "node:crypto";
import { requireValue, text, number, uid, iso } from "./domain.js";

const isStaff = (user) => ["instructor", "admin"].includes(user?.role);
const fields = [
  "id",
  "courseId",
  "title",
  "description",
  "type",
  "published",
  "timeLimit",
  "attempts",
  "passingScore",
  "createdAt",
  "updatedAt",
];
function object(value, message) {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    message,
  );
}
function identifier(value) {
  if (value === undefined) return uid();
  requireValue(
    typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value),
    "Use a valid game item identifier.",
  );
  return value;
}
function unique(values, message) {
  requireValue(new Set(values).size === values.length, message);
}
function shuffle(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function validateGame(body, current = {}) {
  object(body, "Game details must be a JSON object.");
  const merged = { ...current, ...body };
  requireValue(
    ["matching", "sequence"].includes(merged.type),
    "Choose matching or sequence as the game type.",
  );
  requireValue(
    merged.published === undefined || typeof merged.published === "boolean",
    "Publication must be true or false.",
  );
  const game = {
    ...Object.fromEntries(
      fields
        .filter((key) => Object.hasOwn(current, key))
        .map((key) => [key, current[key]]),
    ),
    title: text(merged.title, "Game title", 180),
    description: String(merged.description || "").slice(0, 5000),
    type: merged.type,
    published: merged.published ?? false,
    timeLimit: number(merged.timeLimit ?? 10, "Time limit", 0, 60),
    attempts: number(merged.attempts ?? 3, "Attempts", 1, 20),
    passingScore: number(merged.passingScore ?? 70, "Passing score", 0, 100),
  };
  requireValue(
    Number.isInteger(game.timeLimit),
    "Time limit must be a whole number of minutes.",
  );
  requireValue(
    Number.isInteger(game.attempts),
    "Attempts must be a whole number.",
  );
  if (game.type === "matching") {
    requireValue(
      Array.isArray(merged.pairs) &&
        merged.pairs.length >= 2 &&
        merged.pairs.length <= 12,
      "Matching games need between 2 and 12 pairs.",
    );
    game.pairs = merged.pairs.map((pair) => {
      object(pair, "Each matching pair must be an object.");
      return {
        id: identifier(pair.id),
        prompt: text(pair.prompt, "Matching prompt", 1000),
        answer: text(pair.answer, "Matching answer", 1000),
      };
    });
    unique(
      game.pairs.map((pair) => pair.id),
      "Pair identifiers must be unique.",
    );
    unique(
      game.pairs.map((pair) => pair.prompt.toLowerCase()),
      "Matching prompts must be unique.",
    );
    unique(
      game.pairs.map((pair) => pair.answer.toLowerCase()),
      "Matching answers must be unique.",
    );
  } else {
    requireValue(
      Array.isArray(merged.sequence) &&
        merged.sequence.length >= 2 &&
        merged.sequence.length <= 12,
      "Sequence games need between 2 and 12 steps.",
    );
    game.sequence = merged.sequence.map((step) => {
      object(step, "Each sequence step must be an object.");
      return {
        id: identifier(step.id),
        text: text(step.text, "Sequence step", 1000),
      };
    });
    unique(
      game.sequence.map((step) => step.id),
      "Step identifiers must be unique.",
    );
    unique(
      game.sequence.map((step) => step.text.toLowerCase()),
      "Sequence steps must be unique.",
    );
  }
  return game;
}

export function publicGame(game, user) {
  const safe = Object.fromEntries(
    fields
      .filter((key) => Object.hasOwn(game, key))
      .map((key) => [key, game[key]]),
  );
  safe.itemCount =
    game.type === "matching" ? game.pairs.length : game.sequence.length;
  if (isStaff(user)) {
    if (game.type === "matching") safe.pairs = game.pairs;
    else safe.sequence = game.sequence;
  }
  return safe;
}

function makeAttempt(game, userId) {
  const startedAt = iso();
  const display = publicGame(game, { role: "learner" });
  const questions = [];
  let solution;
  if (game.type === "matching") {
    const rows = game.pairs.map((pair) => ({
      promptId: uid(),
      choiceId: uid(),
      prompt: pair.prompt,
      answer: pair.answer,
    }));
    display.prompts = shuffle(
      rows.map((row) => ({ id: row.promptId, text: row.prompt })),
    );
    display.choices = shuffle(
      rows.map((row) => ({ id: row.choiceId, text: row.answer })),
    );
    solution = Object.fromEntries(
      rows.map((row) => [row.promptId, row.choiceId]),
    );
    questions.push(
      ...display.prompts.map((prompt) => ({
        id: prompt.id,
        type: "short-answer",
        prompt: prompt.text,
        answer: rows.find((row) => row.promptId === prompt.id).answer,
        points: 1,
      })),
    );
  } else {
    const ordered = game.sequence.map((step) => ({
      id: uid(),
      text: step.text,
    }));
    display.items = shuffle(ordered);
    solution = ordered.map((item) => item.id);
    questions.push(
      ...ordered.map((item, index) => ({
        id: `position-${index + 1}`,
        type: "short-answer",
        prompt: `Position ${index + 1}`,
        answer: item.text,
        points: 1,
      })),
    );
  }
  return {
    id: uid(),
    type: "game",
    courseId: game.courseId,
    gameId: game.id,
    quizId: game.id,
    userId,
    startedAt,
    deadline: game.timeLimit
      ? new Date(Date.now() + game.timeLimit * 60000).toISOString()
      : null,
    gameSnapshot: game,
    gameDisplay: display,
    gameSolution: solution,
    quizSnapshot: {
      id: game.id,
      title: game.title,
      passingScore: game.passingScore,
      questions,
    },
  };
}
function presentAttempt(attempt) {
  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    game: attempt.gameDisplay,
  };
}
function evaluate(attempt, answers) {
  const display = attempt.gameDisplay;
  const readable = {};
  const feedback = [];
  let score = 0;
  if (display.type === "matching") {
    object(
      answers,
      "Matching answers must be an object of prompt and choice identifiers.",
    );
    const prompts = new Set(display.prompts.map((prompt) => prompt.id));
    const choices = new Map(
      display.choices.map((choice) => [choice.id, choice.text]),
    );
    const supplied = [];
    for (const [promptId, choiceId] of Object.entries(answers)) {
      requireValue(
        prompts.has(promptId),
        "An answer references an unknown prompt.",
      );
      requireValue(
        typeof choiceId === "string" &&
          (choiceId === "" || choices.has(choiceId)),
        "An answer references an unknown choice.",
      );
      if (choiceId) supplied.push(choiceId);
    }
    unique(supplied, "Use each matching choice at most once.");
    for (const prompt of display.prompts) {
      const selected = answers[prompt.id] || "";
      const correct = selected === attempt.gameSolution[prompt.id];
      const response = choices.get(selected) || "";
      readable[prompt.id] = response;
      feedback.push({ prompt: prompt.text, response, correct });
      if (correct) score++;
    }
  } else {
    requireValue(
      Array.isArray(answers) && answers.length === display.items.length,
      "Submit every sequence item in order.",
    );
    const items = new Map(display.items.map((item) => [item.id, item.text]));
    requireValue(
      answers.every((id) => typeof id === "string" && items.has(id)),
      "The sequence contains an unknown item.",
    );
    unique(answers, "Use each sequence item exactly once.");
    for (let index = 0; index < answers.length; index++) {
      const response = items.get(answers[index]);
      const correct = answers[index] === attempt.gameSolution[index];
      readable[`position-${index + 1}`] = response;
      feedback.push({ prompt: `Position ${index + 1}`, response, correct });
      if (correct) score++;
    }
  }
  const maxScore = attempt.quizSnapshot.questions.length;
  const percentage = Math.round((score / maxScore) * 1000) / 10;
  return {
    answers: readable,
    feedback,
    score,
    maxScore,
    percentage,
    passed: percentage >= attempt.quizSnapshot.passingScore,
  };
}

export function installGameRoutes(
  app,
  {
    store,
    auth,
    instructor,
    courseById,
    accessCourse,
    event,
    applyQuizGrade,
    refreshCourseCompletion,
  },
) {
  const route = "/api/courses/:id/games";
  app.get(route, auth, (req, res) => {
    const course = courseById(req.params.id);
    accessCourse(req, course);
    const games = store
      .all("games")
      .filter(
        (game) =>
          game.courseId === course.id && (isStaff(req.user) || game.published),
      );
    res.json({ games: games.map((game) => publicGame(game, req.user)) });
  });
  app.post(route, auth, instructor, (req, res) => {
    const course = courseById(req.params.id);
    const game = store.put("games", {
      ...validateGame(req.body),
      id: uid(),
      courseId: course.id,
      createdAt: iso(),
      updatedAt: iso(),
    });
    event("course", `Created ${game.title}`, course.id, req.user.id);
    res.status(201).json({ game: publicGame(game, req.user) });
  });
  app.patch(route + "/:gameId", auth, instructor, (req, res) => {
    const course = courseById(req.params.id);
    const current = store.get("games", req.params.gameId);
    requireValue(current?.courseId === course.id, "Game not found.", 404);
    const game = store.put("games", {
      ...validateGame(req.body, current),
      updatedAt: iso(),
    });
    refreshCourseCompletion?.(course);
    event("course", `Updated ${game.title}`, course.id, req.user.id);
    res.json({ game: publicGame(game, req.user) });
  });
  app.post(route + "/:gameId/start", auth, (req, res) => {
    requireValue(
      req.user.role === "learner",
      "Use learner view to play a scored game.",
      403,
    );
    const course = courseById(req.params.id);
    accessCourse(req, course, { enrolled: true, active: true });
    const game = store.get("games", req.params.gameId);
    requireValue(
      game?.courseId === course.id && game.published,
      "Game not found.",
      404,
    );
    const attempts = store
      .all("attempts")
      .filter(
        (attempt) =>
          attempt.type === "game" &&
          attempt.gameId === game.id &&
          attempt.userId === req.user.id,
      );
    const active = attempts.find(
      (attempt) =>
        !attempt.submittedAt &&
        (!attempt.deadline || Date.parse(attempt.deadline) > Date.now()),
    );
    if (active) return res.json(presentAttempt(active));
    requireValue(
      attempts.length < game.attempts,
      "You have used all available attempts.",
      409,
    );
    const attempt = makeAttempt(game, req.user.id);
    store.transaction(() => {
      store.put("attempts", attempt);
      event("game_started", `Started ${game.title}`, course.id, req.user.id);
    });
    res.status(201).json(presentAttempt(attempt));
  });
  app.post(route + "/:gameId/submit", auth, (req, res) => {
    requireValue(
      req.user.role === "learner",
      "Use learner view to submit a scored game.",
      403,
    );
    const course = courseById(req.params.id);
    accessCourse(req, course, { enrolled: true, active: true });
    object(req.body, "Submit a game attempt and answers as a JSON object.");
    const attempt = store.get("attempts", req.body.attemptId);
    requireValue(
      attempt?.type === "game" &&
        attempt.userId === req.user.id &&
        attempt.gameId === req.params.gameId &&
        attempt.courseId === course.id,
      "Start this game before submitting your answers.",
      404,
    );
    requireValue(
      !attempt.submittedAt,
      "This attempt has already been submitted.",
      409,
    );
    requireValue(
      !attempt.deadline || Date.now() <= Date.parse(attempt.deadline) + 5000,
      "The game time limit has expired.",
      409,
    );
    const result = evaluate(attempt, req.body.answers);
    Object.assign(attempt, result, {
      pendingReview: false,
      submittedAt: iso(),
      durationSeconds: Math.max(
        0,
        Math.round((Date.now() - Date.parse(attempt.startedAt)) / 1000),
      ),
    });
    store.transaction(() => {
      store.put("attempts", attempt);
      applyQuizGrade(attempt);
      event(
        "submission",
        `Submitted ${attempt.gameSnapshot.title}`,
        course.id,
        req.user.id,
      );
    });
    const { answers, ...summary } = result;
    res.json({ ...summary, pendingReview: false });
  });
}

/** Adds examples only to the original demo courses; never rewrites existing work. */
export function seedNativeGames(store) {
  if (store.get("system", "native-games-v1")) return;
  const definitions = [
    {
      id: "native-design-matching",
      courseId: "design",
      code: "DES101",
      title: "Design foundations: match the concept",
      type: "matching",
      description: "Match each design concept to its meaning.",
      pairs: [
        {
          id: "typography",
          prompt: "Typography",
          answer: "The arrangement and style of type",
        },
        {
          id: "color",
          prompt: "Color",
          answer: "Uses hue and value to support meaning",
        },
        {
          id: "contrast",
          prompt: "Contrast",
          answer: "Makes different elements stand apart",
        },
      ],
    },
    {
      id: "native-web-sequence",
      courseId: "web",
      code: "WEB201",
      title: "From idea to accessible web page",
      type: "sequence",
      description: "Put these development stages into a practical order.",
      sequence: [
        { id: "plan", text: "Plan the page structure" },
        { id: "html", text: "Write semantic HTML" },
        { id: "css", text: "Style a responsive layout" },
        { id: "test", text: "Test accessibility and behavior" },
      ],
    },
  ];
  let seeded = 0;
  for (const definition of definitions) {
    const course = store.get("courses", definition.courseId);
    if (!course || course.code !== definition.code) continue;
    const module = store
      .all("modules")
      .filter((item) => item.courseId === course.id)
      .sort((a, b) => a.position - b.position)[0];
    if (!module) continue;
    if (!store.get("games", definition.id)) {
      const game = validateGame({
        ...definition,
        published: true,
        timeLimit: 5,
        attempts: 3,
        passingScore: 70,
      });
      store.put("games", {
        ...game,
        id: definition.id,
        courseId: course.id,
        createdAt: iso(),
        updatedAt: iso(),
      });
      const itemId = `${definition.id}-activity`;
      if (!store.get("items", itemId))
        store.put("items", {
          id: itemId,
          courseId: course.id,
          moduleId: module.id,
          title: game.title,
          type: "game",
          gameId: definition.id,
          quizId: "",
          content: "",
          url: "",
          position: store
            .all("items")
            .filter((item) => item.moduleId === module.id).length,
        });
    }
    seeded++;
  }
  if (seeded) store.put("system", { id: "native-games-v1", createdAt: iso() });
}
