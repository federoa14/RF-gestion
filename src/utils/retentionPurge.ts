import { Boleta, Client, ClientCreditHistory, PurgedBoletaSummary } from '../types';

export const MAX_RETENTION_DAYS = 30;

/**
 * Calcula los días transcurridos desde una fecha (YYYY-MM-DD o ISO) hasta hoy.
 */
export function getDaysElapsed(dateStr?: string, referenceDate: Date = new Date()): number {
  if (!dateStr) return 0;
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    const diffMs = referenceDate.getTime() - d.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  } catch (e) {
    return 0;
  }
}

/**
 * Determina si una boleta superó los 30 días de retención en el sistema.
 * REGLA ESTRICTA SOLICITADA POR EL USUARIO:
 * - Las boletas impagas NO se eliminan NUNCA (por más que tengan 45 o 60 días de atraso).
 * - El tiempo de 30 días empieza a correr EXCLUSIVAMENTE a partir del momento en que se marcan como PAGADAS.
 */
export function isBoletaRetentionExpired(boleta: Boleta, maxDays: number = MAX_RETENTION_DAYS): boolean {
  // Las boletas impagas nunca expiran
  if (boleta.status !== 'paid') {
    return false;
  }

  // Desde el momento que se tildan como pagadas corre el plazo de 30 días
  const elapsedSincePayment = getDaysElapsed(boleta.paidAt || boleta.createdAt);
  return elapsedSincePayment > maxDays;
}

/**
 * Inicializa o normaliza el perfil crediticio permanente de un cliente.
 */
export function ensureClientCreditHistory(client: Client): ClientCreditHistory {
  if (client.creditHistory) {
    return {
      reputationStatus: client.creditHistory.reputationStatus || 'confiable',
      totalHistoricalBoletas: client.creditHistory.totalHistoricalBoletas || 0,
      totalPaidOnTime: client.creditHistory.totalPaidOnTime || 0,
      totalLatePayments: client.creditHistory.totalLatePayments || 0,
      totalPurgedUnpaid: client.creditHistory.totalPurgedUnpaid || 0,
      totalPurgedDebtAmount: client.creditHistory.totalPurgedDebtAmount || 0,
      purgedBoletas: client.creditHistory.purgedBoletas || [],
      lastIncidentDate: client.creditHistory.lastIncidentDate,
      lastEvaluatedAt: client.creditHistory.lastEvaluatedAt || new Date().toISOString(),
      notes: client.creditHistory.notes,
    };
  }

  return {
    reputationStatus: 'confiable',
    totalHistoricalBoletas: 0,
    totalPaidOnTime: 0,
    totalLatePayments: 0,
    totalPurgedUnpaid: 0,
    totalPurgedDebtAmount: 0,
    purgedBoletas: [],
    lastEvaluatedAt: new Date().toISOString(),
  };
}

export interface PurgeResult {
  survivingBoletas: Boleta[];
  survivingPaidBoletas: Boleta[];
  updatedClients: Client[];
  purgedPendingCount: number;
  purgedPaidCount: number;
  totalPurged: number;
  purgedUnpaidAmountTotal: number;
  purgedDetails: Array<{
    boletaNumber: string;
    clientId: string;
    clientName: string;
    amount: number;
    balanceDue: number;
    status: 'pending' | 'paid';
    daysElapsed: number;
  }>;
}

/**
 * Purga de Boletas a los 30 días POST-PAGO:
 * REGLA ESTRICTA:
 * 1. Las boletas impagas (sin pagar) NO SE BORRAN NUNCA.
 *    Permanecen en el sistema aunque tengan 45, 60 o más días de mora, para que el dueño y vendedores
 *    puedan seguir reclamando el dinero.
 * 2. Desde el momento exacto en que una boleta se marca como pagada (paidAt), empieza a correr
 *    el plazo de 30 días hacia adelante.
 * 3. A los 30 días de haber sido cancelada, se depura físicamente del historial para no ocupar
 *    espacio en la base de datos (Supabase / local).
 * 4. El cliente conserva permanentemente su calificación de si es problemático o confiable.
 */
