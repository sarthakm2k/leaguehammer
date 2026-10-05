# Configurable continuous unsold rounds

The owner can enable **Sell all players** under **Auction Rules & Purse** while a tournament is DRAFT. The API field is `sellAllPlayers`; omitted values default to false. Configuration locks once the tournament leaves DRAFT.

- **Off (default):** retain the existing mandatory final unsold round. Players unsold on attempt 2 become `FINAL_UNSOLD`, and normal completion rules apply.
- **On:** after all regular sets finish, launch the initial unsold round. Resolving the last lot of each unsold round automatically queues another round for players whose latest result is `UNSOLD`. Attempt numbers continue through 3, 4, and beyond until every player is `SOLD`.

The auctioneer still reveals and resolves each player. Later rounds retain base prices, persist a new randomized draw, and preserve all earlier attempts. Pending rounds prevent duplicate queues. The round-start audit event records player count, attempt number, and unsold round number. Resolving a lot and queuing the next round are saved together before broadcasting the state.

Auction completion requires every registered player to be SOLD in enabled mode. An owner override for minimum squad requirements cannot bypass this condition. Existing price floors, purse reserves, and maximum squad limits remain enforced. Preflight checks whether combined starting purses and affordable squad slots can accommodate the pool; actual bidding must still leave sufficient funds and squad space.

The console, projector, public portal, results, and attempt history support later rounds and reconnect with the persisted state. History filters include all unsold-round attempts and do not mark attempt 2 as final when continuous rounds are enabled. Corrections cannot change an earlier attempt after another has been queued for that player.

## Database migration

`20261005104441_AddSellAllPlayers` adds a non-null boolean `SellAllPlayers` column to `TournamentSettings` with a false default. Existing tournaments retain their behavior. No new deployment environment variables are required; the existing migration process applies the column to PostgreSQL, including the configured Supabase database.

## Verification

Backend suite: 82 tests, including continuous rounds, preserved base prices and attempt history, reload persistence, duplicate prevention, completion blocking, locked configuration, and preflight feasibility.

Browser suites: realtime synchronization, default unsold workflow/corrections, results/public views, and continuous rounds. The continuous workflow creates an isolated tournament, saves the setting through the UI, follows a player through three UNSOLD attempts and a fourth SOLD attempt, reloads the console/projector, and verifies final rosters, spending, and locked configuration. It also checks that the existing seeded tournament retains the disabled default.

All four browser workflows passed. The initial combined run had a Playwright response-handle error during the older realtime test's reload; the isolated realtime rerun passed, including reconnect and concurrent sale checks. Production build and lint passed with existing chunk-size and lint warnings. Entity Framework reports no pending model changes.

Run `dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build` after building, and `npx playwright test` from `frontend` with the API and Vite servers running. Frontend compilation and lint are checked with `npm run build` and `npm run lint`.
