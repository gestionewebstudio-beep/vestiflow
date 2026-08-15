# 07 · Specifica famiglia Fattura

**Data:** 14/08/2026 · **revisione 15/08/2026**
**Stato del documento:** piano, non consuntivo. Ogni voce porta il proprio stato. Nessuna voce va letta come già fatta se non lo dice.
**Owner:** Luigi
**Migration richiesta:** tutte **additive**, in tre pezzi distinti — (1) un valore enum (`credit_note`); (2) la ricostruzione dell'indice `documents_number_unique`; (3) la struttura delle **liste gestite** dei campi trasporto (§14), aggiunta il 15/08. Nessuna colonna sui documenti. Dettaglio operativo in `06-note-merge-fatture.md`.

⚠️ I punti (1) e (2) **non possono stare nella stessa migration**: in PostgreSQL `ALTER TYPE ... ADD VALUE` e l'uso del nuovo valore non convivono in una transazione, e Prisma esegue ogni file in una transazione. _Dedotto dal comportamento noto di Postgres, da verificare prima di applicare._ Il punto (2) fallisce se esistono una Fattura e una Nota di credito con lo stesso numero: **la verifica va rifatta nel momento in cui si applica**, non prima.

**Metodo.** Le voci marcate _misurato_ sono state verificate nel codice o sul database, con la data. Le voci marcate _dedotto_ sono ragionamenti non ancora verificati e non vanno implementate come certe. Danea è benchmark comportamentale, non requisito.

⚠️ **Cosa è cambiato nella revisione del 15/08**

