import React, { useState } from 'react';
import {
  Megaphone,
  Send,
  MessageCircle,
  Sparkles,
  CheckCircle,
  Tag,
  Users,
  AlertCircle,
  Clock,
  Flame,
} from 'lucide-react';
import { BroadcastMessage, Salesperson, Administrator, DistributorConfig } from '../types';
import { createWhatsAppUrl, generateBroadcastWhatsAppMessage } from '../utils/whatsapp';

interface BroadcastManagerProps {
  salespeople: Salesperson[];
  activeAdmin: Administrator;
  config: DistributorConfig;
  broadcasts: BroadcastMessage[];
  onSaveBroadcast: (broadcast: BroadcastMessage) => void;
}

export const BroadcastManager: React.FC<BroadcastManagerProps> = ({
  salespeople,
  activeAdmin,
  config,
  broadcasts,
  onSaveBroadcast,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<BroadcastMessage['type']>('promo');
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>(['all']);
  const [sentStatus, setSentStatus] = useState<Record<string, boolean>>({});

  const promoTemplates = [
    {
      title: '🔥 Promo Lanzamiento: Pack Bebidas 15% OFF',
      content:
        'Lanzamos promo especial válida por 48hs: Pack de gaseosas y aguas saborizadas con 15% de descuento por pago contado o boleta fiada a 5 días máximo. Ofrecer a almacenes de sus recorridos.',
      type: 'promo' as const,
    },
    {
      title: '📦 Nuevos Productos Disponibles en Depósito',
      content:
        'Ingresaron nuevas líneas de alimentos secos, harinas y comestibles de alta rotación. Tienen lista de precios actualizada en administración para pasar presupuestos hoy.',
      type: 'aviso_general' as const,
    },
    {
      title: '⏰ Horario Especial de Recepción de Cobranzas',
      content:
        'Les recordamos que hoy la caja de administración estará abierta hasta las 18:30hs para rendir boletas cobradas en la calle. Por favor ingresar los comprobantes firmados.',
      type: 'aviso_general' as const,
    },
    {
      title: '🚨 Prioridad de Cobro: Boletas de más de 7 días',
      content:
        'Equipo: favor de concentrar las visitas de hoy en los clientes con boletas que superaron los 7 días de plazo. Necesitamos cerrar las cuentas corrientes pendientes.',
      type: 'urgente' as const,
    },
  ];

  const handleApplyTemplate = (tpl: (typeof promoTemplates)[0]) => {
    setTitle(tpl.title);
    setContent(tpl.content);
    setType(tpl.type);
  };

  const handleToggleSeller = (id: string) => {
    if (id === 'all') {
      setSelectedSellerIds(['all']);
      return;
    }

    const withoutAll = selectedSellerIds.filter((x) => x !== 'all');
    if (withoutAll.includes(id)) {
      const remaining = withoutAll.filter((x) => x !== id);
      setSelectedSellerIds(remaining.length === 0 ? ['all'] : remaining);
    } else {
      setSelectedSellerIds([...withoutAll, id]);
    }
  };

  const targetSellers = selectedSellerIds.includes('all')
    ? salespeople
    : salespeople.filter((s) => selectedSellerIds.includes(s.id));

  const handleSendToSeller = (seller: Salesperson) => {
    const msg = generateBroadcastWhatsAppMessage(
      title || 'Aviso de Distribuidora',
      content,
      seller.name,
      activeAdmin.name,
      config
    );
    const url = createWhatsAppUrl(seller.phone, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
    setSentStatus((prev) => ({ ...prev, [seller.id]: true }));
  };

  const handleSaveAndBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const newBroadcast: BroadcastMessage = {
      id: `bc-${Date.now()}`,
      title: title.trim(),
      content: content.trim(),
      type,
      targetSalespersonIds: selectedSellerIds,
      sentAt: new Date().toISOString(),
    };

    onSaveBroadcast(newBroadcast);

    // Open WhatsApp for the first target seller as immediate action
    if (targetSellers.length > 0) {
      handleSendToSeller(targetSellers[0]);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Canal de Avisos & Promos para Vendedores
            </h2>
            <p className="text-xs text-slate-500">
              Redacta comunicados, promociones comerciales o avisos y envíalos instantáneamente al WhatsApp de tu equipo
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Composer & Recipients */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Message Composer */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <span>Redactar Mensaje de Difusión</span>
            </h3>
            <span className="text-xs text-slate-400">
              Remitente: <strong className="text-slate-700 dark:text-slate-200">{activeAdmin.name}</strong>
            </span>
          </div>

          {/* Quick Templates Bar */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              Plantillas rápidas para lanzar al instante:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {promoTemplates.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="text-[11px] font-medium p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-slate-700 dark:text-slate-300 transition-colors border border-transparent hover:border-purple-300"
                >
                  {tpl.title.slice(0, 36)}...
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSaveAndBroadcast} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Título o Asunto del Comunicado / Promo:
              </label>
              <input
                type="text"
                placeholder="Ej. 🔥 Promo Pack Bebidas: 15% OFF hasta el viernes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-semibold"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Categoría del Mensaje:
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
                >
                  <option value="promo">🎉 Promoción Comercial / Oferta</option>
                  <option value="aviso_general">📢 Aviso General / Novedad</option>
                  <option value="novedad_precios">💲 Actualización de Precios</option>
                  <option value="urgente">🚨 Aviso Urgente / Cobranza</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Destinatarios:
                </label>
                <div className="text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span>{targetSellers.length} vendedor(es) seleccionados</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    {selectedSellerIds.includes('all') ? 'Todos' : 'Personalizado'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Contenido del Aviso para enviar por WhatsApp:
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Escribe aquí los detalles de la promo, productos en oferta, descuentos por pronto pago o aviso operativo..."
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                required
              />
            </div>

            {/* Live Message Preview */}
            {title && content && (
              <div className="p-3.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/50 space-y-1 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 block">
                  Vista Previa del Mensaje de WhatsApp:
                </span>
                <p className="font-mono text-slate-800 dark:text-slate-200 whitespace-pre-line text-[11px] leading-relaxed">
                  {generateBroadcastWhatsAppMessage(
                    title,
                    content,
                    '[Nombre Vendedor]',
                    activeAdmin.name,
                    config
                  )}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400">
                Se guardará en el historial y preparará el envío
              </span>
              <button
                type="submit"
                disabled={!title.trim() || !content.trim()}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-900/20 flex items-center gap-2 transition-transform active:scale-98"
              >
                <Send className="w-4 h-4" />
                <span>Guardar y Enviar Aviso por WhatsApp</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right: Target Salespeople list with 1-click WhatsApp buttons */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" />
                <span>Seleccionar Vendedores:</span>
              </h4>
              <button
                onClick={() => setSelectedSellerIds(['all'])}
                className="text-[11px] font-semibold text-purple-600 hover:underline"
              >
                Marcar Todos
              </button>
            </div>

            <div className="space-y-2">
              {salespeople.map((seller) => {
                const isChecked =
                  selectedSellerIds.includes('all') || selectedSellerIds.includes(seller.id);
                const isSent = sentStatus[seller.id];

                return (
                  <div
                    key={seller.id}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-2"
                  >
                    <label className="flex items-center gap-2 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSeller(seller.id)}
                        className="rounded text-purple-600"
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-900 dark:text-white block truncate">
                          {seller.name}
                        </span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {seller.phone || 'Sin WhatsApp'}
                        </span>
                      </div>
                    </label>

                    <button
                      type="button"
                      onClick={() => handleSendToSeller(seller)}
                      disabled={!title.trim() || !content.trim()}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        isSent
                          ? 'bg-emerald-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white shadow-2xs'
                      }`}
                      title="Enviar este aviso por WhatsApp"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>{isSent ? 'Enviado ✓' : 'Enviar'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Broadcast History */}
      {broadcasts.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">
            Historial de Avisos y Promociones Enviadas ({broadcasts.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {broadcasts.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 px-2 py-0.5 rounded border border-purple-200">
                    {b.type === 'promo' ? '🎉 Promo' : b.type === 'urgente' ? '🚨 Urgente' : '📢 Aviso'}
                  </span>
                  <span className="text-[11px] text-slate-400">{b.sentAt?.slice(0, 10)}</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">{b.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 whitespace-pre-line font-mono">
                  {b.content}
                </p>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <button
                    onClick={() => {
                      setTitle(b.title);
                      setContent(b.content);
                      setType(b.type);
                    }}
                    className="text-xs font-semibold text-purple-600 hover:underline"
                  >
                    Reutilizar este aviso
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
