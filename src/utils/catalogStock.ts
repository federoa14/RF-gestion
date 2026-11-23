import {
  CatalogLoyaltyTier,
  CatalogPickupOrderItem,
  CatalogProduct,
  CatalogProductVariant,
  CatalogPromoSubscriber,
} from '../types';

export function hasProductVariants(product?: Pick<CatalogProduct, 'variants'> | null): boolean {
  return Boolean(product && Array.isArray(product.variants) && product.variants.length > 0);
}

export function getVariantStock(variant?: Pick<CatalogProductVariant, 'stockQuantity'> | null): number | null {
  if (!variant || typeof variant.stockQuantity !== 'number') return null;
  return Math.max(0, Math.floor(variant.stockQuantity));
}

export function getVariantDisplayPrice(
  product: Pick<CatalogProduct, 'price'>,
  variant?: Pick<CatalogProductVariant, 'price'> | null
): number {
  if (variant && typeof variant.price === 'number' && Number.isFinite(variant.price) && variant.price >= 0) {
    return variant.price;
  }
  return product.price;
}

export function computeAggregateStockFromVariants(
  variants?: CatalogProductVariant[]
): number | undefined {
  if (!variants || variants.length === 0) return undefined;
  if (variants.some((v) => typeof v.stockQuantity !== 'number')) {
    return undefined;
  }
  return variants.reduce(
    (sum, v) => sum + Math.max(0, Math.floor(v.stockQuantity as number)),
    0
  );
}

export function getProductSummaryStock(
  product: Pick<CatalogProduct, 'stockQuantity' | 'variants'>
): number | null {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const agg = computeAggregateStockFromVariants(product.variants);
    return typeof agg === 'number' ? agg : null;
  }
  if (typeof product.stockQuantity === 'number') {
    return Math.max(0, Math.floor(product.stockQuantity));
  }
  return null;
}

export function isProductFullyOutOfStock(
  product: Pick<CatalogProduct, 'stockQuantity' | 'variants'>
): boolean {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.every(
      (v) => typeof v.stockQuantity === 'number' && Math.floor(v.stockQuantity) <= 0
    );
  }
  return typeof product.stockQuantity === 'number' && Math.floor(product.stockQuantity) <= 0;
}

export function findMatchingVariant(
  product: Pick<CatalogProduct, 'variants'>,
  variantId?: string,
  variantLabel?: string
): CatalogProductVariant | undefined {
  if (!product.variants || product.variants.length === 0) return undefined;
  if (variantId) {
    const byId = product.variants.find((v) => v.id === variantId);
    if (byId) return byId;
  }
  if (variantLabel) {
    const clean = variantLabel.trim().toLowerCase();
    const byLabel = product.variants.find((v) => v.label.trim().toLowerCase() === clean);
    if (byLabel) return byLabel;
  }
  return undefined;
}

export function applyOrderStockDeltaToProducts(
  products: CatalogProduct[],
  items: CatalogPickupOrderItem[],
  mode: 'deduct' | 'restore'
): {
  updatedProducts: CatalogProduct[];
  changed: boolean;
  restoredProductIds: string[];
} {
  if (!Array.isArray(items) || items.length === 0) {
    return { updatedProducts: products, changed: false, restoredProductIds: [] };
  }

  let changed = false;
  const touchedIds = new Set<string>();
  const nowIso = new Date().toISOString();

  const cloned = products.map((p) => ({
    ...p,
    variants: p.variants ? p.variants.map((v) => ({ ...v })) : undefined,
  }));

  for (const item of items) {
    const qty = Math.max(0, Math.floor(Number(item.quantity) || 0));
    if (qty <= 0) continue;

    const targetIdx = cloned.findIndex(
      (p) =>
        p.id === item.productId ||
        p.name.trim().toLowerCase() === (item.productName || '').trim().toLowerCase()
    );
    if (targetIdx < 0) continue;

    const target = cloned[targetIdx];
    const sign = mode === 'deduct' ? -1 : 1;

    if (target.variants && target.variants.length > 0) {
      let varIdx = -1;
      if (item.variantId) {
        varIdx = target.variants.findIndex((v) => v.id === item.variantId);
      }
      if (varIdx < 0 && item.variantLabel) {
        const cleanLabel = item.variantLabel.trim().toLowerCase();
        varIdx = target.variants.findIndex(
          (v) => v.label.trim().toLowerCase() === cleanLabel
        );
      }
      if (varIdx >= 0 && typeof target.variants[varIdx].stockQuantity === 'number') {
        const prevQty = Math.max(0, Math.floor(target.variants[varIdx].stockQuantity as number));
        const nextQty = Math.max(0, prevQty + sign * qty);
        target.variants[varIdx].stockQuantity = nextQty;
        target.stockQuantity = computeAggregateStockFromVariants(target.variants);
        target.updatedAt = nowIso;
        changed = true;
        if (mode === 'restore' && prevQty <= 0 && nextQty > 0) {
          touchedIds.add(target.id);
        }
      }
    } else if (typeof target.stockQuantity === 'number') {
      const prevQty = Math.max(0, Math.floor(target.stockQuantity));
      const nextQty = Math.max(0, prevQty + sign * qty);
      target.stockQuantity = nextQty;
      target.updatedAt = nowIso;
      changed = true;
      if (mode === 'restore' && prevQty <= 0 && nextQty > 0) {
        touchedIds.add(target.id);
      }
    }
  }

  return {
    updatedProducts: changed ? cloned : products,
    changed,
    restoredProductIds: Array.from(touchedIds),
  };
}

