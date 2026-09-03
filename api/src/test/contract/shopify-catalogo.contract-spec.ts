import { beforeAll, describe, expect, it } from 'vitest';

import { ShopifyConfigService } from '../../shopify/shopify-config.service';
import { ShopifyGraphqlClient } from '../../shopify/shopify-graphql.client';
import { ShopifyRateLimiterService } from '../../shopify/shopify-rate-limiter.service';
import {
  buildShopifyScopeDiagnostics,
  parseShopifyScopesCsv,
  shopifyHasPublicationsScopes,
} from '../../shopify/shopify-scopes.util';
import { caricaEnvApi, configDaAmbiente, credenzialiShop } from './shopify-credenziali';
import type { CredenzialiShop } from './shopify-credenziali';

/**
 * ⭐ **IL GATE DI CONTRATTO: le primitive della Tranche 2A contro Shopify VERO.**
 *
 * ```
 * VESTIFLOW_SHOPIFY_CONTRACT_SHOP=xxx.myshopify.com  npm run test:shopify:contract
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
  cred = await credenzialiShop();
  config = new ShopifyConfigService(configDaAmbiente());
  client = new ShopifyGraphqlClient(config, new ShopifyRateLimiterService(config));

  // ── LA BARRIERA, prima di qualunque scrittura ────────────────────────────
  const negozio = await leggi<{
    shop: { myshopifyDomain: string; plan: { displayName: string; partnerDevelopment: boolean } };
  }>('{ shop { myshopifyDomain plan { displayName partnerDevelopment } } }');

  if (negozio.shop.plan.partnerDevelopment !== true) {
    throw new Error(
      `⛔ «${negozio.shop.myshopifyDomain}» NON è uno shop di sviluppo ` +
        `(piano: ${negozio.shop.plan.displayName}). Il gate scrive: si ferma qui.`,
    );
  }

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

  it('publication: o si pubblica davvero, o si dice PERCHÉ non si può', async () => {
    const diagnostica = buildShopifyScopeDiagnostics(
      parseShopifyScopesCsv(process.env['SHOPIFY_SCOPES'] ?? ''),
      cred.scopes,
    );

    if (!shopifyHasPublicationsScopes(cred.scopes)) {
      // ⛔ Il negozio collegato non ha gli ambiti: la diagnostica DEVE dirlo, e
      //    la chiamata deve fallire nominando lo scope mancante — non con un
      //    errore generico che chi legge non sa a cosa attribuire.
      expect(diagnostica.publicationsBlockedReason).not.toBe('none');
      expect(diagnostica.missingForPublications.length).toBeGreaterThan(0);

      await expect(client.listPublications(cred.shopDomain, cred.accessToken)).rejects.toThrow(
        /read_publications/,
      );
      return;
    }

    expect(diagnostica.publicationsBlockedReason).toBe('none');
    const canali = await client.listPublications(cred.shopDomain, cred.accessToken);
    expect(canali.length).toBeGreaterThan(0);

    const corrente = await stato();
    const variante = corrente.variants.nodes[0]!;
    const canale = canali[0]!.id;

    await client.publishablePublish(cred.shopDomain, cred.accessToken, variante.id, [canale]);
    // ⛔ Si esce SEMPRE non pubblicati: il gate non lascia in vendita niente.
    await client.publishableUnpublish(cred.shopDomain, cred.accessToken, variante.id, [canale]);
  });

  it('collezioni manuali: deprecate in 2026-07, e la sostituta NON esiste ancora', async () => {
    // ⚠️ Non eseguite per davvero: sul negozio non esiste una collezione
    //    DEDICATA alla prova, e agire su una collezione vera modificherebbe
    //    dati che questo gate non ha creato. Resta la verifica più forte
    //    disponibile senza toccarli: lo schema vero.
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

      // ⛔ **Sono DEPRECATE, e si usano lo stesso.** Shopify rimanda a
      //    `collectionUpdate` con `inclusion.selectionsToAdd`, ma in `2026-07`
      //    quel campo NON esiste in `CollectionInput` — e `products` è
      //    valido «only with collectionCreate». In questa versione non c'è
      //    altra via per cambiare l'appartenenza a una collezione manuale.
      expect(mutazione!.isDeprecated).toBe(true);
    }

    // ⭐ **Questa è la sveglia**: quando diventerà rossa, la sostituta sarà
    //    arrivata nella versione fissata e le due primitive andranno migrate
    //    a `collectionUpdate`. Finché è verde, migrare non si può.
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

    const finale = await leggi<{
      product: { status: string; publishedAt: string | null; totalInventory: number };
    }>('query($id: ID!) { product(id: $id) { status publishedAt totalInventory } }', {
      id: idProdotto,
    });
    expect(finale.product.status).toBe('DRAFT');
    expect(finale.product.publishedAt).toBeNull();
    expect(finale.product.totalInventory).toBe(0);
  });
});
