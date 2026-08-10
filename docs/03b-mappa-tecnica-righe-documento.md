# Mappa tecnica — righe documento

> **Cos'è.** Lo stato del codice verificato leggendo i file, a supporto di `03-specifica-unificazione-righe-documento.md`. Qui non ci sono decisioni di prodotto: quelle stanno nella specifica e valgono a prescindere da questo documento.
>
> **Perché è separato.** La specifica dice _cosa vogliamo_, questa mappa dice _cosa comporta_. Tenendoli insieme, un'affermazione tecnica ricostruita a memoria acquisisce lo stesso peso di una verificata.
>
> **Riferimenti: mai per numero di riga.** Sempre per **nome di simbolo** (metodo, classe, file). Un numero di riga punta a un bersaglio che si sposta a ogni modifica, e sbaglia in silenzio.
>
> **Misure: sì, ma datate — una data per misura.** Un numero di riga è un puntatore, una misura è una **prova**: è ciò su cui poggia una decisione, e senza di essa la decisione si riapre. Le misure non fingono di essere di oggi: `(mis. 08/2026)` dice cos'era il codice **quando la decisione è stata presa**. Prima di agire su una misura, riverificala.
>
> Le misure **non invecchiano tutte insieme** — per questo la data sta accanto a ciascuna e non solo in testa. Il conteggio delle istanze di `app-select-menu` si muove a ogni sprint; la sovrapposizione fra le due celle gemelle solo se qualcuno le tocca. Quando si riverifica **una** misura, si aggiorna **solo la sua** data. Quali si muovono più in fretta: §15.
>
> **Provenienza.** Letto sul ramo `feature/listini`, in sola lettura. Nessuna build, nessun test, nessuna migration eseguiti. Prima stesura: **agosto 2026**.

---

## 0. Migration implicate

Prima di tutto il resto, perché il database Supabase è unico e condiviso.

| Lavoro                                                            | Migration                                         | Natura              |
| ----------------------------------------------------------------- | ------------------------------------------------- | ------------------- |
| Unificazione della navigazione di riga                            | **nessuna**                                       | solo codice Angular |
| Ordinamento/trascinamento su Ordine fornitore                     | **sì** — colonna posizione su `SupplierOrderLine` | additiva            |
| U.M. di riga su Preventivi / DDT / Scarico manuale e Arrivi merce | **sì** — colonna su `DocumentLine`                | additiva            |
| U.M. di riga su Ordine fornitore                                  | **sì** — colonna su `SupplierOrderLine`           | additiva            |
| Elenco U.M. gestibile dall'operatore                              | **sì** — tabella nuova per-tenant, con RLS        | additiva            |
| Tutto il resto in questo documento                                | nessuna                                           | —                   |

---

## 1. Perimetro reale: nove tipi, cinque componenti

| Tipi documento                             | Componente                   | Modello riga        | Celle condivise        |
| ------------------------------------------ | ---------------------------- | ------------------- | ---------------------- |
| Ordine cliente                             | `CustomerOrderFormComponent` | `SalesOrderLine`    | sì                     |
| Preventivi, DDT vendita, Scarico manuale   | `CustomerOrderFormComponent` | **`DocumentLine`**  | sì                     |
| Arrivi merce                               | `GoodsReceiptFormComponent`  | `DocumentLine`      | sì                     |
| Ordine fornitore                           | `SupplierOrderFormComponent` | `SupplierOrderLine` | sì (solo cella codice) |
| Proforma, Fattura, Fattura accompagnatoria | `SalesDocumentFormComponent` | `DocumentLine`      | **no**                 |
| Vendita/reso in negozio                    | `StoreSaleRegisterComponent` | `DocumentLine`      | **no**                 |

**La biforcazione che sorprende.** `CustomerOrderFormComponent` serve quattro tipi tramite il route data `customerDocumentKind`, ma **salva su due tabelle diverse**: il predicato `isRegistryDocument` devia Preventivi / DDT / Scarico manuale su `saveRegistryDocument` → `DocumentLine`; solo l'Ordine cliente passa da `SalesOrderLine`.

**Vendita/reso in negozio non è una maschera documento.** Produce documenti `store_sale` / `store_return`, poi consultabili in sola lettura, ma il carrello **non è una `FormArray`**: è un carrello a segnali (`signal<readonly CartLine[]>`) con gestori `(change)` propri, e non ha **alcuna** navigazione da tastiera. Allinearla non è aggiungere le frecce: è cambiare l'architettura della riga.

Non è però un silo: riusa già da `domain/` il pannello di ricerca prodotto, le utility IVA, la scheda articolo e i servizi. Ciò che non condivide non lo condivide **perché è diverso**. Le celle di riga condivise, che sono legate al valore e non al form, resterebbero adottabili anche lì.

**Quattro maschere senza navigazione:** `sales-document-form`, `purchase-invoice-form`, `transfer-form`, `stock-operation-form` hanno righe editabili e zero gestione di tastiera o fuoco.

---

## 2. La navigazione di riga com'è oggi

### 2.1 Dove vive

Tre implementazioni parallele, in `customer-order-form.component.ts`, `supplier-order-form.component.ts`, `goods-receipt-form.component.ts`, più le celle condivise in `domain/documents/components/`.

