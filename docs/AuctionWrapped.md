# Auction Wrapped stories

Auction Wrapped is a separate slide-based page. The existing single-page recap remains available.

- Public: `/live/:slug/wrapped`
- Tournament members: `/tournaments/:id/wrapped`
- Individual chapter: append `?slide=<chapter-id>` (for example `?slide=team-<team-id>-1`).

The story opens only after auction completion, including for tournaments completed before this feature was added. Public links use the existing public live view setting and the existing public results endpoint. No migration, new storage bucket, or additional hosting configuration is required.

## Chapters

The opening names the tournament and shows player, franchise and signing counts. Subsequent chapters cover total investment, sale rate, sold/unsold counts, average price, record signings (including ties), the ten highest-priced signings, the highest price multiplier, comeback signings, team spending and playing-position totals.

Every team has a final squad chapter with its logo, signed count, invested amount, remaining purse, player positions and final prices. Squads are paginated with three players per slide, so every signed player is included. Empty squads have an explicit empty state. Final unsold players have their own paginated chapters. A closing slide looks ahead to the tournament.

There are no bar charts. Typography, portraits, team colours and decorative CSS rings provide the visual presentation. Missing or broken photos use initials and icons.

## Navigation and sharing

- Swipe horizontally, select previous/next, or use left/right keyboard arrows.
- Use the chapter selector to jump directly to a team.
- Share Auction Wrapped uses the browser's native share dialog when available, with clipboard fallback.
- Copy this slide copies a public link containing the stable chapter ID.
- If clipboard access fails, a selectable link appears.
- Sharing controls are hidden when public live view is disabled.
- Progress is exposed to assistive technology; reduced-motion preference disables slide animation.

Open/Copy Wrapped links appear with recap links on completed tournament Overview and Results pages. The recap hero also links to the story.

## Verification

`tests/auction-wrapped.spec.ts` uses public-results fixtures. It checks completion gating, disabled public access, empty auctions, all thirteen signed players across five team chapters, direct chapter refresh, sharing, swipe/keyboard navigation, light theme and each chapter's fit at 390×844, 320×568 and a desktop phone frame.

The frontend is verified using a production build and Playwright. These checks do not create or change production auction data.
