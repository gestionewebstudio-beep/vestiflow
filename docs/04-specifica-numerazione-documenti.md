# Specifica — Numerazione documenti

**Documento di prodotto.** Owner: Luigi. Le decisioni qui dentro sono definitive salvo revisione esplicita e datata.

Questo documento **supera**:

- `numerazione-documenti-verifica.md` (luglio 2026) — testo pre-decisione, diversi punti ribaltati
- le due stesure precedenti di questo file (11 agosto, mattina e pomeriggio) — §2 riformulato, §3 e §4 riscritti

Ultimo aggiornamento: 11 agosto 2026, sera.

---

## §0 — Migrazioni implicate

| Intervento                                                          | Tipo            | Note                                                                        |
| ------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| Proposta del numero per data                                        | **Additiva**    | Serve un indice composito, vedi sotto                                       |
| Campo data sul DTO di anteprima                                     | **Nessuna**     | Solo DTO                                                                    |
| Preferenza "non mostrare più"                                       | **Additiva**    | Copiare `UserDocumentPriceModePreference`                                   |
| Sottotipo Nota di credito e Fattura d'acconto                       | **Additiva**    | Nuovi valori su enum Postgres `DocumentType`                                |
| Rimozione numerazione dal Corrispettivo                             | **Distruttiva** | Vedi §8. Coordinare con `feature/cassa`                                     |
| Rimozione `DocumentSequence`                                        | **Distruttiva** | Backup da sistemare **prima**. Vedi §9                                      |
| Ora sulla vendita al banco + marcatore RT fuori servizio            | **Additiva**    | Vedi §8                                                                     |
| Rimozione colonne controparte da `sales_orders` e `supplier_orders` | **Distruttiva** | Vuote su tutti i record. Vedi §5-ter                                        |
| Rimozione `documents.year`                                          | **Distruttiva** | Colonna scritta e NOT NULL: schema, migration e codice insieme. Vedi §5-ter |

**Già applicate** l'11 agosto sul ramo, additive: colonne del riferimento controparte, indici unici parziali, indice del numero sul numeratore.

⚠️ **Le distruttive si fanno tutte nella stessa finestra**, concordata col collega, non a spizzichi: ognuna è un `DROP` su un database condiviso, e ogni volta che si apre quella porta il rischio è lo stesso — vale la pena pagarlo una volta sola.

Regola invariata: mai `prisma migrate dev` o `db push` sul database condiviso. Solo `prisma migrate deploy`.

### Perimetro reale della proposta per data

**Dodici chiamate in sette file**, non nove in cinque come diceva la prima stesura (il conto vecchio veniva da un ramo precedente al commit `6fc27982`).

**Costo.** `NextNumberInput` oggi non riceve la data, e non esiste un indice che includa `documentDate` accanto a `(tenant, type, series)`. Senza, il calcolo del massimo fra i documenti con data anteriore scansionerebbe l'intera partizione — dentro il lock, che serializza tutti gli operatori sullo stesso contatore.

Due interventi necessari, **e in quest'ordine**:

1. **indice composito** `(tenant_id, type, series, document_date, number)`, così il primo passo diventa un accesso a indice
2. **una sola query SQL** che restituisce un intero, con `NOT EXISTS` o funzione finestra. Mai materializzare l'elenco dei numeri in JavaScript: la regola sotto lock deve essere logaritmica, non lineare

⚠️ **L'indice va per primo, e non è un dettaglio di comodo.** Scrivendo prima la query, la si misura senza indice — cioè con una scansione dell'intera partizione dentro il lock — e il risultato sembra un problema della _regola_: «la proposta per data è lenta, forse la logica è sbagliata». Non lo è: è la scansione. Con l'indice già in piedi, il primo numero che si legge è quello vero.

**Scartata** l'ipotesi di tenere `max+1` sotto lock mettendo la logica per data solo nella proposta mostrata: produrrebbe una divergenza sistematica fra numero visto e numero assegnato, non dovuta a concorrenza. Inaccettabile su un documento fiscale.

---

## §1 — Il contatore

_Deciso 3 agosto 2026. Verificato in codice 11 agosto: già implementato._

Il contatore è definito da **tenant + tipo documento + serie**. Ogni contatore ha il proprio progressivo, indipendente dagli altri: "serie 2026 per Ordini cliente" e "serie 2026 per Fatture" sono due contatori distinti e possono arrivare entrambi al 42 senza conflitto.

`DocumentCounter` **non memorizza il progressivo**: il numero si ricava dai documenti reali.

`locationId` determina **solo la disponibilità** della serie nella tendina, non partiziona il progressivo. Senza location la serie è disponibile ovunque; con location, solo per i documenti di quella sede.

**L'anno non esiste come concetto di sistema.** Non sta nel riferimento e non partiziona. Chi vuole il reset annuale crea una serie chiamata "2026".

Riferimento: `PREFISSO[-SERIE]-NNNN`. Il prefisso è proprietà del tipo documento e si configura nelle card per tipo. La serie si configura **solo** nei Numeratori.

Ogni tipo nasce con un contatore «Senza serie», seminato e non eliminabile → `OC-0001`.

**Superato:** la location come partizione; il progressivo modificabile nelle Impostazioni; l'anno come serie implicita.

---

## §2 — La proposta del numero

_Deciso 11 agosto 2026. Non ancora in codice: oggi la proposta è `lastAssignedNumber + 1`._

### La regola

> Sia **m** il numero più alto fra i documenti dello stesso contatore con **data strettamente anteriore** a quella del documento che sto creando.
> Si propone il **primo numero libero maggiore di m**.

Una sola formulazione, nessun ramo separato. Il riempimento dei buchi non è un caso speciale: è questa stessa regola vista da un'altra angolazione.

**Attenzione a "anteriore".** Data _strettamente_ anteriore, non "uguale o anteriore". La differenza non è formale: sull'esempio qui sotto la lettura sbagliata propone 5 dove la regola propone 3. Nella prima stesura era scritto "precede in data" ed è stato letto male da chi ha analizzato il documento — quindi si scrive **anteriore**.

### Perché non basta "l'ultimo più uno"

Ultimo preventivo: **10**. Ne prepari uno datato la settimana prossima e gli dai il **15**. Oggi ne apri un altro.

