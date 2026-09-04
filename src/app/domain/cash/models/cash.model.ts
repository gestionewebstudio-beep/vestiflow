import type { EntityId } from '@core/models/common.model';
import type { PaymentTenderKind } from '@core/models/payment-option.model';

/**
 * I contratti della Cassa, come li restituisce l'API (`docs/25`).
 *
 * ⛔ **Nessun tipo qui ricalcola niente.** Totali, quadrature e differenze
 * arrivano dal server: il frontend calcola solo l'ANTEPRIMA prima della
 * conferma, e dopo mostra ciò che il backend ha deciso.
 */

// ── Sessione ───────────────────────────────────────────────────────────────

export type CashSessionStatus = 'open' | 'closed';

export interface CashSession {
  readonly id: EntityId;
  readonly tenantId: EntityId;
  readonly locationId: EntityId;
  readonly status: CashSessionStatus;
  readonly openedAt: string;
  readonly openedById: EntityId | null;
  readonly openedByName: string;
  readonly openingFloatMinor: number;
  readonly closedAt: string | null;
  readonly closedByName: string | null;
  readonly fiscalDeviceId: EntityId | null;
  readonly notes: string | null;
  /** ⛔ `null` finché la sessione è aperta: gli attesi non esistono prima. */
  readonly countedCashMinor: number | null;
  readonly declaredElectronicMinor: number | null;
  readonly expectedCashMinor: number | null;
  readonly expectedElectronicMinor: number | null;
}

export interface CashSessionState {
  readonly session: CashSession | null;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
}

export type CashMovementType = 'deposit' | 'withdrawal';

export interface CashSessionMovement {
  readonly id: EntityId;
  readonly type: CashMovementType;
  readonly amountMinor: number;
  readonly reason: string;
  readonly createdAt: string;
  readonly createdByName: string;
}

export interface CashDeviceChange {
  readonly id: EntityId;
  readonly previousDeviceId: EntityId | null;
  readonly newDeviceId: EntityId | null;
  readonly reason: string;
  readonly createdAt: string;
  readonly changedByName: string;
}

// ── Checkout ───────────────────────────────────────────────────────────────

export interface CashCheckoutLine {
  readonly variantId: EntityId;
  readonly quantity: number;
  readonly unitPriceMinor?: number;
  readonly discountPercent?: number;
  readonly vatCodeId?: EntityId | null;
  readonly description?: string;
}

export interface CashCheckoutPayment {
  readonly paymentOptionId: EntityId;
  readonly amountMinor: number;
  /** Solo contanti: il denaro consegnato. Il resto è derivato. */
  readonly tenderedMinor?: number | null;
  /** Solo elettronico: l'operatore conferma l'esito letto sul terminale. */
  readonly confirmed?: boolean;
}

export interface CashCheckoutPayload {
  readonly locationId: EntityId;
  readonly sessionId: EntityId;
  readonly creationIntentId: string;
  readonly lines: readonly CashCheckoutLine[];
  readonly payments: readonly CashCheckoutPayment[];
}

export interface CashCheckoutResult {
  readonly documentId: EntityId;
  readonly reference: string;
  readonly totalMinor: number;
  readonly changeMinor: number;
}

// ── Reso ───────────────────────────────────────────────────────────────────

export interface ReceiptSearchResult {
  readonly documentId: EntityId;
  readonly reference: string;
  readonly documentDate: string;
  readonly createdAt: string;
  readonly totalMinor: number;
  readonly customerName: string | null;
  readonly operatorName: string;
  readonly locationId: EntityId | null;
  readonly locationName: string | null;
  readonly lineCount: number;
  readonly itemsPreview: string;
}

export interface ReturnLookupLine {
  readonly lineId: EntityId;
  readonly variantId: EntityId | null;
  readonly description: string;
  readonly quantitySold: number;
  readonly quantityReturned: number;
  readonly quantityReturnable: number;
  readonly unitPriceMinor: number;
  readonly lineTotalMinor: number;
  readonly lineGrossTotalMinor: number;
}

export interface ReturnLookupPayment {
  /** ⭐ È QUESTO che il rimborso indica, non il Tipo pagamento. */
  readonly paymentId: EntityId;
  readonly paymentOptionId: EntityId | null;
  readonly optionName: string | null;
  readonly tenderKind: PaymentTenderKind | null;
  readonly amountMinor: number;
}

