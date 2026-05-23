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

  const isSelfDelete = userId === ctx.user.id;

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
    const { data: profiles, error: listErr } = await ctx.admin.from("profiles").select("id, role");
    if (listErr) throw listErr;
    const adminCount = (profiles || []).filter((p) => String(p.role || "").toLowerCase() === "admin").length;

    if (isSelfDelete) {
      if (targetRole !== "admin") {
        return res.status(400).json({ error: "Only administrator accounts can use delete & exit from User Management" });
      }
      if (adminCount <= 1) {
        return res.status(400).json({
          error: "Cannot delete your account while you are the only administrator. Promote another user to Admin first.",
        });
      }
    } else if (targetRole === "admin") {
      if (adminCount <= 1) {
        return res.status(400).json({ error: "Cannot delete the only administrator" });
      }
      return res.status(400).json({ error: "Administrator accounts cannot be deleted from User Management" });
    }

    const { error: accessErr } = await ctx.admin.from("user_access_requests").delete().eq("user_id", userId);
    if (accessErr && !/does not exist|schema cache/i.test(accessErr.message || "")) {
      return res.status(400).json({ error: accessErr.message || "Could not clear access requests" });
    }

    const email = String(target.email || "").trim().toLowerCase();
    if (email) {
      await ctx.admin.from("invitations").delete().eq("email", email);
    }

    // Profile must be removed before auth.users delete when FK lacks ON DELETE CASCADE.
    const { error: profileErr } = await ctx.admin.from("profiles").delete().eq("id", userId);
    if (profileErr) {
      return res.status(400).json({ error: profileErr.message || "Could not delete user profile" });
    }

    const { error: delAuthErr } = await ctx.admin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      return res.status(400).json({
        error:
          delAuthErr.message ||
          "Could not delete login account. If this persists, run supabase/migrations/20260523120000_user_delete_cascade.sql in the Supabase SQL editor.",
      });
    }

    return res.status(200).json({
      success: true,
      selfDeleted: isSelfDelete,
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
