import React, { useState } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  History,
  ArrowRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Boleta, DistributorConfig } from '../types';
import { addDaysToDate, formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';

interface ExtendBoletaModalProps {
  isOpen: boolean;
  onClose: () => void;
  boleta: Boleta | null;
  config: DistributorConfig;
  onExtend: (boletaId: string, addedDays: number, reason?: string) => void;
}

export const ExtendBoletaModal: React.FC<ExtendBoletaModalProps> = ({
  isOpen,
  onClose,
  boleta,
  config,
  onExtend,
}) => {
  const defaultDays = config.defaultExtensionDays || 3;
  const [addedDays, setAddedDays] = useState<number>(defaultDays);
  const [customDaysInput, setCustomDaysInput] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  if (!isOpen || !boleta) return null;

  const balance = getBoletaBalance(boleta);
  const currentDueDate = boleta.dueDate;
  const newCalculatedDueDate = addDaysToDate(currentDueDate, addedDays);

  const handleQuickSelect = (days: number) => {
    setAddedDays(days);
    setCustomDaysInput('');
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomDaysInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) {
      setAddedDays(num);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addedDays <= 0) return;
    onExtend(boleta.id, addedDays, reason.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Prorrogar Boleta #{boleta.boletaNumber}
              </h3>
              <p className="text-xs text-slate-500">
                Extiende el plazo de vencimiento para otorgar más días de cobro al cliente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
          >
            ✕
          </button>
        </div>

        {/* Client & Debt Info */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Cliente:</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {boleta.clientName}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Saldo pendiente de cobro:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
              {formatCurrency(balance.balanceDue, config.currencySymbol)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Fecha de venta original:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {formatDateEs(boleta.saleDate)}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
            <span className="text-slate-500">Vencimiento actual:</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">
              {formatDateEs(currentDueDate)}
            </span>
          </div>
          {boleta.extensionDays && boleta.extensionDays > 0 ? (
            <div className="flex items-center justify-between text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
              <span>Prórrogas anteriores acumuladas:</span>
              <span>+{boleta.extensionDays} días concedidos</span>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick Extension Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
              Seleccionar Días de Prórroga a Sumar:
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2.5">
              {[3, 5, 7, 10].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => handleQuickSelect(days)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    addedDays === days && !customDaysInput
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/20'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                  }`}
                >
                  +{days} Días
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">O ingresar otra cantidad:</span>
              <input
                type="number" inputMode="decimal"
                min="1"
                max="90"
                placeholder="Ej. 15"
                value={customDaysInput}
                onChange={handleCustomChange}
                className="w-24 text-xs font-bold p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-center"
              />
              <span className="text-xs text-slate-500">días adicionales</span>
            </div>
          </div>

          {/* Real-time comparison preview */}
          <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 block">
              Efecto Inmediato en el Sistema:
            </span>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-500">Fecha actual: {formatDateEs(currentDueDate)}</span>
              <ArrowRight className="w-4 h-4 text-indigo-500" />
              <span className="text-indigo-700 dark:text-indigo-300 font-bold font-mono">
                Nuevo Vencimiento: {formatDateEs(newCalculatedDueDate)}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              ✨ Al confirmar la prórroga de <strong>+{addedDays} días</strong>, la boleta saldrá del estado de vencido crítico (color rojo) y volverá a figurar con estado <strong>"⏱️ Prorrogada"</strong> hasta la nueva fecha límite.
            </p>
          </div>

          {/* Reason / Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Motivo o Detalle de la Prórroga (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ej. Cliente pidió esperar al viernes para cancelar en efectivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Extension History if any */}
          {boleta.extensions && boleta.extensions.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mb-1.5">
                <History className="w-3.5 h-3.5" />
                <span>Historial de prórrogas anteriores:</span>
              </span>
              <div className="space-y-1 max-h-24 overflow-y-auto text-[11px] text-slate-500">
                {boleta.extensions.map((ext, idx) => (
                  <div key={ext.id || idx} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded">
                    <span>+{ext.addedDays} días ({ext.reason || 'Prórroga'})</span>
                    <span className="font-mono text-[10px]">{formatDateEs(ext.newDueDate)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar Prórroga (+{addedDays} Días)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
