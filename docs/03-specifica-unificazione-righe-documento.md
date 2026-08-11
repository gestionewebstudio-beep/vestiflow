# Specifica — Unificazione righe documento, navigazione da tastiera, U.M. e ricerca

> Stato: decisioni chiuse, in attesa di esecuzione. Documento di sola progettazione — nessun codice scritto.
> Metodo: verificare il vivo → decidere insieme → far analizzare a Claude Code → approvazione → esecuzione in VS Code.
> **Tutto il lavoro va su un BRANCH DEDICATO.**

> **Come leggere questo documento — decisioni vs. fatti tecnici.**
> Il documento nasce da due fonti diverse, che vanno distinte perché hanno peso diverso:
>
> - **[DECISIONE]** — scelta di prodotto di Luigi. Vale perché è stata presa; non si rimette in discussione in fase di esecuzione.
> - **[VERIFICATO: file/rif]** — fatto sul codice controllato da Claude Code, con riferimento. Affidabile.
> - **[DA VERIFICARE]** — affermazione tecnica plausibile ma **non ancora confermata sul codice**. Va controllata prima di agire.
>
> Motivo: la chat che ha redatto questo documento **non vede il codice** — quando le serviva un dettaglio tecnico non verificato, poteva colmarlo per verosimiglianza (plausibile e coerente, ma a volte falso; è già successo più volte, sempre corretto leggendo i file). Regola operativa: **qui si decide, sul codice si verifica.** Un fatto tecnico senza riferimento a file/riga è da trattare come [DA VERIFICARE] finché Claude Code non lo conferma.

---

## 0. Impatto database (da leggere per primo)

> Le migration si applicano sul **branch dedicato**, coi dati di test, dove sbagliare non costa. La migration non banale (U.M.) va **concordata col collega** prima di toccare il database condiviso: il codice su un ramo è inerte, ma una migration agisce subito su tutti gli ambienti.

La maggior parte del lavoro è **frontend puro**. Gli interventi sul database sono pochi e tutti **additivi** (aggiungono, non tolgono né rinominano). In ordine di peso:

| Blocco                                                | Database                                                 | Peso    |
| ----------------------------------------------------- | -------------------------------------------------------- | ------- |
| **Unità di misura creabile (§4.3-ter)**               | Tabella nuova per-tenant + RLS (modello `PaymentOption`) | Medio   |
| Campo U.M. sulla riga documento dove manca            | Colonna additiva su `DocumentLine` e `SupplierOrderLine` | Leggero |
| Ordine fornitore — ordinamento/drag righe             | Colonna `lineNumber` additiva                            | Leggero |
| Navigazione tastiera (Tab, frecce, mouse)             | No                                                       | —       |
| Pannello "Colonne" (interruttore)                     | No                                                       | —       |
| Nome cliccabile nella ricerca                         | No                                                       | —       |
| Ordinamento righe per contenuto — 5 tipi su 6         | No                                                       | —       |
| Spostamento riga col drag — dove `lineNumber` c'è già | No                                                       | —       |

**Nota:** lo **spostamento colonne** (data-driven) è stato **tolto dallo scope** (vedi §6) — con lui sono spariti il pezzo frontend più grosso del piano e ogni impatto grafico. Quel che resta sul database è modesto: la tabella U.M. (modello leggero `PaymentOption`) e due-tre colonne additive.

**Colonna posizione (`lineNumber`) — esiste già quasi ovunque.** Attenzione: `CustomerOrderFormComponent` si **biforca su `isRegistryDocument`** — solo l'**Ordine cliente** passa da `SalesOrderLine`; **Preventivi, DDT vendita e Scarico manuale salvano come documenti → `DocumentLine`.**

| Maschera                                     | Modello riga        | `lineNumber` |
| -------------------------------------------- | ------------------- | ------------ |
| **Ordine cliente**                           | `SalesOrderLine`    | ✔            |
| **Preventivi, DDT vendita, Scarico manuale** | `DocumentLine`      | ✔            |
| Arrivi merce (e altri tipi)                  | `DocumentLine`      | ✔            |
| **Ordine fornitore**                         | `SupplierOrderLine` | **assente**  |

Il blocco righe (ordinamento + spostamento) **non è tutto dietro il database**: cinque tipi su sei hanno già `lineNumber` → migration zero. Solo Ordine fornitore richiede la colonna additiva.

> **Conseguenza per §4.3-ter (la colonna U.M. vale il doppio):** siccome Preventivi, DDT e Scarico manuale usano `DocumentLine` (non `SalesOrderLine`), aggiungere la colonna U.M. a `DocumentLine` copre **Arrivi merce + Preventivi + DDT + Scarico manuale** — quattro tipi, non solo gli Arrivi. Solo `SupplierOrderLine` resta a parte. Cioè: la colonna U.M. va aggiunta a **due modelli** (`DocumentLine`, `SupplierOrderLine`), non a tre, e `SalesOrderLine` ce l'ha già.

**Il gesto del drag è quasi tutto da propagare:** `cdkDropList`/`cdkDrag` esistono **solo in Ordine cliente**; Arrivi merce e Ordine fornitore hanno zero. Il _salvataggio_ della posizione c'è quasi ovunque, il _gesto_ del trascinamento va portato copiando il precedente di Ordine cliente. Due cose distinte — "ha la colonna" ≠ "ha il drag".

---

## 1. Contesto, obiettivo e principi di fondo

La frase che comanda tutte le scelte: **semplificare il codice e unificare le parti che possiamo.** La navigazione da tastiera è il sintomo; la malattia è che la logica di riga (`advanceToNextLine` e affini) è **riscritta in tre maschere** e già diverge. Continuare a decidere schermata per schermata produce la quarta variante, non l'uniformità.

**Criterio per ogni dubbio:** vince l'opzione che lascia **meno codice** e **più uguale** tra i documenti.

### Fonte di verità e direzione di fondo

**Questo documento è la fonte di verità.** Dove il codice diverge da quanto deciso qui, l'obiettivo è **allinearlo**, non preservarlo né conciliarlo. La direzione che orienta ogni scelta: **massima condivisione di logiche e funzionamenti tra i documenti — meno cose costruite, database più leggero.** Quando si trovano due modi di fare la stessa cosa, si tende a un modo solo, condiviso.

**Come si "pulisce" — NON è rimozione cieca.** Ciò che sembra non più utile non si cancella d'istinto. Si procede con **controlli**: (1) mappare **chi usa** quella cosa nel codice, (2) valutare **se ha ancora senso** che esista, (3) **poi** decidere. La rimozione è l'esito di un'analisi, non il punto di partenza. Coerente col metodo del progetto (analizza prima di agire) e col principio "avvisi, mai blocchi": Claude Code riporta cosa considera obsoleto e perché, prima che si decida di toglierlo.

> **Lezione registrata (trappola dei "token orfani"):** un controllo automatico sui token/simboli fantasma trova ciò che è _dichiarato e non usato_ — **non** ti dice se stai togliendo un _uso legittimo_. "Orfano nella mia frase" ≠ "orfano nel codice". Verificare sempre l'uso reale prima di rimuovere. (Caso concreto: §6.)

### Principi già stabiliti che questo lavoro rispetta

- Decisioni prese una volta, applicate ovunque — nessuna eccezione per tipo di documento.
- I documenti (di questa lista) devono somigliarsi. **Ordine cliente è il riferimento "quasi completo".**
- I controlli sono avvisi, mai blocchi — salvo dove una modifica è priva di senso.
- Nessuno stato bozza: il documento è confermato o non esiste. Il salvataggio avviene solo col pulsante, mai come effetto di una navigazione.
- Il documento è una **fotografia**: la riga cattura i valori all'inserimento (prezzo, costo, e ora U.M.) e li tiene per sé, indipendenti da come cambia l'anagrafica dopo.

### Si unifica il COMPORTAMENTO, non i DATI

L'unificazione riguarda i **meccanismi di interazione** — navigazione tastiera, celle a selezione, ordinamento, drag, striscia icone — che devono essere identici su tutti i documenti elencati. **Non** riguarda il _contenuto_ né la _natura_ dei documenti:

- alcuni sono **d'acquisto** (lavorano su **costo** e **fornitore**): Ordine fornitore, Arrivo merce;
- altri sono **di vendita** (lavorano su **prezzo, sconto, margine** e **cliente**): Ordine cliente, DDT, Preventivi…

Le colonne, la logica IVA (acquisto vs vendita) e l'anagrafica collegata (fornitore o cliente) **restano specifiche di ogni tipo**. Il contratto del punto unico (§3-bis) è fatto apposta così: il meccanismo è condiviso, ma **ogni maschera gli passa i suoi campi**. Chi esegue **non** deve uniformare colonne o dati — solo il modo di interagirci.

### Una funzione si applica a TUTTI i documenti insieme, mai "di prova" su uno

Una funzione decisa qui si applica a **tutti i documenti elencati nello stesso passaggio**, o non si applica. Provare una funzione **su un solo documento** crea "rami diversi sotto" — una maschera che si comporta in un modo e le altre in un altro: è **esattamente la divergenza** che questo lavoro elimina (`advanceToNextLine` scritto in tre modi diversi). Il "provo su uno e vedo" è come nasce quella malattia.

_Unica eccezione (temporale, imposta da fuori):_ i documenti su **file contesi** dai rami del collega non si toccano finché quei file non sono liberi — è una separazione di **tempistica**, non una scelta di trattarli diversi. Vedi §2 (in sospeso: fatture, vendite/reso in negozio).

### Il perimetro include le VISTE — e mobile è un discorso a parte

**[DECISIONE, 11/08/2026]** Una decisione vale su un documento, non su «quel documento da computer». Se una funzione arriva sulla tabella e non sulla card, l'operatore ha lo stesso campo e lo stesso gesto che si comportano in due modi a seconda dello schermo: è la divergenza del punto precedente, spostata da un documento a una vista.

**Ma «vale ovunque» non vuol dire «si fa allo stesso modo».** Su un telefono non c'è la tastiera fisica, non c'è il passaggio del mouse sopra un elemento, e lo spazio è un altro. Un gesto che sul computer si fa con le frecce, su un telefono si fa **toccando**: cambia il meccanismo, non la regola.

