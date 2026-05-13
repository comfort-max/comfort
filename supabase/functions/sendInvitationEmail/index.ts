import { getUser, sendViaSMTP } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { recipientEmail, recipientName, role, companyName, inviteLink } = await req.json();
    if (!recipientEmail || !recipientName || !inviteLink) {
      return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    const fromName = companyName || 'COMFORT';
    const subject = `You're invited to ${fromName} — Join as ${role}`;
    const body =
`Dear ${recipientName},

You have been invited to join ${fromName} as ${role}.

Accept invitation: ${inviteLink}

Best Regards,
${fromName} Team`;

    await sendViaSMTP(recipientEmail, subject, body, fromName);
    return Response.json({ success: true, message: 'Invitation sent' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
