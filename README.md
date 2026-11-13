# Meridian LMS

A Canvas-inspired learning management application with a React interface and a persistent SQLite API. The development workspace comes with sample courses, learners, grades, and activity. Real learner accounts and operator-provisioned instructor and admin accounts use password sign-in; demo access is optional.

## Run locally

Requires **Node.js 24** (uses the built-in `node:sqlite` module).

```sh
npm ci
npm run dev
```

The application listens on port **3000**, on all interfaces. Development uses Vite middleware with hot reload. Fonts and course illustrations are bundled locally.

```sh
npm run build
npm start
```

`npm start` serves the production bundle. `PORT` changes the port; `LMS_DB` changes the SQLite database path. The default is `.data/lms.sqlite`, created and seeded once. Back up the database before changing or removing it. Processes must be restarted after an environment restart.

For a public HTTPS website using a free plan, follow the [Cloudflare deployment guide](docs/cloudflare-deployment.md). It serves the frontend on Workers and stores the LMS in a SQLite-backed Durable Object, with no paid plan configured. The guide covers importing this branch from GitHub and securely creating the first admin in your browser. The `codex/render-lms` branch retains the earlier paid-hosting alternative.

## Workflows

- **Courses:** create courses, choose cover illustrations, organize and edit modules and lessons, add assignments, publish or archive courses.
- **Native quizzes:** multiple choice, true/false, short answer, and essay questions; points, time limits, passing scores, and attempt caps. Automatic grading for objective questions; instructor review for written responses. Answers are hidden from learners, and active attempts use a saved question snapshot.
- **Native games:** create matching and sequencing challenges, preview them, set time limits, attempt caps and passing scores, then publish and link them to course modules. The server grades answers against a frozen attempt snapshot. Passing attempts complete linked activities. The content library collects native quizzes and games across courses.
- **Course runs:** start/end dates, self-paced or instructor-led labeling, open or invitation-only enrollment, and completion prerequisites. Prerequisite cycles are rejected. Instructors can enroll existing learners from **People → learner profile**; date gates still control access.
- **Gradebooks:** quizzes & games, assignments, and participation categories with weights totaling 100%; instructor overrides; essay/assignment review; completion overrides; and CSV export. Ungraded categories are excluded and the remaining weights are normalized. The quizzes & games category averages the best graded attempt for each assessment equally; assignments average the latest graded native response per activity. Game scores are automatic; staff can override a category grade in the gradebook.
- **Analytics:** admins configure up to 12 workspace metrics with targets, warning thresholds, and 7/30/90-day lookback windows. Measures cover active learning, course completion, activity progress, weighted grades, course achievement, and quiz/game pass rates. Visualizations include metric progress bars, a daily activity chart, course health comparisons, and assessment performance; accessible tables and CSV exports are included. Instructors can view workspace metrics; learners see only their own records. See [metric definitions](docs/native-learning.md).
- **Learner view:** sign in or create a learner account, enroll, read lessons, complete activities, play games, submit quizzes and assignments, and view personal grades. Demo accounts can switch roles from the profile menu when demo mode is enabled.

## Verification

```sh
npm test
npm run build
npm run test:browser
npm run test:accounts
npm run test:native
```

API tests create a separate temporary SQLite database. Browser checks require Chromium at `/usr/bin/chromium`, or a path set in `CHROMIUM_PATH`. They start isolated production servers on ports 3107 (LMS workflow), 3108 (real accounts), and 3110 (native games and metrics), use temporary databases, and save screenshots to ignored `test-results/`.

## Accounts and deployment

The sign-in screen supports learner registration and password sign-in. Passwords are stored with salted scrypt hashes. Sessions use random tokens stored as hashes, HttpOnly/SameSite cookies, and seven-day expiry. Logout revokes the current session; password changes revoke all prior sessions. Account endpoints rate-limit attempts by socket IP. Real users cannot switch roles through the demo profile menu.

Create an instructor or workspace admin from the server terminal. The CLI asks for the password without echoing it:

```sh
node server/manage-users.js create-instructor --name "Your name" --email instructor@example.org
node server/manage-users.js create-admin --name "Admin name" --email admin@example.org
node server/manage-users.js reset-password --email learner@example.org
```

For automation, `--password-stdin` reads a password from standard input. Supply it through your secret-management system; never place passwords in command-line arguments, shell history, or committed files. The CLI uses `LMS_DB` or the same default database path as the server.

| Variable            | Behavior                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LMS_DEMO`          | Enabled by default in development; **disabled by default with `NODE_ENV=production`**. Set `true` only for a shared demonstration deployment. Demo instructor and admin access exposes the whole workspace. |
| `LMS_SEED`          | Set `false` for a new empty database. Existing records are preserved. Provisioning an instructor or admin before first startup also prevents sample seeding.                                                |
| `LMS_DB`            | SQLite file path; defaults to `.data/lms.sqlite`.                                                                                                                                                           |
| `LMS_COOKIE_SECURE` | Set `true` behind an HTTPS reverse proxy so session cookies require HTTPS. Direct HTTPS requests also use secure cookies.                                                                                   |
| `PORT`              | Listener port, defaults to 3000.                                                                                                                                                                            |

Use HTTPS and private persistent storage/backups for a real deployment. This application is one shared institution workspace: all instructors can manage its courses. Multi-institution isolation, SSO, email verification, email password recovery, and a distributed rate limiter are not implemented. The current socket-IP limiter intentionally ignores untrusted forwarding headers; behind a shared proxy it limits the proxy's aggregate traffic. Password recovery is available to the server operator through the CLI. No deployment or environment publication is performed by these changes.

The backend checks user roles, course eligibility, quiz deadlines and attempts, grade ranges, weight totals, and request origins. It serves only a learner's own grades and submissions to that learner. Lesson and assignment text is rendered as text, not injected HTML.

## Project layout

- `src/App.jsx`: application navigation, overview, catalog, course creation, and search.
- `src/components/CourseWorkspace.jsx`: content, quiz authoring/taking, and course settings.
- `src/components/Reports.jsx`: gradebooks, people, and profile.
- `src/components/NativeGames.jsx`: game builder, preview, and learner play.
- `src/components/NativeLibrary.jsx`: native quiz and game library.
- `src/components/CourseMetrics.jsx`: configurable metrics and visualizations.
- `server/index.js`: local Node server and SQLite startup.
- `server/app.js`: shared API, enrollment, submissions, and grading.
- `workers/index.js`: Cloudflare entry point and durable workspace.
- `workers/store.js`: persistent SQLite adapter for the shared API.
- `server/auth.js`: account authentication, sessions, and password management.
- `server/manage-users.js`: operator account provisioning and password reset.
- `server/games.js`: native game validation, attempt snapshots, and server scoring.
- `server/metrics.js`: persisted metric rules and record-based calculations.
- `server/domain.js`: validation and weighted-grade calculations.
- `server/store.js`: SQLite persistence.
- `server/seed.js`: initial sample workspace.
- `tests/`: API and browser workflow validation.
