import React, { useMemo, useState } from 'react';
import {
  ShoppingBag,
  Calendar,
  Search,
  Download,
  RefreshCw,
  ArrowLeft,
  Store,
  Truck,
  Receipt,
  CheckCircle2,
  Clock,
  TrendingUp,
  Eye,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react';
import {
  CatalogPickupOrder,
  CatalogProduct,
  DistributorConfig,
  SaleLineItem,
} from '../types';
import { formatCurrency } from '../utils/alerts';
import type { ReceiptModalData } from './PaymentReceiptModal';
import { WebOrderDetailModal } from './WebOrderDetailModal';

interface WebSalesHistoryViewProps {
  config: DistributorConfig;
  orders: CatalogPickupOrder[];
  products?: CatalogProduct[];
  activeUserName?: string;
  onRefreshOrders?: () => Promise<void>;
  onOpenCatalogManager: () => void;
  onBackToDashboard: () => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onBillOrder?: (order: CatalogPickupOrder) => void;
  onMarkOrderAsRetirado?: (order: CatalogPickupOrder) => void;
  onOpenReturnModal?: (order: CatalogPickupOrder) => void;
  onChangeOrderPaymentMethod?: (
    orderId: string,
    method: NonNullable<CatalogPickupOrder['confirmedPaymentMethod']>
  ) => void;
  showToast: (msg: string) => void;
}

type PeriodPreset = 'all' | 'last_7d' | 'last_month' | 'specific_day';
type StatusScope = 'valid' | 'retirado' | 'pendientes' | 'cancelado' | 'devuelto' | 'all';

function getOrderNetTotal(order: CatalogPickupOrder): number {
  if (order.status === 'cancelado' || order.status === 'devuelto') return 0;
  return Math.max(0, (Number(order.totalAmount) || 0) - (Number(order.returnedAmount) || 0));
}

function toLocalDateKey(isoOrDate: string): string {
  if (!isoOrDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate.slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateKey(): string {
  return toLocalDateKey(new Date().toISOString());
}

function shiftDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateReadable(dateKey: string): string {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey || '—';
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}

function formatTimeReadable(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function resolvePaymentLabel(
  method?: CatalogPickupOrder['confirmedPaymentMethod'] | CatalogPickupOrder['preferredPaymentMethod'],
  isDelivery?: boolean
): string {
  switch (method) {
    case 'transferencia':
      return 'Transferencia / Alias';
    case 'mercadopago_dinero_cuenta':
      return 'Mercado Pago (Dinero en cuenta)';
    case 'link_pago':
      return 'Link de Pago / MP';
    case 'efectivo':
      return isDelivery ? 'Efectivo contra entrega' : 'Efectivo en comercio';
    case 'fiado':
      return 'Cuenta Corriente';
    default:
      return 'A coordinar';
  }
}

function resolveStatusLabel(status: CatalogPickupOrder['status'], isDelivery: boolean): string {
  switch (status) {
    case 'retirado':
      return isDelivery ? 'Entregado (Pagado)' : 'Retirado (Pagado)';
    case 'en_camino':
      return 'En camino';
    case 'listo_para_retirar':
      return isDelivery ? 'Listo p/ despacho' : 'Listo p/ retirar';
    case 'cancelado':
      return 'Cancelado';
    case 'devuelto':
      return 'Devuelto';
    default:
      return 'Pendiente';
  }
}

function getEffectiveOrderDateKey(order: CatalogPickupOrder): string {
  if (order.status === 'retirado') {
    return toLocalDateKey(order.dispatchedAt || order.createdAt);
  }
  return toLocalDateKey(order.createdAt);
}

export const WebSalesHistoryView: React.FC<WebSalesHistoryViewProps> = ({
  config,
  orders,
  products = [],
  activeUserName,
  onRefreshOrders,
  onOpenCatalogManager,
  onBackToDashboard,
  onOpenReceipt,
  onBillOrder,
  onMarkOrderAsRetirado,
  onOpenReturnModal,
  onChangeOrderPaymentMethod,
  showToast,
}) => {
  const todayKey = useMemo(() => getTodayDateKey(), []);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [specificDate, setSpecificDate] = useState<string>(todayKey);
  const [statusScope, setStatusScope] = useState<StatusScope>('valid');
  const [modalityFilter, setModalityFilter] = useState<'all' | 'retiro' | 'envio'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<CatalogPickupOrder | null>(null);

  const currency = config.currencySymbol || '$';

  const productMap = useMemo(() => {
    const byId = new Map<string, CatalogProduct>();
    const byName = new Map<string, CatalogProduct>();
    products.forEach((p) => {
      if (p.id) byId.set(p.id, p);
      if (p.name) byName.set(p.name.trim().toLowerCase(), p);
    });
    return { byId, byName };
  }, [products]);

  const activeOrderForDetail = useMemo(() => {
    if (!selectedOrderForDetail) return null;
    return orders.find((o) => o.id === selectedOrderForDetail.id) || selectedOrderForDetail;
  }, [orders, selectedOrderForDetail]);

  const rangeBounds = useMemo(() => {
    if (periodPreset === 'specific_day') {
      const target = specificDate || todayKey;
      return { start: target, end: target, label: `Día ${formatDateReadable(target)}` };
    }
    if (periodPreset === 'last_7d') {
      const start = shiftDays(todayKey, -6);
      return {
        start,
        end: todayKey,
        label: `Últimos 7 días (${formatDateReadable(start)} al ${formatDateReadable(todayKey)})`,
      };
    }
    if (periodPreset === 'last_month') {
      const start = shiftDays(todayKey, -29);
      return {
        start,
        end: todayKey,
        label: `Último mes (${formatDateReadable(start)} al ${formatDateReadable(todayKey)})`,
      };
    }
    return { start: '', end: '', label: 'Todo el historial registrado' };
  }, [periodPreset, specificDate, todayKey]);

  // Orders matching ONLY the date period (for accurate period KPIs)
  const periodOrders = useMemo(() => {
    return orders
      .filter((o) => {
        const dk = getEffectiveOrderDateKey(o);
        if (rangeBounds.start && dk < rangeBounds.start) return false;
        if (rangeBounds.end && dk > rangeBounds.end) return false;
        return true;
      })
      .sort((a, b) => (b.dispatchedAt || b.createdAt || '').localeCompare(a.dispatchedAt || a.createdAt || ''));
  }, [orders, rangeBounds]);

  // Orders matching period + status + modality + search (for table display)
  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return periodOrders.filter((o) => {
      if (statusScope === 'valid' && (o.status === 'cancelado' || o.status === 'devuelto')) return false;
      if (statusScope === 'retirado' && o.status !== 'retirado') return false;
      if (
        statusScope === 'pendientes' &&
        o.status !== 'pendiente_retiro' &&
        o.status !== 'listo_para_retirar' &&
        o.status !== 'en_camino'
      ) {
        return false;
      }
      if (statusScope === 'cancelado' && o.status !== 'cancelado') return false;
      if (statusScope === 'devuelto' && o.status !== 'devuelto' && !o.returnStatus) return false;

      const mod = o.deliveryMethod || 'retiro';
      if (modalityFilter !== 'all' && mod !== modalityFilter) return false;

      if (!q) return true;
      const inItems = o.items.some((it) => {
        const matched =
          productMap.byId.get(it.productId) ||
          productMap.byName.get(it.productName.trim().toLowerCase());
        const code = (it.sku || matched?.sku || '').toLowerCase();
        const varLabel = (it.variantLabel || '').toLowerCase();
        return (
          it.productName.toLowerCase().includes(q) ||
          code.includes(q) ||
          varLabel.includes(q)
        );
      });
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        (o.customerSpecificRequest || o.notes || '').toLowerCase().includes(q) ||
        (o.linkedBoletaNumber || '').toLowerCase().includes(q) ||
        (o.dispatchReceiptNumber || '').toLowerCase().includes(q) ||
        inItems
      );
    });
  }, [periodOrders, statusScope, modalityFilter, searchTerm, productMap]);

  const metrics = useMemo(() => {
    const activePeriodOrders = periodOrders.filter(
      (o) => o.status !== 'cancelado' && o.status !== 'devuelto'
    );
    const deliveredOrders = activePeriodOrders.filter((o) => o.status === 'retirado');
    const pendingOrders = activePeriodOrders.filter((o) => o.status !== 'retirado');
    const cancelledOrders = periodOrders.filter((o) => o.status === 'cancelado');

    // Solo los pedidos marcados como Retirado / Entregado cuentan como dinero generado neto en la web
    const deliveredRevenue = deliveredOrders.reduce((acc, o) => acc + getOrderNetTotal(o), 0);
    const pendingRevenue = pendingOrders.reduce((acc, o) => acc + getOrderNetTotal(o), 0);
    const avgTicket = deliveredOrders.length > 0 ? deliveredRevenue / deliveredOrders.length : 0;

    let totalUnits = 0;
    let deliveryCount = 0;
    let pickupCount = 0;
    const dayMap = new Map<
      string,
      { dateKey: string; count: number; pendingCount: number; total: number }
    >();
    const productMap = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();

    for (const o of activePeriodOrders) {
      const dk = getEffectiveOrderDateKey(o);
      const prevDay = dayMap.get(dk) || { dateKey: dk, count: 0, pendingCount: 0, total: 0 };

      if (o.status === 'retirado') {
        prevDay.count += 1;
        prevDay.total += getOrderNetTotal(o);
        if (o.deliveryMethod === 'envio') deliveryCount++;
        else pickupCount++;

        for (const it of o.items || []) {
          totalUnits += Number(it.quantity) || 0;
          const pKey = it.productName.trim().toLowerCase();
          const prevProd = productMap.get(pKey) || { name: it.productName, quantity: 0, revenue: 0 };
          prevProd.quantity += Number(it.quantity) || 0;
          prevProd.revenue += Number(it.subtotal) || 0;
          productMap.set(pKey, prevProd);
        }
      } else {
        prevDay.pendingCount += 1;
      }

      dayMap.set(dk, prevDay);
    }

    const dailyBreakdown = Array.from(dayMap.values()).sort((a, b) =>
      b.dateKey.localeCompare(a.dateKey)
    );
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    return {
      totalRevenue: deliveredRevenue,
      pendingRevenue,
      avgTicket,
      activeCount: activePeriodOrders.length,
      deliveredCount: deliveredOrders.length,
      pendingCount: pendingOrders.length,
      cancelledCount: cancelledOrders.length,
      totalUnits,
      deliveryCount,
      pickupCount,
      dailyBreakdown,
      topProducts,
    };
  }, [periodOrders]);

  const handleRefresh = async () => {
    if (!onRefreshOrders) return;
    setIsRefreshing(true);
    try {
      await onRefreshOrders();
      showToast('Historial de ventas web actualizado desde la nube.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredOrders.length === 0) {
      showToast('No hay ventas web en el filtro actual para exportar.');
      return;
    }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Fecha',
      'Hora',
      'Pedido',
      'Cliente',
      'Telefono',
      'Modalidad',
      'Direccion',
      'Productos',
      'Unidades',
      'Forma de Pago',
      'Estado',
      'Boleta Vinculada',
      'Comprobante Despacho',
      'Observaciones',
      'Total',
    ];
    const lines = [
      headers.join(','),
      ...filteredOrders.map((o) => {
        const dk = toLocalDateKey(o.createdAt);
        const tk = formatTimeReadable(o.createdAt);
        const isDelivery = o.deliveryMethod === 'envio';
        const itemsText = o.items
          .map(
            (it) =>
              `${it.quantity}x ${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''}`
          )
          .join(' | ');
        const units = o.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        const paymentLabel = resolvePaymentLabel(
          o.confirmedPaymentMethod || o.preferredPaymentMethod,
          isDelivery
        );
        return [
          esc(dk),
          esc(tk),
          esc(o.orderNumber),
          esc(o.customerName),
          esc(o.customerPhone),
          esc(isDelivery ? 'Envio a domicilio' : 'Retiro en tienda'),
          esc(o.deliveryAddress || ''),
          esc(itemsText),
          units,
          esc(paymentLabel),
          esc(resolveStatusLabel(o.status, isDelivery)),
          esc(o.linkedBoletaNumber || ''),
          esc(o.dispatchReceiptNumber || ''),
          esc(o.customerSpecificRequest || o.notes || ''),
          Number(o.totalAmount || 0),
        ].join(',');
      }),
    ];
    const csv = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ventas_Web_${periodPreset}_${todayKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2500);
    showToast(`Exportadas ${filteredOrders.length} ventas web en CSV.`);
  };

  const handleOpenOrderReceipt = (order: CatalogPickupOrder) => {
    if (!onOpenReceipt) return;
    const isDelivery = order.deliveryMethod === 'envio';
    const paymentKey = order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
    const paymentMethodLabel = resolvePaymentLabel(paymentKey, isDelivery);
    const receiptNumber =
      order.dispatchReceiptNumber || `DESP-${order.orderNumber.replace(/^PED-/, '')}`;
    const isPaidOnDispatch = order.status === 'retirado' && paymentKey !== 'fiado';

    const lineItems: SaleLineItem[] = order.items.map((it, idx) => {
      const variantSuffix = it.variantLabel ? ` · ${it.variantLabel}` : '';
      const unitSuffix = it.unitLabel ? ` (${it.unitLabel})` : '';
      return {
        id: `wh-it-${order.id}-${idx}`,
        name: `${it.productName}${variantSuffix}${unitSuffix}`,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
        paymentMode: paymentKey === 'fiado' ? 'un_pago_fiado' : 'contado_hoy',
      };
    });

    onOpenReceipt({
      receiptNumber,
      boletaNumber: order.linkedBoletaNumber || order.orderNumber,
      clientName: order.customerName,
      clientAddress: isDelivery
        ? order.deliveryAddress || 'Envío a domicilio'
        : 'Retiro en tienda',
      paymentDate: toLocalDateKey(order.dispatchedAt || order.createdAt),
      amountPaidNow: isPaidOnDispatch ? order.totalAmount : 0,
      paymentMethod:
        paymentKey === 'transferencia'
          ? 'transferencia'
          : paymentKey === 'efectivo'
          ? 'efectivo'
          : paymentKey,
      paymentMethodLabel,
      originalAmount: order.totalAmount,
      totalPaidAccumulated: isPaidOnDispatch ? order.totalAmount : 0,
      remainingBalance: isPaidOnDispatch ? 0 : order.totalAmount,
      receivedBy: activeUserName || config.distributorName || 'Ventas Web',
      notes: order.customerSpecificRequest || order.notes,
      isFullSettlement: isPaidOnDispatch,
      isDispatchReceipt: true,
      dispatchModalityLabel: isDelivery ? 'Envío a domicilio' : 'Retiro en tienda',
      deliveryAddress: order.deliveryAddress,
      hideUnitModeTag: true,
      items: lineItems,
      initialPhone: order.customerPhone,
      saleModeLabel: isDelivery
        ? 'COMPROBANTE VENTA WEB · ENVÍO A DOMICILIO'
        : 'COMPROBANTE VENTA WEB · RETIRO EN COMERCIO',
    });
  };

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-[#94A3B8]">
            <button
              type="button"
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1 font-semibold text-[#0B1933] dark:text-[#CBD5E1] hover:underline cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al Panel General</span>
            </button>
            <span aria-hidden="true">·</span>
            <span>{rangeBounds.label}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-[#0B1933] dark:text-white tracking-tight">
            Historial e Ingresos de Ventas Web
          </h2>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8]">
            Controlá todo el dinero generado desde el carrito online por día específico, últimos 7 días, último mes o historial completo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCatalogManager}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-[#E2E8F0] hover:bg-slate-50 dark:hover:bg-[#13264A] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Store className="w-3.5 h-3.5" />
            <span>Ir al Catálogo</span>
          </button>

          {onRefreshOrders && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-[#E2E8F0] hover:bg-slate-50 dark:hover:bg-[#13264A] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] dark:bg-white dark:text-[#0B1933] dark:hover:bg-slate-100 text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Period Selector Bar */}
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Period Preset Segmented Control */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#071021] rounded-lg border border-slate-200 dark:border-[#B6C2D2]/15 flex-wrap">
              <button
                type="button"
                onClick={() => setPeriodPreset('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  periodPreset === 'all'
                    ? 'bg-white dark:bg-[#13264A] text-[#0B1933] dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Todo el historial
              </button>
              <button
                type="button"
                onClick={() => setPeriodPreset('last_7d')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  periodPreset === 'last_7d'
                    ? 'bg-white dark:bg-[#13264A] text-[#0B1933] dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                onClick={() => setPeriodPreset('last_month')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  periodPreset === 'last_month'
                    ? 'bg-white dark:bg-[#13264A] text-[#0B1933] dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Último mes (30 días)
              </button>
              <button
                type="button"
                onClick={() => setPeriodPreset('specific_day')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  periodPreset === 'specific_day'
                    ? 'bg-white dark:bg-[#13264A] text-[#0B1933] dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Día específico
              </button>
            </div>

            {periodPreset === 'specific_day' && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500 dark:text-[#94A3B8]" />
                <input
                  type="date"
                  value={specificDate}
                  max={todayKey}
                  onChange={(e) => setSpecificDate(e.target.value || todayKey)}
                  className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-xs font-mono tabular-nums text-[#0B1933] dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setSpecificDate(todayKey)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-slate-700 dark:text-[#CBD5E1] hover:bg-slate-50 dark:hover:bg-[#13264A] cursor-pointer whitespace-nowrap"
                >
                  Hoy
                </button>
              </div>
            )}
          </div>

          {/* Search + Status + Modality */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[210px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar cliente, #pedido, código o producto..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-xs text-[#0B1933] dark:text-white placeholder-slate-400"
              />
            </div>

            <select
              value={statusScope}
              onChange={(e) => setStatusScope(e.target.value as StatusScope)}
              className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-xs font-semibold text-[#0B1933] dark:text-white cursor-pointer"
            >
              <option value="valid">Ventas activas (sin canceladas/devueltas)</option>
              <option value="retirado">Solo entregadas / retiradas</option>
              <option value="pendientes">Pendientes o en camino</option>
              <option value="devuelto">Con cambios / devoluciones</option>
              <option value="cancelado">Solo canceladas</option>
              <option value="all">Todas (incl. canceladas y devueltas)</option>
            </select>

            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value as 'all' | 'retiro' | 'envio')}
              className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-xs font-semibold text-[#0B1933] dark:text-white cursor-pointer"
            >
              <option value="all">Retiro y Envío</option>
              <option value="retiro">Solo Retiro en tienda</option>
              <option value="envio">Solo Envío a domicilio</option>
            </select>
          </div>
        </div>
      </div>

      {/* Period KPI Summary Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">
            <span>Dinero Generado (Pagado)</span>
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatCurrency(metrics.totalRevenue, currency)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-[#8D9CB0] mt-0.5 tabular-nums">
              {metrics.deliveredCount} retirados · Promedio: {formatCurrency(metrics.avgTicket, currency)}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">
            <span>Pedidos Retirados / Pagos</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[#0B1933] dark:text-white">
              {metrics.deliveredCount}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-[#8D9CB0] mt-0.5 tabular-nums">
              {metrics.totalUnits} u. · {metrics.pickupCount} retiros / {metrics.deliveryCount} envíos
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">
            <span>Por Retirar / A Cobrar</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[#0B1933] dark:text-amber-300">
              {formatCurrency(metrics.pendingRevenue, currency)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-[#8D9CB0] mt-0.5 tabular-nums">
              {metrics.pendingCount} pendiente(s) — suman al marcar Retirado
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-[#94A3B8]">
            <span>Total Carritos Recibidos</span>
            <ShoppingBag className="w-4 h-4 text-[#0B1933] dark:text-[#CBD5E1]" />
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-[#0B1933] dark:text-white">
              {metrics.activeCount}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-[#8D9CB0] mt-0.5 tabular-nums">
              {metrics.deliveredCount} pagados · {metrics.pendingCount} en proceso
            </div>
          </div>
        </div>
      </div>

      {/* Daily Breakdown & Top Products Split (when data exists) */}
      {metrics.dailyBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Breakdown by Day */}
          <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#B6C2D2]/15 flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0B1933] dark:text-white">
                Resumen por Día ({metrics.dailyBreakdown.length})
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                Clic en un día para filtrar
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-[#B6C2D2]/10 max-h-64 overflow-y-auto">
              {metrics.dailyBreakdown.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => {
                    setSpecificDate(day.dateKey);
                    setPeriodPreset('specific_day');
                  }}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-[#13264A]/60 transition-colors cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-semibold font-mono tabular-nums text-[#0B1933] dark:text-white">
                      {formatDateReadable(day.dateKey)}
                      {day.dateKey === todayKey ? ' (Hoy)' : ''}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                      {day.count} cobrado(s)
                      {day.pendingCount > 0 ? ` · ${day.pendingCount} pendiente(s)` : ''}
                    </div>
                  </div>
                  <div className="text-xs font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(day.total, currency)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Top Products in Selected Period */}
          <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#B6C2D2]/15 flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0B1933] dark:text-white">
                Productos Más Vendidos del Período
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                Top {metrics.topProducts.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-[#B6C2D2]/10 max-h-64 overflow-y-auto">
              {metrics.topProducts.map((prod) => (
                <div
                  key={prod.name}
                  className="px-4 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#0B1933] dark:text-white truncate">
                      {prod.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                      {prod.quantity} unidad(es) vendidas
                    </div>
                  </div>
                  <div className="text-xs font-bold font-mono tabular-nums text-[#0B1933] dark:text-white shrink-0">
                    {formatCurrency(prod.revenue, currency)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Historical Orders Table */}
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-[#B6C2D2]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#0B1933] dark:text-white">
            Detalle Histórico de Pedidos Web ({filteredOrders.length})
          </h3>
          <span className="text-xs text-slate-500 dark:text-[#94A3B8] tabular-nums">
            Total neto listado:{' '}
            <strong className="font-mono text-[#0B1933] dark:text-white">
              {formatCurrency(
                filteredOrders.reduce((acc, o) => acc + getOrderNetTotal(o), 0),
                currency
              )}
            </strong>
          </span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <ShoppingBag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <div>
              <p className="text-sm font-semibold text-[#0B1933] dark:text-white">
                No hay ventas web para este filtro o fecha
              </p>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-1">
                Probá seleccionando otro rango (Últimos 7 días, Último mes o Todo el historial) o compartí tu Catálogo Online para recibir pedidos.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              {periodPreset !== 'all' && (
                <button
                  type="button"
                  onClick={() => setPeriodPreset('all')}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-[#0B1933] dark:text-white hover:bg-slate-50 dark:hover:bg-[#13264A] cursor-pointer"
                >
                  Ver todo el historial
                </button>
              )}
              <button
                type="button"
                onClick={onOpenCatalogManager}
                className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
              >
                Abrir Catálogo Online
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#B6C2D2]/15 bg-slate-50 dark:bg-[#071021] text-slate-500 dark:text-[#94A3B8] font-semibold">
                  <th className="py-2.5 px-4 whitespace-nowrap">Fecha / Hora</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Pedido y Cliente</th>
                  <th className="py-2.5 px-4">Productos</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Entrega y Pago</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Estado</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Importe</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#B6C2D2]/10">
                {filteredOrders.map((order) => {
                  const isDelivery = order.deliveryMethod === 'envio';
                  const dk = toLocalDateKey(order.createdAt);
                  const tk = formatTimeReadable(order.createdAt);
                  const paymentLabel = resolvePaymentLabel(
                    order.confirmedPaymentMethod || order.preferredPaymentMethod,
                    isDelivery
                  );
                  const statusLabel = resolveStatusLabel(order.status, isDelivery);

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-[#13264A]/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-[#CBD5E1] whitespace-nowrap align-top">
                        <div className="font-semibold text-[#0B1933] dark:text-white">
                          {formatDateReadable(dk)}
                        </div>
                        {tk && (
                          <div className="text-[11px] text-slate-500 dark:text-[#8D9CB0]">{tk} hs</div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-semibold text-[#0B1933] dark:text-white">
                          {order.customerName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#8D9CB0] font-mono tabular-nums">
                          #{order.orderNumber} · {order.customerPhone}
                        </div>
                        {order.linkedBoletaNumber && (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                            Boleta #{order.linkedBoletaNumber}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top max-w-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedOrderForDetail(order)}
                          className="w-full text-left space-y-1.5 text-slate-700 dark:text-[#CBD5E1] cursor-pointer group"
                          title="Clic para abrir la venta y ver fotos y códigos"
                        >
                          {order.items.map((it, idx) => {
                            const matched =
                              productMap.byId.get(it.productId) ||
                              productMap.byName.get(it.productName.trim().toLowerCase());
                            const thumb = matched?.imageUrl || it.imageUrl;
                            const skuCode = (it.sku || matched?.sku || '').trim();
                            return (
                              <div key={`${order.id}-${idx}`} className="flex items-center gap-2 min-w-0">
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={it.productName}
                                    referrerPolicy="no-referrer"
                                    className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-[#B6C2D2]/20 shrink-0"
                                  />
                                ) : (
                                  <div className="w-7 h-7 rounded-md border border-slate-200 dark:border-[#B6C2D2]/20 bg-slate-100 dark:bg-[#071021] flex items-center justify-center text-slate-400 shrink-0">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                  </div>
                                )}
                                <div className="min-w-0 truncate group-hover:underline">
                                  <span className="font-mono tabular-nums font-semibold">
                                    {it.quantity}×
                                  </span>{' '}
                                  {it.productName}
                                  {it.variantLabel && (
                                    <span className="ml-1 font-semibold text-indigo-700 dark:text-indigo-300">
                                      ({it.variantLabel})
                                    </span>
                                  )}
                                  {skuCode && (
                                    <span className="ml-1 font-mono text-[10px] text-slate-500 dark:text-sky-300">
                                      [Cód: {skuCode}]
                                    </span>
                                  )}
                                  <span className="text-slate-400 dark:text-[#8D9CB0]">
                                    {' '}
                                    ({formatCurrency(it.subtotal, order.currencySymbol || currency)})
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {(order.customerSpecificRequest || order.notes) && (
                            <div className="text-[11px] text-amber-800 dark:text-amber-300 truncate pt-0.5">
                              Obs: {order.customerSpecificRequest || order.notes}
                            </div>
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 font-medium text-[#0B1933] dark:text-white">
                          {isDelivery ? (
                            <Truck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                          ) : (
                            <Store className="w-3.5 h-3.5 text-slate-500 dark:text-[#94A3B8]" />
                          )}
                          <span>{isDelivery ? 'Envío' : 'Retiro'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#8D9CB0] mt-0.5">
                          {paymentLabel}
                        </div>
                        {order.transferReceiptImageUrl && (
                          <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            {order.paymentStatus === 'acreditado'
                              ? 'Comprobante confirmado'
                              : 'Comprobante adjuntado'}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            order.status === 'retirado'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : order.status === 'cancelado' || order.status === 'devuelto'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {statusLabel}
                        </span>
                        {order.returnStatus && order.returnStatus !== 'ninguna' && order.status !== 'devuelto' && (
                          <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300 mt-0.5">
                            {order.returnStatus === 'cambio' ? 'Cambio registrado' : 'Devolución parcial'}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-right font-mono tabular-nums font-bold text-[#0B1933] dark:text-white whitespace-nowrap">
                        <div>{formatCurrency(getOrderNetTotal(order), order.currencySymbol || currency)}</div>
                        {Number(order.returnedAmount || 0) > 0 && order.status !== 'devuelto' && (
                          <div className="text-[10px] font-normal text-rose-600 dark:text-rose-400">
                            (-{formatCurrency(order.returnedAmount || 0, order.currencySymbol || currency)} dev.)
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrderForDetail(order)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white hover:bg-slate-50 dark:hover:bg-[#13264A] cursor-pointer"
                            title="Abrir venta y ver fotos y códigos de los productos"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Abrir Venta</span>
                          </button>
                          {onMarkOrderAsRetirado &&
                            order.status !== 'retirado' &&
                            order.status !== 'cancelado' &&
                            order.status !== 'devuelto' && (
                              <button
                                type="button"
                                onClick={() => onMarkOrderAsRetirado(order)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                title="Marcar como Retirado / Pagado y sumar al dinero generado en la web"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{isDelivery ? 'Entregado (Pagado)' : 'Retirado (Pagado)'}</span>
                              </button>
                            )}
                          {onOpenReturnModal && order.status !== 'cancelado' && order.status !== 'devuelto' && (
                            <button
                              type="button"
                              onClick={() => onOpenReturnModal(order)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                              title="Gestionar cambio o devolución y restar puntos de ser necesario"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Cambio / Devol.</span>
                            </button>
                          )}
                          {onBillOrder &&
                            !order.linkedBoletaNumber &&
                            order.status !== 'cancelado' &&
                            order.status !== 'devuelto' && (
                              <button
                                type="button"
                                onClick={() => onBillOrder(order)}
                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-[#0B1933] dark:text-white hover:bg-slate-50 dark:hover:bg-[#13264A] cursor-pointer"
                              >
                                Facturar
                              </button>
                            )}
                          {onOpenReceipt && order.status !== 'cancelado' && order.status !== 'devuelto' && (
                            <button
                              type="button"
                              onClick={() => handleOpenOrderReceipt(order)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                            >
                              <Receipt className="w-3 h-3" />
                              <span>Comprobante</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detalle de Venta Web (Fotos Ampliables + Códigos) */}
      <WebOrderDetailModal
        isOpen={Boolean(activeOrderForDetail)}
        onClose={() => setSelectedOrderForDetail(null)}
        order={activeOrderForDetail}
        products={products}
        config={config}
        onMarkAsRetirado={onMarkOrderAsRetirado}
        onOpenReceipt={onOpenReceipt ? handleOpenOrderReceipt : undefined}
        onBillOrder={onBillOrder}
        onChangePaymentMethod={onChangeOrderPaymentMethod}
        onOpenReturnModal={onOpenReturnModal}
      />
    </div>
  );
};
