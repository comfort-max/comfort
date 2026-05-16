import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;

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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anonKey, serviceKey };
}

function buildAccessRequestEmail({ companyName, requesterName, requesterEmail, currentRole, reviewUrl }) {
  const subject = `${companyName} — access request from ${requesterName || requesterEmail}`;
  const text = `A user signed in to ${companyName} but does not have permission to use the application yet.

Name: ${requesterName || "—"}
Email: ${requesterEmail}
Current role: ${currentRole || "user"}

Open User Management to assign a role and permissions:
${reviewUrl}

If you did not expect this request, you can ignore this email.`;
  const html = [
    '<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">',
    `<p>A user signed in to <strong>${companyName}</strong> but does not have permission to use the application yet.</p>`,
    "<ul>",
    `<li><strong>Name:</strong> ${requesterName || "—"}</li>`,
    `<li><strong>Email:</strong> ${requesterEmail}</li>`,
    `<li><strong>Current role:</strong> ${currentRole || "user"}</li>`,
    "</ul>",
    `<p><a href="${reviewUrl}">Review and assign role in User Management</a></p>`,
    '<p style="color:#666;font-size:12px;">If you did not expect this request, you can ignore this email.</p>',
    "</div>",
  ].join("");
  return { subject, text, html };
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

  const { url, anonKey, serviceKey } = getSupabaseConfig();
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({
      error:
        "Server misconfigured: set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY on Vercel.",
    });
  }

  const userClient = createClient(url, anonKey);
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(token);
  if (userErr || !user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const appUrl = String(req.body?.app_url || process.env.VITE_APP_ORIGIN || "").replace(/\/$/, "");
  if (!appUrl) {
    return res.status(400).json({ error: "app_url is required" });
  }

  const email = String(user.email || "").trim().toLowerCase();
  const fullName =
    String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim() ||
    email.split("@")[0] ||
    "User";

  let profile = null;
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    profile = existingProfile;
  } else {
    const insertPayload = {
      id: user.id,
      email,
      full_name: fullName,
      role: String(user.user_metadata?.role || "user").trim() || "user",
    };
    const { data: created, error: insErr } = await admin
      .from("profiles")
      .insert(insertPayload)
      .select("id, email, full_name, role")
      .single();
    if (insErr) {
      console.error("profile insert", insErr);
    } else {
      profile = created;
    }
  }

  const currentRole =
    profile?.role || String(user.user_metadata?.role || "user").trim() || "user";

  const { data: existingRequest } = await admin
    .from("user_access_requests")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const now = new Date();
  if (existingRequest?.last_notified_at) {
    const last = new Date(existingRequest.last_notified_at).getTime();
    const elapsed = now.getTime() - last;
    if (elapsed < NOTIFY_COOLDOWN_MS) {
      const waitSec = Math.ceil((NOTIFY_COOLDOWN_MS - elapsed) / 1000);
      return res.status(200).json({
        success: true,
        alreadyNotified: true,
        cooldownSeconds: waitSec,
        message: `A request was already sent recently. Please wait ${waitSec} seconds before sending again.`,
      });
    }
  }

  const requestRow = {
    user_id: user.id,
    email,
    full_name: fullName,
    profile_role: currentRole,
    status: "pending",
    last_notified_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  if (existingRequest) {
    await admin.from("user_access_requests").update(requestRow).eq("user_id", user.id);
  } else {
    await admin.from("user_access_requests").insert({
      ...requestRow,
      created_at: now.toISOString(),
    });
  }

  const { data: adminProfiles } = await admin
    .from("profiles")
    .select("email, full_name, role")
    .ilike("role", "admin");

  const adminEmails = [
    ...new Set(
      (adminProfiles || [])
        .map((p) => String(p.email || "").trim().toLowerCase())
        .filter((e) => e && e.includes("@"))
    ),
  ];

  if (adminEmails.length === 0) {
    return res.status(503).json({
      error:
        "No administrator email found. Add at least one user with the Admin role and an email on their profile.",
    });
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(503).json({
      error: "Email is not configured on the server (EMAIL_USER / EMAIL_PASS).",
    });
  }

  const { data: settingsRows } = await admin
    .from("company_settings")
    .select("company_name, email_from_name")
    .limit(1);
  const settings = settingsRows?.[0] || {};
  const companyName = settings.company_name || "COMFORT";
  const fromName = settings.email_from_name || companyName;
  const reviewUrl = `${appUrl}/admin/users?userId=${encodeURIComponent(user.id)}`;

  const { subject, text, html } = buildAccessRequestEmail({
    companyName,
    requesterName: fullName,
    requesterEmail: email,
    currentRole,
    reviewUrl,
  });

  const transporter = createTransporter();
  const fromEmail = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    replyTo: email,
    to: adminEmails.join(", "),
    subject,
    text,
    html,
  });

  return res.status(200).json({
    success: true,
    adminsNotified: adminEmails.length,
    message: `Request sent to ${adminEmails.length} administrator(s). You will be notified after your role is updated.`,
  });
}
