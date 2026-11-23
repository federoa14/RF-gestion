-- ============================================================================
-- SCRIPT SQL COMPLETO PARA SUPABASE (EJECUTAR EN SQL EDITOR)
-- Incluye:
--   1. Tabla puente public.app_cloud_store + triggers + RLS + Realtime
--   2. Índices optimizados para PostgREST (text_pattern_ops, parciales JSONB y GIN)
--   3. Actualización segura de columnas e índices en tablas relacionales si existen
-- Es 100% idempotente: se puede volver a ejecutar sin errores.
-- ============================================================================

-- ============================================================================
-- 1. TABLA PRINCIPAL DE SINCRONIZACIÓN: public.app_cloud_store
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_cloud_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de alto rendimiento para app_cloud_store (evitan Seq Scan y timeouts en PostgREST)
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_key_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_app_cloud_store_updated_at
  ON public.app_cloud_store USING btree (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_cloud_store_key_updated_at
  ON public.app_cloud_store USING btree (key text_pattern_ops, updated_at DESC);

-- Índice parcial para registros individuales granulares ('rec:<empresa>:<colección>:<id>')
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_rec_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops, updated_at DESC)
  WHERE key LIKE 'rec:%';

-- Índice parcial para particiones por distribuidora ('saas_distribuidora_data_v2_<tenantId>')
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_tenant_agg_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops)
  WHERE key LIKE 'saas_distribuidora_data_v2_%';

-- Índice parcial para pagos SaaS verificados por empresa/mes
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_verified_payments_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops, updated_at DESC)
  WHERE key LIKE 'rec:platform:verified_payments:%';

-- Índice parcial JSONB para detectar links de cobro aprobados pendientes de conciliar (<2 ms)
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_pending_payment_orders
  ON public.app_cloud_store USING btree ((value->>'tenantId'), (value->>'status'), updated_at DESC)
  WHERE key LIKE 'client_payment_order_%'
    AND (value->>'reconciledInApp' IS NULL OR value->>'reconciledInApp' = 'false');

-- Índice parcial para catálogos online públicos ('public_catalog_<tenantId>') y búsqueda rápida por código/slug
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_public_catalogs
  ON public.app_cloud_store USING btree (key text_pattern_ops, (value->>'tenantCode'), (value->>'slug'))
  WHERE key LIKE 'public_catalog_%';

-- Índices B-Tree directos sobre slug, tenantCode y punteros O(1) para abrir catálogos públicos (<1 ms)
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_public_catalog_slug_eq
  ON public.app_cloud_store USING btree ((value->>'slug'))
  WHERE key LIKE 'public_catalog_%';

CREATE INDEX IF NOT EXISTS idx_app_cloud_store_public_catalog_code_eq
  ON public.app_cloud_store USING btree ((value->>'tenantCode'))
  WHERE key LIKE 'public_catalog_%';

CREATE INDEX IF NOT EXISTS idx_app_cloud_store_catalog_refs
  ON public.app_cloud_store USING btree (key text_pattern_ops)
  WHERE key LIKE 'public_catalog_ref_%';

-- Índice funcional insensible a mayúsculas para abrir catálogos por slug o tenantCode (?catalog=...)
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_public_catalog_lookup
  ON public.app_cloud_store USING btree (lower(value->>'slug'), lower(value->>'tenantCode'))
  WHERE key LIKE 'public_catalog_%';

-- Índice parcial para pedidos públicos desde el catálogo online ('catalog_order_<id>')
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_catalog_orders
  ON public.app_cloud_store USING btree ((value->>'tenantId'), (value->>'status'), updated_at DESC)
  WHERE key LIKE 'catalog_order_%';

-- Índice parcial para pedidos de catálogo por empresa ('rec:<tenantId>:catalogOrders:<id>')
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_tenant_catalog_orders
  ON public.app_cloud_store USING btree (key text_pattern_ops, updated_at DESC)
  WHERE key LIKE 'rec:%:catalogOrders:%';

-- Índice JSONB por tenantId + updated_at DESC para listar los pedidos más recientes de una tienda sin Sort en memoria
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_catalog_orders_by_tenant_recent
  ON public.app_cloud_store USING btree ((value->>'tenantId'), updated_at DESC)
  WHERE key LIKE 'rec:%:catalogOrders:%';

-- Índice JSONB para filtrar por modalidad de despacho (retiro/envío) y comprobante generado
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_catalog_orders_dispatch
  ON public.app_cloud_store USING btree ((value->>'tenantId'), (value->>'deliveryMethod'), (value->>'dispatchReceiptNumber'), updated_at DESC)
  WHERE key LIKE 'rec:%:catalogOrders:%';

