/**
 * Il dataset sintetico del **Piano di collaudo Shopify** (`docs/PIANO-COLLAUDO-SHOPIFY.md`).
 *
 * ⭐ **Versionato nel repository, non in uno script dello scratchpad**: e' il primo dei tre
 *    requisiti di «riproducibile» del piano, §1. Uno scenario che dipende da dati scritti a
 *    mano in una sessione non e' ripetibile dalla sessione dopo.
 *
 * ⭐ **Riconoscibile a colpo d'occhio.** Tenant `COLLAUDO ALFA` e `COLLAUDO BETA`, codici
 *    articolo `CLD-*`, GID nella fascia riservata `99xxxx`: una riga trovata fuori posto si
 *    attribuisce subito, senza risalire a chi l'ha scritta.
 *
 * ⛔ **Nessun dato reale e nessuna copia di un tenant vero.** ⚠️ E i GID sintetici non si
 *    usano MAI contro un negozio reale: la` gli identificativi li assegna Shopify, e uno
 *    inventato o non esiste o e' di qualcun altro.
 *
 * ⚠️ **Due tenant, e non e' un vezzo**: l'isolamento non si prova con un tenant solo. Ogni
 *    scenario che afferma «non tocca gli altri» ha bisogno di un altro da non toccare.
 *
 * ⛔ **Questo file DICHIARA i dati, non li scrive.** Chi esegue uno scenario li inserisce
 *    sul database di prova con le proprie fixture: cosi' il dataset resta leggibile come
 *    documento, e nessuno lo esegue per sbaglio.
 */

/** La fascia di GID riservata al collaudo. Fuori di qui non si inventano identificativi. */
export const GID_COLLAUDO_DA = 990000;
export const GID_COLLAUDO_A = 999999;

export const TENANT_COLLAUDO = {
  alfa: { id: 'c1a00000-0000-4000-8000-000000000001', nome: 'COLLAUDO ALFA' },
  beta: { id: 'c1b00000-0000-4000-8000-000000000002', nome: 'COLLAUDO BETA' },
} as const;

/**
 * Le sedi.
 *
 * ⭐ `ALFA-SENZA-CANALE` esiste apposta: serve agli scenari che devono dimostrare che una
 *    sede **non collegata** non riceve niente (`docs/24` §1.13, «senza collegamento non
 *    succede NIENTE»). Senza una sede cosi', quella regola non e' falsificabile.
 *
 * ⭐ `BETA-NEGOZIO` ha lo **stesso nome** di `ALFA-NEGOZIO` di proposito: e' il caso F2 del
 *    piano — due sedi omonime in tenant diversi non devono confondersi mai.
 */
export const SEDI_COLLAUDO = {
  alfaNegozio: {
    id: 'c1a10000-0000-4000-8000-000000000001',
    tenant: TENANT_COLLAUDO.alfa.id,
    nome: 'Negozio Collaudo',
    etichetta: 'ALFA-NEGOZIO',
  },
  alfaMagazzino: {
    id: 'c1a10000-0000-4000-8000-000000000002',
    tenant: TENANT_COLLAUDO.alfa.id,
    nome: 'Magazzino Collaudo',
    etichetta: 'ALFA-MAGAZZINO',
  },
  alfaSenzaCanale: {
    id: 'c1a10000-0000-4000-8000-000000000003',
    tenant: TENANT_COLLAUDO.alfa.id,
    nome: 'Deposito Collaudo',
    etichetta: 'ALFA-SENZA-CANALE',
  },
  betaNegozio: {
    id: 'c1b10000-0000-4000-8000-000000000001',
    tenant: TENANT_COLLAUDO.beta.id,
    // ⭐ Omonimo di ALFA-NEGOZIO, in un altro tenant: e' il caso F2.
    nome: 'Negozio Collaudo',
    etichetta: 'BETA-NEGOZIO',
  },
} as const;

/**
 * Gli articoli, uno per forma di caso.
 *
 * ⚠️ Il **nome dice il caso**: chi legge un fallimento sa subito che cosa stava provando,
 *    senza aprire il piano.
 */
export interface ArticoloCollaudo {
  readonly id: string;
  readonly tenant: string;
  readonly codice: string;
  readonly nome: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  /** Il GID remoto, quando lo scenario parte da un articolo gia' collegato. */
  readonly gid: string | null;
  /** Lo scenario del piano che questo articolo serve. */
  readonly caso: string;
}

