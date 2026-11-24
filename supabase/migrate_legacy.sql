-- =============================================================================
-- RF GESTIÓN · MIGRACIÓN ÚNICA DESDE LA TABLA VIEJA app_cloud_store
-- -----------------------------------------------------------------------------
-- Requisito: haber corrido antes supabase/schema_v2.sql.
--
-- PASO A (este bloque): copia TODO lo que hoy está en app_cloud_store a las
-- tablas nuevas. No borra nada de la tabla vieja. Si un registro ya existe en
-- las tablas nuevas, NO lo pisa (se puede correr de nuevo sin riesgo).
-- Al final muestra un resumen con la cantidad de filas migradas.
--
-- PASO B: correr el script de usuarios (scripts/migrate-legacy-users.mjs) que
-- crea las cuentas de Supabase Auth a partir de public.legacy_users.
--
-- PASO C (al final de este archivo, comentado): cerrar el acceso público a la
-- tabla vieja, una vez que verificaste que todo está bien.
-- =============================================================================

-- Usuarios viejos en espera de crear su cuenta en Supabase Auth.
-- Contiene las contraseñas viejas: RLS sin políticas (solo service role).
create table if not exists public.legacy_users (
  legacy_id text primary key,
  data jsonb not null,
  migrated_at timestamptz,
  auth_user_id uuid,
  note text
);
alter table public.legacy_users enable row level security;
revoke all on public.legacy_users from anon, authenticated;

