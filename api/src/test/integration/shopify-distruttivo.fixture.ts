import type { PrismaClient } from '@prisma/client';
import {
  CashSessionStatus,
  DocumentStatus,
  DocumentType,
  FiscalDeviceBrand,
  InventoryCountStatus,
  InventorySerialStatus,
  OnlineSaleInventoryStatus,
  ReservationStatus,
  SalesOrderFinancialStatus,
  SalesOrderSource,
  ShopifyConnectionStatus,
  ShopifySyncStatus,
  StockMovementType,
  SupplierOrderStatus,
  UserRole,
} from '@prisma/client';

import { ambienteIntegrazione } from './env';
import { conStoricoSbloccato } from './fixture';

/**
 * Il dataset del collaudo distruttivo Shopify, nel SOLO database di prova.
 *
 * ```text
 *   Tenant P
 *    ├─ SEDE_PIENA    (Shopify, id 9001) ← porta TUTTE e 21 le relazioni
 *    ├─ SEDE_VUOTA    (Shopify, id 9002) ← nessun riferimento, nemmeno uno
 *    ├─ SEDE_LOCALE   (nessun id Shopify)
 *    └─ SEDE_CAVIA    (Shopify, id 9004) ← nasce vuota: lo scenario 12 le
 *                                           attacca UNA relazione per volta
 * ```
 *
 * ⭐ **La sede cavia esiste perche' le 21 relazioni vanno distinte.** Se
 *    stessero tutte insieme sulla stessa sede, un rifiuto di cancellazione non
 *    direbbe QUALE riferimento l'ha trattenuta: basterebbe che una sola delle
 *    ventuno funzionasse per far passare la prova. Attaccandone una per volta,
 *    ognuna risponde per se'.
 *
 * ⚠️ **Nessun dato personale reale**: nomi inventati, domini `.test`, nessuna
 *    email vera, nessun identificativo Shopify di un negozio esistente.
 */

export const P = {
  tenant: '9f000000-0000-4000-8000-00000000f000',
  store: '9f000000-0000-4000-8000-00000000f001',

  sedePiena: '9f100000-0000-4000-8000-00000000f101',
  sedeVuota: '9f100000-0000-4000-8000-00000000f102',
  sedeLocale: '9f100000-0000-4000-8000-00000000f103',
  sedeCavia: '9f100000-0000-4000-8000-00000000f104',

  /** Prodotto nato su Shopify, con i suoi identificativi remoti. */
  prodottoShopify: '9f200000-0000-4000-8000-00000000f201',
  variShopify: '9f200000-0000-4000-8000-00000000f202',
  /** Prodotto esclusivamente VestiFlow: nessun identificativo remoto. */
  prodottoLocale: '9f200000-0000-4000-8000-00000000f203',
  variLocale: '9f200000-0000-4000-8000-00000000f204',

  utente: '9f300000-0000-4000-8000-00000000f301',
  parteCliente: '9f400000-0000-4000-8000-00000000f401',
  parteCliente2: '9f400000-0000-4000-8000-00000000f402',
  /** Cliente Shopify CON ordini. */
  clienteConOrdini: '9f400000-0000-4000-8000-00000000f403',
  /** Cliente Shopify SENZA ordini. */
  clienteSenzaOrdini: '9f400000-0000-4000-8000-00000000f404',

  documento: '9f500000-0000-4000-8000-00000000f501',
  rigaDocumento: '9f500000-0000-4000-8000-00000000f502',
  /** Documento che punta a SEDE_PIENA come DESTINAZIONE (trasferimento). */
  documentoDestinazione: '9f500000-0000-4000-8000-00000000f503',

  /** Ordine Shopify CON impegni di magazzino attivi. */
  ordineConImpegni: '9f600000-0000-4000-8000-00000000f601',
  /** Ordine Shopify SENZA impegni. */
  ordineSenzaImpegni: '9f600000-0000-4000-8000-00000000f602',
  impegno: '9f600000-0000-4000-8000-00000000f603',

  ordineFornitoreAperto: '9f700000-0000-4000-8000-00000000f701',
  ordineFornitoreChiuso: '9f700000-0000-4000-8000-00000000f702',

  movimentoEntrata: '9f800000-0000-4000-8000-00000000f801',
  movimentoTrasferimento: '9f800000-0000-4000-8000-00000000f802',
  giacenza: '9f800000-0000-4000-8000-00000000f803',
  sessioneConteggio: '9f800000-0000-4000-8000-00000000f804',
  rigaConteggio: '9f800000-0000-4000-8000-00000000f805',

  contatore: '9f900000-0000-4000-8000-00000000f901',
  dispositivoFiscale: '9f900000-0000-4000-8000-00000000f902',
  /** Il secondo serve al cambio: un cambio nomina due dispositivi diversi. */
  dispositivoFiscale2: '9f900000-0000-4000-8000-00000000f904',
  terminalePos: '9f900000-0000-4000-8000-00000000f903',

  venditaOnline: '9fa00000-0000-4000-8000-00000000fa01',
  statoSync: '9fa00000-0000-4000-8000-00000000fa02',
  lotto: '9fa00000-0000-4000-8000-00000000fa03',
  seriale: '9fa00000-0000-4000-8000-00000000fa04',
  ricevutaManuale: '9fa00000-0000-4000-8000-00000000fa05',
  sessioneCassa: '9fa00000-0000-4000-8000-00000000fa06',
  cambioDispositivo: '9fa00000-0000-4000-8000-00000000fa07',
} as const;