**Regola operativa: ogni volta che si progetta un comportamento, si dice anche come funziona su mobile.** Se la risposta è «uguale», va bene — ma dev'essere una risposta, non una dimenticanza. È già successo che una funzione nascesse completa sul computer e muta sul telefono, e da telefono l'operatore non vedeva nulla e non sapeva perché.

_Perché conta qui più che altrove: questo è un gestionale che si usa in magazzino col telefono in mano. Una funzione che esiste solo su schermo grande non è una funzione a metà — manca proprio dove si lavora._

---

## 2. Perimetro: nove tipi, cinque componenti

| Tipi documento                                           | Componente                   | Celle condivise | Conteso                  |
| -------------------------------------------------------- | ---------------------------- | --------------- | ------------------------ |
| Ordine cliente, DDT vendita, Preventivi, Scarico manuale | `CustomerOrderFormComponent` | Sì              | No                       |
| Arrivi merce                                             | `GoodsReceiptFormComponent`  | Sì              | No                       |
| Ordine fornitore                                         | `SupplierOrderFormComponent` | Sì              | No                       |
| Proforma, Fattura, Fattura accompagnatoria               | `SalesDocumentFormComponent` | No              | Sì — fattura elettronica |
| Vendita al banco                                         | `StoreSaleRegisterComponent` | No              | Sì — cassa               |

**Quattro tipi sono già la maschera modello:** `sales-ddt/new`, `quote/new`, `manual-unload/new` caricano tutti `CustomerOrderFormComponent`. Per loro il lavoro di navigazione è **zero**.

### Documenti da allineare — subito

**Sette tipi, tre file, zero collisioni:** `customer-order-form` (Ordine cliente, DDT vendita, Preventivi, Scarico manuale), `goods-receipt-form` (Arrivi merce), `supplier-order-form` (Ordine fornitore). Nessuno toccato dai rami attivi del collega. Tutte le funzioni decise qui si applicano a **queste maschere insieme** (principio anti-divergenza, §1).

### Gli altri due — uno aspetta, l'altro è fuori _(chiarito 08/2026)_

- **Fatture (Proforma, Fattura, Fattura accompagnatoria)** — **rientrano nello standard**: nessuna regola di questo documento fa eccezione per loro. Ciò che resta da concordare non è _se_, ma _quando_: la maschera è contesa col lavoro sulla fattura elettronica, e le regole si applicano **quando quel ramo rientra**. Fino ad allora quanto scritto qui vale per loro come specifica, non come lavoro fatto.
- **Vendita e reso al banco — fuori perimetro, per natura.** Non è una maschera documento con righe da compilare: è un **carrello**, dove si aggiungono articoli scansionando e si incassa. La tastiera, l'ordinamento righe, il pannello suggerimenti e le celle condivise sono risposte a un problema che lì non si pone.
  È un'**esclusione dichiarata, non un pezzo mancante**: chi rileggerà l'elenco delle maschere allineate non deve concludere che una sia stata dimenticata.

Le Fatture sono anche l'unica maschera del perimetro che **non** usa ancora le celle condivise: lì l'allineamento è prima "adottare le celle condivise", poi la tastiera.

---

## 3. Il modello non è una maschera: è questa specifica

Preso alla lettera "il modello è Ordine cliente" sarebbe una **regressione** — Ordine cliente oggi non ha ↑, le frecce funzionano solo da alcune celle. Arrivo merce le ha ovunque. Quindi:

- **da Ordine cliente la semantica** — la freccia **non salva**;
- **da Arrivo merce la copertura** — le frecce funzionano **da ogni campo**.

Nessuna delle due è copiabile intera → serve un **punto unico** condiviso.

### 3-bis Forma e contratto del punto unico

**Forma già decisa dal repo:** una **classe senza dipendenze, istanziata come campo del componente**, in `src/app/domain/documents/state/`. Precedenti: `DocumentNumberConflictStore` (7 maschere), `DocumentPrefillErrorStore` (7), `DocumentProductPanelStore` (2). Regola: dentro vive **solo il meccanismo**; ciò che differisce resta nel form. Non una direttiva, non un service iniettabile.

Il file è `document-line-focus.store.ts` → `DocumentLineFocusStore<F extends string>`, **generico sul tipo del campo**. Un'unione piatta a 18 voci farebbe compilare `focusLineField(i, 'lot')` dentro Ordine cliente: la generica è l'unica forma che tiene il compilatore come rete.