**Sette metodi esistono in tutte e tre** — `visibleLineFocusFields`, `focusLineField`, `focusFirstLineField`, `focusNextLineField`, `focusPreviousLineField`, `advanceToNextLine`, `onLineFieldKeydown` — cioè **21 corpi di metodo, ~600 righe in tutto** _(mis. 08/2026)_. Il codice dichiara la triplicazione da sé: l'Ordine cliente porta due volte il commento «stesso pattern Arrivo merce».

### 2.2 Cosa è identico e cosa diverge

**Identico parola per parola:** `focusNextLineField`; il blocco Tab / Shift+Tab dentro `onLineFieldKeydown`, commenti compresi; e `onLineFieldKeydown` di Ordine cliente e Ordine fornitore hanno lo stesso corpo letterale — cambia solo il testo di un commento.

**Diverge:**

| Aspetto                                         | Ordine cliente     | Ordine fornitore   | Arrivo merce                           |
| ----------------------------------------------- | ------------------ | ------------------ | -------------------------------------- |
| Frecce ↑↓ negli input                           | no                 | no                 | **sì**                                 |
| `Ctrl` + ↑↓ (sposta riga)                       | no                 | no                 | **sì** → `moveLineUp` / `moveLineDown` |
| `(lineRowRetreat)` agganciato                   | **no**             | **no**             | sì                                     |
| Guardia `formReadOnly()` in `advanceToNextLine` | sì                 | **no**             | apparente (§9)                         |
| `setTimeout` prima del fuoco                    | sì, con commento   | sì, con commento   | **no**                                 |
| Gancio d'uscita riga                            | —                  | —                  | `commitLineAndSave`                    |
| Invio                                           | → cella successiva | → cella successiva | 2 casi speciali, poi cella successiva  |
| `visibleLineFocusFields`                        | ~24 righe          | ~24 righe          | **~82 righe** _(mis. 08/2026)_         |

**Invio, oggi, naviga in tutte e tre.** Arrivo merce aggiunge due casi prima di cadere nello stesso comportamento:

- su `supplierCode` → `commitSupplierSkuLookup`, cioè **registra il valore**;
- su `quantity` con articolo collegato → `advanceToNextLine`, cioè **naviga**.

### 2.3 Gli identificativi DOM

Tutte e tre fanno `getElementById` su una mappa ricostruita a ogni chiamata. I prefissi sono per maschera (`co-`, `po-`, `gr-`) ma **i suffissi sono irregolari dentro la stessa maschera**:

| campo           | Ordine cliente | Arrivo merce               | Ordine fornitore |
| --------------- | -------------- | -------------------------- | ---------------- |
| codice articolo | `co-code-`     | `gr-code-`                 | `po-code-`       |
| cod. fornitore  | —              | `gr-supplier-code-`        | `po-suppcode-`   |
| prezzo / costo  | `co-price-`    | `gr-cost-` / `gr-selling-` | `po-cost-`       |
| seriali         | `co-serials-`  | `gr-serial-` (singolare)   | —                |
| scadenza lotto  | —              | `gr-lot-date-`             | —                |

Un prefisso più indice **non basta**: serve la mappa completa.

**Quarto spazio di nomi, mai raggiunto dal TypeScript:** le card mobile dell'Ordine cliente espongono identificativi propri (`co-m-…`) che nessun `.ts` conosce. Su mobile la navigazione **non esiste**. Peggio: le due viste convivono nel DOM e la tabella è nascosta sotto il breakpoint, quindi `getElementById` trova l'elemento desktop in `display:none` e `.focus()` è un no-op silenzioso.

### 2.4 `commitLineAndSave` — il nome mente

Il commento sopra il metodo lo dichiara già: non salva, il documento si persiste solo con «Salva documento». Cosa fa davvero: collega i codici digitati alla variante di catalogo scrivendo **solo nel reactive form**. **Nessuna scrittura HTTP.**

Tre conseguenze per chi lo tocca:

1. **È raggiunto da tre gesti, non uno** — freccia giù, Invio su quantità con articolo collegato, e il fallthrough di `focusNextLineField`, cioè **Tab dall'ultimo campo**. Toglierlo dal corpo di `advanceToNextLine` lo toglie a tutti e tre.
2. **La sua asincronia è ciò che oggi fa funzionare il fuoco, per caso.** Quando non c'è nulla da collegare il percorso è già sincrono; quando c'è, il callback gira un tick dopo, a DOM pronto. Reso sincrono sempre, la freccia giù sull'ultima riga smette di dare fuoco alla riga creata. Ordine cliente e Ordine fornitore hanno il `setTimeout` esplicito con il commento che spiega esattamente questo.
3. **Restano due commenti obsoleti** su un autosave rimosso a luglio. Chi valuta la modifica crederà che si stia togliendo una persistenza.

Altri chiamanti: `commitLineIfSignificant` (bersaglio di tutti i blur di riga), `addLine`, `applyScannedVariant`, `applyUnknownBarcodeScan`.

---

## 3. Le celle di riga condivise

