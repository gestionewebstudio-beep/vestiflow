import { BadRequestException, Injectable, Logger } from '@nestjs/common';
// `Prisma` serve come VALORE, non solo come tipo: compone l'elenco delle
// coppie toccate dentro una sola COUNT, invece di contarle a parte e poi
// sommarle a insiemi che si sovrappongono.
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import type { ShopifyInventoryPushResult } from './shopify-inventory-push.service';

/**
 * Quante SCRITTURE al massimo per passata.
 *
 * ⭐ **Lo stesso motivo della coda del ritentativo**: l'Admin API è a quota, e un
 *    catalogo intero svuotato tutto insieme se la mangia. Il resto si riprende
 *    alla passata dopo, e **quante restano viene DETTO** — un tetto silenzioso
 *    si legge come «ho finito», che è la conclusione sbagliata.
 */
const ALIGN_WRITE_LIMIT = 50;

/**
 * Quante coppie si ESAMINANO al massimo per passata.
 *
 * ⛔ **Non è un secondo tetto per prudenza: è il rimedio a un blocco misurato.**
 *    Con un tetto solo, le coppie GIÀ allineate lo consumavano come quelle da
 *    scrivere: con settanta coppie su una sede e cinquanta di tetto, la passata
 *    dopo ne trovava venti da fare e trenta già a posto, riempiva il tetto e
 *    **non passava mai alla sede successiva**.
 *
 * ⭐ **Il tetto che protegge la quota è quello delle SCRITTURE**: una coppia già
 *    allineata costa una lettura, non una scrittura, e non deve comprare il
 *    diritto di fermare la passata.
 */
const ALIGN_SCAN_LIMIT = 200;

/** L'esito per una sede, distinguibile dalle altre. */
export interface EsitoSedeAllineamento {
  readonly locationId: string;
  readonly locationName: string;
  /** Coppie a cui il valore di VestiFlow è stato scritto sul canale. */
  readonly allineate: number;
  /** Coppie che portavano già quel valore: nessuna scrittura, nessuna quota. */
  readonly giaAllineate: number;
  /**
   * Coppie che NON si possono allineare in sicurezza, e non è un guasto:
   * variante non collegata, sincronizzazione spenta, collegamento escluso,
   * sede non mappata, tentativo aperto con esito ignoto.
   *
   * ⛔ **Non sono «allineate»**, e non devono contarsi come tali.
   */
  readonly escluse: number;
  /** Coppie su cui il canale ha rifiutato o la chiamata è fallita. */
  readonly fallite: number;
}

