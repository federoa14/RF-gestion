/**
 * Aviso de pedidos nuevos del catálogo: preferencia de sonido (por dispositivo)
 * y un "ding" corto generado con Web Audio (sin archivos de audio).
 */
const SOUND_PREF_KEY = 'rf_new_order_sound_v1';

export function isNewOrderSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNewOrderSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // sin almacenamiento: queda el valor por defecto
  }
}

export function playNewOrderChime(): void {
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [880, 1318.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    window.setTimeout(() => void ctx.close().catch(() => {}), 1000);
  } catch {
    // El navegador puede bloquear el sonido hasta que el usuario toque la página
  }
}

/** Pedidos que el comercio todavía no empezó a preparar. */
export function countOrdersToPrepare(orders: Array<{ status?: string }>): number {
  return orders.filter((o) => o.status === 'pendiente_retiro').length;
}
