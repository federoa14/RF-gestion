// Graba pantallas de la app real con datos FICTICIOS (Supabase simulado de tests/e2e).
// Uso: node tareas/video/demo/capturar.mjs <carpeta-salida>
import { startApp, makeFake, loginAsOwner, fixtures, BASE_URL } from '../../../tests/e2e/helpers.mjs';
import fs from 'node:fs';

const out = process.argv[2] || 'tareas/video/salida/capturas';
fs.mkdirSync(out, { recursive: true });
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const inDays = (n) => daysAgo(-n);

const STORE = [
  ['Gaseosa Cola 2,25 L', 1850, 'Bebidas'], ['Agua mineral 1,5 L', 900, 'Bebidas'], ['Yerba mate 1 kg', 3200, 'Almacén'],
  ['Galletitas surtidas', 1400, 'Almacén'], ['Aceite girasol 900 ml', 2600, 'Almacén'], ['Detergente 750 ml', 1700, 'Limpieza'],
].map(([name, price, category], i) => ({ id: 'p' + i, name, price, category, available: true, stock: 40, description: '', createdAt: '2026-11-01', updatedAt: '2026-11-01' }));

function demoSeed() {
  const s = fixtures.makeSeed();
  const nombres = ['Almacén Don José', 'Kiosco La Esquina', 'Despensa Mary', 'Autoservicio Norte', 'Maxikiosco 24', 'Almacén El Trébol'];
  s.tables.clients = nombres.map((n, i) => ({ business_id: 'biz1', id: 'c' + i, data: { id: 'c' + i, name: n, phone: '34100000' + (10 + i), address: ['San Martín 120', 'Belgrano 455', 'Mitre 88', 'Rivadavia 1020', 'Urquiza 310', 'Sarmiento 77'][i], zone: ['Centro', 'Norte', 'Sur'][i % 3], contactPerson: '', email: '', createdAt: '2026-11-01' } }));
  const b = (i, ci, amount, sale, due, status = 'pending') => ({ business_id: 'biz1', id: 'b' + i, archived: false, data: { id: 'b' + i, boletaNumber: 'B-00' + (10 + i), clientId: 'c' + ci, clientName: nombres[ci], salespersonId: '', salespersonName: ['Lucas', 'Sofía', 'Mostrador'][i % 3], saleDate: sale, amount, termDays: 7, dueDate: due, isSigned: true, status, remindersLog: [], createdAt: sale } });
  s.tables.boletas = [
    b(1, 0, 48500, daysAgo(10), daysAgo(3)), b(2, 1, 22300, daysAgo(6), inDays(1)), b(3, 2, 67900, daysAgo(4), inDays(3)),
    b(4, 3, 35200, daysAgo(9), daysAgo(2)), b(5, 4, 18750, daysAgo(2), inDays(5)), b(6, 5, 91400, daysAgo(3), inDays(4)),
    b(7, 0, 27600, daysAgo(1), inDays(6)), b(8, 2, 31800, daysAgo(15), daysAgo(8)),
  ];
  // Cobros ya hechos (archivados como pagados)
  [[0, 52300, 4], [1, 19900, 3], [3, 44100, 2], [4, 23600, 1], [5, 38700, 1]].forEach(([ci, amount, d], k) => {
    const row = b(20 + k, ci, amount, daysAgo(d + 7), daysAgo(d), 'paid');
    row.archived = true; row.data.paidAt = daysAgo(d);
    s.tables.boletas.push(row);
  });
  s.tables.catalog_products = STORE.map((p) => ({ business_id: 'biz1', id: p.id, data: { ...p, sku: '779' + p.id } }));
  return s;
}

// 390 px de ancho a escala 2.77 = 1080 px reales: nítido para un reel vertical.
async function open(browser, seed, vp, path = '/') {
  const fake = makeFake(seed);
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1080 / vp.width, isMobile: true, hasTouch: true });
  await fake.install(context);
  const page = await context.newPage();
  await page.goto(BASE_URL + path);
  return { page, context, fake };
}

