export interface PurgedBoletaSummary {
  boletaNumber: string;
  saleDate: string;
  dueDate: string;
  termDays: number;
  originalAmount: number;
  balanceDue: number;
  salespersonName: string;
  purgedAt: string;
  reason: 'impaga_30dias' | 'pagada_30dias';
}

export interface ClientCreditHistory {
  reputationStatus: 'confiable' | 'regular' | 'problematico';
  totalHistoricalBoletas: number;
  totalPaidOnTime: number;
  totalLatePayments: number;
  totalPurgedUnpaid: number; // Boletas eliminadas sin cobrar (>30 días)
  totalPurgedDebtAmount: number; // Total adeudado de las boletas borradas
  purgedBoletas: PurgedBoletaSummary[]; // Historial liviano persistente de boletas purgadas
  lastIncidentDate?: string;
  lastEvaluatedAt: string;
  notes?: string;
}

export interface Client {
  id: string;
  clientNumber?: string; // Número de cliente editable (p. ej. "CLI-001", "104")
  name: string; // Nombre del comercio o razón social
  contactPerson: string; // Nombre completo de la persona / titular
  phone: string; // WhatsApp / Teléfono
  email: string;
  address: string;
  zone: string;
  assignedSalespersonId?: string; // Vendedor a cargo ("Cliente de quién es")
  assignedSalespersonName?: string; // Nombre del vendedor asignado
  cuitOrDni?: string;
  creditLimit?: number; // Tope máximo de fiado en pesos configurado por la distribuidora para este cliente
  notes?: string;
  creditHistory?: ClientCreditHistory; // Historial crediticio permanente (incluso si boletas de >30d se purgan)
  lastReactivationSentAt?: string; // YYYY-MM-DD de último mensaje enviado desde Radar de Clientes Fríos (Indumentaria)
  createdAt: string;
}

export interface Salesperson {
  id: string;
  name: string; // Nombre completo
  phone: string; // WhatsApp
  email: string;
  address: string; // Dirección donde vive
  birthDate: string; // Fecha de nacimiento (YYYY-MM-DD)
  zone: string;
  active: boolean;
}

export interface Administrator {
  id: string;
  name: string;
  phone: string; // WhatsApp para alertas
  email: string;
  role: 'dueño' | 'administrador' | 'finanzas';
  receiveAdminAlerts: boolean;
  isGeneralAdmin?: boolean; // Administrador general
}

export interface BroadcastMessage {
  id: string;
  title: string;
  content: string;
  type: 'promo' | 'aviso_general' | 'novedad_precios' | 'urgente';
  targetSalespersonIds: string[]; // IDs de vendedores destinatarios o 'all'
  sentAt: string;
}

export interface ReminderLog {
  id: string;
  date: string;
  type:
    | 'vendedor_2d'
    | 'admin_6d'
    | 'critical_10d'
    | 'critical_15d'
    | 'vendedor_3dias'
    | 'admin_5dias'
    | 'vence_hoy'
    | 'manual';
  channel: 'whatsapp' | 'email';
  recipient: string;
  note?: string;
}

export type BusinessRubro =
  | 'distribuidora'
  | 'indumentaria'
  | 'ecommerce_kiosco'
  | 'comercio_fiado'
  | 'cuenta_corriente';

export type SaleMode = 'standard' | 'sena_reserva' | 'cuotas_personales' | 'canasto_mixto';

export type SaleItemPaymentMode = 'contado_hoy' | 'un_pago_fiado' | 'cuotas';

export interface SaleLineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  paymentMode: SaleItemPaymentMode;
}

export interface PartialPayment {
  id: string;
  receiptNumber?: string; // N° de recibo emitido (ej. REC-4821)
  date: string; // YYYY-MM-DD
  amount: number; // Monto entregado a cuenta
  paymentMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
  notes?: string;
  receivedBy?: string;
  surchargeAdded?: number; // Interés/recargo sumado al saldo restante impago
  interestDiscounted?: number; // Interés bonificado al pagar más de una cuota o adelantar
}

export interface BoletaExtension {
  id: string;
  extendedAt: string; // ISO date/time
  addedDays: number; // Ej. +3, +5, +7, etc.
  previousDueDate: string;
  newDueDate: string;
  reason?: string;
  authorizedBy?: string;
}

export type BoletaCreditNoteReason =
  | 'cambio_talle'
  | 'falla_prenda'
  | 'no_le_quedo'
  | 'devolucion_parcial'
  | 'otro';

