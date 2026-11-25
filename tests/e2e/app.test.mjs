// Pruebas de punta a punta en el navegador (Chromium) con Supabase simulado.
// Correr con: npm run test:e2e
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fixtures, horizontalOverflow, loginAsOwner, openCatalogSection, openPage, startApp, waitForPanel } from './helpers.mjs';

let app;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app?.stop();
});

describe('Panel del comercio', () => {
  test('login: clave incorrecta avisa y la correcta entra y carga los datos', async () => {
    const { page, context, pageErrors } = await openPage(app.browser, fixtures.makeSeed());
    await page.waitForSelector('input[placeholder="Usuario o correo electrónico"]', { timeout: 20_000 });
    await loginAsOwner(page, 'mala');
    await page.waitForSelector('text=Usuario o contraseña incorrectos', { timeout: 10_000 });
    await loginAsOwner(page);
    await waitForPanel(page);
    assert.ok((await page.locator('text=Almacén Uno').count()) > 0, 'muestra la boleta del cliente');
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  test('guía de primeros pasos y menú Mi cuenta', async () => {
    const { page, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    const guide = page.locator('section[aria-label="Primeros pasos"]');
    assert.equal(await guide.count(), 1);
    assert.match(await guide.innerText(), /Llevás 1 de 6/);
    await page.locator('button[title="Mi cuenta"]').click();
    assert.match(await page.locator('[role=menu]').innerText(), /Cerrar sesión/);
    await context.close();
  });

  test('pedidos: fichas, filtros por estado, buscador y menú Más', async () => {
    const { page, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page, 'Pedidos y ventas');
    await page.waitForSelector('article >> text=#W-001');
    assert.equal(await page.locator('article').count(), 3);
    await page.locator('[role=tab]', { hasText: 'En camino' }).click();
    assert.equal(await page.locator('article').count(), 1);
    await page.locator('[role=tab]', { hasText: 'Todos' }).click();
    await page.fill('input[aria-label="Buscar pedidos"]', 'juan');
    assert.equal(await page.locator('article').count(), 1);
    await page.fill('input[aria-label="Buscar pedidos"]', '');
    await page.locator('button[aria-label="Más acciones del pedido #W-001"]').click();
    assert.ok((await page.locator('[role=menuitem]').count()) >= 4);
    await context.close();
  });

  test('aviso de pedido nuevo con contador en la pestaña', async () => {
    const { page, fake, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    fake.db.catalog_orders.push(fixtures.mkOrder(9, { customerName: 'Lucía Nueva' }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForSelector('text=¡Entró un pedido nuevo!', { timeout: 10_000 });
    assert.match(await page.title(), /^\(2\)/);
    await page.locator('button', { hasText: 'Ver pedido' }).click();
    await page.waitForSelector('article >> text=Lucía Nueva', { timeout: 10_000 });
    await context.close();
  });

  test('catálogo: secciones agrupadas y diseño de tienda guardado', async () => {
    const { page, fake, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page, 'Configuración');
    await page.locator('button', { hasText: 'Bordó' }).click();
    await page.locator('[role=radiogroup][aria-label="Estilo de las tarjetas"] button', { hasText: 'Con sombra' }).click();
    await page.locator('form button[type=submit]', { hasText: /Guardar/ }).first().click();
    await page.waitForTimeout(1500);
    const published = fake.db.public_catalogs?.[0]?.snapshot;
    assert.equal(published?.storeTheme?.palette, 'bordo');
    assert.equal(published?.storeTheme?.cardStyle, 'sombra');
    await context.close();
  });

  test('celular (390 px): el panel no se corre de costado', async () => {
    const { page, context } = await openPage(app.browser, fixtures.makeSeed(), { width: 390, height: 844 });
    await loginAsOwner(page);
    await page.waitForTimeout(2500);
    assert.equal(await horizontalOverflow(page), 0);
    await context.close();
  });
});

describe('Tienda pública', () => {
  test('muestra productos, solo los medios de pago elegidos y sin desbordar en 360 px', async () => {
    const { page, context, pageErrors } = await openPage(app.browser, fixtures.makeStoreSeed({ paymentMethods: { efectivo: true } }), {
      width: 360,
      height: 760,
      path: '/?catalog=tienda',
    });
    await page.waitForSelector('text=Yerba 1kg', { timeout: 20_000 });
    assert.equal(await horizontalOverflow(page), 0);
    assert.match(await page.locator('body').innerText(), /Efectivo/);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  test('aplica el diseño de Plan 3 y no lo aplica sin diseño', async () => {
    for (const [theme, expected] of [
      [{ palette: 'bordo', font: 'lora' }, 'Lora'],
      [undefined, 'Plus Jakarta Sans'],
    ]) {
      const { page, context } = await openPage(app.browser, fixtures.makeStoreSeed({ storeTheme: theme, canAccessFullFeatures: true }), {
        path: '/?catalog=tienda',
      });
      await page.waitForSelector('text=Yerba 1kg', { timeout: 20_000 });
      const font = await page.evaluate(() => getComputedStyle(document.querySelector('.rf-store')).fontFamily);
      assert.ok(font.includes(expected), `${font} debería incluir ${expected}`);
      await context.close();
    }
  });
});
