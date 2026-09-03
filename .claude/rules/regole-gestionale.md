# regole-gestionale — Gestionale fashion retail multi-tenant

_UX da dashboard, dominio retail, inventario per location, varianti prodotto,
mobile operativo, integrazione Shopify-ready._

# SCOPE

Queste regole si applicano a un **gestionale web per negozi di abbigliamento** sviluppato in Angular.
Il progetto è una **web app SaaS / dashboard** multi-tenant, non un sito vetrina.
Le regole qui sotto **estendono** `regole-architettura.md`, `regole-sicurezza.md` e `regole-qualita.md` (stessa cartella).
In caso di conflitto:

1. Sicurezza
2. Architettura
3. Questo file
4. Qualità generale

---

# OBIETTIVO PRODOTTO

L'app gestisce:

- prodotti e varianti (taglia, colore, SKU, barcode),
- giacenze per location (multi-negozio/magazzino),
- carico/scarico/trasferimenti,
- ordini fornitori,
- storico movimenti,
- report base,
- utenti con ruoli,
- integrazione Shopify-ready.

L'interfaccia deve privilegiare:

- velocità operativa,
- leggibilità,
- densità informativa controllata,
- error prevention,
- uso da desktop e smartphone.

---

# MODELLO DOMINIO — REGOLE OBBLIGATORIE

## Varianti prodotto

- L'unità minima di inventario è la **variante**, non il prodotto.
- Le varianti sono generate da **opzioni generiche** (`options: { name, values[] }[]`, semantica Shopify), non da campi fissi taglia/colore. Taglia e colore sono il caso comune, non lo schema.
- Ogni variante DEVE avere:
- `id`
- `productId`
- `sku`
- `optionValues` (mappa opzione → valore, es. `{ Taglia: 'M', Colore: 'Rosso' }`)
- `sellingPrice`
- Campi opzionali ma fortemente raccomandati:
- `barcode`
- `purchasePrice`
- `compareAtPrice`
- `shopifyVariantId`
- `shopifyInventoryItemId`

## SKU e Shopify — clausola di realtà

- Lo SKU univoco è una **regola interna** (validata in form, bloccata in UI).
- Shopify NON garantisce SKU univoci né presenti: in import/sync da Shopify, SKU duplicati o vuoti NON devono rompere il sync. Vanno importati e **segnalati come anomalie** da risolvere, non rifiutati.

## Stock per location (non per negozio)

