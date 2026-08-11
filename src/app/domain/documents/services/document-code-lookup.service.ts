import { Injectable, inject } from '@angular/core';
import { catchError, map, of, switchMap, take, type Observable } from 'rxjs';

import {
  DOCUMENT_CODE_MATCH_PAGE_SIZE,
  filterExactCodeMatches,
  type DocumentLineCodeField,
} from '@domain/documents/utils/document-code-match.util';
import { ProductService } from '@domain/products/services/product.service';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/**
 * L'esito della conferma di un codice, in **tre** forme e non due.
 *
 * È il motivo per cui questo percorso esiste separato da
 * `BarcodeLookupService.resolveVariantIdByCode`: quello restituisce
 * `string | null` e **non può esprimere «eccone tre»** — scarta i candidati al
 * proprio interno, e un codice giusto ma condiviso finisce indistinguibile da
 * un codice inesistente. Che è la peggiore delle tre risposte.
 *
 * Quella funzione resta alla **scansione**, che ha esigenze opposte: il lettore
 * spara e va, e una scelta interromperebbe un gesto che deve essere immediato.
 * La conferma da tastiera è il contrario — l'operatore è lì, sta guardando, ed
 * è l'unico che può risolvere.
 */
export type DocumentCodeLookupOutcome =
  /** Nessuna corrispondenza: il valore digitato resta scritto, la riga prosegue. */
  | { readonly kind: 'none' }
  /** Una sola: si aggancia. `summary` è null se l'ha risolta l'endpoint `by-code`. */
  | { readonly kind: 'one'; readonly variantId: string; readonly summary: VariantSummary | null }
  /** Più d'una: la scelta è dell'operatore. Mai due esiti appiattiti su uno. */
  | { readonly kind: 'many'; readonly matches: readonly VariantSummary[] };

/** Filtri che il chiamante può passare. Volutamente pochissimi: vedi sotto. */
export interface DocumentCodeLookupOptions {
  /**
   * Sede del documento. **Non filtra i risultati**: restringe soltanto le
   * giacenze mostrate nel riepilogo (verificato: `locationId` entra nella
   * `where` degli `InventoryLevel`, non in quella delle varianti). Per questo
   * c'è, mentre `supplierId` non c'è — vedi `resolve`.
   */
  readonly locationId?: string;
}

/**
 * La conferma di un codice su una riga documento: si confronta col catalogo
 * per corrispondenza **esatta**, e gli esiti sono tre.
 *
 * Vive qui, e non nelle maschere, perché la regola è identica su tutte:
 * Ordine cliente (e con lui DDT vendita, Preventivi, Scarico manuale), Arrivo
 * merce, Ordine fornitore. Tre copie di questa catena sarebbero il difetto che
 * il lavoro sulle righe documento sta rimuovendo.
 *
 * Cosa resta al form, perché lì differisce davvero: leggere il valore dal
 * proprio controllo, agganciare la variante, spostare il fuoco.
 */
@Injectable({ providedIn: 'root' })
export class DocumentCodeLookupService {
  private readonly productService = inject(ProductService);

  /**
   * ⚠️ **Niente `supplierId`, e non è una dimenticanza.** Il riconoscimento di
   * un codice non dipende dal contesto: filtrando per il fornitore della
   * testata, lo stesso codice corretto veniva riconosciuto in un documento e
   * ignorato in un altro. Peggio ancora, `supplierId` filtra *anche* i
   * risultati (`where: { supplierLinks: { some: { supplierId } } }`), quindi
   * era il filtro appena tolto dall'Arrivo merce che rientrava da un'altra
   * porta.
   *
   * Conseguenza voluta sul codice fornitore: siccome non è unico, lo stesso
   * codice può appartenere ad articoli di fornitori diversi — ed è esattamente
   * il caso che deve aprire la scelta, non quello che va nascosto filtrando.
   *
   * Seconda conseguenza voluta, sui **costi d'acquisto** (08/2026): il
   * riepilogo restituito porta il costo della VARIANTE in anagrafica, non
   * l'ultimo prezzo pagato a quel fornitore — che tornava solo passando
   * `supplierId`. Il prezzo pagato l'ultima volta è un fatto storico, magari un
   * lotto in saldo: precompilarlo faceva partire la riga da un numero che
   * nessuno aveva deciso. Nulla si perde — `lastPurchasePriceMinor` continua a
   * essere scritto a ogni carico e riletto da `findSupplierPriceDiffs`, che
   * prende il fornitore dalla testata e non da qui: lo scostamento «lo pagavi
   * X, ora paghi Y» resta visibile alla conferma del documento.
   *
   * L'errore HTTP degrada a «nessuna corrispondenza»: la conferma di un codice
   * non è un'operazione che possa bloccare la compilazione di una riga.
   */
  resolve(
    value: string,
    field: DocumentLineCodeField,
    options: DocumentCodeLookupOptions = {},
  ): Observable<DocumentCodeLookupOutcome> {
    const trimmed = value.trim();
    if (!trimmed) {
      return of<DocumentCodeLookupOutcome>({ kind: 'none' });
    }

    return this.productService
      .searchVariantSummaries({
        search: trimmed,
        pageSize: DOCUMENT_CODE_MATCH_PAGE_SIZE,
        locationId: options.locationId,
      })
      .pipe(
        take(1),
        catchError(() => of([] as readonly VariantSummary[])),
        switchMap((rows) => {
          const matches = filterExactCodeMatches(rows, trimmed, field);
          const only = matches[0];
          if (matches.length === 1 && only) {
            return of<DocumentCodeLookupOutcome>({
              kind: 'one',
              variantId: only.variantId,
              summary: only,
            });
          }
          if (matches.length > 1) {
            return of<DocumentCodeLookupOutcome>({ kind: 'many', matches });
          }
          return this.resolveByCodeEndpoint(trimmed);
        }),
      );
  }

  /**
   * Rete di sicurezza, non la strada principale: l'endpoint `by-code` risolve
   * solo i casi NON ambigui (SKU/EAN esatti, codice articolo se il prodotto ha
   * una variante sola, codice fornitore se non è condiviso) e tace sugli altri.
   * Serve per i codici che la ricerca testuale non riporta in pagina; quando
   * risponde, la risposta è per costruzione una sola variante.
   */
  private resolveByCodeEndpoint(code: string): Observable<DocumentCodeLookupOutcome> {
    return this.productService.findVariantByCode(code).pipe(
      take(1),
      map((variant): DocumentCodeLookupOutcome => ({
        kind: 'one',
        variantId: variant.variantId,
        summary: null,
      })),
      catchError(() => of<DocumentCodeLookupOutcome>({ kind: 'none' })),
    );
  }
}
