import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import type { EntityId } from '@core/models/common.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { ProductService } from '@domain/products/services/product.service';

import type {
  ContestoRichiamoArticolo,
  EsitoRichiamoArticolo,
  PolicyRichiamoArticolo,
  StatoRigaAlRichiamo,
} from '../models/document-line-article.model';
import { resolveDocumentLineArticle } from '../utils/document-line-article-resolver.util';

/**
 * **Il guscio del risolutore: procura il riepilogo quando la maschera non ce
 * l'ha, poi chiama la funzione pura.**
 *
 * ⛔ **Esiste per chiudere un difetto misurato.** Oggi tre maschere agganciano
 * una riga con il solo `variantId` quando il riepilogo non è fra quelli già
 * caricati — succede scegliendo fra più corrispondenze, dal pannello di ricerca
 * a tutta pagina, e da un esito risolto per codice. La riga resta senza
 * descrizione, che è `required`: **il salvataggio si rifiuta senza dire quale
 * riga**.
 *
 * La divisione fra questo guscio e la funzione pura è ciò che rende il
 * contratto testabile senza mock di rete: T1-T8 non lo toccano.
 */
@Injectable({ providedIn: 'root' })
export class DocumentLineArticleService {
  private readonly products = inject(ProductService);

  /**
   * Il richiamo con il riepilogo **già in mano**: sincrono, nessuna rete.
   *
   * È la via normale — la maschera ha quasi sempre il riepilogo, perché l'ha
   * appena ricevuto dalla ricerca o dal pannello.
   */
  resolveWithSummary(input: {
    readonly articolo: VariantSummary;
    readonly policy: PolicyRichiamoArticolo;
    readonly contesto: ContestoRichiamoArticolo;
    readonly riga: StatoRigaAlRichiamo;
  }): EsitoRichiamoArticolo {
    return resolveDocumentLineArticle({ ...input, variantIdRichiesto: input.articolo.variantId });
  }

  /**
   * Il richiamo quando si ha **solo l'id**: il riepilogo si va a prendere.
   *
   * ⚠️ Un errore di rete NON produce un risultato parziale: produce
   * `articolo-illeggibile`, e la maschera decide cosa dire. Scrivere metà riga
   * è peggio che non scriverne nessuna — la riga vuota si vede, la riga a metà
   * si scopre al salvataggio.
   */
  resolveById(input: {
    readonly variantId: EntityId;
    readonly locationId?: EntityId;
    readonly policy: PolicyRichiamoArticolo;
    readonly contesto: ContestoRichiamoArticolo;
    readonly riga: StatoRigaAlRichiamo;
  }): Observable<EsitoRichiamoArticolo> {
    const illeggibile: EsitoRichiamoArticolo = {
      esito: 'articolo-illeggibile',
      variantId: input.variantId,
    };
    return this.products
      .searchVariantSummaries({ variantId: input.variantId, locationId: input.locationId })
      .pipe(
        map((righe) => {
          const articolo = righe.find((riga) => riga.variantId === input.variantId) ?? null;
          return resolveDocumentLineArticle({
            articolo,
            variantIdRichiesto: input.variantId,
            policy: input.policy,
            contesto: input.contesto,
            riga: input.riga,
          });
        }),
        catchError(() => of(illeggibile)),
      );
  }
}
