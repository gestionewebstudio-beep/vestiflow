# Prezzi prodotto e Shopify — specifica

_Analisi e decisioni, agosto 2026. Ambito: **prezzi dei prodotti** verso e da Shopify.
Fuori ambito: ordini ricevuti, corrispettivi, modalità ivata dell'Ordine cliente, TikTok._

> **Perimetro.** VestiFlow **non è un gestionale solo per abbigliamento** — i clienti di
> oggi lo sono, il prodotto no. Le regole di progetto dicono ancora «negozi di
> abbigliamento» (`.claude/rules/regole-gestionale.md`, SCOPE) e vanno aggiornate.
> Conta qui perché sull'abbigliamento per adulti l'aliquota è sempre il 22% e ogni
> problema di aliquote ridotte sembra teorico; per una libreria (4%), un'erboristeria o
> un alimentari è il caso normale. **Nessuna assunzione di merceologia o di aliquota
> unica.**

Ogni affermazione su «cosa fa oggi il codice» è stata verificata leggendo il file
citato. Dove il fatto riguarda il comportamento della piattaforma Shopify e non è
verificabile in questo repository, è marcato **[Shopify]**.

---

## 1. Il problema

VestiFlow memorizza tutti i prezzi **netti**. Shopify ha un'impostazione di negozio —
_Impostazioni → Imposte e dazi → «Includi l'imposta sulle vendite nel prezzo del
prodotto»_ — che decide come interpretare il campo `price` di una variante:

- spunta **attiva**: `price` è il prezzo **finale al cliente**, imposta compresa **[Shopify]**
- spunta **disattiva**: `price` è l'**imponibile**, l'imposta si aggiunge al checkout **[Shopify]**

VestiFlow non legge quell'impostazione. Ricerca su backend, frontend, schema e 91
migration di `taxes_included`, `taxesIncluded`, `tax_lines`, `priceIncludesTax`:
**zero risultati**.

Conseguenza sui due negozi collegati al progetto, che hanno impostazioni opposte
(`test-vestiflow` IT/EUR = attiva; `vestiflow-test-hifqgyz0` US/USD = disattiva):

|                         | Negozio a prezzi netti          | Negozio a prezzi ivati             |
| ----------------------- | ------------------------------- | ---------------------------------- |
| VestiFlow pubblica      | `"50.00"`                       | `"50.00"`                          |
| Shopify lo intende come | imponibile → cliente paga 61,00 | prezzo finale → cliente paga 50,00 |
| Netto che resta         | 50,00                           | **40,98**                          |
| Esito                   | corretto                        | **manca il 18,03% su ogni pezzo**  |

Lo stesso codice è giusto su un negozio e sbagliato sull'altro, e nulla nel programma
distingue i due casi.

**Il caso reale è peggiore della tabella.** Nella scheda articolo la modalità prezzo
predefinita è **IVATO** (`api/src/products/product-price-mode-preference.service.ts:9`,
`PRODUCT_LISTINO_FIRST_USE_INCLUDES_VAT = true`) e il campo «Prezzo Shopify» è soggetto
a quell'interruttore. Quindi per default l'operatore **digita 61,00**, VestiFlow
memorizza il netto 50,00, pubblica `"50.00"`, e sul negozio italiano il cliente **paga
50,00**. L'operatore ha scritto 61, il cliente paga 50, e nessuna schermata lo dice.

---

## 1-bis. I due casi reali — misurati il 07/08/2026

Non sono esempi costruiti: sono due prodotti del negozio di test, con i loro numeri.

### Caso A — il pull: nato su Shopify, nessuno ha toccato VestiFlow

Prodotto **«prodotto per test import listini 07/08»**, creato direttamente su Shopify e
salvato. Nessun intervento in VestiFlow.

|            | Su Shopify            | In VestiFlow                |
| ---------- | --------------------- | --------------------------- |
| Prezzo     | 50,00 **al pubblico** | 50,00 etichettato **netto** |
| Barrato    | 70,00 al pubblico     | 70,00 etichettato netto     |
| Costo      | 3,00                  | 3,00 ✔ corretto             |
| Categoria  | Pane e focacce        | —                           |
| Codice IVA | —                     | nessuno → 22% predefinito   |

**Shopify stessa dichiara la scomposizione**, in una bozza d'ordine con cliente e
indirizzo italiani: `Imposta stimata 9,02 € • 22% IT IVA — Incluse`, totale 50,00.

Quindi l'imponibile vero è **40,98**, non 50,00. Conseguenze misurate:

```
margine        VestiFlow 47,00   →  reale 37,98   (gonfiato del 24%)
imponibile     VestiFlow 50,00   →  reale 40,98   (registro corrispettivi)
```

Nessun errore umano: è il percorso normale di ogni articolo importato.

### Caso B — il push: nato in VestiFlow

Prodotto **«Test dopo impl listini»**: prezzo memorizzato **9,8361**, su Shopify
**9,84**. La coda decimale non può venire da un import (che scrive numeri tondi) e la
variante ha SKU nullo, non il `SHOPIFY-…` generato dall'import. `9,8361 × 1,22 = 12,00`:
l'operatore ha digitato **12,00** in modalità ivata.

Su un negozio a prezzi comprensivi **il cliente paga 9,84**. Voleva pagare 12,00.

### Perché nessuno se n'era accorto

Il push legge `shopifyPriceMinor`, il pull scrive `shopifyPriceMinor`: **lo stesso numero
esce ed entra identico**. I due errori sono opposti e si compensano sul giro completo.
Nessuna deriva, nessun allarme: il difetto sta fermo e sembra stabile.

### Caso C — l'esperimento: cosa determina davvero l'aliquota

Due ordini reali sullo stesso prodotto, stesso prezzo, stesso indirizzo italiano.
**Una sola variabile cambiata** fra l'uno e l'altro: l'appartenenza a una collezione con
tax override, creata dal negoziante fra i due.

| Ordine    | Configurazione                                    | `total_tax` | `rate`   |
| --------- | ------------------------------------------------- | ----------- | -------- |
| **#1003** | categoria «Pane e focacce», nessuna collezione    | 9,02        | **0.22** |
| **#1004** | stessa categoria **+ collezione con override 4%** | 1,92        | **0.04** |

**Conclusione: l'override funziona, la categoria da sola no.** Con Shopify Tax attivo,
riscossione italiana attiva, mercato Italia e categoria alimentare corretta, l'aliquota
resta ordinaria finché non interviene un tax override su collezione.

L'interfaccia Shopify, sotto il campo Categoria, scrive _«Determina le aliquote
fiscali»_: promette il **meccanismo**, non il **risultato**. Non è falso — è che il
risultato, per quella categoria in Italia, è comunque il 22%.

**Il dato che torna indietro è ricco e per riga:**

```json
{ "price": "1.92", "rate": 0.04, "title": "IT IVA", "channel_liable": false }
```

