import { createClient } from "@supabase/supabase-js";

async function getAdminContext(accessToken) {
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
      `Delete-user API misconfigured: missing ${missing}. ` +
        "On Vercel, add SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY under Project Settings → Environment Variables, then redeploy."
    );
  }
  const userClient = createClient(url, anonKey);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(accessToken);
  if (userErr || !user) return null;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: pErr } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (pErr || !profile || String(profile.role).toLowerCase() !== "admin") {
    return null;
  }
  return { admin, user };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization bearer token" });
  }

  let ctx;
  try {
    ctx = await getAdminContext(token);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server configuration error" });
  }
  if (!ctx) {
    return res.status(403).json({ error: "Admin only" });
  }

  const userId = req.body?.user_id;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "user_id is required" });
  }

  if (userId === ctx.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  try {
    const { data: target, error: tErr } = await ctx.admin
      .from("profiles")
      .select("id, email, role, full_name")
      .eq("id", userId)
      .single();
    if (tErr || !target) {
      return res.status(404).json({ error: "User not found" });
    }

    const targetRole = String(target.role || "").toLowerCase();
    if (targetRole === "admin") {
      const { data: profiles, error: listErr } = await ctx.admin.from("profiles").select("id, role");
      if (listErr) throw listErr;
      const adminCount = (profiles || []).filter((p) => String(p.role || "").toLowerCase() === "admin").length;
      if (adminCount <= 1) {
        return res.status(400).json({ error: "Cannot delete the only administrator" });
      }
      return res.status(400).json({ error: "Administrator accounts cannot be deleted from User Management" });
    }

    await ctx.admin.from("user_access_requests").delete().eq("user_id", userId);

    const email = String(target.email || "").trim().toLowerCase();
    if (email) {
      await ctx.admin.from("invitations").delete().eq("email", email);
    }

    const { error: delAuthErr } = await ctx.admin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      return res.status(400).json({ error: delAuthErr.message || "Could not delete auth user" });
    }

    await ctx.admin.from("profiles").delete().eq("id", userId);

    return res.status(200).json({
      success: true,
      deleted: {
        id: target.id,
        email: target.email,
        full_name: target.full_name,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Delete failed" });
  }
}
