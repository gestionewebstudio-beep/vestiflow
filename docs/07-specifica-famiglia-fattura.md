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

### La verifica di collisione, prima di applicare l'indice

L'indice unico si ricrea partizionando sul **numeratore**, quindi `CREATE UNIQUE INDEX` fallisce se due documenti dello stesso tenant e della stessa serie portano lo stesso numero fra i tipi che il `CASE` unifica. Va verificato **nel momento in cui si applica**: il database è condiviso e il ramo del collega è attivo.

```sql
SELECT tenant_id, series, number, COUNT(*) AS quanti,
       STRING_AGG(DISTINCT type::text, ', ') AS tipi,
       STRING_AGG(reference, ' | ') AS riferimenti
FROM documents
WHERE number IS NOT NULL
  AND type IN ('invoice_draft', 'invoice_accompanying', 'credit_note')
GROUP BY tenant_id, series, number
HAVING COUNT(*) > 1;
```

_Eseguita il 15/08 (senza `credit_note`, che ancora non esiste): **zero righe**._ L'unico documento numerato della famiglia è `FT-0001`, un'accompagnatoria senza serie, numero 1. L'indice reggerebbe — ma la query va rifatta, non riusata.

### Avviso all'operatore

Con percorsi separati per tipo (§4), l'operatore vede tre voci distinte e conclude naturalmente che le numerazioni siano tre. Serve un'informazione passiva accanto al campo Numero in testata, che spieghi il progressivo condiviso.

Informazione passiva, non conferma attiva (cfr. sistema aiuti, punto 2). **Da dichiarare l'equivalente mobile**, dove il passaggio del mouse non esiste: tocco sull'icona o riga sotto il campo. Senza, l'informazione la vede metà degli operatori.

**Stato: il numeratore condiviso è ✅ fatto e applicato (§19); l'avviso all'operatore è deciso 14/08 e NON iniziato.**

## §3 · Elenco

Un solo elenco «Fatture», con i tre tipi insieme e la colonna «Tipo doc.».

_Misurato 14/08:_ il profilo `invoice` in `document-sales-register.config.ts` porta già `types`, `typeFilterOptions` e `createVariants`. Una terza voce = tre array e una rotta.

Il sottotitolo va riscritto: oggi dice «Fatture fiscali da inviare al commercialista, con o senza trasporto merce incluso», che non comprende le note di credito.

**Stato: ✅ fatto il 15/08 — vedi §20.**

## §4 · Percorsi

**Ogni tipo ha il suo percorso.** Il tipo è dichiarato nell'indirizzo, non dedotto leggendo il documento dal database.

**Il motivo, già misurato in `03-specifica-unificazione-righe-documento.md` §4.11:** senza il tipo nel percorso, `documentType()` ricade su Proforma per tutti e tre. Si vede a schermo — titolo «Modifica proforma» su una fattura, dicitura «Documento non fiscale / Proforma non valida ai fini IVA» stampata sopra un documento fiscale, tendina Serie che parte con le serie sbagliate. Due richieste che non si annullano a vicenda.

_Nota:_ l'argomento «i permessi si controllano prima della lettura» **non regge** ed è stato scartato: i tre tipi stanno nella stessa famiglia `invoice`, quindi il controllo è identico con o senza tipo nel percorso.

Prezzo accettato: i collegamenti a documenti già emessi cambiano forma. Con zero clienti in produzione il prezzo è teorico, ed è l'unica finestra in cui questa scelta costa poco.

**Stato: ✅ fatto il 15/08 — vedi §20.**

## §5 · Creazione

Dal pulsante «Nuovo» si sceglie il tipo, tramite **menù a tendina** con tre voci.

_Misurato 14/08:_ oggi il pulsante è unico e la sua etichetta segue il filtro Tipo attivo, ricadendo sulla Fattura semplice quando il filtro è «Tutti». Quel legame va sciolto.

Scelta la tendina e non tre pulsanti affiancati perché la barra non si allunga quando arriveranno altri tipi.

**Stato: ✅ fatto il 15/08 — vedi §20.**

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

## §7 · Testata dell'accompagnatoria — ✅ **già corretto, misurato il 15/08**

⚠️ **Questa sezione descriveva un difetto che non c'è più.** Diceva che `available()` interroga `documentCounter` col tipo grezzo e restituisce zero contatori per l'accompagnatoria — testata senza numero proposto — e che il pannello Numerazioni filtra `counter.type === type`.

_Misurato il 15/08, entrambi i punti sono chiusi:_

| Punto                | Stato                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `available()`        | usa **`documentNumberingType(type)`** (`document-counters.service.ts:171`), col commento che spiega perché               |
| Pannello Numerazioni | il dialogo Serie usa lo **specchio frontend** `documentNumberingType` (`document-series-manager-dialog.component.ts:56`) |

**Cosa resta vero, e vale per la Nota di credito:** i due punti funzionano _perché_ la mappatura al numeratore è centralizzata. La nota li eredita **gratis**, a patto che `credit_note` sia aggiunta alla mappatura — vedi §19, dove i punti da toccare sono elencati e sono tre, non due.

**Stato: superato dai fatti. Nessun lavoro qui.**

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

**Deciso 15/08: entra nel lavoro della famiglia Fattura.** Non aspetta più il ramo FE. ✅ **Fatto il 15/08** — vedi §20.

_Misurato 13/08:_ Proforma, Fattura e Fattura accompagnatoria condividono **una sola rotta di modifica** e nei suoi `data` non c'è `salesDocumentType`. Finché il documento non arriva dalla rete, `documentType()` ricade sul predefinito **Proforma per tutti e tre**.

È lo stesso difetto che il §4 chiude per la creazione, e la regola è già decisa lì: **il tipo è dichiarato nell'indirizzo, non dedotto leggendo il documento**. Vale anche per la modifica, e per la Nota di credito dal primo giorno.

**Prima di correggere — censimento, non solo la rotta.** Vanno trovati e nominati tutti i punti che portano a quella rotta e tutti quelli che la leggono: collegamenti di creazione, collegamenti di modifica dagli elenchi e dai dettagli, generazioni da altri documenti, ritorni dopo il salvataggio. Correggere la rotta senza aver censito chi la costruisce lascia indietro i chiamanti che continuano a non dichiarare il tipo.

**I test devono dimostrare la cosa giusta**, cioè che **prima della GET** titolo, comportamento e tipo sono già corretti: un test che verifica dopo il caricamento passerebbe anche oggi.

_Cosa se ne vede finché non è corretto:_ titolo «Modifica proforma» su una fattura, dicitura «Documento non fiscale» stampata sopra un documento fiscale, tendina Serie che parte con le serie sbagliate. E fino al 15/08 anche un `type` sbagliato spedito al server — quel campo non viaggia più (vedi la nota nel salvataggio), ma la causa resta.

---

