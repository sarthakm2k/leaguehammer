# The auction recap

A dedicated, single-page story of a completed auction, separate from the existing results and charts.

- Member view: `/tournaments/{id}/recap` using the usual tournament account and permissions.
- Public share link: `/live/{slug}/recap`, with no login when Public Live View is enabled.
- **Open Auction Recap** and **Copy Recap Link** appear after completion in the tournament overview, auctioneer console, and results/public portal.

The mobile-first page combines a bold final-whistle cover, the most expensive signing, total/average/median spending, the highest base-price multiplier, and a comeback signing where applicable. Team cards are ordered by spending and include remaining purses, average signing costs, record signings, and expandable rosters. Every player has a result card with sale price, team, base price, price multiplier, and repeated-attempt information. Search and team/unsold filters keep larger auctions easy to browse. There are no charts or horizontally scrolling tables.

Joint player records are labelled explicitly. Joint top-spending teams are recognized together. Zero-sale auctions show an honest empty headline and no fabricated record signing or top spender. Missing, broken, and loading player photos use a jersey/initials fallback. Reduced-motion preferences disable the decorative cover animation. Mobile controls have comfortable touch targets and 16px search/filter inputs to avoid automatic focus zoom.

The native Share action uses the device's share sheet when available, with clipboard fallback and a selectable URL if clipboard access fails. Shared links always target the recap page. Public sharing respects the existing visibility setting; private completed recaps remain available to authorized members with sharing controls omitted. Before completion the page displays a waiting state. Unavailable/private public routes display an error state without cached recap content.

The page reuses the canonical results API and excludes private audit or draw data. It is loaded in its own lightweight route chunk and does not load chart components. No database migration or new deployment variables are needed. URLs use the frontend's current origin, including the deployed Render host.

## Verification

`npm run test:recap` creates and completes an isolated tournament, verifies the headline, team spending, all four player outcomes, an unsold player, and a two-attempt comeback. It checks anonymous access, completed-only entry points, copy/native sharing, search/filtering, expandable squads, and layouts at 320, 390, 768, and 1440 pixels. Additional completed-data fixtures exercise tied records, zero sales, and private sharing controls. Public private/nonexistent routes are also checked. Browser screenshots are produced in `.cache/browser-results`.

The existing results/public-franchise browser suite also passes, preserving the original chart-based results page. Production compilation and frontend lint pass with existing warnings.