export function getProductGalleryImages(
  product?: Pick<CatalogProduct, 'imageUrl' | 'additionalImageUrls'> | null
): string[] {
  if (!product) return [];
  const raw = [product.imageUrl || '', ...(product.additionalImageUrls || [])]
    .map((u) => (u || '').trim())
    .filter(Boolean);
  return Array.from(new Set(raw)).slice(0, 4);
}

export function getProductLowStockStatus(
  product: Pick<CatalogProduct, 'stockQuantity' | 'lowStockThreshold' | 'variants' | 'available'>,
  defaultThreshold: number = 2
): {
  isLow: boolean;
  minAvailableStock: number | null;
  lowVariants: CatalogProductVariant[];
} {
  if (!product.available) {
    return { isLow: false, minAvailableStock: null, lowVariants: [] };
  }
  const threshold = Math.max(
    1,
    Math.floor(
      typeof product.lowStockThreshold === 'number' && product.lowStockThreshold > 0
        ? product.lowStockThreshold
        : defaultThreshold
    )
  );

  if (Array.isArray(product.variants) && product.variants.length > 0) {
    const lowVariants = product.variants.filter(
      (v) => typeof v.stockQuantity === 'number' && v.stockQuantity > 0 && v.stockQuantity <= threshold
    );
    const positiveStocks = product.variants
      .map((v) => v.stockQuantity)
      .filter((s): s is number => typeof s === 'number' && s > 0);
    const minAvailable = positiveStocks.length > 0 ? Math.min(...positiveStocks) : null;
    return {
      isLow: lowVariants.length > 0,
      minAvailableStock: minAvailable,
      lowVariants,
    };
  }

  if (typeof product.stockQuantity === 'number') {
    const qty = Math.max(0, Math.floor(product.stockQuantity));
    return {
      isLow: qty > 0 && qty <= threshold,
      minAvailableStock: qty,
      lowVariants: [],
    };
  }

  return { isLow: false, minAvailableStock: null, lowVariants: [] };
}

export function getWholesaleUnitPrice(
  product: Pick<CatalogProduct, 'price' | 'wholesaleMinQty' | 'wholesalePrice'>,
  variant?: Pick<CatalogProductVariant, 'price'> | null,
  totalProductQtyInCart: number = 1
): {
  regularUnitPrice: number;
  effectiveUnitPrice: number;
  appliedWholesale: boolean;
} {
  const regularUnitPrice = getVariantDisplayPrice(product, variant);
  const minQty =
    typeof product.wholesaleMinQty === 'number' && product.wholesaleMinQty >= 2
      ? Math.floor(product.wholesaleMinQty)
      : 0;
  const wPrice =
    typeof product.wholesalePrice === 'number' &&
    Number.isFinite(product.wholesalePrice) &&
    product.wholesalePrice >= 0 &&
    product.wholesalePrice < regularUnitPrice
      ? product.wholesalePrice
      : null;

  if (minQty >= 2 && wPrice !== null && totalProductQtyInCart >= minQty) {
    return {
      regularUnitPrice,
      effectiveUnitPrice: wPrice,
      appliedWholesale: true,
    };
  }

  return {
    regularUnitPrice,
    effectiveUnitPrice: regularUnitPrice,
    appliedWholesale: false,
  };
}