Presente sia sull'ordine sia su **ogni riga**, con l'aliquota come frazione. Leggibile con
`read_orders`, che l'app già possiede. Su un ordine ad aliquota mista risolve alla radice
il problema della ripartizione proporzionale (§6, voce 11: due righe al 22% e al 4%
escono entrambe al 13%, aliquota che non esiste).

**E confermato per misura, non per documentazione:** con `taxes_included = true`,
`subtotal_price` **contiene l'imposta**. Shopify riporta `subtotal_price: 50.00` e
`total_tax: 1.92` su un ordine il cui totale è 50,00. Il subtotale non è un imponibile.

### Cosa ne ha fatto VestiFlow

Entrambi gli ordini sono stati importati e sono in `pending_registration`, cioè in attesa
di finire nel registro dei corrispettivi:

|             | Imponibile reale | Imponibile che VestiFlow registrerebbe |
| ----------- | ---------------- | -------------------------------------- |
| #1003 (22%) | 40,98            | **50,00**                              |
| #1004 (4%)  | 48,08            | **50,00**                              |

Sbagliato in entrambi i casi, e **in modo diverso**, perché l'aliquota è diversa.

**Ma i numeri per correggerlo sono già in tabella:** VestiFlow ha memorizzato
`taxMinor = 1,92` e `totalMinor = 50,00`. `50,00 − 1,92 = 48,08` è l'imponibile giusto.
L'errore non è un dato mancante: è l'uso di `subtotal_price` come base imponibile.

### Tre impostazioni su quattro non sono leggibili

| Impostazione                           | Leggibile dall'app?                                      |
| -------------------------------------- | -------------------------------------------------------- |
| `taxes_included`                       | **Sì** — arriva già oggi al collegamento e viene buttata |
| Servizio fiscale (Shopify Tax / Basic) | No — l'unico oggetto vicino richiede `read_taxes`        |
| **Mercati di vendita**                 | No — richiede `read_markets`, verificato con un 403      |
| Eccezioni fiscali per collezione       | No — nessun endpoint, in nessuna versione                |

**Dimostrazione dal vivo**: durante l'analisi il mercato del negozio è passato da «Stati
Uniti» a «Italia». Nessun record di prodotto è cambiato, nessun webhook è scattato, lo
stato di sincronizzazione è rimasto **verde** — eppure da quel momento ogni prezzo
significa un'altra cosa. È il motivo per cui VestiFlow non deve **prevedere** il
comportamento fiscale di Shopify, ma **leggere** cosa è successo.

---

## 2. Stato attuale del codice — fatti verificati

### 2.1 Il push non legge e non converte

Il prezzo entra nel pacchetto per Shopify in una riga sola:

```ts
// api/src/shopify/shopify-product-push.service.ts:653
price: minorToShopifyDecimal(Number(variant.shopifyPriceMinor)),
```

`minorToShopifyDecimal` (`shopify-money.util.ts:32-34`) delega a `minorToDecimalString`
(`common/money.util.ts:46-54`): solo arrotondamento al centesimo e formattazione in
testo. Nessuna aliquota, nessuna moltiplicazione.

Il pacchetto della variante (`push:649-680`) contiene: `sku`, `price`, `barcode`,
`inventory_management`, `compare_at_price` (se valorizzato), `id`, `option1/2/3`.
**Il campo `taxable` non viene mai inviato** — ricerca su tutta `api/src/shopify`, zero
occorrenze. **[Shopify]** In assenza, si applica il default `taxable: true`: un articolo
con codice IVA a zero (FC, E10, N8A) parte indistinguibile da un 22%.

Secondo canale d'uscita con lo stesso difetto: l'export CSV
(`api/src/products/import/shopify-csv.serialize.ts:154-155`).

Il push parte a **ogni** salvataggio prodotto (creazione, modifica, immagini, import
CSV, articolo da arrivo merce, pulsante Sincronizza) e ricostruisce sempre il pacchetto
da zero: il prezzo è incluso incondizionatamente, non esiste un «manda solo ciò che è
cambiato».

### 2.2 Il dato che serve arriva già oggi, e viene buttato

```ts
// api/src/shopify/shopify-admin.client.ts:112-119
async getShop(shopDomain, accessToken): Promise<{ name: string }> {
  const response = await this.request<{ shop: { name: string } }>(..., '/shop.json');
  return { name: response.shop.name };
}
```

**[Shopify]** La risposta di `/shop.json` contiene anche `taxes_included`, la valuta e il
paese. Arrivano sul filo, vengono deserializzati e scartati alla riga successiva.
Recuperarli **non richiede un permesso nuovo né una chiamata nuova**.

Unico chiamante: il completamento OAuth (`shopify-oauth.service.ts:161`).

Nel database non esiste dove metterli: il modello `ShopifyConnection`
(`api/prisma/schema.prisma:1555-1578`) ha 17 campi, nessuno fiscale, nessuna valuta,
nessun paese.

### 2.3 Il pull non interpreta

Il prezzo arriva come stringa e passa da `shopifyDecimalToMinor`
(`shopify-money.util.ts:4-18`): puramente sintattica, nessuno scorporo.

**Alla nascita** (`shopify-product-pull.service.ts:295-302`) scrive in **due** colonne:

```ts
sellingPriceMinor: firstPriceMinor,
shopifyPriceMinor: firstPriceMinor,
```

**Al ri-sync** (`pull:349-356`) tocca **solo** il prezzo Shopify — comportamento già
corretto e già documentato nel codice:

```
// Ri-sync: si aggiorna SOLO il prezzo Shopify (dalla prima variante).
// Il prezzo articolo (gestionale) è dell'operatore, non si tocca più.
```

Stessa distinzione sulle varianti (`pull:383-405`): variante nuova → semina il prezzo
articolo; variante esistente → non lo tocca.

**Rischio collaterale:** `shopifyDecimalToMinor` restituisce **0** su valore malformato
o assente, e il chiamante passa `variant.price ?? '0'`. Un prezzo mancante su Shopify
diventa un prezzo di vendita **zero** in VestiFlow, senza errore.

### 2.4 Nulla può accorgersi di un cambio di impostazione

- **Nessun webhook.** `api/src/shopify/shopify-webhook-topics.ts` registra 8 topic
  (giacenze, ordini, clienti, prodotti). Non c'è `shop/update`. E un cambio di quella
  spunta non modifica alcun prodotto, quindi non fa scattare `products/update`.
- **Nessuno scheduler.** Ricerca di `Cron`, `@Interval`, `setInterval`,
  `ScheduleModule` su `api/src`: zero risultati.
- **Nessun rilevatore di divergenza sui prezzi.** Il verde `synced` (`pull:267-271`)
  afferma che la spedizione è stata accettata, non che il valore coincide.

### 2.5 Il modello che esiste per le giacenze e manca ai prezzi

