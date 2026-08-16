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

## E · Registro commercialista e «Inviata al commercialista» — ✅ **RIMOSSI il 16/08/2026**

**La decisione, di Luigi:** «nessun documento voglio sapere se è stato inviato al
commercialista, mi regolo io con i filtri e le stampe». La struttura che classificava i
documenti in _già spediti_ e _da inviare_ era un errore di impostazione, e va via tutta —
non se ne costruisce una sostitutiva.

### Cosa è stato rimosso

**Il flusso «Inviata al commercialista».** Metodo di servizio `registerExternal()` — unica
scrittura dello stato — endpoint `POST /documents/:id/register-external`, DTO dedicato, metodo
client, pulsante e dialogo di conferma nei **due** dettagli documento (il vendita eredita la
classe ma ha template proprio), le due voci di filtro del registro, l’avviso dell’Arrivo merce.

**Il Registro commercialista.** Modulo API completo (controller, service, DTO, query dei
conteggi), pagina, modello, service frontend, rotta, voce di sidebar, voce di ricerca globale,
briciole, link dalla pagina Report.

**Il filtro `accountant`.** Non aveva un comando proprio: il solo produttore era il link del
registro. Rimosso insieme — parametro di query, campo del DTO, banner della lista, e la
costante `ACCOUNTANT_DOCUMENT_TYPES` che serviva solo a lui.

### Cosa è stato preservato, e perché

| Preservato                                            | Perché                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Filtro «DDT da fatturare»** (`pendingInvoice`)      | ha una **casella propria** nel registro DDT: è un filtro operativo, non una classificazione fiscale           |
| **Registro Corrispettivi** e `SalesOrderFiscalStatus` | dominio diverso, protetto esplicitamente — vedi blocco F                                                      |
| `externallyIssuedAt`                                  | campo distinto del ciclo fattura, altra semantica                                                             |
| `externalDocNumber` / `externalDocDate`               | ciclo fornitore: li scrivono altre maschere                                                                   |
| `registrationDate` **come campo**                     | colonna in elenco, dettaglio e stampa; **obbligatoria** nella Fattura d’acquisto, dove governa la numerazione |
| Le due liste `CONFIRMED_EDITABLE_STATUSES`            | invariate: il blocco spariva perché lo stato non era nella lista                                              |

### Il blocco modifica: non c’era niente da modificare

`externally_registered` era l’**unico blocco definitivo** oltre all’annullamento, e senza
ritorno. Si ritira insieme allo stato, **senza sostituti**: i documenti tornano alle normali
regole di sblocco. L’immutabilità di una Fattura davvero emessa si progetterà nel blocco FE, e
dovrà dipendere dal **vero stato fiscale** — non da «registrata esternamente», che non lo era.

Le due liste sono **identiche a com’erano**. Va scritto proprio perché chi cerca la modifica e
non la trova potrebbe crederla dimenticata.

### La causa radice delle incoerenze trovate

**Non era `sent` contro `externally_registered`: era il registro stesso.** Due dei quattro
contatori delle «Bozze fattura» classificavano su `sent`, uno stato che nessuna azione produce
più; l’azione chiamata «Inviata al commercialista» scriveva `externally_registered`, contato
sotto un’altra voce. Premere il pulsante faceva comparire il documento nella casella sbagliata.

Non è stato corretto: **è stato rimosso il modello che lo produceva**, che è la richiesta.

Un secondo difetto è emerso e **non appartiene a questo blocco**: il contatore «DDT vendita da
fatturare» — e il filtro `pendingInvoice` che resta — si reggono su `source_document_id`, che
**nessun documento ha mai valorizzato** (`GUARDIE` §16). Finché è così, quel filtro considera
da fatturare **tutti** i DDT confermati. La causa è nel blocco 1, non qui.

### ✅ I due Arrivi merce — normalizzati il 16/08

`CAR-2026-0003` e `CAR-2026-0008` sono tornati `confirmed` con `registration_date` a `NULL`,
dentro la migration `20260816150000_ritira_consegna_commercialista`. Misurato dopo, sui loro
id esatti: **3 movimenti, 18 pezzi, 3 varianti — identici**; righe, quantità, numero, serie,
`document_date` e `confirmed_at` invariati. Gli arrivi merce confermati passano da 78 a 80.

Il membro `ExternallyRegistered`, la sua etichetta, il suo tono e il test di guardia sono
stati rimossi **dopo**, in questo ordine e non prima — vedi il blocco G per il valore che
resta nel tipo PostgreSQL.

