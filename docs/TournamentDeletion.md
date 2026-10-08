# Tournament deletion

The tournament owner can use **Overview → Delete tournament** and type the exact tournament name to confirm permanent deletion. Draft, ready and completed tournaments can be deleted. Live tournaments and live or paused auction sessions are rejected by the backend, even if a stale page still shows the button.

Deletion removes the tournament's membership records, settings, base price tiers, teams, player sets, players, registration form and submissions, auction sessions, lots and events. The organiser's account and other tournaments remain. Public registration, projector, results, recap, Wrapped and team links become unavailable after the next request.

PostgreSQL deletion runs in one serializable transaction. The session's current-lot reference is cleared before deletion; EF orders dependent records around restricted foreign keys. Uploaded media objects in Supabase Storage are retained and can be removed separately from the tournament's folder in each bucket. External image URLs are never deleted.

Verification includes owner/member permissions, live and paused protection, all three deletable statuses, preservation of other tournaments and accounts, browser name confirmation/cancellation/error handling, and deletion of a populated completed tournament in a disposable PostgreSQL database.
