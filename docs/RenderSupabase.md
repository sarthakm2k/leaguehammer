# Render hosting and Supabase PostgreSQL

The deployment targets from the master plan are a **Render Static Site** for React, a **Render Web Service** for the .NET API, and **Supabase PostgreSQL** for the database. Supabase is used as managed PostgreSQL; the application keeps its existing authentication, EF Core models, and auction engine.

This document records the intended production configuration. The application has been verified locally; production deployment and cross-device verification on Render are still pending.

## Public links on another system

The auction console provides **Projector** and **Copy Projector Link**. Copying creates an absolute URL from the frontend's current origin, without an authentication token:

```text
https://<frontend-domain>/tournaments/<tournament-id>/projector
https://<frontend-domain>/live/<tournament-slug>
```

Open the link in any other device's browser. No login is required when **Public Live View** is enabled in tournament settings. The projector reads the public state endpoint and joins the public SignalR group. Disabling public viewing blocks new public reads and subscriptions. Each viewer can enter fullscreen independently.

Local `localhost` links refer to the device opening them. For remote viewers, share the deployed HTTPS URL. The separate static-site origin and API origin are supported through `VITE_API_BASE_URL` and the API CORS allowlist.

## Render Static Site

- Root directory: `frontend`.
- Build command: `npm ci && npm run build`.
- Publish directory: `dist`.
- Build-time environment variable: `VITE_API_BASE_URL=https://<api-domain>` (no trailing slash).
- Rewrite `/*` to `/index.html`, so projector, history, and live links work when opened directly or refreshed.

Rebuild the frontend when changing its API URL. Never put a database connection string, database password, JWT signing secret, or Supabase privileged key in a `VITE_` variable.

Render's [static-site rewrite documentation](https://render.com/docs/redirects-rewrites) describes the fallback configuration.

## Render Web Service

The API uses the assembly name `TournamentApp.Api.dll`. The production container must publish the .NET 10 project and listen on Render's assigned port, for example:

```sh
dotnet TournamentApp.Api.dll --urls "http://0.0.0.0:${PORT}"
```

Configure these server-only environment variables:

| Variable | Value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__DefaultConnection` | Supabase connection parameters in Npgsql format |
| `Jwt__Secret` | A separate strong production signing secret |
| `Cors__AllowedOrigins__0` | Exact frontend HTTPS origin, without a trailing slash |

Use `/health` to check API and database connectivity. Keep the API on one instance while SignalR groups are maintained in memory. Horizontal scaling requires a shared SignalR backplane or managed equivalent.

Render web services support public WebSockets. Verify `/hubs/auction` over `wss://` after deployment, including a disconnect/reconnect and refresh. See [Render WebSockets](https://render.com/docs/websocket).

## Supabase database

Obtain the database parameters from the Supabase project's **Connect** panel. Use a reachable direct connection or the **session pooler** for the long-running API; do not substitute Supabase's REST URL or public API key for PostgreSQL credentials. The session pooler supports IPv4 when a direct database host is unsuitable.

An illustrative Npgsql connection string is:

```text
Host=<host-from-Connect>;Port=<port-from-Connect>;Database=postgres;Username=<user-from-Connect>;Password=<database-password>;SSL Mode=Require
```

Use the exact project host, port, and username supplied by Supabase. SSL certificate verification can be configured with `SSL Mode=VerifyFull` and the supplied root certificate. See [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

Existing EF migrations must be applied to the production database. Currently the API applies migrations on startup; production packaging must establish a controlled migration step before deployment, as specified in the master plan. The Render Dockerfile/hosting configuration and production migration procedure will be finalized with deployment polish. No production database or Render service is provisioned by this milestone.

## Production verification

Open the console on the organizer's device and the copied projector link on a different device. Reveal a player, update a bid, record a sale, and correct the latest result; verify both displays and team purses agree. Refresh the projector and briefly disconnect/reconnect its network; it should recover the canonical state. Confirm a logged-out viewer cannot mutate the auction or read its internal audit history.
