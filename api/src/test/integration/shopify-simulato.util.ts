import { vi } from 'vitest';

import type { ShopifyAdminProduct } from '../../shopify/shopify-admin.client';
import { GID_COLLAUDO_A, GID_COLLAUDO_DA } from '../fixtures/collaudo-shopify.dataset';

/**
 * Un negozio Shopify SIMULATO, con stato.
 *
 * ⛔ **Non è un mock che risponde quello che gli si è insegnato**: conserva il
 *    catalogo remoto fra una chiamata e l'altra, assegna identificativi DIVERSI
 *    a creazioni distinte, e applica davvero gli aggiornamenti che riceve. Così
 *    lo stato locale si può CONFRONTARE con quello remoto dopo ogni passaggio,
 *    che è ciò che un `vi.fn().mockResolvedValue()` non permette.
 *
 * ⚠️ **È l'unica cosa simulata.** Servizi applicativi e PostgreSQL sono veri.
 *    Nessuna chiamata di rete parte da qui, e gli identificativi stanno nella
 *    fascia riservata `99xxxx` del dataset di collaudo: fuori di lì il
 *    simulatore rifiuta di assegnarne, perché un id inventato contro un negozio
 *    vero o non esiste o è di qualcun altro.
 *
 * ⚠️ **Il consumo di chiamate è una MISURA della prova, non di Shopify**: dice
 *    quante volte il servizio ha parlato col canale, non quanto costerebbe in
 *    produzione (`docs/24` §8.9.2 vuole una misura sul negozio, non qui).
 */

export interface VarianteRemota {
  id: number;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  compare_at_price: string | null;
  inventory_item_id: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ProdottoRemoto {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string | null;
  product_type: string | null;
  tags: string;
  status: string;
  options: { name: string; values: string[] }[];
  variants: VarianteRemota[];
  images: never[];
}

/** La forma DICHIARATIVA di un prodotto nato su Shopify (seme del catalogo remoto). */
export interface SpecVarianteRemota {
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly price: string;
  /** Un valore per opzione, nell'ordine delle opzioni del prodotto. */
  readonly valori: readonly string[];
}

export interface SpecProdottoRemoto {
  readonly title: string;
  readonly body_html?: string | null;
  readonly vendor?: string | null;
  readonly product_type?: string | null;
  readonly tags?: string;
  readonly status?: string;
  readonly opzioni: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly varianti: readonly SpecVarianteRemota[];
}

const gidDi = (tipo: string, id: number): string => `gid://shopify/${tipo}/${id}`;
const idDaGid = (gid: string): number => Number(gid.split('/').at(-1));

export class NegozioSimulato {
  readonly prodotti = new Map<number, ProdottoRemoto>();
  /** Quante volte ogni metodo del canale è stato invocato. */
  readonly chiamate = new Map<string, number>();
  /** Le quantità arrivate al canale, in ordine: le legge chi verifica il push inventario. */
  readonly quantitaMandate: {
    readonly inventoryItemId: string;
    readonly locationId: string;
    readonly available: number;
  }[] = [];
  /** I costi TENTATI, in ordine, guasti compresi: dicono quale chiamata è caduta. */
  readonly costiMandati: { readonly inventoryItemId: string; readonly costo: string }[] = [];
  /**
   * La QUANTITÀ che il negozio porta adesso, per articolo di inventario e sede.
   *
   * ⭐ **Serve a distinguere «la chiamata è partita» da «il valore remoto è
   *    cambiato».** Il registro delle chiamate dice che qualcuno ha bussato; solo
   *    uno stato dice che cosa c'è dall'altra parte dopo — ed è quello che un
   *    criterio di accettazione chiede quando dice «valore remoto aggiornato».
   *
   * ⚠️ Una chiamata **caduta** non lo muove, perché il guasto scatta prima.
   */
  private readonly quantitaRemote = new Map<string, number>();
  private prossimoId: number;
  private readonly guasti = new Map<string, number>();

  constructor(
    readonly dominio: string,
    primoId: number,
  ) {
    if (primoId < GID_COLLAUDO_DA || primoId > GID_COLLAUDO_A) {
      throw new Error(`primo id ${primoId} fuori dalla fascia riservata al collaudo`);
    }
    this.prossimoId = primoId;
  }

  // ── misure e guasti ──────────────────────────────────────────────────────

