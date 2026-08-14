# 08 · Specifica — Resi e annullamenti dal canale

**Data:** 14/08/2026
**Stato del documento:** piano, non consuntivo. Ogni voce porta il proprio stato. Nessuna voce va letta come già fatta se non lo dice.
**Owner:** Luigi
**Migration richiesta:** **nessuna per §4**, che si risolve nel modello derivato senza scrivere niente. Ne serve **una distruttiva** per eliminare `corrispettivo_entries` (§10): è l'ultima cosa, e va in due tempi.

**Perimetro.** Cosa succede a un ordine di canale **dopo** la vendita: annullamento, rimborso, reso, rientro della merce, e cosa ne è del Corrispettivo. Non tratta la sincronizzazione in sé (`02`), non tratta i difetti uno per uno (`01`, punti 2.13-2.15 e 3.8).

**Metodo.** Le voci _misurate_ sono state verificate conducendo l'operazione vera sul negozio di prova il 14/08/2026, con lettura del database e del payload Shopify a ogni passo. Le voci _dedotte_ sono ragionamenti non verificati e non vanno implementate come certe.

**Metodo sulle questioni fiscali.** Una questione fiscale non diventa automaticamente «da chiedere al commercialista»: prima si classifica.

1. **Norma o prassi chiara** → si dichiara la fonte e si implementa. Non è una domanda aperta.
2. **Scelta gestionale VestiFlow** → la decidiamo noi e la scriviamo.
3. **Caso ambiguo o dipendente dalla situazione del singolo cliente** → allora, e solo allora, serve una validazione professionale.

⚠️ **Le fonti citate in questo documento non sono state verificate da chi lo ha scritto**: arrivano da una ricerca condotta a parte e sono riportate con il riferimento in chiaro, così che si veda quale regola poggia su quale base. **Vanno allegate al documento una volta sola** — non serve un professionista, serve il testo. Finché non lo sono, una regola marcata _base normativa riferita_ è più solida di una domanda aperta e meno di una misura.

---

## §1 · Il fatto che riorganizza tutto

**Su Shopify un ordine evaso non si annulla.**

_Misurato 14/08:_ su un ordine con stato `Evaso`, il menu «Altre azioni» offre Modifica, Duplica, Rimuovi da archivio, Visualizza pagina di stato, Elimina ordine e le stampe. **«Annulla ordine» non c'è.** I pulsanti disponibili sono **Rimborsa** e **Reso**.

Ne discendono tre conseguenze, e vanno tenute insieme:

1. **L'annullamento riguarda solo il pre-evasione.** Il commento di `applyCancellationTx` («Annullamento pre-evasione») descrive esattamente il suo perimetro, e l'assunzione di `emitRestockEvents` («`cancel` è escluso: pre-evasione la giacenza non era mai stata scaricata») **è corretta** — misurata al §3.
2. **Il pacco rifiutato non è un annullamento**: è un rimborso o un reso. Ogni specifica costruita sull'«annullamento post-evasione» descrive un gesto che l'operatore non può compiere.
3. _Dedotto, non misurato:_ che anche `POST /orders/{id}/cancel` rifiuti un ordine evaso. È stata misurata l'**interfaccia**, non l'API. Resta inoltre il caso in cui l'annullamento sia il primo evento che VestiFlow vede su un ordine già evaso — nel database esistono due ordini `fulfilled` con `fulfilledAt` null, importati da un negozio precedente.

**Stato: misurato 14/08.**

## §2 · I quattro gesti, e cosa fa VestiFlow oggi

_Tutti misurati il 14/08/2026 su ordini veri._