- Lo stock NON vive direttamente sul prodotto o sulla variante.
- Lo stock vive per **location** (semantica Shopify: il luogo fisico/logico che porta l'inventario), NON per "store". `Location` ≠ `Store`: lo store è l'entità commerciale/POS; una location (es. magazzino) può non avere store associato.
- Entità dedicata `InventoryLevel`:
- `variantId`
- `locationId`
- quantità a stati: `onHand`, `available`, `committed`, `incoming`, `reserved` (allineate ai quantity states Shopify)
- `minThreshold`
- È VIETATO rappresentare stock multi-location con proprietà hardcoded tipo:
- `stockNapoli`
- `stockMilano`
- `warehouse1Quantity`

## Movimenti

- Ogni modifica inventariale significativa DEVE produrre un movimento tracciabile.
- Entità minima: `StockMovement`
- `type`: `load | unload | transfer | adjustment | sale | return`
- `quantity`
- `locationId` (e `targetLocationId` per i trasferimenti)
- `variantId` + snapshot `sku`
- `createdAt`
- `createdBy` + snapshot `createdByName`
- È VIETATO aggiornare quantità stock senza lasciare traccia del movimento, salvo migrazioni documentate.
- **Shopify non è fonte della quantità**: gli aggiornamenti di inventory level ricevuti dal
  canale non sovrascrivono la giacenza VestiFlow e una rettifica fatta nell'admin Shopify non
  crea da sola un movimento locale. Ordini e resi Shopify vengono prima acquisiti come eventi
  commerciali; sono i documenti e le regole VestiFlow conseguenti a produrre gli eventuali
  movimenti. La quantità autorevole viene poi inviata da VestiFlow a Shopify.
- **DEROGA Vendita manuale (prompt Vendita manuale, 2026-07 — scelta esplicita del cliente)**: il SOLO tipo documento `manual_unload` aggiorna la giacenza direttamente al salvataggio SENZA creare `StockMovement` (implementazione: `api/src/documents/document-stock-manual-unload.util.ts`). Il documento è l'unica evidenza dello scarico; la sua eliminazione NON ripristina le giacenze. Il push inventario verso i canali (Shopify/TikTok) resta obbligatorio post-commit: la sync legge la giacenza, non i movimenti. Questa deroga NON è un precedente per altri tipi documento.

### ⭐ E la deroga ha un interruttore — deciso il 26/08/2026

> **La Vendita manuale è operativa solo dove il titolare l’ha accesa, e nasce SPENTA.**

Impostazione aziendale `TenantFeatureSettings.manualUnloadEnabled`, in Impostazioni →
operative. Non è una preferenza fra le altre: è un **interruttore di sicurezza** su una
capacità che scavalca il motore dei movimenti.

⛔ **Il default è `false`, al contrario di ogni altra colonna di quella tabella.** Non
riproduce il comportamento precedente — è una scelta esplicita: un interruttore di
sicurezza che nasce acceso protegge solo chi si ricorda di spegnerlo. I tenant che oggi
la usano se la trovano spenta e il titolare deve riaccenderla, e questo era messo in conto.

| A funzione spenta    |                                                             |
| -------------------- | ----------------------------------------------------------- |
| creare               | ⛔ vietato, e il rifiuto è sull’**API** — non solo nella UI |
| modificare           | ⛔ vietato, per la stessa ragione                           |
| aprire la maschera   | ⛔ non ci si arriva: la riga porta al **Dettaglio**         |
| consultare, stampare | ✅ sempre: lo storico resta                                 |
| eliminare            | ✅ **nessuna regola nuova**, permessi di sempre             |
| annullare            | — non esiste per questo tipo, e non si è inventato          |

⚠️ **La modifica è vietata quanto la creazione, e non è pignoleria**: aprire una Vendita
manuale storica, cambiarne le quantità e salvare produce la **stessa** variazione diretta
di giacenza senza `StockMovement`. Lasciarla aperta avrebbe reso il blocco aggirabile in un
clic — e lo sblocco della maschera è solo stato del client, quindi il blocco vero può stare
soltanto sull’API.

⭐ **La maschera NON si apre «in sola lettura».** Rendere editabile-ma-bloccato avrebbe
significato nascondere Salva, nascondere Sblocca, disabilitare i campi e inventare uno
stato parallelo. La destinazione per consultare un documento esiste già ed è il Dettaglio:
`canOpenDocumentForm` dice no, e `documentRowPath` ci ripiega da solo — quindi clic di riga,
ricerca globale e link trasversali seguono senza che nessuno li tocchi.

⚠️ **Chi gira l’interruttore è il titolare**, e il rifiuto è mirato al solo campo sensibile:
le altre impostazioni restano dell’amministratore. Il predicato è `hasFullTenantAccess`,
quello canonico — quindi comprende anche la **sessione di assistenza**, che è una
conseguenza dichiarata e non una svista.

⛔ **Si legge sempre `=== true`.** Il default è spento e la riga di `tenant_feature_settings`
si materializza solo quando qualcuno apre il pannello: «riga assente», «colonna false» e
«profilo senza il campo» devono dire tutte la stessa cosa. Scritto `!== false`, sarebbe
acceso per ogni azienda che non ha mai aperto le Impostazioni.

⚠️ **Il flag viaggia sul profilo utente (`/auth/me`), non su `/tenant/feature-settings`**:
quell’endpoint chiede `settings.company`, che manager e commesso non hanno, e i consumatori
assorbono il 403 con `catchError(() => of(null))`. Letto per quella strada, sarebbe rimasto
**acceso proprio per chi lo si vuole spegnere**.

### Un movimento per riga, aggiornato in posto — non uno per salvataggio _(15/08/2026)_

«Ogni modifica inventariale produce un movimento tracciabile» qui sopra dice **cosa deve esistere**, non **quante volte va scritto**. La distinzione va esplicitata, perché letta male produce un registro che cresce a ogni correzione di battitura.

> **Una riga di documento che movimenta magazzino ha esattamente UN movimento collegato, identificato da `StockMovement.sourceLineId`. Il salvataggio successivo AGGIORNA quel movimento; non ne accoda un altro.**

Non è una scelta nuova: è nello schema, con il vincolo che la fa rispettare — `@@unique([sourceDocumentType, sourceLineId])`, e il commento della colonna dice «al massimo UN movimento per riga (no doppi carichi)».

**Il criterio è cosa è successo davvero.** Correggere un DDT da 3 pezzi a 2 non significa che ne siano usciti 3 e poi ne sia rientrato 1: **è sempre uscita una quantità sola**, e il documento era compilato male. Il movimento rappresenta il **contenuto corrente** del documento, non la storia dei salvataggi. Quindi:

| Evento                                                     | Movimento                                      |
| ---------------------------------------------------------- | ---------------------------------------------- |
| modifica di una riga di documento                          | si **aggiorna** quello collegato               |
| riga eliminata, o spunta magazzino tolta                   | il movimento si **elimina**, la giacenza torna |
| nuovo evento fisico successivo (merce che rientra davvero) | movimento **nuovo**                            |
| storno o rettifica esplicita                               | movimento **nuovo**, tracciato come tale       |

**VIETATO** far comparire movimenti di rettifica (`rettifica scarico +1`) come effetto della semplice modifica di un documento: sono rumore in un registro che l'operatore legge, e affermano un evento fisico che non è avvenuto.

Ne discende anche che **due righe dello stesso articolo restano due movimenti distinti**: aggregare per variante perde il legame con la riga, ed è ciò che rende impossibile ritrovare il movimento al salvataggio dopo.

_Stato al 15/08:_ la regola è rispettata da **tutti** i documenti che movimentano — Arrivo merce, Rettifica, Trasferimento e, da oggi, lo **scarico di vendita** (DDT vendita e Fattura accompagnatoria). Misure, cause e correzione in `docs/09-specifica-movimenti-per-riga.md`. La deroga della Vendita manuale qui sopra resta fuori da tutto questo: non crea movimenti affatto.

I documenti storici si convertono **da sé al primo salvataggio**: il sync somma l'effetto netto dei movimenti aggregati, lo annulla, li cancella e riscrive un movimento per riga. La giacenza non si muove di un pezzo. Non esiste uno script di conversione, e non deve esistere.

### La riga di un documento è una fotografia, e non si riscatta da sola _(18/08/2026)_

La regola qui sopra dice cosa succede ai **movimenti** quando un documento si risalva. Questa
dice cosa succede ai **valori della riga**, ed è la stessa disciplina un piano più sotto.

> **Su una RIGA GIÀ ESISTENTE, un valore non modificato esplicitamente conserva quello
> persistito nel documento: non si rilegge e non si ricalcola dall'anagrafica corrente.**
> Modificato esplicitamente, il nuovo valore si salva e da lì diventa il valore persistito.
> Una **riga nuova** acquisisce i valori correnti previsti dal contratto del documento, e da
> quel momento li congela.

### ⭐ Le righe nuove sono DUE cose diverse — deciso dal proprietario il 03/09/2026

⛔ **Qui la regola si fermava a due casi**, esistente e nuova, e una riga **duplicata o
convertita** cadeva nel secondo: tecnicamente è nuova, quindi prendeva l'anagrafica di oggi.
Il risultato era che duplicare un DDT di marzo a settembre ne cambiava il nome articolo, e la
fattura generata da quel DDT non diceva più quello che il DDT diceva.

> **Una riga nuova DA CATALOGO acquisisce i valori correnti. Una riga nuova DERIVATA da un
> documento sorgente eredita i valori di QUELLA riga, `null` compresi.**

| Riga                                     | Da dove prende gli snapshot         |
| ---------------------------------------- | ----------------------------------- |
| **esistente** (ha un `id` proprio)       | il valore **persistito su di sé**   |
| **derivata** (duplicazione, conversione) | la **riga sorgente**, copiata com'è |
| **nuova da catalogo**                    | l'**anagrafica corrente**           |

⭐ **La discriminante è un riferimento esplicito**, `sourceDocumentLineId`, e non un'euristica:
nel payload una riga duplicata da una riga senza codice e una riga appena creata sono
altrimenti **identiche** — entrambe senza `id` e senza snapshot. È un contratto binario, come
quello del Codice IVA: la presenza della chiave È l'informazione.

⛔ **Il client manda un id, non dei valori.** Il server risale alla riga sorgente e ne copia
gli snapshot **dal database**, ignorando qualunque valore storico gli arrivi per altra via. È
la forma che tiene insieme questa regola e quella che le sta di fronte — «la fotografia la
compone il server, non l'interfaccia» — che altrimenti si escluderebbero a vicenda.

⚠️ **Il riferimento non si persiste**: serve solo a comporre la riga. Dal salvataggio dopo,
quella riga ha un `id` proprio ed è una riga esistente come tutte le altre.

⛔ **Un riferimento presente ma NON VALIDO rifiuta il salvataggio.** Il contratto è a tre
stati, non a due:

| Riferimento                      | Esito                                           |
| -------------------------------- | ----------------------------------------------- |
| **assente**                      | riga nuova: fotografia dall'anagrafica corrente |
| **presente e valido nel tenant** | copia integrale della sorgente                  |
| **presente ma non valido**       | ⛔ salvataggio **rifiutato**                    |

⚠️ **Qui c'era il ripiego su «riga nuova»**, difeso come «il comportamento più prudente».
Non lo era: la riga veniva rifotografata dall'anagrafica **corrente** e il documento si
salvava lo stesso — plausibile, e sbagliato. ⭐ È il difetto che questa regola chiude,
rientrato dalla porta di servizio: e un documento che sembra giusto non lo va a controllare
nessuno.

⚠️ **Il messaggio d'errore non dice PERCHÉ.** «Non esiste» e «esiste, ma in un'altra
azienda» devono essere indistinguibili: distinguerli trasformerebbe il campo in un modo per
scoprire se un id di riga esiste altrove.

⭐ **Cambiare articolo SCOLLEGA.** Se dopo il precompilato l'operatore sceglie un'altra
variante, la riga non deriva più da niente: il riferimento si azzera e gli snapshot si
riacquisiscono dalla nuova scelta. Il controllo sta **anche sul server**, che confronta la
variante della sorgente con quella della riga — un client che si dimenticasse di azzerarlo
copierebbe altrimenti l'identità del prodotto di prima sopra quello appena scelto.

⚠️ **Lacuna dichiarata: «Concludi ordine» resta fuori.** Un documento di scarico generato da
un ordine cliente continua a fotografare l'anagrafica corrente, e non per dimenticanza:
`SalesOrderLine` **non possiede** `articleCode` né `productName`, quindi la conservazione
sarebbe parziale per costruzione. ⛔ E i due campi mancanti **non si recuperano**
dall'anagrafica di oggi per far tornare i conti: sarebbe il difetto stesso, con un'altra
faccia. Si chiude quando si lavora sull'Ordine cliente.

**Il criterio è cosa il documento è.** Un documento registra un'operazione avvenuta: rinominare
un prodotto in anagrafica non cambia cosa c'era scritto sul DDT di marzo, e cambiare l'aliquota
di un Codice IVA non ri-prezza le fatture già emesse.

#### ⚠️ Prima si CLASSIFICA il campo, poi si applica la regola

⛔ **Non vale per ogni campo del gestionale**, e prenderla come regola universale sarebbe
sbagliato quanto non averla. Vale per i dati che appartengono al documento **come fotografia
dell'operazione**. Ciò che è dichiaratamente **live** resta live — la disponibilità di magazzino
mostrata accanto a una riga, per esempio, è una lettura di adesso e deve esserlo.

| Dove si applica, dove è applicabile                   |                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **nome e descrizione** della riga                     | se il documento diceva «Maglia cotone», rinominare il prodotto domani non lo cambia      |
| **prezzo unitario**                                   | non torna al prezzo corrente dell'articolo                                               |
| **costo**                                             | una riga già movimentata conserva il costo congelato, e non si rivaluta al costo di oggi |
| **Codice IVA e snapshot IVA**                         | il semplice risalvataggio conserva quelli persistiti                                     |
| **sconto di riga**                                    | resta quello del documento                                                               |
| **quantità**                                          | resta quella persistita, salvo modifica esplicita                                        |
| **unità di misura**, se salvata come dato documentale | non si rifotografa dall'anagrafica                                                       |
| altri valori economici o snapshot di riga             | stessa disciplina                                                                        |

#### ⚠️ Il rimedio NON è lo stesso per tutti, e confonderlo costa

I campi si dividono in due, e la differenza sta in **chi potrebbe riscriverli**:

```text
campi che il client MANDA SEMPRE          quantità · prezzo · sconto · descrizione
  → il valore che manda è già quello del DOCUMENTO, letto all'apertura
  → il rischio è che QUALCUNO li riderivi dall'anagrafica: server o client
  → il rimedio è non riderivarli

campi che il server RISOLVE quando mancano      Codice IVA
  → il rischio è che il client li rimandi sempre e il server li rifotografi
  → il rimedio è un contratto binario: assente = non modificato
```

⛔ **Applicare il contratto binario a un campo del primo gruppo sarebbe inutile**, e applicare
«basta non riderivare» a un campo del secondo lascerebbe il difetto dov'è.

#### Il primo consumer, e una violazione già misurata

Il **Codice IVA** è il primo caso applicato: `computeLines` del percorso generico rifotografava
lo snapshot a ogni salvataggio, e ora conserva quello persistito quando il client non dichiara
una modifica (`document-line-vat-payload.util` lato client).

⚠️ **Una violazione del primo gruppo era misurata, ed è stata corretta il 18/08/2026**:
`store-sales.service.ts` riscriveva `sku` e `description` **dalla variante a ogni
salvataggio**. Non faceva danno finché la vendita non si risalvava; aprendo la modifica
(specifica `11` A2) avrebbe riscritto la descrizione di una vendita di marzo con quella
dell'anagrafica di oggi. Ora Vendita e Reso tengono `previous?.sku ?? variant.sku`, cioè il
valore persistito sulla riga esistente e quello corrente solo sulla riga nuova.

⛔ **Il difetto è nato dal fatto che il percorso non si risalvava**, ed è la forma in cui questa
regola si viola più spesso: finché un documento si crea e basta, riscrivere dall'anagrafica e
conservare danno lo stesso risultato, e la differenza compare il giorno in cui si apre la
modifica — cioè quando i documenti sbagliati esistono già.

## Multi-tenant

- Tutte le entità di business DEVONO essere tenant-aware.
- Entità principali con `tenantId` obbligatorio:
  - `Product`
  - `Store` / `Location`
  - `SupplierOrder`
  - `SalesOrder`
  - `StockMovement`
  - `Customer`
- È VIETATO assumere single-tenant nel codice applicativo.
- Ogni query, filtro o mock data DEVE essere pensato per tenant corrente.

## Denaro

- I prezzi e i totali viaggiano in **unità minori** (`Money { amountMinor, currencyCode }`), di norma intere ma **con una coda decimale ammessa**: fino a 4 cifre di centesimo (6 decimali di euro), quante ne memorizzano le colonne `NUMERIC(16,6)`.
- La coda non è un vezzo: un prezzo digitato ivato vale 2049,180328 centesimi netti, ed è quella coda a farlo tornare identico quando lo si rimostra ivato. **Arrotondare a metà strada perde un centesimo su un prezzo su cinque** (aliquota 22%).
- **Si arrotonda solo all'USCITA**: `formatMoney`, `moneyToDecimalString`, `minorToShopifyDecimal`, la stampa, il CSV. Mai nei passaggi intermedi, mai al momento di memorizzare.
- **All'operatore si mostrano sempre e solo 2 decimali**, in ogni schermata e in ogni stampa.
- **«È cambiato?» si chiede al centesimo** (`sameAmountAtCent`): una coda decimale diversa non è una modifica per chi guarda, e non deve far scattare storici prezzi, conflitti di catalogo o propagazioni verso i canali.
- La conversione netto↔ivato ha **due forme**, e vanno tenute distinte: `*Exact` per il valore da memorizzare, `*Minor` (arrotondata) per il valore da mostrare.
- Shopify espone i prezzi come **stringhe decimali** (es. `"29.90"`): la conversione stringa ↔ unità minori avviene in un'unica funzione di mapping testata, mai sparsa nel codice.
- La formattazione display usa `Intl.NumberFormat` centralizzato, mai concatenazione manuale.

### La colonna è una, i comportamenti sono tanti _(deciso 16/08/2026)_

> **Ogni prezzo o costo UNITARIO è `NUMERIC(16,6)`. I totali e gli importi già arrotondati sono interi.**

La discriminante non è il documento, è **cosa contiene la colonna**:

| Contenuto                                                                | Tipo            | Perché                                                              |
| ------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------- |
| **Prezzo o costo unitario** — quello che si digita, o da cui si scorpora | `Decimal(16,6)` | può nascere da un ivato, e la coda è ciò che lo fa tornare identico |
| **Totale, imposta, importo pagato** — risultato già arrotondato          | `Int`           | si arrotonda all'uscita, e lì l'uscita è già avvenuta               |

**Il comportamento della colonna non cambia il suo tipo.** La stessa colonna prezzo è in sola lettura sull'Ordine fornitore, si digita su Preventivo, Ordine cliente, DDT e Fatture, e sull'Arrivo merce aggiorna anche l'anagrafica. Sono tre mestieri diversi della **stessa** grandezza: il tipo e la semantica del denaro non hanno ragione di divergere fra un documento e l'altro.

**Dove divergevano, divergevano per storia.** `DocumentLine` è stato portato a sei decimali,
`SupplierOrderLine` dopo, `SalesOrderLine` **il 16/08/2026** — ed è l'ultima. La conseguenza si
vedeva a schermo: la stessa maschera offriva il netto/ivato sul DDT e non sull'Ordine cliente,
perché il numero finiva in due posti diversi. **Il selettore non mancava per scelta: mancava la
colonna che poteva ospitarne il risultato**, e il template lo diceva — «escluso finché non
arriva il supporto backend dedicato».

### L'arrotondamento sta sul totale di riga, mai sul prezzo unitario

> **`quantità × prezzo × sconto` si calcola ESATTO e si arrotonda una volta sola, alla fine.**

Arrotondare il prezzo unitario prima di moltiplicarlo è l'arrotondamento prematuro che questa
regola vieta, e con una colonna a sei decimali smette di essere teorico: 3 pezzi da 33,33 €
scontati del 7% valgono 92,99 €, ma passando per un unitario arrotondato (30,9969 → 31,00)
diventano 93,00 — un centesimo che il cliente non deve.

Vale in entrambe le direzioni: il prezzo unitario **non** si tronca in ingresso (`Math.trunc`
butterebbe via proprio la coda), e la coda oltre le quattro cifre di centesimo si taglia con
`toStorableMinor`, perché oltre lì non c'è precisione — c'è il rumore del float, e la colonna
rifiuterebbe la scala.

### ⭐ Il riepilogo SOMMA, non ricalcola — deciso dal proprietario il 27/08/2026

> **Il calcolo economico avviene nel DOCUMENTO, una volta sola, secondo il contratto
> comune. Elenchi, report, selezioni, export e registri AGGREGANO i valori finali già
> determinati e persistiti.**

⛔ **Un riepilogo non è un secondo motore economico.** Se ogni consumatore ricostruisce
l’IVA, cominciano le differenze dovute ai diversi punti di arrotondamento — e la stessa
transazione finisce per valere numeri diversi a seconda di dove la si guarda:

```text
documento   100,00
elenco      100,01     ⛔ questo non deve poter accadere
CSV          99,99
report      100,00
```

#### Le tre responsabilità, e non se ne scambia nessuna

| Livello                | Responsabilità                                                  |
| ---------------------- | --------------------------------------------------------------- |
| **Riga documento**     | calcola imponibile, IVA e totale **finali**                     |
| **Documento**          | **somma** i valori finali delle proprie righe                   |
| **Riepilogo / report** | **somma** i valori dei documenti, applicando filtri e **verso** |

⛔ **Nel report non ci sta un `calcolaTotaleFattura()`.** Concettualmente ha solo:

```text
aggregate(document.taxableTotal)
aggregate(document.vatTotal)
aggregate(document.grandTotal)
+ economicSign(document.type)      quando serve
```

⭐ **Il riepilogo applica la CLASSIFICAZIONE e il VERSO economico, non rifà il calcolo
fiscale.** Una fattura da 100 e una nota di credito da 50 fanno 50 — e ci si arriva col
segno del tipo, non ricalcolando l’IVA della fattura.

#### ⚠️ L’IVA per aliquota segue la stessa regola

`IVA 22% · IVA 10% · IVA 4%` si ottengono **sommando gli importi IVA finali delle righe**
di quel codice. ⛔ **Mai** prendere l’imponibile totale e rifare `imponibile × aliquota`:
è lo stesso errore di arrotondamento, un piano più in alto.

#### Dove pesca un elenco

Dai **valori di testata** del documento (`taxableTotal`, `vatTotal`, `total`): è la strada
più semplice e più veloce. Le **righe** servono solo quando il riepilogo chiede una
dimensione che la testata non contiene — l’IVA per aliquota, per esempio — e anche lì si
aggregano **valori finali salvati**, non si rifanno le formule.

⭐ **La velocità è un beneficio secondario**, e va detto perché non è la ragione: un
`SUM()` su valori già determinati costa molto meno che rileggere migliaia di righe e
ripetere quantità × prezzo × modalità × sconto × sconto documento × aliquota ×
arrotondamento. Ma il vantaggio fondamentale è **un risultato economico solo** per una
transazione.

#### ⭐ E risolve lo storico, che è lo stesso principio della fotografia

Se agosto ha registrato un totale di riga da 25,00 €, il report di agosto deve continuare
a leggere 25,00 € anche dopo che a settembre si è cambiato il listino. Andare
sull’articolo corrente e chiedersi «quanto costerebbe oggi?» **non è un riepilogo: è una
rivalutazione.** Gli snapshot esistono esattamente per questo.

#### Il bersaglio: un motore, N aggregatori

⛔ Il target **non è scegliere uno dei motori esistenti così com’è**. È:

```text
1 motore canonico documentale   +   N aggregatori semplici
```

⚠️ **Il difetto trovato sull’Ordine cliente non è del riepilogo: è del motore.** Chi
aggrega quei numeri li aggrega correttamente — aggrega numeri sbagliati. Correggere il
motore, e i consumatori si sistemano da soli.

### Netto/ivato: chi decide, in che ordine _(deciso 16/08/2026)_

> **La modalità netto/ivato ha DUE livelli per i prezzi di vendita e UNO per i costi. Non di
> più: ogni livello in mezzo è un comando che non comanda.**

```text
PREZZI DI VENDITA   convenzione aziendale  →  memoria dell’operatore  →  modalità del documento
COSTI DI ACQUISTO   sempre netti           →  (nessuna memoria)      →  modalità del documento
```

**La convenzione aziendale** (`TenantFeatureSettings.salesPricesIncludeVat`, in Impostazioni →
Prezzi) non è solo il default dei documenti nuovi: è **come questa azienda esprime i prezzi**.
Al dettaglio si ragiona ivato, all’ingrosso netto. Vale quindi anche per le viste che non sono
documenti — anagrafica e listini oggi, i report quando ci arriveremo.

⚠️ **La convenzione ha due comportamenti diversi, e vanno tenuti distinti:**

|                                         | Quando viene letta        | Cambiarla dopo                |
| --------------------------------------- | ------------------------- | ----------------------------- |
| **Documenti**                           | una volta, alla creazione | non tocca niente di esistente |
| **Viste** (anagrafica, listini, report) | ogni volta che si guarda  | cambia quello che si vede     |

Non è una contraddizione: un documento è un **fatto** e conserva la modalità con cui è stato
compilato; una vista è una **lettura**, e segue la convenzione corrente.

**La memoria dell’operatore** resta solo dove si CREA qualcosa, cioè sui documenti di vendita:
è l’ultima scelta di quella persona per quel tipo, scritta alla creazione e mai in modifica.

⚠️ **Cambiare la convenzione AZZERA le memorie dei tipi di vendita**, e non è un dettaglio
implementativo: senza, il titolare imposta «netto» e ognuno continua a creare ivato per una
memoria che non sa di avere — l’impostazione sembra rotta, ed è il primo difetto che verrebbe
segnalato.

**I costi non hanno né convenzione né memoria.** Per un’azienda che detrae l’IVA il costo _è_ il
netto: Arrivo merce e Ordine fornitore partono sempre netti, e l’inserimento ivato resta una
comodità del **singolo documento**, dove il selettore c’è e la scelta si persiste.

#### In anagrafica il selettore governa SEI campi, non cinque _(17/08/2026)_

> **Tutti i valori commerciali di vendita dell’articolo seguono la stessa modalità:** prezzo di
> vendita, **prezzo barrato**, prezzo Shopify, listino 1/2/3.

⚠️ Il **barrato** era l’unica eccezione, e la ignorava **in silenzio**: si inseriva «come va
mostrato al cliente», il tooltip lo diceva e il codice lo confermava (fuori da `PRICE_FIELDS`),
ma a schermo i sei campi sembravano governati dallo stesso interruttore.

**La conseguenza usciva dal gestionale.** Verso Shopify la stessa riga variante portava
`price` NETTO (segue il selettore) e `compare_at_price` IVATO (non lo seguiva): due basi
affiancate sotto gli occhi del cliente, con lo sconto mostrato gonfiato dell’aliquota.

**Il costo di riferimento resta fuori**, ed è etichettato **«(netto)»**: appartiene al dominio
costi, che è sempre netto e ha una convenzione sua.

⚠️ **`null` non è zero.** Il barrato è facoltativo: `null` significa «nessun prezzo barrato»,
e verso Shopify la chiave non entra proprio nella riga — `compare_at_price: "0.00"` là non è
un’assenza, è **un barrato che vale zero**, cioè uno sconto inventato del 100%.

#### Gli esoneri, e come si scrivono

Chi non risponde alla convenzione sta **fuori da `SALES_PRICE_MODE_TYPES`**, che è l’unico
elenco: la modalità proposta e le memorie da azzerare leggono lo stesso.

| Chi                                                          | Perché                       |
| ------------------------------------------------------------ | ---------------------------- |
| **famiglia acquisto**                                        | i costi partono sempre netti |
| **tipi senza prezzi** (trasferimento, rettifica, inventario) | non usano la modalità        |

⭐ **Vendita e Reso al banco NON sono più esonerati — 21/08/2026.** Qui c'era «cassa negozio
(`store_sale`, `store_return`): sempre ivata», col forcing cablato in `store-sales.service.ts`,
e questa stessa sezione dichiarava la revisione in sospeso: «Fisico/POS» e «netto/ivato» sono
**due assi diversi**, e un grossista che vende al banco può volerla netta.

La revisione è stata fatta col rifacimento della Vendita al banco, com'era previsto: i due tipi
sono **dentro** `SALES_PRICE_MODE_TYPES` e usano il contratto comune — convenzione aziendale,
memoria dell'operatore, modalità persistita sul documento e modificabile dal selettore nella
testata della colonna Prezzo (`11` A4).

⚠️ **Entrarci significa ereditarlo tutto**: cambiare la convenzione aziendale azzera anche le
memorie del banco. Senza, il titolare imposterebbe «netto» e chi sta al banco continuerebbe a
vedere ivato per una memoria che non sa di avere.

#### Due meccanismi ritirati, e perché non torneranno

| Ritirato                                                                   | Perché non funzionava                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentTypeSetting.pricesIncludeVat` — un default per **tipo documento** | nessun pannello lo esponeva. UNA riga in tutto il database, per `supplier_order`, e diciotto ordini netti a smentirla: non ha mai deciso niente, perché la maschera manda sempre un valore e il `??` non scattava |
| `UserProductPriceModePreference` — memoria personale in **anagrafica**     | l’anagrafica non è un documento: è una vista, e due colleghi devono leggere lo stesso listino allo stesso modo                                                                                                    |

⚠️ **E la memoria dell’operatore non deve tornare a coprire i costi.** Fino al 16/08 la modalità
costo veniva ricordata dentro `user_document_price_mode_preferences` — la tabella dei **prezzi**
— tradotta da un ponte costo↔prezzo. Reggeva solo perché i tipi delle due famiglie non si
sovrappongono: il primo tipo buono per entrambe l’avrebbe rotta in silenzio.

---

**Prima di aggiungere una colonna di denaro**, la domanda è una sola: _questo valore può essere il risultato di uno scorporo?_ Se sì, è `Decimal(16,6)`. Non «è già intero adesso»: **potrà** non esserlo il giorno in cui quella maschera avrà il netto/ivato, e a quel punto la migration costa quanto le righe di codice che leggono quella colonna.

---

# OWNERSHIP DEI DATI — LA REGOLA SHOPIFY PIÙ IMPORTANTE

Con Shopify connesso, **ogni entità ha un owner di sync** dichiarato. È la decisione che condiziona tutto: quali form esistono, cosa è editabile, come si risolvono i conflitti.

⭐ **La direzione PER CAMPO è la matrice canonica di `docs/24` §9.2, e vive solo lì.** La tabella qui sotto è a livello di **entità**: dice chi possiede un'entità, non la direzione di ogni suo campo. Dove le due sembrano divergere — un prodotto è «condiviso», ma la sua descrizione va solo VestiFlow→Shopify, di immagini se ne sincronizza una sola, SEO e metafield non configurati sono solo Shopify — **vince §9.2**. Qui non si ricopia la matrice: si rimanda.

| Entità                                      | Owner                          | Conseguenza UI                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prodotti / varianti ecommerce               | **condiviso** (dal 03/09/2026) | gli importati SI MODIFICANO; la direzione **dipende dal campo** (`docs/24` §9.2), non è «tutto bidirezionale». Es.: `Product.name` è solo VestiFlow, `shopifyTitle` bidirezionale (sotto) |
| Clienti ecommerce                           | Shopify                        | anagrafica read-only nel gestionale                                                                                                                                                       |
| Ordini di vendita online                    | Shopify                        | sempre read-only nel gestionale                                                                                                                                                           |
| Giacenze                                    | VestiFlow                      | Shopify invia ordini e resi come eventi; soltanto documenti e movimenti VestiFlow determinano la quantità autorevole, poi pubblicata al canale                                            |
| Ordini fornitori, trasferimenti, rettifiche | gestionale                     | pieno CRUD locale                                                                                                                                                                         |
| Location                                    | Shopify (mappate)              | gestionale mappa le proprie location su quelle Shopify                                                                                                                                    |

### ⭐ Il NOME del prodotto ha due campi, e uno non è condiviso — 03/09/2026

⛔ Qui la riga di tabella diceva _«Shopify (di norma) · editing locale = write-through o
**read-only**»_: i prodotti importati **non sono in sola lettura**, l'origine è provenienza e
non un vincolo (`docs/24` §1.8). La riga è stata corretta; questa sezione resta per ciò che
una casella di tabella non può contenere.

`Product.name` («Nome prodotto») è **esclusivamente VestiFlow** — Shopify non lo sovrascrive
mai, in nessun percorso — mentre `shopifyTitle` («Nome Shopify») è il titolo della vetrina ed
è bidirezionale. Gli altri campi seguono ciascuno la propria direzione in `docs/24` §9.2.

### Ciclo di vita del catalogo

La regola completa vive in `docs/24` §§1, 4, 7 e 11. In sintesi: Non attiva, cestino ed
eliminazione definitiva sono azioni diverse; il cestino conserva tutto ed è ripristinabile;
l'eliminazione definitiva locale rimuove le dipendenze operative dopo doppio avviso, lasciando
leggibili le righe documento dai propri snapshot; VestiFlow rende non acquistabile il remoto ma
non cancella mai definitivamente prodotti o varianti da Shopify.

⚠️ **Un campo solo non poteva servire due mestieri opposti**: un nome si cerca digitando poche
lettere in magazzino, l'altro si legge in una pagina prodotto. Finché erano lo stesso, chi
accorciava il nome per il magazzino se lo vedeva tornare lungo al primo webhook — e chi lo
accorciava lo accorciava anche sulla vetrina. Contratto in `docs/24` §1.9.

Regole:

- È VIETATO progettare una feature di editing senza prima dichiarare l'owner dell'entità.
- Le entità owned da Shopify mostrano chiaramente in UI che la fonte è Shopify.
- I conflitti di sync (modifica concorrente) non si risolvono silenziosamente: si segnalano.

## Sync, webhook ed eventual consistency

- Il sync reale è **webhook-driven** (ordini, inventory level update): i dati possono arrivare in ritardo, doppi o fuori ordine. Il backend DEVE essere idempotente; il frontend DEVE convivere con dati potenzialmente stale.
- La UI espone sempre "ultimo sync" dove rilevante e uno stato sync per risorsa.
- L'Admin API Shopify è **rate-limited**: le operazioni bulk passano da una coda lato backend, mai da N chiamate parallele richieste dal frontend.
- Gli ID Shopify sono identificativi pubblici (formato GraphQL `gid://shopify/...` o numerico REST): si salvano come stringhe opache, non si parsano.

---

# UX DA GESTIONALE — NON DA LANDING PAGE

## Gerarchia visuale

- Questo progetto NON usa hero section, large marketing headers o layout da sito vetrina.
- `h1` sobrio, utile, orientato al compito.
- Titoli pagina brevi e funzionali:
  - "Prodotti"
  - "Dettaglio prodotto"
  - "Movimenti di magazzino"
  - "Ordini fornitori"

## Densità informativa

- L'interfaccia deve essere **compatta ma leggibile**.
- Tabelle, filtri e pannelli devono mostrare più dati possibili senza diventare claustrofobici.
- Spaziature: usare token piccoli/medi, evitando layout troppo ariosi.
- È VIETATO usare proporzioni da marketing page su dashboard interna.

## Azione primaria

- Ogni schermata deve rendere evidente l'azione principale:
  - aggiungi prodotto,
  - registra carico,
  - trasferisci stock,
  - crea ordine fornitore.
- Massimo una primary CTA per view.

---

# LAYOUT APPLICATIVO — STANDARD OBBLIGATORIO

## App shell

L'app DEVE avere una shell coerente:

- sidebar persistente su desktop,
- topbar persistente,
- area contenuto principale,
- una sola regione principale di scroll.

## Sidebar

La sidebar DEVE contenere almeno:

- Dashboard
- Prodotti
- Magazzino
- Ordini Fornitori
- Clienti
- Report
- Impostazioni

## Topbar

La topbar DEVE contenere:

- titolo/breadcrumb,
- selettore negozio attivo se applicabile,
- utente corrente,
- accesso rapido a notifiche o stato sync.

## Mobile

Su mobile:

- sidebar collassata in drawer,
- topbar sempre accessibile,
- azioni primarie raggiungibili facilmente,
- niente hover-only interaction.

---

# TABELLE — REGOLA CENTRALE DEL PROGETTO

## Tabelle come citizen di prima classe

Il gestionale usa tabelle come elemento principale.
Le tabelle NON sono secondarie: sono una componente core dell'esperienza.

## Requisiti obbligatori

Ogni tabella dati importante DEVE supportare:

- loading state,
- empty state,
- sortable columns dove utile,
- responsive fallback,
- row click o action column chiara,
- sticky header se il contesto lo richiede,
- numeri con `tabular-nums`.

## ⛔ Il clic di riga su un documento apre la MODIFICA _(deciso 19/08/2026)_

> **L'apertura primaria di un documento dal suo elenco va alla maschera di
> modifica. Sempre, per ogni tipo.**

Il `DetailComponent` **non è la destinazione della riga**: è il **Dettaglio** del
documento — la vista di consultazione — e si raggiunge con un **pulsante apposito**,
non cliccando la riga.

⭐ **Sono TRE funzioni diverse** _(deciso 20/08/2026)_, e confonderle è l'errore che
questa regola previene:

|                |                                                                        |
| -------------- | ---------------------------------------------------------------------- |
| **Modifica**   | lavorare sul documento — è dove porta il clic di riga                  |
| **Dettaglio**  | consultarlo rapidamente e in sicurezza, in sola lettura                |
| **Stampa/PDF** | produrne una rappresentazione destinata alla stampa o all'esportazione |

⛔ **Stampa e Dettaglio non c'entrano niente l'uno con l'altro.** Che un documento si
stampi non dice nulla su come lo si consulta. E «anteprima» non è il nome di nessuna
delle tre: **il nome VestiFlow della vista di consultazione è Dettaglio**, ed è quello
che l'operatore legge già nei titoli di pagina.

**Il criterio è cosa fa l'operatore.** Apre un documento per lavorarci: correggere una
quantità, cambiare una data, aggiungere una riga. Portarlo su una vista in sola lettura
gli fa fare un secondo clic per arrivare dove voleva andare, e su un elenco che si
consulta tutto il giorno quel clic si paga a ogni riga.

⛔ **Non si inventa una convenzione per tipo.** Se un documento nuovo si apre
diversamente dagli altri, l'operatore deve ricordarsi quale: è la stessa ragione per cui
le etichette dei pulsanti sono uguali su ogni maschera (`regole-stile-ui` §5).

### ✅ Applicata a ogni tipo — 20/08/2026

⚠️ **Qui c'era «la regola è rispettata solo in parte»**, con una tabella che divideva i
tipi fra chi apriva la maschera (Preventivo, Registrazione fattura, famiglia carico) e chi
apriva l'anteprima (Proforma, DDT vendita, Vendita manuale, Fatture, Vendite al banco). La
divisione non esiste più.

> **La decisione sta in un solo posto, dichiarata per tipo:** `DOCUMENT_ROW_OPENS` in
> `document-routing.util.ts`, e la risposta la dà `documentRowPath`.

⛔ **Non è più «una riga di configurazione» sul profilo di elenco.** Il vecchio
`rowOpensForm` è stato **rimosso**: era una preferenza per profilo, e ciò che vale per
tutti non è una preferenza. È un `Record` **esaustivo** per tipo documento — aggiungerne
uno senza dichiarare dove porta la sua riga **non compila**.

⭐ **Vale anche per la ricerca globale e per i link trasversali**: `documentOpenPath` delega
alla stessa funzione. Se le due rispondessero diversamente, lo stesso documento avrebbe due
aperture a seconda di dove lo si è trovato.

Due sole eccezioni, e sono quelle di `14` §2.1:

### ⏸ DECISIONE APERTA — le eccezioni per stato non sono deliberate

⛔ **Qui c'era una tabella che dichiarava due eccezioni come regola** — «documento annullato →
apre il Dettaglio» e «tipo senza maschera documentale → apre il Dettaglio».

**Non sono mai state decise.** Verificato il 20/08/2026: non esistono in nessun commit — la
regola generale è del commit `956fb446` del 19/08 e non le contiene. Erano una **deduzione dal
comportamento del codice**, e il codice le implementa già (`documentRowPath` manda un annullato
a `documentPreviewPath`).

> **La regola generale resta una sola: clic sulla riga → Modifica, Dettaglio dal suo pulsante.**
> Un'eccezione per stato vale solo se **deliberata**, non se dedotta da come si comporta oggi
> l'implementazione.

⚠️ **Il codice e questa regola oggi divergono**, ed è dichiarato invece che nascosto: fino a
decisione, `documentRowPath` continua a comportarsi come si comporta. Le due domande da chiudere:

| Caso                                                    | La domanda                                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| documento **annullato**                                 | è ancora modificabile? Se non lo è, aprire la Modifica di una cosa non modificabile è un vicolo cieco — ma è una decisione, non una conseguenza |
| tipo **senza maschera documentale** (inventario fisico) | non c'è una Modifica dove mandarlo: qui l'eccezione è **tecnicamente forzata**, non discrezionale. Va comunque dichiarata                       |

### ✅ E il Dettaglio si raggiunge dalla SELEZIONE

⚠️ **Qui c'era una domanda di progetto aperta** — «da dove si raggiunge, una volta tolto
dal clic di riga». Ha una casa, ed è comune a tutti gli elenchi: la **barra azioni
contestuale** (`14` §5).

```text
clic sulla riga      → modifica
clic sulla checkbox  → selezione → azioni contestuali → Dettaglio
```

⚠️ **Il meccanismo è deciso; la riga della matrice per ogni elenco no.** «Dettaglio» è
un'azione **decisa** — il concetto si mantiene e si apre col suo pulsante — ma su quali
elenchi compaia, con quali permessi e in quali stati, si scrive elenco per elenco in
`14` parte E. Le due azioni già attive sono Stampa ed Esporta, scelte perché di sola
lettura.

## Colonne numeriche

Prezzi, quantità, valori stock, totali:

- allineati a destra,
- con `font-variant-numeric: tabular-nums`,
- formattati sempre in modo coerente.

## Responsive tables

Su mobile:

- una tabella molto larga NON deve rompere il layout.
- Strategie ammesse:
  - scroll orizzontale controllato,
  - card view alternativa,
  - colonne secondarie nascoste con espansione dettagli.
- È VIETATO lasciare overflow orizzontale incontrollato.

---

# STATI OPERATIVI — SEMPRE VISIBILI

## Loading

- Ogni pagina e ogni blocco asincrono DEVE mostrare loading esplicito.
- Preferire skeleton per liste, tabelle e card.
- Spinner solo per attese brevi o overlay di azioni specifiche.

## Empty state

- Mai mostrare "Nessun dato" in testo nudo.
- Ogni empty state deve avere:
  - titolo,
  - descrizione,
  - icona,
  - CTA se ha senso.

## Error state

- Gli errori di fetch devono avere stato UI dedicato.
- Gli errori di validazione stanno vicino al campo.
- I toast NON sostituiscono gli errori inline di form.

## Offline / rete instabile

- Se il fetch fallisce o la sync non riesce, mostrare stato non bloccante:
  - banner,
  - toast,
  - badge di sync.
- L'utente deve capire se i dati potrebbero non essere aggiornati.

---

# PRODOTTI E VARIANTI — PATTERN OBBLIGATORIO

## Creazione prodotto

La creazione prodotto deve essere assistita:

1. dati generali,
2. opzioni varianti,
3. generazione combinazioni,
4. completamento dati per singola variante.

## Generazione varianti

- Se l'utente inserisce opzioni come taglia e colore, l'app DEVE poter generare automaticamente le combinazioni.
- È VIETATO costringere l'utente a creare manualmente 30 varianti una per una se le combinazioni sono derivabili.

## SKU

- Ogni variante deve avere SKU univoco.
- Lo SKU va validato lato form.
- Duplicati SKU devono essere bloccati immediatamente nella UI, anche con mock data.

## Controlli e validazioni — Principio

I controlli di business in VestiFlow sono **warning non bloccanti**. L'utente vede l'avviso, capisce l'implicazione, ma può proseguire assumendosi la responsabilità della scelta.

Esempi di controlli come warning:

- quantità superiore alla disponibilità
- sconto anomalo (fuori dal range tipico)
- impegno magazzino oltre la scorta disponibile
- data documento nel passato o nel futuro remoto
- vendita a cliente con esposizione oltre soglia

## Eccezione — Vincoli di integrità dei dati

Restano **blocchi hard** nella UI solo le violazioni che romperebbero il database, la sync con canali esterni, o l'identificazione univoca di un'entità:

- **SKU duplicato** all'interno del tenant
- **Codice articolo interno duplicato** all'interno del tenant
- **Barcode / EAN duplicato** all'interno del tenant
- Violazioni di multi-tenancy o vincoli di schema

Regole per un blocco ben fatto:

- validazione **live** mentre l'utente digita, non solo al submit
- messaggio chiaro sul motivo del blocco
- riferimento al record in conflitto quando disponibile (es. _"SKU 00036 già in uso — prodotto: Maglietta test cotone"_)
- suggerimento di risoluzione quando possibile (link al prodotto esistente, proposta di suffisso automatico)

Il numero documento duplicato è gestito diversamente da un blocco: il vincolo unico del database rifiuta il salvataggio e la maschera mostra un **avviso a bottone singolo** che nomina il numero rifiutato, **scrive in testata il numero nuovo** e lascia all'operatore la pressione di Salva (specifica numerazione §3).

_Aggiornata il 12/08/2026._ Qui c'era scritto «modal di risoluzione con opzioni Usa nuovo numero / Mantieni attuale / Annulla»: quel modale **non esiste più** — «Mantieni attuale» prometteva una cosa che il vincolo unico non può concedere. La regola descriveva un pattern rimosso, ed è il tipo di scarto che nessun test trova.

## Barcode

- Se presente, validarlo come stringa distinta dal SKU.
- Barcode e SKU NON sono la stessa cosa.

---

# MAGAZZINO — PRINCIPI DI SICUREZZA OPERATIVA

## Azioni sensibili

Le azioni seguenti sono sensibili:

- scarico stock,
- rettifica inventario,
- trasferimento tra negozi,
- eliminazione prodotto/variante,
- ricezione ordine.

Queste azioni DEVONO avere almeno uno tra:

- confirm dialog,
- doppia conferma contestuale,
- riepilogo finale prima del submit.

## Rettifiche

- Una rettifica stock deve richiedere un motivo.
- È VIETATO permettere adjustment silenziosi.

## Trasferimenti

- Un trasferimento deve mostrare chiaramente:
  - location origine,
  - negozio destinazione,
  - quantità,
  - impatto finale atteso.

---

# SHOPIFY-READY — MAI HARDCODARE INTEGRAZIONI

## Frontend

- Il frontend NON contiene token Shopify, secret o logica sensibile.
- Nel frontend si gestiscono solo:
  - stato connessione,
  - pulsante sync,
  - mapping campi,
  - esito sync,
  - identificativi pubblici/non sensibili.

## Stato sync

Prodotti e negozi collegati a Shopify devono esporre chiaramente:

- sincronizzato,
- non sincronizzato,
- errore sync,
- sync in corso.

## UI Shopify

Una schermata o tab Shopify deve mostrare almeno:

- dominio store collegato,
- stato connessione,
- ultimo sync,
- eventuali errori recenti,
- ID Shopify collegati quando utili per debug admin.

---

# FILTRI E RICERCA

## Liste grandi

Per prodotti, varianti, movimenti, clienti, ordini:

- includere ricerca libera,
- includere filtri contestuali,
- rendere i filtri resettabili.

## Filtri minimi

- Prodotti: categoria, brand, stagione
- Varianti/magazzino: negozio, stato stock
- Movimenti: tipo movimento, data, negozio
- Ordini: stato, fornitore, periodo

## Persistenza stato UI

Se tecnicamente semplice, mantieni in query params:

- pagina,
- ordinamento,
- ricerca,
- filtri.
  Questo migliora UX e condivisibilità della pagina.

---

# MOBILE OPERATIVO — OBBLIGATORIO

Il gestionale deve essere consultabile e usabile da smartphone, specialmente in magazzino.

## Obiettivi mobile

Da smartphone un utente deve poter fare facilmente almeno:

- cercare un prodotto,
- vedere stock di una variante,
- verificare giacenza per location,
- registrare un carico/scarico semplice,
- consultare un ordine fornitore,
- leggere un barcode/SKU.

## Regole mobile

- touch target minimo 44px,
- form compatti ma leggibili,
- search bar sempre accessibile,
- tabelle critiche con fallback mobile,
- CTA principali visibili senza precisione da mouse.

## Scanner

Se si integra scansione barcode:

- progettare componenti e UX mobile-first,
- prevedere fallback manuale se la camera non è disponibile o il permesso è negato.

---

# PERFORMANCE — GESTIONALE, NON DEMO

## Obbligatorio

- lazy loading per tutte le feature,
- route-level code splitting,
- `OnPush` ovunque,
- `track` obbligatorio in ogni `@for`,
- niente computed inutili o effect rumorosi,
- evitare rendering di grandi tabelle senza paginazione o virtualizzazione.

## Liste grandi

Per dataset grandi:

- paginazione server-side o simulata,
- virtual scroll se davvero necessario,
- debounce sulla ricerca.

---

# MOCK DATA E PREPARAZIONE BACKEND

## Pattern mock

Finché il backend non esiste:

- usare mock services fortemente tipizzati,
- simulare delay realistici,
- simulare anche errori e empty states.

## Contratti

- Definire DTO e modelli pensando già al backend NestJS/PostgreSQL.
- Il frontend non deve modellare dati in modo incompatibile con backend relazionale futuro.

---

# ACCESSO E PERMESSI — UI

## Ruoli minimi previsti

Progettare la UI tenendo conto almeno di:

- owner
- admin
- manager
- clerk / sales

## Permessi

- La UI può nascondere azioni non consentite,
- ma i controlli reali vivranno lato server.
- Preparare comunque direttive/helper/guard per il rendering condizionale delle azioni.

---

# AUDITABILITÀ UI

Per ogni azione sensibile, la UI dovrebbe poter mostrare:

- chi ha eseguito l'azione,
- quando,
- su quale entità,
- con quale quantità o stato prima/dopo se disponibile.

Questo vale soprattutto per:

- stock movements,
- rettifiche,
- ordini ricevuti,
- cancellazioni.

---

# DIVIETI ESPLICITI

- VIETATO progettare il gestionale come landing page o sito corporate.
- VIETATO usare copy generico tipo "Empower your business" nella UI interna.
- VIETATO nascondere dati operativi dietro troppe animazioni o layout scenografici.
- VIETATO usare card giganti quando una tabella risolve meglio.
- VIETATO usare valori di stock solo come colore: il numero deve sempre essere leggibile.
- VIETATO accorpare prodotto e variante in un unico modello semplificato.
- VIETATO assumere che il desktop sia l'unico device.
- VIETATO usare mock troppo ottimistici: simulare anche errori, zero risultati e latenze.

---

# CHECKLIST PRE-MERGE SPECIFICA DEL GESTIONALE

- [ ] Ogni feature è lazy loaded.
- [ ] Esiste una app shell coerente con sidebar + topbar.
- [ ] Le varianti sono trattate come entità separate dal prodotto.
- [ ] Lo stock è modellato per location (variante × location), non come singolo campo.
- [ ] Ogni entità sincronizzata ha un owner di sync dichiarato (vedi OWNERSHIP DEI DATI).
- [ ] Ogni modifica inventariale produce un movimento tracciabile.
- [ ] Tabelle principali hanno loading, empty, error e responsive fallback.
- [ ] Mobile: ricerca stock e dettaglio variante sono usabili da smartphone.
- [ ] Nessun segreto Shopify o token è presente nel frontend.
- [ ] UI pronta per multi-tenant e multi-store.
- [ ] Almeno una schermata mostra chiaramente stato sync Shopify.
