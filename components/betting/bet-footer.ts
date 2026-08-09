/**
 * The id of the element the bet menu's error toast portals itself into.
 *
 * Its own module because the two ends sit on opposite sides of the
 * server/client boundary: BetSlipSummary renders the slot (server), the toast
 * finds it (client). A shared constant means a rename can't silently drop the
 * toast back to the bottom edge — which is exactly the failure the portal was
 * introduced to fix, and it would look like nothing at all in a diff.
 */
export const BET_FOOTER_TOAST_SLOT = "bet-footer-toast"
