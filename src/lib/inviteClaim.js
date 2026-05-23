/**
 * Whether to run claim_invitation_for_user during routine login.
 * Invited users must accept via the invite link or be approved by an admin first.
 */
export function shouldClaimInvitationProfile(authUser, profile) {
  if (!authUser?.id) return false;
  if (authUser.user_metadata?.invite_pending === true) return false;
  if (profile == null) return false;

  const profileRole =
    profile.role != null ? String(profile.role).trim().toLowerCase() : "";
  if (profileRole && profileRole !== "user") return false;

  const metaRole =
    authUser.user_metadata?.role != null
      ? String(authUser.user_metadata.role).trim().toLowerCase()
      : "";
  return Boolean(metaRole && metaRole !== "user");
}
