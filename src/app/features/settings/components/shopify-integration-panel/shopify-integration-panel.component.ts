import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';

import { isAppError } from '@core/models/app-error.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

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
  formatShopifyInventorySyncFeedback,
  formatShopifyOrdersSyncFeedback,
  formatShopifyProductsSyncFeedback,
} from '@domain/channels/shopify/models/shopify-sync-feedback.util';
import type {
  ShopifyClearErrorsDto,
  ShopifyDisableWebhooksDto,
  ShopifySyncLocationsDto,
  ShopifySyncWebhooksDto,
  ShopifyWebhookCheckDto,
} from '@domain/channels/shopify/models/shopify-sync.dto';
import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifyConnectionStore } from '@domain/channels/shopify/state/shopify-connection.store';

import type { SetupStatusItem } from '../../models/setup-status.model';

type ShopifyBanner = 'connected' | 'connected-warn' | 'error' | 'disconnected';

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
    BadgeComponent,
    ButtonComponent,
    ErrorStateComponent,
    InlineBannerComponent,
    ReactiveFormsModule,
    TableSkeletonComponent,
    ShopifyShopChangeWizardComponent,
  ],
  templateUrl: './shopify-integration-panel.component.html',
  styleUrl: './shopify-integration-panel.component.scss',
})
export class ShopifyIntegrationPanelComponent {
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly connectionStore = inject(ShopifyConnectionStore);
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
   * Stesso cancello che decide se il pannello viene montato: qui dentro e'
   * sempre vero, ma il template lo verifica comunque prima delle azioni che
   * scrivono — un pannello di sola lettura resta valido se un giorno lo si
   * mostrera' anche a chi non puo' gestire la connessione.
   */
  protected readonly canManageShopify = this.connectionStore.available;

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
  protected readonly syncInventoryLoading = signal(false);
  protected readonly syncCustomersLoading = signal(false);
  protected readonly syncOrdersLoading = signal(false);
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
      this.syncInventoryLoading() ||
      this.syncCustomersLoading() ||
      this.syncOrdersLoading(),
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
    this.destroyRef.onDestroy(() => {
      if (this.actionFeedbackTimer) {
        clearTimeout(this.actionFeedbackTimer);
      }
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const shopifyParam = params.get('shopify');
      if (
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
          this.showActionFeedback(formatShopifyProductsSyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncProductsLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
        },
      });
  }

  protected syncShopifyInventory(): void {
    if (this.syncInventoryLoading() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.syncInventoryLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncInventory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncInventoryLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatShopifyInventorySyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncInventoryLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
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
          this.showActionFeedback(formatShopifyCustomersSyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncCustomersLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
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
          this.showActionFeedback(formatShopifyOrdersSyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncOrdersLoading.set(false);
          this.connectError.set(extractErrorMessage(err));
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
