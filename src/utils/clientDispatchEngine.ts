import { Administrator, AutoDispatchLog, Boleta, Client, DistributorConfig, Salesperson } from '../types';
import { createWhatsAppUrl } from './whatsapp';

function cleanPhoneNumber(phone: string): string {
  return String(phone || '').replace(/[^0-9]/g, '');
}

async function sendDirectWhatsAppFromClient(
  phone: string,
  text: string,
  config: Partial<DistributorConfig>
): Promise<{
  success: boolean;
  deliveryStatus: AutoDispatchLog['deliveryStatus'];
  info: string;
}> {
  const cleanPhone = cleanPhoneNumber(phone);
  if (!cleanPhone) {
    return {
      success: false,
      deliveryStatus: 'simulated',
      info: 'Sin teléfono configurado para WhatsApp',
    };
  }

  if (config.whatsappProvider === 'webhook' && config.webhookGatewayUrl) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.webhookAuthKey) {
        headers['apikey'] = config.webhookAuthKey;
        headers['Authorization'] = `Bearer ${config.webhookAuthKey}`;
      }
      const response = await fetch(config.webhookGatewayUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: cleanPhone,
          message: text,
          number: cleanPhone,
          text,
        }),
      });
      if (response.ok) {
        return {
          success: true,
          deliveryStatus: 'gateway_api',
          info: 'Enviado directo por Webhook Gateway',
        };
      }
    } catch {
      // Fallback gracefully to direct WhatsApp link queue
    }
  }

  return {
    success: true,
    deliveryStatus: 'queued',
    info: 'Mensaje preparado con enlace directo de WhatsApp y registrado en Supabase',
  };
}

