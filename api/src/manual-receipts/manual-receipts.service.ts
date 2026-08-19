import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  isDocumentNumberConflict,
  lockDocumentCounter,
  nextDocumentNumber,
} from '../documents/document-numbering.util';
import {
  INVENTORY_ACTION_SCOPE_MODE,
  listLocationsInScope,
  resolveLicensedLocationScope,
} from '../inventory/licensed-location-scope.util';
import { assertLocationInUserScope } from '../inventory/user-location-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import {
  computeManualReceiptLines,
  computeManualReceiptTotals,
  isEmptyManualReceiptLine,
  type ComputedManualReceiptLine,
  type ManualReceiptLineInput,
} from './manual-receipt-totals.util';
import type { SaveManualReceiptDto } from './dto/save-manual-receipt.dto';

/** Una sede utilizzabile nella testata: l'elenco che la maschera propone. */
export interface ManualReceiptLocationDto {
  readonly id: string;
  readonly name: string;
}

export interface ManualReceiptLineDto {
  readonly id: string;
  readonly lineNumber: number;
  readonly description: string;
  /** Come digitato al salvataggio, nella modalità di allora. */
  readonly enteredAmountMinor: number;
  /** Netto canonico con la coda: la maschera ridisegna da qui, mai dal mostrato. */
  readonly netAmountMinor: number;
  readonly vatCodeId: string | null;
  readonly vatSnapshot: unknown;
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly grossMinor: number;
}

export interface ManualReceiptDto {
  readonly id: string;
  readonly number: number;
  readonly documentDate: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly pricesIncludeVat: boolean;
  readonly notes: string | null;
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly createdByName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lines: readonly ManualReceiptLineDto[];
}

/** Cosa serve leggere per comporre il DTO: una sola forma, un solo `include`. */
const RECEIPT_INCLUDE = {
  location: { select: { name: true } },
  lines: { orderBy: { lineNumber: 'asc' } },
} as const satisfies Prisma.ManualReceiptInclude;

type ManualReceiptRecord = Prisma.ManualReceiptGetPayload<{ include: typeof RECEIPT_INCLUDE }>;

/**
 * Il **Corrispettivo manuale**: una registrazione ECONOMICA autonoma che entra
 * nel Registro Corrispettivi (`10` §12).
 *
 * ⛔ **Questo service non tocca il magazzino, e non è una dimenticanza: è la
 * definizione.** Non c'è un `stockMovement`, un `inventoryLevel`, una
 * prenotazione né una spinta verso i canali — una registrazione che non conosce
 * gli articoli non può muovere quantità, e se un giorno lo facesse starebbe
 * inventando merce. La prova che lo presidia è la prima del §13, e viene prima
 * delle altre.
 *
 * Non crea nemmeno `Document` né `SalesOrder`.
 *
 * ⚠️ **E qui serve una distinzione, perché la parola «incasso» ne confonde
 * due.** Sul piano ECONOMICO un corrispettivo è un incasso: alla cassa il
 * denaro è entrato davvero, e negarlo sarebbe falso. Sul piano del MODELLO
 * questa registrazione non ne genera uno in VestiFlow — niente scadenza,
 * niente movimento di tesoreria, niente risorsa finanziaria. Pagamenti e
 * Tesoreria sono dichiarati fuori perimetro (`10` §12), e «non si costruisce
 * una mini-Tesoreria dentro i Corrispettivi».
 *
 * Il giorno in cui quel dominio esisterà, sarà lui a collegarsi qui.
 *
 * Tre verbi soltanto — creare, modificare, eliminare. Niente stato, niente
 * soft-delete, niente controregistrazione: la conseguenza (eliminando il n. 12
 * si passa da 11 a 13) è dichiarata, non nascosta.
 */
