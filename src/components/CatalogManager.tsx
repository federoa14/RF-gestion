import { isNewOrderSoundEnabled, playNewOrderChime, setNewOrderSoundEnabled } from '../utils/newOrderAlerts';
import { StoreDesignEditor } from './StoreDesignEditor';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Store,
  Plus,
  Image as ImageIcon,
  Upload,
  Link2,
  Copy,
  Check,
  ExternalLink,
  MessageCircle,
  Edit2,
  Trash2,
  Search,
  MapPin,
  Clock,
  Eye,
  EyeOff,
  ShoppingBag,
  RefreshCw,
  CheckCircle2,
  X,
  Star,
  Truck,
  Receipt,
  CreditCard,
  AlertTriangle,
  Phone,
  Barcode,
  Bell,
  Minus,
  Tag,
  SlidersHorizontal,
  Palette,
  FileCheck2,
  Wallet,
  Send,
  ShieldCheck,
  Percent,
  Gift,
  Download,
  Users,
  FileSpreadsheet,
  Megaphone,
  Cake,
  ArrowUp,
  ArrowDown,
  DollarSign,
  BarChart3,
  Award,
  UserCheck,
  Flame,
  QrCode,
  RotateCcw,
  ShoppingCart,
  Lock,
  Crown,
  MoreHorizontal,
} from 'lucide-react';
import {
  CatalogAbandonedCart,
  CatalogCoupon,
  CatalogGiftCard,
  CatalogLoyaltyAccount,
  CatalogLoyaltyTier,
  CatalogOrderStageNotification,
  CatalogPickupOrder,
  CatalogProduct,
  CatalogProductVariant,
  CatalogPromoBanner,
  CatalogPromoSubscriber,
  CatalogStockAlertRequest,
  DistributorConfig,
  OnlineCatalogSettings,
  SaleLineItem,
  SubscriptionPlanTier,
  Tenant,
} from '../types';
import { formatCurrency } from '../utils/alerts';
import {
  CATALOG_PAYMENT_OPTION_KEYS,
  CATALOG_PAYMENT_OPTION_LABELS,
  isPaymentOptionEnabled,
  resolveEnabledPaymentOptions,
} from '../utils/catalogPaymentOptions';
import {
  CatalogOrderProcessStage,
  createWhatsAppUrl,
  generateAbandonedCartRecoveryWhatsAppMessage,
  generateCatalogBirthdayPromoWhatsAppMessage,
  generateCatalogOrderCustomerProcessMessage,
  generateCatalogPromoClubWhatsAppMessage,
  generateGiftCardWhatsAppMessage,
  generatePaymentReceiptWhatsAppMessage,
  generateStockAlertRestockWhatsAppMessage,
} from '../utils/whatsapp';
import {
  buildPublicCatalogHandle,
  normalizeGiftCardCode,
  notifyCatalogOrderCustomerStageViaServer,
  notifyCatalogStockAlertViaServer,
  sendCatalogPromoWhatsAppViaServer,
  syncCatalogOrderToSupabase,
  testMerchantMercadoPagoConnection,
  upsertCatalogGiftCardToSupabase,
  upsertPublicAbandonedCartToSupabase,
  verifyCatalogTransferReceiptViaServer,
} from '../utils/supabaseServices';
import {
  applyDirectPriceUpdate,
  applyOrderStockDeltaToProducts,
  applyPercentagePriceAdjustment,
  CatalogPriceRoundingStep,
  computeAggregateStockFromVariants,
  findMatchingVariant,
  getDefaultLoyaltyTiers,
  getEligibleLoyaltyTiers,
  getProductGalleryImages,
  getProductLowStockStatus,
  getProductPointsPerUnit,
  getProductSummaryStock,
  getUpcomingBirthdaySubscribers,
  getVariantStock,
  hasProductVariants,
  isProductFlashSaleActive,
  isProductFullyOutOfStock,
  normalizeDni,
  normalizeLoyaltyTiers,
  UpcomingBirthdayEntry,
} from '../utils/catalogStock';
import {
  buildCatalogCsvTemplate,
  exportCatalogProductsToCsv,
  parseCatalogSpreadsheetText,
  triggerCsvDownload,
} from '../utils/catalogCsv';
import {
  getCatalogRubroPreset,
  normalizeFilterList,
} from '../utils/catalogRubros';
import {
  PLAN_WEB_MAX_PRODUCTS,
  PLAN_WEB_MAX_RUBROS,
} from '../utils/tenantSubscription';
import { BrandMark } from './BrandMark';
import type { ReceiptModalData } from './PaymentReceiptModal';
import { WebOrderDetailModal } from './WebOrderDetailModal';
import { WebLoyaltyClientsPanel } from './WebLoyaltyClientsPanel';
import { QrCodeSvg } from './QrCodeSvg';

interface CatalogManagerProps {
  // Al cambiar n, abre esa pestaña (por ejemplo 'pedidos' desde el aviso de pedido nuevo)
  focusRequest?: { subTab: 'pedidos' | 'productos' | 'configuracion'; n: number };
  config: DistributorConfig;
  tenant: Tenant | null;
  settings: OnlineCatalogSettings;
  products: CatalogProduct[];
  orders: CatalogPickupOrder[];
  stockAlerts?: CatalogStockAlertRequest[];
  promoSubscribers?: CatalogPromoSubscriber[];
  loyaltyAccounts?: CatalogLoyaltyAccount[];
  abandonedCarts?: CatalogAbandonedCart[];
  giftCards?: CatalogGiftCard[];
  activeUserName?: string;
  onSaveSettings: (next: OnlineCatalogSettings) => void;
  onSaveMerchantPaymentConfig?: (paymentCfg: {
    merchantPaymentAlias?: string;
    merchantPaymentCvu?: string;
    merchantPaymentBank?: string;
    merchantPaymentHolder?: string;
    merchantMpCheckoutLink?: string;
    merchantMpAccessToken?: string;
  }) => void;
  onSaveProducts: (next: CatalogProduct[]) => void;
  onSaveOrders: (next: CatalogPickupOrder[]) => void;
  onSaveStockAlerts?: (next: CatalogStockAlertRequest[]) => void;
  onSavePromoSubscribers?: (next: CatalogPromoSubscriber[]) => void;
  onSaveLoyaltyAccounts?: (next: CatalogLoyaltyAccount[]) => void;
  onSaveAbandonedCarts?: (next: CatalogAbandonedCart[]) => void;
  onSaveGiftCards?: (next: CatalogGiftCard[]) => void;
  onRefreshOrders?: () => Promise<void>;
  onRefreshStockAlerts?: () => Promise<void>;
  onRefreshPromoSubscribers?: () => Promise<void>;
  onRefreshLoyaltyAccounts?: () => Promise<void>;
  onRefreshAbandonedCarts?: () => Promise<void>;
  onRefreshGiftCards?: () => Promise<void>;
  onBillOrder?: (order: CatalogPickupOrder) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onOpenReturnModal?: (order: CatalogPickupOrder) => void;
  onOpenPublicPreview: (handle: string) => void;
  onOpenEditBrand?: () => void;
  planFeatureAccess?: { tier?: SubscriptionPlanTier; canAccessFullFeatures: boolean };
  onRequestUpgradePlan?: (ctx?: {
    reasonKey: 'limit_rubros' | 'limit_products' | 'full_feature';
    title?: string;
    detail?: string;
  }) => void;
  showToast: (msg: string) => void;
}

function toDatetimeLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}



