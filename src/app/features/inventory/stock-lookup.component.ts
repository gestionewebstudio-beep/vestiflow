import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, forkJoin, of, switchMap } from 'rxjs';

import { BarcodeDetectionService } from '@core/services/barcode-detection.service';
import { APP_CONFIG } from '@core/config/app-config.token';
import { isAppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/common.model';
import { formatMoney } from '@core/utils/money.util';
import { LocationContextService } from '@core/services/location-context.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { PwaInstallService } from '@core/services/pwa-install.service';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { BarcodeScannerComponent } from '@shared/components/barcode-scanner/barcode-scanner.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductService } from '@domain/products/services/product.service';
import {
  raggruppaPerArticolo,
  type ArticoloTrovato,
} from '@domain/products/models/articolo-trovato.model';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';
import { VARIANT_SEARCH_DEBOUNCE_MS } from '@domain/documents/utils/document-variant-search.config';

import {
  componiSituazione,
  type RigaSituazione,
  type SedeSituazione,
  type SituazioneArticolo,
} from './models/ricerca-giacenza.model';

import { InventoryTabsComponent } from './components/inventory-tabs/inventory-tabs.component';
import {
  reservationChannelLabel,
  type StockReservationRow,
} from '@domain/inventory/models/stock-reservation.model';
import { InventoryService } from '@domain/inventory/services/inventory.service';

/**
 * ⭐ **Dalla terza lettera**, come chiesto: con una o due il risultato è mezzo
 * catalogo, e la richiesta parte a ogni tasto.
 */
const MIN_CARATTERI_RICERCA = 3;

/**
 * ⚠️ **Il tetto dei risultati, e si DICHIARA a schermo.** Cento varianti sono
 * molti più articoli di quanti se ne scorrano col pollice; oltre, la schermata
 * dice che sta mostrando i primi invece di far credere che siano tutti.
 */
const MAX_VARIANTI_RICERCA = 100;

/*
  ⛔ **Qui c'era `LookupState`**: idle → loading → success | not-found | error,
  cioè gli stati di una ricerca che restituiva UN risultato. Con la ricerca a
  più articoli gli stati sono altri, e stanno nei segnali della classe.
*/

/** Target del drill-down Impegnata: variante × location (fase 3 §6). */
interface ReservationsTarget {
  readonly variantId: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly committed: number;
  readonly sku: string;
  readonly productName: string;
}

/**
 * Ricerca rapida SKU/barcode per magazzino mobile (PWA). Mostra Giacenza,
 * Impegnata (espandibile sugli ordini che la compongono) e Disponibile per
 * location, con link a movimento o dettaglio prodotto.
 */
@Component({
  selector: 'app-stock-lookup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListPageComponent,
    InlineBannerComponent,
    RouterLink,
    ButtonComponent,
    BarcodeScannerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
    InventoryTabsComponent,
  ],
  templateUrl: './stock-lookup.component.html',
  styleUrl: './stock-lookup.component.scss',
})
export class StockLookupComponent {
  private readonly productService = inject(ProductService);
  private readonly inventoryService = inject(InventoryService);
  private readonly operationalLocations = inject(OperationalLocationsService);
  private readonly locationContext = inject(LocationContextService);
  private readonly pwaInstall = inject(PwaInstallService);
  private readonly config = inject(APP_CONFIG);
  private readonly destroyRef = inject(DestroyRef);

  // La stessa risposta di tutti gli altri: bandiera d'ambiente, fotocamera
  // presente, e schermo compatto. Su scrivania resta il lettore HID.
  protected readonly barcodeScannerEnabled = inject(BarcodeDetectionService).cameraScanOffered;

  protected readonly canInstallPwa = this.pwaInstall.canInstall;

  // Drill-down Impegnata (fase 3 §6): ordini che compongono la quantità.
  protected readonly reservationsTarget = signal<ReservationsTarget | null>(null);
  protected readonly reservationsPanelOpen = computed(() => this.reservationsTarget() !== null);
  protected readonly reservations = signal<readonly StockReservationRow[]>([]);
  protected readonly reservationsLoading = signal(false);
  protected readonly reservationsError = signal<string | null>(null);
  protected readonly channelLabel = reservationChannelLabel;

