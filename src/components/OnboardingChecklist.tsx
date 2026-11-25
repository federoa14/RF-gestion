import React, { useState } from 'react';
import { CheckCircle2, Circle, ChevronRight, Rocket, X } from 'lucide-react';

export interface OnboardingStep {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
}

interface OnboardingChecklistProps {
  tenantId: string;
  steps: OnboardingStep[];
}

const hiddenKey = (tenantId: string) => `rf_onboarding_hidden_v1_${tenantId}`;

function readHidden(tenantId: string): boolean {
  try {
    return window.localStorage.getItem(hiddenKey(tenantId)) === '1';
  } catch {
    return false;
  }
}

/** Primeros pasos para un comercio nuevo. Se oculta sola cuando está todo hecho. */
export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ tenantId, steps }) => {
  const [hidden, setHidden] = useState(() => readHidden(tenantId));
  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || steps.length === 0 || doneCount === steps.length) return null;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <section
      aria-label="Primeros pasos"
      className="bg-white dark:bg-[#0B1933] border border-indigo-200 dark:border-[#B6C2D2]/20 rounded-xl p-4 shadow-2xs space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-[#13264A] border border-indigo-200 dark:border-[#B6C2D2]/20 flex items-center justify-center shrink-0">
            <Rocket className="w-4.5 h-4.5 text-indigo-700 dark:text-indigo-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Primeros pasos</h3>
            <p className="text-xs text-slate-500 dark:text-[#94A3B8]">
              Completá estos pasos para dejar tu cuenta lista. Llevás {doneCount} de {steps.length}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              window.localStorage.setItem(hiddenKey(tenantId), '1');
            } catch {
              // sin almacenamiento: se vuelve a mostrar al recargar
            }
          }}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer"
          aria-label="Ocultar primeros pasos"
          title="Ocultar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-[#13264A] overflow-hidden" aria-hidden="true">
        <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
              step.done
                ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-900/20'
                : 'border-slate-200 bg-slate-50 dark:border-[#B6C2D2]/20 dark:bg-[#13264A]/40'
            }`}
          >
            {step.done ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-label="Hecho" />
            ) : (
              <Circle className="w-5 h-5 text-slate-300 shrink-0" aria-label="Pendiente" />
            )}
            <div className="min-w-0 flex-1">
              <div
                className={`text-xs font-bold ${
                  step.done ? 'text-emerald-900 dark:text-emerald-300 line-through decoration-emerald-400' : 'text-slate-900 dark:text-white'
                }`}
              >
                {step.label}
              </div>
              {!step.done && <div className="text-[11px] text-slate-500 dark:text-[#94A3B8]">{step.hint}</div>}
            </div>
            {!step.done && (
              <button
                type="button"
                onClick={step.onAction}
                className="inline-flex items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#13264A] text-white dark:bg-[#E2E8F0] dark:text-[#0B1933] cursor-pointer shrink-0"
              >
                {step.actionLabel}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};
