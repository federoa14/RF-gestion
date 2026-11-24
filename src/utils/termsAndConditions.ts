import { SubscriptionPlanTier } from '../types';

export const TERMS_VERSION = '2026.1';
export const TERMS_LAST_UPDATED = '2026';

export interface TermsClauseSection {
  id: string;
  number: string;
  title: string;
  paragraphs: string[];
}

export const PLATFORM_TERMS_SECTIONS: TermsClauseSection[] = [
  {
    id: 'uso-manejo',
    number: '1',
    title: 'Uso y Manejo del Sistema',
    paragraphs: [
      'Al crear una cuenta o utilizar la plataforma, el titular o empresa cliente (en adelante, el "Comercio") asume la responsabilidad integral por la administración de sus usuarios, vendedores, boletas, clientes, inventario y catálogo web.',
      'El Comercio se compromete a operar la herramienta exclusivamente para actividades comerciales lícitas, manteniendo actualizada y veraz la información de precios, stock, saldos, devoluciones y condiciones de entrega publicadas hacia sus compradores.',
    ],
  },
  {
    id: 'credenciales-datos',
    number: '2',
    title: 'Credenciales, Resguardo e Integridad de Datos',
    paragraphs: [
      'El acceso al panel privado y a la tienda online se protege mediante usuario, código de empresa y contraseña. Es responsabilidad del Comercio resguardar la confidencialidad de sus claves de dueño, administradores y vendedores.',
      'Los datos comerciales históricos (clientes, boletas, historial de pagos, artículos y pedidos web) permanecen almacenados de forma segura y no se eliminan ante pausas temporales ni ante cambios de plan.',
    ],
  },
  {
    id: 'cobros-tienda',
    number: '3',
    title: 'Cobros en Tienda, Medios de Pago y Relación con Compradores',
    paragraphs: [
      'Los cobros realizados a compradores finales (efectivo, transferencia por Alias/CVU o Mercado Pago propio del Comercio) se acreditan de forma directa en las cuentas configuradas por el Comercio. La plataforma actúa únicamente como software de gestión comercial y catálogo digital, sin intermediar ni retener fondos de ventas de mercadería.',
      'Los cambios, devoluciones, garantías, señas o notas de crédito por DNI emitidos a compradores son gestionados y resueltos directamente bajo las políticas comerciales del Comercio.',
    ],
  },
  {
    id: 'prueba-pausa',
    number: '4',
    title: 'Período de Prueba Gratuita (30 Días) y Abono Mensual',
    paragraphs: [
      'Las cuentas autogestionadas gozan de 30 (treinta) días corridos de prueba gratuita sin cargo desde la fecha de alta. Finalizado ese plazo, el Comercio deberá seleccionar una de las tipologías de servicio vigentes (Sección 1, Sección 2 o Sección 3) y abonar el arancel mensual o anual correspondiente para continuar operando.',
      'En caso de no abonar al término de la prueba o del ciclo mensual, la cuenta pasará a estado pausado conservando intactos todos sus registros para una futura reactivación.',
    ],
  },
  {
    id: 'planes-cambios',
    number: '5',
    title: 'Tipologías de Planes y Cambios Bidireccionales (Sección 1 ↔ 2 ↔ 3)',
    paragraphs: [
      'El servicio cuenta con tres secciones: Sección 1 · Básico (solo gestión interna sin página web), Sección 2 · Página Web Básica (gestión + catálogo web con pagos en tienda y stock limitado hasta 5 rubros y 50 prendas/objetos, sin burbujas de ofertas, seguimiento de clientes, SuperClub ni descuentos) y Sección 3 · Plan Full (rubros/artículos ilimitados y acceso total a promociones, fidelización por DNI, Gift Cards QR y automatizaciones).',
      'Subas de Plan (1→2, 1→3, 2→3): habilitan inmediatamente las funciones, página web y capacidad del plan elegido, actualizando el abono mensual vigente al valor de la nueva sección.',
      'Bajas o Retornos de Plan (3→1, 3→2, 2→1): el Comercio puede volver a un plan inferior en cualquier momento. Sus datos cargados no se borran, pero se desactivan de inmediato las herramientas exclusivas del plan anterior: al pasar a Sección 1 se deshabilita el catálogo online público y los pedidos web; al pasar a Sección 2 se desactivan ofertas, SuperClub, puntos por DNI y seguimiento web, y rigen los topes de 5 rubros y 50 prendas para nuevas cargas.',
    ],
  },
  {
    id: 'registro-aceptacion',
    number: '6',
    title: 'Constancia de Aceptación y Auditoría',
    paragraphs: [
      'Cada aceptación de estos Términos y Condiciones durante el registro inicial o al efectuar un cambio de plan queda asentada con fecha, hora, versión vigente y transición de sección en el historial de la cuenta y en el panel de SuperGestión.',
    ],
  },
];