export type CatalogPriceRoundingStep = 0 | 10 | 50 | 100 | 500 | 1000;

export function roundCatalogPrice(
  value: number,
  step: CatalogPriceRoundingStep = 0
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (step > 0) {
    const rounded = Math.round(value / step) * step;
    return Math.max(step <= 10 ? 1 : 0, rounded) || Math.round(value);
  }
  return Math.round(value * 100) / 100;
}

export function applyPercentagePriceAdjustment(
  product: CatalogProduct,
  percentDelta: number,
  options?: {
    roundingStep?: CatalogPriceRoundingStep;
    includeWholesale?: boolean;
    includeVariants?: boolean;
  }
): CatalogProduct {
  const step = options?.roundingStep ?? 0;
  const includeWholesale = options?.includeWholesale ?? true;
  const includeVariants = options?.includeVariants ?? true;
  const factor = 1 + percentDelta / 100;
  const nowIso = new Date().toISOString();

  const nextPrice = roundCatalogPrice(Math.max(0, product.price * factor), step);
  const nextWholesalePrice =
    includeWholesale && typeof product.wholesalePrice === 'number'
      ? roundCatalogPrice(Math.max(0, product.wholesalePrice * factor), step)
      : product.wholesalePrice;

  const nextVariants =
    includeVariants && Array.isArray(product.variants)
      ? product.variants.map((v) =>
          typeof v.price === 'number' && Number.isFinite(v.price)
            ? { ...v, price: roundCatalogPrice(Math.max(0, v.price * factor), step) }
            : v
        )
      : product.variants;

  return {
    ...product,
    price: nextPrice,
    wholesalePrice: nextWholesalePrice,
    variants: nextVariants,
    updatedAt: nowIso,
  };
}

export function applyDirectPriceUpdate(
  product: CatalogProduct,
  nextBasePrice: number,
  options?: {
    scaleWholesaleAndVariants?: boolean;
    roundingStep?: CatalogPriceRoundingStep;
  }
): CatalogProduct {
  const step = options?.roundingStep ?? 0;
  const cleanPrice = roundCatalogPrice(Math.max(0, nextBasePrice), step);
  const scaleExtras = options?.scaleWholesaleAndVariants ?? false;
  const ratio = product.price > 0 ? cleanPrice / product.price : 1;
  const nowIso = new Date().toISOString();

  const nextWholesale =
    scaleExtras && typeof product.wholesalePrice === 'number'
      ? roundCatalogPrice(Math.max(0, product.wholesalePrice * ratio), step)
      : product.wholesalePrice;

  const nextVariants =
    scaleExtras && Array.isArray(product.variants)
      ? product.variants.map((v) =>
          typeof v.price === 'number' && Number.isFinite(v.price)
            ? { ...v, price: roundCatalogPrice(Math.max(0, v.price * ratio), step) }
            : v
        )
      : product.variants;

  return {
    ...product,
    price: cleanPrice,
    wholesalePrice: nextWholesale,
    variants: nextVariants,
    updatedAt: nowIso,
  };
}

export interface UpcomingBirthdayEntry {
  subscriber: CatalogPromoSubscriber;
  daysUntil: number;
  isToday: boolean;
  formattedDayMonth: string;
}

