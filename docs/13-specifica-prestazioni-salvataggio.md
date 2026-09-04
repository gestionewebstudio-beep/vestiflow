# 13 — Prestazioni del salvataggio e pipeline inventario (C4)

_Indagine del 19/08/2026. Raccoglie tre censimenti a ventaglio (34 agenti, 1.215 letture di
file, documentazione ufficiale Shopify e PostgreSQL) e li riduce a: cosa è stato misurato,
cosa è rotto adesso, cosa va deciso prima di scrivere codice._

⛔ **Nessuna riga di implementazione è stata scritta.** Il proprietario ha fermato il lavoro
prima della migration, apposta per decidere sui numeri invece che sull'intuizione.

---

## 0. Perché questo documento esiste

Il lavoro era cominciato come un'ottimizzazione: _«perché il salvataggio dei documenti impiega
tanto tempo?»_. La misura ha risposto **28,7 secondi per un Arrivo merce da 10 righe**, e da lì
la domanda è cambiata due volte.

|     | La domanda                                       | Chi l'ha cambiata                                                                                         |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | «togliamo 14 secondi»                            | la prima misura: metà del tempo è push Shopify                                                            |
| 2   | «togliamo il **moltiplicatore per riga**»        | il proprietario: _«a breve saranno tanti clienti ed ognuno potrà movimentare tante righe insieme»_        |
| 3   | «e senza spostare il collo di bottiglia altrove» | il proprietario: _«non voglio un worker che esegua tranquillamente 100 × (5 SELECT + 1 HTTP + 2 UPDATE)»_ |

> **Il criterio di chiusura non è un tempo.** Il lavoro è finito quando **non esiste più
> latenza proporzionale al numero di righe**, e ci sono benchmark su documenti grandi e
> concorrenza multi-tenant a dimostrarlo.

⛔ **«28,7 s → 5 s» non è il bersaglio**, ed è stato respinto esplicitamente: cinque secondi
per dieci righe resta troppo, e non dice niente su cosa succede a duecento.

---

## 1. Il problema, in un numero

Per un Arrivo merce da **N righe**, il salvataggio emette:

```text
7N + 32   istruzioni SQL sequenziali     (verificato sul DDL, non su schema.prisma)
```

più, **dopo il commit ma dentro la stessa richiesta HTTP**, per ogni coppia (variante, sede)
distinta: **10 query al database + 1 chiamata HTTP a Shopify + attesa del rate limiter**.

A ~114 ms di round-trip verso il pooler Supabase:

| N righe | istruzioni SQL | tempo transazione | + push Shopify | totale                   |
| ------- | -------------- | ----------------- | -------------- | ------------------------ |
| 10      | 102            | 11,6 s            | 14,3 s         | **28,7 s** ✅ _misurato_ |
| 50      | 382            | 43,5 s            | 71 s           | ~115 s                   |
| 100     | 732            | 83,4 s            | 143 s          | ~226 s                   |
| 250     | 1.782          | 203 s             | 358 s          | **~9 minuti**            |

Il DTO accetta fino a **500 righe** (`api/src/documents/dto/save-goods-receipt.dto.ts:305`,
`@ArrayMaxSize(500)`). Un documento da 500 righe è oggi **impossibile**, in modo
deterministico — non lento.

⚠️ **Il trasferimento raddoppia il push**: due coppie per riga, origine e destinazione
(`api/src/documents/document-stock-transfer-sync.util.ts:180-181`).

### ⚠️ L'incognita che vale un fattore 40

I 114 ms sono misurati **da una macchina di sviluppo italiana verso `aws-0-eu-west-`
attraverso Internet**. Da Railway, in-region, sarebbero 1-5 ms. Nessuno ha rimisurato dalla
produzione. **Tutte le stime temporali di questo documento vanno divise per ~40 se il carico
gira lì** — ma il **numero di istruzioni** non cambia, ed è quello il difetto.

---

## 1-bis. ⭐ IL NUMERO CHE VALE PER TUTTO — misurato il 21/08/2026

```text
round-trip a vuoto verso il database:  269 ms   (SELECT 1, mediana su 8)
```

⛔ **Non è il lavoro della query: è la distanza.** Il database è gestito e remoto, e ogni
andata e ritorno costa un quarto di secondo **prima** che il server faccia qualcosa.

⭐ **Da cui la regola che vale in tutto il progetto**, e che questo documento aveva già
incontrato sotto un'altra forma (il moltiplicatore per riga della pipeline inventario):

> **Quello che si paga è il NUMERO di query, non il loro peso.** Una query in più costa 269 ms
> anche se non legge niente. Dieci query in serie sono due secondi e mezzo di sola attesa.

### Come è saltato fuori

