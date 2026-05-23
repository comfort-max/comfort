import { normalizeInvitationStatus } from "./invitationStatus";

/** Users with a still-pending invitation should not appear in User Management yet. */
export function filterActiveUsers(users, invitations) {
  const pendingEmails = new Set(
    (invitations || [])
      .filter((inv) => normalizeInvitationStatus(inv.status) === "pending")
      .map((inv) => String(inv.email || "").trim().toLowerCase())
      .filter(Boolean)
  );
  return (users || []).filter(
    (u) => !pendingEmails.has(String(u.email || "").trim().toLowerCase())
  );
}