export function getUpcomingBirthdaySubscribers(
  subscribers: CatalogPromoSubscriber[],
  withinDays: number = 7,
  referenceDate: Date = new Date()
): UpcomingBirthdayEntry[] {
  const todayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const results: UpcomingBirthdayEntry[] = [];

  for (const sub of subscribers) {
    if (!sub.active || !sub.birthDate) continue;
    const match = String(sub.birthDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) continue;
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;

    // Handle Feb 29 gracefully in non-leap years as Feb 28
    const buildCandidate = (year: number) => {
      const candidate = new Date(year, month - 1, day);
      if (candidate.getMonth() !== month - 1) {
        return new Date(year, month - 1, 28);
      }
      return candidate;
    };

    let nextBday = buildCandidate(todayStart.getFullYear());
    if (nextBday.getTime() < todayStart.getTime()) {
      nextBday = buildCandidate(todayStart.getFullYear() + 1);
    }

    const diffDays = Math.round(
      (nextBday.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays >= 0 && diffDays <= withinDays) {
      results.push({
        subscriber: sub,
        daysUntil: diffDays,
        isToday: diffDays === 0,
        formattedDayMonth: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
      });
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil || a.subscriber.name.localeCompare(b.subscriber.name));
}

export function normalizeDni(raw: string): string {
  return String(raw || '').replace(/\D+/g, '').slice(0, 11);
}

export function isValidDni(raw: string): boolean {
  const digits = normalizeDni(raw);
  return digits.length >= 6 && digits.length <= 11;
}

export function getDefaultLoyaltyTiers(): CatalogLoyaltyTier[] {
  return [
    { id: 'tier-10', minPoints: 50, discountPercent: 10, label: '10% OFF' },
    { id: 'tier-15', minPoints: 100, discountPercent: 15, label: '15% OFF' },
    { id: 'tier-20', minPoints: 150, discountPercent: 20, label: '20% OFF' },
    { id: 'tier-30', minPoints: 250, discountPercent: 30, label: '30% OFF' },
    { id: 'tier-40', minPoints: 350, discountPercent: 40, label: '40% OFF' },
    { id: 'tier-50', minPoints: 500, discountPercent: 50, label: '50% OFF' },
  ];
}

export function normalizeLoyaltyTiers(tiers?: CatalogLoyaltyTier[]): CatalogLoyaltyTier[] {
  const base = Array.isArray(tiers) && tiers.length > 0 ? tiers : getDefaultLoyaltyTiers();
  return base
    .map((t) => ({
      ...t,
      minPoints: Math.max(1, Math.floor(Number(t.minPoints) || 0)),
      discountPercent: Math.max(1, Math.min(90, Number(t.discountPercent) || 0)),
    }))
    .filter((t) => t.minPoints > 0 && t.discountPercent > 0)
    .sort((a, b) => a.minPoints - b.minPoints || a.discountPercent - b.discountPercent);
}

export function getProductPointsPerUnit(
  product?: Pick<CatalogProduct, 'loyaltyPoints'> | null,
  storeDefaultPointsPerUnit: number = 10
): number {
  if (
    product &&
    typeof product.loyaltyPoints === 'number' &&
    Number.isFinite(product.loyaltyPoints) &&
    product.loyaltyPoints >= 0
  ) {
    return Math.floor(product.loyaltyPoints);
  }
  return Math.max(0, Math.floor(Number(storeDefaultPointsPerUnit) || 0));
}

export function getEligibleLoyaltyTiers(
  pointsBalance: number,
  tiers?: CatalogLoyaltyTier[]
): {
  orderedTiers: CatalogLoyaltyTier[];
  unlockedTiers: CatalogLoyaltyTier[];
  highestUnlocked: CatalogLoyaltyTier | null;
  nextTier: CatalogLoyaltyTier | null;
} {
  const orderedTiers = normalizeLoyaltyTiers(tiers);
  const bal = Math.max(0, Math.floor(Number(pointsBalance) || 0));
  const unlockedTiers = orderedTiers.filter((t) => bal >= t.minPoints);
  const highestUnlocked = unlockedTiers.length > 0 ? unlockedTiers[unlockedTiers.length - 1] : null;
  const nextTier = orderedTiers.find((t) => bal < t.minPoints) || null;
  return {
    orderedTiers,
    unlockedTiers,
    highestUnlocked,
    nextTier,
  };
}

export function isLoyaltyRedemptionEligible(params: {
  deliveryMethod: 'retiro' | 'envio';
  paymentGroup: 'transferencia' | 'mercadopago' | 'efectivo' | 'acordar';
  mpSubOption?: 'dinero_en_cuenta' | 'tarjetas_todos';
  restrictToEligibleMethods?: boolean;
}): boolean {
  if (params.restrictToEligibleMethods === false) return true;
  if (params.paymentGroup === 'transferencia') return true;
  if (
    params.paymentGroup === 'mercadopago' &&
    params.mpSubOption === 'dinero_en_cuenta'
  ) {
    return true;
  }
  if (
    params.deliveryMethod === 'retiro' &&
    !(params.paymentGroup === 'mercadopago' && params.mpSubOption !== 'dinero_en_cuenta')
  ) {
    return true;
  }
  return false;
}
