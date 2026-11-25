-- Oficina virtual de RF Gestiones (pestaña «Oficina» del panel superadmin).
-- Solo el superadmin puede leer o escribir. El público (anon) no tiene acceso.
-- No toca ni lee datos de los comercios. Se puede correr más de una vez.

create table if not exists public.oficina_tareas (
  id           text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  titulo       text not null check (char_length(titulo) between 1 and 200),
  descripcion  text not null default '' check (char_length(descripcion) <= 5000),
  prioridad    text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  estado       text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'completada', 'bloqueada')),
  departamento text not null default 'sin_asignar',
  entrega_a    text,
  origen       text not null default 'presidente',
  rutina       text,
  desde        text,
  entregado    boolean not null default false,
  resultado    text not null default '' check (char_length(resultado) <= 5000),
  escalada     jsonb,
  creada       timestamptz not null default now(),
  iniciada     timestamptz,
  completada   timestamptz
);

create table if not exists public.oficina_log (
  id      bigint generated always as identity primary key,
  ts      timestamptz not null default now(),
  accion  text not null,
  mensaje text not null check (char_length(mensaje) <= 1000)
);

-- Una sola fila: interruptor de redes sociales.
create table if not exists public.oficina_redes (
  id            int primary key default 1 check (id = 1),
  pausada       boolean not null default false,
  limite_por_dia int not null default 2 check (limite_por_dia between 0 and 20),
  conectadas    jsonb not null default '[]'::jsonb
);
insert into public.oficina_redes (id) values (1) on conflict (id) do nothing;

alter table public.oficina_tareas enable row level security;
alter table public.oficina_log    enable row level security;
alter table public.oficina_redes  enable row level security;

drop policy if exists oficina_tareas_superadmin on public.oficina_tareas;
create policy oficina_tareas_superadmin on public.oficina_tareas
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists oficina_log_superadmin on public.oficina_log;
create policy oficina_log_superadmin on public.oficina_log
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists oficina_redes_superadmin on public.oficina_redes;
create policy oficina_redes_superadmin on public.oficina_redes
  for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

revoke all on public.oficina_tareas, public.oficina_log, public.oficina_redes from anon;
