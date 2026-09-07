import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { ShopifyConnectionStatus, SupplierOrderStatus } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module';
import { ShopifyAdminClient } from '../../shopify/shopify-admin.client';
import { ShopifyLocationSyncService } from '../../shopify/shopify-location-sync.service';
import { ShopifyOAuthService } from '../../shopify/shopify-oauth.service';
import { ShopifyShopChangeService } from '../../shopify/shopify-shop-change.service';
import { creaClientIntegrazione } from './prisma';
import {
  DOMINIO_PROVA,
  P,
  RELAZIONI_SEDE,
  creaDataset,
  differenze,
  fotografa,
  svuotaTutto,
  type Fotografia,
} from './shopify-distruttivo.fixture';

/**
 * COLLAUDO DISTRUTTIVO SHOPIFY — servizi reali, PostgreSQL reale.
 *
 * ⭐ **Nessun mock del database e nessun mock dei servizi.** Il contesto Nest e'
 *    quello vero, i servizi sono quelli che gira l'API, e le scritture
 *    finiscono nel PostgreSQL del container. Un test a mock puo' dimostrare che
 *    una `deleteMany` non viene INVOCATA; solo un database vero dimostra che
 *    le righe ci sono ancora — e la differenza e' tutto il punto, perche' le
 *    cancellazioni che hanno fatto il danno erano in CASCATA, cioe' non
 *    invocate da nessuno.
 *
 * ⛔ **L'unica cosa sostituita e' il client HTTP verso Shopify.** Deve esserlo:
 *    il collaudo non deve toccare nessun negozio reale. Tutto cio' che sta
 *    sotto — servizio, PrismaService, transazioni, vincoli, cascate — e' vero.
 *
 * ⚠️ **La revoca del token non parte comunque**: `revokeShopifyAccessToken`
 *    esce senza chiamare nulla quando `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`
 *    mancano, e nel `.env` di questo worktree non ci sono.
 */
