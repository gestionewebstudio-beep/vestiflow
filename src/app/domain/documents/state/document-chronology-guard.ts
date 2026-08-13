import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';

import type { DocumentType } from '@core/models/document.model';

import { DocumentService } from '../services/document.service';

import { DocumentChronologyWarningStore } from './document-chronology-warning.store';

/** Le due cose che cambiano da una maschera all'altra: il contatore. */
export interface ChronologyGuardOptions {
  readonly documentType: () => DocumentType;
  /** Serie in testata; stringa vuota = «Senza serie», che è un contatore vero. */
  readonly series: () => string;
}

/**
 * **Il controllo cronologico davanti al salvataggio** (specifica numerazione
 * §4), pronto da innestare.
 *
 * Ogni maschera documento deve fare la stessa cosa: prima di salvare chiede al
 * server se la serie contiene documenti fuori posto, e se sì mostra l'avviso
 * invece di procedere. Sono venti righe identiche per sette maschere — cioè il
 * modo in cui questo progetto ha già prodotto tre divergenze silenziose — e
 * quindi vivono qui, in un punto solo.
 *
 * Alla maschera restano tre innesti: `run()` al posto della chiamata di
 * salvataggio, `confirm()` sul «Sì, salva comunque», e il dialogo in coda al
 * template.
 *
 * **Due scelte di robustezza, entrambe nel verso giusto in cui sbagliare:**
 *
 * 1. Se il **controllo** non risponde, si salva lo stesso. Un avviso mancato è
 *    meno grave di un documento perduto, e la rete non deve poter impedire a un
 *    operatore di registrare il suo lavoro.
 * 2. Se lo **spegnimento** fallisce, l'avviso ricompare. Uno spegnimento che non
 *    si riaccende — e questo non si riaccende — non va concesso per un errore di
 *    rete.
 *
 * Classe, non servizio iniettabile: ogni maschera ne vuole una propria. Va
 * costruita in un contesto di iniezione (inizializzatore di campo).
 */
export class DocumentChronologyGuard {
  private readonly documents = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);

  /** Lo stato dell'avviso, per il dialogo in template. */
  readonly warning = new DocumentChronologyWarningStore();

  /** Il salvataggio sospeso mentre l'operatore legge l'avviso. */
  private sospeso: (() => void) | null = null;

  constructor(private readonly options: ChronologyGuardOptions) {}

  /**
   * Esegue `salva`, oppure mostra l'avviso e lo sospende. Sostituisce la
   * chiamata di salvataggio nella maschera.
   */
  run(salva: () => void): void {
    this.sospeso = salva;
    this.documents
      .checkChronology(this.options.documentType(), this.options.series() ?? '')
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => this.prosegui(),
        next: (esito) => {
          if (!this.warning.present(esito.anomalies, esito.dismissed)) {
            this.prosegui();
          }
        },
      });
  }

  /** «Sì, salva comunque»: si prosegue, e la spunta si ricorda se c'era. */
  confirm(): void {
    const { dismiss } = this.warning.confirm();
    if (dismiss) {
      this.documents
        .dismissChronologyWarning(this.options.documentType())
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({ error: () => undefined });
    }
    this.prosegui();
  }

  /** «No»: si torna al documento, e il salvataggio sospeso si lascia cadere. */
  cancel(): void {
    this.warning.cancel();
    this.sospeso = null;
  }

  private prosegui(): void {
    const salva = this.sospeso;
    this.sospeso = null;
    salva?.();
  }
}
