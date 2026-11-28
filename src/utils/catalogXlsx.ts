import { buildCatalogCsvTemplate } from './catalogCsv';
import type { BusinessRubro } from '../types';

/**
 * Archivos de Excel (.xlsx) para cargar y descargar productos en lote.
 * La lectura convierte la primera hoja al mismo texto que ya entiende la carga por CSV,
 * así se usan las mismas columnas, la misma vista previa y las mismas reglas.
 */

const quote = (v: string) => (/[;"\n\r,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).replace('.', ',') : '';
  if (typeof value === 'boolean') return value ? 'si' : 'no';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Convierte las filas de una hoja de Excel en texto separado por ";" (el formato de la carga por CSV). */
export function sheetRowsToDelimitedText(rows: unknown[][]): string {
  return rows
    .map((row) => (Array.isArray(row) ? row.map(cellToText) : []))
    .filter((cells) => cells.some((c) => c !== ''))
    .map((cells) => cells.map(quote).join(';'))
    .join('\n');
}

export function isExcelFile(file: Pick<File, 'name' | 'type'>): boolean {
  return /\.xlsx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export function isLegacyExcelFile(file: Pick<File, 'name' | 'type'>): boolean {
  return /\.xls$/i.test(file.name) || file.type === 'application/vnd.ms-excel';
}

/** Lee la primera hoja de un archivo .xlsx y la devuelve como texto listo para la vista previa. */
export async function xlsxFileToDelimitedText(file: File): Promise<string> {
  const { readSheet } = await import('read-excel-file/browser');
  const rows = (await readSheet(file)) as unknown[][];
  return sheetRowsToDelimitedText(rows);
}

/** Descarga una plantilla .xlsx con las columnas aceptadas y un ejemplo. */
export async function downloadCatalogXlsxTemplate(
  defaultCategory: string,
  rubro: BusinessRubro,
  fileName: string
): Promise<void> {
  const csv = buildCatalogCsvTemplate(defaultCategory, rubro);
  const lines = csv
    .split('\n')
    .map((l) => l.split(';').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')));
  const header = lines[0].map((value) => ({ value, fontWeight: 'bold' as const }));
  const data = [header, ...lines.slice(1).map((row, r) => row.map((value, c) => (r === 0 && (c === 1 || c === 5 || c === 8 || c === 9) && value !== '' && !Number.isNaN(Number(value)) ? Number(value) : value)))];
  const writeExcelFile = (await import('write-excel-file/browser')).default;
  await writeExcelFile(data as never).toFile(fileName);
}
