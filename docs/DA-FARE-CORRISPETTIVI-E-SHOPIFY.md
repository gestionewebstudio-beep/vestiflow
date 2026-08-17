# Cosa resta da fare — corrispettivi, resi e sincronizzazione Shopify

**Aggiornato:** 15/08/2026, notte
**Ramo:** `numerazione-documento-2` (si continua su questo; contiene tutto `develop` + 33 commit — non `main`, che è 205 commit più indietro e gira la produzione)
**A che serve:** riprendere il lavoro in un'altra sessione **senza ricostruire niente**. Ogni voce dice cosa è già misurato, cosa è deciso e cosa no.

---

## ⚠️ Leggere prima: la specifica del Registro è cambiata il 16/08/2026

Esiste ora **`10-specifica-registro-corrispettivi.md`**, ed è la fonte corrente. Tre cose
che questo file dava per assodate non lo sono più:

1. **Nessun flusso «commercialista».** Consegne, invii e registrazioni sono stati
   rimossi — codice, UI e persistenza. Periodo → filtri → stampa/export → fine.
2. **Shopify POS compare nel Registro** come vendita fisica/POS. Non si esclude: si
   classifica, e la classificazione viene da `source`.
3. **`SalesOrderFiscalStatus` non esiste più**, colonna e tipo PostgreSQL. Non è stato
   sostituito.

E una che era scritta qui e altrove ed era falsa: **`CorrispettivoEntry` non è la sorgente
del Registro** — quella tabella non viene più scritta dall'11/08, e le sue righe residue
sono storia. Non ci si deduce la logica nuova (`10` §7).

---

## Prima di toccare qualsiasi cosa: tre fatti che cambiano come si legge tutto

### 1. I webhook di Shopify vanno in PRODUZIONE, non sulla macchina di sviluppo

Le sette sottoscrizioni puntano a `https://vestiflow-production.up.railway.app`, che gira **`main`**, sullo **stesso database** di sviluppo.

| Chi provoca il fatto                         | Chi lo esegue       | Con quale codice |
| -------------------------------------------- | ------------------- | ---------------- |
| un gesto su Shopify (ordine, evasione, reso) | ambiente pubblicato | `main`           |
| un pulsante nell'app locale                  | API sulla macchina  | il ramo corrente |

**Conseguenza pratica**: una correzione su questo ramo non entra in gioco finché qualcuno non preme un pulsante. Chi guarda il database vede il risultato della produzione e rischia di attribuirlo al proprio lavoro — **è già costato un errore** il 14/08 (la sede di scarico, dichiarata «corretta» guardando un movimento prodotto in realtà dal ripiego di `main`).

Dettaglio in `02-specifica-sincronizzazione-shopify.md` §4.11.

### 2. Il grado di certezza si dichiara, e sono tre

