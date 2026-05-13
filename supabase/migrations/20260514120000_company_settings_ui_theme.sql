-- Admin-selectable UI appearance (sidebar + global accents). Read by authenticated users with company_settings access.
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS ui_theme_preset text NOT NULL DEFAULT 'default';

COMMENT ON COLUMN public.company_settings.ui_theme_preset IS 'UI theme: default, slate_soft, light_sidebar, ocean, violet, sunset, brand_navy, brand_sky, brand_teal, brand_moss, brand_emerald, brand_sea';

UPDATE public.company_settings
SET ui_theme_preset = 'default'
WHERE ui_theme_preset IS NULL OR trim(ui_theme_preset) = '';
