import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  MovementOrigin,
  Prisma,
  StockMovementType,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { DocumentSettingsService } from '../documents/document-settings.service';
import { formatDocumentReference } from '../documents/document-totals.util';
import {
  defaultCounterSeries,
  lockDocumentCounter,
  nextDocumentNumber,
} from '../documents/document-numbering.util';
import { persistDocumentLinesByIdTx } from '../documents/document-line-upsert.util';
import { syncUnloadLineMovements } from '../documents/document-stock-unload-sync.util';
import { preservedLineVat } from '../documents/document-line-vat-snapshot.util';
import { applyInventoryDelta } from '../inventory/inventory-level-delta.util';
import {
  frozenTotalCostMinor,
  originalSaleUnitCostMinor,
} from '../inventory/movement-cost.util';
import {
  INVENTORY_VIEW_SCOPE_MODE,
  resolveOperationalLocationScope,
} from '../inventory/licensed-location-scope.util';
import { assertUserCanAccessLocation } from '../inventory/user-location-scope.util';
import { partyDisplayName } from '../common/party/party.util';
import { PrismaService } from '../prisma/prisma.service';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import {
  computeVatLineAmounts,
  vatInputFromLegacyRate,
  vatInputFromVatCode,
  type VatComputationInput,
} from '../vat/vat-line-calculation.util';
import { buildVatCodeSnapshot, vatSnapshotRatePercent } from '../vat/vat-snapshot.util';

import type { CreateStoreReturnDto } from './dto/create-store-return.dto';
import type { CreateStoreSaleDto } from './dto/create-store-sale.dto';

/** Esito della registrazione vendita/reso per la UI di cassa. */
export interface StoreSaleResult {
  readonly id: string;
  readonly reference: string;
  readonly documentDate: string;
  readonly totalMinor: number;
  readonly currency: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly description: string;
    readonly quantity: number;
    readonly remainingAvailable: number;
  }[];
}

interface ResolvedVariant {
  readonly id: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly productName: string;
  readonly optionSummary: string;
  readonly defaultVatCodeId: string | null;
  /** Costo effettivo corrente: congelato sul movimento di vendita. */
  readonly purchasePriceMinor: number | null;
}

/**
 * Cassa negozio (fase 3 §7-§9): Vendita in negozio immediata non fiscale e
 * Reso vendita negozio. La vendita NON crea Ordine cliente né impegni: alla
 * conclusione crea il documento confermato + un movimento `sale` per riga
 * nella stessa transazione. Policy quantità post-audit §3: la disponibilità
 * insufficiente NON blocca mai la vendita (Giacenza/Disponibile possono
 * andare negative); l'avviso non bloccante è responsabilità della UI.
 */