- La regola del §5-bis secondo cui «la Nota di credito non ha la casella magazzino» è **ritirata**: la nota ha «Carica magazzino» sulle sole righe movimentabili, default non spuntato (§6). Il carico va innestato sul percorso per riga di `09-specifica-movimenti-per-riga.md`, non su quello aggregato.
- La fatturazione elettronica **non è più fuori perimetro** (§9): il ramo del collega viene eliminato e il lavoro si riscrive su `develop`.
- Sezioni nuove, promosse dalle decisioni del 15/08: **§11** inclusione documenti, **§12** righe di riferimento, **§13** nota di credito senza legame interno, **§14** campi trasporto e liste gestite, **§15** vincolo Shopify → Fattura, **§16** censimento del segno `credit_note` (da eseguire prima di scrivere l'elenco).

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

## §5-bis · Da dove nasce una fattura, e chi scarica il magazzino

**Fattura e Fattura accompagnatoria sono lo stesso documento.** L'unica differenza è che l'accompagnatoria porta **destinatario e destinazione**. Non differiscono per il magazzino, e non devono.

### La regola

> **Entrambe hanno la casella «Scarica mag.» per riga, sempre. Il documento scarica le righe spuntate.**
>
> **Il valore iniziale della casella lo decide l'ORIGINE**, non il tipo di documento.

| Origine della fattura            | La casella nasce | Perché                                    |
| -------------------------------- | ---------------- | ----------------------------------------- |
| articoli inseriti a mano         | **spuntata**     | la merce non è ancora uscita              |
| Ordine cliente interno           | **spuntata**     | scarica, e libera gli impegni dell'ordine |
| DDT vendita che ha già scaricato | **non spuntata** | è uscita col DDT                          |
| Ordine di canale già evaso       | **non spuntata** | è uscita col giro dell'ordine             |

**«La merce esce una volta sola» non è una regola da far rispettare: è l'origine a saperlo**, e lo dice spuntando o no. Non serve una condizione a livello di documento, non serve enumerare i casi, e il caso che arriverà domani non rompe niente — porta con sé la propria origine.

⚠️ **RITIRATO IL 15/08/2026.** Qui c'era scritto: _«La Nota di credito è fuori da questo meccanismo: non movimenta il magazzino (§6), quindi non ha la casella. La merce che rientra passa da un documento di carico separato.»_

**Quella regola non vale più**, ed è ritirata per dichiarazione esplicita, non riscritta in silenzio: era marcata «Deciso il 14/08» e un deciso si ritira nominandolo, altrimenti ricompare alla prima rilettura o al primo merge. La Nota di credito **ha** la casella «Carica magazzino», con default non spuntato — vedi §6, che è la versione in vigore.

_Perché era finita così:_ la revisione del 14/08 che ha spostato lo scarico dal tipo all'origine ha trattato la Nota di credito come un documento fuori dal meccanismo, mentre la decisione presa nella stessa giornata era l'opposto — rientro fisico **opzionale** e indipendente dall'effetto economico. Le due stesure hanno convissuto due giorni su documenti diversi senza che nessuno le mettesse a confronto.

### Cosa va cambiato — misurato 14/08

Il meccanismo per riga **esiste già e funziona**: è quello che l'accompagnatoria usa oggi. A bloccarlo sono tre cancelli, tutti chiusi **sul tipo** invece che sull'origine:

```ts
// 1. La colonna non compare sulla Fattura, e se è nascosta il salvataggio
//    forza loadsStock: false  (sales-document-form.component.ts)
showLoadsStockColumn = isInvoiceAccompanying() && !hasLinkedDdt();

// 2. Il default della riga viene dal TIPO, e `invoice_draft` è fra i tipi
//    che non movimentano  (document-type.util.ts)
documentTypeDefaultLoadsStock(type) = !NON_STOCK_DOCUMENT_TYPES.includes(type);

// 3. La conferma scarica solo per certi TIPI: la Fattura non scarica mai,
//    qualunque cosa dicano le caselle  (document-stock.constants.ts)
documentTypeUnloadsStockOnConfirm(type) = DOCUMENT_STOCK_UNLOAD_TYPES.includes(type);
```

- il **primo** va esteso alla Fattura;
- il **secondo** va spostato dal tipo all'**origine**;
- il **terzo** deve includere la famiglia fattura.

**La conversione ha già l'idea giusta, letta dal capo sbagliato.** Oggi imposta `loadsStock: dto.targetType === DocumentType.sales_ddt` — decide dal **tipo di destinazione**. Va girata sull'**origine**: «la merce è già uscita?». È la stessa riga, letta dall'altro verso.

### Conversione ≠ conclusione

Sono due cose che oggi VestiFlow tiene in una lista sola, ed è la causa di tre sintomi che sembravano separati.

|                 | Cosa fa                                                       | Cosa offre oggi                                                                                                             |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Conclusione** | fa uscire la merce                                            | `DOCUMENT_STOCK_UNLOAD_TYPES` = DDT vendita · Scarico manuale · Fattura accompagnatoria                                     |
| **Conversione** | genera un documento da un altro, **nessun effetto magazzino** | esiste per Proforma e DDT (`PROFORMA_CONVERT_TARGET_TYPES`, `SALES_DDT_CONVERT_TARGET_TYPES`), **non per l'Ordine cliente** |

_Misurato 14/08:_ il menù «Concludi ordine» offre esattamente `DOCUMENT_STOCK_UNLOAD_TYPES`. **Non è un elenco di documenti: è l'elenco di ciò che scarica.** Per questo la Fattura non c'è — non perché sia stata dimenticata, ma perché non scaricava.

Danea, dallo stesso punto, offre Proforma · DDT · Vendita al banco · Ricevuta fiscale · Fattura d'acconto · Fattura accomp. · Fattura: **la derivazione documentale, non lo scarico.**

**Da separare i due significati discendono tre cose che sembravano difetti distinti:**

| Sintomo misurato                                                               | Vera causa                                                      |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| la Fattura non può includere ordini                                            | non scaricava, quindi non «concludeva»                          |
| un ordine di canale non si aggancia (tre filtri: pannello, query, salvataggio) | agganciare consuma gli impegni, che l'evasione ha già consumato |
| l'esclusione dal registro corrispettivi è una spunta a mano                    | il legame da cui derivarla non poteva nascere                   |

Con la conversione applicata all'Ordine cliente **il canale smette di essere un problema**: convertire non tocca il magazzino, quindi non c'è ragione di escludere gli ordini online. Il divieto proteggeva dallo scarico, non dal canale.

**La conclusione resta com'è** — legata ai tipi che scaricano, e giustamente chiusa agli ordini di canale, che l'evasione l'hanno già avuta.

### Cosa ne consegue per il registro corrispettivi

L'esclusione di una vendita online dal registro (`08` §8) si **deriva** dal fatto che quell'ordine è stato **convertito** in un documento fiscale — non «agganciato», che è l'altra cosa. Il legame è `SalesOrder.documentId`, che esiste già; la cardinalità è già quella giusta (una fattura copre più ordini, un ordine non si spezza). **Nessuna migration, nessuna relazione nuova.**

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

### Il magazzino — regola in vigore, decisa 15/08

Il meccanismo per riga esiste già e non va inventato: `DocumentLine.loadsStock`, la colonna «Scarica mag.».

**Sulla Nota di credito la stessa casella si chiama «Carica magazzino»** (deciso 15/08). Con quantità positive e verso nel tipo documento, spuntarla **carica**: «Scarica mag.» sarebbe un'etichetta falsa. Danea può usare «Scarica» perché mette il segno nella quantità — modello scartato il 14/08.

_Misurato 15/08:_ l'etichetta «Carica magazzino» esiste già nell'applicativo, ma **solo sull'Arrivo merce** (`goods-receipt-line-card.component.html:114`). Sulla famiglia Fattura non c'è: è da aggiungere, non da riusare. La colonna delle righe è configurata in `sales-document-line-columns.config.ts:30` con etichetta fissa «Scarica mag.», e il componente riga la espone come `input()` (`sales-document-line-card.component.ts:83`, `loadsStockLabel`) — quindi il punto di innesto esiste e non serve un componente nuovo.

⚠️ **Sostituisce l'avviso «superato dal §5-bis» che stava qui**, ritirato insieme al paragrafo del §5-bis a cui rimandava.

> **La Nota di credito ha il controllo «Carica magazzino», sulle sole righe movimentabili, e nasce non spuntato.**

| #   | Regola                                                                                     | Nota                                                                           |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1   | Quantità e importi **positivi**                                                            | il verso lo dà il tipo documento, mai il segno nella quantità (§6, «Il segno») |
| 2   | Verso economico **negativo determinato dal tipo** `credit_note`                            | applicato da chi aggrega, non scritto nella riga                               |
| 3   | «Carica magazzino» **solo sulle righe movimentabili**                                      | riga con variante; servizi, abbuoni e righe economiche non l'hanno             |
| 4   | Default **non spuntato**, qualunque sia l'origine — anche generando la nota da una fattura | confermato osservando Danea, che si comporta allo stesso modo                  |
| 5   | Spuntata → la riga produce un **movimento positivo**                                       | tipo `StockMovementType.return`, che i report contano già a segno negativo     |
| 6   | Servizi e righe economiche → **nessun movimento**, mai                                     | il documento si salva lo stesso: la riga vale in denaro, non in pezzi          |
| 7   | Merce già rientrata con un altro documento → la nota **non ricarica**                      | l'operatore lascia la casella com'è nata. È il motivo per cui nasce spenta     |

**L'effetto economico è indipendente dal rientro fisico.** Una nota per sconto, errore di prezzo o abbuono non muove un pezzo; una nota per reso vero lo muove se l'operatore lo dichiara. Sono due piani, e la casella è ciò che li tiene separati.

**Righe miste, deciso 15/08.** Una Nota di credito può contenere nello stesso documento righe articolo con variante, righe servizio e righe economiche o libere. L'effetto fisico riguarda **solo** le prime.

_Misurato 15/08:_ non è una funzione da costruire. `DocumentLine.variantId` è già nullable (`schema.prisma:2257`), e il filtro che esclude le righe non movimentabili è già scritto e in esercizio — `if (!line.loadsStock || line.quantity <= 0 || !line.variantId) continue` (`document-stock-reconcile.util.ts:22`, e identico nei tre sync per riga). La nota che carica **eredita** quel comportamento instradandosi lì: non va aggiunta una regola, va usato il percorso giusto.

⚠️ **Vincolo di implementazione, non rifinitura.** Il carico della nota va innestato sul percorso **per riga** (`sourceLineId`) descritto in `09-specifica-movimenti-per-riga.md`, **non** su quello aggregato che lo scarico di vendita usa oggi. _Stato al 15/08: il percorso c'è._ Il salvataggio generico conserva l'identità delle righe (`09` §4-bis) e lo scarico di vendita scrive un movimento per riga che si aggiorna in posto (`09` §4-ter). Il carico della Nota di credito si innesta lì: è lo stesso meccanismo al contrario, non macchinario nuovo. Sul percorso per riga l'idempotenza è gratis per costruzione: quantità 1→2 riscrive lo stesso movimento, la spunta tolta lo elimina, il doppio salvataggio non duplica. Su quello aggregato l'operatore vedrebbe comparire righe «rettifica carico» al primo cambio di quantità — il difetto che la 09 esiste per chiudere.

---

### Come ci si è arrivati — cronaca, non regola

Il ragionamento qui sotto resta perché è quello che ha portato alla decisione, e perché il criterio del default vale ancora. Va letto con la tabella qui sopra davanti.

_Misurato 14/08, e vale per il §5-bis:_ la colonna compare **solo** sull'accompagnatoria e **solo** senza DDT agganciato — `showLoadsStockColumn = isInvoiceAccompanying() && !hasLinkedDdt()` (`sales-document-form.component.ts:324`) — e quando è nascosta il salvataggio **forza `loadsStock: false`** (`:2175`). È il primo dei tre cancelli da spostare dal tipo all'origine.

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

**Non è una contraddizione con la casella — misurato 15/08.** Mettere `credit_note` in `NON_STOCK_DOCUMENT_TYPES` e darle un ramo di carico sembrano tirare in direzioni opposte. Non lo fanno: quella lista ha **un solo consumatore in tutto il repository**, `documentTypeDefaultLoadsStock` (`document-type.util.ts:83`). Governa il **default della spunta di riga**, non se il documento possa movimentare — quello lo decidono `DOCUMENT_STOCK_UNLOAD_TYPES` e `DOCUMENT_STOCK_LOAD_TYPES`. La lista dice «nasce non spuntata»; il ramo di carico dice «cosa succede quando la spunti». Convivono.

**Stato: deciso 14/08, integrato 15/08 con la regola del magazzino. Non iniziato. Resta aperta la verifica sull'inclusione documenti; il tipo di movimento (`return`) è da confermare in implementazione.**

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
- **Rendere i DDT nuovamente includibili dopo una nota di credito.** In Danea è un comando manuale nelle Opzioni. **Deciso 14/08, riconfermato come confine il 15/08: per ora i DDT restano bloccati.** ⚠️ È un **confine dichiarato, non un rimando**: la rifatturabilità automatica dopo una nota **non si riapre in questo lavoro**, e chi implementa non deve introdurla di sua iniziativa perché «sembra mancare». Conseguenza da conoscere: quella merce non è più fatturabile da nessuno — un cliente che rende metà ordine e vuole rifatturare l'altra metà oggi non può. Registrato come cosa da fare, con la sua data.
- **Reso vendita negozio per clienti fatturati.** _Misurato 14/08:_ oggi il reso copre solo la cassa (§6). Estenderlo ai clienti fatturati è una funzione a sé, non un dettaglio della nota di credito.
- **Sconto extra a importo in euro.** _Deciso 15/08:_ lo Sconto extra resta **solo percentuale**. Nessun secondo campo, nessuna regola di priorità fra % e €, nessuna migration. Dettaglio e verifiche aperte in `06b` §A.4-bis.

## §9 · Fatturazione elettronica — non è più fuori perimetro

⚠️ **Aggiornato il 15/08.** Qui c'era scritto: _«Deciso 14/08: la fatturazione elettronica non rientra nel perimetro attuale»_, come materia del ramo del collega. **Non vale più.**

_Deciso 15/08:_ il ramo `feature/fattura-elettronica` **sarà eliminato** e la fatturazione elettronica si riscrive da zero su `develop`. Il suo unico commit è stato archiviato prima della cancellazione nel tag locale `archivio/fattura-elettronica`, e ciò che vale la pena riportare è estratto e confrontato con `develop` in **`06b-estrazione-fattura-elettronica.md`** — 68 file misurati, non ricordati.

Restano validi i due punti già noti, che ora sono lavoro nostro e non di altri:

- **`documentTypeCode` TD04 per la Nota di credito.** Oggi `document-xml.service.ts` scrive TD01 costante per ogni documento; il tipo in `fatturapa-xml.util.ts` prevede già entrambi i valori.
- **Il `<Numero>` verso lo SdI**, che oggi manda `FT-0019` invece di `19` (`04-…§11`).

⚠️ **Un vincolo tecnico da eseguire prima della cancellazione del ramo:** la migration `20260807020000_credit_note_document_type` va prelevata **identica** — stessa cartella, stesso contenuto. Il motivo è il **checksum**: Prisma memorizza un hash per nome di migration, e una migration nostra con nome diverso che aggiunge lo stesso valore all'enum renderebbe impossibile un rientro parziale futuro. _Misurato 15/08:_ non è ancora presente in `api/prisma/migrations/`, e il ramo non ha mai toccato il database condiviso.

## §10 · Il 422 dell'accompagnatoria: causa isolata, caso positivo non provato

_Misurato 14/08._ I 422 osservati provengono da `assertStockUnloadDocument`, che pretende cliente, sede e variante su ogni riga. La numerazione arriva in fondo: con numero imposto 999 il rifiuto arriva dopo, allo scarico. Il 422 del 13/08 era un artefatto del payload di prova — la Fattura non scarica, l'Accompagnatoria sì, quindi lo stesso corpo dà 201 sull'una e 422 sull'altra.

**Non è stato provato che un payload completo dia 201.** Provarlo avrebbe creato una fattura fiscale vera con numero vero e scarico vero sul database condiviso. La causa è isolata; il caso positivo resta non verificato.

---

## §11 · Inclusione documenti — un elenco filtrato, non una catena

**Deciso 15/08.**

⚠️ **Correzione a materiale precedente.** Le verifiche del 14/08 scrivono «catena attesa: Ordine cliente → DDT → Fattura» come se il percorso fosse cablato. **Non lo è.** Il documento non nasce dal suo predecessore designato: l'operatore apre un documento e sceglie cosa includerci, col pulsante «Includi documento». Chi implementa leggendo «catena attesa» costruisce un binario dove serve un elenco.

### I tre filtri

Ciò che compare in «Includi documento» è determinato, nell'ordine:

1. **Cliente** — solo i documenti di quel cliente. Finché il cliente non è scelto non c'è nulla da includere.
2. **Tipo** — solo i tipi che stanno a monte (tabella sotto).
3. **Stato** — solo i documenti non ancora consumati.

### Matrice dei tipi includibili — chiusa, nessuna riga dedotta

| Documento               | Può includere                            |
| ----------------------- | ---------------------------------------- |
| Ordine cliente          | Preventivi                               |
| DDT vendita             | Preventivi, Ordini cliente               |
| Fattura                 | Preventivi, Ordini cliente, DDT          |
| Fattura accompagnatoria | Preventivi, Ordini cliente — **mai DDT** |

L'accompagnatoria sostituisce il DDT nella stessa uscita: includerne uno sarebbe la stessa contraddizione di una Fattura dentro un DDT.

**La Nota di credito non è in questa tabella: non include nulla.** Nasce vuota dal menù «Nuovo», oppure viene **generata** da una fattura. Sono due gesti diversi e non vanno confusi — _includere_ = tiro dentro qualcosa che esiste già; _generare_ = da un documento aperto ne creo un altro. Danea li tiene distinti anche nell'interfaccia, con due pulsanti separati a piè di documento.

**Cardinalità: molti-a-uno.** In una fattura si possono includere più DDT.

### Il terzo filtro, «non ancora consumato»

Un documento incluso in un altro deve **sparire dall'elenco** per i successivi, o si fattura due volte la stessa merce.

_Misurato 15/08:_ sul DDT vendita esiste la casella **«Seguirà doc. di vendita»**. È una **dichiarazione d'intenzione**, spuntata dall'operatore _prima_ che la fattura esista; la fattura mostra solo i DDT così marcati. È un filtro diverso dagli altri due: la matrice dice quali _tipi_ sono ammessi, questa casella dice quali _documenti concreti_ compaiono.

**Default: non spuntata** (deciso 15/08). Criterio: chi non fa nulla finisce nel caso meno dannoso — un DDT interno non spuntato non sporca l'elenco degli includibili, mentre un DDT da fatturare non spuntato si scopre quando serve.

**Aperto:** se serva un avviso. Un DDT uscito senza spunta è invisibile alla fattura: la merce è consegnata, non risulta da fatturare, e ci si accorge quando il cliente non riceve la fattura.

### Due verifiche prima di scrivere

| #    | Domanda                                                                                                    | Perché conta                      |
| ---- | ---------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 11.1 | Il legame regge **tipi misti**? Due preventivi _e_ tre DDT nello stesso documento                          | decide se qui serve una migration |
| 11.2 | Come è modellato lo **stato di consumo**? Campo sul documento incluso, o dedotto dall'esistenza del legame | decide se serve una colonna       |

⚠️ _Misurato, e cambia il piano:_ `includeSourceKindsForDocumentType(type)` restituisce oggi `[]` per tutto tranne il DDT vendita (`06b` §D.15). Per la Fattura l'inclusione **non esiste ancora**: la strada è la conversione, non l'inclusione. Va letto prima di stimare questo punto.

---

## §12 · Righe di riferimento fra documenti collegati

**Deciso 15/08. Nessuna migration.**

> Ogni documento che nasce da un altro **copia le righe di riferimento presenti nel documento di partenza e vi aggiunge la propria**.

La catena si costruisce per **accumulo progressivo**, non risalendo i legami: nessuna query ricostruisce l'albero a monte. Ogni documento guarda il proprio predecessore diretto, ne eredita le righe di riferimento insieme alle altre righe, e in testa scrive il riferimento a quel predecessore.

| Documento          | Righe di riferimento presenti                         | Aggiunta propria |
| ------------------ | ----------------------------------------------------- | ---------------- |
| Ordine 122         | —                                                     | —                |
| DDT 17             | `Rif. Ordine 122`                                     | Ordine           |
| Fattura 19         | `Rif. DDT 17` · `Rif. Ordine 122`                     | DDT              |
| Nota di credito 20 | `Rif. Fattura 19` · `Rif. DDT 17` · `Rif. Ordine 122` | Fattura          |

_Verificato su Danea il 15/08: la Fattura mostra 5 voci (2 riferimenti + 3 prodotti), la Nota di credito 6._

**Sono righe di documento a tutti gli effetti**, non un campo di testata né un blocco fisso: occupano posizione nell'elenco, sono contate fra le voci, non hanno codice né quantità né importo, e sono **eliminabili a mano** come qualunque altra riga.

**Sono testo, non riferimenti strutturati** — ed è un vantaggio e un limite insieme. Vantaggio: la catena resta leggibile anche se un documento a monte viene cancellato; nessun join, nessuna dipendenza. Limite: non sono un dato interrogabile, e non ci si può costruire sopra un controllo o un filtro. Per quello serve il riferimento strutturato, che è cosa diversa e vive nel piano elettronico. **I due piani non si sostituiscono a vicenda.**

**Con più documenti inclusi non è una catena verticale.** L'inclusione è molti-a-uno (§11): includendo due preventivi si ottengono **due** righe `Rif. Preventivo`, più quelle che ciascuno si portava dietro. Le righe si **sommano**, non si incolonnano.

### Il meccanismo esiste già, e non è un meccanismo

_Dichiarato 15/08._ Non esiste una funzione dedicata ai riferimenti: quando un documento nasce da un altro **le righe vengono copiate**, e fra quelle ci sono anche le descrittive di riferimento — viaggiano insieme alle altre perché **sono righe come tutte**. In cima viene aggiunta quella che punta al predecessore diretto. Il testo lo compone già VestiFlow e **va bene così**: non è da definire, è da dichiarare come esistente.

| Documento      | Ha il meccanismo                                |
| -------------- | ----------------------------------------------- |
| DDT            | **sì**                                          |
| Ordine cliente | **sì**                                          |
| Fatture        | **«dovrebbe»** — ⚠️ da verificare, non assumere |

Quel «dovrebbe» va sciolto prima di scrivere: **se le Fatture non ce l'hanno, il lavoro non è estendere alla Nota di credito — è portare il meccanismo su tutta la famiglia.** Da nominare nello stesso passaggio: dove vive il codice che compone il testo, e se il formato è centralizzato o ripetuto per maschera. Se risultasse ripetuto, prima si unifica e poi si estende — aggiungere il terzo tipo a una logica già triplicata la triplicherebbe una quarta volta.

### Due punti aperti

| #    | Voce                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12.1 | **Incrocio con l'ordinamento per colonna** (decisione già in coda): un ordinamento alfabetico o per quantità **sparpaglia i riferimenti fra i prodotti**, e sono righe che l'operatore si aspetta in testa. Non si risolve ora, ma chi implementerà l'ordinamento deve saperlo |
| 12.2 | **Eliminazione manuale di una riga di riferimento**: il documento successivo eredita la catena mutilata. Accettabile o no?                                                                                                                                                     |

---

## §13 · Nota di credito senza legame a una fattura VestiFlow

**Deciso 15/08. Nessuna migration.**

**La Nota di credito non richiede alcun legame a una fattura VestiFlow.** Può nascere vuota dal menù «Nuovo» e riferire una fattura non presente a sistema — emessa prima dell'adozione del gestionale, o da un altro software — con i riferimenti inseriti a mano. Quando il legame c'è, i riferimenti si ereditano (§12); quando non c'è, **nulla si blocca**. Coerente con «controlli = avvisi, mai blocchi».

⚠️ **Conseguenza da scrivere, non da dedurre: senza legame non esistono né residuo accreditabile né controllo di over-credit.** Quei controlli valgono **solo sulle note legate a una fattura VestiFlow**. Se non è detto esplicitamente, chi implementa più avanti li darà per validi su tutte le note e costruirà un blocco dove manca il dato per reggerlo.

**Più note sulla stessa fattura: un avviso, non un blocco.** _Osservato su Danea 15/08:_ alla generazione della seconda nota compare l'elenco dei documenti già creati da quella fattura, con numero, data e importo, e si può procedere. Non richiede alcun legame riga-riga: basta sapere quali documenti sono nati da questo — informazione che il legame documento-documento già porta. **Nessuna migration.** Non è il controllo di over-credit e non va scambiato per tale: nulla impedisce di accreditare 300 su una fattura da 100.

**Il tipo documento elettronico è determinato, mai scelto** (deciso 15/08): `TD04` compare in sola lettura sulla nota di credito. E il modello da adottare per i campi che lo accompagnano è quello osservato: **il tipo governa l'abilitazione dei campi**, che restano inattivi finché non è scelto.

---

## §14 · Campi trasporto dell'accompagnatoria e liste gestite

**Stato: i campi esistono già — nessuna migration. Le liste gestite sono da fare — migration additiva.**

_Misurato 15/08:_ il DDT VestiFlow ha già l'intero set dei nove campi trasporto (causale, data e ora inizio, porto, incaricato, colli, peso, aspetto beni, codice spedizione, tracking). ⚠️ _Da verificare che vivano su `Document` e non su una struttura specifica del DDT:_ se sono già lì, l'accompagnatoria li riusa e basta.

### Liste gestite dall'utente — deciso 15/08

Quattro campi passano da testo libero a **combo box**: tendina con i valori disponibili, campo comunque scrivibile per il caso fuori lista.

**Causale trasporto · Incaricato del trasporto · Aspetto beni · Porto** (l'ultimo è già a tendina).

**Perché non testo libero:** un negozio scrive «Vendita» su ogni DDT per anni. A mano diventa `vendita`, `Vendtia`, `Vendita ` — e i filtri smettono di funzionare.

**Ogni lista ha la sua maschera di gestione**, aperta da un pulsante accanto al campo. I campi che portano quel pulsante sono **quattro**, e vanno nominati esplicitamente in implementazione.

**Nessun valore predefinito — i campi nascono vuoti** (deciso 15/08). Danea ha una colonna «Predef.» nella maschera di gestione; **VestiFlow non la adotta**. Quello che invece si trasferisce: i campi trasporto compilati sul DDT **passano alla Fattura che lo include**, come qualunque altro dato che viaggia con l'inclusione. L'unica cosa precompilata sono gli **indirizzi**, e non è un predefinito: vengono dall'anagrafica del destinatario e poi il documento è fermo — i dati si **copiano al salvataggio**, non si rileggono dall'anagrafica (nessuna modifica retroattiva automatica).

**Seed iniziale: uguale per tutti, poi modificabile** (deciso 15/08). Ogni tenant nuovo nasce con gli stessi valori; da lì ciascun negozio li modifica. La lista non nasce vuota — un negozio che debba creare una causale prima di salvare il primo DDT sarebbe un blocco, non un avviso — ma il seed resta **minimo**: serve a non trovare il vuoto, non a indovinare come lavora ognuno.

Esempio dichiarato per l'incaricato: `Mittente`, `Destinatario`, `BRT`. I primi due non sono corrieri: sono i **ruoli previsti dalla normativa DDT**, ci sono sempre.

⚠️ **Causali osservate in Danea, da verificare col commercialista prima di adottarle come seed:** `C/Lavorazione`, `C/Riparazione`, `C/Visione`, `Conto Vendita`, `Reso`, `Reso da conto Vendita`, `Vendita`, `Vendita On-line`. Due cose da notare: `Vendita On-line` è una causale a sé, pertinente al canale Shopify; e il conto vendita ha **due voci accoppiate**, andata e ritorno, distinte dal `Reso` ordinario — nell'abbigliamento è pratica comune.

⚠️ **Migration additiva.** Serve la struttura per le liste, con valore, ordine e ambito tenant, **senza colonna predefinito**. Due forme possibili: una tabella per lista (esplicita, quattro tabelle) oppure una tabella unica con discriminante (`tipo`, `valore`, `tenant`; le liste future non costano nulla). _Scelta tecnica da nominare, non decisa._

### Il documento incompleto si salva

**Due avvisi, entrambi non bloccanti.** Chi compila un DDT alle sette di sera col corriere che aspetta non deve restare fermo perché non sa il numero dei colli.

1. **Campi obbligatori mancanti al salvataggio** → il sistema segnala cosa manca e chiede se procedere.
2. **Valore mancante con proposta automatica** → «Data/ora inizio trasporto non inserita: vuoi impostare quella attuale?», con casella **«Non mostrare più questo messaggio»**.

È lo stesso schema del controllo cronologico sui numeri documento: **avviso persistente con dismiss**. Vale la pena registrarlo come **modello ricorrente** — campo non compilato → avviso con proposta di valore → dismiss per chi lo sa già. _Da allineare:_ nel controllo cronologico il dismiss è per operatore e irreversibile; qui non è dichiarato.

**Aperto (14.1):** il documento salvato incompleto resta segnalato dopo? Danea non lo mostra. Per VestiFlow conta, perché i documenti incompleti sono quelli che poi bloccano la fatturazione elettronica: un DDT senza causale passa, una fattura senza partita IVA no.

---

## §15 · Fattura originata da un ordine di canale — il vincolo Shopify

**Deciso 15/08.** Non è un modulo nuovo: è un **ponte** fra due lavori già fatti, e senza di esso fra un mese la fattura di una vendita Shopify verrà ricostruita con il motore dell'ordine manuale.

> **Una Fattura originata da una transazione di canale conserva i valori economici e fiscali ricevuti dal canale. Non li ricostruisce con il motore manuale né con i default dell'anagrafica corrente.**

| Vincolo                                                                                                               | Fonte                                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Gli importi della transazione si **conservano**, non si ricalcolano                                                   | regola della fotografia, 15/08                |
| Le `discount_allocations` Shopify sono **snapshot storici**: non si ricalcolano né si ridistribuiscono                | `01-registro-difetti-shopify.md`, prova #1010 |
| Lo **sconto ordine Shopify** resta distinto dallo **Sconto extra documento** di VestiFlow                             | §A.4-bis di `06b`                             |
| L'IVA della spedizione e le informazioni fiscali si **conservano quando disponibili**, non si deducono per differenza | `01`, §IVA dedotta                            |
| Una vendita con **IVA estera** non diventa una fattura al 22% perché il prodotto VestiFlow ha 22% come default        | 15/08                                         |

**Resta aperta** la questione netto/ivato degli ordini di canale: finché quella regola non è chiusa, **non chiamare «Imponibile» un valore ottenuto sottraendo l'IVA dal totale**.

⚠️ **Prima di implementare va letto il percorso reale** che porta da Ordine/Vendita online a Fattura. Scrivere la regola non basta: va verificato dove quel percorso ricalcola oggi.

---

## §16 · Il segno della Nota di credito nelle aggregazioni — censimento da fare

**Aperto. Prima si misura, poi si scrive.**

Il verso negativo lo dà il tipo documento (§6), e questo significa che **ogni punto che somma importi deve conoscere `credit_note`**. La `07` ne nomina due, misurati il 14/08: il totale della selezione (`document-list.component.ts:645`) e l'export CSV e stampa (`document-list-export.util.ts`).

**Non sono necessariamente tutti.** I luoghi da censire prima di dichiarare l'elenco: elenco documenti, totale della selezione, export CSV, PDF e stampe, report di vendita, riepiloghi IVA, dashboard, registro corrispettivi.

⚠️ **Il censimento va eseguito e riportato prima di aggiornare questa sezione con l'elenco vero.** Scrivere qui sette punti perché sette ne sono stati ipotizzati, quando il repository ne ha quattro o dodici, produce esattamente il tipo di specifica che questo documento evita: un elenco che sembra misurato e non lo è.

---

## §17 · La riga Fattura: cinque colonne che le altre maschere hanno

**Deciso 15/08: entra nel lavoro della famiglia Fattura.** Non aspetta più il rientro di `feature/fattura-elettronica` — quel ramo viene eliminato, e con lui è sparito il proprietario di questo lavoro. Non iniziato.

La riga della Fattura è oggi `variantId · description · quantity · unitPrice · vatCodeId · discountPercent · loadsStock`. Rispetto a DDT e Ordine cliente mancano cinque colonne, **e non hanno tutte la stessa natura** — la distinzione va tenuta, perché decide chi le vede e dove stanno:

| Colonna          | Natura                              | Nota                                                                       |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Q.tà disponibile | **informazione gestionale interna** | non è un dato del documento: si legge, non si salva                        |
| Costo d'acquisto | **informazione gestionale interna** | solo col permesso «Visualizza costi d'acquisto», come nelle altre maschere |
| U.m.             | **dato del documento**              | vedi sotto: la colonna esiste già sulla riga                               |
| Prezzo scontato  | **lettura economica**               | derivato, non editabile                                                    |
| Totale riga      | **lettura economica**               | calcolato, **non editabile**                                               |

**Riuso, non seconda implementazione.** Le celle e i calcoli esistono: `app-document-line-unit-cell` per l'unità di misura, e le formule di riga che DDT e Ordine cliente già usano. Una seconda copia di quelle formule dentro la Fattura sarebbe il difetto, non la funzione.

### ⚠️ L'unità di misura non è «non mostrata»: viene cancellata

_Misurato 15/08, catena intera._ Il dato **non si perde per strada** — si perde perché la maschera non lo produce, e poi lo azzera:

| Anello                                            | Stato                                              |
| ------------------------------------------------- | -------------------------------------------------- |
| Colonna `DocumentLine.unitOfMeasure`              | esiste                                             |
| DTO di ingresso (`create`/`update`)               | la accetta (`create-document.dto.ts:57`)           |
| Servizio, persistenza, copia da documento incluso | la trasporta (`documents.service.ts:1699`)         |
| Modello e mapper frontend                         | la leggono e saprebbero inviarla                   |
| **Maschera Fattura**                              | **non ha né colonna né controllo, e non la invia** |

E qui sta il difetto vero: `computeLines` scrive `unitOfMeasure: line.unitOfMeasure?.trim() \|\| null`. Un salvataggio che non manda il campo **lo azzera**. Una fattura che ha ereditato l'unità di misura da un DDT incluso la perde al primo salvataggio dalla sua maschera, in silenzio.

**Vincolo per chi implementa:** si usa `DocumentLine.unitOfMeasure`, che c'è. Nessun secondo campo.

---

## §18 · La rotta di modifica non porta il tipo

**Deciso 15/08: entra nel lavoro della famiglia Fattura.** Non aspetta più il ramo FE. Non iniziato.

_Misurato 13/08:_ Proforma, Fattura e Fattura accompagnatoria condividono **una sola rotta di modifica** e nei suoi `data` non c'è `salesDocumentType`. Finché il documento non arriva dalla rete, `documentType()` ricade sul predefinito **Proforma per tutti e tre**.

È lo stesso difetto che il §4 chiude per la creazione, e la regola è già decisa lì: **il tipo è dichiarato nell'indirizzo, non dedotto leggendo il documento**. Vale anche per la modifica, e per la Nota di credito dal primo giorno.

**Prima di correggere — censimento, non solo la rotta.** Vanno trovati e nominati tutti i punti che portano a quella rotta e tutti quelli che la leggono: collegamenti di creazione, collegamenti di modifica dagli elenchi e dai dettagli, generazioni da altri documenti, ritorni dopo il salvataggio. Correggere la rotta senza aver censito chi la costruisce lascia indietro i chiamanti che continuano a non dichiarare il tipo.

**I test devono dimostrare la cosa giusta**, cioè che **prima della GET** titolo, comportamento e tipo sono già corretti: un test che verifica dopo il caricamento passerebbe anche oggi.

_Cosa se ne vede finché non è corretto:_ titolo «Modifica proforma» su una fattura, dicitura «Documento non fiscale» stampata sopra un documento fiscale, tendina Serie che parte con le serie sbagliate. E fino al 15/08 anche un `type` sbagliato spedito al server — quel campo non viaggia più (vedi la nota nel salvataggio), ma la causa resta.
