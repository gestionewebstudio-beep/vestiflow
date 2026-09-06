# 16 · Unificazione economica dei documenti — la proposta

**Stato:** proposta, **nessuna implementazione**. Redatta il 27/08/2026 su mandato del
proprietario, dopo il censimento formula-per-formula dei percorsi economici.

> ## L'obiettivo, fissato dal proprietario e non negoziabile
>
> **Alla fine non deve più esistere «il calcolo dell'Ordine cliente», «il calcolo della
> Fattura», «il calcolo della Vendita al banco». Deve esistere UNA SOLA AUTORITÀ per ogni
> responsabilità economica comune, consumata dai documenti. Le sole differenze residue
> devono essere vere differenze di dominio dichiarate.**

⛔ **Non stiamo «sistemando l'Ordine cliente».** Stiamo completando l'unificazione economica
che le precedenti unificazioni — tutte di frontend, misurato: `api:0` su ogni commit — hanno
lasciato fuori.

---

## ⛔ BLOCCO 0 ECONOMICO — questa proposta NON è approvata, e va falsificata anch’essa

**Aggiunto il 27/08/2026, su rilievo del proprietario**, dopo che una prova numerica ha
smentito una delle sue premesse.

> ⛔ **`docs/16` non è il nuovo oracle.** Il §5.3 del contratto comune non va usato per
> progettare l’API finché il §5.3 stesso non è verificato — e la stessa cautela vale per
> questo documento.

### Cosa è confermato, e cosa no

| Punto                                                           | Stato                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| un solo motore economico                                        | ✅ obiettivo corretto                                             |
| HALF_UP decimale                                                | ✅ decisione corretta                                             |
| aritmetica esatta                                               | ✅ principio corretto                                             |
| **`NUMERIC(16,6)` basta a garantire la neutralità Netto/Ivato** | ⛔ **SMENTITO** — vedi sotto                                      |
| **niente altro da conservare sul prezzo di vendita**            | ⛔ non più dimostrato: dipende dalla decisione qui sotto          |
| **`nonDeductible*` nel core neutro**                            | ⛔ **da togliere** — è ciclo passivo, come `supplierPayableMinor` |
| **semantica di `taxMinor` con IVA non standard**                | ⚠️ **da definire** — vedi sotto                                   |
| `lineVatTotalMinor` vs breakdown finale                         | ✅ direzione buona, persistenza da decidere                       |
| golden vectors                                                  | ✅ obbligatori                                                    |
| golden vectors **al posto** del codice condiviso                | ⚠️ compromesso, **non** vera unificazione                         |
| mappa di eliminazione dei vecchi motori                         | ✅ fondamentale                                                   |

### ⛔ B0.1 — La neutralità Netto/Ivato NON regge alla persistenza

La prova algebrica del §0 manteneva **razionali infiniti**. Il database persiste una
precisione **finita**, e `1/1,22` è periodico: nessun `NUMERIC(n, m)` lo conserva.

**Il caso, verificato in aritmetica decimale esatta — nessun float coinvolto:**

```text
1,03 € ivato · IVA 22% · qty 5 · sconto 10%

  netto unitario ESATTO      84,426229508196 cent
  PERSISTITO (4 cifre)       84,426200000000 cent   ← qui si perde
  × 5 × 90%                 379,91790000
  ricomposto ivato          463,49983800  → HALF_UP → 4,63 €

  conto commerciale         463,50000000  → HALF_UP → 4,64 €
```

⭐ **E aumentare le cifre NON risolve.** Misurato:

| cifre persistite | 2      | 4          | 6      | 8      | 10     |
| ---------------- | ------ | ---------- | ------ | ------ | ------ |
| divergenze       | 6,944% | **6,807%** | 6,807% | 6,807% | 6,807% |

Satura a quattro cifre e da lì non scende. Il motivo è verificato: **tutte e 4.901 le
divergenze sono casi in cui il conto commerciale vale esattamente `.5`** — non-tie: ZERO.
Ricomponendo il lordo da un netto troncato **non si può mai atterrare esattamente su `.5`**:
ci si arriva sempre appena sotto.

> ⛔ **Quindi la domanda non è tecnica ma funzionale: quando il valore autorevole è il
> prezzo IVATO, chi decide il centesimo — il conto che l’operatore vede, o la ricomposizione
> dal netto memorizzato?**

