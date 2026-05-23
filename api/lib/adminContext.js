import { createClient } from "@supabase/supabase-js";

export function createSupabaseClients(accessToken) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    const missing = [
      !url && "SUPABASE_URL (or VITE_SUPABASE_URL)",
      !anonKey && "SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Admin API misconfigured: missing ${missing}. ` +
        "On Vercel, add SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY, then redeploy."
    );
  }
  const userClient = createClient(url, anonKey);
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { url, anonKey, userClient, admin };
}

export async function getAdminContext(accessToken) {
  const { userClient, admin } = createSupabaseClients(accessToken);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(accessToken);
  if (userErr || !user) return null;

  const { data: profile, error: pErr } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (pErr || !profile || String(profile.role).toLowerCase() !== "admin") {
    return null;
  }
  return { admin, user };
}

/** Admin or a role with User Management → Edit permission. */
export async function getUserManagementEditorContext(accessToken) {
  const { userClient, admin } = createSupabaseClients(accessToken);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(accessToken);
  if (userErr || !user) return null;

  const { data: profile, error: pErr } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (pErr || !profile) return null;

  const roleName = String(profile.role || "").trim().toLowerCase();
  if (roleName === "admin") {
    return { admin, user };
  }

  const { data: appRole, error: rErr } = await admin
    .from("app_roles")
    .select("permissions")
    .ilike("name", profile.role)
    .maybeSingle();

  if (rErr || !appRole) return null;

  const perms = appRole.permissions || {};
  const canEdit =
    perms?.admin_users?.edit === true || perms?.admin_users?.edit === "true";
  if (!canEdit) return null;

  return { admin, user };
}
