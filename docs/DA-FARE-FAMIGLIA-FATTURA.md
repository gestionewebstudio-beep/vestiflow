# Da fare — Famiglia Fattura e righe documento

**Documento di lavoro, 16/08/2026.** Non è una specifica: le specifiche sono `07` (famiglia
Fattura), `03b` (righe documento), `04` (numerazione), `06b` (fattura elettronica). Qui c'è
**cosa resta da fare**, in ordine, con le misure già prese e il perché di ciascuna scelta.

Si aggiorna man mano che le voci si chiudono. Quando è vuoto, si cancella.

---

## Come leggere le voci

| Stato                 | Significato                                                 |
| --------------------- | ----------------------------------------------------------- |
| 🔵 **PRONTO**         | misurato, la regola è decisa, si può scrivere codice        |
| 🟡 **DA DECIDERE**    | misurato, ma manca una scelta di dominio che spetta a Luigi |
| 🔴 **DIFETTO ATTIVO** | non è una funzione mancante: qualcosa oggi si comporta male |
| ⚪ **DA MISURARE**    | non ancora guardato abbastanza per stimarlo                 |

Ogni voce dice **da dove ricominciare** se ci si ferma a metà.

---

## A · Righe di riferimento — semantica `isReference` end-to-end — ✅ **FATTO il 16/08/2026**

✅ **Chiuso.** Il resoconto completo sta in `07` §26: cosa è cambiato, cosa NON è cambiato di
proposito (id, posizione, conteggio voci), le tre mutation test e il difetto del fixture che i
test hanno trovato. Qui resta la fotografia di com'era.

**Precedenza decisa il 16/08**, dopo aver trovato la causa radice. Viene **prima** di Fattura ↔
Nota di credito: quelle relazioni useranno questo meccanismo nella UI e nelle catene
documentali, e costruirci sopra mentre è rotto propagherebbe il difetto al terzo tipo.

### Non è «valorizzare `isReference` nella Fattura»

> **Una riga di riferimento è una riga descrittiva, non economica e non fisica. `isReference`
> è il discriminante strutturale, e deve essere rispettato da tutti i consumer.**

La specifica distingue già il **collegamento strutturato** dalla **descrizione testuale**
(`07` §12): non basta la scritta «Rif. …», e **non si riconosce una reference analizzandone il
testo** — mai, né a runtime né in un backfill.

**End-to-end vuol dire questi punti, tutti:**

persistenza · GET/PATCH · **inclusione** · calcoli di riga e di documento · IVA · sconti ·
totali · stock · stampa e UI · export dove pertinente · **FatturaPA**.

Una reference **resta visibile come descrizione** dove previsto — nell'elenco righe, nella
stampa gestionale — ma **non diventa riga economica o fisica, né `DettaglioLinee`**.

### La causa radice, misurata

**Lato API `isReference` oggi non significa niente.** Viene accettato dal DTO, salvato,
restituito — e basta. Nessun filtro nei calcoli IVA, nei totali, nell'XML. L'unico posto dove
fa qualcosa è **il frontend dell'Ordine cliente**, in sei punti, e solo nel browser.

La maschera vendita, quando include un documento, crea la riga `Rif. …` **senza valorizzare il
flag** (`sales-document-form.component.ts`, `onDocumentIncluded`): nasce come riga qualunque
con `quantity: 1`.

⚠️ **Due protezioni odierne sono accidentali, e non vanno scambiate per garanzie:**

| Cosa regge   | Perché                                                                      | Quando cede                                                                      |
| ------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| I totali     | la riga ha prezzo `0`, e sommare zero non sposta niente                     | se qualcuno digita un prezzo su quella riga, o se uno sconto documento la prende |
| Il magazzino | `isStockLine` richiede `variantId != null`, e una reference non ha articolo | mai, finché resta senza articolo — ma non è il flag a proteggerlo                |

**Il danno attuale e reale è l'XML**: la riga esce come `DettaglioLinee` con quantità 1 — una
riga prodotto per il cliente e per l'Agenzia. Più tutto ciò che conta le righe.

### L'inclusione fa parte di questo blocco

`IncludedDocumentLine` **non trasporta `isReference`**. È la causa della **perdita semantica
lungo le catene documentali**: una reference corretta a monte diventa una riga ordinaria nel
documento successivo, e da lì può finire nei calcoli, nell'IVA o nell'XML come se fosse un
prodotto.

> **Quando una riga di riferimento viene copiata da un documento incluso, deve conservare
> `isReference = true` anche nel documento destinazione e dopo i successivi salvataggi.**

**Criterio di accettazione, dichiarato da Luigi:**

1. il documento **A** contiene una riga prodotto e una riga `Rif. …` marcata;
2. si crea il documento **B** includendo A;
3. nel documento B quella riga arriva con **`isReference = true`**;
4. si salva B;
5. si riapre B → **ancora `true`**.

Va verificato anche l'**accumulo progressivo** del `07` §12: includendo due documenti si
ottengono due righe `Rif. …`, più quelle che ciascuno si portava dietro — e **tutte** devono
restare marcate.

### Perimetro

**Backend e frontend, non solo il form.** Il censimento da fare prima di scrivere: tutti i
punti in cui l'Ordine cliente rispetta già `isReference` (sei nel suo componente), confrontati
con maschera e servizio della famiglia Fattura, per nominare **dove il flag si perde** e
**quali consumer non lo rispettano**.

**Da dove si ricomincia:** dal censimento dei consumer, in lettura.

---

## A-bis · Il dato storico incoerente — ✅ **misurato e chiuso senza intervento (16/08)**

**La domanda era una sola:** quelle righe si possono identificare con **dati strutturali**,
senza leggere il testo `Rif. …`? **La risposta misurata è no.** Nessun backfill, nessuna
modifica dati, nessuna regola a runtime sul testo.

### Il dato

Tre righe in tutto, tutte su DDT di vendita, tutte in posizione 1:

