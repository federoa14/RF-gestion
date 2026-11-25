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

## 2026-11-25 — Oficina virtual con departamentos
- **Decisión:** el dashboard de `tareas/` pasó a ser una oficina virtual: 8 departamentos con una persona ficticia cada uno (Marketing, Ventas, Diseño, Gestión, Actualización, Evolución, Atención al Cliente, Legal y Finanzas), el presidente es Federico Roa. Pizarra Por hacer / En curso / Hecho (tachado) / Bloqueadas. Se dan órdenes tocando un escritorio o desde el chat (misma pizarra: `tareas/tasks.json`).
- **Reglamento:** `tareas/departamentos.json` (misión, funciones, reglas, prohibiciones). Nada con efecto externo (publicar, enviar, gastar, deploy, credenciales, borrar) sin aprobación del presidente: queda Bloqueada «esperando aprobación».
- **Flujo:** Diseño entrega flyers a Marketing (`entregaA` crea la tarea sola). Evolución investiga otras páginas y propone ideas con fuente.
- **Límite:** lo que muestra la oficina es el estado real de la pizarra; los departamentos «trabajan» cuando Claude (sesión o tarea horaria) toma y cierra tareas, no por su cuenta.

## 2026-11-25 — Departamentos autónomos, en conjunto y con libertad en redes
- **Decisión:** los departamentos siguen trabajando sin órdenes mediante rutinas (`tareas/rutinas.json`) y colaboran con `entregaA` (cadena) y `apoyo` (tarea compañera). Marketing maneja las redes sociales con libertad, sin aprobación por posteo.
- **Barreras:** solo material propio o de Diseño; veraz; sin precios/promos nuevas ni datos de clientes sin el Presidente; límite diario (2 por defecto); ante reclamo grave o tema legal se bloquea y se avisa. Interruptor de pausa de redes (oficina o `cli.mjs redes pausar`).
- **Motivo:** el usuario los ve como ayudantes y quiere que sigan sin que él ordene cada cosa. Esto reemplaza la regla anterior de aprobación para publicar; el resto de acciones con efecto externo sigue requiriendo aprobación.
- **Pendiente:** no hay cuentas de redes conectadas; sin eso no se publica de verdad. Falta definir con el usuario qué redes (Instagram, Facebook, WhatsApp Estados…) y conectarlas de forma segura.

## 2026-11-25 — Asistencia al Cliente como primer filtro de WhatsApp
- **Decisión:** el departamento de Asistencia al Cliente (ya existía como «Atención al Cliente») maneja el WhatsApp de asistencia: resuelve solo lo que su protocolo permite, pasa lo técnico a Actualización y escala al Presidente únicamente lo que necesita su decisión, con el aviso armado («X necesita…, contactate con Y para…»). Los casos escalados quedan en «esperan al Presidente» (`cli.mjs escalar`).
- **Escala siempre:** dinero (reembolsos, descuentos), reclamos graves o legales, datos personales, cuentas grandes o ventas especiales, y todo lo dudoso.
- **Autorización:** el Presidente autorizó responder clientes por WhatsApp sin aprobación previa (excepción al «no enviar mensajes»).
- **Pendiente:** hoy el sistema solo envía WhatsApp; falta un receptor de mensajes entrantes (webhook de la API de Meta) y el número conectado. No hay conexión real todavía.

## 2026-11-25 — Nombres de la oficina: discípulos de Jesús
- **Decisión:** las personas a cargo de cada departamento llevan nombres de los discípulos: Pedro (Marketing), Mateo (Ventas), Juan (Diseño), Felipe (Gestión), Tomás (Actualización), Andrés (Evolución), Bartolomé (Asistencia), Simón el Zelote (Legal y Finanzas). Reserva en orden en `nombresReservados` (discípulos que faltan, luego personajes bíblicos trascendentes). Nunca Judas Iscariote.

## 2026-11-25 — La oficina virtual vive en la app de la distribuidora (Supabase)
- **Decisión:** pestaña «Oficina» dentro del panel superadmin de la app, misma dirección y login. Datos en tablas nuevas de Supabase (`oficina_tareas`, `oficina_log`, `oficina_redes`) con acceso solo para superadmin (`is_superadmin()`); no tocan ni leen datos de los comercios.
- **Motivo:** el usuario quiere verla e interactuar como ve el proyecto de la distribuidora (no solo en localhost). Autorizó expresamente que Claude haga los cambios de código y configuración sin pedir confirmación en cada paso.
- **Cómo opera Claude:** órdenes del chat → SQL por MCP de Supabase en esas tablas. El reglamento (`tareas/departamentos.json`) y las rutinas (`tareas/rutinas.json`) son la única fuente y los usa también la app.
- **Pendiente:** publicar en producción (merge a `main` por pull request); la tarea horaria autónoma aún trabaja sobre archivos locales, no sobre Supabase.

## 2026-11-25 — Principio rector: crecimiento sostenible, rentable y colaborativo
- **Decisión:** el crecimiento de la empresa debe ser sostenible, rentable y colaborativo con el usuario. El usuario es alguien a quien se busca ayudar; con su aporte ayuda al dueño. Aplica a planes, marketing y ventas. Quedó en el reglamento (`tareas/departamentos.json`).
- **Devolución mensual:** a fin de mes Claude entrega al presidente la evolución de la empresa con datos reales y lectura honesta (rutina `gestion-devolucion-mensual`, cada 30 días).
- **Pendiente:** definir con el usuario qué indicadores reales hay disponibles (clientes, bajas, ingresos de planes, costos) para que el informe no se base en estimaciones.
