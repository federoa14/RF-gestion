import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initInternalDatabase} from './utils/localInternalDb';

const searchParams =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isStandalonePublicRoute = Boolean(
  searchParams?.get('catalog')?.trim() || searchParams?.get('pay_client')?.trim()
);

initInternalDatabase({deferCloudHydration: isStandalonePublicRoute}).finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
