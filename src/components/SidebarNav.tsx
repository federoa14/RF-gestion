import React from 'react';
import {
  FileText,
  AlertCircle,
  History,
  Users,
  Bike,
  Bot,
  Megaphone,
  TrendingDown,
  Sparkles,
  Settings,
  Flame,
  HelpCircle,
  X,
  ChevronRight,
  CreditCard,
  CalendarClock,
  Headphones,
  ClipboardCheck,
} from 'lucide-react';
import { DistributorConfig, Boleta } from '../types';
import { calculateAlertStatus, formatCurrency } from '../utils/alerts';
import { getBusinessLabels } from '../utils/businessMode';
import { BrandMark } from './BrandMark';

interface SidebarNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  config: DistributorConfig;
  boletas: Boleta[];
  paidBoletas: Boleta[];
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenCriticalBubble: () => void;
  onOpenQuickGuide: () => void;
  onOpenEditBrand: () => void;
  onOpenContactChannels?: () => void;
  onOpenSubscriptionPay?: () => void;
  isPaidCurrentMonth?: boolean;
  currentDateRef?: string;
}

interface NavGroup {
  title: string;
  items: {
    id: string;
    label: string;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeTone?: 'navy' | 'crimson' | 'emerald';
  }[];
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  setActiveTab,
  config,
  boletas,
  paidBoletas,
  isMobileOpen,
  onCloseMobile,
  onOpenCriticalBubble,
  onOpenQuickGuide,
  onOpenEditBrand,
  onOpenContactChannels,
  onOpenSubscriptionPay,
  isPaidCurrentMonth,
  currentDateRef,
}) => {
  const pendingBoletas = boletas.filter((b) => b.status === 'pending');
  const graceDays = config.overdueGraceDays !== undefined ? config.overdueGraceDays : 5;
  const refDate = currentDateRef || new Date().toISOString().split('T')[0];

  let criticalCount = 0;
  let criticalAmount = 0;
  let todayAgendaCount = 0;
  for (const b of pendingBoletas) {
    const st = calculateAlertStatus(b, config, refDate);
    if (st.daysPastDueDate >= graceDays) {
      criticalCount++;
      criticalAmount += b.amount;
    }
    const agendaTargetDate = b.promisedPaymentDate || b.dueDate;
    if (agendaTargetDate && agendaTargetDate <= refDate) {
      todayAgendaCount++;
    }
  }

  const labels = getBusinessLabels(config);

  const navGroups: NavGroup[] = [
    {
      title: `Cobranzas y ${labels.salePlural}`,
      items: [
        {
          id: 'boletas',
          label: `Panel de ${labels.salePlural}`,
          hint: 'Vista diaria y vencimientos',
          icon: FileText,
          badge: pendingBoletas.length,
          badgeTone: 'navy',
        },
        {
          id: 'agenda',
          label: 'Agenda Rápida',
          hint: 'Hoy, 3 días y 7 días',
          icon: CalendarClock,
          badge: todayAgendaCount > 0 ? todayAgendaCount : undefined,
          badgeTone: todayAgendaCount > 0 ? 'crimson' : 'navy',
        },
        {
          id: 'impagas',
          label: `${labels.salePlural} Impagas`,
          hint: 'Detalle completo y prórrogas',
          icon: AlertCircle,
          badge: criticalCount > 0 ? criticalCount : undefined,
          badgeTone: 'crimson',
        },
        ...(config.businessRubro === 'distribuidora' || !config.businessRubro
          ? [
              {
                id: 'rendicion',
                label: 'Rendición de Reparto',
                hint: 'Hoja de ruta y arqueo de calle',
                icon: ClipboardCheck,
                badge: todayAgendaCount > 0 ? todayAgendaCount : undefined,
                badgeTone: 'navy' as const,
              },
            ]
          : []),
        {
          id: 'historial',
          label: 'Historial de Pagadas',
          hint: 'Archivo últimos 30 días',
          icon: History,
          badge: paidBoletas.length,
          badgeTone: 'emerald',
        },
      ],
    },
    {
      title: 'Clientes y Equipo',
      items: [
        {
          id: 'clientes',
          label: 'Cartera de Clientes',
          hint: 'Deudas, compras y frecuencias',
          icon: Users,
        },
        {
          id: 'vendedores',
          label: labels.requireSalesperson ? 'Preventistas / Vendedores' : 'Vendedores / Caja',
          hint: labels.requireSalesperson ? 'Zonas, rutas y teléfonos' : 'Mostrador y responsables',
          icon: Bike,
        },
      ],
    },
    {
      title: 'Alertas y Seguimiento',
      items: [
        {
          id: 'automatizacion',
          label: 'WhatsApp Automático',
          hint: 'Envío diario programado',
          icon: Bot,
        },
        {
          id: 'avisos',
          label: 'Avisos a Vendedores',
          hint: 'Comunicados y listas',
          icon: Megaphone,
        },
        {
          id: 'auditoria',
          label: 'Auditoría de Mora',
          hint: 'Ranking de demoras',
          icon: TrendingDown,
        },
      ],
    },
    {
      title: 'Empresa y Ajustes',
      items: [
        {
          id: 'promociones',
          label: 'Estudio de Flyers',
          hint: 'Promociones para clientes',
          icon: Sparkles,
        },
        {
          id: 'administradores',
          label: 'Ajustes y Dueños',
          hint: 'Plazos, WhatsApp y retención',
          icon: Settings,
        },
      ],
    },
  ];

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#091428] text-[#E2E8F0] border-r border-[#B6C2D2]/15 select-none">
      {/* Brand Summary Block */}
      <div className="px-4 py-4 border-b border-[#B6C2D2]/15 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            onOpenEditBrand();
            onCloseMobile();
          }}
          className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
          title="Cambiar logo o nombre de la distribuidora"
        >
          <BrandMark
            logoUrl={config.distributorLogoUrl}
            icon={config.distributorIcon}
            name={config.distributorName}
            size="md"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate group-hover:text-[#CBD5E1] transition-colors">
              {config.distributorName}
            </p>
            <p className="text-[11px] font-mono text-[#94A3B8] truncate">
              {labels.shortLabel} · {config.tenantCode || 'ACTIVA'} · {config.defaultTermDays}d
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#13264A]"
          aria-label="Cerrar navegación"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
        {navGroups.map((group) => (
          <div key={group.title} className="space-y-1">
            <div className="px-2.5 pb-1 text-[11px] font-semibold text-[#8D9CB0] tracking-wide">
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer group ${
                    isActive
                      ? 'bg-[#162E59] text-white border border-[#B6C2D2]/30 shadow-xs'
                      : 'text-[#CBD5E1] hover:bg-[#10203E] hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-white' : 'text-[#8D9CB0] group-hover:text-[#CBD5E1]'
                      }`}
                    />
                    <div className="min-w-0">
                      <span className="block text-[13px] font-semibold leading-tight truncate">
                        {item.label}
                      </span>
                      <span
                        className={`block text-[11px] truncate ${
                          isActive ? 'text-[#CBD5E1]' : 'text-[#7A8BA3]'
                        }`}
                      >
                        {item.hint}
                      </span>
                    </div>
                  </div>

                  {item.badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-bold shrink-0 ${
                        item.badgeTone === 'crimson'
                          ? 'bg-[#991B1B] text-white'
                          : item.badgeTone === 'emerald'
                          ? 'bg-[#065F46]/60 text-[#A7F3D0]'
                          : isActive
                          ? 'bg-[#E2E8F0] text-[#091428]'
                          : 'bg-[#13264A] text-[#CBD5E1]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Action & Guidance Zone */}
      <div className="p-3 border-t border-[#B6C2D2]/15 space-y-2 bg-[#071021]/70">
        {criticalCount > 0 && (
          <button
            type="button"
            onClick={() => {
              onOpenCriticalBubble();
              onCloseMobile();
            }}
            className="w-full px-3 py-2.5 rounded-lg bg-[#991B1B]/90 hover:bg-[#B91C1C] text-white border border-[#FCA5A5]/25 text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-300" />
                <span>Fiado Vencido (+{graceDays}d)</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 opacity-80" />
            </div>
            <div className="text-[11px] font-mono tabular-nums text-rose-100 mt-0.5">
              {formatCurrency(criticalAmount, config.currencySymbol)} · {criticalCount} boleta(s)
            </div>
          </button>
        )}

        {onOpenSubscriptionPay && (
          <button
            type="button"
            onClick={() => {
              onOpenSubscriptionPay();
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              isPaidCurrentMonth
                ? 'bg-[#0F2142] hover:bg-[#162E59] text-[#CBD5E1] border-[#B6C2D2]/20'
                : 'bg-[#132C56] hover:bg-[#1B3A70] text-white border-[#CBD5E1]/35'
            }`}
          >
            <span className="flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-[#CBD5E1]" />
              <span>{isPaidCurrentMonth ? 'Abono Mensual: Al Día' : 'Pagar Abono Mensual'}</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[#8D9CB0]" />
          </button>
        )}

        {onOpenContactChannels && (
          <button
            type="button"
            onClick={() => {
              onOpenContactChannels();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#0F2142] hover:bg-[#162E59] text-[#E2E8F0] hover:text-white border border-sky-400/25 text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Headphones className="w-3.5 h-3.5 text-sky-400" />
              <span>Canales de Contacto</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-[#8D9CB0]" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onOpenQuickGuide();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#0F2142]/70 hover:bg-[#162E59] text-[#CBD5E1] hover:text-white border border-[#B6C2D2]/15 text-xs font-medium transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <HelpCircle className="w-3.5 h-3.5 text-[#94A3B8]" />
            <span>¿Dónde ingreso? (Guía)</span>
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-[#8D9CB0]" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Slide-over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#050C18]/75 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[82vw] h-full shadow-2xl z-10">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
