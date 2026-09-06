/**
 * Serializzatore **SpreadsheetML** (Excel 2003 XML), casa comune.
 *
 * ⚠️ **Non è `.xlsx`**, e il nome conta: `.xlsx` è OOXML, un archivio ZIP con
 * dentro più parti XML, e per produrlo servirebbe una libreria. Questo è il
 * formato XML che Excel apre nativamente da vent'anni — estensione `.xls`,
 * MIME `application/vnd.ms-excel`. La UI può chiamare il comando «Excel»; il
 * file però deve dichiarare ciò che è, o l'operatore scarica un `.xlsx` che
 * Excel apre con un avviso.
 *
 * ⛔ Vive qui, accanto a `csv.util.ts`, e non dentro un modulo: era in
 * `corrispettivi-export.service.ts`, e il secondo consumer — l'elenco Ordini
 * fornitore — avrebbe prodotto un secondo generatore XML quasi identico. Da lì
 * in poi ogni elenco ne avrebbe avuto uno suo, e una correzione all'escaping
 * andrebbe fatta in cinque posti.
 *
 * Ciò che resta ai moduli è quello che li distingue davvero: **colonne, righe,
 * formattazione dei valori e nome del foglio**.
 */

/** Estensione del file prodotto: SpreadsheetML si serve come `.xls`. */
export const SPREADSHEET_ML_EXTENSION = 'xls';

/** MIME del file prodotto. */
export const SPREADSHEET_ML_MIME = 'application/vnd.ms-excel';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Nome foglio valido per Excel: al massimo 31 caratteri, senza `[ ] : * ? / \`.
 *
 * ⚠️ Non è pignoleria: un nome con una barra o più lungo di 31 caratteri
 * produce un file che **Excel rifiuta di aprire**, e il messaggio non dice
 * perché. Un modulo che passa «Ordini fornitore / arrivi» non deve poterlo
 * scoprire da un cliente.
 */
export function sanitizeSheetName(name: string): string {
  const pulito = name.replace(/[[\]:*?/\\]/g, ' ').trim();
  return (pulito || 'Foglio1').slice(0, 31);
}

/**
 * Un foglio solo, con intestazione e righe.
 *
 * Le righe sono mappe `intestazione → valore già formattato`: la formattazione
 * (date, importi, decimali) appartiene al modulo, che sa in che valuta e con
 * quale precisione si legge il proprio dato.
 */
export function serializeExcel2003Xml(
  sheetName: string,
  headers: readonly string[],
  rows: readonly Record<string, string>[],
): string {
  const cella = (value: string): string =>
    `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;

  const headerCells = headers.map(cella).join('');
  const dataRows = rows
    .map((row) => `<Row>${headers.map((header) => cella(row[header] ?? '')).join('')}</Row>`)
    .join('');

  return (
    '<?xml version="1.0"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n' +
    `<Worksheet ss:Name="${escapeXml(sanitizeSheetName(sheetName))}">\n` +
    '<Table>\n' +
    `<Row>${headerCells}</Row>\n` +
    `${dataRows}\n` +
    '</Table>\n' +
    '</Worksheet>\n' +
    '</Workbook>'
  );
}
