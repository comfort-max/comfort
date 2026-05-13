import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// Verify the JWT from the request and return the user
export async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "");
  const supabase = getSupabaseAdmin();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Fetch extra profile (role etc.) from your users/profiles table
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return {
    ...user,
    role: profile?.role || "user",
    full_name: profile?.full_name || user.email,
  };
}

// Build Gmail MIME message
export function buildMimeMessage({
  fromName,
  senderEmail,
  toEmail,
  subject,
  body,
  pdfBase64 = null,
  pdfFileName = null
}: {
  fromName: string;
  senderEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  pdfBase64?: string | null;
  pdfFileName?: string | null;
}) {
  const boundary = `boundary_${Date.now()}`;
  const encodedSubject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  if (!pdfBase64) {
    return [
      `From: "${fromName}" <${senderEmail}>`,
      `To: ${toEmail}`,
      `Subject: ${encodedSubject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      'Content-Transfer-Encoding: 8bit',
      '',
      body
    ].join('\r\n');
  }

  return [
    `From: "${fromName}" <${senderEmail}>`,
    `To: ${toEmail}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFileName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${pdfFileName}"`,
    '',
    pdfBase64,
    '',
    `--${boundary}--`
  ].join('\r\n');
}

export function encodeRaw(mimeMessage: string) {
  const encoder = new TextEncoder();
  return btoa(String.fromCharCode(...encoder.encode(mimeMessage)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Send email via Gmail API using an OAuth access token
export async function sendViaGmailAPI(
  accessToken: string,
  senderEmail: string,
  toEmail: string,
  subject: string,
  body: string,
  fromName: string,
  pdfBase64: string | null = null,
  pdfFileName: string | null = null
) {
  const mimeMessage = buildMimeMessage({ fromName, senderEmail, toEmail, subject, body, pdfBase64, pdfFileName });
  const encoded = encodeRaw(mimeMessage);

  const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });

  if (!response.ok) throw new Error(`Gmail API error: ${response.status} ${await response.text()}`);
  return { success: true, method: 'gmail' };
}

// Send email via SMTP (nodemailer). Supports GMAIL_* or EMAIL_* secrets (Edge + local).
export async function sendViaSMTP(
  toEmail: string,
  subject: string,
  body: string,
  fromName: string,
  pdfBase64: string | null = null,
  pdfFileName: string | null = null,
  options?: { html?: string | null },
) {
  const smtpUser = Deno.env.get("EMAIL_USER") || Deno.env.get("GMAIL_USER");
  const smtpPass = Deno.env.get("EMAIL_PASS") || Deno.env.get("GMAIL_APP_PASSWORD");
  if (!smtpUser || !smtpPass) {
    throw new Error(
      "SMTP not configured: set EMAIL_USER & EMAIL_PASS (or GMAIL_USER & GMAIL_APP_PASSWORD) on this function",
    );
  }

  const host = Deno.env.get("EMAIL_HOST") || "smtp.gmail.com";
  const port = parseInt(Deno.env.get("EMAIL_PORT") || "587", 10);
  const secure = port === 465;
  const fromAddr = Deno.env.get("EMAIL_FROM_ADDRESS") || smtpUser;
  const replyTo = Deno.env.get("EMAIL_REPLY_TO") || fromAddr;

  const nodemailer = (await import("npm:nodemailer@6.9.7")).default;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const mailOptions: Record<string, unknown> = {
    from: `"${fromName}" <${fromAddr}>`,
    replyTo,
    to: toEmail,
    subject,
    text: body,
  };
  if (options?.html) mailOptions.html = options.html;
  if (pdfBase64) {
    mailOptions.attachments = [{
      filename: pdfFileName,
      content: pdfBase64,
      encoding: "base64",
      contentType: "application/pdf",
    }];
  }

  await transporter.sendMail(mailOptions as any);
  return { success: true, method: "smtp" };
}
