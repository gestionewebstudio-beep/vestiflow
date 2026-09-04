# Ordine fornitore — la riga e la colonna del costo

_Consegna del 07/08/2026, aggiornata in corso d'opera con quello che il lavoro ha
trovato. Chi riprende parte da qui: non serve altro contesto._

## A cosa serve l'Ordine fornitore

È il documento con cui si **ordina merce al fornitore**. Eventualmente si porta in
**Arrivo merce** per caricarla.

**Non muove giacenze né disponibilità** — verificato: nessun percorso dell'Ordine
fornitore scrive movimenti, e il costo di riga non alimenta né il costo effettivo della
variante, né l'ultimo prezzo fornitore, né i margini. Quelli si alimentano tutti dalla
riga dell'**Arrivo merce**.

---

## Le tre regole da realizzare

### 1. La riga come quella dell'Ordine cliente

Deve avere **ricerca articolo, inserimento e creazione di un articolo nuovo al volo**,
come l'Ordine cliente. Si prende **tutto** quello che ha l'Ordine cliente e poi si decide
cosa nascondere dal tasto **Colonne** — invece di decidere in anticipo cosa togliere.

### 2. La regola di sovrascrittura

> Quando richiamo un articolo in una riga, **si resetta tutta la riga** e si prendono i
> dati dell'articolo. Dove l'articolo non ha un valore, il campo **torna vuoto**.

Non solo i campi dell'articolo: **tutto**. La quantità va a **1**, perché si sta
ordinando quell'articolo e almeno un pezzo lo si vuole. Il richiamo dell'articolo è la
fonte; quello che c'era prima era una bozza.

**Unica eccezione, il Codice IVA**: se l'articolo ne ha uno si prende quello, e **solo**
se l'articolo non ce l'ha si ripiega sul predefinito. Lasciare la riga senza IVA le
farebbe calcolare imposta zero in silenzio.

### 3. La colonna del costo — netto/ivato che **non perde mai**

Il giro deve tornare **sempre**: digito un costo ivato, passo a netto, torno a ivato →
rivedo lo **stesso** costo ivato. Se ordino direttamente in netto, il problema non si pone.

**Il costo nella riga è solo informazione**: non modifica il prezzo dell'articolo in
anagrafica. **Unica eccezione**: se da lì si **crea un articolo nuovo**, quel valore
_diventa_ il prezzo dell'articolo.

---

## ⚠️ Il difetto era peggio di come questa consegna lo descriveva

La consegna metteva in guardia dal copiare il selettore del **DDT vendita**, che converte
il valore **mostrato** (già arrotondato a due decimali) e quindi perde il centesimo.
La misura è confermata — riprodotta in modo indipendente durante il lavoro:

| Punto di partenza                                        | Giri che non tornano     |
| -------------------------------------------------------- | ------------------------ |
| **netto** (articolo richiamato): netto → ivato → netto   | **0 su 4901**            |
| **lordo** (costo digitato a mano): ivato → netto → ivato | **884 su 4901 — il 18%** |

