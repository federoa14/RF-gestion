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
} from 'lucide-react';
import {
  CatalogPickupOrder,
  CatalogProduct,
  PublishedPublicCatalog,
} from '../types';
import {
  fetchPublicCatalogFromSupabase,
  submitPublicCatalogOrderToSupabase,
} from '../utils/supabaseServices';
import { formatCurrency } from '../utils/alerts';
import { createWhatsAppUrl } from '../utils/whatsapp';
import { BrandMark } from './BrandMark';

interface PublicCatalogViewProps {
  catalogHandle: string;
  onExitToApp: () => void;
}

interface CartEntry {
  product: CatalogProduct;
  quantity: number;
}

export const PublicCatalogView: React.FC<PublicCatalogViewProps> = ({
  catalogHandle,
  onExitToApp,
}) => {
  const [catalog, setCatalog] = useState<PublishedPublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Checkout pickup / delivery fields
  const [deliveryMethod, setDeliveryMethod] = useState<'retiro' | 'envio'>('retiro');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupWindow, setPickupWindow] = useState('Hoy en horario comercial');
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<
    'acordar' | 'transferencia' | 'efectivo' | 'link_pago'
  >('acordar');
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<{
    order: CatalogPickupOrder;
    whatsappUrl: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPublicCatalogFromSupabase(catalogHandle)
      .then((res) => {
        if (!active) return;
        setCatalog(res);
        if (res) {
          if (res.allowPickup === false && res.allowDelivery !== false) {
            setDeliveryMethod('envio');
          } else {
            setDeliveryMethod('retiro');
          }
        }
        if (res?.storeName) {
          document.title = `${res.storeName} · Catálogo Online`;
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [catalogHandle]);

  const activeProducts = useMemo(() => {
    if (!catalog?.products) return [];
    return catalog.products.filter((p) => p.available);
  }, [catalog]);

  const categories = useMemo(() => {
    const set = new Set<string>(['Todas']);
    activeProducts.forEach((p) => {
      if (p.category?.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [activeProducts]);

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
        if (tokens.length === 0) return true;
        const searchable = normalizeSearchText(
          `${p.name || ''} ${p.description || ''} ${p.category || ''} ${p.unitLabel || ''}`
        );
        return tokens.every((token) => searchable.includes(token));
      })
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  }, [activeProducts, searchTerm, selectedCategory]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalCartUnits = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );
  const totalCartAmount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cartItems]
  );

  const addToCart = (product: CatalogProduct) => {
    setCart((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: existing ? existing.quantity + 1 : 1,
        },
      };
    });
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return {
        ...prev,
        [productId]: { ...existing, quantity: nextQty },
      };
    });
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
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
      setFormError('Ingresá tu WhatsApp para que el vendedor pueda contactarte y coordinar.');
      return;
    }
    if (deliveryMethod === 'envio' && !deliveryAddress.trim()) {
      setFormError('Ingresá la dirección completa donde querés recibir el envío.');
      return;
    }

    setSubmitting(true);
    try {
      const currency = catalog.currencySymbol || '$';
      const orderNumber = `PED-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
      const nowIso = new Date().toISOString();

      const itemsPayload = cartItems.map((entry) => ({
        productId: entry.product.id,
        productName: entry.product.name,
        unitLabel: entry.product.unitLabel,
        unitPrice: entry.product.price,
        quantity: entry.quantity,
        subtotal: entry.product.price * entry.quantity,
      }));

      const order: CatalogPickupOrder = {
        id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        orderNumber,
        tenantId: catalog.tenantId,
        tenantCode: catalog.tenantCode,
        storeName: catalog.storeName,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deliveryMethod,
        deliveryAddress: deliveryMethod === 'envio' ? deliveryAddress.trim() : undefined,
        preferredPickupWindow: pickupWindow.trim() || 'A coordinar',
        preferredPaymentMethod,
        notes: orderNotes.trim() || undefined,
        items: itemsPayload,
        totalAmount: totalCartAmount,
        currencySymbol: currency,
        status: 'pendiente_retiro',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await submitPublicCatalogOrderToSupabase(order);

      const itemLines = itemsPayload
        .map(
          (it) =>
            `• ${it.quantity} × ${it.productName}${
              it.unitLabel ? ` (${it.unitLabel})` : ''
            } — ${formatCurrency(it.unitPrice, currency)} c/u = *${formatCurrency(it.subtotal, currency)}*`
        )
        .join('\n');

      const paymentLabelMap: Record<typeof preferredPaymentMethod, string> = {
        acordar: 'A coordinar con el vendedor',
        transferencia: 'Transferencia bancaria / Alias',
        efectivo: deliveryMethod === 'envio' ? 'Efectivo contra entrega' : 'Efectivo al retirar',
        link_pago: 'Link de pago / Mercado Pago',
      };

      const modalityBlock =
        deliveryMethod === 'envio'
          ? `🚚 *Modalidad:* ENVÍO A DOMICILIO\n` +
            `📍 *Dirección de entrega:* ${order.deliveryAddress}\n` +
            `🕒 *Horario preferido:* ${order.preferredPickupWindow}\n`
          : `🏪 *Modalidad:* RETIRO EN TIENDA\n` +
            (catalog.pickupAddress ? `📍 *Local:* ${catalog.pickupAddress}\n` : '') +
            `🕒 *Retiro estimado:* ${order.preferredPickupWindow}\n`;

      const closingText =
        deliveryMethod === 'envio'
          ? 'Te envío el pedido para facturar, coordinar el envío y confirmarme el pago por WhatsApp. ¡Muchas gracias!'
          : 'Te envío el pedido para facturar/armar y avisarme cuando esté listo para pasar a retirar. ¡Muchas gracias!';

      const message =
        `🛒 *NUEVO PEDIDO ONLINE — #${orderNumber}*\n` +
        `Tienda: *${catalog.storeName}*\n\n` +
        `👤 *Cliente:* ${order.customerName}\n` +
        `📱 *WhatsApp cliente:* ${order.customerPhone}\n` +
        modalityBlock +
        `💳 *Forma de pago:* ${paymentLabelMap[preferredPaymentMethod]}\n` +
        `\n*Detalle para facturar (${itemsPayload.length} ítem${itemsPayload.length === 1 ? '' : 's'}):*\n${itemLines}\n\n` +
        `💰 *TOTAL DEL PEDIDO: ${formatCurrency(order.totalAmount, currency)}*\n` +
        (order.notes ? `📝 *Notas:* ${order.notes}\n` : '') +
        `\n${closingText}`;

      const targetPhone = (catalog.whatsappPhone || '').trim();
      const whatsappUrl = targetPhone
        ? createWhatsAppUrl(targetPhone, message)
        : `https://wa.me/?text=${encodeURIComponent(message)}`;

      setSubmittedOrder({ order, whatsappUrl });
      setCart({});
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
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
                Catálogo Online · Carrito por WhatsApp
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
          <div className="space-y-2 max-w-2xl">
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

          {activeProducts.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono tabular-nums">
                {searchTerm.trim() || selectedCategory !== 'Todas' ? (
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

              {(searchTerm.trim() || selectedCategory !== 'Todas') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('Todas');
                  }}
                  className="text-xs font-semibold text-[#0B1933] hover:underline cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>

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
            {activeProducts.length > 0 && (searchTerm.trim() || selectedCategory !== 'Todas') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('Todas');
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
              const inCart = cart[product.id];
              return (
                <article
                  key={product.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                >
                  <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-gradient-to-br from-slate-100 to-slate-200">
                        <ImageIcon className="w-9 h-9 opacity-50" />
                      </div>
                    )}
                    {product.featured && (
                      <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                        <Star className="w-3 h-3 fill-current" />
                        <span>Destacado</span>
                      </span>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-slate-500 truncate">
                        {product.category || 'General'} · {product.unitLabel || 'Unidad'}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 leading-snug">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                          {product.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                        {formatCurrency(product.price, currency)}
                      </span>

                      {inCart ? (
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-1">
                            <button
                              type="button"
                              onClick={() => updateCartQty(product.id, -1)}
                              className="w-7 h-7 rounded-lg bg-white hover:bg-slate-50 text-slate-800 flex items-center justify-center border border-slate-200 cursor-pointer"
                              aria-label="Restar unidad"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-7 text-center text-xs font-mono tabular-nums font-bold text-slate-900">
                              {inCart.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(product.id, 1)}
                              className="w-7 h-7 rounded-lg bg-[#0B1933] hover:bg-[#13264A] text-white flex items-center justify-center cursor-pointer"
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
                          onClick={() => addToCart(product)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0B1933] hover:bg-[#13264A] text-white transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Agregar al carrito</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
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
                <div className="space-y-4 py-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-2.5">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                    <h3 className="text-base font-bold text-slate-900">
                      Pedido #{submittedOrder.order.orderNumber} listo para enviar
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Registramos tu pedido por{' '}
                      <strong className="font-mono tabular-nums">
                        {formatCurrency(submittedOrder.order.totalAmount, currency)}
                      </strong>{' '}
                      ({submittedOrder.order.deliveryMethod === 'envio' ? 'Envío a domicilio' : 'Retiro en tienda'}).
                      Si WhatsApp no se abrió automáticamente, tocá el botón de abajo para enviarlo al vendedor ahora.
                    </p>
                    <a
                      href={submittedOrder.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Enviar Pedido al WhatsApp del Vendedor</span>
                    </a>
                  </div>

                  {submittedOrder.order.deliveryMethod === 'envio' ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-slate-600" />
                        <span>Envío a domicilio</span>
                      </div>
                      <div className="text-slate-700">{submittedOrder.order.deliveryAddress}</div>
                      <div className="text-slate-500">
                        El vendedor te responderá por WhatsApp para coordinar el cobro y la entrega.
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
                    {cartItems.map(({ product, quantity }) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {product.name}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                            {formatCurrency(product.price, currency)} × {quantity} ={' '}
                            <strong className="text-slate-800">
                              {formatCurrency(product.price * quantity, currency)}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQty(product.id, -1)}
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
                            onClick={() => updateCartQty(product.id, 1)}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
                            aria-label="Sumar"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCartItem(product.id)}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                            title="Quitar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Subtotal Box */}
                  <div className="p-3.5 rounded-xl bg-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Total del carrito</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                      {formatCurrency(totalCartAmount, currency)}
                    </span>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">
                          ¿Cómo preferís pagar?
                        </label>
                        <select
                          value={preferredPaymentMethod}
                          onChange={(e) =>
                            setPreferredPaymentMethod(
                              e.target.value as
                                | 'acordar'
                                | 'transferencia'
                                | 'efectivo'
                                | 'link_pago'
                            )
                          }
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                        >
                          <option value="acordar">Coordinar por WhatsApp</option>
                          <option value="transferencia">Transferencia / Alias</option>
                          <option value="link_pago">Link de Pago / MP</option>
                          <option value="efectivo">
                            {deliveryMethod === 'envio' ? 'Efectivo contra entrega' : 'Efectivo al retirar'}
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Aclaraciones o datos para facturar (opcional)
                      </label>
                      <textarea
                        rows={2}
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="DNI/CUIT para factura, talles, timbre o referencia..."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                      />
                    </div>

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
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Generando pedido...'
                      : `Enviar por WhatsApp (${
                          deliveryMethod === 'envio' ? 'Envío' : 'Retiro'
                        } · ${formatCurrency(totalCartAmount, currency)})`}
                  </span>
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};
