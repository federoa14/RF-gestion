import {
  CatalogLoyaltyAccount,
  CatalogLoyaltyTier,
  CatalogPickupOrder,
  CatalogProduct,
} from '../types';
import { getEligibleLoyaltyTiers, normalizeDni } from './catalogStock';

export type AudienceSegmentKey = 'mujer' | 'hombre' | 'nino' | 'otro';

export interface AudienceSegmentStat {
  key: AudienceSegmentKey;
  label: string;
  units: number;
  spent: number;
  percent: number;
}

export interface TopPurchasedProductStat {
  key: string;
  productId?: string;
  productName: string;
  category?: string;
  units: number;
  ordersCount: number;
  spent: number;
  lastPurchasedAt: string;
}

export interface CommercialPeriodStat {
  key: string;
  label: string;
  hint: string;
  ordersCount: number;
  spent: number;
  percent: number;
}

export interface WebLoyaltyCustomerInsight {
  id: string;
  dni: string;
  isWebClient: true;
  customerName: string;
  customerPhone: string;
  pointsBalance: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  highestUnlockedTier: CatalogLoyaltyTier | null;
  nextTier: CatalogLoyaltyTier | null;
  ordersCount: number;
  totalSpent: number;
  averageTicket: number;
  revenueSharePercent: number; // % del dinero total vendido en la web
  totalUnits: number;
  lastOrderAt: string | null;
  topProducts: TopPurchasedProductStat[];
  topCategories: Array<{ category: string; units: number; spent: number; percent: number }>;
  mostPurchasedSummary: string;
  audienceBreakdown: AudienceSegmentStat[];
  dominantAudience: AudienceSegmentKey;
  dominantAudienceLabel: string;
  dominantAudiencePercent: number;
  commercialPeriods: CommercialPeriodStat[];
  topCommercialPeriod: CommercialPeriodStat | null;
  monthPeriods: CommercialPeriodStat[];
  topMonthPeriod: CommercialPeriodStat | null;
  upcomingCommercialEvent: { key: string; label: string; hint: string };
}

function normalizeText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function classifyAudienceSegment(texts: Array<string | undefined>): AudienceSegmentKey {
  const mujerRe = /\b(mujer|mujeres|dama|damas|femenin[oa]s?|senora|senoras)\b/;
  const hombreRe = /\b(hombre|hombres|caballero|caballeros|masculin[oa]s?|varon|varones)\b/;
  const ninoRe = /\b(nino|ninos|nina|ninas|infantil|infantiles|bebe|bebes|kids?|junior|escolar|infancia|infancias)\b/;

  const primary = normalizeText(texts[0] || '');
  if (primary) {
    const pMujer = mujerRe.test(primary);
    const pHombre = hombreRe.test(primary);
    const pNino = ninoRe.test(primary);
    if (Number(pMujer) + Number(pHombre) + Number(pNino) === 1) {
      if (pMujer) return 'mujer';
      if (pHombre) return 'hombre';
      if (pNino) return 'nino';
    }
  }

  const joined = normalizeText(texts.filter(Boolean).join(' '));
  if (!joined) return 'otro';

  const hasMujer = mujerRe.test(joined);
  const hasHombre = hombreRe.test(joined);
  const hasNino = ninoRe.test(joined);

  if (/\bunisex\b/.test(joined) && !hasNino) {
    return 'otro';
  }
  const matchesCount = Number(hasMujer) + Number(hasHombre) + Number(hasNino);
  if (matchesCount === 1) {
    if (hasMujer) return 'mujer';
    if (hasHombre) return 'hombre';
    if (hasNino) return 'nino';
  }

  return 'otro';
}

function getNthSundayOfMonth(year: number, monthIndex0: number, nth: number): Date {
  const firstDay = new Date(year, monthIndex0, 1, 12, 0, 0);
  const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday
  const offset = (7 - firstDayOfWeek) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return new Date(year, monthIndex0, day, 12, 0, 0);
}

function diffDaysInclusive(target: Date, eventDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((eventDate.getTime() - target.getTime()) / msPerDay);
}

