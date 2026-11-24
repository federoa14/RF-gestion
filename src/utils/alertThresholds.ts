import type { BusinessRubro, DistributorConfig } from '../types';

/**
 * Umbrales de alerta centralizados.
 *
 * Hay dos relojes distintos y nunca se mezclan:
 *  - "Días desde la venta": cuentan desde la fecha de la venta (saleDate).
 *      · vendedorReminderDays → recordatorio preventivo al vendedor
 *      · adminAlertDays       → aviso a los dueños
 *      · alertModeDays        → modo alerta (prioridad de cobro)
 *      · criticalSaleDays     → alerta crítica (prioridad máxima)
 *  - "Días de mora": cuentan desde el vencimiento (dueDate).
 *      · overdueGraceDays     → pasa a rojo crítico ("fiado vencido")
 *
 * Todas las pantallas y mensajes deben leer estos valores con getAlertThresholds(config)
 * en lugar de escribir números a mano.
 */
export interface AlertThresholds {
  vendedorReminderDays: number;
  adminAlertDays: number;
  alertModeDays: number;
  criticalSaleDays: number;
  overdueGraceDays: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  vendedorReminderDays: 2,
  adminAlertDays: 6,
  alertModeDays: 10,
  criticalSaleDays: 15,
  overdueGraceDays: 5,
};

/** Valores sugeridos por rubro para los dos umbrales nuevos (modo alerta y crítico). */
export const RUBRO_ESCALATION_DEFAULTS: Record<BusinessRubro, { alertModeDays: number; criticalSaleDays: number }> = {
  distribuidora: { alertModeDays: 10, criticalSaleDays: 15 },
  indumentaria: { alertModeDays: 20, criticalSaleDays: 30 },
  ecommerce_kiosco: { alertModeDays: 10, criticalSaleDays: 15 },
  comercio_fiado: { alertModeDays: 15, criticalSaleDays: 20 },
  cuenta_corriente: { alertModeDays: 25, criticalSaleDays: 35 },
};

function toPositiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Devuelve los umbrales efectivos de la configuración, con valores por defecto
 * y garantizando un orden creciente: recordatorio ≤ dueños ≤ modo alerta ≤ crítico.
 */
export function getAlertThresholds(config?: Partial<DistributorConfig> | null): AlertThresholds {
  const rubro = (config?.businessRubro || 'distribuidora') as BusinessRubro;
  const escalation = RUBRO_ESCALATION_DEFAULTS[rubro] || RUBRO_ESCALATION_DEFAULTS.distribuidora;

  const vendedorReminderDays = toPositiveInt(config?.vendedorReminderDays, DEFAULT_ALERT_THRESHOLDS.vendedorReminderDays);
  const adminAlertDays = Math.max(
    vendedorReminderDays,
    toPositiveInt(config?.adminAlertDays, DEFAULT_ALERT_THRESHOLDS.adminAlertDays)
  );
  const alertModeDays = Math.max(
    adminAlertDays,
    toPositiveInt(config?.saleAlertModeDays, escalation.alertModeDays)
  );
  const criticalSaleDays = Math.max(
    alertModeDays,
    toPositiveInt(config?.saleCriticalDays, escalation.criticalSaleDays)
  );
  const overdueGraceDays = toPositiveInt(config?.overdueGraceDays, DEFAULT_ALERT_THRESHOLDS.overdueGraceDays);

  return { vendedorReminderDays, adminAlertDays, alertModeDays, criticalSaleDays, overdueGraceDays };
}

/**
 * Valida el orden de los umbrales de "días desde la venta" al guardar Ajustes.
 * Devuelve un mensaje de error en español o null si está todo bien.
 */
export function validateAlertThresholds(t: AlertThresholds): string | null {
  if (t.adminAlertDays < t.vendedorReminderDays) {
    return 'El aviso a dueños no puede ser antes que el recordatorio al vendedor.';
  }
  if (t.alertModeDays < t.adminAlertDays) {
    return 'El modo alerta no puede ser antes que el aviso a dueños.';
  }
  if (t.criticalSaleDays < t.alertModeDays) {
    return 'La alerta crítica no puede ser antes que el modo alerta.';
  }
  return null;
}

/** "1 día" / "5 días" */
export function formatDays(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
