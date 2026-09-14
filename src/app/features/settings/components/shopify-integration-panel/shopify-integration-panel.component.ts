import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TimeoutError, switchMap, take, takeWhile, timer } from 'rxjs';
import type { Observable } from 'rxjs';

import { AuthService } from '@core/auth';
import { isAppError } from '@core/models/app-error.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import {
  canSyncCatalogFromShopify,
  canSyncInventoryFromShopify,
  canSyncCustomersFromShopify,
  canSyncOrdersFromShopify,
} from '@core/permissions/tenant-permissions.util';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { NavTabsComponent } from '@shared/components/nav-tabs/nav-tabs.component';
import type { NavTab } from '@shared/components/nav-tabs/nav-tabs.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableFiltersButtonComponent } from '@shared/components/table-filters/table-filters-button.component';
import { TableFiltersPanelComponent } from '@shared/components/table-filters/table-filters-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { ShopifyShopChangeWizardComponent } from '@domain/channels/shopify/components/shopify-shop-change-wizard/shopify-shop-change-wizard.component';
import {
  shopifyConnectionStatusLabel,
  shopifyConnectionStatusTone,
} from '@domain/channels/shopify/models/shopify-connection-labels.util';
import { normalizeShopDomainInput } from '@domain/channels/shopify/models/normalize-shop-domain.util';
import {
  shopifyProductReadScopeWarning,
  shopifyPublicationsScopeWarning,
  shopifyScopeDiagnosticsDetail,
} from '@domain/channels/shopify/models/shopify-scope-capabilities.util';
import {
  groupShopifyScopesForDisplay,
  shopifyScopeAccessLabel,
} from '@domain/channels/shopify/models/shopify-scope-labels.util';
import {
  formatShopifyCustomersSyncFeedback,
  formatShopifyOrdersSyncFeedback,
  formatShopifyProductsSyncFeedback,
} from '@domain/channels/shopify/models/shopify-sync-feedback.util';
import { etichettaMotivoAllineamento } from '@domain/channels/shopify/models/shopify-allinea-motivo.util';
import type {
  AvanzamentoAllineamentoDto,
  CoppiaNonAllineataDto,
  ShopifyClearErrorsDto,
  ShopifyDisableWebhooksDto,
  ShopifySyncLocationsDto,
  ShopifySyncWebhooksDto,
  ShopifyWebhookCheckDto,
} from '@domain/channels/shopify/models/shopify-sync.dto';
import { ShopifyLocationChoicesComponent } from '@domain/channels/shopify/components/shopify-location-choices/shopify-location-choices.component';
import type { ShopifySetupSedeScelta } from '@domain/channels/shopify/components/shopify-location-choices/shopify-location-choices.component';
import { ShopifyProblemiComponent } from '@domain/channels/shopify/components/shopify-problemi/shopify-problemi.component';
import { ShopifySetupPanelComponent } from '@domain/channels/shopify/components/shopify-setup-panel/shopify-setup-panel.component';
import type { ShopifySetupProblemaAzione } from '@domain/channels/shopify/models/shopify-setup.dto';
import { situazioneDi } from '@domain/channels/shopify/models/shopify-setup.dto';
import { gruppiPerCausa } from '@domain/channels/shopify/models/shopify-problemi.util';
import type {
  ShopifySetupDirection,
  ShopifySetupDto,
} from '@domain/channels/shopify/models/shopify-setup.dto';
import {
  faseDelPercorso,
  percorsoBloccaSincronizzazione,
  sceltaSediFuoriPercorso,
} from '@domain/channels/shopify/models/shopify-setup.dto';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifySetupService } from '@domain/channels/shopify/services/shopify-setup.service';
import { ShopifyConnectionStore } from '@domain/channels/shopify/state/shopify-connection.store';

import type { SetupStatusItem } from '../../models/setup-status.model';
import {
  SHOPIFY_ALLINEA_COLUMN_DEFS,
  SHOPIFY_ALLINEA_COLUMN_PRESETS,
  SHOPIFY_ALLINEA_VIEW,
} from '../../models/shopify-allinea-table-columns.config';

type ShopifyBanner = 'connected' | 'connected-warn' | 'error' | 'disconnected' | 'setup';

/** Le cinque SCHEDE della pagina (`docs/29` §3): il segmento di rotta di ciascuna. */
export type SchedaShopify =
  'prima-connessione' | 'sincronizzazione' | 'operazioni' | 'problemi' | 'connessione';

const SCHEDE: readonly SchedaShopify[] = [
  'prima-connessione',
  'sincronizzazione',
  'operazioni',
  'problemi',
  'connessione',
];

type TonoStato = 'success' | 'warning' | 'neutral' | 'info' | 'error';

/** A quale flusso automatico appartiene una notifica Shopify, dal suo argomento. */
function flussoDellaNotifica(topic: string): FlussoAutomatico['id'] | null {
  if (topic.startsWith('orders/') || topic.startsWith('fulfillment_orders/')) {
    return 'ordini';
  }
  if (topic.startsWith('inventory_levels/')) {
    return 'quantita';
  }
  if (topic.startsWith('products/')) {
    return 'catalogo';
  }
  if (topic.startsWith('customers/')) {
    return 'clienti';
  }
  return null;
}

/** Un rimando a un'altra scheda, ed eventualmente a un elemento dentro di lei. */
interface RimandoScheda {
  readonly etichetta: string;
  readonly scheda: SchedaShopify;
  readonly elemento?: string;
}

/** Un flusso degli aggiornamenti automatici, con il suo stato e il perché. */
interface FlussoAutomatico {
  readonly id: 'ordini' | 'quantita' | 'catalogo' | 'clienti';
  readonly nome: string;
  readonly direzione: string;
  readonly descrizione: string;
  readonly stato: 'attivo' | 'limitato' | 'sospeso' | 'da verificare';
  readonly tono: TonoStato;
  readonly dettaglio: string;
  readonly rimando?: RimandoScheda;
}

/** L'esito di un'operazione: una fotografia con la data. */
interface EsitoOperazione {
  readonly id: string;
  readonly nome: string;
  readonly quando: string;
  readonly stato: string;
  readonly tono: TonoStato;
  readonly testo: string;
  readonly rimando?: RimandoScheda;
}

/**
 * Quante righe di problema puo' contenere una banda prima di smettere di essere un segnale.
 * Oltre, si dichiara il numero e si rimanda allo stato completo: nessuna lista dentro un
 * segnale, e nessun troncamento silenzioso.
 */
const MAX_PROBLEMS_IN_BANNER = 2;

interface ActionFeedback {
  readonly message: string;
  readonly tone: 'success' | 'warning';
}

const ACTION_SUCCESS_DISMISS_MS = 8000;
/** Attivazione oltre il timeout HTTP: si rilegge lo stato ogni 3 s, per al più 2 minuti. */
const ATTESA_ATTIVAZIONE_MS = 3000;
const ATTESA_ATTIVAZIONE_MAX_LETTURE = 40;

/**
 * Pannello «Integrazione Shopify» della schermata Impostazioni: collegamento
 * OAuth, permessi concessi, stato di setup, sync manuali, aggiornamenti
 * automatici.
 *
 * Gemello di `TikTokIntegrationPanelComponent`: si inietta i propri service e
 * non riceve stato dalla pagina. L'unica eccezione è `locationSetupStatus`, che
 * dipende dalle location e dal piano del tenant — dati della pagina, non del
 * canale. Lo stato della connessione arriva invece da `ShopifyConnectionStore`,
 * che lo condivide con la sezione Location: le due parti devono vedere la
 * stessa connessione, e chiederla due volte al server le farebbe divergere.
 */
@Component({
  selector: 'app-shopify-integration-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NavTabsComponent,
    BadgeComponent,
    ButtonComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    ErrorStateComponent,
    InlineBannerComponent,
    ReactiveFormsModule,
    TableColumnPickerComponent,
    TableFiltersButtonComponent,
    TableFiltersPanelComponent,
    TableSkeletonComponent,
    ShopifyShopChangeWizardComponent,
    ShopifyLocationChoicesComponent,
    ShopifyProblemiComponent,
    ShopifySetupPanelComponent,
  ],
  templateUrl: './shopify-integration-panel.component.html',
  styleUrl: './shopify-integration-panel.component.scss',
})
export class ShopifyIntegrationPanelComponent {
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySetupService = inject(ShopifySetupService);
  private readonly connectionStore = inject(ShopifyConnectionStore);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Stato «Location collegate» dello schema di setup. Si calcola da location e
   * piano del tenant, che appartengono alla pagina: il pannello lo mostra e
   * basta.
   */
  readonly locationSetupStatus = input.required<SetupStatusItem>();
  /** La scheda aperta (segmento di rotta); `null` = quella predefinita per lo stato. */
  readonly scheda = input<string | null>(null);

