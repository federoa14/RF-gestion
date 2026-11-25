# Puesta en marcha: lo que tenés que hacer vos

Hacelo **en este orden**. Hasta el paso 9, la versión publicada en Vercel sigue siendo la vieja.

> **Estado de tu proyecto "RF Gestion" en Supabase** (hecho con la herramienta de Supabase, sin pasos manuales tuyos):
> esquema nuevo, datos copiados desde la tabla vieja, cuentas de Auth creadas, las 9 Edge Functions publicadas,
> clave del cron generada dentro de Vault, y los cron de WhatsApp, respaldo semanal y depuración programados.
> Lo que sigue pendiente es **D (Vercel)**, **E (WhatsApp de cada comercio)** y **F (cierre de la tabla vieja)**.
> Los pasos A y B de abajo quedan como referencia para otro proyecto.

## A. Supabase (panel web)
1. **Respaldo:** Database → Backups, o desde la app vieja: Ajustes → Exportar respaldo.
2. **Extensiones:** Database → Extensions → activar `pg_cron` y `pg_net`.
3. **SQL Editor:** correr, en este orden:
   1. `supabase/schema_v2.sql`
   2. `supabase/migrate_legacy.sql` (muestra un resumen de lo migrado)
4. **Vault:** en el SQL Editor, cambiando `TU-PROYECTO` y la clave:
   ```sql
   select vault.create_secret('https://TU-PROYECTO.supabase.co/functions/v1', 'rf_functions_url');
   select vault.create_secret('UNA-CLAVE-LARGA-AL-AZAR', 'rf_cron_secret');
   ```
5. **SQL Editor:** correr `supabase/whatsapp.sql` y después `supabase/monitoring.sql` (registro de errores y respaldo semanal).
6. **Authentication → URL Configuration:**
   - *Site URL* = tu dominio de Vercel.
   - *Redirect URLs* = agregar `https://TU-DOMINIO/?recuperar=1`.

## B. Edge Functions (desde tu PC, con la CLI de Supabase)
```bash
supabase login
```
```bash
supabase link --project-ref TU-PROJECT-REF
```
```bash
supabase secrets set CRON_SECRET="LA-MISMA-CLAVE-DEL-PASO-A4"
```
```bash
supabase functions deploy auth-login --no-verify-jwt
```
```bash
supabase functions deploy whatsapp-dispatch --no-verify-jwt
```
```bash
supabase functions deploy admin-users whatsapp-connect mp-test-connection mp-create-preference mp-verify-payment mp-webhook weekly-backup
```

## C. Usuarios
7. Migrar las cuentas viejas a Supabase Auth, desde la carpeta del proyecto. La service role key está en Supabase → Settings → API, y **nunca** va en Vercel:
   ```bash
   SUPABASE_URL="https://TU-PROYECTO.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." node scripts/migrate-legacy-users.mjs
   ```
   - Se genera `usuarios-migrados.csv` con claves temporales: compartilas y borrá el archivo.
8. Tu superadmin: registrate en la app y después corré esto en el SQL Editor:
   ```sql
   insert into public.profiles (id, role, full_name, email)
   select id, 'superadmin', 'Administrador', email from auth.users where email = 'TU_EMAIL'
   on conflict (id) do update set role = 'superadmin', business_id = null;
   ```