  totaleChiamate(): number {
    let totale = 0;
    for (const n of this.chiamate.values()) {
      totale += n;
    }
    return totale;
  }

  azzeraChiamate(): void {
    this.chiamate.clear();
  }

  /**
   * Che quantità porta il negozio adesso, su quell'articolo e quella sede.
   *
   * `null` se nessuno l'ha mai scritta: «mai toccata» e «messa a zero» sono due
   * cose diverse, e confonderle nasconderebbe proprio il difetto che 26.8 vieta
   * — mandare zero al posto di un rifiuto.
   */
  quantitaRemota(inventoryItemId: string | null, locationId: string): number | null {
    if (!inventoryItemId) {
      return null;
    }
    return this.quantitaRemote.get(`${inventoryItemId}@${locationId}`) ?? null;
  }

  /** Il prossimo `volte` invocazioni di `metodo` FALLISCONO: un guasto in un punto preciso. */
  guastaProssima(metodo: string, volte = 1): void {
    this.guasti.set(metodo, volte);
  }

  private conta(metodo: string): void {
    this.chiamate.set(metodo, (this.chiamate.get(metodo) ?? 0) + 1);
    const guasti = this.guasti.get(metodo) ?? 0;
    if (guasti > 0) {
      this.guasti.set(metodo, guasti - 1);
      throw new Error(`Shopify simulato (${this.dominio}): guasto iniettato su ${metodo}`);
    }
  }

  private nuovoId(): number {
    const id = this.prossimoId++;
    if (id > GID_COLLAUDO_A) {
      throw new Error(`esaurita la fascia di id riservata al collaudo (${GID_COLLAUDO_A})`);
    }
    return id;
  }

  // ── il catalogo remoto ───────────────────────────────────────────────────

  /** Un prodotto NATO su Shopify: gli identificativi li assegna il negozio. */
  semina(spec: SpecProdottoRemoto): ProdottoRemoto {
    const id = this.nuovoId();
    const prodotto: ProdottoRemoto = {
      id,
      title: spec.title,
      body_html: spec.body_html ?? null,
      vendor: spec.vendor ?? null,
      product_type: spec.product_type ?? null,
      tags: spec.tags ?? '',
      status: spec.status ?? 'active',
      options: spec.opzioni.map((o, i) => ({ name: o.name, values: [...o.values], position: i + 1 })) as never,
      variants: spec.varianti.map((v) => this.nuovaVariante(v)),
      images: [],
    };
    this.prodotti.set(id, prodotto);
    return prodotto;
  }

  private nuovaVariante(spec: SpecVarianteRemota): VarianteRemota {
    return {
      id: this.nuovoId(),
      title: spec.valori.join(' / ') || 'Default Title',
      sku: spec.sku,
      barcode: spec.barcode,
      price: spec.price,
      compare_at_price: null,
      inventory_item_id: this.nuovoId(),
      option1: spec.valori[0] ?? null,
      option2: spec.valori[1] ?? null,
      option3: spec.valori[2] ?? null,
    };
  }

  /** Una modifica fatta «dal pannello Shopify», come la vedrebbe un webhook dopo. */
  modifica(
    id: number,
    patch: {
      readonly title?: string;
      readonly vendor?: string | null;
      readonly tags?: string;
      readonly variante?: {
        readonly id: number;
        readonly barcode?: string | null;
        readonly sku?: string | null;
        readonly price?: string;
      };
      readonly nuovaVariante?: SpecVarianteRemota;
    },
  ): ProdottoRemoto {
    const prodotto = this.prodotti.get(id);
    if (!prodotto) {
      throw new Error(`prodotto remoto ${id} inesistente`);
    }
    if (patch.title !== undefined) prodotto.title = patch.title;
    if (patch.vendor !== undefined) prodotto.vendor = patch.vendor;
    if (patch.tags !== undefined) prodotto.tags = patch.tags;
    if (patch.variante) {
      const variante = prodotto.variants.find((v) => v.id === patch.variante!.id);
      if (!variante) {
        throw new Error(`variante remota ${patch.variante.id} inesistente`);
      }
      if (patch.variante.barcode !== undefined) variante.barcode = patch.variante.barcode;
      if (patch.variante.sku !== undefined) variante.sku = patch.variante.sku;
      if (patch.variante.price !== undefined) variante.price = patch.variante.price;
    }
    if (patch.nuovaVariante) {
      prodotto.variants.push(this.nuovaVariante(patch.nuovaVariante));
    }
    return prodotto;
  }

