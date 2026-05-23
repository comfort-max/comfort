import { getInvitationEditorContext } from "../lib/adminContext.js";
import { approvePendingInvitation } from "../lib/invitationStore.js";

function normalizeInvitationStatus(status) {
  const s = String(status || "pending").toLowerCase().trim();
  if (s === "cancelled" || s === "canceled") return "expired";
  return s;
}

async function loadInvitation(admin, invitationId) {
  for (const table of ["invitations", "invitation"]) {
    const { data, error } = await admin.from(table).select("*").eq("id", invitationId).maybeSingle();
    if (!error && data) return data;
    if (error && !/does not exist|schema cache/i.test(error.message || "")) {
      throw new Error(error.message || "Could not load invitation");
    }
  }
  return null;
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
    ctx = await getInvitationEditorContext(token);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server configuration error" });
  }
  if (!ctx) {
    return res.status(403).json({ error: "Not allowed to manage invitations" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const invitationId = body.invitation_id;
  if (!invitationId || typeof invitationId !== "string") {
    return res.status(400).json({ error: "invitation_id is required" });
  }

  try {
    const invitation = await loadInvitation(ctx.admin, invitationId);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }

    const status = normalizeInvitationStatus(invitation.status);
    if (status !== "pending") {
      return res.status(400).json({ error: "Only pending invitations can be approved" });
    }

    const profile = await approvePendingInvitation(ctx.admin, invitation);

    return res.status(200).json({
      success: true,
      profile,
      email: invitation.email,
      role: profile.role,
    });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Approve failed" });
  }
}
