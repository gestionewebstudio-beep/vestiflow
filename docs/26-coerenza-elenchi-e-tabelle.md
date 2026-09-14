# 26 — Coerenza degli elenchi e delle tabelle in tutta l'applicazione

> **Mandato del proprietario, 11/09/2026.** Sistemare ora la coerenza di elenchi e
> tabelle nell'intera applicazione, senza rimandare i casi. Non basta sostituire le
> tabelle: contenitori, intestazioni, righe, colonne, filtri, ordinamento,
> ridimensionamento, selezioni, azioni e resa sul telefono. **Condividere ciò che
> svolge lo stesso lavoro, senza forzare le maschere di inserimento dentro un
> componente pensato per gli elenchi.**

⭐ **Questo è l'UNICO elenco di avanzamento.** Ogni schermata ha una riga: problema,
componente riusato, esito delle verifiche. Il censimento è il punto di partenza; la
consegna sono le correzioni applicate, gruppo per gruppo.

---

## 0. Il criterio, prima dell'elenco

```text
ELENCO        righe che si consultano: si ordina, si filtra, si seleziona, si scorre
              -> app-data-table (motore) dentro app-list-page (telaio), colonne dal catalogo,
                 card progettata sotto lg (appRowCard), riga totali dove ha senso
MASCHERA      righe che si COMPILANO: celle editabili, fuoco, autosalvataggio
              -> NON il motore. La riga condivisa (document-line-row), la testata
                 (document-line-head), la card (document-line-card), la grammatica
                 globale _document-form.scss
DETTAGLIO     coppie etichetta:valore, cronologie, allegati, vocabolari, menu
              -> detail-facts, attachments-panel, i gestori; NON un elenco
```

⛔ **Non si aggiungono totali, filtri o azioni senza significato per quella schermata.**
Il motore li OFFRE; ogni schermata dichiara quali usa e perché.

---

## 1. Ciò che è già condiviso (misurato)

