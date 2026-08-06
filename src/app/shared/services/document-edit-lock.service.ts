import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Sblocchi validi per la sessione corrente, condivisi da tutte le maschere.
 * Vive a livello di modulo: un documento sbloccato resta tale finché lo si
 * lavora e torna protetto alla riapertura dopo l'uscita.
 */
const SESSION_UNLOCKED_DOC_IDS = new Set<string>();

/**
 * Blocco-alla-riapertura condiviso: un documento confermato si apre sempre
 * bloccato, con banner di sblocco; dopo lo sblocco è modificabile. Da fornire
 * per componente (una maschera = un'istanza), così ogni istanza traccia gli id
 * che ha sbloccato e li rilascia all'uscita — alla riapertura tornano protetti.
 */
@Injectable()
export class DocumentEditLockService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _unlocked = signal(false);
  /** true = editing consentito (bozza sempre, confermato solo dopo sblocco). */
  readonly unlocked = this._unlocked.asReadonly();

  /** Id sbloccati da QUESTA istanza: rilasciati all'uscita. */
  private readonly unlockedByThisInstance = new Set<string>();
  private preserveOnDestroy = false;

  constructor() {
    // Lo sblocco vale solo finché si lavora nella maschera: all'uscita gli id
    // sbloccati da questa istanza tornano protetti alla riapertura.
    this.destroyRef.onDestroy(() => {
      if (this.preserveOnDestroy) {
        return;
      }
      for (const id of this.unlockedByThisInstance) {
        SESSION_UNLOCKED_DOC_IDS.delete(id);
      }
    });
  }

  /**
   * Da chiamare al caricamento del documento: una bozza è sempre sbloccata; un
   * confermato lo è solo se già sbloccato in questa sessione.
   */
  syncOnLoad(docId: string | null | undefined, isConfirmed: boolean): void {
    if (!isConfirmed) {
      this._unlocked.set(true);
      return;
    }
    this._unlocked.set(docId ? SESSION_UNLOCKED_DOC_IDS.has(docId) : false);
  }

  /** Sblocco esplicito richiesto dall'utente. */
  unlock(docId: string | null | undefined): void {
    if (docId) {
      SESSION_UNLOCKED_DOC_IDS.add(docId);
      this.unlockedByThisInstance.add(docId);
    }
    this._unlocked.set(true);
  }

  /**
   * Il prossimo destroy non rilascia gli sblocchi: serve quando la maschera
   * cambia route (es. new→:id) senza che sia un'uscita reale.
   */
  preserveAcrossReload(): void {
    this.preserveOnDestroy = true;
  }
}
