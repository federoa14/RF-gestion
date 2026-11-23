import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  ShoppingCart,
  MapPin,
  Clock,
  MessageCircle,
  Plus,
  Minus,
  Trash2,
  X,
  Image as ImageIcon,
  CheckCircle2,
  ArrowLeft,
  Store,
  CreditCard,
  Star,
  Truck,
  Bell,
  Tag,
  Copy,
  Check,
  Upload,
  Wallet,
  Banknote,
  ExternalLink,
  RefreshCw,
  FileCheck2,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
  Gift,
  ShieldCheck,
  Percent,
  ZoomIn,
  ArrowRight,
  Award,
  UserCheck,
} from 'lucide-react';
import {
  CatalogCoupon,
  CatalogLoyaltyAccount,
  CatalogLoyaltyTier,
  CatalogOrderStageNotification,
  CatalogPaymentMethod,
  CatalogPickupOrder,
  CatalogProduct,
  CatalogProductVariant,
  CatalogPromoBanner,
  CatalogPromoSubscriber,
  CatalogStockAlertRequest,
  PublishedPublicCatalog,
} from '../types';
import {
  createCatalogOrderMercadoPagoPreference,
  fetchPublicCatalogFromSupabase,
  fetchPublicCatalogLoyaltyAccountFromSupabase,
  fetchPublicCatalogOrderFromSupabase,
  notifyCatalogOrderCustomerStageViaServer,
  submitCatalogPromoSubscriberToSupabase,
  submitCatalogStockAlertToSupabase,
  submitPublicCatalogOrderToSupabase,
  syncCatalogOrderToSupabase,
  upsertCatalogLoyaltyAccountToSupabase,
  verifyCatalogOrderMercadoPagoPayment,
  verifyCatalogTransferReceiptViaServer,
} from '../utils/supabaseServices';
import { formatCurrency } from '../utils/alerts';
import { getCatalogRubroPreset, normalizeFilterList } from '../utils/catalogRubros';
import {
  applyOrderStockDeltaToProducts,
  getEligibleLoyaltyTiers,
  getProductGalleryImages,
  getProductPointsPerUnit,
  getVariantDisplayPrice,
  getVariantStock,
  getWholesaleUnitPrice,
  hasProductVariants,
  isLoyaltyRedemptionEligible,
  isProductFullyOutOfStock,
  isValidDni,
  normalizeDni,
  normalizeLoyaltyTiers,
} from '../utils/catalogStock';
import {
  createWhatsAppUrl,
  generateCatalogOrderCustomerProcessMessage,
} from '../utils/whatsapp';
import { BrandMark } from './BrandMark';

interface PublicCatalogViewProps {
  catalogHandle: string;
  onExitToApp: () => void;
}

interface CartEntry {
  key: string;
  product: CatalogProduct;
  variant?: CatalogProductVariant;
  quantity: number;
}

async function createCompactOrderThumbnail(src?: string): Promise<string | undefined> {
  const clean = (src || '').trim();
  if (!clean) return undefined;
  if (!clean.startsWith('data:image/')) {
    return clean;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(clean);
    img.onload = () => {
      try {
        const maxSide = 240;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxSide) / width));
            width = maxSide;
          } else {
            width = Math.max(1, Math.round((width * maxSide) / height));
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(clean);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        resolve(clean);
      }
    };
    img.src = clean;
  });
}

