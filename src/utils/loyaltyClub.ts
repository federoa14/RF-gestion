import type { CatalogLoyaltyAccount, CatalogLoyaltyMovement } from '../types';

export const GIFT_POINT_OPTIONS = [10, 50, 100] as const;
/** Tope de un regalo: evita errores de tipeo; se pueden hacer varios. */
export const MAX_GIFT_POINTS = 500;

/**
 * Regalo del comercio: solo SUMA puntos (nunca resta ni cambia lo que el cliente ganó).
 * Queda anotado en el historial para que el cliente y el comercio lo vean.
 */
export function giftPoints(
  account: CatalogLoyaltyAccount,
  points: number,
  nowIso: string = new Date().toISOString()
): CatalogLoyaltyAccount {
  const pts = Math.floor(Number(points) || 0);
  if (pts <= 0 || pts > MAX_GIFT_POINTS) return account;
  const movement: CatalogLoyaltyMovement = {
    id: `lmov-gift-${Date.parse(nowIso) || Date.now()}-${pts}`,
    date: nowIso,
    type: 'manual_adjustment',
    pointsDelta: pts,
    note: `Regalo del comercio (+${pts} pts)`,
  };
  return {
    ...account,
    pointsBalance: account.pointsBalance + pts,
    totalPointsEarned: account.totalPointsEarned + pts,
    history: [movement, ...(account.history || [])].slice(0, 40),
    updatedAt: nowIso,
  };
}

/** Texto sugerido para escribirle por WhatsApp a un cliente del club. */
export function buildClubMessage(params: {
  customerName?: string;
  storeName: string;
  points: number;
  couponCode?: string;
  couponLabel?: string;
  url?: string;
}): string {
  const first = (params.customerName || '').trim().split(/\s+/)[0];
  return [
    `¡Hola${first ? ` ${first}` : ''}! Te escribimos de *${params.storeName}* 😊`,
    `Gracias por ser parte de nuestro club: ya juntaste *${params.points} puntos*.`,
    params.couponCode
      ? `Como regalo, te dejamos el cupón *${params.couponCode}*${params.couponLabel ? ` (${params.couponLabel})` : ''} para tu próxima compra.`
      : '',
    params.url ? `Mirá la tienda: ${params.url}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
