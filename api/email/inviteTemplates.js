/**
 * Shared invitation copy (used by API and optionally client preview).
 * @param {object} opts
 * @param {string} opts.companyName
 * @param {string} opts.senderName  Display / signature line (e.g. COMFORT)
 * @param {string} opts.inviteLink
 */
export function buildInviteEmailContent({ companyName = "COMFORT", senderName = "COMFORT", inviteLink }) {
  const subject = `${companyName} — Create your login`;
  const text = `As an employee of ${companyName}, please follow the link to create your own login to the company system. Please set your password or you may use login with your Google or Facebook account.

${inviteLink}

— ${senderName}`;
  const html = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
<p>As an employee of <strong>${escapeHtml(companyName)}</strong>, please follow the link below to create your own login to the company system.</p>
<p>Please set your password, or you may use <strong>Login with Google</strong> or <strong>Facebook</strong>.</p>
<p><a href="${escapeAttr(inviteLink)}">Create your account</a></p>
<p style="word-break: break-all; font-size: 12px; color: #666;">${escapeHtml(inviteLink)}</p>
<p>— ${escapeHtml(senderName)}</p>
</div>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