export interface BoletaCreditNote {
  id: string;
  creditNoteNumber: string; // Ej. "NC-4821"
  date: string; // YYYY-MM-DD
  amount: number; // Monto acreditado/descontado sobre la boleta o cuota (no ingresa dinero a caja)
  returnedItem: string; // Prenda o artículo devuelto
  reason: BoletaCreditNoteReason;
  notes?: string;
  recordedBy?: string;
}

export type CollectionVisitStatus =
  | 'promesa_pago'
  | 'local_cerrado'
  | 'pasar_mas_tarde'
  | 'no_estaba'
  | 'reprogramado_whatsapp';

export interface CollectionVisitLog {
  id: string;
  date: string; // YYYY-MM-DD (fecha de referencia de la gestión)
  timestamp: string; // ISO string
  outcome: CollectionVisitStatus;
  promisedDate?: string; // YYYY-MM-DD reprogramada / promesa de pago
  note?: string;
  recordedBy: string;
}

export interface Boleta {
  id: string;
  boletaNumber: string; // p. ej. "B-004812"
  clientId: string;
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  salespersonId: string;
  salespersonName: string;
  salespersonPhone?: string;
  saleDate: string; // YYYY-MM-DD
  amount: number; // Monto original total de la boleta
  termDays: number; // Por defecto 7 días, o 5, 10, 15, modificable
  dueDate: string; // YYYY-MM-DD (fecha de vencimiento actual, extendible)
  originalDueDate?: string; // Fecha de vencimiento original antes de prórrogas
  extensionDays?: number; // Total acumulado de días de prórroga otorgados
  extensions?: BoletaExtension[]; // Historial de prórrogas concedidas
  visitLogs?: CollectionVisitLog[]; // Registro de visitas en calle / promesas de pago
  promisedPaymentDate?: string; // YYYY-MM-DD de promesa de pago activa (reprograma Agenda Rápida sin borrar mora)
  lastVisitOutcome?: CollectionVisitStatus; // Resultado de la última visita o gestión
  lastVisitDate?: string; // YYYY-MM-DD de la última gestión registrada
  lastVisitNote?: string; // Observación de la última visita
  notes?: string;
  isSigned: boolean; // "Vuelven firmadas / fiadas"
  photoUrl?: string; // Foto de la boleta firmada
  status: 'pending' | 'paid' | 'cancelled';
  paidAt?: string;
  paymentMethod?: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
  paymentReference?: string;
  paymentNotes?: string;
  partialPayments?: PartialPayment[]; // Pagos parciales / entregas a cuenta
  remindersLog: ReminderLog[];
  createdAt: string;
  // Señas, Reservas y Ventas en Cuotas Personales (2 a 6 cuotas) + Detalle comercial y Canasto:
  planId?: string; // Agrupa cuotas pertenecientes a la misma venta
  basketId?: string; // Agrupa comprobantes generados desde el mismo canasto mixto
  saleMode?: SaleMode; // standard | sena_reserva | cuotas_personales | canasto_mixto
  itemSummary?: string; // Detalle de prendas, artículos o mercadería
  items?: SaleLineItem[]; // Desglose producto por producto (canasto / multi-item)
  baseAmount?: number; // Precio original de contado / sin interés ni recargo
  downPayment?: number; // Seña o entrega inicial recibida
  interestPercent?: number; // % de interés pactado en cuotas personales
  interestRatePercent?: number; // % de interés pactado en cuotas personales
  interestAmount?: number; // Interés incluido en esta boleta/cuota
  installmentNumber?: number; // N° de cuota (ej. 1)
  totalInstallments?: number; // Total de cuotas del plan (2 a 6)
  lateSurchargeApplied?: number; // Recargo/interés acumulado por pago incompleto o mora
  earlyPaymentDiscountApplied?: number; // Reducción de interés final por pago adelantado / excedente
  creditNotes?: BoletaCreditNote[]; // Notas de crédito / devoluciones de prendas (Rubro Indumentaria)
  totalCreditNotesAmount?: number; // Suma acumulada de devoluciones / NC aplicadas sin afectar caja
}

