import React, { useState } from 'react';
import {
  Bot,
  Play,
  CheckCircle2,
  Clock,
  Send,
  MessageCircle,
  Mail,
  RotateCcw,
  AlertTriangle,
  Flame,
  Check,
  Server,
  Radio,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  UserCheck,
  ShieldAlert,
  Zap,
  Settings,
  ShieldCheck,
  BellRing,
} from 'lucide-react';
import {
  Boleta,
  Client,
  Salesperson,
  Administrator,
  DistributorConfig,
  AutoDispatchLog,
} from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';
import { getAlertThresholds } from '../utils/alertThresholds';
import {
  createWhatsAppUrl,
  createMailtoUrl,
  generateDailyClosingOwnerSummary,
} from '../utils/whatsapp';
import {
  executeDailyAlertsDirect,
  executeDailyClosingDirect,
} from '../utils/clientDispatchEngine';

interface AutomatedDispatchManagerProps {
  boletas: Boleta[];
  paidBoletas?: Boleta[];
  clients?: Client[];
  salespeople: Salesperson[];
  admins: Administrator[];
  config: DistributorConfig;
  logs: AutoDispatchLog[];
  onSaveConfig: (updated: DistributorConfig) => void;
  onAddLogs: (newLogs: AutoDispatchLog[]) => void;
  onClearLogs: () => void;
}


// Los registros viejos usan '2d' / '6d' / '10d' / '15d'; se traducen a los hitos actuales.
const LEGACY_MILESTONES: Record<string, string> = {
  '2d': 'vendor_reminder',
  '6d': 'owner_alert',
  '10d': 'alert_mode',
  '15d': 'critical_sale',
};
function normalizeMilestone(milestone?: string): string | undefined {
  return milestone ? LEGACY_MILESTONES[milestone] || milestone : milestone;
}

