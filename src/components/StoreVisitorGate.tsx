import React, { useState } from 'react';
import { ShoppingBag } from 'lucide-react';

export interface StoreVisitorData {
  name: string;
  phone: string;
  address: string;
  joinClub: boolean;
}

interface StoreVisitorGateProps {
  storeName: string;
  askAddress: boolean;
  offerClub: boolean;
  onSubmit: (data: StoreVisitorData) => void;
}

/**
 * Pantalla de bienvenida de la tienda: antes de ver el catálogo se piden nombre y teléfono
 * (y dirección si hay envío). Sirve para guardar el carrito y recordarlo por WhatsApp,
 * y para registrar al cliente en el club cuando el comercio lo tiene habilitado.
 */
export const StoreVisitorGate: React.FC<StoreVisitorGateProps> = ({ storeName, askAddress, offerClub, onSubmit }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [joinClub, setJoinClub] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const digits = phone.replace(/\D/g, '');
    if (cleanName.length < 2) {
      setError('Ingresá tu nombre.');
      return;
    }
    if (digits.length < 8) {
      setError('Ingresá un teléfono / WhatsApp válido, con el código de área.');
      return;
    }
    setError(null);
    onSubmit({ name: cleanName, phone: phone.trim(), address: address.trim(), joinClub });
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
          <p className="text-xs text-slate-500">
            Dejanos tus datos para entrar a la tienda. Así te guardamos el carrito y te avisamos por WhatsApp si te
            queda algo pendiente.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-700">Nombre *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="given-name"
            placeholder="Ej. Lucía"
            className={field}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-700">Teléfono / WhatsApp *</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            autoComplete="tel"
            placeholder="Ej. 11 5555 1234"
            className={field}
          />
        </label>
        {askAddress && (
          <label className="block space-y-1">
            <span className="text-xs font-bold text-slate-700">Dirección (opcional, para envíos)</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={120}
              autoComplete="street-address"
              placeholder="Calle, número y localidad"
              className={field}
            />
          </label>
        )}
        {offerClub && (
          <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={joinClub}
              onChange={(e) => setJoinClub(e.target.checked)}
              className="mt-0.5 w-4 h-4"
            />
            <span>Quiero sumarme al club: recibir ofertas y acumular puntos.</span>
          </label>
        )}

        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

        <button
          type="submit"
          className="w-full py-3 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-sm font-bold cursor-pointer"
        >
          Entrar a la tienda
        </button>
        <p className="text-[10px] text-slate-400 text-center">
          Usamos tus datos solo para tu pedido y para recordarte el carrito. Podés pedirnos que los borremos cuando
          quieras.
        </p>
      </form>
    </div>
  );
};
