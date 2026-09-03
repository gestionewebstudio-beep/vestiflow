import { beforeAll, describe, expect, it } from 'vitest';

import { ShopifyConfigService } from '../../shopify/shopify-config.service';
import { ShopifyGraphqlClient } from '../../shopify/shopify-graphql.client';
import { ShopifyRateLimiterService } from '../../shopify/shopify-rate-limiter.service';
import {
  buildShopifyScopeDiagnostics,
  parseShopifyScopesCsv,
  shopifyHasPublicationsScopes,
} from '../../shopify/shopify-scopes.util';
import {
  assertGateAbilitato,
  caricaEnvApi,
  configDaAmbiente,
  credenzialiShop,
  VARIABILE_CONSENSO,
} from './shopify-credenziali';
import type { CredenzialiShop } from './shopify-credenziali';

/**
 * ⭐ **IL GATE DI CONTRATTO: le primitive della Tranche 2A contro Shopify VERO.**
 *
 * ```
 * SHOPIFY_CONTRACT_TEST=1 VESTIFLOW_SHOPIFY_CONTRACT_SHOP=xxx.myshopify.com \
 *   npm run test:shopify:contract
 * ```
 *
 * ⛔ **Non gira in nessuna suite ordinaria, e non può.** Il suffisso
 *    `.contract-spec.ts` non corrisponde né a `src/**\/*.spec.ts` (`npm test`) né
 *    a `src/**\/*.integration-spec.ts` (`npm run test:integration`): l'unico
 *    modo di eseguirlo è lo script dedicato, che usa `vitest.contract.config.ts`.
 *
 * ⛔ **E non salta MAI in silenzio.** Senza dominio, senza token o senza rete
 *    questo file FALLISCE. Un gate che diventa verde quando non ha verificato
 *    niente è peggio di un gate assente: fa credere provato ciò che non lo è.
 *
 * ⭐ **A che serve, dato che i test con mock esistono già.** I mock provano che
 *    cosa VestiFlow manda; solo questo prova che Shopify lo ACCETTI. Alla prima
 *    esecuzione, il 03/09/2026, ha trovato tre difformità che nessun mock poteva
 *    vedere — `@idempotent` in posizione sbagliata, `ignoreCompareQuantity`
 *    inesistente in `2026-07`, `compareQuantity` rinominato in
 *    `changeFromQuantity` — e una firma troppo permissiva su `OptionReorderInput`.
 *
 * ⚠️ **Le sicurezze, in ordine:**
 *    1. lo shop deve dichiarare `plan.partnerDevelopment === true`, o si ferma
 *       prima di qualunque scrittura;
 *    2. si tocca **un solo** prodotto, marcato dal tag `vestiflow-contract-test`,
 *       creato in `DRAFT` e riusato alle esecuzioni successive;
 *    3. non esiste alcuna cancellazione remota: il client non ha
 *       `productDelete` né `productVariantsBulkDelete`, e questo file non ne
 *       inventa una;
 *    4. alla fine il prodotto resta `DRAFT`, non pubblicato, a giacenza zero.
 */

const TAG = 'vestiflow-contract-test';
const TITOLO = 'VestiFlow - prova contratto 2A (non vendere)';
const RIFERIMENTO = 'vestiflow://collaudo/contratto-2a';
/** Collezione creata E distrutta dal gate: non sopravvive alla corsa. */
const COLLEZIONE = 'VestiFlow - collaudo contratto 2A';

interface Opzione {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly optionValues: readonly { readonly id: string; readonly name: string }[];
}

interface Variante {
  readonly id: string;
  readonly sku: string | null;
  readonly inventoryPolicy: string;
  readonly inventoryItem: { readonly id: string; readonly tracked: boolean } | null;
  readonly selectedOptions: readonly { readonly name: string; readonly value: string }[];
}

interface StatoProdotto {
  readonly id: string;
  readonly status: string;
  readonly publishedAt: string | null;
  readonly options: readonly Opzione[];
  readonly variants: { readonly nodes: readonly Variante[] };
}

