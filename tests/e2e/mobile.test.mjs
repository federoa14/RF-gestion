// Celular: ninguna pantalla importante se corre de costado ni queda cortada (360 px y 320 px).
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fixtures, loginAsOwner, loginAsSuper, openCatalogSection, openPage, startApp, waitForPanel } from './helpers.mjs';
let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.stop(); });
async function audit(page, name) {
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const over = document.documentElement.scrollWidth - vw;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // ignorar lo que está dentro de un contenedor con scroll horizontal propio
      let p = el.parentElement, scrollParent = false;
      while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll' || o === 'hidden') && p.scrollWidth > p.clientWidth + 1 || o === 'hidden' && p.getBoundingClientRect().right <= vw + 1) { scrollParent = true; break; } p = p.parentElement; }
      if (scrollParent) continue;
      if (b.right > vw + 2 || b.left < -2) bad.push((el.tagName + '.' + String(el.className).slice(0, 50) + ' ' + (el.innerText || '').slice(0, 30).replace(/\n/g, ' ')) + ' [' + Math.round(b.left) + ',' + Math.round(b.right) + ']');
    }
    return { over, bad: bad.slice(0, 6), n: bad.length };
  });
  assert.equal(r.over, 0, name + ': la pantalla se corre de costado ' + r.over + ' px');
  assert.deepEqual(r.bad, [], name + ': hay elementos cortados');
}
for (const w of [360, 320]) {
  test('movil catalogo ' + w, async () => {
    const vp = { width: w, height: 740 };
    let { page, context } = await openPage(app.browser, fixtures.makeSeed(), vp);
    await loginAsOwner(page); await page.waitForSelector('text=Almacén Uno', { timeout: 20000 }); await page.keyboard.press('Escape');
    await page.locator('button[aria-label="Abrir menú lateral"]').first().click();
    await page.locator('button:visible', { hasText: 'Catálogo Online' }).first().click();
    await page.waitForSelector('[role=tablist][aria-label="Secciones del catálogo"]', { timeout: 15000 });
    await audit(page, w + '-cat-productos');
    await page.locator('[role=tablist][aria-label="Secciones del catálogo"] button', { hasText: 'Configuración' }).click();
    await audit(page, w + '-cat-config');
    await page.locator('button', { hasText: 'Diseño de página' }).click();
    await audit(page, w + '-cat-diseno');
    await page.locator('button[role=tab]', { hasText: 'Panel de gestión' }).click();
    await audit(page, w + '-cat-diseno-panel');
    await page.locator('[role=tablist][aria-label="Secciones del catálogo"] button', { hasText: 'Productos' }).click();
    await page.locator('button', { hasText: /Agregar|Nuevo producto|Cargar producto/ }).first().click();
    await page.waitForTimeout(600);
    await audit(page, w + '-cat-producto-form');
    await page.locator('button', { hasText: 'Escanear' }).first().click().catch(() => {});
    await audit(page, w + '-escaner');
    await context.close();
  });
  test('movil terminos ' + w, async () => {
    const seed = fixtures.makeSeed();
    seed.tables.businesses[0].data.subscription.termsAccepted = false;
    const { page, context } = await openPage(app.browser, seed, { width: w, height: 740 });
    await loginAsOwner(page);
    await page.waitForSelector('[aria-label="Aceptar Términos y Condiciones"]', { timeout: 20000 });
    await audit(page, w + '-terminos');
    await context.close();
  });
  test('movil super ' + w, async () => {
    const { page, context } = await openPage(app.browser, fixtures.makeSuperSeed(), { width: w, height: 740 });
    await page.waitForSelector('input[placeholder="Usuario o correo electrónico"]', { timeout: 20000 });
    await loginAsSuper(page);
    await page.waitForSelector('text=Cobranzas y Monetización', { timeout: 20000 });
    await page.locator('button', { hasText: 'Cobranzas y Monetización' }).scrollIntoViewIfNeeded();
    await page.locator('button', { hasText: 'Cobranzas y Monetización' }).click();
    await page.waitForTimeout(1000);
    await audit(page, w + '-super-regalo');
    await context.close();
  });
}

