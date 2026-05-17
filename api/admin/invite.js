import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { buildInviteEmailContent } from "../email/inviteTemplates.js";
import { upsertPendingInvitation, syncInvitedAuthMetadata } from "../lib/invitationStore.js";

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    secure: (process.env.EMAIL_PORT || "587") === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

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
      `Invite API misconfigured: missing ${missing}. ` +
        "On Vercel, add SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY under Project Settings → Environment Variables " +
        "(serverless /api routes do not read VITE_* build-time vars unless you duplicate them with these names). " +
        "Redeploy after saving."
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

async function sendInviteSmtp({ to, companyName, senderName, inviteLink, installUrl }) {
  const transporter = createTransporter();
  const { subject, text, html } = buildInviteEmailContent({
    companyName,
    senderName,
    inviteLink,
    installUrl: installUrl || "",
  });
  const fromLabel = senderName || process.env.EMAIL_FROM_NAME || companyName;
  const fromEmail = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER;
  if (!fromEmail || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("SMTP not configured (EMAIL_USER / EMAIL_PASS).");
  }
  await transporter.sendMail({
    from: `"${fromLabel}" <${fromEmail}>`,
    replyTo: process.env.EMAIL_REPLY_TO || fromEmail,
    to,
    subject,
    text,
    html,
  });
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
    console.error(e);
    return res.status(500).json({ error: e.message || "Server configuration error" });
  }
  if (!ctx) {
    return res.status(403).json({ error: "Admin only" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const {
    invitation_id: invitationId,
    email,
    role_name: roleName,
    invited_by: invitedBy,
    employee_id: employeeId,
    invited_name: invitedName,
    company_name: companyName = "COMFORT",
    sender_name: senderName = "COMFORT",
    app_url: appUrl,
  } = body;

  const origin = String(appUrl || process.env.VITE_APP_ORIGIN || "").replace(/\/$/, "");
  const redirectTo = origin ? `${origin}/auth/accept-invite` : undefined;

  try {
    let targetEmail = email?.trim().toLowerCase();
    let role = roleName?.trim();
    let empId = employeeId || null;
    let name = invitedName?.trim() || null;

    if (invitationId) {
      const { data: inv, error: invErr } = await ctx.admin.from("invitations").select("*").eq("id", invitationId).single();
      if (invErr || !inv) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      if (inv.status !== "pending") {
        return res.status(400).json({ error: "Only pending invitations can be resent" });
      }
      targetEmail = inv.email;
      role = inv.role || "user";
      empId = inv.employee_id || null;
      name = inv.invited_name || null;
    }

    if (!targetEmail || !role) {
      return res.status(400).json({ error: "email and role_name are required (or invitation_id for resend)" });
    }

    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await upsertPendingInvitation(
      ctx.admin,
      {
        email: targetEmail,
        role,
        invitedBy: invitedBy || "",
        expiresAt: expires_at,
        employeeId: empId,
        invitedName: name,
      },
      { invitationId }
    );

    const { data: linkData, error: genError } = await ctx.admin.auth.admin.generateLink({
      type: "invite",
      email: targetEmail,
      options: {
        redirectTo,
        data: { role, full_name: name || "" },
      },
    });

    if (genError) {
      return res.status(400).json({ error: genError.message });
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return res.status(500).json({ error: "No invite link from Supabase" });
    }

    await sendInviteSmtp({
      to: targetEmail,
      companyName,
      senderName,
      inviteLink: actionLink,
      installUrl: origin ? `${origin}/install` : "",
    });

    const invitedUserId = linkData?.user?.id;
    await syncInvitedAuthMetadata(ctx.admin, invitedUserId, {
      role,
      fullName: name || "",
      email: targetEmail,
    });

    return res.status(200).json({ success: true, email: targetEmail, role });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Invite failed" });
  }
}
