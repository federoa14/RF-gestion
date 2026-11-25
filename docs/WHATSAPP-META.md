# WhatsApp Business Cloud API (Meta): guía paso a paso

Desde la Fase 4, los envíos automáticos (hoja de ruta a los vendedores, alertas al dueño y cierre del día) **salen del servidor** por la API oficial de WhatsApp Business, nunca desde el navegador.

Usamos la **opción B**: **cada comercio conecta su propio número**. Los mensajes les llegan a sus vendedores y dueños desde el WhatsApp del comercio.

---

## Parte 1 · Lo que hacés vos, una sola vez (plataforma)

### 1. Base de datos
1. Supabase → Database → Extensions: activar **pg_cron** y **pg_net**.
2. SQL Editor: cargar los 2 secretos en Vault. Reemplazá `TU-PROYECTO` y elegí una clave larga al azar:
   ```sql
   select vault.create_secret('https://TU-PROYECTO.supabase.co/functions/v1', 'rf_functions_url');
   select vault.create_secret('PEGÁ-ACÁ-UNA-CLAVE-LARGA-AL-AZAR', 'rf_cron_secret');
   ```
3. SQL Editor: pegar y correr `supabase/whatsapp.sql`.

### 2. Edge Functions
```bash
supabase secrets set CRON_SECRET="LA-MISMA-CLAVE-DEL-PASO-ANTERIOR"
```
```bash
supabase functions deploy whatsapp-dispatch --no-verify-jwt
```
```bash
supabase functions deploy whatsapp-connect mp-test-connection
```
- `whatsapp-dispatch` va sin verificación de JWT porque la llama el cron. Igual verifica `CRON_SECRET`, y en los envíos manuales valida la sesión del usuario.

### 3. Variables de entorno: qué va y dónde