Sulle **giacenze** la regola è **unilaterale per progetto**: le quantità non vengono
mai importate. Il webhook e il pulsante Sincronizza passano dallo stesso punto
(`shopify-inventory-pull.service.ts:111-118` → `shopify-sync.service.ts:490-538`) e lì
l'unica tabella scritta è quella di **stato** (`shopify-inventory-reconciliation.service.ts`),
mai la giacenza.

Il meccanismo ha tre pezzi, ed è quello da trasporre sui prezzi:

1. si calcola **il valore da pubblicare** dal dato interno (giacenza − impegnato);
2. si registra **cosa si è pubblicato e quando** (serve a riconoscere l'eco del proprio
   invio e a non riscrivere quando nulla è cambiato);
3. quando Shopify riferisce un valore lo si **classifica** invece di sovrascriverlo —
   quattro esiti: eco del nostro invio (finestra 5 minuti), coincide, spiegato da un
   ordine online, divergenza vera.

**La differenza che cambia il disegno:** la quantità ha una verità fisica, il prezzo no.
Un valore diverso su Shopify per una quantità è un errore o un'eco; per un prezzo può
essere **il negoziante che ha fatto uno sconto dall'admin**. Quindi si copia il
meccanismo, **non la reazione**: sulle giacenze si ripubblica, sui prezzi si segnala e
si lascia decidere.

---

## 3. Le decisioni

1. **VestiFlow pubblica il prezzo che il cliente paga.** Legge l'impostazione del
   negozio: se i prezzi sono comprensivi, ricalcola il lordo dal netto memorizzato e
   pubblica quello. In ingresso, simmetricamente, scorpora prima di memorizzare. Non è
   responsabilità del negoziante accorgersi della configurazione.
2. **Frequenza di lettura:** memorizzata al collegamento, **riletta a ogni
   sincronizzazione manuale**, salvando anche **l'istante della lettura**.
3. **Se la lettura fallisce** e c'è un valore memorizzato, si pubblica con quello: è
   l'ultimo dato certo, non un'assunzione. **Se non c'è alcun valore, non si pubblica.**
4. **Ownership:** Shopify può scrivere **solo** il prezzo Shopify, mai il prezzo
   articolo. Entrambi si compilano solo quando il prodotto **nasce** dall'import.
   _(Già implementato correttamente — vedi §2.3.)_
5. **Prezzo barrato:** entra nell'interruttore Netti/Ivati come gli altri prezzi, la sua
   colonna va allargata a `Decimal(16,6)`, e segue la **stessa modalità d'invio del
   prezzo** (prezzo e barrato devono essere nella stessa unità di misura, sempre:
   altrimenti lo sconto mostrato al cliente è inventato).
6. **Aliquota mancante per lo scorporo:** si segnala, non si inventa.
7. **Nessuna bonifica retroattiva:** il catalogo attuale sono dati di test.
   → **Vincolo di rilascio che ne discende**: la correzione del push **non si può
   attivare su un catalogo già importato** senza prima decidere cosa fare di quei
   prezzi. Un articolo importato a 50,00 (lordo scambiato per netto) verrebbe
   ripubblicato a 50,00 × 1,22 = **61,00**: tutti i prezzi online salterebbero del 22%
   da un giorno all'altro. Cancellare i dati di test non è una comodità, è la
   precondizione.
8. **Il pannello Shopify mostra** la configurazione fiscale del negozio: informazione,
   non allarme.
9. **Negozio a prezzi non comprensivi che vende al pubblico:** si segnala senza
   bloccare, **condizionando l'avviso al paese** (negli USA è la norma).
10. **Il verde di sincronizzazione** deve promettere che il valore coincide.
11. **Niente nota sotto il campo «Prezzo Shopify»:** il selettore Netti/Ivati dice già
    all'operatore in che modalità sta scrivendo.
12. **L'aliquota per convertire si prende dall'ANAGRAFICA, mai da Shopify.** Ordine:
    Codice IVA dell'articolo → fornitore → predefinito del tenant → se manca anche
    quello, non si converte e si segnala (decisione 6). L'aliquota del paese letta da
    Shopify **esce dal disegno**: non è mai stata il dato giusto, era il dato
    disponibile. Motivo: il Codice IVA dell'articolo è la verità fiscale del negoziante,
    quella che finisce in fattura; l'aliquota di Shopify dipende da almeno sei variabili
    di cui l'app ne può leggere una.
13. **Ciò che Shopify ha davvero applicato si legge dagli ordini** (`tax_lines` per
    riga, leggibili con `read_orders` che l'app già possiede). È l'unico dato osservato,
    e l'unico lato destro ammissibile in un confronto.

---

## 4. Interventi da fare

_Ordinati per priorità. Il primo è indipendente da tutti gli altri e va fatto per primo._

### 4.1 ⚠️ L'imponibile dei corrispettivi — PRIMO, e indipendente

**È l'errore più grave del lotto, ed è l'unico che esce dall'azienda: finisce nel
registro che va al commercialista.**

Oggi il riepilogo corrispettivi calcola l'imponibile così:

```ts
// api/src/corrispettivi/corrispettivi.service.ts:126
const taxableMinor = Math.max(0, subtotalMinor - discountMinor);
```

e lo esporta con l'etichetta **«Imponibile»** in CSV e PDF
(`corrispettivi-export.service.ts:136` e `:185`).

`subtotalMinor` viene da `order.subtotal_price` (`shopify-sync.service.ts:149-151`). E
con `taxes_included = true` quel campo **contiene l'imposta** — misurato su due ordini
veri (§1-bis, caso C). Quindi l'imponibile dichiarato è **sovrastimato dell'IVA**.

Misurato:

| Ordine | Aliquota | Imponibile reale | Registrato oggi | Scarto    |
| ------ | -------- | ---------------- | --------------- | --------- |
| #1003  | 22%      | 40,98            | 50,00           | **+9,02** |
| #1004  | 4%       | 48,08            | 50,00           | **+1,92** |

**Perché va per primo, e da solo:**

1. **È l'unico errore che esce verso terzi.** Gli altri sbagliano un margine o un prezzo
   online — questo sbaglia un numero che il commercialista mette in dichiarazione.
2. **Non dipende da nient'altro in questo documento.** Non serve leggere `taxes_included`
   dal negozio, non serve `tax_lines`, non serve toccare il push né il pull. I due numeri
   necessari — imposta e totale — sono **già memorizzati** su ogni ordine importato:
   `taxMinor` e `totalMinor`.
3. **Non ha il vincolo di rilascio della decisione 7.** Correggere un calcolo di
   riepilogo non tocca nessun prezzo, non ripubblica niente, non muove il catalogo.
   Si può fare oggi, anche prima di cancellare i dati di test.

**Cosa cambiare:** smettere di usare `subtotal_price` come base imponibile quando i
prezzi sono comprensivi, e ricavarla per differenza dai dati già in casa
(`totalMinor − taxMinor`, al netto della spedizione, che oggi è un campo a parte).
La stessa incoerenza esiste già dentro il codice e lo conferma: `computeSaleLines`
(`online-sale-fulfillment.service.ts:500`) tratta le stesse righe **come lorde**,
sottraendo l'imposta dal totale riga. Due punti del programma leggono lo stesso numero in
due modi opposti.

**Da decidere insieme alla correzione:** finché non si legge `taxes_included`, l'unico
modo di sapere se il subtotale è lordo è… non saperlo. Due strade: (a) ricavare sempre
l'imponibile per differenza — corretto per i negozi a prezzi comprensivi, e per gli altri
`taxMinor` è comunque coerente; (b) leggere prima `taxes_included` (§4.2) e scegliere.
La (a) si può fare subito, la (b) è più solida. Non sono alternative: la (a) è il tampone,
la (b) la chiusura.

### 4.2 Leggere e conservare la configurazione del negozio

- `getShop` (`shopify-admin.client.ts:112-119`) deve restituire anche `taxes_included`,
  la valuta e il paese.
- Nuove colonne su `ShopifyConnection`: impostazione fiscale, valuta, paese, **istante
  della lettura**.
- Rilettura a ogni sincronizzazione manuale.

L'istante è il pezzo che rende il tutto onesto: il pannello dice non solo _cosa_ ha
letto ma _quando_. **Un dato vecchio ammesso è informazione; un dato vecchio presentato
come fresco è una bugia.**

> **Precedente da non ripetere:** la versione API memorizzata al collegamento **mente
> già oggi** — il pannello mostra il valore in banca dati mentre ogni richiesta usa
> quello dell'ambiente (`shopify-connection.service.ts:272` contro
> `shopify-admin.client.ts:561`). Anche il nome del negozio non viene mai rinfrescato.

