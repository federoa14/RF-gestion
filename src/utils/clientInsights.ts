import { Boleta, Client } from '../types';
import { getBoletaBalance } from './alerts';

export interface ClientPurchaseRecord {
  id: string;
  boletaNumber: string;
  saleDate: string;
  dueDate: string;
  paidAt?: string;
  amount: number;
  balanceDue: number;
  status: 'pending' | 'partial' | 'paid' | 'purged_paid' | 'purged_unpaid';
  itemsText: string;
  saleMode?: string;
  salespersonName: string;
  notes?: string;
}

export interface FrequentItemStat {
  key: string;
  label: string;
  purchaseCount: number;
  totalUnits: number;
  totalSpent: number;
  lastDate: string;
}

export interface TimingBucketStat {
  label: string;
  subLabel?: string;
  count: number;
  percent: number;
}

export interface ClientCommercialInsights {
  totalPurchasesCount: number;
  totalHistoricalSpent: number;
  pendingDebtTotal: number;
  pendingCount: number;
  isDebtor: boolean;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  averageDaysBetweenPurchases: number | null;
  topItems: FrequentItemStat[];
  topWeekdays: TimingBucketStat[];
  topMonthPeriods: TimingBucketStat[];
  recentPurchases: ClientPurchaseRecord[];
  recommendationText: string;
}

const WEEKDAYS_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/** "Sábado" -> "sábados", "Lunes" -> "lunes": para frases como "Suele comprar los sábados". */
export function formatWeekdayPlural(label: string): string {
  const lower = (label || '').trim().toLowerCase();
  if (!lower) return '';
  return lower.endsWith('s') ? lower : `${lower}s`;
}

