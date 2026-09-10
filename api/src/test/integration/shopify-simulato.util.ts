import { vi } from 'vitest';

import type { ShopifyAdminProduct } from '../../shopify/shopify-admin.client';
import {
  CODICE_CONFRONTO_FALLITO,
  MESSAGGIO_CONFRONTO_FALLITO,
} from '../../shopify/shopify-inventory-user-error.util';
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
   * Le chiavi di idempotenza VISTE, in ordine, ripetizioni comprese.
   *
   * ⭐ **Distingue una ripetizione da un'operazione nuova**, che è la domanda
   *    che conta quando due esecutori lavorano insieme: due richieste con la
   *    stessa chiave sono la stessa operazione, e non sono un difetto.
   */
  readonly chiaviViste: string[] = [];
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
  /**
   * La prossima risposta si PERDE: l'effetto è applicato, il chiamante vede un
   * errore.
   *
   * ⛔ **Non è `guastaProssima`, ed è la differenza che conta.** Un guasto
   *    iniettato scatta PRIMA dell'effetto: la chiamata non è mai arrivata.
   *    Qui la chiamata è arrivata, il negozio è cambiato, e a mancare è solo la
   *    conferma — che è il caso in cui un ritentativo può fare danno.
   */
  private readonly rispostePerse = new Map<string, number>();

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

  /** La prossima invocazione di `metodo` APPLICA l'effetto e poi solleva. */
  perdiProssimaRisposta(metodo: string, volte = 1): void {
    this.rispostePerse.set(metodo, volte);
  }

  /** Stabilisce che cosa il negozio porta, senza passare da una chiamata. */
  impostaQuantitaRemota(inventoryItemId: string, locationId: string, quantita: number): void {
    this.quantitaRemote.set(`${inventoryItemId}@${locationId}`, quantita);
  }

  /**
   * Una vendita AVVENUTA SUL CANALE: abbassa la quantità del negozio e basta.
   *
   * ⚠️ Non produce nessun evento verso VestiFlow: è precisamente il caso
   *    «ordine non ancora acquisito», dove Shopify sa una cosa che VestiFlow
   *    non sa ancora.
   */
  vendiSulCanale(inventoryItemId: string, locationId: string, quantita: number): number {
    const chiave = `${inventoryItemId}@${locationId}`;
    const dopo = (this.quantitaRemote.get(chiave) ?? 0) - quantita;
    this.quantitaRemote.set(chiave, dopo);
    return dopo;
  }

  /**
   * La scrittura CON CONFRONTO, nella semantica di `inventorySetQuantities`:
   * se la quantità attuale non è quella attesa, la scrittura viene RIFIUTATA.
   *
   * ⛔ **Questo metodo fissa la semantica su cui si progetta, non dimostra che
   *    Shopify si comporti così.** La prova che il confronto fermi davvero una
   *    scrittura concorrente è il test di contratto eseguito contro il negozio
   *    di sviluppo (`src/test/contract/shopify-catalogo.contract-spec.ts`).
   *    Rifarla qui misurerebbe questo file.
   */
  scriviConConfronto(argomenti: {
    readonly inventoryItemId: string;
    readonly locationId: string;
    readonly quantita: number;
    readonly atteso: number;
    /**
     * Chiave di idempotenza, come `@idempotent(key:)`.
     *
     * ⭐ **La stessa chiave non riapplica**: restituisce l'esito memorizzato.
     *    È ciò che rende un ritentativo la RIPETIZIONE di un'operazione invece
     *    di una seconda operazione.
     */
    readonly chiave?: string;
  }): { readonly scritta: boolean; readonly attuale: number | null; readonly ripetuta?: true } {
    this.conta('scriviConConfronto');
    if (argomenti.chiave) {
      const memorizzato = this.esitiIdempotenti.get(argomenti.chiave);
      if (memorizzato) {
        return { ...memorizzato, ripetuta: true };
      }
    }
    const coppia = `${argomenti.inventoryItemId}@${argomenti.locationId}`;
    const attuale = this.quantitaRemote.get(coppia) ?? null;
    const esito =
      attuale !== argomenti.atteso
        ? { scritta: false, attuale }
        : { scritta: true, attuale: argomenti.quantita };
    if (esito.scritta) {
      this.quantitaRemote.set(coppia, argomenti.quantita);
    }
    if (argomenti.chiave) {
      this.esitiIdempotenti.set(argomenti.chiave, esito);
    }
    return esito;
  }

  private readonly esitiIdempotenti = new Map<
    string,
    { readonly scritta: boolean; readonly attuale: number | null }
  >();

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

  /**
   * La prossima scrittura di inventario risponde con QUESTO `userError`.
   *
   * ⭐ **Serve a riprodurre le classi che il negozio non produce da sé.** Il
   *    simulatore sa generare il rifiuto del confronto, perché quello dipende
   *    dal proprio stato; concorrenza, validazione e codici sconosciuti no —
   *    dipendono da cose che stanno dentro Shopify. Iniettarli è l'unico modo
   *    di provare che VestiFlow li distingue.
   *
   * ⚠️ **La risposta resta una risposta**: `userErrors` con dentro il codice,
   *    non un'eccezione. Un `userError` e un guasto di trasporto sono due esiti
   *    diversi, ed è tutta la differenza che questo blocco misura.
   */
  rispondiConUserError(codice: string, messaggio = 'iniettato dalla prova', volte = 1): void {
    this.userErrorIniettati.push(...Array.from({ length: volte }, () => ({ codice, messaggio })));
  }

  /**
   * La prossima scrittura risponde con un CORPO ASSENTE.
   *
   * ⭐ **Riproduce, in termini del client, il difetto del payload mancante**: il
   *    client vero solleva, perché una mutation assente è un esito IGNOTO e non
   *    una riuscita. Qui il doppio fa la stessa cosa e col messaggio del client
   *    vero, così l'integrazione misura la conseguenza — il tentativo si
   *    conserva — mentre la prova unitaria del client misura la causa.
   */
  rispostaSenzaCorpo(volte = 1): void {
    this.rispostePrive.set('setInventoryQuantities', volte);
  }

  private readonly userErrorIniettati: { codice: string; messaggio: string }[] = [];
  private readonly rispostePrive = new Map<string, number>();

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
      options: spec.opzioni.map((o, i) => ({
        name: o.name,
        values: [...o.values],
        position: i + 1,
      })) as never,
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
      createProduct: vi.fn(
        async (_dominio: string, _token: string, payload: Record<string, unknown>) => {
          this.conta('createProduct');
          const righe = (payload['variants'] as Record<string, unknown>[] | undefined) ?? [];
          const opzioni =
            (payload['options'] as { name: string; values: string[] }[] | undefined) ?? [];
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
        },
      ),
      listAllProducts: vi.fn(async () => {
        this.conta('listAllProducts');
        return [...this.prodotti.values()].map((p) =>
          structuredClone(p),
        ) as unknown as ShopifyAdminProduct[];
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
          // ⚠️ La risposta si perde DOPO l'effetto: il negozio è già cambiato.
          const perse = this.rispostePerse.get('setInventoryAvailable') ?? 0;
          if (perse > 0) {
            this.rispostePerse.set('setInventoryAvailable', perse - 1);
            throw new Error(
              `Shopify simulato (${this.dominio}): risposta persa su setInventoryAvailable — la scrittura E' avvenuta`,
            );
          }
        },
      ),
      createProductImage: vi.fn(async () => {
        this.conta('createProductImage');
      }),
    };
  }

  /** Il client GraphQL: aggiornamento di un prodotto già collegato. */
  /**
   * Il numero dentro un GID, o la stringa se è già un numero.
   *
   * ⚠️ Il canale parla due dialetti — REST manda numeri, GraphQL manda GID — e
   *    lo STATO del negozio deve essere lo stesso comunque ci si arrivi.
   */
  private numeroDi(id: string): string {
    const gid = /\/(\d+)$/.exec(id.trim());
    return gid?.[1] ?? id.trim();
  }

  graphql() {
    const trova = (productGid: string): ProdottoRemoto => {
      const prodotto = this.prodotti.get(idDaGid(productGid));
      if (!prodotto) {
        throw new Error(`Shopify simulato: prodotto ${productGid} inesistente`);
      }
      return prodotto;
    };
    return {
      /**
       * `inventorySetQuantities`: assoluta, con confronto e chiave.
       *
       * ⛔ **Rispetta le tre cose che contano**: il confronto RIFIUTA se il
       *    valore attuale non è quello atteso; la stessa chiave non riapplica;
       *    e una risposta persa cambia il negozio prima di sollevare.
       *
       * ⚠️ **Restituisce l'elenco degli `userErrors`, non l'oggetto della
       *    mutation**: è un doppio del CLIENT, e il client di VestiFlow espone
       *    già gli errori applicativi come elenco (vuoto = applicata). Farlo
       *    rispondere con la forma grezza dell'API significherebbe che il
       *    simulatore e il codice vero parlano due lingue diverse — e il
       *    simulatore smetterebbe di provare qualcosa.
       */
      /**
       * La lettura di UNA sede, per identificativo.
       *
       * ⭐ **Quattro esiti distinti, come il client vero**: un'assenza non è
       *    uno zero. E la quantità NON si clampa: un canale in oversell si
       *    legge negativo.
       */
      getRemoteLevelAtLocation: vi.fn(
        async (
          _dominio: string,
          _token: string,
          inventoryItemId: string,
          locationId: string,
        ) => {
          this.conta('getRemoteLevelAtLocation');
          const q = this.quantitaRemote.get(`${inventoryItemId}@${locationId}`);
          if (q === undefined) {
            return { found: false as const, reason: 'sede_non_stoccata' as const };
          }
          return { found: true as const, available: q };
        },
      ),
      setInventoryQuantities: vi.fn(
        async (
          _dominio: string,
          _token: string,
          input: {
            readonly idempotencyKey: string;
            readonly quantities: readonly {
              readonly inventoryItemId: string;
              readonly locationId: string;
              readonly quantity: number;
              readonly changeFromQuantity?: number | null;
            }[];
          },
        ) => {
          this.conta('setInventoryQuantities');
          this.chiaviViste.push(input.idempotencyKey);

          // ── esiti INIETTATI: quelli che il negozio non genera da sé ────────
          const prive = this.rispostePrive.get('setInventoryQuantities') ?? 0;
          if (prive > 0) {
            this.rispostePrive.set('setInventoryQuantities', prive - 1);
            // ⭐ Il messaggio è quello del client vero: una mutation assente è
            //    un esito IGNOTO, non un elenco vuoto di errori.
            throw new Error(
              `Shopify (${this.dominio}): risposta di inventorySetQuantities assente o malformata — ` +
                `esito IGNOTO, non una riuscita. Chiave ${input.idempotencyKey}.`,
            );
          }
          const iniettato = this.userErrorIniettati.shift();
          if (iniettato) {
            // ⛔ **Nessun effetto sul negozio, e nessun ricordo della chiave.**
            //    Un `userError` dice che la mutation non ha eseguito: memorizzare
            //    l'esito idempotente qui farebbe credere applicata una scrittura
            //    che non c'è stata, e la ripetizione successiva la salterebbe.
            return [{ field: null, message: iniettato.messaggio, code: iniettato.codice }];
          }

          const memorizzato = this.esitiIdempotenti.get(input.idempotencyKey);
          if (memorizzato) {
            // Stessa chiave: l'effetto non si riapplica.
            return [];
          }
          for (const riga of input.quantities) {
            // ⛔ **Il contratto di `2026-07`, e l'avevo scritto AL CONTRARIO.**
            //    Corretto il 09/09/2026 sulla documentazione Shopify:
            //
            //      numero          → esegue il confronto
            //      null esplicito  → DISATTIVA il confronto
            //      campo OMESSO    → errore
            //
            //    ⚠️ Il simulatore rappresenta **Shopify**, non la politica di
            //    VestiFlow: che questo percorso non debba mai usare `null` è
            //    una regola nostra, e si fa rispettare dal servizio, non
            //    fingendo che l'API la imponga.
            if (!('changeFromQuantity' in riga)) {
              throw new Error(
                `Shopify simulato (${this.dominio}): changeFromQuantity è obbligatorio — ` +
                  'per scrivere senza confronto si manda null esplicito, non si omette',
              );
            }
            const item = this.numeroDi(riga.inventoryItemId);
            const sede = this.numeroDi(riga.locationId);
            const coppia = `${item}@${sede}`;
            const attuale = this.quantitaRemote.get(coppia) ?? null;
            if (riga.changeFromQuantity !== null && attuale !== riga.changeFromQuantity) {
              // ⭐ **Un confronto fallito è un `userError`, non un guasto**: la
              //    mutation risponde, e non ha scritto. Distinguerlo da un
              //    errore di trasporto è ciò che permette di separare «esito
              //    ignoto» da «divergenza accertata».
              //
              // ⛔ **Il messaggio è quello VERO di `2026-07`**, non una frase
              //    inventata. Qui c'era «atteso X, attuale Y», che nessun
              //    classificatore avrebbe riconosciuto: il simulatore avrebbe
              //    fatto passare per «confronto» ciò che in produzione sarebbe
              //    caduto in «sconosciuto», e la prova avrebbe misurato se
              //    stessa. Lo scarto fra i due valori resta in coda, come
              //    contesto per chi legge la prova.
              return [
                {
                  field: ['quantities', 'changeFromQuantity'],
                  // ⭐ Il messaggio **collaudato** sullo shop, che non coincide
                  //    con la descrizione dell'enum: è la ragione per cui la
                  //    classificazione NON lo guarda.
                  message: `${MESSAGGIO_CONFRONTO_FALLITO} (atteso ${riga.changeFromQuantity}, attuale ${attuale})`,
                  // ⭐ Il codice **documentato** per l'argomento che questo
                  //    percorso manda davvero. ⚠️ Era `COMPARE_QUANTITY_STALE`,
                  //    che è la forma con l'argomento vecchio: sbagliato per il
                  //    nostro invio, e scelto quando l'enum non era stato letto.
                  code: CODICE_CONFRONTO_FALLITO,
                },
              ];
            }
            this.quantitaMandate.push({
              inventoryItemId: item,
              locationId: sede,
              available: riga.quantity,
            });
            this.quantitaRemote.set(coppia, riga.quantity);
          }
          this.esitiIdempotenti.set(input.idempotencyKey, { scritta: true, attuale: null });
          const perse = this.rispostePerse.get('setInventoryQuantities') ?? 0;
          if (perse > 0) {
            this.rispostePerse.set('setInventoryQuantities', perse - 1);
            throw new Error(
              `Shopify simulato (${this.dominio}): risposta persa su inventorySetQuantities — la scrittura E' avvenuta`,
            );
          }
          return [];
        },
      ),
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
            if (input.compareAtPrice !== undefined)
              variante.compare_at_price = input.compareAtPrice;
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
      setProductStatus: vi.fn(
        async (_d: string, _t: string, productGid: string, status: string) => {
          this.conta('setProductStatus');
          trova(productGid).status = status.toLowerCase();
        },
      ),
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
      getAccessToken: vi.fn(async () => ({
        shopDomain: this.dominio,
        accessToken: 'token-simulato',
      })),
    };
  }
}
