import { SubscriptionPlanTier } from '../types';

export const TERMS_VERSION = '2026.2';
export const TERMS_LAST_UPDATED = '2026';

export interface TermsClauseSection {
  id: string;
  number: string;
  title: string;
  paragraphs: string[];
}

export const PLATFORM_TERMS_SECTIONS: TermsClauseSection[] = [
  {
    id: 'aceptacion',
    number: '1',
    title: 'Objeto y Aceptación',
    paragraphs: [
      'Estos Términos y Condiciones regulan el uso del sistema de gestión de cobranzas, boletas, clientes y tienda online (en adelante, la "Plataforma") por parte del titular o empresa que contrata el servicio (en adelante, el "Comercio"), frente a quien presta el servicio (en adelante, el "Prestador").',
      'El Comercio declara que actúa con fines comerciales, que es mayor de edad y que tiene facultades para obligar a la empresa que representa. Al tildar la casilla de aceptación, crear una cuenta o seguir usando la Plataforma, acepta estos Términos de forma expresa y electrónica. Sin esa aceptación no se puede usar la Plataforma.',
    ],
  },
  {
    id: 'uso-manejo',
    number: '2',
    title: 'Uso Permitido y Responsabilidad del Comercio',
    paragraphs: [
      'El Comercio es el único responsable de la información que carga (clientes, boletas, saldos, precios, stock, fotos, textos y condiciones de venta) y de que sea veraz, actual y lícita. Es también el único responsable de sus relaciones con sus propios clientes y compradores: ventas, cobros, entregas, cambios, devoluciones, garantías, facturación e impuestos.',
      'Queda prohibido usar la Plataforma para actividades ilícitas, publicar contenido que infrinja derechos de terceros, vender productos prohibidos, enviar mensajes no solicitados (spam), intentar acceder a datos de otros comercios, alterar el funcionamiento del sistema o copiarlo, revenderlo o descompilarlo. El Prestador puede suspender o cerrar cuentas que incumplan esta cláusula.',
    ],
  },
  {
    id: 'credenciales-datos',
    number: '3',
    title: 'Credenciales y Seguridad de la Cuenta',
    paragraphs: [
      'El acceso se protege con usuario, código de empresa y contraseña. El Comercio debe resguardar sus claves y las de sus administradores y vendedores. Toda actividad realizada con esas credenciales se considera realizada por el Comercio.',
      'El Comercio debe avisar de inmediato al Prestador ante cualquier uso no autorizado. El Prestador aplica medidas de seguridad razonables, pero ningún sistema es infalible y no garantiza la ausencia total de accesos indebidos ajenos a su control.',
    ],
  },
  {
    id: 'datos-personales',
    number: '4',
    title: 'Datos Personales y Privacidad',
    paragraphs: [
      'Los datos que el Comercio carga sobre sus clientes, vendedores y compradores (nombre, DNI, teléfono, domicilio, historial de compras y deudas) son de titularidad y responsabilidad del Comercio, que actúa como responsable del tratamiento conforme a la Ley 25.326 de Protección de Datos Personales. El Prestador los trata solo como proveedor de servicio, para operar la Plataforma.',
      'El Comercio se obliga a contar con el consentimiento o la base legal necesaria para cargar y usar esos datos, a informar a sus clientes sobre su tratamiento y a atender los pedidos de acceso, rectificación y supresión que reciba. El Prestador no vende ni cede esos datos a terceros, salvo por orden de autoridad competente o para prestar el servicio mediante los proveedores indicados en la cláusula 6.',
    ],
  },
  {
    id: 'cobros-tienda',
    number: '5',
    title: 'Cobros, Medios de Pago y Relación con Compradores',
    paragraphs: [
      'Los cobros a compradores finales (efectivo, transferencia por Alias/CVU o Mercado Pago propio del Comercio) se acreditan en las cuentas configuradas por el Comercio. La Plataforma es solo software de gestión y catálogo digital: el Prestador no es parte de las ventas, no interviene ni retiene fondos de esas operaciones y no responde por reclamos, contracargos, fraudes, entregas o calidad de los productos del Comercio.',
      'Los intereses, recargos y planes de cuotas que el Comercio aplique a sus clientes son decididos por el Comercio. Las tasas de referencia que la Plataforma sugiere (por ejemplo, la del Banco Nación) son solo orientativas, pueden estar desactualizadas y no constituyen asesoramiento financiero ni legal; el Comercio debe verificarlas y cumplir la normativa que le resulte aplicable.',
    ],
  },
  {
    id: 'terceros',
    number: '6',
    title: 'Servicios de Terceros',
    paragraphs: [
      'La Plataforma funciona con servicios de terceros (por ejemplo, Supabase, Vercel, Meta/WhatsApp, Mercado Pago, servicios de correo y de inteligencia artificial). Su disponibilidad, costos, políticas y cambios no dependen del Prestador, que no responde por interrupciones, bloqueos de cuentas o modificaciones realizadas por esos proveedores.',
      'El Comercio es responsable de cumplir las condiciones de esos terceros (por ejemplo, las políticas de mensajería de WhatsApp) y de los costos que ellos le cobren directamente. Los mensajes automáticos enviados a clientes son responsabilidad del Comercio.',
    ],
  },
  {
    id: 'prueba-pausa',
    number: '7',
    title: 'Prueba Gratuita, Abono y Pausa',
    paragraphs: [
      'Las cuentas autogestionadas gozan de 30 (treinta) días corridos de prueba gratuita desde el alta. Finalizado ese plazo, el Comercio debe elegir uno de los planes vigentes y abonar el arancel mensual o anual para continuar.',
      'El abono mensual se paga dentro de los primeros días de cada mes, según lo informado en la Plataforma. El pago anual, cuando se ofrezca, puede incluir el descuento vigente al momento de pagarlo. Ante falta de pago, la cuenta pasará a estado pausado, conservando sus registros por el plazo indicado en la cláusula 10. Los aranceles pueden modificarse con aviso previo dentro de la Plataforma; el cambio rige desde el siguiente período.',
      'Salvo disposición legal en contrario, los pagos realizados no son reembolsables por períodos ya iniciados.',
    ],
  },
  {
    id: 'planes-cambios',
    number: '8',
    title: 'Planes y Cambios entre Planes',
    paragraphs: [
      'El servicio cuenta con tres planes: Plan 1 · Básico (gestión interna sin página web), Plan 2 · Página Web Básica (gestión + catálogo web con pagos en tienda y stock, hasta 5 rubros y 100 prendas/objetos) y Plan 3 · Full (rubros y artículos ilimitados, promociones, fidelización por DNI, Gift Cards, automatizaciones y diseño personalizado de la tienda y del panel).',
      'Subas de plan: habilitan de inmediato las funciones del nuevo plan y actualizan el abono al valor de ese plan. Bajas de plan: el Comercio puede volver a un plan inferior; sus datos no se borran, pero se desactivan de inmediato las herramientas exclusivas del plan anterior y rigen los topes del plan elegido.',
    ],
  },
  {
    id: 'disponibilidad',
    number: '9',
    title: 'Disponibilidad y Limitación de Responsabilidad',
    paragraphs: [
      'La Plataforma se ofrece "tal como está". El Prestador procura que funcione de manera continua, pero no garantiza que esté libre de errores, interrupciones o pérdidas de información, ni que los resultados (cálculos, alertas, recordatorios, envíos automáticos, sugerencias de intereses) sean exactos o oportunos. El Comercio debe verificar los datos importantes y conservar sus propios respaldos.',
      'En la máxima medida permitida por la ley, el Prestador no responde por lucro cesante, pérdida de clientes, ventas, datos o ganancias, ni por daños indirectos o consecuentes derivados del uso o de la imposibilidad de uso de la Plataforma. Si se determinara alguna responsabilidad, quedará limitada al monto efectivamente abonado por el Comercio en los tres (3) meses anteriores al hecho que originó el reclamo.',
      'El Prestador no responde por casos fortuitos o de fuerza mayor, fallas de Internet o de energía, ataques informáticos ajenos a su control, ni por actos u omisiones del Comercio o de terceros.',
    ],
  },
  {
    id: 'datos-conservacion',
    number: '10',
    title: 'Conservación, Retención y Baja',
    paragraphs: [
      'Los datos históricos del Comercio se conservan mientras la cuenta esté activa o pausada, y no se eliminan por pausas ni por cambios de plan. Algunas funciones eliminan automáticamente boletas cobradas luego del plazo de retención configurado en la Plataforma; el Comercio es responsable de exportar o resguardar lo que necesite conservar.',
      'El Comercio puede dejar de usar el servicio en cualquier momento. El Prestador puede suspender o dar de baja la cuenta por incumplimiento de estos Términos, por falta de pago prolongada o por requerimiento de autoridad. Tras una baja, el Prestador podrá eliminar los datos transcurrido un plazo razonable, que no será inferior a 30 días salvo orden legal.',
    ],
  },
  {
    id: 'propiedad-intelectual',
    number: '11',
    title: 'Propiedad Intelectual y Contenido del Comercio',
    paragraphs: [
      'La Plataforma, su código, diseño y marcas pertenecen al Prestador. El contrato solo otorga al Comercio una licencia limitada, revocable, no exclusiva e intransferible de uso mientras esté vigente.',
      'El Comercio conserva la titularidad de sus logos, fotos y contenidos, y declara tener derecho a usarlos. Otorga al Prestador la autorización necesaria para almacenarlos y mostrarlos en su tienda y panel. El Comercio mantendrá indemne al Prestador ante reclamos de terceros por ese contenido o por el uso indebido de la Plataforma.',
    ],
  },
  {
    id: 'cambios-terminos',
    number: '12',
    title: 'Cambios en estos Términos',
    paragraphs: [
      'El Prestador puede actualizar estos Términos. Las nuevas versiones se informarán dentro de la Plataforma y podrá exigirse su aceptación para seguir usándola. Continuar usando la Plataforma luego del aviso implica aceptar la versión vigente.',
    ],
  },
  {
    id: 'ley-jurisdiccion',
    number: '13',
    title: 'Ley Aplicable y Jurisdicción',
    paragraphs: [
      'Estos Términos se rigen por las leyes de la República Argentina. Las partes procurarán resolver cualquier diferencia de manera amistosa; de no lograrlo, se someten a los tribunales ordinarios competentes de la jurisdicción del domicilio del Prestador, con renuncia a cualquier otro fuero.',
      'Si alguna cláusula fuera declarada inválida, las demás conservarán su validez.',
    ],
  },
  {
    id: 'registro-aceptacion',
    number: '14',
    title: 'Constancia de Aceptación',
    paragraphs: [
      'Cada aceptación de estos Términos (en el registro, al cambiar de plan o al actualizarse la versión) queda registrada con fecha, hora y versión en el historial de la cuenta y en el panel de SuperGestión, y sirve como constancia de conformidad del Comercio.',
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
  if (tier === 'basico') return 'Plan 1 · Básico (Sin Web)';
  if (tier === 'web') return 'Plan 2 · Página Web Básica';
  return 'Plan 3 · Full';
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
          ? 'Habilita catálogo online básico con pagos en tienda y stock (tope de 5 rubros y 100 artículos).'
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
      bullets.push('Se habilita tu Página Web Básica con pagos en tienda y stock (hasta 5 rubros y 100 prendas).');
    } else if (toTier === 'full') {
      bullets.push('Se eliminan los topes de 5 rubros / 100 prendas y se desbloquean ofertas, seguimiento web, SuperClub, puntos por DNI, Gift Cards y automatización.');
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
      'Al pasar a Plan 1 (Sin Web) se desactiva inmediatamente tu catálogo online público, carrito web y módulos promocionales.'
    );
    bullets.push(
      'Tu panel queda enfocado al 100% en gestión interna de cobranzas, boletas, rutas y cartera de clientes.'
    );
  } else if (toTier === 'web') {
    bullets.push(
      'Al volver a Plan 2 (Web Básica) se desactivan burbujas de ofertas, Outlet, seguimiento de clientes web, SuperClub, puntos por DNI y descuentos.'
    );
    bullets.push(
      'Aplicarán los topes de hasta 5 rubros y 100 prendas/objetos para nuevas altas en catálogo (lo ya cargado permanece guardado).'
    );
  }

  return {
    direction: 'downgrade',
    badgeLabel: `Cambio a Plan Menor (${fromRank} → ${toRank})`,
    headline: `Volvés de ${getPlanSectionShortTitle(fromTier)} a ${getPlanSectionShortTitle(toTier)}`,
    bullets,
  };
}
