/** Client-side copy of invitation copy (keep in sync with `api/email/inviteTemplates.js`). */

function buildInstallInstructionsText(installUrl) {
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

export function buildInviteEmailContent({
  companyName = "COMFORT",
  senderName = "COMFORT",
  inviteLink,
  installUrl,
}) {
  const installText = buildInstallInstructionsText(installUrl);
  const subject = `${companyName} — Create your login`;
  const text = `As an employee of ${companyName}, please follow the link to create your own login to the company system. Please set your password or you may sign in with Google or Yahoo.

${inviteLink}
${installText}
— ${senderName}`;
  return { subject, text };
}
