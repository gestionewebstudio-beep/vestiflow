# 08 · Specifica — Resi e annullamenti dal canale

**Data:** 14/08/2026
**Stato del documento:** piano, non consuntivo. Ogni voce porta il proprio stato. Nessuna voce va letta come già fatta se non lo dice.
**Owner:** Luigi
**Migration richiesta:** per il §4 **una additiva, già fatta** il 14/08 (`sales_order_refunds`) — qui era scritto «nessuna», e il §4 spiega perché è cambiato. Ne serve **una distruttiva** per eliminare `corrispettivo_entries` (§10): è l'ultima cosa, e va in due tempi.

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

**Quindi il lavoro esiste, ed è: far sottrarre al registro derivato le rettifiche, alla loro data.** L'ordine porta una data sola, e non è quella del reso. _(Qui era scritto «i movimenti `return`»: da dove arriva davvero la rettifica è nella correzione qui sotto.)_

### La regola da adottare: **il passato non si riscrive, si rettifica**

**Il corrispettivo originale resta immutato. Il reso genera una voce di registro NEGATIVA, alla data del reso, collegata alla vendita originaria.**

Non è solo una scelta di modello: _base normativa riferita_ — la rettifica dell'IVA sui resi nel commercio elettronico indiretto è ammessa **a condizione che sia garantita la tracciabilità fra vendita originaria e restituzione** (Risoluzione 274/E/2009). Il modello «originale immutato + rettifica collegata» è la forma che quella tracciabilità la produce; riscrivere l'originale la distrugge.

E risolve un caso che la riscrittura non copriva: **il reso parziale**. Se tornano due capi su cinque, il negativo vale per due.

```
14/08   vendita     +60,00     ← dalla vendita, come oggi
18/08   rettifica   −60,00     ← dal rimborso del canale, alla SUA data
```

**Cosa cade di quanto era stato scritto qui prima:** lo stato `adjusted` sull'originale non serve più — non c'è un originale da marcare, c'è una somma. E `requiresReview` sull'ordine resta utile solo se si vuole che qualcuno guardi; non è più il modo di far tornare i conti.

### ⚠️ Correzione al piano: il negativo nasce dal RIMBORSO, non dal movimento di rientro

_Cambiato in esecuzione il 14/08. Qui era scritto «nessuna migration, e nessuna voce da scrivere: la seconda riga è derivata dal movimento di rientro». **Era sbagliato**, e va detto perché — la decisione dell'11/08 sul registro derivato non c'entra e resta intatta._

Un movimento di magazzino porta **pezzi**; un corrispettivo porta **euro con dentro l'imposta**. Ricavare i secondi dai primi vuol dire ri-prezzare la merce resa, e il prezzo ricostruito non è quello che il canale ha davvero restituito: sconti di riga, rimborsi parziali, spedizione resa non stanno nel movimento. Ma soprattutto **fisico ed economico divergono in tre casi già visibili nel pannello Shopify**:

| Caso                                                                    | Movimento | Rimborso | `restock_type` | Il registro deve…                      |
| ----------------------------------------------------------------------- | --------- | -------- | -------------- | -------------------------------------- |
| Reso con rientro (la spunta «Riporta in magazzino» accesa)              | sì        | sì       | `return`       | sottrarre                              |
| Rimborso senza rientro (`no_restock`: capo rovinato, gesto commerciale) | no        | sì       | `no_restock`   | **sottrarre**                          |
| Annullamento pre-evasione                                               | no        | **sì**   | `cancel`       | **non toccare** — la vendita non c'era |

Agganciare il negativo al movimento sbaglia le prime due righe: la seconda la perde, la terza la inventerebbe.

⚠️ **La terza riga è stata corretta il 14/08, dopo una misura che l'ha smentita.** Diceva «Movimento: sì · Rimborso: no», cioè che un annullamento non produce alcun rimborso. **È falso**: Shopify scrive anche l'annullamento in `refunds[]`, con nota «Ordine annullato». Sincronizzando il negozio di prova sono arrivate quattro rettifiche e solo due erano resi — le altre due erano gli annullamenti di `#1003` e `#1007`, per 110,00 €. Dettaglio in `01` §2.17.

E non produce nemmeno un movimento: su un ordine mai evaso la merce non era uscita, quindi non rientra — è quanto il §3 aveva già misurato. La riga sbagliava entrambe le colonne, e nessuno se ne sarebbe accorto senza sincronizzare davvero.

**Il fatto economico resta il rimborso, ma non ogni rimborso è una rettifica.** Il segno che li separa è `restock_type: cancel`, lo stesso che il §3 usa per non ricaricare la giacenza: significa «annulla l'impegno», non «la merce è tornata».