⚠️ **Il §5.3 presuppone la seconda senza averlo mai deciso.** Con precisione infinita le due
strade sono equivalenti; con la precisione reale non lo sono.

### ⚠️ B0.2 — `taxMinor` è SOTTOSPECIFICATO. Non è un bug: è un requisito mancante

⛔ **Una prima stesura diceva «reverse charge e split payment non espongono l’imposta». È
FALSA sullo split payment**, e l’avevo scritta senza leggere il corpo della funzione:

```ts
function vatIsExposed(mode) {
  return mode === 'standard' || mode === 'split_payment'; // ⭐ split payment È esposto
}
```

**REGOLA RICHIESTA** — non ancora sufficientemente definita per le modalità IVA non
standard. Il requisito minimo consolidato è «IVA per riga e Codice IVA»; split payment,
regime del margine, indetraibilità e reverse charge contabile completo erano dichiarati
**estensioni da verificare o rinviare**.

**COMPORTAMENTO OSSERVATO** — quattro fatti misurati, nessuna deduzione:

- `documents.service` **non consulta** `calculationMode` nel calcolo dei totali (zero occorrenze);
- `vat-line-calculation.util` **lo distingue**;
- `split_payment` è considerato **IVA esposta** dal motore condiviso;
- `reverse_charge` calcola l’imposta a parte e **non** la include nel lordo esposto.

**IPOTESI TECNICA** — la semantica di `taxMinor` / `totalMinor` / importo dovuto **non è
unificata**, e ⛔ **non è stabilito quale percorso rappresenti il requisito definitivo**.

#### Le cinque grandezze che oggi si confondono

Coincidono in una fattura ordinaria — imponibile 100, IVA 22, totale 122, dovuto 122 — e
**non necessariamente altrove**:

| Grandezza                            | La domanda                                             |
| ------------------------------------ | ------------------------------------------------------ |
| **IVA calcolata**                    | quanto vale matematicamente l’imposta?                 |
| **IVA esposta**                      | appare nel documento e nel riepilogo?                  |
| **IVA che concorre al totale**       | fa parte del lordo commerciale?                        |
| **Importo dovuto dalla controparte** | quanto paga davvero il cliente o si deve al fornitore? |
| **IVA contabile/informativa**        | va registrata anche se non aumenta il dovuto?          |

⭐ **Nel codice due di queste sono già distinte, ma con nomi che le confondono**:
`supplierPayableMinor` è documentato come «netto + IVA **solo se concorre**». Quindi
«esposta» e «concorre al dovuto» sono già due assi diversi.

⚠️ **Esempio che rompe l’assunzione di `docs/16`**: nello split payment è concettualmente
possibile avere imponibile 100, IVA esposta 22, totale documento 122 e **dovuto al cedente
100**. Quindi `totalMinor = subtotalMinor + taxMinor` **non è detto che valga sempre**.

⛔ **E l’invariante che questa proposta contiene — `Σ vatBreakdown.vatMinor === taxMinor` —
assume un concetto unico di IVA finale che non è ancora stato definito.**

#### ⚠️ Il reverse charge in VENDITA non è il reverse charge in acquisto

La specifica storica dice «l’IVA non aumenta il totale da pagare **al fornitore**»: è
formulata sul **ciclo passivo**. Ma esistono Codici IVA `reverse_charge` con ambito
**vendite**. ⛔ Non si può trasferire automaticamente quella semantica al cliente.

#### Cosa serve prima dell’API: una matrice FISCALE, non una firma

Per ognuna delle sei modalità — `standard` · `zero_rate` · `reverse_charge` ·
`split_payment` · `margin_scheme` · `informational` — e per vendita/acquisto dove
applicabile:

```text
IVA calcolata · IVA esposta · concorre al totale documento? · concorre al dovuto? · dato da persistere
```

E per ogni riga, la provenienza: **già deciso da una specifica** · **solo comportamento
attuale** · **decisione mancante**. ⛔ Nessuna deduzione.

⭐ **Conseguenza sul progetto**: l’autorità economica comune potrebbe non poter esporre
soltanto `subtotalMinor · taxMinor · totalMinor` — tre numeri potrebbero non bastare a
rappresentare tutti i regimi. Ma **questa è la decisione che deve uscire dall’audit, non
dalla firma TypeScript.**

