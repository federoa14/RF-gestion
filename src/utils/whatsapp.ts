import { Boleta, Client, Salesperson, Administrator, DistributorConfig, SaleLineItem, CatalogPickupOrder } from '../types';
import { calculateAlertStatus, formatCurrency, formatDateEs, getBoletaBalance } from './alerts';

// Clean phone for wa.me link (e.g. +54 9 11 1234-5678 -> 5491112345678)
export function sanitizePhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

// Un teléfono es utilizable si tiene una cantidad mínima de dígitos (descarta valores como "0" o "-")
export function hasUsablePhone(phone?: string | null): boolean {
  return sanitizePhone(phone || '').replace(/^0+/, '').length >= 6;
}

/**
 * Mensaje personalizado con firma del usuario activo:
 * "Soy [Usuario] y necesito que vayas a cobrarle a [Cliente]..."
 */
export function generateUserSignedReminder(
  boleta: Boleta,
  salesperson: Salesperson | undefined,
  activeAdminName: string,
  config: DistributorConfig,
  customTemplate?: string
): string {
  const sellerName = salesperson?.name || boleta.salespersonName;
  const status = calculateAlertStatus(boleta, config);
  const days = status.daysElapsed;
  const balance = getBoletaBalance(boleta);
  const formattedBalanceDue = formatCurrency(balance.balanceDue, config.currencySymbol);
  const formattedOriginalAmount = formatCurrency(balance.originalAmount, config.currencySymbol);

  const amountSection = balance.hasPartialPayments
    ? `💰 *Total Boleta:* ${formattedOriginalAmount}
💵 *Entregado a cuenta:* ${formatCurrency(balance.totalPaid, config.currencySymbol)} (${balance.percentagePaid}%)
⚠️ *SALDO PENDIENTE A COBRAR HOY:* *${formattedBalanceDue}*`
    : `💰 *Monto a cobrar:* *${formattedBalanceDue}*`;

  if (customTemplate && customTemplate.trim()) {
    return customTemplate
      .replace(/{vendedor}/gi, sellerName)
      .replace(/{adminActual}/gi, activeAdminName)
      .replace(/{cliente}/gi, boleta.clientName)
      .replace(/{direccion}/gi, boleta.clientAddress || 'Ver ficha')
      .replace(/{boleta}/gi, boleta.boletaNumber)
      .replace(/{monto}/gi, formattedBalanceDue)
      .replace(/{dias}/gi, days.toString())
      .replace(/{vencimiento}/gi, formatDateEs(boleta.dueDate))
      .replace(/{fechaVenta}/gi, formatDateEs(boleta.saleDate));
  }

  // Specific templates per user rules
  if (status.category === 'critical_15d') {
    return `🚨 *MORA CRÍTICA (15+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨
🏢 *${config.distributorName}*

Hola ${sellerName}, soy *${activeAdminName}*.
*ATENCIÓN URGENTE: La boleta #${boleta.boletaNumber} lleva ${days} días emitida y SIGUE SIN ESTAR PAGA*.
*Necesito que hoy vayas a cobrarle de forma obligatoria e inmediata a ${boleta.clientName}*:

📄 *Boleta:* #${boleta.boletaNumber} (Firmada / Fiada)
📍 *Dirección:* ${boleta.clientAddress || 'Ver ficha'}
📅 *Fecha de venta:* ${formatDateEs(boleta.saleDate)} (*${days} días transcurridos*)
⏰ *Vencimiento original:* ${formatDateEs(boleta.dueDate)}
${amountSection}

⚠️ Esta cuenta está en estado de máxima mora y fue elevada a la gerencia / dueños. Por favor concurrí hoy al comercio y rendí el cobro en administración.`;
  }

  if (status.category === 'critical_10d') {
    return `🚨 *MODO ALERTA (10+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨
🏢 *${config.distributorName}*

Hola ${sellerName}, soy *${activeAdminName}*.
*AVISO URGENTE: La boleta #${boleta.boletaNumber} ya superó los 10 días (${days} días) y SIGUE SIN ESTAR PAGA*.
*Necesito que vayas a cobrarle hoy con prioridad máxima a ${boleta.clientName}*:

📄 *Boleta:* #${boleta.boletaNumber} (Firmada / Fiada)
📍 *Dirección:* ${boleta.clientAddress || 'Ver ficha'}
📅 *Venta:* ${formatDateEs(boleta.saleDate)} (*${days} días transcurridos*)
⏰ *Vencimiento:* ${formatDateEs(boleta.dueDate)}
${amountSection}

📌 Se encuentra en rojo prioritario en el sistema central de cobranzas y los dueños ya tienen el reporte. Por favor confirmame cuando tengas el cobro efectuado.`;
  }

  if (status.category === 'overdue_today') {
    return `🚨 *ATENCIÓN ${sellerName.toUpperCase()} - VENCIMIENTO HOY* 🚨
🏢 *${config.distributorName}*

Hola ${sellerName}, soy *${activeAdminName}*.
*Necesito que hoy vayas a cobrarle sí o sí a ${boleta.clientName}*:

📄 *Boleta:* #${boleta.boletaNumber} (Firmada / Fiada)
📍 *Dirección:* ${boleta.clientAddress || 'Ver ficha'}
📅 *Emitida:* ${formatDateEs(boleta.saleDate)} (${days} días transcurridos)
⏰ *Plazo de cobro:* Vence HOY (${formatDateEs(boleta.dueDate)})
${amountSection}

Por favor salí a la calle hoy a cobrar esta boleta y confirmame cuando la tengas rendida.
¡Muchas gracias!`;
  }

  if (status.category === 'admin_6d') {
    return `⚠️ *AVISO A LOS 6 DÍAS DE EMISIÓN*
🏢 *${config.distributorName}*

Hola ${sellerName}, soy *${activeAdminName}*.
Te notificamos que la boleta #${boleta.boletaNumber} de *${boleta.clientName}* cumple *6 días* desde su emisión:

📍 *Dirección:* ${boleta.clientAddress || 'Ver ficha'}
📅 *Venta:* ${formatDateEs(boleta.saleDate)}
⏰ *Vence:* ${formatDateEs(boleta.dueDate)}
${amountSection}

Aviso enviado en simultáneo a los dueños para seguimiento. Por favor coordiná el cobro para evitar que ingrese en mora de 10 días.`;
  }

  if (status.category === 'vendedor_2d') {
    return `📋 *RECORDATORIO A LOS 2 DÍAS DE VENTA*
🏢 *${config.distributorName}*

Hola ${sellerName}, soy *${activeAdminName}*.
Recordatorio preventivo: hace 2 días se entregó fiada la boleta #${boleta.boletaNumber} a *${boleta.clientName}*:

📍 *Dirección:* ${boleta.clientAddress || 'Ver ficha'}
📅 *Venta:* ${formatDateEs(boleta.saleDate)} (Lleva 2 días)
⏰ *Vence:* ${formatDateEs(boleta.dueDate)} (Plazo ${boleta.termDays} días)
${amountSection}

Tenela en cuenta en tu hoja de ruta semanal para realizar el cobro en término.`;
  }

  return `📋 *RECORDATORIO DE COBRANZA*
🏢 *${config.distributorName}*

Hola ${sellerName}, soy *${activeAdminName}*.
Necesito que vayas a cobrarle a *${boleta.clientName}*:

📄 *Boleta:* #${boleta.boletaNumber}
📍 *Dirección:* ${boleta.clientAddress || 'Ver ficha'}
📅 *Venta:* ${formatDateEs(boleta.saleDate)} (Lleva ${days} días)
⏰ *Vence:* ${formatDateEs(boleta.dueDate)} (Plazo ${boleta.termDays} días)
${amountSection}

Por favor coordiná la visita con el cliente para cobrar según lo acordado.`;
}

/**
 * Reporte Consolidado para el Dueño / Administrador General:
 * "hoy tal vendedor debe cobrarle tal monto a tal persona.
 * Y si son más de un vencimiento, que le llegue un mensaje que diga
 * hoy tal vendedor debe cobrarle tantas boletas por tal monto general."
 */
