-- =============================================================================
-- RF GESTIÓN · ESQUEMA V2 (Supabase Auth + Row Level Security por comercio)
-- -----------------------------------------------------------------------------
-- Cómo usarlo:
--   1. Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
--   2. Es idempotente: se puede volver a correr sin perder datos.
--   3. Después correr supabase/migrate_legacy.sql (importa los datos viejos).
--
-- Modelo:
--   · businesses            → comercios (cada uno con su id de texto)
--   · profiles              → usuarios (1 a 1 con auth.users) con rol y comercio
--   · business_settings     → ajustes del comercio (config + catálogo)
--   · tablas por comercio   → clients, salespeople, administrators, boletas,
--                             rendiciones, broadcasts, dispatch_logs (registro de
--                             alertas enviadas), catalog_* (productos, pedidos web…)
--     Todas tienen (business_id, id) como clave, el objeto completo en `data`
--     (para no perder ningún campo) y columnas calculadas para filtrar e indexar.
--   · payment_links, subscription_pay_orders, subscription_payments
--   · platform_settings, announcements
--   · business_secrets / platform_secrets → tokens de Mercado Pago. SIN acceso
--     desde el navegador: solo las Edge Functions con la service role key.
--
-- Seguridad: cada usuario solo ve y modifica los datos de SU comercio
-- (business_id). El superadmin ve todo. El público (catálogo, links de pago)
-- entra únicamente por funciones RPC acotadas.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Funciones auxiliares
-- -----------------------------------------------------------------------------

create or replace function public.safe_numeric(p text)
returns numeric language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::numeric;
exception when others then
  return null;
end $$;

create or replace function public.safe_date(p text)
returns date language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return left(p, 10)::date;
exception when others then
  return null;
end $$;

create or replace function public.safe_ts(p text)
returns timestamptz language plpgsql immutable as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Comercios y perfiles
-- -----------------------------------------------------------------------------

