import type { EntityId, IsoDateString } from './common.model';

/**
 * Sessione di cassa (tranche C3, `docs/25` §13).
 *
 * ⚠️ **La funzione è incompleta fino a C4B**: manca la chiusura, e C3/C4/C4B non
 * si rilasciano separatamente. Questi modelli esistono perché il servizio possa
 * esistere, non perché ci sia già una schermata.
 */

export type CashSessionStatus = 'open' | 'closed';

export interface CashSession {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly locationId: EntityId;
  /**
   * Il dispositivo fiscale **operativo corrente**.
   *
   * ⛔ `null` NON significa «prendi il predefinito»: significa che questa
   * sessione non fiscalizza. La selezione implicita è ciò che C1C ha eliminato.
   */
  readonly fiscalDeviceId: EntityId | null;
  readonly status: CashSessionStatus;
  readonly openedAt: IsoDateString;
  readonly openedById: EntityId | null;
  readonly openedByName: string;
  /** Fondo dichiarato all'apertura, in unità minori. */
  readonly openingFloatMinor: number;
  readonly closedAt: IsoDateString | null;
  readonly closedById: EntityId | null;
  readonly closedByName: string | null;
  readonly notes: string | null;
  /** ⭐ Il contante si CONTA. `null` finché la sessione è aperta. */
  readonly countedCashMinor: number | null;
  /**
   * ⭐ L'elettronico si RICONCILIA: è il totale che l'operatore legge sul POS e
   * dichiara. ⛔ Non è una risposta tecnica del terminale.
   */
  readonly declaredElectronicMinor: number | null;
  /** ⚠️ Attesi congelati alla chiusura: li calcola **C4B**, non C3. */
  readonly expectedCashMinor: number | null;
  readonly expectedElectronicMinor: number | null;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
}

export type CashSessionMovementType = 'deposit' | 'withdrawal';

/**
 * Movimento di cassetto.
 *
 * ⛔ **Append-only**: non ha `updatedAt` e non esiste un'API che lo modifichi o
 * lo cancelli. Una correzione è un movimento **opposto** che cita questo nella
 * causale.
 */
export interface CashSessionMovement {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly sessionId: EntityId;
  readonly type: CashSessionMovementType;
  /** Sempre positivo: il verso lo dice `type`, non il segno. */
  readonly amountMinor: number;
  readonly reason: string;
  readonly createdById: EntityId | null;
  readonly createdByName: string;
  readonly createdAt: IsoDateString;
}

/**
 * Una riga dello storico dei cambi dispositivo.
 *
 * ⭐ `previousDeviceId` è `null` al **primo assegnamento**, `newDeviceId` è
 * `null` alla **rimozione**: nessuno dei due è un dato mancante.
 */
export interface CashSessionDeviceChange {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly locationId: EntityId;
  readonly sessionId: EntityId;
  readonly previousDeviceId: EntityId | null;
  readonly newDeviceId: EntityId | null;
  readonly reason: string;
  readonly changedById: EntityId | null;
  readonly changedByName: string;
  readonly createdAt: IsoDateString;
}

/** La sessione corrente di una sede, con i totali del cassetto. */
export interface CurrentCashSession {
  readonly session: CashSession | null;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
}

/**
 * Il contante teorico nel cassetto, per quanto se ne sa **senza le quote**.
 *
 * ⛔ **Non è l'atteso di chiusura**: quello include vendite e resi, che sono di
 * C4, e si congela in C4B. Questa è solo la parte che C3 conosce — fondo più
 * movimenti — ed è utile a chi guarda il cassetto, non a quadrare la giornata.
 */
export function contanteDaFondoEMovimenti(corrente: CurrentCashSession): number {
  if (!corrente.session) {
    return 0;
  }
  return corrente.session.openingFloatMinor + corrente.depositsMinor - corrente.withdrawalsMinor;
}
