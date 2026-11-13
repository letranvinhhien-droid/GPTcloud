import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  Users,
  Library,
  Settings as SettingsIcon,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Bell,
  HelpCircle,
  X,
  Check,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  ClipboardList,
  MoreHorizontal,
  SlidersHorizontal,
  LogOut,
  Menu,
  Leaf,
  Sparkles,
  LayoutGrid,
  List,
  FileText,
  Circle,
  Download,
} from "lucide-react";
import { api } from "./api";
import CourseWorkspace from "./components/CourseWorkspace";
import AuthPage from "./components/AuthPage";
import CourseMetrics from "./components/CourseMetrics";
import ContentLibrary from "./components/NativeLibrary";
import { Gradebook, People, Settings } from "./components/Reports";

const navigation = [
  ["overview", "Overview", LayoutDashboard],
  ["courses", "My courses", BookOpen],
  ["gradebook", "Gradebook", ClipboardList],
  ["analytics", "Analytics", BarChart3],
  ["people", "People", Users],
  ["library", "Content library", Library],
];
const colors = {
  design: "#e8d3bf",
  code: "#d8e4dc",
  marketing: "#e2def0",
  photo: "#e4e6d0",
  business: "#d7e2e9",
  data: "#f0dfce",
};
function readRoute() {
  const hash = window.location.hash.slice(1);
  return hash || "overview";
}
function Logo() {
  return (
    <span className="brand-symbol">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M6 25V7l10 11L26 7v18M16 18v7"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
export function CoverArt({ type = "design", large = false }) {
  return (
    <div
      className={"course-art art-" + type + (large ? " large" : "")}
      style={{ background: colors[type] || colors.design }}
    >
      <svg
        viewBox="0 0 500 200"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
      >
        {type === "design" ? (
          <>
            <circle cx="100" cy="48" r="77" fill="#dca780" />
            <path d="M72 186V86a65 65 0 01130 0v100z" fill="#b76543" />
            <path d="M130 200V109a37 37 0 0174 0v91z" fill="#f4ead9" />
            <rect
              x="300"
              y="-35"
              width="120"
              height="220"
              rx="60"
              transform="rotate(28 300 -35)"
              fill="#edd8bb"
            />
            <circle cx="391" cy="132" r="48" fill="#8e9e81" />
            <path
              d="M351 132h80m-40-40v80"
              stroke="#d9dfca"
              strokeWidth="1.5"
            />
            <rect
              x="226"
              y="67"
              width="51"
              height="51"
              transform="rotate(20 226 67)"
              fill="#e9b64e"
            />
          </>
        ) : type === "code" ? (
          <>
            <circle cx="421" cy="35" r="105" fill="#bdcfc1" />
            <path
              d="M0 170L250 45l250 170"
              stroke="#b5caba"
              strokeWidth="1"
              fill="none"
            />
            <rect
              x="103"
              y="31"
              width="274"
              height="154"
              rx="11"
              fill="#3e6054"
              transform="rotate(-5 240 110)"
            />
            <rect
              x="116"
              y="46"
              width="248"
              height="124"
              rx="5"
              fill="#ebf1e7"
              transform="rotate(-5 240 110)"
            />
            <path
              d="M194 81l-27 27 27 22m99-57l28 22-24 27m-47-52l-14 68"
              stroke="#5c7860"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="64" cy="63" r="22" fill="#e0e8ac" />
            <path d="M376 176l24-40 24 40z" fill="#95af92" />
          </>
        ) : type === "marketing" ? (
          <>
            <circle cx="122" cy="111" r="94" fill="#c7bfdc" />
            <circle cx="122" cy="111" r="61" fill="#dcd5ea" />
            <circle cx="122" cy="111" r="27" fill="#927fbb" />
            <path
              d="M282 149h37V99h-37zm55 0h37V65h-37zm55 0h37V29h-37z"
              fill="#9c8ab8"
            />
            <path
              d="M267 64l106-32-18 35"
              fill="none"
              stroke="#725d95"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <circle cx="233" cy="154" r="20" fill="#eeebce" />
          </>
        ) : type === "photo" ? (
          <>
            <circle cx="375" cy="26" r="103" fill="#cfd3ac" />
            <rect
              x="110"
              y="50"
              width="264"
              height="139"
              rx="17"
              fill="#7c8460"
              transform="rotate(-8 240 100)"
            />
            <path d="M173 50l16-23h84l13 23" fill="#7c8460" />
            <circle cx="242" cy="109" r="61" fill="#b5bc91" />
            <circle cx="242" cy="109" r="47" fill="#394d44" />
            <circle cx="242" cy="109" r="27" fill="#90a78b" />
            <circle cx="254" cy="97" r="10" fill="#d9e3bd" />
            <rect x="326" y="64" width="27" height="15" rx="4" fill="#e8ebcc" />
            <path d="M55 155l25-43 25 43z" fill="#b5b895" />
          </>
        ) : type === "business" ? (
          <>
            <circle cx="420" cy="104" r="116" fill="#c1d2dc" />
            <rect x="84" y="65" width="87" height="135" fill="#6b8c9d" />
            <rect x="189" y="39" width="87" height="161" fill="#91aebc" />
            <rect x="294" y="94" width="87" height="106" fill="#b1c5cd" />
            <path
              d="M91 40l75-26 67 14 91-35"
              stroke="#516f7c"
              strokeWidth="3"
              fill="none"
            />
            <circle cx="391" cy="40" r="22" fill="#edf0d3" />
          </>
        ) : (
          <>
            <circle cx="110" cy="100" r="84" fill="#e4b991" />
            <circle cx="110" cy="100" r="47" fill="#f0dfce" />
            <path
              d="M267 166V103m44 63V71m44 95V42m44 124V84"
              stroke="#b58564"
              strokeWidth="27"
            />
            <path
              d="M231 55l73-30 68 12 72-48"
              stroke="#8c6d50"
              strokeWidth="3"
              fill="none"
            />
            <circle cx="213" cy="161" r="18" fill="#bfc89a" />
          </>
        )}
      </svg>
      <span className="art-grain" />
    </div>
  );
}
function App() {
  const [route, setRoute] = useState(readRoute),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(null),
    [showCreate, setShowCreate] = useState(false),
    [search, setSearch] = useState(""),
    [showSearch, setShowSearch] = useState(false),
    [showNotifications, setShowNotifications] = useState(false),
    [showHelp, setShowHelp] = useState(false),
    [showCalendar, setShowCalendar] = useState(false),
    [mobile, setMobile] = useState(false),
    [accountMenu, setAccountMenu] = useState(false),
    [loading, setLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState({
    demoEnabled: false,
    registrationEnabled: true,
  });
  const notify = useCallback(
    (message, type = "success") => setToast({ message, type }),
    [],
  );
  const refresh = useCallback(async () => {
    const next = await api("/bootstrap");
    setData(next);
    return next;
  }, []);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [next, config] = await Promise.all([
          api("/bootstrap"),
          api("/auth/config"),
        ]);
        if (active) {
          setData(next);
          setAuthConfig(config);
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const change = () => {
      setRoute(readRoute());
      setMobile(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") {
        setShowCreate(false);
        setShowSearch(false);
        setShowNotifications(false);
        setShowHelp(false);
        setShowCalendar(false);
        setAccountMenu(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const go = (next) => {
    window.location.hash = next;
    setShowSearch(false);
    setMobile(false);
  };
  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      setAccountMenu(false);
      setToast(null);
      setData({ user: null });
      go("overview");
    } catch (err) {
      notify(err.message, "error");
    }
  }
  useEffect(() => {
    const expired = () => {
      setData({ user: null });
      setAccountMenu(false);
      setShowCreate(false);
      setToast(null);
    };
    window.addEventListener("meridian:session-expired", expired);
    return () =>
      window.removeEventListener("meridian:session-expired", expired);
  }, []);
  async function switchRole(role) {
    try {
      await api("/auth/demo", { method: "POST", body: { role } });
      await refresh();
      setAccountMenu(false);
      go("overview");
      notify("Switched to " + role + " workspace");
    } catch (e) {
      notify(e.message, "error");
    }
  }
  if (loading)
    return (
      <div className="app-loading">
        <Logo />
        <span>
          Opening your workspace<span className="loading-dots">…</span>
        </span>
      </div>
    );
  if (error)
    return (
      <div className="app-loading">
        <Logo />
        <h2>Let’s get connected</h2>
        <p>{error || "Sign in to your workspace."}</p>
        <button
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  if (!data?.user)
    return (
      <AuthPage
        {...authConfig}
        onAuthenticated={async () => {
          const [, config] = await Promise.all([
            refresh(),
            api("/auth/config"),
          ]);
          setAuthConfig(config);
          go("overview");
        }}
      />
    );
  const {
    user,
    courses = [],
    learners = [],
    activities = [],
    tasks = [],
    analytics = {},
  } = data;
  const courseId = route.startsWith("course/") ? route.split("/")[1] : null;
  const title = courseId
    ? "My courses"
    : navigation.find((n) => n[0] === route)?.[1] || "Workspace settings";
  const searchResults = courses.filter((c) =>
    (c.title + " " + c.code + " " + c.category)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a className="brand" href="#overview">
          <Logo />
          <span>
            meridian<span className="brand-dot">.</span>
          </span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => {
            setAccountMenu(!accountMenu);
          }}
        >
          <span className="workspace-icon">
            <GraduationCap size={21} />
          </span>
          <span>
            <strong>Meridian Academy</strong>
            <small>
              {user.role === "admin"
                ? "Admin workspace"
                : user.role !== "learner"
                  ? "Instructor workspace"
                  : "Learner workspace"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {navigation.map(([id, label, Icon]) => (
            <a
              key={id}
              className={
                "nav-link " +
                (route === id || (id === "courses" && courseId) ? "active" : "")
              }
              href={"#" + id}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "courses" && (
                <span className="nav-count">{courses.length}</span>
              )}
              {route === id && id !== "courses" && (
                <span className="active-dot" />
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="grow-card">
            <div className="grow-leaf">
              <Leaf size={21} />
            </div>
            <h4>Room to grow.</h4>
            <p>
              Good things start with
              <br />a little curiosity.
            </p>
            <button onClick={() => go("library")}>
              Explore your library <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={"nav-link " + (route === "settings" ? "active" : "")}
            onClick={() => go("settings")}
          >
            <SettingsIcon size={19} />
            Settings
          </button>
          <button className="nav-link" onClick={() => setShowHelp(true)}>
            <HelpCircle size={19} />
            Help & resources
            <ArrowUpRight size={14} className="push-right" />
          </button>
          <div className="profile-wrap">
            <button
              className="profile"
              onClick={() => setAccountMenu(!accountMenu)}
            >
              <span className="avatar profile-avatar">
                {user.initials || user.name.slice(0, 2)}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>
                  {user.role === "admin"
                    ? "Admin"
                    : user.role !== "learner"
                      ? "Instructor"
                      : "Learner"}
                </small>
              </span>
              <ChevronDown size={15} />
            </button>
            {accountMenu && (
              <div className="account-menu">
                {authConfig.demoEnabled &&
                  ["admin", "instructor", "learner"].includes(user.id) && (
                    <>
                      <span className="menu-caption">DEMO WORKSPACE</span>
                      <button onClick={() => switchRole("admin")}>
                        <SettingsIcon size={16} />
                        Admin view{" "}
                        {user.role === "admin" && <Check size={15} />}
                      </button>
                      <button onClick={() => switchRole("instructor")}>
                        <GraduationCap size={16} /> Instructor view{" "}
                        {user.role === "instructor" && <Check size={15} />}
                      </button>
                      <button onClick={() => switchRole("learner")}>
                        <BookOpen size={16} /> Learner view{" "}
                        {user.role === "learner" && <Check size={15} />}
                      </button>
                    </>
                  )}
                <button
                  onClick={() => {
                    setAccountMenu(false);
                    go("settings");
                  }}
                >
                  <SettingsIcon size={16} /> Profile settings
                </button>
                <button onClick={signOut}>
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="search-trigger"
              onClick={() => setShowSearch(true)}
            >
              <Search size={17} />
              <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            <button
              className="notification-button icon-btn"
              aria-label="Notifications"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell size={19} />
              {activities.length > 0 && <i />}
            </button>
            <button
              className="avatar top-avatar"
              onClick={() => go("settings")}
              aria-label="Your profile"
            >
              {user.initials || user.name.slice(0, 2)}
            </button>
          </div>
          {showNotifications && (
            <div className="notifications-popover">
              <div className="section-heading">
                <h3>Recent activity</h3>
                <button
                  className="icon-btn"
                  aria-label="Close notifications"
                  onClick={() => setShowNotifications(false)}
                >
                  <X size={17} />
                </button>
              </div>
              <ActivityList activities={activities} />
            </div>
          )}
        </header>
        <main className={"main-content " + (courseId ? "course-main" : "")}>
          {courseId ? (
            <CourseWorkspace
              key={courseId + user.role}
              courseId={courseId}
              initialTab={route.split("/")[2]}
              initialGameId={route.split("/")[3]}
              courses={courses}
              user={user}
              onBack={() => go("courses")}
              onRefresh={refresh}
              notify={notify}
            />
          ) : route === "overview" ? (
            <Dashboard
              {...{ user, courses, activities, tasks, analytics, go }}
              onCreate={() => setShowCreate(true)}
              onCalendar={() => setShowCalendar(true)}
            />
          ) : route === "courses" ? (
            <Courses
              {...{ courses, user, go, notify, refresh }}
              onCreate={() => setShowCreate(true)}
            />
          ) : route === "gradebook" ? (
            <Gradebook {...{ courses, user, notify }} onRefresh={refresh} />
          ) : route === "analytics" ? (
            <CourseMetrics {...{ courses, user, notify }} />
          ) : route === "people" ? (
            <People
              {...{ learners, courses, user, notify }}
              onRefresh={refresh}
            />
          ) : route === "library" ? (
            <ContentLibrary
              {...{ courses, user, notify }}
              onOpenCourse={(id, activity) =>
                go(
                  "course/" +
                    id +
                    (activity?.type === "game"
                      ? "/games" + (activity.id ? "/" + activity.id : "")
                      : activity?.type === "quiz"
                        ? "/quizzes"
                        : ""),
                )
              }
            />
          ) : (
            <Settings {...{ user, notify }} onRefresh={refresh} />
          )}
        </main>
        <footer className="app-footer">
          <span>Made for the way you teach. Built for the way they learn.</span>
          <span>
            <span className="status-dot" /> Meridian workspace
          </span>
        </footer>
      </div>
      {showCreate && (
        <CreateCourse
          onClose={() => setShowCreate(false)}
          onCreated={async (c) => {
            await refresh();
            setShowCreate(false);
            go("course/" + c.id);
            notify("Your course is ready to make your own.");
          }}
          notify={notify}
        />
      )}
      {showSearch && (
        <Modal onClose={() => setShowSearch(false)} className="search-modal">
          <div className="search-modal-input">
            <Search size={22} />
            <input
              aria-label="Search courses"
              placeholder="Find a course, topic, or course code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <button
              className="icon-btn"
              aria-label="Close search"
              onClick={() => setShowSearch(false)}
            >
              <X size={20} />
            </button>
          </div>
          <p className="menu-caption">
            COURSES · {searchResults.length} RESULTS
          </p>
          <div className="search-results">
            {searchResults.map((c) => (
              <button key={c.id} onClick={() => go("course/" + c.id)}>
                <span
                  className="search-result-icon"
                  style={{ background: colors[c.cover] }}
                >
                  <BookOpen size={20} />
                </span>
                <span>
                  <strong>{c.title}</strong>
                  <small>
                    {c.code} · {c.category}
                  </small>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
            {!searchResults.length && (
              <p className="empty-state">
                No courses match “{search}”. Try another search.
              </p>
            )}
          </div>
        </Modal>
      )}
      {showHelp && (
        <Modal onClose={() => setShowHelp(false)}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">A LITTLE GUIDANCE</p>
              <h2>Make yourself at home.</h2>
            </div>
            <button
              className="icon-btn"
              aria-label="Close help"
              onClick={() => setShowHelp(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="help-content">
            <p>Meridian brings your teaching workflow into one place.</p>
            {[
              [
                "01",
                "Build your course",
                "Create a course, add modules and lessons, then publish when you’re ready.",
              ],
              [
                "02",
                "Make learning interactive",
                "Build native quizzes, matching games, and sequencing challenges with automatic grade recording.",
              ],
              [
                "03",
                "Set your learning path",
                "Choose course dates, prerequisites, and grading weights in course settings.",
              ],
              [
                "04",
                "See the whole picture",
                "Review submissions in Gradebook and follow learner progress in Analytics.",
              ],
            ].map(([n, h, p]) => (
              <div className="help-step" key={n}>
                <span>{n}</span>
                <div>
                  <h4>{h}</h4>
                  <p>{p}</p>
                </div>
              </div>
            ))}
            <p className="info-note">
              Use the profile menu to explore the learner view. This workspace
              includes sample courses and learners.
            </p>
          </div>
          <div className="modal-footer">
            <button
              className="btn btn-primary"
              onClick={() => setShowHelp(false)}
            >
              Got it <Check size={16} />
            </button>
          </div>
        </Modal>
      )}
      {showCalendar && (
        <Modal onClose={() => setShowCalendar(false)}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">PLAN AHEAD</p>
              <h2>Course calendar</h2>
            </div>
            <button
              className="icon-btn"
              aria-label="Close calendar"
              onClick={() => setShowCalendar(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="calendar-list">
            {courses
              .filter((c) => c.startDate || c.endDate)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setShowCalendar(false);
                    go("course/" + c.id);
                  }}
                >
                  <span className="calendar-date">
                    <CalendarDays size={23} />
                  </span>
                  <div>
                    <strong>{c.title}</strong>
                    <small>
                      {c.startDate
                        ? new Date(c.startDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Open start"}{" "}
                      —{" "}
                      {c.endDate
                        ? new Date(c.endDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "No end date"}
                    </small>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ))}
            {!courses.some((c) => c.startDate || c.endDate) && (
              <div className="empty-state">
                Course run dates will appear here when scheduled.
              </div>
            )}
          </div>
        </Modal>
      )}
      {toast && (
        <div role="status" className={"toast " + toast.type}>
          {toast.type === "error" ? (
            <HelpCircle size={19} />
          ) : (
            <CheckCircle2 size={19} />
          )}
          <span>{toast.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Dashboard({
  user,
  courses,
  activities,
  tasks,
  analytics,
  go,
  onCreate,
  onCalendar,
}) {
  const firstName = user.name.split(" ")[0];
  const instructor = user.role !== "learner";
  const active = courses.filter((c) => c.status === "published").length;
  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow greeting">
            <span className="tiny-sun">☀</span> YOUR LEARNING, IN FOCUS
          </div>
          <h1>
            Welcome back, {firstName}
            <span className="greeting-dot">.</span>
          </h1>
          <p>Here’s what’s happening in your learning community.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={instructor ? onCreate : () => go("courses")}
        >
          <Plus size={17} />
          {instructor ? "Create a course" : "Explore courses"}
        </button>
      </div>
      <div className="metric-grid overview-metrics">
        {[
          {
            label: "Active courses",
            value: active,
            icon: BookOpen,
            note: `${courses.filter((c) => c.status === "draft").length} courses in draft`,
            color: "green",
          },
          {
            label: "Total learners",
            value: analytics.totalLearners ?? 0,
            icon: Users,
            note: "Learning together",
            color: "purple",
          },
          {
            label: "Completion rate",
            value: (analytics.completionRate ?? 0) + "%",
            icon: CheckCircle2,
            note: "Across enrolled courses",
            color: "peach",
          },
          {
            label: "Average grade",
            value: (analytics.averageGrade ?? 0) + "%",
            icon: BarChart3,
            note: "Across graded learners",
            color: "blue",
          },
        ].map(({ label, value, icon: Icon, note, color }) => (
          <div className="metric-card" key={label}>
            <div className="metric-label">
              {label}
              <span className={"metric-icon " + color}>
                <Icon size={18} />
              </span>
            </div>
            <strong className="metric-value">{value}</strong>
            <div className="metric-foot">
              <span className="metric-mini-line" />
              {note}
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <div className="section-heading">
            <div>
              <h2>
                Your courses{" "}
                <span className="count-bubble">{courses.length}</span>
              </h2>
              <p>A space for every big idea.</p>
            </div>
            <button className="text-link" onClick={() => go("courses")}>
              View all courses <ArrowRight size={16} />
            </button>
          </div>
          <div className="course-grid dashboard-courses">
            {courses.slice(0, 4).map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                onOpen={() => go("course/" + c.id)}
              />
            ))}
            {courses.length === 0 && (
              <div className="empty-state card">
                <BookOpen size={30} />
                <h3>
                  {instructor
                    ? "Your next chapter starts here"
                    : "No published courses yet"}
                </h3>
                <p>
                  {instructor
                    ? "Create your first course to start building."
                    : "Your instructor’s courses will appear here when they’re ready."}
                </p>
                {instructor && (
                  <button className="btn btn-primary" onClick={onCreate}>
                    Create a course
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="learning-banner">
            <div className="banner-art">
              <Sparkles size={30} />
              <i />
              <i />
            </div>
            <div>
              <p className="eyebrow">SMALL STEPS. BIG POSSIBILITIES.</p>
              <h3>A great learning experience starts with you.</h3>
              <p>Bring your next lesson to life with interactive content.</p>
            </div>
            <button className="btn btn-secondary" onClick={() => go("library")}>
              Explore library <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <aside className="dashboard-side">
          <div className="card todo-card">
            <div className="section-heading">
              <h3>
                On your radar{" "}
                <span className="count-bubble">{tasks.length}</span>
              </h3>
              <span className="radar-dot" />
            </div>
            <p className="section-subtitle">
              A little attention goes a long way.
            </p>
            <div className="task-list">
              {tasks.slice(0, 4).map((t, i) => (
                <button
                  className="task-row"
                  key={t.id}
                  onClick={() =>
                    go(
                      t.type === "grading"
                        ? "gradebook"
                        : "course/" + t.courseId,
                    )
                  }
                >
                  <span className={"task-icon task-" + i}>
                    {t.type === "grading" ? (
                      <ClipboardList size={17} />
                    ) : t.type === "quiz" ? (
                      <FileText size={17} />
                    ) : (
                      <CalendarDays size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{t.title}</strong>
                    <small>{t.courseTitle}</small>
                    <em>
                      {t.type === "grading" && t.count
                        ? `${t.count} to review`
                        : t.type === "course"
                          ? "Ready to publish"
                          : t.count
                            ? `${t.count} submitted`
                            : t.dueDate
                              ? new Date(t.dueDate).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )
                              : "Ready when you are"}
                    </em>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
              {!tasks.length && (
                <div className="small-empty">
                  <CheckCircle2 size={24} />
                  <p>You’re all caught up.</p>
                </div>
              )}
            </div>
            <button className="calendar-link" onClick={onCalendar}>
              <CalendarDays size={16} /> View course calendar{" "}
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="card activity-card">
            <div className="section-heading">
              <h3>Recent activity</h3>
              <span className="live-label">
                <i /> Live
              </span>
            </div>
            <ActivityList activities={activities.slice(0, 4)} />
            <button className="activity-link" onClick={() => go("analytics")}>
              See the bigger picture <ArrowRight size={15} />
            </button>
          </div>
          <div className="daily-note">
            <Leaf size={20} />
            <p>
              “The beautiful thing about learning is that nobody can take it
              away from you.”<span>— B. B. King</span>
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
function relativeTime(value) {
  if (!value) return "Recently";
  const m = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return m < 1
    ? "Just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
}
function ActivityList({ activities = [] }) {
  return (
    <div className="activity-list">
      {activities.length ? (
        activities.map((a, i) => (
          <div className="activity-row" key={a.id || i}>
            <span className={"activity-mark mark-" + (i % 3)}>
              {a.type === "enrollment" ? (
                <Users size={14} />
              ) : a.type === "submission" ? (
                <Check size={14} />
              ) : (
                <BookOpen size={14} />
              )}
            </span>
            <div>
              <p>{a.text}</p>
              {a.courseTitle && <small>{a.courseTitle}</small>}
              <time>{relativeTime(a.createdAt)}</time>
            </div>
          </div>
        ))
      ) : (
        <div className="small-empty">New course activity will appear here.</div>
      )}
    </div>
  );
}
function CourseCard({ course: c, onOpen }) {
  return (
    <article className="course-card">
      <button
        className="course-cover-button"
        onClick={onOpen}
        aria-label={"Open " + c.title}
      >
        <CoverArt type={c.cover} />
        <span className={"badge cover-badge " + c.status}>
          <span />
          {c.status === "published"
            ? "Published"
            : c.status === "archived"
              ? "Archived"
              : "Draft"}
        </span>
        <span className="cover-open">
          <ArrowUpRight size={19} />
        </span>
      </button>
      <div className="course-card-body">
        <div className="course-meta">
          <span>{c.code}</span>
          <span className="meta-dot" />
          <span>{c.category}</span>
        </div>
        <button className="course-title" onClick={onOpen}>
          {c.title}
        </button>
        <p className="course-desc">{c.description}</p>
        <div className="course-info">
          <span>
            <Users size={14} />
            {c.studentCount || 0} learners
          </span>
          <span>
            <BookOpen size={14} />
            {c.modulesCount || 0} modules
          </span>
        </div>
        <div className="course-progress-label">
          <span>Course completion</span>
          <strong>{c.completion || 0}%</strong>
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: (c.completion || 0) + "%" }}
          />
        </div>
      </div>
      <div className="course-card-footer">
        <span className="course-pace">
          <span className="small-status-dot" />
          {c.pace === "instructor-led" ? "Instructor-led" : "Self-paced"}
        </span>
        <button className="text-link" onClick={onOpen}>
          Open course <ArrowUpRight size={15} />
        </button>
      </div>
    </article>
  );
}
function Courses({ courses, user, go, onCreate, notify, refresh }) {
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [layout, setLayout] = useState("grid");
  const filtered = courses.filter(
    (c) =>
      (filter === "all" || c.status === filter) &&
      (c.title + " " + c.code).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A PLACE FOR EVERY IDEA</p>
          <h1>My courses</h1>
          <p>Create meaningful learning, one course at a time.</p>
        </div>
        {user.role !== "learner" && (
          <button className="btn btn-primary" onClick={onCreate}>
            <Plus size={17} />
            Create a course
          </button>
        )}
      </div>
      <div className="course-toolbar">
        <div className="tabs">
          {["all", "published", "draft", "archived"].map((f) => (
            <button
              className={"tab " + (filter === f ? "active" : "")}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All courses" : f[0].toUpperCase() + f.slice(1)}
              <span>
                {f === "all"
                  ? courses.length
                  : courses.filter((c) => c.status === f).length}
              </span>
            </button>
          ))}
        </div>
        <div className="course-tools">
          <label className="inline-search">
            <Search size={16} />
            <input
              aria-label="Search courses"
              placeholder="Search courses..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="view-toggle">
            <button
              className={layout === "grid" ? "selected" : ""}
              aria-label="Grid view"
              onClick={() => setLayout("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              className={layout === "list" ? "selected" : ""}
              aria-label="List view"
              onClick={() => setLayout("list")}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>
      <div
        className={
          "course-grid all-courses " + (layout === "list" ? "list-layout" : "")
        }
      >
        {filtered.map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            onOpen={() => go("course/" + c.id)}
          />
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state card">
          <Search size={30} />
          <h3>No courses found</h3>
          <p>Try a different search or create something new.</p>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}
function Modal({ children, onClose, className = "" }) {
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const handler = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const controls = [
          ...dialog.current.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
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
    document.addEventListener("keydown", handler);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = original;
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        className={"modal " + className}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace dialog"
      >
        {children}
      </section>
    </div>
  );
}
function CreateCourse({ onClose, onCreated, notify }) {
  const [form, setForm] = useState({
      title: "",
      code: "",
      description: "",
      category: "Design",
      cover: "design",
      status: "draft",
      pace: "self-paced",
      enrollment: "open",
      passingScore: 70,
      weights: { quizzes: 40, assignments: 40, participation: 20 },
      prerequisites: [],
    }),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { course } = await api("/courses", { method: "POST", body: form });
      await onCreated(course);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }
  return (
    <Modal onClose={onClose} className="create-course-modal">
      <form onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">START SOMETHING GOOD</p>
            <h2>Create a course</h2>
            <p>Give your next big idea a place to grow.</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close create course"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        <div className="modal-body">
          <label className="field">
            Course name
            <input
              autoFocus
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Introduction to visual design"
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Course code
              <input
                required
                maxLength={20}
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="e.g. DES101"
              />
            </label>
            <label className="field">
              Category
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {[
                  "Design",
                  "Development",
                  "Marketing",
                  "Photography",
                  "Business",
                  "Data science",
                  "Other",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            About this course
            <textarea
              required
              rows="3"
              maxLength={2000}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What will your learners discover?"
            />
          </label>
          <div className="field">
            <span>Choose a cover</span>
            <div className="cover-picker">
              {Object.keys(colors).map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-label={c + " cover"}
                  aria-pressed={form.cover === c}
                  className={form.cover === c ? "selected" : ""}
                  onClick={() => set("cover", c)}
                >
                  <CoverArt type={c} />
                  {form.cover === c && (
                    <span>
                      <Check size={14} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="info-note">
            <Leaf size={17} />
            <span>
              Your course starts as a draft. Add content and set it up before
              publishing.
            </span>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={saving} className="btn btn-primary">
            {saving ? "Creating..." : "Create course"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default App;
