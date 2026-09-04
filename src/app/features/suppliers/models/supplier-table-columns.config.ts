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

    ⭐ **E dal 01/09/2026 la condivisione c'è davvero**: i campi del SOGGETTO —
    fiscali, indirizzo, contatti, pagamento, IBAN — arrivano da
    `@shared/table-columns/anagrafica-columns`, e l'elenco clienti compone gli
    stessi segmenti. Qui restano solo le colonne del RUOLO fornitore: sconto,
    Ns. banca, porto.
  */
  colonnaRuoloGemello('alsoCustomer'),
  colonna('code', { pinnable: true, defaultVisible: true, display: 'code', defaultWidthPx: 96 }),
  ...COLONNE_SOGGETTO_FISCALI,
  {
    id: 'name',
    label: 'Ragione sociale',
    filter: 'text',
    defaultVisible: true,
    display: 'truncate',
  },
  ...COLONNE_SOGGETTO_INDIRIZZO,
  ...COLONNE_SOGGETTO_CONTATTI,

  // ── Da qui in giù è del RUOLO fornitore, e il cliente ha le sue ──────────
  { id: 'supplierDiscount', label: 'Sconto', defaultVisible: false, defaultWidthPx: 90 },
  ...COLONNE_SOGGETTO_PAGAMENTO,
  COLONNA_SOGGETTO_IBAN,
  {
    id: 'ourBankName',
    label: 'Ns. banca',
    display: 'truncate',
    defaultVisible: false,
    defaultWidthPx: 160,
    filter: 'values',
  },
  COLONNA_SOGGETTO_TRASPORTO,
  { id: 'freightTerms', label: 'Porto', defaultVisible: false, defaultWidthPx: 130 },
  COLONNA_STATO_RUOLO,
  colonnaNoteSoggetto('supplierNotes'),
  COLONNA_SOGGETTO_SITO,
];

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
 * ⭐ **La correzione sta in `resolveVisibleColumns`**, che oggi ordina SEMPRE
 * per definizioni: il preset decide solo CHI si vede, e tenere qui la stessa
 * sequenza è ormai una cortesia verso chi legge, non un requisito.
 *
 * ⚠️ **Qui c'era scritto «la guardia `check:ordine-preset` lo tiene fermo su
 * tutti gli elenchi», e quella guardia NON ESISTEVA.** Scritta il 01/09/2026
 * per non lasciare una citazione falsa — che è peggio di nessuna citazione,
 * perché chiude la domanda invece di lasciarla aperta. Ma verifica un'altra
 * cosa, ed è bene saperlo: che ogni id elencato in un preset **esista** fra le
 * definizioni. Un refuso lì non è un errore per TypeScript, e a schermo si vede
 * solo una colonna attesa che manca.
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