export interface EsitoAllineamento {
  /** Coppie che il comando considera nel proprio perimetro. */
  readonly totale: number;
  readonly allineate: number;
  readonly giaAllineate: number;
  readonly escluse: number;
  readonly fallite: number;
  /**
   * Il LAVORO RESIDUO dell'OPERAZIONE: coppie che non risultano a posto.
   *
   * ⭐ **Comprende ciò che è FALLITO o ESCLUSO**, non solo ciò che non è mai
   *    partito: una coppia già pronta che fallisce — o che non si può toccare —
   *    va ripresa.
   *
   * ⛔ **E si legge dallo STATO DELLE RIGHE, non dall'elenco di questa
   *    passata.** Qui c'era `senzaBase + le fallite di adesso`, e una coppia
   *    già inizializzata che falliva **spariva dal residuo alla passata
   *    dopo**: l'elenco si ricostruisce a ogni chiamata, e alla seconda passata
   *    la rotazione guarda altre coppie. Il numero tornava a zero mentre quella
   *    coppia era ancora da correggere.
   *
   * ⭐ **Le colonne che lo dicono ESISTONO GIÀ**, e non ne servono di nuove:
   *    `mismatch_detected` (il canale ha rifiutato), `local_push_pending`
   *    (lavoro non trasmesso), `pending_key` (tentativo aperto, esito ignoto),
   *    `local_pending_delta` diverso da zero (scostamento ancora da mandare) e
   *    l'assenza di base. Più le coppie che QUESTA passata ha lasciato indietro
   *    senza lasciare traccia sulla riga — le escluse per struttura.
   *
   * ⛔ **Non somma `nonEsaminate`, e prima lo faceva.** Gli insiemi si
   *    sovrappongono: 120 coppie senza base di cui 50 allineate lasciano 70 che
   *    sono **le stesse** sia come non pronte sia come non esaminate — e il
   *    numero diceva 140. Qui si contano coppie DISTINTE.
   *
   * ⭐ **Converge**: ripremendo scende, e a zero non c'è più lavoro noto.
   */
  readonly restano: number;
  /**
   * Quante coppie NON sono ancora PRONTE per la sincronizzazione continua.
   *
   * ⭐ **«Pronta» vuol dire due cose insieme**: i contatori esistono *e* c'è un
   *    ultimo valore confermato. I contatori nascono alla presa, il confermato
   *    solo alla conferma: guardare un solo criterio dava per buona una coppia
   *    che non ha mai pubblicato niente.
   *
   * ⚠️ **È un numero diverso da `restano`**, e vanno letti insieme: a partenza
   *    finita questo va a zero e ci resta, mentre `restano` risale ogni volta
   *    che un allineamento fallisce.
   */
  readonly senzaBase: number;
  /**
   * Quante coppie NON sono ancora state VERIFICATE in questa OPERAZIONE.
   *
   * ⛔ **Senza questo numero il residuo poteva dire ZERO mentre il lavoro
   *    c'era**: con trecento coppie già inizializzate e un tetto di scansione a
   *    duecento, le prime duecento risultano «già allineate», nessuna fallisce,
   *    e le altre cento non sono state nemmeno lette.
   *
   * ⛔ **Ma NON è «non esaminate in questa passata», e la differenza è che
   *    quello non convergeva**: ogni passata ne guarda duecento diverse e ne
   *    lascia fuori cento, quindi il numero restava cento per sempre — anche
   *    dopo averle controllate tutte.
   *
   * ⛔ **E nemmeno «mai esaminate» basta**, che è quello che c'era: al SECONDO
   *    uso di Allinea ogni riga porta già un `last_attempt_at`, quindi il numero
   *    nasce a **zero** — e con `restano` a zero il chiamante si ferma senza aver
   *    guardato le cento che il tetto ha lasciato fuori. «Già vista una volta,
   *    mesi fa» non è «verificata adesso».
   *
   * ⭐ **Il metro è `operazioneIniziataAlle`**: una coppia è verificata se la
   *    rotazione l'ha toccata DOPO l'inizio dell'operazione. Scende a ogni
   *    passata e arriva a zero quando la rotazione ha fatto il giro completo.
   *
   * ⚠️ **Va letto INSIEME a `restano`**, e i due non si sommano: dicono cose
   *    diverse — «non l'ho ancora guardata» e «so che non è a posto».
   *    L'operazione è finita quando sono **entrambi** a zero.
   */
  readonly nonEsaminate: number;
  /**
   * L'istante che identifica l'OPERAZIONE: si RIPASSA alla chiamata dopo.
   *
   * ⭐ **È tutto ciò che serve a distinguere «guardata» da «guardata ADESSO»**,
   *    e riusa la colonna che già fa ruotare la coda (`last_attempt_at`):
   *    nessuna coda nuova, nessuna colonna nuova, nessun registro di avanzamento.
   *
   * ⚠️ **Chi non lo ripassa comincia un'operazione NUOVA**, ed è il
   *    comportamento giusto per la prima pressione del pulsante.
   */
  readonly operazioneIniziataAlle: Date;
  /**
   * ⭐ Se resta lavoro da GUARDARE, o un tetto ha fermato la passata.
   *
   * ⛔ **Non è più «il tetto di scansione è stato riempito»**: con un perimetro
   *    più grande del tetto quella condizione era vera **per sempre**, e un
   *    chiamante che ci si fermasse non si sarebbe fermato mai.
   */
  readonly interrotto: boolean;
  readonly perSede: readonly EsitoSedeAllineamento[];
}

