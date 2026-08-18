import type { CurrencyCode, EntityId, IsoDateString, Money } from '@core/models/common.model';

/** Stato fiscale corrispettivi per il commercialista (§8). */

/**
 * Una riga del registro: o una vendita, o una rettifica.
 *
 * Le rettifiche portano importi **negativi**, così la colonna si somma a occhio
 * e il totale in fondo alla schermata si ricostruisce riga per riga. Non sono
 * documenti nuovi: derivano dalle vendite e dai rimborsi del canale.
 */
/**
 * Che **evento** è la riga. Il Corrispettivo manuale è una `sale`:
 * economicamente rappresenta una vendita avvenuta, e a distinguerlo è
 * l'**origine** — Tipo dice cosa è successo, Origine da dove viene la riga.
 */
export type CorrispettiviRowKind = 'sale' | 'refund';

/** Che gesto è stata la rettifica (solo sulle righe `refund`). */
export type CorrispettiviRefundKind = 'return_with_restock' | 'refund_only' | 'cancellation';

export interface CorrispettiviRegisterRow {
  readonly rowId: string;
  readonly kind: CorrispettiviRowKind;
  /**
   * L'ordine da cui si apre la riga. **Assente sulle sorgenti che ordini non
   * sono**: la Vendita al banco nasce da un documento, il Corrispettivo manuale
   * da sé.
   */
  readonly salesOrderId?: EntityId;
  /** La registrazione manuale da cui la riga viene, quando è la quarta sorgente. */
  readonly manualReceiptId?: EntityId;
  readonly orderNumber: string;
  readonly occurredAt: IsoDateString;
  readonly source: string;
  readonly customerName: string;
  readonly customerEmail?: string;
  /**
   * La sede della riga. **Assente = non determinata**, e non è una terza
   * possibilità legittima: è il modo onesto di dire «questo dato oggi non c'è»
   * finché la sincronizzazione Shopify non sarà rivista (`docs/10` §12).
   */
  readonly locationId?: EntityId;
  readonly locationName?: string;
  readonly currency: CurrencyCode;
  readonly taxable: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly financialStatus?: string;
  readonly refundKind?: CorrispettiviRefundKind;
  readonly note?: string;
}

export interface CorrispettiviSummary {
  readonly orderCount: number;
  /** Ordini «evasi» ma senza data: non conteggiabili, e non nascosti. */
  readonly undatedFulfilmentCount: number;
  readonly refundsCount: number;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly shipping: Money;
  readonly discount: Money;
  readonly total: Money;
  readonly taxable: Money;
  /** Rettifiche del periodo, alla loro data. Gli annullamenti restano fuori. */
  readonly refundCount: number;
  readonly refundTotal: Money;
  readonly refundTax: Money;
  /** Annullamenti: si contano per trasparenza, non si sottraggono mai. */
  readonly cancellationCount: number;
  readonly cancellationTotal: Money;
  /** Il numero che conta: venduto meno reso. */
  readonly netTotal: Money;
  readonly netTax: Money;
  readonly netTaxable: Money;
  /**
   * Righe lasciate fuori dal filtro Sede perché una sede non ce l'hanno.
   *
   * Zero quando il filtro non è attivo: senza filtro quelle righe sono dentro il
   * Registro e dentro i totali. Serve a dichiararle invece di farle sparire —
   * un registro che perde righe scegliendo una sede mostrerebbe un totale più
   * basso del vero (`docs/10` §12).
   */
  readonly locationUndeterminedExcludedCount: number;

  /**
   * I totali **giornata per giornata**, in ordine decrescente.
   *
   * ⚠️ Non sono un secondo calcolo: il totale del periodo qui sopra È la loro
   * somma. Arrivano sempre, anche a raggruppamento spento — accenderlo non
   * richiede una seconda richiesta, e i numeri non possono differire da quelli
   * già a schermo.
   */
  readonly perGiornata: readonly CorrispettiviTotaliGiornata[];
}

/** Il subtotale di una giornata economica. */
export interface CorrispettiviTotaliGiornata {
  /** Giorno economico ISO (`AAAA-MM-GG`). */
  readonly giorno: string;
  readonly taxable: Money;
  readonly tax: Money;
  readonly total: Money;
  /** Quante registrazioni e quante rettifiche compongono la giornata. */
  readonly orderCount: number;
  readonly refundCount: number;
}

/** Una sede selezionabile nel filtro del Registro. */
export interface CorrispettiviLocation {
  readonly id: EntityId;
  readonly name: string;
}

export interface CorrispettiviListQuery {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly financialStatus?: string;
  readonly source?: string;
  readonly placedFrom?: string;
  readonly placedTo?: string;
  /** Ambito: online oppure no. Derivato dall’origine, mai persistito. */
  readonly ambito?: 'all' | 'online' | 'fisico_pos';
  /** Canale: chi ha raccolto la vendita. Dimensione distinta dall’ambito. */
  readonly canale?: 'all' | 'shopify' | 'vestiflow';
  /** Origine: da cosa nasce la riga. Terza dimensione, non un sinonimo. */
  readonly origine?: string;
  /** Sede: le righe senza sede escono, e il riepilogo dice quante sono. */
  readonly locationId?: string;
  /** `sales` · `returns` · `refunds` — filtra l'elenco, non il riepilogo. */
  readonly rowType?: string;
  readonly refundsOnly?: boolean;

  // ── I filtri a INSIEME (`docs/10` §16) ──────────────────────────────────
  //
  // Sono ciò che la schermata manda oggi. I singolari qui sopra restano perché
  // l'API continua ad accettarli — è così che i vecchi indirizzi salvati
  // funzionano — ma non è più questa schermata a produrli.
  //
  // ⚠️ **Vuoto o assente = nessuna restrizione = Tutti**, e il parametro non
  // parte affatto: un `in: []` in Prisma non è «tutti», è nessuna riga.

  readonly origini?: readonly string[];
  readonly tipi?: readonly string[];
  readonly sedi?: readonly string[];
  /**
   * ⚠️ **«Nessun risultato», che NON è «nessuna restrizione».** Solo da un
   * vecchio indirizzo contraddittorio, che rendeva zero righe e deve
   * continuare a renderne zero. Ha un campo suo perché l'insieme vuoto
   * significa già «tutti».
   */
  readonly nessunRisultato?: boolean;
}
