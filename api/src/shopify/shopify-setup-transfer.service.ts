import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import {
  AdjustmentDirection,
  MovementOrigin,
  Prisma,
  ShopifySetupDirection,
  ShopifySetupStatus,
  StockMovementType,
  type ShopifySetup,
} from '@prisma/client';

import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyInventoryAlignService } from './shopify-inventory-align.service';
import { gidArticoloInventario } from './shopify-link-history.service';
import { ShopifyLocationLinkService } from './shopify-location-link.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';
import { ShopifyProductPushService } from './shopify-product-push.service';
import type {
  ShopifySetupAnteprimaDto,
  ShopifySetupEsclusoDto,
  ShopifySetupEsitoDto,
} from './shopify-setup.model';

/** La causale dei movimenti della base iniziale: si legge nel registro movimenti. */
export const CAUSALE_PRIMA_CONNESSIONE = 'Prima connessione Shopify';

/**
 * ⭐ **IL TRASFERIMENTO INIZIALE** — dopo la conferma (`docs/27` §3).
 *
 * Riusa i motori che esistono: l'import catalogo (con gli ambigui esclusi), la
 * pubblicazione per articolo, Allinea per le quantità VestiFlow → Shopify. L'unica
 * cosa nuova è la **base iniziale** Shopify → VestiFlow: la giacenza FISICA di
 * Shopify scritta in VestiFlow con un movimento tracciato.
 *
 * ⛔ **Un trasferimento per tenant alla volta**, in memoria (come `pullCatalog`).
 *    L'avanzamento sta nell'esito JSON del setup, aggiornato a ogni passo; una
 *    eccezione non gestita porta lo stato a `interrotto` con l'esito parziale —
 *    **mai** a «trasferito».
 *
 * ⭐ **La ripresa non ripete gli effetti**: l'import è idempotente per GID, il
 *    push per identità, la base iniziale per `external_ref` del movimento
 *    (coppia × percorso), Allinea per riga.
 */