| Gesto                                                | Merce             | Corrispettivo            | Segnalazione                      | Verdetto                       |
| ---------------------------------------------------- | ----------------- | ------------------------ | --------------------------------- | ------------------------------ |
| **Annullamento post-evasione**                       | —                 | —                        | —                                 | **non esiste su Shopify** (§1) |
| **Annullamento pre-evasione** con ricarica (`#1007`) | niente da fare ✅ | non esiste ✅            | —                                 | **corretto** (§3)              |
| **Rimborso** su ordine pagato (`#1005`)              | rientra ✅        | → `refunded` ✅          | sì, ma con **due messaggi falsi** | difetto minore (`01` §2.15)    |
| **Reso** su ordine in sospeso (`#1006`)              | rientra ✅        | **resta `to_verify`** ❌ | **nessuna** ❌                    | **il buco** (§4)               |

**Il caso peggiore è il più ordinario.** Più il flusso somiglia a quello di tutti i giorni — contrassegno, pacco rifiutato — meno traccia lascia.

## §3 · Annullamento pre-evasione: funziona, e ora è verificato

_Misurato 14/08 su `#1007`._

Payload Shopify: `cancelled_at` valorizzato, `cancel_reason: customer`, `financial_status: refunded`, un `refunds[]` con nota «Ordine annullato» e **`restock_type: cancel`**.

VestiFlow: scrive `cancelledAt`, porta l'impegno a `released`, emette `online_order_cancelled` e `online_order_refunded`, **non** emette `online_order_restocked`.

**Ed è giusto.** Shopify non ha ricaricato la giacenza: ha liberato l'impegno — `available` alla sede è tornata da −2 a −1, non è salita a 0. Su un ordine mai evaso la merce non era mai uscita. `restock_type: cancel` significa «annulla l'impegno», non «la merce è rientrata», e scartarlo è il comportamento corretto.

**Non serve alcun intervento.** L'unica cosa che mancava era la verifica, e ora c'è.

**Stato: misurato 14/08, nessuna azione.**

## §4 · Il buco: il reso di un ordine non incassato

_Misurato 14/08 su `#1006`._ Dettaglio completo in `01-registro-difetti-shopify.md` §2.13.

In sintesi: la merce rientra, il corrispettivo resta a dichiarare un incasso mai avvenuto, e **nulla lo segnala**. La causa è che la rettifica del corrispettivo è agganciata a `financial_status === refunded`, mentre l'elaborazione di un reso su ordine non incassato porta l'ordine a **`paid`** (totale zero, quindi pagato).

### ⚠️ Dove va scritta: **non nelle entries, che cadono**

_Deciso l'11/08 (`04` §8) e riconfermato il 14/08: il registro corrispettivi è **derivato dalle vendite**, e `corrispettivo_entries` / `corrispettivo_entry_lines` cadono._

Questo cambia il posto, non la forma. La regola qui sotto resta corretta; **non va implementata scrivendo una voce in `CorrispettivoEntry`**, che è la tabella destinata a sparire e che nessun export legge.

_Misurato 14/08, e smentisce l'ipotesi che il modello derivato la produca già:_

```ts
// api/src/corrispettivi/corrispettivi.service.ts
for (const order of orders) {
  totalMinor += order.totalMinor; // valore PIENO
  if (isRefundFinancialStatus(order.financialStatus)) refundsCount += 1; // CONTA, non sottrae
}
```

Il registro derivato legge `salesOrder`, **non i movimenti**: un ordine reso contribuisce per intero, e un contatore dice quanti resi ci sono stati. **La rettifica oggi non è prodotta da nessuno.**

**Quindi il lavoro esiste, ed è: far leggere al registro derivato i movimenti `return`.** È anche l'unico modo per datare la rettifica al rientro — l'ordine porta una data sola, il movimento porta la sua.

### La regola da adottare: **il passato non si riscrive, si rettifica**

**Il corrispettivo originale resta immutato. Il reso genera una voce di registro NEGATIVA, alla data del reso, collegata alla vendita originaria.**

Non è solo una scelta di modello: _base normativa riferita_ — la rettifica dell'IVA sui resi nel commercio elettronico indiretto è ammessa **a condizione che sia garantita la tracciabilità fra vendita originaria e restituzione** (Risoluzione 274/E/2009). Il modello «originale immutato + rettifica collegata» è la forma che quella tracciabilità la produce; riscrivere l'originale la distrugge.