let cred: CredenzialiShop;
let client: ShopifyGraphqlClient;
let config: ShopifyConfigService;
let idProdotto: string;
/** Vero solo dopo che ENTRAMBE le condizioni di scrittura sono verificate. */
let scritturaConsentita = false;

/**
 * Lettura grezza per ciò che il client NON espone: l'identità del negozio, lo
 * stato del prodotto per la riverifica, l'introspezione dello schema.
 *
 * ⚠️ Non è un client parallelo e non deve diventarlo: qui non passa nessuna
 *    operazione di scrittura. Tutto ciò che scrive passa dalle primitive vere,
 *    o il gate proverebbe sé stesso.
 */
async function leggi<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const risposta = await fetch(
    `https://${cred.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': cred.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  const corpo = (await risposta.json()) as { data?: T; errors?: { message: string }[] };
  if (corpo.errors?.length) {
    throw new Error(corpo.errors.map((e) => e.message).join(' · '));
  }
  if (!corpo.data) {
    throw new Error(`Risposta senza dati (HTTP ${risposta.status})`);
  }
  return corpo.data;
}

/**
 * Mutation di FIXTURE: quello che il gate deve **preparare**, non quello che
 * deve **provare**.
 *
 * ⛔ **La distinzione non è formale.** VestiFlow non crea né elimina collezioni
 *    — `docs/24` §9.6 dice «si aggiunge o si toglie il prodotto, non si crea né
 *    si rinomina la collezione» — quindi `collectionCreate` e
 *    `collectionDelete` NON sono primitive della 2A e non devono entrare nel
 *    client: sarebbero superficie che nessun percorso userà mai. Servono qui, e
 *    solo qui, per avere una collezione **di prova** su cui esercitare le due
 *    primitive vere.
 *
 * ⚠️ Ciò che è **sotto prova** passa sempre dal client compilato. Se una
 *    primitiva della 2A venisse esercitata da qui, il gate proverebbe sé stesso.
 */
async function fixture<T>(mutation: string, variables: Record<string, unknown> = {}): Promise<T> {
  assertScritturaConsentita();
  return leggi<T>(mutation, variables);
}

/**
 * ⛔ **LA SECONDA CONDIZIONE.** La prima (`SHOPIFY_CONTRACT_TEST=1`) sta sul
 *    token; questa la può dare solo il negozio, e vale per ogni scrittura —
 *    fixture comprese.
 */
function assertScritturaConsentita(): void {
  if (!scritturaConsentita) {
    throw new Error(
      'Scrittura non consentita: lo shop non ha confermato «partnerDevelopment: true», ' +
        `oppure ${VARIABILE_CONSENSO} non vale «1».`,
    );
  }
}

async function stato(): Promise<StatoProdotto> {
  const dati = await leggi<{ product: StatoProdotto | null }>(
    `query($id: ID!) {
      product(id: $id) {
        id status publishedAt
        options { id name position optionValues { id name } }
        variants(first: 30) {
          nodes {
            id sku inventoryPolicy
            inventoryItem { id tracked }
            selectedOptions { name value }
          }
        }
      }
    }`,
    { id: idProdotto },
  );
  if (!dati.product) {
    throw new Error('Il prodotto di prova non è più leggibile.');
  }
  return dati.product;
}

function chiaveIdempotenza(): string {
  return `vf-contract-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

beforeAll(async () => {
  caricaEnvApi();

  // ── CONDIZIONE 1 · il consenso esplicito di chi lancia ───────────────────
  assertGateAbilitato();

  cred = await credenzialiShop();
  config = new ShopifyConfigService(configDaAmbiente());
  client = new ShopifyGraphqlClient(config, new ShopifyRateLimiterService(config));

  // ── CONDIZIONE 2 · la conferma del negozio, prima di qualunque scrittura ──
  //
  // ⚠️ Le due condizioni proteggono da errori DIVERSI: la variabile dice «so
  //    che questo scrive», il piano dice «e il bersaglio non è un negozio
  //    vero». Nessuna delle due basta da sola — un negozio reale raggiunto con
  //    la variabile impostata sarebbe esattamente l'incidente da evitare.
  const negozio = await leggi<{
    shop: { myshopifyDomain: string; plan: { displayName: string; partnerDevelopment: boolean } };
  }>('{ shop { myshopifyDomain plan { displayName partnerDevelopment } } }');

  if (negozio.shop.plan.partnerDevelopment !== true) {
    throw new Error(
      `⛔ «${negozio.shop.myshopifyDomain}» NON è uno shop di sviluppo ` +
        `(piano: ${negozio.shop.plan.displayName}). Il gate scrive: si ferma qui.`,
    );
  }

  scritturaConsentita = true;

  // ── il prodotto di prova: si riusa, non si duplica ───────────────────────
  const trovati = await leggi<{ products: { nodes: readonly { id: string }[] } }>(
    'query($q: String!) { products(first: 5, query: $q) { nodes { id } } }',
    { q: `tag:${TAG}` },
  );
  const esistente = trovati.products.nodes[0];
  idProdotto = esistente
    ? esistente.id
    : (
        await client.createProduct(cred.shopDomain, cred.accessToken, {
          title: TITOLO,
          descriptionHtml: '<p>Prodotto di collaudo del contratto GraphQL. Non vendibile.</p>',
          vendor: 'VestiFlow',
          productType: 'Collaudo',
          tags: [TAG],
          status: 'DRAFT',
          productOptions: [{ name: 'Taglia', values: [{ name: 'M' }] }],
          variants: [
            {
              optionValues: [{ optionName: 'Taglia', name: 'M' }],
              price: '9.99',
              sku: 'VF-CONTRACT-M',
            },
          ],
        })
      ).id;
}, 120_000);

describe('Contratto GraphQL del catalogo Shopify — shop di sviluppo', () => {
  it('lo shop di prova è di sviluppo, e il prodotto di prova è in bozza', async () => {
    const corrente = await stato();
    expect(corrente.status).toBe('DRAFT');
    expect(corrente.publishedAt).toBeNull();
  });

  it('productSet crea il prodotto con opzione e variante (sola creazione)', async () => {
    const corrente = await stato();
    expect(corrente.options.map((o) => o.name)).toContain('Taglia');
    expect(corrente.variants.nodes.some((v) => v.sku === 'VF-CONTRACT-M')).toBe(true);
  });

  it('productOptionsCreate con LEAVE_AS_IS aggiunge un opzione senza perdere varianti', async () => {
    const prima = await stato();
    const varianti = prima.variants.nodes.length;

    if (!prima.options.some((o) => o.name.startsWith('Colore'))) {
      await client.createProductOptions(cred.shopDomain, cred.accessToken, idProdotto, [
        { name: 'Colore', values: [{ name: 'Rosso' }] },
      ]);
    }

    const dopo = await stato();
    expect(dopo.options.some((o) => o.name.startsWith('Colore'))).toBe(true);
    // ⭐ Il punto della strategia: nessuna variante creata, nessuna cancellata.
    //    Quelle esistenti ricevono il primo valore della nuova opzione.
    expect(dopo.variants.nodes.length).toBe(varianti);
    for (const variante of dopo.variants.nodes) {
      expect(variante.selectedOptions.length).toBe(dopo.options.length);
    }
  });

  it('productOptionUpdate rinomina l opzione e ne aggiunge un valore', async () => {
    const prima = await stato();
    const colore = prima.options.find((o) => o.name.startsWith('Colore'));
    expect(colore).toBeDefined();

    await client.updateProductOption(cred.shopDomain, cred.accessToken, idProdotto, {
      id: colore!.id,
      name: 'Colore prova',
      optionValuesToAdd: colore!.optionValues.some((v) => v.name === 'Blu')
        ? undefined
        : [{ name: 'Blu' }],
    });

    const dopo = await stato();
    const aggiornata = dopo.options.find((o) => o.id === colore!.id);
    expect(aggiornata?.name).toBe('Colore prova');
    expect(aggiornata?.optionValues.map((v) => v.name)).toEqual(
      expect.arrayContaining(['Rosso', 'Blu']),
    );
  });

  it('⛔ productOptionsReorder accetta SOLO id (non id e name insieme)', async () => {
    const prima = await stato();
    const invertite = [...prima.options].reverse().map((o) => ({ id: o.id }));

    await client.reorderProductOptions(cred.shopDomain, cred.accessToken, idProdotto, invertite);

    const invertito = await stato();
    expect(invertito.options.map((o) => o.name)).toEqual(
      [...prima.options].reverse().map((o) => o.name),
    );

    // Si rimette l'ordine di partenza: il prodotto è condiviso fra esecuzioni.
    await client.reorderProductOptions(
      cred.shopDomain,
      cred.accessToken,
      idProdotto,
      prima.options.map((o) => ({ id: o.id })),
    );
    const ripristinato = await stato();
    expect(ripristinato.options.map((o) => o.name)).toEqual(prima.options.map((o) => o.name));
  });

  it('productVariantsBulkCreate aggiunge una combinazione nuova, tracciata', async () => {
    const prima = await stato();
    const nomi = prima.options.map((o) => o.name);
    const desiderata: Record<string, string> = { Taglia: 'L', 'Colore prova': 'Blu' };
    const gia = prima.variants.nodes.some((v) => v.sku === 'VF-CONTRACT-L-BLU');

    if (!gia) {
      const create = await client.bulkCreateVariants(
        cred.shopDomain,
        cred.accessToken,
        idProdotto,
        [
          {
            optionValues: nomi.map((n) => ({ optionName: n, name: desiderata[n] as string })),
            price: '19.99',
            inventoryPolicy: 'DENY',
            inventoryItem: { sku: 'VF-CONTRACT-L-BLU', tracked: true },
          },
        ],
      );
      expect(create).toHaveLength(1);
      expect(create[0]?.inventoryItemId).toBeTruthy();
    }

    const dopo = await stato();
    const nuova = dopo.variants.nodes.find((v) => v.sku === 'VF-CONTRACT-L-BLU');
    expect(nuova).toBeDefined();
    expect(nuova?.inventoryItem?.tracked).toBe(true);
  });

  it('productVariantsBulkUpdate cambia inventoryPolicy e prezzo, e torna indietro', async () => {
    const prima = await stato();
    const variante = prima.variants.nodes.find((v) => v.sku === 'VF-CONTRACT-L-BLU');
    expect(variante).toBeDefined();

    await client.bulkUpdateVariants(cred.shopDomain, cred.accessToken, idProdotto, [
      { id: variante!.id, price: '21.50', inventoryPolicy: 'CONTINUE' },
    ]);
    const conContinue = await stato();
    expect(conContinue.variants.nodes.find((v) => v.id === variante!.id)?.inventoryPolicy).toBe(
      'CONTINUE',
    );

    await client.bulkUpdateVariants(cred.shopDomain, cred.accessToken, idProdotto, [
      { id: variante!.id, price: '19.99', inventoryPolicy: 'DENY' },
    ]);
    const ripristinata = await stato();
    expect(ripristinata.variants.nodes.find((v) => v.id === variante!.id)?.inventoryPolicy).toBe(
      'DENY',
    );
  });

  it('getRemoteQuantities legge la giacenza remota per location', async () => {
    const corrente = await stato();
    const variante = corrente.variants.nodes.find((v) => v.inventoryItem);
    expect(variante).toBeDefined();

    const livelli = await client.getRemoteQuantities(
      cred.shopDomain,
      cred.accessToken,
      variante!.inventoryItem!.id,
    );
    expect(livelli.length).toBeGreaterThan(0);
    expect(livelli[0]?.locationId).toMatch(/^gid:\/\/shopify\/Location\//);
    expect(typeof livelli[0]?.available).toBe('number');
  });

  it('⭐ inventorySetQuantities scrive in assoluto, e il confronto FERMA la scrittura concorrente', async () => {
    const corrente = await stato();
    const variante = corrente.variants.nodes.find((v) => v.sku === 'VF-CONTRACT-L-BLU');
    const item = variante!.inventoryItem!.id;

    const [livello] = await client.getRemoteQuantities(cred.shopDomain, cred.accessToken, item);
    const partenza = livello!.available ?? 0;

    // 1 · scrittura valida: il valore arriva
    await client.setInventoryQuantities(cred.shopDomain, cred.accessToken, {
      reason: 'correction',
      referenceDocumentUri: RIFERIMENTO,
      idempotencyKey: chiaveIdempotenza(),
      quantities: [
        {
          inventoryItemId: item,
          locationId: livello!.locationId,
          quantity: partenza + 3,
          changeFromQuantity: partenza,
        },
      ],
    });
    const [dopoScrittura] = await client.getRemoteQuantities(
      cred.shopDomain,
      cred.accessToken,
      item,
    );
    expect(dopoScrittura?.available).toBe(partenza + 3);

    // 2 · confronto sbagliato: Shopify rifiuta E NON SCRIVE
    await expect(
      client.setInventoryQuantities(cred.shopDomain, cred.accessToken, {
        reason: 'correction',
        referenceDocumentUri: RIFERIMENTO,
        idempotencyKey: chiaveIdempotenza(),
        quantities: [
          {
            inventoryItemId: item,
            locationId: livello!.locationId,
            quantity: partenza + 50,
            changeFromQuantity: partenza + 99,
          },
        ],
      }),
    ).rejects.toThrow(/no longer matches the persisted quantity/i);

    const [dopoRifiuto] = await client.getRemoteQuantities(cred.shopDomain, cred.accessToken, item);
    expect(dopoRifiuto?.available).toBe(partenza + 3);

    // 3 · si rimette come si è trovato
    await client.setInventoryQuantities(cred.shopDomain, cred.accessToken, {
      reason: 'correction',
      referenceDocumentUri: RIFERIMENTO,
      idempotencyKey: chiaveIdempotenza(),
      quantities: [
        {
          inventoryItemId: item,
          locationId: livello!.locationId,
          quantity: partenza,
          changeFromQuantity: partenza + 3,
        },
      ],
    });
  });

  it('la VARIANTE è Publishable in 2026-07: è il presupposto di tutto §10.1', async () => {
    // ⭐ Verificabile SENZA gli ambiti publication, perché l'introspezione non
    //    è ristretta. Ed è la cosa da verificare per prima: se la variante non
    //    fosse pubblicabile, ritirare una singola taglia senza toccare le
    //    quantità — che è la decisione di docs/24 §10.1 — non sarebbe possibile.
    const dati = await leggi<{
      variante: { interfaces: readonly { name: string }[]; fields: readonly { name: string }[] };
    }>(`{
      variante: __type(name: "ProductVariant") {
        interfaces { name }
        fields(includeDeprecated: true) { name }
      }
    }`);

    expect(dati.variante.interfaces.map((i) => i.name)).toContain('Publishable');
    expect(dati.variante.fields.map((f) => f.name)).toContain('publishedOnPublication');
  });

  it('publication: o si eseguono tutte e cinque, o si dice PERCHÉ non si può', async () => {
    const diagnostica = buildShopifyScopeDiagnostics(
      parseShopifyScopesCsv(process.env['SHOPIFY_SCOPES'] ?? ''),
      cred.scopes,
    );

    if (!shopifyHasPublicationsScopes(cred.scopes)) {
      // ⛔ Il negozio collegato non ha gli ambiti: la diagnostica DEVE dirlo, e
      //    ognuna delle tre chiamate deve fallire NOMINANDO lo scope mancante —
      //    non con un errore generico che chi legge non sa a cosa attribuire.
      expect(diagnostica.publicationsBlockedReason).not.toBe('none');
      expect(diagnostica.missingForPublications.length).toBeGreaterThan(0);

      const corrente = await stato();
      const variante = corrente.variants.nodes[0]!;
      const canaleFinto = 'gid://shopify/Publication/1';

      await expect(client.listPublications(cred.shopDomain, cred.accessToken)).rejects.toThrow(
        /read_publications/,
      );
      await expect(
        client.publishablePublish(cred.shopDomain, cred.accessToken, variante.id, [canaleFinto]),
      ).rejects.toThrow(/write_publications/);
      await expect(
        client.publishableUnpublish(cred.shopDomain, cred.accessToken, variante.id, [canaleFinto]),
      ).rejects.toThrow(/write_publications/);
      return;
    }

    // ── da qui: gli ambiti ci sono, e si eseguono le cinque operazioni ──────
    expect(diagnostica.publicationsBlockedReason).toBe('none');

    // 1 · elenco dei canali
    const canali = await client.listPublications(cred.shopDomain, cred.accessToken);
    expect(canali.length).toBeGreaterThan(0);
    const canale = canali[0]!.id;

    const corrente = await stato();
    const variante = corrente.variants.nodes[0]!;
    const pubblicabili = [idProdotto, ...corrente.variants.nodes.map((v) => v.id)];

    const pubblicato = async (gid: string): Promise<boolean> => {
      const dati = await leggi<{ nodo: { publishedOnPublication: boolean } | null }>(
        'query($id: ID!, $pub: ID!) { nodo: node(id: $id) { ... on Publishable { publishedOnPublication(publicationId: $pub) } } }',
        { id: gid, pub: canale },
      );
      return dati.nodo?.publishedOnPublication === true;
    };

    // ⛔ **Il prodotto passa temporaneamente ad ACTIVE, e non è un dettaglio.**
    //    Su un prodotto in bozza `publishablePublish` RIESCE — le varianti
    //    risultano pubblicate — ma `publishedOnPublication` del PRODOTTO resta
    //    `false`: un draft non è disponibile su nessun canale, per definizione.
    //    Misurato sullo shop di sviluppo il 03/09/2026, ed è il motivo per cui
    //    la prima stesura di questa prova falliva pur avendo pubblicato davvero.
    //
    // ⚠️ Lo stato si ripristina nel `finally`: il gate non lascia mai un
    //    prodotto ACTIVE, nemmeno quando un'asserzione fallisce a metà.
    await client.setProductStatus(cred.shopDomain, cred.accessToken, idProdotto, 'ACTIVE');

    try {
      // 2 · prodotto: pubblica
      await client.publishablePublish(cred.shopDomain, cred.accessToken, idProdotto, [canale]);
      expect(await pubblicato(idProdotto)).toBe(true);

      // 3 · prodotto: ritira
      await client.publishableUnpublish(cred.shopDomain, cred.accessToken, idProdotto, [canale]);
      expect(await pubblicato(idProdotto)).toBe(false);

      // 4 · variante: pubblica — è ciò che permette di ritirare UNA taglia
      //     senza toccare quantità né `inventoryPolicy` (docs/24 §10.1).
      await client.publishablePublish(cred.shopDomain, cred.accessToken, variante.id, [canale]);
      expect(await pubblicato(variante.id)).toBe(true);

      // 5 · variante: ritira
      await client.publishableUnpublish(cred.shopDomain, cred.accessToken, variante.id, [canale]);
      expect(await pubblicato(variante.id)).toBe(false);
    } finally {
      // ⛔ **Il ritiro di sicurezza vale ANCHE quando la prova fallisce.**
      //    Senza, un rosso a metà lascia una risorsa pubblicata sul negozio —
      //    è successo davvero il 03/09/2026: l'asserzione sul prodotto in bozza
      //    ha interrotto la prova e la variante è rimasta in vendita.
      //
      // ⚠️ Su TUTTI i canali, non solo quello usato: pubblicare il prodotto
      //    propaga alle sue varianti, quindi il ritiro deve coprire tutto
      //    ciò che potrebbe essere rimasto pubblicato. L'errore si ignora:
      //    ritirare ciò che non è pubblicato non è un problema, e un rosso
      //    qui maschererebbe il rosso vero.
      for (const pubblicazione of canali) {
        for (const gid of pubblicabili) {
          try {
            await client.publishableUnpublish(cred.shopDomain, cred.accessToken, gid, [
              pubblicazione.id,
            ]);
          } catch {
            // già ritirato, o mai pubblicato: va bene così
          }
        }
      }
      await client.setProductStatus(cred.shopDomain, cred.accessToken, idProdotto, 'DRAFT');
    }
  });
  it('⭐ collezioni manuali: creazione, aggiunta, appartenenza, rimozione, eliminazione', async () => {
    interface Collezione {
      readonly id: string;
      readonly title: string;
    }
    interface Appartenenza {
      readonly collection: {
        readonly productsCount: { readonly count: number };
        readonly products: { readonly nodes: readonly { readonly id: string }[] };
      } | null;
    }

    const QUERY_APPARTENENZA = `query($id: ID!) {
      collection(id: $id) {
        productsCount { count }
        products(first: 50) { nodes { id } }
      }
    }`;

    const appartenenza = async (idCollezione: string) =>
      (await leggi<Appartenenza>(QUERY_APPARTENENZA, { id: idCollezione })).collection;

    const elimina = async (idCollezione: string) => {
      const esito = await fixture<{
        collectionDelete: {
          deletedCollectionId: string | null;
          userErrors: readonly { message: string }[];
        };
      }>(
        `mutation($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) { deletedCollectionId userErrors { field message } }
        }`,
        { input: { id: idCollezione } },
      );
      expect(esito.collectionDelete.userErrors).toEqual([]);
      return esito.collectionDelete.deletedCollectionId;
    };

    // ── 0 · una corsa precedente interrotta può aver lasciato la collezione ──
    const residue = await leggi<{ collections: { nodes: readonly Collezione[] } }>(
      'query($q: String!) { collections(first: 10, query: $q) { nodes { id title } } }',
      { q: `title:'${COLLEZIONE}'` },
    );
    for (const vecchia of residue.collections.nodes.filter((c) => c.title === COLLEZIONE)) {
      await elimina(vecchia.id);
    }

    // ── 1 · creazione ───────────────────────────────────────────────────────
    //
    // ⚠️ `collectionCreate` prende `CollectionCreateInput` (non `CollectionInput`)
    //    e vuole `title`. Senza `ruleSet` la collezione nasce MANUALE, che è
    //    l'unico tipo su cui l'appartenenza si può scrivere.
    const creata = await fixture<{
      collectionCreate: {
        collection: { id: string; ruleSet: unknown | null } | null;
        userErrors: readonly { message: string }[];
      };
    }>(
      `mutation($collection: CollectionCreateInput!) {
        collectionCreate(collection: $collection) {
          collection { id ruleSet { appliedDisjunctively } }
          userErrors { field message }
        }
      }`,
      { collection: { title: COLLEZIONE } },
    );
    expect(creata.collectionCreate.userErrors).toEqual([]);
    const idCollezione = creata.collectionCreate.collection!.id;
    expect(creata.collectionCreate.collection!.ruleSet).toBeNull();
    expect((await appartenenza(idCollezione))!.productsCount.count).toBe(0);

    try {
      // ── 2 · aggiunta, con la PRIMITIVA della 2A ──────────────────────────
      await client.addProductToCollection(cred.shopDomain, cred.accessToken, idCollezione, [
        idProdotto,
      ]);

      // ── 3 · appartenenza verificata leggendo la collezione ───────────────
      const dopoAggiunta = (await appartenenza(idCollezione))!;
      expect(dopoAggiunta.productsCount.count).toBe(1);
      expect(dopoAggiunta.products.nodes.map((n) => n.id)).toEqual([idProdotto]);

      // ── 4 · rimozione. ⛔ Restituisce un JOB: è asincrona ─────────────────
      const job = await client.removeProductFromCollection(
        cred.shopDomain,
        cred.accessToken,
        idCollezione,
        [idProdotto],
      );
      expect(typeof job === 'string' || job === null).toBe(true);

      // ⚠️ Con un solo prodotto è risultata già applicata al ritorno, ma il
      //    payload è un job: si concede qualche tentativo invece di dare per
      //    scontato un tempo che Shopify non promette.
      let rimasti = (await appartenenza(idCollezione))!.productsCount.count;
      for (let tentativo = 0; tentativo < 5 && rimasti > 0; tentativo += 1) {
        await new Promise((risolvi) => setTimeout(risolvi, 1_000));
        rimasti = (await appartenenza(idCollezione))!.productsCount.count;
      }
      expect(rimasti).toBe(0);
    } finally {
      // ── 5 · eliminazione: la collezione di prova non sopravvive al gate ───
      expect(await elimina(idCollezione)).toBe(idCollezione);
      expect(await appartenenza(idCollezione)).toBeNull();
    }
  });

  it('collezioni: le due primitive sono DEPRECATE, e la sostituta non esiste ancora', async () => {
    const dati = await leggi<{
      mutazioni: {
        fields: readonly {
          name: string;
          isDeprecated: boolean;
          deprecationReason: string | null;
          args: readonly { name: string }[];
        }[];
      };
      collectionInput: { inputFields: readonly { name: string }[] };
    }>(`{
      mutazioni: __type(name: "Mutation") {
        fields(includeDeprecated: true) { name isDeprecated deprecationReason args { name } }
      }
      collectionInput: __type(name: "CollectionInput") { inputFields { name } }
    }`);

    for (const nome of ['collectionAddProducts', 'collectionRemoveProducts']) {
      const mutazione = dati.mutazioni.fields.find((f) => f.name === nome);
      expect(mutazione, `la mutation ${nome} non esiste in questa versione API`).toBeDefined();
      expect(mutazione!.args.map((a) => a.name).sort()).toEqual(['id', 'productIds']);

      // ⛔ **Sono DEPRECATE, e si usano lo stesso** — la prova qui sopra le
      //    esegue davvero. Shopify rimanda a `collectionUpdate` con
      //    `inclusion.selectionsToAdd`, ma in `2026-07` quel campo NON esiste
      //    in `CollectionInput`, e `products` è valido «only with
      //    collectionCreate». Non c'è altra via, e non se ne inventa una.
      expect(mutazione!.isDeprecated).toBe(true);
    }

    // ⭐ **La sveglia**: quando diventerà rossa, la sostituta sarà arrivata
    //    nella versione fissata e le due primitive andranno migrate.
    const campi = dati.collectionInput.inputFields.map((f) => f.name);
    expect(
      campi.some((n) => n.startsWith('inclusion')),
      'CollectionInput ora espone le inclusioni: migra collectionAddProducts/RemoveProducts a collectionUpdate',
    ).toBe(false);
  });

  it('il prodotto di prova resta in bozza, non pubblicato e a giacenza zero', async () => {
    const corrente = await stato();

    for (const variante of corrente.variants.nodes) {
      if (!variante.inventoryItem) {
        continue;
      }
      const [livello] = await client.getRemoteQuantities(
        cred.shopDomain,
        cred.accessToken,
        variante.inventoryItem.id,
      );
      const disponibile = livello?.available ?? 0;
      if (livello && disponibile !== 0) {
        await client.setInventoryQuantities(cred.shopDomain, cred.accessToken, {
          reason: 'correction',
          referenceDocumentUri: RIFERIMENTO,
          idempotencyKey: chiaveIdempotenza(),
          quantities: [
            {
              inventoryItemId: livello.inventoryItemId,
              locationId: livello.locationId,
              quantity: 0,
              changeFromQuantity: disponibile,
            },
          ],
        });
      }
    }

    // ⛔ **Si verifica sui LIVELLI per location, non su `totalInventory`.**
    //    Quel totale è aggregato ed EVENTUALMENTE CONSISTENTE: misurato il
    //    03/09/2026 diceva ancora `3` mentre i livelli erano già a zero, e
    //    pochi minuti dopo diceva `0` senza che nessuno avesse scritto niente.
    //    I livelli invece rispondono subito, e sono il dato autorevole.
    for (const variante of corrente.variants.nodes) {
      if (!variante.inventoryItem) {
        continue;
      }
      const livelli = await client.getRemoteQuantities(
        cred.shopDomain,
        cred.accessToken,
        variante.inventoryItem.id,
      );
      for (const livello of livelli) {
        expect(livello.available ?? 0).toBe(0);
      }
    }

    const stampa = await leggi<{
      product: { status: string; publishedAt: string | null };
    }>('query($id: ID!) { product(id: $id) { status publishedAt } }', { id: idProdotto });
    expect(stampa.product.status).toBe('DRAFT');
    expect(stampa.product.publishedAt).toBeNull();
  });
});