  prodotto(id: number): ProdottoRemoto {
    const prodotto = this.prodotti.get(id);
    if (!prodotto) {
      throw new Error(`prodotto remoto ${id} inesistente`);
    }
    return structuredClone(prodotto);
  }

  /** Il payload di un webhook `products/update`: il remoto com'è ADESSO. */
  webhook(id: number): Record<string, unknown> {
    return this.prodotto(id) as unknown as Record<string, unknown>;
  }

  // ── i client finti che i servizi ricevono ────────────────────────────────

  /** Il client REST Admin: creazione e lettura del catalogo. */
  admin() {
    return {
      createProduct: vi.fn(async (_dominio: string, _token: string, payload: Record<string, unknown>) => {
        this.conta('createProduct');
        const righe = (payload['variants'] as Record<string, unknown>[] | undefined) ?? [];
        const opzioni = (payload['options'] as { name: string; values: string[] }[] | undefined) ?? [];
        const id = this.nuovoId();
        const prodotto: ProdottoRemoto = {
          id,
          title: String(payload['title'] ?? ''),
          body_html: (payload['body_html'] as string | undefined) ?? null,
          vendor: (payload['vendor'] as string | undefined) ?? null,
          product_type: (payload['product_type'] as string | undefined) ?? null,
          tags: (payload['tags'] as string | undefined) ?? '',
          status: String(payload['status'] ?? 'active'),
          options: opzioni.map((o) => ({ name: o.name, values: [...o.values] })),
          variants: righe.map((riga) => ({
            id: this.nuovoId(),
            title: [riga['option1'], riga['option2'], riga['option3']]
              .filter((v): v is string => typeof v === 'string')
              .join(' / '),
            sku: (riga['sku'] as string | undefined) ?? null,
            barcode: (riga['barcode'] as string | undefined) ?? null,
            price: String(riga['price'] ?? '0.00'),
            compare_at_price: (riga['compare_at_price'] as string | undefined) ?? null,
            inventory_item_id: this.nuovoId(),
            option1: (riga['option1'] as string | undefined) ?? null,
            option2: (riga['option2'] as string | undefined) ?? null,
            option3: (riga['option3'] as string | undefined) ?? null,
          })),
          images: [],
        };
        this.prodotti.set(id, prodotto);
        return {
          id,
          variants: prodotto.variants.map((v) => ({
            id: v.id,
            sku: v.sku,
            inventory_item_id: v.inventory_item_id,
          })),
        };
      }),
      listAllProducts: vi.fn(async () => {
        this.conta('listAllProducts');
        return [...this.prodotti.values()].map((p) => structuredClone(p)) as unknown as ShopifyAdminProduct[];
      }),
      listProductMetafields: vi.fn(async () => {
        this.conta('listProductMetafields');
        return [];
      }),
      upsertProductMetafield: vi.fn(async () => {
        this.conta('upsertProductMetafield');
      }),
      // ⚠️ Gli argomenti si registrano PRIMA di `conta`, che è anche il punto in
      //    cui un guasto iniettato lancia: così la prova sa **quale** chiamata è
      //    caduta, invece di dedurlo dall'ordine delle righe locali.
      updateInventoryItemCost: vi.fn(
        async (_dominio: string, _token: string, inventoryItemId: string, costo: string) => {
          this.costiMandati.push({ inventoryItemId, costo });
          this.conta('updateInventoryItemCost');
        },
      ),
      // ⭐ Il push delle QUANTITÀ, aggiunto il 09/09/2026 per una verifica: si
      //    conta la chiamata e si conserva l'ultima quantità mandata, così una
      //    prova può dire se il canale è stato toccato e con che numero.
      setInventoryAvailable: vi.fn(
        async (
          _dominio: string,
          _token: string,
          inventoryItemId: string,
          locationId: string,
          available: number,
        ) => {
          this.conta('setInventoryAvailable');
          this.quantitaMandate.push({ inventoryItemId, locationId, available });
          this.quantitaRemote.set(`${inventoryItemId}@${locationId}`, available);
        },
      ),
      createProductImage: vi.fn(async () => {
        this.conta('createProductImage');
      }),
    };
  }

