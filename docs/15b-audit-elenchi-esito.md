# 15b · Audit elenchi, riepiloghi e griglie — l'esito

**Eseguito il 26-27/08/2026** su mandato di `docs/15`. Otto lenti di censimento,
**72 domande risposte, 232 voci censite**, tutte con file e simbolo.

⛔ **Nessuna modifica al codice.** Questo documento è il censimento e la proposta.

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
calcolano i totali di un documento e **danno risultati diversi**; nove punti decidono il
segno di resi e note di credito con almeno cinque regole; e in due elenchi la somma della
selezione **addiziona una nota di credito invece di sottrarla**.

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

### B1 · La somma della selezione addiziona le note di credito

```
document-list.component.ts:876-881   docs.reduce((s, d) => s + d.total.amountMinor, 0)
sales-order-list.component.ts:460-465   stesso codice, duplicato
```

L'elenco **Fatture** contiene per costruzione i tre tipi della famiglia, **Nota di credito
compresa** (`SALES_INVOICE_DOCUMENT_TYPES`). L'elenco **Vendite al banco** contiene Vendita
e Reso.

> Selezionando una fattura da **100 €** e una nota di credito da **30 €**, la barra dice
> **«Totale 130,00 €»** invece di **70,00 €**.

⚠️ E lo stesso difetto è nei **piedi degli export**: `sumMoney` in
`list-export.util.ts:49-54`, alimentato dai `footer: { kind: 'sumMoney' }` — quindi la
stessa somma cieca finisce in un CSV e in una pagina stampata.

⛔ La convenzione del progetto è **dichiarata**: gli importi si memorizzano positivi e
«il verso economico negativo lo dà il TIPO, non il segno» (`document-type.util.ts:28`).
Qui il tipo non viene guardato.

### B2 · Quattro motori dei totali documento, e non concordano

Misurato eseguendo le quattro funzioni: **su 19.901 prezzi lordi da 1 a 199 €, 3.589
divergono** — il 18,0% al 22%.

`computeManualOrderTotals` (Ordine cliente) ricava l'IVA da `Math.round(totalMinor × rate / 100)`,
cioè dal netto **già arrotondato** — la forma che `lineVatFromNetExact` dichiara superata
(«perdeva un centesimo ogni volta che l'imponibile portava una coda decimale»).

> 123,97 € digitato ivato → **Documenti 123,97 · Ordine cliente 123,96**

⚠️ E il **frontend** dell'Ordine cliente sta coi Documenti: schermo e database non dicono
la stessa cosa.

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

| Famiglia                | Viste                                                                                            | Perché è una famiglia a sé                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Elenchi documentali** | 13 rotte servite da `document-table` (9 profili) e `sales-order-table` (2), più Ordini fornitore | Le righe sono tutte **documenti**: numero, data, controparte, stato, totale. Condividono già motore, colonne e selezione                                                                                 |
| **Registri economici**  | **Corrispettivi soltanto**                                                                       | ⚠️ **Una vista sola.** La riga è un evento economico con id compositi (`sale:… / refund:… / store:…`) perché unisce più sorgenti — non è una riga documento, e la selezione non entra per quella ragione |
| **Movimenti**           | Movimenti di magazzino                                                                           | Eventi **fisici**: quantità, location, origine. Usa il motore, non ha stato documento né pagamento                                                                                                       |
| **Anagrafiche**         | Prodotti, Clienti, Fornitori                                                                     | ⭐ Il mandato non la nomina, ma **esiste**: 3 viste con tabella a mano, selettore Colonne condiviso e nessun motore                                                                                      |
| **Report/analisi**      | Report, Analytics, Giacenze, Situazione                                                          | Perimetri e formule proprie                                                                                                                                                                              |

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
   contratto del segno economico 9 punti, 5 regole
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

⛔ **Il pezzo mancante non è un componente: è il CONTRATTO DEL SEGNO.** Nove punti che
decidono se un reso sottrae, con cinque regole, sono la vera «duplicazione di regola» del
mandato §13 — e l'unica che produce numeri sbagliati sotto gli occhi dell'operatore.

## F · Piano proposto — ogni passo si ferma per approvazione

| #     | Passo                                   | Scopo                                                              | Rischio                                | Stop                                                                             |
| ----- | --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------- |
| **0** | **I difetti B1-B10**                    | Sono correzioni, non refactor. B1, B3 e B4 escono dall'azienda     | Basso, chirurgico                      | Dopo ognuno                                                                      |
| **1** | **Contratto del segno economico**       | Una funzione sola decide se un tipo sottrae. Chiude B1 alla radice | Medio: tocca 9 punti                   | Prima di applicarlo ai 9                                                         |
| **2** | **Un solo motore dei totali documento** | Chiude B2. `computeManualOrderTotals` adotta `lineVatFromNetExact` | ⚠️ **Alto**: cambia numeri già salvati | ⛔ **Decisione del proprietario**: i documenti storici si ricalcolano o restano? |
| **3** | **Un solo motore Periodo**              | Chiude B6                                                          | Medio: due semantiche da riconciliare  | Prima di scegliere quale vince                                                   |
| **4** | **Le 3 anagrafiche sul motore**         | Prodotti, Clienti, Fornitori. Chiude B5 e B7 per strada            | Medio: 3 tabelle riscritte             | Una per volta                                                                    |
| **5** | **`summary-grammar` alle anagrafiche**  | Uniforma l'aspetto senza toccare la logica                         | Basso, ma **si vede**                  | Verifica a schermo                                                               |
| **6** | **Componente shell + barra filtri**     | L'unico «costruire» del piano                                      | Alto: tocca 16 pagine                  | ⛔ Solo dopo i precedenti                                                        |

⚠️ **Il passo 2 non è un refactor: è una decisione di prodotto.** Cambiare il motore dei
totali cambia numeri che stanno già nel database.

## G · Non verificabile dal codice

- **§18.14**, la «minima architettura comune necessaria»: è una scelta, non una misura.
- **Quali dei 6 elenchi a mano** vadano migrati, in che ordine.
- **Se il Registro Corrispettivi debba adottare il motore**: `14` §H14 dichiara il rinvio
  con una ragione argomentata (la card mobile progettata, che non è il ripiego del motore).
  Non è una svista da correggere.
