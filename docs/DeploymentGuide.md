# LeagueHammer deployment: free Render + Supabase

Deploy React as a **Render Static Site**, the .NET 10 API as a **free Render Web Service**, and use **Supabase PostgreSQL and Storage** for persistent data. The application keeps its own accounts, JWTs, EF Core and SignalR. Supabase Auth, Realtime and Edge Functions are not required.

The Dockerfile and registration migration are included. Cloud resources have not been provisioned; follow this guide in your own accounts and complete the hosted verification before sharing links widely.

## 1. Prepare the repository

Push the committed repository to a Git provider connected to Render. Keep passwords, privileged keys, local environment files and real player exports out of Git. This guide uses example domains; replace them with your assigned domains:

- Frontend: `https://leaguehammer.onrender.com`
- API: `https://leaguehammer-api.onrender.com`

## 2. Supabase PostgreSQL

1. Create a Supabase Free project in a region near your users and chosen Render region. Save its database password securely.
2. Open **Connect → Session pooler**. Copy the exact host, port, database and username shown there. Session pooling supports IPv4; do not guess the region hostname or substitute the transaction pooler. [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
3. Build an **Npgsql** connection string from those fields:

```text
Host=<session-pooler-host>;Port=5432;Database=postgres;Username=postgres.<project-ref>;Password=<database-password>;SSL Mode=Require;Maximum Pool Size=10;Timeout=30;Command Timeout=60
```

Use the actual fields from **Connect**. If a password contains a semicolon or quote, use Npgsql quoted values. Do not paste a `postgresql://` URI directly into this setting. For stricter certificate verification, configure `SSL Mode=VerifyFull` with the project's trusted certificate configuration.

4. For this dedicated project, disable the **Data API** under **Project Settings → Data API**. Our API connects through Npgsql and does not need PostgREST or GraphQL. Storage remains a separate service. This prevents alternate public access to application tables containing passwords and player contact details. If another app in the same project needs the Data API, isolate schemas and configure grants/RLS instead. [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)

EF Core creates the application tables through migrations on startup. Do not manually create Users, Players or registration tables. A new cloud database starts empty: the local admin account and tournaments are not copied. Register your organiser account through LeagueHammer after deployment.

## 3. Supabase photo storage

Create these buckets in **Storage**:

| Bucket | Visibility | Contents |
| --- | --- | --- |
| `registration-photos` | **Private** | Submitted photos; organisers receive temporary signed review URLs |
| `player-photos` | **Public** | Approved photos shown in player profiles, broadcast and results |

For both buckets, configure a **3 MB** limit (3,145,728 bytes) and allowed MIME types `image/jpeg`, `image/png`, `image/webp`. Do not add anonymous/authenticated upload, update or delete policies. Backend writes use its privileged key; private photos must have no anonymous read policy. Public bucket visibility supplies public reads for approved photos. [Create buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

Under **Project Settings → API Keys**, obtain the **legacy `service_role` JWT key** and the project URL (`https://<project-ref>.supabase.co`). This adapter sends that JWT as `apikey` and Bearer authorization. Do not substitute `anon`, publishable or `sb_secret_...` keys. Store it only in the backend environment. [Supabase key types](https://supabase.com/docs/guides/getting-started/api-keys)

Uploads pass through the API after it wakes. The frontend never receives a storage write key. The backend checks file size, MIME type and signature, ignores the supplied filename, and writes `<tournament-id>/<submission-id>.<extension>`. Approval publishes a copy in `player-photos`; review URLs expire after one hour and renew when the organiser reopens the application for review. Only the selected photo is signed, so the queue does not wait on storage calls for every application. These files use the standard upload API. [Supabase uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)

The LeagueHammer account signing secret is separate from all Supabase credentials.

## 4. Render backend

Create **New → Web Service**, connect the repository, and configure:

| Setting | Value |
| --- | --- |
| Runtime | Docker |
| Branch | Your production branch |
| Root directory | Leave blank (repository root) |
| Dockerfile path | `backend/Dockerfile` |
| Docker build context | `.` |
| Instance type | **Free** |
| Health check path | `/health` |
| Docker command override | Leave blank |

The Dockerfile publishes .NET 10, runs as a non-root user and listens on `0.0.0.0:$PORT` (fallback 10000). Its assembly is `TournamentApp.Api.dll`. [Render Docker](https://render.com/docs/docker), [Web services](https://render.com/docs/web-services)

Add the following **backend environment variables**:

| Name | Value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__DefaultConnection` | Complete Npgsql connection string from step 2 |
| `Jwt__Secret` | Unique randomly generated secret, minimum 32 characters; recommended 64+ |
| `Cors__AllowedOrigins__0` | Exact frontend HTTPS origin, no trailing slash |
| `Supabase__Url` | `https://<project-ref>.supabase.co`, no trailing slash |
| `Supabase__ServiceRoleKey` | Legacy service-role JWT from step 3 |
| `Supabase__RegistrationBucket` | `registration-photos` |
| `Supabase__PlayerBucket` | `player-photos` |
| `Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command` | `Warning` |
| `Database__ApplyMigrations` | `true` |

Double underscores are intentional .NET configuration separators. Generate the signing secret in a password manager and keep it stable between redeployments. Production refuses the checked-in development secret. No `VITE_` variables belong here.

Deploy and inspect logs. Startup applies EF migrations, including `AddPlayerRegistrations`; the database account needs migration permissions. `/health` should return HTTP 200 and `database.canConnect: true`. Keep one API instance because SignalR groups are in memory. Public WebSockets use `/hubs/auction`. [Render WebSockets](https://render.com/docs/websocket)

## 5. Render frontend

Create **New → Static Site** from the same repository:

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm ci && npm run build` |
| Publish directory | `dist` |
| `NODE_VERSION` environment variable | `22.14.0` or a newer supported Node 22 version |
| `VITE_API_BASE_URL` environment variable | Exact API HTTPS URL, no trailing slash |

In **Redirects/Rewrites**, add:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | **Rewrite** |

Use a rewrite, not a redirect, so shared registration, team, projector and recap links survive direct opens and refreshes. [Render SPA rewrite instructions](https://render.com/docs/redirects-rewrites)

Deploy. Update the API's `Cors__AllowedOrigins__0` to the assigned frontend origin and redeploy the API if necessary. `VITE_API_BASE_URL` is compiled into JavaScript: rebuild the static site when changing it. Never add database passwords, service-role keys or signing secrets to a `VITE_` variable.

## 6. Open registration and share links

1. Register/sign in to your organiser account on the hosted application.
2. Create a tournament, configure auction rules, teams, base-price tiers and player sets.
3. Open **Player Registrations**, enable the form, set opening/closing times and instructions, then save. Date inputs use your device timezone; players see deadlines in the tournament timezone.
4. Copy the registration link. Players need no account. Registration is independent of **Public Live View**.
5. Review applications, correct details, assign the set and base price, then approve or reject. Approval creates a normal player; contacts stay in the private queue. Verify possible duplicates before explicitly confirming approval.
6. Close submissions early or wait for the deadline; review remains available. Finalize when there are no pending submissions. This closes and locks registration. Manual player entry and CSV import remain available while the tournament is in draft. Preflight requires enabled registration to be finalized before READY.

Example links:

```text
https://leaguehammer.onrender.com/register/<slug>
https://leaguehammer.onrender.com/live/<slug>
https://leaguehammer.onrender.com/live/<slug>/projector
https://leaguehammer.onrender.com/live/<slug>/teams/<team-id>
https://leaguehammer.onrender.com/live/<slug>/recap
https://leaguehammer.onrender.com/tournaments/<tournament-id>/auction
```

Public auction links require public viewing enabled; recap needs a completed auction. The console requires normal sign-in and permissions. Links use the frontend's current origin and contain no credentials. Localhost links cannot open your app on another device.

## 7. Free-backend behavior

Render's free web service can sleep after 15 idle minutes; waking can take roughly a minute. Free services also have usage limits and can restart. A static frontend still loads, but API data and confirmation need the backend to wake. [Render Free limits](https://render.com/docs/free)

Registration retries its initial connection automatically and saves text as a tournament-specific local draft. Submission allows up to 100 seconds. An uncertain submission retains its reference and locks details; **Check & retry submission** first looks for an already-saved receipt. Reload checks a pending reference too. Concurrent retries return the same receipt, even after closing. Photos cannot be restored from browser file selection after refresh; select one again only if the original submission was not saved. Reconfirm consent when resubmitting. Success clears the local draft.

The API checks opening/closing times in UTC at acceptance. No background timer is required, so sleep does not prevent deadline enforcement. Opening the form before closing does not reserve a place after the deadline. Offline submission is not promised: success requires a persisted receipt. Local drafts should be cleared on shared devices.

Before a live event, open the organiser console early and check `/health`. SignalR reconnects and reloads canonical state. Free hosting cannot guarantee instant availability or uninterrupted service; this implementation does not use an external keep-alive service to defeat sleep.

Supabase Free projects can also pause after insufficient database activity over a week. Restore a paused project in Supabase and verify it before registrations or an event; a Render retry cannot restore it. [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

## 8. Hosted verification

- Confirm `/health` returns database connectivity.
- Open a registration link anonymously on another phone in both themes. Submit a small photo and save its reference.
- Confirm pending photos are private and queue/contacts require organiser permissions.
- Approve a player; verify the registry and public player photo. Reject another; confirm no player is created.
- Expire/close the form; confirm new submissions fail and existing receipts remain recoverable. Finalize, then run preflight.
- After actual Render idle sleep, open registration and verify wake-up messaging, recovery and draft preservation. This must be checked on the hosted service.
- Run a small auction across two devices: reveal, bid, sale, correction, purse and reconnect recovery.
- Refresh direct shared URLs to verify the SPA rewrite, including after adding custom domains.

## 9. Troubleshooting and maintenance

| Symptom | Check |
| --- | --- |
| API fails with signing-secret error | Set a unique backend `Jwt__Secret` |
| Database unavailable | Active Supabase project, exact Session pooler fields, correct database password, SSL |
| CORS error | Exact frontend origin in backend allowlist; redeploy after changing |
| Frontend calls wrong API | Correct `VITE_API_BASE_URL`, then rebuild Static Site |
| Shared URLs fail on refresh | `/* → /index.html` Rewrite |
| Photo uploads disabled | Set Supabase URL and legacy service-role JWT; restart API |
| Photo operations fail | Bucket names, private/public visibility, privileged JWT, 3 MB and MIME limits; reopen the review to renew expired links |
| Connecting indefinitely | Render deploy logs/usage limits; Supabase project status |
| Registration HTTP 429 | Wait one minute: submission and receipt endpoints share a 120-request/minute service-wide limiter |

The tournament submission cap is 10,000. Honeypot and limits provide basic spam protection; SMS verification and CAPTCHA are not included. Monitor usage and close forms if needed.

Back up PostgreSQL and Storage separately before events and schema changes. Database backups do not replace photo backups. Photos never depend on Render's ephemeral filesystem. Rejected/private photos and abandoned uploads are not automatically removed: choose a retention period and clean Storage objects that have no matching registration/player. A failed storage/database operation may leave an orphan; retries reuse its deterministic path. Do not share signed review URLs.

For future deployments, review and back up before migrations. Startup migrations default to enabled. To apply separately, generate a reviewed idempotent SQL script with `dotnet ef migrations script --idempotent --project backend/TournamentAuction.Api` on a trusted machine, apply it to the target database, and only then set `Database__ApplyMigrations=false`. Never disable migrations against an empty/outdated database.

Local validation commands:

```text
dotnet build backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj
dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build
docker build -f backend/Dockerfile -t leaguehammer-api .
cd frontend
npm.cmd run build
npm.cmd run lint
npx.cmd playwright test tests/player-registration.spec.ts
```

Stop the API before rebuilding its Debug assemblies on Windows. While it runs, tests must use `--no-build`. Browser tests require local PostgreSQL, the API, Vite on 5174 and Chrome; they create isolated tournaments. These commands do not provision cloud services.

Local verification on 2026-10-05: 107 backend tests pass; production frontend build and lint pass with existing warnings only; Docker build and production startup against local PostgreSQL succeed. Registration recovery and the existing browser scenarios are verified locally, with the history correction scenario rerun after fixing its dialog race. Hosted Supabase storage and actual Render idle wake-up remain the checks in step 8.