`document-line-code-cell` e `document-line-product-cell` sono in larghissima parte lo stesso file: **120 righe di TypeScript identiche su 137 e 178** _(mis. 08/2026)_. Identici parola per parola: `onInput`, `onFocus`, `onBlur`, `pickSuggestion`, `onSuggestionKeydown`, `focusInput`. Lo SCSS del pannello suggerimenti differisce solo per il prefisso BEM.

> È la misura che regge la decisione **«estrarre prima di scrivere la terza cella»**: senza estrazione, la cella nuova sarebbe la terza copia — dentro il lavoro che si chiama «semplificare».

**Non consegnano l'evento al form**: decidono da sole ed emettono **esiti** — `commit`, `lineAdvance`, `lineRetreat`, `lineRowAdvance`, `lineRowRetreat`, `escapePressed`, `suggestionNavigate`. È la ragione per cui il punto unico deve esporre entrate nominali, non solo un gestore di tastiera.

**Non sono legate ai reactive form**: ricevono un valore ed emettono un cambiamento. Funzionano identiche sopra una `FormArray` o sopra un carrello a segnali — è ciò che le rende adottabili anche dove il modello della riga è diverso (§1).

**Uso:** la cella codice in tutte e tre le maschere, la cella prodotto solo in Ordine cliente e Arrivo merce. **Ordine fornitore non usa la cella prodotto**: al suo posto ha un `app-select-menu`.

**Il pannello suggerimenti è già estratto e quasi non usato.** `document-line-suggestions` esiste e ha il suo spec, ma i suoi consumatori sono le due card mobile; le due celle desktop portano la propria `<ul role="listbox">` inline. Lo stesso pannello è duplicato tre volte, e una delle tre copie è già un componente condiviso.

**`focusInput()` è API pubblica morta.** Dichiarata su entrambe le celle, zero chiamanti in `src/` e in `e2e/`. Non è una base utile per sostituire `getElementById`: richiederebbe nel form un elenco di viste indicizzato per riga _e_ per campo — più codice, non meno.

---

## 4. `app-select-menu` — perché è fuori dal giro

**183 istanze in 36 template** _(mis. 08/2026 — è la misura che si muove più in fretta di tutte)_. Di queste, nelle tre maschere da allineare le istanze in gioco sono **quattro**: IVA in Ordine cliente e Arrivo merce, IVA e **prodotto** in Ordine fornitore.

> **4 su 183** è la misura che regge la decisione **«sostituzione locale, non estensione del componente»**: cambiare il componente per quelle quattro celle significa muovere le altre 179.

**Cosa gli manca per stare nel giro:**

- nessun `inputId`, nessun `id` sul trigger (che è un `<button>`);
- nessun `focus()` pubblico;
- nessuna gestione di tastiera — l'unico aggancio è la chiusura su Escape;
- nessun `disabled` fra i suoi input;
- `SelectMenuOption` non ha modo di dichiarare che una voce **è un comando** e non un valore.

**Cosa invece ha già:** la ricerca (`searchable`, `filterOptionsLocally`, output `searchChange`), **già accesa** sulle celle IVA di Ordine cliente e Arrivo merce. Il type-ahead non manca: manca l'ingresso da tastiera.

**Il discrimine che non è quantitativo.** «Entri nella cella e il valore è selezionato, pronto da sovrascrivere» non è realizzabile su un `<button>` la cui etichetta _è_ il valore: dentro un bottone non c'è testo da selezionare. Farlo davvero richiede un ramo `<input role="combobox">` — cambio di ruolo ARIA che **rompe tutti i punti e2e** che pilotano il componente, perché `e2e/helpers/select-menu.ts` naviga per ruolo (`button` → `listbox` → `option`).

**Il precedente che ha già risolto lo stesso problema:** `shared/components/date-input/` espone `inputId` su un vero `<input>`, `triggerKeydown` come output e `triggerBlur`. Ed è **già dentro una cella di riga documento**: l'Arrivo merce lo usa per la scadenza lotto, inoltrando l'evento a `onLineFieldKeydown`.

**Trappola della voce-comando.** Una voce «Altro…» messa dentro `options` **viene mangiata dal filtro** appena l'operatore digita — proprio quando deve restare visibile. Va resa **fuori** dalle opzioni filtrate, in coda fissa. Inoltre `select()` emette `valueChange` per ogni opzione (serve un ramo separato) e il ciclo traccia per `option.value`, quindi la voce-comando non può avere valore vuoto: collide con l'opzione segnaposto.

**Il pattern esistente, da non replicare.** La catena «voce-azione → pannello di gestione» esiste già e funziona, in Arrivo merce per i tipi documento fornitore — ma con un **valore-sentinella** (`'__manage-types__'`) che ogni chiamante deve intercettare. Se un chiamante se ne dimentica, il valore finto finisce nel form control. E la voce riceve `role="option"` dentro `role="listbox"`, quindi viene annunciata come valore selezionabile: difetto di accessibilità già presente in più punti.

**Il filtro non fa quello che serve.** `select-menu-filter.util.ts` cerca la stringa **ovunque** dentro etichetta _e_ descrizione. Digitando `1` si pesca anche un codice IVA la cui descrizione contiene «art. 17» — rumore proprio nel caso a un carattere. Serve un filtro a **precedenza sul codice**: prima le voci il cui codice inizia con quanto digitato, poi il resto. Chi riusa la funzione esistente ottiene il comportamento sbagliato senza accorgersene.

