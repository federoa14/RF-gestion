import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  RotateCcw,
  ArrowLeftRight,
  AlertTriangle,
  Award,
  Wallet,
  PackagePlus,
  CheckCircle2,
  MessageCircle,
  Search,
} from 'lucide-react';
import {
  CatalogLoyaltyAccount,
  CatalogOrderRefundResolution,
  CatalogOrderReturnItem,
  CatalogOrderReturnReason,
  CatalogOrderReturnRecord,
  CatalogOrderReturnReplacementItem,
  CatalogOrderReturnType,
  CatalogPickupOrder,
  CatalogPickupOrderItem,
  CatalogProduct,
} from '../types';
import { formatCurrency } from '../utils/alerts';
import {
  computeReturnedPointsForOrderItems,
  getFlashEffectiveDisplayPrice,
  hasProductVariants,
  isValidDni,
  normalizeDni,
} from '../utils/catalogStock';
import {
  createWhatsAppUrl,
  generateOrderReturnConfirmationWhatsAppMessage,
} from '../utils/whatsapp';

export interface WebOrderReturnConfirmPayload {
  order: CatalogPickupOrder;
  returnRecord: CatalogOrderReturnRecord;
  returnType: CatalogOrderReturnType;
  markOrderAsFullyReturned: boolean;
  dni?: string;
  deductPointsImmediate: boolean;
  pointsToDeduct: number;
  restoreRedeemedPoints: number;
  creditIssuedAmount: number;
  restoreStockItems: CatalogPickupOrderItem[];
  deductReplacementItems: CatalogPickupOrderItem[];
}

interface WebOrderReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: CatalogPickupOrder | null;
  products: CatalogProduct[];
  loyaltyAccounts: CatalogLoyaltyAccount[];
  storeDefaultPointsPerUnit?: number;
  currencySymbol: string;
  storeName: string;
  activeUserName: string;
  onConfirmReturn: (payload: WebOrderReturnConfirmPayload) => void;
}

const REASON_LABELS: Record<CatalogOrderReturnReason, string> = {
  cambio_talle: 'Cambio de talle',
  cambio_modelo: 'Cambio de modelo / color',
  defecto_falla: 'Prenda con falla / defecto',
  arrepentimiento_cliente: 'Devolución por arrepentimiento',
  error_envio: 'Error en envío / armado',
  otro: 'Otro motivo',
};

const TYPE_LABELS: Record<CatalogOrderReturnType, string> = {
  devolucion_total: 'Devolución Total',
  devolucion_parcial: 'Devolución Parcial',
  cambio: 'Cambio de Prenda / Talle',
};

