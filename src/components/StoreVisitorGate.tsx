import React, { useState } from 'react';
import { Gift, ShoppingBag } from 'lucide-react';

export interface StoreVisitorData {
  name: string;
  phone: string;
  dni: string;
  address: string;
  joinClub: boolean;
}

interface StoreVisitorGateProps {
  storeName: string;
  /** Mensaje corto con lo que gana quien se registra. */
  perks: string;
  onSubmit: (data: StoreVisitorData) => void;
  onSkip: () => void;
}

/**
 * Bienvenida de la tienda: entrar es libre. Quien quiere sumar puntos y recibir ofertas deja
 * nombre, DNI y teléfono: los puntos quedan registrados a su DNI y el comercio puede avisarle
 * (carrito pendiente, producto que vuelve a tener stock).
 */
export const StoreVisitorGate: React.FC<StoreVisitorGateProps> = ({ storeName, perks, onSubmit, onSkip }) => {
  const [join, setJoin] = useState(false);
  const [name, setName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!join) {
      onSkip();
      return;
    }
    const cleanName = name.trim();
    const dniDigits = dni.replace(/\D/g, '');
    if (cleanName.length < 2) return setError('Ingresá tu nombre.');
    if (dniDigits.length < 7 || dniDigits.length > 11) return setError('Ingresá tu DNI, solo números. Es donde se guardan tus puntos.');
    if (phone.replace(/\D/g, '').length < 8) return setError('Ingresá un teléfono / WhatsApp válido, con el código de área.');
    setError(null);
    onSubmit({ name: cleanName, phone: phone.trim(), dni: dniDigits, address: '', joinClub: true });
  };

  const field =
    'w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1933]/20';

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a la tienda"
    >
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3.5 max-h-[94vh] overflow-y-auto">
        <div className="text-center space-y-1">
          <div className="mx-auto w-11 h-11 rounded-xl bg-[#0B1933] text-white flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900">¡Bienvenido a {storeName}!</h2>
          <p className="text-xs text-slate-500">Mirá los productos y comprá cuando quieras: no hace falta registrarse.</p>
        </div>

        <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-950 cursor-pointer">
          <input type="checkbox" checked={join} onChange={(e) => setJoin(e.target.checked)} className="mt-0.5 w-4 h-4" />
          <span>
            <span className="font-bold flex items-center gap-1">
              <Gift className="w-3.5 h-3.5" /> Quiero sumar puntos y recibir ofertas
            </span>
            <span className="block text-amber-900/90 mt-0.5">{perks}</span>
          </span>
        </label>

        {join && (
          <div className="space-y-3.5">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Nombre *</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" placeholder="Ej. Lucía" className={field} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">DNI * (en tu DNI se guardan tus puntos)</span>
              <input type="text" inputMode="numeric" value={dni} onChange={(e) => setDni(e.target.value)} maxLength={12} autoComplete="off" placeholder="Solo números" className={field} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-slate-700">Teléfono / WhatsApp *</span>
              <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="tel" placeholder="Ej. 11 5555 1234" className={field} />
            </label>
            {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          </div>
        )}

        <button type="submit" className="w-full py-3 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-sm font-bold cursor-pointer">
          {join ? 'Sumarme y entrar' : 'Entrar a la tienda'}
        </button>
        {join && (
          <button type="button" onClick={onSkip} className="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-50 cursor-pointer">
            Mejor entro sin registrarme
          </button>
        )}
        {join && (
          <p className="text-[10px] text-slate-400 text-center">
            Usamos tus datos solo para tus puntos, tus pedidos y avisarte. Podés pedirnos que los borremos cuando quieras.
          </p>
        )}
      </form>
    </div>
  );
};
