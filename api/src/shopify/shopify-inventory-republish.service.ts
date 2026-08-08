import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';

/**
 * Quante ripubblicazioni si ritentano per passata.
 *
 * L'Admin API Shopify è a quota, e una coda lunga svuotata tutta insieme se la
 * mangia — penalizzando le sincronizzazioni che l'operatore sta aspettando. Il
 * resto si riprende alla passata dopo, e quante ne restano viene DETTO: un tetto
 * silenzioso si legge come «ho finito», che è la conclusione sbagliata.
 */
const REPUBLISH_BATCH_LIMIT = 50;

export interface InventoryRepublishResult {
  /** Disallineamenti in coda all'inizio della passata. */
  readonly pending: number;
  /** Ripubblicazioni tentate in questa passata (tetto compreso). */
  readonly attempted: number;
  /** Tentativi andati a buon fine. */
  readonly succeeded: number;
  /** Ancora in coda dopo la passata: falliti più quelli oltre il tetto. */
  readonly remaining: number;
}

/**
 * Ripubblicazione dei disallineamenti inventario rimasti in sospeso.
 *
 * Quando il webhook `inventory_levels/update` porta un valore che VestiFlow non
 * sa giustificare («Caso D»), VestiFlow resta fonte di verità e riprogramma la
 * pubblicazione del proprio. Quella pubblicazione però è **un tentativo solo**,
 * lanciato senza attenderne l'esito: se fallisce resta un warning nel log e il
 * flag `mismatchDetected` acceso — che finora **non leggeva nessuno**, e che
 * nessun meccanismo riprovava. La divergenza restava lì per sempre, in silenzio.
 *
 * Qui la coda si svuota, e lo fa in coda allo scarico inventario: quello è il
 * momento in cui l'operatore sta già aspettando Shopify, e nell'applicazione non
 * esiste nessuno scheduler a cui appendere un ritentativo automatico.
 *
 * Non c'è bisogno di cancellare il flag a mano: la ripubblicazione riuscita
 * torna indietro come webhook, e la riconciliazione lo riconosce come eco del
 * proprio push (Caso B) e lo spegne lei.
 */
@Injectable()
export class ShopifyInventoryRepublishService {
  private readonly logger = new Logger(ShopifyInventoryRepublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryPush: ShopifyInventoryPushService,
  ) {}

  async retryPending(tenantId: string): Promise<InventoryRepublishResult> {
    const pending = await this.prisma.shopifyInventorySyncState.count({
      where: { tenantId, mismatchDetected: true },
    });
    if (pending === 0) {
      return { pending: 0, attempted: 0, succeeded: 0, remaining: 0 };
    }

    const batch = await this.prisma.shopifyInventorySyncState.findMany({
      where: { tenantId, mismatchDetected: true },
      select: { variantId: true, locationId: true },
      // I più vecchi per primi: una coda che si svuota dalla coda lascia
      // indietro sempre gli stessi.
      orderBy: { updatedAt: 'asc' },
      take: REPUBLISH_BATCH_LIMIT,
    });

    let succeeded = 0;
    for (const row of batch) {
      try {
        await this.inventoryPush.pushLevel(tenantId, row.variantId, row.locationId);
        succeeded += 1;
      } catch (error: unknown) {
        // Un fallimento non ferma gli altri: sono righe indipendenti, e
        // recuperarne nove su dieci è meglio che nessuna.
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        this.logger.warn(
          `Ripubblicazione non riuscita (${tenantId}) variante ${row.variantId} @ ${row.locationId}: ${message}`,
        );
      }
    }

    const remaining = pending - succeeded;
    this.logger.log(
      `Ripubblicazione disallineamenti (${tenantId}): ${succeeded}/${batch.length} riuscite, ${remaining} ancora in coda.`,
    );

    return { pending, attempted: batch.length, succeeded, remaining };
  }
}
