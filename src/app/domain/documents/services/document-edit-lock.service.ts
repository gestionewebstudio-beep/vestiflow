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
   * Da chiamare al caricamento: un documento che si RIAPRE nasce bloccato, e lo
   * resta finché non è stato sbloccato in questa sessione. Una frase sola, uguale
   * per ogni tipo documento.
   *
   * Non c'è più un ramo per le bozze. Ce n'era uno («non confermato → sempre
   * sbloccato») ed era proprio la complicazione che faceva divergere le maschere:
   * chi il ripiego su Draft ce l'aveva e chi no. Ma le bozze non esistono come
   * documenti che si riaprono — nel database sono ZERO su 90 — quindi quel ramo
   * non si percorreva mai. Chi chiama gatea comunque sul proprio
   * `isConfirmedEdit()`, quindi il comportamento non cambia.
   */
  syncOnLoad(docId: string | null | undefined): void {
    if (docId && SESSION_UNLOCKED_DOC_IDS.has(docId)) {
      // ADOZIONE, ed è la riga senza la quale il blocco non si richiude mai.
      //
      // Lo sblocco può arrivare da un'istanza precedente: il passaggio
      // new → /:id/edit distrugge la maschera e ne ricrea un'altra. Se questa
      // istanza si limitasse a leggerlo, nessuno lo rilascerebbe più
      // all'uscita — `unlockedByThisInstance` resterebbe vuoto — e l'id
      // resterebbe nel set di sessione per sempre: da lì in poi ogni
      // riapertura di quel documento lo troverebbe sbloccato.
      //
      // Adottandolo, è questa istanza a rispondere del rilascio: quando esce,
      // il documento torna protetto.
      this.unlockedByThisInstance.add(docId);
      this._unlocked.set(true);
      return;
    }
    this._unlocked.set(false);
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
   * Il documento torna protetto **subito**, senza aspettare l'uscita.
   *
   * Lo sblocco vale per la modifica che si è appena conclusa, non per tutta la
   * sessione: salvato il documento, chi vuole rimetterci mano lo sblocca di
   * nuovo. Senza questo, dopo un salvataggio la maschera resterebbe aperta e
   * scrivibile, e il blocco varrebbe solo per la prima modifica.
   */
  relock(docId: string | null | undefined): void {
    if (docId) {
      SESSION_UNLOCKED_DOC_IDS.delete(docId);
      this.unlockedByThisInstance.delete(docId);
    }
    this._unlocked.set(false);
  }

  /**
   * Il prossimo destroy non rilascia gli sblocchi: serve quando la maschera
   * cambia route (es. new→:id) senza che sia un'uscita reale.
   */
  preserveAcrossReload(): void {
    this.preserveOnDestroy = true;
  }
}