| `documents.reference` | Riga                                      | `is_reference` | Creato   |
| --------------------- | ----------------------------------------- | -------------- | -------- |
| `DDT-2026-0002`       | `Rif. Preventivo PRE-2026-0001 del 20/07` | ❌ **`false`** | 22/07/26 |
| `DDT-0001`            | `Rif. Ordine cliente OC-0003 del 29/07`   | ✅ `true`      | 29/07/26 |
| `DDT-0002`            | `Rif. Preventivo PRE-0002 del 31/07`      | ✅ `true`      | 30/07/26 |

Su 137 righe documento, **2 sono marcate e 135 no**. Non è la famiglia Fattura ad avere il
problema: è il DDT, ed è **una riga sola**.

### Perché non esiste un criterio strutturale

L'impronta delle tre righe è identica: **niente variante, niente SKU, prezzo 0, totale 0, non
muove magazzino, nessuna unità di misura, nessun lotto**. Sembra una firma. Non lo è: è
**esattamente la forma di una riga vuota**, e le righe vuote esistono davvero.

| Criterio                                       | Righe prese | Davvero reference | Falsi positivi |
| ---------------------------------------------- | ----------: | ----------------: | -------------: |
| senza variante                                 |          31 |                 2 |         **29** |
| prezzo unitario 0                              |          70 |                 2 |         **68** |
| impronta piena (variante + prezzo + non muove) |      **23** |                 2 |         **20** |
| — di cui su `goods_receipt`                    |          20 |                 0 |      **20** ⛔ |
| — di cui su `sales_ddt`                        |           3 |                 2 |          **0** |

I venti falsi positivi sono righe vere di arrivo merce, con descrizioni come
`Riga documento`, `Pippo`, `goku`, `test 2`. Il criterio non distingue una riga di
riferimento da una riga **lasciata in bianco**, perché nel dato **non c'è differenza**.

Restringere ai soli DDT porterebbe la precisione a 3 su 3 — ma **per caso**: i DDT non hanno
(ancora) righe in bianco, e niente lo impedisce. Un criterio che regge finché nessuno lascia
una riga vuota su un DDT non è un criterio: è una coincidenza con una scadenza.

**Nessun altro appiglio.** Sulle 31 righe senza variante: `supplier_order_line_id` mai
valorizzato, `linked_goods_receipt_id` mai valorizzato, `unit_of_measure` mai valorizzato,
`line_source` **NULL su tutte e 137** le righe della tabella. Il codice IVA c'è su 30 righe su
31 — quindi non separa niente.

### Il legame a livello di documento non esiste come dato

Cercato anche lì, ed è la scoperta che conta di più: **`documents.source_document_id` esiste
nello schema ed è NULL su tutti i 105 documenti.** Non è mai stato scritto.

E **`documents.reference` non è un collegamento**: contiene il numero **del documento stesso**
nel vecchio formato (un `goods_receipt` ha `CAR-2026-0001`, un DDT ha `DDT-0002`). È
un'istantanea della propria numerazione, non un puntatore all'origine — conferma quanto già
misurato in `04-specifica-numerazione-documenti.md` §11.

### Conseguenze — due, e vanno in blocchi diversi

1. **A-bis si chiude qui.** L'unico criterio disponibile è la descrizione, cioè proprio
   l'euristica vietata. Il difetto è **una riga su 137**, isolata, su un documento di prova di
   luglio. Correggerla richiederebbe una decisione esplicita di Luigi su un dato singolo, non
   una regola: **finché non la prende, resta com'è, nominata qui.** Non costa niente perché il
   codice non la interroga per il testo — dal blocco A in poi ogni consumer guarda il flag.
2. **`source_document_id` vuoto entra nel blocco 1** — ma **non** per la ragione scritta qui
   la prima volta. ⚠️ **Correzione del 16/08, stesso giorno:** avevo scritto «nessuno l'ha mai
   scritta», e non è vero. Il percorso è **completo**: `convertPrefill` restituisce
   `sourceDocumentId`, la maschera lo tiene in un signal e lo rimanda nel corpo del create, il
   DTO lo accetta e `documents.service.ts` lo persiste. È **mai stato esercitato**, che è
   un'altra cosa: nel database non esiste **un solo documento nato da una conversione**. I
   documenti collegati che ci sono nascono da **inclusione** o da **Concludi ordine**, e
   nessuno dei due passa di lì. Il difetto restava — la colonna è vuota — ma la diagnosi era
   sbagliata, e cambia il costo del blocco 1: non è da costruire, è da **collegare a una
   coppia origine→destinazione nuova**.

**Nota di metodo.** Le due righe marcate hanno `quantity = 1`; il blocco A scrive ora
`quantity: 0`. Quindi anche **le righe marcate sono storiche nella forma**, e nessun criterio
basato sulla quantità reggerebbe a cavallo del cambio.

---

## 1 · Collegamenti Fattura ↔ Nota di credito — 🟡 **dopo il blocco A**

**Perché non più per primo:** la Nota di credito senza relazione con l'origine è una fattura
col segno girato, e tutto il dominio NC poggia su questa. Ma quelle relazioni **useranno il
meccanismo delle righe di riferimento**, che oggi è rotto (blocco A): costruirci sopra
significherebbe propagare il difetto al terzo tipo.

### Cosa è già misurato

Il blocco «documento collegato» di FatturaPA ha **sei voci**; VestiFlow ne ha **una**:

| Voce                       | Tracciato | Stato                                       |
| -------------------------- | --------- | ------------------------------------------- |
| `DatiOrdineAcquisto`       | 2.1.2     | assente                                     |
| `DatiContratto`            | 2.1.3     | assente                                     |
| `DatiConvenzione`          | 2.1.4     | assente                                     |
| `DatiRicezione`            | 2.1.5     | assente                                     |
| **`DatiFattureCollegate`** | 2.1.6     | **assente — ed è quella che serve alla NC** |
| `DatiDDT`                  | 2.1.8     | **presente e funzionante**                  |

