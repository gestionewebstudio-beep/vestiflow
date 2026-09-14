# 30 — Aggiornamento del database condiviso e passaggio a `main`

_Preparazione in **sola lettura**, 14/09/2026, dopo il merge di `feature/shopify-link-history` in
`develop` (PR #9 → `1f85c7d3`, PR #10 → `240d81c8`, CI verde). Nessuna migration, nessun backfill,
nessun merge in `main`, nessun deploy eseguito: qui c'è ciò che è stato **misurato** e la sequenza
**proposta**. Ogni scrittura sul condiviso resta un via a parte, per quella esecuzione
(`regole-qualita`, «Database»)._

## 0. Che cosa vale oggi — la tabella decide, il resto argomenta

| Decisione / fatto                                                                                                                                                                                                                 | Dove |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Le migration di `develop` non applicate al condiviso sono **23**, non nove: **tutte** quelle del ramo, dalla `20260907000000` alla `20260913220000`. Applicate 159, ultima il 06/09 alle 18:59Z; nessuna estranea                 | §1   |
| Per le tabelle che l'API pubblicata conosce le 23 sono **additive** (colonne nullable o con default, enum, un `UPDATE` su 40 righe): l'API di `main` continua a funzionare sullo schema nuovo                                     | §2   |
| Il solo backfill di questo rilascio è `backfill:storico-shopify` (fasi 3-4 di `docs/24` §8.5.8); viene **dopo** la fase 2, che passa dal callback OAuth del **codice nuovo** — quindi dopo il deploy                              | §3   |
| «Disconnetti» azzera la colonna-cache delle sedi: la fase 2 fatta con Disconnetti → Connetti costa il ricollegamento a mano delle sedi (5 + 3). Alternativa: un pulsante «Rinnova autorizzazione» (decisione aperta)              | §3.2 |
| Backup e ripristino esistono e sono provati: `backup:db` (pg_dump via Docker `postgres:17`, cifrato) e `backup:restore` su un database locale; la prova di migrazione + backfill si fa sulla **copia** (5433) prima del condiviso | §4   |
| Railway: `api/Dockerfile` esegue `npx prisma migrate deploy && node dist/main.js` al boot, healthcheck `/api/v1/health` (120 s). Applicando le migration **prima** del merge in `main`, il boot non trova nulla da applicare      | §5   |
| Sequenza: backup → prova sulla copia → migration sul condiviso → merge `main` → controlli → fase 2 → backfill → verifica                                                                                                          | §6   |

## 1. Misurato sul condiviso, in sola lettura (14/09/2026, 08:23Z)

Transazione dichiarata `READ ONLY`, soli cataloghi e `COUNT`; client Prisma di `develop`
(`C:/vf-verifica`), `DATABASE_URL` del pooler letta dall'ambiente e mai stampata.

| Cosa                                        | Valore                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| server                                      | PostgreSQL **17.6** · database 22 MB · 77 tabelle in `public` · 9 connessioni (1 attiva)                                                                                           |
| estensioni                                  | `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`                                                                                                         |
| `_prisma_migrations`                        | **159 applicate**, 0 annullate, 0 non finite; ultima `20260906120000_ritiro_doppioni_sintetici_pagamento` (06/09, 18:59Z)                                                          |
| `api/prisma/migrations` (develop)           | **182** cartelle                                                                                                                                                                   |
| **pendenti**                                | **23** — tutte quelle del ramo, `20260907000000_shopify_link_history` → `20260913220000_ultimo_aggiornamento_shopify_ordine`                                                       |
| estranee (nel db, non in develop)           | **0**: il collega non ha applicato nulla oltre `main`                                                                                                                              |
| tabelle/colonne delle pendenti già presenti | **nessuna** (`shopify_shops`, `shopify_setups`, `sales_order_shipments` assenti; `sales_orders.refund_total_minor`, `shopify_updated_at`, `products.shopify_product_type` assenti) |
| trigger non interni                         | 5, tutti di Supabase (`realtime`, `storage`): nessun trigger applicativo — arrivano con le pendenti                                                                                |

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

Le sedi collegate, per il ricollegamento a mano se la fase 2 passa da «Disconnetti» (§3.2):

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
pubblicata funziona sullo schema nuovo**, prima e durante il deploy. Le migration sono già state
applicate con `migrate deploy` su 5433, 5434 e sul PostgreSQL effimero della CI: il file SQL è
provato, la macchina cambia.

⚠️ **Nella finestra fra migration e codice nuovo** l'API vecchia non mantiene `refund_total_minor` e
`shopify_updated_at`: un rimborso Shopify arrivato in quella finestra lascia la somma ferma finché
il codice nuovo non rilegge l'ordine («Importa ordini»). La finestra va tenuta corta — stessa
sessione — ed è un ambiente di prova senza traffico.

## 3. I backfill, e il loro ordine rispetto alle migration

Le cinque fasi di `docs/24` §8.5.8, tradotte in atti concreti:

| Fase | Che cosa                                                                               | Con che cosa                                                                                                       | Quando                                   |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 1    | schema (23 migration, RLS e REVOKE inclusi)                                            | `npm run prisma:deploy:prova-condivisa --prefix api` (tre cancelli: file indicato, backup < 24 h, host confermato) | per primo                                |
| 2    | identità del negozio: `shopify_shops` + `shopify_connections.shop_id`                  | il **callback OAuth del codice nuovo** (`ShopifyShopIdentityService.registra`): non esiste un comando a parte      | **dopo il deploy** di `main`, per tenant |
| 3    | conversione delle colonne-cache in identità e periodi                                  | `npm run backfill:storico-shopify --prefix api -- --env-file=… --tenant=<uuid>` (prova) → `…:apply`                | dopo la fase 2 di quel tenant            |
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

### 3.2 «Disconnetti» azzera la cache delle sedi — la decisione da prendere

`ShopifyOAuthService.disconnect()` porta `locations.shopify_location_id` a `NULL` per il tenant
(le colonne-cache dei prodotti restano). Alla riconnessione, la sincronizzazione delle sedi
riconosce una location **dalla cache o dalla coppia attiva**; con la cache azzerata e nessuna coppia
ancora scritta (il backfill non è passato), le 5 sedi tornano «non collegate» e vanno scelte a mano
in Impostazioni → Shopify → Sedi («collega», con la tabella di §1). La scelta scrive coppia e periodo
(B7): il backfill non ha poi nulla da convertire per le sedi, e la fase 4 le trova coperte.

| Via                                                    | Costo                                                                                                                                                                                                                                                  | Codice nuovo                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **A** — Disconnetti → Connetti, poi 5 «collega» a mano | 5 scelte del titolare (3 per il collega), rischio di abbinare male; ordini arrivati nel frattempo senza sede (ripetibili)                                                                                                                              | nessuno                                                           |
| **B** — «Rinnova autorizzazione» a negozio collegato   | un pulsante nella scheda Connessione che chiama `POST shopify/auth/begin` (già ammesso a negozio collegato con lo stesso dominio): il callback scrive l'identità, la sincronizzazione delle sedi le riconosce **dalla cache** e scrive le coppie da sé | una PR piccola (frontend), CI, merge in `develop` prima di `main` |

⚠️ **Il negozio del collega** (`Mimmo Test s.r.l`) resta valido senza identità (`5a` di
`identita-negozio-shopify`): la sua fase 2 e il suo backfill li fa lui, quando vuole, con lo stesso
percorso. Niente si rompe nel frattempo: il codice legge ancora le colonne-cache.

## 4. Il backup ripristinabile — come si crea, come si prova

Strumenti già nel repository (`scripts/backup/`), provati il 12/09 sul condiviso di allora
(75 tabelle su 75 con conteggi identici dopo il ripristino):

| Passo               | Comando                                                                                                                                                                                                                                                                                                                                              | Note                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| backup              | `npm run backup:db -- --env-file api/.env.rilascio.local --output-dir backups/rilascio-<data>`                                                                                                                                                                                                                                                       | `pg_dump --format=custom` eseguito **dentro `postgres:17` via Docker** (`pg-tools.mjs`: nessun client Postgres sul PC), stessa major del server (17.6); dump cifrato AES-256-GCM + `manifest.json` con `createdAt` |
| ripristino di prova | `npm run backup:restore -- --backup-dir backups/rilascio-<data> --direct-url <URL del 5433/vestiflow_test> --confirm`                                                                                                                                                                                                                                | `pg_restore --clean --if-exists` dal container, con `localhost` riscritto in `host.docker.internal`; tollera i soli errori noti dell'estensione; **5433 è il database delle suite**: nessuna suite in corso        |
| verifica            | `_prisma_migrations` = 159 · 77 tabelle · conteggi per tabella **identici** all'origine (letti in sola lettura, come in §1)                                                                                                                                                                                                                          | la prova è il confronto, non l'esito zero di `pg_restore`                                                                                                                                                          |
| prova generale      | sulla copia: `npm run prisma:deploy:test --prefix api` (le 23), poi fase 2 **simulata** (riga `shopify_shops` con il GID vero `gid://shopify/Shop/99462054183`, letto dal 5434 della prova 6, e `shop_id` sulla connessione del tenant del titolare — SQL sulla sola copia), poi `backfill:storico-shopify` prova → `--apply` → seconda passata a +0 | prova migration **e** backfill sui dati veri prima di toccare il condiviso, come chiedeva `docs/28` §2-quater                                                                                                      |

Prerequisiti misurati il 14/09: immagine `postgres:17` presente (645 MB); `backups/` ignorata da Git
(`/backups`); `api/.env.rilascio.local` **assente** — lo crea il titolare con `DATABASE_URL` (pooler, 6543) e **`DIRECT_URL` (5432, sessione)** del progetto Supabase, dalle variabili di Railway o dal
cruscotto Supabase; nessun backup del database su questo PC (`backups/` contiene solo le fotografie
delle sottoscrizioni webhook); il workflow settimanale `db-backup.yml` (domenica 03:15Z, artifact per
30 giorni) non sostituisce il backup della sequenza: lo script pretende una cartella locale con
`manifest.json` fatta da meno di 24 ore.

⚠️ **La passphrase** (`BACKUP_ENCRYPTION_PASSPHRASE`) è quella esposta il 12/09 (`docs/28` §0): la
sostituzione proposta lì non risulta eseguita. Non blocca il backup; è una decisione del titolare
da prendere **prima** di cifrare un altro dump con il valore esposto.

## 5. Il deploy Railway, e l'API pubblicata mentre lo schema cambia

**Nel repository** (`api/railway.toml`, `api/Dockerfile`, dal 15-16/06/2026 — ⛔ `docs/RIPRESA`
«Evidenza Railway» diceva «nessun Dockerfile»: guardava la radice, non `api/`):

- build con il Dockerfile (root directory `api`); immagine `node:22-slim`, `npm ci`, `prisma generate`,
  `nest build`;
- avvio: **`npx prisma migrate deploy && node dist/main.js`** — le migration al boot, poi l'API;
- `healthcheckPath = /api/v1/health`, `healthcheckTimeout = 120`, `restartPolicyType = ON_FAILURE`
  (3 tentativi).

**Dal cruscotto** (non deducibile dal repo, da rileggere prima del via): Source → branch `main` e
Auto Deploy; Deployments → ultimo commit `969c19e8`; Variables → `DATABASE_URL` e `DIRECT_URL` del
condiviso (senza `DIRECT_URL` il `migrate deploy` al boot fallisce con P1012 prima di connettersi).

**Che cosa succede al merge in `main`:**

1. Railway costruisce l'immagine nuova e avvia un container nuovo **accanto** a quello vecchio;
   il vecchio serve finché il nuovo non passa l'healthcheck. Il frontend (Firebase App Hosting,
   `apphosting.yaml` tolto dal repo il 16/06: configurazione nel solo cruscotto) fa il proprio
   rollout da `main`, se così configurato — da confermare lì.
