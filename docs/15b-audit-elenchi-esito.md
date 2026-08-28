# 15b · Audit elenchi, riepiloghi e griglie — l'esito

**Versione:** 1.1  
**Eseguito il 26-27/08/2026; fan-out B1 completato e riverificato il 28/08/2026.**  
Otto lenti di censimento, **72 domande risposte, 232 voci censite**, tutte con file e simbolo.

⛔ **Nessuna modifica al codice.** Questo documento è il censimento tecnico e la proposta. La specifica normativa del segno è `docs/15c-contratto-segno-economico-riepiloghi.md`.

---

## A · Sintesi esecutiva

⭐ **Il mandato presumeva di dover costruire; il codice dice di dover ADOTTARE.**
`docs/15` §3 disegna «shell comune» e «motore griglia comune» come cose da fare. Il motore
**esiste ed è scritto meglio di come il mandato lo descrive**: `DataTableComponent` con
sezioni, ordinamento a più chiavi, resize e selezione, più una direttiva di resize unica,
un servizio di preferenze server+locale, un contratto di ordinamento serializzabile e tre
guardie di lint che lo sorvegliano.

⚠️ **La diffusione dei due livelli è ROVESCIATA** rispetto all'attesa: la grammatica
**visiva** delle tabelle è condivisa da ~15 componenti, il motore di **comportamento** da 4.
Le pagine hanno preso l'aspetto e lasciato la logica.

⛔ **Ma il rilievo grave non è la duplicazione: sono i NUMERI SBAGLIATI.** Quattro motori
calcolano i totali di un documento e **danno risultati diversi**. Sul segno economico,
il fan-out finale ha ristretto il difetto attivo a due profili misti dello stesso elenco
documentale — Fatture e Vendite al banco — più due codifiche già corrette ma separate
all'interno dei Corrispettivi. La somma della selezione e i footer di CSV/stampa
**addizionano Nota di credito e Reso invece di sottrarli**.

## Le quindici domande del §18, con la risposta misurata

| #   | Domanda                        | Risposta                                                                                                                                                                        |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | shell/list layout equivalenti  | **1 condiviso** (`list-page` mixin, 16 consumer) + **6 fatti in casa**. ⚠️ È SCSS, non un componente: il markup si riscrive ogni volta                                          |
| 2   | motori di griglia              | **2 veri** (`DataTableComponent` 4 consumer/13 rotte; motore righe documento 7 consumer) + **45 file con `<table>` a mano**                                                     |
| 3   | sistemi Colonne                | **1 solo**, con registro esaustivo (28 `TableViewId`) e 2 guardie. ⚠️ 3 elenchi vivi restano fuori dal registro                                                                 |
| 4   | sistemi di sorting             | **4 superfici UI · 3 forme di stato · 1 comparatore · 3 whitelist server**                                                                                                      |
| 5   | resize colonne                 | **Esiste, 1 sola implementazione** condivisa (`TableColumnResizeDirective`)                                                                                                     |
| 6   | persistenza preferenze         | **1 sola**, server + `localStorage` in write-through, per **utente × tenant × vista**. ⚠️ Le larghezze si salvano in locale e **si perdono**; l'ordinamento non si persiste mai |
| 7   | filter bar equivalenti         | **Nessun componente condiviso**; 4 implementazioni CSS                                                                                                                          |
| 8   | motori Periodo                 | **3**, e due usano **le stesse stringhe con semantica diversa** (ora locale vs UTC)                                                                                             |
| 9   | summary/footer                 | **13 blocchi**, di cui **2 componenti condivisi**                                                                                                                               |
| 10  | motori economici equivalenti   | **4** per i totali documento + 1 frontend + 3 perimetri separati                                                                                                                |
| 11  | export che ricalcolano         | **2 su 22** ricalcolano economia, 3 ordinano diversamente dallo schermo                                                                                                         |
| 12  | differenze davvero di dominio  | **4**, e reggono la prova del codice                                                                                                                                            |
| 13  | comuni ma aggirati             | **3 casi**, uno dei quali con rinvio argomentato                                                                                                                                |
| 14  | minima architettura comune     | ⛔ **non verificabile dal codice** — è una decisione di prodotto                                                                                                                |
| 15  | refactor a rischio trasversale | vedi §G                                                                                                                                                                         |

