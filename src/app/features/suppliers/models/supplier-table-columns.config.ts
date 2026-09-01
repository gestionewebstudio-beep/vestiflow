import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * ⭐ **LE COLONNE DELL'ELENCO SONO I CAMPI DELL'ANAGRAFICA** — proprietario,
 * 01/09/2026: «adesso sappiamo quali colonne potrebbero essere selezionate nel
 * riepilogo fornitore, sarebbero quelle dell'anagrafica».
 *
 * ⛔ Erano **otto**, scelte una per una: chi voleva vedere l'IBAN o il referente
 * in elenco non poteva, e i tre campi aggiunti oggi non c'erano affatto. Ora
 * ogni dato della scheda è attivabile dal selettore Colonne.
 *
 * ## Le larghezze le decide il TIPO del dato
 *
 * > _«Diamo una grandezza non obbligata ma di partenza consone al tipo di
 * > colonna. Per esempio, cap e codice fornitore saranno molto ristrette, città
 * > leggermente più grande, denominazione ancora più larga, altre hanno campi
 * > obbligati e quindi conosciamo la larghezza, come coordinate e cap.»_
 *
 * ⭐ **«Non obbligata» è già nel motore**: `defaultWidthPx` è la larghezza di
 * PARTENZA, e l'operatore la cambia trascinando la maniglia — la sua scelta
 * viene prima e resta salvata. Qui si dichiara solo da dove si parte.
 *
 * ⚠️ **Dove la lunghezza è NOTA, la si scrive**: un CAP sono cinque cifre, una
 * provincia due lettere, un IBAN ventisette caratteri. Non sono stime: sono la
 * misura del dato, ed è la stessa regola delle larghezze di campo nella
 * maschera (`regole-architettura`: «un campo è largo quanto il dato che
 * ospita»).
 *
 * ⛔ **La ragione sociale NON ha larghezza, ed è voluto.** È l'unica colonna
 * lasciata libera: con `table-layout: fixed` si prende tutto lo spazio che
 * avanza, che è esattamente ciò che deve fare la colonna che identifica la
 * riga. Dichiararla significherebbe lasciare un vuoto a destra.
 *
 * ⚠️ **`display: 'code'` non è cosmetico**: incolonna le cifre
 * (`tabular-nums`) e vieta l'a capo. Serve a P. IVA, codice fiscale, CAP, IBAN
 * e telefoni — i dati che si confrontano una cifra alla volta.
 */
