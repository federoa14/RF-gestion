import type { CatalogShippingDetails } from '../types';

export const AR_PROVINCES = [
  'Buenos Aires',
  'Ciudad Autónoma de Buenos Aires',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
];

export const EMPTY_SHIPPING: CatalogShippingDetails = {
  fullName: '',
  dni: '',
  phone: '',
  email: '',
  street: '',
  streetNumber: '',
  floorApt: '',
  city: '',
  province: '',
  postalCode: '',
  betweenStreets: '',
  notes: '',
};

/** Devuelve el primer problema de los datos de envío, o null si están completos. */
export function validateShippingDetails(d: CatalogShippingDetails): string | null {
  if (d.fullName.trim().length < 5 || !/\s/.test(d.fullName.trim())) {
    return 'Ingresá nombre y apellido completos de quien recibe el envío.';
  }
  const dni = d.dni.replace(/\D/g, '');
  if (dni.length < 7 || dni.length > 11) return 'Ingresá el DNI (o CUIL) de quien recibe, solo números.';
  if (d.phone.replace(/\D/g, '').length < 8) return 'Ingresá un teléfono / WhatsApp de contacto válido.';
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email.trim())) return 'El email no parece válido. Revisalo o dejalo vacío.';
  if (!d.street.trim()) return 'Ingresá la calle.';
  if (!d.streetNumber.trim()) return 'Ingresá la altura (número) de la calle. Si no tiene, poné S/N.';
  if (!d.city.trim()) return 'Ingresá la localidad o ciudad.';
  if (!d.province.trim()) return 'Elegí la provincia.';
  if (!/^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(d.postalCode.trim())) {
    return 'Ingresá el código postal (4 números, o el formato CPA como B1636ABC).';
  }
  return null;
}

/** Dirección en una línea (para las pantallas y mensajes que ya muestran "dirección"). */
export function formatShippingAddress(d: CatalogShippingDetails): string {
  const street = `${d.street.trim()} ${d.streetNumber.trim()}`.trim();
  const unit = d.floorApt?.trim() ? `, ${d.floorApt.trim()}` : '';
  return `${street}${unit}, ${d.city.trim()}, ${d.province.trim()} (CP ${d.postalCode.trim().toUpperCase()})`;
}

/** Bloque de texto con todos los datos, listo para copiar y pegar en el correo. */
export function formatShippingBlock(d: CatalogShippingDetails): string {
  const lines = [
    `Destinatario: ${d.fullName.trim()}`,
    `DNI: ${d.dni.replace(/\D/g, '')}`,
    `Teléfono: ${d.phone.trim()}`,
    d.email?.trim() ? `Email: ${d.email.trim()}` : '',
    `Domicilio: ${d.street.trim()} ${d.streetNumber.trim()}${d.floorApt?.trim() ? `, ${d.floorApt.trim()}` : ''}`,
    `Localidad: ${d.city.trim()}`,
    `Provincia: ${d.province.trim()}`,
    `Código postal: ${d.postalCode.trim().toUpperCase()}`,
    d.betweenStreets?.trim() ? `Entre calles: ${d.betweenStreets.trim()}` : '',
    d.notes?.trim() ? `Observaciones: ${d.notes.trim()}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