/**
 * Legge l'istante di ripresa che il chiamante ripassa, o `undefined`.
 *
 * ⭐ **È il solo modo per proseguire un'operazione già cominciata**: senza,
 *    ogni pressione del pulsante è una partenza da capo, e il conto delle
 *    coppie non ancora verificate riparte da tutto il perimetro.
 *
 * ⛔ **Un valore illeggibile si RIFIUTA, non si ignora.** Ignorandolo si
 *    comincerebbe un'operazione nuova senza dirlo, e il chiamante crederebbe
 *    di star proseguendo la propria: è il silenzio che questo lavoro combatte.
 */
export function istanteRipresa(valore: unknown): Date | undefined {
  if (valore === undefined || valore === null || valore === '') {
    return undefined;
  }
  const letto = typeof valore === 'string' ? new Date(valore) : new Date(Number.NaN);
  if (Number.isNaN(letto.getTime())) {
    throw new BadRequestException(
      "operazioneIniziataAlle non è un istante leggibile: si ripassa quello dell'esito precedente.",
    );
  }
  return letto;
}

/** Una coppia da esaminare, con ciò che serve a classificarla. */
interface CoppiaDaAllineare {
  readonly variantId: string;
  readonly locationId: string;
  readonly locationName: string;
  /** ⭐ PRONTA = contatori **e** ultimo confermato. Un solo criterio non basta. */
  readonly pronta: boolean;
}

/**
 * IL RIALLINEAMENTO DELLE DISPONIBILITÀ — VestiFlow → Shopify.
 *
 * ⭐ **È il «tasto Allinea» di §31.-1**, e il suo primo uso è la **partenza
 *    controllata**: una coppia senza base la riceve qui. ⛔ Nessun altro
 *    percorso la stabilisce — in particolare non il primo push ordinario.
 *
 * ⛔ **Tocca SOLO le quantità.** La preparazione del catalogo — import da
 *    Shopify o pubblicazione verso Shopify — è un'operazione distinta e
 *    preesistente: le coppie non ancora collegate escono da qui come
 *    **escluse**, non come allineate.
 *
 * ⛔ **Non acquisisce ordini, e non deve** (§31.-1). Gli ordini arrivano per la
 *    loro strada: Allinea corregge le disponibilità.
 *
 * ⭐ **L'avanzamento non ha un registro suo: è lo stato delle righe.** Una
 *    coppia già allineata porta il canale sullo stesso valore, quindi alla
 *    passata dopo esce come «già allineata» senza scrivere. Ne discende che
 *    **riprendere non duplica gli effetti** — l'idempotenza è per riga, non per
 *    esecuzione.
 */
@Injectable()
export class ShopifyInventoryAlignService {
  private readonly logger = new Logger(ShopifyInventoryAlignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryPush: ShopifyInventoryPushService,
  ) {}