Con `max+1` la proposta è **16**: il documento futuro ti ha bruciato cinque numeri, e da lì tutta la numerazione corrente parte da dopo di lui.

Con la regola nuova la proposta è **11**: i documenti datati avanti non spostano la proposta di oggi.

### I casi, per esteso

Stato di partenza: documento **2** del 05/06/2026, documento **4** del 05/06/2026. Il **3** è il buco.

| Creo il…   | Documenti con data anteriore                        | m   | Proposta                 |
| ---------- | --------------------------------------------------- | --- | ------------------------ |
| 05/06/2026 | né il 2 né il 4 (stessa data) → solo il documento 1 | 1   | **3** — il buco si tappa |
| 06/06/2026 | 2 e 4                                               | 4   | **5** — il buco resta    |

Il 05/06 il buco si tappa perché il 4 è dello stesso giorno: nessuna progressione si rompe. Il 06/06 no, perché il 3 risulterebbe più recente del 4, che è del giorno prima.

Aggiungendo un documento **15 datato 12/06/2026**:

| Creo il…   | m   | Proposta                                                 |
| ---------- | --- | -------------------------------------------------------- |
| 06/06/2026 | 4   | **5**, poi 6, 7… — i buchi si riempiono in progressione  |
| 12/06/2026 | 4   | **5** e a seguire, fino a esaurire lo spazio sotto il 15 |

Il 15 fa da tetto finché non ci si arriva con la data.

**Proprietà importante:** i buchi si riempiono solo con documenti la cui data è compatibile con i numeri che li circondano. Il riempimento **non può quindi generare un'anomalia cronologica**. La regola è costruita apposta per essere compatibile col §4.

### Serie già fuori ordine

_Deciso 11 agosto 2026._

Il §4 è avviso e non blocco, quindi una serie può contenere un documento fuori posto. In quel caso **m è il numero più alto fra i documenti con data anteriore**, non l'ultimo per data.

Esempio: documento **9** del 1 agosto, documento **5** del 10 agosto (numero forzato a mano). Creo oggi, 11 agosto.

Partendo dall'ultimo per data (il 5) si proporrebbe il 6 — che nasce già in violazione contro il 9. Partendo dal numero più alto (il 9) si propone **10**, che è coerente.

Vale la seconda: **si parte sempre dal numero più alto fra i precedenti**, mai dall'ultimo per data.

### Caso terminale: numeri esauriti sotto un documento datato avanti

_Deciso 11 agosto 2026._

Esiste il 10 del 1 agosto e il 15 del 18 agosto. Oggi, 11 agosto, si creano documenti: 11, 12, 13, 14. Al quinto il primo libero maggiore di 14 è il **16**, perché il 15 è occupato. Si ottiene il 16 datato oggi contro il 15 datato fra una settimana: l'anomalia del §4.

**La proposta scavalca e prosegue.** Non si ferma, non chiede.

Il motivo: l'anomalia non l'ha creata il sistema, l'ha creata l'operatore nel momento in cui ha assegnato il 15 con data futura. Da quel momento la serie contiene un documento fuori posto, e tutti i numeri creati oggi si collocheranno necessariamente attorno a esso. Il sistema ha solo continuato a numerare per data, che è quello che gli è stato chiesto.

Il §4 non ha quindi bisogno di eccezioni: l'avviso segnala uno stato che esiste davvero, e la responsabilità è di chi l'ha creato. Che compaia al quinto documento anziché al primo è solo il momento in cui la conseguenza diventa visibile.

**Superata** l'ipotesi di fermare la proposta con un messaggio tipo «nessun numero libero prima del 15 del 18/08»: bloccherebbe l'operatore per una scelta legittima presa da lui.

### La proposta dipende dalla data

Conseguenza diretta: **cambiando la data in testata il numero si ricalcola.** Oggi il campo numero non si muove.

### L'elenco dei buchi

Il ramo ha aggiunto alla scheda del numeratore il conteggio dei buchi e l'elenco dei primi dieci. La funzione si tiene, con una condizione: **deve distinguere i buchi ancora riempibili da quelli chiusi.** Un elenco che li mette insieme fa perdere tempo su numeri che la regola non permette più di usare a quella data.

### Numero editabile

Il numero è sempre modificabile a mano. Serve a chi migra da un altro gestionale a metà anno e deve allineare la numerazione.

### Niente duplicati, niente "bis"

_Deciso 11 agosto 2026._

Il vincolo unique resta, i duplicati non sono ammessi.

Danea permette il "bis" (15, poi 15 bis) per correggere una doppia fattura senza rinumerare le successive. **Non lo adottiamo.** È un rimedio nato dal cartaceo: con la fattura elettronica la correzione passa dalla **nota di credito**, che è lo strumento previsto dalla legge e lascia traccia di cos'è successo.

Il numero resta un **intero**: proposta aritmetica, ordinamento numerico.

Conseguenza accettata: un eventuale import da Danea di fatture col bis non potrà mantenere quei numeri. Problema di migrazione dati, da affrontare se e quando l'import esisterà.

### La colonna «prossimo numero» dei Numeratori

_Deciso 11 agosto 2026._

`document-counters.service.ts:433` calcola quella colonna in una schermata di configurazione, dove una data del documento non esiste e non può esistere.

**Mostra il primo libero a partire da oggi**, così coincide con quello che l'operatore vedrà aprendo un documento in quel momento. Con `max+1` direbbe un numero diverso da quello che compare in testata due secondi dopo.

---

## §3 — Conflitto al salvataggio

_Deciso 8 agosto 2026, riconfermato l'11._ ✅ **In codice dal 12 agosto 2026**: la modifica del ramo che rovesciava il comportamento è stata annullata su tutte e sette le maschere, e le prove che la fissavano sono state riscritte.

### Quando compare

**Solo se l'operatore ha digitato il numero a mano** e quel numero risulta occupato al salvataggio.

Accettando la proposta non compare mai. Il ramo ha aggiunto `lockDocumentCounter` — advisory lock transazionale su `(tenant, tipo-numeratore, serie)`, applicato in tutti e otto i punti di assegnazione — e il frontend manda il numero al server solo se digitato (`numberIsProposal()` → `requestedNumber` assente). Due operatori che salvano insieme prendono due numeri diversi senza vedere niente.

