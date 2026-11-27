import React, { useMemo, useState } from 'react';
import { Camera, CheckCircle2, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import type {
  CatalogPaymentBreakdown,
  CatalogPaymentMethod,
  CatalogPickupOrder,
  CatalogPickupOrderItem,
  CatalogProduct,
  CatalogProductVariant,
} from '../types';
import { getVariantStock, getWholesaleUnitPrice } from '../utils/catalogStock';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface CounterSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: CatalogProduct[];
  tenantId: string;
  tenantCode?: string;
  storeName: string;
  currencySymbol: string;
  onConfirmSale: (order: CatalogPickupOrder) => void;
}

interface CartLine {
  key: string;
  product: CatalogProduct;
  variant?: CatalogProductVariant;
  quantity: number;
}

const normCode = (c?: string) => (c || '').trim().toLowerCase().replace(/^0+(?=\d)/, '');

type PayMode = 'efectivo' | 'transferencia' | 'mercadopago' | 'mixto' | 'cuenta';

const PAY_MODES: Array<{ id: PayMode; label: string }> = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'mercadopago', label: 'Mercado Pago' },
  { id: 'mixto', label: 'Mixto' },
  { id: 'cuenta', label: 'A cuenta' },
];

const money = (v: string) => Math.max(0, Math.round((parseFloat(v.replace(',', '.')) || 0) * 100) / 100);

function stockOf(product: CatalogProduct, variant?: CatalogProductVariant): number | null {
  if (variant) return getVariantStock(variant);
  return typeof product.stockQuantity === 'number' ? Math.max(0, Math.floor(product.stockQuantity)) : null;
}

/**
 * Venta de mostrador: se agregan productos escaneando el código de barras o a mano,
 * se elige cómo pagó el cliente y se registra la venta (descuenta stock y queda en el historial).
 */