**letto** (ho letto la riga di codice) · **dedotto** (segue dallo strumento, non l'ho visto) · **provato** (eseguito sul sistema vero, database letto prima e dopo).

Quella che si perde più facilmente è la differenza fra le prime due: un'analisi di codice produce «letto», e il «quindi succede X» è **dedotto**.

### 3. Il database è condiviso col collega

Solo `npm run prisma:deploy`, mai `migrate dev` né `db push`. Migration scritte a mano. Ogni tabella nuova porta RLS e `REVOKE` nella stessa migration.

---

## Cosa è stato chiuso il 14/08 — non va rifatto

Diciassette commit, tutti su albero verde (1512 test API, lint completo, type-check di entrambi i lati). **Niente push, niente deploy.**

**Il registro corrispettivi è finito e funziona così:**

- è **derivato** da vendite e rettifiche — `corrispettivo_entries` non viene più scritta dal ramo;
- conta le vendite alla **data di evasione**; un ordine mai spedito non entra, un annullamento pre-evasione resta fuori da sé;
- **sottrae le rettifiche alla loro data**, saltando gli annullamenti;
- l'elenco mostra le rettifiche come **righe negative**: il totale in fondo si ricostruisce sommando la colonna;
- si filtra per **periodo di calendario** (mese, trimestre, anno precisi), **canale** e **tipo**, indipendenti fra loro;
- **CSV, Excel e PDF** usano lo stesso dataset della schermata e si riconciliano col proprio totale;
- è quello che l'operatore trova su **«Corrispettivi» in sidebar**; `/app/reports/corrispettivi` fa redirect.

**Riconciliazione di agosto 2026**, verificata per tre strade indipendenti:

```
venduto      411,02
rettifiche  −205,01
annullamenti      0     (vendite mai avvenute)
─────────────────────
corrispettivo 206,01
```

**Quattro difetti corretti**, tutti trovati con ordini costruiti apposta: la sede di scarico (`01` §3.8), l'IVA della spedizione nei rimborsi (`08` §4), il registro che contava merce mai partita (`01` §2.16), l'imposta di riga ridistribuita (`01` §3.12).

---

## Da fare, in ordine

### 1. ⭐ Procedura di prima sincronizzazione — **mai entrata in `docs/`**

È il lavoro più grande e blocca gli altri due. Deve contenere, oltre a quanto già discusso altrove:

- **la corrispondenza fra aliquota Shopify e Codice IVA di VestiFlow.** Oggi le righe importate portano `{"ratePercent": 22, "matched": false}` — l'aliquota osservata, **senza** codice interno. È deliberato: il dato del canale si conserva subito, la corrispondenza è una decisione. Senza di essa il **filtro per aliquota** non può tornare nel registro, perché sarebbe solo un'etichetta;
- **l'aggancio delle location**, che è il prerequisito per leggere le _fulfillment orders_ e chiudere il ripiego alfabetico sull'impegno (`01` §3.8, parte ancora aperta);
- il resto del disegno in `02-specifica-sincronizzazione-shopify.md`, che è **disegno e non consuntivo**.

### 2. Specifica sedi

Ferma dalla mattina del 14/08. Non ci sono misure nuove da riportare.

### 3. Eliminazione di `corrispettivo_entries` — rilascio a sé

Il passaggio 1 è fatto: nessuna UI la legge, nessuna scrittura la alimenta dal ramo. **Manca solo il passaggio distruttivo**, e va fatto in un rilascio separato perché il database è condiviso:

- `DROP` di `corrispettivo_entries` e `corrispettivo_entry_lines`;
- endpoint `/online-sales/register/entries`, componente `corrispettivi-register`, DTO e mapper legacy;
- `DocumentType.corrispettivo` **solo se** un censimento conferma zero consumer: oggi resta nella configurazione (prefisso `COR`, etichetta, famiglia permessi), ed è solo la **numerazione** a non essere più consumata.

⚠️ **Prima del DROP**: `main` in produzione **scrive ancora** quelle tabelle a ogni evasione. Finché non è rilasciato questo ramo, eliminarle romperebbe la produzione.

---

## Anagrafica articolo — deciso il 17/08, in parte fatto

### ✅ Fatto: il campo si chiama «Prezzo di vendita», ovunque

Lo stesso dato (`sellingPrice`) si chiamava in **cinque** modi: «Prezzo al pubblico» in Arrivo
merce e Ordine fornitore, «Prezzo articolo» in anagrafica e dettaglio, «Prezzo vendita» nel
passo varianti e nel riepilogo, «Prezzo» nelle tabelle strette, «Prezzo unitario» nei movimenti.

**29 sostituzioni in 15 file** più le prove e i documenti. Scelto **«Prezzo di vendita»** e non
«Prezzo al pubblico» — che pure era già il nome in due maschere — perché «al pubblico»
presuppone il dettaglio, e la convenzione aziendale netto/ivato appena introdotta ammette
esplicitamente che l’azienda possa ragionare all’ingrosso.

**Restano fuori di proposito:**

| Cosa                                                  | Perché                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| «Prezzo netto» / «Prezzo ivato» nelle righe documento | è la **modalità**, la scrive `priceModeRowLabel` e cambia da sola     |
| «Prezzo» secco nelle colonne strette                  | il contesto è già la riga, e allargare la colonna non aggiunge niente |
| «Prezzo unitario» nei movimenti                       | è il valore dell’**evento**, non il prezzo di catalogo                |
| «Prezzo barrato», «Prezzo Shopify»                    | sono altri prezzi, e si chiamano già bene                             |

### ✅ Fatto il 17/08: il prezzo barrato è un prezzo di vendita come gli altri

Era l’unico dei sei a ignorare il selettore netto/ivato, **in silenzio**. Adesso è in
`PRICE_FIELDS`, la colonna è `Decimal(16,6)` e il valore memorizzato è il netto canonico.

⚠️ **I 6 valori esistenti sono stati portati a `NULL`**, non a zero — il barrato è facoltativo
e zero direbbe «esiste e vale zero». Misurati prima: 6 prodotti su 250, tutti dello stesso
tenant di prova, tutti al 22%, coi nomi che lo dicono («test import listini», «The Compare at
Price Snowboard»). `Int → Decimal` è senza perdita **numerica**, ma la **semantica** cambiava:
un 70,00 scritto intendendo «ivati» sarebbe stato riletto come netto e mostrato 85,40.

**Difetto trovato dalle prove, non dall’occhio:** `currentDraft()` riscriveva cinque prezzi dal
netto canonico e lasciava passare il barrato **grezzo** dal form. Con il campo dentro
`PRICE_FIELDS` ma fuori da lì, il valore digitato non veniva mai scorporato.

`buildVariantsPayload` è stata estratta dal servizio di push in una util propria — era un
metodo privato che non usava `this`, e **nessuna prova la copriva** mentre decide due valori
che finiscono sotto gli occhi del cliente. Nove prove, fra cui quella che `null` non diventa
`0.00`.

#### ⬜ Resta: l’Arrivo merce

Le sue tre colonne di vendita — Prezzo di vendita, Prezzo barrato, Prezzo Shopify — **non
seguono nessuna modalità**: si scrivono e si rileggono grezze, quindi di fatto nette senza
dirlo. Deciso il 17/08: **selettore di sessione come in anagrafica**, inizializzato dalla
convenzione aziendale, **nessuna persistenza e nessuna memoria**.

⚠️ **Trappola per chi esegue:** l’Arrivo merce è un documento di **acquisto**, quindi
`resolvePricesIncludeVat` gli risponde `false` per costruzione. Le tre colonne devono leggere
**direttamente** `salesPricesIncludeVat` — il componente inietta già
`TenantFeatureSettingsService`, quindi la convenzione è a portata di mano senza endpoint nuovi.

⚠️ **Perché conta:** oggi la convenzione predefinita è ivata, quindi in anagrafica si digita
ivato; sulla riga dell’Arrivo merce si digita lo stesso numero intendendolo ivato e finisce
netto. **Due schermate, stesso prezzo, due significati.**

### ⬜ Da fare: separare «Prezzi di vendita» da «Listini»

> **Un listino non è un altro prezzo: è una regola commerciale alternativa** che assegna un
> prezzo diverso allo stesso articolo — Ingrosso, Rivenditori, VIP. È la distinzione che
> permetterà domani di dire «il cliente X compra a listino Ingrosso» e farla ereditare al
> documento.

Oggi la sezione si intitola **«Listini»** e contiene cinque campi, di cui tre lo sono davvero:

```text
Listini            Prezzo di vendita ⛔ · Prezzo Shopify ⛔ · Listino 1 · 2 · 3 ✅
(fuori sezione)    Prezzo barrato · Costo di riferimento
```

⚠️ **E le due schermate non si capiscono fra loro:** in Impostazioni i tre si chiamano
«Listini aggiuntivi»; in anagrafica «Listini» ne indica cinque. La stessa parola per due insiemi
diversi a due schermate di distanza — è il difetto vero, non una preferenza di gusto. Il
criterio per escludere lo dà già il codice, in un commento di quella sezione: _«Barrato e costo
di riferimento restano fuori: non sono listini»_ — applicato agli altri due, esclude anche loro.

**L’assetto deciso:**

```text
Prezzi di vendita   Prezzo di vendita · Prezzo barrato · Prezzo Shopify
Listini             Listino 1 · 2 · 3        (nomi dati in Impostazioni)
(fuori da entrambi) Costo di riferimento     — è un costo, non un prezzo
```

⚠️ **Non è solo un’etichetta: sposta «Prezzo barrato»**, che oggi sta fuori sezione accanto al
costo. È un cambio di impaginato, e per questo non è stato fatto insieme alla rinomina.

### ⬜ Da decidere: le frecce dei campi numerici

Tutti i prezzi in anagrafica sono `<input type="number">`. **Nei form documento la regola è già
un’altra e giusta:** `number` per quantità e colli, `text` + `inputmode="decimal"` +
`parseMoneyInput` per il prezzo. L’anagrafica è l’unico posto che la rompe.

E dentro la stessa sezione le frecce fanno cose diverse:

| Campo                                | `step`    | Un clic vale    |
| ------------------------------------ | --------- | --------------- |
| Prezzo di vendita, Prezzo Shopify    | _assente_ | **1 euro**      |
| Prezzo barrato, Costo di riferimento | `0.01`    | **1 centesimo** |

**Tre difetti, non uno:**

1. **la rotella del mouse cambia il valore** quando il campo ha il fuoco — scorrendo una scheda
   lunga il prezzo cambia da solo, senza un clic e senza un avviso;
2. le frecce sono inutili su un prezzo, e incoerenti fra loro (cento volte di differenza);
3. ⚠️ **il separatore decimale lo decide il browser, non l’app.** Con `type="number"` la virgola
   funziona perché il sistema è italiano: su una macchina in inglese l’operatore non riesce a
   digitare i decimali. `parseMoneyInput` invece accetta **entrambi** e regge anche il
   separatore delle migliaia (`1.234,50` e `1,234.50` danno lo stesso importo).

**Due lavori, e NON sono alternative:**

|       | Cosa                                                                        | Taglia                                                                                                |
| ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **A** | togliere le frecce e neutralizzare la rotella su **tutti** i campi numerici | un frammento SCSS in un punto solo, zero TypeScript                                                   |
| **B** | i prezzi in anagrafica diventano `text` + `parseMoneyInput`                 | 5 controlli, ~40 riferimenti nel componente, 14 usi della catena del netto, 16 file, 11 file di prova |

**A serve comunque**, anche facendo B: le **quantità** restano giustamente `type="number"`, e la
rotella le corrompe allo stesso modo. Tre componenti card se lo sono già risolto per conto
proprio (`sales-document-line-card`, `stock-movement-line-card`, `goods-receipt-line-card`) —
qualcuno c’era già arrivato, ma sulle proprie card e non come regola.

**B chiude il terzo difetto**, che è l’unico invisibile: oggi l’app non decide come si digita un
prezzo. Conviene farlo insieme al raggruppamento qui sopra, perché tocca gli stessi template.

#### Deciso il 17/08: le frecce restano, la rotella no

> **Frecce dove sono utili — quantità, colli. Rotella spenta OVUNQUE.**

Sono due cose separabili e hanno segno opposto: **la rotella è la metà pericolosa, le frecce
sono la metà utile.** Su una quantità la rotella fa lo stesso danno che su un prezzo — si
scorre la pagina col cursore fermo sul campo e il valore cambia, senza un clic e senza avviso.

⚠️ **Non è tutto CSS**, ed è la parte che si sottovaluta:

|                | Come si toglie                                                               |
| -------------- | ---------------------------------------------------------------------------- |
| le **frecce**  | ✅ solo SCSS — `appearance: textfield` più i due pseudo-elementi WebKit      |
| la **rotella** | ⛔ **il CSS non può niente**: serve intercettare `wheel` sul campo col fuoco |

La rotella è una **direttiva** in `shared/directives/`, dove il pattern esiste già
(`first-click-selects`, `table-column-resize`).

**E c’è del codice da pulire**: tre componenti card si sono già nascoste le frecce per conto
proprio (`sales-document-line-card`, `stock-movement-line-card`, `goods-receipt-line-card`).
Quelle regole locali vanno tolte e sostituite dal punto unico, o restano tre copie della stessa
decisione — che è come nascono questi problemi.

#### E i sei decimali, con B?

Restano intatti, perché **la coda non nasce dal parse**:

```text
"25,00"  →  parseMoneyInput   →  2500          il valore MOSTRATO, due decimali
         →  netFromGrossExact →  2049,180328   la coda nasce QUI
         →  toStorableMinor   →  2049,1803     e qui si taglia a 4 cifre di centesimo
```

L’anagrafica **fa già esattamente questo** in `toNet`. B cambia solo da dove arriva il numero
digitato — da «me lo dà il browser come `number`» a «lo leggo io dalla stringa». Il calcolo del
netto, la coda e il taglio non si toccano.

✅ Anzi, B **toglie** un rischio che oggi c’è: con `type="number"` incollare `1.234,50` fa
rifiutare il valore al browser e il campo si svuota. `parseMoneyInput` lo legge correttamente.

---

## Prima sincronizzazione Shopify — deciso il 17/08/2026, da progettare

### 1 · `catalogOrigin` diventa provenienza, non permesso

> **Dopo che import e sincronizzazione sono completati, un articolo è di VestiFlow _e_ di
> Shopify: si distingue per come funziona e da dove nasce, ma si gestisce come tutti gli altri.**

Oggi non è così: `catalogOrigin = shopify` mette l’articolo in sola lettura. Misurato il
17/08: **87 articoli su 250, il 35% del catalogo.**

Il blocco vive in **17 punti**:

```text
API        catalog-origin.util · products.service · product-media.service
           shopify-product-push.service
FRONTEND   product-form + i tre step (general/options/variants) + detail
           i model, i mapper, catalog-origin.util
```

⚠️ **Il push NON è il problema, ed è bene saperlo prima di progettare.** Misurato: la guardia
del push (`evaluatePushGuard`) controlla connessione, scope `write_products`, prodotto non
archiviato e spunta `shopifySyncEnabled` — **non guarda `catalogOrigin`**, e il commento nel
codice lo dice: _«Gate per-prodotto: in AND col gating per origine»_. Se una modifica riesce a
salvarsi, viene spinta. Quindi togliere il blocco **non** lascerebbe le modifiche a metà strada.

Quello che serve progettare è l’altra metà: **cosa succede quando i due lati cambiano lo stesso
campo**. «Ultimo che scrive vince» è la direzione decisa, ma va reso vero — e riguarda i campi
che il canale possiede davvero (nome, descrizione, categoria, tassonomia, identità delle
varianti), non i prezzi.

✅ **Il prezzo di vendita è già uscito da qui il 17/08**, perché non è un campo del canale: a
Shopify va `shopifyPrice`, un’altra colonna. Sbloccarlo non anticipava nessuna decisione.

### 2 · Prezzo interno a zero all’import — idea da valutare

Il problema è già misurato e sta nella `PREZZI-SHOPIFY-SPEC`:

> `shopifyDecimalToMinor` restituisce **0** su valore malformato o assente, e il chiamante passa
> `variant.price ?? '0'`. Un prezzo mancante su Shopify diventa un prezzo di vendita **zero** in
> VestiFlow, senza errore.

E resta zero **per sempre**, perché il meccanismo è asimmetrico per costruzione:

| Momento                    | `sellingPrice`                        | `shopifyPrice` |
| -------------------------- | ------------------------------------- | -------------- |
| **nascita** (primo import) | scritto                               | scritto        |
| **ri-sync**                | ⛔ **mai toccato** — è dell’operatore | aggiornato     |

Quindi: articolo importato quando Shopify non aveva prezzo → interno a 0. Shopify poi il prezzo
ce l’ha → il ri-sync aggiorna solo il suo → **l’interno resta 0 e nessuno lo rialza**.

**L’idea:** quando il prezzo interno manca o è zero, si compila con il prezzo Shopify.

**Da determinare:**

- vale **solo alla prima volta**, o ogni volta che l’interno è zero? La seconda forma è più
  utile ma è una scrittura automatica su un campo dichiarato dell’operatore: va detto
  esplicitamente che «zero» conta come «non ancora deciso» e non come «deciso zero»;
- e il caso opposto — l’operatore che **vuole** un articolo a zero — come si distingue?

**Più un comando esplicito**, che è la parte senza ambiguità: nell’elenco prodotti, dopo aver
filtrato e selezionato, un pulsante **«Copia il prezzo Shopify nel prezzo interno»**. Copre lo
storico già andato storto, e non indovina niente: lo decide l’operatore su ciò che ha scelto.

⚠️ La forma automatica e il pulsante **non sono alternative**: il pulsante serve comunque per
gli articoli già a zero oggi, qualunque cosa si decida per l’import futuro.

### 3 · «Listini» in anagrafica: il nome vale per un sottoinsieme

La sezione prezzi dell’anagrafica si intitola **«Listini»** e contiene cinque campi:

| Campo               | È un listino?                  |
| ------------------- | ------------------------------ |
| **Prezzo articolo** | ⛔ no — è _il_ prezzo          |
| **Prezzo Shopify**  | ⛔ no — è il prezzo del canale |
| Listino 1 · 2 · 3   | ✅ sì                          |

**Il criterio per escludere lo dà già il codice**, in un commento di quella stessa sezione:
_«Barrato e costo di riferimento restano fuori: non sono listini»_. Applicato agli altri due,
esclude anche loro.

⚠️ **E le due schermate già non si capiscono fra loro:** in Impostazioni i tre si chiamano
**«Listini aggiuntivi»**; in anagrafica «Listini» ne indica cinque. La stessa parola vale per
due insiemi diversi a due schermate di distanza — che è il difetto vero, non la preferenza di
gusto.

**Proposta:** la sezione si intitola **«Prezzi»**, e i tre restano raggruppati dentro come
**«Listini aggiuntivi»** — lo stesso nome che hanno già in Impostazioni. Le due schermate
tornano a dire la stessa cosa con la stessa parola.

_Costo:_ due etichette e i test che le nominano. Nessuna colonna, nessuna migration.

---

## Difetti aperti, misurati e non ancora corretti

| Rif.       | Difetto                                                                          | Stato                                                                          |
| ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `01` §3.9  | Le righe importate ignoravano lo sconto: 120,00 di righe su un ordine da 104,00  | ✅ **chiuso e provato** su `#1010`/`#1011` (15/08)                             |
| `01` §3.13 | Il Codice IVA della vendita online lo sceglieva l'imposta incassata, mai lo zero | ✅ **chiuso** — non ancora eseguito in produzione (scatta all'evasione)        |
| `01` §3.14 | La sync sedi partiva da sola, da tre punti, e creava/rinominava/cancellava       | ✅ **inneschi spenti** — il servizio (nome, creazione automatica) resta aperto |
| `01` §3.15 | Le righe di canale scrivono importi IVATI in colonne lette come NETTE            | aperto — scelta di modello, non ancora presa                                   |
| sotto      | Ordine cliente: sconto a importo, sconto extra a importo, spedizione sui manuali | aperto — disegno deciso, non implementato                                      |
| `01` §3.12 | **Le righe della Vendita online** portano ancora l'aliquota media inventata      | l'import è corretto, lo **snapshot** no                                        |
| `01` §3.11 | Vendita con una riga non scaricata dichiara «scarico completo»                   | aperto                                                                         |
| `01` §3.8  | L'**impegno** usa ancora il ripiego alfabetico sulla sede                        | chiuso solo lo scarico, e mai eseguito                                         |
| `01` §2.1  | `orders/cancelled` non registrato sul negozio                                    | da fare **dall'ambiente pubblicato**                                           |
| `01` §2.14 | Il reso dichiarato e non ancora elaborato non esiste per VestiFlow               | aperto, da decidere se coprirlo                                                |

