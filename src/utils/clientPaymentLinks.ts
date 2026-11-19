import { Boleta, Client, ClientPaymentOrder, DistributorConfig } from '../types';
import { getBoletaBalance } from './alerts';
import { createWhatsAppUrl, generateClientPaymentLinkWhatsAppMessage } from './whatsapp';
import { saveClientPaymentOrderEverywhere } from './supabaseServices';
import { isSupabaseConfigured } from './supabaseClient';

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

  if (!isSupabaseConfigured()) {
    throw new Error(
      'Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para generar enlaces de pago en línea.'
    );
  }

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const token = `CPAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const order: ClientPaymentOrder = {
    token,
    tenantId: config.tenantId || 'default-tenant',
    distributorName: config.distributorName || 'Comercio',
    clientId: client.id,
    clientName: client.contactPerson || client.name,
    clientPhone: client.phone || '',
    amount: Math.round(Number(amount) * 100) / 100,
    currencySymbol: config.currencySymbol || '$',
    boletaIds: sorted.map((b) => b.id),
    boletaNumbers: sorted.map((b) => b.boletaNumber),
    alias: String(config.merchantPaymentAlias || '').trim(),
    cvu: String(config.merchantPaymentCvu || '').trim(),
    holderName: String(config.merchantPaymentHolder || config.distributorName || '').trim(),
    bankName: String(config.merchantPaymentBank || 'Mercado Pago').trim(),
    mpCheckoutLink: String(config.merchantMpCheckoutLink || '').trim(),
    status: 'pending',
    reconciledInApp: false,
    createdAt: new Date().toISOString(),
  };

  await saveClientPaymentOrderEverywhere(order);
  const payUrl = `${originUrl}/?pay_client=${encodeURIComponent(token)}`;
  return {
    token,
    payUrl,
    order,
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
