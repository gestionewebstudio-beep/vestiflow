import { describe, expect, it } from 'vitest';

import {
  GoodsReceiptCsvParseError,
  parseCsvText,
  parseGoodsReceiptLinesCsv,
} from './goods-receipt-lines-csv.util';

describe('parseCsvText', () => {
  it('sceglie il punto e virgola quando prevale sulla prima riga', () => {
    expect(parseCsvText('a;b;c,d\ne;f;g,h\n')).toEqual([
      ['a', 'b', 'c,d'],
      ['e', 'f', 'g,h'],
    ]);
  });

  it('sceglie la virgola quando i due separatori pareggiano', () => {
    expect(parseCsvText('a;b,c')).toEqual([['a;b', 'c']]);
  });

  it('non spezza il campo fra virgolette sul separatore', () => {
    expect(parseCsvText('nome,qta\n"Maglia, cotone",2')).toEqual([
      ['nome', 'qta'],
      ['Maglia, cotone', '2'],
    ]);
  });

  it('riduce le virgolette raddoppiate a una sola', () => {
    expect(parseCsvText('nome\n"Maglia ""slim"""')).toEqual([['nome'], ['Maglia "slim"']]);
  });

  it('tiene sulla stessa riga un a capo racchiuso fra virgolette', () => {
    expect(parseCsvText('a,b\n"riga1\nriga2",x')).toEqual([
      ['a', 'b'],
      ['riga1\nriga2', 'x'],
    ]);
  });

  it('ignora il ritorno a capo dei file CRLF', () => {
    expect(parseCsvText('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('chiude ultima riga anche senza a capo finale', () => {
    expect(parseCsvText('a,b')).toEqual([['a', 'b']]);
  });

  it('non aggiunge una riga vuota dopo a capo finale', () => {
    expect(parseCsvText('a\n')).toEqual([['a']]);
  });

  it('conserva i campi vuoti in mezzo e in coda alla riga', () => {
    expect(parseCsvText('a,,b\nc,d,\n')).toEqual([
      ['a', '', 'b'],
      ['c', 'd', ''],
    ]);
  });

  it('restituisce nessuna riga per un contenuto vuoto', () => {
    expect(parseCsvText('')).toEqual([]);
  });
});

describe('parseGoodsReceiptLinesCsv', () => {
  it('parsa CSV con virgola e colonne SKU/quantità', () => {
    const content = 'sku,quantity,costo\nABC-1,3,10.50\n';
    const lines = parseGoodsReceiptLinesCsv(content);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.sku).toBe('ABC-1');
    expect(lines[0]?.quantity).toBe(3);
    expect(lines[0]?.unitCostText).toBe('10.50');
  });

  it('parsa costo con virgola decimale in CSV con punto e virgola', () => {
    const content = 'sku;quantity;costo\nABC-1;3;10,50\n';
    const lines = parseGoodsReceiptLinesCsv(content);
    expect(lines[0]?.unitCostText).toBe('10,50');
  });

  it('parsa CSV con punto e virgola (Excel italiano)', () => {
    const content = 'sku;quantità;ean\nSKU-9;2;800123\n';
    const lines = parseGoodsReceiptLinesCsv(content);
    expect(lines[0]?.sku).toBe('SKU-9');
    expect(lines[0]?.barcode).toBe('800123');
    expect(lines[0]?.quantity).toBe(2);
  });

  it('ignora il BOM iniziale dei file salvati da Excel', () => {
    const lines = parseGoodsReceiptLinesCsv('﻿sku,quantity\nABC-1,4\n');
    expect(lines[0]?.sku).toBe('ABC-1');
    expect(lines[0]?.quantity).toBe(4);
  });

  it('riconosce le intestazioni a prescindere da maiuscole e spazi multipli', () => {
    const lines = parseGoodsReceiptLinesCsv('  CODICE   ARTICOLO ,Q.TÀ\n A-1 , 2 \n');
    expect(lines[0]?.sku).toBe('A-1');
    expect(lines[0]?.quantity).toBe(2);
  });

  it('riconosce codice fornitore, descrizione, prezzo di acquisto e aliquota IVA', () => {
    const content =
      'cod. fornitore;descrizione;qta;prezzo di acquisto;aliquota iva\nF-1;Maglia;4;9,90;22\n';
    const lines = parseGoodsReceiptLinesCsv(content);
    expect(lines[0]?.supplierSku).toBe('F-1');
    expect(lines[0]?.productName).toBe('Maglia');
    expect(lines[0]?.quantity).toBe(4);
    expect(lines[0]?.unitCostText).toBe('9,90');
    expect(lines[0]?.vatRatePercentText).toBe('22');
  });

  it('tiene la prima colonna quando due intestazioni puntano allo stesso campo', () => {
    const lines = parseGoodsReceiptLinesCsv('sku,codice,quantity\nA-1,B-2,1\n');
    expect(lines[0]?.sku).toBe('A-1');
  });

  it('ignora le colonne sconosciute e lascia vuoti i campi non presenti', () => {
    const lines = parseGoodsReceiptLinesCsv('sku,quantity,colore\nA-1,1,rosso\n');
    expect(lines[0]?.barcode).toBe('');
    expect(lines[0]?.supplierSku).toBe('');
    expect(lines[0]?.productName).toBe('');
    expect(lines[0]?.unitCostText).toBe('');
    expect(lines[0]?.vatRatePercentText).toBe('');
  });

  it('lascia vuoti i campi delle righe più corte della intestazione', () => {
    const lines = parseGoodsReceiptLinesCsv('sku,quantity,costo\nA-1,2\n');
    expect(lines[0]?.quantity).toBe(2);
    expect(lines[0]?.unitCostText).toBe('');
  });

  it('numera le righe saltando quelle completamente vuote', () => {
    const lines = parseGoodsReceiptLinesCsv('sku,quantity\n\nA-1,2\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.rowNumber).toBe(2);
  });

  it('salta la riga che non compila nessuna colonna riconosciuta', () => {
    const lines = parseGoodsReceiptLinesCsv('sku,quantity,note\n,,scarto\nA-1,2,buona\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.sku).toBe('A-1');
    expect(lines[0]?.rowNumber).toBe(3);
  });

  it('accetta la quantità intera scritta con virgola decimale', () => {
    const lines = parseGoodsReceiptLinesCsv('sku;quantity\nA-1;3,0\n');
    expect(lines[0]?.quantity).toBe(3);
  });

  it('rifiuta la riga con quantità ma senza SKU, EAN o codice fornitore', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,quantity\n,5\n')).toThrow(/Riga 2/);
  });

  it('rifiuta la quantità zero', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,quantity\nA-1,0\n')).toThrow(
      /Quantità non valida: "0"/,
    );
  });

  it('rifiuta la quantità negativa', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,quantity\nA-1,-3\n')).toThrow(
      /Quantità non valida/,
    );
  });

  it('rifiuta la quantità decimale', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku;quantity\nA-1;2,5\n')).toThrow(
      /Quantità non valida/,
    );
  });

  it('rifiuta la quantità non numerica', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,quantity\nA-1,abc\n')).toThrow(
      /Quantità non valida: "abc"/,
    );
  });

  it('rifiuta la quantità mancante su una riga con SKU', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,quantity\nA-1,\n')).toThrow(
      /Quantità non valida: ""/,
    );
  });

  it('rifiuta il file senza colonna di identificazione articolo', () => {
    expect(() => parseGoodsReceiptLinesCsv('nome,quantity\nMaglia,2\n')).toThrow(
      /almeno SKU, EAN o codice fornitore/,
    );
  });

  it('rifiuta il file senza colonna quantità', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,costo\nA-1,10\n')).toThrow(
      /Intestazione obbligatoria mancante/,
    );
  });

  it('rifiuta il file vuoto', () => {
    expect(() => parseGoodsReceiptLinesCsv('')).toThrow(/Il file CSV è vuoto/);
  });

  it('rifiuta il file fatto di sole righe di spazi', () => {
    expect(() => parseGoodsReceiptLinesCsv('   \n  \n')).toThrow(/Il file CSV è vuoto/);
  });

  it('rifiuta il file con la sola intestazione', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,quantity\n')).toThrow(/Nessuna riga valida/);
  });

  it('rifiuta il file in cui nessuna riga compila le colonne riconosciute', () => {
    expect(() => parseGoodsReceiptLinesCsv('sku,quantity,note\n,,scarto\n')).toThrow(
      /Nessuna riga valida/,
    );
  });

  it('solleva un errore tipizzato con il proprio nome', () => {
    let caught: unknown;
    try {
      parseGoodsReceiptLinesCsv('');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GoodsReceiptCsvParseError);
    expect(caught instanceof Error ? caught.name : '').toBe('GoodsReceiptCsvParseError');
  });
});
