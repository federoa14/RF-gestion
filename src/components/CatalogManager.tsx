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
} from 'lucide-react';
import {
  CatalogPickupOrder,
  CatalogProduct,
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
import type { ReceiptModalData } from './PaymentReceiptModal';

interface CatalogManagerProps {
  config: DistributorConfig;
  tenant: Tenant | null;
  settings: OnlineCatalogSettings;
  products: CatalogProduct[];
  orders: CatalogPickupOrder[];
  activeUserName?: string;
  onSaveSettings: (next: OnlineCatalogSettings) => void;
  onSaveProducts: (next: CatalogProduct[]) => void;
  onSaveOrders: (next: CatalogPickupOrder[]) => void;
  onRefreshOrders?: () => Promise<void>;
  onBillOrder?: (order: CatalogPickupOrder) => void;
  onOpenReceipt?: (receipt: ReceiptModalData) => void;
  onOpenPublicPreview: (handle: string) => void;
  showToast: (msg: string) => void;
}

const DEFAULT_CATEGORIES = [
  'Destacados',
  'Bebidas',
  'Almacén',
  'Indumentaria',
  'Limpieza',
  'Combos y Ofertas',
  'General',
];

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
  activeUserName,
  onSaveSettings,
  onSaveProducts,
  onSaveOrders,
  onRefreshOrders,
  onBillOrder,
  onOpenReceipt,
  onOpenPublicPreview,
  showToast,
}) => {
  const [subTab, setSubTab] = useState<'productos' | 'configuracion' | 'pedidos'>('productos');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRefreshingOrders, setIsRefreshingOrders] = useState(false);
  const [isEditingWhatsappInline, setIsEditingWhatsappInline] = useState(false);
  const [inlineWhatsappDraft, setInlineWhatsappDraft] = useState(
    () => settings.whatsappPhone || config.senderPhone || config.distributorPhone || ''
  );

  // Store settings local draft
  const [draftSettings, setDraftSettings] = useState<OnlineCatalogSettings>(() => ({
    published: settings.published !== false,
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
    setInlineWhatsappDraft(resolvedPhone);
    setDraftSettings({
      published: settings.published !== false,
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
  }, [settings, tenant?.id, config.distributorName, config.senderPhone, config.distributorPhone, config.currencySymbol]);

  // Product Form Modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productCategory, setProductCategory] = useState('General');
  const [productUnitLabel, setProductUnitLabel] = useState('Unidad');
  const [productDescription, setProductDescription] = useState('');
  const [productImageUrl, setProductImageUrl] = useState('');
  const [productAvailable, setProductAvailable] = useState(true);
  const [productFeatured, setProductFeatured] = useState(false);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
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

  const availableCategories = useMemo(() => {
    const set = new Set<string>(['Todas']);
    products.forEach((p) => {
      if (p.category?.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'Todas' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, searchTerm, selectedCategory]);

  const activeProductsCount = useMemo(
    () => products.filter((p) => p.available).length,
    [products]
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

  const openNewProductModal = () => {
    setEditingProduct(null);
    setProductName('');
    setProductPrice('');
    setProductCategory('General');
    setProductUnitLabel('Unidad');
    setProductDescription('');
    setProductImageUrl('');
    setProductAvailable(true);
    setProductFeatured(false);
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product: CatalogProduct) => {
    setEditingProduct(product);
    setProductName(product.name);
    setProductPrice(String(product.price));
    setProductCategory(product.category || 'General');
    setProductUnitLabel(product.unitLabel || 'Unidad');
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

    const now = new Date().toISOString();
    if (editingProduct) {
      const updated = products.map((p) =>
        p.id === editingProduct.id
          ? {
              ...p,
              name: cleanName,
              price: numericPrice,
              category: productCategory.trim() || 'General',
              unitLabel: productUnitLabel.trim() || 'Unidad',
              description: productDescription.trim(),
              imageUrl: productImageUrl.trim() || undefined,
              available: productAvailable,
              featured: productFeatured,
              updatedAt: now,
            }
          : p
      );
      onSaveProducts(updated);
      showToast(`Producto "${cleanName}" actualizado en el catálogo.`);
    } else {
      const created: CatalogProduct = {
        id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        price: numericPrice,
        category: productCategory.trim() || 'General',
        unitLabel: productUnitLabel.trim() || 'Unidad',
        description: productDescription.trim(),
        imageUrl: productImageUrl.trim() || undefined,
        available: productAvailable,
        featured: productFeatured,
        createdAt: now,
        updatedAt: now,
      };
      onSaveProducts([created, ...products]);
      showToast(`Producto "${cleanName}" publicado en tu catálogo online.`);
    }
    setIsProductModalOpen(false);
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
    const next: OnlineCatalogSettings = {
      ...draftSettings,
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
    showToast('Configuración y enlace del catálogo guardados y publicados.');
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

    const isPaidOnDispatch =
      order.status === 'retirado' &&
      (paymentKey === 'efectivo' || paymentKey === 'transferencia' || paymentKey === 'link_pago');

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

  const handleUpdateOrderStatus = (
    orderId: string,
    status: CatalogPickupOrder['status']
  ) => {
    const target = orders.find((o) => o.id === orderId);
    const isDispatchStatus =
      status === 'listo_para_retirar' || status === 'en_camino' || status === 'retirado';

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
            <div className="w-11 h-11 rounded-xl bg-[#0B1933] text-white flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
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
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Cargá fotos, precio y descripción. Compartí el enlace para que tus clientes armen su pedido y lo envíen a tu WhatsApp para pasar a retirar.
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
              Productos ({products.length})
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

          <div className="flex items-center gap-4 text-xs text-slate-500 font-medium tabular-nums">
            <span>
              <strong className="text-slate-800">{activeProductsCount}</strong> activos
            </span>
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
          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar producto por nombre o descripción..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#0B1933]/20"
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

          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-sm font-bold text-slate-900">
                  {products.length === 0
                    ? 'Todavía no cargaste productos en tu catálogo'
                    : 'No hay productos que coincidan con tu búsqueda'}
                </h3>
                <p className="text-xs text-slate-500">
                  {products.length === 0
                    ? 'Agregá tu primer artículo con imagen, precio y descripción para publicar tu catálogo online y recibir pedidos por WhatsApp.'
                    : 'Probá cambiando el texto o la categoría seleccionada.'}
                </p>
              </div>
              {products.length === 0 && (
                <button
                  type="button"
                  onClick={openNewProductModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cargar Primer Producto</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
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
                        className="w-full h-full object-cover"
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
                  </div>

                  {/* Card Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {product.category || 'General'} · {product.unitLabel || 'Unidad'}
                        </span>
                        <span
                          className={`font-semibold shrink-0 ${
                            product.available ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {product.available ? 'En stock' : 'Pausado'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                        {product.name}
                      </h3>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {product.description || 'Sin descripción cargada.'}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                        {formatCurrency(product.price, currency)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleToggleProductAvailability(product.id)}
                          title={product.available ? 'Pausar publicación' : 'Activar stock'}
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
                          title="Editar producto"
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
              ))}
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
                            ? 'Entregado / Retirado'
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

                      <div className="text-xs text-slate-700 space-y-0.5">
                        {order.items.map((it, i) => (
                          <div key={`${order.id}-${i}`} className="tabular-nums">
                            {it.quantity} × <strong>{it.productName}</strong>{' '}
                            <span className="text-slate-500">
                              ({formatCurrency(it.unitPrice, order.currencySymbol || currency)} c/u ={' '}
                              <strong className="text-slate-700">
                                {formatCurrency(it.subtotal, order.currencySymbol || currency)}
                              </strong>
                              )
                            </span>
                          </div>
                        ))}
                      </div>

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
                          <option value="retirado">Entregado / Retirado</option>
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
                    placeholder="Ej. Pack Gaseosa 2.25L x 6 unidades"
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

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Categoría</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {DEFAULT_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setProductCategory(cat)}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
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
                    placeholder="Categoría personalizada"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
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
    </div>
  );
};
