import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
  MovementOrigin,
  Prisma,
  StockMovementType,
} from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { DocumentPriceModePreferenceService } from '../documents/document-price-mode-preference.service';
import { DocumentSettingsService } from '../documents/document-settings.service';
import {
  buildDocumentNumberConflict,
  defaultCounterSeries,
  isDocumentNumberConflict,
  lockDocumentCounter,
  resolveDocumentNumber,
  resolveEditedDocumentNumbering,
  serieCanonica,
} from '../documents/document-numbering.util';
import { persistDocumentLinesByIdTx } from '../documents/document-line-upsert.util';
import { syncGoodsReceiptLineMovements } from '../documents/document-goods-receipt-sync.util';
import { syncUnloadLineMovements } from '../documents/document-stock-unload-sync.util';
import { preservedLineVat } from '../documents/document-line-vat-snapshot.util';

import { CreationIntentService } from '../common/idempotency/creation-intent.util';
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
    private readonly intents: CreationIntentService,
    // Contratto comune netto/ivato (`11` A4): la stessa risoluzione e la stessa
    // memoria che usa il percorso documenti generico, non una copia del banco.
    private readonly priceModePreference: DocumentPriceModePreferenceService,
  ) {}

  /**
   * La modalità di rappresentazione dei prezzi del documento.
   *
   * ```text
   * dichiarata dal client   → quella, ed è una scelta dell'operatore
   * assente su un ESISTENTE → resta quella persistita (contratto binario)
   * assente su un NUOVO     → memoria dell'operatore, poi convenzione aziendale
   * ```
   *
   * ⛔ Non entra in nessun calcolo: le righe portano sempre il netto, e la
   * modalità dice solo come lo si legge e digita.
   */
  private async resolvePriceMode(
    tenantId: string,
    userId: string,
    type: DocumentType,
    declared: boolean | undefined,
    persisted: boolean | undefined,
  ): Promise<boolean> {
    if (declared !== undefined) {
      return declared;
    }
    if (persisted !== undefined) {
      return persisted;
    }
    return this.priceModePreference.resolvePricesIncludeVat(tenantId, userId, type);
  }

  /**
   * Ricorda la modalità scelta, **solo alla creazione**: il documento dopo la
   * ripropone. In modifica no — correggere una vendita di marzo non è una
   * dichiarazione su come si vogliono vedere i prezzi domani.
   */
  private async rememberPriceMode(
    tenantId: string,
    userId: string,
    type: DocumentType,
    declared: boolean | undefined,
    isCreation: boolean,
  ): Promise<void> {
    if (!isCreation || declared === undefined) {
      return;
    }
    await this.priceModePreference
      .remember(tenantId, userId, type, declared)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'preferenza non salvata';
        this.logger.warn(`Modalità prezzo non memorizzata (${tenantId}): ${message}`);
      });
  }

  /**
   * Il registro degli intenti, applicato a un percorso della cassa (T15).
   *
   * ⛔ Sta qui e non dentro `CreationIntentService` perché la parte che il
   * registro non può conoscere è proprio questa: come si ricarica il record che
   * `resultRef` nomina, e come lo si trasforma nella risposta. Il registro
   * maneggia una stringa opaca; a sapere che è l'id di un documento di cassa è
   * solo questo servizio.
   *
   * ⚠️ Senza `creationIntentId` non fa niente e restituisce `null`: il client
   * non lo manda ancora (arriva con T15B), e un percorso non protetto deve
   * continuare a funzionare come prima.
   */
  private async replayIfAlreadyDone(
    error: unknown,
    tenantId: string,
    dto: { readonly creationIntentId?: string; readonly locationId: string },
    fingerprint: string,
  ): Promise<StoreSaleResult | null> {
    if (!dto.creationIntentId) {
      return null;
    }
    const esito = await this.intents.resolveConflict({
      error,
      tenantId,
      intentId: dto.creationIntentId,
      fingerprint,
    });
    if (!esito) {
      return null;
    }
    const doc = await this.prisma.document.findFirst({
      where: { id: esito.replay, tenantId },
      select: {
        id: true,
        reference: true,
        documentDate: true,
        totalMinor: true,
        currency: true,
        lines: {
          select: { variantId: true, sku: true, description: true, quantity: true },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
    if (!doc) {
      // Il registro nomina un record che non esiste più: qualcuno l'ha
      // eliminato dopo. Non è un replay riproducibile, e dirlo è meglio che
      // restituire una risposta vuota travestita da successo.
      throw new ConflictException({
        code: 'creation_intent_result_missing',
        message: 'L’operazione risulta già registrata, ma il documento non è più disponibile.',
      });
    }
    return this.toResult(tenantId, dto.locationId, doc);
  }

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

    // La data del documento è MODIFICABILE, anche dopo la conclusione
    // (decisione del proprietario, 21/08/2026): una data sbagliata si corregge
    // dove è stata scritta.
    //
    // ⛔ Qui c'era `existing ? existing.documentDate : …`, che la congelava alla
    // creazione e **ignorava in silenzio** quella ricevuta: la maschera poteva
    // mostrare un campo che non modificava niente.
    //
    // ⚠️ Assente = non dichiarata, e allora resta quella persistita. È la
    // differenza fra «non l'ho toccata» e «la voglio a questa data», e senza
    // questa distinzione ogni risalvataggio la riporterebbe a oggi.
    //
    // ⭐ **Non rinumera**: numero e serie si assegnano solo alla nascita
    // (`if (!existing)`, qui sotto), quindi spostare la data non tocca il
    // riferimento.
    //
    // ⛔ E non tocca nemmeno `StockMovement.createdAt`, che è il timestamp
    // TECNICO di quando il movimento è nato: `documentDate` e `createdAt` sono
    // due informazioni diverse, e un documento datato 19 registrato il 21 è
    // legittimo. Se servirà una data di competenza sul movimento sarà un campo
    // suo, non questo riusato.
    //
    // ⚠️ Conseguenza da conoscere: il Registro Corrispettivi filtra e raggruppa
    // su questa data. Correggerla sposta la registrazione di periodo, che è
    // l'operazione richiesta quando la data era sbagliata.
    const documentDate = dto.documentDate
      ? new Date(dto.documentDate)
      : (existing?.documentDate ?? new Date());
    const pricesIncludeVat = await this.resolvePriceMode(
      tenantId,
      user.id,
      DocumentType.store_sale,
      dto.pricesIncludeVat,
      existing?.pricesIncludeVat,
    );
    const setting = await this.settings.getResolved(tenantId, DocumentType.store_sale);
    const actor = {
      createdById: user.id,
      createdByName: user.displayName?.trim() || 'Utente',
    };

    // T15 — l'impronta è del CONTENUTO della richiesta: l'identità dell'intento
    // ne resta fuori, perché due impronte si confrontano solo a parità di
    // intento e includerla aggiungerebbe una costante.
    const { creationIntentId, ...contenuto } = dto;
    const fingerprint = CreationIntentService.fingerprintOf(contenuto);

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // ⛔ T15 — LA PRIMA SCRITTURA, e l'ordine è il meccanismo. È qui che una
        // seconda richiesta con lo stesso intento si ferma sul vincolo unico,
        // PRIMA di aver toccato numerazione, righe, movimenti e giacenze. Messa
        // dopo, gli effetti sarebbero già stati applicati.
        //
        // ⚠️ Solo in CREAZIONE: risalvare un documento esistente è già
        // idempotente per riconciliazione (righe per id, movimenti per
        // `sourceLineId`), e rivendicare un intento lì impedirebbe la seconda
        // modifica legittima dello stesso documento.
        if (!existing) {
          // ⛔ T15B — creare senza identità d'intento non è più possibile. Il
          // DTO lo impone con `@ValidateIf`, e questa è la seconda rete: un
          // chiamante interno che aggirasse la validazione creerebbe una
          // vendita non deduplicabile, e non se ne accorgerebbe nessuno.
          if (!creationIntentId) {
            throw new UnprocessableEntityException(
              'Identità dell’operazione mancante: ricarica la pagina e ripeti.',
            );
          }
          await this.intents.claimTx(tx, {
            tenantId,
            intentId: creationIntentId,
            scope: DocumentType.store_sale,
            fingerprint,
          });
        }
        const year = documentDate.getFullYear();
        // Numero e serie: alla nascita li assegna il motore comune; in modifica
        // vale il **contratto comune degli altri documenti** — dichiarati, si
        // scrivono; non dichiarati, restano quelli.
        //
        // ⛔ Qui c'era «si assegnano SOLO alla nascita, in modifica restano
        // quelli»: il banco rifiutava **in silenzio** il numero e la serie
        // dichiarati, e la maschera nuova avrebbe mostrato due campi che non
        // modificavano niente. Ritirato dal proprietario il 21/08/2026 —
        // Vendita e Reso seguono il contratto comune anche in modifica, e
        // `resolveEditedDocumentNumbering` è quello, non una copia.
        //
        // ⚠️ La causale dei movimenti porta il RIFERIMENTO, ed è la ragione per
        // cui si ricompone qui, **prima** della sincronizzazione: cambiando
        // numero, sui movimenti resterebbe scritto quello vecchio — che il
        // documento non porta più.
        let numerazione: {
          series: string | null;
          number: number | null;
          reference: string;
          /** Numero o serie sono cambiati: solo allora le colonne si riscrivono. */
          write: boolean;
          numberChanged: boolean;
        };
        if (existing) {
          const edit = resolveEditedDocumentNumbering({
            declaredSeries: dto.series,
            declaredNumber: dto.number,
            current: { series: existing.series, number: existing.number },
            prefix: setting.numberPrefix,
          });
          numerazione = {
            series: edit.series,
            number: edit.number,
            reference: edit.reference ?? existing.reference ?? '',
            write: edit.changed,
            numberChanged: edit.numberChanged,
          };
        } else {
          // La serie e' opzionale nello schema: `defaultCounterSeries` puo' non
          // trovarne una, ed e' un caso legittimo — non si forza a stringa.
          // ⛔ Serie, STESSA semantica di ogni altro documento (T8A): assente =
          // «decidi tu», e la sede entra nella scelta (§1-bis); stringa vuota =
          // «Senza serie», che è una SCELTA e scavalca il predefinito. La
          // distinzione non è formale — collassarla rimette in produzione il
          // difetto per cui «Senza serie» usciva sotto la serie predefinita,
          // magari di un'altra sede.
          //
          // ⚠️ La normalizzazione passa da `serieCanonica`, non da una copia a
          // mano: il suo docblock conta DODICI punti che l'avevano riscritta, ed
          // è la ragione per cui la regola era diventata cieca sulla partizione
          // più usata. Aggiungerne una tredicesima qui sarebbe il contrario di
          // riusare il contratto comune.
          const series =
            dto.series !== undefined
              ? serieCanonica(dto.series)
              : await defaultCounterSeries(tx, tenantId, DocumentType.store_sale, dto.locationId);
          const requestedNumber = dto.number && dto.number > 0 ? dto.number : null;
          if (requestedNumber == null) {
            // Due casse che battono nello stesso istante leggono lo stesso
            // massimo e una si becca il vincolo unico a scontrino finito: il
            // lock transazionale le serializza, PRIMA della lettura.
            //
            // ⚠️ Un numero IMPOSTO non passa di qui: non legge alcun massimo, e
            // serializzare due operatori che hanno già scelto il proprio numero
            // li farebbe aspettare per niente. Lì il conflitto è l'informazione
            // utile, non un incidente da prevenire.
            await lockDocumentCounter(tx, { tenantId, type: DocumentType.store_sale, series });
          }
          // Numero e riferimento dal motore comune: sceglie fra imposto e primo
          // libero, e formatta il riferimento. Un numero imposto NON sposta il
          // progressivo — i successivi ripartono dal massimo esistente + 1.
          const assigned = await resolveDocumentNumber({
            tx,
            tenantId,
            type: DocumentType.store_sale,
            series,
            source: 'document',
            prefix: setting.numberPrefix,
            requestedNumber,
            // ⛔ La DATA è il perno della regola del §2: il primo libero DOPO i
            // documenti di data anteriore. Omettendola si ricade su oggi.
            documentDate,
          });
          numerazione = {
            series,
            number: assigned.number,
            reference: assigned.reference,
            write: true,
            numberChanged: true,
          };
        }
        const reference = numerazione.reference;

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
          // La data sta nella testata che si riscrive, non solo nel `create`:
          // è ciò che la rende correggibile su un documento già concluso.
          //
          // ⛔ `registrationDate` **non la segue**: è quando il documento è stato
          // registrato nel gestionale, e resta quella. Un documento datato 19
          // registrato il 21 è una situazione legittima — retrodatare non
          // riscrive la storia dell'inserimento.
          documentDate,
          locationId: dto.locationId,
          // Modalità di rappresentazione: sta nella testata che si riscrive, così
          // cambiarla su un documento aperto la persiste (`11` A4).
          pricesIncludeVat,
          // ⛔ Pagamento: assente = NON MODIFICATO (`11` A8). La maschera nuova
          // non lo manda perché la gestione è differita al blocco
          // Pagamenti/Tesoreria; senza questa conservazione, risalvare una
          // vendita storica ne cancellerebbe il metodo.
          paymentMethod: dto.paymentMethod ?? existing?.paymentMethod ?? null,
          // Segue il metodo: si riscrive solo quando il metodo è dichiarato, e
          // resta testo libero del solo «Altro».
          paymentMethodNote: dto.paymentMethod
            ? dto.paymentMethod === 'other'
              ? dto.paymentMethodNote?.trim() || null
              : null
            : (existing?.paymentMethodNote ?? null),
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
            data: {
              ...header,
              // Solo quando cambiano davvero: un risalvataggio che non tocca il
              // numero non deve rischiare il vincolo unico.
              ...(numerazione.write
                ? {
                    series: numerazione.series,
                    ...(numerazione.numberChanged ? { number: numerazione.number } : {}),
                    reference: numerazione.reference,
                  }
                : {}),
            },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
          });
        } else {
          doc = await tx.document.create({
            data: {
              tenantId,
              type: DocumentType.store_sale,
              // Creato già confermato: la cassa non ha bozze (§7).
              status: DocumentStatus.confirmed,
              series: numerazione.series,
              number: numerazione.number,
              year,
              reference,
              // La data la porta `header`; `registrationDate` no: dice quando il
              // documento è stato registrato, e si scrive solo alla nascita.
              registrationDate: documentDate,
              printTitle: setting.printTitle,
              internalComment:
                'Registrazione interna della vendita. Lo scontrino fiscale viene emesso sulla cassa esterna.',
              currency: 'EUR',
              // ⛔ Qui c'era `pricesIncludeVat: true` — il forcing «al banco si
              // legge sempre ivato», tolto il 21/08/2026 (`11` A4). La modalità
              // ora sta in `header`, che la scrive anche in modifica, e viene
              // dal contratto comune: convenzione aziendale, memoria
              // dell'operatore, scelta persistita sul documento.
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

        // T15 — ULTIMA scrittura: il riferimento al documento appena creato.
        // Dentro la transazione, quindi se il lavoro fallisce il claim se ne va
        // con lui e l'intento torna libero.
        if (creationIntentId && !existing) {
          await this.intents.recordResultTx(tx, {
            tenantId,
            intentId: creationIntentId,
            resultRef: doc.id,
          });
        }

        return doc;
      });
      // T7B: il conflitto sul numero si intercetta QUI, fuori dalla
      // transazione — a questo punto ha già fatto rollback, e il client root è
      // l'unico utilizzabile per calcolare il primo libero.
    } catch (error) {
      // T15 — PRIMA del conflitto di numero: un reinvio dello stesso intento
      // non è un errore, è una risposta già pronta. I due non si confondono —
      // `isCreationIntentConflict` e `isDocumentNumberConflict` guardano modelli
      // Prisma diversi — ma l'ordine dichiara la precedenza.
      const gia = await this.replayIfAlreadyDone(error, tenantId, dto, fingerprint);
      if (gia) {
        return gia;
      }
      await this.throwStoreNumberConflict(
        error,
        tenantId,
        DocumentType.store_sale,
        dto.locationId,
        documentDate,
        // In modifica il numero tentato è quello imposto dalla testata oppure,
        // se non la tocca, quello che il documento ha già: un cambio di sola
        // serie basta a farlo collidere nella serie nuova. Stessa lettura del
        // percorso generico.
        existing ? (dto.series ?? existing.series) : dto.series,
        existing ? (dto.number ?? existing.number) : (dto.number && dto.number > 0 ? dto.number : null),
      );
      // Non era né un intento né un conflitto di numero: l'errore prosegue.
      throw error;
    }

    // La modalità scelta si ricorda per la creazione successiva, come su ogni
    // altro documento. Fuori dalla transazione: una preferenza non salvata non
    // deve far fallire una vendita già registrata.
    await this.rememberPriceMode(
      tenantId,
      user.id,
      DocumentType.store_sale,
      dto.pricesIncludeVat,
      !existing,
    );

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
    /**
     * Pagamento già registrato sul documento. Serve a **conservarlo**: la
     * maschera nuova non lo manda (`11` A8, gestione differita), e senza il
     * valore persistito un risalvataggio lo azzererebbe.
     */
    readonly paymentMethod: string | null;
    readonly paymentMethodNote: string | null;
    /**
     * Modalità netto/ivato già scelta sul documento: si conserva quando il
     * client non ne dichiara una, come ogni altro valore di testata.
     */
    readonly pricesIncludeVat: boolean;
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
        paymentMethod: true,
        paymentMethodNote: true,
        pricesIncludeVat: true,
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

    // Cliente facoltativo, **come sulla Vendita** (`11` A13, che non distingue i
    // due modi): stesso snapshot del nome, che è quello che il documento
    // conserva anche se l'anagrafica cambia dopo.
    const customerName = dto.customerId
      ? await this.snapshotCustomerName(tenantId, dto.customerId)
      : null;

    // Come la vendita, alla lettera: la data è modificabile anche dopo la
    // conclusione, assente = resta quella persistita, e non rinumera nulla —
    // il ragionamento per esteso sta su `createSale`.
    const documentDate = dto.documentDate
      ? new Date(dto.documentDate)
      : (existing?.documentDate ?? new Date());
    const pricesIncludeVat = await this.resolvePriceMode(
      tenantId,
      user.id,
      DocumentType.store_return,
      dto.pricesIncludeVat,
      existing?.pricesIncludeVat,
    );
    const setting = await this.settings.getResolved(tenantId, DocumentType.store_return);
    const actor = {
      createdById: user.id,
      createdByName: user.displayName?.trim() || 'Utente',
    };

    // T15 — come sulla Vendita: l'impronta è del contenuto, l'intento ne resta
    // fuori.
    const { creationIntentId, ...contenuto } = dto;
    const fingerprint = CreationIntentService.fingerprintOf(contenuto);

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // T15 — la PRIMA scrittura, e solo in creazione. Vedi `createSale`.
        if (!existing) {
          // ⛔ T15B — creare senza identità d'intento non è più possibile. Il
          // DTO lo impone con `@ValidateIf`, e questa è la seconda rete: un
          // chiamante interno che aggirasse la validazione creerebbe una
          // vendita non deduplicabile, e non se ne accorgerebbe nessuno.
          if (!creationIntentId) {
            throw new UnprocessableEntityException(
              'Identità dell’operazione mancante: ricarica la pagina e ripeti.',
            );
          }
          await this.intents.claimTx(tx, {
            tenantId,
            intentId: creationIntentId,
            scope: DocumentType.store_return,
            fingerprint,
          });
        }
        const year = documentDate.getFullYear();
        // Numero e serie: alla nascita li assegna il motore comune; in modifica
        // vale il **contratto comune degli altri documenti** — dichiarati, si
        // scrivono; non dichiarati, restano quelli.
        //
        // ⛔ Qui c'era «si assegnano SOLO alla nascita, in modifica restano
        // quelli»: il banco rifiutava **in silenzio** il numero e la serie
        // dichiarati, e la maschera nuova avrebbe mostrato due campi che non
        // modificavano niente. Ritirato dal proprietario il 21/08/2026 —
        // Vendita e Reso seguono il contratto comune anche in modifica, e
        // `resolveEditedDocumentNumbering` è quello, non una copia.
        //
        // ⚠️ La causale dei movimenti porta il RIFERIMENTO, ed è la ragione per
        // cui si ricompone qui, **prima** della sincronizzazione: cambiando
        // numero, sui movimenti resterebbe scritto quello vecchio — che il
        // documento non porta più.
        let numerazione: {
          series: string | null;
          number: number | null;
          reference: string;
          /** Numero o serie sono cambiati: solo allora le colonne si riscrivono. */
          write: boolean;
          numberChanged: boolean;
        };
        if (existing) {
          const edit = resolveEditedDocumentNumbering({
            declaredSeries: dto.series,
            declaredNumber: dto.number,
            current: { series: existing.series, number: existing.number },
            prefix: setting.numberPrefix,
          });
          numerazione = {
            series: edit.series,
            number: edit.number,
            reference: edit.reference ?? existing.reference ?? '',
            write: edit.changed,
            numberChanged: edit.numberChanged,
          };
        } else {
          // Identico alla Vendita, riga per riga: stesso contratto, stesso
          // motore comune, stessa semantica di `series` e del numero imposto —
          // vedi i commenti in `createSale`.
          //
          // ⚠️ Il blocco è ripetuto invece che estratto, come nell'Arrivo merce
          // che lo porta due volte (`:514` e `:1099`): un helper qui sarebbe un
          // motore di numerazione del banco, cioè la cosa da non avere. Se un
          // giorno si estrarrà, andrà estratto per TUTTI i servizi numerati.
          const series =
            dto.series !== undefined
              ? serieCanonica(dto.series)
              : await defaultCounterSeries(tx, tenantId, DocumentType.store_return, dto.locationId);
          const requestedNumber = dto.number && dto.number > 0 ? dto.number : null;
          if (requestedNumber == null) {
            await lockDocumentCounter(tx, { tenantId, type: DocumentType.store_return, series });
          }
          const assigned = await resolveDocumentNumber({
            tx,
            tenantId,
            type: DocumentType.store_return,
            series,
            source: 'document',
            prefix: setting.numberPrefix,
            requestedNumber,
            documentDate,
          });
          numerazione = {
            series,
            number: assigned.number,
            reference: assigned.reference,
            write: true,
            numberChanged: true,
          };
        }
        const reference = numerazione.reference;

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
          // Come sulla Vendita: la data sta nella testata che si riscrive, e
          // `registrationDate` **non** la segue — quella dice quando il reso è
          // stato registrato nel gestionale.
          documentDate,
          customerId: dto.customerId ?? null,
          customerName,
          locationId: dto.locationId,
          // Modalità di rappresentazione: sta nella testata che si riscrive, così
          // cambiarla su un documento aperto la persiste (`11` A4).
          pricesIncludeVat,
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
            data: {
              ...header,
              // Solo quando cambiano davvero: un risalvataggio che non tocca il
              // numero non deve rischiare il vincolo unico.
              ...(numerazione.write
                ? {
                    series: numerazione.series,
                    ...(numerazione.numberChanged ? { number: numerazione.number } : {}),
                    reference: numerazione.reference,
                  }
                : {}),
            },
            include: { lines: { orderBy: { lineNumber: 'asc' } } },
          });
        } else {
          doc = await tx.document.create({
            data: {
              tenantId,
              type: DocumentType.store_return,
              status: DocumentStatus.confirmed,
              series: numerazione.series,
              number: numerazione.number,
              year,
              reference,
              // La data la porta `header`; `registrationDate` no: dice quando il
              // documento è stato registrato, e si scrive solo alla nascita.
              registrationDate: documentDate,
              printTitle: setting.printTitle,
              currency: 'EUR',
              // Come la Vendita: il forcing «sempre ivato» non c'è più, la
              // modalità arriva da `header` e dal contratto comune (`11` A4).
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

        // T15 — ULTIMA scrittura, come sulla Vendita.
        if (creationIntentId && !existing) {
          await this.intents.recordResultTx(tx, {
            tenantId,
            intentId: creationIntentId,
            resultRef: doc.id,
          });
        }

        return doc;
      });
      // T7B: come sulla Vendita, stesso schema e stesso motore comune.
    } catch (error) {
      const gia = await this.replayIfAlreadyDone(error, tenantId, dto, fingerprint);
      if (gia) {
        return gia;
      }
      await this.throwStoreNumberConflict(
        error,
        tenantId,
        DocumentType.store_return,
        dto.locationId,
        documentDate,
        // Vedi `createSale`: in modifica vale il numero che il documento
        // avrebbe dopo il salvataggio.
        existing ? (dto.series ?? existing.series) : dto.series,
        existing ? (dto.number ?? existing.number) : (dto.number && dto.number > 0 ? dto.number : null),
      );
      throw error;
    }

    // La modalità scelta si ricorda per la creazione successiva, come su ogni
    // altro documento. Fuori dalla transazione: una preferenza non salvata non
    // deve far fallire una vendita già registrata.
    await this.rememberPriceMode(
      tenantId,
      user.id,
      DocumentType.store_return,
      dto.pricesIncludeVat,
      !existing,
    );

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

  /**
   * Conflitto sul numero → **409 strutturato**, non 500 (T7B).
   *
   * ⛔ Prima il banco era l'UNICO servizio numerato senza questa rete: gli altri
   * sei — documenti generici, Arrivo merce, Trasferimento/Rettifica, Ordine
   * cliente manuale, Ordine fornitore, Corrispettivo manuale — la avevano già.
   * Qui il P2002 del vincolo unico usciva non gestito e il filtro globale lo
   * rendeva un 500 generico: l'operatore leggeva un errore di sistema al posto
   * dell'avviso col primo numero libero.
   *
   * Stesso schema dei precedenti, alla lettera:
   * - si intercetta **fuori** dalla transazione, che a quel punto ha già fatto
   *   rollback;
   * - si riconosce con `isDocumentNumberConflict`, che guarda il **modello**
   *   Prisma e non i nomi delle colonne — `Document` è fra i `MODELLI_NUMERATI`;
   * - se non è un conflitto di numero **non si fa niente** e l'errore originale
   *   prosegue: un P2002 su un'altra tabella (per esempio uno SKU duplicato)
   *   non deve travestirsi da «numero già assegnato»;
   * - `buildDocumentNumberConflict` riceve il client **ROOT** (`this.prisma`),
   *   non la transazione morta.
   *
   * ⚠️ **La serie si risolve ESATTAMENTE come nella scrittura, sede compresa.**
   * È l'avvertimento che l'Arrivo merce porta scritto dal 13/08: calcolare il
   * «prossimo libero» su una partizione diversa da quella su cui si è appena
   * numerato propone all'operatore un numero che gli darebbe un SECONDO
   * conflitto. Da T8A la serie può arrivare dalla testata, quindi qui si ripete
   * lo stesso ramo binario del salvataggio — dichiarata la si usa, assente la
   * si risolve dal contatore.
   *
   * ⚠️ `requestedNumber` è il numero che l'operatore ha IMPOSTO. Assente resta
   * `null`, e il payload non nomina nessun numero: quello assegnato d'ufficio è
   * andato perso col rollback, e inventarne uno significherebbe parlare
   * all'operatore di una cifra che non ha digitato.
   */
  private async throwStoreNumberConflict(
    error: unknown,
    tenantId: string,
    type: DocumentType,
    locationId: string,
    documentDate: Date,
    /** `undefined` = «decidi tu» (creazione); `null` = senza serie. */
    declaredSeries: string | null | undefined,
    requestedNumber: number | null,
  ): Promise<void> {
    if (!isDocumentNumberConflict(error)) {
      return;
    }
    const setting = await this.settings.getResolved(tenantId, type);
    const series =
      declaredSeries !== undefined
        ? serieCanonica(declaredSeries)
        : await defaultCounterSeries(this.prisma, tenantId, type, locationId);
    throw new ConflictException(
      await buildDocumentNumberConflict({
        tx: this.prisma,
        tenantId,
        type,
        series,
        source: 'document',
        prefix: setting.numberPrefix,
        requestedNumber,
        // Il primo libero si calcola sulla data del DOCUMENTO (§2), non su
        // oggi: altrimenti l'avviso suggerirebbe il numero giusto per un'altra
        // giornata — lo stesso motivo per cui la data serve in assegnazione.
        documentDate,
      }),
    );
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
