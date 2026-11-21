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
} from 'lucide-react';
import {
  CatalogPickupOrder,
  CatalogProduct,
  CatalogStockAlertRequest,
  DistributorConfig,
  OnlineCatalogSettings,
  SaleLineItem,
  Tenant,
} from '../types';
import { formatCurrency } from '../utils/alerts';
import {
  createWhatsAppUrl,
  generatePaymentReceiptWhatsAppMessage,
} from '../utils/whatsapp';
import { buildPublicCatalogHandle } from '../utils/supabaseServices';
import {
  getCatalogRubroPreset,
  normalizeFilterList,
} from '../utils/catalogRubros';
import { BrandMark } from './BrandMark';
import type { ReceiptModalData } from './PaymentReceiptModal';
import { WebOrderDetailModal } from './WebOrderDetailModal';

interface CatalogManagerProps {
  config: DistributorConfig;
  tenant: Tenant | null;
  settings: OnlineCatalogSettings;
  products: CatalogProduct[];
  orders: CatalogPickupOrder[];
  stockAlerts?: CatalogStockAlertRequest[];
  activeUserName?: string;
  onSaveSettings: (next: OnlineCatalogSettings) => void;
  onSaveProducts: (next: CatalogProduct[]) => void;
  onSaveOrders: (next: CatalogPickupOrder[]) => void;
  onSaveStockAlerts?: (next: CatalogStockAlertRequest[]) => void;
  onRefreshOrders?: () => Promise<void>;
  onRefreshStockAlerts?: () => Promise<void>;
  onBillOrder?: (order: CatalogPickupOrder) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onOpenPublicPreview: (handle: string) => void;
  onOpenEditBrand?: () => void;
  showToast: (msg: string) => void;
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

export const CatalogManager: React.FC<CatalogManagerProps> = ({
  config,
  tenant,
  settings,
  products,
  orders,
  stockAlerts = [],
  activeUserName,
  onSaveSettings,
  onSaveProducts,
  onSaveOrders,
  onSaveStockAlerts,
  onRefreshOrders,
  onRefreshStockAlerts,
  onBillOrder,
  onOpenReceipt,
  onOpenPublicPreview,
  onOpenEditBrand,
  showToast,
}) => {
  const [subTab, setSubTab] = useState<'productos' | 'pedidos' | 'avisos_stock' | 'configuracion'>('productos');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedSubfilter, setSelectedSubfilter] = useState<string>('Todos');
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

