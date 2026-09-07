import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';

/**
 * Tutto cio' che una sede si porta dietro. **Tutto**, non una selezione.
 *
 * ⛔ **`canDeleteLocation` guardava quattro cose su ventuno.** Verificava
 *    giacenze, movimenti, ordini fornitore e sessioni di conteggio; le altre
 *    diciassette non le guardava nessuno.
 *
 * ⛔ **La prima correzione ne aggiunse undici e ne lascio' fuori sei, per un
 *    ragionamento sbagliato**: «le `Restrict` si difendono da sole, il database
 *    rifiuta il DELETE». Vero, e irrilevante — perche' il rifiuto arriva DOPO
 *    che `canDeleteLocation` ha detto di si', quindi non protegge: fa esplodere
 *    la sincronizzazione delle sedi con un errore di chiave esterna.
 *
 * ⭐ **Misurato contro PostgreSQL vero il 07/09/2026**, non dedotto: sei
 *    relazioni facevano fallire `syncFromShopify` a meta' lavoro —
 *    `StockReservation`, `InventoryLot`, `InventorySerial`, `ManualReceipt`,
 *    `CashSession`, `CashSessionDeviceChange`. Nessun test a mock poteva
 *    vederlo: un mock non ha vincoli di integrita'.
 *
 * ⛔ **E una settima non si difendeva affatto.**
 *    `shopify_inventory_sync_states.location_id` e' dichiarata come relazione
 *    nello schema Prisma e **non ha alcuna chiave esterna nel database**
 *    (misurato: 20 FK verso `locations`, 21 relazioni nello schema). La sede
 *    veniva cancellata e la riga restava orfana, puntando al nulla.
 *
 * ⚠️ **Da qui la regola: l'elenco e' COMPLETO o non serve.** Distinguere fra
 *    relazioni «che bloccano» e «che non bloccano» ha prodotto due volte un
 *    elenco parziale, e la seconda volta con un argomento che sembrava solido.
 *    Un riferimento e' un riferimento: se esiste, la sede si archivia.
 *
 * ⭐ **L'azione `onDelete` resta annotata, ma solo per il MESSAGGIO**: dice
 *    all'operatore se quel dato sparirebbe o perderebbe la sede. Non decide
 *    piu' niente — ed e' bene cosi', perche' lo schema Prisma e il database su
 *    quel punto **divergono**: `SalesOrder.locationId` e
 *    `SupplierOrder.destinationLocationId` sono opzionali in Prisma (quindi
 *    `SetNull` per default) e `RESTRICT` nel database vero.
 *
 * ⚠️ **L'elenco e' verificato contro lo schema** da `npm run check:cascate-sede`:
 *    una relazione nuova verso `Location` che non compaia qui fa fallire il
 *    lint. Senza quella guardia questo elenco invecchierebbe in silenzio — che
 *    e' il difetto che sta chiudendo, alla terza occorrenza.
 */
export interface RiferimentoSede {
  /** Nome del modello Prisma sul client, in camelCase. */
  readonly modello: string;
  /** Il campo che porta l'id della sede. */
  readonly campo: string;
  /**
   * Che cosa succederebbe a questa entita' se la sede venisse cancellata.
   *
   * ⚠️ Serve al messaggio, non alla decisione: `bloccata` significa che il
   *    database rifiuterebbe il DELETE, e va evitato PRIMA — un errore di
   *    chiave esterna in mezzo a una sincronizzazione la interrompe.
   */
  readonly effetto: 'cancellata' | 'scollegata' | 'bloccata';
  /** Come si legge in un messaggio all'operatore. */
  readonly etichetta: string;
}

/**
 * Ogni relazione verso `Location` dichiarata nello schema. Sono ventuno.
 *
 * ⛔ Non si tolgono voci da qui per far passare un `DELETE`: se una sede non si
 *    cancella, e' perche' porta con se' qualcosa che non deve sparire.
 */
