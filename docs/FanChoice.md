# Fan Choice

After an auction is COMPLETED, the owner can open its Overview and use the Fan Choice panel to enable and manually open or close five audience categories. Public Live View must be enabled. There are no schedules, deadlines, reset controls or editable votes. Closing, disabling and reopening a category preserves every vote.

| Category | Eligible choices |
| --- | --- |
| Best Auction Buy | SOLD players with an actual auction sale; preassigned players are excluded. |
| Strongest Squad | Nonempty teams, including their complete sold and preassigned squad. |
| Fan Favourite Player | All Player Registry players, including captains, icons and unsold players. Pending registration submissions are excluded. |
| Best Captain Pick | Assigned team captains. |
| Best Icon Pick | All assigned icon players, including multiple icons from one team. |

Options, names, public photos and squad compositions are captured when a category first opens. Reopening retains these same options and vote IDs. A category without eligible choices cannot open. Fan Choice does not alter the auction, team purses, player assignments or official statistics.

## Spectator experience

The public route is `/live/:slug/fan-voting`. Copy the link from the Overview panel; enabled polls also have a Fan Choice link in the results portal. The page has its own cobalt/coral sports-ballot identity, with independent paper/night appearances saved separately from the application's theme. A horizontal category rail, numbered portrait ballots, searchable choices and expandable squads support 320px phones through desktop screens. Results become compact ranked race rows with live percentages and explicit joint-leader labels. A receipt-style confirmation explains that the selected vote is permanent. Photos use fallbacks and choices are paginated.

Each browser gets one vote per category in each tournament. The browser remembers a random 256-bit identity in localStorage; the server stores only its tournament-scoped SHA-256 hash. A database unique index enforces `(PollId, VoterHash)`. The browser uses Web Locks where available to coordinate identity creation across concurrent tabs. Storage must be writable before a vote can be submitted. This is a casual browser-based poll: another browser/profile, private session or cleared storage can create another identity. It is not verified one-person voting.

Before that browser votes in a category, its API response contains no vote counts, percentages or selection totals. After voting, it sees all counts, percentages, its locked choice and leading/joint-leading options. These remain accessible after voting closes. A lost POST response can be recovered by loading the same browser identity; an identical retry returns the existing vote without incrementing totals. Attempts to change an existing vote are rejected.

SignalR's `JoinFanChoice` joins a separate public group for a completed, public tournament. Notifications contain only an invalidation, never voter identities or result totals. Clients refetch through the results-gated endpoint, coalesce event bursts and resynchronize after reconnecting. A manual refresh control is also available. A failed notification does not roll back or repeat an already committed vote. All screens label the feature **Fan Choice · Audience votes**, separate from official awards.

## API and persistence

- Owner-only `GET /api/tournaments/:id/fan-choice` returns category controls, eligible-choice counts and participation counts.
- Owner-only `PUT /api/tournaments/:id/fan-choice/:category` accepts `{ "enabled": true, "isOpen": true }`.
- Public `GET /api/public/tournaments/:slug/fan-choice` returns enabled categories and their choices.
- Public `POST /api/public/tournaments/:slug/fan-choice/:pollId/votes` accepts `{ "optionId": "..." }`.
- The anonymous `X-Fan-Voter` header carries the browser identity; it is never placed in URLs. No login or Supabase Auth is required for spectators.

Votes, category changes and their eligibility checks serialize under a PostgreSQL tournament-row lock. Options are constrained to their own poll by a composite foreign key; permanent votes have a database uniqueness constraint. Voting POSTs have a shared application rate limit of 600/minute without treating every person on shared Wi-Fi as the same voter. This throttles writes; it does not establish human identity.

Migration `20261124095556_AddFanChoiceVoting` creates `FanChoicePolls`, `FanChoiceOptions` and `FanChoiceVotes`. Existing API startup migrations apply it on Render unless migrations have been explicitly disabled. Existing public photo URLs are reused, so no Supabase Storage buckets, external services or new environment variables are required. Tournament deletion removes its polls/options/votes. Mock tournament cloning starts without polls or votes.

Backend tests cover eligibility, permanent/idempotent voting, results gating, percentage totals, manual close/reopen, access boundaries, no-choice categories, notification failures, hub access, deletion and cloning. Browser tests cover two-browser live updates, all five categories, mobile/light mode, confirmation cancellation, reloads, lost responses, closed votes, disabled access, storage failures and organizer controls.
