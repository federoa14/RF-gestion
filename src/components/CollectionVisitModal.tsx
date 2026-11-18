import React, { useEffect, useState } from 'react';
import {
  X,
  CalendarClock,
  Store,
  Clock,
  UserX,
  MessageCircle,
  CheckCircle2,
  RotateCcw,
  History,
} from 'lucide-react';
import { Boleta, CollectionVisitStatus, DistributorConfig } from '../types';
import { addDaysToDate, formatCurrency, formatDateEs, getBoletaBalance } from '../utils/alerts';

export function getVisitOutcomeMeta(outcome: CollectionVisitStatus): {
  label: string;
  shortLabel: string;
  badgeClass: string;
} {
  switch (outcome) {
    case 'promesa_pago':
      return {
        label: 'Promesa de pago',
        shortLabel: 'Promesa',
        badgeClass:
          'bg-[#13264A] text-white border-[#B6C2D2]/30 dark:bg-[#E2E8F0] dark:text-[#091428]',
      };
    case 'pasar_mas_tarde':
      return {
        label: 'Pasar más tarde (hoy)',
        shortLabel: 'Pasar más tarde',
        badgeClass:
          'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-700/60',
      };
    case 'local_cerrado':
      return {
        label: 'Local cerrado',
        shortLabel: 'Local cerrado',
        badgeClass:
          'bg-slate-100 text-slate-700 border-slate-300 dark:bg-[#13264A] dark:text-[#CBD5E1] dark:border-[#B6C2D2]/25',
      };
    case 'no_estaba':
      return {
        label: 'No estaba / Ausente',
        shortLabel: 'No estaba',
        badgeClass:
          'bg-slate-100 text-slate-700 border-slate-300 dark:bg-[#13264A] dark:text-[#CBD5E1] dark:border-[#B6C2D2]/25',
      };
    case 'reprogramado_whatsapp':
      return {
        label: 'Reprogramado por WhatsApp',
        shortLabel: 'Reprog. WA',
        badgeClass:
          'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700/60',
      };
  }
}

interface CollectionVisitModalProps {
  isOpen: boolean;
  onClose: () => void;
  boleta: Boleta | null;
  config: DistributorConfig;
  currentDateRef: string;
  activeUserName: string;
  onSaveVisit: (params: {
    boletaId: string;
    outcome: CollectionVisitStatus;
    promisedDate?: string;
    note?: string;
  }) => void;
  onClearPromise?: (boletaId: string) => void;
}