---

## 5. Unità di misura — il flusso dati reale

### 5.1 Dove vive il dato

| Modello                 | Campo                                        |
| ----------------------- | -------------------------------------------- |
| `Product`               | `unitOfMeasure` — **NOT NULL**, default `pz` |
| `SalesOrderLine`        | `unitOfMeasure` opzionale                    |
| `TenantFeatureSettings` | `defaultUnitOfMeasure`, default `pz`         |
| `DocumentLine`          | **assente**                                  |
| `SupplierOrderLine`     | **assente**                                  |

L'elenco delle unità è una costante compilata (`COMMON_UNIT_OF_MEASURE`, sei valori _(mis. 08/2026)_). **Nessuna validazione contro un elenco chiuso** nei DTO del backend: niente `@IsIn`, niente enum. Il testo libero passa già — ed è la ragione per cui la riga può conservare la stringa senza chiave esterna.

### 5.2 Cosa succede in ciascuna maschera

**Ordine cliente** — cella di **sola lettura**. Il valore mostrato lo calcola `lineUnitOfMeasure` con precedenza: summary → valore di riga → `pz`. Il campo di riga **viene salvato**, ma siccome `Product.unitOfMeasure` è NOT NULL con default, la summary porta sempre un valore e vince sempre. **Lo snapshot salvato non si vede mai.**

**Preventivi / DDT / Scarico manuale** — `buildRegistryLines` non include `unitOfMeasure`, e `DocumentLine` non ha la colonna. Non essendoci campo editabile non si perde nulla di digitato: si perde la possibilità.

**Arrivo merce** — la `<select>` compare **solo in creazione articolo**. Il valore finisce nel corpo di creazione prodotto, che fa `product.create` e **mai** `product.update`. Su riga con articolo esistente la cella è calcolata e di sola lettura. **Corretto: nessun difetto.**

**Ordine fornitore** — campo di testo **editabile**, popolato dalla summary alla selezione articolo. `SupplierOrderLine` non ha la colonna, e in tutto `api/src/supplier-orders/` la stringa `unitOfMeasure` non compare. L'unico riutilizzo del valore è il precompilato per creare un articolo nuovo. **Modifichi, salvi, riapri: la modifica è sparita.** Fallimento silenzioso.

### 5.3 Verdetto

**Nessuna maschera scrive l'U.M. di riga sull'anagrafica di un articolo esistente** — non esiste in tutto il repo un `product.update` che tocchi `unitOfMeasure` partendo da una riga. L'anagrafica non viene corrotta.

Ma su tre maschere: una salva e non rimostra, una perde, una è corretta.

---

## 6. Le due forme di riferimento: `VatCode` e `PaymentOption`

### 6.1 `VatCode` — l'oggetto composto

**Diciannove colonne** _(mis. 08/2026)_: codice, natura, aliquota, indetraibilità, descrizione, note, ambito d'uso, modalità di calcolo, predefinito, attivo, di sistema, ordinamento, cancellazione logica, timestamp.

Due indici esistono **solo nell'SQL** della migration, perché Prisma non li esprime: unicità case-insensitive su `(tenant, lower(code))`, e indice parziale che garantisce **un solo predefinito per tenant** a livello di database.

**RLS**: la migration abilita row level security e revoca tutto a `anon` e `authenticated`. **Nessuna `CREATE POLICY` esiste in tutto il progetto**: il modello è default-deny puro e l'API si connette come owner. `scripts/check-rls.mjs` **fa fallire la build** se una tabella nuova non ha l'abilitazione.

**Come sopravvive nello storico** — due meccanismi sovrapposti:

- FK `ON DELETE SET NULL` su otto tabelle;
- `vatSnapshot Json?` su ogni tabella riga, congelato al salvataggio (codice, natura, aliquota, descrizione, modalità).

Cancellare un codice azzera il puntatore ma lo snapshot conserva i valori. **È già il «documento fotografia» applicato a un dato strutturato.**

**Nota per chi copia:** la guardia di eliminazione in `vat-codes.service.ts` controlla solo `DocumentLine` e `Product`; non controlla `SalesOrderLine`, `SupplierOrderLine`, `OnlineSaleLine`, `CorrispettivoEntryLine`, né i due default su fornitore e impostazioni. Copiarla così com'è propaga il buco.

### 6.2 `PaymentOption` — la forma per una stringa

**Sette colonne** _(mis. 08/2026)_, unicità su `(tenant, kind, name)`. Nessun calcolo, nessuna FK dalle righe: **le anagrafiche salvano il NOME della voce**. Eliminare una voce non tocca i dati salvati, e il servizio infatti elimina senza guardie.

> Diciannove contro sette è la misura che regge la scelta della forma per l'elenco U.M.: una stringa non ha bisogno dell'apparato di un oggetto che cambia i soldi.

### 6.3 I gestori di elenco che già esistono

**Quattro implementazioni a mano dello stesso lavoro** _(mis. 08/2026)_: Codici IVA (il più completo — crea, modifica, duplica, elimina, predefinito, attiva/disattiva, ricerca, filtri, gruppi), Metodi di pagamento, Numerazioni documenti, Categorie catalogo. Divergono anche fra loro: uno conferma con `window.confirm`, gli altri con `app-confirm-dialog`. Aggiungerne un quinto senza estrarre va contro l'obiettivo dichiarato della specifica.