### 4.3 Convertire in uscita e in ingresso

- **Push:** un solo punto che decide se il negozio vuole lordi e converte **tutti** i
  campi monetari che escono insieme (prezzo e barrato), non campo per campo — altrimenti
  possono divergere.
- **Pull:** scorporo simmetrico prima di memorizzare.
- La matematica esiste già e non va riscritta: `netFromGrossExact` per il valore da
  memorizzare, `grossFromNetMinor` per quello da mostrare/pubblicare
  (`api/src/vat/vat-line-calculation.util.ts`).

### 4.4 Il barrato

- Aggiungerlo ai campi soggetti all'interruttore Netti/Ivati
  (`product-general-step.component.ts:96-102`, oggi contiene `sellingPrice`,
  `shopifyPrice`, `listino1-3`).
- Allargare `compareAtPriceMinor` a `Decimal(16,6)` (oggi `Int`).
- **Punto aperto:** al ri-sync il barrato viene oggi **risincronizzato da Shopify**
  (`pull:355-357`, «resta sincronizzato, una sola versione») mentre il prezzo articolo
  no. Va deciso se il barrato resta di Shopify o diventa dell'operatore come il prezzo.

### 4.5 Azione massiva «Assegna Codice IVA alla selezione»

È il modo più economico di risolvere l'aliquota mancante sui prodotti importati: riduce
N interventi a uno per gruppo **senza inferire nulla**, e l'operatore vede cosa sta
cambiando.

- Il frontend ha già selezione multipla, seleziona-tutti, azzera-selezione e un'azione
  massiva funzionante da imitare (`product-list.component.ts:162,435,450,454-471`).
- Manca l'endpoint massivo lato server: oggi esiste solo la modifica del singolo
  prodotto (`products.controller.ts:308`).
- Trattarla come azione sensibile: riepilogo prima di confermare.

> **Premessa da chiudere prima:** la creazione dei codici IVA è **pigra**, parte solo
> quando qualcuno apre l'area Codici IVA (`vat-codes.service.ts:51,244`). Su un tenant
> che non l'ha mai aperta il predefinito aziendale resta vuoto e ogni riga esce con
> **imposta zero, in silenzio**.

### 4.5-bis La regola dei due modi di ottenere un netto

> **Quando l'importo dell'imposta è disponibile, si SOTTRAE. Si DIVIDE solo quando non c'è.**

Due percorsi diversi, e la differenza decide se serve la coda decimale:

| Contesto                           | Cosa si ha                  | Come si ottiene il netto                       | Coda?  |
| ---------------------------------- | --------------------------- | ---------------------------------------------- | ------ |
| **Prezzo di catalogo** dall'import | solo il lordo e un'aliquota | `lordo ÷ (1 + aliquota)` → `netFromGrossExact` | **sì** |
| **Riga d'ordine** da `tax_lines`   | lordo **e importo imposta** | `lordo − imposta`                              | **no** |

Nel secondo caso tutti i valori che Shopify manda sono al centesimo, e una sottrazione fra
importi al centesimo dà un importo al centesimo. Misurato sull'ordine #1004:
`50,00 − 1,92 = 48,08`, esatto.

**Conseguenza pratica:** `OnlineSaleLine` e `CorrispettivoEntryLine` **possono restare
intere**. Nessuna migrazione su quel fronte. L'aliquota di `tax_lines` serve a riconoscere
il Codice IVA, **non** a calcolare l'imponibile.

**Dove invece la coda serve davvero:** l'import del prezzo prodotto, perché lì l'importo
dell'imposta non esiste e bisogna dividere. La colonna è già `Decimal(16,6)`, ma lo
scorporo va fatto con la funzione **esatta**: un lordo di 25,00 importato deve tornare
25,00 quando lo si rivede ivato, non 24,99.

### 4.6 Sfruttare il dettaglio imposta per riga degli ordini

Il dato migliore che esiste per conoscere l'aliquota vera **è già in casa e viene
buttato due volte**:

- costruendo le righe d'ordine si ignora il dettaglio imposta per riga
  (`shopify-sync.service.ts:206-222`) benché **le colonne esistano già vuote**
  (`schema.prisma:1253-1257`);
- all'evasione si spalma il totale imposta d'ordine in proporzione
  (`online-sale-fulfillment.service.ts:490-491`).

La macchina inversa «aliquota → Codice IVA» esiste già, è usata proprio lì, e ha già il
comportamento richiesto dalla decisione 6: se non trova corrispondenza registra
un'impronta invece di inventare (`vat-reverse-match.util.ts:18-36`).

**Difetto da chiudere insieme:** a `online-sale-fulfillment.service.ts:500` il codice fa
_totale riga meno imposta_, cioè **assume prezzi comprensivi senza che nessuno l'abbia
dichiarato**. Su un negozio a prezzi non comprensivi l'imponibile della vendita online
nasce sbagliato e il codice IVA vuoto.

Dettagli tecnici: **[Shopify]** l'aliquota arriva come frazione (`0.22`), il dettaglio
imposta è un **elenco** (imposte composte) e va dichiarata una regola somma-contro-
singola; la colonna dell'imposta di riga è intera.

### 4.7 Verificare che l'uscita sia atterrata giusta