### Verifiche eseguite

`npm run lint` (con tutte e sette le guardie) · `tsc --noEmit` su API e frontend ·
**`npm run build`**, che è l’unico che vede i template · `npm run test:api` **1580 test, 179
file** · `npm test` **1430 test, 207 file**. Tutto verde.

Adattati: `document-list-query.model.spec.ts` (non parsa più `accountant`), il fixture «non
editabile» di `documents.service.spec.ts` — che ora usa `cancelled`, lo stato non modificabile
che resta — e l’e2e, dove il test che passava dal registro è stato rimosso mentre quello che
verifica i **filtri DDT da fatturare** sopravvive: entrava dall’URL, non dalla pagina. Helper
rinominato `e2e/helpers/documents-list.ts`.

---

## F · «Consegna al commercialista» nei Corrispettivi — ✅ **RIMOSSA il 16/08/2026**

**La decisione:** «anche i corrispettivi non voglio sapere se li ho già inviati. Quelli
verranno esportati con stampe e file e nei periodi definiti dal cliente o dal commercialista.
Tutto manuale.»

> **Vendite e rettifiche → regole di inclusione → Registro → filtri periodo → stampa/export.**
> Non esiste un «dopo»: niente da inviare → inviato → consegnato → registrato. Esportare lo
> stesso periodo due volte è consentito e non produce effetti.

### Rimosso

`markDelivered()` e il suo DTO · `GET /corrispettivi/deliveries` · `PATCH
/corrispettivi/orders/:id/fiscal-status` — la registrazione manuale dello stato, senza UI ·
pannello «Consegna al commercialista» e tabella consegne · pulsante «Segna consegnato» ·
filtro «Solo da consegnare» · riquadro «Da consegnare» del riepilogo · `pendingDeliveryCount`
e `pendingDeliveryOnly` end-to-end · il componente `corrispettivi-deliveries` · modelli, DTO,
metodi client · **la colonna «Data consegna commercialista» dal CSV, dallo spreadsheet e dal
PDF**.

### Rimosso anche dal database

| Oggetto                            | Righe prima       | Nota                                    |
| ---------------------------------- | ----------------- | --------------------------------------- |
| tabella `corrispettivi_deliveries` | **0**             | nessun vincolo entrante, nessuna vista  |
| `sales_orders.fiscal_delivered_at` | **0 valorizzate** | la scriveva solo `markDelivered()`      |
| `sales_orders.fiscal_note`         | **0 valorizzate** | la scriveva solo `updateFiscalStatus()` |

Nessuno storico utente perso: erano vuote tutte e tre.

### I cinque stati fiscali, uno per uno

| Valore                    | Verdetto                                         | Perché                                                                                                                                      |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `delivered_to_accountant` | ⛔ **fuori**                                     | è il flusso ritirato                                                                                                                        |
| `externally_registered`   | ⛔ **fuori**                                     | idem — da non confondere con l'omonimo `DocumentStatus`                                                                                     |
| `pending_registration`    | ✅ resta come **default**, non come stato utente | lo portano tutte e 37 le vendite; l'etichetta non dice più «Da registrare» ma **«Nessuna classificazione»**, e non è più offerto nel filtro |
| `excluded_pos_register`   | ✅ **resta**                                     | è una classificazione: la sync Shopify lo scrive sugli ordini POS, che la cassa registra per conto suo                                      |
| `invoiced`                | ✅ **resta**                                     | classificazione fiscale, non passaggio di consegna                                                                                          |

⚠️ **Verificato prima di conservarli, ed è un risultato scomodo: nessuno dei due esclude
davvero una vendita dal registro.** `excluded_pos_register` lo scrive la sync e **nessuna
query lo rilegge come regola**; `invoiced` **non lo scrive nessuno**, mai. Il doppio conteggio
di una vendita fatturata è impedito altrove — da `CorrispettivoEntry.excludedFromSummary` e
dallo stato `excluded_invoiced`. ⚠️ **Corretto il 16/08 poche ore dopo:** quella tabella
**non viene più scritta da nessuno** — il registro è derivato dall'11/08 — quindi quel
meccanismo vale solo per le sei righe storiche. Oggi **nessuna** esclusione è implementata:
vedi blocco I.

