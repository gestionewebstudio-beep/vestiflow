# 07 · Specifica famiglia Fattura

**Data:** 14/08/2026
**Stato del documento:** piano, non consuntivo. Ogni voce porta il proprio stato. Nessuna voce va letta come già fatta se non lo dice.
**Owner:** Luigi
**Migration richiesta:** additiva — un valore enum (`credit_note`) più la ricostruzione dell'indice `documents_number_unique`. Nessuna colonna nuova, nessuna tabella nuova. Dettaglio operativo in `06-note-merge-fatture.md`.

**Metodo.** Le voci marcate _misurato_ sono state verificate nel codice o sul database, con la data. Le voci marcate _dedotto_ sono ragionamenti non ancora verificati e non vanno implementate come certe. Danea è benchmark comportamentale, non requisito.

---

## §1 · Principio

Fattura, Fattura accompagnatoria e Nota di credito sono **tre tipi di un solo documento**, non tre documenti. Condividono registro, elenco, maschera, numerazione e famiglia di permessi.

_Misurato 14/08:_ il tipo è già un discriminante. `invoice_draft` e `invoice_accompanying` sono due valori dello stesso enum `DocumentType` sulla stessa tabella `documents`, e condividono già numeratore (`documentNumberingType`), indice unico partizionato, maschera, elenco e famiglia permessi `invoice`. Aggiungere la Nota di credito significa aggiungere un valore, non fondere entità.

**Stato: deciso 14/08, non iniziato.**

## §2 · Numerazione

**Numerazione unica e continua per i tre tipi.** Un solo progressivo, un solo numeratore. Il tipo si distingue dalla colonna «Tipo doc.» nel riepilogo, non dal numero.

Coerente con Danea, che indica la numerazione condivisa con le fatture come soluzione suggerita per le note di credito.

### Serie: condivisa, separata solo per convenzione

_Misurato 14/08._ L'identità del contatore è `@@unique([tenantId, type, series])` e la riga porta il tipo grezzo, ma per la Nota di credito — come per l'accompagnatoria — **una riga contatore non esisterà mai**: entrambi i tipi sono esclusi dai numeratori configurabili per costruzione.

**Conseguenza da dichiarare, per non promettere ciò che il modello non dà:** una serie creata dall'operatore nasce sotto `invoice_draft` ed è visibile e selezionabile da tutti e tre i tipi. Nulla impedisce di emettere una Fattura sotto una serie chiamata «NC». **Non è un sezionale separato: è una serie condivisa, tenuta distinta dalla disciplina di chi compila.**

Se un commercialista chiedesse il sezionale vero per le note di credito, oggi non si può dare. Servirebbe il contatore per tipo — lavoro vero e una migration in più. **Fuori scope, registrato qui perché non venga dato per fatto.**

### Avviso all'operatore

Con percorsi separati per tipo (§4), l'operatore vede tre voci distinte e conclude naturalmente che le numerazioni siano tre. Serve un'informazione passiva accanto al campo Numero in testata, che spieghi il progressivo condiviso.

Informazione passiva, non conferma attiva (cfr. sistema aiuti, punto 2). **Da dichiarare l'equivalente mobile**, dove il passaggio del mouse non esiste: tocco sull'icona o riga sotto il campo. Senza, l'informazione la vede metà degli operatori.

**Stato: deciso 14/08, non iniziato.**

## §3 · Elenco

Un solo elenco «Fatture», con i tre tipi insieme e la colonna «Tipo doc.».

_Misurato 14/08:_ il profilo `invoice` in `document-sales-register.config.ts` porta già `types`, `typeFilterOptions` e `createVariants`. Una terza voce = tre array e una rotta.

Il sottotitolo va riscritto: oggi dice «Fatture fiscali da inviare al commercialista, con o senza trasporto merce incluso», che non comprende le note di credito.

**Stato: deciso 14/08, non iniziato.**

