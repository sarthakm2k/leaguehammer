# Milestone 9 — Statistics, Auction Wrapped and public franchises

Milestones 0–9 are implemented. Milestone 10 remains pending: uploads/storage, CSV exports, final polish and production deployment preparation. Render and Supabase remain the hosting/database targets; no production services are provisioned by this milestone.

## Results and statistics

Tournament results are available at `/tournaments/{id}/results`. They are generated on demand from current registered players, persisted auction lots, and the existing authoritative team standing calculation. No manually maintained statistics counters or new schema are introduced.

The API returns:

- Overall player/sold/unsold counts, sale percentage, total spend, average, median and highest price.
- Top ten signings, highest price premium and final/base multiplier, and most expensive signing by position/set.
- Team spending, remaining purse, squad size, average cost, record signing, and position counts/spend.
- Biggest/smallest spender, largest remaining purse, and most players purchased.
- Set player/sold/unsold counts, spend, average/highest price, and sell-through percentage.

Each player contributes once, including players sold on their second attempt. Set statistics describe the latest player outcomes, while Milestone 8 history continues to preserve both attempts. A correction changes the current signing's team/price and is reflected in every aggregate and roster on the next read. SignalR triggers canonical refetches for connected views and state recovery after reconnection.

Monetary totals remain integer `long` values. Statistical averages, medians, percentages and multipliers use `decimal`; displayed averages are rounded to at most two decimal places. Empty datasets return zero aggregates and empty rankings. Rankings use descending price, then player name/ID for deterministic ties. Position aggregation ignores case and groups missing positions as `Unspecified`.

The PostgreSQL results query uses a repeatable-read transaction so the state, rosters and statistics come from one database snapshot if an auction mutation commits during the request. The transaction is omitted for InMemory unit tests.

## Auction Wrapped

Results show a live snapshot during the auction and become **Auction Wrapped** when the session is completed. The page highlights the most expensive player, biggest spender and best selling set, then provides interactive charts for:

1. Team spending.
2. Remaining purses.
3. Spending by position.
4. Sales by set.
5. Top player prices.

Chart values are also available as text. Team/set statistics tables and a full searchable/filterable player result table appear below the summary. The results/chart bundle loads lazily so the existing console and projector do not load Recharts unnecessarily.

## Public portal and franchise links

`/live/{slug}` is now the dedicated anonymous read-only portal from section 33 of the master plan. It provides Overview, Teams, Players and Results/Auction Wrapped views.

- Overview shows the current player/bid/leader, latest result, progress, purse summaries and recent sales.
- Teams show logos with fallback marks, squad progress, spending, remaining purse, and a link to each roster.
- Players support ALL, AVAILABLE/eligible, SOLD and UNSOLD filters, position filtering, search and sale-price/name sorting. Eligible includes first-attempt players, the active player, and players awaiting their final round; final-unsold players are excluded from that filter. Attempt counts show revealed attempts.
- Results expose the same current statistics and Wrapped presentation.

Public franchise URLs are `/live/{slug}/teams/{teamId}`. **Copy Franchise Link** uses the current frontend origin and contains no authentication token. Opening a link on another device after hosting requires no team account. **Copy Live Link** shares the portal.

Authenticated squad pages are `/tournaments/{id}/teams/{teamId}/squad` and remain available to tournament members even when public sharing is disabled.

Fullscreen projector URLs remain `/tournaments/{id}/projector` and `/tournaments/{id}/stage`. A slug-based alias is `/live/{slug}/projector`. The existing projector browser test uses that explicit projector alias because `/live/{slug}` now serves the portal specified in the plan.

## API and privacy

| Route | Access |
| --- | --- |
| `GET /api/tournaments/{id}/results` | Authenticated tournament member |
| `GET /api/tournaments/{id}/statistics` | Authenticated tournament member |
| `GET /api/public/tournaments/{key}` | Public viewing must be enabled |
| `GET /api/public/tournaments/{key}/results` | Public viewing must be enabled |
| `GET /api/public/tournaments/{key}/teams/{teamId}` | Public viewing enabled; team must belong to tournament |

Public keys may be the tournament slug or ID. The public contracts are independent of private history DTOs. They omit draw positions, future lot sequence, session IDs, actor identities, audit events and correction reasons. Registered players are ordered by name/ID, independently of persisted random draw order. Public views expose no mutation controls.

Disabled public viewing returns HTTP 404, private reads from outsiders return 403, and anonymous private reads return 401. Invalid/cross-tournament franchise links return 404. A failed public refetch hides cached public data while the connection keeps trying to recover.

## Verification

- Backend solution builds with zero warnings/errors; 78 tests pass (original 54, plus Milestones 7–9 regression cases).
- Frontend production build and lint have zero errors. Existing React lint warnings and the existing main-bundle size advisory remain.
- No pending EF model changes; no migration required.
- All three Playwright suites pass against local PostgreSQL, the API and Chrome.

`AuctionResultsTests.cs` verifies derived totals/averages/even and odd medians, correction-driven rankings and finances, position/set breakdowns, top-ten limits, two-attempt deduplication, empty aggregates, public visibility, membership restrictions, and absence of future draw data.

`auction-results.spec.ts` verifies public portal filters, a copied anonymous franchise link, live bids/rosters, a corrected second-attempt sale while public viewers are offline, canonical recovery, charts, completed Wrapped views, refresh persistence, mobile overflow, public DTO/socket sanitization, disabled public views, cross-tournament teams, and authenticated squad pages. It creates its own verification tournaments and leaves the seeded Malabar tournament untouched.

```powershell
dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build
cd frontend
npm.cmd run build
npm.cmd run lint
npm.cmd run test:results
npx.cmd playwright test
```

Build before starting the API, or use a separate Release build while the Debug API is running, to avoid Windows DLL locks. Actual cross-device verification on Render remains a deployment step; see [Render/Supabase setup](RenderSupabase.md).