export interface AutoDispatchLog {
  id: string;
  timestamp: string;
  channel: 'whatsapp' | 'email' | 'both';
  recipientName: string;
  recipientRole: 'vendedor' | 'dueño' | 'cliente';
  recipientContact: string;
  recipientPhone?: string;
  recipientEmail?: string;
  boletasCount: number;
  totalAmount: number;
  messageSnippet: string;
  fullMessage?: string;
  whatsappUrl?: string;
  ruleMilestone?: '2d' | '6d' | '10d' | '15d' | 'overdue' | 'overdue_client' | 'blocked_charge' | 'daily_closing' | 'custom';
  status: 'sent' | 'simulated';
  deliveryStatus?: 'delivered' | 'sent' | 'queued' | 'gateway_api' | 'simulated';
  gatewayResponse?: string;
}

export interface DistributorConfig {
  distributorName: string;
  distributorPhone: string;
  distributorEmail: string;
  defaultTermDays: number; // Por defecto 7 días
  vendedorReminderDays: number; // Por defecto 2 días ("a los dos días a los vendedores")
  adminAlertDays: number; // Por defecto 6 días ("a los seis días le llegue la información a los dueños")
  overdueAlertDays: number; // Vencimiento final
  currencySymbol: string; // "$"
  activeAdminId?: string; // ID del administrador/usuario en sesión actual
  customCobranzaTemplate?: string; // Plantilla personalizada "Soy [Usuario] y necesito que vayas a cobrarle..."
  customOverdueTemplate?: string;
  // Campos de Automatización Directa (Manos Libres sin tocar botones):
  autoDispatchEnabled: boolean; // Si está activo el envío automático diario
  autoDispatchChannels: 'both' | 'whatsapp' | 'email'; // WhatsApp, Email o ambos
  autoDispatchTime: string; // Hora diaria de envío (ej. "08:00")
  senderPhone: string; // Teléfono emisor de WhatsApp de la distribuidora
  senderEmail: string; // Correo emisor de la distribuidora
  distributorLogoUrl?: string; // URL o base64 del logo de la distribuidora (editable)
  distributorIcon?: string; // Icono visual alternativo si no hay imagen (editable)
  lastAutoDispatchDate?: string; // Fecha de última ejecución automática
  // Resumen Automático de Cierre del Día por WhatsApp al Dueño:
  dailyClosingEnabled?: boolean; // Si se envía automáticamente el resumen de cierre del día
  dailyClosingTime?: string; // Horario de envío automático de cierre (ej. "19:00")
  lastDailyClosingDate?: string; // YYYY-MM-DD del último resumen de cierre despachado
  tenantId?: string; // Identificador de la distribuidora
  tenantCode?: string; // Código de acceso de la distribuidora (ej. "DIST-001")
  // Parámetros de Envío Directo y Pasarela WhatsApp:
  whatsappProvider?: 'server_daemon' | 'meta' | 'twilio' | 'webhook';
  whatsappApiToken?: string;
  whatsappPhoneNumberId?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromPhone?: string;
  webhookGatewayUrl?: string;
  webhookAuthKey?: string;
  notifyOwnerOnlyIfPertinent?: boolean; // Solo avisar al dueño si es pertinente (6d, 10d, 15d, mora o cobranza urgente)
  // Regla de Retención de 30 Días para ahorro de base de datos
  boletaRetentionDays?: number; // 30 días fijados por defecto
  lastRetentionPurgeDate?: string; // Fecha de la última purga ejecutada
  totalPurgedBoletasCount?: number; // Total histórico de boletas depuradas
  // Prórrogas y Margen de Vencido Crítico (Plata en la calle vencida):
  defaultExtensionDays?: number; // Días de prórroga rápida por defecto (ej. 3 o 5 días)
  overdueGraceDays?: number; // Días posteriores al vencimiento para figurar en rojo crítico (ej. 5 días)
  // Control de Envíos de WhatsApp a Clientes (Activación / Desactivación por Empresa):
  enableClientWhatsAppReminders?: boolean; // Activar o desactivar el envío de recordatorios por WhatsApp a clientes
  customClientOverdueTemplate?: string; // Plantilla personalizada para el recordatorio de factura vencida al cliente
  includeClientsInAutoDispatch?: boolean; // Si los clientes también reciben el recordatorio en el despacho automático
  // Tope de Fiado por defecto sugerido para nuevos clientes (cada distribuidora lo fija libremente, 0 = sin tope):
  defaultClientCreditLimit?: number;
  // Adaptación multi-rubro (Distribuidora / Indumentaria / Comercio con Fiado / Cuenta Corriente):
  businessRubro?: BusinessRubro;
  enforceSinglePendingBoleta?: boolean; // True = 1 boleta a la vez (distribuidora), False = permite múltiples cuotas / cuenta corriente
  // Alias propio del comercio para incluir en los mensajes de WhatsApp y links de pago a clientes:
  merchantPaymentAlias?: string;
  merchantPaymentCvu?: string;
  merchantPaymentBank?: string;
  merchantPaymentHolder?: string;
  merchantMpCheckoutLink?: string; // Link fijo MP opcional del comercio
  merchantMpAccessToken?: string; // Access Token Checkout Pro privado del comercio (para links automáticos)
  hasMerchantMpAccessToken?: boolean; // Indicador de si ya hay token guardado en servidor
  // Recargo opcional en plazos largos / pagos incompletos (SIN descuentos por pago en término):
  lateSurchargeEnabled?: boolean;
  lateSurchargePercent?: number; // Ej. 5% opcional tras vencimiento en plazos largos o saldo impago
  lateSurchargeAfterDays?: number; // Días posteriores al vencimiento para sugerir/aplicar recargo
  defaultInstallmentInterestPercent?: number; // % de interés sugerido para cuotas personales (2 a 6)
}

