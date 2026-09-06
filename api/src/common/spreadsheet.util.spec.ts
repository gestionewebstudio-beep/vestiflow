import { describe, expect, it } from 'vitest';

import {
  SPREADSHEET_ML_EXTENSION,
  SPREADSHEET_ML_MIME,
  sanitizeSheetName,
  serializeExcel2003Xml,
} from './spreadsheet.util';

/**
 * Il writer SpreadsheetML comune. Era dentro `corrispettivi-export.service.ts`
 * e senza prove proprie: qui viene messo alla prova come quello che è, cioè un
 * serializzatore usato da più moduli.
 */
describe('serializeExcel2003Xml', () => {
  it('produce un workbook che Excel riconosce', () => {
    const xml = serializeExcel2003Xml('Ordini', ['Numero'], [{ Numero: 'OF-1' }]);

    // ⚠️ È questa riga a far aprire il file come foglio invece che come XML.
    expect(xml).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(xml).toContain('urn:schemas-microsoft-com:office:spreadsheet');
    expect(xml).toContain('<Worksheet ss:Name="Ordini">');
  });

  it('scrive intestazione e righe nell’ordine delle colonne', () => {
    const xml = serializeExcel2003Xml(
      'F',
      ['B', 'A'],
      [
        { A: '1', B: '2' },
        { A: '3', B: '4' },
      ],
    );
    const valori = [...xml.matchAll(/<Data ss:Type="String">([^<]*)<\/Data>/g)].map((m) => m[1]);

    expect(valori).toEqual(['B', 'A', '2', '1', '4', '3']);
  });

  it('una colonna assente nella riga esce vuota, non «undefined»', () => {
    const xml = serializeExcel2003Xml('F', ['A', 'B'], [{ A: 'x' }]);
    expect(xml).not.toContain('undefined');
  });

  /**
   * ⛔ Senza escaping il file non è «brutto»: è **XML non valido**, ed Excel lo
   * rifiuta. Basta una ragione sociale con la `&`.
   */
  it('⛔ i caratteri speciali non rompono il file', () => {
    const xml = serializeExcel2003Xml('F', ['Cliente'], [{ Cliente: 'Rossi & Figli <SRL>' }]);

    expect(xml).toContain('Rossi &amp; Figli &lt;SRL&gt;');
    expect(xml).not.toContain('Rossi & Figli');
  });

  it('anche nel nome del foglio', () => {
    expect(serializeExcel2003Xml('A & B', [], [])).toContain('ss:Name="A &amp; B"');
  });
});

/**
 * ⚠️ Un nome foglio non valido produce un file che **Excel rifiuta di aprire**,
 * con un messaggio che non dice perché. Un modulo che passa un nome con una
 * barra non deve poterlo scoprire da un cliente.
 */
describe('sanitizeSheetName', () => {
  it('toglie i caratteri che Excel non accetta', () => {
    expect(sanitizeSheetName('Ordini/arrivi[2026]')).toBe('Ordini arrivi 2026');
  });

  it('tronca a 31 caratteri, che è il massimo di Excel', () => {
    expect(sanitizeSheetName('x'.repeat(40))).toHaveLength(31);
  });

  it('un nome vuoto non produce un foglio senza nome', () => {
    expect(sanitizeSheetName('   ')).toBe('Foglio1');
  });
});

/**
 * ⚠️ Estensione e MIME devono dire **ciò che il file è**. La UI può chiamare il
 * comando «Excel»; il file no: `.xlsx` è OOXML, questo è SpreadsheetML, e
 * scaricare un `.xlsx` che non lo è fa aprire Excel con un avviso.
 */
describe('formato dichiarato', () => {
  it('è .xls con il MIME di Excel, non .xlsx', () => {
    expect(SPREADSHEET_ML_EXTENSION).toBe('xls');
    expect(SPREADSHEET_ML_MIME).toBe('application/vnd.ms-excel');
  });
});