export function resolveCommercialSeasonForDate(dateIso: string): {
  key: string;
  label: string;
  hint: string;
} {
  const clean = String(dateIso || '').slice(0, 10);
  const d = new Date(`${clean}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { key: 'general', label: 'Temporada regular', hint: 'Compras habituales' };
  }

  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1..12
  const day = d.getDate();

  // Argentina / LATAM commercial calendar dates (with pre-holiday shopping window)
  const fathersDay = getNthSundayOfMonth(year, 5, 3); // 3° domingo de junio
  const daysToFathers = diffDaysInclusive(d, fathersDay);
  if (daysToFathers >= 0 && daysToFathers <= 21) {
    return {
      key: 'dia_del_padre',
      label: 'Día del Padre',
      hint: 'Junio (previa y fecha Día del Padre)',
    };
  }

  const childrensDay = getNthSundayOfMonth(year, 7, 3); // 3° domingo de agosto
  const daysToChildrens = diffDaysInclusive(d, childrensDay);
  if (daysToChildrens >= 0 && daysToChildrens <= 21) {
    return {
      key: 'dia_del_nino',
      label: 'Día del Niño / Infancias',
      hint: 'Agosto (previa y fecha Día del Niño)',
    };
  }

  const mothersDay = getNthSundayOfMonth(year, 9, 3); // 3° domingo de octubre
  const daysToMothers = diffDaysInclusive(d, mothersDay);
  if (daysToMothers >= 0 && daysToMothers <= 21) {
    return {
      key: 'dia_de_la_madre',
      label: 'Día de la Madre',
      hint: 'Octubre (previa y fecha Día de la Madre)',
    };
  }

  if (month === 2 && day <= 14) {
    return {
      key: 'san_valentin',
      label: 'San Valentín / Enamorados',
      hint: '1 al 14 de Febrero',
    };
  }

  if ((month === 2 && day >= 15) || (month === 3 && day <= 15)) {
    return {
      key: 'vuelta_al_cole',
      label: 'Vuelta al Cole / Temporada Otoño',
      hint: 'Mediados de Febrero a mediados de Marzo',
    };
  }

  if (month === 9 && day >= 5 && day <= 25) {
    return {
      key: 'primavera',
      label: 'Día de la Primavera / Cambio de Temporada',
      hint: 'Septiembre',
    };
  }

  if (month === 11) {
    return {
      key: 'cyber_blackfriday',
      label: 'CyberMonday / Black Friday',
      hint: 'Noviembre',
    };
  }

  if (month === 12) {
    return {
      key: 'navidad_fiestas',
      label: 'Navidad y Fin de Año',
      hint: 'Diciembre',
    };
  }

  if (month === 1) {
    return {
      key: 'reyes_verano',
      label: 'Reyes y Liquidación Verano',
      hint: 'Enero',
    };
  }

  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const mName = monthNames[month - 1] || 'Mes';
  return {
    key: `mes_${month}`,
    label: `Temporada ${mName}`,
    hint: `Compras regulares en ${mName}`,
  };
}

export function getNextUpcomingCommercialEvent(refDate: Date = new Date()): {
  key: string;
  label: string;
  hint: string;
} {
  const year = refDate.getFullYear();
  const candidates: Array<{ date: Date; key: string; label: string; hint: string }> = [
    {
      date: new Date(year, 1, 14, 12, 0, 0),
      key: 'san_valentin',
      label: 'San Valentín',
      hint: '14 de febrero',
    },
    {
      date: new Date(year, 2, 1, 12, 0, 0),
      key: 'vuelta_al_cole',
      label: 'Vuelta al Cole / Otoño',
      hint: 'Principios de marzo',
    },
    {
      date: getNthSundayOfMonth(year, 5, 3),
      key: 'dia_del_padre',
      label: 'Día del Padre',
      hint: '3° domingo de junio',
    },
    {
      date: getNthSundayOfMonth(year, 7, 3),
      key: 'dia_del_nino',
      label: 'Día del Niño',
      hint: '3° domingo de agosto',
    },
    {
      date: new Date(year, 8, 21, 12, 0, 0),
      key: 'primavera',
      label: 'Día de la Primavera',
      hint: '21 de septiembre',
    },
    {
      date: getNthSundayOfMonth(year, 9, 3),
      key: 'dia_de_la_madre',
      label: 'Día de la Madre',
      hint: '3° domingo de octubre',
    },
    {
      date: new Date(year, 10, 25, 12, 0, 0),
      key: 'cyber_blackfriday',
      label: 'Black Friday / Cyber',
      hint: 'Noviembre',
    },
    {
      date: new Date(year, 11, 24, 12, 0, 0),
      key: 'navidad_fiestas',
      label: 'Navidad y Fiestas',
      hint: 'Diciembre',
    },
  ];

  const upcoming = candidates.find((c) => c.date.getTime() >= refDate.getTime());
  if (upcoming) {
    return { key: upcoming.key, label: upcoming.label, hint: upcoming.hint };
  }
  return { key: 'reyes_verano', label: 'Reyes y Verano', hint: 'Principios de enero' };
}

function getMonthSegment(dateIso: string): { key: string; label: string; hint: string } {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) {
    return { key: 'inicio', label: 'Principio de mes', hint: 'Días 1 al 10' };
  }
  const day = d.getDate();
  if (day <= 10) return { key: 'inicio', label: 'Principio de mes', hint: 'Días 1 al 10' };
  if (day <= 20) return { key: 'medio', label: 'Mediados de mes', hint: 'Días 11 al 20' };
  return { key: 'fin', label: 'Fin de mes', hint: 'Días 21 al 31' };
}

export function buildWebLoyaltyCustomerInsights(params: {
  loyaltyAccounts: CatalogLoyaltyAccount[];
  orders: CatalogPickupOrder[];
  products: CatalogProduct[];
  loyaltyTiers?: CatalogLoyaltyAccount[] extends never ? never : import('../types').CatalogLoyaltyTier[];
  nowDate?: Date;
}): {
  customers: WebLoyaltyCustomerInsight[];
  totalStoreWebRevenue: number;
  totalLoyaltyRevenue: number;
  totalLoyaltySharePercent: number;
  upcomingEvent: { key: string; label: string; hint: string };
} {
  const { loyaltyAccounts, orders, products, loyaltyTiers, nowDate = new Date() } = params;
  const activeOrders = orders.filter((o) => o.status !== 'cancelado');
  const totalStoreWebRevenue = activeOrders.reduce(
    (sum, o) => sum + (Number(o.totalAmount) || 0),
    0
  );

  const productsById = new Map<string, CatalogProduct>();
  for (const p of products) {
    productsById.set(p.id, p);
  }

  // Index orders by normalized DNI
  const ordersByDni = new Map<string, CatalogPickupOrder[]>();
  for (const o of activeOrders) {
    const cleanDni = normalizeDni(o.customerDni || '');
    if (cleanDni.length < 6) continue;
    const list = ordersByDni.get(cleanDni) || [];
    list.push(o);
    ordersByDni.set(cleanDni, list);
  }

  // Merge all known DNIs from loyaltyAccounts + orders with customerDni
  const accountByDni = new Map<string, CatalogLoyaltyAccount>();
  for (const acc of loyaltyAccounts) {
    const cleanDni = normalizeDni(acc.dni);
    if (cleanDni.length < 6) continue;
    const prev = accountByDni.get(cleanDni);
    if (!prev || (acc.updatedAt || acc.createdAt) >= (prev.updatedAt || prev.createdAt)) {
      accountByDni.set(cleanDni, { ...acc, dni: cleanDni });
    }
  }

  // Ensure any DNI present in orders is also represented even if loyalty account hasn't synced separately
  for (const [cleanDni, dniOrders] of ordersByDni.entries()) {
    if (!accountByDni.has(cleanDni)) {
      const sorted = [...dniOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const latest = sorted[0];
      const earned = dniOrders.reduce(
        (sum, o) => sum + Math.max(0, Number(o.loyaltyPointsEarned) || 0),
        0
      );
      const redeemed = dniOrders.reduce(
        (sum, o) => sum + Math.max(0, Number(o.loyaltyPointsRedeemed) || 0),
        0
      );
      accountByDni.set(cleanDni, {
        id: `lyl-derived-${cleanDni}`,
        tenantId: latest.tenantId,
        dni: cleanDni,
        customerName: latest.customerName,
        customerPhone: latest.customerPhone,
        pointsBalance: Math.max(0, earned - redeemed),
        totalPointsEarned: earned,
        totalPointsRedeemed: redeemed,
        ordersCount: dniOrders.length,
        lastOrderAt: latest.createdAt,
        history: [],
        createdAt: sorted[sorted.length - 1]?.createdAt || latest.createdAt,
        updatedAt: latest.updatedAt || latest.createdAt,
      });
    }
  }

  const upcomingEvent = getNextUpcomingCommercialEvent(nowDate);
  const audienceLabels: Record<AudienceSegmentKey, string> = {
    mujer: 'Mujer',
    hombre: 'Hombre',
    nino: 'Niño / Infantil',
    otro: 'General / Unisex',
  };

  let totalLoyaltyRevenue = 0;

  const customers: WebLoyaltyCustomerInsight[] = Array.from(accountByDni.values()).map((acc) => {
    const cleanDni = normalizeDni(acc.dni);
    const dniOrders = [...(ordersByDni.get(cleanDni) || [])].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    const latestOrder = dniOrders[0];
    const resolvedName = (acc.customerName || latestOrder?.customerName || 'Cliente Web').trim();
    const resolvedPhone = (acc.customerPhone || latestOrder?.customerPhone || '').trim();

    const totalSpent = dniOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    totalLoyaltyRevenue += totalSpent;
    const ordersCount = Math.max(dniOrders.length, acc.ordersCount || 0);
    const averageTicket =
      dniOrders.length > 0 ? Math.round((totalSpent / dniOrders.length) * 100) / 100 : 0;
    const revenueSharePercent =
      totalStoreWebRevenue > 0
        ? Math.round((totalSpent / totalStoreWebRevenue) * 1000) / 10
        : 0;

    // Product, category, audience, and timing aggregation
    const prodMap = new Map<string, TopPurchasedProductStat>();
    const catMap = new Map<string, { category: string; units: number; spent: number }>();
    const audienceStats: Record<AudienceSegmentKey, { units: number; spent: number }> = {
      mujer: { units: 0, spent: 0 },
      hombre: { units: 0, spent: 0 },
      nino: { units: 0, spent: 0 },
      otro: { units: 0, spent: 0 },
    };
    const commercialMap = new Map<
      string,
      { key: string; label: string; hint: string; ordersCount: number; spent: number }
    >();
    const monthPeriodMap = new Map<
      string,
      { key: string; label: string; hint: string; ordersCount: number; spent: number }
    >();

    let totalUnits = 0;

    for (const order of dniOrders) {
      const season = resolveCommercialSeasonForDate(order.createdAt);
      const prevSeason = commercialMap.get(season.key) || {
        key: season.key,
        label: season.label,
        hint: season.hint,
        ordersCount: 0,
        spent: 0,
      };
      prevSeason.ordersCount += 1;
      prevSeason.spent += Number(order.totalAmount) || 0;
      commercialMap.set(season.key, prevSeason);

      const mSeg = getMonthSegment(order.createdAt);
      const prevMSeg = monthPeriodMap.get(mSeg.key) || {
        key: mSeg.key,
        label: mSeg.label,
        hint: mSeg.hint,
        ordersCount: 0,
        spent: 0,
      };
      prevMSeg.ordersCount += 1;
      prevMSeg.spent += Number(order.totalAmount) || 0;
      monthPeriodMap.set(mSeg.key, prevMSeg);

      const seenProductsInOrder = new Set<string>();
      for (const item of order.items || []) {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const subtotal = Number(item.subtotal) || 0;
        totalUnits += qty;

        const liveProd = productsById.get(item.productId);
        const category = (item.category || liveProd?.category || 'General').trim();
        const subfilters = item.subfilters || liveProd?.subfilters || [];

        const prodKey = item.productId || normalizeText(item.productName);
        const prevProd = prodMap.get(prodKey) || {
          key: prodKey,
          productId: item.productId,
          productName: item.productName,
          category,
          units: 0,
          ordersCount: 0,
          spent: 0,
          lastPurchasedAt: order.createdAt,
        };
        prevProd.units += qty;
        prevProd.spent += subtotal;
        if (!seenProductsInOrder.has(prodKey)) {
          prevProd.ordersCount += 1;
          seenProductsInOrder.add(prodKey);
        }
        if (order.createdAt > prevProd.lastPurchasedAt) {
          prevProd.lastPurchasedAt = order.createdAt;
        }
        prodMap.set(prodKey, prevProd);

        const prevCat = catMap.get(category) || { category, units: 0, spent: 0 };
        prevCat.units += qty;
        prevCat.spent += subtotal;
        catMap.set(category, prevCat);

        const seg = classifyAudienceSegment([
          category,
          ...(Array.isArray(subfilters) ? subfilters : []),
          item.productName,
          item.variantLabel,
        ]);
        audienceStats[seg].units += qty;
        audienceStats[seg].spent += subtotal;
      }
    }

    const topProducts = Array.from(prodMap.values())
      .sort((a, b) => b.units - a.units || b.spent - a.spent)
      .slice(0, 6);

    const topCategories = Array.from(catMap.values())
      .sort((a, b) => b.units - a.units || b.spent - a.spent)
      .map((c) => ({
        ...c,
        percent: totalUnits > 0 ? Math.round((c.units / totalUnits) * 100) : 0,
      }));

    const audienceTotalUnits =
      audienceStats.mujer.units +
      audienceStats.hombre.units +
      audienceStats.nino.units +
      audienceStats.otro.units;

    const audienceBreakdown: AudienceSegmentStat[] = (
      ['mujer', 'hombre', 'nino', 'otro'] as AudienceSegmentKey[]
    ).map((k) => ({
      key: k,
      label: audienceLabels[k],
      units: audienceStats[k].units,
      spent: audienceStats[k].spent,
      percent:
        audienceTotalUnits > 0
          ? Math.round((audienceStats[k].units / audienceTotalUnits) * 100)
          : 0,
    }));

    // Pick dominant among Hombre / Mujer / Niño if any has > 0 units, else Otro
    const mainGenderBuckets = audienceBreakdown.filter((b) => b.key !== 'otro' && b.units > 0);
    const sortedAudience = [...(mainGenderBuckets.length > 0 ? mainGenderBuckets : audienceBreakdown)]
      .filter((b) => b.units > 0)
      .sort((a, b) => b.units - a.units || b.spent - a.spent);

    const dominantAudience: AudienceSegmentKey =
      sortedAudience.length > 0 ? sortedAudience[0].key : 'otro';
    const dominantAudienceLabel =
      sortedAudience.length > 0 ? sortedAudience[0].label : 'Sin categoría definida';
    const dominantAudiencePercent =
      sortedAudience.length > 0 ? sortedAudience[0].percent : 0;

    const commercialPeriods: CommercialPeriodStat[] = Array.from(commercialMap.values())
      .sort((a, b) => b.ordersCount - a.ordersCount || b.spent - a.spent)
      .map((c) => ({
        ...c,
        percent: dniOrders.length > 0 ? Math.round((c.ordersCount / dniOrders.length) * 100) : 0,
      }));

    const monthPeriods: CommercialPeriodStat[] = Array.from(monthPeriodMap.values())
      .sort((a, b) => b.ordersCount - a.ordersCount || b.spent - a.spent)
      .map((m) => ({
        ...m,
        percent: dniOrders.length > 0 ? Math.round((m.ordersCount / dniOrders.length) * 100) : 0,
      }));

    const mostPurchasedSummary =
      topProducts.length > 0
        ? topProducts
            .slice(0, 2)
            .map((p) => `${p.productName} (${p.units} u.)`)
            .join(' · ')
        : 'Sin compras detalladas aún';

    const { highestUnlocked, nextTier } = getEligibleLoyaltyTiers(acc.pointsBalance, loyaltyTiers);

    return {
      id: acc.id,
      dni: cleanDni,
      isWebClient: true,
      customerName: resolvedName,
      customerPhone: resolvedPhone,
      pointsBalance: acc.pointsBalance,
      totalPointsEarned: acc.totalPointsEarned,
      totalPointsRedeemed: acc.totalPointsRedeemed,
      highestUnlockedTier: highestUnlocked,
      nextTier,
      ordersCount,
      totalSpent,
      averageTicket,
      revenueSharePercent,
      totalUnits,
      lastOrderAt: acc.lastOrderAt || latestOrder?.createdAt || null,
      topProducts,
      topCategories,
      mostPurchasedSummary,
      audienceBreakdown,
      dominantAudience,
      dominantAudienceLabel,
      dominantAudiencePercent,
      commercialPeriods,
      topCommercialPeriod: commercialPeriods[0] || null,
      monthPeriods,
      topMonthPeriod: monthPeriods[0] || null,
      upcomingCommercialEvent: upcomingEvent,
    };
  });

  customers.sort(
    (a, b) =>
      b.totalSpent - a.totalSpent ||
      b.pointsBalance - a.pointsBalance ||
      (b.lastOrderAt || '').localeCompare(a.lastOrderAt || '')
  );

  const totalLoyaltySharePercent =
    totalStoreWebRevenue > 0
      ? Math.round((totalLoyaltyRevenue / totalStoreWebRevenue) * 1000) / 10
      : 0;

  return {
    customers,
    totalStoreWebRevenue,
    totalLoyaltyRevenue,
    totalLoyaltySharePercent,
    upcomingEvent,
  };
}