async function compressTransferReceiptFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Subí una imagen válida (JPG, PNG o captura de pantalla).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen del comprobante.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('La imagen del comprobante no es válida.'));
      img.onload = () => {
        const maxSide = 1100;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxSide) / width));
            width = maxSide;
          } else {
            width = Math.max(1, Math.round((width * maxSide) / height));
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen.'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function isSafeExternalHttpUrl(url?: string): boolean {
  return Boolean(url && /^https?:\/\//i.test(url.trim()));
}

export const PublicCatalogView: React.FC<PublicCatalogViewProps> = ({
  catalogHandle,
  onExitToApp,
}) => {
  const [catalog, setCatalog] = useState<PublishedPublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubfilter, setSelectedSubfilter] = useState('Todos');
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Checkout pickup / delivery & payment fields
  const [deliveryMethod, setDeliveryMethod] = useState<'retiro' | 'envio'>('retiro');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupWindow, setPickupWindow] = useState('Hoy en horario comercial');
  const [selectedPayGroup, setSelectedPayGroup] = useState<
    'transferencia' | 'mercadopago' | 'efectivo' | 'acordar'
  >('transferencia');
  const [mpSubOption, setMpSubOption] = useState<'dinero_en_cuenta' | 'tarjetas_todos'>(
    'dinero_en_cuenta'
  );
  const [transferReceiptImageUrl, setTransferReceiptImageUrl] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [isCompressingReceipt, setIsCompressingReceipt] = useState(false);
  const [copiedField, setCopiedField] = useState<'alias' | 'cvu' | null>(null);
  const [orderNotes, setOrderNotes] = useState('');
  const [optInPromoClub, setOptInPromoClub] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCreatingMpLink, setIsCreatingMpLink] = useState(false);
  const [isRefreshingOrderStatus, setIsRefreshingOrderStatus] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<{
    order: CatalogPickupOrder;
    whatsappUrl: string;
    customerStageWhatsappUrl: string;
    autoWaDispatched?: boolean;
    mpCheckoutUrl?: string;
    mpFeedback?: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Multi-photo gallery carousel & zoom lightbox
  const [cardImageIndexByProductId, setCardImageIndexByProductId] = useState<Record<string, number>>({});
  const [zoomedGallery, setZoomedGallery] = useState<{
    title: string;
    images: string[];
    index: number;
    sku?: string;
  } | null>(null);

  // Coupons & transfer verification preview state
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CatalogCoupon | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);
  const [bannerAppliedNotice, setBannerAppliedNotice] = useState<string | null>(null);
  const [transferVerifyPreview, setTransferVerifyPreview] = useState<{
    checking: boolean;
    approved?: boolean;
    duplicate?: boolean;
    operationId?: string;
    summary?: string;
  } | null>(null);

  // Promo Club storefront form state
  const [promoSubName, setPromoSubName] = useState('');
  const [promoSubPhone, setPromoSubPhone] = useState('');
  const [promoSubEmail, setPromoSubEmail] = useState('');
  const [promoSubCategory, setPromoSubCategory] = useState('');
  const [promoSubBirthDate, setPromoSubBirthDate] = useState('');
  const [promoSubSubmitting, setPromoSubSubmitting] = useState(false);
  const [promoSubSubmitted, setPromoSubSubmitted] = useState(false);
  const [promoSubError, setPromoSubError] = useState<string | null>(null);
  const [copiedWelcomeCoupon, setCopiedWelcomeCoupon] = useState(false);

  // Stock alert request modal state ("Avisar cuando haya stock")
  const [stockAlertProduct, setStockAlertProduct] = useState<CatalogProduct | null>(null);
  const [stockAlertVariant, setStockAlertVariant] = useState<CatalogProductVariant | null>(null);
  const [selectedVariantByProductId, setSelectedVariantByProductId] = useState<Record<string, string>>({});
  const [alertCustomerName, setAlertCustomerName] = useState('');
  const [alertCustomerPhone, setAlertCustomerPhone] = useState('');
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertSubmitted, setAlertSubmitted] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  // DNI Loyalty Program state (available right at top of catalog & at checkout)
  const [loyaltyDniInput, setLoyaltyDniInput] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.sessionStorage.getItem(`public_catalog_dni_${catalogHandle}`) || '';
    } catch {
      return '';
    }
  });
  const [activeLoyaltyDni, setActiveLoyaltyDni] = useState('');
  const [loyaltyAccount, setLoyaltyAccount] = useState<CatalogLoyaltyAccount | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyFeedback, setLoyaltyFeedback] = useState<string | null>(null);
  const [selectedRedeemTier, setSelectedRedeemTier] = useState<CatalogLoyaltyTier | null>(null);
  const [bannerImageErrorIds, setBannerImageErrorIds] = useState<Record<string, boolean>>({});

  const buildOrderWhatsAppLinks = (
    order: CatalogPickupOrder,
    cat: PublishedPublicCatalog
  ) => {
    const currencySym = order.currencySymbol || cat.currencySymbol || '$';
    const isDel = order.deliveryMethod === 'envio';
    const payKey = order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
    const paymentLabelMap: Record<string, string> = {
      acordar: 'A coordinar con el vendedor',
      transferencia: 'Transferencia bancaria / Alias',
      efectivo: isDel ? 'Efectivo contra entrega' : 'Efectivo al retirar',
      link_pago: 'Mercado Pago (Tarjetas / Link)',
      mercadopago_dinero_cuenta: 'Mercado Pago (Dinero en cuenta)',
      fiado: 'Cuenta Corriente',
    };
    const itemLines = order.items
      .map(
        (it) =>
          `• ${it.quantity} × ${it.productName}${
            it.variantLabel ? ` [${it.variantLabel}]` : ''
          }${it.unitLabel ? ` (${it.unitLabel})` : ''}${
            it.sku ? ` [Cód: ${it.sku}]` : ''
          } — ${formatCurrency(it.unitPrice, currencySym)} c/u = *${formatCurrency(it.subtotal, currencySym)}*`
      )
      .join('\n');

    const modalityBlock = isDel
      ? `🚚 *Modalidad:* ENVÍO A DOMICILIO\n📍 *Dirección de entrega:* ${order.deliveryAddress || ''}\n🕒 *Horario preferido:* ${order.preferredPickupWindow || 'A coordinar'}\n`
      : `🏪 *Modalidad:* RETIRO EN TIENDA\n${
          cat.pickupAddress ? `📍 *Local:* ${cat.pickupAddress}\n` : ''
        }🕒 *Retiro estimado:* ${order.preferredPickupWindow || 'A coordinar'}\n`;

    const paymentReceiptLine = order.transferReceiptImageUrl
      ? `📎 *Comprobante de pago:* Adjuntado por el cliente en el pedido web${
          order.transferReference ? ` (Ref: ${order.transferReference})` : ''
        }\n`
      : order.transferReference
      ? `🔖 *Ref. de pago:* ${order.transferReference}\n`
      : '';

    const specificObservationText = (order.customerSpecificRequest || order.notes || '').trim();

    const discountLines: string[] = [];
    if (order.wholesaleSavings && order.wholesaleSavings > 0) {
      discountLines.push(
        `• Ahorro precio mayorista: -${formatCurrency(order.wholesaleSavings, currencySym)}`
      );
    }
    if (order.couponDiscountAmount && order.couponDiscountAmount > 0) {
      discountLines.push(
        `• Cupón ${order.couponCode || ''}: -${formatCurrency(order.couponDiscountAmount, currencySym)}`
      );
    }
    if (order.loyaltyDiscountAmount && order.loyaltyDiscountAmount > 0) {
      discountLines.push(
        `• Canje Puntos DNI (${order.loyaltyDiscountPercent || 0}%): -${formatCurrency(order.loyaltyDiscountAmount, currencySym)}`
      );
    }
    if (order.paymentMethodDiscountAmount && order.paymentMethodDiscountAmount > 0) {
      discountLines.push(
        `• Bonificación Efectivo/Transf. (${order.paymentMethodDiscountPercent || 0}%): -${formatCurrency(order.paymentMethodDiscountAmount, currencySym)}`
      );
    }
    const discountBlock =
      discountLines.length > 0 ? `\n🏷️ *Descuentos aplicados:*\n${discountLines.join('\n')}\n` : '';

    const loyaltyLine = order.customerDni
      ? `🪪 *DNI Puntos:* ${order.customerDni}${
          typeof order.loyaltyPointsEarned === 'number' && order.loyaltyPointsEarned > 0
            ? ` (+${order.loyaltyPointsEarned} pts sumados`
            : ''
        }${
          typeof order.loyaltyPointsRedeemed === 'number' && order.loyaltyPointsRedeemed > 0
            ? `${order.loyaltyPointsEarned ? ', ' : ' ('}-${order.loyaltyPointsRedeemed} pts canjeados`
            : ''
        }${
          (order.loyaltyPointsEarned || 0) > 0 || (order.loyaltyPointsRedeemed || 0) > 0
            ? ')'
            : ''
        }\n`
      : '';

    const sellerMsg =
      `🛒 *NUEVO PEDIDO ONLINE — #${order.orderNumber}*\n` +
      `Tienda: *${cat.storeName}*\n\n` +
      `👤 *Cliente:* ${order.customerName}\n` +
      `📱 *WhatsApp cliente:* ${order.customerPhone}\n` +
      loyaltyLine +
      modalityBlock +
      `💳 *Forma de pago:* ${paymentLabelMap[payKey] || payKey}\n` +
      paymentReceiptLine +
      `\n*Detalle para facturar (${order.items.length} ítem${order.items.length === 1 ? '' : 's'}):*\n${itemLines}\n` +
      discountBlock +
      `\n💰 *TOTAL DEL PEDIDO: ${formatCurrency(order.totalAmount, currencySym)}*\n` +
      (specificObservationText
        ? `📝 *Observaciones / Pedido específico:* ${specificObservationText}\n`
        : '') +
      `\n${
        isDel
          ? 'Te envío el pedido para confirmar pago, armar y despachar el envío a domicilio. ¡Muchas gracias!'
          : 'Te envío el pedido para confirmar pago, armar y avisarme cuando esté listo para pasar a buscar. ¡Muchas gracias!'
      }`;

    const sellerPhone = (cat.whatsappPhone || '').trim();
    const whatsappUrl = sellerPhone
      ? createWhatsAppUrl(sellerPhone, sellerMsg)
      : `https://wa.me/?text=${encodeURIComponent(sellerMsg)}`;

    const currentStage =
      order.status === 'retirado'
        ? 'retirado'
        : order.status === 'en_camino'
        ? 'en_camino'
        : order.status === 'listo_para_retirar'
        ? 'listo_para_retirar'
        : 'en_proceso_armando';

    const customerStageMsg = generateCatalogOrderCustomerProcessMessage({
      order,
      stage: currentStage,
      storeName: cat.storeName,
      pickupAddress: cat.pickupAddress,
      pickupHours: cat.pickupHours,
    });
    const customerStageWhatsappUrl = createWhatsAppUrl(order.customerPhone, customerStageMsg);

    return { whatsappUrl, customerStageWhatsappUrl, customerStageMsg };
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPublicCatalogFromSupabase(catalogHandle)
      .then(async (res) => {
        if (!active) return;
        setCatalog(res);
        if (res) {
          if (res.allowPickup === false && res.allowDelivery !== false) {
            setDeliveryMethod('envio');
          } else {
            setDeliveryMethod('retiro');
          }
          if (res.storeName) {
            document.title = `${res.storeName} · Catálogo Online`;
          }

          // Verificar si vuelve desde Checkout Pro de Mercado Pago (?order_id=...&mp_status=...)
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const returnOrderId = (params.get('order_id') || '').trim();
            const mpStatus = (params.get('mp_status') || '').trim().toLowerCase();
            const mpPaymentId = (
              params.get('payment_id') ||
              params.get('collection_id') ||
              ''
            ).trim();
            const collectionStatus = (
              params.get('collection_status') ||
              mpStatus ||
              ''
            )
              .trim()
              .toLowerCase();

            if (returnOrderId) {
              const foundOrder = await fetchPublicCatalogOrderFromSupabase(
                returnOrderId,
                res.tenantId
              );
              if (active && foundOrder) {
                let updatedOrder = foundOrder;
                let mpFeedback = '';
                if (mpStatus === 'approved' || collectionStatus === 'approved' || mpPaymentId) {
                  const verifyRes = await verifyCatalogOrderMercadoPagoPayment({
                    orderId: foundOrder.id,
                    tenantId: res.tenantId,
                    paymentId: mpPaymentId || undefined,
                    collectionStatus: collectionStatus || mpStatus,
                    mpSubOption: foundOrder.mpSubOption,
                  });
                  if (verifyRes.verified && verifyRes.order) {
                    updatedOrder = verifyRes.order;
                    mpFeedback = '¡Pago acreditado en Mercado Pago! Tu pedido ya está en preparación.';
                  } else if (verifyRes.message) {
                    mpFeedback = verifyRes.message;
                  }
                } else if (mpStatus === 'pending') {
                  mpFeedback = 'Tu pago quedó pendiente de acreditación en Mercado Pago.';
                } else if (mpStatus === 'failure') {
                  mpFeedback = 'El pago en Mercado Pago no se completó. Podés reintentar o pagar por transferencia.';
                }

                const links = buildOrderWhatsAppLinks(updatedOrder, res);
                setSubmittedOrder({
                  order: updatedOrder,
                  whatsappUrl: links.whatsappUrl,
                  customerStageWhatsappUrl: links.customerStageWhatsappUrl,
                  mpCheckoutUrl: isSafeExternalHttpUrl(updatedOrder.mpInitPoint)
                    ? updatedOrder.mpInitPoint
                    : isSafeExternalHttpUrl(res.merchantMpCheckoutLink)
                    ? res.merchantMpCheckoutLink
                    : undefined,
                  mpFeedback: mpFeedback || undefined,
                });
                setIsCartOpen(true);
              }

              // Limpiar parámetros de MP de la barra sin perder ?catalog=
              const cleanUrl = `${window.location.pathname}?catalog=${encodeURIComponent(
                catalogHandle
              )}`;
              window.history.replaceState({}, '', cleanUrl);
            }
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [catalogHandle]);

  const handleLookupLoyaltyDni = async (rawDni?: string, silent = false) => {
    if (!catalog?.enableLoyaltyProgram) return;
    const cleanDni = normalizeDni(rawDni ?? loyaltyDniInput);
    setLoyaltyDniInput(cleanDni);
    if (!isValidDni(cleanDni)) {
      if (!silent) {
        setLoyaltyFeedback('Ingresá un DNI válido (entre 6 y 11 números sin puntos).');
      }
      setActiveLoyaltyDni('');
      setLoyaltyAccount(null);
      setSelectedRedeemTier(null);
      return;
    }

    setLoyaltyLoading(true);
    if (!silent) setLoyaltyFeedback(null);
    try {
      const existing = await fetchPublicCatalogLoyaltyAccountFromSupabase(
        catalog.tenantId,
        cleanDni
      );
      setActiveLoyaltyDni(cleanDni);
      setLoyaltyAccount(existing);
      if (existing?.customerName && !customerName.trim()) {
        setCustomerName(existing.customerName);
      }
      if (existing?.customerPhone && !customerPhone.trim()) {
        setCustomerPhone(existing.customerPhone);
      }
      try {
        window.sessionStorage.setItem(`public_catalog_dni_${catalogHandle}`, cleanDni);
      } catch {
        // ignore storage error
      }

      if (existing) {
        const { highestUnlocked } = getEligibleLoyaltyTiers(
          existing.pointsBalance,
          catalog.loyaltyTiers
        );
        if (!silent) {
          setLoyaltyFeedback(
            highestUnlocked
              ? `DNI ${cleanDni} activo: tenés ${existing.pointsBalance} pts (podés canjear hasta ${highestUnlocked.discountPercent}% OFF al cerrar tu compra).`
              : `DNI ${cleanDni} activo: tenés ${existing.pointsBalance} pts acumulados.`
          );
        }
      } else {
        setSelectedRedeemTier(null);
        if (!silent) {
          setLoyaltyFeedback(
            `DNI ${cleanDni} registrado para esta compra: todavía tiene 0 pts, pero sumás puntos con cada producto que compres hoy.`
          );
        }
      }
    } finally {
      setLoyaltyLoading(false);
    }
  };

  useEffect(() => {
    if (!catalog?.enableLoyaltyProgram || !catalog?.tenantId) return;
    const clean = normalizeDni(loyaltyDniInput);
    if (!isValidDni(clean)) {
      if (!clean && activeLoyaltyDni) {
        setActiveLoyaltyDni('');
        setLoyaltyAccount(null);
        setSelectedRedeemTier(null);
        setLoyaltyFeedback(null);
      }
      return;
    }
    if (clean === activeLoyaltyDni) return;
    const timer = window.setTimeout(() => {
      void handleLookupLoyaltyDni(clean, false);
    }, 450);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loyaltyDniInput, catalog?.tenantId, catalog?.enableLoyaltyProgram]);

  const rubroPreset = useMemo(
    () => (catalog?.catalogRubro ? getCatalogRubroPreset(catalog.catalogRubro) : null),
    [catalog?.catalogRubro]
  );

  const activeProducts = useMemo(() => {
    if (!catalog?.products) return [];
    const targetRubro = catalog.catalogRubro;
    return catalog.products.filter(
      (p) => p.available && (!targetRubro || !p.rubro || p.rubro === targetRubro)
    );
  }, [catalog]);

  const categories = useMemo(() => {
    const primaryFilters = normalizeFilterList(
      catalog?.rubroFilters && catalog.rubroFilters.length > 0
        ? catalog.rubroFilters
        : rubroPreset?.defaultFilters
    );
    const set = new Set<string>(['Todas', ...primaryFilters]);
    activeProducts.forEach((p) => {
      if (p.category?.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [activeProducts, catalog?.rubroFilters, rubroPreset]);

  const availableSubfilters = useMemo(() => {
    return normalizeFilterList([
      ...(catalog?.customSubfilters || []),
      ...activeProducts.flatMap((p) => p.subfilters || []),
    ]);
  }, [catalog?.customSubfilters, activeProducts]);

  const normalizeSearchText = (text: string): string =>
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchTerm.trim());
    const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];

    return activeProducts
      .filter((p) => {
        if (selectedCategory !== 'Todas' && p.category !== selectedCategory) return false;
        if (
          selectedSubfilter !== 'Todos' &&
          !(p.subfilters || []).some(
            (sf) => sf.trim().toLowerCase() === selectedSubfilter.trim().toLowerCase()
          )
        ) {
          return false;
        }
        if (tokens.length === 0) return true;
        const searchable = normalizeSearchText(
          `${p.name || ''} ${p.description || ''} ${p.category || ''} ${(p.subfilters || []).join(' ')} ${p.unitLabel || ''} ${p.sku || ''} ${(p.variants || []).map((v) => `${v.label} ${v.sku || ''}`).join(' ')}`
        );
        return tokens.every((token) => searchable.includes(token));
      })
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  }, [activeProducts, searchTerm, selectedCategory, selectedSubfilter]);

  const resolveActiveVariantForProduct = (product: CatalogProduct): CatalogProductVariant | undefined => {
    if (!hasProductVariants(product)) return undefined;
    const list = product.variants || [];
    const pickedId = selectedVariantByProductId[product.id];
    if (pickedId) {
      const hit = list.find((v) => v.id === pickedId);
      if (hit) return hit;
    }
    // Prefer first variant with stock > 0 or free stock
    const firstAvailable = list.find((v) => {
      const st = getVariantStock(v);
      return st === null || st > 0;
    });
    return firstAvailable || list[0];
  };

  const makeCartKey = (productId: string, variantId?: string) =>
    `${productId}::${variantId || 'base'}`;

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalCartUnits = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  // Total quantity per product ID (combining variants) for wholesale pricing calculation
  const productQuantitiesInCart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of cartItems) {
      counts[entry.product.id] = (counts[entry.product.id] || 0) + entry.quantity;
    }
    return counts;
  }, [cartItems]);

  // Loyalty points that current cart items will earn
  const cartEarnedPoints = useMemo(() => {
    if (!catalog?.enableLoyaltyProgram) return 0;
    const defaultPts =
      typeof catalog.loyaltyPointsPerUnit === 'number' ? catalog.loyaltyPointsPerUnit : 10;
    return cartItems.reduce((sum, entry) => {
      const liveP = catalog.products.find((p) => p.id === entry.product.id) || entry.product;
      return sum + getProductPointsPerUnit(liveP, defaultPts) * entry.quantity;
    }, 0);
  }, [cartItems, catalog]);

  const isRedeemPaymentEligible = useMemo(
    () =>
      isLoyaltyRedemptionEligible({
        deliveryMethod,
        paymentGroup: selectedPayGroup,
        mpSubOption,
        restrictToEligibleMethods: catalog?.loyaltyRestrictRedeemMethods !== false,
      }),
    [deliveryMethod, selectedPayGroup, mpSubOption, catalog?.loyaltyRestrictRedeemMethods]
  );

  const cartPricingBreakdown = useMemo(() => {
    let regularSubtotal = 0;
    let wholesaleSubtotal = 0;

    for (const entry of cartItems) {
      const liveP = catalog?.products.find((p) => p.id === entry.product.id) || entry.product;
      const liveVar = entry.variant
        ? liveP.variants?.find((v) => v.id === entry.variant?.id) || entry.variant
        : undefined;
      const totalQtyForProduct = productQuantitiesInCart[entry.product.id] || entry.quantity;
      const regPrice = getVariantDisplayPrice(liveP, liveVar);
      const { effectiveUnitPrice: effPrice } = getWholesaleUnitPrice(
        liveP,
        liveVar,
        totalQtyForProduct
      );

      regularSubtotal += regPrice * entry.quantity;
      wholesaleSubtotal += effPrice * entry.quantity;
    }

    const wholesaleSavings = Math.max(0, Math.round((regularSubtotal - wholesaleSubtotal) * 100) / 100);

    let couponDiscount = 0;
    let couponInvalidReason: string | null = null;
    if (appliedCoupon) {
      if (appliedCoupon.minPurchase && wholesaleSubtotal < appliedCoupon.minPurchase) {
        couponInvalidReason = `Requiere compra mínima de ${formatCurrency(
          appliedCoupon.minPurchase,
          catalog?.currencySymbol || '$'
        )}`;
      } else if (appliedCoupon.discountType === 'percent') {
        couponDiscount = Math.round(((wholesaleSubtotal * appliedCoupon.value) / 100) * 100) / 100;
      } else {
        couponDiscount = Math.min(wholesaleSubtotal, Math.max(0, appliedCoupon.value));
      }
    }

    const afterCoupon = Math.max(0, wholesaleSubtotal - couponDiscount);

    // Apply DNI Loyalty Tier discount if active, payment/delivery eligible, and customer has enough points
    const currentPointsBalance = loyaltyAccount?.pointsBalance || 0;
    const eligibleRedeemTier =
      catalog?.enableLoyaltyProgram &&
      activeLoyaltyDni &&
      isRedeemPaymentEligible &&
      selectedRedeemTier &&
      currentPointsBalance >= selectedRedeemTier.minPoints
        ? selectedRedeemTier
        : null;
    const loyaltyDiscountPercent = eligibleRedeemTier ? eligibleRedeemTier.discountPercent : 0;
    const loyaltyDiscountAmount =
      loyaltyDiscountPercent > 0
        ? Math.round(((afterCoupon * loyaltyDiscountPercent) / 100) * 100) / 100
        : 0;
    const redeemedPointsCost = eligibleRedeemTier ? eligibleRedeemTier.minPoints : 0;

    const afterLoyalty = Math.max(0, afterCoupon - loyaltyDiscountAmount);
    const cashTransferPct =
      selectedPayGroup === 'transferencia' || selectedPayGroup === 'efectivo'
        ? Math.max(0, Math.min(90, Number(catalog?.cashOrTransferDiscountPercent) || 0))
        : 0;
    const paymentMethodDiscountAmount =
      cashTransferPct > 0 ? Math.round(((afterLoyalty * cashTransferPct) / 100) * 100) / 100 : 0;

    const finalTotal = Math.max(0, Math.round((afterLoyalty - paymentMethodDiscountAmount) * 100) / 100);

    return {
      regularSubtotal,
      wholesaleSubtotal,
      wholesaleSavings,
      couponDiscount,
      couponInvalidReason,
      loyaltyDiscountPercent,
      loyaltyDiscountAmount,
      redeemedPointsCost,
      paymentMethodDiscountPercent: cashTransferPct,
      paymentMethodDiscountAmount,
      finalTotal,
    };
  }, [
    cartItems,
    catalog,
    productQuantitiesInCart,
    appliedCoupon,
    selectedPayGroup,
    loyaltyAccount,
    activeLoyaltyDni,
    isRedeemPaymentEligible,
    selectedRedeemTier,
  ]);

  const totalCartAmount = cartPricingBreakdown.finalTotal;

  const addToCart = (product: CatalogProduct, variant?: CatalogProductVariant) => {
    const trackedStock = variant
      ? getVariantStock(variant)
      : typeof product.stockQuantity === 'number'
      ? Math.max(0, Math.floor(product.stockQuantity))
      : null;
    if (trackedStock !== null && trackedStock <= 0) return;

    const key = makeCartKey(product.id, variant?.id);
    setCart((prev) => {
      const existing = prev[key];
      const nextQty = existing ? existing.quantity + 1 : 1;
      const clampedQty = trackedStock !== null ? Math.min(nextQty, trackedStock) : nextQty;
      if (clampedQty <= 0) return prev;
      return {
        ...prev,
        [key]: {
          key,
          product,
          variant,
          quantity: clampedQty,
        },
      };
    });
  };

  const updateCartQty = (cartKey: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[cartKey];
      if (!existing) return prev;
      const liveProduct =
        catalog?.products.find((p) => p.id === existing.product.id) || existing.product;
      const liveVariant = existing.variant
        ? liveProduct.variants?.find((v) => v.id === existing.variant?.id) || existing.variant
        : undefined;
      const trackedStock = liveVariant
        ? getVariantStock(liveVariant)
        : typeof liveProduct.stockQuantity === 'number'
        ? Math.max(0, Math.floor(liveProduct.stockQuantity))
        : null;
      let nextQty = existing.quantity + delta;
      if (trackedStock !== null && delta > 0) {
        nextQty = Math.min(nextQty, trackedStock);
      }
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[cartKey];
        return copy;
      }
      return {
        ...prev,
        [cartKey]: { key: cartKey, product: liveProduct, variant: liveVariant, quantity: nextQty },
      };
    });
  };

  const removeCartItem = (cartKey: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[cartKey];
      return copy;
    });
  };

  const openStockAlertModal = (product: CatalogProduct, variant?: CatalogProductVariant) => {
    setStockAlertProduct(product);
    setStockAlertVariant(variant || null);
    setAlertCustomerName((prev) => prev || customerName);
    setAlertCustomerPhone((prev) => prev || customerPhone);
    setAlertSubmitted(false);
    setAlertError(null);
  };

  const handleSubmitStockAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalog || !stockAlertProduct) return;
    setAlertError(null);

    const cleanName = alertCustomerName.trim();
    const cleanPhone = alertCustomerPhone.trim();
    if (!cleanName) {
      setAlertError('Ingresá tu nombre para poder avisarte.');
      return;
    }
    if (!cleanPhone) {
      setAlertError('Ingresá tu teléfono o WhatsApp para enviarte el aviso.');
      return;
    }

    setAlertSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const request: CatalogStockAlertRequest = {
        id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: catalog.tenantId,
        productId: stockAlertProduct.id,
        productName: stockAlertProduct.name,
        productSku:
          stockAlertVariant?.sku?.trim() || stockAlertProduct.sku?.trim() || undefined,
        variantId: stockAlertVariant?.id,
        variantLabel: stockAlertVariant?.label,
        customerName: cleanName,
        customerPhone: cleanPhone,
        status: 'pending',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await submitCatalogStockAlertToSupabase(request);
      setAlertSubmitted(true);
      setCustomerName((prev) => prev || cleanName);
      setCustomerPhone((prev) => prev || cleanPhone);
    } catch {
      setAlertError('No pudimos guardar tu solicitud. Intentá nuevamente en unos segundos.');
    } finally {
      setAlertSubmitting(false);
    }
  };

  const handleCopyStoreBankField = (field: 'alias' | 'cvu', text?: string) => {
    const clean = (text || '').trim();
    if (!clean) return;
    navigator.clipboard?.writeText(clean);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError(null);
    setTransferVerifyPreview(null);
    setIsCompressingReceipt(true);
    try {
      const compressed = await compressTransferReceiptFile(file);
      setTransferReceiptImageUrl(compressed);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'No pudimos procesar la imagen del comprobante.'
      );
    } finally {
      setIsCompressingReceipt(false);
    }
  };

  const handleApplyCouponCode = (explicitCode?: string) => {
    const clean = (explicitCode ?? couponCodeInput).trim().toUpperCase().replace(/\s+/g, '');
    setCouponFeedback(null);
    if (!clean) {
      setAppliedCoupon(null);
      return;
    }
    const available = (catalog?.coupons || []).filter((c) => c.active !== false);
    const matched = available.find((c) => c.code.trim().toUpperCase() === clean);
    if (!matched) {
      setAppliedCoupon(null);
      setCouponFeedback(`El cupón "${clean}" no es válido o venció.`);
      return;
    }
    if (matched.minPurchase && cartPricingBreakdown.wholesaleSubtotal < matched.minPurchase) {
      setAppliedCoupon(null);
      setCouponFeedback(
        `El cupón "${clean}" requiere compra mínima de ${formatCurrency(
          matched.minPurchase,
          catalog?.currencySymbol || '$'
        )}.`
      );
      return;
    }
    setCouponCodeInput(matched.code);
    setAppliedCoupon(matched);
    setCouponFeedback(
      matched.discountType === 'percent'
        ? `¡Cupón ${matched.code} aplicado! (${matched.value}% OFF)`
        : `¡Cupón ${matched.code} aplicado! (-${formatCurrency(
            matched.value,
            catalog?.currencySymbol || '$'
          )})`
    );
  };

  const handleBannerClick = (banner: CatalogPromoBanner) => {
    const notes: string[] = [];
    if (banner.filterCategory && categories.includes(banner.filterCategory)) {
      setSelectedCategory(banner.filterCategory);
      setSelectedSubfilter(banner.filterSubfilter || 'Todos');
      notes.push(`Categoría "${banner.filterCategory}" filtrada`);
    } else if (banner.filterSubfilter) {
      setSelectedSubfilter(banner.filterSubfilter);
      notes.push(`Subfiltro "${banner.filterSubfilter}" aplicado`);
    }

    if (banner.couponCode) {
      const code = banner.couponCode.trim().toUpperCase();
      setCouponCodeInput(code);
      const matched = (catalog?.coupons || []).find(
        (c) => c.active !== false && c.code.trim().toUpperCase() === code
      );
      if (matched) {
        if (!matched.minPurchase || cartPricingBreakdown.wholesaleSubtotal >= matched.minPurchase) {
          setAppliedCoupon(matched);
          const desc =
            matched.discountType === 'percent'
              ? `${matched.value}% OFF`
              : `${formatCurrency(matched.value, catalog?.currencySymbol || '$')} OFF`;
          setCouponFeedback(`¡Cupón ${matched.code} aplicado! (${desc})`);
          notes.push(`Cupón ${matched.code} (${desc}) activo en tu carrito`);
        } else {
          notes.push(
            `Cupón ${matched.code} pre-cargado (aplica desde ${formatCurrency(
              matched.minPurchase,
              catalog?.currencySymbol || '$'
            )})`
          );
        }
      }
    }

    setBannerAppliedNotice(notes.length > 0 ? notes.join(' · ') : `Mostrando "${banner.title}"`);
  };

  const handleCheckTransferReceiptNow = async (imgOverride?: string) => {
    const img = imgOverride || transferReceiptImageUrl;
    if (!img || !catalog) return;
    setTransferVerifyPreview({ checking: true });
    setFormError(null);
    const res = await verifyCatalogTransferReceiptViaServer({
      tenantId: catalog.tenantId,
      orderId: `preview-${Date.now()}`,
      orderNumber: 'BORRADOR',
      storeName: catalog.storeName || 'Comercio',
      expectedAmount: totalCartAmount,
      alias: catalog.merchantPaymentAlias,
      cvu: catalog.merchantPaymentCvu,
      holderName: catalog.merchantPaymentHolder,
      imageBase64: img,
    });
    setTransferVerifyPreview({
      checking: false,
      approved: res.approved,
      duplicate: res.duplicate,
      operationId: res.operationId,
      summary: res.verificationSummary || res.message,
    });
    if (res.operationId && !transferReference.trim()) {
      setTransferReference(res.operationId);
    }
    if (res.duplicate) {
      setFormError(res.message || 'Este comprobante ya fue utilizado anteriormente.');
    }
  };

  const handleSubmitPromoSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalog) return;
    setPromoSubError(null);
    const cleanName = promoSubName.trim();
    const cleanPhone = promoSubPhone.trim();
    if (!cleanName) {
      setPromoSubError('Ingresá tu nombre.');
      return;
    }
    if (!cleanPhone) {
      setPromoSubError('Ingresá tu teléfono / WhatsApp para recibir los descuentos.');
      return;
    }
    setPromoSubSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const subscriber: CatalogPromoSubscriber = {
        id: `prm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: catalog.tenantId,
        name: cleanName,
        phone: cleanPhone,
        email: promoSubEmail.trim() || undefined,
        preferredCategory: promoSubCategory || undefined,
        birthDate: promoSubBirthDate.trim() || undefined,
        source: 'storefront_form',
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await submitCatalogPromoSubscriberToSupabase(subscriber);
      setPromoSubSubmitted(true);
      setCustomerName((prev) => prev || cleanName);
      setCustomerPhone((prev) => prev || cleanPhone);
    } catch {
      setPromoSubError('No pudimos guardar tu suscripción. Intentá nuevamente en unos segundos.');
    } finally {
      setPromoSubSubmitting(false);
    }
  };

  const handleRefreshSubmittedOrderStatus = async () => {
    if (!submittedOrder || !catalog) return;
    setIsRefreshingOrderStatus(true);
    try {
      const latest = await fetchPublicCatalogOrderFromSupabase(
        submittedOrder.order.id,
        catalog.tenantId
      );
      if (latest) {
        const links = buildOrderWhatsAppLinks(latest, catalog);
        setSubmittedOrder((prev) =>
          prev
            ? {
                ...prev,
                order: latest,
                whatsappUrl: links.whatsappUrl,
                customerStageWhatsappUrl: links.customerStageWhatsappUrl,
                mpCheckoutUrl: isSafeExternalHttpUrl(latest.mpInitPoint)
                  ? latest.mpInitPoint
                  : prev.mpCheckoutUrl,
              }
            : null
        );
      }
    } finally {
      setIsRefreshingOrderStatus(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catalog) return;
    setFormError(null);

    if (cartItems.length === 0) {
      setFormError('Agregá al menos un producto al carrito antes de enviar tu pedido.');
      return;
    }
    if (!customerName.trim()) {
      setFormError('Ingresá tu nombre para armar el comprobante del pedido.');
      return;
    }
    if (!customerPhone.trim()) {
      setFormError('Ingresá tu WhatsApp para enviarte el seguimiento paso a paso de tu pedido.');
      return;
    }
    if (deliveryMethod === 'envio' && !deliveryAddress.trim()) {
      setFormError('Ingresá la dirección completa donde querés recibir el envío.');
      return;
    }
    const cleanLoyaltyDniInput = catalog.enableLoyaltyProgram
      ? normalizeDni(loyaltyDniInput)
      : '';
    if (catalog.enableLoyaltyProgram && loyaltyDniInput.trim() && !isValidDni(cleanLoyaltyDniInput)) {
      setFormError('El DNI para el Programa de Puntos debe tener entre 6 y 11 números.');
      return;
    }

    setSubmitting(true);
    try {
      const currencySym = catalog.currencySymbol || '$';
      const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const orderNumber = `PED-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
      const nowIso = new Date().toISOString();

      const resolvedPaymentMethod: CatalogPaymentMethod =
        selectedPayGroup === 'mercadopago'
          ? mpSubOption === 'dinero_en_cuenta'
            ? 'mercadopago_dinero_cuenta'
            : 'link_pago'
          : selectedPayGroup;

      let verifiedOperationId: string | undefined;
      let verifiedAtIso: string | undefined;
      let verifiedSummary: string | undefined;
      let verifiedStatus: CatalogPickupOrder['transferVerificationStatus'];

      if (
        (selectedPayGroup === 'transferencia' || selectedPayGroup === 'mercadopago') &&
        transferReceiptImageUrl
      ) {
        const verifyRes = await verifyCatalogTransferReceiptViaServer({
          tenantId: catalog.tenantId,
          orderId,
          orderNumber,
          storeName: catalog.storeName || 'Comercio',
          expectedAmount: totalCartAmount,
          alias: catalog.merchantPaymentAlias,
          cvu: catalog.merchantPaymentCvu,
          holderName: catalog.merchantPaymentHolder,
          imageBase64: transferReceiptImageUrl,
        });

        if (verifyRes.duplicate) {
          setFormError(
            verifyRes.message ||
              'Este comprobante ya fue utilizado en otro pedido. Subí un comprobante válido de esta operación.'
          );
          setSubmitting(false);
          return;
        }

        verifiedOperationId = verifyRes.operationId;
        verifiedSummary = verifyRes.verificationSummary || verifyRes.message;
        if (verifyRes.approved) {
          verifiedAtIso = verifyRes.verifiedAt || nowIso;
          verifiedStatus = 'verificado_auto';
        } else if (verifyRes.success) {
          verifiedStatus = 'rechazado';
        } else {
          verifiedStatus = 'pendiente';
        }
      }

      const initialPaymentStatus: CatalogPickupOrder['paymentStatus'] =
        verifiedStatus === 'verificado_auto'
          ? 'acreditado'
          : transferReceiptImageUrl
          ? 'comprobante_en_revision'
          : selectedPayGroup === 'transferencia' || selectedPayGroup === 'mercadopago'
          ? 'en_proceso'
          : 'pendiente';

      const itemsPayload = await Promise.all(
        cartItems.map(async (entry) => {
          const liveP = catalog.products.find((p) => p.id === entry.product.id) || entry.product;
          const liveVar = entry.variant
            ? liveP.variants?.find((v) => v.id === entry.variant?.id) || entry.variant
            : undefined;
          const totalQtyForProd = productQuantitiesInCart[entry.product.id] || entry.quantity;
          const regularUnitPrice = getVariantDisplayPrice(liveP, liveVar);
          const { effectiveUnitPrice, appliedWholesale } = getWholesaleUnitPrice(
            liveP,
            liveVar,
            totalQtyForProd
          );
          return {
            productId: entry.product.id,
            productName: entry.product.name,
            sku: entry.variant?.sku?.trim() || entry.product.sku?.trim() || undefined,
            category: liveP.category?.trim() || undefined,
            subfilters:
              Array.isArray(liveP.subfilters) && liveP.subfilters.length > 0
                ? liveP.subfilters
                : undefined,
            variantId: entry.variant?.id,
            variantLabel: entry.variant?.label,
            imageUrl: await createCompactOrderThumbnail(entry.product.imageUrl),
            unitLabel: entry.product.unitLabel,
            regularUnitPrice,
            unitPrice: effectiveUnitPrice,
            appliedWholesale,
            quantity: entry.quantity,
            subtotal: effectiveUnitPrice * entry.quantity,
          };
        })
      );

      const cleanObservations = orderNotes.trim() || undefined;
      const finalOpReference =
        transferReference.trim() || verifiedOperationId || undefined;

      // Resolve DNI Loyalty Points credit & redemption cleanly against latest account state
      let finalLoyaltyDni: string | undefined = undefined;
      let finalLoyaltyDiscountPercent: number | undefined = undefined;
      let finalLoyaltyDiscountAmount: number | undefined = undefined;
      let finalLoyaltyEarned: number | undefined = undefined;
      let finalLoyaltyRedeemed: number | undefined = undefined;
      let nextUpdatedLoyaltyAccount: CatalogLoyaltyAccount | null = null;

      if (catalog.enableLoyaltyProgram && isValidDni(cleanLoyaltyDniInput)) {
        finalLoyaltyDni = cleanLoyaltyDniInput;
        const latestAcc =
          (await fetchPublicCatalogLoyaltyAccountFromSupabase(
            catalog.tenantId,
            cleanLoyaltyDniInput
          )) || loyaltyAccount;
        const currentBal = latestAcc?.pointsBalance || 0;
        if (
          selectedRedeemTier &&
          isRedeemPaymentEligible &&
          currentBal < selectedRedeemTier.minPoints
        ) {
          setLoyaltyAccount(latestAcc);
          setSelectedRedeemTier(null);
          setFormError(
            `Tu saldo actual (${currentBal} pts) no alcanza para el canje de ${selectedRedeemTier.discountPercent}% OFF. Revisá tu saldo antes de confirmar.`
          );
          setSubmitting(false);
          return;
        }
        const canRedeemSelected =
          isRedeemPaymentEligible &&
          selectedRedeemTier &&
          currentBal >= selectedRedeemTier.minPoints
            ? selectedRedeemTier
            : null;
        const redeemedPts = canRedeemSelected ? canRedeemSelected.minPoints : 0;
        const earnedPts = Math.max(0, cartEarnedPoints);

        if (canRedeemSelected && cartPricingBreakdown.loyaltyDiscountAmount > 0) {
          finalLoyaltyDiscountPercent = canRedeemSelected.discountPercent;
          finalLoyaltyDiscountAmount = cartPricingBreakdown.loyaltyDiscountAmount;
          finalLoyaltyRedeemed = redeemedPts;
        }
        if (earnedPts > 0) {
          finalLoyaltyEarned = earnedPts;
        }

        const nextBalance = Math.max(0, currentBal - redeemedPts + earnedPts);
        const newMovements = [...(latestAcc?.history || [])];
        if (redeemedPts > 0) {
          newMovements.unshift({
            id: `lmov-red-${Date.now()}`,
            date: nowIso,
            type: 'redeemed',
            pointsDelta: -redeemedPts,
            orderId,
            orderNumber,
            note: `Canjeado ${canRedeemSelected?.discountPercent}% OFF en pedido #${orderNumber}`,
          });
        }
        if (earnedPts > 0) {
          newMovements.unshift({
            id: `lmov-earn-${Date.now() + 1}`,
            date: nowIso,
            type: 'earned',
            pointsDelta: earnedPts,
            orderId,
            orderNumber,
            note: `Sumado en pedido #${orderNumber}`,
          });
        }

        nextUpdatedLoyaltyAccount = {
          id: latestAcc?.id || `lyl-${catalog.tenantId}-${cleanLoyaltyDniInput}`,
          tenantId: catalog.tenantId,
          dni: cleanLoyaltyDniInput,
          customerName: customerName.trim() || latestAcc?.customerName,
          customerPhone: customerPhone.trim() || latestAcc?.customerPhone,
          pointsBalance: nextBalance,
          totalPointsEarned: (latestAcc?.totalPointsEarned || 0) + earnedPts,
          totalPointsRedeemed: (latestAcc?.totalPointsRedeemed || 0) + redeemedPts,
          ordersCount: (latestAcc?.ordersCount || 0) + 1,
          lastOrderAt: nowIso,
          history: newMovements.slice(0, 40),
          createdAt: latestAcc?.createdAt || nowIso,
          updatedAt: nowIso,
        };
      }

      let order: CatalogPickupOrder = {
        id: orderId,
        orderNumber,
        tenantId: catalog.tenantId,
        tenantCode: catalog.tenantCode,
        storeName: catalog.storeName,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerDni: finalLoyaltyDni,
        deliveryMethod,
        deliveryAddress: deliveryMethod === 'envio' ? deliveryAddress.trim() : undefined,
        preferredPickupWindow: pickupWindow.trim() || 'A coordinar',
        preferredPaymentMethod: resolvedPaymentMethod,
        mpSubOption: selectedPayGroup === 'mercadopago' ? mpSubOption : undefined,
        paymentStatus: initialPaymentStatus,
        transferReceiptImageUrl:
          (selectedPayGroup === 'transferencia' || selectedPayGroup === 'mercadopago') &&
          transferReceiptImageUrl
            ? transferReceiptImageUrl
            : undefined,
        transferReference:
          (selectedPayGroup === 'transferencia' || selectedPayGroup === 'mercadopago')
            ? finalOpReference
            : undefined,
        transferOperationId: verifiedOperationId,
        transferVerifiedAt: verifiedAtIso,
        transferVerificationSummary: verifiedSummary,
        transferVerificationStatus: verifiedStatus,
        notes: cleanObservations,
        customerSpecificRequest: cleanObservations,
        items: itemsPayload,
        subtotalBeforeDiscount: cartPricingBreakdown.regularSubtotal,
        wholesaleSavings:
          cartPricingBreakdown.wholesaleSavings > 0
            ? cartPricingBreakdown.wholesaleSavings
            : undefined,
        couponCode:
          appliedCoupon && cartPricingBreakdown.couponDiscount > 0
            ? appliedCoupon.code
            : undefined,
        couponDiscountAmount:
          cartPricingBreakdown.couponDiscount > 0
            ? cartPricingBreakdown.couponDiscount
            : undefined,
        loyaltyDiscountPercent: finalLoyaltyDiscountPercent,
        loyaltyDiscountAmount: finalLoyaltyDiscountAmount,
        loyaltyPointsEarned: finalLoyaltyEarned,
        loyaltyPointsRedeemed: finalLoyaltyRedeemed,
        loyaltyPointsSettled: Boolean(finalLoyaltyDni),
        paymentMethodDiscountPercent:
          cartPricingBreakdown.paymentMethodDiscountPercent > 0
            ? cartPricingBreakdown.paymentMethodDiscountPercent
            : undefined,
        paymentMethodDiscountAmount:
          cartPricingBreakdown.paymentMethodDiscountAmount > 0
            ? cartPricingBreakdown.paymentMethodDiscountAmount
            : undefined,
        totalAmount: totalCartAmount,
        currencySymbol: currencySym,
        status: 'pendiente_retiro',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await submitPublicCatalogOrderToSupabase(order);

      if (nextUpdatedLoyaltyAccount) {
        await upsertCatalogLoyaltyAccountToSupabase(nextUpdatedLoyaltyAccount);
        setActiveLoyaltyDni(nextUpdatedLoyaltyAccount.dni);
        setLoyaltyAccount(nextUpdatedLoyaltyAccount);
        setSelectedRedeemTier(null);
        try {
          window.sessionStorage.setItem(
            `public_catalog_dni_${catalogHandle}`,
            nextUpdatedLoyaltyAccount.dni
          );
        } catch {
          // ignore
        }
      }

      if (catalog.enablePromoClub !== false && optInPromoClub) {
        const promoSub: CatalogPromoSubscriber = {
          id: `prm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tenantId: catalog.tenantId,
          name: customerName.trim(),
          phone: customerPhone.trim(),
          source: 'checkout_opt_in',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        void submitCatalogPromoSubscriberToSupabase(promoSub);
      }

      // Update local stock counts immediately (including variant stock) so out-of-stock states reflect right away
      setCatalog((prev) => {
        if (!prev) return prev;
        const { updatedProducts } = applyOrderStockDeltaToProducts(
          prev.products,
          itemsPayload,
          'deduct'
        );
        return {
          ...prev,
          products: updatedProducts,
        };
      });

      // Dispatch Stage 1 Customer WhatsApp ("Pago en proceso y armando tu pedido")
      const links = buildOrderWhatsAppLinks(order, catalog);
      const notifyRes = await notifyCatalogOrderCustomerStageViaServer({
        order,
        stage: 'en_proceso_armando',
        message: links.customerStageMsg,
      });

      const stageEntry: CatalogOrderStageNotification = {
        stage: 'en_proceso_armando',
        sentAt: new Date().toISOString(),
        channel: notifyRes.success ? 'whatsapp_api' : 'whatsapp_link',
        summary: 'Pago en proceso y armando tu pedido',
      };
      order = {
        ...order,
        stageNotifications: [stageEntry],
        updatedAt: new Date().toISOString(),
      };
      await syncCatalogOrderToSupabase(order);

      // Si eligió Mercado Pago, crear preferencia directa (con "Dinero en cuenta" habilitado) o usar link fijo
      let mpCheckoutUrl: string | undefined;
      let mpFeedback: string | undefined;
      if (selectedPayGroup === 'mercadopago') {
        setIsCreatingMpLink(true);
        try {
          const prefRes = await createCatalogOrderMercadoPagoPreference({
            order,
            catalogHandle,
            mpSubOption,
            originUrl: typeof window !== 'undefined' ? window.location.href : undefined,
          });
          if (prefRes.ok && isSafeExternalHttpUrl(prefRes.initPoint)) {
            mpCheckoutUrl = prefRes.initPoint;
            order = {
              ...order,
              mpInitPoint: prefRes.initPoint,
              mpPreferenceId: prefRes.preferenceId,
              updatedAt: new Date().toISOString(),
            };
            await syncCatalogOrderToSupabase(order);
            mpFeedback =
              mpSubOption === 'dinero_en_cuenta'
                ? 'Link directo de Mercado Pago generado para abonar con tu Dinero en cuenta.'
                : 'Link de Mercado Pago generado para abonar con tarjetas o saldo.';
          } else if (isSafeExternalHttpUrl(catalog.merchantMpCheckoutLink)) {
            mpCheckoutUrl = catalog.merchantMpCheckoutLink?.trim();
            mpFeedback =
              'Se habilitó el link directo de Mercado Pago de la tienda para completar tu pago.';
          } else if (catalog.merchantPaymentAlias?.trim()) {
            mpFeedback = `Podés transferir con tu Dinero en cuenta de Mercado Pago al Alias "${catalog.merchantPaymentAlias.trim()}".`;
          }
        } finally {
          setIsCreatingMpLink(false);
        }
      }

      setSubmittedOrder({
        order,
        whatsappUrl: links.whatsappUrl,
        customerStageWhatsappUrl: links.customerStageWhatsappUrl,
        autoWaDispatched: notifyRes.success,
        mpCheckoutUrl,
        mpFeedback,
      });
      setCart({});
      setTransferReceiptImageUrl('');
      setTransferReference('');
      setTransferVerifyPreview(null);
      setAppliedCoupon(null);
      setCouponCodeInput('');
      setCouponFeedback(null);

      if (mpCheckoutUrl && isSafeExternalHttpUrl(mpCheckoutUrl)) {
        window.open(mpCheckoutUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.open(links.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-[#0B1933] text-white flex items-center justify-center mx-auto">
            <Store className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Cargando catálogo online...</p>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
            <Store className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-slate-900">Catálogo no encontrado</h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              El enlace ingresado no corresponde a un catálogo publicado o fue modificado. Verificá la dirección con el comercio.
            </p>
          </div>
          <button
            type="button"
            onClick={onExitToApp}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] text-white hover:bg-[#13264A] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ir al inicio</span>
          </button>
        </div>
      </div>
    );
  }

  if (!catalog.enabledBySuperAdmin || !catalog.published) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <Store className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-slate-900">{catalog.storeName}</h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Este catálogo online está temporalmente pausado o en actualización. Podés comunicarte directamente por WhatsApp con el local.
            </p>
          </div>
          {catalog.whatsappPhone && (
            <a
              href={createWhatsAppUrl(
                catalog.whatsappPhone,
                `Hola ${catalog.storeName}, quisiera consultar por productos disponibles.`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Consultar por WhatsApp</span>
            </a>
          )}
        </div>
      </div>
    );
  }

  const currency = catalog.currencySymbol || '$';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark
              logoUrl={catalog.logoUrl}
              icon={catalog.icon}
              name={catalog.storeName}
              size="sm"
            />
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {catalog.storeName}
              </h1>
              <p className="text-[11px] text-slate-500 truncate">
                {rubroPreset ? `${rubroPreset.shortLabel} · ` : ''}Catálogo Online · Carrito por WhatsApp
              </p>
            </div>
          </div>

          {/* Quick Header Search Bar on desktop */}
          <div className="hidden md:block flex-1 max-w-sm mx-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o descripción..."
                aria-label="Buscar productos por nombre o descripción"
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onExitToApp}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Acceso Sistema</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white transition-colors cursor-pointer whitespace-nowrap shadow-xs"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Mi Carrito</span>
              <span className="px-1.5 py-0.2 rounded bg-white text-[#0B1933] font-mono tabular-nums text-[11px] font-bold">
                {totalCartUnits}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Storefront Hero Strip */}
      <section className="bg-[#0B1933] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-9 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4 sm:gap-5 max-w-2xl">
            <div className="shrink-0 bg-white/95 rounded-2xl p-1 shadow-md">
              <BrandMark
                logoUrl={catalog.logoUrl}
                icon={catalog.icon}
                name={catalog.storeName}
                size="lg"
              />
            </div>
            <div className="space-y-2 min-w-0">
              {rubroPreset && (
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                  {rubroPreset.shortLabel}
                </div>
              )}
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {catalog.storeName}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {catalog.tagline ||
                  'Armá tu carrito de compras, elegí retiro en tienda o envío a domicilio y envialo por WhatsApp.'}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-300">
                {catalog.allowPickup !== false && (
                  <span className="inline-flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-sky-300" />
                    <span>Retiro en tienda disponible</span>
                  </span>
                )}
                {catalog.allowDelivery !== false && (
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Envío a domicilio disponible</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white/10 border border-white/15 rounded-2xl p-4 text-xs space-y-2 shrink-0 md:min-w-[280px]">
            {catalog.pickupAddress && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-300 block text-[11px]">Dirección de retiro</span>
                  <strong className="text-white">{catalog.pickupAddress}</strong>
                </div>
              </div>
            )}
            {catalog.pickupHours && (
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-300 block text-[11px]">Horarios</span>
                  <strong className="text-white">{catalog.pickupHours}</strong>
                </div>
              </div>
            )}
            {catalog.paymentNote && (
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-300 block text-[11px]">Medios de pago</span>
                  <strong className="text-white">{catalog.paymentNote}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Catalog Area */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-8 pt-4 flex-1 space-y-5">
        {/* Top DNI Loyalty Program Bar (non-sticky so mobile chrome stays minimal, visible immediately upon opening catalog) */}
        {catalog.enableLoyaltyProgram &&
          (() => {
            const orderedTiers = normalizeLoyaltyTiers(catalog.loyaltyTiers);
            const currentBal = loyaltyAccount?.pointsBalance || 0;
            const { highestUnlocked, nextTier } = getEligibleLoyaltyTiers(currentBal, orderedTiers);
            const defaultPtsUnit =
              typeof catalog.loyaltyPointsPerUnit === 'number' ? catalog.loyaltyPointsPerUnit : 10;

            return (
              <section
                aria-label="Programa de Puntos por DNI"
                className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#0B1933] flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Programa de Puntos con tu DNI · Cada compra suma +{defaultPtsUnit} pts por prenda/unidad
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      Ingresá tu DNI antes de comprar para ir sumando puntos y canjear descuentos del{' '}
                      <strong className="text-slate-900">
                        {orderedTiers.map((t) => `${t.discountPercent}%`).join(', ')}
                      </strong>{' '}
                      al finalizar tu pedido
                      {catalog.loyaltyRestrictRedeemMethods !== false
                        ? ' (canje válido con retiro en el local, transferencia o Dinero en cuenta en Mercado Pago).'
                        : '.'}
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleLookupLoyaltyDni();
                    }}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0"
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      value={loyaltyDniInput}
                      onChange={(e) => setLoyaltyDniInput(normalizeDni(e.target.value))}
                      placeholder="Tu DNI sin puntos (ej. 35123456)"
                      aria-label="Ingresá tu DNI para el programa de puntos"
                      className="w-full sm:w-52 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                    />
                    <button
                      type="submit"
                      disabled={loyaltyLoading}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-60 text-white cursor-pointer whitespace-nowrap"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-emerald-300" />
                      <span>
                        {loyaltyLoading
                          ? 'Consultando...'
                          : activeLoyaltyDni
                          ? 'Actualizar DNI'
                          : 'Activar / Ver puntos'}
                      </span>
                    </button>
                  </form>
                </div>

                {/* Scale & Live Balance Strip */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-100 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-slate-600">
                    <span className="font-sans font-semibold text-slate-700">Escala:</span>
                    {orderedTiers.map((tier) => {
                      const unlocked = Boolean(activeLoyaltyDni) && currentBal >= tier.minPoints;
                      return (
                        <span
                          key={tier.id}
                          className={
                            unlocked
                              ? 'font-bold text-emerald-700'
                              : 'text-slate-500'
                          }
                        >
                          {tier.minPoints} pts = {tier.discountPercent}% OFF
                        </span>
                      );
                    })}
                  </div>

                  {activeLoyaltyDni ? (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono tabular-nums">
                      <span className="font-bold text-[#0B1933]">
                        DNI {activeLoyaltyDni}: {currentBal} pts
                      </span>
                      {highestUnlocked ? (
                        <span className="font-sans font-bold text-emerald-700">
                          · ¡Descuento de hasta {highestUnlocked.discountPercent}% disponible en caja!
                        </span>
                      ) : nextTier ? (
                        <span className="font-sans text-slate-600">
                          · Te faltan {nextTier.minPoints - currentBal} pts para {nextTier.discountPercent}% OFF
                        </span>
                      ) : null}
                      {cartEarnedPoints > 0 && (
                        <span className="font-sans font-bold text-indigo-700">
                          · Carrito actual: +{cartEarnedPoints} pts
                        </span>
                      )}
                    </div>
                  ) : (
                    cartEarnedPoints > 0 && (
                      <div className="text-[11px] font-semibold text-indigo-700 font-mono tabular-nums">
                        Ingresá tu DNI arriba para sumar +{cartEarnedPoints} pts con este carrito
                      </div>
                    )
                  )}
                </div>

                {loyaltyFeedback && (
                  <div className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">
                    {loyaltyFeedback}
                  </div>
                )}
              </section>
            );
          })()}

        {/* Sticky Search + Category Filter Bar */}
        <div className="sticky top-16 z-20 bg-[#F8FAFC]/95 backdrop-blur-md -mx-4 px-4 sm:-mx-6 sm:px-6 py-3 border-b border-slate-200/80 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-lg">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && searchTerm) setSearchTerm('');
                }}
                placeholder="Buscar por nombre o descripción del producto..."
                aria-label="Buscar en el catálogo por nombre o descripción"
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20 shadow-2xs"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-[#0B1933] text-white border-[#0B1933]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {availableSubfilters.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-1 border-t border-slate-200/70">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 mr-1 shrink-0">
                <Tag className="w-3 h-3 text-[#0B1933]" />
                <span>Subfiltros:</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedSubfilter('Todos')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                  selectedSubfilter === 'Todos'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Todos
              </button>
              {availableSubfilters.map((sf) => (
                <button
                  key={sf}
                  type="button"
                  onClick={() => setSelectedSubfilter(sf)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    selectedSubfilter.toLowerCase() === sf.toLowerCase()
                      ? 'bg-[#0B1933] text-white border-[#0B1933]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {sf}
                </button>
              ))}
            </div>
          )}

          {activeProducts.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono tabular-nums">
                {searchTerm.trim() ||
                selectedCategory !== 'Todas' ||
                selectedSubfilter !== 'Todos' ? (
                  <>
                    Mostrando <strong className="text-slate-800">{filteredProducts.length}</strong> de{' '}
                    <strong className="text-slate-800">{activeProducts.length}</strong> productos
                  </>
                ) : (
                  <>
                    <strong className="text-slate-800">{activeProducts.length}</strong> productos disponibles
                  </>
                )}
              </span>

              {(searchTerm.trim() ||
                selectedCategory !== 'Todas' ||
                selectedSubfilter !== 'Todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('Todas');
                    setSelectedSubfilter('Todos');
                  }}
                  className="text-xs font-semibold text-[#0B1933] hover:underline cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>

        {/* Storefront Promotional Banners */}
        {(() => {
          const activeBanners = (catalog.promoBanners || []).filter((b) => b.active !== false);
          if (activeBanners.length === 0) return null;

          const themeClassMap: Record<CatalogPromoBanner['theme'], string> = {
            navy: 'bg-[#0B1933] text-white border-[#0B1933]',
            emerald: 'bg-emerald-900 text-white border-emerald-900',
            amber: 'bg-amber-50 text-slate-900 border-amber-200',
            rose: 'bg-rose-900 text-white border-rose-900',
          };

          const gridColsClass =
            activeBanners.length === 1
              ? 'grid-cols-1'
              : activeBanners.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

          return (
            <section className="space-y-2.5" aria-label="Promociones destacadas">
              <div className={`grid ${gridColsClass} gap-3`}>
                {activeBanners.map((banner) => {
                  const isLightTheme = banner.theme === 'amber';
                  const hasBannerImg =
                    banner.mode === 'image' &&
                    Boolean(banner.imageUrl?.trim()) &&
                    !bannerImageErrorIds[banner.id];

                  if (hasBannerImg) {
                    const showCaptionBar = Boolean(
                      (banner.title && banner.title !== 'Promoción destacada') ||
                        banner.ctaLabel ||
                        banner.filterCategory ||
                        banner.couponCode
                    );
                    return (
                      <button
                        key={banner.id}
                        type="button"
                        onClick={() => handleBannerClick(banner)}
                        className="group relative text-left rounded-2xl border border-slate-200 overflow-hidden bg-slate-900 transition-transform hover:-translate-y-0.5 cursor-pointer"
                      >
                        <div className="aspect-[16/6] sm:aspect-[16/5] w-full overflow-hidden bg-slate-100">
                          <img
                            src={banner.imageUrl}
                            alt={banner.title || 'Banner promocional'}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBannerImageErrorIds((prev) => ({ ...prev, [banner.id]: true }))
                            }
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        </div>
                        {showCaptionBar && (
                          <div className="bg-slate-950/80 text-white px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              {banner.title && banner.title !== 'Promoción destacada' && (
                                <div className="text-xs sm:text-sm font-bold truncate">
                                  {banner.title}
                                </div>
                              )}
                              {(banner.filterCategory || banner.couponCode) && (
                                <div className="text-[11px] text-slate-300 truncate">
                                  {[
                                    banner.filterCategory ? banner.filterCategory : null,
                                    banner.couponCode ? `Cupón ${banner.couponCode}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              )}
                            </div>
                            {banner.ctaLabel && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-slate-900 text-[11px] font-bold shrink-0 whitespace-nowrap">
                                <span>{banner.ctaLabel}</span>
                                <ArrowRight className="w-3 h-3" />
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  }

                  return (
                    <button
                      key={banner.id}
                      type="button"
                      onClick={() => handleBannerClick(banner)}
                      className={`text-left rounded-2xl border p-4 sm:p-5 flex items-center justify-between gap-4 transition-transform hover:-translate-y-0.5 cursor-pointer ${
                        themeClassMap[banner.theme || 'navy']
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        {banner.badgeText && (
                          <div
                            className={`text-[11px] font-bold tracking-wide uppercase ${
                              isLightTheme ? 'text-amber-800' : 'text-emerald-300'
                            }`}
                          >
                            {banner.badgeText}
                          </div>
                        )}
                        <div className="text-base font-bold leading-snug">
                          {banner.title}
                        </div>
                        {banner.subtitle && (
                          <p
                            className={`text-xs leading-relaxed line-clamp-2 ${
                              isLightTheme ? 'text-slate-700' : 'text-slate-200'
                            }`}
                          >
                            {banner.subtitle}
                          </p>
                        )}
                        {(banner.filterCategory || banner.couponCode) && (
                          <div
                            className={`text-[11px] font-medium pt-0.5 ${
                              isLightTheme ? 'text-slate-600' : 'text-slate-300'
                            }`}
                          >
                            {[
                              banner.filterCategory ? banner.filterCategory : null,
                              banner.couponCode ? `Cupón ${banner.couponCode}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold shrink-0 whitespace-nowrap ${
                          isLightTheme
                            ? 'bg-[#0B1933] text-white'
                            : 'bg-white text-slate-900'
                        }`}
                      >
                        <span>{banner.ctaLabel || 'Ver oferta'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>

              {bannerAppliedNotice && (
                <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <span className="font-semibold">{bannerAppliedNotice}</span>
                  <button
                    type="button"
                    onClick={() => setBannerAppliedNotice(null)}
                    className="p-0.5 text-emerald-700 hover:text-emerald-950 cursor-pointer"
                    aria-label="Cerrar aviso de promoción"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </section>
          );
        })()}

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
            <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                {activeProducts.length === 0
                  ? 'Catálogo en preparación'
                  : 'No encontramos productos con ese filtro'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {activeProducts.length === 0
                  ? 'El comercio todavía está cargando sus productos. Escribiles por WhatsApp para consultar.'
                  : 'Probá con otra palabra clave o limpiá los filtros activos.'}
              </p>
            </div>
            {activeProducts.length > 0 &&
              (searchTerm.trim() ||
                selectedCategory !== 'Todas' ||
                selectedSubfilter !== 'Todos') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('Todas');
                    setSelectedSubfilter('Todos');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Ver todos los productos</span>
                </button>
              )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProducts.map((product) => {
              const productHasVariants = hasProductVariants(product);
              const activeVariant = resolveActiveVariantForProduct(product);
              const cartKey = makeCartKey(product.id, activeVariant?.id);
              const inCart = cart[cartKey];
              const stockCount = activeVariant
                ? getVariantStock(activeVariant)
                : typeof product.stockQuantity === 'number'
                ? Math.max(0, Math.floor(product.stockQuantity))
                : null;
              const isSelectedOutOfStock = stockCount !== null && stockCount <= 0;
              const isCardFullyOutOfStock = isProductFullyOutOfStock(product);
              const regularActivePrice = getVariantDisplayPrice(product, activeVariant);
              const qtyInCartForProduct = productQuantitiesInCart[product.id] || 0;
              const { effectiveUnitPrice: activePrice } = getWholesaleUnitPrice(
                product,
                activeVariant,
                qtyInCartForProduct
              );
              const activeSku = (activeVariant?.sku || product.sku || '').trim();
              const isAtMaxStock = stockCount !== null && Boolean(inCart) && inCart.quantity >= stockCount;
              const galleryImages = getProductGalleryImages(product);
              const activePhotoIdx =
                galleryImages.length > 0
                  ? Math.min(cardImageIndexByProductId[product.id] || 0, galleryImages.length - 1)
                  : 0;
              const activePhotoSrc = galleryImages[activePhotoIdx];

              return (
                <article
                  key={product.id}
                  className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
                    isCardFullyOutOfStock ? 'border-slate-200 bg-slate-50/40' : 'border-slate-200'
                  }`}
                >
                  <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden group">
                    {activePhotoSrc ? (
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedGallery({
                            title: product.name,
                            images: galleryImages,
                            index: activePhotoIdx,
                            sku: activeSku || undefined,
                          })
                        }
                        className="w-full h-full block cursor-zoom-in"
                        title="Clic para ampliar foto y ver galería"
                      >
                        <img
                          src={activePhotoSrc}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover transition-opacity ${
                            isCardFullyOutOfStock ? 'opacity-65 grayscale-[35%]' : ''
                          }`}
                        />
                        <span className="absolute bottom-2.5 right-2.5 p-1.5 rounded-lg bg-slate-950/65 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </span>
                      </button>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-gradient-to-br from-slate-100 to-slate-200">
                        <ImageIcon className="w-9 h-9 opacity-50" />
                      </div>
                    )}

                    {galleryImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardImageIndexByProductId((prev) => ({
                              ...prev,
                              [product.id]:
                                (activePhotoIdx - 1 + galleryImages.length) % galleryImages.length,
                            }));
                          }}
                          aria-label="Foto anterior"
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-slate-900 shadow-xs flex items-center justify-center cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardImageIndexByProductId((prev) => ({
                              ...prev,
                              [product.id]: (activePhotoIdx + 1) % galleryImages.length,
                            }));
                          }}
                          aria-label="Foto siguiente"
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-slate-900 shadow-xs flex items-center justify-center cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-950/60 px-2 py-1 rounded-full">
                          {galleryImages.map((_, idx) => (
                            <button
                              key={idx}
                              type="button"
                              aria-label={`Ver foto ${idx + 1}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setCardImageIndexByProductId((prev) => ({
                                  ...prev,
                                  [product.id]: idx,
                                }));
                              }}
                              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                idx === activePhotoIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {product.featured && !isCardFullyOutOfStock && (
                      <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                        <Star className="w-3 h-3 fill-current" />
                        <span>Destacado</span>
                      </span>
                    )}
                    {isCardFullyOutOfStock && (
                      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-slate-950/90 text-white text-[11px] font-bold tracking-wide shadow-xs">
                        Sin stock
                      </span>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
                        <span className="truncate">
                          {product.category || 'General'} · {product.unitLabel || 'Unidad'}
                          {activeSku ? ` · Cód: ${activeSku}` : ''}
                          {catalog.enableLoyaltyProgram
                            ? ` · +${getProductPointsPerUnit(
                                product,
                                typeof catalog.loyaltyPointsPerUnit === 'number'
                                  ? catalog.loyaltyPointsPerUnit
                                  : 10
                              )} pts`
                            : ''}
                        </span>
                        {stockCount !== null && (
                          <span
                            className={`shrink-0 font-semibold font-mono tabular-nums ${
                              isSelectedOutOfStock ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {isSelectedOutOfStock
                              ? 'Sin stock'
                              : `Stock: ${stockCount} u.`}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {product.name}
                      </h3>
                      {product.wholesaleMinQty && product.wholesalePrice ? (
                        <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/80 rounded-lg px-2 py-1 inline-flex items-center gap-1 font-mono tabular-nums">
                          <span>
                            Mayorista x{product.wholesaleMinQty}+ u.:{' '}
                            {formatCurrency(product.wholesalePrice, currency)} c/u
                          </span>
                        </div>
                      ) : null}
                      {product.subfilters && product.subfilters.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {product.subfilters.map((sf) => (
                            <span
                              key={sf}
                              className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold"
                            >
                              {sf}
                            </span>
                          ))}
                        </div>
                      )}
                      {product.description && (
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                          {product.description}
                        </p>
                      )}

                      {/* Variant Picker (Talle / Color / Medida) */}
                      {productHasVariants && (
                        <div className="pt-1 space-y-1">
                          <div className="text-[11px] font-semibold text-slate-600">
                            Elegí opción / talle:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(product.variants || []).map((v) => {
                              const vStock = getVariantStock(v);
                              const vOut = vStock !== null && vStock <= 0;
                              const isSelected = activeVariant?.id === v.id;
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedVariantByProductId((prev) => ({
                                      ...prev,
                                      [product.id]: v.id,
                                    }))
                                  }
                                  title={
                                    vOut
                                      ? `${v.label} — Sin stock (tocá para anotarte al aviso)`
                                      : vStock !== null
                                      ? `${v.label} — ${vStock} disponible(s)`
                                      : v.label
                                  }
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                    isSelected
                                      ? vOut
                                        ? 'bg-rose-700 text-white border-rose-700'
                                        : 'bg-[#0B1933] text-white border-[#0B1933]'
                                      : vOut
                                      ? 'bg-slate-50 text-slate-400 border-slate-200 line-through hover:border-rose-300'
                                      : 'bg-white text-slate-800 border-slate-200 hover:border-[#0B1933]'
                                  }`}
                                >
                                  {v.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div>
                        <span
                          className={`text-lg font-bold font-mono tabular-nums ${
                            isSelectedOutOfStock ? 'text-slate-400' : 'text-slate-900'
                          }`}
                        >
                          {formatCurrency(activePrice, currency)}
                        </span>
                        {activePrice < regularActivePrice && (
                          <span className="ml-1.5 text-xs line-through text-slate-400 font-mono tabular-nums">
                            {formatCurrency(regularActivePrice, currency)}
                          </span>
                        )}
                      </div>

                      {isSelectedOutOfStock ? (
                        <button
                          type="button"
                          onClick={() => openStockAlertModal(product, activeVariant)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Bell className="w-3.5 h-3.5 text-amber-300" />
                          <span>Avisar cuando haya stock</span>
                        </button>
                      ) : inCart ? (
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => updateCartQty(cartKey, -1)}
                              className="w-7 h-7 rounded-lg bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center border border-slate-200 cursor-pointer"
                              aria-label="Restar unidad"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center text-xs font-mono tabular-nums font-bold text-slate-900">
                              {inCart.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={isAtMaxStock}
                              onClick={() => updateCartQty(cartKey, 1)}
                              title={isAtMaxStock ? `Máximo disponible: ${stockCount} u.` : 'Sumar unidad'}
                              className="w-7 h-7 rounded-lg bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center cursor-pointer"
                              aria-label="Sumar unidad"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsCartOpen(true)}
                            className="text-[11px] font-bold text-[#0B1933] hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Ver carrito
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(product, activeVariant)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>
                            {activeVariant
                              ? `Agregar (${activeVariant.label})`
                              : 'Agregar al carrito'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {/* In-Page Club de Promos y Descuentos Section */}
        {catalog.enablePromoClub !== false && (
          <section className="mt-8 bg-[#0B1933] text-white rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-2.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
                  <Gift className="w-4 h-4" />
                  <span>Beneficios exclusivos</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  {catalog.promoClubTitle || 'Club de Promos y Descuentos'}
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {catalog.promoClubIncentive ||
                    'Dejanos tus datos para enterarte primero de ingresos, promociones especiales y cupones de descuento por WhatsApp.'}
                </p>
                {catalog.cashOrTransferDiscountPercent && catalog.cashOrTransferDiscountPercent > 0 ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-emerald-300">
                    <Percent className="w-3.5 h-3.5" />
                    <span>
                      {catalog.cashOrTransferDiscountPercent}% OFF pagando por Transferencia o Efectivo
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="lg:col-span-7 bg-white text-slate-900 rounded-2xl p-5">
                {promoSubSubmitted ? (
                  <div className="space-y-3 text-center py-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900">
                        ¡Ya formás parte del Club de Promos de {catalog.storeName}!
                      </h3>
                      <p className="text-xs text-slate-600">
                        Agendamos tu WhatsApp <strong className="font-mono">{promoSubPhone}</strong> para avisarte cuando haya promos y descuentos.
                      </p>
                    </div>
                    {catalog.promoClubWelcomeCoupon?.trim() && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                        <div className="text-left">
                          <div className="text-[11px] font-semibold text-emerald-800">
                            Tu cupón de bienvenida para usar hoy:
                          </div>
                          <div className="text-sm font-mono font-black text-slate-900">
                            {catalog.promoClubWelcomeCoupon.trim().toUpperCase()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const code = catalog.promoClubWelcomeCoupon!.trim().toUpperCase();
                            navigator.clipboard?.writeText(code);
                            handleApplyCouponCode(code);
                            setCopiedWelcomeCoupon(true);
                            setTimeout(() => setCopiedWelcomeCoupon(false), 2000);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                        >
                          {copiedWelcomeCoupon ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Copiado y aplicado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copiar y aplicar cupón</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setPromoSubSubmitted(false)}
                      className="text-xs font-semibold text-[#0B1933] hover:underline cursor-pointer"
                    >
                      Anotar otro contacto
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitPromoSubscriber} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Tu nombre *
                      </label>
                      <input
                        type="text"
                        required
                        value={promoSubName}
                        onChange={(e) => setPromoSubName(e.target.value)}
                        placeholder="Ej. Sofía Martínez"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Tu WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        value={promoSubPhone}
                        onChange={(e) => setPromoSubPhone(e.target.value)}
                        placeholder="Ej. 11 4567-8900"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Email (opcional)
                      </label>
                      <input
                        type="email"
                        value={promoSubEmail}
                        onChange={(e) => setPromoSubEmail(e.target.value)}
                        placeholder="tu@email.com"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        ¿Qué te interesa más? (opcional)
                      </label>
                      <select
                        value={promoSubCategory}
                        onChange={(e) => setPromoSubCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      >
                        <option value="">Todas las categorías / promos generales</option>
                        {categories
                          .filter((c) => c !== 'Todas')
                          .map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Fecha de cumpleaños (regalo / promo especial)
                      </label>
                      <input
                        type="date"
                        value={promoSubBirthDate}
                        onChange={(e) => setPromoSubBirthDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={promoSubSubmitting}
                        className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white cursor-pointer"
                      >
                        {promoSubSubmitting ? 'Guardando...' : 'Quiero recibir promos y descuentos'}
                      </button>
                    </div>
                    {promoSubError && (
                      <div className="sm:col-span-2 text-xs text-rose-600 font-medium">
                        {promoSubError}
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Floating Bottom Bar when cart has items */}
      {totalCartUnits > 0 && !isCartOpen && (
        <div className="sticky bottom-4 z-20 px-4">
          <div className="max-w-xl mx-auto">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl bg-[#0B1933] hover:bg-[#13264A] text-white shadow-xl border border-white/15 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5 text-sm font-bold">
                <ShoppingCart className="w-4 h-4 text-sky-300" />
                <span>Finalizar pedido ({totalCartUnits} ítem{totalCartUnits === 1 ? '' : 's'})</span>
              </div>
              <div className="flex items-center gap-2 font-mono tabular-nums text-sm font-bold">
                <span>{formatCurrency(totalCartAmount, currency)}</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Slide-Over Shopping Cart & Delivery/Pickup WhatsApp Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setIsCartOpen(false)}
          />
          <aside className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Tu Carrito de Compras
                </h2>
                <p className="text-xs text-slate-500">
                  {catalog.storeName} · Elegí retiro o envío y envialo por WhatsApp
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Cerrar carrito"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {submittedOrder ? (
                <div className="space-y-4 py-2">
                  {/* Live Order Confirmation & Payment Card */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900">
                          Pedido #{submittedOrder.order.orderNumber} confirmado
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                          Total{' '}
                          <strong className="font-mono tabular-nums text-slate-900">
                            {formatCurrency(submittedOrder.order.totalAmount, currency)}
                          </strong>{' '}
                          · {submittedOrder.order.deliveryMethod === 'envio' ? 'Envío a domicilio' : 'Retiro en tienda'}
                        </p>
                      </div>
                    </div>

                    {submittedOrder.order.customerDni && (
                      <div className="p-2.5 rounded-xl bg-white border border-emerald-200 text-[11px] font-medium text-slate-800 space-y-0.5 font-mono tabular-nums">
                        <div>
                          Programa de Puntos · DNI <strong>{submittedOrder.order.customerDni}</strong>
                        </div>
                        {typeof submittedOrder.order.loyaltyPointsRedeemed === 'number' &&
                          submittedOrder.order.loyaltyPointsRedeemed > 0 && (
                            <div className="text-indigo-700 font-bold">
                              -{submittedOrder.order.loyaltyPointsRedeemed} pts descontados automáticamente por canje ({submittedOrder.order.loyaltyDiscountPercent}% OFF)
                            </div>
                          )}
                        {typeof submittedOrder.order.loyaltyPointsEarned === 'number' &&
                          submittedOrder.order.loyaltyPointsEarned > 0 && (
                            <div className="text-emerald-700 font-bold">
                              +{submittedOrder.order.loyaltyPointsEarned} puntos sumados con esta compra
                            </div>
                          )}
                        {loyaltyAccount && (
                          <div className="text-slate-600">
                            Saldo actualizado en tu DNI: <strong>{loyaltyAccount.pointsBalance} pts</strong>
                          </div>
                        )}
                      </div>
                    )}

                    {submittedOrder.mpFeedback && (
                      <div className="p-2.5 rounded-xl bg-white border border-emerald-200 text-[11px] font-medium text-slate-700">
                        {submittedOrder.mpFeedback}
                      </div>
                    )}

                    {/* Direct Mercado Pago Pay Button (Dinero en cuenta / Checkout Pro) */}
                    {submittedOrder.mpCheckoutUrl &&
                      submittedOrder.order.paymentStatus !== 'acreditado' && (
                        <a
                          href={submittedOrder.mpCheckoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-[#009EE3] hover:bg-[#008ACA] text-white text-xs font-bold shadow-xs"
                        >
                          <Wallet className="w-4 h-4" />
                          <span>
                            {submittedOrder.order.mpSubOption === 'dinero_en_cuenta'
                              ? 'Pagar ahora con Dinero en cuenta (Mercado Pago)'
                              : 'Pagar ahora con Mercado Pago'}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                    <a
                      href={submittedOrder.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Enviar Pedido al WhatsApp de {catalog.storeName}</span>
                    </a>
                  </div>

                  {/* Live 3-Step Order Process Tracker (WhatsApp Stage Sync) */}
                  <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Seguimiento del proceso por WhatsApp
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Te enviamos avisos al <span className="font-mono">{submittedOrder.order.customerPhone}</span> en cada etapa.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isRefreshingOrderStatus}
                        onClick={handleRefreshSubmittedOrderStatus}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shrink-0"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${isRefreshingOrderStatus ? 'animate-spin' : ''}`}
                        />
                        <span>Actualizar</span>
                      </button>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      {/* Etapa 1: Pago en proceso y armando pedido */}
                      <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                            submittedOrder.order.paymentStatus === 'acreditado'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[#0B1933] text-white'
                          }`}
                        >
                          1
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900">
                            {submittedOrder.order.paymentStatus === 'acreditado'
                              ? 'Pago acreditado · Armando tu pedido'
                              : submittedOrder.order.paymentStatus === 'comprobante_en_revision'
                              ? 'Comprobante en revisión · Armando tu pedido'
                              : 'Pago en proceso y armando tu pedido'}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {submittedOrder.autoWaDispatched
                              ? 'Aviso enviado automáticamente a tu WhatsApp.'
                              : 'Estado inicial registrado. Recibirás el detalle en tu WhatsApp.'}
                          </div>
                        </div>
                      </div>

                      {/* Etapa 2: Listo para retirar o En viaje a domicilio */}
                      {(() => {
                        const isDel = submittedOrder.order.deliveryMethod === 'envio';
                        const step2Done =
                          submittedOrder.order.status === 'listo_para_retirar' ||
                          submittedOrder.order.status === 'en_camino' ||
                          submittedOrder.order.status === 'retirado';
                        return (
                          <div
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${
                              step2Done
                                ? 'bg-sky-50 border-sky-200'
                                : 'bg-white border-slate-200 opacity-75'
                            }`}
                          >
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                step2Done
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              2
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-900">
                                {isDel
                                  ? 'Pedido en viaje a tu domicilio'
                                  : 'Listo para pasar a buscar'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {step2Done
                                  ? isDel
                                    ? `En camino a ${submittedOrder.order.deliveryAddress || 'tu dirección'}.`
                                    : `Ya podés pasar por ${catalog.pickupAddress || 'el local'}.`
                                  : isDel
                                  ? 'El vendedor te avisará por WhatsApp apenas salga el envío.'
                                  : 'El vendedor te avisará por WhatsApp cuando puedas pasar a buscarlo.'}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Etapa 3: Entregado / Retirado y Pagado */}
                      {(() => {
                        const isDel = submittedOrder.order.deliveryMethod === 'envio';
                        const step3Done = submittedOrder.order.status === 'retirado';
                        return (
                          <div
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border ${
                              step3Done
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-white border-slate-200 opacity-70'
                            }`}
                          >
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                step3Done
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              3
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-900">
                                {isDel ? 'Entregado y pagado' : 'Retirado y pagado'}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {step3Done
                                  ? 'Operación finalizada con éxito.'
                                  : 'Se completa al momento de la entrega/retiro.'}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <a
                      href={submittedOrder.customerStageWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Abrir resumen de estado en mi WhatsApp</span>
                    </a>
                  </div>

                  {/* Receipt thumbnail if buyer uploaded a transfer comprobante */}
                  {submittedOrder.order.transferReceiptImageUrl && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
                      <img
                        src={submittedOrder.order.transferReceiptImageUrl}
                        alt="Comprobante de transferencia adjuntado"
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0 text-xs">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Comprobante enviado a la tienda</span>
                        </div>
                        {submittedOrder.order.transferReference && (
                          <div className="text-[11px] font-mono text-slate-500 truncate">
                            Op. {submittedOrder.order.transferReference}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(submittedOrder.order.customerSpecificRequest || submittedOrder.order.notes) && (
                    <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-1">
                      <div className="font-bold text-slate-900">
                        Observaciones / Pedido específico enviado:
                      </div>
                      <div className="text-slate-700 whitespace-pre-wrap">
                        {submittedOrder.order.customerSpecificRequest || submittedOrder.order.notes}
                      </div>
                    </div>
                  )}

                  {submittedOrder.order.deliveryMethod === 'envio' ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-slate-600" />
                        <span>Envío a domicilio</span>
                      </div>
                      <div className="text-slate-700">{submittedOrder.order.deliveryAddress}</div>
                      <div className="text-slate-500">
                        Te avisaremos por WhatsApp apenas salga el repartidor hacia tu domicilio.
                      </div>
                    </div>
                  ) : (
                    catalog.pickupAddress && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-slate-600" />
                          <span>Punto de retiro</span>
                        </div>
                        <div className="text-slate-700">{catalog.pickupAddress}</div>
                        {catalog.pickupHours && (
                          <div className="text-slate-500">{catalog.pickupHours}</div>
                        )}
                      </div>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedOrder(null);
                      setIsCartOpen(false);
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Seguir viendo el catálogo
                  </button>
                </div>
              ) : cartItems.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <ShoppingCart className="w-9 h-9 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-700">
                    Tu carrito está vacío
                  </p>
                  <p className="text-xs text-slate-500">
                    Elegí productos del catálogo para armar tu carrito, seleccionar retiro o envío y enviarlo por WhatsApp.
                  </p>
                </div>
              ) : (
                <>
                  {/* Step 1: Cart Items List */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>1. Productos en tu carrito ({totalCartUnits})</span>
                      <button
                        type="button"
                        onClick={() => setCart({})}
                        className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
                      >
                        Vaciar carrito
                      </button>
                    </div>
                    {cartItems.map(({ key, product, variant, quantity }) => {
                      const liveP = catalog?.products.find((p) => p.id === product.id) || product;
                      const liveVar = variant
                        ? liveP.variants?.find((v) => v.id === variant.id) || variant
                        : undefined;
                      const maxStock = liveVar
                        ? getVariantStock(liveVar)
                        : typeof liveP.stockQuantity === 'number'
                        ? Math.max(0, Math.floor(liveP.stockQuantity))
                        : null;
                      const regularPrice = getVariantDisplayPrice(liveP, liveVar);
                      const prodTotalQty = productQuantitiesInCart[product.id] || quantity;
                      const {
                        effectiveUnitPrice: itemPrice,
                        appliedWholesale: isWholesaleApplied,
                      } = getWholesaleUnitPrice(liveP, liveVar, prodTotalQty);
                      const reachedMax = maxStock !== null && quantity >= maxStock;

                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {product.name}
                              {liveVar ? ` · ${liveVar.label}` : ''}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500">
                              {formatCurrency(itemPrice, currency)}
                              {isWholesaleApplied && (
                                <span className="ml-1 line-through text-slate-400">
                                  {formatCurrency(regularPrice, currency)}
                                </span>
                              )}{' '}
                              × {quantity} ={' '}
                              <strong className="text-slate-800">
                                {formatCurrency(itemPrice * quantity, currency)}
                              </strong>
                            </div>
                            {isWholesaleApplied && (
                              <div className="text-[10px] font-bold text-indigo-700 mt-0.5">
                                Precio mayorista aplicado
                              </div>
                            )}
                            {maxStock !== null && (
                              <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
                                Stock disponible: {maxStock} u.{reachedMax ? ' (máximo alcanzado)' : ''}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateCartQty(key, -1)}
                              className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                              aria-label="Restar"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-xs font-mono tabular-nums font-bold">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              disabled={reachedMax}
                              onClick={() => updateCartQty(key, 1)}
                              title={reachedMax ? `Stock máximo: ${maxStock}` : 'Sumar'}
                              className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="Sumar"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCartItem(key)}
                              className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                              title="Quitar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Coupon Code Input */}
                  {(catalog.coupons || []).some((c) => c.active !== false) && (
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-700" />
                        <span>¿Tenés un cupón de descuento?</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={couponCodeInput}
                          onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                          placeholder="Ingresá tu código (ej. BIENVENIDO10)"
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 uppercase"
                        />
                        <button
                          type="button"
                          onClick={() => handleApplyCouponCode()}
                          className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer"
                        >
                          Aplicar
                        </button>
                        {appliedCoupon && (
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedCoupon(null);
                              setCouponCodeInput('');
                              setCouponFeedback(null);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Quitar cupón"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {(couponFeedback || cartPricingBreakdown.couponInvalidReason) && (
                        <div
                          className={`text-[11px] font-semibold ${
                            appliedCoupon && !cartPricingBreakdown.couponInvalidReason
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {cartPricingBreakdown.couponInvalidReason || couponFeedback}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DNI Loyalty Redemption Panel in Checkout */}
                  {catalog.enableLoyaltyProgram &&
                    (() => {
                      const { orderedTiers, unlockedTiers } = getEligibleLoyaltyTiers(
                        loyaltyAccount?.pointsBalance || 0,
                        catalog.loyaltyTiers
                      );
                      return (
                        <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <Award className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Programa de Puntos por DNI</span>
                            </div>
                            {cartEarnedPoints > 0 && (
                              <span className="text-[11px] font-mono tabular-nums font-bold text-indigo-700">
                                +{cartEarnedPoints} pts en esta compra
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={loyaltyDniInput}
                              onChange={(e) => setLoyaltyDniInput(normalizeDni(e.target.value))}
                              placeholder="Tu DNI sin puntos (ej. 35123456)"
                              className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                            />
                            <button
                              type="button"
                              disabled={loyaltyLoading}
                              onClick={() => void handleLookupLoyaltyDni()}
                              className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-60 text-white text-xs font-bold cursor-pointer shrink-0"
                            >
                              {loyaltyLoading ? 'Buscando...' : 'Consultar'}
                            </button>
                          </div>

                          {activeLoyaltyDni ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-700">
                                <span>
                                  DNI <strong>{activeLoyaltyDni}</strong>
                                </span>
                                <span className="font-bold text-emerald-700">
                                  Disponibles: {loyaltyAccount?.pointsBalance || 0} pts
                                </span>
                              </div>

                              {unlockedTiers.length > 0 ? (
                                isRedeemPaymentEligible ? (
                                  <div className="space-y-2">
                                    <div className="text-[11px] font-semibold text-slate-700">
                                      Elegí un descuento para canjear en esta compra (se descuentan automáticamente al confirmar):
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {unlockedTiers.map((tier) => {
                                        const isSelected = selectedRedeemTier?.id === tier.id;
                                        return (
                                          <button
                                            key={tier.id}
                                            type="button"
                                            onClick={() =>
                                              setSelectedRedeemTier(isSelected ? null : tier)
                                            }
                                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer font-mono tabular-nums transition-colors ${
                                              isSelected
                                                ? 'bg-emerald-700 text-white border-emerald-700'
                                                : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
                                            }`}
                                          >
                                            {tier.discountPercent}% OFF (-{tier.minPoints} pts)
                                          </button>
                                        );
                                      })}
                                      {selectedRedeemTier && (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedRedeemTier(null)}
                                          className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                                        >
                                          No canjear ahora
                                        </button>
                                      )}
                                    </div>
                                    {selectedRedeemTier && (
                                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-mono tabular-nums text-emerald-900 space-y-0.5">
                                        <div className="flex justify-between">
                                          <span>Descuento por canje ({selectedRedeemTier.discountPercent}% OFF):</span>
                                          <span className="font-bold">-{selectedRedeemTier.minPoints} pts</span>
                                        </div>
                                        <div className="flex justify-between text-indigo-800">
                                          <span>Sumás con esta compra:</span>
                                          <span className="font-bold">+{cartEarnedPoints} pts</span>
                                        </div>
                                        <div className="flex justify-between border-t border-emerald-200/80 pt-0.5 font-bold">
                                          <span>Saldo estimado al confirmar:</span>
                                          <span>
                                            {Math.max(
                                              0,
                                              (loyaltyAccount?.pointsBalance || 0) -
                                                selectedRedeemTier.minPoints +
                                                cartEarnedPoints
                                            )}{' '}
                                            pts
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-2">
                                    <div>
                                      Tenés <strong>{loyaltyAccount?.pointsBalance || 0} pts</strong> disponibles para descuento, pero el canje se habilita pagando con{' '}
                                      <strong>Retiro en el local</strong>, <strong>Transferencia</strong> o{' '}
                                      <strong>Dinero en cuenta (Mercado Pago)</strong>.
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {catalog.allowPickup !== false && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDeliveryMethod('retiro');
                                            if (
                                              selectedPayGroup === 'mercadopago' &&
                                              mpSubOption !== 'dinero_en_cuenta'
                                            ) {
                                              setSelectedPayGroup('efectivo');
                                            }
                                          }}
                                          className="px-2 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-[10px] font-bold text-amber-950 cursor-pointer"
                                        >
                                          Cambiar a Retiro en local
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setSelectedPayGroup('transferencia')}
                                        className="px-2 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-[10px] font-bold text-amber-950 cursor-pointer"
                                      >
                                        Pagar con Transferencia
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedPayGroup('mercadopago');
                                          setMpSubOption('dinero_en_cuenta');
                                        }}
                                        className="px-2 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-[10px] font-bold text-amber-950 cursor-pointer"
                                      >
                                        Dinero en cuenta MP
                                      </button>
                                    </div>
                                  </div>
                                )
                              ) : (
                                <div className="text-[11px] text-slate-500">
                                  {orderedTiers[0]
                                    ? `Acumulás +${cartEarnedPoints} pts al confirmar. Al llegar a ${orderedTiers[0].minPoints} pts desbloqueás ${orderedTiers[0].discountPercent}% OFF.`
                                    : 'Sumás puntos automáticamente al confirmar este pedido.'}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500">
                              Colocá tu DNI para acumular puntos o canjear tu descuento
                              {catalog.loyaltyRestrictRedeemMethods !== false
                                ? ' (canje válido con retiro en local, transferencia o Dinero en cuenta MP).'
                                : '.'}
                            </p>
                          )}
                        </div>
                      );
                    })()}

                  {/* Subtotal & Savings Breakdown Box */}
                  <div className="p-3.5 rounded-xl bg-slate-100 space-y-1.5">
                    {(cartPricingBreakdown.wholesaleSavings > 0 ||
                      cartPricingBreakdown.couponDiscount > 0 ||
                      cartPricingBreakdown.loyaltyDiscountAmount > 0 ||
                      Boolean(selectedRedeemTier && !isRedeemPaymentEligible) ||
                      cartPricingBreakdown.paymentMethodDiscountAmount > 0) && (
                      <div className="space-y-1 pb-1.5 border-b border-slate-200 text-xs">
                        <div className="flex items-center justify-between text-slate-600 font-mono tabular-nums">
                          <span>Subtotal de lista</span>
                          <span>{formatCurrency(cartPricingBreakdown.regularSubtotal, currency)}</span>
                        </div>
                        {cartPricingBreakdown.wholesaleSavings > 0 && (
                          <div className="flex items-center justify-between text-indigo-700 font-semibold font-mono tabular-nums">
                            <span>Ahorro precio mayorista</span>
                            <span>
                              -{formatCurrency(cartPricingBreakdown.wholesaleSavings, currency)}
                            </span>
                          </div>
                        )}
                        {cartPricingBreakdown.couponDiscount > 0 && appliedCoupon && (
                          <div className="flex items-center justify-between text-emerald-700 font-semibold font-mono tabular-nums">
                            <span>Cupón {appliedCoupon.code}</span>
                            <span>
                              -{formatCurrency(cartPricingBreakdown.couponDiscount, currency)}
                            </span>
                          </div>
                        )}
                        {cartPricingBreakdown.loyaltyDiscountAmount > 0 && (
                          <div className="flex items-center justify-between text-emerald-700 font-semibold font-mono tabular-nums">
                            <span>
                              Canje Puntos DNI ({cartPricingBreakdown.loyaltyDiscountPercent}% OFF · -{cartPricingBreakdown.redeemedPointsCost} pts)
                            </span>
                            <span>
                              -{formatCurrency(cartPricingBreakdown.loyaltyDiscountAmount, currency)}
                            </span>
                          </div>
                        )}
                        {selectedRedeemTier && !isRedeemPaymentEligible && (
                          <div className="flex items-center justify-between text-amber-800 text-[11px] font-medium">
                            <span>
                              Canje {selectedRedeemTier.discountPercent}% OFF pausado (elegí retiro en local, transferencia o Dinero en cuenta MP)
                            </span>
                          </div>
                        )}
                        {cartPricingBreakdown.paymentMethodDiscountAmount > 0 && (
                          <div className="flex items-center justify-between text-emerald-700 font-semibold font-mono tabular-nums">
                            <span>
                              Dto. Efectivo/Transferencia (
                              {cartPricingBreakdown.paymentMethodDiscountPercent}%)
                            </span>
                            <span>
                              -
                              {formatCurrency(
                                cartPricingBreakdown.paymentMethodDiscountAmount,
                                currency
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Total del pedido</span>
                      <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {formatCurrency(totalCartAmount, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Step 2: Modality Choice (Retiro en tienda vs Envío a domicilio) */}
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-slate-700">
                      2. ¿Cómo querés recibir tu compra?
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {catalog.allowPickup !== false && (
                        <button
                          type="button"
                          onClick={() => setDeliveryMethod('retiro')}
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            deliveryMethod === 'retiro'
                              ? 'bg-[#0B1933] text-white border-[#0B1933]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Store className="w-4 h-4 shrink-0" />
                            <span>Retiro en tienda</span>
                          </div>
                          <p
                            className={`text-[11px] mt-1 ${
                              deliveryMethod === 'retiro' ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            Pasás a retirar por el local
                          </p>
                        </button>
                      )}

                      {catalog.allowDelivery !== false && (
                        <button
                          type="button"
                          onClick={() => setDeliveryMethod('envio')}
                          className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                            deliveryMethod === 'envio'
                              ? 'bg-[#0B1933] text-white border-[#0B1933]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Truck className="w-4 h-4 shrink-0" />
                            <span>Envío a domicilio</span>
                          </div>
                          <p
                            className={`text-[11px] mt-1 ${
                              deliveryMethod === 'envio' ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            Coordinamos entrega y pago
                          </p>
                        </button>
                      )}
                    </div>

                    {deliveryMethod === 'retiro' ? (
                      (catalog.pickupAddress || catalog.pickupInstructions) && (
                        <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs space-y-1 text-slate-700">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-sky-700" />
                            <span>Dirección de retiro</span>
                          </div>
                          {catalog.pickupAddress && <div>{catalog.pickupAddress}</div>}
                          {catalog.pickupHours && (
                            <div className="text-slate-600">{catalog.pickupHours}</div>
                          )}
                          {catalog.pickupInstructions && (
                            <div className="text-slate-600 pt-0.5">{catalog.pickupInstructions}</div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1 text-slate-700">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Envío a tu domicilio</span>
                        </div>
                        <p className="text-slate-600">
                          {catalog.deliveryNote ||
                            'El vendedor recibirá tu pedido por WhatsApp para facturarlo, enviarte los datos de cobro y coordinar el envío.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Checkout Form */}
                  <form id="catalog-checkout-form" onSubmit={handleCheckoutSubmit} className="space-y-3">
                    <div className="text-xs font-bold text-slate-700">
                      3. Tus datos para facturar y enviar por WhatsApp
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Tu nombre y apellido *
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Ej. Juan Pérez"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Tu teléfono / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="Ej. 11 4567-8900"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>

                    {deliveryMethod === 'envio' && (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Dirección de entrega *
                        </label>
                        <input
                          type="text"
                          required
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder="Calle, número, piso/depto y localidad"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        {deliveryMethod === 'envio'
                          ? 'Horario preferido de entrega'
                          : '¿Cuándo pasarías a retirar?'}
                      </label>
                      <input
                        type="text"
                        value={pickupWindow}
                        onChange={(e) => setPickupWindow(e.target.value)}
                        placeholder="Ej. Hoy por la tarde / Mañana 10 hs"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>

                    {/* Interactive Payment Method Selector */}
                    <div className="space-y-2 pt-1">
                      <label className="text-xs font-bold text-slate-700 block">
                        4. Elegí cómo querés pagar *
                      </label>
                      {catalog.enableLoyaltyProgram &&
                        catalog.loyaltyRestrictRedeemMethods !== false &&
                        activeLoyaltyDni &&
                        (loyaltyAccount?.pointsBalance || 0) > 0 && (
                          <p
                            className={`text-[11px] rounded-lg px-2.5 py-1.5 border ${
                              isRedeemPaymentEligible
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-amber-50 border-amber-200 text-amber-900 font-medium'
                            }`}
                          >
                            {isRedeemPaymentEligible
                              ? 'Tu modalidad/pago actual permite canjear puntos por descuento.'
                              : 'Para canjear puntos elegí Retiro en el local, Transferencia o Mercado Pago (Dinero en cuenta).'}
                          </p>
                        )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedPayGroup('transferencia')}
                          className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            selectedPayGroup === 'transferencia'
                              ? 'bg-[#0B1933] text-white border-[#0B1933]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <CreditCard className="w-3.5 h-3.5 shrink-0" />
                            <span>Transferencia</span>
                          </div>
                          <p
                            className={`text-[10px] mt-0.5 ${
                              selectedPayGroup === 'transferencia' ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            Ver Alias y subir comprobante
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedPayGroup('mercadopago')}
                          className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            selectedPayGroup === 'mercadopago'
                              ? 'bg-[#009EE3] text-white border-[#009EE3]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Wallet className="w-3.5 h-3.5 shrink-0" />
                            <span>Mercado Pago</span>
                          </div>
                          <p
                            className={`text-[10px] mt-0.5 ${
                              selectedPayGroup === 'mercadopago' ? 'text-sky-100' : 'text-slate-500'
                            }`}
                          >
                            Dinero en cuenta / Tarjetas
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedPayGroup('efectivo')}
                          className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            selectedPayGroup === 'efectivo'
                              ? 'bg-[#0B1933] text-white border-[#0B1933]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Banknote className="w-3.5 h-3.5 shrink-0" />
                            <span>Efectivo</span>
                          </div>
                          <p
                            className={`text-[10px] mt-0.5 ${
                              selectedPayGroup === 'efectivo' ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {deliveryMethod === 'envio' ? 'Al recibir envío' : 'Al retirar en local'}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedPayGroup('acordar')}
                          className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            selectedPayGroup === 'acordar'
                              ? 'bg-[#0B1933] text-white border-[#0B1933]'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>A coordinar</span>
                          </div>
                          <p
                            className={`text-[10px] mt-0.5 ${
                              selectedPayGroup === 'acordar' ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            Con el vendedor por WhatsApp
                          </p>
                        </button>
                      </div>

                      {/* Transferencia Box: Alias del dueño + carga de comprobante */}
                      {selectedPayGroup === 'transferencia' && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                          <div className="space-y-1.5">
                            <div className="text-xs font-bold text-slate-900">
                              Datos bancarios para transferir
                            </div>
                            {catalog.merchantPaymentAlias?.trim() ||
                            catalog.merchantPaymentCvu?.trim() ? (
                              <div className="space-y-2 bg-white border border-slate-200 rounded-xl p-3">
                                {catalog.merchantPaymentAlias?.trim() && (
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                        Alias de la tienda
                                      </div>
                                      <div className="text-sm font-mono font-bold text-[#0B1933] truncate">
                                        {catalog.merchantPaymentAlias.trim()}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyStoreBankField('alias', catalog.merchantPaymentAlias)
                                      }
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer shrink-0"
                                    >
                                      {copiedField === 'alias' ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-300" />
                                          <span>Copiado</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>Copiar Alias</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                )}

                                {catalog.merchantPaymentCvu?.trim() && (
                                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                                    <div className="min-w-0">
                                      <div className="text-[10px] font-semibold text-slate-500">
                                        CBU / CVU
                                      </div>
                                      <div className="text-xs font-mono text-slate-800 truncate">
                                        {catalog.merchantPaymentCvu.trim()}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyStoreBankField('cvu', catalog.merchantPaymentCvu)
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                                    >
                                      {copiedField === 'cvu' ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span>Copiado</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3" />
                                          <span>Copiar</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                )}

                                {(catalog.merchantPaymentHolder?.trim() ||
                                  catalog.merchantPaymentBank?.trim()) && (
                                  <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-0.5">
                                    {catalog.merchantPaymentHolder?.trim() && (
                                      <span>
                                        Titular: <strong>{catalog.merchantPaymentHolder.trim()}</strong>
                                      </span>
                                    )}
                                    {catalog.merchantPaymentBank?.trim() && (
                                      <span>
                                        Entidad: <strong>{catalog.merchantPaymentBank.trim()}</strong>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                                El comercio aún no publicó su Alias aquí. Al confirmar tu pedido te lo enviarán por WhatsApp junto con el comprobante.
                              </div>
                            )}
                          </div>

                          {/* Upload Transfer Receipt */}
                          <div className="space-y-2 pt-1 border-t border-slate-200">
                            <div className="text-xs font-bold text-slate-800">
                              Cargar comprobante de pago (captura o foto)
                            </div>

                            {transferReceiptImageUrl ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-emerald-200">
                                  <img
                                    src={transferReceiptImageUrl}
                                    alt="Comprobante cargado"
                                    referrerPolicy="no-referrer"
                                    className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                                      <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                                      <span>Comprobante listo para verificar y enviar</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={Boolean(transferVerifyPreview?.checking)}
                                        onClick={() => void handleCheckTransferReceiptNow()}
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B1933] hover:underline cursor-pointer"
                                      >
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>
                                          {transferVerifyPreview?.checking
                                            ? 'Verificando...'
                                            : 'Verificar comprobante ahora'}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTransferReceiptImageUrl('');
                                          setTransferVerifyPreview(null);
                                        }}
                                        className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                                      >
                                        Quitar
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {transferVerifyPreview && !transferVerifyPreview.checking && transferVerifyPreview.summary && (
                                  <div
                                    className={`p-2 rounded-lg text-[11px] border ${
                                      transferVerifyPreview.approved
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : transferVerifyPreview.duplicate
                                        ? 'bg-rose-50 border-rose-200 text-rose-800 font-semibold'
                                        : 'bg-amber-50 border-amber-200 text-amber-900'
                                    }`}
                                  >
                                    {transferVerifyPreview.summary}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <label className="flex items-center justify-center gap-2 w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                                <Upload className="w-4 h-4 text-[#0B1933]" />
                                <span>
                                  {isCompressingReceipt
                                    ? 'Cargando comprobante...'
                                    : 'Subir comprobante de transferencia'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleReceiptFileChange}
                                  className="hidden"
                                />
                              </label>
                            )}

                            <input
                              type="text"
                              value={transferReference}
                              onChange={(e) => setTransferReference(e.target.value)}
                              placeholder="N° de operación o titular que transfiere (opcional)"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800"
                            />
                          </div>
                        </div>
                      )}

                      {/* Mercado Pago Box: Dinero en cuenta vs Tarjetas */}
                      {selectedPayGroup === 'mercadopago' && (
                        <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2.5">
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <Wallet className="w-4 h-4 text-[#009EE3]" />
                            <span>Cómo pagar dentro de Mercado Pago</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setMpSubOption('dinero_en_cuenta')}
                              className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                                mpSubOption === 'dinero_en_cuenta'
                                  ? 'bg-[#009EE3] text-white border-[#009EE3]'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="text-xs font-bold">Dinero en cuenta MP</div>
                              <div
                                className={`text-[10px] mt-0.5 ${
                                  mpSubOption === 'dinero_en_cuenta'
                                    ? 'text-sky-100'
                                    : 'text-slate-500'
                                }`}
                              >
                                Pagás directo con tu saldo disponible
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={() => setMpSubOption('tarjetas_todos')}
                              className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                                mpSubOption === 'tarjetas_todos'
                                  ? 'bg-[#0B1933] text-white border-[#0B1933]'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div className="text-xs font-bold">Tarjetas / Todos MP</div>
                              <div
                                className={`text-[10px] mt-0.5 ${
                                  mpSubOption === 'tarjetas_todos'
                                    ? 'text-slate-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                Débito, crédito o saldo en cuenta
                              </div>
                            </button>
                          </div>

                          <p className="text-[11px] text-slate-700 leading-relaxed">
                            {mpSubOption === 'dinero_en_cuenta'
                              ? 'Al confirmar el pedido te llevamos directo a Mercado Pago con "Dinero en cuenta" habilitado desde acá mismo para acreditarlo al instante.'
                              : 'Al confirmar el pedido se abrirá el checkout seguro de Mercado Pago.'}
                          </p>

                          {!catalog.hasMerchantMpAccessToken &&
                            !catalog.merchantMpCheckoutLink &&
                            catalog.merchantPaymentAlias?.trim() && (
                              <div className="p-2.5 rounded-xl bg-white border border-sky-200 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <div className="text-[10px] font-semibold text-slate-500">
                                      Alias MP para transferir con Dinero en cuenta:
                                    </div>
                                    <div className="text-xs font-mono font-bold text-[#0B1933]">
                                      {catalog.merchantPaymentAlias.trim()}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleCopyStoreBankField('alias', catalog.merchantPaymentAlias)
                                    }
                                    className="px-2 py-1 rounded-lg bg-[#009EE3] text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    {copiedField === 'alias' ? 'Copiado' : 'Copiar Alias'}
                                  </button>
                                </div>
                                {transferReceiptImageUrl ? (
                                  <div className="flex items-center gap-2 text-[11px] text-emerald-700 font-semibold">
                                    <FileCheck2 className="w-3.5 h-3.5" />
                                    <span>Comprobante MP adjuntado</span>
                                    <button
                                      type="button"
                                      onClick={() => setTransferReceiptImageUrl('')}
                                      className="text-rose-600 ml-auto cursor-pointer"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                ) : (
                                  <label className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-dashed border-sky-300 text-[11px] font-semibold text-slate-700 cursor-pointer hover:bg-sky-50">
                                    <Upload className="w-3.5 h-3.5 text-[#009EE3]" />
                                    <span>Adjuntar comprobante MP (opcional)</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={handleReceiptFileChange}
                                      className="hidden"
                                    />
                                  </label>
                                )}
                              </div>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Observaciones y Pedido Específico antes de cerrar el pedido */}
                    <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/90 space-y-2">
                      <div className="space-y-0.5">
                        <label
                          htmlFor="catalog-order-observations"
                          className="text-xs font-bold text-slate-900 block"
                        >
                          5. Observaciones o pedido específico (opcional)
                        </label>
                        <p className="text-[11px] text-slate-600">
                          ¿Querés aclarar algo o hacer un pedido especial antes de cerrar tu compra? El vendedor lo verá en el detalle del pedido y por WhatsApp.
                        </p>
                      </div>
                      <textarea
                        id="catalog-order-observations"
                        rows={3}
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Ej: Envolver para regalo, si no hay negro enviar azul, timbre roto llamar al llegar, preferencia de talle/corte o DNI/CUIT para factura..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          'Envolver para regalo',
                          'Llamar al llegar',
                          'Enviar factura con DNI',
                          'Consultar si entra otro color/talle',
                        ].map((presetText) => (
                          <button
                            key={presetText}
                            type="button"
                            onClick={() =>
                              setOrderNotes((prev) => {
                                const clean = prev.trim();
                                if (clean.toLowerCase().includes(presetText.toLowerCase())) {
                                  return prev;
                                }
                                return clean ? `${clean} · ${presetText}` : presetText;
                              })
                            }
                            className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#0B1933] text-[11px] font-semibold text-slate-700 cursor-pointer transition-colors"
                          >
                            + {presetText}
                          </button>
                        ))}
                      </div>
                    </div>

                    {catalog.enablePromoClub !== false && (
                      <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={optInPromoClub}
                          onChange={(e) => setOptInPromoClub(e.target.checked)}
                          className="mt-0.5 rounded border-slate-300"
                        />
                        <span>
                          <strong className="text-slate-900">
                            Quiero recibir promos y descuentos exclusivos por WhatsApp
                          </strong>
                          <span className="block text-[11px] text-slate-600 mt-0.5">
                            Te avisamos primero sobre nuevos ingresos y cupones de {catalog.storeName}.
                          </span>
                        </span>
                      </label>
                    )}

                    {formError && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                        {formError}
                      </div>
                    )}
                  </form>
                </>
              )}
            </div>

            {!submittedOrder && cartItems.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-white space-y-2">
                <button
                  type="submit"
                  form="catalog-checkout-form"
                  disabled={submitting || isCreatingMpLink}
                  className={`w-full py-3 px-4 rounded-xl disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    selectedPayGroup === 'mercadopago'
                      ? 'bg-[#009EE3] hover:bg-[#008ACA]'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {selectedPayGroup === 'mercadopago' ? (
                    <Wallet className="w-4 h-4" />
                  ) : (
                    <MessageCircle className="w-4 h-4" />
                  )}
                  <span>
                    {submitting || isCreatingMpLink
                      ? 'Procesando pedido...'
                      : selectedPayGroup === 'mercadopago'
                      ? `Pagar con Mercado Pago · ${
                          mpSubOption === 'dinero_en_cuenta' ? 'Dinero en cuenta' : 'Tarjetas'
                        } (${formatCurrency(totalCartAmount, currency)})`
                      : `Confirmar pedido y WhatsApp (${
                          deliveryMethod === 'envio' ? 'Envío' : 'Retiro'
                        } · ${formatCurrency(totalCartAmount, currency)})`}
                  </span>
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Modal: Avisar cuando haya stock (Nombre + Teléfono) */}
      {stockAlertProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0B1933] text-white flex items-center justify-center shrink-0">
                  <Bell className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Avisar cuando haya stock
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Dejanos tus datos y te avisamos por WhatsApp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStockAlertProduct(null)}
                aria-label="Cerrar aviso de stock"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Selected Out-of-stock Product Preview */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {stockAlertProduct.imageUrl ? (
                    <img
                      src={stockAlertProduct.imageUrl}
                      alt={stockAlertProduct.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    {stockAlertProduct.name}
                    {stockAlertVariant ? ` (${stockAlertVariant.label})` : ''}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {formatCurrency(getVariantDisplayPrice(stockAlertProduct, stockAlertVariant), currency)}
                    {(stockAlertVariant?.sku || stockAlertProduct.sku)
                      ? ` · Cód: ${stockAlertVariant?.sku || stockAlertProduct.sku}`
                      : ''}
                    {' · '}
                    <span className="text-rose-700 font-semibold">Sin stock actual</span>
                  </div>
                </div>
              </div>

              {alertSubmitted ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
                    <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
                    <h4 className="text-sm font-bold text-slate-900">
                      ¡Te anotamos en la lista de aviso!
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Cuando vuelva a ingresar{' '}
                      <strong>
                        {stockAlertProduct.name}
                        {stockAlertVariant ? ` (${stockAlertVariant.label})` : ''}
                      </strong>
                      , <strong>{catalog.storeName}</strong> se va a comunicar con{' '}
                      <strong>{alertCustomerName}</strong> al{' '}
                      <strong className="font-mono tabular-nums">{alertCustomerPhone}</strong>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStockAlertProduct(null)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                  >
                    Seguir viendo el catálogo
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitStockAlert} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Tu nombre y apellido *
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={alertCustomerName}
                      onChange={(e) => setAlertCustomerName(e.target.value)}
                      placeholder="Ej. María Gómez"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Tu teléfono / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      value={alertCustomerPhone}
                      onChange={(e) => setAlertCustomerPhone(e.target.value)}
                      placeholder="Ej. 11 4567-8900"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                    />
                  </div>

                  {alertError && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                      {alertError}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setStockAlertProduct(null)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={alertSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-60 text-white cursor-pointer"
                    >
                      <Bell className="w-3.5 h-3.5 text-amber-300" />
                      <span>{alertSubmitting ? 'Guardando...' : 'Avisarme cuando haya stock'}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product Multi-Photo Gallery Lightbox */}
      {zoomedGallery && (
        <div
          className="fixed inset-0 z-60 bg-slate-950/90 flex items-center justify-center p-4"
          onClick={() => setZoomedGallery(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">
                  {zoomedGallery.title}
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  Foto {zoomedGallery.index + 1} de {zoomedGallery.images.length}
                  {zoomedGallery.sku ? ` · Cód: ${zoomedGallery.sku}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setZoomedGallery(null)}
                aria-label="Cerrar galería"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative bg-slate-100 flex items-center justify-center p-3 min-h-[300px] max-h-[72vh]">
              <img
                src={zoomedGallery.images[zoomedGallery.index]}
                alt={`${zoomedGallery.title} ${zoomedGallery.index + 1}`}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] w-auto object-contain rounded-lg"
              />
              {zoomedGallery.images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Imagen anterior"
                    onClick={() =>
                      setZoomedGallery((prev) =>
                        prev
                          ? {
                              ...prev,
                              index:
                                (prev.index - 1 + prev.images.length) % prev.images.length,
                            }
                          : null
                      )
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 text-slate-900 shadow-md flex items-center justify-center cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Imagen siguiente"
                    onClick={() =>
                      setZoomedGallery((prev) =>
                        prev
                          ? {
                              ...prev,
                              index: (prev.index + 1) % prev.images.length,
                            }
                          : null
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/95 text-slate-900 shadow-md flex items-center justify-center cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {zoomedGallery.images.length > 1 && (
              <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-center gap-2 overflow-x-auto bg-white">
                {zoomedGallery.images.map((src, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      setZoomedGallery((prev) => (prev ? { ...prev, index: idx } : null))
                    }
                    className={`w-12 h-12 rounded-lg overflow-hidden border-2 cursor-pointer shrink-0 ${
                      idx === zoomedGallery.index
                        ? 'border-[#0B1933]'
                        : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={src}
                      alt={`Miniatura ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
