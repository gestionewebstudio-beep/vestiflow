import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, it } from 'vitest';

import { ShopifyConfigService } from '../../shopify/shopify-config.service';
import {
  assertGateAbilitato,
  caricaEnvApi,
  configDaAmbiente,
  credenzialiShop,
} from './shopify-credenziali';
import type { CredenzialiShop } from './shopify-credenziali';

/**
 * ⭐ **GATE DI CONTRATTO — `productSet` in SOLA CREAZIONE con l'identità VestiFlow**
 *    (`docs/30` §7.2-ter.3, G9–G11; via del proprietario del 15/09/2026).
 *
 * ```
 * SHOPIFY_CONTRACT_TEST=1 VESTIFLOW_SHOPIFY_CONTRACT_SHOP=xxx.myshopify.com \
 *   npx vitest run --config vitest.contract.config.ts src/test/contract/shopify-identita-productset.contract-spec.ts
 * ```
 *
 * Domanda: `productSet` senza `identifier` e senza `id` può creare prodotto + varianti +
 * identità in UNA mutation, così che la variante iniziale di `productCreate` (e la finestra
 * fra `productCreate` e `bulkCreate`) non esista? Si misura, non si presume:
 *
 *   G9  · sola creazione: due richieste sequenziali e due concorrenti con la stessa identità
 *         lasciano UN prodotto, e quello già creato non viene modificato; residui senza metafield;
 *   G10 · errore su una variante: che cosa viene creato davvero (nessuna atomicità presunta);
 *         conflitto sull'identità di variante;
 *   G11 · tutte le identità, nessuna variante in più, ordine come richiesto — variante unica e
 *         più varianti; rilettura degli id ignorando la risposta.
 *
 * ⛔ Sicurezze: consenso esplicito; il negozio deve essere `partnerDevelopment` e coincidere
 *    col dominio richiesto; le definizioni si RIUSANO (esistono da G1, non si creano);
 *    prodotti in DRAFT col tag di esecuzione; nessuna cancellazione (solo ARCHIVED in coda,
 *    e solo sugli id fotografati alla creazione); alla prima garanzia smentita ci si ferma.
 *    ⛔ Nessun `identifier`, nessun `id` nel payload: mai un aggiornamento via productSet.
 */
const NAMESPACE = 'vestiflow';
const CHIAVE_PRODOTTO = 'product_id';
const CHIAVE_VARIANTE = 'variant_id';
const TAG_GATE = 'vestiflow-contract-test';

interface Esito {
  readonly garanzia: string;
  readonly esito: 'verificata' | 'smentita' | 'saltata';
  readonly dettaglio: string;
}

interface VarianteLetta {
  readonly id: string;
  readonly title: string;
  readonly sku: string | null;
  readonly price: string;
  readonly position: number;
  readonly identita: string | null;
}

interface ProdottoLetto {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly identita: string | null;
  readonly hasOnlyDefaultVariant: boolean;
  readonly opzioni: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly varianti: readonly VarianteLetta[];
}

interface EsitoSet {
  readonly id: string | null;
  readonly varianti: readonly VarianteLetta[];
  readonly errori: readonly { field: string[] | null; message: string; code?: string }[];
  readonly eccezione: string | null;
}

