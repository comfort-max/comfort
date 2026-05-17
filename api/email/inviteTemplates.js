/**
 * Shared invitation copy (used by API and optionally client preview).
 * @param {object} opts
 * @param {string} opts.companyName
 * @param {string} opts.senderName  Display / signature line (e.g. COMFORT)
 * @param {string} opts.inviteLink
 * @param {string} [opts.installUrl]  App install instructions page (e.g. https://app.example/install)
 */
export function buildInstallInstructionsText(installUrl) {
  const url = installUrl || "";
  if (!url) return "";
  return `

INSTALL THE APP (computer & phone)
--------------------------------
After you create your account, install COMFORT for quick access:

Computer (Chrome or Microsoft Edge):
1. Open ${url}
2. Sign in, then click Install or use the install icon in the address bar

Android phone:
1. Open ${url} in Chrome
2. Sign in, tap menu → Install app or Add to Home screen

iPhone (Safari required):
1. Open ${url} in Safari
2. Sign in, tap Share → Add to Home Screen
`;
}

export function buildInstallInstructionsHtml(installUrl) {
  const url = installUrl || "";
  if (!url) return "";
  return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
<h3 style="font-size:15px;margin:0 0 12px;color:#111;">Install on your computer &amp; phone</h3>
<p style="margin:0 0 12px;">After you create your account, install the app for quick access:</p>
<p style="margin:0 0 8px;"><strong>Computer (Chrome / Edge):</strong> Open <a href="${escapeAttr(url)}">${escapeHtml(url)}</a>, sign in, then use <strong>Install</strong> or the install icon in the address bar.</p>
<p style="margin:0 0 8px;"><strong>Android:</strong> Open the link in Chrome → menu (⋮) → <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
<p style="margin:0;"><strong>iPhone:</strong> Open the link in <strong>Safari</strong> → <strong>Share</strong> → <strong>Add to Home Screen</strong>.</p>`;
}

export function buildInviteEmailContent({
  companyName = "COMFORT",
  senderName = "COMFORT",
  inviteLink,
  installUrl,
}) {
  const installText = buildInstallInstructionsText(installUrl);
  const subject = `${companyName} — Create your login`;
  const text = `As an employee of ${companyName}, please follow the link to create your own login to the company system. Please set your password or you may use login with your Google or Facebook account.

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
