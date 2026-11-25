# Decisiones

Decisiones técnicas y de producto ya tomadas. Léelas antes de proponer algo que las contradiga. Si una cambia, actualiza su entrada en vez de duplicarla.

Formato: `## AAAA-MM-DD — Título` · **Decisión** · **Motivo** · **Alternativas descartadas** (opcional).

## 2026-11-25 — Memoria persistente en el repositorio
- **Decisión:** la memoria de Claude vive en `memory/` dentro del repo y se versiona con git.
- **Motivo:** las sesiones en la nube usan contenedores efímeros; solo sobrevive lo que se commitea y pushea.

## Contexto heredado (anterior a esta memoria, deducido del código y del historial de git)
- Backend Express (`server.ts`) + frontend React 19 / Vite / Tailwind 4; despliegue en Vercel (`vercel.json`, `api/`).
- Base de datos y autenticación en Supabase; funciones de trigger con `search_path` fijo y cerradas a la API; la clave del cron se lee desde Vault.
- IA del lado del servidor con Gemini (`@google/genai`).
- Alertas por WhatsApp (API de Meta, ver `docs/WHATSAPP-META.md`) y por email.
- Planes de suscripción: prueba gratis de 30 días con el Plan 2 (con sus límites).

## 2026-11-25 — Interés de cuotas según Banco Nación
- **Decisión:** el interés sugerido de las cuotas parte de la TNA del Banco Nación (referencia 40%, editable y guardada en el navegador); el interés final siempre se puede cambiar a mano.
- **Motivo:** el BNA no tiene API pública; la tasa se corrige cuando cambie. Pendiente: confirmar la tasa vigente en bna.com.ar.

## 2026-11-25 — Filtros del catálogo
- **Decisión:** una lista de filtros vacía guardada se respeta; solo se usan los predeterminados del rubro si nunca se configuró.

## 2026-11-25 — Diseño de tienda solo en Plan 3
- **Decisión:** colores y letra de la tienda siguen siendo exclusivos del Plan 3 (no se abren a Plan 2 ni a la prueba gratis).
- **Motivo:** el usuario confirmó que es función del plan más alto; si no se ve el cambio, primero revisar el plan de la empresa.

## 2026-11-25 — Datos de cada empresa siempre en blanco y aislados
- **Decisión:** los datos de la SuperGestión (teléfono, mail, clientes, etc.) nunca se copian a cuentas nuevas ni de prueba. Cada empresa lee solo su partición (`loadTenantData`); las claves globales de `storage.ts` ya no se leen ni se escriben desde `App.tsx`.
- **Motivo:** las claves globales guardaban lo último que editó alguien y aparecía en usuarios nuevos.

## 2026-11-25 — Borrador del catálogo no se reinicia solo
- **Decisión:** el borrador de ajustes del catálogo (colores, filtros, etc.) no se pisa con sincronizaciones en segundo plano mientras el usuario edita; solo se reinicia si no hay cambios sin guardar.
- **Motivo:** en "Hay Vida en Jesus" (Plan 3) el diseño nunca llegó a la base: el borrador se reiniciaba antes de guardar.

## 2026-11-25 — Pestaña "Diseño de página" y aceptación obligatoria de términos
- **Decisión:** el diseño (colores y letra) tiene su propia pestaña "Diseño de página" junto a Configuración, con botón de guardado propio. Se elige entre Tienda online y Panel de gestión (`config.panelTheme`). Sigue siendo Plan 3.
- **Motivo:** el diseño estaba dentro del formulario de Configuración; si fallaba una validación de cobros (ej. Transferencia sin alias) el guardado se cancelaba sin que se notara, y los colores nunca se guardaban (comprobado en la base).
- **Términos:** todo comercio debe aceptar la versión vigente (`TERMS_VERSION` 2026.2) para usar el sistema; la aceptación se pide solo la primera vez (2026-11-25: el usuario pidió que no se repita). Texto redactado por Claude, pendiente de revisión por un abogado.
- **Productos:** el formulario permite subir foto o tomarla con la cámara.

## Preferencias nuevas
- El usuario quiere poder pedir cambios de código directos para que la página quede según los colores que cada cliente elija.

## 2026-11-25 — Diseño: solo Plan 3 (reconfirmado)
- **Decisión:** únicamente Plan 3 puede modificar colores, letra y diseño (tienda y panel); en planes inferiores el editor queda bloqueado y el código descarta el diseño al guardar.

## 2026-11-25 — Estudio de flyers rediseñado
- **Decisión:** los flyers se arman en el navegador con un diseñador propio (`src/utils/flyerRenderer.ts`): 4 estilos (Moderno, Vibrante, Elegante, Minimal), titular, detalle, precio, precio anterior, sello, vigencia, foto y color de marca. Antes solo volcaba el texto sobre un fondo azul.
- **Motivo:** el usuario encontró los flyers poco atractivos. No usa IA externa (sin costo ni claves). Opción futura: generación con Gemini desde un endpoint seguro en Vercel (requiere `GEMINI_API_KEY`, control de acceso y límite de uso).

