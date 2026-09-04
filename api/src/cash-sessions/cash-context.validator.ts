import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CashSession, FiscalDevice, Prisma } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { isFiscalAdapterRegistered } from '../fiscal/fiscal-adapter-registry';
import { assertLocationInUserScope } from '../inventory/user-location-scope.util';

/**
 * Il validatore UNICO del contesto Cassa (`docs/25` §13).
 *
 * ⛔ **Riceve la TRANSAZIONE, non il client globale.** Fra un controllo fatto
 * fuori transazione e la scrittura che lo presuppone, la sessione può chiudersi
 * e il dispositivo può essere disabilitato: sarebbe una guardia che descrive un
 * mondo già cambiato.
 *
 * ⭐ **È anche il PUNTO DI SERIALIZZAZIONE della sessione**: quando la richiesta
 * nomina una sessione, qui si prende un `FOR UPDATE` sulla sua riga. Tutte le
 * operazioni che la toccano passano di qui, quindi si mettono in fila da sole —
 * e la chiusura non può congelare la quadratura mentre una vendita è in volo.
 *
 * ⛔ **Il tenant arriva dall'utente autenticato, mai dal payload.** È la prima
 * regola, e non ha eccezioni: un `tenantId` che viaggia nel corpo di una
 * richiesta è un campo che il chiamante sceglie.
 *
 * ⭐ **Riusa le primitive esistenti** invece di crearne un secondo sistema:
 * `assertLocationInUserScope` è già in uso in 61 punti, e la guardia
 * `check:location-scope` la sorveglia dal confine controller→servizio.
 *
 * ⚠️ **Gli errori non rivelano l'esistenza di entità altrui.** Una sessione di
 * un altro tenant risponde come una sessione inesistente: distinguerle
 * trasformerebbe l'endpoint in un modo per scoprire cosa esiste altrove — è la
 * stessa disciplina già adottata per i riferimenti di riga documento.
 */

/** Il minimo che il validatore deve sapere dell'utente. */
export type CashContextUser = Pick<
  UserProfileDto,
  'role' | 'supportSession' | 'hasAllLocationsAccess' | 'assignedLocationIds' | 'permissions'
>;

/** Il client transazionale di Prisma: mai il client globale. */
export type CashTx = Prisma.TransactionClient;

export interface CashContextRichiesta {
  /** La sede su cui si opera. Obbligatoria: la Cassa è sempre di una sede. */
  readonly locationId: string;
  /** La sessione, quando l'operazione ne presuppone una. */
  readonly sessionId?: string;
  /**
   * Il dispositivo, quando l'operazione lo nomina.
   *
   * ⚠️ `null` è una richiesta valida e significa «nessun dispositivo»: aprire
   * una sessione che non fiscalizza, o togliere quello corrente.
   */
  readonly deviceId?: string | null;
  /**
   * Il dispositivo diventerà quello OPERATIVO della sessione?
   *
   * ⭐ Solo allora si pretende un `adapterKey` registrato: un dispositivo si
   * censisce prima di saper parlare con lui, ma non si può selezionare per
   * emettere se nessun adapter lo governa.
   */
  readonly comeOperativo?: boolean;
}

export interface CashContext {
  readonly tenantId: string;
  readonly locationId: string;
  readonly session: CashSession | null;
  readonly device: FiscalDevice | null;
}

const NON_TROVATA = 'Sessione di cassa non trovata.';
const SEDE_NEGATA = 'Non sei autorizzato a operare su questa sede.';

/**
 * Verifica tutto il contesto in una volta e restituisce le entità già caricate,
 * così il chiamante non le rilegge (e non le rilegge **fuori** transazione).
 */