`document-series-manager-dialog` **non è un pannello generico**: è un involucro sottile su `app-document-counters`, tipizzato su `DocumentType` e col suo servizio dentro. La **forma** è quella giusta — un `SlidePanelComponent` aperto da un `@if` nel padre, col grilletto in un campo condiviso che emette un output — il contenuto no.

---

## 7. Colonne — chi legge l'ordine e chi no

`table-column-picker` è montato su **11 schermate** _(mis. 08/2026)_ e le sue frecce scrivono `columnOrder` in `TableViewState`, persistito su localStorage e server.

**Chi legge quell'ordine:**

| Famiglia                                            | Tabelle                                                                        | Riordino     |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ |
| Guidate dai dati (`@for` sulle colonne + `@switch`) | Registro documenti, Giacenze, Movimenti, Situazione, Ordini cliente, Fornitori | **funziona** |
| Sequenza fissa scritta a mano                       | Prodotti, Clienti                                                              | inerte       |
| Sequenza fissa scritta a mano                       | le tre maschere documento                                                      | inerte       |

Prodotti e Clienti ricevono le colonne ma le usano solo per sapere **se** una colonna c'è e per l'etichetta.

**Cosa funziona invece sulle righe documento** _(mis. 08/2026)_:

|                                                  | Ordine cliente | Arrivo merce | Ordine fornitore |
| ------------------------------------------------ | -------------- | ------------ | ---------------- |
| Nascondere (gate `isLineColumnVisible`)          | 48             | 69           | 30               |
| Ridimensionare (maniglie `appTableColumnResize`) | 14             | 15           | 13               |
| Spostare                                         | —              | —            | —                |

> **Due su tre funzionano già** è la misura che regge la decisione di escludere lo spostamento colonne: manca la funzione meno richiesta delle tre, e costa più di tutto il resto del piano.

Il **pin** non compare sui documenti: nessuna delle tre configurazioni dichiara `pinnable`.

### 7.1 I token di gruppo — nessuno è orfano

I token colore dei gruppi (`--table-group-*-rule`) disegnano la **sottolineatura sotto l'intestazione** di ogni gruppo; il token divisore (`--color-table-group-divider`) disegna il bordo verticale forte del separatore **e** il bordo superiore del riepilogo totali.

Solo la regola del separatore verticale è **posizionale**. Le tinte di sfondo e le sottolineature sono classi sulla cella e seguono la colonna ovunque. `regole-stile-ui.md` impone il separatore forte: è la fonte di verità visiva, e va toccata solo se si decide di rimuoverlo.

### 7.2 Perché la trasformazione guidata dai dati è esclusa

_Tenuto agli atti: la decisione poggia su queste misure, non è arbitraria._

**Markup delle tre tabelle** _(mis. 08/2026)_:

| Maschera         | Tabella   | colgroup    | thead | tbody | Colonne | Gate visibilità |
| ---------------- | --------- | ----------- | ----- | ----- | ------- | --------------- |
| Ordine cliente   | 738       | 51          | 327   | 354   | 16      | 48              |
| Arrivo merce     | 951       | 73          | 432   | 444   | 23      | 69              |
| Ordine fornitore | 458       | **nessuno** | 201   | 255   | 15      | 30              |
| **Totale**       | **2.147** |             |       |       |         |                 |

**Metà del lavoro sarebbe meccanica**: i `colgroup` collassano (124 righe → ~6), il grosso delle intestazioni ha già l'etichetta nel dato, le celle di sola lettura seguono il pattern degli elenchi.

**L'altra metà non ha precedente.** Verificato su tutte e sei le tabelle già guidate dai dati: **zero** `colgroup`, `colspan`, `appTableColumnResize`, `formControl` — sono tabelle di sola lettura a larghezza automatica. Le righe documento hanno in più:

- la riga «documento collegato» con `colspan` variabile, che rompe l'assunto «una cella per colonna» (nella stessa tabella esiste però il `colspan` a tutta larghezza della riga di scansione: è il pattern che la risolverebbe);
- **42 maniglie di ridimensionamento** _(mis. 08/2026)_ e larghezze in quote percentuali che devono sommare 100;
- i separatori di gruppo, oggi scritti sulla colonna che chiude il gruppo;
- quattro celle a doppio ramo in Arrivo merce;
- due card mobile con ordine e identificativi propri.

**Un dato favorevole:** le larghezze sono già **per-colonna, non per-posizione**.

**Un dato da conoscere:** l'ordine del template di Ordine fornitore **non coincide** con l'ordine della sua configurazione (cinque colonne in posizione diversa _(mis. 08/2026)_). Adottare l'ordine del dato cambierebbe la disposizione a schermo, a meno di riordinare prima la configurazione perché rispecchi l'attuale.

---

## 8. Ordinamento e spostamento righe

### 8.1 L'ordinamento per colonna, oggi

Esiste **solo in Arrivo merce**: `toggleLineSort` e `applyLineSort`, col comparatore in `goods-receipt-line-sort.util.ts`. Attivabile su **sette colonne** _(mis. 08/2026)_: SKU, EAN, cod. fornitore, prodotto, quantità, costo, IVA.

