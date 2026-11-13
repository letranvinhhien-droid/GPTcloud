import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Gamepad2,
  Layers3,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { api } from "../api";
import "./native-library.css";

const kinds = {
  quiz: { label: "Quiz", Icon: FileQuestion, noun: "questions" },
  matching: { label: "Matching game", Icon: Link2, noun: "pairs" },
  sequence: { label: "Sequence game", Icon: Layers3, noun: "steps" },
};

function ActivityArt({ type }) {
  const { Icon } = kinds[type];
  return (
    <div className={`nl-art nl-art-${type}`} aria-hidden="true">
      <span className="nl-art-grid" />
      <span className="nl-art-orbit nl-art-orbit-one" />
      <span className="nl-art-orbit nl-art-orbit-two" />
      <span className="nl-art-icon">
        <Icon size={34} strokeWidth={1.5} />
      </span>
      <span className="nl-art-token nl-art-token-one">
        {type === "sequence" ? "01" : "A"}
      </span>
      <span className="nl-art-token nl-art-token-two">
        {type === "sequence" ? "02" : type === "matching" ? "B" : "✓"}
      </span>
    </div>
  );
}

export default function ContentLibrary({ courses = [], user, onOpenCourse }) {
  const staff = user?.role !== "learner";
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(0);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [builderCourse, setBuilderCourse] = useState("");
  const courseIds = courses.map((course) => course.id).join(",");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(0);
    setActivities([]);
    const ids = courseIds ? courseIds.split(",") : [];
    Promise.all(
      ids.map(async (id) => {
        const [detail, games] = await Promise.allSettled([
          api(`/courses/${id}`),
          api(`/courses/${id}/games`),
        ]);
        return { id, detail, games };
      }),
    ).then((results) => {
      if (!active) return;
      const next = [];
      let errors = 0;
      for (const { id, detail, games } of results) {
        const data = detail.status === "fulfilled" ? detail.value : null;
        if (!data || games.status === "rejected") errors++;
        const available =
          staff || Boolean(data?.enrollment && data?.eligibility?.allowed);
        const quizzes = data?.quizzes || [];
        // Course outlines expose titles even before enrollment, but never answers.
        const quizOutlines = (data?.modules || [])
          .flatMap((module) => module.items || [])
          .filter((item) => item.type === "quiz" && item.quizId);
        const listedQuizzes = quizzes.length
          ? quizzes
          : [
              ...new Map(
                quizOutlines.map((item) => [
                  item.quizId,
                  { id: item.quizId, title: item.title, published: true },
                ]),
              ).values(),
            ];
        for (const quiz of listedQuizzes) {
          next.push({
            ...quiz,
            courseId: id,
            activityType: "quiz",
            kind: "quiz",
            count: quiz.questionCount ?? quiz.questions?.length,
            available,
          });
        }
        for (const game of games.status === "fulfilled"
          ? games.value.games || []
          : data?.games || []) {
          next.push({
            ...game,
            courseId: id,
            activityType: "game",
            kind: game.type,
            count:
              game.itemCount ?? game.pairs?.length ?? game.sequence?.length,
            available,
          });
        }
      }
      setActivities(next);
      setFailed(errors);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [courseIds, user?.id, staff, retry]);

  const courseMap = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );
  const shown = activities.filter((activity) => {
    const course = courseMap.get(activity.courseId);
    return (
      (filter === "all" || activity.kind === filter) &&
      (courseFilter === "all" || activity.courseId === courseFilter) &&
      `${activity.title} ${activity.description || ""} ${course?.title || ""} ${course?.code || ""}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    );
  });
  const selectedBuilder = courses.some((course) => course.id === builderCourse)
    ? builderCourse
    : courses[0]?.id || "";
  const gamesCount = activities.filter(
    (activity) => activity.activityType === "game",
  ).length;

  return (
    <section className="nl-page">
      <div className="page-heading nl-heading">
        <div>
          <p className="eyebrow">YOUR LEARNING TOOLKIT</p>
          <h1>Content library</h1>
          <p>Thoughtful questions. Playful challenges. Meaningful learning.</p>
        </div>
        <span className="nl-native-tag">
          <CheckCircle2 size={15} /> Built into Meridian
        </span>
      </div>

      <div className="nl-banner">
        <div className="nl-banner-copy">
          <span className="nl-banner-eyebrow">
            <Gamepad2 size={16} /> MORE WAYS TO LEARN
          </span>
          <h2>
            Turn knowledge into
            <br />a little discovery.
          </h2>
          <p>
            Explore quizzes, make connections, and put ideas in order. Every
            scored attempt contributes to your course gradebook and learning
            analytics.
          </p>
        </div>
        <div className="nl-banner-art" aria-hidden="true">
          <span className="nl-mini-card nl-mini-quiz">
            <FileQuestion size={25} />
            <b>Think it through</b>
            <span>Native quizzes</span>
          </span>
          <span className="nl-mini-card nl-mini-match">
            <Link2 size={25} />
            <b>Make a connection</b>
            <span>Matching games</span>
          </span>
          <span className="nl-mini-card nl-mini-sequence">
            <Layers3 size={25} />
            <b>Find the flow</b>
            <span>Sequence games</span>
          </span>
        </div>
      </div>

      {staff && courses.length > 0 && (
        <div className="nl-builder card">
          <span className="nl-builder-icon">
            <Plus size={21} />
          </span>
          <div className="nl-builder-copy">
            <h3>Make something worth learning</h3>
            <p>Choose a course to create or manage its activities.</p>
          </div>
          <label className="nl-builder-select">
            <span className="nl-sr-only">Course for new activity</span>
            <select
              value={selectedBuilder}
              onChange={(event) => setBuilderCourse(event.target.value)}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <div className="nl-builder-buttons">
            <button
              className="btn btn-secondary"
              onClick={() => onOpenCourse(selectedBuilder, { type: "quiz" })}
            >
              <FileQuestion size={15} /> Quiz tools
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onOpenCourse(selectedBuilder, { type: "game" })}
            >
              <Gamepad2 size={15} /> Game tools
            </button>
          </div>
        </div>
      )}

      <div className="nl-collection-heading">
        <div>
          <h2>Your activity collection</h2>
          <p>
            {loading
              ? "Finding activities across your courses…"
              : `${activities.length - gamesCount} quizzes · ${gamesCount} games across ${courses.length} courses`}
          </p>
        </div>
        <span className="nl-collection-note">
          <Target size={15} /> Scores stay connected to each course
        </span>
      </div>
      <div className="nl-tools">
        <div
          className="nl-filters"
          role="group"
          aria-label="Filter activity type"
        >
          {[
            ["all", "All activities"],
            ["quiz", "Quizzes"],
            ["matching", "Matching"],
            ["sequence", "Sequencing"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="nl-search-tools">
          <label className="nl-search">
            <Search size={16} />
            <input
              aria-label="Search activities"
              placeholder="Find an activity…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="nl-course-filter">
            <SlidersHorizontal size={15} />
            <span className="nl-sr-only">Filter library by course</span>
            <select
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
            >
              <option value="all">All courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {failed > 0 && (
        <div className="nl-error" role="alert">
          <span>
            Some course activities could not be loaded. Showing the activities
            available now.
          </span>
          <button
            className="text-link"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {loading ? (
        <div className="nl-empty" role="status">
          <LoaderCircle className="nl-spin" size={26} />
          <h3>Opening your library…</h3>
        </div>
      ) : shown.length ? (
        <div className="nl-grid">
          {shown.map((activity) => {
            const kind = kinds[activity.kind] || kinds.quiz;
            const course = courseMap.get(activity.courseId);
            return (
              <article
                className="card nl-card"
                key={`${activity.activityType}:${activity.id}`}
              >
                <ActivityArt
                  type={activity.kind in kinds ? activity.kind : "quiz"}
                />
                <div className="nl-card-body">
                  <div className="nl-card-kicker">
                    <span>{kind.label}</span>
                    {staff && (
                      <span
                        className={`badge ${activity.published ? "published" : "draft"}`}
                      >
                        {activity.published ? "Published" : "Draft"}
                      </span>
                    )}
                  </div>
                  <h3>{activity.title}</h3>
                  <p className="nl-card-course">
                    <BookOpen size={13} />
                    <span>{course?.title || "Course"}</span>
                  </p>
                  <p className="nl-card-description">
                    {activity.description ||
                      (activity.kind === "matching"
                        ? "Connect each prompt with its matching answer."
                        : activity.kind === "sequence"
                          ? "Arrange the steps in the right order."
                          : "Check your understanding and put what you know into practice.")}
                  </p>
                  <div className="nl-card-details">
                    <span>
                      <kind.Icon size={13} />
                      {activity.count == null
                        ? "Course quiz"
                        : `${activity.count} ${kind.noun}`}
                    </span>
                    {activity.timeLimit != null && (
                      <span>
                        <Clock3 size={13} />
                        {activity.timeLimit
                          ? `${activity.timeLimit} min`
                          : "Self-paced"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="nl-card-footer">
                  <span>
                    {!staff && !activity.available
                      ? "Course access required"
                      : activity.passingScore == null
                        ? "Native assessment"
                        : `${activity.passingScore}% to pass`}
                  </span>
                  <button
                    className="text-link"
                    onClick={() =>
                      onOpenCourse(
                        activity.courseId,
                        activity.available
                          ? { type: activity.activityType, id: activity.id }
                          : undefined,
                      )
                    }
                  >
                    {staff
                      ? "Open activity"
                      : activity.available
                        ? activity.activityType === "game"
                          ? "Play game"
                          : "Open quiz"
                        : "View course"}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card nl-empty">
          <BookOpen size={30} />
          <h3>
            {activities.length
              ? "No activities match your search"
              : "A little curiosity starts here"}
          </h3>
          <p>
            {activities.length
              ? "Try another phrase, activity type, or course."
              : staff
                ? "Open a course’s quiz or game tools to create your first activity."
                : "Published quizzes and games will appear here as your instructors add them."}
          </p>
          {activities.length > 0 && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setSearch("");
                setFilter("all");
                setCourseFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {!loading && shown.length > 0 && (
        <p className="nl-footer-note">
          Showing {shown.length} of {activities.length} activities. Course
          access, prerequisites, and attempt limits apply.
        </p>
      )}
    </section>
  );
}