/**
 * ⚠️ Deve finire in `.myshopify.com`: e` il formato che `PurgeShopifyDataDto`
 *    impone e che `purge()` confronta con la connessione. Il nome e`
 *    volutamente improbabile — nessuna chiamata parte comunque, ma un dominio
 *    plausibile dentro una fixture e` il dettaglio che un giorno qualcuno copia.
 */
export const DOMINIO_PROVA = 'vestiflow-collaudo-locale-inesistente.myshopify.com';

/**
 * I cataloghi che **le migration popolano**, e che quindi non si ricreano.
 *
 * ⛔ **Troncarli rompe le altre suite, e in un modo che non nomina la causa.**
 *    Misurato il 07/09/2026: la prima stesura troncava «tutte le tabelle», e
 *    tre file della cassa hanno cominciato a fallire con «codice MP01 assente:
 *    la migration C2A non e' applicata» — un messaggio che manda a cercare una
 *    migration mancante mentre il problema era una `TRUNCATE` di troppo, in un
 *    altro file, eseguito prima.
 *
 * ⚠️ **Sono elencati a mano, ed e' un debito dichiarato.** Il criterio
 *    strutturale non esiste: «senza `tenant_id`» prenderebbe anche
 *    `sales_order_lines` e `tenants`, che sono dati di prova a tutti gli
 *    effetti. La rete e' il controllo qui sotto, che si accorge se un catalogo
 *    elencato resta vuoto.
 */
const CATALOGHI_DI_SISTEMA = ['payment_method_codes', 'vat_natures'] as const;

/**
 * ⛔ **La barriera si ri-verifica PRIMA del troncamento, non solo all'avvio.**
 *    E' l'unica funzione di questo file che cancella, ed e' quella che puntata
 *    male farebbe il danno peggiore.
 *
 * ⚠️ Tronca tutte le tabelle applicative, non un elenco: un elenco scritto a
 *    mano invecchia, e una tabella dimenticata lascia righe di una prova dentro
 *    la successiva — cioe' esattamente il tipo di risultato che sembra vero e
 *    non lo e'. L'unica eccezione sono i cataloghi qui sopra.
 */
export async function svuotaTutto(prisma: PrismaClient): Promise<void> {
  const ambiente = ambienteIntegrazione();
  if (ambiente.host !== 'localhost:5433' || ambiente.database !== 'vestiflow_test') {
    throw new Error(
      `⛔ TRUNCATE rifiutato: ${ambiente.host}/${ambiente.database} non e' il database di prova.`,
    );
  }

  const tabelle = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tabelle.length === 0) {
    throw new Error('⛔ nessuna tabella trovata: lo schema non e` stato applicato al database di prova.');
  }

  const daTroncare = tabelle.filter(
    (t) => !(CATALOGHI_DI_SISTEMA as readonly string[]).includes(t.tablename),
  );
  const elenco = daTroncare.map((t) => `"${t.tablename}"`).join(', ');
  await conStoricoSbloccato(prisma, async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${elenco} RESTART IDENTITY CASCADE`);
  });

  /*
    ⭐ **La rete: un catalogo vuoto qui significa che il database di prova e'
       gia' stato danneggiato**, e il messaggio dice cosa fare invece di
       lasciare che il guasto emerga tre file dopo, sotto un altro nome.
  */
  const vuoti: string[] = [];
  for (const catalogo of CATALOGHI_DI_SISTEMA) {
    const righe = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "${catalogo}"`,
    );
    if ((righe[0]?.n ?? 0n) === 0n) {
      vuoti.push(catalogo);
    }
  }
  if (vuoti.length > 0) {
    throw new Error(
      `⛔ cataloghi di sistema vuoti: ${vuoti.join(', ')}.\n` +
        '   Li popolano le migration, e qualcuno li ha troncati.\n' +
        '   Rimedio:  npm run db:test:reset  (da api/)',
    );
  }
}

