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

## 2026-11-26 — La oficina que usa el Presidente vive como artefacto de Claude
- **Decisión:** la oficina principal es el artefacto «Oficina RF Gestiones» (misma forma que «Oficina Urriste» del proyecto Distribuidora: escena isométrica, pizarra de post-its con lo hecho tachado, panel por persona con chat y cuadro «Darle una orden»). Datos en la base del propio artefacto (`tareas`, `config/redes`, `registro/actual`); Claude la opera desde el chat con `ArtifactData`.
- **Motivo:** el Presidente quiere verla e interactuar desde Claude, como su oficina de la distribuidora; localhost y la pestaña de la app no se abren desde el chat.
- **Dos copias:** la pestaña Oficina de la app (Supabase) queda como copia sin sincronizar. Pendiente: decidir si se retira o se sincroniza.
- **Código:** `tareas/artefacto/oficina-rf.html`.

## 2026-11-26 — Instagram de RF Gestiones: identidad y plan de lanzamiento
- **Hecho:** el Presidente creó el mail y el Instagram con su propio teléfono y contraseñas (nunca se pasan ni se guardan acá). Diseño entregó foto de perfil con el logo, 4 portadas de destacados y 3 primeras piezas (fuente: `tareas/instagram/piezas.html`); Marketing dejó el plan de 3 semanas en borrador.
- **Regla confirmada:** las piezas no afirman nada que no se pueda respaldar (sin estadísticas inventadas); la prueba gratis de 30 días y los planes se confirman con Legal/Ventas antes de publicarlos.
- **Pendiente:** conectar la cuenta para que Marketing publique. Conectores ya instalados en la cuenta del usuario y sin conectar: Metricool (plan gratuito: 1 marca, 20 publicaciones por mes, según su ayuda) y Windsor.ai (orientado a análisis; publicar no confirmado). La conexión la hace el Presidente en Configuración › Conectores.

## 2026-11-26 — Instagram operativo: qué se puede automatizar y qué no
- **Hecho:** @rfgestion (Business) conectado por Composio; 3 historias publicadas; carpeta «RF Gestiones» en Canva (Diarios y Corporativos); carrusel de virtudes en cola para el 27-11 a mediodía.
- **Límite de la API:** foto de perfil, biografía, sitio web y destacados NO se pueden cambiar por herramientas; los aplica Federico en la app (textos listos). Sitio web: https://rf-gestion.vercel.app.
- **Publicación en horarios fuertes:** las tareas programadas no pueden usar conectores en esta organización, así que las 3 rutinas «RF Marketing» quedaron desactivadas. Alternativa: Metricool (publica por su cuenta a la hora programada) a las 12:20 y 20:20 (Argentina), una vez que Federico vincule @rfgestion. Los horarios son una hipótesis hasta tener datos (se necesitan 100+ seguidores).
- **Reglas:** nada de anuncios pagos ni «impulsar» sin autorización expresa; máximo 2 posteos de feed y 3 historias por día; todo veraz. Detalle en `tareas/instagram/AUTOMATIZACION.md`.
- **Aviso:** el repositorio es público; no guardar acá nada sensible.

