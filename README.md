# Local Football Tournament Auction Platform

A production-quality web application for conducting live, IPL-style local football player auctions.

## Architecture Overview

```
React (Vite + TS + Tailwind)
       ↓ (HTTP / REST)
ASP.NET Core 10 Web API
       ↓ (EF Core)
PostgreSQL 16 (Authoritative Store)
       ↓ (Real-time Broadcasts)
ASP.NET Core SignalR → React Clients (Auctioneer & Live Projector)
```

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/)
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Docker & Docker Compose](https://www.docker.com/)

---

## Getting Started Locally

### 1. Start PostgreSQL Database
```bash
docker compose up -d
```
This spins up PostgreSQL on port `5432` with database `tournament_auction`.

### 2. Run the Backend API
```bash
dotnet build backend/TournamentAuction.slnx
cd backend/TournamentAuction.Api
dotnet run --no-build
```
- API Base URL: `http://localhost:5050`
- Swagger UI: `http://localhost:5050/swagger`
- Health Check: `http://localhost:5050/health`
- SignalR Auction Hub: `http://localhost:5050/hubs/auction`

### 3. Run Backend Unit Tests
```bash
cd backend/TournamentAuction.Tests
dotnet test --no-build
```

### 4. Run the Frontend Client
```bash
cd frontend
npm install
npm run dev -- --port 5174
```
- Frontend UI: `http://localhost:5174`

---

Build before starting the API when changing backend code. On Windows, the running API locks `TournamentApp.Api.dll`; keep `--no-build` when testing while the API is running.

## Live Auction and Projector

Open the auctioneer at `/tournaments/{id}/auction` and use its **Projector** link to open `/tournaments/{id}/projector`. The public `/live/{slug}` route requires no login when public live viewing is enabled. Recorded bids, players, results, purses, and squads update through SignalR. Fullscreen and reconnect recovery are supported.

See [Milestone 7 implementation and verification](docs/Milestone7.md). Run `npm run test:realtime` from `frontend` with the local API, Vite, and Chrome available to verify synchronization in separate browser windows.

Use **Copy Projector Link** in the console to share the public screen with another device after hosting. The link uses the site's current origin and contains no authentication token. Production targets and configuration are documented in [Render and Supabase setup](docs/RenderSupabase.md).

The console's **Auction history** link opens `/tournaments/{id}/auction/history`, with separate attempt rows, current purse balances, and the correction audit trail. See [Milestone 8 implementation and verification](docs/Milestone8.md). Run `npm run test:workflow` for the unsold-round and correction browser workflow.

Milestone 9 adds `/tournaments/{id}/results` for live statistics and the completed **Auction Wrapped** experience. `/live/{slug}` now provides the public Overview, Teams, Players, and Results views; fullscreen remains at `/tournaments/{id}/projector` or `/live/{slug}/projector`. **Copy Franchise Link** shares `/live/{slug}/teams/{teamId}` without login. See [Milestone 9 implementation and verification](docs/Milestone9.md); run `npm run test:results` or all browser suites with `npx playwright test`.

**Sell all players** can be enabled under Auction Rules & Purse before a tournament is ready. It automatically continues unsold rounds until every player sells; leaving it off preserves the single final unsold round. See [continuous unsold rounds](docs/ContinuousUnsoldRounds.md); run `npm run test:continuous` for the browser workflow.

With **Sell all players** enabled, bids, sales, and corrections are rejected if they would prevent any complete purchase allocation of the remaining player pool at actual base prices within individual team purses and squad limits. Preflight checks the same allocation. Run `npm run test:purse` for the regression where an expensive final player needs the only team with an available squad slot.

Each **Participating Teams** card includes its shareable franchise URL, copy button, and public view link. Public Live View controls guest access. When a set's final player is resolved, the auction console shows the sold/unsold totals and hides Reveal Next Player. **Go to Next Set** completes the current set and starts the next ordered set on request; **Complete Active Set** still opens the summary for review. The workflow browser test covers copying a team link, anonymous access, finished-set reloads, ordered advancement, and keyboard reveal in the next set.

Once a tournament is READY, its Overview displays the **Auctioneer panel link**, **Copy Auctioneer Link**, and **Open Auctioneer Console**. The link stays available during live and completed auctions. Open it on another system and sign in with the existing configuring account; successful sign-in returns to the linked tournament console. The URL contains no credentials and preserves normal tournament permissions. Direct sign-in without a protected destination still opens the dashboard. Run `npm run test:access` to verify this flow. Development milestone labels and internal engine/console version badges are excluded from the application UI.

Completed auctions also have a dedicated **Auction Recap** at `/live/{slug}/recap` for public sharing and `/tournaments/{id}/recap` for members. It presents the headline signing, every player, team spending, price lifts, and comeback stories in a mobile-first single-page layout without charts. Open/copy links appear in the overview, console, and results page after completion. Native device sharing and clipboard fallback are supported; Public Live View controls guest access. See [the auction recap](docs/AuctionRecap.md) and run `npm run test:recap`.

## Specification Reference & Milestones

See `docs/ImplementationPLAN.txt` for the full master specification.

- **Milestone 0**: Project Foundation & Runtimes (Completed)
- **Milestone 1**: Authentication & Tournament Management (Completed)
- **Milestone 2**: Tournament Configuration & Teams (Completed)
- **Milestone 3**: Sets & Players (with CSV Preview Import) (Completed)
- **Milestone 4**: Preflight Validation Checklist (Completed)
- **Milestone 5**: Backend Auction Engine (Transactions, Reserves, Lots) (Completed)
- **Milestone 6**: Auctioneer Console UI (Completed)
- **Milestone 7**: SignalR Real-Time Sync & Projector Screen (`/live/:slug`) (Completed)
- **Milestone 8**: Unsold Rounds & Controlled Corrections Audit (Completed)
- **Milestone 9**: Statistics & Auction Wrapped Experience (Completed)
- **Milestone 10**: Media Handling, Exports & Final Polish
