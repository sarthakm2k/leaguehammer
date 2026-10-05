# Milestone 8 — Unsold round, corrections and history

Milestones 0–8 are implemented. Milestone 9 remains pending, including the expanded public portal, public franchise direct links, team squad pages, and statistics.

## Final unsold round

Normal sets must run in their configured order and be explicitly completed. The console offers the next unfinished set. An unresolved active set, unstarted set, or pending lot prevents starting the final round or completing the auction.

Each first-attempt unsold player receives a separate second lot with its original base price. The original lot, result, and audit events remain stored. The final draw is shuffled server-side and persisted; it is never regenerated after starting. An unsold second attempt makes the player's current status `FINAL_UNSOLD`. No third attempt is allowed.

The console now offers completion when the final round has no remaining lots. Counts use current player outcomes, so a player sold on attempt 2 is counted as sold once, while attempt 1 remains visible as unsold in history. Normal set summaries include only normal attempts.

The mandatory second attempt cannot be bypassed by an override. A tournament owner may complete with minimum-squad shortfalls only after entering an audit reason. Auctioneers cannot provide this override.

## Controlled corrections

Only the most recent completed SOLD/UNSOLD result may be corrected, during a live or paused auction, with no active lot and no later attempt for that player. Completed tournaments and older results are protected.

Corrections require a nonblank reason of at most 500 characters, a team belonging to the tournament, an integer price meeting the player's base price and tournament floor, an affordable purse that preserves the minimum-squad reserve, and space within the maximum squad size.

The original sale is excluded before validating the corrected purchase. This supports raising a price for the same team after refunding its original charge. Team purses and squad sizes are recalculated from persisted SOLD lots. The mutation, session version, and correction audit record are saved together before broadcasting updates. Existing session optimistic concurrency protects overlapping writes.

The audit records old team/price/status, new team/price/status, attempt number, actor, timestamp, and reason. Original sale/unsold events remain. Latest UNSOLD results may be corrected to SOLD when the operator entered the wrong outcome; this does not remove the attempt.

## History viewer

`/tournaments/{id}/auction/history` is authenticated and tournament-member restricted. It provides:

- Every completed player attempt with set, outcome, winning team, price, and timestamp.
- Search by player/set/team and filters for sold, unsold, and final-round attempts.
- Current team purse and squad balances.
- Readable correction details and an audit timeline with older-event pagination.
- A correction dialog for eligible organizer actions, including audit reason and refund-aware price validation.
- SignalR synchronization, reconnect recovery, and refresh persistence.

The backend exposes `GET /api/tournaments/{id}/auction/history` for completed attempts and adds bounded `take`/`skip` pagination to the existing events endpoint. Pending lots are excluded from history. Unauthorized members receive HTTP 403; anonymous requests receive HTTP 401. Private reasons are still excluded from public SignalR messages.

No schema changes were needed. Completed normal sets are recovered from existing `SET_COMPLETED` audit records.

## Public projector sharing and deployment targets

**Copy Projector Link** creates an absolute, token-free link using the frontend's current origin. The browser verification opens that link in a separate anonymous context and confirms live updates. The deployed URL can be opened on another system when public live viewing is enabled. Actual Render cross-device verification remains a deployment step.

The production targets remain Render Static Site + Render Web Service + Supabase PostgreSQL. [RenderSupabase.md](RenderSupabase.md) records environment variables, SPA rewrites, WebSockets, database SSL, and remaining deployment preparation. This milestone does not provision or deploy production services.

## Verification

- Backend build: no warnings or errors.
- Backend tests: 73 passing, including the original 54 and Milestone 7's six tests.
- Frontend production build: no errors; existing bundle-size advisory remains.
- Frontend lint: no errors; existing React hook/effect warnings remain.
- EF model: no pending schema changes.
- Both Playwright browser suites pass: the existing console/projector synchronization test and the new final-round/history/correction test.

`AuctionWorkflowTests.cs` adds regression cases for preserved attempts, sequential sets, persisted draws, mandatory final rounds, no third attempts, same-team refunds, transferring purchases, minimum-price and reserve checks, maximum squads, paused corrections, stale/active/completed result rejection, private history, pagination, and owner overrides.

`frontend/tests/auction-workflow.spec.ts` creates a fresh tournament with two ordered sets, records UNSOLD then SOLD on attempt 2, verifies both attempts after refresh, corrects the same-team price and winning team through the history UI, checks both purses on live displays, verifies search/filtering, completes with an owner reason, and checks anonymous/outsider access restrictions. The seeded organizer tournament is left untouched.

Run with PostgreSQL, API on port 5050, Vite on port 5174, and Chrome available:

```powershell
dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build
cd frontend
npm.cmd run build
npm.cmd run lint
npx.cmd playwright test
```

Build the backend before starting the API, or use a separate Release build while the Debug API is running, to avoid Windows DLL locks.
