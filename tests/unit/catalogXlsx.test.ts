import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCatalogSpreadsheetText } from '../../src/utils/catalogCsv';
import { isExcelFile, isLegacyExcelFile, sheetRowsToDelimitedText } from '../../src/utils/catalogXlsx';

test('las filas de Excel se convierten al texto de la carga por CSV y se interpretan bien', () => {
  const rows = [
    ['Nombre', 'Precio', 'Categoría', 'Subfiltros', 'SKU', 'Stock', 'Unidad'],
    ['Libro; "Génesis"', 12500.5, 'Libros', 'Biblias|Regalo', 7790001, 10, 'Unidad'],
    ['Cuaderno', 3200, 'Librería', '', 'CUA-1', null, ''],
    [null, null, null, null, null, null, null],
  ];
  const text = sheetRowsToDelimitedText(rows);
  const parsed = parseCatalogSpreadsheetText(text, 'General');
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.validRows.length, 2);
  const [a, b] = parsed.validRows;
  assert.equal(a.name, 'Libro; "Génesis"');
  assert.equal(a.price, 12500.5);
  assert.equal(a.category, 'Libros');
  assert.deepEqual(a.subfilters, ['Biblias', 'Regalo']);
  assert.equal(a.sku, '7790001');
  assert.equal(a.stockQuantity, 10);
  assert.equal(b.stockQuantity, undefined, 'stock vacío = sin límite');
  assert.equal(b.unitLabel, 'Unidad');
});

test('detecta el tipo de archivo de Excel', () => {
  assert.equal(isExcelFile({ name: 'productos.XLSX', type: '' }), true);
  assert.equal(isExcelFile({ name: 'x.csv', type: 'text/csv' }), false);
  assert.equal(isLegacyExcelFile({ name: 'viejo.xls', type: '' }), true);
  assert.equal(isLegacyExcelFile({ name: 'nuevo.xlsx', type: '' }), false);
});
