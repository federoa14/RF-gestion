import React, { useEffect, useState } from 'react';
import { Bug, ChevronDown, RefreshCw, Trash2 } from 'lucide-react';
import { getSupabaseClient } from '../utils/supabaseClient';

interface AppErrorRow {
  id: number;
  created_at: string;
  last_seen_at: string;
  business_id: string | null;
  source: 'panel' | 'tienda';
  message: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  occurrences: number;
}

/** Errores que les pasaron a los usuarios (panel y tienda), últimos 30 días. Solo Superadmin. */
export const AppErrorsPanel: React.FC<{ tenantNames: Record<string, string> }> = ({ tenantNames }) => {
  const [rows, setRows] = useState<AppErrorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('app_errors')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      setLoadError(
        /app_errors/.test(error.message)
          ? 'Falta correr supabase/monitoring.sql en el SQL Editor de Supabase.'
          : `No se pudieron leer los errores: ${error.message}`
      );
      return;
    }
    setRows((data || []) as AppErrorRow[]);
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: number) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from('app_errors').delete().eq('id', id);
    if (!error) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const last24h = rows.filter((r) => Date.parse(r.last_seen_at) > Date.now() - 86400000);

  return (
    <div className="bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center border border-rose-500/30 shrink-0">
            <Bug className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Errores de la app</h3>
            <p className="text-xs text-[#94A3B8]">
              Lo que les falló a los comercios y a sus clientes en los últimos 30 días.{' '}
              <strong className="text-white">{last24h.length}</strong> en las últimas 24 horas.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] border border-[#B6C2D2]/25 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {loadError && <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs">{loadError}</div>}
      {!loadError && !loading && rows.length === 0 && (
        <div className="p-6 text-center text-sm text-emerald-300">Sin errores registrados. 🎉</div>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const isOpen = openId === r.id;
          return (
            <li key={r.id} className="rounded-xl border border-[#B6C2D2]/15 bg-[#081224]">
              <div className="flex items-start gap-3 p-3">
                <span
                  className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    r.source === 'tienda' ? 'bg-indigo-500/25 text-indigo-200' : 'bg-sky-500/25 text-sky-200'
                  }`}
                >
                  {r.source}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white break-words">{r.message}</div>
                  <div className="text-[11px] text-[#94A3B8] flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span>
                      {r.occurrences} {r.occurrences === 1 ? 'vez' : 'veces'}
                    </span>
                    <span>Última: {new Date(r.last_seen_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {r.business_id && <span>Comercio: {tenantNames[r.business_id] || r.business_id}</span>}
                    {r.url && <span className="font-mono">{r.url}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                    aria-label="Ver detalle técnico"
                    className="p-2 rounded-lg text-[#CBD5E1] hover:bg-[#13264A] cursor-pointer"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    aria-label="Borrar este error"
                    title="Marcar como resuelto (borrar)"
                    className="p-2 rounded-lg text-rose-300 hover:bg-rose-500/15 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="px-3 pb-3 space-y-1.5">
                  {r.user_agent && <div className="text-[11px] text-[#94A3B8] break-words">Navegador: {r.user_agent}</div>}
                  <pre className="text-[11px] leading-relaxed text-[#CBD5E1] bg-black/30 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-words max-h-64">
                    {r.stack || 'Sin detalle técnico'}
                  </pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