Leggere l'impostazione prima di pubblicare garantisce che l'**ingresso** sia fresco, non
che l'**uscita** sia corretta. Serve una rilettura **dopo** la pubblicazione, che
declassi lo stato se il valore su Shopify non coincide con quello inviato.

Il metodo esiste già nello stesso file, applicato ad altro: la verifica per gli attributi
di categoria (`shopify-product-push.service.ts:427-461`). Va imitata sul prezzo.

Quando il rilevatore trova una divergenza: **segnalare e offrire il pulsante, non
ripubblicare in automatico** — sui prezzi una ripubblicazione automatica cancellerebbe
uno sconto fatto apposta nell'admin di Shopify.

### 4.8 Le segnalazioni

> **La regola che le genera tutte:** mai confrontare un'osservazione con un'assunzione —
> **entrambi i lati devono essere dati**. E mai attribuire una causa che non possiamo
> distinguere (categoria? eccezione per collezione? esenzione del cliente? soglia UE?).
>
> **Da non scrivere mai:** «il negozio applica il 22%», «l'aliquota è sbagliata», «manca
> l'eccezione fiscale». Sono affermazioni su una configurazione che non possiamo leggere.

Tre segnalazioni sopravvivono alla regola, e sono vere in ogni scenario:

1. **Aliquota non determinabile** — blocca la conversione, non la inventa.

   > _«Prezzo ricevuto da Shopify comprensivo di imposta. Per questo articolo non risulta
   > un Codice IVA in anagrafica: il prezzo è stato memorizzato così com'è e l'articolo
   > resta da completare.»_

   Non afferma nulla su Shopify, quindi non può sbagliare.

2. **Divergenza osservata su un ordine reale** — l'unico allarme falsificabile.

   > _«Ordine #1234: Shopify ha applicato il 4% sull'articolo X, che in VestiFlow è al
   > 22%. Verificare quale dei due valori è corretto.»_

   Due dati entrambi osservati. Dice **cosa** è successo, non **perché**.

3. **Catalogo multi-aliquota** — _per negozio, una volta sola_, **non per articolo**.

   > _«Questo catalogo contiene articoli a 3 aliquote diverse (4%, 10%, 22%). L'aliquota
   > applicata al checkout la decide Shopify: verificare che il negozio le distingua
   > correttamente.»_

   **Perché per negozio e non per articolo** (correzione al primo disegno): con VestiFlow
   non limitato all'abbigliamento, una libreria ha il 4% su _tutto_ il catalogo. Un
   avviso per articolo comparirebbe ovunque, e un avviso che compare ovunque non è un
   avviso: è sfondo, e insegna a ignorare anche quelli veri.

**Tono e frequenza:** warning non bloccanti, una volta sola, silenziabili con un
«verificato il gg/mm/aaaa» — coerente con `regole-gestionale`, dove i controlli di
business sono avvisi e i blocchi restano ai soli vincoli di integrità.

### 4.8-bis Dove collocarle

**(A) Configurazione fiscale** — quinta voce nell'elenco dei fatti di connessione del
pannello Shopify (`shopify-integration-panel.component.html:94-115`, dove stanno Nome
shop / Versione API / Ultima connessione / Ultimo sync), con valuta, paese e istante
della lettura. Una voce d'elenco **non ha tono**: è informazione per costruzione.

**Da non usare:** il blocco «Stato configurazione» (`:218-258`) è un elenco di compiti,
il suo tipo ha solo attivo/parziale/da fare — un badge «Da fare» su una configurazione
che non è responsabilità del negoziante è l'allarme travestito che la decisione 8
esclude.

**(B) Avviso «prezzi non comprensivi ma vendita al pubblico»** — nel pannello Shopify
con `app-inline-banner`, già importato e già usato in quel file.

> **Vincolo da conoscere:** in quel componente tono e ruolo di accessibilità sono
> **accoppiati per costruzione** — `warning` comporta l'annuncio interruttivo
> (`inline-banner.component.ts:37-39`). Un avviso permanente di configurazione che
> interrompe la lettura a ogni apertura di Impostazioni è sbagliato: **usare il tono
> informativo**, non chiudibile (è una condizione, non l'esito di un'azione).
>
> Non usare `app-shopify-sync-feedback`: è un secondo componente per la stessa cosa,
> che le regole vietano, e sopravvive come debito.

**Limite noto, accettato:** l'intero pannello è visibile solo a chi ha accesso pieno al
tenant (`tenant-permissions.util.ts:73-75`). Chi ha solo la gestione catalogo — cioè chi
digita i prezzi — non lo vedrà. È stato deciso di non aggiungere una nota nella scheda
articolo: il selettore Netti/Ivati già dice in che modalità si sta scrivendo.

### 4.9 Negozio americano

**Supportare la parte fiscale della pubblicazione, senza l'avviso** (condizionato al
paese, che arriva dalla stessa lettura).

Il resto va **dichiarato limite noto** e messo in coda, perché oggi un negozio americano
non è bloccato: è **silenziosamente sbagliato**.

---

## 4-bis. Come si ottiene un'aliquota ridotta su Shopify (e cosa comporta per noi)

Domanda pratica per ogni cliente non-abbigliamento: **come fa un articolo al 4% a essere
tassato al 4% online?**

Non con la categoria. Verificato sul campo (§1-bis) e corroborato dall'assistente di
Shopify, che alla domanda diretta risponde:

> _«**Aliquote IVA multiple per prodotto** — Se hai prodotti con aliquote diverse (es. 4%,
> 10%, 22%), puoi usare i **tax override**: crea collezioni separate per ogni aliquota e
> applica l'override corrispondente a ciascuna.»_
>
> _«**Prezzi IVA inclusa** — Se i tuoi prezzi includono già l'IVA, Shopify la calcola "a
> ritroso" dividendo il prezzo lordo per (1 + aliquota).»_

⚠️ Fonte: assistente conversazionale di Shopify, **non** documentazione ufficiale. Va
trattata come corroborazione di una misura, non come prova. Combacia però con l'esito
della bozza d'ordine e con la documentazione sugli override, che dichiara: _«If you set a
product category for a product that has an override in place, then the override takes
precedence over product category tax calculations»_.

**Conseguenze operative:**

1. Il meccanismo per il multi-aliquota in Italia è **collezione + tax override**, da
   configurare a mano nell'admin Shopify. Non è qualcosa che il gestionale possa fare al
   posto del negoziante.
2. **Gli override non sono leggibili via API** (nessun endpoint, in nessuna versione).
   Quindi VestiFlow non può né verificarli né segnalarne l'assenza — da cui la
   formulazione delle segnalazioni in §4.8.
3. La formula di scomposizione «lordo ÷ (1 + aliquota)» è la stessa che VestiFlow già
   usa (`netFromGrossExact`). Nessuna matematica nuova.

### Le collezioni si leggono, non si creano