| Pezzo               | Dove                                                                                           | Fa                                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-data-table`    | `shared/components/data-table`                                                                 | intestazione, righe, ordinamento (`sortable`, `sort`), selezione (`selectionMode`), clic di riga, tono di riga, totali (`totals`), virtualizzazione, `appCell` / `appRowActions` / `appRowCard`, `viewId` per le preferenze colonne |
| `app-list-page`     | `shared/components/list-page`                                                                  | testata, conteggio, ricerca, periodo, filtri (`[filters]`), pannello mobile «Filtri (n)», selettore colonne, stati vuoto/errore/caricamento, piede ancorato                                                                         |
| catalogo colonne    | `shared/table-columns/column-catalog.ts`, `anagrafica-columns.ts`                              | la definizione di ogni colonna: tipo, larghezza, filtrabilità, `cardTitle`                                                                                                                                                          |
| filtri di colonna   | `column-filter`, `column-filters.ts`, `column-filter.store.ts`                                 | il controllo UNICO: spunte, testo, estremi, Includi/Escludi, «Tutti»                                                                                                                                                                |
| ordinamento         | `column-sort.util.ts`                                                                          | comparatori per testo, numero, data                                                                                                                                                                                                 |
| ridimensionamento   | `table-column-resize.directive.ts`, `column-width-distribution.util.ts`                        | maniglia visibile, larghezze per tipo                                                                                                                                                                                               |
| azioni di elenco    | `list-actions-bar`, catalogo azioni (`check:list-actions`)                                     | la riga comandi fissa in basso                                                                                                                                                                                                      |
| card sotto `lg`     | `styles/_list-card.scss` + `appRowCard`                                                        | tre fasce: identità · parole · numeri                                                                                                                                                                                               |
| grammatica tabella  | `styles/_responsive-table.scss` (`summary-grammar`, `table-scroll`, `data-table-mobile-cards`) | font, altezze, divisori, scorrimento                                                                                                                                                                                                |
| riga documento      | `domain/documents/components/document-line-row` / `-head` / `-quick-row` / `-card`             | la riga, la testata, la riga di inserimento e la card delle MASCHERE                                                                                                                                                                |
| celle di riga       | `document-line-code-cell`, `-product-cell`, `-select-cell`, `-unit-cell`, `-suggestions`       | le celle che ogni maschera riusa                                                                                                                                                                                                    |
| coppie di dettaglio | `detail-facts`                                                                                 | etichetta:valore                                                                                                                                                                                                                    |
| allegati            | `attachments-panel`, `attachments-dialog`                                                      | elenco allegati                                                                                                                                                                                                                     |
| stati               | `empty-state`, `table-skeleton`, `inline-banner`                                               |                                                                                                                                                                                                                                     |

---

## 2. Il censimento

Metodo: script sui 99 template che contengono `<table>` o un `@for` dentro `ul`/`ol`/`dl`/`div`
(`scratchpad/censimento-elenchi.mjs`, `censimento-for.mjs`, 11/09/2026), poi classificazione a
mano su cosa itera ogni `@for`.

```text
template con qualcosa da guardare   99
sul motore                          15
<table> scritte a mano              36   (di cui 1 e' il motore stesso, 1 lo scheletro)
```

### 2.A — ELENCHI fuori dal motore (da portare sul motore)

| #   | Schermata                                                                      | Oggi                                     | Problema                                                                                                     | Riuso previsto                                              | Esito             |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------- |
| A1  | **Import prodotti** — anteprima ed esito (`product-import`)                    | 2 `<table>` a mano                       | niente ordinamento, filtri, maniglie; sul telefono ripiego generico coi testi a destra                       | motore + colonne nel catalogo + `appRowCard`                | ✅ 11/09 — §5.1   |
| A2  | **Import giacenze** — anteprima ed esito (`inventory-import`)                  | 2 `<table>` a mano                       | idem                                                                                                         | idem                                                        | ✅ 11/09 — §5.2   |
| A3  | **Allinea giacenze — le non allineate** (`shopify-integration-panel`)          | `<ul>` con 4 `<span>`                    | fatto in questo ramo e già segnalato dal proprietario; con 300 righe cercare una sede o un motivo è scorrere | motore, filtro su sede e motivo                             | ✅ 11/09 — §5.3   |
| A4  | **Allinea — permessi Shopify** (`shopify-integration-panel`)                   | `<table>` a mano                         | tabella di consultazione                                                                                     | motore, o `detail-facts` se non è un elenco                 | ↩ C 11/09 — §5.4  |
| A5  | **Utenti** (`users-page`)                                                      | `<table>` a mano                         | debito già dichiarato in `regole-qualita`                                                                    | motore                                                      | ↩ B 11/09 — §5.6  |
| A6  | **Codici IVA** (`vat-codes-page`)                                              | `<table>` + gruppi a `div`               | debito dichiarato                                                                                            | motore                                                      | ✅ 11/09 — §5.7   |
| A7  | **Sedi** (`location-table`)                                                    | **4** `<table>` a mano                   | debito dichiarato; quattro tabelle per quattro sottoinsiemi                                                  | motore, una tabella con filtro o quattro sezioni            | ✅ 11/09 — §5.8   |
| A8  | **Dashboard — sotto scorta** (`low-stock-table`)                               | `<table>` a mano                         | debito dichiarato                                                                                            | motore                                                      | ✅ 11/09 — §5.9   |
| A9  | **Dashboard — ultime vendite** (`recent-sales-table`)                          | `<table>` a mano                         | debito dichiarato                                                                                            | motore                                                      | ✅ 11/09 — §5.9   |
| A10 | **Report per sede** (`report-location-table`)                                  | `<table>` a mano                         |                                                                                                              | motore                                                      | ✅ 11/09 — §5.10  |
| A11 | **Ricerca giacenza** (`stock-lookup`)                                          | `<table>` sedi + `<ul>` righe/perSede    | sul telaio ma non sul motore                                                                                 | motore                                                      | ↩ C 11/09 — §5.11 |
| A12 | **Analisi** (`business-analytics-panel`)                                       | 2 `<table>` (canali, prodotti top)       |                                                                                                              | motore                                                      | ✅ 11/09 — §5.12  |
| A13 | **Admin — utenti del tenant** (`admin-tenant-users-panel`)                     | `<table>` a mano                         |                                                                                                              | motore                                                      | ↩ B 11/09 — §5.13 |
| A14 | **Admin — elenco aziende** (`create-client`)                                   | `<table>` a mano                         |                                                                                                              | motore                                                      | ✅ 11/09 — §5.13  |
| A15 | **Fornitori dell'articolo** (`product-supplier-links`)                         | `<table>` a mano                         | piccolo elenco nella scheda                                                                                  | motore, senza filtri                                        | ✅ 11/09 — §5.14  |
| A16 | **Dettaglio vendita online** — righe e movimenti (`online-sale-detail`)        | 2 `<table>`                              | sola lettura                                                                                                 | `document-lines-table` per le righe; motore per i movimenti | ✅ 11/09 — §5.15  |
| A17 | **Reso al banco** — righe (`cash-return`)                                      | `<table>`                                | da classificare: consultazione o compilazione?                                                               |                                                             | ↩ B 11/09 — §5.16 |
| A18 | **Cassa — righe** (`cash-register`)                                            | `<table>`                                | da classificare                                                                                              |                                                             | ↩ B 11/09 — §5.16 |
| A19 | **Dettaglio operazione / sessione di cassa** — pagamenti, movimenti, documenti | `<ul>`                                   | elenchi di consultazione                                                                                     | motore o `detail-facts`                                     | ✅ 11/09 — §5.17  |
| A20 | **Giacenze — prenotazioni** (`inventory-levels`)                               | `<ul>`                                   | elenco secondario su una pagina già sul telaio                                                               | motore                                                      | ✅ 11/09 — §5.18  |
| A21 | **Scheda prodotto** — listini, collezioni, metafield, immagini                 | `<ul>`                                   | coppie di dettaglio                                                                                          | `detail-facts`                                              | ↩ C 11/09 — §5.20 |
| A22 | **Dettaglio ordine fornitore** — documenti collegati                           | `<ul>`                                   |                                                                                                              | motore o `detail-facts`                                     | ✅ 11/09 — §5.19  |
| A23 | **Modalità di pagamento** (`payment-options-page`)                             | `div` + `<ul>`                           | configurazione                                                                                               |                                                             | ↩ C 11/09 — §5.20 |
| A25 | **Ordini cliente — vista telefono** (`sales-order-table`)                      | `<ul>` a mano + motore spento sotto `lg` | non censita: sotto `lg` l’elenco stava FUORI dal motore — senza Seleziona, filtri, totali, finestra          | la card del motore (`appRowCard`), già scritta e mai vista  | ✅ 11/09 — §5.21  |
| A26 | **Scheda articolo — giacenze per variante** (`product-form`)                   | `<table>` a mano                         | non censita: elenco di consultazione nel tab Magazzino, senza ripiego sotto `lg`                             | motore, colonne dal catalogo, totali                        | ✅ 11/09 — §5.22  |
| A24 | **Licenze sedi** (`location-licensing-panel`)                                  | `<ul>`                                   | elenco a selezione                                                                                           |                                                             | ↩ C 11/09 — §5.20 |

### 2.B — MASCHERE di inserimento (conservano il comportamento; riusano le parti compatibili)

Misura sulle dieci maschere con righe editabili:

| Maschera                                            | riga | testata | quick-row | card | Nota                                        |
| --------------------------------------------------- | ---- | ------- | --------- | ---- | ------------------------------------------- |
| Arrivo merce                                        | ✅   | ✅      | —         | ✅   |                                             |
| DDT / Fatture (`sales-document-form`)               | ✅   | ✅      | —         | ✅   |                                             |
| Rettifica (`stock-operation-form`)                  | ✅   | ✅      | —         | ✅   |                                             |
| Trasferimento                                       | ✅   | ✅      | —         | ✅   |                                             |
| Ordine fornitore                                    | ✅   | ✅      | —         | ✅   |                                             |
| Ordine cliente                                      | ✅   | ✅      | ✅        | ✅   |                                             |
| Vendita al banco                                    | ✅   | ✅      | ✅        | ✅   |                                             |
| **Registrazione fattura** (`purchase-invoice-form`) | ⛔   | ⛔      | —         | ⛔   | 2 `<table>` proprie, 1 sola cella condivisa |
| **Corrispettivo manuale** (`manual-receipt-form`)   | ⛔   | ⛔      | —         | ✅   | card sì, riga e testata no                  |
| **Movimento di magazzino** (`movement-form`)        | ⛔   | ⛔      | —         | ⛔   | niente di condiviso                         |

⏸ **`quick-row` in due maschere su otto che inseriscono articoli**: il componente dichiara
«è dove l'hanno tutte le maschere che inseriscono articoli». È una divergenza da verificare
contro la specifica `11` A15, **non da uniformare da soli**.

Griglie di varianti (`product-variants-step`, `product-options-step`, `product-variant-table`)
e matrice permessi (`user-permissions-editor`): maschere, fuori dal motore per costruzione.
Da verificare che non duplichino fra loro.

### 2.C — Non elenchi (legittimamente fuori)

Navigazione (sidebar, breadcrumb, tab, menu azioni, ricerca globale), tendine
(`select-menu`, selettore colonne), coppie di dettaglio (`document-totals`, `detail-facts`,
`tenant-client-card`), dialoghi (cronologia, includi, cambio negozio), selettori
(`product-picker-dialog`, `product-search-results`, suggerimenti, tassonomia), gestori dei
vocabolari (categorie, unità di misura, opzioni, tipi documento esterni, numeratori),
allegati, immagini del prodotto, spezzatino pagamenti, fattori MFA, tema, anteprima di
stampa.

---

## 3. L'ordine dei gruppi

1. ✅ **A1 · A2 · A3** — i due rapporti di import e le non allineate: i tre che il
   proprietario ha guardato.
2. ✅ **A5 · A6 · A7 · A8 · A9** — il debito già dichiarato.
3. ✅ **A10 · A11 · A12 · A13 · A14 · A15** — gli altri elenchi.
4. ✅ **A16 – A24** — le classificazioni da sciogliere, una per una; più **A25 · A26**,
   trovate dalla guardia e non dal censimento a mano.
5. ✅ **B** — le tre maschere senza riga e testata condivise (controllate: §5.23).
6. ✅ **Guardie** — `check:elenchi-fuori-motore` (§4).

Ogni gruppo: correzione, prove, **verifica a schermo su scrivania e telefono** con la fixture
isolata, riga di questa tabella aggiornata.

---

## 4. Le guardie da rafforzare

✅ **`npm run check:elenchi-fuori-motore`** (`scripts/check-elenchi-fuori-motore.mjs`, dentro
`npm run lint`, 11/09/2026). Legge ogni template di `src/app`, commenti esclusi, e trova due
cose: un `<table>` e un `@for` dentro `<ul>`/`<ol>`. Ogni template che ne ha almeno una deve
stare in `ELENCO_MOTIVATO` con la **classe** (B maschera · C non elenco) e il **perché**; un
elenco di consultazione non ha una classe possibile, quindi va sul motore. ⚠️ **La lista non
invecchia**: una voce il cui template non ha più niente da motivare fa fallire il controllo.
Falsificata nelle due direzioni prima di registrarla: un `<ul>` con `@for` in un template nuovo
→ rosso; una voce senza template → rosso. Oggi: **57 template motivati**, zero non motivati.

⚠️ Non vede una vista doppia che non usi `ul`/`ol` (un `<div>` con `@for` accanto al motore):
è il caso di A25 con un tag diverso. Si allarga quando si presenta, non prima.

---

## 5. Avanzamento, gruppo per gruppo

Una sottosezione per riga chiusa: cosa si è riusato, cosa si è tolto, cosa è emerso e come
è stato verificato. Le misure stanno qui, non in chat.

### 5.1 — A1 · Import prodotti (11/09/2026) ✅

**Riusato, senza copie locali**: `app-data-table` con `[viewId]`, colonne dal catalogo
(`colonna('status')`, `colonna('articleCode')`) e due viste nuove registrate nel modello e
nell'API (`products_import_preview`, `products_import_result` — `check:table-views` conta 36
id allineati); `createColumnFilters` + `ordinaPerColonne` (`check:filtri-colonna` passa da 14
a 15 elenchi); `appCell` per stato e note; `appRowCard` con la grammatica `list-card` a tre
fasce; `app-table-column-picker` e il pulsante «Filtri» via `ColumnFilterStore` nella stessa
forma del dettaglio inventario, con i sei token della barra densa del telaio sul contenitore.

**Tolto**: le due `<table>` a mano, il contenitore di scorrimento locale, i due mixin e le
classi numeriche del foglio; l'etichetta «Esito» della colonna stato, che il catalogo fissa a
«Stato» perché lo stesso concetto porti la stessa parola ovunque.

**Conservato**: dati e contratti degli endpoint (`ImportPreviewApiRow`, esito con `message`),
l'avviso «Immagini non scaricate (n su m)» nella colonna Dettaglio, i conteggi del riquadro
di esito, le note per riga. Nessuna riga totali (una somma di varianti di articoli diversi non
dice niente — `summable: false`) e nessuna azione: è un rapporto.

**Tre difetti emersi e misurati in un browser vero**, nessuno dei quali falliva:

|                                | Misura                                                                                                  | Causa                                                                                                                                                                                                                      | Correzione                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| pagina bianca                  | `visibleColumns` in un inizializzatore di campo, prima di `registerView`                                | ordine di costruzione                                                                                                                                                                                                      | assegnate nel costruttore, dopo la registrazione                                                                                      |
| pannello del filtro ritagliato | regione di scorrimento alta **60px**; `elementFromPoint` al centro del pannello → la barra azioni sotto | la pagina non dava altezza al motore (`table-scroll(riempi)` senza catena)                                                                                                                                                 | `list-page-fills-viewport('product-import', 'app-data-table')`, come Movimenti e Ordini fornitore                                     |
| ⛔ **riga di dati alta 245px** | una riga sola in una regione da 280                                                                     | **difetto del MOTORE**: `.data-table { block-size: 100% }` da `lg` stirava ogni tabella, ma la riga di riempimento esiste solo con i totali (`@if (totals())`) — il difetto del 30/08 rientrato per chi i totali non li ha | lo stiramento è ora `.data-table--con-totali`; senza `tfoot` non c'è niente da spingere in fondo e la card bianca la porta la regione |

⚠️ **Il terzo riguarda ogni elenco sul motore senza totali dentro una catena di altezze**: oggi
Operazioni di cassa, Dettaglio inventario, Corrispettivi e questo. Con molte righe non si vede
(non avanza niente); con poche, le righe crescono. Da riguardare a schermo su quei tre quando si
arriva alle loro righe (A18/A19, C) — la correzione è nel motore e li copre già.

**Prove**: `e2e/import-immagini-anomalia.spec.ts` (fixture isolata, 3 prove): l'anomalia
accanto alla riga pulita; ordinamento **numerico** su Varianti (10 contro 2: un confronto
testuale metterebbe «10» prima) e **testuale** su Prodotto, filtro di colonna acceso/spento su
anteprima e rapporto, riga ≤ 26px e pannello del filtro non ritagliato; la card sotto `lg` con il
messaggio fra le parole e nessuno scorrimento orizzontale. Le due misure sono state
**falsificate** rimettendo lo stiramento (245, rosso) e togliendo la catena (pannello coperto,
rosso). Suite isolata 44 verdi + 1 prova di prestazioni rossa per soglia di tempo sotto carico,
verde rilanciata da sola; `npm test` 3.430, `test:components` 1.330, `check:types` e
`npm run lint` (58 guardie) verdi.

**Schermate**: `test-results/import-immagini/rapporto-import{,-filtrato,-mobile}.png`.

⏸ **DECISIONE APERTA — «Filtri» sotto `lg` fuori dal telaio.** Sul telaio, sotto `lg` il
pulsante apre il pannello laterale che rende un `app-column-filter` per colonna filtrabile
(`list-page.component.html`). Fuori dal telaio — il Dettaglio inventario, da cui questa forma
è copiata, e ora questo rapporto — il pulsante accende i controlli nelle intestazioni, che sotto
`lg` non esistono: **sul telefono non fa niente di visibile**. Non è nato qui, ma qui si vede.
Due strade, e la scelta non è mia: nascondere il pulsante sotto `lg` dove non c'è il telaio
(onesto: niente filtri sul telefono per questi due), oppure estrarre il pannello del telaio in un
pezzo condiviso che anche le pagine non-elenco possano ospitare. Fino alla decisione resta com'è,
in entrambe le schermate.

### 5.2 — A2 · Import giacenze (11/09/2026) ✅

**La stessa forma di A1, senza una riga copiata**: motore, due viste registrate da entrambe le
parti (`inventory_import_preview`, `inventory_import_result` — 38 id allineati), colonne dal
catalogo (`sku`, `location`, `status`), `createColumnFilters` + `ordinaPerColonne` con
`numeroDi` sulle tre quantità, `appRowCard` a tre fasce, Colonne + Filtri sul contenitore con i
sei token della barra densa, `list-page-fills-viewport('inventory-import', 'app-data-table')`.

**Due differenze da A1, e sono del contenuto:**

|                         | Perché                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **la riga totali C’È**  | Attuale, Nuovo e Delta sono quantità, cioè grandezze additive (`regole-stile-ui` §6: «una colonna numerica visibile ha il suo totale»). La somma dei delta dice di quanti pezzi l’import muove il magazzino — il numero da sapere prima di premere Importa. `totaliDiElenco`, la stessa primitiva delle Giacenze; una riga con errore ha `null` e nella somma vale zero, perché non ha una quantità da contare |
| **«Location» → «Sede»** | il catalogo fissa l’etichetta e non si sovrascrive: è la parola di ogni altro elenco. L’intestazione del CSV resta «Location», che è il contratto del file, non dell’interfaccia                                                                                                                                                                                                                               |

**Tolto**: le due `<table>` a mano, il contenitore di scorrimento, i due mixin, le classi
numeriche; l’etichetta «Esito» della colonna stato (catalogo: «Stato»).

**Conservato**: contratti degli endpoint (nessun mapper in mezzo: la fixture e2e è la forma
esatta di `InventoryImportService`), i quattro conteggi dell’anteprima, i banner, il riquadro
di esito, la guardia «non uscire durante l’import». Il delta si legge col segno («+10», «−2») in
tabella, sulla card e nel totale; sulla card il negativo è in `--color-danger`.

**Prove**: `e2e/import-giacenze.spec.ts` (fixture isolata, 3 prove). Anteprima: riga totali
«3 voci · 9 · 17 · +8» che segue il filtro («1 voce» sulla sola riga con errore); ordinamento
**numerico** sul Delta con un `null` in mezzo (per il motore vale −∞ e apre il crescente:
`column-sort.util`), −2 prima di +10 dove il testo metterebbe «+10» prima di «-2»; filtro a
**valori** su Sede; le due misure di §5.1 (riga ≤ 26px, pannello non ritagliato). Rapporto:
ordinamento su SKU, dettaglio per riga. Telefono: «Attuale 5 · Nuovo 15 · Delta +10» coi nomi,
delta negativo rosso, nessuno scorrimento orizzontale. `npm run lint` (58 guardie),
`check:types`, `test:components` 1.330 e `tsc` + prove dell’API (`user-preferences`) verdi.

**Schermate**: `test-results/import-giacenze/{anteprima,anteprima-filtrata,rapporto,anteprima-mobile}.png`.

### 5.3 — A3 · Allinea giacenze, le non allineate (11/09/2026) ✅

**Riusato**: motore con vista `shopify_allinea_non_allineate` (39 id allineati), `colonna('location')`
(«Sede»), `createColumnFilters` + `ordinaPerColonne`, `appCell` sul motivo (resta in
`--color-warning`: è l’anomalia), `appRowCard` — articolo in testa, motivo come ancora, variante ·
sede · dettaglio fra le parole — Colonne + Filtri sul contenitore con i sei token del telaio.

**Tolto**: il `<ul>` con quattro `<span>`, la griglia `2fr 1fr 1fr 1.5fr`, le quattro classi di
colore, il `title` sul motivo.

**Conservato**: il tetto `--table-scroll-max-h` che aveva l’elenco (qui il motore NON riempie la
finestra: è un blocco fra gli altri delle Impostazioni, e la pagina scorre intera); i tre
conteggi, «Controllo incompleto», il ripiego `variante || sku || codiceArticolo || —`.

**Aggiunto, dal dato che c’era già**: il **dettaglio** era nel `title` della riga, leggibile solo
passandoci sopra col mouse e sul telefono mai. È una colonna, e sulla card sta fra le parole.

⛔ **Difetto del MOTORE, il secondo di questo lavoro, misurato in un browser vero**: con tre righe la
regione di scorrimento è alta 101px e il pannello del filtro (114px e più) ne restava **ritagliato**
— l’opzione «Errore di lettura» esisteva nel DOM e non era cliccabile. Il difetto di §5.1 senza la
via d’uscita di §5.1: qui la catena di altezze non si può dare (non è una pagina elenco), e vale
per ogni tabella sul motore fuori dal telaio con poche righe — il Dettaglio inventario compreso.

⭐ **Correzione nel `select-menu`, gated**: input `panelFixed`, acceso dal motore sui soli filtri
di colonna nelle intestazioni. Il pannello è `position: fixed`, posizionato sul rettangolo del
trigger all’apertura (`decidiIlLato`, che già misurava): nessun `overflow` di antenato lo ritaglia.
Si **ribalta in verticale** quando sotto non ci sta e sopra sì — la stessa regola del ribaltamento
laterale — perché un pannello sotto il bordo della finestra non si raggiunge; uno scorrimento fuori
dal pannello lo chiude (dentro — le voci, il calendario — no), e così `resize`. ⚠️ Nasce spento: le
altre 137 istanze di `app-select-menu` nei template non cambiano, e nel pannello laterale del telaio (un cassetto con
`transform`, dove il fisso sarebbe relativo al cassetto) i filtri restano `absolute`.

**Prove**: `shopify-integration-panel.component.spec.ts` 28 verdi (quattro adeguate al testo doppio
riga+card, più: 25 righe contate come `tr.data-table__row`, dettaglio in colonna, intestazioni Sede
e Motivo); `e2e/allinea-pannello.spec.ts` 5 verdi — le tre di prima con l’aiutante `riga()`, più
ordinamento su Articolo, filtro a valori sul Motivo con le due misure (riga ≤ 26px, pannello non
ritagliato — rossa prima del pannello fisso), e la card sul telefono. Suite isolata **50 verdi**
(comprese le 7 di `filtri-colonna`, che misurano il riquadro del pannello), `npm test` 3.430,
`npm run lint` (58 guardie), `check:types` verdi.

**Schermate**: `test-results/allinea/07-motore-filtrato.png`, `08-telefono.png`.

### 5.4 — A4 · Permessi Shopify: classificata C, resta fuori dal motore ↩

Guardata prima di toccarla: è una `<table>` a due colonne dentro un `<details>` chiuso — Area
(etichetta + descrizione) → Accesso (pastiglia «Lettura», pastiglia «Scrittura»). Le righe sono
**i gruppi di permessi della connessione**, al più una manciata, fissi finché non cambia
l’installazione: non c’è niente da ordinare, da filtrare, da sommare o su cui agire. È una coppia
di dettaglio con una pastiglia per valore, cioè la classe C del censimento (`tenant-client-card`,
`detail-facts`), non un elenco di record.

⚠️ **Non passa a `detail-facts`**: quel componente rende `label → testo` (più un link), e qui il
valore è **due pastiglie con tono** — neutro per la lettura, successo per la scrittura — che
dicono a colpo d’occhio cosa manca. Appiattirle in «Lettura · Scrittura» perderebbe il segnale che
la tabella esiste per dare. Portarla sul motore darebbe una testata con ordinamento e filtri a un
riquadro di sei righe: è la «funzione non prevista» che il mandato dice di non aggiungere.

⭐ **Va nell’elenco motivato della guardia** (§4) quando la guardia sarà scritta: la ragione è
questa sottosezione.

---

### 5.4-bis — I componenti comuni, guardati su schermate non toccate (11/09/2026) ✅

Due pezzi condivisi erano cambiati nel gruppo 1 — `.data-table { block-size: 100% }` solo con i
totali, e il pannello fisso del `select-menu` sui filtri di colonna — e il proprietario ha chiesto
di guardare **le altre** schermate, non solo A1–A3. `e2e/componenti-comuni-invariati.spec.ts`,
fixture isolate, tre prove:

| Schermata                                      | Che cosa si è misurato                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fornitori** (telaio, CON totali)             | righe a 25px; riga totali in fondo alla regione con 288px di riempimento sotto le righe (il riempimento c’è ancora); il menu **Colonne** (un `select-menu` non toccato) apre `absolute` sotto il suo trigger e si raggiunge; il filtro di colonna «Città» apre `fixed`, sotto la sua intestazione (scarto ≤ 2px), dentro la finestra, raggiungibile |
| **Operazioni di cassa** (telaio, SENZA totali) | tre operazioni in una regione da mezzo schermo: le righe restano a 25px — è il difetto di §5.1 nella sua sede naturale, e la correzione del motore lo copre; il menu **Periodo** apre `absolute` come prima                                                                                                                                         |
| **Fornitori sul telefono**                     | il pannello filtri del telaio: dentro, il filtro «Città» resta `absolute` (il fisso non è acceso lì), si sceglie «Napoli», «Vedi risultati» → 2 righe                                                                                                                                                                                               |

⚠️ **Una misura fatta subito dopo il clic era cieca una volta su due**: il pannello si rende al
giro di rendering successivo, non dentro il clic. Si aspetta il `listbox` prima di misurare.

### 5.5 — D1 · Il pannello filtri, estratto dal telaio e riusato (11/09/2026) ✅

**Che cosa è stato estratto** da `app-list-page`, e dove vive ora:

| Pezzo                               | Componente                                                     | Che cosa porta con sé                                                                                                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| la zona filtri, nelle sue due vesti | `app-table-filters-panel` (`shared/components/table-filters/`) | su scrivania la riga dei filtri di dominio proiettati; sotto `lg` il foglio laterale con scrim, testa, una voce per colonna filtrabile visibile, «Azzera filtri», «Vedi risultati»; fuoco all’apertura e ripristino alla chiusura, corpo che non scorre, Escape |
| il pulsante «Filtri»                | `app-table-filters-button`                                     | scrivania: accende i controlli nelle intestazioni e spegnendo azzera (nello store); sotto `lg`: apre il pannello; il conteggio dominio + colonne; icona sola sotto `lg` col nome nell’`aria-label`                                                              |
| il pulsante «Seleziona»             | `app-table-selection-toggle`                                   | la modalità selezione della vista a card, solo sotto `lg` — estratto per A6 (§5.7), dove senza non si sarebbe potuto selezionare niente sul telefono                                                                                                            |

⭐ **Sono due componenti e non uno, e la ragione è la barra**: su scrivania il pulsante sta a
destra coi comandi di vista e la riga dei filtri sta al centro accanto a Ricerca e Periodo — due
punti diversi dello stesso genitore, e un componente solo non può stare in due posti. Li tiene
insieme lo stesso `open` a due vie, che il telaio e le pagine dichiarano una volta.

⚠️ **L’host del pannello è `display: contents`**, così la riga partecipa alla barra del telaio
come figlio diretto e i token della barra densa le arrivano per eredità; su scrivania, senza
filtri di dominio proiettati, la riga non esiste (`:not(:has(*))` — con `:empty` i commenti che
Angular lascia per `@if` la renderebbero sempre piena).

**Chi lo ospita**: il telaio (13 elenchi, invariati: 25 prove del telaio verdi con i nomi delle
classi aggiornati), l’import prodotti (due tabelle, due `open`), l’import giacenze, le non
allineate di Allinea, il Dettaglio inventario, i Codici IVA. **Provato sul telefono** su import
prodotti (filtro «Dettaglio» → 1 card, conteggio «(1)» sul pulsante, «Azzera filtri» → 2), su
Allinea (filtro «Motivo» → 1 card) e sui Codici IVA (§5.7). ⚠️ La prima esecuzione ha fallito
sul Dettaglio inventario per gli `imports` del componente dimenticati: `check:types` non vede i
template — è la trappola già scritta in `regole-qualita` — e a trovarla è stata la build e2e.

### 5.6 — D2 · Utenti: MASCHERA (classe B), con i pezzi condivisi compatibili (11/09/2026) ✅

**Perché è una maschera e non un elenco**: ogni riga si compila sul posto e si salva da sé —
casella Attivo, tendina Ruolo, tendine Sedi e Predefinita, la riga «Personalizza» che apre
l’editor dei permessi a tutta larghezza (`colspan`), «Elimina» per riga con conferma. Non c'è
niente da ordinare, filtrare o sommare, e il motore degli elenchi non ha righe espandibili né
celle editabili: portarcela avrebbe richiesto una capacità nuova per una pagina sola, o un
pannello laterale che il proprietario ha escluso.

**Che cosa riusa, ora**: la grammatica condivisa della tabella (`data-table-desktop`, la stessa
delle righe documento) al posto di una `<table>` vestita a mano; il ripiego a card sotto `lg`
(`data-table-mobile-cards`) con l’etichetta di colonna per cella (`data-label` su ogni `td`) al
posto di uno scorrimento orizzontale sotto `md`; `app-button` per «Personalizza» (ghost, con
`ariaExpanded` — input aggiunto al pulsante condiviso, perché un `[attr.aria-expanded]`
sull’host finiva su un elemento senza ruolo) e per «Elimina» (danger, `loading` durante
l’eliminazione) al posto di due `<button>` scritti da zero; `app-select-menu` e
`app-inline-spinner` c’erano già. **Tolte** ottanta righe di foglio.

**Conservato e provato** (`e2e/utenti-maschera.spec.ts`, 2 prove + le 9 di componente): la riga
del titolare senza controlli, la casella Attivo, le tendine Ruolo e Sedi, «Personalizza» che
apre e chiude la riga dei permessi con `aria-expanded`, «Elimina utente Anna Rossi» acceso; sul
telefono le sette etichette per cella e la tendina Ruolo che si apre. ⚠️ Sulla card le due
tendine delle sedi cadevano una sotto l’etichetta e una nel valore: stanno entrambe nella
colonna del valore (`grid-column: 2`).

### 5.7 — D3 · A6 · Codici IVA: sezioni comprimibili nel motore, filtri condivisi (11/09/2026) ✅

**Nel motore, opzionale**: `DataTableSection.collapsible`. Il titolo della sezione diventa un
pulsante con la freccia e `aria-expanded`; chiusa non rende le righe (il piede, se c’è, resta);
lo stato vive nel motore per id di sezione. **Nasce spento**: i documenti raggruppati per giorno
non cambiano — `data-table-sezioni.component.spec.ts` lo tiene fermo (3 prove: aperta per
default, chiusa/riaperta senza toccare le altre, nessun pulsante dove non è dichiarata).

**La pagina**: vista `vat_codes` (40 id allineati), una sezione comprimibile per Natura con il
conteggio nel titolo («Imponibile (3)»), l’ordine del catalogo dentro la sezione finché non se ne
sceglie uno dalle intestazioni; i tre `<select>` nativi → filtri di colonna a valori **Natura**,
**Ambito**, **Stato** con lo stesso significato (e in più la ricerca nel pannello e il verso
Includi/Escludi); la Ricerca resta in barra e si somma. ⚠️ **«Natura» è anche una colonna**: il
filtro vive nella colonna, e senza colonna non avrebbe dove stare; chi la trova ridondante col
titolo della sezione la spegne da Colonne, e con lei il filtro.

⭐ **«Duplica» sta nella barra comandi, sulla selezione** — la stessa forma di Clienti e
Fornitori (`comando('duplicate')` dal catalogo, `requires: 'one'`, `app-list-actions-bar`).
Era un pulsante per riga: il comando di riga del motore (`appRowActions`) è dichiarato
transitorio e nessun altro elenco lo usa più; provato come icona nella cella dei comandi, portava
la riga a 29px. Sul telefono la selezione si accende con «Seleziona» (§5.5), e da lì la barra.
**Nuovo Codice IVA** resta in testata: è la forma delle pagine delle Impostazioni.

⚠️ **Riga totali col solo conteggio** («N voci», segue filtro e selezione): aliquote di codici
diversi non si sommano, ma la riga non sparisce mai.

**Prove**: 4 di componente (con un doppio del servizio preferenze colonne, come sugli altri);
`e2e/codici-iva.spec.ts` 4 prove: sezioni che si chiudono e riaprono, ordinamento numerico
sull’aliquota (4 · 10 · 22, dove il testo darebbe 10 · 22 · 4), i tre filtri, spegnere «Filtri»
che azzera, ricerca + filtro, clic di riga → «Modifica Codice IVA», Duplica spento senza
selezione e acceso con una riga → «Duplica Codice IVA», riga ≤ 26px; sul telefono card con
«Aliquota 22%», sezioni chiudibili, filtri nel pannello, «Seleziona» → Duplica. Un’eccezione
motivata in `check:classi-orfane` per il blocco nudo `vat-codes` (vestito dai mixin, come
`supplier-form`).

### 5.8 — A7 · Sedi (11/09/2026) ✅

Erano **quattro** `<table>` a mano con la stessa griglia: ora un `app-data-table` per gruppo
(Sedi Shopify · disattivate · locale) o uno solo quando il profilo non distingue. Colonne dal
catalogo (`code`, `status`), Shopify e VestiFlow secondo il profilo del tenant, stati come testo
colorato, ordinamento, card con la sede in testa e lo stato come ancora. **Senza vista di colonne,
filtri e totali, di proposito**: al più una manciata di righe, e le colonne le decide il profilo
— un selettore e un pulsante Filtri su tre righe sarebbero comandi senza significato. **I gruppi
restano tre tabelle e non tre sezioni**: ogni gruppo porta una spiegazione che una sezione del
motore non ha dove mettere. Prove: `e2e/sedi.spec.ts` (2), con le fixture delle Impostazioni
estratte in `helpers/impostazioni-fixtures.ts` e riusate da Allinea.

### 5.9 — A8 · A9 · Dashboard: sotto scorta e ultime vendite (11/09/2026) ✅

Due anteprime sul motore: colonne dal catalogo (`sku`, `location`, `available`, `minThreshold`;
`customerName`, `status`, `documentDate`, `total`), ordinamento sul **valore** (quantità,
importo in unità minori, data ISO — non sul testo formattato), il clic di riga che apre la
vendita, card con «Soglia 5 · Disp. 0» e il totale come cifra. Niente vista di colonne, filtri o
totali: sono anteprime — cinque righe e «Vai al magazzino». Prove: `e2e/dashboard-anteprime.spec.ts` (2).

### 5.10 — A10 · Report per sede (11/09/2026) ✅

Sul motore, con la **riga totali**: giacenza, disponibile e valore sono grandezze additive e la
somma delle sedi è il dato dell’azienda intera — l’unico posto dove si legge. Il denaro si somma
in unità minori e si formatta all’uscita (`formatMoney`), le righe sotto scorta con il badge
piatto del catalogo. Senza vista di colonne né filtri: una riga per sede. Prove:
`e2e/report-tabelle.spec.ts` (2, con A12).

### 5.11 — A11 · Ricerca giacenza: classificata C, con la grammatica condivisa ↩

La griglia **taglie × sedi** non è un elenco: le colonne sono le sedi, e cambiano con la
ricerca — un catalogo di colonne non può descriverle. Resta una `<table>`, ma veste con i mixin
condivisi (`data-table-desktop` + `summary-grammar`): intestazioni, altezza di riga, taglio a
colonna e divisori sono quelli di ogni elenco. ⚠️ Due difetti muti trovati applicandola: la
cella della taglia era un `th` e prendeva lo stile dell’intestazione (ora `td`); l’allineamento
numerico si perdeva perché `tbody td` della grammatica pesa più di una classe sola — nominato
per intero (`.ricerca__griglia tbody td.ricerca__num`). Prove: `e2e/ricerca-giacenza.spec.ts` (2).

### 5.12 — A12 · Analisi (11/09/2026) ✅

Due tabelle sul motore: **fatturato per canale** con la riga totali (la somma dei canali è il
fatturato del periodo) e **top prodotti** senza (la somma dei primi dieci non dice niente). Il
vecchio `<table>` dei prodotti era rimasto accanto al nuovo dopo la prima sostituzione: tolto a
mano, ed è la ragione per cui la prova conta le tabelle. Prove: `e2e/report-tabelle.spec.ts`.

### 5.13 — A13 · A14 · Amministrazione (11/09/2026) — B e ✅

**A13, utenti del tenant: maschera (B)**, come Utenti in D2 — ruolo, sedi e permessi si
modificano sulla riga. Grammatica condivisa (`data-table-desktop` + card con etichetta per
cella), `app-button` per «Vedi permessi»; la cella delle sedi resta una cella e impila i figli
(`> * { display: block }`), perché `display: flex` sulla cella perde contro la grammatica.

**A14, elenco aziende: sul motore**, con vista di colonne (`admin_tenants`, aggiunta a
frontend e API), filtri di colonna (Profilo a valori), ordinamento sulla data ISO, selezione e
barra comandi con **«Apri gestionale»** (`requires: 'one'`) al posto del pulsante per riga. La
fixture con `channelProfile: 'manual'` — valore che non esiste — lasciava il pulsante Filtri
senza nome: corretta in `'gestionale'`. ⭐ Per guardare queste pagine senza API è stato aggiunto
l’**amministratore di piattaforma all’auth finta** (`admin@vestiflow.test`). Prove:
`e2e/admin-tabelle.spec.ts` (3).

### 5.14 — A15 · Fornitori dell’articolo (11/09/2026) ✅

Piccolo elenco di consultazione nella scheda, sul motore: colonne dal catalogo (Fornitore, SKU),
ordinamento sul **valore** del prezzo (l’assenza vale −∞ e apre il crescente), card con il
prezzo come cifra. Senza vista di colonne, filtri e totali: un prezzo per fornitore non si somma
e su cinque righe un filtro non filtra niente. Prove: `e2e/scheda-fornitori.spec.ts` (2).

### 5.15 — A16 · Dettaglio vendita online (11/09/2026) ✅

Due tabelle, due nature. **Le righe della vendita sono una griglia documentale** (classe C):
già sui mixin condivisi `data-table-desktop` + `data-table-mobile-cards`, non si toccano. **I
movimenti collegati sono un elenco di registrazioni**: sul motore, con Tipo, Quantità, **Sede**
(non più «Location»: la parola è quella del catalogo) e Data, ordinamento su quantità e data
ISO, card con «Qtà 2». Sulla stessa pagina convivono quindi le due grammatiche — è voluto: una
riga di documento e una registrazione di magazzino non sono la stessa cosa. Prove:
`e2e/vendita-online-movimenti.spec.ts` (2).

### 5.16 — A17 · A18 · Reso al banco e carrello della Cassa: maschere (B) ↩

In entrambe la quantità **si compila sulla riga**: non sono elenchi. Vestono ora con la
grammatica condivisa delle maschere (`data-table-desktop` + card con etichetta per cella), come
Utenti. ⛔ Avevano **venti righe identiche** di intestazione e celle scritte a mano, una copia per
file; il Reso non aveva **nessun ripiego sotto `lg`**: cinque colonne su un telefono uscivano
dallo schermo. Sulla card il campo «Rendi» torna a 44px, come già `.cassa__qty`.

⚠️ **Trovato applicandola**: `tbody td` della grammatica pesa **(4,2)** con i tre attributi di
incapsulamento e batte anche `.cassa__lines .cassa__num` (4,0) — titolo e valori numerici
tornavano a sinistra senza un errore. La forma che regge è `tbody td.classe`, e la prova la
asserisce (`numeriADestra`). Prove: `e2e/cassa-maschere.spec.ts` (3).

### 5.17 — A19 · Dettagli di Cassa (11/09/2026) ✅

Quattro elenchi di registrazioni sul motore, tutti resi prima da `<ul>` vestiti a mano: i
**movimenti di magazzino** dell’operazione (era una riga di testo «sale · SKU · 2 pezzi ·
data»), il **cassetto** della sessione, le **operazioni della sessione** — il clic di riga apre
l’operazione, come faceva il link — e i **cambi di registratore**. Nessuna riga totali: un
versamento e un prelievo non si sommano, e i totali della sessione stanno già nella quadratura.
**Le quote dell’incasso restano un riepilogo** (C): sono la scomposizione di un pagamento, non
un elenco. Prove: `e2e/cassa-dettagli-elenchi.spec.ts` (3).

### 5.18 — A20 · Giacenze: gli ordini che impegnano (11/09/2026) ✅

Nuovo componente dumb `app-stock-reservations-table` sul motore, nel pannello «Quantità
impegnata»: Origine, Ordine, Quantità, Sede dal catalogo, ordinamento, e la **riga totali sulla
quantità** — la somma delle righe deve tornare con l’Impegnata dichiarata in testa al pannello,
ed è così che la si verifica. ⭐ **Sul telefono il pannello non si apriva**: la card delle Giacenze
mostrava «Imp. 3» come testo, e il pulsante stava nella cella nascosta. Ora la card ha lo stesso
pulsante della cella («la stessa funzione, le due vesti»). Prove: `e2e/elenchi-secondari.spec.ts`
(3, con A22) e spec di componente (2).

### 5.19 — A22 · Ordine fornitore, arrivo merce collegato (11/09/2026) ✅

Era un `<ul>` di link con stile proprio: è un **fatto del dettaglio**, reso da
`app-detail-facts` con «Apri documento» — la stessa forma del DDT collegato nel Dettaglio
vendita online. Prove: `e2e/elenchi-secondari.spec.ts`.

### 5.20 — A21 · A23 · A24: classificate C, senza modifiche ↩

| #   | Schermata             | Perché non è un elenco                                                                                                                                 |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A21 | Scheda prodotto       | listini, attributi di categoria, collezioni e immagini sono **coppie etichetta·valore** e una galleria dentro un `<dl>`: niente da ordinare o filtrare |
| A23 | Modalità di pagamento | **gestore di vocabolario** con rinomina sulla riga, come categorie e unità di misura (§2.C): usa già `app-button` e i campi condivisi                  |
| A24 | Licenze sedi          | **selettore**: caselle da spuntare entro un contatore, come il selettore prodotti (§2.C)                                                               |

⚠️ Su A21 resta una nota fuori da questo blocco: la scheda scrive a mano il proprio `<dl>` di
fatti (`product-detail__fact`, 27 occorrenze) invece di `app-detail-facts`. Non è un elenco e
non è una tabella: si segnala, non si corregge qui.

### 5.21 — A25 · Ordini cliente sul telefono (11/09/2026) ✅ — non censita

⛔ **Il censimento del 10/09 non l’aveva vista**, perché la tabella è sul motore. Ma sotto `lg`
`sales-order-table` spegneva il motore (`app-data-table { display: none }`) e rendeva una
**seconda vista scritta a mano** (`<ul class="sales-cards">`): l’elenco sul telefono stava fuori
dal motore — senza «Seleziona», senza pannello filtri, senza riga totali ancorata, senza finestra
di rendering — e il template `appRowCard` scritto il 30/08 **non si vedeva mai**. Ora la card
del motore porta tutto ciò che quella a mano mostrava (origine, sede, i tre stati, numero e
totale); la `<ul>` e i suoi stili sono tolti. Prove: `e2e/ordini-cliente-telefono.spec.ts` (2).

### 5.22 — A26 · Scheda articolo, giacenze per variante (11/09/2026) ✅ — non censita

Il tab Magazzino della scheda aveva una `<table>` a mano — un elenco di consultazione senza
ripiego sotto `lg`. Nuovo componente dumb `app-product-stock-table` (`domain/products`) sul
motore: **Giacenza, Impegnata, Disponibile** dal catalogo (era «Impegnato»: la parola è una),
ordinamento sul valore, riga totali sulle tre quantità. Spec di componente (2).

### 5.23 — Le tre maschere B senza riga e testata condivise: controllate ↩

Classificarle non significa averle sistemate: ecco che cosa condividono e che cosa no.

| Maschera                                   | Grammatica tabella                                         | Sotto `lg`                                                             | Riga e testata condivise                                                        |
| ------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Registrazione fattura (`purchase-invoice`) | ⛔ propria (`pi-form__table`)                              | tabella a scorrimento, **deroga dichiarata** nel foglio (nessuna card) | testata, totali, azioni e controparte sì; celle di riga no (una sola condivisa) |
| Corrispettivo manuale (`manual-receipt`)   | ✅ `doc-form__table` (foglio globale)                      | ✅ card `doc-form__cards` con i componenti `document-line-card-*`      | celle di riga no                                                                |
| Movimento di magazzino (`movement-form`)   | ✅ `doc-form__table` (con `table-layout: auto` dichiarato) | tabella a scorrimento, **deroga dichiarata** nel foglio                | testata e celle di riga no                                                      |

⛔ **Nessuna modifica qui, e la ragione è precisa**: la grammatica propria della Registrazione
fattura non si può sostituire con `doc-form__table` senza portarsi dietro la vista a card che
quella maschera **ha deciso di non avere** — le sue celle sono input con bordo proprio, in
`doc-form__table` sono input senza bordo con il fuoco sulla cella. È lo stesso lavoro delle
celle di riga condivise, che appartiene alla specifica delle righe documento (`docs/11`), non a
questo blocco. Le tre restano in `ELENCO_MOTIVATO` con questa ragione.

### 5.24 — La guardia (11/09/2026) ✅

Vedi §4. È il pezzo che rende il censimento **ripetibile**: la prossima `<table>` scritta a mano
o il prossimo `<ul>` che rende righe di dati fanno fallire il lint finché qualcuno non dichiara
classe e perché — o non lo porta sul motore.

---

## 6. Le tre decisioni del gruppo 2 — prese dal proprietario l’11/09/2026

| #   | Dove                                    | Decisione                                                                                                                                                                                                                                                                       | Come è stata applicata                                                                                                                         |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | tabelle sul motore **fuori dal telaio** | «estrai e riusa il pannello filtri già esistente. I filtri devono funzionare anche sul telefono, comprese le tabelle fuori dal telaio. Non nascondere la funzione»                                                                                                              | §5.5 — `app-table-filters-panel` + `app-table-filters-button`, estratti dal telaio e ospitati da A1, A2, A3, Dettaglio inventario e Codici IVA |
| D2  | A5 · Utenti                             | «conserva l’editing e la riga Personalizza. Se è una maschera, classificala come tale motivandolo; riusa contenitori, campi e controlli condivisi compatibili. Niente pannello laterale, nessuna funzione persa»                                                                | §5.6 — classificata **maschera (B)**; grammatica condivisa della tabella, card sotto `lg`, `app-button` al posto dei pulsanti a mano           |
| D3  | A6 · Codici IVA                         | «conserva il raggruppamento per Natura e le sezioni comprimibili. Verifica se esiste una capacità condivisa; altrimenti aggiungila al motore in modo opzionale, senza cambiare le altre tabelle. Sostituisci i filtri locali con quelli condivisi, mantenendone il significato» | §5.7 — non esisteva: `collapsible` sulle sezioni del motore, spento altrove; i tre `<select>` → filtri di colonna Natura/Ambito/Stato          |

⭐ **E la verifica dei componenti comuni su schermate NON toccate** (richiesta insieme alle
decisioni): §5.4-bis.

---

## 7. Il riepilogo completo — ogni schermata, corretta o esclusa con la ragione

| #   | Schermata                                                                                        | Esito           | Ragione precisa                                                                         |
| --- | ------------------------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------- |
| A1  | Import prodotti                                                                                  | ✅ motore       | §5.1                                                                                    |
| A2  | Import giacenze                                                                                  | ✅ motore       | §5.2, con totali                                                                        |
| A3  | Allinea — non allineate                                                                          | ✅ motore       | §5.3, filtri su sede e motivo                                                           |
| A4  | Allinea — permessi Shopify                                                                       | ↩ esclusa (C)   | matrice di consultazione a colonne fisse, non un elenco — §5.4                          |
| A5  | Utenti                                                                                           | ↩ maschera (B)  | si modifica sulla riga; grammatica e controlli condivisi — §5.6                         |
| A6  | Codici IVA                                                                                       | ✅ motore       | §5.7, sezioni comprimibili e filtri condivisi                                           |
| A7  | Sedi                                                                                             | ✅ motore       | §5.8                                                                                    |
| A8  | Dashboard — sotto scorta                                                                         | ✅ motore       | §5.9                                                                                    |
| A9  | Dashboard — ultime vendite                                                                       | ✅ motore       | §5.9                                                                                    |
| A10 | Report per sede                                                                                  | ✅ motore       | §5.10, con totali                                                                       |
| A11 | Ricerca giacenza                                                                                 | ↩ esclusa (C)   | matrice taglie × sedi: le colonne cambiano con la ricerca; grammatica condivisa — §5.11 |
| A12 | Analisi                                                                                          | ✅ motore       | §5.12                                                                                   |
| A13 | Admin — utenti del tenant                                                                        | ↩ maschera (B)  | si modifica sulla riga; grammatica condivisa — §5.13                                    |
| A14 | Admin — elenco aziende                                                                           | ✅ motore       | §5.13, con selezione e barra                                                            |
| A15 | Fornitori dell’articolo                                                                          | ✅ motore       | §5.14                                                                                   |
| A16 | Vendita online — righe                                                                           | ↩ esclusa (C)   | griglia documentale, già sui mixin condivisi — §5.15                                    |
| A16 | Vendita online — movimenti                                                                       | ✅ motore       | §5.15                                                                                   |
| A17 | Reso al banco — righe                                                                            | ↩ maschera (B)  | la quantità si compila; grammatica condivisa — §5.16                                    |
| A18 | Cassa — carrello                                                                                 | ↩ maschera (B)  | idem — §5.16                                                                            |
| A19 | Cassa — movimenti, cassetto, operazioni, cambi                                                   | ✅ motore       | §5.17                                                                                   |
| A19 | Cassa — quote dell’incasso                                                                       | ↩ esclusa (C)   | scomposizione di un pagamento, non un elenco — §5.17                                    |
| A20 | Giacenze — ordini che impegnano                                                                  | ✅ motore       | §5.18                                                                                   |
| A21 | Scheda prodotto — listini, metafield, immagini                                                   | ↩ esclusa (C)   | coppie di dettaglio e galleria — §5.20                                                  |
| A22 | Ordine fornitore — arrivo merce collegato                                                        | ✅ detail-facts | fatto del dettaglio, componente condiviso — §5.19                                       |
| A23 | Modalità di pagamento                                                                            | ↩ esclusa (C)   | gestore di vocabolario — §5.20                                                          |
| A24 | Licenze sedi                                                                                     | ↩ esclusa (C)   | selettore a spunta — §5.20                                                              |
| A25 | Ordini cliente — telefono                                                                        | ✅ motore       | §5.21 (non censita)                                                                     |
| A26 | Scheda articolo — giacenze per variante                                                          | ✅ motore       | §5.22 (non censita)                                                                     |
| B   | Registrazione fattura, Corrispettivo manuale, Movimento                                          | ↩ maschere (B)  | controllate nelle parti condivisibili; il resto è `docs/11` — §5.23                     |
| B   | Griglie varianti e opzioni, matrice permessi                                                     | ↩ maschere (B)  | si compilano; dichiarate nella guardia                                                  |
| C   | Navigazione, tendine, dialoghi, selettori, gestori di vocabolari, allegati, immagini, cronologie | ↩ escluse (C)   | non elenchi; ognuna con il perché in `ELENCO_MOTIVATO`                                  |

**Verifica**: ogni riga ✅ ha una prova e2e isolata o uno spec di componente (§5); la guardia di
§4 tiene ferma la tabella. Nessun commit, push o merge: tutto nell’albero di lavoro.

---

## 8. Una domanda arrivata a metà lavoro: i comandi Shopify nelle Impostazioni

_Il proprietario, l’11/09: «quello che riguarda Shopify, soprattutto impostazioni e sincro,
va tutto nelle Impostazioni, nelle sezioni apposite ben divise? Si parla solo dei tasti
funzionali che riguardano la sincro tra VestiFlow e Shopify: ordini e dati restano come sono»._

Misurato, senza modificare niente — è un blocco a sé, da decidere.

| Comando                          | Dove sta oggi                                          | Chi lo vede in barra                            |
| -------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Importa catalogo                 | barra **Prodotti** + Impostazioni → Shopify            | `catalog.import_export`                         |
| Riallinea su Shopify (giacenze)  | barra **Giacenze** + Impostazioni → Shopify            | `inventory.import_export`, o accesso pieno      |
| Sincronizza da Shopify (clienti) | barra **Clienti** + Impostazioni → Shopify             | permesso sync clienti/ordini + negozio connesso |
| Sincronizza (ordini)             | barra **Ordini cliente**, vista Shopify + Impostazioni | idem                                            |
| Sincronizza location, Allinea    | solo Impostazioni → Shopify                            | —                                               |

⚠️ **I doppioni sono QUATTRO** (qui c’era scritto due: mancavano Clienti e Ordini cliente). E il
punto che decide è il **cancello**: il pannello Impostazioni → Shopify si monta solo con
**accesso pieno** (`canManageShopifyConnection` = `hasFullTenantAccess`), mentre i pulsanti di
barra rispondono ciascuno al **permesso della propria operazione**. Un manager con
`inventory.import_export` oggi riallinea dalle Giacenze; spostato il pulsante nelle
Impostazioni «senza cambiare i permessi», **lo perde**, perché la sezione non la vede.

### La proposta, e ciò che va deciso prima

1. ✅ **Una casa sola**, Impostazioni → Shopify, con le sezioni per **direzione** — «Importa
   da Shopify» (catalogo, clienti, ordini) e «Pubblica su Shopify» (giacenze), più connessione
   e sedi. Chiude anche un difetto registrato: i quattro pulsanti si chiamano tutti
   `shopify-sync` ma due tirano dentro e uno spinge fuori, e in barra la direzione non si legge
   (`docs/01` §Livello 5; nota in `list-action-catalog`).
2. ✅ Via i quattro pulsanti dalle barre. **Restano dove sono i dati**: colonna e stato Shopify
   negli elenchi, campi Shopify della scheda articolo, elenco Ordini Shopify, le «non allineate».
3. ⏸ **Da decidere: la sezione si apre a chi ha il permesso del singolo comando**, non solo a
   chi gestisce la connessione — connessione e sedi restano del titolare, i comandi di sincro
   ai ruoli che li premono oggi. Senza questa decisione il trasloco cambia i permessi da solo.
4. ⏸ **Gli esiti**: Prodotti e Giacenze mostrano oggi la banda con l’esito della
   sincronizzazione avviata da lì (`shopify-sync-feedback`). Senza il pulsante, l’esito vive in
   Impostazioni: va bene, ma è una scelta da dichiarare.
5. ⏸ Ordini cliente → vista Shopify: «Sincronizza» è un comando di sincro e per la regola data
   segue gli altri; la risposta della chat di progettazione non lo nominava.

### ✅ Deciso e applicato l’11/09/2026

_Il proprietario: «una sola sede per i comandi generali: Impostazioni → Shopify. Sposta tutti
e quattro i comandi, compreso «Sincronizza» nella vista Shopify degli Ordini cliente. Preserva
gli accessi effettivi: chi possiede il permesso di un comando deve poter raggiungere la
sezione ed eseguire quel comando; questo non gli concede accesso alle altre impostazioni;
connessione, credenziali e sedi mantengono i permessi amministrativi; restano attivi i
controlli API. Gli esiti si mostrano nella stessa sezione. Prima verifica la raggiungibilità
per titolare, utente con un solo permesso di sincronizzazione, utente senza quei permessi e
tenant senza modulo Shopify»._

| Che cosa                   | Come                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La pagina**              | `/app/settings/shopify` (`ShopifySettingsPageComponent`) ospita il pannello; nella radice delle Impostazioni resta una **card «Shopify → Apri Shopify»**                                                                                                                                                                                                                                  |
| **La guardia della rotta** | `shopifySettingsGuard` → `canReachShopifySettings`: profilo Shopify **e** (gestisce la connessione **o** un permesso di comando: `catalog.import_export`, `inventory.import_export`, `reports.export`). Non chiede `section.settings`, che continua a chiudere la radice e le altre pagine                                                                                                |
| **Il menu**                | «Impostazioni» in barra laterale anche a chi ha solo un permesso di comando: la voce porta **direttamente** a `/app/settings/shopify`. Briciole «Impostazioni › Shopify», voce nella ricerca globale                                                                                                                                                                                      |
| **Le quattro sezioni**     | Prima connessione (form, solo titolare) · Configurazione (stato, accessi, sedi + «Sincronizza location», connessione e negozio) · **Sincronizzazione** (Catalogo · Giacenze · Clienti · Ordini, ciascuno con la direzione) · **Stato ed esiti** (esiti, errori, avanzamento Allinea e non allineate, aggiornamenti automatici)                                                            |
| **La direzione**           | un’etichetta accanto al titolo del blocco, non un comando: Catalogo «Shopify ⇄ VestiFlow, campo per campo» con UN solo comando di lettura (`docs/24` §9.2); Giacenze «VestiFlow → Shopify»; Clienti e Ordini «Shopify → VestiFlow»                                                                                                                                                        |
| **I permessi**             | Catalogo e Giacenze con il predicato che governava il pulsante nella barra (`canSyncCatalogFromShopify`, `canSyncInventoryFromShopify`); Clienti e Ordini con **le combinazioni dell’API** (`canSyncCustomersFromShopify`, `canSyncOrdersFromShopify`, sotto); connessione, sedi e aggiornamenti automatici restano a `canManageShopifyConnection`; l’API verifica di nuovo ogni chiamata |
| **Chi non è titolare**     | non può leggere la connessione (l’API risponde 403): non la si chiede e **non si finge «non connesso»** — vede i suoi comandi e i loro esiti; se il negozio non è collegato lo dice l’API in Stato ed esiti                                                                                                                                                                               |
| **Le barre**               | Prodotti, Giacenze, Clienti e Ordini cliente (vista Shopify) non portano più il comando né la banda d’esito; **restano** colonna e stato Shopify, origine dei clienti, corrispettivi Shopify, aggiornamento silenzioso degli elenchi (`ShopifySyncWatchService`)                                                                                                                          |
| **Codice tolto**           | `app-shopify-sync-feedback` (nessun consumatore: gli esiti passano dal banner condiviso), i quattro `shopify-sync` con lo stesso id (`docs/01` §Livello 5 chiuso), lo stato Sedi duplicato nella pagina Impostazioni (estratto in `location-setup-status.util`)                                                                                                                           |

### ✅ Clienti e ordini: il frontend segue le combinazioni dell’API, nessun permesso nuovo

_Deciso dal proprietario l’11/09/2026, dopo il rapporto sul collegamento esatto: «allineare il
frontend alle combinazioni già richieste dall’API, senza inventare nuovi permessi adesso. Chi
le possiede vede ed esegue il comando; configurazione e connessione restano amministrative»._

**Il collegamento esatto, misurato nel codice — e ora specchiato:**

| Livello                     | Clienti (`POST /shopify/sync/customers`)                                                                           | Ordini (`POST /shopify/sync/orders`)                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **API** (il confine vero)   | `reports.export` **E** `customers.manage` (`SHOPIFY_CUSTOMERS_SYNC_GROUPS`)                                        | `reports.export` **E** (`section.sales` o `section.reports`) **E** `doc.online_sale.view` (`SHOPIFY_ORDERS_SYNC_GROUPS`) |
| **Predicato del frontend**  | `canSyncCustomersFromShopify` = accesso pieno **o** `SHOPIFY_CUSTOMERS_SYNC_GROUPS`, gli stessi gruppi             | `canSyncOrdersFromShopify` = accesso pieno **o** `SHOPIFY_ORDERS_SYNC_GROUPS`, gli stessi gruppi                         |
| **Accesso effettivo prima** | il pulsante compariva solo se `GET /shopify/connection` rispondeva, ed è **owner-only**: di fatto il solo titolare | idem                                                                                                                     |
| **Accesso effettivo ora**   | chi ha «Esportare dati» **e** «Gestire clienti» raggiunge la pagina e vede il solo «Importa clienti»               | chi ha «Esportare dati» **e** la consultazione delle vendite online vede il solo «Importa ordini»                        |

⛔ **Qui c’era `canSyncShopifyOperationalData` = il solo `reports.export`, per clienti E ordini
insieme**: chiedeva MENO dell’API, e a un manager con il solo «Esportare dati» avrebbe mostrato
due comandi rifiutati con 403. Non si vedeva perché i pulsanti comparivano solo a chi leggeva
la connessione — owner-only — cioè un 403 assorbito faceva da permesso. Nessun permesso
specifico «sincronizza clienti/ordini da Shopify» esiste, e **non se n’è inventato uno**: si
usano i gruppi dell’API così come sono, in due costanti gemelle del frontend
(`SHOPIFY_CUSTOMERS_SYNC_GROUPS`, `SHOPIFY_ORDERS_SYNC_GROUPS`) valutate con
`hasAllTenantPermissionGroups` — lo stesso «almeno uno da OGNI gruppo» della guardia di rotta,
che ora lo chiama invece di tenerne una copia.

⚠️ **`reports.export` da solo non apre la pagina**: non è il permesso di nessun comando, e
aprirla gli mostrerebbe una sezione Sincronizzazione vuota. La raggiungono il titolare, chi ha
`catalog.import_export`, chi ha `inventory.import_export`, e chi ha una delle due combinazioni.

⚠️ **Due predicati, non uno**: l’anagrafica e gli ordini sono due scritture diverse, e un
manager può avere l’una senza l’altra — il pannello mostra il blocco Clienti e non quello
Ordini, o viceversa. Il wrapper deprecato `shopify-page-sync.util` (nessun consumatore dopo
la rimozione dei pulsanti dalle barre) è stato tolto con la sua spec.

**Verifica** — spec del predicato (i quattro casi di raggiungibilità, più ogni gruppo delle due
combinazioni tolto uno alla volta — falsificata: col solo `reports.export` nel gruppo clienti
due prove arrossano), spec del pannello (titolare / solo giacenze / combinazione clienti che
vede ed esegue «Importa clienti» e non «Importa ordini» / solo `reports.export` che non vede
nessuno dei due / esito in Stato ed esiti), e `e2e/impostazioni-shopify.spec.ts` (6): titolare
dalla card alla pagina con le sezioni e tutti i comandi; utente con il solo
`inventory.import_export` → voce di menu → pagina con Riallinea e Allinea e nient’altro, esito
in Stato ed esiti, `/app/settings` rimanda alla dashboard; **utente con «Esportare dati» e
«Gestire clienti» → voce di menu → il solo «Importa clienti», che parte davvero
(`POST /shopify/sync/customers`) con l’esito in Stato ed esiti**; manager senza permessi →
nessuna voce, la pagina rimanda; titolare di un tenant senza Shopify → nessuna card, la pagina
rimanda; le barre di Giacenze e Ordini Shopify senza i comandi. Tre utenti aggiunti all’auth
finta per questo (`sync@`, `clienti@`, `gestionale@`). Le prove sull’API vera (`shopify.spec`,
`permissions*.spec`) sono state riportate sulla nuova rotta ma **non eseguite qui**: l’API
condivisa non si riavvia.