In Danea non sono campi sparsi: sono **un menu solo**, «Doc. emesso in seguito a», con le sei
voci e i campi N. / del / CIG / CUP accanto. Noi ne offriamo una sola, e la maschera la
presenta come se fosse l'unica possibile — per questo sulla Nota di credito compare
«Riferimento DDT», che è il difetto apparente dietro cui c'è la causa vera.

### Cosa va presentato prima di implementare

**Le sei componenti, distinguendo** — richiesta esplicita di Luigi, 16/08:

1. cosa esiste;
2. cosa manca;
3. cosa serve alla **gestione ordinaria** (leggere in elenco, aprire l'origine, capire cosa
   storna cosa);
4. cosa serve **specificamente alla FE** (`DatiFattureCollegate`);
5. cosa riguarda la **NC generata da una Fattura VestiFlow**;
6. cosa serve alla **NC riferita a una fattura esterna o storica** — che non è un documento
   nostro, quindi numero e data si digitano.

### Le alternative in campo — registrate, nessuna scelta presa

| Candidato                       | Cosa coprirebbe                                                             | Stato                                         |
| ------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| **`Document.sourceDocumentId`** | NC **generata da una** Fattura VestiFlow. **Esiste già**                    | ⚠️ **colonna sì, dato no** — vedi sotto       |
| La sua **relazione inversa**    | **più NC dalla stessa Fattura** — «da questa fattura sono nate queste note» | **compatibile**, non richiede niente di nuovo |
| **`InvoiceSalesDdtLink`**       | molti-a-molti fra documenti                                                 | **pattern candidato, NON decisione**          |
| Una relazione dedicata          | da disegnare                                                                | solo se le prime non bastano                  |

⚠️ **`sourceDocumentId` è NULL su tutti i 105 documenti** (misurato in A-bis, 16/08). La
colonna esiste nello schema e **nessuno l'ha mai scritta** — nemmeno i tre documenti nati da
un'inclusione, che portano il riferimento **solo come riga descrittiva**.

Cambia la natura del lavoro: non è «riusare un legame che c'è», è **cominciare a scriverlo**.
Il che è meno costoso, non di più — non c'è dato storico da conciliare — ma va detto prima,
perché «esiste già» suggerisce una base che sotto è vuota. E l'inverso di una colonna mai
popolata restituisce sempre l'insieme vuoto: qualunque elenco «note nate da questa fattura»
costruito oggi risponderebbe «nessuna» senza sbagliare una query.

Da non confondere: **`documents.reference` non è un puntatore all'origine** — contiene il
numero **del documento stesso** nel vecchio formato. Chi lo scambiasse per un collegamento
troverebbe 105 documenti «collegati» a sé stessi.

⚠️ **La cardinalità funzionale va scelta prima del modello tecnico**, non dedotta da una tabella
che assomiglia:

- **una Fattura può avere più Note di credito** → **deciso** (`07` §13), e la relazione inversa
  di `sourceDocumentId` lo copre già;
- **una NC collegata a più Fatture VestiFlow** → **APERTO**. Non è deciso, e non si deduce né da
  `DatiFattureCollegate` né dall'esistenza di `InvoiceSalesDdtLink`;
- **NC riferita a una fattura esterna o storica** → **ammessa e decisa** (`07` §13). Manca il
  **modello tecnico dei riferimenti manuali**: numero e data digitati. ⚠️ **Non riusare**
  `externalDocNumber` / `externalDocDate`, che sono del **ciclo fornitore** — un altro mestiere,
  disponibile solo perché esiste.

### La fattura elettronica resta fuori da questo blocco

`DatiFattureCollegate` e le altre quattro sezioni mancanti restano **censite e non
implementate**. Quando arriveranno leggeranno le **relazioni strutturate**, non le righe
descrittive — sono due piani distinti e non si sostituiscono (`07` §12).

### Vincolo già scritto nelle specifiche

`07` §13 chiede che una NC generata da una Fattura conservi una **relazione strutturata** con
l'origine e i **suoi snapshot storici**. Il solo testo visibile non basta.

### ✅ Il modello funzionale — **deciso da Luigi il 16/08**

Tre concetti distinti, che **non sono intercambiabili**:

| Concetto                 | Significato                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| `sourceDocumentId`       | il documento da cui VestiFlow ha **generato direttamente** questo   |
| righe `isReference`      | riferimenti **descrittivi**, visibili nel documento                 |
| riferimenti Proprietà FE | riferimenti **dichiarati**, struttura separata e **futura** (`06b`) |

**NC generata da una Fattura** — nasce **solo** dall'azione «Genera Nota di credito» sulla
Fattura. Prende righe e snapshot storici dell'origine; conserva le reference descrittive della
catena e aggiunge `Rif. Fattura …`; valorizza `sourceDocumentId` con l'id della Fattura. Nelle
future Proprietà FE il **primo** riferimento nasce precompilato da lì.

**NC creata da zero** — cliente e righe si compilano a mano. `sourceDocumentId = NULL`. **Non
usa «Includi documento»** e non può importare righe di una Fattura esistente. Nelle future
Proprietà FE si potranno dichiarare più documenti (più fatture, un DDT): **quei riferimenti non
diventano sorgenti gestionali**.

**Cardinalità:** una Fattura può generare **più** NC; una NC generata nasce da **una sola**
Fattura. **Nessuna tabella molti-a-molti serve in questa fase** — la relazione inversa di
`sourceDocumentId` copre già «da questa fattura sono nate queste note».

**Nessun backfill.** I 105 `NULL` restano. L'origine non si deduce da `reference` né dal testo
delle righe.

### Le cinque verifiche — fatte in lettura il 16/08

**1 · «Fattura → Genera NC» oggi non esiste, da nessuna parte.** L'API ammette **due sole**
origini di conversione (`buildConversionDto`): Proforma e DDT vendita; ogni altra origine è
respinta con un `ConflictException`. La UI espone `canConvertToInvoice` e `canConvertToSalesDdt`
— non c'è un terzo comando. **È un percorso nuovo**, non la modifica di uno esistente.