  // Product Form Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [productName, setProductName] = useState('');
  const [productSku, setProductSku] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStockQuantity, setProductStockQuantity] = useState('');
  const [productCategory, setProductCategory] = useState('General');
  const [productSubfilters, setProductSubfilters] = useState<string[]>([]);
  const [modalNewSubfilter, setModalNewSubfilter] = useState('');
  const [productUnitLabel, setProductUnitLabel] = useState('Unidad');
  const [productDescription, setProductDescription] = useState('');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productAvailable, setProductAvailable] = useState(true);
  const [productFeatured, setProductFeatured] = useState(false);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<CatalogPickupOrder | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rubroProducts.filter((p) => {
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
        (p.subfilters || []).some((sf) => sf.toLowerCase().includes(q))
      );
    });
  }, [rubroProducts, searchTerm, selectedCategory, selectedSubfilter]);

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
        (p) => p.available && typeof p.stockQuantity === 'number' && p.stockQuantity <= 0
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
    setProductUnitLabel(rubroPreset.defaultUnitLabel || 'Unidad');
    setProductDescription('');
    setProductImageUrl('');
    setProductAvailable(true);
    setProductFeatured(false);
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
    setProductCategory(product.category || activeRubroFilters[0] || 'General');
    setProductSubfilters(normalizeFilterList(product.subfilters));
    setModalNewSubfilter('');
    setProductUnitLabel(product.unitLabel || rubroPreset.defaultUnitLabel || 'Unidad');
    setProductDescription(product.description || '');
    setProductImageUrl(product.imageUrl || '');
    setProductAvailable(product.available);
    setProductFeatured(Boolean(product.featured));
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

  const handleSubmitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = productName.trim();
    const numericPrice = Number(String(productPrice).replace(',', '.'));
    if (!cleanName) {
      showToast('Ingresá el nombre del producto.');
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      showToast('Ingresá un precio válido.');
      return;
    }

    const trimmedStock = productStockQuantity.trim();
    let parsedStock: number | undefined = undefined;
    if (trimmedStock !== '') {
      const numericStock = Number(trimmedStock);
      if (!Number.isFinite(numericStock) || numericStock < 0) {
        showToast('Ingresá una cantidad de stock válida (0 o mayor), o dejalo vacío para stock libre.');
        return;
      }
      parsedStock = Math.floor(numericStock);
    }

    const cleanSubfilters = normalizeFilterList(productSubfilters);
    const cleanCategory = productCategory.trim() || activeRubroFilters[0] || 'General';
    const now = new Date().toISOString();
    const cleanSku = productSku.trim() || undefined;

    if (editingProduct) {
      const wasOutOfStock =
        typeof editingProduct.stockQuantity === 'number' && editingProduct.stockQuantity <= 0;
      const isNowInStock = parsedStock === undefined || parsedStock > 0;
      const waitingCount = pendingAlertsByProductId.get(editingProduct.id) || 0;

      const updated = products.map((p) =>
        p.id === editingProduct.id
          ? {
              ...p,
              name: cleanName,
              sku: cleanSku,
              price: numericPrice,
              stockQuantity: parsedStock,
              rubro: activeCatalogRubro,
              category: cleanCategory,
              subfilters: cleanSubfilters,
              unitLabel: productUnitLabel.trim() || rubroPreset.defaultUnitLabel || 'Unidad',
              description: productDescription.trim(),
              imageUrl: productImageUrl.trim() || undefined,
              available: productAvailable,
              featured: productFeatured,
              updatedAt: now,
            }
          : p
      );
      onSaveProducts(updated);
      if (wasOutOfStock && isNowInStock && waitingCount > 0) {
        showToast(
          `Stock repuesto en "${cleanName}". Tenés ${waitingCount} cliente(s) para avisar en "Avisos de Stock".`
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
        stockQuantity: parsedStock,
        rubro: activeCatalogRubro,
        category: cleanCategory,
        subfilters: cleanSubfilters,
        unitLabel: productUnitLabel.trim() || rubroPreset.defaultUnitLabel || 'Unidad',
        description: productDescription.trim(),
        imageUrl: productImageUrl.trim() || undefined,
        available: productAvailable,
        featured: productFeatured,
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

  const handleNotifyStockAlertWhatsApp = (alert: CatalogStockAlertRequest) => {
    const storeTitle = settings.storeName || config.distributorName || 'Nuestra Tienda';
    const skuPart = alert.productSku ? ` (Cód: ${alert.productSku})` : '';
    const message =
      `Hola ${alert.customerName}! 👋 Te avisamos de *${storeTitle}* que ya volvió a entrar stock de *${alert.productName}*${skuPart}.\n\n` +
      `Podés verlo y hacer tu pedido directo desde nuestro catálogo online:\n🔗 ${publicUrl}\n\n` +
      `¡Gracias por esperar!`;
    window.open(createWhatsAppUrl(alert.customerPhone, message), '_blank', 'noopener,noreferrer');

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
    showToast(`Aviso enviado por WhatsApp a ${alert.customerName}.`);
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
    const cleanRubroFilters = normalizeFilterList(draftSettings.rubroFilters);
    const next: OnlineCatalogSettings = {
      ...draftSettings,
      catalogRubro: activeCatalogRubro,
      rubroFilters:
        cleanRubroFilters.length > 0 ? cleanRubroFilters : rubroPreset.defaultFilters,
      customSubfilters: normalizeFilterList(draftSettings.customSubfilters),
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
      updatedAt: new Date().toISOString(),
    };
    setDraftSettings(next);
    onSaveSettings(next);
    showToast('Configuración, filtros y enlace del catálogo guardados y publicados.');
  };

  const resolveOrderPaymentLabel = (
    method: CatalogPickupOrder['confirmedPaymentMethod'] | CatalogPickupOrder['preferredPaymentMethod'],
    isDelivery: boolean
  ): string => {
    switch (method) {
      case 'transferencia':
        return 'Transferencia bancaria / Alias';
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

    const lineItems: SaleLineItem[] = order.items.map((it, idx) => ({
      id: `desp-it-${order.id}-${idx}`,
      name: it.unitLabel ? `${it.productName} (${it.unitLabel})` : it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      subtotal: it.subtotal,
      paymentMode: paymentKey === 'fiado' ? 'un_pago_fiado' : 'contado_hoy',
    }));

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
      notes: order.notes,
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

    const now = new Date().toISOString();
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
          `• ${it.quantity} × ${it.productName}: ${formatCurrency(it.subtotal, orderCurrency)}`
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
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
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

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
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
              onClick={() => setSubTab('avisos_stock')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                subTab === 'avisos_stock'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              <span>Avisos de Stock</span>
              {pendingStockAlertsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-amber-600 text-white text-[10px] font-mono tabular-nums">
                  {pendingStockAlertsCount}
                </span>
              )}
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
              Tienda, Envíos y Retiro
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-medium tabular-nums">
            <span>
              <strong className="text-slate-800">{activeProductsCount}</strong> activos
            </span>
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

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
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
          </div>

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
                const hasTrackedStock = typeof product.stockQuantity === 'number';
                const stockQty = hasTrackedStock ? Math.max(0, Math.floor(product.stockQuantity as number)) : null;
                const isOutOfStock = stockQty !== null && stockQty <= 0;
                const waitingAlerts = pendingAlertsByProductId.get(product.id) || 0;

                return (
                  <div
                    key={product.id}
                    className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-sm ${
                      product.available ? 'border-slate-200' : 'border-slate-200 opacity-75'
                    }`}
                  >
                    {/* Product Image Container */}
                    <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
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
                      {product.featured && (
                        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                          <Star className="w-3 h-3 fill-current" />
                          <span>Destacado</span>
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
                          <span className="truncate">
                            {product.category || 'General'} · {product.unitLabel || 'Unidad'}
                            {product.sku ? ` · Cód: ${product.sku}` : ''}
                          </span>
                          <span
                            className={`font-semibold shrink-0 tabular-nums ${
                              !product.available
                                ? 'text-slate-500'
                                : isOutOfStock
                                ? 'text-rose-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {!product.available
                              ? 'Pausado'
                              : isOutOfStock
                              ? 'Sin stock'
                              : stockQty !== null
                              ? `Stock: ${stockQty} u.`
                              : 'Stock libre'}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                          {product.name}
                        </h3>
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

                        {/* Quick Inline Stock Control */}
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

                          {waitingAlerts > 0 && (
                            <button
                              type="button"
                              onClick={() => setSubTab('avisos_stock')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold hover:bg-amber-100 cursor-pointer"
                            >
                              <Bell className="w-3 h-3" />
                              <span>{waitingAlerts} esperando aviso</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                          {formatCurrency(product.price, currency)}
                        </span>
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
                Además de llegarte al WhatsApp, cada pedido queda guardado aquí para facturarlo, enviarlo o avisar retiro y cobrar por WhatsApp.
              </p>
            </div>
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

          {orders.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
              Todavía no ingresaron pedidos desde el enlace público de tu catálogo.
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const isDelivery = order.deliveryMethod === 'envio';
                const activePaymentKey =
                  order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
                const paymentMethodLabel = resolveOrderPaymentLabel(activePaymentKey, isDelivery);

                return (
                  <div
                    key={order.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50"
                  >
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          #{order.orderNumber}
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          {order.customerName}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {order.customerPhone}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                            isDelivery
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          {isDelivery ? (
                            <>
                              <Truck className="w-3 h-3" />
                              <span>Envío a domicilio</span>
                            </>
                          ) : (
                            <>
                              <Store className="w-3 h-3" />
                              <span>Retiro en tienda</span>
                            </>
                          )}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                            order.status === 'retirado'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : order.status === 'listo_para_retirar' || order.status === 'en_camino'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : order.status === 'cancelado'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {order.status === 'pendiente_retiro'
                            ? 'Pendiente de armado'
                            : order.status === 'listo_para_retirar'
                            ? isDelivery
                              ? 'Listo para despachar'
                              : 'Listo para retirar'
                            : order.status === 'en_camino'
                            ? 'En camino (Envío)'
                            : order.status === 'retirado'
                            ? 'Retirado / Pagado'
                            : 'Cancelado'}
                        </span>
                        {order.linkedBoletaNumber && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                            <Receipt className="w-3 h-3" />
                            <span>Facturado #{order.linkedBoletaNumber}</span>
                          </span>
                        )}
                        {order.dispatchReceiptNumber && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 text-sky-800 border border-sky-200 font-mono">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Comprobante {order.dispatchReceiptNumber}</span>
                          </span>
                        )}
                      </div>

                      {isDelivery && order.deliveryAddress && (
                        <div className="inline-flex items-center gap-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1">
                          <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>
                            <strong>Dirección de envío:</strong> {order.deliveryAddress}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetail(order)}
                        className="w-full text-left group space-y-1.5 pt-0.5 cursor-pointer rounded-lg hover:bg-white/90 p-1.5 -m-1.5 transition-colors"
                        title="Clic para abrir la venta y ver fotos y códigos grandes"
                      >
                        {order.items.map((it, i) => {
                          const matched =
                            productMap.byId.get(it.productId) ||
                            productMap.byName.get(it.productName.trim().toLowerCase());
                          const thumb = matched?.imageUrl || it.imageUrl;
                          const skuCode = (it.sku || matched?.sku || '').trim();
                          return (
                            <div key={`${order.id}-${i}`} className="flex items-center gap-2.5 text-xs text-slate-700">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={it.productName}
                                  referrerPolicy="no-referrer"
                                  className="w-9 h-9 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                  <ImageIcon className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0 tabular-nums">
                                <span className="font-bold text-slate-900">
                                  {it.quantity} × {it.productName}
                                </span>
                                {skuCode && (
                                  <span className="ml-1.5 font-mono text-[11px] font-semibold text-[#0B1933] bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded">
                                    Cód: {skuCode}
                                  </span>
                                )}{' '}
                                <span className="text-slate-500">
                                  ({formatCurrency(it.unitPrice, order.currencySymbol || currency)} c/u ={' '}
                                  <strong className="text-slate-700">
                                    {formatCurrency(it.subtotal, order.currencySymbol || currency)}
                                  </strong>
                                  )
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </button>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                        {order.preferredPickupWindow && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {isDelivery ? 'Horario envío:' : 'Retiro estimado:'}{' '}
                              {order.preferredPickupWindow}
                            </span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <CreditCard className="w-3 h-3" />
                          <span>Forma de pago: {paymentMethodLabel}</span>
                        </span>
                        {order.notes && <span>Nota: {order.notes}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-2 shrink-0">
                      <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                        Valor final:{' '}
                        {formatCurrency(order.totalAmount, order.currencySymbol || currency)}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedOrderForDetail(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#0B1933]/30 bg-white hover:bg-slate-100 text-[#0B1933] cursor-pointer whitespace-nowrap"
                          title="Abrir venta para ver fotos ampliadas, códigos y tildar productos a entregar"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Abrir Venta (Fotos / Cód.)</span>
                        </button>

                        {order.status !== 'retirado' && order.status !== 'cancelado' && (
                          <button
                            type="button"
                            onClick={() => handleMarkOrderPaidPickedUp(order)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                            title="Confirmar como retirado/entregado y pagado para sumarlo al dinero generado en la web"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isDelivery ? 'Entregado (Pagado)' : 'Marcar Retirado (Pagado)'}</span>
                          </button>
                        )}

                        <select
                          aria-label="Forma de pago del pedido"
                          value={activePaymentKey}
                          onChange={(e) =>
                            handleUpdateOrderPaymentMethod(
                              order.id,
                              e.target.value as NonNullable<
                                CatalogPickupOrder['confirmedPaymentMethod']
                              >
                            )
                          }
                          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                        >
                          <option value="acordar">Pago: A coordinar</option>
                          <option value="transferencia">Pago: Transferencia / Alias</option>
                          <option value="link_pago">Pago: Link de Pago / MP</option>
                          <option value="efectivo">
                            {isDelivery ? 'Pago: Efectivo contra entrega' : 'Pago: Efectivo en local'}
                          </option>
                          <option value="fiado">Pago: Cuenta Corriente / Fiado</option>
                        </select>

                        <select
                          aria-label="Estado de despacho del pedido"
                          value={order.status}
                          onChange={(e) =>
                            handleUpdateOrderStatus(
                              order.id,
                              e.target.value as CatalogPickupOrder['status']
                            )
                          }
                          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                        >
                          <option value="pendiente_retiro">Pendiente de armado</option>
                          <option value="listo_para_retirar">
                            {isDelivery ? 'Listo para despachar' : 'Listo para retirar'}
                          </option>
                          <option value="en_camino">En camino (Envío)</option>
                          <option value="retirado">Retirado / Entregado (Pagado)</option>
                          <option value="cancelado">Cancelado</option>
                        </select>

                        {onBillOrder && (
                          <button
                            type="button"
                            disabled={Boolean(order.linkedBoletaNumber)}
                            onClick={() => onBillOrder(order)}
                            title={
                              order.linkedBoletaNumber
                                ? `Ya facturado en Boleta #${order.linkedBoletaNumber}`
                                : 'Generar cliente y boleta para facturar este pedido'
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                              order.linkedBoletaNumber
                                ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-default'
                                : 'bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer'
                            }`}
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>
                              {order.linkedBoletaNumber
                                ? `Boleta #${order.linkedBoletaNumber}`
                                : 'Facturar Pedido'}
                            </span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDispatchAndOpenReceipt(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white cursor-pointer whitespace-nowrap"
                          title="Generar comprobante visual y de WhatsApp con producto, precio, valor final y forma de pago"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-300" />
                          <span>
                            {order.dispatchReceiptNumber
                              ? 'Comprobante Despacho'
                              : 'Despachar y Comprobante'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleWhatsAppCustomerCollectPayment(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer whitespace-nowrap"
                          title="Enviar Alias, Link de pago y detalle por WhatsApp para cobrarle"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Cobrar por WhatsApp</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleWhatsAppCustomerReady(order)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer whitespace-nowrap"
                          title="Enviar el comprobante completo por WhatsApp al comprador"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Enviar Comprobante WA</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2B: AVISOS DE STOCK SOLICITADOS POR CLIENTES */}
      {subTab === 'avisos_stock' && (
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
                const liveStock =
                  liveProduct && typeof liveProduct.stockQuantity === 'number'
                    ? liveProduct.stockQuantity
                    : null;
                const isRestocked =
                  Boolean(liveProduct?.available) && (liveStock === null || liveStock > 0);

                return (
                  <div
                    key={alert.id}
                    className={`border rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                      alert.status === 'pending'
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
                Formas de pago al retirar
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

            <div className="sm:col-span-2 p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-slate-700">
              <strong>Datos para cobrar por WhatsApp:</strong>{' '}
              {config.merchantPaymentAlias?.trim() || config.merchantMpCheckoutLink?.trim() ? (
                <span>
                  El botón <em>Cobrar por WhatsApp</em> usará tu{' '}
                  {config.merchantPaymentAlias ? `Alias (${config.merchantPaymentAlias})` : ''}{' '}
                  {config.merchantMpCheckoutLink ? 'y Link de Mercado Pago' : ''} configurado en Administradores/Ajustes.
                </span>
              ) : (
                <span>
                  Podés cargar tu Alias, CVU y Link de Pago en la pestaña de Configuración / Administradores para enviarlos automáticamente al cobrar envíos por WhatsApp.
                </span>
              )}
            </div>
          </div>

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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Nombre del producto *
                  </label>
                  <input
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder={rubroPreset.productPlaceholder}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Precio ({currency}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
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
                    Cantidad en stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={productStockQuantity}
                    onChange={(e) => setProductStockQuantity(e.target.value)}
                    placeholder="Vacío = stock libre"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
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

                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productFeatured}
                    onChange={(e) => setProductFeatured(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Marcar como destacado</span>
                </label>
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
        onWhatsAppCollect={handleWhatsAppCustomerCollectPayment}
      />
    </div>
  );
};
