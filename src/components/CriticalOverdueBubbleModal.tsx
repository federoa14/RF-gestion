import React from 'react';
import {
  Flame,
  AlertTriangle,
  Clock,
  Calendar,
  DollarSign,
  User,
  Bike,
  MessageCircle,
  CheckCircle2,
  Receipt,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Boleta, DistributorConfig, Salesperson, Client } from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import { createWhatsAppUrl, generateClientWhatsAppMessage, generateUserSignedReminder } from '../utils/whatsapp';
import { getAlertThresholds } from '../utils/alertThresholds';

interface CriticalOverdueBubbleModalProps {
  isOpen: boolean;
  onClose: () => void;
  boletas: Boleta[];
  config: DistributorConfig;
  clients: Client[];
  salespeople: Salesperson[];
  onOpenExtendModal: (boleta: Boleta) => void;
  onMarkAsPaid: (boleta: Boleta) => void;
  onOpenPartialModal: (boleta: Boleta) => void;
  onNavigateToUnpaidTab: () => void;
  currentDateRef?: string;
}

export const CriticalOverdueBubbleModal: React.FC<CriticalOverdueBubbleModalProps> = ({
  isOpen,
  onClose,
  boletas,
  config,
  clients,
  salespeople,
  onOpenExtendModal,
  onMarkAsPaid,
  onOpenPartialModal,
  onNavigateToUnpaidTab,
  currentDateRef,
}) => {
  if (!isOpen) return null;

  // Filter only pending boletas with daysPastDueDate >= 5 (or configured grace days)
  const graceThreshold = getAlertThresholds(config).overdueGraceDays;
  const criticalOverdueBoletas = boletas
    .filter((b) => b.status === 'pending')
    .map((b) => ({
      boleta: b,
      status: calculateAlertStatus(b, config, currentDateRef),
      balance: getBoletaBalance(b),
    }))
    .filter((item) => item.status.daysPastDueDate >= graceThreshold)
    .sort((a, b) => b.status.daysPastDueDate - a.status.daysPastDueDate);

  const totalCriticalDebt = criticalOverdueBoletas.reduce(
    (acc, item) => acc + item.balance.balanceDue,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border-2 border-rose-500 rounded-3xl max-w-4xl w-full p-6 shadow-2xl shadow-rose-950/40 space-y-6 my-auto animate-in fade-in zoom-in-95">
        {/* Header with Glowing Red Badge */}
        <div className="flex items-start justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-rose-600 text-white shadow-lg shadow-rose-600/30 animate-pulse mt-0.5">
              <Flame className="w-6 h-6 text-amber-200 fill-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300">
                  🔴 Burbuja de Fiado Vencido Crítico
                </span>
                <span className="text-xs text-rose-600 font-bold">
                  {graceThreshold} o más días de mora (después del vencimiento)
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-1">
                Plata en la Calle que ya Debería Haber Sido Cobrada
              </h2>
              <p className="text-xs text-slate-500 max-w-2xl mt-0.5">
                Boletas fiadas cuyo plazo fijado ya venció hace {graceThreshold} días o más. Aquí puedes revisarlas, gestionar el cobro inmediato o <strong>prorrogarles los días</strong> si el comercio solicitó una extensión.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Big Financial Summary Box */}
        <div className="bg-gradient-to-r from-rose-900 via-red-900 to-rose-950 text-white p-5 rounded-2xl shadow-md border border-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase font-bold text-rose-300 tracking-wider block">
              Total vencido crítico en la calle ({graceThreshold}+ días de mora)
            </span>
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white block mt-1">
              {formatCurrency(totalCriticalDebt, config.currencySymbol)}
            </span>
            <span className="text-xs text-rose-200 mt-1 block">
              Corresponde a {criticalOverdueBoletas.length} boleta(s) fiada(s) que superaron el vencimiento pactado.
            </span>
          </div>

          <button
            onClick={() => {
              onClose();
              onNavigateToUnpaidTab();
            }}
            className="px-4 py-2.5 rounded-xl bg-white text-rose-900 hover:bg-rose-50 text-xs font-black shadow-md flex items-center gap-1.5 self-start sm:self-center transition-all cursor-pointer"
          >
            <span>Ver Todas las Impagas</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* List / Table of Overdue Boletas */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Detalle de Boletas Vencidas ({criticalOverdueBoletas.length}):
            </h3>
            <span className="text-[11px] text-slate-400">
              Ordenadas de mayor a menor atraso
            </span>
          </div>

          {criticalOverdueBoletas.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 space-y-1">
              <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                🎉 ¡Excelente! No hay boletas con {graceThreshold} o más días de mora.
              </p>
              <p className="text-xs">
                Todo el fiado en la calle se encuentra al día o dentro del margen habitual de cobranza.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {criticalOverdueBoletas.map(({ boleta, status, balance }) => {
                const client = clients.find((c) => c.id === boleta.clientId);
                const salesperson = salespeople.find((s) => s.id === boleta.salespersonId);

                // WhatsApp messages respecting company toggle
                const clientPhone = boleta.clientPhone || client?.phone || '';
                const clientMsg = generateClientWhatsAppMessage(boleta, client, config);
                const clientWhatsappUrl = createWhatsAppUrl(clientPhone, clientMsg);

                const sellerPhone = salesperson?.phone || boleta.salespersonPhone || '';
                const sellerMsg = generateUserSignedReminder(
                  boleta,
                  salesperson,
                  'Administración',
                  config,
                  config.customCobranzaTemplate
                );
                const sellerWhatsappUrl = createWhatsAppUrl(sellerPhone, sellerMsg);

                return (
                  <div
                    key={boleta.id}
                    className="p-4 rounded-2xl border-2 border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/20 hover:border-rose-500 transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                            #{boleta.boletaNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase bg-rose-600 text-white">
                            +{status.daysPastDueDate} días vencida
                          </span>
                          {boleta.extensionDays ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                              ⏱️ Prórroga previa: +{boleta.extensionDays}d
                            </span>
                          ) : null}
                        </div>

                        {/* Client details requested */}
                        <div className="mt-1">
                          <h4 className="font-black text-slate-900 dark:text-white text-base">
                            {boleta.clientName}
                          </h4>
                          <p className="text-xs text-slate-500">
                            {boleta.clientAddress || client?.address || 'Sin dirección'}
                            {boleta.clientPhone && ` • Tel/WA: ${boleta.clientPhone}`}
                          </p>
                        </div>
                      </div>

                      {/* Financial info */}
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Saldo a Cobrar
                        </span>
                        <span className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
                          {formatCurrency(balance.balanceDue, config.currencySymbol)}
                        </span>
                        {balance.hasPartialPayments && (
                          <span className="text-[11px] text-emerald-600 block">
                            (Original: {formatCurrency(balance.originalAmount, config.currencySymbol)} • Pagó {balance.percentagePaid}%)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timeline dates: when it was made vs when it should have been paid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white dark:bg-slate-800 p-2.5 rounded-xl text-xs border border-slate-200 dark:border-slate-700">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Fecha de Emisión (Cuándo se hizo):</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatDateEs(boleta.saleDate)}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          (Hace {status.daysElapsed} días)
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">Cuándo se debió cobrar (Vencimiento):</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {formatDateEs(boleta.dueDate)}
                        </span>
                        <span className="text-[10px] text-rose-500 block font-semibold">
                          (Vencida hace {status.daysPastDueDate} días)
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[10px]">Vendedor Asignado:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <Bike className="w-3 h-3 text-indigo-500" />
                          <span>{boleta.salespersonName}</span>
                        </span>
                      </div>
                    </div>

                    {/* Action buttons: Prorrogar, WhatsApp, Cobrar */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* PRORROGAR BOLETA BUTTON */}
                        <button
                          type="button"
                          onClick={() => onOpenExtendModal(boleta)}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
                          title="Extender fecha de vencimiento otorgando más días de prórroga"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Prorrogar Boleta (+Días)</span>
                        </button>

                        {config.enableClientWhatsAppReminders ? (
                          <a
                            href={clientWhatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Enviar recordatorio de boleta vencida directamente al cliente por WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp Cliente</span>
                          </a>
                        ) : (
                          <span
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-[11px] font-medium border border-slate-200 dark:border-slate-700"
                            title="El envío directo de WhatsApp a clientes está desactivado en Dueños & Ajustes"
                          >
                            WhatsApp Cliente Desactivado
                          </span>
                        )}

                        {sellerPhone && (
                          <a
                            href={sellerWhatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Enviar orden de cobro urgente al vendedor"
                          >
                            <Bike className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WA Vendedor</span>
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenPartialModal(boleta)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold shadow-xs"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>Pago Parcial</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onMarkAsPaid(boleta)}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Marcar Cobrada</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
          <span>
            * Las prórrogas recalculan el vencimiento y sacan temporalmente la boleta del estado crítico rojo.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold hover:bg-slate-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
