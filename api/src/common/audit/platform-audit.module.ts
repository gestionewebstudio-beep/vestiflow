import { Global, Module } from '@nestjs/common';

import { PlatformAuditPrismaClient } from './platform-audit-prisma.client';
import { PlatformAuditService } from './platform-audit.service';

/**
 * ⭐ **Globale, come `PlatformAdminModule`**, e per la stessa ragione: il
 *    registro e' UNO SOLO (`docs/DA-FARE` §10.3) e lo scriveranno percorsi di
 *    domini diversi — cestino, storico Shopify, cancellazione amministrativa.
 *    Esporlo modulo per modulo inviterebbe a farne una copia per dominio, che
 *    e' esattamente cio' che quella decisione esclude.
 */
/**
 * ⭐ **Il client riservato e' un provider di QUESTO modulo**, quindi uno solo
 *    per istanza dell'applicazione (Nest istanzia un provider una volta per
 *    modulo, e questo e' globale). ⛔ Non si esporta: nessuno deve poterlo
 *    iniettare per scriverci altro — e' la connessione del registro, non una
 *    seconda via al database.
 */
@Global()
@Module({
  providers: [PlatformAuditPrismaClient, PlatformAuditService],
  exports: [PlatformAuditService],
})
export class PlatformAuditModule {}
