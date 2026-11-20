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

## Team captains and icon players

In **Participating Teams → Assign captain & icon**, the owner can select one captain and one icon player while the tournament is in DRAFT. Select from available players in Player Registry, including approved registrations. The two roles must use different players, and a player cannot belong to two teams. Either role may be left empty. Choosing **Not assigned** releases the player back to the auction pool. Assignments lock once the tournament leaves DRAFT; a READY tournament must first be returned to DRAFT.

Assigned players cost nothing and count toward both minimum and maximum squad size. Auction reserve calculations account for those occupied slots. They have status `ASSIGNED`, never create auction lots or sales, never enter random draws or unsold rounds, and do not inflate auction sales, spending, average prices or sell-through percentages. Sets containing only assigned players are skipped. Release a player's role before deleting their team/player record or undoing/rejecting their registration approval.

Team cards, shared franchise pages, projector rosters, results, recap, Wrapped and downloaded squad/player images show the assigned players with Captain or Icon player labels. They display **Preassigned** rather than a sale price. Mock tournament clones preserve these assignments using the cloned player/team IDs.

The authenticated GET/PUT endpoint is `/api/tournaments/:tournamentId/teams/:teamId/assignments`. Reading requires tournament membership; changes require OWNER membership. The database migration `20261120055600_AddTeamCaptainAndIconAssignments` adds nullable assignment fields, a role uniqueness index, a status constraint and a team foreign key. Existing players remain unchanged. Apply this migration before running the updated API (or use the configured startup migration).

Verification includes backend coverage for permissions, distinct roles, reassignment/release, squad limits, reserves, auction exclusion, completion, registration safeguards and cloning. Browser coverage is in `tests/team-assignments.spec.ts`, including mobile assignment, public views, Wrapped exports and projector rosters.

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

## Compact team view and auction planning

The shared team dashboard now separates Live auction, Plan & targets, and Squad into tabs. On phones, purse and squad summaries sit side by side, the current bid stays near the top, and the marquee signing and full player pool are expandable. All existing team information remains accessible.

Plan & targets provides a player shortlist, optional spending ceilings, position coverage, search, set/position filters, and a base-price filter against the team's current maximum bid. Planned totals flag purse overspending and targets exceeding available squad slots. Live updates flag bids above a player's ceiling and preserve shortlisted players' final outcomes; sold targets no longer consume the planned budget.

Plans are stored in browser localStorage separately for each tournament and team. They are private to that browser/device, do not synchronize between viewers, and do not reserve purse or place bids. Actual purchases remain subject to the auction engine's existing reserve and squad validation. No backend or database changes are required.

Verification: production frontend build and lint passed (existing lint warnings only). Five team-dashboard browser tests passed, covering 320/390 px mobile widths, live updates, tab navigation, saved plans, filters, sold targets, team isolation, completed results and the existing projector layout.

## Alternatives, activity and final squad posters

Shortlisted players can be assigned a named alternative group and a priority: First choice, Backup or Budget option. The alternatives summary retains sold targets with their winning team alongside available backups. These fields use the same device-local, per-team storage as existing ceilings; older saved shortlists remain compatible.

The Live auction tab includes a collapsed activity feed. It combines the latest ten recorded signings and latest unsold result with up to twenty live reveal, sale, unsold, set-completion and correction updates received while the page is open. It survives switching team tabs. Reopening or reconnecting restores current results; unsold/set events missed while disconnected are not a complete historical audit.

Completed team pages and Wrapped team-card slides offer Download final squad poster. The PNG includes the entire final signed squad, even when the current Wrapped slide shows only four players. It includes tournament/team names, team logo or initials, total investment, player cards and individual signing prices. Images retain their proportions; unavailable/CORS-blocked photos use avatars. Exports run in the browser without backend rendering or storage writes. Width is normally 1080 px, with height adapting to squad size; unusually large squads scale down to cap height at 8000 px. Empty teams do not show the download button.

Verification for this enhancement: production build and lint passed (existing warnings only); all 15 team-dashboard and Wrapped browser tests passed. Test exports are saved under the git-ignored `testscreenshots/` directory.
