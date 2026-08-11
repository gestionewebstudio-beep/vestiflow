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

#### ⚠️ Due viste vive insieme — da guardare al passo 3 _(verificato 08/2026)_

Riconosciuto come difetto a sé, perché non riguarda solo il fuoco e continuerà a produrne altri finché resta.

**Il fatto.** La tabella desktop **non è dentro un `@if`**: sotto il breakpoint è nascosta dal CSS, non rimossa (`doc-form__table-wrap`, sempre reso). Anche le card mobile sono sempre nel DOM. Quindi ogni riga esiste **due volte**, con due insiemi di identificativi (`co-…` e `co-m-…`), e una delle due copie è sempre invisibile.

**Cosa produce, oltre al fuoco.** Ogni stato condiviso fra le due viste si apre in entrambe, e in una non si vede. È già successo: la scelta fra più codici si apriva nella cella desktop nascosta mentre l'operatore guardava la card — la riga non si agganciava e nulla lo diceva. Sanato dando alla card il proprio pannello (§3-ter), ma **il difetto di fondo resta**: il prossimo stato condiviso rifarà la stessa cosa, e di nuovo in silenzio.

**Perché tocca il passo 3.** Il punto unico della navigazione lavora per identificativo (`getElementById`). Con due viste vive, «l'id della riga _i_, campo _x_» **non è univoco**: la risposta giusta dipende da quale vista l'operatore sta guardando, che il TypeScript non sa. Va deciso **prima** di innestare la navigazione, non dopo: (a) rendere le due viste esclusive con un `@if`, e allora l'id torna univoco; (b) dare al punto unico la vista corrente come dato, sullo stesso principio con cui riceve l'ordine dei campi (§4.7 della specifica). Nessuna delle due è stata scelta.

#### La misura, fatta prima di scegliere _(08/2026)_

**1. Lo stato del form sopravvive allo smontaggio.** Provato su un componente ridotto con `[formGroup]` + `formArrayName` + `@if`, alternando le due viste: **valore, «toccato», «sporco» e «disabilitato» restano**, e il valore ricompare nel campo della vista appena montata. Il modello vive nel componente, non nel template: `@if` toglie l'elemento, non il controllo. **Il timore principale della strada (a) non si verifica.**

**2. Il fuoco invece si perde**, verificato: l'elemento che lo aveva non esiste più. Costo reale ma circoscritto — si paga solo attraversando il breakpoint, cioè ruotando un tablet o ridimensionando una finestra, non durante il lavoro.

**3. La strada (a) non costa: RISPARMIA.** Conteggio dei nodi DOM resi dall'Ordine cliente, a righe compilate _(mis. 08/2026)_:

| Righe        | Tabella (nodi / controlli) | Card (nodi / controlli) |
| ------------ | -------------------------- | ----------------------- |
| 3            | 293 / 57                   | 108 / 24                |
| 10           | 664 / 155                  | 297 / 66                |
| **per riga** | **≈ 53 / 14**              | **≈ 27 / 6**            |
| parte fissa  | 134                        | 27                      |

Su un documento da **30 righe** la tabella pesa ≈ **1.724 nodi e 420 controlli**. Oggi su telefono sono **tutti resi, tutti legati al form, tutti invisibili** — e li paga il dispositivo che meno se lo può permettere. Rendere le viste esclusive non aggiunge lavoro: lo toglie.

**4. Il costo vero della (a) è un altro, e non è nel DOM: il breakpoint non esiste in TypeScript.** `matchMedia` è usato in tutta l'app **solo** in `theme.service` (per `prefers-color-scheme`); il confine fra le due viste vive esclusivamente nel CSS — `$breakpoint-lg: 64rem` in `_breakpoints.scss`, applicato con `@include bp.media-down('lg')`. La (a) richiede quindi di **costruire un segnale di viewport** che oggi non c'è, e con esso **una seconda fonte di verità per lo stesso confine**: se il valore in TypeScript e quello in SCSS divergono, la vista viva e la vista mostrata non coincidono più — un fallimento silenzioso, della stessa famiglia di quelli che questo lavoro sta togliendo.

**Mitigazione possibile, non ancora scelta:** dichiarare il breakpoint come token CSS in `_design-tokens.scss` e farlo leggere al segnale, invece di ripeterne il valore in TypeScript. Resterebbe una fonte sola, e `npm run check:tokens` la sorveglia già.

**Cosa resta alla (b).** Non tocca il DOM e non introduce nessun segnale, ma lascia **entrambe le viste vive**: il costo di rendering misurato al punto 3 resta tutto, e ogni stato condiviso continua a potersi aprire nella vista che non si vede — è già successo con la scelta dei codici (§3-ter). Sposta il problema dentro la mappa degli id invece di toglierlo.

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

**Il pannello suggerimenti — ✅ terza copia chiusa (08/2026).** `document-line-suggestions` era estratto, aveva il suo spec, ma i suoi consumatori erano solo le due card mobile: le due celle desktop portavano la propria `<ul role="listbox">` inline, e lo stesso pannello era duplicato **tre volte**. Ora lo usano anche le due celle; i consumatori sono quattro e la copia inline non esiste più, insieme a ~90 righe di SCSS che differivano solo per il prefisso.

Ogni cella compone il testo (titolo e dettaglio) e tiene per sé l'identità della variante: il pannello restituisce **l'indice**, la cella lo risolve in id. È il contratto che quel componente già dichiarava.

> ⚠️ **Il pannello deve restare DENTRO le celle.** Ogni cella riceve il proprio `activeSuggestionIndex` — quella codice dal signal dei codici, quella prodotto da quello dei nomi — e lo passa al pannello. Sono due liste con lunghezze diverse. Tirare il pannello su nella maschera «per semplificare» sembrerebbe più pulito e **riunificherebbe in silenzio due stati separati apposta**: un pannello, un indice, e l'indice si sfasa passando dall'una all'altra. Nessun test se ne accorgerebbe.

**`focusInput()` era API pubblica morta — ✅ RIMOSSA (08/2026).** Dichiarata su entrambe le celle, zero chiamanti in `src/` e in `e2e/`. Non era una base utile per sostituire `getElementById`: avrebbe richiesto nel form un elenco di viste indicizzato per riga _e_ per campo — più codice, non meno. Rimossa insieme al `viewChild` che la serviva, al riferimento di template (`#codeInput` / `#productInput`) e agli import rimasti orfani. Era la **seconda strada** verso il fuoco, mai imboccata: lasciarla era una pista falsa per chi implementerà il punto unico.

