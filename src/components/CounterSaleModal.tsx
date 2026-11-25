import React, { useMemo, useState } from 'react';
import { Camera, CheckCircle2, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import type {
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

const PAYMENT_OPTIONS: Array<{ id: CatalogPaymentMethod; label: string }> = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'mercadopago_dinero_cuenta', label: 'Mercado Pago' },
];

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
  const [payment, setPayment] = useState<CatalogPaymentMethod>('efectivo');
  const [customer, setCustomer] = useState('');
  const [message, setMessage] = useState('');

  const fmt = (n: number) => `${currencySymbol} ${Math.round(n).toLocaleString('es-AR')}`;

  const available = useMemo(() => products.filter((p) => p.available !== false), [products]);

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

  const lines = cart.map((l) => {
    const qtyOfProduct = cart.filter((x) => x.product.id === l.product.id).reduce((a, x) => a + x.quantity, 0);
    const price = getWholesaleUnitPrice(l.product, l.variant, qtyOfProduct);
    return { ...l, unit: price.effectiveUnitPrice, regular: price.regularUnitPrice, wholesale: price.appliedWholesale };
  });
  const total = lines.reduce((a, l) => a + l.unit * l.quantity, 0);

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
    setPayment('efectivo');
  };

  const handleConfirm = () => {
    if (lines.length === 0) {
      setMessage('Agregá al menos un producto.');
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
    const order: CatalogPickupOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: `MOS-${Date.now().toString().slice(-5)}`,
      tenantId,
      tenantCode,
      storeName,
      customerName: customer.trim() || 'Venta de mostrador',
      customerPhone: '',
      deliveryMethod: 'retiro',
      confirmedPaymentMethod: payment,
      preferredPaymentMethod: payment,
      paymentStatus: 'acreditado',
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Cómo paga</label>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={payment === o.id}
                      onClick={() => setPayment(o.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        payment === o.id ? 'bg-[#0B1933] text-white border-[#0B1933]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Cliente (opcional)</label>
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