Sono stati **conservati lo stesso**, perché toglierli sarebbe rimuovere una classificazione
fiscale per associazione con un flusso diverso — e perché il vincolo «una vendita fatturata
non si conta due volte» è nel modello, anche se oggi passa da un'altra strada. **Che oggi non
facciano nulla resta una domanda aperta, non una cosa da chiudere in silenzio.**

### Non toccato

Vendite, resi, rimborsi, criteri economici del Registro, `CorrispettivoStatus` e il registro
derivato `corrispettivo_entries`. Il permesso `reports.fiscal_register` **resta**: lo usa il
registro derivato, che è la funzione valida. Ne è stato corretto solo il commento, che parlava
di una consegna che non esiste più.

---

## G · I valori enum morti in PostgreSQL — 📌 **lasciati apposta, documentato**

Tre valori restano nei tipi PostgreSQL senza nessun consumer applicativo:

- `DocumentStatus.externally_registered`
- `SalesOrderFiscalStatus.delivered_to_accountant`
- `SalesOrderFiscalStatus.externally_registered`

**Nessuna riga li porta** (verificato dopo la migration) e **nessun codice può scriverli**:
sono spariti da `schema.prisma`, quindi il client Prisma non li espone e un'assegnazione non
compila. Sono spariti anche dall'enum del frontend, dalle etichette e dai toni.

**Perché non si tolgono anche dal tipo.** `ALTER TYPE … DROP VALUE` non esiste in PostgreSQL:
servirebbe ricostruire il tipo — togliere il default della colonna, crearne uno nuovo,
convertire, rinominare, rimettere il default. Su un **database condiviso**, dove convivono le
tabelle di un altro ramo che questo schema non conosce, il rischio non è proporzionato al
guadagno: è pulizia estetica su valori che nessuno può più produrre.

⚠️ **Conseguenza da conoscere:** `schema.prisma` e il tipo PostgreSQL divergono di proposito
su questi tre valori. È voluto e scritto qui; su questo database i comandi dichiarativi sono
già vietati per altre ragioni (`regole-qualita`), quindi non cambia nulla in pratica.

---

## H · «DDT da fatturare» — ✅ **corretto il 16/08/2026**

Il filtro del registro DDT prometteva «confermati senza fattura collegata» e misurava
un'altra cosa. Ora dice quello che deve:

> **DDT da fatturare = spunta «Seguirà doc. di vendita» attiva E nessuna Fattura viva che
> l'abbia già incluso.**

### I due difetti, e sono di natura diversa

**1. Guardava il legame sbagliato.** Interrogava `derivedDocuments`, cioè `sourceDocumentId`,
che rappresenta la **generazione da un predecessore singolo**. Ma una Fattura **include** più
DDT: è un molti-a-uno, e ha già la sua tabella — `InvoiceSalesDdtLink`, con l'indice
`(tenantId, salesDdtId)` fatto apposta. Generazione e inclusione sono due relazioni diverse
(`07` §12) e non si sostituiscono.

**2. Guardava una colonna che nessuno scrive.** `sourceDocumentId` è NULL su tutti i 105
documenti (`GUARDIE` §16): la condizione «nessuna fattura derivata» era **sempre vera**.

**Misurato sul database:** il vecchio criterio dichiarava **14 DDT da fatturare su 14**;
il nuovo ne dichiara **0**, perché nessun DDT ha la spunta. Prima il filtro non filtrava —
restituiva tutto, e prendeva anche i DDT che una fattura non la aspettano affatto.

### La fattura annullata non consuma il DDT

Il legame resta in tabella, ma il DDT **torna da fatturare**: per questo la condizione guarda
lo **stato della fattura collegata** e non la sola esistenza del legame. Ha un test suo.

### Guardie

Due test in `documents.service.spec.ts`: uno prova che il filtro usa spunta e legami e che
**`derivedDocuments` non torna**, uno prova il caso della fattura annullata. Mutation test
eseguita: togliendo `followedBySalesDoc: true` dal servizio, il primo fallisce
(`expected undefined to be true`).

---

## I · `sales_orders.fiscal_status` — ✅ **RIMOSSO il 16/08/2026**

⚠️ **Questa voce diceva «fermo su un punto funzionale», e il punto è stato deciso.** Avevo
sospeso la rimozione perché `excluded_pos_register` sembrava un requisito vero mai
implementato: «le vendite POS non devono entrare nel Registro». **La decisione è l'opposta.**

