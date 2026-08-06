import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PaymentOption, PaymentOptionKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_OPTION_SEED, SDI_PAYMENT_METHOD_NAMES } from './payment-option-seed.data';

/**
 * Voci pagamento del tenant (logica Danea): modalità e condizioni sono due
 * elenchi separati, preimpostati al primo accesso e gestibili dalle
 * Impostazioni. Le anagrafiche salvano il NOME della voce (snapshot):
 * rinominare o eliminare una voce non riscrive i ruoli già salvati.
 */
@Injectable()
export class PaymentOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, kind?: PaymentOptionKind): Promise<PaymentOption[]> {
    await this.seedIfEmpty(tenantId);
    return this.prisma.paymentOption.findMany({
      where: { tenantId, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    tenantId: string,
    kind: PaymentOptionKind,
    name: string,
  ): Promise<PaymentOption> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Il nome della voce è obbligatorio.');
    }
    await this.assertNameAvailable(tenantId, kind, trimmed);

    const last = await this.prisma.paymentOption.aggregate({
      where: { tenantId, kind },
      _max: { sortOrder: true },
    });

    return this.prisma.paymentOption.create({
      data: {
        tenantId,
        kind,
        name: trimmed,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: { name?: string; isActive?: boolean; sortOrder?: number },
  ): Promise<PaymentOption> {
    const current = await this.getById(tenantId, id);

    let name: string | undefined;
    if (input.name !== undefined) {
      name = input.name.trim();
      if (!name) {
        throw new UnprocessableEntityException('Il nome della voce è obbligatorio.');
      }
      if (name.toLowerCase() !== current.name.toLowerCase()) {
        await this.assertNameAvailable(tenantId, current.kind, name);
      }
    }

    return this.prisma.paymentOption.update({
      where: { id: current.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  }

  /**
   * Elimina la voce. Le anagrafiche salvano il nome come stringa, quindi
   * l'eliminazione non tocca i ruoli già configurati: la voce sparisce
   * solo dalle nuove selezioni.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const option = await this.getById(tenantId, id);
    await this.prisma.paymentOption.delete({ where: { id: option.id } });
  }

  private async getById(tenantId: string, id: string): Promise<PaymentOption> {
    const option = await this.prisma.paymentOption.findFirst({
      where: { id, tenantId },
    });
    if (!option) {
      throw new NotFoundException('Voce pagamento non trovata');
    }
    return option;
  }

  private async assertNameAvailable(
    tenantId: string,
    kind: PaymentOptionKind,
    name: string,
  ): Promise<void> {
    const duplicate = await this.prisma.paymentOption.findFirst({
      where: { tenantId, kind, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Esiste già una voce con questo nome.');
    }
  }

  private async seedIfEmpty(tenantId: string): Promise<void> {
    const count = await this.prisma.paymentOption.count({ where: { tenantId } });
    if (count > 0) {
      // Top-up idempotente: i tenant già inizializzati ricevono le modalità
      // normative fatturazione elettronica mancanti (MP01–MP23) senza toccare
      // le voci esistenti o rinominate (unique tenantId+kind+name).
      await this.ensureSdiPaymentMethods(tenantId);
      return;
    }
    await this.prisma.paymentOption.createMany({
      data: PAYMENT_OPTION_SEED.map((entry) => ({
        tenantId,
        kind: entry.kind,
        name: entry.name,
        sortOrder: entry.sortOrder,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }

  private async ensureSdiPaymentMethods(tenantId: string): Promise<void> {
    const missingCount = await this.prisma.paymentOption.count({
      where: { tenantId, kind: 'method', name: { in: [...SDI_PAYMENT_METHOD_NAMES] } },
    });
    if (missingCount >= SDI_PAYMENT_METHOD_NAMES.length) {
      return;
    }
    const last = await this.prisma.paymentOption.aggregate({
      where: { tenantId, kind: 'method' },
      _max: { sortOrder: true },
    });
    const base = last._max.sortOrder ?? 0;
    await this.prisma.paymentOption.createMany({
      data: SDI_PAYMENT_METHOD_NAMES.map((name, index) => ({
        tenantId,
        kind: 'method' as const,
        name,
        sortOrder: base + index + 1,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }
}
