import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, ShopifySyncStatus, ShopifyWebhookReceiptEsito } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifySyncService } from './shopify-sync.service';
import {
  CorsiaWebhookSuperataException,
  guardiaDellaCorsia,
  type GuardiaCorsia,
} from './shopify-webhook-corsia.util';
import { risorsaDelWebhook } from './shopify-webhook-risorsa.util';
import {
  attesaDopoIlFallimento,
  naturaDellErrore,
  TENTATIVI_MASSIMI,
} from './shopify-webhook-ritentativo.util';
import { isExpectedShopifyWebhookTopic } from './shopify-webhook-topics';

/** Ciò che il controller consegna dopo aver verificato la firma. */
export interface ConsegnaWebhook {
  readonly shopDomain: string;
  readonly webhookId: string;
  readonly topic: string;
  readonly payload: unknown;
  readonly triggeredAt: Date | null;
  readonly apiVersion: string | null;
}

export interface RicevutaAccolta {
  readonly ricevutaId: string;
  readonly tenantId: string;
  /** La stessa consegna era già durevole: nessuna seconda elaborazione. */
  readonly doppione: boolean;
}

/** Gli esiti «aperti»: la ricevuta è ancora della coda. */
const ESITI_APERTI: readonly ShopifyWebhookReceiptEsito[] = [
  ShopifyWebhookReceiptEsito.in_coda,
  ShopifyWebhookReceiptEsito.in_lavorazione,
];

/** Gli esiti che fanno ATTENDERE le ricevute più giovani della stessa risorsa (aperti + fallita). */
const ESITI_CHE_BLOCCANO: readonly ShopifyWebhookReceiptEsito[] = [
  ...ESITI_APERTI,
  ShopifyWebhookReceiptEsito.fallita,
];

/** Gli esiti da cui «Riprova» può ripartire. */
const ESITI_RIPROVABILI: readonly ShopifyWebhookReceiptEsito[] = [
  ShopifyWebhookReceiptEsito.fallita,
  ShopifyWebhookReceiptEsito.sospesa_dopo_ripristino,
];

type RicevutaAperta = Pick<
  Prisma.ShopifyWebhookReceiptGetPayload<object>,
  'id' | 'risorsa' | 'esito' | 'nextAttemptAt' | 'receivedAt' | 'lavorataDaVersione'
>;

/** Il messaggio con cui una ricevuta viene chiusa quando non si applica: per chi legge, non per chi programma. */
const MOTIVI = {
  sync_spenta: 'Aggiornamenti automatici da Shopify disattivati al momento dell’elaborazione.',
  topic: 'Notifica di un tipo che VestiFlow non tratta.',
  associazione:
    'Il negozio non è più collegato a questa azienda come quando la notifica è arrivata: nessun effetto applicato.',
  sospesa:
    'Ripristinata da un backup: si riprende solo con «Riprova», dopo aver verificato il collegamento.',
} as const;

/**
 * ⭐ LA CODA DELLE NOTIFICHE WEBHOOK (docs/30 §7.1, §7.1.1, §7.1.2 — decisioni D1–D7 del
 *    proprietario, 15/09/2026).
 *
 * Tre responsabilità, in tre gruppi di metodi:
 *
 * 1. **Accoglienza** (`accogli`): la consegna diventa DUREVOLE — `INSERT … ON CONFLICT`
 *    in una transazione propria, attesa prima che il controller risponda `200`. Un
 *    doppione (stesso `X-Shopify-Webhook-Id`) è la stessa riga. Se l'inserimento
 *    fallisce l'eccezione risale e Shopify NON riceve la conferma: a ritentare è lui.
 *
 * 2. **Lavoratore** (`sveglia`, `scansione`, `lavoraCorsia`): nel processo dell'API, una
 *    ricevuta alla volta PER NEGOZIO (la corsia, rivendicata con versione e lease), ma
 *    con l'ordine conservato PER RISORSA: una ricevuta in attesa di ritentativo non
 *    ferma le risorse indipendenti, e non viene scavalcata da una più giovane della
 *    propria. Una `fallita` blocca soltanto la propria risorsa finché una persona non
 *    preme «Riprova». Ogni transazione di effetto e la scrittura remota ricontrollano la
 *    versione (`GuardiaCorsia`): la lease permette di riprendere, non dimostra che il
 *    lavoratore precedente sia morto.
 *
 * 3. **Operatore** (`elencoNonApplicate`, `riprova`): le ricevute non applicate si
 *    leggono; «Riprova» riparte dalla STESSA ricevuta con le stesse protezioni, dopo
 *    aver verificato tenant, negozio, connessione e sincronizzazione attuali. Non
 *    azzera gli errori della connessione; non esiste per le scartate per sync spenta.
 *
 * ⛔ Nessuna coda esterna; nessun ritentativo per errori permanenti o esiti incerti
 *    (`naturaDellErrore`); nessun superamento automatico di una fallita.
 */
