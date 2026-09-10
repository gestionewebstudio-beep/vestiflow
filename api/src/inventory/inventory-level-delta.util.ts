import { Prisma } from '@prisma/client';

/**
 * DA DOVE viene una variazione di Disponibile. `docs/DA-FARE.md` §31.
 *
 * ⛔ **È un parametro OBBLIGATORIO, non un'opzione con un default.** Un default
 *    direbbe «locale» per le variazioni che nessuno ha classificato — cioè
 *    proprio quelle che si dimenticano — e rimanderebbe a Shopify un effetto
 *    che Shopify ha già applicato, sottraendo due volte la stessa vendita.
 *    Chiedendolo, chi aggiunge un percorso nuovo **deve** dichiararlo o non
 *    compila.
 */
export type OrigineVariazione =
  /** L'ha fatta VestiFlow: va trasmessa al canale. */
  | 'locale'
  /** L'ha già applicata Shopify in casa propria: NON si rimanda indietro. */
  | 'canale';

/**
 * L'origine di un impegno, **dedotta dal canale dell'ordine**.
 *
 * ⭐ **Non serve un parametro nuovo: il dato c'è già.** `StockReservation.channel`
 *    e `SyncOrderReservationsParams.channel` portano `SalesOrderSource`, che è
 *    la stessa informazione sotto un altro nome. Aggiungerne uno gemello
 *    creerebbe due verità su cui poi divergere.
 *
 * ⚠️ **`shopify_pos` sta con `shopify_online`**, e non per simmetria: se
 *    l'impegno arriva da un ordine Shopify — vetrina o cassa che sia — Shopify
 *    lo ha già applicato in casa propria, e rimandarglielo lo sottrarrebbe due
 *    volte. Il criterio è **chi ha già applicato l'effetto**, non dove è
 *    avvenuta la vendita.
 */
export function origineDaCanaleOrdine(
  channel: 'shopify_online' | 'shopify_pos' | 'manual' | 'store',
): OrigineVariazione {
  return channel === 'shopify_online' || channel === 'shopify_pos' ? 'canale' : 'locale';
}

/**
 * Registra l'origine sulla riga di stato sync, **nella stessa transazione**
 * della variazione: se la giacenza si muove, il contatore si muove con lei o
 * non si muove nessuno dei due.
 *
 * ⭐ **Il `NULL` fa da guardia da solo**: su una riga senza base i contatori
 *    sono `NULL`, e in SQL `NULL + n` resta `NULL`. Una riga fuori dal regime
 *    nuovo quindi non accumula, senza bisogno di un controllo che qualcuno
 *    possa dimenticare.
 *
 * ⛔ **Nessun upsert**: se la riga di stato non esiste non la si crea. Quella
 *    riga nasce dal collegamento al canale, non da una vendita al banco.
 *
 * @param deltaDisponibile quanto si è mosso `available` (col suo segno).
 */
export async function registraOrigine(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantId: string,
  locationId: string,
  deltaDisponibile: number,
  origine: OrigineVariazione,
): Promise<void> {
  if (deltaDisponibile === 0) {
    return;
  }
  await tx.shopifyInventorySyncState.updateMany({
    where: { tenantId, variantId, locationId },
    data:
      origine === 'locale'
        ? {
            localPendingDelta: { increment: deltaDisponibile },
            // ⛔ **Il marcatore di coda si accende QUI, dove il lavoro nasce.**
            //    Prima si accendeva solo se un push falliva per stato cambiato:
            //    se il processo si fermava fra il commit della vendita e
            //    l'inizio del push, quel lavoro non era in nessuna coda e
            //    nessuno lo cercava — lo ritrovava solo la vendita dopo, per
            //    caso. Riprodotto il 10/09/2026 con i servizi applicativi veri.
            //
            // ⭐ **Nella stessa transazione della variazione**: o si muovono la
            //    giacenza e il marcatore, o non si muove nessuno dei due. Un
            //    marcatore acceso dopo il commit avrebbe la stessa finestra
            //    scoperta, solo più stretta.
            //
            // ⚠️ **Solo per l'origine LOCALE.** Un effetto di canale è già
            //    applicato là: metterlo in coda significherebbe rimandarglielo.
            localPushPending: true,
          }
        : { channelAcquiredDelta: { increment: deltaDisponibile } },
  });
}

/**
 * Applica una variazione di giacenza in modo ATOMICO a livello DB.
 *
 * Policy definitiva quantità (correzioni post-audit §3): la quantità
 * insufficiente NON blocca mai l'operazione. Giacenza (`onHand`) e
 * Disponibile (`available`) possono diventare negative; l'invariante
 * `available = onHand - committed` resta garantito perché i due campi
 * si muovono insieme dello stesso delta. Gli avvisi non bloccanti sono
 * responsabilità del chiamante/UI, non di questo util.
 *
 * Increment atomici lato DB: due transazioni concorrenti sulla stessa
 * variante+location non producono lost update.
 */
export async function applyInventoryDelta(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantId: string,
  locationId: string,
  delta: number,
  origine: OrigineVariazione,
): Promise<void> {
  // Garantisce l'esistenza della riga senza modificarne i valori.
  await tx.inventoryLevel.upsert({
    where: { variantId_locationId: { variantId, locationId } },
    create: { tenantId, variantId, locationId },
    update: {},
  });

  if (delta === 0) {
    return;
  }

  await tx.inventoryLevel.updateMany({
    where: { tenantId, variantId, locationId },
    data: { onHand: { increment: delta }, available: { increment: delta } },
  });

  // ⭐ Qui `available` si muove di `delta`: stesso segno.
  await registraOrigine(tx, tenantId, variantId, locationId, delta, origine);
}