---

## B · ⛔ I difetti che producono numeri sbagliati

Questi **non sono duplicazione da rifattorizzare**: sono errori che l'operatore vede o che
escono dall'azienda. Vanno separati dal resto del piano.

### B1 · La somma della selezione addiziona Note di credito e Resi

**Rettifica dopo fan-out completo del 28/08/2026.**

Il difetto attivo è nel `DocumentListComponent`, su due profili che mescolano tipi di verso opposto:

```text
Registro Fatture
  Invoice + InvoiceAccompanying + CreditNote

Registro Vendite al banco
  StoreSale + StoreReturn
```

Il totale della selezione somma i valori persistiti positivi senza guardare il tipo:

```text
document-list.component.ts
  docs.reduce((sum, doc) => sum + doc.total.amountMinor, 0)
```

Casi reali:

```text
Fattura 100 + Nota di credito 30 → 130,00   atteso 70,00
Vendita 100 + Reso 30            → 130,00   atteso 70,00
```

⭐ **Il Reso al banco persiste positivo.** Verificato in `store-sales.service.ts`: il totale
documento è la somma positiva dei totali lordi delle righe. Il difetto è quindi
nell'aggregazione, non nella persistenza.

### B1.1 Export e stampa

Lo stesso difetto arriva ai footer di CSV e stampa.

- `list-export.util.ts` contiene la primitiva `sumMoney`;
- `document-list-export.util.ts` le passa accessori monetari che restituiscono
  `doc.total`, `doc.subtotal` e `doc.tax` senza applicare il tipo;
- Fatture e Vendite al banco cadono entrambe sulla configurazione di ripiego
  `GOODS_RECEIPT_LIST_EXPORT`.

Un solo punto di configurazione documentale copre quindi i due registri misti.

### B1.2 Ordini cliente: non affetti oggi

`sales-order-list.component.ts` contiene una somma analoga, ma l'elenco non mescola oggi
record di verso opposto:

- `SalesOrder` non ha un tipo Reso/Rimborso autonomo;
- il rimborso è uno stato/evento associato;
- la regola normativa vieta di usare lo stato come fonte del verso.

La somma è fragile per un'eventuale evoluzione futura, ma non produce oggi il caso B1 e
non va modificata nella correzione chirurgica.

### B1.3 Due motori di export

`sales-order-list-export.util.ts` è un secondo motore indipendente:

- non importa `list-export.util.ts`;
- possiede `sumTotals`, serializzazione CSV e HTML propri.

È una divergenza architetturale misurata, ma non un consumer affetto oggi dal segno misto.

### B1.4 Excel e altri elenchi

Non sono affetti oggi:

- Excel Ordini fornitore;
- Excel Corrispettivi;
- Ordini fornitore;
- Movimenti.

Nessuno di questi aggrega nello stesso elenco tipi locali di verso opposto.

### B1.5 Corrispettivi: risultato corretto, due codifiche

Il Registro Corrispettivi esprime già correttamente il verso, ma in due modi:

1. righe del registro:
   - la proiezione API nega gli importi di Resi/Rimborsi;

2. riepilogo:
   - legge valori persistiti positivi e sottrae il totale delle rettifiche nella formula.

Le due implementazioni producono oggi lo stesso risultato e non ricalcolano prezzi, sconti
o IVA. Non devono ricevere la funzione dei documenti locali durante la correzione B1,
altrimenti si produce un doppio segno.

### B1.6 Causa radice finale

La convenzione è dichiarata nel modello:

> quantità e importi restano positivi; il verso economico negativo lo dà il tipo.

Ma non esiste una funzione del dominio documentale che la renda eseguibile.

Il punto comune minimo è una funzione pura:

```text
documentEconomicSign(documentType) → +1 | -1
```

applicata ai valori persistiti dai soli consumer documentali affetti.

### B2 · Quattro motori dei totali documento — ma la divergenza è LATENTE