  /**
   * Allinea le disponibilità dell'azienda corrente su tutte le sue sedi
   * collegate.
   *
   * ⭐ **Una chiamata sola, e una selezione sola su TUTTE le sedi.**
   *
   * ⛔ **Qui c'era un ciclo per sede con la capienza spartita in ordine**, e la
   *    rotazione valeva solo *dentro* una sede: con duecentocinque coppie sulla
   *    prima, ogni passata riempiva il tetto di scansione lì e si interrompeva —
   *    la seconda sede non veniva raggiunta **mai**. Con una selezione unica
   *    l'ordinamento decide fra tutte le coppie del tenant, e la rotazione
   *    attraversa le sedi come attraversa le righe.
   */
  async allinea(tenantId: string, operazioneIniziataAlle?: Date): Promise<EsitoAllineamento> {
    // ⭐ **L'istante dell'OPERAZIONE, che dura più di una passata.** Chi lo
    //    ripassa prosegue la stessa operazione; chi non lo passa ne comincia
    //    una nuova — la prima pressione del pulsante.
    //
    // ⚠️ **Un istante nel FUTURO si riporta ad adesso**, e non è pedanteria:
    //    con un istante avanti nessuna riga risulterebbe mai verificata, il
    //    residuo non scenderebbe e il chiamante girerebbe per sempre.
    const adesso = new Date();
    const dalle =
      operazioneIniziataAlle && operazioneIniziataAlle < adesso ? operazioneIniziataAlle : adesso;
    const coppie = await this.coppieDaAllineare(tenantId, ALIGN_SCAN_LIMIT);

    const perSede = new Map<string, { nome: string; e: EsitoSedeAllineamento }>();
    const registra = (
      coppia: CoppiaDaAllineare,
      campo: keyof Pick<
        EsitoSedeAllineamento,
        'allineate' | 'giaAllineate' | 'escluse' | 'fallite'
      >,
    ) => {
      const voce = perSede.get(coppia.locationId) ?? {
        nome: coppia.locationName,
        e: {
          locationId: coppia.locationId,
          locationName: coppia.locationName,
          allineate: 0,
          giaAllineate: 0,
          escluse: 0,
          fallite: 0,
        },
      };
      perSede.set(coppia.locationId, {
        nome: voce.nome,
        e: { ...voce.e, [campo]: voce.e[campo] + 1 },
      });
    };

    let scritture = 0;
    let esaminate = 0;
    /**
     * Le coppie che questa passata NON ha portato a termine: fallite o escluse.
     *
     * ⛔ **Si raccolgono per identità e si ricontano DOPO**, sullo stato che la
     *    passata ha lasciato: una coppia può entrare non pronta e uscirne
     *    pronta — è il caso del rifiuto con un movimento nella finestra, che
     *    lascia `L` valorizzato e il vecchio `P` al suo posto. Contandola
     *    all'ingresso sarebbe sfuggita a entrambi i numeri, e il residuo
     *    avrebbe detto zero mentre l'allineamento era fallito.
     */
    const daRiprendere: { variantId: string; locationId: string }[] = [];

    for (const coppia of coppie) {
      if (scritture >= ALIGN_WRITE_LIMIT) {
        break;
      }
      esaminate += 1;
      await this.segnaEsaminata(tenantId, coppia.variantId, coppia.locationId);

      let esito: ShopifyInventoryPushResult;
      try {
        esito = await this.inventoryPush.riallineaCoppia(
          tenantId,
          coppia.variantId,
          coppia.locationId,
        );
      } catch (error: unknown) {
        // Un guasto su una coppia non ferma le altre: sono indipendenti.
        registra(coppia, 'fallite');
        scritture += 1;
        daRiprendere.push({ variantId: coppia.variantId, locationId: coppia.locationId });
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        this.logger.warn(
          `Allineamento non riuscito (${tenantId}) variante ${coppia.variantId} @ ` +
            `${coppia.locationId}: ${message}`,
        );
        continue;
      }

      if (esito.pushed) {
        registra(coppia, 'allineate');
        scritture += 1;
      } else if (esito.reason === 'unchanged') {
        registra(coppia, 'giaAllineate');
      } else if (
        esito.reason === 'shopify_error' ||
        esito.reason === 'richiesta_rifiutata' ||
        esito.reason === 'divergenza_accertata'
      ) {
        registra(coppia, 'fallite');
        scritture += 1;
        daRiprendere.push({ variantId: coppia.variantId, locationId: coppia.locationId });
      } else {
        // ⛔ **Tutto il resto è ESCLUSO, non allineato**: non collegata,
        //    sincronizzazione spenta, sede non mappata, collegamento escluso,
        //    tentativo aperto con esito ignoto, livello sparito.
        registra(coppia, 'escluse');
        // ⛔ **E se era già pronta, resta lavoro**: qui c'era il buco per cui
        //    una coppia esclusa spariva dal residuo.
        daRiprendere.push({ variantId: coppia.variantId, locationId: coppia.locationId });
      }
    }

    const totale = await this.contaPerimetro(tenantId);
    const senzaBase = await this.contaNonPronte(tenantId);
    // ⭐ **Il residuo si conta sullo STATO, in una query sola.** Le coppie che
    //    questa passata ha lasciato indietro entrano nella stessa COUNT: così
    //    una coppia insieme senza base e fallita vale UNO, e quella che ha
    //    fallito una passata fa non sparisce perché stavolta non l'abbiamo
    //    guardata — la sua riga lo dice ancora.
    const restano = await this.contaNonAPosto(tenantId, daRiprendere);
    // ⭐ **E ciò che questa OPERAZIONE non ha ancora verificato**: non «si è
    //    mai guardato», che al secondo uso di Allinea nasce a zero.
    const nonEsaminate = await this.contaNonVerificate(tenantId, dalle);
    const voci = [...perSede.values()].map((v) => v.e);
    const somma = (scegli: (s: EsitoSedeAllineamento) => number) =>
      voci.reduce((acc, s) => acc + scegli(s), 0);

    const esito: EsitoAllineamento = {
      totale,
      allineate: somma((s) => s.allineate),
      giaAllineate: somma((s) => s.giaAllineate),
      escluse: somma((s) => s.escluse),
      fallite: somma((s) => s.fallite),
      // ⛔ **Non si somma `nonEsaminate`**: gli insiemi si sovrappongono, e una
      //    coppia insieme non pronta e non esaminata veniva contata due volte.
      //    I due numeri si leggono accanto, non addizionati.
      restano,
      senzaBase,
      nonEsaminate,
      operazioneIniziataAlle: dalle,
      // ⛔ **Non è più «ho riempito il tetto»**: con trecento coppie e un tetto
      //    di duecento quella condizione restava vera a ogni passata, per
      //    sempre. Adesso dice quello che il chiamante deve sapere: **resta
      //    qualcosa da guardare**, e a giro completo si spegne.
      interrotto: scritture >= ALIGN_WRITE_LIMIT || nonEsaminate > 0,
      perSede: voci,
    };

    this.logger.log(
      `Allineamento disponibilità (${tenantId}): ${esito.allineate} allineate, ` +
        `${esito.giaAllineate} già allineate, ${esito.escluse} escluse, ${esito.fallite} fallite ` +
        `su ${esito.totale} coppie (${esaminate} esaminate); ${esito.restano} da riprendere ` +
        `(${esito.senzaBase} non ancora pronte, ${esito.nonEsaminate} non verificate ` +
        `in questa operazione)` +
        (esito.interrotto
          ? " — operazione NON conclusa: ripremere ripassando l'istante di inizio"
          : ''),
    );
    return esito;
  }

