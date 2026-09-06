import { computed, Injectable, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';

import type { ColumnFilterChange, ColumnFilterState } from './column-filter.model';
import { countActiveColumnFilters, isColumnFilterActive } from './column-filter.model';
import type { ResolvedTableColumn, TableViewId } from './table-column.model';

/** Come si leggono le scelte di un filtro `values`: dalle righe, non da un elenco. */
export type OpzioniDiColonna = (columnId: string) => readonly string[];

const SENZA_FILTRI: ColumnFilterState = {};
const SENZA_OPZIONI: OpzioniDiColonna = () => [];
const SENZA_COLONNE: readonly ResolvedTableColumn[] = [];

/**
 * ⭐ **LO STATO DEI FILTRI DI COLONNA, PER VISTA** (`14` §0.2).
 *
 * ## Perché uno store e non tre `input()`
 *
 * I filtri di colonna hanno **tre consumatori in punti diversi dell'albero**, e
 * nessuno dei tre è genitore degli altri due:
 *
 * ```text
 * app-data-table    disegna i controlli nelle intestazioni, e li scrive
 * app-list-page     conta i filtri attivi («Filtri (2)») e apre il pannello sotto lg
 * la tabella dumb   filtra le proprie righe, e da lì totali e card
 * ```
 *
 * ⛔ **Passarli per `input()`/`output()` avrebbe voluto dire cablare a mano
 * dodici elenchi**, con la regola non ovvia che li governa — spegnere azzera —
 * copiata dodici volte. Sarebbe bastato dimenticarla una volta per lasciare un
 * elenco ristretto da un filtro invisibile.
 *
 * ⭐ **La chiave è la `TableViewId`**, la stessa delle preferenze colonne: chi
 * sa quali colonne mostra sa anche come le filtra.
 *
 * ## ⚠️ Non si conserva, ed è una scelta
 *
 * Niente `localStorage`, niente server. Un filtro è un gesto del momento — come
 * la larghezza trascinata di una colonna (`14` §G1) — e ritrovare l'elenco
 * ristretto la settimana dopo, senza ricordarsi di averlo fatto, è il difetto
 * che questa regola evita.
 */
@Injectable({ providedIn: 'root' })
export class ColumnFilterStore {
  private readonly stati = new Map<TableViewId, WritableSignal<ColumnFilterState>>();
  private readonly accesi = new Map<TableViewId, WritableSignal<boolean>>();
  private readonly opzioni = new Map<TableViewId, WritableSignal<OpzioniDiColonna>>();
  private readonly colonneDiVista = new Map<
    TableViewId,
    WritableSignal<readonly ResolvedTableColumn[]>
  >();
  private readonly conteggi = new Map<TableViewId, Signal<number>>();

  /** I filtri attivi su questa vista. */
  stato(viewId: TableViewId): Signal<ColumnFilterState> {
    return this.segnaleStato(viewId).asReadonly();
  }

  /**
   * ⭐ **I controlli si vedono?** Lo comanda il pulsante «Filtri» del telaio.
   *
   * ⚠️ Sta qui e non nel telaio perché **è legato ai valori**: spegnere azzera, e
   * due segnali in due posti diversi potrebbero divergere — controlli spenti con
   * filtri attivi è esattamente lo stato che la regola vieta.
   */
  acceso(viewId: TableViewId): Signal<boolean> {
    return this.segnaleAcceso(viewId).asReadonly();
  }

  /** Il numero del badge «Filtri (n)»: solo i filtri che restringono davvero. */
  conteggio(viewId: TableViewId): Signal<number> {
    const esistente = this.conteggi.get(viewId);
    if (esistente) {
      return esistente;
    }
    const stato = this.segnaleStato(viewId);
    const nuovo = computed(() => countActiveColumnFilters(stato()));
    this.conteggi.set(viewId, nuovo);
    return nuovo;
  }

  /**
   * ⭐ **Accende e spegne — e spegnere AZZERA** (`14` §0.2).
   *
   * ⛔ Non è una scorciatoia: su scrivania questo pulsante ha preso il posto di
   * «Azzera filtri», che stava in barra su sei pagine. Se spegnere non azzerasse,
   * l'azzeramento non esisterebbe più da nessuna parte — e resterebbe un elenco
   * ristretto senza nessun controllo a vista che dica perché.
   */
  commuta(viewId: TableViewId): void {
    const acceso = !this.segnaleAcceso(viewId)();
    this.segnaleAcceso(viewId).set(acceso);
    if (!acceso) {
      this.azzera(viewId);
    }
  }

  /** `value: null` toglie il filtro da quella colonna. */
  imposta(viewId: TableViewId, cambio: ColumnFilterChange): void {
    const attuale = this.segnaleStato(viewId)();
    const prossimo: Record<string, (typeof attuale)[string]> = { ...attuale };

    if (cambio.value === null || !isColumnFilterActive(cambio.value)) {
      // ⚠️ Un controllo svuotato non lascia una chiave inerte: `countActive…`
      //    non la conterebbe, ma `Object.keys` sì — e chi legge lo stato per
      //    sapere «c'è un filtro su questa colonna?» avrebbe la risposta sbagliata.
      delete prossimo[cambio.columnId];
    } else {
      prossimo[cambio.columnId] = cambio.value;
    }

    this.segnaleStato(viewId).set(prossimo);
  }

  azzera(viewId: TableViewId): void {
    if (Object.keys(this.segnaleStato(viewId)()).length === 0) {
      // ⚠️ Non si riscrive un oggetto vuoto su uno già vuoto: sarebbe una nuova
      //    identità a ogni azzeramento, e ogni `computed` a valle ricalcolerebbe.
      return;
    }
    this.segnaleStato(viewId).set(SENZA_FILTRI);
  }

  /**
   * ⭐ **Le scelte di un filtro `values` vengono dalle righe CARICATE**, e le
   * registra chi le ha in mano — la tabella dumb, che possiede sia le righe sia
   * il `cellText` con cui si leggono.
   *
   * ⛔ **Devono venire dalle righe NON filtrate.** Leggendole dalle righe già
   * ristrette, dopo aver scelto «Bozza» sparirebbe «Confermato» dall'elenco delle
   * scelte: il filtro si potrebbe stringere ma non allargare.
   */
  registraOpzioni(viewId: TableViewId, provider: OpzioniDiColonna): void {
    this.segnaleOpzioni(viewId).set(provider);
  }

  /** Le scelte offerte da una colonna, adesso. */
  opzioniDi(viewId: TableViewId, columnId: string): readonly string[] {
    return this.segnaleOpzioni(viewId)()(columnId);
  }

  /**
   * ⭐ **Le colonne VISIBILI della vista, pubblicate dal motore tabella.**
   *
   * ⛔ **Non si chiedono alle preferenze colonne**, ed è una scelta: il telaio
   * elenco dovrebbe allora iniettare quel servizio, che porta con sé
   * `AuthService` e la sua catena — su ogni pagina elenco, anche su quelle che
   * di filtri di colonna non ne hanno. Il motore le ha già in mano.
   *
   * ⚠️ **Sono quelle visibili adesso**: colonna spenta dal selettore Colonne,
   * filtro spento anche nel pannello compatto (`14` §0.2).
   */
  registraColonne(viewId: TableViewId, colonne: readonly ResolvedTableColumn[]): void {
    this.segnaleColonne(viewId).set(colonne);
  }

  colonne(viewId: TableViewId): Signal<readonly ResolvedTableColumn[]> {
    return this.segnaleColonne(viewId).asReadonly();
  }

  private segnaleStato(viewId: TableViewId): WritableSignal<ColumnFilterState> {
    return this.oCrea(this.stati, viewId, SENZA_FILTRI);
  }

  private segnaleAcceso(viewId: TableViewId): WritableSignal<boolean> {
    return this.oCrea(this.accesi, viewId, false);
  }

  private segnaleOpzioni(viewId: TableViewId): WritableSignal<OpzioniDiColonna> {
    return this.oCrea(this.opzioni, viewId, SENZA_OPZIONI);
  }

  private segnaleColonne(viewId: TableViewId): WritableSignal<readonly ResolvedTableColumn[]> {
    return this.oCrea(this.colonneDiVista, viewId, SENZA_COLONNE);
  }

  /*
    ⚠️ **Creazione pigra, e non è un `registerView` come per le colonne.**

    Un segnale si può CREARE mentre Angular legge un template: è la scrittura su
    un segnale esistente a essere vietata lì. Serve però che l'identità sia
    stabile — chi legge prima che qualcuno scriva deve ricevere lo stesso segnale
    di chi legge dopo, o resterebbe agganciato a un valore che non cambia più.
  */
  private oCrea<V>(
    mappa: Map<TableViewId, WritableSignal<V>>,
    viewId: TableViewId,
    iniziale: V,
  ): WritableSignal<V> {
    const esistente = mappa.get(viewId);
    if (esistente) {
      return esistente;
    }
    const nuovo = signal(iniziale);
    mappa.set(viewId, nuovo);
    return nuovo;
  }
}