> **Shopify POS compare nel Registro Corrispettivi, classificato come vendita fisica/POS.**
> Che la cassa o un RT esterno la certifichi **non è un doppio conteggio**: nel Registro
> stiamo rappresentando economicamente quella vendita, non creandone una seconda.

Specifica corrente: **`10-specifica-registro-corrispettivi.md`**.

### La duplicazione: cercata alla causa radice, non c'è

Un ordine Shopify POS importato **non** genera anche una Vendita negozio VestiFlow: le
vendite negozio nascono **solo** da `POST /store-sales`, un gesto esplicito alla cassa, e la
sync crea un `SalesOrder` e basta. **Una transazione, una rappresentazione.**

### Rimosso

Colonna `sales_orders.fiscal_status`, tipo PostgreSQL `SalesOrderFiscalStatus`, il suo indice,
la scrittura nella sync Shopify, il filtro API e il suo DTO, il mapper degli stati, il tipo e
le etichette lato frontend, il filtro «Tutti gli stati fiscali», la colonna «Stato fiscale»
in tabella e nel CSV. **Nessun enum sostitutivo.**

**Migration** `20260816170000_rimuove_stato_fiscale_ordine`. Misurato prima: 37 vendite, tutte
`pending_registration` (il default), nessun'altra colonna sul tipo, un indice. Dopo: colonna,
tipo e indice spariti; 37 ordini e 6.768,53 € di totale **invariati**; `DocumentStatus`
intatto con i suoi sei valori.

⚠️ Qui il tipo si **droppa davvero**, a differenza dei valori morti lasciati in
`DocumentStatus` (blocco G): togliere un **valore** da un enum PostgreSQL non si può, togliere
un **tipo** che non ha più colonne sì.

### UI riallineata

«Corrispettivi commercialista» → **«Corrispettivi»** (schermata e stampa); sottotitolo che
diceva «le vendite POS sono escluse» — l'esatto contrario della decisione — riscritto; filtro
canale → **ambito**, con le etichette corrette.

⚠️ Le due vecchie **dicevano il falso**: «Shopify» comprendeva le sole vendite online (anche
il POS è Shopify) e «Negozio» indicava lo **Shopify POS**, non la cassa di VestiFlow.

### Guardie — e sono incrociate, perché il difetto lo è

**`scripts/check-registro-legacy.mjs`**, dentro `npm run lint`: attraversa **API, frontend ed
e2e** in una passata e fallisce se rientra uno dei **14 termini ritirati**. Esiste perché
**niente di tutto questo si romperebbe tornando** — un `fiscalStatus` riaggiunto a un DTO
compila, passa i test, non fa arrossare nulla, e ricostruisce un modello che abbiamo deciso di
non avere. I commenti che _raccontano_ la rimozione sono esentati.

**`corrispettivi-export.service.spec.ts`**: le intestazioni del file che esce non portano
«Stato fiscale» né «Data consegna commercialista», e nessuna nomina consegne o registrazioni.
Guarda le intestazioni e non le righe di proposito: sono il contratto del file verso chi lo
apre, e la prima cosa che si riaggiunge «perché serve anche questo campo».

**Mutation test su entrambe**, e mordono: rimettendo `Stato fiscale` fra le intestazioni il
test fallisce; rimettendo `fiscalStatus` in un DTO di filtro la guardia esce con 1 e stampa il
perché.

### ⏸️ Cosa resta aperto, e non è piccolo

Il Registro **non implementa nessuna esclusione** — non ne ha una da quando la tabella
`CorrispettivoEntry` ha smesso di essere scritta (11/08). Due cose mancano, ed erano dietro
la premessa sbagliata che avevo scritto:

1. **la vendita già fatturata** non deve rientrare nei totali dove produrrebbe doppio
   conteggio — va determinata dalla **relazione reale col documento**, non da un'etichetta;
2. **le vendite negozio VestiFlow non entrano affatto** nel Registro: sono `Document` di tipo
   `store_sale`, non `SalesOrder`, e il Registro aggrega solo i secondi. La specifica dice
   che devono esserci (`10` §2).

Mancano anche i filtri **Canale** e **Fatturazione** del `10` §3.

Tutte e quattro cambiano **cosa il Registro mostra**: sono lavoro proprio, non rifinitura.

**Da dove si ricomincia:** dal punto 2, che è il più visibile — un negozio che vende alla
cassa di VestiFlow oggi non si vede nel suo quadro economico.

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
