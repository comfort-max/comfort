-- Ensure optional company_settings columns exist (idempotent).
-- Fixes: "Could not find the 'display_currency_code' column ... in the schema cache"
-- when earlier migrations were not applied on this project.

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS display_currency_code text DEFAULT 'INR';

UPDATE public.company_settings
SET display_currency_code = 'INR'
WHERE display_currency_code IS NULL OR trim(display_currency_code) = '';

ALTER TABLE public.company_settings
  ALTER COLUMN display_currency_code SET DEFAULT 'INR';

ALTER TABLE public.company_settings
  ALTER COLUMN display_currency_code SET NOT NULL;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS financial_year_start_month smallint DEFAULT 4;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS financial_year_start_day smallint DEFAULT 1;

UPDATE public.company_settings
SET financial_year_start_month = 4
WHERE financial_year_start_month IS NULL;

UPDATE public.company_settings
SET financial_year_start_day = 1
WHERE financial_year_start_day IS NULL;

ALTER TABLE public.company_settings
  ALTER COLUMN financial_year_start_month SET DEFAULT 4,
  ALTER COLUMN financial_year_start_day SET DEFAULT 1;

ALTER TABLE public.company_settings
  ALTER COLUMN financial_year_start_month SET NOT NULL,
  ALTER COLUMN financial_year_start_day SET NOT NULL;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS ui_theme_preset text NOT NULL DEFAULT 'default';

UPDATE public.company_settings
SET ui_theme_preset = 'default'
WHERE ui_theme_preset IS NULL OR trim(ui_theme_preset) = '';

COMMENT ON COLUMN public.company_settings.ui_theme_preset IS 'UI theme: default, slate_soft, light_sidebar, ocean, violet, sunset, brand_navy, brand_sky, brand_teal, brand_moss, brand_emerald, brand_sea';
