# Milestone 7 — SignalR and projector view

Milestones 0–7 are complete. Milestone 8 remains pending.

## Running the live screens

Run the API at `http://localhost:5050` and Vite at `http://localhost:5174`.

- Auctioneer: `/tournaments/{id}/auction` (requires tournament membership).
- Projector: `/tournaments/{id}/projector` or `/tournaments/{id}/stage`.
- Shareable public route: `/live/{slug}` (requires no login).

The console's **Projector** link opens a separate window. Select a team and price, then press **Update Live Bid** to publish the current physical floor bid. Draft input changes stay local until recorded. SOLD still validates and commits the selected final team and price independently. Quick increments use the tournament's configured bid increment.

The projector shows the active player, photo or placeholder, jersey, position, base price, recorded leading bid and team, latest result, team purses and selectable current squads, progress, and recent signings. SOLD triggers a brief confetti animation; refresh restores the result without replaying the celebration. Animations respect reduced-motion preferences. Use the fullscreen button or F11.

## State and transport

PostgreSQL remains authoritative. Migration `AddLiveBidState` adds nullable BIGINT `CurrentBid` and `LeadingTeamId` to auction lots. Monetary values retain the application's existing integer-unit convention. Auction session `Version` now provides EF optimistic concurrency protection; conflicting requests return HTTP 409.

`POST /api/tournaments/{id}/auction/bid` accepts `lotId`, `currentBid`, and nullable `leadingTeamId`. Only an OWNER or AUCTIONEER can record bids, only on the active lot while LIVE. Team membership, base price, purse, squad capacity, and reserve constraints are checked server-side. A recorded bid does not spend any purse.

`/hubs/auction` provides `JoinAuction(string tournamentId)` and `LeaveAuction(string tournamentId)`. The original `JoinTournamentGroup` / `LeaveTournamentGroup` names remain as aliases. GUIDs are normalized. JWT tournament members join `admin:tournament:{id}`; anonymous clients and nonmembers can join `public:tournament:{id}` only when public live viewing is enabled.

Every committed auction command broadcasts `AuctionStateChanged(status)`. Specific commands also broadcast `PlayerRevealed`, `BidUpdated`, `PlayerSold`, `PlayerUnsold`, `SetCompleted`, and `ResultCorrected`. Member result-correction messages include the audit reason. Public messages use separate sanitized lot DTOs and omit the reason, audit identities, session IDs, and draw positions. A failed transport delivery is logged and does not report an already committed sale as failed.

`GET /api/public/tournaments/{slug-or-id}/auction-state` is anonymous and read-only. Disabled or missing public views return 404. It exposes only the active lot, latest completed result, sold rosters, summaries, currency, and authoritative team finances. Pending lots and their persisted random sequence are never returned. Public unsold counts reflect player status, so an unsold first attempt and a second attempt do not count the same player twice.

`useAuctionSocket` retries both initial connection failures and transport disconnects. After every reconnect it rejoins the authorized group and refetches canonical state. Event bursts coalesce; events received during a fetch cause another fetch. Failed synchronization retries and keeps the console locked while retaining the last known display. Offline detection closes the socket; online and visibility changes trigger recovery. The connection indicator distinguishes connecting, synchronizing, live, and disconnected states. Mutations and hotkeys are blocked while the connection is stale; sale controls are also disabled while paused.

## Verification

Build the backend while its API process is stopped, then run:

```powershell
dotnet build backend/TournamentAuction.slnx
dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build
cd frontend
npm run build
npm run lint
npm run test:realtime
```

Backend verification: **60/60 tests pass**, including all original 54. New tests cover broadcasts after persistence, public sanitization and visibility, recorded-bid and last-result recovery, rejected bids, delivery failures, and group authorization. Backend build: zero warnings and errors.

The Playwright scenario uses independent browser contexts for two auctioneer consoles and an anonymous projector. It creates a fresh test account and tournament rather than changing an existing auction. It exercises initial hub connection failure/retry, reveal, recorded bid, SOLD, UNSOLD, correction with both purses recalculated, refresh recovery, transport disconnect/reconnect with missed events and a new WebSocket, stale/paused controls, set completion, concurrent sale requests, public visibility gates, and fullscreen. It checks the projector at 1920×1080 and at mobile width and checks both HTTP and SignalR payloads for private data. Screenshots are written under `.cache/browser-results/`.

The browser check requires a locally installed Chrome, the API, and Vite. Optional environment variables: `AUCTION_API_URL` and `AUCTION_FRONTEND_URL`. Each run leaves its separate verification tournament and audit records in the development database.