export function generateConsolidatedReportForAdmin(
  overdueBoletas: Boleta[],
  salespeople: Salesperson[],
  adminName: string,
  config: DistributorConfig
): string {
  if (overdueBoletas.length === 0) {
    return `📊 *INFORME DIARIO DE COBRANZAS*
🏢 *${config.distributorName}*
Hola ${adminName}, hoy no hay boletas vencidas ni pendientes urgentes en la calle. Todo al día.`;
  }

  // Group boletas by salesperson
  const groupedBySeller: Record<string, Boleta[]> = {};
  for (const b of overdueBoletas) {
    const key = b.salespersonId || b.salespersonName;
    if (!groupedBySeller[key]) groupedBySeller[key] = [];
    groupedBySeller[key].push(b);
  }

  let lines: string[] = [];
  let grandTotal = 0;

  for (const [sellerKey, sellerBoletas] of Object.entries(groupedBySeller)) {
    const seller = salespeople.find((s) => s.id === sellerKey) || {
      name: sellerBoletas[0]?.salespersonName || 'Vendedor',
    };
    const sellerTotal = sellerBoletas.reduce(
      (acc, b) => acc + getBoletaBalance(b).balanceDue,
      0
    );
    grandTotal += sellerTotal;

    if (sellerBoletas.length === 1) {
      const b = sellerBoletas[0];
      const bal = getBoletaBalance(b);
      const partialNote = bal.hasPartialPayments
        ? ` (Saldo pendiente: ${formatCurrency(bal.balanceDue, config.currencySymbol)} de un total de ${formatCurrency(bal.originalAmount, config.currencySymbol)})`
        : '';
      lines.push(
        `• *Hoy ${seller.name} debe cobrarle ${formatCurrency(bal.balanceDue, config.currencySymbol)} a ${b.clientName}* (Boleta #${b.boletaNumber}${partialNote}${b.clientAddress ? ` - ${b.clientAddress}` : ''})`
      );
    } else {
      const boletasDetail = sellerBoletas
        .map((b, idx) => {
          const bal = getBoletaBalance(b);
          const partialNote = bal.hasPartialPayments
            ? ` [Saldo: ${formatCurrency(bal.balanceDue, config.currencySymbol)} / Orig: ${formatCurrency(bal.originalAmount, config.currencySymbol)}]`
            : '';
          return `    ${idx + 1}. ${b.clientName}: ${formatCurrency(bal.balanceDue, config.currencySymbol)} (Boleta #${b.boletaNumber})${partialNote}`;
        })
        .join('\n');

      lines.push(
        `• *Hoy ${seller.name} debe cobrarle ${sellerBoletas.length} boletas por un monto general de ${formatCurrency(sellerTotal, config.currencySymbol)}:*\n${boletasDetail}`
      );
    }
  }

  return `🚨 *REPORTE DE COBRANZAS DEL DÍA PARA EL DUEÑO* 🚨
🏢 *${config.distributorName}*

Hola ${adminName}, este es el resumen de las boletas que *hoy tienen que cobrarse sí o sí* en la calle:

${lines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL GENERAL A COBRAR HOY:* *${formatCurrency(grandTotal, config.currencySymbol)}*
📄 *Total Boletas:* ${overdueBoletas.length}

_Se notificó a los vendedores para que salgan a la calle a cobrar._`;
}

/**
 * Reporte Consolidado para un Vendedor Específico (cuando tiene 1 o varias boletas para hoy)
 */
export function generateConsolidatedRouteForVendedor(
  sellerBoletas: Boleta[],
  salesperson: Salesperson,
  activeAdminName: string,
  config: DistributorConfig
): string {
  const totalAmount = sellerBoletas.reduce((acc, b) => acc + (b.amount || 0), 0);
  const formattedTotal = formatCurrency(totalAmount, config.currencySymbol);

  if (sellerBoletas.length === 1) {
    const b = sellerBoletas[0];
    return `🚨 *AVISO DE SALIDA A COBRAR HOY* 🚨
🏢 *${config.distributorName}*

Hola ${salesperson.name}, soy *${activeAdminName}*.
*Hoy tenés que cobrarle ${formatCurrency(b.amount, config.currencySymbol)} a ${b.clientName}*:

📍 *Dirección:* ${b.clientAddress || 'Ver ficha'}
📄 *Boleta:* #${b.boletaNumber} (Firmada / Fiada)
⏰ *Vencimiento:* ${formatDateEs(b.dueDate)} (VENCE HOY)

Por favor hacé el cobro en el recorrido de hoy y rendí en administración. ¡Gracias!`;
  }

  const itemsList = sellerBoletas
    .map(
      (b, idx) =>
        `${idx + 1}. *${b.clientName}* (${b.clientAddress || 'Sin dir'})\n   Boleta #${b.boletaNumber} • *${formatCurrency(b.amount, config.currencySymbol)}*`
    )
    .join('\n\n');

  return `🚨 *HOJA DE RUTA DE COBRANZAS DE HOY* 🚨
🏢 *${config.distributorName}*

Hola ${salesperson.name}, soy *${activeAdminName}*.
*Hoy tenés que cobrar ${sellerBoletas.length} boletas por un monto general de ${formattedTotal}*:

${itemsList}

━━━━━━━━━━━━━━━━━━━━
💰 *MONTO TOTAL GENERAL A COBRAR:* *${formattedTotal}*

Por favor organizá la recorrida para visitar estos comercios hoy y rendir el dinero en administración.`;
}

/**
 * Mensaje de difusión / promo para vendedores
 */
export function generateBroadcastWhatsAppMessage(
  title: string,
  content: string,
  sellerName: string,
  adminName: string,
  config: DistributorConfig
): string {
  return `📢 *COMUNICADO OFICIAL DE DISTRIBUIDORA*
🏢 *${config.distributorName}*
Enviado por: *${adminName}*

Hola ${sellerName}, tenemos una novedad importante para tu zona:

🎯 *${title}*

${content}

¡Cualquier consulta comunicarse con administración!`;
}

export function generateVendedorWhatsAppMessage(
  boleta: Boleta,
  salesperson: Salesperson | undefined,
  config: DistributorConfig
): string {
  return generateUserSignedReminder(
    boleta,
    salesperson,
    'Administración',
    config,
    config.customCobranzaTemplate
  );
}

