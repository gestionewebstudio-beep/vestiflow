# 30 — Aggiornamento del database condiviso e passaggio a `main`

_Preparazione del 14/09/2026, dopo il merge di `feature/shopify-link-history` in `develop` (PR #9 →
`1f85c7d3`, PR #10 → `240d81c8`, CI verde). Sul **condiviso** solo letture e un backup; tutto il
resto è stato **provato sulla copia** (§8). Nessuna migration, backfill, merge in `main`, deploy,
modifica ai webhook o disconnessione del negozio: restano un via a parte (`regole-qualita`,
«Database»)._

⭐ **Precisazione del proprietario (14/09/2026), da mantenere**: VestiFlow è **in fase di
realizzazione**, nessun cliente è attivo, **tutti i tenant sono di prova** e in questo momento ci
lavora **solo lui**. Una **breve interruzione è accettabile**: il passaggio non va organizzato come
un rilascio a clienti operativi. I tenant del collega sono anch'essi di prova, ma **non si
cancellano né si riconfigurano implicitamente**.

## 0. Che cosa vale oggi — la tabella decide, il resto argomenta

| Decisione / fatto                                                                                                                                                                                                                                                                                                                                       | Dove |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Le migration di `develop` non applicate al condiviso sono **23**, non nove: **tutte** quelle del ramo, dalla `20260907000000` alla `20260913220000`. Applicate 159, ultima il 06/09 alle 18:59Z; nessuna estranea                                                                                                                                       | §1   |
| Per le tabelle che l'API pubblicata conosce le 23 sono **additive**: l'API di `main` funziona sullo schema nuovo — letto nei file SQL **e misurato sulla copia** (§8.3)                                                                                                                                                                                 | §2   |
| Il solo backfill di questo rilascio è `backfill:storico-shopify` (fasi 3-4 di `docs/24` §8.5.8); viene **dopo** la fase 2, che passa dal callback OAuth del **codice nuovo** — quindi dopo il deploy                                                                                                                                                    | §3   |
| **Fase 2 con la via A** — deciso il 14/09/2026: Disconnetti → Connetti sul tenant del proprietario e ricollegamento a mano delle **cinque sedi** con la corrispondenza rilevata (§1). Il pulsante «Rinnova autorizzazione» **non si aggiunge adesso**                                                                                                   | §3.2 |
| Backup del condiviso **fatto** (14/09, 08:58Z) con una **passphrase nuova**, ora in `api/.env` e nel GitHub Secret; quella esposta vive **solo** nel Gestore credenziali per gli archivi precedenti. Ripristino **provato** sul 5433: copia identica. Backup settimanale riparato (secret `BACKUP_DATABASE_URL`) e verificato con un ripristino isolato | §4   |
| Sulla copia: **23 migration in 3,4 s**, API vecchia compatibile in lettura e scrittura, API nuova funzionante, **backfill 55/71/5 e seconda passata +0**                                                                                                                                                                                                | §8   |
| Railway: `api/Dockerfile` esegue `npx prisma migrate deploy && node dist/main.js` al boot, healthcheck `/api/v1/health`. Applicando le migration **prima** del merge in `main`, il boot non trova nulla da applicare. Oggi pubblica il codice vecchio                                                                                                   | §5   |
| Sequenza definitiva in **una finestra**: backup fresco → migration sul condiviso → merge `main` → controlli → Disconnetti/Connetti + 5 sedi → backfill → verifica                                                                                                                                                                                       | §6   |

## 1. Misurato sul condiviso, in sola lettura (14/09/2026, 08:23Z)

Transazione dichiarata `READ ONLY`, soli cataloghi e `COUNT`; client Prisma di `develop`
(`C:/vf-verifica`), `DATABASE_URL` del pooler letta dall'ambiente e mai stampata.

| Cosa                                        | Valore                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| server                                      | PostgreSQL **17.6** · database 22 MB · 77 tabelle in `public` · 9 connessioni (1 attiva)                                                                                                             |
| estensioni                                  | `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`                                                                                                                           |
| `_prisma_migrations`                        | **159 applicate**, 0 annullate, 0 non finite; ultima `20260906120000_ritiro_doppioni_sintetici_pagamento` (06/09, 18:59Z)                                                                            |
| `api/prisma/migrations` (develop)           | **182** cartelle                                                                                                                                                                                     |
| **pendenti**                                | **23** — tutte quelle del ramo, `20260907000000_shopify_link_history` → `20260913220000_ultimo_aggiornamento_shopify_ordine` (confermate da `prisma migrate status` sulla `DIRECT_URL` del rilascio) |
| estranee (nel db, non in develop)           | **0**: il collega non ha applicato nulla oltre `main`                                                                                                                                                |
| tabelle/colonne delle pendenti già presenti | **nessuna** (`shopify_shops`, `shopify_setups`, `sales_order_shipments` assenti; `sales_orders.refund_total_minor`, `shopify_updated_at`, `products.shopify_product_type` assenti)                   |
| trigger non interni                         | 5, tutti di Supabase (`realtime`, `storage`): nessun trigger applicativo — arrivano con le pendenti                                                                                                  |

⛔ **Qui `DA-FARE` §10g diceva «nove migration non applicate, dalla `20260911090000`»**: era la
somma delle sole migration scritte dopo l'11/09, e assumeva che le 14 precedenti (07–10/09) fossero
già sul condiviso. **Non lo erano**: erano state applicate solo ai database locali 5433 e 5434.
Corretto in §10g con questa misura.

**I dati che il rilascio tocca** (conteggi del 14/09):

| Tenant           | Stato       | Negozio                                 | Prodotti collegati | Varianti | Sedi | Ordini Shopify |
| ---------------- | ----------- | --------------------------------------- | ------------------ | -------- | ---- | -------------- |
| Test Amato Luigi | `connected` | `test-vestiflow.myshopify.com`          | 55                 | 71       | 5    | 11             |
| Mimmo Test s.r.l | `connected` | `vestiflow-test-hifqgyz0.myshopify.com` | 125                | 222      | 3    | 2              |

In tutto: 6 tenant, 40 ordini (13 Shopify), 62 righe, 6 rimborsi già in `sales_order_refunds`,
288 prodotti (180 con id Shopify, **tutti distinti**), 494 varianti (293 con id, **tutte distinte**),
12 sedi (8 con id), 213 movimenti, 170 documenti. Nessun id remoto doppio: i controlli bloccanti
del backfill (§8.5.8) non hanno oggi niente da fermare — è la misura, non una previsione.

⭐ **Gli abbinamenti attuali delle sedi, da conservare**: sono la corrispondenza da ricreare a mano
dopo Disconnetti → Connetti (§3.2). Letti il 14/09 in sola lettura; la stessa tabella sta in
`backups/rilascio-2026-09-14/sedi-abbinamenti.json`, accanto al backup e ai conteggi del confronto.

| Tenant           | Sede VestiFlow       | Location Shopify (id) |
| ---------------- | -------------------- | --------------------- |
| Test Amato Luigi | Magazzino test 3     | 113512546599          |
| Test Amato Luigi | My Custom Location   | 113512317223          |
| Test Amato Luigi | Shop location        | 113512284455          |
| Test Amato Luigi | Snow City Warehouse  | 113512349991          |
| Test Amato Luigi | Test sede da shopify | 113656201511          |
| Mimmo Test s.r.l | My Custom Location   | 113944297545          |
| Mimmo Test s.r.l | Shop location        | 113944264777          |
| Mimmo Test s.r.l | Snow City Warehouse  | 113944330313          |

## 2. Le 23 migration, lette una per una: che cosa cambia per l'API pubblicata

Classificate per istruzione (script usa-e-getta sui file SQL, commenti esclusi) e incrociate con le
tabelle dello `schema.prisma` di `main` (`969c19e8`):

| Migration                                                                  | Sulle tabelle che `main` conosce                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260907000000_shopify_link_history`                                      | `shopify_connections.shop_id UUID` nullable + FK composita; il resto sono 7 tabelle nuove, 17 trigger **sulle nuove**, RLS e REVOKE nello stesso file                    |
| `20260908120000` … `20260909110000` (6)                                    | tabella `platform_audit_logs` nuova; valori aggiunti agli enum `PlatformAuditOutcome`/`PlatformAuditOperation`; funzioni e trigger sulle tabelle nuove                   |
| `20260909200000` … `20260910210000` (6)                                    | `shopify_inventory_sync_states`: 12 colonne **nullable** o `NOT NULL DEFAULT false`, 4 indici                                                                            |
| `20260911090000_tipo_prodotto_shopify`                                     | `products.shopify_product_type TEXT` nullable                                                                                                                            |
| `20260911210000_prima_connessione_shopify`                                 | tabelle nuove (`shopify_setups`, `shopify_location_choices`), RLS e REVOKE                                                                                               |
| `20260912120000_ordini_da_id`                                              | `DROP COLUMN orders_since` + `ADD orders_since_id` **su `shopify_setups`**, che `main` non ha: nessun effetto sull'API pubblicata                                        |
| `20260912130000`, `20260912150100`                                         | valori enum                                                                                                                                                              |
| `20260912150000_spedizioni_ordine`, `20260913160000_righe_rimborso_canale` | tabelle nuove (`sales_order_shipments`, `sales_order_shipment_lines`, `sales_order_refund_lines`), RLS e REVOKE                                                          |
| `20260913170000_testata_rettifiche_ordine`                                 | `sales_orders.refund_total_minor INTEGER NOT NULL DEFAULT 0`, **`UPDATE` di riempimento** dalle 6 righe di `sales_order_refunds`, colonna generata `current_total_minor` |
| `20260913220000_ultimo_aggiornamento_shopify_ordine`                       | `sales_orders.shopify_updated_at TIMESTAMP(3)` nullable                                                                                                                  |

⭐ **Conclusione**: nessuna colonna tolta o rinominata, nessun `NOT NULL` senza default, nessun
trigger o vincolo nuovo sulle tabelle esistenti. Il client Prisma di `main` seleziona per nome
solo le colonne che conosce e scrive senza le nuove (che hanno default o ammettono `NULL`): **l'API
pubblicata funziona sullo schema nuovo** — e lo ha fatto, sulla copia (§8.3).

⚠️ **Nella finestra fra migration e codice nuovo** l'API vecchia non mantiene `refund_total_minor` e
`shopify_updated_at`: un rimborso Shopify arrivato in quella finestra lascia la somma ferma finché
il codice nuovo non rilegge l'ordine («Importa ordini»). Con l'ambiente di prova e la finestra unica
di §6 è un dettaglio da sapere, non un rischio da gestire.

## 3. I backfill, e il loro ordine rispetto alle migration

Le cinque fasi di `docs/24` §8.5.8, tradotte in atti concreti:

| Fase | Che cosa                                                                               | Con che cosa                                                                                                       | Quando                                   |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1    | schema (23 migration, RLS e REVOKE inclusi)                                            | `npm run prisma:deploy:prova-condivisa --prefix api` (tre cancelli: file indicato, backup < 24 h, host confermato) | per primo                                |
| 2    | identità del negozio: `shopify_shops` + `shopify_connections.shop_id`                  | il **callback OAuth del codice nuovo** (`ShopifyShopIdentityService.registra`): non esiste un comando a parte      | **dopo il deploy** di `main`, per tenant |
| 3    | conversione delle colonne-cache in identità e periodi                                  | `node scripts/backfill-storico-shopify.mjs --env-file=.env.rilascio.local --tenant=<uuid>` (prova) → `--apply`     | dopo la fase 2 di quel tenant            |
| 4    | verifica: ogni id in cache ha un periodo attivo, conteggi, registro `backfill_storico` | è nell'esito del comando (codice 1 se resta un id scoperto); seconda passata a +0 = idempotenza                    | subito dopo                              |
| 5    | `NOT NULL` e unicità globale                                                           | migration futura                                                                                                   | **non in questo rilascio**               |

⛔ **Gli altri due script** (`backfill:catalog-origin`, `backfill:shopify-order-documents`) sono di
rilasci precedenti e non dipendono da queste migration: non fanno parte di questa sequenza.
`stati-ordini-backfill` è la **prova** a due fasi della migration `20260828210000_stati_commerciali_ordini`,
già applicata (è fra le 159): non c'è un backfill da eseguire, resta un residuo di collaudo.

### 3.1 La fase 2 vuole il codice nuovo

Il callback OAuth è l'unico punto che scrive l'identità: finché su Railway gira `main`, un
Disconnetti → Connetti registra la connessione **senza** `shop_id`, e il backfill risponde
`negozio_assente`. Quindi la fase 2 si fa **dopo** il deploy — non prima, non durante.

### 3.2 «Disconnetti» azzera la cache delle sedi — deciso: via A

`ShopifyOAuthService.disconnect()` porta `locations.shopify_location_id` a `NULL` per il tenant
(le colonne-cache dei prodotti restano). Alla riconnessione, la sincronizzazione delle sedi
riconosce una location **dalla cache o dalla coppia attiva**; con la cache azzerata e nessuna coppia
ancora scritta (il backfill non è passato), le 5 sedi tornano «non collegate» e vanno scelte a mano
in Impostazioni → Shopify → Sedi («collega», con la tabella di §1). La scelta scrive coppia e periodo
(B7): il backfill converte poi prodotti e varianti, e la fase 4 trova le sedi coperte dalle scelte.

⭐ **Scelta del proprietario, 14/09/2026: via A** — Disconnetti → Connetti e ricollegamento delle
cinque sedi con la corrispondenza già rilevata. Il pulsante «Rinnova autorizzazione» (che avrebbe
riusato `POST shopify/auth/begin`, già ammesso a negozio collegato con lo stesso dominio, e lasciato
intatta la cache) **non si aggiunge adesso**: resta annotato come possibilità, non come lavoro.

⚠️ **Effetti inevitabili della via A, dichiarati**: «Disconnetti» tenta la revoca del token (finora
sempre 403, e prosegue), cancella le credenziali locali e le sottoscrizioni webhook registrate;
«Connetti» ottiene un token nuovo e **ri-registra le sottoscrizioni** verso `SHOPIFY_APP_URL` di
Railway. Gli ordini arrivati fra Connetti e il ricollegamento delle sedi restano `senza_sede` e
sono ripetibili (`regole-gestionale`, «effetto non applicato ripetibile»). Il tenant del collega
(`Mimmo Test s.r.l`) resta valido senza identità (`5a` di `identita-negozio-shopify`): la sua fase
2 e il suo backfill li fa lui, quando vuole, con lo stesso percorso.

## 4. Il backup ripristinabile — fatto e provato il 14/09/2026

| Passo                   | Esito                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| file di rilascio        | `C:/vf-verifica/api/.env.rilascio.local` (ignorato da Git, `.env.*.local`): **solo** `DATABASE_URL` (pooler 6543, riusata da `api/.env`), `DIRECT_URL` (**derivata**: stesso host, utente e password, porta 5432 in modalità sessione, senza `pgbouncer`) e `BACKUP_ENCRYPTION_PASSPHRASE` nuova. Nessun altro segreto. `prisma migrate status` con quella `DIRECT_URL` elenca le 23 pendenti: la connessione è buona per `migrate deploy` |
| passphrase nuova        | 32 byte casuali in base64 (44 caratteri), **mai stampata**; custodita nel **Gestore credenziali di Windows** come credenziale generica `VestiFlow/backup-passphrase/rilascio-2026-09-14` (Pannello di controllo → Gestore credenziali → Credenziali Windows → Credenziali generiche → Mostra), riletta e confrontata per impronta. **Quella precedente non è stata toccata**: resta in `api/.env` e serve ai backup fatti prima            |
| backup                  | `npm run backup:db -- --env-file api/.env.rilascio.local --output-dir backups/rilascio-2026-09-14` → `database.dump.enc` (444 KB, pg_dump custom + gzip + AES-256-GCM, `pg_dump` dentro `postgres:17` via Docker) e `manifest.json` con `createdAt` **2026-09-14T08:58:22Z**. ⚠️ `prisma:deploy:prova-condivisa` lo accetta per 24 ore: oltre, si rifà (2 minuti)                                                                          |
| ripristino di prova     | `docker compose -f docker-compose.test.yml down -v && up -d --wait` dal progetto che possiede il container (volume nuovo, ruoli `anon`/`authenticated` dall'init), nessuna connessione e nessuna suite in corso; `npm run backup:restore -- --backup-dir … --direct-url <5433> --confirm`: riuscito, 3 errori ignorati tutti di `supabase_vault` (noti)                                                                                    |
| verifica del ripristino | origine ↔ copia: **77 tabelle, 159 migration, 3.569 righe, conteggi per tabella identici**, 76 tabelle con RLS, 0 trigger applicativi — uguali su entrambe (`conteggi-origine-copia.json`)                                                                                                                                                                                                                                                 |

### 4.1 La passphrase — stato al 14/09, 11:45

| Dove                                                           | Stato                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/.env` della copia principale                              | ✅ **nuova** (riga sostituita in posto, fine riga conservate, impronta verificata); la copia `.bak` fatta prima è stata eliminata perché non ignorata da Git                                                                                       |
| GitHub Secret `BACKUP_ENCRYPTION_PASSPHRASE` (`db-backup.yml`) | ✅ **nuova** (impostato per pipe con `gh secret set`, mai stampata)                                                                                                                                                                                |
| vecchia (esposta il 12/09)                                     | custodita **solo** nel Gestore credenziali di Windows come `VestiFlow/backup-passphrase/fino-al-2026-09-14 (vecchia, esposta)`: serve a decifrare gli archivi precedenti — gli artifact CI fino al 14/09 e ogni dump fatto prima — e a nient'altro |
| `api/.env` del collega                                         | ⏸ **da aggiornare da lui** se fa backup in locale: gli va comunicata la nuova (non dalla chat). Nessun file suo è stato toccato                                                                                                                    |

### 4.2 Il backup ordinario (`db-backup.yml`) — era rotto, ora verificato

⛔ **Il run settimanale del 13/09 era FALLITO** («Bersaglio del database non indicato»): il workflow
esporta `BACKUP_DATABASE_URL` dal secret omonimo, che **non esisteva**, quindi arriva **vuota**; in
`run-backup.mjs` il ripiego è `process.env.BACKUP_DATABASE_URL ?? process.env.DIRECT_URL`, e `??`
non ripiega su una stringa vuota. Regressione del commit `3ba4d96e` (07/09); il run del 06/09 era
verde. Il workflow gira sul ramo predefinito `main` (`969c19e8`), quindi con quello script.

**Chiuso il 14/09 senza toccare lo script** (scelta del proprietario: il ripiego resta com'è):

| Passo                               | Esito                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| secret `BACKUP_DATABASE_URL`        | ✅ impostato con la destinazione in modalità sessione (porta 5432) già verificata da `migrate status`; `DIRECT_URL` (03/07) lasciato com'era                                                                                                                                       |
| prova manuale (`workflow_dispatch`) | run `34829388391` su `main` `969c19e8`: **success** in 1m29s — «Bersaglio indicato da: ambiente del processo», database cifrato, storage 10 file (product-media 8, user-avatars 2), artifact `vestiflow-backup-34829388391` 953 KB, scade il 14/10                                 |
| ripristino isolato                  | artifact scaricato con `gh run download`, decifrato con la **passphrase nuova**, `pg_restore` in un database creato apposta (`vestiflow_verifica_backup` sul 5433, poi eliminato): **77 tabelle, 159 migration, 3.569 righe, conteggi identici** all'origine letta in sola lettura |

⏸ **Residuo dichiarato**: il `??` di `run-backup.mjs` resta; con il secret impostato non morde più, ma
un secret vuoto lo farebbe tornare. Da correggere (`||`, con prova) in un lavoro dichiarato
(`DA-FARE` §10g).

## 5. Il deploy Railway, e l'API pubblicata mentre lo schema cambia

**Nel repository** (`api/railway.toml`, `api/Dockerfile`, dal 15-16/06/2026 — ⛔ `docs/RIPRESA`
«Evidenza Railway» diceva «nessun Dockerfile»: guardava la radice, non `api/`):

- build con il Dockerfile (root directory `api`); immagine `node:22-slim`, `npm ci`, `prisma generate`,
  `nest build`;
- avvio: **`npx prisma migrate deploy && node dist/main.js`** — le migration al boot, poi l'API;
- `healthcheckPath = /api/v1/health`, `healthcheckTimeout = 120`, `restartPolicyType = ON_FAILURE`
  (3 tentativi).

**Misurato dall'esterno il 14/09** (`vestiflow-production.up.railway.app`): `/api/v1/health` **200**;
`/api/v1/shopify/setup` **404** e `/api/v1/shopify/connection` **401** senza token → in produzione
gira il **codice vecchio** (la rotta `setup` esiste solo da `develop`). ⭐ È la **sonda di
versione** dei controlli dopo l'avvio: a deploy avvenuto `setup` deve rispondere **401**.

**Letto dai cruscotti il 14/09 (CLI Railway e Firebase, accesso confermato dal proprietario nel
browser; solo letture, nessun valore stampato):**

| Railway             | Misurato                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| progetto / servizio | `vestiflow-backend` · ambiente `production` · servizio **`vestiflow`** (piano hobby, 1 replica, europe-west4) · dominio `vestiflow-production.up.railway.app` = `environment.prod.ts`                                                                                                                                                                                                                                                                                                                                           |
| sorgente            | repo `gestionewebstudio-beep/vestiflow`, **branch `main`**, root directory `api`, config `/api/railway.toml`, builder Dockerfile, nessun `preDeployCommand`/`startCommand` (vale il `CMD` del Dockerfile)                                                                                                                                                                                                                                                                                                                       |
| commit pubblicato   | deployment `06da95c0…` **SUCCESS**, commit **`969c19e8`** («Merge pull request #8»), creato il **07/09 alle 17:30:55Z: lo stesso secondo del merge**                                                                                                                                                                                                                                                                                                                                                                            |
| automatismo         | deploy automatico al push su `main`, **ma solo dopo la CI**: ⛔ qui c'era «senza attendere la CI», dedotto dall'ora di creazione del deployment (lo stesso secondo del merge). Misurato il 14/09 alle 10:16: il deployment nasce subito in stato `WAITING` e resta lì finché i check di GitHub sul commit non sono verdi (~20 minuti), poi costruisce (2 min) e scambia. Il deployment precedente (`9b59a14b`, 06/09) ha applicato al boot le 12 migration di allora: `migrate deploy` + `DIRECT_URL` su Railway funzionano già |
| variabili (25 nomi) | **`DIRECT_URL` presente**: stesso host del pooler, **porta 5432** — la stessa forma del file di rilascio; `DATABASE_URL` 6543 con `pgbouncer`; `SHOPIFY_APP_URL` = dominio Railway; nessuna `BACKUP_*`                                                                                                                                                                                                                                                                                                                          |
| URL del frontend    | da `FRONTEND_URL`/`CORS_ORIGINS`: **`https://vestiflow--gestione-web-studio.europe-west4.hosted.app`**                                                                                                                                                                                                                                                                                                                                                                                                                          |

| Firebase App Hosting    | Misurato                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| progetto / backend      | `gestione-web-studio` · backend **`vestiflow`** (europe-west4, runtime nodejs22, Cloud Run `vestiflow`), URL sopra, risponde 200                                                                                                                                                                             |
| sorgente                | repository collegato `gestionewebstudio-beep-vestiflow` (connessione GitHub di App Hosting), root directory `/`; variabili di build: `VESTIFLOW_API_BASE_URL`, `VESTIFLOW_SUPABASE_URL`, `VESTIFLOW_SUPABASE_ANON_KEY` (chiave pubblicabile), `VESTIFLOW_ENABLE_SHOPIFY`, `VESTIFLOW_ENABLE_BARCODE_SCANNER` |
| bundle pubblicato       | `main-JRPGAZJX.js`; dentro, `apiBaseUrl` = `https://vestiflow-production.up.railway.app/api/v1` ✓                                                                                                                                                                                                            |
| rollout automatico      | **letto dall'API App Hosting** (`traffic.rolloutPolicy`, con le librerie interne della CLI e la sua sessione, soli GET): **`codebaseBranch: main`**, non disabilitato → rollout automatico a ogni push su `main`; traffico al 100 % sulla build `build-2026-09-07-001`                                       |
| ultimo rollout riuscito | `rollout-2026-09-07-001` (306 rollout in tutto): creato **07/09 17:30:56Z**, concluso 17:34:24Z, stato SUCCEEDED; build `build-2026-09-07-001` READY dal commit **`969c19e8`** su `main` («Merge pull request #8», commit delle 17:23:03Z). ⭐ Frontend e API pubblicano lo **stesso commit**                |

⭐ **Il commit distribuito, dopo il rilascio**: per l'API `railway deployment list` (campo
`commitHash`); per il frontend la stessa lettura dell'API App Hosting (ultimo rollout SUCCEEDED → build → `commit.hash`; `apphosting-lettura.cjs` nello scratchpad della sessione, ripetibile) o il cruscotto, più una verifica pubblica: il nome del
bundle `main-*.js` in `index.html` deve coincidere con quello della build di produzione locale
del commit unito (oggi `develop` produce `main-F3D2XJ45.js` e il pubblicato è `main-JRPGAZJX.js`:
diverso, com'è giusto prima del rilascio). La sonda `setup` → 401 resta una verifica in più.

**Che cosa succede al merge in `main`:**

1. Railway costruisce l'immagine nuova e avvia un container nuovo **accanto** a quello vecchio;
   il vecchio serve finché il nuovo non passa l'healthcheck. Il frontend (Firebase App Hosting,
   `apphosting.yaml` tolto dal repo il 16/06: configurazione nel solo cruscotto) fa il proprio
   rollout da `main`, se così configurato.
2. Il container nuovo esegue `migrate deploy`. **Con le 23 già applicate** (passo 2 di §6): «No
   pending migrations to apply», parte l'API, healthcheck, scambio. Se **non** lo fossero, le
   applicherebbe lui: stesso SQL, ma senza backup verificato né anteprima dello `status`, e un
   errore a metà lascia la migration marcata **non finita** — il container esce, i 3 riavvii
   falliscono allo stesso punto, il vecchio resta in servizio e il deploy successivo è bloccato
   finché qualcuno non fa `migrate resolve`. È la ragione per applicarle prima, con la procedura
   guidata.
3. Durante il passaggio l'API vecchia lavora sullo schema nuovo (§2, §8.3). Finestra frontend
   nuovo ↔ API vecchia: pochi minuti, solo le rotte nuove (Impostazioni → Shopify) rispondono 404;
   con la precisazione del proprietario è un'interruzione accettabile.
4. `security.yml` (RLS reale) e `ci.yml` girano sul push a `main`: la RLS legge le tabelle dallo
   schema Prisma, quindi copre anche le tabelle nuove.

## 6. La sequenza definitiva — una finestra sola

Prerequisiti già soddisfatti il 14/09: file di rilascio (§4), passphrase nuova ovunque (§4.1),
backup ordinario riparato e verificato (§4.2), backup e ripristino del rilascio provati, prova
generale sulla copia (§8), letture Railway e Firebase (§5), sonda di versione. Manca solo il via.

| #   | Passo                                                                                                                                                                                         | Chi      | Verifica                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | via alla finestra                                                                                                                                                                             | titolare | letture fatte: Railway e App Hosting seguono `main` con deploy/rollout automatici, entrambi al commit `969c19e8`; `DIRECT_URL` presente su Railway                                                                                                                                                      |
| 1   | backup fresco del condiviso, se quello del 14/09 ha più di 24 ore (stesso comando di §4)                                                                                                      | Claude   | `manifest.json` nuovo; dump presente                                                                                                                                                                                                                                                                    |
| 2   | **23 migration sul condiviso**: `node scripts/prisma-deploy-prova-condivisa.mjs --env-file .env.rilascio.local --backup ../backups/<cartella> --conferma aws-0-eu-west-1.pooler.supabase.com` | Claude   | `status` mostra 23 pendenti prima; deploy verde (sulla copia: 3,4 s); censimento §1 riletto: 182 applicate, 90 tabelle, 17 trigger, `refund_total_minor` riempito; API vecchia: `health` 200 ed elenco ordini leggibile                                                                                 |
| 3   | merge `develop` → `main` (merge commit, cronologia conservata; da fuori le copie locali)                                                                                                      | Claude   | CI e RLS verdi su `main`; Railway: `deployment list` con il **commit del merge** in SUCCESS, log con «No pending migrations», healthcheck passato; sonda `/api/v1/shopify/setup` → **401**; App Hosting: rollout concluso, commit nel cruscotto, bundle `main-*.js` uguale alla build locale del commit |
| 4   | controlli dopo l'avvio                                                                                                                                                                        | entrambi | `health` 200; `migrate status` 0 pendenti (sola lettura); login, Ordini (colonne Rettifiche e Tot. aggiornato), Prodotti, Impostazioni → Shopify «Connessione» e «Situazione attuale»; log Railway senza 500 né «column does not exist»; sottoscrizioni webhook come in `backups/webhook/`              |
| 5   | **fase 2, via A** sul tenant del titolare: «Disconnetti Shopify» → «Connetti Shopify» (OAuth del titolare) → Sedi: **cinque «collega»** dalla tabella di §1                                   | titolare | `shopify_connections.shop_id` valorizzato (lettura); 5 coppie con periodo attivo; sottoscrizioni webhook ri-registrate verso Railway (`webhook:sottoscrizioni`)                                                                                                                                         |
| 6   | **backfill** del tenant: `backfill-storico-shopify.mjs --env-file=.env.rilascio.local --tenant=<uuid>` (prova) → `--apply` → `--apply` di nuovo                                               | Claude   | prova: «da convertire: 55 prodotti, 71 varianti, 0 sedi» (le sedi le hanno scritte le scelte); apply: 55/71, **+0 alla seconda**, «ogni id in cache ha un periodo attivo», riga `backfill_storico` nel registro                                                                                         |
| 7   | chiusura: censimento §1 riletto, `DA-FARE` §10g e `RIPRESA` aggiornati con le misure della finestra                                                                                           | Claude   | documenti allineati                                                                                                                                                                                                                                                                                     |
| 8   | il tenant del collega: passi 5-6 quando lo decide lui (125/222/3), senza toccarlo prima                                                                                                       | collega  | come sopra                                                                                                                                                                                                                                                                                              |

⛔ **Non c'è dentro**: fase 5 di §8.5.8, prova 7 sul negozio vero, rotazione del token Shopify,
cambi di ramo nella copia di lavoro del titolare.

## 7. Aperto — ciò che manca davvero

- L'ora della finestra: il backup del rilascio del 14/09 vale fino alle 08:58Z del 15/09; dopo, si rifà.
- Gli accessi CLI di Railway e Firebase restano attivi fino alla fine delle verifiche del rilascio:
  se conservarli o toglierli (`railway logout`, `firebase logout`) si decide alla fine. I token sono
  in `%USERPROFILE%\\.railway\\config.json` e in `~/.config/configstore/firebase-tools.json`, in chiaro.
- Al collega: la passphrase nuova dei backup, se ne fa in locale (§4.1).

## 8. La prova sulla copia — eseguita il 14/09/2026, 10:40–11:10

Copia = il ripristino di §4 sul 5433 (`vestiflow_test`), riservato alla prova: nessuna suite avviata,
nessuna connessione esterna, container ricreato apposta. Ogni API avviata contro la copia ha un
ambiente **neutralizzato** (`api/.env.copia.local`, ignorato da Git): emittente JWT locale con
segreto locale, `SUPABASE_SERVICE_ROLE_KEY` vuota (nessun client Supabase), chiavi Shopify e chiave
di cifratura dei token **vuote** (nessuna chiamata a Shopify possibile), token dell'API firmato
HS256 in locale per il titolare del tenant di prova — la stessa forma della suite d'integrazione.
Nei log delle due API: **0 chiamate uscenti** verso `myshopify.com` o `supabase.co`.

### 8.1 Le 23 migration

`npm run prisma:deploy:test --prefix api`: **3,4 secondi**, «All migrations have been successfully
applied». Dopo: 182 migration (0 non finite), **90 tabelle** (77 + 13 nuove), **17 trigger**
applicativi, `refund_total_minor` riempito su **5 ordini** per **31.501** centesimi = somma di
`sales_order_refunds`, colonna generata `current_total_minor` coerente su tutte le 40 righe.

### 8.2 Fase 2 simulata (solo copia)

Riga `shopify_shops` per «Test Amato Luigi» con il **GID vero** `gid://shopify/Shop/99462054183`
(letto dal 5434 della prova 6) e `shop_id` sulla connessione; per il tenant del collega una riga con
GID **fittizio** (`…/Shop/1`), usata solo per la prova senza scrittura. Sul condiviso la fase 2 la
fa il callback OAuth (via A), non l'SQL.

### 8.3 API VECCHIA (`main` `969c19e8`, ricompilata in `C:/vf-stabile`) sullo schema NUOVO

| Chiamata                              | Esito                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/me`                        | 200, ruolo `owner`                                                                                                         |
| `GET /sales-orders`                   | 200, 33 ordini del tenant (righe con `subtotalMinor`, `totalMinor`: le colonne nuove ignorate)                             |
| `GET /products`                       | 200, 55 prodotti                                                                                                           |
| `GET /inventory/locations`            | 200, 5 sedi, 5 collegate                                                                                                   |
| `GET /shopify/connection`             | 200, `connected`                                                                                                           |
| `GET /shopify/setup`                  | 404 (rotta inesistente su `main`: è la sonda di §5)                                                                        |
| `GET /inventory/levels`, `/movements` | 200                                                                                                                        |
| `POST /sales-orders/manual/save`      | **201**: nel database `total 1000`, `refund_total 0` (default), `current_total 1000` (generata), `shopify_updated_at null` |

0 righe di errore nel log dell'API. ⭐ La compatibilità non è più una lettura dei file SQL: è misurata.

### 8.4 API NUOVA (`develop` `240d81c8`) sullo schema NUOVO

Le stesse chiamate: `GET /sales-orders` espone `refundTotalMinor`, `currentTotalMinor`,
`shopifyUpdatedAt`, `refundCount`; `GET /products` espone `shopifyProductType`; scrittura 201 con
gli stessi valori nel database. `GET /shopify/setup` → **503**: il percorso legge le location dal
negozio e le chiavi Shopify sono vuote apposta — è la neutralizzazione che funziona, non un difetto
(in produzione, con le chiavi, risponde 200). 1 riga di errore nel log, quella.

### 8.5 Backfill sulla copia

| Esecuzione                                  | Esito                                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prova (senza scrivere), tenant del titolare | bersaglio dichiarato «LOCALE · 5433 · vestiflow_test»; nessuna anomalia bloccante; «da convertire: 55 prodotti, 71 varianti, 5 sedi»                                                                                             |
| `--apply`                                   | identità prodotto 0 → **55**, periodi 55, identità variante 0 → **71**, periodi 71, coppie sede 0 → **5**, periodi 5; ✅ «ogni id in cache ha un periodo attivo»; registro `backfill_storico`: 2 righe (`tentativo`, `riuscita`) |
| `--apply` di nuovo (e una terza volta)      | «prodotti +0 (55 già, 0 rifiutati) · varianti +0 (71 già) · sedi +0 (5 già)»: **nessun doppione**, conteggi invariati                                                                                                            |
| prova, tenant del collega (GID fittizio)    | nessuna anomalia bloccante; «da convertire: 125 prodotti, 222 varianti, 3 sedi» — non applicato: non serve, e i suoi tenant non si toccano                                                                                       |

⚠️ **Che cosa la prova NON copre**: le cinque scelte «collega» delle sedi dopo Disconnetti (via
A) — sulla copia non c'è un negozio da cui leggere le location; quel percorso è dimostrato dalla
suite (`prima-connessione-percorso` caso 6, B7) e dal collaudo del 13/09. Nella prova le sedi sono
entrate dal backfill con la cache intatta: sul condiviso entreranno dalle scelte, e il backfill le
troverà già coperte.

La copia resta sul 5433 finché una suite d'integrazione non lo svuota; `backups/rilascio-2026-09-14/`
e `conteggi-origine-copia.json` restano sul PC.

## 9. La finestra — ESEGUITA il 14/09/2026, 10:13–13:03 (ora locale 12:13–15:03)

| #   | Passo                      | Misurato                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | backup fresco              | `backups/rilascio-2026-09-14-finestra` (10:13:15Z, 444 KB), ripristinato in un database isolato: 159 migration, 77 tabelle, 40 ordini, 288 prodotti, 2 connessioni                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | 23 migration sul condiviso | `prisma-deploy-prova-condivisa` alle 10:14Z: 23 applicate, **182/182**, 0 non finite, 90 tabelle, 17 trigger, `refund_total_minor` riempito su 5 ordini (31.501 = somma dei rimborsi), colonna generata coerente; dati invariati; API vecchia sana (health 200, rotte protette 401)                                                                                                                                                                                                                                                                                              |
| 3   | merge `develop` → `main`   | PR #11, merge commit **`0abcb1c2`** (10:16:05Z), albero identico a `240d81c8`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | deploy                     | App Hosting: `rollout-2026-09-14-001` SUCCEEDED alle 10:20Z dal commit `0abcb1c2`, bundle `main-F3D2XJ45.js` = build locale. Railway: deployment `a10e4135` **SUCCESS** alle 10:38Z (WAITING finché la CI di `main` non è passata, poi build), commit `0abcb1c2`; sonda `shopify/setup` 404 → **401**; `migrate status` «up to date»; CI e RLS verdi su `main`; sottoscrizioni webhook invariate (3)                                                                                                                                                                             |
| 5   | fase 2, via A (titolare)   | Disconnetti → Connetti alle 10:50Z: **identità acquisita** (`shopify_shops` con `gid://shopify/Shop/99462054183`, `shop_id` valorizzato). ⚠️ Webhook **8 su 10**: `fulfillment_orders/order_routing_complete` e `fulfillment_orders/moved` non registrati — l'app ha chiesto i 12 permessi della variabile `SHOPIFY_SCOPES` di Railway, che **non contiene `read_merchant_managed_fulfillment_orders`** (in `.env.example` e nel collaudo c'era). Poi le cinque scelte «Collega a «…»» (10:57–10:58Z): 5 coppie, 5 periodi attivi, cache rimessa, id identici alla tabella di §1 |
| 6   | backfill del tenant        | prova: «55 prodotti, 71 varianti, 0 sedi» (le 5 già collegate dalle scelte); `--apply`: +55 / +71 / sedi +0; **seconda `--apply`: +0 ovunque**; 55 GID distinti; «ogni id in cache ha un periodo attivo»; registro `backfill_storico`: tentativo + riuscita. Il tenant del collega: intatto (125 id in cache, nessuna identità, nessun negozio registrato)                                                                                                                                                                                                                       |

### 9.1 Ciò che il rilascio ha lasciato aperto

| Aperto                                                                                                                                                                                                                 | Stato / prossimo passo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ **permesso `read_merchant_managed_fulfillment_orders`** — chiuso il 14/09 alle 11:51Z (fa parte della sincronizzazione approvata: le sedi degli ordini vengono dai fulfillment order)                               | verificato separatamente prima: Railway 11 ambiti, token 12 (Shopify `access_scopes`), 8 sottoscrizioni. Aggiunto l'ambito **in coda** a `SHOPIFY_SCOPES` su Railway (gli altri invariati, valore via stdin), ridistribuzione automatica `ed76610f` SUCCESS (stesso commit); il token non può acquisire un ambito senza Shopify → nuova autorizzazione del proprietario (Disconnetti → Connetti dal sito pubblicato): **token con 13 ambiti**, **10 sottoscrizioni** verso Railway (con `fulfillment_orders/moved` e `order_routing_complete`), nessun errore sulla connessione |
| ✅ le 5 sedi: flag `error` residuo azzerato                                                                                                                                                                            | la sincronizzazione eseguita dal callback della seconda autorizzazione (lo stesso `syncFromShopify` di «Sincronizza location») ha riconosciuto le sedi dalla coppia attiva: **5 coppie invariate** (stessi GID), 5 periodi attivi, cache rimessa, stato `synced`, errore `null`. Nessuna scelta rifatta                                                                                                                                                                                                                                                                         |
| **gli 11 ordini Shopify storici non hanno una sede** (`location_id` nullo, `shopify_updated_at` nullo, ultimo aggiornamento 14/08: mai riletti dal codice nuovo); nessuna spedizione registrata, nessun movimento oggi | è lo stato di prima del rilascio, letto e non modificato. Gli ordini **nuovi** prendono la sede dal fulfillment order (notifiche ora registrate); quelli storici la prenderebbero solo da «Importa ordini» (rilettura con i suoi effetti: impegni sugli aperti) — decisione del proprietario, non eseguita                                                                                                                                                                                                                                                                      |
| **Quantità «limitato»: 338 combinazioni variante/sede da allineare** (Sincronizzazione automatica, dopo la riconnessione)                                                                                              | conseguenza attesa delle coppie appena scritte: per quelle combinazioni non esiste ancora uno stato di invio e la quantità **non parte** finché non si esegue «Allinea giacenze su Shopify» — che è la **partenza VestiFlow → Shopify sul negozio vero (prova 7), mai collaudata**. ⛔ Non eseguito: via a parte del proprietario                                                                                                                                                                                                                                               |
| Impostazioni → Shopify: grafica e disposizione                                                                                                                                                                         | `DA-FARE` §10g (visto dal proprietario durante la fase 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| il tenant del collega                                                                                                                                                                                                  | fasi 5-6 quando decide lui; nessun intervento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| accessi CLI Railway e Firebase                                                                                                                                                                                         | ancora attivi; conservarli o toglierli si decide con il proprietario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
