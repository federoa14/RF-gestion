import { BusinessRubro } from '../types';

export interface CatalogRubroPreset {
  id: BusinessRubro;
  label: string;
  shortLabel: string;
  description: string;
  defaultFilters: string[];
  suggestedSubfilters: string[];
  defaultUnitLabel: string;
  productPlaceholder: string;
}

export const CATALOG_RUBRO_PRESETS: Record<BusinessRubro, CatalogRubroPreset> = {
  indumentaria: {
    id: 'indumentaria',
    label: 'Local de Ropa / Indumentaria / Calzado',
    shortLabel: 'Indumentaria',
    description:
      'Catálogo exclusivo para prendas, calzado y accesorios. Carga guiada por segmentos (Niños, Hombres, Mujeres) y subfiltros por tipo de prenda o temporada.',
    defaultFilters: ['Niños', 'Hombres', 'Mujeres'],
    suggestedSubfilters: [
      'Remeras',
      'Pantalones y Jeans',
      'Buzos y Camperas',
      'Vestidos',
      'Calzado',
      'Ropa Interior',
      'Accesorios',
      'Ofertas',
    ],
    defaultUnitLabel: 'Prenda',
    productPlaceholder: 'Ej. Jean Mom Talle 38 / Remera Oversize',
  },
  distribuidora: {
    id: 'distribuidora',
    label: 'Mayorista / Distribuidora',
    shortLabel: 'Mayorista / Distribuidora',
    description:
      'Catálogo orientado a pedidos por bulto, pack o unidad para comercios y clientes mayoristas.',
    defaultFilters: ['Bebidas', 'Almacén', 'Lácteos y Frescos', 'Limpieza', 'Golosinas y Snacks'],
    suggestedSubfilters: [
      'Por Bulto / Caja',
      'Pack Oferta',
      'Sin Alcohol',
      'Cervezas y Vinos',
      'Primeras Marcas',
    ],
    defaultUnitLabel: 'Bulto / Pack',
    productPlaceholder: 'Ej. Pack Gaseosa 2.25L x 6 unidades',
  },
  ecommerce_kiosco: {
    id: 'ecommerce_kiosco',
    label: 'E-Commerce / Kiosco / Despensa',
    shortLabel: 'E-Commerce / Kiosco',
    description:
      'Catálogo minorista ágil para kioscos, despensas y tiendas online con combos y entregas rápidas.',
    defaultFilters: ['Bebidas', 'Golosinas y Snacks', 'Almacén', 'Combos y Ofertas', 'Varios'],
    suggestedSubfilters: [
      'Bebidas Frías',
      'Promos del Día',
      'Sin TACC',
      'Importados',
      'Regalería',
    ],
    defaultUnitLabel: 'Unidad',
    productPlaceholder: 'Ej. Combo Merienda / Chocolate 100g',
  },
  comercio_fiado: {
    id: 'comercio_fiado',
    label: 'Comercio / Almacén / Barrio',
    shortLabel: 'Comercio / Almacén',
    description:
      'Catálogo práctico para almacenes y comercios de cercanía con retiro en mostrador o envío local.',
    defaultFilters: ['Almacén', 'Frescos y Panadería', 'Bebidas', 'Limpieza', 'Mascotas y Varios'],
    suggestedSubfilters: [
      'Ofertas de la Semana',
      'Por Kilo',
      'Suelto / Fraccionado',
      'Económico',
    ],
    defaultUnitLabel: 'Unidad',
    productPlaceholder: 'Ej. Yerba Mate 1kg / Pan Casero',
  },
  cuenta_corriente: {
    id: 'cuenta_corriente',
    label: 'Corralón / Ferretería / Taller',
    shortLabel: 'Ferretería / Corralón',
    description:
      'Catálogo técnico para materiales, herramientas, electricidad, pinturería y repuestos.',
    defaultFilters: ['Materiales', 'Herramientas', 'Pinturería', 'Electricidad', 'Repuestos'],
    suggestedSubfilters: [
      'Uso Profesional',
      'Hogar',
      'Por Metro / Fraccionado',
      'Repuestos Originales',
    ],
    defaultUnitLabel: 'Unidad',
    productPlaceholder: 'Ej. Amoladora Angular / Pintura Látex 20L',
  },
};

export function getCatalogRubroPreset(rubro?: BusinessRubro): CatalogRubroPreset {
  if (rubro && CATALOG_RUBRO_PRESETS[rubro]) {
    return CATALOG_RUBRO_PRESETS[rubro];
  }
  return CATALOG_RUBRO_PRESETS.distribuidora;
}

export function normalizeFilterList(list?: string[]): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    const clean = String(raw || '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}
