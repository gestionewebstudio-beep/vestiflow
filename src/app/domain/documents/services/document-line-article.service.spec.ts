import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductService } from '@domain/products/services/product.service';

import type { ContestoRichiamoArticolo } from '../models/document-line-article.model';
import { PROFILI_RIGA_DOCUMENTO, campiEffettivi } from '../models/document-line-article.model';
import { DocumentLineArticleService } from './document-line-article.service';

/**
 * ⭐ **T8 — il test che vieta il risultato parziale.**
 *
 * Oggi tre maschere agganciano una riga con il solo `variantId` quando il
 * riepilogo non è fra quelli già caricati: la riga resta senza descrizione, che
 * è `required`, e **il salvataggio si rifiuta senza dire quale riga**.
 *
 * Il guscio esiste per chiuderlo: o procura il riepilogo e risolve tutto, o
 * dichiara l'articolo illeggibile e non scrive niente.
 */

const ARTICOLO: VariantSummary = {
  variantId: 'var-1',
  productId: 'prod-1',
  sku: 'MAG-M',
  articleCode: 'ART-1',
  productName: 'Maglia',
  title: 'Maglia — M / Rosso',
  variantLabel: 'M / Rosso',
  sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
};

const CONTESTO: ContestoRichiamoArticolo = {
  listino: 'article',
  codiciIvaPerId: new Map(),
  codiceIvaControparte: null,
  codiceIvaPredefinito: null,
  scontoControparte: null,
  codiceFornitoreDigitato: null,
  codiceFornitoreDiTestata: null,
};

const RIGA = { variantIdPrecedente: null, rigaPersistita: false, scontoCorrente: '' } as const;

const POLICY = {
  famigliaIva: PROFILI_RIGA_DOCUMENTO.vendita.famigliaIva,
  campi: campiEffettivi('vendita', { shopifyAttivo: true, costiVisibili: true }),
};

function creaServizio(risposta: Observable<readonly VariantSummary[]>) {
  const searchVariantSummaries = vi.fn().mockReturnValue(risposta);
  TestBed.configureTestingModule({
    providers: [
      DocumentLineArticleService,
      { provide: ProductService, useValue: { searchVariantSummaries } },
    ],
  });
  return { servizio: TestBed.inject(DocumentLineArticleService), searchVariantSummaries };
}

describe('DocumentLineArticleService', () => {
  describe('col riepilogo già in mano: nessuna rete', () => {
    it('risolve senza chiamare il servizio prodotti', () => {
      const { servizio, searchVariantSummaries } = creaServizio(of([]));

      const esito = servizio.resolveWithSummary({
        articolo: ARTICOLO,
        policy: POLICY,
        contesto: CONTESTO,
        riga: RIGA,
      });

      expect(esito.esito).toBe('risolto');
      if (esito.esito !== 'risolto') return;
      expect(esito.valori.nomeProdotto).toBe('Maglia');
      expect(esito.valori.variantLabel).toBe('M / Rosso');
      expect(searchVariantSummaries).not.toHaveBeenCalled();
    });
  });

  describe('col solo id: il riepilogo si va a prendere', () => {
    it('trovato l’articolo, risolve come la funzione pura', async () => {
      const { servizio } = creaServizio(of([ARTICOLO]));

      const esito = await new Promise((resolve) =>
        servizio
          .resolveById({ variantId: 'var-1', policy: POLICY, contesto: CONTESTO, riga: RIGA })
          .subscribe(resolve),
      );

      expect(esito).toMatchObject({ esito: 'risolto' });
      expect((esito as { valori: { nomeProdotto: string } }).valori.nomeProdotto).toBe('Maglia');
    });

    it('passa la sede, così le letture vive sono di quella sede', async () => {
      const { servizio, searchVariantSummaries } = creaServizio(of([ARTICOLO]));

      await new Promise((resolve) =>
        servizio
          .resolveById({
            variantId: 'var-1',
            locationId: 'loc-9',
            policy: POLICY,
            contesto: CONTESTO,
            riga: RIGA,
          })
          .subscribe(resolve),
      );

      expect(searchVariantSummaries).toHaveBeenCalledWith({
        variantId: 'var-1',
        locationId: 'loc-9',
      });
    });

    /** ⛔ Il caso che il guscio esiste per chiudere. */
    it('articolo non trovato: illeggibile, e NESSUN valore', async () => {
      const { servizio } = creaServizio(of([]));

      const esito = await new Promise((resolve) =>
        servizio
          .resolveById({ variantId: 'var-99', policy: POLICY, contesto: CONTESTO, riga: RIGA })
          .subscribe(resolve),
      );

      expect(esito).toEqual({ esito: 'articolo-illeggibile', variantId: 'var-99' });
      expect('valori' in (esito as object)).toBe(false);
    });

    it('risposta che non contiene l’id chiesto: illeggibile, non l’articolo sbagliato', async () => {
      const altro = { ...ARTICOLO, variantId: 'var-altro', productName: 'Altro' } as VariantSummary;
      const { servizio } = creaServizio(of([altro]));

      const esito = await new Promise((resolve) =>
        servizio
          .resolveById({ variantId: 'var-1', policy: POLICY, contesto: CONTESTO, riga: RIGA })
          .subscribe(resolve),
      );

      expect(esito).toEqual({ esito: 'articolo-illeggibile', variantId: 'var-1' });
    });

    /**
     * ⚠️ Un errore di rete non produce mezza riga: scrivere metà riga è peggio
     * che non scriverne nessuna — la riga vuota si vede, quella a metà si
     * scopre al salvataggio.
     */
    it('errore di rete: illeggibile, non un errore che risale', async () => {
      const { servizio } = creaServizio(throwError(() => new Error('rete giù')));

      const esito = await new Promise((resolve) =>
        servizio
          .resolveById({ variantId: 'var-1', policy: POLICY, contesto: CONTESTO, riga: RIGA })
          .subscribe(resolve),
      );

      expect(esito).toEqual({ esito: 'articolo-illeggibile', variantId: 'var-1' });
    });
  });
});
