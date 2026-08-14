# 08 · Specifica — Resi e annullamenti dal canale

**Data:** 14/08/2026
**Stato del documento:** piano, non consuntivo. Ogni voce porta il proprio stato. Nessuna voce va letta come già fatta se non lo dice.
**Owner:** Luigi
**Migration richiesta:** **nessuna.** Il modello adottato al §4 usa solo cose che esistono: una voce di registro con importi negativi e lo stato `adjusted`, già nell'enum.

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

### La regola da adottare: **il passato non si riscrive, si rettifica**

**Il corrispettivo originale resta immutato. Il reso genera una voce di registro NEGATIVA, alla data del reso, collegata alla vendita originaria.**

Non è solo una scelta di modello: _base normativa riferita_ — la rettifica dell'IVA sui resi nel commercio elettronico indiretto è ammessa **a condizione che sia garantita la tracciabilità fra vendita originaria e restituzione** (Risoluzione 274/E/2009). Il modello «originale immutato + rettifica collegata» è la forma che quella tracciabilità la produce; riscrivere l'originale la distrugge.

E risolve un caso che la riscrittura non copriva: **il reso parziale**. Se tornano due capi su cinque, il negativo vale per due.

```
Corrispettivo originale   COR-…-0004   14/08   +60,00   → stato `adjusted`
Rettifica da reso         COR-…-000N   18/08   −60,00   → collegata all'originale
```

**Nessuna migration.** _Misurato:_ gli importi sono colonne `Int`, quindi i negativi sono rappresentabili; il registro **somma**, quindi una voce negativa sottrae da sé senza codice speciale; e lo stato per l'originale esiste già — **`adjusted`**, che significa esattamente «rettificato». L'enum resta `to_verify · included · excluded_invoiced · adjusted · refunded`.

**L'aggancio.** Quando arriva un `online_order_restocked` che riguarda una Vendita online: si crea la voce negativa, si porta l'originale a `adjusted`, e si marca l'ordine `requiresReview` con un motivo che dica cosa resta da fare. Non si guarda `financial_status`: è quello l'errore che ha prodotto il buco.

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

### ⛔ Conseguenza misurata: `excluded_invoiced` oggi non distingue i due casi

_Misurato 14/08._ Lo stato si applica **a mano**, con la spunta «fattura emessa» sul registro (`corrispettivo-register.service.ts`, `invoiceIssued`). Nessun collegamento automatico a una fattura, e **nessuna nozione di contestuale o tardiva**.

Quindi un operatore che spunta «fattura emessa» su un corrispettivo di un periodo **già chiuso** toglie dal registro un importo già dichiarato — il buco che la regola sopra vuole evitare, raggiungibile oggi con un clic e senza avvisi.

**`excluded_invoiced` va applicato solo alla fattura contestuale.** Per distinguere i due casi serve sapere **quando un periodo è chiuso**, e quella nozione in VestiFlow **non esiste**. È una scelta gestionale da progettare, non una domanda fiscale.

### Quello che resta fuori, e non per pigrizia

**Regimi particolari** — OSS/IOSS, vendite estere, ventilazione, regime del margine. Cambiano i presupposti dell'operazione, non si risolvono con una regola generale, e nessuno dei clienti attuali li usa. Se emergono, si valutano allora.

## §9 · Ordine di esecuzione

1. **`01` §3.8 — la sede di scarico.** ✅ **Fatto il 14/08** per lo **scarico**: usa `fulfillments[].location_id`. **L'impegno resta sul ripiego alfabetico**, e si chiude leggendo le _fulfillment orders_ — dopo la procedura di prima sincronizzazione, non prima. Il criterio della scelta: sullo scarico una sede sbagliata produce una giacenza sbagliata **per sempre**, sull'impegno una disponibilità imprecisa **per qualche ora**. Chiuso il danno permanente, lasciato aperto quello transitorio.
2. **§4 — la rettifica per reso.** Voce negativa alla data del rientro, originale a `adjusted`, aggancio su `online_order_restocked` invece che su `financial_status`. Niente migration.
3. **§8 — il filtro per canale** nella lista del registro. Piccolo, e rende vera la decisione «registro unico filtrabile».
4. **§8 — la nozione di periodo chiuso**, senza la quale `excluded_invoiced` resta pericoloso. È progettazione, non una riga.
5. **`01` §2.15 — i due messaggi falsi.** ✅ **Fatto il 14/08.**
6. **§5 e §6 — i commenti.** Il perché della data del corrispettivo accanto a `createFromFulfilledOrderTx`, e la correzione di `emitRestockEvents`. Il secondo è ✅ **fatto il 14/08**.
7. **Le fonti normative in allegato** — una volta sola, e i «riferito» del §4, del §5 e del §8 diventano verificati.