## §4 · Percorsi

**Ogni tipo ha il suo percorso.** Il tipo è dichiarato nell'indirizzo, non dedotto leggendo il documento dal database.

**Il motivo, già misurato in `03-specifica-unificazione-righe-documento.md` §4.11:** senza il tipo nel percorso, `documentType()` ricade su Proforma per tutti e tre. Si vede a schermo — titolo «Modifica proforma» su una fattura, dicitura «Documento non fiscale / Proforma non valida ai fini IVA» stampata sopra un documento fiscale, tendina Serie che parte con le serie sbagliate. Due richieste che non si annullano a vicenda.

_Nota:_ l'argomento «i permessi si controllano prima della lettura» **non regge** ed è stato scartato: i tre tipi stanno nella stessa famiglia `invoice`, quindi il controllo è identico con o senza tipo nel percorso.

Prezzo accettato: i collegamenti a documenti già emessi cambiano forma. Con zero clienti in produzione il prezzo è teorico, ed è l'unica finestra in cui questa scelta costa poco.

**Stato: deciso 14/08, non iniziato.**

## §5 · Creazione

Dal pulsante «Nuovo» si sceglie il tipo, tramite **menù a tendina** con tre voci.

_Misurato 14/08:_ oggi il pulsante è unico e la sua etichetta segue il filtro Tipo attivo, ricadendo sulla Fattura semplice quando il filtro è «Tutti». Quel legame va sciolto.

Scelta la tendina e non tre pulsanti affiancati perché la barra non si allunga quando arriveranno altri tipi.

**Stato: deciso 14/08, non iniziato.**

## §6 · Nota di credito

### Come nasce

Due strade: dal menù «Nuovo», vuota; oppure **da una fattura aperta**, con riferimento al documento d'origine e righe ereditate. La seconda è il gesto prevalente.

_Dedotto, da verificare:_ che l'inclusione documenti esistente copra questo caso. Non è stato misurato.

In Danea la nota eredita **tutta la catena** dei riferimenti — fattura, DDT, ordine — non solo la fattura.

### Il segno: importi positivi, verso dato dal tipo

_Misurato 14/08._ **Le quantità restano positive.** Il segno vive nell'aggregazione, applicato da chi somma in base al tipo documento.

Perché non il segno nella quantità (modello Danea), che era l'ipotesi iniziale:

- **Le quantità negative sono rifiutate** a due livelli su tre: nove DTO con `@Min(0)`/`@Min(1)`, e la maschera con un pattern che esclude il segno meno. Il database le permetterebbe, il resto no.
- **Soprattutto: una quantità negativa non inverte il movimento, lo annulla.** Tutte e cinque le funzioni che costruiscono un movimento aprono con `if (quantity <= 0) return` — nessun movimento, nessun errore, nessun delta. Il segno nella quantità non avrebbe risolto il magazzino, che era metà della sua promessa.

**Non è un ripiego: è la convenzione già in vigore.** La Rettifica — il documento che deve saper togliere e aggiungere — usa esattamente questo modello: verso in testata (`AdjustmentDirection`), quantità sempre positiva. E i report applicano già il segno per tipo sul caso più vicino alla nota di credito che esista, il reso: `sign = type === return ? -1 : 1`.

**Costo misurato:** due punti di aggregazione da insegnare (`document-list.component.ts:645`, totale della selezione; `document-list-export.util.ts`, CSV e stampa) più una riga nei report se genera movimenti — che però si azzera adottando `StockMovementType.return` (vedi «Il magazzino»). Il registro del commercialista conta documenti e non somma importi; l'elenco non ha totale di piè di lista.

_Dedotto, non misurato:_ verso lo SdI la TD04 dovrebbe portare importi positivi. È un'affermazione sul tracciato FatturaPA, **non una verifica fatta su questo repository**. Se regge, con questo modello non serve rigirare nulla. _Materia del ramo `feature/fattura-elettronica`, non nostra_ — vedi §9.