2. Il container nuovo esegue `migrate deploy`. **Se le 23 sono già applicate** (passo 3 di §6):
   «No pending migrations to apply», parte l'API, healthcheck, scambio. Se **non** lo sono, le
   applica lui: stesso SQL, ma senza backup verificato né anteprima dello `status`, e un errore a
   metà lascia la migration marcata **non finita** in `_prisma_migrations` — il container esce, i 3
   riavvii falliscono allo stesso punto, il vecchio resta in servizio e il deploy successivo è
   bloccato finché qualcuno non fa `migrate resolve`. È la ragione per applicarle prima, con la
   procedura guidata.
3. Durante tutto il passaggio l'API vecchia lavora sullo schema nuovo (§2: additivo). Finestra
   frontend nuovo ↔ API vecchia: pochi minuti, solo le rotte nuove (Impostazioni → Shopify) rispondono
   404; l'inverso (frontend vecchio ↔ API nuova) non ha effetti.
4. `security.yml` (RLS reale) e `ci.yml` girano sul push a `main`: la RLS legge le tabelle dallo
   schema Prisma, quindi copre anche le tabelle nuove.

## 6. La sequenza proposta — una sola, in ordine

| #   | Passo                                                                                                                                                                                                                               | Chi               | Via    | Verifica                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `api/.env.rilascio.local` (DATABASE_URL + DIRECT_URL del condiviso); letture del cruscotto Railway (branch, auto deploy, variabili) e Firebase (rollout da `main`); decisione A/B di §3.2; (facoltativo) rotazione della passphrase | titolare          | —      | `npm run env:destinazioni api/.env.rilascio.local` mostra host e porta, mai valori; `check:bersaglio-condiviso` verde                                                                                                                                                                                                     |
| 1   | backup del condiviso                                                                                                                                                                                                                | Claude            | ✅     | `manifest.json` con database e `createdAt`; dump presente                                                                                                                                                                                                                                                                 |
| 2   | ripristino sul 5433 e confronto dei conteggi; poi le 23 migration e il backfill **sulla copia**                                                                                                                                     | Claude            | ✅     | 159 → 182 applicate; backfill: 55 identità prodotto, 71 varianti, 5 sedi coperte, seconda passata +0                                                                                                                                                                                                                      |
| 3   | **migration sul condiviso** con `prisma:deploy:prova-condivisa` (`--backup` del passo 1, `--conferma <host>`)                                                                                                                       | Claude            | ⛔ via | `status` mostra 23 pendenti prima, 0 dopo; §1 riletto: 182 applicate, tabelle nuove presenti, `refund_total_minor` riempito; API vecchia: health 200, elenco ordini leggibile                                                                                                                                             |
| 4   | merge `develop` → `main` (merge commit, cronologia conservata)                                                                                                                                                                      | Claude            | ⛔ via | CI e RLS verdi su `main`; Railway: log del deploy con «No pending migrations», healthcheck passato; App Hosting: rollout concluso                                                                                                                                                                                         |
| 5   | controlli dopo l'avvio                                                                                                                                                                                                              | Claude + titolare | —      | `GET /api/v1/health` 200; `migrate status` 0 pendenti (sola lettura); login, Ordini, Prodotti, Impostazioni → Shopify «Connessione» e «Situazione attuale» leggibili; sottoscrizioni webhook del negozio invariate (`webhook:sottoscrizioni` contro `backups/webhook/`); log Railway senza 500 né «column does not exist» |
| 6   | **fase 2** sul tenant del titolare (A o B di §3.2)                                                                                                                                                                                  | titolare          | —      | `shopify_connections.shop_id` valorizzato; con A: 5 «collega» dalla tabella di §1                                                                                                                                                                                                                                         |
| 7   | **backfill** del tenant: prova → `--apply`                                                                                                                                                                                          | Claude            | ⛔ via | codice 0; identità/periodi = 55/71/5; seconda passata +0; riga `backfill_storico` nel registro                                                                                                                                                                                                                            |
| 8   | il tenant del collega: fasi 6-7 quando lo decide lui                                                                                                                                                                                | collega           | suo    | come sopra, con i suoi numeri (125/222/3)                                                                                                                                                                                                                                                                                 |

⛔ **Non c'è dentro**: fase 5 di §8.5.8, prova 7 sul negozio vero, rotazione del token Shopify,
cambi di ramo nella copia di lavoro del titolare.

## 7. Aperto, da decidere o confermare prima del via

- A oppure B per la fase 2 (§3.2) — B è una PR piccola in più; A è cinque scelte a mano.
- Le tre letture del cruscotto Railway e quella di Firebase (§5): senza, la sequenza si ferma al
  passo 3.
- La passphrase esposta (§4).
- Se, dopo il passo 3, il merge in `main` non segue nella stessa sessione, l'API vecchia resta sul
  nuovo schema senza mantenere le due colonne nuove (§2): ammesso, ma va detto.