_«Quando apro corrispettivi ci mette un po'.»_ La misura ha trovato **due difetti che si
sommavano**, e nessuno dei due si vedeva leggendo il codice:

|                                                                                   |                       |
| --------------------------------------------------------------------------------- | --------------------- |
| il riepilogo faceva **sette letture in fila**, ognuna in attesa della precedente  | ~1,9 s di sola attesa |
| l'elenco faceva **cinque conteggi** solo per applicare un tetto, prima di leggere | +269 ms               |

✅ Corretti: le sette letture in un `Promise.all` (non dipendevano l'una dall'altra), e i
conteggi tolti — le letture partono con `take: TETTO + 1` e il tetto si verifica **dopo**. Nel
caso normale si risparmia un giro intero; nel caso limite si è letto invano, ma quel caso
finisce comunque in errore.

⚠️ **Restano due letture della stessa cosa**: elenco e riepilogo interrogano le stesse cinque
sorgenti, in due chiamate HTTP parallele. Il client aspetta il massimo dei due, ma il database
fa il doppio del lavoro. Unirle è un cambio di contratto, ed è una decisione — non la si prende
di straforo dentro una correzione di prestazioni.

### ⚠️ Come rifare questa misura

```js
// dalla cartella api/, con --env-file=.env
const t0 = process.hrtime.bigint();
await prisma.$queryRaw`SELECT 1`;
console.log(Number(process.hrtime.bigint() - t0) / 1e6, 'ms');
```

⛔ Va rifatta **da dove gira il codice**: da un portatile di sviluppo misura la distanza da
casa, non quella di produzione. Il numero qui sopra è di sviluppo, ed è la ragione per cui
serve a decidere _quante_ query fare, non a stimare il tempo che vedrà un cliente.

---

## 2. I muri, in ordine di incontro

### ⛔ Muro 1 — il timeout del CLIENT, 15 secondi. È già armato oggi

```text
src/app/domain/documents/services/document.service.ts:33    const HTTP_TIMEOUT_MS = 15000;
src/app/domain/documents/services/document.service.ts:213    .pipe(timeout(HTTP_TIMEOUT_MS), …)
```

Il browser molla a **metà** del budget della transazione — e il suo orologio include **anche
il push**, che invece non conta contro i 30 s di Prisma.

> **Si rompe a ~14 righe su un tenant senza canale, a ~5 righe con Shopify collegato.**

**La prova non richiede stime**: 28,7 s misurati per dieci righe sono **1,9 volte** i 15 s del
client. Su quella macchina un Arrivo merce da 10 righe fallisce **già adesso**.

⛔ **Ed è il peggiore dei tre fallimenti possibili.** Il documento è **committato**, il push è
a metà, e l'operatore legge «La richiesta ha impiegato troppo tempo. Riprova.»
(`http-error.mapper.ts:9`). Lo invita a rifare un lavoro già fatto — e il secondo tentativo
urta il vincolo unico sul numero documento.

### Muro 2 — il timeout di transazione Prisma, 30 secondi

`api/src/prisma/prisma.service.ts:13-17` — `{ maxWait: 10_000, timeout: 30_000 }`, ereditato
dal `$transaction` che non passa opzioni proprie (`goods-receipt-workflow.service.ts:459`).
**Si rompe a ~24-36 righe.** Rollback totale: è l'unico fallimento che **perde il documento**,
ma non lascia sporcizia (il lock della numerazione è transazionale e cade col rollback).

⚠️ **Il rapporto fra muro 1 e muro 2 è costante a qualunque latenza.** Alzare solo il timeout
del client sposta il muro dentro la transazione, non lo elimina.

### ⛔ Muro 3 — il pool di connessioni: 5, con `maxWait` più corto della transazione

`api/.env` — `?pgbouncer=true&connection_limit=5`. Una sola istanza di PrismaClient
(`prisma.module.ts:6-9`), un solo processo Node (`api/Dockerfile:39`).

> **Sei salvataggi concorrenti.** E la forma della rottura è peggiore del numero: `maxWait` è
> 10 s mentre una transazione da 10 righe ne dura 13,5. **La coda non si forma mai.**

Sotto carico il sistema non degrada: **rifiuta**, con `Unable to start a transaction` — errore
già catalogato in `docs/SETUP-LOCALE.md:331` come sintomo di **`.env` mal configurata**.
⛔ **La diagnosi partirà sbagliata.**

Tre aggravanti misurate:

- **il push compete sullo stesso pool** — 1.000-2.000 query dopo il commit per un documento da
  200 righe, mentre altre richieste chiedono connessioni;
- **i webhook Shopify sono elaborati in linea** e sono `@SkipThrottle()`
  (`shopify-webhooks.controller.ts:15,44`);