  /*
    ⛔ **Qui c'era `canManageInventory`**, e serviva solo a decidere se mostrare
    «Registra movimento». Tolto il link, il permesso non governa più niente in
    questa schermata: è di **sola consultazione**.

    ⚠️ Torna insieme alla funzione, se la decisione sarà di gestirla
    (`docs/DA-FARE.md`) — non prima, o resta un predicato che nessuno legge.
  */

  /*
    ⛔ **Qui c'erano un form a invio e la sua validazione**, tolti il 02/09/2026:
    la ricerca non si invia più, parte da sé alla terza lettera. Un campo
    «obbligatorio» che si convalida al submit non ha più un submit a cui
    appendersi — e `npm run check:form-errors` l'ha detto subito, perché un
    invio che esce in silenzio è un pulsante che non fa niente.
  */

  // ── La ricerca del commesso ───────────────────────────────────────────────

  /**
   * ⭐ **LA RICERCA È INCREMENTALE, DALLA TERZA LETTERA** — requisiti dettati dal
   * proprietario il 02/09/2026: _«col nome appaiono man mano gli articoli con
   * quel nome partendo dalla terza lettera […] Un po' come i commessi di
   * Footlocker»_.
   *
   * ⚠️ **Tre e non una**: con una o due lettere il risultato è mezzo catalogo, e
   * la richiesta parte a ogni tasto. La soglia è ciò che rende utile il debounce,
   * non un di più.
   */
  protected readonly testoCercato = signal('');

  protected readonly articoli = signal<readonly ArticoloTrovato[]>([]);
  protected readonly ricercaInCorso = signal(false);
  protected readonly ricercaErrore = signal<string | null>(null);

  /** Quante lettere mancano per far partire la ricerca, o zero. */
  protected readonly lettereMancanti = computed(() =>
    Math.max(0, MIN_CARATTERI_RICERCA - this.testoCercato().trim().length),
  );

  /**
   * ⚠️ **Il tetto è DICHIARATO**, non silenzioso (`14`, «No silent caps»): oltre
   * questa soglia i risultati sono i primi, e la schermata lo dice — un elenco
   * troncato che si spaccia per completo è la risposta sbagliata a «ce l'ho?».
   */
  protected readonly risultatiTroncati = signal(false);