**Questo NON reintroduce un registro materializzato.** `sales_order_refunds` registra un **fatto del canale**, come `sales_orders` registra la vendita: nessun totale precalcolato, nessuno stato da mantenere allineato. Il registro resta derivato — somma le vendite del periodo e sottrae i rimborsi del periodo, entrambi fatti.

**Fatto (14/08) — migration additiva `20260814120000_rimborsi_ordine_vendita`:** tabella `sales_order_refunds` (RLS + `REVOKE` nella stessa migration), popolata da `ShopifySyncService.persistRefunds` dentro la stessa transazione dell'ordine. Idempotente sull'unicità `(tenant, id rimborso del canale)`: lo stesso ordine torna a ogni webhook coi rimborsi già visti dentro, e senza quella chiave la stessa rettifica si conterebbe a ogni sync.

Gli importi arrivano da `refunds[].refund_line_items[].subtotal` e `.total_tax`, che **c'erano già nel payload e si buttavano**. Misurato sui due ordini di prova: rimborso `1049158746407` → subtotale 6000, imposta 231, totale 6000 (store a prezzi ivati: l'imposta è dentro il subtotale, non si somma). Mappatura in `shopify-refund.util.ts`, 8 test.

**La data della rettifica è `processed_at` del rimborso.** Delle tre date non coincidenti — rientro fisico, rimborso al cliente, rettifica fiscale — questa è la seconda, ed è quella giusta per un registro **economico**: è il momento in cui l'incasso viene meno. Sui due casi misurati le tre coincidono; quando divergeranno, il rientro fisico resta sul movimento di magazzino, dov'è il suo posto.

#### Provato sul negozio il 14/08 — cosa ha retto e cosa no

Due pressioni di «Sincronizza vendite» sul negozio di prova, con lettura del database prima, in mezzo e dopo.

**Ha retto:** la tabella si è riempita al primo passaggio, e il secondo **non ha duplicato niente** — quattro righe restano quattro, create una volta sola. L'unicità `(tenant, id rimborso)` fa il suo mestiere.

⚠️ **Non ha retto la selezione: sono arrivate quattro rettifiche, e due sono annullamenti** (`#1003` e `#1007`, 110,00 € in tutto). Il mapper legge `refunds[]` senza guardare il `restock_type`, quindi prende dentro anche l'annullamento pre-evasione. Vedi la tabella corretta sopra e `01` §2.17.

**E la misura ha trovato un difetto più grande di quello che cercava.** Il registro derivato conta come incassati anche gli ordini **annullati** e quelli **mai spediti**: su agosto dichiara 386,49 € dove il corrispettivo vero è 50,00 € (`01` §2.16). La sottrazione dei resi, da sola, arriverebbe a 156,49 € — sbagliato in un altro modo. **I tre pezzi vanno fatti insieme, o il registro resta falso in tre modi invece che in uno.**

#### Il mapper corretto — provato il 14/08 su un ordine costruito apposta

Un ordine con **due aliquote** (4% e 22%), **sconti di riga** e **spedizione a pagamento**: gli ordini di prova precedenti erano tutti a una aliquota, senza sconti e senza spedizione, e nascondevano tre difetti.

**1. La spedizione arriva con una convenzione diversa dalle righe.**

```
righe rimborsate:   subtotal 54.00 · total_tax 2.08   ← LORDO, imposta dentro
order_adjustments:  amount −21.32  · tax_amount −4.69 ← NETTO, imposta a parte
```

21,32 + 4,69 = 26,01. La prima versione applicava a entrambe la regola delle righe e scriveva **75,32 invece di 80,01**: mancava l'IVA della spedizione, sommata all'imposta ma mai al totale. Il 5,9% in meno su quel rimborso.

**2. Ogni rettifica fuori riga finiva fra le spedizioni.** Un rimborso di cortesia a importo libero da 5,00 € — che Shopify scrive come `kind: refund_discrepancy` senza alcuna riga — veniva registrato come «spedizione resa». Il totale tornava, il significato no. Ora `shipping_refund` e il resto stanno in due colonne.

**3. Gli annullamenti non erano distinguibili.** Vedi la tabella corretta sopra: si classificano, non si scartano.

**E mancava la scomposizione per aliquota.** Un rimborso può contenere una riga al 4% e la spedizione al 22%: un totale unico non sa quanto togliere a ciascuna. L'aliquota è **nullable di proposito** — le rettifiche fuori riga non la dichiarano, e Shopify stesso avverte che senza righe l'imposta non è attribuibile. Una riga muta è più onesta di un'attribuzione indovinata.

