import { vi } from 'vitest';

import type { ShopifyAdminProduct } from '../../shopify/shopify-admin.client';
import {
  CODICE_CONFRONTO_FALLITO,
  MESSAGGIO_CONFRONTO_FALLITO,
} from '../../shopify/shopify-inventory-user-error.util';
import { GID_COLLAUDO_A, GID_COLLAUDO_DA } from '../fixtures/collaudo-shopify.dataset';
import { ShopifyTrasportoException } from '../../shopify/shopify-trasporto.util';

/**
 * Il rifiuto di un metafield di tipo `id` già in uso: il TESTO è quello catturato dal
 * negozio il 15/09/2026 (prova di contratto G9/G10 su `productSet`, codice
 * `INVALID_METAFIELD`, campo `input.metafields.0.value` / `input.variants.N.metafields.0.value`).
 * Il servizio non lo interpreta — qualunque non-successo si rilegge per identità.
 */
const MESSAGGIO_IDENTITA_DOPPIA =
  'Value is already assigned to another metafield. Choose a different value to ensure it remains unique.';

/** Un fulfillment order del negozio simulato. */
export interface FulfillmentOrderSimulato {
  readonly id: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';
  readonly locationId: string | null;
  readonly righe: {
    readonly lineItemId: number;
    readonly inventoryItemId: string;
    remaining: number;
    total: number;
  }[];
}

function gidFulfillmentOrder(id: number): string {
  return `gid://shopify/FulfillmentOrder/${id}`;
}

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
  /** Il costo dell'inventory item, come lo darebbe `GET /inventory_items/{id}.json` (`cost`). */
  cost: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  /** `vestiflow.variant_id` (tipo `id`): assente sulle varianti non nostre. */
  identita?: string | null;
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
  /** `vestiflow.product_id` (tipo `id`): assente sui prodotti nati su Shopify. */
  identita?: string | null;
}

/** Una definizione di metafield del negozio simulato, come la legge `metafieldDefinitions`. */
export interface DefinizioneSimulata {
  readonly id: string;
  readonly namespace: string;
  readonly key: string;
  readonly ownerType: 'PRODUCT' | 'PRODUCTVARIANT';
  readonly typeName: string;
}

/** La forma DICHIARATIVA di un prodotto nato su Shopify (seme del catalogo remoto). */
export interface SpecVarianteRemota {
  readonly sku: string | null;
  readonly barcode: string | null;
  readonly price: string;
  /** Costo dell'inventory item (opzionale: senza, Shopify risponde `cost: null`). */
  readonly cost?: string | null;
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
  /**
   * ⭐ La PRIMA CONNESSIONE (`docs/27`): il negozio ha anche IMPEGNI per coppia
   *    (`committed`), LOCATION e ORDINI. `quantitaRemote` resta il DISPONIBILE:
   *    `on_hand = available + committed`, come su Shopify.
   */
  private readonly impegniRemoti = new Map<string, number>();
  private location: readonly {
    readonly id: number;
    readonly name: string;
    readonly active: boolean;
  }[] = [];
  readonly ordiniRemoti = new Map<number, Record<string, unknown>>();
  /**
   * ⭐ I FULFILLMENT ORDER (13/09/2026): dove Shopify ha assegnato ogni riga
   *    prima della spedizione. Nascono con l'ordine se ha una sede, si possono
   *    assegnare dopo (`assegnaFulfillmentOrder`), spostare
   *    (`spostaFulfillmentOrder`), dividere (`dividiRigaFraSedi`); l'evasione
   *    scala il residuo e chiude. Gli IMPEGNI remoti seguono i fulfillment
   *    order, non `location_id` dell'ordine — come su Shopify.
   */
  private readonly fulfillmentOrdersRemoti = new Map<number, FulfillmentOrderSimulato[]>();
  /** Con `false`, la lettura risponde ACCESS_DENIED: l'app non ha l'ambito. */
  permessoFulfillmentOrders = true;
  /** `false` simula una lettura troncata (altre pagine): classifica, ma non rilascia. */
  letturaFulfillmentOrdersCompleta = true;
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
  /**
   * Le definizioni di metafield del negozio, per `owner/namespace.key`.
   *
   * ⭐ **Sopravvivono a `azzeraChiamate` e sono PERMANENTI come sul negozio vero**
   *    (contratto G1, 15/09/2026): create una volta, restano. Una prova che vuole
   *    partire «senza definizioni» crea un negozio nuovo.
   */
  readonly definizioni = new Map<string, DefinizioneSimulata>();

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

  private readonly varchi = new Map<string, { attesa: Promise<void>; apri: () => void }>();
  /**
   * Tiene FERMA la prossima chiamata a `metodo` — prima di ogni effetto — finché la prova
   * non chiama la funzione restituita. È una richiesta in volo: chi la sta aspettando non
   * sa ancora com'è andata, e nel frattempo un altro può fare la propria.
   */
  bloccaProssima(metodo: string): () => void {
    let apri: () => void = () => undefined;
    const attesa = new Promise<void>((resolve) => {
      apri = resolve;
    });
    this.varchi.set(metodo, { attesa, apri });
    return apri;
  }

  private async varco(metodo: string): Promise<void> {
    const v = this.varchi.get(metodo);
    if (v) {
      this.varchi.delete(metodo);
      await v.attesa;
    }
  }

  /** Una definizione già presente sul negozio, anche di un TIPO diverso da `id` (G1: non si adotta). */
  seminaDefinizione(def: Omit<DefinizioneSimulata, 'id'>): DefinizioneSimulata {
    const chiave = `${def.ownerType}/${def.namespace}.${def.key}`;
    const creata = { ...def, id: gidDi('MetafieldDefinition', this.nuovoId()) };
    this.definizioni.set(chiave, creata);
    return creata;
  }