@Injectable()
export class ManualReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le sedi che la maschera può proporre.
   *
   * ⚠️ **Esiste perché `GET /inventory/locations` chiede `section.inventory`**, e
   * chi lavora sul Registro Corrispettivi tipicamente non ce l'ha: la tendina
   * sarebbe arrivata vuota con un 403 assorbito in silenzio dal frontend, e una
   * sede obbligatoria che non si può scegliere è una maschera che non salva.
   * L'elenco è lo stesso — sedi operative, incluse nel piano, attive, ristrette
   * a quelle dell'utente — solo dietro il permesso che governa QUESTA scrittura.
   */
  async listUsableLocations(
    tenantId: string,
    user: UserProfileDto | undefined,
  ): Promise<ManualReceiptLocationDto[]> {
    // ⚠️ Lo STESSO helper centrale del filtro del Registro, con l'unico `mode`
    // diverso. Qui c'era una query a mano più un `try/catch` attorno a
    // `assertLocationInUserScope`: funzionava, ma era una seconda regola di
    // accesso scritta in un secondo posto — e due regole che devono dire la
    // stessa cosa prima o poi non la dicono più.
    return listLocationsInScope(this.prisma, tenantId, user, INVENTORY_ACTION_SCOPE_MODE);
  }

  async getById(tenantId: string, id: string): Promise<ManualReceiptDto> {
    const receipt = await this.prisma.manualReceipt.findFirst({
      where: { id, tenantId },
      include: RECEIPT_INCLUDE,
    });
    if (!receipt) {
      throw new NotFoundException('Corrispettivo manuale non trovato');
    }
    return toManualReceiptDto(receipt);
  }

  async create(
    tenantId: string,
    dto: SaveManualReceiptDto,
    user: UserProfileDto,
  ): Promise<ManualReceiptDto> {
    return this.save(tenantId, dto, user, null);
  }

  /**
   * La modifica **aggiorna lo stesso record**, non ne crea un secondo: una
   * registrazione digitata a mano si può sbagliare, ed è normale correggerla.
   * Numero e data di creazione non si toccano.
   */
  async update(
    tenantId: string,
    id: string,
    dto: SaveManualReceiptDto,
    user: UserProfileDto,
  ): Promise<ManualReceiptDto> {
    return this.save(tenantId, dto, user, id);
  }

  /**
   * L'eliminazione è **semplice, e resta semplice**: la registrazione se ne va
   * con le sue righe (cascata), e da quel momento non partecipa più al Registro,
   * ai totali né agli export. Nessuna giacenza da ripristinare — non ne ha mai
   * mosse.
   *
   * **Il buco non si tappa**: le registrazioni successive non si rinumerano.
   */
  async remove(tenantId: string, id: string, user: UserProfileDto): Promise<void> {
    const receipt = await this.prisma.manualReceipt.findFirst({
      where: { id, tenantId },
      select: { id: true, locationId: true },
    });
    if (!receipt) {
      throw new NotFoundException('Corrispettivo manuale non trovato');
    }
    assertLocationInUserScope(user, receipt.locationId, 'write');
    await this.prisma.manualReceipt.delete({ where: { id: receipt.id } });
  }

  // ── Il salvataggio, uno solo per creazione e modifica ──────────────────────

  private async save(
    tenantId: string,
    dto: SaveManualReceiptDto,
    user: UserProfileDto,
    id: string | null,
  ): Promise<ManualReceiptDto> {
    const documentDate = parseDocumentDate(dto.documentDate);
    const pricesIncludeVat = dto.pricesIncludeVat ?? true;

    // ── Sede: tre domande, tre controlli CENTRALI, nessuna policy propria ────
    //
    // 1. appartiene al tenant, è operativa e inclusa nel piano →
    //    `resolveLicensedLocationScope`, lo stesso che alimenta ogni elenco Sede;
    // 2. l'utente è autorizzato a operarci → `assertLocationInUserScope`, la
    //    guardia PURA (⛔ non quella della Vendita al banco, che pretende
    //    `inventory.manage`: su un'entità senza magazzino è un requisito
    //    sbagliato, `10` §13).
    //
    // Sono due chiamate e non una perché i due «no» sono diversi e vanno detti
    // diversamente: una sede che non c'è è 422, una sede che non ti spetta è
    // 403. `resolveOperationalLocationScope` li fonde in un `null` solo, e
    // all'operatore direbbe la cosa sbagliata metà delle volte.
    const licensed = await resolveLicensedLocationScope(this.prisma, tenantId, dto.locationId);
    if (!licensed) {
      throw new UnprocessableEntityException(
        'La sede selezionata non è utilizzabile: non esiste più, non è attiva o non è inclusa nel piano.',
      );
    }
    assertLocationInUserScope(user, dto.locationId, 'write');

    const existing = id
      ? await this.prisma.manualReceipt.findFirst({
          where: { id, tenantId },
          select: { id: true, locationId: true },
        })
      : null;
    if (id && !existing) {
      throw new NotFoundException('Corrispettivo manuale non trovato');
    }
    if (existing) {
      // Modifica su sede già assegnata: deve restare nello scope utente, o si
      // sposterebbe una registrazione su una sede che non si può toccare.
      assertLocationInUserScope(user, existing.locationId, 'write');
    }

    const lines = await this.computeLines(tenantId, dto, pricesIncludeVat);
    const totals = computeManualReceiptTotals(lines);

    const header = {
      documentDate,
      locationId: dto.locationId,
      pricesIncludeVat,
      notes: dto.notes?.trim() || null,
      subtotalMinor: totals.subtotalMinor,
      taxMinor: totals.taxMinor,
      totalMinor: totals.totalMinor,
    };

    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        if (existing) {
          // Le righe si riscrivono per intero: nessuno le referenzia — non ci
          // sono movimenti, impegni o collegamenti documentali — quindi
          // cancellarle e riscriverle è descrivibile e non perde niente.
          await tx.manualReceiptLine.deleteMany({ where: { receiptId: existing.id } });
          await tx.manualReceipt.update({
            where: { id: existing.id },
            data: { ...header, lines: { create: lines.map(toLineCreateData) } },
          });
          return tx.manualReceipt.findUniqueOrThrow({
            where: { id: existing.id },
            include: RECEIPT_INCLUDE,
          });
        }

        // Serie sempre `null`: la colonna esiste per la partizione del motore
        // comune, non per una gestione serie che qui non c'è (`10` §12).
        const series = null;
        // Serializza gli operatori sullo stesso contatore: senza lock due
        // salvataggi simultanei leggono lo stesso massimo e il secondo si becca
        // il vincolo unico a lavoro finito. Transazionale: si rilascia da sé.
        await lockDocumentCounter(tx, { tenantId, type: DocumentType.manual_receipt, series });
        const number = await nextDocumentNumber({
          tx,
          tenantId,
          type: DocumentType.manual_receipt,
          series,
          source: 'manual_receipt',
          documentDate,
        });

        return tx.manualReceipt.create({
          data: {
            tenantId,
            series,
            number,
            ...header,
            createdById: user.id,
            // Snapshot del nome: l'audit regge anche se l'utente cambia nome o
            // sparisce, ed è l'unica traccia che questa entità conserva.
            createdByName: userDisplayName(user),
            lines: { create: lines.map(toLineCreateData) },
          },
          include: RECEIPT_INCLUDE,
        });
      });

      return toManualReceiptDto(saved);
    } catch (error) {
      // Il numero non lo sceglie l'operatore: un conflitto qui è la collisione
      // fra due salvataggi nello stesso istante, non un numero da correggere.
      // Si riconosce con la guardia comune e si dice cosa è successo, invece di
      // proporre un «primo numero libero» che nessuna maschera può ospitare.
      if (isDocumentNumberConflict(error)) {
        throw new ConflictException(
          'Il numero è stato assegnato a un’altra registrazione nello stesso istante. Riprova a salvare.',
        );
      }
      throw error;
    }
  }

  /**
   * Righe da salvare: si scartano quelle vuote, si convalidano le altre.
   *
   * ⚠️ Il Codice IVA è **obbligatorio**, a differenza delle righe documento dove
   * è facoltativo: una riga senza IVA in un corrispettivo non ha senso, e anche
   * esenti e non imponibili passano da un Codice IVA vero — mai una riga
   * fiscalmente indefinita (`vat_snapshot` è `NOT NULL`).
   */
  private async computeLines(
    tenantId: string,
    dto: SaveManualReceiptDto,
    pricesIncludeVat: boolean,
  ): Promise<ComputedManualReceiptLine[]> {
    const persistable: ManualReceiptLineInput[] = [];
    dto.lines.forEach((line, index) => {
      const input: ManualReceiptLineInput = {
        description: line.description ?? '',
        amountMinor: line.amountMinor,
        vatCodeId: line.vatCodeId ?? '',
      };
      // Una riga vuota pronta all'inserimento NON è una riga del database.
      if (isEmptyManualReceiptLine(input)) {
        return;
      }
      // ⚠️ **La descrizione è FACOLTATIVA**, e qui era obbligatoria per mia
      // iniziativa: la specifica non lo chiedeva. Su una chiusura di cassa i
      // dati che contano sono importo e aliquota — la descrizione dice a cosa
      // si riferisce, e spesso non c'è niente da aggiungere. Il riferimento
      // gestionale fa lo stesso: importo e IVA a sinistra, descrizione larga a
      // destra, vuota quanto serve.
      if (!input.vatCodeId) {
        throw new UnprocessableEntityException(
          `Riga ${index + 1}: scegli il Codice IVA della riga.`,
        );
      }
      persistable.push(input);
    });

    if (persistable.length === 0) {
      throw new UnprocessableEntityException('Aggiungi almeno una riga con un importo.');
    }

    const vatCodesById = await this.loadVatCodes(tenantId, persistable);
    return computeManualReceiptLines(persistable, vatCodesById, pricesIncludeVat);
  }

  private async loadVatCodes(
    tenantId: string,
    lines: readonly ManualReceiptLineInput[],
  ): Promise<Map<string, VatCodeWithNature>> {
    const ids = [...new Set(lines.map((line) => line.vatCodeId))];
    const found = await this.prisma.vatCode.findMany({
      where: { tenantId, id: { in: ids }, deletedAt: null },
      include: { nature: true },
    });
    const byId = new Map(found.map((vatCode) => [vatCode.id, vatCode]));

    const lineNumberFor = (vatCodeId: string): number =>
      lines.findIndex((line) => line.vatCodeId === vatCodeId) + 1;

    for (const vatCodeId of ids) {
      const vatCode = byId.get(vatCodeId);
      if (!vatCode) {
        throw new UnprocessableEntityException(
          `Riga ${lineNumberFor(vatCodeId)}: il Codice IVA selezionato non esiste più. Scegli un altro codice.`,
        );
      }
      if (!vatCode.isActive) {
        throw new UnprocessableEntityException(
          `Riga ${lineNumberFor(vatCodeId)}: il Codice IVA "${vatCode.code}" è disattivato. Scegli un codice attivo.`,
        );
      }
      // Un corrispettivo è una vendita: un codice riservato agli acquisti qui
      // non ci sta. Stessa forma del controllo speculare sull'Ordine fornitore.
      if (vatCode.usageScope === 'purchase') {
        throw new UnprocessableEntityException(
          `Riga ${lineNumberFor(vatCodeId)}: il Codice IVA "${vatCode.code}" è riservato agli acquisti e non è utilizzabile in un corrispettivo.`,
        );
      }
    }

    return byId;
  }

}