export const SUPPLIER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  /*
    ⭐ **QUESTO È L'ORDINE DELLA COLONNA DELLE ATTIVAZIONI DI DANEA** —
    proprietario, 01/09/2026: «se riesci a leggere nella colonna delle
    attivazioni, danea dà già un ordine più o meno stabilito».

    Letto dalla sua schermata, e riportato su ciò che qui esiste:

    ```text
    Cod. · Codice fiscale · Partita Iva · Denominazione
    Indirizzo · Cap · Città · Prov. · Nazione
    Referente · Tel. · Cell. · e-mail · Pec
    Sconti · Pagamento · Coord. bancarie · Ns. Banca
    Inc. trasporto · Porto · … · Note doc. · Home page
    ```

    ⛔ **Avevo messo prima il DOVE e poi il fiscale**, ragionando su come si
    consulta un elenco. Danea fa il contrario: identità e codici fiscali
    subito, poi l'indirizzo. Non era una mia deduzione da difendere — c'era già
    una convenzione, e questa è la sua.

    ⚠️ **Sono DUE sequenze diverse, e non vanno confuse**: questa è l'ordine in
    cui le colonne compaiono nel SELETTORE. L'ordine con cui appaiono a schermo
    lo detta il preset qui sotto — nella stessa Danea la finestra elenca «Cod. ·
    Codice fiscale · Partita Iva · Denominazione» mentre la tabella mostra
    «Cod. · Denominazione · Prov. · Partita Iva».
  */
  /*
    ⭐ **«Anche cliente» è il «Tipo» di Danea, e sta in cima per la sua stessa
    ragione** — spiegata dal proprietario il 01/09/2026: «danea mette tipo
    perché saranno colonne condivise che si ripartiscono le schermate. Questa
    sarà condivisa con clienti».

    Cioè: il «Tipo» non è primo per importanza, è primo perché **quel catalogo
    di colonne serve due elenchi** — clienti e fornitori — e la prima cosa da
    sapere su una riga è di quale dei due sta parlando.

    ⏸ **Qui la condivisione non c'è ANCORA**: queste definizioni sono dei soli
    fornitori. Diventeranno comuni col rifacimento dell'anagrafica cliente
    (`DA-FARE` §A), dove i campi sono gli stessi perché è lo stesso soggetto —
    e allora questa posizione sarà quella giusta anche qui.
  */
  { id: 'alsoCustomer', label: 'Anche cliente', defaultVisible: false, defaultWidthPx: 120 },
  colonna('code', { pinnable: true, defaultVisible: true, display: 'code', defaultWidthPx: 96 }),
  {
    id: 'taxCode',
    label: 'Codice fiscale',
    filter: 'text',
    display: 'code',
    defaultVisible: false,
    defaultWidthPx: 150,
  },
  colonna('vatNumber', { defaultVisible: true, display: 'code', defaultWidthPx: 128 }),
  {
    id: 'name',
    label: 'Ragione sociale',
    filter: 'text',
    defaultVisible: true,
    display: 'truncate',
  },
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
  { id: 'supplierDiscount', label: 'Sconto', defaultVisible: false, defaultWidthPx: 90 },
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
  {
    id: 'iban',
    label: 'IBAN',
    filter: 'text',
    display: 'code',
    defaultVisible: false,
    defaultWidthPx: 250,
  },
  {
    id: 'ourBankName',
    label: 'Ns. banca',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 160,
    filter: 'values',
  },
  {
    id: 'transportResponsible',
    label: 'Incaricato trasporto',
    defaultVisible: false,
    defaultWidthPx: 140,
  },
  { id: 'freightTerms', label: 'Porto', defaultVisible: false, defaultWidthPx: 130 },
  { id: 'roleStatus', label: 'Stato', defaultVisible: false, defaultWidthPx: 110 },
  {
    id: 'supplierNotes',
    label: 'Note',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 220,
  },
  {
    id: 'website',
    label: 'Sito web',
    filter: 'text',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 180,
  },
] as const;

/**
 * ⭐ **Di serie le principali**, com'è stato chiesto: codice, ragione sociale,
 * P. IVA, città, provincia, email.
 *
 * ⚠️ È il gruppo del riferimento Danea — Cod., Denominazione, Città, Prov.,
 * P. IVA — con l'**email** in più, che qui c'era già ed è il modo in cui a un
 * fornitore si scrive.
 *
 * ⛔ **OGNI PRESET SEGUE L'ORDINE DELLE DEFINIZIONI**, e non è una formalità.
 *
 * Il proprietario ha trovato il difetto il 01/09/2026: «nel momento in cui
 * spunto o deseleziono una colonna si passa alla vista personalizzata e cambia
 * tutto, anche l'ordinamento».
 *
 * La causa: finché si sta su un preset le colonne escono nell'ORDINE DEL
 * PRESET; al primo tocco su una spunta la vista diventa «Personalizzata» e
 * l'ordine torna quello delle DEFINIZIONI. Due sequenze diverse per la stessa
 * schermata, e la tabella si rimescolava sotto gli occhi.
 *
 * ⭐ Tenendole allineate, accendere o spegnere una colonna non sposta più
 * niente: il preset decide solo CHI si vede. La guardia
 * `check:ordine-preset` lo tiene fermo su tutti gli elenchi.
 */
export const SUPPLIER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['code', 'vatNumber', 'name', 'city', 'province', 'email'],
  [TableViewPresetId.Warehouse]: ['code', 'name', 'city', 'province', 'contactName', 'phone'],
  [TableViewPresetId.Accountant]: ['code', 'taxCode', 'vatNumber', 'name', 'pec', 'iban'],
  [TableViewPresetId.Supplier]: ['code', 'name', 'contactName', 'phone', 'email', 'website'],
  [TableViewPresetId.Analysis]: ['code', 'vatNumber', 'name', 'city', 'paymentTerms'],
  [TableViewPresetId.Operational]: [
    'code',
    'name',
    'supplierDiscount',
    'paymentMethod',
    'paymentTerms',
    'roleStatus',
  ],
};