  /** Il prodotto remoto che porta QUELLA identità VestiFlow, o nessuno. */
  prodottoPerIdentita(productId: string): ProdottoRemoto | null {
    for (const prodotto of this.prodotti.values()) {
      if (prodotto.identita === productId) {
        return structuredClone(prodotto);
      }
    }
    return null;
  }

  /** Quanti prodotti remoti portano quell'identità: la misura del doppione. */
  contaProdottiConIdentita(productId: string): number {
    let n = 0;
    for (const prodotto of this.prodotti.values()) {
      if (prodotto.identita === productId) n += 1;
    }
    return n;
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
  impostaLocation(
    location: readonly { readonly id: number; readonly name: string; readonly active: boolean }[],
  ): void {
    this.location = location;
  }

  impegnoRemoto(inventoryItemId: string, locationId: string): number {
    return this.impegniRemoti.get(`${inventoryItemId}@${locationId}`) ?? 0;
  }

  /**
   * Un ORDINE che nasce sul negozio: impegna (`committed` +q, `available` −q,
   * `on_hand` invariato) e resta aperto finché non lo si evade. Nessun evento
   * verso VestiFlow: è il canale che sa una cosa che VestiFlow non sa ancora.
   */
  creaOrdineRemoto(spec: {
    readonly righe: readonly {
      readonly sku: string;
      readonly inventoryItemId: string;
      readonly variantId?: number;
      readonly quantity: number;
      /** Prezzo unitario come lo scrive Shopify (`"25.00"`); `10.00` se assente. */
      readonly price?: string;
    }[];
    /**
     * La sede in cui Shopify ASSEGNA l'ordine: nasce un fulfillment order aperto
     * con tutte le righe (e `location_id` sull'ordine, come un ordine POS).
     * `null`: nessun fulfillment order — l'assegnazione arriverà dopo.
     */
    readonly locationId?: string | null;
    /**
     * Solo il fulfillment order, SENZA `location_id` sull'ordine: è la forma
     * di un ordine online o da bozza, dove l'ordine non porta una sede e
     * quella vera sta nel fulfillment order.
     */
    readonly assegnataA?: string | null;
  }): Record<string, unknown> {
    const id = this.nuovoId();
    const totale = spec.righe
      .reduce((somma, riga) => somma + Number(riga.price ?? '10.00') * riga.quantity, 0)
      .toFixed(2);
    const ordine: Record<string, unknown> = {
      id,
      name: `#${id}`,
      order_number: id,
      email: `cliente-${id}@prova.it`,
      customer: { first_name: 'Cliente', last_name: String(id) },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      currency: 'EUR',
      financial_status: 'paid',
      fulfillment_status: null,
      cancelled_at: null,
      location_id: spec.locationId ?? null,
      subtotal_price: totale,
      total_price: totale,
      total_tax: '0.00',
      total_discounts: '0.00',
      fulfillments: [],
      refunds: [],
      line_items: spec.righe.map((riga, i) => ({
        id: id * 10 + i,
        variant_id: riga.variantId ?? null,
        sku: riga.sku,
        title: `Riga ${riga.sku}`,
        name: `Riga ${riga.sku}`,
        variant_title: null,
        quantity: riga.quantity,
        price: riga.price ?? '10.00',
        inventory_item_id: riga.inventoryItemId,
      })),
    };
    this.ordiniRemoti.set(id, ordine);
    const sedeAssegnata = spec.locationId ?? spec.assegnataA ?? null;
    if (sedeAssegnata) {
      this.assegnaFulfillmentOrder(id, sedeAssegnata);
    }
    return ordine;
  }

  // ── i fulfillment order ──────────────────────────────────────────────────

  private righeOrdine(id: number): {
    id: number;
    inventory_item_id: string;
    quantity: number;
    current_quantity?: number;
  }[] {
    const ordine = this.ordiniRemoti.get(id);
    if (!ordine) {
      throw new Error(`ordine remoto ${id} inesistente`);
    }
    return ordine.line_items as {
      id: number;
      inventory_item_id: string;
      quantity: number;
      current_quantity?: number;
    }[];
  }

  private impegna(inventoryItemId: string, locationId: string, quantita: number): void {
    const chiave = `${inventoryItemId}@${locationId}`;
    this.impegniRemoti.set(chiave, (this.impegniRemoti.get(chiave) ?? 0) + quantita);
    this.quantitaRemote.set(chiave, (this.quantitaRemote.get(chiave) ?? 0) - quantita);
  }

  fulfillmentOrdersDi(id: number): readonly FulfillmentOrderSimulato[] {
    return this.fulfillmentOrdersRemoti.get(id) ?? [];
  }

  /**
   * L'ASSEGNAZIONE (tardiva, se l'ordine è nato senza): un fulfillment order
   * aperto nella sede, con le righe che nessun altro fulfillment order porta.
   * Impegna lì. Restituisce il payload del webhook `order_routing_complete`.
   */
  assegnaFulfillmentOrder(id: number, locationId: string): Record<string, unknown> {
    const esistenti = this.fulfillmentOrdersRemoti.get(id) ?? [];
    const giaPortate = new Set(esistenti.flatMap((fo) => fo.righe.map((r) => r.lineItemId)));
    const righe = this.righeOrdine(id)
      .filter((riga) => !giaPortate.has(riga.id))
      .map((riga) => ({
        lineItemId: riga.id,
        inventoryItemId: riga.inventory_item_id,
        remaining: riga.current_quantity ?? riga.quantity,
        total: riga.current_quantity ?? riga.quantity,
      }));
    const fo: FulfillmentOrderSimulato = {
      id: this.nuovoId(),
      status: 'OPEN',
      locationId,
      righe,
    };
    for (const riga of righe) {
      this.impegna(riga.inventoryItemId, locationId, riga.remaining);
    }
    this.fulfillmentOrdersRemoti.set(id, [...esistenti, fo]);
    return { fulfillment_order: { id: gidFulfillmentOrder(fo.id), status: 'open' } };
  }

  /**
   * Lo SPOSTAMENTO: il fulfillment order attivo si chiude e ne nasce uno nella
   * sede nuova col residuo; l'impegno remoto si libera là e si prende qui.
   * Restituisce il payload del webhook `fulfillment_orders/moved`.
   */
  spostaFulfillmentOrder(id: number, nuovaLocationId: string): Record<string, unknown> {
    const esistenti = this.fulfillmentOrdersRemoti.get(id) ?? [];
    const originale = esistenti.find((fo) => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS');
    if (!originale) {
      throw new Error(`ordine remoto ${id}: nessun fulfillment order attivo da spostare`);
    }
    originale.status = 'CLOSED';
    const nuovo: FulfillmentOrderSimulato = {
      id: this.nuovoId(),
      status: 'OPEN',
      locationId: nuovaLocationId,
      righe: originale.righe
        .filter((r) => r.remaining > 0)
        .map((r) => ({ ...r, total: r.remaining })),
    };
    for (const riga of nuovo.righe) {
      if (originale.locationId) {
        this.impegna(riga.inventoryItemId, originale.locationId, -riga.remaining);
      }
      this.impegna(riga.inventoryItemId, nuovaLocationId, riga.remaining);
    }
    this.fulfillmentOrdersRemoti.set(id, [...esistenti, nuovo]);
    return {
      original_fulfillment_order: { id: gidFulfillmentOrder(originale.id), status: 'closed' },
      moved_fulfillment_order: { id: gidFulfillmentOrder(nuovo.id), status: 'open' },
      destination_location_id: `gid://shopify/Location/${nuovaLocationId}`,
    };
  }

  /**
   * La STESSA riga divisa fra due sedi: dal fulfillment order attivo che la
   * porta se ne stacca una parte in un secondo fulfillment order. È il caso che
   * VestiFlow dichiara come limite (un impegno per riga).
   */
  dividiRigaFraSedi(id: number, lineItemId: number, quantita: number, locationId: string): void {
    const esistenti = this.fulfillmentOrdersRemoti.get(id) ?? [];
    const origine = esistenti.find(
      (fo) =>
        (fo.status === 'OPEN' || fo.status === 'IN_PROGRESS') &&
        fo.righe.some((r) => r.lineItemId === lineItemId && r.remaining >= quantita),
    );
    const riga = origine?.righe.find((r) => r.lineItemId === lineItemId);
    if (!origine || !riga) {
      throw new Error(`ordine remoto ${id}: riga ${lineItemId} non divisibile per ${quantita}`);
    }
    riga.remaining -= quantita;
    riga.total -= quantita;
    if (origine.locationId) {
      this.impegna(riga.inventoryItemId, origine.locationId, -quantita);
    }
    this.impegna(riga.inventoryItemId, locationId, quantita);
    this.fulfillmentOrdersRemoti.set(id, [
      ...esistenti,
      {
        id: this.nuovoId(),
        status: 'OPEN',
        locationId,
        righe: [{ ...riga, remaining: quantita, total: quantita }],
      },
    ]);
  }

  /** L'evasione scala il residuo del fulfillment order che porta la riga in quella sede. */
  private scalaFulfillmentOrder(
    id: number,
    lineItemId: number,
    quantita: number,
    sedeEvasione: string | null,
  ): string | null {
    const attivi = (this.fulfillmentOrdersRemoti.get(id) ?? []).filter(
      (fo) => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS',
    );
    const fo =
      attivi.find(
        (candidato) =>
          candidato.locationId === sedeEvasione &&
          candidato.righe.some((r) => r.lineItemId === lineItemId && r.remaining > 0),
      ) ??
      attivi.find((candidato) =>
        candidato.righe.some((r) => r.lineItemId === lineItemId && r.remaining > 0),
      );
    const riga = fo?.righe.find((r) => r.lineItemId === lineItemId);
    if (!fo || !riga) {
      return null;
    }
    riga.remaining = Math.max(0, riga.remaining - quantita);
    if (fo.righe.every((r) => r.remaining === 0)) {
      fo.status = 'CLOSED';
    } else {
      fo.status = 'IN_PROGRESS';
    }
    return fo.locationId;
  }

  /**
   * L’EVASIONE sul negozio: `committed` −q, `on_hand` −q, `available` invariato.
   * Con una sede diversa da quella dell’ordine, l’impegno si libera dove era e
   * la merce esce da dove si spedisce — come su Shopify.
   *
   * ⭐ Dal 12/09/2026 spedisce la quantità CORRENTE (dopo gli annullamenti
   *    parziali) e può spedire un SOTTOINSIEME di righe (`righe`, con una
   *    quantità parziale se indicata): ogni
   *    chiamata aggiunge un `fulfillment` con la sua `location_id` e le sue
   *    `line_items[]`, e `fulfillment_status` resta `partial` finché resta
   *    qualcosa da spedire — come su Shopify.
   */
  evadiOrdineRemoto(
    id: number,
    locationId?: string,
    righeScelte?: readonly { readonly id: number; readonly quantity?: number }[],
  ): Record<string, unknown> {
    const ordine = this.ordiniRemoti.get(id);
    if (!ordine) {
      throw new Error(`ordine remoto ${id} inesistente`);
    }
    const sedeOrdine = (ordine.location_id as string | null) ?? null;
    // Senza una sede indicata si spedisce da dove sta il fulfillment order
    // attivo — come fa Shopify — e solo in mancanza dalla sede dell'ordine.
    const sedeEvasione =
      locationId ??
      this.fulfillmentOrdersDi(id).find((fo) => fo.status === 'OPEN' || fo.status === 'IN_PROGRESS')
        ?.locationId ??
      sedeOrdine;
    const righe = ordine.line_items as {
      id: number;
      inventory_item_id: string;
      quantity: number;
      current_quantity?: number;
    }[];
    const evasioni = [...((ordine.fulfillments as Record<string, unknown>[] | undefined) ?? [])];
    const giaSpedite = new Map<number, number>();
    for (const evasione of evasioni) {
      for (const riga of (evasione.line_items as { id: number; quantity: number }[]) ?? []) {
        giaSpedite.set(riga.id, (giaSpedite.get(riga.id) ?? 0) + riga.quantity);
      }
    }
    const daSpedire = righe
      .filter((riga) => !righeScelte || righeScelte.some((scelta) => scelta.id === riga.id))
      .map((riga) => {
        const residuo = (riga.current_quantity ?? riga.quantity) - (giaSpedite.get(riga.id) ?? 0);
        const chiesta = righeScelte?.find((scelta) => scelta.id === riga.id)?.quantity;
        return { riga, quantita: Math.min(residuo, chiesta ?? residuo) };
      })
      .filter(({ quantita }) => quantita > 0);
    if (daSpedire.length === 0) {
      throw new Error(`ordine remoto ${id}: niente da spedire`);
    }
    for (const { riga, quantita } of daSpedire) {
      // ⭐ L'impegno si libera dove sta il FULFILLMENT ORDER della riga (13/09/2026),
      //    che è la sede dell'ordine solo quando coincidono.
      const sedeImpegno = this.scalaFulfillmentOrder(id, riga.id, quantita, sedeEvasione);
      if (sedeImpegno) {
        // L’impegno liberato rialza il disponibile della sede che lo portava…
        this.impegna(riga.inventory_item_id, sedeImpegno, -quantita);
      }
      if (sedeEvasione) {
        // …e la merce spedita abbassa on_hand (= available, a impegno liberato) dove esce.
        const uscita = `${riga.inventory_item_id}@${sedeEvasione}`;
        this.quantitaRemote.set(uscita, (this.quantitaRemote.get(uscita) ?? 0) - quantita);
      }
      giaSpedite.set(riga.id, (giaSpedite.get(riga.id) ?? 0) + quantita);
    }
    evasioni.push({
      id: id * 100 + evasioni.length,
      status: 'success',
      created_at: new Date().toISOString(),
      location_id: sedeEvasione ? Number(sedeEvasione) : null,
      line_items: daSpedire.map(({ riga, quantita }) => ({ ...riga, quantity: quantita })),
    });
    const tuttoSpedito = righe.every(
      (riga) => (giaSpedite.get(riga.id) ?? 0) >= (riga.current_quantity ?? riga.quantity),
    );
    const evaso = {
      ...ordine,
      fulfillment_status: tuttoSpedito ? 'fulfilled' : 'partial',
      updated_at: new Date().toISOString(),
      fulfillments: evasioni,
    };
    this.ordiniRemoti.set(id, evaso);
    return evaso;
  }

  /**
   * Il RESO sul negozio, incartato in un rimborso — come lo fa Shopify: un
   * `refunds[]` con `refund_line_items[]`, ognuno col proprio `restock_type` e
   * la propria `location_id` di rientro (che può NON essere quella di spedizione).
   * Con `return` la merce rientra: `on_hand` +q (= available) in QUELLA sede.
   * Con `no_restock` è solo denaro: nessuna quantità si muove.
   * Misurato il 14/08/2026 su un negozio vero (`shopify-sync.service.ts`,
   * `emitRestockEvents`): anche un reso da zero euro arriva così.
   */
  rimborsaOrdineRemoto(
    id: number,
    spec: {
      readonly righe: readonly {
        readonly lineItemId: number;
        readonly quantity: number;
        readonly restockType: 'return' | 'no_restock' | 'cancel' | 'legacy_restock';
        readonly locationId?: string | null;
      }[];
      /**
       * Rettifiche fuori riga (`order_adjustments`), come le scrive Shopify: importo
       * NEGATIVO, imposta a parte. Un rimborso con sole rettifiche e nessuna riga è
       * un rimborso di solo importo (spedizione, differenza).
       */
      readonly rettifiche?: readonly {
        readonly kind: 'shipping_refund' | 'refund_discrepancy';
        readonly amount: string;
        readonly taxAmount?: string;
      }[];
    },
  ): Record<string, unknown> {
    const ordine = this.ordiniRemoti.get(id);
    if (!ordine) {
      throw new Error(`ordine remoto ${id} inesistente`);
    }
    const righeOrdine = ordine.line_items as {
      id: number;
      inventory_item_id: string;
      quantity: number;
      current_quantity?: number;
    }[];
    const sedeOrdine = (ordine.location_id as string | null) ?? null;
    const rimborsi = [...((ordine.refunds as Record<string, unknown>[] | undefined) ?? [])];
    const refundId = id * 1000 + rimborsi.length + 1;
    const adesso = new Date().toISOString();
    const refundLineItems = spec.righe.map((riga, i) => {
      const rigaOrdine = righeOrdine.find((r) => r.id === riga.lineItemId);
      if (!rigaOrdine) {
        throw new Error(`riga ${riga.lineItemId} non appartiene all'ordine ${id}`);
      }
      if (
        (riga.restockType === 'return' || riga.restockType === 'legacy_restock') &&
        riga.locationId
      ) {
        const chiave = `${rigaOrdine.inventory_item_id}@${riga.locationId}`;
        this.quantitaRemote.set(chiave, (this.quantitaRemote.get(chiave) ?? 0) + riga.quantity);
      }
      if (riga.restockType === 'cancel') {
        // ⭐ Annullamento PARZIALE prima della spedizione, come su Shopify: la
        //    riga resta con la quantità ordinata, `current_quantity` scende, e
        //    l'impegno remoto si libera (available torna su) nella sede dell'ordine.
        rigaOrdine.current_quantity =
          (rigaOrdine.current_quantity ?? rigaOrdine.quantity) - riga.quantity;
        const sedeImpegno =
          this.scalaFulfillmentOrder(id, riga.lineItemId, riga.quantity, sedeOrdine) ?? sedeOrdine;
        if (sedeImpegno) {
          this.impegna(rigaOrdine.inventory_item_id, sedeImpegno, -riga.quantity);
        }
      }
      // Il valore della riga rimborsata è prezzo × quantità, come su Shopify.
      const prezzo = Number((rigaOrdine as { price?: string }).price ?? '10.00');
      return {
        id: refundId * 10 + i,
        line_item_id: riga.lineItemId,
        quantity: riga.quantity,
        restock_type: riga.restockType,
        location_id: riga.locationId ? Number(riga.locationId) : null,
        subtotal: (prezzo * riga.quantity).toFixed(2),
        total_tax: '0.00',
        line_item: { id: riga.lineItemId, quantity: riga.quantity, price: prezzo.toFixed(2) },
      };
    });
    rimborsi.push({
      id: refundId,
      order_id: id,
      created_at: adesso,
      processed_at: adesso,
      note: null,
      refund_line_items: refundLineItems,
      order_adjustments: (spec.rettifiche ?? []).map((rettifica, i) => ({
        id: refundId * 100 + i,
        kind: rettifica.kind,
        amount: rettifica.amount,
        tax_amount: rettifica.taxAmount ?? '0.00',
      })),
      transactions: [],
    });
    const rimborsato = { ...ordine, updated_at: adesso, refunds: rimborsi };
    this.ordiniRemoti.set(id, rimborsato);
    return rimborsato;
  }

  quantitaRemota(inventoryItemId: string | null, locationId: string): number | null {
    if (!inventoryItemId) {
      return null;
    }
    return this.quantitaRemote.get(`${inventoryItemId}@${locationId}`) ?? null;
  }

  /** Il prossimo `volte` invocazioni di `metodo` FALLISCONO: un guasto in un punto preciso. */
  guastaProssima(metodo: string, volte = 1, dopo = 0): void {
    this.guasti.set(metodo, volte);
    this.guastiDopo.set(metodo, dopo);
  }
  /** Quante chiamate SANE lasciar passare prima del guasto: «la seconda rilettura cade». */
  private readonly guastiDopo = new Map<string, number>();

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
    const dopo = this.guastiDopo.get(metodo) ?? 0;
    if (dopo > 0) {
      this.guastiDopo.set(metodo, dopo - 1);
      return;
    }
    const guasti = this.guasti.get(metodo) ?? 0;
    if (guasti > 0) {
      this.guasti.set(metodo, guasti - 1);
      throw new Error(`Shopify simulato (${this.dominio}): guasto iniettato su ${metodo}`);
    }
  }

  /**
   * Un articolo nuovo è STOCCATO a zero in ogni location attiva del negozio (dove il
   * negozio ne ha): così Allinea trova un livello da scrivere, come dopo una creazione
   * con inventario tracciato.
   */
  private stoccaAZero(prodotto: ProdottoRemoto): void {
    for (const sede of this.location.filter((l) => l.active)) {
      for (const v of prodotto.variants) {
        const chiave = `${v.inventory_item_id}@${sede.id}`;
        if (!this.quantitaRemote.has(chiave)) {
          this.quantitaRemote.set(chiave, 0);
        }
      }
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
      cost: spec.cost ?? null,
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

  /** Il client REST Admin: creazione e lettura del catalogo, location e ordini. */
  admin() {
    const ordiniOrdinati = () =>
      [...this.ordiniRemoti.entries()].sort((a, b) => a[0] - b[0]).map(([, o]) => o);
    return {
      listLocations: vi.fn(async () => {
        this.conta('listLocations');
        return this.location.map((l) => ({ ...l }));
      }),
      listOpenUnfulfilledOrders: vi.fn(async () => {
        this.conta('listOpenUnfulfilledOrders');
        return ordiniOrdinati().filter(
          (o) => o.cancelled_at == null && o.fulfillment_status !== 'fulfilled',
        );
      }),
      listOrdersSinceId: vi.fn(async (_d: string, _t: string, sinceId: string) => {
        this.conta('listOrdersSinceId');
        return ordiniOrdinati().filter((o) => Number(o.id) > Number(sinceId));
      }),
      getLatestOrderId: vi.fn(async () => {
        this.conta('getLatestOrderId');
        const ultimo = ordiniOrdinati().at(-1);
        return ultimo ? String(ultimo.id) : null;
      }),
      getOrder: vi.fn(async (_d: string, _t: string, id: string) => {
        this.conta('getOrder');
        return this.ordiniRemoti.get(Number(id)) ?? null;
      }),
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
              // Il costo non viaggia nel payload REST del prodotto: nasce nullo, come sul canale.
              cost: null,
              option1: (riga['option1'] as string | undefined) ?? null,
              option2: (riga['option2'] as string | undefined) ?? null,
              option3: (riga['option3'] as string | undefined) ?? null,
            })),
            images: [],
          };
          this.prodotti.set(id, prodotto);
          this.stoccaAZero(prodotto);
          // ⚠️ Anche qui la risposta può perdersi DOPO l'effetto: il prodotto remoto esiste,
          //    VestiFlow non ne conosce l'id (`docs/30` #5).
          const perse = this.rispostePerse.get('createProduct') ?? 0;
          if (perse > 0) {
            this.rispostePerse.set('createProduct', perse - 1);
            throw new Error(
              `Shopify simulato (${this.dominio}): risposta persa su createProduct — il prodotto E' stato creato`,
            );
          }
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
      listProductCollects: vi.fn(async () => {
        this.conta('listProductCollects');
        return [];
      }),
      resolveCollectionTitles: vi.fn(async () => {
        this.conta('resolveCollectionTitles');
        return [];
      }),
      // ⭐ Una chiamata PER VARIANTE, come sul canale vero: è quella che l'arricchimento
      //    dei costi paga, e che una prova può contare (`docs/30` #2).
      getInventoryItem: vi.fn(async (_d: string, _t: string, inventoryItemId: string) => {
        this.conta('getInventoryItem');
        for (const prodotto of this.prodotti.values()) {
          const variante = prodotto.variants.find(
            (v) => String(v.inventory_item_id) === String(inventoryItemId),
          );
          if (variante) {
            return { id: variante.inventory_item_id, cost: variante.cost };
          }
        }
        throw new Error(
          `Shopify simulato (${this.dominio}): inventory item ${inventoryItemId} inesistente`,
        );
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
    const identitaProdotto = (
      metafields: readonly { namespace: string; key: string; value: string }[] | undefined,
    ): string | null =>
      metafields?.find((m) => m.namespace === 'vestiflow' && m.key === 'product_id')?.value ?? null;
    const identitaVariante = (
      metafields: readonly { namespace: string; key: string; value: string }[] | undefined,
    ): string | null =>
      metafields?.find((m) => m.namespace === 'vestiflow' && m.key === 'variant_id')?.value ?? null;
    /** Un'identità di variante già portata da un'ALTRA variante del negozio (G4: unica per negozio). */
    const identitaVarianteOccupata = (identita: string, salvoId: number | null): boolean => {
      for (const prodotto of this.prodotti.values()) {
        if (prodotto.variants.some((v) => v.identita === identita && v.id !== salvoId)) {
          return true;
        }
      }
      return false;
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
      getRemoteStockAtLocation: vi.fn(
        async (_dominio: string, _token: string, inventoryItemGid: string, locationGid: string) => {
          this.conta('getRemoteStockAtLocation');
          const item = this.numeroDi(inventoryItemGid);
          const sede = this.numeroDi(locationGid);
          const available = this.quantitaRemote.get(`${item}@${sede}`);
          if (available === undefined) {
            return { found: false as const, reason: 'sede_non_stoccata' as const };
          }
          const committed = this.impegniRemoti.get(`${item}@${sede}`) ?? 0;
          return { found: true as const, onHand: available + committed, available, committed };
        },
      ),
      /**
       * I fulfillment order dell'ordine, nella forma del client vero: con
       * `permessoFulfillmentOrders = false` risponde `permesso_mancante` (come
       * ACCESS_DENIED), con un guasto iniettato `lettura_fallita`.
       */
      getFulfillmentOrders: vi.fn(async (_dominio: string, _token: string, orderGid: string) => {
        try {
          this.conta('getFulfillmentOrders');
        } catch (errore) {
          return {
            ok: false as const,
            motivo: 'lettura_fallita' as const,
            dettaglio: String(errore),
          };
        }
        if (!this.permessoFulfillmentOrders) {
          return {
            ok: false as const,
            motivo: 'permesso_mancante' as const,
            dettaglio: 'Shopify GraphQL: Access denied for fulfillmentOrders field.',
          };
        }
        const id = this.numeroDi(orderGid);
        return {
          ok: true as const,
          completa: this.letturaFulfillmentOrdersCompleta,
          fulfillmentOrders: (this.fulfillmentOrdersRemoti.get(Number(id)) ?? []).map((fo) => ({
            id: gidFulfillmentOrder(fo.id),
            status: fo.status,
            assignedLocationGid: fo.locationId ? `gid://shopify/Location/${fo.locationId}` : null,
            righe: fo.righe.map((r) => ({
              lineItemGid: `gid://shopify/LineItem/${r.lineItemId}`,
              remainingQuantity: r.remaining,
              totalQuantity: r.total,
            })),
          })),
        };
      }),
      getOrderIdOfFulfillmentOrder: vi.fn(
        async (_dominio: string, _token: string, fulfillmentOrderGid: string) => {
          this.conta('getOrderIdOfFulfillmentOrder');
          const foId = Number(this.numeroDi(fulfillmentOrderGid));
          for (const [orderId, fos] of this.fulfillmentOrdersRemoti) {
            if (fos.some((fo) => fo.id === foId)) {
              return String(orderId);
            }
          }
          return null;
        },
      ),
      getRemoteLevelAtLocation: vi.fn(
        async (_dominio: string, _token: string, inventoryItemId: string, locationId: string) => {
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
          // ⛔ **Una chiave ASSENTE non è «azzera»**: su Shopify un campo omesso
          //    da `productUpdate` resta com’è. Qui c’era `?? null`, che lo
          //    cancellava — e con quel comportamento nessuna prova poteva
          //    dimostrare che un tipo prodotto «non ancora acquisito» lascia
          //    stare il remoto (docs/24 §9.5): il simulato lo cancellava da sé,
          //    e l’asserzione passava per la ragione sbagliata.
          if (input.productType !== undefined) {
            prodotto.product_type = input.productType;
          }
          // ⚠️ `vendor` e `tags` qui sopra e qui sotto hanno la STESSA divergenza
          //    dal comportamento vero, e restano come sono: sono fuori dal
          //    perimetro concordato, e cambiarli sposterebbe le aspettative di
          //    prove che non ho scritto io. Segnalato in `DA-FARE` §31.26.
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
            metafields?: readonly { namespace: string; key: string; value: string }[];
          }[],
        ) => {
          this.conta('bulkUpdateVariants');
          const prodotto = trova(productGid);
          // ⭐ Tutto-o-niente: un'identità già di un'altra variante rifiuta l'intera mutation.
          for (const input of varianti) {
            const identita = identitaVariante(input.metafields);
            if (identita && identitaVarianteOccupata(identita, idDaGid(input.id))) {
              throw new Error(
                `Shopify productVariantsBulkUpdate: ${MESSAGGIO_IDENTITA_DOPPIA} (variant_id ${identita})`,
              );
            }
          }
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
            const identita = identitaVariante(input.metafields);
            if (identita) variante.identita = identita;
          }
        },
      ),
      // ── l'identità VestiFlow in creazione (contratto G1–G7, 15/09/2026) ──────
      leggiDefinizioneMetafield: vi.fn(
        async (_d: string, _t: string, ownerType: string, namespace: string, key: string) => {
          this.conta('leggiDefinizioneMetafield');
          return this.definizioni.get(`${ownerType}/${namespace}.${key}`) ?? null;
        },
      ),
      creaDefinizioneMetafield: vi.fn(
        async (
          _d: string,
          _t: string,
          def: {
            readonly namespace: string;
            readonly key: string;
            readonly type: string;
            readonly ownerType: 'PRODUCT' | 'PRODUCTVARIANT';
          },
        ) => {
          this.conta('creaDefinizioneMetafield');
          const chiave = `${def.ownerType}/${def.namespace}.${def.key}`;
          if (this.definizioni.has(chiave)) {
            // Il negozio vero risponde con un userError (TAKEN): il client lo solleva.
            throw new Error(`Shopify metafieldDefinitionCreate: Key is in use for ${chiave}`);
          }
          return this.seminaDefinizione({ ...def, typeName: def.type });
        },
      ),
      /**
       * `productSet` in SOLA creazione, come catturato sul negozio il 15/09/2026 (G9–G11):
       * prodotto, opzioni, varianti (nell'ORDINE dell'input, con le identità) in una
       * mutation; nessuna variante iniziale. ⛔ Un'identità di prodotto o di variante già
       * usata → `INVALID_METAFIELD` («Value is already assigned to another metafield…») e
       * NIENTE creato, senza toccare il prodotto esistente; una combinazione doppia →
       * `INVALID_VARIANT` («The variant 'M' already exists.») e NIENTE creato. Un `id` o un
       * `identifier` nell'input è un errore: qui non si aggiorna mai. La risposta può
       * perdersi DOPO l'effetto (`perdiProssimaRisposta('createProductSet')`).
       */
      createProductSet: vi.fn(
        async (
          _d: string,
          _t: string,
          input: {
            readonly id?: unknown;
            readonly identifier?: unknown;
            readonly title: string;
            readonly descriptionHtml?: string;
            readonly vendor?: string;
            readonly productType?: string;
            readonly tags?: readonly string[];
            readonly status: string;
            readonly productOptions: readonly {
              readonly name: string;
              readonly values: readonly { readonly name: string }[];
            }[];
            readonly metafields?: readonly { namespace: string; key: string; value: string }[];
            readonly variants: readonly {
              readonly optionValues: readonly {
                readonly optionName: string;
                readonly name: string;
              }[];
              readonly price?: string;
              readonly compareAtPrice?: string;
              readonly barcode?: string;
              readonly sku?: string;
              readonly metafields?: readonly { namespace: string; key: string; value: string }[];
            }[];
          },
        ) => {
          this.conta('createProductSet');
          await this.varco('createProductSet');
          if (input.id !== undefined || input.identifier !== undefined) {
            throw new Error(
              `Shopify simulato (${this.dominio}): productSet con id/identifier — non è una creazione`,
            );
          }
          // ── i controlli, TUTTI prima di qualunque effetto (atomicità osservata, G9/G10) ──
          const identita = identitaProdotto(input.metafields);
          if (identita && this.contaProdottiConIdentita(identita) > 0) {
            throw new Error(
              `Shopify productSet: INVALID_METAFIELD input.metafields.0.value: ${MESSAGGIO_IDENTITA_DOPPIA}`,
            );
          }
          const opzioni = input.productOptions.map((o) => ({
            name: o.name,
            values: o.values.map((v) => v.name),
          }));
          const combinazioni = new Set<string>();
          input.variants.forEach((riga, i) => {
            const identitaVar = identitaVariante(riga.metafields);
            if (identitaVar && identitaVarianteOccupata(identitaVar, null)) {
              throw new Error(
                `Shopify productSet: INVALID_METAFIELD input.variants.${i}.metafields.0.value: ${MESSAGGIO_IDENTITA_DOPPIA}`,
              );
            }
            const perOpzione = new Map(riga.optionValues.map((o) => [o.optionName, o.name]));
            const chiave = opzioni.map((o) => perOpzione.get(o.name) ?? '').join(' / ');
            if (combinazioni.has(chiave)) {
              throw new Error(
                `Shopify productSet: INVALID_VARIANT input.variants.${i}: The variant '${chiave}' already exists.`,
              );
            }
            combinazioni.add(chiave);
          });
          // ── l'effetto: prodotto e varianti nell'ordine dell'input ──
          const id = this.nuovoId();
          const varianti: VarianteRemota[] = input.variants.map((riga) => {
            const perOpzione = new Map(riga.optionValues.map((o) => [o.optionName, o.name]));
            const valori = opzioni.map((o) => perOpzione.get(o.name) ?? null);
            return {
              id: this.nuovoId(),
              title: valori.filter((v): v is string => v !== null).join(' / ') || 'Default Title',
              sku: riga.sku ?? null,
              barcode: riga.barcode ?? null,
              price: riga.price ?? '0.00',
              compare_at_price: riga.compareAtPrice ?? null,
              inventory_item_id: this.nuovoId(),
              cost: null,
              option1: valori[0] ?? null,
              option2: valori[1] ?? null,
              option3: valori[2] ?? null,
              identita: identitaVariante(riga.metafields),
            };
          });
          const prodotto: ProdottoRemoto = {
            id,
            title: input.title,
            body_html: input.descriptionHtml ?? null,
            vendor: input.vendor ?? null,
            product_type: input.productType ?? null,
            tags: input.tags ? input.tags.join(', ') : '',
            status: input.status.toLowerCase(),
            options: opzioni,
            variants: varianti,
            images: [],
            identita,
          };
          this.prodotti.set(id, prodotto);
          this.stoccaAZero(prodotto);
          const perse = this.rispostePerse.get('createProductSet') ?? 0;
          if (perse > 0) {
            this.rispostePerse.set('createProductSet', perse - 1);
            throw new ShopifyTrasportoException(
              'timeout',
              true,
              `Shopify simulato (${this.dominio}): risposta persa su productSet — il prodotto E' stato creato`,
            );
          }
          return {
            id: gidDi('Product', id),
            status: input.status,
            variants: varianti.map((v) => ({ id: gidDi('ProductVariant', v.id), sku: v.sku })),
          };
        },
      ),
      productByIdentity: vi.fn(
        async (_d: string, _t: string, identita: { readonly value: string }) => {
          this.conta('productByIdentity');
          const prodotto = this.prodottoPerIdentita(identita.value);
          return prodotto
            ? { id: gidDi('Product', prodotto.id), status: prodotto.status.toUpperCase() }
            : null;
        },
      ),
      /**
       * `productVariantsBulkCreate`: TUTTO-O-NIENTE (G6, nel caso provato) — una riga con
       * un'identità già presente rifiuta l'intera mutation e non crea nulla. Serve solo al
       * COMPLETAMENTO: nessuna strategia, le varianti presenti non si toccano.
       */
      bulkCreateVariants: vi.fn(
        async (
          _d: string,
          _t: string,
          productGid: string,
          righe: readonly {
            readonly optionValues: readonly {
              readonly optionName: string;
              readonly name: string;
            }[];
            readonly price?: string;
            readonly compareAtPrice?: string;
            readonly barcode?: string;
            readonly inventoryItem?: { readonly sku?: string };
            readonly metafields?: readonly { namespace: string; key: string; value: string }[];
          }[],
        ) => {
          this.conta('bulkCreateVariants');
          await this.varco('bulkCreateVariants');
          const prodotto = trova(productGid);
          for (const riga of righe) {
            const identita = identitaVariante(riga.metafields);
            if (identita && identitaVarianteOccupata(identita, null)) {
              throw new Error(
                `Shopify productVariantsBulkCreate: ${MESSAGGIO_IDENTITA_DOPPIA} (variant_id ${identita})`,
              );
            }
          }
          const nuove = righe.map((riga) => {
            const perOpzione = new Map(riga.optionValues.map((o) => [o.optionName, o.name]));
            const valori = prodotto.options.map((o) => perOpzione.get(o.name) ?? null);
            const variante: VarianteRemota = {
              id: this.nuovoId(),
              title: valori.filter((v): v is string => v !== null).join(' / ') || 'Default Title',
              sku: riga.inventoryItem?.sku ?? null,
              barcode: riga.barcode ?? null,
              price: riga.price ?? '0.00',
              compare_at_price: riga.compareAtPrice ?? null,
              inventory_item_id: this.nuovoId(),
              cost: null,
              option1: valori[0] ?? null,
              option2: valori[1] ?? null,
              option3: valori[2] ?? null,
              identita: identitaVariante(riga.metafields),
            };
            prodotto.variants.push(variante);
            return variante;
          });
          this.stoccaAZero(prodotto);
          const perse = this.rispostePerse.get('bulkCreateVariants') ?? 0;
          if (perse > 0) {
            this.rispostePerse.set('bulkCreateVariants', perse - 1);
            throw new ShopifyTrasportoException(
              'timeout',
              true,
              `Shopify simulato (${this.dominio}): risposta persa su productVariantsBulkCreate — le varianti SONO state create`,
            );
          }
          return nuove.map((v) => ({
            id: gidDi('ProductVariant', v.id),
            sku: v.sku,
            barcode: v.barcode,
            inventoryItemId: gidDi('InventoryItem', v.inventory_item_id),
            selectedOptions: prodotto.options
              .map((o, i) => ({ name: o.name, value: [v.option1, v.option2, v.option3][i] ?? '' }))
              .filter((o) => o.value !== ''),
          }));
        },
      ),
      listProductVariantsWithIdentity: vi.fn(async (_d: string, _t: string, productGid: string) => {
        this.conta('listProductVariantsWithIdentity');
        await this.varco('listProductVariantsWithIdentity');
        const prodotto = trova(productGid);
        return prodotto.variants.map((v) => ({
          id: gidDi('ProductVariant', v.id),
          sku: v.sku,
          barcode: v.barcode,
          inventoryItemId: gidDi('InventoryItem', v.inventory_item_id),
          selectedOptions: prodotto.options
            .map((o, i) => ({ name: o.name, value: [v.option1, v.option2, v.option3][i] ?? '' }))
            .filter((o) => o.value !== ''),
          title: v.title,
          price: v.price,
          identita: v.identita ?? null,
        }));
      }),
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
      // ⭐ Le due riletture dell'identità: le stesse del client GraphQL simulato, esposte
      //    dove il pull le chiede. Un guasto iniettato qui è una LETTURA FALLITA, che per
      //    contratto non vale «assente».
      identitaVestiflowDelProdotto: vi.fn(async (_d: string, _t: string, productGid: string) => {
        this.conta('identitaVestiflowDelProdotto');
        const prodotto = this.prodotti.get(idDaGid(productGid));
        return prodotto?.identita ?? null;
      }),
      variantiConIdentita: vi.fn(async (_d: string, _t: string, productGid: string) => {
        this.conta('variantiConIdentita');
        return this.graphql().listProductVariantsWithIdentity(_d, _t, productGid);
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
