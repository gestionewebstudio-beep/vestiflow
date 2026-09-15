import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  ShopifyConnectionStatus,
  ShopifyLocationChoiceKind,
  ShopifySetupDirection,
  ShopifySetupStatus,
  ShopifySyncStatus,
  type ShopifySetup,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient, type ShopifyAdminProduct } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { gidArticoloInventario } from './shopify-link-history.service';
import { gidSede, normalizeShopifyLocationId } from './shopify-location-id.util';
import { indirizzoDaShopify, prossimoCodiceSede } from './shopify-location-import.util';
import { ShopifyLocationLinkService } from './shopify-location-link.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import type {
  ShopifySetupAmbiguoDto,
  ShopifySetupAllineaDto,
  ShopifySetupAnteprimaDto,
  ShopifySetupDto,
  ShopifySetupEsclusoDto,
  ShopifySetupEsitoDto,
  ShopifySetupLocationDto,
  ShopifySetupNonDeterminabileDto,
  ShopifySetupQuantitaRigaDto,
  ShopifySetupSedeVestiFlowDto,
  ShopifySetupSituazioneDto,
} from './shopify-setup.model';
import { motivoQuantitaFerma, ordiniApertiSenzaSede } from './shopify-ordini-senza-sede.util';
import { ShopifyOrdersPullService } from './shopify-orders-pull.service';
import { irrisoltiDelPercorso } from './shopify-setup-irrisolti.util';
import { situazioneAttuale } from './shopify-setup-situazione.util';
import { variantLabel } from '../common/variant-label.util';
import { ShopifySetupTransferService } from './shopify-setup-transfer.service';
import { ShopifyWebhookCodaService } from './shopify-webhook-coda.service';

/** Quante righe di quantità entrano nell'anteprima: il resto è un conteggio. */
const RIGHE_ANTEPRIMA = 200;

/**
 * ⭐ **LA PRIMA CONNESSIONE Shopify — il percorso** (`docs/27`, `docs/24` §12.-1).
 *
 * Tre fasi visibili — scelte, sedi, controllo e conferma — poi trasferimento,
 * esito e attivazione. Questo servizio tiene lo STATO del percorso e le scelte;
 * il trasferimento lo esegue `ShopifySetupTransferService`, riusando i motori
 * esistenti (import catalogo, push, Allinea).
 *
 * ⛔ **Prima della conferma non si trasferisce niente**: qui si salvano scelte e
 *    configurazione e si LEGGE per i controlli. Le sole scritture sono le scelte
 *    sulle sedi (coppia e periodo, che sono configurazione) e l'anteprima.
 *
 * ⚠️ **Nessuna riga = nessun percorso** (risposta 4 del proprietario): una
 *    connessione nata prima dell'11/09/2026 non viene spinta dentro, e non si
 *    deduce «già attiva». La riga la crea il callback OAuth di una connessione
 *    NUOVA (`ShopifyOAuthService`).
 */

@Injectable()
export class ShopifySetupService {
  private readonly logger = new Logger(ShopifySetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly locationLink: ShopifyLocationLinkService,
    private readonly transfer: ShopifySetupTransferService,
    private readonly ordersPull: ShopifyOrdersPullService,
    private readonly codaWebhook: ShopifyWebhookCodaService,
  ) {}

  // ── Nascita del percorso ───────────────────────────────────────────────────

  /** Vero se per questa connessione esiste un percorso non ancora attivato. */
  async percorsoInCorso(tenantId: string): Promise<boolean> {
    const setup = await this.prisma.shopifySetup.findUnique({
      where: { tenantId },
      select: { status: true },
    });
    return setup !== null && setup.status !== ShopifySetupStatus.attivato;
  }

  /**
   * L’ultimo id ordine fissato all’attivazione, se il percorso è ATTIVATO:
   * «Importa ordini» diventa il recupero della sincronizzazione continua.
   * `null` = connessione nata prima, o percorso non ancora attivato.
   */
  async ordersSinceIdSeAttivato(tenantId: string): Promise<string | null> {
    const setup = await this.prisma.shopifySetup.findUnique({
      where: { tenantId },
      select: { status: true, ordersSinceId: true },
    });
    if (setup?.status !== ShopifySetupStatus.attivato) {
      return null;
    }
    return setup.ordersSinceId ?? '0';
  }

  // ── Lettura dello stato ────────────────────────────────────────────────────