**VestiFlow non crea collezioni.** Le costruisce il negoziante, con criteri suoi che non
conosciamo e che non devono interessarci. La domanda utile è un'altra: **quel dato
possiamo usarlo in importazione?**

**Cosa è leggibile, verificato sul negozio reale:**

| Dato                                                       | Leggibile?                        |
| ---------------------------------------------------------- | --------------------------------- |
| Elenco delle collezioni, con nome e numero prodotti        | **Sì** (GraphQL, `read_products`) |
| A quali collezioni appartiene un prodotto                  | **Sì**                            |
| Se una collezione è manuale o automatica                   | **Sì**                            |
| **L'aliquota dell'override applicato a quella collezione** | **No** — nessun endpoint          |

**Cosa se ne fa, e cosa no.**

✅ **Come criterio di raggruppamento nell'import e nell'azione massiva.** L'operatore vede
gli articoli in arrivo raggruppati per collezione Shopify e assegna il Codice IVA a un
gruppo intero con un gesto — «tutti quelli in _collezione pane 4%_ → Codice IVA 4%».
Il gestionale non interpreta niente: mostra un fatto e lascia decidere chi sa. È il
moltiplicatore che rende praticabile §4.5 su un catalogo multi-aliquota.

⛔ **Mai come fonte dell'aliquota.** Il nome della collezione è testo libero scelto da un
umano: oggi «collezione pane 4%», domani «Alimentari» o «Panetteria Rossi». Dedurre
un'aliquota da una stringa sarebbe un'inferenza travestita da dato — esattamente il tipo
di errore che tutta questa specifica evita.

⛔ **Mai come verifica.** Sapere che un prodotto sta in una collezione non dice che quella
collezione abbia un override, né quale. La verifica resta `tax_lines` dagli ordini.

**Prerequisito tecnico.** Oggi `Product.shopifyCollections` (`schema.prisma:568`) esiste
ma è **sempre vuoto**: il pull lo popola dall'arricchimento (`pull:258`), che l'import
massivo salta (`pull:142`). Per usarlo va popolato — e conviene farlo **per collezione,
non per prodotto**: una query che chiede a ciascuna collezione i suoi prodotti costa
quanto il numero di collezioni (poche), non quanto il numero di articoli (molti).

### Il flusso di import, a due passi

L'assegnazione dell'aliquota **vive nell'anteprima**, e finché non è completa non si
conferma. Nessun articolo entra in catalogo «da definire».

1. **Anteprima** — si leggono gli articoli da Shopify e si mostrano all'operatore
   raggruppati per collezione, senza scrivere nulla in catalogo.
2. **Assegnazione** — l'operatore attribuisce il Codice IVA, per gruppo o con «assegna a
   tutti» quando il catalogo è a un'aliquota sola.
3. **Conferma** — solo ora gli articoli entrano, con il Codice IVA in anagrafica e il
   prezzo memorizzato **netto**: scorporato con la funzione esatta se il negozio ha i
   prezzi comprensivi, preso com'è se non li ha.

Un solo percorso, con un ramo su cosa fare del numero.

**Perché non far entrare gli articoli «da definire»:** avrebbero un prezzo lordo scambiato
per netto che circola in margini, report ed eventuali documenti, protetto solo da una
bandierina che qualcuno deve guardare. È lo stesso difetto che questa specifica rimuove,
reintrodotto dalla porta di servizio. Se l'operatore interrompe, non perde dati veri:
perde una preparazione.

**Il precedente da riusare:** l'import CSV prodotti è già a due passi
(`/products/import/preview` poi `/products/import`). Stessa forma, stesso posto dove
innestare l'assegnazione.

---

## 5. Cosa NON fare, e perché

### Il costo d'acquisto resta fuori

**Ha una logica sua.** Unirlo al prezzo non è più costoso, è **sbagliato**.

- Viaggia su un altro campo: `inventory_item.cost`, chiamata separata, non bloccante
  (`shopify-product-push.service.ts:580-601`). **[Shopify]** La spunta del negozio non
  tocca quel campo.
- Ha già una modalità netto/ivato propria, sul **documento d'acquisto**, che scorpora
  con **l'aliquota del fornitore** (`goods-receipt-vat.util.ts:87,103-115`), fermandosi
  di proposito su reverse charge, esenti e fuori campo (`vat-line-calculation.util.ts:44-54`).
- Dargli l'interruttore della scheda articolo userebbe l'aliquota **di vendita**:
  scorporerebbe anche i reverse charge e gli esenti, cioè i casi che il calcolo evita
  apposta. Produrrebbe costi **errati**, non diversi.

**Non allargare `purchasePriceMinor`** insieme al barrato: l'arrotondamento avviene già
a monte, nel calcolo IVA (`vat-line-calculation.util.ts:114-116`). Allargare la colonna
farebbe arrivare lo stesso numero intero di oggi, pagando migrazione e conversione di
tutti i lettori (analitiche di margine, costi congelati sui movimenti, inventario, cassa,
mapper frontend, push Shopify) per **zero effetto osservabile**.

### Le categorie Shopify non danno l'aliquota

- La categoria che VestiFlow interroga restituisce quattro campi — identificativo, nome,
  nome completo, foglia sì/no (`shopify-graphql.client.ts:19-24,84-95`) — nessuno
  fiscale.
- **[Shopify]** L'aliquota risulta da cinque ingredienti (paese, eccezioni per
  collezione, codice imposta della variante, flag imponibile, categoria): la categoria è
  **uno dei cinque**, non il risultato.
- Per i prodotti importati il campo «categoria» di VestiFlow **non è** il vocabolario
  interno: è il tipo prodotto di Shopify, riscritto a **ogni** sincronizzazione
  (`pull:249,288,348`). Qualunque mappatura appesa alla categoria verrebbe ri-chiavata
  sotto i piedi proprio sui prodotti per cui era stata pensata.

**Da scartare anche la mappatura collezione → Codice IVA:** l'import massivo non porta
le appartenenze alle collezioni e anzi **le azzera** (`pull:142,258`), e la fonte usata
restituisce solo le collezioni **manuali**.

### Nessun ripiego «se il prezzo articolo è vuoto prendi quello di Shopify»

Se il vuoto ha un comportamento speciale, il comportamento del sistema dipende da uno
stato invisibile — e quel campo non resta vuoto a lungo. Inoltre, dopo la decisione 4,
il prezzo articolo **non è mai vuoto**: alla creazione viene sempre compilato, sia che il
prodotto nasca in VestiFlow sia che nasca dall'import. La regola coprirebbe un caso che
non esiste.

---

## 5-bis. ⚠️ Difetto VIVO fuori ambito — Ordine fornitore

**Non è una precondizione futura come l'Ordine cliente: è rotto adesso.**

L'Ordine fornitore ha una modalità costi **netto/ivato già attiva**
(`SupplierOrder.costEntryMode`, `schema.prisma:1011`). Ma le sue colonne sono intere:

