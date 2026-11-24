import React from 'react';
import { CheckCircle2, FileText, ShieldCheck, X } from 'lucide-react';
import {
  PLATFORM_TERMS_SECTIONS,
  TERMS_LAST_UPDATED,
  TERMS_VERSION,
} from '../utils/termsAndConditions';

interface TermsConditionsScrollBoxProps {
  variant?: 'light' | 'dark';
  maxHeightClass?: string;
}

export const TermsConditionsScrollBox: React.FC<TermsConditionsScrollBoxProps> = ({
  variant = 'light',
  maxHeightClass = 'max-h-56',
}) => {
  const isDark = variant === 'dark';

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-2.5 overflow-y-auto text-xs leading-relaxed ${maxHeightClass} ${
        isDark
          ? 'bg-[#071021] border-[#B6C2D2]/25 text-slate-300'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-2 pb-2 border-b ${
          isDark ? 'border-[#B6C2D2]/15' : 'border-slate-200'
        }`}
      >
        <div
          className={`flex items-center gap-1.5 font-bold ${
            isDark ? 'text-white' : 'text-[#0B1933]'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <span>Términos y Condiciones de Uso y Manejo</span>
        </div>
        <span
          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
            isDark
              ? 'bg-[#0B1933] text-sky-300 border border-sky-400/25'
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
        >
          v{TERMS_VERSION} · {TERMS_LAST_UPDATED}
        </span>
      </div>

      {PLATFORM_TERMS_SECTIONS.map((sec) => (
        <div key={sec.id} className="space-y-1">
          <div
            className={`font-bold ${
              isDark ? 'text-slate-100' : 'text-slate-900'
            }`}
          >
            {sec.number}. {sec.title}
          </div>
          {sec.paragraphs.map((p, idx) => (
            <p key={idx} className={isDark ? 'text-slate-300/95' : 'text-slate-600'}>
              {p}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
};

interface TermsConditionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAcceptAndClose?: () => void;
  contextTitle?: string;
}

export const TermsConditionsModal: React.FC<TermsConditionsModalProps> = ({
  isOpen,
  onClose,
  onAcceptAndClose,
  contextTitle,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="px-5 py-4 bg-[#0B1933] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-300">
                Documento Legal de Uso · Versión {TERMS_VERSION}
              </div>
              <h3 className="text-sm sm:text-base font-bold truncate">
                {contextTitle || 'Términos y Condiciones de Uso y Manejo'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar Términos y Condiciones"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <TermsConditionsScrollBox variant="light" maxHeightClass="max-h-[56vh]" />

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cerrar
            </button>
            {onAcceptAndClose && (
              <button
                type="button"
                onClick={() => {
                  onAcceptAndClose();
                  onClose();
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Leí y Acepto los Términos y Condiciones</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
