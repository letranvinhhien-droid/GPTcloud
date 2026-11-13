import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock3,
  Gamepad2,
  GripVertical,
  Layers3,
  Link2,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shuffle,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { api } from "../api";
import "./native-games.css";

const newId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newPair = () => ({ id: newId(), prompt: "", answer: "" });
const newStep = () => ({ id: newId(), text: "" });
const gameName = (type) =>
  type === "sequence" ? "Put it in order" : "Match & discover";
const itemCount = (game) =>
  game.itemCount ??
  (game.type === "sequence" ? game.sequence?.length : game.pairs?.length) ??
  0;
function shuffle(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  if (next.length > 1 && next.every((item, i) => item === items[i]))
    next.push(next.shift());
  return next;
}
function GameModal({ title, subtitle, children, onClose, wide = false }) {
  const dialog = useRef(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector("input, button, textarea, select")?.focus();
    const handler = (event) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const elements = [
        ...(dialog.current?.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex='0']",
        ) || []),
      ].filter((element) => element.offsetParent !== null);
      if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault();
        elements.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === elements.at(-1)
      ) {
        event.preventDefault();
        elements[0]?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop native-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <section
        className={`modal native-modal ${wide ? "native-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialog}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">LEARN THROUGH PLAY</p>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button
            className="icon-btn"
            type="button"
            aria-label="Close game dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function GameArt({ type }) {
  return (
    <div className={`native-game-art native-art-${type}`} aria-hidden="true">
      <span className="native-art-orbit" />
      {type === "sequence" ? (
        <div className="native-sequence-art">
          <span>
            01 <i />
          </span>
          <span>
            02 <i />
          </span>
          <span>
            03 <i />
          </span>
          <ArrowDown size={22} />
        </div>
      ) : (
        <div className="native-match-art">
          <div>
            <span>A</span>
            <span>B</span>
            <span>C</span>
          </div>
          <Link2 size={30} />
          <div>
            <span>
              <LeafShape />
            </span>
            <span>
              <CircleShape />
            </span>
            <span>
              <TriangleShape />
            </span>
          </div>
        </div>
      )}
      <span className="native-art-spark">
        <Sparkles size={18} />
      </span>
    </div>
  );
}
function LeafShape() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path
        d="M5 18C1 7 9 4 20 4c0 10-3 16-11 16M5 20L16 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CircleShape() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <circle
        cx="12"
        cy="12"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
function TriangleShape() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path
        d="M12 4l9 16H3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GameEditor({ existing, onClose, onSave }) {
  const [game, setGame] = useState(() =>
    existing
      ? {
          ...structuredClone(existing),
          pairs: structuredClone(existing.pairs || [newPair(), newPair()]),
          sequence: structuredClone(
            existing.sequence || [newStep(), newStep(), newStep()],
          ),
        }
      : {
          title: "",
          description: "",
          type: "matching",
          timeLimit: 5,
          attempts: 3,
          passingScore: 70,
          published: false,
          pairs: [newPair(), newPair()],
          sequence: [newStep(), newStep(), newStep()],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const patch = (key, value) =>
    setGame((current) => ({ ...current, [key]: value }));
  const changePair = (id, key, value) =>
    patch(
      "pairs",
      game.pairs.map((pair) =>
        pair.id === id ? { ...pair, [key]: value } : pair,
      ),
    );
  const moveStep = (index, direction) => {
    const steps = [...game.sequence];
    [steps[index], steps[index + direction]] = [
      steps[index + direction],
      steps[index],
    ];
    patch("sequence", steps);
  };
  async function save(event) {
    event.preventDefault();
    setError("");
    const entries = game.type === "sequence" ? game.sequence : game.pairs;
    if (entries.length < 2 || entries.length > 12)
      return setError("A game needs between 2 and 12 items.");
    setBusy(true);
    try {
      const payload = { ...game };
      delete payload[game.type === "matching" ? "sequence" : "pairs"];
      await onSave(payload);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <GameModal
      title={existing ? "Edit learning game" : "Create a learning game"}
      subtitle="Turn a key idea into a memorable little challenge."
      onClose={() => !busy && onClose()}
      wide
    >
      <form onSubmit={save}>
        <div className="native-editor-body">
          <div className="native-type-picker">
            {["matching", "sequence"].map((type) => (
              <button
                key={type}
                type="button"
                className={game.type === type ? "selected" : ""}
                aria-pressed={game.type === type}
                onClick={() => patch("type", type)}
              >
                {type === "matching" ? (
                  <Link2 size={23} />
                ) : (
                  <Layers3 size={23} />
                )}
                <span>
                  <strong>{gameName(type)}</strong>
                  <small>
                    {type === "matching"
                      ? "Connect concepts with their meanings"
                      : "Arrange a process in the right order"}
                  </small>
                </span>
                {game.type === type && <CheckCircle2 size={18} />}
              </button>
            ))}
          </div>
          <label className="field">
            Game title
            <input
              required
              maxLength={180}
              value={game.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder="e.g. Find the design principle"
              autoComplete="off"
            />
          </label>
          <label className="field">
            Instructions
            <textarea
              rows={2}
              maxLength={5000}
              value={game.description}
              onChange={(e) => patch("description", e.target.value)}
              placeholder="What should your learners keep in mind?"
            />
          </label>
          <div className="native-three-fields">
            <label className="field">
              Time limit (minutes)
              <input
                type="number"
                min="0"
                max="60"
                required
                value={game.timeLimit}
                onChange={(e) => patch("timeLimit", Number(e.target.value))}
              />
              <small>0 means no time limit.</small>
            </label>
            <label className="field">
              Allowed attempts
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                required
                value={game.attempts}
                onChange={(e) => patch("attempts", Number(e.target.value))}
              />
            </label>
            <label className="field">
              Passing score (%)
              <input
                type="number"
                min="0"
                max="100"
                required
                value={game.passingScore}
                onChange={(e) => patch("passingScore", Number(e.target.value))}
              />
            </label>
          </div>
          <div className="native-editor-section">
            <div className="section-heading">
              <div>
                <h3>
                  {game.type === "matching"
                    ? "Build your pairs"
                    : "Set the correct order"}
                </h3>
                <p>
                  {game.type === "matching"
                    ? "One point for every correctly matched pair."
                    : "One point for every item in its correct position. Learners see a shuffled list."}
                </p>
              </div>
              <span className="count-bubble">
                {game.type === "matching"
                  ? game.pairs.length
                  : game.sequence.length}
                /12
              </span>
            </div>
            {game.type === "matching" ? (
              <div className="native-pair-editor">
                {game.pairs.map((pair, index) => (
                  <div className="native-pair-editor-row" key={pair.id}>
                    <span className="native-item-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <label className="field">
                      <span>Concept {index + 1}</span>
                      <input
                        aria-label={`Pair ${index + 1} prompt`}
                        maxLength={1000}
                        required
                        value={pair.prompt}
                        onChange={(e) =>
                          changePair(pair.id, "prompt", e.target.value)
                        }
                        placeholder="Concept or term"
                      />
                    </label>
                    <Link2 size={17} />
                    <label className="field">
                      <span>Matching answer</span>
                      <input
                        aria-label={`Pair ${index + 1} answer`}
                        maxLength={1000}
                        required
                        value={pair.answer}
                        onChange={(e) =>
                          changePair(pair.id, "answer", e.target.value)
                        }
                        placeholder="Definition or matching idea"
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove pair ${index + 1}`}
                      disabled={game.pairs.length <= 2}
                      onClick={() =>
                        patch(
                          "pairs",
                          game.pairs.filter((entry) => entry.id !== pair.id),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="native-sequence-editor">
                {game.sequence.map((step, index) => (
                  <div className="native-sequence-editor-row" key={step.id}>
                    <span className="native-item-number">{index + 1}</span>
                    <input
                      aria-label={`Step ${index + 1} text`}
                      required
                      maxLength={1000}
                      value={step.text}
                      onChange={(e) =>
                        patch(
                          "sequence",
                          game.sequence.map((entry) =>
                            entry.id === step.id
                              ? { ...entry, text: e.target.value }
                              : entry,
                          ),
                        )
                      }
                      placeholder={`Step ${index + 1}`}
                    />
                    <div className="native-move-buttons">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Move authored step ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Move authored step ${index + 1} down`}
                        disabled={index === game.sequence.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove step ${index + 1}`}
                      disabled={game.sequence.length <= 2}
                      onClick={() =>
                        patch(
                          "sequence",
                          game.sequence.filter((entry) => entry.id !== step.id),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn btn-secondary native-add-item"
              disabled={
                (game.type === "matching"
                  ? game.pairs.length
                  : game.sequence.length) >= 12
              }
              onClick={() =>
                game.type === "matching"
                  ? patch("pairs", [...game.pairs, newPair()])
                  : patch("sequence", [...game.sequence, newStep()])
              }
            >
              <Plus size={16} />
              {game.type === "matching" ? "Add pair" : "Add step"}
            </button>
          </div>
          <label className="native-check-label">
            <input
              type="checkbox"
              checked={game.published}
              onChange={(e) => patch("published", e.target.checked)}
            />
            <span>Publish this game for enrolled learners</span>
          </label>
          <p className="native-grading-note">
            <Target size={17} />
            <span>
              Game scores are recorded automatically in the{" "}
              <strong>Quizzes &amp; games</strong> grade category.
            </span>
          </p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            <Save size={16} />
            {busy ? "Saving…" : "Save game"}
          </button>
        </div>
      </form>
    </GameModal>
  );
}

export function GamePlayer({
  game,
  courseId,
  preview = false,
  onClose,
  onDone,
  notify,
}) {
  const [started, setStarted] = useState(null),
    [answers, setAnswers] = useState({}),
    [selectedPrompt, setSelectedPrompt] = useState(null),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now());
  const answersRef = useRef(answers),
    submitting = useRef(false),
    previewSolution = useRef(null),
    doneRef = useRef(onDone);
  answersRef.current = answers;
  doneRef.current = onDone;
  const active = started?.game || game;
  const remaining = started?.deadline
    ? Math.max(
        0,
        Math.ceil((new Date(started.deadline).getTime() - now) / 1000),
      )
    : null;
  async function begin() {
    setBusy(true);
    setError("");
    try {
      let next;
      if (preview) {
        if (game.type === "matching") {
          const prompts = game.pairs.map((pair, index) => ({
            id: `p-${index}`,
            text: pair.prompt,
          }));
          const choices = game.pairs.map((pair, index) => ({
            id: `c-${index}`,
            text: pair.answer,
          }));
          previewSolution.current = Object.fromEntries(
            prompts.map((prompt, index) => [prompt.id, choices[index].id]),
          );
          next = {
            game: {
              ...game,
              prompts: shuffle(prompts),
              choices: shuffle(choices),
            },
          };
        } else {
          const items = game.sequence.map((step, index) => ({
            id: `step-${index}`,
            text: step.text,
          }));
          previewSolution.current = items.map((item) => item.id);
          next = { game: { ...game, items: shuffle(items) } };
        }
        next = {
          ...next,
          attemptId: "preview",
          startedAt: new Date().toISOString(),
          deadline: game.timeLimit
            ? new Date(Date.now() + game.timeLimit * 60000).toISOString()
            : null,
        };
      } else
        next = await api(`/courses/${courseId}/games/${game.id}/start`, {
          method: "POST",
          body: {},
        });
      setNow(Date.now());
      setStarted(next);
      setAnswers(
        next.game.type === "sequence"
          ? next.game.items.map((item) => item.id)
          : {},
      );
      setSelectedPrompt(next.game.prompts?.[0]?.id || null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (submitting.current || !started) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      let outcome;
      if (preview) {
        const feedback =
          active.type === "matching"
            ? active.prompts.map((prompt) => ({
                prompt: prompt.text,
                response:
                  active.choices.find(
                    (choice) => choice.id === answersRef.current[prompt.id],
                  )?.text || "Unmatched",
                correct:
                  answersRef.current[prompt.id] ===
                  previewSolution.current[prompt.id],
              }))
            : previewSolution.current.map((expected, index) => ({
                prompt: `Position ${index + 1}`,
                response:
                  active.items.find(
                    (item) => item.id === answersRef.current[index],
                  )?.text || "Not placed",
                correct: answersRef.current[index] === expected,
              }));
        const score = feedback.filter((entry) => entry.correct).length;
        const percentage = Math.round((score / feedback.length) * 1000) / 10;
        outcome = {
          preview: true,
          score,
          maxScore: feedback.length,
          percentage,
          passed: percentage >= active.passingScore,
          feedback,
        };
      } else
        outcome = await api(`/courses/${courseId}/games/${game.id}/submit`, {
          method: "POST",
          body: { attemptId: started.attemptId, answers: answersRef.current },
        });
      setResult(outcome);
      if (!preview) {
        try {
          await doneRef.current?.();
        } catch (refreshError) {
          notify?.(
            "Your score was saved. Refresh the course to see the updated grade.",
            "error",
          );
        }
      }
    } catch (error) {
      setError(error.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!started || !started.deadline || result) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [started, result]);
  useEffect(() => {
    if (started && remaining === 0 && !result && !busy && !error) submit();
  }, [remaining, started, result, busy, error]);
  function close() {
    if (busy) return;
    if (
      preview ||
      !started ||
      result ||
      window.confirm(
        "Leave this game? This attempt will still count, and your unsent answers will not be saved.",
      )
    )
      onClose();
  }
  function pair(promptId, choiceId) {
    setAnswers((current) => {
      const next = { ...current };
      for (const [id, value] of Object.entries(next))
        if (value === choiceId && id !== promptId) delete next[id];
      if (choiceId) next[promptId] = choiceId;
      else delete next[promptId];
      return next;
    });
    const nextPrompt = active.prompts.find(
      (prompt) => prompt.id !== promptId && !answers[prompt.id],
    );
    if (nextPrompt) setSelectedPrompt(nextPrompt.id);
  }
  function move(index, direction) {
    setAnswers((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  }
  const count = started
    ? active.type === "matching"
      ? active.prompts.length
      : active.items.length
    : itemCount(game);
  return (
    <GameModal
      title={active.title}
      subtitle={
        preview
          ? "Instructor preview · no grades are recorded"
          : gameName(active.type)
      }
      onClose={close}
      wide
    >
      <div className="native-player-body">
        {!started && !result && (
          <div className="native-game-intro">
            <span className={`native-intro-icon native-intro-${game.type}`}>
              {game.type === "matching" ? (
                <Link2 size={33} />
              ) : (
                <Layers3 size={33} />
              )}
            </span>
            <p className="eyebrow">A SMALL CHALLENGE. A NEW CONNECTION.</p>
            <h3>
              {game.type === "matching"
                ? "Find what belongs together."
                : "Every great process has an order."}
            </h3>
            <p>
              {game.description ||
                (game.type === "matching"
                  ? "Match each concept with its meaning. Each correct pair earns one point."
                  : "Arrange the items in the correct sequence. Each correct position earns one point.")}
            </p>
            <div className="native-game-facts">
              <span>
                <Layers3 size={16} />
                {count} {game.type === "matching" ? "pairs" : "steps"}
              </span>
              <span>
                <Clock3 size={16} />
                {game.timeLimit ? `${game.timeLimit} minutes` : "No time limit"}
              </span>
              <span>
                <RotateCcw size={16} />
                {game.attempts} attempts
              </span>
              <span>
                <Target size={16} />
                {game.passingScore}% to pass
              </span>
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={begin}>
              {busy ? (
                <LoaderCircle size={17} className="native-spin" />
              ) : (
                <Play size={17} />
              )}{" "}
              {busy
                ? "Starting…"
                : preview
                  ? "Start game preview"
                  : "Start game"}
            </button>
            <small>
              {preview
                ? "Explore the learner experience without recording an attempt."
                : "Your answers are graded when you submit. Your best score counts toward the gradebook."}
            </small>
          </div>
        )}
        {started && !result && (
          <>
            <div className="native-play-toolbar">
              <div>
                <span className="eyebrow">
                  {active.type === "matching"
                    ? "MAKE A CONNECTION"
                    : "FIND THE FLOW"}
                </span>
                <h3>
                  {active.type === "matching"
                    ? `${Object.keys(answers).length} of ${count} pairs matched`
                    : "Arrange the steps from first to last"}
                </h3>
              </div>
              <span
                className={`native-timer ${remaining !== null && remaining < 30 ? "urgent" : ""}`}
              >
                <Clock3 size={16} />
                {remaining === null
                  ? "Untimed"
                  : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
              </span>
            </div>
            {active.type === "matching" ? (
              <>
                <p className="native-play-hint">
                  Select a concept, then choose its match. You can also use the
                  dropdown beneath each concept.
                </p>
                <div className="native-matching-board">
                  <div className="native-match-prompts">
                    <h4>CONCEPTS</h4>
                    {active.prompts.map((prompt, index) => (
                      <div
                        key={prompt.id}
                        className={`native-prompt ${selectedPrompt === prompt.id ? "active" : ""} ${answers[prompt.id] ? "paired" : ""}`}
                      >
                        <button
                          type="button"
                          className="native-prompt-button"
                          aria-pressed={selectedPrompt === prompt.id}
                          onClick={() => setSelectedPrompt(prompt.id)}
                        >
                          <span className="native-prompt-letter">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <strong>{prompt.text}</strong>
                          {answers[prompt.id] ? (
                            <Link2 size={17} />
                          ) : (
                            <span className="native-unmatched-dot" />
                          )}
                        </button>
                        <label className="native-match-select">
                          <span className="native-sr-only">
                            Match for {prompt.text}
                          </span>
                          <select
                            aria-label={`Match for ${prompt.text}`}
                            value={answers[prompt.id] || ""}
                            disabled={busy}
                            onChange={(e) => pair(prompt.id, e.target.value)}
                          >
                            <option value="">Choose a matching answer</option>
                            {active.choices.map((choice) => (
                              <option key={choice.id} value={choice.id}>
                                {choice.text}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="native-match-choices">
                    <h4>MATCHING IDEAS</h4>
                    {active.choices.map((choice, index) => {
                      const assigned = active.prompts.find(
                        (prompt) => answers[prompt.id] === choice.id,
                      );
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          disabled={busy || !selectedPrompt}
                          className={`native-choice ${assigned ? "assigned" : ""}`}
                          onClick={() => pair(selectedPrompt, choice.id)}
                          aria-label={`Choose match: ${choice.text}`}
                        >
                          <span>{index + 1}</span>
                          <strong>{choice.text}</strong>
                          {assigned && (
                            <small>
                              {String.fromCharCode(
                                65 + active.prompts.indexOf(assigned),
                              )}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="native-play-hint">
                  Move each step into place using the arrows. The top item
                  happens first.
                </p>
                <ol className="native-sequence-board">
                  {answers.map((id, index) => {
                    const entry = active.items.find((item) => item.id === id);
                    return (
                      <li key={id}>
                        <span className="native-item-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <GripVertical
                          className="native-sequence-grip"
                          size={17}
                        />
                        <strong>{entry?.text}</strong>
                        <div className="native-move-buttons">
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={`Move ${entry?.text} up`}
                            disabled={busy || index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp size={17} />
                          </button>
                          <button
                            className="icon-btn"
                            type="button"
                            aria-label={`Move ${entry?.text} down`}
                            disabled={busy || index === answers.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown size={17} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
            <div className="native-submit-row">
              <p>
                {remaining === 0
                  ? "Time is up. Your current answers are being submitted."
                  : active.type === "matching"
                    ? "Check your connections. Unmatched pairs receive zero points."
                    : "Happy with the order? Submit to see how you did."}
              </p>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={submit}
              >
                {busy ? (
                  <LoaderCircle size={16} className="native-spin" />
                ) : (
                  <Check size={17} />
                )}{" "}
                {busy ? "Recording score…" : "Submit game"}
              </button>
            </div>
          </>
        )}
        {result && (
          <div className="native-game-result">
            <span
              className={`native-result-icon ${result.passed ? "passed" : ""}`}
            >
              {result.passed ? <Trophy size={34} /> : <Sparkles size={34} />}
            </span>
            <p className="eyebrow">
              {result.preview ? "PREVIEW COMPLETE" : "YOUR RESULTS ARE IN"}
            </p>
            <h2>
              {result.passed
                ? "Look at those connections."
                : "A little practice goes a long way."}
            </h2>
            <div className="native-score">
              {Math.round(result.percentage)}
              <span>%</span>
            </div>
            <p>
              {result.score} of {result.maxScore}{" "}
              {active.type === "matching"
                ? "pairs matched correctly"
                : "steps in the correct position"}
              .{" "}
              {result.preview
                ? "This preview does not affect grades."
                : result.passed
                  ? "You passed this game. Your score is in the gradebook."
                  : `You need ${active.passingScore}% to pass. Your score is recorded in the gradebook.`}
            </p>
            {result.feedback?.length > 0 && (
              <div className="native-feedback-list">
                {result.feedback.map((entry, index) => (
                  <div className={entry.correct ? "correct" : ""} key={index}>
                    <span>
                      {entry.correct ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <RotateCcw size={17} />
                      )}
                    </span>
                    <div>
                      <strong>{entry.prompt}</strong>
                      <small>{entry.response || "No answer given"}</small>
                    </div>
                    <em>{entry.correct ? "Correct" : "Keep practicing"}</em>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-primary" onClick={onClose}>
              Back to games <ArrowRight size={16} />
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </GameModal>
  );
}

export default function NativeGames({
  courseId,
  user,
  notify,
  onRefresh,
  initialGameId,
  onGameClosed,
}) {
  const [games, setGames] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [editor, setEditor] = useState(null),
    [playing, setPlaying] = useState(null);
  const staff = user?.role !== "learner";
  const handledInitial = useRef(null);
  const load = useCallback(async () => {
    setError("");
    const response = await api(`/courses/${courseId}/games`);
    setGames(response.games || []);
    return response.games || [];
  }, [courseId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(`/courses/${courseId}/games`)
      .then((response) => {
        if (active) setGames(response.games || []);
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId, user?.id]);
  useEffect(() => {
    if (!initialGameId) {
      handledInitial.current = null;
      return;
    }
    if (loading || handledInitial.current === initialGameId) return;
    const game = games.find((entry) => entry.id === initialGameId);
    handledInitial.current = initialGameId;
    if (game) setPlaying(game);
    else {
      notify?.("This game is not currently available.", "error");
      onGameClosed?.();
    }
  }, [initialGameId, loading, games, notify, onGameClosed]);
  async function saveGame(game) {
    await api(
      `/courses/${courseId}/games${editor?.id ? `/${editor.id}` : ""}`,
      { method: editor?.id ? "PATCH" : "POST", body: game },
    );
    setEditor(null);
    await load();
    await onRefresh?.();
    notify?.(editor?.id ? "Game updated." : "Your learning game is ready.");
  }
  async function gameDone() {
    await load();
    await onRefresh?.();
    notify?.("Game score recorded in the gradebook.");
  }
  function closeGame() {
    setPlaying(null);
    onGameClosed?.();
  }
  return (
    <section className="native-games-page">
      <div className="native-section-heading">
        <div>
          <p className="eyebrow">CURIOSITY, MEET PLAY</p>
          <h2>Small games. Lasting understanding.</h2>
          <p>
            {staff
              ? "Build interactive challenges with scores that flow straight into your gradebook."
              : "Make connections, find the right order, and put your knowledge into practice."}
          </p>
        </div>
        {staff && (
          <button className="btn btn-primary" onClick={() => setEditor({})}>
            <Plus size={16} />
            Create game
          </button>
        )}
      </div>
      <div className="native-games-note">
        <Gamepad2 size={19} />
        <span>
          {staff
            ? "Matching and sequencing games are built into your course. "
            : "Your best graded attempt for each game counts. "}
          <strong>Scores use the Quizzes &amp; games category.</strong>
        </span>
      </div>
      {loading ? (
        <div className="native-loading" role="status">
          <LoaderCircle className="native-spin" size={23} />
          Opening the playbook…
        </div>
      ) : error ? (
        <div className="native-load-error">
          <p role="alert">{error}</p>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              setLoading(true);
              try {
                await load();
              } catch (e) {
                setError(e.message);
              } finally {
                setLoading(false);
              }
            }}
          >
            Try again
          </button>
        </div>
      ) : games.length ? (
        <div className="native-games-grid">
          {games.map((game) => (
            <article key={game.id} className="card native-game-card">
              <GameArt type={game.type} />
              <div className="native-game-card-body">
                <div className="native-game-card-kicker">
                  <span>
                    {game.type === "matching"
                      ? "MATCHING GAME"
                      : "SEQUENCE GAME"}
                  </span>
                  <span
                    className={`badge ${game.published ? "published" : "draft"}`}
                  >
                    {game.published ? "Published" : "Draft"}
                  </span>
                </div>
                <h3>{game.title}</h3>
                <p>
                  {game.description ||
                    (game.type === "matching"
                      ? "Connect ideas and discover what belongs together."
                      : "Make sense of a process, one step at a time.")}
                </p>
                <div className="native-game-card-meta">
                  <span>
                    <Layers3 size={14} />
                    {itemCount(game)}{" "}
                    {game.type === "matching" ? "pairs" : "steps"}
                  </span>
                  <span>
                    <Clock3 size={14} />
                    {game.timeLimit ? `${game.timeLimit} min` : "Untimed"}
                  </span>
                  <span>
                    <Target size={14} />
                    {game.passingScore}%
                  </span>
                </div>
              </div>
              <footer>
                {staff ? (
                  <>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setPlaying(game)}
                    >
                      <Play size={15} />
                      Preview game
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditor(game)}
                    >
                      <Pencil size={15} />
                      Edit game
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    disabled={!game.published}
                    onClick={() => setPlaying(game)}
                  >
                    <Play size={16} />
                    Play game
                    <ArrowRight size={15} />
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="card empty-state native-empty">
          <span>
            <Gamepad2 size={35} />
          </span>
          <h3>
            {staff
              ? "Give a great idea a playful twist."
              : "A new challenge is on its way."}
          </h3>
          <p>
            {staff
              ? "Create a matching or sequencing game, set your rules, and let your learners explore."
              : "Your instructor’s published learning games will appear here."}
          </p>
          {staff && (
            <button className="btn btn-primary" onClick={() => setEditor({})}>
              <Plus size={16} />
              Create your first game
            </button>
          )}
        </div>
      )}
      {editor && (
        <GameEditor
          existing={editor.id ? editor : null}
          onClose={() => setEditor(null)}
          onSave={saveGame}
        />
      )}
      {playing && (
        <GamePlayer
          key={playing.id}
          game={playing}
          courseId={courseId}
          preview={staff}
          onClose={closeGame}
          onDone={gameDone}
          notify={notify}
        />
      )}
    </section>
  );
}