  /**
   * Il tenant deve ancora scegliere quali sedi attivare (piano multi-sede, o
   * nessuna sede attiva). Lo sa la pagina, che ha il piano del tenant; qui
   * serve solo a completare il messaggio dopo la sync delle location.
   */
  readonly mustChooseLocations = input(false);

  /** Le location sono cambiate lato server: chi ospita il pannello le rilegga. */
  readonly locationsChanged = output<void>();

  protected readonly connectionStatusLabel = shopifyConnectionStatusLabel;
  protected readonly connectionStatusTone = shopifyConnectionStatusTone;
  protected readonly shopifyScopeAccessLabel = shopifyScopeAccessLabel;
  protected readonly formatDateTime = formatDateTime;

  /**
   * Chi gestisce la connessione (titolare): vede prima connessione,
   * configurazione e aggiornamenti automatici, e può leggere lo stato.
   *
   * ⚠️ Non è più il cancello del pannello (11/09/2026): la pagina
   * `/app/settings/shopify` si apre anche a chi ha il solo permesso di un
   * comando di sincronizzazione, e a lui si mostrano SOLO i comandi che quel
   * permesso concede, con i loro esiti. Lo stato della connessione non lo
   * può leggere — l'API risponde 403 — e non gli si finge un «non connesso».
   */
  protected readonly canManageShopify = this.connectionStore.available;

  // ── I comandi generali, ciascuno col PROPRIO permesso (11/09/2026) ────────
  // Sono gli stessi predicati che governavano i pulsanti nelle barre di
  // Prodotti, Giacenze, Clienti e Ordini cliente: spostare il comando non ne
  // cambia il permesso — e il confine vero resta sull’API.
  protected readonly puoSincronizzareCatalogo = computed(() =>
    canSyncCatalogFromShopify(this.authService.currentUser()),
  );
  protected readonly puoSincronizzareGiacenze = computed(() =>
    canSyncInventoryFromShopify(this.authService.currentUser()),
  );
  /**
   * ⭐ Clienti e ordini seguono le combinazioni che l’API già chiede, senza
   * permessi nuovi (deciso l’11/09/2026): chi le possiede vede ed esegue il
   * comando, anche senza gestire la connessione. Sono DUE predicati perché
   * sono due scritture diverse — l’anagrafica e gli ordini — e un manager può
   * avere l’una e non l’altra.
   */
  protected readonly puoImportareClienti = computed(() =>
    canSyncCustomersFromShopify(this.authService.currentUser()),
  );
  protected readonly puoImportareOrdini = computed(() =>
    canSyncOrdersFromShopify(this.authService.currentUser()),
  );
  /**
   * La sezione Comandi: per chi gestisce la connessione compare solo
   * a negozio collegato, come prima; per chi non può leggere la connessione
   * compare sempre — se il negozio non è collegato lo dirà l’API, in Stato ed
   * esiti, invece di un pannello vuoto senza spiegazione.
   */
  protected readonly mostraSincronizzazione = computed(() => {
    // ⛔ Con un percorso di prima connessione non ancora attivato, i comandi di
    //    sincronizzazione restano chiusi (`docs/27` §0): niente parte da solo,
    //    e niente parte da un pulsante che scavalca le tre fasi.
    if (percorsoBloccaSincronizzazione(this.setup())) {
      return false;
    }
    return this.canManageShopify() ? this.connection() !== null : true;
  });

  // ── PRIMA CONNESSIONE (`docs/27`) ──────────────────────────────────────────
  //    Si legge a negozio collegato, per chi gestisce la connessione. Se il
  //    percorso non c’è (connessione nata prima) la sezione mostra solo le
  //    sedi con le loro scelte: la parte che serve anche a loro.
  protected readonly setup = signal<ShopifySetupDto | null>(null);
  protected readonly setupBusy = signal(false);
  protected readonly setupErrore = signal<string | null>(null);
  /** L’attivazione dura oltre il timeout HTTP: si sta rileggendo lo stato dal server. */
  protected readonly setupAttesa = signal<string | null>(null);
  protected readonly mostraPercorso = computed(
    () =>
      this.canManageShopify() &&
      this.connection()?.status === ShopifyConnectionStatus.Connected &&
      this.setup()?.presente === true,
  );
  /**
   * ⭐ Le scelte sulle sedi nella sezione Sedi, FUORI dal percorso: per le
   *    connessioni nate prima e dopo una disconnessione e riconnessione, quando
   *    le sedi vanno riscelte da una persona (12/09/2026). Stesso componente
   *    della fase 2 del percorso, stesso comando dell’API.
   */
  protected readonly mostraSceltaSedi = computed(
    () =>
      this.canManageShopify() &&
      this.connection()?.status === ShopifyConnectionStatus.Connected &&
      sceltaSediFuoriPercorso(this.setup()),
  );

  /**
   * ⭐ Il percorso è IN CORSO: si apre la scheda «Prima connessione» e le
   *    operazioni manuali restano chiuse (`docs/29` §3). Concluso, si apre
   *    «Sincronizzazione automatica» e la prima connessione resta consultabile.
   */
  protected readonly percorsoInCorso = computed(
    () => this.mostraPercorso() && percorsoBloccaSincronizzazione(this.setup()),
  );

  // ── LE CINQUE SCHEDE (`docs/29` §3, deciso il 13/09/2026) ────────────────
  /**
   * Chi non gestisce la connessione: le operazioni. Negozio da collegare, o percorso
   * in corso: la prima connessione. Altrimenti la sincronizzazione.
   */
  protected readonly schedaPredefinita = computed((): SchedaShopify => {
    if (!this.canManageShopify()) {
      return 'operazioni';
    }
    return this.shopifyConnectable() || this.percorsoInCorso()
      ? 'prima-connessione'
      : 'sincronizzazione';
  });
  protected readonly schedaAttiva = computed((): SchedaShopify => {
    const richiesta = this.scheda();
    return SCHEDE.includes(richiesta as SchedaShopify)
      ? (richiesta as SchedaShopify)
      : this.schedaPredefinita();
  });
  /** Le schede compaiono solo con una connessione letta: non in caricamento, non da collegare, non in errore. */
  protected readonly schedeVisibili = computed(
    () =>
      this.canManageShopify() &&
      !this.connectionLoading() &&
      !this.shopifyConnectable() &&
      this.connectionError() === null,
  );
  /**
   * Le schede, con la parola di stato accanto al nome dove serve a scegliere
   * («conclusa», «limitata») e il conteggio dei problemi a pastiglia — la forma del
   * mock approvato dal proprietario il 13/09/2026, non «· conclusa · 87» in riga.
   */
  protected readonly schede = computed((): readonly NavTab[] => {
    const base = '/app/settings/shopify';
    const problemi = this.situazione().problemi.length;
    const prima: NavTab = this.percorsoInCorso()
      ? {
          label: 'Prima connessione',
          link: `${base}/prima-connessione`,
          stato: 'in corso',
          tono: 'info',
        }
      : this.mostraPercorso()
        ? { label: 'Prima connessione', link: `${base}/prima-connessione`, stato: 'conclusa' }
        : { label: 'Prima connessione', link: `${base}/prima-connessione` };
    const automatico = this.statoAutomatico();
    const automatici: NavTab = this.percorsoInCorso()
      ? { label: 'Sincronizzazione automatica', link: `${base}/sincronizzazione` }
      : {
          label: 'Sincronizzazione automatica',
          link: `${base}/sincronizzazione`,
          stato: automatico.breve,
          tono:
            automatico.tono === 'success' || automatico.tono === 'warning'
              ? automatico.tono
              : 'neutral',
        };
    return [
      prima,
      automatici,
      { label: 'Operazioni manuali', link: `${base}/operazioni` },
      { label: 'Problemi ed esiti', link: `${base}/problemi`, conteggio: problemi },
      { label: 'Connessione e sedi', link: `${base}/connessione` },
    ];
  });
  /** «fase 2 di 3 · Sedi»: le fasi visibili sono TRE (`docs/27` §1). */
  protected readonly faseEtichetta = computed(() => {
    const fase = faseDelPercorso(this.setup()?.status ?? null);
    switch (fase) {
      case 'scelte':
        return 'fase 1 di 3 · Scelte iniziali';
      case 'sedi':
        return 'fase 2 di 3 · Sedi';
      case 'controllo':
        return 'fase 3 di 3 · Controllo e conferma';
    }
  });

