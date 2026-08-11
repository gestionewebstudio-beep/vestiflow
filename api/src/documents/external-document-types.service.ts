import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type ExternalDocumentType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Tipi documento controparte iniziali di VestiFlow (voci di sistema). */
const SYSTEM_TYPES: readonly {
  readonly name: string;
  readonly shortLabel: string;
  readonly causalTemplate: string;
}[] = [
  { name: 'DDT', shortLabel: 'DDT', causalTemplate: 'DDT {numero} del {data}' },
  { name: 'Fattura', shortLabel: 'Fatt.', causalTemplate: 'Fatt. {numero} del {data}' },
  { name: 'Reso', shortLabel: 'Reso', causalTemplate: 'Reso {numero} del {data}' },
] as const;

export interface UpsertExternalDocumentTypeInput {
  readonly name: string;
  readonly shortLabel?: string;
  readonly causalTemplate?: string;
  readonly isActive?: boolean;
}

/** Quanti documenti portano un tipo, divisi per famiglia (per la conferma UI). */
export interface ExternalDocumentTypeUsage {
  readonly documents: number;
  readonly salesOrders: number;
  readonly supplierOrders: number;
  readonly total: number;
}

/**
 * Tipi documento della controparte (DDT, Fattura, Reso + tipi personalizzati per
 * tenant). Il nome e' univoco per tenant senza distinguere maiuscole/minuscole.
 *
 * Disattivare ed eliminare sono due gesti diversi, e la differenza sta in dove
 * la voce resta visibile:
 *
 * - **disattivato** (`isActive = false`) — fuori dalle tendine dei documenti
 *   nuovi, ma ancora nel pannello di gestione, con il proprio badge, e
 *   riattivabile in un click;
 * - **eliminato** (`deletedAt` valorizzato) — fuori anche dal pannello, non
 *   recuperabile dall'interfaccia.
 *
 * In nessuno dei due casi i documenti gia' salvati perdono qualcosa: l'id resta
 * appeso e lo snapshot dell'etichetta e' scritto sul documento. Un tipo mai
 * usato viene invece eliminato davvero: non c'e' storico da proteggere.
 */
