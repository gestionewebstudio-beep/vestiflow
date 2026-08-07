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
- **La card mobile** (`supplier-order-line-card`), gemella di quelle di arrivo merce e
  ordine cliente — che restano tre componenti separati di proposito.
- **`prisma generate` + typecheck backend**: non eseguiti perché il watcher dell'API
  teneva bloccato il query engine.

## Fuori ambito

- L'**Arrivo merce** ha ancora Prezzo al pubblico e Prezzo barrato accanto al Costo, con
  il selettore netto/ivato solo sul costo: la stessa trappola tolta di qui.
- Il **DDT vendita** e l'**Ordine cliente**, che perdono il centesimo sui prezzi digitati
  a mano per lo stesso motivo.