### Le frasi del contratto ora in discussione

| Frase                                                                    | Classificazione                                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| §5.2 «precisione `NUMERIC(16,6)` end-to-end»                             | ⚠️ **incompleta** — non dice cosa fare quando il razionale non ci sta            |
| §5.3 «unitari precisi → scorpori → quantità → un arrotondamento»         | ⛔ **da decidere** — in modalità Ivato non dà il conto dell’operatore            |
| §5.4 «il cambio di rappresentazione non cambia il significato economico» | ⛔ **da correggere** — non è vera a precisione finita, dimostrato                |
| §5.3 «riepiloghi IVA = somma dei valori definitivi di riga»              | ⚠️ **ambigua** — «definitivi» prima o dopo la ripartizione dello sconto testata? |

⛔ **Finché queste quattro non sono chiuse, la firma dell’API non si finalizza.** Unificare
cinque documenti su un contratto sbagliato produce **un errore perfettamente centralizzato**.

---

## 0 · La scoperta che ha ribaltato la proposta precedente

⛔ **Una prima versione di questo documento proponeva due policy — `gross-line` e `net-unit` —
e due campi nuovi. Era sbagliata, e va scritto perché l'errore è ripetibile.**

Le due «invarianti» sembravano una scelta di dominio perché venivano confrontate **fra loro**
invece che **col contratto**. Confrontate col contratto, sono due modi diversi di violarlo:

|                                 | Violazione                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `net-unit` come l'avevo scritto | ⛔ `toStorableMinor` **prima** del calcolo — l'arrotondamento prematuro che il §5.2 vieta |
| `gross-line`                    | ⛔ arrotonda il lordo di riga **prima** dello scorporo — fuori dall'ordine del §5.3       |

⭐ **E la prova algebrica chiude la questione.** Nella catena del §5.3

```text
v × 100/(100+r) × (100−d)/100 × q × (100+r)/100
```

il fattore `(100+r)` **si cancella esattamente**: resta `v × q × (100−d)/100`, cioè il conto
commerciale che l'operatore fa a mano. Verificato in **aritmetica esatta su razionali BigInt**:
**0 differenze su 36.000 casi**, aliquote decimali comprese (12,5% · 10,5% · 4,75%).

**Non c'erano mai due matematiche. Ce n'era una, e due modi di romperla.**

## 1 · Il residuo: 1.624 casi, tutti tie `.5`

Seguendo l'ordine del §5.3 senza tagli prematuri restano 1.624 scostamenti su 240.000
(0,68%). Misurati **tutti**, con aritmetica esatta:

```text
scostamenti del float    1.624
di cui tie esatti .5     1.624
di cui NON tie               0        ⭐ zero
```

Le tre prove, con le cifre che servono a vederle:

| Caso                    |   Esatto |  `Number` a 17 cifre | HALF_UP | `Math.round` oggi |
| ----------------------- | -------: | -------------------: | ------: | ----------------: |
| 0,05 € ×10 −7% IVA 22   | **46,5** | `46.499999999999993` |      47 |             46 ⛔ |
| 0,15 € ×3 −10% IVA 22   | **40,5** | `40.499999999999993` |      41 |             40 ⛔ |
| 0,05 € ×1 −10% IVA 4,75 |  **4,5** | `4.4999999999999991` |       5 |              4 ⛔ |

Il valore esatto **è** `.5`. Il `Number` non lo rappresenta e cade sotto. `Math.round` riceve
un numero sbagliato e fa il suo dovere su quello.

### ⭐ Il contratto di arrotondamento

> **Tutta la matematica economica intermedia resta esatta. Nel punto economico finale della
> singola riga si arrotonda al centesimo con HALF_UP decimale — `.5` esatto verso l'esterno —
> mai delegando al float binario.**

⛔ **Niente `Number.EPSILON`, niente `toFixed()`, nessun correttivo del float come regola
economica.** L'implementazione usa aritmetica decimale o intera fino all'arrotondamento.

## 2 · Ipotesi scartate definitivamente