@Injectable()
export class ShopifyWebhookCodaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ShopifyWebhookCodaService.name);
  /** L'identità di QUESTO processo nelle rivendicazioni: si legge nei log e nella corsia. */
  private readonly lavoratore = `${process.pid}-${randomUUID().slice(0, 8)}`;
  /** Per tenant: la corsia è già in lavorazione qui, e va ripassata alla fine. */
  private readonly inCorso = new Map<string, { promessa: Promise<void>; ripassa: boolean }>();
  private timer: NodeJS.Timeout | null = null;
  private attivo = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ShopifyConfigService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifySync: ShopifySyncService,
  ) {}

  // ── 1 · Accoglienza ──────────────────────────────────────────────────────

  /**
   * Rende durevole la consegna e dice a chi chiama se era già nota. Lancia se il
   * negozio non è di nessun tenant (come oggi: `NotFoundException`) o se il database
   * non conferma l'inserimento: in entrambi i casi niente `200`.
   */
  async accogli(consegna: ConsegnaWebhook): Promise<RicevutaAccolta> {
    const tenantId = await this.shopifyOAuth.resolveTenantByShopDomain(consegna.shopDomain);
    const connessione = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopId: true },
    });
    if (!connessione) {
      throw new NotFoundException('Tenant non trovato per questo shop Shopify');
    }
    const topicAtteso = isExpectedShopifyWebhookTopic(consegna.topic);
    const payload = consegna.payload as Prisma.InputJsonValue;
    // Il dominio VERIFICATO: quello con cui la connessione è stata trovata, normalizzato.
    const shopDomain = this.config.normalizeShopDomain(consegna.shopDomain);
    try {
      const ricevuta = await this.prisma.shopifyWebhookReceipt.create({
        data: {
          tenantId,
          shopId: connessione.shopId,
          shopDomain,
          webhookId: consegna.webhookId,
          topic: consegna.topic,
          risorsa: risorsaDelWebhook(consegna.topic, consegna.payload),
          triggeredAt: consegna.triggeredAt,
          apiVersion: consegna.apiVersion,
          payload,
          ...(topicAtteso
            ? {}
            : {
                esito: ShopifyWebhookReceiptEsito.scartata_topic,
                processedAt: new Date(),
                ultimoErrore: MOTIVI.topic,
              }),
        },
        select: { id: true },
      });
      if (topicAtteso) {
        // Accolta = durevole: è il fatto che «gli eventi arrivano», a prescindere dall'esito.
        await this.shopifyConnection.recordWebhookEventReceived(tenantId);
        this.logger.log(
          `Shopify → notifica ${consegna.topic} accolta (${ricevuta.id}, ${tenantId})`,
        );
      }
      return { ricevutaId: ricevuta.id, tenantId, doppione: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const esistente = await this.prisma.shopifyWebhookReceipt.findUnique({
          where: {
            shopDomain_webhookId: { shopDomain, webhookId: consegna.webhookId },
          },
          select: { id: true },
        });
        if (esistente) {
          this.logger.log(
            `Shopify → notifica ${consegna.topic} già accolta (${esistente.id}): consegna ripetuta ignorata`,
          );
          return { ricevutaId: esistente.id, tenantId, doppione: true };
        }
      }
      throw error;
    }
  }

  // ── 2 · Lavoratore ───────────────────────────────────────────────────────

  onApplicationBootstrap(): void {
    // La passata all'avvio (D3): ciò che era in coda quando il processo si è fermato.
    setImmediate(() => void this.scansione());
    const intervallo = this.config.webhookScanIntervalMs;
    if (intervallo > 0) {
      this.timer = setInterval(() => void this.scansione(), intervallo);
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    this.attivo = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Dopo il `200`: il lavoratore parte fuori dalla richiesta, nello stesso processo. */
  sveglia(tenantId: string): void {
    setImmediate(() => void this.lavoraCorsia(tenantId));
  }

  /**
   * La scansione periodica (D1, D3): ogni tenant con una ricevuta pronta — in coda con
   * `next_attempt_at` scaduto, o lasciata `in_lavorazione` da un lavoratore superato.
   */
  async scansione(): Promise<void> {
    if (!this.attivo) {
      return;
    }
    try {
      const pronte = await this.prisma.shopifyWebhookReceipt.findMany({
        where: { esito: { in: [...ESITI_APERTI] }, nextAttemptAt: { lte: new Date() } },
        select: { tenantId: true },
        distinct: ['tenantId'],
      });
      await Promise.all(pronte.map((riga) => this.lavoraCorsia(riga.tenantId)));
    } catch (error) {
      this.logger.error(
        `Scansione della coda webhook fallita: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Lavora la corsia di un tenant finché ha ricevute pronte. Nello stesso processo una
   * corsia gira una volta sola per volta; una sveglia arrivata mentre gira la fa ripassare.
   */
  lavoraCorsia(tenantId: string): Promise<void> {
    const corrente = this.inCorso.get(tenantId);
    if (corrente) {
      corrente.ripassa = true;
      return corrente.promessa;
    }
    const voce = { ripassa: false, promessa: Promise.resolve() };
    voce.promessa = (async () => {
      try {
        do {
          voce.ripassa = false;
          await this.lavoraCorsiaUnaVolta(tenantId);
        } while (voce.ripassa && this.attivo);
      } catch (error) {
        this.logger.error(
          `Corsia webhook ${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.inCorso.delete(tenantId);
      }
    })();
    this.inCorso.set(tenantId, voce);
    return voce.promessa;
  }

  private async lavoraCorsiaUnaVolta(tenantId: string): Promise<void> {
    const versione = await this.rivendicaCorsia(tenantId);
    if (versione === null) {
      return;
    }
    const guardia = guardiaDellaCorsia(tenantId, versione);
    try {
      for (;;) {
        if (!this.attivo) {
          return;
        }
        const prossima = await this.prossimaPronta(tenantId, versione);
        if (!prossima) {
          return;
        }
        if (!(await this.rinnovaCorsia(tenantId, versione))) {
          return;
        }
        await this.elabora(tenantId, prossima, guardia);
      }
    } catch (error) {
      if (error instanceof CorsiaWebhookSuperataException) {
        this.logger.warn(`Corsia webhook ${tenantId}: rivendicazione superata, mi fermo`);
        return;
      }
      throw error;
    } finally {
      await this.rilasciaCorsia(tenantId, versione);
    }
  }

  /**
   * La rivendicazione: libera, o scaduta. La versione cresce a ogni assegnazione ed è
   * ciò che ogni scrittura del lavoratore porta con sé.
   */
  private async rivendicaCorsia(tenantId: string): Promise<number | null> {
    await this.prisma.$executeRaw`
      INSERT INTO "shopify_webhook_lanes" ("tenant_id") VALUES (${tenantId}::uuid)
      ON CONFLICT ("tenant_id") DO NOTHING`;
    const lease = this.config.webhookLaneLeaseMs;
    const righe = await this.prisma.$queryRaw<{ claim_version: number }[]>`
      UPDATE "shopify_webhook_lanes"
         SET "claimed_by" = ${this.lavoratore}, "claimed_at" = now(), "claim_version" = "claim_version" + 1
       WHERE "tenant_id" = ${tenantId}::uuid
         AND ("claimed_at" IS NULL OR "claimed_at" < now() - (${lease}::int * interval '1 millisecond'))
       RETURNING "claim_version"`;
    return righe[0]?.claim_version ?? null;
  }

  /** Prima di ogni ricevuta: la corsia è ancora mia? Se sì la lease riparte da adesso. */
  private async rinnovaCorsia(tenantId: string, versione: number): Promise<boolean> {
    const aggiornate = await this.prisma.$executeRaw`
      UPDATE "shopify_webhook_lanes" SET "claimed_at" = now()
       WHERE "tenant_id" = ${tenantId}::uuid AND "claim_version" = ${versione}`;
    return aggiornate === 1;
  }

  private async rilasciaCorsia(tenantId: string, versione: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "shopify_webhook_lanes" SET "claimed_by" = NULL, "claimed_at" = NULL
       WHERE "tenant_id" = ${tenantId}::uuid AND "claim_version" = ${versione}`;
  }

  /**
   * ⭐ L'ORDINE PER RISORSA (decisione 1). Le ricevute che bloccano (aperte o fallite) si
   *    percorrono dalla più vecchia (ordine di ARRIVO assegnato dal database, non l'orologio:
   *    due consegne nello stesso millisecondo restano nell'ordine in cui sono entrate): la
   *    prima pronta la cui risorsa non ha una più vecchia
   *    ancora aperta è la prossima. Una risorsa `null` è correlata a tutto: non scavalca
   *    (aspetta che tutto ciò che la precede sia concluso) e non è scavalcata (ferma tutto
   *    ciò che la segue). Una `in_lavorazione` di una versione superata è abbandonata da un
   *    lavoratore che non scrive più: si riprende.
   */
  private async prossimaPronta(
    tenantId: string,
    versione: number,
  ): Promise<RicevutaAperta | null> {
    const aperte: RicevutaAperta[] = await this.prisma.shopifyWebhookReceipt.findMany({
      where: { tenantId, esito: { in: [...ESITI_CHE_BLOCCANO] } },
      orderBy: [{ arrivo: 'asc' }],
      select: {
        id: true,
        risorsa: true,
        esito: true,
        nextAttemptAt: true,
        receivedAt: true,
        lavorataDaVersione: true,
      },
    });
    const adesso = Date.now();
    const bloccate = new Set<string>();
    let bloccoTotale = false;
    for (const ricevuta of aperte) {
      const bloccataDaUnaPrecedente =
        bloccoTotale ||
        (ricevuta.risorsa === null ? bloccate.size > 0 : bloccate.has(ricevuta.risorsa));
      const inLavorazioneAltrui =
        ricevuta.esito === ShopifyWebhookReceiptEsito.in_lavorazione &&
        ricevuta.lavorataDaVersione !== null &&
        ricevuta.lavorataDaVersione >= versione;
      const pronta =
        !bloccataDaUnaPrecedente &&
        ricevuta.esito !== ShopifyWebhookReceiptEsito.fallita &&
        !inLavorazioneAltrui &&
        ricevuta.nextAttemptAt.getTime() <= adesso;
      if (pronta) {
        return ricevuta;
      }
      if (ricevuta.risorsa === null) {
        bloccoTotale = true;
      } else {
        bloccate.add(ricevuta.risorsa);
      }
    }
    return null;
  }

  private async elabora(
    tenantId: string,
    ricevuta: RicevutaAperta,
    guardia: GuardiaCorsia,
  ): Promise<void> {
    const presa = await this.prisma.shopifyWebhookReceipt.updateMany({
      where: { id: ricevuta.id, esito: { in: [...ESITI_APERTI] } },
      data: {
        esito: ShopifyWebhookReceiptEsito.in_lavorazione,
        lavorataDaVersione: guardia.versione,
      },
    });
    if (presa.count !== 1) {
      return;
    }
    const intera = await this.prisma.shopifyWebhookReceipt.findUniqueOrThrow({
      where: { id: ricevuta.id },
      select: {
        topic: true,
        payload: true,
        shopDomain: true,
        shopId: true,
        tentativi: true,
      },
    });

    // ── L'associazione VERIFICATA (decisione 3): tenant, negozio, connessione ──
    const connessione = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopDomain: true, shopId: true, autoSyncEnabled: true },
    });
    const associazioneCambiata =
      !connessione ||
      connessione.shopDomain !== intera.shopDomain ||
      (intera.shopId !== null && connessione.shopId !== intera.shopId);
    if (associazioneCambiata) {
      await this.chiudi(ricevuta.id, guardia, {
        esito: ShopifyWebhookReceiptEsito.scartata_associazione_cambiata,
        ultimoErrore: MOTIVI.associazione,
      });
      this.logger.warn(
        `Webhook ${intera.topic} (${ricevuta.id}) scartato: associazione negozio/azienda cambiata (${tenantId})`,
      );
      return;
    }
    if (!connessione.autoSyncEnabled) {
      await this.chiudi(ricevuta.id, guardia, {
        esito: ShopifyWebhookReceiptEsito.scartata_sync_spenta,
        ultimoErrore: MOTIVI.sync_spenta,
      });
      this.logger.debug(`Webhook ${intera.topic} (${ricevuta.id}) scartato: sync spenta (${tenantId})`);
      return;
    }
    if (!isExpectedShopifyWebhookTopic(intera.topic)) {
      await this.chiudi(ricevuta.id, guardia, {
        esito: ShopifyWebhookReceiptEsito.scartata_topic,
        ultimoErrore: MOTIVI.topic,
      });
      return;
    }

    try {
      await guardia.assicura(this.prisma);
      await this.shopifySync.handleWebhook(tenantId, intera.topic, intera.payload, guardia);
      await this.chiudi(ricevuta.id, guardia, {
        esito: ShopifyWebhookReceiptEsito.elaborata,
        tentativi: intera.tentativi + 1,
        ultimoErrore: null,
      });
    } catch (error) {
      if (error instanceof CorsiaWebhookSuperataException) {
        throw error;
      }
      const tentativi = intera.tentativi + 1;
      const messaggio = motivoPerChiLegge(error);
      const natura = naturaDellErrore(error);
      const attesa = natura === 'transitorio' ? attesaDopoIlFallimento(tentativi) : null;
      this.logger.error(
        `Webhook ${intera.topic} (${ricevuta.id}) fallito al tentativo ${tentativi} — ${natura}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (attesa !== null && tentativi < TENTATIVI_MASSIMI) {
        await this.aggiornaSeMia(ricevuta.id, guardia, {
          esito: ShopifyWebhookReceiptEsito.in_coda,
          tentativi,
          ultimoErrore: messaggio,
          nextAttemptAt: new Date(Date.now() + attesa),
          lavorataDaVersione: null,
        });
        return;
      }
      await this.chiudi(ricevuta.id, guardia, {
        esito: ShopifyWebhookReceiptEsito.fallita,
        tentativi,
        ultimoErrore: messaggio,
      });
      await this.registraFallimentoDefinitivo(tenantId, intera.topic, intera.payload, messaggio);
    }
  }

  /** Chiude la ricevuta con un esito concluso; la scrittura è della sola versione che la lavora. */
  private async chiudi(
    ricevutaId: string,
    guardia: GuardiaCorsia,
    dati: {
      esito: ShopifyWebhookReceiptEsito;
      tentativi?: number;
      ultimoErrore: string | null;
    },
  ): Promise<void> {
    await this.aggiornaSeMia(ricevutaId, guardia, {
      ...dati,
      processedAt: new Date(),
      lavorataDaVersione: null,
    });
  }

  /**
   * ⛔ Fenced: scrive solo se la ricevuta è ancora in lavorazione con la MIA versione e la
   *    corsia è ancora mia. Un lavoratore superato non lascia traccia — e si ferma.
   */
  private async aggiornaSeMia(
    ricevutaId: string,
    guardia: GuardiaCorsia,
    dati: Prisma.ShopifyWebhookReceiptUpdateManyMutationInput,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await guardia.assicura(tx);
      const aggiornate = await tx.shopifyWebhookReceipt.updateMany({
        where: {
          id: ricevutaId,
          esito: ShopifyWebhookReceiptEsito.in_lavorazione,
          lavorataDaVersione: guardia.versione,
        },
        data: dati,
      });
      if (aggiornate.count !== 1) {
        throw new CorsiaWebhookSuperataException(guardia.tenantId, guardia.versione);
      }
    });
  }

  /**
   * Come prima della coda, ma solo al fallimento DEFINITIVO: il prodotto in `error` con
   * il motivo e l'avviso sulla connessione. Un fallimento transitorio che poi riesce
   * non deve lasciare un prodotto in errore.
   */
  private async registraFallimentoDefinitivo(
    tenantId: string,
    topic: string,
    payload: unknown,
    messaggio: string,
  ): Promise<void> {
    const dati = (payload ?? {}) as Record<string, unknown>;
    if (topic.startsWith('products/')) {
      const shopifyProductId = dati['id'] != null ? String(dati['id']) : null;
      if (shopifyProductId) {
        await this.prisma.product.updateMany({
          where: { tenantId, shopifyProductId },
          data: {
            shopifySyncStatus: ShopifySyncStatus.error,
            shopifyLastError: messaggio.slice(0, 500),
          },
        });
      }
      await this.shopifyConnection.recordSetupWarning(
        tenantId,
        `Sync prodotto Shopify non riuscito: ${messaggio.slice(0, 200)}`,
        'product_webhook_failed',
      );
      return;
    }
    await this.shopifyConnection.recordSetupWarning(tenantId, messaggio, 'webhook_sync_failed');
  }

  // ── 3 · Operatore ────────────────────────────────────────────────────────

  /** Le ricevute NON applicate di un tenant, dalla più recente: fallite, sospese, scartate. */
  async elencoNonApplicate(tenantId: string) {
    return this.prisma.shopifyWebhookReceipt.findMany({
      where: {
        tenantId,
        esito: {
          in: [
            ShopifyWebhookReceiptEsito.fallita,
            ShopifyWebhookReceiptEsito.sospesa_dopo_ripristino,
            ShopifyWebhookReceiptEsito.scartata_sync_spenta,
            ShopifyWebhookReceiptEsito.scartata_associazione_cambiata,
          ],
        },
      },
      orderBy: [{ receivedAt: 'desc' }],
      select: {
        id: true,
        topic: true,
        risorsa: true,
        esito: true,
        tentativi: true,
        ultimoErrore: true,
        receivedAt: true,
        processedAt: true,
        triggeredAt: true,
      },
    });
  }

  /**
   * ⭐ «Riprova» (D4): la STESSA ricevuta torna in coda, con i tentativi conservati e le
   *    stesse protezioni — l'associazione e la sincronizzazione si verificano ADESSO,
   *    prima di rimetterla in coda, e di nuovo all'elaborazione. Solo `fallita` e
   *    `sospesa_dopo_ripristino`: una scartata per sync spenta non si riprova (D2), una
   *    scartata per associazione cambiata nemmeno (decisione 3).
   */
  async riprova(tenantId: string, ricevutaId: string): Promise<{ readonly inCoda: true }> {
    const ricevuta = await this.prisma.shopifyWebhookReceipt.findFirst({
      where: { id: ricevutaId, tenantId },
      select: { esito: true, shopDomain: true, shopId: true, topic: true },
    });
    if (!ricevuta) {
      throw new NotFoundException('Notifica non trovata.');
    }
    if (!ESITI_RIPROVABILI.includes(ricevuta.esito)) {
      throw new BadRequestException(
        ricevuta.esito === ShopifyWebhookReceiptEsito.scartata_sync_spenta
          ? 'Questa notifica è stata scartata con gli aggiornamenti automatici disattivati: non si riprova. Usa «Importa» per riallineare.'
          : ricevuta.esito === ShopifyWebhookReceiptEsito.scartata_associazione_cambiata
            ? MOTIVI.associazione
            : 'Questa notifica non è in uno stato da cui si possa riprovare.',
      );
    }
    const connessione = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopDomain: true, shopId: true, autoSyncEnabled: true },
    });
    if (
      !connessione ||
      connessione.shopDomain !== ricevuta.shopDomain ||
      (ricevuta.shopId !== null && connessione.shopId !== ricevuta.shopId)
    ) {
      throw new BadRequestException(MOTIVI.associazione);
    }
    if (!connessione.autoSyncEnabled) {
      throw new BadRequestException(
        'Gli aggiornamenti automatici da Shopify sono disattivati: attivali prima di riprovare.',
      );
    }
    await this.prisma.shopifyWebhookReceipt.updateMany({
      where: { id: ricevutaId, tenantId, esito: { in: [...ESITI_RIPROVABILI] } },
      data: {
        esito: ShopifyWebhookReceiptEsito.in_coda,
        processedAt: null,
        nextAttemptAt: new Date(),
        lavorataDaVersione: null,
      },
    });
    this.logger.log(`Webhook ${ricevuta.topic} (${ricevutaId}) rimesso in coda da «Riprova» (${tenantId})`);
    this.sveglia(tenantId);
    return { inCoda: true };
  }
}

/**
 * Il motivo che l'operatore legge sulla ricevuta: gli errori del database col solo codice
 * (niente chiamata, percorso del file o stack — quelli restano nei log), gli altri col
 * loro messaggio, che per Shopify e per i rifiuti di dominio è già scritto per chi legge.
 */
function motivoPerChiLegge(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `Salvataggio locale non riuscito (${error.code}).`;
  }
  if (
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientInitializationError
  ) {
    return 'Salvataggio locale non riuscito.';
  }
  const testo = error instanceof Error ? error.message : String(error);
  return testo.slice(0, 500);
}