```
SupplierOrderLine.unitCostMinor         Int    (schema.prisma:1045)
SupplierOrderLine.enteredUnitCostMinor  Int?   (schema.prisma:1047)
```

e il form scorpora con la formula **arrotondata**
(`supplier-order-form.component.ts:370-372`):

```ts
const net = Math.round((gross * 100) / (100 + rate));
```

Digitando **5,02 ivato** al 22% il netto vero sarebbe 411,4754: si memorizza **411**.
Il dato in banca dati è sbagliato di mezzo centesimo, su circa il 18% dei costi ad
aliquota ordinaria.

**Ma il sintomo visibile è uno solo, e va detto.** Riaprendo l'Ordine fornitore
l'operatore rivede **5,02**, perché il form ripesca il valore digitato e non ricostruisce
il netto (`supplier-order-form.component.ts:906`, legge `enteredUnitCost`). Il centesimo
sbagliato compare **quando si importa un Ordine fornitore dentro un Arrivo merce**: lì il
campo Costo si precompila risalendo dal netto memorizzato e mostra 5,01.

Il difetto resta reale — un dato memorizzato deve essere giusto a prescindere da chi lo
guarda — ma **l'urgenza è minore** di quanto sembri, e la misura di §5-ter lo tiene conto.

**Differenza con l'Ordine cliente:** là l'ivato non esiste, quindi nessuno produce mai un
valore da scorporare — è una precondizione dello step futuro. Qui il selettore è acceso e
il centesimo si perde a ogni documento compilato in ivato.

