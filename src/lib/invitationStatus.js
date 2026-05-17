/** Normalize invitation.status for filtering and tab counts. */
export function normalizeInvitationStatus(status) {
  const s = String(status || "pending").toLowerCase().trim();
  if (s === "cancelled" || s === "canceled") return "expired";
  return s;
}