function parseIsoDateLocal(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.slice(0, 10);
  const d = new Date(`${clean}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMonthPeriod(dayOfMonth: number): { key: string; label: string; subLabel: string } {
  if (dayOfMonth <= 10) {
    return { key: 'inicio', label: 'Principio de mes', subLabel: 'Días 1 al 10' };
  }
  if (dayOfMonth <= 20) {
    return { key: 'medio', label: 'Mediados de mes', subLabel: 'Días 11 al 20' };
  }
  return { key: 'fin', label: 'Fin de mes', subLabel: 'Días 21 al 31' };
}

function normalizeProductName(raw: string): { key: string; label: string; qty: number } | null {
  let clean = raw.trim();
  if (!clean) return null;

  let qty = 1;
  // Match leading qty patterns like "2x Jean Mom", "2 x Jean", "3u Remera"
  const leadingMatch = clean.match(/^(\d+(?:[.,]\d+)?)\s*(?:x|u|unid\.?)?\s+(.+)$/i);
  if (leadingMatch) {
    const parsedQty = parseFloat(leadingMatch[1].replace(',', '.'));
    if (!Number.isNaN(parsedQty) && parsedQty > 0 && parsedQty < 10000) {
      qty = parsedQty;
      clean = leadingMatch[2].trim();
    }
  } else {
    // Match trailing "x2" or "x 3"
    const trailingMatch = clean.match(/^(.+?)\s*x\s*(\d+(?:[.,]\d+)?)$/i);
    if (trailingMatch) {
      const parsedQty = parseFloat(trailingMatch[2].replace(',', '.'));
      if (!Number.isNaN(parsedQty) && parsedQty > 0 && parsedQty < 10000) {
        qty = parsedQty;
        clean = trailingMatch[1].trim();
      }
    }
  }

  // Strip trailing payment annotations like "(1 Pago Hoy)" or "(En Cuotas)"
  clean = clean.replace(/\s*\([^)]*(?:pago|cuota|fiado|contado)[^)]*\)\s*$/i, '').trim();
  if (!clean || clean.length < 2) return null;

  const normalizedKey = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const formattedLabel = clean.charAt(0).toUpperCase() + clean.slice(1);
  return { key: normalizedKey, label: formattedLabel, qty };
}

function buildItemsDisplayText(b: Boleta): string {
  if (b.items && b.items.length > 0) {
    return b.items.map((it) => `${it.quantity}x ${it.name}`).join(' + ');
  }
  if (b.itemSummary && b.itemSummary.trim()) {
    return b.itemSummary.trim();
  }
  if (b.notes && b.notes.trim()) {
    return b.notes.trim();
  }
  return 'Compra / Mercadería general';
}

export function analyzeClientPurchaseInsights(
  client: Client,
  pendingBoletas: Boleta[],
  paidBoletas: Boleta[],
  referenceDateStr?: string
): ClientCommercialInsights {
  const clientPending = pendingBoletas.filter(
    (b) => b.clientId === client.id && b.status === 'pending'
  );
  const clientPaid = paidBoletas.filter((b) => b.clientId === client.id);

  const pendingDebtTotal = clientPending.reduce(
    (acc, b) => acc + getBoletaBalance(b).balanceDue,
    0
  );

  // Build unified purchase history (newest first)
  const records: ClientPurchaseRecord[] = [];

  for (const b of clientPending) {
    const bal = getBoletaBalance(b);
    records.push({
      id: b.id,
      boletaNumber: b.boletaNumber,
      saleDate: b.saleDate,
      dueDate: b.dueDate,
      amount: b.amount,
      balanceDue: bal.balanceDue,
      status: bal.hasPartialPayments ? 'partial' : 'pending',
      itemsText: buildItemsDisplayText(b),
      saleMode: b.saleMode,
      salespersonName: b.salespersonName,
      notes: b.notes,
    });
  }

  for (const b of clientPaid) {
    records.push({
      id: b.id,
      boletaNumber: b.boletaNumber,
      saleDate: b.saleDate,
      dueDate: b.dueDate,
      paidAt: b.paidAt,
      amount: b.amount,
      balanceDue: 0,
      status: 'paid',
      itemsText: buildItemsDisplayText(b),
      saleMode: b.saleMode,
      salespersonName: b.salespersonName,
      notes: b.notes,
    });
  }

  for (const p of client.creditHistory?.purgedBoletas || []) {
    records.push({
      id: `purged-${p.boletaNumber}-${p.saleDate}`,
      boletaNumber: p.boletaNumber,
      saleDate: p.saleDate,
      dueDate: p.dueDate,
      amount: p.originalAmount,
      balanceDue: p.balanceDue,
      status: p.reason === 'pagada_30dias' ? 'purged_paid' : 'purged_unpaid',
      itemsText: 'Registro archivado (>30 días)',
      salespersonName: p.salespersonName,
    });
  }

  records.sort((a, b) => b.saleDate.localeCompare(a.saleDate));

  // Frequency analysis on active + paid boletas
  const allDetailedBoletas = [...clientPending, ...clientPaid];
  const itemMap = new Map<string, FrequentItemStat>();
  const weekdayMap = new Map<number, number>();
  const monthPeriodMap = new Map<string, { label: string; subLabel: string; count: number }>();

  // Group linked installment/basket operations by planId or basketId so a 3-cuota purchase counts as 1 purchase event for date/item frequency!
  const seenOperationKeys = new Set<string>();
  const uniquePurchaseDates: string[] = [];

  for (const b of allDetailedBoletas) {
    const opKey = b.basketId || b.planId || b.id;
    const isFirstOfOp = !seenOperationKeys.has(opKey);
    if (isFirstOfOp) {
      seenOperationKeys.add(opKey);
      if (b.saleDate) {
        uniquePurchaseDates.push(b.saleDate.slice(0, 10));
        const d = parseIsoDateLocal(b.saleDate);
        if (d) {
          const wd = d.getDay();
          weekdayMap.set(wd, (weekdayMap.get(wd) || 0) + 1);
          const period = getMonthPeriod(d.getDate());
          const existingPeriod = monthPeriodMap.get(period.key) || {
            label: period.label,
            subLabel: period.subLabel,
            count: 0,
          };
          existingPeriod.count += 1;
          monthPeriodMap.set(period.key, existingPeriod);
        }
      }

      // Extract items from line items or itemSummary
      if (b.items && b.items.length > 0) {
        for (const it of b.items) {
          const norm = normalizeProductName(it.name);
          if (!norm) continue;
          const prev = itemMap.get(norm.key) || {
            key: norm.key,
            label: norm.label,
            purchaseCount: 0,
            totalUnits: 0,
            totalSpent: 0,
            lastDate: b.saleDate,
          };
          prev.purchaseCount += 1;
          prev.totalUnits += it.quantity || norm.qty;
          prev.totalSpent += it.subtotal || 0;
          if (b.saleDate > prev.lastDate) prev.lastDate = b.saleDate;
          itemMap.set(norm.key, prev);
        }
      } else if (b.itemSummary && b.itemSummary.trim()) {
        const parts = b.itemSummary.split(/[+,;\n]+/);
        const perPartEstimated =
          parts.length > 0 ? Math.round((b.amount / parts.length) * 100) / 100 : b.amount;
        for (const part of parts) {
          const norm = normalizeProductName(part);
          if (!norm) continue;
          const prev = itemMap.get(norm.key) || {
            key: norm.key,
            label: norm.label,
            purchaseCount: 0,
            totalUnits: 0,
            totalSpent: 0,
            lastDate: b.saleDate,
          };
          prev.purchaseCount += 1;
          prev.totalUnits += norm.qty;
          prev.totalSpent += perPartEstimated;
          if (b.saleDate > prev.lastDate) prev.lastDate = b.saleDate;
          itemMap.set(norm.key, prev);
        }
      }
    }
  }

  // Also include purged dates in timing stats if available
  for (const p of client.creditHistory?.purgedBoletas || []) {
    if (p.saleDate) {
      uniquePurchaseDates.push(p.saleDate.slice(0, 10));
      const d = parseIsoDateLocal(p.saleDate);
      if (d) {
        const wd = d.getDay();
        weekdayMap.set(wd, (weekdayMap.get(wd) || 0) + 1);
        const period = getMonthPeriod(d.getDate());
        const existingPeriod = monthPeriodMap.get(period.key) || {
          label: period.label,
          subLabel: period.subLabel,
          count: 0,
        };
        existingPeriod.count += 1;
        monthPeriodMap.set(period.key, existingPeriod);
      }
    }
  }

  const totalDatedEvents = uniquePurchaseDates.length;
  const topWeekdays: TimingBucketStat[] = Array.from(weekdayMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([wd, count]) => ({
      label: WEEKDAYS_ES[wd] || 'Día',
      count,
      percent: totalDatedEvents > 0 ? Math.round((count / totalDatedEvents) * 100) : 0,
    }));

  const topMonthPeriods: TimingBucketStat[] = Array.from(monthPeriodMap.values())
    .sort((a, b) => b.count - a.count)
    .map((p) => ({
      label: p.label,
      subLabel: p.subLabel,
      count: p.count,
      percent: totalDatedEvents > 0 ? Math.round((p.count / totalDatedEvents) * 100) : 0,
    }));

  const topItems: FrequentItemStat[] = Array.from(itemMap.values()).sort(
    (a, b) => b.purchaseCount - a.purchaseCount || b.totalUnits - a.totalUnits || b.totalSpent - a.totalSpent
  );

  // Compute average days between distinct purchase dates
  const sortedUniqueDatesAsc = Array.from(new Set(uniquePurchaseDates)).sort((a, b) =>
    a.localeCompare(b)
  );
  let averageDaysBetweenPurchases: number | null = null;
  if (sortedUniqueDatesAsc.length >= 2) {
    let totalDiffDays = 0;
    let pairs = 0;
    for (let i = 1; i < sortedUniqueDatesAsc.length; i++) {
      const dPrev = parseIsoDateLocal(sortedUniqueDatesAsc[i - 1]);
      const dCurr = parseIsoDateLocal(sortedUniqueDatesAsc[i]);
      if (dPrev && dCurr) {
        const diff = Math.round((dCurr.getTime() - dPrev.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= 0) {
          totalDiffDays += diff;
          pairs++;
        }
      }
    }
    if (pairs > 0) {
      averageDaysBetweenPurchases = Math.max(1, Math.round(totalDiffDays / pairs));
    }
  }

  const lastPurchaseDate =
    records.length > 0 ? records[0].saleDate : null;
  let daysSinceLastPurchase: number | null = null;
  if (lastPurchaseDate) {
    const refD = parseIsoDateLocal(referenceDateStr || new Date().toISOString().split('T')[0]);
    const lastD = parseIsoDateLocal(lastPurchaseDate);
    if (refD && lastD) {
      daysSinceLastPurchase = Math.max(
        0,
        Math.round((refD.getTime() - lastD.getTime()) / (1000 * 60 * 60 * 24))
      );
    }
  }

  const totalHistoricalSpent = records.reduce((acc, r) => acc + (r.amount || 0), 0);

  // Build practical commercial recommendation
  let recommendationText = '';
  if (records.length === 0) {
    recommendationText =
      'Todavía no hay compras registradas para este cliente. Cuando cargues su primera boleta, verás aquí qué productos elige más y en qué fechas suele comprar.';
  } else {
    const parts: string[] = [];
    if (topWeekdays.length > 0 && topMonthPeriods.length > 0) {
      parts.push(
        `Suele comprar mayormente los ${formatWeekdayPlural(topWeekdays[0].label)} (${topWeekdays[0].percent}%) a ${topMonthPeriods[0].label.toLowerCase()} (${topMonthPeriods[0].subLabel})`
      );
    }
    if (averageDaysBetweenPurchases !== null) {
      parts.push(`con una frecuencia aproximada de cada ${averageDaysBetweenPurchases} días`);
    }
    if (topItems.length > 0) {
      parts.push(
        `Lo que más repite: "${topItems[0].label}" (${topItems[0].purchaseCount} compra/s)`
      );
    }
    if (pendingDebtTotal > 0) {
      parts.push(
        `Actualmente posee saldo pendiente, ideal recordarle su deuda antes de ofrecer mercadería nueva`
      );
    } else if (
      averageDaysBetweenPurchases !== null &&
      daysSinceLastPurchase !== null &&
      daysSinceLastPurchase >= averageDaysBetweenPurchases
    ) {
      parts.push(
        `Está al día y hace ${daysSinceLastPurchase} días de su última compra: buen momento para contactarlo y ofrecerle reposición`
      );
    }
    recommendationText = parts.join('. ') + '.';
  }

  return {
    totalPurchasesCount: Math.max(records.length, seenOperationKeys.size),
    totalHistoricalSpent,
    pendingDebtTotal,
    pendingCount: clientPending.length,
    isDebtor: pendingDebtTotal > 0 || clientPending.length > 0,
    lastPurchaseDate,
    daysSinceLastPurchase,
    averageDaysBetweenPurchases,
    topItems: topItems.slice(0, 8),
    topWeekdays,
    topMonthPeriods,
    recentPurchases: records.slice(0, 15),
    recommendationText,
  };
}