@Injectable()
export class StoreSalesService {
  private readonly logger = new Logger(StoreSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: DocumentSettingsService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  /**
   * Registra una vendita al banco, o ne RISALVA una esistente (`dto.id`).
   *
   * Creazione e modifica nello stesso metodo, distinte solo da `dto.id`: è la
   * forma dell'Arrivo merce (`saveGoodsReceipt`), l'unico altro documento che
   * sta fuori dal percorso generico e si modifica lo stesso. Sta qui perché la
   * conoscenza è qui — IVA per riga, metodo di pagamento, prezzi mostrati
   * ivati, costo congelato — non perché la cassa abbia un dominio suo.
   *
   * ⛔ Tutto il resto è delegato ai pezzi comuni del dominio documenti:
   * l'upsert righe per id, la riconciliazione dei movimenti per differenza, il
   * costo congelato. Questo metodo è un ADATTATORE, non una terza
   * implementazione.
   *
   * ⚠️ In modifica si CONSERVA (`11` A2, `regole-gestionale` → «la riga di un
   * documento è una fotografia»): numero, serie, riferimento, data documento, e
   * per ogni riga già esistente descrizione, SKU e snapshot IVA.
   */
  async createSale(
    tenantId: string,
    dto: CreateStoreSaleDto,
    user: UserProfileDto,
  ): Promise<StoreSaleResult> {
    assertUserCanAccessLocation(user, dto.locationId);
    await this.assertLocationExists(tenantId, dto.locationId);

    const existing = dto.id
      ? await this.loadEditableStoreDocument(tenantId, dto.id, DocumentType.store_sale)
      : null;

    const variants = await this.resolveVariants(
      tenantId,
      dto.lines.map((line) => line.variantId),
    );
    const vatContext = await this.resolveVatContext(tenantId, dto.lines, variants);

    const customerName = dto.customerId
      ? await this.snapshotCustomerName(tenantId, dto.customerId)
      : null;

    // La data si fissa alla CREAZIONE e non si muove più: il Registro
    // Corrispettivi filtra e raggruppa su di essa, e una vendita di marzo
    // corretta ad agosto cambierebbe due periodi invece di correggerne uno.
    const documentDate = existing
      ? existing.documentDate
      : dto.documentDate
        ? new Date(dto.documentDate)
        : new Date();
    const setting = await this.settings.getResolved(tenantId, DocumentType.store_sale);
    const actor = {
      createdById: user.id,
      createdByName: user.displayName?.trim() || 'Utente',
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const year = documentDate.getFullYear();
      // Numero e serie si assegnano SOLO alla nascita. In modifica restano
      // quelli: il riferimento è dentro la causale dei movimenti già scritti, e
      // rifarlo li scollegherebbe da ciò che l'operatore legge.
      // La serie e' opzionale nello schema: `defaultCounterSeries` puo' non
      // trovarne una, ed e' un caso legittimo — non si forza a stringa.
      let nuovaNumerazione: { series: string | null; number: number } | null = null;
      if (!existing) {
        const series = await defaultCounterSeries(tx, tenantId, DocumentType.store_sale);
        // Due casse che battono nello stesso istante leggono lo stesso massimo e
        // una delle due si becca il vincolo unico a scontrino finito: il lock
        // transazionale le serializza. Va preso PRIMA di leggere il massimo.
        await lockDocumentCounter(tx, { tenantId, type: DocumentType.store_sale, series });
        const number = await nextDocumentNumber({
          tx,
          tenantId,
          type: DocumentType.store_sale,
          series,
          source: 'document',
        });
        nuovaNumerazione = { series, number };
      }
      const reference =
        existing?.reference ??
        formatDocumentReference(
          setting.numberPrefix,
          nuovaNumerazione!.series,
          nuovaNumerazione!.number,
        );

      const existingLinesById = new Map((existing?.lines ?? []).map((line) => [line.id, line]));
      const existingVatById = new Map(
        (existing?.lines ?? []).map((line) => [
          line.id,
          { vatCodeId: line.vatCodeId, vatSnapshot: line.vatSnapshot },
        ]),
      );

      // Il prezzo che arriva dalla cassa è NETTO, come ogni prezzo del
      // gestionale: l'IVA si calcola qui, riga per riga, all'aliquota del
      // Codice IVA risolto. Quello che il cliente paga è il risultato del
      // calcolo, non un numero letto da una colonna.
      const computedLines = dto.lines.map((line, index) => {
        const variant = variants.get(line.variantId)!;
        const discountPercent = line.discountPercent ?? 0;
        const previous = line.id ? existingLinesById.get(line.id) : undefined;

        // ⛔ Riga GIÀ ESISTENTE senza `vatCodeId` dichiarato: lo snapshot IVA non
        // si rifotografa. Stessa regola del percorso generico, stesso motivo —
        // se domani cambia l'aliquota di un Codice IVA, questa vendita non
        // cambia. Gli importi si rifanno lo stesso, perché dipendono da
        // quantità, prezzo e sconto.
        const resolvedVat =
          preservedLineVat(previous?.id, line.vatCodeId, existingVatById) ??
          this.resolveLineVatCode(line.vatCodeId, variant, vatContext);

        const amounts = computeVatLineAmounts({
          enteredUnitCostMinor: line.unitPriceMinor,
          // Il valore memorizzato è netto: nessuno scorporo da fare.
          costEntryMode: 'vat_excluded',
          quantity: line.quantity,
          discountPercent,
          vat: resolvedVat.vat,
        });
        return {
          id: previous?.id,
          lineNumber: index + 1,
          variantId: variant.id,
          // ⛔ Descrizione e SKU sono la FOTOGRAFIA dell'operazione: su una riga
          // già esistente restano quelli scritti allora. Rinominare il prodotto
          // in anagrafica non riscrive una vendita di marzo.
          sku: previous?.sku ?? variant.sku,
          description: previous?.description ?? this.lineDescription(variant),
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent,
          vatCodeId: resolvedVat.vatCodeId,
          vatSnapshot: resolvedVat.vatSnapshot,
          lineTotalMinor: amounts.lineNetMinor,
          lineVatTotalMinor: amounts.lineVatMinor,
          lineGrossTotalMinor: amounts.lineGrossMinor,
          loadsStock: true,
        };
      });

      const subtotalMinor = computedLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
      const taxMinor = computedLines.reduce((sum, line) => sum + line.lineVatTotalMinor, 0);
      const totalMinor = computedLines.reduce((sum, line) => sum + line.lineGrossTotalMinor, 0);

      const header = {
        notes: dto.notes?.trim() || null,
        customerId: dto.customerId ?? null,
        customerName,
        locationId: dto.locationId,
        paymentMethod: dto.paymentMethod,
        // Testo libero solo per «Altro»: per cash/card resta null.
        paymentMethodNote:
          dto.paymentMethod === 'other' ? dto.paymentMethodNote?.trim() || null : null,
        subtotalMinor,
        taxMinor,
        totalMinor,
      };

      let doc;
      if (existing) {
        // Upsert per id dal dominio documenti: l'identità della riga è ciò che
        // consente di aggiornare il movimento collegato invece di duplicarlo.
        await persistDocumentLinesByIdTx(tx, {
          tenantId,
          documentId: existing.id,
          existingLineIds: existing.lines.map((line) => line.id),
          lines: computedLines,
          toData: (line) => ({
            lineNumber: line.lineNumber,
            variantId: line.variantId,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            discountPercent: line.discountPercent,
            vatCodeId: line.vatCodeId,
            vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
            lineTotalMinor: line.lineTotalMinor,
            lineVatTotalMinor: line.lineVatTotalMinor,
            lineGrossTotalMinor: line.lineGrossTotalMinor,
            loadsStock: line.loadsStock,
          }),
        });
        doc = await tx.document.update({
          where: { id: existing.id },
          data: header,
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        });
      } else {
        doc = await tx.document.create({
          data: {
            tenantId,
            type: DocumentType.store_sale,
            // Creato già confermato: la cassa non ha bozze (§7).
            status: DocumentStatus.confirmed,
            series: nuovaNumerazione!.series,
            number: nuovaNumerazione!.number,
            year,
            reference,
            documentDate,
            registrationDate: documentDate,
            printTitle: setting.printTitle,
            internalComment:
              'Registrazione interna della vendita. Lo scontrino fiscale viene emesso sulla cassa esterna.',
            currency: 'EUR',
            // Al banco i prezzi si leggono ivati: è come li mostra la cassa
            // all'operatore e al cliente. È una nota di visualizzazione — non
            // entra in nessun calcolo, che parte sempre dal netto memorizzato.
            pricesIncludeVat: true,
            confirmedAt: new Date(),
            createdById: actor.createdById,
            createdByName: actor.createdByName,
            ...header,
            lines: {
              create: computedLines.map(({ id: _id, ...line }) => ({
                ...line,
                tenantId,
                vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
              })),
            },
          },
          include: { lines: { orderBy: { lineNumber: 'asc' } } },
        });
      }

      // Un movimento per riga, aggiornato in posto — mai accodato. Il motore è
      // quello comune: qui si passano solo l'origine e il costo, che sono i due
      // parametri che la cassa ha in più. Da 2 pezzi a 1 il movimento diventa
      // −1, e non compare nessuna rettifica.
      await syncUnloadLineMovements(tx, {
        tenantId,
        documentId: doc.id,
        documentType: DocumentType.store_sale,
        locationId: dto.locationId,
        reason: `Vendita al banco ${reference}`,
        // Il movimento porta la data del documento, non quella della correzione.
        movementDate: documentDate,
        origin: MovementOrigin.vestiflow_pos,
        // Costo di record congelato: il costo effettivo della variante ORA (§A).
        // Vale solo per le righe NUOVE — una riga già presente tiene il proprio,
        // o correggere una vendita di marzo la rivaluterebbe al costo di agosto.
        unitCostForNewLine: (line) => variants.get(line.variantId)?.purchasePriceMinor ?? null,
        lines: doc.lines,
        actor,
      });

      return doc;
    });

    this.pushInventoryAsync(
      tenantId,
      created.lines.map((line) => line.variantId!),
      dto.locationId,
    );

    return this.toResult(tenantId, dto.locationId, created);
  }

