import type { CatalogAbandonedCart } from '../types';

/** Horas de espera antes de sugerir el primer recordatorio: 24 h (lo que pidió el comercio). Se puede cambiar. */
export const REMINDER_HOUR_OPTIONS = [2, 6, 12, 24, 48] as const;
export const DEFAULT_REMINDER_HOURS = 24;
/** Segundo aviso: a las 24 h del primero (o sea, a las 48 h). No se sugiere más de 2 para no molestar. */
export const SECOND_REMINDER_AFTER_HOURS = 24;
export const MAX_REMINDERS = 2;

export type CartReminderState = 'waiting' | 'ready' | 'second' | 'done' | 'nophone';

export interface CartReminderInfo {
  state: CartReminderState;
  /** Horas desde la última actividad del cliente. */
  ageHours: number;
  /** Horas que faltan para poder recordar (si está esperando). */
  waitHours: number;
}

const hoursSince = (iso: string | undefined, nowMs: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, (nowMs - t) / 3_600_000) : 0;
};

export function getCartReminderInfo(
  cart: CatalogAbandonedCart,
  reminderHours: number,
  nowMs: number = Date.now()
): CartReminderInfo {
  const ageHours = hoursSince(cart.updatedAt || cart.createdAt, nowMs);
  if (cart.status === 'recovered' || cart.status === 'discarded') return { state: 'done', ageHours, waitHours: 0 };
  if (!cart.customerPhone?.trim()) return { state: 'nophone', ageHours, waitHours: 0 };
  const count = cart.reminderCount || 0;
  if (cart.status === 'reminded' || count > 0) {
    if (count >= MAX_REMINDERS) return { state: 'done', ageHours, waitHours: 0 };
    const sinceReminder = hoursSince(cart.reminderSentAt, nowMs);
    return sinceReminder >= SECOND_REMINDER_AFTER_HOURS
      ? { state: 'second', ageHours, waitHours: 0 }
      : { state: 'waiting', ageHours, waitHours: SECOND_REMINDER_AFTER_HOURS - sinceReminder };
  }
  return ageHours >= reminderHours
    ? { state: 'ready', ageHours, waitHours: 0 }
    : { state: 'waiting', ageHours, waitHours: reminderHours - ageHours };
}

export function formatHours(h: number): string {
  if (h < 1) return 'menos de 1 h';
  if (h < 48) return `${Math.floor(h)} h`;
  return `${Math.floor(h / 24)} días`;
}