  // ── SITUAZIONE ATTUALE (13/09/2026) ────────────────────────────────────────
  //    Compare a negozio collegato quando il percorso è concluso o non c'è: prima
  //    dell'attivazione la prima connessione è lei stessa la situazione.
  protected readonly mostraSituazione = computed(
    () =>
      this.canManageShopify() &&
      this.connection()?.status === ShopifyConnectionStatus.Connected &&
      this.setup() !== null &&
      sceltaSediFuoriPercorso(this.setup()),
  );
  /** La situazione letta ora (tollerante a un'API che non la porta ancora). */
  protected readonly situazione = computed(() => situazioneDi(this.setup()));
  /** Lo stesso valore, per un `@let` nel template che non può ombreggiare il nome. */
  protected readonly situazioneAttuale = this.situazione;
  protected readonly ordiniSenzaSede = computed(
    () =>
      this.situazione().problemi.filter(
        (p) => p.tipo === 'ordine' && p.causa !== 'ordini_acquisizione_fallita',
      ).length,
  );
  /** Ferme = la protezione è attiva: nessuna quantità parte finché ci sono ordini senza sede. */
  protected readonly quantitaFerme = computed(() => this.ordiniSenzaSede() > 0);
  protected readonly coppieSenzaBase = computed(
    () => this.situazione().problemi.filter((p) => p.tipo === 'coppia').length,
  );
  protected readonly causeAperte = computed(
    () => gruppiPerCausa(this.situazione().problemi).length,
  );
  /**
   * ⭐ Gli aggiornamenti automatici in UNA parola, con un colore che ha un significato
   *    preciso (proprietario, 13/09/2026): verde = operativi; ambra = limitati o da
   *    verificare, e «attivi» non deve far credere che tutto funzioni quando le
   *    quantità sono ferme; neutro = sospesi.
   */
  protected readonly statoAutomatico = computed(
    (): { testo: string; breve: string; tono: TonoStato } => {
      if (!this.connection()?.autoSyncEnabled) {
        return { testo: 'sospesi', breve: 'sospesa', tono: 'neutral' };
      }
      if (this.notificheSintesi().problema) {
        return { testo: 'da verificare', breve: 'da verificare', tono: 'warning' };
      }
      if (this.quantitaFerme() || this.coppieSenzaBase() > 0 || this.ordiniSenzaSede() > 0) {
        return { testo: 'attivi, con limitazioni', breve: 'limitata', tono: 'warning' };
      }
      return { testo: 'attivi', breve: 'attiva', tono: 'success' };
    },
  );

  /** Le coppie che «Allinea» può sistemare: escluse quelle non stoccate nella location. */
  protected readonly coppieDaAllineare = computed(
    () =>
      this.situazione().problemi.filter(
        (p) => p.tipo === 'coppia' && p.causa !== 'coppia_non_stoccata',
      ).length,
  );

  /**
   * I quattro flussi automatici, ognuno con il SUO stato e il perché: attivo,
   * limitato da un problema (con il rimando), sospeso, da verificare. Letti dai
   * dati già presenti — connessione, notifiche, problemi — senza un motore nuovo.
   */
  protected readonly flussi = computed((): readonly FlussoAutomatico[] => {
    const sospesi = !this.connection()?.autoSyncEnabled;
    const truth = this.webhookTruth();
    const comune = (
      id: FlussoAutomatico['id'],
      nome: string,
      direzione: string,
      descrizione: string,
    ): FlussoAutomatico => {
      if (sospesi) {
        return {
          id,
          nome,
          direzione,
          descrizione,
          stato: 'sospeso',
          tono: 'neutral',
          dettaglio: 'gli aggiornamenti automatici sono sospesi: riattivali qui sotto',
        };
      }
      // ⭐ Una notifica mancante ferma il SUO flusso, non tutti e quattro: le
      //    notifiche degli ordini non c'entrano con clienti e catalogo. L'indirizzo
      //    sbagliato invece li riguarda tutti.
      if (truth.known && truth.addressWrong) {
        return {
          id,
          nome,
          direzione,
          descrizione,
          stato: 'da verificare',
          tono: 'warning',
          dettaglio: 'notifiche consegnate a un altro indirizzo',
          rimando: {
            etichetta: 'Vedi le notifiche',
            scheda: 'sincronizzazione',
            elemento: 'settings-shopify-notifiche',
          },
        };
      }
      const mancanti = truth.missingTopics.filter((topic) => flussoDellaNotifica(topic) === id);
      if (mancanti.length > 0) {
        return {
          id,
          nome,
          direzione,
          descrizione,
          stato: 'da verificare',
          tono: 'warning',
          dettaglio: `${mancanti.length === 1 ? 'notifica non registrata' : 'notifiche non registrate'}: ${mancanti.join(', ')}`,
          rimando: {
            etichetta: 'Vedi le notifiche',
            scheda: 'sincronizzazione',
            elemento: 'settings-shopify-notifiche',
          },
        };
      }
      return { id, nome, direzione, descrizione, stato: 'attivo', tono: 'success', dettaglio: '' };
    };
    const ordini = comune(
      'ordini',
      'Ordini',
      'Shopify → VestiFlow',
      'Ogni ordine aperto diventa un impegno nella sede assegnata da Shopify; alla spedizione lo scarico.',
    );
    const ordiniSenzaSede = this.ordiniSenzaSede();
    const quantita = comune(
      'quantita',
      'Quantità',
      'VestiFlow → Shopify',
      'A ogni movimento la quantità di VestiFlow viene inviata alla location collegata.',
    );
    const coppie = this.coppieDaAllineare();
    return [
      ordiniSenzaSede > 0 && ordini.stato === 'attivo'
        ? {
            ...ordini,
            stato: 'limitato',
            tono: 'warning',
            dettaglio: `${ordiniSenzaSede} ${ordiniSenzaSede === 1 ? 'ordine aperto' : 'ordini aperti'} senza sede: nessun impegno finché non viene collegata`,
            rimando: { etichetta: 'Vedi i problemi', scheda: 'problemi' },
          }
        : ordini,
      this.quantitaFerme() && quantita.stato === 'attivo'
        ? {
            ...quantita,
            stato: 'limitato',
            tono: 'warning',
            dettaglio: `l'invio delle quantità è sospeso: ${ordiniSenzaSede} ${ordiniSenzaSede === 1 ? 'ordine aperto' : 'ordini aperti'} senza sede`,
            rimando: { etichetta: 'Vedi i problemi', scheda: 'problemi' },
          }
        : coppie > 0 && quantita.stato === 'attivo'
          ? {
              ...quantita,
              stato: 'limitato',
              tono: 'warning',
              // «combinazioni variante/sede», non «articoli»: è la coppia che manca (13/09/2026).
              dettaglio: `${coppie} ${coppie === 1 ? 'combinazione variante/sede' : 'combinazioni variante/sede'} da allineare: la quantità non viene inviata`,
              rimando: { etichetta: 'Vedi i problemi', scheda: 'problemi' },
            }
          : quantita,
      comune(
        'catalogo',
        'Catalogo',
        'Shopify ⇄ VestiFlow, campo per campo',
        'Le modifiche a un articolo salgono al salvataggio; quelle fatte su Shopify arrivano con la notifica.',
      ),
      comune(
        'clienti',
        'Clienti',
        'Shopify → VestiFlow',
        'I clienti del negozio entrano in VestiFlow in sola lettura.',
      ),
    ];
  });

  // ── ESITI: per riga, con la data; una fotografia, mai un verdetto sull'oggi ──
  /** L'esito dell'ultimo comando, in sessione: compare sulla sua riga. */
  private readonly esitiComandi = signal<Record<'catalogo' | 'clienti' | 'ordini', string | null>>({
    catalogo: null,
    clienti: null,
    ordini: null,
  });
  protected readonly esitoCatalogo = computed(() => this.esitiComandi().catalogo);
  protected readonly esitoClienti = computed(() => this.esitiComandi().clienti);
  protected readonly esitoOrdini = computed(() => this.esitiComandi().ordini);
  private registraEsito(comando: 'catalogo' | 'clienti' | 'ordini', testo: string): void {
    this.esitiComandi.update((esiti) => ({
      ...esiti,
      [comando]: `${this.formatDateTime(new Date().toISOString())} — ${testo}`,
    }));
  }

