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
 * ⭐ **GATE DI CONTRATTO — l'identità VestiFlow sul prodotto remoto** (`docs/30` §7.2-bis.1).
 *
 * ```
 * SHOPIFY_CONTRACT_TEST=1 VESTIFLOW_SHOPIFY_CONTRACT_SHOP=xxx.myshopify.com \
 *   npx vitest run --config vitest.contract.config.ts src/test/contract/shopify-identita-creazione.contract-spec.ts
 * ```
 *
 * Verifica sul negozio VERO le garanzie su cui poggia la soluzione alla creazione con esito
 * incerto: un metafield di tipo `id` (valori unici) come identità del prodotto e della
 * variante, il rifiuto di una seconda creazione con lo stesso valore, la rilettura degli id
 * per identità, il comportamento di `productVariantsBulkCreate` su un rifiuto parziale e di
 * `REMOVE_STANDALONE_VARIANT`. Il simulatore verrà allineato a ciò che QUESTO file misura.
 *
 * ⛔ Sicurezze: consenso esplicito; il negozio deve essere `partnerDevelopment` e coincidere
 *    col dominio richiesto; ogni oggetto porta il tag di esecuzione; nessuna cancellazione di
 *    prodotti (solo `ARCHIVED` in coda, e solo sugli id fotografati alla creazione); G7
 *    rimuove varianti INIZIALI solo dei due prodotti creati apposta in questa esecuzione.
 *    Alla prima garanzia smentita ci si ferma: le G successive vengono saltate, la pulizia
 *    resta.
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