export async function assertCashContext(
  tx: CashTx,
  tenantId: string,
  user: CashContextUser,
  richiesta: CashContextRichiesta,
): Promise<CashContext> {
  // ── 1. La sede appartiene al tenant ─────────────────────────────────────
  const location = await tx.location.findFirst({
    where: { id: richiesta.locationId, tenantId },
    select: { id: true },
  });
  if (!location) {
    // ⚠️ Una sede di un altro tenant e una sede inesistente rispondono uguale.
    throw new ForbiddenException(SEDE_NEGATA);
  }

  // ── 2. …ed è accessibile all'operatore ──────────────────────────────────
  assertLocationInUserScope(user, richiesta.locationId, 'write');

  // ── 3. La sessione: stesso tenant, stessa sede, APERTA, e BLOCCATA ──────
  let session: CashSession | null = null;
  if (richiesta.sessionId !== undefined) {
    // ⛔ **`FOR UPDATE`, e sta QUI e non nei singoli servizi.** È il punto in
    //    cui ogni operazione di sessione — checkout, reso, versamento,
    //    prelievo, cambio dispositivo, chiusura — si mette in fila sulla
    //    stessa riga. Distribuire lock diversi nei servizi significherebbe
    //    che dimenticarne uno basta a riaprire il buco.
    //
    // ⛔ Senza, la chiusura può calcolare gli attesi mentre una vendita è IN
    //    VOLO: la vendita ha già superato questo controllo, non ha ancora
    //    scritto, e si conferma un attimo dopo il congelamento — dentro una
    //    sessione chiusa e FUORI dalla quadratura. Misurato il 04/09/2026.
    //
    // ⚠️ Il `FOR KEY SHARE` che PostgreSQL prende da solo quando si inserisce
    //    un figlio (un documento, un movimento) **non basta**: due di quelli
    //    sono compatibili fra loro, e la chiusura prende `FOR UPDATE` solo
    //    alla fine — dopo aver già letto.
    //
    // ⭐ Il lock si prende PRIMA di leggere la riga: letta prima, si
    //    leggerebbe una versione che il lock poi non garantisce più.
    const bloccate = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "cash_sessions"
        WHERE "id" = ${richiesta.sessionId}::uuid
          AND "tenant_id" = ${tenantId}::uuid
        FOR UPDATE`;
    if (bloccate.length === 0) {
      // ⚠️ Stessa risposta di «di un altro tenant»: non si distinguono.
      throw new NotFoundException(NON_TROVATA);
    }

    session = await tx.cashSession.findFirst({
      where: { id: richiesta.sessionId, tenantId, locationId: richiesta.locationId },
    });
    if (!session) {
      throw new NotFoundException(NON_TROVATA);
    }
    if (session.status !== 'open') {
      // ⭐ Chi era in coda arriva qui: ha aspettato la chiusura, e ora la
      //    vede. È il rifiuto che impedisce di infilarsi dopo il
      //    congelamento della quadratura.
      throw new UnprocessableEntityException('La sessione di cassa è già chiusa.');
    }
  }

  // ── 4. Il dispositivo: stesso tenant, stessa sede, abilitato, con adapter ─
  let device: FiscalDevice | null = null;
  if (richiesta.deviceId) {
    device = await tx.fiscalDevice.findFirst({
      where: { id: richiesta.deviceId, tenantId, locationId: richiesta.locationId },
    });
    if (!device) {
      // ⚠️ «di un altro tenant», «di un'altra sede» e «inesistente» sono
      //    indistinguibili di proposito.
      throw new UnprocessableEntityException('Dispositivo fiscale non disponibile su questa sede.');
    }
    if (!device.enabled) {
      throw new UnprocessableEntityException('Il dispositivo fiscale non è abilitato.');
    }
    if (richiesta.comeOperativo && !isFiscalAdapterRegistered(device.adapterKey)) {
      // ⛔ La whitelist è nel CODICE: una chiave scritta dal tenant non diventa
      //    il nome di qualcosa da caricare (`docs/25` §10, garanzia 3).
      throw new UnprocessableEntityException(
        'Il dispositivo non ha un adapter riconosciuto: non può essere usato per emettere.',
      );
    }
  }

  return { tenantId, locationId: richiesta.locationId, session, device };
}