## Novità della notte del 15/08 — da leggere prima di riprendere

**Fatto, provato, committato** — 5 commit sul ramo, tutti verdi (961+418 frontend, 1527 API):

1. Sconto di riga Shopify — si legge da `discount_allocations`, mai si ricalcola. Provato su due ordini costruiti apposta, uno con sconto a importo.
2. Codice IVA della vendita online — si aggancia solo se univoco; mai a zero, mai con più codici alla stessa aliquota.
3. Maschera Ordine cliente — su un ordine di canale il riepilogo si legge dalla testata (spedizione, sconto, imponibile per differenza), non si ricalcola col motore manuale.
4. Sedi — i tre inneschi automatici sono spenti. Il pulsante manuale resta.

**Deciso ma non implementato — è il prossimo lavoro sull'Ordine cliente.** Una banda unica in entrambi i documenti (manuale e Shopify), con questi campi editabili in tutti e due:

```
Totale prodotti
Sconto ordine        ← dal canale, sola presa d'atto · 0,00 sui manuali
Sconto extra   [ 0% ]
Sconto importo [ 0,00 ]   ← NUOVO, colonna additiva su sales_orders
Spedizione            ← NUOVO su tutti e due i documenti
Imponibile
IVA
Totale documento
```

Decisioni prese, da non riaprire:

