-- ============================================================================
-- TABLA DE SINCRONIZACIÓN EN LA NUBE (app_cloud_store) PARA SUPABASE
-- Ejecutar una sola vez en el SQL Editor de tu proyecto Supabase.
-- Compatible con los despliegues en Vercel (SPA) y con el servidor Express.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_cloud_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.touch_app_cloud_store_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_cloud_store_updated_at ON public.app_cloud_store;
CREATE TRIGGER trg_app_cloud_store_updated_at
  BEFORE UPDATE ON public.app_cloud_store
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_app_cloud_store_updated_at();

ALTER TABLE public.app_cloud_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_cloud_store_rw_policy" ON public.app_cloud_store;
CREATE POLICY "app_cloud_store_rw_policy"
  ON public.app_cloud_store
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_cloud_store'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_cloud_store;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