for (const w of [360, 320]) {
  test('movil tienda y panel ' + w, async () => {
    const vp = { width: w, height: 740 };
    let { page, context } = await openPage(app.browser, fixtures.makeStoreSeed({ canAccessFullFeatures: true, enablePromoClub: true }), { ...vp, path: '/?catalog=tienda' });
    await page.waitForSelector('[aria-label="Bienvenida a la tienda"]', { timeout: 20000 });
    await audit(page, w + '-tienda-bienvenida');
    const gate = page.locator('[aria-label="Bienvenida a la tienda"]');
    await gate.locator('input[autocomplete="given-name"]').fill('Lucía');
    await gate.locator('input[type=tel]').fill('11 5555 1234');
    await gate.locator('button[type=submit]').click();
    await gate.waitFor({ state: 'detached' });
    await audit(page, w + '-tienda');
    await page.locator('button', { hasText: 'Agregar al carrito' }).first().click();
    await page.locator('button', { hasText: 'Mi Carrito' }).first().click();
    await audit(page, w + '-tienda-carrito');
    await context.close();
    ({ page, context } = await openPage(app.browser, fixtures.makeSeed(), vp));
    await page.waitForSelector('input[placeholder="Usuario o correo electrónico"]', { timeout: 20000 });
    await audit(page, w + '-login');
    await loginAsOwner(page);
    await page.waitForSelector('text=Almacén Uno', { timeout: 20000 });
    await page.keyboard.press('Escape');
    await audit(page, w + '-panel');
    await page.locator('button', { hasText: /Cobrar/ }).first().click();
    await audit(page, w + '-mostrador');
    await context.close();
  });
}

for (const w of [360, 320]) {
  test('movil envio a todo el pais ' + w, async () => {
    const seed = fixtures.makeStoreSeed({ canAccessFullFeatures: true, allowDelivery: true, allowNationalShipping: true, nationalShippingNote: 'Despachamos por Correo Argentino' });
    const { page, context } = await openPage(app.browser, seed, { width: w, height: 740, path: '/?catalog=tienda' });
    const gate = page.locator('[aria-label="Bienvenida a la tienda"]');
    await gate.waitFor({ timeout: 20000 });
    await gate.locator('input[autocomplete="given-name"]').fill('Lucía');
    await gate.locator('input[type=tel]').fill('11 5555 1234');
    await gate.locator('button[type=submit]').click();
    await gate.waitFor({ state: 'detached' });
    await page.locator('button', { hasText: 'Agregar al carrito' }).first().click();
    await page.locator('button', { hasText: 'Mi Carrito' }).first().click();
    await page.locator('button', { hasText: 'Envío a domicilio' }).first().click();
    await page.locator('[role=radiogroup][aria-label="Alcance del envío"] button', { hasText: 'A todo el país' }).click();
    await page.locator('fieldset[aria-label="Datos para el envío a todo el país"]').scrollIntoViewIfNeeded();
    await audit(page, w + '-envio-pais');
    await context.close();
  });
}

for (const w of [360, 320]) {
  test('movil flyer QR y carritos ' + w, async () => {
    const seed = fixtures.makeSeed();
    const old = new Date(Date.now() - 8 * 3_600_000).toISOString();
    seed.tables.catalog_abandoned_carts = [{ business_id: 'biz1', id: 'c1', data: { id: 'c1', tenantId: 'biz1', customerName: 'Lucía Gómez', customerPhone: '1155550001', items: [{ productId: 'p1', productName: 'Yerba 1kg', unitPrice: 2500, quantity: 1, subtotal: 2500 }], totalAmount: 2500, currencySymbol: '$', status: 'abandoned', createdAt: old, updatedAt: old } }];
    const { page, context } = await openPage(app.browser, seed, { width: w, height: 740 });
    await loginAsOwner(page);
    await page.waitForSelector('text=Almacén Uno', { timeout: 20000 });
    await page.keyboard.press('Escape');
    await page.locator('button[aria-label="Abrir menú lateral"]').first().click();
    await page.locator('button:visible', { hasText: 'Catálogo Online' }).first().click();
    await page.waitForSelector('[aria-label="Carritos para recordar"]', { timeout: 15000 });
    await audit(page, w + '-aviso-carritos');
    await page.locator('[aria-label="Carritos para recordar"] button', { hasText: 'Ver y recordar' }).click();
    await page.waitForSelector('text=Listo para recordar');
    await audit(page, w + '-carritos');
    await page.locator('[role=tablist][aria-label="Secciones del catálogo"] button', { hasText: 'Productos' }).click();
    await page.locator('button', { hasText: 'Flyer con QR' }).click();
    await page.waitForSelector('img[alt="Vista previa del flyer con QR"]', { timeout: 15000 });
    await audit(page, w + '-flyer-qr');
    await context.close();
  });
}