  private readonly ricerca = toObservable(this.testoCercato)
    .pipe(
      debounceTime(VARIANT_SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      /*
        ⭐ **`switchMap` annulla la richiesta precedente**, ed è ciò che rende
        onesta una ricerca che parte a ogni tasto: senza, la risposta di «mag»
        può arrivare dopo quella di «maglie» e sovrascriverla — i risultati
        mostrati sarebbero di una domanda che l'operatore non sta più facendo.
      */
      switchMap((testo) => {
        const cercato = testo.trim();
        if (cercato.length < MIN_CARATTERI_RICERCA) {
          this.ricercaInCorso.set(false);
          return of([] as readonly VariantSummary[]);
        }
        this.ricercaInCorso.set(true);
        this.ricercaErrore.set(null);
        return this.productService
          .searchVariantSummaries({ search: cercato, pageSize: MAX_VARIANTI_RICERCA })
          .pipe(
            catchError(() => {
              this.ricercaErrore.set('Ricerca non riuscita. Riprova.');
              return of([] as readonly VariantSummary[]);
            }),
          );
      }),
      takeUntilDestroyed(this.destroyRef),
    )
    .subscribe((varianti) => {
      this.ricercaInCorso.set(false);
      this.risultatiTroncati.set(varianti.length >= MAX_VARIANTI_RICERCA);
      const articoli = raggruppaPerArticolo(varianti);
      this.articoli.set(articoli);

      /*
        ⭐ **Chi SCANSIONA ha già scelto**: se il codice letto porta a un solo
        articolo, si apre la sua situazione senza far toccare un elenco da un
        elemento. È la stessa strategia della Vendita al banco — il codice esatto
        risolve, il testo cerca.

        ⚠️ **Vale solo per la scansione**, non per chi digita: scrivendo «mag» si
        possono avere per un attimo pochi risultati, e aprirne uno da soli
        porterebbe via dalla ricerca che si sta ancora componendo.
      */
      const daScanner = this.apriSeUnico;
      this.apriSeUnico = false;
      const solo = articoli.length === 1 ? articoli[0] : undefined;
      if (daScanner && solo) {
        this.apriArticolo(solo);
      }
    });

  /** Alzato dalla scansione, letto una volta sola alla risposta successiva. */
  private apriSeUnico = false;

  protected onSearchInput(valore: string): void {
    this.testoCercato.set(valore);
    // Digitando si torna ai risultati: la scheda aperta era di un'altra domanda.
    this.articoloAperto.set(null);
  }

  // ── L'articolo aperto: la sua situazione, taglia per taglia e sede per sede ──

  protected readonly articoloAperto = signal<ArticoloTrovato | null>(null);
  protected readonly situazione = signal<SituazioneArticolo | null>(null);
  protected readonly situazioneInCorso = signal(false);

  /**
   * ⭐ **Toccando un articolo si apre la SITUAZIONE PER SEDE** — decisione del
   * proprietario: la domanda del commesso è «ce l'ho, e dove?», non «com'è fatta
   * l'anagrafica».
   *
   * ⚠️ **Una chiamata per SEDE, non per variante**: le sedi operative sono due o
   * tre, le varianti di un articolo anche quaranta. Chiedere per variante sarebbe
   * l'N+1 che si vede — quaranta richieste mentre il commesso aspetta col
   * cliente davanti.
   */
  protected apriArticolo(articolo: ArticoloTrovato): void {
    this.articoloAperto.set(articolo);
    this.situazione.set(null);

    const sedi = this.operationalLocations
      .locations()
      .map((location) => ({ locationId: location.id, locationName: location.name }));
    if (sedi.length === 0) {
      this.situazione.set({ sedi: [], righe: [] });
      return;
    }

    this.situazioneInCorso.set(true);
    forkJoin(
      sedi.map((sede) =>
        this.productService
          .searchVariantSummaries({
            productId: articolo.productId,
            locationId: sede.locationId,
            pageSize: MAX_VARIANTI_RICERCA,
          })
          .pipe(catchError(() => of([] as readonly VariantSummary[]))),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((perSede) => {
        this.situazioneInCorso.set(false);
        // ⚠️ Solo se è ancora l'articolo che si sta guardando: un tocco veloce su
        //    due articoli farebbe altrimenti atterrare la prima risposta sulla
        //    scheda della seconda.
        if (this.articoloAperto()?.productId === articolo.productId) {
          this.situazione.set(componiSituazione(articolo, sedi, perSede));
        }
      });
  }

  protected chiudiArticolo(): void {
    this.articoloAperto.set(null);
    this.situazione.set(null);
  }

  // ── Come si leggono i numeri ──────────────────────────────────────────────

  /**
   * ⛔ **`null` non è zero, e qui la differenza è operativa**: «0» vuol dire
   * FINITO, «—» vuol dire che quell'articolo non si conta (servizio, magazzino
   * non gestito). In negozio sono due risposte opposte alla stessa domanda.
   */
  protected quantita(valore: number | null): string {
    return valore === null ? '—' : String(valore);
  }

  protected prezzoLeggibile(prezzo: Money): string {
    return formatMoney(prezzo);
  }

  /** «una taglia», «6 taglie»: dice quanto c'è sotto prima di aprirlo. */
  protected quanteTaglie(articolo: ArticoloTrovato): string {
    const quante = articolo.varianti.length;
    return quante === 1 ? 'una taglia' : `${quante} taglie`;
  }

  /**
   * L'invito a cercare, che cambia mentre si scrive.
   *
   * ⚠️ **Sta nel TS e non nel template**: l'espressione porta un apostrofo
   * dentro una stringa, e nel template diventa un ginepraio di escape.
   */
  protected invitoRicerca(): string {
    const mancanti = this.lettereMancanti();
    if (this.testoCercato().trim().length === 0) {
      return "Scrivi il nome, lo SKU o l'EAN. Bastano tre lettere.";
    }
    return mancanti === 1
      ? 'Ancora una lettera e la ricerca parte da sé.'
      : `Ancora ${mancanti} lettere e la ricerca parte da sé.`;
  }

  /*
    ⛔ **Qui c'era `lookup()`, e ne era il difetto**: chiamava
    `findVariantByCode`, che risolve un codice ESATTO e restituisce UNA
    variante — 404 se ambiguo. Ecco perché «maglie» non trovava niente: non
    mancavano i dati, era la domanda sbagliata.

    La ricerca ora passa da `searchVariantSummaries`, che cerca per testo su
    nome, SKU, barcode, codice articolo e codice fornitore, ed è multi-parola.
  */

  /**
   * ⭐ **Il codice letto entra nella ricerca**, e se porta a un articolo solo si
   * apre da sé: chi passa un capo sul lettore ha già scelto quale.
   *
   * ⚠️ **Passa dalla stessa ricerca di chi digita**, non da una seconda strada:
   * il filtro testuale del server include già barcode e SKU, quindi un codice
   * esatto dà un risultato esatto. Due percorsi diversi per la stessa domanda
   * sono due comportamenti che prima o poi divergono.
   */
  protected onScanned(code: string): void {
    this.apriSeUnico = true;
    this.onSearchInput(code);
  }

  /**
   * ⭐ **Il «perché quel numero»**: da una cella della griglia si apre l'elenco
   * degli ordini che stanno impegnando quella taglia in quella sede.
   *
   * ⚠️ **Era già qui e stava per andare perduto**: il pannello viveva attaccato
   * alla vecchia tabella per sede, e riscrivendo la schermata sarebbe rimasto nel
   * DOM senza più niente che lo aprisse. È la domanda che un commesso fa quando
   * la disponibilità non torna — «ce ne sono cinque ma ne posso vendere due:
   * perché?» — e senza risposta il numero sembra sbagliato.
   */
  protected apriPrenotazioni(riga: RigaSituazione, sede: SedeSituazione): void {
    const articolo = this.articoloAperto();
    if (!articolo) {
      return;
    }
    const target: ReservationsTarget = {
      variantId: riga.variantId,
      locationId: sede.locationId,
      locationName: sede.locationName,
      // ⚠️ Il conteggio esatto lo porta la risposta: qui basta sapere che c'è
      //    qualcosa da guardare, e il pannello dice quanto.
      committed: 0,
      sku: riga.sku,
      productName: articolo.productName,
    };
    this.reservationsTarget.set(target);
    this.loadReservations(target);
  }

  protected closeReservations(): void {
    this.reservationsTarget.set(null);
    this.reservations.set([]);
    this.reservationsError.set(null);
  }

  protected reloadReservations(): void {
    const target = this.reservationsTarget();
    if (target) {
      this.loadReservations(target);
    }
  }

  private loadReservations(target: ReservationsTarget): void {
    this.reservationsLoading.set(true);
    this.reservationsError.set(null);
    this.inventoryService
      .getReservations(target.variantId, target.locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.reservations.set(rows);
          this.reservationsLoading.set(false);
        },
        error: (err: unknown) => {
          this.reservationsLoading.set(false);
          this.reservationsError.set(
            isAppError(err) ? err.message : 'Operazione non riuscita. Riprova.',
          );
        },
      });
  }

  protected async installApp(): Promise<void> {
    await this.pwaInstall.promptInstall();
  }

  protected isActiveLocation(locationId: string): boolean {
    return this.locationContext.activeLocationId() === locationId;
  }
}
