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

-- -----------------------------------------------------------------------------
-- 2. Respaldo semanal automático (Edge Function weekly-backup)
--    Un JSON por comercio en Storage → bucket privado "backups", carpeta <business_id>.
--    Se guardan los últimos 8 (unos 2 meses). Los tokens nunca se incluyen.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do update set public = false;

-- Dueños y administradores pueden descargar los respaldos de SU comercio; el superadmin, todos.
-- Escribir y borrar: solo la función (con la service role key).
drop policy if exists rf_backups_read on storage.objects;
create policy rf_backups_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'backups'
    and (
      public.is_superadmin()
      or ((storage.foldername(name))[1] = public.auth_business_id()
          and public.auth_role() in ('dueño', 'administrador'))
    )
  );

-- Todos los domingos a las 03:23 (hora de Argentina = 06:23 UTC).
-- Usa los mismos secretos de Vault que el cron de WhatsApp (rf_functions_url y rf_cron_secret).
do $$
begin
  create extension if not exists pg_net;
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'rf-weekly-backup') then
    perform cron.unschedule('rf-weekly-backup');
  end if;
  perform cron.schedule(
    'rf-weekly-backup',
    '23 6 * * 0',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'rf_functions_url') || '/weekly-backup',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rf_cron_secret')
        ),
        body := '{"mode":"cron"}'::jsonb,
        timeout_milliseconds := 300000
      );
    $job$
  );
exception when others then
  raise notice 'No se pudo programar el respaldo semanal (%). Activá pg_cron y pg_net y volvé a correr este bloque.', sqlerrm;
end $$;

-- Ver los respaldos guardados:
--   select name, created_at from storage.objects where bucket_id = 'backups' order by created_at desc limit 50;