export function generateAdminWhatsAppMessage(
  boleta: Boleta,
  admin: Administrator | undefined,
  config: DistributorConfig
): string {
  const status = calculateAlertStatus(boleta, config);
  const adminName = admin?.name || 'Administrador / Dueño';
  const days = status.daysElapsed;
  const balance = getBoletaBalance(boleta);
  const formattedBalanceDue = formatCurrency(balance.balanceDue, config.currencySymbol);

  if (status.category === 'critical_15d') {
    return `🚨 *ALERTA CRÍTICA DUEÑOS (15+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨
🏢 *${config.distributorName}*

Hola ${adminName}, alerta de mora máxima:
La boleta #${boleta.boletaNumber} del vendedor *${boleta.salespersonName}* para el cliente *${boleta.clientName}* lleva *${days} días emitida y SIGUE SIN ESTAR PAGA*.

🧑‍💼 *Vendedor a cargo:* ${boleta.salespersonName}
👤 *Cliente:* ${boleta.clientName} (${boleta.clientAddress || 'Sin dir'})
📄 *Boleta:* #${boleta.boletaNumber} (Firmada / Fiada)
📅 *Emisión:* ${formatDateEs(boleta.saleDate)} (*${days} días de antigüedad*)
💰 *Saldo adeudado:* *${formattedBalanceDue}*

⚠️ Esta boleta superó los 15 días y está en rojo prioritario en el sistema central. Se notificó al vendedor para exigir el cobro urgente hoy.`;
  }

  if (status.category === 'critical_10d') {
    return `🚨 *ALERTA DUEÑOS (10+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨
🏢 *${config.distributorName}*

Hola ${adminName}, atención con boleta demorada:
La boleta #${boleta.boletaNumber} del vendedor *${boleta.salespersonName}* para el cliente *${boleta.clientName}* ya cumplió *${days} días y SIGUE SIN ESTAR PAGA*.

🧑‍💼 *Vendedor responsable:* ${boleta.salespersonName}
👤 *Cliente:* ${boleta.clientName} (${boleta.clientAddress || 'Sin dir'})
📄 *Boleta:* #${boleta.boletaNumber}
📅 *Fecha de venta:* ${formatDateEs(boleta.saleDate)} (*${days} días transcurridos*)
💰 *Monto a cobrar:* *${formattedBalanceDue}*

📌 Figura en primer lugar en color rojo prioritario en el inicio para su cobro urgente.`;
  }

  if (status.category === 'admin_6d') {
    return `⚠️ *ALERTA 6 DÍAS PARA DUEÑOS: SEGUIMIENTO DE COBRANZA*
🏢 *${config.distributorName}*

Hola ${adminName}, aviso preventivo de control:
El vendedor *${boleta.salespersonName}* tiene la boleta #${boleta.boletaNumber} de *${boleta.clientName}* que hoy cumple *6 días* sin cobrarse:

🧑‍💼 *Vendedor:* ${boleta.salespersonName}
👤 *Cliente:* ${boleta.clientName}
💰 *Importe:* *${formattedBalanceDue}*
⏰ *Vence:* ${formatDateEs(boleta.dueDate)}

Se emitió aviso al vendedor para que realice el cobro antes de ingresar en zona de mora de 10 días.`;
  }

  return `📊 *ALERTA DE CONTROL PARA ADMINISTRADORES*
🏢 *${config.distributorName}*

Hola ${adminName}, boleta pendiente de cobro requiere seguimiento:

👤 *Cliente:* ${boleta.clientName} (${boleta.clientAddress || 'Sin dir'})
🧑‍💼 *Vendedor a cargo:* ${boleta.salespersonName}
📄 *Boleta N°:* #${boleta.boletaNumber}
📅 *Emisión:* ${formatDateEs(boleta.saleDate)} (*${days} días sin cobrarse*)
⏰ *Vencimiento:* ${formatDateEs(boleta.dueDate)}
💰 *Monto adeudado:* *${formattedBalanceDue}*
📌 *Estado:* ${status.categoryLabel}

Se recomienda contactar al vendedor para confirmar cobro en la calle.`;
}

function buildMerchantAliasFooter(config: DistributorConfig): string {
  const alias = config.merchantPaymentAlias?.trim();
  const cvu = config.merchantPaymentCvu?.trim();
  const bank = config.merchantPaymentBank?.trim();
  const holder = config.merchantPaymentHolder?.trim();
  if (!alias && !cvu) return '';
  const parts: string[] = ['\n💳 *Datos para transferir / abonar:*'];
  if (alias) parts.push(`• *Alias:* \`${alias}\``);
  if (cvu) parts.push(`• *CVU/CBU:* ${cvu}`);
  if (bank) parts.push(`• *Billetera / Banco:* ${bank}`);
  if (holder) parts.push(`• *Titular:* ${holder}`);
  return parts.join('\n');
}

export function generateClientWhatsAppMessage(
  boleta: Boleta,
  client: Client | undefined,
  config: DistributorConfig
): string {
  const clientName = client?.contactPerson || boleta.clientName;
  const status = calculateAlertStatus(boleta, config);
  const balance = getBoletaBalance(boleta);
  const formattedBalanceDue = formatCurrency(balance.balanceDue, config.currencySymbol);
  const formattedOriginalAmount = formatCurrency(balance.originalAmount, config.currencySymbol);
  const aliasFooter = buildMerchantAliasFooter(config);
  const quotaLabel =
    boleta.totalInstallments && boleta.installmentNumber
      ? ` (Cuota ${boleta.installmentNumber}/${boleta.totalInstallments})`
      : boleta.saleMode === 'sena_reserva'
      ? ' (Reserva con Seña)'
      : '';
  const itemLine = boleta.itemSummary ? `\n🛍️ *Detalle:* ${boleta.itemSummary}` : '';

  // Si hay plantilla personalizada de vencimiento para clientes configurada
  if (config.customClientOverdueTemplate && config.customClientOverdueTemplate.trim()) {
    const rendered = config.customClientOverdueTemplate
      .replace(/{cliente}/gi, clientName)
      .replace(/{distribuidora}/gi, config.distributorName)
      .replace(/{boleta}/gi, `${boleta.boletaNumber}${quotaLabel}`)
      .replace(/{monto}/gi, formattedBalanceDue)
      .replace(/{vencimiento}/gi, formatDateEs(boleta.dueDate))
      .replace(/{fechaVenta}/gi, formatDateEs(boleta.saleDate))
      .replace(/{vendedor}/gi, boleta.salespersonName)
      .replace(/{dias}/gi, status.daysElapsed.toString())
      .replace(/{alias}/gi, config.merchantPaymentAlias?.trim() || 'Consultar alias');
    return `${rendered}${itemLine}${aliasFooter && !rendered.includes(config.merchantPaymentAlias || '___NEVER___') ? `\n${aliasFooter}` : ''}`;
  }

  // Si la boleta está vencida o vence hoy
  if (status.isOverdueOrToday || status.daysElapsed >= boleta.termDays) {
    const amountSection = balance.hasPartialPayments
      ? `💰 *Monto Original:* ${formattedOriginalAmount}\n💵 *Entregas Previas:* ${formatCurrency(balance.totalPaid, config.currencySymbol)}\n⚠️ *SALDO PENDIENTE A CANCELAR:* *${formattedBalanceDue}*`
      : `💰 *Importe a abonar:* *${formattedBalanceDue}*`;

    return `⚠️ *RECORDATORIO DE VENCIMIENTO* ⚠️\n🏢 *${config.distributorName}*\n\nEstimado/a ${clientName}:\nLe informamos que el comprobante *#${boleta.boletaNumber}${quotaLabel}* ha alcanzado su fecha acordada:\n\n📄 *Comprobante:* #${boleta.boletaNumber}${quotaLabel}${itemLine}\n📅 *Fecha de operación:* ${formatDateEs(boleta.saleDate)} (${status.daysElapsed} días transcurridos)\n⏰ *Fecha límite pactada:* ${formatDateEs(boleta.dueDate)}\n${amountSection}\n🧑‍💼 *Atendido por:* ${boleta.salespersonName}\n${aliasFooter}\n\n📌 Le solicitamos realizar el pago o enviarnos el comprobante de transferencia por este medio. ¡Muchas gracias!`;
  }

  // Si la boleta aún está al día (recordatorio preventivo)
  return `📋 *DETALLE DE SALDO PENDIENTE*\n🏢 *${config.distributorName}*\n\nHola ${clientName}, esperamos que estés muy bien.\nTe compartimos el detalle de tu comprobante pendiente:\n\n📄 *Comprobante:* #${boleta.boletaNumber}${quotaLabel}${itemLine}\n📅 *Fecha:* ${formatDateEs(boleta.saleDate)}\n⏰ *Vencimiento:* ${formatDateEs(boleta.dueDate)}\n💰 *Importe:* *${formattedBalanceDue}*\n🧑‍💼 *Responsable:* ${boleta.salespersonName}\n${aliasFooter}\n\n¡Muchas gracias por elegirnos!`;
}