const shot = (page, name, opts = {}) => page.screenshot({ path: `${out}/${name}.png`, ...opts });
const calm = async (page) => {
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(100); }
  await page.locator('[aria-label="Ocultar primeros pasos"]').click().catch(() => {});
  await page.waitForTimeout(4500); // que se vaya el aviso de bienvenida
};

const app = await startApp();
try {
  const vp = { width: 390, height: 844 };
  let { page, context } = await open(app.browser, demoSeed(), vp);
  await loginAsOwner(page);
  await page.waitForSelector('text=Almacén Don José', { timeout: 20000 });
  await calm(page);
  await shot(page, 'a-panel');
  await shot(page, 'a-panel-full', { fullPage: true });
  // Primera boleta (tarjeta completa)
  await page.locator('text=Prioridad de cobro').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120)); await page.waitForTimeout(500);
  await shot(page, 'b-boleta');
  // Mensaje de WhatsApp al cliente
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
    page.locator('button:visible', { hasText: /^Cliente$/ }).first().click(),
  ]);
  await page.waitForTimeout(800);
  if (popup) { fs.writeFileSync(`${out}/c-wa-url.txt`, popup.url()); await popup.close(); }
  await shot(page, 'c-tras-cliente');
  await calm(page);
  // Menú lateral
  await page.locator('button[aria-label="Abrir menú lateral"]').first().click();
  await page.waitForTimeout(700);
  await shot(page, 'd-menu');
  const aside = page.locator('aside').first();
  await aside.evaluate((el) => { const sc = [el, ...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 20); if (sc) sc.scrollTop = 99999; });
  await page.waitForTimeout(400);
  await shot(page, 'd-menu-abajo');
  await page.keyboard.press('Escape'); await page.locator('[aria-label="Cerrar navegación"]').click().catch(() => {});
  await page.waitForTimeout(500);
  // Cobrar / venta de mostrador
  await page.mouse.click(385, 420); await page.waitForTimeout(600);
  await page.locator('button[title^="Vender en el mostrador"]').first().click({ force: true });
  await page.waitForTimeout(1200);
  await shot(page, 'e-cobrar');
  const buscar = page.locator('input[placeholder^="O buscá a mano"]').first();
  for (const q of ['Yerba', 'Gaseosa', 'Galletitas']) {
    await buscar.fill(q); await page.waitForTimeout(500);
    await page.locator('button:visible', { hasText: q }).last().click().catch((e) => console.log('mostrador', q, e.message.split('\n')[0]));
    await page.waitForTimeout(400);
  }
  await shot(page, 'e-cobrar-items');
  await context.close();

  // Tienda pública
  ({ page, context } = await open(app.browser, fixtures.makeStoreSeed({ storeName: 'Distribuidora Uno', tagline: 'Pedí online y retirá o recibí en tu comercio', products: STORE, paymentMethods: { efectivo: true, transferencia: true } }), vp, '/?catalog=tienda'));
  await page.waitForTimeout(3000);
  await shot(page, 'f-tienda-entrada');
  // Si pide nombre y teléfono, se completa con datos ficticios
  const nombre = page.locator('input[placeholder="Ej. Lucía"]').first();
  if (await nombre.isVisible().catch(() => false)) {
    await nombre.fill('Kiosco La Esquina');
    await page.locator('input[placeholder^="Ej. 11"]').first().fill('1155550000').catch(() => {});
    await page.locator('button:visible', { hasText: /Entrar|Ver|Continuar|Ingresar/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  await shot(page, 'f-tienda');
  await page.locator('button:visible', { hasText: /Agregar|\+/ }).first().click().catch(() => {});
  await page.locator('button:visible', { hasText: /Agregar|\+/ }).nth(2).click().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, 'f-tienda-carrito');
  await shot(page, 'f-tienda-full', { fullPage: true });
  await context.close();
} finally {
  await app.stop();
}
console.log('ok');