_(Al 10% sono 446 su 4901, al 4% 188 su 4901: il difetto è dell'arrotondamento, non
dell'aliquota.)_

Ma l'Ordine fornitore **non convertiva affatto**. `selectCostMode()` cambiava il signal
della modalità e non toccava i campi:

```
digito 5,02 in «Costo ivato»   → campo: 5,02   (significa lordo)
passo a «Costo netto»          → campo: 5,02   (ora significa NETTO)
torno a «Costo ivato»          → campo: 5,02   ✓ ma per caso: nulla ha convertito
```

Il giro «tornava» solo perché nessuno lo percorreva. Il difetto vero era che lo switch
**reinterpretava il numero in silenzio**: stesso valore a schermo, documento diverso. Chi
salvava in modalità netta aveva appena ordinato al fornitore un costo più basso del 22%
senza vedere nulla cambiare.

## ✅ Come è stato fatto — il modello è la scheda articolo

La **sezione Listini della scheda articolo**
(`src/app/domain/products/components/product-general-step/product-general-step.component.ts`)
fa la cosa giusta ed è stata imitata:

- il **netto canonico** vive nella riga, nel controllo `unitCostNetMinor`, con la coda
  decimale — non in un signal per indice, che si disallineerebbe al primo riordino;
- il campo `unitCost` è **solo una vista**: `costFieldValue` rende, `netFromDisplayed`
  memorizza;
- il toggle cambia **solo la vista** (`redrawCostFields`, con `emitEvent: false`) — non
  ricalcola mai il canonico dal valore mostrato;
- in memorizzazione si usa lo scorporo **esatto** (`netFromGrossExact` +
  `toStorableMinor`), in visualizzazione quello **arrotondato** (`grossFromNetMinor`).

Al salvataggio parte il valore **esatto** nella modalità corrente, non i due decimali che
si leggono: mandare `502` arrotondato funzionerebbe finché non si passa a netto prima di
salvare, e lì si romperebbe di nuovo.

---

## Precondizione: la colonna deve poter conservare la coda — **fatto**

`SupplierOrderLine.unitCostMinor` e `enteredUnitCostMinor` erano **`Int`**. Ora sono
`Decimal(16,6)`, come `DocumentLine.unitPriceMinor`. `toStorableMinor` esiste anche lato
server, in `api/src/common/money.util.ts`, dove sta il resto della dottrina del denaro.

Migration: `20260807120000_supplier_order_line_decimals`.

Due trappole già incontrate, e non ripagate:

- **Nel mapper, la conversione `Number()` va DOPO il ripiego**:
  `Number(row.enteredUnitCostMinor ?? row.unitCostMinor)`. Convertire prima farebbe
  diventare **zero** un costo assente, perché `Number(null)` vale 0 e `0 ?? x` resta 0.
  C'è un test che lo dichiara.
- **Il motore IVA condiviso non si tocca**: lo usano anche Arrivo merce e Vendita al
  banco. `computeVatLineAmounts` continua a produrre imponibile e imposta di riga come
  prima; cambia solo da dove nasce `unitCostMinor`.

### Quello che la stima non aveva previsto

- **Lo sconto di riga era ancora intero.** La migration `20260804010000` portò
  `discount_percent` a `NUMERIC(7,4)` su `document_lines`, `documents` e `sales_orders` —
  e **saltò gli ordini fornitore**, che hanno una tabella propria. Sugli acquisti gli
  sconti a cascata dei fornitori sono la norma, quindi lì la colonna intera faceva lo
  stesso danno: «4+10%» salvato 14 invece di 13,6, e l'ordine registrato valeva meno di
  quello che l'operatore aveva letto. Allargata nella stessa migration.
- **Il prefill dell'anagrafica non aveva dove mettere codice articolo e u.m.**
  `ProductEmbeddedCreatePrefill` è cresciuto di due campi opzionali.

---

## Il codice fornitore è una chiave di ricerca

Cod. articolo, SKU, EAN e **Cod. fornitore** sono chiavi di ricerca **allo stesso modo**,
e **ovunque nel sistema** — non solo qui. Quando il fornitore manda il suo listino con i
suoi codici, quello è il codice che si ha sotto gli occhi mentre si ordina.

Non funzionava: `findVariantByCode` provava SKU, EAN e codice articolo, mai il codice
fornitore; e il ripiego lato client scartava tutto ciò che non fosse EAN o SKU esatto,
anche quando la ricerca l'aveva trovato. Corretto in `domain/`, quindi vale per ogni
maschera. Su codice articolo e codice fornitore si accetta **solo un risultato non
ambiguo**: fornitori diversi possono usare lo stesso codice per articoli diversi, e
indovinare è peggio che lasciare la scelta a chi sta ordinando.

Che il campo sia **scrivibile in anagrafica** è un'altra cosa e può aspettare: il codice
fornitore vive sul legame Fornitore↔Variante, non nella scheda articolo.

---

## Le colonne

| Colonna        |         | Default  | Nota                                    |
| -------------- | ------- | -------- | --------------------------------------- |
| Cod. articolo  | edit    | visibile | chiave di ricerca → anagrafica          |
| SKU            | edit    | visibile | chiave di ricerca → anagrafica          |
| EAN            | edit    | visibile | chiave di ricerca → anagrafica          |
| Cod. fornitore | edit    | visibile | chiave di ricerca; non va in anagrafica |
| Nome prodotto  | edit    | visibile | → anagrafica                            |
| Q.tà           | edit    | visibile | torna a 1 al richiamo articolo          |
| U.m.           | edit    | visibile | era sola lettura → anagrafica           |
| Q.tà giacenza  | lettura | nascosta |                                         |
| Q.tà disp.     | lettura | visibile | fa decidere quanto ordinare             |
| Costo          | edit    | visibile | netto canonico + selettore netto/ivato  |
| Sconto         | edit    | visibile | cascata: «4+10%» = 13,6%                |
| Costo scontato | lettura | visibile | nuova                                   |
| IVA            | edit    | visibile | codici acquisto                         |
| Totale         | lettura | visibile |                                         |
| Azioni         | —       | visibile |                                         |

**Fuori**: «Impegna magazzino» (l'ordine fornitore non incide sul magazzino), «Prezzo al
pubblico» e «Prezzo barrato» — su un ordine al fornitore la colonna che conta è il costo,
e avere accanto un altro numero monetario che significa l'opposto è un invito a
sbagliare, tanto più che il costo ha il selettore netto/ivato e il prezzo no. Se servono
si inseriscono nel pannello anagrafica quando si crea l'articolo.

I campi identità **non sono informativi**: quando l'articolo esiste mostrano un dato,
quando lo si sta creando **sono** il dato che finirà in anagrafica.

---

## Il test che dichiara la regola

> Un costo digitato in modalità ivata, salvato e riletto, **torna identico** — su un
> elenco di casi, non sul solo 5,02.

È nato **rosso**, come doveva: 4 casi su 8 falliti, esattamente i quattro che la misura
indipendente aveva previsto, ciascuno sbagliato di **un centesimo** (502→501, 4999→5000).
Gli altri quattro passavano già. Vive in `api/src/supplier-orders/supplier-orders.service.spec.ts`.

Sul frontend la guardia gemella è in `supplier-order-form.component.spec.ts`: il giro
ivato → netto → ivato rimette lo stesso costo, e il salvataggio manda il valore esatto.

---

## Cosa resta da fare

- **Le celle di riga**: le tre celle codice + quella del nome prodotto
  (`app-document-line-code-cell`, `app-document-line-product-cell`, già in `domain/`),
  l'autocomplete sul nome, il lookup alla conferma, la navigazione da tastiera. Oggi
  l'articolo si sceglie ancora dalla tendina.
- ✅ **La card mobile** — fatta il 24/08/2026, ma **non** come diceva questa voce.
  ⛔ Qui c'era «gemella di quelle di arrivo merce e ordine cliente — che restano tre
  componenti separati di proposito»: tre involucri di feature erano al mobile quello che
  le `<td>` scritte a mano erano al desktop. `supplier-order-line-card` è cancellato, e
  la maschera monta guscio, striscia e corpo COMUNI
  (`app-document-line-card` + `-strip` + `-body`), guidati dal catalogo colonne come la
  riga di scrivania.
- **`prisma generate` + typecheck backend**: non eseguiti perché il watcher dell'API
  teneva bloccato il query engine.

## Fuori ambito

- L'**Arrivo merce** ha ancora Prezzo di vendita e Prezzo barrato accanto al Costo, con
  il selettore netto/ivato solo sul costo: la stessa trappola tolta di qui.
- Il **DDT vendita** e l'**Ordine cliente**, che perdono il centesimo sui prezzi digitati
  a mano per lo stesso motivo.

---

# Il blocco dei documenti — lavoro nato da qui, non ancora finito

Sistemando l'Ordine fornitore è emerso che era **l'unico documento del gestionale che si
riapriva direttamente in scrittura**. Da lì è partita l'unificazione del blocco, che vale
per tutte le maschere e non solo per questa.

## La decisione dell'08/2026 — si blocca sempre dopo il salvataggio

> **Si salva → il documento si blocca → si resta dentro.** Se si vuole continuare, si
> sblocca.

Vale **ovunque**, senza eccezioni per tipo documento. La ragione non è il rischio
contabile: è che meglio un gesto in più che una schermata salvata e lasciata aperta a
chiunque passi.

**Questo supera §10.7 sul punto.** Quella specifica dice che l'Arrivo merce «salva e resta
nella maschera, si esce solo con Chiudi»: resta vero che si resta nella maschera — cambia
che i campi tornano protetti.

Non è un dettaglio di implementazione, è una regola di prodotto: chi trova §10.7 e il
codice in disaccordo deve sapere quale delle due è più recente.

## Perché unificare, e non aggiungere una quarta copia

Il meccanismo era scritto **tre volte** con tre comportamenti diversi. È lo stesso
problema che ha fatto perdere una giornata sui prezzi: la stessa decisione in più punti,
che prima o poi diverge. Ed era già divergente.

## Fatto

- **`DocumentEditLockService`** — l'estrazione **esisteva già**, ma stava in `shared/` e la
  usavano solo DDT vendita, trasferimenti e operazioni di magazzino. Spostato in
  `domain/documents/services/`: conosce «confermato» e «bozza», quindi è dominio.
- **Via il ramo bozza** da `syncOnLoad`: era «non confermato → sempre sbloccato», ed era
  proprio la complicazione che faceva divergere le maschere. Le bozze non esistono come
  documenti che si riaprono — nel database sono **zero su 90**, lo stato è transitorio
  dentro la creazione. Chi chiama gatea già sul proprio `isConfirmedEdit()`.
- **`relock()`**, il verbo che mancava: il documento torna protetto subito, senza
  aspettare l'uscita.
- **Ordine fornitore** e **Arrivo merce** adottano il servizio.

### Due difetti trovati strada facendo

- **L'adozione dello sblocco.** `syncOnLoad` trovava l'id nel set di sessione e sbloccava
  ma **non lo adottava**: nessuna istanza rispondeva più del rilascio, l'id restava nel set
  per sempre, e da lì in poi quel documento non si riapriva **mai più** protetto. Il blocco
  funzionava una volta sola. È la riga che si perde migrando — l'Arrivo merce ce l'aveva,
  l'estrazione condivisa no.
- **`track line`** su una `FormArray` svuotata e ricostruita a ogni caricamento: Angular
  tracciava per **identità**, vedeva ogni volta una collezione nuova e rispondeva NG0956
  distruggendo l'intera tabella. Sull'Ordine fornitore corretto con `track $index`.

## Il passo 5, l'Ordine cliente — fatto

Era il più delicato dei tre, perché la maschera **non usava il servizio**: aveva ancora la
sua copia con `SESSION_UNLOCKED_ORDER_IDS`, ed è per questo che funzionava mentre le altre
no. Ora la copia non c'è più.

1. **Adotta il servizio** e **si riblocca al salvataggio**, come le altre cinque maschere.
2. **DDT vendita e Vendita manuale si aprono protetti.** Quella maschera ospita quattro
   tipi documento e il blocco era stato scritto per uno solo: gli altri due avevano preso
   `editUnlocked = true` come ripiego. Era un residuo, non una scelta, e la decisione
   dell'08/2026 non fa eccezioni per tipo documento.
3. **Il divieto sugli ordini da canale esterno è rimasto un divieto**, ma ha smesso di
   essere un errore tecnico. La decisione di trasformarlo in avviso è stata **rovesciata
   dalle verifiche**: vedi `ORDINI-CANALE-ESTERNO.md`, che è la consegna di quel pezzo.

Un difetto trovato strada facendo, dentro il perimetro: **il `<fieldset disabled>` ferma i
controlli del form, non il drag & drop**. Su un documento protetto le righe si riordinavano
ancora, e siccome `markFormDirty()` gatea su `formReadOnly()` il riordino non accendeva
nemmeno «Modifiche non salvate» — restava una modifica invisibile in attesa che qualcuno
sbloccasse e salvasse per un altro motivo. Chiuso nel template (`cdkDropListDisabled`) **e**
nell'handler, perché un binding si perde in un refactor senza che niente diventi rosso.

I dettagli con i numeri di riga stanno nei messaggi di commit da `4fd3d16` a `1574117`.

---

# Da discutere: l'ordine delle righe (e il `track`, che ne è una conseguenza)

**Non c'entra con il blocco.** È finito nella stessa conversazione solo perché l'ho
incontrato lavorando sulla stessa maschera.

## La regola, decisa l'08/2026

> Se l'operatore **sposta** una riga, l'ordine è il suo. Deve **restare** dopo salvataggio
> e riapertura — non si torna a come le righe erano nate.
>
> Il riordino va **previsto su tutti i documenti**, non solo dove c'è già.

I modi di riordinare sono **due**, e fanno la **stessa cosa**:

- **trascinamento** di una riga;
- **ordinamento per colonna** (clic sull'intestazione).

Entrambi **riscrivono l'ordine del documento**, in modo definitivo: si salva così, si
stampa così. Non esiste un «ordinare solo per guardare» — è il modello di Danea, e la
ragione è che due significati diversi per lo stesso gesto si confondono: sposti una riga a
mano, poi clicchi su una colonna per controllare qualcosa, e non sai più se hai perso il
lavoro fatto.

**L'avviso** compare al **primo ordinamento per colonna**, perché è quello che ribalta
tutto in un colpo e non si annulla. Sul trascinamento di una riga singola **non serve**: è
un gesto evidente, e chi lo fa sa cosa sta facendo.

Lo svantaggio accettato: non si può più «dare un'occhiata ordinata» senza cambiare il
documento. Per guardare ci sono i totali e la ricerca.

## Cosa c'è già — verificato

**L'Ordine cliente lo fa già, e per intero.** È la maschera di riferimento, non un
abbozzo — il giro è completo:

- trascinamento con `cdkDrag`, maniglia sul numero di riga (`onLineDrop`);
- al salvataggio la posizione viene scritta: `lineNumber: index + 1`, cioè **dall'indice a
  schermo**, non dall'ordine di creazione;
- in lettura il server ordina: `lines: { orderBy: { lineNumber: 'asc' } }`.

Quindi sposti, salvi, riapri, e le righe sono dove le hai messe. Chi implementa gli altri
documenti **copia questo**, non inventa.

> ⚠️ **Fotografia superata dall'11/08/2026.** Quello che segue descriveva lo
> stato prima del lavoro sulle righe documento. Oggi:
>
> - **l'ordinamento per colonna c'è su nove tipi documento su dieci** (manca la
>   sola Rettifica inventario, in attesa che si decidano le sue colonne), con
>   l'avviso al primo ordinamento — una volta per sessione di lavoro sul
>   documento, mai persistito;
> - **il trascinamento c'è su tutte le maschere righe**, con la maniglia sulla
>   cella del numero riga;
> - **`SupplierOrderLine.lineNumber` esiste** (migration scritta a mano
>   l'11/08/2026, con backfill per posizione) e le quattro letture dell'API
>   ordinano per quella colonna: l'ordine non è più «giusto per fortuna».
>
> Il testo qui sotto, e la tabella «Cosa manca, per documento», restano come
> fotografia di partenza. **Non sono più lo stato del codice.**

**Nessun documento ordina le righe per colonna.** Zero: quella metà della regola è tutta
da fare, ovunque.

**L'Ordine fornitore non ha niente**: né trascinamento, né colonna di posizione
(`SupplierOrderLine` non ce l'ha), né `orderBy` in lettura — le righe si leggono con
`include: { lines: true }` e basta. L'ordine che si vede è quello di inserimento restituito
da Postgres: una convenzione, non una garanzia. **Torna giusto per fortuna, non per
progetto.**

## Cosa manca, per documento

| Documento                                      | Trascina | Posizione salvata                          | Ordina per colonna |
| ---------------------------------------------- | -------- | ------------------------------------------ | ------------------ |
| **Ordine cliente**                             | sì       | sì (`lineNumber`)                          | no                 |
| DDT vendita, Preventivo, Scarico, Arrivo merce | no       | la colonna c'è (`DocumentLine.lineNumber`) | no                 |
| **Ordine fornitore**                           | no       | **no, manca la colonna**                   | no                 |

Quindi il lavoro si divide in tre pezzi di taglia molto diversa:

1. **Documenti che passano da `DocumentLine`**: la colonna c'è già e la lettura è già
   ordinata. Manca solo il trascinamento nella maschera — è riuso del pattern esistente.
2. **Ordine fornitore**: serve una migration per la colonna di posizione, la scrittura al
   salvataggio e l'`orderBy` in lettura, **prima** di poter parlare di trascinamento.
3. **Ordinamento per colonna**: da fare ovunque, e con l'avviso al primo uso. È il pezzo
   nuovo, quello senza nessun precedente da copiare.

## Il `track`, che dipende da tutto questo

Le righe sono una `FormArray` svuotata e ricostruita a ogni caricamento
(`lines.clear()` più push). Il template la scorre con `track line`, cioè per **identità
dell'oggetto**: dopo la ricostruzione gli oggetti sono altri, Angular vede una collezione
nuova e ricrea l'intera tabella — è NG0956. È un **avviso**, non un errore: non rompe
niente e il costo (DOM rifatto) è invisibile all'operatore. Ma può coprire avvisi veri, ed
è così che si è manifestato la prima volta.

**Una correzione da mettere in conto**: sull'Ordine fornitore ho risolto con
`track $index`, ragionando che quelle righe non si riordinano. **Con il riordino previsto
ovunque, quella scelta ha una scadenza**: il giorno in cui l'Ordine fornitore trascina le
righe, tracciare per posizione diventa la cosa sbagliata. Non è rotta oggi, ma va rifatta
insieme a questo lavoro, non dimenticata lì.

La risposta giusta a valle di tutto è probabilmente tracciare per **identità stabile della
riga**, che è quello che la colonna di posizione e gli `id` insieme rendono possibile. Ma
prima vanno decise le due domande che potrebbero far sparire il problema invece di curarlo:

- Serve davvero **ricostruire** la `FormArray` a ogni caricamento, o basta aggiornare i
  controlli esistenti? Se non la si ricostruisse, la domanda sul `track` non si porrebbe.
- Le righe **nuove** — quelle non ancora salvate — con quale identità le si traccia? Le
  salvate hanno un `id`, le altre no.
