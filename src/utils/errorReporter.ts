import { getSupabaseClient } from './supabaseClient';

/**
 * Envía a Supabase (tabla app_errors) los errores que les pasan a los usuarios,
 * para verlos en el panel de Superadmin. No manda datos personales: solo el
 * mensaje, la pila, la página y el navegador.
 */
type ErrorSource = 'panel' | 'tienda';

const MAX_REPORTS_PER_PAGE = 8;
const sentMessages = new Set<string>();
let source: ErrorSource = 'panel';
let installed = false;

const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection captured/i];

// Página sin los parámetros de la URL (pueden traer tokens de pago)
const currentPage = () => {
  const params = new URLSearchParams(window.location.search);
  const keys = Array.from(params.keys()).join(',');
  return `${window.location.pathname}${keys ? `?(${keys})` : ''}`;
};

export function reportClientError(error: unknown, extra?: string): void {
  try {
    if (import.meta.env.DEV) return;
    const err = error instanceof Error ? error : null;
    const message = `${extra ? `${extra}: ` : ''}${err?.message || String(error || 'Error desconocido')}`.slice(0, 500);
    if (IGNORED.some((re) => re.test(message))) return;
    if (sentMessages.has(message) || sentMessages.size >= MAX_REPORTS_PER_PAGE) return;
    sentMessages.add(message);
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase
      .rpc('report_client_error', {
        p_message: message,
        p_stack: err?.stack?.slice(0, 4000) || null,
        p_url: currentPage(),
        p_source: source,
        p_user_agent: navigator.userAgent.slice(0, 300),
      })
      .then(
        () => undefined,
        () => undefined
      );
  } catch {
    // reportar nunca debe romper la app
  }
}

// Después de publicar una versión nueva, una pestaña vieja puede pedir archivos que ya no existen.
// En ese caso se recarga una sola vez para traer la versión nueva.
const isStaleChunkError = (message: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message
  );

function reloadOnceForNewVersion(): boolean {
  try {
    const key = 'rf_reloaded_for_new_version';
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export function installErrorReporter(appSource: ErrorSource): void {
  source = appSource;
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    if (isStaleChunkError(event.message || '') && reloadOnceForNewVersion()) return;
    reportClientError(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || '');
    if (isStaleChunkError(message) && reloadOnceForNewVersion()) return;
    reportClientError(reason, 'Promesa rechazada');
  });
}