  /**
   * L'ultimo «Allinea» PERSISTITO (l'allineamento dell'attivazione, o un allineamento
   * dopo): stato e numeri, con la data del tentativo. In sessione vince l'avanzamento.
   */
  protected readonly ultimoEsitoAllinea = computed(
    (): { stato: string; tono: TonoStato; testo: string } | null => {
      const esito = this.setup()?.esito;
      if (!esito) {
        return null;
      }
      const allinea = esito.attivazione?.base ?? esito.allinea;
      if (!allinea) {
        return null;
      }
      const quando = this.formatDateTime(esito.finishedAt ?? esito.startedAt);
      if (allinea.fermo) {
        return {
          stato: 'fermo',
          tono: 'warning',
          testo: `${quando} — nessuna quantità inviata: ${allinea.fermo.ordini.length} ${allinea.fermo.ordini.length === 1 ? 'ordine aperto' : 'ordini aperti'} senza sede (${allinea.fermo.ordini.join(', ')})`,
        };
      }
      const nonAllineate = allinea.nonAllineate;
      return {
        stato: nonAllineate > 0 ? 'con esclusi' : 'completato',
        tono: nonAllineate > 0 ? 'warning' : 'success',
        testo: `${quando} — ${allinea.allineate} allineati · ${allinea.giaAllineate} già uguali · ${nonAllineate} non allineati su ${allinea.totale}`,
      };
    },
  );

  /** Gli esiti nella scheda «Problemi ed esiti»: la prima connessione e l'ultimo Allinea. */
  protected readonly esiti = computed((): readonly EsitoOperazione[] => {
    const esiti: EsitoOperazione[] = [];
    const setup = this.setup();
    const e = setup?.esito;
    if (setup?.presente && setup.activatedAt) {
      const att = e?.attivazione;
      const ordini = att
        ? `${att.ordini.acquisiti} ordini aperti acquisiti${att.ordini.senzaSede > 0 ? `, ${att.ordini.senzaSede} senza sede` : ''}${att.ordini.falliti > 0 ? `, ${att.ordini.falliti} falliti` : ''}`
        : 'attivazione registrata';
      esiti.push({
        id: 'prima-connessione',
        nome: 'Prima connessione',
        quando: this.formatDateTime(setup.activatedAt),
        stato: e?.interruzione ? 'interrotta' : 'attivata',
        tono: e?.interruzione ? 'warning' : 'success',
        testo: `${ordini}${e?.catalogo ? ` · catalogo: ${e.catalogo.imported} importati, ${e.catalogo.failed} falliti` : ''}`,
        rimando: { etichetta: 'Vedi le tre fasi', scheda: 'prima-connessione' },
      });
    }
    const allinea = this.ultimoEsitoAllinea();
    if (allinea && e) {
      esiti.push({
        id: 'allinea',
        nome: 'Allinea giacenze su Shopify',
        quando: this.formatDateTime(e.finishedAt ?? e.startedAt),
        stato: allinea.stato,
        tono: allinea.tono,
        testo: allinea.testo.replace(/^[^—]+— /, ''),
        rimando: {
          etichetta: 'Vai all’operazione',
          scheda: 'operazioni',
          elemento: 'settings-shopify-sync-giacenze',
        },
      });
    }
    return esiti;
  });

  /** Le notifiche in una riga: il dettaglio con i nomi sta in «Sincronizzazione automatica». */
  protected readonly notificheSintesi = computed((): { testo: string; problema: boolean } => {
    if (!this.connection()?.autoSyncEnabled) {
      return { testo: 'aggiornamenti automatici non attivi', problema: true };
    }
    const truth = this.webhookTruth();
    if (!truth.known) {
      return { testo: 'attive, registrazione non ancora verificata', problema: false };
    }
    if (truth.addressWrong) {
      return { testo: 'consegnate a un altro indirizzo', problema: true };
    }
    if (truth.missingTopics.length > 0) {
      return {
        testo: `${truth.missingTopics.length} su ${truth.expectedCount} non registrate`,
        problema: true,
      };
    }
    return { testo: `attive, ${truth.registeredCount} registrate`, problema: false };
  });

  /**
   * L'azione di un problema RIMANDA alla scheda in cui si fa: le operazioni si
   * eseguono SOLO nella loro riga di «Operazioni manuali» (un punto di esecuzione
   * per «Allinea», col perimetro dichiarato — proprietario, 13/09/2026); sedi e
   * permessi stanno in «Connessione e sedi», le notifiche nella sincronizzazione.
   * ⛔ Niente parte dalla lettura della pagina, né da un problema.
   */
  protected onProblemaAzione(azione: ShopifySetupProblemaAzione): void {
    switch (azione.tipo) {
      case 'allinea':
        this.vaiAllaScheda('operazioni', 'settings-shopify-sync-giacenze');
        return;
      case 'importa_ordini':
        this.vaiAllaScheda('operazioni', 'settings-shopify-sync-ordini');
        return;
      case 'webhook':
        this.vaiAllaScheda('sincronizzazione', 'settings-shopify-notifiche');
        return;
      case 'permessi':
        this.vaiAllaScheda('connessione', 'settings-shopify-management');
        return;
      case 'sedi':
        this.vaiAllaScheda('connessione', 'settings-shopify-scelte-sedi');
        return;
      default:
        return;
    }
  }

  /**
   * Apre la scheda e, se indicato, porta all'elemento e lo EVIDENZIA per un
   * attimo: chi legge vede dove è arrivato. La scheda è nella rotta, quindi
   * le schede condivise si evidenziano da sole.
   */
  protected vaiAllaScheda(scheda: SchedaShopify, elemento?: string): void {
    void this.router.navigate(['/app/settings/shopify', scheda], {
      queryParamsHandling: 'preserve',
    });
    if (!elemento) {
      return;
    }
    if (this.evidenziaTimer) {
      clearTimeout(this.evidenziaTimer);
    }
    // La scheda si rende al prossimo giro: l'elemento esiste dopo.
    this.evidenziaTimer = setTimeout(() => {
      const bersaglio = document.getElementById(elemento);
      if (!bersaglio) {
        return;
      }
      if (bersaglio instanceof HTMLDetailsElement) {
        bersaglio.open = true;
      }
      bersaglio.scrollIntoView({ behavior: 'smooth', block: 'start' });
      bersaglio.classList.add('shopify-integration__evidenziato');
      this.evidenziaTimer = setTimeout(
        () => bersaglio.classList.remove('shopify-integration__evidenziato'),
        2400,
      );
    }, 0);
  }