export interface ReturnLookup {
  readonly documentId: EntityId;
  readonly reference: string;
  readonly documentDate: string;
  readonly totalMinor: number;
  readonly cashSessionId: EntityId | null;
  readonly lines: readonly ReturnLookupLine[];
  readonly payments: readonly ReturnLookupPayment[];
}

export interface CashReturnPayload {
  readonly locationId: EntityId;
  readonly sessionId: EntityId;
  readonly originalDocumentId: EntityId;
  readonly creationIntentId: string;
  readonly reason: string;
  readonly lines: readonly { readonly originalLineId: EntityId; readonly quantity: number }[];
  readonly refunds: readonly {
    readonly originalPaymentId: EntityId;
    readonly amountMinor: number;
    readonly confirmed?: boolean;
  }[];
}

export interface CashReturnResult {
  readonly documentId: EntityId;
  readonly reference: string;
  readonly totaleMinor: number;
}

// ── Chiusura ───────────────────────────────────────────────────────────────

export interface CashClosePayload {
  readonly countedCashMinor: number;
  readonly declaredElectronicMinor?: number | null;
  readonly notes?: string;
}

export interface CashSessionTotals {
  readonly openingFloatMinor: number;
  readonly salesCashMinor: number;
  readonly returnsCashMinor: number;
  readonly salesElectronicMinor: number;
  readonly returnsElectronicMinor: number;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
  readonly expectedCashMinor: number;
  readonly expectedElectronicMinor: number;
}

export interface CashCloseResult extends CashSessionTotals {
  readonly session: CashSession;
  readonly countedCashMinor: number;
  readonly declaredElectronicMinor: number | null;
  /** ⭐ Derivata: `contato − atteso`. Non è una colonna. */
  readonly cashDifferenceMinor: number;
  readonly electronicDifferenceMinor: number | null;
}

// ── Registro operativo ─────────────────────────────────────────────────────

export type CashOperationKind = 'sale' | 'return';

/**
 * Le anomalie che il registro sa riconoscere.
 *
 * ⚠️ Il FILTRO copre le prime quattro: `quote_non_quadrate` non è esprimibile
 * come condizione di ricerca, e si vede solo sulla riga.
 */
export type CashOperationAnomaly =
  | 'annullato'
  | 'quota_non_classificata'
  | 'reso_senza_origine'
  | 'rimborso_non_agganciato'
  | 'quote_non_quadrate';

export interface CashOperationPayment {
  readonly paymentOptionId: EntityId | null;
  readonly optionName: string | null;
  readonly tenderKind: PaymentTenderKind | null;
  readonly amountMinor: number;
  readonly tenderedMinor: number | null;
  readonly refundedFromPaymentId: EntityId | null;
}

export interface CashOperationRow {
  readonly id: EntityId;
  readonly kind: CashOperationKind;
  readonly reference: string;
  readonly documentDate: string;
  readonly createdAt: string;
  readonly status: string;
  readonly locationId: EntityId | null;
  readonly locationName: string | null;
  readonly operatorId: EntityId | null;
  readonly operatorName: string;
  readonly sessionId: EntityId | null;
  readonly customerName: string | null;
  readonly totalMinor: number;
  readonly payments: readonly CashOperationPayment[];
  /** ⭐ Calcolato a lettura dal server, mai persistito. */
  readonly mixed: boolean;
  readonly changeMinor: number;
  readonly sourceDocumentId: EntityId | null;
  readonly sourceReference: string | null;
  readonly anomalies: readonly CashOperationAnomaly[];
}

export interface CashOperationsSummary {
  readonly grossSalesMinor: number;
  readonly returnsMinor: number;
  readonly netSalesMinor: number;
  readonly cashMinor: number;
  readonly electronicMinor: number;
  readonly saleCount: number;
  readonly returnCount: number;
  readonly operationCount: number;
  readonly averageMinor: number;
}

export interface CashOperationsPage {
  readonly items: readonly CashOperationRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly summary: CashOperationsSummary;
}

