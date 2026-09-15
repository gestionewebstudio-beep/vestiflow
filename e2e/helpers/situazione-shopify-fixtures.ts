import { CONNESSIONE } from './impostazioni-fixtures';

/**
 * La connessione Shopify ATTIVATA e la situazione del collaudo del 13/09/2026, nella forma
 * vera dei DTO: le prove a schermo del pannello Shopify partono da qui (`situazione-shopify`,
 * `notifiche-webhook`). Nessuna API, nessuno Shopify.
 */
export const AMBITO_FO = 'read_merchant_managed_fulfillment_orders';

export const CONNESSIONE_ATTIVA = {
  ...CONNESSIONE,
  autoSyncEnabled: true,
  scopes: ['read_products', 'write_products', 'write_inventory', 'read_orders'],
  scopeDiagnostics: {
    requested: ['read_products', 'write_products', 'write_inventory', 'read_orders', AMBITO_FO],
    granted: ['read_products', 'write_products', 'write_inventory', 'read_orders'],
    missingFromGrant: [AMBITO_FO],
    missingForCatalogImport: [],
    catalogImportBlockedReason: 'none',
    missingForPublications: [],
    publicationsBlockedReason: 'none',
  },
  webhookTopicsKnown: true,
  webhookTopics: [
    'inventory_levels/update',
    'orders/create',
    'orders/updated',
    'orders/cancelled',
    'customers/create',
    'customers/update',
    'products/create',
    'products/update',
  ],
  webhookMissingTopics: ['fulfillment_orders/moved', 'fulfillment_orders/order_routing_complete'],
  webhookAddressMatchesConfigured: true,
  webhookAddressComparable: true,
  webhookAddress: 'https://tunnel.example/api/v1/shopify/webhooks',
  webhooksCheckedAt: '2026-09-13T01:20:00.000Z',
  lastWebhookEventAt: '2026-09-13T01:10:00.000Z',
};

export function problemiDelCollaudo() {
  const azioneAllinea = {
    tipo: 'allinea',
    etichetta:
      '«Allinea giacenze su Shopify» dopo aver risolto gli ordini senza sede: finché ci sono, rifiuta',
    riferimento: null,
  };
  return [
    {
      tipo: 'connessione',
      causa: 'connessione_ambiti_mancanti',
      riferimento: 'ambiti',
      nome: AMBITO_FO,
      dettaglio: null,
      sede: null,
      conseguenza:
        'Senza il permesso di leggere i fulfillment order la sede degli ordini online non si determina: nessun impegno, quantità ferme.',
      azione: {
        tipo: 'permessi',
        etichetta:
          'Disconnetti e Connetti Shopify: la nuova autorizzazione chiede i permessi mancanti',
        riferimento: null,
      },
      apri: null,
      rilevatoAt: null,
    },
    {
      tipo: 'connessione',
      causa: 'connessione_webhook_mancanti',
      riferimento: 'webhook',
      nome: 'fulfillment_orders/moved, fulfillment_orders/order_routing_complete',
      dettaglio: null,
      sede: null,
      conseguenza:
        'Gli eventi di questi tipi non arrivano: ciò che cambia su Shopify per quella via si vede solo con un import manuale.',
      azione: { tipo: 'webhook', etichetta: 'Registra le notifiche mancanti', riferimento: null },
      apri: null,
      rilevatoAt: null,
    },
    ...['#1010', '#1011'].map((nome, i) => ({
      tipo: 'ordine',
      causa: 'ordine_permesso_fulfillment_orders',
      riferimento: `ordine-${i}`,
      nome,
      dettaglio: null,
      sede: null,
      conseguenza:
        'Nessun impegno per le sue righe: la quantità delle varianti coinvolte resta ferma verso Shopify (nessuna pubblicazione, «Allinea» rifiuta).',
      azione: {
        tipo: 'permessi',
        etichetta:
          'Disconnetti e Connetti Shopify: la nuova autorizzazione include il permesso di leggere la sede degli ordini',
        riferimento: null,
      },
      apri: { tipo: 'apri_ordine', etichetta: 'Apri l’ordine', riferimento: `ordine-${i}` },
      rilevatoAt: '2026-09-13T01:49:00.000Z',
    })),
    ...Array.from({ length: 75 }, (_, i) => ({
      tipo: 'coppia',
      causa: 'coppia_lettura_fallita',
      riferimento: `v${i}:sede-b`,
      nome: `Articolo ${String(i + 1).padStart(2, '0')} (SKU-${i + 1})`,
      dettaglio: i % 3 === 0 ? 'M' : i % 3 === 1 ? 'L' : 'XL',
      sede: 'Sede B (rientro resi)',
      conseguenza:
        'Base non stabilita: la lettura del canale è fallita (ultimo tentativo: 2026-09-13 01:14). La quantità di questa coppia non parte finché la base manca.',
      azione: azioneAllinea,
      apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: `p${i}` },
      rilevatoAt: '2026-09-13T01:14:00.000Z',
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      tipo: 'coppia',
      causa: 'coppia_non_stoccata',
      riferimento: `w${i}:sede-b`,
      nome: `Accessorio ${i + 1} (ACC-${i + 1})`,
      dettaglio: null,
      sede: 'Sede B (rientro resi)',
      conseguenza:
        'Su Shopify l’articolo non è stoccato in questa location (ultimo tentativo: 2026-09-13 01:14): nessuna quantità da leggere o scrivere, la giacenza VestiFlow resta com’è.',
      azione: {
        tipo: 'shopify',
        etichetta:
          'Su Shopify: stocca l’articolo nella location, se deve vendersi da questa sede; poi «Allinea giacenze» qui',
        riferimento: null,
      },
      apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: `q${i}` },
      rilevatoAt: '2026-09-13T01:14:00.000Z',
    })),
    {
      tipo: 'articolo',
      causa: 'articolo_sku_ambiguo',
      riferimento: 'p-cintura',
      nome: 'Cintura pelle',
      dettaglio: null,
      sede: null,
      conseguenza:
        'Lo stesso SKU esiste dalle due parti senza collegamento: l’articolo non è sincronizzato.',
      azione: {
        tipo: 'apri_articolo',
        etichetta: 'Apri l’articolo e collega la variante Shopify giusta',
        riferimento: 'p-cintura',
      },
      apri: { tipo: 'apri_articolo', etichetta: 'Apri l’articolo', riferimento: 'p-cintura' },
      rilevatoAt: null,
    },
  ];
}

