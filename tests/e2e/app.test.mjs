// Pruebas de punta a punta en el navegador (Chromium) con Supabase simulado.
// Correr con: npm run test:e2e
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fixtures, horizontalOverflow, loginAsOwner, loginAsSuper, openCatalogSection, openPage, startApp, waitForPanel } from './helpers.mjs';

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

  test('catálogo: diseño de página guarda y publica el diseño de la tienda', async () => {
    const { page, fake, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page, 'Configuración');
    await page.locator('button', { hasText: 'Diseño de página' }).click();
    await page.locator('button', { hasText: 'Bordó' }).click();
    await page.locator('[role=radiogroup][aria-label="Estilo de las tarjetas"] button', { hasText: 'Con sombra' }).click();
    await page.locator('button', { hasText: 'Guardar diseño' }).click();
    await page.waitForTimeout(2000);
    const published = fake.db.public_catalogs?.[0]?.snapshot;
    assert.equal(published?.storeTheme?.palette, 'bordo');
    assert.equal(published?.storeTheme?.cardStyle, 'sombra');
    await context.close();
  });

  test('diseño de página: el panel toma el color elegido', async () => {
    const { page, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page, 'Configuración');
    await page.locator('button', { hasText: 'Diseño de página' }).click();
    await page.locator('button[role=tab]', { hasText: 'Panel de gestión' }).click();
    await page.locator('button', { hasText: 'Bordó' }).click();
    await page.locator('button', { hasText: 'Guardar diseño' }).click();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.rf-panel[data-themed="true"]').count(), 1);
    assert.equal(
      await page.locator('.rf-panel').evaluate((el) => el.style.getPropertyValue('--panel-primary')),
      '#7F1D1D'
    );
    await context.close();
  });

  test('filtros: se pueden quitar los predeterminados y agregar propios, y se publican', async () => {
    const { page, fake, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page, 'Configuración');
    const mainInput = page.locator('input[placeholder^="Agregar filtro principal"]');
    await mainInput.scrollIntoViewIfNeeded();
    // quita todos los filtros predeterminados
    for (let i = 0; i < 12; i++) {
      const del = page.locator('button[title^="Quitar "]').first();
      if ((await del.count()) === 0) break;
      const title = await del.getAttribute('title');
      if (title && /Libros/.test(title)) break;
      await del.click();
      await page.waitForTimeout(150);
    }
    await mainInput.fill('Libros');
    await mainInput.press('Enter');
    await page.locator('input[placeholder^="Agregar subfiltro"]').fill('Infantiles');
    await page.locator('input[placeholder^="Agregar subfiltro"]').press('Enter');
    await page.waitForTimeout(2000);
    const snap = fake.db.public_catalogs?.[0]?.snapshot;
    assert.ok(snap, 'se publicó la tienda');
    assert.deepEqual(snap.rubroFilters, ['Libros']);
    assert.deepEqual(snap.customSubfilters, ['Infantiles']);
    await context.close();
  });

  test('diseño de página: bloqueado en Plan 2', async () => {
    const seed = fixtures.makeSeed();
    seed.tables.businesses[0].data.subscription.planTier = 'web';
    const { page, context } = await openPage(app.browser, seed);
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page, 'Configuración');
    await page.locator('button', { hasText: 'Diseño de página' }).click();
    await page.waitForSelector('text=exclusiva de', { timeout: 10_000 });
    assert.equal(await page.locator('button', { hasText: 'Guardar diseño' }).isDisabled(), true);
    assert.equal(await page.locator('button', { hasText: 'Bordó' }).isDisabled(), true);
    await context.close();
  });

  test('términos y condiciones: obligatorios la primera vez y no se repiten', async () => {
    const seed = fixtures.makeSeed();
    seed.tables.businesses[0].data.subscription.termsAccepted = false;
    delete seed.tables.businesses[0].data.subscription.termsVersion;
    const { page, context } = await openPage(app.browser, seed);
    await loginAsOwner(page);
    await page.waitForSelector('[aria-label="Aceptar Términos y Condiciones"]', { timeout: 20_000 });
    const accept = page.locator('button', { hasText: 'Aceptar y continuar' });
    assert.equal(await accept.isDisabled(), true);
    await page.locator('[aria-label="Aceptar Términos y Condiciones"] input[type=checkbox]').check();
    await accept.click();
    await waitForPanel(page);
    assert.equal(await page.locator('[aria-label="Aceptar Términos y Condiciones"]').count(), 0);
    await context.close();
  });

  test('venta de mostrador: se abre desde el encabezado', async () => {
    const { page, context } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    await page.locator('button', { hasText: 'Cobrar / Venta' }).click();
    await page.waitForSelector('[aria-label="Venta de mostrador"]', { timeout: 5_000 });
    assert.ok((await page.locator('button', { hasText: 'Escanear código' }).count()) > 0);
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

describe('Bienvenida de la tienda', () => {
  const clubSeed = () => fixtures.makeStoreSeed({ canAccessFullFeatures: true, enablePromoClub: true, enableLoyaltyProgram: true });

  test('entrar es libre: sin registrarse no se pide nada y no se vuelve a preguntar', async () => {
    const { page, context, pageErrors } = await openPage(app.browser, clubSeed(), { path: '/?catalog=tienda' });
    const gate = page.locator('[aria-label="Bienvenida a la tienda"]');
    await gate.waitFor({ timeout: 20_000 });
    assert.equal(await gate.locator('input[type=tel]').count(), 0, 'no pide teléfono para entrar');
    await gate.locator('button[type=submit]').click();
    await gate.waitFor({ state: 'detached', timeout: 5_000 });
    await page.reload();
    await page.waitForSelector('text=Yerba 1kg', { timeout: 20_000 });
    await page.waitForTimeout(800);
    assert.equal(await page.locator('[aria-label="Bienvenida a la tienda"]').count(), 0);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  test('quien se suma al club deja nombre, DNI y teléfono: quedan registrados y precargan el carrito', async () => {
    const { page, fake, context, pageErrors } = await openPage(app.browser, clubSeed(), { path: '/?catalog=tienda' });
    const gate = page.locator('[aria-label="Bienvenida a la tienda"]');
    await gate.waitFor({ timeout: 20_000 });
    await gate.locator('input[type=checkbox]').check();
    await gate.locator('button[type=submit]').click();
    await page.waitForSelector('text=Ingresá tu nombre.', { timeout: 5_000 });
    await gate.locator('input[autocomplete="given-name"]').fill('Lucía');
    await gate.locator('button[type=submit]').click();
    await page.waitForSelector('text=DNI', { timeout: 5_000 });
    assert.equal(await gate.count(), 1);
    await gate.locator('input[inputmode="numeric"]').fill('30123456');
    await gate.locator('input[type=tel]').fill('11 5555 1234');
    await gate.locator('button[type=submit]').click();
    await gate.waitFor({ state: 'detached', timeout: 5_000 });
    await page.waitForTimeout(1500);
    const sent = JSON.stringify(fake.log.filter((l) => l.kind === 'rpc'));
    assert.match(sent, /"dni":"30123456"/);
    assert.match(sent, /catalog_loyalty_accounts/);
    await page.locator('button', { hasText: 'Agregar al carrito' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'Mi Carrito' }).first().click();
    await page.waitForTimeout(600);
    const values = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value));
    assert.ok(values.includes('Lucía'), 'nombre precargado en el carrito');
    assert.ok(values.includes('11 5555 1234'), 'teléfono precargado en el carrito');
    assert.ok(values.includes('30123456'), 'DNI precargado para los puntos');
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  test('producto agotado: si ya está registrado, "avisame" se anota con un toque', async () => {
    const seed = fixtures.makeStoreSeed({ canAccessFullFeatures: true, enablePromoClub: true });
    seed.catalog.products = [{ ...seed.catalog.products[0], stockQuantity: 0 }, seed.catalog.products[1]];
    const { page, fake, context } = await openPage(app.browser, seed, { path: '/?catalog=tienda' });
    const gate = page.locator('[aria-label="Bienvenida a la tienda"]');
    await gate.waitFor({ timeout: 20_000 });
    await gate.locator('input[type=checkbox]').check();
    await gate.locator('input[autocomplete="given-name"]').fill('Lucía');
    await gate.locator('input[inputmode="numeric"]').fill('30123456');
    await gate.locator('input[type=tel]').fill('11 5555 1234');
    await gate.locator('button[type=submit]').click();
    await gate.waitFor({ state: 'detached' });
    await page.locator('button', { hasText: 'Avisar cuando haya stock' }).first().click();
    await page.waitForTimeout(1500);
    const sent = JSON.stringify(fake.log.filter((l) => l.kind === 'rpc'));
    assert.match(sent, /catalog_stock_alerts/);
    assert.match(sent, /"customerDni":"30123456"/);
    assert.match(sent, /"customerName":"Lucía"/);
    await context.close();
  });
});

describe('Envío a todo el país', () => {
  async function enterStore(page) {
    await page.waitForSelector('text=Yerba 1kg', { timeout: 20_000 });
    const gate = page.locator('[aria-label="Bienvenida a la tienda"]');
    if (await gate.isVisible().catch(() => false)) {
      await gate.locator('input[type=checkbox]').check();
      await gate.locator('input[autocomplete="given-name"]').fill('Lucía');
      await gate.locator('input[inputmode="numeric"]').fill('30123456');
      await gate.locator('input[type=tel]').fill('11 5555 1234');
      await gate.locator('button[type=submit]').click();
      await gate.waitFor({ state: 'detached' });
    }
    await page.locator('button', { hasText: 'Agregar al carrito' }).first().click();
    await page.locator('button', { hasText: 'Mi Carrito' }).first().click();
    await page.locator('button', { hasText: 'Envío a domicilio' }).first().click();
  }

  test('Plan 3: pide todos los datos y guarda el pedido con el destinatario completo', async () => {
    const seed = fixtures.makeStoreSeed({ canAccessFullFeatures: true, allowDelivery: true, allowNationalShipping: true, nationalShippingNote: 'Despachamos por Correo Argentino', paymentMethods: { efectivo: true } });
    const { page, fake, context, pageErrors } = await openPage(app.browser, seed, { path: '/?catalog=tienda' });
    await enterStore(page);
    await page.locator('[role=radiogroup][aria-label="Alcance del envío"] button', { hasText: 'A todo el país' }).click();
    const box = page.locator('fieldset[aria-label="Datos para el envío a todo el país"]');
    await box.waitFor({ timeout: 5_000 });
    assert.match(await box.innerText(), /Correo Argentino/);
    // sin completar no deja confirmar
    await page.locator('button', { hasText: 'Confirmar pedido' }).click();
    await page.waitForSelector('text=DNI', { timeout: 5_000 });
    await box.locator('input[placeholder="Ej. Lucía Pérez"]').fill('Lucía Pérez');
    await box.locator('input[placeholder="Solo números"]').fill('30123456');
    await box.locator('label', { hasText: 'Calle *' }).locator('input').fill('Av. Siempre Viva');
    await box.locator('label', { hasText: 'Altura *' }).locator('input').fill('742');
    await box.locator('label', { hasText: 'Localidad *' }).locator('input').fill('Rosario');
    await box.locator('label', { hasText: 'Código postal *' }).locator('input').fill('2000');
    await box.locator('select').selectOption('Santa Fe');
    await page.locator('button', { hasText: 'Confirmar pedido' }).click();
    await page.waitForTimeout(2500);
    const sent = JSON.stringify(fake.log.filter((l) => l.kind === 'rpc'));
    assert.match(sent, /"deliveryScope":"nacional"/);
    assert.match(sent, /"postalCode":"2000"/);
    assert.match(sent, /"province":"Santa Fe"/);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  test('sin Plan 3 no se ofrece el envío a todo el país', async () => {
    const seed = fixtures.makeStoreSeed({ canAccessFullFeatures: false, planTier: 'web', allowDelivery: true, allowNationalShipping: true });
    const { page, context } = await openPage(app.browser, seed, { path: '/?catalog=tienda' });
    await enterStore(page);
    assert.equal(await page.locator('text=A todo el país').count(), 0);
    await context.close();
  });
});

describe('Venta de mostrador y caja del día', () => {
  const seedWithProduct = () => {
    const seed = fixtures.makeSeed({ withOrders: false });
    const now = new Date().toISOString();
    seed.tables.catalog_products = [{ business_id: 'biz1', id: 'p1', data: { id: 'p1', name: 'Yerba 1kg', description: '', price: 2500, category: 'Almacén', available: true, sku: '7790001', stockQuantity: 10, createdAt: now, updatedAt: now } }];
    return seed;
  };

  test('pago mixto con saldo a cuenta: queda registrado en la caja del día y se puede cobrar después', async () => {
    const { page, context, pageErrors } = await openPage(app.browser, seedWithProduct());
    await loginAsOwner(page);
    await waitForPanel(page);
    await page.locator('button', { hasText: 'Cobrar / Venta' }).click();
    const dlg = page.locator('[aria-label="Venta de mostrador"]');
    await dlg.locator('input[placeholder^="O buscá a mano"]').fill('Yerba');
    await dlg.locator('button', { hasText: 'Yerba 1kg' }).first().click();
    await dlg.locator('button[role=radio]', { hasText: 'Mixto' }).click();
    await dlg.locator('input[aria-label="Monto en Efectivo"]').fill('1000');
    await dlg.locator('input[aria-label="Monto en Transferencia"]').fill('1000');
    // sin nombre no deja saldo a cuenta
    await dlg.locator('button', { hasText: /^Cobrar$/ }).last().click();
    await page.waitForSelector('text=escribí el nombre del cliente', { timeout: 5_000 });
    await dlg.locator('input[placeholder="Nombre del cliente"]').fill('Doña Rosa');
    await dlg.locator('button', { hasText: /^Cobrar$/ }).last().click();
    await dlg.waitFor({ state: 'detached', timeout: 5_000 });
    // caja del día
    await openCatalogSection(page, 'Pedidos y ventas');
    await page.locator('button', { hasText: 'Caja del día' }).click();
    const caja = page.locator('[aria-label="Caja del día"]');
    await caja.waitFor({ timeout: 10_000 });
    const text = await caja.innerText();
    assert.match(text, /Efectivo\s*\$\s*1\.000/);
    assert.match(text, /Transferencia\s*\$\s*1\.000/);
    assert.match(text, /A cuenta \(por cobrar\)\s*\$\s*500/);
    assert.match(text, /Doña Rosa/);
    // cuando el cliente paga el saldo
    await caja.locator('button', { hasText: 'Cobró en efectivo' }).click();
    await page.waitForTimeout(500);
    const after = await caja.innerText();
    assert.match(after, /Efectivo\s*\$\s*1\.500/);
    assert.match(after, /A cuenta \(por cobrar\)\s*\$\s*0/);
    assert.equal(await caja.locator('button', { hasText: 'Cobró en efectivo' }).count(), 0);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  test('efectivo: calcula el vuelto, y la caja se puede mirar por día', async () => {
    const { page, context } = await openPage(app.browser, seedWithProduct());
    await loginAsOwner(page);
    await waitForPanel(page);
    await page.locator('button', { hasText: 'Cobrar / Venta' }).click();
    const dlg = page.locator('[aria-label="Venta de mostrador"]');
    await dlg.locator('input[placeholder^="O buscá a mano"]').fill('Yerba');
    await dlg.locator('button', { hasText: 'Yerba 1kg' }).first().click();
    await dlg.locator('input#cash-given').fill('3000');
    await page.waitForSelector('text=Vuelto: $ 500', { timeout: 5_000 });
    await dlg.locator('button', { hasText: /^Cobrar$/ }).last().click();
    await dlg.waitFor({ state: 'detached' });
    await openCatalogSection(page, 'Pedidos y ventas');
    await page.locator('button', { hasText: 'Caja del día' }).click();
    const caja = page.locator('[aria-label="Caja del día"]');
    assert.match(await caja.innerText(), /Efectivo\s*\$\s*2\.500/);
    // ayer no hubo ventas
    await caja.locator('button', { hasText: 'Ayer' }).click();
    await page.waitForSelector('text=No hay ventas registradas en este día.', { timeout: 5_000 });
    assert.match(await caja.innerText(), /Efectivo\s*\$\s*0/);
    await context.close();
  });
});

describe('Flyer con QR y recordatorio de carritos', () => {
  test('flyer con QR: se arma con los datos de la tienda, se edita y se descarga', async () => {
    const { page, context, pageErrors } = await openPage(app.browser, fixtures.makeSeed());
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page);
    await page.locator('button', { hasText: 'Flyer con QR' }).click();
    const dlg = page.locator('[aria-label="Flyer con QR de la tienda"]');
    await dlg.waitFor({ timeout: 10_000 });
    await page.waitForFunction(() => document.querySelector('img[alt="Vista previa del flyer con QR"]')?.getAttribute('src')?.startsWith('data:image/png'), null, { timeout: 15_000 });
    assert.match(await dlg.innerText(), /\?catalog=/);
    // se puede editar el título y el nombre
    await dlg.locator('label', { hasText: 'Título superior' }).locator('input').fill('TIENDA ONLINE');
    await dlg.locator('label', { hasText: 'Nombre de la tienda' }).locator('input').fill('Librería Prueba');
    await page.waitForTimeout(800);
    const [download] = await Promise.all([page.waitForEvent('download'), dlg.locator('button', { hasText: 'Descargar flyer' }).click()]);
    assert.match(download.suggestedFilename(), /^flyer-qr-libreria-prueba-a4\.png$/);
    const [qrDownload] = await Promise.all([page.waitForEvent('download'), dlg.locator('button', { hasText: 'Descargar solo el QR' }).click()]);
    assert.match(qrDownload.suggestedFilename(), /^qr-libreria-prueba\.png$/);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  test('carritos: avisa quién dejó un carrito y cuándo conviene recordarlo', async () => {
    const seed = fixtures.makeSeed();
    const hAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
    const mk = (id, name, phone, h) => ({ business_id: 'biz1', id, data: { id, tenantId: 'biz1', customerName: name, customerPhone: phone, items: [{ productId: 'p1', productName: 'Yerba 1kg', unitPrice: 2500, quantity: 1, subtotal: 2500 }], totalAmount: 2500, currencySymbol: '$', status: 'abandoned', createdAt: hAgo(h), updatedAt: hAgo(h) } });
    seed.tables.catalog_abandoned_carts = [mk('cart-1', 'Lucía Gómez', '1155550001', 8), mk('cart-2', 'Pedro Nuevo', '1155550002', 1)];
    const { page, context } = await openPage(app.browser, seed);
    await loginAsOwner(page);
    await waitForPanel(page);
    await openCatalogSection(page);
    const strip = page.locator('[aria-label="Carritos para recordar"]');
    await strip.waitFor({ timeout: 15_000 });
    const text = await strip.innerText();
    assert.match(text, /Lucía Gómez/);
    assert.match(text, /1155550001/);
    assert.doesNotMatch(text, /Pedro Nuevo/, 'el carrito de hace 1 h todavía no está listo');
    await strip.locator('button', { hasText: 'Ver y recordar' }).click();
    await page.waitForSelector('text=Listo para recordar', { timeout: 10_000 });
    await page.waitForSelector('text=Esperando', { timeout: 5_000 });
    await context.close();
  });
});

describe('Logo del comercio', () => {
  // Un logo redondo (u octogonal, etc.) con fondo transparente se ve con su propia forma:
  // sin cuadro, borde ni fondo detrás.
  const logo = 'data:image/png;base64,' + readFileSync(new URL('./assets/logo-circle.png', import.meta.url)).toString('base64');
  const boxStyle = (img) =>
    img.evaluate((el) => {
      const cs = getComputedStyle(el.parentElement);
      return { bg: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, overflow: cs.overflow, fit: getComputedStyle(el).objectFit };
    });

  test('panel: el logo no queda dentro de un cuadrito', async () => {
    const seed = fixtures.makeSeed();
    seed.tables.business_settings[0].config.distributorLogoUrl = logo;
    const { page, context } = await openPage(app.browser, seed);
    await loginAsOwner(page);
    await waitForPanel(page);
    const st = await boxStyle(page.locator('aside img[alt="Distribuidora Uno"]').first());
    assert.equal(st.bg, 'rgba(0, 0, 0, 0)');
    assert.equal(st.border, '0px');
    assert.equal(st.radius, '0px');
    assert.equal(st.fit, 'contain');
    await context.close();
  });

  test('tienda: el logo del encabezado y de la portada va sin fondo', async () => {
    const { page, context } = await openPage(app.browser, fixtures.makeStoreSeed({ logoUrl: logo }), { path: '/?catalog=tienda' });
    await page.waitForSelector('text=Yerba 1kg', { timeout: 20_000 });
    const imgs = page.locator('img[alt="Tienda Uno"]');
    assert.ok((await imgs.count()) >= 2);
    for (let i = 0; i < (await imgs.count()); i++) {
      const st = await boxStyle(imgs.nth(i));
      assert.equal(st.bg, 'rgba(0, 0, 0, 0)', `logo ${i}: fondo`);
      assert.equal(st.border, '0px', `logo ${i}: borde`);
      // la portada tampoco lo mete en un recuadro blanco
      const grand = await imgs.nth(i).evaluate((el) => getComputedStyle(el.parentElement.parentElement).backgroundColor);
      assert.notEqual(grand, 'rgba(255, 255, 255, 0.95)', `logo ${i}: recuadro blanco`);
    }
    await context.close();
  });
});

describe('App instalable', () => {
  test('la tienda usa su propio manifiesto y el panel el nombre de la empresa', async () => {
    let { page, context } = await openPage(app.browser, fixtures.makeStoreSeed(), { path: '/?catalog=tienda' });
    await page.waitForSelector('text=Yerba 1kg', { timeout: 20_000 });
    assert.match(await page.locator('link[rel=manifest]').getAttribute('href'), /\/api\/store-manifest\?catalog=tienda/);
    assert.match(await page.locator('link[rel=apple-touch-icon]').getAttribute('href'), /\/api\/icon\?catalog=tienda/);
    await context.close();
    ({ page, context } = await openPage(app.browser, fixtures.makeSeed()));
    await loginAsOwner(page);
    await waitForPanel(page);
    await page.waitForTimeout(500);
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    assert.match(href, /^blob:/);
    const manifest = await page.evaluate(async (u) => (await fetch(u)).json(), href);
    assert.equal(manifest.name, 'Distribuidora Uno');
    assert.equal(manifest.display, 'standalone');
    await context.close();
  });
});

describe('SuperGestión', () => {
  test('regalar 1 año: botón visible, pide confirmación y deja 12 meses cubiertos', async () => {
    const { page, fake, context, pageErrors } = await openPage(app.browser, fixtures.makeSuperSeed());
    await page.waitForSelector('input[placeholder="Usuario o correo electrónico"]', { timeout: 20_000 });
    await loginAsSuper(page);
    await page.waitForSelector('text=Cobranzas y Monetización', { timeout: 20_000 });
    await page.locator('button', { hasText: 'Cobranzas y Monetización' }).click();
    await page.waitForSelector('text=Regalar un año:', { timeout: 10_000 });
    const gift = page.locator('button', { hasText: 'Regalar 1 año' }).first();
    await gift.waitFor({ timeout: 10_000 });
    let dialogText = '';
    page.once('dialog', (d) => {
      dialogText = d.message();
      d.accept();
    });
    await gift.click();
    await page.waitForSelector('text=Le regalaste 1 año', { timeout: 10_000 });
    assert.match(dialogText, /sin cobrarle/);
    await page.waitForTimeout(2500);
    const sub = fake.db.businesses.find((b) => b.id === 'biz1')?.data?.subscription;
    assert.ok(sub?.annualPlanUntilMonth, 'quedó cubierto el año');
    assert.equal((sub.paymentHistory || []).length, 12);
    assert.equal((sub.paymentHistory || []).reduce((a, p) => a + p.amountPaid, 0), 0);
    assert.equal(await page.locator('button', { hasText: 'Regalar 1 año' }).count(), 0, 'ya no se ofrece');
    assert.deepEqual(pageErrors, []);
    await context.close();
  });
});