**Questo restringe molto l'avviso** rispetto a come era stato pensato: non è più il meccanismo che risolve la concorrenza, è solo il caso del numero scelto a mano.

### Il caso concreto

Lavorate in tre. Vedi nella scheda che il **7** è un buco riempibile, apri il documento e scrivi 7. Nel frattempo un collega fa lo stesso e salva prima di te. Premi Salva: il 7 non c'è più.

### Comportamento

Avviso a **bottone singolo**. Comunica che il numero digitato è occupato e che è stato aggiornato. **Il campo Numero si aggiorna.** OK chiude e il controllo torna all'operatore.

**Il documento non si salva da solo.** L'operatore vede il numero nuovo e preme Salva.

Se anche quello nel frattempo è stato preso, riappare lo stesso avviso col numero ulteriormente aggiornato.

Esc e OK fanno la stessa cosa.

### Perché il campo si aggiorna

Il numero digitato è comunque perso: quel treno è passato. Lasciare il campo com'era costringe l'operatore a ridigitare una cosa che il sistema già sa — e lavorando in tre **non può nemmeno sapere quale sia il primo libero**. Riscrivere a mano introduce l'errore di digitazione e un secondo conflitto.

L'11 agosto alle 03:07 il ramo ha rovesciato questo comportamento — «Il numero in testata non è stato modificato: correggilo e premi di nuovo Salva» — con la motivazione che sostituire il numero d'ufficio butta via l'intento di chi voleva quel buco preciso. La motivazione è comprensibile, ma **il costo è più alto del beneficio**: l'intento è comunque irrealizzabile, e l'operatore resta senza l'informazione che gli serve.

**Il codice va riportato al comportamento dell'8 agosto.** ✅ Fatto il 12/08/2026: `acknowledge()` restituisce il numero, ogni maschera lo scrive nel proprio controllo e lo segna come scelto — se restasse una proposta verrebbe omesso al salvataggio e il server ne assegnerebbe un terzo, diverso da quello appena mostrato.

### Due cose del ramo che si tengono

Il messaggio deve **nominare il numero effettivamente digitato**, non `nextAvailable - 1`. Prima, su una serie arrivata a 43, chi digitava 7 si sentiva parlare del 43 — un numero mai visto. Correzione giusta.

Il numero assegnato dev'essere il primo libero **secondo la regola del §2**, cioè compatibile con la data del documento.

### Da propagare insieme alla regola

`buildDocumentNumberConflict` (`document-numbering.util.ts:204`) chiama `nextDocumentNumber`, la stessa funzione della proposta: cambiando la regola in un punto, il conflitto la segue. **Ma eredita anche la mancanza della data**, che va propagata nei suoi tre punti di chiamata — `documents.service.ts:1032`, `goods-receipt-workflow.ts:199`, `transfer-adjustment-workflow.ts:188`. Se lì la data non arriva, l'avviso nominerebbe un numero calcolato con una regola diversa da quella che ha appena rifiutato il salvataggio.

Il testo del messaggio va riscritto insieme alla regola: oggi dice «In testata è stato messo il 44, il prossimo numero della serie», dove `nextAvailable` è massimo+1. Sotto la regola nuova quel campo contiene il primo libero secondo la data, e la frase direbbe una cosa che il campo non contiene più.

**Superato:** il modale a due bottoni «Usa Y / Annulla» (24 luglio); il modale a tre opzioni con «Salva con numero duplicato» e l'evidenziazione arancione dei duplicati (`numerazione-documenti-verifica.md`); il campo non aggiornato (ramo, 11 agosto 03:07).

---

## §4 — Controllo cronologico

_Deciso 11 agosto 2026. Da implementare._

**Il fatto controllato:** dentro lo stesso contatore, a numero più alto deve corrispondere data uguale o successiva.

**Stessa data, nessuna anomalia mai.** Nella giornata l'ordine dei numeri non significa niente: creare, saltare, tornare indietro è tutto libero.

### Quando nasce l'anomalia

La proposta automatica non genera anomalie riempiendo i buchi (§2). L'anomalia nasce quando l'operatore **forza il numero a mano**, o **cambia la data** di un documento già salvato — e resta poi visibile nei documenti creati dopo, come nel caso terminale del §2.

_Nota: la prima stesura diceva «l'anomalia può nascere solo in due modi, perché la proposta automatica è corretta per costruzione». La seconda parte era imprecisa e va letta così: la proposta non crea anomalie, ma può renderne visibile una già introdotta dall'operatore._

### Comportamento

Avviso, non blocco. **Elenca i documenti in anomalia**, non solo quello corrente. Sì salva comunque, No torna al documento.

L'avviso è **persistente**: continua a comparire finché l'anomalia resta nei dati, anche sui documenti successivi corretti. È voluto — un buco non giustificato va risolto, e un avviso che sparisce da solo lascia dimenticare.

**Casella «non mostrare più questo messaggio»:** spegne l'avviso **solo per il tipo documento in cui è comparsa**. Chi sistema le fatture non resta cieco sui DDT.

Una volta spenta resta spenta. Nessuna riaccensione, nessun pannello nelle Impostazioni. Rischio accettato: una spunta presa per sbaglio è definitiva per quell'operatore e quel tipo, e l'unico rimedio è il database.

**Si applica a tutti i tipi documento**, non solo ai fiscali. Non decidiamo noi a monte dove serve: lo decide l'operatore spegnendolo dove non gli interessa.

### Forma della preferenza

Copiare `UserDocumentPriceModePreference`, chiavata su `(tenantId, userId, documentType)` — è esattamente l'identità che serve. Non progettare una tabella nuova.

---

## §5 — Quale numerazione ha ciascun documento

_Lista definita da Luigi l'11 agosto 2026._

### Categoria A — Data interna, Numero interno, Serie interna

