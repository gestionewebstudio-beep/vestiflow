import { Injectable, Logger } from '@nestjs/common';
// `Prisma` serve come VALORE, non solo come tipo: compone la clausola del
// cursore, che c'è solo dai blocchi successivi al primo.
import { Prisma } from '@prisma/client';

import { variantLabel } from '../common/variant-label.util';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import type { ShopifyInventoryPushResult } from './shopify-inventory-push.service';

/**
 * Quante SCRITTURE al massimo per BLOCCO.
 *
 * ⭐ **Lo stesso motivo della coda del ritentativo**: l'Admin API è a quota, e un
 *    catalogo intero svuotato tutto insieme se la mangia.
 *
 * ⛔ **Non è più un limite dell'OPERAZIONE, e la differenza è tutta qui.** Prima
 *    fermava il comando e chiedeva un altro clic; ora chiude il blocco e basta:
 *    il pulsante chiede il blocco successivo da sé. Il tetto continua a
 *    proteggere la quota per richiesta, e ha smesso di essere un limite di ciò
 *    che una pressione può controllare — **senza alzarne il numero**.
 */
const ALIGN_WRITE_LIMIT = 50;

/**
 * Quante coppie si ESAMINANO al massimo per blocco.
 *
 * ⭐ **È la misura del blocco, non un tetto**: tiene corta ogni richiesta, così
 *    nessuna rischia di scadere, e il giro completo si fa con più richieste
 *    invece che con una lunga.
 */
const ALIGN_SCAN_LIMIT = 200;

/** Perché una coppia NON risulta allineata. Ogni voce ha un nome suo. */
export type MotivoNonAllineata =
  | 'livello_non_disponibile'
  | 'collegamento_escluso'
  | 'base_non_stabilita'
  | 'richiesta_rifiutata'
  | 'divergenza_accertata'
  | 'errore_di_lettura'
  | 'scrittura_esito_incerto'
  | 'negozio_non_connesso'
  | 'permesso_mancante'
  | 'sincronizzazione_spenta'
  | 'variante_non_collegata'
  | 'sede_non_collegata'
  | 'stato_cambiato'
  | 'rinvio_attivo';

/**
 * La frase che l'operatore legge accanto alla riga.
 *
 * ⛔ **«Livello non disponibile» e «errore di lettura» sono due voci diverse, e
 *    devono restarlo.** La prima è un'ASSENZA constatata — non c'è un livello da
 *    allineare; la seconda è un esito IGNOTO. Fuse in una sola, chi legge non
 *    saprebbe se il canale ha detto «non ce l'ho» o non ha detto niente, e sono
 *    due rimedi diversi.
 *
 * ⛔ **E «errore di lettura» non è «scrittura con esito incerto».** Nel primo
 *    caso non è partito niente e ripetere è innocuo; nel secondo una scrittura
 *    può essere andata a segno, e riprovarla di iniziativa è il doppio effetto
 *    che la chiave di idempotenza esiste per impedire.
 *
 * ⚠️ **E non si dice di quale LATO manchi il livello.** Il motivo è uno solo e
 *    dice quello che si sa: inventare un lato sarebbe una frase precisa e non
 *    verificata.
 */
const DETTAGLIO: Record<MotivoNonAllineata, string> = {
  livello_non_disponibile:
    'Livello non disponibile, coppia non allineata. Nessuna quantità è stata scritta ' +
    'e nessuna è stata dedotta: non è una divergenza delle quantità.',
  collegamento_escluso:
    'Lo storico dei collegamenti vieta di usare questo identificativo Shopify per questa variante.',
  base_non_stabilita:
    'La partenza controllata non è ancora avvenuta su questa coppia: non c’è un valore confermato da cui partire.',
  richiesta_rifiutata:
    'Il canale ha rifiutato la richiesta, e non per le quantità: va verificato il collegamento.',
  divergenza_accertata:
    'Il canale ha rifiutato la scrittura perché porta una quantità diversa da quella attesa. Serve una decisione.',
  errore_di_lettura:
    'Il canale non ha risposto alla lettura: nessuna scrittura è stata tentata, e la ' +
    'coppia resta com’era.',
  scrittura_esito_incerto:
    'Una scrittura è stata tentata e non si sa se abbia avuto effetto: il tentativo resta ' +
    'aperto e verrà ripreso con la stessa chiave, mai con una nuova.',
  negozio_non_connesso: 'Il negozio Shopify non risulta connesso.',
  permesso_mancante: 'Manca il permesso di scrittura sull’inventario Shopify.',
  sincronizzazione_spenta: 'La sincronizzazione è spenta per questo articolo.',
  variante_non_collegata: 'La variante non è collegata a Shopify.',
  sede_non_collegata: 'La sede non è mappata su una sede Shopify.',
  stato_cambiato:
    'La coppia si è mossa sotto la lettura per più giri: nessuna scrittura è partita.',
  rinvio_attivo: 'Il recupero è rinviato: ci sono ordini aperti sul canale.',
};

