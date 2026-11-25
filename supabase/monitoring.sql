-- =============================================================================
-- RF Gestión · Registro de errores de la app y respaldo semanal
-- Correr en el SQL Editor DESPUÉS de schema_v2.sql y whatsapp.sql.
-- Se puede volver a correr sin problema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Errores de la app (los reporta el navegador; solo el superadmin los lee)
-- -----------------------------------------------------------------------------

create table if not exists public.app_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  business_id text,
  user_id uuid,
  source text not null default 'panel',      -- 'panel' | 'tienda'
  message text not null,
  stack text,
  url text,
  user_agent text,
  fingerprint text not null,                 -- agrupa errores iguales
  occurrences integer not null default 1,
  last_seen_at timestamptz not null default now()
);
create index if not exists app_errors_last_seen_idx on public.app_errors (last_seen_at desc);
create unique index if not exists app_errors_fingerprint_day_idx
  on public.app_errors (fingerprint, ((created_at at time zone 'utc')::date));

alter table public.app_errors enable row level security;
drop policy if exists app_errors_superadmin_read on public.app_errors;
create policy app_errors_superadmin_read on public.app_errors
  for select using (public.is_superadmin());
drop policy if exists app_errors_superadmin_delete on public.app_errors;
create policy app_errors_superadmin_delete on public.app_errors
  for delete using (public.is_superadmin());
-- Nadie escribe directo: solo con la función de abajo. Leer y borrar: solo el superadmin (RLS)
revoke all on public.app_errors from anon, authenticated;
grant select, delete on public.app_errors to authenticated;

create or replace function public.report_client_error(
  p_message text, p_stack text default null, p_url text default null,
  p_source text default 'panel', p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_message text := left(coalesce(nullif(trim(p_message), ''), 'Error sin mensaje'), 500);
  v_source text := case when p_source = 'tienda' then 'tienda' else 'panel' end;
  v_fp text;
begin
  -- Freno contra abusos: como mucho 300 errores distintos por hora en toda la plataforma
  if (select count(*) from public.app_errors where created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  v_fp := md5(v_source || '|' || v_message);
  insert into public.app_errors (business_id, user_id, source, message, stack, url, user_agent, fingerprint)
  values (public.auth_business_id(), auth.uid(), v_source, v_message,
          left(p_stack, 4000), left(p_url, 500), left(p_user_agent, 300), v_fp)
  on conflict (fingerprint, ((created_at at time zone 'utc')::date)) do update
    set occurrences = public.app_errors.occurrences + 1,
        last_seen_at = now();
end;
$$;
revoke all on function public.report_client_error(text, text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text, text) to anon, authenticated;

-- Se borran solos a los 30 días
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rf_app_errors_cleanup';
    perform cron.schedule('rf_app_errors_cleanup', '17 4 * * *',
      $job$ delete from public.app_errors where last_seen_at < now() - interval '30 days' $job$);
  end if;
end $$;
