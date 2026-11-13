import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  LayoutGrid,
  LoaderCircle,
  Mail,
  Pencil,
  Play,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { api } from "../api";
import "./reports.css";
import AccountSecurity from "./AccountSecurity";

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const percent = (value) =>
  value == null ? "—" : `${Math.round(number(value))}%`;
const initials = (name) =>
  String(name || "Learner")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not yet";
function notifyError(notify, error) {
  notify?.(error.message || "Unable to save changes.", "error");
}
function Loading({ text = "Loading your workspace…" }) {
  return (
    <div className="reports-loading" role="status">
      <LoaderCircle className="reports-spin" size={22} />
      {text}
    </div>
  );
}
function Empty({ icon: Icon = BookOpen, title, children }) {
  return (
    <div className="empty-state reports-empty">
      <span className="reports-empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [
      ...(dialog?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
      ) || []),
    ];
    focusable()[0]?.focus();
    const listener = (event) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop reports-overlay"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal reports-modal ${wide ? "reports-modal-wide" : ""}`}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">MERIDIAN WORKSPACE</p>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Metric({ icon: Icon, label, value, detail, tint = "" }) {
  return (
    <div className="metric-card reports-metric">
      <span className={`reports-metric-icon ${tint}`}>
        <Icon size={20} />
      </span>
      <div className="reports-metric-label">{label}</div>
      <strong>{value}</strong>
      {detail && <span className="reports-metric-detail">{detail}</span>}
    </div>
  );
}