Verifica finale, letta dal database dopo la risincronizzazione:

| ordine | natura       | totale    | imposta  | scomposizione                       |
| ------ | ------------ | --------- | -------- | ----------------------------------- |
| #1003  | annullamento | 50,00     | 9,02     | 22%                                 |
| #1005  | reso         | 60,00     | 2,31     | 4%                                  |
| #1006  | reso         | 60,00     | 2,31     | 4%                                  |
| #1007  | annullamento | 60,00     | 2,31     | 4%                                  |
| #1008  | reso         | **80,01** | **6,77** | 4% (51,92) + non dichiarata (21,32) |
| #1008  | rimborso     | 5,00      | 0,00     | non dichiarata                      |

Su tutte e sei la somma della scomposizione fa esattamente il totale. Gli importi di `#1008` coincidono al centesimo con quelli mostrati da Shopify.

#### ✅ Il registro sottrae — fatto e riconciliato il 14/08

Tre difetti chiusi insieme, perché separarli avrebbe lasciato il totale falso a metà strada (`01` §2.16):

1. il periodo si misura sulla **data di evasione**, e un ordine mai spedito non entra;
2. le rettifiche si sottraggono **alla loro data**, saltando gli annullamenti;
3. l'imponibile non toglie più lo sconto due volte.

**Gli ordini annullati non si filtrano**, ed è deliberato: filtrarli farebbe sparire retroattivamente una vendita già avvenuta se l'ordine venisse annullato dopo. Un annullamento pre-evasione resta fuori **da sé**, perché non ha data di evasione — il criterio è quindi corretto a prescindere da cosa il canale permetta oggi.

**Riconciliazione di agosto 2026**, rifatta due volte per strade diverse — dal riepilogo e dalla lista — e coincidente al centesimo:

```
venduto        300,01    #1004 50,00 · #1005 60,00 · #1006 60,00 · #1008 130,01
rettifiche    −205,01    #1005 60,00 · #1006 60,00 · #1008 80,01 + 5,00
annullamenti        0    #1003 e #1007 — vendite mai avvenute
──────────────────────
corrispettivo   95,00 =  50 + 0 + 0 + 45
```

**L'elenco mostra le rettifiche come righe negative** (fatto il 14/08). Prima mostrava le sole vendite, e da quando il riepilogo sottraeva la schermata si contraddiceva: totale 95,00, elenco 300,01. Le righe sono **derivate**, non documenti nuovi, e portano sempre il riferimento all'ordine.

**Il periodo si sceglie per calendario** (fatto il 14/08): mese, trimestre o anno precisi, con i selettori che compaiono solo per il periodo che li richiede. Ogni preset resta soltanto un modo di scrivere un intervallo — la traduzione avviene in un punto unico (`resolveReportDateRange`), così «2° trimestre 2026» e le date scritte a mano non possono divergere. È coperto da test, incluso il confronto fra le due strade.

⚠️ **Limite noto sulla data fiscale, misurato e non aggirato.** Il registro usa la data di evasione, che è la regola **ordinaria** per le cessioni di beni mobili. Non è la regola completa: l'art. 6 anticipa il momento di effettuazione se il corrispettivo è pagato prima della consegna, il che su un ordine incassato con carta accade quasi sempre. **VestiFlow non può derivarlo oggi**: nessuna data di incasso è persistita, le transazioni del canale non si importano. Manca il dato, non la logica — e finché manca, la formulazione da usare è «per il flusso supportato oggi il registro usa la data di evasione», non «la data di evasione è la data fiscale».

#### ✅ Anche il file per il commercialista si riconcilia — fatto il 14/08

Il CSV, l'Excel e il PDF elencavano le **sole vendite** mentre la loro intestazione portava il netto: su un trimestre, 4 righe per 300,01 € sotto un totale di 95,00 €. Chi apriva il file non poteva ricostruire quel numero dalle righe — lo stesso difetto chiuso a schermo, rimasto nel documento che esce dall'azienda.

**La correzione non è stata «aggiungere le rettifiche all'export»**, ma togliere la possibilità che i due divergano: lista ed export chiamano ora la **stessa** funzione (`buildRegisterRows`). Una selezione, un dataset — strutturale, non promesso in un commento. Era già successo una volta che il riepilogo conoscesse le rettifiche e il file no.

Il file ha ora una colonna **Tipo** (Vendita · Reso · Rimborso) e la colonna data si chiama **«Data»**, non più «Data vendita»: su una riga di reso quell'etichetta era falsa.

Verificato sul 3° trimestre 2026:

```
2026-08-08  Vendita   #1004     48,08     1,92     50,00
2026-08-14  Vendita   #1005     57,69     2,31     60,00
2026-08-14  Reso      #1005    −57,69    −2,31    −60,00
2026-08-14  Vendita   #1006     57,69     2,31     60,00
2026-08-14  Reso      #1006    −57,69    −2,31    −60,00
2026-08-14  Vendita   #1008    114,23    15,78    130,01
2026-08-14  Reso      #1008    −73,24    −6,77    −80,01
2026-08-14  Rimborso  #1008     −5,00     0,00     −5,00
──────────────────────────────────────────────────────
somma delle righe          84,07    10,93     95,00
intestazione del file      84,07    10,93     95,00
```

#### ✅ Canale e tipo sono selettori, e sono indipendenti — fatto il 14/08

Al posto degli interruttori «Solo online» e «Solo rimborsi»:

| Filtro     | Voci                                                            |
| ---------- | --------------------------------------------------------------- |
| **Canale** | Shopify _(predefinito)_ · Negozio · Tutti i canali              |
| **Tipo**   | Vendite e rettifiche · Solo vendite · Solo resi · Solo rimborsi |

I tre filtri sono indipendenti: «2° trimestre 2026 · Shopify · Solo resi» è una domanda legittima.

⚠️ **Il predefinito del canale è «Tutti», e per un po' non lo è stato.** Nato «Shopify», ha prodotto in mezz'ora il difetto peggiore: **due schermate con lo stesso nome che dicevano numeri diversi per lo stesso trimestre** — 95,00 € in `/reports/corrispettivi` e 324,36 € nel Registro commercialista, che il canale non lo filtra affatto.

_Misurato:_ la differenza stava in **un solo campo**, non nel calcolo. Entrambe le pagine passano da `CorrispettiviService.getSummary`, e `accountant-register.service.ts` passa `onlineOnly` solo se il canale è esplicitamente «online». Nessuna seconda aggregazione: una sola, due predefiniti.

**Fra i due vince quello che mostra tutto.** Un totale gonfiato si nota — qualcuno chiede perché ci sono dentro gli ordini manuali; un totale a cui manca una parte no, e nessuno cerca ciò che non vede. Su un registro fiscale è il verso giusto in cui sbagliare. I 229,36 € di differenza sono due Ordini cliente evasi a luglio: che possano essere coperti da una fattura resta la decisione aperta di `04` §8, e non si risolve nascondendoli.

⚠️ **Il filtro per tipo agisce sull'ELENCO, non sul riepilogo**, ed è una scelta. Guardando «Solo resi» il totale del periodo continua a dire **95,00 €**, non −205,00: il secondo è un numero che non significa niente, e che prima o poi qualcuno trascriverebbe su un registro. Il tipo serve a ispezionare, non a ridefinire il periodo.

**Prova incrociata**, 3 periodi × 3 canali × 4 tipi = 36 combinazioni: in ognuna la lista completa somma esattamente al totale del riepilogo. Le viste per tipo mostrano meno righe di proposito.

#### Cosa resta

- **Un parametro di periodo non valido nell'indirizzo** (`?month=99`) ricade in silenzio sul periodo corrente. Non è un difetto attivo — non esistono ancora collegamenti condivisibili col periodo dentro — ma il giorno in cui esisteranno, chi apre un collegamento malformato deve vedere un avviso, non un altro mese senza spiegazioni. Nota, non lavoro in coda.
- **La decisione sugli ordini manuali nel registro**: quali entrano e quali no, che è l'`excluded_invoiced` del `04` §8 e che oggi il predefinito aggira senza risolvere.

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
2. **§4 — la rettifica per reso.** ✅ **Metà fatta il 14/08**: il rimborso del canale ora si persiste (`sales_order_refunds`, migration additiva), con importo, imposta e data. **Manca la sottrazione**: il registro derivato somma ancora i totali pieni e conta i resi senza toglierli. _Il piano è cambiato in esecuzione — il negativo nasce dal rimborso, non dal movimento di rientro: il perché è nel §4._
3. **§8 — il filtro per canale**, sul **registro derivato dalle vendite**, che è dove l'export già guarda (`onlineOnly` / `posOnly` esistono lì). È il primo pezzo degli export filtrati. **Stesso intervento del punto 2**: entrambi toccano `corrispettivi.service.ts` e l'export, e vanno fatti insieme.
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

### Censimento della maschera legacy — 14/08/2026

_Fatto prima di ripuntare la rotta, per non scoprire una funzione mancante dopo averla tolta._

