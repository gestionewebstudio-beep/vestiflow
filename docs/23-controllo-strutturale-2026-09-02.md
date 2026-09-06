# 23 — Controllo strutturale del codice

**Aperto:** 02/09/2026 · **Ramo:** `feature/pagamenti-tesoriera` (611 commit avanti su
`develop`, 813 su `main`, zero indietro: contiene tutto)

**A che serve:** censire difetti trovati **leggendo il codice**, non i documenti. Ogni voce
cita il file e la riga, e dice se il difetto è attivo oggi o condizionato.

⛔ **Non è un documento di soluzione.** Descrive cosa fa il codice adesso. Le correzioni
sono decisioni separate.

⚠️ **Metodo dichiarato.** Il primo giro di questo controllo si era appoggiato ai documenti
del repository e ne aveva ereditato le conclusioni. Dal secondo giro il criterio è opposto:
**i documenti non fanno fede**, si verifica sul codice, e dove documento e codice divergono
è il documento a essere segnalato.

---

## Indice per gravità

| #         | Difetto                                                           | Attivo oggi                        |
| --------- | ----------------------------------------------------------------- | ---------------------------------- |
| [1](#1)   | I documenti di vendita non passano dal motore IVA comune          | ✅ sì                              |
| [1a](#1a) | Reverse charge in vendita: totale gonfiato dell'IVA               | ⚠️ se il codice porta aliquota>0   |
| [1b](#1b) | L'aliquota IVA è arrotondata a intero e finisce nel calcolo       | ✅ sì                              |
| [1c](#1c) | **Modalità ivata: si scorpora un'IVA che non c'è → prezzo −18%**  | ⚠️ reverse charge + modo ivato     |
| [2](#2)   | Due formule di testata diverse, una è quella dichiarata errata    | ⚠️ solo con sconto documento       |
| [3](#3)   | Due sistemi di numerazione, e un commento afferma il contrario    | ⚠️ latente                         |
| [4](#4)   | Corrispettivi: raggruppati in UTC, stampati in ora italiana       | ✅ sì                              |
| [5](#5)   | «Movimenta magazzino» non conosce `ProductKind.service`           | ✅ sì                              |
| [6](#6)   | Quantità intere ovunque, con unità di misura continue             | ✅ sì                              |
| [7](#7)   | Le giacenze possono restare disallineate da Shopify, in muto      | ✅ sì                              |
| [8](#8)   | Il conteggio delle ripubblicazioni riuscite è falso               | ✅ sì                              |
| [9](#9)   | La guardia sui permessi salta 8 controller su 33                  | ✅ sì (guardia, non codice)        |
| [10](#10) | `update()` è un metodo da 885 righe con 65 rami                   | ✅ sì                              |
| [11](#11) | Lost update sul ricevuto dell'ordine fornitore                    | ✅ sì                              |
| [12](#12) | OAuth Shopify: scritture non compensate, stato ibrido             | ⚠️ se la chiamata a Shopify cade   |
| [13](#13) | Eliminazione prodotto: Shopify prima, locale dopo                 | ⚠️ se la cancellazione locale cade |
| [14](#14) | Ricerca testuale senza indici: scansione a ogni battuta           | ✅ sì                              |
| [15](#15) | **Le vendite a DDT e Fattura valgono 0 € nel cruscotto**          | ✅ sì                              |
| [16](#16) | La Nota di credito non riduce i ricavi, il Reso al banco sì       | ✅ sì                              |
| [17](#17) | Pagamenti: le rate esistono solo in acquisto e non hanno azione   | ✅ sì (funzione incompleta)        |
| [18](#18) | La dashboard carica l'intero inventario in memoria                | ✅ sì                              |
| [19](#19) | **Inventario fisico: il delta si applica a uno stato cambiato**   | ✅ sì — P0                         |
| [20](#20) | **Finalize inventario: effetti applicati, poi 403 sul documento** | ✅ sì — P0                         |
| [21](#21) | **Doppio finalize concorrente: nessun claim atomico**             | ✅ sì — P0                         |
| [22](#22) | Restore delle prenotazioni non atomico: Impegnata duplicata       | ✅ sì                              |
| [23](#23) | Il prezzo di vendita finisce nella colonna del COSTO              | ✅ sì                              |
| [24](#24) | I movimenti manuali scavalcano il registro seriali                | ✅ sì                              |
| [25](#25) | I test su PostgreSQL reale non girano in CI                       | ✅ sì                              |

---

<a id="1"></a>

## 1 · ⛔ I documenti di VENDITA non passano dal motore IVA comune

```text
computeVatLineAmounts  →  Arrivo merce · Ordine fornitore · Vendita al banco · Corrispettivo manuale
documents.service.ts   →  NON lo importa
                          Fattura · Fatt. accompagnatoria · Nota di credito · Proforma
                          DDT vendita · Ordine cliente · Preventivo · Trasferimento · Rettifica
```

Il percorso generico calcola l'IVA per conto proprio: `api/src/documents/documents.service.ts:3759`
(imponibile di riga) e `:4014` (`computeTotals`).

⛔ **`calculationMode` e `vatAffectsSupplierTotal` hanno ZERO occorrenze** in tutto
`documents.service.ts`. Il motore comune (`api/src/vat/vat-line-calculation.util.ts:164`)
li conosce entrambi; il percorso che emette le fatture no.

⚠️ **La famiglia che non usa il motore fiscale è quella dove l'IVA è un obbligo di legge.**

<a id="1a"></a>

### 1a · Reverse charge in vendita: il totale è gonfiato dell'IVA

`computeTotals` somma l'imposta di ogni riga con `vatRatePercent > 0`, senza chiedersi se
vada addebitata.

⭐ **Il caso non è teorico.** `api/src/vat/vat-code-seed.data.ts:59-64` semina sei nature di
**vendita** con `defaultCalculationMode: 'reverse_charge'`:

```text
N6.1 rottami · N6.2 oro e argento · N6.3 subappalto edilizia
N6.4 fabbricati · N6.5 telefoni cellulari · N6.6 prodotti elettronici
```

Un rivenditore di telefonia o elettronica che emette una fattura B2B con codice N6.5 al 22%
ottiene un totale con l'IVA che non deve addebitare. Il motore comune lo saprebbe fare —
`lineGrossMinor = lineNetMinor` quando l'IVA non è esposta (`vat-line-calculation.util.ts:198`).

⚠️ **Si propaga ai riepiloghi**: la regola di progetto dice che elenchi e report sommano i
**totali di testata**. Il totale sbagliato entra in ogni aggregato.

⚠️ **Condizione**: il difetto si manifesta se il codice IVA di vendita porta un'aliquota
maggiore di zero — che è il modo naturale di configurare un reverse charge, perché l'imposta
teorica esiste. Con aliquota 0 non si manifesta.

### ⛔ E il CLIENT sbaglia allo stesso modo, il che toglie l'unico segnale

Verificato il 02/09/2026 sul frontend. Il motore corretto **esiste anche lì**:
`src/app/domain/documents/utils/document-vat.util.ts:153-181` conosce `calculationMode`,
`vatIsExposed` e calcola `lineGrossMinor = exposed ? net + vat : net` — è il gemello fedele
di quello del backend.

Chi lo usa, e chi no:

| Maschera                         | come decide se l'IVA entra nel totale              |
| -------------------------------- | -------------------------------------------------- |
| Arrivo merce                     | `countsVatInTotal: vat.vatAffectsSupplierTotal` ✅ |
| Ordine fornitore                 | `countsVatInTotal: amounts.affects` ✅             |
| Corrispettivo manuale            | `countsVatInTotal: this.lineCountsVat(index)` ✅   |
| **Ordine cliente**               | `countsVatInTotal: vatRate > 0` ⛔                 |
| **Fattura · DDT · Nota credito** | calcolo proprio, nessun flag ⛔                    |

`sales-document-form.component.ts:1090-1107` ricava l'imposta dalla sola
`vatRatePercent`, come fa il server.

⭐ **Che client e server sbaglino uguale è la ragione per cui il difetto è sopravvissuto**:
non esiste discrepanza fra il totale mostrato mentre si compila e quello salvato. Se il
client avesse ragione, la differenza sarebbe saltata all'occhio al primo documento.

⚠️ **Quindi la correzione è su due lati**, e vanno fatti insieme: correggere solo il server
farebbe comparire una discrepanza a schermo dove oggi non c'è.

<a id="1b"></a>

### 1b · L'aliquota è arrotondata a intero, e non è un problema di display

```ts
// api/src/vat/vat-snapshot.util.ts:63
return Math.round(snapshot.ratePercent);
```

La colonna è `Decimal(7,4)` e lo schema dichiara «decimali ammessi» (`schema.prisma:2543`).

⛔ **Quel valore non finisce in un'etichetta: alimenta il calcolo.** `documents.service.ts`
lo scrive sulla riga (`:1997`, `:2078`, `:2172`) e `computeTotals` ne ricava l'imposta
(`:4023`).

Le percentuali di compensazione agricola — 7,3% · 8,3% · 8,8% · 12,3% — e il 4,4% diventano
7, 8, 9, 12, 4. Ortofrutta, aziende agricole, caseifici: fatture con imposta sbagliata.

⚠️ `docs/DA-FARE.md:3206` lo censiva il 22/08 come «rischio per aliquote frazionarie». Non è
un rischio: **il percorso di calcolo passa di lì**.

---

<a id="1c"></a>

## 1c · ⛔ In modalità «prezzi ivati» la maschera di vendita scorpora un'IVA che non c'è

Il più grave della famiglia, perché **corrompe il prezzo memorizzato**, non un totale
mostrato.

```text
motore comune     entryIncludesVat()   vat-line-calculation.util.ts:53
                  costEntryMode === 'vat_included' && vatIsExposed(mode) && rate > 0

maschera vendita  netFromDisplayed()   sales-document-form.component.ts:2994
                  pricesIncludeVat()                                    && rate > 0
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                       il controllo sulla modalità NON c'è
```

Il commento del motore comune dice esattamente perché quel pezzo serve: «Reverse charge,
esenti e fuori campo non espongono IVA: **il valore digitato è già netto**».

⛔ **Conseguenza**: su una riga con codice reverse charge al 22%, in modalità «prezzi
ivati», il client scorpora il 22% da un prezzo che l'IVA non la contiene. Il netto
memorizzato è **inferiore del 18,03%**, e il client lo converte **prima di inviarlo**
(`lineUnitNetMinor` → `netFromDisplayed`): il server riceve già il valore sbagliato e lo
persiste.

⚠️ **Non è un caso di laboratorio.** La modalità netto/ivato è una **memoria
dell'operatore per tipo documento**: un negozio che lavora al dettaglio ivato eredita
«ivato» anche sulla fattura B2B in reverse charge, senza sceglierlo.

⭐ La conversione in sé è fatta bene — scorporo esatto in memorizzazione, arrotondato solo
in visualizzazione, coerente con la regola dei sei decimali. Manca solo la condizione che
decide **se** scorporare.

---

<a id="2"></a>

## 2 · ⛔ Due formule per lo stesso totale, e una è quella dichiarata errata

Con sconto documento diverso da zero:

| percorso                                       | formula dell'imposta                             |
| ---------------------------------------------- | ------------------------------------------------ |
| generico — `documents.service.ts:4037`         | `lineVatFromNetExact(discountedLineTotal, rate)` |
| Arrivo merce — `goods-receipt-vat.util.ts:201` | `Math.round((discountedNet * rate) / 100)`       |

⛔ **La seconda è testualmente la forma che la funzione canonica dichiara difettosa**, in
`vat-line-calculation.util.ts:134`:

> «La forma precedente — `round(nettoArrotondato × aliquota)` — perdeva un centesimo ogni
> volta che l'imponibile portava una coda decimale»

⚠️ **Perché nessuno l'ha vista**: con sconto documento a zero i due percorsi coincidono —
l'Arrivo merce somma `lineVatTotalMinor`, già calcolato bene dal motore. La divergenza si
apre **solo** quando c'è uno sconto di testata.

⛔ E il percorso generico ignora `vatAffectsSupplierTotal`, che l'Arrivo merce rispetta:
due motori di testata con due comportamenti fiscali diversi sullo stesso concetto.

---

<a id="3"></a>

## 3 · ⛔ Due sistemi di numerazione, e un commento afferma il contrario

```text
documenti dell'operatore   DocumentCounter   via document-numbering.util
evasione ordini online     DocumentSequence  a mano, online-sale-fulfillment.service.ts:608
```

Il commento su quel metodo dice **«Numeratore atomico condiviso con il dominio documentale
(§2.3)»**. Non lo è: il dominio ha cambiato sistema, questo è rimasto al vecchio.

Diverge anche il riferimento:

```text
formatDocumentReference    PREFISSO[-SERIE]-NUMERO   «l'anno NON fa parte del riferimento»
formatReference (online)   PREFISSO-ANNO-NUMERO
```

⚠️ **Oggi non collidono** perché `online_sale` è un tipo dedicato che l'operatore non crea a
mano. Il giorno in cui entra nel Registro con gli altri, i numeri vengono da due contatori
indipendenti.

⛔ **Collegato — un omonimo pericoloso.** `api/src/documents/document-totals.util.ts:17`
contiene una **seconda `nextDocumentNumber`**, basata sul sistema vecchio, con lo stesso
nome di quella viva e nella stessa cartella. Il file dichiara `DocumentTotals` e non calcola
nessun totale: il nome mente due volte. Un import distratto prende il contatore sbagliato e
niente protesta.

---

<a id="4"></a>

## 4 · ⛔ Corrispettivi: raggruppati in UTC, stampati in ora italiana

```text
corrispettivi-sort.util.ts:76        giornoUtc()           Date.UTC(...)
corrispettivi-export.service.ts:131  Intl.DateTimeFormat   timeZone: 'Europe/Rome'
```

Una vendita online delle **00:30 del 2 settembre** italiane ha `placedAt = 01/09 22:30Z`:
finisce nel totale del **1° settembre**, e nell'export si legge **02/09/2026 00:30**.

⚠️ Il registro corrispettivi è per **giornata solare italiana**: la coerenza interna è
garantita, la corrispondenza col giorno fiscale no.

**Stesso schema sui filtri periodo**: `online-sales.service.ts:238` usa `T00:00:00Z`
sull'estremo inferiore. L'estremo superiore è stato corretto a `23:59:59.999Z` con un
commento che spiega perché — **la correzione è stata fatta a un estremo solo**, e le prime
due ore di ogni giorno italiano cadono nel giorno prima.

---

<a id="5"></a>

## 5 · ⛔ «Movimenta magazzino» non sa cosa sia un servizio

```text
schema.prisma:2401     «Flag carica magazzino: righe spese/servizi non movimentano stock»
goods-receipt-form     loadsStock: this.fb.control(true)     in 4 punti
sales-document-form    loadsStock: this.fb.control(false)    default OPPOSTO
```

Il meccanismo per escludere i servizi **esiste a livello di riga**, ma nulla lo collega a
`ProductKind.service` dell'anagrafica.

⛔ **`ProductKind.` ha zero occorrenze in `api/src` fuori dai DTO**: il tipo si memorizza,
si mostra e non decide niente. Un articolo «Servizio» in un Arrivo merce carica magazzino e
genera uno `StockMovement`, salvo che l'operatore tolga la spunta ogni volta.

⚠️ Due maschere partono da default opposti senza che nulla dica perché.

⛔ **Stessa forma per `InventoryTrackingMode`**: unico consumo in
`inventory-serial.util.ts:63`. I valori `none`, `standard` e `lot` non incidono su nulla —
marcare un articolo «nessun tracciamento» non impedisce giacenze e movimenti.

---

<a id="6"></a>

## 6 · ⛔ Quantità intere ovunque, e unità di misura che promettono il contrario

```text
schema.prisma   onHand Int · committed Int · quantity Int   (15 modelli)
DTO             @IsInt() @Min(0) quantity                   (create-document, goods-receipt,
                                                             transfer, adjustment)
seed U.M.       ['pz', 'conf', 'kg', 'g', 'lt', 'm']        unit-of-measure-seed.data.ts:14
```

L'applicazione **offre** kg, g, lt, m — grandezze continue — e l'API **rifiuta con 400**
qualunque quantità non intera.

Non registrabili: 1,5 kg di gastronomia, 2,5 m di tubo, 0,75 lt di vernice, il tessuto al
metro (che è abbigliamento).

⚠️ **Non è nei documenti del repository.** `docs/03c` cita «un tenant che vende a peso» solo
a proposito del ripiego `'pz'`. Il vincolo intero non è mai stato rilevato come blocco.

⭐ **È la modifica più costosa dell'elenco** — migration su 15 modelli più tutti i calcoli —
e ogni mese che passa aggiunge codice che la dà per scontata.

⛔ **Conseguenza già in casa**: `InventoryLot.quantity` è `Int`, quindi i lotti ereditano lo
stesso limite.

---

<a id="7"></a>

## 7 · ⛔ Le giacenze possono restare disallineate da Shopify, in silenzio

Quattro fatti che si sommano:

| #   | Fatto                                                | Evidenza                                            |
| --- | ---------------------------------------------------- | --------------------------------------------------- |
| 1   | **Nessuno scheduler nell'API**                       | `@Cron`, `ScheduleModule`, `setInterval` → zero     |
| 2   | Il pull inventario parte **solo da un clic**         | `shopify.controller.ts:200`                         |
| 3   | La riparazione è appesa a quel pull                  | `shopify-inventory-pull.service.ts:164`             |
| 4   | Il push è **fire-and-forget senza coda persistente** | `channel-sync.facade.ts:101` — `void … .catch(log)` |

⛔ Se il push fallisce (rete, quota, riavvio), Shopify **non cambia**, quindi **non manda
nessun webhook**, quindi nessuna riconciliazione parte. La divergenza è permanente.

### 7a · Il rimedio non può funzionare nel caso più comune

```text
push riuscito                        lastPushedAvailable = 10
correzione a mano in Shopify Admin → 3
webhook: 3 ≠ 10 atteso             → Caso D → mismatchDetected = true
retryPending → pushLevel           → lastPushedAvailable(10) === publishable(10)
                                   → 'unchanged'  ⛔ NON PUBBLICA NIENTE
```

`shopify-inventory-push.service.ts:104` — la guardia «unchanged» blocca esattamente la
ripubblicazione che il Caso D ha chiesto. Il flag resta acceso per sempre.

⚠️ Il commento in `shopify-inventory-republish.service.ts:41` dice «la ripubblicazione
riuscita torna indietro come webhook e la riconciliazione la spegne»: se non si pubblica
nulla, non torna indietro niente.

### 7b · Gli esiti del push non li consuma nessuno

`pushLevels` ritorna `void` e scarta ogni `ShopifyInventoryPushResult`. Sono tutti muti:

```text
location_not_linked              una sede non mappata non sincronizza mai
variant_not_linked               idem per l'articolo
missing_write_inventory_scope    permesso mancante sull'app: solo logger.debug
shopify_error                    errore inghiottito
```

⛔ I **prodotti** hanno `shopifySyncStatus` + `shopifyLastError` sulla riga; le **giacenze**
no. `mismatchDetected` non è esposto da nessuna API né da nessuna schermata (zero
consumatori fuori dai due servizi che lo scrivono).

### 7c · La scorta di sicurezza è un parametro morto

`shopify-publishable-available.util.ts:13` accetta `safetyStock`; **entrambi** i chiamanti
passano `0` cablato, e non esiste colonna nello schema. Per chi vende lo stesso pezzo in
negozio e online è l'unica difesa contro l'oversell dell'ultimo pezzo.

### 7d · Gli SKU importati vengono riscritti, e poi ripubblicati su Shopify

`shopify-product-pull.service.ts:435` — SKU vuoto o duplicato diventa `SHOPIFY-<id>` **senza
segnalazione**, mentre `regole-gestionale` prescrive «importati e segnalati come anomalie».

⛔ Il seguito è peggio: `shopify-variant-payload.util.ts:61` rimanda `sku` a Shopify. Al
primo push il negozio del cliente si ritrova lo SKU inventato da VestiFlow al posto del
proprio campo vuoto — modifica di un dato di cui **Shopify è owner**.

⚠️ Stesso file, `:83`: `row['option1'] = byName.get(nome) ?? nome` — se il valore manca si
manda **il nome dell'opzione come valore** («Taglia» invece di «M»). `option2` e `option3`
non hanno il ripiego: asimmetria non spiegata.

### 7e · `currency: 'EUR'` imposto nel pull

`shopify-product-pull.service.ts:319` e `:390` — non è un `??` di ripiego come negli altri
29 punti: è imposto. Un negozio Shopify in valuta diversa importa prezzi etichettati euro, e
un negozio di prova US/USD è già collegato al progetto.

---

<a id="8"></a>

## 8 · ⛔ Il conteggio delle ripubblicazioni riuscite è falso

`shopify-inventory-republish.service.ts:74-76` fa `succeeded += 1` dopo
`await pushLevel(...)`. Ma `pushLevel` **cattura l'errore internamente** e ritorna
`{ pushed: false, reason: 'shopify_error' }` (`shopify-inventory-push.service.ts:144`): non
rilancia mai, quindi il `catch` non scatta.

⛔ Il log dice **«50/50 riuscite, 0 ancora in coda»** anche quando Shopify ha rifiutato
tutto. È una misura che mente nella direzione rassicurante.

---

<a id="9"></a>

## 9 · ⛔ La guardia sui permessi salta 8 controller su 33 e dichiara di coprirli

```js
// scripts/check-endpoint-gates.mjs:73
if (!/TenantPermissionsGuard/.test(head)) continue;
```

Un controller che **non nomina quel guard** esce dal controllo, e lo script conclude
«✓ porte: 33 controller, ogni endpoint a permessi ha la sua». Misurato, gli esclusi:

```text
admin-support-sessions · admin-tenants · auth · health
shopify-webhooks · company-profile · tenant-backup · tenant-users
```

⭐ **Oggi sono tutti protetti** — guard di classe `PlatformAdminGuard`, `RolesGuard`,
`TenantOwnerGuard`; i webhook stanno su HMAC verificato con `timingSafeEqual`. Non c'è un
buco aperto: il difetto è **nella rete**, cieca proprio dove la dimenticanza costerebbe di
più.

---

<a id="10"></a>

## 10 · ⛔ `documents.service.update()` è un metodo da 885 righe

Misurato su `api/src/documents/documents.service.ts:1539`:

```text
885 righe · 65 rami if/else · 40 await · 9 livelli di annidamento
```

È il metodo che salva la modifica di **nove tipi documento**, con transazione, movimenti,
riconciliazioni, prenotazioni e numerazione dentro lo stesso corpo.

⚠️ **Non è una nota di stile.** I difetti [1](#1), [1a](#1a) e [2](#2) vivono in questo
file, e la ragione per cui nessuno li ha visti è che stanno dentro un corpo in cui non si
può tenere a mente il percorso completo. Ogni modifica qui rischia una regressione su un
tipo documento che non si stava guardando.

Il resto del file (4.153 righe complessive) ha altri quattro metodi sopra le 200 righe:
`cancel` 324, `confirmDocumentTx` 224, `createDocumentRecord` 205, `getById` 165.

⭐ **Nota positiva sul modulo**: solo 6 dipendenze iniettate e nessun `forwardRef` in tutto
il backend — non ci sono cicli fra moduli. Il problema è la lunghezza dei corpi, non
l'architettura dei moduli.

---

<a id="11"></a>

## 11 · ⛔ Lost update sul ricevuto dell'ordine fornitore

`api/src/documents/document-supplier-order.util.ts:218` e `:269`:

```ts
const nextReceived = Math.max(0, orderLine.receivedQuantity + delta);
await tx.supplierOrderLine.update({
  where: { id: lineId },
  data: { receivedQuantity: nextReceived },
});
```

⛔ **È un read-modify-write scritto come valore assoluto.** Due Arrivi merce salvati in
parallelo sullo stesso ordine leggono entrambi `receivedQuantity = 0`, entrambi scrivono
`0 + 5 = 5`: il ricevuto risulta **5 invece di 10**, e l'ordine si dichiara concluso quando
non lo è.

⚠️ **`Math.max(0, …)` nasconde anche il sintomo**: il valore non va mai negativo, quindi
l'anomalia non salta all'occhio — resta solo un ordine con un residuo sbagliato.

⚠️ Lo stesso vale per la guardia sulla quantità eccessiva (`delta > remaining`, riga 258):
è valutata su un valore letto, quindi due arrivi concorrenti possono entrambi superare
l'ordinato.

⭐ **Il progetto conosce la tecnica giusta e la usa altrove**, ed è ciò che rende questo un
difetto e non una scelta:

```text
inventory-level-delta.util.ts:36    { increment: delta }        atomico lato DB
committed-delta.util.ts:32          { increment: delta }        atomico lato DB
stock-reservation.service.ts:180    updateMany + where status   compare-and-swap idempotente
document-supplier-order.util.ts     receivedQuantity: valore    ⛔ letto e riscritto
```

Il commento di `inventory-level-delta.util.ts` dice esplicitamente «due transazioni
concorrenti sulla stessa variante+location non producono lost update». Sul contatore
dell'ordine fornitore quella disciplina non è stata applicata.

---

<a id="12"></a>

## 12 · ⛔ OAuth Shopify: le scritture non sono compensate

`api/src/shopify/shopify-oauth.service.ts`, in quest'ordine:

```text
:151  $transaction  →  salva la credenziale cifrata E cancella lo ShopifyOAuthState
:160  await this.shopifyAdmin.getShop(...)          ⛔ nessun try/catch
:163  shopifyConnection.upsert  →  status = connected
```

Se la chiamata a Shopify cade (rete, negozio in manutenzione, token rifiutato), l'eccezione
risale e resta uno **stato ibrido**: token valido salvato, `ShopifyConnection` mai portata a
`connected`, e lo state OAuth già consumato.

⚠️ **La conseguenza non è solo estetica**: parti del sistema che leggono la credenziale si
comportano come connesse, mentre il pannello dichiara il contrario.

---

<a id="13"></a>

## 13 · ⛔ Eliminazione prodotto: prima Shopify, poi il locale, senza compensazione

`api/src/products/products.service.ts:897-917` cancella il prodotto **su Shopify**, poi
esegue `prisma.product.delete`. Se la cancellazione locale fallisce (vincolo residuo,
timeout, deadlock), il prodotto è già sparito dal negozio online e resta nel gestionale —
il contrario di quello che il messaggio d'errore promette per il caso `shopify_error`
(«Il prodotto non è stato rimosso dal gestionale»).

⭐ **Il resto del metodo è fatto bene**: guardia sui movimenti di magazzino con messaggio
che propone l'archiviazione, e tre messaggi distinti per i modi in cui Shopify può
rifiutare.

⚠️ **Difesa in profondità mancante**, riga 917: `prisma.product.delete({ where: { id } })`
senza `tenantId`. Non è sfruttabile — il prodotto è già stato letto con il filtro tenant —
ma è la stessa classe di omissione di `syncSupplierOrderConclusion`
(`document-supplier-order.util.ts:143`).

⭐ **Pattern comune fra 12 e 13**: due scritture su due sistemi, nessuna compensazione se la
seconda fallisce. Vale la pena trattarlo come una classe, non come due casi.

---

<a id="14"></a>

## 14 · ⛔ La ricerca testuale non ha indici: scansione sequenziale a ogni battuta

```text
contains: nel backend              61 occorrenze  →  ILIKE '%testo%'
estensione pg_trgm                 0 migration
indici GIN / GiST                  0 migration
```

`ILIKE '%x%'` **non può usare un indice B-tree** in PostgreSQL. La ricerca prodotti
(`products.service.ts:153-161`) è cinque `contains` in OR, di cui due con subquery su
`variants`:

```text
articleCode · name · brand · variants.sku · variants.barcode
```

Su un catalogo da 20.000 articoli e 100.000 varianti è una scansione completa di due
tabelle **a ogni battuta** del campo di ricerca.

⚠️ Non si vede sui cataloghi di prova, e si vede subito su un ferramenta o un'enoteca —
cioè le merceologie verso cui il prodotto vuole aprirsi.

⛔ **E i filtri prescritti non hanno indice**: le regole di progetto chiedono «Prodotti:
categoria, brand, stagione», e `schema.prisma:765-790` indicizza `status`, `name`,
`importHandle`, `shopifyProductId`, `tiktokProductId` — non `brand`, `category`, `season`.
Che comunque non sarebbero usati, perché il filtro è `equals … mode: 'insensitive'`, che
richiede un indice funzionale su `lower()`.

---

<a id="15"></a>

## 15 · ⛔ Le vendite a DDT e Fattura valgono ZERO nel cruscotto, col costo pieno

La catena, verificata anello per anello:

```text
1  document-stock-unload-sync.util.ts:203
   lo scarico di vendita (DDT vendita, Fatt. accompagnatoria) crea movimenti
   StockMovementType.sale  con  sourceLineId  valorizzato

2  business-analytics.service.ts:36-39
   SALE_REPORT_MOVEMENT_TYPES include `sale` → quei movimenti entrano nel report

3  movement-sales-revenue.util.ts:51
   ricavo = documentLineTotal.get(sourceLineId)   ossia  lineGrossTotalMinor

4  documents.service.ts:3976  (toLineCreateData)
   il percorso generico NON scrive mai lineGrossTotalMinor
   → resta al default dello schema:  0
```

⛔ **Il ricavo di quelle vendite è 0 €. Il costo no**: è congelato sul movimento
(`totalCostMinor`) ed è valorizzato. Il cruscotto mostra quindi un **margine negativo pari
all'intero costo della merce venduta**.

⭐ **Perché è nato**: il commento di `RevenueLineMaps` dichiara l'intenzione —
«`sourceLineId` (DocumentLine) → totale lordo di riga: **store_sale / store_return**». Il
progettista aveva in mente la sola Vendita al banco, che infatti popola la colonna
(`store-sales.service.ts:490`). Ma il codice **non filtra per tipo documento**: prende
qualunque movimento di vendita con `sourceLineId`, e dal 15/08/2026 anche i DDT e le Fatture
accompagnatorie ne producono uno per riga.

⚠️ **È il difetto figlio del punto [1](#1)**: le colonne IVA e lordo della riga
(`lineGrossTotalMinor`, `lineVatTotalMinor`, `supplierPayableLineMinor`,
`reverseChargeVatMinor`, `nonDeductibleVatMinor`) esistono nello schema e le popolano solo
i percorsi che usano il motore comune. Il percorso generico non le conosce: `ComputedLine`
non le dichiara.

⚠️ **Nessun test lo prende**: il calcolo è corretto per ogni percorso che scrive la colonna,
e chi non la scrive non viene esercitato da quei test.

---

<a id="16"></a>

## 16 · ⛔ La Nota di credito non riduce i ricavi, il Reso al banco sì

Lo stesso fatto economico — merce che rientra da un cliente — produce **due movimenti di
tipo diverso** a seconda della maschera che lo registra:

```text
Reso al banco     store-sales.service.ts:1167    movementType: StockMovementType.return
Nota di credito   documents.service.ts:2860      nessun movementType → default `load`
                  (document-goods-receipt-sync.util.ts:211)
```

⛔ `SALE_REPORT_MOVEMENT_TYPES` (`business-analytics.service.ts:36-39`) contiene `sale`,
`online_sale` e `return`. **Non contiene `load`**: il rientro da nota di credito è quindi
indistinguibile da un carico da fornitore e non tocca i ricavi.

⚠️ `document-type.util.ts:28` dichiara l'intenzione — «Il verso economico negativo lo dà il
tipo, non il segno» — ma **nessun consumatore economico legge `credit_note`**: il tipo non
compare né in `analytics` né in `corrispettivi`.

⚠️ **Oggi il danno è mascherato dal difetto [15](#15)**: la vendita a DDT/Fattura vale già
0 €, quindi non c'è nulla da ridurre. Corretto il 15 senza correggere questo, la nota di
credito smetterebbe di annullare la vendita che rettifica.

---

<a id="17"></a>

## 17 · ⏸ Pagamenti: le rate esistono solo in acquisto, e non hanno un'azione propria

Stato misurato, non giudizio: parte è funzione non ancora scritta, parte è difetto.

```text
DocumentPaymentInstallment   scritto SOLO da goods-receipt-workflow.service.ts:1423-1425
                             cioè dalla sola Registrazione fattura (acquisti)
letto da                     document-pdf.service.ts (stampa) · documents.service (dettaglio)
outstandingMinor             schema.prisma:2237 — «0 per gli altri tipi», dichiarato
filtro Da saldare/Saldate    acceso solo su Registrazione fattura ✅ correttamente
```

⭐ **La disciplina è rispettata**: il filtro «Da saldare» è acceso solo dove la colonna è
popolata (`document-sales-register.config.ts:281`). Se fosse acceso sulle vendite, direbbe
che ogni fattura emessa è già saldata — perché `outstandingMinor` vale 0 per costruzione.

⛔ **Il difetto è che `settled` non ha un comando proprio.** Si scrive in un solo punto, nel
salvataggio della fattura d'acquisto: per marcare una rata come pagata bisogna **riaprire e
risalvare il documento**, il che rimette in moto tutta la riconciliazione del salvataggio —
comprese le uscite verso i canali. Registrare un incasso non dovrebbe costare un
salvataggio documentale.

⏸ **Per le vendite non esiste nulla**: nessuna rata, nessun residuo, nessuno scadenzario
incassi. È il lavoro che il ramo `feature/pagamenti-tesoriera` porta il nome di fare, e in
`docs/VestiFlow_Analisi_Pagamenti_Tesoreria_v3_0_15-08-2026.md` c'è l'analisi. Qui è
registrato solo per dire che **il codice oggi non lo copre**.

---

<a id="18"></a>

## 18 · ⛔ La dashboard carica l'intero inventario in memoria a ogni apertura

`business-analytics.service.ts:376` — `aggregateInventoryValuation`:

```ts
const levels = await this.prisma.inventoryLevel.findMany({
  where: { tenantId, ...inventoryScope },
  select: {
    available: true,
    variant: { select: { sellingPriceMinor: true, purchasePriceMinor: true } },
  },
});
```

⛔ **Nessun `take`, nessuna aggregazione lato database.** Ogni riga di giacenza del tenant
viene trasferita e sommata in Node: 20.000 varianti su 3 sedi sono **60.000 righe con join**
a ogni apertura del cruscotto.

⭐ **La somma in sé è fatta con cura** — `Prisma.Decimal`, arrotondamento una volta sola alla
fine, con un commento che spiega perché la versione precedente in virgola mobile sbagliava.
Il difetto è **dove** avviene, non come.

⚠️ **Piccola incoerenza nello stesso ciclo** (`:404-405`): il valore usa
`Math.max(0, level.available)`, il conteggio unità usa `level.available` **senza clamp**. Su
un magazzino con giacenze negative le due metriche della stessa schermata seguono criteri
diversi, e nulla lo dichiara.

### ⛔ E il difetto vero è più grosso: si valorizza il DISPONIBILE, non la giacenza

⭐ **Rilievo dell'audit esterno (REP-001), verificato e più preciso del mio.** La query
seleziona `available`, non `onHand`:

```text
onHand 10 · committed 4 · available 6
confermare un ordine cliente        →  committed 4, available 6
valore di magazzino                 →  scende come se 4 pezzi fossero già usciti
```

⛔ **L'Impegnata riduce la vendibilità, non la presenza fisica.** Il valore del magazzino
cambia alla sola prenotazione, senza che si sia mosso un pezzo — e con esso il margine
mostrato al titolare.

⚠️ Prima di correggere va deciso il significato dei KPI: «valore di magazzino» (fisico,
`onHand`) e «valore vendibile» (`available`) sono due numeri diversi e possono servire
entrambi.

---

# Parte II — riscontro dell'audit esterno (2026-09-02)

Un secondo audit statico, prodotto da uno strumento esterno sullo stesso commit
(`7226bbbc`), è stato **verificato rilievo per rilievo sul codice**. Non è stato accettato
né respinto a priori: ogni voce è stata riaperta sul file citato.

⭐ **Esito: i suoi P0 sono tutti veri, e sono difetti che questo controllo non aveva
trovato.** I due audit sono **complementari, non sovrapposti**: quello esterno ha scavato
inventario fisico, concorrenza delle macchine a stati e tracking; questo ha scavato il
calcolo economico e la catena Shopify.

| Suo ID    | Rilievo                                    | Riscontro                                                                                                                                                    |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INV-001   | delta contro snapshot obsoleto             | ✅ **confermato** → [19](#19)                                                                                                                                |
| INV-002   | finalize spezzata, conflitto permessi      | ✅ **confermato, con l'evidenza esatta** → [20](#20)                                                                                                         |
| INV-003   | doppio finalize concorrente                | ✅ **confermato** → [21](#21)                                                                                                                                |
| RES-001   | restore reservation non atomico            | ✅ **confermato** → [22](#22)                                                                                                                                |
| MOV-001   | `unitCostMinor` con due semantiche         | ✅ **confermato, anche in UI** → [23](#23)                                                                                                                   |
| TRK-002   | seriali bypassabili                        | ✅ **confermato** → [24](#24)                                                                                                                                |
| TST-001   | integration test fuori dalla CI            | ✅ **confermato** → [25](#25)                                                                                                                                |
| REP-001   | valorizzazione su Disponibile              | ✅ **confermato, e migliore del mio** [18](#18)                                                                                                              |
| TRK-001   | lotti non riconciliati                     | ✅ già in questo documento → [A5 / 5](#5)                                                                                                                    |
| SUP-001   | ordine fornitore senza claim               | ✅ già in questo documento → [11](#11)                                                                                                                       |
| SEC-001   | checker endpoint non default-deny          | ✅ già in questo documento → [9](#9)                                                                                                                         |
| SYNC-001  | push canali non durevole                   | ✅ già in questo documento → [7](#7)                                                                                                                         |
| ARC-001   | `DocumentsService` troppo ampio            | ✅ già in questo documento → [10](#10)                                                                                                                       |
| PERF-001  | elenchi `all=1` non paginati               | ✅ già in questo documento → [C3](#14)                                                                                                                       |
| PAY-BOUND | rate ricreate a ogni salvataggio           | ✅ coerente con [17](#17)                                                                                                                                    |
| IDEM-001  | CreationIntent non generalizzato           | ✅ già censito dal progetto in `docs/T15`                                                                                                                    |
| QTY-001   | `available` senza riconciliazione          | ⚠️ **parzialmente**: i due writer sono atomici e l'unica scrittura di `onHand` è una sola (verificato). Manca la **verifica indipendente**, non l'invariante |
| TEN-001   | FK non tenant-aware                        | ⚠️ **vero ma teorico**: `InventoryLevel` ha FK per id semplice e unique `(variantId, locationId)`. Nessun percorso applicativo lo viola oggi                 |
| IMP-001/2 | import: delta da preview, riga non atomica | ⏸ non riverificato in questo giro                                                                                                                            |

⛔ **Cosa il suo audit NON ha trovato**, e sta in Parte I: l'intera famiglia IVA
([1](#1), [1a](#1a), [1b](#1b), [1c](#1c), [2](#2)), i ricavi a zero nel cruscotto
([15](#15)), la nota di credito che non rettifica ([16](#16)), i fusi dei corrispettivi
([4](#4)), la ricerca senza indici ([14](#14)) e le quantità intere ([6](#6)).

---

<a id="19"></a>

## 19 · ⛔ P0 — L'inventario fisico applica il delta a uno stato che nel frattempo è cambiato

```text
create()    inventory-count.service.ts:174   systemQuantity: level.onHand      ← fotografia
finalize()  inventory-count.service.ts:280   delta = countedQuantity − systemQuantity
            inventory-count.service.ts:284   applyDelta(...)                   ← increment sul saldo ATTUALE
```

⛔ **La base del calcolo è la fotografia, l'applicazione è un incremento sul presente.**

```text
snapshot 10  ·  durante la conta esce una vendita −2  →  onHand 8
l'operatore conta 8 (giusto)
delta = 8 − 10 = −2  →  applyDelta(−2)  →  onHand 6      ⛔ né la conta né il ledger
```

⚠️ **Il difetto non richiede due utenti**: basta che qualcosa muova la giacenza mentre la
conta è aperta — una vendita al banco, un ordine online evaso, un DDT. È lo scenario
**normale** di un inventario fatto a negozio aperto.

⭐ **Non si corregge sostituendo la sottrazione.** Va deciso il modello: conta come **valore
assoluto** (`onHand = countedQuantity`), oppure riconciliazione dei movimenti intervenuti,
oppure cutoff con blocco. Sono tre comportamenti diversi per l'operatore, e la scelta è del
proprietario.

---

<a id="20"></a>

## 20 · ⛔ P0 — Il commesso finalizza l'inventario, le giacenze cambiano, poi arriva il 403

La finalizzazione è spezzata in due tempi:

```text
transazione   applyDelta + StockMovement + status: completed     ← COMMIT
dopo         push canali
dopo         documents.create(DocumentType.inventory, …, user)   ← controlla i PERMESSI
dopo         documents.confirm(...)  →  sessione.documentId
```

⛔ **Il conflitto di permessi è reale, e i due elenchi lo dimostrano:**

```text
DocumentType.inventory  →  famiglia «adjustment»     document-permission.util.ts:42-46
preset clerk            →  InventoryManage  +  docManagePermission('goods_receipt')
                           …e NON doc.adjustment.manage    tenant-permission.constants.ts:324
```

Un **commesso** ha il permesso di finalizzare l'inventario e **non** quello di creare il
documento che la finalizzazione produce. Risultato: giacenze modificate, movimenti scritti,
sessione `completed`, **nessun documento**, e all'operatore una richiesta fallita.

⚠️ **Non è recuperabile ritentando**: alla seconda chiamata lo stato non è più `review` e la
finalizzazione viene rifiutata. Serve un intervento tecnico.

---

<a id="21"></a>

## 21 · ⛔ P0 — Doppio finalize concorrente: nessuna rivendicazione atomica

```text
:257  findFirst(session)                     ← FUORI dalla transazione
:265  if (status !== review) throw           ← FUORI dalla transazione
:284  applyDelta(...)                        ← dentro
:308  update({ where: { id } })              ← nessuna guardia sullo stato
```

Due richieste che partono mentre lo stato è ancora `review` passano **entrambe** il
controllo e applicano **entrambe** i delta.

⭐ **Il pattern corretto è già in casa, in due posti**: `DocumentsService.cancel()` e
`consumeReservationTx` usano `updateMany` con la condizione di stato nel `where` e
controllano `result.count`. Qui no.

⚠️ Il progetto lo aveva già censito in `docs/T15-IDEMPOTENZA-SALVATAGGI.md` («la sessione è
letta FUORI dalla transazione… due finalize sovrapposti applicano entrambi»). **Era scritto
e non è stato chiuso.**

---

<a id="22"></a>

## 22 · ⛔ Il ripristino delle prenotazioni non è atomico: Impegnata si duplica

Asimmetria **dentro lo stesso file**, `stock-reservation.service.ts`:

```text
:180  consumeReservationTx    updateMany({ where: { id, status: active } }) + count   ✅
:234  restoreConsumed…Tx      update({ where: { id } })  →  poi committed += quantity ⛔
```

Due ripristini concorrenti dello stesso ordine — due annullamenti, un retry, due schede —
leggono entrambi `consumed`, aggiornano entrambi e **incrementano due volte `committed`**.
La Disponibile scende di una quantità che nessuno ha impegnato.

⭐ È la stessa forma del difetto [11](#11) sul ricevuto dell'ordine fornitore: il progetto
conosce il compare-and-swap e non lo applica ovunque.

---

<a id="23"></a>

## 23 · ⛔ Il prezzo di vendita finisce nella colonna del COSTO

Due semantiche per la stessa colonna `StockMovement.unitCostMinor`:

```text
movimento singolo  inventory.service.ts:482   unitCostMinor = costoCorrente (anagrafica)  ✅
movimento batch    inventory.service.ts:595   unitCostMinor = line.unitAmountMinor        ⛔
```

E il frontend riempie quel campo così (`movement-form.component.ts:724`):

```text
carico   → purchasePriceMinor    (costo)   ✅
scarico  → sellingPriceMinor     (PREZZO DI VENDITA)  ⛔
```

⚠️ **L'interfaccia è onesta e il database no**: la colonna a schermo cambia etichetta —
«Costo unitario» sul carico, «Prezzo unitario» sullo scarico
(`movement-form.component.html:262-265`) — ma la destinazione è **una sola**, ed è il costo.

⛔ **La conseguenza esce dai movimenti**: `totalCostMinor` è la fonte del **costo del
venduto** nei report (`movement-sales-revenue.util.ts`: «il costo è congelato SUL
movimento»). Uno scarico manuale iscrive quindi a costo il prezzo di vendita.

⭐ **Si somma al difetto [15](#15)**: là il ricavo è zero e il costo è valorizzato; qui il
costo è addirittura il prezzo di vendita. Il margine del cruscotto è falsato da due lati
insieme.

---

<a id="24"></a>

## 24 · ⛔ I movimenti manuali scavalcano il registro seriali

```text
inventory.service.ts        inventoryTracking · serialNumbers · InventorySerial  →  ZERO occorrenze
register-movement.dto.ts    serialNumbers                                        →  ZERO occorrenze
```

I workflow documentali (Trasferimento, Rettifica) usano `inventory-serial.util.ts`; i
movimenti manuali — singoli, batch e import CSV — cambiano `onHand` **senza toccare i
seriali e senza verificare** se l'articolo sia serializzato.

⭐ **È il volto complementare di [A4 / 5](#5)**: là il modo di tracciamento non decide nulla
nei documenti, qui esistono **più motori di posting dello stock con capacità diverse**. La
giacenza numerica resta giusta, il registro dei pezzi no.

---

<a id="25"></a>

## 25 · ⛔ I test che prenderebbero questi difetti non girano mai

```text
api/package.json:20     "test:integration": vitest --config vitest.integration.config.ts
.github/workflows/ci.yml   occorrenze di "test:integration":  0
```

La suite su **PostgreSQL reale** esiste, è isolata e ha barriere contro le scritture fuori
ambiente — ed è opt-in. La CI esegue unit, component, E2E e uno smoke dell'API.

⛔ **I difetti [19](#19), [21](#21), [22](#22) e [11](#11) sono esattamente quelli che solo
un test transazionale concorrente può prendere.** Nessuno di loro fa arrossare la CI di
oggi, e non lo farebbe nemmeno dopo la correzione: non c'è il gate che le protegga.

---

## Verificato e SANO — non perdeteci tempo

- **Aritmetica `Decimal`**: nessuna concatenazione mascherata. Cercati `Decimal + numero`,
  confronti diretti e `Number()` su colonne `Decimal(16,6)`: zero occorrenze.
- **Idempotenza ordini Shopify**: `dedupeKey` con vincolo unico +
  `createMany({skipDuplicates})` e conteggio dell'esito. L'evento `fulfilled` non ha
  suffisso, quindi il doppio scarico non può avvenire; il suffisso `updated_at` distingue
  gli aggiornamenti veri dai retry.
- **Invariante `available = onHand − committed`**: `onHand` si scrive in **un solo punto**
  del backend, `committed` in un altro, entrambi con `increment` atomico. Nessuna scrittura
  fuori.
- **Scope per sede**: applicato anche in lettura; la guardia sorveglia il confine
  controller → servizio, che è dove il difetto nasceva.
- **RLS**: 66 tabelle, tutte con `ENABLE ROW LEVEL SECURITY` e `REVOKE` nella migration che
  le crea.
- **Bootstrap API**: helmet, CORS fail-closed, `whitelist` + `forbidNonWhitelisted`,
  throttling globale, filtro errori che non espone stack.
- **Frontend**: nessun `|| 0` che maschera lo zero, nessuna conversione di input a virgola
  italiana senza rete. `HttpClient` iniettato in **un solo** componente (`guide`), timer con
  `clearInterval` in `DestroyRef`.
- **Architettura dei moduli**: **nessun `forwardRef`** in tutto il backend, quindi nessuna
  dipendenza circolare fra moduli NestJS.
- **Transazioni**: nessuna chiamata di rete dentro `$transaction`. La disciplina «push ai
  canali dopo il commit» è rispettata ovunque, compresi i punti dove sarebbe stato comodo
  violarla. Il timeout non è il default Prisma: `prisma.service.ts` lo alza a 30 s.
- **Prenotazioni di stock**: `consumeReservationTx` usa `updateMany` con guardia sullo stato
  e controlla `result.count` — compare-and-swap idempotente, il pattern corretto contro
  l'evento doppio.
- **Cascade delete**: `StockMovement.variant` e `DocumentLine.variant` **non** hanno
  cascade, quindi lo storico dei movimenti è protetto dal vincolo di chiave esterna. Le 40
  cascade presenti sono su dipendenze legittime.
- **Cifratura token canali**: AES-GCM con IV per messaggio, tag di autenticazione, chiave
  derivata con `scrypt`, e **fail-closed** se la chiave manca (`ServiceUnavailableException`,
  mai un token in chiaro). Vale per Shopify e TikTok.
- **Verifica JWT**: fallisce restituendo `null` (fail-closed); i `catch` silenziosi sono il
  fallback deliberato HS256 → JWKS, non errori inghiottiti.
- **Configurazione**: validata all'avvio (`validate: validateEnv` in `app.module.ts`), con
  le variabili dei canali opzionali perché l'integrazione è facoltativa.
- **I totali non arrivano dal client**: `subtotalMinor`, `taxMinor` e `totalMinor` **non
  esistono** in nessun DTO di salvataggio. Li calcola solo il server, che è la difesa
  giusta — il difetto [1](#1) è in _come_ li calcola, non in _chi_.
- **Stampa PDF**: legge i totali persistiti del documento (`document-pdf.service.ts:216`,
  `:230`, `:233`), non li ricalcola. Conforme alla regola «il riepilogo somma».
- **Ripristino da backup**: `pickUserColumns` è una lista bianca che esclude `id`,
  `tenantId`, `email` e `authUserId`; `assertNoPlatformAdminEmails` rifiuta l'intero import
  se il file contiene un'email di amministratore piattaforma; `createEntityRows` impone
  `tenantId` su ogni riga. L'import è `@Roles(owner)`. **Nessuna scalata di privilegi.**
- **Upsert delle righe documento**: `updateMany` con `where` che porta documento e tenant,
  controllo del `count`, rifiuto delle righe inviate due volte nello stesso salvataggio.

- **Upload di file**: limiti `fileSize` configurati in Multer **prima** che il file entri in
  memoria (`multer-upload.options.ts`, quattro profili: 15 MB, 5 MB, 2 MB, allegati), poi
  MIME risolto, **magic bytes verificati** e quota per tenant
  (`attachment-rules.util.ts:125`). Conforme alle regole di sicurezza, nessun buco.
- **Debounce delle ricerche**: 300 ms uniforme su tutti i pannelli e gli elenchi. Il
  pannello righe non usa `distinctUntilChanged`, e **fa bene**: nel flusso c'è una
  `revision` che serve a riaprire la ricerca sullo stesso testo, e dedurre i valori uguali
  la bloccherebbe.

⚠️ **Due divergenze minori fra gemelli**, registrate perché sono la stessa forma dei difetti
sopra:

1. `goods-receipt-workflow.service.ts:1534` **deduplica** i target del push inventario con
   una `Map` su `variantId::locationId`; `documents.service.ts:1220` itera `syncTargets`
   senza deduplicare. Non produce dati sbagliati — solo query ripetute.
2. `SEARCH_DEBOUNCE_MS = 300` è **ridichiarata in dieci file** invece di stare in un posto
   solo. Oggi coincidono tutte; il giorno in cui una cambia, gli elenchi si comportano
   diversamente senza che nulla lo dica.

**Frontend — quattro classi verificate, tutte pulite** (02/09/2026):

- **Perdita di modifiche**: `CanComponentDeactivate` implementata da **tutte e otto** le
  maschere documento, più `movement-form`. Nessuna esclusa.
- **Errori di salvataggio**: ogni maschera ha più rami `error:` che `subscribe({` — nessuna
  sottoscrizione che ignora il fallimento e lascia credere all'operatore di aver salvato.
- **Doppio invio**: tutte le maschere aprono il salvataggio con
  `if (this.formReadOnly() || this.saving()) return`. ⚠️ Una prima misura le dava scoperte:
  era la mia espressione di ricerca a non prenderle, non il codice a mancare.
- **`HttpClient` nei componenti**: una sola occorrenza in tutta l'app (`guide.component.ts`),
  e i timer hanno `clearInterval` in `DestroyRef`.

Altre verifiche di dominio, tutte superate:

- **Rettifica**: `internalComment` è `@IsString() @Length(1, 2000)` — obbligatorio e non
  vuoto. La regola «niente adjustment silenziosi» è imposta dall'API, non solo dalla
  maschera. ⚠️ Unico residuo: `Length` conta i caratteri, quindi un motivo di un solo
  **spazio** passa. Un `@Transform(trim)` lo chiuderebbe.
- **Trasferimento**: origine uguale a destinazione è rifiutata
  (`transfer-adjustment-workflow.service.ts:221`), e lo scope di sede è verificato su
  **entrambe** le sedi, non solo sull'origine.
- **Ricerca globale**: `forkJoin` su sette servizi con `pageSize` limitato e debounce.
  Corretta come struttura — ma ognuna delle sette chiamate è un `ILIKE '%x%'` senza indice,
  quindi su un catalogo grande ⌘K diventa sette scansioni simultanee (vedi [14](#14)).

---

## Perimetro di questo controllo

**Scavato**: calcolo economico e IVA, numerazione, date e fusi, giacenze e movimenti,
idempotenza dei canali, permessi e scope, conversioni numeriche, catena Shopify,
architettura dei moduli, transazioni e confini transazionali, concorrenza sui contatori,
cascade e vincoli dello schema, indici e ricerca testuale, cifratura e configurazione.

Più, nel terzo giro: pagamenti e rate, note di credito e resi, stampa PDF, dashboard e
valorizzazione inventario, upload e allegati, ricerca globale, import, validazioni di
dominio (rettifica, trasferimento), motore IVA lato client.

**Non ancora guardato**: FatturaPA e fatturazione elettronica (**sospesa per decisione del
proprietario**, quindi esclusa apposta e non per dimenticanza), cassa e scontrini (idem),
TikTok, guide e documentazione generata, e il frontend oltre le classi di difetto cercate.

---

## Come si legge questo elenco

⭐ **I venticinque difetti hanno DUE radici, non venticinque.**

**Radice A — la famiglia di vendita non usa il motore economico comune**, né sul server né
sul client: [1](#1), [1a](#1a), [1b](#1b), [1c](#1c), [2](#2), [15](#15), [16](#16).

**Radice B — le transizioni di stato che producono effetti fisici non sono tutte
rivendicate atomicamente**: [11](#11), [19](#19), [21](#21), [22](#22), e in parte
[24](#24). Il pattern corretto — `updateMany` con la condizione nel `where` più controllo
del `count` — **è già in casa** (`DocumentsService.cancel`, `consumeReservationTx`,
`applyInventoryDelta`) e non è stato esteso.

⚠️ **Nessuna delle due radici è visibile dalla CI di oggi** ([25](#25)): la A perché client
e server sbagliano uguale, la B perché i test transazionali su PostgreSQL non girano.

⛔ **Non è una serie di bug da correggere uno a uno**: è un percorso che non è mai stato
ricondotto al motore comune, mentre gli altri quattro (Arrivo merce, Ordine fornitore,
Vendita al banco, Corrispettivo manuale) sì.

⚠️ **E i difetti si mascherano a vicenda**, quindi l'ordine delle correzioni conta:

```text
15 corretto da solo   →  16 comincia a fare danno (la nota di credito non rettifica più nulla)
1a corretto solo lato server  →  compare a schermo una discrepanza che oggi non c'è
```
