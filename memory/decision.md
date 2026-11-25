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