  protected ricaricaSetup(): void {
    if (!this.canManageShopify()) {
      return;
    }
    this.shopifySetupService
      .stato()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (setup) => this.setup.set(setup),
        error: (err: unknown) => this.setupErrore.set(extractErrorMessage(err)),
      });
  }

  protected onSetupDirezione(direction: ShopifySetupDirection): void {
    this.comandoSetup(this.shopifySetupService.scegliDirezione(direction));
  }

  protected onSetupSede(scelta: ShopifySetupSedeScelta): void {
    this.comandoSetup(this.shopifySetupService.scegliSede(scelta.shopifyLocationId, scelta.scelta));
  }

  protected onSetupAnteprima(): void {
    this.comandoSetup(this.shopifySetupService.anteprima());
  }

  protected onSetupConferma(): void {
    this.comandoSetup(this.shopifySetupService.conferma());
  }

  protected onSetupIndietro(fase: 'scelte' | 'sedi'): void {
    this.comandoSetup(this.shopifySetupService.tornaA(fase));
  }

  /**
   * ⛔ L’attivazione dura più del timeout HTTP (misurato sul negozio vero il
   *    13/09/2026: 24 s — ordini, allineamento, webhook) e il client dichiarava
   *    «Operazione non riuscita» mentre il server aveva finito. Un timeout
   *    non è un fallimento: si rilegge lo stato dal server finché non dice
   *    «attivato», e non si invita a ripetere alla cieca.
   */
  protected onSetupAttiva(): void {
    if (this.setupBusy()) {
      return;
    }
    this.setupBusy.set(true);
    this.setupErrore.set(null);
    this.setupAttesa.set(null);
    this.shopifySetupService
      .attiva()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (setup) => {
          this.setup.set(setup);
          this.setupBusy.set(false);
          this.reloadConnection();
          this.dopoAttivazione(setup);
        },
        error: (err: unknown) => {
          if (err instanceof TimeoutError) {
            this.attendiAttivazione();
            return;
          }
          this.setupErrore.set(extractErrorMessage(err));
          this.setupBusy.set(false);
          this.ricaricaSetup();
        },
      });
  }

  /**
   * ⭐ Ad attivazione riuscita si apre la Sincronizzazione automatica: «prima
   *    dell'attivazione la prima scheda, dopo la seconda» (proprietario, 13/09/2026).
   *    La prima connessione resta consultabile nella sua scheda.
   */
  private dopoAttivazione(setup: ShopifySetupDto): void {
    if (setup.status === 'attivato') {
      this.vaiAllaScheda('sincronizzazione');
    }
  }

  /** Rilegge lo stato ogni 3 s, per al più 2 minuti, finché il percorso non è attivato. */
  private attendiAttivazione(): void {
    this.setupAttesa.set(
      'L’attivazione continua sul server: rileggo lo stato finché non è conclusa. Non ripetere il comando.',
    );
    timer(0, ATTESA_ATTIVAZIONE_MS)
      .pipe(
        take(ATTESA_ATTIVAZIONE_MAX_LETTURE),
        switchMap(() => this.shopifySetupService.stato()),
        takeWhile((setup) => setup.status !== 'attivato', true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (setup) => {
          this.setup.set(setup);
          if (setup.status === 'attivato') {
            this.setupAttesa.set(null);
            this.setupBusy.set(false);
            this.reloadConnection();
            this.dopoAttivazione(setup);
          }
        },
        error: (err: unknown) => {
          this.setupAttesa.set(null);
          this.setupErrore.set(extractErrorMessage(err));
          this.setupBusy.set(false);
        },
        complete: () => {
          if (this.setup()?.status !== 'attivato') {
            this.setupAttesa.set(null);
            this.setupErrore.set(
              'L’attivazione non risulta conclusa dopo due minuti: ricarica la pagina per leggere lo stato reale prima di ripetere.',
            );
            this.setupBusy.set(false);
          }
        },
      });
  }

  /** Un comando alla volta; lo stato che torna è quello intero del percorso. */
  private comandoSetup(comando: Observable<ShopifySetupDto>): void {
    if (this.setupBusy()) {
      return;
    }
    this.setupBusy.set(true);
    this.setupErrore.set(null);
    comando.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (setup) => {
        this.setup.set(setup);
        this.setupBusy.set(false);
        // Sedi create o collegate cambiano il resto delle Impostazioni.
        this.reloadConnection();
      },
      error: (err: unknown) => {
        this.setupErrore.set(extractErrorMessage(err));
        this.setupBusy.set(false);
        // L’API rifiuta con lo stato vero: si rilegge, invece di restare su quello vecchio.
        this.ricaricaSetup();
      },
    });
  }

  protected readonly connectionLoading = this.connectionStore.loading;
  protected readonly connectionError = this.connectionStore.error;
  protected readonly shopifyConnectable = this.connectionStore.connectable;
  protected readonly connection = this.connectionStore.connection;

  protected readonly connectLoading = signal(false);
  protected readonly disconnectLoading = signal(false);
  protected readonly syncLocationsLoading = signal(false);
  protected readonly syncWebhooksLoading = signal(false);
  protected readonly checkWebhooksLoading = signal(false);
  protected readonly registerMissingLoading = signal(false);
  protected readonly syncProductsLoading = signal(false);
  protected readonly syncCustomersLoading = signal(false);
  protected readonly syncOrdersLoading = signal(false);

  // ── Allinea giacenze: una pressione, blocchi automatici ─────────────
  protected readonly allineaInCorso = signal(false);
  protected readonly allineaAvanzamento = signal<AvanzamentoAllineamentoDto | null>(null);
  protected readonly allineaInterrotto = signal(false);
  protected readonly clearErrorsLoading = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly actionFeedback = signal<ActionFeedback | null>(null);
  protected readonly shopifyBanner = signal<ShopifyBanner | null>(null);

  /** Tono del banner d'esito OAuth: prima viveva in tre `[class.]` nel template. */
  protected readonly shopifyBannerTone = computed<'error' | 'success' | 'warning'>(() => {
    const banner = this.shopifyBanner();
    if (banner === 'error') return 'error';
    if (banner === 'connected-warn') return 'warning';
    return 'success';
  });

  protected readonly shopWizardOpen = signal(false);
  protected readonly shopWizardMode = signal<'change' | 'disconnect'>('change');

  private actionFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  /** L'evidenza del rimando: si spegne da sola, e alla distruzione del pannello. */
  private evidenziaTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly connectForm = this.fb.group({
    shop: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(255)],
    }),
  });

  protected readonly groupedShopifyScopes = computed(() => {
    const scopes = this.connection()?.scopes;
    return scopes?.length ? groupShopifyScopesForDisplay(scopes) : [];
  });

  protected readonly shopifyScopesSummary = computed(() => {
    const groups = this.groupedShopifyScopes();
    const total = this.connection()?.scopes?.length ?? 0;
    if (groups.length === 0) {
      return '';
    }
    const areasLabel = groups.length === 1 ? '1 area' : `${groups.length} aree`;
    const permissionsLabel = total === 1 ? '1 permesso' : `${total} permessi`;
    return `${areasLabel} · ${permissionsLabel}`;
  });

  /**
   * Quanto sappiamo davvero delle notifiche di questo negozio.
   *
   * `known` e' la distinzione su cui si gioca tutto: elenco vuoto perche' non abbiamo mai
   * guardato non e' la stessa cosa di elenco vuoto perche' non c'e' niente. E `addressWrong`
   * si accende SOLO su un `false` esplicito: un `null` significa «non confrontabile», e
   * segnalare per ignoranza sarebbe la stessa spia bugiarda con un colore nuovo.
   */
  protected readonly webhookTruth = computed(() => {
    const conn = this.connection();
    const known = conn?.webhookTopicsKnown === true;
    const missing = conn?.webhookMissingTopics ?? [];
    const registered = conn?.webhookTopics ?? [];

    return {
      known,
      registeredCount: registered.length,
      expectedCount: known ? registered.length + missing.length : 0,
      missingTopics: missing,
      addressWrong: conn?.webhookAddressMatchesConfigured === false,
      addressComparable: conn?.webhookAddressComparable !== false,
      address: conn?.webhookAddress ?? null,
      checkedAt: conn?.webhooksCheckedAt ?? null,
      lastEventAt: conn?.lastWebhookEventAt ?? null,
    };
  });

  protected readonly webhooksSetupStatus = computed((): SetupStatusItem => {
    const conn = this.connection();
    if (!conn?.autoSyncEnabled) {
      return {
        active: false,
        label: 'Aggiornamenti automatici non attivi',
        detail:
          'Premi «Attiva aggiornamenti automatici» per ricevere ordini, clienti, prodotti e giacenze da Shopify.',
      };
    }

    const truth = this.webhookTruth();

    // Non aver guardato non e' un allarme e non e' un via libera: e' una terza cosa, e va
    // detta. Prima di questa versione qui compariva «7 canali attivi» — un numero esatto
    // che descriveva un insieme che nessuno conosceva.
    if (!truth.known) {
      return {
        active: true,
        label: 'Aggiornamenti automatici attivi',
        detail:
          'Non sappiamo quali notifiche siano davvero registrate su Shopify: premi «Verifica ora».',
      };
    }

    // Due problemi veri insieme si dicono insieme. Prima qui c'era una catena di `if` con
    // uscita anticipata, e il primo ramo nascondeva gli altri: il nome del topic mancante
    // non compariva da nessuna parte perche' l'indirizzo vinceva sempre la gara.
    const problems: { readonly label: string; readonly detail: string }[] = [];

    if (truth.addressWrong) {
      problems.push({
        label: 'Le notifiche non arrivano qui',
        detail: `Su Shopify risultano registrate verso ${truth.address}, che non è l'indirizzo di questo ambiente: gli eventi vengono consegnati altrove.`,
      });
    }

    if (truth.missingTopics.length > 0) {
      problems.push({
        label:
          truth.missingTopics.length === 1
            ? 'Manca una notifica su Shopify'
            : `Mancano ${truth.missingTopics.length} notifiche su Shopify`,
        detail: `Non registrate: ${truth.missingTopics.join(', ')}. Gli eventi di questo tipo non arrivano e non lasciano traccia.`,
      });
    }

    const [firstProblem, ...otherProblems] = problems;
    if (firstProblem) {
      if (otherProblems.length === 0) {
        return {
          active: true,
          problem: true,
          label: firstProblem.label,
          detail: firstProblem.detail,
        };
      }

      // Una banda e' un SEGNALE, dimensionata per un colpo d'occhio: appena contiene un
      // elenco lungo smette di essere un segnale e diventa un documento che nessuno legge.
      // Oltre il tetto si dichiara quanti sono e si tronca dicendolo — mai in silenzio.
      const shown = problems.slice(0, MAX_PROBLEMS_IN_BANNER).map((entry) => entry.detail);
      const hidden = problems.length - shown.length;

      return {
        active: true,
        problem: true,
        label: `${problems.length} problemi sulle notifiche`,
        detail: '',
        problems:
          hidden > 0 ? [...shown, `e altri ${hidden}: vedi lo stato completo qui sotto.`] : shown,
      };
    }

    const partial = conn.lastError?.code === 'webhook_partial_registration';
    const countLabel = `${truth.registeredCount} notifiche su ${truth.expectedCount}`;

    return {
      active: true,
      partial,
      label: partial ? 'Aggiornamenti automatici parziali' : 'Aggiornamenti automatici attivi',
      detail: countLabel,
    };
  });

  /** Dichiarativo: si riporta il fatto, non si dà un giudizio sul tempo passato. */
  protected readonly lastWebhookEventLabel = computed(() => {
    const at = this.webhookTruth().lastEventAt;
    return at ? this.formatDateTime(at) : 'Nessun evento ricevuto finora';
  });

  /**
   * Il conteggio **e i nomi**. «7 su 8» manda a cercare quale sia l'ottavo; «manca
   * orders/cancelled» dice cosa. E sta qui, nei fatti sempre visibili, non dentro una banda
   * che deve prima vincere una gara di priorita' contro le altre segnalazioni.
   */
  protected readonly webhookTopicsLabel = computed(() => {
    const truth = this.webhookTruth();
    if (!truth.known) {
      return 'Non verificate';
    }

    const counted = `${truth.registeredCount} su ${truth.expectedCount}`;
    if (truth.missingTopics.length === 0) {
      return counted;
    }

    const verb = truth.missingTopics.length === 1 ? 'manca' : 'mancano';
    return `${counted} — ${verb} ${truth.missingTopics.join(', ')}`;
  });

  protected readonly webhookAddressLabel = computed(() => {
    const truth = this.webhookTruth();
    if (!truth.address) {
      return 'Non verificato';
    }
    // Detto, non taciuto: un confronto spento in silenzio e' peggio del falso allarme
    // che evita, perche' nessuno si accorge che non sta piu' controllando.
    return truth.addressComparable
      ? truth.address
      : `${truth.address} — confronto non possibile da questo ambiente`;
  });

  /**
   * Il pulsante di riparazione compare solo quando ha senso e solo quando e' sicuro.
   *
   * - **Mancanti nominati**: prima si verifica, poi si ripara. Nessun «registra» su una
   *   connessione di cui non sappiamo niente.
   * - **Indirizzo consegnabile**: da un ambiente locale la registrazione creerebbe
   *   sottoscrizioni verso `localhost` sul negozio vero, che si sommano alle buone invece
   *   di sostituirle (registro 1.7). Il server rifiuta comunque — questa e' la seconda
   *   linea, non l'unica: un pulsante che non si puo' premere e' meglio di uno che porta
   *   a un errore.
   */
  protected readonly canRegisterMissingWebhooks = computed(() => {
    const truth = this.webhookTruth();
    return truth.known && truth.missingTopics.length > 0 && truth.addressComparable;
  });

  protected readonly webhookCheckedAtLabel = computed(() => {
    const at = this.webhookTruth().checkedAt;
    return at ? this.formatDateTime(at) : 'Mai';
  });

  protected readonly autoSyncEnabled = computed(() => this.connection()?.autoSyncEnabled === true);

  protected readonly autoSyncButtonLabel = computed(() =>
    this.autoSyncEnabled()
      ? 'Disattiva aggiornamenti automatici'
      : 'Attiva aggiornamenti automatici',
  );

  protected readonly showPostConnectCta = computed(() => {
    const banner = this.shopifyBanner();
    return banner === 'connected' || banner === 'connected-warn';
  });

  protected readonly shopifyBulkSyncBusy = computed(
    () =>
      this.syncProductsLoading() ||
      this.syncCustomersLoading() ||
      this.syncOrdersLoading() ||
      // ⭐ Anche il controllo di allineamento occupa il canale: gli altri
      //    comandi restano spenti finché non finisce.
      this.allineaInCorso(),
  );

  /**
   * ⛔ **L’elenco NON si pagina, e non è una dimenticanza.** La regola decisa
   *    del progetto è «nessun tetto di righe: un elenco mostra TUTTE le righe»,
   *    e la ragione vale qui più che altrove — un elenco di anomalie che ne
   *    mostra venti su cinquecento non è verificabile, ed è proprio per
   *    guardarle tutte insieme che esiste. A contenere l’ingombro pensa il
   *    riquadro, che scorre.
   */
  /**
   * ⛔ **«Completo» lo dice il SERVER**, e solo per il blocco che ha chiuso il
   *    perimetro. Non si deduce dal fatto che la catena si è fermata.
   */
  protected readonly allineaCompleto = computed(
    () => !this.allineaInCorso() && this.allineaAvanzamento()?.completo === true,
  );

  /** ⛔ Interrotto: l’elenco che si vede è PARZIALE, e va detto. */
  protected readonly allineaIncompleto = computed(
    () => !this.allineaInCorso() && this.allineaInterrotto(),
  );

  // ── Le non allineate sul MOTORE comune (`docs/26` A3) ──────────────────
  // ⛔ Era un `<ul>`: con trecento righe cercare una sede o un motivo era
  //    scorrere. Colonne dal catalogo, filtri a valori su Sede e Motivo,
  //    ordinamento, card sotto `lg`. Colonne e Filtri stanno qui e non nel
  //    telaio: è un blocco delle Impostazioni, non un elenco.
  private readonly preferenzeColonne = inject(TableColumnPreferenceService);
  protected readonly vistaAllinea = SHOPIFY_ALLINEA_VIEW;
  /** Il pannello filtri condiviso (`docs/26` D1), aperto dal pulsante gemello. */
  protected readonly filtriAllineaAperti = signal(false);
  // ⛔ Assegnate nel costruttore, dopo `registerView`.
  protected readonly colonneAllinea: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  protected readonly ordineAllinea = signal<readonly DataTableSort[]>([]);

  protected readonly rigaAllineaId = (riga: CoppiaNonAllineataDto): string =>
    `${riga.variantId}·${riga.locationId}`;
  /** Il testo di ogni cella: è ciò che filtri, ordinamento e card leggono. */
  protected readonly testoAllinea = (riga: CoppiaNonAllineataDto, colonna: string): string => {
    switch (colonna) {
      case 'articolo':
        return riga.articolo;
      case 'variante':
        return riga.variante || riga.sku || riga.codiceArticolo || '—';
      case 'location':
        return riga.sede;
      case 'motivo':
        return etichettaMotivoAllineamento(riga.motivo);
      case 'dettaglio':
        return riga.dettaglio;
      default:
        return '';
    }
  };
  private readonly allineaFiltrate = createColumnFilters<CoppiaNonAllineataDto>({
    viewId: () => SHOPIFY_ALLINEA_VIEW,
    righe: () => this.allineaAvanzamento()?.nonAllineate ?? [],
    cellText: this.testoAllinea,
  });
  protected readonly sezioniAllinea = computed(
    (): readonly DataTableSection<CoppiaNonAllineataDto>[] => [
      {
        id: 'non-allineate',
        rows: ordinaPerColonne(this.allineaFiltrate(), this.ordineAllinea(), {
          cellText: this.testoAllinea,
        }),
      },
    ],
  );

  protected readonly showClearShopifyErrors = computed(() => {
    const conn = this.connection();
    if (!conn) {
      return false;
    }
    return conn.status === ShopifyConnectionStatus.Error || Boolean(conn.lastError);
  });

  protected readonly catalogReadScopeWarning = computed(() =>
    shopifyProductReadScopeWarning(this.connection()?.scopeDiagnostics),
  );

  protected readonly catalogScopeDiagnosticsDetail = computed(() =>
    shopifyScopeDiagnosticsDetail(this.connection()?.scopeDiagnostics),
  );

  /** Canali di vendita: un token vecchio va riautorizzato, e lo si dice prima. */
  protected readonly publicationsScopeWarning = computed(() =>
    shopifyPublicationsScopeWarning(this.connection()?.scopeDiagnostics),
  );

  constructor() {
    // Il percorso di prima connessione si legge ogni volta che il negozio risulta
    // collegato (anche al ritorno da OAuth): è l’API a dire se esiste o no.
    effect(() => {
      const collegato = this.connection()?.status === ShopifyConnectionStatus.Connected;
      if (collegato && this.canManageShopify()) {
        this.ricaricaSetup();
      }
    });

    this.preferenzeColonne.registerView(
      SHOPIFY_ALLINEA_VIEW,
      SHOPIFY_ALLINEA_COLUMN_DEFS,
      SHOPIFY_ALLINEA_COLUMN_PRESETS,
    );
    this.colonneAllinea = this.preferenzeColonne.visibleColumns(SHOPIFY_ALLINEA_VIEW);

    // ⭐ Senza segmento nella rotta si apre la scheda predefinita per lo stato, e la
    //    rotta viene allineata (`replaceUrl`): così `app-nav-tabs` evidenzia quella giusta
    //    e il ritorno dall'OAuth (`?shopify=…`) conserva la sua coda.
    // ⚠️ «auto» si sostituisce appena lo stato è NOTO: connessione letta, e — per chi la
    //    gestisce — percorso letto o fallito (con un'API che non lo porta lo stato è noto
    //    lo stesso: nessun percorso in corso). Prima, la scheda mostrata è già quella
    //    predefinita; la rotta la raggiunge senza ricreare la pagina.
    effect(() => {
      if (this.scheda() !== 'auto' || this.connectionLoading()) {
        return;
      }
      const percorsoIgnoto =
        this.canManageShopify() &&
        !this.shopifyConnectable() &&
        this.connectionError() === null &&
        this.setup() === null &&
        this.setupErrore() === null;
      if (percorsoIgnoto) {
        return;
      }
      void this.router.navigate(['/app/settings/shopify', this.schedaPredefinita()], {
        replaceUrl: true,
        queryParamsHandling: 'preserve',
      });
    });

    this.destroyRef.onDestroy(() => {
      if (this.actionFeedbackTimer) {
        clearTimeout(this.actionFeedbackTimer);
      }
      if (this.evidenziaTimer) {
        clearTimeout(this.evidenziaTimer);
      }
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const shopifyParam = params.get('shopify');
      if (shopifyParam === 'setup') {
        this.shopifyBanner.set('setup');
        this.reloadConnection();
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { shopify: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      } else if (
        shopifyParam === 'connected' ||
        shopifyParam === 'error' ||
        shopifyParam === 'disconnected'
      ) {
        this.handleShopifyOAuthReturn(shopifyParam);
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { shopify: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      } else if (shopifyParam === 'shop_change_blocked') {
        this.connectError.set(
          'Collegamento a un negozio diverso bloccato. Usa "Cambia negozio Shopify" per rimuovere i dati del negozio attuale.',
        );
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { shopify: null, from: null, to: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  protected reloadConnection(): void {
    this.connectionStore.reload();
  }

  private handleShopifyOAuthReturn(param: Exclude<ShopifyBanner, 'connected-warn'>): void {
    this.reloadConnection();

    // ⛔ Al ritorno da OAuth partiva la sincronizzazione delle sedi. Era
    // l'innesco peggiore dei tre: il primo collegamento è il momento in cui
    // l'abbinamento automatico per nome fa il danno che la regola esiste per
    // impedire — tre sedi più tre location diventano sei, e disfarlo dopo è
    // molto più difficile che non farlo (registro difetti 3.14).
    //
    // L'aggancio è una scelta dell'operatore: si fa dal pulsante, quando lo
    // decide lui. Finché la procedura di prima sincronizzazione non esiste,
    // questo è il posto dove quella scelta si esercita.
    this.locationsChanged.emit();

    if (param === 'connected') {
      this.shopifyConnectionService
        .getConnection()
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (connection) => {
            this.shopifyBanner.set(connection.lastError ? 'connected-warn' : 'connected');
          },
          error: () => {
            this.shopifyBanner.set('connected');
          },
        });
      return;
    }

    if (param === 'disconnected') {
      this.shopifyBanner.set('disconnected');
      return;
    }

    // OAuth callback con ?shopify=error: verifica se la connessione e' comunque attiva.
    this.shopifyConnectionService
      .getConnection()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (connection) => {
          if (connection.status === ShopifyConnectionStatus.Connected) {
            this.shopifyBanner.set(connection.lastError ? 'connected-warn' : 'connected');
          } else {
            this.shopifyBanner.set('error');
          }
        },
        error: () => {
          this.shopifyBanner.set('error');
        },
      });
  }

  protected connectShopify(): void {
    if (this.connectForm.invalid || this.connectLoading()) {
      this.connectForm.markAllAsTouched();
      return;
    }

    this.connectError.set(null);
    this.connectLoading.set(true);

    this.shopifyConnectionService
      .beginAuth(normalizeShopDomainInput(this.connectForm.controls.shop.value))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ authorizeUrl }) => {
          window.location.assign(authorizeUrl);
        },
        error: (err: unknown) => {
          this.connectLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  protected disconnectShopify(): void {
    if (this.disconnectLoading()) {
      return;
    }

    this.disconnectLoading.set(true);
    this.connectError.set(null);

    this.shopifyConnectionService
      .disconnect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.disconnectLoading.set(false);
          this.shopifyBanner.set('disconnected');
          this.reloadConnection();
          this.locationsChanged.emit();
        },
        error: (err: unknown) => {
          this.disconnectLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  protected openShopChangeWizard(): void {
    this.shopWizardMode.set('change');
    this.shopWizardOpen.set(true);
  }

  protected openDisconnectPurgeWizard(): void {
    this.shopWizardMode.set('disconnect');
    this.shopWizardOpen.set(true);
  }

  protected onShopWizardCompleted(): void {
    this.shopifyBanner.set('disconnected');
    this.reloadConnection();
    this.locationsChanged.emit();
  }

  protected syncShopifyProducts(): void {
    if (this.syncProductsLoading() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.syncProductsLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncProductsLoading.set(false);
          this.reloadConnection();
          const feedback = formatShopifyProductsSyncFeedback(result);
          this.showActionFeedback(feedback);
          this.registraEsito('catalogo', feedback.message);
        },
        error: (err: unknown) => {
          this.syncProductsLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
          this.registraEsito('catalogo', `non riuscita: ${extractErrorMessage(err)}`);
        },
      });
  }

  /**
   * ALLINEA LE GIACENZE: una pressione, un controllo COMPLETO del perimetro.
   *
   * ⭐ **Chi preme non preme una seconda volta**: i blocchi si incatenano nel
   *    servizio, e qui si aggiorna l’avanzamento a ogni blocco.
   *
   * ⛔ **Se la catena si interrompe non si dichiara concluso niente**, e
   *    l’elenco mostrato viene marcato PARZIALE. Una pressione nuova riparte
   *    dal principio: è il comportamento voluto, non uno spreco.
   */
  protected allineaGiacenze(): void {
    if (this.allineaInCorso() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.allineaInCorso.set(true);
    this.allineaInterrotto.set(false);
    this.allineaAvanzamento.set(null);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .allineaDisponibilita()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (avanzamento) => this.allineaAvanzamento.set(avanzamento),
        error: (err: unknown) => {
          this.allineaInCorso.set(false);
          this.allineaInterrotto.set(true);
          this.connectError.set(extractErrorMessage(err));
        },
        complete: () => {
          this.allineaInCorso.set(false);
          // ⭐ «Allinea» cambia la SITUAZIONE (le coppie senza base la prendono): la
          //    scheda dei problemi e lo stato della sincronizzazione si rileggono
          //    subito, non alla prossima apertura della pagina. Visto sul collaudo
          //    il 13/09/2026: 82 → 7 sul server, «82» e «LIMITATA» a schermo.
          this.ricaricaSetup();
        },
      });
  }

  protected syncShopifyCustomers(): void {
    if (this.syncCustomersLoading() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.syncCustomersLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncCustomers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncCustomersLoading.set(false);
          this.reloadConnection();
          const feedback = formatShopifyCustomersSyncFeedback(result);
          this.showActionFeedback(feedback);
          this.registraEsito('clienti', feedback.message);
        },
        error: (err: unknown) => {
          this.syncCustomersLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
          this.registraEsito('clienti', `non riuscita: ${extractErrorMessage(err)}`);
        },
      });
  }

  protected syncShopifyOrders(): void {
    if (this.syncOrdersLoading() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.syncOrdersLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncOrdersLoading.set(false);
          this.reloadConnection();
          const feedback = formatShopifyOrdersSyncFeedback(result);
          this.showActionFeedback(feedback);
          this.registraEsito('ordini', feedback.message);
        },
        error: (err: unknown) => {
          this.syncOrdersLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
          this.registraEsito('ordini', `non riuscita: ${extractErrorMessage(err)}`);
        },
      });
  }

  protected syncShopifyLocations(): void {
    if (this.syncLocationsLoading()) {
      return;
    }

    this.syncLocationsLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncLocationsLoading.set(false);
          this.locationsChanged.emit();
          // Le location lette ora e le loro scelte si rileggono dall’API.
          this.ricaricaSetup();
          this.showActionFeedback({
            tone: 'success',
            message: formatLocationSyncFeedback(result, this.mustChooseLocations()),
          });
        },
        error: (err: unknown) => {
          this.syncLocationsLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  protected toggleAutoSync(): void {
    if (this.autoSyncEnabled()) {
      this.disableAutoSync();
      return;
    }
    this.enableAutoSync();
  }

  protected enableAutoSync(): void {
    if (this.syncWebhooksLoading()) {
      return;
    }

    this.syncWebhooksLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncWebhooks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncWebhooksLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatWebhooksFeedback(result));
        },
        error: (err: unknown) => {
          this.syncWebhooksLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  /**
   * Chiede a Shopify quali notifiche esistono davvero. Legge e basta: non registra e non
   * cancella niente sul negozio — a garantirlo e' il servizio lato server, che non ha fra
   * le dipendenze niente capace di farlo.
   */
  protected checkWebhooks(): void {
    if (this.checkWebhooksLoading()) {
      return;
    }

    this.checkWebhooksLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .checkWebhooks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.checkWebhooksLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatWebhookCheckFeedback(result));
        },
        error: (err: unknown) => {
          this.checkWebhooksLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  /**
   * Registra le notifiche mancanti e mostra l'esito **rimisurato**.
   *
   * Una sola chiamata: la risposta e' gia' il referto della rilettura, quindi l'operatore
   * non resta mai davanti allo stesso schermo di prima chiedendosi se ha funzionato.
   */
  protected registerMissingWebhooks(): void {
    if (this.registerMissingLoading()) {
      return;
    }

    this.registerMissingLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .registerMissingWebhooks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.registerMissingLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatWebhookCheckFeedback(result));
        },
        error: (err: unknown) => {
          this.registerMissingLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  protected disableAutoSync(): void {
    if (this.syncWebhooksLoading()) {
      return;
    }

    this.syncWebhooksLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .disableWebhooks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncWebhooksLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatDisableWebhooksFeedback(result));
        },
        error: (err: unknown) => {
          this.syncWebhooksLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  protected clearShopifyErrors(): void {
    if (this.clearErrorsLoading()) {
      return;
    }

    this.clearErrorsLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .clearErrors()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.clearErrorsLoading.set(false);
          this.reloadConnection();
          this.locationsChanged.emit();
          this.showActionFeedback(formatClearErrorsFeedback(result));
        },
        error: (err: unknown) => {
          this.clearErrorsLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  protected dismissActionFeedback(): void {
    this.clearActionFeedback();
  }

  protected dismissBanner(): void {
    this.shopifyBanner.set(null);
  }

  private showActionFeedback(feedback: ActionFeedback): void {
    this.clearActionFeedback();
    this.actionFeedback.set(feedback);
    this.actionFeedbackTimer = setTimeout(() => {
      this.actionFeedback.set(null);
      this.actionFeedbackTimer = null;
    }, ACTION_SUCCESS_DISMISS_MS);
  }

  private clearActionFeedback(): void {
    if (this.actionFeedbackTimer) {
      clearTimeout(this.actionFeedbackTimer);
      this.actionFeedbackTimer = null;
    }
    this.actionFeedback.set(null);
  }
}

function extractErrorMessage(err: unknown): string {
  return isAppError(err) ? err.message : 'Operazione non riuscita. Riprova.';
}

function formatLocationSyncFeedback(
  result: ShopifySyncLocationsDto,
  mustChooseLocations: boolean,
): string {
  if (result.totalCount === 0) {
    return 'Sync completata: nessuna location trovata su Shopify.';
  }

  const parts: string[] = [];

  if (result.importedCount > 0) {
    parts.push(
      result.importedCount === 1
        ? '1 location importata da Shopify'
        : `${result.importedCount} location importate da Shopify`,
    );
  }

  if (result.matchedCount > 0) {
    parts.push(
      result.matchedCount === 1
        ? '1 location collegata'
        : `${result.matchedCount} location collegate`,
    );
  }

  if (parts.length === 0) {
    return 'Sync completata: nessuna modifica alle location.';
  }

  const base = `${parts.join(', ')} (${result.totalCount} sedi su Shopify).`;
  if (result.autoLicensed) {
    return `${base} La sede unica è stata attivata automaticamente nel piano.`;
  }
  if (mustChooseLocations) {
    return `${base} Seleziona le sedi da attivare in VestiFlow.`;
  }
  return base;
}

function formatClearErrorsFeedback(result: ShopifyClearErrorsDto): ActionFeedback {
  const parts: string[] = ['Connessione Shopify ripristinata'];

  if (result.productsReset > 0) {
    parts.push(
      result.productsReset === 1
        ? '1 prodotto ripristinato'
        : `${result.productsReset} prodotti ripristinati`,
    );
  }

  if (result.locationsReset > 0) {
    parts.push(
      result.locationsReset === 1
        ? '1 location ripristinata'
        : `${result.locationsReset} location ripristinate`,
    );
  }

  return { tone: 'success', message: `${parts.join('. ')}.` };
}

function formatDisableWebhooksFeedback(result: ShopifyDisableWebhooksDto): ActionFeedback {
  if (result.failed.length > 0) {
    return {
      tone: 'warning',
      message:
        'Aggiornamenti automatici disattivati in VestiFlow. Alcuni webhook potrebbero restare su Shopify: riprova se necessario.',
    };
  }

  return {
    tone: 'success',
    message:
      result.deletedCount === 1
        ? 'Aggiornamenti automatici disattivati.'
        : `Aggiornamenti automatici disattivati (${result.deletedCount} canali rimossi).`,
  };
}

/**
 * L'esito della verifica in una riga. Nomina i mancanti invece di contarli: «ne mancano 1»
 * manda a cercare, «manca orders/cancelled» dice cosa fare.
 */
function formatWebhookCheckFeedback(result: ShopifyWebhookCheckDto): ActionFeedback {
  // Si raccolgono TUTTI i rilievi e si dicono insieme. La versione precedente usciva al
  // primo, e il nome del topic mancante spariva ogni volta che c'era anche altro.
  const findings: string[] = [];

  if (result.addressMatchesConfigured === false) {
    findings.push(
      `risultano registrate verso ${result.observedAddress}, non verso questo ambiente`,
    );
  }

  if (result.missingTopics.length > 0) {
    const verb = result.missingTopics.length === 1 ? 'manca' : 'mancano';
    findings.push(`${verb} ${result.missingTopics.join(', ')}`);
  }

  if (result.totalSubscriptions === 0) {
    findings.push('su Shopify non risulta registrata nessuna notifica');
  }

  const others = result.otherAddresses.length;
  if (others > 0) {
    findings.push(
      `ce ne sono altre verso ${others === 1 ? 'un altro indirizzo' : `${others} altri indirizzi`}, residui che continuano a ricevere eventi`,
    );
  }

  if (findings.length === 0) {
    return {
      tone: 'success',
      message: `Verifica completata: ${result.topics.length} notifiche registrate, tutte verso questo ambiente.`,
    };
  }

  return { tone: 'warning', message: `Verifica completata: ${findings.join('; ')}.` };
}

function formatWebhooksFeedback(result: ShopifySyncWebhooksDto): ActionFeedback {
  const activeCount = result.registered.length + result.skipped.length;

  if (result.failed.length === 0) {
    return {
      tone: 'success',
      message:
        activeCount === 1
          ? 'Aggiornamenti automatici attivi su Shopify.'
          : `Aggiornamenti automatici attivi (${activeCount} canali).`,
    };
  }

  const failedTopics = result.failed.map((entry) => entry.topic).join(', ');
  if (activeCount > 0) {
    return {
      tone: 'warning',
      message: `Aggiornamenti parzialmente attivi: ${activeCount} canali ok. Non attivi: ${failedTopics}.`,
    };
  }

  return {
    tone: 'warning',
    message: `Aggiornamenti automatici non attivati per: ${failedTopics}.`,
  };
}
