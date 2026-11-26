// Service worker mínimo: permite instalar la app en el celular. No guarda nada en caché,
// así que siempre se ve la versión más nueva.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Sin respondWith: el navegador resuelve el pedido con normalidad.
});
