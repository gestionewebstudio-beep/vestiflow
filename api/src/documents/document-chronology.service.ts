import { Injectable } from '@nestjs/common';
import type { DocumentType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { findChronologyAnomalies, type ChronologyAnomaly } from './document-chronology.util';
import { numberSourceForType } from './document-numbering.util';

/** Esito del controllo: l'elenco, più se l'operatore ha spento l'avviso. */
export interface ChronologyCheck {
  readonly anomalies: readonly ChronologyAnomaly[];
  readonly dismissed: boolean;
}

/**
 * **Controllo cronologico** (specifica numerazione §4): dentro lo stesso
 * contatore, a numero più alto deve corrispondere data uguale o successiva.
 *
 * È un **avviso, non un blocco**: si salva comunque. E l'avviso è
 * **persistente** — continua a comparire finché l'anomalia resta nei dati, anche
 * sui documenti successivi corretti. È voluto: un buco non giustificato va
 * risolto, e un avviso che sparisce da solo lascia dimenticare.
 *
 * L'operatore può spegnerlo, ma **solo per il tipo documento in cui è comparso**:
 * chi sistema le fatture non resta cieco sui DDT.
 */
@Injectable()
export class DocumentChronologyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Anomalie del contatore, più lo stato della preferenza.
   *
   * Le due letture stanno insieme perché la maschera ne fa una domanda sola —
   * «devo mostrare l'avviso?» — e separarle vorrebbe dire due giri di rete per
   * decidere una cosa che si decide in un punto.
   */
  async check(
    tenantId: string,
    userId: string | undefined,
    type: DocumentType,
    series: string | null,
  ): Promise<ChronologyCheck> {
    const [anomalies, dismissed] = await Promise.all([
      findChronologyAnomalies({
        tx: this.prisma,
        tenantId,
        type,
        series,
        source: numberSourceForType(type),
      }),
      userId ? this.isDismissed(tenantId, userId, type) : Promise.resolve(false),
    ]);
    return { anomalies, dismissed };
  }

  /** L'avviso è spento per questo operatore su questo tipo documento? */
  async isDismissed(tenantId: string, userId: string, type: DocumentType): Promise<boolean> {
    const row = await this.prisma.userDocumentChronologyWarningPreference.findUnique({
      where: { tenantId_userId_documentType: { tenantId, userId, documentType: type } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Spegne l'avviso per (tenant, utente, tipo). **Una volta spenta resta
   * spenta**: nessuna riaccensione, nessun pannello nelle Impostazioni.
   *
   * `upsert` senza `update`: la riga esiste già o si crea, e riscriverla non
   * avrebbe senso — non c'è un valore che cambi, l'esistenza È la preferenza.
   * Rende anche l'operazione idempotente, che serve perché la casella può
   * arrivare due volte da due schede aperte.
   */
  async dismiss(tenantId: string, userId: string, type: DocumentType): Promise<void> {
    await this.prisma.userDocumentChronologyWarningPreference.upsert({
      where: { tenantId_userId_documentType: { tenantId, userId, documentType: type } },
      create: { tenantId, userId, documentType: type },
      update: {},
    });
  }
}
