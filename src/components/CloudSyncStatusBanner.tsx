import React, { useEffect, useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle, UploadCloud, X } from 'lucide-react';
import { CLOUD_STATUS_EVENT, getCloudStatus, retryCloudSyncNow, type CloudStatus } from '../utils/supabaseSync';
import {
  dismissLegacyDeviceImport,
  hasPendingLegacyDeviceData,
  importLegacyDeviceData,
} from '../utils/localInternalDb';

interface CloudSyncStatusBannerProps {
  businessId: string | null;
  canImportLegacy: boolean;
  onLegacyImported?: (inserted: number) => void;
}

/**
 * Avisos de sincronización con Supabase:
 *  · sin conexión / reintentando / cambio rechazado (con botón Reintentar),
 *  · datos viejos en este dispositivo que todavía no se subieron a la nube.
 */
export const CloudSyncStatusBanner: React.FC<CloudSyncStatusBannerProps> = ({
  businessId,
  canImportLegacy,
  onLegacyImported,
}) => {
  const [status, setStatus] = useState<CloudStatus>(getCloudStatus);
  const [legacyPending, setLegacyPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    const onStatus = (ev: Event) => setStatus((ev as CustomEvent<CloudStatus>).detail);
    window.addEventListener(CLOUD_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(CLOUD_STATUS_EVENT, onStatus);
  }, []);

  useEffect(() => {
    let active = true;
    if (canImportLegacy && businessId) {
      hasPendingLegacyDeviceData(businessId).then((v) => active && setLegacyPending(v)).catch(() => {});
    } else {
      setLegacyPending(false);
    }
    return () => {
      active = false;
    };
  }, [businessId, canImportLegacy]);

  const handleImport = async () => {
    if (!businessId) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await importLegacyDeviceData(businessId);
      setLegacyPending(false);
      setImportMsg(
        res.inserted > 0
          ? `Listo: se subieron ${res.inserted} registro(s) de este dispositivo a la nube.`
          : 'Listo: los datos de este dispositivo ya estaban en la nube.'
      );
      onLegacyImported?.(res.inserted);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'No se pudieron subir los datos. Probá de nuevo.');
    } finally {
      setImporting(false);
    }
  };

  const showStatus = status.state === 'offline' || status.state === 'error';

  return (
    <>
      {showStatus && (
        <div
          role="status"
          aria-live="polite"
          className={`px-4 sm:px-6 py-2.5 border-b text-xs ${
            status.state === 'offline'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold">
              {status.state === 'offline' ? (
                <CloudOff className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {status.message || 'No se pudieron guardar algunos cambios.'}
                {status.pendingChanges > 0 && ` (${status.pendingChanges} cambio(s) pendiente(s))`}
              </span>
            </span>
            {status.pendingChanges > 0 && (
              <button
                type="button"
                onClick={() => retryCloudSyncNow()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 dark:bg-black/30 border border-current/20 font-bold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Reintentar ahora
              </button>
            )}
          </div>
        </div>
      )}

      {(legacyPending || importMsg) && (
        <div className="px-4 sm:px-6 py-2.5 border-b bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-100">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold">
              <UploadCloud className="w-4 h-4 shrink-0" aria-hidden="true" />
              {importMsg ||
                'En este dispositivo quedaron datos de la versión anterior (guardados solo acá). Subilos a la nube para no perder nada: solo se agrega lo que falta, no se pisa nada.'}
            </span>
            <span className="flex items-center gap-2">
              {legacyPending && (
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-bold disabled:opacity-60 cursor-pointer"
                >
                  {importing ? 'Subiendo…' : 'Subir datos a la nube'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (legacyPending && businessId) dismissLegacyDeviceImport(businessId);
                  setLegacyPending(false);
                  setImportMsg(null);
                }}
                aria-label="Cerrar aviso"
                className="p-1 rounded hover:bg-sky-100 dark:hover:bg-sky-900 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </span>
          </div>
        </div>
      )}
    </>
  );
};
