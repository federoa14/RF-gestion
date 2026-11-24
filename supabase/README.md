# Migración a Supabase (Fase 3)

Desde esta versión, **todos los datos viven en Supabase** con Supabase Auth y
Row Level Security: cada comercio solo ve y modifica lo suyo (`business_id`),
y el dueño y los vendedores ven lo mismo desde cualquier dispositivo.

> ⚠️ Hacé los pasos **en orden**. Hasta el paso 6 la app vieja sigue andando.

## Archivos

| Archivo | Qué es |
|---|---|
| `schema_v2.sql` | Tablas, índices, RLS, funciones públicas, purga de 30 días y cron. Idempotente. |
| `migrate_legacy.sql` | Copia los datos de la tabla vieja `app_cloud_store` a las tablas nuevas, sin borrar ni pisar nada. |
| `../scripts/migrate-legacy-users.mjs` | Crea las cuentas de Supabase Auth de los usuarios viejos. Se corre una vez desde tu PC. |
| `functions/auth-login` | Entrar con **usuario + código de empresa** (para quien no tiene email). |
| `functions/admin-users` | Alta, edición y baja de usuarios desde los paneles. |
| `functions/mp-*` | Mercado Pago, ahora leyendo los tokens de `business_secrets` / `platform_secrets`. |

## Pasos

1. **Respaldo.** Supabase → Database → Backups (o descargá un respaldo desde la app vieja: Ajustes → Exportar respaldo).
2. **Extensión pg_cron.** Database → Extensions → activar `pg_cron` (para la purga automática nocturna).
3. **Esquema.** SQL Editor → pegar `schema_v2.sql` → Run.
4. **Datos.** SQL Editor → pegar `migrate_legacy.sql` → Run. Muestra un resumen con la cantidad de filas por tabla.
5. **Usuarios.** Desde tu PC, en la carpeta del proyecto:
   ```bash
   SUPABASE_URL="https://TU-PROYECTO.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." node scripts/migrate-legacy-users.mjs
   ```
   Genera `usuarios-migrados.csv` con contraseñas temporales (solo para quienes tenían una clave de menos de 6 caracteres). Pasáselas a cada uno y **borrá el archivo**.
6. **Tu superadmin.** Registrate en la app (o creá el usuario en Authentication → Users) y corré en el SQL Editor, con tu email:
   ```sql
   insert into public.profiles (id, role, full_name, email)
   select id, 'superadmin', 'Administrador', email from auth.users where email = 'TU_EMAIL'
   on conflict (id) do update set role = 'superadmin', business_id = null;
   ```
7. **Edge Functions.** Con la CLI de Supabase:
   ```bash
   supabase functions deploy auth-login --no-verify-jwt
   ```
   ```bash
   supabase functions deploy admin-users
   ```
   ```bash
   supabase functions deploy mp-create-preference mp-verify-payment mp-webhook
   ```
   (`auth-login` va sin verificación de JWT porque se usa antes de iniciar sesión.)
8. **Auth.** Authentication → URL Configuration → *Site URL* = la URL de Vercel, y agregá `https://TU-DOMINIO/?recuperar=1` en *Redirect URLs* (link de recuperar contraseña).
9. **Vercel.** Variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ya existentes) → redeploy.
10. **Datos que estaban solo en un celular o PC.** Al entrar desde ese dispositivo, el dueño o un administrador ve el aviso *"Subir datos a la nube"*: agrega lo que falte sin pisar nada.
11. **Cerrar la tabla vieja.** Cuando verifiques que todo anda, corré el bloque *PASO C* (comentado al final de `migrate_legacy.sql`). Hoy `app_cloud_store` es legible por cualquiera con la clave anon (incluye tokens de Mercado Pago y contraseñas viejas).

## Cómo entra cada usuario

- Con **email + contraseña** si tiene email cargado.
- Con **usuario + código de empresa + contraseña** si no tiene email.
- "¿Olvidaste tu contraseña?" manda un link al email. Quien no tiene email le pide al dueño o al administrador que le cambie la clave.

## Qué hace el servidor solo

- **Purga de 30 días** (`run_retention_purge`, todas las noches a las 03:17 de Argentina): borra únicamente boletas **pagadas** hace más de 30 días. Las impagas nunca se borran. Antes de borrar, suma el resultado a la ficha de riesgo del cliente (`creditHistory`), que se conserva para siempre. Cada corrida queda en `retention_runs`.
- **Catálogo público, links de pago y abonos**: el público entra solo por funciones acotadas (`public_*`), nunca leyendo tablas.
