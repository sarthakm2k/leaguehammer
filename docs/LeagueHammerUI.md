# LeagueHammer UI

The application uses a dark charcoal theme, the supplied LeagueHammer logo, lime accents, and shared typography and focus styles. Login and registration share a stadium-led desktop layout and a focused single-column phone layout. Existing authentication, return links, demo credentials, routes, auction controls, sharing, filters, corrections, and configuration behavior are preserved.

Light mode is available from the sun/moon button in each page header. Dark remains the default. The selected mode is stored as `leaguehammer-theme` in browser local storage, applied before React starts to avoid a theme flash, and synchronized between tabs in the same browser. If storage is unavailable, the switch still works for the current page. Projector fullscreen retains the header toggle. The original logo remains transparent in light mode, with a subtle shadow defining its white lettering; the stadium photograph keeps its natural dark treatment while the login form becomes light.

Light surfaces and readable text cover authentication, dashboard, all configuration tabs and dialogs, auction console/history, projector, public and private results/statistics, franchise squads, and recap. Auction operations and backend behavior are unchanged.

Projector and public views remain anonymous where tournament settings allow access. On phones, the broadcast stacks the player spotlight, bid, team tracker, and roster. Results, franchise squads, and history render their existing table content as labelled cards; desktop tables retain their layout. Charts retain their accessible values and adapt to narrow containers. The recap keeps its existing editorial design with LeagueHammer branding.

## Assets

- `frontend/public/brand/leaguehammer.png`: the original user-supplied logo, copied unchanged. Its transparent padding is accommodated by the shared brand component.
- `frontend/public/brand/stadium.webp`: original stadium artwork generated with the built-in image generation tool, visually inspected, and encoded as WebP for a smaller download. No CLI/API fallback was used. It is served locally with the frontend and requires no external image service at runtime.

Final image generation prompt:

> Photorealistic premium website background for an ASSOCIATION FOOTBALL / SOCCER auction app, portrait 1024x1536. Night soccer stadium with luminous floodlights and dark navy atmospheric sky. Professional soccer player seen from behind on right third, wearing a plain dark short-sleeve soccer shirt, soccer shorts and knee-high socks, NO helmet, NO shoulder pads. He holds a ROUND black-and-white SOCCER BALL at his hip. Beautiful green soccer pitch and soccer goals distant. Cinematic sports photography. Upper quarter and left half uncluttered dark negative space for HTML headline. Absolutely association football, not American football or rugby. No text, no logo, no UI, no watermarks.

## Verification

Run `npm.cmd run build`, `npm.cmd run lint`, and `npx.cmd playwright test` in `frontend`. The UI checks cover 320, 390, 768, and 1440 pixel widths, email/password labels, password visibility, demo fill, mobile console bid and sale synchronization with a second browser context, public portal tabs, franchise rosters, history, dashboard, and overview. Screenshots are saved under `.cache/browser-results`.

For light-theme checks in PowerShell, set `$env:LEAGUEHAMMER_TEST_THEME='light'`, then run `npx.cmd playwright test tests/leaguehammer-ui.spec.ts`. Remove that environment variable before the default dark-theme suite with `Remove-Item Env:LEAGUEHAMMER_TEST_THEME`. Light checks also cover every configuration tab and the completed recap, plus theme persistence and synchronization across tabs.

Run `dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build` from the repository root when the API is running. This change does not require database migrations or changes to Render/Supabase configuration.

Verified on 2026-10-05: production build succeeds; lint reports no errors and only existing warnings; all 9 browser tests and all 93 backend tests pass. The existing bundle-size warning remains. No backend files were changed.

Light-mode follow-up verification: both light-theme browser checks and the full 9-test default-theme suite pass. Theme selection persists between pages and synchronizes across tabs; both palettes fit the tested device widths. The final light-mode contrast check confirms recap copy-link text exceeds 4.5:1 and chart bars exceed 3:1 against white surfaces. Backend code and database schema are unchanged.

The preflight summary has explicit light palettes for ready, eligible, and blocked states, including all gradient stops. The theme switch is a subtle 32px icon button on desktop and retains a 44px touch target on phones. A fresh browser defaults to dark; a deliberately saved selection is still remembered.

The public Players view includes upcoming players grouped by the current active set and subsequent sets. The player on the podium is shown separately. Players returning after an unsold outcome are grouped by their source set; during continuous unsold rounds, players already attempted in the current round move into the next-round pool. Cards are alphabetical and do not expose the server's private random draw order. The section uses the existing live synchronization and adapts to 320px screens in both themes. Player registry filters remain available below it.

Upcoming-players follow-up verification: production build and lint pass (existing warnings only); the public-results browser test and continuous-unsold-round browser test both pass. These checks cover live podium changes, pending counts, unsold retry grouping, round advancement, completion, mobile overflow, and transparent logo background in light mode. No backend files were changed.
