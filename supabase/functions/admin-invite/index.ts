import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sendViaSMTP } from "../_shared/supabaseAdmin.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function buildInstallInstructionsText(installUrl: string) {
  if (!installUrl) return "";
  return `

INSTALL THE APP (computer & phone)
--------------------------------
After you create your account, install COMFORT for quick access:

Computer (Chrome or Microsoft Edge):
1. Open ${installUrl}
2. Sign in, then click Install or use the install icon in the address bar

Android phone:
1. Open ${installUrl} in Chrome
2. Sign in, tap menu → Install app or Add to Home screen

iPhone (Safari required):
1. Open ${installUrl} in Safari
2. Sign in, tap Share → Add to Home Screen
`;
}

function buildInstallInstructionsHtml(installUrl: string) {
  if (!installUrl) return "";
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
<h3 style="font-size:15px;margin:0 0 12px;color:#111;">Install on your computer &amp; phone</h3>
<p style="margin:0 0 12px;">After you create your account, install the app for quick access:</p>
<p style="margin:0 0 8px;"><strong>Computer (Chrome / Edge):</strong> Open <a href="${escapeAttr(installUrl)}">${escapeHtml(installUrl)}</a>, sign in, then use <strong>Install</strong> or the install icon in the address bar.</p>
<p style="margin:0 0 8px;"><strong>Android:</strong> Open the link in Chrome → menu (⋮) → <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
<p style="margin:0;"><strong>iPhone:</strong> Open the link in <strong>Safari</strong> → <strong>Share</strong> → <strong>Add to Home Screen</strong>.</p>`;
}

function buildInviteEmailContent(opts: {
  companyName?: string;
  senderName?: string;
  inviteLink: string;
  installUrl?: string;
}) {
  const companyName = opts.companyName || "COMFORT";
  const senderName = opts.senderName || "COMFORT";
  const inviteLink = opts.inviteLink;
  const installUrl = opts.installUrl || "";
  const installText = buildInstallInstructionsText(installUrl);
  const subject = `${companyName} — Create your login`;
  const text =
    `As an employee of ${companyName}, please follow the link to create your own login to the company system. Please set your password or you may use login with your Google or Facebook account.

${inviteLink}
${installText}
— ${senderName}`;
  const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
<p>As an employee of <strong>${escapeHtml(companyName)}</strong>, please follow the link below to create your own login to the company system.</p>
<p>Please set your password, or you may use <strong>Login with Google</strong> or <strong>Facebook</strong>.</p>
<p><a href="${escapeAttr(inviteLink)}">Create your account</a></p>
<p style="word-break: break-all; font-size: 12px; color: #666;">${escapeHtml(inviteLink)}</p>
${buildInstallInstructionsHtml(installUrl)}
<p>— ${escapeHtml(senderName)}</p>
</div>`;
  return { subject, text, html };
}

async function getAdminContext(accessToken: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    throw new Error("Function env missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
  }
  const userClient = createClient(url, anonKey);
  const { data: { user }, error: userErr } = await userClient.auth.getUser(accessToken);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return Response.json({ error: "Missing Authorization bearer token" }, { status: 401, headers: cors });
  }

  let ctx;
  try {
    ctx = await getAdminContext(token);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500, headers: cors });
  }
  if (!ctx) {
    return Response.json({ error: "Admin only" }, { status: 403, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: cors });
  }

  const invitationId = body.invitation_id as string | undefined;
  const email = body.email as string | undefined;
  const roleName = body.role_name as string | undefined;
  const invitedBy = (body.invited_by as string) || "";
  const employeeId = (body.employee_id as string | null) ?? null;
  const invitedName = (body.invited_name as string | null) ?? null;
  const companyName = (body.company_name as string) || "COMFORT";
  const senderName = (body.sender_name as string) || "COMFORT";
  const appUrl = String(body.app_url || "").replace(/\/$/, "");

  const redirectTo = appUrl ? `${appUrl}/auth/accept-invite` : undefined;

  try {
    let targetEmail = email?.trim().toLowerCase();
    let role = roleName?.trim();
    let empId = employeeId;
    let name = invitedName?.trim() || null;

    if (invitationId) {
      const { data: inv, error: invErr } = await ctx.admin.from("invitations").select("*").eq("id", invitationId).single();
      if (invErr || !inv) {
        return Response.json({ error: "Invitation not found" }, { status: 404, headers: cors });
      }
      if (inv.status !== "pending") {
        return Response.json({ error: "Only pending invitations can be resent" }, { status: 400, headers: cors });
      }
      targetEmail = inv.email;
      role = inv.role || "user";
      empId = inv.employee_id || null;
      name = inv.invited_name || null;
    }

    if (!targetEmail || !role) {
      return Response.json(
        { error: "email and role_name are required (or invitation_id for resend)" },
        { status: 400, headers: cors },
      );
    }

    const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (invitationId) {
      await ctx.admin
        .from("invitations")
        .update({ expires_at, status: "pending", role, invited_name: name, employee_id: empId })
        .eq("id", invitationId);
    } else {
      await ctx.admin.from("invitations").delete().eq("email", targetEmail).eq("status", "pending");
      await ctx.admin.from("invitations").insert({
        email: targetEmail,
        role,
        status: "pending",
        invited_by: invitedBy,
        expires_at,
        employee_id: empId,
        invited_name: name,
      });
    }

    const { data: linkData, error: genError } = await ctx.admin.auth.admin.generateLink({
      type: "invite",
      email: targetEmail,
      options: {
        redirectTo,
        data: { role, full_name: name || "" },
      },
    });

    if (genError) {
      return Response.json({ error: genError.message }, { status: 400, headers: cors });
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return Response.json({ error: "No invite link from Supabase" }, { status: 500, headers: cors });
    }

    const installUrl = appUrl ? `${appUrl}/install` : "";
    const { subject, text, html } = buildInviteEmailContent({
      companyName,
      senderName,
      inviteLink: actionLink,
      installUrl,
    });
    const fromLabel = senderName || Deno.env.get("EMAIL_FROM_NAME") || companyName;
    await sendViaSMTP(targetEmail, subject, text, fromLabel, null, null, { html });

    const invitedUserId = linkData?.user?.id;
    if (invitedUserId) {
      await ctx.admin.from("profiles").upsert(
        {
          id: invitedUserId,
          email: targetEmail,
          full_name: name || targetEmail.split("@")[0],
          role,
        },
        { onConflict: "id" },
      );
    }

    return Response.json({ success: true, email: targetEmail }, { headers: cors });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg || "Invite failed" }, { status: 500, headers: cors });
  }
});
