-- ============================================================================
-- SCRIPT SQL PARA SUPABASE - CONEXIÓN DIRECTA Y SINCRONIZACIÓN INMEDIATA
-- Ejecutá este bloque completo en el SQL Editor de tu proyecto Supabase.
-- Es idempotente: se puede correr aunque ya existan otras tablas en tu proyecto.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_cloud_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_cloud_store_updated_at
  ON public.app_cloud_store (updated_at DESC);

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

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.app_cloud_store TO anon, authenticated, service_role;

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