export const CounterSaleModal: React.FC<CounterSaleModalProps> = ({
  isOpen,
  onClose,
  products,
  tenantId,
  tenantCode,
  storeName,
  currencySymbol,
  onConfirmSale,
}) => {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [payMode, setPayMode] = useState<PayMode>('efectivo');
  const [mixCash, setMixCash] = useState('');
  const [mixTransfer, setMixTransfer] = useState('');
  const [mixMp, setMixMp] = useState('');
  const [cashGiven, setCashGiven] = useState('');
  const [customerDni, setCustomerDni] = useState('');
  const [customer, setCustomer] = useState('');
  const [message, setMessage] = useState('');

  const fmt = (n: number) => `${currencySymbol} ${Math.round(n).toLocaleString('es-AR')}`;

  // Los productos son los del catálogo online (se actualizan solos: precio, stock, altas y bajas)
  const available = products;

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return available
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.variants || []).some((v) => (v.sku || '').toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [available, search]);

  const addLine = (product: CatalogProduct, variant?: CatalogProductVariant): string => {
    const key = `${product.id}::${variant?.id || 'base'}`;
    const label = `${product.name}${variant ? ` · ${variant.label}` : ''}`;
    const max = stockOf(product, variant);
    const existing = cart.find((l) => l.key === key);
    const nextQty = (existing?.quantity || 0) + 1;
    if (max !== null && nextQty > max) {
      return max <= 0 ? `"${label}" no tiene stock.` : `Solo quedan ${max} de "${label}".`;
    }
    setCart((prev) =>
      existing
        ? prev.map((l) => (l.key === key ? { ...l, quantity: nextQty } : l))
        : [...prev, { key, product, variant, quantity: 1 }]
    );
    return `✔ ${label} agregado`;
  };

  const handleProductPick = (product: CatalogProduct) => {
    if (product.variants && product.variants.length > 0) {
      setSearch(product.name); // se elige la variante en la lista
      return;
    }
    setMessage(addLine(product));
    setSearch('');
  };

  const handleScanned = (rawCode: string) => {
    const code = normCode(rawCode);
    let foundProduct: CatalogProduct | undefined;
    let foundVariant: CatalogProductVariant | undefined;
    for (const p of available) {
      const v = (p.variants || []).find((x) => normCode(x.sku) === code);
      if (v) {
        foundProduct = p;
        foundVariant = v;
        break;
      }
      if (normCode(p.sku) === code) {
        foundProduct = p;
        break;
      }
    }
    if (!foundProduct) {
      setScanMessage(`El código ${rawCode} no está cargado en ningún producto.`);
      return;
    }
    if (!foundVariant && foundProduct.variants && foundProduct.variants.length > 0) {
      setScanMessage(`"${foundProduct.name}" tiene variantes: elegila a mano en la lista.`);
      setSearch(foundProduct.name);
      return;
    }
    setScanMessage(addLine(foundProduct, foundVariant));
  };

  // Cada renglón se vuelve a leer del catálogo: si cambió el precio o el stock mientras se carga la venta, se ve el dato actual
  const resolved = cart.map((l) => {
    const live = products.find((p) => p.id === l.product.id);
    const liveVariant = l.variant ? live?.variants?.find((v) => v.id === l.variant!.id) : undefined;
    return {
      ...l,
      product: live || l.product,
      variant: liveVariant || l.variant,
      gone: !live || Boolean(l.variant && !liveVariant),
    };
  });
  const lines = resolved.map((l) => {
    const qtyOfProduct = resolved.filter((x) => x.product.id === l.product.id).reduce((a, x) => a + x.quantity, 0);
    const price = getWholesaleUnitPrice(l.product, l.variant, qtyOfProduct);
    const max = stockOf(l.product, l.variant);
    return {
      ...l,
      unit: price.effectiveUnitPrice,
      regular: price.regularUnitPrice,
      wholesale: price.appliedWholesale,
      overStock: max !== null && l.quantity > max,
      maxStock: max,
    };
  });
  const total = lines.reduce((a, l) => a + l.unit * l.quantity, 0);

  // Cómo se paga: cuánto en cada medio y cuánto queda a cuenta
  const breakdown: CatalogPaymentBreakdown = (() => {
    const t = Math.round(total * 100) / 100;
    if (payMode === 'efectivo') return { efectivo: t, transferencia: 0, mercadopago: 0, aCuenta: 0 };
    if (payMode === 'transferencia') return { efectivo: 0, transferencia: t, mercadopago: 0, aCuenta: 0 };
    if (payMode === 'mercadopago') return { efectivo: 0, transferencia: 0, mercadopago: t, aCuenta: 0 };
    if (payMode === 'cuenta') return { efectivo: 0, transferencia: 0, mercadopago: 0, aCuenta: t };
    const e = money(mixCash);
    const tr = money(mixTransfer);
    const mp = money(mixMp);
    return { efectivo: e, transferencia: tr, mercadopago: mp, aCuenta: Math.max(0, Math.round((t - e - tr - mp) * 100) / 100) };
  })();
  const paidTotal = breakdown.efectivo + breakdown.transferencia + breakdown.mercadopago;
  const overpaid = payMode === 'mixto' && paidTotal > total + 0.009;
  const change = payMode === 'efectivo' && cashGiven ? Math.max(0, money(cashGiven) - total) : 0;

  const changeQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.key !== key) return l;
          const max = stockOf(l.product, l.variant);
          const next = l.quantity + delta;
          if (max !== null && next > max) return l;
          return { ...l, quantity: next };
        })
        .filter((l) => l.quantity > 0)
    );
  };

  const reset = () => {
    setCart([]);
    setSearch('');
    setCustomer('');
    setMessage('');
    setScanMessage('');
    setPayMode('efectivo');
    setMixCash('');
    setMixTransfer('');
    setMixMp('');
    setCashGiven('');
    setCustomerDni('');
  };

  const handleConfirm = () => {
    if (lines.length === 0) {
      setMessage('Agregá al menos un producto.');
      return;
    }
    const gone = lines.find((l) => l.gone);
    if (gone) {
      setMessage(`"${gone.product.name}" ya no está en el catálogo. Sacalo de la venta.`);
      return;
    }
    const over = lines.find((l) => l.overStock);
    if (over) {
      setMessage(`Solo quedan ${over.maxStock} de "${over.product.name}" en stock. Ajustá la cantidad.`);
      return;
    }
    if (overpaid) {
      setMessage('Los montos superan el total de la venta. Revisalos.');
      return;
    }
    if (breakdown.aCuenta > 0 && !customer.trim()) {
      setMessage('Para dejar saldo a cuenta, escribí el nombre del cliente.');
      return;
    }
    const nowIso = new Date().toISOString();
    const items: CatalogPickupOrderItem[] = lines.map((l) => ({
      productId: l.product.id,
      productName: l.product.name,
      sku: l.variant?.sku || l.product.sku,
      category: l.product.category,
      subfilters: l.product.subfilters,
      variantId: l.variant?.id,
      variantLabel: l.variant?.label,
      imageUrl: l.product.imageUrl,
      unitLabel: l.product.unitLabel,
      unitPrice: l.unit,
      regularUnitPrice: l.regular,
      appliedWholesale: l.wholesale,
      quantity: l.quantity,
      subtotal: l.unit * l.quantity,
    }));
    const paidEntries: Array<[number, CatalogPaymentMethod]> = [
      [breakdown.efectivo, 'efectivo'],
      [breakdown.transferencia, 'transferencia'],
      [breakdown.mercadopago, 'mercadopago_dinero_cuenta'],
    ];
    const biggest = [...paidEntries].sort((a, b) => b[0] - a[0])[0];
    const mainMethod: CatalogPaymentMethod | 'fiado' = biggest[0] > 0 ? biggest[1] : 'fiado';
    const order: CatalogPickupOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: `MOS-${Date.now().toString().slice(-5)}`,
      tenantId,
      tenantCode,
      storeName,
      customerName: customer.trim() || 'Venta de mostrador',
      customerPhone: '',
      deliveryMethod: 'retiro',
      customerDni: customerDni.replace(/\D/g, '') || undefined,
      saleChannel: 'mostrador',
      paymentBreakdown: breakdown,
      cashReceived: payMode === 'efectivo' && cashGiven ? money(cashGiven) : undefined,
      confirmedPaymentMethod: mainMethod,
      preferredPaymentMethod: mainMethod === 'fiado' ? 'acordar' : mainMethod,
      paymentStatus: breakdown.aCuenta > 0 ? 'pendiente' : 'acreditado',
      notes: 'Venta de mostrador',
      items,
      subtotalBeforeDiscount: total,
      totalAmount: total,
      currencySymbol,
      status: 'retirado',
      stockDeducted: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    onConfirmSale(order);
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Venta de mostrador">
        <div className="bg-white w-full sm:max-w-2xl max-h-[96vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-[#0B1933] text-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <ShoppingBag className="w-4 h-4" />
              Cobrar · Venta de mostrador
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto">
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  setScanMessage('');
                  setScanOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Escanear código
              </button>
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="O buscá a mano por nombre o código…"
                  autoComplete="off"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>
            </div>

            {message && <p className="text-[11px] font-semibold text-slate-600">{message}</p>}
            <p className="text-[10px] text-slate-400">
              Productos, precios y stock: los del catálogo online ({products.length} producto{products.length === 1 ? '' : 's'}). Si los cambiás ahí, se actualizan acá.
            </p>

            {search.trim() && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {results.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">No encontramos productos con ese texto.</p>
                ) : (
                  results.map((p) => (
                    <div key={p.id} className="p-2.5">
                      <button
                        type="button"
                        onClick={() => handleProductPick(p)}
                        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                      >
                        <span className="text-xs font-semibold text-slate-800 truncate">
                          {p.name}
                          {p.sku && <span className="ml-1.5 font-mono text-[10px] text-slate-400">{p.sku}</span>}
                          {p.available === false && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-500">Oculto en la tienda</span>
                          )}
                        </span>
                        <span className="text-xs font-mono text-slate-600 shrink-0">{fmt(p.price)}</span>
                      </button>
                      {p.variants && p.variants.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {p.variants.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setMessage(addLine(p, v));
                                setSearch('');
                              }}
                              className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 cursor-pointer"
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="border border-slate-200 rounded-xl">
              {lines.length === 0 ? (
                <p className="p-4 text-xs text-slate-500 text-center">
                  Todavía no hay productos. Escaneá un código o buscalo a mano.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <li key={l.key} className="p-2.5 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {l.product.name}
                          {l.variant && <span className="text-slate-500"> · {l.variant.label}</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {fmt(l.unit)} c/u{l.wholesale ? ' · precio mayorista' : ''}
                        </div>
                        {l.gone && <div className="text-[11px] font-semibold text-rose-600">Ya no está en el catálogo</div>}
                        {l.overStock && !l.gone && (
                          <div className="text-[11px] font-semibold text-rose-600">Solo quedan {l.maxStock} en stock</div>
                        )}
                      </div>
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => changeQty(l.key, -1)} aria-label="Quitar uno" className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold tabular-nums">{l.quantity}</span>
                        <button type="button" onClick={() => changeQty(l.key, 1)} aria-label="Sumar uno" className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 cursor-pointer">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="w-24 text-right text-xs font-bold font-mono tabular-nums">{fmt(l.unit * l.quantity)}</div>
                      <button type="button" onClick={() => changeQty(l.key, -l.quantity)} aria-label="Eliminar" className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-700 block">Cómo paga</label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Medio de pago">
                {PAY_MODES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={payMode === o.id}
                    onClick={() => setPayMode(o.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      payMode === o.id ? 'bg-[#0B1933] text-white border-[#0B1933]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {payMode === 'efectivo' && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="font-semibold text-slate-700" htmlFor="cash-given">El cliente da</label>
                  <input
                    id="cash-given"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    placeholder={String(Math.round(total))}
                    className="w-28 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900"
                  />
                  {change > 0 && <span className="font-bold text-emerald-700">Vuelto: {fmt(change)}</span>}
                </div>
              )}

              {payMode === 'mixto' && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(
                    [
                      ['Efectivo', mixCash, setMixCash],
                      ['Transferencia', mixTransfer, setMixTransfer],
                      ['Mercado Pago', mixMp, setMixMp],
                    ] as const
                  ).map(([label, value, setter]) => (
                    <label key={label} className="block space-y-1">
                      <span className="font-semibold text-slate-700">{label}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        placeholder="0"
                        aria-label={`Monto en ${label}`}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900"
                      />
                    </label>
                  ))}
                </div>
              )}

              {(payMode === 'mixto' || payMode === 'cuenta') && (
                <p className={`text-[11px] font-semibold ${overpaid ? 'text-rose-600' : 'text-slate-600'}`} role="status">
                  {overpaid
                    ? 'Los montos superan el total.'
                    : breakdown.aCuenta > 0
                    ? `Queda a cuenta (por cobrar): ${fmt(breakdown.aCuenta)} — hace falta el nombre del cliente.`
                    : 'Pagado completo.'}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Cliente {breakdown.aCuenta > 0 ? '*' : '(opcional)'}
                </label>
                <input
                  type="text"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="Nombre del cliente"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">DNI (opcional, para puntos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customerDni}
                  onChange={(e) => setCustomerDni(e.target.value)}
                  maxLength={12}
                  autoComplete="off"
                  placeholder="Solo números"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-500 font-semibold">Total a cobrar</div>
              <div className="text-xl font-extrabold font-mono tabular-nums text-slate-900">{fmt(total)}</div>
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={lines.length === 0}
              className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Cobrar
            </button>
          </div>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={handleScanned}
        continuous
        title="Escanear productos"
        statusMessage={scanMessage || 'Escaneá cada producto: se suma solo a la venta.'}
      />
    </>
  );
};
