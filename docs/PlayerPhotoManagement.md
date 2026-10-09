# Organizer player photo management

Tournament owners can use Add photo / Manage photo on each Player Registry card to upload, replace or remove a player profile photo. This is available in all tournament statuses; editing other player fields remains subject to the existing draft restrictions. Create a manual player first, then upload its photo. Approved registrations use these same player profiles.

POST `/api/tournaments/:tournamentId/players/:playerId/photo` accepts multipart field `photo`; DELETE on the same route removes the selected profile's photo. Both require authenticated OWNER membership and verify the player belongs to that tournament before accessing storage. Photos must be JPEG, PNG or WebP up to 3 MB; the backend validates file signatures and uses generated versioned paths. Storage credentials never reach the browser.

Uploads use the existing Supabase PlayerBucket (default `player-photos`) and existing Url/ServiceRoleKey configuration. No buckets or database migrations are needed. Only PhotoUrl and UpdatedAtUtc change; purse, status, ratings, price and auction results remain intact. Failed uploads preserve the previous photo.

Removal unlinks the image from the selected player profile and restores its avatar. Stored objects are retained because cloned tournaments can share URLs; this feature does not erase the original registration upload or delete shared storage objects.

Changes emit the existing TeamUpdated signal to both public and authenticated tournament groups, refreshing connected auction screens. Wrapped/results pages loaded without a socket receive the updated image on their next fetch.

Verification: isolated backend build passed with zero warnings/errors; all 162 backend tests passed using --no-build. Frontend production build and lint passed (existing lint warnings only). Three browser tests passed covering upload/replace/remove in a completed tournament, canceled removal, mobile width, invalid file validation, storage failures and owner-only controls. Backend tests cover non-owner/cross-tournament access, storage validation, failure preservation and clone-safe removal.

## Photos during registration review

Player Registrations -> Review submission now includes Upload registration photo, Replace registration photo and Remove registration photo controls. Existing registration reviewers (owners and auctioneers) can manage photos on pending submissions while review is unlocked. Other review fields remain unchanged when photos are saved.

POST/DELETE `/api/tournaments/:tournamentId/registrations/:submissionId/photo` use the same private registration bucket and validate the tournament relationship, permissions, pending status, draft status and finalization lock. Replacement uses a fresh private storage path and leaves the old reference intact if uploading or obtaining its signed review URL fails. Approval publishes the current private photo through the existing approval flow; removing it prevents publication and gives the player an avatar. Existing uploaded blobs are retained.

Late preview responses are ignored after a photo change or switching submissions. Approved player photos remain manageable in Player Registry. No database migrations or new storage buckets are required.

Verification for review controls: zero-warning backend build; all 166 backend tests passed with --no-build. Frontend build and lint passed (existing warnings only), and five registration/photo browser checks passed.