export function percorsoAttivato() {
  return {
    presente: true,
    status: 'attivato',
    direction: 'shopify_to_vestiflow',
    locations: [
      {
        shopifyLocationId: '11',
        name: 'Shop location',
        active: true,
        choice: 'collega',
        locationId: 'loc-b',
        locationName: 'Sede B (rientro resi)',
      },
      {
        shopifyLocationId: '22',
        name: 'Magazzino test 3',
        active: true,
        choice: 'lascia',
        locationId: null,
        locationName: null,
      },
    ],
    sediVestiFlow: [
      { id: 'loc-a', name: 'Sede A (spedizione)', code: 'S1', shopifyLocationId: null },
      { id: 'loc-b', name: 'Sede B (rientro resi)', code: 'S2', shopifyLocationId: '11' },
    ],
    anteprima: {
      computedAt: '2026-09-13T00:55:00.000Z',
      direction: 'shopify_to_vestiflow',
      catalogo: {
        remoti: 56,
        locali: 1,
        collegati: 1,
        daImportare: 55,
        daAggiornare: 0,
        daPubblicare: 0,
        ambigui: [],
      },
      sedi: {
        collegate: [
          {
            locationId: 'loc-b',
            nome: 'Sede B (rientro resi)',
            shopifyLocationId: '11',
            shopifyName: 'Shop location',
          },
        ],
        lasciate: [{ shopifyLocationId: '22', shopifyName: 'Magazzino test 3' }],
        daDecidere: [],
      },
      quantita: {
        coppie: 82,
        righe: [],
        righeTotali: 25,
        nonDeterminabili: [],
        articoliNuovi: 55,
      },
      ordini: {
        aperti: 4,
        parziali: 0,
        senzaSede: 2,
        giaInVestiFlow: 0,
        elenco: [],
      },
      blocchi: [],
    },
    esito: {
      fase: 'concluso',
      startedAt: '2026-09-13T00:58:00.000Z',
      finishedAt: '2026-09-13T00:59:03.000Z',
      interruzione: null,
      catalogo: { imported: 55, updated: 0, skipped: 0, failed: 0, esclusiAmbigui: 1 },
      quantita: { coppie: 82, scritte: 25, invariate: 50, giaScritte: 0, nonDeterminabili: 7 },
      allinea: null,
      esclusi: [],
      attivazione: {
        ordini: { totale: 4, acquisiti: 4, giaPresenti: 0, senzaSede: 2, parziali: 0, falliti: 0 },
        base: {
          totale: 0,
          allineate: 0,
          giaAllineate: 0,
          nonAllineate: 0,
          fermo: {
            motivo:
              'Quantità ferma verso Shopify: gli ordini #1010, #1011 sono aperti senza una sede determinabile.',
            ordini: ['#1010', '#1011'],
          },
        },
        ordersSinceId: '1011',
      },
    },
    confirmedAt: '2026-09-13T00:58:00.000Z',
    activatedAt: '2026-09-13T01:14:00.000Z',
    blocchiAttivazione: [],
    irrisolti: [],
    trasferimentoInCorso: false,
    situazione: { calcolataAt: '2026-09-13T03:40:00.000Z', problemi: problemiDelCollaudo() },
  };
}

export const CONNESSIONE_SANA = {
  ...CONNESSIONE_ATTIVA,
  scopes: [...CONNESSIONE_ATTIVA.scopes, AMBITO_FO],
  scopeDiagnostics: {
    ...CONNESSIONE_ATTIVA.scopeDiagnostics,
    granted: CONNESSIONE_ATTIVA.scopeDiagnostics.requested,
    missingFromGrant: [],
  },
  webhookTopics: [
    ...CONNESSIONE_ATTIVA.webhookTopics,
    'fulfillment_orders/moved',
    'fulfillment_orders/order_routing_complete',
  ],
  webhookMissingTopics: [],
};
