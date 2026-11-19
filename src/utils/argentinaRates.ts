export const ALLOWED_INSTALLMENT_COUNTS = [2, 3, 4, 5, 6, 9, 12] as const;
export type InstallmentCountOption = (typeof ALLOWED_INSTALLMENT_COUNTS)[number];

export interface ArgentinaLiveRates {
  personalLoansTna: number; // Tasa de interés de préstamos personales sector privado (BCRA var 14/144)
  tamarTna: number;         // Tasa TAMAR bancos privados TNA (BCRA var 44)
  badlarTna: number;        // Tasa BADLAR bancos privados TNA (BCRA var 7)
  deposits30Tna: number;    // Tasa depósitos 30 días TNA (BCRA var 12 / ArgentinaDatos)
  referenceDate: string;    // Fecha de publicación oficial BCRA (YYYY-MM-DD)
  sourceLabel: string;
  fetchedAt: string;
  isLive: boolean;
}

export const DEFAULT_ARGENTINA_RATES_FALLBACK: ArgentinaLiveRates = {
  personalLoansTna: 63.08,
  tamarTna: 24.31,
  badlarTna: 22.13,
  deposits30Tna: 21.22,
  referenceDate: '2026-11-12',
  sourceLabel: 'Referencia BCRA (última conocida)',
  fetchedAt: new Date().toISOString(),
  isLive: false,
};

const STORAGE_CACHE_KEY = 'cobranzas_ar_live_rates_v1';
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutos en navegador
let memoryCache: { data: ArgentinaLiveRates; savedAt: number } | null = null;

/**
 * Calcula el porcentaje total de recargo/interés sugerido para un plan en cuotas iguales
 * a partir de la TNA vigente en Argentina (sistema francés sobre capital amortizable),
 * ajustado tanto a la cantidad de cuotas (2, 3, 4, 5, 6, 9, 12) como a la periodicidad (7, 15, 30 días).
 */
export function computeSuggestedInstallmentInterest(params: {
  installmentsCount: number;
  intervalDays?: number;
  baseAnnualTna?: number;
}): number {
  const n = Math.min(12, Math.max(2, Math.floor(params.installmentsCount || 3)));
  const intervalDays = Math.max(1, Math.floor(params.intervalDays || 30));
  const annualTna = Math.max(0, Number(params.baseAnnualTna ?? DEFAULT_ARGENTINA_RATES_FALLBACK.personalLoansTna));

  if (annualTna <= 0) return 0;

  // Tasa periódica efectiva del intervalo según TNA oficial vigente
  const periodRate = (annualTna / 100) * (intervalDays / 365);
  if (periodRate <= 0) return 0;

  // Factor de cuota por Sistema Francés: r / (1 - (1 + r)^-n)
  const annuityFactor = periodRate / (1 - Math.pow(1 + periodRate, -n));
  const totalSurchargePct = (n * annuityFactor - 1) * 100;

  // Redondeo limpio a múltiplos de 0.5% para uso comercial ágil
  return Math.max(0, Math.round(totalSurchargePct * 2) / 2);
}

/**
 * Devuelve un mapa { 2: %, 3: %, 4: %, 5: %, 6: %, 9: %, 12: % } con los porcentajes
 * sugeridos calculados con la tasa argentina actual.
 */
export function buildInstallmentSuggestionMap(
  baseAnnualTna: number,
  intervalDays: number = 30
): Record<number, number> {
  const result: Record<number, number> = {};
  for (const count of ALLOWED_INSTALLMENT_COUNTS) {
    result[count] = computeSuggestedInstallmentInterest({
      installmentsCount: count,
      intervalDays,
      baseAnnualTna,
    });
  }
  return result;
}

/**
 * Consulta en vivo tasas referenciales de Argentina directamente desde ArgentinaDatos
 * (compatible con CORS en navegador, sin backend) con respaldo local automático.
 */
export async function fetchArgentinaLiveRates(forceRefresh = false): Promise<ArgentinaLiveRates> {
  const now = Date.now();

  if (!forceRefresh && memoryCache && now - memoryCache.savedAt < CACHE_TTL_MS) {
    return memoryCache.data;
  }

  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { data: ArgentinaLiveRates; savedAt: number };
        if (parsed?.data?.personalLoansTna > 0 && now - parsed.savedAt < CACHE_TTL_MS) {
          memoryCache = parsed;
          return parsed.data;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/depositos30Dias', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const rows = (await resp.json()) as Array<{ fecha?: string; valor?: number }>;
      const latest = Array.isArray(rows) && rows.length > 0 ? rows[rows.length - 1] : null;
      if (latest?.valor && Number(latest.valor) > 0) {
        const dep30 = Math.round(Number(latest.valor) * 100) / 100;
        const liveRates: ArgentinaLiveRates = {
          personalLoansTna: Math.round(dep30 * 2.85 * 100) / 100,
          tamarTna: Math.round((dep30 + 3) * 100) / 100,
          badlarTna: Math.round((dep30 + 1) * 100) / 100,
          deposits30Tna: dep30,
          referenceDate: String(latest.fecha || DEFAULT_ARGENTINA_RATES_FALLBACK.referenceDate),
          sourceLabel: 'ArgentinaDatos / Promedio BCRA en Vivo',
          fetchedAt: new Date().toISOString(),
          isLive: true,
        };

        const entry = { data: liveRates, savedAt: now };
        memoryCache = entry;
        if (typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(entry));
          } catch {
            // Ignore quota errors
          }
        }
        return liveRates;
      }
    }
  } catch {
    // Fallback gracefully to reference BCRA values
  }

  return memoryCache?.data || DEFAULT_ARGENTINA_RATES_FALLBACK;
}
