import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Image as ImageIcon,
  ZoomIn,
  CheckCircle2,
  Check,
  Store,
  Truck,
  MapPin,
  Clock,
  CreditCard,
  Receipt,
  MessageCircle,
  Barcode,
  PackageCheck,
  FileCheck2,
  Send,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  CatalogPickupOrder,
  CatalogProduct,
  DistributorConfig,
} from '../types';
import { formatCurrency } from '../utils/alerts';
import {
  CatalogOrderProcessStage,
  createWhatsAppUrl,
  generateCatalogOrderCustomerProcessMessage,
} from '../utils/whatsapp';

interface WebOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: CatalogPickupOrder | null;
  products?: CatalogProduct[];
  config: DistributorConfig;
  pickupAddressFallback?: string;
  onMarkAsRetirado?: (order: CatalogPickupOrder) => void;
  onOpenReceipt?: (order: CatalogPickupOrder) => void;
  onBillOrder?: (order: CatalogPickupOrder) => void;
  onChangePaymentMethod?: (
    orderId: string,
    method: NonNullable<CatalogPickupOrder['confirmedPaymentMethod']>
  ) => void;
  onConfirmPayment?: (order: CatalogPickupOrder) => void;
  onSendProcessWhatsApp?: (
    order: CatalogPickupOrder,
    stage: CatalogOrderProcessStage
  ) => void;
  onWhatsAppCollect?: (order: CatalogPickupOrder) => void;
  onVerifyTransferReceipt?: (order: CatalogPickupOrder) => Promise<void> | void;
  onOpenReturnModal?: (order: CatalogPickupOrder) => void;
}

function resolvePaymentLabel(
  method?: CatalogPickupOrder['confirmedPaymentMethod'] | CatalogPickupOrder['preferredPaymentMethod'],
  isDelivery?: boolean
): string {
  switch (method) {
    case 'transferencia':
      return 'Transferencia bancaria / Alias';
    case 'mercadopago_dinero_cuenta':
      return 'Mercado Pago (Dinero en cuenta)';
    case 'link_pago':
      return 'Link de Pago / Mercado Pago';
    case 'efectivo':
      return isDelivery ? 'Efectivo contra entrega' : 'Efectivo en el comercio';
    case 'fiado':
      return 'Cuenta Corriente / Fiado';
    default:
      return 'A coordinar por WhatsApp';
  }
}

function resolveStatusText(status: CatalogPickupOrder['status'], isDelivery: boolean): string {
  switch (status) {
    case 'retirado':
      return isDelivery ? 'Entregado (Pagado)' : 'Retirado (Pagado)';
    case 'en_camino':
      return 'En camino (Envío)';
    case 'listo_para_retirar':
      return isDelivery ? 'Listo para despachar' : 'Listo para retirar';
    case 'cancelado':
      return 'Cancelado';
    case 'devuelto':
      return 'Devuelto';
    default:
      return 'Pendiente de armado';
  }
}