**2 · Cosa la conversione copia già, e cosa no.** Di testata viaggiano cliente, sede, valuta,
`pricesIncludeVat`, note, commento interno, causale, pagamento e i due indirizzi. Di riga:
`variantId`, `sku`, `description`, `quantity`, `unitPriceMinor`, `discountPercent`,
`vatRatePercent` e **`isReference`** (dal blocco A). **Non** viaggiano:

| Non copiato                                    | Perché conta per la NC                                               |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `vatCodeId`                                    | viaggia **solo l'aliquota**, non il codice — e la FE vuole il codice |
| `unitOfMeasure`                                | è la voce 5 di questo piano, già nota                                |
| `lotCode`, `lotExpiryDate`, `serialNumbers`    | voce 3: uno storno di merce con lotto senza lotto è monco            |
| costi (`enteredUnitCost`, `unitCostNet/Gross`) | da decidere se una NC li conserva                                    |
| `supplierOrderLineId`, `linkedGoodsReceiptId`  | legami del ciclo acquisto: **giusto** che non passino                |

**3 · Dove valorizzare `sourceDocumentId`.** Già fatto e atomico: `documents.service.ts` lo
scrive nella stessa `create` del documento e delle righe. **Non serve un passo nuovo** — serve
che il percorso Fattura → NC ci arrivi.

**4 · Le reference descrittive usano il blocco A, e manca un solo tassello.**
`conversionReferenceLine` costruisce la riga dal `CONVERSION_SOURCE_LABELS`, che contiene
**solo** Proforma e DDT. Per una Fattura tornerebbe `null`: **nessuna riga `Rif. Fattura …`**.
⚠️ La mappa è `Partial<Record<…>>`, quindi **il compilatore non lo direbbe**: è un buco
silenzioso, non un errore. L'ereditarietà della catena invece **è già a posto** — la
conversione copia `isReference` su tutte le righe, quindi `Rif. DDT` e `Rif. Ordine` che stanno
sulla Fattura arrivano sulla NC marcati.

**5 · I test che servono.** Una Fattura → **due** NC, ciascuna col proprio `sourceDocumentId`
verso la stessa origine; la relazione inversa che le restituisce entrambe; una NC da zero con
`sourceDocumentId` NULL; le reference della catena che sopravvivono al salvataggio e alla
riapertura. ⚠️ E **un test che percorra la conversione fino alla persistenza**: oggi non ne
esiste uno, ed è il motivo per cui la colonna è vuota senza che nulla sia rosso (`GUARDIE` §16).

### ⏸️ Quattro decisioni funzionali emerse — da chiudere prima di scrivere codice

**Chiuse tutte e quattro il 16/08.** Due lo erano già — le avevo riaperte senza controllare la
specifica, ed è lo stesso errore di trattare una premessa come una domanda. Le regole vivono in
`07` §6; qui resta solo cosa ne discende per il lavoro.

| #   | Decisione                                                                                  | Dove sta        |
| --- | ------------------------------------------------------------------------------------------ | --------------- |
| 1   | **Segno** — quantità e importi positivi, verso dal tipo. Era già deciso il 14/08           | `07` §6         |
| 2   | **Precompilato totale**, parziale togliendo righe o quantità. Over-credit fuori            | `07` §6 (nuovo) |
| 3   | **«Carica magazzino»** per riga movimentabile, default **OFF sempre**. Già deciso il 15/08 | `07` §6         |
| 4   | **Origini**: Fattura e Fattura accompagnatoria sì; Proforma/Preventivo/Ordine/DDT no       | `07` §6 (nuovo) |

### ✅ Nessun gate di stato — deciso il 16/08

**L'unica condizione è il TIPO del documento d'origine.** La regola «solo da una Fattura
uscita», che avevo proposto e mappato su `externally_registered`, è **ritirata**: quello stato è
una struttura **legacy** in uscita (blocco E qui sotto), e legarci una funzione nuova
significherebbe costruire su una fondazione che si sta smontando.

Nessuno stato sostitutivo va inventato. La distinzione fra **creare** gestionalmente una Nota e
**poterla emettere** fiscalmente è materia del blocco Fatturazione elettronica, non di questo.

**Fattura → NC può quindi procedere senza vincoli.** Regola in `07` §6.

---

## E · Rimuovere `externally_registered` — 🟡 **censito in lettura il 16/08, nulla rimosso**

Struttura **legacy** della fase iniziale: `externally_registered`, mostrato come «Inviata al
commercialista». Va rimossa. Qui c'è dov'è, cosa succede togliendola, e la risposta alla
domanda «si può fare da sola?».

### ⚠️ Prima di tutto: sono DUE enum diversi con lo stesso nome

| Enum                                           | Dove                                                           | Rimuovere?                          |
| ---------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
| `DocumentStatus.externally_registered`         | stato del **documento**                                        | ✅ è questo                         |
| `SalesOrderFiscalStatus.externally_registered` | stato fiscale **corrispettivi** (`sales_orders.fiscal_status`) | ⛔ **altro concetto, non si tocca** |

Un `grep` sul valore prende entrambi. Il secondo governa il registro corrispettivi ed è vivo:
`corrispettivi-fiscal.enum-mapper.ts`, `corrispettivi.model.ts`, il filtro del report. **Quattro
delle occorrenze trovate sono sue.**

### Dove viene assegnato — un punto solo

`documents.service.ts` → `registerExternal()`, unica scrittura. Esposta da
`documents.controller.ts` e chiamata dai due dettagli documento (generico e vendita) dietro un
dialogo di conferma. **Non esiste l'azione inversa**: nessun modo di tornare indietro.

### Dove viene letto

| Punto                                         | Cosa fa                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `document-labels.util.ts`                     | etichetta «Registrato esternamente» / «Inviata al commercialista», tono `vestiflow` |
| `document-sales-register.config.ts`           | **due** voci di filtro nel registro (generico e fatture)                            |
| `goods-receipt-form.component.ts`             | avviso: «le modifiche non aggiornano il gestionale contabile esterno»               |
| `accountant-register-document-counts.util.ts` | contatore **«Registrate esternamente»** del registro commercialista                 |
| `documents.service.ts` (edit)                 | ⚠️ **il blocco modifica** — vedi sotto                                              |