- **Riordina la `FormArray` sul posto**, ri-inserendo le stesse istanze di `FormGroup`.
- **Non è reversibile**: nessuna copia dell'ordine precedente, nessun annulla. Il secondo click inverte, non ripristina.
- **Non si riapplica al caricamento**: riaprendo, l'ordinamento è spento.
- **L'ordine risultante viene salvato**, inevitabilmente: il payload è l'array e il server assegna `lineNumber` dall'indice. Arriva al database **al primo salvataggio successivo**, anche fatto per altro motivo.
- **Nessuna conferma, nessun avviso.** Per confronto, nella stessa tabella un'altra operazione massiva («Imposta IVA a tutte le righe») passa da un dialog col conteggio delle righe interessate.
- `isLineColumnSortable` è dichiarato e **mai chiamato**: la lista delle colonne ordinabili è di fatto cablata nei sette rami dell'intestazione.

**Due effetti collaterali da conoscere:**

- l'Arrivo merce tiene sempre una riga vuota finale e il comparatore non ha casi speciali, quindi **ogni ordinamento crescente porta la riga di inserimento in cima**;
- l'Ordine cliente ha righe «documento collegato» che nessun'altra maschera ha: ordinando per una colonna testuale finirebbero in testa, staccate dal gruppo che intestano.

### 8.2 La persistenza dell'ordine

| Maschera                            | Colonna                     | Scrittura                                       | Lettura             |
| ----------------------------------- | --------------------------- | ----------------------------------------------- | ------------------- |
| Arrivo merce e altri `DocumentLine` | `lineNumber`                | dall'indice, lato server                        | `orderBy` esplicito |
| Ordine cliente                      | `SalesOrderLine.lineNumber` | dall'indice                                     | `orderBy` esplicito |
| **Ordine fornitore**                | **nessuna**                 | `deleteMany` + `create` nell'ordine del payload | **senza `orderBy`** |

Su Ordine fornitore l'ordine **sopravvive per caso**: le righe vengono cancellate e ricreate a ogni salvataggio, e una `SELECT` senza `ORDER BY` su una tabella piccola torna in ordine fisico. Aggiungere l'ordinamento senza la colonna produrrebbe un ordine **persistente e non garantito** — peggio di entrambe le alternative.

_Effetto collaterale non legato al riordino, ma da sapere se si tocca quel salvataggio:_ `DocumentLine.supplierOrderLineId` ha `onDelete: SetNull`, quindi ogni salvataggio di un ordine fornitore **azzera il collegamento** delle righe arrivo merce che puntavano a quelle righe.

### 8.3 Il trascinamento

Esiste **solo in Ordine cliente**: `cdkDropList` / `cdkDrag` / `cdkDragHandle` nel template, handler `onLineDrop` con guardia sola-lettura. Sposta il controllo nella `FormArray` e marca il form come sporco; la posizione diventa `lineNumber` al salvataggio successivo. Nessuna conferma, nessun annulla. Arrivo merce e Ordine fornitore: zero occorrenze.

_Nota:_ Ordine fornitore traccia il ciclo delle righe per **posizione** (`track $index`), le altre due per riga. Con righe che si riordinano, tracciare per posizione è la cosa sbagliata.

---

## 9. I difetti verificati

**Gruppo A — divergenze che il punto unico cementerebbe**

1. **↑ è un tasto morto** in Ordine cliente e Ordine fornitore: le celle emettono `lineRowRetreat` e nessuno dei due template lo aggancia. Il tasto fa `preventDefault` e poi niente — non fa nemmeno il comportamento nativo.
2. **La cella prodotto di Ordine fornitore non ha identificativo** ed è un `app-select-menu` senza `(keydown)`. Ma `product` è nel giro del Tab: da «Cod. fornitore» il fuoco si perde.
3. **`advanceToNextLine` di Ordine fornitore non controlla `formReadOnly()`** — e non ha nemmeno il `<fieldset [disabled]>` che protegge le altre due. Su documento bloccato il Tab aggiunge righe.
4. **L'identificativo IVA dell'Arrivo merce è nella mappa ma non esiste nel DOM** (la cella è un `app-select-menu`). Innocuo solo perché `visibleLineFocusFields` esclude `vat` a mano.
5. **Le celle gemelle divergono a suggerimenti aperti**: la cella prodotto usa le frecce per scorrere la lista, la cella codice le ingoia con `preventDefault`.

**Gruppo B**

6. **Ordine cliente: il giro ignora `lineIsReference`.** Sulla riga «documento collegato» il template non rende alcun controllo del giro, quindi ogni ricerca per identificativo va a vuoto e il fuoco muore.
7. **Arrivo merce, con una sola riga vuota**: l'aggiunta porta a due righe, la pulizia dei duplicati vuoti in coda torna a una, e il fuoco punta a un indice che non esiste più.
8. **Arrivo merce, mappa inversa** (usata da Ctrl+frecce): il prefisso del lotto è testato **prima** di quello della scadenza lotto, e il secondo inizia col primo. Da «Scadenza» il fuoco torna su «Lotto».
9. **Ordine fornitore: U.M. e sconto sono nel giro ma non hanno `(keydown)`.** Il template ha **due gestori per nove campi**, contro i nove dell'Arrivo merce e i quattro dell'Ordine cliente _(mis. 08/2026)_.
10. **Arrivo merce: su riga collegata prezzo di vendita e prezzo di confronto sono esclusi dal Tab ma le celle restano editabili col mouse**, senza commento che spieghi l'incoerenza.
11. **e2e già rotto**: gli helper e lo spec dell'Arrivo merce cercano una classe CSS rinominata in `src/`. Finché resta così, ogni prova e2e dell'Arrivo merce è rossa a prescindere.
12. **U.M. di Ordine fornitore fallisce in silenzio** (§5.2).

