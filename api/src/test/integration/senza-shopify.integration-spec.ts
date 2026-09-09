import { ConfigService } from '@nestjs/config';
import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminTenantsService } from '../../admin/admin-tenants.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { ShopifyOAuthService } from '../../shopify/shopify-oauth.service';
import { ShopifyShopIdentityService } from '../../shopify/shopify-shop-identity.service';
import { attendiBloccoCausatoDa, trattieniLaProssimaTransazione } from './concorrenza.util';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * K · **VestiFlow SENZA Shopify** — il vincolo che viene prima di tutti.
 *
 * > VestiFlow deve funzionare integralmente anche senza Shopify. Le modifiche
 * > all'integrazione non devono trasformarla in una dipendenza del gestionale.
 *
 * ⚠️ **Il tenant di prova ha DATI**, e non e' un dettaglio: un tenant vuoto non
 *    distingue «funziona senza Shopify» da «non fa niente». Qui si usa il
 *    tenant B della fixture — documenti, prodotti, movimenti — portato a
 *    profilo `gestionale` e ripulito dalle righe Shopify che la fixture crea.
 *
 * ⛔ **Nessuna chiamata al canale**: i client Shopify sono finti e, dove conta,
 *    la prova verifica che non vengano nemmeno interrogati.
 */