/** Come si legge un esito del push che non è né allineato né già allineato. */
const MOTIVO_PER_ESITO: Record<string, MotivoNonAllineata> = {
  not_connected: 'negozio_non_connesso',
  missing_write_inventory_scope: 'permesso_mancante',
  sync_disabled: 'sincronizzazione_spenta',
  variant_not_linked: 'variante_non_collegata',
  location_not_linked: 'sede_non_collegata',
  collegamento_escluso: 'collegamento_escluso',
  base_assente: 'base_non_stabilita',
  richiesta_rifiutata: 'richiesta_rifiutata',
  divergenza_accertata: 'divergenza_accertata',
  level_not_found: 'livello_non_disponibile',
  // ⛔ Questi DUE arrivano solo dopo che una scrittura è stata prenotata: il
  //    tentativo resta aperto, e ripeterlo è mestiere della chiave, non nostro.
  tentativo_in_corso: 'scrittura_esito_incerto',
  tentativo_incerto: 'scrittura_esito_incerto',
  stato_cambiato: 'stato_cambiato',
  rinvio_attivo: 'rinvio_attivo',
};

/** Gli esiti che hanno consumato una scrittura, riuscita o rifiutata che sia. */
const HA_SCRITTO = new Set(['shopify_error', 'richiesta_rifiutata', 'divergenza_accertata']);

/** Una coppia che il controllo NON ha potuto allineare, con il suo perché. */
export interface CoppiaNonAllineata {
  readonly variantId: string;
  readonly locationId: string;
  readonly articolo: string;
  readonly codiceArticolo: string | null;
  readonly variante: string;
  readonly sku: string | null;
  readonly sede: string;
  readonly motivo: MotivoNonAllineata;
  readonly dettaglio: string;
}

/**
 * Dove il blocco si è fermato: si ripassa per avere il blocco successivo.
 *
 * ⭐ **È una POSIZIONE, non l'identità di un'operazione.** Non conserva niente
 *    fra una pressione e l'altra: un clic nuovo riparte senza cursore, cioè con
 *    un controllo nuovo e completo.
 */
export interface PosizioneAllineamento {
  readonly locationId: string;
  readonly variantId: string;
}

/** Il risultato di UN blocco. Il pulsante li incatena fino a `fine`. */
export interface BloccoAllineamento {
  /** Quante coppie il comando considera in tutto: serve all'avanzamento. */
  readonly totale: number;
  readonly esaminate: number;
  readonly allineate: number;
  readonly giaAllineate: number;
  /**
   * Le coppie non allineate di QUESTO blocco, con articolo, variante, sede e
   * motivo.
   *
   * ⭐ **Nessuna anomalia si perde**, e non serve un tetto: ogni coppia è
   *    esaminata una volta sola in tutto il giro, quindi chi incatena i blocchi
   *    ottiene l'elenco completo — e ogni singola risposta resta piccola.
   */
  readonly nonAllineate: readonly CoppiaNonAllineata[];
  /** Da dove riprendere. `null` quando il perimetro è finito. */
  readonly prossimo: PosizioneAllineamento | null;
  /** ⭐ Vero SOLO quando il perimetro è stato attraversato tutto. */
  readonly fine: boolean;
}

