import { getUserManagementEditorContext } from "../lib/adminContext.js";
import { clearPendingInvitationsForEmail, syncUserAuthRole } from "../lib/invitationStore.js";

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
    ctx = await getUserManagementEditorContext(token);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server configuration error" });
  }
  if (!ctx) {
    return res.status(403).json({ error: "Not allowed to edit users" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const userId = body.user_id;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "user_id is required" });
  }

  const updates = {
    full_name: body.full_name?.trim() || null,
    role: body.role?.trim() || "user",
  };
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    updates.phone = body.phone?.trim() || null;
  }

  try {
    let { data, error } = await ctx.admin.from("profiles").update(updates).eq("id", userId).select().single();
    if (error && /phone/i.test(String(error.message || ""))) {
      const { phone: _p, ...rest } = updates;
      ({ data, error } = await ctx.admin.from("profiles").update(rest).eq("id", userId).select().single());
    }
    if (error || !data) {
      return res.status(400).json({ error: error?.message || "Could not update user profile" });
    }

    await syncUserAuthRole(ctx.admin, userId, {
      role: data.role || updates.role,
      fullName: data.full_name || updates.full_name || "",
    });

    const email = String(data.email || body.email || "").trim();
    await clearPendingInvitationsForEmail(ctx.admin, email);

    return res.status(200).json({ success: true, profile: data });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Update failed" });
  }
}
