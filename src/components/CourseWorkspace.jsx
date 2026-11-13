import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Layers3,
  LockKeyhole,
  Play,
  Plus,
  Puzzle,
  Save,
  Settings2,
  Trash2,
  X,
  ClipboardList,
  CircleHelp,
  GraduationCap,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { api } from "../api";
import { Gradebook } from "./Reports";
import NativeGames from "./NativeGames";
import "./workspace.css";

function Modal({ title, subtitle, children, onClose, wide = false }) {
  const box = useRef(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.querySelector("input, textarea, button, select")?.focus();
    function key(event) {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const focusable = [
        ...(box.current?.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ) || []),
      ].filter((el) => el.offsetParent !== null);
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className={`modal workspace-modal ${wide ? "workspace-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
const itemIcons = {
  lesson: FileText,
  quiz: CircleHelp,
  game: Puzzle,
  assignment: ClipboardList,
};
const makeQuestion = () => ({
  id: crypto.randomUUID(),
  type: "multiple-choice",
  prompt: "",
  options: ["", "", "", ""],
  answer: "",
  points: 10,
});

function QuizEditor({ existing, onSave, onClose }) {
  const [quiz, setQuiz] = useState(
    existing
      ? structuredClone(existing)
      : {
          title: "",
          description: "",
          timeLimit: 20,
          attempts: 2,
          passingScore: 70,
          published: false,
          questions: [makeQuestion()],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const patch = (key, value) => setQuiz((q) => ({ ...q, [key]: value }));
  const patchQuestion = (id, patch) =>
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    }));
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!quiz.questions.length) return setError("Add at least one question.");
    for (const question of quiz.questions) {
      if (!question.prompt.trim())
        return setError("Every question needs a prompt.");
      if (
        question.type === "multiple-choice" &&
        (question.options.some((option) => !option.trim()) ||
          new Set(question.options).size !== question.options.length)
      )
        return setError("Give every choice a unique, non-empty answer.");
      if (question.type !== "essay" && !String(question.answer).trim())
        return setError(
          "Choose a correct answer for every automatically graded question.",
        );
    }
    setBusy(true);
    try {
      await onSave(quiz);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={existing ? "Edit quiz" : "Create a quiz"}
      subtitle="A little challenge. A lot of learning."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="workspace-form">
        <Field label="Quiz title">
          <input
            required
            value={quiz.title}
            onChange={(e) => patch("title", e.target.value)}
            placeholder="e.g. Putting the principles into practice"
          />
        </Field>
        <Field label="Instructions">
          <textarea
            value={quiz.description}
            onChange={(e) => patch("description", e.target.value)}
            placeholder="Let your learners know what to expect…"
            rows={2}
          />
        </Field>
        <div className="workspace-three-cols">
          <Field label="Time limit (minutes)" hint="0 means no time limit.">
            <input
              type="number"
              min="0"
              max="300"
              required
              value={quiz.timeLimit}
              onChange={(e) => patch("timeLimit", Number(e.target.value))}
            />
          </Field>
          <Field label="Allowed attempts">
            <input
              type="number"
              min="1"
              max="100"
              required
              value={quiz.attempts}
              onChange={(e) => patch("attempts", Number(e.target.value))}
            />
          </Field>
          <Field label="Passing score (%)">
            <input
              type="number"
              min="0"
              max="100"
              required
              value={quiz.passingScore}
              onChange={(e) => patch("passingScore", Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="workspace-question-list">
          {quiz.questions.map((question, index) => (
            <article className="workspace-question-editor" key={question.id}>
              <div className="workspace-question-heading">
                <span className="workspace-number">{index + 1}</span>
                <select
                  aria-label={`Question ${index + 1} type`}
                  value={question.type}
                  onChange={(e) =>
                    patchQuestion(question.id, {
                      type: e.target.value,
                      options:
                        e.target.value === "true-false"
                          ? ["True", "False"]
                          : ["", "", "", ""],
                      answer: "",
                    })
                  }
                >
                  <option value="multiple-choice">Multiple choice</option>
                  <option value="true-false">True or false</option>
                  <option value="short-answer">Short answer</option>
                  <option value="essay">Essay / written response</option>
                </select>
                <label className="workspace-points">
                  <input
                    aria-label={`Question ${index + 1} points`}
                    type="number"
                    min="1"
                    max="1000"
                    required
                    value={question.points}
                    onChange={(e) =>
                      patchQuestion(question.id, {
                        points: Number(e.target.value),
                      })
                    }
                  />{" "}
                  pts
                </label>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() =>
                    patch(
                      "questions",
                      quiz.questions.filter((q) => q.id !== question.id),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <textarea
                aria-label={`Question ${index + 1} prompt`}
                required
                value={question.prompt}
                placeholder="What would you like to ask?"
                onChange={(e) =>
                  patchQuestion(question.id, { prompt: e.target.value })
                }
                rows={2}
              />
              {["multiple-choice", "true-false"].includes(question.type) && (
                <div className="workspace-options">
                  {question.options.map((option, optionIndex) => (
                    <div className="workspace-option" key={optionIndex}>
                      <input
                        type="radio"
                        aria-label={`Mark answer ${optionIndex + 1} correct for question ${index + 1}`}
                        name={`correct-${question.id}`}
                        checked={question.answer === option && option !== ""}
                        onChange={() =>
                          patchQuestion(question.id, { answer: option })
                        }
                      />
                      {question.type === "true-false" ? (
                        <span>{option}</span>
                      ) : (
                        <input
                          required
                          aria-label={`Question ${index + 1} choice ${optionIndex + 1}`}
                          value={option}
                          placeholder={`Answer ${String.fromCharCode(65 + optionIndex)}`}
                          onChange={(e) => {
                            const options = [...question.options];
                            options[optionIndex] = e.target.value;
                            patchQuestion(question.id, {
                              options,
                              ...(question.answer === option
                                ? { answer: e.target.value }
                                : {}),
                            });
                          }}
                        />
                      )}
                    </div>
                  ))}
                  <small className="muted">
                    Select the circle next to the correct answer.
                  </small>
                </div>
              )}
              {question.type === "short-answer" && (
                <Field
                  label="Correct answer"
                  hint="Answers are matched without case sensitivity or leading / trailing spaces."
                >
                  <input
                    required
                    value={question.answer}
                    onChange={(e) =>
                      patchQuestion(question.id, { answer: e.target.value })
                    }
                  />
                </Field>
              )}
              {question.type === "essay" && (
                <p className="workspace-note">
                  <ClipboardList size={16} /> Written responses are sent to the
                  gradebook for instructor review.
                </p>
              )}
            </article>
          ))}
        </div>
        <button
          className="btn btn-secondary workspace-add-question"
          type="button"
          onClick={() =>
            patch("questions", [...quiz.questions, makeQuestion()])
          }
        >
          <Plus size={16} /> Add question
        </button>
        <label className="workspace-check-label">
          <input
            type="checkbox"
            checked={quiz.published}
            onChange={(e) => patch("published", e.target.checked)}
          />
          <span>Publish quiz and make it available to enrolled learners</span>
        </label>
        {error && (
          <p className="workspace-error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <span className="muted">
            {quiz.questions.length} questions ·{" "}
            {quiz.questions.reduce((sum, q) => sum + Number(q.points), 0)}{" "}
            points
          </span>
          <div className="workspace-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              <Save size={16} />
              {busy ? "Saving…" : "Save quiz"}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}

function QuizRunner({ quiz, courseId, onClose, onDone, preview = false }) {
  const [started, setStarted] = useState(null),
    [answers, setAnswers] = useState({}),
    [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  const activeQuiz = started?.quiz || quiz;
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitting = useRef(false);
  async function begin() {
    setBusy(true);
    setError("");
    try {
      const next = preview
        ? {
            attemptId: "preview",
            deadline: quiz.timeLimit
              ? new Date(Date.now() + quiz.timeLimit * 60000).toISOString()
              : null,
          }
        : await api(`/courses/${courseId}/quizzes/${quiz.id}/start`, {
            method: "POST",
            body: {},
          });
      setStarted(next);
      setSeconds(
        next.deadline
          ? Math.max(
              0,
              Math.ceil(
                (new Date(next.deadline).getTime() - Date.now()) / 1000,
              ),
            )
          : null,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (preview) setResult({ preview: true });
      else {
        const outcome = await api(
          `/courses/${courseId}/quizzes/${quiz.id}/submit`,
          {
            method: "POST",
            body: { answers: answersRef.current, attemptId: started.attemptId },
          },
        );
        setResult(outcome);
        onDone();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  useEffect(() => {
    if (!started || !started.deadline || result) return;
    const update = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil((new Date(started.deadline).getTime() - Date.now()) / 1000),
        ),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [started, result]);
  useEffect(() => {
    if (started && seconds === 0 && !result && !busy && !error) submit();
  }, [seconds, started, result, busy, error]);
  const close = () => {
    if (
      !started ||
      result ||
      window.confirm(
        "Leave this quiz? Your started attempt will still count, and unsent answers will not be saved.",
      )
    )
      onClose();
  };
  return (
    <Modal
      title={activeQuiz.title}
      subtitle={
        preview
          ? "Instructor preview · answers are not recorded"
          : `${activeQuiz.questions.length} questions · ${quiz.timeLimit ? quiz.timeLimit + " minutes" : "No time limit"}`
      }
      onClose={close}
      wide
    >
      <div className="workspace-form">
        {!started && (
          <div className="workspace-quiz-intro">
            <div className="workspace-feature-icon">
              <CircleHelp size={32} />
            </div>
            <h3>Ready to put your knowledge to work?</h3>
            <p>
              {activeQuiz.description ||
                "Take a moment to review each question. Your work will be graded when you submit."}
            </p>
            <div className="workspace-quiz-facts">
              <span>
                <Clock3 size={17} />
                {quiz.timeLimit ? quiz.timeLimit + " minutes" : "No time limit"}
              </span>
              <span>
                <CheckCircle2 size={17} />
                {activeQuiz.passingScore}% to pass
              </span>
              <span>
                <Layers3 size={17} />
                {activeQuiz.attempts} attempts
              </span>
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={begin}>
              {busy ? "Starting…" : preview ? "Start preview" : "Start quiz"}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        {started && !result && (
          <>
            <div className="workspace-quiz-timer">
              <span>
                {
                  Object.keys(answers).filter((id) =>
                    String(answers[id]).trim(),
                  ).length
                }{" "}
                of {activeQuiz.questions.length} answered
              </span>
              <strong>
                <Clock3 size={16} />
                {seconds === null
                  ? "No time limit"
                  : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
              </strong>
            </div>
            {activeQuiz.questions.map((q, i) => (
              <article className="workspace-question-editor" key={q.id}>
                <div className="workspace-question-heading">
                  <span className="workspace-number">{i + 1}</span>
                  <h3>{q.prompt}</h3>
                  <span className="muted">{q.points} pts</span>
                </div>
                {["multiple-choice", "true-false"].includes(q.type) ? (
                  <div className="workspace-answer-options">
                    {q.options.map((option, j) => (
                      <label
                        key={j}
                        className={answers[q.id] === option ? "selected" : ""}
                      >
                        <input
                          type="radio"
                          name={`question-${q.id}`}
                          checked={answers[q.id] === option}
                          onChange={() =>
                            setAnswers((a) => ({ ...a, [q.id]: option }))
                          }
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    aria-label={`Answer to question ${i + 1}`}
                    rows={q.type === "essay" ? 5 : 2}
                    value={answers[q.id] || ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                    }
                    placeholder="Write your answer here…"
                  />
                )}
              </article>
            ))}
            <footer className="modal-footer">
              <span className="muted">
                {seconds === 0
                  ? "Time is up. Submit your saved responses."
                  : "Check your answers before submitting."}
              </span>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={submit}
              >
                {busy ? "Submitting…" : "Submit answers"}
                <Check size={16} />
              </button>
            </footer>
          </>
        )}
        {result && (
          <div className="workspace-quiz-intro">
            <div className="workspace-feature-icon">
              <CheckCircle2 size={36} />
            </div>
            <h2>
              {result.preview
                ? "Preview complete"
                : result.pendingReview
                  ? "Submitted for review"
                  : result.passed
                    ? "Beautiful work!"
                    : "Keep growing"}
            </h2>
            {!result.preview && (
              <>
                <div className="workspace-result-score">
                  {Math.round(result.percentage)}
                  <small>%</small>
                </div>
                <p>
                  {result.score} of {result.maxScore} points
                  {result.pendingReview
                    ? " automatically awarded so far. Your instructor will review the written responses."
                    : result.passed
                      ? ". You passed this quiz."
                      : `. A score of ${activeQuiz.passingScore}% is needed to pass.`}
                </p>
              </>
            )}
            <button className="btn btn-primary" onClick={onClose}>
              Back to course
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="workspace-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function CourseSettings({ course, courses, onSave }) {
  const [form, setForm] = useState(structuredClone(course)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => setForm(structuredClone(course)), [course]);
  const total = Object.values(form.weights || {}).reduce(
    (sum, weight) => sum + Number(weight),
    0,
  );
  async function submit(event) {
    event.preventDefault();
    setError("");
    if (total !== 100) return setError("Grading weights must add up to 100%.");
    setBusy(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="workspace-settings" onSubmit={submit}>
      <div className="workspace-setting-section">
        <div>
          <span className="eyebrow">THE ESSENTIALS</span>
          <h3>Course details</h3>
          <p className="muted">
            Give your course a clear identity and a little personality.
          </p>
        </div>
        <div className="card workspace-settings-fields">
          <Field label="Course name">
            <input
              required
              value={form.title}
              onChange={(e) => change("title", e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Course code">
              <input
                required
                value={form.code}
                onChange={(e) => change("code", e.target.value)}
              />
            </Field>
            <Field label="Category">
              <input
                required
                value={form.category}
                onChange={(e) => change("category", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </Field>
          <Field label="Visibility">
            <select
              aria-label="Visibility"
              value={form.status}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="draft">Draft — instructors only</option>
              <option value="published">
                Published — available to learners
              </option>
              <option value="archived">
                Archived — closed to new enrollment
              </option>
            </select>
          </Field>
        </div>
      </div>
      <div className="workspace-setting-section">
        <div>
          <span className="eyebrow">TIME & ACCESS</span>
          <h3>Course run</h3>
          <p className="muted">
            Decide when learning happens and who can join.
          </p>
        </div>
        <div className="card workspace-settings-fields">
          <div className="form-grid">
            <Field label="Start date">
              <input
                type="date"
                value={form.startDate || ""}
                onChange={(e) => change("startDate", e.target.value)}
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                min={form.startDate || undefined}
                value={form.endDate || ""}
                onChange={(e) => change("endDate", e.target.value)}
              />
            </Field>
            <Field label="Learning pace">
              <select
                value={form.pace}
                onChange={(e) => change("pace", e.target.value)}
              >
                <option value="self-paced">Self-paced</option>
                <option value="instructor-led">Instructor-led</option>
              </select>
            </Field>
            <Field label="Enrollment">
              <select
                aria-label="Enrollment"
                value={form.enrollment}
                onChange={(e) => change("enrollment", e.target.value)}
              >
                <option value="open">Open enrollment</option>
                <option value="invite">Invitation only</option>
              </select>
            </Field>
          </div>
          <Field label="Course passing score (%)">
            <input
              type="number"
              min="0"
              max="100"
              required
              value={form.passingScore}
              onChange={(e) => change("passingScore", Number(e.target.value))}
            />
          </Field>
        </div>
      </div>
      <div className="workspace-setting-section">
        <div>
          <span className="eyebrow">A STRONG FOUNDATION</span>
          <h3>Prerequisites</h3>
          <p className="muted">
            Learners must complete these courses before enrolling.
          </p>
        </div>
        <div className="card workspace-settings-fields">
          {courses
            .filter((c) => c.id !== course.id)
            .map((c) => (
              <label key={c.id} className="workspace-prereq">
                <input
                  type="checkbox"
                  checked={(form.prerequisites || []).includes(c.id)}
                  onChange={(e) =>
                    change(
                      "prerequisites",
                      e.target.checked
                        ? [...(form.prerequisites || []), c.id]
                        : form.prerequisites.filter((id) => id !== c.id),
                    )
                  }
                />
                <span>
                  <strong>{c.title}</strong>
                  <small className="muted">{c.code}</small>
                </span>
              </label>
            ))}
          {courses.length < 2 && (
            <p className="muted">
              Create another course to set a prerequisite.
            </p>
          )}
        </div>
      </div>
      <div className="workspace-setting-section">
        <div>
          <span className="eyebrow">MEASURE WHAT MATTERS</span>
          <h3>Grading weights</h3>
          <p className="muted">
            Your gradebook calculates a weighted average from these categories.
          </p>
        </div>
        <div className="card workspace-settings-fields">
          {Object.entries(form.weights || {}).map(([key, weight]) => (
            <label className="workspace-weight" key={key}>
              <span>
                {key === "quizzes"
                  ? "Quizzes & games"
                  : key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
              <div>
                <input
                  aria-label={`${key} weight`}
                  type="number"
                  min="0"
                  max="100"
                  required
                  value={weight}
                  onChange={(e) =>
                    change("weights", {
                      ...form.weights,
                      [key]: Number(e.target.value),
                    })
                  }
                />
                <span>%</span>
              </div>
            </label>
          ))}
          <div
            className={`workspace-weight-total ${total !== 100 ? "invalid" : ""}`}
          >
            <span>Total weight</span>
            <strong>
              {total}% {total === 100 && <CheckCircle2 size={16} />}
            </strong>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
      <div className="workspace-settings-footer">
        <p className="muted">
          Changes apply to this course and its current run.
        </p>
        <button className="btn btn-primary" disabled={busy || total !== 100}>
          <Save size={16} />
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

export default function CourseWorkspace({
  courseId,
  courses,
  user,
  onBack,
  onRefresh,
  notify,
  initialTab,
  initialGameId,
}) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("content");
  const [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState(""),
    [collapsed, setCollapsed] = useState({});
  const [moduleTitle, setModuleTitle] = useState(""),
    [item, setItem] = useState({
      title: "",
      type: "lesson",
      content: "",
      url: "",
      quizId: "",
    });
  const [assignmentResponse, setAssignmentResponse] = useState("");
  const [gameToOpen, setGameToOpen] = useState(initialGameId || null);
  const instructor = user?.role !== "learner";
  const load = useCallback(async () => {
    try {
      const next = await api(`/courses/${courseId}`);
      setData(next);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [courseId]);
  useEffect(() => {
    setLoading(true);
    setTab("content");
    load();
  }, [load, user?.role]);
  useEffect(() => {
    const requested = ["content", "quizzes", "games", "settings"].includes(
      initialTab,
    )
      ? initialTab
      : "content";
    setTab(requested);
    setGameToOpen(initialGameId || null);
  }, [courseId, initialTab, initialGameId]);
  const close = useCallback(() => {
    setModal(null);
    setFormError("");
  }, []);
  const refresh = async () => {
    await load();
    await onRefresh();
  };
  async function mutation(action, message) {
    setBusy(true);
    setFormError("");
    try {
      await action();
      close();
      await refresh();
      if (message) notify(message);
    } catch (err) {
      setFormError(err.message);
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="workspace-loading">
        <div className="workspace-spinner" />
        <p className="muted">Opening your classroom…</p>
      </div>
    );
  if (error || !data)
    return (
      <div className="empty-state">
        <AlertCircle size={32} />
        <h2>We couldn’t open this course</h2>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={load}>
          Try again
        </button>
        <button className="btn btn-ghost" onClick={onBack}>
          Back to courses
        </button>
      </div>
    );
  const {
    course,
    modules = [],
    quizzes = [],
    games = [],
    enrollment,
    eligibility,
  } = data;
  const allItems = modules.flatMap((m) => m.items);
  const completedItems = allItems.filter((i) => i.completed).length;
  const progress = allItems.length
    ? Math.round((completedItems / allItems.length) * 100)
    : 0;
  const openItem = (entry) => {
    if (entry.type === "game") {
      setGameToOpen(entry.gameId);
      setTab("games");
      return;
    }
    if (!instructor && ["lesson", "assignment"].includes(entry.type))
      api(`/courses/${courseId}/items/${entry.id}/view`, {
        method: "POST",
        body: {},
      }).catch((e) => notify(e.message, "error"));
    if (entry.type === "quiz") {
      const quiz = quizzes.find((q) => q.id === entry.quizId);
      if (!quiz) return notify("This quiz is not available yet.", "error");
      setModal({ type: "takeQuiz", quiz });
    } else {
      setAssignmentResponse(entry.submission?.content || "");
      setModal({ type: "viewItem", item: entry });
    }
  };
  const locked = !instructor && (!enrollment || eligibility?.allowed === false);
  return (
    <div className="workspace-page">
      <button className="workspace-back" onClick={onBack}>
        <ArrowLeft size={16} />
        All courses
      </button>
      <div className="workspace-course-header">
        <div
          className={`workspace-course-mark workspace-mark-${course.cover || "design"}`}
        >
          <BookOpen size={30} />
        </div>
        <div className="workspace-course-title">
          <div className="workspace-course-meta">
            <span className="eyebrow">
              {course.code} / {course.category}
            </span>
            <span className={`badge ${course.status}`}>{course.status}</span>
          </div>
          <h1>{course.title}</h1>
          <p className="muted">{course.description}</p>
        </div>
        {instructor ? (
          <button
            className="btn btn-secondary"
            onClick={() => setTab("settings")}
          >
            <Settings2 size={16} />
            Course settings
          </button>
        ) : !enrollment ? (
          <button
            className="btn btn-primary"
            disabled={busy || eligibility?.allowed === false}
            onClick={() =>
              mutation(
                () =>
                  api(`/courses/${courseId}/enroll`, {
                    method: "POST",
                    body: {},
                  }),
                "You’re enrolled. Let’s start learning!",
              )
            }
          >
            <Plus size={16} />
            {busy ? "Enrolling…" : "Enroll in course"}
          </button>
        ) : (
          <span className="workspace-enrolled">
            <CheckCircle2 size={17} />
            Enrolled
          </span>
        )}
      </div>
      <div className="workspace-course-summary">
        <span>
          <GraduationCap size={16} />
          {course.studentCount} learners
        </span>
        <span>
          <Layers3 size={16} />
          {modules.length} modules
        </span>
        <span>
          <CircleHelp size={16} />
          {quizzes.length} quizzes
        </span>
        <span>
          <Clock3 size={16} />
          {course.pace === "self-paced"
            ? "Learn at your own pace"
            : "Instructor-led"}
        </span>
      </div>
      {!instructor && eligibility?.allowed === false && (
        <div className="workspace-access-note">
          <LockKeyhole size={18} />
          <div>
            <strong>This course is currently locked</strong>
            <p>{eligibility.reason}</p>
          </div>
        </div>
      )}
      {!instructor && enrollment && (
        <div className="workspace-learner-progress">
          <span>
            Your progress <strong>{progress}%</strong>
          </span>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <small className="muted">
            {completedItems} of {allItems.length} activities complete
          </small>
        </div>
      )}
      <nav className="tabs workspace-tabs" aria-label="Course navigation">
        {[
          ["content", "Course content"],
          ["quizzes", "Quizzes"],
          ["games", "Games"],
          ["grades", instructor ? "Gradebook" : "My grades"],
          ...(instructor ? [["settings", "Settings"]] : []),
        ].map(([id, label]) => (
          <button
            key={id}
            className={`tab ${tab === id ? "active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "quizzes" && <span>{quizzes.length}</span>}
          </button>
        ))}
      </nav>
      {tab === "content" && (
        <>
          <div className="workspace-section-heading">
            <div>
              <h2>A path to something new</h2>
              <p className="muted">
                {instructor
                  ? "Build a thoughtful learning experience, one module at a time."
                  : "Explore the lessons and activities in your course."}
              </p>
            </div>
            {instructor && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setModuleTitle("");
                  setModal({ type: "module" });
                }}
              >
                <Plus size={16} />
                Add module
              </button>
            )}
          </div>
          <div className="workspace-modules">
            {modules.map((module, index) => (
              <section key={module.id} className="card workspace-module">
                <header className="workspace-module-header">
                  <button
                    className="workspace-module-toggle"
                    onClick={() =>
                      setCollapsed((c) => ({
                        ...c,
                        [module.id]: !c[module.id],
                      }))
                    }
                    aria-expanded={!collapsed[module.id]}
                  >
                    {collapsed[module.id] ? (
                      <ChevronRight size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                    <span className="workspace-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{module.title}</h3>
                      <span className="muted">
                        {module.items.length}{" "}
                        {module.items.length === 1 ? "activity" : "activities"}
                      </span>
                    </div>
                  </button>
                  {instructor && (
                    <button
                      className="icon-btn"
                      aria-label={`Rename ${module.title}`}
                      onClick={() => {
                        setModuleTitle(module.title);
                        setModal({ type: "module", moduleId: module.id });
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {instructor && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setItem({
                          title: "",
                          type: "lesson",
                          content: "",
                          url: "",
                          quizId: quizzes[0]?.id || "",
                        });
                        setModal({ type: "item", moduleId: module.id });
                      }}
                    >
                      <Plus size={15} />
                      Add activity
                    </button>
                  )}
                </header>
                {!collapsed[module.id] && (
                  <div className="workspace-module-items">
                    {module.items.map((entry) => {
                      const Icon = itemIcons[entry.type] || FileText;
                      return (
                        <div className="workspace-module-item" key={entry.id}>
                          <button
                            className="workspace-item-open"
                            disabled={locked}
                            onClick={() => openItem(entry)}
                          >
                            <span
                              className={`workspace-item-icon ${entry.type}`}
                            >
                              <Icon size={18} />
                            </span>
                            <span>
                              <strong>{entry.title}</strong>
                              <small>
                                {entry.type === "game"
                                  ? "Native learning game"
                                  : entry.type === "quiz"
                                    ? "Knowledge check"
                                    : entry.type === "assignment"
                                      ? "Assignment"
                                      : "Reading & resources"}
                              </small>
                            </span>
                            {entry.completed ? (
                              <CheckCircle2
                                className="workspace-complete-icon"
                                size={19}
                              />
                            ) : locked ? (
                              <LockKeyhole
                                className="workspace-end-icon"
                                size={16}
                              />
                            ) : (
                              <ChevronRight
                                className="workspace-end-icon"
                                size={17}
                              />
                            )}
                          </button>
                          {instructor && (
                            <button
                              className="icon-btn"
                              aria-label={`Edit ${entry.title}`}
                              onClick={() => {
                                setItem({ ...entry });
                                setModal({
                                  type: "item",
                                  moduleId: module.id,
                                  itemId: entry.id,
                                });
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {instructor && (
                            <button
                              className="icon-btn workspace-remove-item"
                              aria-label={`Remove ${entry.title}`}
                              onClick={() =>
                                setModal({
                                  type: "deleteItem",
                                  moduleId: module.id,
                                  item: entry,
                                })
                              }
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {module.items.length === 0 && (
                      <div className="workspace-empty-module">
                        <Layers3 size={21} />
                        <span>
                          A fresh start. Add your first activity to this module.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
          {modules.length === 0 && (
            <div className="card empty-state">
              <Layers3 size={36} />
              <h3>Your next great course starts here</h3>
              <p className="muted">
                {instructor
                  ? "Create a module to organize lessons, quizzes, and interactive activities."
                  : "Your instructor is preparing the course content."}
              </p>
              {instructor && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setModuleTitle("");
                    setModal({ type: "module" });
                  }}
                >
                  Create first module
                  <Plus size={16} />
                </button>
              )}
            </div>
          )}
          {instructor && (
            <div className="workspace-native-callout">
              <span className="workspace-native-icon">
                <Puzzle size={25} />
              </span>
              <div>
                <h3>Make learning an experience</h3>
                <p className="muted">
                  Create matching and sequencing challenges. Scores flow
                  straight into your gradebook.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setTab("games")}
              >
                Explore native games
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
      {tab === "quizzes" && (
        <>
          <div className="workspace-section-heading">
            <div>
              <h2>Small challenges. Real progress.</h2>
              <p className="muted">
                {instructor
                  ? "Create native quizzes and see what’s clicking for your learners."
                  : "Check your understanding and build your confidence."}
              </p>
            </div>
            {instructor && (
              <button
                className="btn btn-primary"
                onClick={() => setModal({ type: "quizEditor" })}
              >
                <Plus size={16} />
                Create quiz
              </button>
            )}
          </div>
          <div className="workspace-quizzes">
            {quizzes.map((quiz) => (
              <article key={quiz.id} className="card workspace-quiz-card">
                <div className="workspace-quiz-card-heading">
                  <span className="workspace-item-icon quiz">
                    <CircleHelp size={22} />
                  </span>
                  <span
                    className={`badge ${quiz.published ? "published" : "draft"}`}
                  >
                    {quiz.published ? "Published" : "Draft"}
                  </span>
                </div>
                <h3>{quiz.title}</h3>
                <p className="muted">
                  {quiz.description ||
                    "A chance to put your new knowledge into practice."}
                </p>
                <div className="workspace-quiz-card-meta">
                  <span>
                    <FileText size={14} />
                    {quiz.questions?.length ?? quiz.questionCount} questions
                  </span>
                  <span>
                    <Clock3 size={14} />
                    {quiz.timeLimit ? quiz.timeLimit + " min" : "Untimed"}
                  </span>
                  <span>{quiz.passingScore}% to pass</span>
                </div>
                <footer>
                  {instructor ? (
                    <>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setModal({ type: "takeQuiz", quiz })}
                      >
                        <Play size={15} />
                        Preview
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setModal({ type: "quizEditor", quiz })}
                      >
                        Edit quiz
                        <ArrowRight size={15} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-primary"
                      disabled={locked || !quiz.published}
                      onClick={() => setModal({ type: "takeQuiz", quiz })}
                    >
                      Take quiz
                      <ArrowRight size={16} />
                    </button>
                  )}
                </footer>
              </article>
            ))}
          </div>
          {quizzes.length === 0 && (
            <div className="empty-state card">
              <CircleHelp size={36} />
              <h3>A little curiosity goes a long way</h3>
              <p className="muted">
                {instructor
                  ? "Create your first quiz with multiple choice, true or false, short answers, and essays."
                  : "There are no published quizzes yet."}
              </p>
            </div>
          )}
        </>
      )}
      {tab === "games" && (
        <NativeGames
          courseId={courseId}
          user={user}
          notify={notify}
          onRefresh={refresh}
          initialGameId={gameToOpen}
          onGameClosed={() => setGameToOpen(null)}
        />
      )}
      {tab === "grades" && (
        <Gradebook
          courses={courses.filter((c) => c.id === courseId)}
          user={user}
          notify={notify}
          initialCourseId={courseId}
          onRefresh={onRefresh}
        />
      )}
      {tab === "settings" && instructor && (
        <>
          {" "}
          <CourseSettings
            course={course}
            courses={courses}
            onSave={async (form) => {
              await api(`/courses/${courseId}`, {
                method: "PATCH",
                body: form,
              });
              await refresh();
              notify("Course settings saved.");
            }}
          />
        </>
      )}
      {modal?.type === "module" && (
        <Modal
          title={modal.moduleId ? "Rename module" : "Add a module"}
          subtitle="Give the next chapter of your course a name."
          onClose={close}
        >
          <form
            className="workspace-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutation(
                () =>
                  api(
                    `/courses/${courseId}/modules${modal.moduleId ? `/${modal.moduleId}` : ""}`,
                    {
                      method: modal.moduleId ? "PATCH" : "POST",
                      body: { title: moduleTitle },
                    },
                  ),
                modal.moduleId ? "Module updated." : "Module created.",
              );
            }}
          >
            <Field label="Module name">
              <input
                required
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
                placeholder="e.g. Getting started with the fundamentals"
              />
            </Field>
            {formError && (
              <p className="workspace-error" role="alert">
                {formError}
              </p>
            )}
            <footer className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={close}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : modal.moduleId
                    ? "Save module"
                    : "Create module"}
                <Plus size={16} />
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {modal?.type === "item" && (
        <Modal
          title={
            modal.itemId ? "Edit learning activity" : "Add a learning activity"
          }
          subtitle="Choose how your learners will explore this topic."
          onClose={close}
        >
          <form
            className="workspace-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutation(
                () =>
                  api(
                    `/courses/${courseId}/modules/${modal.moduleId}/items${modal.itemId ? `/${modal.itemId}` : ""}`,
                    { method: modal.itemId ? "PATCH" : "POST", body: item },
                  ),
                modal.itemId ? "Activity updated." : "Activity added.",
              );
            }}
          >
            <div className="workspace-activity-types">
              {Object.entries({
                lesson: "Lesson",
                quiz: "Quiz",
                game: "Game",
                assignment: "Assignment",
              }).map(([id, label]) => {
                const Icon = itemIcons[id];
                return (
                  <button
                    type="button"
                    key={id}
                    disabled={!!modal.itemId}
                    className={item.type === id ? "active" : ""}
                    onClick={() => setItem((i) => ({ ...i, type: id }))}
                  >
                    <Icon size={20} />
                    {label}
                  </button>
                );
              })}
            </div>
            <Field label="Activity title">
              <input
                required
                value={item.title}
                onChange={(e) =>
                  setItem((i) => ({ ...i, title: e.target.value }))
                }
                placeholder="What will learners discover?"
              />
            </Field>
            {item.type === "quiz" ? (
              <Field label="Link a quiz">
                <select
                  required
                  value={item.quizId}
                  onChange={(e) =>
                    setItem((i) => ({ ...i, quizId: e.target.value }))
                  }
                >
                  <option value="">Choose a quiz</option>
                  {quizzes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
                {quizzes.length === 0 && (
                  <small className="muted">
                    Create a quiz in the Quizzes tab first.
                  </small>
                )}
              </Field>
            ) : item.type === "game" ? (
              <Field label="Link a game">
                <select
                  required
                  value={item.gameId || ""}
                  onChange={(e) =>
                    setItem((i) => ({ ...i, gameId: e.target.value }))
                  }
                >
                  <option value="">Choose a game</option>
                  {games.map((game) => (
                    <option key={game.id} value={game.id}>
                      {game.title}
                    </option>
                  ))}
                </select>
                <small>Create and publish a game in the Games tab first.</small>
              </Field>
            ) : (
              <Field
                label={
                  item.type === "assignment"
                    ? "Assignment instructions"
                    : "Lesson content"
                }
              >
                <textarea
                  required
                  rows={8}
                  value={item.content}
                  onChange={(e) =>
                    setItem((i) => ({ ...i, content: e.target.value }))
                  }
                  placeholder={
                    item.type === "assignment"
                      ? "Describe the task, expectations, and how learners should share their work with you…"
                      : "Share your ideas, resources, and learning material…"
                  }
                />
              </Field>
            )}
            {formError && (
              <p className="workspace-error" role="alert">
                {formError}
              </p>
            )}
            <footer className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={close}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  (item.type === "quiz" && !item.quizId) ||
                  (item.type === "game" && !item.gameId)
                }
              >
                {busy
                  ? "Saving…"
                  : modal.itemId
                    ? "Save activity"
                    : "Add activity"}
                <Plus size={16} />
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {modal?.type === "viewItem" && (
        <Modal
          title={modal.item.title}
          subtitle={
            modal.item.type === "assignment"
              ? "Assignment instructions"
              : "A moment to explore and learn"
          }
          onClose={close}
          wide
        >
          <div className="workspace-form">
            <div className="workspace-lesson-content">
              {modal.item.content ||
                "Your instructor will add the learning material here soon."}
            </div>
            {modal.item.type === "assignment" && !instructor && (
              <>
                <Field
                  label="Your response"
                  hint="Share your work as text or include a link to your project. Your instructor will review and grade it."
                >
                  <textarea
                    rows={7}
                    value={assignmentResponse}
                    onChange={(e) => setAssignmentResponse(e.target.value)}
                    placeholder="Share your response here…"
                    disabled={Boolean(modal.item.submission)}
                  />
                </Field>
                {modal.item.submission && (
                  <p className="workspace-note">
                    <ClipboardList size={16} />
                    {modal.item.submission.pendingReview
                      ? "Your assignment is submitted and awaiting review."
                      : `Your assignment was graded: ${modal.item.submission.score} / ${modal.item.submission.maxScore} points.`}
                  </p>
                )}
              </>
            )}
            <footer className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>
                Close
              </button>
              {!instructor &&
                modal.item.type === "assignment" &&
                !modal.item.submission && (
                  <button
                    className="btn btn-primary"
                    disabled={busy || !assignmentResponse.trim()}
                    onClick={() =>
                      mutation(
                        () =>
                          api(
                            `/courses/${courseId}/items/${modal.item.id}/submit`,
                            {
                              method: "POST",
                              body: { content: assignmentResponse },
                            },
                          ),
                        "Assignment submitted for review.",
                      )
                    }
                  >
                    <CheckCircle2 size={16} />
                    {busy ? "Submitting…" : "Submit assignment"}
                  </button>
                )}
              {!instructor &&
                !modal.item.completed &&
                modal.item.type !== "assignment" && (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() =>
                      mutation(
                        () =>
                          api(
                            `/courses/${courseId}/items/${modal.item.id}/complete`,
                            { method: "POST", body: {} },
                          ),
                        "Activity complete. Keep going!",
                      )
                    }
                  >
                    <CheckCircle2 size={16} />
                    {busy ? "Saving…" : "Mark complete"}
                  </button>
                )}
              {modal.item.completed && (
                <span className="workspace-enrolled">
                  <CheckCircle2 size={16} />
                  Activity completed
                </span>
              )}
            </footer>
          </div>
        </Modal>
      )}
      {modal?.type === "deleteItem" && (
        <Modal title="Remove this activity?" onClose={close}>
          <div className="workspace-form">
            <p>“{modal.item.title}” will be removed from this module.</p>
            <footer className="modal-footer">
              <button className="btn btn-secondary" onClick={close}>
                Keep activity
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  mutation(
                    () =>
                      api(
                        `/courses/${courseId}/modules/${modal.moduleId}/items/${modal.item.id}`,
                        { method: "DELETE" },
                      ),
                    "Activity removed.",
                  )
                }
              >
                {busy ? "Removing…" : "Remove activity"}
              </button>
            </footer>
          </div>
        </Modal>
      )}
      {modal?.type === "quizEditor" && (
        <QuizEditor
          existing={modal.quiz}
          onClose={close}
          onSave={async (quiz) => {
            await api(
              `/courses/${courseId}/quizzes${modal.quiz ? `/${modal.quiz.id}` : ""}`,
              { method: modal.quiz ? "PATCH" : "POST", body: quiz },
            );
            await refresh();
            close();
            notify(modal.quiz ? "Quiz updated." : "Quiz created.");
          }}
        />
      )}
      {modal?.type === "takeQuiz" && (
        <QuizRunner
          quiz={modal.quiz}
          courseId={courseId}
          preview={instructor}
          onClose={close}
          onDone={refresh}
        />
      )}
    </div>
  );
}