| Funzione legacy               | Comportamento reale                                                | Requisito valido? | Nel derivato?  | Verdetto                                                                    |
| ----------------------------- | ------------------------------------------------------------------ | ----------------- | -------------- | --------------------------------------------------------------------------- |
| **Filtro Aliquota IVA**       | aliquota **media inventata** su ordini multi-aliquota (`01` §3.12) | sì                | no             | **ricostruire** da `tax_lines`, non portare                                 |
| **Filtro Fattura**            | spunta manuale che imposta anche l'esclusione                      | sì come concetto  | no             | **derivare dal legame**, mai copiare il flag                                |
| **Riepilogo / Incluso**       | esclude dai riepiloghi **della sola maschera legacy**              | da decidere       | no             | non portare finché la decisione è aperta                                    |
| **Stato**                     | `to_verify` all'evasione, `refunded` al rimborso                   | parziale          | c'è **Tipo**   | `refunded` ridondante; il resto è flusso, semmai al Registro commercialista |
| **Data fiscale modificabile** | proposta dall'evasione                                             | no                | usa l'evasione | **cade** (già deciso, col limite noto scritto)                              |
| **Numero COR-…**              | consuma `DocumentType.corrispettivo`                               | no                | no             | **cade**                                                                    |
| **Modifica manuale voce**     | PATCH sulla entry                                                  | no                | —              | **cade** con la tabella                                                     |

**E la domanda che decideva tutto: quelle funzioni non le ha mai usate nessuno.**

```
«fattura emessa» spuntata:           0 voci
escluse dal riepilogo:               0
motivo di esclusione scritto:        0
data fiscale ≠ data operativa:       0
righe con Codice IVA riconosciuto:   4 su 8   (le 4 mancanti sono l'ordine multi-aliquota)
```

Nessuno storico dell'operatore da migrare prima che la tabella cada. L'unica nota scritta è il messaggio falso del difetto `01` §2.15.

⚠️ **L'unico argomento per tenere viva la maschera legacy era il filtro per aliquota, e cade guardandolo da vicino**: restituisce numeri fiscalmente falsi. Meglio non offrire quel filtro che offrirlo così — un 12% mai esistito è un numero che qualcuno trascrive. Il requisito resta e torna nel derivato quando l'IVA per riga sarà letta davvero.

### L'ordine, e cosa blocca cosa

1. **Decidere le due informazioni** che le vendite non hanno (sotto). Sono l'unica cosa che si perde davvero, e vanno decise **prima**.
2. **Il registro derivato deve saper fare quello che fa quello a entries**: elenco, filtri, riepiloghi — più la rettifica per reso del §4. ✅ **Fatto il 14/08**, salvo il filtro per aliquota, che il censimento ha declassato da «da portare» a «da ricostruire».
3. **Ripuntare la schermata.** ✅ **Fatto il 14/08**: `/app/sales/corrispettivi` carica il registro derivato, `/app/reports/corrispettivi` fa redirect. L'indirizzo e la voce di menu non cambiano — cambia cosa caricano. I permessi passano a quelli delle vendite online, gli stessi che l'API richiede: la vecchia rotta sotto Report chiedeva `SectionReports`, e chi aveva solo quello apriva una pagina che poi prendeva 403 dalle proprie chiamate.
4. **Smettere di scrivere.** ✅ **Fatto il 14/08**: `createCorrispettivoTx` è stato rimosso dall'evasione insieme all'aggiornamento sul rimborso. Da qui in poi nessuna voce nuova, e i test lo sorvegliano — le asserzioni che pretendevano una voce ora pretendono che non ci sia.

   Il mini-censimento prima di togliere ha trovato **tre viste** che leggevano la voce e non erano il registro: il badge nel dettaglio Vendita online, la colonna nell'elenco Vendite online e quella negli Ordini cliente. Mostravano numero `COR-…` e stato, cioè un oggetto persistente che nel modello derivato non esiste — lì il corrispettivo è un periodo, non un documento. **Tolti insieme alla scrittura**, senza sostituirli: «rientra nel registro di agosto» sarebbe quasi tautologico, visto che ogni vendita evasa ci rientra per definizione. Un eventuale «Apri nel Registro Corrispettivi» è una funzione di navigazione nuova, da valutare a parte.

   Cosa **non** è caduto, e va saputo: `DocumentType.corrispettivo` resta nella configurazione — prefisso `COR`, etichetta, famiglia permessi. Solo la **numerazione** non è più consumata. Toglierlo è un lavoro a sé.

   ⚠️ E non chiude il difetto dell'aliquota media (`01` §3.12): la stessa ripartizione alimenta anche le righe della **Vendita online**, che restano. Spegne uno scrittore su due.

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
