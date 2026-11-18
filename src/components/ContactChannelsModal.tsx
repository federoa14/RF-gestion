import React, { useEffect, useState } from 'react';
import {
  X,
  MessageCircle,
  Mail,
  Copy,
  Check,
  Clock,
  Headphones,
  ExternalLink,
  Send,
} from 'lucide-react';
import { PlatformSupportConfig, PlatformUser, Tenant } from '../types';
import {
  fetchPlatformSupportConfigFromServer,
  loadPlatformSupportConfig,
} from '../utils/multiTenantStorage';

interface ContactChannelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant?: Tenant | null;
  currentUser?: PlatformUser | null;
}

const QUICK_TOPICS = [
  'Duda operativa',
  'Asistencia técnica',
  'Configuración de rubro',
  'Pagos y suscripción',
];

export const ContactChannelsModal: React.FC<ContactChannelsModalProps> = ({
  isOpen,
  onClose,
  tenant,
  currentUser,
}) => {
  const [supportConfig, setSupportConfig] = useState<PlatformSupportConfig>(
    loadPlatformSupportConfig
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string>('Duda operativa');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [copiedField, setCopiedField] = useState<'phone' | 'email' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsLoading(true);
    fetchPlatformSupportConfigFromServer()
      .then((cfg) => {
        if (active) setSupportConfig(cfg);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const cleanPhoneDigits = (supportConfig.whatsappPhone || '').replace(/\D/g, '');
  const cleanEmail = (supportConfig.email || '').trim();

  const buildContextPrefix = () => {
    const parts: string[] = [];
    if (tenant?.name) {
      parts.push(`Empresa: ${tenant.name}${tenant.tenantCode ? ` (${tenant.tenantCode})` : ''}`);
    }
    if (currentUser?.fullName || currentUser?.username) {
      parts.push(`Usuario: ${currentUser.fullName || currentUser.username}`);
    }
    return parts.join(' · ');
  };

  const composeInquiryBody = () => {
    const context = buildContextPrefix();
    const detail = customMessage.trim()
      ? customMessage.trim()
      : 'Quisiera realizar una consulta sobre el sistema de gestión.';
    return [
      `Hola${supportConfig.contactName ? ` ${supportConfig.contactName.split('·')[0].trim()}` : ''}!`,
      `Motivo: ${selectedTopic}`,
      context ? context : null,
      '',
      detail,
    ]
      .filter((line) => line !== null)
      .join('\n');
  };

  const whatsappHref = cleanPhoneDigits
    ? `https://wa.me/${cleanPhoneDigits}?text=${encodeURIComponent(composeInquiryBody())}`
    : '';

  const mailSubject = `${selectedTopic}${tenant?.name ? ` · ${tenant.name}` : ''} - Sistema de Gestión`;
  const mailtoHref = cleanEmail
    ? `mailto:${cleanEmail}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(
        composeInquiryBody()
      )}`
    : '';

  const handleCopy = (value: string, field: 'phone' | 'email') => {
    if (!value || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#0B1933] border border-[#B6C2D2]/25 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 my-auto text-[#E2E8F0]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#B6C2D2]/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#13264A] text-[#E2E8F0] border border-[#B6C2D2]/25 flex items-center justify-center shrink-0">
              <Headphones className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Canales de Contacto
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Asistencia técnica directa y atención al usuario
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#13264A] transition-colors cursor-pointer"
            aria-label="Cerrar canales de contacto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Support Meta & Welcome Message */}
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[#CBD5E1]">
            <span className="font-semibold text-white">
              {supportConfig.contactName || 'Soporte Técnico'}
            </span>
            {supportConfig.attentionHours && (
              <>
                <span className="text-[#64748B]" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 text-[#94A3B8]">
                  <Clock className="w-3.5 h-3.5 text-[#94A3B8]" />
                  <span>{supportConfig.attentionHours}</span>
                </span>
              </>
            )}
          </div>
          {supportConfig.welcomeMessage && (
            <p className="text-[#94A3B8] leading-relaxed">
              {supportConfig.welcomeMessage}
            </p>
          )}
        </div>

        {/* Topic & Quick Message Composer */}
        <div className="space-y-2.5 pt-1 border-t border-[#B6C2D2]/15">
          <label className="block text-xs font-semibold text-[#CBD5E1]">
            Motivo de tu consulta
          </label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TOPICS.map((topic) => {
              const active = selectedTopic === topic;
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setSelectedTopic(topic)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#E2E8F0] text-[#091428] font-semibold'
                      : 'bg-[#13264A] text-[#CBD5E1] hover:bg-[#1B3566] hover:text-white border border-[#B6C2D2]/20'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#94A3B8] mb-1">
              Detalle opcional (se adjuntará automáticamente al abrir WhatsApp o Mail)
            </label>
            <textarea
              rows={2}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Contanos brevemente tu duda o inconveniente..."
              className="w-full px-3.5 py-2 bg-[#071021] border border-[#B6C2D2]/25 rounded-xl text-xs text-white placeholder-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-sky-500/60 resize-none"
            />
          </div>
        </div>

        {/* Direct Contact Channels List */}
        {isLoading ? (
          <div className="py-4 text-center text-xs text-[#94A3B8]">
            Actualizando canales de contacto...
          </div>
        ) : (
          <div className="divide-y divide-[#B6C2D2]/15 border-t border-b border-[#B6C2D2]/15">
            {/* Channel 1: WhatsApp */}
            <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-white">
                    WhatsApp Directo
                  </span>
                  {cleanPhoneDigits ? (
                    <span className="block text-xs font-mono tabular-nums text-emerald-300 truncate">
                      {supportConfig.whatsappPhone}
                    </span>
                  ) : (
                    <span className="block text-xs text-[#94A3B8]">
                      Número aún no cargado por administración
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {cleanPhoneDigits && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopy(supportConfig.whatsappPhone, 'phone')}
                      className="px-3 py-2 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#CBD5E1] hover:text-white border border-[#B6C2D2]/20 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      title="Copiar teléfono"
                    >
                      {copiedField === 'phone' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Escribir por WhatsApp</span>
                      <ExternalLink className="w-3 h-3 opacity-80" />
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Channel 2: Email */}
            <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-500/30 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-white">
                    Correo Electrónico (Mail)
                  </span>
                  {cleanEmail ? (
                    <span className="block text-xs font-mono text-sky-300 truncate">
                      {cleanEmail}
                    </span>
                  ) : (
                    <span className="block text-xs text-[#94A3B8]">
                      Mail aún no cargado por administración
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {cleanEmail && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopy(cleanEmail, 'email')}
                      className="px-3 py-2 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#CBD5E1] hover:text-white border border-[#B6C2D2]/20 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                      title="Copiar correo electrónico"
                    >
                      {copiedField === 'email' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                    <a
                      href={mailtoHref}
                      className="px-4 py-2 rounded-lg bg-[#E2E8F0] hover:bg-white text-[#091428] text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Enviar Mail</span>
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] text-[#94A3B8]">
          <span>
            {tenant?.name ? `Sesión: ${tenant.name}` : 'Soporte directo del sistema'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#13264A] hover:bg-[#1B3566] text-[#E2E8F0] text-xs font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