export const WebOrderReturnModal: React.FC<WebOrderReturnModalProps> = ({
  isOpen,
  onClose,
  order,
  products,
  loyaltyAccounts,
  storeDefaultPointsPerUnit = 10,
  currencySymbol,
  storeName,
  activeUserName,
  onConfirmReturn,
}) => {
  const [returnType, setReturnType] = useState<CatalogOrderReturnType>('devolucion_total');
  const [reason, setReason] = useState<CatalogOrderReturnReason>('arrepentimiento_cliente');
  const [selectedQtyByIndex, setSelectedQtyByIndex] = useState<Record<number, number>>({});
  const [dniInput, setDniInput] = useState('');
  const [refundResolution, setRefundResolution] =
    useState<CatalogOrderRefundResolution>('saldo_favor_dni');
  const [refundMethod, setRefundMethod] = useState<'efectivo' | 'transferencia' | 'mercadopago'>(
    'efectivo'
  );
  const [restoreStock, setRestoreStock] = useState(true);
  const [deductPointsImmediate, setDeductPointsImmediate] = useState(true);
  const [customPointsToDeduct, setCustomPointsToDeduct] = useState<string>('');
  const [restoreRedeemedPointsCheck, setRestoreRedeemedPointsCheck] = useState(false);
  const [notes, setNotes] = useState('');
  const [sendWhatsAppAfter, setSendWhatsAppAfter] = useState(true);

  // Replacement product picker (for mode === 'cambio')
  const [replacementSearch, setReplacementSearch] = useState('');
  const [replacementProductId, setReplacementProductId] = useState('');
  const [replacementVariantId, setReplacementVariantId] = useState('');
  const [replacementQty, setReplacementQty] = useState(1);

  useEffect(() => {
    if (!isOpen || !order) return;
    const isAlreadyPartial = order.returnStatus === 'devolucion_parcial';
    const initialType: CatalogOrderReturnType = isAlreadyPartial
      ? 'devolucion_parcial'
      : 'devolucion_total';
    setReturnType(initialType);
    setReason('arrepentimiento_cliente');
    const qtyMap: Record<number, number> = {};
    (order.items || []).forEach((it, idx) => {
      qtyMap[idx] = Math.max(1, Number(it.quantity) || 1);
    });
    setSelectedQtyByIndex(qtyMap);
    const normalizedOrderDni = normalizeDni(order.customerDni || '');
    setDniInput(normalizedOrderDni);
    setRefundResolution(normalizedOrderDni.length >= 6 ? 'saldo_favor_dni' : 'reintegro_dinero');
    setRefundMethod('efectivo');
    setRestoreStock(true);
    setDeductPointsImmediate(true);
    setCustomPointsToDeduct('');
    setRestoreRedeemedPointsCheck(false);
    setNotes('');
    setSendWhatsAppAfter(true);
    setReplacementSearch('');
    setReplacementProductId('');
    setReplacementVariantId('');
    setReplacementQty(1);
  }, [isOpen, order?.id]);

  // Adjust defaults when switching returnType
  useEffect(() => {
    if (!order) return;
    if (returnType === 'devolucion_total') {
      const fullMap: Record<number, number> = {};
      (order.items || []).forEach((it, idx) => {
        fullMap[idx] = Math.max(1, Number(it.quantity) || 1);
      });
      setSelectedQtyByIndex(fullMap);
      setDeductPointsImmediate(true);
      setCustomPointsToDeduct('');
      if (refundResolution === 'cambio_mano_a_mano') {
        setRefundResolution(isValidDni(dniInput) ? 'saldo_favor_dni' : 'reintegro_dinero');
      }
    } else if (returnType === 'cambio') {
      setReason((prev) =>
        prev === 'arrepentimiento_cliente' ? 'cambio_talle' : prev
      );
      setRefundResolution('cambio_mano_a_mano');
      setDeductPointsImmediate(false);
      setCustomPointsToDeduct('0');
    } else if (returnType === 'devolucion_parcial') {
      setDeductPointsImmediate(true);
      setCustomPointsToDeduct('');
      if (refundResolution === 'cambio_mano_a_mano') {
        setRefundResolution(isValidDni(dniInput) ? 'saldo_favor_dni' : 'reintegro_dinero');
      }
    }
  }, [returnType]);

  const cleanDni = normalizeDni(dniInput);
  const matchedAccount = useMemo(() => {
    if (cleanDni.length < 6) return null;
    return loyaltyAccounts.find((a) => normalizeDni(a.dni) === cleanDni) || null;
  }, [cleanDni, loyaltyAccounts]);

  const returnedItems: CatalogOrderReturnItem[] = useMemo(() => {
    if (!order) return [];
    return (order.items || [])
      .map((it, idx) => {
        const maxQty = Math.max(1, Number(it.quantity) || 1);
        const rawSel =
          returnType === 'devolucion_total'
            ? maxQty
            : Math.max(0, Math.min(maxQty, Number(selectedQtyByIndex[idx] ?? 0)));
        if (rawSel <= 0) return null;
        return {
          productId: it.productId,
          productName: it.productName,
          sku: it.sku,
          variantId: it.variantId,
          variantLabel: it.variantLabel,
          unitPrice: it.unitPrice,
          quantityReturned: rawSel,
          subtotalReturned: Math.round(it.unitPrice * rawSel * 100) / 100,
        } as CatalogOrderReturnItem;
      })
      .filter((x): x is CatalogOrderReturnItem => x !== null);
  }, [order, returnType, selectedQtyByIndex]);

  const returnedAmountRaw = useMemo(
    () => returnedItems.reduce((sum, it) => sum + it.subtotalReturned, 0),
    [returnedItems]
  );

  // Cap refunded total at net paid on the order for full returns if discounts were applied
  const returnedAmount = useMemo(() => {
    if (!order) return 0;
    const totalOrderQty = (order.items || []).reduce((s, i) => s + Math.max(1, i.quantity || 1), 0);
    const totalReturnedQty = returnedItems.reduce((s, i) => s + i.quantityReturned, 0);
    if (totalReturnedQty >= totalOrderQty && returnType !== 'cambio') {
      const prevReturned = Math.max(0, Number(order.returnedAmount) || 0);
      return Math.max(0, Math.round((order.totalAmount - prevReturned) * 100) / 100);
    }
    const maxRemainingOrder = Math.max(
      0,
      order.totalAmount - Math.max(0, Number(order.returnedAmount) || 0)
    );
    return Math.min(maxRemainingOrder, Math.round(returnedAmountRaw * 100) / 100);
  }, [order, returnedItems, returnedAmountRaw, returnType]);

  const selectedReplacementProduct = useMemo(
    () => products.find((p) => p.id === replacementProductId) || null,
    [products, replacementProductId]
  );

  const selectedReplacementVariant = useMemo(() => {
    if (!selectedReplacementProduct || !hasProductVariants(selectedReplacementProduct)) return null;
    return (
      selectedReplacementProduct.variants?.find((v) => v.id === replacementVariantId) ||
      selectedReplacementProduct.variants?.[0] ||
      null
    );
  }, [selectedReplacementProduct, replacementVariantId]);

  const replacementItem: CatalogOrderReturnReplacementItem | undefined = useMemo(() => {
    if (returnType !== 'cambio' || !selectedReplacementProduct) return undefined;
    const priceInfo = getFlashEffectiveDisplayPrice(
      selectedReplacementProduct,
      selectedReplacementVariant
    );
    const qty = Math.max(1, replacementQty);
    return {
      productId: selectedReplacementProduct.id,
      productName: selectedReplacementProduct.name,
      sku: selectedReplacementVariant?.sku || selectedReplacementProduct.sku,
      variantId: selectedReplacementVariant?.id,
      variantLabel: selectedReplacementVariant?.label,
      unitPrice: priceInfo.displayUnitPrice,
      quantity: qty,
      subtotal: Math.round(priceInfo.displayUnitPrice * qty * 100) / 100,
    };
  }, [returnType, selectedReplacementProduct, selectedReplacementVariant, replacementQty]);

  const netMonetaryEffect = useMemo(() => {
    if (returnType === 'cambio') {
      if (!replacementItem) return returnedAmount;
      // If replacement costs less than returned, difference (<0 means store owes customer credit)
      return Math.max(0, Math.round((returnedAmount - replacementItem.subtotal) * 100) / 100);
    }
    return returnedAmount;
  }, [returnType, returnedAmount, replacementItem]);

  const exchangeDifferenceAmount = useMemo(() => {
    if (returnType !== 'cambio' || !replacementItem) return 0;
    return Math.round((replacementItem.subtotal - returnedAmount) * 100) / 100;
  }, [returnType, returnedAmount, replacementItem]);

  const suggestedPointsToDeduct = useMemo(() => {
    if (!order) return 0;
    const earned = Math.max(0, Math.floor(Number(order.loyaltyPointsEarned) || 0));
    const alreadyDeducted = Math.max(0, Math.floor(Number(order.returnedPointsDeducted) || 0));
    const maxRemainingDeductible = Math.max(0, earned - alreadyDeducted);
    if (maxRemainingDeductible <= 0) return 0;

    if (returnType === 'devolucion_total') {
      return maxRemainingDeductible;
    }
    if (returnType === 'cambio') {
      return 0;
    }
    const calc = computeReturnedPointsForOrderItems({
      returnedItems,
      orderTotalAmount: order.totalAmount,
      orderLoyaltyPointsEarned: maxRemainingDeductible,
      products,
      storeDefaultPointsPerUnit,
    });
    return Math.min(maxRemainingDeductible, calc);
  }, [order, returnType, returnedItems, products, storeDefaultPointsPerUnit]);

  const effectivePointsToDeduct = useMemo(() => {
    if (!deductPointsImmediate) return 0;
    if (customPointsToDeduct.trim() !== '') {
      const parsed = Math.floor(Number(customPointsToDeduct));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
    return suggestedPointsToDeduct;
  }, [deductPointsImmediate, customPointsToDeduct, suggestedPointsToDeduct]);

  const currentDniPointsBalance = matchedAccount ? matchedAccount.pointsBalance : 0;
  const restoredRedeemedPts =
    returnType === 'devolucion_total' && restoreRedeemedPointsCheck
      ? Math.max(0, Math.floor(Number(order?.loyaltyPointsRedeemed) || 0))
      : 0;
  const previewNewPointsBalance = Math.max(
    0,
    currentDniPointsBalance - effectivePointsToDeduct + restoredRedeemedPts
  );

  const creditIssuedAmount =
    refundResolution === 'saldo_favor_dni' ? netMonetaryEffect : 0;
  const currentStoreCredit = Math.max(0, Number(matchedAccount?.storeCreditBalance) || 0);
  const previewNewStoreCredit =
    Math.round((currentStoreCredit + creditIssuedAmount) * 100) / 100;

  const filteredReplacementProducts = useMemo(() => {
    const q = replacementSearch.trim().toLowerCase();
    return products
      .filter((p) => p.available)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [products, replacementSearch]);

  if (!isOpen || !order) return null;

  const sym = order.currencySymbol || currencySymbol || '$';
  const canConfirm =
    returnedItems.length > 0 &&
    (refundResolution !== 'saldo_favor_dni' || creditIssuedAmount <= 0 || isValidDni(cleanDni));

  const handleConfirm = () => {
    if (!canConfirm) return;
    const now = new Date().toISOString();
    const recordId = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const record: CatalogOrderReturnRecord = {
      id: recordId,
      date: now,
      type: returnType,
      reason,
      returnedItems,
      ...(replacementItem ? { replacementItem } : {}),
      returnedAmount: netMonetaryEffect,
      ...(returnType === 'cambio' ? { differenceAmount: exchangeDifferenceAmount } : {}),
      refundResolution,
      ...(refundResolution === 'reintegro_dinero' ? { refundMethod } : {}),
      creditIssuedAmount,
      pointsDeducted: effectivePointsToDeduct,
      ...(restoredRedeemedPts > 0 ? { redeemedPointsRestored: restoredRedeemedPts } : {}),
      stockRestored: restoreStock,
      notes: notes.trim() || undefined,
      recordedBy: activeUserName || 'Administración',
    };

    const restoreStockItems: CatalogPickupOrderItem[] = restoreStock
      ? returnedItems.map((r) => ({
          productId: r.productId,
          productName: r.productName,
          sku: r.sku,
          variantId: r.variantId,
          variantLabel: r.variantLabel,
          unitPrice: r.unitPrice,
          quantity: r.quantityReturned,
          subtotal: r.subtotalReturned,
        }))
      : [];

    const deductReplacementItems: CatalogPickupOrderItem[] = replacementItem
      ? [
          {
            productId: replacementItem.productId,
            productName: replacementItem.productName,
            sku: replacementItem.sku,
            variantId: replacementItem.variantId,
            variantLabel: replacementItem.variantLabel,
            unitPrice: replacementItem.unitPrice,
            quantity: replacementItem.quantity,
            subtotal: replacementItem.subtotal,
          },
        ]
      : [];

    const totalOrderQty = (order.items || []).reduce((s, i) => s + Math.max(1, i.quantity || 1), 0);
    const totalReturnedQty = returnedItems.reduce((s, i) => s + i.quantityReturned, 0);
    const markOrderAsFullyReturned =
      returnType === 'devolucion_total' ||
      (returnType === 'devolucion_parcial' &&
        totalReturnedQty >= totalOrderQty &&
        (order.returnedAmount || 0) + netMonetaryEffect >= order.totalAmount);

    onConfirmReturn({
      order,
      returnRecord: record,
      returnType,
      markOrderAsFullyReturned,
      dni: cleanDni.length >= 6 ? cleanDni : undefined,
      deductPointsImmediate,
      pointsToDeduct: effectivePointsToDeduct,
      restoreRedeemedPoints: restoredRedeemedPts,
      creditIssuedAmount,
      restoreStockItems,
      deductReplacementItems,
    });

    if (sendWhatsAppAfter && order.customerPhone?.trim()) {
      const refundLabel =
        refundResolution === 'saldo_favor_dni'
          ? 'Saldo a favor en tu cuenta por DNI'
          : refundResolution === 'cambio_mano_a_mano'
          ? exchangeDifferenceAmount > 0
            ? `Cambio con diferencia a abonar de ${formatCurrency(exchangeDifferenceAmount, sym)}`
            : 'Cambio mano a mano sin cargo'
          : `Reintegro de dinero (${refundMethod})`;

      const waMsg = generateOrderReturnConfirmationWhatsAppMessage({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        storeName,
        currencySymbol: sym,
        returnTypeLabel: TYPE_LABELS[returnType],
        returnedItemsSummary: returnedItems.map(
          (r) =>
            `${r.quantityReturned} × ${r.productName}${r.variantLabel ? ` (${r.variantLabel})` : ''}`
        ),
        replacementSummary: replacementItem
          ? `${replacementItem.quantity} × ${replacementItem.productName}${
              replacementItem.variantLabel ? ` (${replacementItem.variantLabel})` : ''
            }`
          : undefined,
        returnedAmount: netMonetaryEffect,
        refundResolutionLabel: refundLabel,
        creditIssuedAmount: creditIssuedAmount > 0 ? creditIssuedAmount : undefined,
        newStoreCreditBalance: creditIssuedAmount > 0 ? previewNewStoreCredit : undefined,
        pointsDeducted: effectivePointsToDeduct > 0 ? effectivePointsToDeduct : undefined,
        newPointsBalance: isValidDni(cleanDni) ? previewNewPointsBalance : undefined,
      });
      window.open(createWhatsAppUrl(order.customerPhone, waMsg), '_blank', 'noopener,noreferrer');
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[75] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0B1933] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-[#0B1933] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <RotateCcw className="w-4.5 h-4.5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">
                Gestión de Cambio / Devolución · Pedido #{order.orderNumber}
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                {order.customerName}
                {order.customerDni ? ` · DNI ${order.customerDni}` : ''} · Total compra:{' '}
                <strong className="font-mono tabular-nums text-white">
                  {formatCurrency(order.totalAmount, sym)}
                </strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-slate-900 dark:text-slate-100">
          {/* Mode selector */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Tipo de gestión
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'devolucion_total',
                    title: 'Devolución Total',
                    desc: 'Marca como Devuelto y resta los puntos',
                    icon: RotateCcw,
                  },
                  {
                    id: 'devolucion_parcial',
                    title: 'Devolución Parcial',
                    desc: 'Devolvés prendas puntuales del pedido',
                    icon: PackagePlus,
                  },
                  {
                    id: 'cambio',
                    title: 'Cambio de Prenda',
                    desc: 'Deja una prenda y retira otra / otro talle',
                    icon: ArrowLeftRight,
                  },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const active = returnType === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setReturnType(m.id)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#0B1933] bg-[#0B1933]/5 dark:border-sky-400 dark:bg-sky-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      <Icon className="w-3.5 h-3.5 text-[#0B1933] dark:text-sky-400" />
                      <span>{m.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {m.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Items to return */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 bg-slate-50/70 dark:bg-slate-900/40 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Prendas / Artículos que devuelve el cliente
              </span>
              <span className="text-xs font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                Valor devuelto: {formatCurrency(returnedAmount, sym)}
              </span>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-700/70">
              {(order.items || []).map((item, idx) => {
                const maxQty = Math.max(1, Number(item.quantity) || 1);
                const qtyVal =
                  returnType === 'devolucion_total'
                    ? maxQty
                    : Math.max(0, Math.min(maxQty, Number(selectedQtyByIndex[idx] ?? 0)));
                return (
                  <div
                    key={`${item.productId}-${idx}`}
                    className="py-2 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {item.productName}
                        {item.variantLabel ? (
                          <span className="text-slate-500 font-normal"> · {item.variantLabel}</span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        Comprado: {maxQty} × {formatCurrency(item.unitPrice, sym)}
                      </p>
                    </div>
                    {returnType === 'devolucion_total' ? (
                      <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px] font-mono tabular-nums shrink-0">
                        Devuelve {maxQty} u.
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-slate-500">Cant.:</span>
                        <input
                          type="number"
                          min={0}
                          max={maxQty}
                          value={qtyVal}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(maxQty, Math.floor(Number(e.target.value) || 0)));
                            setSelectedQtyByIndex((prev) => ({ ...prev, [idx]: v }));
                          }}
                          className="w-16 px-2 py-1 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono font-bold text-center"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Replacement product picker for CAMBIO */}
          {returnType === 'cambio' && (
            <div className="border border-sky-200 dark:border-sky-800/60 bg-sky-50/50 dark:bg-sky-950/20 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-950 dark:text-sky-200">
                  Prenda que retira en reemplazo (opcional)
                </span>
                {replacementItem && (
                  <span className="text-xs font-mono font-bold text-sky-900 dark:text-sky-200">
                    {exchangeDifferenceAmount > 0
                      ? `Cliente abona dif.: +${formatCurrency(exchangeDifferenceAmount, sym)}`
                      : exchangeDifferenceAmount < 0
                      ? `Saldo a favor cliente: ${formatCurrency(Math.abs(exchangeDifferenceAmount), sym)}`
                      : 'Cambio exacto ($0 diferencia)'}
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={replacementSearch}
                  onChange={(e) => setReplacementSearch(e.target.value)}
                  placeholder="Buscar prenda / talle de reemplazo en tu catálogo..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={replacementProductId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setReplacementProductId(pid);
                    const prod = products.find((p) => p.id === pid);
                    setReplacementVariantId(prod?.variants?.[0]?.id || '');
                  }}
                  className="sm:col-span-2 px-2.5 py-2 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                >
                  <option value="">-- Cambio mano a mano / Seleccionar prenda --</option>
                  {filteredReplacementProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(getFlashEffectiveDisplayPrice(p).displayUnitPrice, sym)}
                    </option>
                  ))}
                </select>

                {selectedReplacementProduct &&
                hasProductVariants(selectedReplacementProduct) &&
                selectedReplacementProduct.variants ? (
                  <select
                    value={selectedReplacementVariant?.id || ''}
                    onChange={(e) => setReplacementVariantId(e.target.value)}
                    className="px-2.5 py-2 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
                  >
                    {selectedReplacementProduct.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} (Stock: {typeof v.stockQuantity === 'number' ? v.stockQuantity : '∞'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={replacementQty}
                    onChange={(e) => setReplacementQty(Math.max(1, Number(e.target.value) || 1))}
                    className="px-2.5 py-2 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-mono font-bold"
                    title="Cantidad entregada"
                  />
                )}
              </div>
            </div>
          )}

          {/* Reason & Financial resolution */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Motivo del cambio / devolución
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as CatalogOrderReturnReason)}
                className="w-full px-3 py-2 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium"
              >
                {Object.entries(REASON_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                Resolución del saldo ({formatCurrency(netMonetaryEffect, sym)})
              </label>
              <select
                value={refundResolution}
                onChange={(e) =>
                  setRefundResolution(e.target.value as CatalogOrderRefundResolution)
                }
                className="w-full px-3 py-2 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-medium"
              >
                <option value="saldo_favor_dni">Acreditar Saldo a Favor por DNI (próxima compra)</option>
                <option value="reintegro_dinero">Reintegro de dinero al cliente</option>
                {returnType === 'cambio' && (
                  <option value="cambio_mano_a_mano">Cambio mano a mano / Ajuste directo</option>
                )}
              </select>
            </div>
          </div>

          {refundResolution === 'reintegro_dinero' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Medio de reintegro:
              </span>
              {(['efectivo', 'transferencia', 'mercadopago'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRefundMethod(m)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold capitalize cursor-pointer ${
                    refundMethod === m
                      ? 'bg-[#0B1933] text-white border-[#0B1933]'
                      : 'bg-white dark:bg-[#071021] border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {m === 'mercadopago' ? 'Mercado Pago' : m}
                </button>
              ))}
            </div>
          )}

          {/* CRITICAL SECTION: Immediate DNI Points Deduction + Store Credit */}
          <div className="border-2 border-amber-300 dark:border-amber-600/60 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    Descuento Inmediato de Puntos y Saldo a Favor por DNI
                  </h4>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Esta compra sumó{' '}
                    <strong className="font-mono">{order.loyaltyPointsEarned || 0} pts</strong>
                    {order.loyaltyPointsRedeemed
                      ? ` y canjeó ${order.loyaltyPointsRedeemed} pts`
                      : ''}
                    .
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 whitespace-nowrap">
                  DNI Cliente:
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={dniInput}
                  onChange={(e) => setDniInput(normalizeDni(e.target.value))}
                  placeholder="Sin DNI"
                  className="w-32 px-2.5 py-1 bg-white dark:bg-[#071021] border border-amber-300 dark:border-amber-700 rounded-lg text-xs font-mono font-bold"
                />
              </div>
            </div>

            {isValidDni(cleanDni) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="bg-white dark:bg-[#071021] border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deductPointsImmediate}
                      onChange={(e) => setDeductPointsImmediate(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      Restar inmediatamente puntos al confirmar devolución
                    </span>
                  </label>

                  {deductPointsImmediate && (
                    <div className="flex items-center justify-between gap-2 text-xs pl-5">
                      <span className="text-slate-600 dark:text-slate-300">Puntos a restar:</span>
                      <input
                        type="number"
                        min={0}
                        value={
                          customPointsToDeduct !== ''
                            ? customPointsToDeduct
                            : String(suggestedPointsToDeduct)
                        }
                        onChange={(e) => setCustomPointsToDeduct(e.target.value)}
                        className="w-24 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-md font-mono font-bold text-right bg-white dark:bg-[#0B1933]"
                      />
                    </div>
                  )}

                  {returnType === 'devolucion_total' && (order.loyaltyPointsRedeemed || 0) > 0 && (
                    <label className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300 pl-5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreRedeemedPointsCheck}
                        onChange={(e) => setRestoreRedeemedPointsCheck(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Devolver también {order.loyaltyPointsRedeemed} pts que canjeó</span>
                    </label>
                  )}

                  <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-1.5 flex justify-between">
                    <span>Saldo DNI actual: {currentDniPointsBalance} pts</span>
                    <strong className="text-rose-700 dark:text-rose-400">
                      Nuevo saldo: {previewNewPointsBalance} pts
                    </strong>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#071021] border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex flex-col justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Billetera / Saldo a Favor DNI</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {refundResolution === 'saldo_favor_dni' && creditIssuedAmount > 0
                      ? `Se acreditarán ${formatCurrency(creditIssuedAmount, sym)} al DNI ${cleanDni} para usar automáticamente en futuras compras web.`
                      : 'Seleccioná "Acreditar Saldo a Favor por DNI" arriba si querés dejarle el monto a favor en lugar de devolver efectivo.'}
                  </p>
                  <div className="text-[11px] font-mono tabular-nums border-t border-slate-100 dark:border-slate-800 pt-1.5 flex justify-between">
                    <span>Saldo previo: {formatCurrency(currentStoreCredit, sym)}</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      Nuevo saldo: {formatCurrency(previewNewStoreCredit, sym)}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300 bg-white/80 dark:bg-[#071021]/60 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Este pedido no tiene DNI cargado. Ingresá el DNI arriba si deseás restar puntos o acreditar saldo a favor al cliente.
                </span>
              </div>
            )}
          </div>

          {/* Stock & notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={restoreStock}
                  onChange={(e) => setRestoreStock(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Reingresar al stock del catálogo los artículos devueltos</span>
              </label>

              {order.customerPhone?.trim() && (
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendWhatsAppAfter}
                    onChange={(e) => setSendWhatsAppAfter(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Abrir WhatsApp con el comprobante al confirmar
                  </span>
                </label>
              )}
            </div>

            <div>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observación interna opcional (ej: cambió por talle L)..."
                className="w-full px-3 py-2 bg-white dark:bg-[#071021] border border-slate-300 dark:border-slate-600 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#071021] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-50 text-white cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              Confirmar {TYPE_LABELS[returnType]}
              {deductPointsImmediate && effectivePointsToDeduct > 0 && isValidDni(cleanDni)
                ? ` (-${effectivePointsToDeduct} pts)`
                : ''}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
