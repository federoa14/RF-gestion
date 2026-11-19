import { Boleta, Client, ClientPaymentOrder, DistributorConfig } from '../types';
import { getBoletaBalance } from './alerts';
import { createWhatsAppUrl, generateClientPaymentLinkWhatsAppMessage } from './whatsapp';
import { saveClientPaymentOrderToSupabase } from './supabaseSync';
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

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const payload = {
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
    originUrl,
  };

  try {
    const res = await fetch('/api/client-payments/create-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.order) {
        await saveClientPaymentOrderToSupabase(data.order);
        return {
          token: data.token,
          payUrl: data.payUrl,
          order: data.order,
        };
      }
    }
  } catch {
    // Fallback to Supabase direct creation when backend route is unavailable
  }

  if (!isSupabaseConfigured()) {
    throw new Error('No se pudo generar el link de pago.');
  }

  const fallbackToken = `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const fallbackOrder: ClientPaymentOrder = {
    token: fallbackToken,
    tenantId: payload.tenantId,
    distributorName: payload.distributorName,
    clientId: payload.clientId,
    clientName: payload.clientName,
    clientPhone: payload.clientPhone,
    amount: payload.amount,
    currencySymbol: payload.currencySymbol,
    boletaIds: payload.boletaIds,
    boletaNumbers: payload.boletaNumbers,
    alias: payload.alias,
    cvu: payload.cvu,
    holderName: payload.holderName,
    bankName: payload.bankName,
    mpCheckoutLink: payload.mpCheckoutLink,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await saveClientPaymentOrderToSupabase(fallbackOrder);
  const payUrl = `${originUrl}/?pay_client=${encodeURIComponent(fallbackToken)}`;
  return {
    token: fallbackToken,
    payUrl,
    order: fallbackOrder,
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
