# Team dashboards and laptop broadcast

Existing shared URLs `/live/:slug/teams/:teamId` now open a franchise dashboard. Public live view must be enabled, as before. The dashboard uses the existing results API and SignalR synchronization; it does not expose registration contact details or allow guests to bid.

- Team name, colours and uploaded crest.
- Starting purse, remaining purse, spent amount and remaining percentage.
- Signed players, minimum squad shortfall and slots left to maximum capacity.
- Current auction lot, bid and leading team, or latest outcome.
- Highest-value team signing and average signing cost.
- Team roster with photos, positions, set and prices.
- Pending players grouped by current/next sets, and players returning for an unsold round.
- Searchable remaining pool; completed auctions show final totals and a recap link instead.

The maximum bid displayed comes from the auction engine. It does not promise that every remaining player can be purchased: the engine still validates each purchase against all purse and squad feasibility rules.

## Logo uploads

Owners upload logos from the Participating Teams cards. This works for existing teams in any tournament status and preserves all other team fields. Editing team configuration retains the uploaded logo.

`POST /api/tournaments/:tournamentId/teams/:teamId/logo` accepts multipart field `logo`. The API enforces owner membership and the team/tournament relationship before accessing storage. Storage validates JPEG/PNG/WebP signatures and the 3 MB size limit, uses backend-only Supabase credentials and stores versioned files in the existing public player bucket. Failed uploads leave the previous logo intact. `TeamUpdated` triggers state synchronization on connected viewers.

## Laptop projector

For viewports at least 900 px wide and 500 px high, the broadcast occupies the browser viewport, keeping stage progress and the signing ticker in view. All teams appear together in a grid, with one to four columns selected by team count. Team lists do not scroll. Larger counts use compact purse/squad cards and a legend. For more than two teams, the selected squad opens in a separate panel so the grid retains its space. Compact spacing supports short laptop windows; exceptional long player text can scroll within the spotlight rather than pushing the ticker below the screen. Phones retain the stacked page layout. Player photos retain their proportions with `object-fit: contain`.

## Verification

- Release .NET build: zero warnings/errors; 114 tests passed.
- Frontend production build passed; lint has existing React warnings and no errors.
- `tests/team-dashboard.spec.ts` covers team metrics, roster, upcoming sets, unsold pool, SignalR refresh, final outcomes, light theme and 320/390 px mobile layouts.
- Projector checks cover 1366×650, 1280×600, 1024×600 and 1920×1080 with ten teams, plus 4/24/32-team grids at 1024×600. Checks verify that all team cards are inside the grid, the team grid does not scroll, and photos and SOLD banners fit.
- Storage tests use an HTTP handler; no production Supabase writes were performed during automated verification.