-- Índice JSONB para pedidos por DNI del cliente (Programa de Puntos por DNI)
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_catalog_orders_loyalty_dni
  ON public.app_cloud_store USING btree ((value->>'tenantId'), (value->>'customerDni'), updated_at DESC)
  WHERE key LIKE 'catalog_order_%' OR key LIKE 'rec:%:catalogOrders:%';

-- Índices parciales para Programa de Puntos por DNI ('catalog_loyalty_<tenantId>_<dni>' y 'rec:<tenantId>:catalogLoyaltyAccounts:<id>')
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_loyalty_public
  ON public.app_cloud_store USING btree (key text_pattern_ops, (value->>'tenantId'), (value->>'dni'), updated_at DESC)
  WHERE key LIKE 'catalog_loyalty_%';

CREATE INDEX IF NOT EXISTS idx_app_cloud_store_loyalty_tenant
  ON public.app_cloud_store USING btree (key text_pattern_ops, (value->>'tenantId'), updated_at DESC)
  WHERE key LIKE 'rec:%:catalogLoyaltyAccounts:%';

-- Índice parcial para Club de Promociones ('catalog_promo_sub_<id>') y Avisos de Stock ('catalog_stock_alert_<id>')
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_catalog_promo_subs
  ON public.app_cloud_store USING btree ((value->>'tenantId'), updated_at DESC)
  WHERE key LIKE 'catalog_promo_sub_%';

CREATE INDEX IF NOT EXISTS idx_app_cloud_store_catalog_stock_alerts
  ON public.app_cloud_store USING btree ((value->>'tenantId'), (value->>'productId'), updated_at DESC)
  WHERE key LIKE 'catalog_stock_alert_%';

-- Índice GIN para consultas sobre atributos internos del JSONB
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_value_gin
  ON public.app_cloud_store USING gin (value jsonb_path_ops);

-- Extensión pg_trgm opcional para acelerar búsquedas ILIKE/patrones complejos sin Seq Scan
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_app_cloud_store_key_trgm
    ON public.app_cloud_store USING gin (key gin_trgm_ops);
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

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

-- ============================================================================
-- 2. COLUMNAS NECESARIAS PARA MERCADO PAGO / WEBHOOKS EN TABLAS RELACIONALES
--    (Solo aplica si esas tablas existen en tu esquema)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.client_payment_orders') IS NOT NULL THEN
    ALTER TABLE public.client_payment_orders
      ADD COLUMN IF NOT EXISTS mp_init_point TEXT,
      ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
      ADD COLUMN IF NOT EXISTS mp_payment_id TEXT,
      ADD COLUMN IF NOT EXISTS payment_method TEXT,
      ADD COLUMN IF NOT EXISTS paid_at TEXT,
      ADD COLUMN IF NOT EXISTS reconciled_in_app BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verification_summary TEXT;
  END IF;

  IF to_regclass('public.platform_billing_config') IS NOT NULL THEN
    ALTER TABLE public.platform_billing_config
      ADD COLUMN IF NOT EXISTS annual_discount_percent NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS mp_checkout_link TEXT,
      ADD COLUMN IF NOT EXISTS mp_public_key TEXT,
      ADD COLUMN IF NOT EXISTS has_mp_access_token BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- ============================================================================
-- 3. ÍNDICES EN TABLAS RELACIONALES (SEGÚN EXISTENCIA DE TABLAS Y COLUMNAS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public._create_index_if_cols_exist(
  p_index_name TEXT,
  p_table_name TEXT,
  p_cols TEXT[],
  p_index_expr TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_missing INT;
BEGIN
  IF to_regclass(format('public.%I', p_table_name)) IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_missing
  FROM unnest(p_cols) AS req(col)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table_name
      AND c.column_name = req.col
  );

  IF v_missing = 0 THEN
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I %s',
      p_index_name,
      p_table_name,
      p_index_expr
    );
  END IF;
END;
$$;