⛔ **Questa voce sovrastimava, ed è stato corretto il 27/08/2026 leggendo il codice per
intero invece della sola formula.** Diceva «su 19.901 prezzi 3.589 divergono»: vero della
formula isolata, **falso dello stato reale**.

`computeManualOrderTotals` ha **due rami**, e l’audit ne aveva misurato uno solo:

```text
sconto documento = 0   →  taxMinor = somma di line.lineVatTotalMinor      ✅ SOMMA
sconto documento > 0   →  ripartisce e ricalcola dal netto arrotondato    ⛔ ricalcola
```

⭐ **Nel ramo senza sconto documento fa già esattamente ciò che la regola prescrive:
somma i valori finali delle righe.** La divergenza può scattare solo col secondo ramo.

### ⭐ E i dati storici sono ZERO — misurato sul database il 27/08/2026

```sql
select count(*) filter (where coalesce(document_discount_percent,0) > 0) from sales_orders
→ 0   su 39 ordini
```

**Nessun ordine cliente ha uno sconto documento.** Il difetto è quindi **reale ma mai
scattato**: non esiste un solo record da correggere, e la domanda «si riscrive lo storico
o si lascia?» **non si pone**.

⚠️ Resta da correggere il ramo con sconto, che è **avanti**, non indietro. E il ramo va
guardato con attenzione: ripartire uno sconto di testata sulle aliquote non è «sommare»,
è un calcolo genuinamente necessario — il punto è che deve usare la forma esatta.

### B3 · L'export corrispettivi valorizza al listino di OGGI

```
inventory-export.service.ts:148-150
  const unitMinor = Number(movement.variant.sellingPriceMinor);
  const signedAmountMinor = (isReturn ? -1 : 1) * unitMinor * movement.quantity;
```

Ricalcola `quantità × prezzo` invece di sommare uno snapshot **che esiste** —
`DocumentLine.lineTotalMinor`, raggiungibile da `movement.sourceLineId`.

> **Chi ritocca un prezzo cambia il corrispettivo di un mese chiuso.**

### B4 · Il CSV Vendite scavalca lo scope sede

`SalesOrdersService.list` restringe gli ordini manuali alle sedi dell'utente, con la ragione
scritta: _«un commesso di una sede non legge gli ordini manuali delle altre»_.
`SalesOrdersController.exportCsv` **non dichiara `@CurrentUser()`** e il servizio di export
non accetta `user`: il CSV contiene gli ordini manuali di **tutte** le sedi.

⚠️ Mitigazione parziale: servono i permessi `SectionSales` + view + `ReportsExport`.

### B5 · L'ordinamento dell'elenco Prodotti è INERTE

L'intestazione è cliccabile, ma il client **scarta `sort`/`order`** prima di chiamare l'API.
Si preme e non succede niente.

### B6 · Due motori Periodo con le stesse stringhe e semantica diversa

`resolveMovementPeriodRange` calcola in **ora locale**; `resolveReportDateRange` in **UTC**.
`sales-order-list.component.ts` **li usa tutti e due nello stesso file**.

### B7 · La regola Shopify sulle colonne è violata sull'elenco Prodotti

Il pattern giusto esiste ed è applicato altrove (`goods-receipt-form.component.ts:1374-1383`,
col commento che cita la regola). L'elenco Prodotti non lo applica.

### B8 · Tre export ordinano diversamente dallo schermo

Vendite CSV, Ordini fornitore Excel, Prodotti CSV hanno l'`orderBy` **cablato**. Sugli
Ordini fornitore è peggio: il DTO estende quello della lista, quindi `sort` **arriva e viene
buttato**.

### B9 · Codice morto nel motore

`appRowCard` e `rowClickableWhen`: **zero consumatori**. Il commento di `rowClickableWhen`
cita un consumatore che non esiste (il Registro non usa il motore). `page-header` in
`_responsive-table.scss`: 0 `@include`.

### B10 · Un link morto in pagina Report

«Apri registro corrispettivi commercialista →» punta a `/app/reports/corrispettivi`, rotta
tolta il 25/08: il catch-all lo assorbe e atterra sulla Dashboard.

---

## C · Le famiglie reali, misurate