export const RIFERIMENTI_SEDE: readonly RiferimentoSede[] = [
  // ── il database RIFIUTA il DELETE (Restrict) ─────────────────────────────
  //
  // ⚠️ Vanno controllate PRIMA, non «lasciate al database»: il suo rifiuto
  //    arriva sotto forma di eccezione in mezzo alla sincronizzazione.
  {
    modello: 'inventoryLevel',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'giacenze',
  },
  {
    modello: 'inventoryCountSession',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'sessioni di conteggio',
  },
  {
    modello: 'stockMovement',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'movimenti di magazzino',
  },
  {
    modello: 'stockReservation',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'impegni di magazzino',
  },
  {
    modello: 'inventoryLot',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'lotti',
  },
  {
    modello: 'inventorySerial',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'numeri di serie',
  },
  {
    modello: 'manualReceipt',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'corrispettivi manuali',
  },
  {
    modello: 'cashSession',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'sessioni di cassa',
  },
  {
    modello: 'cashSessionDeviceChange',
    campo: 'locationId',
    effetto: 'bloccata',
    etichetta: 'cambi di dispositivo in cassa',
  },
  {
    modello: 'salesOrder',
    campo: 'locationId',
    // ⚠️ Prisma la direbbe `SetNull` (relazione opzionale, azione non
    //    dichiarata); il database vero la applica `RESTRICT`.
    effetto: 'bloccata',
    etichetta: 'ordini cliente',
  },
  {
    modello: 'supplierOrder',
    campo: 'destinationLocationId',
    // ⚠️ Stessa divergenza: opzionale in Prisma, `RESTRICT` nel database.
    effetto: 'bloccata',
    etichetta: 'ordini fornitore con questa destinazione',
  },

  // ── nessuna chiave esterna nel database ─────────────────────────────────
  {
    modello: 'shopifyInventorySyncState',
    campo: 'locationId',
    /*
      ⛔ **Non «bloccata»: qui non blocca NIENTE.** La relazione e' dichiarata
         nello schema Prisma e la chiave esterna nel database non esiste
         (misurato il 07/09/2026). Cancellare la sede lasciava questa riga
         orfana, e nessun vincolo se ne accorgeva.

      ⚠️ Finche' la FK manca, questo controllo applicativo e' l'UNICA
         protezione. La colonna va portata sotto vincolo, ma e' una tranche
         schema separata: vedi docs/DA-FARE.md.
    */
    effetto: 'cancellata',
    etichetta: 'stati di sincronizzazione inventario Shopify',
  },

  // ── spariscono in silenzio (Cascade) ────────────────────────────────────
  {
    modello: 'documentCounter',
    campo: 'locationId',
    effetto: 'cancellata',
    etichetta: 'contatori di numerazione dei documenti',
  },
  {
    modello: 'fiscalDevice',
    campo: 'locationId',
    effetto: 'cancellata',
    etichetta: 'dispositivi fiscali',
  },
  {
    modello: 'posTerminal',
    campo: 'locationId',
    effetto: 'cancellata',
    etichetta: 'terminali POS',
  },
  {
    modello: 'userLocation',
    campo: 'locationId',
    effetto: 'cancellata',
    etichetta: 'assegnazioni della sede agli utenti',
  },

  // ── restano, ma perdono la sede (SetNull) ───────────────────────────────
  {
    modello: 'document',
    campo: 'locationId',
    effetto: 'scollegata',
    etichetta: 'documenti emessi da questa sede',
  },
  {
    modello: 'document',
    campo: 'targetLocationId',
    effetto: 'scollegata',
    etichetta: 'documenti con questa sede di destinazione',
  },
  {
    modello: 'stockMovement',
    campo: 'targetLocationId',
    effetto: 'scollegata',
    etichetta: 'movimenti in entrata da altre sedi',
  },
  {
    modello: 'onlineSale',
    campo: 'locationId',
    effetto: 'scollegata',
    etichetta: 'vendite online',
  },
  {
    modello: 'user',
    campo: 'defaultLocationId',
    effetto: 'scollegata',
    etichetta: 'utenti che hanno questa sede come predefinita',
  },
];

export interface EsitoVerificaSede {
  readonly puoEssereCancellata: boolean;
  /** Che cosa la trattiene, gia' pronto per un messaggio o un log. */
  readonly trattenutaDa: readonly string[];
}

const COME_FINIREBBE: Record<RiferimentoSede['effetto'], string> = {
  cancellata: 'verrebbero cancellati',
  scollegata: 'perderebbero la sede',
  bloccata: 'impedirebbero la cancellazione',
};

/**
 * Verifica che cancellare questa sede non porti via niente.
 *
 * ⚠️ **Conta, non cancella.** E il chiamante che riceve `false` deve
 *    ARCHIVIARE la sede, non forzare: la sede si scollega dal canale e sparisce
 *    dal selettore, ma resta leggibile per i documenti che la nominano.
 */
export async function verificaSedeCancellabile(
  db: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  locationId: string,
): Promise<EsitoVerificaSede> {
  const trattenutaDa: string[] = [];

  for (const riferimento of RIFERIMENTI_SEDE) {
    /*
      ⚠️ Il client Prisma si indicizza per nome del modello. Il cast e'
         necessario perche' l'elenco e' dato: e' il prezzo di avere UN posto solo
         dove le relazioni sono dichiarate, invece di ventuno `count` copiati.
    */
    const delegato = (
      db as unknown as Record<string, { count?: (args: unknown) => Promise<number> }>
    )[riferimento.modello];
    if (!delegato?.count) {
      // Un modello che il client non espone e' un errore di allineamento, non
      // un caso da ignorare: la guardia statica lo prende prima di qui.
      throw new Error(
        `verificaSedeCancellabile: il modello «${riferimento.modello}» non esiste sul client Prisma.`,
      );
    }

    /*
      ⚠️ Il filtro per tenant impedisce a una sede di essere trattenuta da righe
         di un'altra azienda: ogni entita' di business e' tenant-aware
         (regole-gestionale).
    */
    const quante = await delegato.count({
      where: { tenantId, [riferimento.campo]: locationId },
    });

    if (quante > 0) {
      trattenutaDa.push(
        `${quante} ${riferimento.etichetta} (${COME_FINIREBBE[riferimento.effetto]})`,
      );
    }
  }

  return { puoEssereCancellata: trattenutaDa.length === 0, trattenutaDa };
}
