import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, VatCode, VatNature } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { VAT_CODE_SEED, VAT_NATURE_SEED } from './vat-code-seed.data';
import { buildVatCodeSnapshot } from './vat-snapshot.util';

/** Codice IVA con la Natura inclusa (per liste e snapshot). */
export type VatCodeWithNature = VatCode & { nature: VatNature };

export interface UpsertVatCodeInput {
  readonly code: string;
  readonly natureId: string;
  readonly ratePercent: number;
  readonly nonDeductiblePercent?: number;
  readonly description: string;
  readonly notes?: string | null;
  readonly usageScope?: VatCode['usageScope'];
  readonly calculationMode?: VatCode['calculationMode'];
  readonly vatAffectsSupplierTotal?: boolean;
  readonly isDefault?: boolean;
  readonly isActive?: boolean;
}

const CODE_PATTERN = /^[A-Za-z0-9._-]{1,16}$/;

/**
 * Codici IVA aziendali (§3–§5): CRUD per tenant, seed voci iniziali,
 * predefinito unico, disattivazione per le voci già usate. Lo snapshot
 * sulle righe documento rende lo storico indipendente dalle modifiche.
 */
@Injectable()
export class VatCodesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Catalogo Nature IVA di sistema (seed al primo accesso). */
  async listNatures(): Promise<VatNature[]> {
    await this.seedNaturesIfEmpty();
    return this.prisma.vatNature.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async list(tenantId: string): Promise<VatCodeWithNature[]> {
    await this.seedIfEmpty(tenantId);
    return this.prisma.vatCode.findMany({
      where: { tenantId, deletedAt: null },
      include: { nature: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async getById(tenantId: string, id: string): Promise<VatCodeWithNature> {
    const vatCode = await this.prisma.vatCode.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { nature: true },
    });
    if (!vatCode) {
      throw new NotFoundException('Codice IVA non trovato');
    }
    return vatCode;
  }

  async create(tenantId: string, input: UpsertVatCodeInput): Promise<VatCodeWithNature> {
    const code = this.normalizeCode(input.code);
    this.assertValidRate(input.ratePercent, input.nonDeductiblePercent);
    await this.assertCodeAvailable(tenantId, code);
    const description = input.description.trim();
    if (!description) {
      throw new UnprocessableEntityException('La descrizione del Codice IVA è obbligatoria.');
    }

    const last = await this.prisma.vatCode.aggregate({
      where: { tenantId, deletedAt: null },
      _max: { sortOrder: true },
    });

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await this.clearDefaultTx(tx, tenantId);
      }
      const created = await tx.vatCode.create({
        data: {
          tenantId,
          code,
          natureId: input.natureId,
          ratePercent: input.ratePercent,
          nonDeductiblePercent: input.nonDeductiblePercent ?? 0,
          description,
          notes: input.notes?.trim() || null,
          usageScope: input.usageScope ?? 'both',
          calculationMode: input.calculationMode ?? 'standard',
          vatAffectsSupplierTotal: input.vatAffectsSupplierTotal ?? true,
          isDefault: input.isDefault ?? false,
          isActive: input.isActive ?? true,
          isSystem: false,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
        include: { nature: true },
      });
      this.assertDefaultIsActive(created);
      return created;
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: Partial<UpsertVatCodeInput>,
  ): Promise<VatCodeWithNature> {
    const current = await this.getById(tenantId, id);

    let code: string | undefined;
    if (input.code !== undefined) {
      code = this.normalizeCode(input.code);
      if (code.toLowerCase() !== current.code.toLowerCase()) {
        await this.assertCodeAvailable(tenantId, code);
      }
    }
    if (input.ratePercent !== undefined || input.nonDeductiblePercent !== undefined) {
      this.assertValidRate(
        input.ratePercent ?? Number(current.ratePercent),
        input.nonDeductiblePercent ?? Number(current.nonDeductiblePercent),
      );
    }
    const description = input.description?.trim();
    if (input.description !== undefined && !description) {
      throw new UnprocessableEntityException('La descrizione del Codice IVA è obbligatoria.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true && !current.isDefault) {
        await this.clearDefaultTx(tx, tenantId);
      }
      if (input.isDefault === false && current.isDefault) {
        throw new UnprocessableEntityException(
          'Deve esistere un Codice IVA predefinito: imposta prima un altro codice come predefinito.',
        );
      }
      if (input.isActive === false && current.isDefault) {
        throw new UnprocessableEntityException(
          'Il Codice IVA predefinito deve restare attivo: imposta prima un altro predefinito.',
        );
      }
      const updated = await tx.vatCode.update({
        where: { id: current.id },
        data: {
          ...(code !== undefined ? { code } : {}),
          ...(input.natureId !== undefined ? { natureId: input.natureId } : {}),
          ...(input.ratePercent !== undefined ? { ratePercent: input.ratePercent } : {}),
          ...(input.nonDeductiblePercent !== undefined
            ? { nonDeductiblePercent: input.nonDeductiblePercent }
            : {}),
          ...(description !== undefined ? { description } : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
          ...(input.usageScope !== undefined ? { usageScope: input.usageScope } : {}),
          ...(input.calculationMode !== undefined
            ? { calculationMode: input.calculationMode }
            : {}),
          ...(input.vatAffectsSupplierTotal !== undefined
            ? { vatAffectsSupplierTotal: input.vatAffectsSupplierTotal }
            : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: { nature: true },
      });
      this.assertDefaultIsActive(updated);
      return updated;
    });
  }

  /** Duplica una voce esistente con codice nuovo (§5.2). */
  async duplicate(tenantId: string, id: string, newCode: string): Promise<VatCodeWithNature> {
    const source = await this.getById(tenantId, id);
    return this.create(tenantId, {
      code: newCode,
      natureId: source.natureId,
      ratePercent: Number(source.ratePercent),
      nonDeductiblePercent: Number(source.nonDeductiblePercent),
      description: source.description,
      notes: source.notes,
      usageScope: source.usageScope,
      calculationMode: source.calculationMode,
      vatAffectsSupplierTotal: source.vatAffectsSupplierTotal,
      isDefault: false,
      isActive: source.isActive,
    });
  }

  /** Riordina i codici secondo la sequenza di id fornita. */
  async reorder(tenantId: string, orderedIds: readonly string[]): Promise<VatCodeWithNature[]> {
    const codes = await this.prisma.vatCode.findMany({
      where: { tenantId, deletedAt: null },
    });
    const known = new Set(codes.map((vatCode) => vatCode.id));
    const filtered = orderedIds.filter((id) => known.has(id));
    await this.prisma.$transaction(
      filtered.map((id, index) =>
        this.prisma.vatCode.update({ where: { id }, data: { sortOrder: index + 1 } }),
      ),
    );
    return this.list(tenantId);
  }

  /**
   * Elimina un Codice IVA SOLO se mai utilizzato in articoli o documenti
   * (§5.2). Le voci già usate si disattivano, mai eliminate.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const vatCode = await this.getById(tenantId, id);
    if (vatCode.isDefault) {
      throw new ConflictException(
        'Il Codice IVA predefinito non può essere eliminato: imposta prima un altro predefinito.',
      );
    }
    const lineUsage = await this.prisma.documentLine.count({
      where: { tenantId, vatCodeId: id },
    });
    if (lineUsage > 0) {
      throw new ConflictException(
        'Questo Codice IVA è già stato usato in un documento: disattivalo invece di eliminarlo.',
      );
    }
    const productUsage = await this.prisma.product.count({
      where: { tenantId, defaultVatCodeId: id },
    });
    if (productUsage > 0) {
      throw new ConflictException(
        'Questo Codice IVA è assegnato a uno o più articoli: disattivalo invece di eliminarlo.',
      );
    }
    await this.prisma.vatCode.delete({ where: { id: vatCode.id } });
  }

  /** Voce predefinita del tenant (fallback: prima attiva). */
  async getDefault(tenantId: string): Promise<VatCodeWithNature | null> {
    await this.seedIfEmpty(tenantId);
    const explicit = await this.prisma.vatCode.findFirst({
      where: { tenantId, deletedAt: null, isDefault: true, isActive: true },
      include: { nature: true },
    });
    if (explicit) {
      return explicit;
    }
    return this.prisma.vatCode.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      include: { nature: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Snapshot JSON per le righe documento (§9). */
  buildSnapshot(vatCode: VatCodeWithNature): Prisma.InputJsonObject {
    return buildVatCodeSnapshot(vatCode);
  }

  private normalizeCode(raw: string): string {
    const code = raw.trim();
    if (!CODE_PATTERN.test(code)) {
      throw new UnprocessableEntityException(
        'Codice IVA non valido: massimo 16 caratteri tra lettere, numeri, punti, trattini e underscore.',
      );
    }
    return code;
  }

  private assertValidRate(ratePercent: number, nonDeductiblePercent?: number): void {
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      throw new UnprocessableEntityException("L'aliquota deve essere compresa tra 0 e 100.");
    }
    if (
      nonDeductiblePercent !== undefined &&
      (!Number.isFinite(nonDeductiblePercent) ||
        nonDeductiblePercent < 0 ||
        nonDeductiblePercent > 100)
    ) {
      throw new UnprocessableEntityException(
        'La percentuale indetraibile deve essere compresa tra 0 e 100.',
      );
    }
  }

  private assertDefaultIsActive(vatCode: VatCode): void {
    if (vatCode.isDefault && !vatCode.isActive) {
      throw new UnprocessableEntityException('Il Codice IVA predefinito deve essere attivo.');
    }
  }

  private async assertCodeAvailable(tenantId: string, code: string): Promise<void> {
    const duplicate = await this.prisma.vatCode.findFirst({
      where: { tenantId, deletedAt: null, code: { equals: code, mode: 'insensitive' } },
    });
    if (duplicate) {
      throw new ConflictException('Esiste già un Codice IVA con questo codice.');
    }
  }

  private async clearDefaultTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    await tx.vatCode.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async seedNaturesIfEmpty(): Promise<void> {
    const count = await this.prisma.vatNature.count();
    if (count > 0) {
      return;
    }
    await this.prisma.vatNature.createMany({
      data: VAT_NATURE_SEED.map((nature) => ({
        key: nature.key,
        officialCode: nature.officialCode,
        label: nature.label,
        description: nature.description,
        defaultUsageScope: nature.defaultUsageScope,
        defaultCalculationMode: nature.defaultCalculationMode,
        sortOrder: nature.sortOrder,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }

  private async seedIfEmpty(tenantId: string): Promise<void> {
    const count = await this.prisma.vatCode.count({ where: { tenantId } });
    if (count > 0) {
      return;
    }
    await this.seedNaturesIfEmpty();
    const natures = await this.prisma.vatNature.findMany();
    const natureByKey = new Map(natures.map((nature) => [nature.key, nature]));

    await this.prisma.vatCode.createMany({
      data: VAT_CODE_SEED.flatMap((entry) => {
        const nature = natureByKey.get(entry.natureKey);
        if (!nature) {
          return [];
        }
        return [
          {
            tenantId,
            code: entry.code,
            natureId: nature.id,
            ratePercent: entry.ratePercent,
            nonDeductiblePercent: 0,
            description: entry.description,
            usageScope: entry.usageScope,
            calculationMode: entry.calculationMode,
            vatAffectsSupplierTotal: entry.vatAffectsSupplierTotal,
            isSystem: true,
            isDefault: false,
            sortOrder: entry.sortOrder,
          },
        ];
      }),
      skipDuplicates: true,
    });

    // "22" predefinita iniziale (§4.1).
    const preferred = await this.prisma.vatCode.findFirst({
      where: { tenantId, deletedAt: null, code: '22' },
    });
    if (preferred) {
      await this.prisma.vatCode.update({
        where: { id: preferred.id },
        data: { isDefault: true },
      });
      await this.prisma.tenantFeatureSettings.updateMany({
        where: { tenantId, defaultVatCodeId: null },
        data: { defaultVatCodeId: preferred.id },
      });
    }
  }
}
