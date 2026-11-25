import React, { useState } from 'react';
import {
  ChevronDown,
  UserCircle2,
  Clock,
  AlertTriangle,
  Flame,
  PlusCircle,
  Bell,
  Menu,
  KeyRound,
  CreditCard,
  LogOut,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { Boleta, DistributorConfig, Administrator, PlatformUser, Tenant } from '../types';
import { calculateAlertStatus, formatCurrency } from '../utils/alerts';
import { getTenantSubscriptionStatus } from '../utils/tenantSubscription';
import { getBusinessLabels } from '../utils/businessMode';
import { BrandMark } from './BrandMark';
import { getAlertThresholds } from '../utils/alertThresholds';

interface HeaderProps {
  config: DistributorConfig;
  boletas: Boleta[];
  paidBoletas: Boleta[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenNewBoleta: () => void;
  onOpenAlertsCenter: () => void;
  onOpenSettings: () => void;
  onOpenCriticalBubble?: () => void;
  onOpenMobileMenu?: () => void;
  onOpenQuickGuide?: () => void;
  onOpenEditBrand?: () => void;
  activeAdmin?: Administrator;
  currentUser?: PlatformUser | null;
  currentTenant?: Tenant | null;
  onLogout?: () => void;
  onOpenUserProfile?: () => void;
  onOpenSubscriptionPayModal?: () => void;
}

const TAB_META: Record<string, { section: string; title: string; subtitle: string }> = {
  boletas: {
    section: 'Cobranzas',
    title: 'Panel de Boletas',
    subtitle: 'Control diario de boletas fiadas, vencimientos y pagos',
  },
  impagas: {
    section: 'Cobranzas',
    title: 'Boletas Impagas',
    subtitle: 'Detalle completo por cliente, vencimientos y prórrogas rápidas',
  },
  rendicion: {
    section: 'Cobranzas Mayoristas',
    title: 'Rendición de Reparto',
    subtitle: 'Hoja de cobro por preventista, control de caja física y cierre diario',
  },
  historial: {
    section: 'Cobranzas',
    title: 'Historial de Pagadas',
    subtitle: 'Boletas cobradas archivadas con retención de 30 días',
  },
  clientes: {
    section: 'Directorio',
    title: 'Clientes y Deudas',
    subtitle: 'Comercios registrados, vendedor asignado e historial de cumplimiento',
  },
  vendedores: {
    section: 'Equipo',
    title: 'Vendedores',
    subtitle: 'Zonas de reparto, teléfonos y cobranzas asignadas',
  },
  automatizacion: {
    section: 'Alertas',
    title: 'WhatsApp Automático',
    subtitle: 'Programación de envío matutino sin intervención manual',
  },
  avisos: {
    section: 'Alertas',
    title: 'Avisos a Vendedores',
    subtitle: 'Comunicados internos y listas rápidas por WhatsApp',
  },
  auditoria: {
    section: 'Seguimiento',
    title: 'Auditoría de Mora',
    subtitle: 'Ranking de demoras, pagos parciales y puntualidad',
  },
  promociones: {
    section: 'Difusión',
    title: 'Estudio de Flyers',
    subtitle: 'Piezas visuales promocionales para clientes y vendedores',
  },
  catalogo: {
    section: 'Tienda Web',
    title: 'Catálogo Online',
    subtitle: 'Publicá fotos, precios y descripciones para recibir pedidos por WhatsApp y retirar',
  },
  ventas_web: {
    section: 'Tienda Web',
    title: 'Historial Ventas Web',
    subtitle: 'Ingresos generados por el carrito online filtrados por día, semana, mes o historial completo',
  },
  administradores: {
    section: 'Configuración',
    title: 'Ajustes y Dueños',
    subtitle: 'Plazos, recordatorios por WhatsApp a clientes, usuarios y retención',
  },
};

export const Header: React.FC<HeaderProps> = ({
  config,
  boletas,
  paidBoletas,
  activeTab,
  onOpenNewBoleta,
  onOpenAlertsCenter,
  onOpenCriticalBubble,
  onOpenMobileMenu,
  onOpenQuickGuide,
  onOpenEditBrand,
  activeAdmin,
  currentUser,
  currentTenant,
  onLogout,
  onOpenUserProfile,
  onOpenSubscriptionPayModal,
}) => {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const pendingBoletas = boletas.filter((b) => b.status === 'pending');
  const alertThresholds = getAlertThresholds(config);
  const graceDays = alertThresholds.overdueGraceDays;

  const alertStats = pendingBoletas.reduce(
    (acc, b) => {
      const status = calculateAlertStatus(b, config);
      const partialTotal = (b.partialPayments || []).reduce((s, p) => s + (p.amount || 0), 0);
      const balance = Math.max(0, b.amount - partialTotal);
      acc.totalAmount += balance;
      if (status.daysPastDueDate >= graceDays) {
        acc.criticalOverdue++;
        acc.criticalOverdueAmount += balance;
      }
      if (status.category === 'overdue_today' || status.category === 'critical_overdue_grace') {
        acc.overdue++;
      } else if (status.category === 'admin_6d' || status.category === 'admin_alert') {
        acc.adminAlert++;
      } else if (status.category === 'vendedor_2d' || status.category === 'vendedor_reminder') {
        acc.vendedorReminder++;
      } else {
        acc.normal++;
      }
      return acc;
    },
    {
      overdue: 0,
      adminAlert: 0,
      vendedorReminder: 0,
      normal: 0,
      totalAmount: 0,
      criticalOverdue: 0,
      criticalOverdueAmount: 0,
    }
  );

  const urgentAlertsCount = alertStats.overdue + alertStats.adminAlert;
  const tabInfo = TAB_META[activeTab] || TAB_META.boletas;
  const subEval = currentTenant ? getTenantSubscriptionStatus(currentTenant) : null;
  const showAbonoPending = Boolean(onOpenSubscriptionPayModal && subEval && !subEval.isPaidForCurrentMonth);
  const labels = getBusinessLabels(config);

  return (
    <header className="bg-[#0B1933] text-[#F1F5F9] border-b border-[#B6C2D2]/20 sticky top-0 z-30">
      {/* Main Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left Zone: Mobile Menu + Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0 flex-1 basis-56">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] border border-[#B6C2D2]/25 transition-colors cursor-pointer"
              aria-label="Abrir menú lateral"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* Mobile Brand Mark */}
          <button
            type="button"
            onClick={onOpenEditBrand}
            className="lg:hidden shrink-0 cursor-pointer"
            title="Editar logo o nombre de la distribuidora"
          >
            <BrandMark
              logoUrl={config.distributorLogoUrl}
              icon={config.distributorIcon}
              name={config.distributorName}
              size="sm"
            />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="hidden sm:inline text-xs font-medium text-[#8D9CB0]">
                {tabInfo.section} /
              </span>
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white break-words">
                {tabInfo.title}
              </h1>
              {activeAdmin && (
                <span className="hidden md:inline-block whitespace-nowrap text-[11px] font-medium text-[#CBD5E1] bg-[#13264A] border border-[#B6C2D2]/20 px-2 py-0.5 rounded-md">
                  Operador: {activeAdmin.name.split(' ')[0]}
                </span>
              )}
            </div>
            <p className="hidden sm:block text-xs leading-snug text-[#94A3B8]">
              {tabInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right Zone: Primary CTAs & Account Controls */}
        <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">

          <button
            type="button"
            onClick={onOpenAlertsCenter}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              urgentAlertsCount > 0
                ? 'bg-[#991B1B] hover:bg-[#B91C1C] text-white border-[#FCA5A5]/35'
                : 'bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] border-[#B6C2D2]/25'
            }`}
            title="Ver resumen diario de cobranzas y alertas"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cobranzas del Día</span>
            {urgentAlertsCount > 0 && (
              <span className="bg-white text-[#991B1B] text-[11px] font-mono tabular-nums font-bold px-1.5 py-0.2 rounded">
                {urgentAlertsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNewBoleta}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#E2E8F0] hover:bg-white text-[#091428] rounded-lg text-xs font-bold border border-white/60 transition-colors cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#0B1933]" />
            <span className="sm:hidden">Cargar</span>
            <span className="hidden sm:inline">Cargar {labels.saleSingular.toLowerCase()}</span>
          </button>

          {(currentUser || onOpenQuickGuide) && (
            <div className="relative border-l border-[#B6C2D2]/20 pl-2">
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                title="Mi cuenta"
                className="relative inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] border border-[#B6C2D2]/25 text-xs font-semibold transition-colors cursor-pointer"
              >
                <UserCircle2 className="w-4 h-4" />
                <span className="hidden md:inline">Mi cuenta</span>
                <ChevronDown className="w-3.5 h-3.5 hidden md:inline" />
                {showAbonoPending && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-[#0B1933]" aria-label="Abono pendiente" />
                )}
              </button>
              {isAccountMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setIsAccountMenuOpen(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1.5 z-50 w-60 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xl"
                  >
                    {currentUser && (
                      <div className="px-3 py-2 border-b border-slate-100">
                        <div className="text-xs font-bold truncate">{currentUser.fullName || currentUser.username}</div>
                        <div className="text-[11px] text-slate-500 truncate">Rubro: {labels.shortLabel}</div>
                      </div>
                    )}
                    {showAbonoPending && (
                      <button type="button" role="menuitem" onClick={() => { setIsAccountMenuOpen(false); onOpenSubscriptionPayModal?.(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 cursor-pointer">
                        <CreditCard className="w-4 h-4" />
                        Pagar el abono del mes
                      </button>
                    )}
                    {onOpenUserProfile && (
                      <button type="button" role="menuitem" onClick={() => { setIsAccountMenuOpen(false); onOpenUserProfile(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 cursor-pointer">
                        <KeyRound className="w-4 h-4 text-slate-500" />
                        Mi perfil, contraseña y rubro
                      </button>
                    )}
                    {onOpenQuickGuide && (
                      <button type="button" role="menuitem" onClick={() => { setIsAccountMenuOpen(false); onOpenQuickGuide(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-slate-50 cursor-pointer">
                        <HelpCircle className="w-4 h-4 text-slate-500" />
                        ¿Dónde hago cada cosa?
                      </button>
                    )}
                    {onLogout && (
                      <button type="button" role="menuitem" onClick={() => { setIsAccountMenuOpen(false); onLogout(); }} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 border-t border-slate-100 mt-1 cursor-pointer">
                        <LogOut className="w-4 h-4" />
                        Cerrar sesión
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Compact Silver-Lined Status Ticker Strip */}
      <div className="bg-[#081224] border-t border-[#B6C2D2]/15 px-4 sm:px-6 lg:px-8 py-2 text-xs">
        {/* En celular: una sola línea que se desliza, para no ocupar media pantalla */}
        <div className="max-w-7xl mx-auto flex md:flex-wrap items-center justify-between gap-3 text-[#CBD5E1] overflow-x-auto no-scrollbar whitespace-nowrap">
          <div className="flex items-center gap-4 sm:gap-5 md:flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[#8D9CB0]">En la calle:</span>
              <span className="font-mono tabular-nums font-bold text-white text-sm">
                {formatCurrency(alertStats.totalAmount, config.currencySymbol)}
              </span>
              <span className="text-[#8D9CB0] tabular-nums">({pendingBoletas.length} pendientes)</span>
            </div>

            <div className="h-3.5 w-px bg-[#B6C2D2]/20 hidden sm:block" />

            <div className="flex items-center gap-1.5 text-rose-300 tabular-nums">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span className="font-semibold">{alertStats.overdue} para cobrar hoy</span>
            </div>

            <div className="flex items-center gap-1.5 text-amber-300 tabular-nums">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium" title={`Boletas con ${alertThresholds.adminAlertDays} o más días desde la venta`}>{alertStats.adminAlert} aviso a dueños</span>
            </div>

            <div className="hidden md:flex items-center gap-1.5 text-[#94A3B8] tabular-nums">
              <Clock className="w-3.5 h-3.5 text-[#CBD5E1]" />
              <span title={`Boletas con ${alertThresholds.vendedorReminderDays} o más días desde la venta`}>{alertStats.vendedorReminder} recordatorios</span>
            </div>

            {alertStats.criticalOverdue > 0 && onOpenCriticalBubble && (
              <button
                type="button"
                onClick={onOpenCriticalBubble}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#991B1B] hover:bg-[#B91C1C] text-white font-bold text-[11px] border border-[#FCA5A5]/30 transition-colors cursor-pointer font-mono tabular-nums"
                title="Abrir el detalle con los vencimientos críticos"
              >
                <Flame className="w-3 h-3 text-amber-300" />
                <span>
                  Vencido ({graceDays}+ días de mora): {formatCurrency(alertStats.criticalOverdueAmount, config.currencySymbol)}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-emerald-300 font-medium tabular-nums">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{paidBoletas.length} cobradas (últimos 30d)</span>
          </div>
        </div>
      </div>
    </header>
  );
};