  /** Il client GraphQL: aggiornamento di un prodotto già collegato. */
  graphql() {
    const trova = (productGid: string): ProdottoRemoto => {
      const prodotto = this.prodotti.get(idDaGid(productGid));
      if (!prodotto) {
        throw new Error(`Shopify simulato: prodotto ${productGid} inesistente`);
      }
      return prodotto;
    };
    return {
      updateProductCatalog: vi.fn(
        async (
          _d: string,
          _t: string,
          input: {
            id: string;
            title: string;
            descriptionHtml: string;
            vendor?: string;
            productType?: string;
            tags?: readonly string[];
            status: string;
          },
        ) => {
          this.conta('updateProductCatalog');
          const prodotto = trova(input.id);
          prodotto.title = input.title;
          prodotto.body_html = input.descriptionHtml;
          prodotto.vendor = input.vendor ?? null;
          prodotto.product_type = input.productType ?? null;
          prodotto.tags = input.tags ? input.tags.join(', ') : '';
          prodotto.status = input.status.toLowerCase();
          return { id: input.id, status: input.status };
        },
      ),
      bulkUpdateVariants: vi.fn(
        async (
          _d: string,
          _t: string,
          productGid: string,
          varianti: readonly {
            id: string;
            price?: string;
            compareAtPrice?: string;
            barcode?: string;
            inventoryItem?: { sku?: string };
          }[],
        ) => {
          this.conta('bulkUpdateVariants');
          const prodotto = trova(productGid);
          for (const input of varianti) {
            const variante = prodotto.variants.find((v) => v.id === idDaGid(input.id));
            if (!variante) {
              throw new Error(`Shopify simulato: variante ${input.id} non è di ${productGid}`);
            }
            if (input.price !== undefined) variante.price = input.price;
            if (input.compareAtPrice !== undefined) variante.compare_at_price = input.compareAtPrice;
            if (input.barcode !== undefined) variante.barcode = input.barcode;
            if (input.inventoryItem?.sku !== undefined) variante.sku = input.inventoryItem.sku;
          }
        },
      ),
      listProductVariants: vi.fn(async (_d: string, _t: string, productGid: string) => {
        this.conta('listProductVariants');
        const prodotto = trova(productGid);
        return prodotto.variants.map((v) => ({
          id: gidDi('ProductVariant', v.id),
          sku: v.sku,
          barcode: v.barcode,
          inventoryItemId: gidDi('InventoryItem', v.inventory_item_id),
          selectedOptions: prodotto.options
            .map((o, i) => ({ name: o.name, value: [v.option1, v.option2, v.option3][i] ?? '' }))
            .filter((o) => o.value !== ''),
        }));
      }),
      getProductTitle: vi.fn(async (_d: string, _t: string, productGid: string) => {
        this.conta('getProductTitle');
        return this.prodotti.get(idDaGid(productGid))?.title ?? null;
      }),
      listProductMedia: vi.fn(async () => {
        this.conta('listProductMedia');
        return [];
      }),
      addProductMedia: vi.fn(async () => {
        this.conta('addProductMedia');
        return [];
      }),
      setProductStatus: vi.fn(async (_d: string, _t: string, productGid: string, status: string) => {
        this.conta('setProductStatus');
        trova(productGid).status = status.toLowerCase();
      }),
    };
  }

  /**
   * L'arricchimento dell'import: ciò che il servizio vero chiede a GraphQL
   * (tag, SEO, stagione, collezioni, metafield, costi). Qui i tag vengono dal
   * prodotto remoto — così l'atteso sui tag è quello della matrice — e il resto
   * è vuoto: la campagna non riguarda tassonomia e metafield.
   */
  enrichment() {
    return {
      enrichProduct: vi.fn(async (_d: string, _t: string, remote: ShopifyAdminProduct) => {
        this.conta('enrichProduct');
        return {
          tags: (remote.tags ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0),
          seoTitle: null,
          seoDescription: null,
          season: null,
          collections: [],
          metafields: [],
          variantPurchasePriceMinor: new Map<number, number>(),
          taxonomyCategoryId: null,
          taxonomyCategoryFullName: null,
          categoryMetafields: [],
        };
      }),
    };
  }

  /** La credenziale: un token finto per un dominio finto. */
  oauth() {
    return {
      getAccessToken: vi.fn(async () => ({ shopDomain: this.dominio, accessToken: 'token-simulato' })),
    };
  }
}