| Documento                | Note                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preventivi               |                                                                                                                                                                                                                                                   |
| Ordine cliente (interno) | Solo `source = manual`. Gli ordini dai canali portano il numero del canale, vedi §8 **Numerazione in testata dal 12/08/2026**: il campo era nascosto da un `@if (!isOrder)`, e il numero lo assegnava il server senza che l'operatore lo vedesse. |
| Fattura proforma         | Oggi si chiama «Proforma», da rinominare                                                                                                                                                                                                          |
| DDT di vendita           | Da valutare il nome, vedi §10                                                                                                                                                                                                                     |
| Fattura                  | Con tutta la famiglia di sottotipi: accompagnatoria, d'acconto, nota di credito. **Un solo progressivo condiviso**                                                                                                                                |
| Ordini fornitore         | ✅ **Fatto il 12/08/2026.** In testata non c'erano né numero né serie: il server numerava d'ufficio e l'operatore non vedeva né sceglieva niente. Nessuna migration — le colonne `series` e `number` su `supplier_orders` c'erano già             |
| Scarico manuale giacenze |                                                                                                                                                                                                                                                   |
| Trasferimenti interni    | Numerazione propria. Il DDT eventualmente generato ha la sua                                                                                                                                                                                      |
| Rettifica inventario     | _Aggiunta il 12 agosto 2026._ Mancava dalla lista — non per scelta, per dimenticanza. **Già implementata**: data, numero e serie in testata, e `adjustment` è fra i tipi con numeratore proprio (`COUNTER_CONFIGURABLE_DOCUMENT_TYPES`)           |

### Categoria B — due blocchi distinti

Documenti che arrivano dal fornitore: il numero contabile è quello del fornitore, il nostro serve a catalogare.

**Arrivi merce**

- Blocco _Documento fornitore_: Fornitore, **Tipo documento**, N. doc. fornitore, Data documento
- Blocco _Registrazione VestiFlow_: Data registrazione, Numero, Serie

Il **Tipo documento** è un elenco configurabile (DDT, fattura accompagnatoria, altro), perché la merce può arrivare accompagnata da documenti diversi. **Già implementato:** lo schema ha `ExternalDocumentType`, e il commento sull'enum dice esplicitamente che è un dato a parte, che compone la causale e non genera un tipo documento diverso.

**Registrazione fattura fornitore**

- Blocco _Documento fornitore_: Data documento, Numero documento fornitore
- Blocco _Registrazione VestiFlow_: Data interna, Numero, Serie

Qui il Tipo documento non serve: è già nel nome.

### Fuori da entrambe

**Corrispettivi.** Erano nella lista originale come Categoria A. **Escono con la decisione del §8**: diventano un registro, senza data-numero-serie propri.

**Ordini dai canali** (Shopify e altri): nessuna numerazione VestiFlow, portano quella del canale.

### Il numero interno si chiama "Numero", non "Protocollo"

_Deciso 11 agosto 2026, su verifica normativa._

L'obbligo di numerazione progressiva delle fatture d'acquisto **non esiste più**: l'art. 13 del D.L. 119/2018 lo ha eliminato dall'art. 25 del DPR 633/1972, per adeguare la norma alla fatturazione elettronica. Le fatture elettroniche si registrano liberamente, senza progressione né ordine di ricezione, con l'unico vincolo di essere annotate prima della liquidazione periodica in cui si detrae l'IVA.

Il numero interno resta utile come collegamento fra registrazione contabile e documento archiviato, ma è comodità gestionale, non vincolo di legge. Non c'è ragione di introdurre una seconda parola per la stessa cosa.

La confusione col numero del fornitore si risolve con la separazione visiva dei due blocchi.

**Superato:** «Protocollo» come etichetta (24 luglio) — motivato da un obbligo che non esiste.

⚠️ **La parola è ancora a schermo** _(misurato 12/08/2026)_: `goods-receipt-form.component.html` la usa come etichetta del campo (righe 264 e 455), nell'intestazione della pagina (riga 30, «Protocollo: …») e nel titolo del dialogo di conflitto (riga 2177); la Fattura acquisto la usa in un messaggio (`purchase-invoice-form.component.ts:460`). Il nome del controllo (`protocolNumber`) e i commenti dei mapper la portano ancora. Decidere se la rinomina è solo di etichette o anche di codice.

**Superata** anche la Categoria C (Scarico manuale, Trasferimenti, Rettifiche con numero non editabile e senza serie), proposta il 24 luglio e sciolta subito dopo.

## §5-bis — Cosa c'è davvero in testata, confrontato con la lista

_Misurato il 12 agosto 2026 su schema Prisma, DTO e maschere Angular. **Nessun campo è stato rimosso**: questa sezione è il confronto che precede la decisione._

### Il blocco «documento della controparte» sta in sei maschere, e la lista lo prevede in due

| Maschera         | Tipi che serve                                   | §5                                              | Trio presente          | Esito                                 |
| ---------------- | ------------------------------------------------ | ----------------------------------------------- | ---------------------- | ------------------------------------- |
| Arrivo merce     | `goods_receipt`                                  | Cat. B — lo prevede                             | sì                     | ✅ è il caso per cui è nato           |
| Fattura acquisto | `supplier_invoice`                               | Cat. B — prevede numero e data, **non** il tipo | sì, tutti e tre        | ⚠️ `externalDocumentTypeId` di troppo |
| Ordine cliente   | ordine, preventivo, DDT vendita, scarico manuale | Cat. A                                          | sì                     | ❌ tre campi di troppo                |
| Fatture          | proforma, fattura, accompagnatoria               | Cat. A                                          | sì                     | ❌ tre campi di troppo                |
| Ordine fornitore | ordine fornitore                                 | Cat. A                                          | sì                     | ❌ tre campi di troppo                |
| Rettifica        | `adjustment`                                     | Cat. A (aggiunta oggi)                          | sì                     | ❌ tre campi di troppo                |
| Trasferimento    | `transfer`                                       | Cat. A                                          | **no, tolto il 12/08** | ✅                                    |

**Perché sono di troppo, e sono due motivi diversi.** Trasferimento e Rettifica sono documenti **interni**: non esiste una controparte che abbia emesso qualcosa. L'Ordine fornitore una controparte ce l'ha, ma **in quel momento non ha ancora emesso niente**: il suo documento arriva dopo, con la merce, ed è esattamente quello che l'Arrivo merce chiede. Chiedere il numero di un documento che non esiste ancora è ciò che lascia quelle celle vuote per sempre.

### Da dove vengono le colonne, e cosa contengono

**Aggiunte dal commit `6fc27982` (11 agosto)**, migration `20260810120000_documento_controparte_ovunque`:

| Tabella           | Colonne                                                                                                    | Dati al 12/08/2026              |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `sales_orders`    | `external_doc_number`, `external_doc_date`, `external_document_type_id`, `external_document_type_snapshot` | 28 record, **zero valorizzati** |
| `supplier_orders` | le stesse quattro                                                                                          | 10 record, **zero valorizzati** |

**Preesistenti**, migration `20260701120000_documents_foundation` (1° luglio), nate per l'Arrivo merce: le stesse colonne su `documents`. Qui i dati **ci sono, ma solo dove servono**: 99 documenti, 47 valorizzati, **tutti `goods_receipt`**. Sales DDT, preventivi, scarico manuale e vendite al banco: zero. Di trasferimenti e rettifiche non esiste ancora nessun record.

**Conseguenza operativa:** togliere le quattro colonne da `sales_orders` e `supplier_orders` **non perde alcun dato**. Su `documents` invece le colonne restano — le usa l'Arrivo merce — e il di troppo è solo nell'interfaccia degli altri tipi. Resta comunque una migration distruttiva su database condiviso: va decisa a parte, non fatta di sfuggita.

### I campi viaggiano anche dove non si vedono

Li accettano `save-transfer.dto`, `save-adjustment.dto`, `create-document.dto`, `update-document.dto`, `create-supplier-order.dto`, `update-supplier-order.dto`, `save-manual-sales-order.dto`. Togliere il blocco dalle maschere non basta a chiudere la porta: finché il DTO li accetta, un client può scriverli.

### ✅ Ordine fornitore e Ordine cliente: numerazione in testata — chiuso il 12/08/2026

⚠️ **La prima stesura di questa voce diceva che l'Ordine fornitore era «l'unico di Categoria A» senza numerazione in testata. Era falso: erano due.** L'Ordine cliente aveva i controlli nel form ma il campo nascosto da un `@if (!isOrder)`, in entrambe le viste — e verificare che un controllo esista non è verificare che si veda. L'errore è stato trovato da una verifica adversariale della specifica contro il codice, non da una prova.

Su entrambi il server numerava già — serie predefinita, lock sul contatore, primo libero — quindi il numero c'era: non si vedeva, e non si poteva scegliere la serie né tappare un buco.