/** Una coppia da esaminare, con ciò che serve a nominarla nell'elenco. */
interface CoppiaDaAllineare {
  readonly variantId: string;
  readonly locationId: string;
  readonly sede: string;
  readonly articolo: string;
  readonly codiceArticolo: string | null;
  readonly sku: string | null;
  readonly optionValues: unknown;
}

/**
 * IL RIALLINEAMENTO DELLE DISPONIBILITÀ — VestiFlow → Shopify.
 *
 * ⭐ **È il «tasto Allinea» di §31.-1**: una pressione avvia un controllo
 *    COMPLETO del perimetro, lavorato a blocchi. Il suo primo uso è la
 *    **partenza controllata**: una coppia senza base la riceve qui. ⛔ Nessun
 *    altro percorso la stabilisce — in particolare non il primo push ordinario.
 *
 * ⛔ **Un blocco NON è un'operazione.** Il comando non conserva niente fra una
 *    pressione e l'altra: nessuna coda, nessun registro di avanzamento, nessuna
 *    colonna di stato. Chi preme incatena i blocchi seguendo `prossimo`, e
 *    quando la catena si interrompe **non c'è niente da dichiarare concluso** —
 *    il clic dopo riparte da capo.
 *
 * ⛔ **Non sostituisce il recupero automatico.** Gli invii pendenti, i tentativi
 *    incerti e gli ordini mancanti restano mestiere della coda del ritentativo e
 *    della sincronizzazione continua: questo è il gesto manuale, non il loro
 *    rimpiazzo.
 *
 * ⛔ **Tocca SOLO le quantità.** La preparazione del catalogo — import da
 *    Shopify o pubblicazione verso Shopify — è un'operazione distinta e
 *    preesistente: le coppie non ancora collegate escono da qui nell'elenco
 *    delle non allineate, col loro motivo.
 *
 * ⛔ **Non acquisisce ordini, e non deve** (§31.-1). Gli ordini arrivano per la
 *    loro strada: Allinea corregge le disponibilità.
 *
 * ⭐ **Riprendere non duplica gli effetti**: una coppia già allineata porta il
 *    canale sullo stesso valore, quindi esce come «già allineata» senza
 *    scrivere. L'idempotenza è per riga, non per esecuzione.
 */
@Injectable()
export class ShopifyInventoryAlignService {
  private readonly logger = new Logger(ShopifyInventoryAlignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryPush: ShopifyInventoryPushService,
  ) {}