@Injectable()
export class ExternalDocumentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<ExternalDocumentType[]> {
    await this.seedIfEmpty(tenantId);
    return this.prisma.externalDocumentType.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    tenantId: string,
    input: UpsertExternalDocumentTypeInput,
  ): Promise<ExternalDocumentType> {
    const name = input.name.trim();
    if (!name) {
      throw new UnprocessableEntityException('Il nome del tipo documento è obbligatorio.');
    }
    await this.assertNameAvailable(tenantId, name);
    const last = await this.prisma.externalDocumentType.aggregate({
      where: { tenantId, deletedAt: null },
      _max: { sortOrder: true },
    });
    return this.withNameConflictMapped(() =>
      this.prisma.externalDocumentType.create({
        data: {
          tenantId,
          name,
          shortLabel: input.shortLabel?.trim() || name,
          causalTemplate: input.causalTemplate?.trim() || null,
          isSystem: false,
          isActive: input.isActive ?? true,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      }),
    );
  }

  async update(
    tenantId: string,
    id: string,
    input: Partial<UpsertExternalDocumentTypeInput>,
  ): Promise<ExternalDocumentType> {
    const type = await this.getById(tenantId, id);
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new UnprocessableEntityException('Il nome del tipo documento è obbligatorio.');
    }
    if (name && name.toLowerCase() !== type.name.toLowerCase()) {
      await this.assertNameAvailable(tenantId, name);
    }
    return this.withNameConflictMapped(() =>
      this.prisma.externalDocumentType.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(input.shortLabel !== undefined
            ? { shortLabel: input.shortLabel.trim() || name || type.name }
            : {}),
          ...(input.causalTemplate !== undefined
            ? { causalTemplate: input.causalTemplate.trim() || null }
            : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      }),
    );
  }

  /** Riordina i tipi secondo la sequenza di id fornita. */
  async reorder(tenantId: string, orderedIds: readonly string[]): Promise<ExternalDocumentType[]> {
    const types = await this.prisma.externalDocumentType.findMany({
      where: { tenantId, deletedAt: null },
    });
    const known = new Set(types.map((type) => type.id));
    const filtered = orderedIds.filter((id) => known.has(id));
    await this.prisma.$transaction(
      filtered.map((id, index) =>
        this.prisma.externalDocumentType.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
    return this.list(tenantId);
  }

  /**
   * Elimina un tipo. Se non l'ha mai usato nessuno sparisce dalla tabella; se
   * invece qualche documento lo porta, la riga resta ma con `deletedAt`: sparisce
   * dalla tendina e dal pannello, e i documenti storici continuano a mostrarlo.
   *
   * Le causali collegate si scollegano in entrambi i casi: senza, una causale
   * continuerebbe a proporre il modello di un tipo che non esiste piu' (il
   * `ON DELETE SET NULL` della FK non scatta, la riga non viene cancellata).
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const type = await this.getById(tenantId, id);
    const usage = await this.countUsage(tenantId, id);
    const unlinkCausals = this.prisma.goodsReceiptCausal.updateMany({
      where: { tenantId, externalDocumentTypeId: id },
      data: { externalDocumentTypeId: null },
    });

    if (usage.total === 0) {
      await this.prisma.$transaction([
        unlinkCausals,
        this.prisma.externalDocumentType.delete({ where: { id: type.id } }),
      ]);
      return;
    }

    await this.prisma.$transaction([
      unlinkCausals,
      this.prisma.externalDocumentType.update({
        where: { id: type.id },
        data: { deletedAt: new Date(), isActive: false },
      }),
    ]);
  }

  /** Quanti documenti porta il tipo: alimenta la conferma prima di eliminare. */
  async countUsage(tenantId: string, id: string): Promise<ExternalDocumentTypeUsage> {
    const [documents, salesOrders, supplierOrders] = await Promise.all([
      this.prisma.document.count({ where: { tenantId, externalDocumentTypeId: id } }),
      this.prisma.salesOrder.count({ where: { tenantId, externalDocumentTypeId: id } }),
      this.prisma.supplierOrder.count({ where: { tenantId, externalDocumentTypeId: id } }),
    ]);
    return {
      documents,
      salesOrders,
      supplierOrders,
      total: documents + salesOrders + supplierOrders,
    };
  }

  async getById(tenantId: string, id: string): Promise<ExternalDocumentType> {
    const type = await this.prisma.externalDocumentType.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!type) {
      throw new NotFoundException('Tipo documento controparte non trovato');
    }
    return type;
  }

  /**
   * Come `getById`, ma vede anche i tipi eliminati. E' la lettura che serve al
   * SALVATAGGIO di un documento: riaprire un vecchio arrivo merce il cui tipo e'
   * stato eliminato nel frattempo non deve dare 404, e soprattutto non deve
   * cancellare il tipo dal documento solo perche' non lo si e' saputo risolvere.
   * Ritorna `null` invece di lanciare: chi salva decide cosa farne.
   */
  async findByIdIncludingDeleted(
    tenantId: string,
    id: string,
  ): Promise<ExternalDocumentType | null> {
    return this.prisma.externalDocumentType.findFirst({ where: { id, tenantId } });
  }

  /**
   * Risolve il tipo in coppia id + snapshot, pronta da scrivere in testata.
   * `null`/assente azzera entrambi; un id sconosciuto e' un 404.
   *
   * La usano tutti e quattro i percorsi di salvataggio (documenti generici,
   * arrivo merce, ordine cliente, ordine fornitore): lo snapshot deve essere
   * sempre lo `shortLabel`, e sempre scritto insieme all'id — sono la stessa
   * informazione vista da due lati, e separarli e' il modo per ritrovarsi con
   * un documento che punta a un tipo senza sapere come si chiamava.
   */
  async resolveForWrite(
    tenantId: string,
    id: string | null | undefined,
  ): Promise<{
    externalDocumentTypeId: string | null;
    externalDocumentTypeSnapshot: string | null;
  }> {
    if (!id) {
      return { externalDocumentTypeId: null, externalDocumentTypeSnapshot: null };
    }
    const type = await this.findByIdIncludingDeleted(tenantId, id);
    if (!type) {
      throw new NotFoundException('Tipo documento controparte non trovato');
    }
    return { externalDocumentTypeId: type.id, externalDocumentTypeSnapshot: type.shortLabel };
  }

  private async assertNameAvailable(tenantId: string, name: string): Promise<void> {
    const duplicate = await this.prisma.externalDocumentType.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      throw new ConflictException('Esiste già un tipo documento con questo nome.');
    }
  }

  /**
   * L'indice unico e' parziale (`WHERE deleted_at IS NULL`) e vive nella
   * migration, non nello schema: se per una corsa fra due richieste il controllo
   * applicativo passa e il database no, l'operatore deve leggere il 409 e non un
   * errore di Prisma.
   */
  private async withNameConflictMapped<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esiste già un tipo documento con questo nome.');
      }
      throw error;
    }
  }

  /**
   * Il conteggio ignora i tipi eliminati apposta: un tenant che li ha eliminati
   * tutti si ritroverebbe con una tendina vuota e nessun modo di ripartire.
   */
  private async seedIfEmpty(tenantId: string): Promise<void> {
    const count = await this.prisma.externalDocumentType.count({
      where: { tenantId, deletedAt: null },
    });
    if (count > 0) {
      return;
    }
    await this.prisma.externalDocumentType.createMany({
      data: SYSTEM_TYPES.map((type, index) => ({
        tenantId,
        name: type.name,
        shortLabel: type.shortLabel,
        causalTemplate: type.causalTemplate,
        isSystem: true,
        isActive: true,
        sortOrder: index + 1,
      })),
      skipDuplicates: true,
    });
  }
}
