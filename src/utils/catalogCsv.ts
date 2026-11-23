import { BusinessRubro, CatalogProduct } from '../types';

export interface ParsedCatalogCsvRow {
  rowNumber: number;
  name: string;
  price: number;
  category: string;
  subfilters: string[];
  sku?: string;
  stockQuantity?: number;
  unitLabel: string;
  description: string;
  wholesaleMinQty?: number;
  wholesalePrice?: number;
  lowStockThreshold?: number;
  available: boolean;
}

export interface CatalogCsvParseResult {
  validRows: ParsedCatalogCsvRow[];
  errors: Array<{ rowNumber: number; reason: string; rawLine: string }>;
  detectedDelimiter: string;
}

const HEADER_ALIASES: Record<string, keyof ParsedCatalogCsvRow> = {
  nombre: 'name',
  producto: 'name',
  titulo: 'name',
  articulo: 'name',
  name: 'name',
  title: 'name',
  precio: 'price',
  precio_unitario: 'price',
  precio_lista: 'price',
  valor: 'price',
  price: 'price',
  categoria: 'category',
  filtro: 'category',
  rubro_filtro: 'category',
  category: 'category',
  subfiltros: 'subfilters',
  subfiltro: 'subfilters',
  etiquetas: 'subfilters',
  tags: 'subfilters',
  subfilters: 'subfilters',
  sku: 'sku',
  codigo: 'sku',
  cod: 'sku',
  stock: 'stockQuantity',
  cantidad: 'stockQuantity',
  stock_cantidad: 'stockQuantity',
  stockquantity: 'stockQuantity',
  unidad: 'unitLabel',
  presentacion: 'unitLabel',
  unit: 'unitLabel',
  unitlabel: 'unitLabel',
  descripcion: 'description',
  detalle: 'description',
  description: 'description',
  minimo_mayorista: 'wholesaleMinQty',
  mayorista_minimo: 'wholesaleMinQty',
  cant_mayorista: 'wholesaleMinQty',
  wholesaleminqty: 'wholesaleMinQty',
  precio_mayorista: 'wholesalePrice',
  mayorista_precio: 'wholesalePrice',
  wholesaleprice: 'wholesalePrice',
  stock_minimo: 'lowStockThreshold',
  alerta_stock: 'lowStockThreshold',
  lowstockthreshold: 'lowStockThreshold',
  disponible: 'available',
  activo: 'available',
  publicado: 'available',
  available: 'available',
};