export function purgeExpiredBoletas(
  boletas: Boleta[],
  paidBoletas: Boleta[],
  clients: Client[],
  maxDays: number = MAX_RETENTION_DAYS
): PurgeResult {
  const todayStr = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  // Mapa de clientes para actualización in-memory
  const clientMap = new Map<string, Client>();
  clients.forEach((c) => {
    clientMap.set(c.id, {
      ...c,
      creditHistory: ensureClientCreditHistory(c),
    });
  });

  // 1. BOLETAS IMPAGAS: NO SE ELIMINAN NUNCA (0% purga de impagas)
  const survivingBoletas: Boleta[] = [...boletas];
  const survivingPaidBoletas: Boleta[] = [];
  const purgedDetails: PurgeResult['purgedDetails'] = [];

  let purgedPaidCount = 0;

  // 2. BOLETAS PAGADAS: Se depuran cuando pasan más de 30 días desde la fecha de PAGO (paidAt)
  for (const b of paidBoletas) {
    // El tiempo empieza a correr desde que se tildó como pagada
    const paymentDate = b.paidAt || b.createdAt;
    const elapsedSincePayment = getDaysElapsed(paymentDate);

    if (elapsedSincePayment > maxDays) {
      // Superó los 30 días POST-PAGO -> Depurar del historial para ahorrar espacio
      purgedPaidCount++;

      purgedDetails.push({
        boletaNumber: b.boletaNumber,
        clientId: b.clientId,
        clientName: b.clientName,
        amount: b.amount,
        balanceDue: 0,
        status: 'paid',
        daysElapsed: elapsedSincePayment,
      });

      const client = clientMap.get(b.clientId);
      if (client && client.creditHistory) {
        // Preservar en el cliente el registro de si pagó a tiempo o con mora severa
        const actualDaysToPay = b.paidAt
          ? getDaysElapsed(b.saleDate, new Date(`${b.paidAt}T12:00:00`))
          : b.termDays;

        if (actualDaysToPay > (b.termDays || 7) + 3) {
          client.creditHistory.totalLatePayments += 1;
        } else {
          client.creditHistory.totalPaidOnTime += 1;
        }
        client.creditHistory.lastEvaluatedAt = nowIso;
      }
    } else {
      // Menor o igual a 30 días de cobrada -> Permanece en el historial
      survivingPaidBoletas.push(b);
    }
  }

  // 3. Evaluar qué cliente es problemático y quién no en tiempo real:
  // - Si el cliente tiene una boleta impaga con más de 10 días de atraso (o 45-60 días): es DEFINITIVAMENTE PROBLEMÁTICO.
  // - Si acumula reiterados atrasos (>2 pagos tardíos): es REGULAR con demoras.
  // - Si está al día y siempre paga en término: es CONFIABLE.
  clientMap.forEach((c) => {
    const h = c.creditHistory!;

    // Verificar si tiene boleta activa con mora crítica
    const clientPendingBoleta = boletas.find(
      (b) => b.clientId === c.id && b.status === 'pending'
    );

    let hasCriticalPendingOverdue = false;
    if (clientPendingBoleta) {
      const daysElapsedSale = getDaysElapsed(clientPendingBoleta.saleDate);
      if (daysElapsedSale >= 10) {
        hasCriticalPendingOverdue = true;
      }
    }

    if (hasCriticalPendingOverdue || h.totalPurgedUnpaid > 0) {
      h.reputationStatus = 'problematico';
      h.lastIncidentDate = todayStr;
    } else if (h.totalLatePayments > 2) {
      h.reputationStatus = 'regular';
    } else {
      h.reputationStatus = 'confiable';
    }
  });

  return {
    survivingBoletas,
    survivingPaidBoletas,
    updatedClients: Array.from(clientMap.values()),
    purgedPendingCount: 0, // Las impagas nunca se borran
    purgedPaidCount,
    totalPurged: purgedPaidCount,
    purgedUnpaidAmountTotal: 0,
    purgedDetails,
  };
}
