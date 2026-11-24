import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initInternalDatabase, getStartupError} from './utils/localInternalDb';
import {StartupErrorScreen} from './components/StartupErrorScreen';
import {isSupabaseConfigured} from './utils/supabaseClient';
import {restoreSessionUserFromCloud} from './utils/multiTenantStorage';

const searchParams =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isStandalonePublicRoute = Boolean(
  searchParams?.get('catalog')?.trim() ||
    searchParams?.get('pay_client')?.trim() ||
    searchParams?.get('sub_pay')?.trim()
);
// Al volver desde el link de "recuperar contraseña" no se entra directo: se muestra el formulario de nueva clave
const isPasswordRecovery =
  typeof window !== 'undefined' &&
  (window.location.hash.includes('type=recovery') || Boolean(searchParams?.has('recuperar')));

if (isPasswordRecovery) {
  try {
    window.localStorage.removeItem('saas_distribuidoras_session_user_v2_zero');
  } catch {
    // ignore
  }
}

initInternalDatabase({deferCloudHydration: isStandalonePublicRoute || isPasswordRecovery}).finally(() => {
  const root = createRoot(document.getElementById('root')!);
  if (!isStandalonePublicRoute && !isSupabaseConfigured()) {
    root.render(<StartupErrorScreen kind="not_configured" />);
  } else if (getStartupError()) {
    root.render(<StartupErrorScreen kind="connection" error={getStartupError()} />);
  } else {
    if (!isStandalonePublicRoute && !isPasswordRecovery) restoreSessionUserFromCloud();
    root.render(<App />);
  }
});