## D. Vercel
9. Confirmar que estén `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ya existen).
10. Mergear la rama `claude/relaxed-brown-b4pskm` a `main` (o publicarla como preview primero) para desplegar.

## E. WhatsApp (cada comercio)
11. Seguir la Parte 2 de `docs/WHATSAPP-META.md`: cuenta comercial, número, plantillas y token permanente.
12. En la app: WhatsApp Automático → **Conectar WhatsApp Business**.

## F. Cierre
13. Cuando todo ande, correr el **PASO C** (comentado al final de `supabase/migrate_legacy.sql`). Cierra la tabla vieja, que hoy es legible por cualquiera.
14. Opcional: borrar las contraseñas viejas en el SQL Editor:
    ```sql
    update public.legacy_users set data = data - 'password';
    ```

---

# Pruebas manuales

Usá dos dispositivos: por ejemplo, la PC del dueño y el celular de un vendedor.

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Entrar como dueño con email y contraseña. Entrar con una clave incorrecta. | Entra. Con la clave mala dice "Usuario o contraseña incorrectos". |
| 2 | Desde el panel de Superadmin, crear un usuario vendedor para el comercio (usuario y clave de 6 o más caracteres). Entrar en el celular con **usuario + código de empresa**. | El vendedor entra y ve los mismos clientes y boletas. |
| 3 | En el celular (360 px): **Cargar boleta** para un cliente, con fecha de venta de hace 11 días (o cambiá *Modo alerta* en Ajustes para que caiga hoy). | El formulario ocupa la pantalla, "Guardar" queda fijo abajo y el teclado de montos es numérico. |
| 4 | Mirar la PC del dueño **sin recargar**. | La boleta aparece en segundos (tiempo real). |
| 5 | WhatsApp Automático → **Probar envío ahora** (con WhatsApp conectado y las plantillas aprobadas). | Llega la hoja de ruta al vendedor y la alerta al dueño. El historial "Envíos por WhatsApp Business (servidor)" muestra "Enviado". |
| 6 | Esperar al día siguiente a las 08:00. | Llega el envío matutino sin que nadie abra la app. Se ve en el historial con origen "cron". |
| 7 | Registrar un **pago parcial** y después **cobrar** la boleta. | Pasa al Historial de Pagadas en los dos dispositivos. |
| 8 | **Enviar cierre ahora** (o esperar a las 19:00). | Al dueño le llega el cierre con efectivo, transferencia y total. |
| 9 | Desactivar el wifi del celular, cargar o cobrar algo, y volver a conectarlo. | Aparece "Sin conexión…" con los cambios pendientes. Al volver la conexión se guardan solos. |
| 10 | Abrir el link de la tienda pública en el celular, agregar productos y bajar hasta el final. | La barra "Finalizar pedido" no tapa ningún botón. Los productos sin foto muestran un placeholder. "Acceso para el comercio" está en el pie. |
| 11 | Hacer un pedido en la tienda. | Aparece en Catálogo → Pedidos y en Historial Ventas Web, y el stock baja. |
| 12 | Cargar un producto con precio 0 o con stock 2,5. | No deja guardar y marca el error junto al campo. |
| 13 | "¿Olvidaste tu contraseña?" con un email real. | Llega el correo. El link abre el formulario de nueva clave y después se puede entrar. |
| 14 | Ajustes → **Ejecutar depuración ahora**. | Solo desaparecen boletas **pagadas** hace más de 30 días. Las impagas siguen y la ficha del cliente se mantiene. |
| 15 | En otro navegador, sin sesión, intentar ver datos de un comercio. | No se puede: solo se ven la tienda pública y los links de pago. |
| 16 | Catálogo → **Pedidos y ventas** → Pedidos Recibidos: filtrar por estado, buscar un cliente y abrir el menú **Más** de un pedido. | Cada pedido se ve como una ficha: número, fecha, estado y total arriba, la tabla de productos con subtotales y las acciones abajo. |
| 17 | Con Plan 3: Catálogo → Configuración → **Diseño de tu tienda**. Elegir otra paleta, letra y estilo de tarjetas, guardar y abrir la tienda. | La vista previa cambia al instante y la tienda pública queda con el diseño elegido. Con Plan 2 aparece el candado y la tienda sigue con el diseño estándar. |
| 18 | Superadmin → **Errores de la app**. | Muestra los errores de los últimos 30 días (si no hubo, dice "Sin errores registrados"). |
| 19 | Ajustes → **Respaldos automáticos** → "Hacer un respaldo ahora". | Aparece el respaldo de hoy en la lista y se puede descargar. Los domingos se hace solo. |