⛔ **Non si inventano famiglie senza consumer.** Queste hanno tutte più di una vista, tranne
dove dichiarato.

| Famiglia                | Viste                                                                                                                                  | Perché è una famiglia a sé                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Elenchi documentali** | 13 rotte servite da `document-table` (9 profili) e `sales-order-table` (2), più Ordini fornitore e **Registrazione fattura fornitore** | Le righe sono tutte **documenti**: numero, data, controparte, stato, totale. Condividono già motore, colonne e selezione                                                                                 |
| **Registri economici**  | **Corrispettivi soltanto**                                                                                                             | ⚠️ **Una vista sola.** La riga è un evento economico con id compositi (`sale:… / refund:… / store:…`) perché unisce più sorgenti — non è una riga documento, e la selezione non entra per quella ragione |
| **Movimenti**           | Movimenti di magazzino                                                                                                                 | Eventi **fisici**: quantità, location, origine. Usa il motore, non ha stato documento né pagamento                                                                                                       |
| **Anagrafiche**         | Prodotti, Clienti, Fornitori                                                                                                           | ⭐ Il mandato non la nomina, ma **esiste**: 3 viste con tabella a mano, selettore Colonne condiviso e nessun motore                                                                                      |
| **Report/analisi**      | Report, Analytics, Giacenze, Situazione                                                                                                | Perimetri e formule proprie                                                                                                                                                                              |

⚠️ **`/app/inventory/lookup` non è un elenco**: è una ricerca a risultato singolo con
scanner. Non entra in nessuna famiglia.

## D · Cosa esiste già, e cosa manca davvero

```text
✅ ESISTE E FUNZIONA — va solo ADOTTATO da chi non lo usa
   DataTableComponent            motore: colonne, sezioni, selezione, sort multi-chiave
   TableColumnResizeDirective    resize, unica implementazione dell'app
   TableColumnPreferenceService  preferenze server + locale, per utente × tenant × vista
   TableColumnPickerComponent    il comando «Colonne», 16 consumer
   DataTableSort[] + sortByKeys  contratto di ordinamento e comparatore unici
   _list-page · _responsive-table  la grammatica visiva, ~15 consumer
   3 guardie di lint             check:table-views · check:sort-columns · check:column-handles

⚠️ ESISTE MA È INCOMPLETO
   larghezze colonne             il modello le prevede, si salvano in locale e si perdono
   ordinamento persistito        non si salva mai
   summary-grammar               1 solo consumatore su ~15 tabelle che potrebbero

⛔ NON ESISTE, e il mandato ha ragione
   componente shell di elenco    c'è il mixin SCSS, non il markup
   componente barra filtri       4 implementazioni CSS, nessun componente
   motore Periodo unico          3 motori, due incompatibili
   contratto del segno economico assente nei registri documentali misti;
   Corrispettivi usa già due codifiche interne coerenti
```

## E · Architettura proposta

```text
                    INFRASTRUTTURA COMUNE — c'è già
     DataTableComponent · ColumnPicker · ResizeDirective
     PreferenceService · DataTableSort · summary-grammar
                              ↓
                 CONTRATTI PER FAMIGLIA — da scrivere
   documenti          registri economici        movimenti        anagrafiche
   riga documento     evento economico          evento fisico    entità
   stato · totale     segno · perimetro         quantità · loc.  attivo/no
                              ↓
                  CONFIGURAZIONE VISTA — c'è già
        *-columns.config.ts · filtri · azioni · metriche
```

⛔ **Il pezzo mancante non è un componente: è il CONTRATTO DEL SEGNO.** Nei due profili
documentali misti manca una funzione che trasformi il tipo in direzione economica;
nei Corrispettivi la stessa regola è già codificata in due punti diversi. È questa la
duplicazione di regola che produce oggi numeri sbagliati sotto gli occhi dell'operatore.

## F · Piano proposto — ogni passo si ferma per approvazione

> **Rettifica B1:** il primo intervento sul segno non tocca nove punti generici. Tocca la selezione del `DocumentListComponent`, gli accessori monetari dell'export documentale e i relativi test. Ordini cliente e Corrispettivi restano fuori.