export interface PlanTransitionImpact {
  direction: 'upgrade' | 'downgrade' | 'same' | 'initial';
  badgeLabel: string;
  headline: string;
  bullets: string[];
}

const TIER_RANK: Record<SubscriptionPlanTier, number> = {
  basico: 1,
  web: 2,
  full: 3,
};

export function getPlanSectionShortTitle(tier: SubscriptionPlanTier): string {
  if (tier === 'basico') return 'Sección 1 · Básico (Sin Web)';
  if (tier === 'web') return 'Sección 2 · Página Web Básica';
  return 'Sección 3 · Plan Full';
}

export function getPlanTransitionImpactSummary(
  fromTier: SubscriptionPlanTier | undefined,
  toTier: SubscriptionPlanTier
): PlanTransitionImpact {
  if (!fromTier) {
    return {
      direction: 'initial',
      badgeLabel: 'Activación de Plan',
      headline: `Activás ${getPlanSectionShortTitle(toTier)}`,
      bullets: [
        'Todos tus clientes, boletas y datos cargados permanecen intactos.',
        toTier === 'basico'
          ? 'Opera exclusivamente con panel de gestión interna (sin catálogo web público).'
          : toTier === 'web'
          ? 'Habilita catálogo online básico con pagos en tienda y stock (tope de 5 rubros y 50 artículos).'
          : 'Habilita rubros/artículos ilimitados, SuperClub, puntos por DNI, ofertas y automatizaciones.',
      ],
    };
  }

  const fromRank = TIER_RANK[fromTier];
  const toRank = TIER_RANK[toTier];

  if (fromRank === toRank) {
    return {
      direction: 'same',
      badgeLabel: 'Plan Vigente',
      headline: `Ya estás operando en ${getPlanSectionShortTitle(toTier)}`,
      bullets: ['Conservás exactamente las mismas funciones y condiciones actuales.'],
    };
  }

  if (toRank > fromRank) {
    const bullets: string[] = [
      'Activación instantánea de las nuevas funciones al aceptar estos términos.',
      'Conservás el 100% de tus boletas, clientes, productos y configuraciones actuales.',
    ];
    if (toTier === 'web') {
      bullets.push('Se habilita tu Página Web Básica con pagos en tienda y stock (hasta 5 rubros y 50 prendas).');
    } else if (toTier === 'full') {
      bullets.push('Se eliminan los topes de 5 rubros / 50 prendas y se desbloquean ofertas, seguimiento web, SuperClub, puntos por DNI, Gift Cards y automatización.');
    }
    return {
      direction: 'upgrade',
      badgeLabel: `Suba de Plan (${fromRank} → ${toRank})`,
      headline: `Pasás de ${getPlanSectionShortTitle(fromTier)} a ${getPlanSectionShortTitle(toTier)}`,
      bullets,
    };
  }

  // Downgrade (3→1, 3→2, 2→1)
  const bullets: string[] = [
    'Tus clientes, boletas, historial de ventas y catálogo cargado NO se borran: quedan resguardados.',
  ];
  if (toTier === 'basico') {
    bullets.push(
      'Al pasar a Sección 1 (Sin Web) se desactiva inmediatamente tu catálogo online público, carrito web y módulos promocionales.'
    );
    bullets.push(
      'Tu panel queda enfocado al 100% en gestión interna de cobranzas, boletas, rutas y cartera de clientes.'
    );
  } else if (toTier === 'web') {
    bullets.push(
      'Al volver a Sección 2 (Web Básica) se desactivan burbujas de ofertas, Outlet, seguimiento de clientes web, SuperClub, puntos por DNI y descuentos.'
    );
    bullets.push(
      'Aplicarán los topes de hasta 5 rubros y 50 prendas/objetos para nuevas altas en catálogo (lo ya cargado permanece guardado).'
    );
  }

  return {
    direction: 'downgrade',
    badgeLabel: `Cambio a Plan Menor (${fromRank} → ${toRank})`,
    headline: `Volvés de ${getPlanSectionShortTitle(fromTier)} a ${getPlanSectionShortTitle(toTier)}`,
    bullets,
  };
}
