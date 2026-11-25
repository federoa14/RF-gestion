import React, { useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { TermsConditionsScrollBox } from './TermsConditionsModal';
import { TERMS_VERSION } from '../utils/termsAndConditions';

interface TermsAcceptanceGateProps {
  onAccept: () => void;
  onLogout?: () => void;
}

/**
 * Pantalla obligatoria: el comercio no puede usar el sistema hasta aceptar
 * la versión vigente de los Términos y Condiciones.
 */
export const TermsAcceptanceGate: React.FC<TermsAcceptanceGateProps> = ({ onAccept, onLogout }) => {
  const [checked, setChecked] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Aceptar Términos y Condiciones"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="px-5 py-4 bg-[#0B1933] text-white flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-sky-300 shrink-0" />
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-300">
              Versión {TERMS_VERSION}
            </div>
            <h3 className="text-sm sm:text-base font-bold">Para usar el sistema, aceptá los Términos y Condiciones</h3>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <TermsConditionsScrollBox variant="light" maxHeightClass="max-h-[50vh]" />
          <label className="flex items-start gap-2 text-xs text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4"
            />
            <span>
              Leí y acepto los Términos y Condiciones de uso, incluidas la limitación de responsabilidad y el
              tratamiento de datos personales.
            </span>
          </label>
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-200">
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Salir sin aceptar
              </button>
            )}
            <button
              type="button"
              disabled={!checked}
              onClick={onAccept}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Aceptar y continuar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
