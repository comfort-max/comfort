import { getUser, sendViaSMTP, getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  try {
    const user = await getUser(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorEmail, vendorName, poNumber, totalQty, totalAmount, companyName, pdfBase64, pdfFileName } = await req.json();
    if (!vendorEmail || !vendorName || !poNumber) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: settings } = await supabase.from('company_settings').select('email_from_name').limit(1).single();
    const fromName = settings?.email_from_name || companyName || 'COMFORT';

    const subject = `Purchase Order ${poNumber}`;
    const body =
`Dear ${vendorName},

We are pleased to place an order for ${totalQty} items, totalling ₹${totalAmount}.
Please find the Purchase Order details attached.

Thanks for your co-operation.

Best Regards,
${fromName}`;

    await sendViaSMTP(vendorEmail, subject, body, fromName, pdfBase64, pdfFileName || `PO_${poNumber}.pdf`);
    return Response.json({ success: true, message: 'Email sent successfully' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
