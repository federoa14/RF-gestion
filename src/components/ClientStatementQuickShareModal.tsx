import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  MessageCircle,
  Download,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  Phone,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { Boleta, Client, DistributorConfig } from '../types';
import { formatCurrency, getBoletaBalance } from '../utils/alerts';
import { createWhatsAppUrl, generateClientStatementWhatsAppMessage } from '../utils/whatsapp';
import {
  renderClientStatementToDataUrl,
  downloadClientStatementPng,
  copyClientStatementImage,
  downloadClientStatementPdf,
} from '../utils/visualStatement';

interface ClientStatementQuickShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  pendingBoletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  currentDateRef?: string;
  sourceBoletaNumber?: string;
  onSaveClientPhone?: (clientId: string, phone: string) => void;
}

export const ClientStatementQuickShareModal: React.FC<ClientStatementQuickShareModalProps> = ({
  isOpen,
  onClose,
  client,
  pendingBoletas,
  paidBoletas,
  config,
  currentDateRef,
  sourceBoletaNumber,
  onSaveClientPhone,
}) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [includeRecentPaid, setIncludeRecentPaid] = useState(true);
  const [alsoCopyImageOnWa, setAlsoCopyImageOnWa] = useState(true);
  const [customMessage, setCustomMessage] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isExporting, setIsExporting] = useState<'png' | 'pdf' | null>(null);

  const sym = config.currencySymbol || '$';

  const clientPending = useMemo(() => {
    if (!client) return [];
    return pendingBoletas
      .filter((b) => b.status === 'pending' && (b.clientId === client.id || b.clientName === client.name))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [client, pendingBoletas]);

  const clientPaid = useMemo(() => {
    if (!client) return [];
    return paidBoletas
      .filter((b) => b.clientId === client.id || b.clientName === client.name)
      .sort((a, b) => (b.paidAt || b.saleDate || '').localeCompare(a.paidAt || a.saleDate || ''));
  }, [client, paidBoletas]);

  const totalPendingDebt = useMemo(
    () => clientPending.reduce((acc, b) => acc + getBoletaBalance(b).balanceDue, 0),
    [clientPending]
  );

  // Sync phone & generated text when opening or switching client/toggle
  useEffect(() => {
    if (!isOpen || !client) return;
    setPhoneInput(client.phone || '');
    setPhoneSaved(false);
    setCopiedText(false);
    setCopiedImage(false);
  }, [isOpen, client?.id]);

  useEffect(() => {
    if (!isOpen || !client) return;
    const generated = generateClientStatementWhatsAppMessage({
      client,
      pendingBoletas: clientPending,
      paidBoletas: clientPaid,
      config,
      currentDateRef,
      includeRecentPaid,
    });
    setCustomMessage(generated);

    let cancelled = false;
    setIsRenderingPreview(true);
    renderClientStatementToDataUrl({
      client,
      pendingBoletas: clientPending,
      paidBoletas: clientPaid,
      config,
      currentDateRef,
      includeRecentPaid,
    })
      .then((url) => {
        if (!cancelled) setPreviewDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewDataUrl('');
      })
      .finally(() => {
        if (!cancelled) setIsRenderingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, client?.id, clientPending, clientPaid, config, currentDateRef, includeRecentPaid]);

  if (!isOpen || !client) return null;

  const canSavePhone =
    Boolean(onSaveClientPhone) &&
    Boolean(phoneInput.trim()) &&
    phoneInput.trim() !== (client.phone || '').trim() &&
    !client.id.startsWith('temp-');

  const handleSavePhone = () => {
    if (!onSaveClientPhone || !phoneInput.trim()) return;
    onSaveClientPhone(client.id, phoneInput.trim());
    setPhoneSaved(true);
  };

  const handleSendWhatsApp = async () => {
    if (alsoCopyImageOnWa) {
      const ok = await copyClientStatementImage({
        client,
        pendingBoletas: clientPending,
        paidBoletas: clientPaid,
        config,
        currentDateRef,
        includeRecentPaid,
      });
      if (ok) {
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 3000);
      }
    }
    const url = createWhatsAppUrl(phoneInput.trim(), customMessage);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(customMessage);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleCopyImage = async () => {
    const ok = await copyClientStatementImage({
      client,
      pendingBoletas: clientPending,
      paidBoletas: clientPaid,
      config,
      currentDateRef,
      includeRecentPaid,
    });
    if (ok) {
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2800);
    }
  };

  const handleDownloadPng = async () => {
    setIsExporting('png');
    try {
      await downloadClientStatementPng({
        client,
        pendingBoletas: clientPending,
        paidBoletas: clientPaid,
        config,
        currentDateRef,
        includeRecentPaid,
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadPdf = async () => {
    setIsExporting('pdf');
    try {
      await downloadClientStatementPdf({
        client,
        pendingBoletas: clientPending,
        paidBoletas: clientPaid,
        config,
        currentDateRef,
        includeRecentPaid,
      });
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050C18]/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header Navy */}
        <div className="bg-[#091428] px-5 py-4 border-b border-[#B6C2D2]/20 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
                  Enviar Estado de Cuenta Instantáneo por WhatsApp
                </h2>
                {sourceBoletaNumber && (
                  <span className="px-2 py-0.5 rounded bg-[#162E59] text-[#E2E8F0] border border-[#B6C2D2]/25 font-mono text-[10px] font-bold">
                    Desde Boleta #{sourceBoletaNumber}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8] truncate">
                Cliente: <strong className="text-white">{client.name}</strong> · Detalle directo en texto, Imagen PNG o PDF (sin link externo)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#13264A] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Top KPI & WhatsApp Number Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            <div
              className={`lg:col-span-4 p-3.5 rounded-xl border flex flex-col justify-center tabular-nums ${
                totalPendingDebt > 0
                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/60'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60'
              }`}
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-[#CBD5E1]">
                Estado Actual al Instante
              </span>
              <div
                className={`text-xl font-black font-mono mt-0.5 ${
                  totalPendingDebt > 0 ? 'text-[#991B1B] dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {totalPendingDebt > 0 ? formatCurrency(totalPendingDebt, sym) : 'AL DÍA ($ 0,00)'}
              </div>
              <span className="text-[11px] text-slate-600 dark:text-[#94A3B8]">
                {clientPending.length} comprobante(s) abierto(s) · {clientPaid.length} pagado(s)
              </span>
            </div>

            <div className="lg:col-span-8 p-3.5 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-[#0B1933] dark:text-white flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#162E59] dark:text-[#CBD5E1]" />
                  <span>WhatsApp del Cliente:</span>
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-[#CBD5E1] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeRecentPaid}
                    onChange={(e) => setIncludeRecentPaid(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Incluir últimos comprobantes pagados</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value);
                    setPhoneSaved(false);
                  }}
                  placeholder="Ej. +54 9 11 2345-6789 (si queda vacío elegís el chat al abrir WhatsApp)"
                  className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white"
                />
                {canSavePhone && !phoneSaved && (
                  <button
                    type="button"
                    onClick={handleSavePhone}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428] cursor-pointer whitespace-nowrap"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Agendar</span>
                  </button>
                )}
                {phoneSaved && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 shrink-0">
                    <Check className="w-3.5 h-3.5" /> Guardado
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Two-column: Editable Written Message vs Live PNG/PDF Card Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Written Detail */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-[#CBD5E1]">
                  1. Detalle Escrito Directo (Editable)
                </span>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] cursor-pointer"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedText ? 'Texto copiado' : 'Copiar texto'}</span>
                </button>
              </div>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={13}
                className="w-full flex-1 text-xs font-mono p-3 rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-50 dark:bg-[#071021] text-slate-800 dark:text-[#E2E8F0] focus:outline-hidden focus:ring-2 focus:ring-emerald-600"
              />
              <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-[#94A3B8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoCopyImageOnWa}
                  onChange={(e) => setAlsoCopyImageOnWa(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Al tocar &quot;Enviar por WhatsApp&quot;, copiar también la imagen al portapapeles (para pegarla con Ctrl+V)</span>
              </label>
            </div>

            {/* Live Image / PDF Preview */}
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-[#CBD5E1]">
                  2. Tarjeta Visual (Imagen PNG / PDF)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyImage}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#E9EEF5] hover:bg-[#DCE4F0] dark:bg-[#13264A] text-[#0B1933] dark:text-[#E2E8F0] cursor-pointer"
                    title="Copiar imagen para pegar directo en el chat de WhatsApp"
                  >
                    {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ImageIcon className="w-3.5 h-3.5" />}
                    <span>{copiedImage ? 'Imagen copiada' : 'Copiar imagen'}</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-[260px] max-h-[340px] overflow-auto rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-slate-100 dark:bg-[#071021] p-2.5 flex items-start justify-center">
                {isRenderingPreview ? (
                  <div className="my-auto flex items-center gap-2 text-xs text-slate-500">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generando vista previa del estado de cuenta...</span>
                  </div>
                ) : previewDataUrl ? (
                  <img
                    src={previewDataUrl}
                    alt={`Estado de cuenta de ${client.name}`}
                    className="w-full h-auto rounded-lg shadow-xs border border-slate-200 dark:border-slate-800"
                  />
                ) : (
                  <span className="my-auto text-xs text-slate-400">Vista previa no disponible</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-[#F8FAFC] dark:bg-[#091428] border-t border-slate-200 dark:border-[#B6C2D2]/15 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isExporting !== null}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#162E59] dark:hover:bg-[#1E3A6D] text-white text-xs font-bold cursor-pointer disabled:opacity-60 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isExporting === 'pdf' ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </button>

            <button
              type="button"
              disabled={isExporting !== null}
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#0F2142] hover:bg-slate-100 dark:hover:bg-[#162E59] text-[#0B1933] dark:text-[#E2E8F0] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-xs font-bold cursor-pointer disabled:opacity-60 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting === 'png' ? 'Generando PNG...' : 'Descargar Imagen PNG'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-200 dark:hover:bg-[#13264A] cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-extrabold shadow-sm cursor-pointer transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Enviar Estado de Cuenta por WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