Deciso da Luigi: **serie, numero e data come tutti**, col meccanismo degli altri (proposta dal contatore, gestione serie dall'ingranaggio, avviso sul numero già preso). Fatto senza migration: `series` e `number` su `supplier_orders` esistevano già.

**Il blocco non è stato copiato, è stato estratto.** Sarebbe stata la sesta copia dello stesso meccanismo (Ordine cliente, Arrivo merce, Fattura acquisto, Trasferimento, Rettifica ne portano una ciascuna). Ora vive in `domain/documents/state/document-numbering.store.ts`, con le sue undici prove, e l'Ordine fornitore è il primo consumatore. **Le altre cinque restano com'erano**: migrarle è un passo suo, una maschera per volta.

### Quale data usa la numerazione

_Verificato sul ramo l'11 agosto._

`Document.documentDate` è documentata nello schema come «Data interna di registrazione (solo giorno)», ed è colonna diversa da `externalDocDate`, «Data del documento della controparte». **La numerazione interna segue sempre la data di registrazione**; la data del documento del fornitore non entra mai nella proposta.

| #   | Punto                                               | Data                                                                                                |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `documents.service.ts:2946`                         | `documentDate` — da propagare, il metodo privato non la riceve                                      |
| 2   | `goods-receipt-workflow.ts:439` (Arrivo merce)      | `documentDate` = data registrazione                                                                 |
| 3   | `goods-receipt-workflow.ts:965` (Fattura fornitore) | idem                                                                                                |
| 4   | `transfer-adjustment-workflow.ts:156`               | `documentDate` — da verificare in scope                                                             |
| 5   | `store-sales.service.ts:119` (vendita banco)        | `dto.documentDate ?? new Date()`                                                                    |
| 6   | `store-sales.service.ts:291` (reso)                 | `new Date()`                                                                                        |
| 7   | `manual-sales-orders.ts:274` (ordine cliente)       | **Aperto** — non c'è una data del documento in scope, va deciso quale campo di `SalesOrder` fa fede |
| 8   | `supplier-orders.service.ts:175`                    | `dto.orderDate ?? new Date()`                                                                       |

**Anteprima — tre punti, e manca il campo.** `documents.service.ts:788`, `manual-sales-orders.ts:90`, `supplier-orders.ts:122`. `PreviewDocumentNumberQueryDto` porta `type`, `series`, `year` e **nessuna data**: va aggiunta, e il frontend deve richiedere l'anteprima a ogni cambio data. Il meccanismo esiste già per il cambio serie (§6), quindi è un innesto.

Nota: quel `year` nel DTO è un residuo dell'anno che il §1 dichiara uscito dal modello.

---

## §5-ter — Cosa è stato tolto, cosa resta, cosa aspetta la finestra

_Scritto il 12 agosto 2026, dopo il rilievo dei campi di testata di tutte e sette le maschere (schema Prisma, DTO, form). È la lista che serve fra due settimane per sapere **cosa era residuo e cosa era voluto**._

### A — Tolto, e chiuso anche l'ingresso

| Cosa                                                        | Dove                                                                           | Stato                                                                                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocco «documento della controparte» (Tipo · Numero · Data) | Ordine cliente, Ordine fornitore, Fatture di vendita, Rettifica, Trasferimento | ✅ tolto dalle maschere **e dai DTO**                                                                                                                |
| Solo il **Tipo documento**                                  | Registrazione fattura fornitore                                                | ✅ tolto: la maschera registra una fattura, il tipo è già nel nome. Restano N. fattura e Data fattura, che sono i dati del documento che si registra |
| Segnaposto «Es. conferma d'ordine del fornitore»            | Ordine fornitore, campo «Rif. ordine fornitore»                                | ✅ cambiato in «Es. RIF-2026-114»: invitava a scrivere a mano il documento appena tolto — non un residuo, **un'istruzione sbagliata**                |
| Commenti che descrivevano il blocco come presente           | Ordine cliente, Ordine fornitore                                               | ✅ tolti                                                                                                                                             |

**Perché anche i DTO.** Finché accettano quei campi, un client può scriverli e le colonne tornano a riempirsi di dati che nessuna maschera mostra. Chiudere l'ingresso è **additivo** e non aspetta nessuna finestra. Restano aperti in due soli posti, dove servono davvero: `save-goods-receipt.dto` (la merce arriva accompagnata da un documento, e il tipo va scelto) e `save-purchase-invoice.dto` (si sta registrando la fattura del fornitore, ed è da lì che gli arrivi merce si agganciano).

### B — Resta com'è, e non è un residuo

| Campo                                         | Dove                                 | Perché resta                                                                                      |
| --------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Blocco controparte completo                   | **Arrivo merce**                     | È il caso per cui è nato: la merce arriva accompagnata da documenti diversi, e il tipo si sceglie |
| N. fattura + Data fattura                     | **Registrazione fattura fornitore**  | Sono i dati del documento che si sta registrando                                                  |
| `externalRef`                                 | Ordine cliente / Scarico manuale     | È una **causale libera** («campionario fiera»), non il numero di un documento                     |
| `supplierReference`                           | Ordine fornitore                     | Riferimento libero comunicato dal fornitore: un codice, non un documento con tipo e data          |
| `expectedDeliveryDate` / `expectedAt`         | Ordine cliente, Ordine fornitore     | Consegna prevista: fuori dal perimetro della numerazione                                          |
| Campi trasporto (data e ora, colli, tracking) | DDT vendita, Fattura accompagnatoria | Dominio del trasporto                                                                             |

### C — Aspetta la finestra distruttiva

Da fare **insieme**, in una finestra concordata col collega, non a spizzichi: ogni pezzo è un `DROP` su un database condiviso.

| Cosa                                          | Tabelle                           | Dati oggi                                                                                                                                                             |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quattro colonne del documento controparte     | `sales_orders`, `supplier_orders` | **vuote su tutti i record** (28 e 10 al 12/08/2026): togliere non perde niente                                                                                        |
| Le stesse colonne per i tipi che non le usano | `documents`                       | ⚠️ **NON si toccano**: 47 documenti le hanno valorizzate, e sono tutti Arrivi merce. Lì il di troppo era solo nell'interfaccia degli altri tipi, ed è già stato tolto |
| `documents.year`                              | `documents`                       | Vedi sotto                                                                                                                                                            |
| Numerazione del Corrispettivo                 | §8                                | Coordinare con `feature/cassa`                                                                                                                                        |
| `DocumentSequence`                            | §9                                | Backup da sistemare prima                                                                                                                                             |

#### `documents.year` — è una colonna scritta, non un calcolo al volo

_Verificato il 12/08/2026._ È `Int` **NOT NULL**, riempita all'inserimento da `documentDate.getFullYear()` in due punti (`documents.service.ts:909` e `:1348`), mappata sul modello frontend (`document-api.mapper.ts:307`) — e **letta da nessuno**. Non entra in nessun indice di `Document`, e il commento nello schema lo dice già: «Metadato (filtri/adempimenti). NON fa più parte della numerazione».

**Quindi la rimozione è una migration, non solo codice — e non c'è un ordine sicuro fra le due.** Essendo NOT NULL senza default, **entrambe le metà da sole rompono ogni inserimento**:

| Se cade prima…                  | Cosa succede                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------ |
| **il codice** che scrive `year` | ogni `INSERT` viola il vincolo NOT NULL: nessun documento si salva più         |
| **la colonna**                  | ogni `INSERT` nomina una colonna che non esiste: nessun documento si salva più |

Non è quindi «prima l'uno o prima l'altro»: **schema, migration, codice e `prisma:deploy` in un colpo solo**, come dice `regole-qualita` («o tutti e tre insieme, oppure nessuno dei tre»).

**Perché va tolta e non lasciata lì.** Il §1 dice che l'anno esce dal modello. Finché una colonna che si chiama `year` esiste e viene calcolata, prima o poi qualcuno ci si appoggia — un filtro, un export, un adempimento — e **riapre da solo il concetto che abbiamo tolto**. Non è un residuo innocuo: è un invito.

#### ⛔ L'anno si toglie SOLO da `documents`. Altrove è in funzione

Questa è la riga da leggere se fra due settimane si legge «togliamo l'anno» e si va a cercare dove sta.

| Tabella                 | L'anno è…                                                                                      | Si tocca qui?                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `documents`             | metadato scritto e mai letto                                                                   | ✅ sì, è questo il perimetro                        |
| `online_sales`          | **nella chiave unica** `(tenant, series, year, number)` e dentro il riferimento `VO-2026-0001` | ⛔ **no** — cade col §8, insieme al vecchio motore  |
| `corrispettivo_entries` | idem, `COR-2026-0001`                                                                          | ⛔ **no** — §8, e va coordinato con `feature/cassa` |
| `document_sequences`    | **nella chiave** `(tenant, type, series, year)`: è la partizione stessa                        | ⛔ **no** — cade col §9, con la tabella intera      |

Toglierlo dalle ultime tre non è una pulizia: **rompe la numerazione delle vendite online e dei corrispettivi**, che su quelle colonne ci contano davvero.

### D — Da decidere, non da eseguire

- **Ordine fornitore**: il riferimento salvato (`OF-2026-0001`) non si vede mai in modifica — l'anteprima è spenta e `reference` non è reso da nessuna parte.
- **Ordine fornitore in creazione**: la riga in cima («prossimo riferimento») è calcolata sulla **serie predefinita** e può quindi nominare una serie diversa da quella scelta nel campo. Due numeri diversi in testata.
- **Arrivo merce in modifica**: numero digitato ignorato e nessuna rinumerazione al cambio serie (§6 lo registra come decisione aperta).

## §6 — Serie e testata

_Deciso 3 agosto 2026, verificato 11 agosto._

Testata: **Data, Serie, Numero**.

La serie si sceglie da una tendina, non si scrive. Contiene i contatori del tipo documento corrente, filtrati sulla sede: quelli con quella sede più quelli senza.

Default: il contatore marcato `isDefault`.

**Superato:** «ultima serie usata dall'operatore» come default (24 luglio e `numerazione-documenti-verifica.md`). Vince `isDefault`, che è configurato e non segue l'operatore.

Al cambio serie il numero si ricalcola sul contatore nuovo. Il riferimento si ricompone anche quando cambia la sola serie — già implementato sul ramo.

Icona ⚙ accanto al campo Serie: apre il popup dei numeratori filtrato, riusando il componente delle Impostazioni. Aggiorna la tendina **senza auto-selezionare**.

Su un documento già salvato tutta la testata resta modificabile: data, serie e numero. Anche verso una serie che non è più quella corrente.

### Due cose da chiudere

**`DocumentTypeSetting`** porta ancora `autoNumbering` e `defaultSeries` (default `'A'`). La logica di numerazione non li consulta — la serie viene da `defaultCounterSeries` — ma restano trasportati da impostazioni e DTO. Il 3 agosto era stato deciso di rimuoverli, perché creavano una seconda configurazione della serie che non parlava coi contatori. **Da tracciare fino al frontend prima di toglierli.**

**Arrivo merce in modifica** ignora il numero digitato e il cambio serie. Preesistente, ma contraddice la regola sopra. **Decisione di prodotto aperta**, non un bug da sistemare senza chiedere.

---

## §7 — La famiglia fattura

_Deciso 11 agosto 2026 sul modello Danea. Comportamenti per sottotipo in §10._

Un solo tipo documento, un solo contatore per serie. Il sottotipo si sceglie da un selettore all'apertura ed è un campo del documento.

Sottotipi: Fattura, Fattura accompagnatoria, Fattura d'acconto, Nota di credito.

**Numerazione continua per tutti**, differenziati nell'elenco da una colonna che dice cosa sono. Il sottotipo non entra nella partizione: resta `(tenant, tipo, serie)`.

**Fattura proforma resta fuori.** Non è nell'elenco di Danea e non deve esserci: se consumasse la numerazione delle fatture bucherebbe il registro fiscale.

**Autofattura esclusa** in attesa di chiarimento: è l'unica dei cinque che non è un documento attivo, e in diversi casi vuole un registro separato.

**Stato:** `invoice_accompanying` è già nell'enum e `document-type.util.ts:35` la mappa già sul numeratore della fattura. Nota di credito e Fattura d'acconto vanno aggiunte all'enum — additivo. Vedi anche §9 sull'indice unico.

---

## §8 — Documenti senza operatore, e i Corrispettivi

_Deciso 11 agosto 2026._

### Ordini dai canali

Gli ordini importati da Shopify e dagli altri canali **portano il numero del canale**. `sales_orders.number` resta NULL per le origini non manuali: il numero del canale è il loro identificativo e serve a riconciliare.

### Corrispettivi: registro, non documento

VestiFlow conosce già tutte le vendite, riga per riga, con aliquota e totale. Il totale giornaliero per sede, canale e aliquota è quindi **una query su dati che già esistono**. Creare un documento per contenerlo significa duplicare informazione e doverla tenere allineata.

Il corrispettivo come documento nasce in sistemi che i dati di vendita non li hanno — Danea infatti lo fa registrare a mano a fine giornata, dichiarando come motivo il fatto che potrebbero esistere scontrini battuti fuori dal gestionale.

**Il registro** aggrega le vendite per giorno, sede, canale e aliquota. Nessuna numerazione, nessuna serie, nessun contatore. Filtri per periodo, canale e aliquota, esportazione per il commercialista.

Le vendite in negozio ci finiscono automaticamente. Il «registra corrispettivi di fine giornata» di Danea non esiste.

**Correzioni:** il corrispettivo non si corregge, si corregge il documento da cui deriva. Il registro si riallinea da sé.

**Superate:** la separazione per serie fra cassa e canali; «precompila e conferma» a fine giornata; la chiusura di periodo.

### Niente registrazione manuale

Valutata e scartata l'11 agosto. Il motivo non è il codice — sarebbe poca cosa — ma il fatto che offrirebbe **due strade per lo stesso risultato**: battere le vendite (che scaricano il magazzino e alimentano il registro) oppure digitare il totale a fine giornata (che il magazzino non lo tocca). La seconda è più veloce, quindi verrebbe scelta, e dopo tre giorni di guasto la giacenza è sbagliata senza che nessuno capisca perché.

I casi che sembravano richiederla sono già coperti: il **registro di emergenza** dalla vendita al banco (sotto), il **fatturato pregresso** dall'import iniziale.

Se dopo mesi di uso reale emerge un caso scoperto, si aggiunge — ma una scorciatoia che sbaglia il magazzino, una volta presa dagli operatori, non si toglie più.

### Il registro di emergenza

Quando l'RT si guasta o manca la rete, l'esercente deve segnalare il «fuori servizio» dal portale dell'Agenzia e annotare **ogni singola operazione** con data e ora, corrispettivo e aliquota, prima che il cliente esca dal negozio. Il registro può essere cartaceo **o tenuto con modalità informatiche**.

Ogni vendita al banco è già un'operazione con data, importo e aliquota. Registrando anche **l'ora** e sapendo stampare quell'elenco, **VestiFlow è il registro di emergenza**, senza che nessuno digiti nulla.

Servono due cose piccole e additive: **l'ora sulla vendita al banco** e un marcatore **«RT fuori servizio»** su giornata e sede, con una stampa filtrata su quei giorni.

### Base normativa

Il corrispettivo in VestiFlow **non è un documento fiscale**. Dal 1° gennaio 2020 il registro dei corrispettivi non è più obbligatorio: l'art. 2 comma 1 del D.Lgs. 127/2015 stabilisce che l'invio telematico dall'RT entro 12 giorni sostituisce gli obblighi di registrazione dell'art. 24 del decreto IVA. Solo le categorie esonerate dall'invio telematico usano ancora il registro in alternativa.

L'adempimento sta nel registratore telematico. Il registro serve a VestiFlow e al commercialista per controlli e quadrature. **La numerazione del corrispettivo non ha quindi vincoli di legge**, ed è ciò che rende possibile la decisione sopra.

### Cosa cade, e cosa va deciso prima

Il corrispettivo non è solo righe: esiste già `corrispettivo-register.service.ts` con elenco paginato, filtri, stato, `invoiceIssued`, `excludedFromSummary`, `exclusionReason`, righe analitiche con snapshot IVA, e lato frontend `corrispettivi-register.component.ts`. Fra schema, servizi, DTO, mapper e componenti sono **21 file** che nominano l'entità, più tre migration.

Cadono `corrispettivo_entries` e `corrispettivo_entry_lines`, e con loro **tre informazioni che le vendite non hanno**:

- lo **stato di verifica**
- la **motivazione** dell'esclusione dal riepilogo
- la **data fiscale** modificabile, separata dalla data operativa

L'esclusione in sé si ricostruisce (è la vendita fatturata, vedi §10). Le altre due no: sono decisioni prese da un operatore, non deducibili da nessun dato.

**Vanno decise prima di scrivere il prompt**, non durante.

### Il vecchio motore

Vendita online e Corrispettivo usano `DocumentSequence`: contatore autonomo, serie `'A'` scritta nel codice, anno nella partizione, riferimento `COR-2026-0001`. Tabelle proprie (`online_sales`, `corrispettivo_entries`) col vincolo `(tenant, serie, anno, numero)`.

Il lavoro non è «unificarlo sullo schema nuovo» ma **togliere al corrispettivo la numerazione che ha**.

`feature/cassa` ha già scritto codice sul corrispettivo con una sequenza condivisa fra cassa e online. **Quella scelta è superata da questa decisione** e va comunicata al collega prima che si lavori nella direzione vecchia.

---

## §9 — Residui e correzioni tecniche

_Verificati 11 agosto 2026._

### Fattura e Fattura accompagnatoria — bug corretto, non «già a posto»

Una stesura precedente diceva che condividevano già un solo progressivo e non c'era nulla da fare. Vero nella logica di proposta, **falso nel database**: l'indice unico stava sul tipo grezzo, quindi una Fattura 42 e una Accompagnatoria 42 potevano coesistere — il contrario della decisione. Il ramo l'ha trovato e corretto: l'indice è passato al numeratore, e le letture della partizione usano ora `documentNumberingTypes` al plurale, o il massimo vedrebbe metà dei documenti. Migration già applicata.

La correzione **rende vera** la decisione di condividere il progressivo, non la cambia.

### Residui

**`nextDocumentNumber`** in `document-totals.util.ts:17` non ha chiamanti. Rimovibile.

**`DocumentSequence`** è agganciata al backup in cinque punti: due elenchi in `tenant-backup.constants.ts`, il ramo di export, e nell'import un `deleteMany` seguito da `createMany`.

Il vincolo vero non è il codice: **i pacchetti di backup già prodotti contengono un `documentSequences.json`**, formato dichiarato alla versione 1. Se si rimuove la tabella, l'import deve continuare a tollerare quel file negli archivi vecchi — altrimenti un ripristino si rompe in silenzio, che è il modo peggiore in cui un backup smette di essere un backup. **Il backup va sistemato prima della rimozione.**

**Aperti dal commit dell'11 agosto:** la scheda numeratori fa tre query per contatore; il PDF dell'ordine fornitore non porta il documento della controparte.

---

## §10 — Fuori perimetro

Da decidere in sessione dedicata:

- **Comportamenti per sottotipo fattura**: la fattura d'acconto accende la generazione della fattura di saldo; l'accompagnatoria aggiunge i dati di destinazione merce; la nota di credito inverte il segno. Autofattura da chiarire.
- **Nota di credito**: segno sulla riga, direzione del movimento di magazzino (una nota su merce resa è un **carico**), collegamento alla fattura d'origine. Creazione da zero e generazione da fattura esistente devono produrre lo stesso risultato.
- **Le due informazioni che cadono col corrispettivo**: motivazione dell'esclusione e data fiscale separata (vedi §8).
- **Resi**: riga negativa nel giorno del reso o rettifica sull'originale.
- **Esclusione automatica** delle vendite fatturate dall'aggregazione, per non contare due volte lo stesso incasso.
- **Trasferimenti interni**: comando «Genera DDT» disponibile sempre, nessun automatismo, nessuna proposta legata al confronto fra indirizzi. Il trasferimento tiene la sua numerazione, il DDT la sua.
- **Tipi mancanti** dalla lista del §5: Rettifiche di giacenza, inventario, reso di negozio.
- **Rinomini**: Proforma → Fattura proforma; Vendita in negozio → Vendita al banco; come qualificare il DDT di vendita senza confonderlo con quello del fornitore, visto che negli Arrivi merce «DDT» indica il documento in arrivo.
- **Arrivo merce in modifica**: oggi ignora numero digitato e cambio serie (vedi §6).
- **Ordine cliente**: quale campo di `SalesOrder` fa da data per la numerazione (§5, punto 7).
- **Registratore telematico**: un browser non parla con un dispositivo sulla rete locale. Due strade — chiamata diretta al servizio di rete dell'RT, o programma ponte sul computer del negozio. Va scelta anche la lista dei modelli supportati.

### Domande per il commercialista

1. Con RT guasto e registro di emergenza tenuto correttamente: la trasmissione tramite «dispositivo fuori servizio» resta dovuta o è esonerata? Le fonti divergono, e la sanzione è il 90% dell'imposta non trasmessa.
2. VestiFlow deve produrre un file caricabile sul portale, o basta la stampa del registro?
3. Le sedi secondarie vanno dichiarate all'Agenzia come luoghi di deposito? La merce in un deposito non dichiarato rientra nella presunzione di cessione.

---

## Ordine di esecuzione

1. **§3 — riportare l'avviso di conflitto al comportamento dell'8 agosto** (campo che si aggiorna), tenendo le due migliorie del ramo. Piccolo e indipendente.
2. **§2 — proposta per data.** Dodici chiamate in sette file, più i tre punti del conflitto, il campo data sul DTO di anteprima, l'indice composito e la query in SQL puro.
3. **§4 — controllo cronologico** con avviso persistente. Dipende dal 2.
4. **§7 — famiglia fattura**, sottotipi. Additivo.
5. **Rimozione della numerazione dal Corrispettivo** — coordinare con `feature/cassa`, e decidere prima le due informazioni che cadono.
6. **Rimozione di `DocumentSequence`** — backup sistemato prima.

I punti 1, 2 e 3 non collidono con `bugfix/righe-documento` né con i rami del collega.