  /**
   * Carica il documento di cassa da risalvare, imponendo tenant e tipo.
   *
   * ⛔ Il tipo entra nel `where`, non in un controllo dopo: un id di un altro
   * tipo documento non deve poter essere aggiornato passando da qui, e la
   * garanzia la dà la query invece di un `if` che qualcuno può spostare.
   */
  private async loadEditableStoreDocument(
    tenantId: string,
    id: string,
    type: DocumentType,
  ): Promise<{
    readonly id: string;
    readonly series: string | null;
    readonly number: number | null;
    readonly reference: string | null;
    readonly documentDate: Date;
    readonly lines: readonly {
      readonly id: string;
      readonly sku: string | null;
      readonly description: string;
      readonly vatCodeId: string | null;
      readonly vatSnapshot: Prisma.JsonValue;
    }[];
  }> {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId, type },
      select: {
        id: true,
        series: true,
        number: true,
        reference: true,
        documentDate: true,
        status: true,
        lines: {
          select: {
            id: true,
            sku: true,
            description: true,
            vatCodeId: true,
            vatSnapshot: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
    if (!doc) {
      throw new NotFoundException('Documento non trovato.');
    }
    if (doc.status === DocumentStatus.cancelled) {
      throw new ConflictException('Un documento annullato non si modifica.');
    }
    return doc;
  }

  async createReturn(
    tenantId: string,
    dto: CreateStoreReturnDto,
    user: UserProfileDto,
  ): Promise<StoreSaleResult> {
    assertUserCanAccessLocation(user, dto.locationId);
    await this.assertLocationExists(tenantId, dto.locationId);

    const variants = await this.resolveVariants(
      tenantId,
      dto.lines.map((line) => line.variantId),
    );
    // Righe di reso senza Codice IVA proprio: la risoluzione parte dall'articolo.
    const vatContext = await this.resolveVatContext(tenantId, [], variants);

    let saleReference: string | null = null;
    if (dto.saleDocumentId) {
      const sale = await this.prisma.document.findFirst({
        where: { id: dto.saleDocumentId, tenantId, type: DocumentType.store_sale },
        select: { reference: true },
      });
      if (!sale) {
        throw new NotFoundException('Vendita al banco origine non trovata.');
      }
      saleReference = sale.reference;
    }

    const documentDate = new Date();
    const setting = await this.settings.getResolved(tenantId, DocumentType.store_return);
    const actor = {
      createdById: user.id,
      createdByName: user.displayName?.trim() || 'Utente',
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const year = documentDate.getFullYear();
      const series = await defaultCounterSeries(tx, tenantId, DocumentType.store_return);
      // Come la vendita: il contatore dei resi è condiviso fra le casse, e il
      // lock transazionale serializza chi lo legge. Prima della lettura.
      await lockDocumentCounter(tx, { tenantId, type: DocumentType.store_return, series });
      const number = await nextDocumentNumber({
        tx,
        tenantId,
        type: DocumentType.store_return,
        series,
        source: 'document',
      });
      const reference = formatDocumentReference(setting.numberPrefix, series, number);

      // Il reso rende quello che la vendita ha incassato: stesso prezzo netto,
      // stessa IVA calcolata allo stesso modo. Prima l'imposta non veniva
      // scorporata affatto (`taxMinor: 0`) e il reso non tornava con la vendita.
      const computedLines = dto.lines.map((line, index) => {
        const variant = variants.get(line.variantId)!;
        const unitPriceMinor = line.unitPriceMinor ?? 0;
        // Il reso non sceglie un Codice IVA: prende quello dell'articolo.
        const resolved = this.resolveLineVatCode(null, variant, vatContext);
        const amounts = computeVatLineAmounts({
          enteredUnitCostMinor: unitPriceMinor,
          costEntryMode: 'vat_excluded',
          quantity: line.quantity,
          discountPercent: 0,
          vat: resolved.vat,
        });
        return {
          lineNumber: index + 1,
          variantId: variant.id,
          sku: variant.sku,
          description: `${this.lineDescription(variant)}${line.restockable ? '' : ' — non vendibile'}`,
          quantity: line.quantity,
          unitPriceMinor,
          vatCodeId: resolved.vatCodeId,
          vatSnapshot: resolved.vatSnapshot,
          lineTotalMinor: amounts.lineNetMinor,
          lineVatTotalMinor: amounts.lineVatMinor,
          lineGrossTotalMinor: amounts.lineGrossMinor,
          // loadsStock traccia lo stato vendibile: solo la merce che rientra
          // realmente tra le quantità disponibili genera il movimento (§9).
          loadsStock: line.restockable,
        };
      });

      const subtotalMinor = computedLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
      const taxMinor = computedLines.reduce((sum, line) => sum + line.lineVatTotalMinor, 0);
      const totalMinor = computedLines.reduce((sum, line) => sum + line.lineGrossTotalMinor, 0);

      const doc = await tx.document.create({
        data: {
          tenantId,
          type: DocumentType.store_return,
          status: DocumentStatus.confirmed,
          series,
          number,
          year,
          reference,
          documentDate,
          registrationDate: documentDate,
          printTitle: setting.printTitle,
          notes: dto.notes?.trim() || null,
          internalComment: `Causale reso: ${dto.reason.trim()}`,
          locationId: dto.locationId,
          sourceDocumentId: dto.saleDocumentId ?? null,
          currency: 'EUR',
          subtotalMinor,
          taxMinor,
          totalMinor,
          // Come la vendita: nota di come si leggono i prezzi al banco, non un
          // parametro di calcolo.
          pricesIncludeVat: true,
          confirmedAt: new Date(),
          createdById: actor.createdById,
          createdByName: actor.createdByName,
          lines: {
            create: computedLines.map((line) => ({
              ...line,
              tenantId,
              vatSnapshot: line.vatSnapshot ?? Prisma.DbNull,
            })),
          },
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });

      const saleSuffix = saleReference ? ` — vendita ${saleReference}` : '';
      for (const line of doc.lines) {
        if (!line.loadsStock) {
          // Merce non vendibile: documentata ma NESSUN carico (§9).
          continue;
        }
        await applyInventoryDelta(tx, tenantId, line.variantId!, dto.locationId, line.quantity);
        // Il reso inverte la vendita: usa il costo congelato sulla vendita
        // originale (§③), non quello corrente. Fallback: costo variante.
        const unitCostMinor = await originalSaleUnitCostMinor(
          tx,
          tenantId,
          dto.saleDocumentId ?? null,
          line.variantId!,
          [StockMovementType.sale],
          variants.get(line.variantId!)?.purchasePriceMinor ?? null,
        );
        await tx.stockMovement.create({
          data: {
            tenantId,
            type: StockMovementType.return,
            origin: MovementOrigin.vestiflow_pos,
            variantId: line.variantId!,
            sku: line.sku ?? '',
            locationId: dto.locationId,
            quantity: line.quantity,
            reason: `Reso vendita al banco ${reference}${saleSuffix}: ${dto.reason.trim()}`,
            externalRef: doc.id,
            sourceDocumentType: DocumentType.store_return,
            sourceDocumentId: doc.id,
            sourceLineId: line.id,
            unitCostMinor,
            totalCostMinor: frozenTotalCostMinor(unitCostMinor, line.quantity),
            createdById: actor.createdById,
            createdByName: actor.createdByName,
          },
        });
      }

      return doc;
    });

    this.pushInventoryAsync(
      tenantId,
      created.lines.filter((line) => line.loadsStock).map((line) => line.variantId!),
      dto.locationId,
    );

    return this.toResult(tenantId, dto.locationId, created);
  }

  /** Vendite negozio recenti per collegare un reso (ricerca per riferimento). */
  async listRecentSales(
    tenantId: string,
    search: string | undefined,
    user: UserProfileDto,
  ): Promise<
    readonly {
      id: string;
      reference: string | null;
      documentDate: Date;
      totalMinor: number;
      customerName: string | null;
      lines: readonly {
        variantId: string | null;
        sku: string | null;
        description: string;
        quantity: number;
        /** Prezzo unitario NETTO della riga venduta. */
        unitPriceMinor: number;
        /** Aliquota della riga: serve alla cassa per mostrare il prezzo ivato. */
        vatRatePercent: number | null;
      }[];
    }[]
  > {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      undefined,
      INVENTORY_VIEW_SCOPE_MODE,
    );
    if (!scope) {
      return [];
    }

    const docs = await this.prisma.document.findMany({
      where: {
        tenantId,
        type: DocumentType.store_sale,
        locationId: scope.length === 1 ? scope[0] : { in: [...scope] },
        ...(search
          ? {
              OR: [
                { reference: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { lines: { some: { sku: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        reference: true,
        documentDate: true,
        totalMinor: true,
        customerName: true,
        lines: {
          select: {
            variantId: true,
            sku: true,
            description: true,
            quantity: true,
            unitPriceMinor: true,
            vatSnapshot: true,
          },
          orderBy: { lineNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    // L'aliquota si legge dallo snapshot salvato sulla riga, non dal Codice IVA
    // di oggi: un reso deve tornare con la vendita anche se l'aliquota è
    // cambiata nel frattempo.
    return docs.map((doc) => ({
      ...doc,
      lines: doc.lines.map(({ vatSnapshot, ...line }) => ({
        ...line,
        // Prezzo netto a sei decimali verso la cassa (che mostra il lordo).
        unitPriceMinor: Number(line.unitPriceMinor),
        vatRatePercent: vatSnapshotRatePercent(vatSnapshot),
      })),
    }));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async assertLocationExists(tenantId: string, locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId, isActive: true, licensedInVf: true },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location non trovata o non operativa.');
    }
  }

  private async resolveVariants(
    tenantId: string,
    variantIds: readonly string[],
  ): Promise<Map<string, ResolvedVariant>> {
    const unique = [...new Set(variantIds)];
    const rows = await this.prisma.productVariant.findMany({
      where: { tenantId, id: { in: unique } },
      select: {
        id: true,
        sku: true,
        barcode: true,
        optionValues: true,
        purchasePriceMinor: true,
        product: {
          select: { name: true, defaultVatCodeId: true },
        },
      },
    });
    const map = new Map<string, ResolvedVariant>(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          sku: row.sku ?? '',
          barcode: row.barcode,
          productName: row.product.name,
          optionSummary: this.optionSummary(row.optionValues),
          defaultVatCodeId: row.product.defaultVatCodeId,
          purchasePriceMinor: row.purchasePriceMinor,
        },
      ]),
    );
    const missing = unique.filter((id) => !map.has(id));
    if (missing.length > 0) {
      throw new NotFoundException('Una o più varianti non sono state trovate.');
    }
    return map;
  }

  /**
   * Precarica i Codici IVA necessari a risolvere le righe del carrello
   * (§Piano IVA fase 2): predefinito per articolo (variante → prodotto),
   * override esplicito di riga, predefinito aziendale come fallback finale.
   */
  private async resolveVatContext(
    tenantId: string,
    // Serve solo l'eventuale Codice IVA di riga: vale per le righe di vendita
    // come per quelle di reso, che ne hanno una forma più corta.
    lines: readonly { readonly vatCodeId?: string | null }[],
    variants: ReadonlyMap<string, ResolvedVariant>,
  ): Promise<{
    readonly vatCodesById: ReadonlyMap<string, VatCodeWithNature>;
    readonly tenantDefaultVatCodeId: string | null;
  }> {
    const tenantSettings = await this.prisma.tenantFeatureSettings.findUnique({
      where: { tenantId },
      select: { defaultVatCodeId: true },
    });
    const tenantDefaultVatCodeId = tenantSettings?.defaultVatCodeId ?? null;

    const idsToFetch = new Set<string>();
    for (const line of lines) {
      if (line.vatCodeId) idsToFetch.add(line.vatCodeId);
    }
    for (const variant of variants.values()) {
      if (variant.defaultVatCodeId) idsToFetch.add(variant.defaultVatCodeId);
    }
    if (tenantDefaultVatCodeId) idsToFetch.add(tenantDefaultVatCodeId);

    const vatCodesById = new Map<string, VatCodeWithNature>();
    if (idsToFetch.size > 0) {
      const found = await this.prisma.vatCode.findMany({
        where: { tenantId, id: { in: [...idsToFetch] }, deletedAt: null },
        include: { nature: true },
      });
      for (const vatCode of found) {
        vatCodesById.set(vatCode.id, vatCode);
      }
    }
    return { vatCodesById, tenantDefaultVatCodeId };
  }

  /** Precedenza: override esplicito di riga > predefinito articolo > predefinito aziendale. */
  private resolveLineVatCode(
    /** Codice IVA scelto sulla riga; le righe di reso non ne hanno uno. */
    lineVatCodeId: string | null | undefined,
    variant: ResolvedVariant,
    vatContext: {
      readonly vatCodesById: ReadonlyMap<string, VatCodeWithNature>;
      readonly tenantDefaultVatCodeId: string | null;
    },
  ): {
    readonly vatCodeId: string | null;
    readonly vatSnapshot: Prisma.InputJsonObject | null;
    readonly vatRatePercent: number | null;
    /** Dati di calcolo della riga: senza Codice IVA, nessuna imposta. */
    readonly vat: VatComputationInput;
  } {
    const resolvedId =
      lineVatCodeId ?? variant.defaultVatCodeId ?? vatContext.tenantDefaultVatCodeId;
    const vatCode = resolvedId ? (vatContext.vatCodesById.get(resolvedId) ?? null) : null;
    if (!vatCode) {
      return {
        vatCodeId: null,
        vatSnapshot: null,
        vatRatePercent: null,
        vat: vatInputFromLegacyRate(null),
      };
    }
    return {
      vatCodeId: vatCode.id,
      vatSnapshot: buildVatCodeSnapshot(vatCode),
      vatRatePercent: Math.round(Number(vatCode.ratePercent)),
      vat: vatInputFromVatCode(vatCode),
    };
  }

  private optionSummary(optionValues: Prisma.JsonValue): string {
    if (!Array.isArray(optionValues)) {
      return '';
    }
    const parts = optionValues
      .map((entry) =>
        entry && typeof entry === 'object' && 'value' in entry
          ? String((entry as { value: unknown }).value)
          : null,
      )
      .filter((value): value is string => !!value);
    return parts.join(' / ');
  }

  private lineDescription(variant: ResolvedVariant): string {
    return variant.optionSummary
      ? `${variant.productName} — ${variant.optionSummary}`
      : variant.productName;
  }

  private pushInventoryAsync(
    tenantId: string,
    variantIds: readonly string[],
    locationId: string,
  ): void {
    for (const variantId of new Set(variantIds)) {
      void Promise.resolve(
        this.channelSync.pushInventoryLevels(tenantId, variantId, [locationId]),
      ).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Push inventario canali fallito';
        this.logger.warn(`Push inventario post-vendita negozio (${tenantId}): ${message}`);
      });
    }
  }

  private async toResult(
    tenantId: string,
    locationId: string,
    doc: {
      id: string;
      reference: string | null;
      documentDate: Date;
      totalMinor: number;
      currency: string;
      lines: readonly {
        variantId: string | null;
        sku: string | null;
        description: string;
        quantity: number;
      }[];
    },
  ): Promise<StoreSaleResult> {
    const variantIds = doc.lines
      .map((line) => line.variantId)
      .filter((id): id is string => id != null);
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { tenantId, locationId, variantId: { in: variantIds } },
      select: { variantId: true, available: true },
    });
    const availableByVariant = new Map(levels.map((level) => [level.variantId, level.available]));

    return {
      id: doc.id,
      reference: doc.reference ?? '',
      documentDate: doc.documentDate.toISOString(),
      totalMinor: doc.totalMinor,
      currency: doc.currency,
      lines: doc.lines.map((line) => ({
        sku: line.sku ?? '',
        description: line.description,
        quantity: line.quantity,
        remainingAvailable: line.variantId ? (availableByVariant.get(line.variantId) ?? 0) : 0,
      })),
    };
  }

  private async snapshotCustomerName(tenantId: string, customerId: string): Promise<string | null> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { party: true },
    });
    if (!customer) {
      throw new NotFoundException('Cliente non trovato.');
    }
    return partyDisplayName(customer.party) || null;
  }
}