  /**
   * Lo stato del percorso E delle sedi. ⚠️ Le sedi si leggono anche senza
   *    percorso: la sezione Sedi di Impostazioni → Shopify serve pure alle
   *    connessioni nate prima (B7 ha tolto la creazione automatica, e una
   *    location nuova va decisa da qualcuno). Senza credenziale (negozio non
   *    collegato) le location sono semplicemente vuote.
   */
  async stato(tenantId: string): Promise<ShopifySetupDto> {
    const setup = await this.prisma.shopifySetup.findUnique({ where: { tenantId } });
    const connessione = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true },
    });
    const collegata = connessione?.status === ShopifyConnectionStatus.connected;
    const [locations, sediVestiFlow] = await Promise.all([
      collegata ? this.locationsConScelte(tenantId) : Promise.resolve([]),
      this.sediVestiFlow(tenantId),
    ]);
    if (!setup) {
      return {
        presente: false,
        status: null,
        direction: null,
        locations,
        sediVestiFlow,
        anteprima: null,
        esito: null,
        confirmedAt: null,
        activatedAt: null,
        blocchiAttivazione: [],
        irrisolti: [],
        trasferimentoInCorso: false,
        situazione: collegata
          ? await this.situazione(tenantId, null, null)
          : { calcolataAt: new Date().toISOString(), problemi: [] },
      };
    }
    const anteprima = (setup.anteprima as ShopifySetupAnteprimaDto | null) ?? null;
    const esito = (setup.esito as ShopifySetupEsitoDto | null) ?? null;
    return {
      presente: true,
      status: setup.status,
      direction: setup.direction,
      locations,
      sediVestiFlow,
      anteprima,
      esito,
      confirmedAt: setup.confirmedAt?.toISOString() ?? null,
      activatedAt: setup.activatedAt?.toISOString() ?? null,
      blocchiAttivazione: await this.blocchiAttivazione(tenantId, setup),
      // Dopo la conferma: ciò che il trasferimento ha escluso e gli ordini che
      // non diventano impegni. Prima, l’anteprima li mostra già come tali.
      irrisolti: setup.confirmedAt ? irrisoltiDelPercorso(anteprima, esito) : [],
      trasferimentoInCorso: this.transfer.inCorso(tenantId),
      // ⭐ La situazione di ADESSO, non la fotografia: i problemi aperti con
      //    causa, conseguenza e azione (13/09/2026, `docs/27` §4-bis).
      situazione: collegata
        ? await this.situazione(
            tenantId,
            esito,
            setup.activatedAt?.toISOString() ?? esito?.finishedAt ?? null,
          )
        : { calcolataAt: new Date().toISOString(), problemi: [] },
    };
  }

  /**
   * I problemi aperti ADESSO, letti dai dati e non dall'esito.
   *
   * ⛔ Misurato sul collaudo il 13/09/2026: l'esito diceva «84 casi da risolvere
   *    a mano» — 82 esclusi persistiti (75 volte lo stesso guasto già corretto)
   *    e 2 ordini dall'anteprima — con un'azione sbagliata («collega la
   *    location» a permesso mancante). Qui: gli ordini senza sede con la causa
   *    scritta oggi sull'ordine; le coppie collegate che NON hanno una base
   *    (stato per coppia), con la causa dell'ultimo tentativo dichiarata tale;
   *    gli articoli esclusi ancora scollegati; i permessi e le notifiche che
   *    mancano al negozio. Nessuna correzione: si nomina e si indica l'azione.
   */
  private async situazione(
    tenantId: string,
    esito: ShopifySetupEsitoDto | null,
    ultimoTentativoAt: string | null,
  ): Promise<ShopifySetupSituazioneDto> {
    const [connessione, ordiniSenzaSede, sedi] = await Promise.all([
      this.shopifyConnection.getForTenant(tenantId),
      ordiniApertiSenzaSede(this.prisma, tenantId),
      this.locationLink.sediCollegate(tenantId),
    ]);
    const sediPerId = new Map(
      (
        await this.prisma.location.findMany({
          where: { tenantId, id: { in: sedi.map((s) => s.locationId) } },
          select: { id: true, name: true },
        })
      ).map((l) => [l.id, l.name] as const),
    );
    const varianti =
      sedi.length === 0
        ? []
        : await this.prisma.productVariant.findMany({
            where: {
              tenantId,
              shopifyInventoryItemId: { not: null },
              product: { shopifySyncEnabled: true, deletedAt: null },
            },
            select: {
              id: true,
              productId: true,
              sku: true,
              optionValues: true,
              product: { select: { name: true } },
            },
            orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
          });
    const conBase = new Set(
      (
        await this.prisma.shopifyInventorySyncState.findMany({
          where: { tenantId, lastPushedAvailable: { not: null } },
          select: { variantId: true, locationId: true },
        })
      ).map((s) => `${s.variantId}:${s.locationId}`),
    );
    const coppieSenzaBase = varianti.flatMap((variante) =>
      sedi
        .filter((sede) => !conBase.has(`${variante.id}:${sede.locationId}`))
        .map((sede) => ({
          variantId: variante.id,
          productId: variante.productId,
          locationId: sede.locationId,
          articolo: variante.product.name,
          sku: variante.sku,
          variante: variantLabel(variante.optionValues) || null,
          sede: sediPerId.get(sede.locationId) ?? sede.locationId,
        })),
    );
    const articoliEsclusiIds = (esito?.esclusi ?? [])
      .filter((e) => e.tipo === 'articolo')
      .map((e) => e.riferimento);
    const ancoraScollegati =
      articoliEsclusiIds.length === 0
        ? new Set<string>()
        : new Set(
            (
              await this.prisma.product.findMany({
                where: { tenantId, id: { in: articoliEsclusiIds }, shopifyProductId: null },
                select: { id: true },
              })
            ).map((p) => p.id),
          );
    const articoliEsclusi = (esito?.esclusi ?? [])
      .filter((e) => e.tipo === 'articolo' && ancoraScollegati.has(e.riferimento))
      .map((e) => ({
        productId: e.riferimento,
        nome: e.nome,
        motivo: e.motivo,
        dettaglio: e.dettaglio ?? null,
      }));
    const eventiNonApplicati = (await this.codaWebhook.elencoNonApplicate(tenantId)).flatMap(
      (ricevuta) =>
        ricevuta.esito === 'fallita' ||
        ricevuta.esito === 'sospesa_dopo_ripristino' ||
        ricevuta.esito === 'scartata_sync_spenta' ||
        ricevuta.esito === 'scartata_associazione_cambiata'
          ? [
              {
                ricevutaId: ricevuta.id,
                topic: ricevuta.topic,
                risorsa: ricevuta.risorsa,
                esito: ricevuta.esito,
                tentativi: ricevuta.tentativi,
                motivo: ricevuta.ultimoErrore,
                receivedAt: ricevuta.receivedAt,
              },
            ]
          : [],
    );
    return {
      calcolataAt: new Date().toISOString(),
      problemi: situazioneAttuale({
        eventiNonApplicati,
        ordiniSenzaSede,
        coppieSenzaBase,
        articoliEsclusi,
        esclusiUltimoTentativo: esito?.esclusi ?? [],
        ultimoTentativoAt,
        ambitiMancanti: connessione.scopeDiagnostics?.missingFromGrant ?? [],
        topicMancanti: connessione.webhookTopicsKnown
          ? (connessione.webhookMissingTopics ?? [])
          : null,
        ordiniFallitiAttivazione: esito?.attivazione?.ordini.falliti ?? 0,
      }),
    };
  }

  /**
   * Le location del negozio (lette da Shopify, mai dalla colonna-cache) con la
   * scelta registrata per ciascuna. La sede collegata si legge dallo storico
   * (coppia attiva), che è la fonte; la scelta «lascia» dalla tabella delle
   * scelte, perché non tocca le sedi.
   */
  private async locationsConScelte(tenantId: string): Promise<readonly ShopifySetupLocationDto[]> {
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const [remote, scelte, collegate] = await Promise.all([
      this.shopifyAdmin.listLocations(shopDomain, accessToken),
      this.prisma.shopifyLocationChoice.findMany({
        where: { tenantId },
        include: { location: { select: { id: true, name: true } } },
      }),
      this.locationLink.sediCollegate(tenantId),
    ]);
    const sedi = await this.prisma.location.findMany({
      where: { tenantId, id: { in: collegate.map((c) => c.locationId) } },
      select: { id: true, name: true },
    });
    const nomeSede = new Map(sedi.map((s) => [s.id, s.name]));
    const coppiaPerLocation = new Map(collegate.map((c) => [c.shopifyLocationId, c.locationId]));
    const sceltaPerLocation = new Map(scelte.map((s) => [s.shopifyLocationId, s]));

    return remote.map((loc) => {
      const id = normalizeShopifyLocationId(String(loc.id)) ?? String(loc.id);
      const scelta = sceltaPerLocation.get(id);
      const locationId = coppiaPerLocation.get(id) ?? scelta?.locationId ?? null;
      return {
        shopifyLocationId: id,
        name: loc.name.trim(),
        active: loc.active,
        // Una coppia attiva senza scelta registrata (tenant di prova, collegato
        // prima del percorso) si legge come «collega»: è lo stato effettivo.
        choice:
          scelta?.choice ?? (coppiaPerLocation.has(id) ? ShopifyLocationChoiceKind.collega : null),
        locationId,
        locationName: locationId
          ? (nomeSede.get(locationId) ?? scelta?.location?.name ?? null)
          : null,
      };
    });
  }

  private async sediVestiFlow(tenantId: string): Promise<readonly ShopifySetupSedeVestiFlowDto[]> {
    const [sedi, collegate] = await Promise.all([
      this.prisma.location.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      }),
      this.locationLink.sediCollegate(tenantId),
    ]);
    const perSede = new Map(collegate.map((c) => [c.locationId, c.shopifyLocationId]));
    return sedi.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      shopifyLocationId: perSede.get(s.id) ?? null,
    }));
  }

  // ── Fase 1: la direzione ───────────────────────────────────────────────────

  async scegliDirezione(
    tenantId: string,
    direction: ShopifySetupDirection,
  ): Promise<ShopifySetupDto> {
    const setup = await this.setupModificabile(tenantId);
    await this.prisma.shopifySetup.update({
      where: { id: setup.id },
      data: {
        direction,
        // Cambiare direzione invalida l'anteprima: era calcolata sull'altra.
        anteprima: Prisma.DbNull,
        anteprimaAt: null,
        status: setup.status === ShopifySetupStatus.scelte ? ShopifySetupStatus.sedi : setup.status,
      },
    });
    return this.stato(tenantId);
  }

  /** Torna a una fase precedente, finché non si è confermato. */
  async tornaA(tenantId: string, fase: 'scelte' | 'sedi'): Promise<ShopifySetupDto> {
    const setup = await this.setupModificabile(tenantId);
    await this.prisma.shopifySetup.update({
      where: { id: setup.id },
      data: {
        status: fase === 'scelte' ? ShopifySetupStatus.scelte : ShopifySetupStatus.sedi,
        anteprima: Prisma.DbNull,
        anteprimaAt: null,
      },
    });
    return this.stato(tenantId);
  }

  // ── Fase 2: le sedi ────────────────────────────────────────────────────────

  /**
   * La scelta per UNA location Shopify. «collega» e «crea» scrivono coppia e
   * periodo (il collegamento esplicito, B7); «lascia» soltanto la scelta.
   *
   * ⛔ Nessuna scrittura sulla location remota: si decide da questa parte.
   */
  async scegliSede(
    tenantId: string,
    shopifyLocationIdGrezzo: string,
    scelta:
      | { readonly choice: 'collega'; readonly locationId: string }
      | { readonly choice: 'crea'; readonly name?: string }
      | { readonly choice: 'lascia' },
  ): Promise<ShopifySetupDto> {
    const setup = await this.prisma.shopifySetup.findUnique({ where: { tenantId } });
    if (setup?.status === ShopifySetupStatus.trasferimento) {
      throw new ConflictException('Trasferimento in corso: attendi il suo esito.');
    }
    const shopifyLocationId = normalizeShopifyLocationId(shopifyLocationIdGrezzo);
    if (!shopifyLocationId || !gidSede(shopifyLocationId)) {
      throw new BadRequestException('Identificativo della location Shopify non valido');
    }
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const remote = (await this.shopifyAdmin.listLocations(shopDomain, accessToken)).find(
      (loc) => normalizeShopifyLocationId(String(loc.id)) === shopifyLocationId,
    );
    if (!remote) {
      throw new NotFoundException('La location non esiste su questo negozio Shopify');
    }
    const nomeRemoto = remote.name.trim();

    await this.prisma.$transaction(async (tx) => {
      let locationId: string | null = null;
      if (scelta.choice === 'collega') {
        const sede = await tx.location.findFirst({
          where: { id: scelta.locationId, tenantId, isActive: true },
          select: { id: true },
        });
        if (!sede) {
          throw new NotFoundException('Sede VestiFlow non trovata');
        }
        locationId = sede.id;
      } else if (scelta.choice === 'crea') {
        // ⭐ La sede nasce dalla SCELTA (docs/24 §1.13.1), non dal sync: nome da
        //    Shopify salvo diversa indicazione, codice progressivo, non licenziata
        //    finché il titolare non lo decide, indirizzo copiato una volta.
        const esistenti = await tx.location.findMany({
          where: { tenantId },
          select: { code: true },
        });
        const defaultStore = await tx.store.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        const creata = await tx.location.create({
          data: {
            tenantId,
            storeId: defaultStore?.id ?? null,
            name: (scelta.name ?? nomeRemoto).trim() || nomeRemoto,
            code: prossimoCodiceSede(esistenti),
            isActive: true,
            licensedInVf: false,
            ...indirizzoDaShopify(remote),
            shopifySyncStatus: ShopifySyncStatus.synced,
            shopifyLastSyncAt: new Date(),
          },
          select: { id: true },
        });
        locationId = creata.id;
      }

      if (locationId) {
        const esito = await this.locationLink.collega(tx, {
          tenantId,
          locationId,
          shopifyLocationId,
        });
        if (esito.tipo === 'sede_di_altra_location') {
          throw new ConflictException('La sede è già collegata a un’altra location Shopify');
        }
        if (esito.tipo === 'location_di_altra_sede') {
          throw new ConflictException('La location è già collegata a un’altra sede VestiFlow');
        }
        if (esito.tipo === 'negozio_assente') {
          throw new UnprocessableEntityException(
            'La connessione non ha ancora l’identità del negozio: ricollega Shopify.',
          );
        }
      }

      if (scelta.choice === 'lascia') {
        // ⭐ Su una location COLLEGATA, «lascia» chiude il periodo (unlinked /
        //    operator) e azzera la cache della sede: una scelta che dice «fuori»
        //    non può convivere con una coppia attiva che gli ordini leggono.
        await this.locationLink.scollega(tx, { tenantId, shopifyLocationId });
      }

      await tx.shopifyLocationChoice.upsert({
        where: { tenantId_shopifyLocationId: { tenantId, shopifyLocationId } },
        update: { choice: scelta.choice, locationId, shopifyLocationName: nomeRemoto },
        create: {
          tenantId,
          shopifyLocationId,
          shopifyLocationName: nomeRemoto,
          choice: scelta.choice,
          locationId,
        },
      });

      // Una scelta nuova invalida l'anteprima, che le contava — se un percorso c'è
      // e non è ancora confermato.
      if (setup && setup.status !== ShopifySetupStatus.attivato && !setup.confirmedAt) {
        await tx.shopifySetup.update({
          where: { id: setup.id },
          data: { anteprima: Prisma.DbNull, anteprimaAt: null },
        });
      }
    });

    return this.stato(tenantId);
  }

  // ── Fase 3: l'anteprima ────────────────────────────────────────────────────

  /**
   * Calcola e SALVA l'anteprima: che cosa verrà creato o aggiornato, le sedi
   * coinvolte, le quantità attuali e previste, gli ambigui, i blocchi. Legge
   * Shopify e VestiFlow; non scrive altro che l'anteprima stessa.
   */
  async anteprima(tenantId: string): Promise<ShopifySetupDto> {
    const setup = await this.setupModificabile(tenantId);
    if (!setup.direction) {
      throw new UnprocessableEntityException('Scegli prima la direzione del trasferimento');
    }
    const locations = await this.locationsConScelte(tenantId);
    const daDecidere = locations.filter((l) => l.active && l.choice === null);
    const collegate = locations.filter(
      (l) => l.locationId !== null && l.choice !== ShopifyLocationChoiceKind.lascia,
    );
    const lasciate = locations.filter((l) => l.choice === ShopifyLocationChoiceKind.lascia);

    const blocchi: string[] = [];
    const connessione = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true },
    });
    if (connessione?.status !== ShopifyConnectionStatus.connected) {
      blocchi.push('La connessione Shopify non è attiva: ricollega il negozio.');
    }
    if (daDecidere.length > 0) {
      blocchi.push(
        `${daDecidere.length} location Shopify senza una scelta: collega, crea o lascia su Shopify.`,
      );
    }
    if (collegate.length === 0) {
      blocchi.push('Nessuna sede collegata: senza una sede le quantità non hanno dove andare.');
    }

    const catalogo = await this.analisiCatalogo(tenantId, setup.direction);
    const quantita = await this.anteprimaQuantita(
      tenantId,
      setup.direction,
      collegate,
      catalogo.nuoviRemoti,
    );
    // ⭐ Gli ordini ancora aperti: LETTURA di controllo, nessuna scrittura. Si
    //    acquisiscono all’attivazione, come impegni; qui si mostrano, con chi
    //    resterà fuori (senza sede, evaso in parte).
    const pendenti =
      connessione?.status === ShopifyConnectionStatus.connected
        ? await this.ordersPull.elencaOrdiniPendenti(tenantId)
        : [];
    const ordini = {
      aperti: pendenti.filter((o) => o.stato === 'aperto').length,
      parziali: pendenti.filter((o) => o.stato === 'parziale').length,
      senzaSede: pendenti.filter((o) => o.locationId === null).length,
      giaInVestiFlow: pendenti.filter((o) => o.giaInVestiFlow).length,
      elenco: pendenti.slice(0, 50).map((o) => ({
        shopifyOrderId: o.shopifyOrderId,
        nome: o.nome,
        stato: o.stato,
        righe: o.righe,
        sedeDeterminabile: o.locationId !== null,
        giaInVestiFlow: o.giaInVestiFlow,
      })),
    };

    const anteprima: ShopifySetupAnteprimaDto = {
      computedAt: new Date().toISOString(),
      direction: setup.direction,
      catalogo: catalogo.dto,
      sedi: {
        collegate: collegate.map((l) => ({
          locationId: l.locationId!,
          nome: l.locationName ?? '',
          shopifyLocationId: l.shopifyLocationId,
          shopifyName: l.name,
        })),
        lasciate: lasciate.map((l) => ({
          shopifyLocationId: l.shopifyLocationId,
          shopifyName: l.name,
        })),
        daDecidere: daDecidere.map((l) => ({
          shopifyLocationId: l.shopifyLocationId,
          shopifyName: l.name,
        })),
      },
      quantita,
      ordini,
      blocchi,
    };

    await this.prisma.shopifySetup.update({
      where: { id: setup.id },
      data: {
        anteprima: anteprima as unknown as Prisma.InputJsonValue,
        anteprimaAt: new Date(),
        status: ShopifySetupStatus.controllo,
      },
    });
    return this.stato(tenantId);
  }

  /**
   * Il catalogo dalle due parti: collegati, da importare / da pubblicare, e gli
   * AMBIGUI — stesso SKU dalle due parti senza collegamento (`docs/27` §4).
   * ⛔ Nessun collegamento si deduce da qui: si conta e si nomina.
   */
  async analisiCatalogo(
    tenantId: string,
    direction: ShopifySetupDirection,
  ): Promise<{
    dto: ShopifySetupAnteprimaDto['catalogo'];
    /** Id numerici dei prodotti remoti ambigui: da escludere dall'import. */
    ambiguiRemoti: ReadonlySet<string>;
    /** Id locali dei prodotti ambigui: da escludere dalla pubblicazione. */
    ambiguiLocali: ReadonlySet<string>;
    /** Prodotti remoti che l'import creerebbe (non collegati, non ambigui). */
    nuoviRemoti: readonly ShopifyAdminProduct[];
  }> {
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const remoti = await this.shopifyAdmin.listAllProducts(shopDomain, accessToken);
    const locali = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        shopifyProductId: true,
        shopifySyncEnabled: true,
        variants: {
          where: { deletedAt: null },
          select: { id: true, sku: true, shopifyVariantId: true },
        },
      },
    });

    const remotiCollegati = new Set(
      locali.map((p) => p.shopifyProductId).filter((id): id is string => Boolean(id)),
    );
    const varianteRemotaCollegata = new Set(
      locali.flatMap((p) => p.variants.map((v) => v.shopifyVariantId)).filter(Boolean),
    );
    const localePerSku = new Map<
      string,
      { productId: string; nome: string; variantId: string; collegata: boolean }
    >();
    for (const p of locali) {
      for (const v of p.variants) {
        const sku = v.sku?.trim();
        if (sku) {
          localePerSku.set(sku, {
            productId: p.id,
            nome: p.name,
            variantId: v.id,
            collegata: Boolean(v.shopifyVariantId) || Boolean(p.shopifyProductId),
          });
        }
      }
    }

    const ambigui: ShopifySetupAmbiguoDto[] = [];
    const ambiguiRemoti = new Set<string>();
    const ambiguiLocali = new Set<string>();
    for (const remoto of remoti) {
      if (remotiCollegati.has(String(remoto.id))) {
        continue;
      }
      for (const variante of remoto.variants) {
        const sku = variante.sku?.trim();
        if (!sku || varianteRemotaCollegata.has(String(variante.id))) {
          continue;
        }
        const locale = localePerSku.get(sku);
        if (locale && !locale.collegata && !ambiguiRemoti.has(String(remoto.id))) {
          ambiguiRemoti.add(String(remoto.id));
          ambiguiLocali.add(locale.productId);
          ambigui.push({
            sku,
            locale: { productId: locale.productId, nome: locale.nome },
            remoto: { shopifyProductId: String(remoto.id), titolo: remoto.title },
          });
        }
      }
    }

    const nuoviRemoti = remoti.filter(
      (r) => !remotiCollegati.has(String(r.id)) && !ambiguiRemoti.has(String(r.id)),
    );
    const daAggiornare = remoti.filter((r) => remotiCollegati.has(String(r.id))).length;
    const daPubblicare = locali.filter(
      (p) => !p.shopifyProductId && p.shopifySyncEnabled && !ambiguiLocali.has(p.id),
    ).length;

    return {
      dto: {
        remoti: remoti.length,
        locali: locali.length,
        collegati: remotiCollegati.size,
        daImportare:
          direction === ShopifySetupDirection.shopify_to_vestiflow ? nuoviRemoti.length : 0,
        daAggiornare: direction === ShopifySetupDirection.shopify_to_vestiflow ? daAggiornare : 0,
        daPubblicare: direction === ShopifySetupDirection.vestiflow_to_shopify ? daPubblicare : 0,
        ambigui,
      },
      ambiguiRemoti,
      ambiguiLocali,
      nuoviRemoti,
    };
  }

  /**
   * Shopify → VestiFlow: per ogni coppia (variante collegata × sede collegata)
   * la giacenza VestiFlow di adesso e quella FISICA di Shopify. Gli articoli
   * nuovi non hanno un «attuale»: si contano. VestiFlow → Shopify: solo il
   * numero di coppie (le quantità le decide Allinea, con le sue protezioni).
   */
  private async anteprimaQuantita(
    tenantId: string,
    direction: ShopifySetupDirection,
    collegate: readonly ShopifySetupLocationDto[],
    nuoviRemoti: readonly ShopifyAdminProduct[],
  ): Promise<ShopifySetupAnteprimaDto['quantita']> {
    const varianti = await this.prisma.productVariant.findMany({
      where: {
        tenantId,
        deletedAt: null,
        shopifyInventoryItemId: { not: null },
        product: { deletedAt: null },
      },
      select: {
        id: true,
        sku: true,
        optionValues: true,
        shopifyInventoryItemId: true,
        product: { select: { name: true } },
      },
    });
    const coppie = varianti.length * collegate.length;
    if (direction === ShopifySetupDirection.vestiflow_to_shopify) {
      return { coppie, righe: [], righeTotali: coppie, nonDeterminabili: [], articoliNuovi: 0 };
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const righe: ShopifySetupQuantitaRigaDto[] = [];
    const nonDeterminabili: ShopifySetupNonDeterminabileDto[] = [];
    let esaminate = 0;
    for (const variante of varianti) {
      const itemGid = gidArticoloInventario(variante.shopifyInventoryItemId);
      for (const sede of collegate) {
        if (esaminate >= RIGHE_ANTEPRIMA) {
          break;
        }
        esaminate += 1;
        const locationGid = gidSede(sede.shopifyLocationId)!;
        const livello = await this.prisma.inventoryLevel.findUnique({
          where: { variantId_locationId: { variantId: variante.id, locationId: sede.locationId! } },
          select: { onHand: true },
        });
        const attuale = livello?.onHand ?? 0;
        const base = {
          sku: variante.sku,
          articolo: variante.product.name,
          sede: sede.locationName ?? sede.name,
        };
        try {
          const remoto = await this.shopifyGraphql.getRemoteStockAtLocation(
            shopDomain,
            accessToken,
            itemGid!,
            locationGid,
          );
          if (!remoto.found) {
            nonDeterminabili.push({ ...base, motivo: remoto.reason });
            continue;
          }
          righe.push({
            ...base,
            variante: this.etichettaVariante(variante.optionValues),
            attuale,
            prevista: remoto.onHand,
            delta: remoto.onHand - attuale,
          });
        } catch (error: unknown) {
          this.logger.warn(
            `Anteprima quantità (${tenantId}): lettura fallita per ${variante.sku ?? variante.id} — ${error instanceof Error ? error.message : String(error)}`,
          );
          nonDeterminabili.push({ ...base, motivo: 'lettura_fallita' });
        }
      }
    }
    return {
      coppie,
      righe,
      righeTotali: coppie,
      nonDeterminabili,
      articoliNuovi: nuoviRemoti.length,
    };
  }

  private etichettaVariante(optionValues: unknown): string | null {
    if (!Array.isArray(optionValues) || optionValues.length === 0) {
      return null;
    }
    return (
      optionValues
        .map((v) =>
          v && typeof v === 'object' && 'value' in v ? String((v as { value: unknown }).value) : '',
        )
        .filter(Boolean)
        .join(' · ') || null
    );
  }

  // ── La conferma, la ripresa, l'attivazione ─────────────────────────────────

  /**
   * La conferma AVVIA il trasferimento e non lo dichiara riuscito: l'esito si
   * legge dallo stato, aggiornato a ogni passo. Idempotente: un trasferimento
   * già in corso non ne avvia un secondo.
   */
  async conferma(tenantId: string): Promise<ShopifySetupDto> {
    const setup = await this.prisma.shopifySetup.findUnique({ where: { tenantId } });
    if (!setup) {
      throw new NotFoundException('Nessun percorso di prima connessione per questa azienda');
    }
    const riprendibile =
      setup.status === ShopifySetupStatus.controllo ||
      setup.status === ShopifySetupStatus.interrotto;
    if (!riprendibile) {
      if (setup.status === ShopifySetupStatus.trasferimento) {
        return this.stato(tenantId);
      }
      throw new ConflictException(
        `Il percorso è nella fase «${setup.status}»: la conferma si dà dal controllo, o si riprende un trasferimento interrotto.`,
      );
    }
    const anteprima = setup.anteprima as ShopifySetupAnteprimaDto | null;
    if (setup.status === ShopifySetupStatus.controllo) {
      if (!anteprima) {
        throw new UnprocessableEntityException(
          'Calcola prima l’anteprima: la conferma autorizza ciò che hai visto.',
        );
      }
      if (anteprima.blocchi.length > 0) {
        throw new UnprocessableEntityException(anteprima.blocchi.join(' '));
      }
    }
    if (!setup.direction) {
      throw new UnprocessableEntityException('Scegli prima la direzione del trasferimento');
    }
    await this.transfer.avvia(tenantId, setup);
    return this.stato(tenantId);
  }

  /**
   * L'attivazione PARZIALE (`docs/24` §12.-1, quarta fase): i blocchi generali
   * la impediscono; gli esclusi restano esclusi; il resto parte.
   */
  async attiva(tenantId: string): Promise<ShopifySetupDto> {
    const setup = await this.prisma.shopifySetup.findUnique({ where: { tenantId } });
    if (!setup) {
      throw new NotFoundException('Nessun percorso di prima connessione per questa azienda');
    }
    if (setup.status === ShopifySetupStatus.attivato) {
      return this.stato(tenantId);
    }
    const blocchi = await this.blocchiAttivazione(tenantId, setup);
    if (blocchi.length > 0) {
      throw new UnprocessableEntityException(blocchi.join(' '));
    }
    // 1 · Gli ordini ancora APERTI diventano impegni (niente storico). Chi è
    //     senza sede o evaso in parte resta senza impegno e segnalato.
    const ordini = await this.ordersPull.acquisisciOrdiniPendenti(tenantId);
    // 2 · La BASE della sincronizzazione continua, coppia per coppia, con il
    //     motore di Allinea e le sue protezioni: dove il canale porta già il
    //     valore di VestiFlow non si scrive e la base nasce; dove no, da qui in
    //     poi vale VestiFlow — e la coppia non allineata resta nominata.
    const esclusiBase: ShopifySetupEsclusoDto[] = [];
    // ⛔ **L'allineamento NON parte se ci sono ordini aperti senza sede** — e
    //    l'attivazione (webhook, ordini) riesce lo stesso, separata. Misurato
    //    sul negozio vero il 13/09/2026: #1010 e #1011 senza sede, Shopify
    //    `committed` 6, VestiFlow 0 — allineare avrebbe scritto un Disponibile
    //    più alto di 6 e alzato l'on_hand remoto di pezzi già promessi. Nessuna
    //    compensazione, nessuna sede inventata: il motivo e l'azione vanno
    //    nell'esito, dove l'operatore li legge (decisione del proprietario).
    const senzaSede = await ordiniApertiSenzaSede(this.prisma, tenantId);
    const base: ShopifySetupAllineaDto =
      senzaSede.length > 0
        ? {
            totale: 0,
            allineate: 0,
            giaAllineate: 0,
            nonAllineate: 0,
            fermo: {
              motivo: motivoQuantitaFerma(senzaSede),
              ordini: senzaSede.map((o) => o.orderNumber),
            },
          }
        : await this.transfer.allineaPerimetro(tenantId, esclusiBase);
    if (base.fermo) {
      this.logger.warn(`Attivazione senza allineamento (${tenantId}): ${base.fermo.motivo}`);
    }
    // 3 · Le parti non risolte restano fuori dalla sincronizzazione.
    await this.transfer.escludiDallaSincronizzazione(tenantId, setup);
    // 4 · «Da qui in poi» per il recupero della sincronizzazione continua: gli id
    //     Shopify crescono con la creazione, nessun orologio.
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const ordersSinceId =
      (await this.shopifyAdmin.getLatestOrderId(shopDomain, accessToken)) ?? '0';
    const esitoPrecedente = (setup.esito as ShopifySetupEsitoDto | null) ?? null;
    const esito: ShopifySetupEsitoDto = {
      fase: 'concluso',
      startedAt: esitoPrecedente?.startedAt ?? new Date().toISOString(),
      finishedAt: esitoPrecedente?.finishedAt ?? new Date().toISOString(),
      interruzione: null,
      catalogo: esitoPrecedente?.catalogo ?? null,
      quantita: esitoPrecedente?.quantita ?? null,
      // ⭐ L'allineamento dell'attivazione è l'unico che il percorso conosce
      //    dopo il trasferimento: si scrive qui, fermo compreso.
      allinea: base,
      esclusi: [...(esitoPrecedente?.esclusi ?? []), ...esclusiBase],
      attivazione: {
        ordini: { ...ordini, falliti: ordini.falliti.length },
        base,
        ordersSinceId,
      },
    };
    // 5 · La sincronizzazione continua parte QUI, non alla connessione: i webhook
    //     si registrano adesso, e `recordWebhooksActivated` accende `autoSyncEnabled`.
    await this.shopifyOAuth.resyncWebhooks(tenantId);
    await this.prisma.shopifySetup.update({
      where: { id: setup.id },
      data: {
        status: ShopifySetupStatus.attivato,
        activatedAt: new Date(),
        ordersSinceId,
        esito: esito as unknown as Prisma.InputJsonValue,
      },
    });
    this.logger.log(`Prima connessione Shopify attivata (${tenantId})`);
    return this.stato(tenantId);
  }

  private async blocchiAttivazione(
    tenantId: string,
    setup: ShopifySetup,
  ): Promise<readonly string[]> {
    if (setup.status === ShopifySetupStatus.attivato) {
      return [];
    }
    const blocchi: string[] = [];
    if (setup.status !== ShopifySetupStatus.trasferito) {
      blocchi.push('Il trasferimento iniziale non è concluso: si attiva dopo il suo esito.');
    }
    const connessione = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true },
    });
    if (connessione?.status !== ShopifyConnectionStatus.connected) {
      blocchi.push('La connessione Shopify non è attiva.');
    }
    const collegate = await this.locationLink.sediCollegate(tenantId);
    if (collegate.length === 0) {
      blocchi.push(
        'Nessuna sede collegata: senza una sede utilizzabile la sincronizzazione non può partire.',
      );
    }
    return blocchi;
  }

  private async setupModificabile(tenantId: string): Promise<ShopifySetup> {
    const setup = await this.prisma.shopifySetup.findUnique({ where: { tenantId } });
    if (!setup) {
      throw new NotFoundException('Nessun percorso di prima connessione per questa azienda');
    }
    const modificabile =
      setup.status === ShopifySetupStatus.scelte ||
      setup.status === ShopifySetupStatus.sedi ||
      setup.status === ShopifySetupStatus.controllo;
    if (!modificabile) {
      throw new ConflictException('Le scelte non si cambiano dopo la conferma del trasferimento.');
    }
    return setup;
  }
}
