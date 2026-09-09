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

/**
 * L'esito di una passata di ripubblicazione, in classi che NON si confondono.
 *
 * ⛔ **Qui c'era `succeeded`, e contava ogni chiamata che non aveva sollevato.**
 *    `pushLevel` non solleva mai — cattura l'errore e restituisce un esito —
 *    quindi contava come riuscite anche le righe per cui non era partito
 *    niente, quelle rifiutate e quelle fallite. E siccome l'arretrato si
 *    calcolava per sottrazione, il difetto andava nella direzione peggiore per
 *    una misura: «sembra meglio di com'è».
 *
 * ⭐ **Una riuscita è un INVIO CONFERMATO.** Le altre tre classi esistono perché
 *    hanno rimedi diversi: `unchanged` è il push che non aveva niente da
 *    mandare, `refused` è lo storico che vieta quel collegamento (26.8) e non
 *    si risolve ritentando, `failed` è un guasto che ritentare può risolvere.
 */
export interface InventoryRepublishResult {
  /** Disallineamenti in coda all'inizio della passata. */
  readonly pending: number;
  /** Righe prese in questa passata (tetto compreso). */
  readonly attempted: number;
  /** ⭐ Invio CONFERMATO: la quantità è partita e Shopify l'ha accettata. */
  readonly republished: number;
  /**
   * Nessun invio: il push non aveva niente da mandare, mancava un requisito, o
   * un **rinvio** in corso lo ha trattenuto.
   *
   * ⚠️ **Il rinvio non ha una classe sua, ed è una scelta dichiarata.** Sarebbe
   *    la quinta, e cambierebbe il contratto fino alla schermata: qui il
   *    perimetro è il ritentativo. Il motivo preciso resta nel `reason` del push
   *    (`rinvio_attivo`) e nel log; a schermo si legge «senza invio», che è
   *    vero. Se un giorno il rinvio dovrà distinguersi, è una decisione a sé.
   */
  readonly unchanged: number;
  /** Rifiutato dallo storico: il collegamento non è utilizzabile (26.8). */
  readonly refused: number;
  /** Errore: il canale ha rifiutato o non ha risposto. */
  readonly failed: number;
  /**
   * Ancora da risolvere dopo la passata.
   *
   * ⭐ **Si RICONTA, non si sottrae.** Il marcatore si spegne solo per un invio
   *    riuscito o per un'eco riconosciuta, e ricontarlo è l'unico modo di dire
   *    ciò che resta davvero — comprese le righe che nessuno ha toccato.
   *
   * ⭐ **Ed è falsificata da una prova, dal 09/09/2026.** In una passata
   *    sequenziale ricontato e sottratto coincidono, e per questo il difetto era
   *    rimasto scoperto: la differenza esiste solo quando qualcosa spegne un
   *    marcatore **fuori** da questa passata. `V10` riproduce quella concorrenza
   *    invece di aspettarla — intercetta la chiamata al canale e risolve un
   *    altro pendente mentre la passata è in corso — e sostituire la riconta con
   *    una sottrazione la fa diventare rossa.
   *
   * ⛔ **Qui c'era scritto che nessuna prova la distingueva**, e chi lo avesse
   *    letto avrebbe potuto sostituirla con una sottrazione «equivalente»
   *    convinto che niente lo fermasse.
   */
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
 * Non c'è bisogno di cancellare il flag a mano: lo spegne la registrazione
 * dell'invio riuscito (`recordSuccessfulPush`), nella stessa scrittura con cui
 * annota l'ultimo inviato. ⭐ **È la ragione per cui una seconda passata senza
 * nuove divergenze non ripete niente**: la riga esce dalla coda subito, senza
 * dover aspettare che l'eco del proprio push torni indietro come webhook.
 *
 * ⛔ **Qui c'era scritto che a spegnerlo era l'eco (Caso B).** Non è vero, ed è
 *    una differenza che conta: i webhook possono essere spenti, e in quel caso
 *    la coda non si sarebbe svuotata mai.
 */
@Injectable()
export class ShopifyInventoryRepublishService {
  private readonly logger = new Logger(ShopifyInventoryRepublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryPush: ShopifyInventoryPushService,
  ) {}

  async retryPending(tenantId: string): Promise<InventoryRepublishResult> {
    const pending = await this.contaInCoda(tenantId);
    if (pending === 0) {
      return {
        pending: 0,
        attempted: 0,
        republished: 0,
        unchanged: 0,
        refused: 0,
        failed: 0,
        remaining: 0,
      };
    }

    const batch = await this.prisma.shopifyInventorySyncState.findMany({
      where: { tenantId, mismatchDetected: true },
      select: { variantId: true, locationId: true },
      // I più vecchi per primi: una coda che si svuota dalla coda lascia
      // indietro sempre gli stessi.
      orderBy: { updatedAt: 'asc' },
      take: REPUBLISH_BATCH_LIMIT,
    });

    let republished = 0;
    let unchanged = 0;
    let refused = 0;
    let failed = 0;

    for (const row of batch) {
      try {
        // ⭐ **La porta di RECUPERO, non quella ordinaria.** È l'unica che supera
        //    il confronto con l'ultimo inviato — che nel caso canonico del
        //    disallineamento è proprio il valore da mettere in dubbio — e
        //    l'unica che, prima di farlo, rivaluta se il disallineamento esiste
        //    ancora e se nel frattempo è sopravvenuto un rinvio.
        const esito = await this.inventoryPush.ripubblicaDisallineamento(
          tenantId,
          row.variantId,
          row.locationId,
        );
        // ⛔ **Si guarda l'ESITO, non il fatto che non abbia sollevato.**
        //    `pushLevel` cattura i propri errori e li restituisce: contare la
        //    chiamata invece dell'esito è ciò che rendeva la misura falsa.
        if (esito.pushed) {
          republished += 1;
        } else if (esito.reason === 'collegamento_escluso') {
          refused += 1;
        } else if (esito.reason === 'shopify_error') {
          failed += 1;
        } else {
          // `unchanged`, `rinvio_attivo`, `not_connected`, `sync_disabled`,
          // `variant_not_linked`, `location_not_linked`, `level_not_found`,
          // scope mancante: nessun invio, e nessuno di questi è una riuscita.
          unchanged += 1;
        }
      } catch (error: unknown) {
        // Un fallimento non ferma gli altri: sono righe indipendenti, e
        // recuperarne nove su dieci è meglio che nessuna.
        failed += 1;
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        this.logger.warn(
          `Ripubblicazione non riuscita (${tenantId}) variante ${row.variantId} @ ${row.locationId}: ${message}`,
        );
      }
    }

    // ⭐ Ricontato, non dedotto: è l'unico numero che corrisponde a ciò che
    //    resta davvero da risolvere.
    const remaining = await this.contaInCoda(tenantId);
    this.logger.log(
      `Ripubblicazione disallineamenti (${tenantId}): ${republished} ripubblicate, ` +
        `${unchanged} senza invio, ${refused} rifiutate, ${failed} fallite ` +
        `su ${batch.length} tentate; ${remaining} ancora da risolvere.`,
    );

    return { pending, attempted: batch.length, republished, unchanged, refused, failed, remaining };
  }

  private contaInCoda(tenantId: string): Promise<number> {
    return this.prisma.shopifyInventorySyncState.count({
      where: { tenantId, mismatchDetected: true },
    });
  }
}
