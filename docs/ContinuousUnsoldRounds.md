# Configurable continuous unsold rounds

The owner can enable **Sell all players** under **Auction Rules & Purse** while a tournament is DRAFT. The API field is `sellAllPlayers`; omitted values default to false. Configuration locks once the tournament leaves DRAFT.

- **Off (default):** players get up to three attempts: the normal auction, Unsold Round 1 (attempt 2), and the Final Unsold Round (attempt 3). After all normal sets finish, the auctioneer launches Unsold Round 1. If players remain unsold after it, the console offers **Launch Final Unsold Round (Attempt 3)**. Both rounds are required for players still unsold; completion and squad overrides cannot skip them. Players unsold on attempt 3 become `FINAL_UNSOLD`. There is no fourth attempt. If everyone sells earlier, no further round is needed.
- **On:** after all regular sets finish, launch the initial unsold round. Resolving the last lot of each unsold round automatically queues another round for players whose latest result is `UNSOLD`. Attempt numbers continue through 3, 4, and beyond until every player is `SOLD`.

The auctioneer still reveals and resolves each player. Later rounds retain base prices, persist a new randomized draw, and preserve all earlier attempts. Pending rounds prevent duplicate queues. The round-start audit event records player count, attempt number, and unsold round number. Resolving a lot and queuing the next round are saved together before broadcasting the state.

Auction completion requires every registered player to be SOLD in enabled mode. An owner override for minimum squad requirements cannot bypass this condition. Existing price floors, purse reserves, and maximum squad limits remain enforced.

Preflight verifies a complete allocation at actual base prices within each team's purse and squad limits. Every bid with a leading team, sale, and result correction repeats that check for the hypothetical purchase: refund a replaced result, charge the proposed team, remove the purchased player, and allocate every remaining player, including later sets and unsold players. The allocation must respect both minimum and maximum squad sizes. A bid without a leading team is rejected in enabled mode because its effect on the remaining purses cannot be checked. Disabled mode keeps the original floor-based reserve behavior.

The validator tries quick complete allocations followed by a memoized search with equivalent-team pruning. It accepts only a complete allocation witness. Search is bounded to 50,000 states and 2,000 player levels; if it cannot establish feasibility within that limit, the action is rejected with an explicit validation-limit message. No lot, purse, session version, or audit entry is changed by a rejection. Team purse limits shown on the console remain financial upper bounds; the remaining-player allocation can impose a lower limit for a particular purchase.

The console, projector, public portal, results, and attempt history support later rounds and reconnect with the persisted state. History filters include all unsold-round attempts. With Sell all players off, only attempt 3 is final; with it on, no unsold attempt is final. Corrections cannot change an earlier attempt after another has been queued for that player.

The three-attempt rule needs no database migration. Existing completed auctions keep their results. An in-progress auction whose second attempt was marked Final Unsold by the previous version can launch the new third attempt; those players return to UNSOLD when the round is queued. Existing base prices and previous attempts are retained.

## Database migration

`20261005104441_AddSellAllPlayers` adds a non-null boolean `SellAllPlayers` column to `TournamentSettings` with a false default. Existing tournaments retain their behavior. No new deployment environment variables are required; the existing migration process applies the column to PostgreSQL, including the configured Supabase database.

## Verification

The three-attempt update is covered by backend tests for final status and audit flags, completion guards, third-attempt sales, reload persistence, duplicate/fourth-round prevention, and continuing an in-progress auction from the previous rule. `tests/auction-three-attempts.spec.ts` checks both console launch actions, reload recovery, projector labels, and history labels in standard and continuous modes. The existing continuous-round backend tests still cover fourth and later attempts.

Backend suite: 93 tests, including continuous rounds, preserved base prices and attempt history, reload persistence, duplicate prevention, completion blocking, locked configuration, and preflight feasibility. Allocation tests include the last expensive player with all other teams full, future sets, previously unsold players, same-team refunds, team transfers, unchanged state after rejection, disabled-mode compatibility, and comparison with exhaustive assignments across 250 small randomized pools. A 1,000-player pool checks the quick allocation path, and a separate case checks fallback search and rejection on work-limit exhaustion.

Browser suites: realtime synchronization, default unsold workflow/corrections, results/public views, and continuous rounds. The continuous workflow creates an isolated tournament, saves the setting through the UI, follows a player through three UNSOLD attempts and a fourth SOLD attempt, reloads the console/projector, and verifies final rosters, spending, and locked configuration. It also checks that the existing seeded tournament retains the disabled default.

All four browser workflows passed. The initial combined run had a Playwright response-handle error during the older realtime test's reload; the isolated realtime rerun passed, including reconnect and concurrent sale checks. Production build and lint passed with existing chunk-size and lint warnings. Entity Framework reports no pending model changes.

Run `dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build` after building, and `npx playwright test` from `frontend` with the API and Vite servers running. Frontend compilation and lint are checked with `npm run build` and `npm run lint`.

`npm run test:purse` checks the spending protection through the console and API: a ₹1,500 bid/sale would strand a later ₹3,000 player and is rejected; ₹1,000 is accepted, leaving exactly ₹3,000 for that player. The auction then completes with all four players sold.

After adding purchase protection, the purse, continuous-round, and default workflow/correction browser tests passed together. Backend build passed with zero warnings/errors; frontend build and lint passed with the existing warnings.
