import { lazy, Suspense } from 'react';

/**
 * Rutas públicas (tienda, link de pago, pago de suscripción).
 * Se cargan sin el panel del comercio, así el cliente descarga mucho menos.
 */
const PublicCatalogView = lazy(() =>
  import('./components/PublicCatalogView').then((m) => ({ default: m.PublicCatalogView }))
);
const PublicClientPayView = lazy(() =>
  import('./components/PublicClientPayView').then((m) => ({ default: m.PublicClientPayView }))
);
const PublicTenantSubPayView = lazy(() =>
  import('./components/PublicTenantSubPayView').then((m) => ({ default: m.PublicTenantSubPayView }))
);

const Fallback = () => (
  <div className="flex items-center justify-center py-16 text-xs font-semibold text-slate-500">Cargando…</div>
);

// "Salir" de una ruta pública: abre la app normal (login / panel) sin parámetros
const exitToApp = () => {
  window.location.assign(window.location.pathname);
};

export default function PublicRoot() {
  const params = new URLSearchParams(window.location.search);
  const payClient = params.get('pay_client')?.trim();
  const catalog = params.get('catalog')?.trim();
  const subPay = params.get('sub_pay')?.trim();
  return (
    <Suspense fallback={<Fallback />}>
      {payClient ? (
        <PublicClientPayView token={payClient} onExitToApp={exitToApp} />
      ) : catalog ? (
        <PublicCatalogView catalogHandle={catalog} onExitToApp={exitToApp} />
      ) : subPay ? (
        <PublicTenantSubPayView token={subPay} onExitToApp={exitToApp} />
      ) : null}
    </Suspense>
  );
}