## §19 · Checkpoint strutturale — censimento, misurato il 15/08/2026

Fotografia dello stato **prima** di unificare il registro. Serve a due cose: dire quanto è grande la superficie da toccare, e impedire che si cambino file alla cieca.

### La superficie è piccola, ed è centralizzata

| Cosa                                  | Dove vive oggi                                                                                                                                        | Stato                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Elenco Fatture                        | profilo `invoice` in `document-sales-register.config.ts`                                                                                              | `types` = due tipi, `typeFilterOptions` = tre voci (Tutti, Fattura, Accompagnatoria), `createVariants` = due voci |
| Elenco separato delle Note di credito | **non esiste**                                                                                                                                        | il tipo non esiste ancora                                                                                         |
| Voce di navigazione                   | hub Documenti: **due** voci (`Fattura`, `Fattura accompagnatoria`) che puntano allo **stesso** elenco con `queryParams.type` a preimpostare il filtro | ne servirà una terza, non una pagina                                                                              |
| Permessi                              | famiglia `invoice` — una sola per tutti e tre i tipi                                                                                                  | ⚠️ **qui il censimento aveva scritto «nessun lavoro»: sbagliato** — vedi sotto                                    |
| Rotte di creazione                    | `fattura/new`, `fattura-accompagnatoria/new`                                                                                                          | ne manca una per la nota                                                                                          |
| Rotta di modifica                     | **una sola**, `sales/:id/edit`, **senza** `salesDocumentType` nei `data`                                                                              | è il difetto del §18                                                                                              |
| Costruttore dei link di modifica      | **uno solo**: `documentEditPath` in `document-routing.util.ts`                                                                                        | correggere la rotta = cambiare una funzione, non inseguire i chiamanti                                            |

**La conseguenza pratica del censimento**: registro e rotte sono la stessa superficie — il «Nuovo ▾» _è_ un elenco di link di creazione — e i chiamanti dei link passano tutti da una funzione sola. Il lavoro è quindi contenuto, e va fatto in un blocco solo per non toccare gli stessi file due volte.

### La numerazione: tre punti, non due

La mappatura «quale tipo possiede il numeratore» è centralizzata, e tutto il resto la eredita (`available()`, pannello Serie, cronologia, proposta del numero). Per la Nota di credito vanno toccati:

1. `api/.../document-type.util.ts` → `documentNumberingType` — la nota numera sotto `invoice_draft`;
2. `api/.../document-type.util.ts` → `documentNumberingTypes` — il ramo `invoice_draft` deve restituire **tre** tipi, o chi legge la partizione ne vede due terzi e propone numeri già occupati;
3. `src/app/domain/documents/models/document-numbering.util.ts` → lo **specchio frontend**, che il dialogo Numerazioni usa.

Più il `CASE` dell'indice unico, che della mappatura è la quarta faccia — la migration del 11/08 lo dice a chiare lettere: _«se un domani un altro tipo dovesse condividere il numeratore, va aggiunto QUI oltre che in `documentNumberingType`»_.

### Le due migration, pronte e **non applicate**

| Ordine | Cartella                                           | Contenuto                                                         | Perché separata                                                                                                                                                                      |
| ------ | -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1      | `20260807020000_credit_note_document_type`         | `ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'credit_note'` | **Ripresa identica** dal ramo `feature/fattura-elettronica`, byte per byte (307 byte), prima che il ramo sparisca                                                                    |
| 2      | `20260815210000_credit_note_numerazione_condivisa` | `DROP INDEX` + `CREATE UNIQUE INDEX` col `CASE` esteso alla nota  | `ALTER TYPE ... ADD VALUE` può stare in transazione, ma il valore **non è utilizzabile finché quella transazione non ha fatto commit**, e Prisma esegue ogni file in una transazione |

_Verificato in sola lettura il 15/08 sul database condiviso:_