async function compressProductImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no válido'));
      img.onload = () => {
        const maxSide = 900;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          if (width >= height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas no disponible'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function compressBannerImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen del banner'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen de banner no válido'));
      img.onload = () => {
        const maxWidth = 1280;
        const maxHeight = 540;
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas no disponible'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}


// Filtros de la vista de pedidos del catálogo
const ORDER_STATUS_FILTERS: Array<{ id: string; label: string; match?: (o: CatalogPickupOrder) => boolean }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'nuevos', label: 'Por armar', match: (o) => o.status === 'pendiente_retiro' },
  { id: 'listos', label: 'Listos', match: (o) => o.status === 'listo_para_retirar' },
  { id: 'camino', label: 'En camino', match: (o) => o.status === 'en_camino' },
  { id: 'entregados', label: 'Entregados', match: (o) => o.status === 'retirado' },
  { id: 'cerrados', label: 'Cancelados / devueltos', match: (o) => o.status === 'cancelado' || o.status === 'devuelto' },
];

function getOrderStatusInfo(status: CatalogPickupOrder['status'], isDelivery: boolean): { label: string; className: string } {
  switch (status) {
    case 'pendiente_retiro':
      return { label: 'Por armar', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'listo_para_retirar':
      return { label: isDelivery ? 'Listo para despachar' : 'Listo para retirar', className: 'bg-sky-50 text-sky-800 border-sky-200' };
    case 'en_camino':
      return { label: 'En camino', className: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
    case 'retirado':
      return { label: isDelivery ? 'Entregado y pagado' : 'Retirado y pagado', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'devuelto':
      return { label: 'Devuelto', className: 'bg-rose-50 text-rose-800 border-rose-200' };
    default:
      return { label: 'Cancelado', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

export const CatalogManager: React.FC<CatalogManagerProps> = ({
  config,
  tenant,
  settings,
  products,
  orders,
  stockAlerts = [],
  promoSubscribers = [],
  loyaltyAccounts = [],
  abandonedCarts = [],
  giftCards = [],
  activeUserName,
  onSaveSettings,
  onSaveMerchantPaymentConfig,
  onSaveProducts,
  onSaveOrders,
  onSaveStockAlerts,
  onSavePromoSubscribers,
  onSaveLoyaltyAccounts,
  onSaveAbandonedCarts,
  onSaveGiftCards,
  onRefreshOrders,
  onRefreshStockAlerts,
  onRefreshPromoSubscribers,
  onRefreshLoyaltyAccounts,
  onRefreshAbandonedCarts,
  onRefreshGiftCards,
  onBillOrder,
  onOpenReceipt,
  onOpenReturnModal,
  onOpenPublicPreview,
  onOpenEditBrand,
  planFeatureAccess,
  onRequestUpgradePlan,
  showToast,
  focusRequest,
}) => {
  const [subTab, setSubTab] = useState<
    | 'productos'
    | 'pedidos'
    | 'avisos_stock'
    | 'carritos_abandonados'
    | 'gift_cards'
    | 'club_promos'
    | 'clientes_web'
    | 'estadisticas'
    | 'configuracion'
  >(() => focusRequest?.subTab || 'productos');
  useEffect(() => {
    if (focusRequest?.n) setSubTab(focusRequest.subTab);
  }, [focusRequest?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const [orderSoundOn, setOrderSoundOn] = useState(isNewOrderSoundEnabled);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedSubfilter, setSelectedSubfilter] = useState<string>('Todos');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [newSubfilterInput, setNewSubfilterInput] = useState('');
  const [settingsFilterInput, setSettingsFilterInput] = useState('');
  const [settingsSubfilterInput, setSettingsSubfilterInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRefreshingOrders, setIsRefreshingOrders] = useState(false);
  const [isRefreshingAlerts, setIsRefreshingAlerts] = useState(false);
  const [isEditingWhatsappInline, setIsEditingWhatsappInline] = useState(false);
  const [inlineWhatsappDraft, setInlineWhatsappDraft] = useState(
    () => settings.whatsappPhone || config.senderPhone || config.distributorPhone || ''
  );

  const activeCatalogRubro =
    tenant?.catalogRubro || settings.catalogRubro || config.businessRubro || 'distribuidora';
  const rubroPreset = useMemo(
    () => getCatalogRubroPreset(activeCatalogRubro),
    [activeCatalogRubro]
  );

  // Store settings local draft
  const [draftSettings, setDraftSettings] = useState<OnlineCatalogSettings>(() => ({
    published: settings.published !== false,
    catalogRubro: activeCatalogRubro,
    rubroFilters:
      normalizeFilterList(settings.rubroFilters).length > 0
        ? normalizeFilterList(settings.rubroFilters)
        : rubroPreset.defaultFilters,
    customSubfilters: normalizeFilterList(settings.customSubfilters),
    storeName: settings.storeName || config.distributorName || tenant?.name || 'Mi Catálogo',
    tagline:
      settings.tagline ||
      'Armá tu carrito de compras, elegí retiro en tienda o envío a domicilio y envialo por WhatsApp.',
    slug: settings.slug || '',
    whatsappPhone: settings.whatsappPhone || config.senderPhone || config.distributorPhone || '',
    allowPickup: settings.allowPickup !== false,
    allowDelivery: settings.allowDelivery !== false,
    deliveryNote:
      settings.deliveryNote ||
      'Coordinamos costo y horario de envío por WhatsApp antes de despachar.',
    pickupAddress:
      settings.pickupAddress ||
      tenant?.address ||
      (tenant?.city ? `${tenant.city}${tenant.province ? `, ${tenant.province}` : ''}` : ''),
    pickupHours: settings.pickupHours || 'Lunes a Sábado · 9:00 a 19:00 hs',
    pickupInstructions:
      settings.pickupInstructions ||
      'Coordinamos por WhatsApp cuando tu pedido esté armado para pasar a retirarlo.',
    paymentNote: settings.paymentNote || 'Efectivo, transferencia o link de pago',
    paymentMethods: settings.paymentMethods,
    storeTheme: settings.storeTheme,
    defaultLowStockThreshold: settings.defaultLowStockThreshold ?? 2,
    cashOrTransferDiscountPercent: settings.cashOrTransferDiscountPercent ?? 0,
    coupons: settings.coupons || [],
    enablePromoClub: settings.enablePromoClub !== false,
    promoClubTitle: settings.promoClubTitle || 'Club de Promos y Descuentos',
    promoClubIncentive:
      settings.promoClubIncentive ||
      'Registrate gratis y recibí ofertas exclusivas, ingresos y cupones directo en tu WhatsApp.',
    promoClubWelcomeCoupon: settings.promoClubWelcomeCoupon || '',
    promoBanners: settings.promoBanners || [],
    enableLoyaltyProgram: Boolean(settings.enableLoyaltyProgram),
    loyaltyPointsPerUnit:
      typeof settings.loyaltyPointsPerUnit === 'number' ? settings.loyaltyPointsPerUnit : 10,
    loyaltyTiers: normalizeLoyaltyTiers(settings.loyaltyTiers),
    currencySymbol: settings.currencySymbol || config.currencySymbol || '$',
  }));

  useEffect(() => {
    const resolvedPhone =
      settings.whatsappPhone || config.senderPhone || config.distributorPhone || '';
    const presetForSync = getCatalogRubroPreset(
      tenant?.catalogRubro || settings.catalogRubro || config.businessRubro || 'distribuidora'
    );
    const resolvedFilters =
      normalizeFilterList(settings.rubroFilters).length > 0
        ? normalizeFilterList(settings.rubroFilters)
        : presetForSync.defaultFilters;

    setInlineWhatsappDraft(resolvedPhone);
    setDraftSettings({
      published: settings.published !== false,
      catalogRubro:
        tenant?.catalogRubro || settings.catalogRubro || config.businessRubro || 'distribuidora',
      rubroFilters: resolvedFilters,
      customSubfilters: normalizeFilterList(settings.customSubfilters),
      storeName: settings.storeName || config.distributorName || tenant?.name || 'Mi Catálogo',
      tagline:
        settings.tagline ||
        'Armá tu carrito de compras, elegí retiro en tienda o envío a domicilio y envialo por WhatsApp.',
      slug: settings.slug || '',
      whatsappPhone: resolvedPhone,
      allowPickup: settings.allowPickup !== false,
      allowDelivery: settings.allowDelivery !== false,
      deliveryNote:
        settings.deliveryNote ||
        'Coordinamos costo y horario de envío por WhatsApp antes de despachar.',
      pickupAddress:
        settings.pickupAddress ||
        tenant?.address ||
        (tenant?.city ? `${tenant.city}${tenant.province ? `, ${tenant.province}` : ''}` : ''),
      pickupHours: settings.pickupHours || 'Lunes a Sábado · 9:00 a 19:00 hs',
      pickupInstructions:
        settings.pickupInstructions ||
        'Coordinamos por WhatsApp cuando tu pedido esté armado para pasar a retirarlo.',
      paymentNote: settings.paymentNote || 'Efectivo, transferencia o link de pago',
      paymentMethods: settings.paymentMethods,
      storeTheme: settings.storeTheme,
      defaultLowStockThreshold: settings.defaultLowStockThreshold ?? 2,
      cashOrTransferDiscountPercent: settings.cashOrTransferDiscountPercent ?? 0,
      coupons: settings.coupons || [],
      enablePromoClub: settings.enablePromoClub !== false,
      promoClubTitle: settings.promoClubTitle || 'Club de Promos y Descuentos',
      promoClubIncentive:
        settings.promoClubIncentive ||
        'Registrate gratis y recibí ofertas exclusivas, ingresos y cupones directo en tu WhatsApp.',
      promoClubWelcomeCoupon: settings.promoClubWelcomeCoupon || '',
      promoBanners: settings.promoBanners || [],
      enableLoyaltyProgram: Boolean(settings.enableLoyaltyProgram),
      loyaltyPointsPerUnit:
        typeof settings.loyaltyPointsPerUnit === 'number' ? settings.loyaltyPointsPerUnit : 10,
      loyaltyTiers: normalizeLoyaltyTiers(settings.loyaltyTiers),
      currencySymbol: settings.currencySymbol || config.currencySymbol || '$',
    });
  }, [
    settings,
    tenant?.id,
    tenant?.catalogRubro,
    config.distributorName,
    config.senderPhone,
    config.distributorPhone,
    config.currencySymbol,
    config.businessRubro,
  ]);

  const [draftMerchantPayment, setDraftMerchantPayment] = useState({
    merchantPaymentAlias: config.merchantPaymentAlias || '',
    merchantPaymentCvu: config.merchantPaymentCvu || '',
    merchantPaymentBank: config.merchantPaymentBank || '',
    merchantPaymentHolder: config.merchantPaymentHolder || '',
    merchantMpCheckoutLink: config.merchantMpCheckoutLink || '',
    merchantMpAccessToken: '',
  });
  // Mercado Pago solo se puede ofrecer si el comercio lo tiene configurado (token o link de cobro)
  const merchantMpAvailable = Boolean(
    config.hasMerchantMpAccessToken ||
      draftMerchantPayment.merchantMpAccessToken.trim() ||
      draftMerchantPayment.merchantMpCheckoutLink.trim()
  );

  useEffect(() => {
    setDraftMerchantPayment((prev) => ({
      merchantPaymentAlias: config.merchantPaymentAlias || '',
      merchantPaymentCvu: config.merchantPaymentCvu || '',
      merchantPaymentBank: config.merchantPaymentBank || '',
      merchantPaymentHolder: config.merchantPaymentHolder || '',
      merchantMpCheckoutLink: config.merchantMpCheckoutLink || '',
      merchantMpAccessToken: prev.merchantMpAccessToken || '',
    }));
  }, [
    config.merchantPaymentAlias,
    config.merchantPaymentCvu,
    config.merchantPaymentBank,
    config.merchantPaymentHolder,
    config.merchantMpCheckoutLink,
  ]);

  // Product Form Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [productName, setProductName] = useState('');
  // Errores de validación del formulario de producto, mostrados junto a cada campo
  const [productFormErrors, setProductFormErrors] = useState<{ name?: string; price?: string; stock?: string }>({});
  const [productSku, setProductSku] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStockQuantity, setProductStockQuantity] = useState('');
  const [productVariants, setProductVariants] = useState<
    { id: string; label: string; stockQuantity: string; sku: string; price: string }[]
  >([]);
  const [productCategory, setProductCategory] = useState('General');
  const [productSubfilters, setProductSubfilters] = useState<string[]>([]);
  const [modalNewSubfilter, setModalNewSubfilter] = useState('');
  const [productUnitLabel, setProductUnitLabel] = useState('Unidad');
  const [productDescription, setProductDescription] = useState('');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productAdditionalImages, setProductAdditionalImages] = useState<string[]>([]);
  const [additionalImageUrlInput, setAdditionalImageUrlInput] = useState('');
  const [productWholesaleMinQty, setProductWholesaleMinQty] = useState('');
  const [productWholesalePrice, setProductWholesalePrice] = useState('');
  const [productFlashSalePrice, setProductFlashSalePrice] = useState('');
  const [productFlashSaleEndsAt, setProductFlashSaleEndsAt] = useState('');
  const [productIsOutlet, setProductIsOutlet] = useState(false);
  const [productLowStockThreshold, setProductLowStockThreshold] = useState('');
  const [productLoyaltyPoints, setProductLoyaltyPoints] = useState('');
  const [productAvailable, setProductAvailable] = useState(true);
  const [productFeatured, setProductFeatured] = useState(false);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<CatalogPickupOrder | null>(null);
  // Vista de pedidos: filtro por estado, búsqueda y menú "Más" de cada pedido
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('todos');
  const [orderSearch, setOrderSearch] = useState('');
  const [openOrderMenuId, setOpenOrderMenuId] = useState<string | null>(null);
  const [verifyingOrderId, setVerifyingOrderId] = useState<string | null>(null);

  // Carritos Abandonados (#1) & Gift Cards QR (#3)
  const [isRefreshingCarts, setIsRefreshingCarts] = useState(false);
  const [cartFilterScope, setCartFilterScope] = useState<'pending' | 'all'>('pending');
  const [cartIncentiveCouponCode, setCartIncentiveCouponCode] = useState('');
  const [isRefreshingGiftCards, setIsRefreshingGiftCards] = useState(false);
  const [gcSearchQuery, setGcSearchQuery] = useState('');
  const [gcInitialAmount, setGcInitialAmount] = useState('');
  const [gcCustomCode, setGcCustomCode] = useState('');
  const [gcRecipientName, setGcRecipientName] = useState('');
  const [gcRecipientPhone, setGcRecipientPhone] = useState('');
  const [gcBuyerName, setGcBuyerName] = useState('');
  const [gcBuyerDni, setGcBuyerDni] = useState('');
  const [gcMessage, setGcMessage] = useState('');
  const [gcExpiresAt, setGcExpiresAt] = useState('');
  const [selectedGiftCardForQr, setSelectedGiftCardForQr] = useState<CatalogGiftCard | null>(null);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percent' | 'fixed'>('percent');
  const [newCouponValue, setNewCouponValue] = useState('');
  const [newCouponMinPurchase, setNewCouponMinPurchase] = useState('');
  const [promoCategoryFilter, setPromoCategoryFilter] = useState('Todas');
  const [promoMessageDraft, setPromoMessageDraft] = useState('');
  const [promoCouponCodeDraft, setPromoCouponCodeDraft] = useState('');
  const [isSendingBatchPromo, setIsSendingBatchPromo] = useState(false);
  const [isRefreshingPromos, setIsRefreshingPromos] = useState(false);
  const [isTestingMp, setIsTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{
    ok: boolean;
    valid: boolean;
    hasSavedToken?: boolean;
    account?: {
      id?: number | string;
      nickname?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      siteId?: string;
    };
    webhookUrls?: {
      serverWebhookUrl?: string;
      supabaseWebhookUrl?: string;
    };
    error?: string;
  } | null>(null);
  const [copiedWebhookField, setCopiedWebhookField] = useState<string | null>(null);
  const [isBatchNotifyingAlerts, setIsBatchNotifyingAlerts] = useState(false);

  // Per-product inline quick price editor ($ fixed or %)
  const [quickPriceProductId, setQuickPriceProductId] = useState<string | null>(null);
  const [quickPriceMode, setQuickPriceMode] = useState<'fixed' | 'percent'>('fixed');
  const [quickPriceInput, setQuickPriceInput] = useState('');
  const [quickPriceScaleExtras, setQuickPriceScaleExtras] = useState(true);

  // Multi-select bulk percentage adjustment
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [bulkPercentInput, setBulkPercentInput] = useState('10');
  const [bulkRoundingStep, setBulkRoundingStep] = useState<CatalogPriceRoundingStep>(0);
  const [bulkIncludeWholesale, setBulkIncludeWholesale] = useState(true);
  const [bulkIncludeVariants, setBulkIncludeVariants] = useState(true);

  // CSV / Excel bulk import modal
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState(false);
  const [csvRawInput, setCsvRawInput] = useState('');
  const [csvConflictMode, setCsvConflictMode] = useState<'upsert' | 'only_new'>('upsert');
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);

  // Promotional banners builder inside Settings
  const [newBannerMode, setNewBannerMode] = useState<'built' | 'image'>('built');
  const [newBannerImageUrl, setNewBannerImageUrl] = useState('');
  const [isCompressingBannerImage, setIsCompressingBannerImage] = useState(false);
  const [newBannerBadge, setNewBannerBadge] = useState('');
  const [newBannerTitle, setNewBannerTitle] = useState('');
  const [newBannerSubtitle, setNewBannerSubtitle] = useState('');
  const [newBannerTheme, setNewBannerTheme] = useState<CatalogPromoBanner['theme']>('navy');
  const [newBannerFilterCategory, setNewBannerFilterCategory] = useState('');
  const [newBannerCouponCode, setNewBannerCouponCode] = useState('');
  const [newBannerCtaLabel, setNewBannerCtaLabel] = useState('Ver oferta');
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  // Loyalty tiers draft inputs inside Settings
  const [newLoyaltyMinPoints, setNewLoyaltyMinPoints] = useState('');
  const [newLoyaltyDiscountPercent, setNewLoyaltyDiscountPercent] = useState('');

  // Statistics & Loyalty CRM states
  const [statsRange, setStatsRange] = useState<'today' | '7d' | '30d' | 'all'>('30d');
  const [loyaltySearchQuery, setLoyaltySearchQuery] = useState('');
  const [isRefreshingLoyalty, setIsRefreshingLoyalty] = useState(false);

  // Birthday greetings state inside Club Promos
  const [birthdayCouponCodeDraft, setBirthdayCouponCodeDraft] = useState('');
  const [birthdayCustomMessageDraft, setBirthdayCustomMessageDraft] = useState('');
  const [isSendingBirthdayBatch, setIsSendingBirthdayBatch] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryFileInputRef = useRef<HTMLInputElement | null>(null);

  const isServiceEnabledBySuperAdmin = tenant?.catalogEnabled !== false;
  const currency = settings.currencySymbol || config.currencySymbol || '$';

  const catalogHandle = useMemo(
    () =>
      buildPublicCatalogHandle({
        slug: settings.slug,
        tenantCode: config.tenantCode || tenant?.tenantCode,
        tenantId: config.tenantId || tenant?.id || 'default-tenant',
      }),
    [settings.slug, config.tenantCode, config.tenantId, tenant?.tenantCode, tenant?.id]
  );

  const publicUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/?catalog=${encodeURIComponent(catalogHandle)}`;
    return `${window.location.origin}/?catalog=${encodeURIComponent(catalogHandle)}`;
  }, [catalogHandle]);

  // Strictly isolate products loaded into this catalog's exclusive rubro
  const rubroProducts = useMemo(
    () => products.filter((p) => (p.rubro || activeCatalogRubro) === activeCatalogRubro),
    [products, activeCatalogRubro]
  );

  const activeRubroFilters = useMemo(() => {
    const custom = normalizeFilterList(settings.rubroFilters);
    return custom.length > 0 ? custom : rubroPreset.defaultFilters;
  }, [settings.rubroFilters, rubroPreset]);

  const savedCustomSubfilters = useMemo(
    () => normalizeFilterList(settings.customSubfilters),
    [settings.customSubfilters]
  );

  const isBasicWebPlan = Boolean(
    planFeatureAccess && planFeatureAccess.tier === 'web' && !planFeatureAccess.canAccessFullFeatures
  );

  const currentDistinctRubros = useMemo(
    () => normalizeFilterList([...activeRubroFilters, ...savedCustomSubfilters]),
    [activeRubroFilters, savedCustomSubfilters]
  );

  const requestPlanUpgrade = (
    reasonKey: 'limit_rubros' | 'limit_products' | 'full_feature',
    title?: string,
    detail?: string
  ) => {
    if (onRequestUpgradePlan) {
      onRequestUpgradePlan({ reasonKey, title, detail });
    } else {
      showToast(title || 'Esta capacidad requiere ampliar a Plan 3 · Full.');
    }
  };

  const activeSubfilters = useMemo(
    () =>
      normalizeFilterList([
        ...savedCustomSubfilters,
        ...rubroProducts.flatMap((p) => p.subfilters || []),
      ]),
    [savedCustomSubfilters, rubroProducts]
  );

  const availableCategories = useMemo(() => {
    const set = new Set<string>(['Todas', ...activeRubroFilters]);
    rubroProducts.forEach((p) => {
      if (p.category?.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [rubroProducts, activeRubroFilters]);

  useEffect(() => {
    if (selectedCategory !== 'Todas' && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory('Todas');
    }
  }, [availableCategories, selectedCategory]);

  useEffect(() => {
    if (selectedSubfilter !== 'Todos' && !activeSubfilters.includes(selectedSubfilter)) {
      setSelectedSubfilter('Todos');
    }
  }, [activeSubfilters, selectedSubfilter]);

  const defaultLowThreshold = Math.max(0, Math.floor(settings.defaultLowStockThreshold ?? 2));

  const lowStockProducts = useMemo(
    () =>
      rubroProducts.filter(
        (p) => p.available && getProductLowStockStatus(p, defaultLowThreshold).isLow
      ),
    [rubroProducts, defaultLowThreshold]
  );

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rubroProducts.filter((p) => {
      if (showLowStockOnly && !getProductLowStockStatus(p, defaultLowThreshold).isLow) {
        return false;
      }
      if (selectedCategory !== 'Todas' && p.category !== selectedCategory) return false;
      if (
        selectedSubfilter !== 'Todos' &&
        !(p.subfilters || []).some(
          (sf) => sf.trim().toLowerCase() === selectedSubfilter.trim().toLowerCase()
        )
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.subfilters || []).some((sf) => sf.toLowerCase().includes(q)) ||
        (p.variants || []).some(
          (v) => v.label.toLowerCase().includes(q) || (v.sku || '').toLowerCase().includes(q)
        )
      );
    });
  }, [rubroProducts, searchTerm, selectedCategory, selectedSubfilter, showLowStockOnly, defaultLowThreshold]);

  const productMap = useMemo(() => {
    const byId = new Map<string, CatalogProduct>();
    const byName = new Map<string, CatalogProduct>();
    products.forEach((p) => {
      if (p.id) byId.set(p.id, p);
      if (p.name) byName.set(p.name.trim().toLowerCase(), p);
    });
    return { byId, byName };
  }, [products]);

  const activeOrderForDetail = useMemo(() => {
    if (!selectedOrderForDetail) return null;
    return orders.find((o) => o.id === selectedOrderForDetail.id) || selectedOrderForDetail;
  }, [orders, selectedOrderForDetail]);

  const activeProductsCount = useMemo(
    () => rubroProducts.filter((p) => p.available).length,
    [rubroProducts]
  );

  const pendingPickupOrdersCount = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === 'pendiente_retiro' ||
          o.status === 'listo_para_retirar' ||
          o.status === 'en_camino'
      ).length,
    [orders]
  );

  const pendingStockAlertsCount = useMemo(
    () => stockAlerts.filter((a) => a.status === 'pending').length,
    [stockAlerts]
  );

  const pendingAlertsByProductId = useMemo(() => {
    const map = new Map<string, number>();
    stockAlerts.forEach((a) => {
      if (a.status === 'pending') {
        map.set(a.productId, (map.get(a.productId) || 0) + 1);
      }
    });
    return map;
  }, [stockAlerts]);

  const isStockAlertAvailableNow = (alert: CatalogStockAlertRequest): boolean => {
    const liveProduct =
      productMap.byId.get(alert.productId) ||
      productMap.byName.get(alert.productName.trim().toLowerCase());
    if (!liveProduct || !liveProduct.available) return false;
    if (alert.variantId || alert.variantLabel) {
      const matchedVar = findMatchingVariant(liveProduct, alert.variantId, alert.variantLabel);
      if (matchedVar) {
        const vStock = getVariantStock(matchedVar);
        return vStock === null || vStock > 0;
      }
    }
    return !isProductFullyOutOfStock(liveProduct);
  };

  const restockedPendingAlerts = useMemo(
    () =>
      stockAlerts.filter(
        (a) => a.status === 'pending' && isStockAlertAvailableNow(a)
      ),
    [stockAlerts, productMap]
  );

  const sortedStockAlerts = useMemo(
    () =>
      [...stockAlerts].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [stockAlerts]
  );

  const outOfStockProductsCount = useMemo(
    () =>
      rubroProducts.filter(
        (p) => p.available && isProductFullyOutOfStock(p)
      ).length,
    [rubroProducts]
  );

  const effectiveWhatsappPhone = (
    settings.whatsappPhone ||
    config.senderPhone ||
    config.distributorPhone ||
    ''
  ).trim();

  const handleCopyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopiedLink(true);
      showToast('Link del catálogo copiado al portapapeles.');
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      showToast('Copiá el enlace directamente desde la barra superior.');
    }
  };

  const handleShareCatalogWhatsApp = () => {
    const storeTitle = settings.storeName || config.distributorName || 'Nuestro Catálogo';
    const msg =
      `🛍️ *${storeTitle} — Catálogo Online*\n\n` +
      `Mirá nuestros productos actualizados con fotos y precios, armá tu pedido y coordiná para retirarlo por WhatsApp:\n\n` +
      `🔗 ${publicUrl}\n\n` +
      (settings.pickupAddress ? `📍 Retiro en: ${settings.pickupAddress}` : '');
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleTogglePublished = () => {
    const next = {
      ...settings,
      published: settings.published === false,
      updatedAt: new Date().toISOString(),
    };
    setDraftSettings((prev) => ({ ...prev, published: next.published }));
    onSaveSettings(next);
    showToast(
      next.published
        ? 'Catálogo online publicado y visible para clientes.'
        : 'Catálogo ocultado temporalmente del enlace público.'
    );
  };

  const handleSaveInlineWhatsapp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = inlineWhatsappDraft.trim();
    if (!cleaned) {
      showToast('Ingresá un número de WhatsApp válido (con código de área o país).');
      return;
    }
    const next: OnlineCatalogSettings = {
      ...draftSettings,
      ...settings,
      whatsappPhone: cleaned,
      updatedAt: new Date().toISOString(),
    };
    setDraftSettings((prev) => ({ ...prev, whatsappPhone: cleaned }));
    onSaveSettings(next);
    setIsEditingWhatsappInline(false);
    showToast(`WhatsApp del carrito web actualizado a ${cleaned} y publicado.`);
  };

  const handleAddCustomSubfilter = (rawValue: string) => {
    const clean = rawValue.trim();
    if (!clean) return;
    if (isBasicWebPlan) {
      const nextCombined = normalizeFilterList([...currentDistinctRubros, clean]);
      if (nextCombined.length > PLAN_WEB_MAX_RUBROS) {
        requestPlanUpgrade(
          'limit_rubros',
          `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
          `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros en la tienda básica (actualmente tenés ${currentDistinctRubros.length}). Para agregar "${clean}", ampliá a Plan 3 · Full.`
        );
        return;
      }
    }
    const nextSubfilters = normalizeFilterList([...savedCustomSubfilters, clean]);
    const nextSettings: OnlineCatalogSettings = {
      ...draftSettings,
      ...settings,
      catalogRubro: activeCatalogRubro,
      rubroFilters: activeRubroFilters,
      customSubfilters: nextSubfilters,
      updatedAt: new Date().toISOString(),
    };
    setDraftSettings((prev) => ({ ...prev, customSubfilters: nextSubfilters }));
    onSaveSettings(nextSettings);
    setNewSubfilterInput('');
    showToast(`Subfiltro "${clean}" agregado al catálogo.`);
  };

  const handleRemoveCustomSubfilter = (targetName: string) => {
    const targetLower = targetName.trim().toLowerCase();
    const nextSubfilters = savedCustomSubfilters.filter(
      (sf) => sf.toLowerCase() !== targetLower
    );
    const nextSettings: OnlineCatalogSettings = {
      ...draftSettings,
      ...settings,
      catalogRubro: activeCatalogRubro,
      rubroFilters: activeRubroFilters,
      customSubfilters: nextSubfilters,
      updatedAt: new Date().toISOString(),
    };
    setDraftSettings((prev) => ({ ...prev, customSubfilters: nextSubfilters }));
    onSaveSettings(nextSettings);
    if (selectedSubfilter.toLowerCase() === targetLower) {
      setSelectedSubfilter('Todos');
    }
    showToast(`Subfiltro "${targetName}" quitado de la lista.`);
  };

  const handleToggleProductSubfilter = (sf: string) => {
    const lower = sf.trim().toLowerCase();
    setProductSubfilters((prev) => {
      const exists = prev.some((x) => x.trim().toLowerCase() === lower);
      if (exists) return prev.filter((x) => x.trim().toLowerCase() !== lower);
      return normalizeFilterList([...prev, sf]);
    });
  };

  const handleAddModalSubfilter = () => {
    const clean = modalNewSubfilter.trim();
    if (!clean) return;
    if (isBasicWebPlan) {
      const nextCombined = normalizeFilterList([...currentDistinctRubros, clean]);
      if (nextCombined.length > PLAN_WEB_MAX_RUBROS) {
        requestPlanUpgrade(
          'limit_rubros',
          `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
          `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros. Para agregar "${clean}", pasá a Plan 3 · Full.`
        );
        return;
      }
    }
    setProductSubfilters((prev) => normalizeFilterList([...prev, clean]));
    if (!savedCustomSubfilters.some((sf) => sf.toLowerCase() === clean.toLowerCase())) {
      const nextSubfilters = normalizeFilterList([...savedCustomSubfilters, clean]);
      const nextSettings: OnlineCatalogSettings = {
        ...draftSettings,
        ...settings,
        catalogRubro: activeCatalogRubro,
        rubroFilters: activeRubroFilters,
        customSubfilters: nextSubfilters,
        updatedAt: new Date().toISOString(),
      };
      setDraftSettings((prev) => ({ ...prev, customSubfilters: nextSubfilters }));
      onSaveSettings(nextSettings);
    }
    setModalNewSubfilter('');
  };

  const openNewProductModal = () => {
    if (isBasicWebPlan && rubroProducts.length >= PLAN_WEB_MAX_PRODUCTS) {
      requestPlanUpgrade(
        'limit_products',
        `Límite de ${PLAN_WEB_MAX_PRODUCTS} prendas / objetos alcanzado`,
        `Ya cargaste ${rubroProducts.length} de ${PLAN_WEB_MAX_PRODUCTS} prendas u objetos permitidos en Plan 2 · Página Web Básica. Ampliá a Plan 3 · Full para cargar productos ilimitados.`
      );
      return;
    }
    setEditingProduct(null);
    setProductName('');
    setProductSku('');
    setProductPrice('');
    setProductStockQuantity('');
    setProductCategory(
      selectedCategory !== 'Todas'
        ? selectedCategory
        : activeRubroFilters[0] || rubroPreset.defaultFilters[0] || 'General'
    );
    setProductSubfilters(selectedSubfilter !== 'Todos' ? [selectedSubfilter] : []);
    setModalNewSubfilter('');
    setProductVariants([]);
    setProductUnitLabel(rubroPreset.defaultUnitLabel || 'Unidad');
    setProductDescription('');
    setProductImageUrl('');
    setProductAdditionalImages([]);
    setAdditionalImageUrlInput('');
    setProductWholesaleMinQty('');
    setProductWholesalePrice('');
    setProductFlashSalePrice('');
    setProductFlashSaleEndsAt('');
    setProductIsOutlet(false);
    setProductLowStockThreshold('');
    setProductLoyaltyPoints('');
    setProductAvailable(true);
    setProductFeatured(false);
    setProductFormErrors({});
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product: CatalogProduct) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductSku(product.sku || '');
    setProductPrice(String(product.price));
    setProductStockQuantity(
      typeof product.stockQuantity === 'number' ? String(product.stockQuantity) : ''
    );
    setProductVariants(
      (product.variants || []).map((v) => ({
        id: v.id,
        label: v.label,
        stockQuantity: typeof v.stockQuantity === 'number' ? String(v.stockQuantity) : '',
        sku: v.sku || '',
        price: typeof v.price === 'number' ? String(v.price) : '',
      }))
    );
    setProductCategory(product.category || activeRubroFilters[0] || 'General');
    setProductSubfilters(normalizeFilterList(product.subfilters));
    setModalNewSubfilter('');
    setProductUnitLabel(product.unitLabel || rubroPreset.defaultUnitLabel || 'Unidad');
    setProductDescription(product.description || '');
    setProductImageUrl(product.imageUrl || '');
    setProductAdditionalImages((product.additionalImageUrls || []).slice(0, 3));
    setAdditionalImageUrlInput('');
    setProductWholesaleMinQty(
      typeof product.wholesaleMinQty === 'number' && product.wholesaleMinQty > 1
        ? String(product.wholesaleMinQty)
        : ''
    );
    setProductWholesalePrice(
      typeof product.wholesalePrice === 'number' && product.wholesalePrice >= 0
        ? String(product.wholesalePrice)
        : ''
    );
    setProductFlashSalePrice(
      typeof product.flashSalePrice === 'number' && product.flashSalePrice >= 0
        ? String(product.flashSalePrice)
        : ''
    );
    setProductFlashSaleEndsAt(toDatetimeLocalInput(product.flashSaleEndsAt));
    setProductIsOutlet(Boolean(product.isOutlet));
    setProductLowStockThreshold(
      typeof product.lowStockThreshold === 'number' ? String(product.lowStockThreshold) : ''
    );
    setProductLoyaltyPoints(
      typeof product.loyaltyPoints === 'number' && product.loyaltyPoints >= 0
        ? String(product.loyaltyPoints)
        : ''
    );
    setProductAvailable(product.available);
    setProductFeatured(Boolean(product.featured));
    setProductFormErrors({});
    setIsProductModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressingImage(true);
    try {
      const dataUrl = await compressProductImageFile(file);
      setProductImageUrl(dataUrl);
      showToast('Imagen optimizada y cargada.');
    } catch {
      showToast('No se pudo procesar la imagen seleccionada.');
    } finally {
      setIsCompressingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressingBannerImage(true);
    try {
      const dataUrl = await compressBannerImageFile(file);
      setNewBannerImageUrl(dataUrl);
      showToast('Imagen de banner optimizada y cargada.');
    } catch {
      showToast('No se pudo procesar la imagen del banner.');
    } finally {
      setIsCompressingBannerImage(false);
      if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    }
  };

  const handleAdditionalGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remainingSlots = Math.max(0, 3 - productAdditionalImages.length);
    if (remainingSlots <= 0) {
      showToast('Ya cargaste el máximo de 3 fotos adicionales por producto (4 en total).');
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
      return;
    }
    setIsCompressingImage(true);
    try {
      const uploaded: string[] = [];
      for (const file of files.slice(0, remainingSlots)) {
        const dataUrl = await compressProductImageFile(file);
        uploaded.push(dataUrl);
      }
      setProductAdditionalImages((prev) => [...prev, ...uploaded].slice(0, 3));
      showToast(`${uploaded.length} foto(s) agregadas a la galería del producto.`);
    } catch {
      showToast('No se pudieron procesar las fotos seleccionadas.');
    } finally {
      setIsCompressingImage(false);
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
    }
  };

  const visibleOrders = useMemo(() => {
    const filter = ORDER_STATUS_FILTERS.find((f) => f.id === orderStatusFilter);
    const q = orderSearch.trim().toLowerCase();
    return orders
      .filter((o) => (filter?.match ? filter.match(o) : true))
      .filter(
        (o) =>
          !q ||
          (o.customerName || '').toLowerCase().includes(q) ||
          (o.customerPhone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§') ||
          (o.orderNumber || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [orders, orderStatusFilter, orderSearch]);

  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBasicWebPlan && !editingProduct && rubroProducts.length >= PLAN_WEB_MAX_PRODUCTS) {
      setIsProductModalOpen(false);
      requestPlanUpgrade(
        'limit_products',
        `Límite de ${PLAN_WEB_MAX_PRODUCTS} prendas / objetos alcanzado`,
        `Ya cargaste ${rubroProducts.length} de ${PLAN_WEB_MAX_PRODUCTS} prendas u objetos permitidos en Plan 2. Ampliá a Plan 3 · Full para seguir agregando artículos.`
      );
      return;
    }
    const cleanName = productName.trim().replace(/\s+/g, ' ');
    const numericPrice = Number(String(productPrice).replace(',', '.'));
    const formErrors: { name?: string; price?: string; stock?: string } = {};
    if (cleanName.length < 2) formErrors.name = 'Ingresá el nombre del producto (mínimo 2 caracteres).';
    else if (cleanName.length > 80) formErrors.name = 'El nombre es muy largo (máximo 80 caracteres).';
    if (String(productPrice).trim() === '' || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      formErrors.price = 'Ingresá un precio mayor a 0.';
    } else if (numericPrice > 100000000) {
      formErrors.price = 'El precio parece demasiado alto. Revisalo.';
    }
    if (productVariants.length === 0 && productStockQuantity.trim() !== '') {
      const st = Number(productStockQuantity.trim().replace(',', '.'));
      if (!Number.isFinite(st) || st < 0 || !Number.isInteger(st)) {
        formErrors.stock = 'El stock tiene que ser un número entero (0 o más). Dejalo vacío para stock libre.';
      }
    }
    setProductFormErrors(formErrors);
    if (formErrors.name || formErrors.price || formErrors.stock) {
      showToast(formErrors.name || formErrors.price || formErrors.stock || 'Revisá los datos del producto.');
      return;
    }

    const parsedVariants: CatalogProductVariant[] = [];
    for (const draftVar of productVariants) {
      const lbl = draftVar.label.trim();
      if (!lbl) continue;
      let vStock: number | undefined = undefined;
      if (draftVar.stockQuantity.trim() !== '') {
        const num = Number(draftVar.stockQuantity.trim());
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
          showToast(`Stock inválido en variante "${lbl}". Usá un número entero (0 o más), o dejalo vacío.`);
          return;
        }
        vStock = Math.floor(num);
      }
      let vPrice: number | undefined = undefined;
      if (draftVar.price.trim() !== '') {
        const numP = Number(draftVar.price.trim().replace(',', '.'));
        if (!Number.isFinite(numP) || numP < 0) {
          showToast(`Precio inválido en variante "${lbl}".`);
          return;
        }
        vPrice = numP;
      }
      parsedVariants.push({
        id: draftVar.id || `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: lbl,
        sku: draftVar.sku.trim() || undefined,
        stockQuantity: vStock,
        price: vPrice,
      });
    }

    let parsedStock: number | undefined = undefined;
    if (parsedVariants.length > 0) {
      parsedStock = computeAggregateStockFromVariants(parsedVariants);
    } else {
      const trimmedStock = productStockQuantity.trim();
      if (trimmedStock !== '') {
        const numericStock = Number(trimmedStock);
        if (!Number.isFinite(numericStock) || numericStock < 0) {
          showToast('Ingresá una cantidad de stock válida (0 o mayor), o dejalo vacío para stock libre.');
          return;
        }
        parsedStock = Math.floor(numericStock);
      }
    }

    const cleanSubfilters = normalizeFilterList(productSubfilters);
    const cleanCategory = productCategory.trim() || activeRubroFilters[0] || 'General';
    if (isBasicWebPlan) {
      const projectedRubros = normalizeFilterList([
        ...currentDistinctRubros,
        cleanCategory,
        ...cleanSubfilters,
      ]);
      if (projectedRubros.length > PLAN_WEB_MAX_RUBROS) {
        requestPlanUpgrade(
          'limit_rubros',
          `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
          `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/categorías. Para crear una nueva categoría o subfiltro fuera de tus ${PLAN_WEB_MAX_RUBROS} activos, ampliá a Plan 3 · Full.`
        );
        return;
      }
    }
    const now = new Date().toISOString();
    const cleanSku = productSku.trim() || undefined;
    const cleanAdditionalImages = productAdditionalImages
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 3);

    const parsedWholesaleMinQty =
      !isBasicWebPlan && productWholesaleMinQty.trim() !== '' && Number(productWholesaleMinQty) > 1
        ? Math.floor(Number(productWholesaleMinQty))
        : undefined;
    const parsedWholesalePrice =
      !isBasicWebPlan &&
      parsedWholesaleMinQty &&
      productWholesalePrice.trim() !== '' &&
      Number.isFinite(Number(productWholesalePrice.replace(',', '.'))) &&
      Number(productWholesalePrice.replace(',', '.')) > 0
        ? Number(productWholesalePrice.replace(',', '.'))
        : undefined;
    const parsedLowStockThreshold =
      productLowStockThreshold.trim() !== '' &&
      Number.isFinite(Number(productLowStockThreshold)) &&
      Number(productLowStockThreshold) >= 0
        ? Math.floor(Number(productLowStockThreshold))
        : undefined;
    const parsedProductLoyaltyPoints =
      !isBasicWebPlan &&
      productLoyaltyPoints.trim() !== '' &&
      Number.isFinite(Number(productLoyaltyPoints)) &&
      Number(productLoyaltyPoints) >= 0
        ? Math.floor(Number(productLoyaltyPoints))
        : undefined;
    const rawFlashPrice = productFlashSalePrice.trim().replace(',', '.');
    const parsedFlashSalePrice =
      !isBasicWebPlan &&
      rawFlashPrice !== '' &&
      Number.isFinite(Number(rawFlashPrice)) &&
      Number(rawFlashPrice) >= 0 &&
      Number(rawFlashPrice) < numericPrice
        ? Number(rawFlashPrice)
        : undefined;
    const parsedFlashSaleEndsAt =
      !isBasicWebPlan && parsedFlashSalePrice !== undefined && productFlashSaleEndsAt.trim()
        ? new Date(productFlashSaleEndsAt.trim()).toISOString()
        : undefined;

    if (editingProduct) {
      const wasOutOfStock = isProductFullyOutOfStock(editingProduct);
      const nextProdPreview = {
        stockQuantity: parsedStock,
        variants: parsedVariants.length > 0 ? parsedVariants : undefined,
      };
      const isNowInStock = !isProductFullyOutOfStock(nextProdPreview);
      const waitingCount = pendingAlertsByProductId.get(editingProduct.id) || 0;

      const updated = products.map((p) =>
        p.id === editingProduct.id
          ? {
              ...p,
              name: cleanName,
              sku: cleanSku,
              price: numericPrice,
              flashSalePrice: parsedFlashSalePrice,
              flashSaleEndsAt: parsedFlashSaleEndsAt,
              isOutlet: isBasicWebPlan ? false : productIsOutlet,
              wholesaleMinQty: parsedWholesalePrice ? parsedWholesaleMinQty : undefined,
              wholesalePrice: parsedWholesalePrice,
              lowStockThreshold: parsedLowStockThreshold,
              loyaltyPoints: parsedProductLoyaltyPoints,
              stockQuantity: parsedStock,
              variants: parsedVariants.length > 0 ? parsedVariants : undefined,
              rubro: activeCatalogRubro,
              category: cleanCategory,
              subfilters: cleanSubfilters,
              unitLabel: productUnitLabel.trim() || rubroPreset.defaultUnitLabel || 'Unidad',
              description: productDescription.trim(),
              imageUrl: productImageUrl.trim() || undefined,
              additionalImageUrls: cleanAdditionalImages.length > 0 ? cleanAdditionalImages : undefined,
              available: productAvailable,
              featured: isBasicWebPlan ? false : productFeatured,
              updatedAt: now,
            }
          : p
      );
      onSaveProducts(updated);
      if ((wasOutOfStock && isNowInStock && waitingCount > 0) || (parsedVariants.length > 0 && waitingCount > 0)) {
        showToast(
          `Stock actualizado en "${cleanName}". Tenés ${waitingCount} cliente(s) en espera para avisar por WhatsApp.`
        );
      } else {
        showToast(`Producto "${cleanName}" actualizado en el rubro ${rubroPreset.shortLabel}.`);
      }
    } else {
      const created: CatalogProduct = {
        id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        sku: cleanSku,
        price: numericPrice,
        flashSalePrice: parsedFlashSalePrice,
        flashSaleEndsAt: parsedFlashSaleEndsAt,
        isOutlet: isBasicWebPlan ? false : productIsOutlet,
        wholesaleMinQty: parsedWholesalePrice ? parsedWholesaleMinQty : undefined,
        wholesalePrice: parsedWholesalePrice,
        lowStockThreshold: parsedLowStockThreshold,
        loyaltyPoints: parsedProductLoyaltyPoints,
        stockQuantity: parsedStock,
        variants: parsedVariants.length > 0 ? parsedVariants : undefined,
        rubro: activeCatalogRubro,
        category: cleanCategory,
        subfilters: cleanSubfilters,
        unitLabel: productUnitLabel.trim() || rubroPreset.defaultUnitLabel || 'Unidad',
        description: productDescription.trim(),
        imageUrl: productImageUrl.trim() || undefined,
        additionalImageUrls: cleanAdditionalImages.length > 0 ? cleanAdditionalImages : undefined,
        available: productAvailable,
        featured: isBasicWebPlan ? false : productFeatured,
        createdAt: now,
        updatedAt: now,
      };
      onSaveProducts([created, ...products]);
      showToast(`Producto "${cleanName}" cargado exclusivamente en ${rubroPreset.shortLabel}.`);
    }
    setIsProductModalOpen(false);
  };

  const handleQuickUpdateStock = (
    product: CatalogProduct,
    nextStock: number | undefined
  ) => {
    const now = new Date().toISOString();
    const wasOutOfStock =
      typeof product.stockQuantity === 'number' && product.stockQuantity <= 0;
    const isNowInStock = nextStock === undefined || nextStock > 0;
    const waitingCount = pendingAlertsByProductId.get(product.id) || 0;

    const updated = products.map((p) =>
      p.id === product.id ? { ...p, stockQuantity: nextStock, updatedAt: now } : p
    );
    onSaveProducts(updated);
    if (wasOutOfStock && isNowInStock && waitingCount > 0) {
      showToast(
        `Stock repuesto en "${product.name}". Tenés ${waitingCount} aviso(s) pendientes para enviar por WhatsApp.`
      );
    } else if (nextStock === 0) {
      showToast(`"${product.name}" marcado Sin stock (0 u.) en el catálogo.`);
    }
  };

  const handleQuickUpdateVariantStock = (
    product: CatalogProduct,
    variantId: string,
    nextStock: number | undefined
  ) => {
    if (!product.variants || product.variants.length === 0) return;
    const now = new Date().toISOString();
    const prevVar = product.variants.find((v) => v.id === variantId);
    const wasVarOut = prevVar && typeof prevVar.stockQuantity === 'number' && prevVar.stockQuantity <= 0;
    const isVarIn = nextStock === undefined || nextStock > 0;

    const nextVariants = product.variants.map((v) =>
      v.id === variantId ? { ...v, stockQuantity: nextStock } : v
    );
    const aggStock = computeAggregateStockFromVariants(nextVariants);

    const updated = products.map((p) =>
      p.id === product.id
        ? { ...p, variants: nextVariants, stockQuantity: aggStock, updatedAt: now }
        : p
    );
    onSaveProducts(updated);

    const waitingCount = pendingAlertsByProductId.get(product.id) || 0;
    if (wasVarOut && isVarIn && waitingCount > 0) {
      showToast(
        `Stock repuesto en "${product.name} (${prevVar?.label || ''})". Hay clientes en espera para avisar.`
      );
    }
  };

  const handleNotifyStockAlertWhatsApp = async (
    alert: CatalogStockAlertRequest,
    silentOpenFallback: boolean = false
  ) => {
    const storeTitle = settings.storeName || config.distributorName || 'Nuestra Tienda';
    const message = generateStockAlertRestockWhatsAppMessage({
      customerName: alert.customerName,
      productName: alert.productName,
      variantLabel: alert.variantLabel,
      productSku: alert.productSku,
      storeName: storeTitle,
      publicUrl,
    });

    const serverRes = await notifyCatalogStockAlertViaServer({ alert, message });
    if (!serverRes.success && !silentOpenFallback) {
      window.open(createWhatsAppUrl(alert.customerPhone, message), '_blank', 'noopener,noreferrer');
    } else if (!serverRes.success && silentOpenFallback) {
      window.open(createWhatsAppUrl(alert.customerPhone, message), '_blank', 'noopener,noreferrer');
    }

    if (onSaveStockAlerts) {
      const now = new Date().toISOString();
      onSaveStockAlerts(
        stockAlerts.map((a) =>
          a.id === alert.id
            ? { ...a, status: 'notified', notifiedAt: now, updatedAt: now }
            : a
        )
      );
    }
    if (!silentOpenFallback) {
      showToast(
        serverRes.success
          ? `Aviso automático enviado por WhatsApp a ${alert.customerName}.`
          : `Aviso listo en WhatsApp para ${alert.customerName}.`
      );
    }
  };

  const handleNotifyAllRestockedAlerts = async () => {
    if (restockedPendingAlerts.length === 0) return;
    setIsBatchNotifyingAlerts(true);
    try {
      const storeTitle = settings.storeName || config.distributorName || 'Nuestra Tienda';
      const now = new Date().toISOString();
      let apiSentCount = 0;
      const notifiedIds = new Set<string>();

      for (const alert of restockedPendingAlerts) {
        const message = generateStockAlertRestockWhatsAppMessage({
          customerName: alert.customerName,
          productName: alert.productName,
          variantLabel: alert.variantLabel,
          productSku: alert.productSku,
          storeName: storeTitle,
          publicUrl,
        });
        const serverRes = await notifyCatalogStockAlertViaServer({ alert, message });
        if (serverRes.success) {
          apiSentCount += 1;
        } else {
          window.open(createWhatsAppUrl(alert.customerPhone, message), '_blank', 'noopener,noreferrer');
        }
        notifiedIds.add(alert.id);
      }

      if (onSaveStockAlerts) {
        onSaveStockAlerts(
          stockAlerts.map((a) =>
            notifiedIds.has(a.id)
              ? { ...a, status: 'notified', notifiedAt: now, updatedAt: now }
              : a
          )
        );
      }
      showToast(
        apiSentCount === restockedPendingAlerts.length
          ? `Se enviaron ${apiSentCount} avisos automáticos de reposición por WhatsApp.`
          : `Se procesaron ${restockedPendingAlerts.length} avisos de reposición (${apiSentCount} vía API, el resto por WhatsApp Web).`
      );
    } finally {
      setIsBatchNotifyingAlerts(false);
    }
  };

  const handleToggleStockAlertStatus = (alert: CatalogStockAlertRequest) => {
    if (!onSaveStockAlerts) return;
    const now = new Date().toISOString();
    const nextStatus = alert.status === 'pending' ? 'notified' : 'pending';
    onSaveStockAlerts(
      stockAlerts.map((a) =>
        a.id === alert.id
          ? {
              ...a,
              status: nextStatus,
              notifiedAt: nextStatus === 'notified' ? now : undefined,
              updatedAt: now,
            }
          : a
      )
    );
  };

  const handleDeleteStockAlert = (alertId: string) => {
    if (!onSaveStockAlerts) return;
    onSaveStockAlerts(stockAlerts.filter((a) => a.id !== alertId));
    showToast('Solicitud de aviso eliminada.');
  };

  const handleToggleProductAvailability = (productId: string) => {
    const now = new Date().toISOString();
    const updated = products.map((p) =>
      p.id === productId ? { ...p, available: !p.available, updatedAt: now } : p
    );
    onSaveProducts(updated);
  };

  const handleDeleteProduct = (product: CatalogProduct) => {
    const updated = products.filter((p) => p.id !== product.id);
    onSaveProducts(updated);
    showToast(`Producto "${product.name}" eliminado del catálogo.`);
  };

  const handleSaveSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draftSettings.allowPickup === false && draftSettings.allowDelivery === false) {
      showToast('Activá al menos una modalidad: Retiro en tienda o Envío a domicilio.');
      return;
    }
    const enabledPayments = resolveEnabledPaymentOptions(draftSettings.paymentMethods, {
      mercadoPagoAvailable: merchantMpAvailable,
    });
    if (enabledPayments.length === 0) {
      showToast('Activá al menos un medio de pago para la tienda.');
      return;
    }
    if (
      draftSettings.paymentMethods &&
      isPaymentOptionEnabled(draftSettings.paymentMethods, 'transferencia') &&
      !draftMerchantPayment.merchantPaymentAlias.trim() &&
      !draftMerchantPayment.merchantPaymentCvu.trim()
    ) {
      showToast('Para ofrecer Transferencia cargá tu alias o CVU (más abajo, en Cobros).');
      return;
    }
    const cleanRubroFilters = normalizeFilterList(draftSettings.rubroFilters);
    const resolvedRubroFilters =
      cleanRubroFilters.length > 0 ? cleanRubroFilters : rubroPreset.defaultFilters;
    const cleanCustomSubfilters = normalizeFilterList(draftSettings.customSubfilters);
    if (isBasicWebPlan) {
      const combined = normalizeFilterList([...resolvedRubroFilters, ...cleanCustomSubfilters]);
      if (combined.length > PLAN_WEB_MAX_RUBROS) {
        requestPlanUpgrade(
          'limit_rubros',
          `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
          `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros en total. Quitá alguno antes de guardar o pasá a Plan 3 · Full.`
        );
        return;
      }
    }
    const next: OnlineCatalogSettings = {
      ...draftSettings,
      catalogRubro: activeCatalogRubro,
      rubroFilters: resolvedRubroFilters,
      customSubfilters: cleanCustomSubfilters,
      allowPickup: draftSettings.allowPickup !== false,
      allowDelivery: draftSettings.allowDelivery !== false,
      storeName: draftSettings.storeName?.trim() || config.distributorName || 'Mi Catálogo',
      slug: (draftSettings.slug || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, ''),
      whatsappPhone:
        draftSettings.whatsappPhone?.trim() ||
        config.senderPhone ||
        config.distributorPhone ||
        '',
      cashOrTransferDiscountPercent: isBasicWebPlan ? 0 : draftSettings.cashOrTransferDiscountPercent,
      enablePromoClub: isBasicWebPlan ? false : draftSettings.enablePromoClub,
      enableLoyaltyProgram: isBasicWebPlan ? false : Boolean(draftSettings.enableLoyaltyProgram),
      loyaltyPointsPerUnit: Math.max(
        0,
        Math.floor(Number(draftSettings.loyaltyPointsPerUnit) || 0)
      ),
      loyaltyTiers: normalizeLoyaltyTiers(draftSettings.loyaltyTiers),
      loyaltyRestrictRedeemMethods: draftSettings.loyaltyRestrictRedeemMethods !== false,
      updatedAt: new Date().toISOString(),
    };
    setDraftSettings(next);
    if (onSaveMerchantPaymentConfig) {
      onSaveMerchantPaymentConfig({
        merchantPaymentAlias: draftMerchantPayment.merchantPaymentAlias.trim(),
        merchantPaymentCvu: draftMerchantPayment.merchantPaymentCvu.trim(),
        merchantPaymentBank: draftMerchantPayment.merchantPaymentBank.trim(),
        merchantPaymentHolder: draftMerchantPayment.merchantPaymentHolder.trim(),
        merchantMpCheckoutLink: draftMerchantPayment.merchantMpCheckoutLink.trim(),
        ...(draftMerchantPayment.merchantMpAccessToken.trim()
          ? { merchantMpAccessToken: draftMerchantPayment.merchantMpAccessToken.trim() }
          : {}),
      });
      if (draftMerchantPayment.merchantMpAccessToken.trim()) {
        setDraftMerchantPayment((prev) => ({ ...prev, merchantMpAccessToken: '' }));
      }
    }
    onSaveSettings(next);
    showToast('Configuración, cobros, programa de puntos y enlace del catálogo guardados.');
  };

  const resolveOrderPaymentLabel = (
    method: CatalogPickupOrder['confirmedPaymentMethod'] | CatalogPickupOrder['preferredPaymentMethod'],
    isDelivery: boolean
  ): string => {
    switch (method) {
      case 'transferencia':
        return 'Transferencia bancaria / Alias';
      case 'mercadopago_dinero_cuenta':
        return 'Mercado Pago (Dinero en cuenta)';
      case 'link_pago':
        return 'Link de Pago / Mercado Pago';
      case 'efectivo':
        return isDelivery ? 'Efectivo contra entrega' : 'Efectivo en el comercio';
      case 'fiado':
        return 'Cuenta Corriente / Fiado';
      default:
        return 'A coordinar por WhatsApp';
    }
  };

  const buildDispatchReceiptData = (
    order: CatalogPickupOrder,
    receiptNumOverride?: string
  ): ReceiptModalData => {
    const isDelivery = order.deliveryMethod === 'envio';
    const paymentKey = order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
    const paymentMethodLabel = resolveOrderPaymentLabel(paymentKey, isDelivery);
    const receiptNumber =
      receiptNumOverride ||
      order.dispatchReceiptNumber ||
      `DESP-${order.orderNumber.replace(/^PED-/, '')}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const lineItems: SaleLineItem[] = order.items.map((it, idx) => {
      const variantSuffix = it.variantLabel ? ` · ${it.variantLabel}` : '';
      const unitSuffix = it.unitLabel ? ` (${it.unitLabel})` : '';
      return {
        id: `desp-it-${order.id}-${idx}`,
        name: `${it.productName}${variantSuffix}${unitSuffix}`,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal,
        paymentMode: paymentKey === 'fiado' ? 'un_pago_fiado' : 'contado_hoy',
      };
    });

    const isPaidOnDispatch = order.status === 'retirado' && paymentKey !== 'fiado';

    const addressForReceipt = isDelivery
      ? order.deliveryAddress || 'Dirección de envío a confirmar'
      : settings.pickupAddress || tenant?.address || 'Retiro en el comercio';

    return {
      receiptNumber,
      boletaNumber: order.linkedBoletaNumber || order.orderNumber,
      clientName: order.customerName,
      clientAddress: addressForReceipt,
      paymentDate: (order.dispatchedAt || new Date().toISOString()).split('T')[0] || todayStr,
      amountPaidNow: isPaidOnDispatch ? order.totalAmount : 0,
      paymentMethod:
        paymentKey === 'transferencia'
          ? 'transferencia'
          : paymentKey === 'efectivo'
          ? 'efectivo'
          : paymentKey,
      paymentMethodLabel,
      originalAmount: order.totalAmount,
      totalPaidAccumulated: isPaidOnDispatch ? order.totalAmount : 0,
      remainingBalance: isPaidOnDispatch ? 0 : order.totalAmount,
      receivedBy: activeUserName || config.distributorName || 'Despacho',
      notes: order.customerSpecificRequest || order.notes,
      isFullSettlement: isPaidOnDispatch,
      isDispatchReceipt: true,
      dispatchModalityLabel: isDelivery ? 'Envío a domicilio' : 'Retiro en el comercio',
      deliveryAddress: addressForReceipt,
      hideUnitModeTag: true,
      items: lineItems,
      initialPhone: order.customerPhone,
      saleModeLabel: isDelivery
        ? 'COMPROBANTE DE DESPACHO · ENVÍO A DOMICILIO'
        : 'COMPROBANTE DE DESPACHO · RETIRO EN COMERCIO',
    };
  };

  const handleUpdateOrderPaymentMethod = (
    orderId: string,
    method: NonNullable<CatalogPickupOrder['confirmedPaymentMethod']>
  ) => {
    const now = new Date().toISOString();
    const updated = orders.map((o) =>
      o.id === orderId ? { ...o, confirmedPaymentMethod: method, updatedAt: now } : o
    );
    onSaveOrders(updated);
    showToast('Forma de pago del pedido actualizada.');
  };

  const handleDispatchAndOpenReceipt = (
    order: CatalogPickupOrder,
    targetStatus?: CatalogPickupOrder['status']
  ) => {
    const now = new Date().toISOString();
    const isDelivery = order.deliveryMethod === 'envio';
    const nextStatus: CatalogPickupOrder['status'] =
      targetStatus ||
      (order.status === 'pendiente_retiro'
        ? isDelivery
          ? 'en_camino'
          : 'listo_para_retirar'
        : order.status);
    const receiptNumber =
      order.dispatchReceiptNumber || `DESP-${order.orderNumber.replace(/^PED-/, '')}`;

    const enrichedOrder: CatalogPickupOrder = {
      ...order,
      status: nextStatus,
      dispatchReceiptNumber: receiptNumber,
      dispatchedAt: order.dispatchedAt || now,
      confirmedPaymentMethod:
        order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar',
      updatedAt: now,
    };

    const updated = orders.map((o) => (o.id === order.id ? enrichedOrder : o));
    onSaveOrders(updated);

    const receiptData = buildDispatchReceiptData(enrichedOrder, receiptNumber);
    if (onOpenReceipt) {
      onOpenReceipt(receiptData);
      showToast(
        `Comprobante ${receiptNumber} generado para enviar al WhatsApp de ${order.customerName}.`
      );
    } else {
      const msg = generatePaymentReceiptWhatsAppMessage(receiptData, config);
      window.open(createWhatsAppUrl(order.customerPhone, msg), '_blank', 'noopener,noreferrer');
    }
  };

  const handleMarkOrderPaidPickedUp = (order: CatalogPickupOrder) => {
    const now = new Date().toISOString();
    const receiptNumber =
      order.dispatchReceiptNumber || `DESP-${order.orderNumber.replace(/^PED-/, '')}`;
    const resolvedPayment: NonNullable<CatalogPickupOrder['confirmedPaymentMethod']> =
      order.confirmedPaymentMethod ||
      (order.preferredPaymentMethod && order.preferredPaymentMethod !== 'acordar'
        ? order.preferredPaymentMethod
        : 'efectivo');

    const enrichedOrder: CatalogPickupOrder = {
      ...order,
      status: 'retirado',
      dispatchReceiptNumber: receiptNumber,
      dispatchedAt: order.dispatchedAt || now,
      confirmedPaymentMethod: resolvedPayment,
      updatedAt: now,
    };

    onSaveOrders(orders.map((o) => (o.id === order.id ? enrichedOrder : o)));
    showToast(
      `Pedido #${order.orderNumber} marcado como Retirado y Pagado. Ya suma al dinero generado en la web.`
    );
  };

  const handleUpdateOrderStatus = (
    orderId: string,
    status: CatalogPickupOrder['status']
  ) => {
    const target = orders.find((o) => o.id === orderId);
    const now = new Date().toISOString();

    // Si pasa a CANCELADO y tenía stock descontado, reintegrar automáticamente las unidades al catálogo
    if (target && status === 'cancelado' && target.status !== 'cancelado') {
      let stockRestoredNow = false;
      let restoredAlertsWaiting = 0;

      if (target.stockDeducted) {
        const { updatedProducts, changed, restoredProductIds } = applyOrderStockDeltaToProducts(
          products,
          target.items,
          'restore'
        );
        if (changed) {
          onSaveProducts(updatedProducts);
          stockRestoredNow = true;
          restoredAlertsWaiting = restoredProductIds.reduce(
            (sum, pid) => sum + (pendingAlertsByProductId.get(pid) || 0),
            0
          );
        }
      }

      // Revertir puntos del Programa de Puntos por DNI si el pedido había sumado o canjeado
      let loyaltyReversed = false;
      if (target.loyaltyPointsSettled && target.customerDni && onSaveLoyaltyAccounts) {
        const cleanDni = normalizeDni(target.customerDni);
        const targetAcc = loyaltyAccounts.find((a) => normalizeDni(a.dni) === cleanDni);
        if (targetAcc) {
          const earned = Math.max(0, Math.floor(Number(target.loyaltyPointsEarned) || 0));
          const redeemed = Math.max(0, Math.floor(Number(target.loyaltyPointsRedeemed) || 0));
          const revertedBalance = Math.max(0, targetAcc.pointsBalance - earned + redeemed);
          const delta = revertedBalance - targetAcc.pointsBalance;
          const updatedAcc: CatalogLoyaltyAccount = {
            ...targetAcc,
            pointsBalance: revertedBalance,
            totalPointsEarned: Math.max(0, targetAcc.totalPointsEarned - earned),
            totalPointsRedeemed: Math.max(0, targetAcc.totalPointsRedeemed - redeemed),
            ordersCount: Math.max(0, targetAcc.ordersCount - 1),
            history: [
              {
                id: `lmov-rev-${Date.now()}`,
                date: now,
                type: 'reversed' as const,
                pointsDelta: delta,
                orderId: target.id,
                orderNumber: target.orderNumber,
                note: `Pedido #${target.orderNumber} cancelado (reversión automática)`,
              },
              ...(targetAcc.history || []),
            ].slice(0, 40),
            updatedAt: now,
          };
          onSaveLoyaltyAccounts(
            loyaltyAccounts.map((a) => (a.id === targetAcc.id ? updatedAcc : a))
          );
          loyaltyReversed = true;
        }
      }

      const updatedOrders = orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'cancelado' as const,
              stockDeducted: false,
              stockRestoredAt: stockRestoredNow ? now : o.stockRestoredAt,
              loyaltyPointsSettled: loyaltyReversed ? false : o.loyaltyPointsSettled,
              updatedAt: now,
            }
          : o
      );
      onSaveOrders(updatedOrders);
      showToast(
        stockRestoredNow
          ? restoredAlertsWaiting > 0
            ? `Pedido #${target.orderNumber} cancelado y stock reintegrado automáticamente. Hay ${restoredAlertsWaiting} aviso(s) de stock para notificar.`
            : `Pedido #${target.orderNumber} cancelado y stock reintegrado automáticamente al catálogo.`
          : loyaltyReversed
          ? `Pedido #${target.orderNumber} cancelado y puntos DNI revertidos.`
          : `Pedido #${target.orderNumber} marcado como Cancelado.`
      );
      return;
    }

    // Si estaba CANCELADO y se reactiva a otro estado, volver a descontar el stock
    if (target && target.status === 'cancelado' && status !== 'cancelado' && !target.stockDeducted) {
      const { updatedProducts, changed } = applyOrderStockDeltaToProducts(
        products,
        target.items,
        'deduct'
      );
      if (changed) {
        onSaveProducts(updatedProducts);
      }
      const reactivatedTarget: CatalogPickupOrder = {
        ...target,
        status,
        stockDeducted: true,
        stockRestoredAt: undefined,
        updatedAt: now,
      };
      if (status === 'retirado') {
        handleMarkOrderPaidPickedUp(reactivatedTarget);
        return;
      }
      if (status === 'listo_para_retirar' || status === 'en_camino') {
        handleDispatchAndOpenReceipt(reactivatedTarget, status);
        return;
      }
      onSaveOrders(orders.map((o) => (o.id === orderId ? reactivatedTarget : o)));
      showToast(`Pedido #${target.orderNumber} reactivado y stock descontado nuevamente.`);
      return;
    }

    if (target && status === 'retirado') {
      handleMarkOrderPaidPickedUp(target);
      return;
    }

    const isDispatchStatus =
      status === 'listo_para_retirar' || status === 'en_camino';

    if (target && isDispatchStatus) {
      handleDispatchAndOpenReceipt(target, status);
      return;
    }

    const updated = orders.map((o) =>
      o.id === orderId ? { ...o, status, updatedAt: now } : o
    );
    onSaveOrders(updated);
    showToast('Estado del pedido actualizado.');
  };

  const handleWhatsAppCustomerReady = (order: CatalogPickupOrder) => {
    const now = new Date().toISOString();
    const receiptNumber =
      order.dispatchReceiptNumber || `DESP-${order.orderNumber.replace(/^PED-/, '')}`;
    const enrichedOrder: CatalogPickupOrder = {
      ...order,
      dispatchReceiptNumber: receiptNumber,
      dispatchedAt: order.dispatchedAt || now,
      confirmedPaymentMethod:
        order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar',
      updatedAt: now,
    };
    if (!order.dispatchReceiptNumber) {
      onSaveOrders(orders.map((o) => (o.id === order.id ? enrichedOrder : o)));
    }
    const receiptData = buildDispatchReceiptData(enrichedOrder, receiptNumber);
    const msg = generatePaymentReceiptWhatsAppMessage(receiptData, config);
    const url = createWhatsAppUrl(order.customerPhone, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsAppCustomerCollectPayment = (order: CatalogPickupOrder) => {
    const orderCurrency = order.currencySymbol || currency;
    const isDelivery = order.deliveryMethod === 'envio';
    const alias = config.merchantPaymentAlias?.trim();
    const cvu = config.merchantPaymentCvu?.trim();
    const bank = config.merchantPaymentBank?.trim();
    const holder = config.merchantPaymentHolder?.trim();
    const mpLink = config.merchantMpCheckoutLink?.trim();

    const itemSummaryLines = order.items
      .map(
        (it) =>
          `• ${it.quantity} × ${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''}: ${formatCurrency(it.subtotal, orderCurrency)}`
      )
      .join('\n');

    const paymentLines: string[] = [];
    if (alias) paymentLines.push(`• *Alias:* \`${alias}\``);
    if (cvu) paymentLines.push(`• *CVU/CBU:* ${cvu}`);
    if (bank) paymentLines.push(`• *Banco / Billetera:* ${bank}`);
    if (holder) paymentLines.push(`• *Titular:* ${holder}`);
    if (mpLink) paymentLines.push(`• *Link de pago:* ${mpLink}`);

    const paymentBlock =
      paymentLines.length > 0
        ? `\n💳 *Datos para abonar / transferir:*\n${paymentLines.join('\n')}\n`
        : `\n💳 *Medios de pago:* ${settings.paymentNote || 'Transferencia o efectivo'}. Respondeme por acá y te paso los datos para abonar.\n`;

    const msg =
      `Hola ${order.customerName}! 👋 Te escribimos de *${order.storeName}*.\n\n` +
      `Ya procesamos tu pedido *#${order.orderNumber}*` +
      (order.linkedBoletaNumber ? ` (Comprobante *#${order.linkedBoletaNumber}*)` : '') +
      `:\n${itemSummaryLines}\n\n` +
      `💰 *Total a abonar:* *${formatCurrency(order.totalAmount, orderCurrency)}*\n` +
      (isDelivery
        ? `🚚 *Envío a domicilio:* ${order.deliveryAddress || 'A confirmar'}\n`
        : `🏪 *Modalidad:* Retiro en tienda\n`) +
      paymentBlock +
      `\n📩 Enviame el comprobante de pago por este WhatsApp para confirmar y ${
        isDelivery ? 'despachar tu envío' : 'dejar listo tu retiro'
      }. ¡Muchas gracias!`;

    const url = createWhatsAppUrl(order.customerPhone, msg);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmOrderPayment = (order: CatalogPickupOrder) => {
    const now = new Date().toISOString();
    const resolvedMethod: NonNullable<CatalogPickupOrder['confirmedPaymentMethod']> =
      order.confirmedPaymentMethod ||
      (order.preferredPaymentMethod && order.preferredPaymentMethod !== 'acordar'
        ? order.preferredPaymentMethod
        : 'transferencia');
    const updatedOrder: CatalogPickupOrder = {
      ...order,
      paymentStatus: 'acreditado',
      confirmedPaymentMethod: resolvedMethod,
      updatedAt: now,
    };
    onSaveOrders(orders.map((o) => (o.id === order.id ? updatedOrder : o)));
    void syncCatalogOrderToSupabase(updatedOrder);
    showToast(`Pago de pedido #${order.orderNumber} confirmado y acreditado.`);
  };

  const handleSendOrderProcessWhatsApp = async (
    order: CatalogPickupOrder,
    stage: CatalogOrderProcessStage
  ) => {
    const now = new Date().toISOString();
    const nextStatus: CatalogPickupOrder['status'] =
      stage === 'listo_para_retirar'
        ? 'listo_para_retirar'
        : stage === 'en_camino'
        ? 'en_camino'
        : stage === 'retirado'
        ? 'retirado'
        : order.status;

    const stageLabels: Record<CatalogOrderProcessStage, string> = {
      en_proceso_armando: 'Pago en proceso y armando tu pedido',
      listo_para_retirar: 'Pedido listo para pasar a buscar',
      en_camino: 'Pedido en viaje a tu domicilio',
      retirado: 'Pedido entregado / retirado y pagado',
    };

    const previewOrder: CatalogPickupOrder = {
      ...order,
      status: nextStatus,
      updatedAt: now,
    };

    const msg = generateCatalogOrderCustomerProcessMessage({
      order: previewOrder,
      stage,
      storeName: settings.storeName || config.distributorName || order.storeName,
      pickupAddress: settings.pickupAddress || tenant?.address,
      pickupHours: settings.pickupHours,
    });

    const apiRes = await notifyCatalogOrderCustomerStageViaServer({
      order: previewOrder,
      stage,
      message: msg,
      config: {
        whatsappProvider: config.whatsappProvider,
        whatsappApiToken: config.whatsappApiToken,
        whatsappPhoneNumberId: config.whatsappPhoneNumberId,
        twilioAccountSid: config.twilioAccountSid,
        twilioAuthToken: config.twilioAuthToken,
        twilioFromPhone: config.twilioFromPhone,
        webhookGatewayUrl: config.webhookGatewayUrl,
        webhookAuthKey: config.webhookAuthKey,
      },
    });

    const newLog: CatalogOrderStageNotification = {
      stage,
      sentAt: now,
      channel: apiRes.success ? 'whatsapp_api' : 'whatsapp_link',
      summary: stageLabels[stage],
    };

    const updatedOrder: CatalogPickupOrder = {
      ...previewOrder,
      stageNotifications: [...(order.stageNotifications || []), newLog].slice(-12),
      updatedAt: new Date().toISOString(),
    };

    onSaveOrders(orders.map((o) => (o.id === order.id ? updatedOrder : o)));
    void syncCatalogOrderToSupabase(updatedOrder);

    window.open(createWhatsAppUrl(order.customerPhone, msg), '_blank', 'noopener,noreferrer');
    showToast(`WhatsApp de proceso (${stageLabels[stage]}) enviado a ${order.customerName}.`);
  };

  const handleVerifyOrderTransferReceipt = async (order: CatalogPickupOrder) => {
    if (!order.transferReceiptImageUrl) {
      showToast('Este pedido no tiene imagen de comprobante para verificar.');
      return;
    }
    setVerifyingOrderId(order.id);
    try {
      const knownUsedOperationIds = orders
        .filter(
          (o) =>
            o.id !== order.id &&
            o.status !== 'cancelado' &&
            o.status !== 'devuelto' &&
            (o.transferOperationId || o.transferReference)
        )
        .map((o) => ({
          orderId: o.id,
          operationId: String(o.transferOperationId || o.transferReference || '').trim(),
        }))
        .filter((entry) => Boolean(entry.operationId));

      const res = await verifyCatalogTransferReceiptViaServer({
        tenantId: order.tenantId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeName: order.storeName || settings.storeName || config.distributorName || 'Comercio',
        expectedAmount: order.totalAmount,
        alias: config.merchantPaymentAlias,
        cvu: config.merchantPaymentCvu,
        holderName: config.merchantPaymentHolder,
        imageBase64: order.transferReceiptImageUrl,
        knownUsedOperationIds,
      });

      const now = new Date().toISOString();
      const updatedOrder: CatalogPickupOrder = {
        ...order,
        transferOperationId: res.operationId || order.transferOperationId,
        transferReference: order.transferReference || res.operationId,
        transferVerifiedAt: res.approved ? res.verifiedAt || now : order.transferVerifiedAt,
        transferVerificationSummary: res.verificationSummary || res.message,
        transferVerificationStatus: res.duplicate
          ? 'duplicado'
          : res.approved
          ? 'verificado_auto'
          : res.success
          ? 'rechazado'
          : 'pendiente',
        paymentStatus: res.approved
          ? 'acreditado'
          : order.paymentStatus || 'comprobante_en_revision',
        confirmedPaymentMethod: res.approved
          ? order.confirmedPaymentMethod || 'transferencia'
          : order.confirmedPaymentMethod,
        updatedAt: now,
      };

      onSaveOrders(orders.map((o) => (o.id === order.id ? updatedOrder : o)));
      void syncCatalogOrderToSupabase(updatedOrder);

      if (res.duplicate) {
        showToast(res.message || 'Comprobante duplicado: el número de operación ya se usó antes.');
      } else if (res.approved) {
        showToast(`Comprobante verificado y pago acreditado (${res.operationId || 'OK'}).`);
      } else {
        showToast(res.message || 'No coincidió automáticamente; revisá el comprobante adjunto.');
      }
    } finally {
      setVerifyingOrderId(null);
    }
  };

  const activePromoSubscribers = useMemo(() => {
    const q = promoCategoryFilter.trim().toLowerCase();
    return [...promoSubscribers]
      .filter((s) => {
        if (!q || q === 'todas') return true;
        return (s.preferredCategory || '').trim().toLowerCase() === q;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [promoSubscribers, promoCategoryFilter]);

  const promoSelectedCoupon = useMemo(
    () =>
      (settings.coupons || []).find(
        (c) => c.active !== false && c.code.toUpperCase() === promoCouponCodeDraft.toUpperCase()
      ),
    [settings.coupons, promoCouponCodeDraft]
  );

  const handleSendPromoToSubscriber = async (
    sub: CatalogPromoSubscriber,
    silentFallback: boolean = false
  ) => {
    const storeTitle = settings.storeName || config.distributorName || 'Nuestra Tienda';
    const couponDetailText = promoSelectedCoupon
      ? ` Aprovechá un ${
          promoSelectedCoupon.discountType === 'percent'
            ? `${promoSelectedCoupon.value}% OFF`
            : `${formatCurrency(promoSelectedCoupon.value, currency)} OFF`
        }${
          promoSelectedCoupon.minPurchase
            ? ` en compras desde ${formatCurrency(promoSelectedCoupon.minPurchase, currency)}`
            : ''
        }.`
      : '';
    const basePromoText =
      promoMessageDraft.trim() ||
      `Tenemos promociones especiales y nuevos ingresos pensados para vos en ${storeTitle}.`;
    const message = generateCatalogPromoClubWhatsAppMessage({
      customerName: sub.name,
      storeName: storeTitle,
      promoText: `${basePromoText}${couponDetailText}`,
      couponCode: promoSelectedCoupon?.code,
      publicUrl,
    });

    const apiRes = await sendCatalogPromoWhatsAppViaServer({
      subscriberId: sub.id,
      customerPhone: sub.phone,
      message,
    });
    if (!apiRes.success) {
      window.open(createWhatsAppUrl(sub.phone, message), '_blank', 'noopener,noreferrer');
    }

    if (onSavePromoSubscribers) {
      const now = new Date().toISOString();
      onSavePromoSubscribers(
        promoSubscribers.map((s) =>
          s.id === sub.id ? { ...s, lastPromoSentAt: now, updatedAt: now } : s
        )
      );
    }

    if (!silentFallback) {
      showToast(
        apiRes.success
          ? `Promo enviada automáticamente al WhatsApp de ${sub.name}.`
          : `Promo lista en WhatsApp para ${sub.name}.`
      );
    }
    return apiRes.success;
  };

  const handleBatchSendPromo = async () => {
    if (activePromoSubscribers.length === 0) return;
    setIsSendingBatchPromo(true);
    try {
      const storeTitle = settings.storeName || config.distributorName || 'Nuestra Tienda';
      const couponDetailText = promoSelectedCoupon
        ? ` Aprovechá un ${
            promoSelectedCoupon.discountType === 'percent'
              ? `${promoSelectedCoupon.value}% OFF`
              : `${formatCurrency(promoSelectedCoupon.value, currency)} OFF`
          }${
            promoSelectedCoupon.minPurchase
              ? ` en compras desde ${formatCurrency(promoSelectedCoupon.minPurchase, currency)}`
              : ''
          }.`
        : '';
      const basePromoText =
        promoMessageDraft.trim() ||
        `Tenemos promociones especiales y nuevos ingresos pensados para vos en ${storeTitle}.`;
      const now = new Date().toISOString();
      let apiCount = 0;
      const sentIds = new Set<string>();

      for (const sub of activePromoSubscribers) {
        const message = generateCatalogPromoClubWhatsAppMessage({
          customerName: sub.name,
          storeName: storeTitle,
          promoText: `${basePromoText}${couponDetailText}`,
          couponCode: promoSelectedCoupon?.code,
          publicUrl,
        });
        const res = await sendCatalogPromoWhatsAppViaServer({
          subscriberId: sub.id,
          customerPhone: sub.phone,
          message,
        });
        if (res.success) {
          apiCount += 1;
        } else {
          window.open(createWhatsAppUrl(sub.phone, message), '_blank', 'noopener,noreferrer');
        }
        sentIds.add(sub.id);
      }

      if (onSavePromoSubscribers) {
        onSavePromoSubscribers(
          promoSubscribers.map((s) =>
            sentIds.has(s.id) ? { ...s, lastPromoSentAt: now, updatedAt: now } : s
          )
        );
      }

      showToast(
        apiCount === activePromoSubscribers.length
          ? `Se enviaron ${apiCount} promos por WhatsApp automáticamente.`
          : `Campaña procesada para ${activePromoSubscribers.length} suscriptor(es) (${apiCount} vía API, el resto vía WhatsApp Web).`
      );
    } finally {
      setIsSendingBatchPromo(false);
    }
  };

  const handleExportPromoSubscribersCsv = () => {
    if (activePromoSubscribers.length === 0) return;
    const headers = [
      'Nombre',
      'WhatsApp',
      'Email',
      'Interés / Categoría',
      'Cumpleaños',
      'Origen',
      'Fecha de alta',
      'Última promo enviada',
    ];
    const rows = activePromoSubscribers.map((s) => [
      s.name,
      s.phone,
      s.email || '',
      s.preferredCategory || '',
      s.birthDate || '',
      s.source === 'checkout_opt_in' ? 'Opt-in pedido' : 'Formulario Club Web',
      s.createdAt ? new Date(s.createdAt).toLocaleString('es-AR') : '',
      s.lastPromoSentAt ? new Date(s.lastPromoSentAt).toLocaleString('es-AR') : '',
    ]);
    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((val) => `"${String(val || '').replace(/"/g, '""')}"`).join(';')
      )
      .join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `club_promos_suscriptores_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Listado de suscriptores exportado en CSV.');
  };

  // --- Bulk Selection & Quick Price Update Handlers ---
  const toggleProductSelected = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleSelectAllFilteredProducts = () => {
    const allFilteredSelected =
      filteredProducts.length > 0 &&
      filteredProducts.every((p) => selectedProductIds.has(p.id));
    if (allFilteredSelected) {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        filteredProducts.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        filteredProducts.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const openQuickPriceEditor = (product: CatalogProduct, mode: 'fixed' | 'percent' = 'fixed') => {
    setQuickPriceProductId(product.id);
    setQuickPriceMode(mode);
    setQuickPriceInput(mode === 'fixed' ? String(product.price) : '10');
    setQuickPriceScaleExtras(true);
  };

  const handleSaveQuickProductPrice = (product: CatalogProduct) => {
    const rawNum = Number(String(quickPriceInput).replace(',', '.'));
    if (!Number.isFinite(rawNum)) {
      showToast('Ingresá un valor numérico válido.');
      return;
    }

    let updatedProduct: CatalogProduct;
    if (quickPriceMode === 'fixed') {
      if (rawNum < 0) {
        showToast('El precio no puede ser negativo.');
        return;
      }
      updatedProduct = applyDirectPriceUpdate(product, rawNum, {
        scaleWholesaleAndVariants: quickPriceScaleExtras,
      });
    } else {
      if (rawNum <= -100 || rawNum > 1000) {
        showToast('Ingresá un porcentaje válido (mayor a -100%).');
        return;
      }
      updatedProduct = applyPercentagePriceAdjustment(product, rawNum, {
        includeWholesale: quickPriceScaleExtras,
        includeVariants: quickPriceScaleExtras,
      });
    }

    onSaveProducts(products.map((p) => (p.id === product.id ? updatedProduct : p)));
    setQuickPriceProductId(null);
    showToast(
      `Precio de "${product.name}" actualizado a ${formatCurrency(updatedProduct.price, currency)}.`
    );
  };

  const selectedRubroProducts = useMemo(
    () => rubroProducts.filter((p) => selectedProductIds.has(p.id)),
    [rubroProducts, selectedProductIds]
  );

  const handleApplyBulkPercentage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedRubroProducts.length === 0) return;
    const pct = Number(String(bulkPercentInput).replace(',', '.'));
    if (!Number.isFinite(pct) || pct === 0 || pct <= -100 || pct > 1000) {
      showToast('Ingresá un porcentaje distinto de 0% (mayor a -100%).');
      return;
    }

    const updated = products.map((p) =>
      selectedProductIds.has(p.id)
        ? applyPercentagePriceAdjustment(p, pct, {
            roundingStep: bulkRoundingStep,
            includeWholesale: bulkIncludeWholesale,
            includeVariants: bulkIncludeVariants,
          })
        : p
    );
    onSaveProducts(updated);
    const sign = pct > 0 ? `+${pct}%` : `${pct}%`;
    showToast(
      `Se actualizó el precio (${sign}) de ${selectedRubroProducts.length} producto(s).`
    );
    setSelectedProductIds(new Set());
  };

  // --- CSV / Excel Bulk Import Handlers ---
  const parsedCsvPreview = useMemo(
    () => parseCatalogSpreadsheetText(csvRawInput, activeRubroFilters[0] || 'General'),
    [csvRawInput, activeRubroFilters]
  );

  const handleCsvFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvRawInput(String(reader.result || ''));
    };
    reader.onerror = () => {
      showToast('No se pudo leer el archivo seleccionado.');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDownloadCsvTemplate = () => {
    const csv = buildCatalogCsvTemplate(activeRubroFilters[0] || 'General', activeCatalogRubro);
    triggerCsvDownload(csv, `plantilla_catalogo_${activeCatalogRubro}.csv`);
    showToast('Plantilla CSV compatible con Excel descargada.');
  };

  const handleExportCurrentCatalogCsv = () => {
    if (rubroProducts.length === 0) {
      showToast('No hay productos para exportar en este rubro.');
      return;
    }
    const csv = exportCatalogProductsToCsv(rubroProducts);
    triggerCsvDownload(
      csv,
      `catalogo_${activeCatalogRubro}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    showToast(`Exportados ${rubroProducts.length} producto(s) a CSV.`);
  };

  const handleConfirmCsvImport = () => {
    if (parsedCsvPreview.validRows.length === 0) {
      showToast('No hay filas válidas para importar.');
      return;
    }

    const nowIso = new Date().toISOString();
    const working = [...products];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const discoveredSubfilters = new Set<string>(savedCustomSubfilters);
    const discoveredFilters = new Set<string>(activeRubroFilters);

    for (const row of parsedCsvPreview.validRows) {
      row.subfilters.forEach((sf) => discoveredSubfilters.add(sf));
      if (row.category) discoveredFilters.add(row.category);

      const matchIdx = working.findIndex((existing) => {
        if ((existing.rubro || activeCatalogRubro) !== activeCatalogRubro) return false;
        if (row.sku && existing.sku && existing.sku.trim().toLowerCase() === row.sku.toLowerCase()) {
          return true;
        }
        return existing.name.trim().toLowerCase() === row.name.trim().toLowerCase();
      });

      if (matchIdx >= 0) {
        if (csvConflictMode === 'only_new') {
          skippedCount += 1;
          continue;
        }
        const prev = working[matchIdx];
        working[matchIdx] = {
          ...prev,
          name: row.name,
          price: row.price,
          category: row.category || prev.category,
          subfilters: row.subfilters.length > 0 ? row.subfilters : prev.subfilters,
          sku: row.sku ?? prev.sku,
          stockQuantity:
            typeof row.stockQuantity === 'number' ? row.stockQuantity : prev.stockQuantity,
          unitLabel: row.unitLabel || prev.unitLabel,
          description: row.description || prev.description,
          wholesaleMinQty: row.wholesaleMinQty ?? prev.wholesaleMinQty,
          wholesalePrice: row.wholesalePrice ?? prev.wholesalePrice,
          lowStockThreshold: row.lowStockThreshold ?? prev.lowStockThreshold,
          available: row.available,
          rubro: activeCatalogRubro,
          updatedAt: nowIso,
        };
        updatedCount += 1;
      } else {
        const created: CatalogProduct = {
          id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: row.name,
          price: row.price,
          category: row.category || activeRubroFilters[0] || 'General',
          rubro: activeCatalogRubro,
          subfilters: row.subfilters.length > 0 ? row.subfilters : undefined,
          sku: row.sku,
          stockQuantity: row.stockQuantity,
          unitLabel: row.unitLabel || 'Unidad',
          description: row.description,
          wholesaleMinQty: row.wholesaleMinQty,
          wholesalePrice: row.wholesalePrice,
          lowStockThreshold: row.lowStockThreshold,
          available: row.available,
          featured: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        working.unshift(created);
        createdCount += 1;
      }
    }

    // Persist newly discovered subfilters/categories cleanly if needed
    const nextFilters = normalizeFilterList(Array.from(discoveredFilters));
    const nextSubs = normalizeFilterList(Array.from(discoveredSubfilters));
    if (isBasicWebPlan) {
      if (rubroProducts.length + createdCount > PLAN_WEB_MAX_PRODUCTS) {
        setIsCsvImportModalOpen(false);
        requestPlanUpgrade(
          'limit_products',
          `La importación supera el límite de ${PLAN_WEB_MAX_PRODUCTS} prendas / objetos`,
          `Tenés ${rubroProducts.length} artículos cargados y querés sumar ${createdCount} nuevos (total ${
            rubroProducts.length + createdCount
          }). El Plan 2 permite hasta ${PLAN_WEB_MAX_PRODUCTS}. Ampliá a Plan 3 · Full para importación ilimitada.`
        );
        return;
      }
      const nextCombinedRubros = normalizeFilterList([...nextFilters, ...nextSubs]);
      if (nextCombinedRubros.length > PLAN_WEB_MAX_RUBROS) {
        setIsCsvImportModalOpen(false);
        requestPlanUpgrade(
          'limit_rubros',
          `La importación supera el límite de ${PLAN_WEB_MAX_RUBROS} rubros`,
          `Los rubros/subfiltros del archivo sumarían ${nextCombinedRubros.length} categorías en total y el Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS}. Ampliá a Plan 3 · Full para rubros ilimitados.`
        );
        return;
      }
    }
    if (
      nextSubs.length !== savedCustomSubfilters.length ||
      nextFilters.length !== activeRubroFilters.length
    ) {
      onSaveSettings({
        ...settings,
        catalogRubro: activeCatalogRubro,
        rubroFilters: nextFilters,
        customSubfilters: nextSubs,
        updatedAt: nowIso,
      });
    }

    onSaveProducts(working);
    setIsCsvImportModalOpen(false);
    setCsvRawInput('');
    showToast(
      `Importación lista: ${createdCount} nuevo(s), ${updatedCount} actualizado(s)${
        skippedCount > 0 ? `, ${skippedCount} omitido(s)` : ''
      }.`
    );
  };

  // --- Birthday Club Greetings Handlers ---
  const currentYear = new Date().getFullYear();
  const upcomingBirthdays = useMemo<UpcomingBirthdayEntry[]>(
    () => getUpcomingBirthdaySubscribers(promoSubscribers, 7),
    [promoSubscribers]
  );
  const birthdaySelectedCoupon = useMemo(
    () =>
      (settings.coupons || []).find(
        (c) =>
          c.active !== false &&
          c.code.toUpperCase() === birthdayCouponCodeDraft.trim().toUpperCase()
      ),
    [settings.coupons, birthdayCouponCodeDraft]
  );

  const handleSendBirthdayGreeting = async (
    entry: UpcomingBirthdayEntry,
    silentToast: boolean = false
  ) => {
    const sub = entry.subscriber;
    const storeTitle = settings.storeName || config.distributorName || 'Nuestra Tienda';
    const couponLabel = birthdaySelectedCoupon
      ? birthdaySelectedCoupon.discountType === 'percent'
        ? `${birthdaySelectedCoupon.value}% OFF`
        : `${formatCurrency(birthdaySelectedCoupon.value, currency)} OFF`
      : undefined;
    const message = generateCatalogBirthdayPromoWhatsAppMessage({
      customerName: sub.name,
      storeName: storeTitle,
      customMessage: birthdayCustomMessageDraft,
      couponCode: birthdaySelectedCoupon?.code,
      couponDiscountLabel: couponLabel,
      publicUrl,
    });

    const apiRes = await sendCatalogPromoWhatsAppViaServer({
      subscriberId: sub.id,
      customerPhone: sub.phone,
      message,
    });
    if (!apiRes.success) {
      window.open(createWhatsAppUrl(sub.phone, message), '_blank', 'noopener,noreferrer');
    }

    if (onSavePromoSubscribers) {
      const now = new Date().toISOString();
      onSavePromoSubscribers(
        promoSubscribers.map((s) =>
          s.id === sub.id
            ? {
                ...s,
                lastPromoSentAt: now,
                lastBirthdayGreetingYear: currentYear,
                updatedAt: now,
              }
            : s
        )
      );
    }

    if (!silentToast) {
      showToast(
        apiRes.success
          ? `Saludo de cumpleaños enviado a ${sub.name} por WhatsApp.`
          : `Mensaje de cumpleaños abierto en WhatsApp para ${sub.name}.`
      );
    }
    return apiRes.success;
  };

  const handleSendAllPendingBirthdays = async () => {
    const pending = upcomingBirthdays.filter(
      (b) => b.subscriber.lastBirthdayGreetingYear !== currentYear
    );
    const targets = pending.length > 0 ? pending : upcomingBirthdays;
    if (targets.length === 0) return;

    setIsSendingBirthdayBatch(true);
    try {
      const storeTitle = settings.storeName || config.distributorName || 'Nuestra Tienda';
      const couponLabel = birthdaySelectedCoupon
        ? birthdaySelectedCoupon.discountType === 'percent'
          ? `${birthdaySelectedCoupon.value}% OFF`
          : `${formatCurrency(birthdaySelectedCoupon.value, currency)} OFF`
        : undefined;
      const sentIds = new Set<string>();
      let apiCount = 0;

      for (const entry of targets) {
        const sub = entry.subscriber;
        const message = generateCatalogBirthdayPromoWhatsAppMessage({
          customerName: sub.name,
          storeName: storeTitle,
          customMessage: birthdayCustomMessageDraft,
          couponCode: birthdaySelectedCoupon?.code,
          couponDiscountLabel: couponLabel,
          publicUrl,
        });
        const res = await sendCatalogPromoWhatsAppViaServer({
          subscriberId: sub.id,
          customerPhone: sub.phone,
          message,
        });
        if (res.success) {
          apiCount += 1;
        } else {
          window.open(createWhatsAppUrl(sub.phone, message), '_blank', 'noopener,noreferrer');
        }
        sentIds.add(sub.id);
      }

      if (onSavePromoSubscribers) {
        const now = new Date().toISOString();
        onSavePromoSubscribers(
          promoSubscribers.map((s) =>
            sentIds.has(s.id)
              ? {
                  ...s,
                  lastPromoSentAt: now,
                  lastBirthdayGreetingYear: currentYear,
                  updatedAt: now,
                }
              : s
          )
        );
      }

      showToast(
        apiCount === targets.length
          ? `Se enviaron ${apiCount} saludo(s) de cumpleaños automáticamente.`
          : `Saludos procesados para ${targets.length} cumpleañero(s).`
      );
    } finally {
      setIsSendingBirthdayBatch(false);
    }
  };

  if (!isServiceEnabledBySuperAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 max-w-2xl mx-auto">
        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <Store className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Catálogo Online Pausado</h2>
        <p className="text-sm text-slate-600">
          El módulo de Catálogo Online fue deshabilitado temporalmente desde SuperGestión para esta empresa.
          Contactá al administrador general si necesitás volver a activarlo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner & Public Share Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0 flex-1 basis-80">
            <BrandMark
              logoUrl={config.distributorLogoUrl || tenant?.logoUrl}
              icon={config.distributorIcon || tenant?.icon}
              name={settings.storeName || config.distributorName || tenant?.name || 'Catálogo'}
              size="md"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Tu Catálogo Online para Pedidos y Retiro
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    settings.published !== false
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {settings.published !== false ? 'Publicado en la página' : 'En borrador'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#0B1933]/8 text-[#0B1933] border border-[#0B1933]/20">
                  Rubro: {rubroPreset.shortLabel}
                </span>
                {onOpenEditBrand && (
                  <button
                    type="button"
                    onClick={onOpenEditBrand}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    title="El logo del sistema se muestra automáticamente en tu página web pública"
                  >
                    <Palette className="w-3 h-3 text-[#0B1933]" />
                    <span>Logo web sincronizado</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Cada producto que cargues se guarda exclusivamente en <strong>{rubroPreset.label}</strong> con el logo de tu empresa y tus filtros/subfiltros personalizados.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePublished}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              {settings.published !== false ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                  <span>Ocultar</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Publicar</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => onOpenPublicPreview(catalogHandle)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#0B1933]" />
              <span>Ver Página Pública</span>
            </button>

            <button
              type="button"
              onClick={handleShareCatalogWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Difundir por WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={openNewProductModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Producto</span>
            </button>
          </div>
        </div>

        {/* Shareable Link Bar + Quick WhatsApp Receiver Editor */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Link2 className="w-4 h-4 text-[#0B1933] shrink-0" />
              <span className="text-xs font-semibold text-slate-600 shrink-0">
                Enlace público:
              </span>
              <span className="text-xs font-mono text-slate-800 truncate select-all">
                {publicUrl}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyPublicUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 transition-colors cursor-pointer shrink-0 self-start sm:self-auto whitespace-nowrap"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>Copiar enlace</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {isEditingWhatsappInline ? (
              <form
                onSubmit={handleSaveInlineWhatsapp}
                className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full"
              >
                <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                <input
                  type="text"
                  value={inlineWhatsappDraft}
                  onChange={(e) => setInlineWhatsappDraft(e.target.value)}
                  placeholder="Ej. +54 9 11 1234-5678"
                  autoFocus
                  className="flex-1 min-w-[160px] px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer whitespace-nowrap"
                  >
                    Guardar número
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineWhatsappDraft(effectiveWhatsappPhone);
                      setIsEditingWhatsappInline(false);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-semibold text-slate-600 shrink-0">
                    WhatsApp del carrito web:
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-900 truncate tabular-nums">
                    {effectiveWhatsappPhone || 'Sin configurar'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInlineWhatsappDraft(effectiveWhatsappPhone);
                    setIsEditingWhatsappInline(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 transition-colors cursor-pointer shrink-0 self-start sm:self-auto whitespace-nowrap"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#0B1933]" />
                  <span>{effectiveWhatsappPhone ? 'Modificar WhatsApp' : 'Configurar WhatsApp'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {!effectiveWhatsappPhone && !isEditingWhatsappInline && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Falta configurar el <strong>WhatsApp del dueño/vendedor</strong> para recibir los pedidos del carrito directo en tu teléfono.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setInlineWhatsappDraft('');
                setIsEditingWhatsappInline(true);
              }}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer shrink-0 whitespace-nowrap self-start sm:self-auto"
            >
              Cargar WhatsApp ahora
            </button>
          </div>
        )}

        {/* KPI Row + Sub-navigation */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit max-w-full">
            <button
              type="button"
              onClick={() => setSubTab('productos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'productos'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Productos ({rubroProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('pedidos')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'pedidos'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Pedidos Recibidos</span>
              {pendingPickupOrdersCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-[#0B1933] text-white text-[10px] font-mono tabular-nums">
                  {pendingPickupOrdersCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isBasicWebPlan) {
                  requestPlanUpgrade(
                    'full_feature',
                    'Avisos de Stock y Seguimiento de Clientes · Exclusivo Plan 3 · Full',
                    'En Plan 2 no está incluido el seguimiento de clientes ni captura de solicitudes de stock. Ampliá a Plan 3 · Full para activarlo.'
                  );
                  return;
                }
                setSubTab('avisos_stock');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'avisos_stock'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              <span>Avisos de Stock</span>
              {!isBasicWebPlan && pendingStockAlertsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-amber-600 text-white text-[10px] font-mono tabular-nums">
                  {pendingStockAlertsCount}
                </span>
              )}
              {isBasicWebPlan && <Lock className="w-3 h-3 text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isBasicWebPlan) {
                  requestPlanUpgrade(
                    'full_feature',
                    'Carritos Abandonados · Exclusivo Plan 3 · Full',
                    'El seguimiento y recupero de carritos abandonados está disponible en Plan 3 · Full.'
                  );
                  return;
                }
                setSubTab('carritos_abandonados');
                void onRefreshAbandonedCarts?.();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'carritos_abandonados'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5 text-amber-600" />
              <span>Carritos</span>
              {!isBasicWebPlan &&
                abandonedCarts.filter((c) => c.status === 'abandoned' || c.status === 'reminded').length > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-amber-600 text-white text-[10px] font-mono tabular-nums">
                  {abandonedCarts.filter((c) => c.status === 'abandoned' || c.status === 'reminded').length}
                </span>
              )}
              {isBasicWebPlan && <Lock className="w-3 h-3 text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isBasicWebPlan) {
                  requestPlanUpgrade(
                    'full_feature',
                    'Gift Cards QR · Exclusivo Plan 3 · Full',
                    'La emisión y canje de Gift Cards Digitales con QR requiere Plan 3 · Full.'
                  );
                  return;
                }
                setSubTab('gift_cards');
                void onRefreshGiftCards?.();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'gift_cards'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 text-indigo-700" />
              <span>Gift Cards QR ({giftCards.filter((g) => g.status === 'active' && g.remainingBalance > 0).length})</span>
              {isBasicWebPlan && <Lock className="w-3 h-3 text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isBasicWebPlan) {
                  requestPlanUpgrade(
                    'full_feature',
                    'SuperClub y Club de Promos · Exclusivo Plan 3 · Full',
                    'En Plan 2 no está incluido el SuperClub ni campañas de descuentos/cupones. Pasá a Plan 3 · Full para activarlo.'
                  );
                  return;
                }
                setSubTab('club_promos');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'club_promos'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Gift className="w-3.5 h-3.5 text-emerald-600" />
              <span>SuperClub ({promoSubscribers.length})</span>
              {isBasicWebPlan && <Lock className="w-3 h-3 text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isBasicWebPlan) {
                  requestPlanUpgrade(
                    'full_feature',
                    'Seguimiento de Clientes Web y Puntos DNI · Exclusivo Plan 3 · Full',
                    'El seguimiento de clientes web y el programa de puntos por DNI están disponibles en Plan 3 · Full.'
                  );
                  return;
                }
                setSubTab('clientes_web');
                void onRefreshOrders?.();
                void onRefreshLoyaltyAccounts?.();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'clientes_web'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-700" />
              <span>Clientes Web ({loyaltyAccounts.length})</span>
              {isBasicWebPlan && <Lock className="w-3 h-3 text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setSubTab('estadisticas');
                if (!isBasicWebPlan) {
                  void onRefreshLoyaltyAccounts?.();
                }
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'estadisticas'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#0B1933]" />
              <span>Estadísticas</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('configuracion')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'configuracion'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tienda, Envíos y Cobros
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium tabular-nums">
            <span>
              <strong className="text-slate-800">{activeProductsCount}</strong> activos
            </span>
            {lowStockProducts.length > 0 && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => {
                    setSubTab('productos');
                    setShowLowStockOnly((prev) => !prev);
                  }}
                  className="text-amber-700 hover:underline font-semibold cursor-pointer"
                >
                  <strong>{lowStockProducts.length}</strong> stock bajo
                </button>
              </>
            )}
            {outOfStockProductsCount > 0 && (
              <>
                <span>·</span>
                <span className="text-rose-700 font-semibold">
                  <strong>{outOfStockProductsCount}</strong> sin stock
                </span>
              </>
            )}
            <span>·</span>
            <span>
              WhatsApp pedidos:{' '}
              <strong className="text-slate-800">
                {effectiveWhatsappPhone || 'Sin cargar'}
              </strong>
            </span>
          </div>
        </div>

        {isBasicWebPlan && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#0B1933] flex items-center gap-2 flex-wrap">
                <span>Plan 2 · Página Web Básica (Pagos en tienda y manejo de stock)</span>
                <span className="font-mono tabular-nums text-[11px] font-bold text-slate-700">
                  · Rubros: {currentDistinctRubros.length}/{PLAN_WEB_MAX_RUBROS}
                </span>
                <span className="font-mono tabular-nums text-[11px] font-bold text-slate-700">
                  · Prendas/Objetos: {rubroProducts.length}/{PLAN_WEB_MAX_PRODUCTS}
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                Sin burbujas de ofertas, seguimiento de clientes, SuperClub ni descuentos. Si necesitás más de {PLAN_WEB_MAX_RUBROS} rubros, más de {PLAN_WEB_MAX_PRODUCTS} artículos o herramientas de fidelización, podés ampliar a Plan 3 · Full en un clic.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                requestPlanUpgrade(
                  'full_feature',
                  'Ampliar capacidad y funciones a Plan 3 · Full',
                  'Desbloqueá rubros y productos ilimitados, burbujas/banners de ofertas, seguimiento completo de clientes, SuperClub, Puntos por DNI y descuentos.'
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap self-start lg:self-auto"
            >
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              <span>Aumentar a Plan 3 · Full</span>
            </button>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: PRODUCTOS */}
      {subTab === 'productos' && (
        <div className="space-y-4">
          {/* Search & Primary Rubro Filters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Buscar en ${rubroPreset.shortLabel} por nombre, código o subfiltro...`}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-[#0B1933] text-white border-[#0B1933]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Client Custom Subfilters Bar */}
            <div className="pt-2.5 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 mr-1">
                  <Tag className="w-3.5 h-3.5 text-[#0B1933]" />
                  <span>Subfiltros:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSubfilter('Todos')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                    selectedSubfilter === 'Todos'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todos
                </button>
                {activeSubfilters.map((sf) => {
                  const isSaved = savedCustomSubfilters.some(
                    (x) => x.toLowerCase() === sf.toLowerCase()
                  );
                  const isSelected = selectedSubfilter.toLowerCase() === sf.toLowerCase();
                  return (
                    <div
                      key={sf}
                      className={`inline-flex items-center rounded-md border text-[11px] font-semibold overflow-hidden ${
                        isSelected
                          ? 'bg-[#0B1933] text-white border-[#0B1933]'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSubfilter(sf)}
                        className="px-2.5 py-1 hover:opacity-90 cursor-pointer"
                      >
                        {sf}
                      </button>
                      {isSaved && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomSubfilter(sf)}
                          title={`Quitar subfiltro "${sf}"`}
                          className={`px-1.5 py-1 border-l cursor-pointer ${
                            isSelected
                              ? 'border-white/20 hover:bg-white/15 text-white'
                              : 'border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600'
                          }`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddCustomSubfilter(newSubfilterInput);
                }}
                className="flex items-center gap-1.5 shrink-0"
              >
                <input
                  type="text"
                  value={newSubfilterInput}
                  onChange={(e) => setNewSubfilterInput(e.target.value)}
                  placeholder="Nuevo subfiltro (ej. Remeras, Ofertas...)"
                  className="w-52 sm:w-56 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </form>
            </div>

            {/* Suggested subfilters for quick 1-click addition */}
            {rubroPreset.suggestedSubfilters.some(
              (s) => !activeSubfilters.some((ex) => ex.toLowerCase() === s.toLowerCase())
            ) && (
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
                <span className="font-semibold">Sugeridos para {rubroPreset.shortLabel}:</span>
                {rubroPreset.suggestedSubfilters
                  .filter(
                    (s) => !activeSubfilters.some((ex) => ex.toLowerCase() === s.toLowerCase())
                  )
                  .slice(0, 6)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleAddCustomSubfilter(s)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>{s}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Quick Toolbar: Multi-Select + Excel/CSV Import & Export */}
            <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllFilteredProducts}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5 text-[#0B1933]" />
                    <span>
                      {filteredProducts.every((p) => selectedProductIds.has(p.id))
                        ? `Deseleccionar visibles (${filteredProducts.length})`
                        : `Seleccionar visibles (${filteredProducts.length})`}
                    </span>
                  </button>
                )}
                {selectedRubroProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedProductIds(new Set())}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Limpiar ({selectedRubroProducts.length})</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {rubroProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportCurrentCatalogCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Exportar CSV</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCsvImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 cursor-pointer whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Importar Excel / CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Percentage Price Update Bar (shown when 1+ products are selected) */}
          {selectedRubroProducts.length > 0 && (
            <form
              onSubmit={handleApplyBulkPercentage}
              className="bg-[#0B1933] text-white rounded-2xl p-4 space-y-3 shadow-sm"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold flex items-center gap-2">
                    <Percent className="w-4 h-4 text-emerald-300" />
                    <span>
                      Ajuste por porcentaje sobre {selectedRubroProducts.length} producto(s) seleccionado(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5 tabular-nums">
                    {(() => {
                      const sample = selectedRubroProducts[0];
                      const pctNum = Number(String(bulkPercentInput).replace(',', '.'));
                      if (!sample || !Number.isFinite(pctNum)) return 'Ingresá un % para ver la vista previa.';
                      const preview = applyPercentagePriceAdjustment(sample, pctNum, {
                        roundingStep: bulkRoundingStep,
                        includeWholesale: bulkIncludeWholesale,
                        includeVariants: bulkIncludeVariants,
                      });
                      return `Ejemplo "${sample.name}": ${formatCurrency(sample.price, currency)} → ${formatCurrency(preview.price, currency)}`;
                    })()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[5, 10, 15, 20, -10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkPercentInput(String(preset))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border cursor-pointer transition-colors ${
                        Number(bulkPercentInput) === preset
                          ? 'bg-white text-[#0B1933] border-white'
                          : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                      }`}
                    >
                      {preset > 0 ? `+${preset}%` : `${preset}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-200">
                    Porcentaje (% aumento o - descuento)
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    step="0.5"
                    value={bulkPercentInput}
                    onChange={(e) => setBulkPercentInput(e.target.value)}
                    placeholder="Ej. 15 o -10"
                    className="w-full px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-200">
                    Redondeo automático
                  </label>
                  <select
                    value={bulkRoundingStep}
                    onChange={(e) =>
                      setBulkRoundingStep(Number(e.target.value) as CatalogPriceRoundingStep)
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-semibold"
                  >
                    <option value={0}>Exacto (sin redondeo)</option>
                    <option value={10}>Múltiplos de $ 10</option>
                    <option value={50}>Múltiplos de $ 50</option>
                    <option value={100}>Múltiplos de $ 100</option>
                    <option value={500}>Múltiplos de $ 500</option>
                    <option value={1000}>Múltiplos de $ 1.000</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 text-[11px] text-slate-200">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkIncludeVariants}
                      onChange={(e) => setBulkIncludeVariants(e.target.checked)}
                      className="rounded"
                    />
                    <span>Ajustar precios de variantes</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkIncludeWholesale}
                      onChange={(e) => setBulkIncludeWholesale(e.target.checked)}
                      className="rounded"
                    />
                    <span>Ajustar precios mayoristas</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  Aplicar % a los {selectedRubroProducts.length}
                </button>
              </div>
            </form>
          )}

          {lowStockProducts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900">
                    Alerta de stock bajo: {lowStockProducts.length} producto(s) con{' '}
                    {defaultLowThreshold} u. o menos
                  </div>
                  <p className="text-[11px] text-slate-600 truncate max-w-2xl">
                    {lowStockProducts
                      .slice(0, 4)
                      .map((p) => {
                        const st = getProductLowStockStatus(p, defaultLowThreshold);
                        return `${p.name} (${st.minAvailableStock ?? 0} u.)`;
                      })
                      .join(' · ')}
                    {lowStockProducts.length > 4 ? ` y ${lowStockProducts.length - 4} más` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLowStockOnly((prev) => !prev)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 border ${
                  showLowStockOnly
                    ? 'bg-[#0B1933] text-white border-[#0B1933]'
                    : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100/70'
                }`}
              >
                {showLowStockOnly ? 'Ver todos los productos' : `Filtrar stock bajo (${lowStockProducts.length})`}
              </button>
            </div>
          )}

          {!isBasicWebPlan && restockedPendingAlerts.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Bell className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-slate-900">
                    ¡Stock repuesto! Hay {restockedPendingAlerts.length} cliente(s) esperando aviso en productos disponibles
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Ya volvió a haber stock en artículos que pidieron tus clientes. Podés avisarles en 1 clic por WhatsApp.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isBatchNotifyingAlerts}
                  onClick={handleNotifyAllRestockedAlerts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white cursor-pointer whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>
                    {isBatchNotifyingAlerts
                      ? 'Enviando avisos...'
                      : `Avisar a los ${restockedPendingAlerts.length} por WhatsApp`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab('avisos_stock')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 bg-white hover:bg-emerald-100/50 text-emerald-800 cursor-pointer whitespace-nowrap"
                >
                  Ver lista
                </button>
              </div>
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-sm font-bold text-slate-900">
                  {rubroProducts.length === 0
                    ? `Todavía no cargaste productos en ${rubroPreset.shortLabel}`
                    : 'No hay productos que coincidan con los filtros'}
                </h3>
                <p className="text-xs text-slate-500">
                  {rubroProducts.length === 0
                    ? `Agregá tu primer artículo en ${rubroPreset.shortLabel} (${activeRubroFilters.join(', ')}) para publicar tu catálogo online.`
                    : 'Probá cambiando el texto, el filtro principal o el subfiltro seleccionado.'}
                </p>
              </div>
              {rubroProducts.length === 0 ? (
                <button
                  type="button"
                  onClick={openNewProductModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cargar Primer Producto</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('Todas');
                    setSelectedSubfilter('Todos');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Limpiar filtros</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const productHasVar = hasProductVariants(product);
                const stockQty = getProductSummaryStock(product);
                const isOutOfStock = isProductFullyOutOfStock(product);
                const lowStockStatus = getProductLowStockStatus(product, defaultLowThreshold);
                const galleryImages = getProductGalleryImages(product);
                const waitingAlerts = pendingAlertsByProductId.get(product.id) || 0;

                const isCardSelected = selectedProductIds.has(product.id);
                const isQuickEditingPrice = quickPriceProductId === product.id;

                return (
                  <div
                    key={product.id}
                    className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-all hover:shadow-sm ${
                      isCardSelected
                        ? 'border-[#0B1933] ring-2 ring-[#0B1933]/15'
                        : product.available
                        ? 'border-slate-200'
                        : 'border-slate-200 opacity-75'
                    }`}
                  >
                    {/* Product Image Container */}
                    <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                      {galleryImages[0] ? (
                        <img
                          src={galleryImages[0]}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover ${isOutOfStock ? 'opacity-70 grayscale-[30%]' : ''}`}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1.5 bg-gradient-to-br from-slate-100 to-slate-200">
                          <ImageIcon className="w-8 h-8 opacity-60" />
                          <span className="text-[11px] font-medium">Sin foto cargada</span>
                        </div>
                      )}
                      {!isBasicWebPlan && product.featured && (
                        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                          <Star className="w-3 h-3 fill-current" />
                          <span>Destacado</span>
                        </span>
                      )}
                      {!isBasicWebPlan && (isProductFlashSaleActive(product) || product.isOutlet) && (
                        <span
                          className={`absolute ${
                            product.featured ? 'top-9' : 'top-2.5'
                          } left-2.5 px-2 py-0.5 rounded-md ${
                            isProductFlashSaleActive(product)
                              ? 'bg-rose-600 text-white'
                              : 'bg-amber-600 text-white'
                          } text-[10px] font-bold inline-flex items-center gap-1 shadow-xs`}
                        >
                          <Flame className="w-3 h-3" />
                          <span>
                            {isProductFlashSaleActive(product) ? 'Oferta Relámpago' : 'Outlet'}
                          </span>
                        </span>
                      )}
                      {galleryImages.length > 1 && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-950/80 text-white text-[10px] font-bold font-mono tabular-nums">
                          {galleryImages.length} fotos
                        </span>
                      )}
                      {isOutOfStock && product.available && (
                        <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-rose-700 text-white text-[10px] font-bold shadow-xs">
                          Sin stock (0 u.)
                        </span>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isCardSelected}
                              onChange={() => toggleProductSelected(product.id)}
                              title="Seleccionar para ajuste masivo por porcentaje"
                              className="w-4 h-4 rounded border-slate-300 text-[#0B1933] cursor-pointer shrink-0"
                            />
                            <span className="truncate">
                              {product.category || 'General'} · {product.unitLabel || 'Unidad'}
                              {product.sku ? ` · Cód: ${product.sku}` : ''}
                            </span>
                          </label>
                          <span
                            className={`font-semibold shrink-0 tabular-nums ${
                              !product.available
                                ? 'text-slate-500'
                                : isOutOfStock
                                ? 'text-rose-700'
                                : lowStockStatus.isLow
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {!product.available
                              ? 'Pausado'
                              : isOutOfStock
                              ? 'Sin stock'
                              : lowStockStatus.isLow
                              ? `Stock bajo (${lowStockStatus.minAvailableStock ?? stockQty} u.)`
                              : stockQty !== null
                              ? `Stock: ${stockQty} u.`
                              : 'Stock libre'}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                          {product.name}
                        </h3>
                        {!isBasicWebPlan && isProductFlashSaleActive(product) && (
                          <div className="text-[11px] font-bold text-rose-700 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
                            <span>
                              Flash: {formatCurrency(product.flashSalePrice || 0, currency)}
                            </span>
                            {product.flashSaleEndsAt && (
                              <span className="text-[10px] font-sans text-rose-600">
                                (hasta {new Date(product.flashSaleEndsAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})
                              </span>
                            )}
                          </div>
                        )}
                        {!isBasicWebPlan && product.wholesaleMinQty && product.wholesalePrice ? (
                          <div className="text-[11px] font-semibold text-indigo-700 font-mono tabular-nums">
                            Mayorista x{product.wholesaleMinQty}+ u.: {formatCurrency(product.wholesalePrice, currency)} c/u
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
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {product.description || 'Sin descripción cargada.'}
                        </p>

                        {/* Per-Variant Stock Strip OR Single Product Inline Stock Control */}
                        {productHasVar ? (
                          <div className="pt-1 space-y-1.5">
                            <div className="text-[10px] font-bold text-slate-500">
                              Variantes ({product.variants!.length}) · Stock propio:
                            </div>
                            <div className="space-y-1">
                              {product.variants!.map((v) => {
                                const vStock = getVariantStock(v);
                                const vOut = vStock !== null && vStock <= 0;
                                return (
                                  <div
                                    key={v.id}
                                    className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                                  >
                                    <span
                                      className={`font-bold truncate ${
                                        vOut ? 'text-rose-700' : 'text-slate-800'
                                      }`}
                                    >
                                      {v.label}
                                      {v.sku ? ` · ${v.sku}` : ''}
                                    </span>
                                    {vStock !== null ? (
                                      <div className="inline-flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleQuickUpdateVariantStock(
                                              product,
                                              v.id,
                                              Math.max(0, vStock - 1)
                                            )
                                          }
                                          className="w-5 h-5 rounded bg-white border border-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                        >
                                          <Minus className="w-2.5 h-2.5" />
                                        </button>
                                        <span
                                          className={`w-8 text-center font-mono tabular-nums font-bold ${
                                            vOut ? 'text-rose-700' : 'text-slate-900'
                                          }`}
                                        >
                                          {vStock}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleQuickUpdateVariantStock(product, v.id, vStock + 1)
                                          }
                                          className="w-5 h-5 rounded bg-white border border-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                                        >
                                          <Plus className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleQuickUpdateVariantStock(product, v.id, 0)}
                                        className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer shrink-0"
                                      >
                                        Libre
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                            {stockQty !== null ? (
                              <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleQuickUpdateStock(product, Math.max(0, stockQty - 1))
                                  }
                                  title="Restar 1 unidad de stock"
                                  className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="px-2 text-[11px] font-mono tabular-nums font-bold text-slate-900">
                                  {stockQty} u.
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleQuickUpdateStock(product, stockQty + 1)}
                                  title="Sumar 1 unidad de stock"
                                  className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                                {stockQty > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickUpdateStock(product, 0)}
                                    title="Marcar sin stock (0 u.)"
                                    className="px-1.5 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                                  >
                                    0
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleQuickUpdateStock(product, undefined)}
                                  title="Pasar a stock libre (sin límite)"
                                  className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800 rounded cursor-pointer"
                                >
                                  Libre
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => openEditProductModal(product)}
                                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                                >
                                  Cargar cantidad
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickUpdateStock(product, 0)}
                                  className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold cursor-pointer"
                                >
                                  Marcar sin stock
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {waitingAlerts > 0 && (
                          <button
                            type="button"
                            onClick={() => setSubTab('avisos_stock')}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold hover:bg-amber-100 cursor-pointer"
                          >
                            <Bell className="w-3 h-3" />
                            <span>
                              {waitingAlerts} esperando aviso{!isOutOfStock ? ' (¡Ya hay stock!)' : ''}
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-slate-100 space-y-2">
                        {isQuickEditingPrice ? (
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 text-[11px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickPriceMode('fixed');
                                    setQuickPriceInput(String(product.price));
                                  }}
                                  className={`px-2 py-1 rounded-md cursor-pointer ${
                                    quickPriceMode === 'fixed'
                                      ? 'bg-white text-slate-900 shadow-2xs'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  $ Valor nuevo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickPriceMode('percent');
                                    setQuickPriceInput('10');
                                  }}
                                  className={`px-2 py-1 rounded-md cursor-pointer ${
                                    quickPriceMode === 'percent'
                                      ? 'bg-white text-slate-900 shadow-2xs'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  % Porcentaje
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setQuickPriceProductId(null)}
                                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {quickPriceMode === 'percent' && (
                              <div className="flex items-center gap-1">
                                {[5, 10, 15, 20, -10].map((p) => (
                                  <button
                                    key={p}
                                    type="button"
                                    onClick={() => setQuickPriceInput(String(p))}
                                    className="px-1.5 py-0.5 rounded bg-white border border-slate-200 hover:border-[#0B1933] text-[10px] font-mono font-bold text-slate-700 cursor-pointer"
                                  >
                                    {p > 0 ? `+${p}%` : `${p}%`}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-1.5">
                              <input
                                type="number" inputMode="decimal"
                                step="0.01"
                                autoFocus
                                value={quickPriceInput}
                                onChange={(e) => setQuickPriceInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveQuickProductPrice(product);
                                  } else if (e.key === 'Escape') {
                                    setQuickPriceProductId(null);
                                  }
                                }}
                                placeholder={
                                  quickPriceMode === 'fixed' ? 'Nuevo valor...' : 'Ej. 15 ó -10'
                                }
                                className="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveQuickProductPrice(product)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer shrink-0"
                              >
                                Aplicar
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600">
                              <span className="font-mono tabular-nums font-semibold">
                                {(() => {
                                  const v = Number(String(quickPriceInput).replace(',', '.'));
                                  if (!Number.isFinite(v)) return 'Ingresá un número';
                                  if (quickPriceMode === 'fixed') {
                                    const diffPct =
                                      product.price > 0
                                        ? Math.round(((v - product.price) / product.price) * 100)
                                        : 0;
                                    return `${formatCurrency(product.price, currency)} → ${formatCurrency(
                                      Math.max(0, v),
                                      currency
                                    )} (${diffPct >= 0 ? `+${diffPct}%` : `${diffPct}%`})`;
                                  }
                                  const res = applyPercentagePriceAdjustment(product, v).price;
                                  return `${formatCurrency(product.price, currency)} → ${formatCurrency(res, currency)}`;
                                })()}
                              </span>
                            </div>

                            {(productHasVar || (product.wholesalePrice ?? 0) > 0) && (
                              <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={quickPriceScaleExtras}
                                  onChange={(e) => setQuickPriceScaleExtras(e.target.checked)}
                                  className="rounded border-slate-300"
                                />
                                <span>Ajustar también mayorista/variantes</span>
                              </label>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                                {formatCurrency(product.price, currency)}
                              </span>
                              <button
                                type="button"
                                onClick={() => openQuickPriceEditor(product, 'fixed')}
                                title="Editar precio rápido ($ valor nuevo o % porcentaje)"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-700 cursor-pointer shrink-0"
                              >
                                <DollarSign className="w-3 h-3 text-[#0B1933]" />
                                <span>/ %</span>
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleToggleProductAvailability(product.id)}
                                title={product.available ? 'Ocultar del catálogo' : 'Mostrar en catálogo'}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                {product.available ? (
                                  <Eye className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <EyeOff className="w-4 h-4 text-slate-400" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditProductModal(product)}
                                title="Editar producto y stock"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#0B1933] hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(product)}
                                title="Eliminar producto"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: PEDIDOS RECIBIDOS (ENVÍOS Y RETIROS) */}
      {subTab === 'pedidos' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Pedidos Registrados desde el Catálogo Online
              </h3>
              <p className="text-xs text-slate-500">
                Además de llegarte al WhatsApp, cada pedido queda guardado aquí para pasarlo a boleta, enviarlo o avisar retiro y cobrar por WhatsApp.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={orderSoundOn}
                onChange={(e) => {
                  setOrderSoundOn(e.target.checked);
                  setNewOrderSoundEnabled(e.target.checked);
                  if (e.target.checked) playNewOrderChime();
                }}
                className="rounded border-slate-300"
              />
              Sonido al entrar un pedido
            </label>
            {onRefreshOrders && (
              <button
                type="button"
                disabled={isRefreshingOrders}
                onClick={async () => {
                  setIsRefreshingOrders(true);
                  try {
                    await onRefreshOrders();
                  } finally {
                    setIsRefreshingOrders(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingOrders ? 'animate-spin' : ''}`} />
                <span>Actualizar pedidos</span>
              </button>
            )}
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Todavía no ingresaron pedidos desde el enlace público de tu catálogo.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Filtros por estado + búsqueda */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar pedidos por estado">
                  {ORDER_STATUS_FILTERS.map((f) => {
                    const count = f.match ? orders.filter((o) => f.match!(o)).length : orders.length;
                    const active = orderStatusFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setOrderStatusFilter(f.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          active
                            ? 'bg-[#0B1933] text-white border-[#0B1933]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {f.label} <span className={`tabular-nums ${active ? 'text-slate-300' : 'text-slate-400'}`}>({count})</span>
                      </button>
                    );
                  })}
                </div>
                <div className="relative lg:ml-auto lg:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="search"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Buscar cliente, teléfono o N.º"
                    aria-label="Buscar pedidos"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                  />
                </div>
              </div>

              {visibleOrders.length === 0 && (
                <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  No hay pedidos con ese filtro.
                </div>
              )}

              {visibleOrders.map((order) => {
                const isDelivery = order.deliveryMethod === 'envio';
                const activePaymentKey =
                  order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
                const cur = order.currencySymbol || currency;
                const isClosed = order.status === 'cancelado' || order.status === 'devuelto';
                const itemsSubtotal = order.items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
                const discounts: Array<{ label: string; amount: number }> = [
                  { label: 'Ahorro mayorista', amount: Number(order.wholesaleSavings) || 0 },
                  { label: `Cupón ${order.couponCode || ''}`.trim(), amount: Number(order.couponDiscountAmount) || 0 },
                  { label: `Bonificación por medio de pago (${order.paymentMethodDiscountPercent || 0}%)`, amount: Number(order.paymentMethodDiscountAmount) || 0 },
                  { label: 'Descuento por puntos', amount: Number(order.loyaltyDiscountAmount) || 0 },
                  { label: `Gift card ${order.giftCardCode || ''}`.trim(), amount: Number(order.giftCardDiscountAmount) || 0 },
                  { label: 'Saldo a favor usado', amount: Number(order.storeCreditUsedAmount) || 0 },
                ].filter((d) => d.amount > 0);
                const finalTotal =
                  order.status === 'devuelto'
                    ? 0
                    : Math.max(0, (Number(order.totalAmount) || 0) - (Number(order.returnedAmount) || 0));
                const statusInfo = getOrderStatusInfo(order.status, isDelivery);
                const canConfirmPayment =
                  order.paymentStatus !== 'acreditado' &&
                  !isClosed &&
                  Boolean(
                    order.transferReceiptImageUrl ||
                      activePaymentKey === 'transferencia' ||
                      activePaymentKey === 'mercadopago_dinero_cuenta' ||
                      activePaymentKey === 'link_pago'
                  );
                const isMenuOpen = openOrderMenuId === order.id;
                const menuActions: Array<{ key: string; label: string; onClick: () => void; disabled?: boolean }> = [];
                if (!isClosed && order.customerPhone) {
                  menuActions.push({ key: 'wa-armando', label: 'Avisar por WhatsApp: estamos armando tu pedido', onClick: () => void handleSendOrderProcessWhatsApp(order, 'en_proceso_armando') });
                  menuActions.push({ key: 'wa-cobrar', label: 'Cobrar por WhatsApp (alias / link)', onClick: () => handleWhatsAppCustomerCollectPayment(order) });
                  menuActions.push({ key: 'wa-comprobante', label: 'Enviar comprobante por WhatsApp', onClick: () => handleWhatsAppCustomerReady(order) });
                }
                menuActions.push({
                  key: 'despacho',
                  label: order.dispatchReceiptNumber ? 'Ver comprobante de despacho' : 'Despachar y generar comprobante',
                  onClick: () => handleDispatchAndOpenReceipt(order),
                });
                if (onBillOrder) {
                  menuActions.push({
                    key: 'boleta',
                    label: order.linkedBoletaNumber ? `Ya tiene la boleta #${order.linkedBoletaNumber}` : 'Generar boleta',
                    onClick: () => onBillOrder(order),
                    disabled: Boolean(order.linkedBoletaNumber),
                  });
                }
                if (onOpenReturnModal && !isClosed) {
                  menuActions.push({ key: 'devolucion', label: 'Cambio / devolución', onClick: () => onOpenReturnModal(order) });
                }

                return (
                  <article key={order.id} className="border border-slate-200 rounded-xl bg-white shadow-xs">
                    {/* Encabezado: número, fecha, estado y total */}
                    <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 rounded-t-xl">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">#{order.orderNumber}</span>
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${statusInfo.className}`}>
                            {statusInfo.label}
                          </span>
                          {order.linkedBoletaNumber && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                              Boleta #{order.linkedBoletaNumber}
                            </span>
                          )}
                          {order.dispatchReceiptNumber && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200 font-mono">
                              Comprobante {order.dispatchReceiptNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
                            : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-semibold text-slate-500">Total</div>
                        <div className="text-lg font-black font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {formatCurrency(finalTotal, cur)}
                        </div>
                      </div>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
                      {/* Cliente y entrega */}
                      <section className="space-y-2 text-xs" aria-label="Cliente y entrega">
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Cliente</h4>
                        <div className="text-sm font-bold text-slate-900 break-words">{order.customerName}</div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-slate-700">
                          {order.customerPhone && (
                            <>
                              <dt className="text-slate-500">Teléfono</dt>
                              <dd className="font-mono tabular-nums break-all">{order.customerPhone}</dd>
                            </>
                          )}
                          {order.customerDni && (
                            <>
                              <dt className="text-slate-500">DNI</dt>
                              <dd className="font-mono tabular-nums">{order.customerDni}</dd>
                            </>
                          )}
                          <dt className="text-slate-500">Entrega</dt>
                          <dd className="font-semibold inline-flex items-center gap-1">
                            {isDelivery ? <Truck className="w-3.5 h-3.5 text-indigo-600" /> : <Store className="w-3.5 h-3.5 text-slate-500" />}
                            {isDelivery ? 'Envío a domicilio' : 'Retiro en tienda'}
                          </dd>
                          {isDelivery && order.deliveryAddress && (
                            <>
                              <dt className="text-slate-500">Dirección</dt>
                              <dd className="break-words">{order.deliveryAddress}</dd>
                            </>
                          )}
                          {order.preferredPickupWindow && (
                            <>
                              <dt className="text-slate-500">{isDelivery ? 'Horario' : 'Retira'}</dt>
                              <dd className="break-words">{order.preferredPickupWindow}</dd>
                            </>
                          )}
                        </dl>
                        {(order.customerSpecificRequest || order.notes) && (
                          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-slate-800">
                            <div className="text-[11px] font-bold text-amber-900">Observaciones del cliente</div>
                            <div className="break-words">{order.customerSpecificRequest || order.notes}</div>
                          </div>
                        )}
                      </section>

                      {/* Productos */}
                      <section className="lg:col-span-2 space-y-3" aria-label="Productos del pedido">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            Productos ({order.items.reduce((a, it) => a + (Number(it.quantity) || 0), 0)} u.)
                          </h4>
                          <button
                            type="button"
                            onClick={() => setSelectedOrderForDetail(order)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B1933] hover:underline cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ver fotos y códigos
                          </button>
                        </div>
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-500 text-[11px]">
                              <tr>
                                <th className="text-left font-semibold px-3 py-2">Producto</th>
                                <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">Cant.</th>
                                <th className="text-right font-semibold px-3 py-2 hidden sm:table-cell">Precio</th>
                                <th className="text-right font-semibold px-3 py-2">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {order.items.map((it, i) => {
                                const matched =
                                  productMap.byId.get(it.productId) ||
                                  productMap.byName.get(it.productName.trim().toLowerCase());
                                const thumb = matched?.imageUrl || it.imageUrl;
                                const skuCode = (it.sku || matched?.sku || '').trim();
                                return (
                                  <tr key={`${order.id}-${i}`} className="align-top">
                                    <td className="px-3 py-2">
                                      <div className="flex items-start gap-2.5">
                                        {thumb ? (
                                          <img
                                            src={thumb}
                                            alt={it.productName}
                                            referrerPolicy="no-referrer"
                                            className="w-9 h-9 rounded-md object-cover border border-slate-200 bg-white shrink-0"
                                          />
                                        ) : (
                                          <div className="w-9 h-9 rounded-md border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 font-bold shrink-0">
                                            {(it.productName || '?').charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <div className="font-semibold text-slate-900 break-words">{it.productName}</div>
                                          {it.variantLabel && <div className="text-[11px] text-indigo-700 font-medium">{it.variantLabel}</div>}
                                          {skuCode && <div className="text-[11px] font-mono text-slate-500">Cód: {skuCode}</div>}
                                          <div className="sm:hidden text-[11px] text-slate-500 tabular-nums">
                                            {it.quantity} × {formatCurrency(it.unitPrice, cur)}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold tabular-nums hidden sm:table-cell">{it.quantity}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap hidden sm:table-cell">
                                      {formatCurrency(it.unitPrice, cur)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                      {formatCurrency(it.subtotal, cur)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <dl className="border-t border-slate-200 bg-slate-50/70 px-3 py-2 text-xs space-y-1">
                            <div className="flex justify-between gap-3">
                              <dt className="text-slate-500">Subtotal</dt>
                              <dd className="font-mono tabular-nums">{formatCurrency(order.subtotalBeforeDiscount || itemsSubtotal, cur)}</dd>
                            </div>
                            {discounts.map((d) => (
                              <div key={d.label} className="flex justify-between gap-3 text-emerald-700">
                                <dt>{d.label}</dt>
                                <dd className="font-mono tabular-nums">-{formatCurrency(d.amount, cur)}</dd>
                              </div>
                            ))}
                            {Number(order.returnedAmount || 0) > 0 && (
                              <div className="flex justify-between gap-3 text-rose-700">
                                <dt>Devolución{Number(order.returnedPointsDeducted || 0) > 0 ? ` (-${order.returnedPointsDeducted} pts)` : ''}</dt>
                                <dd className="font-mono tabular-nums">-{formatCurrency(order.returnedAmount || 0, cur)}</dd>
                              </div>
                            )}
                            <div className="flex justify-between gap-3 pt-1 border-t border-slate-200 text-sm font-bold text-slate-900">
                              <dt>Total</dt>
                              <dd className="font-mono tabular-nums">{formatCurrency(finalTotal, cur)}</dd>
                            </div>
                          </dl>
                        </div>

                        {/* Pago */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <label className="space-y-1">
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Medio de pago</span>
                            <select
                              value={activePaymentKey}
                              disabled={order.status === 'devuelto'}
                              onChange={(e) =>
                                handleUpdateOrderPaymentMethod(
                                  order.id,
                                  e.target.value as NonNullable<CatalogPickupOrder['confirmedPaymentMethod']>
                                )
                              }
                              className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer disabled:opacity-60"
                            >
                              <option value="acordar">A coordinar</option>
                              <option value="transferencia">Transferencia / alias</option>
                              <option value="mercadopago_dinero_cuenta">Mercado Pago (dinero en cuenta)</option>
                              <option value="link_pago">Link de pago / Mercado Pago</option>
                              <option value="efectivo">{isDelivery ? 'Efectivo contra entrega' : 'Efectivo en el local'}</option>
                              <option value="fiado">Cuenta corriente / fiado</option>
                            </select>
                          </label>
                          <div className="space-y-1">
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Estado del pago</span>
                            <div
                              className={`px-2.5 py-2 rounded-lg border font-semibold ${
                                order.paymentStatus === 'acreditado'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : order.paymentStatus === 'comprobante_en_revision'
                                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                                  : 'bg-amber-50 border-amber-200 text-amber-800'
                              }`}
                            >
                              {order.paymentStatus === 'acreditado'
                                ? 'Pago acreditado'
                                : order.paymentStatus === 'comprobante_en_revision'
                                ? 'Comprobante subido: revisalo'
                                : 'Pendiente de pago'}
                            </div>
                          </div>
                        </div>

                        {order.transferReceiptImageUrl && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedOrderForDetail(order)}
                              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-sky-200 hover:bg-sky-50/60 text-left cursor-pointer"
                              title="Ver el comprobante grande"
                            >
                              <img
                                src={order.transferReceiptImageUrl}
                                alt="Comprobante del cliente"
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded object-cover border border-slate-200 shrink-0"
                              />
                              <span className="text-[11px]">
                                <span className="font-bold text-slate-900 flex items-center gap-1">
                                  <FileCheck2 className="w-3 h-3 text-emerald-600" />
                                  Comprobante de transferencia
                                </span>
                                <span className="text-sky-700">
                                  Ver grande
                                  {order.transferOperationId || order.transferReference
                                    ? ` · Op: ${order.transferOperationId || order.transferReference}`
                                    : ''}
                                </span>
                              </span>
                            </button>
                            {order.status !== 'cancelado' && order.transferVerificationStatus !== 'verificado_auto' && (
                              <button
                                type="button"
                                disabled={verifyingOrderId === order.id}
                                onClick={() => void handleVerifyOrderTransferReceipt(order)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-60 text-white cursor-pointer"
                              >
                                {verifyingOrderId === order.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                                )}
                                {verifyingOrderId === order.id ? 'Verificando…' : 'Verificar comprobante'}
                              </button>
                            )}
                            {order.transferVerificationSummary && (
                              <div
                                className={`w-full px-2.5 py-1.5 rounded-lg text-[11px] border ${
                                  order.transferVerificationStatus === 'verificado_auto'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : order.transferVerificationStatus === 'duplicado' || order.transferVerificationStatus === 'rechazado'
                                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}
                              >
                                {order.transferVerificationSummary}
                              </div>
                            )}
                          </div>
                        )}

                        {order.status === 'cancelado' && order.stockRestoredAt && (
                          <div className="text-[11px] font-semibold text-emerald-700">
                            Stock reintegrado al catálogo ({new Date(order.stockRestoredAt).toLocaleString('es-AR')})
                          </div>
                        )}
                      </section>
                    </div>

                    {/* Acciones */}
                    <footer className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-slate-200">
                      <label className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-slate-600">Estado</span>
                        <select
                          value={order.status}
                          onChange={(e) => {
                            const nextSt = e.target.value as CatalogPickupOrder['status'];
                            if (nextSt === 'devuelto' && onOpenReturnModal) {
                              onOpenReturnModal(order);
                              return;
                            }
                            handleUpdateOrderStatus(order.id, nextSt);
                          }}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                        >
                          <option value="pendiente_retiro">Pendiente de armado</option>
                          <option value="listo_para_retirar">{isDelivery ? 'Listo para despachar' : 'Listo para retirar'}</option>
                          <option value="en_camino">En camino (envío)</option>
                          <option value="retirado">{isDelivery ? 'Entregado y pagado' : 'Retirado y pagado'}</option>
                          <option value="devuelto">Devuelto</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </label>

                      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                        {canConfirmPayment && (
                          <button
                            type="button"
                            onClick={() => handleConfirmOrderPayment(order)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            Confirmar pago
                          </button>
                        )}
                        {!isClosed && order.customerPhone && order.status !== 'retirado' && (
                          <button
                            type="button"
                            onClick={() => void handleSendOrderProcessWhatsApp(order, isDelivery ? 'en_camino' : 'listo_para_retirar')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            {isDelivery ? 'Avisar: va en camino' : 'Avisar: listo para retirar'}
                          </button>
                        )}
                        {!isClosed && order.status !== 'retirado' && (
                          <button
                            type="button"
                            onClick={() => handleMarkOrderPaidPickedUp(order)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isDelivery ? 'Entregado y pagado' : 'Retirado y pagado'}
                          </button>
                        )}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenOrderMenuId(isMenuOpen ? null : order.id)}
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            aria-label={`Más acciones del pedido #${order.orderNumber}`}
                            className={`inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                              isMenuOpen ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                            } text-slate-800`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                            Más
                          </button>
                          {isMenuOpen && (
                            <>
                              <div className="fixed inset-0 z-30" aria-hidden="true" onClick={() => setOpenOrderMenuId(null)} />
                              <div
                                role="menu"
                                className="absolute right-0 bottom-full mb-1 z-40 w-64 max-w-[85vw] py-1 rounded-lg border border-slate-200 bg-white shadow-xl"
                              >
                                {menuActions.map((a) => (
                                  <button
                                    key={a.key}
                                    type="button"
                                    role="menuitem"
                                    disabled={a.disabled}
                                    onClick={() => {
                                      setOpenOrderMenuId(null);
                                      a.onClick();
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:text-slate-400 disabled:cursor-default cursor-pointer"
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2B: AVISOS DE STOCK SOLICITADOS POR CLIENTES */}
      {subTab === 'avisos_stock' && isBasicWebPlan && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <Lock className="w-8 h-8 text-amber-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">
            Avisos de Stock y Seguimiento de Clientes · Exclusivo Plan 3 · Full
          </h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto">
            Tu Plan 2 · Página Web Básica incluye manejo de stock interno y tienda online básica, sin captura ni seguimiento de clientes.
          </p>
          <button
            type="button"
            onClick={() => requestPlanUpgrade('full_feature', 'Avisos de Stock por WhatsApp')}
            className="px-4 py-2 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
          >
            <Crown className="w-3.5 h-3.5 text-amber-300" />
            <span>Aumentar a Plan Full</span>
          </button>
        </div>
      )}

      {subTab === 'avisos_stock' && !isBasicWebPlan && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Clientes esperando aviso de reposición de stock
              </h3>
              <p className="text-xs text-slate-500">
                Cuando un producto figura Sin stock, los clientes pueden dejar su nombre y teléfono. Al reponer unidades, avisales en 1 clic por WhatsApp.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {restockedPendingAlerts.length > 0 && (
                <button
                  type="button"
                  disabled={isBatchNotifyingAlerts}
                  onClick={handleNotifyAllRestockedAlerts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white cursor-pointer whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>
                    {isBatchNotifyingAlerts
                      ? 'Enviando...'
                      : `Avisar ya disponibles (${restockedPendingAlerts.length})`}
                  </span>
                </button>
              )}
              {onRefreshStockAlerts && (
                <button
                  type="button"
                  disabled={isRefreshingAlerts}
                  onClick={async () => {
                    setIsRefreshingAlerts(true);
                    try {
                      await onRefreshStockAlerts();
                    } finally {
                      setIsRefreshingAlerts(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAlerts ? 'animate-spin' : ''}`} />
                  <span>Actualizar avisos</span>
                </button>
              )}
            </div>
          </div>

          {sortedStockAlerts.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-1.5">
              <Bell className="w-7 h-7 text-slate-300 mx-auto" />
              <div className="text-xs font-semibold text-slate-700">
                Todavía no hay solicitudes de aviso de stock
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Cuando marques un producto con stock 0, aparecerá como "Sin stock" en la página web y permitirá dejar nombre y teléfono.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedStockAlerts.map((alert) => {
                const liveProduct =
                  productMap.byId.get(alert.productId) ||
                  productMap.byName.get(alert.productName.trim().toLowerCase());
                const matchedVariant =
                  liveProduct && (alert.variantId || alert.variantLabel)
                    ? findMatchingVariant(liveProduct, alert.variantId, alert.variantLabel)
                    : undefined;
                const liveStock = matchedVariant
                  ? getVariantStock(matchedVariant)
                  : liveProduct
                  ? getProductSummaryStock(liveProduct)
                  : null;
                const isRestocked = Boolean(
                  liveProduct?.available &&
                    (matchedVariant
                      ? liveStock === null || liveStock > 0
                      : !isProductFullyOutOfStock(liveProduct))
                );

                return (
                  <div
                    key={alert.id}
                    className={`border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                      alert.status === 'pending' && isRestocked
                        ? 'border-emerald-300 bg-emerald-50/50'
                        : alert.status === 'pending'
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                        {liveProduct?.imageUrl ? (
                          <img
                            src={liveProduct.imageUrl}
                            alt={alert.productName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900">
                            {alert.customerName}
                          </span>
                          <span className="text-xs font-mono font-semibold text-slate-600">
                            {alert.customerPhone}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                              alert.status === 'pending'
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {alert.status === 'pending' ? 'Pendiente de avisar' : 'Avisado'}
                          </span>
                        </div>

                        <div className="text-xs text-slate-700 flex items-center gap-2 flex-wrap">
                          <span>
                            Producto pedido: <strong>{alert.productName}</strong>
                            {alert.variantLabel ? ` (${alert.variantLabel})` : ''}
                            {alert.productSku ? ` (Cód: ${alert.productSku})` : ''}
                          </span>
                          <span
                            className={`font-mono tabular-nums font-semibold ${
                              isRestocked ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {!liveProduct
                              ? '· Producto eliminado'
                              : !liveProduct.available
                              ? '· Publicación pausada'
                              : liveStock === null
                              ? '· Ya disponible (Stock libre)'
                              : liveStock > 0
                              ? `· ¡Ya hay stock! (${liveStock} u.)`
                              : '· Sigue sin stock (0 u.)'}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500">
                          Solicitado: {new Date(alert.createdAt).toLocaleString('es-AR')}
                          {alert.notifiedAt
                            ? ` · Avisado: ${new Date(alert.notifiedAt).toLocaleString('es-AR')}`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {liveProduct && !isRestocked && (
                        <button
                          type="button"
                          onClick={() => openEditProductModal(liveProduct)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Cargar stock</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleNotifyStockAlertWhatsApp(alert)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Avisar por WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStockAlertStatus(alert)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          {alert.status === 'pending' ? 'Marcar avisado' : 'Volver a pendiente'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteStockAlert(alert.id)}
                        title="Eliminar solicitud"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2C: CLUB DE PROMOS Y DESCUENTOS (SUSCRIPTORES) */}
      {subTab === 'club_promos' && isBasicWebPlan && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <Lock className="w-8 h-8 text-amber-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-900">
            SuperClub y Club de Promos · Exclusivo Plan 3 · Full
          </h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto">
            En Plan 2 la página web funciona sin SuperClub, suscripciones promocionales ni descuentos. Ampliá a Plan 3 · Full para habilitarlo.
          </p>
          <button
            type="button"
            onClick={() => requestPlanUpgrade('full_feature', 'SuperClub y Promociones')}
            className="px-4 py-2 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
          >
            <Crown className="w-3.5 h-3.5 text-amber-300" />
            <span>Aumentar a Plan Full</span>
          </button>
        </div>
      )}

      {subTab === 'club_promos' && !isBasicWebPlan && (
        <div className="space-y-4">
          {/* Store Toggle Card: Habilitar / Deshabilitar Club de Promos y Descuentos */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-600" />
                <span>Club de Promos y Descuentos en tu tienda web</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {settings.enablePromoClub !== false
                  ? 'Habilitado: tus clientes pueden dejar sus datos para recibir promos, cupones y saludos de cumpleaños.'
                  : 'Deshabilitado: el formulario de suscripción al Club de Promos no se muestra en tu catálogo web.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextEnabled = settings.enablePromoClub === false;
                const updated: OnlineCatalogSettings = {
                  ...settings,
                  enablePromoClub: nextEnabled,
                  updatedAt: new Date().toISOString(),
                };
                setDraftSettings((prev) => ({ ...prev, enablePromoClub: nextEnabled }));
                onSaveSettings(updated);
                showToast(
                  nextEnabled
                    ? 'Club de Promos y Descuentos habilitado en tu tienda web.'
                    : 'Club de Promos y Descuentos deshabilitado en tu tienda web.'
                );
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors ${
                settings.enablePromoClub !== false
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-[#0B1933] text-white hover:bg-[#13264A]'
              }`}
            >
              {settings.enablePromoClub !== false
                ? 'Habilitado · Clic para desactivar'
                : 'Desactivado · Clic para habilitar'}
            </button>
          </div>

          {/* Birthday Automation Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Cake className="w-4 h-4 text-amber-600" />
                  <span>
                    Cumpleaños del Club (Hoy y próximos 7 días:{' '}
                    {upcomingBirthdays.length})
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detectamos automáticamente los suscriptores que cumplen años hoy o esta semana para enviarles su saludo y cupón regalo por WhatsApp.
                </p>
              </div>
              {upcomingBirthdays.length > 0 && (
                <button
                  type="button"
                  disabled={isSendingBirthdayBatch}
                  onClick={handleSendAllPendingBirthdays}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-60 text-white cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSendingBirthdayBatch
                      ? 'Enviando saludos...'
                      : 'Saludar cumpleañeros por WhatsApp'}
                  </span>
                </button>
              )}
            </div>

            {upcomingBirthdays.length === 0 ? (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                No hay suscriptores que cumplan años hoy ni en los próximos 7 días (
                <strong className="font-mono tabular-nums">
                  {promoSubscribers.filter((s) => Boolean(s.birthDate)).length}
                </strong>{' '}
                suscriptor(es) con fecha de cumpleaños cargada).
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Cupón regalo para adjuntar al saludo (opcional)
                    </label>
                    <select
                      value={birthdayCouponCodeDraft}
                      onChange={(e) => setBirthdayCouponCodeDraft(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    >
                      <option value="">Sin cupón adjunto</option>
                      {(settings.coupons || [])
                        .filter((c) => c.active !== false)
                        .map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} (
                            {c.discountType === 'percent'
                              ? `${c.value}% OFF`
                              : `${formatCurrency(c.value, currency)} OFF`}
                            )
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Mensaje personalizado (opcional)
                    </label>
                    <input
                      type="text"
                      value={birthdayCustomMessageDraft}
                      onChange={(e) => setBirthdayCustomMessageDraft(e.target.value)}
                      placeholder="¡Feliz cumpleaños! Te regalamos un beneficio especial esta semana..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {upcomingBirthdays.map((entry) => {
                    const sub = entry.subscriber;
                    const greetedThisYear = sub.lastBirthdayGreetingYear === currentYear;
                    return (
                      <div
                        key={sub.id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900">{sub.name}</span>
                            <span className="text-xs font-mono text-slate-600">{sub.phone}</span>
                            <span
                              className={`text-[11px] font-bold ${
                                entry.isToday ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {entry.isToday
                                ? `Cumple HOY (${entry.formattedDayMonth})`
                                : entry.daysUntil === 1
                                ? `Cumple mañana (${entry.formattedDayMonth})`
                                : `En ${entry.daysUntil} días (${entry.formattedDayMonth})`}
                            </span>
                            {greetedThisYear && (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                · Saludado {currentYear}
                              </span>
                            )}
                          </div>
                          {sub.preferredCategory && (
                            <div className="text-[11px] text-slate-500">
                              Categoría favorita: {sub.preferredCategory}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleSendBirthdayGreeting(entry)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 ${
                            greetedThisYear
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{greetedThisYear ? 'Volver a saludar WA' : 'Enviar regalo WA'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Gift className="w-4 h-4 text-emerald-600" />
                  <span>Suscriptores para Promos y Descuentos ({promoSubscribers.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clientes que dejaron sus datos en la web o al finalizar un pedido para recibir novedades, promos y cupones.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {activePromoSubscribers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportPromoSubscribersCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar CSV</span>
                  </button>
                )}
                {onRefreshPromoSubscribers && (
                  <button
                    type="button"
                    disabled={isRefreshingPromos}
                    onClick={async () => {
                      setIsRefreshingPromos(true);
                      try {
                        await onRefreshPromoSubscribers();
                      } finally {
                        setIsRefreshingPromos(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPromos ? 'animate-spin' : ''}`} />
                    <span>Actualizar lista</span>
                  </button>
                )}
              </div>
            </div>

            {/* Broadcaster Composer */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-900">
                Armar envío de promo / cupón por WhatsApp
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Filtrar por categoría de interés
                  </label>
                  <select
                    value={promoCategoryFilter}
                    onChange={(e) => setPromoCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  >
                    <option value="Todas">Todas las categorías ({promoSubscribers.length})</option>
                    {activeRubroFilters.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Adjuntar cupón activo (opcional)
                  </label>
                  <select
                    value={promoCouponCodeDraft}
                    onChange={(e) => setPromoCouponCodeDraft(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  >
                    <option value="">Sin cupón adjunto</option>
                    {(settings.coupons || [])
                      .filter((c) => c.active !== false)
                      .map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} (
                          {c.discountType === 'percent'
                            ? `${c.value}% OFF`
                            : `${formatCurrency(c.value, currency)} OFF`}
                          )
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={activePromoSubscribers.length === 0 || isSendingBatchPromo}
                    onClick={handleBatchSendPromo}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {isSendingBatchPromo
                        ? 'Enviando promos...'
                        : `Enviar a los ${activePromoSubscribers.length} por WhatsApp`}
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  Texto de la promo o novedad
                </label>
                <textarea
                  rows={2}
                  value={promoMessageDraft}
                  onChange={(e) => setPromoMessageDraft(e.target.value)}
                  placeholder="Ej: ¡Entraron ingresos nuevos de temporada y tenés 15% OFF hasta el sábado comprando desde la web!"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>
            </div>

            {activePromoSubscribers.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-1.5">
                <Users className="w-7 h-7 text-slate-300 mx-auto" />
                <div className="text-xs font-semibold text-slate-700">
                  Todavía no hay suscriptores en este filtro
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Tus clientes pueden sumarse desde la sección "Club de Promos" en la página del catálogo o tildando la casilla al finalizar su compra.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {activePromoSubscribers.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/70"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">{sub.name}</span>
                        <span className="text-xs font-mono text-slate-600">{sub.phone}</span>
                        {sub.email && (
                          <span className="text-[11px] text-slate-500">{sub.email}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span>
                          {sub.source === 'checkout_opt_in'
                            ? 'Opt-in en compra'
                            : 'Formulario Club Web'}
                        </span>
                        {sub.preferredCategory && (
                          <span>· Interés: {sub.preferredCategory}</span>
                        )}
                        {sub.birthDate && <span>· Cumple: {sub.birthDate}</span>}
                        {sub.lastPromoSentAt && (
                          <span className="text-emerald-700 font-semibold">
                            · Última promo: {new Date(sub.lastPromoSentAt).toLocaleDateString('es-AR')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleSendPromoToSubscriber(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Enviar promo WA</span>
                      </button>
                      {onSavePromoSubscribers && (
                        <button
                          type="button"
                          onClick={() => {
                            onSavePromoSubscribers(
                              promoSubscribers.filter((s) => s.id !== sub.id)
                            );
                            showToast(`Suscriptor "${sub.name}" quitado de la lista.`);
                          }}
                          title="Eliminar suscriptor"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2C-BIS: CLIENTES WEB (PROGRAMA DE PUNTOS POR DNI) */}
      {subTab === 'clientes_web' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-700" />
                <span>Estado del Club de Puntos y Descuentos por DNI</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {settings.enableLoyaltyProgram
                  ? 'Activo en tu catálogo web: los compradores ingresan su DNI al entrar, suman puntos y desbloquean descuentos.'
                  : 'Desactivado en tu catálogo web: activalo cuando quieras ofrecer suma de puntos y descuentos por DNI.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextEnabled = !settings.enableLoyaltyProgram;
                const updated: OnlineCatalogSettings = {
                  ...settings,
                  enableLoyaltyProgram: nextEnabled,
                  loyaltyPointsPerUnit:
                    typeof settings.loyaltyPointsPerUnit === 'number'
                      ? settings.loyaltyPointsPerUnit
                      : 10,
                  loyaltyTiers:
                    settings.loyaltyTiers && settings.loyaltyTiers.length > 0
                      ? settings.loyaltyTiers
                      : getDefaultLoyaltyTiers(),
                  loyaltyRestrictRedeemMethods: settings.loyaltyRestrictRedeemMethods !== false,
                  updatedAt: new Date().toISOString(),
                };
                setDraftSettings((prev) => ({
                  ...prev,
                  enableLoyaltyProgram: nextEnabled,
                  loyaltyPointsPerUnit: updated.loyaltyPointsPerUnit,
                  loyaltyTiers: updated.loyaltyTiers,
                  loyaltyRestrictRedeemMethods: updated.loyaltyRestrictRedeemMethods,
                }));
                onSaveSettings(updated);
                showToast(
                  nextEnabled
                    ? 'Club de Descuentos / Puntos por DNI habilitado en tu catálogo web.'
                    : 'Club de Descuentos / Puntos por DNI deshabilitado.'
                );
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors ${
                settings.enableLoyaltyProgram
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-[#0B1933] text-white hover:bg-[#13264A]'
              }`}
            >
              {settings.enableLoyaltyProgram
                ? 'Habilitado · Clic para desactivar'
                : 'Desactivado · Clic para habilitar'}
            </button>
          </div>

          {planFeatureAccess && !planFeatureAccess.canAccessFullFeatures && (
            <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-950 space-y-0.5">
                <div className="font-bold flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-700" />
                  <span>Función exclusiva de Plan 3 · Full</span>
                </div>
                <p className="text-amber-900/90">
                  Tu cuenta está en <strong>Plan 2 · Con Página Web</strong>. Pasate a <strong>Plan 3 · Full</strong> para operar Clientes Web por DNI, Gift Cards QR, Carritos Abandonados y Club Promos sin límites.
                </p>
              </div>
              {onRequestUpgradePlan && (
                <button
                  type="button"
                  onClick={() => requestPlanUpgrade('full_feature', 'Clientes Web por DNI')}
                  className="px-3.5 py-2 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Cambiar a Plan Full
                </button>
              )}
            </div>
          )}
          {!isBasicWebPlan && (
            <WebLoyaltyClientsPanel
              loyaltyAccounts={loyaltyAccounts}
              orders={orders}
              products={products}
              settings={settings}
              currencySymbol={currency}
              catalogPublicUrl={publicUrl}
              onRefreshLoyaltyAccounts={onRefreshLoyaltyAccounts}
              showToast={showToast}
            />
          )}
        </div>
      )}

      {/* SUB-TAB: CARRITOS ABANDONADOS Y RECUPERO POR WHATSAPP (#1) */}
      {subTab === 'carritos_abandonados' && (
        <div className="space-y-4">
          {planFeatureAccess && !planFeatureAccess.canAccessFullFeatures && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-950 space-y-0.5">
                <div className="font-bold flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-700" />
                  <span>Recupero de Carritos Abandonados — Exclusivo Plan 3 · Full</span>
                </div>
                <p className="text-amber-900/90">
                  Pasate a <strong>Plan 3 · Full</strong> para activar el recupero automático de carritos abandonados por WhatsApp con link directo de recuperación.
                </p>
              </div>
              {onRequestUpgradePlan && (
                <button
                  type="button"
                  onClick={() => requestPlanUpgrade('full_feature', 'Carritos Abandonados')}
                  className="px-3.5 py-2 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Pasar a Plan Full
                </button>
              )}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-amber-600" />
                  <span>Carritos Abandonados para Recuperar por WhatsApp</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cuando un comprador carga su WhatsApp o DNI en el carrito web sin finalizar el pedido, se guarda acá para enviarle un recordatorio con link de reanudación en 1 clic.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  value={cartFilterScope}
                  onChange={(e) => setCartFilterScope(e.target.value as 'pending' | 'all')}
                  aria-label="Filtrar carritos abandonados"
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  <option value="pending">Pendientes y recordados</option>
                  <option value="all">Todos ({abandonedCarts.length})</option>
                </select>
                {onRefreshAbandonedCarts && (
                  <button
                    type="button"
                    disabled={isRefreshingCarts}
                    onClick={async () => {
                      setIsRefreshingCarts(true);
                      try {
                        await onRefreshAbandonedCarts();
                      } finally {
                        setIsRefreshingCarts(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingCarts ? 'animate-spin' : ''}`} />
                    <span>Actualizar</span>
                  </button>
                )}
              </div>
            </div>

            {Array.isArray(settings.coupons) && settings.coupons.filter((c) => c.active).length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700">
                  Cupón incentivo opcional para incluir en el WhatsApp:
                </span>
                <select
                  value={cartIncentiveCouponCode}
                  onChange={(e) => setCartIncentiveCouponCode(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                >
                  <option value="">Sin cupón extra</option>
                  {settings.coupons
                    .filter((c) => c.active)
                    .map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} ({c.discountType === 'percent' ? `${c.value}% OFF` : formatCurrency(c.value, currency)})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {(() => {
              const list = abandonedCarts.filter((c) =>
                cartFilterScope === 'pending'
                  ? c.status === 'abandoned' || c.status === 'reminded'
                  : true
              );
              if (list.length === 0) {
                return (
                  <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                    No hay carritos abandonados en este filtro. Cada cliente que ingrese su WhatsApp o DNI en la web sin confirmar la compra aparecerá acá automáticamente.
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  {list.map((cart) => {
                    const matchedCoupon = settings.coupons?.find(
                      (cp) => cp.active && cp.code.toUpperCase() === cartIncentiveCouponCode.toUpperCase()
                    );
                    const couponLabel = matchedCoupon
                      ? matchedCoupon.discountType === 'percent'
                        ? `${matchedCoupon.value}% OFF`
                        : `${formatCurrency(matchedCoupon.value, currency)} OFF`
                      : undefined;
                    const recoverLink = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}recover_cart=${encodeURIComponent(cart.id)}`;

                    const handleSendReminder = async () => {
                      if (!cart.customerPhone?.trim()) {
                        showToast('Este carrito no tiene número de WhatsApp cargado.');
                        return;
                      }
                      const msg = generateAbandonedCartRecoveryWhatsAppMessage({
                        customerName: cart.customerName,
                        storeName: settings.storeName || config.distributorName,
                        itemsSummary: cart.items.map(
                          (it) =>
                            `${it.quantity}× ${it.productName}${it.variantLabel ? ` (${it.variantLabel})` : ''}`
                        ),
                        totalAmount: cart.totalAmount,
                        currencySymbol: cart.currencySymbol || currency,
                        couponCode: matchedCoupon?.code,
                        couponDiscountLabel: couponLabel,
                        catalogUrl: recoverLink,
                      });
                      window.open(createWhatsAppUrl(cart.customerPhone, msg), '_blank', 'noopener,noreferrer');
                      const updated: CatalogAbandonedCart = {
                        ...cart,
                        status: cart.status === 'recovered' ? 'recovered' : 'reminded',
                        reminderSentAt: new Date().toISOString(),
                        reminderCount: (cart.reminderCount || 0) + 1,
                        updatedAt: new Date().toISOString(),
                      };
                      onSaveAbandonedCarts?.(abandonedCarts.map((c) => (c.id === cart.id ? updated : c)));
                      void upsertPublicAbandonedCartToSupabase(updated);
                      showToast(`Recordatorio por WhatsApp abierto para ${cart.customerName || cart.customerPhone}.`);
                    };

                    const handleMarkStatus = async (nextStatus: 'recovered' | 'discarded') => {
                      const updated: CatalogAbandonedCart = {
                        ...cart,
                        status: nextStatus,
                        updatedAt: new Date().toISOString(),
                      };
                      onSaveAbandonedCarts?.(abandonedCarts.map((c) => (c.id === cart.id ? updated : c)));
                      await upsertPublicAbandonedCartToSupabase(updated);
                      showToast(
                        nextStatus === 'recovered'
                          ? 'Carrito marcado como recuperado.'
                          : 'Carrito descartado.'
                      );
                    };

                    return (
                      <div
                        key={cart.id}
                        className="border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {cart.customerName || 'Visitante Web'}
                            </span>
                            {cart.customerPhone && (
                              <span className="font-mono text-xs text-slate-600">
                                {cart.customerPhone}
                              </span>
                            )}
                            {cart.customerDni && (
                              <span className="font-mono text-[11px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                                DNI {cart.customerDni}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                cart.status === 'recovered'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : cart.status === 'reminded'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : cart.status === 'discarded'
                                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {cart.status === 'recovered'
                                ? 'Recuperado'
                                : cart.status === 'reminded'
                                ? `Recordado (${cart.reminderCount || 1}×)`
                                : cart.status === 'discarded'
                                ? 'Descartado'
                                : 'Sin finalizar'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 space-y-0.5">
                            {cart.items.map((it, idx) => (
                              <div key={`${cart.id}-it-${idx}`}>
                                • <strong>{it.quantity}×</strong> {it.productName}
                                {it.variantLabel ? ` (${it.variantLabel})` : ''} —{' '}
                                <span className="font-mono">{formatCurrency(it.subtotal, cart.currencySymbol || currency)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Actualizado: {new Date(cart.updatedAt || cart.createdAt).toLocaleString('es-AR')}
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-2 shrink-0">
                          <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                            {formatCurrency(cart.totalAmount, cart.currencySymbol || currency)}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={!cart.customerPhone}
                              onClick={() => void handleSendReminder()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white cursor-pointer whitespace-nowrap"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Recuperar por WhatsApp</span>
                            </button>
                            {cart.status !== 'recovered' && (
                              <button
                                type="button"
                                onClick={() => void handleMarkStatus('recovered')}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 cursor-pointer"
                              >
                                Marcar recuperado
                              </button>
                            )}
                            {cart.status !== 'discarded' && cart.status !== 'recovered' && (
                              <button
                                type="button"
                                onClick={() => void handleMarkStatus('discarded')}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
                              >
                                Descartar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* SUB-TAB: GIFT CARDS Y VOUCHERS DIGITALES CON QR (#3) */}
      {subTab === 'gift_cards' && (
        <div className="space-y-4">
          {planFeatureAccess && !planFeatureAccess.canAccessFullFeatures && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-950 space-y-0.5">
                <div className="font-bold flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-700" />
                  <span>Gift Cards y Vouchers Digitales QR — Exclusivo Plan 3 · Full</span>
                </div>
                <p className="text-amber-900/90">
                  Pasate a <strong>Plan 3 · Full</strong> para emitir tarjetas de regalo prepagas con código y QR canjeables en tu catálogo o en el local.
                </p>
              </div>
              {onRequestUpgradePlan && (
                <button
                  type="button"
                  onClick={() => requestPlanUpgrade('full_feature', 'Gift Cards Digitales con QR')}
                  className="px-3.5 py-2 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Pasar a Plan Full
                </button>
              )}
            </div>
          )}

          {/* Create Gift Card Form */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const amt = Number(String(gcInitialAmount).replace(',', '.'));
              if (!Number.isFinite(amt) || amt <= 0) {
                showToast('Ingresá un monto válido mayor a 0 para la Gift Card.');
                return;
              }
              const generated = `GC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
              const cleanCode = normalizeGiftCardCode(gcCustomCode || generated);
              if (giftCards.some((g) => normalizeGiftCardCode(g.code) === cleanCode)) {
                showToast(`Ya existe una Gift Card con el código ${cleanCode}.`);
                return;
              }
              const nowIso = new Date().toISOString();
              const tenantId = tenant?.id || config.tenantId || 'default-tenant';
              const newCard: CatalogGiftCard = {
                id: `gc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                tenantId,
                code: cleanCode,
                initialAmount: amt,
                remainingBalance: amt,
                currencySymbol: currency,
                recipientName: gcRecipientName.trim() || undefined,
                recipientPhone: gcRecipientPhone.trim() || undefined,
                buyerName: gcBuyerName.trim() || undefined,
                buyerDni: normalizeDni(gcBuyerDni) || undefined,
                message: gcMessage.trim() || undefined,
                expiresAt: gcExpiresAt || undefined,
                status: 'active',
                history: [
                  {
                    id: `gcm-${Date.now()}`,
                    date: nowIso,
                    type: 'issued',
                    amountDelta: amt,
                    note: `Emitida por ${activeUserName || 'Administración'}`,
                  },
                ],
                createdAt: nowIso,
                updatedAt: nowIso,
              };
              const nextCards = [newCard, ...giftCards];
              onSaveGiftCards?.(nextCards);
              await upsertCatalogGiftCardToSupabase(newCard);
              setGcInitialAmount('');
              setGcCustomCode('');
              setGcRecipientName('');
              setGcRecipientPhone('');
              setGcBuyerName('');
              setGcBuyerDni('');
              setGcMessage('');
              setGcExpiresAt('');
              setSelectedGiftCardForQr(newCard);
              showToast(`Gift Card ${newCard.code} creada por ${formatCurrency(amt, currency)}.`);
            }}
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-indigo-700" />
                  <span>Emitir Nueva Gift Card / Voucher Digital con QR</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generá tarjetas de regalo prepagas con código único y QR para compartir por WhatsApp o imprimir en el local.
                </p>
              </div>
              {onRefreshGiftCards && (
                <button
                  type="button"
                  disabled={isRefreshingGiftCards}
                  onClick={async () => {
                    setIsRefreshingGiftCards(true);
                    try {
                      await onRefreshGiftCards();
                    } finally {
                      setIsRefreshingGiftCards(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingGiftCards ? 'animate-spin' : ''}`} />
                  <span>Actualizar</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Monto ({currency}) *</label>
                <input
                  type="number" inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  value={gcInitialAmount}
                  onChange={(e) => setGcInitialAmount(e.target.value)}
                  placeholder="Ej. 25000"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Código (opcional)</label>
                <input
                  type="text"
                  value={gcCustomCode}
                  onChange={(e) => setGcCustomCode(e.target.value.toUpperCase())}
                  placeholder="Auto: GC-XXXXXX"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono uppercase text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Para (Destinatario)</label>
                <input
                  type="text"
                  value={gcRecipientName}
                  onChange={(e) => setGcRecipientName(e.target.value)}
                  placeholder="Nombre del agasajado"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">WhatsApp Destinatario</label>
                <input
                  type="text"
                  value={gcRecipientPhone}
                  onChange={(e) => setGcRecipientPhone(e.target.value)}
                  placeholder="Ej. 1155551234"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Comprador (opcional)</label>
                <input
                  type="text"
                  value={gcBuyerName}
                  onChange={(e) => setGcBuyerName(e.target.value)}
                  placeholder="Quién la regala"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">DNI Comprador (opcional)</label>
                <input
                  type="text"
                  value={gcBuyerDni}
                  onChange={(e) => setGcBuyerDni(e.target.value)}
                  placeholder="Solo números"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Vencimiento (opcional)</label>
                <input
                  type="date"
                  value={gcExpiresAt}
                  onChange={(e) => setGcExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Dedicatoria / Mensaje</label>
                <input
                  type="text"
                  value={gcMessage}
                  onChange={(e) => setGcMessage(e.target.value)}
                  placeholder="¡Feliz cumple! Elegí lo que quieras"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Generar Gift Card con Código y QR</span>
              </button>
            </div>
          </form>

          {/* Existing Gift Cards List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-slate-900">
                Gift Cards Emitidas ({giftCards.length})
              </h4>
              <input
                type="search"
                value={gcSearchQuery}
                onChange={(e) => setGcSearchQuery(e.target.value)}
                placeholder="Buscar código, destinatario o comprador..."
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 sm:w-64"
              />
            </div>

            {(() => {
              const q = gcSearchQuery.trim().toLowerCase();
              const filtered = giftCards.filter(
                (g) =>
                  !q ||
                  g.code.toLowerCase().includes(q) ||
                  (g.recipientName || '').toLowerCase().includes(q) ||
                  (g.buyerName || '').toLowerCase().includes(q) ||
                  (g.buyerDni || '').includes(q)
              );
              if (filtered.length === 0) {
                return (
                  <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                    Todavía no emitiste Gift Cards digitales.
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filtered.map((card) => {
                    const cardCatalogUrl = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}gift_card=${encodeURIComponent(card.code)}`;
                    const handleShareWa = () => {
                      const msg = generateGiftCardWhatsAppMessage({
                        code: card.code,
                        amount: card.remainingBalance,
                        currencySymbol: card.currencySymbol || currency,
                        storeName: settings.storeName || config.distributorName,
                        recipientName: card.recipientName,
                        buyerName: card.buyerName,
                        message: card.message,
                        expiresAt: card.expiresAt,
                        catalogUrl: cardCatalogUrl,
                      });
                      window.open(
                        createWhatsAppUrl(card.recipientPhone || '', msg),
                        '_blank',
                        'noopener,noreferrer'
                      );
                    };

                    const handleToggleCancel = async () => {
                      const nextStatus: CatalogGiftCard['status'] =
                        card.status === 'cancelled'
                          ? card.remainingBalance > 0
                            ? 'active'
                            : 'redeemed'
                          : 'cancelled';
                      const updated: CatalogGiftCard = {
                        ...card,
                        status: nextStatus,
                        updatedAt: new Date().toISOString(),
                      };
                      onSaveGiftCards?.(giftCards.map((g) => (g.id === card.id ? updated : g)));
                      await upsertCatalogGiftCardToSupabase(updated);
                      showToast(
                        nextStatus === 'cancelled'
                          ? `Gift Card ${card.code} anulada.`
                          : `Gift Card ${card.code} reactivada.`
                      );
                    };

                    return (
                      <div
                        key={card.id}
                        className="border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3 bg-slate-50/50"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-black text-sm text-[#0B1933] bg-white border border-slate-200 px-2 py-0.5 rounded">
                              {card.code}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                card.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : card.status === 'redeemed'
                                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {card.status === 'active'
                                ? 'Activa'
                                : card.status === 'redeemed'
                                ? 'Saldo Agotado'
                                : 'Anulada'}
                            </span>
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-800">
                            Saldo disponible:{' '}
                            <strong className="text-emerald-700">
                              {formatCurrency(card.remainingBalance, card.currencySymbol || currency)}
                            </strong>{' '}
                            <span className="text-slate-500">
                              / {formatCurrency(card.initialAmount, card.currencySymbol || currency)}
                            </span>
                          </div>
                          {(card.recipientName || card.buyerName) && (
                            <div className="text-[11px] text-slate-600">
                              {card.recipientName ? `Para: ${card.recipientName}` : ''}
                              {card.recipientName && card.buyerName ? ' · ' : ''}
                              {card.buyerName ? `De: ${card.buyerName}` : ''}
                            </div>
                          )}
                          {card.expiresAt && (
                            <div className="text-[10px] font-mono text-slate-500">
                              Vence: {card.expiresAt}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setSelectedGiftCardForQr(card)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                            >
                              <QrCode className="w-3 h-3" />
                              <span>Ver / Imprimir QR</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleShareWa}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>Enviar WhatsApp</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleCancel()}
                              className="px-2 py-1 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                            >
                              {card.status === 'cancelled' ? 'Reactivar' : 'Anular'}
                            </button>
                          </div>
                        </div>

                        <div className="shrink-0 bg-white p-1.5 rounded-lg border border-slate-200">
                          <QrCodeSvg value={cardCatalogUrl} size={74} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* SUB-TAB 2D: ESTADÍSTICAS, RANKING DE VENTAS Y PUNTOS POR DNI */}
      {subTab === 'estadisticas' &&
        (() => {
          const nowDate = new Date();
          const todayStart = new Date(
            nowDate.getFullYear(),
            nowDate.getMonth(),
            nowDate.getDate()
          ).getTime();
          const cutoffMs =
            statsRange === 'today'
              ? todayStart
              : statsRange === '7d'
              ? todayStart - 6 * 24 * 60 * 60 * 1000
              : statsRange === '30d'
              ? todayStart - 29 * 24 * 60 * 60 * 1000
              : 0;

          const ordersInPeriod = orders.filter((o) => {
            if (!cutoffMs) return true;
            const ts = new Date(o.createdAt).getTime();
            return Number.isFinite(ts) && ts >= cutoffMs;
          });
          const activeOrders = ordersInPeriod.filter(
            (o) => o.status !== 'cancelado' && o.status !== 'devuelto'
          );
          const cancelledCount = ordersInPeriod.length - activeOrders.length;

          const getNetOrderAmount = (o: CatalogPickupOrder) =>
            Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.returnedAmount) || 0));

          const netRevenue = activeOrders.reduce((sum, o) => sum + getNetOrderAmount(o), 0);
          const collectedRevenue = activeOrders
            .filter((o) => o.paymentStatus === 'acreditado' || o.status === 'retirado')
            .reduce((sum, o) => sum + getNetOrderAmount(o), 0);
          const totalUnitsSold = activeOrders.reduce(
            (sum, o) =>
              sum + o.items.reduce((s, it) => s + Math.max(0, Number(it.quantity) || 0), 0),
            0
          );
          const avgTicket = activeOrders.length > 0 ? netRevenue / activeOrders.length : 0;
          const totalDiscountsGranted = activeOrders.reduce(
            (sum, o) =>
              sum +
              (Number(o.wholesaleSavings) || 0) +
              (Number(o.couponDiscountAmount) || 0) +
              (Number(o.giftCardDiscountAmount) || 0) +
              (Number(o.storeCreditUsedAmount) || 0) +
              (Number(o.paymentMethodDiscountAmount) || 0) +
              (Number(o.loyaltyDiscountAmount) || 0),
            0
          );

          // Breakdown by payment method
          const payBucketMap = new Map<string, { label: string; count: number; amount: number }>();
          activeOrders.forEach((o) => {
            const key = o.confirmedPaymentMethod || o.preferredPaymentMethod || 'acordar';
            const label =
              key === 'transferencia'
                ? 'Transferencia bancaria'
                : key === 'mercadopago_dinero_cuenta'
                ? 'Mercado Pago (Dinero en cuenta)'
                : key === 'link_pago'
                ? 'Mercado Pago / Tarjetas'
                : key === 'efectivo'
                ? 'Efectivo'
                : key === 'fiado'
                ? 'Cuenta Corriente / Fiado'
                : 'A coordinar WhatsApp';
            const cur = payBucketMap.get(label) || { label, count: 0, amount: 0 };
            cur.count += 1;
            cur.amount += Number(o.totalAmount) || 0;
            payBucketMap.set(label, cur);
          });
          const payBuckets = Array.from(payBucketMap.values()).sort((a, b) => b.amount - a.amount);

          // Top 10 selling products
          const productSalesMap = new Map<
            string,
            {
              key: string;
              productId: string;
              name: string;
              sku?: string;
              units: number;
              revenue: number;
              variantCounts: Record<string, number>;
            }
          >();
          activeOrders.forEach((o) => {
            o.items.forEach((it) => {
              const lookupKey = it.productId || it.productName.trim().toLowerCase();
              const matchedProd =
                productMap.byId.get(it.productId) ||
                productMap.byName.get(it.productName.trim().toLowerCase());
              const entry = productSalesMap.get(lookupKey) || {
                key: lookupKey,
                productId: it.productId,
                name: it.productName,
                sku: it.sku || matchedProd?.sku,
                units: 0,
                revenue: 0,
                variantCounts: {},
              };
              const qty = Math.max(0, Number(it.quantity) || 0);
              entry.units += qty;
              entry.revenue += Number(it.subtotal) || 0;
              if (it.variantLabel) {
                entry.variantCounts[it.variantLabel] =
                  (entry.variantCounts[it.variantLabel] || 0) + qty;
              }
              productSalesMap.set(lookupKey, entry);
            });
          });
          const topSellingProducts = Array.from(productSalesMap.values())
            .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
            .slice(0, 10);

          // Top restock demand from pending stock alerts
          const restockDemandMap = new Map<
            string,
            {
              productId: string;
              name: string;
              sku?: string;
              pendingCount: number;
              variantsWaiting: string[];
              liveProduct?: CatalogProduct;
            }
          >();
          stockAlerts
            .filter((a) => a.status === 'pending')
            .forEach((a) => {
              const key = a.productId || a.productName.trim().toLowerCase();
              const liveProduct =
                productMap.byId.get(a.productId) ||
                productMap.byName.get(a.productName.trim().toLowerCase());
              const entry = restockDemandMap.get(key) || {
                productId: a.productId,
                name: a.productName,
                sku: a.productSku || liveProduct?.sku,
                pendingCount: 0,
                variantsWaiting: [],
                liveProduct,
              };
              entry.pendingCount += 1;
              if (a.variantLabel && !entry.variantsWaiting.includes(a.variantLabel)) {
                entry.variantsWaiting.push(a.variantLabel);
              }
              restockDemandMap.set(key, entry);
            });
          const topRestockDemand = Array.from(restockDemandMap.values()).sort(
            (a, b) => b.pendingCount - a.pendingCount
          );

          const filteredLoyaltyAccounts = loyaltyAccounts.filter((acc) => {
            const q = loyaltySearchQuery.trim().toLowerCase();
            if (!q) return true;
            return (
              acc.dni.includes(q) ||
              (acc.customerName || '').toLowerCase().includes(q) ||
              (acc.customerPhone || '').toLowerCase().includes(q)
            );
          });

          const handleExportStatsCsv = () => {
            const headers = [
              'Ranking',
              'Producto',
              'SKU',
              'Unidades Vendidas',
              'Ingresos Brutos',
              'Variantes Populares',
            ];
            const lines = topSellingProducts.map((p, idx) => {
              const varStr = Object.entries(p.variantCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([lbl, cnt]) => `${lbl} (${cnt})`)
                .join(' | ');
              return [
                idx + 1,
                `"${p.name.replace(/"/g, '""')}"`,
                `"${(p.sku || '').replace(/"/g, '""')}"`,
                p.units,
                p.revenue.toFixed(2),
                `"${varStr.replace(/"/g, '""')}"`,
              ].join(',');
            });
            const summaryFooter = [
              '',
              `Periodo,${statsRange}`,
              `Pedidos Activos,${activeOrders.length}`,
              `Ingresos netos,${netRevenue.toFixed(2)}`,
              `Ticket Promedio,${avgTicket.toFixed(2)}`,
              `Unidades Vendidas,${totalUnitsSold}`,
              `Descuentos Otorgados,${totalDiscountsGranted.toFixed(2)}`,
            ];
            const body = [headers.join(','), ...lines, ...summaryFooter].join('\n');
            triggerCsvDownload(body, `estadisticas_catalogo_${statsRange}.csv`);
            showToast('Reporte CSV de estadísticas descargado.');
          };

          const handleManualLoyaltyAdjustment = (
            acc: CatalogLoyaltyAccount,
            delta: number
          ) => {
            if (!onSaveLoyaltyAccounts || !delta) return;
            const nowIso = new Date().toISOString();
            const nextBal = Math.max(0, acc.pointsBalance + delta);
            const appliedDelta = nextBal - acc.pointsBalance;
            const updated: CatalogLoyaltyAccount = {
              ...acc,
              pointsBalance: nextBal,
              totalPointsEarned:
                appliedDelta > 0 ? acc.totalPointsEarned + appliedDelta : acc.totalPointsEarned,
              totalPointsRedeemed:
                appliedDelta < 0
                  ? acc.totalPointsRedeemed + Math.abs(appliedDelta)
                  : acc.totalPointsRedeemed,
              history: [
                {
                  id: `lmov-adj-${Date.now()}`,
                  date: nowIso,
                  type: 'manual_adjustment' as const,
                  pointsDelta: appliedDelta,
                  note: `Ajuste manual desde panel (${appliedDelta >= 0 ? '+' : ''}${appliedDelta} pts)`,
                },
                ...(acc.history || []),
              ].slice(0, 40),
              updatedAt: nowIso,
            };
            onSaveLoyaltyAccounts(
              loyaltyAccounts.map((x) => (x.id === acc.id ? updated : x))
            );
            showToast(
              `Puntos de DNI ${acc.dni} actualizados (${nextBal} pts disponibles).`
            );
          };

          return (
            <div className="space-y-4">
              {/* Top Filter & Export Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-[#0B1933]" />
                    <span>Estadísticas y Ranking de Ventas del Catálogo Web</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Analizá los artículos más vendidos, medios de cobro elegidos, demanda de reposición y saldos de clientes por DNI.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {(
                    [
                      { id: 'today', label: 'Hoy' },
                      { id: '7d', label: '7 días' },
                      { id: '30d', label: '30 días' },
                      { id: 'all', label: 'Todo' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStatsRange(opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        statsRange === opt.id
                          ? 'bg-[#0B1933] text-white border-[#0B1933]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={handleExportStatsCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar CSV</span>
                  </button>
                </div>
              </div>

              {/* 4 KPI Strip (Clean hairline surface, tabular-nums) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Ingresos web netos
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {formatCurrency(netRevenue, currency)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    Cobrado / Retirado: {formatCurrency(collectedRevenue, currency)}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Pedidos & Ticket Promedio
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {activeOrders.length} pedidos
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    Promedio: {formatCurrency(avgTicket, currency)}
                    {cancelledCount > 0 ? ` · ${cancelledCount} cancelados` : ''}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Unidades & Ahorros Otorgados
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {totalUnitsSold} u.
                  </div>
                  <div className="text-[11px] text-emerald-700 font-mono tabular-nums font-semibold">
                    Dtos. totales: {formatCurrency(totalDiscountsGranted, currency)}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Demanda Sin Stock / Puntos
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {pendingStockAlertsCount} avisos
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {loyaltyAccounts.length} DNI activos en puntos
                  </div>
                </div>
              </div>

              {/* Payment Breakdown + Top 10 Products */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Medios de pago elegidos
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Participación por monto vendido en el período.
                    </p>
                  </div>

                  {payBuckets.length === 0 ? (
                    <div className="text-xs text-slate-500 py-6 text-center">
                      Sin pedidos en este rango de fechas.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {payBuckets.map((b) => {
                        const pct = netRevenue > 0 ? Math.round((b.amount / netRevenue) * 100) : 0;
                        return (
                          <div key={b.label} className="space-y-1">
                            <div className="flex items-center justify-between text-xs gap-2">
                              <span className="font-semibold text-slate-800 truncate">{b.label}</span>
                              <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                                {formatCurrency(b.amount, currency)} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-[#0B1933] rounded-full"
                                style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                              />
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {b.count} pedido{b.count === 1 ? '' : 's'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Top 10 Productos Más Vendidos
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Ordenados por volumen de unidades e ingresos acumulados.
                    </p>
                  </div>

                  {topSellingProducts.length === 0 ? (
                    <div className="text-xs text-slate-500 py-8 text-center">
                      Todavía no hay ventas registradas en el rango seleccionado.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Producto / SKU</th>
                            <th className="py-2.5 px-3">Variantes</th>
                            <th className="py-2.5 px-3 text-right">Unidades</th>
                            <th className="py-2.5 px-3 text-right">Ingresos</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {topSellingProducts.map((p, idx) => {
                            const topVarStr = Object.entries(p.variantCounts)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 2)
                              .map(([lbl, cnt]) => `${lbl} (${cnt})`)
                              .join(' · ');
                            return (
                              <tr key={p.key} className="hover:bg-slate-50/70">
                                <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-slate-500">
                                  {idx + 1}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-900">{p.name}</div>
                                  {p.sku && (
                                    <div className="text-[11px] font-mono text-slate-500">
                                      SKU: {p.sku}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-slate-600">
                                  {topVarStr || 'Estándar'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                                  {p.units}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                                  {formatCurrency(p.revenue, currency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Priority Restock Demand from Stock Alerts (Full only) */}
              {!isBasicWebPlan && topRestockDemand.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Artículos Sin Stock con Mayor Demanda de Clientes
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Productos con solicitudes activas de "Avisar cuando haya stock" para priorizar reposición.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubTab('avisos_stock')}
                      className="text-xs font-bold text-[#0B1933] hover:underline cursor-pointer"
                    >
                      Ver todos los avisos →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {topRestockDemand.slice(0, 6).map((item) => (
                      <div
                        key={item.productId || item.name}
                        className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono tabular-nums">
                            {item.pendingCount} cliente{item.pendingCount === 1 ? '' : 's'} esperando
                            {item.variantsWaiting.length > 0
                              ? ` · Talles: ${item.variantsWaiting.slice(0, 3).join(', ')}`
                              : ''}
                          </div>
                        </div>
                        {item.liveProduct && (
                          <button
                            type="button"
                            onClick={() => openEditProductModal(item.liveProduct!)}
                            className="px-2.5 py-1 rounded-lg bg-[#0B1933] hover:bg-[#13264A] text-white text-[11px] font-bold cursor-pointer shrink-0"
                          >
                            Reponer
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer DNI Loyalty Accounts Table (Full only) */}
              {!isBasicWebPlan && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Award className="w-4 h-4 text-emerald-700" />
                      <span>Clientes del Programa de Puntos por DNI ({loyaltyAccounts.length})</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {settings.enableLoyaltyProgram
                        ? `Programa activo: suma ${settings.loyaltyPointsPerUnit ?? 10} pts por prenda/unidad.`
                        : 'El programa de puntos está desactivado. Podés habilitarlo en "Tienda, Envíos y Cobros".'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={loyaltySearchQuery}
                        onChange={(e) => setLoyaltySearchQuery(e.target.value)}
                        placeholder="Buscar DNI o nombre..."
                        className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubTab('clientes_web')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Ver Ficha Clientes Web y Promos</span>
                    </button>
                    {onRefreshLoyaltyAccounts && (
                      <button
                        type="button"
                        disabled={isRefreshingLoyalty}
                        onClick={async () => {
                          setIsRefreshingLoyalty(true);
                          try {
                            await onRefreshLoyaltyAccounts();
                          } finally {
                            setIsRefreshingLoyalty(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingLoyalty ? 'animate-spin' : ''}`} />
                        <span>Actualizar DNI</span>
                      </button>
                    )}
                  </div>
                </div>

                {filteredLoyaltyAccounts.length === 0 ? (
                  <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                    {loyaltyAccounts.length === 0
                      ? 'Todavía ningún cliente registró compras con su DNI.'
                      : 'Ningún cliente coincide con esa búsqueda.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-3">DNI / Cliente</th>
                          <th className="py-2.5 px-3 text-right">Compras</th>
                          <th className="py-2.5 px-3 text-right">Puntos Disponibles</th>
                          <th className="py-2.5 px-3 text-right">Saldo a Favor</th>
                          <th className="py-2.5 px-3">Nivel Alcanzado</th>
                          <th className="py-2.5 px-3 text-right">Ajuste Rápido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLoyaltyAccounts.map((acc) => {
                          const { highestUnlocked, nextTier } = getEligibleLoyaltyTiers(
                            acc.pointsBalance,
                            settings.loyaltyTiers
                          );
                          return (
                            <tr key={acc.id} className="hover:bg-slate-50/70">
                              <td className="py-2.5 px-3">
                                <div className="font-mono font-bold text-slate-900">
                                  DNI {acc.dni}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {acc.customerName || 'Sin nombre'}
                                  {acc.customerPhone ? ` · ${acc.customerPhone}` : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                                {acc.ordersCount}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="font-mono tabular-nums font-bold text-[#0B1933]">
                                  {acc.pointsBalance} pts
                                </div>
                                <div className="text-[10px] font-mono tabular-nums text-slate-500">
                                  +{acc.totalPointsEarned} ganados · -{acc.totalPointsRedeemed} canjeados
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {Number(acc.storeCreditBalance || 0) > 0 ? (
                                  <span className="font-bold text-emerald-700">
                                    {formatCurrency(acc.storeCreditBalance || 0, currency)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-xs">
                                {highestUnlocked ? (
                                  <span className="font-bold text-emerald-700">
                                    Desbloqueó {highestUnlocked.discountPercent}% OFF
                                  </span>
                                ) : nextTier ? (
                                  <span className="text-slate-500">
                                    A {nextTier.minPoints - acc.pointsBalance} pts del {nextTier.discountPercent}% OFF
                                  </span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {onSaveLoyaltyAccounts && (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleManualLoyaltyAdjustment(acc, 10)}
                                      className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] cursor-pointer"
                                      title="Sumar 10 puntos manualmente"
                                    >
                                      +10
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleManualLoyaltyAdjustment(acc, 50)}
                                      className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono font-bold text-[11px] cursor-pointer"
                                      title="Sumar 50 puntos manualmente"
                                    >
                                      +50
                                    </button>
                                    <button
                                      type="button"
                                      disabled={acc.pointsBalance <= 0}
                                      onClick={() => handleManualLoyaltyAdjustment(acc, -10)}
                                      className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-mono font-bold text-[11px] cursor-pointer"
                                      title="Restar 10 puntos manualmente"
                                    >
                                      -10
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}
            </div>
          );
        })()}

      {/* SUB-TAB 3: CONFIGURACIÓN DE TIENDA, WHATSAPP Y RETIRO */}
      {subTab === 'configuracion' && (
        <form
          onSubmit={handleSaveSettingsSubmit}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 max-w-3xl"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Datos Públicos de tu Tienda y Punto de Retiro
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Esta información se mostrará a tus clientes cuando abran el catálogo online desde tu enlace.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Nombre comercial del catálogo
              </label>
              <input
                type="text"
                value={draftSettings.storeName || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, storeName: e.target.value }))
                }
                placeholder="Ej. Distribuidora Central"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                WhatsApp donde recibir los pedidos
              </label>
              <input
                type="text"
                value={draftSettings.whatsappPhone || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, whatsappPhone: e.target.value }))
                }
                placeholder="Ej. +54 9 11 1234-5678"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Descripción corta / bienvenida
              </label>
              <input
                type="text"
                value={draftSettings.tagline || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, tagline: e.target.value }))
                }
                placeholder="Ej. Elegí tus productos, envianos el pedido por WhatsApp y pasá a retirarlo."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Dirección de retiro</span>
              </label>
              <input
                type="text"
                value={draftSettings.pickupAddress || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, pickupAddress: e.target.value }))
                }
                placeholder="Ej. Av. San Martín 1450, Local 2"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Horarios para retirar</span>
              </label>
              <input
                type="text"
                value={draftSettings.pickupHours || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, pickupHours: e.target.value }))
                }
                placeholder="Ej. Lunes a Sábado de 9 a 19 hs"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Nombre amigable del enlace (opcional)
              </label>
              <input
                type="text"
                value={draftSettings.slug || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, slug: e.target.value }))
                }
                placeholder={config.tenantCode || 'ej-mi-distribuidora'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Nota sobre los pagos (opcional)
              </label>
              <input
                type="text"
                value={draftSettings.paymentNote || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, paymentNote: e.target.value }))
                }
                placeholder="Ej. Efectivo, transferencia o cuenta corriente"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="text-xs font-bold text-slate-800">
                Modalidades habilitadas en el carrito público
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftSettings.allowPickup !== false}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        allowPickup: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300"
                  />
                  <span>Permitir Retiro en tienda</span>
                </label>

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftSettings.allowDelivery !== false}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        allowDelivery: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300"
                  />
                  <span>Permitir Envío a domicilio</span>
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-slate-500" />
                  <span>Nota informativa para envíos a domicilio</span>
                </label>
                <input
                  type="text"
                  value={draftSettings.deliveryNote || ''}
                  onChange={(e) =>
                    setDraftSettings((prev) => ({ ...prev, deliveryNote: e.target.value }))
                  }
                  placeholder="Ej. Envíos en el día en zona centro. Te pasamos alias/link por WhatsApp para abonar."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
                />
              </div>
            </div>

            {/* Medios de pago que se ofrecen en la tienda */}
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-800">Medios de pago que ofrecés</div>
                <p className="text-[11px] text-slate-500">
                  El comprador solo ve los que marques. Tiene que haber al menos uno.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CATALOG_PAYMENT_OPTION_KEYS.map((key) => {
                  const isMp = key === 'mercadopago';
                  const disabled = isMp && !merchantMpAvailable;
                  const checked = !disabled && isPaymentOptionEnabled(draftSettings.paymentMethods, key);
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border bg-white text-xs ${
                        disabled ? 'opacity-60 cursor-not-allowed border-slate-200' : 'cursor-pointer border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={(e) =>
                          setDraftSettings((prev) => {
                            const base = prev.paymentMethods
                              ? { ...prev.paymentMethods }
                              : Object.fromEntries(
                                  CATALOG_PAYMENT_OPTION_KEYS.map((k) => [k, k === 'mercadopago' ? merchantMpAvailable : true])
                                );
                            return { ...prev, paymentMethods: { ...base, [key]: e.target.checked } };
                          })
                        }
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <span>
                        <span className="block font-semibold text-slate-800">{CATALOG_PAYMENT_OPTION_LABELS[key].title}</span>
                        <span className="block text-[11px] text-slate-500">
                          {disabled
                            ? 'Configurá tu token o link de Mercado Pago (más abajo, en Cobros) para ofrecerlo.'
                            : CATALOG_PAYMENT_OPTION_LABELS[key].hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Instrucciones de retiro para el cliente
              </label>
              <textarea
                rows={2}
                value={draftSettings.pickupInstructions || ''}
                onChange={(e) =>
                  setDraftSettings((prev) => ({ ...prev, pickupInstructions: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
              />
            </div>

            <div className="sm:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#0B1933]" />
                    <span>Rubro asignado y Filtros del Catálogo</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Rubro activo: <strong>{rubroPreset.label}</strong> (definido desde SuperGestión). Todos los productos se cargan en este rubro.
                  </p>
                </div>
                {onOpenEditBrand && (
                  <button
                    type="button"
                    onClick={onOpenEditBrand}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 cursor-pointer shrink-0 self-start sm:self-auto"
                  >
                    <Palette className="w-3.5 h-3.5 text-[#0B1933]" />
                    <span>Cambiar Logo del Sistema / Web</span>
                  </button>
                )}
              </div>

              {/* Primary Rubro Filters Editor */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700">
                  Filtros principales del rubro ({rubroPreset.shortLabel})
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {normalizeFilterList(draftSettings.rubroFilters).map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0B1933] text-white text-[11px] font-semibold"
                    >
                      <span>{f}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftSettings((prev) => ({
                            ...prev,
                            rubroFilters: (prev.rubroFilters || []).filter((x) => x !== f),
                          }))
                        }
                        className="hover:text-rose-200 cursor-pointer"
                        title={`Quitar ${f}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={settingsFilterInput}
                    onChange={(e) => setSettingsFilterInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = settingsFilterInput.trim();
                        if (!clean) return;
                        if (isBasicWebPlan) {
                          const combined = normalizeFilterList([
                            ...(draftSettings.rubroFilters || []),
                            ...(draftSettings.customSubfilters || []),
                            clean,
                          ]);
                          if (combined.length > PLAN_WEB_MAX_RUBROS) {
                            requestPlanUpgrade(
                              'limit_rubros',
                              `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
                              `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros en total. Para agregar "${clean}", ampliá a Plan 3 · Full.`
                            );
                            return;
                          }
                        }
                        setDraftSettings((prev) => ({
                          ...prev,
                          rubroFilters: normalizeFilterList([...(prev.rubroFilters || []), clean]),
                        }));
                        setSettingsFilterInput('');
                      }
                    }}
                    placeholder="Agregar filtro principal (ej. Niños, Hombres, Mujeres...)"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = settingsFilterInput.trim();
                      if (!clean) return;
                      if (isBasicWebPlan) {
                        const combined = normalizeFilterList([
                          ...(draftSettings.rubroFilters || []),
                          ...(draftSettings.customSubfilters || []),
                          clean,
                        ]);
                        if (combined.length > PLAN_WEB_MAX_RUBROS) {
                          requestPlanUpgrade(
                            'limit_rubros',
                            `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
                            `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros en total. Para agregar "${clean}", ampliá a Plan 3 · Full.`
                          );
                          return;
                        }
                      }
                      setDraftSettings((prev) => ({
                        ...prev,
                        rubroFilters: normalizeFilterList([...(prev.rubroFilters || []), clean]),
                      }));
                      setSettingsFilterInput('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white cursor-pointer whitespace-nowrap"
                  >
                    + Agregar filtro
                  </button>
                </div>
              </div>

              {/* Client Custom Subfilters Editor */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                <label className="text-[11px] font-bold text-slate-700">
                  Subfiltros personalizados
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {normalizeFilterList(draftSettings.customSubfilters).length === 0 ? (
                    <span className="text-[11px] text-slate-500">
                      Todavía no definiste subfiltros. Agregá los que necesites abajo.
                    </span>
                  ) : (
                    normalizeFilterList(draftSettings.customSubfilters).map((sf) => (
                      <span
                        key={sf}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-800 text-[11px] font-semibold"
                      >
                        <span>{sf}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftSettings((prev) => ({
                              ...prev,
                              customSubfilters: (prev.customSubfilters || []).filter(
                                (x) => x !== sf
                              ),
                            }))
                          }
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          title={`Quitar ${sf}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={settingsSubfilterInput}
                    onChange={(e) => setSettingsSubfilterInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = settingsSubfilterInput.trim();
                        if (!clean) return;
                        if (isBasicWebPlan) {
                          const combined = normalizeFilterList([
                            ...(draftSettings.rubroFilters || []),
                            ...(draftSettings.customSubfilters || []),
                            clean,
                          ]);
                          if (combined.length > PLAN_WEB_MAX_RUBROS) {
                            requestPlanUpgrade(
                              'limit_rubros',
                              `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
                              `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros en total. Para agregar "${clean}", ampliá a Plan 3 · Full.`
                            );
                            return;
                          }
                        }
                        setDraftSettings((prev) => ({
                          ...prev,
                          customSubfilters: normalizeFilterList([
                            ...(prev.customSubfilters || []),
                            clean,
                          ]),
                        }));
                        setSettingsSubfilterInput('');
                      }
                    }}
                    placeholder="Agregar subfiltro (ej. Remeras, Jeans, Invierno...)"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const clean = settingsSubfilterInput.trim();
                      if (!clean) return;
                      if (isBasicWebPlan) {
                        const combined = normalizeFilterList([
                          ...(draftSettings.rubroFilters || []),
                          ...(draftSettings.customSubfilters || []),
                          clean,
                        ]);
                        if (combined.length > PLAN_WEB_MAX_RUBROS) {
                          requestPlanUpgrade(
                            'limit_rubros',
                            `Límite de ${PLAN_WEB_MAX_RUBROS} rubros alcanzado`,
                            `Tu Plan 2 permite hasta ${PLAN_WEB_MAX_RUBROS} rubros/subfiltros en total. Para agregar "${clean}", ampliá a Plan 3 · Full.`
                          );
                          return;
                        }
                      }
                      setDraftSettings((prev) => ({
                        ...prev,
                        customSubfilters: normalizeFilterList([
                          ...(prev.customSubfilters || []),
                          clean,
                        ]),
                      }));
                      setSettingsSubfilterInput('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white cursor-pointer whitespace-nowrap"
                  >
                    + Agregar subfiltro
                  </button>
                </div>
              </div>
            </div>

            <div className="sm:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-[#009EE3]" />
                  <span>Cobros en tu Página Web: Alias para Transferencias y Mercado Pago</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cuando el cliente elija <strong>Transferencia</strong> en tu web verá estos datos para transferir y subir el comprobante. Si configurás Mercado Pago, podrá pagar con <strong>Dinero en cuenta</strong> desde ahí mismo.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Alias de transferencia *
                  </label>
                  <input
                    type="text"
                    value={draftMerchantPayment.merchantPaymentAlias}
                    onChange={(e) =>
                      setDraftMerchantPayment((prev) => ({
                        ...prev,
                        merchantPaymentAlias: e.target.value,
                      }))
                    }
                    placeholder="ej. mi.tienda.mp"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    CBU / CVU (opcional)
                  </label>
                  <input
                    type="text"
                    value={draftMerchantPayment.merchantPaymentCvu}
                    onChange={(e) =>
                      setDraftMerchantPayment((prev) => ({
                        ...prev,
                        merchantPaymentCvu: e.target.value,
                      }))
                    }
                    placeholder="00000031000..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Titular de la cuenta
                  </label>
                  <input
                    type="text"
                    value={draftMerchantPayment.merchantPaymentHolder}
                    onChange={(e) =>
                      setDraftMerchantPayment((prev) => ({
                        ...prev,
                        merchantPaymentHolder: e.target.value,
                      }))
                    }
                    placeholder="ej. Juan Pérez"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Banco o Billetera
                  </label>
                  <input
                    type="text"
                    value={draftMerchantPayment.merchantPaymentBank}
                    onChange={(e) =>
                      setDraftMerchantPayment((prev) => ({
                        ...prev,
                        merchantPaymentBank: e.target.value,
                      }))
                    }
                    placeholder="ej. Mercado Pago / Galicia"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Link fijo de Mercado Pago (opcional)
                  </label>
                  <input
                    type="url"
                    value={draftMerchantPayment.merchantMpCheckoutLink}
                    onChange={(e) =>
                      setDraftMerchantPayment((prev) => ({
                        ...prev,
                        merchantMpCheckoutLink: e.target.value,
                      }))
                    }
                    placeholder="https://link.mercadopago.com.ar/..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Access Token Checkout Pro MP (acreditación automática Dinero en cuenta)
                  </label>
                  <input
                    type="password"
                    value={draftMerchantPayment.merchantMpAccessToken}
                    onChange={(e) =>
                      setDraftMerchantPayment((prev) => ({
                        ...prev,
                        merchantMpAccessToken: e.target.value,
                      }))
                    }
                    placeholder={
                      config.hasMerchantMpAccessToken
                        ? '•••••••• (Token guardado · escribir para cambiar)'
                        : 'APP_USR-... (opcional para link dinámico)'
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              {/* Botón Probar Mercado Pago + Estado de Webhook por Tienda */}
              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-600">
                    <span className="font-bold text-slate-800">Estado de integración MP: </span>
                    {config.hasMerchantMpAccessToken || draftMerchantPayment.merchantMpAccessToken.trim() ? (
                      <span className="text-emerald-700 font-semibold">
                        Token configurado {draftMerchantPayment.merchantMpAccessToken.trim() ? '(nuevo borrador listo)' : '(guardado)'}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-semibold">
                        Sin Access Token aún (usará Alias o Link fijo)
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={isTestingMp}
                    onClick={async () => {
                      setIsTestingMp(true);
                      setMpTestResult(null);
                      try {
                        const tid = tenant?.id || config.tenantId || 'default-tenant';
                        const res = await testMerchantMercadoPagoConnection({
                          tenantId: tid,
                          mpAccessToken: draftMerchantPayment.merchantMpAccessToken.trim() || undefined,
                        });
                        setMpTestResult(res);
                        if (res.valid) {
                          showToast(`Mercado Pago conectado: ${res.account?.nickname || res.account?.email || 'OK'}`);
                        } else {
                          showToast(res.error || 'No se pudo validar el Access Token de Mercado Pago.');
                        }
                      } finally {
                        setIsTestingMp(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#009EE3] hover:bg-[#008ACA] disabled:opacity-60 text-white cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingMp ? 'animate-spin' : ''}`} />
                    <span>{isTestingMp ? 'Probando MP...' : 'Probar Mercado Pago'}</span>
                  </button>
                </div>

                {mpTestResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-2 ${
                      mpTestResult.valid
                        ? 'bg-emerald-50 border-emerald-200 text-slate-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {mpTestResult.valid && mpTestResult.account ? (
                      <div className="space-y-1">
                        <div className="font-bold text-emerald-800 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>
                            Conexión verificada · Cuenta MP activa ({mpTestResult.account.siteId || 'MLA'})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700 font-mono">
                          Usuario: {mpTestResult.account.nickname || '—'} ·{' '}
                          {mpTestResult.account.email || ''} · ID #{mpTestResult.account.id}
                        </div>
                      </div>
                    ) : (
                      <div className="font-semibold flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{mpTestResult.error}</span>
                      </div>
                    )}

                    {mpTestResult.webhookUrls && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-800">
                          Recordatorio de Webhook para acreditación automática:
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Pegá esta URL en <strong>Mercado Pago Developers → Tu aplicación → Webhooks</strong> (evento <em>Pagos / payments</em>) para acreditar pedidos incluso si el cliente cierra la ventana antes de regresar:
                        </p>
                        {(mpTestResult.webhookUrls.supabaseWebhookUrl ||
                          mpTestResult.webhookUrls.serverWebhookUrl) && (
                          <div className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                            <span className="text-[11px] font-mono text-slate-800 truncate">
                              {mpTestResult.webhookUrls.supabaseWebhookUrl ||
                                mpTestResult.webhookUrls.serverWebhookUrl}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                const url =
                                  mpTestResult.webhookUrls?.supabaseWebhookUrl ||
                                  mpTestResult.webhookUrls?.serverWebhookUrl ||
                                  '';
                                if (!url) return;
                                await navigator.clipboard.writeText(url);
                                setCopiedWebhookField('webhook');
                                showToast('URL de Webhook copiada.');
                                setTimeout(() => setCopiedWebhookField(null), 2000);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 text-white text-[10px] font-bold shrink-0 cursor-pointer"
                            >
                              {copiedWebhookField === 'webhook' ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-300" />
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="sm:col-span-2 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-emerald-700" />
                    <span>
                      {isBasicWebPlan
                        ? 'Alertas de Stock Mínimo (Plan 2 · Página Web Básica)'
                        : 'Promociones, Cupones, Descuento Efectivo/Transferencia y Alertas de Stock'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isBasicWebPlan
                      ? 'Definí cuándo recibir alertas por stock bajo. Las herramientas de descuentos, burbujas de ofertas, SuperClub y Puntos por DNI corresponden a Plan 3 · Full.'
                      : 'Ofrecé un beneficio por pagar en Efectivo/Transferencia, creá códigos de descuento y definí cuándo avisarte por stock bajo.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!isBasicWebPlan && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Descuento pagando en Efectivo / Transferencia (%)
                    </label>
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      max="90"
                      step="1"
                      value={draftSettings.cashOrTransferDiscountPercent ?? 0}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          cashOrTransferDiscountPercent: Math.max(
                            0,
                            Math.min(90, Number(e.target.value) || 0)
                          ),
                        }))
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700">
                    Alerta de stock mínimo por defecto (unidades)
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    min="0"
                    step="1"
                    value={draftSettings.defaultLowStockThreshold ?? 2}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        defaultLowStockThreshold: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                      }))
                    }
                    placeholder="2"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              {isBasicWebPlan ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 text-xs text-amber-950">
                    <div className="font-bold flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Ofertas, SuperClub, Descuentos y Puntos por DNI · Exclusivo Plan Full</span>
                    </div>
                    <p className="text-[11px] text-amber-900/90">
                      Tu Plan 2 muestra la página web básica sin burbujas de ofertas, seguimiento de clientes, SuperClub ni cupones/descuentos. Ampliá a Plan 3 · Full para desbloquearlo todo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      requestPlanUpgrade(
                        'full_feature',
                        'Ofertas, Descuentos, SuperClub y Puntos por DNI'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-300" />
                    <span>Aumentar a Plan Full</span>
                  </button>
                </div>
              ) : (
                <>

              {/* Coupon builder */}
              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-800">
                  Cupones de descuento para la tienda web
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <input
                    type="text"
                    value={newCouponCode}
                    onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                    placeholder="Código (ej. BIENVENIDO10)"
                    className="col-span-2 sm:col-span-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 uppercase"
                  />
                  <select
                    value={newCouponType}
                    onChange={(e) => setNewCouponType(e.target.value as 'percent' | 'fixed')}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                  >
                    <option value="percent">% Porcentaje</option>
                    <option value="fixed">{currency} Monto fijo</option>
                  </select>
                  <input
                    type="number" inputMode="decimal"
                    min="1"
                    step="0.01"
                    value={newCouponValue}
                    onChange={(e) => setNewCouponValue(e.target.value)}
                    placeholder={newCouponType === 'percent' ? '% desc.' : 'Monto'}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                  />
                  <div className="col-span-2 sm:col-span-1 flex gap-1.5">
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={newCouponMinPurchase}
                      onChange={(e) => setNewCouponMinPurchase(e.target.value)}
                      placeholder="Mín. opc."
                      title="Compra mínima opcional para aplicar el cupón"
                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const code = newCouponCode.trim().toUpperCase().replace(/\s+/g, '');
                        const val = Number(String(newCouponValue).replace(',', '.'));
                        if (!code || !Number.isFinite(val) || val <= 0) {
                          showToast('Ingresá un código de cupón y un valor de descuento mayor a 0.');
                          return;
                        }
                        if (newCouponType === 'percent' && val > 95) {
                          showToast('El cupón porcentual no puede superar el 95%.');
                          return;
                        }
                        const minPurch =
                          newCouponMinPurchase.trim() !== '' && Number(newCouponMinPurchase) > 0
                            ? Number(newCouponMinPurchase)
                            : undefined;
                        const nextCoupon: CatalogCoupon = {
                          id: `cpn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          code,
                          discountType: newCouponType,
                          value: val,
                          minPurchase: minPurch,
                          active: true,
                        };
                        setDraftSettings((prev) => ({
                          ...prev,
                          coupons: [
                            ...(prev.coupons || []).filter((c) => c.code.toUpperCase() !== code),
                            nextCoupon,
                          ],
                        }));
                        setNewCouponCode('');
                        setNewCouponValue('');
                        setNewCouponMinPurchase('');
                        showToast(`Cupón "${code}" agregado. Guardá los cambios para publicarlo.`);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0B1933] text-white text-xs font-bold cursor-pointer shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>

                {(draftSettings.coupons || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(draftSettings.coupons || []).map((c) => (
                      <div
                        key={c.code}
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setDraftSettings((prev) => ({
                              ...prev,
                              coupons: (prev.coupons || []).map((x) =>
                                x.code === c.code ? { ...x, active: x.active === false } : x
                              ),
                            }))
                          }
                          className={`font-mono font-bold cursor-pointer ${
                            c.active !== false ? 'text-emerald-700' : 'text-slate-400 line-through'
                          }`}
                          title="Clic para activar/pausar cupón"
                        >
                          {c.code}
                        </button>
                        <span className="text-slate-600">
                          {c.discountType === 'percent'
                            ? `${c.value}%`
                            : formatCurrency(c.value, currency)}
                          {c.minPurchase ? ` (mín ${formatCurrency(c.minPurchase, currency)})` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftSettings((prev) => ({
                              ...prev,
                              coupons: (prev.coupons || []).filter((x) => x.code !== c.code),
                            }))
                          }
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Promo Club settings */}
              <div className="pt-2 border-t border-slate-200 space-y-2.5">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftSettings.enablePromoClub !== false}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({ ...prev, enablePromoClub: e.target.checked }))
                    }
                    className="rounded border-slate-300"
                  />
                  <span>Mostrar formulario "Recibir promos y descuentos" en la página web</span>
                </label>

                {draftSettings.enablePromoClub !== false && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Título de la sección en tu web
                      </label>
                      <input
                        type="text"
                        value={draftSettings.promoClubTitle || ''}
                        onChange={(e) =>
                          setDraftSettings((prev) => ({ ...prev, promoClubTitle: e.target.value }))
                        }
                        placeholder="Club de Promos y Descuentos"
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Cupón de bienvenida al registrarse (opcional)
                      </label>
                      <input
                        type="text"
                        value={draftSettings.promoClubWelcomeCoupon || ''}
                        onChange={(e) =>
                          setDraftSettings((prev) => ({
                            ...prev,
                            promoClubWelcomeCoupon: e.target.value.toUpperCase(),
                          }))
                        }
                        placeholder="Ej. BIENVENIDO10 (se muestra al anotarse)"
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 uppercase"
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Mensaje incentivo para tus clientes
                      </label>
                      <input
                        type="text"
                        value={draftSettings.promoClubIncentive || ''}
                        onChange={(e) =>
                          setDraftSettings((prev) => ({
                            ...prev,
                            promoClubIncentive: e.target.value,
                          }))
                        }
                        placeholder="Dejanos tu WhatsApp y recibí descuentos, ingresos y promos exclusivas."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Storefront Promo Banners Builder */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Megaphone className="w-4 h-4 text-[#0B1933]" />
                    <span>Banners promocionales en la portada del catálogo web</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Podés armar un banner directo en la página o subir / pegar tu propia imagen diseñada. Al tocarlo, el cliente filtra la categoría o aplica su cupón.
                  </p>
                </div>

                {/* Mode switcher: Armar en la página vs Subir/pegar imagen */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewBannerMode('built')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      newBannerMode === 'built'
                        ? 'bg-[#0B1933] text-white border-[#0B1933]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Armar banner en la página
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewBannerMode('image')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      newBannerMode === 'image'
                        ? 'bg-[#0B1933] text-white border-[#0B1933]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Cargar banner como imagen</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3.5 rounded-xl border border-slate-200">
                  {newBannerMode === 'image' && (
                    <div className="sm:col-span-2 space-y-2 pb-2 border-b border-slate-100">
                      <label className="text-[11px] font-semibold text-slate-700 block">
                        Imagen del banner (formato apaisado recomendado) *
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          ref={bannerFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleBannerImageUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={isCompressingBannerImage}
                          onClick={() => bannerFileInputRef.current?.click()}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-60 text-white text-xs font-bold cursor-pointer shrink-0"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {isCompressingBannerImage
                              ? 'Optimizando imagen...'
                              : 'Subir imagen desde dispositivo'}
                          </span>
                        </button>
                        <input
                          type="url"
                          value={newBannerImageUrl}
                          onChange={(e) => setNewBannerImageUrl(e.target.value)}
                          placeholder="O pegá la URL de la imagen (https://...)"
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                        />
                      </div>
                      {newBannerImageUrl.trim() && (
                        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-h-36">
                          <img
                            src={newBannerImageUrl.trim()}
                            alt="Vista previa de banner"
                            referrerPolicy="no-referrer"
                            className="w-full h-32 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setNewBannerImageUrl('')}
                            className="absolute top-2 right-2 p-1 rounded-lg bg-slate-950/75 text-white hover:bg-slate-950 cursor-pointer"
                            title="Quitar imagen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      {newBannerMode === 'image'
                        ? 'Título o pie sobre la imagen (opcional)'
                        : 'Título del banner *'}
                    </label>
                    <input
                      type="text"
                      value={newBannerTitle}
                      onChange={(e) => setNewBannerTitle(e.target.value)}
                      placeholder="Ej. 20% OFF en Temporada Invierno"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                  </div>
                  {newBannerMode === 'built' && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Etiqueta superior (opcional)
                      </label>
                      <input
                        type="text"
                        value={newBannerBadge}
                        onChange={(e) => setNewBannerBadge(e.target.value)}
                        placeholder="Ej. LANZAMIENTO · SOLO ESTA SEMANA"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                      />
                    </div>
                  )}
                  {newBannerMode === 'built' && (
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Descripción breve (opcional)
                      </label>
                      <input
                        type="text"
                        value={newBannerSubtitle}
                        onChange={(e) => setNewBannerSubtitle(e.target.value)}
                        placeholder="Ej. Tocá este banner para filtrar la colección o aplicar tu cupón de descuento."
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                      />
                    </div>
                  )}
                  {newBannerMode === 'built' && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Color de fondo
                      </label>
                      <select
                        value={newBannerTheme}
                        onChange={(e) =>
                          setNewBannerTheme(e.target.value as CatalogPromoBanner['theme'])
                        }
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                      >
                        <option value="navy">Azul Institucional</option>
                        <option value="emerald">Verde Oferta</option>
                        <option value="amber">Ámbar Destacado</option>
                        <option value="rose">Coral / Liquidación</option>
                      </select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Al hacer clic: Filtrar categoría
                    </label>
                    <select
                      value={newBannerFilterCategory}
                      onChange={(e) => setNewBannerFilterCategory(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    >
                      <option value="">Todas las categorías</option>
                      {(draftSettings.rubroFilters || activeRubroFilters).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Al hacer clic: Aplicar cupón
                    </label>
                    <select
                      value={newBannerCouponCode}
                      onChange={(e) => setNewBannerCouponCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    >
                      <option value="">Sin cupón asociado</option>
                      {(draftSettings.coupons || [])
                        .filter((c) => c.active !== false)
                        .map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">
                      Texto del botón (opcional)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newBannerCtaLabel}
                        onChange={(e) => setNewBannerCtaLabel(e.target.value)}
                        placeholder={newBannerMode === 'image' ? 'Opcional (ej. Ver promo)' : 'Ver oferta'}
                        className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const title = newBannerTitle.trim();
                          const cleanImg = newBannerImageUrl.trim();
                          if (newBannerMode === 'image' && !cleanImg) {
                            showToast('Subí una imagen o pegá la URL para crear el banner.');
                            return;
                          }
                          if (newBannerMode === 'built' && !title) {
                            showToast('Ingresá al menos un título para armar el banner.');
                            return;
                          }
                          const nextBanner: CatalogPromoBanner = {
                            id: `bnr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            mode: newBannerMode,
                            imageUrl: newBannerMode === 'image' ? cleanImg : undefined,
                            badgeText: newBannerMode === 'built' ? newBannerBadge.trim() || undefined : undefined,
                            title: title || 'Promoción destacada',
                            subtitle: newBannerMode === 'built' ? newBannerSubtitle.trim() || undefined : undefined,
                            theme: newBannerTheme,
                            filterCategory: newBannerFilterCategory || undefined,
                            couponCode: newBannerCouponCode || undefined,
                            ctaLabel:
                              newBannerMode === 'image'
                                ? newBannerCtaLabel.trim() || undefined
                                : newBannerCtaLabel.trim() || 'Ver oferta',
                            active: true,
                          };
                          setDraftSettings((prev) => ({
                            ...prev,
                            promoBanners: [...(prev.promoBanners || []), nextBanner].slice(0, 6),
                          }));
                          setNewBannerImageUrl('');
                          setNewBannerBadge('');
                          setNewBannerTitle('');
                          setNewBannerSubtitle('');
                          setNewBannerFilterCategory('');
                          setNewBannerCouponCode('');
                          setNewBannerCtaLabel('Ver oferta');
                          showToast('Banner agregado. Guardá los cambios para publicarlo en la web.');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                      >
                        + Agregar banner
                      </button>
                    </div>
                  </div>
                </div>

                {(draftSettings.promoBanners || []).length > 0 && (
                  <div className="space-y-2">
                    {(draftSettings.promoBanners || []).map((bnr, bIdx) => (
                      <div
                        key={bnr.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {bnr.mode === 'image' && bnr.imageUrl && (
                            <img
                              src={bnr.imageUrl}
                              alt={bnr.title}
                              referrerPolicy="no-referrer"
                              className="w-16 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`font-bold ${
                                  bnr.active ? 'text-slate-900' : 'text-slate-400 line-through'
                                }`}
                              >
                                {bnr.title}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                · {bnr.mode === 'image' ? 'Imagen cargada' : 'Armado en página'}
                              </span>
                              {bnr.badgeText && (
                                <span className="text-[11px] text-slate-500">· {bnr.badgeText}</span>
                              )}
                              {bnr.filterCategory && (
                                <span className="text-[11px] text-[#0B1933] font-semibold">
                                  · Filtra: {bnr.filterCategory}
                                </span>
                              )}
                              {bnr.couponCode && (
                                <span className="text-[11px] font-mono font-bold text-emerald-700">
                                  · Cupón: {bnr.couponCode}
                                </span>
                              )}
                            </div>
                            {bnr.subtitle && (
                              <div className="text-[11px] text-slate-500 truncate">{bnr.subtitle}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={bIdx === 0}
                            onClick={() =>
                              setDraftSettings((prev) => {
                                const list = [...(prev.promoBanners || [])];
                                if (bIdx <= 0) return prev;
                                [list[bIdx - 1], list[bIdx]] = [list[bIdx], list[bIdx - 1]];
                                return { ...prev, promoBanners: list };
                              })
                            }
                            className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            title="Subir orden"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={bIdx === (draftSettings.promoBanners || []).length - 1}
                            onClick={() =>
                              setDraftSettings((prev) => {
                                const list = [...(prev.promoBanners || [])];
                                if (bIdx >= list.length - 1) return prev;
                                [list[bIdx], list[bIdx + 1]] = [list[bIdx + 1], list[bIdx]];
                                return { ...prev, promoBanners: list };
                              })
                            }
                            className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                            title="Bajar orden"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftSettings((prev) => ({
                                ...prev,
                                promoBanners: (prev.promoBanners || []).map((x) =>
                                  x.id === bnr.id ? { ...x, active: !x.active } : x
                                ),
                              }))
                            }
                            className="px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            {bnr.active ? 'Pausar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftSettings((prev) => ({
                                ...prev,
                                promoBanners: (prev.promoBanners || []).filter((x) => x.id !== bnr.id),
                              }))
                            }
                            className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="Eliminar banner"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Programa de Puntos por DNI (Escala de descuentos por puntos) */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-700" />
                      <span>Programa de Puntos por DNI (Descuentos del 10% al 50%)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Si lo habilitás, el cliente ingresa su DNI arriba de todo al abrir el catálogo, suma puntos con cada prenda/unidad y puede canjearlos por % de descuento al cierre de su compra.
                    </p>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(draftSettings.enableLoyaltyProgram)}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        enableLoyaltyProgram: e.target.checked,
                        loyaltyPointsPerUnit:
                          typeof prev.loyaltyPointsPerUnit === 'number'
                            ? prev.loyaltyPointsPerUnit
                            : 10,
                        loyaltyTiers:
                          prev.loyaltyTiers && prev.loyaltyTiers.length > 0
                            ? prev.loyaltyTiers
                            : getDefaultLoyaltyTiers(),
                      }))
                    }
                    className="rounded border-slate-300"
                  />
                  <span>Habilitar Programa de Puntos por DNI en este catálogo web</span>
                </label>

                {Boolean(draftSettings.enableLoyaltyProgram) && (
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-700">
                          Puntos que suma cada prenda / unidad (por defecto)
                        </label>
                        <input
                          type="number" inputMode="decimal"
                          min="1"
                          step="1"
                          value={draftSettings.loyaltyPointsPerUnit ?? 10}
                          onChange={(e) =>
                            setDraftSettings((prev) => ({
                              ...prev,
                              loyaltyPointsPerUnit: Math.max(
                                1,
                                Math.floor(Number(e.target.value) || 0)
                              ),
                            }))
                          }
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                        />
                      </div>

                      <div className="flex justify-start sm:justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setDraftSettings((prev) => ({
                              ...prev,
                              loyaltyTiers: getDefaultLoyaltyTiers(),
                            }))
                          }
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          Cargar escala 10% · 15% · 20% · 30% · 40% · 50%
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-800">
                        Niveles de descuento configurados (Puntos mínimos → % OFF)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {(draftSettings.loyaltyTiers || []).map((tier) => (
                          <div
                            key={tier.id}
                            className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                          >
                            <input
                              type="number" inputMode="decimal"
                              min="1"
                              value={tier.minPoints}
                              onChange={(e) => {
                                const val = Math.max(1, Math.floor(Number(e.target.value) || 1));
                                setDraftSettings((prev) => ({
                                  ...prev,
                                  loyaltyTiers: (prev.loyaltyTiers || []).map((t) =>
                                    t.id === tier.id ? { ...t, minPoints: val } : t
                                  ),
                                }));
                              }}
                              aria-label="Puntos necesarios"
                              className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono text-slate-900"
                            />
                            <span className="text-[11px] text-slate-500">pts →</span>
                            <input
                              type="number" inputMode="decimal"
                              min="1"
                              max="90"
                              value={tier.discountPercent}
                              onChange={(e) => {
                                const pct = Math.max(
                                  1,
                                  Math.min(90, Math.floor(Number(e.target.value) || 1))
                                );
                                setDraftSettings((prev) => ({
                                  ...prev,
                                  loyaltyTiers: (prev.loyaltyTiers || []).map((t) =>
                                    t.id === tier.id ? { ...t, discountPercent: pct } : t
                                  ),
                                }));
                              }}
                              aria-label="Porcentaje de descuento"
                              className="w-14 px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono font-bold text-emerald-700"
                            />
                            <span className="text-[11px] font-bold text-emerald-700">%</span>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftSettings((prev) => ({
                                  ...prev,
                                  loyaltyTiers: (prev.loyaltyTiers || []).filter(
                                    (t) => t.id !== tier.id
                                  ),
                                }))
                              }
                              className="ml-auto p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Eliminar nivel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                      <input
                        type="number" inputMode="decimal"
                        min="1"
                        step="1"
                        value={newLoyaltyMinPoints}
                        onChange={(e) => setNewLoyaltyMinPoints(e.target.value)}
                        placeholder="Puntos (ej. 120)"
                        className="w-36 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                      />
                      <input
                        type="number" inputMode="decimal"
                        min="1"
                        max="90"
                        step="1"
                        value={newLoyaltyDiscountPercent}
                        onChange={(e) => setNewLoyaltyDiscountPercent(e.target.value)}
                        placeholder="% OFF (ej. 25)"
                        className="w-32 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const pts = Math.floor(Number(newLoyaltyMinPoints));
                          const pct = Math.floor(Number(newLoyaltyDiscountPercent));
                          if (!Number.isFinite(pts) || pts <= 0 || !Number.isFinite(pct) || pct <= 0 || pct > 90) {
                            showToast('Ingresá puntos mayores a 0 y descuento entre 1% y 90%.');
                            return;
                          }
                          const newTier: CatalogLoyaltyTier = {
                            id: `tier-${Date.now()}`,
                            minPoints: pts,
                            discountPercent: pct,
                            label: `${pct}% OFF`,
                          };
                          setDraftSettings((prev) => ({
                            ...prev,
                            loyaltyTiers: normalizeLoyaltyTiers([
                              ...(prev.loyaltyTiers || []),
                              newTier,
                            ]),
                          }));
                          setNewLoyaltyMinPoints('');
                          setNewLoyaltyDiscountPercent('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#0B1933] hover:bg-[#13264A] text-white text-xs font-bold cursor-pointer"
                      >
                        + Agregar nivel
                      </button>
                    </div>

                    <label className="inline-flex items-start gap-2 pt-2 border-t border-slate-100 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftSettings.loyaltyRestrictRedeemMethods !== false}
                        onChange={(e) =>
                          setDraftSettings((prev) => ({
                            ...prev,
                            loyaltyRestrictRedeemMethods: e.target.checked,
                          }))
                        }
                        className="rounded border-slate-300 mt-0.5"
                      />
                      <span>
                        Permitir canjear puntos para descuento solo con <strong>retiro en el local</strong>,{' '}
                        <strong>transferencia bancaria</strong> o <strong>Dinero en cuenta (Mercado Pago)</strong>{' '}
                        (al confirmar el pedido los puntos canjeados se descuentan automáticamente del DNI)
                      </span>
                    </label>
                  </div>
                )}
              </div>
                </>
              )}
            </div>
          </div>

          <StoreDesignEditor
            value={draftSettings.storeTheme}
            onChange={(next) => setDraftSettings((prev) => ({ ...prev, storeTheme: next }))}
            storeName={draftSettings.storeName || config.distributorName || 'Mi tienda'}
            currencySymbol={currency}
            locked={Boolean(planFeatureAccess && !planFeatureAccess.canAccessFullFeatures)}
            onUpgrade={
              onRequestUpgradePlan
                ? () => requestPlanUpgrade('full_feature', 'Diseño de tu tienda')
                : undefined
            }
          />

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Guardar y Actualizar Catálogo Público</span>
            </button>
          </div>
        </form>
      )}

      {/* MODAL ALTA / EDICIÓN DE PRODUCTO */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingProduct ? 'Editar Producto del Catálogo' : 'Nuevo Producto en Catálogo'}
              </h3>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitProduct} className="p-5 space-y-4">
              {/* Locked Rubro Notice */}
              <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 flex items-center justify-between gap-2">
                <span>
                  Cargando exclusivamente en rubro:{' '}
                  <strong className="text-[#0B1933]">{rubroPreset.label}</strong>
                </span>
              </div>

              {/* Photo Upload + Preview */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  Foto del producto
                </label>
                <div className="flex items-start gap-4">
                  <div className="w-28 h-24 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                    {productImageUrl ? (
                      <img
                        src={productImageUrl}
                        alt="Vista previa"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={isCompressingImage}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isCompressingImage ? 'Procesando...' : 'Subir Imagen'}</span>
                      </button>

                      {productImageUrl && (
                        <button
                          type="button"
                          onClick={() => setProductImageUrl('')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                        >
                          Quitar foto
                        </button>
                      )}
                    </div>

                    <input
                      type="url"
                      value={productImageUrl.startsWith('data:') ? '' : productImageUrl}
                      onChange={(e) => setProductImageUrl(e.target.value)}
                      placeholder="O pegá el link (URL) de una imagen..."
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* Additional Multi-Photo Gallery (up to 3 extra = 4 total) */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-600">
                      Galería de fotos extra ({productAdditionalImages.length}/3 adicionales)
                    </span>
                    <input
                      ref={galleryFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAdditionalGalleryUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={isCompressingImage || productAdditionalImages.length >= 3}
                      onClick={() => galleryFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Agregar más fotos</span>
                    </button>
                  </div>

                  {productAdditionalImages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {productAdditionalImages.map((imgSrc, gIdx) => (
                        <div
                          key={`${gIdx}-${imgSrc.slice(0, 24)}`}
                          className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                        >
                          <img
                            src={imgSrc}
                            alt={`Galería ${gIdx + 2}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setProductAdditionalImages((prev) =>
                                prev.filter((_, idx) => idx !== gIdx)
                              )
                            }
                            aria-label="Quitar foto adicional"
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-950/80 text-white flex items-center justify-center text-[10px] cursor-pointer"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {productAdditionalImages.length < 3 && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        value={additionalImageUrlInput}
                        onChange={(e) => setAdditionalImageUrlInput(e.target.value)}
                        placeholder="O pegá URL de otra foto de detalle..."
                        className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = additionalImageUrlInput.trim();
                          if (!clean) return;
                          setProductAdditionalImages((prev) => [...prev, clean].slice(0, 3));
                          setAdditionalImageUrlInput('');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        + URL
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Nombre del producto *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={productName}
                    onChange={(e) => {
                      setProductName(e.target.value);
                      if (productFormErrors.name) setProductFormErrors((p) => ({ ...p, name: undefined }));
                    }}
                    placeholder={rubroPreset.productPlaceholder}
                    aria-invalid={Boolean(productFormErrors.name)}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs text-slate-900 ${
                      productFormErrors.name ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'
                    }`}
                  />
                  {productFormErrors.name && <p className="text-[11px] font-medium text-rose-600">{productFormErrors.name}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Precio ({currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={productPrice}
                    onChange={(e) => {
                      setProductPrice(e.target.value);
                      if (productFormErrors.price) setProductFormErrors((p) => ({ ...p, price: undefined }));
                    }}
                    placeholder="0.00"
                    aria-invalid={Boolean(productFormErrors.price)}
                    className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-xs font-mono text-slate-900 ${
                      productFormErrors.price ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'
                    }`}
                  />
                  {productFormErrors.price && <p className="text-[11px] font-medium text-rose-600">{productFormErrors.price}</p>}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Barcode className="w-3.5 h-3.5 text-slate-500" />
                    <span>Código / SKU (opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={productSku}
                    onChange={(e) => setProductSku(e.target.value)}
                    placeholder="Ej. COD-104, ART-22, 779..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    {productVariants.length > 0
                      ? 'Stock total (calculado por variantes)'
                      : 'Cantidad en stock'}
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    min="0"
                    step="1"
                    disabled={productVariants.length > 0}
                    value={
                      productVariants.length > 0
                        ? productVariants.every((v) => v.stockQuantity.trim() !== '')
                          ? String(
                              productVariants.reduce(
                                (sum, v) => sum + Math.max(0, Math.floor(Number(v.stockQuantity) || 0)),
                                0
                              )
                            )
                          : ''
                        : productStockQuantity
                    }
                    onChange={(e) => {
                      setProductStockQuantity(e.target.value);
                      if (productFormErrors.stock) setProductFormErrors((p) => ({ ...p, stock: undefined }));
                    }}
                    placeholder={
                      productVariants.length > 0
                        ? 'Controlado por cada variante abajo'
                        : 'Vacío = stock libre'
                    }
                    aria-invalid={Boolean(productFormErrors.stock)}
                    className={`w-full px-3 py-2 bg-slate-50 disabled:opacity-70 border rounded-xl text-xs font-mono text-slate-900 ${
                      productFormErrors.stock ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'
                    }`}
                  />
                  {productFormErrors.stock && <p className="text-[11px] font-medium text-rose-600">{productFormErrors.stock}</p>}
                  {productVariants.length === 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setProductStockQuantity('0')}
                        className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold cursor-pointer"
                      >
                        Sin stock (0)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setProductStockQuantity((prev) =>
                            String((Number(prev || 0) || 0) + 5)
                          )
                        }
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setProductStockQuantity((prev) =>
                            String((Number(prev || 0) || 0) + 10)
                          )
                        }
                        className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                      >
                        +10
                      </button>
                      {productStockQuantity !== '' && (
                        <button
                          type="button"
                          onClick={() => setProductStockQuantity('')}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-semibold cursor-pointer"
                        >
                          Stock libre
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Variantes de Producto (Talle / Color / Medida) con Stock Propio */}
                <div className="sm:col-span-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Variantes con stock propio (Talle / Color / Medida)
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Opcional: ideal para Indumentaria o Calzado. Cada opción lleva su propio stock y el cliente la elige antes de agregar al carrito.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setProductVariants((prev) => {
                            const existingLabels = new Set(prev.map((x) => x.label.toLowerCase()));
                            const toAdd = ['S', 'M', 'L', 'XL']
                              .filter((l) => !existingLabels.has(l.toLowerCase()))
                              .map((l, idx) => ({
                                id: `var-${Date.now()}-${idx}-${l}`,
                                label: l,
                                stockQuantity: '1',
                                sku: '',
                                price: '',
                              }));
                            return [...prev, ...toAdd];
                          })
                        }
                        className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-[#0B1933] text-[10px] font-bold text-slate-700 cursor-pointer"
                      >
                        + Talles S–XL
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setProductVariants((prev) => [
                            ...prev,
                            {
                              id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                              label: '',
                              stockQuantity: '1',
                              sku: '',
                              price: '',
                            },
                          ])
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0B1933] text-white text-[10px] font-bold cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Agregar variante</span>
                      </button>
                    </div>
                  </div>

                  {productVariants.length > 0 && (
                    <div className="space-y-2">
                      {productVariants.map((draftVar, idx) => (
                        <div
                          key={draftVar.id || idx}
                          className="grid grid-cols-12 gap-1.5 items-center bg-white border border-slate-200 rounded-lg p-2"
                        >
                          <input
                            type="text"
                            value={draftVar.label}
                            onChange={(e) =>
                              setProductVariants((prev) =>
                                prev.map((v, i) =>
                                  i === idx ? { ...v, label: e.target.value } : v
                                )
                              )
                            }
                            placeholder="Talle / Color (ej. Negro M)"
                            className="col-span-5 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold text-slate-900"
                          />
                          <input
                            type="number" inputMode="decimal"
                            min="0"
                            step="1"
                            value={draftVar.stockQuantity}
                            onChange={(e) =>
                              setProductVariants((prev) =>
                                prev.map((v, i) =>
                                  i === idx ? { ...v, stockQuantity: e.target.value } : v
                                )
                              )
                            }
                            placeholder="Stock"
                            title="Stock de esta variante (0 = Sin stock, vacío = libre)"
                            className="col-span-2 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-900"
                          />
                          <input
                            type="text"
                            value={draftVar.sku}
                            onChange={(e) =>
                              setProductVariants((prev) =>
                                prev.map((v, i) => (i === idx ? { ...v, sku: e.target.value } : v))
                              )
                            }
                            placeholder="Cód."
                            title="Código / SKU opcional de esta variante"
                            className="col-span-2 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-900"
                          />
                          <input
                            type="number" inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={draftVar.price}
                            onChange={(e) =>
                              setProductVariants((prev) =>
                                prev.map((v, i) =>
                                  i === idx ? { ...v, price: e.target.value } : v
                                )
                              )
                            }
                            placeholder="$ opc."
                            title="Precio opcional para esta variante (vacío = usa precio base)"
                            className="col-span-2 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setProductVariants((prev) => prev.filter((_, i) => i !== idx))
                            }
                            title="Quitar variante"
                            className="col-span-1 p-1 text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Presentación / Unidad
                  </label>
                  <input
                    type="text"
                    value={productUnitLabel}
                    onChange={(e) => setProductUnitLabel(e.target.value)}
                    placeholder="Ej. Unidad, Bulto x12, Talle L"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Alerta stock bajo (opcional)
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    min="0"
                    step="1"
                    value={productLowStockThreshold}
                    onChange={(e) => setProductLowStockThreshold(e.target.value)}
                    placeholder={`Por defecto: ${defaultLowThreshold} u.`}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>

                {!isBasicWebPlan && Boolean(settings.enableLoyaltyProgram || draftSettings.enableLoyaltyProgram) && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Puntos por unidad (Programa DNI)</span>
                    </label>
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      step="1"
                      value={productLoyaltyPoints}
                      onChange={(e) => setProductLoyaltyPoints(e.target.value)}
                      placeholder={`Por defecto tienda: ${settings.loyaltyPointsPerUnit ?? 10} pts`}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                    />
                  </div>
                )}

                {isBasicWebPlan ? (
                  <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
                    <div className="text-[11px] text-slate-600">
                      <strong className="text-slate-800">Ofertas Relámpago, Outlet, Precios Mayoristas y Puntos DNI</strong> requieren{' '}
                      <strong>Plan 3 · Full</strong>.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsProductModalOpen(false);
                        requestPlanUpgrade('full_feature', 'Ofertas, Descuentos y Puntos por DNI');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#0B1933] text-white text-[11px] font-bold cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      Aumentar a Plan Full
                    </button>
                  </div>
                ) : (
                  <>
                {/* Wholesale Tier (Precio Mayorista por Cantidad) */}
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-indigo-50/50 border border-indigo-200/80">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-800">
                      Cant. mínima precio mayorista (opcional)
                    </label>
                    <input
                      type="number" inputMode="decimal"
                      min="2"
                      step="1"
                      value={productWholesaleMinQty}
                      onChange={(e) => setProductWholesaleMinQty(e.target.value)}
                      placeholder="Ej. 3 (desde 3 unidades)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-800">
                      Precio unitario mayorista ({currency})
                    </label>
                    <input
                      type="number" inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={productWholesalePrice}
                      onChange={(e) => setProductWholesalePrice(e.target.value)}
                      placeholder="Ej. 8500.00"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                    />
                  </div>
                </div>

                {/* Oferta Relámpago / Outlet (#9) */}
                <div className="sm:col-span-2 p-3 rounded-xl bg-rose-50/60 border border-rose-200/90 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-[11px] font-bold text-rose-900 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-rose-600" />
                      <span>Oferta Relámpago (Flash Sale) y Outlet</span>
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={productIsOutlet}
                        onChange={(e) => setProductIsOutlet(e.target.checked)}
                        className="rounded border-rose-300"
                      />
                      <span>Incluir en sección Outlet</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Precio Oferta Relámpago ({currency})
                      </label>
                      <input
                        type="number" inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={productFlashSalePrice}
                        onChange={(e) => setProductFlashSalePrice(e.target.value)}
                        placeholder="Menor al precio base (opcional)"
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Cuenta regresiva hasta (fecha y hora)
                      </label>
                      <input
                        type="datetime-local"
                        value={productFlashSaleEndsAt}
                        onChange={(e) => setProductFlashSaleEndsAt(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900"
                      />
                    </div>
                  </div>
                </div>
                  </>
                )}

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Filtro principal ({rubroPreset.shortLabel})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeRubroFilters.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setProductCategory(cat)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                          productCategory === cat
                            ? 'bg-[#0B1933] text-white border-[#0B1933]'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                    placeholder={`Categoría dentro de ${rubroPreset.shortLabel}`}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-[#0B1933]" />
                    <span>Subfiltros del producto (opcional — podés elegir o crear)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {normalizeFilterList([
                      ...activeSubfilters,
                      ...productSubfilters,
                      ...rubroPreset.suggestedSubfilters,
                    ]).map((sf) => {
                      const active = productSubfilters.some(
                        (x) => x.toLowerCase() === sf.toLowerCase()
                      );
                      return (
                        <button
                          key={sf}
                          type="button"
                          onClick={() => handleToggleProductSubfilter(sf)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                            active
                              ? 'bg-[#0B1933] text-white border-[#0B1933]'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {active ? `✓ ${sf}` : sf}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={modalNewSubfilter}
                      onChange={(e) => setModalNewSubfilter(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddModalSubfilter();
                        }
                      }}
                      placeholder="Crear nuevo subfiltro para este producto..."
                      className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={handleAddModalSubfilter}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Crear subfiltro</span>
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Descripción (qué es, detalles, talles o sabores)
                  </label>
                  <textarea
                    rows={3}
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    placeholder="Explicá claramente qué incluye, medidas, marca o condiciones..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productAvailable}
                    onChange={(e) => setProductAvailable(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Disponible para pedir en el catálogo</span>
                </label>

                {!isBasicWebPlan && (
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={productFeatured}
                      onChange={(e) => setProductFeatured(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>Marcar como destacado</span>
                  </label>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                >
                  {editingProduct ? 'Guardar Cambios' : 'Publicar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORTACIÓN MASIVA DESDE EXCEL / CSV */}
      {isCsvImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Carga Masiva de Productos desde Excel / CSV
                  </h3>
                  <p className="text-xs text-slate-500">
                    Rubro activo: <strong>{rubroPreset.shortLabel}</strong> · Subí un archivo CSV o pegá filas directo desde Excel / Google Sheets.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCsvImportModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900">
                    Columnas aceptadas (con o sin encabezado):
                  </div>
                  <div className="text-[11px] font-mono text-slate-600">
                    nombre · precio · categoria · subfiltros (separados por |) · sku · stock · unidad · descripcion · minimo_mayorista · precio_mayorista · disponible
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar plantilla Excel/CSV</span>
                  </button>
                  <input
                    ref={csvFileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleCsvFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => csvFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Subir archivo .CSV</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  O pegá directamente tus filas copiadas desde Excel / Google Sheets
                </label>
                <textarea
                  rows={5}
                  value={csvRawInput}
                  onChange={(e) => setCsvRawInput(e.target.value)}
                  placeholder={`nombre;precio;categoria;subfiltros;sku;stock;unidad\nRemera Básica;12500;Hombres;Remeras|Verano;REM-01;30;Unidad\nBuzo Friza;28900;Mujeres;Buzos|Invierno;BUZ-02;12;Unidad`}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-700">Si ya existe el SKU o Nombre:</span>
                  <select
                    value={csvConflictMode}
                    onChange={(e) =>
                      setCsvConflictMode(e.target.value as 'upsert' | 'only_new')
                    }
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                  >
                    <option value="upsert">Actualizar precio/stock existente y agregar nuevos</option>
                    <option value="only_new">Solo agregar nuevos (omitir repetidos)</option>
                  </select>
                </div>

                {csvRawInput.trim() && (
                  <div className="text-xs font-mono tabular-nums">
                    <span className="font-bold text-emerald-700">
                      {parsedCsvPreview.validRows.length} válida(s)
                    </span>
                    {parsedCsvPreview.errors.length > 0 && (
                      <span className="ml-2 font-bold text-rose-700">
                        · {parsedCsvPreview.errors.length} con error
                      </span>
                    )}
                  </div>
                )}
              </div>

              {parsedCsvPreview.errors.length > 0 && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-1 text-[11px] text-rose-900">
                  <div className="font-bold">Filas omitidas por formato:</div>
                  {parsedCsvPreview.errors.slice(0, 4).map((err) => (
                    <div key={err.rowNumber} className="truncate font-mono">
                      Fila {err.rowNumber}: {err.reason}
                    </div>
                  ))}
                  {parsedCsvPreview.errors.length > 4 && (
                    <div>... y {parsedCsvPreview.errors.length - 4} fila(s) más.</div>
                  )}
                </div>
              )}

              {parsedCsvPreview.validRows.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 font-bold">Producto</th>
                          <th className="px-3 py-2 font-bold">Categoría</th>
                          <th className="px-3 py-2 font-bold">SKU</th>
                          <th className="px-3 py-2 font-bold text-right">Stock</th>
                          <th className="px-3 py-2 font-bold text-right">Precio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedCsvPreview.validRows.slice(0, 40).map((r) => (
                          <tr key={r.rowNumber} className="bg-white">
                            <td className="px-3 py-1.5 font-semibold text-slate-900 max-w-[200px] truncate">
                              {r.name}
                            </td>
                            <td className="px-3 py-1.5 text-slate-600">{r.category}</td>
                            <td className="px-3 py-1.5 font-mono text-slate-500">{r.sku || '-'}</td>
                            <td className="px-3 py-1.5 font-mono tabular-nums text-right text-slate-700">
                              {typeof r.stockQuantity === 'number' ? `${r.stockQuantity} u.` : 'Libre'}
                            </td>
                            <td className="px-3 py-1.5 font-mono tabular-nums text-right font-bold text-slate-900">
                              {formatCurrency(r.price, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsedCsvPreview.validRows.length > 40 && (
                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                      Mostrando 40 de {parsedCsvPreview.validRows.length} filas listas para importar.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setIsCsvImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={parsedCsvPreview.validRows.length === 0}
                onClick={handleConfirmCsvImport}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] disabled:opacity-40 text-white cursor-pointer"
              >
                Importar {parsedCsvPreview.validRows.length} producto(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE VENTA WEB (FOTOS AMPLIABLES Y CÓDIGOS) */}
      <WebOrderDetailModal
        isOpen={Boolean(activeOrderForDetail)}
        onClose={() => setSelectedOrderForDetail(null)}
        order={activeOrderForDetail}
        products={products}
        config={config}
        pickupAddressFallback={settings.pickupAddress || tenant?.address}
        onMarkAsRetirado={handleMarkOrderPaidPickedUp}
        onOpenReceipt={(ord) => handleDispatchAndOpenReceipt(ord)}
        onBillOrder={onBillOrder}
        onChangePaymentMethod={handleUpdateOrderPaymentMethod}
        onConfirmPayment={handleConfirmOrderPayment}
        onSendProcessWhatsApp={handleSendOrderProcessWhatsApp}
        onWhatsAppCollect={handleWhatsAppCustomerCollectPayment}
        onVerifyTransferReceipt={handleVerifyOrderTransferReceipt}
        onOpenReturnModal={onOpenReturnModal}
      />

      {/* MODAL PREVIEW / IMPRESIÓN QR DE GIFT CARD (#3) */}
      {selectedGiftCardForQr && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedGiftCardForQr(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#0B1933] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-300" />
                <span className="text-sm font-bold">Voucher Gift Card Digital</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGiftCardForQr(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 text-center space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {settings.storeName || config.distributorName || 'Nuestra Tienda'}
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-emerald-700">
                {formatCurrency(
                  selectedGiftCardForQr.remainingBalance,
                  selectedGiftCardForQr.currencySymbol || currency
                )}
              </div>
              <div className="inline-block p-3 bg-white border-2 border-[#0B1933] rounded-2xl">
                <QrCodeSvg
                  value={`${publicUrl}${publicUrl.includes('?') ? '&' : '?'}gift_card=${encodeURIComponent(selectedGiftCardForQr.code)}`}
                  size={170}
                />
              </div>
              <div className="font-mono text-base font-black tracking-wider text-[#0B1933] bg-slate-100 border border-slate-200 rounded-xl py-2 px-4 inline-block">
                {selectedGiftCardForQr.code}
              </div>
              {(selectedGiftCardForQr.recipientName || selectedGiftCardForQr.message) && (
                <div className="text-xs text-slate-600 space-y-1 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  {selectedGiftCardForQr.recipientName && (
                    <div>
                      Para: <strong className="text-slate-900">{selectedGiftCardForQr.recipientName}</strong>
                      {selectedGiftCardForQr.buyerName ? ` · De: ${selectedGiftCardForQr.buyerName}` : ''}
                    </div>
                  )}
                  {selectedGiftCardForQr.message && (
                    <div className="italic">"{selectedGiftCardForQr.message}"</div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
                >
                  Imprimir Voucher
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cardUrl = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}gift_card=${encodeURIComponent(selectedGiftCardForQr.code)}`;
                    const msg = generateGiftCardWhatsAppMessage({
                      code: selectedGiftCardForQr.code,
                      amount: selectedGiftCardForQr.remainingBalance,
                      currencySymbol: selectedGiftCardForQr.currencySymbol || currency,
                      storeName: settings.storeName || config.distributorName,
                      recipientName: selectedGiftCardForQr.recipientName,
                      buyerName: selectedGiftCardForQr.buyerName,
                      message: selectedGiftCardForQr.message,
                      expiresAt: selectedGiftCardForQr.expiresAt,
                      catalogUrl: cardUrl,
                    });
                    window.open(
                      createWhatsAppUrl(selectedGiftCardForQr.recipientPhone || '', msg),
                      '_blank',
                      'noopener,noreferrer'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Enviar por WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
