import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  FileDown,
  MessageCircle,
  Search,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Calendar,
  MapPin,
  ChevronDown,
  ChevronUp,
  Bike,
  Banknote,
  ArrowRightLeft,
  Clock,
  XCircle,
  History,
  CheckCheck,
  RotateCcw,
} from 'lucide-react';
import {
  Boleta,
  DistributorConfig,
  RendicionItemStatus,
  RendicionRouteItem,
  Salesperson,
  SalespersonRendicion,
} from '../types';
import { formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import { createWhatsAppUrl } from '../utils/whatsapp';
import { downloadRendicionComprobantePdf, downloadRouteSheetPdf } from '../utils/visualRendicion';

interface SalespersonRendicionViewProps {
  boletas: Boleta[];
  salespeople: Salesperson[];
  rendiciones: SalespersonRendicion[];
  config: DistributorConfig;
  currentDateRef: string;
  activeAdminName: string;
  onConfirmRendicion: (rendicion: SalespersonRendicion) => void;
  onNavigateToSalespeople: () => void;
}

interface DraftRowState {
  outcome: RendicionItemStatus;
  collectedCash: string;
  collectedTransfer: string;
  collectedOther: string;
  extensionDays: string;
  note: string;
}

const OUTCOME_OPTIONS: {
  id: RendicionItemStatus;
  label: string;
  shortLabel: string;
  activeClass: string;
}[] = [
  {
    id: 'cobrada_total',
    label: 'Cobrada (Efectivo)',
    shortLabel: 'Efectivo',
    activeClass: 'bg-emerald-700 text-white border-emerald-600',
  },
  {
    id: 'transferencia_directa',
    label: 'Transferencia Directa',
    shortLabel: 'Transf.',
    activeClass: 'bg-sky-700 text-white border-sky-600',
  },
  {
    id: 'pago_parcial',
    label: 'Entrega Parcial',
    shortLabel: 'Parcial',
    activeClass: 'bg-amber-600 text-white border-amber-500',
  },
  {
    id: 'cheque_otro',
    label: 'Cheque / Otro',
    shortLabel: 'Cheque',
    activeClass: 'bg-indigo-700 text-white border-indigo-600',
  },
  {
    id: 'prorroga_promesa',
    label: 'Prórroga / Promesa',
    shortLabel: 'Prórroga',
    activeClass: 'bg-[#162E59] text-white border-[#B6C2D2]/50',
  },
  {
    id: 'no_cobrada',
    label: 'No Cobrada',
    shortLabel: 'No cobró',
    activeClass: 'bg-slate-600 text-white border-slate-500',
  },
];

export const SalespersonRendicionView: React.FC<SalespersonRendicionViewProps> = ({
  boletas,
  salespeople,
  rendiciones,
  config,
  currentDateRef,
  activeAdminName,
  onConfirmRendicion,
  onNavigateToSalespeople,
}) => {
  const sym = config.currencySymbol || '$';
  const [subTab, setSubTab] = useState<'nueva' | 'historial'>('nueva');
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string>(
    () => salespeople.find((s) => s.active !== false)?.id || salespeople[0]?.id || ''
  );
  const [routeDate, setRouteDate] = useState<string>(currentDateRef);
  const [scope, setScope] = useState<'due_or_overdue' | 'all_pending'>('due_or_overdue');
  const [searchTerm, setSearchTerm] = useState('');
  const [draftsByBoleta, setDraftsByBoleta] = useState<Record<string, DraftRowState>>({});
  const [declaredCashInput, setDeclaredCashInput] = useState<string>('');
  const [applyToBoletas, setApplyToBoletas] = useState<boolean>(true);
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [formFeedback, setFormFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [expandedRendicionId, setExpandedRendicionId] = useState<string | null>(
    rendiciones[0]?.id || null
  );
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Mantener vendedor seleccionado válido si cambia la lista o tenant
  useEffect(() => {
    if (!salespeople.length) {
      setSelectedSalespersonId('');
      return;
    }
    if (!salespeople.some((s) => s.id === selectedSalespersonId)) {
      setSelectedSalespersonId(salespeople.find((s) => s.active !== false)?.id || salespeople[0].id);
    }
  }, [salespeople, selectedSalespersonId]);

  const selectedSalesperson = useMemo(
    () => salespeople.find((s) => s.id === selectedSalespersonId) || null,
    [salespeople, selectedSalespersonId]
  );

  // Filtrar boletas pendientes asignadas al preventista + alcance elegido
  const routeBoletas = useMemo(() => {
    if (!selectedSalespersonId) return [];
    const term = searchTerm.trim().toLowerCase();

    return boletas
      .filter((b) => b.status === 'pending' && b.salespersonId === selectedSalespersonId)
      .filter((b) => {
        if (scope === 'due_or_overdue') {
          const targetDate = b.promisedPaymentDate || b.dueDate;
          return targetDate <= routeDate;
        }
        return true;
      })
      .filter((b) => {
        if (!term) return true;
        return (
          b.clientName.toLowerCase().includes(term) ||
          (b.clientAddress || '').toLowerCase().includes(term) ||
          b.boletaNumber.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [boletas, selectedSalespersonId, scope, routeDate, searchTerm]);

  // Calcular ítems normalizados combinando las boletas visibles y su estado borrador
  const routeItems: RendicionRouteItem[] = useMemo(() => {
    const defaultExtDays = String(config.defaultExtensionDays || 3);
    return routeBoletas.map((b) => {
      const bal = getBoletaBalance(b).balanceDue;
      const draft = draftsByBoleta[b.id];
      const outcome: RendicionItemStatus = draft?.outcome || 'no_cobrada';

      let collectedCash = 0;
      let collectedTransfer = 0;
      let collectedOther = 0;
      let extensionDays: number | undefined;

      if (outcome === 'cobrada_total') {
        collectedCash = bal;
      } else if (outcome === 'transferencia_directa') {
        collectedTransfer = bal;
      } else if (outcome === 'cheque_otro') {
        collectedOther = bal;
      } else if (outcome === 'pago_parcial') {
        collectedCash = Math.max(0, Number(draft?.collectedCash) || 0);
        collectedTransfer = Math.max(0, Number(draft?.collectedTransfer) || 0);
        collectedOther = Math.max(0, Number(draft?.collectedOther) || 0);
      } else if (outcome === 'prorroga_promesa') {
        extensionDays = Math.max(1, Number(draft?.extensionDays || defaultExtDays) || 3);
      }

      return {
        boletaId: b.id,
        boletaNumber: b.boletaNumber,
        clientId: b.clientId,
        clientName: b.clientName,
        clientAddress: b.clientAddress,
        dueDate: b.dueDate,
        expectedBalance: bal,
        outcome,
        collectedCash: Math.round(collectedCash * 100) / 100,
        collectedTransfer: Math.round(collectedTransfer * 100) / 100,
        collectedOther: Math.round(collectedOther * 100) / 100,
        extensionDays,
        note: draft?.note || '',
      };
    });
  }, [routeBoletas, draftsByBoleta, config.defaultExtensionDays]);

  const totals = useMemo(() => {
    let totalExpectedOnRoute = 0;
    let systemCashCollected = 0;
    let systemTransferCollected = 0;
    let systemOtherCollected = 0;
    let countCobrada = 0;
    let countParcial = 0;
    let countProrroga = 0;
    let countNoCobrada = 0;

    for (const item of routeItems) {
      totalExpectedOnRoute += item.expectedBalance;
      systemCashCollected += item.collectedCash;
      systemTransferCollected += item.collectedTransfer;
      systemOtherCollected += item.collectedOther;

      if (
        item.outcome === 'cobrada_total' ||
        item.outcome === 'transferencia_directa' ||
        item.outcome === 'cheque_otro'
      ) {
        countCobrada++;
      } else if (item.outcome === 'pago_parcial') {
        countParcial++;
      } else if (item.outcome === 'prorroga_promesa') {
        countProrroga++;
      } else {
        countNoCobrada++;
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const declaredCash = Math.max(0, Number(declaredCashInput) || 0);
    const sysCashRounded = round2(systemCashCollected);
    const cashDifference = round2(declaredCash - sysCashRounded);

    return {
      totalExpectedOnRoute: round2(totalExpectedOnRoute),
      systemCashCollected: sysCashRounded,
      systemTransferCollected: round2(systemTransferCollected),
      systemOtherCollected: round2(systemOtherCollected),
      totalSystemCollected: round2(
        systemCashCollected + systemTransferCollected + systemOtherCollected
      ),
      declaredCash,
      cashDifference,
      countCobrada,
      countParcial,
      countProrroga,
      countNoCobrada,
    };
  }, [routeItems, declaredCashInput]);

  const updateRowDraft = (boletaId: string, patch: Partial<DraftRowState>) => {
    setFormFeedback(null);
    setDraftsByBoleta((prev) => {
      const current: DraftRowState = prev[boletaId] || {
        outcome: 'no_cobrada',
        collectedCash: '',
        collectedTransfer: '',
        collectedOther: '',
        extensionDays: String(config.defaultExtensionDays || 3),
        note: '',
      };
      return {
        ...prev,
        [boletaId]: { ...current, ...patch },
      };
    });
  };

  const handleBulkOutcome = (outcome: RendicionItemStatus) => {
    setFormFeedback(null);
    const next: Record<string, DraftRowState> = { ...draftsByBoleta };
    routeBoletas.forEach((b) => {
      const cur = next[b.id] || {
        outcome: 'no_cobrada',
        collectedCash: '',
        collectedTransfer: '',
        collectedOther: '',
        extensionDays: String(config.defaultExtensionDays || 3),
        note: '',
      };
      next[b.id] = { ...cur, outcome };
    });
    setDraftsByBoleta(next);
  };

  const handleSendRouteSheetWhatsApp = () => {
    if (!selectedSalesperson || routeItems.length === 0) return;
    const lines = routeItems.slice(0, 22).map((item, idx) => {
      const addr = item.clientAddress ? ` (${item.clientAddress})` : '';
      return `${idx + 1}. *${item.clientName}*${addr}\n   Boleta #${item.boletaNumber} · Saldo: *${formatCurrency(item.expectedBalance, sym)}* · Vto: ${formatDateEs(item.dueDate)}`;
    });
    if (routeItems.length > 22) {
      lines.push(`... y ${routeItems.length - 22} comprobante(s) más en sistema.`);
    }

    const msg = [
      `📋 *HOJA DE RUTA Y COBRANZA — ${config.distributorName}*`,
      `Preventista / Repartidor: *${selectedSalesperson.name}*`,
      `Fecha de ruta: *${formatDateEs(routeDate)}* · Zona: ${selectedSalesperson.zone || 'General'}`,
      `Total asignado a cobrar: *${formatCurrency(totals.totalExpectedOnRoute, sym)}* (${routeItems.length} boletas)`,
      '',
      ...lines,
      '',
      'Por favor confirmar cada cobro (Efectivo / Transferencia / Prórroga) al finalizar el reparto para rendir caja.',
    ].join('\n');

    const url = createWhatsAppUrl(selectedSalesperson.phone || '', msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadRoutePdf = async () => {
    if (!selectedSalesperson || routeItems.length === 0) return;
    setIsExportingPdf(true);
    try {
      await downloadRouteSheetPdf({
        config,
        salesperson: selectedSalesperson,
        routeDate,
        scope,
        items: routeItems,
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleConfirmSubmit = () => {
    if (!selectedSalesperson) {
      setFormFeedback({ type: 'err', text: 'Seleccioná un preventista o repartidor.' });
      return;
    }
    if (routeItems.length === 0) {
      setFormFeedback({
        type: 'err',
        text: 'No hay comprobantes en la hoja de ruta actual para cerrar rendición.',
      });
      return;
    }

    // Validar entregas parciales con monto > 0
    const invalidPartial = routeItems.find(
      (i) =>
        i.outcome === 'pago_parcial' &&
        i.collectedCash + i.collectedTransfer + i.collectedOther <= 0
    );
    if (invalidPartial) {
      setFormFeedback({
        type: 'err',
        text: `Ingresá el monto cobrado en la entrega parcial de ${invalidPartial.clientName} (#${invalidPartial.boletaNumber}).`,
      });
      return;
    }

    const nextSeq = rendiciones.length + 1;
    const rendicionNumber = `REND-${String(nextSeq).padStart(3, '0')}`;
    const newRendicion: SalespersonRendicion = {
      id: `rend-${Date.now()}`,
      rendicionNumber,
      date: routeDate,
      createdAt: new Date().toISOString(),
      salespersonId: selectedSalesperson.id,
      salespersonName: selectedSalesperson.name,
      zone: selectedSalesperson.zone || 'General',
      routeScope: scope,
      totalExpectedOnRoute: totals.totalExpectedOnRoute,
      systemCashCollected: totals.systemCashCollected,
      systemTransferCollected: totals.systemTransferCollected,
      systemOtherCollected: totals.systemOtherCollected,
      declaredCashInHand: totals.declaredCash,
      cashDifference: totals.cashDifference,
      items: routeItems,
      settledByAdmin: activeAdminName || 'Administración',
      notes: generalNotes.trim() || undefined,
      appliedToBoletas: applyToBoletas,
    };

    onConfirmRendicion(newRendicion);

    // Limpiar borradores de las boletas procesadas y pasar a historial expandido
    setDraftsByBoleta({});
    setDeclaredCashInput('');
    setGeneralNotes('');
    setFormFeedback({
      type: 'ok',
      text: `${rendicionNumber} cerrada y guardada (${selectedSalesperson.name}).`,
    });
    setExpandedRendicionId(newRendicion.id);
    setSubTab('historial');
  };

  const handleSendRendicionWhatsApp = (rend: SalespersonRendicion) => {
    const seller = salespeople.find((s) => s.id === rend.salespersonId);
    const diffText =
      Math.abs(rend.cashDifference) < 0.01
        ? 'CUADRA EXACTO ($0)'
        : rend.cashDifference < 0
        ? `FALTANTE DE CAJA: -${formatCurrency(Math.abs(rend.cashDifference), sym)}`
        : `SOBRANTE DE CAJA: +${formatCurrency(rend.cashDifference, sym)}`;

    const cobradasCount = rend.items.filter(
      (i) =>
        i.outcome === 'cobrada_total' ||
        i.outcome === 'transferencia_directa' ||
        i.outcome === 'cheque_otro'
    ).length;
    const parcialesCount = rend.items.filter((i) => i.outcome === 'pago_parcial').length;
    const prorrogasCount = rend.items.filter((i) => i.outcome === 'prorroga_promesa').length;

    const msg = [
      `🧾 *COMPROBANTE DE RENDICIÓN ${rend.rendicionNumber}*`,
      `Empresa: *${config.distributorName}*`,
      `Preventista / Repartidor: *${rend.salespersonName}* (${rend.zone})`,
      `Fecha de ruta: *${formatDateEs(rend.date)}* · Controló: ${rend.settledByAdmin}`,
      '',
      `💵 Efectivo según boletas: *${formatCurrency(rend.systemCashCollected, sym)}*`,
      `💰 Efectivo físico entregado: *${formatCurrency(rend.declaredCashInHand, sym)}*`,
      `📊 Resultado de arqueo: *${diffText}*`,
      `🏦 Transferencias directas: *${formatCurrency(rend.systemTransferCollected, sym)}*`,
      rend.systemOtherCollected > 0
        ? `📝 Cheques / Otros: *${formatCurrency(rend.systemOtherCollected, sym)}*`
        : '',
      '',
      `Resumen de ${rend.items.length} comprobantes: ${cobradasCount} cobradas · ${parcialesCount} parciales · ${prorrogasCount} prórrogas.`,
      rend.notes ? `Obs.: ${rend.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const url = createWhatsAppUrl(seller?.phone || '', msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const historyKpis = useMemo(() => {
    let totalCashDeclared = 0;
    let totalTransfer = 0;
    let totalOther = 0;
    let netDiff = 0;
    for (const r of rendiciones) {
      totalCashDeclared += r.declaredCashInHand;
      totalTransfer += r.systemTransferCollected;
      totalOther += r.systemOtherCollected;
      netDiff += r.cashDifference;
    }
    return { totalCashDeclared, totalTransfer, totalOther, netDiff };
  }, [rendiciones]);

  if (salespeople.length === 0) {
    return (
      <div className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-[#091428] text-white flex items-center justify-center mx-auto">
          <Bike className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[#0B1933] dark:text-white">
            Necesitás registrar Preventistas o Repartidores
          </h3>
          <p className="text-xs text-slate-600 dark:text-[#94A3B8] max-w-md mx-auto">
            Para emitir hojas de ruta y controlar la rendición diaria de efectivo, primero cargá al menos un preventista o repartidor en el equipo.
          </p>
        </div>
        <button
          type="button"
          onClick={onNavigateToSalespeople}
          className="px-4 py-2 bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:text-[#091428] text-white text-xs font-bold rounded-lg cursor-pointer"
        >
          Ir a Preventistas / Vendedores →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner + Subtabs */}
      <div className="bg-[#0B1933] text-white rounded-xl border border-[#B6C2D2]/25 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-[#162E59] border border-[#B6C2D2]/25 shrink-0">
            <ClipboardCheck className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Rendición de Caja por Preventista / Repartidor
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#162E59] border border-[#B6C2D2]/25 text-[#E2E8F0]">
                MAYORISTA / DISTRIBUIDORA
              </span>
            </div>
            <p className="text-xs text-[#CBD5E1] mt-1">
              Generá la hoja de cobro antes de salir a la calle, registrá cobros o prórrogas al regreso y arqueá el efectivo físico sin errores.
            </p>
          </div>
        </div>

        <div className="inline-flex bg-[#091428] p-1 rounded-lg border border-[#B6C2D2]/20 shrink-0 self-start md:self-center">
          <button
            type="button"
            onClick={() => setSubTab('nueva')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
              subTab === 'nueva'
                ? 'bg-[#E2E8F0] text-[#091428]'
                : 'text-[#CBD5E1] hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Hoja de Ruta y Arqueo</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('historial')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 tabular-nums ${
              subTab === 'historial'
                ? 'bg-[#E2E8F0] text-[#091428]'
                : 'text-[#CBD5E1] hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Historial ({rendiciones.length})</span>
          </button>
        </div>
      </div>

      {formFeedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            formFeedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/50 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-700/50 text-rose-900 dark:text-rose-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {formFeedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{formFeedback.text}</span>
          </span>
          <button
            type="button"
            onClick={() => setFormFeedback(null)}
            className="underline text-[11px] cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {subTab === 'nueva' ? (
        <div className="space-y-5">
          {/* Controls & Route Sheet Export Bar */}
          <div className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-1">
                  Preventista / Repartidor
                </label>
                <select
                  value={selectedSalespersonId}
                  onChange={(e) => {
                    setSelectedSalespersonId(e.target.value);
                    setFormFeedback(null);
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#091428] text-[#0B1933] dark:text-white"
                >
                  {salespeople.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.zone || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-1">
                  Fecha de Ruta / Rendición
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={routeDate}
                    onChange={(e) => setRouteDate(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#091428] text-[#0B1933] dark:text-white tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-1">
                  Alcance de Cartera en Ruta
                </label>
                <select
                  value={scope}
                  onChange={(e) =>
                    setScope(e.target.value === 'all_pending' ? 'all_pending' : 'due_or_overdue')
                  }
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#091428] text-[#0B1933] dark:text-white"
                >
                  <option value="due_or_overdue">Vencen hoy o atrasadas (Hoja diaria)</option>
                  <option value="all_pending">Todas las boletas pendientes del preventista</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-1">
                  Buscar comercio o #boleta
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Ej: Almacén, #1024..."
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#091428] text-[#0B1933] dark:text-white"
                  />
                </div>
              </div>
            </div>

            {/* Dispatch Route Sheet Bar */}
            <div className="pt-3 border-t border-slate-200 dark:border-[#B6C2D2]/15 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <span className="text-slate-600 dark:text-[#CBD5E1] font-medium">
                  En esta hoja:{' '}
                  <strong className="text-[#0B1933] dark:text-white font-mono tabular-nums">
                    {routeItems.length} comprobante(s)
                  </strong>
                </span>
                <span className="text-slate-600 dark:text-[#CBD5E1] font-medium">
                  Saldo total a cobrar:{' '}
                  <strong className="text-[#0B1933] dark:text-white font-mono tabular-nums">
                    {formatCurrency(totals.totalExpectedOnRoute, sym)}
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={routeItems.length === 0}
                  onClick={handleSendRouteSheetWhatsApp}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Enviar Hoja de Cobro por WhatsApp</span>
                </button>
                <button
                  type="button"
                  disabled={routeItems.length === 0 || isExportingPdf}
                  onClick={handleDownloadRoutePdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#162E59] dark:hover:bg-[#1E3A6D] disabled:opacity-40 text-white border border-[#B6C2D2]/30 text-xs font-bold transition-colors cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>{isExportingPdf ? 'Generando PDF...' : 'Descargar Hoja de Ruta (PDF)'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Main Grid: Route Invoices List + Cash Arqueo Box */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            {/* Left 2 cols: Invoices Table */}
            <div className="xl:col-span-2 bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 overflow-hidden">
              <div className="px-4 py-3 bg-[#F8FAFC] dark:bg-[#091428] border-b border-slate-200 dark:border-[#B6C2D2]/15 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-[#0B1933] dark:text-white">
                    Detalle de Comprobantes en Calle ({routeItems.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                    Marcá el resultado de cada visita al regreso del reparto.
                  </p>
                </div>

                {routeItems.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkOutcome('cobrada_total')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 text-[11px] font-bold cursor-pointer"
                    >
                      <CheckCheck className="w-3 h-3" />
                      <span>Todas Efectivo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkOutcome('no_cobrada')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-slate-700 dark:text-[#CBD5E1] border border-slate-300 dark:border-[#B6C2D2]/20 text-[11px] font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reiniciar a No Cobrada</span>
                    </button>
                  </div>
                )}
              </div>

              {routeItems.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <p className="text-sm font-bold text-[#0B1933] dark:text-white">
                    No hay boletas pendientes en este filtro
                  </p>
                  <p className="text-xs text-slate-500 dark:text-[#94A3B8] max-w-sm mx-auto">
                    {scope === 'due_or_overdue'
                      ? 'Este preventista no tiene boletas vencidas ni que venzan hoy. Podés cambiar el alcance a "Todas las boletas pendientes" si querés incluir boletas futuras.'
                      : 'Este preventista no tiene boletas pendientes registradas.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-[#B6C2D2]/15">
                  {routeItems.map((item) => {
                    const draft = draftsByBoleta[item.boletaId];
                    const isOverdue = item.dueDate < routeDate;
                    const isToday = item.dueDate === routeDate;

                    return (
                      <div
                        key={item.boletaId}
                        className="p-3.5 sm:p-4 hover:bg-slate-50/70 dark:hover:bg-[#10203E]/50 transition-colors space-y-2.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#E9EEF5] dark:bg-[#13264A] text-[#0B1933] dark:text-white tabular-nums">
                                #{item.boletaNumber}
                              </span>
                              <span className="text-sm font-bold text-[#0B1933] dark:text-white truncate">
                                {item.clientName}
                              </span>
                              {isOverdue && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                                  ATRASADA
                                </span>
                              )}
                              {isToday && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                                  VENCE HOY
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-[#94A3B8] mt-1 flex-wrap">
                              {item.clientAddress && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {item.clientAddress}
                                </span>
                              )}
                              <span className="tabular-nums">Vto: {formatDateEs(item.dueDate)}</span>
                            </div>
                          </div>

                          <div className="text-left sm:text-right shrink-0">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-[#94A3B8] block">
                              Saldo en Boleta
                            </span>
                            <span className="text-base font-mono font-bold text-[#0B1933] dark:text-white tabular-nums">
                              {formatCurrency(item.expectedBalance, sym)}
                            </span>
                          </div>
                        </div>

                        {/* Outcome Buttons */}
                        <div className="flex flex-wrap gap-1.5">
                          {OUTCOME_OPTIONS.map((opt) => {
                            const selected = item.outcome === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => updateRowDraft(item.boletaId, { outcome: opt.id })}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                                  selected
                                    ? opt.activeClass
                                    : 'bg-slate-50 dark:bg-[#091428] text-slate-700 dark:text-[#CBD5E1] border-slate-300 dark:border-[#B6C2D2]/20 hover:bg-slate-100 dark:hover:bg-[#13264A]'
                                }`}
                              >
                                {opt.shortLabel}
                              </button>
                            );
                          })}
                        </div>

                        {/* Extra Conditional Inputs per Outcome */}
                        {item.outcome === 'pago_parcial' && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-300/60 dark:border-amber-700/40">
                            <div>
                              <label className="block text-[10px] font-bold text-amber-900 dark:text-amber-300 mb-0.5">
                                Cobrado en Efectivo ({sym})
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft?.collectedCash ?? ''}
                                onChange={(e) =>
                                  updateRowDraft(item.boletaId, { collectedCash: e.target.value })
                                }
                                placeholder="0"
                                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#091428] text-[#0B1933] dark:text-white tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-amber-900 dark:text-amber-300 mb-0.5">
                                Transferencia ({sym})
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft?.collectedTransfer ?? ''}
                                onChange={(e) =>
                                  updateRowDraft(item.boletaId, { collectedTransfer: e.target.value })
                                }
                                placeholder="0"
                                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#091428] text-[#0B1933] dark:text-white tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-amber-900 dark:text-amber-300 mb-0.5">
                                Cheque / Otro ({sym})
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft?.collectedOther ?? ''}
                                onChange={(e) =>
                                  updateRowDraft(item.boletaId, { collectedOther: e.target.value })
                                }
                                placeholder="0"
                                className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#091428] text-[#0B1933] dark:text-white tabular-nums"
                              />
                            </div>
                          </div>
                        )}

                        {item.outcome === 'prorroga_promesa' && (
                          <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-[#EEF2F8] dark:bg-[#13264A]/70 border border-[#CBD5E1] dark:border-[#B6C2D2]/25">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-[#0B1933] dark:text-sky-300" />
                              <span className="text-[11px] font-bold text-[#0B1933] dark:text-white">
                                Extender vencimiento (+ días):
                              </span>
                              <input
                                type="number"
                                min="1"
                                max="60"
                                value={draft?.extensionDays ?? String(config.defaultExtensionDays || 3)}
                                onChange={(e) =>
                                  updateRowDraft(item.boletaId, { extensionDays: e.target.value })
                                }
                                className="w-16 px-2 py-1 text-xs font-mono font-bold rounded border border-slate-300 dark:border-[#B6C2D2]/30 bg-white dark:bg-[#091428] text-[#0B1933] dark:text-white tabular-nums"
                              />
                            </div>
                            <span className="text-[11px] text-slate-600 dark:text-[#CBD5E1]">
                              Se registrará visita prometida en la ficha de la boleta.
                            </span>
                          </div>
                        )}

                        <input
                          type="text"
                          value={draft?.note ?? ''}
                          onChange={(e) => updateRowDraft(item.boletaId, { note: e.target.value })}
                          placeholder="Observación de calle opcional (ej: cerró por lluvia, paga el viernes, Nro cheque)..."
                          className="w-full px-2.5 py-1.5 text-[11px] rounded-md border border-slate-200 dark:border-[#B6C2D2]/15 bg-slate-50/70 dark:bg-[#091428]/70 text-slate-700 dark:text-[#CBD5E1]"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Col: Cash Arqueo & Closing Panel */}
            <div className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 p-4 sm:p-5 space-y-4 sticky top-24">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#B6C2D2]/15 pb-3">
                <h3 className="text-sm font-bold text-[#0B1933] dark:text-white flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Arqueo y Cierre de Caja</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-500 dark:text-[#94A3B8]">
                  {selectedSalesperson?.name.split(' ')[0]}
                </span>
              </div>

              {/* System Totals Breakdown */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-[#CBD5E1]">
                  <span>Efectivo esperado (según boletas)</span>
                  <span className="font-mono font-bold text-[#0B1933] dark:text-white tabular-nums">
                    {formatCurrency(totals.systemCashCollected, sym)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-[#CBD5E1]">
                  <span className="flex items-center gap-1">
                    <ArrowRightLeft className="w-3 h-3 text-sky-600" />
                    Transferencias directas
                  </span>
                  <span className="font-mono font-bold text-sky-700 dark:text-sky-300 tabular-nums">
                    {formatCurrency(totals.systemTransferCollected, sym)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-[#CBD5E1]">
                  <span>Cheques / Otros valores</span>
                  <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                    {formatCurrency(totals.systemOtherCollected, sym)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15 flex items-center justify-between font-bold text-[#0B1933] dark:text-white">
                  <span>Total Cobrado en Ruta</span>
                  <span className="font-mono tabular-nums text-sm">
                    {formatCurrency(totals.totalSystemCollected, sym)}
                  </span>
                </div>
              </div>

              {/* Physical Cash Input */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#091428] border border-slate-200 dark:border-[#B6C2D2]/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-[#0B1933] dark:text-[#E2E8F0]">
                    Efectivo Físico Entregado ({sym})
                  </label>
                  <button
                    type="button"
                    onClick={() => setDeclaredCashInput(String(totals.systemCashCollected))}
                    className="text-[11px] font-bold text-sky-700 dark:text-sky-300 hover:underline cursor-pointer tabular-nums"
                  >
                    Igualar ({formatCurrency(totals.systemCashCollected, sym)})
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={declaredCashInput}
                  onChange={(e) => {
                    setDeclaredCashInput(e.target.value);
                    setFormFeedback(null);
                  }}
                  placeholder="Ingresá billetes contados..."
                  className="w-full px-3 py-2 text-base font-mono font-bold rounded-lg border border-slate-300 dark:border-[#B6C2D2]/30 bg-white dark:bg-[#0B1933] text-[#0B1933] dark:text-white tabular-nums"
                />

                {/* Difference Live Status Box */}
                <div
                  className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center justify-between tabular-nums ${
                    Math.abs(totals.cashDifference) < 0.01
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/50 text-emerald-800 dark:text-emerald-300'
                      : totals.cashDifference < 0
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700/50 text-rose-800 dark:text-rose-300'
                      : 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700/50 text-sky-800 dark:text-sky-300'
                  }`}
                >
                  <span>
                    {Math.abs(totals.cashDifference) < 0.01
                      ? 'CUADRA EXACTO'
                      : totals.cashDifference < 0
                      ? 'FALTANTE EN CAJA'
                      : 'SOBRANTE EN CAJA'}
                  </span>
                  <span className="font-mono">
                    {totals.cashDifference >= 0 ? '+' : '-'}
                    {formatCurrency(Math.abs(totals.cashDifference), sym)}
                  </span>
                </div>
              </div>

              {/* Outcome Counters */}
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold tabular-nums">
                <div className="p-1.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
                  <span className="block text-xs">{totals.countCobrada}</span>
                  Cobradas
                </div>
                <div className="p-1.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">
                  <span className="block text-xs">{totals.countParcial}</span>
                  Parciales
                </div>
                <div className="p-1.5 rounded bg-slate-100 dark:bg-[#13264A] text-slate-800 dark:text-[#CBD5E1]">
                  <span className="block text-xs">{totals.countProrroga}</span>
                  Prórrogas
                </div>
                <div className="p-1.5 rounded bg-slate-100 dark:bg-[#091428] text-slate-600 dark:text-[#94A3B8]">
                  <span className="block text-xs">{totals.countNoCobrada}</span>
                  Sin cobro
                </div>
              </div>

              {/* Auto-apply checkbox */}
              <label className="flex items-start gap-2 text-[11px] text-slate-700 dark:text-[#CBD5E1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToBoletas}
                  onChange={(e) => setApplyToBoletas(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span>
                  Aplicar automáticamente cobros totales, entregas parciales y prórrogas sobre las boletas al confirmar la rendición.
                </span>
              </label>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-[#94A3B8] mb-1">
                  Observaciones de rendición (opcional)
                </label>
                <textarea
                  rows={2}
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="Ej: Dejó $5.000 de cambio para mañana o comprobante de transferencia pendiente..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#091428] text-[#0B1933] dark:text-white"
                />
              </div>

              <button
                type="button"
                disabled={routeItems.length === 0}
                onClick={handleConfirmSubmit}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] disabled:opacity-40 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Confirmar y Cerrar Rendición</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* TAB: HISTORIAL DE RENDICIONES */
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-[#0B1933] p-4 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
                Rendiciones Cerradas
              </span>
              <p className="text-xl font-mono font-bold text-[#0B1933] dark:text-white mt-1 tabular-nums">
                {rendiciones.length}
              </p>
            </div>
            <div className="bg-white dark:bg-[#0B1933] p-4 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
                Efectivo Físico Rendido
              </span>
              <p className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                {formatCurrency(historyKpis.totalCashDeclared, sym)}
              </p>
            </div>
            <div className="bg-white dark:bg-[#0B1933] p-4 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
                Transf. y Cheques Controlados
              </span>
              <p className="text-xl font-mono font-bold text-sky-700 dark:text-sky-300 mt-1 tabular-nums">
                {formatCurrency(historyKpis.totalTransfer + historyKpis.totalOther, sym)}
              </p>
            </div>
            <div className="bg-white dark:bg-[#0B1933] p-4 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8]">
                Diferencia Acumulada
              </span>
              <p
                className={`text-xl font-mono font-bold mt-1 tabular-nums ${
                  Math.abs(historyKpis.netDiff) < 0.01
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : historyKpis.netDiff < 0
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-sky-700 dark:text-sky-300'
                }`}
              >
                {historyKpis.netDiff >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(historyKpis.netDiff), sym)}
              </p>
            </div>
          </div>

          {rendiciones.length === 0 ? (
            <div className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 p-10 text-center space-y-2">
              <XCircle className="w-10 h-10 text-slate-300 dark:text-[#64748B] mx-auto" />
              <p className="text-sm font-bold text-[#0B1933] dark:text-white">
                Todavía no hay rendiciones cerradas
              </p>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Cuando cierres la primera hoja de ruta de un preventista, quedará archivada aquí con su comprobante PDF y detalle completo.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rendiciones.map((rend) => {
                const isExpanded = expandedRendicionId === rend.id;
                const diffBadge =
                  Math.abs(rend.cashDifference) < 0.01
                    ? {
                        label: 'CUADRA EXACTO',
                        cls: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300',
                      }
                    : rend.cashDifference < 0
                    ? {
                        label: `FALTANTE -${formatCurrency(Math.abs(rend.cashDifference), sym)}`,
                        cls: 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300',
                      }
                    : {
                        label: `SOBRANTE +${formatCurrency(rend.cashDifference, sym)}`,
                        cls: 'bg-sky-100 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300',
                      };

                return (
                  <div
                    key={rend.id}
                    className="bg-white dark:bg-[#0B1933] rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/20 overflow-hidden"
                  >
                    <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]">
                            {rend.rendicionNumber}
                          </span>
                          <span className="text-sm font-bold text-[#0B1933] dark:text-white">
                            {rend.salespersonName}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-[#94A3B8]">
                            · {rend.zone} · {formatDateEs(rend.date)}
                          </span>
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded tabular-nums ${diffBadge.cls}`}>
                            {diffBadge.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-[#CBD5E1] tabular-nums">
                          <span>
                            Efectivo físico:{' '}
                            <strong className="font-mono text-[#0B1933] dark:text-white">
                              {formatCurrency(rend.declaredCashInHand, sym)}
                            </strong>{' '}
                            (esperado {formatCurrency(rend.systemCashCollected, sym)})
                          </span>
                          <span>
                            Transf.:{' '}
                            <strong className="font-mono text-sky-700 dark:text-sky-300">
                              {formatCurrency(rend.systemTransferCollected, sym)}
                            </strong>
                          </span>
                          <span>{rend.items.length} comprobante(s)</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSendRendicionWhatsApp(rend)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadRendicionComprobantePdf(rend, config)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#162E59] text-white border border-[#B6C2D2]/30 text-xs font-bold cursor-pointer"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Comprobante PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedRendicionId(isExpanded ? null : rend.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#13264A] text-slate-700 dark:text-[#CBD5E1] text-xs font-semibold cursor-pointer"
                        >
                          <span>{isExpanded ? 'Ocultar' : 'Ver detalle'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-[#B6C2D2]/15 bg-slate-50/70 dark:bg-[#091428]/70 p-4 space-y-3">
                        {rend.notes && (
                          <p className="text-xs text-slate-600 dark:text-[#CBD5E1] bg-white dark:bg-[#0B1933] p-2.5 rounded-lg border border-slate-200 dark:border-[#B6C2D2]/15">
                            <strong>Notas:</strong> {rend.notes}
                          </p>
                        )}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="text-[11px] text-slate-500 dark:text-[#94A3B8] border-b border-slate-200 dark:border-[#B6C2D2]/15">
                              <tr>
                                <th className="pb-2 pr-3">Boleta</th>
                                <th className="pb-2 pr-3">Cliente</th>
                                <th className="pb-2 pr-3">Resultado</th>
                                <th className="pb-2 pr-3 text-right">Efectivo</th>
                                <th className="pb-2 pr-3 text-right">Transf. / Otro</th>
                                <th className="pb-2">Obs.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/70 dark:divide-[#B6C2D2]/10">
                              {rend.items.map((row) => (
                                <tr key={row.boletaId}>
                                  <td className="py-2 pr-3 font-mono font-bold text-[#0B1933] dark:text-white">
                                    #{row.boletaNumber}
                                  </td>
                                  <td className="py-2 pr-3 font-semibold text-[#0B1933] dark:text-white">
                                    {row.clientName}
                                  </td>
                                  <td className="py-2 pr-3 text-slate-700 dark:text-[#CBD5E1]">
                                    {OUTCOME_OPTIONS.find((o) => o.id === row.outcome)?.label || row.outcome}
                                  </td>
                                  <td className="py-2 pr-3 text-right font-mono tabular-nums font-bold text-[#0B1933] dark:text-white">
                                    {formatCurrency(row.collectedCash, sym)}
                                  </td>
                                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-sky-700 dark:text-sky-300">
                                    {formatCurrency(row.collectedTransfer + row.collectedOther, sym)}
                                  </td>
                                  <td className="py-2 text-slate-500 dark:text-[#94A3B8]">
                                    {row.extensionDays ? `+${row.extensionDays}d` : ''} {row.note || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