---

## 10. Il contratto del punto unico

**Forma.** `domain/documents/state/` ospita già tre classi senza dipendenze, istanziate come campo del componente: `DocumentNumberConflictStore`, `DocumentPrefillErrorStore`, `DocumentProductPanelStore`. I loro commenti dichiarano la regola: _dentro vive solo lo stato/meccanismo; ciò che differisce resta nel form_. Nessuna è `@Injectable`.

**In tutta l'app esiste una sola direttiva** (`table-column-resize`), e non è di focus. Non c'è nulla di riusabile per il fuoco in `shared/` o `core/`; `@angular/cdk/a11y` — che contiene `FocusKeyManager` — non è mai importato.

**Il tipo.** I tre insiemi di campi non sono annidati: `unitPrice` solo in Ordine cliente, `unitCost` solo nelle altre due, `unitOfMeasure` come campo-fuoco solo in Ordine fornitore, lotto/scadenza/prezzi solo in Arrivo merce. **Un'unione piatta di tutti i campi toglierebbe il controllo del compilatore.** La forma che lo conserva è una classe generica sul tipo del campo, con `Record<F, …>` che esige tutte le chiavi.

**Le dieci voci.**

| #   | Voce                                      | Chi la richiede                                                |
| --- | ----------------------------------------- | -------------------------------------------------------------- |
| 1   | array ordinato dei campi                  | tutte                                                          |
| 2   | mappa completa degli id                   | tutte — non un prefisso (§2.3)                                 |
| 3   | predicato di abilitazione `(riga, campo)` | tutte — assorbe visibilità colonna, riga collegata, esclusioni |
| 4   | riga non attraversabile                   | **solo Ordine cliente** (`lineIsReference`)                    |
| 5   | guardia sola-lettura                      | tutte — è dove divergono                                       |
| 6   | numero righe                              | tutte                                                          |
| 7   | creazione riga                            | tutte, con tre corpi diversi                                   |
| 8   | gancio d'uscita riga                      | **solo Arrivo merce** (`commitLineAndSave`)                    |
| 9   | intercettazione Invio                     | Arrivo merce                                                   |
| 10  | predicato «riga vuota»                    | tutte — **assente in Ordine fornitore**                        |

**Voce 9 — cosa resta e cosa cade.** I due casi speciali di Arrivo merce si separano: Invio su «Cod. fornitore» **registra il valore** e resta necessario; Invio su «Q.tà» con articolo collegato **salta riga**, cioè naviga, e cade con la decisione «Invio non naviga».

**Entrate nominali obbligatorie.** Le celle condivise non consegnano l'evento (§3): il punto unico deve esporre `next()`, `previous()`, `rowDown()`, `rowUp()`, `focusField()`, non solo un gestore di tastiera. E `rowDown`/`rowUp` devono ricevere **il campo**, perché conservare la colonna lo richiede — il template lo conosce staticamente, quindi si aggiunge nel binding senza toccare le celle.

**Cosa entra senza contratto**, perché identico nelle tre: `focusNextLineField`, `focusFirstLineField`, `focusPreviousLineField`, `focusLastLineField`, e il blocco Tab / Shift+Tab con la scappatoia del browser sulla prima cella della prima riga.

---

## 11. Mappa esecutiva

### 11.1 Cosa si toglie

Da tutte e tre: `visibleLineFocusFields`, `focusLineField`, `focusFirst/Last/Next/Previous`, `advanceToNextLine`, `onLineFieldKeydown`. Dall'Arrivo merce in più: `advanceToPreviousLine`, `activeLineFocusField`, `advanceFromProductField`.

Ordine di grandezza _(mis. 08/2026)_: **~126 righe** dall'Ordine cliente, **~115** dall'Ordine fornitore, **~244** dall'Arrivo merce.

**Restano nel form, fuori dal contratto:** `moveLineUp` / `moveLineDown` e i due rami `Ctrl` + ↑↓ dell'Arrivo merce. Vanno **nominati nel commit**, o spariscono per inerzia o si intrufolano nel punto unico.

### 11.2 Ordine dei passi

Criterio: **prima la semantica, poi la copertura.** Partire da Arrivo merce «perché ha già tutto» porterebbe le sue eccezioni nel contratto come se fossero regole.