export interface CashOperationLine {
  readonly id: EntityId;
  readonly lineNumber: number;
  readonly sku: string | null;
  readonly description: string;
  readonly variantLabel: string | null;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discountPercent: number | null;
  readonly lineTotalMinor: number;
  readonly lineVatTotalMinor: number;
  readonly lineGrossTotalMinor: number;
  readonly returnedFromLineId: EntityId | null;
}

export interface CashOperationMovement {
  readonly id: EntityId;
  readonly type: string;
  readonly quantity: number;
  readonly sku: string | null;
  readonly locationId: EntityId | null;
  readonly createdAt: string;
  readonly createdByName: string;
}

export interface CashOperationDetail extends CashOperationRow {
  readonly taxableMinor: number;
  readonly taxMinor: number;
  readonly notes: string | null;
  readonly lines: readonly CashOperationLine[];
  readonly session: {
    readonly id: EntityId;
    readonly status: CashSessionStatus;
    readonly openedAt: string;
    readonly closedAt: string | null;
    readonly openedByName: string;
  } | null;
  readonly relatedReturns: readonly {
    readonly id: EntityId;
    readonly reference: string | null;
    readonly documentDate: string;
    readonly status: string;
    readonly totalMinor: number;
  }[];
  readonly stockMovements: readonly CashOperationMovement[];
}

// ── Registro sessioni ──────────────────────────────────────────────────────

export interface CashSessionRow {
  readonly id: EntityId;
  readonly status: CashSessionStatus;
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly openedAt: string;
  readonly openedByName: string;
  readonly closedAt: string | null;
  readonly closedByName: string | null;
  readonly openingFloatMinor: number;
  readonly fiscalDeviceId: EntityId | null;
  readonly fiscalDeviceLabel: string | null;
  readonly notes: string | null;
  readonly saleCount: number;
  readonly salesTotalMinor: number;
  readonly returnCount: number;
  readonly returnsTotalMinor: number;
  readonly depositsMinor: number;
  readonly withdrawalsMinor: number;
}

export interface CashSessionsPage {
  readonly items: readonly CashSessionRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface CashSessionFrozen {
  readonly expectedCashMinor: number;
  readonly expectedElectronicMinor: number;
  readonly countedCashMinor: number | null;
  readonly declaredElectronicMinor: number | null;
  readonly cashDifferenceMinor: number | null;
  readonly electronicDifferenceMinor: number | null;
}

export interface CashSessionDetail {
  readonly id: EntityId;
  readonly status: CashSessionStatus;
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly openedAt: string;
  readonly openedByName: string;
  readonly closedAt: string | null;
  readonly closedByName: string | null;
  readonly openingFloatMinor: number;
  readonly fiscalDeviceId: EntityId | null;
  readonly fiscalDeviceLabel: string | null;
  readonly notes: string | null;
  /** ⛔ `null` a sessione aperta: la chiusura è CIECA. */
  readonly frozen: CashSessionFrozen | null;
  /** ⚠️ Ricostruiti adesso, non congelati. */
  readonly breakdown: CashSessionTotals | null;
  /** ⭐ `false` se la ricostruzione non torna col congelato. */
  readonly breakdownMatchesFrozen: boolean | null;
  readonly movements: readonly CashSessionMovement[];
  readonly documents: readonly {
    readonly id: EntityId;
    readonly kind: CashOperationKind;
    readonly reference: string;
    readonly status: string;
    readonly documentDate: string;
    readonly totalMinor: number;
    readonly createdByName: string;
  }[];
  readonly deviceChanges: readonly CashDeviceChange[];
}

// ── Filtri ─────────────────────────────────────────────────────────────────

export interface CashOperationsFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly from?: string;
  readonly to?: string;
  readonly locationId?: EntityId;
  readonly operatorId?: EntityId;
  readonly sessionId?: EntityId;
  readonly kind?: CashOperationKind;
  readonly paymentOptionId?: EntityId;
  readonly tenderKind?: PaymentTenderKind;
  readonly number?: string;
  readonly anomaliesOnly?: boolean;
}

export interface CashSessionsFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly from?: string;
  readonly to?: string;
  readonly locationId?: EntityId;
  readonly operatorId?: EntityId;
  readonly status?: CashSessionStatus;
}
