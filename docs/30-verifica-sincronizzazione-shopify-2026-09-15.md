# 30 — Verifica della sincronizzazione Shopify (15/09/2026)

Verifica **in sola lettura** sul codice di `develop` (`01852516`) e sui dati del tenant di
prova (transazione `READ ONLY`, nessuna scrittura, nessun comando verso Shopify). Le
segnalazioni di `docs/23` (versione aggiornata, letta senza modificarla) sono state trattate
come indizi e **riverificate una per una sul codice attuale**. Nessuna correzione applicata:
questo documento serve a decidere gli interventi, che NON entrano nel ramo delle impostazioni.

## Stato dell'elenco iniziale (aggiornato il 15/09/2026, pomeriggio) — in caso di contrasto vince questa tabella

Le voci sono quelle di §2, numerate come là. **Risolta** = corretta sul ramo motore con prove
(PR #15, in attesa di merge); **aperta** = difetto confermato, riprodotto o no, senza
correzione; **da decidere** = serve una decisione del proprietario prima di scrivere codice;
**non verificata** = né riprodotta né esclusa.

| #   | Voce                                                                                  | Stato                                                                                                                                                                                                                                               | Dove                           |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | consegne webhook senza deduplica, risposta dopo l'elaborazione                        | **aperta** — riprodotta (`it.fails` ×2)                                                                                                                                                                                                             |
| 2   | `fetchVariantCosts` su `products/update`                                              | **risolta**                                                                                                                                                                                                                                         | §7-bis.1                       |
| 3   | nessun timeout, nessun ritentativo delle letture                                      | **risolta**                                                                                                                                                                                                                                         | §7-ter                         |
| 4   | GraphQL `THROTTLED` non ritentato                                                     | **risolta**                                                                                                                                                                                                                                         | §7-ter                         |
| 5   | creazione prodotto REST senza idempotenza; risposta persa → secondo prodotto          | **risolta** sul ramo unico `feat/shopify-affidabilita-creazione` (non committato): identità VestiFlow, claim, rilettura, adozione; dal pomeriggio del 15/09 la creazione è `productSet` in sola creazione (finestra della variante iniziale chiusa) | §7.2-bis, §7.2-ter, §7.2-ter.3 |
| 6   | prodotto rimasto `syncing` dopo un'interruzione                                       | **aperta** — non riprodotta; proposta 7.3 respinta nella forma                                                                                                                                                                                      | §7.3                           |
| 7   | `GET /shopify/connection` guariva lo stato                                            | **risolta**                                                                                                                                                                                                                                         | §7.4                           |
| 8   | sedi collegate fuori piano                                                            | **da decidere** (`docs/22` B3)                                                                                                                                                                                                                      | §2                             |
| 9   | attivazione: confine ordini fissato dopo l'allineamento                               | **aperta** — confermata nel codice, non riprodotta                                                                                                                                                                                                  | §2, `docs/23` #45              |
| 10  | guardia «un trasferimento per tenant» non atomica                                     | **aperta** — confermata nel codice, non riprodotta                                                                                                                                                                                                  | §2, `docs/23` #37              |
| 11  | eco prodotto senza orologio                                                           | **da decidere** (`docs/24` §9.10)                                                                                                                                                                                                                   | §2                             |
| 12  | ordini esistenti senza `shopify_updated_at`                                           | **aperta**, si chiude da sé al primo evento; nessuna migrazione dati senza via                                                                                                                                                                      | §0                             |
| 13  | evento scartato con sync spenta, riattivazione senza recupero                         | **da decidere** (dentro §7.1)                                                                                                                                                                                                                       | §7.1.1                         |
| 14  | limitatore in memoria di processo                                                     | **aperta** — nota di deploy, non urgente con un'istanza                                                                                                                                                                                             | §2                             |
| 15  | nessuno scheduler di riconciliazione                                                  | **da decidere** (`docs/24` §8.9)                                                                                                                                                                                                                    | §2                             |
| —   | due `orders/create` concorrenti su ordine nuovo → P2002                               | **misurata**, comportamento non cambiato; da decidere se accogliere il P2002                                                                                                                                                                        | §7-ter.1                       |
| —   | scadenza complessiva, corpo interrotto dopo le intestazioni                           | **risolte**                                                                                                                                                                                                                                         | §7-ter.0                       |
| —   | `last_webhook_event_at` nullo sul tenant di prova                                     | **non verificata** (consegne dell'app partner o log di Railway)                                                                                                                                                                                     | §0                             |
| —   | tempo reale del webhook su prodotto a molte varianti                                  | **non verificata** (richiede il negozio)                                                                                                                                                                                                            | §7-bis                         |
| —   | prove reali del contratto Shopify per la creazione (unicità del metafield `id`, ecc.) | **eseguita** il 15/09 su `test-vestiflow.myshopify.com`: G1–G7 verificate (7/7), G6 = atomicità **osservata nel caso provato**                                                                                                                      | §7.2-bis.1                     |
| —   | completamento delle varianti mancanti dopo un recupero parziale                       | **risolta per regola** — abbinamento solo per `vestiflow.variant_id`, creazione delle mancanti con identità, conflitto di combinazione → stop; resta il caso della iniziale «M» senza identità, che si ferma sul conflitto (decide una persona)     | §7.2-ter.1                     |
| —   | backup preso con un claim di creazione aperto non si ripristinava (FK)                | **risolta** — campo differito nel ripristino, riproduzione 2a-bis                                                                                                                                                                                   | §7.2-ter.2                     |

**Proposte superate** (restano nel testo per non essere riproposte): §7.1 prima stesura —
rivendicazione della singola ricevuta e scadenza di 10 minuti come prova di morte del
lavoratore (corrette in §7.1.1); §7.2 prima stesura — creazione a esito incerto sbloccata dal
generico «Azzera» (respinta); §7.3 prima stesura — sola scadenza temporale per i `syncing`
(respinta); **§7.2-bis prima idea — `productSet` con `identifier.customId`** (superata: la
semantica sostitutiva sulle liste cancellerebbe varianti, metafield e collezioni aggiunte nel
frattempo). Il ramo impostazioni (§8) è completo e in PR #14.

## 0 · Fatti misurati sul tenant di prova (sola lettura)

| Fatto                                 | Valore                                                                                                                                                                                            | Da dove                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Connessione                           | `connected`, `autoSyncEnabled = true`, nessun errore, `lastSyncAt = null`                                                                                                                         | `shopify_connections`           |
| Notifiche registrate sul negozio      | 10 topic, indirizzo su Railway, controllate il 14/09 11:51                                                                                                                                        | idem                            |
| **Ultimo evento webhook accolto**     | **`null`** — la colonna esiste dal 08/08 (`701420f3`): nessun evento accolto da allora                                                                                                            | `last_webhook_event_at`         |
| Percorso guidato                      | assente (`shopify_setups` senza riga): connessione nata il 30/06, prima del percorso                                                                                                              | `shopify_setups`                |
| Sedi collegate a una location Shopify | 5, tutte attive; **1 sola nel piano** (`licensedInVf`), 4 fuori piano ma collegate                                                                                                                | `locations`                     |
| Stati per coppia                      | 85 righe: 59 senza base (`last_pushed_available = null`), 11 con disallineamento rilevato (osservazioni del 07/08), 0 tentativi aperti                                                            | `shopify_inventory_sync_states` |
| Ultimo push / ultima osservazione     | 08/09 22:50                                                                                                                                                                                       | idem                            |
| Prodotti                              | 53 `synced`, **2 `error`** per `purchase_price_minor` nullo (02–03/09): causa già tolta dal codice (§9.11, `shopify-product-pull.service.ts:587`), restano in errore finché non si preme «Azzera» | `products`                      |
| Ordini di canale                      | 11, **tutti con `shopify_updated_at = null`** (colonna del 13/09): la guardia sul fuori ordine non ha ancora un valore da confrontare per gli ordini esistenti                                    | `sales_orders`                  |
| Eventi canonici ordine                | 47, chiave di idempotenza unica per tenant                                                                                                                                                        | `online_order_events`           |

⭐ **Abilitazione ≠ operatività — ma il `null` da solo NON dimostra un guasto.** Sul tenant
di prova i quattro flussi risultano «attivi» (flag acceso, 10 notifiche registrate) e in
questo database non risulta alcun evento accolto dal 08/08. Perché sia un guasto servono
due riscontri che da qui non si hanno: (a) che in quel periodo ci siano stati **eventi
attesi** — l'unico candidato è l'eco dell'ultimo push del 08/09 22:50, ammesso che le
notifiche fossero già registrate allora; (b) **dove** sono state consegnate: l'indirizzo
registrato è su Railway, e se l'API di Railway usi questo stesso database non è accertabile
da qui (in `pg_stat_activity` compaiono solo connessioni via pooler, indistinguibili).
Si chiude con la pagina delle consegne dell'app partner o coi log di Railway («Shopify →
notifica … accolta»).

## 1 · Coerenza degli stati (scheda «limitata», flussi «attivo», 338 coppie senza base)

Tre livelli diversi, e il pannello li mescola in un solo aggettivo:

| Livello               | Dove si decide                                                                                                                                        | Che cosa dice                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Abilitazione**      | `autoSyncEnabled`, topic registrati, permessi                                                                                                         | i quattro flussi «attivo»                          |
| **Operatività**       | `last_webhook_event_at`, `last_pushed_at`                                                                                                             | se qualcosa è davvero passato (qui: nessun evento) |
| **Blocchi effettivi** | per coppia (`base_assente`), per prodotto (`sync spenta`, `error`, `syncing`), per sede (`shopifyLocationId`), per connessione (`status ≠ connected`) | perché una singola scrittura non parte             |

- Le 338 coppie «senza base» sono un blocco **per coppia** del solo push ordinario
  (`shopify-inventory-push.service.ts:573`): la coppia si ripresenta quando qualcuno preme
  «Allinea». Non toccano le notifiche in ingresso.
- ⚠️ **Durante i ~2,6 s di `/shopify/setup`** la scheda Sincronizzazione mostra «attivo» su
  tutte le righe e «attivi» sull'etichetta della scheda perché `situazione` è ancora vuota
  (misurato il 14/09; il ramo corrente copre con lo skeleton solo Prima connessione,
  Problemi e la tabella delle sedi — non questa scheda).
- ⛔ **Lo stato `error` della connessione guarisce a ogni lettura**: `GET /shopify/connection`
  chiama `healStaleErrorStatus` che riporta `error → connected` se esiste la credenziale
  (`shopify-connection.service.ts:82-84, 114-127`), senza guardare la causa. Con quattro
  lettori per pagina più il sondaggio ogni 15 s (`shopify-sync-watch.service.ts:12`), uno
  stato `error` scritto da `recordError` (es. «payload senza righe») vive al massimo 15 s. Il
  rifiuto del push su `status ≠ connected` (`:363`) è quindi praticamente inerte, e una GET
  scrive (4 `updateMany` a ogni apertura della pagina quando lo stato è `error`).

## 2 · Elenco: difetti confermati e rischi non provati

Legenda: **C** = confermato sul codice attuale · **R** = rischio non ancora provato ·
**D** = deciso e non implementato (non è un difetto nascosto).

| #   | Esito                                | Che cosa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Conseguenza                                                                                                                                                                                                                                                                                            | Prova disponibile / mancante                                                                                                                                                                                                           | Correzione minima proposta                                                                                                                                                    |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **C**                                | Nessuna deduplica per `X-Shopify-Webhook-Id`, nessuna lettura di `X-Shopify-Triggered-At`; elaborazione **sincrona** prima del `200` (`shopify-webhooks.controller.ts:43-44`). Shopify: timeout 5 s, 8 ritentativi in 4 h, **sottoscrizione cancellata dopo 8 fallimenti consecutivi**, ordine non garantito                                                                                                                                                                                                          | una consegna lenta viene elaborata **e** ritentata; a raffica di consegne lente la sottoscrizione sparisce senza che il pannello lo mostri                                                                                                                                                             | disponibile: ordini idempotenti (`OnlineOrderEvent.dedupeKey`, `prima-connessione-percorso` #17/#20), import prodotti serializzato (`concorrenza-import`); **mancante**: prova di risposta entro 5 s, prova di duplicato con stesso id | (a) rispondere `200` dopo HMAC e persistenza dell'evento, elaborare dopo (inbox di `docs/24` §8.5.3, già decisa); (b) tabella `(shop, webhook_id)` unica per scartare i doppi |
| 2   | **C → ✅ ramo motore**               | `products/update` chiama `enrichProduct({ fetchVariantCosts: true })` prima di scrivere (`shopify-product-pull.service.ts:382`): 2 + C + V chiamate REST a ≥ 500 ms l'una (`SHOPIFY_API_MIN_INTERVAL_MS`, `shopify-config.service.ts:151`) → **≥ 5 s con 8 fra collezioni e varianti**, per un costo che in aggiornamento non si scrive (`:587`)                                                                                                                                                                      | il #1 nel caso più comune: prodotto con più di ~8 varianti → ogni modifica nell'admin è «fallita» per Shopify e ritentata 8 volte                                                                                                                                                                      | **mancante**: misura sul negozio con un prodotto a 8+ varianti (log dei tempi o consegne dell'app partner); il limite inferiore è aritmetica su costanti confermate                                                                    | togliere `fetchVariantCosts` dal percorso di aggiornamento; poi #1(a)                                                                                                         |
| 3   | **C → ✅ ramo motore**               | Nessun `timeout`/`AbortSignal` sulle `fetch` verso Shopify (REST `shopify-admin-http.client.ts:55`, GraphQL `shopify-graphql.client.ts:1863`); nessun ritentativo su 5xx/errore di rete (solo 429)                                                                                                                                                                                                                                                                                                                    | una chiamata appesa tiene fermo il webhook (→ #1) o un push per minuti; un 502 transitorio fallisce al primo colpo                                                                                                                                                                                     | **mancante** (nessuno spec per il client REST; quello GraphQL prova solo 429)                                                                                                                                                          | `AbortSignal.timeout(…)` da configurazione; ritentativi limitati su 5xx/rete solo per le letture e per le scritture con chiave (`inventorySetQuantities`)                     |
| 4   | **C → ✅ ramo motore**               | Throttling GraphQL arriva come `200` + `errors[].extensions.code = THROTTLED`, e diventa `InternalServerErrorException` senza ritentare (`:1894-1900`); il ritardo preventivo sul costo (`computeGraphQlRequestDelayMs`) riduce ma non esclude il caso                                                                                                                                                                                                                                                                | un push/pull sotto carico fallisce invece di attendere `restoreRate`                                                                                                                                                                                                                                   | disponibile: `shopify-graphql.client.spec.ts:784` **dimostra il comportamento attuale** (lancia)                                                                                                                                       | trattare `THROTTLED` come il 429: attesa da `throttleStatus`, tentativi limitati                                                                                              |
| 5   | **C → aperta, proposta in §7.2-bis** | Creazione prodotto remoto via REST `POST /products.json` (deprecato dal 2024-04, ancora documentato per 2026-07) senza chiave di idempotenza; `pushInFlight` solo in memoria; `persistShopifyIds` non prende il lock `shopify_import` e il P2002 sull'identità variante non è gestito (`docs/23` #35 riverificato: tutto ancora così, indice `[tenantId, shopifyProductId]` non unico)                                                                                                                                | risposta persa dopo la creazione → alla ripubblicazione **un secondo prodotto su Shopify**; webhook `products/create` nella finestra di `persistShopifyIds` → doppione locale                                                                                                                          | disponibile: `concorrenza-import` copre due pull; **mancante**: push + webhook nella stessa finestra                                                                                                                                   | far prendere al push lo stesso advisory lock del pull; `@@unique([tenantId, shopifyProductId])`; passare la creazione a `productSet` (Tranche 2, già prevista)                |
| 6   | **C**                                | Prodotto rimasto `syncing` dopo un'interruzione del processo a metà push (`markProductSyncing`, nessun ripristino all'avvio, `clearErrors` tocca solo `error`): ogni webhook successivo per quel prodotto è **scartato** (`shopify-product-pull.service.ts:559`)                                                                                                                                                                                                                                                      | il prodotto smette di ricevere aggiornamenti da Shopify, in silenzio e per sempre                                                                                                                                                                                                                      | **mancante** (prova unitaria semplice: stato `syncing` + webhook → `skipped`, e nessun comando lo sblocca)                                                                                                                             | all'avvio, `syncing → out_of_sync` per il tenant; oppure `syncing` con scadenza                                                                                               |
| 7   | **C → ✅ ramo motore**               | Stato `error` della connessione guarito a ogni `GET` (§1)                                                                                                                                                                                                                                                                                                                                                                                                                                                             | stato inaffidabile; guardia del push inerte; scritture in una GET                                                                                                                                                                                                                                      | **mancante** (`shopify-connection.service.spec.ts` non prova la guarigione su GET)                                                                                                                                                     | guarire solo in `touchSync`/OAuth (già chiamato lì), mai in lettura                                                                                                           |
| 8   | **decisione**                        | Sedi collegate fuori piano: il push guarda solo `shopifyLocationId` (`shopify-inventory-push.service.ts:395-405`), la situazione conta le sedi «con periodo attivo» (`shopify-location-link.service.ts:206`), il percorso guidato **crea apposta** sedi con `licensedInVf: false` (`shopify-setup.service.ts:447`). **Regola prevista**: `docs/22` B3 dice «il perimetro sono le sedi mappate» e il piano non vi compare; `docs/27` non nomina il piano. Non è un difetto contro una regola: è una regola che non c'è | sul tenant di prova 4 sedi su 5 sono collegate e fuori piano: **in uscita** le loro coppie contano nelle 338 e «Allinea» le pubblicherebbe; **per gli ordini esistenti** la sede si risolve dall'evasione Shopify o, in ripiego, dalla prima sede **nel piano** (`docs/01` :724) — due criteri diversi | dati del tenant; nessuna prova possibile finché la regola non è scritta                                                                                                                                                                | decidere in `docs/22` B3 se «mappata» implica «nel piano»; poi una sola funzione «sede sincronizzabile» per situazione, push, riallineamento e ripiego ordini                 |
| 9   | **C**                                | Attivazione: `acquisisciOrdiniPendenti` → allineamento → `getLatestOrderId` → registrazione notifiche (`shopify-setup.service.ts:878-935`, `docs/23` #45 riverificato)                                                                                                                                                                                                                                                                                                                                                | un ordine nato durante l'allineamento non entra mai, nemmeno con «Importa ordini»                                                                                                                                                                                                                      | disponibile: `prima-connessione-percorso` dichiara la finestra come precondizione; **mancante**: ordine creato fra T1 e T4                                                                                                             | fissare `ordersSinceId` **prima** della fotografia (l'ordine doppio è già idempotente per `[tenantId, shopifyOrderId]` + `FOR UPDATE`)                                        |
| 10  | **C**                                | Guardia «un trasferimento per tenant» non atomica: `inFlight.has` → `await update` → `inFlight.set` (`shopify-setup-transfer.service.ts:73-99`, `docs/23` #37 riverificato)                                                                                                                                                                                                                                                                                                                                           | due conferme nello stesso secondo applicano due volte il delta iniziale                                                                                                                                                                                                                                | **mancante** (due `conferma()` concorrenti nel test isolato)                                                                                                                                                                           | rivendicare lo stato con `updateMany({ where: { status: { not: trasferimento } } })` e controllare `count`                                                                    |
| 11  | **D**                                | Eco prodotto senza orologio: il pull scrive sempre l'ultimo payload; `Product` non ha `shopifyUpdatedAt` (`docs/23` #46, `docs/24` §9.10) — per gli ordini c'è                                                                                                                                                                                                                                                                                                                                                        | modifica locale persa da entrambi i lati nella finestra push → webhook di ritorno                                                                                                                                                                                                                      | **mancante**                                                                                                                                                                                                                           | `shopifyUpdatedAt` sul prodotto, stessa forma degli ordini                                                                                                                    |
| 12  | **R**                                | Ordini esistenti senza `shopify_updated_at` (11 su 11 sul tenant di prova): la guardia del fuori ordine scatta solo quando la riga ha già un valore                                                                                                                                                                                                                                                                                                                                                                   | il primo webhook «vecchio» su un ordine importato prima del 13/09 scrive comunque                                                                                                                                                                                                                      | disponibile: lettura sopra                                                                                                                                                                                                             | riempire la colonna alla prima rilettura (già succede al primo webhook «nuovo»); nessuna migrazione dati sul condiviso senza via                                              |
| 13  | **R**                                | Evento webhook con `autoSyncEnabled = false` viene **scartato con `200`** (`shopify-webhook.service.ts:50-72`), non accodato; la riattivazione non lo recupera (ordini: solo tramite `ordersSinceId`, che qui è assente perché il percorso non esiste)                                                                                                                                                                                                                                                                | «Disattiva» → «Attiva» perde tutto ciò che è successo in mezzo, salvo «Importa» manuale                                                                                                                                                                                                                | disponibile: spec «con sincronizzazione spenta NON la aggiorna»                                                                                                                                                                        | dichiararlo nel pannello (già in parte: «gli invii continuano») e, con l'inbox #1(a), conservare l'evento invece di scartarlo                                                 |
| 14  | **R**                                | Limitatore in memoria di processo per negozio (`docs/23` #36): corretto per un'istanza; con due istanze i bucket si sommano                                                                                                                                                                                                                                                                                                                                                                                           | 429 a raffica al primo scale-out                                                                                                                                                                                                                                                                       | n/d                                                                                                                                                                                                                                    | nota di deploy; non urgente finché l'istanza è una                                                                                                                            |
| 15  | **R**                                | Nessuno scheduler: pull, recupero ordini e «Allinea» partono solo da un clic (`docs/23` #7)                                                                                                                                                                                                                                                                                                                                                                                                                           | una notifica persa (Shopify: «delivery isn't always guaranteed») si scopre a mano                                                                                                                                                                                                                      | n/d                                                                                                                                                                                                                                    | job di riconciliazione periodico (`docs/24` §8.9), da decidere                                                                                                                |

**Sano, verificato:** idempotenza degli ordini (`dedupeKey` unico + `FOR UPDATE` +
`shopifyUpdatedAt`); scritture di quantità con `inventorySetQuantities` + `changeFromQuantity`

- `@idempotent` + `referenceDocumentUri` e **tentativo aperto persistito** (`pending_key`) —
  prove P5/P7 di `protezione-scritture-inventario`; eco inventario con finestra 5 min e
  ripubblicazione (4 casi in spec); paginazione REST `since_id` + `limit=250` (supportata,
  non deprecata); 429 REST/GraphQL con `Retry-After` e backoff limitato a 30 s, 5 tentativi
  (`SHOPIFY_API_MAX_RETRIES`); HMAC con `timingSafeEqual`; un negozio per azienda (§8.5.1);
  versione API `2026-07` = «Latest stable» fino al 16/07/2027.

## 3 · Le quattro richieste a `/shopify/connection`

Quattro consumatori indipendenti, ognuno con la propria `getConnection()` all'apertura
della pagina: la shell (chip in topbar, `shell-layout.component.ts:229`), il servizio delle
sedi operative (`operational-locations.service.ts:53`), il sondaggio `timer(0, 15 s)` di
`shopify-sync-watch.service.ts:37` e lo store del pannello
(`shopify-connection.store.ts:53`). ⚠️ **Correzione (15/09, sera)**: `GET /shopify/setup`
NON legge solo il database — `locationsConScelte` chiama `GET /locations.json` sul negozio
(una lettura), ed è la ragione dei ~2,6 s. `GET /shopify/connection` invece legge solo il database
(`getForTenant`): **nessuna chiamata a Shopify**. L'unico effetto è la guarigione dello
stato (#7). Correzione minima: uno store solo, condiviso, con `shareReplay`; non urgente.

## 4 · Limiti ufficiali letti (shopify.dev, 15/09/2026)

REST: bucket 40, 2/s (Plus ×10), `X-Shopify-Shop-Api-Call-Limit`, 429 + `Retry-After`.
GraphQL: costo per punti, ripristino 100 punti/s (standard), `extensions.cost.throttleStatus`,
throttling = `200` con `THROTTLED`. Webhook: 5 s per l'intera richiesta, 8 ritentativi in 4 h,
cancellazione dopo 8 fallimenti consecutivi, `X-Shopify-Webhook-Id` per deduplicare, nessun
ordine garantito. REST prodotti: legacy dal 01/10/2024, deprecato dal 2024-04, ancora
documentato per 2026-07; max 100 varianti. `inventorySetQuantities`: `@idempotent` obbligatorio
dal 2026-04 (già usato).

## 5 · Le verifiche «in sola lettura» e la GET che scrive

Le prove reali del 14/09 (giro delle cinque schede alle 23:38, `setup-reale*`,
`tempi-setup`, `verifica-lettura`) hanno chiamato `GET /shopify/connection` (quattro volte
per apertura di pagina) e `GET /shopify/setup` (che rilegge la connessione a sua volta).
Entrambe passano da `healStaleErrorStatus`, che scrive **solo se** `status = error`. Che
non abbia scritto niente è accertabile, non dedotto: oggi `lastErrorAt` e `lastErrorCode`
sono `null`; `recordError` li scrive sempre e li azzerano soltanto `touchSync` e
`clearErrors`, che i nostri script non hanno invocato (le uniche richieste non-GET
registrate sono i `POST /auth/login`, che scrivono i dati di accesso). Quindi la
connessione non era in `error` durante le nostre letture e l'`updateMany` ha toccato zero
righe. `webhooksCheckedAt = 14/09 11:51` viene da un `POST /shopify/webhooks/check`
(«Verifica ora») **precedente** ai nostri script e non nostro.

⚠️ Resta il fatto di principio: una GET che può scrivere non è «sola lettura» per
costruzione, e le dichiarazioni future devono dirlo (#7).

## 6 · Correzioni alle conclusioni della prima stesura

- **«Rischio zero» non esiste.** Il ripristino dei prodotti `syncing` all'avvio, scritto
  senza condizioni, azzererebbe anche una lavorazione viva in un'altra istanza. Va fatto
  con una scadenza (lease), non con un reset.
- **«200 subito» significa dopo il salvataggio durevole della notifica**, mai prima: la
  notifica va scritta e committata, poi confermata, poi elaborata.
- **Ritentare dopo un timeout può duplicare**: prima si classifica l'esito (certo /
  incerto), e l'incerto si ritenta solo dove la scrittura porta una chiave (quantità:
  `@idempotent` + `pending_key`, già così) o è per natura un «imposta» (aggiornamento
  GraphQL del prodotto collegato). La **creazione REST** non ha chiave: con esito incerto
  non si ritenta alla cieca (§7.2).
- **`last_webhook_event_at` nullo non dimostra un guasto** (§0).
- **Confermato nel codice ≠ conseguenza riprodotta**: in §2 la colonna «Esito» parla del
  codice; la colonna «Prova» dice se la conseguenza è stata riprodotta. Ad oggi **nessuna**
  delle conseguenze dei punti 1–11 è stata riprodotta in un ambiente: sono lette nel
  codice. Le prove di accettazione di §7 servono a riprodurle prima e a tenerle ferme dopo.

## 7 · Primo blocco proposto — affidabilità del motore

Ordinato per **rischio di perdita o duplicazione**, non per righe da cambiare. Tutto
riproducibile nell'ambiente isolato (PostgreSQL effimero, `shopify-simulato.util.ts` con
`rispostePerse`, `concorrenza.util.ts` per le richieste sovrapposte). Fuori dal ramo delle
impostazioni. Niente `productSet`, nessuna coda esterna, nessun job notturno: non sono
approvati e per questo blocco non servono.

### 7.1 Ricezione durevole delle notifiche (#1, #2, #13 in parte)

**Serve**: una tabella `shopify_webhook_receipts` — `(shop_domain, webhook_id)` **unica**,
`topic`, `triggered_at`, `payload`, `received_at`, `processed_at`, `esito`, `tentativi`.
**Si riusa**: la verifica HMAC com'è; `resolveTenantByShopDomain`; `handleWebhook`
intatto come elaboratore; il pattern «chiave unica per tenant» di `OnlineOrderEvent`.

Flusso: HMAC → `INSERT … ON CONFLICT DO NOTHING` (commit) → `200` → elaborazione fuori
dalla richiesta (`setImmediate`, stesso processo), che marca `processed_at`/`esito`.
All'avvio dell'API si riprendono le ricevute con `processed_at = null`. Sync spenta: la
ricevuta si **conserva** con esito `scartata_sync_spenta` (oggi è buttata). Ordine di
elaborazione: invariato (per gli ordini decide già `updated_at`; i prodotti restano
«ultimo elaborato vince» — #11 è fuori da questo blocco, e va detto).

Nello stesso passo: `fetchVariantCosts` **fuori** dal percorso di aggiornamento (#2): il
valore in aggiornamento non si scrive (`:587`), le V chiamate sono a vuoto.

**Prove di accettazione** (integrazione, isolato):

- A1 · la risposta al webhook arriva **dopo** il commit della ricevuta e **prima** che
  l'elaborazione cominci (elaboratore tenuto fermo su un `await`, `200` già ricevuto).
- A2 · stesso `X-Shopify-Webhook-Id` due volte, anche **in concorrenza**: una ricevuta, una
  elaborazione, effetti uguali a una consegna sola (ordini: nessun evento canonico doppio;
  quantità: nessuna seconda ripubblicazione).
- A3 · arresto simulato fra `200` ed elaborazione: al riavvio la ricevuta viene elaborata,
  una volta.
- A4 · `products/update` con 8 varianti: **zero** chiamate `inventory_items` al simulatore.
- A5 · sync spenta: la ricevuta esiste con l'esito, nessun effetto; riattivata la sync,
  non si rielabora da sola (ripresa esplicita, fuori blocco).

#### 7.1.1 Precisazioni chieste il 15/09/2026 (prima dell'implementazione)

**Elaborazione e ritentativi senza riavvio.** Un lavoratore nel processo dell'API, due
ingressi: (a) subito dopo il `200` (`setImmediate`) per la ricevuta appena scritta; (b) una
scansione periodica (es. ogni 30 s) delle ricevute con `processed_at IS NULL` e
`next_attempt_at <= now()`. Un'elaborazione fallita scrive `tentativi + 1`, l'errore e
`next_attempt_at` con attesa crescente. ⛔ **Il numero di tentativi e l'attesa sono una
regola nuova di recupero, e NON è introdotta qui**: la proposta è «5 tentativi in ~1 ora,
poi `fallita` e visibile in Problemi ed esiti», da decidere. Fino alla decisione, il primo
blocco prevede **un solo tentativo automatico** (quello dopo il `200`) e la ripresa
all'avvio: come oggi, dove il ritentativo lo faceva Shopify.

**Nessuna elaborazione concorrente, per ricevuta E per negozio.** ⛔ Corretto il 15/09
(sera): rivendicare atomicamente la SINGOLA ricevuta non basta — due processi possono
prendere due ricevute diverse dello stesso negozio e lavorarle insieme, cioè fuori
ordine e in contesa sul limitatore. La rivendicazione va fatta **sul negozio**: una riga
per negozio (`shopify_webhook_lanes`: `shop_domain`, `claimed_by`, `claimed_at`,
`claim_version`), e chi la ottiene con `UPDATE … WHERE shop_domain = $1 AND (claimed_at IS
NULL OR claimed_at < now() - <scadenza>) RETURNING claim_version` elabora **le ricevute di
quel negozio una alla volta**, in ordine di `received_at`, finché la coda è vuota o la
rivendicazione scade; poi la rilascia. La singola ricevuta si marca comunque
(`processed_at`), ma non è lei il lucchetto.

**Arresto DURANTE l'elaborazione — e il lavoratore che NON è morto.** ⛔ Corretto il
15/09 (sera): una scadenza non dimostra che il lavoratore precedente sia morto; può essere
solo lento (una chiamata a Shopify appesa, #3), e dopo la nuova assegnazione continuerebbe
ad applicare effetti. Serve un **numero di rivendicazione** (`claim_version`, incrementato a
ogni assegnazione della corsia del negozio) portato dal lavoratore in ogni scrittura:
(1) ogni transazione di effetto sul database rilegge la corsia `FOR UPDATE` e **abortisce
se `claim_version` non è più il suo** — un lavoratore superato non scrive più niente in
locale, per costruzione; (2) prima di ogni chiamata **verso Shopify** ricontrolla la
versione: riduce la finestra ma **non la chiude** — una scrittura remota già partita non
si può revocare. Per le quantità la chiave di idempotenza e `changeFromQuantity` la
rendono innocua (stessa chiave = stesso effetto; confronto stantio = rifiuto); per la
creazione REST del prodotto no, ed è il #5. La scadenza resta solo per dire _quando_ si
può riassegnare, non per dichiarare morto qualcuno.
⚠️ **Questo richiede che l'elaborazione sia ripetibile a metà**, ed è così per: ordini (`OnlineOrderEvent.dedupeKey` unico + `FOR UPDATE` + `shopifyUpdatedAt`),
quantità (riconciliazione senza effetti locali; la ripubblicazione porta la chiave),
clienti (`findUnique` + aggiornamento), prodotti (lock consultivo + `nullaDaScrivere`).
⚠️ **Immagini** (`sincronizzaImmagine`, letto il 15/09): si archiviano DOPO il commit
del prodotto, mai prima della riga; un'elaborazione ripetuta le riscarica. È l'unico
effetto fuori dal database, e ripeterlo costa una lettura, non un doppione.

**Ricevute con sincronizzazione disattivata, e riattivazione.** Oggi l'evento viene
scartato con `200` (perso). Con la ricevuta: si conserva con `esito = scartata_sync_spenta`,
`processed_at` valorizzato (non è in coda). Alla riattivazione **non si rielabora niente da
solo** — sarebbe una regola nuova di recupero. Da decidere: (a) resta così, e la ripresa
è «Importa ordini / Importa catalogo» come oggi; (b) un comando esplicito «Riprendi gli
eventi sospesi», che rimette in coda le ricevute `scartata_sync_spenta` più recenti
dell'ultimo evento applicato, nell'ordine di `triggered_at`.

### 7.2 Scritture con esito incerto e timeout (#3, #5 senza `productSet`) — ⛔ NON approvata nella forma proposta (15/09)

⛔ Il proprietario: una creazione con esito incerto **non** deve diventare ripubblicabile
col generico «Azzera» senza una verifica dell'esito. Timeout e throttling restano nel
piano distinguendo letture, scritture ripetibili e scritture a esito incerto. Da
riformulare; il testo sotto è la proposta respinta, conservata per non riproporla.

**Serve**: `AbortSignal.timeout` da configurazione su REST e GraphQL; classificazione
dell'esito (`certo` / `incerto`) nel client; per la **creazione REST del prodotto**, un
«tentativo aperto» sul prodotto (`shopifyPushPendingAt`, stessa idea di `pending_key`
delle quantità): con esito incerto il prodotto va in `error` con codice
`creazione_esito_incerto` e un testo che dice di controllare il negozio, e **nessuna
ripubblicazione automatica** finché l'operatore non conferma («Azzera» già riporta
`error → out_of_sync`). **Si riusa**: `waitForRetry` del limitatore per i ritentativi
limitati **solo** su letture e su `inventorySetQuantities` (chiave già presente); il lock
consultivo `serializzaImport` preso anche da `persistShopifyIds` (stessa chiave
`shopify_import:<tenant>` + id remoto) per chiudere la finestra col webhook
`products/create`; `@@unique([tenantId, shopifyProductId])` al posto dell'indice.

**Prove**:

- B1 · risposta persa su `createProduct` (`rispostePerse`): il prodotto è in `error` col
  codice dedicato, **una** creazione contata dal simulatore, nessuna seconda al ritentativo.
- B2 · timeout su una lettura: si ritenta entro il limite, poi errore leggibile; timeout
  su una scrittura senza chiave: **zero** ritentativi.
- B3 · push + webhook `products/create` sovrapposti (`concorrenza.util`): un solo prodotto
  locale, identità unica, nessun P2002 non gestito.
- B4 · P5/P7 di `protezione-scritture-inventario` restano verdi (regressione).

### 7.2-bis Creazione prodotto e varianti con esito incerto — ✅ IMPLEMENTATA sul ramo unico (15/09/2026), vedi §7.2-ter

Direzione approvata dal proprietario: **identità stabile del prodotto VestiFlow** sul remoto,
con un metafield tecnico; niente identità da SKU, titolo o handle. Le precisazioni sotto sono
le sue quattro richieste, incorporate.

**Identità.** Metafield `vestiflow.product_id` (tipo `id`, valore = uuid del `Product`) e
`vestiflow.variant_id` (idem, per `ProductVariant`), messi **nel payload di creazione**. I
metafield di tipo `id` hanno valori unici per definizione (shopify.dev, «custom IDs»): una
seconda creazione con lo stesso valore viene **rifiutata**, non sovrascrive. La definizione si
legge prima dell'uso (`metafieldDefinitions` per PRODUCT / PRODUCTVARIANT, namespace e chiave):
assente → si crea; presente ma non di tipo `id` per quell'owner → **errore esplicito, nessuna
creazione** (nessun «già esiste» ignorato alla cieca).

**Creazione.** `productCreate` (con opzioni e il metafield) + `productVariantsBulkCreate` (con
i metafield di variante, `strategy: REMOVE_STANDALONE_VARIANT`). ⛔ **Mai `productSet`**: la
sua semantica sostitutiva sulle liste è il rischio di perdita del punto 2. Dopo la creazione
ogni scrittura passa dal percorso di aggiornamento per intenzione, come oggi.

**Claim locale con numero di tentativo (punti 1 e 4).** Su `Product`: `shopify_create_claim_id`
(uuid del tentativo), `shopify_create_claim_version` (intero monotono, +1 a ogni
rivendicazione), `shopify_create_claim_shop_id` (FK a `ShopifyShop`: il negozio per GID, non
il dominio), `shopify_create_claimed_at`. Rivendicazione atomica: `UPDATE … WHERE
shopify_product_id IS NULL AND (claim assente OR claimed_at < now() − lease)`, `count = 1`;
chi non la ottiene **non chiama Shopify** («creazione in corso»). ⛔ **La lease permette di
recuperare il lavoro, non dimostra che l'operazione precedente non esista più**: il nostro
timeout non dice che Shopify abbia smesso di elaborare. Perciò (a) il nuovo proprietario
**rilegge sempre l'identità** (`productByIdentifier(customId)`) prima di creare; (b) ogni
scrittura di un tentativo — `persistShopifyIds`, errore, rilascio — è condizionata `WHERE
shopify_create_claim_version = <mia>`: 0 righe = superato, non scrive. Il vecchio proprietario
non può salvare né liberare il claim di un tentativo successivo. ⛔ **E non può nemmeno
continuare con altre chiamate remote**: prima di OGNI chiamata verso Shopify il tentativo
rilegge la propria versione dal database e, se superato, si ferma con un errore — la
protezione delle sole scritture locali non basta, perché una `bulkCreate` o un metafield
inviati da un proprietario superato scrivono sul negozio. Una chiamata già in volo non si
può revocare: è la finestra residua, che l'unicità del metafield rende innocua per la
creazione (rifiuto) e che la lettura degli id copre per il resto. Se la vecchia
`productCreate` arriva a compimento dopo la nuova, Shopify la rifiuta per unicità; se prima,
il nuovo la trova alla rilettura e la adotta. In nessun ordine nascono due prodotti.

**Qualunque esito non-successo → rilettura dell'identità.** Timeout/esito incerto, errore di
unicità, `userError`: si interroga `productByIdentifier`. Trovato → si **adottano gli id**
(prodotto, varianti per `vestiflow.variant_id`, inventory item) sotto il lock consultivo
`shopify_import:<tenant>` + id remoto; non trovato con errore definito → errore al prodotto,
nessun secondo tentativo cieco. ⛔ **Una rilettura che fallisce** (trasporto, permessi) **non
è «assente»**: errore, il claim resta, nessuna creazione parte.

**Risposta persa su `productVariantsBulkCreate` (punto 2 bis).** Le varianti remote si
rileggono per gid col metafield `vestiflow.variant_id`: corrispondenza esatta per uuid.
Remote senza il nostro metafield → non toccate; locali senza corrispondenza → create con una
nuova `bulkCreate` (un doppione lo impedisce l'unicità). Interruzione **fra** `productCreate` e
`bulkCreate`: il remoto ha la sola variante iniziale standalone. ⛔ **«Standalone» non vuol dire
«intatta»**: potrebbe essere stata modificata sul negozio nel frattempo. Si rimuove
(`REMOVE_STANDALONE_VARIANT`) o si adotta come _la_ variante del prodotto a variante unica
**solo se è ancora quella nata da `productCreate`**: senza SKU, senza barcode, prezzo a zero,
titolo iniziale (con le opzioni è il primo valore di ciascuna: «M», non «Default Title» —
misurato in G2), senza il nostro metafield. Se porta anche una sola modifica, non si elimina
e non si sovrascrive: si **conserva**, e il prodotto resta `out_of_sync` con la causa scritta
(«variante remota senza identità VestiFlow conservata», «completamento in sospeso»), e decide
una persona — nessuno stato né comando nuovo, è il meccanismo di errore che esiste.
⚠️ **Nel recupero `REMOVE_STANDALONE_VARIANT` non si usa mai**: solo nello stesso tentativo,
subito dopo `productCreate`, quando la risposta dice che la iniziale è intatta.

**Ritrovare = recuperare gli ID, non riscrivere (punto 3).** Sono **due operazioni diverse**,
in due momenti diversi:

| Operazione                                | Quando                                                                                                                                                                       | Scritture remote                                                                                                    | Dopo un'interruzione                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **recupero degli id**                     | nel push che incontra un esito incerto, o all'inizio di ogni push con claim aperto/scaduto                                                                                   | **nessuna**: solo letture (`productByIdentifier`, varianti per metafield) e scritture locali con la `claim_version` | si ripete da capo: è senza stato                                          |
| **completamento delle varianti mancanti** | nel percorso di **aggiornamento** del push successivo (esplicito o dal salvataggio), che già crea le varianti assenti «senza toccare le presenti», ora con il loro metafield | `bulkCreate` delle sole mancanti                                                                                    | stesso recupero: rilettura per metafield, l'unicità impedisce il doppione |

Il recupero chiude il claim e **termina il push** («identità recuperata, nessun dato inviato»,
prodotto «da verificare»): nessun campo locale viene spinto in quel giro, le modifiche fatte
sul negozio nel frattempo restano intatte, e il completamento avviene solo con le regole per
campo di `docs/24` §9.2 del push successivo, come per ogni prodotto collegato.

**Webhook anticipato o in ritardo (punto 4).** `products/create` adotta solo se **tutte**
valgono: il dominio del webhook risolve al tenant e al `shopId` della sua connessione; il
metafield `vestiflow.product_id` è **riletto da Shopify** per gid (il payload non lo porta);
il uuid è un `Product` di quel tenant con `shopifyProductId` nullo; il claim è **aperto verso
quello stesso `shopId`**; la scrittura porta la `claim_version` aperta; stesso lock di
`persistShopifyIds` (chi arriva secondo trova `[shop, gid]` già scritto e prosegue come
aggiornamento). **Senza claim aperto il webhook non adotta**: lascia il remoto scollegato e
la traccia in Problemi ed esiti — sarà il push successivo, che rilegge l'identità, ad
adottarlo. Claim chiuso perché già collegato → aggiornamento normale per gid.

**Cambiamenti.** Dati: le quattro colonne del claim su `Product`; nessuna interfaccia nuova;
due definizioni di metafield per negozio; la creazione REST resta solo nel simulatore.

**Prove (ambiente isolato).** Risposta persa su `productCreate` → rilettura → 1 remoto, id
adottati (la `it.fails` diventa ordinaria); due push che partono col remoto assente → 1
`productCreate`, l'altro «in corso» o adotta; claim stanziale (processo morto, lease scaduta)
→ prima la rilettura; riavvio (`pushInFlight` vuoto, claim persistito); risposta persa su
`bulkCreate` e interruzione fra le due chiamate; variante unica; modifiche sul remoto dopo la
risposta persa → **remoto identico** dopo il recupero; definizione assente / giusta /
sbagliata; rilettura fallita → nessuna creazione; webhook con claim aperto (adotta), senza
claim (non adotta, segnala), negozio o tenant diverso (rifiuta), webhook e `persistShopifyIds`
concorrenti (un locale, un'identità). ⛔ **Il contratto reale** — definizione `id` unica,
seconda `productCreate` rifiutata **senza** lasciare un secondo prodotto, idem `bulkCreate`,
`productByIdentifier`, `REMOVE_STANDALONE_VARIANT` sul recupero, atomicità di `bulkCreate` —
lo dà solo il negozio (`test:shopify:contract`), da concordare a parte.

#### 7.2-bis.1 La prova di contratto minima — ✅ ESEGUITA il 15/09/2026 su `test-vestiflow.myshopify.com` (via del proprietario)

**Negozio**: lo shop di sviluppo già usato dal gate (`VESTIFLOW_SHOPIFY_CONTRACT_SHOP`,
`SHOPIFY_CONTRACT_TEST=1`), con le sicurezze esistenti: `plan.partnerDevelopment === true` o
si ferma prima di scrivere; prodotti in `DRAFT` col tag `vestiflow-contract-test`; nessuna
cancellazione remota (il client non ha `productDelete`). ⛔ **Mai il negozio del tenant di
prova né il database condiviso.**

**Dati temporanei che restano sul negozio** (dichiarati, da approvare): due definizioni di
metafield `vestiflow.product_id` (PRODUCT) e `vestiflow.variant_id` (PRODUCTVARIANT), tipo
`id`, permanenti; per ogni esecuzione i prodotti creati (identità `contratto-<data-ora>`),
lasciati in `DRAFT` e portati a `ARCHIVED` in coda — non cancellati; il conteggio dei residui
è nell'esito.

**Operazioni previste, nell'ordine** (ognuna una garanzia da verificare):

| #   | Operazione                                                                                                                         | Garanzia che verifica                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| G1  | `metafieldDefinitions` → crea le due definizioni se assenti; rilettura                                                             | la definizione è quella prevista (owner, tipo `id`, valori unici); un'esecuzione ripetuta la trova e non la duplica        |
| G2  | `productCreate` ×2 **sequenziali** con lo stesso `vestiflow.product_id`                                                            | la seconda è **rifiutata** e non lascia un secondo prodotto (`products(query: metafields.vestiflow.product_id:…)` conta 1) |
| G3  | `productCreate` ×2 **concorrenti** (stesso valore, prodotto assente)                                                               | esattamente un prodotto; l'esito della seconda (rifiuto o errore) è registrato — non si assume che «entrambe riescano»     |
| G4  | `productVariantsBulkCreate` ×2 con lo stesso `vestiflow.variant_id` (sequenziali e concorrenti)                                    | nessuna seconda variante con lo stesso valore                                                                              |
| G5  | `productCreate` + `bulkCreate` **senza usare la risposta**, poi `productByIdentifier(customId)` e rilettura varianti per metafield | tutti gli id si recuperano dall'identità sola                                                                              |
| G6  | `bulkCreate` con una variante valida e una **rifiutata** (combinazione di opzioni già esistente)                                   | se la valida viene creata o no: **atomicità misurata, non assunta**                                                        |
| G7  | `REMOVE_STANDALONE_VARIANT` su un prodotto con la sola variante iniziale intatta; poi su una modificata a mano (prezzo)            | che cosa rimuove Shopify nei due casi                                                                                      |
| G8  | `productUpdate` di stato → `ARCHIVED` sui prodotti di questa esecuzione                                                            | pulizia dichiarata                                                                                                         |

**Esito atteso**: per ogni G, «verificata» / «smentita» con la risposta di Shopify citata; il
simulatore verrà poi allineato a quanto **verificato**, non il contrario.

**Esito reale (`shopify-identita-creazione.contract-spec.ts`, due esecuzioni)** — la credenziale
è stata letta dal condiviso in sola lettura e mai mostrata; nessuna scrittura sul condiviso.

| G   | Esito            | Come lo sappiamo                                                                                                                                                                                                                                                      |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | ✅ verificata    | **catturato** nel log della prima esecuzione: create le definizioni `gid://shopify/MetafieldDefinition/257539768615` (PRODUCT `product_id`) e `…/257539801383` (PRODUCTVARIANT `variant_id`), tipo `id`; la seconda esecuzione le ha ritrovate senza crearne altre    |
| G2  | ✅ verificata    | esito **catturato** (verde); dettaglio **ricostruito** dal negozio: il prodotto G2 ha le varianti M (iniziale), L (sequenziale), 3XL (concorrente vincente) — un solo prodotto con quell'identità                                                                     |
| G3  | ✅ verificata    | esito catturato; ricostruito: un solo prodotto `G3-a`; la seconda `productCreate` concorrente è stata rifiutata (gli `userErrors` di `productCreate` non portano `code`, solo `field`/`message` — il testo del rifiuto **non è stato catturato**)                     |
| G4  | ✅ verificata    | esito catturato; con identità di variante **nuova** nel caso concorrente (precisazione del proprietario): nessuna seconda variante con lo stesso `variant_id`                                                                                                         |
| G5  | ✅ verificata    | esito catturato; ricostruito: prodotto G5 con due varianti, entrambe con identità, ritrovate per `productByIdentifier` e per metafield senza usare la risposta della creazione                                                                                        |
| G6  | ✅ **osservata** | ⚠️ **atomicità osservata nel caso provato, non garanzia generale**: con una riga valida (L) e una rifiutata, il prodotto G6 ha la sola iniziale M — la valida **non** è stata creata. Un altro tipo di rifiuto potrebbe comportarsi diversamente: non è stato provato |
| G7  | ✅ verificata    | ricostruito: la iniziale è stata rimossa **sia** intatta **sia** modificata (prezzo 12,50) → «standalone» ≠ «intatta»; la guardia sta nel codice, non in Shopify                                                                                                      |
| G8  | ✅ eseguita      | 6 prodotti dell'esecuzione portati ad `ARCHIVED` (tag `vestiflow-contract-test` + id esecuzione `vf-esecuzione-2026-09-15T08-43-26-270Z`); nessuna cancellazione                                                                                                      |

⚠️ **Catturato vs ricostruito.** La seconda esecuzione (7/7 verdi) ha lasciato solo l'esito
pass/fail: gli oggetti di risposta non sono finiti nel log (`console.log` dentro la prova non
arriva al report). I dettagli per prodotto sono stati **riletti dal negozio** dopo, in sola
lettura, per id. G1 è l'unica con la risposta catturata (prima esecuzione). **Residui sul
negozio**: 2 definizioni permanenti + 6 prodotti archiviati; nessun prodotto attivo o bozza
creato dalla prova. Il negozio del collega non è stato toccato.

### 7.2-ter Il blocco «creazione con esito incerto» — sul ramo unico `feat/shopify-affidabilita-creazione` (15/09/2026, da `develop` `bd22d421`, non committato)

**Stato, in QUATTRO parti separate** (proprietario, 15/09 pomeriggio) — in caso di
contrasto con il resto della sezione vince questa tabella:

| Parte                                                              | Stato                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · Recupero e completamento — corretti**                        | ✅ verificati nei casi riportati (§7.2-ter.1): doppione chiuso (risposta persa, interruzione, riavvio, concorrenza, webhook anticipato), recupero dei soli id, completamento per sola identità, conflitto di combinazione come esito **protettivo dichiarato** — non una sincronizzazione completata — con il motivo che arriva all'interfaccia e nomina la variante                                                 |
| **B · Finestra della prima creazione — ✅ CHIUSA per costruzione** | `productSet` in SOLA creazione (contratto G9–G11, risposte catturate): prodotto, opzioni, varianti e identità in una mutation; nessuna variante iniziale, `REMOVE_STANDALONE_VARIANT` e `productCreate` fuori dal push; niente `id`/`identifier` per tipo e per guardia. ⚠️ **Limite di scala non provato**: sul negozio al massimo 3 varianti; nessun limite né troncamento nel codice, un rifiuto resta un rifiuto |
| **C · Recupero automatico degli stati `syncing` — suo blocco**     | ⏸ §7.3 (#6): dopo un arresto il claim resta finché un push non lo rilegge (lease 5 min); nessun automatismo. Da trattare a parte, ora con il claim come dato verificabile                                                                                                                                                                                                                                            |
| **D · Coda webhook — da implementare**                             | ⏸ §7.1 (#1, #2, #13): ricezione durevole, `200` dopo il salvataggio, deduplica per `X-Shopify-Webhook-Id`; le due `it.fails` restano la misura                                                                                                                                                                                                                                                                       |

**Perimetro rispettato**: niente doppioni di prodotti e varianti dopo risposta persa, riavvio,
richieste concorrenti e webhook anticipato, con le identità VestiFlow; meccanismi esistenti
riusati (storico `ShopifyLinkHistoryService`, lock `shopify_import:<tenant>`, stato
`out_of_sync` + `shopifyLastError`, registro `import_prodotto_rifiutato`); nessuna altra
correzione di sincronizzazione; nessuna scrittura su Shopify o sul condiviso; migration
provata solo sul database di test.

**Che cosa è cambiato (API).**

| Dove                                       | Cosa                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma/migrations/20260915120000_claim_…` | quattro colonne su `products`: `shopify_create_claim_id`, `_version` (intero, +1 a ogni rivendicazione), `_shop_id` (FK `shopify_shops`, `SET NULL`), `shopify_create_claimed_at`; indice parziale sui claim aperti. Applicata al solo DB di test (`prisma:deploy:test`)                                                                                                             |
| `shopify-identita-catalogo.util.ts`        | le identità (`vestiflow.product_id` / `variant_id`, tipo `id`), il payload di `productCreate` e di `bulkCreate` con i metafield, l'abbinamento **per identità**, `varianteInizialeIntatta(v, options)`, `ShopifyClaimSuperatoException`                                                                                                                                              |
| `shopify-identita-adozione.util.ts`        | **una** definizione dell'adozione degli id (lock, `updateMany … WHERE claim_version`, varianti per identità, storico della pubblicazione), usata dal push e dal webhook                                                                                                                                                                                                              |
| `shopify-graphql.client.ts`                | `leggiDefinizioneMetafield`, `creaDefinizioneMetafield`, `createProductWithIdentity`, `productByIdentity`, `listProductVariantsWithIdentity`, `productIdentity`; `bulkCreateVariants(…, strategy?)`; `metafields` anche nell'input di aggiornamento                                                                                                                                  |
| `shopify-product-push.service.ts`          | il ramo di creazione: claim (`rivendicaCreazione`), definizioni verificate, **rilettura per identità prima di creare**, `productCreate` + `bulkCreate`/aggiornamento della iniziale, `assicuraProprietario` **prima di ogni chiamata remota**, recupero su qualunque non-successo, chiusura del claim a tentativo finito. ⛔ Rimossi `persistShopifyIds` (per SKU) e il payload REST |
| `shopify-product-pull.service.ts`          | `riconosciCreazioneVestiflow` per ogni remoto **non ancora collegato** (webhook e pull del catalogo): rilettura dell'identità per gid, adozione con claim aperto verso il negozio della connessione, **rifiuto registrato** senza claim (nessun doppione locale). Lock condiviso con l'adozione                                                                                      |
| `shopify-product-enrichment.service.ts`    | `identitaVestiflowDelProdotto` e `variantiConIdentita`, senza `catch`: una lettura fallita non è «assente»                                                                                                                                                                                                                                                                           |
| `products.service.ts`                      | le quattro colonne nel `select` della lista (viaggiano nelle risposte come ogni scalare di `Product`)                                                                                                                                                                                                                                                                                |
| `shopify-simulato.util.ts`                 | il contratto verificato: definizioni permanenti, `productCreate` con identità e rifiuto del doppione, `productByIdentifier`, `bulkCreate` tutto-o-niente con identità uniche e `REMOVE_STANDALONE_VARIANT` che rimuove anche la modificata, varianti con identità, risposte perse, **varco** (`bloccaProssima`) e guasto differito                                                   |

**Le decisioni prese implementando** (non nella proposta, da confermare):

- **Un tentativo FINITO chiude il proprio claim**, anche se finito male: il claim che resta
  aperto è solo quello di un processo morto (per cui c'è la lease di 5 minuti). Senza,
  ogni fallimento avrebbe bloccato la ripubblicazione per cinque minuti con un falso
  «in corso». Il proprietario superato non chiude niente e non scrive niente:
  `executePushWork` traduce `ShopifyClaimSuperatoException` in «avviato» senza toccare lo stato.
- **Il recupero termina il push con `out_of_sync` + motivo** («Identità Shopify
  recuperata … nessun dato inviato in questo giro», più «N varianti locali non sono ancora
  sul negozio: completamento in sospeso» e/o «variante remota senza identità conservata»);
  l'esito dichiarato è `parziale`. Nessuno stato nuovo.
- **Prodotto a variante unica senza opzioni**: la variante iniziale di Shopify **è** la
  variante — si aggiorna con i valori locali e l'identità, non se ne crea una seconda.
- **Il riconoscimento dell'identità nel pull vale per ogni remoto non collegato** — ma la
  rilettura parte solo se nel tenant esiste un prodotto non collegato con un tentativo di
  creazione alle spalle (`claim_version > 0`): senza, nessun remoto può portare
  un'identità di quel tenant non già collegata, e non si spende la chiamata (non
  solo per il webhook `products/create`): costa una lettura GraphQL per remoto sconosciuto,
  ed è ciò che impedisce il doppione locale anche a un pull del catalogo dopo un tentativo
  morto. Senza claim aperto **non importa e non adotta**: rifiuto nel registro
  (`import_prodotto_rifiutato`, dettaglio `identita_vestiflow_senza_claim`).
- **Le definizioni si rileggono a ogni creazione** (due letture), nessuna cache di processo:
  verificabile, e la creazione è rara.

**Prove eseguite (ambiente isolato, PostgreSQL 5433, negozio simulato).**

| Prova                                                                                                                                                                                                                                                        | File                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| risposta persa dopo `productCreate` → 1 remoto, id adottati nello stesso giro, alla ripubblicazione nessuna seconda creazione (**la `it.fails` diventata ordinaria**)                                                                                        | `creazione-con-identita.integration-spec.ts`                    |
| idem con la rilettura del recupero che fallisce → nessuna creazione, `error`, claim libero; il tentativo dopo rilegge e adotta                                                                                                                               | idem                                                            |
| risposta persa dopo `bulkCreate` → varianti ritrovate per identità, nessuna seconda `bulkCreate`                                                                                                                                                             | idem                                                            |
| interruzione fra le due chiamate → iniziale conservata, «completamento in sospeso»; iniziale modificata → conservata, mai rimossa                                                                                                                            | idem                                                            |
| riavvio: claim di processo morto (lease scaduta) → rilettura e adozione; claim vivo → «avviato», **zero** chiamate remote                                                                                                                                    | idem                                                            |
| due processi concorrenti / stesso processo → una `productCreate`, l'altro senza chiamate                                                                                                                                                                     | idem                                                            |
| vecchio proprietario superato che riprende → `productCreate` rifiutata dal negozio, **nessun'altra chiamata, nessuna scrittura**                                                                                                                             | idem                                                            |
| webhook `products/create` prima del salvataggio → adotta, un solo locale, il push conclude; senza claim → rifiuto registrato; altro tenant → import normale per quel tenant; claim verso altro negozio → non adotta; rilettura fallita → il webhook fallisce | idem                                                            |
| modifiche remote dopo la risposta persa → **remoto identico** dopo il recupero                                                                                                                                                                               | idem                                                            |
| isolamento tenant/negozio del claim; definizioni assenti / presenti / **tipo sbagliato** (nessuna creazione); variante unica                                                                                                                                 | idem                                                            |
| B3 storico: 3a–3h riscritte sul simulatore; **3h misura l'adozione** invece del doppione; 3c è la guardia 26.7 (colonna-cache persa con storia → rifiuto)                                                                                                    | `storico-push.integration-spec.ts`                              |
| collaudo S2/S7: le varianti **senza SKU** ora si collegano (per identità); la iniziale con opzioni ha titolo «M», non «Default Title» — corretto `varianteInizialeIntatta`                                                                                   | `collaudo-ciclo-utilizzo.integration-spec.ts`                   |
| unitarie push (prezzo in uscita ora sulla variante iniziale aggiornata; niente REST) e pull (riconoscimento senza identità = import normale)                                                                                                                 | `shopify-product-push.service.spec.ts`, `…pull.service.spec.ts` |

**Falsificazioni** (una guardia tolta alla volta, prove rieseguite, file ripristinato dalla
copia): senza la rilettura prima di creare → 5 rosse (risposta persa con rilettura fallita,
riavvio, 3h, 3f, webhook senza claim); senza il controllo di proprietà prima delle chiamate
remote → 2 rosse (proprietario superato, webhook senza claim); senza il riconoscimento nel pull
→ 4 rosse (i quattro casi webhook). ⚠️ `varianteInizialeIntatta` nel ramo di creazione
**non è falsificabile in simulazione**: la risposta di `productCreate` porta sempre una
iniziale intatta; è una difesa contro una risposta inattesa, dichiarata tale. Trovato
falsificando: il registro `platform_audit_log` non viene svuotato fra le prove (nessuna FK
verso `tenants`, ed è voluto) — la prova filtra per `entityId`.

#### 7.2-ter.1 Il percorso completo: risposta persa → recupero dei soli id → invio ordinario (misurato il 15/09, pomeriggio)

Letto il codice: dopo il recupero il prodotto è collegato, e il push successivo passa da
`updateLinkedProductViaGraphql` → `linkOrphanVariants` → `matchOrphanVariants`, che abbina
le locali senza id alle remote non collegate per **SKU, poi barcode, poi opzioni** (legacy,
nato per i prodotti importati), si ferma con errore se una locale non ha candidate, e poi
`bulkUpdateVariants` scrive i valori locali sulle abbinate. Quattro prove in
`creazione-con-identita.integration-spec.ts` (blocco 11):

| Caso                                                                                                    | Oggi                                                                                                                                                                                                                                | Criteri del proprietario        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| recupero **completo** (risposta persa su `bulkCreate`) → invio ordinario                                | ✅ `synced`; stesse due varianti, stessi id, **identità intatte**; i valori locali arrivano sulle nostre; una sola `bulkCreate`                                                                                                     | rispettati                      |
| recupero **parziale**, due locali e sola iniziale remota → invio                                        | ✅ `pushed: false`, `out_of_sync` «Varianti non abbinabili» (la L non ha candidate); **niente scritto**, remoto identico. ⚠️ La M non viene collegata per opzioni **solo perché la L ferma tutto**: effetto collaterale, non regola | rispettati, per caso            |
| **RIPRODUZIONE** · recupero parziale con **una** locale e la sola iniziale remota → invio               | ⛔ la locale è abbinata alla iniziale per il valore di **opzione**, la iniziale riceve SKU e prezzo locali, il push dichiara `synced`; la remota **non porta l'identità**                                                           | **violati** (opzioni, riuscito) |
| **RIPRODUZIONE** · recupero parziale, poi una L creata **a mano** sul negozio con lo SKU locale → invio | ⛔ la L locale si aggancia alla fatta-a-mano per **SKU** (prezzo 99,00 sovrascritto con 29,90), la M alla iniziale per opzioni, `synced`, nessuna identità                                                                          | **violati** (SKU, sovrascrive)  |

⛔ Le due «RIPRODUZIONE» erano verdi e fotografavano l'oggi; il caso «due locali» era
protetto da una **coincidenza** (una locale senza candidate). **Superate lo stesso giorno**:
regola confermata dal proprietario e implementata (sotto), e le stesse prove asseriscono ora
il comportamento corretto (nessun abbinamento arbitrario, prezzo remoto conservato, niente
falso «synced»).

**Regola funzionale — ✅ confermata dal proprietario (15/09, pomeriggio) e implementata
(`completaVariantiPerIdentita` nel push).** Per un prodotto pubblicato da VestiFlow con
identità (`shopify_create_claim_version > 0`, cioè creato da questo percorso — i prodotti
importati o pubblicati prima via REST restano **invariati** in questo intervento, prova
«un prodotto IMPORTATO resta all'abbinamento di prima»):

1. una locale senza `shopifyVariantId` **non si abbina mai** per SKU, barcode, titolo o
   opzioni; si abbina **solo per `vestiflow.variant_id`** (rilettura delle varianti remote
   per metafield, come nel recupero);
2. le locali senza remota si **creano** con la loro identità (`bulkCreate` delle sole
   mancanti, senza `REMOVE_STANDALONE_VARIANT`): è il **completamento**, nel push ordinario,
   come la tabella di §7.2-bis prevedeva; l'unicità del metafield impedisce il doppione;
3. le remote **senza identità** (iniziale, fatte a mano) **non si toccano** né si cancellano:
   il push le dichiara nel motivo («N varianti remote senza identità VestiFlow conservate»)
   e resta `out_of_sync` finché una persona non decide — nessuno stato né comando nuovo;
4. **prima di scrivere** qualunque cosa sul negozio si verificano tutte le corrispondenze:
   se la combinazione di opzioni di una locale mancante è **occupata** da una remota senza
   identità (la iniziale, una fatta a mano) → ⛔ **conflitto**: il push si ferma con un
   errore che nomina variante, combinazione e remota (`out_of_sync`, `pushed: false`),
   nessun collegamento automatico, cancellazione o sovrascrittura — decide una persona sul
   negozio;
5. qualunque esito non-successo della `bulkCreate` di completamento → rilettura per
   identità: le create si adottano (un doppione lo impedisce l'unicità, G4), quelle ancora
   assenti fermano il push senza secondo tentativo cieco.

Costo: una lettura GraphQL in più (le varianti per metafield) solo quando ci sono locali
senza id; nessuna colonna nuova. `REMOVE_STANDALONE_VARIANT` resta **solo** nella prima
creazione, subito dopo `productCreate`; ⚠️ quella finestra (variante iniziale modificata
fra le due chiamate, G7) resta **esplicitamente da risolvere** — la guardia
`varianteInizialeIntatta` controlla una fotografia della risposta, non lo stato del negozio.

**Prove del completamento** (`creazione-con-identita`, blocchi 11–12, 29/29):

| Caso                                                                  | Esito                                                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| recupero completo → invio                                             | identità intatte, stessi id, una sola `bulkCreate`                                                               |
| recupero parziale, due locali e sola iniziale → invio                 | **conflitto** sulla «M» (nomina `IDN-1-M`), niente scritto, remoto identico                                      |
| **ex RIPRODUZIONE** · una locale e sola iniziale → invio              | conflitto, iniziale intatta (SKU nullo, prezzo 0,00), non collegata, `out_of_sync`                               |
| **ex RIPRODUZIONE** · L fatta a mano con lo SKU locale → invio        | conflitto su M e L («2 varianti locali», nomina `SKU IDN-1-L`), prezzo 99,00 conservato, niente collegato        |
| completamento · XL aggiunta localmente, più una «S» fatta a mano      | XL creata con la sua identità; M/L stessi id e identità; la «S» intatta e non adottata; storico della XL scritto |
| completamento · combinazione XL occupata da una fatta a mano          | conflitto, zero chiamate di scrittura                                                                            |
| completamento · risposta persa su `bulkCreate`                        | rilettura per identità: una sola XL, id adottato                                                                 |
| completamento · due processi concorrenti                              | la seconda `bulkCreate` è rifiutata (identità occupata), rilettura, una sola XL, un solo storico                 |
| prodotto importato (`claim_version = 0`), cache di una variante persa | abbinamento legacy per SKU come prima; `listProductVariantsWithIdentity` mai chiamata                            |

Falsificazioni: senza il controllo del conflitto → 5 rosse; instradando i prodotti con
identità all'abbinamento legacy → 8 rosse. File ripristinato dalla copia.

#### 7.2-ter.2 Tre chiarimenti chiesti dal proprietario (15/09, pomeriggio)

**1 · Quando un claim rimasto aperto dopo un arresto torna recuperabile.** Mai da solo. La
scadenza (5 min) **non esegue** niente: rende soltanto rivendicabile il prodotto. Il
recupero parte al **primo push successivo** — «Sincronizza con Shopify» nel dettaglio, o un
salvataggio che pubblica — e prima della scadenza quel push risponde «avviato» senza
chiamare Shopify (prova «claim ancora vivo»). Nel frattempo il prodotto resta `syncing`: il
dettaglio lo interroga per 2 minuti (`SHOPIFY_FOLLOW_UP_MAX_WAIT_MS`) e poi si ferma, il
pulsante torna premibile. Nessuno scheduler, nessun elenco dei claim aperti: è il punto #6
(§7.3), che resta da progettare — con questo claim la ripresa ha finalmente un dato
verificabile su cui appoggiarsi (claim id, versione, negozio, `claimed_at`), non la sola
età dello stato.

**2 · Perché `varianteInizialeIntatta` «non era falsificabile».** Perché controlla la
**risposta di `productCreate`** — la variante iniziale che Shopify dice di aver creato:
senza SKU, senza barcode, prezzo 0, titolo iniziale per quelle opzioni («M», o «Default
Title»), senza il nostro metafield — e il negozio simulato risponde sempre così. Non
controlla lo stato del negozio un istante dopo (quello è ciò che il contratto G7 dice
irrilevante: la strategia rimuove la standalone anche modificata), quindi non è una
protezione contro una modifica **fra** le due chiamate — la prova «variante iniziale
MODIFICATA prima della bulkCreate» lo misura, e quella finestra resta dichiarata. Si
verifica pilotando la risposta: unitaria `shopify-product-push.service.spec.ts` «la
variante iniziale nella risposta di productCreate» — intatta → `REMOVE_STANDALONE_VARIANT`;
con uno SKU, un prezzo o un titolo diverso → nessuna strategia. Falsificata (`intatta =
true`): 3 rosse.

**3 · I quattro campi del claim nelle risposte prodotto.** Verificato il contratto: l'API
**non ha un DTO di risposta** per i prodotti — serializza le righe Prisma (`include` /
`select` «ogni scalare del modello», come già `importHandle`, `deletedById`, `tiktok*`);
il contratto consumato è `ProductApiRow` in `src/app/core/api/domain-api.mapper.ts`, e
`mapProductApiRow` prende solo i campi che elenca. I quattro campi **non vi compaiono e
non servono al client**: non sono necessari. **Campi tecnici esposti oggi** dalle risposte prodotto senza che il client li legga:
`importHandle`, `deletedById`, `tiktokCategoryId`, `tiktokProductId`, `tiktokSyncStatus`
e affini, e ora i quattro del claim (`shopifyCreateClaimId`, `…Version`, `…ShopId`,
`shopifyCreateClaimedAt`). **Proposta locale e semplice, senza toccare il backup** (che
legge il modello con `findMany`, non le risposte): le due uscite — elenco e dettaglio —
passano entrambe da `withReadableShopifyErrors` in `products.service.ts`; lì un
`senzaCampiDelClaim()` che toglie i quattro campi con una destrutturazione, e il tipo di
ritorno di quelle due letture che diventa `Omit<ProductWithVariants, CampiDelClaim>`.
Nessun DTO nuovo, nessuna revisione generale; una prova per uscita. ✅ **Fatto** (via del
proprietario, 15/09 pomeriggio): `senzaCampiDelClaim()` in `products.service.ts`, applicato
in `getById` e nella mappa dell'elenco; creazione, modifica e copia rispondono rileggendo il
dettaglio, quindi passano di lì; il tipo esposto è `ProdottoInRisposta =
Omit<ProductWithVariants, CampoDelClaim>` (controller compreso). Tre prove unitarie
(dettaglio, elenco, creazione), falsificate (3 rosse). `loadProductOrThrow` resta intero per
l'uso interno (confronti in `update`). Gli altri campi tecnici (`importHandle`,
`deletedById`, `tiktok*`) restano come sono: nessuna revisione generale. ⚠️ Nel
**backup** invece devono viaggiare, e viaggiano: trovato e chiuso in questo giro il caso in
cui un backup preso con un claim aperto **non si ripristinava** (FK verso `shopify_shops`,
reinserito dopo i prodotti): `shopifyCreateClaimShopId` è ora un campo differito
(`TENANT_BACKUP_DEFERRED_FIELDS`), riproduzione `ripristino-storico-shopify` 2a-bis.

**Il motivo arriva all'interfaccia.** Verificato: `shopifyLastError` passa da
`toShopifyUserMessage` (dettaglio ed elenco), che **riscriveva** in «Conflitto su SKU o
codici prodotto…» qualunque testo contenente «sku» — quindi il conflitto, che nomina lo SKU
della remota, perdeva proprio la variante. Corretto: gli esiti del motore già scritti per
l'operatore («Completamento su Shopify…», «Identità Shopify recuperata…», «Creazione su
Shopify…») passano intatti (unitaria + asserzione nelle due prove di conflitto: il testo
per l'operatore contiene `IDN-1-M`, «M», «decidere sul negozio»). Il dettaglio lo mostra in
`shopifySyncMessage` e nella scheda Problemi.

#### 7.2-ter.3 La finestra della prima creazione — ✅ CHIUSA con `productSet` in sola creazione (15/09/2026, pomeriggio)

**Riproduzione** (`creazione-con-identita`, «RIPRODUZIONE (finestra della prima creazione)»):
`productCreate` risponde; qualcuno modifica la variante iniziale (prezzo 12,50, SKU proprio)
prima che parta la `bulkCreate`; la strategia `REMOVE_STANDALONE_VARIANT` — decisa sulla
**fotografia** della risposta di `productCreate` (`varianteInizialeIntatta`) — la rimuove
con la modifica (contratto G7), e il push dichiara riuscito. Verde oggi: è la misura.

**Perché una rilettura prima di cancellare non basta.** Ridurrebbe la finestra al tempo fra
la rilettura e la `bulkCreate`, ma resterebbe una cancellazione decisa su uno stato che
può cambiare dopo la lettura: Shopify non offre una rimozione condizionata («rimuovi solo
se ancora così»).

⛔ **Prima proposta (15/09, pomeriggio) NON approvata**: «adotta la iniziale con la sola
identità; valori locali solo se la rilettura la mostra intatta» — il proprietario ha
rilevato che «rileggi, poi scrivi se intatta» conserva la possibilità di sovrascrivere una
modifica intervenuta nel frattempo, e che «ultimo che scrive vince» non è approvato
implicitamente. Anche il riordino dei valori di opzione non va fatto solo per aggirare il
problema senza verificarne l'effetto sull'ordine delle varianti in vetrina. Superata.

**Verifica sulle API (shopify.dev, versione 2026-07, letta il 15/09 pomeriggio — solo testo
letterale, con i limiti dichiarati).**

| Domanda                                                                     | Risposta della documentazione                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productCreate` può assegnare identità e valori alla variante iniziale?     | **No.** `ProductCreateInput` non ha `variants`, prezzo, SKU, barcode né metafield di variante (ha solo i metafield di prodotto e `productOptions`). Testuale: «only supports creating a product with its initial product variant … use productVariantsBulkCreate». La guida: «The API automatically creates one standalone variant using the first value from each option», prezzo 0.00. La finestra è **strutturale** a `productCreate` + `bulkCreate` |
| Esiste una creazione in UNA mutation con prodotto + varianti + identità?    | **Sì: `productSet`.** `ProductSetInput.variants: [ProductVariantSetInput!]` con `price`, `sku`, `barcode`, `compareAtPrice`, `optionValues` (obbligatorio), `inventoryItem`, `inventoryPolicy`, **`metafields`** per variante, e `metafields` di prodotto; `synchronous: true` (predefinito) restituisce il prodotto. Nessuna variante iniziale «standalone» da rimuovere: le varianti sono quelle dichiarate                                           |
| `productSet` senza `id` e senza `identifier` crea sempre un prodotto nuovo? | La documentazione dice «Omit the ID to create a new product» e gli esempi senza id/identifier creano; **non** trovata una frase «crea sempre» (nessun abbinamento per handle documentato in assenza di identifier)                                                                                                                                                                                                                                      |
| Con `identifier.customId` (upsert)?                                         | «For list fields: creates, updates, **and deletes existing entries that aren't included**» (`variants`, `collections`, `metafields`): è la semantica sostitutiva già respinta in §7.2 — **non** per la creazione                                                                                                                                                                                                                                        |
| Atomicità e limite di varianti in modalità sincrona                         | **Non confermati nel testo letterale** (la pagina era troncata; un riassunto automatico citava «250 varianti in sincrono» e «succeed or fail together», da NON considerare verificati). Il negozio ha un limite di 2048 varianti per prodotto; «Exempt from variant limits» per productSet                                                                                                                                                              |
| L'unicità del metafield `id` vale anche scritto dentro `productSet`?        | «ID metafield types are automatically configured to have unique values»; codici `ProductSetUserErrorCode.CAPABILITY_VIOLATION` / `DUPLICATED_VALUE` / `INVALID_METAFIELD` esistono, ma **nessuna frase esplicita** che una seconda creazione con lo stesso valore sia rifiutata senza lasciare un prodotto. Per `productCreate` lo ha verificato il contratto G2/G3; per `productSet` **va verificato sul negozio**                                     |

**Il limite, e la scelta funzionale minima (proposta, NON implementata).** Con
`productCreate` la seconda scrittura vulnerabile è inevitabile: la variante iniziale nasce
prima e senza identità, e qualunque cosa se ne faccia dopo (rimuoverla, adottarla,
aggiornarla) è una scrittura su uno stato che nel frattempo può essere cambiato. L'unica
strada che **evita** quella scrittura è `productSet` **senza identifier** per la sola
PRIMA creazione: prodotto, varianti, valori e le due identità in una mutation sincrona;
tutto il resto del blocco (claim, rilettura per identità prima di creare, recupero,
completamento, webhook anticipato) resta com'è, e `REMOVE_STANDALONE_VARIANT` esce dal push.
Condizioni prima di implementare, entrambe da verificare **sul negozio di prova** con una
prova di contratto (via del proprietario, come per G1–G8):

- **G9** · `productSet` (senza identifier) con `vestiflow.product_id` già usato → rifiutata
  **senza** lasciare un secondo prodotto; idem con un `vestiflow.variant_id` già usato;
- **G10** · `productSet` con una variante invalida (combinazione doppia) → **nessun**
  prodotto creato (atomicità osservata nel caso provato, come G6), o registrare cosa resta;
- **G11** · nessuna variante «standalone» in più rispetto a quelle dichiarate; ordine delle
  varianti e dei valori di opzione **come dichiarato** (senza toccare l'ordine locale).

Se G9 o G10 fossero smentite, `productSet` non chiude la finestra e la scelta torna fra
(a) tenere `productCreate` + `bulkCreate` **senza** strategia, adottando la iniziale con la
sola identità e **mai** i valori nella stessa scrittura (la iniziale resta a prezzo 0 finché
un push ordinario non la aggiorna — cioè finché una persona non ha deciso, se nel frattempo
è stata toccata: da dichiarare come conflitto, non «ultimo che scrive vince»), oppure
(b) la creazione a variante unica senza opzioni. ⛔ Nessuna delle tre è approvata.

**Prova di contratto G9–G12 — ✅ ESEGUITA il 15/09/2026 (pomeriggio) su
`test-vestiflow.myshopify.com`** (`shopify-identita-productset.contract-spec.ts`, esecuzione
`vf-productset-2026-09-15T12-29-05-524Z`, API 2026-07; via del proprietario). Stesse
protezioni di G1–G8: gate esplicito, negozio verificato per dominio e `partnerDevelopment`,
credenziale letta dal condiviso in sola lettura e mai esposta, definizioni **riusate** (non
create), prodotti in DRAFT col tag di esecuzione, nessuna cancellazione, archiviazione dei soli
id fotografati. ⛔ Nessun `identifier`, nessun `id` nel payload; nessun fallback a
`productCreate`; nessun aggiornamento via `productSet`. **Questa volta le risposte sono state
CATTURATE** (file di esito scritto dalla prova, senza credenziali):
`docs/30-allegato-contratto-productset-2026-09-15.json` — esiti, risposte grezze, fotografie
prima/dopo di ogni prodotto.

| G   | Esito         | Che cosa ha detto il negozio (catturato)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G9  | ✅ verificata | sola creazione: la prima `productSet` crea `…/10412267471143` (2 varianti M/L con identità); la seconda **sequenziale**, stessa identità e titolo/varianti diversi, è rifiutata con `INVALID_METAFIELD` su `input.metafields.0.value` — «Value is already assigned to another metafield. Choose a different value to ensure it remains unique.» — **nessun prodotto**, e il primo è **invariato** (fotografia identica); due **concorrenti** con identità nuova: una creata (`…/602215`, 1 variante), l'altra rifiutata con lo stesso errore; `productByIdentifier` ritrova entrambi i creati; **zero residui** non fotografati (confronto sugli ultimi 25 prodotti del negozio, e sul tag di esecuzione) |
| G10 | ✅ verificata | errore su variante, **misurato senza presumere**: (a) due varianti con la stessa combinazione «M» → `INVALID_VARIANT` su `input.variants.1` («The variant 'M' already exists.») e **nessun prodotto creato** (rilettura per identità: assente); (b) una variante con l'identità già usata dalla M di G9 → `INVALID_METAFIELD` su `input.variants.1.metafields.0.value`, **nessun prodotto creato**, e il prodotto di G9 **intatto** (fotografia identica, la sua M conserva l'identità). Atomicità **osservata nei due casi provati**: non resta niente dell'input rifiutato                                                                                                                              |
| G11 | ✅ verificata | variante **unica** (`Title` / «Default Title»): 1 variante, identità, SKU e prezzo come richiesti, `hasOnlyDefaultVariant: true`; **tre** varianti dichiarate nell'ordine L, M, S: esattamente 3 (nessuna in più), `position` 1/2/3 = L/M/S, valori di opzione `["L","M","S"]` come dichiarati, tutte con identità e SKU; gli id sono stati **riletti da `productByIdentifier`** ignorando la risposta di creazione                                                                                                                                                                                                                                                                                       |
| G12 | ✅ eseguita   | archiviati 4/4 (`…/471143`, `…/602215`, `…/962663`, `…/028199`); la ricerca per tag ne restituiva 3 al termine della prova e 4 a una rilettura successiva (indice di ricerca di Shopify in ritardo, non un residuo); nessuna cancellazione                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Residui sul negozio dopo questa prova: 4 prodotti ARCHIVED in più (totale delle due prove: 10)
e le 2 definizioni permanenti di G1. Il negozio del collega non è stato toccato.

**Che cosa cambia nella scelta.** Le tre condizioni sono verificate nei casi provati: `productSet`
senza identifier crea prodotto, varianti, valori e identità in una mutation sincrona, **senza**
variante standalone e nell'ordine dichiarato; una seconda creazione con la stessa identità è
rifiutata senza lasciare né un secondo prodotto né una modifica al primo; un input con una
variante rifiutata non lascia niente. La finestra fra `productCreate` e `bulkCreate` sparisce
per costruzione, e con essa `REMOVE_STANDALONE_VARIANT`. ⚠️ Non provato (dichiarato): il
limite di varianti in modalità sincrona (qui al massimo 3), l'esito con una risposta persa
(la rilettura per identità è la stessa di oggi), e il comportamento su un negozio con più
di 50.000 varianti.

**Implementazione — ✅ FATTA (via del proprietario, 15/09 pomeriggio), stesso ramo.**

| Dove                                             | Cosa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shopify-graphql.client.ts`                      | `createProductSet(input: ShopifyProductSetCreateInput)`: `productSet(input, synchronous: true)` con prodotto, opzioni, varianti (`sku`, prezzo, barcode, `optionValues`, `inventoryItem.tracked`, identità) e identità di prodotto; **il tipo non ha `id` né `identifier` e il metodo li rifiuta prima di chiamare** («SOLA creazione»); `userErrors` → errore col nome della mutation, nessun fallback. Rimossi `createProductWithIdentity` (productCreate), la `strategy` di `bulkCreateVariants`, e il `createProduct` legacy via productSet senza identità (mai usato dai servizi) |
| `shopify-identita-catalogo.util.ts`              | `buildProductSetCreateInput(product, options, variants, compareAt)`: opzioni e varianti **nell'ordine locale**, tutte con identità; senza opzioni → `Title` / «Default Title» (come Shopify rappresenta la variante unica, G11). Rimosse `titoloVarianteIniziale` e `varianteInizialeIntatta`. ⚠️ Nessun limite né troncamento sulle varianti                                                                                                                                                                                                                                          |
| `shopify-product-push.service.ts`                | `tentativoDiCreazione`: claim → definizioni → rilettura per identità → **`productSet`** → rilettura degli id per identità → adozione → chiusura del claim. Qualunque non-successo (esito incerto o rifiuto) → rilettura, mai seconda creazione, mai `productCreate`. Conservati: claim, `assicuraProprietario` prima di ogni chiamata, recupero, completamento, riconoscimento webhook                                                                                                                                                                                                 |
| `shopify-simulato.util.ts`                       | `createProductSet` come catturato: rifiuto `INVALID_METAFIELD` («Value is already assigned to another metafield…») per identità di prodotto o di variante già usata, `INVALID_VARIANT` («The variant 'M' already exists.») per combinazione doppia, **tutti i controlli prima di qualunque effetto** (niente creato, niente toccato), varianti nell'ordine dell'input, risposta persa dopo l'effetto, varco; `bulkCreate` senza strategia; `id`/`identifier` → errore                                                                                                                  |
| `shopify-catalogo.contract-spec.ts` (gate 03/09) | passa a `createProductSet` con identità proprie del gate (non eseguito: solo tipi)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Prove riverificate** (`creazione-con-identita` 26 + `storico-push` 9, tutte verdi; unitarie
client 4 nuove/riscritte, push 22, util 8):

| Caso                                                                                                       | Esito                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| creazione: una mutation, nessuna variante in più, **ordine locale** (M, L), identità e SKU                 | ✅ `createProductSet` 1, `bulkCreate` 0, `bulkUpdate` 0                                                                                                |
| **risposta persa** da `productSet`                                                                         | ✅ rilettura per identità nello stesso giro, id adottati (tutte le varianti c'erano: niente «in sospeso»), un solo remoto; poi push ordinario `synced` |
| risposta persa + rilettura fallita                                                                         | ✅ nessuna seconda creazione, `error`, claim libero; il tentativo dopo adotta                                                                          |
| rifiuto del negozio (identità già creata da un altro processo un istante prima)                            | ✅ nessun fallback: rilettura e adozione; un solo remoto                                                                                               |
| **modifica remota fra la risposta e l'adozione** (ex riproduzione della finestra)                          | ✅ **conservata**: prezzo 12,50 e SKU messi a mano restano, stessa identità; la creazione non scrive dopo la mutation                                  |
| modifiche remote dopo una risposta persa                                                                   | ✅ remoto identico dopo il recupero                                                                                                                    |
| **riavvio** (lease scaduta / viva), **concorrenza** (due processi, stesso processo, proprietario superato) | ✅ come prima, sul nuovo doppio                                                                                                                        |
| **webhook anticipato** (adozione / senza claim / altro tenant / altro negozio / rilettura fallita)         | ✅ come prima; il push in volo è fermo sulla rilettura degli id, non più sulla `bulkCreate`                                                            |
| variante unica senza opzioni                                                                               | ✅ `Title` / «Default Title», identità e SKU, nessuna scrittura dopo                                                                                   |
| variante locale nuova con combinazione occupata da una fatta a mano con lo stesso SKU                      | ✅ conflitto dichiarato, prezzo remoto conservato, niente `synced`, motivo all'interfaccia                                                             |
| completamento (XL nuova, conflitto, risposta persa, concorrenza, eliminata in volo, importato)             | ✅ invariati                                                                                                                                           |

⚠️ **Verificato vs non provato — due cose diverse, tenute separate.**

**1 · Limite di scala (non provato).** Verificato sul negozio (G9–G11) e riprodotto nel
simulatore: fino a **3 varianti** per mutation, opzioni a un livello, identità uniche,
rifiuti atomici nei due casi provati. Non provato: il limite di varianti in modalità
sincrona (la documentazione non lo dà in chiaro), prodotti con **molte** varianti
(decine/centinaia) e più opzioni, negozi oltre 50.000 varianti. Il codice non impone limiti
né tronca: se il negozio rifiuta, il prodotto va in errore col motivo e nessun fallback
distruttivo parte — sarà una prova di contratto dedicata a dire dove sta il limite.

**2 · `inventoryItem.tracked` (verifica FUNZIONALE, non di scala).** Confronto in sola
lettura fra il percorso precedente e quello nuovo, 15/09:

| Percorso                                             | Che cosa manda per il tracciamento inventario                                                                                                   | Verificato sul negozio                                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **prima** (develop `bd22d421`): creazione REST       | `inventory_management: 'shopify'` su ogni variante (`shopify-variant-payload.util`); nessuna creazione di varianti in aggiornamento             | dall'uso                                                                                                                                                     |
| **ora**: `productSet` (prima creazione)              | `inventoryItem: { tracked: true }` su **ogni** variante, sku al primo livello                                                                   | ⛔ **no**: G9–G11 non includevano `inventoryItem` — accettazione del campo e valore risultante da leggere (`inventoryItem { tracked }`) in una prova col via |
| **ora**: completamento (`productVariantsBulkCreate`) | `inventoryItem: { sku, tracked: true }` **solo se la variante ha uno SKU**; senza SKU la chiave non parte → tracciamento al default del negozio | ✅ gate del 03/09 (`shopify-catalogo.contract-spec`, 349–360): con `tracked: true` la variante rilegge `tracked = true`                                      |

⚠️ **Differenza segnalata, non corretta**: fra i due percorsi nuovi una variante **senza SKU**
(`ProductVariant.sku` è nullo per gli importati) nasce tracciata se creata con
`productSet` e non tracciata se creata dal completamento; il percorso REST precedente la
tracciava sempre. Sono la stessa semantica (`inventory_management: 'shopify'` ↔
`inventoryItem.tracked: true`), quindi `productSet` è allineato al prima; il completamento
no, nel solo caso senza SKU. Da decidere se `tracked` va mandato anche senza SKU nel
completamento (una riga in `buildVariantCreateInputs`); nessuna nuova prova sul negozio senza
il via.
⚠️ La ricerca per tag non è mai usata dall'applicazione come prova di assenza (l'indice è in
ritardo, misurato in G12): riconoscimento solo per identità e id noti.

**Residui dichiarati.**

- ✅ **Variante eliminata localmente durante l'invio — CORRETTO** (15/09, pomeriggio; era
  la «MISURA» qui sopra: errore grezzo di Prisma in `shopifyLastError` col percorso del
  file, poi un push «synced» che ignorava la remota con identità orfana). Ora: l'adozione
  rilegge **sotto il lock** le varianti locali che esistono adesso, non la fotografia di
  chi chiama (`adottaIdentitaRecuperata`); una remota con un'identità che non è di nessuna
  locale è una terza categoria (`remoteConIdentitaSenzaLocale`): **si conserva, la locale
  NON si ricrea**, e il prodotto lo dichiara con il canale esistente — `out_of_sync` +
  `shopifyLastError` («Completamento su Shopify incompleto: una variante remota porta
  l'identità di una variante VestiFlow che non esiste più — gid (SKU …). Conservata sul
  negozio, non ricreata in VestiFlow: decidere sul negozio.»), esito `parziale`, mai
  `synced`; per i prodotti con identità la rilettura delle varianti remote avviene a **ogni**
  push (una lettura in più), così anche il push successivo lo dichiara. I dettagli di
  persistenza restano nel log: `motivoDiPersistenzaPerLOperatore` traduce gli errori Prisma
  («Salvataggio locale non riuscito durante la pubblicazione (P2025): i dati locali sono
  cambiati mentre l'invio era in corso. Ripubblica il prodotto.»), senza chiamata né
  percorso del file. Prove: integrazione «completamento · la XL viene ELIMINATA localmente…»
  (esito, motivo per l'operatore, nessuna cancellazione remota, nessuna ricreazione locale,
  **e il push successivo** identico), unitaria sull'errore di persistenza tradotto;
  falsificazioni (adozione sulla fotografia; avviso fuori dallo stato) → rosse. ⚠️ Una
  variante **già pubblicata** con lo storico scritto non si può eliminare fisicamente (la
  FK di `shopify_variant_identities` la rifiuta, misurato): il caso nasce solo nella
  finestra fra la `bulkCreate` e l'adozione, prima dello storico. Trovato di passaggio:
  il doppio Prisma delle unitarie del push non aveva `$queryRaw` — l'adozione cadeva dopo
  l'invio del prezzo e due prove restavano verdi su un push fallito; ora asseriscono
  `pushed`.
- **Remota senza identità sulla combinazione di una locale** (fatta a mano): il
  completamento si ferma sul conflitto, per regola; il prodotto resta `out_of_sync` finché
  una persona non decide sul negozio. Nessuna rimozione automatica in nessun percorso. La
  finestra della prima creazione è chiusa (§7.2-ter.3); resta **non provato il limite di
  scala** di `productSet`.
- **Il completamento non ha un claim proprio**: due processi che completano insieme sono
  protetti dall'unicità dell'identità di variante (G4) e da `pushInFlight` per processo,
  non da un claim persistito; misurato verde, dichiarato.
- **Prodotto `syncing` per la durata della lease** (5 min) se il processo muore con il claim
  aperto: il push successivo, a lease scaduta, rilegge e adotta. Nessuno scheduler.
- **Claim residuo dopo adozione dal webhook di un tentativo morto**: le colonne restano
  valorizzate su un prodotto ormai collegato; inerti (`rivendicaCreazione` guarda solo i
  prodotti senza `shopifyProductId`), non ripulite.
- **Testo del rifiuto di unicità** non catturato dal negozio: il simulatore usa un
  segnaposto dichiarato; il servizio non lo interpreta (qualunque non-successo → rilettura).
- **Una `productCreate` in volo di un proprietario superato** arriva al negozio: la respinge
  l'unicità (G3); per `bulkCreate` in volo, l'unicità delle identità di variante (G4).
- `buildVariantsPayload` (REST) resta nell'util con la sua prova: non più usata dal push.
- La CI non è stata eseguita (nessun commit/push in questo mandato); in locale: unitarie
  API, integrazione completa, `tsc` build/spec, lint API e guardie dell'API verdi (vedi §9).

### 7.3 Ripresa dei prodotti bloccati in `syncing` senza interrompere lavorazioni (#6) — ⛔ NON approvata nella forma proposta (15/09)

⛔ Il proprietario: la sola scadenza temporale non basta a dichiarare morta una
lavorazione, e una notifica ricevuta durante un push non è necessariamente un'eco da
scartare. Da riformulare (vedi la correzione sul numero di rivendicazione in §7.1.1, che
vale anche qui).

**Serve**: `shopifySyncingSince` scritto da `markProductSyncing`; il pull scarta il webhook
**solo se** `syncing` è più giovane della scadenza (es. 15 min, sopra la durata di qualsiasi
push); il push, prima di partire, tratta un `syncing` scaduto come `out_of_sync`. Nessun
reset di massa all'avvio. **Si riusa**: `pushInFlight` per l'istanza corrente.

**Prove**: C1 · `syncing` scaduto + webhook → elaborato; C2 · `syncing` fresco + webhook →
scartato (come oggi); C3 · push in corso nella stessa istanza + webhook → scartato, e a push
finito il prodotto non resta `syncing`.

### 7.4 Lo stato della connessione non guarisce in lettura (#7) — ✅ FATTO sul ramo `fix/shopify-connessione-lettura-senza-scritture` (15/09/2026, da `develop` `01852516`, non committato)

`getForTenant` è ora una lettura: `findUnique` e DTO, nessun `updateMany`.
`healStaleErrorStatus` resta com'era e resta chiamato dai percorsi espliciti: `touchSync`,
`clearErrors` («Azzera»), ritorno OAuth (`shopify-oauth.service.ts:719`), import riuscito
(`shopify-product-pull.service.ts:233`). Nessun'altra regola degli stati è cambiata.

**Prove** (ambiente isolato, PostgreSQL 5433, API vera avviata dalla prova):
`connessione-lettura-senza-scritture.integration-spec.ts` — riproduzione: `recordError`
poi `GET /shopify/connection` → su `develop` rispondeva `connected` e riscriveva la riga
(**rossa prima della correzione, 2 prove su 4**); con la correzione lo stato resta `error`
con la sua causa e la riga (compreso `updatedAt`) è **identica** dopo tre letture;
`touchSync`, `POST /shopify/connection/clear-errors` e `healStaleErrorStatus` guariscono
come prima; senza credenziale niente guarisce e la lettura non cambia niente. Più la
prova unitaria «getForTenant su una connessione in errore NON scrive» (rossa su
`develop`, verde con la correzione). Build API, `typecheck:test` e lint API verdi.

⚠️ **Conseguenza dichiarata**: uno stato `error` scritto da `recordError` ora resta finché
una sincronizzazione riesce, si preme «Azzera», si rifà l'OAuth o un import riesce. Il
push per coppia lo rifiuta davvero (`not_connected`): è il comportamento che la guardia
prometteva. Il pannello lo mostra già (stato del negozio a destra del titolo, avviso).
`GET /shopify/setup` passa dalla stessa lettura ma chiama anche il negozio
(`/locations.json`): la prova d'integrazione si ferma alla connessione.

### 7.5 Throttling GraphQL come il 429 (#4) — ✅ FATTO sul ramo motore (vedi §7-ter)

**Serve**: `THROTTLED` → attesa da `throttleStatus` (già letto) e ritentativo entro
`SHOPIFY_API_MAX_RETRIES`. **Si riusa**: `waitForRetry`. **Prove**: E1 · `200` + `THROTTLED`
una volta poi `data` → il chiamante riceve il dato; E2 · oltre il limite → 429 leggibile
(la prova esistente `:784` va **riscritta**: oggi fissa il comportamento opposto).

### Fuori dal primo blocco, e perché

#9 (confine ordini all'attivazione) e #10 (guardia trasferimento) riguardano la prima
connessione, che il tenant di prova non ha percorso: secondo blocco, stesse regole. #11
(orologio prodotti): decisione di `docs/24` §9.10, da prendere prima. #8: decisione di
prodotto (`docs/22` B3). #12: si chiude da sé al primo evento; nessuna migrazione dati sul
condiviso. #14–#15: nota di deploy e riconciliazione periodica, da decidere.

## 7-ter · Blocco «trasporto»: timeout, THROTTLED, transitori delle sole letture — ✅ FATTO sul ramo motore (15/09/2026, notte)

Un solo posto per le regole condivise da REST e GraphQL: `shopify-trasporto.util.ts`
(6 prove sulle funzioni pure). I due client le applicano nel loro ciclo di tentativi.

| Limite                              | Valore di serie | Variabile                  | Che cosa governa                                                                     |
| ----------------------------------- | --------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| timeout di ogni chiamata            | **15 s**        | `SHOPIFY_API_TIMEOUT_MS`   | `AbortSignal.timeout` su ogni `fetch`, letture e scritture                           |
| ritentativi degli errori transitori | **2**           | `SHOPIFY_API_READ_RETRIES` | timeout, rete, 502/503/504 — **solo letture** (REST `GET`, GraphQL `query`)          |
| ritentativi di 429 e THROTTLED      | 5 (esistente)   | `SHOPIFY_API_MAX_RETRIES`  | attesa da `Retry-After` / `throttleStatus`, altrimenti backoff 1·2·4… s (tetto 30 s) |
| scadenza complessiva                | **60 s**        | `SHOPIFY_API_DEADLINE_MS`  | attese comprese: oltre non si ritenta più, per nessun motivo                         |

Con i valori di serie una lettura che non risponde termina in **≤ 48 s** (3 × 15 s + 1 + 2 s);
un `Retry-After` che porterebbe oltre i 60 s non si aspetta (429 subito al chiamante).

**Classificazione degli esiti** (`ShopifyTrasportoException`, con `causa` e `esitoIncerto`):

| Esito                                                    | Lettura                                                              | Scrittura (REST `POST/PUT/PATCH/DELETE`, GraphQL `mutation`)                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| timeout, rete, 502/503/504                               | ritentata entro `apiReadRetries` e scadenza; poi errore con la causa | **nessun ritentativo**: `esitoIncerto = true`, testo «scrittura con esito incerto: verifica sul negozio prima di ripetere» |
| 429 (`Retry-After`)                                      | ritentata                                                            | ritentata (Shopify non l'ha eseguita)                                                                                      |
| GraphQL `200` + `THROTTLED` **senza `data`**             | ritentata dopo `max(1, deficit/restoreRate)` s                       | ritentata: **non è un esito incerto**, Shopify non ha eseguito l'operazione (rifiuto prima dell'esecuzione)                |
| GraphQL `data` presente + errori (risposta **parziale**) | errore, nessun ritentativo                                           | errore, nessun ritentativo: qualcosa è stato eseguito                                                                      |
| 4xx (401/403/404/422)                                    | permanente                                                           | permanente                                                                                                                 |

⚠️ La scrittura con `esitoIncerto` resta **un errore per chi la riceve**: la creazione del
prodotto (#5) e le altre scritture senza chiave non ritentano da sole, e la decisione su
come trattare l'incerto è ancora aperta (7.2). Le quantità hanno già chiave e tentativo aperto.

**Prove** (`shopify-admin-http.client.spec.ts` 11, `shopify-graphql.client.spec.ts` 54):
429 con e senza `Retry-After`; `Retry-After` oltre la scadenza → nessuna attesa; lettura che
non risponde → 3 chiamate da 50 ms, errore «timeout», in meno di 2 s; scrittura che non
risponde → 1 chiamata, esito incerto; 502/503 su lettura ritentati, su scrittura no; rete
idem; 4xx permanente; THROTTLED → attesa 1 s (deficit 40/100) e 3 s (deficit 300/100),
oltre il limite → 429; mutation throttled senza `data` → ritentata; risposta parziale →
non ritentata; **negozio A in attesa di un `Retry-After` da 5 s, negozio B risponde subito**
(limitatore vero, orologio finto). Le due riproduzioni `it.fails` di timeout e THROTTLED
sono diventate prove ordinarie; restano `it.fails`, verificate una per una per la ragione
prevista: consegne duplicate (2 elaborazioni), risposta dopo l'elaborazione («ancora in
attesa»), creazione prodotto con risposta persa (2 `createProduct`).

### 7-ter.0 Due casi chiusi dopo la verifica del proprietario (15/09, notte)

**Scadenza complessiva = attese del limitatore + ritentativi + intera risposta.** Riprodotto:
con una pausa del limitatore (un 429 precedente sullo stesso negozio) che portava oltre la
scadenza, la chiamata partiva lo stesso e col timeout pieno (REST: risposta ricevuta; 239 ms
su una scadenza di 60). Ora `BudgetTrasporto`: dopo **ogni** attesa si rilegge il residuo; a
residuo zero la chiamata **non parte** (errore «scadenza», zero `fetch`), altrimenti il
segnale dura `min(timeout, residuo)`. Le attese pianificate dal client si controllano prima
di attenderle, come già; niente prosegue in sottofondo dopo l'errore al chiamante (le prove
lo misurano attendendo oltre e contando le chiamate).

**E l'attesa del limitatore sta DENTRO la scadenza** (precisazione del proprietario, chiusa
subito dopo): la prima stesura verificava «zero `fetch`» ma il chiamante riceveva l'errore
solo alla fine dell'attesa del limitatore (80 ms su una scadenza di 40). Ora `sleepMs` accetta
un segnale e `beforeRestRequest`/`beforeGraphqlRequest` lo passano alle proprie pause: alla
scadenza l'attesa si interrompe con un rifiuto, il timer è cancellato, `lastRequestAt` non si
aggiorna e `pauseUntil` del negozio resta intatto — le altre richieste la rispettano ancora.
Il client la incapsula in `attesaEntroIlResiduo` (una corsa con la scadenza, così vale anche
per un'attesa che ignorasse il segnale). Il segnale di timeout è costruito con `setTimeout`
(`segnaleDiTimeout`, cancellabile, `unref`) e non con `AbortSignal.timeout`, i cui timer
interni un orologio finto non raggiunge. Prova con orologio controllato e limitatore vero, su
entrambi i client: negozio in pausa per 5 s (bucket `40/40`), scadenza 1 s → errore a 1 s
prima della fine della pausa; zero `fetch` anche dopo altri 10 s; una nuova richiesta sullo
stesso negozio attende tutta la nuova pausa (4,9 s ancora ferma, a 5,1 s parte). Falsificata:
senza l'attesa limitata falliscono 4 prove.

**Intestazioni ricevute, corpo bloccato o interrotto.** Riprodotto: un errore in
`response.json()`/`text()` usciva non classificato (`causa` assente). Ora
`causaDelCorpoFallito`: `TimeoutError/AbortError` → **timeout** (il segnale copre anche la
lettura del corpo), `TypeError` → **rete**, `SyntaxError` → **risposta** (non valida).
Lettura: timeout/rete ritentati entro `apiReadRetries`, «risposta» mai. Scrittura: tutte e
tre **esito incerto**, nessun ritentativo — a intestazioni `2xx` ricevute l'operazione è
quasi certamente eseguita. Le letture del corpo nei rami 429/5xx/4xx non possono più
uscire come errore grezzo.

Prove aggiunte, prima rosse per la ragione prevista e poi verdi, su ENTRAMBI i client:
attesa del limitatore oltre la scadenza → zero chiamate e niente dopo; ultimo tentativo con
residuo (~30 ms) minore del timeout (200 ms) → una chiamata, interrotta al residuo, totale
entro la scadenza; corpo bloccato (lettura: 3 tentativi poi «timeout»; scrittura: 1,
incerto); corpo interrotto dalla rete (lettura ritentata, scrittura incerta); JSON rotto
(«risposta», mai ritentato, incerto in scrittura). REST 18, GraphQL 61, util 8, limitatore +1 (`sleepMs` col segnale).

### 7-ter.1 Due `orders/create` concorrenti su un ordine NUOVO — misurato (prova 24)

`prima-connessione-percorso.integration-spec.ts` #24, negozio simulato, DB isolato: **una
chiamata riesce, l'altra cade con P2002** (unicità `[tenantId, shopifyOrderId]`), non gestito
→ al controller è un 5xx → Shopify la ritenta. Effetti: **un ordine, un impegno da 4, un
evento canonico di creazione**; il ritentativo successivo è un aggiornamento idempotente
(effetti identici, nel registro la sola traccia `online_order_updated`). Non è un doppione:
è un ritentativo in più. Accogliere il P2002 come «già creato» è una decisione a parte,
non presa.

## 7-bis · Le prove aggiuntive chieste il 15/09 (sera) — ambiente isolato

Tre categorie, come chiesto: **verde** (comportamento giusto, dimostrato), **difetto
riprodotto** (prova `it.fails`: asserisce il comportamento desiderato e oggi fallisce — la
misura del difetto, che diventa rossa quando la correzione arriva), **non verificato**.

| Caso                                                                    | Esito                                  | Prova                                                                                                          | Che cosa dice                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REST 429 + `Retry-After`                                                | ✅ verde (nuova)                       | `shopify-admin-http.client.spec.ts`                                                                            | attesa da `Retry-After` (2 s) tramite il limitatore, ritentativo, risposta buona al chiamante; bucket letto a ogni risposta; senza `Retry-After` si ritenta col backoff fino a `apiMaxRetries`, poi 429 al chiamante |
| REST 5xx transitorio                                                    | ✅ verde (fissa l'attuale)             | idem                                                                                                           | **non** ritentato: errore al primo colpo (#3, da decidere per le letture)                                                                                                                                            |
| REST timeout di lettura                                                 | ⛔ riprodotto → ✅ corretto (§7-ter)   | `shopify-admin-http.client.spec.ts`                                                                            | era appesa dopo 120 s; ora interrotta a 15 s, ritentata 2 volte, poi «timeout»                                                                                                                                       |
| GraphQL 429                                                             | ✅ verde (esistente)                   | `shopify-graphql.client.spec.ts`                                                                               | attende e riprova; oltre il limite 429                                                                                                                                                                               |
| GraphQL `200` + `THROTTLED`                                             | ⛔ riprodotto → ✅ corretto (§7-ter)   | `shopify-graphql.client.spec.ts`                                                                               | lanciava; ora attende il ripristino dei punti e riprova entro `apiMaxRetries`                                                                                                                                        |
| Risposta persa dopo una scrittura — quantità                            | ✅ verde (esistente)                   | `protezione-scritture-inventario` P5/P7                                                                        | il ritentativo non riscrive: chiave + tentativo aperto                                                                                                                                                               |
| Risposta persa dopo una scrittura — creazione prodotto                  | ⛔ riprodotto → ✅ corretto (§7.2-ter) | `creazione-con-identita.integration-spec.ts` (era `it.fails` in `riproduzioni-sincronizzazione`, file rimosso) | Shopify crea, la risposta si perde: il tentativo rilegge per identità e adotta gli id; alla ripubblicazione **un solo** prodotto remoto (1 `productCreate`) — #5                                                     |
| Webhook duplicati (stesso `X-Shopify-Webhook-Id`)                       | ⛔ riprodotto                          | `shopify-webhooks.controller.spec.ts`, `it.fails`                                                              | due consegne, due elaborazioni: l'intestazione non è letta — #1                                                                                                                                                      |
| Webhook: risposta prima dell'elaborazione                               | ⛔ riprodotto                          | idem, `it.fails`                                                                                               | con l'elaborazione ferma la risposta non parte (dopo 50 ms «ancora in attesa») — #1                                                                                                                                  |
| Webhook concorrenti, stesso ordine esistente                            | ✅ verde (esistente)                   | `prima-connessione-percorso` #17, #20                                                                          | eventi ripetuti e concorrenti → un solo effetto, `FOR UPDATE` + orologio                                                                                                                                             |
| Webhook concorrenti, ordine NUOVO (due `orders/create` insieme)         | ✅ misurato (prova 24)                 | `prima-connessione-percorso` #24                                                                               | una riesce, l'altra P2002 (5xx → Shopify ritenta); un ordine, un impegno, un evento; il ritentativo è idempotente (§7-ter.1)                                                                                         |
| Prodotto con molte varianti (8) su `products/update`                    | ✅ verde (nuova, dopo la correzione)   | `costi-varianti-in-aggiornamento.integration-spec.ts`                                                          | vedi sotto                                                                                                                                                                                                           |
| Prodotto con 8 varianti: tempo di risposta del webhook sul negozio vero | ⚠️ non verificato                      | —                                                                                                              | richiede il negozio (log dei tempi o consegne dell'app partner); resta il limite inferiore aritmetico                                                                                                                |

### 7-bis.1 `fetchVariantCosts` su `products/update` — dimostrato e ristretto (ramo motore)

Con l'arricchimento **vero** e il negozio simulato che conta `GET /inventory_items/{id}`:

| Scenario                                                                           | Prima (`develop`)                     | Dopo             | Campi scritti                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prima importazione, 8 varianti con costo                                           | 8 chiamate, costi acquisiti           | **8**, invariato | invariati                                                                                                                                                                  |
| `products/update` (titolo + prezzo), nessuna variante nuova, costi remoti cambiati | **8 chiamate** per un valore scartato | **0**            | identici: titolo e prezzo Shopify aggiornati, `purchasePriceMinor` resta quello di VestiFlow (12345) su tutte le varianti; collezioni e metafield letti come prima (1 + 1) |
| `products/update` con UNA variante nuova su Shopify                                | **9 chiamate**                        | **1**            | la nuova nasce col costo remoto (77,25), le otto restano a 12345                                                                                                           |

Il costo in aggiornamento si scrive **solo** in `tx.productVariant.create` (`docs/24` §9.11):
`importProductFromWebhook` ora legge le varianti locali del prodotto (`shopifyVariantId`,
lo stesso criterio dell'aggiornamento) e chiede il costo con `variantCostsFor` = i soli id
remoti sconosciuti; prodotto sconosciuto = tutte, come prima. ⚠️ Un caso al margine
dichiarato: variante tolta in locale fra questa lettura e il lock → rinasce senza costo,
come nell'import massivo (che non li legge affatto, `fetchVariantCosts: false` — asimmetria
preesistente, non toccata). Trovato di passaggio: nell'arricchimento un errore su
collezioni/metafield **azzera anche i costi** (`catch` unico che torna `EMPTY_ENRICHMENT`);
non cambiato, da tenere presente.

## 8 · Ramo impostazioni — ✅ completato (15/09/2026, sera)

Nel ramo `fix/impostazioni-shopify-caricamento-percorso` (non committato): scheda
**Sincronizzazione** con scheletro / errore con «Riprova» / contenuto, ed etichetta senza
parola di stato finché il percorso non è letto; scheda **Problemi ed esiti** con gli stessi
tre stati (l'assenza di problemi la dice `app-shopify-problemi`, mai una scheda vuota).
Prove: risposta ritardata, risposta fallita → «Riprova» → contenuto con `stato()` chiamato
esattamente due volte; tutte rosse senza la correzione. Dettagli in `docs/29` §10. Nessuna
logica di motore in quel ramo.

## 9 · Che cosa NON è stato fatto

Nessuna scrittura sul condiviso; su Shopify solo le prove di contratto autorizzate
(§7.2-bis.1 G1–G7 e §7.2-ter.3 G9–G12, prodotti DRAFT archiviati, mai eliminati); nessun
webhook inviato all'API 3000; nessuna misura dei tempi di risposta del webhook (richiede il
negozio). Il blocco §7.2-ter è sul ramo unico `feat/shopify-affidabilita-creazione` (da
`bd22d421`, worktree `C:/vf-motore`), **non committato**: commit, push, PR e CI attendono il
via. Restano aperti: la ripresa dei `syncing` (§7.3), la coda webhook (§7.1), il residuo del
claim dopo un'adozione da webhook, il limite di scala di `productSet` (§7.2-ter.3, non
provato), la deriva della tabella degli stati sync (sotto).

**Suite complete sull'albero finale (15/09, pomeriggio, dopo `productSet`)**: `nest build`,
`tsc` sui test e `eslint` puliti; unitarie API 243 file, 2873 verdi più 2 expected fail (le
due `it.fails` del webhook); integrazione **63 file, 1018/1018**
(undicesima esecuzione).

⚠️ **Il sintomo del ripristino ha una causa MISURATA, e non è ambientale.** Nelle esecuzioni 8
e 10 le sei prove di export→ripristino di `invariante-disponibile` cadevano con «Riferimento
assente o di un altro negozio: shopifyInventorySyncStates.variantId». Con una diagnosi
temporanea (file poi ripristinato, `git diff` vuoto) la riga rifiutata è stata catturata: uno
stato sync del tenant A creato **6 secondi prima** dell'inizio del file, dalla forma esatta di
`collegamento-escluso` (sezione delle quantità), la cui variante non esiste più. Sopravvive
perché `shopify_inventory_sync_states` **non ha chiavi esterne nel database** (`pg_constraint`:
solo la primaria; la migration `20260713140000` non le scrive mentre lo schema ne dichiara
tre) e il `TRUNCATE … tenants CASCADE` della fixture non la raggiunge — deriva già registrata
in `docs/DA-FARE` §21-ter il 09/09, qui rimisurata. `collegamento-escluso` la ripulisce solo
nel `beforeEach` della sezione, non nell'`afterAll`: l'ultima riga esce dal file, e cade chi
lo segue nell'ordine della cache di vitest se esporta il tenant A senza prima ripulire. Le
due ipotesi della mattina (ritentativi pendenti, isolamento dell'export) sono **ritirate**.
⭐ **Contenimento fatto (15/09, sera, commit separato)**: l'`afterAll` di
`collegamento-escluso` cancella gli stati sync **dei soli tenant della fixture** prima dello
`svuota`, come negli altri sette file, e la pulizia non ingoia i propri errori. Sequenza
verificata a comando: prima della correzione il file da solo lasciava 1 riga e
`invariante-disponibile` subito dopo cadeva su 6 ripristini; dopo, 0 righe e 19/19; suite
completa 63 file, 1018/1018 (12ª corsa). ⛔ Le tre FK restano la correzione vera, **non
introdotte**: migration a parte, con scelta esplicita delle regole di cancellazione e conteggio
degli orfani sul condiviso (`DA-FARE` §21-ter). Dettaglio in
`docs/30-allegato-corsa-ripristino-2026-09-15.md`.