- **nessuna delle due risulta applicata** (`_prisma_migrations`: 119 righe, l'ultima del 14/08, nessuna col nome cercato) — quindi **nessun checksum registrato da rispettare**: prenderla identica resta la scelta prudente verso una storia che non controlliamo, non un vincolo assoluto;
- `credit_note` **non è nell'enum**: 19 valori;
- l'indice attuale è esattamente il `CASE` con la sola accompagnatoria;
- **zero collisioni di numero** fra i tipi che condivideranno il contatore (§2): l'indice reggerebbe.

⚠️ **Le misure sul database valgono il giorno in cui sono state fatte.** Il database è condiviso e il collega è attivo: prima del `prisma:deploy` vanno rifatte, in particolare collisioni e stato migration.

**Stato: ✅ APPLICATE il 16/08/2026** sul database condiviso, con `npm run prisma:deploy`, su via esplicito di Luigi.

#### Il checkpoint prima dell'applicazione, e cosa ha dato

Chiesto e fatto in sola lettura: pending **solo le due** attese; **nessuna** migration fallita o incomplete; `credit_note` assente dall'enum (19 valori); collisioni misurate col bucket esatto — non sui `reference` — **zero**; l'indice esisteva una volta sola e nessun vincolo dipendeva da lui; PostgreSQL **17.6**; nome temporaneo libero.

Due cose emerse dal checkpoint, che valgono da registrare:

- **Le sei migration «sconosciute» non lo erano.** `migrate status` segnalava sei migration nel database e assenti in locale: sono tutte di `origin/feature/cassa`, commit del 6–7 agosto, ramo sospeso. **Non toccano** `DocumentType` né `documents_number_unique`; nominano `documents` solo come bersaglio di chiavi esterne (`store_sale_payments`, `fiscal_receipts`, `corrispettivo_entries`). Nessuna interferenza.
- **`BEGIN`/`COMMIT` espliciti dentro una migration sono stati valutati e scartati.** Prisma applica ogni file già dentro una transazione: un `BEGIN` annidato è un no-op, ma il `COMMIT` chiuderebbe **in anticipo** la transazione di Prisma, togliendo la rete invece di aggiungerla. La variante _create-first_ (indice nuovo con nome temporaneo, poi `DROP` del vecchio, poi `RENAME`) resta la forma corretta se un domani si volesse la protezione anche senza quel presupposto — non è stata adottata perché il file era già committato e la protezione transazionale bastava.

#### Le verifiche subito dopo — tutte verdi

| Verifica                                                                                                 | Esito                                                                         |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Le due migration applicate, concluse, non annullate                                                      | ✅ 1 passo ciascuna                                                           |
| Migration fallite                                                                                        | ✅ nessuna                                                                    |
| `credit_note` nell'enum                                                                                  | ✅ 20 valori                                                                  |
| `documents_number_unique` presente una volta sola                                                        | ✅                                                                            |
| Indici temporanei residui                                                                                | ✅ nessuno                                                                    |
| Accompagnatoria **e** Nota di credito mappate su `invoice_draft`, `NULLS NOT DISTINCT`, `WHERE` parziale | ✅                                                                            |
| Collisioni                                                                                               | ✅ 0                                                                          |
| Documenti totali                                                                                         | ✅ 104, invariati                                                             |
| Note di credito create automaticamente                                                                   | ✅ nessuna                                                                    |
| `FT-0001`                                                                                                | ✅ intatta — accompagnatoria, n. 1, senza serie, confermata, totale invariato |
| Elenco Fatture con filtro «Tutti»                                                                        | ✅ **torna a funzionare** (era la query che dava `22P02`)                     |
| Fattura/Accompagnatoria esistenti apribili con le righe                                                  | ✅                                                                            |

⚠️ **Nota per chi rileggerà l'indice:** Postgres normalizza `IN (a, b)` in `= ANY (ARRAY[…])`. La definizione finale **non contiene** la stringa `IN (` — il controllo va fatto sui due valori, non sulla sintassi.

**Applicate senza punto di ripristino, per decisione esplicita.** Il database è su Supabase Free (nessun backup gestito), nessun backup manuale è mai stato fatto, e `pg_dump` non è installato. La scelta è stata presa sapendo che **nessuna delle due migration tocca dati**: una aggiunge un valore a un enum, l'altra ricostruisce un indice. Resta il fatto che il progetto non ha alcun punto di ripristino — e la prima operazione che tocca davvero i dati (la normalizzazione delle 104 `reference`, `04-…§11` decisione 3) **non va aperta prima di averlo**.

### Il pacchetto `credit_note` lato codice — fatto il 15/08, database non toccato

Primo passo eseguito: il tipo esiste nel codice, in tutte le mappe, **senza** che il database lo conosca. Tutto verde — API 1583 test, frontend 1396, componenti 424, type-check pulito sui due lati.

**Le sette classificazioni**, ciascuna decisa una per una e non per somiglianza di nome:

| Elenco                                  | La nota entra? | Con quale avvertenza scritta nel codice                                                                                                                                     |
| --------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCUMENT_TYPES`                        | sì             | —                                                                                                                                                                           |
| `SALES_INVOICE_DOCUMENT_TYPES`          | sì             | —                                                                                                                                                                           |
| `ACCOUNTANT_DOCUMENT_TYPES`             | sì             | ⚠️ deve entrarci **col verso negativo**: renderla visibile senza applicare il segno la fa sommare come una fattura in più, e il commercialista legge uno storno come ricavo |
| `PRICE_MODE_VAT_INCLUDED_DEFAULT_TYPES` | sì             | ⚠️ vale per la nota **creata vuota**; una nota generata da una fattura **eredita il modello dell'origine** — il default non deve sovrascriverlo                             |
| `NON_STOCK_DOCUMENT_TYPES`              | sì             | ⚠️ significa **solo** casella magazzino spenta di default, non «non movimenta mai»                                                                                          |
| `HAS_PRINTED_SHEET` / `PRINT_KIND`      | sì             | foglio stampato, famiglia `sales`                                                                                                                                           |
| famiglia permessi `invoice`             | sì             | chi emette fatture deve poterle stornare: un permesso separato darebbe metà mestiere                                                                                        |

#### Due guardie hanno preso il difetto che il censimento aveva mancato

La riga «Permessi → nessun lavoro» della tabella qui sopra era sbagliata: la mappa tipo → famiglia è **esplicita**, e va completata **su entrambi i lati**. Non l'ha scoperto una rilettura, l'hanno fatto fallire due test che nessuno aveva scritto per questa occasione:

- `ogni DocumentType ha una famiglia (nessun tipo orfano)` — API;
- `nessun tipo del catalogo frontend resta senza famiglia` — il suo gemello web.

Un terzo test — la partizione del numeratore — è diventato rosso perché leggeva due tipi e ora ne legge tre: è la prova che la numerazione condivisa funziona davvero.

**Vale la pena registrarlo come metodo, non come aneddoto**: il censimento aveva letto le mappe e concluso «nessun lavoro» perché la famiglia `invoice` esisteva già. Ciò che gli era sfuggito è che l'appartenenza va **dichiarata**, non ereditata. Un censimento fatto leggendo può sbagliare così; una guardia che pretende una decisione positiva per ogni tipo, no.

#### Il prefisso `FT` **non è una decisione**

La nota usa `FT` come fallback perché il progressivo è uno solo per i tre tipi: prefissi diversi sullo stesso contatore darebbero `FT-0005` e `NC-0006`, che si leggono come due numerazioni mentre sono la stessa.

Ma la questione vera è un'altra e non appartiene a questo documento: **`04-…§11` ha deciso di togliere sigla e zeri dal numero visibile di tutti i documenti.** Quando §11 sarà eseguita, questa riga cade insieme a tutte le altre. Il commento nel codice lo dice esplicitamente, perché chi la leggerà non debba ricostruirlo.

---

## §20 · Registro unico e rotte — ✅ **fatto il 15/08/2026**, database non toccato

Chiude §3 (elenco), §4 (percorsi), §5 (creazione) e §18 (rotta di modifica). Verde: **1408** test frontend, **427** di componente, type-check e `npm run lint` (tutti e otto i controlli) puliti.

### Il registro

Un elenco solo, «Fatture», con i **tre** tipi. `types` li prendeva già da `SALES_INVOICE_DOCUMENT_TYPES`, quindi il lavoro era attorno: quarta voce nel filtro «Tipo» e sottotitolo riscritto (diceva «con o senza trasporto merce incluso», che le note di credito non le comprende).

La colonna «Tipo doc.» non è stata toccata: esisteva già e legge `documentTypeLabel`, che il pacchetto `credit_note` aveva già esteso.

**Aggiunta non richiesta, e la nomino**: la Nota di credito è entrata anche nel menu «Altro documento» del registro generico, dove Fattura e Accompagnatoria c'erano già. Un menu che elenca due tipi su tre di una famiglia fa cercare il terzo altrove.

> ⚠️ **Questa sezione, il 15/08, dichiarava fatte due cose che non lo erano**: «terza voce in «Nuovo ▾»» e la terza card nell'hub come soluzione buona. Il ▾ **non esisteva**, e le tre card poggiavano su un difetto. Corretto il 16/08 — vedi §22, che è il seguito di questa sezione e va letto con lei.

### Le rotte: una per tipo, generate da una mappa sola

`sales/:id/edit` **non esiste più**. Al suo posto quattro rotte di modifica — una per tipo della maschera vendita — generate da `SALES_FORM_ROUTE_SEGMENT`, che è la **fonte unica** dei segmenti: da lì nascono creazione, modifica, duplicazione e i collegamenti dell'elenco.

È una mappa esaustiva (`Record<SalesFormDocumentType, string>`), non un elenco: **un quinto tipo aggiunto alla famiglia non compila** finché non gli si dà un indirizzo. Per ottenerla è stata tolta l'annotazione `readonly DocumentType[]` da `SALES_FORM_DOCUMENT_TYPES`, che allargava il tipo e impediva di derivarne l'unione.

**Il ripiego a Proforma non è stato reso più intelligente: è stato tolto il caso che lo rendeva necessario.** `routeType` ora è obbligatorio (`requireSalesDocumentType`) e una rotta senza tipo si ferma con un errore leggibile — perché su una fattura «comportarsi da proforma» significa stamparci sopra «non valida ai fini IVA», e una pagina che non si apre è un difetto che si vede, mentre un documento fiscale vestito da proforma no.

**Un guadagno non previsto**: le rotte per tipo chiedono il permesso **esatto**. La vecchia rotta unica accettava «gestisci fatture OPPURE proforma» e lasciava il rifiuto all'API — cioè a maschera già aperta e compilata.

### I test, e la prova che mordono

Il difetto stava **prima** della GET, quindi i test misurano quella finestra: `getDocumentById` restituisce un Observable che non emette **mai**, così l'unica fonte possibile del tipo è la rotta. Con quella premessa, il titolo dice già «Modifica fattura» / «Modifica nota di credito», e la dicitura proforma non c'è.

Le altre guardie, tutte espresse come **regola** e non come caso:

- ogni rotta che apre la maschera vendita dichiara il proprio tipo, e dev'essere un tipo che quella maschera gestisce;
- ogni tipo ha **esattamente** una rotta di creazione e una di modifica;
- il percorso di duplicazione usa gli stessi segmenti, non una seconda tabella;
- `sales/:id/edit` non esiste più;
- i tre tipi chiedono il permesso della famiglia `invoice` e **non** quello della proforma.

**Provate rompendo apposta una rotta** (tolto `salesDocumentType` da `nota-di-credito/new`): due test falliscono, e il messaggio nomina la rotta esatta. Ripristinata.

Ritoccato anche un test preesistente che contava le voci del menu (`toHaveLength(9)`): ora confronta con l'elenco dichiarato, perché «sono nove» invecchia a ogni voce mentre «non ne manca nessuna» no.

### ✅ Il codice e la migration sono una coppia — ricomposta il 16/08

_Quanto segue descriveva la finestra fra il 15 e il 16 agosto, in cui il codice conosceva `credit_note` e il database no. **Le migration sono state applicate il 16/08** e l'elenco è tornato a funzionare. Resta scritto perché la catena spiega una regola che vale per la prossima volta._

**L'elenco Fatture non funzionava finché la migration non era applicata**, e non era una deduzione: è stato misurato eseguendo la query esatta che la pagina manda.

```
invalid input value for enum "DocumentType": "credit_note"   (Postgres 22P02)
```

Il motivo è la catena completa: il filtro «Tutti» interroga tutti i tipi del profilo, quindi manda `types=invoice_draft,invoice_accompanying,credit_note`; il DTO valida contro l'enum del **client Prisma**, che `credit_note` ce l'ha da quando lo schema è stato rigenerato; e il database, che non l'ha, rifiuta la query.

È esattamente ciò che `regole-qualita` chiama **«lo schema e la sua migration sono una coppia»**: `prisma generate` senza `prisma:deploy` lascia lo stato peggiore dei due. Qui la coppia si è spezzata in modo previsto — le due migration sono pronte e non applicate per decisione esplicita — ma va detto chiaro:

> **La lezione, che vale oltre questo caso:** rigenerare il client Prisma senza applicare la migration non lascia il sistema «come prima» — lo lascia nello stato peggiore dei due, perché il codice comincia a chiedere al database una cosa che il database non sa. O tutti e tre insieme — schema, migration, `prisma:deploy` — oppure nessuno dei tre.

Le alternative, per completezza: tenere il registro a due tipi fino alla migration sarebbe stato il «registro provvisorio» già scartato il 15/08, e avrebbe costretto a rifare due volte lo stesso lavoro. Per questo si è scelto di lasciare l'elenco rotto per una notte, con la rottura dichiarata qui, invece di costruire qualcosa da disfare.

---

## §21 · Il nome `invoice_draft` e il ciclo fiscale da ripulire

**Deciso il 16/08/2026. Registrato, non iniziato.** Nessuna riga toccata: qui c'è solo la misura e la decisione.

### Il nome è un fossile

`invoice_draft` voleva dire **«bozza fattura»**, ed era esatto: all'origine VestiFlow non emetteva fatture, ne preparava la bozza da mandare al commercialista. `DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md:327` lo elenca ancora così. Il tipo nasce il 1° luglio nella migration di fondazione, senza commento — il nome bastava a spiegarsi.

Poi il prodotto si è mosso e il nome no. Quel tipo oggi **è la Fattura**: ciclo fiscale, stampa, e da §9 anche la fatturazione elettronica. Tutto ciò che l'operatore vede dice «Fattura» — etichetta, prefisso `FT`, titolo di stampa. È rimasto indietro solo il valore nell'enum.

E c'è la coincidenza che lo rende fuorviante: **«Bozza» oggi è uno _stato_**, non un tipo. Una Fattura può essere in bozza o no, mentre il suo tipo si chiama `invoice_draft` comunque. La stessa parola in due posti con due significati — ed è il motivo per cui il dubbio è tornato due volte, l'ultima come voce aperta **A.4.1** di `QUADRO-DECISIONI-FATTURE.md` (_«va **letto**, non assunto»_), chiusa dalla misura del 15/08: `invoice_draft` è la Fattura, `proforma` è un valore distinto con contatore, prefisso `PRO` e titolo propri.

**Quando rinominarlo.** Non durante questo lavoro. Il valore non è solo un'etichetta in tre punti che contano: è scritto **dentro l'indice unico** come espressione (`THEN 'invoice_draft'::"DocumentType"`), vive nel **database condiviso** dove il collega ha un ramo aperto sulla stessa famiglia, e compare negli **indirizzi** (`?type=invoice_draft`) e nelle preferenze colonne salvate dagli operatori. Superficie: 61 file di codice, 6 migration. Il momento giusto è **insieme al merge col ramo del collega**, quando il database smette di avere due storie.

### «Inviata al commercialista» non serve: è una struttura in più

**Decisione del proprietario del progetto, 16/08.** La marcatura di quale fattura è stata mandata al commercialista **non si tiene**.

Il motivo non è che sia complicata, ma che è **contabilità sulla contabilità**: qualcuno deve ricordarsi di spuntarla, e una seconda fonte di verità che dipende dalla memoria di un operatore diverge dalla prima senza che nessuno se ne accorga.

**La misura dice che non è mai stata usata**, e non per poco:

|                                                       |       |
| ----------------------------------------------------- | ----- |
| Fatture in stato `sent` («Inviata al commercialista») | **0** |
| Fatture in stato `externally_registered`              | **0** |
| `externally_issued_at` valorizzata (su 104 documenti) | **0** |

L'unica fattura esistente è `confirmed`. I tre documenti che portano quegli stati sono di **altri tipi**.

**Cosa cade.** Del ciclo fiscale della Fattura restano gli stati che descrivono un fatto — bozza, confermata, annullata — e cadono i due che descrivono un adempimento fatto altrove. Con loro cadono le tre caselle del Registro commercialista che li contano (`accountant-register.component.html`: «Da emettere», «Inviate al commercialista», «Registrate esternamente») e i contatori che le alimentano (`accountant-register-document-counts.util.ts`).

**Cosa NON cade, e va tenuto distinto.** Tre cose:

1. **Il Registro commercialista resta.** Le tre caselle non sono il registro: lo stesso modulo conta anche i DDT da fatturare e i documenti fornitore in sospeso, che sono fatti veri e restano.
2. **`sent` e `externally_registered` sono stati _generici_**, non della sola Fattura: li usano altri tipi (tre documenti oggi). Quello che cade è **il ciclo fiscale della Fattura**, non necessariamente i valori dell'enum — toglierli dall'enum è una decisione separata, e più cara.
3. **La trasmissione allo SdI è un'altra cosa.** Quando la fattura elettronica entra (§9), esisterà uno stato «trasmessa» — ma sarà un **fatto riportato dal sistema di interscambio**, non una spunta messa a mano. Togliere la marcatura manuale adesso non ostacola quel lavoro: gli libera il posto.

**Coordinamento.** Il ciclo di stati della Fattura è esattamente la superficie che il lavoro di fatturazione elettronica toccherà. Questa pulizia va fatta **dentro quel blocco**, non prima e non in parallelo.

---

## §22 · Il filtro guarda, «Nuovo» crea — corretto il 16/08/2026

Seguito di §20, che aveva dichiarato fatto un pezzo mai esistito. **Trovato guardando la schermata, non dai test.**

### Il difetto

Il registro Fatture usava il filtro «Tipo» **anche** come selettore implicito del documento da creare. Con il filtro su Nota di credito il pulsante diventava «Nuova nota di credito» e ci mandava; con Accompagnatoria, l'altra. Nell'empty state si leggeva **«Nessuna fattura»** sopra un pulsante **«Nuova nota di credito»**: tre stringhe, due semantiche.

Due conseguenze, e la seconda è quella che conta:

- l'operatore **non poteva** creare una Fattura mentre guardava le note di credito;
- il `Nuovo ▾` **non è mai esistito**: era un `app-button` semplice, mai un menu.

### La causa radice, e la parte che riguarda chi ha lavorato

Il meccanismo — `activeCreateVariant` → `salesCreateLabel` → rotta — **non era nuovo**: `git log -S activeCreateVariant` lo data a `17de1f68`, il modulo Fattura + Accompagnatoria. Il commento nel template lo dichiarava apertamente: _«l'etichetta segue il filtro «Tipo»»_. Con due tipi sembrava una comodità.

Il 15/08 è stata **aggiunta una terza voce a quel meccanismo** invece di notare che il meccanismo implementa la regola opposta a §5 (_«Dal pulsante «Nuovo» si sceglie il tipo, tramite menù a tendina con tre voci»_), e §20 ha registrato «fatto». È il difetto che questo progetto combatte ovunque: **estendere una struttura senza chiedersi se la struttura sia quella giusta**. Nessun test poteva prenderlo, perché i test scritti provavano ciò che era stato fatto, non la regola.

### La regola, adesso

> **Il filtro «Tipo» decide cosa si GUARDA. Il menu «Nuovo» decide cosa si CREA. I due non si toccano.**

- Il filtro resta a quattro voci e agisce **solo** sulla query dell'elenco.
- `Nuovo` è **un menu a tre voci**, identico con qualsiasi filtro attivo, e ogni voce va alla propria rotta esplicita senza toccare il filtro.
- Lo stato vuoto riceve **lo stesso menu** per proiezione — non una seconda decisione, e non una CTA che sceglierebbe un tipo al posto dell'operatore.

Gli elenchi a **tipo singolo** (Preventivi, Proforma, DDT, Scarico manuale, Registrazioni fattura) restano col bottone diretto: non hanno niente da scegliere. La discriminante è la presenza di `createVariants`, non il nome del profilo.

### L'hub: una sola porta

**Deciso il 16/08.** Le tre card verso lo stesso elenco filtrato **diventano una**: «Fatture», senza `queryParams`. Finché il filtro decideva anche cosa si creava, quelle card erano tre scorciatoie di creazione travestite da scorciatoie di navigazione; sciolto il legame, tre porte per una stanza sola raccontano una struttura che non esiste.

### I testi che nominavano un tipo solo

L'elenco ne mostra tre e il filtro può stare su uno qualsiasi, quindi le stringhe della pagina sono **della famiglia**:

|                       | Prima                          | Adesso                  |
| --------------------- | ------------------------------ | ----------------------- |
| `emptyTitle`          | «Nessuna fattura»              | «Nessun documento»      |
| `emptyDescription`    | «…crea una **nuova fattura**…» | nomina i tre tipi       |
| `detailPanelTitle`    | «Dati fattura»                 | «Dati documento»        |
| `detailNotFoundTitle` | «Fattura non trovata»          | «Documento non trovato» |

_Gli ultimi due non erano nell'elenco chiesto: li ho corretti perché sono la stessa classe di difetto — l'anteprima si apre su uno qualsiasi dei tre, e «Dati fattura» sopra una nota di credito è sbagliato allo stesso modo._

### Il componente condiviso è stato esteso, non scavalcato

`app-empty-state` aveva **solo** `ctaLabel` + `ctaClick`: un bottone. Dove l'azione è una scelta fra più cose quel modello non basta, e la strada sbagliata sarebbe stata metterci un comando di fianco, fuori dal riquadro. Ha ricevuto una **fessura di proiezione**: chi ha un comando proprio lo passa dentro, chi ha una CTA continua a passare l'etichetta, e se non arriva né l'uno né l'altra il contenitore sparisce (`:empty`). Nessun `::ng-deep`, nessuna copia.

### Le guardie

Provate **reintroducendo il difetto** (il menu che filtra le voci sul tipo attivo): **quattro test falliscono**, e ognuno nomina il filtro sotto cui è caduto.

- con «Tutti», Fattura, Accompagnatoria e Nota di credito il menu offre **sempre** i tre tipi;
- dal filtro Nota di credito si crea una **Fattura**; dal filtro Accompagnatoria una **Nota di credito** — e la rotta di arrivo è quella esplicita del tipo;
- lo stato vuoto **non** espone una CTA a tipo singolo, e i suoi testi non nominano una sola fattura;
- gli elenchi a tipo singolo **conservano** il bottone diretto;
- nell'hub la famiglia ha **una** voce, senza `queryParams`, e le due scorciatoie non esistono più.

Restano in piedi i test di §20 su rotte esplicite, tipo noto prima della GET e assenza del ripiego a Proforma.

### Trovato di passaggio

Le briciole non conoscevano `nota-di-credito` e avrebbero mostrato il segmento grezzo, trattini compresi: un segmento senza etichetta ricade su `decodeURIComponent`. Aggiunta la voce.

---

## §23 · La maschera Nota di credito, vista per la prima volta — misurato il 16/08/2026

**Verifica in sola lettura, nessuna modifica.** Le rotte funzionano; questo non vuol dire che la maschera e il dettaglio siano semanticamente corretti per una Nota di credito.

Il filo che lega quasi tutti i punti è uno solo: **la NC è stata aggiunta a liste ed elenchi, e da quelle liste ha ereditato comportamenti che nessuno ha deciso per lei.** È lo stesso difetto del menu «Nuovo» (§22), in un altro punto della stessa maschera.

### 1 · Briciole diverse fra nuovo, dettaglio e modifica — perché

| Vista     | Percorso reale                        | Briciole                                         |
| --------- | ------------------------------------- | ------------------------------------------------ |
| Nuovo     | `documents/nota-di-credito/new`       | Documenti > Nota di credito > Nuovo              |
| Dettaglio | **`documents/<id>`**                  | Documenti > FT-0002                              |
| Modifica  | `documents/nota-di-credito/<id>/edit` | Documenti > Nota di credito > FT-0002 > Modifica |

**Causa:** non c'è un ramo dedicato ai documenti di vendita in `breadcrumbs.component.ts` — si passa dal ciclo generico che cammina i segmenti dell'indirizzo e traduce ognuno con `SEGMENT_LABELS`. Le tre viste hanno **tre forme di percorso diverse**, quindi tre gerarchie diverse.

E il dettaglio ne ha una quarta ragione, che è un difetto a sé: **`sales-document-form.component.ts:248` ha `listPath = '/app/documents'` fisso.** Dopo il salvataggio la maschera manda al **dettaglio generico**, non a quello del registro Fatture — e `Annulla` torna all'hub invece che all'elenco. La maschera non sa a quale registro appartiene.

**Gerarchia decisa (Luigi, 16/08):** `Documenti > Fatture > Nuova nota di credito` · `Documenti > Fatture > FT-0002` · `Documenti > Fatture > FT-0002 > Modifica`. Il tipo lo dice l'H1, che resta com'è: «Nuova nota di credito» è corretto. Le briciole non devono far credere che «Nota di credito» sia un registro autonomo.

### 2 · «Riferimento DDT (opzionale)» sulla Nota di credito — eredità, non scelta

**Regola:** la NC **non usa** il flusso «Includi documento/DDT». Nasce vuota, o è generata da una Fattura; il suo riferimento naturale è semmai la fattura d'origine, anche esterna (§13).

**Osservato:** la maschera NC mostra «Riferimento DDT (opzionale)» con «Aggancia un DDT…», e al salvataggio manda `linkedSalesDdtIds`.

**Causa tecnica:** il blocco è dentro `@if (isSalesInvoice())` — `sales-document-form.component.html:193` (pannello mobile) e `:404` (desktop) — e `isSalesInvoice()` chiama `isSalesInvoiceDocumentType`, che legge **`SALES_INVOICE_DOCUMENT_TYPES`**. Il 15/08 a quella lista è stata aggiunta `CreditNote`: da quel momento ogni blocco governato da quel gate vale anche per la NC, **senza che nessuno l'abbia deciso**.

**E non è solo quel campo.** Lo stesso gate governa, in `sales-document-form.component.ts:2169`, l'invio di:

- `paymentTerms` · `paymentDueDate` · `iban`
- **`linkedSalesDdtIds`**

Quattro cose ereditate in blocco. Termini di pagamento e IBAN su una nota di credito **possono** avere senso (si rimborsa su un conto), l'aggancio DDT no — ma la questione è che nessuna delle quattro è stata scelta: sono arrivate perché il tipo è entrato in una lista.

### 3 · «Causale» — è la causale di FATTURAZIONE, non quella di trasporto

**Osservato:** il campo si chiama `billingCause`, dichiarato nello schema come _«Causale fatturazione (bozza fattura, §9.2)»_ (`schema.prisma:2143`).

**È dimostrabilmente distinta dalle altre due causali del progetto:**

| Campo             | Cos'è                              | Chi lo mostra                                               |
| ----------------- | ---------------------------------- | ----------------------------------------------------------- |
| `billingCause`    | causale di fatturazione            | gate `isSalesInvoice()` → i tre tipi                        |
| `transportCausal` | **causale di trasporto**           | gate `isInvoiceAccompanying()` → **solo** l'accompagnatoria |
| `causalText`      | causale di carico («DDT 145 del…») | arrivo merce                                                |

**Quindi il sospetto è infondato: sulla NC non compare la causale di trasporto.** Quella è correttamente riservata all'accompagnatoria. Resta però nello stesso blocco ereditato del punto 2: è pertinente per natura, non per decisione.

### 4 · «Prezzo 7,00 €» nel dettaglio, «Prezzo ivato 8,54 €» in modifica

**I calcoli sono corretti.** 7,00 imponibile + 1,54 IVA = 8,54. Nessun errore di importo.

**Il difetto è di rappresentazione**, e ha una causa precisa: le due viste leggono **valori diversi sotto etichette che non lo dicono**.

| Vista     | Cosa legge                                                                                 | Etichetta                                              |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Modifica  | il valore **ivato** derivato, quando `pricesIncludeVat` è acceso                           | «Prezzo ivato» — dice quale                            |
| Dettaglio | `line.unitPrice`, cioè il **netto memorizzato** — `document-lines-table.component.html:34` | **«Prezzo»**, intestazione **fissa** nel markup (`:8`) |

La tabella righe del dettaglio non guarda mai `pricesIncludeVat` del documento: mostra sempre il netto sotto un'etichetta generica. Lo stesso documento si legge quindi «7,00» di là e «8,54» di qua, e nessuna delle due viste dice all'operatore quale delle due sta guardando.

### 5 · Data documento e data di creazione — **nessun difetto**

Il pannello «Dati documento» mostra **`Data documento` come PRIMA riga** (`sales-document-detail.component.ts:105`), e `Creato il` più in basso (`:218`). Entrambe ci sono e sono due informazioni diverse: il documento è datato 15/08 ed è stato creato il 16/08 (dopo mezzanotte). Nessuna contraddizione, nessun dato mancante.

### 6 · Il selettore netto/ivato è in testata, non sulla colonna Prezzo

**Osservato:** nella maschera vendita il comando è un campo **«Modalità prezzo»** nella testata — `sales-document-form.component.html:151` (mobile) e `:375` (desktop). L'intestazione della colonna Prezzo porta **solo** il pulsante di ordinamento (`:668-684`), nessun menu.

**Ma il pattern a menu sull'intestazione esiste, in tre altre maschere:**

| Maschera                     | Dove                                             |
| ---------------------------- | ------------------------------------------------ |
| Arrivo merce                 | `goods-receipt-form.component.html:910`, `:1035` |
| Ordine fornitore             | `supplier-order-form.component.html:530`         |
| DDT vendita / Ordine cliente | `customer-order-form.component.html:1172`        |

Tutte e tre usano `doc-form__th-menu-wrap` con l'etichetta che riflette la modalità e il chevron che apre il menu. La **maschera vendita è l'unica fuori dallo standard** — e proprio quella dove il documento è fiscale.

**Due meccanismi per la stessa scelta**, in maschere che l'operatore usa nella stessa giornata.

### Cosa NON è stato toccato

`FT-0002` resta com'è: prefisso e zeri appartengono a `04-…§11` e non si mescolano a questo blocco. Dominio NC, segno economico e «Carica magazzino» restano fuori: prima si ripulisce la semantica della maschera.

### §23-bis · Correzione al punto 2-3, e un difetto trovato cercandone la conferma

_Luigi, 16/08, mostrando la maschera Fattura di Danea: «la causale nei documenti di vendita fa parte dei dati per la fatturazione elettronica»._

**La lettura del §23 punto 2 era sbagliata.** «Riferimento DDT» sulla Fattura **non è** un residuo: è il blocco **`DatiDDT`** del tracciato FatturaPA (2.1.8), e il codice lo emette davvero — `fatturapa-xml.util.ts:285-290`. In Danea non è nemmeno un campo a sé: è **una delle voci** di «Doc. emesso in seguito a» — Ordine d'acquisto · Contratto · Convenzione · Ricezione · **Fattura collegata** · Doc. di trasporto — cioè i blocchi `DatiOrdineAcquisto`, `DatiContratto`, `DatiConvenzione`, `DatiRicezione`, `DatiFattureCollegate`, `DatiDDT`.

**Il che cambia la conclusione sulla Nota di credito, e in meglio.** Non le serve _meno_ di quel blocco: le serve **la voce giusta dello stesso blocco** — `DatiFattureCollegate`, la fattura d'origine — che è esattamente il riferimento naturale già deciso al §13. Il difetto non è «un campo di troppo», è **un campo che non discrimina la voce**: la maschera offre solo il DDT perché è l'unica implementata.

**Cosa manca davvero, misurato.** Della fascia «Proprietà fattura elettronica» il modello ha **un solo campo**: `billingCause`. Non esistono `TipoDocumento` scelto dall'operatore (TD01/TD24/TD25/TD26 — oggi è una costante), bollo virtuale, CIG, CUP, né i blocchi diversi da `DatiDDT`.

#### ⚠️ Il difetto: la «Causale» che l'operatore scrive non arriva nell'XML

Due campi diversi si presentano entrambi come «Causale», e vanno in due posti diversi:

| Campo                                                            | Dove finisce                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `billingCause` — quello **etichettato «Causale»** nella maschera | PDF (`document-pdf.service.ts:307`, `:527`), dettaglio, colonna elenco                 |
| `notes` — le **note** del documento                              | **`<Causale>` dell'XML** (`document-xml.service.ts:131` → `fatturapa-xml.util.ts:348`) |

Quindi: chi compila «Causale» aspettandosi che entri nella fattura elettronica **la ottiene solo sulla copia cartacea**; e le note, che possono essere un promemoria interno, **finiscono nel tracciato** che vede il cliente e registra l'Agenzia.

**Aggravante:** `billingCause` è già **sovraccarico** — l'Arrivo merce ci scrive dentro il testo letterale `'In attesa fattura'` come marcatore di stato (`goods-receipt-workflow.service.ts:882`). La stessa colonna porta un flag di processo su un tipo e testo libero su un altro.

**Non corretto**: registrato qui, appartiene al blocco fatturazione elettronica (§9).

---

## §24 · Tre cose capite guardando Danea — da decidere prima di implementare

_16/08/2026. Registrate, non iniziate. La prima ha una domanda aperta per Luigi._

### 1 · Il selettore netto/ivato va unificato — e non è dov'è adesso

**Deciso da Luigi:** il comando che sceglie fra importi netti e ivati **sta sull'intestazione della colonna che governa**, in tutte le maschere, e non come campo separato in testata.

| Famiglia documenti                                       | Colonna    |
| -------------------------------------------------------- | ---------- |
| Ordine fornitore · Arrivo merce                          | **Costo**  |
| Preventivi · Ordine cliente · DDT · Fatture (e famiglia) | **Prezzo** |

**Stato misurato:** il pattern **esiste già** in tre maschere su quattro — `doc-form__th-menu-wrap` con l'etichetta che riflette la modalità e il chevron che apre il menu: Arrivo merce (`goods-receipt-form.component.html:910`, `:1035`), Ordine fornitore (`supplier-order-form.component.html:530`), DDT vendita / Ordine cliente (`customer-order-form.component.html:1172`).

**Fuori standard è la sola maschera vendita** — Proforma, Fattura, Accompagnatoria, Nota di credito — che usa un campo «Modalità prezzo» in testata (`sales-document-form.component.html:151` mobile, `:375` desktop). Cioè proprio la maschera dove il documento è fiscale.

Il lavoro è quindi **portare il pattern esistente sulla maschera vendita**, non inventarne uno: e va estratto in un punto solo, o diventa la quinta copia.

> ✅ **Chiarito il 16/08.** Non c'erano due regole: «listino» stava per **listino al pubblico**, che qui si chiama **prezzo**. Quindi la regola è una sola e senza eccezioni — **acquisti sul Costo, vendite sul Prezzo**. Il campo Listino della testata (quale listino alimenta le righe) è un'altra cosa e non si muove.

### 2 · La fascia «Proprietà fattura elettronica» — cosa manca davvero

Danea raccoglie in una scheda i dati che il tracciato chiede e che oggi noi non abbiamo. Misurato: dell'intera fascia il modello ha **un solo campo**, `billingCause`.

| Dato                                                                                                               | Tracciato              | Stato                                                |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------- |
| Tipo documento elettronico (TD01 · TD24 · TD25 · TD26 · TD04)                                                      | 2.1.1.1                | **costante nel codice**, non scelto                  |
| Causale                                                                                                            | 2.1.1.11               | c'è come campo, **ma non arriva nell'XML** (§23-bis) |
| Bollo virtuale                                                                                                     | 2.1.1.6                | **assente**                                          |
| «Doc. emesso in seguito a» → Ordine d'acquisto · Contratto · Convenzione · Ricezione · **Fattura collegata** · DDT | 2.1.2 – 2.1.8          | **solo `DatiDDT`**                                   |
| CIG · CUP                                                                                                          | dentro i blocchi sopra | **assenti**                                          |

**Per la Nota di credito la voce che serve è «Fattura collegata»** (`DatiFattureCollegate`), che è anche il riferimento naturale già deciso al §13 — inclusa la fattura d'origine **esterna o storica**, che non è un documento VestiFlow. Non serve toglierle il blocco: serve dargli le voci.

Il dettaglio dei tracciati e delle regole SdI sta in `06b-estrazione-fattura-elettronica.md`; qui resta il fatto che **la maschera della famiglia Fattura non ha dove ospitarli**.

### 3 · Come si dispongono i campi — **rinviata alla fine, per decisione del 16/08**

I dati sono tanti: fascia fiscale, **pagamenti** (`paymentTerms`, `paymentDueDate`, `iban`, più le rate del §C di `06b`), trasporto, indirizzi, note.

**La preferenza di Luigi sono le schede** — tre o quattro linguette, si clicca quella che serve e si compila. Ha guardato la sezione comprimibile «Trasporto» del DDT e l'ha giudicata **poco pratica**: è il prodotto provato da chi lo usa, e vale più di una preferenza architetturale.

**Avevo obiettato che le schede nascondono campi che spostano il totale. L'obiezione era più larga dei fatti**, e va ridimensionata per iscritto: della fascia fiscale l'unico campo che tocca il totale è il **bollo virtuale**. `TipoDocumento`, `Causale`, i blocchi «documento collegato», CIG e CUP non spostano un centesimo. Quindi non è un argomento contro le schede: è **un vincolo sul disegno** — ciò che muove il totale non sta dietro una linguetta, e il piede del documento resta sempre visibile.

**Decisione operativa (16/08): non si sceglie adesso.** Prima si inseriscono i dati e i campi che mancano; la disposizione si decide alla fine, con i campi veri sotto gli occhi invece che su un elenco. È la scelta giusta anche tecnicamente: raggruppare è l'ultimo passo, e farlo prima obbligherebbe a rifarlo.

**Quando si deciderà**, tenere presente che tocca l'anatomia condivisa da sei schermate (`styles/_document-form.scss`): la disposizione va scelta **una volta per tutta la famiglia documento**, non per la sola Fattura.

---

## §25 · Il selettore netto/ivato unificato — ✅ fatto il 16/08/2026

Chiude il §24 punto 1.

### La regola, senza eccezioni

> **Il comando netto/ivato sta sull'intestazione della colonna che governa: Costo sugli acquisti, Prezzo sulle vendite.**

_Chiarito da Luigi il 16/08: «listino» stava per **listino al pubblico**, che qui si chiama **prezzo**. Non c'erano due regole diverse per gli stessi documenti._

### Il componente, e perché esiste

La stessa tendina era scritta a mano in **tre** maschere — Arrivo merce, Ordine fornitore, DDT/Ordine cliente — a 45-54 righe l'una. La maschera vendita ne avrebbe fatta **una quarta**, mentre `regole-architettura` impone l'estrazione già a «> 15 righe duplicate in 2+ posti».

`app-price-mode-menu` (`domain/documents/components/price-mode-menu/`) le sostituisce tutte: **154 righe di markup diventate 8 per chiamante.**

**Verificato prima di scriverlo, non dato per scontato:** `app-select-menu` **non poteva** servire. Il suo trigger stampa sempre `selectedLabel()` più il chevron e non ha una forma sola-icona; in un'intestazione dove l'etichetta è già il pulsante di ordinamento si leggerebbe «Prezzo ivato» due volte. È la ragione per cui le tre copie erano nate a mano, ed è annotata **nel componente**, perché chi un giorno volesse «semplificare» trovi la misura già fatta.

**Cosa resta al chiamante, di proposito:** il pulsante di **ordinamento** (alcune maschere ce l'hanno, altre no) e la **conversione dello stato** — le maschere d'acquisto memorizzano `vat_excluded`/`vat_included`, quelle di vendita un booleano. Il componente non deve sapere come ciascuna maschera salva la scelta.

**Due cose che nessuna delle tre copie aveva:** **Esc** chiude e il **clic fuori** chiude. Una tendina che resta aperta mentre l'operatore scrive altrove copre la riga sotto.

**Non toccato:** il menu «Azioni colonna IVA» dell'Arrivo merce, che condivide solo l'aspetto — è un'altra funzione.

### Il difetto visibile, corretto in quattro maschere

Il menu «Modalità prezzo» mostrava **«Netto» due volte**: `app-select-menu` ha `includeEmptyOption` a `true` di default e rendeva una voce fantasma con l'etichetta del segnaposto. Il valore non è mai vuoto, quindi la voce non serviva. Corretto in tutte e quattro le maschere che hanno quel campo su mobile — dove il campo resta, perché su card le intestazioni di colonna non esistono.

### ⚠️ «Listino» resta «Listino» — la rinomina era una regressione, annullata

_Questa sezione diceva che il campo era stato rinominato «Prezzo», con la motivazione «i listini non sono mai stati usati». **Era falso, ed è stato annullato il 16/08** con un commit correttivo. Resta scritto perché l'errore è istruttivo._

**Sono tre cose diverse, e vanno tenute separate:**

| Controllo       | Cosa decide                                 | Dove sta                          |
| --------------- | ------------------------------------------- | --------------------------------- |
| **Listino**     | **quale sorgente prezzi** alimenta le righe | campo di testata                  |
| **Netto/Ivato** | **come si legge** l'importo                 | intestazione della colonna Prezzo |
| **Prezzo**      | il **valore economico** della riga          | la colonna                        |

**Il Listino è un selettore commerciale vero**, non l'etichetta del netto/ivato che gli sta accanto in testata: ha lo stato tipizzato (`'article' | 1 | 2 | 3`), le opzioni dagli slot accesi nelle impostazioni del tenant col loro nome, un avviso dedicato quando un articolo non ha prezzo nel listino scelto, e **sceglierlo riscrive i prezzi di tutte le righe**. I prezzi vivono in `products.listino1..3_price_minor`.

**E i listini sono in uso**, misurato: **tutti e quattro i tenant** hanno `listino1_active = true`, uno li ha anche battezzati.

**Come è successo, perché non ricapiti:** la richiesta conteneva una condizione — «se listino non l'abbiamo mai usato» — e la rinomina è stata eseguita **senza verificarla**. Bastava una query. È lo stesso schema del menu «Nuovo» (§22): agire su una premessa non misurata.

**La guardia** sta in `sales-document-form.component.spec.ts` e fissa la **distinzione**, non l'etichetta: il selettore si chiama «Listino» e offre le **sorgenti prezzo del tenant**, non «Netto» e «Ivato». Provata reintroducendo la rinomina: fallisce.