SELECT
  public._create_index_if_cols_exist('idx_tenants_tenant_code', 'tenants', ARRAY['tenant_code'], '(tenant_code)'),
  public._create_index_if_cols_exist('idx_tenants_status_created_at', 'tenants', ARRAY['status', 'created_at'], '(status, created_at DESC)'),
  public._create_index_if_cols_exist('idx_platform_users_tenant_active', 'platform_users', ARRAY['tenant_id', 'active'], '(tenant_id, active)'),
  public._create_index_if_cols_exist('idx_platform_users_username_lower', 'platform_users', ARRAY['username'], '(lower(username))'),
  public._create_index_if_cols_exist('idx_platform_users_email_lower', 'platform_users', ARRAY['email'], '(lower(email))'),
  public._create_index_if_cols_exist('idx_platform_billing_config_updated_at', 'platform_billing_config', ARRAY['updated_at'], '(updated_at DESC)'),
  public._create_index_if_cols_exist('idx_platform_support_config_updated_at', 'platform_support_config', ARRAY['updated_at'], '(updated_at DESC)'),
  public._create_index_if_cols_exist('idx_platform_announcements_active_created', 'platform_announcements', ARRAY['active', 'audience', 'created_at'], '(active, audience, created_at DESC)'),
  public._create_index_if_cols_exist('idx_client_payment_orders_tenant_pending', 'client_payment_orders', ARRAY['tenant_id', 'status', 'reconciled_in_app'], '(tenant_id, status, reconciled_in_app)'),
  public._create_index_if_cols_exist('idx_client_payment_orders_client_id', 'client_payment_orders', ARRAY['client_id'], '(client_id)'),
  public._create_index_if_cols_exist('idx_client_payment_orders_created_at', 'client_payment_orders', ARRAY['created_at'], '(created_at DESC)'),
  public._create_index_if_cols_exist('idx_clients_tenant_salesperson', 'clients', ARRAY['tenant_id', 'assigned_salesperson_id'], '(tenant_id, assigned_salesperson_id)'),
  public._create_index_if_cols_exist('idx_clients_tenant_number', 'clients', ARRAY['tenant_id', 'client_number'], '(tenant_id, client_number)'),
  public._create_index_if_cols_exist('idx_client_credit_histories_client_id', 'client_credit_histories', ARRAY['client_id'], '(client_id)'),
  public._create_index_if_cols_exist('idx_client_credit_histories_tenant_risk', 'client_credit_histories', ARRAY['tenant_id', 'risk_level'], '(tenant_id, risk_level)'),
  public._create_index_if_cols_exist('idx_salespeople_tenant_active', 'salespeople', ARRAY['tenant_id', 'active'], '(tenant_id, active)'),
  public._create_index_if_cols_exist('idx_administrators_tenant_alerts', 'administrators', ARRAY['tenant_id', 'receive_admin_alerts'], '(tenant_id, receive_admin_alerts)'),
  public._create_index_if_cols_exist('idx_boletas_tenant_status_due', 'boletas', ARRAY['tenant_id', 'status', 'due_date'], '(tenant_id, status, due_date)'),
  public._create_index_if_cols_exist('idx_boletas_tenant_client', 'boletas', ARRAY['tenant_id', 'client_id'], '(tenant_id, client_id)'),
  public._create_index_if_cols_exist('idx_boletas_tenant_salesperson', 'boletas', ARRAY['tenant_id', 'salesperson_id'], '(tenant_id, salesperson_id)'),
  public._create_index_if_cols_exist('idx_boletas_paid_at', 'boletas', ARRAY['tenant_id', 'paid_at'], '(tenant_id, paid_at DESC)'),
  public._create_index_if_cols_exist('idx_broadcast_messages_tenant_created', 'broadcast_messages', ARRAY['tenant_id', 'created_at'], '(tenant_id, created_at DESC)'),
  public._create_index_if_cols_exist('idx_auto_dispatch_logs_tenant_created', 'auto_dispatch_logs', ARRAY['tenant_id', 'created_at'], '(tenant_id, created_at DESC)'),
  public._create_index_if_cols_exist('idx_dispatch_logs_created_at', 'dispatch_logs', ARRAY['created_at'], '(created_at DESC)'),
  public._create_index_if_cols_exist('idx_salesperson_rendiciones_tenant_date', 'salesperson_rendiciones', ARRAY['tenant_id', 'salesperson_id', 'date'], '(tenant_id, salesperson_id, date DESC)');

DROP FUNCTION IF EXISTS public._create_index_if_cols_exist(TEXT, TEXT, TEXT[], TEXT);

-- Actualizar estadísticas del optimizador para tablas existentes
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'app_cloud_store', 'tenants', 'platform_users',
    'platform_billing_config', 'platform_support_config', 'platform_announcements',
    'client_payment_orders', 'clients', 'client_credit_histories',
    'salespeople', 'administrators', 'boletas',
    'broadcast_messages', 'auto_dispatch_logs', 'dispatch_logs', 'salesperson_rendiciones'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ANALYZE public.%I', t);
    END IF;
  END LOOP;
END $$;
