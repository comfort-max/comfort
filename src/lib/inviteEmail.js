/** Client-side copy of invitation copy (keep in sync with `api/email/inviteTemplates.js`). */
export function buildInviteEmailContent({ companyName = "COMFORT", senderName = "COMFORT", inviteLink }) {
  const subject = `${companyName} — Create your login`;
  const text = `As an employee of ${companyName}, please follow the link to create your own login to the company system. Please set your password or you may sign in with Google or Yahoo.

${inviteLink}

— ${senderName}`;
  return { subject, text };
}