| Ipotesi                               | Perché cade                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `gross-line \| net-unit` come policy  | ⛔ non erano due policy: erano due violazioni del contratto                                                                           |
| `enteredUnitPrice` · `priceEntryMode` | ⛔ non servono: con la precisione conservata il toggle Netto/Ivato è neutro **per costruzione**, come il §5.4 già prescriveva         |
| campi simmetrici a quelli del costo   | ⛔ `enteredUnitCost` e `costEntryModeSnapshot` sono il contratto **del costo acquisto**, non la prova che la vendita ne abbia bisogno |
| `defaultInvariant` globale            | ⛔ non esiste la domanda                                                                                                              |

---

## 3 · La matrice di CONFORMITÀ

⛔ **Non è più «quale policy usa ogni documento».** È: **ogni consumer è conforme al
contratto unico?** Le colonne sono gli articoli del contratto, non le implementazioni.

| Consumer                                                                        | §5.2 precisione                                     | §5.3 ordine e UN round                                             | §5.4 toggle neutro                 | HALF_UP                  | Verdetto                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- | ------------------------ | ----------------------------- |
| **`documents.service`** — Fatture · DDT · Note cr. · Proforma · Vendita manuale | ✅ non tronca l'unitario                            | ✅ un solo round in coda                                           | ⚠️ scorporo delegato al client     | ⛔ `Math.round` su float | **conforme salvo HALF_UP**    |
| **`manual-sales-order`** — Ordine cliente · Preventivo                          | ⛔ **arrotonda `totalMinor` prima dell'IVA**        | ⛔ round fuori ordine                                              | ⚠️ client                          | ⛔                       | **DIVERGENTE**                |
| **`store-sales`** — Vendita e Reso al banco                                     | ✅ via `computeVatLineAmounts`                      | ✅ ramo netto                                                      | ⚠️ modalità cablata `vat_excluded` | ⛔                       | **conforme salvo HALF_UP**    |
| **`goods-receipt-vat`** — Arrivo merce · Ordine fornitore                       | ✅ `toStorableMinor` solo sul valore da MEMORIZZARE | ⛔ **ramo ivato: arrotonda il lordo di riga prima dello scorporo** | ✅ scorpora il server              | ⛔                       | **divergente sul ramo ivato** |
| **`manual-receipt-totals`** — Corrispettivo manuale                             | ✅                                                  | ⛔ come sopra                                                      | ✅                                 | ⛔                       | **divergente sul ramo ivato** |
| **`document-vat.util` (frontend)**                                              | —                                                   | —                                                                  | —                                  | ⛔                       | ⛔ **DUPLICATO INTEGRALE**    |

### Le note che la matrice non può contenere

⚠️ **Il ramo ivato di `computeVatLineAmounts` oggi «funziona»** — 0% di scostamento dal conto
commerciale — **ma per la ragione sbagliata**: arrotondando il lordo prima dello scorporo
schiva il tie del float invece di risolverlo. **Con HALF_UP quella deviazione diventa
inutile**, e l'ordine del §5.3 dà lo stesso risultato per la ragione giusta.

⚠️ **Lo scorporo delegato al client** (`documents.service`, `manual-sales-order`,
`store-sales`) non è di per sé una violazione: il client manda il netto canonico a 6 decimali.
Diventa un problema perché **la matematica del client è un secondo motore**, non perché sia
nel posto sbagliato.

⛔ **Nessuna eccezione funzionale è emersa.** Nessuna delle divergenze trovate è giustificata
da una specifica: sono tutte accidenti di implementazione.

## 4 · La firma proposta — tre livelli, zero rami sul tipo

Vive in `api/src/economics/`. ⛔ **Nessun import** da Prisma, NestJS, DTO, `DocumentType`,
`SalesOrder`, `SupplierOrder`. Nessuno stock, nessuno stato, nessuna numerazione.

### 4.1 Primitivi neutri

```ts
/** Un valore monetario ESATTO. Mai float nei passaggi intermedi. */
type Exact = { readonly num: bigint; readonly den: bigint };

exactFromMinor(minor: number): Exact
netFromGross(gross: Exact, rate: Exact): Exact      // scorporo, senza perdita
grossFromNet(net: Exact, rate: Exact): Exact
applyDiscount(v: Exact, factor: Exact): Exact
roundHalfUp(v: Exact): number                        // ⭐ l'UNICO punto in cui si arrotonda
```

### 4.2 Motore riga

