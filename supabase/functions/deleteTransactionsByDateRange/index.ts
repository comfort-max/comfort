import { getUser, getSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req) => {
  try {
    const user = await getUser(req);
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { dateFrom, dateTo } = await req.json();
    if (!dateFrom || !dateTo) {
      return Response.json({ error: 'dateFrom and dateTo required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let total = 0;

    const tables = [
      { table: 'salary_records', field: 'created_date' },
      { table: 'expenses', field: 'date' },
      { table: 'payment_collections', field: 'date' },
      { table: 'vendor_billings', field: 'date' },
      { table: 'reminder_logs', field: 'sent_date' },
      { table: 'bill_items', field: 'created_date' },
      { table: 'bills', field: 'bill_date' },
      { table: 'vendor_orders', field: 'order_date' },
    ];

    for (const { table, field } of tables) {
      const { data, error } = await supabase.from(table).delete()
        .gte(field, dateFrom).lte(field, dateTo).select('id');
      if (!error) total += (data || []).length;
    }

    return Response.json({ success: true, total });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