| #     | Passo                                   | Scopo                                                              | Rischio                                                             | Stop                                                                             |
| ----- | --------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **0** | **I difetti B1-B10**                    | Sono correzioni, non refactor. B1, B3 e B4 escono dall'azienda     | Basso, chirurgico                                                   | Dopo ognuno                                                                      |
| **1** | **Contratto del segno economico**       | Una funzione documentale decide il verso. Chiude B1 alla radice    | Basso/medio: selezione + accessori CSV/stampa dei due profili misti | Stop prima di estenderla a consumer non affetti o ai Corrispettivi               |
| **2** | **Un solo motore dei totali documento** | Chiude B2. `computeManualOrderTotals` adotta `lineVatFromNetExact` | ⚠️ **Alto**: cambia numeri già salvati                              | ⛔ **Decisione del proprietario**: i documenti storici si ricalcolano o restano? |
| **3** | **Un solo motore Periodo**              | Chiude B6                                                          | Medio: due semantiche da riconciliare                               | Prima di scegliere quale vince                                                   |
| **4** | **Le 3 anagrafiche sul motore**         | Prodotti, Clienti, Fornitori. Chiude B5 e B7 per strada            | Medio: 3 tabelle riscritte                                          | Una per volta                                                                    |
| **5** | **`summary-grammar` alle anagrafiche**  | Uniforma l'aspetto senza toccare la logica                         | Basso, ma **si vede**                                               | Verifica a schermo                                                               |
| **6** | **Componente shell + barra filtri**     | L'unico «costruire» del piano                                      | Alto: tocca 16 pagine                                               | ⛔ Solo dopo i precedenti                                                        |

⚠️ **Il passo 2 non è un refactor: è una decisione di prodotto.** Cambiare il motore dei
totali cambia numeri che stanno già nel database.

## G · Non verificabile dal codice

- **§18.14**, la «minima architettura comune necessaria»: è una scelta, non una misura.
- **Quali dei 6 elenchi a mano** vadano migrati, in che ordine.
- **Se il Registro Corrispettivi debba adottare il motore**: `14` §H14 dichiara il rinvio
  con una ragione argomentata (la card mobile progettata, che non è il ripiego del motore).
  Non è una svista da correggere.

---

## H · La Registrazione fattura fornitore — dove sta, e dove NON sta

**Decisione del proprietario, 27/08/2026.**

> **Va nella famiglia degli ELENCHI DOCUMENTALI**, non fra i registri economici.

È un **documento economico e di controllo**, e ha una numerazione interna VestiFlow: Data
registrazione + Serie + Numero, oltre a N. fattura + Data fattura del documento **ricevuto**
dal fornitore. Sono due identità distinte sullo stesso record.

⭐ **Ma «stessa famiglia» non significa «stesse colonne».** Riusa shell, motore griglia,
Colonne, ordinamento, resize, preferenze e i comportamenti comuni dei documenti — e
**configura le proprie**:

```text
Data registrazione · Numero registrazione · Fornitore
N. fattura fornitore · Data fattura · Totale
Tipo pagamento · Stato pagamento/saldo se pertinente
```

⛔ **Niente Location**: la specifica corrente stabilisce che la Registrazione fattura
fornitore non ce l’ha.

### ⭐ E compare due volte, senza che sia duplicazione

È l’esempio migliore di cosa va condiviso e cosa **non va fuso**:

```text
ELENCO DOCUMENTI                    REGISTRO PAGAMENTI / TESORERIA
Registrazione fattura #RF-001       Scadenza 1.000 € verso Fornitore X
→ apro / modifico il DOCUMENTO         origine: RF-001
                                    → gestisco debito e pagamento
```

⚠️ **Nel Registro Pagamenti non si sta guardando il documento in quanto documento**: si sta
guardando la **posizione finanziaria derivata** da esso. Stesso record, due prospettive di
dominio diverse — e sono entrambe legittime.

⛔ Fonderle produrrebbe una vista che non serve bene né all’una né all’altra: è esattamente
il rischio che il mandato §1 chiama «un riepilogo universale che fonde semantiche diverse».
