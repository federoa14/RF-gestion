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

## 2026-11-26 — App instalable, fotos en Storage y avisos de pedido
- **App instalable (PWA):** la tienda usa un manifiesto propio (`api/manifest.ts`, `api/icon.ts`) con el nombre, color y logo del comercio; el panel arma el suyo en el navegador con el logo de la empresa. Botón "Instalar app" en la tienda y en el menú Mi cuenta; en iPhone muestra cómo agregar a inicio. Service worker mínimo (`public/sw.js`) sin caché.
- **Fotos en Storage:** bucket público `catalog-images` (script en `supabase/catalog_images_bucket.sql`, ya aplicado en producción); al publicar, las fotos se achican y se suben a la carpeta del comercio, y la tienda guarda solo el link. Si falla la subida, queda la foto achicada incrustada.
- **Pedidos:** al pasar un pedido a listo / en camino / entregado se ofrece avisar al cliente por WhatsApp (una vez por etapa). Carritos abandonados muestra pendientes, recordados, recuperados y tasa de recupero.

## 2026-11-26 — Funciones /api en Vercel
- **Hallazgo (logs de Vercel):** las funciones de `api/` fallaban en producción con `ERR_MODULE_NOT_FOUND`: los imports relativos entre archivos deben llevar `.js` (módulos ESM). Esto también rompía la vista previa del link de la tienda (`api/tienda-preview.ts`), que nunca había funcionado en producción.
- **Regla:** en `api/` importar siempre con extensión `.js` (ej. `./_manifest.js`). `tests/unit/apiFunctions.test.ts` compila y llama las funciones como lo hace Vercel.
- El manifiesto de la tienda se sirve en `/api/store-manifest` (`/api/manifest` daba 404).

## 2026-11-26 — Envío a todo el país (Plan 3)
- **Decisión:** los comercios de Plan 3 pueden activar "Ofrecer envío a todo el país" en Configuración (con nota opcional). Si el comprador lo elige, la tienda pide nombre y apellido, DNI, teléfono, email (opcional), calle, altura, piso/depto, localidad, provincia, código postal, entre calles y observaciones, y valida lo obligatorio. El pedido guarda `deliveryScope: 'nacional'` y `shippingDetails`; en el panel se ven los datos completos con botón "Copiar datos".
- **Costo del envío:** no se calcula en la tienda; se coordina por WhatsApp (nota para el comprador). Pendiente posible: tarifas por provincia o integración con el correo.

## 2026-11-26 — Flyer con QR y recordatorio de carritos
- **Flyer con QR:** botón "Flyer con QR" junto a "Copiar enlace" en el catálogo. Arma un flyer con "E-COMMERCE", el nombre de la tienda y el QR del link de la tienda; el comercio edita título, nombre, frase, llamado a la acción, teléfono, otro dato (Instagram, dirección), estilo, color y formato (A4, historia 9:16, cuadrado). Se recuerdan los datos por empresa en el navegador. También descarga solo el QR.
- **Carritos abandonados:** se avisa en la parte de arriba del catálogo quién (nombre y teléfono) dejó un carrito sin finalizar. Tiempo de espera configurable (2, 6, 12, 24, 48 h; recomendado 6 h) antes de marcar "Listo para recordar"; segundo aviso sugerido a las 24 h del primero y nunca más de 2. El mensaje de WhatsApp lleva el link para retomar el carrito y, si el dueño elige, un cupón. El envío es manual (botón), no automático.

## 2026-11-26 — Logo con su propia forma
- **Decisión:** el logo del comercio se muestra tal cual lo subió (círculo, octógono, etc.), sin cuadrito, borde ni fondo detrás y sin recortarlo (`object-contain`): en el panel, el encabezado y la portada de la tienda, los flyers, el flyer con QR y los comprobantes/estados de cuenta. El fondo es el de cada pantalla. Al subirlo, PNG/WebP/SVG/GIF se guardan como PNG para no perder la transparencia (solo JPG queda JPG).
- **Nota:** si el logo es JPG o PNG con fondo propio, ese fondo se ve (no se puede borrar automáticamente); conviene subir PNG con fondo transparente.

## 2026-11-27 — Cobro mixto, caja del día, tienda de entrada libre y avisos por DNI
- **Venta de mostrador:** medio de pago Efectivo / Transferencia / Mercado Pago / Mixto / A cuenta. Mixto: montos por medio y el resto queda a cuenta (exige nombre del cliente). Efectivo calcula el vuelto. DNI opcional. El pedido guarda `paymentBreakdown` y `saleChannel: 'mostrador'`; lo que queda a cuenta figura "pendiente".
- **Caja del día** (Catálogo → Pedidos y ventas → Caja del día): se elige el día y se ve lo vendido, efectivo, transferencia, Mercado Pago, a cuenta, devoluciones (restan) y neto cobrado, con la lista de ventas y botones para cobrar el saldo a cuenta. Muestra lo que entró, no la ganancia (no hay costo por producto).
- **Tienda:** entrar es libre (se quitó el pedido obligatorio de teléfono). Solo si el comercio es Plan 3 con club/puntos se ofrece "Quiero sumar puntos y recibir ofertas": nombre + DNI + teléfono. Con eso se crea la cuenta de puntos a nombre de ese DNI, se registra en el club y el carrito queda precargado.
- **Productos agotados:** si el cliente ya está registrado, "Avisar cuando haya stock" se anota con un toque (con su DNI). En Avisos de stock se ve el ranking de lo que más piden reponer (demanda).

## 2026-11-27 — Club de puntos de solo lectura
- **Decisión:** nueva pestaña "Club de puntos" (Catálogo → Clientes y promos, Plan 3): lista de socios con sus puntos (más puntos primero), buscador por nombre/DNI/teléfono, ícono de WhatsApp con mensaje y cupón de regalo, y regalo de puntos (+10/+50/+100, solo suma, con confirmación y registro en el historial). El comercio **no puede restar ni editar** puntos: se quitó el "Ajuste rápido" (+10/+50/−10) de Estadísticas.
- **Idea futura (NO se hace ahora):** puntos compartidos entre comercios amigos: quien use el sistema suma puntos y los canjea en cualquier comercio adherido; cada comercio y cada cliente tendría que aceptar sumarse (consentimiento, y revisar privacidad: datos de clientes entre comercios).