- l'importo del canale (`discountMinor`, esiste già) resta **distinto** dal nuovo campo che scrive l'operatore — altrimenti il sync lo cancellerebbe al prossimo giro;
- ordine di applicazione: **prima la percentuale, poi l'importo**;
- l'IVA dell'importo si ripartisce sulle righe in proporzione, come già fa la percentuale — **tranne** sulle righe Shopify, dove l'allocazione del canale non si ricalcola mai;
- **su un ordine Shopify il campo sconto importo diventa editabile**: resta pieno col valore del canale finché l'operatore non lo tocca. Da decidere il comportamento al prossimo sync — oggi la maschera di un ordine di canale è di sola lettura su tutto il resto, e questo campo ne uscirebbe da solo;
- migration: colonna additiva `document_discount_minor` su `sales_orders`, scritta a mano, `prisma:deploy`.

**Non deciso, resta il §3.15.** Se scorporare i prezzi Shopify a netto all'import (come fa già il catalogo) o dichiarare che le colonne dell'ordine di canale sono lorde. `PREZZI-SHOPIFY-SPEC.md` §1-bis e §4.1 la analizzano dal 7 agosto; i rimborsi la applicano già (leggono `taxes_included`), l'import degli ordini no — stessa cartella, stesso payload, due dottrine.