### 3-bis. La ricerca nei campi codice — cosa c'era, e cosa la decisione richiedeva

> **Sezione storica: eseguita, vedi §3-ter.** Il tempo presente qui sotto descrive il codice **prima** della decisione, che è ciò che serve a chi rilegge un commit o si chiede perché qualcosa sia stato tolto. Per lo stato attuale, §3-ter.

Registrato qui perché la decisione di prodotto («il campo codice non cerca», spec) cambia **la sorgente** di un meccanismo, non lo rimuove. Chi esegue deve sapere cosa tocca.

**Come si apriva il pannello della cella codice** — due strade, misurate _(mis. 08/2026, prima della modifica)_:

| Strada                    | Su quali campi     | Condizione                                                                                                                                  |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Mentre digiti             | Cod. articolo, SKU | da **2 caratteri**, se la riga non ha già un articolo. Ricerca al server, attesa 300 ms                                                     |
| Alla conferma (Tab/Invio) | tutti              | il codice viene cercato, i risultati filtrati per corrispondenza **esatta**; se ne restano più d'uno, il pannello si apre per far scegliere |

Due precisazioni che smentiscono quanto sembra:

- **Il campo EAN non cerca mentre digiti**: il suo gestore _chiude_ il pannello a ogni carattere. La ricerca live vive su due campi su tre.
- **Il commento nel codice dice «da 3 caratteri in su»; la costante è 2.** Commento vecchio.
- **Lo scanner non usa questo pannello.** Verificato: né la scansione riuscita né il codice sconosciuto toccano quello stato. Rimuovere la ricerca a digitazione **non tocca la scansione**.

**Il ripiego non dichiarato.** Alla conferma, se nessun risultato ha il codice esatto, il filtro restituisce **tutti** i risultati della ricerca — e la ricerca del server guarda dentro codice articolo, nome, marca, SKU ed EAN. Perciò oggi il campo codice funziona anche come ricerca per nome, ma **solo quando il codice non viene trovato**. Non è dichiarato da nessuna parte e non è prevedibile: è il comportamento che la decisione rimuove.

**Il codice non riconosciuto**: il valore **resta scritto** (nessuna riga lo cancella) e la riga prosegue. Fino a 08/2026 compariva anche un banner d'errore in testa alla maschera, aggiunto deliberatamente perché _«senza feedback l'utente crede di aver collegato l'articolo»_.