**Nella UI il pulsante compare su tre tipi** — Fattura, Fattura accompagnatoria, Proforma — e
solo se lo stato è `confirmed`, `printed` o `sent`.

### ⛔ La logica funzionale che va decisa: è l'unico stato non modificabile

`CONFIRMED_EDITABLE_STATUSES` = `confirmed · printed · sent`. **`externally_registered` non c'è**,
e la stessa lista è duplicata nel frontend. Quindi oggi:

> Un documento registrato esternamente **non è più modificabile**, e non esiste modo di tornare
> indietro. È l'unico blocco definitivo dell'applicazione oltre all'annullamento.

**Togliendo lo stato si toglie anche quel blocco.** Non è un effetto collaterale da assorbire: è
una decisione che spetta a Luigi. Le strade sono tre — nessun blocco (ogni documento resta
modificabile previo sblocco), un blocco legato ad altro (il ciclo FE, quando ci sarà), oppure
uno esplicito e reversibile che oggi non esiste.

### Un difetto già presente, latente

Il registro commercialista ha quattro contatori. **«Inviate al commercialista» conta `sent`** —
uno stato che nessuna azione produce più — mentre l'azione chiamata «Inviata al commercialista»
scrive `externally_registered`, che finisce sotto **«Registrate esternamente»**. Premere il
pulsante fa comparire il documento nella casella sbagliata. È **latente**: i contatori guardano
solo `invoice_draft`, e nel database non ce n'è nessuno.

### Il dato reale

Due documenti in quello stato, **entrambi `goods_receipt`** — non fatture. Vanno spostati a un
altro stato prima di poter rimuovere il valore.

### Cosa protegge i test

**Undici occorrenze, tutte in `documents.service.spec.ts`**: registra data e riferimenti,
rifiuta le bozze, accetta una fattura confermata, e il controllo permessi sulla sede. Nessun
test di frontend, nessun e2e.

### ⚠️ Il vincolo tecnico: un valore di enum Postgres non si toglie

`ALTER TYPE … DROP VALUE` **non esiste**. Rimuoverlo davvero dal database significa ricreare il
tipo — pesante su un database condiviso col collega. La via praticabile è in due tempi:
**prima** si rimuovono codice, UI e azione lasciando il valore nell'enum; **poi**, quando serve
e in una finestra concordata, si valuta se toglierlo anche dal tipo.

### ✅ Si può fare come blocco autonomo?

**Sì, e in due tagli.**

**Taglio 1 — indipendente da tutto, sicuro.** Togliere l'azione «Inviata al commercialista» e le
sue tracce: pulsante e dialogo nei due dettagli, endpoint, metodo di servizio, le due voci di
filtro, l'avviso dell'arrivo merce, il contatore del registro. Non tocca la Fatturazione
elettronica, non tocca i corrispettivi, non tocca la Nota di credito. **La sola cosa che serve
prima è la decisione sul blocco modifica.**

**Taglio 2 — il database, quando conviene.** Spostare i due arrivi merce a un altro stato, poi
eventualmente ricreare il tipo enum. Rimandabile a tempo indefinito senza costo.

**Nessuna dipendenza dal blocco FE.** Il legame è solo nominale — l'etichetta parla del
commercialista — ma nel codice non c'è una riga di fatturazione elettronica che lo legga.

**Da dove si ricomincia:** dalla decisione sul blocco modifica. Poi il taglio 1, in un commit.

---

## 2 · I campi che l'inclusione non trasporta — 🔵 pronto, con una regola decisa

**Misurato:** l'inclusione **non ricarica** dal catalogo (bene), ma il carico porta **8 campi**
su quelli che l'operatore può digitare.

Portati: `variantId · sku · barcode · description · quantity · unitPriceMinor · discount · vatCodeId`

| Campo che cade              | Decisione                                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| **`isReference`**           | 🔴 **va portato — ma sta nel blocco A**, che ha la precedenza. Vedi sotto |
| **`unitOfMeasure`**         | 🔵 **va portato.** È un dato del documento, digitato dall'operatore       |
| **`loadsStock`**            | 🟡 da decidere: è del tipo documento o della riga?                        |
| `lotCode` · `lotExpiryDate` | 🔵 **si porta com'era** — deciso o vuoto, senza inventare (voce 3)        |
| `serialNumbers`             | 🔵 **stessa regola**                                                      |

⚠️ **Questa voce e il blocco A toccano lo stesso file e la stessa interfaccia**
(`IncludedDocumentLine`). `isReference` non va staccato e portato qui: è **parte della
semantica** che il blocco A deve rendere affidabile, e trasportarlo senza che i consumer lo
rispettino sposterebbe un flag che non significa ancora niente. Gli altri campi possono
seguire nello stesso passaggio, una volta che il blocco A ha fissato la forma.

⚠️ **L'unità di misura si perde due volte**, e la seconda è peggiore: la maschera vendita non
la manda al salvataggio e `computeLines` scrive `null`. Quindi una fattura che l'ha ereditata
da un DDT **la perde al primo salvataggio**, in silenzio. Entra nella voce 5.

**Da dove si ricomincia:** da `document-include.util.ts`, `IncludedDocumentLine`.

---

## 3 · La scelta del lotto in uscita — 🔵 regola decisa, funzione da costruire

> **L'inclusione riporta quello che c'è: se il lotto era già deciso si porta deciso, se non lo
> era si porta non deciso. Chi ha bisogno del dato e non ce l'ha, lo chiede.**

_Terza formulazione, ed è quella di Luigi. Le prime due erano surrogati: «non si trascina mai»
(falso — da un DDT compilato si trascina) e «dipende se la merce si è già mossa» (un **proxy**
che correla ma non è la regola). **Il criterio non è l'evento, è lo stato del dato.**_

