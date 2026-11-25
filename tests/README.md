# Pruebas

| Comando | Qué prueba |
|---|---|
| `npm run test:unit` | Lógica sin navegador: envíos de WhatsApp, respaldos, vista previa del link, diseño de tienda, medios de pago. |
| `npm run test:e2e` | La app en Chromium con un Supabase simulado: login, panel, pedidos, aviso de pedido nuevo, diseño de tienda y tienda pública (también en celular). |
| `npm test` | Las dos. |

Las pruebas en el navegador arrancan la app sola (Vite en el puerto 5199) y no
usan tu Supabase real: los datos salen de `tests/e2e/fixtures.cjs`.

La primera vez en una PC nueva hay que bajar el navegador:

```bash
npx playwright install chromium
```

GitHub corre todo automáticamente en cada push (`.github/workflows/ci.yml`).