  /**
   * Le coppie da esaminare, su TUTTE le sedi collegate, in ordine di priorità.
   *
   * ```text
   *    1  chi NON e' ancora PRONTA va per prima      la partenza avanza
   *    2  poi la meno recentemente ESAMINATA         l uso ricorrente ruota
   * ```
   *
   * ⚠️ È la stessa rotazione del ritentativo (`last_attempt_at`, scritto PRIMA
   *    di tentare): un meccanismo già collaudato, non uno nuovo.
   *
   * ⛔ **PRONTA vuol dire contatori E ultimo confermato**, e deve essere lo
   *    stesso criterio del conteggio: con due criteri diversi una coppia poteva
   *    risultare «con base» qui e «senza base» là, e finire contata due volte.
   */
  private async coppieDaAllineare(tenantId: string, tetto: number): Promise<CoppiaDaAllineare[]> {
    return this.prisma.$queryRaw<CoppiaDaAllineare[]>`
      SELECT l.variant_id AS "variantId",
             l.location_id AS "locationId",
             loc.name AS "locationName",
             (s.local_pending_delta IS NOT NULL AND s.last_pushed_available IS NOT NULL)
               AS "pronta"
        FROM inventory_levels l
        JOIN product_variants v ON v.id = l.variant_id
        JOIN products p ON p.id = v.product_id
        JOIN locations loc ON loc.id = l.location_id
        LEFT JOIN shopify_inventory_sync_states s
               ON s.tenant_id = l.tenant_id
              AND s.variant_id = l.variant_id
              AND s.location_id = l.location_id
       WHERE l.tenant_id = ${tenantId}::uuid
         AND loc.shopify_location_id IS NOT NULL
         AND v.shopify_variant_id IS NOT NULL
         AND p.shopify_sync_enabled = TRUE
       -- ⛔ **Qui c'era «le non pronte per prime», e AFFAMAVA le altre.** Con
       --    duecento coppie stabilmente escluse — varianti che il canale non
       --    risolve — quelle occupavano tutte le posizioni a ogni passata: la
       --    rotazione avveniva DENTRO il gruppo prioritario, e le coppie pronte
       --    da correggere non arrivavano mai. È lo stesso blocco di testa già
       --    pagato nella coda del ritentativo.
       --
       -- ⭐ **Basta la rotazione, che è anche la priorità giusta**: chi non è
       --    mai stata esaminata ha \`last_attempt_at\` NULL e sta in testa —
       --    quindi alla prima passata vengono comunque le coppie nuove — e chi
       --    è stata guardata scende, qualunque sia stato l'esito.
       ORDER BY s.last_attempt_at ASC NULLS FIRST,
                l.location_id ASC,
                l.variant_id ASC
       LIMIT ${tetto}`;
  }

