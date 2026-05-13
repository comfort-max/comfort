import { getSupabaseAdmin, getUser, sendViaSMTP } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  try {
    const user = await getUser(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      customerName, customerEmail, customerPhone, bills, totalDue, companyName,
      sendEmail, sendWhatsApp, pdfBase64, pdfFileName
    } = await req.json();

    if (!customerName || !bills?.length) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: settings } = await supabase
      .from('company_settings')
      .select('email_from_name')
      .limit(1)
      .single();

    const fromName = settings?.email_from_name || companyName || 'COMFORT';
    const billList = bills
      .map((b: any) => `• Bill #${b.bill_number}: ₹${b.amount_due.toLocaleString('en-IN')}`)
      .join('\n');

    const subject = `Payment Reminder — Outstanding Bills`;
    const body =
`Dear ${customerName},

This is a friendly reminder regarding your outstanding payments.

Outstanding Bills:
${billList}

Total Amount Outstanding: ₹${totalDue.toLocaleString('en-IN')}

Please settle these dues at your earliest convenience.

Best Regards,
${fromName}`;

    const responses: any[] = [];

    if (sendEmail && customerEmail) {
      try {
        await sendViaSMTP(
          customerEmail, subject, body, fromName,
          pdfBase64, pdfFileName || `Outstanding_${customerName}.pdf`
        );
        responses.push({ channel: 'email', success: true });
      } catch (err: any) {
        responses.push({ channel: 'email', success: false, error: err.message });
      }
    } else if (sendEmail) {
      responses.push({ channel: 'email', success: false, error: 'No email address' });
    }

    if (sendWhatsApp && customerPhone) {
      const cleanPhone = customerPhone.replace(/\D/g, '').replace(/^0+/, '');
      const waMessage =
`Dear ${customerName}

Outstanding Bills:
${billList}

Total: ₹${totalDue.toLocaleString('en-IN')}

Thanks!
${fromName}`;
      responses.push({
        channel: 'whatsapp',
        success: true,
        link: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`
      });
    }

    const successCount = responses.filter(r => r.success).length;
    const status = successCount === responses.length ? 'success' : successCount > 0 ? 'partial' : 'failed';

    await supabase.from('reminder_logs').insert({
      reminder_type: 'payment',
      recipient_name: customerName,
      recipient_email: customerEmail || '',
      recipient_phone: customerPhone || '',
      channels: responses.map(r => r.channel),
      related_bills: bills.map((b: any) => b.bill_number).join(', '),
      amount: totalDue,
      sent_date: new Date().toISOString().split('T')[0],
      sent_by: user.full_name || user.email,
      status,
      details: responses.filter(r => !r.success).map(r => `${r.channel}: ${r.error}`).join('; ')
    });

    return Response.json({ success: successCount > 0, customerName, responses, status });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