## 2026-11-26 — Qué es RF Gestiones hoy (el producto ya no es solo cobranzas para distribuidoras)
- **Decisión del Presidente:** la propuesta se comunica como plataforma de gestión para comercios, no solo cobranzas para distribuidoras. Revisado contra el código el 2026-11-26.
- **Rubros que soporta** (`src/utils/businessMode.ts`): Mayorista/Distribuidora; Local de ropa, indumentaria y calzado; E-commerce/Despensa/Kiosco; Comercio/Almacén/Barrio con fiado; Cuenta corriente/Corralón/Taller. Cada rubro cambia reglas y vocabulario (tope por cliente, cuotas con interés, señas, canasto por producto, remitos con imputación FIFO).
- **Cobranzas y fiado:** boletas con vencimiento, pagos parciales, prórrogas, estado de cuenta, historial de pagadas, agenda rápida, boletas impagas, rendición de reparto, auditoría de mora y score crediticio por cliente y por vendedor, clientes y vendedores/preventistas.
- **Avisos:** WhatsApp (manual en todos los planes, automático en el Plan 3) y mail; avisos a vendedores; resumen de deuda y link de pago para el cliente.
- **Tienda online (Planes 2 y 3):** catálogo con link y QR propio, pagos en efectivo, transferencia y Mercado Pago, stock por producto y variante (Plan 2 hasta 5 rubros y 50 artículos), pedidos con estados (por armar, listo, en camino, entregado), despacho con comprobante, cambios y devoluciones, estadísticas.
- **Mostrador:** venta de mostrador y lector de código de barras con la cámara.
- **Fidelización y venta (Plan 3):** puntos por DNI, gift cards con QR, saldo a favor, cupones, ofertas relámpago y outlet, recupero de carritos abandonados, avisos de stock, club de promos, flyers (estudio propio), radar de clientes fríos (ropa y calzado), diseño de la página (colores y letra).
- **Planes:** Plan 1 Básico (gestión sin web), Plan 2 Página web básica, Plan 3 Full. Prueba gratis de 30 días como Plan 2.
- **Plataforma:** multi comercio (dueño, administrador, vendedor), panel superadmin, copias de seguridad automáticas, términos y condiciones, app instalable con logo propio.
- **Consecuencia:** todo material de marketing (bio, historias, carrusel) usa el nuevo encuadre. Las 3 historias del 26-11 decían «para distribuidoras»: vencen solas a las 24 h. Carrusel v2 en cola para el 27-11 mediodía.

- 2026-11-26 — Los departamentos pueden operar la computadora del Presidente a través de la sesión «Manejo de Instagram abierto» (carpeta cerebro, equipo gordo, Claude en Chrome). Federico Roa lo autorizó para todas las áreas que lo necesiten. Esa sesión ya cargó foto de perfil, bio con link y 6 publicaciones en @rfgestion (verificado vía API: 6 posts, foto puesta). Pendiente: el email público de contacto lo decide Federico.

- 2026-11-26 — Nuevo departamento «Datos y Finanzas» (Santiago el Mayor, 9.º escritorio): números reales (clientes, bajas, ingresos por plan, costos, rendimiento de redes); entrega a Gestión (devolución de fin de mes) y Marketing. Legal queda en cumplimiento y ley. Rutinas: tablero semanal y rendimiento de redes. Email público de contacto de @rfgestion: lo definió Federico (se lo pasó a la sesión «Manejo de Instagram abierto»; no se guarda acá).

- 2026-11-26 — Nuevo departamento «Calidad y Producto» (Santiago el Menor, 10.º escritorio), pedido por Federico: tarea constante de probar la experiencia del comercio, del que vende en mostrador y del comprador de la tienda de cada usuario, para que la app esté siempre actualizada y funcionando. Rutinas: prueba diaria de salud, recorrido cada 3 días, promesas vs app semanal. Solo páginas públicas y cuentas de prueba; arregla Actualización. Alianzas y Comunidad: propuesto, Federico no lo pidió; queda pendiente.

- 2026-11-26 — Seguimiento de uso en los primeros 90 días (pedido de Federico): lo mide Datos y Finanzas (qué módulos usa cada comercio, qué más usa, cuándo deja de usar), Calidad investiga si hubo un error o traba, Asistencia contacta para ayudar (sin presión). Se lee de la base agregada y sin nombres. Falta: la app no registra ingresos a pantallas ni clics (solo huellas de datos creados); medirlo requeriría una tabla de eventos de uso, a decidir con Federico.

- 2026-11-26 — Calidad opera la app real a través de la sesión «Manejo de Instagram abierto» (Chrome de Federico) cuando la compu está abierta; no trabaja de forma continua. Cuenta de prueba «QA Calidad (prueba)» con alias del email de la empresa; clave solo en Chrome. Encargo enviado a esa sesión.

- 2026-11-26 — Destacados fijos (pedido de Federico): 3 carpetas, «Visión», «Qué ofrecemos» y «Alcance», 3 historias + portada cada una (tareas/instagram/destacados/, plantilla destacados.html). Las 9 historias se publicaron en @rfgestion para que queden en el archivo; armar los destacados en sí lo intenta la sesión de la compu o lo hace Federico desde el celular (la API de Instagram no los crea).
