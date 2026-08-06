import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  buildSkuBase,
  withCollisionSuffix,
  withProgressive,
  type SkuGenerationInput,
} from './sku-generator.util';

/** Limite di sicurezza contro loop infiniti in scenari patologici. */
const MAX_ATTEMPTS = 500;

/**
 * Genera l'anteprima di uno SKU prevedibile (specifica cliente §SKU) e ne
 * risolve automaticamente l'unicita' nel tenant, incrementando il
 * progressivo finche' non trova un codice libero. NON scrive mai su
 * database (solo anteprima): il salvataggio resta un'azione esplicita
 * dell'utente, validata di nuovo (vincolo unico + controllo applicativo) al
 * momento del submit — cosi' una collisione concorrente resta un 409
 * chiaro, mai una sovrascrittura silenziosa dell'articolo esistente.
 */
@Injectable()
export class SkuGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async previewSku(tenantId: string, input: SkuGenerationInput): Promise<string> {
    const { base, hasAttributeSegments } = buildSkuBase(input);
    if (hasAttributeSegments) {
      return this.resolveWithCollisionSuffix(tenantId, base);
    }
    return this.resolveWithProgressive(tenantId, base);
  }

  /**
   * Codici gia' qualificati da attributi variante (es. MAG-BASIC-NER-S): il
   * primo tentativo e' il codice "pulito"; solo in caso di collisione si
   * aggiunge un suffisso progressivo breve (-02, -03, ...).
   */
  private async resolveWithCollisionSuffix(tenantId: string, base: string): Promise<string> {
    if (!(await this.isTaken(tenantId, base))) {
      return base;
    }
    for (let seq = 2; seq <= MAX_ATTEMPTS; seq += 1) {
      const candidate = withCollisionSuffix(base, seq);
      if (!(await this.isTaken(tenantId, candidate))) {
        return candidate;
      }
    }
    return `${base}-${Date.now()}`;
  }

  /**
   * Codici senza attributi variante distintivi (prodotto semplice o codice
   * modello condiviso): il progressivo a 5 cifre e' il meccanismo di
   * unicita' principale, non un fallback di collisione. Parte dal conteggio
   * dei codici gia' assegnati con lo stesso prefisso per evitare di
   * ripartire sempre da 1 (piu' realistico e piu' veloce da risolvere).
   */
  private async resolveWithProgressive(tenantId: string, base: string): Promise<string> {
    const prefix = `${base}-`;
    const existingCount = await this.prisma.productVariant.count({
      where: { tenantId, sku: { startsWith: prefix, mode: 'insensitive' } },
    });

    let seq = existingCount + 1;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const candidate = withProgressive(base, seq);
      if (!(await this.isTaken(tenantId, candidate))) {
        return candidate;
      }
      seq += 1;
    }
    return `${base}-${Date.now()}`;
  }

  private async isTaken(tenantId: string, candidate: string): Promise<boolean> {
    const existing = await this.prisma.productVariant.findFirst({
      where: { tenantId, sku: { equals: candidate, mode: 'insensitive' } },
      select: { id: true },
    });
    return existing !== null;
  }
}