export interface ClientPaymentOrder {
  token: string;
  tenantId: string;
  distributorName: string;
  clientId: string;
  clientName: string;
  clientPhone?: string;
  amount: number;
  currencySymbol: string;
  boletaIds: string[];
  boletaNumbers: string[];
  alias?: string;
  cvu?: string;
  holderName?: string;
  bankName?: string;
  mpCheckoutLink?: string;
  mpInitPoint?: string;
  mpPreferenceId?: string;
  status: 'pending' | 'approved';
  paymentMethod?: 'mercadopago' | 'transferencia';
  mpPaymentId?: string;
  paidAt?: string;
  reconciledInApp?: boolean;
  reconciledAt?: string;
  verificationSummary?: string;
  receiptImageUrl?: string;
  createdAt: string;
}

export interface TenantMonthlyPayment {
  id: string;
  monthKey: string; // Formato "YYYY-MM", ej. "2026-11"
  monthName: string; // Ej. "Noviembre 2026"
  paidAt?: string; // Fecha en que se tildó o registró el pago
  amountPaid: number; // Monto cobrado
  status: 'paid' | 'pending' | 'extended';
  planType?: 'monthly' | 'annual'; // 'monthly' = 1 mes, 'annual' = abono anual (12 meses)
  coveredMonthsCount?: number; // 1 o 12
  paymentMethod?: 'mercadopago' | 'transferencia' | 'manual';
  mpPaymentId?: string; // ID de pago aprobado en Mercado Pago
  mpPreferenceId?: string; // ID de preferencia Checkout Pro
  receiptAlias?: string; // Alias de destino al momento del pago
  receiptImageUrl?: string; // Imagen del comprobante verificado automáticamente
  verificationNote?: string; // Detalle de verificación automática del comprobante
  extendedUntilDate?: string; // Prórroga específica para este mes
  notes?: string;
  markedBy?: string; // Nombre del superadmin o sistema automático
}

export interface PlatformBillingConfig {
  alias: string; // Alias donde se recibe el dinero (ej. "mi.alias.mp")
  cvu?: string; // CVU o CBU del gestor general / dueño del sistema
  accountHolderName: string; // Nombre del titular de la cuenta receptora
  bankOrWalletName?: string; // Billetera o banco (ej. "Mercado Pago")
  defaultMonthlyFee: number; // Cuota mensual sugerida por defecto
  annualDiscountPercent?: number; // Descuento opcional al pagar el año completo (0 a 40%)
  mpCheckoutLink?: string; // Link fijo de Mercado Pago opcional (si no se usa Access Token)
  mpPublicKey?: string; // Public Key opcional de Mercado Pago
  hasMpAccessToken?: boolean; // Indica si el servidor tiene Access Token de Mercado Pago configurado
  updatedAt?: string;
}

export interface PlatformSupportConfig {
  contactName: string; // Nombre del gestor o área de soporte
  whatsappPhone: string; // Teléfono / WhatsApp directo para soporte y dudas
  email: string; // Mail de contacto directo
  attentionHours?: string; // Horario de atención sugerido
  welcomeMessage?: string; // Texto orientativo visible en Canales de Contacto
  updatedAt?: string;
}

export type AnnouncementCategory = 'novedad' | 'promo' | 'aviso_importante' | 'mantenimiento';
export type AnnouncementAudience = 'all' | 'active' | 'trial' | 'paused';
export type AnnouncementCtaType = 'none' | 'annual_plan' | 'contact_support' | 'external_url';