**Perché il proxy sbagliava.** Un Ordine cliente **potrebbe** avere il lotto deciso, se
qualcuno l'ha compilato: allora si porta, anche se nulla si è mosso. E un DDT **potrebbe**
essere stato salvato senza deciderlo: allora si porta vuoto, anche se la merce è uscita.

**Un dato mancante non si inventa.** Se a monte non era deciso arriva vuoto, **anche se quello
è uno stato sbagliato**: il sistema non riempie il buco scegliendo al posto dell'operatore, lo
**segnala**. Gli avvisi sull'incompleto vanno previsti — warning non bloccanti, come da regola
dei controlli.

**Il caso che chiarisce tutto**, dichiarato da Luigi: una **Fattura accompagnatoria creata da
zero**, articoli inseriti a mano. Nessuna inclusione, nessun lotto deciso a monte → quando un
articolo ha più lotti disponibili, **lo si sceglie lì**. Non è un'eccezione: è la stessa regola
vista dal caso senza origine.

### Cosa esiste e cosa manca

| Pezzo                                                      | Stato             |
| ---------------------------------------------------------- | ----------------- |
| `InventoryLot` (variante, sede, lotto, scadenza, quantità) | ✅ esiste         |
| `DocumentLine.lotCode` / `lotExpiryDate`                   | ✅ esistono       |
| Arrivo merce: inserimento del lotto in riga                | ✅ esiste         |
| **Endpoint «lotti disponibili per variante e sede»**       | ❌ **non esiste** |
| **Scelta del lotto nelle maschere di vendita e DDT**       | ❌ **non esiste** |

### Come deve comportarsi