- **l'healthcheck passa dallo stesso pool** (`health.controller.ts:19`) con
  `restartPolicyType = ON_FAILURE`: pool saturo → healthcheck in attesa → **riavvio** → si
  perde tutto ciò che vive in memoria (rate limiter, `pushInFlight`, e i push
  fire-and-forget della vendita al banco, che non hanno **nessuna riga da nessuna parte**).

### Muro 4 — il rate limit Shopify: un pavimento aritmetico

Bucket 40, leak 2/s su piano Standard. Pavimento `(N−40)/2` secondi **per shop, a latenza
zero**: 20 s a 80 coppie, 80 s a 200, **83 minuti** a 10.000 (prima pubblicazione di un
catalogo).

⛔ **È l'unico muro che un outbox NON sposta di un secondo.** Sposta l'attesa fuori dalla vista
dell'operatore; il ritardo di propagazione verso il negozio resta lineare. Solo il
raggruppamento a 250 coppie per chiamata lo abbatte.

---

## 3. La curva del costo locale, operazione per operazione

Percorso: `POST /documents/goods-receipt/save` → `documents.controller.ts:128-148` →
`GoodsReceiptWorkflowService.saveGoodsReceipt`.

| operazione                                                                             | query per N righe                    | classe                                                         |
| -------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| righe documento (`documentLine.update`/`create`) — `:682,714,716`                      | **N**                                | scrittura eterogenea batchizzabile → 1-2                       |
| cancellazione righe rimosse — `:678`                                                   | 1                                    | **già in blocco**                                              |
| movimenti `stockMovement` — `document-goods-receipt-sync.util.ts:158,178,260`          | **N**                                | scrittura eterogenea batchizzabile → 1                         |
| giacenze `applyInventoryDelta` — `inventory-level-delta.util.ts:23-37`                 | **3N** (6N se `targetChanged`)       | batchizzabile → 1, **con due precondizioni**                   |
| movimenti orfani — `document-goods-receipt-sync.util.ts:280-291`                       | 4 per orfano                         | batchizzabile → 2                                              |
| supplier link `supplierVariantLink.upsert` — `document-supplier-price.util.ts:154-166` | **N**                                | scrittura eterogenea batchizzabile → 1                         |
| costi varianti `productVariant.updateMany` — `document-supplier-price.util.ts:129-147` | ≤N                                   | **già raggruppato per costo** _(19/08)_                        |
| prezzi anagrafica — `document-article-price.util.ts:112-136`                           | **N**                                | scrittura eterogenea batchizzabile → 1-2                       |
| rilettura righe `documentLine.findMany` — `:720`                                       | 1                                    | ⛔ **rilettura inutile** (gli id li genera Prisma lato client) |
| rilettura documento `document.findFirstOrThrow` — `:826`                               | 1 + righe                            | ⛔ **rilettura inutile** (il controller ne usa solo `.id`)     |
| `documents.getById` finale                                                             | ~12                                  | parzialmente necessaria                                        |
| `productVariant.findMany` — `document-article-price.util.ts:105`                       | 1                                    | ⛔ **duplicata** (stesse varianti già lette a `:392`)          |
| `isShopifyActiveTenant` dentro tx — `document-article-price.util.ts:60-69`             | 1                                    | ⛔ **duplicata** (cache 60 s non usata da lì)                  |
| validazioni: IVA, varianti, fornitore, sede                                            | **5-6 FISSE**                        | ✅ **già in blocco — niente da fare**                          |
| lotti / seriali                                                                        | 1 per lotto; **1 per UNITÀ seriale** | batchizzabile (`createMany`)                                   |

> **Le validazioni sono già tutte accorpate. Le scritture sono il 100% della crescita.**

### ⚠️ `applyInventoryDelta` costa 3 round-trip, non 2

