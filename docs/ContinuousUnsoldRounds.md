# Configurable continuous unsold rounds

The owner can enable **Sell all players** under **Auction Rules & Purse** while a tournament is DRAFT. The API field is `sellAllPlayers`; omitted values default to false. Configuration locks once the tournament leaves DRAFT.

- **Off (default):** retain the existing mandatory final unsold round. Players unsold on attempt 2 become `FINAL_UNSOLD`, and normal completion rules apply.
- **On:** after all regular sets finish, launch the initial unsold round. Resolving the last lot of each unsold round automatically queues another round for players whose latest result is `UNSOLD`. Attempt numbers continue through 3, 4, and beyond until every player is `SOLD`.

The auctioneer still reveals and resolves each player. Later rounds retain base prices, persist a new randomized draw, and preserve all earlier attempts. Pending rounds prevent duplicate queues. The round-start audit event records player count, attempt number, and unsold round number. Resolving a lot and queuing the next round are saved together before broadcasting the state.

Auction completion requires every registered player to be SOLD in enabled mode. An owner override for minimum squad requirements cannot bypass this condition. Existing price floors, purse reserves, and maximum squad limits remain enforced.

Preflight verifies a complete allocation at actual base prices within each team's purse and squad limits. Every bid with a leading team, sale, and result correction repeats that check for the hypothetical purchase: refund a replaced result, charge the proposed team, remove the purchased player, and allocate every remaining player, including later sets and unsold players. The allocation must respect both minimum and maximum squad sizes. A bid without a leading team is rejected in enabled mode because its effect on the remaining purses cannot be checked. Disabled mode keeps the original floor-based reserve behavior.

The validator tries quick complete allocations followed by a memoized search with equivalent-team pruning. It accepts only a complete allocation witness. Search is bounded to 50,000 states and 2,000 player levels; if it cannot establish feasibility within that limit, the action is rejected with an explicit validation-limit message. No lot, purse, session version, or audit entry is changed by a rejection. Team purse limits shown on the console remain financial upper bounds; the remaining-player allocation can impose a lower limit for a particular purchase.

The console, projector, public portal, results, and attempt history support later rounds and reconnect with the persisted state. History filters include all unsold-round attempts and do not mark attempt 2 as final when continuous rounds are enabled. Corrections cannot change an earlier attempt after another has been queued for that player.

## Database migration

`20261005104441_AddSellAllPlayers` adds a non-null boolean `SellAllPlayers` column to `TournamentSettings` with a false default. Existing tournaments retain their behavior. No new deployment environment variables are required; the existing migration process applies the column to PostgreSQL, including the configured Supabase database.

## Verification

Backend suite: 93 tests, including continuous rounds, preserved base prices and attempt history, reload persistence, duplicate prevention, completion blocking, locked configuration, and preflight feasibility. Allocation tests include the last expensive player with all other teams full, future sets, previously unsold players, same-team refunds, team transfers, unchanged state after rejection, disabled-mode compatibility, and comparison with exhaustive assignments across 250 small randomized pools. A 1,000-player pool checks the quick allocation path, and a separate case checks fallback search and rejection on work-limit exhaustion.

Browser suites: realtime synchronization, default unsold workflow/corrections, results/public views, and continuous rounds. The continuous workflow creates an isolated tournament, saves the setting through the UI, follows a player through three UNSOLD attempts and a fourth SOLD attempt, reloads the console/projector, and verifies final rosters, spending, and locked configuration. It also checks that the existing seeded tournament retains the disabled default.

All four browser workflows passed. The initial combined run had a Playwright response-handle error during the older realtime test's reload; the isolated realtime rerun passed, including reconnect and concurrent sale checks. Production build and lint passed with existing chunk-size and lint warnings. Entity Framework reports no pending model changes.

Run `dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build` after building, and `npx playwright test` from `frontend` with the API and Vite servers running. Frontend compilation and lint are checked with `npm run build` and `npm run lint`.

`npm run test:purse` checks the spending protection through the console and API: a ₹1,500 bid/sale would strand a later ₹3,000 player and is rejected; ₹1,000 is accepted, leaving exactly ₹3,000 for that player. The auction then completes with all four players sold.

After adding purchase protection, the purse, continuous-round, and default workflow/correction browser tests passed together. Backend build passed with zero warnings/errors; frontend build and lint passed with the existing warnings.