| Variable | Dónde se carga | ¿Obligatoria? | Para qué |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel → Settings → Environment Variables | Sí (ya están) | Conexión de la app |
| `CRON_SECRET` | Supabase → Edge Functions → Secrets | Sí | Que solo el cron dispare los envíos programados |
| `WHATSAPP_API_VERSION` | Supabase → Edge Functions → Secrets | No (por defecto `v21.0`) | Versión de la Graph API |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_LANG` | Supabase → Edge Functions → Secrets | No | Número **de respaldo** de la plataforma para comercios que no conectaron el suyo |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | Supabase → Edge Functions → Secrets | No | Mercado Pago de la plataforma (alternativa a cargarlo desde el panel) |

- **Nunca** pongas tokens en variables `VITE_…`: esas viajan al navegador.
- Los tokens de **cada comercio** (WhatsApp y Mercado Pago) se cargan desde la app y quedan en la tabla `business_secrets`, que el navegador no puede leer.

### 4. Horarios
- **Cron:** corre cada 15 minutos.
- **Horario de cada comercio:** sale de *WhatsApp Automático → Parámetros*. Por defecto: **08:00** matutino y **19:00** cierre, hora de Argentina (`America/Argentina/Buenos_Aires`).
- **Si el cron estuvo caído:** el matutino sale igual ese día, hasta la hora del cierre.
- **Sin duplicados:** la tabla `whatsapp_messages` guarda cada envío y evita mandar dos veces lo mismo.

---

## Parte 2 · Lo que hace cada comercio en Meta (unos 30 minutos)

> Pasale esta parte a cada dueño, o hacela con él la primera vez.

### 1. Cuenta comercial y app
1. Entrar a **business.facebook.com** y crear (o usar) una **cuenta comercial de Meta** con los datos reales del comercio.
2. Entrar a **developers.facebook.com** → *Mis apps* → **Crear app** → tipo **Empresa (Business)** → elegir la cuenta comercial.
3. En la app, agregar el producto **WhatsApp**. Meta crea una cuenta de WhatsApp Business y un número de prueba.

### 2. Número propio
1. WhatsApp → **Configuración de la API** → *Agregar número de teléfono*.
2. Usar un número que **no esté activo en la app de WhatsApp** del celular. Si lo está, hay que borrar esa cuenta primero.
3. Verificarlo con el código por SMS o llamada.
4. Completar el **nombre visible**. Meta lo revisa: tiene que coincidir con el comercio.
5. **Verificar la empresa:** Configuración del negocio → *Centro de seguridad* → **Verificación de la empresa**. Sin verificar, Meta limita la cantidad de mensajes por día.
6. **Método de pago:** cargar una tarjeta en la cuenta de WhatsApp. Cada conversación iniciada por el comercio tiene costo según la tarifa de Meta para Argentina.

### 3. Plantillas (WhatsApp Manager → Plantillas de mensajes → Crear)
- **Categoría:** *Utilidad*.
- **Idioma:** *Español (ARG)*, código `es_AR`. Si se elige *Español*, en la app hay que seleccionar `es`.
- **Nombres:** copiar los nombres **exactos** y los textos con las variables `{{1}}`, `{{2}}`…
- **Ejemplos:** Meta pide un ejemplo para cada variable. Sirven los de abajo.

**`hoja_ruta_vendedor`**
> Hola {{1}}, esta es tu hoja de ruta de cobranzas de hoy para {{2}}: {{3}} boleta(s) por un total de {{4}}. Detalle: {{5}}. Ingresá a la app para ver direcciones y registrar los cobros.

Ejemplos: `Juan` · `Distribuidora Uno` · `3` · `$ 25.000` · `Almacén A $ 8.000 (16d) · Kiosco B $ 5.000 (3d)`

**`alerta_cobranza_duenio`**
> Hola {{1}}, resumen de cobranzas pendientes de {{2}} al {{3}}: {{4}}. Total en riesgo: {{5}}. Revisá el detalle en la app.

Ejemplos: `Carlos` · `Distribuidora Uno` · `25/11/2026` · `2 con 6+ días desde la venta · 1 en modo alerta (10+ días) · 1 en alerta crítica (15+ días)` · `$ 40.000`

Los días (6, 10 y 15) **no** van fijos en la plantilla: salen de *Ajustes → Avisos según los días desde la venta*.

**`cierre_del_dia`**
> Hola {{1}}, cierre del día {{2}} de {{3}}: cobrado en efectivo {{4}}, por transferencia {{5}}, total {{6}}. Quedan {{7}} boleta(s) impagas por {{8}}.

Ejemplos: `Carlos` · `25/11/2026` · `Distribuidora Uno` · `$ 12.000` · `$ 8.000` · `$ 20.000` · `5` · `$ 60.000`

**`boleta_vencida_cliente`** (opcional: los avisos a clientes vienen **desactivados**)
> Hola {{1}}, te escribimos de {{2}}. La boleta N.º {{3}} por {{4}} venció el {{5}}. Podés abonarla a nuestro vendedor o por transferencia. ¡Gracias!

Ejemplos: `Almacén A` · `Distribuidora Uno` · `B-0012` · `$ 8.000` · `20/11/2026`

Para activarlos hay que prender dos opciones en *Ajustes y Dueños*: el permiso de recordatorios a clientes y la opción de incluirlos en el envío automático. Mientras no estén las dos, no se manda nada a clientes.

### 4. Token permanente (el token temporal vence en 24 horas)
1. Configuración del negocio → **Usuarios → Usuarios del sistema** → *Agregar* → rol **Administrador**.
2. *Asignar activos* → la **app** (control total) y la **cuenta de WhatsApp** (control total).
3. **Generar token** → elegir la app → vencimiento **Nunca** → permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
4. Copiar el token. Se ve una sola vez.

### 5. Conectar en la app
1. En RF Gestión, como dueño: **WhatsApp Automático → Conectar WhatsApp Business**.
2. Pegar el **Identificador del número de teléfono** (está en WhatsApp → Configuración de la API) y el **token permanente**.
3. Tocar **Verificar y conectar**. El servidor prueba los datos contra Meta y recién ahí los guarda.
4. Tocar **Probar envío ahora**. El resultado y los errores de Meta se ven en *Envíos por WhatsApp Business (servidor)*.

### Teléfonos de vendedores y dueños
- **Formato:** cargarlos con característica y sin 0 ni 15, por ejemplo `11 2345-6789` o `351 512-3456`. El servidor los convierte al formato `549…`.
- **Números inválidos:** se informan en el resultado del envío.

### Errores frecuentes
| Error de Meta | Qué significa |
|---|---|
| `132001 Template name does not exist` | La plantilla no existe con ese nombre o idioma, o todavía no está aprobada |
| `131030 Recipient not in allowed list` | Con el número de prueba solo se puede enviar a números agregados como destinatarios de prueba |
| `190 Invalid OAuth access token` | El token venció o se revocó: generar uno permanente y volver a conectar |
| `131047 Re-engagement message` | Mensaje libre fuera de la ventana de 24 horas (no aplica: usamos plantillas) |

---

## Alternativas manuales
Los botones **"Abrir en WhatsApp"** y **"Difundir por WhatsApp"** (enlaces wa.me) siguen funcionando igual: sirven si un comercio no conecta su número o para mensajes puntuales.
