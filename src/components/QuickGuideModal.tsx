import React from 'react';
import {
  X,
  PlusCircle,
  AlertCircle,
  Clock,
  MessageCircle,
  Users,
  Bot,
  Settings,
  CreditCard,
  ArrowRight,
  Compass,
} from 'lucide-react';

interface QuickGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onOpenNewBoleta: () => void;
  onOpenCriticalBubble: () => void;
  onOpenSubscriptionPay?: () => void;
}

export const QuickGuideModal: React.FC<QuickGuideModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenNewBoleta,
  onOpenCriticalBubble,
  onOpenSubscriptionPay,
}) => {
  if (!isOpen) return null;

  const actions = [
    {
      title: 'Cargar una nueva boleta fiada',
      description:
        'Registrá el comercio, vendedor asignado, monto y días de vencimiento (o vencimiento próximo miércoles).',
      buttonLabel: 'Cargar Boleta Ahora',
      icon: PlusCircle,
      onClick: () => {
        onClose();
        onOpenNewBoleta();
      },
    },
    {
      title: 'Ver todas las boletas impagas y dar prórrogas',
      description:
        'Consultá el detalle completo por cliente, cuándo se emitió, cuándo venció y sumale días de prórroga si acordaron esperar.',
      buttonLabel: 'Ir a Boletas Impagas',
      icon: AlertCircle,
      onClick: () => {
        onClose();
        onNavigate('impagas');
      },
    },
    {
      title: 'Revisar el fiado vencido en rojo (+5 días)',
      description:
        'Abrí la burbuja prioritaria con todo el dinero vencido en la calle que ya debería haberse cobrado.',
      buttonLabel: 'Abrir Burbuja de Vencidos',
      icon: Clock,
      onClick: () => {
        onClose();
        onOpenCriticalBubble();
      },
    },
    {
      title: 'Activar o desactivar WhatsApp a clientes',
      description:
        'Prendé o apagá el botón de recordatorios por WhatsApp a clientes y personalizá los plazos y mensajes de tu empresa.',
      buttonLabel: 'Ir a Ajustes y Dueños',
      icon: Settings,
      onClick: () => {
        onClose();
        onNavigate('administradores');
      },
    },
    {
      title: 'Configurar envío automático sin clics',
      description:
        'Programá la hora de envío diario para que vendedores y dueños reciban su hoja de cobranzas automáticamente.',
      buttonLabel: 'Ir a WhatsApp Automático',
      icon: Bot,
      onClick: () => {
        onClose();
        onNavigate('automatizacion');
      },
    },
    {
      title: 'Administrar clientes y vendedores',
      description:
        'Cargá nuevos comercios con su vendedor a cargo, revisá quién es cliente problemático o editá teléfonos.',
      buttonLabel: 'Ir a Clientes y Deudas',
      icon: Users,
      onClick: () => {
        onClose();
        onNavigate('clientes');
      },
    },
    {
      title: 'Enviar avisos o promociones a vendedores',
      description:
        'Redactá comunicados rápidos de listas de precios o avisos internos para mandarlos por WhatsApp.',
      buttonLabel: 'Ir a Avisos a Vendedores',
      icon: MessageCircle,
      onClick: () => {
        onClose();
        onNavigate('avisos');
      },
    },
    ...(onOpenSubscriptionPay
      ? [
          {
            title: 'Pagar el abono mensual con Mercado Pago o Alias',
            description:
              'Copiá el alias, pagá directo por Mercado Pago o subí la imagen del comprobante para acreditarlo al instante.',
            buttonLabel: 'Ir a Pagar Abono',
            icon: CreditCard,
            onClick: () => {
              onClose();
              onOpenSubscriptionPay();
            },
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 my-auto">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-[#B6C2D2]/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0F284E] text-[#E2E8F0] flex items-center justify-center border border-[#B6C2D2]/30">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Guía Rápida: ¿Dónde hacer cada gestión?
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
                Elegí lo que necesitás hacer hoy y el sistema te lleva directo a la pantalla indicada.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#13264A] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={item.onClick}
                className="text-left p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#0F2142] hover:bg-[#EFF3F8] dark:hover:bg-[#162E59] border border-slate-200 dark:border-[#B6C2D2]/15 transition-colors flex flex-col justify-between gap-3 cursor-pointer group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#0B1933] dark:text-white">
                    <Icon className="w-4 h-4 text-[#1E3A6D] dark:text-[#CBD5E1] shrink-0" />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-[#94A3B8] leading-relaxed">
                    {item.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#13264A] dark:text-[#E2E8F0] group-hover:underline">
                  <span>{item.buttonLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
