import {
  COLONNA_SOGGETTO_IBAN,
  COLONNA_SOGGETTO_SITO,
  COLONNA_SOGGETTO_TRASPORTO,
  COLONNA_STATO_RUOLO,
  COLONNE_SOGGETTO_CONTATTI,
  COLONNE_SOGGETTO_FISCALI,
  COLONNE_SOGGETTO_INDIRIZZO,
  COLONNE_SOGGETTO_PAGAMENTO,
  colonnaNoteSoggetto,
  colonnaRuoloGemello,
} from '@shared/table-columns/anagrafica-columns';
import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **LE COLONNE DELL'ELENCO SONO I CAMPI DELL'ANAGRAFICA**, e sono le STESSE
 * dei fornitori — proprietario, 01/09/2026: «danea mette tipo perché saranno
 * colonne condivise che si ripartiscono le schermate. Questa sarà condivisa con
 * clienti».
 *
 * Cliente e fornitore sono due RUOLI dello stesso soggetto: codice fiscale,
 * indirizzo, recapiti e IBAN sono lo stesso dato. Arrivano quindi da
 * `@shared/table-columns/anagrafica-columns`, nell'ordine della colonna delle
 * attivazioni di Danea — identità e fiscale, poi il dove, poi i contatti.
 *
 * ⛔ Erano **tredici**, e cinque campi della scheda non erano attivabili
 * affatto: PEC, referente, cellulare, IBAN, codice destinatario. Ora ogni dato
 * della scheda ha la sua colonna.
 *
 * ⚠️ **Qui restano solo le colonne del RUOLO cliente**: il codice destinatario
 * SDI, lo sconto cliente, le note commerciali, e l'origine — che dice se la
 * riga arriva da Shopify e sui fornitori non esiste.
 *
 * ⛔ **La colonna del NOME non ha larghezza, ed è l'unica.** Con
 * `table-layout: fixed` si prende lo spazio che avanza, che è ciò che deve fare
 * la colonna che identifica la riga.
 */
export const CUSTOMER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  colonnaRuoloGemello('alsoSupplier'),
  colonna('code', { pinnable: true, defaultVisible: true, display: 'code', defaultWidthPx: 96 }),
  ...COLONNE_SOGGETTO_FISCALI,
  /*
    ⚠️ **«Cliente», non «Ragione sociale»**, e non è un'incoerenza col fornitore:
    la cella mostra il nome VISUALIZZATO — ragione sociale se c'è, nome e cognome
    per una persona fisica (`customerDisplayName`). Un cliente al dettaglio non
    ha una ragione sociale, e intitolare così la colonna che lo identifica
    direbbe una parola che per metà delle righe non vale.

    ⭐ **La ragione sociale resta attivabile a parte** (`companyName`), per chi
    vuole vedere l'azienda anche quando il nome mostrato è quello della persona.
  */
  {
    id: 'name',
    label: 'Cliente',
    filter: 'text',
    defaultVisible: true,
    display: 'truncate',
    pinnable: true,
    cardTitle: true,
  },
  {
    id: 'companyName',
    label: 'Ragione sociale',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 180,
  },
  ...COLONNE_SOGGETTO_INDIRIZZO,
  ...COLONNE_SOGGETTO_CONTATTI,
  /*
    ⭐ **Il codice destinatario è del solo CLIENTE**: è dove si trasmette la
    fattura che gli si emette. Sul fornitore non esiste — è la fattura che manda
    lui, e il destinatario siamo noi.
  */
  {
    id: 'sdiCode',
    label: 'Codice destinatario',
    filter: 'text',
    display: 'code',
    defaultVisible: false,
    defaultWidthPx: 130,
  },

  // ── Da qui in giù è del RUOLO cliente ───────────────────────────────────
  { id: 'customerDiscount', label: 'Sconto', defaultVisible: false, defaultWidthPx: 90 },
  ...COLONNE_SOGGETTO_PAGAMENTO,
  COLONNA_SOGGETTO_IBAN,
  COLONNA_SOGGETTO_TRASPORTO,
  COLONNA_STATO_RUOLO,
  colonnaNoteSoggetto('customerNotes'),
  {
    id: 'commercialNotes',
    label: 'Note commerciali',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 220,
  },
  COLONNA_SOGGETTO_SITO,
  /*
    ⚠️ **«Origine» non ha gemella sui fornitori**: dice se l'anagrafica arriva da
    Shopify, e con essa che i dati di contatto sono owned dal canale
    (`regole-gestionale`, Ownership dei dati). I fornitori non si sincronizzano.
  */
  colonna('source', { defaultVisible: true, defaultWidthPx: 80 }),
  colonna('createdAt', { defaultVisible: false, defaultWidthPx: 100 }),
];

/**
 * ⭐ **Di serie le principali**, le stesse dei fornitori più l'origine: codice,
 * P. IVA, cliente, città, provincia, email, origine.
 *
 * ⚠️ **Il preset dice CHI si vede, non in che ordine** — l'ordine a schermo lo
 * dà `resolveVisibleColumns`, che segue queste definizioni. Tenere qui la stessa
 * sequenza è una cortesia verso chi legge, e `check:ordine-preset` verifica che
 * ogni id elencato esista davvero.
 */
export const CUSTOMER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ['code', 'vatNumber', 'name', 'city', 'province', 'email', 'source'],
  [PresetId.Warehouse]: ['code', 'name', 'city', 'province', 'phone'],
  [PresetId.Accountant]: ['code', 'taxCode', 'vatNumber', 'name', 'companyName', 'pec', 'sdiCode'],
  [PresetId.Supplier]: ['alsoSupplier', 'code', 'name', 'email', 'phone'],
  [PresetId.Analysis]: ['code', 'vatNumber', 'name', 'city', 'customerDiscount', 'paymentTerms'],
  [PresetId.Operational]: [
    'code',
    'name',
    'phone',
    'customerDiscount',
    'paymentTerms',
    'roleStatus',
  ],
};

export const CUSTOMER_LIST_VIEW = TableViewId.CustomersList;