0. **Riparare l'e2e rotto** (difetto 11). Finché è rosso, nessuna prova e2e dell'Arrivo merce distingue una rottura vera.
1. **I difetti in `domain/`** che il punto unico cementerebbe (difetto 5, e la rimozione di `focusInput()`).
2. **La classe con il suo spec, senza innestarla.** Rischio zero. _Attenzione: la copertura esclude i `*.component.spec.ts`, quindi questo file **entra nel gate**. Senza il suo spec la verifica completa fallisce, e alzare la soglia è vietato dalle regole._
3. **Ordine cliente** — porta la semantica, è l'unica che esercita la voce 4, non ha il gancio asincrono, ha la rete di test migliore, e copre quattro tipi documento.
4. **Ordine fornitore** — il contratto arriva collaudato; qui si aggiunge la voce 10 e si chiudono i difetti 2, 3, 9.
5. **Arrivo merce per ultima** — è l'unica che _aggiunge_ voci al contratto (8 e 9), è la più grande, ed è l'unica con l'ordinamento righe che rimescola gli indici sotto il fuoco.

### 11.3 Test minimi

Nel file dello store, undici casi: l'ordine ricevuto comanda; un campo disabilitato non è una fermata; la mappa si interroga per campo; `rowDown` conserva la colonna; crea sull'ultima riga con contenuto; **non** crea sulla riga vuota; `rowUp` sulla prima riga non fa nulla; la riga saltata viene scavalcata in entrambi i versi; con sola-lettura nessuna creazione e nessuno spostamento; `onEnter` che ritorna vero ferma il giro; il gancio d'uscita gira **prima** del fuoco.

Un test per maschera nei rispettivi spec («il fuoco atterra dove deve»): non entrano nel gate, ma sono la rete del comportamento. E un e2e: inserire due righe usando **solo** Tab e ↓.

---

## 12. Rete di test — stato reale

**Zero copertura** sull'area _(mis. 08/2026)_. I tre spec di componente non contengono `keydown`, `focus`, `Tab`, `ArrowUp`/`ArrowDown`, `advanceToNextLine` né `LineFocus`. In `e2e/` l'unico uso di tastiera è un `Escape`.

Le due celle condivise non hanno spec. `app-select-menu` non ha spec: le sue uniche verifiche automatiche sono le chiamate e2e legate ai ruoli ARIA. `document-line-suggestions` ha il suo spec — è l'unico pezzo dell'area coperto.

---

## 13. Rischio di collisione con gli altri rami

**Metodo.** Confrontare con `origin/main` produce falsi positivi: i rami condividono un antenato già dentro `feature/listini`. Va usato il **merge-base con il ramo corrente** (`git merge-base <ramo> feature/listini`), poi il diff da lì. _Il metodo non invecchia; la tabella sì._

_(mis. 08/2026)_

| Ramo                          | Stato                                                             | Tocca i tre form o le celle condivise |
| ----------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `feature/cassa`               | attivo — `features/store-sales/`, fiscal, settings, API           | **no**                                |
| `feature/fattura-elettronica` | attivo — riscrive `sales-document-form` e `purchase-invoice-form` | **no**                                |
| `develop`                     | interamente contenuto in `feature/listini`                        | no                                    |
| rami già in `main`            | —                                                                 | no                                    |

**Il perimetro delle tre maschere e delle celle condivise è libero.** Le contese esistono solo sui due componenti fuori dal primo giro, e con rami diversi e indipendenti: le fatture con fattura elettronica, la vendita al banco con la cassa.

---

## 14. Domande ancora aperte

- **Costo dell'estrazione** del nucleo comune delle due celle gemelle e della terza cella: stimato, non misurato.
- **Valori U.M. distinti realmente presenti** per tenant, necessari al seed: vanno misurati sul database.
- **Effetti dell'aggiunta della colonna U.M.** su `DocumentLine` e `SupplierOrderLine` sugli altri consumatori di quelle tabelle (stampe, PDF, XML FatturaPA, backup).
- **Se l'ordine delle righe finisce nelle stampe e nell'XML FatturaPA**: entrambi leggono `lineNumber`, quindi seguono l'ordine persistito, ma quei flussi non sono stati letti per intero.
- **`purchase-invoice-form`, `transfer-form`, `stock-operation-form`**: hanno righe editabili e nessuna navigazione. Non sono nei nove tipi, ma useranno gli stessi controlli — vanno nominati, o diventano la quarta variante.

---

## 15. Come si rigenera

Si riparte dai **simboli citati** e si ricontrolla ciò che è cambiato. Quando si riverifica una misura, si aggiorna **solo la sua data**: le misure non invecchiano insieme.

Dalla più volatile alla più stabile:

| Misura                                        | Si muove                                                    |
| --------------------------------------------- | ----------------------------------------------------------- |
| Istanze di `app-select-menu` (§4)             | a ogni sprint — chiunque aggiunga un menu la cambia         |
| Righe di markup e gate di visibilità (§7.2)   | a ogni modifica delle tabelle                               |
| Stato dei rami (§13)                          | a ogni merge — il _metodo_ del merge-base invece non cambia |
| Righe rimosse per maschera (§11.1)            | quando si tocca la navigazione, cioè con questo lavoro      |
| Difetti (§9)                                  | alcuni potrebbero essere già stati corretti altrove         |
| Sovrapposizione fra le due celle gemelle (§3) | solo se qualcuno tocca quelle due celle                     |
| Forma di `VatCode` e `PaymentOption` (§6)     | raramente — sono schema                                     |