export interface PlatformAnnouncement {
  id: string;
  title: string;
  message: string;
  category: AnnouncementCategory;
  audience: AnnouncementAudience;
  ctaType?: AnnouncementCtaType;
  ctaLabel?: string;
  ctaUrl?: string;
  active: boolean;
  createdAt: string;
  expiresAt?: string;
  authorName?: string;
}

export interface TenantSubscription {
  monthlyFee: number; // Monto mensual fijado (ej. 25000)
  currency: string; // "$"
  paymentWindowStartDay: number; // 1 (día 1 de cada mes)
  paymentWindowEndDay: number; // 5 (día 5 de cada mes)
  lastPaidMonth?: string; // "YYYY-MM"
  annualPlanUntilMonth?: string; // "YYYY-MM" si abonó el año completo (12 meses)
  annualPlanPurchasedAt?: string; // YYYY-MM-DD fecha de adquisición del plan anual
  isPaused: boolean; // Si la empresa fue pausada
  pausedAt?: string;
  pauseReason?: string;
  pausedBy?: 'admin' | 'tenant' | 'trial_expired';
  // Prueba gratuita de 30 días para nuevas distribuidoras:
  trialStartedAt?: string; // YYYY-MM-DD
  trialEndsAt?: string; // YYYY-MM-DD (+30 días)
  trialDays?: number; // 30 por defecto
  selfRegistered?: boolean; // true si la empresa se creó sola desde el registro gratuito
  extendedUntilMonth?: string; // "YYYY-MM" Mes hasta el cual se le prorrogó el uso
  extendedUntilDate?: string; // Fecha exacta límite de la prórroga
  extensionNotes?: string;
  paymentHistory: TenantMonthlyPayment[]; // Historial de meses
}

export interface Tenant {
  id: string; // e.g. "dist-central"
  tenantCode: string; // e.g. "DIST-001" (número de la página / ID para acceso)
  name: string; // Nombre comercial de la empresa cliente
  businessCategory?: string; // Rubro / especialidad legible
  businessRubro?: BusinessRubro; // Identificador de rubro multi-vertical
  phone: string;
  email: string;
  address?: string;
  province?: string; // Provincia (ej. Buenos Aires, Córdoba, Santa Fe, etc.)
  city?: string; // Ciudad / Localidad
  cuit?: string;
  logoUrl?: string;
  icon?: string;
  status: 'active' | 'suspended' | 'trial';
  createdAt: string;
  notes?: string;
  config: DistributorConfig;
  subscription?: TenantSubscription; // Monetización y control de pago mensual
  catalogEnabled?: boolean; // Servicio de catálogo online (habilitado para todas las empresas por defecto; reversible desde SuperGestión)
  catalogRubro?: BusinessRubro; // Rubro exclusivo asignado al catálogo online desde la gestión del cliente
}

export interface PlatformUser {
  id: string;
  username: string; // Usuario para inicio de sesión (ej. "admin", "dueno_central")
  password: string; // Clave de acceso (visible y editable por el Super Administrador)
  fullName: string;
  email: string;
  phone: string;
  role: 'superadmin' | 'dueño' | 'administrador' | 'vendedor';
  tenantId?: string; // Distribuidora asignada ('all' o undefined si es superadmin)
  tenantCode?: string; // Código de distribuidora visible
  createdAt: string;
  active: boolean;
}

export type AlertCategory =
  | 'normal'
  | 'vendedor_2d'
  | 'admin_6d'
  | 'critical_10d'
  | 'critical_15d'
  | 'critical_overdue_grace'
  | 'overdue_today'
  | 'vendedor_reminder'
  | 'admin_alert';

export interface BoletaAlertStatus {
  daysElapsed: number;
  daysRemaining: number;
  daysPastDueDate: number; // Días transcurridos posteriores a la fecha de vencimiento
  isPastGracePeriod: boolean; // True si daysPastDueDate >= overdueGraceDays (por defecto 5 días)
  isExtended: boolean; // True si tiene prórrogas registradas
  category: AlertCategory;
  categoryLabel: string;
  badgeColor: string;
  actionMessage: string;
  shouldNotifyVendedor: boolean;
  shouldNotifyAdmin: boolean;
  isOverdueOrToday: boolean;
  isUrgentAlertMode: boolean; // True cuando pasaron 10 o más días o está en mora crítica roja
}

