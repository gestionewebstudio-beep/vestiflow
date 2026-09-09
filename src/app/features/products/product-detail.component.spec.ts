import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { CatalogOrigin } from '@core/models/catalog-origin.model';
import type { Product } from '@core/models/product.model';
import { ProductStatus } from '@core/models/product.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { VatCodeService } from '@core/services/vat-code.service';
import { ProductService } from '@domain/products/services/product.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';

import { ProductDetailComponent } from './product-detail.component';

/**
 * 26.2 · **il percorso del PULSANTE**, non solo il contratto dell'API.
 *
 * ⛔ **Quello che l'operatore legge dopo aver premuto «Sincronizza con Shopify»
 *    è l'unico esito che gli arriva davvero.** Le prove di integrazione
 *    dimostrano che il push risponde la verità; queste dimostrano che quella
 *    verità **compare a schermo** — e che i due modi di sbagliare non tornano:
 *
 * ```text
 *   parziale   NON deve dire «Sincronizzazione Shopify completata»
 *   rifiutato  NON deve dire «verifica connessione Shopify e permessi»
 * ```
 *
 * ⚠️ **I totali delle suite non coprono questo**: il messaggio si sceglie in un
 *    ramo che nessun'altra prova attraversa, e un ramo sbagliato non fallisce —
 *    mostra la frase di un altro caso.
 */

const ORA = '2026-09-09T10:00:00.000Z';

function utente(): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'titolare@example.com',
    displayName: 'Titolare',
    avatarUrl: null,
    role: UserRole.Owner,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    manualUnloadEnabled: true,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    // ⚠️ Il ruolo `Owner` porta già l'accesso pieno: i permessi espliciti sono
    //    quelli che servono a rendere la schermata, non a sbloccare il pulsante.
    permissions: [TenantPermission.SectionProducts, TenantPermission.CatalogManage],
    createdAt: ORA,
    updatedAt: ORA,
  };
}

function prodotto(shopify: Product['shopify']): Product {
  return {
    id: 'p1',
    tenantId: 't1',
    articleCode: 'ART-1',
    name: 'Maglia cotone',
    status: ProductStatus.Active,
    shopifySyncEnabled: true,
    catalogOrigin: CatalogOrigin.VestiFlow,
    options: [],
    shopify,
    createdAt: ORA,
    updatedAt: ORA,
  };
}

/**
 * Il dettaglio con i suoi servizi finti.
 *
 * ⭐ `getProductById` cambia risposta a ogni chiamata: la prima è la scheda di
 *    partenza, quelle dopo sono ciò che l'attesa in background rilegge. È così
 *    che si riproduce il flusso vero senza inventare un secondo percorso.
 */
async function apri(opzioni: {
  readonly schede: readonly Product[];
  readonly esitoSync: {
    readonly pushed: boolean;
    readonly outcome?: string;
    readonly reason?: string;
    readonly detail?: string;
    readonly followUpInBackground?: boolean;
  };
}) {
  let letture = 0;
  const getProductById = vi.fn(() => {
    const scheda = opzioni.schede[Math.min(letture, opzioni.schede.length - 1)]!;
    letture += 1;
    return of(scheda);
  });
  const syncProductToShopify = vi.fn(() => of(opzioni.esitoSync));

  const resa = await render(ProductDetailComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id: 'p1' })) },
      },
      { provide: AuthService, useValue: { currentUser: () => utente() } },
      // ⚠️ Serve al pannello dei fornitori collegati, che il dettaglio monta:
      //    senza, il componente non si costruisce e la prova fallisce altrove.
      {
        provide: APP_CONFIG,
        useValue: {
          production: false,
          appName: 'VestiFlow',
          apiBaseUrl: '',
          features: { barcodeScanner: false, shopify: true },
        },
      },
      { provide: VatCodeService, useValue: { list: () => of([]) } },
      { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
      {
        provide: ProductService,
        useValue: {
          getProductById,
          getProductVariants: () => of([]),
          syncProductToShopify,
        },
      },
    ],
  });
  // ⛔ **Il messaggio si legge dal SUO elemento, non da tutta la pagina.** La
  //    prima stesura cercava il testo con `screen.getByText` ed era verde per
  //    il motivo sbagliato: il pannello Shopify mostra a sua volta
  //    `shopify.lastError`, quindi la frase c'era comunque — anche senza che il
  //    pulsante avesse detto niente. Misurato il 09/09/2026.
  const messaggio = () =>
    resa.container.querySelector('.product-detail__sync-message')?.textContent?.trim() ?? '';
  return { syncProductToShopify, messaggio };
}

