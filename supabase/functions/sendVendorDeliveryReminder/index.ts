import { getUser, sendViaSMTP, getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  try {
    const user = await getUser(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorName, vendorEmail, vendorPhone, items, totalAmount, companyName, pdfBase64, pdfFileName } = await req.json();
    if (!vendorName || (!vendorEmail && !vendorPhone) || !items?.length) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: settings } = await supabase.from('company_settings').select('email_from_name').limit(1).single();
    const fromName = settings?.email_from_name || companyName || 'COMFORT';

    const itemList = items
      .map((i: any) => `• Bill #${i.bill_number}: ${i.item_name} x${i.quantity} — ₹${i.vendor_amount.toLocaleString('en-IN')}`)
      .join('\n');

    const subject = `Delivery Reminder — Pending Items`;
    const body =
`Dear ${vendorName},

This is a reminder regarding pending items yet to be marked "Ready for Delivery".

Pending Items:
${itemList}

Total: ₹${totalAmount.toLocaleString('en-IN')}

Please complete and deliver these at the earliest.

Best Regards,
${fromName}`;

    const responses: any[] = [];

    if (vendorEmail) {
      try {
        await sendViaSMTP(vendorEmail, subject, body, fromName, pdfBase64, pdfFileName || `Pending_${vendorName}.pdf`);
        responses.push({ channel: 'email', success: true });
      } catch (err: any) {
        responses.push({ channel: 'email', success: false, error: err.message });
      }
    }

    if (vendorPhone) {
      const cleanPhone = vendorPhone.replace(/\D/g, '').replace(/^0+/, '');
      const waMsg =
`Dear ${vendorName}

Pending Items:
${itemList}

Total: ₹${totalAmount.toLocaleString('en-IN')}

Please deliver ASAP.
${fromName}`;
      responses.push({ channel: 'whatsapp', success: true, link: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}` });
    }

    const successCount = responses.filter(r => r.success).length;

    await supabase.from('reminder_logs').insert({
      reminder_type: 'delivery',
      recipient_name: vendorName,
      recipient_email: vendorEmail || '',
      recipient_phone: vendorPhone || '',
      channels: responses.filter(r => r.success).map(r => r.channel),
      related_bills: items.map((i: any) => i.bill_number).join(', '),
      amount: totalAmount,
      sent_date: new Date().toISOString().split('T')[0],
      sent_by: user.full_name || user.email,
      status: successCount === responses.length ? 'success' : successCount > 0 ? 'partial' : 'failed',
      details: responses.filter(r => !r.success).map(r => `${r.channel}: ${r.error}`).join('; ')
    });

    return Response.json({ success: successCount > 0, vendorName, responses });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
