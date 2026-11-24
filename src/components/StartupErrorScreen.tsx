import React from 'react';
import { WifiOff, Settings, RefreshCw, LogOut } from 'lucide-react';
import { describeCloudError } from '../utils/supabaseSync';
import { getSupabaseClient } from '../utils/supabaseClient';

interface StartupErrorScreenProps {
  kind: 'not_configured' | 'connection';
  error?: unknown;
}

/** Pantalla que se muestra si no se puede arrancar contra Supabase */
export const StartupErrorScreen: React.FC<StartupErrorScreenProps> = ({ kind, error }) => {
  const isConfig = kind === 'not_configured';
  const Icon = isConfig ? Settings : WifiOff;

  const handleLogout = async () => {
    try {
      window.localStorage.removeItem('saas_distribuidoras_session_user_v2_zero');
    } catch {
      // ignore
    }
    await getSupabaseClient()?.auth.signOut().catch(() => null);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#071021] text-[#E2E8F0] flex items-center justify-center p-4">
      <div role="alert" className="w-full max-w-md bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl p-6 space-y-4 text-center">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#13264A] border border-[#B6C2D2]/25 flex items-center justify-center">
          <Icon className="w-6 h-6 text-amber-300" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-white">
          {isConfig ? 'Falta configurar la conexión' : 'No pudimos conectarnos con el servidor'}
        </h1>
        <p className="text-sm text-[#CBD5E1]">
          {isConfig
            ? 'La app necesita las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (en Vercel → Settings → Environment Variables).'
            : describeCloudError(error)}
        </p>
        {!isConfig && (
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#E2E8F0] hover:bg-white text-[#091428] text-sm font-bold cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#B6C2D2]/30 text-[#CBD5E1] hover:text-white text-sm font-semibold cursor-pointer"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
