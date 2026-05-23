/**
 * Whether to run claim_invitation_for_user for this session.
 * Avoids re-claiming on every OAuth login when the user already has a real profile role.
 */
export function shouldClaimInvitationProfile(authUser, profile) {
  if (!authUser?.id) return false;
  if (authUser.user_metadata?.invite_pending === true) return true;
  if (profile == null) return true;

  const profileRole =
    profile.role != null ? String(profile.role).trim().toLowerCase() : "";
  if (profileRole && profileRole !== "user") return false;

  const metaRole =
    authUser.user_metadata?.role != null
      ? String(authUser.user_metadata.role).trim().toLowerCase()
      : "";
  return Boolean(metaRole && metaRole !== "user");
}