### Il magazzino

Il meccanismo per riga esiste già e non va inventato: `DocumentLine.loadsStock`, la colonna «Scarica mag.».

**Ma non è la casella che l'operatore vede sulla fattura**, e questa parte va corretta prima di implementare. _Misurato 14/08:_ la colonna compare **solo** sull'accompagnatoria e **solo** senza DDT agganciato — `showLoadsStockColumn = isInvoiceAccompanying() && !hasLinkedDdt()` (`sales-document-form.component.ts:324`) — e quando è nascosta il salvataggio **forza `loadsStock: false`** (`:2175`). Sulla Nota di credito, così com'è, la casella non esisterebbe e non sarebbe spuntabile mai. **Quel `computed` va esteso, non riusato.**

**La nota di credito nasce con la casella non spuntata.** L'operatore la spunta quando la merce è tornata davvero.

_Misurato 14/08:_ il default **non** si imposta in `document-stock.constants.ts`. Viene da `documentTypeDefaultLoadsStock`, cioè dalla lista `NON_STOCK_DOCUMENT_TYPES` in `document-type.util.ts` — è lì che va `credit_note`.

Il criterio: chi non corregge deve finire nel caso meno dannoso. Nascendo spuntata su una nota per sconto o errore di prezzo, la giacenza si gonfia di merce inesistente e si vende online ciò che non si ha. Nascendo non spuntata su un reso vero, la giacenza resta bassa e non si vende ciò che si ha in negozio: errore che si scopre in negozio, non dal cliente.

**Il secondo argomento — «tanto la merce che rientra passa dal reso di negozio» — NON regge, ed è stato verificato.** _Misurato 14/08:_ il Reso vendita negozio copre **solo la cassa**. Accetta come origine soltanto un documento `store_sale` (`where: { type: DocumentType.store_sale }`, `store-sales.service.ts:269`), il suo DTO non ha `customerId`, e nasce da un unico punto, la cassa (`store-sale-register.component.ts:1064`). **Un cliente fatturato che rende merce non ha oggi altra strada che la nota di credito**, o un Arrivo merce separato.

Resta quindi valido il rischio del doppio carico, ma per **una via sola**: l'Arrivo merce separato. Se la merce rientra da lì, la nota non deve ricaricare — ed è il secondo motivo del default non spuntato. Danea documenta lo stesso caso.

**Il costo del movimento di ritorno viene dalla riga della fattura d'origine**, non dal costo corrente dell'articolo — come già fa il Reso vendita negozio con la vendita originale (`originalSaleUnitCostMinor`, costo congelato sul movimento). Senza, i margini dei report si sporcano al primo storno.

### Dove collocare `credit_note`: in nessuna delle liste esistenti

_Misurato 14/08._ `DEDICATED_WORKFLOW_DOCUMENT_TYPES` **è** `DOCUMENT_STOCK_LOAD_TYPES` — lo stesso array, aliasato (`document-defaults.ts:70`). E i tipi a flusso dedicato sono rifiutati dal percorso generico: `POST /documents` risponde **422** («Arrivi merce e documenti di carico si registrano con "Salva documento"…», `documents.service.ts:932`) e la conferma **409** (`:2227`).

Mettere `credit_note` fra i tipi che caricano la renderebbe quindi **increabile**: nasce nel registro Fatture, e il registro Fatture passa da `POST /documents`. Sarebbe il 422 dell'accompagnatoria una seconda volta, stavolta introdotto da noi.

**Deciso 14/08: si sgancia l'alias.** `DEDICATED_WORKFLOW_DOCUMENT_TYPES` prende i suoi tre tipi espliciti — arrivo merce, carico manuale, carico iniziale — e smette di essere un riferimento a `DOCUMENT_STOCK_LOAD_TYPES`. Poi si aggiunge il ramo di carico della nota di credito.

