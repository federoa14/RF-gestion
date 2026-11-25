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