**Il contratto ha NOVE voci** _(aggiornato 08/2026: erano dieci — la 9 è caduta, vedi sotto. La numerazione è stata compattata, quindi l'ex voce 10 è ora la 9)_:

| #   | Voce                                          | Chi la richiede                                      |
| --- | --------------------------------------------- | ---------------------------------------------------- |
| 1   | array **ordinato** dei campi                  | tutte                                                |
| 2   | **mappa completa degli id** (non un prefisso) | tutte                                                |
| 3   | predicato di abilitazione                     | tutte                                                |
| 4   | riga non attraversabile                       | solo Ordine cliente                                  |
| 5   | guardia sola-lettura                          | tutte                                                |
| 6   | numero righe                                  | tutte                                                |
| 7   | creazione riga (corpi diversi)                | tutte                                                |
| 8   | gancio di **cambio riga**                     | solo Arrivo merce                                    |
| 9   | **predicato "riga vuota"**                    | tutte — **assente in Ordine fornitore, da scrivere** |

Note vincolanti:

- **Voce 2 — serve la mappa, non un prefisso.** I suffissi degli id sono irregolari nella stessa maschera (`co-price-` ma `gr-selling-`; `gr-supplier-code-` ma `po-suppcode-`; `co-serials-` ma `gr-serial-` al singolare). Un prefisso+indice non basta.
- **Voce 8 — il gancio è su OGNI cambio riga, non solo sull'uscita in avanti.** In Arrivo merce `commitLineAndSave` avvolge sia la discesa sia la risalita. Scritto come "uscita", produce un'implementazione che funziona in una direzione sola, e il difetto si vede solo risalendo con ↑ — il gesto meno provato. È anche il posto dove vive il **tempismo del fuoco**: riceve `(riga, poi)` e decide quando chiamare `poi`, così la classe non possiede nessun timer.
- **Voce 9 — "riga vuota" di Ordine fornitore = nessun articolo selezionato** (decisione presa; nelle altre due il predicato esiste già).

**La vecchia voce 9 — perché è caduta, e cosa NON è caduto con lei** _(verificato 08/2026)_.

Bundlava due cose diverse, ed è la ragione per cui serve distinguerle:

- **L'intercettazione di Invio — CADUTA.** I suoi due casi speciali di Arrivo merce sono spariti entrambi: Invio su "Q.tà" con articolo collegato **navigava**, e cade con §4.5 ("Invio non naviga"); Invio su "Cod. fornitore" **registrava il valore**, e non passa più dal form — da quando quel campo è una cella codice condivisa, Invio lo gestisce la cella. Il ramo rimasto nel gestore era codice morto verificato (il gestore è agganciato a otto campi, e quello non è tra loro), ed è stato rimosso. **Invio è ora uniforme nelle tre maschere**, perché la registrazione del valore è scesa dentro le celle.
- **Gli ingressi nominali — NON caduti, e non erano una voce.** Che il punto unico debba **esporre** `next()`, `previous()`, `rowDown()`, `rowUp()`, `focusField()` resta obbligatorio: le celle condivise non consegnano l'evento, decidono da sole ed emettono esiti. Ma è un **requisito sulla forma della classe**, non qualcosa che una maschera le passa — e stava nella tabella del contratto solo perché era stato scritto insieme all'altro. Ora sta scritto dove appartiene, qui sotto.

**Entrate nominali obbligatorie** (requisito di forma, non voce del contratto): `next()`, `previous()`, `rowDown()`, `rowUp()`, `focusField()`. `rowDown`/`rowUp` ricevono **il campo**, perché conservare la colonna lo richiede: il template lo conosce staticamente, quindi si aggiunge nel binding senza toccare le celle.

---

## 4. Navigazione da tastiera (cuore del Giro 1)

### 4.1 Tab

- Sposta di cella, **sinistra→destra**, seguendo l'ordine delle colonne a schermo.
- All'ingresso, **seleziona tutto il valore**, pronto a sovrascrivere.
- **Cambio rispetto a oggi:** il Tab lascia il cursore in posizione arbitraria; il nuovo comportamento (seleziona-tutto) cambia un gesto **già in uso**. Confermato e voluto (comportamento da gestionale).

### 4.2 Frecce ← / → (campi di testo)

- Primo colpo: valore evidenziato. Secondo colpo nella stessa direzione: cursore di scrittura al bordo corrispondente.

**A due tempi anche per uscire dal campo** _(deciso e applicato 08/2026)_. Finché il cursore ha strada dentro il campo, la freccia lo muove e basta. Solo quando il cursore è **già al bordo**, e non c'è testo selezionato, la freccia porta al campo accanto: → a quello a destra, ← a quello a sinistra. È la regola che chiunque conosce dai fogli di calcolo, e l'alternativa — uscire al primo colpo — renderebbe impossibile correggere una lettera in mezzo a un nome.

**→ dall'ultimo campo crea la riga nuova**, con la **stessa** condizione di Tab e ↓: solo se la riga corrente ha contenuto. La regola della creazione appartiene all'**effetto**, non al gesto: tre tasti che fanno nascere la stessa riga nello stesso posto non possono avere tre regole diverse (vedi §4.4).

**Fin dove arriva la regola — è il suo DOMINIO, non un'eccezione.** Sui campi numerici — quantità, sconto, aliquota — il browser **non dice** dove sia il cursore: non è un'informazione che si possa chiedere. Lì la freccia porta subito al campo accanto, al primo colpo.

Non è una deroga ai due tempi: è il confine di dove quella regola si può applicare. E il confine cade in un posto ragionevole — sono campi di poche cifre, dove non c'è una parola da percorrere, e chi li compila si aspetta esattamente quello che fa un foglio di calcolo.

### 4.3 Celle a selezione (IVA e U.M.) — "ricerca e selezione"

> Sostituisce la vecchia regola "sulle tendine la freccia cambia voce". La cella non è una tendina da sfogliare: è un **campo a ricerca-e-selezione**, rientra nel comportamento normale dei campi.

Funzionamento (uguale a vista per IVA e U.M.):

- Entri (Tab) → valore corrente **selezionato**.
- **Digiti** → si apre la tendina e la digitazione **filtra** le voci. **[DA VERIFICARE → in realtà DA CORREGGERE]**: il filtro esistente cerca il testo **ovunque** dentro etichetta e descrizione — digitando "1" pescheresti anche "22r: Imp. 22% acquisti rev. charge art. 17" (per l'"1" in "art. 17"), rumore proprio nel caso a un carattere che è quello più usato. **Serve dare precedenza al codice:** prima le voci il cui _codice_ inizia con quanto digitato, poi il resto. ⚠️ Chi implementa riuserà la funzione di filtro esistente e otterrà il comportamento sbagliato senza accorgersene — il filtro va **cambiato**, non riusato com'è.
- **Selezioni** una voce (Invio/click) → entra nella cella.
- In fondo, una voce **"» Altro…"** apre il **pannello gestione voci** (crea/elimina/modifica). Deve stare **in coda fissa, FUORI dalle opzioni filtrate** — altrimenti il filtro la mangia appena digiti (trappola verificata).

**Regola sul testo libero — OPPOSTA tra le due** (stessa UX, validazione diversa sotto):

- **U.M.** → testo libero **ammesso** (insieme aperto: pz, conf, paio, mazzo…). La tabella suggerisce, non obbliga. Vedi §4.3-ter.
- **IVA** → testo libero **non ammesso**: un valore inventato non ha aliquota/natura, non è calcolabile né confermabile. Insieme chiuso, normato.

Frecce ←/→ su queste celle: **cambiano cella al primo colpo, senza il secondo tempo** del §4.2 (su una cella a selezione il cursore di scrittura non ha senso — per l'IVA; per l'U.M. il testo libero c'è ma la navigazione tra celle resta prioritaria). Da scrivere esplicitamente: è il tipo di regola che chi implementa altrimenti inventa.

### 4.3-bis Blocco `app-select-menu`: sostituzione locale, preceduta da estrazione

`app-select-menu` non ha `inputId`, non mette id sul trigger (è un `<button>`), non ha `focus()` pubblico, non emette eventi tastiera. Con la vecchia regola era non implementabile; col modello §4.3 va **sostituito** nelle celle documento (IVA, U.M., prodotto-fornitore).

**I numeri smontano l'ipotesi "estendi il componente":**

- 183 istanze in 36 template; nel Giro 1 le celle interessate sono **4 su 183 (2,2%)**.
- Il trigger è un `<button>`: **dentro un bottone non c'è testo da selezionare** (§4.1). Farlo davvero richiede un `<input role="combobox">`, che **rompe tutti e 22 i punti e2e** del componente. Un type-ahead simulato non basta.

**Decisione: strada (1) sostituzione locale, MA preceduta da estrazione.**

- Precedente giusto: **`date-input`** — ha `inputId`, `triggerKeydown`, un vero `<input>`, e **funziona già dentro una cella riga** (`gr-lot-date`). È la base da cui partire.
- Le due celle gemelle hanno ~120 righe TS **identiche**; il pannello suggerimenti è **già estratto** (`document-line-suggestions`) ma usato solo da 2 dei 5 posti. Scrivere la terza cella com'è oggi produrrebbe **la terza copia** — dentro il lavoro che si chiama "semplificare". **Estrarre prima, poi aggiungere la terza cella.**

**✅ Fatto per la cella «Nome prodotto» dell'Ordine fornitore** _(11/08/2026)_. Era l'unica delle tre maschere dove l'articolo si sceglieva da una **tendina** invece di digitarne il nome: ora ha la stessa cella di ricerca dell'Ordine cliente e dell'Arrivo merce, con il pannello descritto in §4.12.

La previsione dell'estrazione si è avverata, e in un modo che vale la pena registrare: cercando di scrivere la terza copia si è scoperto che **le due esistenti non erano uguali fra loro** — quattro comportamenti diversi, nessuno dichiarato. Il pezzo condiviso non ha risparmiato righe: ha reso visibile una divergenza che nessuno sapeva di avere.

Con la cella arriva anche il resto: il campo «Nome prodotto» **rientra nel giro del Tab** dell'Ordine fornitore (ne era uscito perché una tendina non è un campo su cui il cursore possa atterrare), la lente apre la ricerca articolo a tutta pagina, e «Apri anagrafica» porta alla scheda dell'articolo collegato.

**Restano da sostituire** le celle a tendina di IVA e U.M., in tutte le maschere.

### 4.3-ter Unità di misura — modello dati

> Comportamento **unico in tutti i documenti elencati**. Ogni maschera che oggi fa diverso si **allinea** a questo; i comportamenti attuali sono materiale d'esecuzione per Claude Code (cosa aggiungere, cosa rimuovere), non varianti da mantenere.

**Cos'è:** la U.M. commerciale/di vendita (pz, conf, kg, m…), colonna nella riga documento.
**Fuori scope:** dimensioni e peso dell'articolo (cm, kg) — sono anagrafica prodotto, scheda "Dim. e peso", non riga documento.

**Comportamento target (uguale ovunque):**

- Cella a ricerca-e-selezione (§4.3), **testo libero ammesso**, "» Altro…" per gestire le voci.
- Valore **ereditato dall'articolo** come default all'inserimento.
- **Modificabile sulla riga**; la modifica **resta nel documento**, non torna all'anagrafica — come il prezzo (il documento è una fotografia).

**Struttura dati — ESISTE GIÀ, non va costruita.** `Product.unitOfMeasure` e `SalesOrderLine.unitOfMeasure` sono `String`, senza `@IsIn`/enum: il testo libero passa già. La tabella U.M. diventa un **elenco di suggerimenti per-tenant**, NON un'autorità referenziale: **nessuna FK dalle righe** → nessun orfano, nessuna cascata, **nessun "disattiva invece di cancella"**. Cancelli una voce: le righe non se ne accorgono, hanno sempre avuto solo la stringa (**degrada a testo**, esattamente il modello Danea).

**Modello da copiare = `PaymentOption`, NON l'IVA.** L'IVA è troppo grande (19 colonne, snapshot JSON a 10 campi, FK con SET NULL) perché un codice IVA è un oggetto composto che cambia i soldi. Per una **stringa** la forma giusta esiste già: `PaymentOption` — 7 colonne, nessun calcolo, "le anagrafiche salvano il NOME della voce". Quindi: tabella ~7 colonne, niente FK, niente JSON, niente guardia di eliminazione. RLS obbligatoria — **già sorvegliata** da `scripts/check-rls.mjs` (fa fallire la build se una tabella nuova non ce l'ha).

**IVA — già risolta, e NON con la disattivazione.** `vatCodeId String? @relation(onDelete: SetNull)` + `vatSnapshot Json?` (codice/natura/aliquota al salvataggio). Cancelli un codice: il link si azzera, lo snapshot conserva i valori storici. È già il "documento fotografia" per un dato strutturato. Da conoscere, non da costruire.

**La fotografia va ACCESA in Ordine cliente.** Oggi la colonna `SalesOrderLine.unitOfMeasure` c'è e viene scritta, ma la **lettura mette sempre l'anagrafica davanti** (e `Product.unitOfMeasure` è NOT NULL default `pz`, quindi un valore c'è sempre) → lo snapshot salvato **non si vede mai**. Rendere il documento una fotografia non è solo "estendere alle altre due": è **invertire quella precedenza** dove la colonna già esiste. È una riga, ma è il punto in cui la regola entra in vigore.

**Campo U.M. sulla riga — da aggiungere a due modelli.** `SalesOrderLine` (Ordine cliente) ce l'ha; **`DocumentLine`** (Arrivi merce + Preventivi + DDT + Scarico manuale — quattro tipi) e **`SupplierOrderLine`** (Ordine fornitore) **no**. Colonna additiva su due modelli, copre cinque tipi.

**Seed:** dato il testo libero, ci sono probabilmente valori fuori dai sei della costante `COMMON_UNIT_OF_MEASURE`. Il seed include i valori distinti realmente presenti per tenant → **misurare sul database prima di scrivere la migration**. (Con dati di test è banale, ma il passo resta.)

**Verifiche per Claude Code:** (a) conferma struttura `PaymentOption` come modello; (b) `DocumentLine`/`SupplierOrderLine` — aggiungere la colonna U.M.; (c) valori distinti presenti per il seed.

### 4.4 Frecce ↑ / ↓

- **Conservano la colonna:** da "Nome" a "Nome" sopra/sotto; da "Prezzo" a "Prezzo".
- **↓** su riga esistente: riga sotto, stessa colonna. In fondo **e** con la riga corrente compilata: **crea** nuova riga, focus da sinistra. Su riga vuota appena creata: **non fa nulla**.
- **↑** sulla prima riga: **non fa nulla**.
- **Uscendo in alto dalla riga appena nata e ancora vuota, la riga sparisce** _(deciso 08/2026 — è la terza parte di una regola che ne aveva scritte solo due)_.
  È la **simmetrica** della creazione. Le tre parti si leggono insieme: ↓ fra righe con contenuto scende restando nella stessa colonna; ↓ dall'ultima riga con contenuto fa **nascere** la riga nuova; risalendo da quella riga, se non ci si è scritto niente, la riga **sparisce**. Se esiste solo perché si è scesi, e si risale a mani vuote, non la si voleva.
  **La regola descrive l'effetto, non un tasto**, esattamente come per la creazione: risalire sono ↑, Shift+Tab dal primo campo e ← dal primo campo, e fanno tutti e tre la stessa cosa. Dire «↑ toglie la riga» produrrebbe la stessa divergenza fra gesti che questa specifica toglie fra documenti.
  Sparisce **solo** la riga nata dalla navigazione e mai compilata. Non una riga vuota lasciata lì di proposito — quella nessuno l'ha creata scendendo. Non una riga che nel frattempo ha smesso di essere l'ultima. E non una riga in cui si è scritto e poi cancellato: il segno di «appena nata» si consuma appena qualcosa la riempie. Su un documento bloccato non sparisce niente, mentre il fuoco continua a girare.
- **Ripiego riga non attraversabile:** se la riga sotto è "documento collegato" (non ha quella colonna), si **scavalca** — il fuoco va alla riga successiva ad essa, stessa colonna. La riga "documento collegato" non è una fermata.
- **Ripiego colonna mancante — REGOLA, non dettaglio** _(aggiunta 08/2026)_: se la riga di destinazione **esiste ed è attraversabile** ma quel campo lì è disabilitato — succede sulle righe collegate a un articolo, dove i codici diventano testo — il fuoco va al **primo campo attraversabile di quella riga**. Non si scavalca la riga: la riga è una fermata legittima, è la colonna che manca.
  È distinto dal ripiego qui sopra e va tenuto distinto: uno riguarda righe che non sono fermate, l'altro colonne che su quella fermata non ci sono. Senza questa regola il fuoco si perde — che è il difetto da cui l'intero lavoro è partito.

> **TRE cose che cambiano un gesto in uso — da dichiarare, o si scambiano per regressioni:**
>
> - "↓ crea solo se la riga ha contenuto" **è NUOVO**: oggi `advanceToNextLine` crea sempre in fondo, senza guardare il contenuto.
> - **↓ cambia firma:** oggi va **sempre alla prima cella** della riga sotto, in tutte e tre. "Conservare la colonna" è un cambio su un gesto in uso, non un travaso.
> - **Anche il Tab dall'ultimo campo crea solo se la riga ha contenuto** _(aggiunta 08/2026)_. Oggi tutte e tre creano **sempre**: attraversando col Tab una riga vuota se ne aggiunge un'altra.
>   La regola della creazione è **una sola**, e non appartiene alla freccia: appartiene all'**effetto**. Tab dall'ultimo campo e ↓ in fondo fanno nascere la stessa riga nello stesso posto, quindi non possono avere due regole diverse — sarebbe la stessa divergenza che questo lavoro toglie, applicata ai gesti invece che ai documenti.

### 4.5 Invio — registra e resta (NON naviga, NON salva)

**[DECISIONE]** Su tutti i documenti elencati, **Invio registra il valore digitato e resta sulla cella.** Non sposta di cella, non salta riga, non crea righe, non salva il documento. È puramente **conferma del valore**.

- **Registrare il valore** = prendere ciò che hai digitato e agganciarlo (es. il codice all'articolo). Questo sì, sempre. **Non** significa "chiudere la riga" né "passare oltre".
- **[Cambio da dichiarare]** Oggi in **Ordine cliente Invio fa la funzione di Tab** (naviga alla cella successiva). Va **cambiato**: Invio smette di navigare. La navigazione resta a **Tab** (cella successiva) e **frecce** (↓ riga sotto). Se non dichiarato, chi esegue lo scambia per regressione.
- **Nessun salvataggio su Invio, mai** — coerente col principio "il salvataggio è solo col pulsante". Qualsiasi maschera dove Invio oggi salva va allineata.

**Fin dove arriva la regola — è il suo DOMINIO, non un'eccezione** _(precisato 08/2026, eseguendola)_.

«Resta sulla cella» presuppone che la cella ci sia ancora. Su un campo codice, quando il codice trova **una** corrispondenza, l'articolo si aggancia e **la cella smette di essere un campo**: diventa il testo del valore collegato. Lì «restare» non è una cosa che si possa fare male o bene — non c'è più niente su cui restare, e il fuoco va comunque altrove.

Quindi la regola **morde dove la cella resta un campo**: nessuna corrispondenza (il valore digitato resta scritto e si rimane lì) e più corrispondenze (la scelta è aperta e si rimane lì). Con una corrispondenza sola il fuoco si sposta, e non è una deroga: è il limite di ciò che la frase può descrivere.

⚠️ Va scritto perché, letta senza questo, la regola sembra disattesa proprio nel caso più frequente — e chi la rilegge tra sei mesi «corregge» un comportamento corretto.

- **[DA VERIFICARE]** Ogni maschera "ha una cosa sua": quali gesti (freccia, Invio, Tab dall'ultimo campo) passano oggi da `commitLineAndSave`, per maschera. Serve per intervenire sulla **sola** freccia (§4.5-bis) e sul **solo** Invio senza rompere la registrazione del valore che Tab deve continuare a fare.

### 4.5-bis La freccia non salva

- Nessuna navigazione da tastiera persiste il documento. Salvataggio **solo col pulsante**.
- **[VERIFICATO]** `commitLineAndSave` **non salva** (nessuna scrittura HTTP) — collega i codici alla variante e scrive nel reactive form. Il nome **mente**: va rinominato, e vanno ripuliti due commenti su un autosave rimosso a luglio (o chi valuta crederà si tolga una persistenza).
- **[DA VERIFICARE] Tempismo del focus:** la chiamata asincrona interna oggi, per effetto collaterale, darebbe al DOM il tempo di rendere la riga nuova prima del focus. Reso sincrono, la freccia giù sull'ultima riga smetterebbe di dar focus alla riga creata. Le maschere sorelle avrebbero già un `setTimeout` con commento: il tempismo va **ricreato deliberatamente**. (Da confermare sul codice.)
- **[DA VERIFICARE]** Il metodo sarebbe raggiunto **anche da Invio e da Tab dall'ultimo campo**: per colpire la sola freccia va spezzato. (Vedi §4.5 — conferma per maschera.)

### 4.6 Mouse (a due tempi, coerente con la tastiera)

- **1° click:** seleziona tutto. **2° click:** posiziona il cursore senza cancellare. **Trascinamento** al primo ingresso: lasciato passare.
- Nota: "1° click seleziona tutto" **non** è nativo del browser (mette il cursore dove clicchi). Va costruito tenendo traccia se la cella aveva già il focus. **Select all'ingresso da tastiera, non al click** — la formulazione ingenua "seleziona al focus" cancellerebbe il valore al primo tasto dopo un click a metà cifra.

### 4.7 Vincolo architetturale — la porta che resta aperta

- Il punto unico **riceve l'ordine dei campi dall'esterno**, come dato — non cablato dentro.
- Nel Giro 1 gli si passa l'ordine fisso di oggi. **Questo è ciò che permette di togliere lo spostamento colonne ora (§6) senza chiuderlo per sempre:** se un domani servirà, gli si passerà l'array delle colonne e la logica di navigazione **non si tocca**.
- È la forma tecnica di "il Tab va sinistra→destra a prescindere dalla posizione": la tastiera non deve _sapere_ l'ordine, deve _riceverlo_.
- Guadagno: i tre elenchi di campi del focus scritti a mano (82 righe in Arrivo merce, 24 nelle altre) si **derivano** dall'array — il giro del Tab diventa la proiezione dei campi, semplifica.

> **Verificato — l'assunto che tiene aperta la porta di §6.** Anche senza il data-driven (tolto in §6), il giro si può derivare dalla configurazione delle colonne **senza toccare i template e senza cambiare il comportamento di oggi**, perché in tutte e tre le maschere l'ordine di fuoco è un **sottoinsieme dell'ordine delle colonne, nella stessa sequenza relativa** — nessuna maschera inverte due campi. Vale anche per Ordine fornitore (il caso dubbio): le colonne in posizione diversa tra config e schermo — Giacenza, Q.tà disp., IVA, Costo scontato — **non sono nel giro del Tab** (sono calcolate o sono la tendina IVA), quindi il sottoinsieme focalizzabile ha lo stesso ordine. Se un domani servirà lo spostamento colonne, il giro seguirà l'array senza riscrivere la navigazione.

### 4.8 I campi codice non cercano: confrontano

**[DECISIONE, 08/2026 — vale su tutti e sette i tipi documento]**

Chi digita un codice **sa già cosa cerca**. Il campo codice non è un campo di ricerca: mentre si scrive non succede niente — nessun elenco che si apre, nessuna attesa, nessun suggerimento. Il confronto col catalogo avviene **alla conferma** (Tab o Invio), e cerca la corrispondenza **esatta**.

Gli esiti sono **tre**, e vanno tenuti distinti:

| Corrispondenze | Cosa vede l'operatore                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| **Una**        | l'articolo si aggancia alla riga                                                                     |
| **Più d'una**  | si apre una **scelta** fra quelle corrispondenze — è l'operatore a dire quale                        |
| **Nessuna**    | il valore digitato **resta scritto** e la riga prosegue: non è un errore, è un articolo da compilare |

**Cosa cambia rispetto a prima**, ed è tutto da dichiarare o si scambia per regressione:

- Digitando due caratteri partiva una ricerca e compariva un elenco che si aggiornava mentre si scriveva. **Non succede più.**
- Quando il codice non veniva trovato, il campo si comportava **anche da ricerca per nome** — digitando «100» comparivano i «Jeans 100 slim». Non era scritto da nessuna parte e capitava solo in caso di fallimento: **tolto**.
- Un codice **corretto ma condiviso da più articoli** si comportava come un codice inesistente: nessun aggancio e nessuna spiegazione. Era la peggiore delle tre risposte, ed è il motivo per cui gli esiti sono tre e non due.
- Spariva anche un avviso «codice non trovato» in testa alla maschera, **senza sostituto e deliberatamente**: lo stato si vede già dalla riga — se l'articolo si è agganciato compare il suo nome, altrimenti no — e quell'avviso per giunta rimandava a un'azione che non esiste.

**Il limite è il dominio della regola, non un'eccezione.** «Non cerca» significa che da un campo codice **non si trova un articolo di cui non si conosce il codice**: per quello ci sono il campo Nome prodotto e il pannello di ricerca articoli, che è il posto dove si cerca quando non si sa. Il campo codice serve a chi il codice ce l'ha davanti — sul listino del fornitore, sull'etichetta, sul documento cartaceo.

### 4.9 Il codice fornitore che resta nella riga

**[DECISIONE, 11/08/2026 — vale su Arrivo merce e Ordine fornitore, gli unici due documenti che hanno quella colonna]**

Agganciando un articolo, nel campo Cod. fornitore va **il codice con cui lo si è agganciato**: quello che l'operatore ha digitato, preso dal listino che ha davanti. Se l'articolo è stato richiamato per altra via — nome, SKU, EAN, scansione — vale il codice **del fornitore del documento**. Se nessuno dei due esiste, il campo **resta vuoto**.

**Cosa cambia rispetto a prima:** l'operatore digitava il codice del proprio fornitore, l'articolo si agganciava, e nel campo compariva **un codice diverso** — quello di un altro fornitore dello stesso articolo, che al suo fornitore non dice niente. E in Arrivo merce il codice appena digitato poteva essere sostituito **un istante dopo**, in silenzio, dal riallineamento della riga.

**Il limite del dominio:** un articolo fornito da più fornitori **non ha «un» codice fornitore** — ne ha uno per ciascuno. La regola non sceglie il codice «giusto» in assoluto: sceglie quello **pertinente al documento che si sta scrivendo**. Fuori da un documento la domanda non ha risposta, ed è il motivo per cui un campo vuoto è preferibile a un campo riempito con il codice di qualcun altro.

_Oggi in Ordine fornitore la seconda fonte non è ancora disponibile: richiamando un articolo per nome il campo resta vuoto e lo compila l'operatore. È corretto, non è il meglio possibile._

### 4.10 Mobile: la scelta si prende toccando

**[DECISIONE, 11/08/2026 — vale su Ordine cliente, DDT vendita, Preventivi e Scarico manuale, che sono i documenti con i campi codice anche nella vista a card]**

Le regole di §4.8 valgono identiche da telefono. **Cambia il gesto, non la regola.**

- La scelta fra più corrispondenze **si prende toccando** la voce.
- **Nessuna voce è evidenziata**: su un telefono non ci sono le frecce che la spostano, e una voce accesa somiglierebbe a una preselezione — un invito a confermare senza guardare.
- **Uscire da un campo conferma il codice**, esattamente come il Tab sul computer: lo scorrimento non toglie il fuoco a un campo, quindi se lo si perde è perché si è toccato un altro campo — un gesto deliberato quanto un Tab.

**Cosa cambia rispetto a prima:** da telefono un codice con più corrispondenze apriva una scelta **che non aveva dove mostrarsi**: la riga non si agganciava e nulla lo diceva. E passando da un campo all'altro col dito il codice non veniva confrontato affatto: si digitava un codice giusto e non succedeva niente.

**Il limite del dominio:** «Invio prende la voce evidenziata» (§4.5) su mobile **non ha bersaglio**, perché una voce evidenziata non c'è. Non è una deroga: è che quella frase descrive un gesto da tastiera, e la tastiera lì non comanda la scelta.

### 4.11 La stessa riga non esiste due volte

**[DECISIONE, 11/08/2026 — vale su tutti i documenti a righe]**

Il documento ha **una sola vista delle righe per volta**: la tabella sugli schermi larghi, le card su quelli stretti. Non due, con una nascosta sotto l'altra.

**Cosa cambia rispetto a prima:** entrambe esistevano sempre, e quella non visibile poteva **aprire pannelli che nessuno vedeva** — è esattamente come la scelta fra più codici spariva da telefono. Ogni funzione nuova che tocca una riga avrebbe rischiato di rifare la stessa cosa, e in silenzio.

**Il limite del dominio, accettato:** attraversando la soglia — si ruota un tablet, si ridimensiona una finestra — **il cursore si perde**, perché il campo su cui stava appartiene alla vista che non c'è più. Quello che si è scritto **non si perde**: valori, modifiche non salvate e campi bloccati restano. Si attraversa la soglia ruotando un dispositivo, non lavorando, ed è la ragione per cui il costo è accettabile.

### 4.12 Il pannello dei suggerimenti sul nome prodotto

**[DECISIONE, 11/08/2026 — vale su tutti i documenti a righe articolo]**

Digitando nel campo «Nome prodotto» si apre sotto un elenco di articoli fra cui scegliere. Il comportamento è **uno solo**. Prima differiva fra Ordine cliente e Arrivo merce in quattro punti, e **nessuno dei quattro era dichiarato da nessuna parte**: sono differenze che non si notano leggendo, si notano usando due documenti di seguito.

Le quattro decisioni, prese una per una:

1. **L'elenco è il catalogo, e nient'altro.** Gli articoli già presenti in altre righe dello stesso documento **non** vengono riproposti in cima. Un articolo già in riga non è un risultato diverso dagli altri, e metterlo per primo è rumore proprio dove si sta guardando.
2. **Senza risultati il pannello non si apre**, e non dice niente — nessun «nessun articolo trovato». Non trovare nulla **non è un errore**: si continua a compilare la riga a mano. La creazione di un articolo nuovo **non vive nel pannello**: sta sulla riga, con «Completa anagrafica».
3. **Su riga già agganciata il pannello tace.** Lì non c'è più niente da scegliere, e l'elenco coprirebbe la riga sotto.
4. **Le frecce ↑ ↓ dentro l'elenco si fermano agli estremi**, non girano in tondo. È la stessa regola della navigazione fra righe (§4.4): dall'ultima voce ↓ non fa nulla, come dalla prima riga non fa nulla ↑.

**Cosa cambia rispetto a prima.** L'Arrivo merce proponeva in cima gli articoli già nel documento e teneva il pannello aperto anche a vuoto: entrambe le cose spariscono. L'Ordine cliente continuava a proporre anche su riga già agganciata e faceva girare le frecce in tondo: entrambe si allineano. L'Ordine fornitore non aveva affatto questo campo — aveva una tendina (§4.3-bis) — e ora ha la stessa cella degli altri due.

**Mobile: uguale.** Stesso elenco, stesse quattro regole. Cambia solo dove appare — sotto il campo nome della card invece che sotto la cella della tabella — e il fatto che la scelta si prende toccando (§4.10). Il messaggio di vuoto che la card dell'Arrivo merce mostrava è stato tolto: era l'unico punto dell'app dove la regola 2 non valeva.

### 4.13 Prima la testata: le righe non ci sono ancora

**[DECISIONE, 11/08/2026 — Ordine cliente e famiglia, Arrivo merce]**

Un documento nuovo non può avere righe finché non si sa **a chi** e **da quale magazzino**. Finché quei campi mancano:

- **le righe non si mostrano affatto.** Al loro posto c'è uno stato vuoto con l'icona, un titolo che dice **cosa manca** — «Scegli il cliente e la location», «Scegli il fornitore e il magazzino» — e una riga che dice come si riempirà: cercando un articolo, scansionando un codice o includendo un altro documento.
- appena la testata è completa, le righe compaiono e il documento è pronto.

**Cosa cambia rispetto a prima.** Le righe c'erano già, ma **spente a metà tinta**: una tabella intera, con le sue intestazioni e la sua riga vuota, occupava mezzo schermo per non poter essere usata. Sopra, un avviso ripeteva a parole quello che il grigio già suggeriva. Era poco leggibile e — parole dell'operatore — «quasi disturba».

Non si è scelta la strada dell'altro gestionale, che apre una finestra sopra il documento e chiede il cliente prima di mostrare qualsiasi cosa. La finestra **non fa risparmiare un solo tasto** — scegliere il cliente costa gli stessi gesti dentro o fuori — e ha due costi: va soppressa quando il cliente arriva da un documento incluso e quando si riapre un documento salvato, e le eccezioni a una regola d'ingresso si dimenticano. Qui poi i campi obbligatori sono due, non uno.

**Vale anche per l'Ordine fornitore, e lì la ragione è diversa** _(11/08/2026)_. Un ordine al fornitore non muove giacenze e non ha nemmeno un magazzino da indicare: le righe si potrebbero compilare senza sapere a chi si ordina. Il motivo per cui non si compilano è **di documento**: fra le colonne c'è **«Cod. fornitore»**, cioè _il codice con cui quel fornitore chiama questo articolo_. Scriverlo prima di aver detto chi è il fornitore è la frase senza il suo soggetto.

Si è scelto il cancello sul documento invece che sulla sola colonna: una regola per tutte e tre le maschere vale più di un'eccezione da ricordare su una cella.

**Il riconoscimento del codice resta indipendente dal fornitore scelto** (§4.8): se lo stesso codice appartiene ad articoli di fornitori diversi, la scelta si apre comunque e la decide l'operatore. Il fornitore della testata dice **quando** si può compilare, non **cosa** si può trovare.

**Mobile: uguale.** Stesso stato vuoto, stesso testo, stessa regola. Su mobile era già così — le card non si mostravano e lo stato vuoto spiegava — quindi non è una novità mobile: è il desktop che ha adottato quello che sul telefono era già stato deciso.

---

## 5. Difetti da raddrizzare PRIMA di unificare

Bug già presenti — **non** decisioni di prodotto. Se si unifica senza sistemarli, da locali diventano **strutturali** (cristallizzati nel punto unico).

**Gruppo A — divergenze celle gemelle / mappe id:**

1. **↑ tasto morto** in Ordine cliente e Ordine fornitore: le celle emettono `lineRowRetreat`, nessuno ascolta.
2. **Ordine fornitore** mappa il prodotto su `po-product-{i}`, id **inesistente** in ogni template: focus perso a metà giro.
3. **`advanceToNextLine` di Ordine fornitore** non controlla `formReadOnly()`: su documento bloccato il Tab aggiunge righe.
4. **`gr-vat-{i}`** nella mappa ma **non nel template** — chiamata morta.
5. **Celle gemelle divergono sulle frecce a suggerimenti aperti:** la cella prodotto le usa per scorrere la lista, la cella codice le ingoia con `preventDefault`.

**Gruppo B — trovati dalla mappa:** 6. **Ordine cliente:** il giro ignora la riga "documento collegato" — il fuoco muore. (Lo sana §4.4-ripiego.) 7. **Arrivo merce:** con una sola riga vuota, creazione + pulizia riportano l'array a una riga e **il fuoco punta a una riga che non c'è più**. Lo previene §4.4 ("↓ su riga vuota non fa nulla"). 8. **Arrivo merce:** mappa inversa con `gr-lot-` prima di `gr-lot-date-` → da "Scadenza" il fuoco torna su "Lotto". 9. **Ordine fornitore:** due campi nel giro **senza gestore di tastiera**. 10. **Arrivo merce:** su riga collegata due celle **escluse dal Tab ma editabili col mouse**, senza `// REASON:`. 11. **e2e già rotto:** un test cerca `.gr-product-cell--linked`, classe che **in `src/` non esiste più**. 12. **U.M. Ordine fornitore fallisce in silenzio:** il campo è editabile, si popola dall'articolo, ma nel backend degli ordini fornitore `unitOfMeasure` **non compare**: modifichi, salvi, riapri → ritrovi il valore dell'articolo, la modifica sparisce senza dire niente. Non corrompe nulla (nessun `product.update` da riga), ma **fallisce in silenzio** — ciò che il progetto combatte ovunque. Sanato per costruzione da §4.3-ter (la riga ottiene un campo suo). (Arrivo merce: la sua tendina U.M. è per l'**articolo nuovo** in creazione, non tocca l'anagrafica — corretto, nessun difetto.)

**Rete di sicurezza:** oggi **nessun test** copre l'area (un e2e è già rotto — #11). Le regole-qualità chiedono una **guardia**: copertura minima ("il focus atterra dove deve", "la freccia non persiste") come parte del lavoro.

---

## 6. Colonne — spostamento TOLTO dallo scope

**Decisione:** lo **spostamento colonne libero** (destra/sinistra) **esce dal piano.**

**Perché.** Delle tre cose che l'operatore fa sulle colonne, due funzionano già su tutte e tre le maschere; manca solo la terza:

|                        | Ordine cliente  | Arrivo merce | Ordine fornitore |
| ---------------------- | --------------- | ------------ | ---------------- |
| Nascondere una colonna | ✔               | ✔            | ✔                |
| Ridimensionare         | ✔ (14 maniglie) | ✔ (15)       | ✔ (13)           |
| Spostare dx/sx         | ✘               | ✘            | ✘                |

Lo spostamento costa **il pezzo più grosso di tutto il piano** — la trasformazione data-driven (~2.100 righe di markup su tre maschere, metà senza precedente: celle unite, larghezze percentuali, celle a doppio ramo, card mobile) — **più grande dell'unificazione tastiera**, che è il motivo per cui questo lavoro esiste. E dà la funzione **meno richiesta** delle tre. In più: Danea non ha i **gruppi colorati**, VestiFlow sì (scelta di design deliberata, scritta nelle regole di stile) → lo spostamento libero scambierebbe una struttura visiva **che esiste e piace** con una funzione che nessuno ha chiesto.

**Non si perde niente:** l'unificazione tastiera **non ha bisogno** del data-driven (§4.7 — il punto unico riceve l'ordine dall'esterno; nel Giro 1 gli si passa quello fisso). La porta resta aperta per il futuro senza pagarla ora. **La pagina che piace resta identica.**

**Con lo spostamento escono anche:** la trasformazione data-driven, il separatore da togliere, il `colspan`, il campo `group` in `TableColumnDef`, le card mobile da rifare, ogni cambio d'aspetto. Nessuna incoerenza tra i documenti da sanare: sono tutti e tre allo stesso punto, ed è il punto che piace.

### 6.1 Pannello "Colonne" — resta, con l'interruttore

Il pannello è **condiviso** su 11 schermate. Le sue frecce ↑↓ (riordino) **funzionano su sei elenchi** (Registro documenti, Giacenze, Movimenti, Situazione, Ordini cliente, Fornitori) e sono **inerti** su Prodotti, Clienti e su **tutte le maschere documento** (tabelle a ordine fisso).

**Decisione:** il pannello riceve un **interruttore** (`reorderable`); le maschere documento lo passano **spento** → sui documenti restano le **checkbox** mostra/nascondi, spariscono le frecce inerti. Sugli elenchi tutto invariato. Toglie comandi che oggi **fingono di funzionare** — una bugia in meno nell'interfaccia. Costo: un `input()`.
_Precisazione pin:_ sui documenti il pin **non compare già oggi** (le config non dichiarano colonne bloccabili) — l'interruttore nasconde **solo le frecce**.

### 6.2 Nascondere e ridimensionare — restano come sono

Funzionano già su tutte e tre le maschere. Non si toccano.

### 6.3 Elenchi Prodotti e Clienti — FUORI SCOPE

Prodotti e Clienti hanno le frecce inerti come i documenti (sequenza fissa scritta a mano, `columns()` usato solo per presenza/etichetta, non per ordine). Sono **elenchi, non documenti** — territorio diverso, con **anche i riepiloghi** da sistemare. **Intervento separato**, fuori da questo lavoro.

---

## 7. Righe: ordinamento per contenuto + spostamento manuale

> DB solo per Ordine fornitore (colonna `lineNumber` additiva). Gli altri cinque tipi già ce l'hanno. Vedi §0.

### 7.1 Ordinamento righe per contenuto

- Click sull'intestazione di una colonna → **tutte le righe si riordinano** per quel contenuto (prezzo, quantità, alfabetico sul nome…). È la funzione **utile ogni giorno** (distinta dallo spostamento colonne, tolto).
- Oggi **solo in Arrivo merce** (`lineSortDirection`, `applyLineSort()`). Da portare su tutte.

**Avviso al primo ordinamento — azione irreversibile.**

- L'ordinamento **riscrive** la FormArray; con `lineNumber` persistito, salvare dopo aver ordinato **riscrive in modo permanente** l'ordine — da un **click** (gesto esplorativo). Le regole-gestionale chiedono conferma per chi riscrive dati → **conferma al primo ordinamento** ("riordina in modo permanente, procedere?").
- **Il drag della singola riga NON richiede avviso** (gesto esplicito, una riga sola). L'avviso è **solo** per il sort per colonna. (Principio già scritto in `docs/ORDINE-FORNITORE-RIGA.md:314-316`, mai eseguito nel codice.)
- **Ordine fornitore:** l'ordine è già persistito **per caso** (ogni salvataggio cancella e ricrea le righe nell'ordine del payload, lettura senza `orderBy`). Il sort **senza** `lineNumber` darebbe un ordine **persistente ma non garantito** — peggio di tutto. Quindi lì `lineNumber` **è necessaria**, non opzionale.
- **[VERIFICATO: `toggleLineSort`]** — Arrivo merce **non ha alcuna conferma**: `toggleLineSort` controlla solo la sola-lettura e la visibilità della colonna, poi **riordina subito** (nessun dialog, nessun annulla). Quindi l'avviso al primo sort va **costruito, non propagato** — è un lavoro nuovo, non una copia. La differenza conta per la stima.

### 7.2 Spostamento manuale della riga (drag)

- **Solo col mouse**, trascinando la riga. Niente Ctrl+↑/↓ (§7.3).
- Eccezione all'ordinamento automatico: dopo un ordine, una riga si sposta a mano.
- Precedente: **Ordine cliente ha già il drag** (`cdkDropList`/`cdkDrag`, `lineNumber` da indice, `orderBy` in lettura). **Unica** maschera che ce l'ha → copiare. Il salvataggio c'è quasi ovunque (tranne Ordine fornitore); il gesto va propagato.
- Priorità: non alta.

### 7.3 Ctrl + ↑ / ↓ — non incluso

Esiste solo in Arrivo merce. **Lasciato perdere.** Da nominare nell'allineamento, così non sparisce né si intrufola per inerzia.

### 7.4 Ordinamento righe ↔ navigazione ↓

Con l'ordinamento attivo, "↓ va sotto / crea in fondo" si riferisce all'**ordine visibile corrente**. Coerente con §4.7.

---

## 8. Anagrafica dalla ricerca — il "modo ispezione" NON serve

**Cade** il modo ispezione (sola-lettura da costruire, soppressione footer, recupero maschere con stato duplicato). Scelta di prodotto: nell'anteprima della ricerca si guardano i dati; se serve altro si apre l'anagrafica.
_(Tecnicamente: `mode()` non è letto da alcun template; il pannello ricalcola il modo da `embeddedProductId` e mostrerebbe comunque il footer di modifica. Una sola-lettura non esiste. Non si costruisce.)_

**Si fa (più leggero) — modello Danea:**

- Nel risultato di ricerca il **nome articolo è cliccabile** → apre l'anagrafica esistente. La **riga** aggiunge al documento. Due bersagli: nome → apri, riga → aggiungi.
- All'uscita si **torna alla ricerca** dov'eri.

**Lavoro reale** (non è "sottolineare il nome"):

- Il risultato è oggi **un unico `<button>`** → bottone-dentro-bottone non è valido né accessibile. Va **ristrutturato** in due controlli affiancati.
- Lo store non ricorda la provenienza → serve la **memoria del ritorno**.
- L'apertura dalla ricerca ha bisogno di un **ingresso senza riga** (oggi si apre solo da riga collegata).
- Buona: `attachPendingVariantToLine()` è **già generico** — la metà "all'uscita aggiungi" esiste; manca chi la inneschi senza salvataggio.
- Scala: `supplier-order` e `store-sale-register` incorporano lo stesso pannello con **stato locale duplicato** invece dello store.

---

## 9. Cella prodotto: striscia icone (`domain/`, nessuna collisione)

Difetto: la cella "Nome prodotto" fa tre lavori; l'hover fa comparire un link che ruba larghezza al nome (a capo sporco) o altezza. Causa: elemento senza spazio riservato (`display:none`→`inline-flex` su hover).

**Decisione:**

- **Striscia icone con spazio sempre allocato** _dentro_ la cella (non una colonna nuova). Nella riga collegata la striscia esiste già (lente + ✕) — la terza azione va lì.
- **Icona fissa** invece di testo a comparsa: via il guizzo che la rende invasiva.
- Il template si **biforca già** su `linked()`: collegata → "apri"; non collegata → `+`. Mai entrambe, mai nessuna.
- **`+` = creazione precompilata** ("Completa anagrafica"): apre l'anagrafica **coi campi della riga già inseriti**, si completa, poi si salva (o si salva e aggiunge). Il `+` racconta l'azione giusta (nasce un articolo); tooltip via `app-hover-tooltip`, già importato.
- **Disabilitato preventivo:** su riga vuota il pulsante oggi produce l'errore "Inserisci almeno SKU, EAN o nome" al click → spostarlo a **disabilitato prima del click**. L'errore smette di poter accadere.
- `tabindex="-1"` sulle icone **confermato** (velocità nella griglia; niente percorso tastiera verso le icone).

`domain/` condiviso da Ordine cliente e Arrivo merce; la cassa non lo tocca. **Una correzione, due schermate** — la modifica in `domain/` si propaga da sé, quindi va applicata a **entrambe insieme** (mai su una sola: principio anti-divergenza, §1), ed **entrambe vanno provate**. Resta un intervento di layout indipendente dal punto unico/U.M./ordinamento, ma **incluso in questo lavoro e sullo stesso branch** (deciso).

---

## 10. Documentazione del repo da aggiornare

- **`docs/CORE-FORM-DOCUMENTO.md`** (~107–118): conclude "da NON estrarre così com'è" su stima vecchia (due maschere, ~45 righe; sono tre, ~600) e rimanda "a quando si decide quale navigazione è giusta" — **decisa ora** (§3). Aggiornare, o dice di non fare ciò che si è deciso di fare.
- **`docs/ORDINE-FORNITORE-RIGA.md`**: `:314-316` dichiara l'avviso al primo sort (giusto, **mai eseguito** → implementare, §7.1); `:334-335`/`:348` affermano "Nessun documento ordina le righe per colonna. Zero" e marcano Arrivo merce "no" — **falso** (lo fa su sette colonne). **Contraddizione da correggere.**
- **`regole-stile-ui.md:455`** — il separatore verticale forte tra gruppi è scritto qui (fonte di verità visiva). Con lo spostamento colonne fuori scope il separatore **resta com'è** (nessuna colonna si mescola) → **nessuna modifica necessaria a questa regola.** _(Nota: i token `--color-table-group-divider` e i tre `--table-group-*-rule` NON sono orfani — i `-rule` sono la sottolineatura orizzontale per-cella sotto le intestazioni di gruppo, `--divider` è anche il bordo sopra il riepilogo totali. Non toccarli.)_
- **`regole-stile-ui.md` — elenco componenti condivisi:** §4.3-bis introduce un **componente condiviso nuovo** (la cella ricerca-e-selezione). Quel documento tiene l'elenco dei componenti condivisi coi loro punti di regolazione (oggi: `select-menu`, `date-input`, le celle di riga con `--doc-code-cell-fg` / `--doc-product-cell-weight`). La cella nuova **va registrata lì**, con le sue leve di configurazione — altrimenti nasce fuori dalla fonte di verità visiva e chi la configurerà dall'esterno non sa quali manopole ha. Coerente con "si configura dall'esterno, non si corregge": perché si possa, va documentato dove sono le manopole.

---

## 11. Riepilogo decisioni

| #       | Decisione                                                                                                                                                                                                                                                                          | Esito | DB                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------ |
| —       | Semplificare e unificare; modello = la spec; punto unico                                                                                                                                                                                                                           | ✔     | —                                                |
| 1       | Fonte di verità = questo doc; l'obsoleto si allinea; pulire con controlli (chi usa → ha senso? → poi decidi)                                                                                                                                                                       | ✔     | —                                                |
| 1       | **Si unifica il comportamento, NON i dati:** acquisto (costo/fornitore) vs vendita (prezzo/cliente) restano distinti; si condividono i meccanismi, non colonne né natura                                                                                                           | ✔     | —                                                |
| 1       | **Anti-divergenza:** una funzione si applica a tutti i documenti insieme, mai "di prova" su uno (eccezione: file contesi dal collega, tempistica)                                                                                                                                  | ✔     | —                                                |
| —       | Perimetro 9 tipi / 5 componenti; 4 già sul modello. **7 tipi da allineare subito** (3 file, zero collisioni); **2 in sospeso**: fatture (comportamento nello standard, quando/come da decidere) e vendite/reso in negozio (prima [DA VERIFICARE] cos'è)                            | ✔     | —                                                |
| 3-bis   | Punto unico = classe-campo generica in `domain/documents/state/`; contratto a **9 voci** (erano 10: l'intercettazione di Invio è caduta, 08/2026); mappa id completa; entrate nominali                                                                                             | ✔     | —                                                |
| 4.1     | Tab: sx→dx, seleziona tutto (cambia gesto in uso)                                                                                                                                                                                                                                  | ✔     | —                                                |
| 4.2     | Frecce ←/→ testo: due tempi                                                                                                                                                                                                                                                        | ✔     | —                                                |
| 4.3     | Celle IVA/U.M. = ricerca-e-selezione; "» Altro…" in coda fissa; **testo libero: U.M. sì, IVA no**; frecce cambiano cella al 1° colpo                                                                                                                                               | ✔     | —                                                |
| 4.3-bis | `app-select-menu`: **sostituzione locale** (4/183 celle), base `date-input`, **estrarre prima** della 3ª cella                                                                                                                                                                     | ✔     | —                                                |
| 4.3-ter | **U.M. creabile, modello `PaymentOption`** (non IVA); struttura stringa **esiste già** → no FK, no orfani, degrada a testo; default da articolo, modifica **locale**; fotografia **da accendere** in Ordine cliente; colonna U.M. su `DocumentLine` (4 tipi) + `SupplierOrderLine` | ✔     | **Tabella `PaymentOption`-like + RLS + colonna** |
| 4.4     | ↑↓ conservano colonna (**↓ cambia firma, dichiararlo**); ↓ crea solo se c'è contenuto (**nuovo**); ripiego scavalca "documento collegato"                                                                                                                                          | ✔     | —                                                |
| 4.5     | **Invio: registra e resta sulla cella** — non naviga, non salva (cambio: oggi Ordine cliente fa Invio=Tab); nessun salvataggio su Invio mai                                                                                                                                        | ✔     | —                                                |
| 4.5-bis | Freccia non salva (già vero); rinominare `commitLineAndSave`, ripulire autosave; ricreare tempismo focus                                                                                                                                                                           | ✔     | —                                                |
| 4.6     | Mouse due tempi; select all'ingresso da tastiera, non al click; drag lasciato passare                                                                                                                                                                                              | ✔     | —                                                |
| 4.7     | Punto unico riceve l'ordine dall'esterno = **porta aperta** per lo spostamento colonne futuro                                                                                                                                                                                      | ✔     | —                                                |
| 5       | Raddrizzare 12 difetti (5 strutturali + 7 dalla mappa) + guardia/test                                                                                                                                                                                                              | ✔     | —                                                |
| 6       | **Spostamento colonne TOLTO** (pezzo più grosso, funzione più rara, romperebbe i gruppi che piacciono)                                                                                                                                                                             | ✔     | —                                                |
| 6.1     | Pannello "Colonne": interruttore spegne le frecce inerti sui documenti (pin già assente)                                                                                                                                                                                           | ✔     | —                                                |
| 6.2     | Nascondere/ridimensionare: restano come sono                                                                                                                                                                                                                                       | ✔     | —                                                |
| 6.3     | Elenchi Prodotti/Clienti + riepiloghi: fuori scope                                                                                                                                                                                                                                 | ✔     | —                                                |
| 7.1     | Ordinamento righe per contenuto ovunque + **avviso al primo sort** (da costruire, non esiste); Ord. fornitore: `lineNumber` necessaria                                                                                                                                             | ✔     | Solo Ord. fornitore                              |
| 7.2     | Spostamento riga solo col drag; gesto da propagare (cdkDrag solo in Ord. cliente)                                                                                                                                                                                                  | ✔     | Solo Ord. fornitore                              |
| 7.3     | Ctrl+↑/↓ non incluso; nominarlo per non farlo sparire/intrufolare                                                                                                                                                                                                                  | ✔     | —                                                |
| 8       | Modo ispezione cade; nome cliccabile (apri) vs riga (aggiungi); ritorno alla ricerca; ristrutturare il risultato                                                                                                                                                                   | ✔     | —                                                |
| 9       | Cella prodotto: striscia icone fisse, `+` creazione precompilata, disabilitato preventivo, `tabindex=-1`; **su entrambe le maschere insieme** (`domain/` condiviso)                                                                                                                | ✔     | —                                                |
| 10      | Aggiornare `CORE-FORM-DOCUMENTO.md`; correggere contraddizione in `ORDINE-FORNITORE-RIGA.md`; **registrare la cella nuova** in `regole-stile-ui.md`; il **separatore** in `regole-stile-ui.md:455` **non** si tocca (token non orfani)                                             | ✔     | —                                                |
| 1       | **Il perimetro include le VISTE:** una decisione vale sul documento, non su «quel documento da computer». Il meccanismo può cambiare — su mobile si tocca — la regola no. Ogni progetto dice anche come funziona su mobile                                                         | ✔     | —                                                |
| 4.8     | **I campi codice non cercano: confrontano** alla conferma, per corrispondenza esatta. **Tre esiti** (una aggancia · più d'una apre la scelta · nessuna lascia il valore scritto). Via la ricerca a digitazione, via il ripiego per nome, via l'avviso «non trovato»                | ✔     | —                                                |
| 4.9     | **Nel Cod. fornitore va il codice con cui hai agganciato**, poi quello del fornitore del documento, poi niente — mai quello di un fornitore qualsiasi (Arrivo merce e Ordine fornitore)                                                                                            | ✔     | —                                                |
| 4.10    | **Su mobile la scelta si prende toccando**, nessuna voce evidenziata, e **uscire da un campo conferma** come il Tab                                                                                                                                                                | ✔     | —                                                |
| 4.11    | **La stessa riga non esiste due volte:** una sola vista viva per volta. Attraversando la soglia si perde il cursore, non il lavoro                                                                                                                                                 | ✔     | —                                                |
| —       | Card mobile: fuori scope il **rifacimento grafico**, non le regole (vedi §12). Dimensioni/peso articolo: fuori scope.                                                                                                                                                              | ✔     | —                                                |
| —       | **Fatture e vendite/reso in negozio: IN SOSPESO** — nulla di deciso su quando/come; vendite/reso prima da chiarire cos'è                                                                                                                                                           | ✔     | —                                                |

---

## 11-bis. Stato di verifica — cosa è confermato sul codice, cosa no

> Serve a chi esegue per sapere di cosa fidarsi. I fatti **verificati** hanno un riferimento; quelli **da verificare** vanno controllati prima di agire (potrebbero essere ricostruzioni plausibili ma non confermate). Le **decisioni** non sono qui — valgono a prescindere.

**[VERIFICATO] — confermati sul codice da Claude Code:**

- Punto unico = classe-campo generica; forma già usata 3 volte (`DocumentNumberConflictStore`, `DocumentPrefillErrorStore`, `DocumentProductPanelStore`). File `document-line-focus.store.ts`.
- Attribuzione modelli riga: Ordine cliente → `SalesOrderLine`; Preventivi/DDT/Scarico manuale → `DocumentLine` (biforcazione `isRegistryDocument`); Arrivi merce → `DocumentLine`; Ordine fornitore → `SupplierOrderLine`. Tutti con `lineNumber` tranne `SupplierOrderLine`.
- `cdkDrag` solo in Ordine cliente.
- `commitLineAndSave` non fa scrittura HTTP.
- `Product.unitOfMeasure` e `SalesOrderLine.unitOfMeasure` sono `String` senza `@IsIn`/enum (testo libero già passa).
- `PaymentOption` = 7 colonne, salva il nome; `VatCode` = tabella per-tenant con `vatCodeId onDelete:SetNull` + `vatSnapshot Json`.
- `scripts/check-rls.mjs` fa fallire la build su tabella nuova senza RLS.
- `app-select-menu`: 183 istanze / 36 template; trigger `<button>` senza `inputId`; 22 punti e2e lo pilotano. `date-input` ha `inputId`/`triggerKeydown`/vero `<input>`, già dentro `gr-lot-date`.
- Nessun `product.update` da riga tocca `unitOfMeasure` (l'anagrafica non viene corrotta).
- U.M. Ordine fornitore: `unitOfMeasure` assente nel backend ordini → modifica persa al salvataggio (fallisce in silenzio).
- `toggleLineSort` (Arrivo merce): nessuna conferma prima del sort.
- e2e rotto: `.gr-product-cell--linked` non esiste più in `src/`.
- Fuoco = sottoinsieme dell'ordine colonne, stessa sequenza, in tutte e tre (regge §4.7 senza data-driven).
- Token `--table-group-*-rule` e `--color-table-group-divider` **non** orfani (sottolineature gruppi + bordo totali).
- Il filtro voci attuale cerca il testo **ovunque** (non solo il codice) → §4.3 richiede un filtro nuovo a precedenza-codice.

**[DA VERIFICARE] — plausibili ma non ancora confermati, da controllare prima di agire:**

- Costo reale della trasformazione delle celle (estrazione + terza cella): stima, non misura.
- Se `DocumentLine` e `SupplierOrderLine` accettano la colonna U.M. senza effetti su altri consumatori.
- Valori U.M. distinti realmente presenti per il seed (vanno misurati sul DB).
- Se esiste già un typeahead/combobox riusabile per la cella ricerca-e-selezione oltre a `date-input`.
- Il `focusInput()` pubblico mai chiamato: base utile o codice morto (§4.3-bis).
- Il pannello "» Altro…" (`document-series-manager-dialog`) è riusabile per l'U.M. o va adattato.

---

## 12. Prossimi passi

**Decisioni di prodotto: tutte prese.** Restano verifiche di costo per Claude Code (sola lettura; la scelta resta a Luigi dove indicato).

1. **Mappa esecutiva del punto unico** (§3-bis): collocazione della classe-campo generica, le 9 voci del contratto, il collo di bottiglia `getElementById` con id irregolari.
2. **U.M.** (§4.3-ter): conferma modello `PaymentOption`; colonna U.M. da aggiungere a `DocumentLine` (copre 4 tipi) e `SupplierOrderLine`; valori distinti per il seed.
3. **`app-select-menu`** (§4.3-bis): estrazione delle celle gemelle + del pannello suggerimenti prima di scrivere la terza cella; base `date-input`.
4. **Ordinamento righe** (§7.1): se Arrivo merce ha già la conferma al primo sort.

### Piano di esecuzione — tre filoni con le loro dipendenze

Il lavoro ha **tre filoni**: tastiera, celle-a-selezione+U.M., blocco righe. Non sono indipendenti — c'è una catena vincolante che, se ignorata, produce le copie che questo lavoro vuole eliminare.

**Filone A — Tastiera** (solo le **3 maschere da allineare subito**; fatture e vendite/reso sono in sospeso). Criterio: **prima la semantica, poi la copertura** — partire da Arrivo merce "perché ha già tutto" porterebbe le sue eccezioni nel contratto come regole. La semantica adottata a ogni maschera include: freccia non salva (§4.5-bis), **Invio registra-e-resta** (§4.5), Tab/frecce come da §4.1-4.4.

- **A0.** Riparare l'e2e rotto (`.gr-product-cell--linked` non esiste più) — finché è rosso ogni prova e2e di Arrivo merce è rossa a prescindere e non distingue una rottura vera.
- **A1.** I difetti in `domain/` che il punto unico cementerebbe (§5).
- **A2.** La classe col suo spec, **senza innestarla** (rischio zero). _Il file nuovo entra nel gate di copertura — senza il suo spec `npm run test:everything` fallisce, e alzare la soglia è vietato._
- **A3.** Ordine cliente (porta la semantica, unica con "riga non attraversabile", niente gancio asincrono, rete di test migliore, copre 4 tipi).
- **A4.** Ordine fornitore.
- **A5.** Arrivo merce per ultima (unica che aggiunge voci al contratto).

**Filone B — Celle a selezione + U.M. (catena VINCOLATA, ordine obbligatorio):**

> La cella U.M. **non esiste**: la crea §4.3-bis, che dice "estrarre prima". Se l'U.M. parte prima della cella, la sua cella si scrive da zero e diventa **la terza copia** — esattamente ciò che §4.3-bis vuole evitare. Ordine non negoziabile:

- **B1.** Estrazione del nucleo comune delle celle gemelle + del pannello suggerimenti (`document-line-suggestions`, oggi usato da 2 dei 5 posti).
- **B2.** Nuova cella **ricerca-e-selezione** su base `date-input` (vero `<input>`, `inputId`, `triggerKeydown`).
- **B3.** Applicarla alle celle **IVA** e **U.M.** (testo libero: U.M. sì, IVA no).
- **B4.** Tabella U.M. (modello `PaymentOption` + RLS) e pannello **"» Altro…"** (voce-azione in coda fissa). Registrare la cella nuova in `regole-stile-ui.md` (§10).
- **DB:** tabella U.M. + RLS; colonna U.M. su `DocumentLine` e `SupplierOrderLine`. **Concordare col collega** (database condiviso).

**Filone C — Blocco righe:**

- **C1.** Ordinamento righe per contenuto su tutte le maschere + avviso al primo sort (§7.1).
- **C2.** Drag riga: propagare il gesto (cdkDrag oggi solo in Ordine cliente).
- **DB:** colonna `lineNumber` su `SupplierOrderLine` (gli altri cinque tipi ce l'hanno già). **Necessaria** per Ordine fornitore, non opzionale (§7.1).

**Intreccio tra filoni:**

- B e A si incrociano su `app-select-menu`: la cella IVA/U.M. (B2-B3) tocca le stesse maschere della tastiera. Conviene che B1-B2 (estrazione + cella) precedano o accompagnino A3-A5, così ogni maschera riceve la cella nuova quando la tastiera la tocca — non due passaggi sulla stessa maschera.
- C è il più indipendente: l'ordinamento/drag non dipende dalla cella né dal punto unico. Può procedere in parallelo, con la sola accortezza della migration `lineNumber` concordata.

**Branch dedicato.** Tutte le migration lì, coi dati di test; le non-banali (tabella U.M.) concordate col collega.

**Documentazione:** aggiornare `CORE-FORM-DOCUMENTO.md`; correggere la contraddizione in `ORDINE-FORNITORE-RIGA.md`; registrare la cella nuova in `regole-stile-ui.md` (§10). Il separatore in `regole-stile-ui.md:455` **non** si tocca.

**In sospeso — da riprendere in una sessione dedicata:**

- **Fatture** (Proforma/Fattura/Fattura accompagnatoria): comportamento nello standard come gli altri, ma **quando e come eseguirle è da decidere** (file conteso col ramo fattura elettronica). Nulla fissato ora.
- **Vendite/reso in negozio:** prima **[DA VERIFICARE] cos'è** ("vendita al banco"? POS/cassa? documento a sé?), poi si decide. Nulla fissato ora.

**Fuori scope:** spostamento colonne (porta aperta via §4.7); elenchi Prodotti/Clienti + riepiloghi; **il RIFACIMENTO grafico delle card mobile**; dimensioni/peso articolo.

> ⚠️ **Correzione (11/08/2026): «card mobile: fuori scope» diceva troppo, e ora è precisato.** Fuori scope è **rifarle**: la loro forma, il loro aspetto, la loro disposizione non si toccano. Ma le **regole** decise qui valgono anche lì (§1, «il perimetro include le viste»), e infatti le card sono già state toccate — la scelta fra più codici e la conferma allo sfocamento ci sono arrivate. Letta come stava, questa riga avrebbe autorizzato a lasciare mobile indietro, che è il difetto che §4.10 corregge.
