import { colonna } from './column-catalog';
import type { TableColumnDef } from './table-column.model';

/**
 * ⭐ **LE COLONNE DEL SOGGETTO, dichiarate una volta per DUE elenchi** —
 * proprietario, 01/09/2026: «danea mette tipo perché saranno colonne condivise
 * che si ripartiscono le schermate. Questa sarà condivisa con clienti».
 *
 * Clienti e fornitori sono due RUOLI dello stesso soggetto anagrafico: il
 * codice fiscale, l'indirizzo, i recapiti e l'IBAN sono lo stesso dato, letto
 * da due elenchi. Dichiararli due volte è il modo in cui, un mese dopo, la
 * stessa colonna si chiama «Prov.» di qua e «Provincia» di là — che è
 * esattamente il difetto che `column-catalog` è nato per chiudere.
 *
 * ⛔ **Non è UN elenco di colonne, sono SEGMENTI da comporre.** Un array unico
 * avrebbe costretto le due liste a passare bandierine per accendere e spegnere
 * pezzi (`sdiCode` sì, `freightTerms` no), e sarebbe l'anti-pattern che
 * `regole-architettura` chiama «fondere due componenti diversi». Ogni elenco
 * compone la propria sequenza e ci intercala ciò che è solo suo.
 *
 * ⚠️ **La larghezza di partenza sta QUI**, con la colonna: è la misura del dato
 * — cinque cifre di CAP, due lettere di provincia, ventisette caratteri di
 * IBAN — e non cambia perché a guardarla è un elenco invece dell'altro.
 * L'operatore la ridefinisce trascinando la maniglia, e quella sua scelta resta.
 *
 * ⚠️ **`display: 'code'` non è cosmetico**: incolonna le cifre
 * (`tabular-nums`) e vieta l'a capo. Serve ai dati che si confrontano una
 * cifra alla volta — P. IVA, codice fiscale, CAP, IBAN, telefoni.
 */

/** Identità fiscale: gli stessi due campi in cima a ogni anagrafica. */
export const COLONNE_SOGGETTO_FISCALI: readonly TableColumnDef[] = [
  {
    id: 'taxCode',
    label: 'Codice fiscale',
    filter: 'text',
    display: 'code',
    defaultVisible: false,
    defaultWidthPx: 150,
  },
  colonna('vatNumber', { defaultVisible: true, display: 'code', defaultWidthPx: 128 }),
];

/**
 * L'indirizzo, nell'ordine in cui lo si legge — «Via Roma 1, 80013 Casalnuovo
 * (NA)» — che è anche quello in cui lo si batte nella scheda.
 */
export const COLONNE_SOGGETTO_INDIRIZZO: readonly TableColumnDef[] = [
  {
    id: 'addressLine1',
    label: 'Indirizzo',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 220,
  },
  {
    id: 'postalCode',
    label: 'CAP',
    filter: 'text',
    display: 'code',
    defaultVisible: false,
    defaultWidthPx: 88,
  },
  colonna('city', {
    defaultVisible: true,
    display: 'truncate',
    defaultWidthPx: 180,
    filter: 'values',
  }),
  { id: 'province', label: 'Prov.', filter: 'text', defaultVisible: true, defaultWidthPx: 72 },
  { id: 'countryCode', label: 'Paese', filter: 'text', defaultVisible: false, defaultWidthPx: 72 },
];

/** Chi si chiama e come lo si raggiunge. */
export const COLONNE_SOGGETTO_CONTATTI: readonly TableColumnDef[] = [
  {
    id: 'contactName',
    label: 'Referente',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 160,
  },
  colonna('phone', { defaultVisible: false, display: 'code', defaultWidthPx: 140 }),
  {
    id: 'mobilePhone',
    label: 'Cellulare',
    filter: 'text',
    display: 'code',
    defaultVisible: false,
    defaultWidthPx: 140,
  },
  colonna('email', { defaultVisible: true, display: 'truncate', defaultWidthPx: 220 }),
  {
    id: 'pec',
    label: 'PEC',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 220,
  },
];

/** Le condizioni che valgono per entrambi i ruoli. */
export const COLONNE_SOGGETTO_PAGAMENTO: readonly TableColumnDef[] = [
  colonna('paymentMethod', {
    label: 'Modalità di pagamento',
    defaultVisible: false,
    defaultWidthPx: 150,
  }),
  {
    id: 'paymentTerms',
    label: 'Condizioni di pagamento',
    defaultVisible: false,
    defaultWidthPx: 150,
  },
];

/**
 * ⚠️ **L'IBAN è del SOGGETTO, non del ruolo**: se lo stesso soggetto è cliente
 * e fornitore, il conto è uno solo e i due elenchi mostrano lo stesso numero.
 */
export const COLONNA_SOGGETTO_IBAN: TableColumnDef = {
  id: 'iban',
  label: 'IBAN',
  filter: 'text',
  display: 'code',
  defaultVisible: false,
  defaultWidthPx: 250,
};

export const COLONNA_SOGGETTO_TRASPORTO: TableColumnDef = {
  id: 'transportResponsible',
  label: 'Incaricato trasporto',
  defaultVisible: false,
  defaultWidthPx: 140,
};

export const COLONNA_SOGGETTO_SITO: TableColumnDef = {
  id: 'website',
  label: 'Sito web',
  filter: 'text',
  display: 'truncate',
  defaultVisible: false,
  defaultWidthPx: 180,
};

/**
 * ⭐ **Lo stato del RUOLO**, non del soggetto: un soggetto può essere un
 * fornitore attivo e un cliente ritirato. Ogni elenco mostra il proprio.
 */
export const COLONNA_STATO_RUOLO: TableColumnDef = {
  id: 'roleStatus',
  label: 'Stato',
  defaultVisible: false,
  defaultWidthPx: 110,
};

/**
 * ⭐ **La colonna del ruolo GEMELLO** — «Anche cliente» sui fornitori, «Anche
 * fornitore» sui clienti. È il «Tipo» di Danea, e sta in cima per la sua stessa
 * ragione: questo catalogo serve due elenchi, e la prima cosa da sapere su una
 * riga è se quel soggetto è anche l'altra cosa.
 *
 * ⚠️ **Tre risposte, non due**, e la lettura sta nella tabella che la rende:
 * «no», «sì», e «sì ma disattivato» — quest'ultima dice che il ruolo esiste ed
 * è stato ritirato, e appiattirla su «no» nasconderebbe uno storico che c'è.
 */
export function colonnaRuoloGemello(id: 'alsoCustomer' | 'alsoSupplier'): TableColumnDef {
  return {
    id,
    label: id === 'alsoCustomer' ? 'Anche cliente' : 'Anche fornitore',
    defaultVisible: false,
    defaultWidthPx: 120,
  };
}

/**
 * Le note ANAGRAFICHE del soggetto. L'id resta per elenco perché le due liste
 * hanno anche note proprie del ruolo, e due colonne diverse non possono
 * chiamarsi uguale.
 */
export function colonnaNoteSoggetto(id: string): TableColumnDef {
  return {
    id,
    label: 'Note',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 220,
  };
}
