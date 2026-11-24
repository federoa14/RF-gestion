import React, { useState, useEffect, useMemo } from 'react';
import { hasUsablePhone } from '../utils/whatsapp';
import {
  X,
  ArrowRight,
  Users,
  Trash2,
  CheckCircle2,
  Search,
  AlertTriangle,
  Store,
  CheckSquare,
  Square,
  RefreshCw,
} from 'lucide-react';
import { Boleta, BusinessRubro, Client, DistributorConfig } from '../types';
import { getRubroProfile } from '../utils/businessMode';
import { formatCurrency, getBoletaBalance } from '../utils/alerts';

interface RubroClientMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRubro: BusinessRubro;
  targetRubro: BusinessRubro;
  clients: Client[];
  boletas: Boleta[];
  config: DistributorConfig;
  onConfirmMigration: (params: {
    targetRubro: BusinessRubro;
    keepClientIds: string[];
    deleteClientIds: string[];
    removePendingBoletasOfDeleted: boolean;
  }) => void;
}

export const RubroClientMigrationModal: React.FC<RubroClientMigrationModalProps> = ({
  isOpen,
  onClose,
  currentRubro,
  targetRubro,
  clients,
  boletas,
  config,
  onConfirmMigration,
}) => {
  // Set of client IDs marked to be DELETED when migrating. Unchecked = kept/migrated!
  const [deleteIds, setDeleteIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [removePendingOfDeleted, setRemovePendingOfDeleted] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setDeleteIds(new Set());
      setSearchTerm('');
      setRemovePendingOfDeleted(true);
    }
  }, [isOpen, targetRubro]);

  const clientDebtMap = useMemo(() => {
    const map = new Map<string, { count: number; totalDue: number }>();
    for (const b of boletas) {
      if (b.status !== 'pending') continue;
      const prev = map.get(b.clientId) || { count: 0, totalDue: 0 };
      prev.count += 1;
      prev.totalDue += getBoletaBalance(b).balanceDue;
      map.set(b.clientId, prev);
    }
    return map;
  }, [boletas]);

  if (!isOpen) return null;

  const currentProfile = getRubroProfile(currentRubro);
  const targetProfile = getRubroProfile(targetRubro);

  const filteredClients = clients.filter((c) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
      (c.clientNumber && c.clientNumber.toLowerCase().includes(q)) ||
      (c.zone && c.zone.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  });

  const toggleDeleteClient = (clientId: string) => {
    setDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const handleSelectAllToDelete = () => {
    setDeleteIds(new Set(clients.map((c) => c.id)));
  };

  const handleKeepAllClients = () => {
    setDeleteIds(new Set());
  };

  const handleDeleteOnlyDebtFree = () => {
    const next = new Set<string>();
    for (const c of clients) {
      const debt = clientDebtMap.get(c.id);
      if (!debt || debt.totalDue <= 0) {
        next.add(c.id);
      }
    }
    setDeleteIds(next);
  };

  const handleInvertSelection = () => {
    const next = new Set<string>();
    for (const c of clients) {
      if (!deleteIds.has(c.id)) next.add(c.id);
    }
    setDeleteIds(next);
  };

  const deletedCount = deleteIds.size;
  const keptCount = Math.max(0, clients.length - deletedCount);

  let affectedPendingBoletasCount = 0;
  let affectedPendingAmount = 0;
  for (const id of deleteIds) {
    const d = clientDebtMap.get(id);
    if (d) {
      affectedPendingBoletasCount += d.count;
      affectedPendingAmount += d.totalDue;
    }
  }

  const handleConfirm = () => {
    const keepClientIds = clients.filter((c) => !deleteIds.has(c.id)).map((c) => c.id);
    const deleteClientIds = Array.from(deleteIds);
    onConfirmMigration({
      targetRubro,
      keepClientIds,
      deleteClientIds,
      removePendingBoletasOfDeleted: removePendingOfDeleted,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#0B1933] rounded-2xl shadow-2xl border border-[#CBD5E1] dark:border-[#B6C2D2]/30 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#B6C2D2]/20 bg-[#091428] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#162E59] border border-[#B6C2D2]/30 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5 text-[#E2E8F0]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Migrar Cartera de Clientes al Nuevo Rubro
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#CBD5E1] mt-0.5 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-[#13264A] font-mono text-[11px]">
                  {currentProfile.shortLabel}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-[11px]">
                  {targetProfile.shortLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-[#13264A] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Summary & Bulk Action Controls */}
        <div className="p-4 sm:px-6 border-b border-slate-200 dark:border-[#B6C2D2]/15 bg-[#F4F6F9] dark:bg-[#071021] space-y-3">
          <p className="text-xs text-slate-700 dark:text-[#CBD5E1] leading-relaxed">
            Elegí qué clientes querés <strong>mantener y transportar</strong> a{' '}
            <strong>{targetProfile.label}</strong> y cuáles preferís <strong>eliminar</strong>. Podés{' '}
            <em>seleccionar todos para eliminar y desmarcar únicamente los que van a migrar</em>, o viceversa.
          </p>

          {/* Counters + Quick Bulk Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleKeepAllClients}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#162E59] text-white dark:bg-[#E2E8F0] dark:hover:bg-white dark:text-[#091428] cursor-pointer inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Migrar Todos ({clients.length})</span>
              </button>

              <button
                type="button"
                onClick={handleSelectAllToDelete}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-rose-700 hover:bg-rose-600 text-white cursor-pointer inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Seleccionar Todos para Eliminar</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteOnlyDebtFree}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#0B1933] text-slate-700 dark:text-[#CBD5E1] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-slate-100 cursor-pointer"
                title="Mantiene los clientes que tienen deuda pendiente y marca para eliminar los que están en $0"
              >
                Eliminar solo sin deuda
              </button>

              <button
                type="button"
                onClick={handleInvertSelection}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#0B1933] text-slate-700 dark:text-[#CBD5E1] border border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:bg-slate-100 cursor-pointer inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Invertir</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
              <span className="px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold">
                Migran: {keptCount}
              </span>
              <span className="px-2 py-1 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-bold">
                Se eliminan: {deletedCount}
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente por nombre, N°, zona o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-[#CBD5E1] dark:border-[#B6C2D2]/25 bg-white dark:bg-[#0B1933] text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Client List */}
        <div className="flex-1 overflow-y-auto p-4 sm:px-6 space-y-2 bg-white dark:bg-[#0B1933]">
          {filteredClients.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-[#94A3B8]">
              No se encontraron clientes con "{searchTerm}".
            </div>
          ) : (
            filteredClients.map((client) => {
              const markedForDelete = deleteIds.has(client.id);
              const debtInfo = clientDebtMap.get(client.id);
              const hasDebt = Boolean(debtInfo && debtInfo.totalDue > 0);

              return (
                <div
                  key={client.id}
                  onClick={() => toggleDeleteClient(client.id)}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all cursor-pointer select-none ${
                    markedForDelete
                      ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/70'
                      : 'bg-[#F8FAFC] dark:bg-[#091428] border-[#CBD5E1] dark:border-[#B6C2D2]/25 hover:border-[#0B1933]/50'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`p-1 rounded-md shrink-0 mt-0.5 sm:mt-0 ${
                        markedForDelete
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {markedForDelete ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-400" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {client.clientNumber && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-[#13264A] text-slate-700 dark:text-[#CBD5E1]">
                            {client.clientNumber}
                          </span>
                        )}
                        <span
                          className={`text-xs font-bold truncate ${
                            markedForDelete
                              ? 'line-through text-rose-800 dark:text-rose-200'
                              : 'text-[#0B1933] dark:text-white'
                          }`}
                        >
                          {client.name}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-[#94A3B8]">
                          ({client.zone || 'Sin zona'})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#94A3B8] flex flex-wrap items-center gap-2 mt-0.5">
                        <span>{client.contactPerson || 'Sin titular'}</span>
                        {hasUsablePhone(client.phone) && <span className="font-mono">· {client.phone}</span>}
                        {hasDebt && debtInfo ? (
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                            · Debe {formatCurrency(debtInfo.totalDue, config.currencySymbol)} ({debtInfo.count} comp.)
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            · Sin deuda ($0)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                        markedForDelete
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-emerald-700 text-white border-emerald-700'
                      }`}
                    >
                      {markedForDelete ? 'Se Eliminará' : 'Migra al Nuevo Rubro'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer & Pending Debt Safeguard */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#B6C2D2]/20 bg-[#F4F6F9] dark:bg-[#091428] space-y-3">
          {affectedPendingBoletasCount > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={removePendingOfDeleted}
                onChange={(e) => setRemovePendingOfDeleted(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded text-amber-700 cursor-pointer"
              />
              <div className="text-amber-950 dark:text-amber-200">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Hay {affectedPendingBoletasCount} comprobante(s) pendiente(s) por{' '}
                    {formatCurrency(affectedPendingAmount, config.currencySymbol)} en los clientes marcados para eliminar.
                  </span>
                </span>
                <span className="text-[11px] opacity-85 block mt-0.5">
                  Tildado: también limpia esos comprobantes pendientes del nuevo rubro. Destildado: conserva los comprobantes en el historial pendiente.
                </span>
              </div>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-[#CBD5E1]">
              <Users className="w-4 h-4" />
              <span>
                Pasan <strong>{keptCount}</strong> cliente(s) · Se eliminan{' '}
                <strong>{deletedCount}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-[#CBD5E1] hover:bg-slate-200 dark:hover:bg-[#13264A] cursor-pointer"
              >
                Cancelar Cambio
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-5 py-2.5 rounded-xl bg-[#0B1933] hover:bg-[#162E59] dark:bg-[#E2E8F0] dark:hover:bg-white text-white dark:text-[#091428] text-xs font-black shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                <span>Confirmar Cambio a {targetProfile.shortLabel}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
