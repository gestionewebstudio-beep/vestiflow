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
import { syncGoodsReceiptLineMovements } from '../documents/document-goods-receipt-sync.util';
import { syncUnloadLineMovements } from '../documents/document-stock-unload-sync.util';
import { preservedLineVat } from '../documents/document-line-vat-snapshot.util';

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
 * Modulo del banco (fase 3 §7-§9): Vendita al banco immediata non fiscale e
 * Reso al banco. La vendita NON crea Ordine cliente né impegni: alla
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
    // Tenant e tipo sono già imposti da loadEditableStoreDocument (query, non
    // un `if` dopo). Qui manca la sede: la si carica PRIMA di autorizzare
    // qualunque cosa, perché in modifica ci sono DUE sedi da controllare, non
    // una — vedi il commento su authorizeStoreDocumentLocations.
    const existing = dto.id
      ? await this.loadEditableStoreDocument(tenantId, dto.id, DocumentType.store_sale)
      : null;
    this.authorizeStoreDocumentLocations(user, existing?.locationId ?? null, dto.locationId);
    await this.assertLocationExists(tenantId, dto.locationId);

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
        // ⛔ La SEDE, quarto argomento (T7A). Senza, il filtro dei contatori
        // resta `OR: [{ locationId: null }]` e il banco vede solo le serie
        // SENZA sede: un contatore legato al negozio — anche marcato
        // predefinito — non verrebbe mai scelto. È la regola §1-bis, «vale
        // anche in assegnazione, non solo in tendina», chiusa il 13/08 per gli
        // altri tipi e mai agganciata qui.
        //
        // ⚠️ Non partiziona il progressivo (`docs/04` §1): decide QUALI serie
        // sono disponibili, non quale numero esce.
        const series = await defaultCounterSeries(
          tx,
          tenantId,
          DocumentType.store_sale,
          dto.locationId,
        );
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
          // ⛔ La DATA, ed è il perno della regola del §2: la proposta è il
          // primo libero DOPO i documenti di data anteriore. Omettendola si
          // ricade su oggi, e una vendita registrata stamattina per ieri
          // prendeva un numero calcolato sul giorno sbagliato.
          documentDate,
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
          // ⚠️ Contratto binario, come il Codice IVA: descrizione ASSENTE = non
          // modificata, e resta quella persistita. Presente = l'operatore l'ha
          // cambiata. Su una riga nuova si fotografa dall'articolo.
          description: line.description ?? previous?.description ?? this.lineDescription(variant),
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
    /**
     * Sede ATTUALE del documento — letta per poterla autorizzare PRIMA di
     * permettere qualunque modifica (T6): senza, un operatore vedrebbe
     * verificata solo la sede di destinazione richiesta, mai quella di
     * partenza, e potrebbe "prendere" un documento di una sede che non vede.
     */
    readonly locationId: string | null;
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
        locationId: true,
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

  /**
   * Registra un reso al banco, o ne RISALVA uno esistente (`dto.id`).
   *
   * ⛔ **Il Reso non ha documento origine** (`11` A11). Non è una semplificazione:
   * la vendita reale può essere stata battuta su una cassa esterna e non essere
   * mai esistita in VestiFlow, quindi un contratto che la presuppone non regge.
   * Ne discende che non esistono tetto sulla quantità venduta, quantità già
   * resa, né recupero del prezzo o del costo da una vendita precedente.
   *
   * Come la vendita, è un ADATTATORE: struttura, righe e movimenti passano dai
   * pezzi comuni del dominio documenti. La differenza è il verso — la merce
   * rientra, quindi il motore è quello di carico — e la spunta di riga, che
   * decide se quella riga genera davvero il movimento.
   */
  async createReturn(
    tenantId: string,
    dto: CreateStoreReturnDto,
    user: UserProfileDto,
  ): Promise<StoreSaleResult> {
    // Vedi il commento su createSale: la sede si carica prima di autorizzare,
    // perché in modifica sono due le sedi da controllare, non una.
    const existing = dto.id
      ? await this.loadEditableStoreDocument(tenantId, dto.id, DocumentType.store_return)
      : null;
    this.authorizeStoreDocumentLocations(user, existing?.locationId ?? null, dto.locationId);
    await this.assertLocationExists(tenantId, dto.locationId);

    const variants = await this.resolveVariants(
      tenantId,
      dto.lines.map((line) => line.variantId),
    );
    // ⛔ Qui c'era `[]` cablato, perché le righe di reso non avevano un Codice
    // IVA proprio: la risoluzione poteva partire solo dall'articolo. Ora che il
    // DTO lo accetta (T3), i codici DICHIARATI vanno precaricati come sulla
    // Vendita — altrimenti `resolveLineVatCode` non li trova nella mappa e la
    // riga finisce senza imposta, in silenzio.
    //
    // ⚠️ Non serve al percorso CONSERVATO: `preservedLineVat` ricostruisce
    // l'aliquota dallo snapshot persistito e non consulta questa mappa. Serve
    // alle righe nuove e a quelle in cui l'IVA è stata cambiata davvero.
    const vatContext = await this.resolveVatContext(tenantId, dto.lines, variants);

    // Come la vendita, alla lettera: la data si fissa alla CREAZIONE e non si
    // muove più — il Registro Corrispettivi filtra e raggruppa su di essa, e un
    // reso di marzo corretto ad agosto cambierebbe due periodi invece di
    // correggerne uno. In creazione la sceglie chi registra, o è oggi.
    const documentDate = existing
      ? existing.documentDate
      : dto.documentDate
        ? new Date(dto.documentDate)
        : new Date();
    const setting = await this.settings.getResolved(tenantId, DocumentType.store_return);
    const actor = {
      createdById: user.id,
      createdByName: user.displayName?.trim() || 'Utente',
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const year = documentDate.getFullYear();
      let nuovaNumerazione: { series: string | null; number: number } | null = null;
      if (!existing) {
        // Sede e data come sulla Vendita (T7A): stesso contratto, stesso
        // motore — vedi i commenti in `createSale`. Il Reso ha un contatore
        // PROPRIO (`store_return` non condivide il numeratore con nessuno:
        // l'unica deroga è la famiglia fattura), ma le regole di scelta della
        // serie e di proposta del numero sono le stesse.
        const series = await defaultCounterSeries(
          tx,
          tenantId,
          DocumentType.store_return,
          dto.locationId,
        );
        // Come la vendita: il contatore dei resi è condiviso fra le casse, e il
        // lock transazionale serializza chi lo legge. Prima della lettura.
        await lockDocumentCounter(tx, { tenantId, type: DocumentType.store_return, series });
        const number = await nextDocumentNumber({
          tx,
          tenantId,
          type: DocumentType.store_return,
          series,
          source: 'document',
          documentDate,
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

      const computedLines = dto.lines.map((line, index) => {
        const variant = variants.get(line.variantId)!;
        // ⛔ Qui c'era `line.unitPriceMinor ?? 0` (T4): il campo era facoltativo
        // e un prezzo mancante diventava zero IN SILENZIO. Ora il DTO lo
        // pretende, quindi «assente» non arriva più fin qui — lo respinge la
        // validazione, che è il posto giusto per dirlo.
        //
        // ⚠️ Nessun ripiego sul prezzo corrente dell'articolo: sarebbe la
        // rifotografia dall'anagrafica che `regole-gestionale` vieta. Il valore
        // che arriva è già quello del documento, e su una riga esistente è
        // quello persistito — il client lo rimanda tale e quale, coda decimale
        // compresa.
        const unitPriceMinor = line.unitPriceMinor;
        const previous = line.id ? existingLinesById.get(line.id) : undefined;

        // Riga già esistente: lo snapshot IVA non si rifotografa, come su ogni
        // documento. Gli importi si rifanno, perché quantità e prezzo possono
        // essere cambiati.
        //
        // ⛔ Qui c'erano `undefined` e `null` CABLATI, perché il DTO del Reso
        // non aveva `vatCodeId` (T3). L'effetto era corretto per caso — con
        // `undefined` il contratto binario conserva sempre — ma l'operatore non
        // poteva mai cambiare l'IVA di una riga. Ora è il valore dichiarato a
        // decidere, esattamente come sulla Vendita.
        const resolvedVat =
          preservedLineVat(previous?.id, line.vatCodeId, existingVatById) ??
          this.resolveLineVatCode(line.vatCodeId, variant, vatContext);

        // Lo sconto è quello della riga, come sulla Vendita (`11` A11): chi ha
        // venduto scontato e riprende il capo rende quello che ha incassato.
        const discountPercent = line.discountPercent ?? 0;

        const amounts = computeVatLineAmounts({
          enteredUnitCostMinor: unitPriceMinor,
          costEntryMode: 'vat_excluded',
          quantity: line.quantity,
          discountPercent,
          vat: resolvedVat.vat,
        });
        return {
          id: previous?.id,
          lineNumber: index + 1,
          variantId: variant.id,
          // Fotografia dell'operazione: su una riga già esistente restano quelli
          // scritti allora, anche se il prodotto è stato rinominato dopo.
          sku: previous?.sku ?? variant.sku,
          // ⚠️ Contratto binario, come il Codice IVA: descrizione ASSENTE =
          // non modificata, e resta quella persistita. Presente = l'operatore
          // l'ha cambiata. Su una riga nuova si fotografa dall'articolo.
          description: line.description ?? previous?.description ?? this.lineDescription(variant),
          quantity: line.quantity,
          unitPriceMinor,
          discountPercent,
          vatCodeId: resolvedVat.vatCodeId,
          vatSnapshot: resolvedVat.vatSnapshot,
          lineTotalMinor: amounts.lineNetMinor,
          lineVatTotalMinor: amounts.lineVatMinor,
          lineGrossTotalMinor: amounts.lineGrossMinor,
          // ⚠️ È la SPUNTA DI RIGA a decidere il movimento, non la quantità
          // (`11` A11-ter): spunta attiva → carico positivo; disattiva → nessun
          // movimento per quella riga. La logica documentale comune, non una
          // classificazione «vendibile / non vendibile», che nel Reso non esiste.
          loadsStock: line.restockable,
        };
      });

      const subtotalMinor = computedLines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
      const taxMinor = computedLines.reduce((sum, line) => sum + line.lineVatTotalMinor, 0);
      const totalMinor = computedLines.reduce((sum, line) => sum + line.lineGrossTotalMinor, 0);

      // ⛔ La causale vive in `causalText`, la colonna generica del documento —
      // non in `internalComment` col prefisso `Causale reso: `, che per
      // rileggerla obbligava ad analizzare una stringa. `reason` resta accettato
      // per compatibilità di chiamata, ma `causale` è il campo.
      const causale = (dto.causale ?? dto.reason)?.trim() || null;

      const header = {
        notes: dto.notes?.trim() || null,
        causalText: causale,
        // Digitata dall'operatore, non generata da un modello: è la stessa
        // distinzione che l'Arrivo merce fa con le sue causali.
        causalGenerationMode: causale ? 'manual' : null,
        locationId: dto.locationId,
        subtotalMinor,
        taxMinor,
        totalMinor,
      };

      let doc;
      if (existing) {
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
            type: DocumentType.store_return,
            status: DocumentStatus.confirmed,
            series: nuovaNumerazione!.series,
            number: nuovaNumerazione!.number,
            year,
            reference,
            documentDate,
            registrationDate: documentDate,
            printTitle: setting.printTitle,
            currency: 'EUR',
            // Come la vendita: nota di come si leggono i prezzi al banco, non un
            // parametro di calcolo.
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

      // Il verso è opposto alla vendita — la merce rientra — quindi il motore è
      // quello di CARICO, con lo stesso contratto: un movimento per riga,
      // aggiornato in posto, mai accodato. Le righe senza spunta cadono fuori da
      // sé: il filtro del sync è `loadsStock`.
      await syncGoodsReceiptLineMovements(tx, {
        tenantId,
        documentId: doc.id,
        documentType: DocumentType.store_return,
        locationId: dto.locationId,
        // La causale entra nella descrizione del movimento solo se c'è: senza,
        // resta il riferimento del documento, che basta a ritrovarlo.
        reason: causale
          ? `Reso vendita al banco ${reference}: ${causale}`
          : `Reso vendita al banco ${reference}`,
        movementDate: documentDate,
        movementType: StockMovementType.return,
        origin: MovementOrigin.vestiflow_pos,
        // ⛔ Il costo NON si deriva dalla riga: lì c'è il prezzo di VENDITA, e
        // derivarlo scriverebbe il ricavo al posto del costo d'acquisto. Si
        // congela il costo corrente della variante, e solo sulle righe nuove.
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
   * T6 — autorizza la sede in creazione, ED ENTRAMBE le sedi in modifica.
   *
   * ⛔ In modifica non basta autorizzare `dto.locationId`: un operatore che
   * vede solo la sede A potrebbe, avendo l'id di un documento nato in B,
   * "portarlo" in A passando `locationId: A` — la sola sede controllata
   * sarebbe quella di ARRIVO, mai quella di PARTENZA. Vanno autorizzate
   * entrambe, e quella del documento esistente PRIMA: se l'operatore non può
   * nemmeno vedere B, la richiesta si rifiuta lì, a prescindere da cosa
   * chiede di fare.
   *
   * Nessuna scrittura avviene prima che questo metodo ritorni: è chiamato
   * subito dopo aver caricato `existing` e prima di ogni lettura o transazione
   * successiva.
   *
   * `existingLocationId` è `null` in creazione (nessun documento esistente):
   * in quel caso si autorizza solo `targetLocationId`, come sempre.
   */
  private authorizeStoreDocumentLocations(
    user: UserProfileDto,
    existingLocationId: string | null,
    targetLocationId: string,
  ): void {
    if (existingLocationId) {
      assertUserCanAccessLocation(user, existingLocationId);
    }
    assertUserCanAccessLocation(user, targetLocationId);
  }

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
        this.logger.warn(`Push inventario post-vendita al banco (${tenantId}): ${message}`);
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
