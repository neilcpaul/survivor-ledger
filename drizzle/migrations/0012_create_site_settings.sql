CREATE TABLE public.site_settings (
  id text PRIMARY KEY DEFAULT 'global',
  welcome_wizard_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site settings public read" ON public.site_settings
  FOR SELECT TO public USING (true);