L'`upsert` a `inventory-level-delta.util.ts:24-28` ha `update: {}` **vuoto**. In quel caso
Prisma **non** compila l'`INSERT … ON CONFLICT` nativo: emette SELECT + INSERT. Condizioni
ufficiali sulla documentazione Prisma, comportamento in
[prisma/prisma#20229](https://github.com/prisma/prisma/issues/20229), chiusa come _not
planned_.

⛔ **Riempire quell'`update` con un campo qualsiasi fa scattare l'upsert nativo**: −N
round-trip su **ogni** documento che movimenta magazzino, e chiude una race documentata.
È l'intervento a rapporto resa/rischio migliore di tutto l'elenco.

### ⛔ `applyInventoryDelta` ha ~48 punti di chiamata in 10 file

Non uno. I cinque sync documentali, `inventory-movement.util`, `inventory.service`,
`inventory-count.service`, `online-sale-fulfillment.service`.

> **La versione set-based va AFFIANCATA, mai sostituita**, e i chiamanti migrati uno alla
> volta.

---

## 4-6. Il canale, la coda e il worker → `02-specifica-sincronizzazione-shopify` §6.5 e §8

⛔ **Questa materia NON vive qui.** `docs/02` possiede già la coda in uscita, i tentativi e
l'elenco dei sospesi (§6.2-6.4), e teneva aperto in §8 proprio _«il lucchetto sui processi
periodici»_. I censimenti **chiudono quel punto** e precisano la forma della coda: sono stati
scritti là, dove chi progetta la sincronizzazione andrà a cercarli.

Quello che troverai in `02` §6.5:

|                                                    |                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **la coda accoda lo STATO, non gli eventi**        | un documento da 200 righe non deve fare 200 job; il worker rilegge la giacenza corrente al momento dell'esecuzione — comportamento **già confermato** nel codice |
| ⛔ **ma coalescere oggi rompe l'autoriparazione**  | il gate `unchanged` è **storico, non di stato**: confronta con quanto VestiFlow ha spedito, non con quanto Shopify ha davvero. Col controesempio in numeri       |
| ⛔ **`ShopifyInventorySyncState` non è riusabile** | refutato su sei fronti; il decisivo è che deduplica del lavoro e memoria del push sono **la stessa colonna**. Serve una tabella nuova                            |
| **il lotto da 250**                                | `inventorySetQuantities`, il campo scritto, il costo, e i **quattro requisiti che REST non chiedeva**                                                            |
| ⛔ **la versione API è già ritirata**              | `2025-01` non è più accessibile: fall-forward silenzioso. Si lega alla tenaglia di `@idempotent`                                                                 |
| **il vincolo di distribuzione**                    | «molti tenant» impone la distribuzione pubblica, che impone GraphQL. Non è un'ottimizzazione: è una scadenza                                                     |

E in `02` §8, il lucchetto **non è più aperto**: «una sola istanza» è refutato su due gambe
(il pannello Railway non è nel repo; e comunque il database è condiviso e **la CI avvia l'API a
ogni PR**), il meccanismo è `pg_try_advisory_xact_lock` — **già in produzione attraverso questo
stesso pooler**, ma nella variante non bloccante — e resta da decidere **dove gira il worker**.

⚠️ **Il costo del push resta un numero di QUESTO documento**, perché è latenza che l'operatore
paga: **10 query + 1 HTTP + attesa del limiter per ogni coppia distinta**, ~1,5 s ciascuna, che
su un tenant con canale collegato sono i **due terzi** del tempo della richiesta.

---

## 7. I test — e il gate che oggi blocca il push

### ⛔ La copertura è sotto soglia su tutte e quattro le metriche _(19/08/2026)_

```text
                 attuale    soglia    mancano
statements        73,75%       76%       +111
branches          66,05%       69%       +119
functions         67,94%       71%        +48
lines             73,99%       76%        +91
```

`npm run test:coverage` **esce 1**, e l'hook `pre-push` esegue `test:everything` che comincia
da lì: **il push del ramo è bloccato.**

⚠️ Le soglie 76/69/71/76 furono fissate il 17/08 **sulla misura reale** (76,44%), con la nota
«da lì può solo salire, e una regressione la ferma davvero». **Sta facendo esattamente il suo
mestiere**: il ramo ha aggiunto molto codice non-componente senza test.

I file che pesano di più (statement scoperti):

```text
 90 / 94   4%   domain/documents/services/document.service.ts       ← è il file di HTTP_TIMEOUT_MS
 82 / 87   6%   core/auth/auth-redirect-session.util.ts
 77 / 79   3%   features/documents/utils/document-list-export.util.ts
 64 /128  50%   domain/inventory/services/inventory.service.ts
 51 /115  56%   core/permissions/tenant-permissions.util.ts
 51 /131  61%   domain/products/services/product.service.ts
 43 / 54  20%   domain/documents/models/document-labels.util.ts
 43 / 45   4%   shared/directives/table-column-resize.directive.ts
```

> **I primi tre file valgono 249 statement scoperti: coprirli chiude da soli il divario di
> statement e righe.** Sono anche i tre più facili da testare — un service HTTP, un util di
> sessione, un util di export.

⛔ **Abbassare le soglie non è un'opzione**: le regole lo dichiarano lavoro dichiarato, non un
ritocco al numero. E un gate sempre rosso è un gate spento.

### I test non parlano con un database vero

**186 spec, 1.797 casi** nell'API, e **nessuno** parla con un database: `new PrismaClient()`
non compare in nessuno spec. Nessun `testcontainers`, nessun `pg-mem`, nessun
`docker-compose`, **nessun servizio Postgres in CI**.

**35 spec simulano `prisma.inventoryLevel`**, senza alcun helper condiviso: quattro file
definiscono la **propria copia identica** dello stesso finto.

|                                                             | quante                         | esito con una riscrittura set-based     |
| ----------------------------------------------------------- | ------------------------------ | --------------------------------------- |
| asserzioni che leggono gli argomenti                        | ~94                            | **rosse subito**, riscrittura obbligata |
| asserzioni in forma **negativa** (`not.toHaveBeenCalled()`) | **13**, verificate una per una | ⛔ **verdi a vuoto**                    |

⛔ Le 13 sono **esattamente quelle che proteggono i casi di NON movimentazione** — riga senza
spunta magazzino, quantità zero, riga senza variante. Cioè il difetto «un percorso set-based
che muove giacenza dove non doveva».

> **Il pericolo non è che i test smettano di essere rossi: è che 94 rossi obblighino a una
> riscrittura di massa e le 13 vacue passino inosservate.**

### ⚠️ Il rischio si è già avverato, ed è documentato

`docs/GUARDIE-MANCANTI.md:456-478`: **due query grezze erano sbagliate quando sono state
scritte** — `reference` inesistente su `sales_orders`, `series = ''` invece di `series IS
NULL` — **con i test verdi e l'endpoint in 500**, trovate «chiamando l'applicazione vera
contro il database vero». La soglia di urgenza dichiarata era «le query grezze diventano tre o
quattro»: **sono già otto**, e la più complessa non ha nemmeno uno spec.

### Due appoggi già in casa, disarmati

- **Gli E2E scrivono davvero e non guardano il numero.** `e2e/movements.spec.ts` registra
  carichi, scarichi, rettifiche e trasferimenti contro API e database reali, poi verifica che
  il movimento compaia **nello storico** — **nessuna asserzione su `onHand`/`available` prima
  e dopo**, benché il test rettifica **legga già** la giacenza corrente. È il presidio più
  vicino al risultato che esista, disarmato per un'asserzione mancante.
- **Non esiste UN benchmark.** `performance.now`, `console.time`, `process.hrtime` → **zero**
  in tutto il repository. Un lavoro il cui scopo è togliere il moltiplicatore per riga **non
  ha oggi alcun modo ripetibile di dimostrare di averlo tolto.**

> Il presidio giusto non è un test di tempo (fragile per costruzione) ma **un test che conti le
> QUERY** e affermi che il numero **non dipende da N**. Deterministico, e già misurabile
> contando le chiamate ai finti attuali.

### ⚠️ `prisma migrate deploy` su un Postgres vanilla FALLISCE

25 migration nominano i ruoli Supabase `anon`/`authenticated`, e **solo sei** li proteggono
con `IF EXISTS (SELECT 1 FROM pg_roles …)`. Le altre fanno `REVOKE ALL … FROM anon,
authenticated` nudo: Postgres si ferma con «role "anon" does not exist». Si chiude con due
`CREATE ROLE` vuoti nel bootstrap — **poco lavoro, ma va saputo prima**, o il primo tentativo
di test di integrazione sembra un problema di schema.

---

## 8. Difetti trovati per strada, non cercati

|     | dove                                           | cosa                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⛔  | `shopify-product-push.service.ts:180-185,321`  | `markProductSyncing` scrive `syncing` **prima** del `void`; il `finally` ripulisce solo la memoria. **Se il processo muore, il prodotto resta `syncing` per sempre** — e quello stato fa **saltare gli import da webhook**. Un push perso blocca anche l'ingresso, in silenzio. Nessun reaper esiste |
| ⛔  | `shopify-inventory-republish.service.ts:74-75` | conta `succeeded` su qualunque ritorno non-eccezionale: una riga che esce `unchanged` è **contata come riparata mentre resta in coda per sempre**, occupando il tetto di 50 a scapito delle altre                                                                                                    |
| ⚠️  | `channel-sync.facade.ts:96-104`                | `enqueueInventoryPush` è **codice morto puro**: zero chiamanti. La porta asincrona esiste già; manca ciò che le sta dietro                                                                                                                                                                           |
| ⚠️  | `channel-sync.facade.ts:87-101`                | `pushProduct` — che legge davvero l'esito — ha **zero chiamanti in produzione**. Il pulsante manuale usa `enqueuePush`, che torna subito: **l'esito che arriva all'operatore è quello della sola guardia**                                                                                           |
| ⚠️  | `documents.service.ts:1160-1167`               | i cinque cicli **non deduplicano** i `syncTargets`, mentre i due workflow lo fanno. E le util accodano **fino a due target per riga modificata**                                                                                                                                                     |
| ⚠️  | `goods-receipt-workflow.service.ts:846`        | `removeAllLineMovements` — zero chiamanti, spec inclusi                                                                                                                                                                                                                                              |
| ⚠️  | —                                              | **tre forme dati diverse** per la stessa lista di coppie: array di oggetti, `Set<string>` risplittato con `.split(':')` (**scarta in silenzio le chiavi malformate**), e «una variante + array di sedi»                                                                                              |
| ⚠️  | `inventory-level-delta.util.ts:34-37`          | non legge il `count` della propria `updateMany`: **il delta si perde in silenzio**. Il gemello `applyIncomingDelta` il count lo controlla e solleva 422                                                                                                                                              |

---

## 9. L'ordine degli interventi

Ogni voce: cosa sposta, il numero che lo giustifica, da cosa dipende.

### Eseguibili subito — nessuna decisione bloccante

**0. Contatore di query nei test** _(rete, non intervento)_
Un finto che conti le chiamate Prisma e asserisca «per un documento da N righe il numero di
istruzioni **non dipende da N**». Deterministico, non guarda l'orologio, **già misurabile con
i finti attuali**. _Numero:_ non esiste un benchmark in tutto il repository. **Precede tutto**:
è ciò che dimostra che 1-9 hanno funzionato.

**1. Riempire l'`update: {}` di `applyInventoryDelta`**
Una riga. _Numero:_ **−N round-trip su ogni salvataggio di ogni documento che movimenta**;
coefficiente da 7 a 6 per riga. Chiude anche una race documentata. **Rischio minimo.**

**2. Il timeout del client: alzarlo o dichiararlo limite di progetto**
_Numero:_ **~14 righe senza canale, ~5 con Shopify**, contro le 500 che il DTO accetta.
**Difetto già armato oggi, indipendente da tutto il resto.**

**3. Togliere le due riletture e le due letture duplicate**
_Numero:_ **~13 istruzioni sul costo fisso**, di cui 2 dentro la transazione.

**3-bis. Riportare la copertura sopra soglia** — vedi §7. Sblocca il push.

### Richiedono decisioni esplicite, elencate in §10

**4. Marcatura persistente + togliere il push dal percorso di risposta**
_Numero:_ **−1,5 s per variante distinta**; su N=100 sono **−150 s**, i due terzi del totale.
_Bloccanti:_ tabella **nuova** (il riuso è refutato); il gate `unchanged` va risolto o la coda
si svuota senza fare niente; la marcatura sta **dentro la transazione** e la facade non accetta
un `TransactionClient`; deduplicare i `syncTargets` anche nei cinque cicli che oggi non lo
fanno. ⛔ **E prima: le righe orfane senza FK**, o la coda nasce già con lavoro fantasma.

**5. Worker per shop, servizio Railway separato, `pg_try_advisory_xact_lock`**
_Numeri:_ pool proprio invece delle 5 connessioni condivise; concorrenza fra shop gratis dalla
chiave; anti-sovrapposizione incluso dal cron Railway. _Dipende da 4._ ⛔ **Prima di
accendere: verificare che la CI non cominci a pubblicare su Shopify a ogni PR.**

**6. `applyInventoryDeltas` set-based, AFFIANCATA, un chiamante alla volta**
_Numero:_ **3N → 1** sul percorso migrato. _Bloccanti:_ la **pre-aggregazione per (variante,
sede) è precondizione di correttezza** — Postgres solleva _cardinality violation_ se lo stesso
comando tocca due volte la stessa riga, e il caso è **garantito** da tre vie indipendenti;
⛔ **la Rettifica va migrata per ultima o con logica diversa**, perché lì la semantica è
**ULTIMO VINCE, non SOMMA** (`inventory.service.ts:539-549`) e la pre-aggregazione per somma
**scrive il numero sbagliato in silenzio**.

**7. `createMany`/`createManyAndReturn` sulle scritture omogenee**
Movimenti, seriali (**1 INSERT per UNITÀ** oggi: una riga da 50 pezzi = 50 round-trip), lotti.
_Numero:_ **N → 1** per ciascuna. Verificato presente nel client generato.

**8. Le tre scritture eterogenee restanti in `UPDATE … FROM unnest(…)`**
_Numero:_ **4N → 4**; con 1-7 fatti, `7N + 32` scende verso **~40 istruzioni costanti,
indipendenti da N**. ⛔ _Bloccato da:_ **come passare un `NUMERIC(16,6)` dentro `::numeric[]`**
— nessun precedente nel repository, e **un cast sbagliato non fallisce: scrive un numero
diverso di un centesimo**, nel posto dove è più difficile da attribuire. **Peggior rapporto
resa/rischio: va per ultimo.**

**9. Migrazione a `inventorySetQuantities`**
_Numero:_ 250 POST REST → **1 mutation**. ⛔ **Non è un'ottimizzazione: è una scadenza** —
«molti tenant» richiede distribuzione pubblica, che impone GraphQL. _Prerequisiti tutti
bloccanti:_ alzare la versione API (perimetro proprio, muove anche il REST); **provare
`ITEM_NOT_STOCKED_AT_LOCATION` su un negozio di collaudo**; decidere `reason` e
`compareQuantity`; risolvere la tenaglia di `@idempotent`; leggere in blocco
`shopifyInventoryItemId`.

---

## 10. Le decisioni aperte — da prendere, non da scoprire

| #   | Decisione                                                                                                 | Perché non può deciderla chi implementa                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Dove gira il worker**: in-process o servizio Railway separato                                           | cambia pool, stato, e i meccanismi di ricorrenza disponibili. **Va deciso prima, non dopo**                              |
| 2   | **La granularità accettabile**: il cron Railway ha minimo 5 minuti                                        | «una giacenza non pubblicata fino a 5 minuti dopo» è una decisione di prodotto, non ereditata dal limite dello strumento |
| 3   | **Il valore di `reason`** (enum di 17)                                                                    | finisce nello storico inventario che il **cliente** vede nell'admin Shopify                                              |
| 4   | **`compareQuantity` o opt-out**                                                                           | il desired-state _è_ l'opt-out, ma Shopify avverte sulle quantità inaccurate in concorrenza                              |
| 5   | **Il flag di coda riusa `mismatchDetected`** (che ha due lettori e una superficie utente) o è colonna sua | un flag di coda acceso lì direbbe all'operatore che Shopify e VF divergono quando c'è solo lavoro in attesa              |
| 6   | **Il timeout del client resta a 15 s?**                                                                   | determina il numero da battere                                                                                           |
| 7   | **Il perimetro canali della coda**: chiave per Shopify o comune a TikTok                                  | le due semantiche divergono, e una chiave sola fa **aumentare** le chiamate TikTok                                       |
| 8   | **L'idempotenza della creazione documento**                                                               | vedi §11 — è un requisito di correttezza a sé, non un contorno                                                           |

---

## 11. L'idempotenza della creazione — problema aperto e senza rete

> **Se il commit riesce ma la risposta al client si perde, oggi non esiste niente che impedisca
> la nascita di un secondo documento.**

Misurato:

- il DTO ha `id?: string` opzionale — «id assente = creazione». **Nessuna chiave lato client**
  per riconoscere «questo è lo stesso tentativo di prima»;
- il client fa solo `timeout(15000)`, **nessun `retry()`**: serve un secondo clic
  dell'operatore, che è esattamente ciò che l'errore «Riprova» gli chiede;
- il commento «operazione idempotente» in `document.service.ts` è **impreciso**: quella
  idempotenza copre il **risalvataggio** (id già noto → i movimenti si aggiornano per
  `sourceLineId`), non la **prima creazione**.

⛔ **Il ritiro del salvataggio progressivo alza il peso di questo punto.** Il requisito
ritirato prometteva che si perdesse «al massimo la riga non ancora sincronizzata»; senza
progressivo, **un salvataggio fallito perde il documento intero**.

### La tecnica esiste già in casa, testata e in produzione

`OnlineOrderEvent` fa esattamente questo per gli eventi Shopify **in ingresso**: `dedupeKey` +
`@@unique([tenantId, dedupeKey])` + **`createMany({ skipDuplicates: true })` dentro la stessa
transazione**, leggendo `count === 0` per riconoscere «già visto» — deduplica **senza
eccezioni da catturare dentro la transazione**, che è precisamente ciò che serve.

Applicata alla creazione documento:

1. il client genera un `clientRequestId` **una volta per intento di salvataggio** — non a ogni
   chiamata HTTP — e lo riusa identico su ogni ritentativo; si rigenera dopo un salvataggio
   riuscito o su un documento davvero nuovo;
2. il server, **all'inizio** della transazione, pianta una riga di claim
   `(tenantId, clientRequestId)`. `count === 1` → prosegue e vi scrive il `documentId`.
   `count === 0` → **legge il `documentId` e lo ritorna come se il salvataggio fosse appena
   riuscito**, senza rifare nulla;
3. il controllo va **per primo**: un ritentativo deve costare una lookup, non un secondo giro
   da `7N + 32`.

⚠️ **La chiave vive nel componente della maschera, non nel service HTTP** — altrimenti ogni
chiamata ne genera una diversa e la guardia non serve a niente.

⚠️ **Serve anche con un salvataggio veloce**: le prestazioni riducono la frequenza della
finestra, non la chiudono.

---

## 12. Le incognite — cosa non è stato possibile determinare

**Richiedono il pannello Railway / Supabase:**

1. ⛔ **Quante repliche gira l'API.** Non è in nessun file. Decide se il difetto multi-istanza
   è **attivo o latente**.
2. **Il valore reale di `connection_limit` in produzione.** Se mancasse, Prisma userebbe
   `num_physical_cpus * 2 + 1` calcolato sulle CPU **che il container vede** — spesso quelle
   dell'host: un numero grande e sbagliato.
3. **Il piano Supabase attuale** — cambia i limiti di connessione e i backup gestiti prima di
   una migration.
4. **Se `pg_cron` sia abilitato.** Zero tracce nel repo; non verificabile senza connettersi.

**Richiedono una query o una chiamata reale:**

5. ⛔ **La latenza reale da Railway.** Fattore ~40 su ogni stima temporale di questo documento.
6. ⛔ **Cosa fa `inventorySetQuantities` su una coppia non attivata**, misurato contro il
   comportamento REST reale. **Blocca l'intervento 9.**
7. ⛔ **Come passare un decimale dentro `::numeric[]`.** Nessun precedente nel repository.
   **Blocca l'intervento 8.**
8. **Il costo effettivo in punti** di un lotto da 250 — si legge da
   `extensions.cost.actualQueryCost`, che il limiter **già raccoglie**.
9. **Su quale versione Shopify serve realmente le chiamate** — si legge dall'header
   `X-Shopify-API-Version`.
10. **Quante varianti collegate hanno `shopifyInventoryItemId` a NULL** — decide se il backfill
    è un caso di bordo o un secondo moltiplicatore al primo passaggio.
11. **Se due tenant condividano oggi lo stesso `shopDomain`.** Lo schema lo permette
    (`shop_domain` non è unico, si risolve con `findFirst`); il contesto lo rende plausibile.
    Query da fare.
12. **Se gli E2E di scrittura girino davvero in CI** — se sono saltati, quel presidio è teorico
    anche oggi.

**Non guardati affatto:** gli altri quattro percorsi che condividono la stessa forma
(`transfer-adjustment-workflow`, i tre `document-stock-*-sync.util`) e `store-sales.service`.
Dai 48 punti di chiamata la struttura **sembra** la stessa — inferenza dalla forma dei file,
non lettura.

---

## 13. Come è stato misurato

Tre censimenti a ventaglio, ciascuno con verifica adversariale delle proprie conclusioni:

|                 | agenti | strumenti                       | oggetto                                                            |
| --------------- | ------ | ------------------------------- | ------------------------------------------------------------------ |
| **1 — outbox**  | 12     | repo                            | esiste infrastruttura persistente riutilizzabile?                  |
| **2 — portata** | 10     | repo + documentazione ufficiale | quanto costa a scala, e cosa si rompe per primo                    |
| **3 — C4**      | 12     | repo + documentazione ufficiale | client Shopify, forme set-based sullo schema vero, worker per shop |

**Le verifiche adversariali hanno rovesciato quattro conclusioni del censimento**, e ognuna
avrebbe portato a una progettazione sbagliata:

| conclusione del censimento                                  | corretta dalla verifica                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| «la coalescenza è doppiamente innocua»                      | ⛔ **rovesciata**: distrugge l'unico meccanismo che oggi ripara le derive                                           |
| «il primo muro è il timeout di transazione»                 | ⛔ **è il client, a 2,5-7× di distanza**                                                                            |
| «il rate limit è per shop, quindi il problema è per-tenant» | ⛔ premessa vera, **conclusione invertita**: è proprio l'assenza di un limite globale a rendere il problema globale |
| «basta aggiungere uno stato di lavoro a `SyncState`»        | ⛔ **refutata su sei fronti**                                                                                       |

> Questa è la ragione per cui il metodo vale la spesa: **quattro decisioni di architettura
> sarebbero state prese su premesse false**, e nessuna delle quattro si sarebbe manifestata
> come un errore — si sarebbero manifestate come comportamento silenziosamente sbagliato in
> produzione.

---

## 14. Cosa è già stato fatto in questo lavoro

| commit     |                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bf35ab2b` | **la spunta costo dell'Arrivo merce comanda quello che dice.** Prima il costo della variante si scriveva **sempre** e la spunta governava un costo sul `Product`: chi la toglieva credeva di registrare un costo documentale e stava riscrivendo il costo effettivo di ogni variante caricata. Effetto collaterale misurato: da 3 a 2 scritture per riga con la spunta accesa, da 3 a 1 con la spunta spenta |
| `c3f8f0f5` | **il salvataggio progressivo è ritirato** come requisito. Il codice era già allineato; erano i documenti a promettere altro. Cade il punto D del piano originale — non è rimandato, è annullato                                                                                                                                                                                                              |

⚠️ **Il Piano Master e la specifica Arrivo merce che portavano il requisito del progressivo
NON sono in questo repository**: sono `.docx` esterni, citati in
`docs/QUADRO-DECISIONI-FATTURE.md:931` con la nota che «l'esistenza dei `.docx` non è
verificata». Il ritiro vale **per i documenti del repo**; quei file vanno allineati a mano.
