import { Boleta, Client, DistributorConfig } from '../types';
import { analyzeClientPurchaseInsights } from './clientInsights';
import { generateIndumentariaReactivationMessage } from './whatsapp';

export type ColdClientLevel = 'muy_frio' | 'enfriandose';

export interface ColdClientOpportunity {
  client: Client;
  coldLevel: ColdClientLevel;
  daysSinceLastPurchase: number;
  lastPurchaseDate: string;
  averageDaysBetweenPurchases: number | null;
  expectedCadenceDays: number;
  overdueCadenceRatio: number | null;
  favoriteItemLabel?: string;
  favoriteItemCount: number;
  topWeekdayLabel?: string;
  topMonthPeriodLabel?: string;
  totalPurchasesCount: number;
  totalHistoricalSpent: number;
  pendingDebt: number;
  isClearToOffer: boolean;
  isRecentlyContacted: boolean;
  daysSinceLastContact: number | null;
  suggestedMessage: string;
}

/**
 * Motor exclusivo para el rubro Indumentaria:
 * Detecta clientes habituales que superaron el umbral de días sin volver a comprar
 * (o superaron 1.4x su propia frecuencia histórica), priorizando quienes están al día.
 */
export function analyzeColdClientsForIndumentaria(params: {
  clients: Client[];
  boletas: Boleta[];
  paidBoletas: Boleta[];
  config: DistributorConfig;
  senderName: string;
  thresholdDays?: number;
  referenceDateStr?: string;
}): ColdClientOpportunity[] {
  if (params.config.businessRubro !== 'indumentaria') {
    return [];
  }

  const refDate = params.referenceDateStr || new Date().toISOString().split('T')[0];
  const threshold = Math.max(7, Number(params.thresholdDays) || 30);
  const refMs = new Date(`${refDate}T12:00:00`).getTime();

  const opportunities: ColdClientOpportunity[] = [];

  for (const client of params.clients) {
    const insights = analyzeClientPurchaseInsights(
      client,
      params.boletas,
      params.paidBoletas,
      refDate
    );

    if (!insights.lastPurchaseDate || insights.daysSinceLastPurchase === null) {
      continue;
    }

    const daysSince = insights.daysSinceLastPurchase;
    const avgCadence = insights.averageDaysBetweenPurchases;
    const dynamicLimit =
      avgCadence !== null ? Math.min(threshold, Math.max(15, Math.round(avgCadence * 1.4))) : threshold;

    if (daysSince < dynamicLimit) {
      continue;
    }

    const overdueRatio = avgCadence ? Math.round((daysSince / avgCadence) * 10) / 10 : null;
    const coldLevel: ColdClientLevel =
      daysSince >= Math.max(60, threshold * 1.8) || (overdueRatio !== null && overdueRatio >= 2)
        ? 'muy_frio'
        : 'enfriandose';

    let daysSinceLastContact: number | null = null;
    if (client.lastReactivationSentAt) {
      const contactMs = new Date(`${client.lastReactivationSentAt.slice(0, 10)}T12:00:00`).getTime();
      if (!Number.isNaN(contactMs)) {
        daysSinceLastContact = Math.max(0, Math.round((refMs - contactMs) / (1000 * 60 * 60 * 24)));
      }
    }

    const isRecentlyContacted = daysSinceLastContact !== null && daysSinceLastContact <= 7;
    const favoriteItemLabel = insights.topItems[0]?.label;
    const favoriteItemCount = insights.topItems[0]?.purchaseCount || 0;

    const suggestedMessage = generateIndumentariaReactivationMessage({
      client,
      daysSinceLastPurchase: daysSince,
      favoriteItemLabel,
      pendingDebt: insights.pendingDebtTotal,
      senderName: params.senderName,
      config: params.config,
    });

    opportunities.push({
      client,
      coldLevel,
      daysSinceLastPurchase: daysSince,
      lastPurchaseDate: insights.lastPurchaseDate,
      averageDaysBetweenPurchases: avgCadence,
      expectedCadenceDays: dynamicLimit,
      overdueCadenceRatio: overdueRatio,
      favoriteItemLabel,
      favoriteItemCount,
      topWeekdayLabel: insights.topWeekdays[0]?.label,
      topMonthPeriodLabel: insights.topMonthPeriods[0]?.label,
      totalPurchasesCount: insights.totalPurchasesCount,
      totalHistoricalSpent: insights.totalHistoricalSpent,
      pendingDebt: insights.pendingDebtTotal,
      isClearToOffer: insights.pendingDebtTotal <= 0,
      isRecentlyContacted,
      daysSinceLastContact,
      suggestedMessage,
    });
  }

  // Ordenar: primero los que están al día (listos para comprar), luego por mayor volumen/días sin comprar
  return opportunities.sort((a, b) => {
    if (a.isClearToOffer !== b.isClearToOffer) {
      return a.isClearToOffer ? -1 : 1;
    }
    if (a.isRecentlyContacted !== b.isRecentlyContacted) {
      return a.isRecentlyContacted ? 1 : -1;
    }
    return b.daysSinceLastPurchase - a.daysSinceLastPurchase || b.totalHistoricalSpent - a.totalHistoricalSpent;
  });
}
