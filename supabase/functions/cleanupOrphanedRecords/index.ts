import { getUser, getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();

    const { data: bills } = await supabase.from('bills').select('id');
    const validBillIds = (bills || []).map((b: any) => b.id);

    const results: any = { billItems: 0, paymentCollections: 0, vendorBillings: 0 };

    if (validBillIds.length > 0) {
      const inList = `(${validBillIds.map((id: string) => `'${id}'`).join(',')})`;

      const { data: deletedItems } = await supabase.from('bill_items').delete()
        .not('bill_id', 'in', inList).select('id');
      results.billItems = (deletedItems || []).length;

      const { data: deletedPayments } = await supabase.from('payment_collections').delete()
        .not('bill_id', 'in', inList).select('id');
      results.paymentCollections = (deletedPayments || []).length;
    }

    return Response.json({ success: true, deleted: results });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