**La fase iniziale di collegamento Shopify** _(deciso il 15/08, sospesa)_. Le sedi si agganciano **a mano** — non più solo per nome — quando esistono già da entrambe le parti; ogni sede completa i propri dati (indirizzo, impostazioni); e questo passo sta insieme all'assegnazione del Codice IVA ai prodotti importati (`02` §4.1-4.3). Non è più «poi un avviso»: è il lavoro descritto lì, ed è il più grande dei tre rimasti.

**Topologia del ramo, verificata il 15/08.** `numerazione-documento-2` contiene **tutto `develop`** più 33 commit — non diverge, è un fast-forward pulito (6 migration, tutte aggiunte pure). È `main` a essere 205 commit indietro rispetto a `develop`, ed è `main` che gira in produzione su Railway sullo stesso database condiviso. Il merge previsto è su `develop`: il rischio di migration incrociate descritto per `main` non si applica a questo passaggio.

Sul §3.12: la **correzione all'import è provata sui dati veri** (righe d'ordine riscritte con 2,31 al 4% e 4,51 al 22%). Restano sbagliati gli **snapshot** già scritti — `VO-2026-0004`, `VO-2026-0005`, `COR-2026-0005/0006` — e **non si toccano**: sono istantanee, e sono l'unica testimonianza rimasta del difetto.