Sono poche righe, e tolgono un'affermazione implicita: oggi quell'uguaglianza dice «ogni tipo che carica ha una maschera dedicata». Era vera quando è stata scritta; con la Nota di credito smette di esserlo, e nessuno la toccherebbe.

_Aperto — tipo di movimento._ `StockMovementType.return` esiste già ed è quello che il Reso vendita negozio usa. Adottandolo, i report lo contano **già** a segno negativo (`return` è in `SALE_REPORT_MOVEMENT_TYPES`, e `sign = type === return ? -1 : 1`): il punto «una riga nei report» del costo qui sopra si azzera. Da confermare in implementazione.

**Stato: deciso 14/08, non iniziato. Restano aperte la verifica sull'inclusione documenti e il tipo di movimento.**

## §7 · Testata dell'accompagnatoria

_Misurato 14/08 sul database:_ `available()` restituisce **zero contatori** per `invoice_accompanying`. Interroga `documentCounter` col tipo grezzo, e per quel tipo non esiste né può esistere una riga — è escluso dai numeratori configurabili per costruzione. Risultato: testata senza numero proposto.

**La Nota di credito nascerà con lo stesso difetto**, perché ricade nella stessa esclusione. Non è una rifinitura: è la condizione perché il terzo tipo funzioni il primo giorno.

**Due punti d'innesto, non uno:**

1. `available()` — va corretta usando `documentNumberingType`
2. **Il pannello Numerazioni** aperto dall'ingranaggio accanto al campo Serie riceve il tipo grezzo e filtra `counter.type === type`: per accompagnatoria e nota di credito mostra zero righe. Senza questo, testata corretta e pannello vuoto.

**Stato: deciso 14/08, non iniziato.**

## §8 · Fuori scope

- **Fattura d'acconto e Autofattura.** Esistono in Danea nello stesso registro e arriveranno. La struttura deve ammetterli senza essere riaperta; non si implementano ora.
- **Sezionale separato per le note di credito** (§2).
- **Rendere i DDT nuovamente includibili dopo una nota di credito.** In Danea è un comando manuale nelle Opzioni. **Deciso 14/08: per ora i DDT restano bloccati.** Conseguenza da conoscere: quella merce non è più fatturabile da nessuno — un cliente che rende metà ordine e vuole rifatturare l'altra metà oggi non può. Registrato come cosa da fare.
- **Reso vendita negozio per clienti fatturati.** _Misurato 14/08:_ oggi il reso copre solo la cassa (§6). Estenderlo ai clienti fatturati è una funzione a sé, non un dettaglio della nota di credito.

## §9 · Materia del collega, non nostra

Deciso 14/08: la fatturazione elettronica non rientra nel perimetro attuale.

- **`documentTypeCode` TD04 per la Nota di credito.** Oggi `document-xml.service.ts` scrive TD01 costante per ogni documento; il tipo in `fatturapa-xml.util.ts` prevede già entrambi i valori.
- **Il `<Numero>` verso lo SdI**, che oggi manda `FT-0019` invece di `19` (`04-…§11`).

Entrambi in `06-note-merge-fatture.md`.

## §10 · Il 422 dell'accompagnatoria: causa isolata, caso positivo non provato

_Misurato 14/08._ I 422 osservati provengono da `assertStockUnloadDocument`, che pretende cliente, sede e variante su ogni riga. La numerazione arriva in fondo: con numero imposto 999 il rifiuto arriva dopo, allo scarico. Il 422 del 13/08 era un artefatto del payload di prova — la Fattura non scarica, l'Accompagnatoria sì, quindi lo stesso corpo dà 201 sull'una e 422 sull'altra.

**Non è stato provato che un payload completo dia 201.** Provarlo avrebbe creato una fattura fiscale vera con numero vero e scarico vero sul database condiviso. La causa è isolata; il caso positivo resta non verificato.