/**
 * Le date della testata sono giorni, non istanti: mezzanotte UTC del giorno
 * scelto, come ovunque nel progetto. Senza, il fuso locale sposterebbe la
 * registrazione di un giorno — e il periodo del Registro con lei.
 */
function parseDocumentDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new UnprocessableEntityException('La data della registrazione non è valida.');
  }
  return parsed;
}

function userDisplayName(user: UserProfileDto): string {
  return user.displayName?.trim() || user.email || 'Operatore';
}

function toLineCreateData(
  line: ComputedManualReceiptLine,
): Prisma.ManualReceiptLineCreateWithoutReceiptInput {
  return {
    lineNumber: line.lineNumber,
    description: line.description,
    // Colonne NUMERIC: passano da `Prisma.Decimal`, o il float arriva al driver
    // con la sua approssimazione binaria al posto del valore esatto.
    enteredAmountMinor: new Prisma.Decimal(line.enteredAmountMinor),
    netAmountMinor: new Prisma.Decimal(line.netAmountMinor),
    vatSnapshot: line.vatSnapshot,
    netMinor: line.netMinor,
    vatMinor: line.vatMinor,
    grossMinor: line.grossMinor,
    vatCode: { connect: { id: line.vatCodeId } },
  };
}

function toManualReceiptDto(receipt: ManualReceiptRecord): ManualReceiptDto {
  return {
    id: receipt.id,
    number: receipt.number,
    // Solo il giorno: la colonna è `DATE`, e mandare un istante inviterebbe il
    // frontend a interpretarlo nel fuso locale.
    documentDate: receipt.documentDate.toISOString().slice(0, 10),
    locationId: receipt.locationId,
    locationName: receipt.location.name,
    pricesIncludeVat: receipt.pricesIncludeVat,
    notes: receipt.notes,
    currency: receipt.currency,
    subtotalMinor: receipt.subtotalMinor,
    taxMinor: receipt.taxMinor,
    totalMinor: receipt.totalMinor,
    createdByName: receipt.createdByName,
    createdAt: receipt.createdAt.toISOString(),
    updatedAt: receipt.updatedAt.toISOString(),
    lines: receipt.lines.map((line) => ({
      id: line.id,
      lineNumber: line.lineNumber,
      description: line.description,
      // `Decimal` → numero: la coda ci sta tutta, sono 4 cifre di centesimo.
      enteredAmountMinor: Number(line.enteredAmountMinor),
      netAmountMinor: Number(line.netAmountMinor),
      vatCodeId: line.vatCodeId,
      vatSnapshot: line.vatSnapshot,
      netMinor: line.netMinor,
      vatMinor: line.vatMinor,
      grossMinor: line.grossMinor,
    })),
  };
}
