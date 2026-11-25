/**
 * Medios de pago que el comercio ofrece en su tienda online.
 * Si el comercio nunca los configuró (paymentMethods sin definir), se ofrecen todos,
 * como antes. Mercado Pago solo aparece si el comercio lo tiene configurado.
 */
export type CatalogPaymentOptionKey = 'transferencia' | 'mercadopago' | 'efectivo' | 'acordar';

export type CatalogPaymentOptionsConfig = Partial<Record<CatalogPaymentOptionKey, boolean>>;

export const CATALOG_PAYMENT_OPTION_KEYS: CatalogPaymentOptionKey[] = [
  'transferencia',
  'mercadopago',
  'efectivo',
  'acordar',
];

export const CATALOG_PAYMENT_OPTION_LABELS: Record<CatalogPaymentOptionKey, { title: string; hint: string }> = {
  transferencia: { title: 'Transferencia', hint: 'El comprador ve tu alias y CVU.' },
  mercadopago: { title: 'Mercado Pago', hint: 'Link de pago, dinero en cuenta o tarjetas.' },
  efectivo: { title: 'Efectivo', hint: 'Al retirar en el local o al recibir el envío.' },
  acordar: { title: 'Acordar con el vendedor', hint: 'Se coordina por WhatsApp.' },
};

export function isPaymentOptionEnabled(config: CatalogPaymentOptionsConfig | undefined, key: CatalogPaymentOptionKey): boolean {
  if (!config) return true;
  return config[key] === true;
}

/** Opciones habilitadas, en el orden en que se muestran al comprador */
export function resolveEnabledPaymentOptions(
  config: CatalogPaymentOptionsConfig | undefined,
  ctx: { mercadoPagoAvailable: boolean }
): CatalogPaymentOptionKey[] {
  return CATALOG_PAYMENT_OPTION_KEYS.filter(
    (k) => isPaymentOptionEnabled(config, k) && (k !== 'mercadopago' || ctx.mercadoPagoAvailable)
  );
}