create or replace function public._legacy_json(p jsonb)
returns jsonb language plpgsql immutable as $$
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) = 'string' then
    begin
      return (p #>> '{}')::jsonb;
    exception when others then
      return p;
    end;
  end if;
  return p;
end $$;

create or replace function public.migrate_legacy_cloud_store()
returns table (tabla text, filas bigint)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_code text;
  v_tries int;
begin
  if to_regclass('public.app_cloud_store') is null then
    raise notice 'No existe app_cloud_store: no hay nada que migrar.';
    return;
  end if;

  create temp table if not exists _src (key text, value jsonb, updated_at timestamptz) on commit drop;
  truncate _src;
  insert into _src select key, public._legacy_json(value), updated_at from public.app_cloud_store;

  -- 1. Comercios -------------------------------------------------------------
  create temp table if not exists _biz (id text, data jsonb, updated_at timestamptz) on commit drop;
  truncate _biz;
  insert into _biz
    select t->>'id', t, s.updated_at
      from _src s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) t
     where s.key = 'saas_distribuidoras_tenants_v2_zero' and t->>'id' is not null;
  insert into _biz
    select substring(s.key from length('rec:platform:tenants:') + 1), s.value, s.updated_at + interval '1 microsecond'
      from _src s where s.key like 'rec:platform:tenants:%';
  -- Comercios con datos pero sin ficha: se crean igual para no perder nada
  insert into _biz
    select substring(s.key from length('saas_distribuidora_data_v2_') + 1),
           jsonb_build_object('id', substring(s.key from length('saas_distribuidora_data_v2_') + 1),
                              'name', coalesce(s.value->'config'->>'distributorName', 'Comercio sin nombre'),
                              'status', 'active', 'config', coalesce(s.value->'config', '{}'::jsonb)),
           '-infinity'::timestamptz
      from _src s where s.key like 'saas_distribuidora_data_v2_%';

  for r in
    select distinct on (id) id, data from _biz where id is not null and id <> '' order by id, updated_at desc
  loop
    v_tries := 0;
    v_code := r.data->>'tenantCode';
    loop
      begin
        insert into public.businesses (id, data)
          values (r.id, case when v_code is null then r.data else jsonb_set(r.data, '{tenantCode}', to_jsonb(v_code)) end)
          on conflict (id) do nothing;
        exit;
      exception when unique_violation then
        v_tries := v_tries + 1;
        v_code := coalesce(r.data->>'tenantCode', 'EMP') || '-' || v_tries;
        raise notice 'Código de empresa repetido para %: se usa %', r.id, v_code;
        if v_tries > 20 then raise; end if;
      end;
    end loop;
  end loop;

  -- 2. Registros por comercio ------------------------------------------------
  create temp table if not exists _ent (business_id text, coll text, id text, data jsonb, updated_at timestamptz, prio int) on commit drop;
  truncate _ent;

  -- 2a. Desde el objeto completo de cada comercio
  insert into _ent
    select substring(s.key from length('saas_distribuidora_data_v2_') + 1), c.coll, e->>'id', e, s.updated_at, 0
      from _src s
      cross join lateral (values ('clients'), ('salespeople'), ('admins'), ('boletas'), ('paidBoletas'),
        ('broadcasts'), ('autoLogs'), ('rendiciones'), ('catalogProducts'), ('catalogOrders'),
        ('catalogStockAlerts'), ('catalogPromoSubscribers'), ('catalogLoyaltyAccounts'),
        ('catalogAbandonedCarts'), ('catalogGiftCards')) c(coll)
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(s.value->c.coll) = 'array' then s.value->c.coll else '[]'::jsonb end) e
     where s.key like 'saas_distribuidora_data_v2_%' and e->>'id' is not null;

  -- 2b. Desde las filas sueltas rec:<comercio>:<colección>:<id>
  insert into _ent
    select split_part(s.key, ':', 2), split_part(s.key, ':', 3),
           substring(s.key from length('rec:' || split_part(s.key, ':', 2) || ':' || split_part(s.key, ':', 3) || ':') + 1),
           s.value, s.updated_at, 1
      from _src s
     where s.key like 'rec:%' and split_part(s.key, ':', 2) not in ('platform', 'secret')
       and split_part(s.key, ':', 3) in ('clients', 'salespeople', 'admins', 'boletas', 'paidBoletas',
         'broadcasts', 'autoLogs', 'rendiciones', 'catalogProducts', 'catalogOrders', 'catalogStockAlerts',
         'catalogPromoSubscribers', 'catalogLoyaltyAccounts', 'catalogAbandonedCarts', 'catalogGiftCards')
       and jsonb_typeof(s.value) = 'object';

  -- 2c. Desde claves públicas del catálogo (pedidos, avisos, club, puntos, carritos, gift cards)
  insert into _ent
    select s.value->>'tenantId',
           case
             when s.key like 'catalog_order_%' then 'catalogOrders'
             when s.key like 'catalog_stock_alert_%' then 'catalogStockAlerts'
             when s.key like 'catalog_promo_sub_%' then 'catalogPromoSubscribers'
             when s.key like 'catalog_loyalty_%' then 'catalogLoyaltyAccounts'
             when s.key like 'catalog_abandoned_cart_%' then 'catalogAbandonedCarts'
             when s.key like 'catalog_gift_card_%' then 'catalogGiftCards'
           end,
           s.value->>'id', s.value, s.updated_at, 1
      from _src s
     where (s.key like 'catalog_order_%' or s.key like 'catalog_stock_alert_%' or s.key like 'catalog_promo_sub_%'
            or s.key like 'catalog_loyalty_%' or s.key like 'catalog_abandoned_cart_%' or s.key like 'catalog_gift_card_%')
       and jsonb_typeof(s.value) = 'object' and s.value->>'tenantId' is not null and s.value->>'id' is not null;

  delete from _ent where business_id not in (select id from public.businesses);

  -- Para cada registro se queda la versión más nueva
  create temp table if not exists _ent_last on commit drop as select * from _ent limit 0;
  truncate _ent_last;
  insert into _ent_last
    select distinct on (business_id,
             case when coll in ('boletas', 'paidBoletas') then 'boletas' else coll end, id)
           business_id, coll, id, data, updated_at, prio
      from _ent
     order by business_id, case when coll in ('boletas', 'paidBoletas') then 'boletas' else coll end, id,
              updated_at desc nulls last, prio desc;

  insert into public.clients (business_id, id, data) select business_id, id, data from _ent_last where coll = 'clients' on conflict do nothing;
  insert into public.salespeople (business_id, id, data) select business_id, id, data from _ent_last where coll = 'salespeople' on conflict do nothing;
  insert into public.administrators (business_id, id, data) select business_id, id, data from _ent_last where coll = 'admins' on conflict do nothing;
  insert into public.boletas (business_id, id, data, archived)
    select business_id, id, data, coll = 'paidBoletas' or data->>'status' = 'paid'
      from _ent_last where coll in ('boletas', 'paidBoletas') on conflict do nothing;
  insert into public.broadcasts (business_id, id, data) select business_id, id, data from _ent_last where coll = 'broadcasts' on conflict do nothing;
  insert into public.dispatch_logs (business_id, id, data) select business_id, id, data from _ent_last where coll = 'autoLogs' on conflict do nothing;
  insert into public.rendiciones (business_id, id, data) select business_id, id, data from _ent_last where coll = 'rendiciones' on conflict do nothing;
  insert into public.catalog_products (business_id, id, data) select business_id, id, data from _ent_last where coll = 'catalogProducts' on conflict do nothing;
  insert into public.catalog_orders (business_id, id, data) select business_id, id, data from _ent_last where coll = 'catalogOrders' on conflict do nothing;
  insert into public.catalog_stock_alerts (business_id, id, data) select business_id, id, data from _ent_last where coll = 'catalogStockAlerts' on conflict do nothing;
  insert into public.catalog_promo_subscribers (business_id, id, data) select business_id, id, data from _ent_last where coll = 'catalogPromoSubscribers' on conflict do nothing;
  insert into public.catalog_loyalty_accounts (business_id, id, data) select business_id, id, data from _ent_last where coll = 'catalogLoyaltyAccounts' on conflict do nothing;
  insert into public.catalog_abandoned_carts (business_id, id, data) select business_id, id, data from _ent_last where coll = 'catalogAbandonedCarts' on conflict do nothing;
  insert into public.catalog_gift_cards (business_id, id, data) select business_id, id, data from _ent_last where coll = 'catalogGiftCards' on conflict do nothing;

  -- 3. Ajustes de cada comercio ---------------------------------------------
  insert into public.business_settings (business_id, config, catalog_settings, extra)
    select distinct on (bid) bid, cfg, cat, extra
      from (
        select substring(s.key from length('saas_distribuidora_data_v2_') + 1) as bid,
               coalesce(c.value, s.value->'config', '{}'::jsonb) as cfg,
               coalesce(cs.value, s.value->'catalogSettings') as cat,
               s.value - array['config', 'catalogSettings', 'clients', 'salespeople', 'admins', 'boletas',
                 'paidBoletas', 'broadcasts', 'autoLogs', 'rendiciones', 'catalogProducts', 'catalogOrders',
                 'catalogStockAlerts', 'catalogPromoSubscribers', 'catalogLoyaltyAccounts',
                 'catalogAbandonedCarts', 'catalogGiftCards'] as extra,
               s.updated_at
          from _src s
          left join _src c on c.key = 'rec:' || substring(s.key from length('saas_distribuidora_data_v2_') + 1) || ':config:main'
          left join _src cs on cs.key = 'rec:' || substring(s.key from length('saas_distribuidora_data_v2_') + 1) || ':catalogSettings:main'
         where s.key like 'saas_distribuidora_data_v2_%' and jsonb_typeof(s.value) = 'object'
      ) x
     where bid in (select id from public.businesses)
     order by bid, updated_at desc
  on conflict (business_id) do nothing;
  -- Comercios sin objeto completo: config desde la ficha del comercio
  insert into public.business_settings (business_id, config)
    select id, coalesce(data->'config', '{}'::jsonb) from public.businesses
  on conflict (business_id) do nothing;

  -- 4. Catálogo publicado (si dos comercios usan el mismo slug, el segundo queda sin slug)
  for r in
    select distinct on (s.value->>'tenantId') s.value->>'tenantId' as bid, s.value as snap
      from _src s
     where s.key like 'public_catalog_%' and s.key not like 'public_catalog_ref_%'
       and s.key not like 'public_catalog_handle_%' and jsonb_typeof(s.value) = 'object'
       and s.value->>'tenantId' in (select id from public.businesses)
     order by s.value->>'tenantId', s.updated_at desc
  loop
    begin
      insert into public.public_catalogs (business_id, snapshot) values (r.bid, r.snap)
        on conflict (business_id) do nothing;
    exception when unique_violation then
      raise notice 'Slug de catálogo repetido para %: se guarda sin slug', r.bid;
      insert into public.public_catalogs (business_id, snapshot) values (r.bid, r.snap - 'slug')
        on conflict (business_id) do nothing;
    end;
  end loop;

  -- 5. Links de pago y abonos -----------------------------------------------
  insert into public.payment_links (token, business_id, data)
    select s.value->>'token', s.value->>'tenantId', s.value from _src s
     where s.key like 'client_payment_order_%' and s.value->>'token' is not null
       and s.value->>'tenantId' in (select id from public.businesses)
  on conflict (token) do nothing;

  insert into public.subscription_pay_orders (token, business_id, data)
    select s.value->>'token', s.value->>'tenantId', s.value from _src s
     where s.key like 'tenant_sub_pay_order_%' and s.value->>'token' is not null
       and s.value->>'tenantId' in (select id from public.businesses)
  on conflict (token) do nothing;

  insert into public.subscription_payments (business_id, month_key, data)
    select distinct on (bid, mk) bid, mk, v from (
      select split_part(e.key, '::', 1) as bid, split_part(e.key, '::', 2) as mk, e.value as v, s.updated_at, 0 as prio
        from _src s, jsonb_each(case when jsonb_typeof(s.value) = 'object' then s.value else '{}'::jsonb end) e
       where s.key = 'saas_verified_tenant_payments_v1'
      union all
      select split_part(substring(s.key from length('rec:platform:verified_payments:') + 1), '::', 1),
             split_part(substring(s.key from length('rec:platform:verified_payments:') + 1), '::', 2),
             s.value, s.updated_at, 1
        from _src s where s.key like 'rec:platform:verified_payments:%'
    ) x
     where bid in (select id from public.businesses) and mk <> ''
     order by bid, mk, updated_at desc, prio desc
  on conflict do nothing;

  -- 6. Plataforma ------------------------------------------------------------
  insert into public.platform_settings (key, value)
    select 'billing', s.value - 'mpAccessToken' from _src s where s.key = 'saas_platform_billing_config_v1' and jsonb_typeof(s.value) = 'object'
  on conflict (key) do nothing;
  insert into public.platform_settings (key, value)
    select 'support', s.value from _src s where s.key = 'saas_platform_support_config_v1' and jsonb_typeof(s.value) = 'object'
  on conflict (key) do nothing;

  insert into public.announcements (id, data)
    select distinct on (id) id, data from (
      select a->>'id' as id, a as data, s.updated_at, 0 as prio
        from _src s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) a
       where s.key = 'saas_platform_announcements_v1'
      union all
      select substring(s.key from length('rec:platform:announcements:') + 1), s.value, s.updated_at, 1
        from _src s where s.key like 'rec:platform:announcements:%'
    ) x where id is not null
     order by id, updated_at desc, prio desc
  on conflict (id) do nothing;

  -- 7. Secretos de Mercado Pago (pasan a tablas sin acceso desde el navegador)
  insert into public.business_secrets (business_id, mp_access_token)
    select substring(s.key from length('merchant_mp_token_') + 1), s.value->>'accessToken' from _src s
     where s.key like 'merchant_mp_token_%' and s.value->>'accessToken' is not null
       and substring(s.key from length('merchant_mp_token_') + 1) in (select id from public.businesses)
  on conflict (business_id) do nothing;
  insert into public.platform_secrets (key, value)
    select 'mp_access_token', coalesce(
      (select value->>'accessToken' from _src where key = 'rec:secret:platform_mp_access_token'),
      (select value->>'mpAccessToken' from _src where key = 'saas_platform_billing_config_v1'))
    where coalesce(
      (select value->>'accessToken' from _src where key = 'rec:secret:platform_mp_access_token'),
      (select value->>'mpAccessToken' from _src where key = 'saas_platform_billing_config_v1'), '') <> ''
  on conflict (key) do nothing;

  -- 8. Usuarios (quedan en espera del script de Auth)
  insert into public.legacy_users (legacy_id, data)
    select distinct on (id) id, data from (
      select u->>'id' as id, u as data, s.updated_at, 0 as prio
        from _src s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) u
       where s.key = 'saas_distribuidoras_users_v2_zero'
      union all
      select substring(s.key from length('rec:platform:users:') + 1), s.value, s.updated_at, 1
        from _src s where s.key like 'rec:platform:users:%'
    ) x where id is not null
     order by id, updated_at desc, prio desc
  on conflict (legacy_id) do nothing;

  return query
    select 'businesses', count(*) from public.businesses union all
    select 'business_settings', count(*) from public.business_settings union all
    select 'clients', count(*) from public.clients union all
    select 'salespeople', count(*) from public.salespeople union all
    select 'administrators', count(*) from public.administrators union all
    select 'boletas (impagas)', count(*) from public.boletas where not archived union all
    select 'boletas (pagadas)', count(*) from public.boletas where archived union all
    select 'rendiciones', count(*) from public.rendiciones union all
    select 'dispatch_logs', count(*) from public.dispatch_logs union all
    select 'catalog_products', count(*) from public.catalog_products union all
    select 'catalog_orders', count(*) from public.catalog_orders union all
    select 'public_catalogs', count(*) from public.public_catalogs union all
    select 'payment_links', count(*) from public.payment_links union all
    select 'subscription_payments', count(*) from public.subscription_payments union all
    select 'announcements', count(*) from public.announcements union all
    select 'business_secrets', count(*) from public.business_secrets union all
    select 'legacy_users (a crear en Auth)', count(*) from public.legacy_users where migrated_at is null;
end $$;

revoke all on function public.migrate_legacy_cloud_store() from public, anon, authenticated;

-- Ejecutar la migración y ver el resumen:
select * from public.migrate_legacy_cloud_store();


-- =============================================================================
-- PASO C · CERRAR LA TABLA VIEJA (correr SOLO cuando verificaste que la app
-- nueva funciona y que los usuarios pueden entrar). Quita el acceso público a
-- app_cloud_store y a las tablas espejo viejas, que hoy cualquiera puede leer
-- con la clave anon (incluidos tokens de Mercado Pago y contraseñas).
-- Los datos quedan guardados por si hace falta volver atrás.
-- =============================================================================
-- do $$
-- declare t text; pol record;
-- begin
--   foreach t in array array['app_cloud_store', 'platform_billing_config', 'platform_support_config',
--                            'platform_announcements', 'client_payment_orders'] loop
--     if to_regclass('public.' || t) is not null then
--       for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
--         execute format('drop policy %I on public.%I', pol.policyname, t);
--       end loop;
--       execute format('revoke all on public.%I from anon, authenticated', t);
--     end if;
--   end loop;
-- end $$;
