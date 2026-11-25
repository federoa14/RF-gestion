import { getAlertThresholds } from './alertThresholds';
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

  // El navegador ya no envía mensajes por su cuenta: los envíos automáticos oficiales los hace el
  // servidor (WhatsApp Business Cloud API). Acá solo se deja el mensaje listo para abrir con wa.me.
  void config;
  return {
    success: true,
    deliveryStatus: 'queued',
    info: 'Mensaje listo para enviar a mano con el enlace de WhatsApp',
  };
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