```ts
computeLine(input: LineInput): LineResult

interface LineInput {
  readonly unitMinor: Exact;          // ⭐ preciso, MAI pre-arrotondato
  readonly entryMode: 'net' | 'gross';// solo per sapere se scorporare: NON è una policy
  readonly quantity: Exact;
  readonly discountFactor: Exact;     // ⭐ già normalizzato: «4+10%» → 0,864
  readonly vat: VatInput;
}

interface VatInput {
  readonly ratePercent: Exact;        // ⛔ Decimal(7,4), MAI Math.round: 12,5% resta 12,5
  readonly calculationMode: VatCalculationMode;
  // ⛔ `nonDeductiblePercent` TOLTO il 27/08/2026, su rilievo del proprietario: è
  //    ciclo passivo — «non modifica il totale fornitore» — esattamente come
  //    `supplierPayableMinor`, che avevo già escluso. Avevo applicato il criterio
  //    a metà. Sul percorso generico è cablato a zero.
}

interface LineResult {
  readonly netExact: Exact;           // ⭐ prima del round: serve al livello documento
  readonly grossExact: Exact;
  readonly netMinor: number;          // definitivi, HALF_UP, una volta sola
  readonly vatMinor: number;
  readonly grossMinor: number;
  // ⛔ `nonDeductibleVatMinor` idem: appartiene alla policy acquisti, non al livello riga comune.
}
```

⭐ **`discountFactor` già normalizzato** è la correzione del proprietario: la notazione
«4+10%» è un **formato di ingresso**, non matematica. Il documento la conserva per
rimostrarla; il motore riceve un fattore.

⛔ **`entryMode` non è una policy**: dice soltanto se il numero in ingresso contiene l'IVA.
Non sceglie un algoritmo — l'algoritmo è uno.

### 4.3 Motore documento

```ts
computeDocument(input: DocumentInput): DocumentResult

interface DocumentInput {
  readonly lines: readonly LineForDocument[];   // { result: LineResult, vatCodeId, rate }
  readonly documentDiscountFactor: Exact;       // 1 = nessuno sconto testata
}

interface DocumentResult {
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly vatBreakdown: readonly VatBreakdownEntry[];   // ⭐ il risultato fiscale FINALE
}

interface VatBreakdownEntry {
  readonly vatCodeId: string | null;
  readonly ratePercent: number;
  readonly netMinor: number;      // DOPO la ripartizione dello sconto testata
  readonly vatMinor: number;
  readonly grossMinor: number;
}
```

⭐ **Invariante che il motore deve garantire**: `Σ vatBreakdown[].netMinor === subtotalMinor`
e `Σ vatBreakdown[].vatMinor === taxMinor`. Se non torna, è un difetto del motore, non un
arrotondamento accettabile.

⚠️ **E `taxMinor` va definito prima**: oggi il percorso generico ignora
`calculationMode`, quindi in reverse charge somma un’imposta che il documento non
espone. Vedi Blocco 0, B0.2.

---

## 5 · La semantica di `lineVatTotalMinor` — e il gap di persistenza

⛔ **Oggi sul percorso generico vale ZERO.** `ComputedLine` non porta l'IVA di riga: esiste
solo come addendo dentro `taxMinor`. Quindi il piano «i riepiloghi per aliquota aggregano i
valori finali di riga» **oggi leggerebbe zeri** su Fatture, DDT e Note di credito.

**Due campi, due significati distinti — mai uno che cambia senso:**

|                                      | Significato                                           | Chi lo usa                       |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------- |
| **`DocumentLine.lineVatTotalMinor`** | l'IVA della riga **prima** dello sconto testata       | la griglia, la stampa di riga    |
| **`vatBreakdown` di documento**      | il risultato fiscale **finale**, dopo la ripartizione | ⭐ è quello che i report sommano |

⚠️ **L'IVA di riga dopo la ripartizione non è «l'IVA di quella riga»: è una quota.**
Persistirla in `lineVatTotalMinor` farebbe cambiare significato a quel campo a seconda che ci
sia uno sconto testata — ed è l'ambiguità che poi nessuno ricorda.

⛔ **Dove persistere il `vatBreakdown` non è deciso qui**: richiede di guardare il modello.

## 6 · La mappa di sostituzione