/**
 * ⚠️ **Timer VERI, non finti.** L'attesa in background è un `timer(2000, 2000)`
 *    dentro il componente: con i timer finti andrebbe fatta avanzare a mano da
 *    fuori, e la prova misurerebbe l'orchestrazione del test invece del
 *    comportamento. Due secondi di attesa reale sono il prezzo, e sono onesti.
 */
async function premiSincronizza(): Promise<void> {
  const utenteFinto = userEvent.setup();
  await utenteFinto.click(await screen.findByRole('button', { name: /Sincronizza con Shopify/i }));
}

describe('ProductDetailComponent — l’esito della sincronizzazione a schermo', () => {
  it('⛔ aggiornamento PARZIALE: mostra il motivo, non «completata»', async () => {
    // Il push parte in background (è ciò che risponde `enqueuePush`), poi la
    // scheda riletta porta lo stato e il motivo veri.
    const partenza = prodotto({ status: ShopifySyncStatus.Syncing });
    const dopoIlLavoro = prodotto({
      status: ShopifySyncStatus.OutOfSync,
      lastError:
        'Aggiornamento parziale: 1 variante/i non sono state inviate a Shopify perché il ' +
        'collegamento non è utilizzabile — SKU-M (collegamento_chiuso).',
    });
    const { messaggio } = await apri({
      schede: [partenza, dopoIlLavoro],
      esitoSync: { pushed: true, outcome: 'avviato', followUpInBackground: true },
    });

    await premiSincronizza();

    // ⭐ 1 · l'AVVIO si annuncia: il lavoro prosegue in background.
    expect(messaggio()).toMatch(/in corso/i);

    // ⭐ 2 · e quando finisce, il messaggio diventa il motivo vero.
    await waitFor(() => expect(messaggio()).toMatch(/non sono state inviate a Shopify/i), {
      timeout: 10_000,
      interval: 200,
    });
    // ⛔ NON dice che è andato tutto bene.
    expect(messaggio()).not.toMatch(/Sincronizzazione Shopify completata/i);
    // ⭐ La variante esclusa è riconoscibile per SKU, col motivo.
    expect(messaggio()).toContain('SKU-M (collegamento_chiuso)');
  }, 30_000);

  it('⛔ collegamento RIFIUTATO: mostra il motivo, non un problema di connessione', async () => {
    const { messaggio } = await apri({
      schede: [prodotto({ status: ShopifySyncStatus.OutOfSync })],
      esitoSync: {
        pushed: false,
        outcome: 'rifiutato',
        reason: 'collegamento_escluso',
        detail:
          "il collegamento con gid://shopify/Product/111 e' chiuso: gli aggiornamenti non " +
          "passano finche' non viene riagganciato con un'azione esplicita.",
      },
    });

    await premiSincronizza();

    await waitFor(() => expect(messaggio()).toMatch(/non viene riagganciato/i));
    // ⛔ Il messaggio di prima manderebbe l'operatore a controllare i permessi
    //    del canale, che non c'entrano niente.
    expect(messaggio()).not.toMatch(/verifica connessione Shopify e permessi/i);
    // ⛔ E non c'è nessun «in corso»: il rifiuto è immediato, niente attesa.
    expect(messaggio()).not.toMatch(/in corso/i);
  });

  it('⭐ e il messaggio della connessione resta per il caso che lo merita', async () => {
    const { messaggio } = await apri({
      schede: [prodotto({ status: ShopifySyncStatus.OutOfSync })],
      esitoSync: { pushed: false, outcome: 'saltato', reason: 'not_connected' },
    });

    await premiSincronizza();

    await waitFor(() => expect(messaggio()).toMatch(/verifica connessione Shopify e permessi/i));
  });
});