E risolve un caso che la riscrittura non copriva: **il reso parziale**. Se tornano due capi su cinque, il negativo vale per due.

```
14/08   vendita     +60,00     ← dalla vendita, come oggi
18/08   rettifica   −60,00     ← dal movimento `return`, alla SUA data
```

**Nessuna migration, e nessuna voce da scrivere.** Le due righe sono **derivate**: la prima dall'ordine, la seconda dal movimento di rientro. Nessuna tabella da alimentare, nessuno stato da mantenere, niente che possa divergere dai fatti — che è il vantaggio del registro derivato e la ragione della decisione dell'11/08.

**L'aggancio è il movimento, non l'evento.** Il registro somma i movimenti `return` con segno negativo alla loro data; non guarda `financial_status`, ed è quello l'errore che ha prodotto il buco misurato. Un reso parziale produce un negativo parziale senza nessun caso speciale: due capi su cinque sono due movimenti, non una regola in più.

**Cosa cade di quanto era stato scritto qui prima:** lo stato `adjusted` sull'originale non serve più — non c'è un originale da marcare, c'è una somma. E `requiresReview` sull'ordine resta utile solo se si vuole che qualcuno guardi; non è più il modo di far tornare i conti.

**Tre date che non coincidono, e vanno tenute distinte** — nessuna delle tre è la data della vendita:

- rientro fisico della merce;
- rimborso al cliente (in contrassegno: non c'è);
- rettifica fiscale.

Quale delle tre datare la voce negativa è l'unica cosa ancora da fissare qui, e la proposta è **la data del rientro**, perché è l'evento che VestiFlow conosce con certezza.

**Stato: deciso 14/08, non iniziato.**

## §5 · Il Corrispettivo nasce all'evasione — ed è corretto

_Misurato 14/08:_ `#1006` era in sospeso — `Pagato 0,00 €`, `Saldo 60,00 €` — e all'evasione VestiFlow ha creato `COR-2026-0004` da 60,00 €, datato quel giorno. Il corrispettivo si crea in `createFromFulfilledOrderTx`, sull'evento di evasione, **senza guardare lo stato del pagamento**.

**Questa specifica lo aveva registrato come «decisione di prodotto mai presa». Era sbagliato: la decisione è già nella norma, mancava solo il perché scritto accanto al codice.**

_Base normativa riferita:_ per le cessioni di beni mobili il momento di effettuazione dell'operazione è la **consegna o spedizione** (art. 6 DPR 633/1972), e alle vendite online di beni fisici si applica la stessa regola. Il contrassegno non sposta quel momento: che il cliente paghi il corriere alla consegna, e che il corriere versi all'azienda settimane dopo, sono **eventi finanziari** che non toccano la data dell'operazione.

Quindi **la data dell'evasione è quella giusta**, e le tre date restano distinte per costruzione:

```
data dell'operazione   = evasione        → Corrispettivo
data incasso cliente   = consegna        → non rappresentata oggi
data incasso azienda   = bonifico corriere → modulo Pagamenti, quando esisterà
```

**Cosa fare:** niente sul comportamento. Va scritto il **perché** accanto a `createFromFulfilledOrderTx`, che oggi crea il corrispettivo senza dire su quale regola si appoggia — ed è per questo che leggendolo sembrava un difetto.

**Stato: chiuso 14/08 (base normativa riferita, fonte da allegare). Resta un commento da scrivere.**

## §6 · Il rientro passa da una strada che il codice non dichiara

_Misurato 14/08._ Elaborando un reso, Shopify crea comunque un `refunds[]` — **anche con importo zero** — e dentro c'è `restock_type: return`. È così che il rientro raggiunge VestiFlow: non attraverso i topic dei resi, ma incartato in un rimborso.

Funziona. Ma il codice lo descrive come «rimborso», e il commento di `emitRestockEvents` parla di «rimborsi Shopify con `restock_type` fisico» — che è vero alla lettera e fuorviante nella sostanza: **quel rimborso può essere da zero euro e non essere affatto un rimborso.**

**Cosa fare:** niente, sul comportamento. I commenti vanno corretti, perché chi legge oggi conclude che i resi non arrivino.

**Stato: misurato 14/08. Solo commenti.**

## §7 · Fuori scope

- **Iscriversi ai topic `returns/*`.** Il rientro arriva comunque (§6); coprire anche la finestra «reso dichiarato ma non elaborato» è utile ma non necessario, e ha la trappola del punto 2.1 del registro — aggiungerli al codice non li attiva.
- **Il credito verso il corriere** (contrassegno non ancora incassato). Dipende dal motore Pagamenti, che non esiste. E oggi mancherebbe anche il dato: _misurato 14/08_, VestiFlow non legge `gateway`, `payment_gateway_names`, `payment_terms` né `processing_method` — non può sapere che un ordine è in contrassegno.
- **La sede di scarico** (`01` §3.8). È un difetto suo, tocca ogni ordine online e non solo i resi: va corretto lì.
- **`cancel_reason`.** Esiste ed è valorizzato, non serve a distinguere nulla di quanto sopra. Non lo raccogliamo.

## §8 · Le regole fiscali adottate, e su cosa poggiano

**Nessuna questione fiscale resta aperta su questo perimetro.** Quelle che sembravano tali erano verificabili, ed è il motivo per cui questo documento ha un metodo di classificazione in testa.

| Regola adottata                                                                                                  | Base _riferita_                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La data del Corrispettivo è quella dell'evasione (§5)                                                            | art. 6 DPR 633/1972 — consegna **o** spedizione: la spedizione basta                                                                                                                         |
| Le vendite da commercio elettronico indiretto non si trasmettono telematicamente, ma vanno annotate nel registro | art. 24 DPR 633/1972 · interpello 198/2019 · DM 10 maggio 2019                                                                                                                               |
| Il reso si rettifica con una voce negativa collegata, non riscrivendo l'originale (§4)                           | Risoluzione 274/E/2009 — tracciabilità fra vendita e restituzione                                                                                                                            |
| Fattura **contestuale** al corrispettivo: l'importo si scorpora dal totale                                       | FAQ Agenzia delle Entrate n. 45 del 21/12/2018                                                                                                                                               |
| Fattura richiesta **dopo**: il corrispettivo **non si tocca**                                                    | Risoluzione 47/E/2019 — l'obbligo vale se la fattura è chiesta al momento dell'operazione; emessa dopo è documentale e non transita nel registro IVA vendite, perché l'imposta è già assolta |

L'ultima riga è quella che evita il danno peggiore: **rettificare all'indietro un periodo già chiuso creerebbe un buco nei dati già consegnati.** Vale per la fattura tardiva esattamente come per il reso — stesso principio, due applicazioni.

### Decisione di prodotto: registro unico, filtrabile per canale

_Deciso il 14/08._ Un solo registro corrispettivi, con evidenza separata negozio/online, e un **export separato producibile** per il commercialista e per le analisi.

Così la forma dei dati regge qualunque risposta: sia che si preferisca un registro unico con evidenza separata, sia che se ne vogliano due, l'estrazione c'è. La domanda smette di essere bloccante.

_Misurato 14/08:_ `CorrispettivoEntry.channel` **esiste** e il registro **aggrega già per canale**, con etichetta. **Manca il filtro esplicito nella lista**: oggi il dato c'è e l'operatore non può usarlo. È quello che rende vero «filtrabile», e va aggiunto.

### ✅ L'esclusione dei fatturati si deriva, e non serve niente di nuovo

_Deciso il 14/08, con il §5-bis della `07`._ L'esclusione di una vendita dal registro corrispettivi **si deriva dal fatto che quell'ordine è stato convertito in un documento fiscale** — non da una spunta.

Il legame è `SalesOrder.documentId`, che **esiste già**, e la cardinalità è quella giusta senza toccare niente: _misurato_, è una chiave singola sull'ordine, quindi **una fattura copre più vendite** e **un ordine non si spezza fra due documenti**. Nessuna relazione nuova, nessuna migration.

Quello che manca è la **conversione applicata all'Ordine cliente** — la generazione documentale, distinta dalla conclusione che scarica il magazzino. Oggi un ordine di canale è escluso da tre filtri indipendenti, ma quei filtri proteggevano **dallo scarico**, non dal canale: convertire non tocca il magazzino. Il perché e i tre cancelli stanno nel §5-bis della `07`.

### Conseguenza misurata: l'esclusione non è verificabile — ma non tocca l'estrazione

_Misurato 14/08._ Lo stato si applica **a mano**, con la spunta «fattura emessa» (`invoiceIssued`), **senza collegamento a una fattura reale**. Nessuno può risalire a quale fattura giustifichi l'esclusione, né accorgersi di una spunta sbagliata.

**Nessuna nozione di «periodo chiuso» serve**, ed era un'invenzione di questo documento prima di essere corretto: i dati per il commercialista si estraggono **su richiesta**, con export filtrati prodotti dall'operatore. Non c'è niente da chiudere e niente da bloccare — coerente con il principio di VestiFlow: **i controlli sono avvisi, mai blocchi**.

E il danno è più piccolo di come era stato scritto: _misurato_, l'export per il commercialista (`api/src/corrispettivi/`) legge `salesOrder` e **non tocca `corrispettivoEntry`**. La spunta sporca la vista del registro, non i dati che escono.

Da affrontare quando si costruiranno i filtri e gli export del **registro derivato** — e le entries, nel frattempo, cadono.

### Quello che resta fuori, e non per pigrizia

**Regimi particolari** — OSS/IOSS, vendite estere, ventilazione, regime del margine. Cambiano i presupposti dell'operazione, non si risolvono con una regola generale, e nessuno dei clienti attuali li usa. Se emergono, si valutano allora.

## §9 · Ordine di esecuzione

1. **`01` §3.8 — la sede di scarico.** ✅ **Fatto il 14/08** per lo **scarico**: usa `fulfillments[].location_id`. **L'impegno resta sul ripiego alfabetico**, e si chiude leggendo le _fulfillment orders_ — dopo la procedura di prima sincronizzazione, non prima. Il criterio della scelta: sullo scarico una sede sbagliata produce una giacenza sbagliata **per sempre**, sull'impegno una disponibilità imprecisa **per qualche ora**. Chiuso il danno permanente, lasciato aperto quello transitorio.
2. **§4 — la rettifica per reso**, che **non si scrive: si deriva.** Il registro derivato deve leggere i movimenti `return` e sommarli col segno negativo alla loro data. Oggi legge `salesOrder` e conta i resi senza sottrarli. Niente migration, nessuna voce da alimentare.
3. **§8 — il filtro per canale**, sul **registro derivato dalle vendite**, che è dove l'export già guarda (`onlineOnly` / `posOnly` esistono lì). È il primo pezzo degli export filtrati.
4. **`corrispettivo_entries` smette di essere scritta** — vedi §10. La decisione è dell'11/08 ma il codice non l'ha seguita, e ogni evasione ne scrive ancora una.
5. **`01` §2.15 — i due messaggi falsi.** ✅ **Fatto il 14/08.**
6. **§5 e §6 — i commenti.** Il perché della data del corrispettivo accanto a `createFromFulfilledOrderTx`, e la correzione di `emitRestockEvents`. Il secondo è ✅ **fatto il 14/08**.
7. **Le fonti normative in allegato** — una volta sola, e i «riferito» del §4, del §5 e del §8 diventano verificati.

## §10 · Cosa serve perché `corrispettivo_entries` smetta di essere scritta

_Censimento del 14/08/2026. La decisione è dell'11/08 (`04` §8) ma il codice non l'ha seguita: **ogni evasione ne scrive ancora una**._

**La superficie è piccola: 13 file** fra API e frontend nominano l'entità. E due vincoli che si temevano non ci sono:

- **non è nel backup** — `api/src/tenant/` non la nomina mai (a differenza di `DocumentSequence`, agganciata in cinque punti);
- **non è nell'export** per il commercialista, che legge `salesOrder`.

### Chi la tocca, misurato

|        | Dove                                              | Cosa fa                                         |
| ------ | ------------------------------------------------- | ----------------------------------------------- |
| scrive | `online-sale-fulfillment.service.ts:588` e `:648` | crea voce e righe **a ogni evasione**           |
| scrive | `online-sale-fulfillment.service.ts:351`          | porta la voce a `refunded` sul rimborso         |
| scrive | `corrispettivo-register.service.ts:338`           | la modifica manuale dell'operatore              |
| legge  | `corrispettivo-register.service.ts` (6 punti)     | **l'unico lettore**: elenco, filtri, riepiloghi |

Nient'altro. Il frontend ha `corrispettivi-register.component.ts`, la sua rotta e il servizio.

### L'ordine, e cosa blocca cosa

1. **Decidere le due informazioni** che le vendite non hanno (sotto). Sono l'unica cosa che si perde davvero, e vanno decise **prima**.
2. **Il registro derivato deve saper fare quello che fa quello a entries**: elenco, filtri, riepiloghi — più la rettifica per reso del §4, che oggi non ha nessuno dei due.
3. **Smettere di scrivere**: togliere `createCorrispettivoTx` dall'evasione e l'aggiornamento sul rimborso. Da qui in poi nessuna voce nuova.
4. **Ripuntare la schermata** sul registro derivato, o toglierla.
5. **La numerazione cade da sé**: `DocumentType.corrispettivo` è consumato in **un solo punto** (`online-sale-fulfillment.service.ts:580`). È il «togliere al corrispettivo la numerazione che ha» del `04` §8.
6. **La migration che elimina le tabelle è DISTRUTTIVA**, ed è la prima di questo ramo. Il database è condiviso e c'è un ambiente pubblicato: va fatta **in due tempi** — prima si smette di scrivere e leggere, poi, in un rilascio successivo, si eliminano le tabelle.

**I passi 1-4 non richiedono nessuna migration.** Solo il 6 la richiede, e può aspettare quanto serve.

### Le due informazioni da decidere prima

_Isolate dal `04` §8 l'11/08: sono decisioni di un operatore, non deducibili da nessun dato delle vendite._

**A · La motivazione dell'esclusione dal riepilogo.** Oggi `exclusionReason`, testo libero accanto a `excluded_invoiced`.

| Opzione                        | Conseguenza                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **cade**                       | l'esclusione resta senza perché; oggi comunque non è verificabile (§8)                                                                                                  |
| **si sposta sulla vendita**    | una colonna su `sales_orders`, sempre disponibile, ma un campo fiscale su un'entità commerciale                                                                         |
| **si ricostruisce dal legame** | se l'esclusione nasce dalla fattura che copre la vendita, il perché **è** quella fattura: nessun campo, e diventa verificabile — ma richiede il legame che oggi non c'è |

**B · La data fiscale modificabile, separata da quella operativa.** Oggi `fiscalDate`, proposta dall'evasione e correggibile.

| Opzione                     | Conseguenza                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **cade**                    | la data è quella dell'operazione, punto. Coerente con il §5 (art. 6: consegna **o** spedizione), e non serve correggerla se la regola è chiara |
| **si sposta sulla vendita** | una colonna su `sales_orders`, e resta la possibilità di correggere un caso limite                                                             |

**La terza opzione della A è la sola che migliora qualcosa invece di spostarlo**, ma dipende da un legame vendita↔fattura che non esiste. Se non lo si vuole costruire ora, la scelta vera è fra «cade» e «si sposta».
