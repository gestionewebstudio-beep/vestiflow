import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';

/**
 * Che cosa una sede si porta via se qualcuno la cancella.
 *
 * ⛔ **`canDeleteLocation` guardava quattro cose e ne ignorava undici.**
 *    Verificava giacenze, movimenti, ordini fornitore e sessioni di conteggio —
 *    cioe' l'inventario, che pero' e' proprio la parte che si difende da sola:
 *    quelle relazioni sono `Restrict`, e un `DELETE` fallirebbe comunque.
 *
 *    Le relazioni che NON si difendono sono altre, e nessuna era controllata:
 *    quattro cancellano in silenzio (`Cascade`) e sette azzerano un riferimento
 *    in silenzio (`SetNull`). Una sede dichiarata «eliminabile» portava via i
 *    contatori di numerazione dei documenti, i dispositivi fiscali, i terminali
 *    POS e le assegnazioni degli utenti — e scollegava documenti e ordini dalla
 *    loro sede senza che niente lo dicesse.
 *
 * ⚠️ **`DocumentCounter` e' il piu' insidioso.** E' la numerazione dei documenti
 *    di quella sede: cancellarla non rompe niente subito, e settimane dopo la
 *    serie riparte da un numero gia' usato. Il vincolo di unicita' lo rifiuta —
 *    lontano dalla causa, quando nessuno la ricorda piu'.
 *
 * ⭐ **Le `Restrict` restano fuori da questo elenco, ed e' voluto**: non servono
 *    qui, perche' il database le fa rispettare da solo. Metterle dentro darebbe
 *    l'impressione che l'elenco sia «tutte le relazioni», e alla prima aggiunta
 *    qualcuno lo accorcerebbe per pulizia.
 *
 * ⚠️ **L'elenco e' verificato contro lo schema** da `npm run check:cascate-sede`:
 *    una relazione nuova verso `Location` che non blocchi da sola, e che non
 *    compaia qui, fa fallire il lint. Senza quella guardia questo elenco
 *    invecchierebbe in silenzio, che e' il difetto che sta chiudendo.
 */
export interface RiferimentoSede {
  /** Nome del modello Prisma sul client, in camelCase. */
  readonly modello: string;
  /** Il campo che porta l'id della sede. */
  readonly campo: string;
  /** Che cosa succede a questa entita' se la sede viene cancellata. */
  readonly effetto: 'cancellata' | 'scollegata';
  /** Come si legge in un messaggio all'operatore. */
  readonly etichetta: string;
}

/**
 * Le relazioni verso `Location` che NON impediscono da sole la cancellazione.
 *
 * ⛔ Non si tolgono voci da qui per far passare un `DELETE`: se una sede non si
 *    cancella, e' perche' porta con se' qualcosa che non deve sparire.
 */
export const RIFERIMENTI_SEDE_NON_PROTETTIVI: readonly RiferimentoSede[] = [
  // ── onDelete: Cascade — spariscono ────────────────────────────────────────
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

  // ── onDelete: SetNull — restano, ma perdono la sede ───────────────────────
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
    modello: 'salesOrder',
    campo: 'locationId',
    effetto: 'scollegata',
    etichetta: 'ordini cliente',
  },
  {
    modello: 'supplierOrder',
    campo: 'destinationLocationId',
    effetto: 'scollegata',
    etichetta: 'ordini fornitore con questa destinazione',
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

/**
 * Verifica che cancellare questa sede non porti via niente.
 *
 * ⚠️ **Conta, non cancella.** E il chiamante che riceve `false` deve
 *    ARCHIVIARE la sede, non forzare: e' il comportamento gia' esistente e piu'
 *    sicuro — la sede si scollega dal canale e sparisce dal selettore, ma resta
 *    leggibile per i documenti che la nominano.
 */
export async function verificaSedeCancellabile(
  db: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  locationId: string,
): Promise<EsitoVerificaSede> {
  const trattenutaDa: string[] = [];

  for (const riferimento of RIFERIMENTI_SEDE_NON_PROTETTIVI) {
    /*
      ⚠️ Il client Prisma si indicizza per nome del modello. Il cast e'
         necessario perche' l'elenco e' dato: e' il prezzo di avere UN posto solo
         dove le relazioni sono dichiarate, invece di undici `count` copiati.
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
      ⚠️ `user.defaultLocationId` non ha `tenantId` sul modello? Ce l'ha, come
         ogni entita' di business (regole-gestionale). Il filtro per tenant resta
         quindi sempre applicabile, ed e' quello che impedisce a una sede di
         essere trattenuta da righe di un'altra azienda.
    */
    const quante = await delegato.count({
      where: { tenantId, [riferimento.campo]: locationId },
    });

    if (quante > 0) {
      trattenutaDa.push(
        `${quante} ${riferimento.etichetta} (${riferimento.effetto === 'cancellata' ? 'verrebbero cancellati' : 'perderebbero la sede'})`,
      );
    }
  }

  return { puoEssereCancellata: trattenutaDa.length === 0, trattenutaDa };
}
