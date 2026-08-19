import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import {
  IncludeSourceKind,
  conversionReferenceLine,
  includeReferenceLine,
  includeReferenceText,
  includedPayloadFromQuote,
} from './document-include.util';

/**
 * La riga di riferimento — blocco A, 16/08/2026.
 *
 * Il difetto che questi test chiudono: `DocumentLine.isReference` esisteva ma
 * lato API non significava niente, e la maschera vendita creava la riga
 * `Rif. …` senza valorizzarlo. Da lì la riga poteva entrare nei calcoli, nel
 * magazzino e nell'XML come se fosse un prodotto.
 *
 * Qui si fissa che **la riga la costruisce un punto solo**, completa: testo,
 * flag e quantità. Le due maschere non devono ricordarsi niente.
 */
describe('la riga di riferimento si costruisce in un punto solo', () => {
  const IL_20_LUGLIO = '2026-07-20T00:00:00.000Z';

  it('porta con sé il flag e la quantità, non solo il testo', () => {
    const riga = includeReferenceLine(IncludeSourceKind.Quote, 'PRE-0001', IL_20_LUGLIO);

    expect(riga).toEqual({
      description: 'Rif. Preventivo PRE-0001 del 20/07/2026',
      isReference: true,
      // Zero, e non uno: è la rappresentazione tecnica di «nessuna quantità»,
      // decisa per non rendere nullable una colonna che tutti leggono come
      // numero certo. NON è la protezione — quella è `isReference`.
      quantity: 0,
    });
  });

  it('il testo resta quello di prima: la riga non ha cambiato formato', () => {
    // `includeReferenceText` esisteva già ed è la fonte del formato. Se un
    // giorno divergesse dalla riga, il documento generato direbbe una cosa e
    // l'elenco un'altra.
    expect(
      includeReferenceLine(IncludeSourceKind.Quote, 'PRE-0001', IL_20_LUGLIO).description,
    ).toBe(includeReferenceText(IncludeSourceKind.Quote, 'PRE-0001', IL_20_LUGLIO));
  });

  it('senza numero il riferimento resta leggibile: cade il numero, non la frase', () => {
    expect(includeReferenceLine(IncludeSourceKind.CustomerOrder, undefined, IL_20_LUGLIO)).toEqual({
      description: 'Rif. Ordine cliente del 20/07/2026',
      isReference: true,
      quantity: 0,
    });
  });
});

describe('conversionReferenceLine — il riferimento al predecessore diretto', () => {
  const IL_30_LUGLIO = '2026-07-30T00:00:00.000Z';

  it('la Proforma conserva il testo che aveva prima della centralizzazione', () => {
    // Questa frase la componeva `conversionReferenceText` dentro l'Ordine
    // cliente, rimosso. Se cambiasse, cambierebbe un testo storico.
    expect(conversionReferenceLine(DocumentType.Proforma, 'PRO-2026-0007', IL_30_LUGLIO)).toEqual({
      description: 'Rif. Proforma PRO-2026-0007 del 30/07/2026',
      isReference: true,
      quantity: 0,
    });
  });

  it('il DDT si chiama «DDT», non con l’etichetta generale dell’interfaccia', () => {
    // `documentTypeLabel` direbbe «DDT vendita»: il formato canonico delle
    // reference è un'altra cosa, e un formatter di UI non deve riscriverlo.
    expect(conversionReferenceLine(DocumentType.SalesDdt, '17', IL_30_LUGLIO)?.description).toBe(
      'Rif. DDT 17 del 30/07/2026',
    );
  });

  it('un tipo che non è origine di conversione non produce riga', () => {
    // Meglio nessuna riga che una riga con un'etichetta inventata.
    expect(conversionReferenceLine(DocumentType.InvoiceDraft, 'FT-0001', IL_30_LUGLIO)).toBeNull();
    expect(conversionReferenceLine(DocumentType.GoodsReceipt, 'CAR-0001', IL_30_LUGLIO)).toBeNull();
  });
});

/**
 * L'accumulo progressivo del `07` §12 — e la sua semantica.
 *
 * Le reference già presenti nell'origine viaggiano come tutte le altre righe:
 * è così che la catena si costruisce, senza risalire i legami. Ma il carico
 * portava **solo il testo**: nel documento successivo tornavano righe
 * ordinarie, e da lì potevano entrare nei conti.
 */
describe('il carico dell inclusione conserva la natura delle righe', () => {
  const preventivo = {
    id: 'doc-1',
    reference: 'PRE-0002',
    documentDate: '2026-07-31T00:00:00.000Z',
    customerId: 'cus-1',
    paymentTerms: undefined,
    lines: [
      {
        // La reference che il preventivo si portava dietro dal suo predecessore.
        variantId: undefined,
        sku: undefined,
        description: 'Rif. Ordine cliente OC-0003 del 29/07/2026',
        quantity: 0,
        unitPrice: { amountMinor: 0, currencyCode: 'EUR' },
        discountPercent: 0,
        vatCodeId: undefined,
        isReference: true,
      },
      {
        variantId: 'var-1',
        sku: 'SKU-1',
        description: 'Maglietta',
        quantity: 2,
        unitPrice: { amountMinor: 1000, currencyCode: 'EUR' },
        discountPercent: 0,
        vatCodeId: 'iva-22',
        isReference: false,
      },
    ],
  } as unknown as Parameters<typeof includedPayloadFromQuote>[0];

  it('la reference a monte arriva ancora marcata, il prodotto no', () => {
    const payload = includedPayloadFromQuote(preventivo);

    expect(payload.lines[0]!.isReference).toBe(true);
    expect(payload.lines[1]!.isReference).toBe(false);
  });

  it('e il carico porta anche la riga verso il preventivo stesso, completa', () => {
    // Accumulo: la riga del predecessore diretto SI AGGIUNGE a quelle ereditate,
    // non le sostituisce. Con più documenti inclusi si sommano (§12).
    const payload = includedPayloadFromQuote(preventivo);

    expect(payload.referenceLine).toEqual({
      description: 'Rif. Preventivo PRE-0002 del 31/07/2026',
      isReference: true,
      quantity: 0,
    });
    expect(payload.lines).toHaveLength(2);
  });
});
