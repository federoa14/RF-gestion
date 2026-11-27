import React, { useState } from 'react';
import { ShoppingCart } from 'lucide-react';

interface CartContactPromptProps {
  productName: string;
  onSubmit: (data: { name: string; phone: string }) => void;
  onCancel: () => void;
}

/** Al agregar el primer producto se piden nombre y teléfono: así el carrito queda guardado y el comercio puede recordártelo. */
export const CartContactPrompt: React.FC<CartContactPromptProps> = ({ productName, onSubmit, onCancel }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Ingresá tu nombre.');
    if (phone.replace(/\D/g, '').length < 8) return setError('Ingresá un teléfono / WhatsApp válido, con el código de área.');
    setError(null);
    onSubmit({ name: name.trim(), phone: phone.trim() });
  };

  const field =
    'w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0B1933]/20';

  return (
    <div className="fixed inset-0 z-[75] bg-slate-950/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Guardar tu carrito">
      <form onSubmit={submit} className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-3.5">
        <div className="text-center space-y-1">
          <div className="mx-auto w-11 h-11 rounded-xl bg-[#0B1933] text-white flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <h2 className="text-base font-extrabold text-slate-900">Guardamos tu carrito</h2>
          <p className="text-xs text-slate-500">
            Dejanos tu nombre y teléfono para agregar <strong>{productName}</strong>. Así tu carrito queda guardado y, si te queda algo pendiente, te lo recordamos por WhatsApp.
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-700">Nombre *</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" autoFocus placeholder="Ej. Lucía" className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-700">Teléfono / WhatsApp *</span>
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} autoComplete="tel" placeholder="Ej. 11 5555 1234" className={field} />
        </label>
        {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
        <button type="submit" className="w-full py-3 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-sm font-bold cursor-pointer">
          Guardar y agregar al carrito
        </button>
        <button type="button" onClick={onCancel} className="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-50 cursor-pointer">
          Ahora no
        </button>
        <p className="text-[10px] text-slate-400 text-center">Usamos tus datos solo para tu pedido y para recordarte el carrito.</p>
      </form>
    </div>
  );
};