describe('Contratto Shopify — productSet in sola creazione con identità VestiFlow (negozio di sviluppo)', () => {
  let cred: CredenzialiShop;
  let config: ShopifyConfigService;
  const esecuzione = `vf-productset-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const identita = (n: string) => `contratto-${esecuzione}-${n}`;
  /** Gli id dei prodotti CERTAMENTE creati da questa esecuzione: solo questi si archiviano. */
  const creati: string[] = [];
  const esiti: Esito[] = [];
  /** Le fotografie prima/dopo e le risposte grezze: il risultato della prova, salvato su file. */
  const fotografie: Record<string, unknown> = {};
  let fermato: string | null = null;

  async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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

  const CAMPI_PRODOTTO = `
    id
    title
    status
    hasOnlyDefaultVariant
    metafield(namespace: "${NAMESPACE}", key: "${CHIAVE_PRODOTTO}") { value }
    options { name values }
    variants(first: 50) {
      nodes { id title sku price position metafield(namespace: "${NAMESPACE}", key: "${CHIAVE_VARIANTE}") { value } }
    }
  `;

  type ProdottoGrezzo = {
    id: string;
    title: string;
    status: string;
    hasOnlyDefaultVariant: boolean;
    metafield: { value: string } | null;
    options: readonly { name: string; values: readonly string[] }[];
    variants: {
      nodes: readonly {
        id: string;
        title: string;
        sku: string | null;
        price: string;
        position: number;
        metafield: { value: string } | null;
      }[];
    };
  };

  const leggibile = (p: ProdottoGrezzo): ProdottoLetto => ({
    id: p.id,
    title: p.title,
    status: p.status,
    identita: p.metafield?.value ?? null,
    hasOnlyDefaultVariant: p.hasOnlyDefaultVariant,
    opzioni: p.options.map((o) => ({ name: o.name, values: [...o.values] })),
    varianti: p.variants.nodes.map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      price: v.price,
      position: v.position,
      identita: v.metafield?.value ?? null,
    })),
  });

  async function prodotto(id: string): Promise<ProdottoLetto | null> {
    const dati = await graphql<{ product: ProdottoGrezzo | null }>(
      `query($id: ID!) { product(id: $id) { ${CAMPI_PRODOTTO} } }`,
      { id },
    );
    return dati.product ? leggibile(dati.product) : null;
  }

  async function perIdentita(valore: string): Promise<ProdottoLetto | null> {
    const dati = await graphql<{ productByIdentifier: ProdottoGrezzo | null }>(
      `query ($identifier: ProductIdentifierInput!) { productByIdentifier(identifier: $identifier) { ${CAMPI_PRODOTTO} } }`,
      { identifier: { customId: { namespace: NAMESPACE, key: CHIAVE_PRODOTTO, value: valore } } },
    );
    return dati.productByIdentifier ? leggibile(dati.productByIdentifier) : null;
  }

  /** La fotografia degli ultimi prodotti creati: il confronto prima/dopo vede i residui senza metafield. */
  async function ultimiProdotti(): Promise<
    readonly { id: string; title: string; tags: string[] }[]
  > {
    const dati = await graphql<{
      products: { nodes: readonly { id: string; title: string; tags: string[] }[] };
    }>(
      'query { products(first: 25, sortKey: CREATED_AT, reverse: true) { nodes { id title tags } } }',
    );
    return dati.products.nodes;
  }

  async function prodottiDellEsecuzione(): Promise<readonly string[]> {
    const dati = await graphql<{ products: { nodes: readonly { id: string }[] } }>(
      'query($q: String!) { products(first: 50, query: $q) { nodes { id } } }',
      { q: `tag:${esecuzione}` },
    );
    return dati.products.nodes.map((n) => n.id);
  }

  interface VarianteDaCreare {
    readonly valori: readonly string[];
    readonly identita: string;
    readonly sku: string;
    readonly price: string;
  }

  /**
   * `productSet` in SOLA creazione: niente `identifier`, niente `id`. Restituisce ciò che la
   * risposta dice; la verità la dà la rilettura.
   */
  async function productSet(
    valoreIdentita: string,
    titolo: string,
    opzioni: readonly { readonly name: string; readonly values: readonly string[] }[],
    varianti: readonly VarianteDaCreare[],
  ): Promise<EsitoSet> {
    try {
      const dati = await graphql<{
        productSet: {
          product: ProdottoGrezzo | null;
          userErrors: readonly { field: string[] | null; message: string; code?: string }[];
        };
      }>(
        `mutation ($input: ProductSetInput!) {
          productSet(input: $input, synchronous: true) {
            product { ${CAMPI_PRODOTTO} }
            userErrors { field message code }
          }
        }`,
        {
          input: {
            title: titolo,
            status: 'DRAFT',
            vendor: 'VestiFlow',
            productType: 'Collaudo',
            tags: [TAG_GATE, esecuzione],
            productOptions: opzioni.map((o) => ({
              name: o.name,
              values: o.values.map((name) => ({ name })),
            })),
            metafields: [
              { namespace: NAMESPACE, key: CHIAVE_PRODOTTO, type: 'id', value: valoreIdentita },
            ],
            variants: varianti.map((v) => ({
              optionValues: v.valori.map((name, i) => ({ optionName: opzioni[i]!.name, name })),
              price: v.price,
              sku: v.sku,
              metafields: [
                { namespace: NAMESPACE, key: CHIAVE_VARIANTE, type: 'id', value: v.identita },
              ],
            })),
          },
        },
      );
      const id = dati.productSet.product?.id ?? null;
      if (id && !creati.includes(id)) {
        creati.push(id);
      }
      return {
        id,
        varianti: dati.productSet.product ? leggibile(dati.productSet.product).varianti : [],
        errori: dati.productSet.userErrors,
        eccezione: null,
      };
    } catch (error: unknown) {
      return {
        id: null,
        varianti: [],
        errori: [],
        eccezione: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Un prodotto apparso sul negozio DOPO, che non è fra quelli fotografati alla creazione. */
  async function residuiNonFotografati(
    prima: readonly { id: string }[],
  ): Promise<readonly string[]> {
    const dopo = await ultimiProdotti();
    const noti = new Set([...prima.map((p) => p.id), ...creati]);
    return dopo.filter((p) => !noti.has(p.id)).map((p) => `${p.id} «${p.title}»`);
  }

  const descriviErrori = (e: EsitoSet) =>
    e.eccezione ??
    e.errori.map((x) => `${x.code ?? ''} ${x.field?.join('.') ?? ''}: ${x.message}`).join('; ');

  function registra(garanzia: string, esito: Esito['esito'], dettaglio: string): void {
    esiti.push({ garanzia, esito, dettaglio });
    if (esito === 'smentita' && !fermato) {
      fermato = garanzia;
    }
  }

  async function garanzia(nome: string, corpo: () => Promise<string>): Promise<void> {
    if (fermato) {
      registra(nome, 'saltata', `dopo la smentita di ${fermato}`);
      return;
    }
    try {
      const dettaglio = await corpo();
      registra(nome, 'verificata', dettaglio);
    } catch (error: unknown) {
      registra(nome, 'smentita', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  function fermaSe(condizione: boolean, messaggio: string): void {
    if (condizione) {
      throw new Error(messaggio);
    }
  }

  beforeAll(async () => {
    caricaEnvApi();
    assertGateAbilitato();
    cred = await credenzialiShop();
    config = new ShopifyConfigService(configDaAmbiente());

    const negozio = await graphql<{
      shop: { myshopifyDomain: string; plan: { displayName: string; partnerDevelopment: boolean } };
    }>('{ shop { myshopifyDomain plan { displayName partnerDevelopment } } }');
    if (negozio.shop.myshopifyDomain !== cred.shopDomain) {
      throw new Error(
        `⛔ la credenziale risponde per «${negozio.shop.myshopifyDomain}», non per «${cred.shopDomain}»: mi fermo.`,
      );
    }
    if (negozio.shop.plan.partnerDevelopment !== true) {
      throw new Error(
        `⛔ «${negozio.shop.myshopifyDomain}» NON è uno shop di sviluppo (${negozio.shop.plan.displayName}): mi fermo.`,
      );
    }
    // ⭐ Le definizioni si RIUSANO: devono esistere già (G1), tipo `id`. Non si creano qui.
    for (const [owner, key] of [
      ['PRODUCT', CHIAVE_PRODOTTO],
      ['PRODUCTVARIANT', CHIAVE_VARIANTE],
    ] as const) {
      const dati = await graphql<{
        metafieldDefinitions: { nodes: readonly { id: string; type: { name: string } }[] };
      }>(
        `
          query ($owner: MetafieldOwnerType!, $ns: String!, $key: String!) {
            metafieldDefinitions(first: 5, ownerType: $owner, namespace: $ns, key: $key) {
              nodes {
                id
                type {
                  name
                }
              }
            }
          }
        `,
        { owner, ns: NAMESPACE, key },
      );
      const def = dati.metafieldDefinitions.nodes[0];
      if (!def || def.type.name !== 'id') {
        throw new Error(
          `⛔ definizione ${owner} ${NAMESPACE}.${key} assente o non di tipo id: mi fermo (va prima eseguita G1).`,
        );
      }
      fotografie[`definizione-${owner}`] = def;
    }
  }, 120_000);

  afterAll(async () => {
    const archiviati: string[] = [];
    const nonArchiviati: string[] = [];
    for (const id of creati) {
      try {
        const dati = await graphql<{
          productUpdate: {
            product: { id: string; status: string } | null;
            userErrors: { message: string }[];
          };
        }>(
          `
            mutation ($product: ProductUpdateInput!) {
              productUpdate(product: $product) {
                product {
                  id
                  status
                }
                userErrors {
                  message
                }
              }
            }
          `,
          { product: { id, status: 'ARCHIVED' } },
        );
        if (dati.productUpdate.product?.status === 'ARCHIVED') {
          archiviati.push(id);
        } else {
          nonArchiviati.push(
            `${id}: ${dati.productUpdate.userErrors.map((e) => e.message).join('; ')}`,
          );
        }
      } catch (error: unknown) {
        nonArchiviati.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const residuiConTag = cred ? await prodottiDellEsecuzione().catch(() => []) : [];
    registra(
      'G12 · archiviazione',
      nonArchiviati.length === 0 ? 'verificata' : 'smentita',
      `archiviati ${archiviati.length}/${creati.length}; con il tag di esecuzione sul negozio: ${residuiConTag.length}` +
        (nonArchiviati.length ? `; NON archiviati: ${nonArchiviati.join(' | ')}` : ''),
    );
    const riepilogo = {
      esecuzione,
      negozio: cred?.shopDomain ?? null,
      apiVersion: config?.apiVersion ?? null,
      esiti,
      creati,
      residuiConTag,
      fermatoDopo: fermato,
      fotografie,
    };
    // ⭐ Il risultato della prova sta su FILE: il log di vitest non riporta il console.log
    //    dell'afterAll (misurato il 15/09). Nessuna credenziale dentro: solo id, titoli, esiti.
    const percorso =
      process.env['VESTIFLOW_CONTRATTO_ESITO_FILE'] ??
      join(process.cwd(), `esito-${esecuzione}.json`);
    writeFileSync(percorso, JSON.stringify(riepilogo, null, 2));
    console.log(
      `\n===== ESITO CONTRATTO productSet (${esecuzione}) → ${percorso} =====\n` +
        esiti
          .map(
            (e) =>
              `${e.esito === 'verificata' ? '✅' : e.esito === 'smentita' ? '⛔' : '⏭'} ${e.garanzia} — ${e.dettaglio}`,
          )
          .join('\n') +
        `\nprodotti creati: ${creati.length} [${creati.join(', ')}]\nfermato dopo: ${fermato ?? 'nessuna smentita'}\n`,
    );
  }, 180_000);

  const OPZIONI_ML = [{ name: 'Taglia', values: ['M', 'L'] }] as const;
  const varianteML = (n: string, taglia: string, price = '9.99'): VarianteDaCreare => ({
    valori: [taglia],
    identita: identita(`${n}-${taglia}`),
    sku: `VF-${esecuzione}-${n}-${taglia}`,
    price,
  });

  it('G9 · productSet in SOLA creazione: sequenziale e concorrente con la stessa identità → un prodotto, quello creato non cambia, nessun residuo senza metafield', async () => {
    await garanzia('G9 · sola creazione', async () => {
      const prima = await ultimiProdotti();
      fotografie['G9-prima'] = prima;

      // a · la prima creazione
      const a = await productSet(identita('9'), `G9-a ${esecuzione}`, OPZIONI_ML, [
        varianteML('9', 'M'),
        varianteML('9', 'L'),
      ]);
      fotografie['G9-a-risposta'] = a;
      fermaSe(!a.id, `la PRIMA productSet non ha creato: ${descriviErrori(a)}`);
      const creato = await prodotto(a.id!);
      fotografie['G9-a-riletto'] = creato;
      fermaSe(
        !creato || creato.identita !== identita('9'),
        'il prodotto creato non porta l’identità',
      );

      // b · la seconda, SEQUENZIALE, stessa identità di prodotto, titolo e varianti diversi:
      //     se «aggiornasse», il titolo e le varianti del primo cambierebbero.
      const b = await productSet(identita('9'), `G9-b DIVERSO ${esecuzione}`, OPZIONI_ML, [
        varianteML('9b', 'M', '77.00'),
      ]);
      fotografie['G9-b-risposta'] = b;
      const dopoB = await prodotto(a.id!);
      fotografie['G9-b-riletto-primo'] = dopoB;
      const perId = await perIdentita(identita('9'));
      fermaSe(
        b.id !== null && b.id !== a.id,
        `la seconda productSet ha creato un SECONDO prodotto: ${b.id}`,
      );
      fermaSe(
        b.id === a.id,
        `la seconda productSet ha RISPOSTO con lo stesso prodotto (${b.id}): sarebbe un aggiornamento, non un rifiuto`,
      );
      fermaSe(
        JSON.stringify(dopoB) !== JSON.stringify(creato),
        `il prodotto già creato è CAMBIATO dopo la seconda productSet: ${JSON.stringify(dopoB)}`,
      );
      fermaSe(
        perId?.id !== a.id,
        `productByIdentifier non ritrova il primo: ${perId?.id ?? 'nessuno'}`,
      );

      // c · due CONCORRENTI con un'identità nuova
      const [c1, c2] = await Promise.all([
        productSet(identita('9c'), `G9-c1 ${esecuzione}`, OPZIONI_ML, [varianteML('9c1', 'M')]),
        productSet(identita('9c'), `G9-c2 ${esecuzione}`, OPZIONI_ML, [varianteML('9c2', 'M')]),
      ]);
      fotografie['G9-c-risposte'] = { c1, c2 };
      const idsC = [c1.id, c2.id].filter((x): x is string => x !== null);
      const distintiC = new Set(idsC);
      fermaSe(
        distintiC.size !== 1,
        `concorrenti: ${distintiC.size} prodotti distinti (${idsC.join(', ')})`,
      );
      const vincitore = await prodotto([...distintiC][0]!);
      fotografie['G9-c-vincitore'] = vincitore;
      const perIdC = await perIdentita(identita('9c'));
      fermaSe(
        perIdC?.id !== vincitore?.id,
        'productByIdentifier non ritrova il vincitore concorrente',
      );
      // Il vincitore ha UNA variante con l'identità di UNA sola delle due richieste.
      fermaSe(
        vincitore!.varianti.length !== 1,
        `il vincitore ha ${vincitore!.varianti.length} varianti`,
      );

      // d · residui: prodotti nuovi sul negozio non fotografati alla creazione (senza metafield)
      const residui = await residuiNonFotografati(prima);
      fotografie['G9-residui'] = residui;
      fermaSe(residui.length > 0, `residui non fotografati: ${residui.join(' | ')}`);
      const tutti = await prodottiDellEsecuzione();
      fermaSe(
        tutti.some((id) => !creati.includes(id)),
        `prodotti col tag di esecuzione non fotografati: ${tutti.filter((id) => !creati.includes(id)).join(', ')}`,
      );

      return (
        `prima: ${a.id}; seconda: rifiutata (${descriviErrori(b)}); primo invariato; ` +
        `concorrenti: vincitore ${vincitore!.id} (c1 ${c1.id ?? 'rifiutata: ' + descriviErrori(c1)} · c2 ${c2.id ?? 'rifiutata: ' + descriviErrori(c2)}); residui 0`
      );
    });
  });

  it('G10 · errore su una variante: che cosa viene creato davvero; conflitto sull’identità di variante', async () => {
    await garanzia('G10 · errore su variante', async () => {
      const prima = await ultimiProdotti();
      fotografie['G10-prima'] = prima;

      // a · una variante valida (M) e una INVALIDA (combinazione «M» ripetuta).
      const a = await productSet(identita('10a'), `G10-a ${esecuzione}`, OPZIONI_ML, [
        varianteML('10a', 'M'),
        { ...varianteML('10a-dup', 'M'), valori: ['M'] },
      ]);
      fotografie['G10-a-risposta'] = a;
      const rilettoA = await perIdentita(identita('10a'));
      fotografie['G10-a-riletto'] = rilettoA;
      if (rilettoA && !creati.includes(rilettoA.id)) {
        creati.push(rilettoA.id); // creato anche se la risposta non lo diceva: si archivia
      }
      const esitoA = rilettoA
        ? `PRODOTTO CREATO nonostante l'errore: ${rilettoA.id} con ${rilettoA.varianti.length} varianti [${rilettoA.varianti.map((v) => `${v.title}:${v.identita ?? '—'}`).join(', ')}]`
        : 'nessun prodotto creato';

      // b · conflitto sull'IDENTITÀ di variante: una variante nuova con l'identità della M di G9.
      const b = await productSet(identita('10b'), `G10-b ${esecuzione}`, OPZIONI_ML, [
        varianteML('10b', 'L'),
        { ...varianteML('10b', 'M'), identita: identita('9-M') },
      ]);
      fotografie['G10-b-risposta'] = b;
      const rilettoB = await perIdentita(identita('10b'));
      fotografie['G10-b-riletto'] = rilettoB;
      if (rilettoB && !creati.includes(rilettoB.id)) {
        creati.push(rilettoB.id);
      }
      // ⛔ Qualunque esito, la variante M di G9 deve essere ancora sua e intatta.
      const g9 = await perIdentita(identita('9'));
      fotografie['G10-b-g9-dopo'] = g9;
      const mDiG9 = g9?.varianti.find((v) => v.identita === identita('9-M'));
      fermaSe(
        !mDiG9,
        'la variante M di G9 ha PERSO la sua identità (o è sparita) dopo il conflitto',
      );
      fermaSe(
        JSON.stringify(g9) !== JSON.stringify(fotografie['G9-b-riletto-primo']),
        `il prodotto di G9 è CAMBIATO dopo il conflitto di identità di variante: ${JSON.stringify(g9)}`,
      );
      const esitoB = rilettoB
        ? `PRODOTTO CREATO: ${rilettoB.id} con ${rilettoB.varianti.length} varianti [${rilettoB.varianti.map((v) => `${v.title}:${v.identita ?? '—'}`).join(', ')}]`
        : 'nessun prodotto creato';

      const residui = await residuiNonFotografati(prima);
      fotografie['G10-residui'] = residui;
      fermaSe(residui.length > 0, `residui non fotografati: ${residui.join(' | ')}`);

      // Registrato, non presunto: la garanzia qui è «niente danni a ciò che esiste, nessun
      // residuo non fotografato»; cosa resta della richiesta errata è il dato misurato.
      return `a (combinazione doppia): risposta «${descriviErrori(a) || 'nessun errore'}», ${esitoA}; b (identità di variante già usata): risposta «${descriviErrori(b) || 'nessun errore'}», ${esitoB}; G9 intatto`;
    });
  });

  it('G11 · tutte le identità, nessuna variante in più, ordine come richiesto — variante unica e più varianti; rilettura ignorando la risposta', async () => {
    await garanzia('G11 · identità e ordine', async () => {
      // a · variante UNICA: l'opzione «Title» col solo «Default Title», come rappresenta Shopify.
      const unica = await productSet(
        identita('11u'),
        `G11-unica ${esecuzione}`,
        [{ name: 'Title', values: ['Default Title'] }],
        [
          {
            valori: ['Default Title'],
            identita: identita('11u-v'),
            sku: `VF-${esecuzione}-11u`,
            price: '12.00',
          },
        ],
      );
      fotografie['G11-unica-risposta'] = unica;
      fermaSe(!unica.id, `variante unica non creata: ${descriviErrori(unica)}`);
      // ⛔ Rilettura per IDENTITÀ, senza usare la risposta.
      const u = await perIdentita(identita('11u'));
      fotografie['G11-unica-riletto'] = u;
      fermaSe(!u, 'variante unica: productByIdentifier non la ritrova');
      fermaSe(u!.varianti.length !== 1, `variante unica: ${u!.varianti.length} varianti`);
      fermaSe(
        u!.varianti[0]!.identita !== identita('11u-v'),
        'variante unica: identità di variante assente',
      );
      fermaSe(
        u!.varianti[0]!.sku !== `VF-${esecuzione}-11u` || u!.varianti[0]!.price !== '12.00',
        'variante unica: sku/prezzo non quelli richiesti',
      );
      fermaSe(!u!.hasOnlyDefaultVariant, 'variante unica: hasOnlyDefaultVariant è false');

      // b · TRE varianti in un ordine deliberato (L, M, S), valori dichiarati nello stesso ordine.
      const ordine = ['L', 'M', 'S'];
      const molte = await productSet(
        identita('11m'),
        `G11-molte ${esecuzione}`,
        [{ name: 'Taglia', values: ordine }],
        ordine.map((t, i) => ({
          valori: [t],
          identita: identita(`11m-${t}`),
          sku: `VF-${esecuzione}-11m-${t}`,
          price: `${10 + i}.50`,
        })),
      );
      fotografie['G11-molte-risposta'] = molte;
      fermaSe(!molte.id, `più varianti non create: ${descriviErrori(molte)}`);
      const m = await perIdentita(identita('11m'));
      fotografie['G11-molte-riletto'] = m;
      fermaSe(!m, 'più varianti: productByIdentifier non le ritrova');
      fermaSe(
        m!.varianti.length !== 3,
        `più varianti: ${m!.varianti.length} varianti (attese 3, nessuna in più)`,
      );
      const titoli = [...m!.varianti].sort((x, y) => x.position - y.position).map((v) => v.title);
      fermaSe(
        JSON.stringify(titoli) !== JSON.stringify(ordine),
        `ordine delle varianti ${JSON.stringify(titoli)} ≠ richiesto ${JSON.stringify(ordine)}`,
      );
      fermaSe(
        JSON.stringify(m!.opzioni[0]?.values) !== JSON.stringify(ordine),
        `ordine dei valori di opzione ${JSON.stringify(m!.opzioni[0]?.values)} ≠ richiesto`,
      );
      for (const t of ordine) {
        const v = m!.varianti.find((x) => x.title === t);
        fermaSe(
          !v || v.identita !== identita(`11m-${t}`),
          `variante ${t}: identità assente o diversa`,
        );
        fermaSe(
          !v || v.sku !== `VF-${esecuzione}-11m-${t}`,
          `variante ${t}: SKU non quello richiesto`,
        );
      }
      fermaSe(m!.hasOnlyDefaultVariant, 'più varianti: hasOnlyDefaultVariant è true');

      return `unica: ${u!.id} (1 variante, identità e valori ok); molte: ${m!.id} (3 varianti, ordine ${titoli.join('/')}, identità e SKU ok); id riletti da productByIdentifier senza usare le risposte`;
    });
  });
});