> **Il banner è stato rimosso SENZA sostituto** _(deciso 08/2026)_ — e non è un lavoro lasciato a metà.
>
> Si era valutato di rimpiazzarlo con un segno sulla riga. La valutazione ha mostrato che **lo stato è già visibile**: una riga collegata mostra il nome del prodotto e ha le celle d'identità come **testo**; una riga non collegata le ha come **campi**, e il nome resta vuoto. Chi digita un codice e non vede comparire nulla capisce da sé — o l'articolo non esiste, o non ha quel codice assegnato — e prosegue compilando la riga a mano, che è **un uso legittimo, non un errore da segnalare**.
>
> Vale il principio delle etichette: **se serve un avviso per spiegare uno stato che si vede già, l'avviso è di troppo.** Il banner per giunta stava in testa alla maschera, lontano dalla riga a cui si riferiva.
>
> **E c'è di più: quel banner era anche sbagliato.** Diceva _«crea l'articolo dal campo Nome prodotto (azione "Crea" nell'elenco)»_ — ma **quell'azione nell'elenco non esiste**: il pannello dei suggerimenti contiene solo risultati, e a zero risultati una riga di testo non cliccabile. Mandava l'operatore a cercare un pulsante che non c'è. Non era solo di troppo: era una falsa indicazione. La rimozione non è una scelta di gusto.
>
> Quindi: nessun segno da progettare, nessun punto aperto. Chi rilegge non deve cercare il pezzo mancante.

**Dove vive davvero la creazione di un articolo dalla riga** _(mis. 08/2026)_ — verificato prima di togliere il messaggio di vuoto dal pannello, per accertare che non chiudesse una porta:

- **nella cella**, il pulsante «Completa anagrafica» (`link-action`), che apre l'anagrafica precompilata coi campi della riga;
- **sopra le righe**, «Nuovo prodotto» in Arrivo merce e «Crea nuovo prodotto» in Ordine cliente, sempre disponibili.

Nessuna delle due passa dal pannello: togliere il messaggio di vuoto non chiude nulla, e **§9 resta un miglioramento, non un prerequisito**.

⚠️ **Ma §9 non è opzionale a lungo.** Oggi «Completa anagrafica» è visibile mentre si digita **solo perché la cella ha il fuoco** (`:focus-within`). Regge, ma è un'azione la cui presenza dipende da uno stato transitorio: basta che il fuoco si sposti perché la via per creare sparisca dalla vista. È la stessa fragilità che §9 rimuove trasformandola in un'icona fissa.

**Verifica sul backend — nessuna modifica necessaria.** La regola chiede che tutti e quattro i campi cerchino sul catalogo con corrispondenza esatta, e che il caso ambiguo apra una scelta.

- L'endpoint `by-code` risolve già **solo se non è ambiguo**: SKU/EAN esatti; codice articolo solo se il prodotto ha una variante sola; codice fornitore solo se non è condiviso. Quando è ambiguo tace (404) — e il suo commento delega la scelta «alla ricerca contestuale», cioè proprio a ciò che la decisione rimuove. **Quel commento va aggiornato nello stesso commit: diventa falso.**
- I candidati per il caso ambiguo arrivano invece da `listVariantSummaries`, che il frontend già chiama: la sua ricerca passa da `buildInventoryVariantSearchWhere`, che **include il codice fornitore**, e il riepilogo restituito **porta `supplierSku`**. Filtro esatto lato client, come già si fa per il codice articolo.

**Correzione a quanto sopra, dopo l'esecuzione (08/2026): l'API andava toccata.** La verifica iniziale era incompleta. `listVariantSummaries` _cerca_ dentro i codici fornitore anche senza `supplierId`, ma **non li restituisce**: il collegamento fornitore era selezionato solo passando `supplierId`, e quel parametro **filtra anche i risultati**. Le due cose stavano nello stesso interruttore, quindi «tutto il catalogo» e «so quale codice ha corrisposto» erano incompatibili.

Modifica fatta, additiva, **nessuna migration**: i collegamenti fornitore si leggono sempre; con `supplierId` si resta al suo, senza si prendono i primi in ordine deterministico (preferito, poi più vecchio).

Tre cose che ne discendono, tutte annotate nel codice:

1. **Il codice restituito è quello che ha fatto scattare la ricerca.** Un articolo con tre fornitori ha tre codici diversi: restituirne uno a caso farebbe confrontare al filtro esatto della riga la stringa sbagliata, e il caso ambiguo non si aprirebbe.
2. **Senza ricerca e senza fornitore, il codice restituito è arbitrario** — il primo dell'ordine. Va bene per l'uso attuale, ma non è «il codice fornitore dell'articolo»: quello non esiste, perché i fornitori sono più d'uno. Il commento nel codice lo dice, perché è la classica cosa che qualcuno userà come se fosse.
3. **Prezzo e codice si leggono da collegamenti diversi.** Il prezzo d'acquisto usa il collegamento **solo** quando il fornitore è stato chiesto: leggere il «last purchase» di un fornitore arbitrario significherebbe seminare nella riga il costo pattuito con qualcun altro. Difetto introdotto e corretto nella stessa passata — è comparso proprio perché la lettura dei codici è diventata incondizionata.

⚠️ **Soglia arbitraria**: senza `supplierId` si leggono al massimo **20 collegamenti fornitore per variante**. Numero **scelto senza misura**, non fondato: serve solo a evitare che una variante patologica pesi sull'intera pagina. Se un giorno sembrerà una decisione motivata, non lo è — va misurato prima di trattarlo come tale.

#### I costi sono tre, non uno _(mis. 08/2026)_

Emerso verificando cosa dipendesse dal filtro per fornitore. Confonderli è facile, e le conseguenze non sono visibili subito.

| Dove vive                                    | Cosa rappresenta                                     | Aggiornato al carico                                                                                   |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SupplierVariantLink.lastPurchasePriceMinor` | l'ultimo prezzo pagato **a quel fornitore**          | **sempre**                                                                                             |
| `ProductVariant.purchasePriceMinor`          | il costo effettivo **della variante** (della taglia) | **sempre**                                                                                             |
| `Product.purchasePriceMinor`                 | il costo di **riferimento dell'articolo**            | solo se la spunta «Aggiorna anche il costo di riferimento in anagrafica» è accesa — **default acceso** |

Il ciclo si chiude su sé stesso: l'arrivo merce li scrive, e `findSupplierPriceDiffs` rilegge il primo alla conferma del documento successivo per segnalare gli scostamenti («lo pagavi X, ora paghi Y»).

**Cosa semina la riga, e perché è giusto così.** La riga legge il costo **della variante**: la riga documento aggancia sempre una variante specifica, quindi è il dato che le corrisponde. Il costo di riferimento dell'articolo **non è un'alternativa da cui pescare**: è un dato del prodotto, di natura diversa. Nessun punto aperto.

**Cosa è cambiato (08/2026).** La ricerca dei codici passava il fornitore della testata, e questo faceva sì che il riepilogo portasse `lastPurchasePriceMinor` al posto del costo della variante. Tolto il filtro, la riga parte dal costo dichiarato in anagrafica invece che dall'ultimo prezzo pagato — che è un fatto storico, magari un lotto in saldo, e non il costo dell'articolo. Lo scostamento resta visibile dove l'avviso esiste già: alla conferma.

`findSupplierPriceDiffs` **non è toccato**: prende il fornitore dalla testata del documento, non dalla ricerca. Verificato prima di togliere il filtro.

**Unicità dei codici — è nel database, non una convenzione** _(mis. 08/2026)_: `@@unique([tenantId, articleCode])` sul prodotto, `@@unique([tenantId, sku])` e `@@unique([tenantId, barcode])` sulla variante. Niente migration, nessun rischio sui dati. Ne segue che più corrispondenze **esatte** sul codice articolo sono per forza varianti dello **stesso** prodotto: la scelta è «quale taglia», non «quale articolo». Il codice fornitore invece non è unico, e lì la scelta è davvero fra articoli diversi.

**Più fornitori per articolo: il modello lo ammette, la funzione no** _(deciso 08/2026)_. `SupplierVariantLink` non ha vincolo di unicità per variante: un articolo **può** avere più collegamenti fornitore. Ma la funzione non è mai stata progettata né richiesta, e il comportamento attuale si scrive **assumendo un fornitore**: il costo che semina la riga è quello della variante, e «quale fornitore» non si pone. Non si impone il vincolo nel database e non si dichiara impossibile il caso. Se un giorno servirà davvero, la domanda aperta sarà **cosa significhi il costo di riferimento con due fornitori** — non è una questione di codice, è di dominio.

**La scelta è navigabile con le frecce** _(fatto 08/2026)_. Era il vincolo posto quando `suggestionNavigate` è passato da «da rimuovere» a «da aggiungere», e alla prima stesura del commit **non era stato soddisfatto**: la cella codice ingoiava ancora le frecce a pannello aperto. Ora le emette, la maschera tiene un indice attivo **proprio** dei codici — distinto da quello dei suggerimenti sul nome, perché sono due collezioni con lunghezze diverse — e Invio prende la voce evidenziata. Il fuoco resta nel campo perché il ramo «più corrispondenze» non lo sposta.

#### ✅ Decisa per tre maschere, applicata a una — poi chiusa su tutte e tre _(08/2026)_

> **Stato: chiuso.** Il percorso di conferma esiste ora in **tutte e tre** le maschere — Ordine cliente (e con lui Preventivi, DDT vendita, Scarico manuale), Ordine fornitore, Arrivo merce. Il resoconto qui sotto **resta**: descrive come una decisione presa per tre documenti sia finita su uno solo, ed è il caso che la regola in fondo alla sezione serve a intercettare. Cosa è stato fatto per chiuderla: §3-ter.

Vale la pena tenerlo scritto, perché il modo in cui è successo è più insidioso dell'errore.

La regola sui codici è stata decisa **per tutte le maschere**. È stata implementata in **Arrivo merce**, e per una ragione che sul momento sembrava sufficiente: era l'unica in cui il comportamento sbagliato esisteva. La ricerca a digitazione, il ripiego, il banner — vivevano lì. Nelle altre due non c'era niente da togliere, quindi sembravano già conformi.

**Erano conformi solo per assenza.** Misurando si è visto che la metà positiva della regola mancava: alla conferma di un codice che corrisponde a più varianti, Ordine cliente e Ordine fornitore **non aprivano nessuna scelta** — la risoluzione restituiva `null` e il caso finiva in silenzio, indistinguibile da un codice inesistente. Cioè la peggiore delle tre risposte: hai digitato il codice giusto e il sistema si comporta come se non esistesse.

Peggio: la divergenza fra le maschere era **aumentata** proprio mentre il piano era ridurla. Prima erano diverse a caso; dopo, Arrivo merce faceva la cosa giusta e le altre due no — a parità di aspetto e di gesto, che è la forma di divergenza più difficile da notare.

**E la taglia vera è emersa solo misurando.** Sembrava «passare due input alle celle». Non lo era: la funzione che quelle due maschere usano per confermare un codice restituisce `string | null` e **non può esprimere «eccone tre»** — scarta i candidati al proprio interno, in tre punti diversi. Serviva un percorso di conferma proprio, sul modello di Arrivo merce, lasciando la risoluzione singola alla scansione, che ha esigenze opposte: il lettore spara e va, una scelta lo interromperebbe.

**Il pezzo condiviso, già in uso da una maschera** _(08/2026)_: `domain/documents/utils/document-code-match.util.ts` porta il filtro delle corrispondenze esatte sui quattro campi codice, la regola dei **tre** esiti (nessuna · una · più d'una — mai due), e la dimensione di pagina della ricerca di conferma. Arrivo merce lo usa già; Ordine cliente e Ordine fornitore lo importeranno **senza riscriverlo**. ⚠️ Al momento di collegarlo, verificare che nessuna delle due si scriva una variante locale della stessa logica: il punto di quel file è che esista **un posto solo**.

**Perché le due maschere hanno bisogno di un percorso proprio, e la scansione no** _(mis. 08/2026)_. `resolveVariantIdByCode` — che oggi entrambe usano per confermare un codice — restituisce `string | null` e **non può esprimere «eccone tre»**: scarta i candidati al proprio interno, in tre stadi che trattano l'ambiguità in tre modi diversi. L'endpoint tace (i candidati restano sul server); la mappa locale **non può rappresentarla** (una chiave, un valore) e aggancerebbe arbitrariamente — inerte oggi in quelle due, che non ne passano una; solo la ricerca ha le righe in mano, e le scarta con `onlyMatch`.

Quella funzione **resta alla scansione**, che ha esigenze opposte: il lettore spara e va, e una scelta interromperebbe un gesto che deve essere immediato. La conferma da tastiera è il contrario — l'operatore è lì, sta guardando, ed è l'unico che può risolvere. ⚠️ Il commento di `onlyMatch` («due risultati portano allo stesso esito») **va corretto**: per la scansione resta vero, ma è una scelta di quel percorso, non una regola generale, e chi legge la applica anche altrove.

Due cose da non ereditare nel percorso nuovo: la **pagina da 5** (un articolo con più di cinque varianti avrebbe corrispondenze fuori pagina) e i **filtri di contesto** fornitore e sede — è lo stesso filtro appena tolto da Arrivo merce, che rientrerebbe da un'altra porta. Su `resolveVariantIdByCode` restano: è la scansione, ed è una decisione che non è stata presa.

> **La regola che ne discende** (in testa alla specifica, vale da qui in avanti):
>
> 1. **Ogni decisione dichiara su quali documenti vale, per nome, prima di essere implementata.** Non «vale ovunque»: l'elenco scritto prima. Scritto dopo, coincide sempre con ciò che è stato fatto.
> 2. **Una decisione è chiusa solo quando ogni documento dell'elenco è stato verificato** — implementato, oppure **misurato** già conforme. «Sembra a posto» non è una verifica.
> 3. **Il controllo che intercetta il caso insidioso:** quando la modifica tocca un documento solo, chiediti se la decisione ne riguardava uno solo. Se no, il lavoro non è finito **anche se il codice da cambiare stava tutto lì**. Succede quando una regola si applica _togliendo_ qualcosa: il comportamento sbagliato vive dove vive, rimuoverlo sembra chiudere il lavoro — ma ogni regola ha due metà, e la seconda riguarda tutto il perimetro.

**La forma del pannello di scelta.** `document-line-suggestions` è già estratto, ha il suo spec, ed è agnostico rispetto al contenuto: riceve `items: [{ title, detail? }]`, un `activeIndex` per l'evidenziazione da tastiera, e restituisce **l'indice** della voce scelta. I due contenuti diversi — «quale variante» dal codice articolo, «quale articolo» dal codice fornitore — si risolvono nella composizione del chiamante, non in due pannelli gemelli che divergono.

### 3-ter. Il percorso di conferma, com'è oggi _(fatto 08/2026)_

Chiude §3-bis su tutte e tre le maschere. **La catena non è stata copiata: è stata estratta**, e l'Arrivo merce — che l'aveva per primo — è stato riportato sulla versione condivisa nello stesso passaggio. Scriverla nelle altre due lasciando la sua com'era avrebbe prodotto **tre copie** dentro il lavoro che si chiama «semplificare».

**I tre pezzi, e cosa sta in ognuno.**

| Pezzo                                      | Cosa porta                                                                                                    | Dipendenze                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `utils/document-code-match.util.ts`        | il filtro delle corrispondenze esatte sui quattro campi + la dimensione di pagina                             | nessuna (funzione pura)         |
| `state/document-code-lookup.store.ts`      | lo stato della scelta: riga, campo, corrispondenze, voce evidenziata; frecce che si fermano ai capi           | nessuna — classe-campo del form |
| `services/document-code-lookup.service.ts` | la catena: ricerca → filtro esatto → ripiego `by-code`; e **il tipo a tre esiti** `DocumentCodeLookupOutcome` | `ProductService`                |

**Il tipo è la correzione vera.** `resolveVariantIdByCode` restituisce `string | null` e non può dire «eccone tre»; `DocumentCodeLookupOutcome` è `none | one | many`, quindi il caso ambiguo **non è rappresentabile come assenza**. Un chiamante che dimentica un ramo non compila.

**Cosa resta nel form, e perché è giusto:** leggere il valore dal proprio controllo (i nomi divergono — `supplierSku` in Arrivo merce, `supplierCode` in Ordine fornitore), agganciare la variante, spostare il fuoco. Sono le tre cose che cambiano davvero per tipo documento.

**Il blocco di binding delle celle codice è ora identico nelle tre maschere** — dodici celle in tutto, stesso testo. Le maschere non hanno metodi involucro attorno allo store: il template lo interroga direttamente (`codeLookup.matchesFor(i, 'sku')`), come già fa `prefillError.message()`.

**Il tipo dei campi si restringe dove il documento è più piccolo.** Ordine cliente ha **tre** campi codice, non quattro: il codice fornitore non ha senso su un documento di vendita, e `CustomerOrderCodeField` lo esclude con un `Extract` — così è il compilatore a dirlo, invece di scoprirlo a runtime cercando un controllo che non esiste. È la stessa ragione per cui il punto unico della navigazione sarà generico (§10); qui l'insieme è chiuso e dichiarato una volta, quindi lo store non ha bisogno di esserlo.

**Due cose non ereditate**, come previsto: la pagina da 5 e il filtro per fornitore. Su `resolveVariantIdByCode` restano — è la scansione. Su `locationId` la formulazione di §3-bis era **imprecisa**: verificato in `api/src/products/products.service.ts`, entra nella `where` degli `InventoryLevel`, non in quella delle varianti. **Non filtra i risultati**, restringe solo le giacenze mostrate — quindi resta, mentre `supplierId` (che filtra davvero, con `supplierLinks: { some: … }`) non c'è in nessuna delle tre.

**Tre difetti chiusi di passaggio**, tutti verificati prima di toccarli:

1. **Ordine fornitore non chiudeva mai la scelta**: le sue celle codice non agganciavano `escapePressed`, quindi Esc non aveva nessun effetto. Ora c'è, insieme a fuoco e sfocamento.
2. **Arrivo merce non alzava la riga sul codice fornitore**: `lineRowActive` elencava a mano tre campi su quattro, e il quarto era stato dimenticato quando il codice fornitore è diventato una cella codice. Ora la domanda si fa alla riga (`isOpenOnLine`), che è il motivo per cui quel metodo esiste.
3. **`BarcodeLookupService` era rimasto iniettato a vuoto in Ordine fornitore**: zero chiamanti dopo il passaggio al percorso nuovo, e quella maschera non ha lettore. Rimosso con l'import.

**Una conseguenza minore, voluta:** in Ordine cliente il riepilogo viaggia dentro l'esito, quindi agganciare una riga da codice **non richiede più due chiamate al server**. Prima `onVariantSelect` non trovava la variante fra le note e la richiedeva, e subito dopo una seconda richiesta la fissava di nuovo.

#### ✅ Il codice fornitore scritto nella riga _(deciso e fatto 08/2026)_

**Perimetro, per nome: Arrivo merce e Ordine fornitore.** Sono i due documenti che hanno la colonna Cod. fornitore; Ordine cliente, Preventivi, DDT vendita e Scarico manuale non ce l'hanno, e per loro non c'era niente da fare — verificato, non presunto.

**Il difetto.** Agganciando un articolo, la riga riscriveva il campo Cod. fornitore con `summary.supplierSku`. Da quando la lettura non filtra più per fornitore, quel valore è **il primo collegamento in ordine deterministico** — che può essere il codice di un altro fornitore. L'operatore digitava il codice del listino che aveva davanti, l'articolo si agganciava, e nel campo compariva un codice diverso da quello che aveva scritto.

**La regola, in un posto solo:** `supplierCodeForDocumentLine`, con le fonti in ordine — (1) il codice **digitato** con cui si è agganciato, (2) quello del collegamento col fornitore **della testata**, (3) niente. `VariantSummary.supplierSku` **non è una fonte**. È la stessa logica applicata alla lettura — «il codice restituito è quello che ha fatto scattare la ricerca» — portata alla scrittura, dove era rimasta indietro. Non è servito decidere nulla sui fornitori multipli: quella domanda (§«Più fornitori per articolo») resta aperta e non bloccava questa.

**La sorpresa: la seconda fonte in Arrivo merce esisteva già.** `supplierSkuByVariantId` è costruita da `getVariantLinksBySupplier(supplierId)`, cioè dai codici del fornitore della testata — la fonte giusta. Solo che `summary.supplierSku` le passava davanti. Il difetto era di **precedenza, non di sorgente mancante**: la correzione è un'inversione, non una costruzione.

**Come il codice digitato arriva fino all'aggancio:** `onVariantSelect(index, variantId, linkedWith?)` in entrambe le maschere; lo passa `commitCodeLookup` quando il campo di partenza è `supplierCode`, e `onCodeSuggestionPick` leggendo `codeLookup.field()` **prima** di chiudere la scelta — dopo, il campo d'origine non c'è più.

**Un secondo difetto trovato scrivendo la prova, non prima.** In Arrivo merce il campo lo riempie il **riallineamento in blocco** (`syncLineCodesFromVariants`), non l'aggancio: assegnare la variante fa ricaricare i riepiloghi e un `effect` riscrive i codici. Quel riallineamento sovrascriveva **anche un campo già compilato** — quindi il codice appena digitato spariva un istante dopo, in silenzio, sostituito da quello di un altro fornitore. Ora riempie solo un campo vuoto. Il ricalcolo quando **cambia il fornitore** (`syncSupplierSkuOnAllLines`) resta invece a sostituire, ed è giusto: lì i codici cambiano davvero tutti.

**La stessa scelta esiste anche nella card mobile** _(fatto 08/2026)_ — Ordine cliente è l'unica maschera che porta campi codice in vista mobile (la card dell'Arrivo merce ha solo ricerca articolo e IVA, verificato). La decisione vale su **Ordine cliente**, non su Ordine cliente desktop, e senza il pannello nella card da telefono la riga non si agganciava e non lo diceva.

**Su mobile la scelta si prende TOCCANDO**, e non è una replica del desktop: non c'è tastiera fisica, quindi non c'è voce «evidenziata» da scorrere e il pannello riceve `activeIndex: null` invece di zero — accendere la prima voce sarebbe un invito a premere Invio che lì non ha bersaglio. Il pannello è lo stesso (`document-line-suggestions`), che è **già tarato per il tocco**: target minimo fisso e stato `:active`, «perché `:hover` su touch non è affidabile», entrambi con commento nel suo SCSS. ⚠️ Nessun e2e prova però il tap: è intento dichiarato più uso quotidiano sul nome prodotto, non una verifica automatica.

⚠️ **Lo sfocamento chiude con ritardo** (`MOBILE_PICK_GRACE_MS`, 200 ms, **misura mai presa** — è il valore già in uso per i suggerimenti sul nome, adottato invece di sceglierne un secondo). Serve perché il pannello copre i campi sotto: chiudendo subito, il tocco successivo finirebbe su una voce invece che sul campo voluto, agganciando un articolo per sbaglio. Il pannello si difende anche da sé con `mousedown.preventDefault`, ma quella difesa non è mai stata verificata su un dispositivo vero.

✅ **Lo sfocamento conferma anche su mobile** _(deciso e fatto 08/2026)_, come Tab sul desktop. Il motivo della decisione: **lo scorrimento non toglie il fuoco a un campo** — quando lo perde è perché l'operatore ne ha toccato un altro, gesto deliberato quanto un Tab. L'alternativa (solo Invio) avrebbe richiesto di spiegare all'operatore che lì funziona diversamente, e una spiegazione del genere non ha dove stare: se serve dirlo, la differenza è di troppo.

⚠️ **I due meccanismi si pestavano, e vanno provati INSIEME.** La conferma allo sfocamento e la grazia per il tocco sulla voce, presi separatamente, sembrano entrambi a posto. Insieme no: uscendo con la scelta aperta, lo sfocamento confermava di nuovo e l'esito «più d'una» **riapriva il pannello** appena chiuso. Misurato togliendo il coordinamento: la prova diventa rossa con «expected { field: 'articleCode', … } to be null».

La soluzione è **un punto solo che decide dopo la grazia**, non due gestori che corrono: (1) riga già agganciata dal tocco → non si fa nulla; (2) scelta aperta e non presa → si chiude, e **non si cerca di nuovo**; (3) codice mai confermato → qui lo sfocamento conferma. L'ordine conta.

_Nota su (1): `commitCodeLookup` rifiuterebbe da sé su riga agganciata, quindi nessuna prova distingue quel ramo — ma sposterebbe comunque il fuoco, cosa che oggi non si vede solo perché su mobile gli identificativi puntano alla tabella nascosta (§2.3). Chiuso quel difetto, il salto diventerebbe reale._

⚠️ **In Ordine fornitore la seconda fonte manca**, e resta il seguito naturale: quella maschera non carica i collegamenti del fornitore di testata, quindi agganciando per nome/SKU/EAN il campo **resta vuoto** e lo compila l'operatore. Vuoto è corretto — meglio di un codice che al proprio fornitore non dice niente — ma non è il meglio possibile. Il pezzo che serve esiste già ed è in uso nell'Arrivo merce: `SupplierService.getVariantLinksBySupplier`.

**Le prove sono quattro, tutte con controllo inverso**, e sono state viste **fallire** togliendo la correzione: in Ordine fornitore «resta il digitato» e «per SKU resta vuoto invece che arbitrario»; in Arrivo merce «per SKU vale il codice della testata» e «da Cod. fornitore resta il digitato» — quest'ultima sorveglia anche il riallineamento asincrono. ⚠️ Nei mock, `searchVariantSummaries` **deve rispondere diversamente** alla ricerca (con `search`) e al caricamento per id: è da quella differenza che nasce il difetto, e mockarle uguali lo nasconde. È già successo alla prima stesura di queste prove.

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
5. ~~**Le celle gemelle divergono a suggerimenti aperti**: la cella prodotto usa le frecce per scorrere la lista, la cella codice le ingoia con `preventDefault`.~~
   **CHIUSO da una decisione di prodotto (08/2026), non corretto — non cercare il commit che lo sistema, non c'è.** La regola «il campo codice non cerca» (spec §codici) toglie la ricerca a digitazione e apre il pannello alla **conferma**, per far scegliere fra più corrispondenze esatte. Quella scelta deve essere navigabile con le frecce, quindi la cella codice **riceve** `suggestionNavigate` — che è precisamente ciò che le mancava. Il difetto non viene sanato: smette di esistere perché il meccanismo che lo conteneva cambia sorgente.
   Corollario verificato prima di agire: la divergenza **non** sarebbe stata cementata dal punto unico. Le frecce a lista aperta sono gestite dentro le celle e non raggiungono mai il form, che vede solo `lineRowAdvance` / `lineRowRetreat`, emessi a lista chiusa. La collocazione di questo difetto fra i prerequisiti dell'unificazione era sbagliata.

**Gruppo B**

6. **Ordine cliente: il giro ignora `lineIsReference`.** Sulla riga «documento collegato» il template non rende alcun controllo del giro, quindi ogni ricerca per identificativo va a vuoto e il fuoco muore.
7. **Arrivo merce, con una sola riga vuota**: l'aggiunta porta a due righe, la pulizia dei duplicati vuoti in coda torna a una, e il fuoco punta a un indice che non esiste più.
8. **Arrivo merce, mappa inversa** (usata da Ctrl+frecce): il prefisso del lotto è testato **prima** di quello della scadenza lotto, e il secondo inizia col primo. Da «Scadenza» il fuoco torna su «Lotto».
9. **Ordine fornitore: U.M. e sconto sono nel giro ma non hanno `(keydown)`.** Il template ha **due gestori per nove campi**, contro i nove dell'Arrivo merce e i quattro dell'Ordine cliente _(mis. 08/2026)_.
10. **Arrivo merce: su riga collegata prezzo di vendita e prezzo di confronto sono esclusi dal Tab ma le celle restano editabili col mouse**, senza commento che spieghi l'incoerenza.
11. ~~**e2e già rotto**: gli helper e lo spec dell'Arrivo merce cercano una classe CSS rinominata in `src/`.~~ ✅ **Chiuso (08/2026)**, insieme al fronte più largo che ha aperto — vedi §12.
12. **U.M. di Ordine fornitore fallisce in silenzio** (§5.2).

---

## 10. Il contratto del punto unico

**Forma.** `domain/documents/state/` ospita già tre classi senza dipendenze, istanziate come campo del componente: `DocumentNumberConflictStore`, `DocumentPrefillErrorStore`, `DocumentProductPanelStore`. I loro commenti dichiarano la regola: _dentro vive solo lo stato/meccanismo; ciò che differisce resta nel form_. Nessuna è `@Injectable`.

**In tutta l'app esiste una sola direttiva** (`table-column-resize`), e non è di focus. Non c'è nulla di riusabile per il fuoco in `shared/` o `core/`; `@angular/cdk/a11y` — che contiene `FocusKeyManager` — non è mai importato.

**Il tipo.** I tre insiemi di campi non sono annidati: `unitPrice` solo in Ordine cliente, `unitCost` solo nelle altre due, `unitOfMeasure` come campo-fuoco solo in Ordine fornitore, lotto/scadenza/prezzi solo in Arrivo merce. **Un'unione piatta di tutti i campi toglierebbe il controllo del compilatore.** La forma che lo conserva è una classe generica sul tipo del campo, con `Record<F, …>` che esige tutte le chiavi.

**Le NOVE voci** _(erano dieci fino a 08/2026 — vedi sotto dove è andata la 9)_.

| #   | Voce                                      | Chi la richiede                                                 |
| --- | ----------------------------------------- | --------------------------------------------------------------- |
| 1   | array ordinato dei campi                  | tutte                                                           |
| 2   | mappa completa degli id                   | tutte — non un prefisso (§2.3)                                  |
| 3   | predicato di abilitazione `(riga, campo)` | tutte — assorbe visibilità colonna, riga collegata, esclusioni  |
| 4   | riga non attraversabile                   | **solo Ordine cliente** (`lineIsReference`)                     |
| 5   | guardia sola-lettura                      | tutte — è dove divergono                                        |
| 6   | numero righe                              | tutte                                                           |
| 7   | creazione riga                            | tutte, con tre corpi diversi                                    |
| 8   | gancio di **cambio riga**                 | **solo Arrivo merce** (`commitLineAndSave`) — vedi precisazione |
| 9   | predicato «riga vuota»                    | tutte — **assente in Ordine fornitore**                         |

> La numerazione è stata **compattata**: l'ex voce 10 («riga vuota») è ora la 9. Chi cerca «la voce 10» in un testo più vecchio cerca questa.

**Voce 8 — è un gancio su OGNI cambio riga, non solo sull'uscita in avanti** _(precisato 08/2026)_. Il nome «uscita riga» inganna: in Arrivo merce `commitLineAndSave` avvolge **sia** `advanceToNextLine` **sia** `advanceToPreviousLine`. Scritto come «uscita», produce un'implementazione che aggancia il gancio in una direzione sola e lo dimentica nell'altra — e il difetto si vede solo risalendo con ↑, che è il gesto meno provato.

Il gancio è anche il posto dove vive il **tempismo del fuoco**: riceve `(riga, poi)` e decide quando chiamare `poi`. Arrivo merce lo fa a collegamento avvenuto; le altre due passano un rinvio di un tick, che è ciò che oggi fanno col loro `setTimeout` esplicito. Così **la classe non possiede nessun timer** — e §4.5-bis della specifica («il tempismo va ricreato deliberatamente») è soddisfatta dal chiamante, che è l'unico a sapere quando la riga nuova è resa.

**Dove è andata la voce 9 — «intercettazione Invio»** _(caduta 08/2026, verificata)_. Era richiesta da Arrivo merce per due casi speciali, e **sono spariti entrambi, per due strade diverse**:

- **Invio su «Q.tà» con articolo collegato** salta riga, cioè naviga: cade con la decisione «Invio non naviga» (specifica §4.5). Era già previsto.
- **Invio su «Cod. fornitore»** registrava il valore, e la mappa lo dava per superstite. **Non lo è più:** da quando quel campo è una cella codice condivisa, Invio lo gestisce la cella — decide da sé ed emette `commit` — e il form non lo vede mai. Il ramo rimasto in `onLineFieldKeydown` era **codice morto verificato**: quel gestore è agganciato a otto campi e `supplierCode` non è tra loro, né in template né in TS. Rimosso nello stesso passaggio, perché letto lì sembrava una regola da riportare dentro il punto unico.

**Conseguenza: Invio diventa uniforme nelle tre maschere.** Nessuna ha più niente da intercettare a quel livello, perché **la registrazione del valore è scesa dentro le celle**. La classe gestisce comunque Invio — `preventDefault` e ferma lì, che dentro un `<form>` serve anche a impedire l'invio implicito — ma è comportamento suo, non una voce che qualcuno le passa dall'esterno.

> **Come è passata inosservata**, perché la forma si ripete: il lavoro sui codici e il contratto della tastiera erano stati **verificati separatamente**, e la voce 9 viveva nell'incrocio. È lo stesso schema dei mock che dovevano rispondere diversamente alla ricerca e al caricamento per id: **se provi separatamente ciò che si incrocia, il difetto vive proprio nell'incrocio.**

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

0. ✅ **Fatto (08/2026) — riparare l'e2e rotto** (difetto 11). Finché era rosso, nessuna prova e2e dell'Arrivo merce distingueva una rottura vera. Rinominata la classe cercata in due punti; riscritta la guardia del test §8 come **elenco di ciò che deve esserci** invece che di ciò che non deve, perché una guardia scritta come divieto fallisce dicendo la cosa sbagliata. Trovati nella stessa passata **tre selettori morti fuori area** (`.login__alert`, `.sales-detail__totals`, `.sales-detail__badges`, due dei quali rendono rosse le rispettive spec) e **38 errori di tipo preesistenti** su `e2e/`: annotati, non toccati — fronte separato, da chiudere **prima del passo 3**, che è quando il lavoro comincia a produrre rossi propri.
1. ✅ **Fatto in parte (08/2026) — i difetti in `domain/`**. Rimossa `focusInput()` da entrambe le celle (§3). Il difetto 5 **non è stato corretto**: la decisione sui campi codice lo rende inesistente (§9).
   1-bis. ✅ **Fatto (08/2026) — i campi codice smettono di cercare** (§3-bis, §3-ter). Andava **prima** della classe, non dopo: cambia il contratto che la classe dovrà esporre — la cella codice emette `suggestionNavigate` ed è nato un pannello di scelta che prima non c'era. Scrivere la classe contro un comportamento che stava per cambiare l'avrebbe fatta nascere già da rifare.
   **Tre commit distinti**, non due: il comportamento nuovo sul pannello esistente (Arrivo merce), poi la sostituzione della `<ul>` scritta a mano con `document-line-suggestions`, poi il percorso di conferma sulle altre due maschere **con l'estrazione del pezzo condiviso** — che ha riportato anche l'Arrivo merce sulla versione comune. Separati perché, insieme, una rottura non direbbe se è la regola o l'estrazione.
2. **La classe con il suo spec, senza innestarla.** Rischio zero. _Attenzione: la copertura esclude i `*.component.spec.ts`, quindi questo file **entra nel gate**. Senza il suo spec la verifica completa fallisce, e alzare la soglia è vietato dalle regole._
3. **Ordine cliente** — porta la semantica, è l'unica che esercita la voce 4, non ha il gancio asincrono, ha la rete di test migliore, e copre quattro tipi documento.
4. **Ordine fornitore** — il contratto arriva collaudato; qui si aggiunge la voce 10 e si chiudono i difetti 2, 3, 9.
5. **Arrivo merce per ultima** — è l'unica che _aggiunge_ voci al contratto (8 e 9), è la più grande, ed è l'unica con l'ordinamento righe che rimescola gli indici sotto il fuoco.

### 11.3 Test minimi

Nel file dello store, **dieci** casi: l'ordine ricevuto comanda; un campo disabilitato non è una fermata; la mappa si interroga per campo; `rowDown` conserva la colonna; crea sull'ultima riga con contenuto; **non** crea sulla riga vuota; `rowUp` sulla prima riga non fa nulla; la riga saltata viene scavalcata in entrambi i versi; con sola-lettura nessuna creazione e nessuno spostamento; il gancio di cambio riga gira **prima** del fuoco.

_Erano undici: «`onEnter` che ritorna vero ferma il giro» è caduto con la voce 9 (§10). Non c'è più un `onEnter` da passare._

Un test per maschera nei rispettivi spec («il fuoco atterra dove deve»): non entrano nel gate, ma sono la rete del comportamento. E un e2e: inserire due righe usando **solo** Tab e ↓.

---

## 12. Rete di test — stato reale

### 12.0 ⚠️ Limite noto del gate di copertura — un file nuovo può entrare scoperto

Registrato perché **non riguarda un file solo**, e perché il gate, se lo si legge male, dà una sicurezza che non ha.

**Il fatto** _(misurato 08/2026)_. Le soglie di `test:coverage` sono **globali**, non per file: 80% righe, 75% rami sull'intera codebase. Un file nuovo entra nella media, e la media lo porta. La classe del giro del fuoco è stata scritta con tredici casi e copriva il **60%** del proprio file: `npm run test:coverage` era **verde**, perché il resto della codebase compensava. Nessun controllo automatico lo avrebbe segnalato.

**Perché è peggio di quanto sembra.** Il file scoperto è sempre quello **nuovo**, cioè quello che nessuno ha ancora usato in produzione e su cui non esiste esperienza. La copertura protegge di più proprio dove serve di meno, e il numero verde sul totale dice il contrario.

**La contromisura, ed è un gesto, non uno strumento: la copertura di un file nuovo si misura SUL FILE, non sul totale.**

```
npx ng test --watch=false --coverage --include "**/<il-file>.spec.ts"
```

La tabella che esce riguarda solo ciò che quello spec tocca: se il file nuovo non è vicino al 100%, mancano casi — e vanno scritti prima del commit, non «quando si abbassa la media». Sulla classe del fuoco questo passaggio ha portato i casi da tredici a ventisei e la copertura da 60% a 100% righe / 96,7% rami.

**Non si alza la soglia globale per accorgersene**: la soglia globale non può distinguere un file nuovo scoperto da uno vecchio ben coperto, ed è per questo che alzarla non è la risposta.

---

**Zero copertura sulla NAVIGAZIONE** _(mis. 08/2026)_. I tre spec di componente non contengono `keydown`, `focus`, `Tab`, `ArrowUp`/`ArrowDown`, `advanceToNextLine` né `LineFocus`. In `e2e/` l'unico uso di tastiera è un `Escape`. È il fronte che il punto unico dovrà coprire, ed è ancora tutto da fare.

**La conferma dei codici invece è coperta** _(fatto 08/2026)_, e non per gentilezza: i suoi tre pezzi vivono in `domain/` e **entrano nel gate di copertura**, che senza spec sarebbe fallito.

| File                                | Casi | Cosa sorveglia                                                                                              |
| ----------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------- |
| `document-code-match.util.spec`     |    9 | corrispondenza esatta sui quattro campi; niente parziali; il codice articolo ne restituisce più d'una       |
| `document-code-lookup.store.spec`   |    8 | la scelta si apre sulla prima voce e nella sola cella che l'ha aperta; frecce ai capi; la riga sa di averla |
| `document-code-lookup.service.spec` |    8 | **i tre esiti**; l'ambiguo non passa dall'endpoint; mai `supplierId`; l'errore di rete degrada a «nessuna»  |

Più **due casi per maschera** negli spec di Ordine cliente e Ordine fornitore — «più corrispondenze aprono la scelta» col suo **controllo inverso** («una sola aggancia»), senza il quale il primo passerebbe anche se la scelta si aprisse sempre. Non entrano nel gate, ma sono la rete del comportamento: la regressione da cui vengono era muta, ed è così che era passata inosservata.

Le due celle condivise non hanno spec. `app-select-menu` non ha spec: le sue uniche verifiche automatiche sono le chiamate e2e legate ai ruoli ARIA. `document-line-suggestions` ha il suo.

### 12.1 Il fronte `e2e/` — ✅ chiuso (08/2026), tranne una specifica

**`tsc -p e2e/tsconfig.json` è verde.** Prima erano **38 errori**, e finché c'erano non esisteva modo di sapere se un helper era rotto se non lanciando la suite intera con app e segreti. È il motivo per cui questo fronte andava chiuso **prima** di innestare la classe della navigazione: da lì in poi i rossi nuovi si sarebbero mescolati a questi.

- **37 erano una sola forma**: `process.env.X` invece di `process.env['X']` (`noPropertyAccessFromIndexSignature`), su 17 variabili in sei file. Conversione meccanica.
- **1 era altro**: in `e2e/helpers/a11y.ts` il tipo locale dichiarava `impact?: string` mentre axe può restituire `null`. Allargato invece di convertire al confine — quel tipo esiste per descrivere l'uscita di axe, quindi la descrive.

**Selettori morti**: erano **quattro**, non tre — il primo controllo guardava solo le classi e non gli id.

- `.gl.login__alert` → sostituito con `getByRole('alert')`: l'errore di accesso è un `app-inline-banner`, che a tono errore espone quel ruolo. **Si aggancia il ruolo, non la classe** — una classe cambia con una rinomina e il test smette di guardare in silenzio, che è esattamente ciò che era successo.
- `#sales-general`, `#sales-lines`, `.sales-detail__totals`, `.sales-detail__badges`, più `h1.sales-detail__title` nel suo helper → **non è una rinomina**: in `src/` non esiste più nulla che si chiami `sales-detail__`, e nella cartella non c'è un componente di dettaglio vendita. La schermata provata **è stata sostituita**, e `e2e/sales-detail.spec.ts` è rimasta indietro per intero: tre test più l'helper che li apre.
  ✅ **Fatto (08/2026, commit `32dbf14`)**: `test.describe.skip` con la nota di lavoro in testa al file — dice che la schermata è stata sostituita, elenca i cinque riferimenti che non esistono più, e dice cosa fare (riscriverla contro il dettaglio vendita attuale, poi togliere la nota e lo `skip`). Non «test obsoleto, da rivedere»: chi la trova sa cosa fare. Marcata saltata invece che cancellata perché l'intento dei tre casi può servire ancora. _(Questa riga ha detto «non ancora eseguito» più a lungo del dovuto: la correzione era stata fatta nello stesso commit che la dichiarava da fare.)_

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
