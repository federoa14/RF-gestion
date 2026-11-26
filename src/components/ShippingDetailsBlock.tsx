import React, { useState } from 'react';
import { Check, Copy, Package } from 'lucide-react';
import type { CatalogPickupOrder } from '../types';
import { formatShippingBlock } from '../utils/nationalShipping';

/** Datos completos de un envío a todo el país, con botón para copiarlos (por ejemplo, para cargar la etiqueta del correo). */
export const ShippingDetailsBlock: React.FC<{ order: CatalogPickupOrder }> = ({ order }) => {
  const [copied, setCopied] = useState(false);
  if (order.deliveryScope !== 'nacional' || !order.shippingDetails) return null;
  const text = formatShippingBlock(order.shippingDetails);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copiá los datos de envío:', text);
    }
  };
  return (
    <div className="mt-2 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-xs space-y-1.5" aria-label="Datos de envío a todo el país">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-indigo-900 inline-flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5" />
          Envío a todo el país
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-indigo-200 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-100 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiado' : 'Copiar datos'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-slate-800">{text}</pre>
    </div>
  );
};