describe('VestiFlow senza Shopify (scenario K)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  /** Ripristini da eseguire a fine prova, in ordine inverso. */
  let daRipristinare: Array<() => void> = [];

  afterEach(() => {
    // ⛔ **Prima si smonta la strumentazione, poi tutto il resto.** Un
    //    `$transaction` sostituito e lasciato attivo raggiungerebbe le prove
    //    successive di questo file e degli altri: girano nello stesso processo.
    while (daRipristinare.length > 0) {
      daRipristinare.pop()!();
    }
    daRipristinare = [];
    vi.unstubAllGlobals();
  });

  /** Quante volte i client Shopify sono stati chiamati durante la prova. */
  let chiamateAlCanale: string[] = [];
  /** Che cosa succede MENTRE il callback sta parlando con Shopify. */
  let duranteLaChiamata: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    chiamateAlCanale = [];
    duranteLaChiamata = null;

    // ── Il tenant B diventa un cliente di solo gestionale ──────────────────
    await prisma.tenant.update({
      where: { id: IDS.tenantB },
      data: { channelProfile: 'gestionale' },
    });
    // ⚠️ La fixture gli mette un'identita' prodotto e una riga negozio: qui si
    //    tolgono, o il tenant «senza Shopify» non lo sarebbe davvero.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
        IDS.tenantB,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_variant_links WHERE tenant_id = $1::uuid`,
        IDS.tenantB,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_product_links WHERE tenant_id = $1::uuid`,
        IDS.tenantB,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_variant_identities WHERE tenant_id = $1::uuid`,
        IDS.tenantB,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_product_identities WHERE tenant_id = $1::uuid`,
        IDS.tenantB,
      );
    });
    await prisma.shopifyShop.deleteMany({ where: { tenantId: IDS.tenantB } });

    // ── I DATI locali del tenant, che sono il punto della prova ────────────
    //
    // ⚠️ La fixture gli da` un documento ma nessun articolo: senza catalogo,
    //    «il gestionale funziona senza Shopify» non lo dimostrerebbe nessuno.
    await prisma.product.create({
      data: {
        tenantId: IDS.tenantB,
        name: 'Articolo solo gestionale',
        articleCode: 'SG-1',
        variants: {
          create: [
            { tenantId: IDS.tenantB, sku: 'SG-1-M', optionValues: { Taglia: 'M' }, sellingPriceMinor: 2500 },
            { tenantId: IDS.tenantB, sku: 'SG-1-L', optionValues: { Taglia: 'L' }, sellingPriceMinor: 2500 },
          ],
        },
      },
    });
  });

  /** Il servizio OAuth con Prisma vero: i client del canale contano le chiamate. */
  function creaOAuth() {
    const conta = (nome: string) => {
      chiamateAlCanale.push(nome);
    };
    const config = {
      apiKey: 'chiave',
      apiSecret: 'segreto',
      apiVersion: '2026-07',
      callbackUrl: 'https://app.test/callback',
      frontendUrl: 'https://app.test',
      scopes: 'read_products',
      requestedScopes: ['read_products'],
      webhookUrl: null,
      normalizeShopDomain: (valore: string) => valore,
    };
    return new ShopifyOAuthService(
      prisma as never,
      config as never,
      { encrypt: () => 'cifrato', isConfigured: () => true } as never,
      {
        assertConfigured: () => conta('assertConfigured'),
        getAccessScopes: async () => {
          conta('getAccessScopes');
          return ['read_products'];
        },
        getShop: async () => {
          conta('getShop');
          // ⭐ Un gancio per far accadere qualcosa DURANTE la chiamata remota:
          //    e` la finestra fra la guardia di profilo e la transazione, e
          //    senza un gancio non la si potrebbe colpire in modo ripetibile.
          if (duranteLaChiamata) {
            await duranteLaChiamata();
          }
          return { name: 'Negozio di prova' };
        },
      } as never,
      { recordSetupWarning: async () => undefined, clearSetupStatus: async () => undefined } as never,
      { syncFromShopify: async () => ({ created: 0, updated: 0 }) } as never,
      {
        getShopIdentity: async () => {
          conta('getShopIdentity');
          return { shopGid: 'gid://shopify/Shop/9990001', myshopifyDomain: null };
        },
      } as never,
      new ShopifyShopIdentityService() as never,
    );
  }

  /** Le righe Shopify di un tenant, tutte insieme. */
  async function righeShopify(tenantId: string) {
    return {
      negozi: await prisma.shopifyShop.count({ where: { tenantId } }),
      connessioni: await prisma.shopifyConnection.count({ where: { tenantId } }),
      credenziali: await prisma.shopifyCredential.count({ where: { tenantId } }),
      stati: await prisma.shopifyOAuthState.count({ where: { tenantId } }),
      identitaProdotto: await prisma.shopifyProductIdentity.count({ where: { tenantId } }),
    };
  }

  // ── K7 · un tenant `gestionale` non puo' avviare OAuth ────────────────────

  it('K7a · il tenant `gestionale` NON puo` avviare il collegamento, e lo dice', async () => {
    const oauth = creaOAuth();

    await expect(oauth.beginAuth(IDS.tenantB, 'prova.myshopify.com')).rejects.toThrow(
      /non è disponibile/i,
    );
  });

  it('K7b · il rifiuto arriva PRIMA di qualunque cosa: nessuna riga, nessuna chiamata', async () => {
    // ⛔ **L'ordine conta.** La guardia di profilo e' la prima riga di
    //    `beginAuth`, prima della configurazione del canale e prima dello stato
    //    OAuth: un rifiuto che arrivasse dopo lascerebbe righe dietro di se'.
    const prima = await righeShopify(IDS.tenantB);
    const oauth = creaOAuth();

    await expect(oauth.beginAuth(IDS.tenantB, 'prova.myshopify.com')).rejects.toThrow();

    expect(await righeShopify(IDS.tenantB)).toEqual(prima);
    expect(await righeShopify(IDS.tenantB)).toEqual({
      negozi: 0,
      connessioni: 0,
      credenziali: 0,
      stati: 0,
      identitaProdotto: 0,
    });
    // ⭐ **Nessuna chiamata al canale**: nemmeno `assertConfigured`.
    expect(chiamateAlCanale).toEqual([]);
  });

  it('K7c · il tenant con profilo `shopify` invece PUO`: la guardia non blocca tutti', async () => {
    // ⛔ Una guardia che rifiuta sempre sarebbe verde a K7a e K7b senza
    //    provare niente. Il tenant A ha profilo Shopify e deve passare.
    const oauth = creaOAuth();

    const esito = await oauth.beginAuth(IDS.tenantA, 'prova.myshopify.com');

    expect(esito.authorizeUrl).toContain('prova.myshopify.com/admin/oauth/authorize');
    expect(await prisma.shopifyOAuthState.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
  });

  /**
   * Il cambio di profilo canale dal PERCORSO AMMINISTRATIVO VERO.
   *
   * ⛔ **Non una copia della sequenza**: la corsa di `K7e` si decide proprio
   *    nell'ordine fra verifica e scrittura, che e` cio` che si vuole provare.
   *    Riscriverla qui vorrebbe dire collaudare la propria imitazione.
   */
  async function cambiaProfilo(
    tenantId: string,
    profilo: 'gestionale' | 'shopify',
  ): Promise<void> {
    const config = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    const admin = new AdminTenantsService(
      prisma as never,
      new SupabaseService(config),
      new PlatformAdminService(config),
      config,
      // ⚠️ Il licensing non c'entra col profilo canale, ma `getTenantById` ne
      //    legge il riepilogo per comporre la risposta: serve uno stub, o la
      //    prova fallirebbe DOPO aver fatto la cosa giusta.
      {
        getSummary: async () => ({
          licensedLocationCount: 1,
          licensedLocationActiveCount: 1,
          locationSelectionLocked: false,
          locationSelectionChangeGranted: false,
          canChangeLicensedLocations: true,
        }),
      } as never,
      { invalidateProfile: () => undefined } as never,
      { invalidate: () => undefined } as never,
      new PlatformAuditService(prisma as never, prisma as never),
    );
    await admin.updateTenant(tenantId, { channelProfile: profilo } as never);
  }

  /** Avvia il collegamento e restituisce lo stato OAuth pendente. */
  async function avviaCollegamento(tenantId: string): Promise<string> {
    const avvio = await creaOAuth().beginAuth(tenantId, 'prova.myshopify.com');
    return new URL(avvio.authorizeUrl).searchParams.get('state')!;
  }

  /** Lo scambio del token: l'unica cosa simulata: il resto e` il database. */
  function fingiScambioToken(): void {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ access_token: 't', scope: 'read_products' }),
    }));
  }

  it('K7d · uno stato OAuth pendente NON sopravvive al passaggio a `gestionale`', async () => {
    // ⛔ **Era una lacuna misurata l'08/09/2026** (`DA-FARE` §23), e chiusa lo
    //    stesso giorno su autorizzazione del proprietario. Il profilo si
    //    controllava solo in `beginAuth`, e fra i due passaggi resta una
    //    finestra: il cambio profilo e' consentito finche' non c'e' una
    //    connessione attiva, quindi lo stato pendente restava valido e il
    //    collegamento si completava — un tenant `gestionale` con negozio,
    //    connessione e credenziale Shopify.
    //
    // ⭐ **Questa prova torna ROSSA se il collegamento vietato ridiventa
    //    possibile.**
    await prisma.tenant.update({
      where: { id: IDS.tenantB },
      data: { channelProfile: 'shopify' },
    });
    const stato = await avviaCollegamento(IDS.tenantB);

    // Il titolare cambia idea: niente ecommerce.
    await prisma.tenant.update({
      where: { id: IDS.tenantB },
      data: { channelProfile: 'gestionale' },
    });

    fingiScambioToken();
    chiamateAlCanale = [];
    const url = await creaOAuth().handleCallback({
      code: 'c',
      state: stato,
      shop: 'prova.myshopify.com',
    });

    expect(url).toContain('shopify=channel_not_enabled');
    // ⛔ Niente negozio, niente connessione, niente credenziali.
    expect(await righeShopify(IDS.tenantB)).toEqual({
      negozi: 0,
      connessioni: 0,
      credenziali: 0,
      stati: 1,
      identitaProdotto: 0,
    });
    // ⭐ **Il rifiuto arriva PRIMA delle chiamate a Shopify**: nessuna lettura
    //    di identita`, nessun `shop.json`, nessuno scope.
    expect(chiamateAlCanale).toEqual(['assertConfigured']);
  });

  it('K7e · cambio di profilo CONCORRENTE al completamento: nessuna connessione nuova', async () => {
    // ⛔ **Il controllo prima delle chiamate non basta da solo**: fra quello e
    //    il salvataggio ci sono due chiamate remote, cioe` tutto il tempo che
    //    serve al titolare per cambiare profilo. La transazione rilegge il
    //    profilo, e con `Serializable` quella lettura e` anche una
    //    prenotazione: un cambio che si intrometta dopo fa fallire una delle
    //    due transazioni.
    //
    // ⭐ **Percorsi applicativi reali**: il collegamento passa dal callback
    //    vero, e il cambio profilo da un `update` sulla stessa riga.
    await prisma.tenant.update({
      where: { id: IDS.tenantB },
      data: { channelProfile: 'shopify' },
    });
    const stato = await avviaCollegamento(IDS.tenantB);
    fingiScambioToken();

    // Le due cose partono insieme.
    const collegamento = creaOAuth().handleCallback({
      code: 'c',
      state: stato,
      shop: 'prova.myshopify.com',
    });
    collegamento.catch(() => undefined);
    // ⭐ **Il cambio passa dal percorso REALE**, non da un `update` diretto: e`
    //    `assertTenantChannelProfileChangeAllowed` a decidere se si puo`
    //    cambiare, e rifiuta quando una connessione e` attiva. Scavalcarla in
    //    prova avrebbe verificato una corsa che nell'applicazione non esiste.
    const cambio = cambiaProfilo(IDS.tenantB, 'gestionale');
    cambio.catch(() => undefined);

    const esiti = await Promise.allSettled([collegamento, cambio]);
    const url = esiti[0].status === 'fulfilled' ? (esiti[0].value as string) : null;
    const erroreCambio = esiti[1].status === 'rejected' ? esiti[1].reason : null;

    // ⛔ **L'invariante, che vale comunque siano andate le due corse**: non
    //    esiste un tenant `gestionale` con una connessione Shopify nuova.
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantB } });
    const righe = await righeShopify(IDS.tenantB);
    if (tenant.channelProfile === 'gestionale') {
      // Il cambio ha vinto: il collegamento e` stato annullato per intero.
      expect(righe).toEqual({
        negozi: 0,
        connessioni: 0,
        credenziali: 0,
        stati: expect.any(Number),
        identitaProdotto: 0,
      });
      // ⚠️ **Due rifiuti possibili, ed entrambi vanno bene**, perche' dipende
      //    da DOVE cade la corsa:
      //
      //    `channel_not_enabled`   il cambio era gia` committato quando la
      //                            transazione ha letto il profilo
      //    `connection_conflict`   il cambio ha committato mentre la
      //                            transazione era aperta: PostgreSQL la fa
      //                            fallire con 40001 sul lock di riga
      //
      // ⭐ In entrambi i casi non e` stato scritto niente, e il messaggio non
      //    promette nulla di falso: riprovando, il secondo tentativo trova
      //    `gestionale` e risponde `channel_not_enabled`.
      expect(url).toMatch(/shopify=(channel_not_enabled|connection_conflict)/);
    } else {
      // ⛔ **Il collegamento ha vinto, e allora il cambio DEVE essere stato
      //    rifiutato — e per la ragione giusta.** Senza questa verifica il
      //    ramo sarebbe verde anche se il cambio fallisse per un motivo
      //    qualunque, e la corsa non sarebbe stata provata affatto.
      expect(url).toContain('shopify=connected');
      expect(righe.connessioni).toBe(1);
      expect(String(erroreCambio)).toMatch(/Disconnetti Shopify/i);
    }

    // ⭐ E in ogni caso non resta uno stato misto: connessione senza
    //    credenziale, o viceversa.
    expect(righe.connessioni).toBe(righe.credenziali);
  });

  it('K7g · il profilo cambia MENTRE il callback parla con Shopify: nessun collegamento', async () => {
    // ⛔ **La finestra che la guardia iniziale non copre.** Fra il controllo di
    //    profilo e il salvataggio ci sono due chiamate remote: se il cambio
    //    avviene li` in mezzo, il controllo iniziale ha gia` detto di si` e la
    //    transazione e` l'ultima occasione per accorgersene.
    //
    // ⚠️ **Il gancio rende il caso ripetibile**: senza, colpire quella finestra
    //    dipenderebbe dai tempi di rete, cioe` non si proverebbe mai.
    await prisma.tenant.update({
      where: { id: IDS.tenantB },
      data: { channelProfile: 'shopify' },
    });
    const stato = await avviaCollegamento(IDS.tenantB);
    fingiScambioToken();
    duranteLaChiamata = async () => {
      await cambiaProfilo(IDS.tenantB, 'gestionale');
    };

    const url = await creaOAuth().handleCallback({
      code: 'c',
      state: stato,
      shop: 'prova.myshopify.com',
    });

    expect(url).toContain('shopify=channel_not_enabled');
    expect(await righeShopify(IDS.tenantB)).toEqual({
      negozi: 0,
      connessioni: 0,
      credenziali: 0,
      stati: 1,
      identitaProdotto: 0,
    });
    // ⭐ Il cambio, quello si`, e` andato a buon fine: non c'era ancora nessuna
    //    connessione da proteggere.
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantB } });
    expect(tenant.channelProfile).toBe('gestionale');
  });

  it(
    'K7h · il cambio profilo ATTENDE il collegamento in corso, e poi lo rifiuta',
    async () => {
      // ⭐ **La prova deterministica del lato amministrativo.** Le altre due
      //    corse (`K7e`, `K7g`) sono governate dal caso: qui l'incrocio e`
      //    imposto, e si osserva esattamente la finestra che conta —
      //
      //      1. il callback ha SCRITTO la connessione ma non ha ancora
      //         committato: da fuori la connessione NON e` visibile;
      //      2. il cambio profilo parte proprio li` in mezzo, e la sua verifica
      //         — se fatta ora — direbbe «nessuna connessione, si puo` cambiare»;
      //      3. invece ASPETTA, perche` la riga del tenant e` bloccata;
      //      4. al commit trova la connessione attiva e RIFIUTA.
      //
      // ⛔ **Il difetto che questa prova sorveglia**: con la verifica fuori
      //    dalla transazione, il passo 2 decide su dati vecchi e il passo 4 non
      //    avviene — resta un cliente «Solo gestionale» con Shopify collegato.
      //
      // ⚠️ **Strumentazione confinata ai test**: la transazione si trattiene
      //    sostituendo `$transaction` sul client di prova. Nell'applicazione non
      //    esiste nessun gancio — un gancio operativo proverebbe il gancio.
      await prisma.tenant.update({
        where: { id: IDS.tenantB },
        data: { channelProfile: 'shopify' },
      });
      const stato = await avviaCollegamento(IDS.tenantB);
      fingiScambioToken();

      // ── 1 · il callback si ferma a scritture avvenute, prima del commit ──
      const trattenuta = trattieniLaProssimaTransazione(prisma, daRipristinare, {
        timeoutProva: 60_000,
      });
      const collegamento = creaOAuth().handleCallback({
        code: 'c',
        state: stato,
        shop: 'prova.myshopify.com',
      });
      collegamento.catch(() => undefined);
      const pidCollegamento = await trattenuta.pidPronto;

      let cambio: Promise<void> | undefined;
      let erroreOsservazione: unknown;
      try {
        // ⭐ **La premessa, verificata invece che supposta**: da fuori la
        //    connessione non si vede ancora. Se si vedesse, la prova non
        //    starebbe osservando la finestra che dichiara.
        expect(await prisma.shopifyConnection.count({ where: { tenantId: IDS.tenantB } })).toBe(0);

        // ── 2 · il cambio profilo parte adesso, dal percorso vero ──────────
        cambio = cambiaProfilo(IDS.tenantB, 'gestionale');
        cambio.catch(() => undefined);

        // ── 3 · e ASPETTA: bloccato PROPRIO dalla sessione del collegamento ─
        const bloccata = await attendiBloccoCausatoDa(prisma, pidCollegamento);
        expect(bloccata).not.toBe(pidCollegamento);
      } catch (caduta) {
        erroreOsservazione = caduta;
      }

      // ── 4 · il commit, e solo dopo si guarda l'esito ─────────────────────
      trattenuta.riprendi();
      const esiti = await Promise.allSettled([collegamento, cambio ?? Promise.resolve()]);
      if (erroreOsservazione !== undefined) {
        throw erroreOsservazione;
      }

      const url = esiti[0].status === 'fulfilled' ? (esiti[0].value as string) : null;
      expect(url).toContain('shopify=connected');

      // ⛔ **Il cambio e` rifiutato, e per la ragione giusta.**
      expect(esiti[1].status).toBe('rejected');
      expect(String(esiti[1].status === 'rejected' ? esiti[1].reason : '')).toMatch(
        /Disconnetti Shopify/i,
      );

      // ⭐ Lo stato finale: il cliente e` rimasto Shopify, e la connessione c'e`.
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantB } });
      expect(tenant.channelProfile).toBe('shopify');
      const righe = await righeShopify(IDS.tenantB);
      expect(righe.connessioni).toBe(1);
      expect(righe.credenziali).toBe(1);
      expect(righe.negozi).toBe(1);
    },
    30_000,
  );

  it('K7f · CONTROLLO · senza collegamento in corso, il cambio di profilo riesce', async () => {
    // ⛔ **Senza questa, `K7e` sarebbe verde anche con un cambio profilo che
    //    fallisce SEMPRE**: prenderebbe il ramo del collegamento riuscito e non
    //    proverebbe niente.
    await prisma.tenant.update({
      where: { id: IDS.tenantB },
      data: { channelProfile: 'shopify' },
    });

    await cambiaProfilo(IDS.tenantB, 'gestionale');

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: IDS.tenantB } });
    expect(tenant.channelProfile).toBe('gestionale');
  });

  // ── K6 · le operazioni locali non chiedono identita' ne' credenziali ──────

  it('K6a · i DATI del tenant senza Shopify sono intatti e leggibili', async () => {
    // ⚠️ Non e' una prova di funzionalita' (quelle sono le suite di dominio):
    //    e' il presupposto di tutte le altre — questo tenant HA dati, quindi
    //    «funziona senza Shopify» non significa «non fa niente».
    expect(await prisma.document.count({ where: { tenantId: IDS.tenantB } })).toBeGreaterThan(0);
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantB } })).toBeGreaterThan(0);
    expect(await righeShopify(IDS.tenantB)).toEqual({
      negozi: 0,
      connessioni: 0,
      credenziali: 0,
      stati: 0,
      identitaProdotto: 0,
    });
  });

  it('K6b · le scritture locali NON creano righe Shopify e non chiamano il canale', async () => {
    // ⛔ Il tenant A non deve essere sfiorato: si fotografa PRIMA, invece di
    //    dare per scontato quanto la fixture gli abbia messo dentro.
    const altroTenantPrima = await righeShopify(IDS.tenantA);

    const prodotto = await prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantB },
      include: { variants: true },
    });

    // Un giro di operazioni ordinarie: rinomina, prezzo, cestino e ripristino.
    await prisma.product.update({
      where: { id: prodotto.id },
      data: { name: `${prodotto.name} (rinominato)` },
    });
    const variante = prodotto.variants[0];
    if (variante) {
      await prisma.productVariant.update({
        where: { id: variante.id },
        data: { sellingPriceMinor: 1234 },
      });
    }
    await prisma.product.update({ where: { id: prodotto.id }, data: { deletedAt: new Date() } });
    await prisma.product.update({ where: { id: prodotto.id }, data: { deletedAt: null } });

    expect(await righeShopify(IDS.tenantB)).toEqual({
      negozi: 0,
      connessioni: 0,
      credenziali: 0,
      stati: 0,
      identitaProdotto: 0,
    });
    expect(chiamateAlCanale).toEqual([]);
    // ⛔ E il tenant A non e` stato sfiorato: le sue righe sono quelle di prima.
    expect(await righeShopify(IDS.tenantA)).toEqual(altroTenantPrima);
  });
});
