import { Injectable } from '@nestjs/common';
import type { DocumentType } from '@prisma/client';

import { assertCanViewDocumentType } from '../auth/document-permission.util';
import { PrismaService } from '../prisma/prisma.service';
import { findChronologyConflicts, type ChronologyConflict } from './document-chronology.util';
import { numberSourceForType } from './document-numbering.util';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';

/** Esito del controllo: i conflitti, più se l'operatore ha spento l'avviso. */
export interface ChronologyCheck {
  readonly conflicts: readonly ChronologyConflict[];
  readonly dismissed: boolean;
}

/**
 * **Controllo cronologico** (specifica numerazione §4): dentro lo stesso
 * contatore, a numero più alto deve corrispondere data uguale o successiva.
 *
 * È un **avviso, non un blocco**: si salva comunque. E riguarda **il documento
 * che si sta salvando**, non lo stato generale della serie: si confronta la
 * coppia (numero, data) in testata con quelle già registrate, e si nomina chi la
 * smentisce.
 *
 * _Fino al 13/08/2026 guardava la serie intera, e per questo arrivava sempre in
 * ritardo di un gesto: girando prima della scrittura non poteva vedere
 * l'anomalia che la scrittura stava creando. Il §4 racconta la misura._
 *
 * L'operatore può spegnerlo, ma **solo per il tipo documento in cui è comparso**:
 * chi sistema le fatture non resta cieco sui DDT.
 */
@Injectable()
export class DocumentChronologyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * I conflitti del documento in salvataggio, più lo stato della preferenza.
   *
   * Le due letture stanno insieme perché la maschera ne fa una domanda sola —
   * «devo mostrare l'avviso?» — e separarle vorrebbe dire due giri di rete per
   * decidere una cosa che si decide in un punto.
   */
  async check(input: {
    readonly tenantId: string;
    readonly user: UserProfileDto | undefined;
    readonly type: DocumentType;
    readonly series: string | null;
    readonly number: number;
    readonly documentDate: Date;
    readonly excludeId?: string | null;
  }): Promise<ChronologyCheck> {
    const { tenantId, user, type } = input;
    // Il tipo arriva dal client, non da un documento salvato: senza questa
    // guardia la risposta nomina numeri, date e riferimenti di una famiglia
    // che l'utente non può consultare.
    assertCanViewDocumentType(user, type);
    const userId = user?.id;
    const [conflicts, dismissed] = await Promise.all([
      findChronologyConflicts({
        tx: this.prisma,
        tenantId,
        type,
        series: input.series,
        source: numberSourceForType(type),
        number: input.number,
        documentDate: input.documentDate,
        excludeId: input.excludeId ?? null,
      }),
      userId ? this.isDismissed(tenantId, userId, type) : Promise.resolve(false),
    ]);
    return { conflicts, dismissed };
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
  async dismiss(tenantId: string, user: UserProfileDto, type: DocumentType): Promise<void> {
    // Anche spegnere è un'operazione sul tipo: chi non può consultare quella
    // famiglia non deve poterle scrivere una preferenza.
    assertCanViewDocumentType(user, type);
    const userId = user.id;
    await this.prisma.userDocumentChronologyWarningPreference.upsert({
      where: { tenantId_userId_documentType: { tenantId, userId, documentType: type } },
      create: { tenantId, userId, documentType: type },
      update: {},
    });
  }
}
