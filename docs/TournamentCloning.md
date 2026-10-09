# Clone a tournament for mock auctions

Owners can open **Tournament Overview → Run a mock auction → Clone tournament**. The suggested name is `<tournament name> — Mock Auction`; it can be edited before creating the clone. Draft, ready, live and completed sources are supported.

The clone gets a new tournament ID, unique slug, owner membership and separate sharing links. It always starts in **DRAFT**, so the owner can adjust the setup and must pass preflight before launching the mock auction.

Copied: season, description, date, location, timezone, tournament logo, auction settings (including public viewing and sell-all rules), base price tiers, teams with their original starting purses/colors/logos, player sets with their ordering, and registered auction players with their profiles, photos, base prices and card attributes. Player IDs, team IDs and set IDs are regenerated and remapped. All copied players start **AVAILABLE**.

Not copied: auction sessions, random draws, lots, bids, sales, events, results, existing tournament members beyond the cloning owner, and registration submissions/contact details. Public registration starts disabled with no schedule or finalized state; registration instructions are retained if a form existed. Applicants who have not been approved into the player registry do not become auction players in the clone.

Photos and logos retain their existing URLs instead of duplicating storage objects. Database records are independent: editing a clone, conducting a mock auction, or deleting the clone leaves the original tournament intact. Since uploaded media are shared by URL, manually removing original Supabase media objects would also remove those images from the clone.

The backend endpoint is `POST /api/tournaments/{id}/clone`, authenticated with the owner's JWT, with a JSON body such as `{ "name": "PJL Season 4 — Mock Auction" }`. It returns `201 Created` and the new tournament response. PostgreSQL uses a repeatable-read transaction to copy a consistent snapshot, including when the original auction is live. Cloning does not change the database schema.