**Il lotto sulla riga è già valorizzato** (arrivato da un'inclusione, o digitato):

- **si legge, non si sceglie.** Riaprirlo permetterebbe di scrivere un lotto diverso da quello
  effettivamente consegnato;
- **niente interrogazione delle giacenze**: se quella merce è già uscita non è più in giacenza,
  e la domanda darebbe la risposta sbagliata.

**Il lotto manca e il documento ne ha bisogno** — indipendentemente da come la riga è nata:

- **un solo lotto disponibile → si prende quello**, senza chiedere. La domanda è un costo, e si
  paga solo quando c'è davvero una scelta;
- **più lotti → si sceglie**, con numero, scadenza e **quantità disponibile**, come la finestra
  «Ricerca lotto in giacenza» di Danea;
- **nessun lotto disponibile** → avviso, non blocco.

Vale identico per le **matricole**, dove però la quantità è sempre uno per pezzo.

**Da dove si ricomincia:** i due casi sono lavori separati. **Trasportare ciò che è già deciso** si chiude estendendo il carico dell'inclusione (voce 2), e non richiede niente di nuovo. **Chiedere ciò che manca** richiede l'endpoint dei lotti disponibili, che non esiste: è il pezzo a monte del resto.

---

## 4 · Il dominio della Nota di credito — 🟡 dopo la voce 1

Il tipo esiste ovunque (registro, rotte, numeratore, permessi, migration applicate). **Il suo
dominio no.**

| Cosa                                                    | Stato                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Verso economico — importi positivi, segno dato dal tipo | `07` §6, non iniziato                                                 |
| Casella «Carica magazzino» per riga, default spento     | `07` §6, da innestare sul percorso per riga di `09`                   |
| Tipo movimento `return`                                 | da confermare in implementazione                                      |
| **Censimento del segno nelle aggregazioni**             | `07` §16, **dichiarato da fare** — e va **prima** del verso economico |
| Primo test reale di una NC                              | mai fatto: prima non si poteva, il database non conosceva il tipo     |

⚠️ **Il censimento del segno viene prima.** Rendere la NC visibile nelle aggregazioni senza
applicare il segno la fa sommare come una fattura in più: il commercialista leggerebbe uno
storno come un ricavo.

---

## 5 · Le cinque colonne della riga Fattura — 🔴 contiene una perdita di dati

`07` §17. La riga Fattura ha `variantId · description · quantity · unitPrice · vatCodeId ·
discountPercent · loadsStock`. Rispetto a DDT e Ordine cliente mancano cinque colonne, **di
natura diversa fra loro**:

| Colonna          | Natura                                          |
| ---------------- | ----------------------------------------------- |
| Q.tà disponibile | informazione gestionale: si legge, non si salva |
| Costo d'acquisto | idem, e solo col permesso «Visualizza costi»    |
| **U.m.**         | **dato del documento** — vedi sotto             |
| Prezzo scontato  | lettura economica, derivata                     |
| Totale riga      | calcolato, non editabile                        |

🔴 **L'unità di misura non è «non mostrata»: viene cancellata.** La colonna esiste, il DTO
l'accetta, il servizio la trasporta — ma la maschera non ha il controllo e **non la manda**,
e `computeLines` scrive `null` quando manca. Una fattura che l'ha ereditata da un DDT **la
perde al primo salvataggio**.

**Vincolo:** si usa `DocumentLine.unitOfMeasure`, che c'è. Nessun secondo campo. E si riusano
le celle esistenti (`app-document-line-unit-cell`) e le formule condivise: una seconda copia
dei calcoli dentro la Fattura sarebbe il difetto, non la funzione.

---

## 6 · Il prezzo al pubblico nell'Arrivo merce — 🔴 oggi si digita e sparisce

**Misurato:** per un articolo **già esistente**, il prezzo al pubblico scritto in riga **non
va da nessuna parte**. Non aggiorna l'anagrafica e non viene salvato sul documento.

Tre punti chiudono la catena:

- il servizio scrive `sellingPriceMinor` **solo alla creazione** (`if (line.variantId ||
!line.newProduct) continue`);
- il frontend costruisce il carico `newProduct` **solo** se la riga non ha `variantId`;
- `DocumentLine` **non ha** una colonna prezzo di vendita.

**Non è «non aggiorna»: è un campo che invita a un gesto senza effetto.**

**Decisione di Luigi (16/08):** dovrebbe aggiornare l'anagrafica anche per gli articoli
esistenti — accelera il carico ed è il momento in cui quel prezzo si stabilisce davvero.

### E il prezzo Shopify, con un'avvertenza

`ProductVariant.shopifyPriceMinor` esiste, e lo schema dichiara: _«Prezzo Shopify per-taglia,
**INDIPENDENTE** dal prezzo articolo. La pubblicazione legge **solo questo**»_. Nell'Arrivo
merce **non c'è nessuna colonna** per esso.

⚠️ **Non «la stessa logica»:** quel prezzo è **per-taglia e indipendente**. Trattarlo come un
gemello del prezzo articolo distrugge proprio l'indipendenza che lo schema dichiara. Va
deciso come si comporta quando i due divergono.

---

## 7 · Il netto/ivato sul «Prezzo al pubblico» — 🟡 il componente c'è, la semantica no

Il componente esiste (`app-price-mode-menu`, `07` §25) e la regola generale è fissata: **Costo
sugli acquisti, Prezzo sulle vendite**.

Resta fuori `sellingPrice`, la colonna «Prezzo al pubblico», che non dice se è netta o ivata —
e chi lavora all'ingrosso ha bisogno di leggerla nell'uno o nell'altro modo.

⚠️ **Significa due cose diverse nelle due maschere**, e va deciso prima:

| Maschera         | `sellingPrice`   | Cosa sarebbe il selettore                     |
| ---------------- | ---------------- | --------------------------------------------- |
| Ordine fornitore | **sola lettura** | un **cambio di vista**                        |
| Arrivo merce     | **editabile**    | un **modo di inserimento**, come già il Costo |

---

## 8 · Il prezzo digitato a mano non si muove — ⚪ da misurare bene

**Regola dichiarata da Luigi (16/08):** un prezzo che l'operatore ha scritto **è suo e non si
muove mai** — né col cambio netto/ivato, né quando la riga si riporta altrove. Si ripristina
**solo** in due casi: se l'articolo viene **ricercato di nuovo sulla stessa riga**, o se la
riga viene **eliminata e rifatta**.

**Già conforme:** il cambio netto/ivato converte per aliquota, quindi l'importo effettivo non
cambia — mostra lo stesso prezzo in un altro modo.

**Non conforme:** il cambio del **listino in testata** riscrive i prezzi, e lo fa in **due modi
diversi** — l'Ordine cliente salta le righe di riferimento, la maschera vendita non salta
niente.

⚪ **Manca il dato che rende la regola implementabile:** la riga non registra se il suo prezzo
è stato toccato a mano. Senza, il codice non può distinguere un 10 € negoziato da un 10 €
proposto. Serve un indicatore **in memoria** — non va salvato, basta che viva nella maschera.

---

---

## 10 · L'Ordine cliente non ha il netto/ivato — ⚪ manca una colonna

**Misurato il 16/08**, a valle del §25. Nella maschera Ordine cliente l'intestazione della
colonna Prezzo mostra la parola secca «Prezzo», **senza il menu** netto/ivato che tutte le
altre maschere hanno. Il DDT, che usa lo stesso componente, il menu ce l'ha.

**Non è una dimenticanza del §25**: è un'esclusione dichiarata nel template — _«L'Ordine
cliente (`isOrder`) resta netto finché non arriva il supporto backend dedicato»_ — e la causa
è concreta:

| Entità           | `pricesIncludeVat` |
| ---------------- | ------------------ |
| `Document`       | ✅ c'è             |
| **`SalesOrder`** | ❌ **non c'è**     |

Senza quella colonna la modalità non si può memorizzare: sarebbe un interruttore che al
salvataggio **si dimentica**, e riaprendo l'ordine i prezzi si rileggerebbero nell'altra
modalità. Peggio di non averlo.

**Serve una migration additiva** su `SalesOrder`, più il giro completo (DTO, service, form,
riapertura). Poi il menu si accende togliendo la condizione `isOrder`, perché il componente
condiviso c'è già.

⚠️ **Da decidere prima:** gli ordini esistenti nascono tutti netti (il default della colonna),
il che è corretto perché così sono stati compilati. Ma va confermato che sia il default voluto
anche per i nuovi, o se debba seguire la preferenza dell'operatore come fanno i documenti.

---

## 11 · Il contratto della riga documento — 🟡 da scrivere, poi da eseguire a fette

**Sollevata da Luigi il 16/08:** _«la colonna cod. articolo dovrebbe essere la stessa ovunque,
stessa cosa EAN, SKU, codice fornitore, nome prodotto, U.M., costo, sconto, IVA»_. Ha ragione,
e la misura lo dimostra oltre il caso del prezzo.

⚠️ **Vale per TUTTI i documenti**, non per i tre misurati: il confronto qui sotto è un
campione, la regola no.

### Le tre entità riga, misurate concetto per concetto (16/08)

| Concetto                                                        | `document_lines`             | `sales_order_lines`  | `supplier_order_lines`                     |
| --------------------------------------------------------------- | ---------------------------- | -------------------- | ------------------------------------------ |
| Nome prodotto                                                   | `description`                | **`title`**          | `description`                              |
| Prezzo unitario                                                 | `num(16,6)`                  | **`integer`**        | —                                          |
| Sconto                                                          | `discountPercent` `num(7,4)` | **`discount` TESTO** | `discountPercent` `num(7,4)`               |
| Quantità                                                        | `quantity`                   | `quantity`           | **`orderedQuantity`** + `receivedQuantity` |
| EAN / barcode                                                   | —                            | **solo qui**         | —                                          |
| Riga di riferimento                                             | `isReference`                | `isReference`        | **assente**                                |
| SKU · U.M. · codice IVA · snapshot IVA · variante · numero riga | ✅                           | ✅                   | ✅                                         |
| Lotto · scadenza · matricole                                    | solo qui                     | —                    | —                                          |

Colonne totali: **34 · 18 · 15**.

### Tre classi di divergenza, che costano in modo diverso

1. **Stesso concetto, nome diverso** — `description` vs `title`. Nessuna ragione, solo storia.
   Costa a ogni mapper, a ogni carico di inclusione, a ogni test.
2. **Stesso concetto, tipo diverso** — e qui la sorpresa peggiore: lo **sconto** è `num(7,4)`
   sui documenti e **testo** sull'ordine cliente. Non è un dettaglio di precisione: sono due
   **modelli di dato** — uno conserva la notazione digitata (`4+10%`), l'altro la percentuale
   risolta — e la conversione avviene nel mezzo.
3. **Concetto presente in una e assente nell'altra** — il barcode c'è solo sull'ordine cliente;
   `isReference` manca all'Ordine fornitore, quindi **la regola del blocco A non copre quella
   maschera**.

### ⚠️ Nome ≠ descrizione — la cautela di Luigi, verificata

Il prodotto ha **due campi distinti, entrambi sincronizzati con Shopify**:

| VestiFlow             | Shopify                                       |
| --------------------- | --------------------------------------------- |
| `Product.name`        | `title`                                       |
| `Product.description` | `body_html` (convertito da/in testo semplice) |

E qui sta la trappola: **il campo della RIGA contiene il NOME**, non la descrizione — ma sui
documenti si chiama `description` e sull'ordine cliente `title`. Quindi il nome della riga
collide col nome del campo _descrizione_ del prodotto, e il nome dell'ordine collide con la
parola che Shopify usa per il _nome_.

**Qualunque uniformazione deve partire da qui**: decidere come si chiama «il nome del prodotto
fotografato sulla riga», sapendo che `description` è già occupato da un'altra cosa che va su
`body_html`. Sbagliarlo romperebbe la sincronizzazione.

### «Cod. articolo» e «Codice fornitore» non sono colonne di riga — e non è colpa di Shopify

**Misurato:** non esistono su nessuna delle tre entità. Le celle che si vedono in maschera
leggono dalla **variante** e dal **link fornitore**.

Luigi si chiedeva se dipendesse dalla sincronizzazione. **No:** `articleCode` è un codice
**interno di VestiFlow**, generato da `nextArticleCodeInTx` — anche quando il prodotto arriva
da Shopify, il codice glielo assegniamo noi. Nessun vincolo esterno.

Resta però una **domanda aperta e non decisa**: oggi lo **SKU è fotografato sulla riga** e il
codice articolo no. Un codice di catalogo può legittimamente non essere un dato del documento
— ma allora vale anche per lo SKU, e la differenza fra i due nessuno l'ha scritta.

### Perché non si fa subito, e perché va deciso subito

**Non si esegue tutto insieme:** sarebbe la migration più grande del progetto e toccherebbe tre
maschere in contemporanea. **Ma va deciso tutto insieme**, altrimenti si continua a rattoppare
colonna per colonna — che è precisamente quello che stava succedendo col prezzo.

**Il valore non è l'uniformità estetica.** È che ogni volta che si tocca una riga si scopre una
divergenza: l'unità di misura azzerata (voce 5), il prezzo che non scorpora (voce 10), la
reference che perdeva la natura (blocco A), il flag che manca a una maschera su tre. **Sono lo
stesso difetto visto da angoli diversi**, e finché il contratto non è scritto continueranno a
uscirne di nuovi.

### Cosa serve

Una **specifica del contratto di riga**: per ogni concetto il nome canonico, il tipo, se è
fotografato sulla riga o letto dal catalogo, e in quali documenti esiste. Misura e decisioni,
zero codice. Poi l'esecuzione a fette, ognuna un albero valido.

`03-specifica-unificazione-righe-documento.md` **non lo copre**: unifica l'interazione —
tastiera, U.M., ricerca, celle condivise — e si ferma prima dell'insieme delle colonne.

**Da dove si ricomincia:** dalla tabella qui sopra, estesa a tutte le entità riga (mancano
`online_sale_lines`, `corrispettivo_entry_lines` e le righe della cassa).

## 9 · Coda già registrata, fuori da questo blocco

| Voce                                           | Dove       | Perché è fuori                                                                                                               |
| ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sigla e zeri fuori dal numero visibile         | `04` §11   | ferma su 3 decisioni di Luigi **e sul backup**: normalizzare le 104 `reference` cancella le prove su cui poggia la decisione |
| Numerazione Vendita online e Corrispettivi     | `04` §8    | blocco proprio, da coordinare con `feature/cassa`                                                                            |
| Rename `invoice_draft` + pulizia ciclo fiscale | `07` §21   | col merge del collega e dentro il blocco FE                                                                                  |
| **La «Causale» che non arriva nell'XML**       | `06b` §H.1 | difetto reale, ma è del blocco FE — tenuto separato finché il dominio documentale non è stabile                              |
| Analytics: i DDT non sono vendite              | `04` §8    | mai aperto                                                                                                                   |

---

## Ordine deciso

1. ~~**A · Righe di riferimento**~~ — ✅ **fatto il 16/08** (`07` §26).
2. ~~**A-bis · Il dato storico**~~ — ✅ **chiuso il 16/08 senza intervento**: criterio
   strutturale **inesistente**, la riga sbagliata resta nominata e non toccata.
3. **1 · Collegamenti Fattura ↔ NC** — ⏸️ **fermo qui, in attesa di Luigi.** Le decisioni
   funzionali si discutono **prima** dell'implementazione: cardinalità NC→Fatture, riferimenti
   manuali, e il fatto che `sourceDocumentId` sia una colonna mai scritta.
4. **11 · Il contratto della riga** e le altre, nell'ordine che Luigi sceglierà voce per voce.
   Il censimento nome/descrizione, SKU/articleCode e sconti è **registrato e non aperto**.

**Regola di lavoro, imparata tre volte il 16/08:** ogni voce comincia **misurando**, non
eseguendo. Le tre correzioni di quel giorno — il menu «Nuovo» esteso senza guardarlo,
«Listino» rinominato su una premessa non verificata, e la cardinalità della NC dedotta da una
tabella che assomigliava — sono nate tutte dall'aver trattato una premessa come un fatto.