**Perché è qui e non fra gli interventi:** appartiene al mondo acquisti, che questa
specifica tiene separato (§5, «Il costo d'acquisto resta fuori»).

---

## 5-ter. La misura della correzione dell'Ordine fornitore — **CONTENUTO**

Misurata prima di avviarla, perché allargare una colonna obbliga ad adeguare ogni suo
lettore e il precedente delle otto colonne (`4cd32a4`) ne produsse ventitré.

| Area                    | Punti                                                                         |
| ----------------------- | ----------------------------------------------------------------------------- |
| Schema e migrazione     | 3 — le due colonne + una migration con **un solo** `ALTER TABLE`              |
| Backend                 | 3 — `supplier-orders.service.ts` (2), `supplier-order-pdf.service.ts:168` (1) |
| Frontend                | 5 — `supplier-order-api.mapper.ts` (4) + un commento nel model                |
| Test e documentazione   | 4 file                                                                        |
| **Consumatori a valle** | **0**                                                                         |

**Confronto:** `4cd32a4` (le otto colonne) toccò 23 file; `ce5da90` (lo scorporo esatto)
ne toccò 16. **Questa fetta: 6 file più 4 di test.** Sotto la metà, e concentrati — quattro
dei sei appartengono al modulo Ordine fornitore.

**Stima: mezza giornata**, test inclusi.

### La valle è vuota — verificato porta per porta

Margini, costi congelati sui movimenti, valorizzazione di magazzino e analitiche **non si
muovono di un centesimo**:

- il backend **non copia mai** il costo dall'ordine all'arrivo merce: il ponte fra i due
  (`document-supplier-order.util.ts`) legge solo identificativi e quantità
- il costo effettivo della variante, il costo di riferimento dell'articolo e l'ultimo
  prezzo fornitore si alimentano tutti dalla riga dell'**Arrivo merce**, mai da quella
  d'ordine
- l'Ordine fornitore **non tocca il magazzino**: `StockMovement.unitCostMinor` è un
  omonimo su un altro modello
- nelle analitiche l'ordine fornitore entra **solo come conteggio**
- i totali di testata degli ordini già registrati **restano identici**: il calcolo legge il
  totale di riga, non l'unitario. Nessun backfill nella migration.

### I due bivi da decidere prima di partire

**1. Non toccare il motore IVA condiviso.** Lo scorporo arrotondato vive in una funzione
usata da tre maschere — Ordine fornitore, Arrivo merce, Vendita al banco. Cambiarla in
luogo **sposterebbe in silenzio ogni carico e ogni scontrino già registrato**. Le vie
pulite sono due: calcolare l'esatto **localmente** nel servizio dell'ordine fornitore (le
funzioni sono già esposte, tre righe, superficie condivisa zero), oppure **aggiungere** un
campo accanto a quello esistente. **La via da non prendere è modificare il campo
esistente.** È da qui che il lavoro scivolerebbe da contenuto a esteso.

**2. Il gemello Arrivo merce è a due righe di distanza — e va lasciato stare.** Ha lo
stesso difetto e le sue colonne sono **già** larghe: nessuna migration, due righe.
Sembra gratis, ed è per questo che è pericoloso: quella colonna è la sorgente del costo
effettivo della variante, dell'ultimo prezzo fornitore e quindi dei margini. Va misurato a
parte, **non infilato in questa fetta senza dirlo**.

### Due dettagli tecnici che non gridano

- **La conversione al confine di rete.** Con la colonna a decimali il valore arriva al
  frontend come **testo**, non come numero. In un punto c'è un tranello: il valore ha un
  ripiego (_se manca il digitato, usa il netto_), e convertire **prima** del ripiego
  trasformerebbe un costo assente in un costo **zero**. Va convertito dopo.
- **Manca un attrezzo lato server.** Il frontend ha una funzione che «quantizza» il valore
  prima di memorizzarlo; lato server non esiste. O la si aggiunge, o si dichiara
  esplicitamente che l'arrotondamento a sei decimali lo fa la banca dati. È una scelta di
  dottrina: non deciderla prima significa scoprirla a metà lavoro.

### Consegna operativa — come si esegue questa correzione

_Decisioni prese il 07/08/2026. Chi riprende il lavoro può partire da qui senza altro
contesto._

**Le scelte già fatte:**

1. **Si chiama la funzione esatta che esiste già**, non si scrive una formula nuova.
   `netFromGrossExact` è in `api/src/vat/vat-line-calculation.util.ts`, esposta e testata.
   Il servizio dell'ordine fornitore chiamerà quella al posto di `netFromGrossMinor`.
   Non è una quarta copia del calcolo: è lo stesso attrezzo, quello giusto — distinzione
   importante, perché una quarta copia è precisamente ciò che `docs/GUARDIE-MANCANTI.md`
   §8 contesta.
2. **Il motore IVA condiviso non si tocca.** Lo usano tre maschere; cambiarne il
   risultato in luogo sposterebbe in silenzio i valori di ogni carico e scontrino già
   registrato. Va detto però che **il motore ha lo stesso difetto** (arrotonda il netto
   unitario nel ramo dei costi ivati): non è che vada bene, è che va misurato prima.
3. **L'Arrivo merce resta fuori**, e si misura a parte quando si affrontano gli acquisti.
4. **Entrambe le colonne** vanno a `Decimal(16,6)`, anche `enteredUnitCostMinor` che oggi
   riceve solo interi: è il gemello di `DocumentLine.enteredUnitCost`, già decimale, e
   lasciarne una stretta e una larga ricrea l'asimmetria che costa tempo a chi legge.
5. **La migration si applica davvero.** Il database è di test, i dati sono cancellabili,
   nessuno lo sta usando. Applicarla permette la verifica del giro completo su dati veri
   invece che su un database simulato — che accetterebbe qualunque numero e non
   dimostrerebbe nulla.
6. **Nel mapper, la conversione di tipo va DOPO il ripiego.** Il valore ha un ripiego
   («se manca il digitato, usa il netto»): convertire prima trasformerebbe un costo
   assente in un costo **zero**. È l'unico punto dove un errore non griderebbe.
7. **L'attrezzo che quantizza il valore prima di memorizzarlo va aggiunto lato server**,
   in `api/src/common/money.util.ts`, dove sta il resto della dottrina del denaro — non
   si dichiara che l'arrotondamento lo fa la banca dati.

**L'ordine dei passi:**

1. `toStorableMinor` in `common/money.util.ts`, col suo test
2. **il test del giro completo, PRIMA della correzione** — deve essere **rosso**
3. schema + migration applicata, `prisma generate`, typecheck
4. le correzioni, un file alla volta, typecheck dopo ognuno
5. test verde, suite API completa, test del form
6. rilettura del diff per intero

**I due punti dove fermarsi e riferire invece di proseguire:**

- se il test del passo 2 nasce **verde**: qualcosa non torna nella diagnosi
- se dopo il passo 3 il typecheck segnala **molti più di ~10 punti**: la misura era
  sbagliata e il lavoro non è più contenuto

**Il test del giro completo enuncia la regola, non il caso:** «un costo digitato in
modalità ivata, memorizzato e riletto, torna identico» — su un elenco di casi, non sul
solo 5,02.

### Un falso allarme, escluso

La maschera Ordine fornitore calcola l'anteprima dei totali con formule proprie invece di
chiamare il motore condiviso. È una duplicazione da sanare un giorno, ma **non produce un
errore oggi né dopo questa correzione**: riceve sempre valori interi, e su valori interi le
due formule coincidono — c'è già un test in casa che lo dimostra su ventimila casi.

---

## 6. In coda — fuori da questo lavoro, da non perdere

**Difetti del costo**

1. Ogni «Importa catalogo» **azzera il costo di riferimento** dell'articolo sui prodotti
   di origine Shopify: `pull:359-361` scrive vuoto quando il dato remoto manca, senza
   ripiego sul valore presente — mentre la variante il ripiego ce l'ha (`:368-370`). E
   l'import massivo gira sempre senza chiedere i costi (`:142`), quindi il dato remoto è
   **sempre** assente.
2. Sul percorso webhook il costo di Shopify ha la **precedenza** su quello scritto dai
   carichi (`:368-370`), ed entra senza aliquota, senza documento e senza modalità
   dichiarata.
3. Nell'Arrivo merce in modalità «costi ivati» il campo Costo si precompila risalendo
   dal netto (`goods-receipt-form.component.ts:2334-2346`): il giro perde un centesimo
   sui valori con coda (123,97 al 22% torna 123,96).

**Messaggi che mentono all'operatore**

4. Il pulsante «Sincronizza giacenze **da** Shopify» e il messaggio «N nuove, M
   aggiornate»: **«nuove» è sempre zero** — la funzione restituisce solo `unchanged` o
   `skipped`, mai `created` (`shopify-sync.service.ts:529-538`). «Aggiornate» conta
   **divergenze rilevate**, non quantità importate.
5. La nota di divergenza promette «Ripubblicazione programmata», ma tipicamente **non
   parte**: se il valore da pubblicare coincide con l'ultimo pubblicato, la funzione esce
   senza chiamare Shopify (`shopify-inventory-push.service.ts:99-107`). Cioè proprio nel
   caso canonico — il negoziante rettifica a mano e il dato VestiFlow non è cambiato.

**Supporto multivaluta / multipaese (limite noto dichiarato)**

6. Valuta cablata a euro (`pull:326,399`; `business-analytics.service.ts:142,321`).
7. La conversione da/verso i decimali di Shopify assume due decimali
   (`shopify-money.util.ts:4,32`); il frontend conosce già le valute a zero e tre
   decimali, il backend no.
8. La stampa divide sempre per cento e antepone l'euro
   (`common/pdf/money-format.util.ts:1-13`).
9. Ogni sede Shopify che arrivi senza paese viene registrata come italiana
   (`shopify-location-sync.service.ts:309`).

**Altri capitoli, già mappati**

10. **Ordini ricevuti:** `taxes_included` per ordine (varia anche sullo stesso negozio),
    `tax_lines` mai letti, `current_*` per i resi (un ordine interamente rimborsato è
    oggi in coda per diventare corrispettivo), paese di destinazione mai conservato,
    doppia sottrazione dello sconto nel calcolo dell'imponibile.
11. **Modalità ivata sull'Ordine cliente** — precondizione: `SalesOrderLine.unitPriceMinor`
    è `Int` e il backend tronca (`manual-sales-order.util.ts:101`). Oggi non morde perché
    l'Ordine cliente è netto per costruzione; il giorno che si accende l'ivato, sì.
12. **Prima sincronizzazione di un catalogo esistente** (dati su gestionale e su Shopify
    da riconciliare).

---

## 7. Trappole per chi implementa

**Due percorsi che si somigliano e non sono lo stesso.** In
`customer-order-form.component.ts` convivono il salvataggio dell'**Ordine cliente**
(`buildSavePayload`, manda il valore digitato grezzo) e quello delle **righe documento**
(`buildRegistryLines`, manda il netto scorporato con `netFromDisplayed`). Due analisi
indipendenti li hanno confusi. Prima di toccare l'uno, verificare di non essere nell'altro.

**L'errore di Prisma indica il campo sbagliato.** In un create annidato, un campo di
troppo fa rispondere `Unknown argument 'variantId'` — cioè accusa un campo corretto.
Costò due giorni di produzione ferma ad agosto 2026. Se compare, cercare il campo **in
più**, non quello nominato.

**Il mock di Prisma nei test accetta qualsiasi oggetto**: non conosce lo schema, quindi
non può accorgersi di un campo che non è una colonna. Il test che legge le colonne vere
da `Prisma.dmmf` (`documents.service.spec.ts:319-344`) è il modo giusto, ed è da
estendere ai payload gemelli.

**Ogni regola qui dentro va resa impossibile da violare, non solo scritta.** In ordine di
forza: il **tipo** (errore in editor) → lo **schema del database** → un **test che
enuncia la regola**, non l'istancia → uno **script in `npm run lint`** (il progetto ha
già `check:tokens`, `check:rls`, `check:subscriptions`, `check:table-views`). Un commento
non è una guardia: nel caso di agosto la regola era scritta in italiano tre righe sopra
il punto che la violava.
