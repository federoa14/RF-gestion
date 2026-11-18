import { Boleta, Client, ClientPaymentOrder, DistributorConfig } from '../types';
import { getBoletaBalance } from './alerts';
import { createWhatsAppUrl, generateClientPaymentLinkWhatsAppMessage } from './whatsapp';

export interface CreateClientPaymentLinkResult {
  token: string;
  payUrl: string;
  order: ClientPaymentOrder;
}

export async function createClientPaymentLink(params: {
  client: Client;
  pendingBoletas: Boleta[];
  config: DistributorConfig;
  customAmount?: number;
}): Promise<CreateClientPaymentLinkResult> {
  const { client, pendingBoletas, config, customAmount } = params;
  const sorted = [...pendingBoletas]
    .filter((b) => b.clientId === client.id && b.status === 'pending')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const calculatedTotal = sorted.reduce(
    (sum, b) => sum + getBoletaBalance(b).balanceDue,
    0
  );
  const amount = customAmount && customAmount > 0 ? customAmount : calculatedTotal;

  if (amount <= 0) {
    throw new Error('Este cliente no tiene saldo pendiente para generar un link de pago.');
  }

  const res = await fetch('/api/client-payments/create-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: config.tenantId || 'default-tenant',
      distributorName: config.distributorName || 'Comercio',
      clientId: client.id,
      clientName: client.contactPerson || client.name,
      clientPhone: client.phone || '',
      amount,
      currencySymbol: config.currencySymbol || '$',
      boletaIds: sorted.map((b) => b.id),
      boletaNumbers: sorted.map((b) => b.boletaNumber),
      alias: config.merchantPaymentAlias || '',
      cvu: config.merchantPaymentCvu || '',
      holderName: config.merchantPaymentHolder || config.distributorName || '',
      bankName: config.merchantPaymentBank || 'Mercado Pago',
      mpCheckoutLink: config.merchantMpCheckoutLink || '',
      merchantMpAccessToken: config.merchantMpAccessToken || '',
      originUrl: typeof window !== 'undefined' ? window.location.origin : '',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'No se pudo generar el link de pago.');
  }

  return {
    token: data.token,
    payUrl: data.payUrl,
    order: data.order,
  };
}

export function buildClientPaymentWhatsAppHref(params: {
  phone: string;
  client: Client;
  order: ClientPaymentOrder;
  payUrl: string;
  config: DistributorConfig;
}): string {
  const msg = generateClientPaymentLinkWhatsAppMessage({
    clientName: params.client.contactPerson || params.client.name,
    distributorName: params.config.distributorName,
    amount: params.order.amount,
    currencySymbol: params.config.currencySymbol,
    boletaNumbers: params.order.boletaNumbers || [],
    payUrl: params.payUrl,
    mpInitPoint: params.order.mpInitPoint,
    mpCheckoutLink: params.order.mpCheckoutLink,
    alias: params.order.alias,
    cvu: params.order.cvu,
    holderName: params.order.holderName,
  });
  return createWhatsAppUrl(params.phone, msg);
}