export type RendicionItemStatus =
  | 'cobrada_total'
  | 'transferencia_directa'
  | 'pago_parcial'
  | 'cheque_otro'
  | 'prorroga_promesa'
  | 'no_cobrada';

export interface RendicionRouteItem {
  boletaId: string;
  boletaNumber: string;
  clientId: string;
  clientName: string;
  clientAddress?: string;
  dueDate: string;
  expectedBalance: number;
  outcome: RendicionItemStatus;
  collectedCash: number;
  collectedTransfer: number;
  collectedOther: number;
  extensionDays?: number;
  note?: string;
}

export interface SalespersonRendicion {
  id: string;
  rendicionNumber: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  salespersonId: string;
  salespersonName: string;
  zone: string;
  routeScope: 'due_or_overdue' | 'all_pending';
  totalExpectedOnRoute: number;
  systemCashCollected: number;
  systemTransferCollected: number;
  systemOtherCollected: number;
  declaredCashInHand: number;
  cashDifference: number; // declaredCashInHand - systemCashCollected
  items: RendicionRouteItem[];
  settledByAdmin: string;
  notes?: string;
  appliedToBoletas: boolean;
}

// ============================================================================
// CATÁLOGO ONLINE Y PEDIDOS PARA RETIRAR POR WHATSAPP
// ============================================================================

export interface CatalogProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  rubro?: BusinessRubro; // Rubro exclusivo del producto (sincronizado con catalogRubro)
  subfilters?: string[]; // Subfiltros asignados al producto (ej. Remeras, Jeans, Invierno)
  unitLabel?: string;
  imageUrl?: string;
  available: boolean;
  featured?: boolean;
  sku?: string;
  stockQuantity?: number; // undefined = stock sin límite; 0 = Sin stock (habilita "Avisar cuando haya stock")
  createdAt: string;
  updatedAt: string;
}

export interface CatalogStockAlertRequest {
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  productSku?: string;
  customerName: string;
  customerPhone: string;
  status: 'pending' | 'notified';
  notifiedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface OnlineCatalogSettings {
  published: boolean;
  catalogRubro?: BusinessRubro;
  rubroFilters?: string[];
  customSubfilters?: string[];
  storeName?: string;
  tagline?: string;
  slug?: string;
  whatsappPhone?: string;
  allowPickup?: boolean;
  allowDelivery?: boolean;
  deliveryNote?: string;
  pickupAddress?: string;
  pickupHours?: string;
  pickupInstructions?: string;
  paymentNote?: string;
  currencySymbol?: string;
  updatedAt?: string;
}

export interface CatalogPickupOrderItem {
  productId: string;
  productName: string;
  sku?: string;
  imageUrl?: string;
  unitLabel?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface CatalogPickupOrder {
  id: string;
  orderNumber: string;
  tenantId: string;
  tenantCode?: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  deliveryMethod?: 'retiro' | 'envio';
  deliveryAddress?: string;
  preferredPickupWindow?: string;
  preferredPaymentMethod?: 'efectivo' | 'transferencia' | 'link_pago' | 'acordar';
  confirmedPaymentMethod?: 'efectivo' | 'transferencia' | 'link_pago' | 'fiado' | 'acordar';
  notes?: string;
  items: CatalogPickupOrderItem[];
  totalAmount: number;
  currencySymbol: string;
  status: 'pendiente_retiro' | 'listo_para_retirar' | 'en_camino' | 'retirado' | 'cancelado';
  stockDeducted?: boolean;
  linkedBoletaId?: string;
  linkedBoletaNumber?: string;
  dispatchReceiptNumber?: string;
  dispatchedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PublishedPublicCatalog {
  tenantId: string;
  tenantCode?: string;
  slug?: string;
  enabledBySuperAdmin: boolean;
  published: boolean;
  catalogRubro?: BusinessRubro;
  rubroFilters?: string[];
  customSubfilters?: string[];
  storeName: string;
  tagline: string;
  logoUrl?: string;
  icon?: string;
  whatsappPhone: string;
  allowPickup?: boolean;
  allowDelivery?: boolean;
  deliveryNote?: string;
  pickupAddress: string;
  pickupHours: string;
  pickupInstructions?: string;
  paymentNote?: string;
  merchantPaymentAlias?: string;
  merchantPaymentCvu?: string;
  merchantPaymentBank?: string;
  merchantPaymentHolder?: string;
  merchantMpCheckoutLink?: string;
  currencySymbol: string;
  products: CatalogProduct[];
  updatedAt: string;
}

