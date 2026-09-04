import type { PaymentOptionKind, PaymentTenderKind } from '@prisma/client';

/**
 * Voci pagamento preimpostate (logica Danea): due elenchi separati,
 * modalità e condizioni. Seed al primo accesso del tenant; le voci
 * restano modificabili/estendibili dalle Impostazioni.
 */
export interface PaymentOptionSeedEntry {
  readonly kind: PaymentOptionKind;
  readonly name: string;
  readonly sortOrder: number;
  /**
   * Codice normativo del catalogo globale a cui la voce va collegata.
   *
   * ⛔ È un DATO, non qualcosa da ricavare dal nome. Il codice compare anche
   * nell'etichetta, ma leggerlo da lì significherebbe interpretare testo che
   * l'utente può rinominare (`docs/25` §7).
   */
  readonly methodCode?: string;
  /**
   * Come la voce si incassa al banco (`docs/25` §7).
   *
   * ⭐ Assente significa **non utilizzabile nella Cassa**, ed è lo stato di
   * quasi tutte: bonifico, RIBA, MAV e ogni condizione di pagamento.
   */
  readonly tenderKind?: PaymentTenderKind;
}

/**
 * Modalità di pagamento previste dalla normativa per la fatturazione
 * elettronica (ModalitaPagamento SDI MP01–MP23).
 *
 * ⭐ **Nome e codice sono due campi**, non un nome da cui estrarre il codice.
 * È la coppia che il seed usa per collegare la voce al catalogo globale
 * `payment_method_codes`, ed è la stessa whitelist della migration
 * `20260904120000_modalita_pagamento_normative`.
 *
 * ⚠️ Il codice resta anche DENTRO l'etichetta perché le anagrafiche salvano
 * il nome come snapshot, e una stampa storica deve continuare a dire quale
 * modalità normativa era stata scelta.
 */
export const SDI_PAYMENT_METHODS: readonly { readonly name: string; readonly code: string }[] = [
  { name: 'Contanti (MP01)', code: 'MP01' },
  { name: 'Assegno (MP02)', code: 'MP02' },
  { name: 'Assegno circolare (MP03)', code: 'MP03' },
  { name: 'Contanti presso Tesoreria (MP04)', code: 'MP04' },
  { name: 'Bonifico (MP05)', code: 'MP05' },
  { name: 'Vaglia cambiario (MP06)', code: 'MP06' },
  { name: 'Bollettino bancario (MP07)', code: 'MP07' },
  { name: 'Carta di pagamento (MP08)', code: 'MP08' },
  { name: 'RID (MP09)', code: 'MP09' },
  { name: 'RID utenze (MP10)', code: 'MP10' },
  { name: 'RID veloce (MP11)', code: 'MP11' },
  { name: 'RIBA (MP12)', code: 'MP12' },
  { name: 'MAV (MP13)', code: 'MP13' },
  { name: 'Quietanza erario (MP14)', code: 'MP14' },
  { name: 'Giroconto su conti di contabilità speciale (MP15)', code: 'MP15' },
  { name: 'Domiciliazione bancaria (MP16)', code: 'MP16' },
  { name: 'Domiciliazione postale (MP17)', code: 'MP17' },
  { name: 'Bollettino di c/c postale (MP18)', code: 'MP18' },
  { name: 'SEPA Direct Debit (MP19)', code: 'MP19' },
  { name: 'SEPA Direct Debit CORE (MP20)', code: 'MP20' },
  { name: 'SEPA Direct Debit B2B (MP21)', code: 'MP21' },
  { name: 'Trattenuta su somme già riscosse (MP22)', code: 'MP22' },
  { name: 'PagoPA (MP23)', code: 'MP23' },
];

/** I soli nomi, per le query che filtrano sulle voci normative. */
export const SDI_PAYMENT_METHOD_NAMES: readonly string[] = SDI_PAYMENT_METHODS.map(
  (entry) => entry.name,
);

/**
 * Come si incassano al banco le voci di SISTEMA conosciute (tranche C2B).
 *
 * ⭐ **La chiave è il CODICE normativo, non il nome.** È la condizione che la
 * tranche deve garantire — «rinominare un Tipo non cambia la classificazione» —
 * e una mappa per nome la violerebbe per costruzione.
 *
 * ⛔ **Non è una regola derivata dal catalogo**: «tutte le MP0x sono contanti» è
 * falso. MP01 «Contanti» e MP04 «Contanti presso Tesoreria» sono entrambi
 * contanti per la fatturazione elettronica, ma solo il primo si incassa a un
 * banco di negozio. Questa è una lista di due voci, scritta a mano.
 *
 * ⚠️ Deve restare IDENTICA alla mappa della migration
 * `20260904170000_classificazione_incasso`, e un test lo verifica leggendo il
 * file di quella migration invece di ricopiarne il contenuto.
 */
export const SEED_TENDER_KINDS: Readonly<Record<string, PaymentTenderKind>> = {
  MP01: 'cash',
  MP08: 'electronic',
};

export const PAYMENT_OPTION_SEED: readonly PaymentOptionSeedEntry[] = [
  // Modalità di pagamento: elenco normativo fatturazione elettronica.
  ...SDI_PAYMENT_METHODS.map((entry, index) => ({
    kind: 'method' as PaymentOptionKind,
    name: entry.name,
    sortOrder: index + 1,
    methodCode: entry.code,
    // ⚠️ `undefined` per le ventuno voci non incassabili al banco, ed è lo
    //    stato giusto: la colonna resta `NULL`.
    tenderKind: SEED_TENDER_KINDS[entry.code],
  })),
  // Condizioni di pagamento.
  //
  // ⛔ Nessuna ha `methodCode`, e non è una dimenticanza: «30 gg f.m.» non è
  //    un modo di pagare. Il database lo impedisce con un `CHECK`.
  { kind: 'terms', name: 'Vista fattura', sortOrder: 1 },
  { kind: 'terms', name: '30 gg d.f.', sortOrder: 2 },
  { kind: 'terms', name: '30 gg f.m.', sortOrder: 3 },
  { kind: 'terms', name: '60 gg d.f.', sortOrder: 4 },
  { kind: 'terms', name: '60 gg f.m.', sortOrder: 5 },
  { kind: 'terms', name: '90 gg d.f.', sortOrder: 6 },
  { kind: 'terms', name: 'Pagamento anticipato', sortOrder: 7 },
];
