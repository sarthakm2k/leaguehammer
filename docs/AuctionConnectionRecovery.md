# Auction connection recovery

The auctioneer console shows a Last synchronized timestamp only after joining the tournament hub and successfully refreshing canonical auction state. A connected WebSocket alone does not unlock controls.

When offline, reconnecting, joining, refreshing or unable to refresh, the console displays a recovery warning and disables auction actions, bid inputs and hotkeys. Correction and set-summary submissions are guarded too. Existing results remain visible with a stale-data warning. The last-confirmed timestamp does not advance on failed reads.

Recovery automatically rejoins the tournament and refetches state before unlocking actions. Failed state reads retry. Old requests or join responses from an earlier connection cannot acknowledge the new connection. Bursts of live changes are coalesced, with another fetch if changes arrive during a read.

A successful recovery clears unsubmitted local bid drafts and open correction/set-summary dialogs; current lot, leader, bid, purse and auction status are restored from server state. No actions are queued or replayed, and reconnection does not automatically pause/resume the tournament for other operators. A server-confirmed PAUSED auction retains its usual action restrictions.

No backend/database changes are required. The connection indicator remains shared by the projector and public views; only the auctioneer console adds the timestamp and recovery warning.

Verification: frontend production build and lint passed (existing warnings only). All 17 recovery, screen-layout, team-dashboard and player-reveal browser tests passed. Focused recovery tests also passed with the actual Enter sale shortcut. Tests cover offline disabling, unchanged confirmation time, delayed reconnect reads, canonical bid restoration, failed-read retry and zero replayed writes.