@Injectable()
export class ShopifySetupTransferService {
  private readonly logger = new Logger(ShopifySetupTransferService.name);
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly productPull: ShopifyProductPullService,
    private readonly productPush: ShopifyProductPushService,
    private readonly inventoryAlign: ShopifyInventoryAlignService,
    private readonly locationLink: ShopifyLocationLinkService,
  ) {}

  inCorso(tenantId: string): boolean {
    return this.inFlight.has(tenantId);
  }

  /**
   * Avvia (o riprende) il trasferimento e torna subito: chi chiama legge
   * l'avanzamento dallo stato. In test si può attendere con `attendi`.
   */
  async avvia(tenantId: string, setup: ShopifySetup): Promise<void> {
    if (this.inFlight.has(tenantId)) {
      return;
    }
    const correlationId = setup.correlationId ?? randomUUID();
    const now = new Date();
    await this.prisma.shopifySetup.update({
      where: { id: setup.id },
      data: {
        status: ShopifySetupStatus.trasferimento,
        correlationId,
        confirmedAt: setup.confirmedAt ?? now,
        transferStartedAt: setup.transferStartedAt ?? now,
        transferFinishedAt: null,
      },
    });
    const lavoro = this.esegui(tenantId, setup.id, setup.direction!, correlationId)
      .catch((error: unknown) => {
        // ⛔ Qui non deve mai uscire un'eccezione: lo stato lo dice `esegui`.
        this.logger.error(
          `Trasferimento iniziale (${tenantId}): errore non gestito — ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.inFlight.delete(tenantId);
      });
    this.inFlight.set(tenantId, lavoro);
  }

  /** Per le prove e per chi vuole aspettare la fine. */
  async attendi(tenantId: string): Promise<void> {
    await this.inFlight.get(tenantId);
  }

  private async esegui(
    tenantId: string,
    setupId: string,
    direction: ShopifySetupDirection,
    correlationId: string,
  ): Promise<void> {
    const precedente = (
      await this.prisma.shopifySetup.findUniqueOrThrow({
        where: { id: setupId },
        select: { esito: true },
      })
    ).esito as ShopifySetupEsitoDto | null;
    let esito: ShopifySetupEsitoDto = {
      fase: 'catalogo',
      startedAt: precedente?.startedAt ?? new Date().toISOString(),
      finishedAt: null,
      interruzione: null,
      catalogo: precedente?.catalogo ?? null,
      quantita: precedente?.quantita ?? null,
      allinea: precedente?.allinea ?? null,
      esclusi: [],
    };
    const salva = async (parziale: Partial<ShopifySetupEsitoDto>): Promise<void> => {
      esito = { ...esito, ...parziale };
      await this.prisma.shopifySetup.update({
        where: { id: setupId },
        data: { esito: esito as unknown as Prisma.InputJsonValue },
      });
    };

    try {
      const anteprima = (
        await this.prisma.shopifySetup.findUniqueOrThrow({
          where: { id: setupId },
          select: { anteprima: true },
        })
      ).anteprima as ShopifySetupAnteprimaDto | null;
      const esclusi: ShopifySetupEsclusoDto[] = [];
      for (const ambiguo of anteprima?.catalogo.ambigui ?? []) {
        esclusi.push({
          tipo: 'articolo',
          riferimento:
            direction === ShopifySetupDirection.shopify_to_vestiflow
              ? ambiguo.remoto.shopifyProductId
              : ambiguo.locale.productId,
          nome:
            direction === ShopifySetupDirection.shopify_to_vestiflow
              ? ambiguo.remoto.titolo
              : ambiguo.locale.nome,
          motivo: 'sku_ambiguo',
          dettaglio: `SKU ${ambiguo.sku} presente dalle due parti senza collegamento: non si importa, non si pubblica, non si collega per nome.`,
        });
      }
      await salva({ fase: 'catalogo', esclusi });

      if (direction === ShopifySetupDirection.shopify_to_vestiflow) {
        await this.catalogoDaShopify(tenantId, anteprima, esclusi, salva);
        await salva({ fase: 'quantita' });
        await this.baseInizialeDaShopify(tenantId, setupId, esclusi, salva);
      } else {
        await this.catalogoVersoShopify(tenantId, anteprima, esclusi, salva);
        await salva({ fase: 'quantita' });
        await this.quantitaVersoShopify(tenantId, esclusi, salva);
      }

      await salva({ fase: 'concluso', finishedAt: new Date().toISOString(), interruzione: null });
      await this.prisma.shopifySetup.update({
        where: { id: setupId },
        data: { status: ShopifySetupStatus.trasferito, transferFinishedAt: new Date() },
      });
      this.logger.log(`Trasferimento iniziale concluso (${tenantId}, ${correlationId})`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Trasferimento interrotto';
      this.logger.error(`Trasferimento iniziale interrotto (${tenantId}): ${message}`);
      await salva({
        interruzione: { at: new Date().toISOString(), message: message.slice(0, 300) },
      });
      await this.prisma.shopifySetup.update({
        where: { id: setupId },
        data: { status: ShopifySetupStatus.interrotto },
      });
    }
  }

  // ── Shopify → VestiFlow ────────────────────────────────────────────────────

  private async catalogoDaShopify(
    tenantId: string,
    anteprima: ShopifySetupAnteprimaDto | null,
    esclusi: ShopifySetupEsclusoDto[],
    salva: (p: Partial<ShopifySetupEsitoDto>) => Promise<void>,
  ): Promise<void> {
    const escludi = new Set(
      (anteprima?.catalogo.ambigui ?? []).map((a) => a.remoto.shopifyProductId),
    );
    const risultato = await this.productPull.pullCatalog(tenantId, { escludi });
    for (const fallito of risultato.failed) {
      esclusi.push({
        tipo: 'articolo',
        riferimento: fallito.shopifyProductId,
        nome: `Prodotto Shopify ${fallito.shopifyProductId}`,
        motivo: 'import_fallito',
        dettaglio: fallito.message,
      });
    }
    await salva({
      catalogo: {
        imported: risultato.imported,
        updated: risultato.updated,
        skipped: risultato.skipped,
        failed: risultato.failed.length,
        esclusiAmbigui: risultato.esclusiDalChiamante,
      },
      esclusi,
    });
  }

  /**
   * La base iniziale: per ogni coppia (variante collegata × sede collegata) la
   * giacenza FISICA di Shopify diventa la giacenza VestiFlow, con un movimento
   * di rettifica `origin: shopify`. Origine `canale`: non si rimanda indietro.
   *
   * ⭐ Idempotente per `external_ref` (coppia × percorso): alla ripresa una
   *    coppia già scritta si salta, anche se nel frattempo Shopify è cambiata —
   *    quel cambiamento appartiene alla sincronizzazione, non alla partenza.
   *
   * ⏸ La PRESA DELLA BASE (`shopify_inventory_sync_states`) e gli ordini aperti
   *    seguono la decisione sui tre casi (`docs/24` §12.-1, risposta 5): qui
   *    non si stabilisce nessuna base, e lo dice l'esito.
   */
  private async baseInizialeDaShopify(
    tenantId: string,
    setupId: string,
    esclusi: ShopifySetupEsclusoDto[],
    salva: (p: Partial<ShopifySetupEsitoDto>) => Promise<void>,
  ): Promise<void> {
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const sedi = await this.locationLink.sediCollegate(tenantId);
    const varianti = await this.prisma.productVariant.findMany({
      where: {
        tenantId,
        deletedAt: null,
        shopifyInventoryItemId: { not: null },
        product: { deletedAt: null, shopifySyncEnabled: true },
      },
      select: {
        id: true,
        sku: true,
        shopifyInventoryItemId: true,
        product: { select: { name: true } },
      },
    });
    const nomiSedi = new Map(
      (
        await this.prisma.location.findMany({
          where: { tenantId, id: { in: sedi.map((s) => s.locationId) } },
          select: { id: true, name: true },
        })
      ).map((s) => [s.id, s.name]),
    );

    let scritte = 0;
    let invariate = 0;
    let giaScritte = 0;
    let nonDeterminabili = 0;
    const coppie = varianti.length * sedi.length;
    await salva({ quantita: { coppie, scritte, invariate, giaScritte, nonDeterminabili } });

    for (const variante of varianti) {
      const itemGid = gidArticoloInventario(variante.shopifyInventoryItemId)!;
      for (const sede of sedi) {
        const externalRef = `prima-connessione:${setupId}:${variante.id}:${sede.locationId}`;
        // ⭐ La RIPRESA non assume che una base precedente sia ancora valida
        //    (proprietario, 12/09/2026): ogni coppia si rilegge e si scrive solo
        //    la DIFFERENZA — zero se niente è cambiato, quindi nessun doppione;
        //    un movimento tracciato se qualcosa si è mosso nel frattempo.
        const gia = await this.prisma.stockMovement.findFirst({
          where: { tenantId, externalRef },
          select: { id: true },
        });
        if (gia) {
          giaScritte += 1;
        }
        const remoto = await this.shopifyGraphql.getRemoteStockAtLocation(
          shopDomain,
          accessToken,
          itemGid,
          sede.gid,
        );
        if (!remoto.found) {
          nonDeterminabili += 1;
          esclusi.push({
            tipo: 'coppia',
            riferimento: `${variante.id}:${sede.locationId}`,
            nome: `${variante.product.name}${variante.sku ? ` (${variante.sku})` : ''} · ${nomiSedi.get(sede.locationId) ?? sede.locationId}`,
            motivo: remoto.reason,
            dettaglio: 'Quantità non determinabile su Shopify: la giacenza VestiFlow resta com’è.',
          });
          continue;
        }
        const esitoScrittura = await this.prisma.$transaction(async (tx) => {
          const livello = await tx.inventoryLevel.findUnique({
            where: {
              variantId_locationId: { variantId: variante.id, locationId: sede.locationId },
            },
            select: { onHand: true },
          });
          const attuale = livello?.onHand ?? 0;
          const delta = remoto.onHand - attuale;
          if (delta === 0) {
            // Garantisce la riga del livello anche a zero: la coppia esiste.
            await applyInventoryDelta(tx, tenantId, variante.id, sede.locationId, 0, 'canale');
            return 'invariata' as const;
          }
          await applyInventoryDelta(tx, tenantId, variante.id, sede.locationId, delta, 'canale');
          await tx.stockMovement.create({
            data: {
              tenantId,
              type: StockMovementType.adjustment,
              origin: MovementOrigin.shopify,
              variantId: variante.id,
              sku: variante.sku ?? '',
              locationId: sede.locationId,
              quantity: Math.abs(delta),
              direction: delta > 0 ? AdjustmentDirection.increase : AdjustmentDirection.decrease,
              reason: CAUSALE_PRIMA_CONNESSIONE,
              externalRef,
              createdByName: CAUSALE_PRIMA_CONNESSIONE,
            },
          });
          return 'scritta' as const;
        });
        if (esitoScrittura === 'scritta') {
          scritte += 1;
        } else {
          invariate += 1;
        }
        if ((scritte + invariate + nonDeterminabili) % 25 === 0) {
          await salva({
            quantita: { coppie, scritte, invariate, giaScritte, nonDeterminabili },
            esclusi,
          });
        }
      }
    }
    await salva({
      quantita: { coppie, scritte, invariate, giaScritte, nonDeterminabili },
      esclusi,
    });
  }

  // ── VestiFlow → Shopify ────────────────────────────────────────────────────

  private async catalogoVersoShopify(
    tenantId: string,
    anteprima: ShopifySetupAnteprimaDto | null,
    esclusi: ShopifySetupEsclusoDto[],
    salva: (p: Partial<ShopifySetupEsitoDto>) => Promise<void>,
  ): Promise<void> {
    const ambigui = new Set((anteprima?.catalogo.ambigui ?? []).map((a) => a.locale.productId));
    const daPubblicare = await this.prisma.product.findMany({
      where: { tenantId, deletedAt: null, shopifyProductId: null, shopifySyncEnabled: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const prodotto of daPubblicare) {
      if (ambigui.has(prodotto.id)) {
        skipped += 1;
        continue;
      }
      const risultato = await this.productPush.pushProduct(tenantId, prodotto.id);
      if (risultato.pushed) {
        imported += 1;
      } else {
        failed += 1;
        esclusi.push({
          tipo: 'articolo',
          riferimento: prodotto.id,
          nome: prodotto.name,
          motivo: risultato.reason ?? risultato.outcome,
          dettaglio: risultato.detail,
        });
      }
      if ((imported + skipped + failed) % 10 === 0) {
        await salva({
          catalogo: { imported, updated: 0, skipped, failed, esclusiAmbigui: skipped },
          esclusi,
        });
      }
    }
    await salva({
      catalogo: { imported, updated: 0, skipped, failed, esclusiAmbigui: skipped },
      esclusi,
    });
  }

  /**
   * Le quantità VestiFlow → Shopify sono il motore di Allinea, a blocchi fino
   * a fine giro: è la partenza controllata di `DA-FARE` §31.16, che stabilisce
   * la base delle coppie. Riusare il motore non confonde i due momenti.
   */
  private async quantitaVersoShopify(
    tenantId: string,
    esclusi: ShopifySetupEsclusoDto[],
    salva: (p: Partial<ShopifySetupEsitoDto>) => Promise<void>,
  ): Promise<void> {
    await this.allineaPerimetro(tenantId, esclusi, async (allinea) => {
      await salva({ allinea, esclusi });
    });
  }

  /**
   * ⭐ Il motore di Allinea su TUTTO il perimetro, a blocchi fino a fine giro,
   *    con le sue protezioni. Due chiamanti: il trasferimento V→S (le quantità
   *    VestiFlow salgono) e l’ATTIVAZIONE in entrambe le direzioni, dove
   *    stabilisce la BASE della sincronizzazione continua per ogni coppia
   *    preparata — «il canale porta già il valore di VestiFlow: non si
   *    scrive, ma la base si stabilisce» (`riallineaCoppia`). ⛔ Non è il
   *    pulsante «Allinea giacenze», che resta separato: è il suo motore.
   */
  async allineaPerimetro(
    tenantId: string,
    esclusi: ShopifySetupEsclusoDto[],
    avanzamento?: (allinea: NonNullable<ShopifySetupEsitoDto['allinea']>) => Promise<void>,
  ): Promise<NonNullable<ShopifySetupEsitoDto['allinea']>> {
    let da: { locationId: string; variantId: string } | undefined;
    let totale = 0;
    let allineate = 0;
    let giaAllineate = 0;
    let nonAllineate = 0;
    for (let giro = 0; giro < 10_000; giro += 1) {
      const blocco = await this.inventoryAlign.allinea(tenantId, da);
      totale = blocco.totale;
      allineate += blocco.allineate;
      giaAllineate += blocco.giaAllineate;
      nonAllineate += blocco.nonAllineate.length;
      for (const coppia of blocco.nonAllineate) {
        esclusi.push({
          tipo: 'coppia',
          riferimento: `${coppia.variantId}:${coppia.locationId}`,
          nome: `${coppia.articolo}${coppia.sku ? ` (${coppia.sku})` : ''} · ${coppia.sede}`,
          motivo: coppia.motivo,
          dettaglio: coppia.dettaglio,
        });
      }
      const riepilogo = { totale, allineate, giaAllineate, nonAllineate };
      if (avanzamento) {
        await avanzamento(riepilogo);
      }
      if (blocco.fine || !blocco.prossimo) {
        return riepilogo;
      }
      da = blocco.prossimo;
    }
    return { totale, allineate, giaAllineate, nonAllineate };
  }

  // ── L'attivazione parziale ─────────────────────────────────────────────────

  /**
   * Gli articoli LOCALI esclusi (pubblicazione fallita o SKU ambiguo, direzione
   * VestiFlow → Shopify) restano fuori dalla sincronizzazione con l'interruttore
   * esistente `shopifySyncEnabled`: «una riga non risolta non deve entrare nella
   * sincronizzazione per errore». ⚠️ Non hanno un remoto: spegnere l'interruttore
   * non archivia niente su Shopify. Si riaccende dalla scheda articolo.
   */
  async escludiDallaSincronizzazione(tenantId: string, setup: ShopifySetup): Promise<number> {
    if (setup.direction !== ShopifySetupDirection.vestiflow_to_shopify) {
      return 0;
    }
    const esito = setup.esito as ShopifySetupEsitoDto | null;
    const ids = (esito?.esclusi ?? [])
      .filter((e) => e.tipo === 'articolo')
      .map((e) => e.riferimento);
    if (ids.length === 0) {
      return 0;
    }
    const risultato = await this.prisma.product.updateMany({
      where: { tenantId, id: { in: ids }, shopifyProductId: null },
      data: { shopifySyncEnabled: false },
    });
    return risultato.count;
  }
}
