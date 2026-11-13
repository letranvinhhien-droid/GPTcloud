# Native learning and course metrics

## Quiz and game scoring

Create quizzes in a course's **Quizzes** tab and games in its **Games** tab. Matching games award one point per correct pair; sequencing games award one point per item in its correct position. A game supports 2–12 pairs or steps, a passing score, up to 20 attempts, and an optional timer. Publish an assessment to make it available to enrolled learners. Add a linked activity in a course module to include it in course progress.

The server starts each attempt and saves its content and answer key. Learners receive shuffled game choices with opaque IDs. Submission sends answers; the server computes the score. Changing the activity later does not change an attempt already in progress. Expired and abandoned attempts count toward the attempt cap; an unexpired attempt can be resumed. Staff previews record no attempts or grades.

Native quizzes and games share the **Quizzes & games** weighted category. The category is the average of each assessment's highest graded percentage. Pending essay reviews are excluded until graded. Assignments and participation remain separate categories. Category weights must total 100%; ungraded categories are excluded and the remaining weights are normalized. Instructors and admins can override category grades; a later graded attempt recalculates its category.

A passing graded attempt completes every module activity linked to that assessment, including links added after the attempt. Changing a link recalculates its completion from the newly linked assessment and preserves historical attempts. Overall course completion requires all available native module activities plus a weighted grade meeting the course passing score, or an explicit instructor completion override. Automatically earned completion is recalculated when required activities or course settings change; explicit staff overrides and existing historical completed records are retained. Course dates, prerequisites, and enrollment rules also apply to games.

H5P authoring, launch, callbacks, and embeds are retired. Existing legacy records remain in the database, but retired activities do not appear in modules or count toward current activity progress. No external content provider is needed.

## Admin-configured metrics

Open **Analytics → Configure metrics** as an admin. Configure up to 12 named metrics, choose a measure, set a healthy target and a lower warning threshold, and enable or disable each rule. These settings persist across restarts and apply across the workspace. Instructors can view results; learners can view only results derived from their own enrollments and activity.

| Measure                   | Calculation                                                                       | Time scope               |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------ |
| Active learning           | Enrollments with learner activity ÷ current enrollments                           | Rule's 7, 30, or 90 days |
| Course completion         | Completed enrollments ÷ current enrollments                                       | Current snapshot         |
| Average activity progress | Mean percentage of available published native activities completed per enrollment | Current snapshot         |
| Average weighted grade    | Mean weighted course grade across graded enrollments                              | Current snapshot         |
| Course achievement        | Graded enrollments meeting their course passing score ÷ graded enrollments        | Current snapshot         |
| Quiz and game pass rate   | Passing graded native attempts ÷ graded native attempts                           | Rule's 7, 30, or 90 days |

An enrollment is one learner in one course. Activity includes lesson views, starts, submissions, and completions; staff edits and grading actions do not count as learner engagement. Pending essays and assignments are excluded from assessment pass rates. An enrollment with no available activities is excluded from average activity progress unless marked complete. Missing grades or empty denominators display **No data**, never a fabricated zero.

Metrics at or above target are healthy; values from the warning threshold up to the target need attention; lower values are at risk. Course health is the mean target attainment across enabled metrics that have data, with each attainment capped at 100%. It is a configurable indicator, not a course grade.

The chart filter controls a separate 7/30/90-day window for the activity chart and assessment performance table. It does not override each metric rule's lookback or change snapshot measures. Days are grouped in UTC. Assessment performance includes attempt counts, average graded score, pass rate, pending review count, and average duration. Charts offer table views, and reports can be exported as CSV.

The demo workspace contains sample enrollments and historical records. New game seeds contain no invented attempts or scores. Use a fresh database with `LMS_SEED=false` for an empty production workspace and provision an admin with `node server/manage-users.js create-admin`.