function formatDateTimeEs(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.toLocaleDateString('es-AR')} · ${d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })} hs`;
}

export const WebOrderDetailModal: React.FC<WebOrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
  products = [],
  config,
  pickupAddressFallback,
  onMarkAsRetirado,
  onOpenReceipt,
  onBillOrder,
  onChangePaymentMethod,
  onConfirmPayment,
  onSendProcessWhatsApp,
  onWhatsAppCollect,
  onVerifyTransferReceipt,
  onOpenReturnModal,
}) => {
  const [checkedItemIndices, setCheckedItemIndices] = useState<Record<number, boolean>>({});
  const [isVerifyingReceipt, setIsVerifyingReceipt] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{
    src: string;
    title: string;
    sku?: string;
  } | null>(null);

  useEffect(() => {
    setCheckedItemIndices({});
    setZoomedImage(null);
  }, [order?.id, isOpen]);

  const productLookup = useMemo(() => {
    const byId = new Map<string, CatalogProduct>();
    const byName = new Map<string, CatalogProduct>();
    for (const p of products) {
      if (p.id) byId.set(p.id, p);
      if (p.name) byName.set(p.name.trim().toLowerCase(), p);
    }
    return { byId, byName };
  }, [products]);

  if (!isOpen || !order) return null;

  const currency = order.currencySymbol || config.currencySymbol || '$';
  const isDelivery = order.deliveryMethod === 'envio';
  const activePaymentKey =
    order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
  const paymentMethodLabel = resolvePaymentLabel(activePaymentKey, isDelivery);
  const statusLabel = resolveStatusText(order.status, isDelivery);

  const totalUnits = order.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const checkedCount = order.items.filter((_, idx) => Boolean(checkedItemIndices[idx])).length;

  const toggleItemChecked = (idx: number) => {
    setCheckedItemIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleOpenWhatsAppFallback = () => {
    if (onWhatsAppCollect) {
      onWhatsAppCollect(order);
      return;
    }
    const itemsText = order.items
      .map((it) => {
        const matched =
          productLookup.byId.get(it.productId) ||
          productLookup.byName.get(it.productName.trim().toLowerCase());
        const code = (it.sku || matched?.sku || '').trim();
        const variantSuffix = it.variantLabel ? ` (${it.variantLabel})` : '';
        return `• ${it.quantity} × ${it.productName}${variantSuffix}${code ? ` [Cód: ${code}]` : ''} (${formatCurrency(
          it.subtotal,
          currency
        )})`;
      })
      .join('\n');
    const obsText = (order.customerSpecificRequest || order.notes || '').trim();
    const msg =
      `Hola ${order.customerName}! Te escribimos de *${order.storeName}* por tu pedido *#${order.orderNumber}*:\n\n` +
      `${itemsText}\n\n` +
      (obsText ? `📝 *Observación / pedido específico:* ${obsText}\n\n` : '') +
      `Total: *${formatCurrency(order.totalAmount, currency)}*\n` +
      `${isDelivery ? 'Modalidad: Envío a domicilio' : 'Modalidad: Retiro en tienda'}`;
    window.open(createWhatsAppUrl(order.customerPhone, msg), '_blank', 'noopener,noreferrer');
  };

  const handleTriggerProcessStage = (stage: CatalogOrderProcessStage) => {
    if (onSendProcessWhatsApp) {
      onSendProcessWhatsApp(order, stage);
      return;
    }
    const msg = generateCatalogOrderCustomerProcessMessage({
      order,
      stage,
      storeName: order.storeName,
      pickupAddress: pickupAddressFallback,
    });
    window.open(createWhatsAppUrl(order.customerPhone, msg), '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#B6C2D2]/20 flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#94A3B8] font-mono tabular-nums flex-wrap">
              <span className="font-bold text-[#0B1933] dark:text-white">
                Pedido #{order.orderNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatDateTimeEs(order.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-sans font-semibold ${
                  order.status === 'retirado'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : order.status === 'cancelado' || order.status === 'devuelto'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {statusLabel}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#0B1933] dark:text-white truncate">
              Compra de {order.customerName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle de venta"
            className="p-2 rounded-lg text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#13264A] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Customer, Modality & Payment Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 dark:bg-[#071021] border border-slate-200 dark:border-[#B6C2D2]/20 rounded-xl p-4 text-xs">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
                Cliente y Modalidad de Entrega
              </div>
              <div className="font-bold text-[#0B1933] dark:text-white text-sm">
                {order.customerName}
              </div>
              <div className="font-mono tabular-nums text-slate-600 dark:text-[#CBD5E1]">
                WhatsApp: {order.customerPhone || 'Sin teléfono'}
              </div>
              {order.customerDni && (
                <div className="font-mono tabular-nums text-slate-700 dark:text-[#E2E8F0]">
                  DNI (Programa de Puntos): <strong>{order.customerDni}</strong>
                  {typeof order.loyaltyPointsEarned === 'number' && order.loyaltyPointsEarned > 0
                    ? ` · +${order.loyaltyPointsEarned} pts sumados`
                    : ''}
                  {typeof order.loyaltyPointsRedeemed === 'number' &&
                  order.loyaltyPointsRedeemed > 0
                    ? ` · -${order.loyaltyPointsRedeemed} pts canjeados`
                    : ''}
                </div>
              )}
              <div className="flex items-start gap-1.5 text-slate-700 dark:text-[#E2E8F0] pt-0.5">
                {isDelivery ? (
                  <Truck className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                ) : (
                  <Store className="w-4 h-4 text-slate-600 dark:text-[#94A3B8] shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-semibold">
                    {isDelivery ? 'Envío a domicilio' : 'Retiro en el comercio'}
                  </span>
                  {isDelivery && order.deliveryAddress && (
                    <div className="text-slate-600 dark:text-[#94A3B8] flex items-start gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{order.deliveryAddress}</span>
                    </div>
                  )}
                  {!isDelivery && pickupAddressFallback && (
                    <div className="text-slate-500 dark:text-[#8D9CB0] mt-0.5">
                      {pickupAddressFallback}
                    </div>
                  )}
                </div>
              </div>
              {order.preferredPickupWindow && (
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-[#94A3B8]">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isDelivery ? 'Horario envío:' : 'Retiro estimado:'}{' '}
                    {order.preferredPickupWindow}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2 md:border-l md:border-slate-200 dark:md:border-[#B6C2D2]/15 md:pl-4">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
                Pago y Comprobantes
              </div>
              <div className="flex items-center gap-1.5 text-[#0B1933] dark:text-white font-semibold">
                <CreditCard className="w-4 h-4 text-slate-500 dark:text-[#94A3B8] shrink-0" />
                <span>{paymentMethodLabel}</span>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span
                  className={`text-[11px] font-bold ${
                    order.paymentStatus === 'acreditado'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : order.paymentStatus === 'comprobante_en_revision'
                      ? 'text-sky-700 dark:text-sky-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {order.paymentStatus === 'acreditado'
                    ? 'Pago acreditado / confirmado'
                    : order.paymentStatus === 'comprobante_en_revision'
                    ? 'Comprobante subido (para revisar)'
                    : order.paymentStatus === 'en_proceso'
                    ? 'Pago en proceso'
                    : 'Pendiente de cobro'}
                </span>

                {onConfirmPayment &&
                  order.paymentStatus !== 'acreditado' &&
                  order.status !== 'cancelado' &&
                  order.status !== 'devuelto' && (
                    <button
                      type="button"
                      onClick={() => onConfirmPayment(order)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      Confirmar Pago
                    </button>
                  )}
              </div>

              {onChangePaymentMethod && order.status !== 'cancelado' && order.status !== 'devuelto' && (
                <div>
                  <select
                    aria-label="Modificar forma de pago"
                    value={activePaymentKey}
                    onChange={(e) =>
                      onChangePaymentMethod(
                        order.id,
                        e.target.value as NonNullable<CatalogPickupOrder['confirmedPaymentMethod']>
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-[#0B1933] border border-slate-200 dark:border-[#B6C2D2]/25 rounded-lg text-xs font-semibold text-slate-800 dark:text-white cursor-pointer"
                  >
                    <option value="acordar">Pago: A coordinar</option>
                    <option value="transferencia">Pago: Transferencia / Alias</option>
                    <option value="mercadopago_dinero_cuenta">Pago: Mercado Pago (Dinero en cuenta)</option>
                    <option value="link_pago">Pago: Link de Pago / MP</option>
                    <option value="efectivo">
                      {isDelivery ? 'Pago: Efectivo contra entrega' : 'Pago: Efectivo en local'}
                    </option>
                    <option value="fiado">Pago: Cuenta Corriente / Fiado</option>
                  </select>
                </div>
              )}

              {order.transferReceiptImageUrl && (
                <div className="p-2.5 rounded-lg bg-white dark:bg-[#0B1933] border border-sky-200 dark:border-sky-400/30 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setZoomedImage({
                          src: order.transferReceiptImageUrl!,
                          title: `Comprobante de pago · Pedido #${order.orderNumber}`,
                          sku:
                            order.transferOperationId || order.transferReference
                              ? `Op: ${order.transferOperationId || order.transferReference}`
                              : undefined,
                        })
                      }
                      className="relative w-12 h-12 rounded-md overflow-hidden border border-slate-200 dark:border-[#B6C2D2]/25 shrink-0 cursor-zoom-in"
                      title="Ampliar comprobante de pago"
                    >
                      <img
                        src={order.transferReceiptImageUrl}
                        alt="Comprobante de transferencia"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-[#0B1933] dark:text-white flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Comprobante del cliente</span>
                      </div>
                      {(order.transferOperationId || order.transferReference) && (
                        <div className="text-[10px] font-mono text-slate-500 dark:text-[#94A3B8] truncate">
                          Op: {order.transferOperationId || order.transferReference}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedImage({
                            src: order.transferReceiptImageUrl!,
                            title: `Comprobante de pago · Pedido #${order.orderNumber}`,
                            sku:
                              order.transferOperationId || order.transferReference
                                ? `Op: ${order.transferOperationId || order.transferReference}`
                                : undefined,
                          })
                        }
                        className="text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:underline cursor-pointer"
                      >
                        Ver comprobante grande
                      </button>
                    </div>
                  </div>

                  {order.transferVerificationSummary && (
                    <div
                      className={`p-2 rounded-lg text-[11px] border flex items-start gap-1.5 ${
                        order.transferVerificationStatus === 'verificado_auto'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                          : order.transferVerificationStatus === 'duplicado' ||
                            order.transferVerificationStatus === 'rechazado'
                          ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-200'
                          : 'bg-slate-50 dark:bg-[#071021] border-slate-200 dark:border-[#B6C2D2]/20 text-slate-700 dark:text-[#CBD5E1]'
                      }`}
                    >
                      {order.transferVerificationStatus === 'verificado_auto' ? (
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      )}
                      <span>{order.transferVerificationSummary}</span>
                    </div>
                  )}

                  {onVerifyTransferReceipt &&
                    order.status !== 'cancelado' &&
                    order.status !== 'devuelto' &&
                    order.transferVerificationStatus !== 'verificado_auto' && (
                      <button
                        type="button"
                        disabled={isVerifyingReceipt}
                        onClick={async () => {
                          setIsVerifyingReceipt(true);
                          try {
                            await onVerifyTransferReceipt(order);
                          } finally {
                            setIsVerifyingReceipt(false);
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-2.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-60 text-white cursor-pointer"
                      >
                        {isVerifyingReceipt ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                        )}
                        <span>
                          {isVerifyingReceipt
                            ? 'Analizando comprobante...'
                            : 'Verificar Comprobante Automáticamente'}
                        </span>
                      </button>
                    )}
                </div>
              )}

              {(order.linkedBoletaNumber || order.dispatchReceiptNumber || order.mpPaymentId) && (
                <div className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-400 space-y-0.5">
                  {order.mpPaymentId && <div>Pago MP #{order.mpPaymentId}</div>}
                  {order.linkedBoletaNumber && <div>Boleta vinculada: #{order.linkedBoletaNumber}</div>}
                  {order.dispatchReceiptNumber && (
                    <div>Comprobante despacho: {order.dispatchReceiptNumber}</div>
                  )}
                </div>
              )}

              {order.status === 'cancelado' && order.stockRestoredAt && (
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 pt-1">
                  Stock reintegrado al catálogo ({formatDateTimeEs(order.stockRestoredAt)}).
                </div>
              )}
            </div>
          </div>

          {/* Dedicated Customer Observations / Specific Request Block */}
          {(order.customerSpecificRequest || order.notes) && (
            <div className="p-3.5 rounded-xl bg-amber-50/75 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-500/30 space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Observaciones y pedido específico del cliente
              </div>
              <p className="text-xs sm:text-sm font-medium text-[#0B1933] dark:text-white leading-relaxed">
                {order.customerSpecificRequest || order.notes}
              </p>
            </div>
          )}

          {/* Return / Exchange History Card */}
          {((order.returnRecords && order.returnRecords.length > 0) ||
            (order.returnedAmount && order.returnedAmount > 0) ||
            order.status === 'devuelto') && (
            <div className="p-3.5 rounded-xl bg-rose-50/85 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-500/30 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Historial de Cambios / Devoluciones</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums">
                  {Number(order.returnedAmount || 0) > 0 && (
                    <span className="font-bold text-rose-700 dark:text-rose-300">
                      Devuelto: -{formatCurrency(order.returnedAmount || 0, currency)}
                    </span>
                  )}
                  {Number(order.returnedPointsDeducted || 0) > 0 && (
                    <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 font-bold text-rose-800 dark:text-rose-200">
                      -{order.returnedPointsDeducted} pts restados
                    </span>
                  )}
                  {Number(order.creditBalanceIssued || 0) > 0 && (
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 font-bold text-emerald-800 dark:text-emerald-200">
                      Saldo a favor: {formatCurrency(order.creditBalanceIssued || 0, currency)}
                    </span>
                  )}
                </div>
              </div>
              {order.returnRecords && order.returnRecords.length > 0 && (
                <div className="space-y-1.5">
                  {order.returnRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="text-xs bg-white/80 dark:bg-[#0B1933]/70 border border-rose-200/70 dark:border-rose-500/20 rounded-lg px-2.5 py-2 space-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-[#0B1933] dark:text-white">
                        <span>
                          {rec.type === 'cambio'
                            ? 'Cambio de prenda / producto'
                            : rec.type === 'devolucion_parcial'
                            ? 'Devolución parcial'
                            : 'Devolución total'}{' '}
                          ({rec.reason.replace(/_/g, ' ')})
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-[#94A3B8]">
                          {formatDateTimeEs(rec.date)} · {rec.recordedBy}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                        Devuelto:{' '}
                        {rec.returnedItems
                          .map(
                            (ri) =>
                              `${ri.quantityReturned}× ${ri.productName}${ri.variantLabel ? ` (${ri.variantLabel})` : ''}`
                          )
                          .join(', ')}
                        {rec.replacementItem
                          ? ` → Cambio por: ${rec.replacementItem.quantity}× ${rec.replacementItem.productName}${rec.replacementItem.variantLabel ? ` (${rec.replacementItem.variantLabel})` : ''}`
                          : ''}
                      </div>
                      {rec.notes && (
                        <div className="text-[11px] italic text-slate-500 dark:text-[#94A3B8]">
                          Nota: {rec.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Customer Process WhatsApp Stage Notifications */}
          {order.customerPhone && order.status !== 'cancelado' && order.status !== 'devuelto' && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#071021] border border-slate-200 dark:border-[#B6C2D2]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Avisar proceso del pedido al WhatsApp del cliente</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                  Enviá en 1 clic la etapa actual ({order.customerPhone}): armado o listo para {isDelivery ? 'envío' : 'buscar'}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTriggerProcessStage('en_proceso_armando')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer whitespace-nowrap"
                >
                  <MessageCircle className="w-3 h-3 text-amber-600" />
                  <span>1. Armando / Pago en proceso</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleTriggerProcessStage(isDelivery ? 'en_camino' : 'listo_para_retirar')
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer whitespace-nowrap"
                >
                  <MessageCircle className="w-3 h-3 text-emerald-300" />
                  <span>
                    {isDelivery ? '2. En viaje a domicilio' : '2. Listo para pasar a buscar'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Items Picking List (Photos + SKU Codes + Quantities) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-[#0B1933] dark:text-sky-300" />
                <h3 className="text-sm font-bold text-[#0B1933] dark:text-white">
                  Artículos comprados ({order.items.length} producto{order.items.length === 1 ? '' : 's'} · {totalUnits} u.)
                </h3>
              </div>
              <span className="text-xs text-slate-500 dark:text-[#94A3B8] font-mono tabular-nums">
                Tildados para entregar: {checkedCount}/{order.items.length}
              </span>
            </div>

            <div className="border border-slate-200 dark:border-[#B6C2D2]/20 rounded-xl divide-y divide-slate-200 dark:divide-[#B6C2D2]/15 overflow-hidden bg-white dark:bg-[#071021]/60">
              {order.items.map((item, idx) => {
                const matchedProduct =
                  productLookup.byId.get(item.productId) ||
                  productLookup.byName.get(item.productName.trim().toLowerCase());
                const resolvedPhoto = matchedProduct?.imageUrl || item.imageUrl;
                const resolvedSku = (item.sku || matchedProduct?.sku || '').trim();
                const isChecked = Boolean(checkedItemIndices[idx]);

                return (
                  <div
                    key={`${order.id}-detail-item-${idx}`}
                    className={`p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 transition-colors ${
                      isChecked
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                        : 'hover:bg-slate-50/70 dark:hover:bg-[#13264A]/30'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      {/* Picking Check Button */}
                      <button
                        type="button"
                        onClick={() => toggleItemChecked(idx)}
                        aria-label={
                          isChecked ? `Desmarcar ${item.productName}` : `Marcar ${item.productName} como separado`
                        }
                        title={isChecked ? 'Artículo separado' : 'Tildar al separar el artículo'}
                        className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 cursor-pointer transition-colors mt-1 sm:mt-0 ${
                          isChecked
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white dark:bg-[#0B1933] border-slate-300 dark:border-[#B6C2D2]/35 text-transparent hover:border-[#0B1933]'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </button>

                      {/* Product Photo Thumbnail (Click to Zoom) */}
                      {resolvedPhoto ? (
                        <button
                          type="button"
                          onClick={() =>
                            setZoomedImage({
                              src: resolvedPhoto,
                              title: item.productName,
                              sku: resolvedSku || undefined,
                            })
                          }
                          title="Ampliar foto del producto"
                          className="group relative w-20 h-20 sm:w-22 sm:h-22 rounded-xl overflow-hidden border border-slate-200 dark:border-[#B6C2D2]/25 bg-slate-100 dark:bg-[#0B1933] shrink-0 cursor-zoom-in"
                        >
                          <img
                            src={resolvedPhoto}
                            alt={item.productName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1 right-1 p-1 rounded-md bg-slate-950/70 text-white opacity-90 group-hover:opacity-100">
                            <ZoomIn className="w-3 h-3" />
                          </span>
                        </button>
                      ) : (
                        <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-xl border border-dashed border-slate-300 dark:border-[#B6C2D2]/25 bg-slate-100 dark:bg-[#0B1933] flex flex-col items-center justify-center text-slate-400 dark:text-[#64748B] shrink-0 gap-1">
                          <ImageIcon className="w-6 h-6 opacity-70" />
                          <span className="text-[10px] font-medium">Sin foto</span>
                        </div>
                      )}

                      {/* Product Title + SKU Code + Unit */}
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-[#0B1933] dark:bg-white text-white dark:text-[#0B1933] font-mono tabular-nums text-xs font-bold">
                            {item.quantity}×
                          </span>
                          <h4
                            className={`text-sm font-bold text-[#0B1933] dark:text-white leading-snug ${
                              isChecked ? 'line-through opacity-75' : ''
                            }`}
                          >
                            {item.productName}
                          </h4>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {item.variantLabel && (
                            <span className="inline-flex items-center font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-400/30 px-2 py-0.5 rounded-md">
                              Variante: {item.variantLabel}
                            </span>
                          )}

                          {resolvedSku ? (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums font-bold text-[#0B1933] dark:text-sky-300 bg-slate-100 dark:bg-[#13264A] border border-slate-200 dark:border-sky-400/25 px-2 py-0.5 rounded-md">
                              <Barcode className="w-3.5 h-3.5 shrink-0" />
                              <span>Cód: {resolvedSku}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 dark:text-[#64748B]">
                              Sin código SKU cargado
                            </span>
                          )}

                          {(item.unitLabel || matchedProduct?.unitLabel) && (
                            <span className="text-slate-600 dark:text-[#94A3B8]">
                              Presentación: {item.unitLabel || matchedProduct?.unitLabel}
                            </span>
                          )}
                        </div>

                        {matchedProduct?.description && (
                          <p className="text-[11px] text-slate-500 dark:text-[#8D9CB0] line-clamp-2">
                            {matchedProduct.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Unit Price & Subtotal */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0 pl-9 sm:pl-0 font-mono tabular-nums">
                      <div className="text-xs text-slate-500 dark:text-[#94A3B8]">
                        {formatCurrency(item.unitPrice, currency)} c/u
                      </div>
                      <div className="text-sm font-black text-[#0B1933] dark:text-white">
                        {formatCurrency(item.subtotal, currency)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Summary + Actions */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-[#B6C2D2]/20 bg-slate-50 dark:bg-[#071021] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
              {(Boolean(order.wholesaleSavings && order.wholesaleSavings > 0) ||
                Boolean(order.couponDiscountAmount && order.couponDiscountAmount > 0) ||
                Boolean(order.giftCardDiscountAmount && order.giftCardDiscountAmount > 0) ||
                Boolean(order.storeCreditUsedAmount && order.storeCreditUsedAmount > 0) ||
                Boolean(order.loyaltyDiscountAmount && order.loyaltyDiscountAmount > 0) ||
                Boolean(order.paymentMethodDiscountAmount && order.paymentMethodDiscountAmount > 0)) && (
                <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium space-y-0.5">
                  {Boolean(order.wholesaleSavings && order.wholesaleSavings > 0) && (
                    <div>
                      Ahorro precio mayorista: -{formatCurrency(order.wholesaleSavings || 0, currency)}
                    </div>
                  )}
                  {Boolean(order.couponDiscountAmount && order.couponDiscountAmount > 0) && (
                    <div>
                      Cupón {order.couponCode || ''}: -{formatCurrency(order.couponDiscountAmount || 0, currency)}
                    </div>
                  )}
                  {Boolean(order.giftCardDiscountAmount && order.giftCardDiscountAmount > 0) && (
                    <div>
                      Gift Card {order.giftCardCode || ''}: -{formatCurrency(order.giftCardDiscountAmount || 0, currency)}
                    </div>
                  )}
                  {Boolean(order.storeCreditUsedAmount && order.storeCreditUsedAmount > 0) && (
                    <div>
                      Saldo a favor DNI aplicado: -{formatCurrency(order.storeCreditUsedAmount || 0, currency)}
                    </div>
                  )}
                  {Boolean(order.loyaltyDiscountAmount && order.loyaltyDiscountAmount > 0) && (
                    <div>
                      Canje Puntos DNI ({order.loyaltyDiscountPercent || 0}%): -
                      {formatCurrency(order.loyaltyDiscountAmount || 0, currency)}
                    </div>
                  )}
                  {Boolean(order.paymentMethodDiscountAmount && order.paymentMethodDiscountAmount > 0) && (
                    <div>
                      Bonificación Efectivo/Transf. ({order.paymentMethodDiscountPercent || 0}%): -
                      {formatCurrency(order.paymentMethodDiscountAmount || 0, currency)}
                    </div>
                  )}
                </div>
              )}
            <div className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
              Valor final del pedido ({totalUnits} u.)
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-[#0B1933] dark:text-white">
              {formatCurrency(order.totalAmount, currency)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {onMarkAsRetirado &&
              order.status !== 'retirado' &&
              order.status !== 'cancelado' &&
              order.status !== 'devuelto' && (
                <button
                  type="button"
                  onClick={() => onMarkAsRetirado(order)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isDelivery ? 'Entregado (Pagado)' : 'Marcar Retirado (Pagado)'}</span>
                </button>
              )}

            {onOpenReturnModal && order.status !== 'cancelado' && order.status !== 'devuelto' && (
              <button
                type="button"
                onClick={() => onOpenReturnModal(order)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer whitespace-nowrap"
                title="Registrar cambio de talle, devolución total/parcial, restar puntos y acreditar saldo a favor"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cambio / Devolución</span>
              </button>
            )}

            {onBillOrder &&
              !order.linkedBoletaNumber &&
              order.status !== 'cancelado' &&
              order.status !== 'devuelto' && (
                <button
                  type="button"
                  onClick={() => onBillOrder(order)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer whitespace-nowrap"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Facturar</span>
                </button>
              )}

            {onOpenReceipt && order.status !== 'cancelado' && order.status !== 'devuelto' && (
              <button
                type="button"
                onClick={() => onOpenReceipt(order)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] dark:bg-white dark:text-[#0B1933] dark:hover:bg-slate-100 text-white cursor-pointer whitespace-nowrap"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Comprobante</span>
              </button>
            )}

            {order.customerPhone && (
              <button
                type="button"
                onClick={handleOpenWhatsAppFallback}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp Cliente</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-slate-700 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer whitespace-nowrap"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Image Lightbox when clicking any product photo */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/90 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setZoomedImage(null);
          }}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-[#0B1933] rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#B6C2D2]/20 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#0B1933] dark:text-white truncate">
                  {zoomedImage.title}
                </div>
                {zoomedImage.sku && (
                  <div className="text-xs font-mono text-slate-500 dark:text-sky-300">
                    Código / SKU: {zoomedImage.sku}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setZoomedImage(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer"
                aria-label="Cerrar foto ampliada"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-100 dark:bg-[#071021] max-h-[75vh] flex items-center justify-center p-2">
              <img
                src={zoomedImage.src}
                alt={zoomedImage.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
