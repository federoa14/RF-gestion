import React, { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon, Loader2, QrCode, X } from 'lucide-react';
import { FLYER_STYLES, type FlyerStyleKey } from '../utils/flyerRenderer';
import {
  DEFAULT_QR_FLYER_TEXTS,
  QR_FLYER_FORMATS,
  renderQrFlyer,
  renderQrOnly,
  type QrFlyerFormat,
} from '../utils/qrFlyerRenderer';

interface QrFlyerModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  tenantId: string;
  storeName: string;
  tagline?: string;
  contact?: string;
  logoUrl?: string;
}

interface Saved {
  style: FlyerStyleKey;
  format: QrFlyerFormat;
  badge: string;
  storeName: string;
  tagline: string;
  cta: string;
  contact: string;
  extra: string;
  accent: string;
}

const slug = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'tienda';

/**
 * Flyer con el QR de la tienda: dice "E-commerce", el nombre del comercio y el QR que lleva al link.
 * El comercio edita los textos, el estilo y el color; se recuerdan para la próxima vez.
 */
export const QrFlyerModal: React.FC<QrFlyerModalProps> = ({
  isOpen,
  onClose,
  url,
  tenantId,
  storeName,
  tagline,
  contact,
  logoUrl,
}) => {
  const storageKey = `rf_qr_flyer_${tenantId}`;
  const [form, setForm] = useState<Saved>({
    style: 'moderno',
    format: 'a4',
    badge: DEFAULT_QR_FLYER_TEXTS.badge,
    storeName,
    tagline: DEFAULT_QR_FLYER_TEXTS.tagline,
    cta: DEFAULT_QR_FLYER_TEXTS.cta,
    contact: contact || '',
    extra: '',
    accent: '',
  });
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setForm((prev) => ({ ...prev, ...(JSON.parse(raw) as Partial<Saved>) }));
    } catch {
      // sin datos guardados
    }
  }, [isOpen, storageKey]);

  useEffect(() => {
    if (!isOpen) return;
    const id = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(async () => {
      try {
        const img = await renderQrFlyer({ ...form, url, logoUrl, accent: form.accent || undefined });
        if (id === seq.current) {
          setPreview(img);
          setError('');
        }
      } catch {
        if (id === seq.current) setError('No se pudo armar el flyer. Probá de nuevo.');
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [isOpen, form, url, logoUrl]);

  if (!isOpen) return null;

  const set = <K extends keyof Saved>(key: K, value: Saved[K]) => setForm((p) => ({ ...p, [key]: value }));
  const persist = () => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(form));
    } catch {
      // ignore
    }
  };
  const download = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const downloadFlyer = () => {
    persist();
    if (preview) download(preview, `flyer-qr-${slug(form.storeName)}-${form.format}.png`);
  };
  const downloadQr = async () => {
    persist();
    download(await renderQrOnly(url), `qr-${slug(form.storeName)}.png`);
  };

  const input =
    'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Flyer con QR de la tienda">
      <div className="bg-white w-full sm:max-w-4xl max-h-[96vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 bg-[#0B1933] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <QrCode className="w-4 h-4" />
            Flyer con QR de tu tienda
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500">
              El QR lleva directo a <span className="font-mono text-slate-700 break-all">{url}</span>. Editá los datos y descargalo para imprimir o compartir.
            </p>

            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5">Estilo</div>
              <div className="grid grid-cols-2 gap-1.5">
                {FLYER_STYLES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={form.style === s.key}
                    onClick={() => set('style', s.key)}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                      form.style === s.key ? 'border-slate-900 ring-2 ring-slate-900/15 bg-white' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="inline-block w-3 h-3 rounded-full mr-1.5 align-middle" style={{ backgroundColor: s.accent }} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5">Formato</div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Formato del flyer">
                {QR_FLYER_FORMATS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={form.format === f.key}
                    onClick={() => set('format', f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      form.format === f.key ? 'bg-[#0B1933] text-white border-[#0B1933]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Título superior</span>
              <input className={input} maxLength={24} value={form.badge} onChange={(e) => set('badge', e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Nombre de la tienda</span>
              <input className={input} maxLength={60} value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Frase</span>
              <input className={input} maxLength={110} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Llamado a la acción</span>
              <input className={input} maxLength={28} value={form.cta} onChange={(e) => set('cta', e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">WhatsApp o teléfono</span>
              <input className={input} maxLength={40} value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Ej. WhatsApp 11 5555-1234" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Otro dato (Instagram, dirección, horarios)</span>
              <input className={input} maxLength={70} value={form.extra} onChange={(e) => set('extra', e.target.value)} placeholder="Ej. @mitienda · Lunes a sábado 9 a 19 hs" />
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
              Color de la marca
              <input
                type="color"
                value={form.accent || FLYER_STYLES.find((s) => s.key === form.style)?.accent || '#0B1933'}
                onChange={(e) => set('accent', e.target.value.toUpperCase())}
                className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
              />
              {form.accent && (
                <button type="button" onClick={() => set('accent', '')} className="text-[11px] font-semibold text-slate-500 underline cursor-pointer">
                  usar el del estilo
                </button>
              )}
            </label>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 flex items-center justify-center min-h-[320px]">
              {preview ? (
                <img src={preview} alt="Vista previa del flyer con QR" className="max-h-[56vh] max-w-full rounded-lg shadow-lg" />
              ) : (
                <ImageIcon className="w-10 h-10 text-slate-300" />
              )}
            </div>
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadFlyer}
                disabled={!preview || busy}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Descargar flyer
              </button>
              <button
                type="button"
                onClick={() => void downloadQr()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 text-xs font-bold cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                Descargar solo el QR
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Tip: probá el QR con tu celular antes de imprimir, y pegalo en la vidriera, el mostrador y las bolsas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
