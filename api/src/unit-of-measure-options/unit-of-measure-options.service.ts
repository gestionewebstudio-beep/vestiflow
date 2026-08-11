import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { UnitOfMeasureOption } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UNIT_OF_MEASURE_SEED } from './unit-of-measure-seed.data';

/**
 * Le unità di misura suggerite al tenant.
 *
 * **Suggerimenti, non autorità.** Righe documento e anagrafiche salvano la
 * stringa e nient'altro: nessuna chiave esterna punta qui. Perciò eliminare una
 * voce non ha guardie da superare e non tocca un solo dato salvato — il valore
 * sulla riga resta scritto, e semplicemente smette di essere proposto. È lo
 * stesso contratto di `PaymentOptionsService`, e per la stessa ragione: si sta
 * gestendo un elenco di stringhe.
 */
@Injectable()
export class UnitOfMeasureOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<UnitOfMeasureOption[]> {
    await this.seedIfEmpty(tenantId);
    return this.prisma.unitOfMeasureOption.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, name: string): Promise<UnitOfMeasureOption> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException("Il nome dell'unità è obbligatorio.");
    }
    await this.assertNameAvailable(tenantId, trimmed);

    const last = await this.prisma.unitOfMeasureOption.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });

    return this.prisma.unitOfMeasureOption.create({
      data: { tenantId, name: trimmed, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
  }

  async update(
    tenantId: string,
    id: string,
    input: { name?: string; isActive?: boolean; sortOrder?: number },
  ): Promise<UnitOfMeasureOption> {
    const current = await this.getById(tenantId, id);

    let name: string | undefined;
    if (input.name !== undefined) {
      name = input.name.trim();
      if (!name) {
        throw new UnprocessableEntityException("Il nome dell'unità è obbligatorio.");
      }
      if (name.toLowerCase() !== current.name.toLowerCase()) {
        await this.assertNameAvailable(tenantId, name);
      }
    }

    return this.prisma.unitOfMeasureOption.update({
      where: { id: current.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  }

  /**
   * Elimina la voce. Nessuna guardia, e non è una dimenticanza: i documenti e le
   * anagrafiche portano la stringa, non un riferimento. Quello che è scritto
   * resta scritto; sparisce solo il suggerimento.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    const option = await this.getById(tenantId, id);
    await this.prisma.unitOfMeasureOption.delete({ where: { id: option.id } });
  }

  private async getById(tenantId: string, id: string): Promise<UnitOfMeasureOption> {
    const option = await this.prisma.unitOfMeasureOption.findFirst({ where: { id, tenantId } });
    if (!option) {
      throw new NotFoundException('Unità di misura non trovata');
    }
    return option;
  }

  private async assertNameAvailable(tenantId: string, name: string): Promise<void> {
    const duplicate = await this.prisma.unitOfMeasureOption.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Esiste già un’unità con questo nome.');
    }
  }

  /**
   * Al primo accesso il tenant riceve le sei unità della costante condivisa.
   *
   * Solo se l'elenco è **vuoto**: chi le ha già toccate — rinominate, tolte,
   * riordinate — non se le ritrova ricomparire. Un elenco svuotato di proposito
   * si ripopolerebbe, ed è il caso in cui un seed idempotente farebbe il danno
   * invece di evitarlo; qui la scelta è che un elenco vuoto valga «non ancora
   * inizializzato», come per le voci pagamento.
   */
  private async seedIfEmpty(tenantId: string): Promise<void> {
    const count = await this.prisma.unitOfMeasureOption.count({ where: { tenantId } });
    if (count > 0) {
      return;
    }
    await this.prisma.unitOfMeasureOption.createMany({
      data: UNIT_OF_MEASURE_SEED.map((name, index) => ({
        tenantId,
        name,
        sortOrder: index + 1,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
  }
}