/** Il dataset completo. Ogni entita' e' creata con id fisso: le prove la ritrovano. */
export async function creaDataset(prisma: PrismaClient): Promise<void> {
  await prisma.tenant.create({ data: { id: P.tenant, name: 'Azienda di prova' } });
  await prisma.store.create({
    data: { id: P.store, tenantId: P.tenant, name: 'Punto vendita di prova' },
  });

  // ── le quattro sedi ───────────────────────────────────────────────────────
  await prisma.location.createMany({
    data: [
      {
        id: P.sedePiena,
        tenantId: P.tenant,
        storeId: P.store,
        name: 'Sede Shopify con riferimenti',
        code: 'LOC-01',
        shopifyLocationId: '9001',
        shopifySyncStatus: ShopifySyncStatus.synced,
        isActive: true,
      },
      {
        id: P.sedeVuota,
        tenantId: P.tenant,
        storeId: P.store,
        name: 'Sede Shopify vuota',
        code: 'LOC-02',
        shopifyLocationId: '9002',
        shopifySyncStatus: ShopifySyncStatus.synced,
        isActive: true,
      },
      {
        id: P.sedeLocale,
        tenantId: P.tenant,
        storeId: P.store,
        name: 'Sede solo VestiFlow',
        code: 'LOC-03',
        shopifyLocationId: null,
        isActive: true,
      },
      {
        id: P.sedeCavia,
        tenantId: P.tenant,
        storeId: P.store,
        name: 'Sede cavia',
        code: 'LOC-04',
        shopifyLocationId: '9004',
        shopifySyncStatus: ShopifySyncStatus.synced,
        isActive: true,
      },
    ],
  });

  // ── utente: assegnato a SEDE_PIENA e con SEDE_PIENA come predefinita ──────
  await prisma.user.create({
    data: {
      id: P.utente,
      tenantId: P.tenant,
      email: 'operatore@prova.test',
      displayName: 'Operatore di prova',
      role: UserRole.owner,
      defaultLocationId: P.sedePiena, // ← relazione 16 · SetNull
    },
  });
  await prisma.userLocation.create({
    data: { userId: P.utente, locationId: P.sedePiena, tenantId: P.tenant }, // ← 18 · Cascade
  });

  // ── catalogo: uno Shopify, uno esclusivamente VestiFlow ──────────────────
  await prisma.product.create({
    data: {
      id: P.prodottoShopify,
      tenantId: P.tenant,
      articleCode: 'ART-SHOP',
      name: 'Articolo nato su Shopify',
      shopifyProductId: '77001',
      shopifySyncStatus: ShopifySyncStatus.synced,
    },
  });
  await prisma.productVariant.create({
    data: {
      id: P.variShopify,
      tenantId: P.tenant,
      productId: P.prodottoShopify,
      sku: 'SKU-SHOP-1',
      sellingPriceMinor: 1990,
      shopifyVariantId: '88001',
      shopifyInventoryItemId: '99001',
    },
  });
  await prisma.product.create({
    data: {
      id: P.prodottoLocale,
      tenantId: P.tenant,
      articleCode: 'ART-LOCALE',
      name: 'Articolo mai passato da Shopify',
    },
  });
  await prisma.productVariant.create({
    data: {
      id: P.variLocale,
      tenantId: P.tenant,
      productId: P.prodottoLocale,
      sku: 'SKU-LOCALE-1',
      sellingPriceMinor: 2490,
    },
  });

  // ── clienti Shopify: uno con ordini, uno senza ───────────────────────────
  await prisma.party.createMany({
    data: [
      { id: P.parteCliente, tenantId: P.tenant, companyName: 'Cliente con ordini' },
      { id: P.parteCliente2, tenantId: P.tenant, companyName: 'Cliente senza ordini' },
    ],
  });
  await prisma.customer.createMany({
    data: [
      { id: P.clienteConOrdini, tenantId: P.tenant, partyId: P.parteCliente, shopifyCustomerId: '66001' },
      { id: P.clienteSenzaOrdini, tenantId: P.tenant, partyId: P.parteCliente2, shopifyCustomerId: '66002' },
    ],
  });

  // ── documenti: uno emesso DA SEDE_PIENA, uno diretto A SEDE_PIENA ────────
  await prisma.document.create({
    data: {
      id: P.documento,
      tenantId: P.tenant,
      type: DocumentType.goods_receipt,
      number: 1,
      year: 2026,
      documentDate: new Date('2026-03-15T10:00:00Z'),
      status: DocumentStatus.confirmed,
      locationId: P.sedePiena, // ← 14 · SetNull
      // ⭐ Nomina un cliente Shopify: serve a vedere se una purga clienti
      //    scollega i documenti che li nominano (Document.customerId è
      //    opzionale e senza onDelete, quindi SetNull).
      customerId: P.clienteConOrdini,
      createdByName: 'Operatore di prova',
      totalMinor: 5000,
    },
  });
  await prisma.documentLine.create({
    data: {
      id: P.rigaDocumento,
      tenantId: P.tenant,
      documentId: P.documento,
      lineNumber: 1,
      description: 'Articolo nato su Shopify',
      variantId: P.variShopify,
      // ⚠️ La colonna ha DEFAULT '': senza, la scrittura riesce e la variante
      //    sparisce in silenzio. Lo impone check:variant-label.
      variantLabel: 'Taglia M · Rosso',
      quantity: 10,
      unitPriceMinor: 500,
      lineTotalMinor: 5000,
    },
  });
  await prisma.document.create({
    data: {
      id: P.documentoDestinazione,
      tenantId: P.tenant,
      type: DocumentType.transfer,
      number: 2,
      year: 2026,
      documentDate: new Date('2026-03-16T10:00:00Z'),
      status: DocumentStatus.confirmed,
      locationId: P.sedeLocale,
      targetLocationId: P.sedePiena, // ← 15 · SetNull
      createdByName: 'Operatore di prova',
    },
  });

  // ── inventario ───────────────────────────────────────────────────────────
  await prisma.inventoryLevel.create({
    data: {
      id: P.giacenza,
      tenantId: P.tenant,
      variantId: P.variShopify,
      locationId: P.sedePiena, // ← 1 · Restrict
      onHand: 10,
      available: 8,
      committed: 2,
    },
  });
  await prisma.stockMovement.create({
    data: {
      id: P.movimentoEntrata,
      tenantId: P.tenant,
      type: StockMovementType.load,
      variantId: P.variShopify,
      sku: 'SKU-SHOP-1',
      locationId: P.sedePiena, // ← 3 · Restrict
      quantity: 10,
      createdByName: 'Operatore di prova',
    },
  });
  await prisma.stockMovement.create({
    data: {
      id: P.movimentoTrasferimento,
      tenantId: P.tenant,
      type: StockMovementType.transfer,
      variantId: P.variLocale,
      sku: 'SKU-LOCALE-1',
      locationId: P.sedeLocale,
      targetLocationId: P.sedePiena, // ← 11 · SetNull
      quantity: 3,
      createdByName: 'Operatore di prova',
    },
  });
  await prisma.inventoryCountSession.create({
    data: {
      id: P.sessioneConteggio,
      tenantId: P.tenant,
      locationId: P.sedePiena, // ← 2 · Restrict
      name: 'Conteggio di prova',
      status: InventoryCountStatus.in_progress,
      createdByName: 'Operatore di prova',
    },
  });
  await prisma.inventoryCountLine.create({
    data: {
      id: P.rigaConteggio,
      tenantId: P.tenant,
      sessionId: P.sessioneConteggio,
      variantId: P.variShopify,
      sku: 'SKU-SHOP-1',
      productName: 'Articolo nato su Shopify',
      systemQuantity: 10,
    },
  });
  await prisma.inventoryLot.create({
    data: {
      id: P.lotto,
      tenantId: P.tenant,
      variantId: P.variShopify,
      locationId: P.sedePiena, // ← 6 · Restrict
      lotCode: 'LOTTO-1',
      quantity: 5,
    },
  });
  await prisma.inventorySerial.create({
    data: {
      id: P.seriale,
      tenantId: P.tenant,
      variantId: P.variShopify,
      locationId: P.sedePiena, // ← 7 · Restrict
      serialNumber: 'SN-0001',
      status: InventorySerialStatus.in_stock,
    },
  });

  // ── ordini fornitore: uno aperto, uno chiuso ────────────────────────────
  await prisma.supplierOrder.createMany({
    data: [
      {
        id: P.ordineFornitoreAperto,
        tenantId: P.tenant,
        reference: 'OF-APERTO',
        supplierName: 'Fornitore di prova',
        status: SupplierOrderStatus.confirmed,
        destinationLocationId: P.sedePiena, // ← 12 · SetNull
      },
      {
        id: P.ordineFornitoreChiuso,
        tenantId: P.tenant,
        reference: 'OF-CHIUSO',
        supplierName: 'Fornitore di prova',
        status: SupplierOrderStatus.concluded,
        destinationLocationId: P.sedePiena,
      },
    ],
  });

  // ── ordini Shopify: uno con impegni attivi, uno senza ───────────────────
  await prisma.salesOrder.createMany({
    data: [
      {
        id: P.ordineConImpegni,
        tenantId: P.tenant,
        orderNumber: 'SH-1001',
        customerName: 'Cliente con ordini',
        customerId: P.clienteConOrdini,
        placedAt: new Date('2026-03-20T09:00:00Z'),
        source: SalesOrderSource.shopify_online,
        shopifyOrderId: '55001',
        locationId: P.sedePiena, // ← 13 · SetNull
        financialStatus: SalesOrderFinancialStatus.paid,
      },
      {
        id: P.ordineSenzaImpegni,
        tenantId: P.tenant,
        orderNumber: 'SH-1002',
        customerName: 'Cliente con ordini',
        customerId: P.clienteConOrdini,
        placedAt: new Date('2026-03-21T09:00:00Z'),
        source: SalesOrderSource.shopify_online,
        shopifyOrderId: '55002',
        locationId: P.sedeLocale,
        financialStatus: SalesOrderFinancialStatus.paid,
      },
    ],
  });
  await prisma.stockReservation.create({
    data: {
      id: P.impegno,
      tenantId: P.tenant,
      locationId: P.sedePiena, // ← 4 · Restrict
      variantId: P.variShopify,
      channel: SalesOrderSource.shopify_online,
      salesOrderId: P.ordineConImpegni,
      sku: 'SKU-SHOP-1',
      quantity: 2,
      remainingQuantity: 2,
      status: ReservationStatus.active,
    },
  });
  await prisma.onlineSale.create({
    data: {
      id: P.venditaOnline,
      tenantId: P.tenant,
      number: 1,
      year: 2026,
      reference: 'VO-1',
      channel: SalesOrderSource.shopify_online,
      salesOrderId: P.ordineSenzaImpegni,
      orderNumber: 'SH-1002',
      externalOrderId: '55002',
      dedupeKey: 'shopify:55002',
      orderPlacedAt: new Date('2026-03-21T09:00:00Z'),
      fulfilledAt: new Date('2026-03-21T12:00:00Z'),
      customerName: 'Cliente con ordini',
      customerId: P.clienteConOrdini,
      locationId: P.sedePiena, // ← 17 · SetNull
      paymentStatus: SalesOrderFinancialStatus.paid,
      inventoryStatus: OnlineSaleInventoryStatus.unloaded,
    },
  });

  // ── numerazione, dispositivi, cassa ─────────────────────────────────────
  await prisma.documentCounter.create({
    data: {
      id: P.contatore,
      tenantId: P.tenant,
      type: DocumentType.sales_ddt,
      locationId: P.sedePiena, // ← 19 · Cascade
      series: 'A',
    },
  });
  await prisma.fiscalDevice.createMany({
    data: [
      {
        id: P.dispositivoFiscale,
        tenantId: P.tenant,
        locationId: P.sedePiena, // ← 20 · Cascade
        brand: FiscalDeviceBrand.epson,
        // ⚠️ enabled richiede un adapter: lo dice un CHECK del database, non lo schema.
        enabled: false,
      },
      {
        id: P.dispositivoFiscale2,
        tenantId: P.tenant,
        locationId: P.sedePiena,
        brand: FiscalDeviceBrand.custom,
        enabled: false,
      },
    ],
  });
  await prisma.posTerminal.create({
    data: {
      id: P.terminalePos,
      tenantId: P.tenant,
      locationId: P.sedePiena, // ← 21 · Cascade
      terminalId: 'POS-1',
      acquirerName: 'Acquirer di prova',
      activatedAt: new Date('2026-01-01T00:00:00Z'),
    },
  });
  await prisma.cashSession.create({
    data: {
      id: P.sessioneCassa,
      tenantId: P.tenant,
      locationId: P.sedePiena, // ← 9 · Restrict
      openedByName: 'Operatore di prova',
      status: CashSessionStatus.closed,
      fiscalDeviceId: P.dispositivoFiscale,
    },
  });
  await prisma.cashSessionDeviceChange.create({
    data: {
      id: P.cambioDispositivo,
      tenantId: P.tenant,
      locationId: P.sedePiena, // ← 10 · Restrict
      sessionId: P.sessioneCassa,
      reason: 'Prova di cambio dispositivo',
      changedByName: 'Operatore di prova',
      // ⚠️ Devono differire: lo impone un CHECK, e una riga senza dispositivi
      //    «non racconta nessun cambio».
      previousDeviceId: P.dispositivoFiscale,
      newDeviceId: P.dispositivoFiscale2,
    },
  });
  await prisma.manualReceipt.create({
    data: {
      id: P.ricevutaManuale,
      tenantId: P.tenant,
      number: 1,
      documentDate: new Date('2026-03-22T10:00:00Z'),
      locationId: P.sedePiena, // ← 8 · Restrict
      createdByName: 'Operatore di prova',
      totalMinor: 1500,
    },
  });
  await prisma.shopifyInventorySyncState.create({
    data: {
      id: P.statoSync,
      tenantId: P.tenant,
      variantId: P.variShopify,
      locationId: P.sedePiena, // ← 5 · Restrict
      lastPushedAvailable: 8,
    },
  });

  // ── la connessione Shopify ──────────────────────────────────────────────
  await prisma.shopifyConnection.create({
    data: {
      tenantId: P.tenant,
      status: ShopifyConnectionStatus.connected,
      shopDomain: DOMINIO_PROVA,
      displayName: 'Negozio di prova',
      scopes: ['read_products', 'write_products'],
      lastConnectedAt: new Date('2026-03-01T08:00:00Z'),
      autoSyncEnabled: true,
    },
  });
}