| Implementazione attuale                                              | Componente canonico                            | Cosa resta locale, e perché                                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `manual-sales-order.util` riga (`:148`, `:170`)                      | ⛔ **sparisce** → `computeLine`                | la cascata «4+10%» → fattore, e la sua persistenza come testo                                     |
| `computeManualOrderTotals` (`:200`)                                  | ⛔ **sparisce** → `computeDocument`            | nulla                                                                                             |
| `documents.service` riga inline (`:3685`)                            | ⛔ **sparisce** → `computeLine`                | `isReference`, righe a valore zero                                                                |
| `documents.service.computeTotals` (`:3947`)                          | ⛔ **sparisce** → `computeDocument`            | nulla                                                                                             |
| `store-sales.service` somma inline (`:503` **e la copia a `:1049`**) | ⛔ **spariscono entrambe**                     | nulla                                                                                             |
| `computeVatLineAmounts`                                              | ⭐ **diventa** `computeLine` + policy acquisti | `supplierPayableMinor`, reverse charge e indetraibilità restano **fuori** dal livello riga comune |
| `computeGoodsReceiptTotals`                                          | ⛔ **sparisce** → `computeDocument`            | ordine di calcolo del costo, se la specifica dedicata lo richiede — **da verificare**             |
| `computeManualReceiptTotals`                                         | ⛔ **sparisce** come motore                    | ⭐ il Corrispettivo manuale resta fuori dal modello documentale ma **riusa i primitivi**          |
| `document-vat.util` + `document-totals.util` (frontend)              | ⚠️ **decisione aperta**, vedi §8               | —                                                                                                 |
| `buildVatSummary` (`vat-line-calculation.util.ts:245`)               | 🧹 **zero consumer**: si rimuove               | —                                                                                                 |

⛔ **Fuori perimetro, dichiarato**: la **Registrazione fattura fornitore** resta un dominio
economico-contabile specifico, come prescrive il contratto comune. Le **vendite online** sono
di Shopify: i valori arrivano già calcolati dal canale.

## 7 · Golden vectors

Un file **dato**, non codice: `economics/golden-vectors.json`. Lo leggono **entrambe** le
suite — API e frontend. Se una delle due implementazioni deriva, **la sua suite diventa
rossa** senza che nessuno debba ricordarsi di confrontarle.

I casi obbligatori, ognuno con una ragione misurata:

| #   | Caso                               | Perché                                         |
| --- | ---------------------------------- | ---------------------------------------------- |
| G1  | 25,00 ivato · 22%                  | il totale torna al digitato                    |
| G2  | **25,00 ivato × 3 · −10% → 67,50** | il conto commerciale che l'operatore fa a mano |
| G3  | **0,05 € ×10 −7% IVA 22 → 0,47**   | ⭐ il tie `.5`: oggi il float dà 0,46          |
| G4  | 0,05 € ×1 −10% **IVA 4,75%**       | tie più aliquota decimale                      |
| G5  | **12,5% · 10,5% · 4,75%**          | ⛔ l'aliquota non si arrotonda a intero        |
| G6  | multi-riga multi-IVA               | la somma del breakdown torna ai totali         |
| G7  | con sconto testata                 | la ripartizione non sbilancia                  |
| G8  | **toggle Ivato→Netto senza edit**  | ⭐ i totali **non cambiano**                   |
| G9  | **toggle Netto→Ivato senza edit**  | idem, nell'altra direzione                     |
| G10 | toggle **più modifica** del prezzo | la nuova rappresentazione diventa la base      |
| G11 | IVA 0, reverse charge, esenti      | nature non standard                            |
| G12 | Nota di credito                    | importi **positivi**: il verso è del riepilogo |

## 8 · Il frontend — misurato, e la scelta

```text
package.json separati, NESSUN workspace npm
api/tsconfig   rootDir "./src"   include ["src/**/*"]
nulla attraversa il confine oggi: zero import in entrambe le direzioni

src/app/domain/documents/utils/document-vat.util.ts   258 righe
api/src/vat/vat-line-calculation.util.ts              276 righe
   esportano LE STESSE TRE FUNZIONI con gli STESSI NOMI
```

Non è «uno specchio parziale»: è **il motore intero, due volte**, e già diverge — manca il
clamp sullo sconto documento.

⚠️ Condividere fisicamente il codice significa **ristrutturare i due build**, il `Dockerfile`
dell'API, la CI e l'hook `pre-push`: un raggio d'azione più grande dell'unificazione stessa.

