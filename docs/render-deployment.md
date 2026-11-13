# Put Meridian online with Render

The included `render.yaml` creates a **Node web service** with a persistent SQLite disk and an HTTPS address assigned by Render. It uses a paid Starter service and a 1 GB disk in Singapore. Review the current charges in Render before creating the resources. No Render service is created by adding this file.

## 1. Make the source available to Render

Push this project's source to your GitHub repository, with `package.json` and `render.yaml` at the repository root. You can keep the repository private and grant Render access to it. Verify that these files appear on GitHub before deploying; saving or publishing a Codex environment does not push its files to GitHub.

Exclude `.data`, `.env`, `node_modules`, `dist`, and test output. The existing `.gitignore` covers these paths. The local workspace database contains accounts and sessions and must not be committed. This deployment starts with a new empty database; it does not automatically copy the local preview's courses or users.

## 2. Create the service

1. Sign in to [Render](https://dashboard.render.com/).
2. Choose **New → Blueprint**, connect the GitHub repository, and select the branch containing `render.yaml`.
3. Review the web service and persistent disk, including their costs, then create the resources.
4. Wait for the build and health check to succeed. Open the HTTPS service URL shown in Render, typically ending in `.onrender.com`. That exact URL is your public LMS link and works on phones and computers.

The blueprint sets the following values automatically:

| Setting                  | Value                                         |
| ------------------------ | --------------------------------------------- |
| Runtime                  | Node 24                                       |
| Build command            | `npm ci --include=dev && npm run build`       |
| Start command            | `npm start`                                   |
| Health check             | `/api/health`                                 |
| Database                 | `/var/data/lms.sqlite` on the persistent disk |
| Demo sign-in             | Disabled                                      |
| Sample courses and users | Disabled                                      |
| Session cookies          | Secure, for HTTPS                             |
| Instances                | One                                           |
| Automatic deploys        | Disabled; deploy updates manually             |

Render supplies `PORT`; the server already listens on that port on `0.0.0.0`. Keep the persistent disk attached and keep the same database path on future deployments. Do not select a static site or scale this SQLite service to multiple instances.

## 3. Create your admin account

Once the service is live, open that service's **Shell** in Render and run the following, replacing the example name and email with yours:

```sh
node server/manage-users.js create-admin --name "Your name" --email your-email@example.com
```

Enter a new 12–128 character password at the hidden prompt. Do not put the password in this command, source code, a build log, or chat. Create the account in the live service's Shell, where the persistent disk is mounted. Build and pre-deploy steps cannot provision the live database.

Open the public LMS URL and sign in with that email and password. You can now create courses, author quizzes and games, manage grades, and configure metrics under **Analytics**. There are no demo buttons or sample accounts on this deployment. Public registration creates learner accounts only.

Create additional instructors from the same service Shell:

```sh
node server/manage-users.js create-instructor --name "Instructor name" --email instructor@example.com
```

For operator-assisted password recovery:

```sh
node server/manage-users.js reset-password --email learner@example.com
```

## Updates, storage, and backups

Push changes to the connected GitHub branch and trigger a manual deployment in Render. Keep the disk and `LMS_DB` unchanged. The app's build does not initialize or overwrite the database.

The persistent disk retains data across app restarts and deployments, but deleting the disk or service can remove it. Keep an independent backup outside this service. SQLite uses WAL mode: copying only a live `lms.sqlite` file can miss recent transactions. Use SQLite's online backup API or stop all writers before copying the database files. For example, this command in the live Shell creates a consistent backup on the disk:

```sh
node --input-type=module - <<'JS'
import { DatabaseSync, backup } from 'node:sqlite';
const db = new DatabaseSync(process.env.LMS_DB);
try {
  await backup(db, '/var/data/meridian-backup.sqlite');
} finally {
  db.close();
}
JS
```

Copy that backup to private storage outside the service using your hosting/storage tooling. Do not add a public download endpoint for database backups. Test restoration against a separate database before replacing production data.

The current login and registration rate limiter deliberately uses the direct socket address. Behind Render's proxy, users may share a limit of 15 login attempts per 10 minutes and 10 registrations per 15 minutes. A larger rollout needs a limiter configured for verified proxy/client identities. Simply trusting arbitrary forwarded headers would let callers bypass limits. The app also remains a single institution workspace: instructors and admins can manage all its courses.

## Validate before deploying

```sh
npm ci --include=dev
npm run build
npm test
npm run test:production
```

The production smoke test starts isolated local processes with the blueprint's application settings and a temporary database. It verifies production assets, disabled demos, real admin sign-in, secure cookies, and course/session persistence after restart. It does not create or contact a Render service. The live Render deployment still needs its own successful build and health check.