/**
 * Le 21 relazioni verso `Location`, ciascuna con il modo di crearne UNA sulla
 * sede cavia e il modo di verificarla.
 *
 * ⭐ **L'elenco vive qui, non nel test**: lo scenario 12 lo percorre, cosi' una
 *    relazione nuova aggiunta domani porta con se' la propria prova invece di
 *    richiedere che qualcuno si ricordi di scriverla.
 */
export interface RelazioneSede {
  readonly nome: string;
  readonly modello: string;
  readonly campo: string;
  readonly azione: 'Restrict' | 'SetNull' | 'Cascade';
  /** Crea il solo riferimento di questa relazione verso la sede indicata. */
  readonly crea: (prisma: PrismaClient, sedeId: string) => Promise<void>;
  /** Quante righe di questa relazione puntano ancora alla sede. */
  readonly conta: (prisma: PrismaClient, sedeId: string) => Promise<number>;
  /** Quante righe esistono in totale (per accorgersi di una Cascade). */
  readonly contaTotale: (prisma: PrismaClient) => Promise<number>;
  /** Rimuove il riferimento, per lasciare la cavia pulita alla prova dopo. */
  readonly pulisci: (prisma: PrismaClient) => Promise<void>;
}

const base = { tenantId: P.tenant };

export const RELAZIONI_SEDE: readonly RelazioneSede[] = [
  {
    nome: 'InventoryLevel.locationId',
    modello: 'inventoryLevel',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.inventoryLevel.create({
        data: { ...base, variantId: P.variLocale, locationId: sede, onHand: 4, available: 4 },
      });
    },
    conta: (p, sede) => p.inventoryLevel.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.inventoryLevel.count(),
    pulisci: async (p) => {
      await p.inventoryLevel.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'InventoryCountSession.locationId',
    modello: 'inventoryCountSession',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.inventoryCountSession.create({
        data: { ...base, locationId: sede, name: 'Conteggio cavia', createdByName: 'Prova' },
      });
    },
    conta: (p, sede) => p.inventoryCountSession.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.inventoryCountSession.count(),
    pulisci: async (p) => {
      await p.inventoryCountLine.deleteMany({
        where: { session: { locationId: P.sedeCavia } },
      });
      await p.inventoryCountSession.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'StockMovement.locationId',
    modello: 'stockMovement',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.stockMovement.create({
        data: {
          ...base,
          type: StockMovementType.load,
          variantId: P.variLocale,
          sku: 'SKU-LOCALE-1',
          locationId: sede,
          quantity: 4,
          createdByName: 'Prova',
        },
      });
    },
    conta: (p, sede) => p.stockMovement.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.stockMovement.count(),
    pulisci: async (p) => {
      await p.stockMovement.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'StockMovement.targetLocationId',
    modello: 'stockMovement',
    campo: 'targetLocationId',
    azione: 'SetNull',
    crea: async (p, sede) => {
      await p.stockMovement.create({
        data: {
          ...base,
          type: StockMovementType.transfer,
          variantId: P.variLocale,
          sku: 'SKU-LOCALE-1',
          locationId: P.sedeLocale,
          targetLocationId: sede,
          quantity: 2,
          createdByName: 'Prova',
        },
      });
    },
    conta: (p, sede) => p.stockMovement.count({ where: { targetLocationId: sede } }),
    contaTotale: (p) => p.stockMovement.count(),
    pulisci: async (p) => {
      await p.stockMovement.deleteMany({ where: { targetLocationId: P.sedeCavia } });
    },
  },
  {
    nome: 'SupplierOrder.destinationLocationId',
    modello: 'supplierOrder',
    campo: 'destinationLocationId',
    azione: 'SetNull',
    crea: async (p, sede) => {
      await p.supplierOrder.create({
        data: {
          ...base,
          reference: 'OF-CAVIA',
          supplierName: 'Fornitore cavia',
          destinationLocationId: sede,
        },
      });
    },
    conta: (p, sede) => p.supplierOrder.count({ where: { destinationLocationId: sede } }),
    contaTotale: (p) => p.supplierOrder.count(),
    pulisci: async (p) => {
      await p.supplierOrder.deleteMany({ where: { reference: 'OF-CAVIA' } });
    },
  },
  {
    nome: 'SalesOrder.locationId',
    modello: 'salesOrder',
    campo: 'locationId',
    azione: 'SetNull',
    crea: async (p, sede) => {
      await p.salesOrder.create({
        data: {
          ...base,
          orderNumber: 'SO-CAVIA',
          customerName: 'Cliente cavia',
          placedAt: new Date('2026-04-01T10:00:00Z'),
          locationId: sede,
        },
      });
    },
    conta: (p, sede) => p.salesOrder.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.salesOrder.count(),
    pulisci: async (p) => {
      await p.salesOrder.deleteMany({ where: { orderNumber: 'SO-CAVIA' } });
    },
  },
  {
    nome: 'StockReservation.locationId',
    modello: 'stockReservation',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.stockReservation.create({
        data: {
          ...base,
          locationId: sede,
          variantId: P.variLocale,
          channel: SalesOrderSource.manual,
          salesOrderId: P.ordineSenzaImpegni,
          sku: 'SKU-LOCALE-1',
          quantity: 1,
          remainingQuantity: 1,
        },
      });
    },
    conta: (p, sede) => p.stockReservation.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.stockReservation.count(),
    pulisci: async (p) => {
      await p.stockReservation.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'ShopifyInventorySyncState.locationId',
    modello: 'shopifyInventorySyncState',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.shopifyInventorySyncState.create({
        data: { ...base, variantId: P.variLocale, locationId: sede, lastPushedAvailable: 4 },
      });
    },
    conta: (p, sede) => p.shopifyInventorySyncState.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.shopifyInventorySyncState.count(),
    pulisci: async (p) => {
      await p.shopifyInventorySyncState.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'Document.locationId',
    modello: 'document',
    campo: 'locationId',
    azione: 'SetNull',
    crea: async (p, sede) => {
      await p.document.create({
        data: {
          ...base,
          type: DocumentType.goods_receipt,
          number: 900,
          year: 2026,
          documentDate: new Date('2026-04-02T10:00:00Z'),
          locationId: sede,
          createdByName: 'Prova',
        },
      });
    },
    conta: (p, sede) => p.document.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.document.count(),
    pulisci: async (p) => {
      await p.document.deleteMany({ where: { number: 900 } });
    },
  },
  {
    nome: 'Document.targetLocationId',
    modello: 'document',
    campo: 'targetLocationId',
    azione: 'SetNull',
    crea: async (p, sede) => {
      await p.document.create({
        data: {
          ...base,
          type: DocumentType.transfer,
          number: 901,
          year: 2026,
          documentDate: new Date('2026-04-03T10:00:00Z'),
          locationId: P.sedeLocale,
          targetLocationId: sede,
          createdByName: 'Prova',
        },
      });
    },
    conta: (p, sede) => p.document.count({ where: { targetLocationId: sede } }),
    contaTotale: (p) => p.document.count(),
    pulisci: async (p) => {
      await p.document.deleteMany({ where: { number: 901 } });
    },
  },
  {
    nome: 'InventoryLot.locationId',
    modello: 'inventoryLot',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.inventoryLot.create({
        data: { ...base, variantId: P.variLocale, locationId: sede, lotCode: 'LOTTO-CAVIA', quantity: 2 },
      });
    },
    conta: (p, sede) => p.inventoryLot.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.inventoryLot.count(),
    pulisci: async (p) => {
      await p.inventoryLot.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'InventorySerial.locationId',
    modello: 'inventorySerial',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.inventorySerial.create({
        data: { ...base, variantId: P.variLocale, locationId: sede, serialNumber: 'SN-CAVIA' },
      });
    },
    conta: (p, sede) => p.inventorySerial.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.inventorySerial.count(),
    pulisci: async (p) => {
      await p.inventorySerial.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'ManualReceipt.locationId',
    modello: 'manualReceipt',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.manualReceipt.create({
        data: {
          ...base,
          number: 900,
          documentDate: new Date('2026-04-04T10:00:00Z'),
          locationId: sede,
          createdByName: 'Prova',
        },
      });
    },
    conta: (p, sede) => p.manualReceipt.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.manualReceipt.count(),
    pulisci: async (p) => {
      await p.manualReceipt.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'CashSession.locationId',
    modello: 'cashSession',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      await p.cashSession.create({
        data: { ...base, locationId: sede, openedByName: 'Prova', status: CashSessionStatus.closed },
      });
    },
    conta: (p, sede) => p.cashSession.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.cashSession.count(),
    pulisci: async (p) => {
      await p.cashSessionDeviceChange.deleteMany({ where: { locationId: P.sedeCavia } });
      await p.cashSession.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'CashSessionDeviceChange.locationId',
    modello: 'cashSessionDeviceChange',
    campo: 'locationId',
    azione: 'Restrict',
    crea: async (p, sede) => {
      const sessione = await p.cashSession.create({
        data: {
          ...base,
          locationId: P.sedeLocale,
          openedByName: 'Prova',
          status: CashSessionStatus.closed,
        },
      });
      await p.cashSessionDeviceChange.create({
        data: {
          ...base,
          locationId: sede,
          sessionId: sessione.id,
          reason: 'Cambio cavia',
          changedByName: 'Prova',
          previousDeviceId: P.dispositivoFiscale,
          newDeviceId: P.dispositivoFiscale2,
        },
      });
    },
    conta: (p, sede) => p.cashSessionDeviceChange.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.cashSessionDeviceChange.count(),
    pulisci: async (p) => {
      await p.cashSessionDeviceChange.deleteMany({ where: { reason: 'Cambio cavia' } });
      await p.cashSession.deleteMany({
        where: { locationId: P.sedeLocale, openedByName: 'Prova' },
      });
    },
  },
  {
    nome: 'User.defaultLocationId',
    modello: 'user',
    campo: 'defaultLocationId',
    azione: 'SetNull',
    crea: async (p, sede) => {
      await p.user.create({
        data: {
          ...base,
          email: 'cavia@prova.test',
          displayName: 'Utente cavia',
          defaultLocationId: sede,
        },
      });
    },
    conta: (p, sede) => p.user.count({ where: { defaultLocationId: sede } }),
    contaTotale: (p) => p.user.count(),
    pulisci: async (p) => {
      await p.user.deleteMany({ where: { email: 'cavia@prova.test' } });
    },
  },
  {
    nome: 'OnlineSale.locationId',
    modello: 'onlineSale',
    campo: 'locationId',
    azione: 'SetNull',
    crea: async (p, sede) => {
      const ordine = await p.salesOrder.create({
        data: {
          ...base,
          orderNumber: 'SO-VO-CAVIA',
          customerName: 'Cliente cavia',
          placedAt: new Date('2026-04-05T10:00:00Z'),
        },
      });
      await p.onlineSale.create({
        data: {
          ...base,
          number: 900,
          year: 2026,
          reference: 'VO-CAVIA',
          channel: SalesOrderSource.shopify_online,
          salesOrderId: ordine.id,
          orderNumber: 'SO-VO-CAVIA',
          externalOrderId: '55900',
          dedupeKey: 'shopify:55900',
          orderPlacedAt: new Date('2026-04-05T10:00:00Z'),
          fulfilledAt: new Date('2026-04-05T12:00:00Z'),
          customerName: 'Cliente cavia',
          locationId: sede,
          paymentStatus: SalesOrderFinancialStatus.paid,
          inventoryStatus: OnlineSaleInventoryStatus.unloaded,
        },
      });
    },
    conta: (p, sede) => p.onlineSale.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.onlineSale.count(),
    pulisci: async (p) => {
      await p.onlineSale.deleteMany({ where: { reference: 'VO-CAVIA' } });
      await p.salesOrder.deleteMany({ where: { orderNumber: 'SO-VO-CAVIA' } });
    },
  },
  {
    nome: 'UserLocation.locationId',
    modello: 'userLocation',
    campo: 'locationId',
    azione: 'Cascade',
    crea: async (p, sede) => {
      await p.userLocation.create({ data: { ...base, userId: P.utente, locationId: sede } });
    },
    conta: (p, sede) => p.userLocation.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.userLocation.count(),
    pulisci: async (p) => {
      await p.userLocation.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'DocumentCounter.locationId',
    modello: 'documentCounter',
    campo: 'locationId',
    azione: 'Cascade',
    crea: async (p, sede) => {
      await p.documentCounter.create({
        data: { ...base, type: DocumentType.invoice, locationId: sede, series: 'B' },
      });
    },
    conta: (p, sede) => p.documentCounter.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.documentCounter.count(),
    pulisci: async (p) => {
      await p.documentCounter.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'FiscalDevice.locationId',
    modello: 'fiscalDevice',
    campo: 'locationId',
    azione: 'Cascade',
    crea: async (p, sede) => {
      await p.fiscalDevice.create({
        data: { ...base, locationId: sede, brand: FiscalDeviceBrand.custom },
      });
    },
    conta: (p, sede) => p.fiscalDevice.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.fiscalDevice.count(),
    pulisci: async (p) => {
      await p.fiscalDevice.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
  {
    nome: 'PosTerminal.locationId',
    modello: 'posTerminal',
    campo: 'locationId',
    azione: 'Cascade',
    crea: async (p, sede) => {
      await p.posTerminal.create({
        data: {
          ...base,
          locationId: sede,
          terminalId: 'POS-CAVIA',
          acquirerName: 'Acquirer cavia',
          activatedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
    },
    conta: (p, sede) => p.posTerminal.count({ where: { locationId: sede } }),
    contaTotale: (p) => p.posTerminal.count(),
    pulisci: async (p) => {
      await p.posTerminal.deleteMany({ where: { locationId: P.sedeCavia } });
    },
  },
];

/**
 * La fotografia dello stato: quello che ogni scenario confronta prima e dopo.
 *
 * ⚠️ **Conta anche cio' che non dovrebbe mai cambiare.** Uno scenario sui
 *    clienti non ha ragione di toccare le giacenze — ed e' esattamente per
 *    questo che le giacenze vanno nella fotografia: il difetto che ha
 *    distrutto i dati di un tenant era una funzione che toccava cose fuori dal
 *    proprio mestiere.
 */
export interface Fotografia {
  readonly [chiave: string]: number | string | null;
}

export async function fotografa(prisma: PrismaClient): Promise<Fotografia> {
  const [
    prodotti,
    varianti,
    documenti,
    righeDocumento,
    movimenti,
    giacenze,
    sessioniConteggio,
    righeConteggio,
    impegni,
    impegniAttivi,
    clienti,
    ordiniVendita,
    ordiniFornitore,
    sedi,
    sediCollegate,
    contatori,
    dispositiviFiscali,
    terminaliPos,
    assegnazioniUtente,
    utenti,
    venditeOnline,
    statiSync,
    lotti,
    seriali,
    ricevute,
    sessioniCassa,
    cambiDispositivo,
    // Righe scollegate da un SetNull: contarle e' l'unico modo per accorgersi
    // che un riferimento e' stato azzerato invece che conservato.
    documentiSenzaSede,
    documentiSenzaDestinazione,
    ordiniVenditaSenzaSede,
    ordiniFornitoreSenzaDestinazione,
    movimentiSenzaDestinazione,
    venditeOnlineSenzaSede,
    utentiSenzaSedePredefinita,
    documentiSenzaCliente,
    ordiniVenditaSenzaCliente,
    venditeOnlineSenzaCliente,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.document.count(),
    prisma.documentLine.count(),
    prisma.stockMovement.count(),
    prisma.inventoryLevel.count(),
    prisma.inventoryCountSession.count(),
    prisma.inventoryCountLine.count(),
    prisma.stockReservation.count(),
    prisma.stockReservation.count({ where: { status: ReservationStatus.active } }),
    prisma.customer.count(),
    prisma.salesOrder.count(),
    prisma.supplierOrder.count(),
    prisma.location.count(),
    prisma.location.count({ where: { shopifyLocationId: { not: null } } }),
    prisma.documentCounter.count(),
    prisma.fiscalDevice.count(),
    prisma.posTerminal.count(),
    prisma.userLocation.count(),
    prisma.user.count(),
    prisma.onlineSale.count(),
    prisma.shopifyInventorySyncState.count(),
    prisma.inventoryLot.count(),
    prisma.inventorySerial.count(),
    prisma.manualReceipt.count(),
    prisma.cashSession.count(),
    prisma.cashSessionDeviceChange.count(),
    prisma.document.count({ where: { locationId: null } }),
    prisma.document.count({ where: { type: DocumentType.transfer, targetLocationId: null } }),
    prisma.salesOrder.count({ where: { locationId: null } }),
    prisma.supplierOrder.count({ where: { destinationLocationId: null } }),
    prisma.stockMovement.count({
      where: { type: StockMovementType.transfer, targetLocationId: null },
    }),
    prisma.onlineSale.count({ where: { locationId: null } }),
    prisma.user.count({ where: { defaultLocationId: null } }),
    // ⭐ Un documento che perde il proprio cliente non perde righe: perde
    //    l'intestatario. E' uno scollegamento, e va contato come tale.
    prisma.document.count({ where: { customerId: null } }),
    prisma.salesOrder.count({ where: { customerId: null } }),
    prisma.onlineSale.count({ where: { customerId: null } }),
  ]);

  // Gli identificativi Shopify: non basta che le righe ci siano ancora, devono
  // conservare il collegamento al canale.
  const [prodottiCollegati, variantiCollegate, clientiCollegati, ordiniCollegati] =
    await Promise.all([
      prisma.product.count({ where: { shopifyProductId: { not: null } } }),
      prisma.productVariant.count({ where: { shopifyVariantId: { not: null } } }),
      prisma.customer.count({ where: { shopifyCustomerId: { not: null } } }),
      prisma.salesOrder.count({ where: { shopifyOrderId: { not: null } } }),
    ]);

  const giacenza = await prisma.inventoryLevel.findUnique({ where: { id: P.giacenza } });

  return {
    prodotti,
    varianti,
    documenti,
    righeDocumento,
    movimenti,
    giacenze,
    sessioniConteggio,
    righeConteggio,
    impegni,
    impegniAttivi,
    clienti,
    ordiniVendita,
    ordiniFornitore,
    sedi,
    sediCollegate,
    contatori,
    dispositiviFiscali,
    terminaliPos,
    assegnazioniUtente,
    utenti,
    venditeOnline,
    statiSync,
    lotti,
    seriali,
    ricevute,
    sessioniCassa,
    cambiDispositivo,
    documentiSenzaSede,
    documentiSenzaDestinazione,
    ordiniVenditaSenzaSede,
    ordiniFornitoreSenzaDestinazione,
    movimentiSenzaDestinazione,
    venditeOnlineSenzaSede,
    utentiSenzaSedePredefinita,
    documentiSenzaCliente,
    ordiniVenditaSenzaCliente,
    venditeOnlineSenzaCliente,
    prodottiCollegati,
    variantiCollegate,
    clientiCollegati,
    ordiniCollegati,
    giacenzaOnHand: giacenza?.onHand ?? null,
    giacenzaCommitted: giacenza?.committed ?? null,
  };
}

/** Le differenze fra due fotografie, gia' pronte da leggere in un fallimento. */
export function differenze(prima: Fotografia, dopo: Fotografia): string[] {
  const righe: string[] = [];
  for (const chiave of Object.keys(prima)) {
    if (prima[chiave] !== dopo[chiave]) {
      righe.push(`${chiave}: ${String(prima[chiave])} → ${String(dopo[chiave])}`);
    }
  }
  return righe;
}
