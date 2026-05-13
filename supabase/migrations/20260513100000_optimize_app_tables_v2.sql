-- v2: ANALYZE both plural and singular physical table names (matches app fallbacks).
-- Returns { "summary": { "ok", "skipped", "errors" }, "details": { "table_name": "ok"|"skipped"|"error:..." } }
CREATE OR REPLACE FUNCTION public.optimize_app_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl text;
  details jsonb := '{}'::jsonb;
  n_ok int := 0;
  n_skip int := 0;
  n_err int := 0;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'bills',
    'bill',
    'bill_items',
    'bill_item',
    'payment_collections',
    'payment_collection',
    'expenses',
    'expense',
    'vendor_orders',
    'vendor_order',
    'vendor_billings',
    'vendor_billing',
    'salary_records',
    'salary_record',
    'customers',
    'customer',
    'employees',
    'employee',
    'vendors',
    'vendor',
    'vendor_rates',
    'vendor_rate',
    'expense_categories',
    'expense_category',
    'rate_list_items',
    'rate_list_item',
    'company_settings',
    'incentive_slabs',
    'incentive_slab',
    'payment_methods',
    'payment_method',
    'reminder_logs',
    'reminder_log',
    'communication_templates',
    'communication_template',
    'trash_items',
    'trash_item',
    'invitations',
    'invitation',
    'app_roles',
    'app_role',
    'profiles'
  ]
  LOOP
    BEGIN
      EXECUTE format('ANALYZE %I', tbl);
      details := details || jsonb_build_object(tbl, 'ok');
      n_ok := n_ok + 1;
    EXCEPTION
      WHEN undefined_table THEN
        details := details || jsonb_build_object(tbl, 'skipped');
        n_skip := n_skip + 1;
      WHEN OTHERS THEN
        details := details || jsonb_build_object(tbl, 'error:' || SQLERRM);
        n_err := n_err + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'summary',
    jsonb_build_object('ok', n_ok, 'skipped', n_skip, 'errors', n_err),
    'details',
    details
  );
END;
$$;

COMMENT ON FUNCTION public.optimize_app_tables() IS 'ANALYZE app tables (plural + singular names); returns summary + per-table status.';

REVOKE ALL ON FUNCTION public.optimize_app_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.optimize_app_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.optimize_app_tables() TO service_role;
