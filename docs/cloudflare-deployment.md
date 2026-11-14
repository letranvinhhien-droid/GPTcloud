# Put Meridian online on Cloudflare's free plan

The repository's **default branch** contains the free Cloudflare deployment. The **`codex/cloudflare-free`** branch contains the same deployment for interfaces that offer a branch selector. It serves the website on Cloudflare Workers and stores courses, accounts, quiz/game attempts, grades, and metrics in one SQLite-backed Durable Object. These services are available on Workers Free. This configuration does not activate a paid plan, create a paid disk, or require a custom domain.

## 1. Connect the GitHub repository

1. Sign in to [Cloudflare](https://dash.cloudflare.com/) and stay on **Workers Free**.
2. Open **Workers & Pages → Create application** and choose the option to import a Git repository.
3. Connect **`letranvinhhien-droid/GPTcloud`**. If the import screen does not show a branch selector, continue with its default branch. If a selector is shown, you can choose **`codex/cloudflare-free`**.
4. Use these build settings if the dashboard asks for them:

| Setting                        | Value                                                |
| ------------------------------ | ---------------------------------------------------- |
| Project / Worker name          | `meridian-lms`                                       |
| Root directory                 | Repository root; leave blank or use `/`              |
| Build command                  | `npm run build`                                      |
| Deploy command                 | `npx wrangler deploy`                                |
| Node version                   | 24 (also specified in `.node-version`)               |
| Enable Preview builds          | Off for this initial deployment                      |
| Protect with Cloudflare Access | Off; the LMS has its own sign-in                     |
| API token                      | Create new token; name it `meridian-builds` if asked |

5. Leave the optional variable fields blank for the initial deployment. Cloudflare creates the build token automatically; you do not need to paste an API token into the form or chat. The administrator setup secret is added to the deployed Worker in the next section.
6. Deploy. The repository's `wrangler.jsonc` supplies the asset directory, bindings, and SQLite migration. The dashboard will provide your exact HTTPS **`workers.dev`** address. Open that address on your phone or computer.

Do not enter `/workspace/GPTcloud` as the repository root: that path belongs to the development machine. No Render account or paid plan is needed. If the hosting dashboard asks you to activate billing or upgrade, stop and check that you selected Workers Free; this app does not need those paid options. Cloudflare controls account eligibility and verification.

## 2. Enable protected administrator setup

The initial page is locked until the owner supplies a setup key. A public visitor cannot claim the first admin account just by arriving first.

1. In Cloudflare, open your deployed Worker, then **Settings → Variables and Secrets**.
2. Add a **Secret** named **`LMS_SETUP_TOKEN`**. Generate a random value of 32–512 characters with your password manager and save it privately. Punctuation, including a full stop, is accepted. Use a different value from your eventual account password. Do not put this value in GitHub, a URL, or chat.
3. Save and deploy the secret change, then reload your public LMS page.
4. On **Set up your workspace**, enter that setup key, your name, email, and a new account password. Submit to create your admin account and sign in.
5. After setup succeeds, delete `LMS_SETUP_TOKEN` from the Worker's secrets and deploy that change. The database permanently records that initial setup is complete, so removing the key does not reopen setup.

You can now create courses, quizzes and games, review grades, and configure targets under **Analytics**. Learners can register after setup is complete. This deployment starts with an empty database and no demo accounts. It does not copy the local development database.

### If setup stays pending after saving the secret

Open `/api/auth/config` on your public LMS address. Its response reports setup status without returning the secret. If `setupEnabled` is false, the updated app also reports `setupIssue`:

- `missing_key`: the running workspace has no setup key. Confirm the secret belongs to the production Worker's **Settings → Variables and Secrets**, and that the version containing it is deployed to production.
- `invalid_key`: the runtime received a value that is not a string of 32–512 characters. Correct the secret value, then save and deploy.

The app reads the setup binding on each request. Cloudflare documents that [binding-only changes may reuse running isolates](https://developers.cloudflare.com/workers/runtime-apis/bindings/#making-changes-to-bindings), so retaining a value from startup can leave the app using an old configuration. This deployment sets the [Durable Object update strategy](https://developers.cloudflare.com/durable-objects/deployments/durable-objects-code-updates/) to `immediate`, so a code deployment updates the running workspace promptly. Immediate updates can interrupt an in-flight request during deployment. Stored data and workspace identity remain the same.

If the response has `setupRequired: true` and `setupEnabled: false` but no `setupIssue`, it may be running the earlier app version. Deploy the updated code before using these diagnostics. Keep the setup key private; sharing the status response is sufficient for troubleshooting.

## Data and free-plan limits

The Durable Object retains data across Worker restarts and deployments. Keep the `LMS_WORKSPACE` binding, `MeridianWorkspace` class, migrations, Worker name, and fixed workspace ID unchanged when updating this deployment. Deleting the Worker/storage or switching those identities can disconnect or delete the data.

This is a single shared institution workspace. The front Worker serves assets and forwards API requests to the durable workspace, where authentication and database work run. API calls are serialized to bound password-hashing memory use. It is intended for modest workloads within the free quotas.

Cloudflare's [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) documents free request, duration, storage, and SQL-operation quotas. At the time this configuration was prepared, SQLite Free included 5 GB storage, 5 million rows read/day, 100,000 rows written/day, and 100,000 Durable Object requests/day. Exceeding free limits can make requests fail until the relevant allowance resets; it does not make this configuration upgrade itself. Check current limits in Cloudflare before a large rollout.

Grade and analytics CSV exports are available inside the app. They are reports, not complete database backups. Use Cloudflare's documented [SQLite storage and recovery facilities](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) for this hosted database. The local `.data/lms.sqlite` file and Node account-management CLI do not operate on the Cloudflare database. The browser bootstrap provisions the first admin; additional operator-only account provisioning/recovery remains a separate administration task.

## Updates

Push tested updates to the connected branch and deploy through Cloudflare. Keep any Git-triggered deployments restricted to the intended production branch. Build output, local database files, `.dev.vars`, and `.wrangler` state are ignored by Git. The app never receives a Cloudflare API token or GitHub token from its visitors.

## Local verification

```sh
npm ci --include=dev
npm run build
npm test
npm run check:cloudflare
npm run test:cloudflare
```

`check:cloudflare` bundles the Worker in dry-run mode. `test:cloudflare` runs an isolated local Workers runtime with temporary secrets and database state, exercises setup and native scoring, restarts the runtime, and checks persistence. Neither command deploys to Cloudflare or activates billing.

For an interactive local preview, create an ignored `.dev.vars` file containing your own random `LMS_SETUP_TOKEN`, then run `npm run dev:cloudflare`. Local state is saved under ignored `.wrangler` storage and is separate from the deployed site.