export async function executeDailyAlertsDirect(params: {
  boletas: Boleta[];
  clients: Client[];
  salespeople: Salesperson[];
  admins: Administrator[];
  config: DistributorConfig;
}): Promise<{ logs: AutoDispatchLog[]; count: number }> {
  const { boletas = [], clients = [], salespeople = [], admins = [], config } = params;
  const now = new Date();
  const nowIso = now.toISOString();
  const channels = config.autoDispatchChannels || 'both';
  const distributorName = config.distributorName || 'Mi Empresa';

  const generalAdmin =
    admins.find((a) => a.isGeneralAdmin || a.role === 'dueño') ||
    admins[0] || {
      id: 'adm-1',
      name: 'Administración',
      phone: config.senderPhone || config.distributorPhone || '',
      email: config.senderEmail || config.distributorEmail || '',
    };

  const logs: AutoDispatchLog[] = [];
  const pending = boletas.filter((b) => b.status === 'pending');

  const evaluated = pending.map((b) => {
    const saleDate = new Date(`${b.saleDate}T12:00:00`);
    const dueDate = new Date(`${b.dueDate}T12:00:00`);
    const daysElapsed = Math.max(
      0,
      Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = daysRemaining <= 0 || daysElapsed >= (b.termDays || 7);

    const totalPartial = (b.partialPayments || []).reduce(
      (acc, p) => acc + Number(p.amount || 0),
      0
    );
    const balanceDue = Math.max(0, Number(b.amount || 0) - totalPartial);

    return {
      boleta: b,
      daysElapsed,
      daysRemaining,
      isOverdue,
      balanceDue,
      seller: salespeople.find((s) => s.id === b.salespersonId),
    };
  });

  const ownerRecipients = admins.filter((a) => a.role === 'dueño' || a.receiveAdminAlerts);
  const targetOwners = ownerRecipients.length > 0 ? ownerRecipients : [generalAdmin];

  // 1. BOLETAS VENCIDAS / COBROS DE HOY
  const overdueItems = evaluated.filter((e) => e.isOverdue);

  if (overdueItems.length > 0) {
    const grandTotal = overdueItems.reduce((acc, e) => acc + e.balanceDue, 0);
    const ownerSummaryLines = overdueItems
      .map(
        (e, idx) =>
          `  ${idx + 1}. ${e.boleta.clientName} (Boleta #${e.boleta.boletaNumber}) - Vendedor: ${e.boleta.salespersonName} - $ ${e.balanceDue.toLocaleString('es-AR')}`
      )
      .join('\n');

    const ownerFullMessage = `🚨 *REPORTE DE COBRANZAS DEL DÍA PARA EL DUEÑO* 🚨\n🏢 *${distributorName}*\n\nHola ${generalAdmin.name}, este es el resumen de las ${overdueItems.length} boletas que hoy deben cobrarse sí o sí en la calle:\n\n${ownerSummaryLines}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL A COBRAR HOY:* $ ${grandTotal.toLocaleString('es-AR')}\n\n_Se despachó automáticamente la orden de cobro a los vendedores correspondientes._`;

    const ownerDispatchResult = await sendDirectWhatsAppFromClient(
      generalAdmin.phone,
      ownerFullMessage,
      config
    );

    logs.push({
      id: `auto-${Date.now()}-owner-overdue`,
      timestamp: nowIso,
      channel: channels,
      recipientName: generalAdmin.name,
      recipientRole: 'dueño',
      recipientContact: `${generalAdmin.phone} / ${generalAdmin.email}`,
      recipientPhone: generalAdmin.phone,
      recipientEmail: generalAdmin.email,
      boletasCount: overdueItems.length,
      totalAmount: grandTotal,
      messageSnippet: `🚨 REPORTE AL DUEÑO: Hoy ${overdueItems.length} boletas deben cobrarse en la calle por $ ${grandTotal.toLocaleString('es-AR')}.`,
      fullMessage: ownerFullMessage,
      whatsappUrl: createWhatsAppUrl(generalAdmin.phone, ownerFullMessage),
      ruleMilestone: 'overdue',
      status: 'sent',
      deliveryStatus: ownerDispatchResult.deliveryStatus,
      gatewayResponse: ownerDispatchResult.info,
    });

    const bySeller: Record<string, typeof overdueItems> = {};
    for (const item of overdueItems) {
      const sId = item.boleta.salespersonId;
      if (!bySeller[sId]) bySeller[sId] = [];
      bySeller[sId].push(item);
    }

    for (const [sId, items] of Object.entries(bySeller)) {
      const seller = salespeople.find((s) => s.id === sId) || items[0].seller;
      const sTotal = items.reduce((acc, i) => acc + i.balanceDue, 0);
      if (seller && seller.phone) {
        const sellerItemsList = items
          .map(
            (i, idx) =>
              `  ${idx + 1}. *${i.boleta.clientName}* (${i.boleta.clientAddress || 'Sin dir'})\n     Boleta #${i.boleta.boletaNumber} • Saldo: $ ${i.balanceDue.toLocaleString('es-AR')}`
          )
          .join('\n\n');

        const sellerFullMessage = `🚨 *HOJA DE RUTA DE COBRANZAS DE HOY* 🚨\n🏢 *${distributorName}*\n\nHola ${seller.name}, soy *${generalAdmin.name}*.\nHoy tenés que salir a cobrar ${items.length} boleta(s) por un monto total de *$ ${sTotal.toLocaleString('es-AR')}*:\n\n${sellerItemsList}\n\n━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL A RENDIR HOY:* $ ${sTotal.toLocaleString('es-AR')}\n\nPor favor realizá las visitas hoy y rendí el cobro en administración.`;

        const sellerResult = await sendDirectWhatsAppFromClient(
          seller.phone,
          sellerFullMessage,
          config
        );

        logs.push({
          id: `auto-${Date.now()}-seller-${seller.id}`,
          timestamp: nowIso,
          channel: channels,
          recipientName: seller.name,
          recipientRole: 'vendedor',
          recipientContact: `${seller.phone} / ${seller.email}`,
          recipientPhone: seller.phone,
          recipientEmail: seller.email,
          boletasCount: items.length,
          totalAmount: sTotal,
          messageSnippet: `🚨 SALIDA A COBRAR VENDEDOR: Hola ${seller.name}, hoy tenés que salir a cobrar ${items.length} boletas por $ ${sTotal.toLocaleString('es-AR')}.`,
          fullMessage: sellerFullMessage,
          whatsappUrl: createWhatsAppUrl(seller.phone, sellerFullMessage),
          ruleMilestone: 'overdue',
          status: 'sent',
          deliveryStatus: sellerResult.deliveryStatus,
          gatewayResponse: sellerResult.info,
        });
      }
    }

    if (config.enableClientWhatsAppReminders && config.includeClientsInAutoDispatch) {
      for (const item of overdueItems) {
        const clientObj = clients.find((c) => c.id === item.boleta.clientId);
        const clientPhone = item.boleta.clientPhone || clientObj?.phone || '';
        const clientDisplayName = clientObj?.contactPerson || item.boleta.clientName;

        if (clientPhone && cleanPhoneNumber(clientPhone)) {
          const amountFormatted = `$ ${Number(item.balanceDue).toLocaleString('es-AR')}`;
          const clientMsg =
            config.customClientOverdueTemplate && String(config.customClientOverdueTemplate).trim()
              ? String(config.customClientOverdueTemplate)
                  .replace(/{cliente}/gi, clientDisplayName)
                  .replace(/{distribuidora}/gi, distributorName)
                  .replace(/{boleta}/gi, item.boleta.boletaNumber)
                  .replace(/{monto}/gi, amountFormatted)
                  .replace(/{vencimiento}/gi, item.boleta.dueDate)
                  .replace(/{fechaVenta}/gi, item.boleta.saleDate)
                  .replace(/{vendedor}/gi, item.boleta.salespersonName)
                  .replace(/{dias}/gi, String(item.daysElapsed))
              : `⚠️ *RECORDATORIO DE FACTURA VENCIDA* ⚠️\n🏢 *${distributorName}*\n\nEstimado/a ${clientDisplayName}:\nLe informamos que la boleta/factura firmada *#${item.boleta.boletaNumber}* ha superado su fecha límite (${item.boleta.dueDate}) y se encuentra *VENCIDA*.\n\n💰 *Saldo pendiente:* *${amountFormatted}*\n🧑‍💼 *Vendedor asignado:* ${item.boleta.salespersonName}\n\nPor favor le solicitamos coordinar el pago con nuestro vendedor o administración para mantener su cuenta al día. ¡Muchas gracias!`;

          const clientRes = await sendDirectWhatsAppFromClient(clientPhone, clientMsg, config);

          logs.push({
            id: `auto-${Date.now()}-client-${item.boleta.id}`,
            timestamp: nowIso,
            channel: 'whatsapp',
            recipientName: item.boleta.clientName,
            recipientRole: 'cliente',
            recipientContact: clientPhone,
            recipientPhone: clientPhone,
            recipientEmail: clientObj?.email || '',
            boletasCount: 1,
            totalAmount: item.balanceDue,
            messageSnippet: `👤 RECORDATORIO AL CLIENTE: Boleta #${item.boleta.boletaNumber} vencida (${amountFormatted}) enviada a ${item.boleta.clientName}.`,
            fullMessage: clientMsg,
            whatsappUrl: createWhatsAppUrl(clientPhone, clientMsg),
            ruleMilestone: 'overdue_client',
            status: 'sent',
            deliveryStatus: clientRes.deliveryStatus,
            gatewayResponse: clientRes.info,
          });
        }
      }
    }
  }

  // 2. HITO: 2 DÍAS -> SOLO VENDEDOR
  const reminderDays = config.vendedorReminderDays || 2;
  const itemsAt2Days = evaluated.filter((e) => e.daysElapsed === reminderDays && !e.isOverdue);
  for (const item of itemsAt2Days) {
    if (item.seller && item.seller.phone) {
      const fullMessage = `📋 *RECORDATORIO A LOS 2 DÍAS DE VENTA*\n🏢 *${distributorName}*\n\nHola ${item.seller.name}, soy *${generalAdmin.name}*.\nRecordatorio preventivo: hace 2 días se entregó fiada la boleta #${item.boleta.boletaNumber} a *${item.boleta.clientName}*:\n\n📍 *Dirección:* ${item.boleta.clientAddress || 'Ver ficha'}\n📅 *Venta:* ${item.boleta.saleDate} (2 días transcurridos)\n⏰ *Vence:* ${item.boleta.dueDate} (Plazo ${item.boleta.termDays} días)\n💰 *Monto a cobrar:* $ ${item.balanceDue.toLocaleString('es-AR')}\n\nTenela en cuenta en tu hoja de ruta semanal para cobrarla en término.`;

      const result = await sendDirectWhatsAppFromClient(item.seller.phone, fullMessage, config);

      logs.push({
        id: `auto-${Date.now()}-2d-ven-${item.boleta.id}`,
        timestamp: nowIso,
        channel: channels,
        recipientName: item.seller.name,
        recipientRole: 'vendedor',
        recipientContact: item.seller.phone,
        recipientPhone: item.seller.phone,
        recipientEmail: item.seller.email,
        boletasCount: 1,
        totalAmount: item.balanceDue,
        messageSnippet: `📋 RECORDATORIO (2 DÍAS): Boleta #${item.boleta.boletaNumber} de ${item.boleta.clientName} ($ ${item.balanceDue.toLocaleString('es-AR')}) enviada a ${item.seller.name}.`,
        fullMessage,
        whatsappUrl: createWhatsAppUrl(item.seller.phone, fullMessage),
        ruleMilestone: '2d',
        status: 'sent',
        deliveryStatus: result.deliveryStatus,
        gatewayResponse: result.info,
      });
    }
  }

  // 3. HITO: 6 DÍAS -> VENDEDOR + DUEÑOS
  const adminAlertDays = config.adminAlertDays || 6;
  const itemsAt6Days = evaluated.filter((e) => e.daysElapsed === adminAlertDays);
  for (const item of itemsAt6Days) {
    if (item.seller && item.seller.phone) {
      const sellerMsg = `⚠️ *AVISO A LOS 6 DÍAS DE EMISIÓN*\n🏢 *${distributorName}*\n\nHola ${item.seller.name}, soy *${generalAdmin.name}*.\nTe notificamos que la boleta #${item.boleta.boletaNumber} de *${item.boleta.clientName}* cumple *6 días* desde su emisión:\n\n📍 *Dirección:* ${item.boleta.clientAddress || 'Ver ficha'}\n📅 *Venta:* ${item.boleta.saleDate}\n⏰ *Vence:* ${item.boleta.dueDate}\n💰 *Monto pendiente:* $ ${item.balanceDue.toLocaleString('es-AR')}\n\nAviso enviado en simultáneo a los dueños. Por favor coordiná el cobro para evitar mora.`;

      const result = await sendDirectWhatsAppFromClient(item.seller.phone, sellerMsg, config);

      logs.push({
        id: `auto-${Date.now()}-6d-ven-${item.boleta.id}`,
        timestamp: nowIso,
        channel: channels,
        recipientName: item.seller.name,
        recipientRole: 'vendedor',
        recipientContact: item.seller.phone,
        recipientPhone: item.seller.phone,
        recipientEmail: item.seller.email,
        boletasCount: 1,
        totalAmount: item.balanceDue,
        messageSnippet: `⚠️ ALERTA (6 DÍAS): Boleta #${item.boleta.boletaNumber} de ${item.boleta.clientName} enviada a ${item.seller.name}.`,
        fullMessage: sellerMsg,
        whatsappUrl: createWhatsAppUrl(item.seller.phone, sellerMsg),
        ruleMilestone: '6d',
        status: 'sent',
        deliveryStatus: result.deliveryStatus,
        gatewayResponse: result.info,
      });
    }

    for (const owner of targetOwners) {
      if (owner.phone) {
        const ownerMsg = `⚠️ *ALERTA 6 DÍAS PARA DUEÑOS: SEGUIMIENTO DE COBRANZA*\n🏢 *${distributorName}*\n\nHola ${owner.name}, aviso preventivo de control:\nEl vendedor *${item.boleta.salespersonName}* tiene la boleta #${item.boleta.boletaNumber} de *${item.boleta.clientName}* que hoy cumple *6 días* sin cobrarse:\n\n🧑‍💼 *Vendedor:* ${item.boleta.salespersonName}\n👤 *Cliente:* ${item.boleta.clientName}\n💰 *Importe:* $ ${item.balanceDue.toLocaleString('es-AR')}\n⏰ *Vence:* ${item.boleta.dueDate}\n\nSe emitió aviso al vendedor para que realice el cobro antes de ingresar en zona de mora de 10 días.`;

        const ownerRes = await sendDirectWhatsAppFromClient(owner.phone, ownerMsg, config);

        logs.push({
          id: `auto-${Date.now()}-6d-own-${owner.id}-${item.boleta.id}`,
          timestamp: nowIso,
          channel: channels,
          recipientName: owner.name,
          recipientRole: 'dueño',
          recipientContact: owner.phone || owner.email,
          recipientPhone: owner.phone,
          recipientEmail: owner.email,
          boletasCount: 1,
          totalAmount: item.balanceDue,
          messageSnippet: `⚠️ ALERTA 6 DÍAS DUEÑO: Boleta #${item.boleta.boletaNumber} de ${item.boleta.clientName} ($ ${item.balanceDue.toLocaleString('es-AR')}).`,
          fullMessage: ownerMsg,
          whatsappUrl: createWhatsAppUrl(owner.phone, ownerMsg),
          ruleMilestone: '6d',
          status: 'sent',
          deliveryStatus: ownerRes.deliveryStatus,
          gatewayResponse: ownerRes.info,
        });
      }
    }
  }

  // 4. HITO: 10-14 DÍAS
  const itemsAt10Days = evaluated.filter((e) => e.daysElapsed >= 10 && e.daysElapsed < 15);
  for (const item of itemsAt10Days) {
    if (item.seller && item.seller.phone) {
      const sellerMsg = `🚨 *MODO ALERTA (10+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨\n🏢 *${distributorName}*\n\nHola ${item.seller.name}, soy *${generalAdmin.name}*.\n*AVISO URGENTE: La boleta #${item.boleta.boletaNumber} ya superó los 10 días (${item.daysElapsed} días) y SIGUE SIN ESTAR PAGA*.\n*Necesito que vayas a cobrarle hoy con prioridad máxima a ${item.boleta.clientName}*:\n\n📍 *Dirección:* ${item.boleta.clientAddress || 'Ver ficha'}\n📅 *Venta:* ${item.boleta.saleDate} (${item.daysElapsed} días transcurridos)\n⏰ *Vencimiento original:* ${item.boleta.dueDate}\n💰 *Saldo a cobrar:* $ ${item.balanceDue.toLocaleString('es-AR')}\n\n📌 Se encuentra en rojo prioritario en el sistema central de cobranzas y los dueños ya tienen el reporte. Confirmame el cobro apenas lo efectúes.`;

      const result = await sendDirectWhatsAppFromClient(item.seller.phone, sellerMsg, config);

      logs.push({
        id: `auto-${Date.now()}-10d-ven-${item.boleta.id}`,
        timestamp: nowIso,
        channel: channels,
        recipientName: item.seller.name,
        recipientRole: 'vendedor',
        recipientContact: item.seller.phone,
        recipientPhone: item.seller.phone,
        recipientEmail: item.seller.email,
        boletasCount: 1,
        totalAmount: item.balanceDue,
        messageSnippet: `🚨 MODO ALERTA (10 DÍAS): Boleta #${item.boleta.boletaNumber} de ${item.boleta.clientName} SIGUE SIN ESTAR PAGA.`,
        fullMessage: sellerMsg,
        whatsappUrl: createWhatsAppUrl(item.seller.phone, sellerMsg),
        ruleMilestone: '10d',
        status: 'sent',
        deliveryStatus: result.deliveryStatus,
        gatewayResponse: result.info,
      });
    }

    for (const owner of targetOwners) {
      if (owner.phone) {
        const ownerMsg = `🚨 *ALERTA DUEÑOS (10+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨\n🏢 *${distributorName}*\n\nHola ${owner.name}, atención con boleta demorada:\nLa boleta #${item.boleta.boletaNumber} del vendedor *${item.boleta.salespersonName}* para el cliente *${item.boleta.clientName}* ya cumplió *${item.daysElapsed} días y SIGUE SIN ESTAR PAGA*.\n\n🧑‍💼 *Vendedor responsable:* ${item.boleta.salespersonName}\n👤 *Cliente:* ${item.boleta.clientName}\n📅 *Fecha de venta:* ${item.boleta.saleDate} (${item.daysElapsed} días transcurridos)\n💰 *Monto a cobrar:* $ ${item.balanceDue.toLocaleString('es-AR')}\n\n📌 Figura en primer lugar en color rojo prioritario en el inicio para su cobro urgente.`;

        const ownerRes = await sendDirectWhatsAppFromClient(owner.phone, ownerMsg, config);

        logs.push({
          id: `auto-${Date.now()}-10d-own-${owner.id}-${item.boleta.id}`,
          timestamp: nowIso,
          channel: channels,
          recipientName: owner.name,
          recipientRole: 'dueño',
          recipientContact: owner.phone || owner.email,
          recipientPhone: owner.phone,
          recipientEmail: owner.email,
          boletasCount: 1,
          totalAmount: item.balanceDue,
          messageSnippet: `🚨 ALERTA DUEÑOS (10 DÍAS): Boleta #${item.boleta.boletaNumber} de ${item.boleta.clientName} lleva ${item.daysElapsed} días sin pagarse.`,
          fullMessage: ownerMsg,
          whatsappUrl: createWhatsAppUrl(owner.phone, ownerMsg),
          ruleMilestone: '10d',
          status: 'sent',
          deliveryStatus: ownerRes.deliveryStatus,
          gatewayResponse: ownerRes.info,
        });
      }
    }
  }

  // 5. HITO: 15+ DÍAS -> MORA CRÍTICA MÁXIMA
  const itemsAt15Days = evaluated.filter((e) => e.daysElapsed >= 15);
  for (const item of itemsAt15Days) {
    if (item.seller && item.seller.phone) {
      const sellerMsg = `🚨 *MORA CRÍTICA (15+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨\n🏢 *${distributorName}*\n\nHola ${item.seller.name}, soy *${generalAdmin.name}*.\n*ATENCIÓN URGENTE: La boleta #${item.boleta.boletaNumber} lleva ${item.daysElapsed} días emitida y SIGUE SIN ESTAR PAGA*.\n*Necesito que hoy vayas a cobrarle de forma obligatoria e inmediata a ${item.boleta.clientName}*:\n\n📍 *Dirección:* ${item.boleta.clientAddress || 'Ver ficha'}\n📅 *Venta:* ${item.boleta.saleDate} (${item.daysElapsed} días transcurridos)\n⏰ *Vencimiento original:* ${item.boleta.dueDate}\n💰 *Saldo a cobrar:* $ ${item.balanceDue.toLocaleString('es-AR')}\n\n⚠️ Esta cuenta está en estado de máxima mora y fue elevada a la gerencia / dueños. Por favor concurrí hoy al comercio y rendí el cobro en administración.`;

      const result = await sendDirectWhatsAppFromClient(item.seller.phone, sellerMsg, config);

      logs.push({
        id: `auto-${Date.now()}-15d-ven-${item.boleta.id}`,
        timestamp: nowIso,
        channel: channels,
        recipientName: item.seller.name,
        recipientRole: 'vendedor',
        recipientContact: item.seller.phone,
        recipientPhone: item.seller.phone,
        recipientEmail: item.seller.email,
        boletasCount: 1,
        totalAmount: item.balanceDue,
        messageSnippet: `🚨 ALERTA CRÍTICA (15+ DÍAS): Boleta #${item.boleta.boletaNumber} de ${item.boleta.clientName} SIGUE SIN ESTAR PAGA (${item.daysElapsed} días).`,
        fullMessage: sellerMsg,
        whatsappUrl: createWhatsAppUrl(item.seller.phone, sellerMsg),
        ruleMilestone: '15d',
        status: 'sent',
        deliveryStatus: result.deliveryStatus,
        gatewayResponse: result.info,
      });
    }

    for (const owner of targetOwners) {
      if (owner.phone) {
        const ownerMsg = `🚨 *ALERTA CRÍTICA DUEÑOS (15+ DÍAS): BOLETA SIGUE SIN ESTAR PAGA* 🚨\n🏢 *${distributorName}*\n\nHola ${owner.name}, alerta de mora máxima:\nLa boleta #${item.boleta.boletaNumber} del vendedor *${item.boleta.salespersonName}* para el cliente *${item.boleta.clientName}* lleva *${item.daysElapsed} días emitida y SIGUE SIN ESTAR PAGA*.\n\n🧑‍💼 *Vendedor a cargo:* ${item.boleta.salespersonName}\n👤 *Cliente:* ${item.boleta.clientName}\n📅 *Emisión:* ${item.boleta.saleDate} (${item.daysElapsed} días sin cancelar)\n💰 *Saldo adeudado:* $ ${item.balanceDue.toLocaleString('es-AR')}\n\n⚠️ Esta boleta superó los 15 días y está en rojo prioritario en el sistema central. Se notificó al vendedor para exigir el cobro urgente hoy.`;

        const ownerRes = await sendDirectWhatsAppFromClient(owner.phone, ownerMsg, config);

        logs.push({
          id: `auto-${Date.now()}-15d-own-${owner.id}-${item.boleta.id}`,
          timestamp: nowIso,
          channel: channels,
          recipientName: owner.name,
          recipientRole: 'dueño',
          recipientContact: owner.phone || owner.email,
          recipientPhone: owner.phone,
          recipientEmail: owner.email,
          boletasCount: 1,
          totalAmount: item.balanceDue,
          messageSnippet: `🚨 MORA CRÍTICA DUEÑO (15+ DÍAS): Boleta #${item.boleta.boletaNumber} de ${item.boleta.clientName} tiene ${item.daysElapsed} días impaga.`,
          fullMessage: ownerMsg,
          whatsappUrl: createWhatsAppUrl(owner.phone, ownerMsg),
          ruleMilestone: '15d',
          status: 'sent',
          deliveryStatus: ownerRes.deliveryStatus,
          gatewayResponse: ownerRes.info,
        });
      }
    }
  }

  return { logs, count: logs.length };
}

export async function executeDailyClosingDirect(params: {
  boletas: Boleta[];
  paidBoletas: Boleta[];
  admins: Administrator[];
  config: DistributorConfig;
  targetDateStr?: string;
}): Promise<{ logs: AutoDispatchLog[]; summaryText: string }> {
  const {
    boletas = [],
    paidBoletas = [],
    admins = [],
    config,
    targetDateStr = new Date().toISOString().split('T')[0],
  } = params;

  const nowIso = new Date().toISOString();
  const distributorName = config.distributorName || 'Mi Empresa';
  const sym = config.currencySymbol || '$';
  const fmtMoney = (n: number) => `${sym} ${Number(n || 0).toLocaleString('es-AR')}`;
  const fmtDate = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  };
  const methodTag = (m: string) =>
    m === 'efectivo'
      ? 'Efectivo'
      : m === 'transferencia'
      ? 'Transferencia'
      : m === 'cheque'
      ? 'Cheque'
      : 'Otro';

  const collectedItems: Array<{
    boletaNumber: string;
    clientName: string;
    amount: number;
    paymentMethod: string;
    kind: string;
  }> = [];

  for (const b of boletas) {
    if (b.status !== 'pending') continue;
    for (const p of b.partialPayments || []) {
      if (p.date === targetDateStr && Number(p.amount || 0) > 0) {
        collectedItems.push({
          boletaNumber: b.boletaNumber,
          clientName: b.clientName,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod || 'efectivo',
          kind: 'Entrega a cuenta',
        });
      }
    }
  }

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
        });
      }
    }
    if (b.paidAt === targetDateStr) {
      const remainder = Math.max(0, Number(b.amount || 0) - totalAllPartials);
      if (remainder > 0) {
        collectedItems.push({
          boletaNumber: b.boletaNumber,
          clientName: b.clientName,
          amount: remainder,
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

  const unpaidItems = boletas
    .filter((b) => b.status === 'pending')
    .map((b) => {
      const partial = (b.partialPayments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
      const balanceDue = Math.max(0, Number(b.amount || 0) - partial);
      const isOverdue = Boolean(b.dueDate && b.dueDate <= targetDateStr);
      return {
        boletaNumber: b.boletaNumber,
        clientName: b.clientName,
        salespersonName: b.salespersonName,
        balanceDue,
        isOverdue,
      };
    });

  const overdueUnpaid = unpaidItems.filter((u) => u.isOverdue);
  const totalUnpaidDebt = unpaidItems.reduce((acc, u) => acc + u.balanceDue, 0);
  const totalOverdueDebt = overdueUnpaid.reduce((acc, u) => acc + u.balanceDue, 0);

  const generalAdmin =
    admins.find((a) => a.isGeneralAdmin || a.role === 'dueño') ||
    admins[0] || {
      id: 'adm-1',
      name: 'Administración',
      phone: config.senderPhone || config.distributorPhone || '',
      email: config.senderEmail || config.distributorEmail || '',
    };

  const ownerRecipients = admins.filter((a) => a.role === 'dueño' || a.receiveAdminAlerts);
  const targetOwners = ownerRecipients.length > 0 ? ownerRecipients : [generalAdmin];

  const paidSectionLines =
    collectedItems.length > 0
      ? collectedItems
          .slice(0, 20)
          .map(
            (c, idx) =>
              `  ${idx + 1}. *${c.clientName}* (Boleta #${c.boletaNumber}) — ${c.kind} [${methodTag(c.paymentMethod)}]: *${fmtMoney(c.amount)}*`
          )
          .join('\n')
      : '  _No se registraron cobros durante el día de hoy._';

  const unpaidLines =
    overdueUnpaid.length > 0
      ? `🔴 *Vencidas sin pagar (${overdueUnpaid.length} — ${fmtMoney(totalOverdueDebt)}):*\n` +
        overdueUnpaid
          .slice(0, 12)
          .map(
            (u, idx) =>
              `  ${idx + 1}. ${u.clientName} (#${u.boletaNumber} · Vend: ${u.salespersonName}): ${fmtMoney(u.balanceDue)}`
          )
          .join('\n') +
        (unpaidItems.length > overdueUnpaid.length
          ? `\n🟢 *Vigentes en plazo:* ${unpaidItems.length - overdueUnpaid.length} boleta(s) pendientes.`
          : '')
      : unpaidItems.length > 0
      ? `  _Sin boletas vencidas. Quedan ${unpaidItems.length} boleta(s) vigentes dentro del plazo._`
      : '  _¡Excelente! No quedan boletas impagas al cierre del día._';

  const otrosLine = totalOtros > 0 ? `\n🧾 *Cheque / Otros:* ${fmtMoney(totalOtros)}` : '';

  const logs: AutoDispatchLog[] = [];
  let lastText = '';

  for (const owner of targetOwners) {
    if (!owner.phone) continue;
    const message = `🌙 *RESUMEN DE CIERRE DEL DÍA* 🌙
🏢 *${distributorName}*
📅 Fecha: *${fmtDate(targetDateStr)}*

Hola ${owner.name}, este es el balance automático del cierre de hoy:

✅ *BOLETAS COBRADAS HOY (${collectedItems.length} ingreso${collectedItems.length === 1 ? '' : 's'}):*
${paidSectionLines}

⏳ *BOLETAS IMPAGAS / PENDIENTES AL CIERRE (${unpaidItems.length} total • Saldo: ${fmtMoney(totalUnpaidDebt)}):*
${unpaidLines}

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL INGRESADO HOY (CAJA Y BANCOS):*
💵 *Efectivo:* ${fmtMoney(totalEfectivo)}
🏦 *Transferencia / MP:* ${fmtMoney(totalTransferencia)}${otrosLine}
━━━━━━━━━━━━━━━━━━━━
✅ *MONTO FINAL TOTAL COBRADO:* *${fmtMoney(totalGeneralCobrado)}*`;

    lastText = message;
    const result = await sendDirectWhatsAppFromClient(owner.phone, message, config);

    logs.push({
      id: `auto-${Date.now()}-closing-${owner.id || 'owner'}`,
      timestamp: nowIso,
      channel: 'whatsapp',
      recipientName: owner.name,
      recipientRole: 'dueño',
      recipientContact: `${owner.phone}${owner.email ? ` / ${owner.email}` : ''}`,
      recipientPhone: owner.phone,
      recipientEmail: owner.email,
      boletasCount: collectedItems.length,
      totalAmount: totalGeneralCobrado,
      messageSnippet: `🌙 CIERRE DEL DÍA (${fmtDate(targetDateStr)}): ${collectedItems.length} cobro(s) por ${fmtMoney(totalGeneralCobrado)} (Efectivo: ${fmtMoney(totalEfectivo)} • Transf: ${fmtMoney(totalTransferencia)}) | ${unpaidItems.length} impagas.`,
      fullMessage: message,
      whatsappUrl: createWhatsAppUrl(owner.phone, message),
      ruleMilestone: 'daily_closing',
      status: 'sent',
      deliveryStatus: result.deliveryStatus,
      gatewayResponse: result.info,
    });
  }

  return { logs, summaryText: lastText };
}

export async function executeBlockedChargeAlertDirect(params: {
  client: Client;
  existingBoleta: Boleta;
  config: DistributorConfig;
  admins: Administrator[];
}): Promise<AutoDispatchLog[]> {
  const { client, existingBoleta, config, admins = [] } = params;
  const nowIso = new Date().toISOString();
  const channels = config.autoDispatchChannels || 'both';
  const distributorName = config.distributorName || 'Mi Empresa';

  const ownerRecipients = admins.filter((a) => a.role === 'dueño' || a.receiveAdminAlerts);
  const targetOwners =
    ownerRecipients.length > 0
      ? ownerRecipients
      : [
          {
            id: 'adm-1',
            name: 'Administración',
            phone: config.senderPhone || config.distributorPhone || '',
            email: config.senderEmail || config.distributorEmail || '',
          },
        ];

  const totalPartial = (existingBoleta?.partialPayments || []).reduce(
    (acc, p) => acc + (p.amount || 0),
    0
  );
  const balanceDue = Math.max(0, (existingBoleta?.amount || 0) - totalPartial);
  const daysElapsed = Math.max(
    0,
    Math.floor(
      (new Date().getTime() - new Date(existingBoleta.saleDate).getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );

  const logs: AutoDispatchLog[] = [];
  for (const owner of targetOwners) {
    const fullMessage = `🚫 *ALERTA A DUEÑOS: CARGA DE BOLETA ANULADA POR DEUDA PREVIA* 🚫\n🏢 *${distributorName}*\n\nHola ${owner.name}, te informamos de una acción bloqueada por el sistema:\nSe intentó cargar una nueva boleta fiada al cliente *${client.name}*, pero *FUE ANULADA AUTOMÁTICAMENTE* porque el cliente ya adeuda la boleta #${existingBoleta.boletaNumber}.\n\n📄 *Datos de la Boleta ya cargada:*\n• *Boleta N°:* #${existingBoleta.boletaNumber} (Firmada / Fiada)\n• *Cliente:* ${client.name} (${client.address || 'Sin dir'})\n• *Vendedor responsable:* ${existingBoleta.salespersonName}\n• *Fecha de venta:* ${existingBoleta.saleDate} (${daysElapsed} días sin cancelar)\n• *Plazo pactado:* ${existingBoleta.termDays} días (Vencimiento: ${existingBoleta.dueDate})\n• *Saldo adeudado:* $ ${Number(balanceDue).toLocaleString('es-AR')}\n\n⚠️ Por política de la distribuidora, no se permite acumular más de una boleta fiada por cliente. Se notificó al vendedor para efectivizar el cobro previo.`;

    const result = await sendDirectWhatsAppFromClient(owner.phone, fullMessage, config);

    logs.push({
      id: `auto-${Date.now()}-blocked-${owner.id}`,
      timestamp: nowIso,
      channel: channels,
      recipientName: owner.name,
      recipientRole: 'dueño',
      recipientContact: `${owner.phone} • ${owner.email}`,
      recipientPhone: owner.phone,
      recipientEmail: owner.email,
      boletasCount: 1,
      totalAmount: balanceDue,
      messageSnippet: `🚫 ALERTA DUEÑOS: Se anuló el intento de cargar boleta para "${client.name}" porque ya adeuda la boleta #${existingBoleta.boletaNumber} ($ ${Number(balanceDue).toLocaleString('es-AR')}).`,
      fullMessage,
      whatsappUrl: createWhatsAppUrl(owner.phone, fullMessage),
      ruleMilestone: 'blocked_charge',
      status: 'sent',
      deliveryStatus: result.deliveryStatus,
      gatewayResponse: result.info,
    });
  }

  return logs;
}