export const CollectionVisitModal: React.FC<CollectionVisitModalProps> = ({
  isOpen,
  onClose,
  boleta,
  config,
  currentDateRef,
  activeUserName,
  onSaveVisit,
  onClearPromise,
}) => {
  const [outcome, setOutcome] = useState<CollectionVisitStatus>('promesa_pago');
  const [promisedDate, setPromisedDate] = useState<string>('');
  const [rescheduleClosedTomorrow, setRescheduleClosedTomorrow] = useState<boolean>(true);
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen && boleta) {
      setOutcome('promesa_pago');
      setPromisedDate(addDaysToDate(currentDateRef, 1));
      setRescheduleClosedTomorrow(true);
      setNote('');
      setErrorMsg('');
    }
  }, [isOpen, boleta, currentDateRef]);

  if (!isOpen || !boleta) return null;

  const bal = getBoletaBalance(boleta);
  const sym = config.currencySymbol || '$';
  const needsDatePicker = outcome === 'promesa_pago' || outcome === 'reprogramado_whatsapp';
  const canMoveTomorrow = outcome === 'local_cerrado' || outcome === 'no_estaba';

  const quickDatePresets = [
    { label: 'Mañana (+1d)', date: addDaysToDate(currentDateRef, 1) },
    { label: 'En 2 días', date: addDaysToDate(currentDateRef, 2) },
    { label: 'En 3 días', date: addDaysToDate(currentDateRef, 3) },
    { label: 'En 5 días', date: addDaysToDate(currentDateRef, 5) },
    { label: 'En 7 días', date: addDaysToDate(currentDateRef, 7) },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    let targetPromisedDate: string | undefined;

    if (needsDatePicker) {
      if (!promisedDate) {
        setErrorMsg('Seleccioná la fecha prometida de pago.');
        return;
      }
      targetPromisedDate = promisedDate;
    } else if (outcome === 'pasar_mas_tarde') {
      targetPromisedDate = currentDateRef;
    } else if (canMoveTomorrow) {
      targetPromisedDate = rescheduleClosedTomorrow
        ? addDaysToDate(currentDateRef, 1)
        : currentDateRef;
    }

    onSaveVisit({
      boletaId: boleta.id,
      outcome,
      promisedDate: targetPromisedDate,
      note: note.trim() || undefined,
    });
    onClose();
  };

  const sortedHistory = [...(boleta.visitLogs || [])].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050C18]/75 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#0B1933] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0B1933] text-white border-b border-[#B6C2D2]/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[#162E59] border border-[#B6C2D2]/25 shrink-0">
              <CalendarClock className="w-4 h-4 text-[#E2E8F0]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">
                Registrar Visita o Promesa de Pago
              </h3>
              <p className="text-[11px] text-[#CBD5E1] truncate tabular-nums">
                Boleta #{boleta.boletaNumber} · {boleta.clientName} · Saldo:{' '}
                {formatCurrency(bal.balanceDue, sym)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#162E59] transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {/* Active Promise Banner if any */}
          {boleta.promisedPaymentDate && (
            <div className="p-3 rounded-xl bg-[#F4F6F9] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 flex items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-[#0B1933] dark:text-white block">
                  Reprogramada actualmente para: {formatDateEs(boleta.promisedPaymentDate)}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                  Vencimiento original real: {formatDateEs(boleta.dueDate)} (no se altera la mora)
                </span>
              </div>
              {onClearPromise && (
                <button
                  type="button"
                  onClick={() => {
                    onClearPromise(boleta.id);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#13264A] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 text-[11px] font-semibold text-[#0B1933] dark:text-[#E2E8F0] hover:bg-slate-100 dark:hover:bg-[#1B3566] cursor-pointer shrink-0"
                  title="Volver al vencimiento original en la Agenda"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Volver al orig.</span>
                </button>
              )}
            </div>
          )}

          {/* Outcome Options Grid */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0B1933] dark:text-[#E2E8F0]">
              ¿Qué ocurrió al pasar o contactar al cliente?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutcome('promesa_pago')}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  outcome === 'promesa_pago'
                    ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#162E59] dark:border-[#CBD5E1]/50'
                    : 'bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50'
                }`}
              >
                <CalendarClock className="w-4 h-4 shrink-0" />
                <div>
                  <span className="block text-xs font-bold">Promete pagar otro día</span>
                  <span className="block text-[10px] opacity-80">Reagenda sin borrar mora</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('pasar_mas_tarde')}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  outcome === 'pasar_mas_tarde'
                    ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#162E59] dark:border-[#CBD5E1]/50'
                    : 'bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0" />
                <div>
                  <span className="block text-xs font-bold">Pasar más tarde (hoy)</span>
                  <span className="block text-[10px] opacity-80">Deja registro del intento</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('local_cerrado')}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  outcome === 'local_cerrado'
                    ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#162E59] dark:border-[#CBD5E1]/50'
                    : 'bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50'
                }`}
              >
                <Store className="w-4 h-4 shrink-0" />
                <div>
                  <span className="block text-xs font-bold">Local cerrado</span>
                  <span className="block text-[10px] opacity-80">Acredita que se visitó</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('no_estaba')}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  outcome === 'no_estaba'
                    ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#162E59] dark:border-[#CBD5E1]/50'
                    : 'bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50'
                }`}
              >
                <UserX className="w-4 h-4 shrink-0" />
                <div>
                  <span className="block text-xs font-bold">No estaba el titular</span>
                  <span className="block text-[10px] opacity-80">Sin responsable presente</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOutcome('reprogramado_whatsapp')}
                className={`sm:col-span-2 flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  outcome === 'reprogramado_whatsapp'
                    ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#162E59] dark:border-[#CBD5E1]/50'
                    : 'bg-white dark:bg-[#091428] text-[#0B1933] dark:text-[#E2E8F0] border-[#CBD5E1] dark:border-[#B6C2D2]/20 hover:border-[#0B1933]/50'
                }`}
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <div>
                  <span className="block text-xs font-bold">Avisó por WhatsApp cuándo paga</span>
                  <span className="block text-[10px] opacity-80">
                    Agendar nueva fecha pactada por mensaje
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Date Selection for Promises / WhatsApp */}
          {needsDatePicker && (
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 space-y-2.5">
              <label className="block text-xs font-bold text-[#0B1933] dark:text-[#E2E8F0]">
                Fecha prometida de pago
              </label>
              <div className="flex flex-wrap gap-1.5">
                {quickDatePresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setPromisedDate(preset.date)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                      promisedDate === preset.date
                        ? 'bg-[#0B1933] text-white border-[#0B1933] dark:bg-[#E2E8F0] dark:text-[#091428]'
                        : 'bg-white dark:bg-[#13264A] text-[#0B1933] dark:text-[#CBD5E1] border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={promisedDate}
                  min={currentDateRef}
                  onChange={(e) => setPromisedDate(e.target.value)}
                  className="text-xs px-3 py-2 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] text-[#0B1933] dark:text-white font-mono tabular-nums"
                />
                <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                  La Agenda Rápida moverá esta boleta al tramo correspondiente sin alterar la mora real.
                </span>
              </div>
            </div>
          )}

          {/* Option for Local Cerrado / No estaba */}
          {canMoveTomorrow && (
            <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#091428] border border-[#CBD5E1] dark:border-[#B6C2D2]/20 flex items-center justify-between gap-3">
              <div className="text-xs">
                <span className="font-bold text-[#0B1933] dark:text-white block">
                  ¿Reagendar automáticamente para mañana?
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#94A3B8] tabular-nums">
                  {rescheduleClosedTomorrow
                    ? `Pasará a En 3 Días (${formatDateEs(addDaysToDate(currentDateRef, 1))})`
                    : 'Seguirá visible hoy en Para Cobrar Hoy'}
                </span>
              </div>
              <div className="inline-flex rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#071021] p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setRescheduleClosedTomorrow(true)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    rescheduleClosedTomorrow
                      ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                      : 'text-slate-500 dark:text-[#94A3B8]'
                  }`}
                >
                  Sí, mañana
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleClosedTomorrow(false)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer ${
                    !rescheduleClosedTomorrow
                      ? 'bg-[#0B1933] text-white dark:bg-[#E2E8F0] dark:text-[#091428]'
                      : 'text-slate-500 dark:text-[#94A3B8]'
                  }`}
                >
                  Dejar hoy
                </button>
              </div>
            </div>
          )}

          {/* Note */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#0B1933] dark:text-[#E2E8F0]">
              Observación de la visita (opcional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Atendió encargado, pidió pasar el viernes a las 16 hs..."
              className="w-full text-xs px-3 py-2.5 rounded-lg border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-[#F8FAFC] dark:bg-[#071021] text-[#0B1933] dark:text-white placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#162E59]"
            />
          </div>

          {errorMsg && (
            <p className="text-xs font-semibold text-[#991B1B] dark:text-rose-400">{errorMsg}</p>
          )}

          {/* History Log inside Modal */}
          {sortedHistory.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-[#B6C2D2]/15 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-[#CBD5E1]">
                <History className="w-3.5 h-3.5" />
                <span>Historial de gestiones ({sortedHistory.length})</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {sortedHistory.map((log) => {
                  const meta = getVisitOutcomeMeta(log.outcome);
                  return (
                    <div
                      key={log.id}
                      className="p-2 rounded-lg bg-[#F8FAFC] dark:bg-[#091428] border border-slate-200 dark:border-[#B6C2D2]/15 text-[11px] flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${meta.badgeClass}`}>
                            {meta.label}
                          </span>
                          {log.promisedDate && (
                            <span className="font-mono text-[10px] font-semibold text-[#0B1933] dark:text-[#E2E8F0] tabular-nums">
                              → Para el {formatDateEs(log.promisedDate)}
                            </span>
                          )}
                        </div>
                        {log.note && (
                          <p className="text-slate-600 dark:text-[#94A3B8] mt-1">{log.note}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 text-[10px] text-slate-500 dark:text-[#8D9CB0] tabular-nums">
                        <div>{formatDateEs(log.date)}</div>
                        <div>{log.recordedBy}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-200 dark:border-[#B6C2D2]/15">
            <span className="text-[11px] text-slate-500 dark:text-[#8D9CB0]">
              Registra: <strong className="text-[#0B1933] dark:text-[#CBD5E1]">{activeUserName}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-100 dark:hover:bg-[#13264A] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-bold transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Guardar Gestión</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