  /**
   * Segna che questa coppia è stata ESAMINATA adesso.
   *
   * ⭐ **Si scrive PRIMA di tentare, e qualunque sia l'esito**: è ciò che fa
   *    ruotare la coda. Dopo sarebbe peggio — un guasto a metà lascerebbe la
   *    coppia in testa per sempre.
   *
   * ⚠️ **Un `upsert`, perché la riga può non esistere ancora**: senza, una
   *    coppia mai toccata resterebbe in testa a ogni passata.
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

  /**
   * Quante coppie del perimetro NON risultano a posto, adesso.
   *
   * ⛔ **Una COUNT sola, e non tre numeri sommati.** Sommando insiemi che si
   *    sovrappongono una coppia senza base e fallita valeva due; contando
   *    coppie distinte vale una.
   *
   * ⭐ **Le condizioni sono quelle che le colonne GIÀ dicono**, e ognuna si
   *    spegne solo quando il lavoro è stato fatto o verificato:
   *
   * ```text
   *   base assente          la partenza controllata non è avvenuta
   *   mismatch_detected     il canale ha rifiutato: serve riconciliazione
   *   local_push_pending    c'è un aggiornamento locale non trasmesso
   *   pending_key           un tentativo è rimasto aperto: esito ignoto
   *   local_pending_delta   scostamento locale ancora da mandare
   * ```
   *
   * ⚠️ **Più le coppie che questa passata ha lasciato indietro**: le escluse
   *    per struttura — collegamento escluso, negozio non connesso — non
   *    scrivono niente sulla riga, quindi l'unico posto dove esistono è
   *    l'elenco di adesso. Le altre le ritrova la riga, anche passate dopo.
   */
  private async contaNonAPosto(
    tenantId: string,
    coppie: readonly { readonly variantId: string; readonly locationId: string }[],
  ): Promise<number> {
    const toccate =
      coppie.length === 0
        ? Prisma.empty
        : Prisma.sql`OR (l.variant_id, l.location_id) IN (${Prisma.join(
            coppie.map((c) => Prisma.sql`(${c.variantId}::uuid, ${c.locationId}::uuid)`),
          )})`;
    const righe = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n
        FROM inventory_levels l
        JOIN product_variants v ON v.id = l.variant_id
        JOIN products p ON p.id = v.product_id
        JOIN locations loc ON loc.id = l.location_id
        LEFT JOIN shopify_inventory_sync_states s
               ON s.tenant_id = l.tenant_id
              AND s.variant_id = l.variant_id
              AND s.location_id = l.location_id
       WHERE l.tenant_id = ${tenantId}::uuid
         AND loc.shopify_location_id IS NOT NULL
         AND v.shopify_variant_id IS NOT NULL
         AND p.shopify_sync_enabled = TRUE
         AND (
              s.local_pending_delta IS NULL
           OR s.last_pushed_available IS NULL
           OR s.mismatch_detected = TRUE
           OR s.local_push_pending = TRUE
           OR s.pending_key IS NOT NULL
           OR COALESCE(s.local_pending_delta, 0) <> 0
           ${toccate}
         )`;
    return Number(righe[0]?.n ?? 0);
  }

  /**
   * Quante coppie questa OPERAZIONE non ha ancora verificato.
   *
   * ⛔ **Non è «mai esaminate»**, e la differenza è il difetto che questo
   *    metodo chiude: al secondo uso di Allinea ogni riga porta già un
   *    `last_attempt_at`, quindi quel conto nasce a zero — e dichiara conclusa
   *    un'operazione che non ha guardato le coppie lasciate fuori dal tetto.
   *
   * ⛔ **E non è «non esaminate in questa PASSATA»**, che non convergerebbe:
   *    ogni passata ne guarda duecento diverse e ne lascia fuori cento, quindi
   *    il numero resterebbe cento per sempre.
   *
   * ⭐ **È relativo all'ISTANTE dell'operazione**: scende a ogni passata,
   *    perché la rotazione tocca ogni volta coppie diverse, e arriva a zero
   *    quando ha fatto il giro completo.
   */
  private async contaNonVerificate(tenantId: string, dalle: Date): Promise<number> {
    const righe = await this.prisma.$queryRaw<{ mai: bigint }[]>`
      SELECT COUNT(*) AS mai
        FROM inventory_levels l
        JOIN product_variants v ON v.id = l.variant_id
        JOIN products p ON p.id = v.product_id
        JOIN locations loc ON loc.id = l.location_id
        LEFT JOIN shopify_inventory_sync_states s
               ON s.tenant_id = l.tenant_id
              AND s.variant_id = l.variant_id
              AND s.location_id = l.location_id
       WHERE l.tenant_id = ${tenantId}::uuid
         AND loc.shopify_location_id IS NOT NULL
         AND v.shopify_variant_id IS NOT NULL
         AND p.shopify_sync_enabled = TRUE
         AND (s.last_attempt_at IS NULL OR s.last_attempt_at < ${dalle})`;
    return Number(righe[0]?.mai ?? 0);
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

  /**
   * Quante coppie NON sono ancora pronte per la sincronizzazione continua.
   *
   * ⛔ **Per COPPIA, non per variante.** Un filtro annidato sulla variante non
   *    sa di quale sede si parli: una variante pronta sul magazzino A
   *    risulterebbe a posto anche sul B.
   *
   * ⛔ **E con lo STESSO criterio della selezione**: contatori e ultimo
   *    confermato insieme.
   */
  private async contaNonPronte(tenantId: string): Promise<number> {
    const righe = await this.prisma.$queryRaw<{ mancanti: bigint }[]>`
      SELECT COUNT(*) AS mancanti
        FROM inventory_levels l
        JOIN product_variants v ON v.id = l.variant_id
        JOIN products p ON p.id = v.product_id
        JOIN locations loc ON loc.id = l.location_id
        LEFT JOIN shopify_inventory_sync_states s
               ON s.tenant_id = l.tenant_id
              AND s.variant_id = l.variant_id
              AND s.location_id = l.location_id
       WHERE l.tenant_id = ${tenantId}::uuid
         AND loc.shopify_location_id IS NOT NULL
         AND v.shopify_variant_id IS NOT NULL
         AND p.shopify_sync_enabled = TRUE
         AND (s.local_pending_delta IS NULL OR s.last_pushed_available IS NULL)`;
    return Number(righe[0]?.mancanti ?? 0);
  }
}