export const AutomatedDispatchManager: React.FC<AutomatedDispatchManagerProps> = ({
  boletas,
  paidBoletas = [],
  clients = [],
  salespeople,
  admins,
  config,
  logs,
  onSaveConfig,
  onAddLogs,
  onClearLogs,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isRunningClosing, setIsRunningClosing] = useState(false);
  const [showClosingPreview, setShowClosingPreview] = useState(false);
  const [lastRunSummary, setLastRunSummary] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<'all' | 'dueño' | 'vendedor' | 'cliente'>('all');
  const [filterMilestone, setFilterMilestone] = useState<string>('all');
  const thresholds = getAlertThresholds(config);
  const [isGatewaySettingsOpen, setIsGatewaySettingsOpen] = useState(false);

  // Form local state
  const [autoEnabled, setAutoEnabled] = useState(config.autoDispatchEnabled ?? true);
  const [channels, setChannels] = useState<'both' | 'whatsapp' | 'email'>(
    config.autoDispatchChannels || 'both'
  );
  const [dispatchTime, setDispatchTime] = useState(config.autoDispatchTime || '08:00');
  const [dailyClosingEnabled, setDailyClosingEnabled] = useState(config.dailyClosingEnabled ?? true);
  const [dailyClosingTime, setDailyClosingTime] = useState(config.dailyClosingTime || '19:00');
  const [senderPhone, setSenderPhone] = useState(config.senderPhone || config.distributorPhone);
  const [senderEmail, setSenderEmail] = useState(config.senderEmail || config.distributorEmail);

  // Direct WhatsApp Gateway configurations
  const [whatsappProvider, setWhatsappProvider] = useState<'server_daemon' | 'meta' | 'twilio' | 'webhook'>(
    config.whatsappProvider || 'server_daemon'
  );
  const [whatsappApiToken, setWhatsappApiToken] = useState(config.whatsappApiToken || '');
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(config.whatsappPhoneNumberId || '');
  const [twilioAccountSid, setTwilioAccountSid] = useState(config.twilioAccountSid || '');
  const [twilioAuthToken, setTwilioAuthToken] = useState(config.twilioAuthToken || '');
  const [twilioFromPhone, setTwilioFromPhone] = useState(config.twilioFromPhone || '');
  const [webhookGatewayUrl, setWebhookGatewayUrl] = useState(config.webhookGatewayUrl || '');
  const [webhookAuthKey, setWebhookAuthKey] = useState(config.webhookAuthKey || '');
  const [notifyOwnerOnlyIfPertinent, setNotifyOwnerOnlyIfPertinent] = useState(
    config.notifyOwnerOnlyIfPertinent ?? true
  );

  const generalAdmin = admins.find((a) => a.isGeneralAdmin || a.role === 'dueño') || admins[0] || {
    name: 'Federico Roa',
    phone: '+54 9 11 3290-8811',
    email: 'federoa14@gmail.com',
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const closingSummary = generateDailyClosingOwnerSummary(
    boletas,
    paidBoletas,
    generalAdmin.name,
    config,
    todayStr
  );

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: DistributorConfig = {
      ...config,
      autoDispatchEnabled: autoEnabled,
      autoDispatchChannels: channels,
      autoDispatchTime: dispatchTime,
      dailyClosingEnabled,
      dailyClosingTime,
      senderPhone: senderPhone.trim(),
      senderEmail: senderEmail.trim(),
      whatsappProvider,
      whatsappApiToken: whatsappApiToken.trim(),
      whatsappPhoneNumberId: whatsappPhoneNumberId.trim(),
      twilioAccountSid: twilioAccountSid.trim(),
      twilioAuthToken: twilioAuthToken.trim(),
      twilioFromPhone: twilioFromPhone.trim(),
      webhookGatewayUrl: webhookGatewayUrl.trim(),
      webhookAuthKey: webhookAuthKey.trim(),
      notifyOwnerOnlyIfPertinent,
    };
    onSaveConfig(updated);
    setLastRunSummary('Configuración de automatización matutina y cierre del día guardada correctamente.');
  };

  // Run daily closing summary dispatch immediately
  const handleExecuteDailyClosing = async () => {
    setIsRunningClosing(true);
    setLastRunSummary(null);
    try {
      const mergedConfig: DistributorConfig = {
        ...config,
        senderPhone,
        senderEmail,
        dailyClosingEnabled,
        dailyClosingTime,
        whatsappProvider,
        whatsappApiToken,
        whatsappPhoneNumberId,
        twilioAccountSid,
        twilioAuthToken,
        twilioFromPhone,
        webhookGatewayUrl,
        webhookAuthKey,
      };
      const data = await executeDailyClosingDirect({
        boletas,
        paidBoletas,
        admins,
        targetDateStr: todayStr,
        config: mergedConfig,
      });
      const generatedLogs: AutoDispatchLog[] = data.logs || [];
      if (generatedLogs.length > 0) {
        onAddLogs(generatedLogs);
      }
      onSaveConfig({
        ...config,
        dailyClosingEnabled,
        dailyClosingTime,
        lastDailyClosingDate: todayStr,
      });
      setLastRunSummary(
        `Resumen de Cierre del Día generado y guardado en Supabase (${generatedLogs.length} envío/s). Total cobrado hoy: ${formatCurrency(
          closingSummary.metrics.totalGeneralCobrado,
          config.currencySymbol
        )}.`
      );
    } catch (err) {
      console.error('Error al generar cierre del día:', err);
      setLastRunSummary('No se pudo generar el resumen de cierre del día.');
    } finally {
      setIsRunningClosing(false);
    }
  };

  // Run dispatch engine directly on client + persist logs to Supabase
  const handleExecuteDispatch = async () => {
    setIsRunning(true);
    setLastRunSummary(null);

    try {
      const mergedConfig: DistributorConfig = {
        ...config,
        senderPhone,
        senderEmail,
        autoDispatchChannels: channels,
        whatsappProvider,
        whatsappApiToken,
        whatsappPhoneNumberId,
        twilioAccountSid,
        twilioAuthToken,
        twilioFromPhone,
        webhookGatewayUrl,
        webhookAuthKey,
        notifyOwnerOnlyIfPertinent,
      };
      const data = await executeDailyAlertsDirect({
        boletas,
        clients,
        salespeople,
        admins,
        config: mergedConfig,
      });

      const generatedLogs: AutoDispatchLog[] = data.logs || [];

      if (generatedLogs.length > 0) {
        onAddLogs(generatedLogs);
      }

      setLastRunSummary(
        `Despacho ejecutado y guardado en Supabase: ${generatedLogs.length} alertas generadas con acceso directo a WhatsApp.`
      );
    } catch (err) {
      console.error('Error en despacho automático:', err);
      setLastRunSummary('Error al ejecutar el motor de despacho.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyMessage = (log: AutoDispatchLog) => {
    const textToCopy = log.fullMessage || log.messageSnippet;
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogId(log.id);
    setTimeout(() => setCopiedLogId(null), 2500);
  };

  const handleOpenWhatsApp = (log: AutoDispatchLog) => {
    const url = log.whatsappUrl || createWhatsAppUrl(log.recipientPhone || log.recipientContact, log.fullMessage || log.messageSnippet);
    window.open(url, '_blank');
  };

  const handleOpenEmail = (log: AutoDispatchLog) => {
    const email = log.recipientEmail || (log.recipientContact.includes('@') ? log.recipientContact : '');
    const subject = `Aviso de Cobranzas - ${config.distributorName}`;
    const body = log.fullMessage || log.messageSnippet;
    window.open(createMailtoUrl(email, subject, body), '_blank');
  };

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (filterRole !== 'all' && log.recipientRole !== filterRole) return false;
    if (filterMilestone !== 'all' && normalizeMilestone(log.ruleMilestone) !== filterMilestone) return false;
    return true;
  });

  const getMilestoneBadge = (milestone?: string) => {
    switch (normalizeMilestone(milestone)) {
      case 'vendor_reminder':
        return { label: `Recordatorio (${thresholds.vendedorReminderDays} días desde la venta) • Vendedor`, bg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200' };
      case 'owner_alert':
        return { label: `Aviso (${thresholds.adminAlertDays} días desde la venta) • Dueño y vendedor`, bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200' };
      case 'alert_mode':
        return { label: `🚨 Modo alerta (${thresholds.alertModeDays}+ días) • Sigue sin pagar`, bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300' };
      case 'critical_sale':
        return { label: `🚨 Alerta crítica (${thresholds.criticalSaleDays}+ días)`, bg: 'bg-red-200 text-red-900 dark:bg-red-950/80 dark:text-red-200 border-red-400' };
      case 'overdue':
        return { label: '⏰ Salida a Cobrar Hoy', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200' };
      case 'overdue_client':
        return { label: '👤 Recordatorio al Cliente (Vencida)', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300' };
      case 'blocked_charge':
        return { label: '🚫 Carga Anulada Deuda Previa', bg: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300' };
      case 'daily_closing':
        return { label: '🌙 Cierre del Día • Dueño', bg: 'bg-[#162E59] text-white border-[#B6C2D2]/30' };
      default:
        return { label: 'Cobranza', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200' };
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* HERO CARD - MANOS LIBRES */}
      <div className="bg-gradient-to-r from-[#091428] via-[#0F2142] to-[#162E59] rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-[#B6C2D2]/25">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#1B3668] text-[#E2E8F0] text-xs font-bold border border-[#B6C2D2]/30">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>ENVÍO AUTOMÁTICO DIARIO</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Envío automático diario por WhatsApp
            </h2>
            <p className="text-sm text-emerald-100/90 leading-relaxed">
              No tenés que estar presionando botones. Cada mañana a las <strong>{dispatchTime} hs</strong> el servidor despacha directamente:
            </p>
            <div className="space-y-1.5 text-xs text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>A los Vendedores:</strong> Les llega su mensaje matutino directo con la hoja de ruta de los cobros que tienen que realizar en la calle.</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Al Dueño:</strong> Le sale el mensaje <strong>ÚNICAMENTE SI ES PERTINENTE</strong> (solo si hay boletas vencidas que cobrar hoy, o avisos a los {thresholds.adminAlertDays}, {thresholds.alertModeDays} o {thresholds.criticalSaleDays}+ días desde la venta). Si todo está al día, no se satura al dueño.</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${config.enableClientWhatsAppReminders && config.includeClientsInAutoDispatch ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>
                  <strong>A los Clientes (Facturas Vencidas):</strong>{' '}
                  {config.enableClientWhatsAppReminders && config.includeClientsInAutoDispatch ? (
                    <span className="text-emerald-300 font-semibold">ACTIVADO — Se enviará recordatorio de vencimiento por WhatsApp al cliente.</span>
                  ) : (
                    <span className="text-slate-300/80">Desactivado (podés habilitarlo en Dueños & Ajustes).</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={handleExecuteDispatch}
              disabled={isRunning}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-4 bg-emerald-500 hover:bg-emerald-400 active:scale-98 text-slate-950 font-black text-sm rounded-2xl shadow-xl hover:shadow-emerald-500/30 transition-all disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Despachando Directo...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Probar envío ahora</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* STATUS BAR */}
        <div className="mt-6 pt-5 border-t border-emerald-500/20 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[#94A3B8] block text-[11px] font-semibold">Estado</span>
            <span className="font-bold text-white flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  config.autoDispatchEnabled !== false ? 'bg-emerald-400' : 'bg-slate-400'
                }`}
              />
              <span>
                {config.autoDispatchEnabled !== false ? 'Envío automático: activo' : 'Envío automático: pausado'}
              </span>
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8] block text-[11px] font-semibold">Horario Matutino / Cierre</span>
            <span className="font-bold text-white mt-0.5 block font-mono tabular-nums text-sm">
              {dispatchTime} hs · Cierre {dailyClosingTime} hs
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8] block text-[11px] font-semibold">Modo al Dueño</span>
            <span className="font-bold text-[#E2E8F0] mt-0.5 block">
              {notifyOwnerOnlyIfPertinent ? 'Solo si es Pertinente' : 'Todos los avisos'}
            </span>
          </div>
          <div>
            <span className="text-[#94A3B8] block text-[11px] font-semibold">Línea Remitente</span>
            <span className="font-bold text-white mt-0.5 block font-mono truncate">{senderPhone}</span>
          </div>
        </div>

        {lastRunSummary && (
          <div className="mt-4 p-3.5 bg-white/10 rounded-xl text-xs text-emerald-200 flex items-center gap-2.5 border border-white/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{lastRunSummary}</span>
          </div>
        )}
      </div>

      {/* RESUMEN AUTOMÁTICO DE CIERRE DEL DÍA POR WHATSAPP AL DUEÑO */}
      <div className="bg-white dark:bg-[#0B1933] rounded-2xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25 p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#B6C2D2]/15 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0B1933] dark:bg-[#13264A] text-[#E2E8F0] border border-[#B6C2D2]/30 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-[#0B1933] dark:text-white">
                  Resumen Automático al Cierre del Día (WhatsApp al Dueño)
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    dailyClosingEnabled
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {dailyClosingEnabled ? `Automático ${dailyClosingTime} hs` : 'Desactivado'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#94A3B8] mt-0.5">
                Al finalizar la jornada le envía automáticamente al dueño ({generalAdmin.name} · {generalAdmin.phone}) el detalle exacto de boletas cobradas, boletas impagas pendientes y total ingresado separado en <strong>Efectivo</strong> y <strong>Transferencia</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setShowClosingPreview((prev) => !prev)}
              className="px-3.5 py-2.5 rounded-xl bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] dark:hover:bg-[#1B3566] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs font-bold cursor-pointer transition-colors"
            >
              {showClosingPreview ? 'Ocultar Mensaje' : 'Ver Mensaje de Hoy'}
            </button>

            <a
              href={createWhatsAppUrl(generalAdmin.phone || config.senderPhone, closingSummary.message)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
              title="Abrir WhatsApp directo con el resumen de cierre calculado hoy"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Abrir en WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={handleExecuteDailyClosing}
              disabled={isRunningClosing}
              className="px-4 py-2.5 rounded-xl bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isRunningClosing ? 'Enviando...' : 'Enviar Cierre Ahora'}</span>
            </button>
          </div>
        </div>

        {/* Metrics Strip for Today's Closing */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
          <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#081224] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8] block">
              Cobradas Hoy
            </span>
            <span className="text-lg font-black text-[#0B1933] dark:text-white mt-0.5 block">
              {closingSummary.metrics.collectedItems.length} mov.
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#081224] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8] block">
              Ingresado Efectivo
            </span>
            <span className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400 mt-0.5 block">
              {formatCurrency(closingSummary.metrics.totalEfectivo, config.currencySymbol)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#081224] border border-[#CBD5E1] dark:border-[#B6C2D2]/20">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#94A3B8] block">
              Ingresado Transferencia
            </span>
            <span className="text-lg font-black font-mono text-sky-700 dark:text-sky-400 mt-0.5 block">
              {formatCurrency(closingSummary.metrics.totalTransferencia, config.currencySymbol)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0B1933] dark:bg-[#13264A] text-white border border-[#B6C2D2]/30">
            <span className="text-[11px] font-semibold text-[#CBD5E1] block">
              Total Final Cobrado Hoy
            </span>
            <span className="text-lg font-black font-mono text-white mt-0.5 block">
              {formatCurrency(closingSummary.metrics.totalGeneralCobrado, config.currencySymbol)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 col-span-2 lg:col-span-1">
            <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 block">
              Impagas al Cierre
            </span>
            <span className="text-lg font-black font-mono text-[#991B1B] dark:text-rose-400 mt-0.5 block">
              {closingSummary.metrics.unpaidItems.length} ({formatCurrency(closingSummary.metrics.totalUnpaidDebt, config.currencySymbol)})
            </span>
          </div>
        </div>

        {showClosingPreview && (
          <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-[#071021] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs font-mono text-slate-800 dark:text-[#E2E8F0] whitespace-pre-wrap leading-relaxed">
            {closingSummary.message}
          </div>
        )}
      </div>

      {/* REGLAS ESTRICTAS DE NOTIFICACIÓN */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-blue-200 dark:border-blue-950/60 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 font-black text-sm">
            {thresholds.vendedorReminderDays}d
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 dark:text-white">
              A los {thresholds.vendedorReminderDays} días de la venta
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Directo al vendedor para que tenga la boleta en su hoja de ruta. <strong>No molesta al dueño.</strong>
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-amber-200 dark:border-amber-950/60 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 font-black text-sm">
            {thresholds.adminAlertDays}d
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 dark:text-white">
              A los {thresholds.adminAlertDays} días de la venta
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Al vendedor y <strong>al dueño (pertinente)</strong> para seguimiento antes del vencimiento.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-rose-200 dark:border-rose-950/60 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 font-black text-sm">
            {thresholds.alertModeDays}d
          </div>
          <div>
            <h4 className="font-bold text-xs text-rose-700 dark:text-rose-400">
              🚨 Desde los {thresholds.alertModeDays} días (modo alerta)
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Al vendedor y al dueño avisando que <strong>sigue sin estar paga</strong>. Boleta prioritaria urgente.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-red-300 dark:border-red-950/60 shadow-xs flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 flex items-center justify-center shrink-0 font-black text-sm">
            {thresholds.criticalSaleDays}d
          </div>
          <div>
            <h4 className="font-bold text-xs text-red-700 dark:text-red-400">
              🚨 Desde los {thresholds.criticalSaleDays} días (alerta crítica)
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              Mora extrema obligatoria a dueños y vendedor: cuenta bloqueada con cobro exigido hoy.
            </p>
          </div>
        </div>
      </div>

      {/* REGISTRO DE DESPACHOS DIRECTOS DEL SERVIDOR */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-600" />
              <span>Registro de Despachos Automáticos Directos del Servidor ({filteredLogs.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Historial de mensajes emitidos automáticamente sin intervención manual
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">
              <button
                onClick={() => setFilterRole('all')}
                className={`px-3 py-1 rounded-lg transition-colors ${filterRole === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
              >
                Todos ({logs.length})
              </button>
              <button
                onClick={() => setFilterRole('vendedor')}
                className={`px-3 py-1 rounded-lg transition-colors ${filterRole === 'vendedor' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
              >
                Vendedores
              </button>
              <button
                onClick={() => setFilterRole('dueño')}
                className={`px-3 py-1 rounded-lg transition-colors ${filterRole === 'dueño' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
              >
                Dueños (Pertinentes)
              </button>
              <button
                onClick={() => setFilterRole('cliente')}
                className={`px-3 py-1 rounded-lg transition-colors ${filterRole === 'cliente' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500'}`}
              >
                Clientes
              </button>
            </div>

            {logs.length > 0 && (
              <button
                onClick={onClearLogs}
                className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="text-center py-14 px-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              Servicio Automático en Espera
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              No hay alertas pendientes de emisión. Cada mañana a las <strong>{dispatchTime} hs</strong> el servidor procesará de forma automática e inmediata los cobros para los vendedores y los avisos pertinentes para los dueños.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log) => {
              const badge = getMilestoneBadge(log.ruleMilestone);
              const isExpanded = expandedLogId === log.id;
              const isCopied = copiedLogId === log.id;

              return (
                <div
                  key={log.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md border ${badge.bg}`}>
                        {badge.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        <Check className="w-3 h-3" />
                        <span>Enviado Directo</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {log.timestamp.slice(11, 16)} hs ({formatDateEs(log.timestamp.slice(0, 10))})
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {log.recipientName} ({log.recipientRole})
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {log.recipientPhone || log.recipientContact}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {/* Copy message button */}
                      <button
                        onClick={() => handleCopyMessage(log)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                        title="Copiar texto del mensaje enviado"
                      >
                        {isCopied ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      {/* Fallback open if needed */}
                      <button
                        onClick={() => handleOpenWhatsApp(log)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-emerald-50 text-emerald-600 transition-colors"
                        title="Ver en WhatsApp"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>

                      {/* Expand / collapse preview */}
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                        title={isExpanded ? 'Ocultar detalle' : 'Ver mensaje completo'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Message body */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
                    {isExpanded ? log.fullMessage || log.messageSnippet : log.messageSnippet}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PARÁMETROS DEL SERVICIO Y PASARELA */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Parámetros de Automatización y Remitente
              </h3>
              <p className="text-xs text-slate-400">
                Horario matutino de envío directo y opciones de notificación
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsGatewaySettingsOpen(!isGatewaySettingsOpen)}
            className="text-xs font-bold text-emerald-600 hover:text-emerald-500 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800"
          >
            <span>{isGatewaySettingsOpen ? 'Ocultar Pasarela WhatsApp' : 'Configurar Pasarela WhatsApp'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isGatewaySettingsOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Toggle Manos Libres */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Envío Directo Matutino
                </span>
                <span className="text-[11px] text-slate-400">
                  Despachar sin clics a diario
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => setAutoEnabled(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded"
                />
              </label>
            </div>

            {/* Toggle Cierre del Día Automático al Dueño */}
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Cierre del Día al Dueño
                </span>
                <span className="text-[11px] text-slate-400">
                  Balance Efectivo/Transf. diario
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={dailyClosingEnabled}
                  onChange={(e) => setDailyClosingEnabled(e.target.checked)}
                  className="w-5 h-5 text-emerald-600 rounded"
                />
              </label>
            </div>

            {/* Daily Schedule Time */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Horario Matutino de Envío:
              </label>
              <input
                type="time"
                value={dispatchTime}
                onChange={(e) => setDispatchTime(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold font-mono"
              />
            </div>

            {/* Daily Closing Time */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Horario Resumen Cierre del Día:
              </label>
              <input
                type="time"
                value={dailyClosingTime}
                onChange={(e) => setDailyClosingTime(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold font-mono"
              />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Alertas Matutinas al Dueño solo si es Pertinente
              </span>
              <span className="text-[11px] text-slate-400">
                Por la mañana avisa al dueño únicamente si hay avisos a los {thresholds.adminAlertDays}, {thresholds.alertModeDays} o {thresholds.criticalSaleDays}+ días desde la venta. El Resumen de Cierre del Día sí se envía cada tarde.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
              <input
                type="checkbox"
                checked={notifyOwnerOnlyIfPertinent}
                onChange={(e) => setNotifyOwnerOnlyIfPertinent(e.target.checked)}
                className="w-5 h-5 text-emerald-600 rounded"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Línea Remitente de WhatsApp (Número corporativo):
              </label>
              <input
                type="text"
                placeholder="+54 9 11 3290-8811"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Correo Remitente Oficial:
              </label>
              <input
                type="email"
                placeholder="cobranzas@distribuidora.com"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                required
              />
            </div>
          </div>

          {/* ADVANCED GATEWAY CONFIGURATION */}
          {isGatewaySettingsOpen && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in">
              <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-600" />
                <span>Pasarela de envío (API o webhook)</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Proveedor de Salida:
                  </label>
                  <select
                    value={whatsappProvider}
                    onChange={(e) => setWhatsappProvider(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="server_daemon">🚀 Servidor Directo Autónomo (Sin clics)</option>
                    <option value="meta">💬 Meta WhatsApp Cloud API (Oficial)</option>
                    <option value="twilio">📞 Twilio WhatsApp API</option>
                    <option value="webhook">🌐 Webhook Gateway Directo (Baileys / Evolution)</option>
                  </select>
                </div>

                {whatsappProvider === 'meta' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Phone Number ID de Meta:
                      </label>
                      <input
                        type="text"
                        value={whatsappPhoneNumberId}
                        onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
                        placeholder="Ej. 109482718912"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Token de Acceso Permanente Meta Cloud API:
                      </label>
                      <input
                        type="password"
                        value={whatsappApiToken}
                        onChange={(e) => setWhatsappApiToken(e.target.value)}
                        placeholder="Credencial de acceso permanente Meta Cloud API"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                      />
                    </div>
                  </>
                )}

                {whatsappProvider === 'twilio' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Twilio Account SID:
                      </label>
                      <input
                        type="text"
                        value={twilioAccountSid}
                        onChange={(e) => setTwilioAccountSid(e.target.value)}
                        placeholder="AC..."
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Twilio Auth Token:
                      </label>
                      <input
                        type="password"
                        value={twilioAuthToken}
                        onChange={(e) => setTwilioAuthToken(e.target.value)}
                        placeholder="Token..."
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                      />
                    </div>
                  </>
                )}

                {whatsappProvider === 'webhook' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        URL de Endpoint Webhook:
                      </label>
                      <input
                        type="url"
                        value={webhookGatewayUrl}
                        onChange={(e) => setWebhookGatewayUrl(e.target.value)}
                        placeholder="https://mi-servidor-whatsapp.com/api/send"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black rounded-xl shadow transition-transform active:scale-98"
            >
              Guardar Configuración de Envío Directo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