function normalizeHeaderKey(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function parseLocalizedNumber(raw: string): number | null {
  const cleaned = String(raw || '')
    .replace(/[\s$ARSUsd€]/gi, '')
    .trim();
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized = cleaned;
  if (hasComma && hasDot) {
    // Whichever appears last is the decimal separator
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Check if comma looks like decimal (,50 / ,5) vs thousands (,000)
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasDot) {
    const parts = cleaned.split('.');
    // If "12.500" (3 digits after single dot and > 0), treat dot as thousands separator in es-AR
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length >= 1)) {
      normalized = cleaned.replace(/\./g, '');
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function detectDelimiter(firstLine: string): string {
  const candidates = ['\t', ';', ','];
  let best = ';';
  let bestCount = -1;
  for (const delim of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === delim && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  }
  return bestCount > 0 ? best : ',';
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCatalogSpreadsheetText(
  rawText: string,
  defaultCategory: string = 'General'
): CatalogCsvParseResult {
  const cleanText = String(rawText || '').replace(/^\uFEFF/, '');
  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { validRows: [], errors: [], detectedDelimiter: ';' };
  }

  const delimiter = detectDelimiter(lines[0]);
  const firstCells = splitDelimitedLine(lines[0], delimiter);
  const mappedHeaders = firstCells.map((cell) => HEADER_ALIASES[normalizeHeaderKey(cell)] || null);
  const hasHeaderRow = mappedHeaders.some((m) => m === 'name' || m === 'price');

  const dataLines = hasHeaderRow ? lines.slice(1) : lines;
  const startRowNumber = hasHeaderRow ? 2 : 1;

  // Fallback positional order if user pasted raw rows without header:
  // nombre | precio | categoria | subfiltros | sku | stock | unidad | descripcion
  const fallbackColumns: Array<keyof ParsedCatalogCsvRow> = [
    'name',
    'price',
    'category',
    'subfilters',
    'sku',
    'stockQuantity',
    'unitLabel',
    'description',
  ];

  const validRows: ParsedCatalogCsvRow[] = [];
  const errors: CatalogCsvParseResult['errors'] = [];

  dataLines.forEach((line, idx) => {
    const rowNumber = startRowNumber + idx;
    const cells = splitDelimitedLine(line, delimiter);
    const record: Partial<Record<keyof ParsedCatalogCsvRow, string>> = {};

    cells.forEach((val, colIdx) => {
      const key = hasHeaderRow ? mappedHeaders[colIdx] : fallbackColumns[colIdx] || null;
      if (key && val !== undefined) {
        record[key] = val;
      }
    });

    const name = String(record.name || '').trim();
    const parsedPrice = parseLocalizedNumber(record.price || '');

    if (!name) {
      errors.push({ rowNumber, reason: 'Falta el nombre del producto', rawLine: line });
      return;
    }
    if (parsedPrice === null || parsedPrice < 0) {
      errors.push({ rowNumber, reason: `Precio inválido ("${record.price || ''}")`, rawLine: line });
      return;
    }

    const rawStock = String(record.stockQuantity || '').trim();
    let stockQuantity: number | undefined = undefined;
    if (rawStock !== '' && !/^(libre|sin\s*l[ií]mite|ilimitado|-)$/i.test(rawStock)) {
      const parsedStock = parseLocalizedNumber(rawStock);
      if (parsedStock !== null) {
        stockQuantity = Math.max(0, Math.floor(parsedStock));
      }
    }

    const rawMinQty = parseLocalizedNumber(record.wholesaleMinQty || '');
    const rawWPrice = parseLocalizedNumber(record.wholesalePrice || '');
    const wholesaleMinQty =
      rawMinQty !== null && rawMinQty >= 2 ? Math.floor(rawMinQty) : undefined;
    const wholesalePrice =
      rawWPrice !== null && rawWPrice >= 0 ? Math.round(rawWPrice * 100) / 100 : undefined;

    const rawLowThreshold = parseLocalizedNumber(record.lowStockThreshold || '');
    const lowStockThreshold =
      rawLowThreshold !== null && rawLowThreshold > 0
        ? Math.floor(rawLowThreshold)
        : undefined;

    const subfilters = String(record.subfilters || '')
      .split(/[,|/]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const availRaw = String(record.available || '').trim().toLowerCase();
    const available = availRaw
      ? !['no', '0', 'false', 'inactivo', 'pausado', 'oculto'].includes(availRaw)
      : true;

    validRows.push({
      rowNumber,
      name,
      price: Math.round(parsedPrice * 100) / 100,
      category: String(record.category || '').trim() || defaultCategory,
      subfilters: Array.from(new Set(subfilters)),
      sku: String(record.sku || '').trim() || undefined,
      stockQuantity,
      unitLabel: String(record.unitLabel || '').trim() || 'Unidad',
      description: String(record.description || '').trim(),
      wholesaleMinQty,
      wholesalePrice,
      lowStockThreshold,
      available,
    });
  });

  return { validRows, errors, detectedDelimiter: delimiter };
}

export function buildCatalogCsvTemplate(
  defaultCategory: string,
  rubro: BusinessRubro
): string {
  const headers = [
    'nombre',
    'precio',
    'categoria',
    'subfiltros',
    'sku',
    'stock',
    'unidad',
    'descripcion',
    'minimo_mayorista',
    'precio_mayorista',
    'disponible',
  ];

  const sampleSub = rubro === 'indumentaria' ? 'Remeras|Algodón' : 'Oferta|Temporada';
  const sampleName =
    rubro === 'indumentaria'
      ? 'Remera Oversize Lisa'
      : 'Producto Ejemplo';

  const rows = [
    [
      sampleName,
      '14900',
      defaultCategory || 'General',
      sampleSub,
      'COD-001',
      '25',
      'Unidad',
      'Descripción breve del artículo',
      '3',
      '12900',
      'si',
    ],
  ];

  return [headers, ...rows]
    .map((row) =>
      row.map((val) => `"${String(val || '').replace(/"/g, '""')}"`).join(';')
    )
    .join('\n');
}

export function exportCatalogProductsToCsv(products: CatalogProduct[]): string {
  const headers = [
    'nombre',
    'precio',
    'categoria',
    'subfiltros',
    'sku',
    'stock',
    'unidad',
    'descripcion',
    'minimo_mayorista',
    'precio_mayorista',
    'stock_minimo',
    'disponible',
  ];

  const rows = products.map((p) => [
    p.name,
    String(p.price),
    p.category || 'General',
    (p.subfilters || []).join('|'),
    p.sku || '',
    typeof p.stockQuantity === 'number' ? String(p.stockQuantity) : '',
    p.unitLabel || 'Unidad',
    p.description || '',
    p.wholesaleMinQty ? String(p.wholesaleMinQty) : '',
    typeof p.wholesalePrice === 'number' ? String(p.wholesalePrice) : '',
    p.lowStockThreshold ? String(p.lowStockThreshold) : '',
    p.available !== false ? 'si' : 'no',
  ]);

  return [headers, ...rows]
    .map((row) =>
      row.map((val) => `"${String(val || '').replace(/"/g, '""')}"`).join(';')
    )
    .join('\n');
}

export function triggerCsvDownload(csvBody: string, filename: string): void {
  const blob = new Blob([`\uFEFF${csvBody}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