export function Gradebook({
  courses = [],
  user,
  notify,
  initialCourseId,
  onRefresh,
}) {
  const [courseId, setCourseId] = useState(
    initialCourseId || courses[0]?.id || "",
  );
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("grades");
  const [edit, setEdit] = useState(null);
  const [review, setReview] = useState(null);
  const [saving, setSaving] = useState(false);
  const instructor = user?.role !== "learner";
  useEffect(() => {
    if (initialCourseId) setCourseId(initialCourseId);
  }, [initialCourseId]);
  useEffect(() => {
    if (!courseId && courses[0]) setCourseId(courses[0].id);
  }, [courses, courseId]);
  async function load() {
    if (!courseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setData(await api(`/courses/${courseId}/gradebook`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let live = true;
    if (!courseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api(`/courses/${courseId}/gradebook`)
      .then((result) => {
        if (live) setData(result);
      })
      .catch((err) => {
        if (live) setError(err.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [courseId]);
  const rows = data?.rows || [];
  const visible = rows.filter((row) =>
    `${row.name} ${row.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  const submissions = data?.submissions || [];
  const pending = submissions.filter((item) => item.pendingReview);
  const graded = rows.filter((row) => row.total != null);
  const avg = graded.length
    ? graded.reduce((sum, row) => sum + number(row.total), 0) / graded.length
    : null;
  const weights = data?.course?.weights || {
    quizzes: 40,
    assignments: 40,
    participation: 20,
  };
  async function saveGrade(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const body = { completed: Boolean(edit.completed) };
      for (const key of ["quizzes", "assignments", "participation"])
        body[key] =
          edit[key] === "" || edit[key] == null ? null : Number(edit[key]);
      await api(`/courses/${courseId}/grades/${edit.userId}`, {
        method: "PATCH",
        body,
      });
      setEdit(null);
      await load();
      await onRefresh?.();
      notify?.("Grades updated successfully.");
    } catch (err) {
      notifyError(notify, err);
    } finally {
      setSaving(false);
    }
  }
  async function saveReview(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/courses/${courseId}/submissions/${review.id}`, {
        method: "PATCH",
        body: { score: Number(review.score) },
      });
      setReview(null);
      await load();
      await onRefresh?.();
      notify?.("Submission graded. The gradebook is up to date.");
    } catch (err) {
      notifyError(notify, err);
    } finally {
      setSaving(false);
    }
  }
  function exportCSV() {
    const cell = (value) => {
      let text = value == null ? "" : String(value);
      if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const content = [
      [
        "Learner",
        "Email",
        `Quizzes & games (${weights.quizzes}%)`,
        `Assignments (${weights.assignments}%)`,
        `Participation (${weights.participation}%)`,
        "Weighted total",
        "Letter",
        "Completed",
      ],
      ...rows.map((row) => [
        row.name,
        row.email,
        row.quizzes,
        row.assignments,
        row.participation,
        row.total,
        row.letter,
        row.completed ? "Yes" : "No",
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8;" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data?.course?.code || "course"}-gradebook.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify?.("Gradebook exported.");
  }
  return (
    <div className="reports-page">
      {!initialCourseId && (
        <div className="page-heading reports-page-heading">
          <div>
            <p className="eyebrow">MEASURE WHAT MATTERS</p>
            <h1>Gradebook</h1>
            <p className="muted">A clear view of every learner’s progress.</p>
          </div>
          <button
            className="btn btn-secondary"
            disabled={!rows.length}
            onClick={exportCSV}
          >
            <ArrowDownToLine size={16} />
            Export grades
          </button>
        </div>
      )}
      <div className="reports-course-toolbar">
        <label className="reports-select-label">
          Course
          <select
            aria-label="Select gradebook course"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
        {initialCourseId && (
          <button
            className="btn btn-secondary"
            disabled={!rows.length}
            onClick={exportCSV}
          >
            <ArrowDownToLine size={16} />
            Export grades
          </button>
        )}
        <span className="reports-auto-note">
          <CheckCircle2 size={15} />
          Weighted grades update automatically
        </span>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="reports-error" role="alert">
          {error}
          <button className="btn btn-secondary" onClick={load}>
            Try again
          </button>
        </div>
      ) : !courseId ? (
        <Empty title="Your gradebook starts with a course">
          Create your first course to start tracking learning.
        </Empty>
      ) : (
        <>
          <div className="metric-grid reports-metrics">
            <Metric
              icon={Users}
              label={instructor ? "Enrolled learners" : "Your enrollment"}
              value={rows.length}
              detail={data?.course?.title}
            />
            <Metric
              icon={BarChart3}
              label={instructor ? "Class average" : "Your weighted grade"}
              value={percent(avg)}
              detail="Across graded categories"
              tint="reports-lime"
            />
            <Metric
              icon={ClipboardCheck}
              label="Awaiting review"
              value={pending.length}
              detail="Submissions to be graded"
              tint="reports-peach"
            />
            <Metric
              icon={GraduationCap}
              label="Course completed"
              value={rows.filter((row) => row.completed).length}
              detail={
                instructor ? "Learners who finished" : "Completion status"
              }
              tint="reports-lavender"
            />
          </div>
          <div className="card reports-grade-card">
            <div className="reports-table-toolbar">
              <div className="tabs">
                <button
                  className={`tab ${tab === "grades" ? "active" : ""}`}
                  onClick={() => setTab("grades")}
                >
                  Overview
                </button>
                <button
                  className={`tab ${tab === "submissions" ? "active" : ""}`}
                  onClick={() => setTab("submissions")}
                >
                  Submissions{" "}
                  {pending.length > 0 && (
                    <span className="reports-count">{pending.length}</span>
                  )}
                </button>
              </div>
              {tab === "grades" && (
                <div className="reports-search">
                  <Search size={16} />
                  <input
                    aria-label="Search learners in gradebook"
                    placeholder="Search learners…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              )}
            </div>
            {tab === "grades" ? (
              visible.length ? (
                <div className="table-wrap">
                  <table className="data-table reports-table">
                    <thead>
                      <tr>
                        <th>Learner</th>
                        <th>
                          Quizzes & games <span>{weights.quizzes}%</span>
                        </th>
                        <th>
                          Assignments <span>{weights.assignments}%</span>
                        </th>
                        <th>
                          Participation <span>{weights.participation}%</span>
                        </th>
                        <th>Final grade</th>
                        <th>Status</th>
                        {instructor && <th aria-label="Actions" />}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={row.userId}>
                          <td>
                            <div className="reports-person">
                              <span className="avatar">
                                {row.initials || initials(row.name)}
                              </span>
                              <div>
                                <strong>{row.name}</strong>
                                <small>{row.email}</small>
                              </div>
                            </div>
                          </td>
                          <td>{percent(row.quizzes)}</td>
                          <td>{percent(row.assignments)}</td>
                          <td>{percent(row.participation)}</td>
                          <td>
                            <span
                              className={`reports-grade ${number(row.total) >= 70 ? "reports-grade-good" : ""}`}
                            >
                              {percent(row.total)}
                            </span>
                            <span className="reports-letter">
                              {row.letter || ""}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${row.completed ? "published" : "reports-progress-badge"}`}
                            >
                              {row.completed ? "Completed" : "In progress"}
                            </span>
                          </td>
                          {instructor && (
                            <td>
                              <button
                                className="icon-btn"
                                aria-label={`Edit grades for ${row.name}`}
                                onClick={() => setEdit({ ...row })}
                              >
                                <Pencil size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={Users}
                  title={query ? "No matching learners" : "No grades yet"}
                >
                  {query
                    ? "Try another name or email address."
                    : "Grades will appear when learners enroll and complete activities."}
                </Empty>
              )
            ) : submissions.length ? (
              <div className="reports-submissions">
                {submissions.map((item) => (
                  <div className="reports-submission" key={item.id}>
                    <span className="reports-submission-icon">
                      <FileCheck2 size={20} />
                    </span>
                    <div className="reports-submission-info">
                      <strong>{item.quizTitle}</strong>
                      <span>
                        {item.userName} · {date(item.submittedAt)}
                      </span>
                    </div>
                    <span
                      className={`badge ${item.pendingReview ? "draft" : "published"}`}
                    >
                      {item.pendingReview
                        ? "Needs review"
                        : `${item.score} / ${item.maxScore}`}
                    </span>
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        setReview({ ...item, score: item.score ?? 0 })
                      }
                    >
                      {instructor && item.pendingReview
                        ? "Grade submission"
                        : "View submission"}
                      <ChevronRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={ClipboardCheck} title="No submissions yet">
                Quiz attempts, game scores, and assignments will appear here
                when a learner submits their work.
              </Empty>
            )}
            <div className="reports-table-footer">
              <span>
                {tab === "grades"
                  ? `${visible.length} of ${rows.length} learners`
                  : `${submissions.length} submissions`}
              </span>
              <span>
                Grading weights total{" "}
                {Object.values(weights).reduce(
                  (sum, weight) => sum + number(weight),
                  0,
                )}
                %
              </span>
            </div>
          </div>
        </>
      )}
      {edit && (
        <Modal
          title="Edit learner grades"
          onClose={() => !saving && setEdit(null)}
        >
          <form onSubmit={saveGrade}>
            <div className="reports-modal-body">
              <div className="reports-person reports-edit-person">
                <span className="avatar">
                  {edit.initials || initials(edit.name)}
                </span>
                <div>
                  <strong>{edit.name}</strong>
                  <small>{edit.email}</small>
                </div>
              </div>
              <p className="muted">
                Enter a score out of 100 for each category. Leave an ungraded
                category empty.
              </p>
              <div className="form-grid reports-grade-fields">
                {["quizzes", "assignments", "participation"].map((key) => (
                  <label className="field" key={key}>
                    <span>
                      {key === "quizzes"
                        ? "Quizzes & games"
                        : key[0].toUpperCase() + key.slice(1)}{" "}
                      <small>({weights[key]}%)</small>
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={edit[key] ?? ""}
                      placeholder="Ungraded"
                      onChange={(event) =>
                        setEdit({ ...edit, [key]: event.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="reports-check">
                <input
                  type="checkbox"
                  checked={Boolean(edit.completed)}
                  onChange={(event) =>
                    setEdit({ ...edit, completed: event.target.checked })
                  }
                />
                Mark course as completed
              </label>
              <p className="reports-help">
                Completion unlocks courses that require this course as a
                prerequisite.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setEdit(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save grades"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {review && (
        <Modal
          title="Submission review"
          wide
          onClose={() => !saving && setReview(null)}
        >
          <form onSubmit={saveReview}>
            <div className="reports-modal-body">
              <div className="reports-review-heading">
                <div>
                  <h3>{review.quizTitle}</h3>
                  <p className="muted">
                    {review.userName} · Submitted {date(review.submittedAt)}
                  </p>
                </div>
                <span
                  className={`badge ${review.pendingReview ? "draft" : "published"}`}
                >
                  {review.pendingReview ? "Awaiting review" : "Graded"}
                </span>
              </div>
              <div className="reports-answers">
                {(review.questions || []).map((question, index) => {
                  const response = review.answers?.[question.id];
                  const answer =
                    response == null || response === ""
                      ? "No answer provided"
                      : String(response);
                  return (
                    <div className="reports-answer" key={question.id || index}>
                      <span className="eyebrow">
                        QUESTION {index + 1} · {question.points} POINTS
                      </span>
                      <h4>{question.prompt}</h4>
                      <div className="reports-answer-text">{answer}</div>
                      {instructor &&
                        question.type !== "essay" &&
                        question.answer != null && (
                          <p className="reports-correct-answer">
                            <Check size={14} />
                            Expected answer: {String(question.answer)}
                          </p>
                        )}
                    </div>
                  );
                })}
                {!(review.questions || []).length && (
                  <p className="muted">
                    Question details are unavailable for this submission.
                  </p>
                )}
              </div>
              {instructor && review.type !== "game" ? (
                <label className="field reports-review-score">
                  <span>Total awarded points (out of {review.maxScore})</span>
                  <input
                    aria-label="Awarded points"
                    required
                    type="number"
                    min="0"
                    max={review.maxScore}
                    step="0.01"
                    value={review.score}
                    onChange={(event) =>
                      setReview({ ...review, score: event.target.value })
                    }
                  />
                  <small>
                    Review each response and enter the total score for the
                    entire submission.
                  </small>
                </label>
              ) : (
                <div className="reports-result">
                  {review.pendingReview ? "Provisional score" : "Total score"}:{" "}
                  <strong>
                    {review.score} / {review.maxScore}
                  </strong>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={saving}
                onClick={() => setReview(null)}
              >
                Close
              </button>
              {instructor && review.type !== "game" && (
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Save final score"}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function Analytics({ analytics = {}, courses = [] }) {
  const data = analytics || {};
  const activity = data.weeklyActivity || [];
  const performance = data.coursePerformance || [];
  const distribution = data.gradeDistribution || [];
  const maxActivity = Math.max(
    1,
    ...activity.flatMap((day) => [number(day.active), number(day.completed)]),
  );
  const maxDistribution = Math.max(
    1,
    ...distribution.map((group) => number(group.count)),
  );
  const allGrades = distribution.reduce(
    (sum, group) => sum + number(group.count),
    0,
  );
  const [metric, setMetric] = useState("completion");
  return (
    <div className="reports-page">
      <div className="page-heading reports-page-heading">
        <div>
          <p className="eyebrow">THE BIGGER PICTURE</p>
          <h1>Learning analytics</h1>
          <p className="muted">
            Turn learning activity into meaningful insight.
          </p>
        </div>
        <span className="reports-date-tag">
          <Clock3 size={15} />
          Live course data
        </span>
      </div>
      <div className="metric-grid reports-metrics">
        <Metric
          icon={Users}
          label="Total learners"
          value={number(data.totalLearners)}
          detail="Across your learning community"
        />
        <Metric
          icon={BookOpen}
          label="Active courses"
          value={number(data.activeCourses)}
          detail={`${courses.length} courses in your catalog`}
          tint="reports-lime"
        />
        <Metric
          icon={GraduationCap}
          label="Completion rate"
          value={percent(data.completionRate)}
          detail="Completed course enrollments"
          tint="reports-peach"
        />
        <Metric
          icon={TrendingUp}
          label="Average grade"
          value={percent(data.averageGrade)}
          detail="Weighted learner performance"
          tint="reports-lavender"
        />
      </div>
      <div className="reports-chart-grid">
        <section className="card reports-chart-card">
          <div className="section-heading">
            <div>
              <h3>Learning activity</h3>
              <p className="muted">Participation over the last 7 days</p>
            </div>
            <span className="reports-chart-label">This week</span>
          </div>
          <div className="reports-chart-legend">
            <span>
              <i />
              Active learners
            </span>
            <span>
              <i className="reports-legend-light" />
              Completions
            </span>
          </div>
          {activity.length ? (
            <div
              className="reports-bar-chart"
              role="img"
              aria-label={`Weekly activity: ${activity.map((day) => `${day.day}: ${day.active} active learners, ${day.completed} completions`).join("; ")}`}
            >
              <div className="reports-chart-axis">
                {[1, 0.75, 0.5, 0.25, 0].map((value) => (
                  <span key={value}>{Math.round(maxActivity * value)}</span>
                ))}
              </div>
              <div className="reports-bars-area">
                <div className="reports-grid-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="reports-bars">
                  {activity.map((day, index) => (
                    <div
                      className="reports-bar-group"
                      key={`${day.day}-${index}`}
                    >
                      <div className="reports-bar-pair">
                        <div
                          className="reports-bar"
                          style={{
                            height: `${Math.max(number(day.active) ? 2 : 0, (number(day.active) / maxActivity) * 100)}%`,
                          }}
                          title={`${day.active} active learners`}
                        >
                          <span>{day.active}</span>
                        </div>
                        <div
                          className="reports-bar reports-bar-light"
                          style={{
                            height: `${Math.max(number(day.completed) ? 2 : 0, (number(day.completed) / maxActivity) * 100)}%`,
                          }}
                          title={`${day.completed} completions`}
                        >
                          <span>{day.completed}</span>
                        </div>
                      </div>
                      <span className="reports-bar-day">{day.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Empty icon={BarChart3} title="Activity is on its way">
              Learner activity will appear as courses get underway.
            </Empty>
          )}
        </section>
        <section className="card reports-chart-card reports-distribution">
          <div className="section-heading">
            <div>
              <h3>Grade distribution</h3>
              <p className="muted">A snapshot of learner outcomes</p>
            </div>
            <span className="reports-small-icon">
              <GraduationCap size={18} />
            </span>
          </div>
          <div className="reports-distribution-total">
            <strong>{allGrades}</strong>
            <span>graded enrollments</span>
          </div>
          <div className="reports-distribution-bars">
            {distribution.map((group, index) => (
              <div className="reports-distribution-row" key={group.label}>
                <span>{group.label}</span>
                <div className="reports-distribution-track">
                  <i
                    style={{
                      width: `${(number(group.count) / maxDistribution) * 100}%`,
                      opacity: 1 - index * 0.12,
                    }}
                  />
                </div>
                <strong>{group.count}</strong>
              </div>
            ))}
          </div>
          {!distribution.length && (
            <p className="muted">No grades recorded yet.</p>
          )}
          <p className="reports-chart-footnote">
            Based on weighted course grades.
          </p>
        </section>
      </div>
      <section className="card reports-performance">
        <div className="section-heading">
          <div>
            <h3>Course performance</h3>
            <p className="muted">See where your learners are thriving.</p>
          </div>
          <select
            aria-label="Sort course performance"
            value={metric}
            onChange={(event) => setMetric(event.target.value)}
          >
            <option value="completion">By completion</option>
            <option value="averageGrade">By average grade</option>
            <option value="learners">By enrollment</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table reports-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Learners</th>
                <th>Completion rate</th>
                <th>Average grade</th>
              </tr>
            </thead>
            <tbody>
              {[...performance]
                .sort((a, b) => number(b[metric]) - number(a[metric]))
                .map((course, index) => (
                  <tr key={course.courseId}>
                    <td>
                      <div className="reports-course-name">
                        <span
                          className={`reports-course-index reports-color-${index % 4}`}
                        >
                          <BookOpen size={18} />
                        </span>
                        <strong>{course.title}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="reports-inline-icon">
                        <Users size={14} />
                        {course.learners}
                      </span>
                    </td>
                    <td>
                      <div className="reports-completion-cell">
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, number(course.completion)))}%`,
                            }}
                          />
                        </div>
                        <span>{percent(course.completion)}</span>
                      </div>
                    </td>
                    <td>
                      <span className="reports-grade reports-grade-good">
                        {percent(course.averageGrade)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!performance.length && (
            <Empty title="No course data yet">
              Publish a course and enroll learners to begin measuring progress.
            </Empty>
          )}
        </div>
      </section>
    </div>
  );
}

export function People({
  learners = [],
  courses = [],
  user,
  notify,
  onRefresh,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [enrollCourseId, setEnrollCourseId] = useState(courses[0]?.id || "");
  const [enrolling, setEnrolling] = useState(false);
  async function enrollLearner(event) {
    event.preventDefault();
    setEnrolling(true);
    try {
      const result = await api(`/courses/${enrollCourseId}/enrollments`, {
        method: "POST",
        body: { userId: selected.id },
      });
      await onRefresh?.();
      notify?.(
        result.alreadyEnrolled
          ? "This learner is already enrolled."
          : "Learner enrolled successfully.",
      );
      setSelected(null);
    } catch (error) {
      notifyError(notify, error);
    } finally {
      setEnrolling(false);
    }
  }
  const enrollmentCount = (learner) =>
    Array.isArray(learner.enrollments)
      ? learner.enrollments.length
      : number(learner.enrollments);
  const active = learners.filter(
    (learner) => learner.status === "active",
  ).length;
  const displayed = learners.filter(
    (learner) =>
      `${learner.name} ${learner.email}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "active"
          ? learner.status === "active"
          : learner.status !== "active")),
  );
  return (
    <div className="reports-page">
      <div className="page-heading reports-page-heading">
        <div>
          <p className="eyebrow">BETTER, TOGETHER</p>
          <h1>Your learners</h1>
          <p className="muted">Get to know the people behind the progress.</p>
        </div>
        <span className="reports-date-tag">
          <Users size={16} />
          {learners.length} community members
        </span>
      </div>
      <div className="metric-grid reports-people-metrics">
        <Metric
          icon={Users}
          label="Total learners"
          value={learners.length}
          detail="Your learning community"
        />
        <Metric
          icon={CheckCircle2}
          label="Active learners"
          value={active}
          detail="Currently participating"
          tint="reports-lime"
        />
        <Metric
          icon={BookOpen}
          label="Course enrollments"
          value={learners.reduce(
            (sum, learner) => sum + enrollmentCount(learner),
            0,
          )}
          detail={`Across ${courses.length} courses`}
          tint="reports-peach"
        />
      </div>
      <section className="card">
        <div className="reports-table-toolbar">
          <div className="reports-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or email…"
              aria-label="Search all learners"
            />
          </div>
          <select
            aria-label="Filter learner status"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All learners</option>
            <option value="active">Active learners</option>
            <option value="inactive">Inactive learners</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table reports-table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Enrolled courses</th>
                <th>Average grade</th>
                <th>Status</th>
                <th>Last active</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {displayed.map((learner) => (
                <tr key={learner.id}>
                  <td>
                    <div className="reports-person">
                      <span className="avatar">
                        {learner.initials || initials(learner.name)}
                      </span>
                      <div>
                        <strong>{learner.name}</strong>
                        <small>{learner.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{enrollmentCount(learner)} courses</td>
                  <td>{percent(learner.averageGrade)}</td>
                  <td>
                    <span
                      className={`badge ${learner.status === "active" ? "published" : "draft"}`}
                    >
                      <span className="reports-status-dot" />
                      {learner.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{date(learner.lastActive)}</td>
                  <td>
                    <button
                      className="icon-btn"
                      aria-label={`View ${learner.name}`}
                      onClick={() => setSelected(learner)}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!displayed.length && (
            <Empty
              icon={Users}
              title={query ? "No matching learners" : "No learners to show"}
            >
              Try another search or status filter.
            </Empty>
          )}
        </div>
        <div className="reports-table-footer">
          <span>
            Showing {displayed.length} of {learners.length} learners
          </span>
          <span>Learners enroll from the course catalog</span>
        </div>
      </section>
      {selected && (
        <Modal title="Learner profile" onClose={() => setSelected(null)}>
          <div className="reports-modal-body">
            <div className="reports-profile">
              <span className="avatar reports-big-avatar">
                {selected.initials || initials(selected.name)}
              </span>
              <h3>{selected.name}</h3>
              <p className="muted">{selected.email}</p>
              <span
                className={`badge ${selected.status === "active" ? "published" : "draft"}`}
              >
                {selected.status}
              </span>
            </div>
            <div className="reports-profile-stats">
              <div>
                <strong>{enrollmentCount(selected)}</strong>
                <span>Enrolled courses</span>
              </div>
              <div>
                <strong>{percent(selected.averageGrade)}</strong>
                <span>Average grade</span>
              </div>
            </div>
            <p className="reports-profile-date">
              Last active: {date(selected.lastActive)}
            </p>
            {user?.role !== "learner" && (
              <form onSubmit={enrollLearner} className="reports-enroll-form">
                <label className="field">
                  Enroll in a course
                  <select
                    aria-label="Enrollment course"
                    value={enrollCourseId}
                    onChange={(e) => setEnrollCourseId(e.target.value)}
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                        {course.enrollment === "invite"
                          ? " · Invitation only"
                          : ""}
                      </option>
                    ))}
                  </select>
                  <small>
                    Prerequisites must be complete. Course run dates still
                    control access.
                  </small>
                </label>
                <button
                  className="btn btn-primary"
                  disabled={enrolling || !enrollCourseId}
                >
                  {enrolling ? "Enrolling…" : "Enroll learner"}
                </button>
              </form>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Settings({ user, onRefresh, notify }) {
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(user?.name || ""), [user?.name]);
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/profile", { method: "PATCH", body: { name: name.trim() } });
      await onRefresh?.();
      notify?.("Your profile has been updated.");
    } catch (error) {
      notifyError(notify, error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="reports-page">
      <div className="page-heading reports-page-heading">
        <div>
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <h1>Settings</h1>
          <p className="muted">
            Manage your profile and understand your workspace.
          </p>
        </div>
      </div>
      <div className="reports-settings-layout">
        <section className="card reports-settings-card">
          <div className="section-heading">
            <div>
              <h3>Personal profile</h3>
              <p className="muted">
                How you appear in your learning community.
              </p>
            </div>
          </div>
          <form onSubmit={save}>
            <div className="reports-settings-body">
              <div className="reports-person reports-settings-person">
                <span className="avatar reports-big-avatar">
                  {user?.initials || initials(user?.name)}
                </span>
                <div>
                  <strong>{user?.name}</strong>
                  <small className="reports-capitalize">{user?.role}</small>
                </div>
              </div>
              <label className="field">
                <span>Full name</span>
                <input
                  autoComplete="name"
                  value={name}
                  required
                  minLength={2}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Email address</span>
                <input type="email" value={user?.email || ""} readOnly />
                <small>Your workspace account email.</small>
              </label>
              <label className="field">
                <span>Workspace role</span>
                <input
                  className="reports-capitalize"
                  value={user?.role || ""}
                  readOnly
                />
              </label>
            </div>
            <div className="reports-settings-footer">
              <span>Your changes are saved to this workspace.</span>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || name.trim() === user?.name}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </section>
        <aside>
          <section className="card reports-workspace-info">
            <span className="reports-empty-icon">
              <ShieldCheck size={24} />
            </span>
            <h3>Your learning workspace</h3>
            <p>
              Course content, enrollments, quiz attempts, and grades are saved
              in this workspace’s database.
            </p>
            <div>
              <CheckCircle2 size={16} />
              <span>Persistent course data</span>
            </div>
            <div>
              <CheckCircle2 size={16} />
              <span>Instructor and learner permissions</span>
            </div>
            <div>
              <CheckCircle2 size={16} />
              <span>Server-validated grades</span>
            </div>
          </section>
          <section className="reports-settings-tip">
            <SlidersHorizontal size={20} />
            <div>
              <h4>Looking for course settings?</h4>
              <p>
                Open a course to manage its schedule, prerequisites, grading
                weights, and enrollment rules.
              </p>
            </div>
          </section>
        </aside>
      </div>
      <AccountSecurity user={user} notify={notify} onRefresh={onRefresh} />
    </div>
  );
}