⏸ **Decisione del proprietario.** Le due strade:

|                              | Costo                      | Garanzia                                                  |
| ---------------------------- | -------------------------- | --------------------------------------------------------- |
| **package condiviso**        | ristrutturazione dei build | ⭐ una sola implementazione, per costruzione              |
| **golden vectors come dato** | un file più due lettori    | il comportamento non può derivare; ⚠️ la **struttura** sì |

## 9 · La guardia architetturale

Due strati, e nessuno dei due basta da solo:

```text
GUARDIA STRUTTURALE     verifica la STRUTTURA
  i consumer documentali passano da economics/adapters
  i primitivi si chiamano solo da directory consentite
  nessun secondo modulo «totals/vat» nelle famiglie migrate

GOLDEN VECTORS          verifica il COMPORTAMENTO
  se qualcuno riscrive la matematica e diverge, i test falliscono
```

⛔ **Non una regola che riconosce le formule**: è fragile, e `Math.round` è legittimo in
troppi punti. La forma verificabile è **sulla firma**:

> Nessun file fuori da `api/src/economics/` e dal mirror dichiarato può esportare una
> funzione che combina _quantità · prezzo · sconto · aliquota_.

Una firma non si può offuscare per sbaglio.

## 10 · I checkpoint — «unificazione conclusa» solo con tutti verdi

|       |                                                                         | Stato |
| ----- | ----------------------------------------------------------------------- | ----- |
| **A** | una sola regola di precisione e arrotondamento                          | ⏸     |
| **B** | un solo calcolo economico di riga                                       | ⏸     |
| **C** | un solo calcolo economico di documento                                  | ⏸     |
| **D** | persistenza coerente dei risultati — ⛔ oggi `lineVatTotalMinor` vale 0 | ⏸     |
| **E** | frontend = API = DB = riapertura                                        | ⏸     |
| **F** | stessi input → stessi centesimi in tutti i documenti applicabili        | ⏸     |
| **G** | nessun percorso parallelo equivalente residuo                           | ⏸     |
| **H** | riepiloghi = sola aggregazione dei valori persistiti                    | ⏸     |
| **I** | guardia contro nuove duplicazioni                                       | ⏸     |

## 11 · La matrice delle autorità finali

| Responsabilità         | Autorità attesa                                              |
| ---------------------- | ------------------------------------------------------------ |
| precisione monetaria   | **1**                                                        |
| Netto/Ivato            | **1**                                                        |
| sconto riga            | **1** matematica; la normalizzazione del formato resta fuori |
| IVA riga               | **1**                                                        |
| arrotondamento HALF_UP | **1**                                                        |
| totale riga            | **1**                                                        |
| sconto documento       | **1** meccanismo comune, dove previsto                       |
| multi-IVA              | **1**                                                        |
| totale documento       | **1**                                                        |
| breakdown IVA finale   | **1**                                                        |
| anteprima frontend     | stesso contratto, stessi golden vectors                      |
| riepiloghi             | ⛔ **nessuna matematica fiscale**: sola aggregazione         |

⛔ **Se alla fine restano `computeManualOrderTotals`, l'inline della Fattura, quello di
`store-sales`, il motore del frontend E il nuovo motore — tutti capaci della stessa
matematica — non abbiamo unificato niente: abbiamo aggiunto un livello.**

---

## 12 · Il metodo, e perché è scritto qui

⚠️ Questa proposta è arrivata alla forma attuale **dopo tre versioni sbagliate**, e tutte e
tre sbagliavano allo stesso modo: **prendevano il comportamento del codice attuale e lo
promuovevano a necessità funzionale.**

| Versione                                        | L'errore                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| «correggo la formula dell'Ordine cliente»       | una patch locale a un problema architetturale                                |
| «due policy: `gross-line` e `net-unit`»         | due violazioni del contratto scambiate per due domini                        |
| «servono `enteredUnitPrice` e `priceEntryMode`» | il contratto del **costo** preso come prova che serva anche alla **vendita** |

⭐ **Ogni volta la correzione è venuta dal confronto col CONTRATTO, non fra le
implementazioni.** È il principio che le specifiche già scrivevano — _non dedurre una regola
funzionale dal comportamento attuale_ — e che serviva applicare a sé stessi.
