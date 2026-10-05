# LeagueHammer UI

The application uses a dark charcoal theme, the supplied LeagueHammer logo, lime accents, and shared typography and focus styles. Login and registration share a stadium-led desktop layout and a focused single-column phone layout. Existing authentication, return links, demo credentials, routes, auction controls, sharing, filters, corrections, and configuration behavior are preserved.

Projector and public views remain anonymous where tournament settings allow access. On phones, the broadcast stacks the player spotlight, bid, team tracker, and roster. Results, franchise squads, and history render their existing table content as labelled cards; desktop tables retain their layout. Charts retain their accessible values and adapt to narrow containers. The recap keeps its existing editorial design with LeagueHammer branding.

## Assets

- `frontend/public/brand/leaguehammer.png`: the original user-supplied logo, copied unchanged. Its transparent padding is accommodated by the shared brand component.
- `frontend/public/brand/stadium.webp`: original stadium artwork generated with the built-in image generation tool, visually inspected, and encoded as WebP for a smaller download. No CLI/API fallback was used. It is served locally with the frontend and requires no external image service at runtime.

Final image generation prompt:

> Photorealistic premium website background for an ASSOCIATION FOOTBALL / SOCCER auction app, portrait 1024x1536. Night soccer stadium with luminous floodlights and dark navy atmospheric sky. Professional soccer player seen from behind on right third, wearing a plain dark short-sleeve soccer shirt, soccer shorts and knee-high socks, NO helmet, NO shoulder pads. He holds a ROUND black-and-white SOCCER BALL at his hip. Beautiful green soccer pitch and soccer goals distant. Cinematic sports photography. Upper quarter and left half uncluttered dark negative space for HTML headline. Absolutely association football, not American football or rugby. No text, no logo, no UI, no watermarks.

## Verification

Run `npm.cmd run build`, `npm.cmd run lint`, and `npx.cmd playwright test` in `frontend`. The UI checks cover 320, 390, 768, and 1440 pixel widths, email/password labels, password visibility, demo fill, mobile console bid and sale synchronization with a second browser context, public portal tabs, franchise rosters, history, dashboard, and overview. Screenshots are saved under `.cache/browser-results`.

Run `dotnet test backend/TournamentAuction.Tests/TournamentAuction.Tests.csproj --no-build` from the repository root when the API is running. This change does not require database migrations or changes to Render/Supabase configuration.

Verified on 2026-10-05: production build succeeds; lint reports no errors and only existing warnings; all 9 browser tests and all 93 backend tests pass. The existing bundle-size warning remains. No backend files were changed.