---

## Decisioni prese che NON si riaprono

- Il registro corrispettivi è **derivato dalle vendite**; `corrispettivo_entries` cade _(11/08, riconfermata 14/08)_.
- **Il passato non si riscrive, si rettifica**: la vendita resta alla sua data, il reso arriva alla propria _(base normativa riferita: Ris. 274/E/2009)_.
- **Gli annullamenti non si filtrano**: un annullamento pre-evasione non ha data di evasione e resta fuori da sé. Filtrarli farebbe sparire retroattivamente una vendita già avvenuta.
- **I rimborsi da annullamento si conservano e si classificano**, non si scartano in scrittura: è il registro a decidere se un fatto ha effetto, non la traduzione a decidere se esiste.
- **Canale predefinito «Tutti»**: un totale gonfiato si nota, uno a cui manca una parte no.
- **Il filtro Tipo agisce sull'elenco, non sul riepilogo**: guardando «Solo resi» il totale deve continuare a dire il corrispettivo del periodo.
- `exclusionReason` **si deriva dal legame** con la fattura; `fiscalDate` modificabile **cade**.

## Limite noto, dichiarato e non aggirato

Il registro usa la **data di evasione**, che è la regola ordinaria per le cessioni di beni mobili. Non è la regola completa: l'art. 6 anticipa il momento di effettuazione se il corrispettivo è pagato prima della consegna — cosa che su un ordine incassato con carta accade quasi sempre.

**VestiFlow non può derivarlo oggi**: _misurato_, nessuna data di incasso è persistita, le transazioni del canale non si importano. Manca il dato, non la logica. La formulazione da usare è «per il flusso supportato oggi il registro usa la data di evasione», **non** «la data di evasione è la data fiscale».

---

## Come si verifica una modifica su questo ramo

1. **Il percorso del pulsante è locale**: «Sincronizza vendite» esegue il codice del ramo, e una correzione all'import si può provare così.
2. **Il percorso dell'evento no**: evasione, rimborso e reso li elabora la produzione. Provarli richiede i webhook puntati a un tunnel.
3. **Il caso di prova deve essere quello scomodo.** Il difetto dell'IVA è vissuto per mesi perché con **una sola aliquota** la ripartizione proporzionale coincide col vero: qualunque verifica sarebbe passata. È emerso con un ordine costruito con 4% e 22% insieme.
4. **Si fotografa il database prima e dopo**, e si aspetta che il pulsante torni premibile: misurare a passata in corso è già capitato due volte.
