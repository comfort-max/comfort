-- Runs ANALYZE on known application tables (query planner statistics).
-- VACUUM is not exposed here (hosted Postgres / Supabase: use Dashboard or maintenance windows).
CREATE OR REPLACE FUNCTION public.optimize_app_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tbl text;
  r jsonb := '{}'::jsonb;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'bills',
    'bill_items',
    'payment_collections',
    'expenses',
    'vendor_orders',
    'vendor_billings',
    'salary_records',
    'customers',
    'employees',
    'vendors',
    'vendor_rates',
    'expense_categories',
    'rate_list_items',
    'company_settings',
    'incentive_slabs',
    'payment_methods',
    'reminder_logs',
    'communication_templates',
    'trash_items',
    'invitations',
    'app_roles',
    'profiles'
  ]
  LOOP
    BEGIN
      EXECUTE format('ANALYZE %I', tbl);
      r := r || jsonb_build_object(tbl, 'ok');
    EXCEPTION
      WHEN undefined_table THEN
        r := r || jsonb_build_object(tbl, 'skipped');
      WHEN OTHERS THEN
        r := r || jsonb_build_object(tbl, 'error:' || SQLERRM);
    END;
  END LOOP;
  RETURN r;
END;
$$;

COMMENT ON FUNCTION public.optimize_app_tables() IS 'ANALYZE known public tables; safe for planner stats.';

REVOKE ALL ON FUNCTION public.optimize_app_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.optimize_app_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.optimize_app_tables() TO service_role;
