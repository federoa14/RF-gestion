import React, { useState } from 'react';
import {
  Bike,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Cake,
  Edit2,
  Trash2,
  DollarSign,
  MessageCircle,
  X,
  CheckCircle,
  Home,
  User,
} from 'lucide-react';
import { Salesperson, Boleta, DistributorConfig } from '../types';
import { formatCurrency, formatDateEs } from '../utils/alerts';
import { createWhatsAppUrl } from '../utils/whatsapp';

interface SalespeopleManagerProps {
  salespeople: Salesperson[];
  boletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  onSaveSalesperson: (seller: Salesperson) => void;
  onDeleteSalesperson: (sellerId: string) => void;
}

export const SalespeopleManager: React.FC<SalespeopleManagerProps> = ({
  salespeople,
  boletas,
  paidBoletas,
  config,
  onSaveSalesperson,
  onDeleteSalesperson,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingSeller, setEditingSeller] = useState<Partial<Salesperson> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Helper to compute age
  const calculateAge = (birthDateStr?: string) => {
    if (!birthDateStr) return null;
    const birth = new Date(birthDateStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // Compute pending debt and collected total per salesperson
  const sellerStats = salespeople.map((s) => {
    const pendingBoletas = boletas.filter(
      (b) => b.salespersonId === s.id && b.status === 'pending'
    );
    const settledBoletas = paidBoletas.filter((b) => b.salespersonId === s.id);

    const pendingAmount = pendingBoletas.reduce((acc, b) => acc + (b.amount || 0), 0);
    const collectedAmount = settledBoletas.reduce((acc, b) => acc + (b.amount || 0), 0);

    return {
      seller: s,
      pendingCount: pendingBoletas.length,
      pendingAmount,
      collectedCount: settledBoletas.length,
      collectedAmount,
      age: calculateAge(s.birthDate),
    };
  });

  const handleOpenNew = () => {
    setEditingSeller({
      id: `ven-${Date.now()}`,
      name: '',
      phone: '',
      email: '',
      address: '',
      birthDate: '',
      zone: '',
      active: true,
    });
    setIsEditing(true);
  };

  const handleOpenEdit = (s: Salesperson) => {
    setEditingSeller({ ...s });
    setIsEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeller || !editingSeller.name) return;

    onSaveSalesperson(editingSeller as Salesperson);
    setIsEditing(false);
    setEditingSeller(null);
  };

  const handleSendDailyRouteWhatsApp = (seller: Salesperson) => {
    const sellerBoletas = boletas.filter(
      (b) => b.salespersonId === seller.id && b.status === 'pending'
    );
    if (sellerBoletas.length === 0) return;

    const totalToCollect = sellerBoletas.reduce((acc, b) => {
      const partialTotal = (b.partialPayments || []).reduce((pAcc, p) => pAcc + (p.amount || 0), 0);
      return acc + Math.max(0, b.amount - partialTotal);
    }, 0);

    let message = `📋 *HOJA DE RUTA DE COBRANZAS DEL DÍA* 📋\n`;
    message += `🏢 *${config.distributorName}*\n`;
    message += `👤 Vendedor: *${seller.name}*\n`;
    message += `📅 Fecha: *${new Date().toLocaleDateString('es-AR')}*\n`;
    message += `💰 *Total a recaudar en calle:* $ ${totalToCollect.toLocaleString('es-AR')} (${sellerBoletas.length} boletas)\n\n`;
    message += `📍 *Clientes a visitar hoy:*\n`;

    sellerBoletas.forEach((b, idx) => {
      const partialTotal = (b.partialPayments || []).reduce((pAcc, p) => pAcc + (p.amount || 0), 0);
      const balance = Math.max(0, b.amount - partialTotal);
      message += `\n*${idx + 1}. ${b.clientName}*\n`;
      message += `   • Boleta: #${b.boletaNumber}\n`;
      message += `   • Saldo: $ ${balance.toLocaleString('es-AR')}\n`;
      if (b.clientAddress) message += `   • Dirección: ${b.clientAddress}\n`;
      if (b.clientPhone) message += `   • Teléfono: ${b.clientPhone}\n`;
      message += `   • Vencimiento: ${formatDateEs(b.dueDate)}\n`;
    });

    message += `\n⚠️ _Por favor confirmá la rendición al regresar a la distribuidora._`;

    const url = createWhatsAppUrl(seller.phone || '', message);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bike className="w-5 h-5 text-indigo-600" />
            <span>Gestión de Vendedores & Cobradores</span>
          </h2>
          <p className="text-xs text-slate-500">
            Ficha completa con teléfono, mail, nombre, dirección particular y fecha de nacimiento. Agrega o quita vendedores del equipo.
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Agregar Vendedor</span>
        </button>
      </div>

      {/* Grid of Salespeople */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {sellerStats.map(({ seller, pendingCount, pendingAmount, collectedCount, collectedAmount, age }) => (
          <div
            key={seller.id}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
          >
            <div>
              {/* Header card with name & actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800 flex items-center justify-center font-bold text-base shadow-2xs">
                    {seller.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight">
                      {seller.name}
                    </h3>
                    <span className="inline-block text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded mt-0.5">
                      {seller.zone || 'Sin zona asignada'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(seller)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Editar vendedor"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {confirmDeleteId === seller.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteSalesperson(seller.id);
                          setConfirmDeleteId(null);
                        }}
                        className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-1.5 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold cursor-pointer"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(seller.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Quitar vendedor del sistema"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Full Details List: Address, BirthDate, Phone, Mail */}
              <div className="space-y-2 mt-4 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                {/* Home Address */}
                <div className="flex items-start gap-2">
                  <Home className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">Dirección donde vive:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {seller.address || 'No informada'}
                    </span>
                  </div>
                </div>

                {/* BirthDate */}
                <div className="flex items-start gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                  <Cake className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-semibold">Fecha de Nacimiento:</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {seller.birthDate ? `${formatDateEs(seller.birthDate)} ${age ? `(${age} años)` : ''}` : 'No informada'}
                    </span>
                  </div>
                </div>

                {/* Phone / WhatsApp */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {seller.phone || 'Sin WhatsApp'}
                    </span>
                  </div>
                  {seller.phone && (
                    <a
                      href={createWhatsAppUrl(
                        seller.phone,
                        `Hola ${seller.name}, te escribo desde la administración de ${config.distributorName}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:text-emerald-500 font-bold text-[11px] flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>

                {/* Email */}
                {seller.email && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200/50 dark:border-slate-700/50 truncate">
                    <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{seller.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Financial Street Debt & Performance */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Boletas activas a cobrar:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {pendingCount} boletas
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Monto total en la calle:</span>
                <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                  {formatCurrency(pendingAmount, config.currencySymbol)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-dashed border-slate-100 dark:border-slate-800">
                <span>Total histórico rendido:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(collectedAmount, config.currencySymbol)}
                </span>
              </div>

              {pendingCount > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleSendDailyRouteWhatsApp(seller)}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
                    title="Enviar por WhatsApp la lista ordenada de boletas y clientes a cobrar hoy"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Enviar Hoja de Ruta ({pendingCount} cobros)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Edit / New Seller Modal */}
      {isEditing && editingSeller && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  {editingSeller.name ? 'Editar Vendedor' : 'Agregar Nuevo Vendedor'}
                </h3>
                <p className="text-xs text-slate-500">
                  Registra todos los datos personales y de contacto requeridos
                </p>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3.5">
              {/* Nombre completo */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Nombre Completo:
                </label>
                <input
                  type="text"
                  placeholder="Ej. Carlos Alberto Méndez"
                  value={editingSeller.name || ''}
                  onChange={(e) => setEditingSeller({ ...editingSeller, name: e.target.value })}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  required
                />
              </div>

              {/* Teléfono & Mail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Teléfono / WhatsApp (+54 9 ...):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. +54 9 11 4589-1020"
                    value={editingSeller.phone || ''}
                    onChange={(e) => setEditingSeller({ ...editingSeller, phone: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Correo Electrónico:
                  </label>
                  <input
                    type="email"
                    placeholder="vendedor@distribuidora.com"
                    value={editingSeller.email || ''}
                    onChange={(e) => setEditingSeller({ ...editingSeller, email: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Dirección donde vive */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Dirección donde vive (residencia personal):
                </label>
                <input
                  type="text"
                  placeholder="Ej. Av. Corrientes 3420, Piso 3 Dpto B, Almagro"
                  value={editingSeller.address || ''}
                  onChange={(e) =>
                    setEditingSeller({ ...editingSeller, address: e.target.value })
                  }
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  required
                />
              </div>

              {/* Fecha de nacimiento & Zona */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Fecha de Nacimiento:
                  </label>
                  <input
                    type="date"
                    value={editingSeller.birthDate || ''}
                    onChange={(e) =>
                      setEditingSeller({ ...editingSeller, birthDate: e.target.value })
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Zona / Recorrido Asignado:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Zona Centro, Zona Norte"
                    value={editingSeller.zone || ''}
                    onChange={(e) => setEditingSeller({ ...editingSeller, zone: e.target.value })}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm"
                >
                  Guardar Vendedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
