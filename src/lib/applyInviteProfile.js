import { supabase } from "@/api/supabaseClient";

/** Apply pending invitation role + mark accepted (server RPC; works when client RLS blocks direct writes). */
export async function claimInvitationProfile({ acceptInvite = false } = {}) {
  const { data, error } = await supabase.rpc("claim_invitation_for_user", {
    p_accept_invite: acceptInvite,
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message || "")) {
      return { ok: false, skipped: true };
    }
    throw error;
  }
  const result = data || { ok: false };
  if (result?.ok && !result?.skipped) {
    await supabase.auth.updateUser({
      data: { role: result.role, full_name: result.full_name, invite_pending: false },
    });
  }
  return result;
}