export function createWhatsAppUrl(phone: string, message: string): string {
  const cleanPhone = sanitizePhone(phone);
  const encodedText = encodeURIComponent(message);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

export function createMailtoUrl(email: string, subject: string, body: string): string {
  const cleanEmail = email?.trim() || '';
  return `mailto:${cleanEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Mensaje a los dueños cuando se intenta cargar una boleta para un cliente que ya adeuda otra
 */
export function generateBlockedChargeOwnerWhatsAppMessage(
  client: Client,
  existingBoleta: Boleta,
  ownerName: string,
  config: DistributorConfig
): string {
  const balance = getBoletaBalance(existingBoleta);
  const now = new Date();
  const saleDate = new Date(existingBoleta.saleDate + 'T12:00:00');
  const daysElapsed = Math.max(0, Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)));

  return `🚫 *ALERTA A DUEÑOS: CARGA DE BOLETA ANULADA POR DEUDA PREVIA* 🚫
🏢 *${config.distributorName}*

Hola ${ownerName}, te informamos de una acción bloqueada por el sistema:
Se intentó cargar una nueva boleta fiada al cliente *${client.name}*, pero *FUE ANULADA AUTOMÁTICAMENTE* porque el cliente ya posee una boleta adeudada en curso.

📄 *Datos de la Boleta ya cargada:*
• *Boleta N°:* #${existingBoleta.boletaNumber} (Firmada / Fiada)
• *Cliente:* ${client.name} (${client.address || 'Sin dir'})
• *Vendedor responsable:* ${existingBoleta.salespersonName}
• *Fecha de venta:* ${formatDateEs(existingBoleta.saleDate)} (${daysElapsed} días sin cancelar)
• *Plazo pactado:* ${existingBoleta.termDays} días (Vencimiento: ${formatDateEs(existingBoleta.dueDate)})
• *Saldo adeudado:* *${formatCurrency(balance.balanceDue, config.currencySymbol)}*

⚠️ Por política de la distribuidora, no se permite acumular más de una boleta fiada por cliente. Se notificó al vendedor para que efectivice el cobro de la boleta previa.`;
}

export interface ReceiptWhatsAppPayload {
  receiptNumber: string;
  boletaNumber: string;
  clientName: string;
  paymentDate: string;
  amountPaidNow: number;
  paymentMethod: string;
  paymentMethodLabel?: string;
  originalAmount: number;
  totalPaidAccumulated: number;
  remainingBalance: number;
  receivedBy?: string;
  notes?: string;
  isFullSettlement?: boolean;
  isDispatchReceipt?: boolean;
  dispatchStageHeadline?: string;
  dispatchModalityLabel?: string;
  deliveryAddress?: string;
  hideUnitModeTag?: boolean;
  items?: SaleLineItem[];
  basketSummaryLines?: string[];
  saleModeLabel?: string;
}

export function generatePaymentReceiptWhatsAppMessage(
  receipt: ReceiptWhatsAppPayload,
  config: DistributorConfig
): string {
  const sym = config.currencySymbol || '$';
  const methodLabels: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia / Alias',
    cheque: 'Cheque',
    link_pago: 'Link de Pago / MP',
    mercadopago_dinero_cuenta: 'Mercado Pago (Dinero en cuenta)',
    fiado: 'Cuenta Corriente / Fiado',
    acordar: 'A coordinar por WhatsApp',
    otro: 'Otro medio',
  };
  const methodLabel =
    receipt.paymentMethodLabel || methodLabels[receipt.paymentMethod] || receipt.paymentMethod;
  const isCompleted = receipt.isFullSettlement || receipt.remainingBalance <= 0;

  const itemsBlock =
    receipt.items && receipt.items.length > 0
      ? `\n🛍️ *Detalle de productos:*\n` +
        receipt.items
          .map((item) => {
            const modeTag = receipt.hideUnitModeTag
              ? ''
              : item.paymentMode === 'contado_hoy'
              ? ' [1 Pago Hoy]'
              : item.paymentMode === 'un_pago_fiado'
              ? ' [1 Pago Fiado]'
              : ' [En Cuotas]';
            return `• ${item.quantity} × *${item.name}* (${formatCurrency(item.unitPrice, sym)} c/u)${modeTag} — *${formatCurrency(item.subtotal, sym)}*`;
          })
          .join('\n') +
        '\n'
      : '';

  const noteLine = receipt.notes ? `\n📝 *Observación:* ${receipt.notes}` : '';

  if (receipt.isDispatchReceipt) {
    const modalityLine = receipt.dispatchModalityLabel
      ? `\n🚚 *Modalidad de despacho:* ${receipt.dispatchModalityLabel}`
      : '';
    const addressLine = receipt.deliveryAddress
      ? `\n📍 *Dirección:* ${receipt.deliveryAddress}`
      : '';
    const paymentStatusLine = isCompleted
      ? `✅ *Estado de pago:* *ABONADO / CONFIRMADO*`
      : `📌 *Valor pendiente a abonar:* *${formatCurrency(receipt.remainingBalance, sym)}*`;
    const aliasSection = !isCompleted ? buildMerchantAliasFooter(config) : '';
    const mpLinkLine =
      !isCompleted && config.merchantMpCheckoutLink?.trim()
        ? `\n🔗 *Link de pago:* ${config.merchantMpCheckoutLink.trim()}`
        : '';

    const headlineBlock = receipt.dispatchStageHeadline
      ? `\n📣 *${receipt.dispatchStageHeadline}*\n`
      : '';

    return `📦 *COMPROBANTE DE DESPACHO - ${receipt.receiptNumber}*
🏢 *${config.distributorName}*${headlineBlock}

Estimado/a *${receipt.clientName}*, te enviamos el comprobante oficial de tu compra (*#${receipt.boletaNumber}*):

📅 *Fecha de despacho:* ${formatDateEs(receipt.paymentDate)}${modalityLine}${addressLine}
💳 *Forma de pago:* *${methodLabel}*
${itemsBlock}
━━━━━━━━━━━━━━━━━━━━
💰 *VALOR FINAL:* *${formatCurrency(receipt.originalAmount, sym)}*
${paymentStatusLine}${noteLine}${aliasSection}${mpLinkLine}
${receipt.receivedBy ? `\n👤 *Despachado / Atendido por:* ${receipt.receivedBy}` : ''}

¡Muchas gracias por tu compra! Guardá este comprobante.`;
  }

  const statusLine = isCompleted
    ? `✅ *Estado del Comprobante:* *CANCELADO AL 100% (SALDO $0,00)*`
    : `📌 *Saldo Restante Pendiente:* *${formatCurrency(receipt.remainingBalance, sym)}*`;

  const scheduleBlock =
    receipt.basketSummaryLines && receipt.basketSummaryLines.length > 0
      ? `\n📆 *Detalle de pagos / vencimientos:*\n` +
        receipt.basketSummaryLines.map((l) => `• ${l}`).join('\n')
      : '';

  const aliasSection = !isCompleted ? buildMerchantAliasFooter(config) : '';

  return `🧾 *COMPROBANTE OFICIAL - ${receipt.receiptNumber}*
🏢 *${config.distributorName}*

Estimado/a *${receipt.clientName}*, detallamos su operación correspondiente a *#${receipt.boletaNumber}*:

📅 *Fecha:* ${formatDateEs(receipt.paymentDate)}
💳 *Forma de pago:* ${methodLabel}
💵 *Monto abonado hoy:* *${formatCurrency(receipt.amountPaidNow, sym)}*
${itemsBlock}
━━━━━━━━━━━━━━━━━━━━
📄 *Valor final operación:* ${formatCurrency(receipt.originalAmount, sym)}
✔️ *Total abonado a la fecha:* ${formatCurrency(receipt.totalPaidAccumulated, sym)}
${statusLine}${scheduleBlock}${noteLine}${aliasSection}
${receipt.receivedBy ? `\n👤 *Atendido / Recibido por:* ${receipt.receivedBy}` : ''}

¡Muchas gracias! Guardá este comprobante como constancia.`;
}

/**
 * Estado de cuenta unificado (Cuenta Corriente / Fiados / Cuotas Personales) para enviar por WhatsApp al cliente.
 */
export function generateClientStatementWhatsAppMessage(params: {
  client: Client;
  pendingBoletas: Boleta[];
  paidBoletas?: Boleta[];
  config: DistributorConfig;
  currentDateRef?: string;
  includeRecentPaid?: boolean;
}): string {
  const {
    client,
    pendingBoletas,
    paidBoletas = [],
    config,
    currentDateRef,
    includeRecentPaid = true,
  } = params;
  const sym = config.currencySymbol || '$';
  const sorted = [...pendingBoletas].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const totalDebt = sorted.reduce((acc, b) => acc + getBoletaBalance(b).balanceDue, 0);
  const totalPaidPending = sorted.reduce((acc, b) => acc + getBoletaBalance(b).totalPaid, 0);
  const aliasFooter = buildMerchantAliasFooter(config);
  const todayStr = currentDateRef || new Date().toISOString().split('T')[0];
  const nowTimeStr = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const recentPaid = includeRecentPaid
    ? [...paidBoletas]
        .sort((a, b) => (b.paidAt || b.saleDate || '').localeCompare(a.paidAt || a.saleDate || ''))
        .slice(0, 3)
    : [];

  const recentPaidBlock =
    recentPaid.length > 0
      ? `\n\n🧾 *Últimos comprobantes cancelados:*\n${recentPaid
          .map((p) => {
            const pBal = getBoletaBalance(p);
            const pDate = p.paidAt ? formatDateEs(p.paidAt.split('T')[0]) : formatDateEs(p.saleDate);
            return `• #${p.boletaNumber} (${pDate}) — ${formatCurrency(pBal.originalAmount, sym)} ✔️`;
          })
          .join('\n')}`
      : '';

  if (sorted.length === 0) {
    return `✅ *ESTADO DE CUENTA CORRIENTE*
🏢 *${config.distributorName}*
📅 Consultado: ${formatDateEs(todayStr)} (${nowTimeStr} hs)

Hola *${client.contactPerson || client.name}*, te confirmamos que tu cuenta se encuentra *AL DÍA (Saldo ${formatCurrency(0, sym)})*.${recentPaidBlock}

¡Muchas gracias por tu confianza!`;
  }

  const lines = sorted.map((b, idx) => {
    const bal = getBoletaBalance(b);
    const status = calculateAlertStatus(b, config, todayStr);
    const quota =
      b.totalInstallments && b.installmentNumber
        ? ` (Cuota ${b.installmentNumber}/${b.totalInstallments})`
        : b.saleMode === 'sena_reserva'
        ? ' (Reserva c/ Seña)'
        : '';
    const detail = b.itemSummary ? ` · ${b.itemSummary}` : '';
    const partialStr =
      bal.hasPartialPayments && bal.totalPaid > 0
        ? ` | Entregado: ${formatCurrency(bal.totalPaid, sym)}`
        : '';
    const statusTag =
      status.daysPastDueDate > 0
        ? `🔴 Vencida hace ${status.daysPastDueDate}d`
        : status.daysRemaining === 0
        ? `🟠 Vence HOY`
        : `🟢 Vigente (${status.daysRemaining}d)`;
    return `${idx + 1}. *#${b.boletaNumber}${quota}*${detail}
   Compra: ${formatDateEs(b.saleDate)} · Vence: ${formatDateEs(b.dueDate)} (${statusTag})${partialStr}
   👉 Saldo pendiente: *${formatCurrency(bal.balanceDue, sym)}*`;
  });

  const summaryExtra =
    totalPaidPending > 0
      ? `\n✔️ *Entregas parciales acumuladas:* ${formatCurrency(totalPaidPending, sym)}`
      : '';

  return `📒 *ESTADO DE CUENTA CORRIENTE*
🏢 *${config.distributorName}*
📅 Consultado: ${formatDateEs(todayStr)} (${nowTimeStr} hs)

Hola *${client.contactPerson || client.name}*:
Te enviamos el detalle completo de tu cuenta al día de hoy (${sorted.length} comprobante${sorted.length === 1 ? '' : 's'} pendiente${sorted.length === 1 ? '' : 's'}):

${lines.join('\n\n')}

━━━━━━━━━━━━━━━━━━━━${summaryExtra}
💰 *SALDO TOTAL ADEUDADO:* *${formatCurrency(totalDebt, sym)}*${aliasFooter}${recentPaidBlock}

Ante cualquier consulta podés respondernos por este mismo WhatsApp. ¡Muchas gracias!`;
}

export interface DailyClosingCollectionItem {
  boletaNumber: string;
  clientName: string;
  amount: number;
  paymentMethod: 'efectivo' | 'transferencia' | 'cheque' | 'otro';
  kind: 'Pago total' | 'Liquidación saldo' | 'Entrega a cuenta';
  receiptNumber?: string;
}

export interface DailyClosingUnpaidItem {
  boletaNumber: string;
  clientName: string;
  salespersonName: string;
  balanceDue: number;
  dueDate: string;
  isOverdue: boolean;
}

export interface DailyClosingMetrics {
  dateStr: string;
  collectedItems: DailyClosingCollectionItem[];
  unpaidItems: DailyClosingUnpaidItem[];
  overdueUnpaidItems: DailyClosingUnpaidItem[];
  totalEfectivo: number;
  totalTransferencia: number;
  totalOtros: number;
  totalGeneralCobrado: number;
  totalUnpaidDebt: number;
  totalOverdueDebt: number;
}

/**
 * Calcula con exactitud matemática los cobros efectuados en el día (por Efectivo, Transferencia y Otros),
 * las boletas pagadas/parciales del día y el detalle de boletas impagas al cierre de la jornada.
 */
export function computeDailyClosingMetrics(
  pendingBoletas: Boleta[],
  paidBoletas: Boleta[],
  targetDateStr: string = new Date().toISOString().split('T')[0]
): DailyClosingMetrics {
  const collectedItems: DailyClosingCollectionItem[] = [];

  // 1. Entregas parciales realizadas hoy sobre boletas aún pendientes
  for (const b of pendingBoletas) {
    if (b.status !== 'pending') continue;
    for (const p of b.partialPayments || []) {
      if (p.date === targetDateStr && Number(p.amount || 0) > 0) {
        collectedItems.push({
          boletaNumber: b.boletaNumber,
          clientName: b.clientName,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod || 'efectivo',
          kind: 'Entrega a cuenta',
          receiptNumber: p.receiptNumber,
        });
      }
    }
  }

  // 2. Boletas archivadas como pagadas hoy (y sus entregas parciales de hoy sin duplicar)
  for (const b of paidBoletas) {
    const partials = b.partialPayments || [];
    const totalAllPartials = partials.reduce((acc, p) => acc + Number(p.amount || 0), 0);

    for (const p of partials) {
      if (p.date === targetDateStr && Number(p.amount || 0) > 0) {
        collectedItems.push({
          boletaNumber: b.boletaNumber,
          clientName: b.clientName,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod || 'efectivo',
          kind: 'Entrega a cuenta',
          receiptNumber: p.receiptNumber,
        });
      }
    }

    if (b.paidAt === targetDateStr) {
      const totalCreditNotes = (b.creditNotes || []).reduce(
        (acc, cn) => acc + Number(cn.amount || 0),
        0
      );
      const netBillable = Math.max(0, Number(b.amount || 0) - totalCreditNotes);
      const remainderAtSettlement = Math.max(0, netBillable - totalAllPartials);
      if (remainderAtSettlement > 0) {
        collectedItems.push({
          boletaNumber: b.boletaNumber,
          clientName: b.clientName,
          amount: remainderAtSettlement,
          paymentMethod: b.paymentMethod || 'efectivo',
          kind: totalAllPartials > 0 ? 'Liquidación saldo' : 'Pago total',
        });
      }
    }
  }

  let totalEfectivo = 0;
  let totalTransferencia = 0;
  let totalOtros = 0;

  for (const item of collectedItems) {
    if (item.paymentMethod === 'efectivo') totalEfectivo += item.amount;
    else if (item.paymentMethod === 'transferencia') totalTransferencia += item.amount;
    else totalOtros += item.amount;
  }

  const totalGeneralCobrado = totalEfectivo + totalTransferencia + totalOtros;

  // 3. Boletas impagas al cierre del día
  const unpaidItems: DailyClosingUnpaidItem[] = pendingBoletas
    .filter((b) => b.status === 'pending')
    .map((b) => {
      const bal = getBoletaBalance(b).balanceDue;
      const isOverdue = Boolean(b.dueDate && b.dueDate <= targetDateStr);
      return {
        boletaNumber: b.boletaNumber,
        clientName: b.clientName,
        salespersonName: b.salespersonName,
        balanceDue: bal,
        dueDate: b.dueDate,
        isOverdue,
      };
    });

  const overdueUnpaidItems = unpaidItems.filter((u) => u.isOverdue);
  const totalUnpaidDebt = unpaidItems.reduce((acc, u) => acc + u.balanceDue, 0);
  const totalOverdueDebt = overdueUnpaidItems.reduce((acc, u) => acc + u.balanceDue, 0);

  return {
    dateStr: targetDateStr,
    collectedItems,
    unpaidItems,
    overdueUnpaidItems,
    totalEfectivo,
    totalTransferencia,
    totalOtros,
    totalGeneralCobrado,
    totalUnpaidDebt,
    totalOverdueDebt,
  };
}

/**
 * Genera el mensaje oficial de WhatsApp al dueño con el Resumen Automático de Cierre del Día.
 */
export function generateDailyClosingOwnerSummary(
  pendingBoletas: Boleta[],
  paidBoletas: Boleta[],
  ownerName: string,
  config: DistributorConfig,
  targetDateStr: string = new Date().toISOString().split('T')[0]
): { message: string; metrics: DailyClosingMetrics } {
  const metrics = computeDailyClosingMetrics(pendingBoletas, paidBoletas, targetDateStr);
  const sym = config.currencySymbol || '$';
  const methodTag = (m: string) =>
    m === 'efectivo' ? 'Efectivo' : m === 'transferencia' ? 'Transferencia' : m === 'cheque' ? 'Cheque' : 'Otro';

  const paidSectionLines =
    metrics.collectedItems.length > 0
      ? metrics.collectedItems
          .slice(0, 20)
          .map(
            (c, idx) =>
              `  ${idx + 1}. *${c.clientName}* (Boleta #${c.boletaNumber}) — ${c.kind} [${methodTag(c.paymentMethod)}]: *${formatCurrency(c.amount, sym)}*`
          )
          .join('\n') +
        (metrics.collectedItems.length > 20
          ? `\n  _...y ${metrics.collectedItems.length - 20} cobro(s) más registrados hoy._`
          : '')
      : '  _No se registraron cobros durante el día de hoy._';

  const unpaidSectionHeader = `⏳ *BOLETAS IMPAGAS / PENDIENTES AL CIERRE (${metrics.unpaidItems.length} total • Saldo: ${formatCurrency(metrics.totalUnpaidDebt, sym)}):*`;
  const unpaidLines =
    metrics.overdueUnpaidItems.length > 0
      ? `🔴 *Vencidas sin pagar (${metrics.overdueUnpaidItems.length} — ${formatCurrency(metrics.totalOverdueDebt, sym)}):*\n` +
        metrics.overdueUnpaidItems
          .slice(0, 12)
          .map(
            (u, idx) =>
              `  ${idx + 1}. ${u.clientName} (#${u.boletaNumber} · Vend: ${u.salespersonName}): ${formatCurrency(u.balanceDue, sym)}`
          )
          .join('\n') +
        (metrics.overdueUnpaidItems.length > 12
          ? `\n  _...y ${metrics.overdueUnpaidItems.length - 12} boletas vencidas más._`
          : '') +
        (metrics.unpaidItems.length > metrics.overdueUnpaidItems.length
          ? `\n🟢 *Vigentes en plazo:* ${metrics.unpaidItems.length - metrics.overdueUnpaidItems.length} boleta(s) pendientes.`
          : '')
      : metrics.unpaidItems.length > 0
      ? `  _Sin boletas vencidas. Quedan ${metrics.unpaidItems.length} boleta(s) vigentes dentro del plazo acordado._`
      : '  _¡Excelente! No quedan boletas impagas al cierre del día._';

  const otrosLine =
    metrics.totalOtros > 0
      ? `\n🧾 *Cheque / Otros:* ${formatCurrency(metrics.totalOtros, sym)}`
      : '';

  const message = `🌙 *RESUMEN DE CIERRE DEL DÍA* 🌙
🏢 *${config.distributorName}*
📅 Fecha: *${formatDateEs(metrics.dateStr)}*

Hola ${ownerName}, este es el balance automático del cierre de hoy:

✅ *BOLETAS COBRADAS HOY (${metrics.collectedItems.length} ingreso${metrics.collectedItems.length === 1 ? '' : 's'}):*
${paidSectionLines}

${unpaidSectionHeader}
${unpaidLines}

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL INGRESADO HOY (CAJA Y BANCOS):*
💵 *Efectivo:* ${formatCurrency(metrics.totalEfectivo, sym)}
🏦 *Transferencia / MP:* ${formatCurrency(metrics.totalTransferencia, sym)}${otrosLine}
━━━━━━━━━━━━━━━━━━━━
✅ *MONTO FINAL TOTAL COBRADO:* *${formatCurrency(metrics.totalGeneralCobrado, sym)}*`;

  return { message, metrics };
}

/**
 * Mensaje de WhatsApp de confirmación de Devolución / Nota de Crédito (Rubro Indumentaria).
 */
export function generateCreditNoteWhatsAppMessage(params: {
  creditNoteNumber: string;
  clientName: string;
  date: string;
  returnedItem: string;
  reasonLabel: string;
  totalCreditAmount: number;
  affectedLines: { boletaNumber: string; appliedCredit: number; newBalanceDue: number }[];
  remainingTotalDebtAfter: number;
  config: DistributorConfig;
}): string {
  const sym = params.config.currencySymbol || '$';
  const linesText = params.affectedLines
    .map(
      (l) =>
        `• Comprobante *#${l.boletaNumber}*: -${formatCurrency(l.appliedCredit, sym)} (Saldo actual: ${
          l.newBalanceDue <= 0 ? 'CANCELADO' : formatCurrency(l.newBalanceDue, sym)
        })`
    )
    .join('\n');

  return `🔄 *NOTA DE CRÉDITO / DEVOLUCIÓN - ${params.creditNoteNumber}*
🏢 *${params.config.distributorName}*

Hola *${params.clientName}*, registramos la devolución en tu cuenta:

👕 *Prenda / Detalle:* ${params.returnedItem}
📌 *Motivo:* ${params.reasonLabel}
📅 *Fecha:* ${formatDateEs(params.date)}
💰 *Monto descontado (Nota de Crédito):* *-${formatCurrency(params.totalCreditAmount, sym)}*

📄 *Aplicación en tus comprobantes:*
${linesText}

━━━━━━━━━━━━━━━━━━━━
📊 *Saldo total restante:* *${
    params.remainingTotalDebtAfter <= 0
      ? '$ 0,00 (AL DÍA)'
      : formatCurrency(params.remainingTotalDebtAfter, sym)
  }*

¡Muchas gracias por tu confianza!`;
}

/**
 * Mensaje personalizado de reactivación para Radar de Clientes Fríos (Rubro Indumentaria).
 */
export function generateIndumentariaReactivationMessage(params: {
  client: Client;
  daysSinceLastPurchase: number;
  favoriteItemLabel?: string;
  pendingDebt: number;
  senderName: string;
  config: DistributorConfig;
}): string {
  const sym = params.config.currencySymbol || '$';
  const greetingName = params.client.contactPerson || params.client.name;
  const itemPhrase = params.favoriteItemLabel
    ? ` y entraron novedades muy lindas en *${params.favoriteItemLabel}* y temporada nueva`
    : ' y justo ingresó mercadería de temporada nueva';

  if (params.pendingDebt > 0) {
    return `Hola *${greetingName}*! Te saluda *${params.senderName}* de *${params.config.distributorName}*

Hace ${params.daysSinceLastPurchase} días de tu última visita${itemPhrase}.
Además te recordamos que tenés un saldo pendiente de *${formatCurrency(params.pendingDebt, sym)}* en tu cuenta para cuando quieras regularizarlo o renovar prendas en cuotas personales.

¿Querés que te pasemos fotos de lo nuevo que entró?`;
  }

  return `Hola *${greetingName}*! Soy *${params.senderName}* de *${params.config.distributorName}*

Hace ${params.daysSinceLastPurchase} días de tu última compra con nosotros${itemPhrase}!
Como tenés tu cuenta *totalmente al día*, podés aprovechar para elegir lo nuevo y pagarlo en *2, 3, 6 o hasta 12 cuotas personales* o con seña/reserva.

¿Querés que te mande fotos de los ingresos de esta semana?`;
}

/**
 * Mensaje de WhatsApp con Link de Pago Automático (Dinero en cuenta MP / Tarjeta de Crédito / Débito / Alias)
 * Al abonarse por este link, el sistema acredita el pago al instante y marca automáticamente las boletas del cliente como PAGADAS.
 */
export function generateClientPaymentLinkWhatsAppMessage(params: {
  clientName: string;
  distributorName: string;
  amount: number;
  currencySymbol?: string;
  boletaNumbers: string[];
  payUrl: string;
  mpInitPoint?: string;
  mpCheckoutLink?: string;
  alias?: string;
  cvu?: string;
  holderName?: string;
}): string {
  const sym = params.currencySymbol || '$';
  const boletasList =
    params.boletaNumbers.length > 0
      ? params.boletaNumbers.map((n) => `#${n}`).join(', ')
      : 'Saldo en cuenta';
  const aliasLine = params.alias ? `\n• *Alias:* \`${params.alias}\`` : '';
  const cvuLine = params.cvu ? `\n• *CVU/CBU:* ${params.cvu}` : '';
  const holderLine = params.holderName ? `\n• *Titular:* ${params.holderName}` : '';
  const bankBlock =
    aliasLine || cvuLine
      ? `\n\n🏦 *También podés transferir al Alias/CVU (acreditación inmediata):*${aliasLine}${cvuLine}${holderLine}`
      : '';

  const directMpLine =
    params.mpInitPoint && params.mpInitPoint.trim()
      ? `\n⚡ *Acceso directo Mercado Pago:* ${params.mpInitPoint}`
      : '';

  return `💳 *LINK DE PAGO ONLINE — ${params.distributorName}*

Hola *${params.clientName}*, te enviamos el enlace seguro para abonar tu cuenta de forma inmediata con *Dinero en cuenta de Mercado Pago, Tarjeta de Crédito o Débito*:

📄 *Comprobante(s):* ${boletasList}
💰 *Importe total a abonar:* *${formatCurrency(params.amount, sym)}*

🔗 *Pagar ahora desde este link:*
${params.payUrl}${directMpLine}${bankBlock}

✅ _Una vez acreditado, tu cuenta se actualiza y queda marcada como PAGADA automáticamente sin necesidad de avisarnos._`;
}

export type CatalogOrderProcessStage =
  | 'en_proceso_armando'
  | 'listo_para_retirar'
  | 'en_camino'
  | 'retirado';

/**
 * Mensajes de WhatsApp automáticos / en 1 clic hacia el CLIENTE durante el proceso de su pedido web:
 * 1) Pago en proceso y armando tu pedido
 * 2) Pedido listo para pasar a buscar (Retiro en tienda)
 * 3) Pedido en viaje a tu domicilio (Envío)
 * 4) Pedido entregado / retirado y pagado
 */
export function generateCatalogOrderCustomerProcessMessage(params: {
  order: CatalogPickupOrder;
  stage: CatalogOrderProcessStage;
  storeName?: string;
  pickupAddress?: string;
  pickupHours?: string;
}): string {
  const { order, stage, pickupAddress, pickupHours } = params;
  const shopName = storeNameOrFallback(params.storeName || order.storeName);
  const sym = order.currencySymbol || '$';
  const isDelivery = order.deliveryMethod === 'envio';
  const itemsBlock = (order.items || [])
    .map(
      (it) =>
        `• ${it.quantity} × *${it.productName}*${it.variantLabel ? ` (${it.variantLabel})` : ''}${
          it.sku ? ` [Cód: ${it.sku}]` : ''
        } — ${formatCurrency(it.subtotal, sym)}`
    )
    .join('\n');

  const customerRequestText = (order.customerSpecificRequest || order.notes || '').trim();
  const specificRequestLine = customerRequestText
    ? `\n📝 *Observaciones / Pedido específico:* ${customerRequestText}`
    : '';

  const paymentMethodKey = order.confirmedPaymentMethod || order.preferredPaymentMethod || 'acordar';
  const paymentName =
    paymentMethodKey === 'mercadopago_dinero_cuenta'
      ? 'Mercado Pago (Dinero en cuenta)'
      : paymentMethodKey === 'link_pago'
      ? 'Mercado Pago / Tarjetas'
      : paymentMethodKey === 'transferencia'
      ? 'Transferencia bancaria'
      : paymentMethodKey === 'efectivo'
      ? isDelivery
        ? 'Efectivo contra entrega'
        : 'Efectivo al retirar'
      : paymentMethodKey === 'fiado'
      ? 'Cuenta Corriente'
      : 'A coordinar';

  const paymentLine =
    order.paymentStatus === 'acreditado'
      ? `✅ *Pago:* Acreditado (${paymentName})`
      : order.paymentStatus === 'comprobante_en_revision' || order.transferReceiptImageUrl
      ? `🔎 *Pago:* Comprobante de transferencia recibido (en verificación)`
      : `⏳ *Pago:* En proceso (${paymentName})`;

  if (stage === 'en_proceso_armando') {
    return (
      `⏳ *PAGO EN PROCESO Y ARMANDO TU PEDIDO*\n` +
      `🏪 *${shopName}*\n\n` +
      `Hola *${order.customerName}*, recibimos tu pedido *#${order.orderNumber}* por *${formatCurrency(
        order.totalAmount,
        sym
      )}*.\n\n` +
      `${paymentLine}\n` +
      `📦 *Estado actual:* Ya estamos armando y preparando tus productos.\n\n` +
      `${itemsBlock}${specificRequestLine}\n\n` +
      (isDelivery
        ? `🚚 Te avisaremos por este WhatsApp apenas salga el envío hacia *${order.deliveryAddress || 'tu domicilio'}*.`
        : `🏪 Te avisaremos por este WhatsApp apenas esté *listo para pasar a buscar* por nuestro local.`)
    );
  }

  if (stage === 'listo_para_retirar') {
    const addressLine = pickupAddress ? `\n📍 *Dirección de retiro:* ${pickupAddress}` : '';
    const hoursLine = pickupHours ? `\n🕒 *Horarios:* ${pickupHours}` : '';
    return (
      `✅ *¡TU PEDIDO ESTÁ LISTO PARA PASAR A BUSCAR!*\n` +
      `🏪 *${shopName}*\n\n` +
      `Hola *${order.customerName}*, tu pedido *#${order.orderNumber}* ya está armado y listo para retirar.\n\n` +
      `${paymentLine}\n` +
      `💰 *Total:* *${formatCurrency(order.totalAmount, sym)}*${addressLine}${hoursLine}\n\n` +
      `*Detalle:*\n${itemsBlock}${specificRequestLine}\n\n` +
      `¡Te esperamos cuando gustes!`
    );
  }

  if (stage === 'en_camino') {
    const dest = order.deliveryAddress ? `\n📍 *Destino:* ${order.deliveryAddress}` : '';
    return (
      `🚚 *¡TU PEDIDO ESTÁ EN VIAJE A TU DOMICILIO!*\n` +
      `🏪 *${shopName}*\n\n` +
      `Hola *${order.customerName}*, te avisamos que tu pedido *#${order.orderNumber}* ya salió de la tienda y se encuentra en camino.${dest}\n\n` +
      `${paymentLine}\n` +
      `💰 *Importe:* *${formatCurrency(order.totalAmount, sym)}*\n\n` +
      `*Detalle:*\n${itemsBlock}${specificRequestLine}\n\n` +
      `¡Por favor estate atento/a para recibirlo!`
    );
  }

  return (
    `🎉 *PEDIDO ${isDelivery ? 'ENTREGADO' : 'RETIRADO'} Y COMPLETADO*\n` +
    `🏪 *${shopName}*\n\n` +
    `Hola *${order.customerName}*, confirmamos que tu pedido *#${order.orderNumber}* por *${formatCurrency(
      order.totalAmount,
      sym
    )}* fue ${isDelivery ? 'entregado' : 'retirado'} correctamente.\n` +
    `✅ *Pago:* Confirmado (${paymentName})\n\n` +
    `¡Muchas gracias por tu compra!`
  );
}

export function generateStockAlertRestockWhatsAppMessage(params: {
  customerName: string;
  productName: string;
  variantLabel?: string;
  productSku?: string;
  storeName?: string;
  publicUrl?: string;
}): string {
  const shopName = storeNameOrFallback(params.storeName);
  const variantPart = params.variantLabel ? ` (${params.variantLabel})` : '';
  const skuPart = params.productSku ? ` [Cód: ${params.productSku}]` : '';
  const linkPart = params.publicUrl ? `\n\nPodés pedirlo directo desde nuestro catálogo online:\n🔗 ${params.publicUrl}` : '';
  return (
    `🔔 *¡VOLVIÓ A ENTRAR STOCK!*\n` +
    `🏪 *${shopName}*\n\n` +
    `Hola *${params.customerName}*, te avisamos tal como nos pediste que ya ingresó nuevamente *${params.productName}*${variantPart}${skuPart}.${linkPart}\n\n` +
    `¡Gracias por esperar!`
  );
}

export function generateCatalogPromoClubWhatsAppMessage(params: {
  customerName: string;
  storeName?: string;
  promoText: string;
  couponCode?: string;
  publicUrl?: string;
}): string {
  const shopName = storeNameOrFallback(params.storeName);
  const couponLine = params.couponCode?.trim()
    ? `\n\n🎟️ *Cupón exclusivo:* \`${params.couponCode.trim().toUpperCase()}\``
    : '';
  const linkLine = params.publicUrl
    ? `\n\n🛍️ Mirá el catálogo online y aprovechalo acá:\n🔗 ${params.publicUrl}`
    : '';
  return (
    `🎁 *PROMO ESPECIAL PARA VOS*\n` +
    `🏪 *${shopName}*\n\n` +
    `Hola *${params.customerName}*! ${params.promoText.trim()}${couponLine}${linkLine}\n\n` +
    `¡Te esperamos!`
  );
}

export function generateCatalogBirthdayPromoWhatsAppMessage(params: {
  customerName: string;
  storeName?: string;
  customMessage?: string;
  couponCode?: string;
  couponDiscountLabel?: string;
  publicUrl?: string;
}): string {
  const shopName = storeNameOrFallback(params.storeName);
  const body =
    params.customMessage?.trim() ||
    `¡Desde *${shopName}* queremos desearte un muy Feliz Cumpleaños! Para celebrarlo con vos te dejamos un beneficio especial en tu próxima compra.`;
  const couponLine = params.couponCode?.trim()
    ? `\n\n🎂 *Tu cupón regalo:* \`${params.couponCode.trim().toUpperCase()}\`${
        params.couponDiscountLabel ? ` (${params.couponDiscountLabel})` : ''
      }`
    : '';
  const linkLine = params.publicUrl
    ? `\n\n🛍️ Usalo directo desde nuestra tienda web:\n🔗 ${params.publicUrl}`
    : '';
  return (
    `🎉 *¡FELIZ CUMPLEAÑOS, ${params.customerName.toUpperCase()}!*\n` +
    `🏪 *${shopName}*\n\n` +
    `${body}${couponLine}${linkLine}\n\n` +
    `¡Que tengas un hermoso día!`
  );
}

export function generateAbandonedCartRecoveryWhatsAppMessage(params: {
  customerName?: string;
  storeName?: string;
  itemsSummary: string[];
  totalAmount: number;
  currencySymbol?: string;
  couponCode?: string;
  couponDiscountLabel?: string;
  catalogUrl?: string;
}): string {
  const shopName = storeNameOrFallback(params.storeName);
  const sym = params.currencySymbol || '$';
  const greeting = params.customerName?.trim() ? `*${params.customerName.trim()}*` : 'hola';
  const itemsBlock = params.itemsSummary.map((line) => `• ${line}`).join('\n');
  const couponLine = params.couponCode?.trim()
    ? `\n\n🎁 *Te regalamos el cupón:* \`${params.couponCode.trim().toUpperCase()}\`${
        params.couponDiscountLabel ? ` (${params.couponDiscountLabel})` : ''
      } para que lo uses hoy.`
    : '';
  const linkLine = params.catalogUrl
    ? `\n\n🛍️ Retomá tu carrito en 1 clic acá:\n🔗 ${params.catalogUrl}`
    : '';

  return (
    `🛒 *¡GUARDAMOS TU CARRITO PARA VOS!*\n` +
    `🏪 *${shopName}*\n\n` +
    `Hola ${greeting}, vimos que dejaste seleccionados estos productos en nuestro catálogo web:\n` +
    `${itemsBlock}\n\n` +
    `💰 *Total estimado:* ${formatCurrency(params.totalAmount, sym)}${couponLine}${linkLine}\n\n` +
    `¿Querés que te lo reservemos o te ayudamos con el talle / medio de pago?`
  );
}

export function generateGiftCardWhatsAppMessage(params: {
  code: string;
  amount: number;
  currencySymbol?: string;
  storeName?: string;
  recipientName?: string;
  buyerName?: string;
  message?: string;
  expiresAt?: string;
  catalogUrl?: string;
}): string {
  const shopName = storeNameOrFallback(params.storeName);
  const sym = params.currencySymbol || '$';
  const toLine = params.recipientName?.trim()
    ? `Hola *${params.recipientName.trim()}*, `
    : '¡Hola! ';
  const fromLine = params.buyerName?.trim()
    ? `*${params.buyerName.trim()}* te envió una `
    : 'Recibiste una ';
  const customNote = params.message?.trim() ? `\n💌 _"${params.message.trim()}"_` : '';
  const expLine = params.expiresAt
    ? `\n📅 *Válida hasta:* ${formatDateEs(params.expiresAt)}`
    : '';
  const linkLine = params.catalogUrl
    ? `\n\n🛍️ Usala ingresando tu código en el carrito web:\n🔗 ${params.catalogUrl}`
    : '';

  return (
    `🎁 *GIFT CARD DIGITAL — ${shopName}*\n\n` +
    `${toLine}${fromLine}*Gift Card Digital* para elegir lo que más te guste:${customNote}\n\n` +
    `🎟️ *Código de canje:* \`${params.code}\`\n` +
    `💵 *Saldo disponible:* *${formatCurrency(params.amount, sym)}*${expLine}${linkLine}\n\n` +
    `¡Disfrutá tu regalo!`
  );
}

export function generateOrderReturnConfirmationWhatsAppMessage(params: {
  orderNumber: string;
  customerName: string;
  storeName?: string;
  currencySymbol?: string;
  returnTypeLabel: string;
  returnedItemsSummary: string[];
  replacementSummary?: string;
  returnedAmount: number;
  refundResolutionLabel: string;
  creditIssuedAmount?: number;
  newStoreCreditBalance?: number;
  pointsDeducted?: number;
  newPointsBalance?: number;
}): string {
  const shopName = storeNameOrFallback(params.storeName);
  const sym = params.currencySymbol || '$';
  const itemsBlock = params.returnedItemsSummary.map((l) => `• ${l}`).join('\n');
  const replacementBlock = params.replacementSummary
    ? `\n🔄 *Prenda entregada en cambio:* ${params.replacementSummary}`
    : '';
  const creditBlock =
    params.creditIssuedAmount && params.creditIssuedAmount > 0
      ? `\n💳 *Saldo a favor acreditado en tu DNI:* *${formatCurrency(
          params.creditIssuedAmount,
          sym
        )}*${
          typeof params.newStoreCreditBalance === 'number'
            ? ` (Disponible actual: ${formatCurrency(params.newStoreCreditBalance, sym)})`
            : ''
        }`
      : '';
  const pointsBlock =
    params.pointsDeducted && params.pointsDeducted > 0
      ? `\n⭐ *Ajuste Club de Puntos:* -${params.pointsDeducted} pts por devolución${
          typeof params.newPointsBalance === 'number'
            ? ` (Saldo actual: ${params.newPointsBalance} pts)`
            : ''
        }`
      : '';

  return (
    `🔄 *COMPROBANTE DE ${params.returnTypeLabel.toUpperCase()} — #${params.orderNumber}*\n` +
    `🏪 *${shopName}*\n\n` +
    `Hola *${params.customerName}*, dejamos registrada tu gestión:\n\n` +
    `${itemsBlock}${replacementBlock}\n\n` +
    `💰 *Monto gestionado:* *${formatCurrency(params.returnedAmount, sym)}*\n` +
    `📌 *Resolución:* ${params.refundResolutionLabel}${creditBlock}${pointsBlock}\n\n` +
    `¡Gracias por comunicarte con nosotros!`
  );
}

function storeNameOrFallback(name?: string): string {
  const clean = (name || '').trim();
  return clean || 'Nuestra Tienda';
}



