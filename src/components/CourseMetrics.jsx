import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Gauge,
  HeartPulse,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { api } from "../api";
import "./course-metrics.css";

const groups = {
  health: { label: "Course health", short: "Health", Icon: HeartPulse },
  progress: { label: "Learning progress", short: "Progress", Icon: TrendingUp },
  achievement: {
    label: "Learner achievement",
    short: "Achievement",
    Icon: Trophy,
  },
};
const newMetricId = () =>
  globalThis.crypto?.randomUUID?.() ||
  `metric-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const states = {
  healthy: "On target",
  watch: "Watch",
  "at-risk": "Needs attention",
  "no-data": "No data",
};
const percent = (value) =>
  value == null
    ? "—"
    : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const clamp = (value) => Math.min(100, Math.max(0, num(value)));
const formatDuration = (value) => {
  if (value == null) return "—";
  const seconds = Math.round(value);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};
const courseTypes = (type) =>
  type === "quiz"
    ? "Quiz"
    : type === "matching"
      ? "Matching game"
      : type === "sequence"
        ? "Sequence game"
        : "Game";
function Status({ state }) {
  return (
    <span className={`cm-status cm-status-${state || "no-data"}`}>
      <i />
      {states[state] || states["no-data"]}
    </span>
  );
}
function Empty({ title, children, icon: Icon = BarChart3 }) {
  return (
    <div className="cm-empty">
      <span>
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function MetricCard({ metric, catalog }) {
  const group = groups[metric.category] || groups.health;
  const Icon = group.Icon;
  const source = catalog.find((entry) => entry.measure === metric.measure);
  return (
    <article className={`card cm-metric cm-group-${metric.category}`}>
      <div className="cm-metric-top">
        <span className="cm-category">
          <Icon size={14} />
          {group.short}
        </span>
        <Status state={metric.state} />
      </div>
      <h3>{metric.name}</h3>
      <div className="cm-metric-value">
        <strong>{percent(metric.value)}</strong>
        <span>
          target <b>{percent(metric.target)}</b>
        </span>
      </div>
      <div
        className="cm-target-track"
        role="img"
        aria-label={`${metric.name}: ${metric.value == null ? "No data" : percent(metric.value)}; target ${percent(metric.target)}`}
      >
        <span style={{ width: `${clamp(metric.value)}%` }} />
        <i
          style={{ left: `${clamp(metric.target)}%` }}
          title={`Target ${percent(metric.target)}`}
        />
      </div>
      <p className="cm-metric-definition">
        {metric.description ||
          source?.description ||
          "Based on recorded learning activity."}
      </p>
      <div className="cm-metric-bottom">
        <span>
          {(metric.scope || source?.scope) === "snapshot"
            ? "Current snapshot"
            : `Last ${metric.windowDays} days`}
        </span>
        <span>Sample: {metric.sampleSize ?? 0}</span>
      </div>
    </article>
  );
}

function ActivityChart({ activity, days }) {
  const [series, setSeries] = useState("attempts");
  const [view, setView] = useState("chart");
  const labels = {
    attempts: "Assessment attempts",
    completions: "Activities completed",
    activeLearners: "Active learners",
  };
  const descriptionId = useId();
  const max = Math.max(1, ...activity.map((row) => num(row[series])));
  const left = 39,
    top = 13,
    bottom = 186,
    width = 580,
    height = bottom - top;
  const step = width / Math.max(1, activity.length);
  const selectedTotal =
    series === "activeLearners"
      ? null
      : activity.reduce((sum, row) => sum + num(row[series]), 0);
  const labelIndexes = new Set(
    activity
      .map((_, index) => index)
      .filter(
        (index) =>
          index === 0 ||
          index === activity.length - 1 ||
          index % Math.max(1, Math.ceil(activity.length / 6)) === 0,
      ),
  );
  return (
    <section className="card cm-chart-card">
      <div className="cm-section-heading">
        <div>
          <p className="eyebrow">LEARNING IN MOTION</p>
          <h2>Activity over time</h2>
          <p>{days} days of recorded learner activity · UTC</p>
        </div>
        <div className="cm-view-toggle" aria-label="Activity display">
          <button
            className={view === "chart" ? "active" : ""}
            aria-pressed={view === "chart"}
            aria-label="Show activity chart"
            onClick={() => setView("chart")}
          >
            <BarChart3 size={16} />
          </button>
          <button
            className={view === "table" ? "active" : ""}
            aria-pressed={view === "table"}
            aria-label="Show activity data table"
            onClick={() => setView("table")}
          >
            <Table2 size={16} />
          </button>
        </div>
      </div>
      <div className="cm-chart-controls">
        <div className="cm-series-tabs">
          {Object.entries(labels).map(([key, label]) => (
            <button
              key={key}
              className={series === key ? "active" : ""}
              aria-pressed={series === key}
              onClick={() => setSeries(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {selectedTotal !== null && (
          <span className="cm-chart-total">
            <strong>{selectedTotal.toLocaleString()}</strong> in this period
          </span>
        )}
      </div>
      {activity.length ? (
        view === "table" ? (
          <div className="table-wrap cm-activity-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date (UTC)</th>
                  <th>Assessment attempts</th>
                  <th>Activities completed</th>
                  <th>Active learners</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.attempts}</td>
                    <td>{row.completions}</td>
                    <td>{row.activeLearners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <svg
              className="cm-activity-chart"
              viewBox="0 0 640 225"
              role="img"
              aria-label={`${labels[series]} over the last ${days} days`}
              aria-describedby={descriptionId}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                const y = bottom - ratio * height;
                return (
                  <g key={index}>
                    <line
                      x1={left}
                      x2={left + width}
                      y1={y}
                      y2={y}
                      stroke="#e9eee2"
                      strokeDasharray={ratio === 0 ? undefined : "3 4"}
                    />
                    <text
                      x={left - 10}
                      y={y + 3}
                      textAnchor="end"
                      className="cm-chart-axis"
                    >
                      {Number((max * ratio).toFixed(1))}
                    </text>
                  </g>
                );
              })}
              {activity.map((row, index) => {
                const value = num(row[series]);
                const barHeight = (value / max) * height;
                const barWidth = Math.max(2, Math.min(34, step * 0.58));
                return (
                  <g key={row.date}>
                    <rect
                      className="cm-chart-bar"
                      x={left + index * step + (step - barWidth) / 2}
                      y={bottom - barHeight}
                      width={barWidth}
                      height={barHeight}
                      rx={Math.min(4, barWidth / 3)}
                      tabIndex={value ? 0 : undefined}
                    >
                      <title>
                        {row.date}: {value} {labels[series].toLowerCase()}
                      </title>
                    </rect>
                    {labelIndexes.has(index) && (
                      <text
                        x={left + index * step + step / 2}
                        y={bottom + 24}
                        textAnchor="middle"
                        className="cm-chart-axis"
                      >
                        {row.label || row.date.slice(5)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <p id={descriptionId} className="cm-chart-description">
              {labels[series]} per day. Hover or focus a bar for its value, or
              switch to the table to see every date.
            </p>
          </>
        )
      ) : (
        <Empty title="Your learning story is just beginning">
          Recorded activity will appear here as learners explore courses and
          assessments.
        </Empty>
      )}
    </section>
  );
}

function MetricEditor({ initialRules, catalog, onClose, onSave }) {
  const [rules, setRules] = useState(() => structuredClone(initialRules));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const modal = useRef(null),
    closeRef = useRef(onClose),
    busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.current?.querySelector("button,input,select")?.focus();
    const listener = (e) => {
      if (e.key === "Escape" && !busyRef.current) closeRef.current();
      if (e.key === "Tab") {
        const controls = [
          ...modal.current.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
          ),
        ].filter((el) => el.offsetParent !== null);
        const first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  const update = (id, patch) =>
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
  function add() {
    const entry =
      catalog.find(
        (source) => !rules.some((rule) => rule.measure === source.measure),
      ) || catalog[0];
    if (!entry) return;
    setRules((current) => [
      ...current,
      {
        id: newMetricId(),
        name: entry.name,
        category: entry.category,
        measure: entry.measure,
        target: 75,
        warningThreshold: 50,
        windowDays: 30,
        enabled: true,
      },
    ]);
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (rules.length > 12) return setError("Choose up to 12 metrics.");
    for (const rule of rules) {
      if (!rule.name.trim()) return setError("Give each metric a name.");
      if (
        !Number.isFinite(Number(rule.target)) ||
        !Number.isFinite(Number(rule.warningThreshold)) ||
        Number(rule.target) <= Number(rule.warningThreshold)
      )
        return setError(
          "Every target must be higher than its watch threshold.",
        );
    }
    setBusy(true);
    try {
      await onSave(
        rules.map((rule) => ({
          ...rule,
          name: rule.name.trim(),
          target: Number(rule.target),
          warningThreshold: Number(rule.warningThreshold),
          windowDays: Number(rule.windowDays),
        })),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={modal}
        className="modal cm-config-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Configure course metrics"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">DEFINE WHAT SUCCESS LOOKS LIKE</p>
            <h2>Configure course metrics</h2>
            <p>Choose measures and set targets for your learning community.</p>
          </div>
          <button
            className="icon-btn"
            aria-label="Close metric configuration"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="cm-config-body">
            <div className="cm-config-note">
              <Info size={18} />
              <p>
                <strong>Your targets, your perspective.</strong> On target means
                at or above the target. Watch means at or above the watch
                threshold. Lower results need attention. Empty samples always
                show “No data”.
              </p>
            </div>
            <div className="cm-config-rules">
              {rules.map((rule, index) => {
                const entry = catalog.find(
                  (source) => source.measure === rule.measure,
                );
                const category = groups[rule.category] || groups.health;
                const Icon = category.Icon;
                return (
                  <article className="cm-config-rule" key={rule.id}>
                    <div className="cm-rule-heading">
                      <span
                        className={`cm-rule-number cm-group-${rule.category}`}
                      >
                        <Icon size={17} />
                      </span>
                      <strong>Metric {index + 1}</strong>
                      <label className="cm-enable">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) =>
                            update(rule.id, { enabled: e.target.checked })
                          }
                          aria-label={`Enable metric ${index + 1}`}
                        />
                        <span>Enabled</span>
                      </label>
                      <button
                        className="icon-btn"
                        type="button"
                        aria-label={`Remove metric ${index + 1}`}
                        onClick={() =>
                          setRules((current) =>
                            current.filter((item) => item.id !== rule.id),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="cm-rule-fields">
                      <label className="field">
                        Metric name
                        <input
                          aria-label={`Metric ${index + 1} name`}
                          required
                          maxLength={80}
                          value={rule.name}
                          onChange={(e) =>
                            update(rule.id, { name: e.target.value })
                          }
                        />
                      </label>
                      <div className="form-grid">
                        <label className="field">
                          Category
                          <select
                            aria-label={`Metric ${index + 1} category`}
                            value={rule.category}
                            onChange={(e) => {
                              const source = catalog.find(
                                (item) => item.category === e.target.value,
                              );
                              if (source)
                                update(rule.id, {
                                  category: source.category,
                                  measure: source.measure,
                                });
                            }}
                          >
                            {Object.entries(groups).map(([key, group]) => (
                              <option key={key} value={key}>
                                {group.short}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Measure
                          <select
                            aria-label={`Metric ${index + 1} measure`}
                            value={rule.measure}
                            onChange={(e) => {
                              const source = catalog.find(
                                (item) => item.measure === e.target.value,
                              );
                              update(rule.id, {
                                measure: source.measure,
                                category: source.category,
                              });
                            }}
                          >
                            {catalog
                              .filter(
                                (source) => source.category === rule.category,
                              )
                              .map((source) => (
                                <option
                                  key={source.measure}
                                  value={source.measure}
                                >
                                  {source.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      <p className="cm-source-description">
                        {entry?.description}
                      </p>
                      <div className="cm-rule-thresholds">
                        <label className="field">
                          Target (%)
                          <input
                            aria-label={`Metric ${index + 1} target`}
                            required
                            min="1"
                            max="100"
                            step="0.1"
                            type="number"
                            value={rule.target}
                            onChange={(e) =>
                              update(rule.id, { target: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          Watch threshold (%)
                          <input
                            aria-label={`Metric ${index + 1} watch threshold`}
                            required
                            min="0"
                            max="99.9"
                            step="0.1"
                            type="number"
                            value={rule.warningThreshold}
                            onChange={(e) =>
                              update(rule.id, {
                                warningThreshold: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          Lookback
                          <select
                            aria-label={`Metric ${index + 1} lookback`}
                            value={rule.windowDays}
                            disabled={entry?.scope === "snapshot"}
                            onChange={(e) =>
                              update(rule.id, {
                                windowDays: Number(e.target.value),
                              })
                            }
                          >
                            {[7, 30, 90].map((day) => (
                              <option value={day} key={day}>
                                Last {day} days
                              </option>
                            ))}
                          </select>
                          <small>
                            {entry?.scope === "snapshot"
                              ? "Uses the current course snapshot."
                              : "Uses activity in this time window."}
                          </small>
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {!rules.length && (
              <Empty title="Measure what matters to you" icon={Target}>
                Add a metric for course health, progress, or achievement. Saved
                settings apply across your workspace.
              </Empty>
            )}
            <button
              className="btn btn-secondary cm-add-metric"
              type="button"
              disabled={rules.length >= 12 || !catalog.length}
              onClick={add}
            >
              <Plus size={16} />
              Add metric <span>{rules.length}/12</span>
            </button>
            {error && (
              <p className="cm-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <span className="cm-config-footnote">
              Only admins can change these workspace metrics.
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="cm-spin" />
              ) : (
                <Check size={16} />
              )}{" "}
              {busy ? "Saving…" : "Save metrics"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function CourseMetrics({ courses = [], user, notify }) {
  const [courseId, setCourseId] = useState("all"),
    [days, setDays] = useState(30),
    [category, setCategory] = useState("all"),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [knownCourses, setKnownCourses] = useState([]),
    [editor, setEditor] = useState(null),
    [configLoading, setConfigLoading] = useState(false),
    [assessmentType, setAssessmentType] = useState("all");
  const requestId = useRef(0);
  const reload = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    setCourseId("all");
    setKnownCourses([]);
    setEditor(null);
  }, [user?.id]);
  useEffect(() => {
    const request = ++requestId.current;
    setLoading(true);
    setError("");
    api(`/metrics?courseId=${encodeURIComponent(courseId)}&days=${days}`)
      .then((result) => {
        if (request !== requestId.current) return;
        setData(result);
        if (courseId === "all") setKnownCourses(result.courseHealth || []);
      })
      .catch((e) => {
        if (request === requestId.current) setError(e.message);
      })
      .finally(() => {
        if (request === requestId.current) setLoading(false);
      });
    return () => {
      requestId.current++;
    };
  }, [courseId, days, retry, user?.id]);
  const metrics = data?.metrics || [],
    catalog = data?.catalog || [],
    rules = data?.rules || [];
  const displayed = metrics.filter(
    (metric) => category === "all" || metric.category === category,
  );
  const canEdit = user?.role === "admin" && data?.canEdit;
  const selectable =
    user?.role === "learner"
      ? knownCourses.map((course) => ({
          id: course.courseId,
          title: course.title,
        }))
      : courses;
  const assessments = (data?.assessments || []).filter(
    (item) =>
      assessmentType === "all" ||
      (assessmentType === "quiz" ? item.type === "quiz" : item.type !== "quiz"),
  );
  const healthy = metrics.filter((metric) => metric.state === "healthy").length;
  const measured = metrics.filter((metric) => metric.value != null).length;
  async function configure() {
    setConfigLoading(true);
    try {
      const config = await api("/metrics/config");
      if (!config.canEdit)
        throw new Error("Only admins can configure course metrics.");
      setEditor(config);
    } catch (e) {
      notify?.(e.message, "error");
    } finally {
      setConfigLoading(false);
    }
  }
  async function save(rules) {
    await api("/metrics/config", { method: "PUT", body: { rules } });
    setEditor(null);
    reload();
    notify?.(
      "Course metrics updated. Your targets are now reflected in analytics.",
    );
  }
  function exportMetrics() {
    if (!data) return;
    const cell = (value) => {
      let text = value == null ? "" : String(value);
      if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const rows = [
      [
        "Report",
        "Course scope",
        "Metric or assessment",
        "Category or type",
        "Value (%)",
        "Target (%)",
        "Watch threshold (%)",
        "Status",
        "Sample or attempts",
        "Lookback days",
        "Average duration (seconds)",
      ],
      ...metrics.map((metric) => [
        "Metric",
        data.scope?.courseTitle || courseId,
        metric.name,
        metric.category,
        metric.value,
        metric.target,
        metric.warningThreshold,
        metric.state,
        metric.sampleSize,
        metric.scope === "snapshot" ? "Current snapshot" : metric.windowDays,
        "",
      ]),
      ...(data.assessments || []).map((item) => [
        "Assessment",
        courses.find((course) => course.id === item.courseId)?.title ||
          item.courseId,
        item.title,
        courseTypes(item.type),
        item.averageScore,
        "",
        "",
        item.passRate == null
          ? "No graded results"
          : `${item.passRate}% pass rate`,
        item.attempts,
        days,
        item.averageDurationSeconds,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meridian-metrics-${courseId}-${days}d.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify?.("Metrics and assessment results exported.");
  }
  return (
    <div className="cm-page">
      <div className="page-heading cm-page-heading">
        <div>
          <p className="eyebrow">THE BIGGER PICTURE</p>
          <h1>Learning analytics</h1>
          <p>Know what’s working. See where a little support can go further.</p>
        </div>
        <div className="cm-header-actions">
          <button
            className="btn btn-secondary"
            disabled={!data || loading}
            onClick={exportMetrics}
          >
            <ArrowDownToLine size={16} />
            Export report
          </button>
          {canEdit && (
            <button
              className="btn btn-primary"
              disabled={configLoading}
              onClick={configure}
            >
              {configLoading ? (
                <LoaderCircle size={16} className="cm-spin" />
              ) : (
                <Settings2 size={16} />
              )}
              Configure metrics
            </button>
          )}
        </div>
      </div>
      <div className="cm-toolbar">
        <label>
          <BookOpen size={16} />
          <span className="cm-visually-hidden">Course scope</span>
          <select
            aria-label="Analytics course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="all">
              {user?.role === "learner" ? "All my courses" : "All courses"}
            </option>
            {selectable.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <label>
          <Clock3 size={16} />
          <span className="cm-visually-hidden">Activity date range</span>
          <select
            aria-label="Analytics activity range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 30, 90].map((day) => (
              <option value={day} key={day}>
                Last {day} days
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <span className="cm-scope-note">
          <ShieldCheck size={15} />
          {user?.role === "learner"
            ? "Your learning activity and results"
            : "Live data from your learning community"}
        </span>
        <button
          className="icon-btn"
          aria-label="Refresh analytics"
          disabled={loading}
          onClick={reload}
        >
          <RefreshCw size={17} className={loading ? "cm-spin" : ""} />
        </button>
      </div>
      {error ? (
        <div className="cm-error" role="alert">
          <span>{error}</span>
          <button className="btn btn-secondary" onClick={reload}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="cm-loading" role="status">
          <LoaderCircle size={24} className="cm-spin" />
          <span>Gathering your learning insights…</span>
        </div>
      ) : (
        data && (
          <>
            <div className="cm-overview-strip">
              <div className="cm-overview-icon">
                <Gauge size={25} />
              </div>
              <div>
                <h2>
                  {measured
                    ? `${healthy} of ${measured} measured targets on track`
                    : "A clear view starts with learning activity"}
                </h2>
                <p>
                  {measured
                    ? "Use your targets to guide support, celebrate progress, and improve your courses."
                    : "Metrics show “No data” until their sample includes recorded learning or grades."}
                </p>
              </div>
              <span className="cm-update-note">
                <i />
                Updated{" "}
                {data.updatedAt
                  ? new Date(data.updatedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "now"}
              </span>
            </div>
            <div className="cm-metric-section">
              <div className="cm-category-tabs" aria-label="Metric category">
                {[
                  ["all", "All metrics"],
                  ...Object.entries(groups).map(([key, group]) => [
                    key,
                    group.short,
                  ]),
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={category === key ? "active" : ""}
                    aria-pressed={category === key}
                    onClick={() => setCategory(key)}
                  >
                    {label}
                    <span>
                      {key === "all"
                        ? metrics.length
                        : metrics.filter((metric) => metric.category === key)
                            .length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="cm-metrics-grid">
                {displayed.map((metric) => (
                  <MetricCard
                    key={metric.id}
                    metric={metric}
                    catalog={catalog}
                  />
                ))}
              </div>
              {!displayed.length && (
                <section className="card">
                  <Empty
                    icon={Target}
                    title={
                      metrics.length
                        ? "No metrics in this category"
                        : "Define your measures of success"
                    }
                  >
                    {canEdit
                      ? "Configure metrics to choose measures and set targets for your courses."
                      : "Your administrator can add or enable metrics for this workspace."}
                  </Empty>
                  {canEdit && (
                    <div className="cm-empty-action">
                      <button className="btn btn-primary" onClick={configure}>
                        <Plus size={16} />
                        Configure metrics
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
            <ActivityChart activity={data.activity || []} days={days} />
            <section className="card cm-course-health">
              <div className="cm-section-heading">
                <div>
                  <p className="eyebrow">A COURSE-BY-COURSE VIEW</p>
                  <h2>Where learning stands</h2>
                  <p>Compare courses against the same measures of success.</p>
                </div>
                <span className="cm-small-badge">
                  {data.courseHealth?.length || 0} courses
                </span>
              </div>
              {data.courseHealth?.length ? (
                <div className="table-wrap">
                  <table className="data-table cm-table">
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Target attainment</th>
                        {metrics.map((metric) => (
                          <th key={metric.id}>{metric.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.courseHealth.map((course) => (
                        <tr key={course.courseId}>
                          <td>
                            <button
                              className="cm-course-link"
                              onClick={() => setCourseId(course.courseId)}
                            >
                              <span>
                                <BookOpen size={17} />
                              </span>
                              <strong>{course.title}</strong>
                              <ArrowUpRight size={14} />
                            </button>
                          </td>
                          <td>
                            <div className="cm-health-score">
                              <strong>
                                {course.healthScore == null
                                  ? "—"
                                  : `${Math.round(course.healthScore)}%`}
                              </strong>
                              <div className="cm-health-track">
                                <i
                                  style={{
                                    width: `${clamp(course.healthScore)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>
                          {metrics.map((metric) => {
                            const value = course.metrics?.find(
                              (result) => result.id === metric.id,
                            );
                            return (
                              <td key={metric.id}>
                                <span
                                  className={`cm-value-pill cm-value-${value?.state || "no-data"}`}
                                  title={`${states[value?.state] || states["no-data"]} · sample ${value?.sampleSize || 0}`}
                                >
                                  {percent(value?.value)}
                                  <span className="cm-visually-hidden">
                                    {` · ${states[value?.state] || states["no-data"]} · sample ${value?.sampleSize || 0}`}
                                  </span>
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="No course results to compare" icon={BookOpen}>
                  Course results will appear when learners enroll and start
                  making progress.
                </Empty>
              )}
              <p className="cm-table-note">
                <Info size={14} />
                Target attainment averages each measured result as a percentage
                of its target, capped at 100%. Metrics without data are
                excluded.
              </p>
            </section>
            <section className="card cm-assessments">
              <div className="cm-section-heading">
                <div>
                  <p className="eyebrow">PRACTICE INTO PROGRESS</p>
                  <h2>Quizzes & games</h2>
                  <p>Assessment results from the last {days} days.</p>
                </div>
                <select
                  aria-label="Filter assessment type"
                  value={assessmentType}
                  onChange={(e) => setAssessmentType(e.target.value)}
                >
                  <option value="all">All assessments</option>
                  <option value="quiz">Quizzes</option>
                  <option value="game">Games</option>
                </select>
              </div>
              {assessments.length ? (
                <div className="table-wrap">
                  <table className="data-table cm-table">
                    <thead>
                      <tr>
                        <th>Assessment</th>
                        <th>Attempts</th>
                        <th>Average score</th>
                        <th>Pass rate</th>
                        <th>Average time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessments.map((item) => (
                        <tr key={`${item.courseId}:${item.id}`}>
                          <td>
                            <div className="cm-assessment-name">
                              <span
                                className={`cm-assessment-icon ${item.type === "quiz" ? "quiz" : "game"}`}
                              >
                                {item.type === "quiz" ? (
                                  <BookOpen size={17} />
                                ) : (
                                  <Trophy size={17} />
                                )}
                              </span>
                              <div>
                                <strong>{item.title}</strong>
                                <small>
                                  {courseTypes(item.type)} ·{" "}
                                  {courses.find(
                                    (course) => course.id === item.courseId,
                                  )?.title || "Course assessment"}
                                </small>
                              </div>
                            </div>
                          </td>
                          <td>{item.attempts}</td>
                          <td>
                            <strong>{percent(item.averageScore)}</strong>
                          </td>
                          <td>
                            <div className="cm-pass-rate">
                              <span>{percent(item.passRate)}</span>
                              <div>
                                <i
                                  style={{ width: `${clamp(item.passRate)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="cm-time">
                              <Clock3 size={13} />
                              {formatDuration(item.averageDurationSeconds)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon={Trophy} title="Every attempt tells a story">
                  Submitted quizzes and games will appear here as learners put
                  their knowledge into practice.
                </Empty>
              )}
              <p className="cm-table-note">
                Scores and pass rates use graded submissions. Responses awaiting
                instructor review are not treated as failures.
              </p>
            </section>
          </>
        )
      )}
      {editor && canEdit && (
        <MetricEditor
          initialRules={editor.rules || []}
          catalog={editor.catalog || []}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
