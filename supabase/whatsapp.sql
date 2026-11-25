-- =============================================================================
-- RF GESTIÓN · FASE 4 · WHATSAPP BUSINESS CLOUD API (envíos desde el servidor)
-- -----------------------------------------------------------------------------
-- Requisitos: haber corrido supabase/schema_v2.sql.
-- Es idempotente: se puede volver a correr.
--
-- Qué crea:
--   · whatsapp_messages: registro de CADA envío (evita duplicados con dedupe_key,
--     guarda historial y errores de Meta). Los comercios solo pueden LEER lo suyo;
--     solo la Edge Function (service role) escribe.
--   · Credenciales de WhatsApp Business POR COMERCIO (opción B: cada comercio
--     usa su propio número) en business_secrets, sin acceso desde el navegador.
--     Se cargan desde la app con la Edge Function whatsapp-connect, que las
--     valida contra Meta antes de guardarlas.
--   · Limpia de la configuración de los comercios los tokens de WhatsApp/Twilio/
--     webhook que antes viajaban al navegador.
--   · Programa el cron cada 15 minutos que llama a la Edge Function
--     whatsapp-dispatch (ver PASO B al final: hay que cargar 2 secretos en Vault).
-- =============================================================================

create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  business_id text not null references public.businesses (id) on delete cascade,
  run_date date not null,
  kind text not null check (kind in ('vendor_route', 'owner_alerts', 'daily_closing', 'client_overdue')),
  recipient_role text not null check (recipient_role in ('vendedor', 'dueño', 'cliente')),
  recipient_name text not null default '',
  recipient_phone text not null,
  template text not null,
  variables jsonb not null default '[]'::jsonb,
  preview text not null default '',
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  wa_message_id text,
  error text,
  trigger text not null default 'cron' check (trigger in ('cron', 'manual')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists whatsapp_messages_business_idx
  on public.whatsapp_messages (business_id, created_at desc);
create index if not exists whatsapp_messages_status_idx
  on public.whatsapp_messages (status, run_date);

alter table public.whatsapp_messages enable row level security;
drop policy if exists whatsapp_messages_read on public.whatsapp_messages;
create policy whatsapp_messages_read on public.whatsapp_messages for select to authenticated
  using (public.can_access_business(business_id));
revoke insert, update, delete on public.whatsapp_messages from anon, authenticated;
grant select on public.whatsapp_messages to authenticated;

-- Credenciales de WhatsApp Business de cada comercio (solo service role)
alter table public.business_secrets
  add column if not exists wa_access_token text,
  add column if not exists wa_phone_number_id text,
  add column if not exists wa_template_lang text,
  add column if not exists wa_display_phone text,
  add column if not exists wa_connected_at timestamptz;

-- Tokens de WhatsApp que antes se guardaban en la configuración del comercio
-- (y llegaban al navegador): se eliminan. Ahora cada comercio conecta su número
-- desde la app y el token queda en business_secrets.
update public.business_settings
   set config = config - 'whatsappApiToken' - 'whatsappPhoneNumberId' - 'twilioAccountSid'
                       - 'twilioAuthToken' - 'twilioFromPhone' - 'webhookGatewayUrl' - 'webhookAuthKey'
 where config ?| array['whatsappApiToken', 'whatsappPhoneNumberId', 'twilioAccountSid',
                       'twilioAuthToken', 'twilioFromPhone', 'webhookGatewayUrl', 'webhookAuthKey'];

update public.businesses
   set data = jsonb_set(data, '{config}', (data->'config') - 'whatsappApiToken' - 'whatsappPhoneNumberId'
                       - 'twilioAccountSid' - 'twilioAuthToken' - 'twilioFromPhone' - 'webhookGatewayUrl' - 'webhookAuthKey')
 where jsonb_typeof(data->'config') = 'object'
   and (data->'config') ?| array['whatsappApiToken', 'whatsappPhoneNumberId', 'twilioAccountSid',
                                 'twilioAuthToken', 'twilioFromPhone', 'webhookGatewayUrl', 'webhookAuthKey'];

-- Realtime para ver el historial de envíos al instante
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages') then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
exception when others then
  raise notice 'No se pudo configurar Realtime (%).', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- PASO B · Cron cada 15 minutos
-- Cada comercio tiene su horario (por defecto 08:00 matutino y 19:00 cierre,
-- hora de Argentina). La función revisa en cada pasada quién ya está en horario
-- y no recibió su mensaje de hoy; whatsapp_messages evita duplicados.
--
-- Antes de correr este bloque, cargá 2 secretos en Vault (SQL Editor), cambiando
-- TU-PROYECTO y el texto secreto (el mismo que pongas en CRON_SECRET de la función):
--
--   select vault.create_secret('https://TU-PROYECTO.supabase.co/functions/v1', 'rf_functions_url');
--   select vault.create_secret('UNA-CLAVE-LARGA-Y-AL-AZAR', 'rf_cron_secret');
-- -----------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'rf-whatsapp-dispatch') then
    perform cron.unschedule('rf-whatsapp-dispatch');
  end if;
  perform cron.schedule(
    'rf-whatsapp-dispatch',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'rf_functions_url') || '/whatsapp-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rf_cron_secret')
        ),
        body := '{"mode":"cron"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
exception when others then
  raise notice 'No se pudo programar el cron de WhatsApp (%). Activá pg_cron y pg_net en Database → Extensions y volvé a correr este bloque.', sqlerrm;
end $$;

-- Ver las últimas ejecuciones del cron:
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'rf-whatsapp-dispatch') order by start_time desc limit 10;
-- Ver los últimos envíos y errores:
--   select created_at, business_id, kind, recipient_name, status, error from public.whatsapp_messages order by id desc limit 50;
