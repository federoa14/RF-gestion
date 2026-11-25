import React, { useEffect, useState } from 'react';
import { CloudDownload, RefreshCw, ShieldCheck } from 'lucide-react';
import { getSupabaseClient } from '../utils/supabaseClient';

interface BackupFile {
  name: string;
  created_at?: string;
  metadata?: { size?: number } | null;
}

/** Respaldos automáticos semanales del comercio (Storage → backups/<business_id>). */
export const AutoBackupsPanel: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !businessId) return;
    setLoading(true);
    const { data, error } = await supabase.storage
      .from('backups')
      .list(businessId, { limit: 20, sortBy: { column: 'name', order: 'desc' } });
    setLoading(false);
    if (error) {
      setMessage({ type: 'error', text: 'No se pudo leer la lista de respaldos automáticos.' });
      return;
    }
    setFiles((data || []).filter((f) => f.name.endsWith('.json')) as BackupFile[]);
  };

  useEffect(() => {
    void load();
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (name: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.storage.from('backups').createSignedUrl(`${businessId}/${name}`, 60, {
      download: `respaldo-${name}`,
    });
    if (error || !data?.signedUrl) {
      setMessage({ type: 'error', text: 'No se pudo descargar el respaldo.' });
      return;
    }
    window.location.assign(data.signedUrl);
  };

  const runNow = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setRunning(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('weekly-backup', { body: { mode: 'now', businessId } });
    setRunning(false);
    if (error || !data?.ok) {
      setMessage({ type: 'error', text: 'No se pudo hacer el respaldo ahora. Probá de nuevo en un rato.' });
      return;
    }
    setMessage({ type: 'ok', text: `Respaldo guardado en la nube (${data.rows} registros).` });
    void load();
  };

  const formatDate = (name: string) => {
    const iso = name.replace('.json', '');
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-[#B6C2D2]/20 bg-slate-50 dark:bg-[#13264A]/40 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Respaldos automáticos
          </div>
          <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
            Todos los domingos de madrugada se guarda una copia de tus datos en la nube. Quedan las últimas 8 semanas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Actualizar lista de respaldos"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer dark:bg-[#0B1933] dark:border-[#B6C2D2]/20 dark:text-[#CBD5E1]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            disabled={running}
            onClick={() => void runNow()}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#162E59] text-white disabled:opacity-60 cursor-pointer dark:bg-[#E2E8F0] dark:text-[#091428]"
          >
            {running ? 'Guardando…' : 'Hacer un respaldo ahora'}
          </button>
        </div>
      </div>
      {files.length === 0 && !loading ? (
        <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">Todavía no hay respaldos automáticos.</div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/10 rounded-lg border border-slate-200 dark:border-[#B6C2D2]/20 bg-white dark:bg-[#0B1933]">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="text-slate-800 dark:text-[#E2E8F0] first-letter:uppercase">{formatDate(f.name)}</span>
              <button
                type="button"
                onClick={() => void download(f.name)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold text-[#0B1933] dark:text-[#E2E8F0] hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer"
              >
                <CloudDownload className="w-3.5 h-3.5" />
                Descargar
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <div className={`text-[11px] font-semibold ${message.type === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
};