create table if not exists public.businesses (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  code text generated always as (upper(nullif(data->>'tenantCode', ''))) stored,
  name text generated always as (data->>'name') stored,
  rubro text generated always as (coalesce(data->>'businessRubro', data->'config'->>'businessRubro')) stored,
  status text generated always as (data->>'status') stored,
  plan_tier text generated always as (data->'subscription'->>'planTier') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists businesses_code_uidx on public.businesses (code) where code is not null;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_id text references public.businesses (id) on delete set null,
  role text not null default 'vendedor'
    check (role in ('superadmin', 'dueño', 'administrador', 'vendedor')),
  username text,
  full_name text not null default '',
  email text,
  phone text,
  active boolean not null default true,
  legacy_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_business_idx on public.profiles (business_id);
create unique index if not exists profiles_legacy_uidx on public.profiles (legacy_user_id) where legacy_user_id is not null;
create unique index if not exists profiles_username_biz_uidx on public.profiles (business_id, lower(username))
  where username is not null and business_id is not null;
create unique index if not exists profiles_username_global_uidx on public.profiles (lower(username))
  where username is not null and business_id is null;

create table if not exists public.business_settings (
  business_id text primary key references public.businesses (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  catalog_settings jsonb,
  extra jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Tablas por comercio (misma forma para todas)
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
  entity_tables text[] := array[
    'clients', 'salespeople', 'administrators', 'boletas', 'rendiciones',
    'broadcasts', 'dispatch_logs', 'catalog_products', 'catalog_orders',
    'catalog_stock_alerts', 'catalog_promo_subscribers', 'catalog_loyalty_accounts',
    'catalog_abandoned_carts', 'catalog_gift_cards'
  ];
begin
  foreach t in array entity_tables loop
    execute format($f$
      create table if not exists public.%I (
        business_id text not null references public.businesses (id) on delete cascade,
        id text not null,
        data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (business_id, id)
      )$f$, t);
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Columnas calculadas (se llenan solas desde `data`)
alter table public.clients
  add column if not exists name text generated always as (data->>'name') stored,
  add column if not exists phone text generated always as (data->>'phone') stored,
  add column if not exists salesperson_id text generated always as (data->>'assignedSalespersonId') stored,
  add column if not exists reputation text generated always as (coalesce(data->'creditHistory'->>'reputationStatus', 'confiable')) stored;

alter table public.salespeople
  add column if not exists name text generated always as (data->>'name') stored,
  add column if not exists phone text generated always as (data->>'phone') stored;

-- archived = true → la boleta está en el historial de pagadas
alter table public.boletas
  add column if not exists archived boolean not null default false,
  add column if not exists boleta_number text generated always as (data->>'boletaNumber') stored,
  add column if not exists client_id text generated always as (data->>'clientId') stored,
  add column if not exists salesperson_id text generated always as (data->>'salespersonId') stored,
  add column if not exists status text generated always as (data->>'status') stored,
  add column if not exists sale_date date generated always as (public.safe_date(data->>'saleDate')) stored,
  add column if not exists due_date date generated always as (public.safe_date(data->>'dueDate')) stored,
  add column if not exists paid_at date generated always as (public.safe_date(data->>'paidAt')) stored,
  add column if not exists amount numeric generated always as (public.safe_numeric(data->>'amount')) stored,
  add column if not exists plan_id text generated always as (data->>'planId') stored,
  add column if not exists installment_number int generated always as (public.safe_numeric(data->>'installmentNumber')::int) stored,
  add column if not exists total_installments int generated always as (public.safe_numeric(data->>'totalInstallments')::int) stored;

alter table public.dispatch_logs
  add column if not exists sent_at timestamptz generated always as (public.safe_ts(data->>'timestamp')) stored,
  add column if not exists milestone text generated always as (data->>'ruleMilestone') stored,
  add column if not exists recipient_role text generated always as (data->>'recipientRole') stored;

alter table public.catalog_orders
  add column if not exists order_number text generated always as (data->>'orderNumber') stored,
  add column if not exists status text generated always as (data->>'status') stored,
  add column if not exists customer_dni text generated always as (regexp_replace(coalesce(data->>'customerDni', ''), '\D', '', 'g')) stored,
  add column if not exists customer_phone text generated always as (data->>'customerPhone') stored;

alter table public.catalog_loyalty_accounts
  add column if not exists dni text generated always as (regexp_replace(coalesce(data->>'dni', ''), '\D', '', 'g')) stored;

alter table public.catalog_gift_cards
  add column if not exists code text generated always as (upper(data->>'code')) stored;

-- Índices
create index if not exists boletas_status_idx on public.boletas (business_id, status, archived);
create index if not exists boletas_client_idx on public.boletas (business_id, client_id);
create index if not exists boletas_due_idx on public.boletas (business_id, due_date) where status = 'pending';
create index if not exists boletas_paid_idx on public.boletas (business_id, paid_at) where status = 'paid';
create index if not exists clients_name_idx on public.clients (business_id, name);
create index if not exists dispatch_logs_sent_idx on public.dispatch_logs (business_id, sent_at desc);
create index if not exists catalog_orders_status_idx on public.catalog_orders (business_id, status);
create index if not exists catalog_orders_dni_idx on public.catalog_orders (business_id, customer_dni);
create index if not exists loyalty_dni_idx on public.catalog_loyalty_accounts (business_id, dni);
create index if not exists gift_cards_code_idx on public.catalog_gift_cards (business_id, code);

-- -----------------------------------------------------------------------------
-- 4. Catálogo público, cobros y plataforma
-- -----------------------------------------------------------------------------

create table if not exists public.public_catalogs (
  business_id text primary key references public.businesses (id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  slug text generated always as (lower(nullif(snapshot->>'slug', ''))) stored,
  code text generated always as (lower(nullif(snapshot->>'tenantCode', ''))) stored,
  is_public boolean generated always as (
    coalesce(snapshot->>'published', 'true') <> 'false'
    and coalesce(snapshot->>'enabledBySuperAdmin', 'true') <> 'false'
  ) stored,
  updated_at timestamptz not null default now()
);
create unique index if not exists public_catalogs_slug_uidx on public.public_catalogs (slug) where slug is not null;
create index if not exists public_catalogs_code_idx on public.public_catalogs (code);

-- Links de pago enviados a clientes por WhatsApp
create table if not exists public.payment_links (
  token text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  status text generated always as (data->>'status') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_links_business_idx on public.payment_links (business_id, status);

-- Órdenes de pago del abono mensual (comercio → plataforma)
create table if not exists public.subscription_pay_orders (
  token text primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pagos de abono verificados
create table if not exists public.subscription_payments (
  business_id text not null references public.businesses (id) on delete cascade,
  month_key text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (business_id, month_key)
);

create table if not exists public.platform_settings (
  key text primary key check (key in ('billing', 'support')),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Secretos: RLS activado y SIN políticas → el navegador no puede leerlos nunca.
create table if not exists public.business_secrets (
  business_id text primary key references public.businesses (id) on delete cascade,
  mp_access_token text,
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Registro de cada ejecución de la purga de 30 días
create table if not exists public.retention_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  business_id text,
  purged_count int not null default 0,
  details jsonb not null default '{}'::jsonb
);

do $$
declare t text;
begin
  foreach t in array array['businesses', 'profiles', 'business_settings', 'public_catalogs',
    'payment_links', 'subscription_pay_orders', 'subscription_payments', 'platform_settings',
    'announcements', 'business_secrets', 'platform_secrets'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Quién es el usuario actual
-- -----------------------------------------------------------------------------

create or replace function public.auth_business_id()
returns text language sql stable security definer set search_path = public as $$
  select business_id from public.profiles where id = auth.uid() and active
$$;

create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'superadmin' from public.profiles where id = auth.uid() and active), false)
$$;

create or replace function public.can_access_business(p_business_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin()
      or exists (select 1 from public.profiles
                 where id = auth.uid() and active and business_id = p_business_id)
$$;

create or replace function public.can_manage_business(p_business_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin()
      or exists (select 1 from public.profiles
                 where id = auth.uid() and active and business_id = p_business_id
                   and role in ('dueño', 'administrador'))
$$;

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
  pol record;
  all_tables text[] := array[
    'businesses', 'profiles', 'business_settings', 'clients', 'salespeople', 'administrators',
    'boletas', 'rendiciones', 'broadcasts', 'dispatch_logs', 'catalog_products', 'catalog_orders',
    'catalog_stock_alerts', 'catalog_promo_subscribers', 'catalog_loyalty_accounts',
    'catalog_abandoned_carts', 'catalog_gift_cards', 'public_catalogs', 'payment_links',
    'subscription_pay_orders', 'subscription_payments', 'platform_settings', 'announcements',
    'business_secrets', 'platform_secrets', 'retention_runs'
  ];
  member_tables text[] := array[
    'business_settings', 'clients', 'salespeople', 'administrators', 'boletas', 'rendiciones',
    'broadcasts', 'dispatch_logs', 'catalog_products', 'catalog_orders', 'catalog_stock_alerts',
    'catalog_promo_subscribers', 'catalog_loyalty_accounts', 'catalog_abandoned_carts',
    'catalog_gift_cards', 'payment_links', 'subscription_pay_orders', 'subscription_payments'
  ];
begin
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
    -- Borra políticas anteriores para que el script sea re-ejecutable
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;

  -- Datos del comercio: solo sus miembros (y el superadmin)
  foreach t in array member_tables loop
    execute format(
      'create policy member_access on public.%I for all to authenticated
         using (public.can_access_business(business_id))
         with check (public.can_access_business(business_id))', t);
  end loop;
end $$;

-- Comercios
create policy businesses_select on public.businesses for select to authenticated
  using (public.can_access_business(id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.can_access_business(id)) with check (public.can_access_business(id));
create policy businesses_insert on public.businesses for insert to authenticated
  with check (public.is_superadmin());
create policy businesses_delete on public.businesses for delete to authenticated
  using (public.is_superadmin());

-- Perfiles: cada uno ve el suyo y los de su comercio; el superadmin, todos.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_superadmin()
         or (business_id is not null and business_id = public.auth_business_id()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_superadmin())
  with check (id = auth.uid() or public.is_superadmin());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_superadmin());
create policy profiles_delete on public.profiles for delete to authenticated
  using (public.is_superadmin());

-- Nadie puede cambiarse solo el rol, el comercio o el estado (evita escalar permisos)
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_superadmin() then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.business_id is distinct from old.business_id
     or new.active is distinct from old.active
     or new.legacy_user_id is distinct from old.legacy_user_id then
    raise exception 'No tenés permiso para cambiar el rol, el comercio o el estado de un usuario.';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Catálogo público: lectura abierta solo si está publicado; escritura de miembros
create policy public_catalogs_read on public.public_catalogs for select to anon, authenticated
  using (is_public or public.can_access_business(business_id));
create policy public_catalogs_write on public.public_catalogs for all to authenticated
  using (public.can_access_business(business_id))
  with check (public.can_access_business(business_id));

-- Plataforma
create policy platform_settings_read on public.platform_settings for select to anon, authenticated
  using (true);
create policy platform_settings_write on public.platform_settings for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy announcements_read on public.announcements for select to authenticated using (true);
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy retention_runs_read on public.retention_runs for select to authenticated
  using (public.is_superadmin() or business_id = public.auth_business_id());

-- business_secrets y platform_secrets: sin políticas a propósito.

-- Permisos de tabla (RLS decide fila por fila)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on public.business_secrets, public.platform_secrets from anon, authenticated;
grant select on public.public_catalogs, public.platform_settings to anon;
-- Las Edge Functions usan la service role: en los proyectos nuevos de Supabase
-- ya no recibe permisos automáticos sobre las tablas, así que se otorgan acá.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- -----------------------------------------------------------------------------
-- 7. Vistas: pagos y cuotas (respetan RLS del usuario que consulta)
-- -----------------------------------------------------------------------------

create or replace view public.payments_v with (security_invoker = true) as
  select b.business_id,
         b.id as boleta_id,
         b.boleta_number,
         b.client_id,
         p.value->>'id' as payment_id,
         public.safe_date(p.value->>'date') as paid_on,
         public.safe_numeric(p.value->>'amount') as amount,
         p.value->>'paymentMethod' as payment_method,
         'parcial'::text as kind
    from public.boletas b
    cross join lateral jsonb_array_elements(coalesce(b.data->'partialPayments', '[]'::jsonb)) as p(value)
  union all
  select b.business_id, b.id, b.boleta_number, b.client_id,
         b.id || '-final',
         b.paid_at,
         greatest(coalesce(b.amount, 0) - coalesce((
           select sum(public.safe_numeric(x->>'amount'))
             from jsonb_array_elements(coalesce(b.data->'partialPayments', '[]'::jsonb)) x), 0), 0),
         b.data->>'paymentMethod',
         'cancelacion'::text
    from public.boletas b
   where b.status = 'paid';

create or replace view public.installments_v with (security_invoker = true) as
  select business_id, id as boleta_id, plan_id, installment_number, total_installments,
         client_id, amount, due_date, status
    from public.boletas
   where installment_number is not null;

grant select on public.payments_v, public.installments_v to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Alta de comercio en prueba gratis (el usuario ya se registró en Auth)
-- -----------------------------------------------------------------------------

create or replace function public.register_trial_business(
  p_business jsonb,
  p_settings jsonb,
  p_profile jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id text := coalesce(nullif(p_business->>'id', ''), 'biz-' || replace(gen_random_uuid()::text, '-', ''));
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_business jsonb;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión para crear la cuenta.';
  end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Este usuario ya tiene un comercio asignado.';
  end if;
  if exists (select 1 from public.businesses where id = v_id)
     or exists (select 1 from public.businesses where code = upper(p_business->>'tenantCode')) then
    raise exception 'El código de empresa ya está en uso. Probá con otro.';
  end if;

  -- La prueba gratis la define el servidor (no se puede falsear desde el navegador)
  v_business := jsonb_set(p_business, '{id}', to_jsonb(v_id));
  v_business := jsonb_set(v_business, '{status}', '"trial"');
  v_business := jsonb_set(v_business, '{subscription}',
    (coalesce(v_business->'subscription', '{}'::jsonb)
       - 'lastPaidMonth' - 'annualPlanUntilMonth' - 'extendedUntilMonth' - 'extendedUntilDate')
      || jsonb_build_object(
           'isPaused', false,
           'selfRegistered', true,
           'trialDays', 30,
           'trialStartedAt', to_char(v_today, 'YYYY-MM-DD'),
           'trialEndsAt', to_char(v_today + 30, 'YYYY-MM-DD'),
           'paymentHistory', '[]'::jsonb
         ));

  insert into public.businesses (id, data) values (v_id, v_business);
  insert into public.business_settings (business_id, config, catalog_settings)
    values (v_id, coalesce(p_settings->'config', '{}'::jsonb), p_settings->'catalogSettings');
  insert into public.profiles (id, business_id, role, username, full_name, email, phone)
    values (v_uid, v_id, 'dueño',
            lower(nullif(p_profile->>'username', '')),
            coalesce(p_profile->>'fullName', ''),
            (select email from auth.users where id = v_uid),
            p_profile->>'phone');
  return v_id;
end $$;

revoke all on function public.register_trial_business(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.register_trial_business(jsonb, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 9. Tokens de Mercado Pago (se escriben, nunca se leen desde el navegador)
-- -----------------------------------------------------------------------------

create or replace function public.set_merchant_mp_token(p_business_id text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_business(p_business_id) then
    raise exception 'Solo el dueño o un administrador puede cargar el token de Mercado Pago.';
  end if;
  insert into public.business_secrets (business_id, mp_access_token)
    values (p_business_id, nullif(btrim(p_token), ''))
  on conflict (business_id) do update set mp_access_token = excluded.mp_access_token;
  return true;
end $$;

create or replace function public.set_platform_mp_token(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then
    raise exception 'Solo el superadmin puede cargar el token de la plataforma.';
  end if;
  insert into public.platform_secrets (key, value) values ('mp_access_token', btrim(p_token))
  on conflict (key) do update set value = excluded.value;
  return true;
end $$;

revoke all on function public.set_merchant_mp_token(text, text) from public, anon;
revoke all on function public.set_platform_mp_token(text) from public, anon;
grant execute on function public.set_merchant_mp_token(text, text) to authenticated;
grant execute on function public.set_platform_mp_token(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Acceso público acotado (catálogo online, links de pago, abono)
-- -----------------------------------------------------------------------------

-- ¿El comercio tiene el catálogo habilitado? (no pausado, no suspendido, habilitado por el superadmin)
create or replace function public._business_catalog_enabled(p_business_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select coalesce(b.data->>'catalogEnabled', 'true') <> 'false'
       and coalesce(b.data->>'status', '') <> 'suspended'
       and coalesce(b.data->'subscription'->>'isPaused', 'false') <> 'true'
      from public.businesses b where b.id = p_business_id), false)
$$;

create or replace function public.public_catalog_get(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select pc.snapshot
         || jsonb_strip_nulls(jsonb_build_object(
              'logoUrl', coalesce(nullif(b.data->'config'->>'distributorLogoUrl', ''), nullif(b.data->>'logoUrl', '')),
              'icon', coalesce(nullif(b.data->'config'->>'distributorIcon', ''), nullif(b.data->>'icon', '')),
              'merchantPaymentAlias', b.data->'config'->>'merchantPaymentAlias',
              'merchantPaymentCvu', b.data->'config'->>'merchantPaymentCvu',
              'merchantPaymentBank', b.data->'config'->>'merchantPaymentBank',
              'merchantPaymentHolder', b.data->'config'->>'merchantPaymentHolder',
              'merchantMpCheckoutLink', b.data->'config'->>'merchantMpCheckoutLink',
              'hasMerchantMpAccessToken', exists (select 1 from public.business_secrets s
                                                   where s.business_id = pc.business_id and coalesce(s.mp_access_token, '') <> '')))
         || jsonb_build_object(
              'tenantId', pc.business_id,
              'enabledBySuperAdmin', public._business_catalog_enabled(pc.business_id)
                                     and coalesce(pc.snapshot->>'enabledBySuperAdmin', 'true') <> 'false')
    from public.public_catalogs pc
    join public.businesses b on b.id = pc.business_id
   where coalesce(pc.snapshot->>'published', 'true') <> 'false'
     and (pc.business_id = p_handle or pc.slug = lower(p_handle) or pc.code = lower(p_handle))
   order by (pc.slug = lower(p_handle)) desc nulls last
   limit 1
$$;

create or replace function public._public_catalog_open(p_business_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.public_catalogs where business_id = p_business_id and is_public)
     and public._business_catalog_enabled(p_business_id)
$$;

-- Lee un pedido web o un carrito por id (seguimiento del comprador)
create or replace function public.public_entity_get(p_business_id text, p_kind text, p_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public._public_catalog_open(p_business_id) then return null; end if;
  if p_kind = 'catalog_orders' then
    select data into v from public.catalog_orders where business_id = p_business_id and id = p_id;
  elsif p_kind = 'catalog_abandoned_carts' then
    select data into v from public.catalog_abandoned_carts where business_id = p_business_id and id = p_id;
  else
    raise exception 'Tipo no permitido: %', p_kind;
  end if;
  return v;
end $$;

-- Búsquedas públicas: cuenta de puntos por DNI, gift card por código, pedidos por DNI
create or replace function public.public_entity_find(p_business_id text, p_kind text, p_value text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_dni text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
begin
  if not public._public_catalog_open(p_business_id) then return '[]'::jsonb; end if;
  if p_kind = 'catalog_loyalty_accounts' then
    if length(v_dni) < 6 then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(data), '[]'::jsonb) into v
      from public.catalog_loyalty_accounts where business_id = p_business_id and dni = v_dni;
  elsif p_kind = 'catalog_gift_cards' then
    select coalesce(jsonb_agg(data), '[]'::jsonb) into v
      from public.catalog_gift_cards where business_id = p_business_id and code = upper(btrim(p_value));
  elsif p_kind = 'catalog_orders' then
    if length(v_dni) < 6 then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(data order by created_at desc), '[]'::jsonb) into v
      from (select data, created_at from public.catalog_orders
             where business_id = p_business_id and customer_dni = v_dni
             order by created_at desc limit 50) o;
  else
    raise exception 'Tipo no permitido: %', p_kind;
  end if;
  return v;
end $$;

-- Escrituras públicas del catálogo, con reglas por tipo
create or replace function public.public_entity_put(p_business_id text, p_kind text, p_id text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb := coalesce(p_data, '{}'::jsonb) || jsonb_build_object('id', p_id, 'tenantId', p_business_id);
  v_protected text[] := array['status', 'linkedBoletaId', 'linkedBoletaNumber', 'stockDeducted',
    'stockRestoredAt', 'returnRecords', 'returnStatus', 'returnedAmount', 'dispatchedAt',
    'dispatchReceiptNumber', 'confirmedPaymentMethod', 'loyaltyPointsSettled'];
  k text;
begin
  if p_id is null or length(p_id) < 1 or length(p_id) > 160 then
    raise exception 'Identificador inválido.';
  end if;
  if not public._public_catalog_open(p_business_id) then
    raise exception 'El catálogo no está disponible.';
  end if;

  if p_kind = 'catalog_orders' then
    select data into v_old from public.catalog_orders where business_id = p_business_id and id = p_id;
    if v_old is not null then
      if v_old->>'status' in ('retirado', 'cancelado', 'devuelto')
         or coalesce(v_old->>'customerPhone', '') <> coalesce(v_new->>'customerPhone', '') then
        raise exception 'Este pedido ya no se puede modificar.';
      end if;
      -- El comprador no puede cambiar campos que maneja el comercio
      foreach k in array v_protected loop
        if v_old ? k then v_new := jsonb_set(v_new, array[k], v_old->k); else v_new := v_new - k; end if;
      end loop;
    else
      v_new := jsonb_set(v_new, '{status}', '"pendiente_retiro"') - 'linkedBoletaId' - 'linkedBoletaNumber' - 'stockDeducted';
      -- Pedido nuevo: descontar stock en el catálogo publicado (solo productos que controlan stock)
      update public.public_catalogs pc
         set snapshot = jsonb_set(pc.snapshot, '{products}', (
           select coalesce(jsonb_agg(
                    case when q.qty is not null and jsonb_typeof(p.value->'stockQuantity') = 'number'
                         then jsonb_set(p.value, '{stockQuantity}',
                                to_jsonb(greatest(0, (p.value->>'stockQuantity')::numeric - q.qty)))
                         else p.value end
                    order by p.ord), '[]'::jsonb)
             from jsonb_array_elements(pc.snapshot->'products') with ordinality as p(value, ord)
             left join (
               select it->>'productId' as pid, sum(public.safe_numeric(it->>'quantity')) as qty
                 from jsonb_array_elements(coalesce(v_new->'items', '[]'::jsonb)) it
                group by 1
             ) q on q.pid = p.value->>'id'))
       where pc.business_id = p_business_id and jsonb_typeof(pc.snapshot->'products') = 'array';
    end if;
    insert into public.catalog_orders (business_id, id, data) values (p_business_id, p_id, v_new)
    on conflict (business_id, id) do update set data = excluded.data;

  elsif p_kind = 'catalog_stock_alerts' then
    insert into public.catalog_stock_alerts (business_id, id, data) values (p_business_id, p_id, v_new)
    on conflict (business_id, id) do nothing;

  elsif p_kind = 'catalog_promo_subscribers' then
    insert into public.catalog_promo_subscribers (business_id, id, data) values (p_business_id, p_id, v_new)
    on conflict (business_id, id) do update set data = excluded.data
      where public.catalog_promo_subscribers.data->>'phone' = excluded.data->>'phone';

  elsif p_kind = 'catalog_loyalty_accounts' then
    select data into v_old from public.catalog_loyalty_accounts where business_id = p_business_id and id = p_id;
    if v_old is not null and regexp_replace(coalesce(v_old->>'dni', ''), '\D', '', 'g')
                          <> regexp_replace(coalesce(v_new->>'dni', ''), '\D', '', 'g') then
      raise exception 'El DNI no coincide con la cuenta.';
    end if;
    insert into public.catalog_loyalty_accounts (business_id, id, data) values (p_business_id, p_id, v_new)
    on conflict (business_id, id) do update set data = excluded.data;

  elsif p_kind = 'catalog_abandoned_carts' then
    insert into public.catalog_abandoned_carts (business_id, id, data) values (p_business_id, p_id, v_new)
    on conflict (business_id, id) do update set data = excluded.data;

  elsif p_kind = 'catalog_gift_cards' then
    -- Solo se puede descontar saldo de una gift card existente (canje)
    select data into v_old from public.catalog_gift_cards where business_id = p_business_id and id = p_id;
    if v_old is null then
      raise exception 'La gift card no existe.';
    end if;
    if public.safe_numeric(v_new->>'remainingBalance') is null
       or public.safe_numeric(v_new->>'remainingBalance') > public.safe_numeric(v_old->>'remainingBalance')
       or upper(v_new->>'code') <> upper(v_old->>'code') then
      raise exception 'Operación de gift card no permitida.';
    end if;
    update public.catalog_gift_cards set data = v_new where business_id = p_business_id and id = p_id;
  else
    raise exception 'Tipo no permitido: %', p_kind;
  end if;
  return v_new;
end $$;

-- Links de pago y órdenes de abono: lectura por token y actualización acotada
create or replace function public.public_payment_doc_get(p_kind text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if p_kind = 'payment_link' then
    select data into v from public.payment_links where token = p_token;
  elsif p_kind = 'subscription_order' then
    select data into v from public.subscription_pay_orders where token = p_token;
  else
    raise exception 'Tipo no permitido: %', p_kind;
  end if;
  return v;
end $$;

create or replace function public.public_payment_doc_patch(p_kind text, p_token text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_allowed text[] := array['status', 'paymentMethod', 'mpPaymentId', 'paidAt', 'verificationSummary',
    'receiptImageUrl', 'mpInitPoint', 'mpPreferenceId', 'verifiedViaReceipt', 'aliasUsed'];
  v_clean jsonb := '{}'::jsonb;
  k text;
begin
  foreach k in array v_allowed loop
    if p_patch ? k then v_clean := v_clean || jsonb_build_object(k, p_patch->k); end if;
  end loop;
  -- Solo se puede pasar de pendiente a aprobado, nunca volver atrás
  if v_clean ? 'status' and v_clean->>'status' not in ('approved', 'pending') then
    v_clean := v_clean - 'status';
  end if;

  if p_kind = 'payment_link' then
    select data into v_old from public.payment_links where token = p_token for update;
    if v_old is null then raise exception 'Orden de pago no encontrada.'; end if;
    if v_old->>'status' = 'approved' then return v_old; end if;
    update public.payment_links set data = v_old || v_clean where token = p_token;
  elsif p_kind = 'subscription_order' then
    select data into v_old from public.subscription_pay_orders where token = p_token for update;
    if v_old is null then raise exception 'Orden de pago no encontrada.'; end if;
    if v_old->>'status' = 'approved' then return v_old; end if;
    update public.subscription_pay_orders set data = v_old || v_clean where token = p_token;
    -- Al aprobarse, queda registrado el pago del abono de ese mes
    if v_clean->>'status' = 'approved' then
      insert into public.subscription_payments (business_id, month_key, data)
      select o.business_id, v_old->>'monthKey', jsonb_strip_nulls(jsonb_build_object(
               'tenantId', o.business_id, 'monthKey', v_old->>'monthKey',
               'amount', public.safe_numeric(v_old->>'amount'), 'status', 'approved',
               'planType', v_old->>'planType', 'planTier', v_old->>'planTier',
               'planTierLabel', v_old->>'planTierLabel', 'monthsCount', public.safe_numeric(v_old->>'monthsCount'),
               'paymentMethod', coalesce(v_clean->>'paymentMethod', 'mercadopago'),
               'mpPaymentId', v_clean->>'mpPaymentId', 'mpPreferenceId', v_old->>'mpPreferenceId',
               'paidAt', coalesce(v_clean->>'paidAt', to_char(now(), 'YYYY-MM-DD')),
               'aliasUsed', v_old->>'alias', 'receiptImageUrl', v_clean->>'receiptImageUrl',
               'verificationSummary', v_clean->>'verificationSummary'))
        from public.subscription_pay_orders o where o.token = p_token and coalesce(v_old->>'monthKey', '') <> ''
      on conflict (business_id, month_key) do update set data = excluded.data;
    end if;
  else
    raise exception 'Tipo no permitido: %', p_kind;
  end if;
  return v_old || v_clean;
end $$;

revoke all on function public.public_catalog_get(text) from public;
revoke all on function public.public_entity_get(text, text, text) from public;
revoke all on function public.public_entity_find(text, text, text) from public;
revoke all on function public.public_entity_put(text, text, text, jsonb) from public;
revoke all on function public.public_payment_doc_get(text, text) from public;
revoke all on function public.public_payment_doc_patch(text, text, jsonb) from public;
revoke all on function public._public_catalog_open(text) from public, anon, authenticated;
revoke all on function public._business_catalog_enabled(text) from public, anon, authenticated;
grant execute on function public.public_catalog_get(text) to anon, authenticated;
grant execute on function public.public_entity_get(text, text, text) to anon, authenticated;
grant execute on function public.public_entity_find(text, text, text) to anon, authenticated;
grant execute on function public.public_entity_put(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.public_payment_doc_get(text, text) to anon, authenticated;
grant execute on function public.public_payment_doc_patch(text, text, jsonb) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 11. Purga de 30 días en el servidor
--   · Solo borra boletas PAGADAS cuyo pago tiene más días que la retención.
--   · Las boletas impagas NUNCA se borran.
--   · Antes de borrar, suma el resultado a la ficha de riesgo del cliente
--     (creditHistory), que se conserva para siempre.
-- -----------------------------------------------------------------------------

create or replace function public.run_retention_purge(p_business_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  biz record;
  b record;
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_days int;
  v_alert_days int;
  v_term int;
  v_late boolean;
  v_count int;
  v_total int := 0;
  v_hist jsonb;
  v_result jsonb := '[]'::jsonb;
begin
  -- Desde el navegador (rol anon/authenticated) solo se puede purgar el propio comercio.
  -- El cron del servidor corre sin usuario y purga todos.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if p_business_id is null or not public.can_manage_business(p_business_id) then
      raise exception 'No tenés permiso para ejecutar la depuración.';
    end if;
  end if;

  for biz in
    select bz.id, coalesce(bs.config, '{}'::jsonb) as config
      from public.businesses bz
      left join public.business_settings bs on bs.business_id = bz.id
     where p_business_id is null or bz.id = p_business_id
  loop
    v_days := greatest(coalesce(public.safe_numeric(biz.config->>'boletaRetentionDays')::int, 30), 1);
    v_alert_days := greatest(coalesce(public.safe_numeric(biz.config->>'saleAlertModeDays')::int, 10), 1);
    v_count := 0;

    for b in
      select bo.id, bo.data, bo.client_id, bo.sale_date, bo.paid_at
        from public.boletas bo
       where bo.business_id = biz.id
         and bo.status = 'paid'
         and coalesce(bo.paid_at, public.safe_date(bo.data->>'createdAt')) < v_today - v_days
    loop
      v_term := coalesce(public.safe_numeric(b.data->>'termDays')::int, 7);
      v_late := b.paid_at is not null and b.sale_date is not null and (b.paid_at - b.sale_date) > v_term + 3;

      update public.clients c
         set data = jsonb_set(c.data, '{creditHistory}',
               coalesce(c.data->'creditHistory', jsonb_build_object(
                 'reputationStatus', 'confiable', 'totalHistoricalBoletas', 0, 'totalPaidOnTime', 0,
                 'totalLatePayments', 0, 'totalPurgedUnpaid', 0, 'totalPurgedDebtAmount', 0,
                 'purgedBoletas', '[]'::jsonb))
               || jsonb_build_object(
                    case when v_late then 'totalLatePayments' else 'totalPaidOnTime' end,
                    coalesce(public.safe_numeric(c.data->'creditHistory'->>(case when v_late then 'totalLatePayments' else 'totalPaidOnTime' end)), 0) + 1,
                    'lastEvaluatedAt', v_now))
       where c.business_id = biz.id and c.id = b.client_id;

      delete from public.boletas where business_id = biz.id and id = b.id;
      v_count := v_count + 1;
    end loop;

    -- Recalcular la ficha de riesgo de todos los clientes del comercio
    update public.clients c
       set data = jsonb_set(c.data, '{creditHistory}', h.hist)
      from (
        select c2.id,
               coalesce(c2.data->'creditHistory', '{}'::jsonb) || jsonb_build_object(
                 'reputationStatus',
                 case
                   when exists (select 1 from public.boletas p
                                 where p.business_id = biz.id and p.client_id = c2.id
                                   and p.status = 'pending' and p.sale_date <= v_today - v_alert_days)
                        or coalesce(public.safe_numeric(c2.data->'creditHistory'->>'totalPurgedUnpaid'), 0) > 0
                     then 'problematico'
                   when coalesce(public.safe_numeric(c2.data->'creditHistory'->>'totalLatePayments'), 0) > 2
                     then 'regular'
                   else 'confiable'
                 end,
                 'lastEvaluatedAt', v_now) as hist
          from public.clients c2
         where c2.business_id = biz.id
      ) h
     where c.business_id = biz.id and c.id = h.id
       and (c.data->'creditHistory'->>'reputationStatus') is distinct from (h.hist->>'reputationStatus');

    if v_count > 0 then
      update public.business_settings
         set config = config || jsonb_build_object(
               'lastRetentionPurgeDate', to_char(v_today, 'YYYY-MM-DD'),
               'totalPurgedBoletasCount', coalesce(public.safe_numeric(config->>'totalPurgedBoletasCount'), 0) + v_count)
       where business_id = biz.id;
    end if;

    insert into public.retention_runs (business_id, purged_count, details)
      values (biz.id, v_count, jsonb_build_object('retentionDays', v_days));
    v_total := v_total + v_count;
    v_result := v_result || jsonb_build_object('businessId', biz.id, 'purged', v_count);
  end loop;

  return jsonb_build_object('purgedTotal', v_total, 'businesses', v_result);
end $$;

revoke all on function public.run_retention_purge(text) from public, anon;
grant execute on function public.run_retention_purge(text) to authenticated;

-- Programar la purga todos los días a las 03:17 (hora de Argentina = 06:17 UTC).
-- Requiere la extensión pg_cron (Database → Extensions → pg_cron). Si no está,
-- este bloque solo avisa y sigue.
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'rf-retention-purge') then
    perform cron.unschedule('rf-retention-purge');
  end if;
  perform cron.schedule('rf-retention-purge', '17 6 * * *', 'select public.run_retention_purge()');
exception when others then
  raise notice 'pg_cron no disponible (%). Activalo en Database → Extensions y volvé a correr este bloque.', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 12. Tiempo real (para que dueño y vendedores vean los cambios al instante)
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['businesses', 'business_settings', 'clients', 'salespeople', 'administrators',
    'boletas', 'rendiciones', 'broadcasts', 'dispatch_logs', 'catalog_products', 'catalog_orders',
    'catalog_stock_alerts', 'catalog_promo_subscribers', 'catalog_loyalty_accounts',
    'catalog_abandoned_carts', 'catalog_gift_cards', 'announcements', 'profiles'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when others then
  raise notice 'No se pudo configurar Realtime (%).', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 13. Tu usuario superadmin
--   Registrate primero desde la app (o creá el usuario en Authentication → Users)
--   y después corré, cambiando el email:
--
--   insert into public.profiles (id, role, full_name, email)
--   select id, 'superadmin', 'Administrador', email from auth.users where email = 'TU_EMAIL'
--   on conflict (id) do update set role = 'superadmin', business_id = null;
-- -----------------------------------------------------------------------------