describe('Collaudo distruttivo Shopify (database reale)', () => {
  let prisma: PrismaClient;
  let contesto: INestApplicationContext;
  let oauth: ShopifyOAuthService;
  let cambioNegozio: ShopifyShopChangeService;
  let sincronizzaSedi: ShopifyLocationSyncService;
  let clienteAdmin: ShopifyAdminClient;

  beforeAll(async () => {
    prisma = creaClientIntegrazione();
    contesto = await NestFactory.createApplicationContext(AppModule, { logger: false });
    oauth = contesto.get(ShopifyOAuthService);
    cambioNegozio = contesto.get(ShopifyShopChangeService);
    sincronizzaSedi = contesto.get(ShopifyLocationSyncService);
    clienteAdmin = contesto.get(ShopifyAdminClient);
  });

  afterAll(async () => {
    await contesto?.close();
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    await svuotaTutto(prisma);
    await creaDataset(prisma);
    // Nessuna chiamata parte davvero: ogni metodo del client e' neutralizzato.
    vi.spyOn(clienteAdmin, 'listLocations').mockResolvedValue([]);
    vi.spyOn(clienteAdmin, 'listAllProducts').mockResolvedValue([]);
    vi.spyOn(clienteAdmin, 'listAllCustomers').mockResolvedValue([]);
    vi.spyOn(clienteAdmin, 'listAllOrders').mockResolvedValue([]);
    vi.spyOn(clienteAdmin, 'deleteWebhooksForAddress').mockResolvedValue({
      deletedCount: 0,
      failed: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Verifica che NIENTE del catalogo, dell'inventario e delle sedi sia
   * cambiato fra due fotografie.
   *
   * ⚠️ Elenca anche cio' che lo scenario non tocca: un difetto di questa
   *    famiglia si manifesta proprio come un effetto FUORI dal mestiere della
   *    funzione chiamata.
   */
  function attendiIntatti(prima: Fotografia, dopo: Fotografia, chiavi: readonly string[]): void {
    const mutate = chiavi.filter((c) => prima[c] !== dopo[c]);
    expect(
      mutate.map((c) => `${c}: ${String(prima[c])} → ${String(dopo[c])}`),
      `dati distrutti o scollegati:\n  ${differenze(prima, dopo).join('\n  ') || '(nessuna)'}`,
    ).toEqual([]);
  }

  /**
   * Esegue un'azione che PUO' essere rifiutata da una guardia di business, e
   * riporta come e' andata.
   *
   * ⭐ **Un rifiuto e' un esito legittimo, non un fallimento del test.** Le
   *    guardie che impediscono una purga incoerente — «per rimuovere i clienti
   *    includi anche gli ordini», «chiudi prima gli ordini fornitore aperti» —
   *    fanno il loro mestiere, e un collaudo che le trattasse da errore
   *    spingerebbe a toglierle.
   *
   * ⚠️ **Ma il rifiuto non esonera dalla verifica**: quello che conta e' che
   *    dopo il rifiuto non resti una cancellazione a meta'. La fotografia si
   *    confronta comunque.
   */
  async function esegui(azione: () => Promise<unknown>): Promise<string | null> {
    try {
      await azione();
      return null;
    } catch (errore: unknown) {
      return errore instanceof Error ? errore.message : String(errore);
    }
  }

  const CATALOGO = ['prodotti', 'varianti', 'prodottiCollegati', 'variantiCollegate'] as const;
  const INVENTARIO = [
    'movimenti',
    'giacenze',
    'giacenzaOnHand',
    'giacenzaCommitted',
    'sessioniConteggio',
    'righeConteggio',
    'lotti',
    'seriali',
    'statiSync',
  ] as const;
  const DOCUMENTI = ['documenti', 'righeDocumento', 'ordiniFornitore'] as const;
  const SEDI = [
    'sedi',
    'contatori',
    'dispositiviFiscali',
    'terminaliPos',
    'assegnazioniUtente',
    'ricevute',
    'sessioniCassa',
    'cambiDispositivo',
  ] as const;
  const SCOLLEGAMENTI = [
    'documentiSenzaSede',
    'documentiSenzaDestinazione',
    'ordiniVenditaSenzaSede',
    'ordiniFornitoreSenzaDestinazione',
    'movimentiSenzaDestinazione',
    'venditeOnlineSenzaSede',
    'utentiSenzaSedePredefinita',
    'documentiSenzaCliente',
    'ordiniVenditaSenzaCliente',
    'venditeOnlineSenzaCliente',
  ] as const;

  const TUTTO_CIO_CHE_RESTA = [
    ...CATALOGO,
    ...INVENTARIO,
    ...DOCUMENTI,
    ...SEDI,
    ...SCOLLEGAMENTI,
  ];

  /** Il dataset e' completo: se questa fallisce, ogni altra prova non prova niente. */
  it('scenario 0 · il dataset copre tutte e 21 le relazioni verso Location', async () => {
    const foto = await fotografa(prisma);
    expect(foto.sedi).toBe(4);
    expect(foto.prodotti).toBe(2);
    expect(foto.varianti).toBe(2);
    expect(foto.prodottiCollegati).toBe(1);
    expect(foto.movimenti).toBe(2);
    expect(foto.giacenze).toBe(1);
    expect(foto.impegniAttivi).toBe(1);
    expect(foto.clienti).toBe(2);
    expect(foto.ordiniVendita).toBe(2);
    expect(foto.ordiniFornitore).toBe(2);
    expect(foto.contatori).toBe(1);
    expect(foto.dispositiviFiscali).toBe(2); // un cambio nomina due dispositivi
    expect(foto.terminaliPos).toBe(1);
    expect(foto.assegnazioniUtente).toBe(1);

    // Nessun riferimento di SEDE e' gia' scollegato: le prove partono da zero.
    //
    // ⚠️ I tre scollegamenti da CLIENTE restano fuori: un trasferimento non ha
    //    un cliente per natura, quindi partono legittimamente da 1. A rilevarli
    //    e' il confronto prima/dopo di ogni scenario, non un valore iniziale.
    for (const chiave of SCOLLEGAMENTI.filter((c) => !c.includes('Cliente'))) {
      expect(foto[chiave], `${chiave} dovrebbe essere 0 nel dataset iniziale`).toBe(0);
    }

    // E ogni relazione dell'elenco punta davvero a SEDE_PIENA o e' creabile.
    expect(RELAZIONI_SEDE).toHaveLength(21);
  });

  it('scenario 1 · disconnessione normale non tocca dati locali', async () => {
    const prima = await fotografa(prisma);

    await oauth.disconnect(P.tenant);

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, TUTTO_CIO_CHE_RESTA);

    // Cio' che DEVE cambiare: la connessione si spegne e le sedi si scollegano.
    const connessione = await prisma.shopifyConnection.findUnique({ where: { tenantId: P.tenant } });
    expect(connessione?.status).toBe(ShopifyConnectionStatus.not_connected);
    expect(dopo.sediCollegate).toBe(0);
    // Le sedi restano tutte: perdono l'identificativo remoto, non l'esistenza.
    expect(dopo.sedi).toBe(prima.sedi);
  });

  it('scenario 2 · purge del solo catalogo è rifiutata e non tocca niente', async () => {
    const prima = await fotografa(prisma);

    await expect(
      cambioNegozio.purge(P.tenant, { confirmShopDomain: DOMINIO_PROVA, purgeCatalog: true, purgeCustomers: false, purgeOrders: false }),
    ).rejects.toThrow(/sospesa/i);

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, [...TUTTO_CIO_CHE_RESTA, 'clienti', 'ordiniVendita']);
  });

  it('scenario 3 · purge dei soli clienti non tocca inventario né sedi', async () => {
    // Un cliente con ordini non e' rimovibile: resta quello senza.
    const prima = await fotografa(prisma);

    const rifiuto = await esegui(() =>
      cambioNegozio.purge(P.tenant, {
        confirmShopDomain: DOMINIO_PROVA,
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: false,
      }),
    );

    /*
      ⭐ **Rifiutata, ed e' giusto cosi'.** Il cliente di prova ha ordini
         Shopify collegati: rimuoverlo senza rimuoverli lascerebbe ordini che
         nominano un cliente inesistente. La guardia esiste e funziona.
    */
    expect(rifiuto).toMatch(/includi anche gli ordini/i);

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, [...TUTTO_CIO_CHE_RESTA, 'clienti', 'ordiniVendita']);
  });

  it('scenario 4 · purge dei soli ordini non tocca inventario né sedi', async () => {
    // Con impegni attivi la purga deve fermarsi: e' la guardia introdotta dal
    // primo commit, e qui si prova contro il database vero.
    const prima = await fotografa(prisma);

    await expect(
      cambioNegozio.purge(P.tenant, {
        confirmShopDomain: DOMINIO_PROVA,
        purgeCatalog: false,
        purgeCustomers: false,
        purgeOrders: true,
      }),
    ).rejects.toThrow(/impegni/i);

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, [...TUTTO_CIO_CHE_RESTA, 'ordiniVendita', 'impegni']);
  });

  it('scenario 4-bis · chiusi gli impegni, la purga ordini non tocca comunque inventario né sedi', async () => {
    await prisma.stockReservation.updateMany({
      where: { tenantId: P.tenant },
      data: { status: 'released' },
    });
    const prima = await fotografa(prisma);

    const rifiuto = await esegui(() =>
      cambioNegozio.purge(P.tenant, {
        confirmShopDomain: DOMINIO_PROVA,
        purgeCatalog: false,
        purgeCustomers: false,
        purgeOrders: true,
      }),
    );

    /*
      ⭐ **Una seconda guardia, e anche questa funziona**: il dataset ha un
         ordine fornitore ancora aperto, e la purga si ferma. Che l'esito sia
         una riuscita o un rifiuto, quello che il collaudo verifica e' lo
         stesso: nulla di inventario, catalogo e sedi si muove.
    */
    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, TUTTO_CIO_CHE_RESTA);
    if (rifiuto !== null) {
      expect(rifiuto).toMatch(/ordini fornitore aperti/i);
    }
  });

  it('scenario 5 · purge di clienti e ordini insieme non tocca inventario né sedi', async () => {
    await prisma.stockReservation.updateMany({
      where: { tenantId: P.tenant },
      data: { status: 'released' },
    });
    const prima = await fotografa(prisma);

    const rifiuto = await esegui(() =>
      cambioNegozio.purge(P.tenant, {
        confirmShopDomain: DOMINIO_PROVA,
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    );

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, TUTTO_CIO_CHE_RESTA);
    if (rifiuto !== null) {
      expect(rifiuto).toMatch(/ordini fornitore aperti|includi anche gli ordini/i);
    }
  });

  it('scenario 6 · purge di tutte le categorie è rifiutata per il catalogo', async () => {
    const prima = await fotografa(prisma);

    await expect(
      cambioNegozio.purge(P.tenant, { confirmShopDomain: DOMINIO_PROVA, purgeCatalog: true, purgeCustomers: true, purgeOrders: true }),
    ).rejects.toThrow(/sospesa/i);

    // ⭐ Il rifiuto e' la PRIMA istruzione: nemmeno clienti e ordini vengono
    //    toccati, perche' la funzione non arriva a leggerli.
    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, [...TUTTO_CIO_CHE_RESTA, 'clienti', 'ordiniVendita', 'impegni']);
  });

  it('scenario 7 · cambio negozio: purga consentita più riconnessione altrove', async () => {
    await prisma.stockReservation.updateMany({
      where: { tenantId: P.tenant },
      data: { status: 'released' },
    });
    const prima = await fotografa(prisma);

    // Il wizard: si purga cio' che e' consentito, si disconnette, e ci si
    // collega a un negozio diverso che porta sedi sue.
    // La purga puo' essere rifiutata da una guardia: il cambio negozio
    // prosegue comunque, ed e' cio' che il collaudo deve seguire.
    await esegui(() =>
      cambioNegozio.purge(P.tenant, {
        confirmShopDomain: DOMINIO_PROVA,
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    );
    await oauth.disconnect(P.tenant);
    vi.mocked(clienteAdmin.listLocations).mockResolvedValue([
      { id: 7001, name: 'Sede del negozio nuovo', active: true },
    ] as never);
    await sincronizzaSedi.syncFromShopify(P.tenant, 'altro-negozio.myshopify.test', 'token');

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, [...CATALOGO, ...INVENTARIO, ...DOCUMENTI, ...SCOLLEGAMENTI]);

    /*
      ⭐ **La sede che porta dati sopravvive al cambio negozio**, e con lei
         contatori, dispositivi e terminali: è ciò che il collaudo deve
         garantire.

      ⛔ E nemmeno le sedi VUOTE spariscono: docs/24 §1.13.4 non fa eccezione
         per «era vuota».
    */
    for (const id of [P.sedePiena, P.sedeLocale, P.sedeVuota, P.sedeCavia]) {
      expect(
        await prisma.location.findUnique({ where: { id } }),
        `la sede ${id} e stata eliminata da un cambio negozio`,
      ).not.toBeNull();
    }
    expect(dopo.contatori).toBe(prima.contatori);
    expect(dopo.dispositiviFiscali).toBe(prima.dispositiviFiscali);
    expect(dopo.terminaliPos).toBe(prima.terminaliPos);
  });

  it('scenario 8 · una sede remota scomparsa NON porta via i dati locali', async () => {
    const prima = await fotografa(prisma);

    // Il catalogo remoto non contiene piu' 9001 (SEDE_PIENA) ne' 9004 (cavia).
    vi.mocked(clienteAdmin.listLocations).mockResolvedValue([
      { id: 9002, name: 'Sede Shopify vuota', active: true },
    ] as never);

    await sincronizzaSedi.syncFromShopify(P.tenant, DOMINIO_PROVA, 'token');

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, [...CATALOGO, ...INVENTARIO, ...DOCUMENTI, ...SCOLLEGAMENTI]);

    /*
      ⛔ **La sede resta OPERATIVA e COLLEGATA.** docs/24 §1.13.3: una location
         scomparsa da Shopify non elimina, archivia o disattiva automaticamente
         la sede VestiFlow.

      ⚠️ **E non si scollega nemmeno.** Finche' non esiste
         `shopify_location_links`, azzerare `shopifyLocationId` cancella
         l'unica traccia del collegamento: «non e' mai stato collegato» e «il
         collegamento si e' chiuso» diventerebbero indistinguibili — ed e'
         esattamente la differenza su cui si regge il divieto di riaggancio
         automatico. Il comportamento provvisorio e' conservativo.
    */
    const piena = await prisma.location.findUnique({ where: { id: P.sedePiena } });
    expect(piena, 'SEDE_PIENA non deve essere cancellata').not.toBeNull();
    expect(piena?.isActive, 'la sede e stata DISATTIVATA da un sync').toBe(true);
    expect(
      piena?.shopifyLocationId,
      'l identificativo di collegamento e stato azzerato: la storia e persa',
    ).toBe('9001');

    // E il collegamento non verificabile viene SEGNALATO, non nascosto.
    expect(piena?.shopifySyncStatus).toBe('error');
    expect(piena?.shopifyLastError).toMatch(/non .* disponibile su Shopify/i);

    // I suoi contatori, dispositivi e terminali sono ancora li'.
    expect(dopo.contatori).toBe(prima.contatori);
    expect(dopo.dispositiviFiscali).toBe(prima.dispositiviFiscali);
    expect(dopo.terminaliPos).toBe(prima.terminaliPos);
    expect(dopo.assegnazioniUtente).toBe(prima.assegnazioniUtente);
  });

  it('scenario 9 · riconnessione allo stesso negozio non perde niente', async () => {
    const prima = await fotografa(prisma);

    await oauth.disconnect(P.tenant);
    vi.mocked(clienteAdmin.listLocations).mockResolvedValue([
      { id: 9001, name: 'Sede Shopify con riferimenti', active: true },
      { id: 9002, name: 'Sede Shopify vuota', active: true },
      { id: 9004, name: 'Sede cavia', active: true },
    ] as never);
    await sincronizzaSedi.syncFromShopify(P.tenant, DOMINIO_PROVA, 'token');

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, TUTTO_CIO_CHE_RESTA);
    // Le sedi si sono ricollegate per nome, non duplicate.
    expect(dopo.sedi).toBe(prima.sedi);
    expect(dopo.sediCollegate).toBe(3);
  });

  it('scenario 10 · riconnessione a un negozio DIVERSO non cancella le sedi vecchie', async () => {
    const prima = await fotografa(prisma);

    await oauth.disconnect(P.tenant);
    vi.mocked(clienteAdmin.listLocations).mockResolvedValue([
      { id: 7001, name: 'Magazzino del negozio nuovo', active: true },
    ] as never);
    await sincronizzaSedi.syncFromShopify(P.tenant, 'altro-negozio.myshopify.test', 'token');

    const dopo = await fotografa(prisma);
    attendiIntatti(prima, dopo, [...CATALOGO, ...INVENTARIO, ...DOCUMENTI, ...SCOLLEGAMENTI]);

    /*
      ⭐ **Le sedi CON riferimenti restano tutte.** E' la garanzia che conta:
         collegarsi a un altro negozio non puo' portare via la storia del
         precedente.
    */
    for (const id of [P.sedePiena, P.sedeLocale]) {
      expect(
        await prisma.location.findUnique({ where: { id } }),
        `sede ${id} cancellata da una riconnessione`,
      ).not.toBeNull();
    }

    /*
      ⏸ **SEDE_VUOTA ricade nella decisione funzionale aperta** (vedi scenario
         11): oggi una sede priva di ogni riferimento viene cancellata, e
         cambiando negozio sparisce. La prova lo fotografa senza giudicarlo.
    */
    /*
      ⛔ **Nemmeno le sedi VUOTE spariscono**: docs/24 §1.13.4 non fa eccezione
         per «era vuota». Una riconnessione a un altro negozio non e' il posto
         dove si decide la sorte di una sede.
    */
    for (const id of [P.sedeVuota, P.sedeCavia]) {
      expect(
        await prisma.location.findUnique({ where: { id } }),
        `la sede ${id}, priva di riferimenti, e stata eliminata da una riconnessione`,
      ).not.toBeNull();
    }
  });

  it('scenario 11 · una sede REALMENTE vuota NON viene eliminata dalla sincronizzazione', async () => {
    const prima = await fotografa(prisma);

    // SEDE_VUOTA (9002) sparisce dal catalogo remoto.
    vi.mocked(clienteAdmin.listLocations).mockResolvedValue([
      { id: 9001, name: 'Sede Shopify con riferimenti', active: true },
    ] as never);
    await sincronizzaSedi.syncFromShopify(P.tenant, DOMINIO_PROVA, 'token');

    const vuota = await prisma.location.findUnique({ where: { id: P.sedeVuota } });
    const dopo = await fotografa(prisma);

    /*
      ⛔ **La sede vuota NON si elimina** — docs/24 §1.13.4: l'eliminazione di
         una sede vuota e non collegata appartiene esclusivamente alla funzione
         VestiFlow dedicata. Una sincronizzazione di canale non e' quella
         funzione, e «era vuota» non e' un'autorizzazione.

      ⚠️ Qui la prova ammetteva l'eliminazione come esito legittimo, perche'
         fotografava una decisione allora aperta. La decisione e' stata presa.
    */
    expect(vuota, 'la sincronizzazione ha ELIMINATO una sede vuota').not.toBeNull();

    attendiIntatti(prima, dopo, [...CATALOGO, ...INVENTARIO, ...DOCUMENTI, ...SCOLLEGAMENTI]);
    expect(dopo.sedi, 'nessuna sede deve sparire per effetto di un sync').toBe(prima.sedi);
  });

  /*
    ⏸ **DECISIONE FUNZIONALE APERTA — misurata, non decisa qui.**

       Una sede che porta giacenze, movimenti e documenti viene DISATTIVATA
       (`isActive: false`) da `cleanupUnlinkedImportLocations`, cioè da una
       sincronizzazione di canale — non da un operatore che lo chiede.

       ⚠️ Non è una perdita di righe, ed è la forma prescritta per una sede
          referenziata: archiviare invece di cancellare. Ma la decide un sync,
          e l'effetto operativo è che la sede sparisce dai selettori.

       Questa prova fotografa il comportamento: se domani si deciderà che una
       sede con dati non può essere disattivata automaticamente, sarà questa
       riga a dire che la decisione è stata applicata.
  */
  it('scenario 13 · una sede CON dati non viene ne cancellata ne disattivata', async () => {
    // ⚠️ Serve una sede con codice diverso da LOC-01: `isShopifyManagedImportLocation`
    //    tratta LOC-01 come la sede di onboarding e la esclude. La cavia è LOC-04.
    await prisma.inventoryLevel.create({
      data: { tenantId: P.tenant, variantId: P.variLocale, locationId: P.sedeCavia, onHand: 7, available: 7 },
    });
    await prisma.location.update({
      where: { id: P.sedeCavia },
      data: { shopifyLocationId: null, shopifyLastSyncAt: null, isActive: true },
    });
    const prima = await fotografa(prisma);

    await sincronizzaSedi.cleanupUnlinkedImportLocations(P.tenant);

    const cavia = await prisma.location.findUnique({ where: { id: P.sedeCavia } });
    const dopo = await fotografa(prisma);

    // ⛔ Ciò che NON deve mai accadere: la sede sparisce, o spariscono i dati.
    expect(cavia, 'una sede con giacenze è stata CANCELLATA').not.toBeNull();
    attendiIntatti(prima, dopo, [...CATALOGO, ...INVENTARIO, ...DOCUMENTI, ...SEDI, ...SCOLLEGAMENTI]);

    // ⏸ Ciò che accade oggi, ed è la decisione aperta.
    expect(
      cavia?.isActive,
      'una sincronizzazione ha disattivato una sede con giacenze',
    ).toBe(true);
  });

  /*
    ⛔ **Il messaggio d'errore della purga NOMINA UNA CAUSA CHE NON C'ENTRA.**

       Misurato il 07/09/2026 contro PostgreSQL vero. Rimuovere clienti e ordini
       Shopify fallisce, e all'operatore arriva:

         «…Chiudi gli ordini fornitore aperti e riprova.»

       Gli ordini fornitore non c'entrano: in questa prova sono tutti chiusi.
       A bloccare è `online_sales.sales_order_id`, che è `RESTRICT` — una
       vendita online riferisce l'ordine che si sta cancellando.

    ⚠️ **Non è un difetto di perdita dati: è il suo opposto.** Il database
       protegge, e la transazione non lascia niente a metà. Ma
       `mapPurgeError` traduce OGNI violazione di chiave esterna (P2003) in
       quell'unica frase, quindi l'operatore chiude gli ordini fornitore,
       riprova, e fallisce di nuovo senza sapere perché.

    ⭐ **Effetto collaterale utile**: il difetto segnalato dal censimento —
       «rimuovere i clienti scollega i documenti che li nominano», perché
       `documents.customer_id` è `SET NULL` — NON è raggiungibile da questo
       percorso. La cancellazione fallisce prima, su un altro vincolo. Resta
       un rischio se un domani quel blocco cadesse.
  */
  it('scenario 14 · la purga di clienti e ordini fallisce, e il motivo dichiarato è sbagliato', async () => {
    // Il documento passa a nominare il cliente SENZA ordini, che sarebbe rimovibile.
    await prisma.document.update({
      where: { id: P.documento },
      data: { customerId: P.clienteSenzaOrdini },
    });
    // Si tolgono le due guardie a monte, per raggiungere il caso: con impegni
    // attivi o ordini fornitore aperti la purga si fermerebbe prima.
    await prisma.stockReservation.updateMany({
      where: { tenantId: P.tenant },
      data: { status: 'released' },
    });
    await prisma.supplierOrder.updateMany({
      where: { tenantId: P.tenant },
      data: { status: SupplierOrderStatus.concluded },
    });
    const prima = await fotografa(prisma);
    expect(prima.documentiSenzaCliente).toBe(1); // il solo trasferimento

    const rifiuto = await esegui(() =>
      cambioNegozio.purge(P.tenant, {
        confirmShopDomain: DOMINIO_PROVA,
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    );

    const dopo = await fotografa(prisma);

    // ⭐ Ciò che conta di più: il fallimento non lascia niente a metà.
    attendiIntatti(prima, dopo, [
      ...CATALOGO,
      ...INVENTARIO,
      ...DOCUMENTI,
      ...SEDI,
      ...SCOLLEGAMENTI,
      'clienti',
      'ordiniVendita',
    ]);

    /*
      ⏸ **DECISIONE FUNZIONALE APERTA.** Che il messaggio sia sbagliato è un
         fatto; che cosa debba dire invece dipende da una decisione che non è
         stata presa:

           · un ordine Shopify con una vendita online collegata può essere
             eliminato? (oggi no, e il database lo impone)
           · se no, la purga deve dirlo — e allora serve sapere quali vincoli
             nominare, cioè quali dati la purga NON potrà mai rimuovere
           · un cliente Shopify importato può essere eliminato fisicamente?

         Questa prova fissa il comportamento attuale. Il giorno in cui il
         messaggio verrà corretto, sarà questa riga a diventare rossa.
    */
    expect(rifiuto, 'oggi la purga fallisce').not.toBeNull();
    expect(
      rifiuto,
      'e il motivo dichiarato è «ordini fornitore aperti», che qui non ce ne sono',
    ).toMatch(/ordini fornitore aperti/i);
  });

  describe('scenario 12 · una sede con un riferimento non si elimina', () => {
    it.each(RELAZIONI_SEDE.map((r) => [r.nome, r] as const))(
      '%s — la sede resta, e il riferimento con lei',
      async (_nome, relazione) => {
        // La cavia nasce vuota: le si attacca SOLO questa relazione.
        await relazione.crea(prisma, P.sedeCavia);
        const riferimentiPrima = await relazione.conta(prisma, P.sedeCavia);
        const totalePrima = await relazione.contaTotale(prisma);
        expect(riferimentiPrima, 'il riferimento non risulta creato').toBeGreaterThan(0);

        // La cavia sparisce dal catalogo remoto: il sync decide che fare.
        vi.mocked(clienteAdmin.listLocations).mockResolvedValue([
          { id: 9001, name: 'Sede Shopify con riferimenti', active: true },
          { id: 9002, name: 'Sede Shopify vuota', active: true },
        ] as never);
        await sincronizzaSedi.syncFromShopify(P.tenant, DOMINIO_PROVA, 'token');

        const cavia = await prisma.location.findUnique({ where: { id: P.sedeCavia } });
        const riferimentiDopo = await relazione.conta(prisma, P.sedeCavia);
        const totaleDopo = await relazione.contaTotale(prisma);

        // 1 · la sede non e' stata cancellata
        expect(cavia, `la sede e' stata CANCELLATA nonostante ${relazione.nome}`).not.toBeNull();

        // 2 · resta operativa e collegata
        expect(cavia?.isActive, 'la sede e stata disattivata da un sync').toBe(true);
        expect(cavia?.shopifyLocationId, 'il collegamento e stato azzerato').toBe('9004');

        // 3 · il riferimento punta ancora alla sede: niente Cascade, niente SetNull
        expect(
          riferimentiDopo,
          `${relazione.nome} (${relazione.azione}) e' stato azzerato o cancellato`,
        ).toBe(riferimentiPrima);

        // 4 · e la riga collegata esiste ancora
        expect(totaleDopo, `una riga di ${relazione.modello} e' sparita`).toBe(totalePrima);

        await relazione.pulisci(prisma);
      },
    );
  });
});
