-- ============================================================================
-- ÍNDICES DE OPTIMIZACIÓN PARA SUPABASE & POSTGREST (EJECUTAR EN SQL EDITOR)
-- Script idempotente para acelerar lecturas, filtros por prefijo y sincronización.
-- ============================================================================

-- ============================================================================
-- 1. TABLA PRINCIPAL DE SINCRONIZACIÓN: public.app_cloud_store
-- ============================================================================

-- Crucial en PostgreSQL (UTF-8): permite usar índice en consultas LIKE 'prefijo%'
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_key_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops);

-- Ordenamiento rápido por última actualización
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_updated_at
  ON public.app_cloud_store USING btree (updated_at DESC);

-- Índice compuesto para sincronizaciones por prefijo ordenadas por fecha
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_key_updated_at
  ON public.app_cloud_store USING btree (key text_pattern_ops, updated_at DESC);

-- Índice parcial exclusivo para filas individuales granulares ('rec:<empresa>:<coleccion>:<id>')
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_rec_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops, updated_at DESC)
  WHERE key LIKE 'rec:%';

-- Índice parcial para documentos particionados por distribuidora
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_tenant_agg_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops)
  WHERE key LIKE 'saas_distribuidora_data_v2_%';

-- Índice parcial para pagos verificados de suscripciones SaaS
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_verified_payments_pattern
  ON public.app_cloud_store USING btree (key text_pattern_ops, updated_at DESC)
  WHERE key LIKE 'rec:platform:verified_payments:%';

-- Índice parcial JSONB para detectar links de cobro aprobados pendientes de conciliar (<2ms)
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_pending_payment_orders
  ON public.app_cloud_store USING btree ((value->>'tenantId'), (value->>'status'), updated_at DESC)
  WHERE key LIKE 'client_payment_order_%'
    AND (value->>'reconciledInApp' IS NULL OR value->>'reconciledInApp' = 'false');

-- Índice GIN sobre JSONB para consultas sobre propiedades internas de value
CREATE INDEX IF NOT EXISTS idx_app_cloud_store_value_gin
  ON public.app_cloud_store USING gin (value jsonb_path_ops);

ANALYZE public.app_cloud_store;

-- ============================================================================
-- 2. ÍNDICES EN TABLAS RELACIONALES / ESPEJO (SI EXISTEN EN TU BASE DE DATOS)
--    Verifica existencia de tabla y columnas antes de crear cada índice
--    para garantizar ejecución limpia sin errores 42P01 o 42703.
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
  -- Tenants y Usuarios SaaS
  public._create_index_if_cols_exist('idx_tenants_tenant_code', 'tenants', ARRAY['tenant_code'], '(tenant_code)'),
  public._create_index_if_cols_exist('idx_tenants_status_created_at', 'tenants', ARRAY['status', 'created_at'], '(status, created_at DESC)'),
  public._create_index_if_cols_exist('idx_platform_users_tenant_active', 'platform_users', ARRAY['tenant_id', 'active'], '(tenant_id, active)'),
  public._create_index_if_cols_exist('idx_platform_users_username_lower', 'platform_users', ARRAY['username'], '(lower(username))'),
  public._create_index_if_cols_exist('idx_platform_users_email_lower', 'platform_users', ARRAY['email'], '(lower(email))'),

  -- Configuración y Comunicados de Plataforma
  public._create_index_if_cols_exist('idx_platform_billing_config_updated_at', 'platform_billing_config', ARRAY['updated_at'], '(updated_at DESC)'),
  public._create_index_if_cols_exist('idx_platform_support_config_updated_at', 'platform_support_config', ARRAY['updated_at'], '(updated_at DESC)'),
  public._create_index_if_cols_exist('idx_platform_announcements_active_created', 'platform_announcements', ARRAY['active', 'audience', 'created_at'], '(active, audience, created_at DESC)'),

  -- Órdenes de Pago de Clientes
  public._create_index_if_cols_exist('idx_client_payment_orders_tenant_pending', 'client_payment_orders', ARRAY['tenant_id', 'status', 'reconciled_in_app'], '(tenant_id, status, reconciled_in_app)'),
  public._create_index_if_cols_exist('idx_client_payment_orders_client_id', 'client_payment_orders', ARRAY['client_id'], '(client_id)'),
  public._create_index_if_cols_exist('idx_client_payment_orders_created_at', 'client_payment_orders', ARRAY['created_at'], '(created_at DESC)'),

  -- Clientes e Historial Crediticio
  public._create_index_if_cols_exist('idx_clients_tenant_salesperson', 'clients', ARRAY['tenant_id', 'assigned_salesperson_id'], '(tenant_id, assigned_salesperson_id)'),
  public._create_index_if_cols_exist('idx_clients_tenant_number', 'clients', ARRAY['tenant_id', 'client_number'], '(tenant_id, client_number)'),
  public._create_index_if_cols_exist('idx_client_credit_histories_client_id', 'client_credit_histories', ARRAY['client_id'], '(client_id)'),
  public._create_index_if_cols_exist('idx_client_credit_histories_tenant_risk', 'client_credit_histories', ARRAY['tenant_id', 'risk_level'], '(tenant_id, risk_level)'),

  -- Vendedores y Administradores
  public._create_index_if_cols_exist('idx_salespeople_tenant_active', 'salespeople', ARRAY['tenant_id', 'active'], '(tenant_id, active)'),
  public._create_index_if_cols_exist('idx_administrators_tenant_alerts', 'administrators', ARRAY['tenant_id', 'receive_admin_alerts'], '(tenant_id, receive_admin_alerts)'),

  -- Boletas (Pendientes e Historial de Cobros)
  public._create_index_if_cols_exist('idx_boletas_tenant_status_due', 'boletas', ARRAY['tenant_id', 'status', 'due_date'], '(tenant_id, status, due_date)'),
  public._create_index_if_cols_exist('idx_boletas_tenant_client', 'boletas', ARRAY['tenant_id', 'client_id'], '(tenant_id, client_id)'),
  public._create_index_if_cols_exist('idx_boletas_tenant_salesperson', 'boletas', ARRAY['tenant_id', 'salesperson_id'], '(tenant_id, salesperson_id)'),
  public._create_index_if_cols_exist('idx_boletas_paid_at', 'boletas', ARRAY['tenant_id', 'paid_at'], '(tenant_id, paid_at DESC)'),

  -- Comunicaciones, Despachos y Rendiciones
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