  /**
   * Allinea UN BLOCCO del perimetro, su tutte le sedi collegate.
   *
   * ⭐ **Una selezione sola su TUTTE le sedi**, in ordine stabile: il blocco
   *    successivo riprende esattamente dove questo si è fermato.
   *
   * ⛔ **L'ordine NON è più `last_attempt_at`, e non può esserlo**: il giro
   *    stesso lo riscrive mentre avanza, quindi rimescolerebbe le pagine e
   *    qualche coppia verrebbe saltata o rivista. Con `(sede, variante)` — che è
   *    unico per riga — la copertura è completa **per costruzione**, e ogni
   *    coppia è toccata **una volta sola**: è anche il modo in cui le anomalie
   *    non vengono ritentate all'infinito dentro la stessa operazione.
   *
   * ⚠️ `last_attempt_at` si continua a SCRIVERE: serve alla rotazione della coda
   *    del ritentativo, che non è questo comando e non cambia.
   */
  async allinea(tenantId: string, da?: PosizioneAllineamento): Promise<BloccoAllineamento> {
    const coppie = await this.coppieDaAllineare(tenantId, da, ALIGN_SCAN_LIMIT);

    let scritture = 0;
    let esaminate = 0;
    let allineate = 0;
    let giaAllineate = 0;
    let ultima: PosizioneAllineamento | null = null;
    const nonAllineate: CoppiaNonAllineata[] = [];

    for (const coppia of coppie) {
      if (scritture >= ALIGN_WRITE_LIMIT) {
        break;
      }
      esaminate += 1;
      ultima = { locationId: coppia.locationId, variantId: coppia.variantId };
      await this.segnaEsaminata(tenantId, coppia.variantId, coppia.locationId);

      let esito: ShopifyInventoryPushResult;
      try {
        esito = await this.inventoryPush.riallineaCoppia(
          tenantId,
          coppia.variantId,
          coppia.locationId,
        );
      } catch (error: unknown) {
        // ⭐ Un guasto su una coppia non ferma le altre: sono indipendenti, e
        //    l'esito ignoto è una voce dell'elenco come le altre.
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        // ⛔ **Anche qui la domanda è se una scrittura fosse PRENOTATA**: un
        //    guasto prima della lettura e uno dopo la prenotazione non si
        //    rimediano allo stesso modo.
        nonAllineate.push(
          this.voce(coppia, await this.letturaOScritturaIncerta(tenantId, coppia)),
        );
        scritture += 1;
        this.logger.warn(
          `Allineamento non riuscito (${tenantId}) variante ${coppia.variantId} @ ` +
            `${coppia.locationId}: ${message}`,
        );
        continue;
      }

      if (esito.pushed) {
        allineate += 1;
        scritture += 1;
      } else if (esito.reason === 'unchanged') {
        giaAllineate += 1;
      } else {
        nonAllineate.push(this.voce(coppia, await this.motivoDi(tenantId, coppia, esito.reason)));
        if (esito.reason !== undefined && HA_SCRITTO.has(esito.reason)) {
          scritture += 1;
        }
      }
    }

    // ⭐ **Il perimetro è finito solo se il blocco è stato consumato TUTTO e la
    //    selezione ne aveva meno del tetto**: se ne aveva esattamente quanti il
    //    tetto, ce ne possono essere altri, e si chiede un blocco in più che
    //    tornerà vuoto. Una richiesta di troppo, mai una coppia di meno.
    const bloccoConsumato = esaminate === coppie.length;
    const perimetroFinito = bloccoConsumato && coppie.length < ALIGN_SCAN_LIMIT;
    const prossimo = perimetroFinito ? null : (ultima ?? (da ?? null));

    const totale = await this.contaPerimetro(tenantId);
    const blocco: BloccoAllineamento = {
      totale,
      esaminate,
      allineate,
      giaAllineate,
      nonAllineate,
      prossimo,
      fine: prossimo === null,
    };

    this.logger.log(
      `Allineamento disponibilità (${tenantId}): blocco di ${esaminate} coppie su ${totale} — ` +
        `${allineate} allineate, ${giaAllineate} già allineate, ${nonAllineate.length} non allineate` +
        (blocco.fine ? ' — perimetro completato' : ' — il controllo prosegue col blocco successivo'),
    );
    return blocco;
  }

  /** La riga dell'elenco, con il nome delle cose e la frase che la spiega. */
  private voce(coppia: CoppiaDaAllineare, motivo: MotivoNonAllineata): CoppiaNonAllineata {
    return {
      variantId: coppia.variantId,
      locationId: coppia.locationId,
      articolo: coppia.articolo,
      codiceArticolo: coppia.codiceArticolo,
      variante: variantLabel(coppia.optionValues),
      sku: coppia.sku,
      sede: coppia.sede,
      motivo,
      dettaglio: DETTAGLIO[motivo],
    };
  }

  /**
   * Che cosa scrivere nell'elenco, dato l'esito del push.
   *
   * ⛔ **Su `level_not_found` non si indaga di quale lato manchi il livello.**
   *    Il motivo è uno solo — «livello non disponibile» — e dice quello che si sa
   *    davvero. Inventare un lato sarebbe una frase precisa e non verificata.
   *
   * ⛔ **`shopify_error` invece copre DUE esiti opposti**, e confonderli è
   *    pericoloso: se non è partita nessuna scrittura, ripetere è innocuo; se una
   *    scrittura è stata prenotata, può essere andata a segno. La differenza non
   *    si deduce: **si legge**, ed è un fatto già scritto sulla riga — un
   *    tentativo aperto (`pendingKey`) significa che una scrittura era prenotata.
   */
  private async motivoDi(
    tenantId: string,
    coppia: CoppiaDaAllineare,
    reason: string | undefined,
  ): Promise<MotivoNonAllineata> {
    const noto = reason ? MOTIVO_PER_ESITO[reason] : undefined;
    if (noto) {
      return noto;
    }
    return this.letturaOScritturaIncerta(tenantId, coppia);
  }

