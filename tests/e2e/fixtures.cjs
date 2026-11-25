// Datos de prueba: un comercio con un cliente, una boleta vencida y pedidos web.
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const OWNER = { id: '00000000-0000-0000-0000-0000000000a1', email: 'dueno@prueba.test', password: 'secreto1' };

function mkOrder(n, overrides = {}) {
  const now = new Date().toISOString();
  const item = (id, name, qty, price, variantLabel) => ({ productId: id, productName: name, quantity: qty, unitPrice: price, subtotal: qty * price, sku: 'SKU-' + id, variantLabel });
  const items = [item('p1', 'Gaseosa Cola 2,25 L', 6, 1850), item('p2', 'Agua sin gas 1,5 L', 12, 900), item('p3', 'Remera algodón', 2, 7500, 'Talle M / Negro')].slice(0, n + 1);
  const data = {
    id: 'o' + n, orderNumber: 'W-00' + n, tenantId: 'biz1', storeName: 'Distribuidora Uno',
    customerName: ['María González', 'Kiosco El Sol', 'Juan Pérez'][n - 1] || 'Cliente ' + n, customerPhone: '11 5566-778' + n,
    deliveryMethod: n === 2 ? 'envio' : 'retiro', deliveryAddress: n === 2 ? 'Av. Siempre Viva 742' : undefined,
    preferredPaymentMethod: ['transferencia', 'efectivo', 'link_pago'][n - 1] || 'acordar', paymentStatus: 'pendiente',
    items, totalAmount: items.reduce((a, it) => a + it.subtotal, 0), currencySymbol: '$',
    status: ['pendiente_retiro', 'en_camino', 'listo_para_retirar'][n - 1] || 'pendiente_retiro', createdAt: now, updatedAt: now,
    ...overrides,
  };
  return { business_id: 'biz1', id: data.id, data };
}

function makeSeed({ withOrders = true } = {}) {
  return {
    users: [OWNER],
    tables: {
      businesses: [{
        id: 'biz1', code: 'DIST-001',
        data: { id: 'biz1', tenantCode: 'DIST-001', name: 'Distribuidora Uno', status: 'active', phone: '1100', email: OWNER.email, createdAt: '2026-01-01',
          businessRubro: 'distribuidora', catalogEnabled: true,
          config: { distributorName: 'Distribuidora Uno', businessRubro: 'distribuidora' },
          subscription: { monthlyFee: 28000, currency: '$', planTier: 'full', paymentWindowStartDay: 1, paymentWindowEndDay: 5, isPaused: false, termsAccepted: true, termsVersion: '2026.1', lastPaidMonth: today().slice(0, 7), annualPlanUntilMonth: '2099-12', paymentHistory: [] } },
      }],
      business_settings: [{ business_id: 'biz1', config: { distributorName: 'Distribuidora Uno', defaultTermDays: 7, vendedorReminderDays: 2, adminAlertDays: 6, overdueGraceDays: 5, currencySymbol: '$', businessRubro: 'distribuidora', tenantId: 'biz1', tenantCode: 'DIST-001' }, catalog_settings: { published: true }, extra: {} }],
      profiles: [{ id: OWNER.id, business_id: 'biz1', role: 'dueño', username: 'dueno', full_name: 'Dueño Prueba', email: OWNER.email, phone: '1100', active: true, legacy_user_id: null, created_at: '2026-01-01' }],
      clients: [{ business_id: 'biz1', id: 'c1', data: { id: 'c1', name: 'Almacén Uno', phone: '1155667788', address: 'Calle 1', zone: 'Centro', contactPerson: 'Ana', email: '', createdAt: '2026-11-01' } }],
      boletas: [{ business_id: 'biz1', id: 'b1', archived: false, data: { id: 'b1', boletaNumber: 'B-0001', clientId: 'c1', clientName: 'Almacén Uno', salespersonId: '', salespersonName: 'Mostrador', saleDate: daysAgo(12), amount: 15000, termDays: 7, dueDate: daysAgo(5), isSigned: true, status: 'pending', remindersLog: [], createdAt: daysAgo(12) } }],
      catalog_orders: withOrders ? [1, 2, 3].map((n) => mkOrder(n)) : [],
      platform_settings: [], announcements: [], subscription_payments: [],
    },
  };
}

const STORE_PRODUCTS = [
  { id: 'p0', name: 'Gaseosa 2L', price: 1500, category: 'Bebidas', available: true, description: 'Botella', createdAt: '2026-11-01', updatedAt: '2026-11-01' },
  { id: 'p1', name: 'Yerba 1kg', price: 2500, category: 'Almacén', available: true, description: 'Paquete', createdAt: '2026-11-01', updatedAt: '2026-11-01' },
];

function makeStoreSeed(catalogOverrides = {}) {
  return {
    users: [], tables: {},
    catalog: { tenantId: 'biz1', slug: 'tienda', storeName: 'Tienda Uno', tagline: 'Hola', published: true, enabledBySuperAdmin: true, whatsappPhone: '1155', pickupAddress: 'Calle 1', pickupHours: '9 a 18', currencySymbol: '$', allowPickup: true, products: STORE_PRODUCTS, ...catalogOverrides },
  };
}

const SUPER = { id: '00000000-0000-0000-0000-0000000000s1'.replace('s', '5'), email: 'super@prueba.test', password: 'secreto2' };

/** Como makeSeed, pero entra un superadmin (sin empresa propia) y la empresa no tiene año cubierto. */
function makeSuperSeed() {
  const seed = makeSeed();
  seed.users = [SUPER];
  seed.tables.profiles = [{ id: SUPER.id, business_id: null, role: 'superadmin', username: 'super', full_name: 'Gestor Prueba', email: SUPER.email, phone: '', active: true, legacy_user_id: null, created_at: '2026-01-01' }];
  seed.tables.businesses[0].data.subscription.annualPlanUntilMonth = undefined;
  seed.tables.businesses[0].data.subscription.lastPaidMonth = undefined;
  return seed;
}

module.exports = { OWNER, SUPER, makeSeed, makeSuperSeed, makeStoreSeed, mkOrder };