## 2026-11-25 — Código de barras y venta de mostrador
- **Decisión:** el código de barras se lee con la cámara (lector nativo del navegador y ZXing de respaldo) solo en el panel: en el formulario de producto, en cada producto ya cargado (ícono de código) y en "Cobrar / Venta" del encabezado. La tienda pública NO escanea.
- **Venta de mostrador:** se arma con escaneo continuo o a mano, se elige efectivo / transferencia / Mercado Pago, y al cobrar crea un pedido ya retirado y acreditado, descuenta stock y queda en el historial de ventas. Requiere plan con catálogo web. El código se guarda en el campo SKU del producto (o de la variante).
- **Límite:** el código da el número, no el nombre; el producto debe tener el código cargado antes.

## 2026-11-25 — Causa real de que la tienda pública no se actualizara
- **Hallazgo (logs de Supabase):** publicar la tienda (`public_catalogs`) fallaba con error 500 por "statement timeout": el documento pesaba ~6 MB porque las fotos van en base64. Por eso ni colores ni filtros llegaban a la tienda, aunque se guardaran en los ajustes.
- **Decisión:** al publicar se achican las fotos y el logo (`src/utils/imageShrink.ts`) y, si la publicación falla, se avisa con un mensaje. Filtros y subfiltros se guardan y publican al instante, sin depender del botón Guardar de Configuración.
- **Pendiente posible:** mover las fotos a Supabase Storage (URLs) en lugar de base64.

## 2026-11-25 — Revisión de código y pruebas
- **Hallazgo:** un comercio no podía guardar cambios en su fila de `businesses` (upsert bloqueado por la política de alta, solo superadmin): la aceptación de términos, el cambio de plan y el diseño del panel no persistían desde su cuenta. Ahora usa `update` si no es superadmin.
- **Pruebas:** `tests/e2e` cubre diseño de página, panel con color, filtros, Plan 2 bloqueado, términos y venta de mostrador.
- **Pendiente:** `bun.lock` no incluye `@zxing/*` (solo `package-lock.json`); mover fotos a Storage; campo de TNA del BNA no se puede vaciar del todo.

## 2026-11-25 — Regalar un año desde SuperGestión
- **Decisión:** en la lista de empresas hay un botón visible "Regalar 1 año" (cortesía, sin cobro, queda registrado con monto $ 0 y pide confirmación) y un aviso sobre la tabla. El botón anterior pasó a llamarse "Año pagado (12M)" y registra el pago del año con descuento.
- **Motivo:** el usuario no encontraba cómo dar un año gratis a un cliente.

## 2026-11-25 — Avisos en SuperGestión
- **Hallazgo:** el aviso verde de confirmación (toast) no se dibujaba en el panel del superadmin, así que acciones como tildar pagos, prorrogar o regalar un año no mostraban ninguna confirmación. Ahora sí se muestra.
- **Pruebas:** hay un superadmin simulado en `tests/e2e` (`makeSuperSeed`). Si un servidor de prueba (puerto 5199) queda colgado, correr `pkill -f "vite --port 5199"` antes de volver a probar: sirve código viejo.

## 2026-11-25 — Términos una sola vez (reforzado) y bienvenida de la tienda
- **Términos:** quedan registrados en la nube, en la configuración de la empresa (`config.termsAcceptedAt`) y en el dispositivo (`rf_terms_accepted_<empresa>`); si cualquiera existe, no se vuelve a pedir. Comprobado en la base: la aceptación de "Hay Vida en Jesus" quedó guardada después del arreglo de `businesses`.
- **Tienda online:** antes de ver el catálogo se piden nombre y teléfono (y dirección opcional si hay envío); se recuerdan en el dispositivo (`rf_visitor_<empresa>`), precargan el carrito y alimentan el recordatorio de carrito abandonado por WhatsApp (Plan 3). Casilla opcional, sin marcar, para sumarse al club (solo Plan 3 con club activo).
- **Fotos publicadas:** más chicas (480 px) para que la tienda cargue rápido y la publicación no falle por tiempo.

## 2026-11-25 — Versión celular revisada
- **Hallazgos corregidos:** pestañas del superadmin superpuestas en pantallas angostas (ahora se deslizan); en Configuración del catálogo los campos de texto empujaban fuera de la pantalla los botones "+ Agregar filtro / subfiltro / banner" (regla `input.flex-1 { min-width: 0 }` en `index.css`); formulario de subfiltros a 320 px.
- **Prueba:** `tests/e2e/mobile.test.mjs` revisa a 360 y 320 px que no haya desborde horizontal ni elementos cortados (tienda, bienvenida, carrito, login, panel, mostrador, catálogo, diseño, términos, SuperGestión).
- **Nota:** la franja de estado del panel ("En la calle…") se desliza de costado a propósito en el celular.
