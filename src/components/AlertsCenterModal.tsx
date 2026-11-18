import React, { useState } from 'react';
import {
  X,
  Bell,
  Flame,
  AlertTriangle,
  Clock,
  MessageCircle,
  Mail,
  Bike,
  ShieldCheck,
  Send,
  ExternalLink,
  CheckCircle2,
  Share2,
  FileText,
  Copy,
} from 'lucide-react';
import { Boleta, Client, Salesperson, Administrator, DistributorConfig } from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs } from '../utils/alerts';
import {
  createWhatsAppUrl,
  createMailtoUrl,
  generateConsolidatedReportForAdmin,
  generateConsolidatedRouteForVendedor,
  generateUserSignedReminder,
} from '../utils/whatsapp';

interface AlertsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  boletas: Boleta[];
  clients: Client[];
  salespeople: Salesperson[];
  admins: Administrator[];
  config: DistributorConfig;
  onRecordReminder?: (boletaId: string, type: any, channel: 'whatsapp' | 'email', recipient: string) => void;
}

export const AlertsCenterModal: React.FC<AlertsCenterModalProps> = ({
  isOpen,
  onClose,
  boletas,
  clients,
  salespeople,
  admins,
  config,
  onRecordReminder,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'overdue' | 'admin_alert' | 'vendedor_3dias'>('overdue');
  const [sentBoletaIds, setSentBoletaIds] = useState<Record<string, boolean>>({});

  // Consolidated Owner Report Modal state
  const [showAdminReportModal, setShowAdminReportModal] = useState(false);
  const [adminReportText, setAdminReportText] = useState('');

  // Seller Route Modal state
  const [showSellerRouteModal, setShowSellerRouteModal] = useState(false);
  const [sellerRouteData, setSellerRouteData] = useState<{
    seller: Salesperson;
    messageText: string;
  } | null>(null);

  if (!isOpen) return null;

  const pending = boletas.filter((b) => b.status === 'pending');
  const generalAdmin = admins.find((a) => a.isGeneralAdmin || a.role === 'dueño') || admins[0];
  const activeAdmin = admins.find((a) => a.id === config.activeAdminId) || generalAdmin;

  // Group boletas by status
  const evaluated = pending.map((b) => ({
    boleta: b,
    status: calculateAlertStatus(b, config),
    salesperson: salespeople.find((s) => s.id === b.salespersonId),
    client: clients.find((c) => c.id === b.clientId),
  }));

  const overdueList = evaluated.filter((e) => e.status.category === 'overdue_today');
  const adminAlertList = evaluated.filter((e) => e.status.category === 'admin_alert');
  const vendedorReminderList = evaluated.filter((e) => e.status.category === 'vendedor_reminder');

  let displayList = evaluated.filter((e) => e.status.category !== 'normal');
  if (activeFilter === 'overdue') displayList = overdueList;
  if (activeFilter === 'admin_alert') displayList = adminAlertList;
  if (activeFilter === 'vendedor_3dias') displayList = vendedorReminderList;

  // Group overdue boletas by salesperson for consolidated routes
  const overdueBySeller: Record<string, Boleta[]> = {};
  for (const item of overdueList) {
    const key = item.boleta.salespersonId || item.boleta.salespersonName;
    if (!overdueBySeller[key]) overdueBySeller[key] = [];
    overdueBySeller[key].push(item.boleta);
  }

  // Open Consolidated Report for the Owner
  const handleOpenOwnerReport = () => {
    const report = generateConsolidatedReportForAdmin(
      overdueList.map((e) => e.boleta),
      salespeople,
      generalAdmin.name,
      config
    );
    setAdminReportText(report);
    setShowAdminReportModal(true);
  };

  const handleSendOwnerReportWhatsApp = () => {
    const url = createWhatsAppUrl(generalAdmin.phone, adminReportText);
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowAdminReportModal(false);
  };

  // Open Consolidated Route for a specific salesperson
  const handleOpenSellerRoute = (sellerId: string) => {
    const seller = salespeople.find((s) => s.id === sellerId);
    const sellerBoletas = overdueBySeller[sellerId];
    if (!seller || !sellerBoletas) return;

    const routeMsg = generateConsolidatedRouteForVendedor(
      sellerBoletas,
      seller,
      activeAdmin.name,
      config
    );

    setSellerRouteData({
      seller,
      messageText: routeMsg,
    });
    setShowSellerRouteModal(true);
  };

  const handleSendSellerRouteWhatsApp = () => {
    if (!sellerRouteData) return;
    const url = createWhatsAppUrl(sellerRouteData.seller.phone, sellerRouteData.messageText);
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowSellerRouteModal(false);
  };

  // Individual dispatch with custom active user signature
  const handleSendVendedorWhatsApp = (item: (typeof evaluated)[0]) => {
    const msg = generateUserSignedReminder(
      item.boleta,
      item.salesperson,
      activeAdmin.name,
      config,
      config.customCobranzaTemplate
    );
    const phone = item.salesperson?.phone || item.boleta.salespersonPhone || '';
    const url = createWhatsAppUrl(phone, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
    setSentBoletaIds((prev) => ({ ...prev, [item.boleta.id]: true }));
    if (onRecordReminder) {
      onRecordReminder(item.boleta.id, item.status.category, 'whatsapp', item.salesperson?.name || 'Vendedor');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative my-8 max-h-[92vh] flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/10 text-rose-600 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Cobranzas del Día & Notificaciones Consolidadas</span>
              </h2>
              <p className="text-xs text-slate-500">
                Avisos automáticos a los vendedores para salir a cobrar y reporte consolidado para el dueño
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* OWNER CONSOLIDATED BANNER - HIGH PRIORITY */}
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-blue-500/10 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="font-bold text-xs text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Notificación para el Dueño / Administrador General
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
              {overdueList.length === 0
                ? 'No hay boletas vencidas hoy. El reporte del dueño está en orden.'
                : `Hoy ${Object.keys(overdueBySeller).length} vendedor(es) tienen que cobrar ${overdueList.length} boleta(s) vencidas en la calle.`}
            </p>
          </div>

          <button
            onClick={handleOpenOwnerReport}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow transition-all hover:scale-[1.02] shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Enviar Reporte Consolidado al Dueño</span>
          </button>
        </div>

        {/* Overdue routes by Seller Pills (if multiple boletas) */}
        {Object.keys(overdueBySeller).length > 0 && (
          <div className="pt-3 pb-1 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Hojas de ruta consolidadas por vendedor (cobranzas de hoy):
            </span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(overdueBySeller).map(([sellerId, bList]) => {
                const seller = salespeople.find((s) => s.id === sellerId);
                const sellerName = seller?.name || bList[0]?.salespersonName || 'Vendedor';
                const total = bList.reduce((acc, b) => acc + (b.amount || 0), 0);

                return (
                  <button
                    key={sellerId}
                    onClick={() => handleOpenSellerRoute(sellerId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800 transition-colors"
                  >
                    <Bike className="w-3.5 h-3.5 text-rose-600" />
                    <span>
                      {sellerName}: {bList.length} {bList.length === 1 ? 'boleta' : 'boletas'} ({formatCurrency(total, config.currencySymbol)})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 pt-3 pb-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              activeFilter === 'overdue'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Salir a Cobrar Hoy ({overdueList.length})</span>
          </button>

          <button
            onClick={() => setActiveFilter('admin_alert')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              activeFilter === 'admin_alert'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Alerta Dueños 5+ Días ({adminAlertList.length})</span>
          </button>

          <button
            onClick={() => setActiveFilter('vendedor_3dias')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              activeFilter === 'vendedor_3dias'
                ? 'bg-yellow-600 text-white'
                : 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Recordatorios 3 Días ({vendedorReminderList.length})</span>
          </button>

          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ml-auto ${
              activeFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Ver Todas ({overdueList.length + adminAlertList.length + vendedorReminderList.length})
          </button>
        </div>

        {/* List of Boletas */}
        <div className="overflow-y-auto space-y-3 py-3 flex-1 pr-1">
          {displayList.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">¡Al día! No hay boletas en esta categoría.</p>
            </div>
          ) : (
            displayList.map((item) => {
              const isSent = sentBoletaIds[item.boleta.id];
              return (
                <div
                  key={item.boleta.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    item.status.category === 'overdue_today'
                      ? 'border-rose-300 bg-rose-50/50 dark:bg-rose-950/20'
                      : item.status.category === 'admin_alert'
                      ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20'
                      : 'border-yellow-300 bg-yellow-50/40 dark:bg-yellow-950/20'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs bg-white dark:bg-slate-800 px-2 py-0.5 rounded border">
                        #{item.boleta.boletaNumber}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${item.status.badgeColor}`}>
                        {item.status.categoryLabel}
                      </span>
                      <span className="text-xs text-slate-500 font-medium">
                        Venta: {formatDateEs(item.boleta.saleDate)} ({item.status.daysElapsed} días)
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                      {item.boleta.clientName}
                    </h4>

                    <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1 font-medium">
                        <Bike className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Vendedor: <strong>{item.boleta.salespersonName}</strong></span>
                      </span>
                      {item.boleta.clientAddress && (
                        <span>• {item.boleta.clientAddress}</span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-slate-500">
                      {item.status.actionMessage}
                    </p>
                  </div>

                  <div className="sm:text-right flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                    <div>
                      <span className="text-xs text-slate-400 block sm:inline">Monto: </span>
                      <span className="text-lg font-black text-slate-900 dark:text-white">
                        {formatCurrency(item.boleta.amount, config.currencySymbol)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleSendVendedorWhatsApp(item)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-all ${
                        isSent
                          ? 'bg-emerald-800 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      }`}
                      title="Enviar mensaje firmado por ti al vendedor"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{isSent ? 'Enviado ✓' : 'Avisar Vendedor (Soy ' + activeAdmin.name.split(' ')[0] + ')'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Usuario activo en sesión: <strong>{activeAdmin.name}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold rounded-lg"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* MODAL 1: OWNER CONSOLIDATED REPORT PREVIEW & DISPATCH */}
      {showAdminReportModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Reporte Diario para el Dueño / Admin General
                </h3>
              </div>
              <button
                onClick={() => setShowAdminReportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1.5">
                Destinatario: <strong>{generalAdmin.name}</strong> ({generalAdmin.phone})
              </p>
              <textarea
                value={adminReportText}
                onChange={(e) => setAdminReportText(e.target.value)}
                rows={11}
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowAdminReportModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendOwnerReportWhatsApp}
                className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Abrir y Enviar por WhatsApp al Dueño</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SELLER ROUTE DISPATCH */}
      {showSellerRouteModal && sellerRouteData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Bike className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Hoja de Ruta de Cobro - {sellerRouteData.seller.name}
                </h3>
              </div>
              <button
                onClick={() => setShowSellerRouteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-500 mb-1.5">
                Vendedor: <strong>{sellerRouteData.seller.name}</strong> ({sellerRouteData.seller.phone})
              </p>
              <textarea
                value={sellerRouteData.messageText}
                onChange={(e) =>
                  setSellerRouteData({
                    ...sellerRouteData,
                    messageText: e.target.value,
                  })
                }
                rows={10}
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowSellerRouteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendSellerRouteWhatsApp}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Enviar Ruta por WhatsApp a {sellerRouteData.seller.name}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