describe('Contratto Shopify — identità VestiFlow in creazione (negozio di sviluppo)', () => {
  let cred: CredenzialiShop;
  let config: ShopifyConfigService;
  const esecuzione = `vf-esecuzione-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const identita = (n: number) => `contratto-${esecuzione}-${n}`;
  /** Gli id dei prodotti CERTAMENTE creati da questa esecuzione: solo questi si archiviano. */
  const creati: string[] = [];
  const esiti: Esito[] = [];
  let fermato: string | null = null;
  let prodottoG2: string | null = null;

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

  /** La fotografia degli ultimi prodotti creati sul negozio: il confronto prima/dopo vede i residui senza metafield. */
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

  interface EsitoCreazione {
    readonly id: string | null;
    readonly errori: readonly { field: string[] | null; message: string; code?: string }[];
    readonly eccezione: string | null;
  }

  async function creaProdotto(
    valoreIdentita: string,
    titolo: string,
    opzioni: readonly { name: string; values: readonly { name: string }[] }[] = [
      { name: 'Taglia', values: [{ name: 'M' }] },
    ],
  ): Promise<EsitoCreazione> {
    try {
      const dati = await graphql<{
        productCreate: {
          product: { id: string } | null;
          userErrors: readonly { field: string[] | null; message: string; code?: string }[];
        };
      }>(
        `
          mutation ($product: ProductCreateInput!) {
            productCreate(product: $product) {
              product {
                id
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        {
          product: {
            title: titolo,
            status: 'DRAFT',
            vendor: 'VestiFlow',
            productType: 'Collaudo',
            tags: [TAG_GATE, esecuzione],
            productOptions: opzioni,
            metafields: [
              { namespace: NAMESPACE, key: CHIAVE_PRODOTTO, type: 'id', value: valoreIdentita },
            ],
          },
        },
      );
      const id = dati.productCreate.product?.id ?? null;
      if (id) {
        creati.push(id);
      }
      return { id, errori: dati.productCreate.userErrors, eccezione: null };
    } catch (error: unknown) {
      return {
        id: null,
        errori: [],
        eccezione: error instanceof Error ? error.message : String(error),
      };
    }
  }

  interface EsitoVarianti {
    readonly ids: readonly string[];
    readonly errori: readonly { field: string[] | null; message: string; code?: string }[];
    readonly eccezione: string | null;
  }

  async function creaVarianti(
    productId: string,
    varianti: readonly { taglia: string; identita: string; price?: string }[],
    strategy?: 'REMOVE_STANDALONE_VARIANT' | 'DEFAULT',
  ): Promise<EsitoVarianti> {
    try {
      const dati = await graphql<{
        productVariantsBulkCreate: {
          productVariants: readonly { id: string }[] | null;
          userErrors: readonly { field: string[] | null; message: string; code?: string }[];
        };
      }>(
        `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!${strategy ? ', $strategy: ProductVariantsBulkCreateStrategy' : ''}) {
          productVariantsBulkCreate(productId: $productId, variants: $variants${strategy ? ', strategy: $strategy' : ''}) {
            productVariants { id }
            userErrors { field message code }
          }
        }`,
        {
          productId,
          variants: varianti.map((v) => ({
            optionValues: [{ optionName: 'Taglia', name: v.taglia }],
            price: v.price ?? '9.99',
            metafields: [
              { namespace: NAMESPACE, key: CHIAVE_VARIANTE, type: 'id', value: v.identita },
            ],
          })),
          ...(strategy ? { strategy } : {}),
        },
      );
      return {
        ids: (dati.productVariantsBulkCreate.productVariants ?? []).map((v) => v.id),
        errori: dati.productVariantsBulkCreate.userErrors,
        eccezione: null,
      };
    } catch (error: unknown) {
      return {
        ids: [],
        errori: [],
        eccezione: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function variantiDi(productId: string) {
    const dati = await graphql<{
      product: {
        variants: {
          nodes: readonly {
            id: string;
            title: string;
            sku: string | null;
            price: string;
            metafield: { value: string } | null;
          }[];
        };
      } | null;
    }>(
      `query($id: ID!) {
        product(id: $id) {
          variants(first: 50) {
            nodes { id title sku price metafield(namespace: "${NAMESPACE}", key: "${CHIAVE_VARIANTE}") { value } }
          }
        }
      }`,
      { id: productId },
    );
    return dati.product?.variants.nodes ?? [];
  }

  async function perIdentita(valore: string): Promise<string | null> {
    const dati = await graphql<{ productByIdentifier: { id: string } | null }>(
      `
        query ($identifier: ProductIdentifierInput!) {
          productByIdentifier(identifier: $identifier) {
            id
          }
        }
      `,
      { identifier: { customId: { namespace: NAMESPACE, key: CHIAVE_PRODOTTO, value: valore } } },
    );
    return dati.productByIdentifier?.id ?? null;
  }

  function registra(garanzia: string, esito: Esito['esito'], dettaglio: string): void {
    esiti.push({ garanzia, esito, dettaglio });
    if (esito === 'smentita' && !fermato) {
      fermato = garanzia;
    }
  }

  /** Esegue una garanzia; alla prima smentita le successive vengono saltate (non assunte valide). */
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

  beforeAll(async () => {
    caricaEnvApi();
    assertGateAbilitato();
    cred = await credenzialiShop();
    config = new ShopifyConfigService(configDaAmbiente());

    const negozio = await graphql<{
      shop: { myshopifyDomain: string; plan: { displayName: string; partnerDevelopment: boolean } };
    }>('{ shop { myshopifyDomain plan { displayName partnerDevelopment } } }');
    // ⛔ La credenziale deve appartenere PROPRIO al negozio richiesto, e dev'essere di sviluppo.
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
  }, 120_000);

  afterAll(async () => {
    // G8 · pulizia: SOLO gli id fotografati alla creazione, portati ad ARCHIVED (mai cancellati).
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
      'G8 · archiviazione',
      nonArchiviati.length === 0 ? 'verificata' : 'smentita',
      `archiviati ${archiviati.length}/${creati.length}; con il tag di esecuzione sul negozio: ${residuiConTag.length}` +
        (nonArchiviati.length ? `; NON archiviati: ${nonArchiviati.join(' | ')}` : ''),
    );
    // L'esito completo, leggibile in coda al log: è il risultato della prova.
     
    console.log(
      `\n===== ESITO CONTRATTO (${esecuzione}) =====\n` +
        esiti
          .map(
            (e) =>
              `${e.esito === 'verificata' ? '✅' : e.esito === 'smentita' ? '⛔' : '⏭'} ${e.garanzia} — ${e.dettaglio}`,
          )
          .join('\n') +
        `\nprodotti creati: ${creati.length} [${creati.join(', ')}]\n` +
        `residui con tag ${esecuzione}: ${residuiConTag.join(', ') || 'nessuno'}\n` +
        `fermato dopo: ${fermato ?? 'nessuna smentita'}\n`,
    );
  }, 180_000);

  it('G1 · le due definizioni (PRODUCT e PRODUCTVARIANT, tipo id) esistono o si creano, e una rilettura le trova senza duplicarle', async () => {
    await garanzia('G1 · definizioni', async () => {
      const righe: string[] = [];
      for (const [owner, key] of [
        ['PRODUCT', CHIAVE_PRODOTTO],
        ['PRODUCTVARIANT', CHIAVE_VARIANTE],
      ] as const) {
        const leggi = async () =>
          (
            await graphql<{
              metafieldDefinitions: {
                nodes: readonly {
                  id: string;
                  name: string;
                  type: { name: string };
                  ownerType: string;
                }[];
              };
            }>(
              `
                query ($owner: MetafieldOwnerType!, $ns: String!, $key: String!) {
                  metafieldDefinitions(first: 5, ownerType: $owner, namespace: $ns, key: $key) {
                    nodes {
                      id
                      name
                      type {
                        name
                      }
                      ownerType
                    }
                  }
                }
              `,
              { owner, ns: NAMESPACE, key },
            )
          ).metafieldDefinitions.nodes;
        let esistenti = await leggi();
        if (esistenti.length === 0) {
          const creata = await graphql<{
            metafieldDefinitionCreate: {
              createdDefinition: { id: string; type: { name: string } } | null;
              userErrors: readonly { field: string[] | null; message: string; code?: string }[];
            };
          }>(
            `
              mutation ($definition: MetafieldDefinitionInput!) {
                metafieldDefinitionCreate(definition: $definition) {
                  createdDefinition {
                    id
                    type {
                      name
                    }
                  }
                  userErrors {
                    field
                    message
                    code
                  }
                }
              }
            `,
            {
              definition: {
                name: `VestiFlow ${key}`,
                namespace: NAMESPACE,
                key,
                type: 'id',
                ownerType: owner,
                description: 'Identità tecnica VestiFlow: non modificare.',
              },
            },
          );
          if (!creata.metafieldDefinitionCreate.createdDefinition) {
            throw new Error(
              `${owner}.${key}: creazione rifiutata — ${creata.metafieldDefinitionCreate.userErrors.map((e) => `${e.code ?? ''} ${e.message}`).join('; ')}`,
            );
          }
          esistenti = await leggi();
        }
        if (esistenti.length !== 1) {
          throw new Error(`${owner}.${key}: attese 1 definizione, trovate ${esistenti.length}`);
        }
        const d = esistenti[0]!;
        if (d.type.name !== 'id' || d.ownerType !== owner) {
          throw new Error(
            `${owner}.${key}: definizione ESISTENTE ma non prevista — tipo «${d.type.name}», owner «${d.ownerType}»`,
          );
        }
        righe.push(`${owner}.${key} = ${d.id} (tipo ${d.type.name})`);
      }
      return righe.join(' · ');
    });
  });

  it('G2 · due productCreate SEQUENZIALI con lo stesso vestiflow.product_id: la seconda è rifiutata e non lascia un secondo prodotto', async () => {
    await garanzia('G2 · creazione sequenziale', async () => {
      const prima = await ultimiProdotti();
      const valore = identita(2);
      const a = await creaProdotto(valore, `VF contratto G2 ${esecuzione}`);
      if (!a.id) {
        throw new Error(
          `la PRIMA creazione non è riuscita: ${a.eccezione ?? a.errori.map((e) => e.message).join('; ')}`,
        );
      }
      prodottoG2 = a.id;
      const b = await creaProdotto(valore, `VF contratto G2-bis ${esecuzione}`);
      const dopo = await ultimiProdotti();
      const nuovi = dopo.filter((p) => !prima.some((q) => q.id === p.id));
      const perId = await perIdentita(valore);
      const dettaglio =
        `prima: ${a.id}; seconda: ${b.id ?? 'rifiutata'} ${b.errori.map((e) => `${e.code ?? ''} ${e.message}`).join('; ')}${b.eccezione ? ` eccezione: ${b.eccezione}` : ''}; ` +
        `nuovi sul negozio: ${nuovi.length} [${nuovi.map((n) => `${n.id} «${n.title}»`).join(', ')}]; productByIdentifier → ${perId}`;
      if (b.id || nuovi.length !== 1 || perId !== a.id) {
        throw new Error(dettaglio);
      }
      return dettaglio;
    });
  });

  it('G3 · due productCreate CONCORRENTI con lo stesso valore, prodotto assente: esattamente un prodotto', async () => {
    await garanzia('G3 · creazione concorrente', async () => {
      const prima = await ultimiProdotti();
      const valore = identita(3);
      const [a, b] = await Promise.all([
        creaProdotto(valore, `VF contratto G3-a ${esecuzione}`),
        creaProdotto(valore, `VF contratto G3-b ${esecuzione}`),
      ]);
      const dopo = await ultimiProdotti();
      const nuovi = dopo.filter((p) => !prima.some((q) => q.id === p.id));
      const perId = await perIdentita(valore);
      const dettaglio =
        `a: ${a.id ?? `rifiutata (${a.errori.map((e) => `${e.code ?? ''} ${e.message}`).join('; ')}${a.eccezione ?? ''})`}; ` +
        `b: ${b.id ?? `rifiutata (${b.errori.map((e) => `${e.code ?? ''} ${e.message}`).join('; ')}${b.eccezione ?? ''})`}; ` +
        `nuovi sul negozio: ${nuovi.length}; productByIdentifier → ${perId}`;
      const riusciti = [a.id, b.id].filter((x): x is string => x !== null);
      if (nuovi.length !== 1 || riusciti.length !== 1 || perId !== riusciti[0]) {
        throw new Error(dettaglio);
      }
      return dettaglio;
    });
  });

  it('G4 · productVariantsBulkCreate con lo stesso vestiflow.variant_id: sequenziale (sul prodotto di G2) e concorrente con un’identità NUOVA', async () => {
    await garanzia('G4 · varianti', async () => {
      if (!prodottoG2) {
        throw new Error('manca il prodotto di G2');
      }
      // Sequenziale: la seconda con lo stesso valore deve essere rifiutata.
      const vSeq = `${identita(4)}-seq`;
      const prima = await variantiDi(prodottoG2);
      const s1 = await creaVarianti(prodottoG2, [{ taglia: 'L', identita: vSeq }]);
      const s2 = await creaVarianti(prodottoG2, [{ taglia: 'XL', identita: vSeq }]);
      const dopoSeq = await variantiDi(prodottoG2);
      const nuoveSeq = dopoSeq.filter((v) => !prima.some((p) => p.id === v.id));
      // Concorrente: identità nuova, assente prima delle due richieste.
      const vConc = `${identita(4)}-conc`;
      const [c1, c2] = await Promise.all([
        creaVarianti(prodottoG2, [{ taglia: 'XXL', identita: vConc }]),
        creaVarianti(prodottoG2, [{ taglia: '3XL', identita: vConc }]),
      ]);
      const dopoConc = await variantiDi(prodottoG2);
      const nuoveConc = dopoConc.filter((v) => !dopoSeq.some((p) => p.id === v.id));
      const dettaglio =
        `sequenziale: s1 ${s1.ids.join(',') || 'rifiutata'} / s2 ${s2.ids.join(',') || 'rifiutata'} (${s2.errori.map((e) => `${e.code ?? ''} ${e.message}`).join('; ')}${s2.eccezione ?? ''}); nuove ${nuoveSeq.length}, con metafield ${vSeq}: ${dopoSeq.filter((v) => v.metafield?.value === vSeq).length}; ` +
        `concorrente: c1 ${c1.ids.join(',') || 'rifiutata'} / c2 ${c2.ids.join(',') || 'rifiutata'}; nuove ${nuoveConc.length}, con metafield ${vConc}: ${dopoConc.filter((v) => v.metafield?.value === vConc).length}`;
      const okSeq = s1.ids.length === 1 && s2.ids.length === 0 && nuoveSeq.length === 1;
      const okConc =
        [c1.ids.length, c2.ids.length].filter((n) => n === 1).length === 1 &&
        nuoveConc.length === 1;
      if (!okSeq || !okConc) {
        throw new Error(dettaglio);
      }
      return dettaglio;
    });
  });

  it('G5 · creazione senza usare la risposta: gli id di prodotto e varianti si recuperano dalla sola identità', async () => {
    await garanzia('G5 · rilettura per identità', async () => {
      const valore = identita(5);
      const vA = `${identita(5)}-a`;
      const vB = `${identita(5)}-b`;
      const creato = await creaProdotto(valore, `VF contratto G5 ${esecuzione}`, [
        { name: 'Taglia', values: [{ name: 'M' }, { name: 'L' }] },
      ]);
      if (!creato.id) {
        throw new Error(
          `creazione fallita: ${creato.eccezione ?? creato.errori.map((e) => e.message).join('; ')}`,
        );
      }
      const vv = await creaVarianti(
        creato.id,
        [
          { taglia: 'M', identita: vA },
          { taglia: 'L', identita: vB },
        ],
        'REMOVE_STANDALONE_VARIANT',
      );
      // Da qui in poi si «dimentica» la risposta: si usa SOLO l'identità.
      const ritrovato = await perIdentita(valore);
      const varianti = ritrovato ? await variantiDi(ritrovato) : [];
      const conA = varianti.find((v) => v.metafield?.value === vA);
      const conB = varianti.find((v) => v.metafield?.value === vB);
      const dettaglio = `prodotto ritrovato ${ritrovato} (creato ${creato.id}); varianti ${varianti.length} — A ${conA?.id ?? 'assente'}, B ${conB?.id ?? 'assente'}; bulkCreate: ${vv.ids.length} id, errori ${vv.errori.map((e) => e.message).join('; ') || 'nessuno'}${vv.eccezione ?? ''}`;
      if (ritrovato !== creato.id || !conA || !conB || varianti.length !== 2) {
        throw new Error(dettaglio);
      }
      return dettaglio;
    });
  });

  it('G6 · bulkCreate con una variante valida e una rifiutata: la valida viene creata o no? (atomicità misurata)', async () => {
    await garanzia('G6 · atomicità di bulkCreate', async () => {
      const valore = identita(6);
      const creato = await creaProdotto(valore, `VF contratto G6 ${esecuzione}`, [
        { name: 'Taglia', values: [{ name: 'M' }, { name: 'L' }] },
      ]);
      if (!creato.id) {
        throw new Error(
          `creazione fallita: ${creato.eccezione ?? creato.errori.map((e) => e.message).join('; ')}`,
        );
      }
      // «M» esiste già (variante iniziale): la seconda riga è un rifiuto certo; «L» è valida.
      const prima = await variantiDi(creato.id);
      const esito = await creaVarianti(creato.id, [
        { taglia: 'L', identita: `${valore}-valida` },
        { taglia: 'M', identita: `${valore}-rifiutata` },
      ]);
      const dopo = await variantiDi(creato.id);
      const nuove = dopo.filter((v) => !prima.some((p) => p.id === v.id));
      const dettaglio =
        `risposta: ${esito.ids.length} id, errori: ${esito.errori.map((e) => `${e.code ?? ''} ${e.field?.join('.') ?? ''} ${e.message}`).join('; ') || 'nessuno'}${esito.eccezione ?? ''}; ` +
        `varianti nuove sul negozio: ${nuove.length} → ${nuove.length === 0 ? 'ATOMICA (tutto o niente)' : 'NON atomica (la valida è stata creata)'}`;
      // Qui si MISURA: qualunque esito è un'informazione, non una smentita. Si registra e basta.
      return dettaglio;
    });
  });

  it('G7 · REMOVE_STANDALONE_VARIANT: su una variante iniziale intatta e su una modificata a mano (solo prodotti di questa esecuzione)', async () => {
    await garanzia('G7 · variante iniziale', async () => {
      const righe: string[] = [];
      for (const [suffisso, modifica] of [
        ['intatta', false],
        ['modificata', true],
      ] as const) {
        const valore = `${identita(7)}-${suffisso}`;
        const creato = await creaProdotto(valore, `VF contratto G7 ${suffisso} ${esecuzione}`, [
          { name: 'Taglia', values: [{ name: 'M' }] },
        ]);
        if (!creato.id) {
          throw new Error(
            `creazione fallita (${suffisso}): ${creato.eccezione ?? creato.errori.map((e) => e.message).join('; ')}`,
          );
        }
        const iniziale = (await variantiDi(creato.id))[0];
        if (!iniziale) {
          throw new Error(`${suffisso}: nessuna variante iniziale`);
        }
        if (modifica) {
          // «Modificata a mano»: prezzo e SKU cambiati sul negozio, come farebbe un operatore.
          await graphql(
            `
              mutation ($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                  userErrors {
                    message
                  }
                }
              }
            `,
            { productId: creato.id, variants: [{ id: iniziale.id, price: '12.50' }] },
          );
        }
        const esito = await creaVarianti(
          creato.id,
          [{ taglia: 'L', identita: `${valore}-L` }],
          'REMOVE_STANDALONE_VARIANT',
        );
        const dopo = await variantiDi(creato.id);
        const inizialeRimasta = dopo.some((v) => v.id === iniziale.id);
        righe.push(
          `${suffisso}: iniziale ${iniziale.id} (prezzo ${iniziale.price}${modifica ? ' → 12.50' : ''}) ${inizialeRimasta ? 'RIMASTA' : 'RIMOSSA'}; varianti dopo ${dopo.length}; bulkCreate ${esito.ids.length} id, errori ${esito.errori.map((e) => e.message).join('; ') || 'nessuno'}${esito.eccezione ?? ''}`,
        );
      }
      // Anche qui si misura: l'esito dice che cosa fa Shopify, la regola la decide VestiFlow.
      return righe.join(' · ');
    });
  });
});