  /**
   * Errore di LETTURA, o scrittura con esito INCERTO? Lo dice la riga.
   *
   * ⭐ **Un tentativo aperto è una scrittura PRENOTATA**: la chiave, il valore e
   *    la destinazione sono sulla riga, e il canale può averla applicata. Senza
   *    tentativo aperto non è partito niente.
   *
   * ⚠️ Si legge **solo** su questo ramo, che è raro: una lettura indicizzata per
   *    coppia guasta, non per coppia esaminata.
   */
  private async letturaOScritturaIncerta(
    tenantId: string,
    coppia: CoppiaDaAllineare,
  ): Promise<MotivoNonAllineata> {
    const riga = await this.prisma.shopifyInventorySyncState.findUnique({
      where: {
        tenantId_variantId_locationId: {
          tenantId,
          variantId: coppia.variantId,
          locationId: coppia.locationId,
        },
      },
      select: { pendingKey: true },
    });
    return riga?.pendingKey ? 'scrittura_esito_incerto' : 'errore_di_lettura';
  }

  /**
   * Il blocco successivo di coppie, su TUTTE le sedi collegate.
   *
   * ⭐ **Ordine stabile e totale** — `(sede, variante)` è unico per riga — e
   *    cursore per chiave, non per scostamento: niente salta e niente si ripete
   *    nemmeno se nel frattempo qualcosa entra o esce dal perimetro.
   */
  private async coppieDaAllineare(
    tenantId: string,
    da: PosizioneAllineamento | undefined,
    tetto: number,
  ): Promise<CoppiaDaAllineare[]> {
    const dopo = da
      ? Prisma.sql`AND (l.location_id, l.variant_id) > (${da.locationId}::uuid, ${da.variantId}::uuid)`
      : Prisma.empty;
    return this.prisma.$queryRaw<CoppiaDaAllineare[]>`
      SELECT l.variant_id AS "variantId",
             l.location_id AS "locationId",
             loc.name AS "sede",
             p.name AS "articolo",
             p.article_code AS "codiceArticolo",
             v.sku AS "sku",
             v.option_values AS "optionValues"
        FROM inventory_levels l
        JOIN product_variants v ON v.id = l.variant_id
        JOIN products p ON p.id = v.product_id
        JOIN locations loc ON loc.id = l.location_id
       WHERE l.tenant_id = ${tenantId}::uuid
         AND loc.shopify_location_id IS NOT NULL
         AND v.shopify_variant_id IS NOT NULL
         AND p.shopify_sync_enabled = TRUE
         ${dopo}
       ORDER BY l.location_id ASC, l.variant_id ASC
       LIMIT ${tetto}`;
  }

  /**
   * Segna che questa coppia è stata ESAMINATA adesso.
   *
   * ⛔ **Non serve ad Allinea, e si scrive lo stesso**: serve alla rotazione
   *    della **coda del ritentativo**, che ordina per questa colonna. Toglierla
   *    qui lascerebbe le righe toccate da Allinea in testa a quella coda.
   *
   * ⚠️ **Un `upsert`, perché la riga può non esistere ancora.**
   */
  private async segnaEsaminata(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<void> {
    await this.prisma.shopifyInventorySyncState.upsert({
      where: { tenantId_variantId_locationId: { tenantId, variantId, locationId } },
      create: { tenantId, variantId, locationId, lastAttemptAt: new Date() },
      update: { lastAttemptAt: new Date() },
    });
  }

  /** Quante coppie il comando considera, in tutto: è il denominatore. */
  private contaPerimetro(tenantId: string): Promise<number> {
    return this.prisma.inventoryLevel.count({
      where: {
        tenantId,
        location: { shopifyLocationId: { not: null } },
        variant: {
          shopifyVariantId: { not: null },
          product: { shopifySyncEnabled: true },
        },
      },
    });
  }
}