export const ARTICOLI_COLLAUDO: readonly ArticoloCollaudo[] = [
  {
    id: 'c1a20000-0000-4000-8000-000000000001',
    tenant: TENANT_COLLAUDO.alfa.id,
    codice: 'CLD-LOCALE-1',
    nome: 'Collaudo solo locale',
    sku: 'CLD-SKU-001',
    barcode: '8000000000017',
    gid: null,
    caso: 'H1, H3 — cestino e eliminazione di un articolo mai collegato',
  },
  {
    id: 'c1a20000-0000-4000-8000-000000000002',
    tenant: TENANT_COLLAUDO.alfa.id,
    codice: 'CLD-COLLEGATO-1',
    nome: 'Collaudo collegato',
    sku: 'CLD-SKU-002',
    barcode: '8000000000024',
    gid: 'gid://shopify/Product/990002',
    caso: 'H2 — il cestino si rifiuta su un articolo collegato',
  },
  {
    id: 'c1a20000-0000-4000-8000-000000000003',
    tenant: TENANT_COLLAUDO.alfa.id,
    codice: 'CLD-OMONIMO-A',
    nome: 'Collaudo omonimo',
    sku: 'CLD-SKU-003',
    barcode: null,
    gid: null,
    caso: 'D3 — due locali omonimi, e un remoto con lo stesso nome',
  },
  {
    id: 'c1a20000-0000-4000-8000-000000000004',
    tenant: TENANT_COLLAUDO.alfa.id,
    codice: 'CLD-OMONIMO-B',
    // ⭐ Stesso nome del precedente: l'omonimia e` il caso, non un errore.
    nome: 'Collaudo omonimo',
    sku: 'CLD-SKU-004',
    barcode: null,
    gid: null,
    caso: 'D3 — il secondo omonimo',
  },
  {
    id: 'c1a20000-0000-4000-8000-000000000005',
    tenant: TENANT_COLLAUDO.alfa.id,
    codice: 'CLD-SENZA-SKU',
    nome: 'Collaudo senza identificativi',
    // ⛔ Ne` SKU ne` barcode: e` il caso D2, quello che dimostra perche' nessuna
    //    regola puo' decidere l'abbinamento. Senza questa riga, D2 non e'
    //    rappresentabile.
    sku: null,
    barcode: null,
    gid: null,
    caso: 'D2 — apparentemente uguale, e nessun identificativo per deciderlo',
  },
  {
    id: 'c1a20000-0000-4000-8000-000000000006',
    tenant: TENANT_COLLAUDO.alfa.id,
    codice: 'CLD-SKU-DOPPIO-A',
    nome: 'Collaudo SKU duplicato',
    // ⚠️ Lo stesso SKU della riga dopo. VestiFlow lo vieta in anagrafica, ma
    //    Shopify NON garantisce SKU univoci: l'import deve importarlo e
    //    SEGNALARLO, non rompersi (`regole-gestionale`, clausola di realta').
    sku: 'CLD-SKU-DOPPIO',
    barcode: null,
    gid: 'gid://shopify/Product/990006',
    caso: 'D4 — SKU duplicato in arrivo da Shopify',
  },
  {
    id: 'c1a20000-0000-4000-8000-000000000007',
    tenant: TENANT_COLLAUDO.alfa.id,
    codice: 'CLD-SKU-DOPPIO-B',
    nome: 'Collaudo SKU duplicato, secondo',
    sku: 'CLD-SKU-DOPPIO',
    barcode: null,
    gid: 'gid://shopify/Product/990007',
    caso: 'D4 — il secondo con lo stesso SKU',
  },
  {
    id: 'c1b20000-0000-4000-8000-000000000001',
    tenant: TENANT_COLLAUDO.beta.id,
    codice: 'CLD-BETA-1',
    // ⭐ Stesso nome e stesso SKU di un articolo di Alfa, in un ALTRO tenant:
    //    e' la riga con cui ogni scenario dimostra l'isolamento.
    nome: 'Collaudo solo locale',
    sku: 'CLD-SKU-001',
    barcode: '8000000000017',
    gid: null,
    caso: 'isolamento — non deve MAI essere toccato da un’azione di Alfa',
  },
];

/**
 * ⚠️ Un identificativo remoto **inventato** vale solo contro un database di prova.
 *
 * ⛔ Chi esegue uno scenario contro un negozio di sviluppo vero deve usare i GID che
 *    Shopify assegna, non questi: un GID della fascia `99xxxx` la' non esiste — o, peggio,
 *    esiste e appartiene a qualcun altro.
 */
export function gidSinteticoAmmesso(gid: string): boolean {
  const numero = Number(gid.split('/').at(-1));
  return Number.isInteger(numero) && numero >= GID_COLLAUDO_DA && numero <= GID_COLLAUDO_A;
}
