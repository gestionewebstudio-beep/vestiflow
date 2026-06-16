# VestiFlow — Backup, ripristino e sicurezza infrastruttura

> **Creato:** 16 giugno 2026  
> **Stack attuale:** Firebase App Hosting (frontend) · Railway (API NestJS) · Supabase (PostgreSQL + Auth)  
> **Piano Supabase:** Free (nessun backup gestito dal pannello)

Questo documento è la **roadmap operativa** per proteggere dati e servizi contro cancellazioni accidentali, guasti del provider, ransomware e compromissione account.  
Non richiede subito infrastruttura duplicata su tre cloud: richiede **copie verificabili**, **account protetti** e un **piano di ripristino** scritto.

**Documenti correlati:**

- `SICUREZZA-PENDENTE.md` — checklist sicurezza applicativa e configurazioni manuali
- `api/.env.example` — elenco variabili da documentare in modo sicuro

Usa le checkbox `[ ]` / `[x]` man mano che completi ogni fase.

---

## 1. Principi guida

### Regola 3-2-1 (obiettivo minimo)

| Regola               | Significato per VestiFlow                                 |
| -------------------- | --------------------------------------------------------- |
| **3 copie**          | DB produzione + backup A + backup B                       |
| **2 supporti**       | Supabase + object storage esterno (R2/S3/B2)              |
| **1 copia off-site** | Bucket su account/cloud **diverso** da Supabase e Railway |

### Cosa **non** serve (fase attuale)

- **Non** serve avere Firebase, Railway e Supabase “gemelli” sempre accesi (multi-cloud attivo).
- **Non** basta confidare solo nei backup Supabase Pro senza copia esterna.
- **Non** è backup: export manuale sporadico, copia su OneDrive del PC, o solo `git` (il codice ≠ i dati Postgres).

### Cosa **serve**

- Backup **automatici** del database, **cifrati**, fuori da Supabase.
- **Inventario segreti** (password manager, non file nel repo).
- **MFA** su tutti i pannelli (GitHub, Supabase, Railway, Firebase, Shopify).
- **Runbook di disaster recovery** (sezione 8) provato almeno una volta.
- **Rotazione segreti** programmata e dopo ogni sospetto leak.

---

## 2. Mappa dei rischi per componente

| Componente            | Cosa contiene                            | Rischio principale                                   | Protezione primaria                               |
| --------------------- | ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| **Supabase Postgres** | Prodotti, stock, ordini, clienti, tenant | Cancellazione / corruzione dati, account compromesso | `pg_dump` esterno + (futuro) Supabase Pro         |
| **Supabase Auth**     | Utenti, MFA, sessioni                    | Stesso account; leak service role                    | RLS + backup Auth metadata; MFA; rotazione chiavi |
| **Railway API**       | Logica business, token Shopify cifrati   | Deploy malevolo, env leak                            | Git + secrets in Railway; redeploy pulito         |
| **Firebase Hosting**  | Frontend Angular statico                 | Account compromesso, hosting down                    | Git + CI; redeploy su nuovo progetto o altro CDN  |
| **GitHub**            | Codice sorgente, CI secrets              | Repo privato compromesso                             | MFA, branch protection, audit log                 |

**Nota:** Il codice su GitHub è già la “ricetta” per ricostruire API e frontend. Il **dato irreplaceable** è il **database Postgres** (+ configurazione Auth/redirect URL).

---

## 3. Fase 0 — Adesso (Supabase Free, pre–primo cliente pagante)

Obiettivo: copie minime e abitudini corrette **senza costi significativi**.

### 3.1 Account e accessi (tutti e tre i provider)

- [ ] **MFA attivo** su: GitHub, Supabase, Railway, Firebase/Google Cloud, Shopify Partners
- [ ] Email di recovery aggiornata su ogni account
- [ ] Nessuna password riutilizzata tra i servizi
- [ ] Accesso condiviso al team (futuro): account individuali, mai credenziali condivise
- [ ] Elenco “chi ha accesso Owner” in password manager (1Password, Bitwarden, ecc.)

### 3.2 Inventario segreti (password manager, **mai** nel repo)

Documenta **nome**, **dove si trova**, **quando ruotato**, **impatto se compromesso**:

| Segreto                        | Dove vive                  | Ruotazione consigliata                             |
| ------------------------------ | -------------------------- | -------------------------------------------------- |
| `DATABASE_URL` / `DIRECT_URL`  | Railway                    | Se leak DB password (Supabase)                     |
| `SUPABASE_SERVICE_ROLE_KEY`    | Railway                    | Annuale o post-incidente                           |
| `SUPABASE_JWT_SECRET`          | Railway + Supabase         | Annuale (invalida sessioni)                        |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY` | Railway                    | Solo pre-produzione Shopify o con migrazione token |
| `SHOPIFY_API_SECRET`           | Railway + Shopify Partners | Post-incidente                                     |
| Chiavi backup storage (R2/S3)  | GitHub Secrets (futuro)    | Annuale                                            |
| Account root Firebase/GCP      | Google Account             | MFA + backup codes conservati offline              |

- [ ] Inventario creato nel password manager
- [ ] `.env` locale **mai** committato (verifica: `git log --all -- .env` vuoto)

### 3.3 Backup manuale database (fino ad automazione)

**Frequenza minima:** 1 volta a settimana prima del primo cliente; **giornaliera** dal primo cliente attivo.

1. Supabase → **Project Settings → Database → Connection string** → **URI diretta** (porta **5432**, non pooler).
2. Da macchina locale (con `pg_dump` installato):

```bash
# Sostituisci con DIRECT_URL reale — NON committare
pg_dump "$DIRECT_URL" --format=custom --file="vestiflow-$(date +%Y%m%d).dump"
```

3. Comprimi e **cifra** il file (esempio con `age`):

```bash
age -r <CHIAVE_PUBBLICA> -o vestiflow-YYYYMMDD.dump.age vestiflow-YYYYMMDD.dump
```

4. Carica su storage **esterno** (USB cifrato offline, Cloudflare R2, Backblaze B2, S3).
5. **Elimina** il dump in chiaro dal disco locale.
6. Annota in calendario la data del backup.

- [ ] Primo backup manuale eseguito
- [ ] Chiave `age`/GPG generata e chiave privata conservata offline
- [ ] Prova di **restore** su progetto Supabase di test (sezione 7)

### 3.4 Export configurazione Supabase Auth (complementare al DB)

Il dump Postgres **non** include tutta la config Auth del pannello. Annota manualmente o screenshot sicuri:

- [ ] Redirect URLs (`/login/reset-password`, produzione, locale)
- [ ] SMTP custom (quando attivo): provider, mittente, **non** la password in chiaro nel doc
- [ ] Rate limits email
- [ ] MFA enabled/disabled
- [ ] Site URL

### 3.5 Railway — cosa salvare

- [ ] Export (copia testuale) di tutte le **Variables** in password manager
- [ ] Screenshot o nota del **dominio pubblico** API (`*.up.railway.app`)
- [ ] Verifica che il deploy parta da **GitHub** (non solo da CLI locale)
- [ ] Log Railway: consapevolezza che i log sono **effimeri** — non sono backup

### 3.6 Firebase — cosa salvare

- [ ] ID progetto Firebase e URL App Hosting (`*.hosted.app`)
- [ ] Configurazione deploy collegata al repo GitHub (branch `main`)
- [ ] Build locale riproducibile: `npm run build` verde
- [ ] (Futuro) Dominio custom e record DNS documentati

**Il frontend non ha dati business:** in caso di disastro, **redeploy da Git** su nuovo progetto Firebase è sufficiente.

---

## 4. Fase 1 — Primo cliente pagante (entro 30 giorni dal go-live)

Obiettivo: backup **automatici**, retention definita, piano Supabase a pagamento valutato.

### 4.1 Upgrade Supabase Pro (consigliato)

Dashboard: **Supabase → Project Settings → Billing**

- [ ] Passa a **Pro** (~25 USD/mese) per backup giornalieri gestiti
- [ ] Verifica **retention** backup (pannello Database → Backups)
- [ ] Annota procedura restore dal pannello Supabase
- [ ] **Mantieni comunque** backup esterno (Pro ≠ unica copia)

| Piano           | Backup gestiti                   | Quando                |
| --------------- | -------------------------------- | --------------------- |
| Free            | No                               | Solo dev / test       |
| Pro             | Giornalieri (retention limitata) | Primo cliente         |
| Team/Enterprise | PITR, SLA migliori               | Crescita multi-tenant |

### 4.2 Automatizza `pg_dump` (GitHub Actions — da implementare nel repo)

Workflow target: `.github/workflows/db-backup.yml` (non ancora presente — voce futura).

**Design previsto:**

1. Trigger: `cron` giornaliero (es. 03:00 UTC) + `workflow_dispatch` manuale
2. Job: `pg_dump` via `DIRECT_URL` da GitHub Secret
3. Cifratura con chiave in GitHub Secret (`BACKUP_AGE_PASSPHRASE` o chiave privata)
4. Upload su **Cloudflare R2** o **Backblaze B2** (account separato)
5. Retention lato bucket: lifecycle rule (es. 30 giorni daily, 90 giorni weekly)
6. Notifica fallimento: email GitHub / Slack (opzionale)

**Secrets GitHub da aggiungere (quando implementi):**

| Secret                        | Descrizione                                 |
| ----------------------------- | ------------------------------------------- |
| `DIRECT_URL`                  | Connection string Postgres diretta Supabase |
| `BACKUP_R2_*` o `BACKUP_S3_*` | Credenziali storage esterno                 |
| `BACKUP_ENCRYPTION_*`         | Chiave cifratura dump                       |

- [ ] Scegli provider storage (R2 consigliato: costo basso, no egress fee)
- [ ] Crea bucket dedicato solo backup (account Google/Cloudflare **≠** Supabase)
- [ ] Abilita **versioning** o **Object Lock** sul bucket (anti-ransomware)
- [ ] Implementa workflow nel repo
- [ ] Verifica primo run automatico verde

### 4.3 Retention policy (decisione da documentare)

Esempio consigliato per gestionale SaaS:

| Tipo                | Retention     | Dove                                      |
| ------------------- | ------------- | ----------------------------------------- |
| Daily               | 30 giorni     | R2/S3                                     |
| Weekly              | 12 settimane  | R2/S3 (copia separata o prefix `weekly/`) |
| Monthly             | 12 mesi       | R2/S3 cold storage                        |
| Supabase Pro native | Come da piano | Supabase dashboard                        |

- [ ] Policy scelta e annotata
- [ ] Lifecycle rules configurate sul bucket

### 4.4 Test restore trimestrale

- [ ] Crea progetto Supabase **staging** separato (`vestiflow-staging`)
- [ ] Restore ultimo dump → verifica conteggio righe tabelle critiche (`Tenant`, `Product`, `StockMovement`)
- [ ] Documenta tempo impiegato (obiettivo: < 2 ore RTO per DB)

---

## 5. Fase 2 — Crescita (multi-cliente, dati sensibili)

Obiettivo: ridurre RTO/RPO, monitoring, resilienza operativa.

### 5.1 Metriche obiettive

| Metrica | Significato              | Target indicativo                          |
| ------- | ------------------------ | ------------------------------------------ |
| **RPO** | Dati massimi persi       | ≤ 24 h (fase 1) → ≤ 1 h (con PITR/replica) |
| **RTO** | Tempo per tornare online | ≤ 4–8 h (fase 1) → ≤ 2 h (fase 2)          |

### 5.2 Supabase avanzato

- [ ] Valuta **Point-in-Time Recovery** (piani superiori)
- [ ] Valuta **read replica** o export incrementale se il volume cresce
- [ ] Connection pooling: monitora limiti pooler vs carico

### 5.3 Railway API

- [ ] **Dockerfile** production-grade nel repo (redeploy su Fly.io/Render possibile)
- [ ] Health check esterno (UptimeRobot, Better Stack) su `/health`
- [ ] Alert se `database: down` o 5xx sostenuti
- [ ] Limita chi può deployare (solo CI da `main`, no deploy manuale non tracciato)

### 5.4 Firebase / frontend

- [ ] Dominio custom con DNS documentato
- [ ] Valuta **Cloudflare** davanti al dominio (DDoS, WAF, cache)
- [ ] Piano B hosting: stesso build su **Cloudflare Pages** o **Vercel** (solo config deploy, non duplicare produzione)

### 5.5 Observability (collegato a sicurezza)

Vedi `SICUREZZA-PENDENTE.md` §5 (Sentry):

- [ ] Alert su spike errori 5xx / 401 anomali
- [ ] Audit log azioni admin (creazione tenant, disconnect Shopify)

### 5.6 Incident response

- [ ] Runbook stampato o offline (sezione 8)
- [ ] Contatto emergenza: email/telefono referente tecnico
- [ ] Template comunicazione clienti (“interruzione servizio”, GDPR breach se applicabile)

---

## 6. Sicurezza per provider — checklist specifiche

### 6.1 Supabase

- [ ] RLS attiva su **ogni** nuova tabella (CI `npm run check:rls` verde)
- [ ] **Mai** service role key nel frontend
- [ ] Network restrictions / IP allowlist (se Supabase lo offre sul tuo piano)
- [ ] Review periodica utenti Auth (rimuovi account obsoleti)
- [ ] Backup Auth config documentata (§3.4)
- [ ] Piano upgrade prima del primo cliente reale

**Dashboard:** https://supabase.com/dashboard/project/upuypsqavodytnxhlwvz

### 6.2 Railway

- [ ] Variables solo via dashboard/CLI, mai in repo
- [ ] MFA sull’account Railway
- [ ] Un solo environment production collegato a `main`
- [ ] `CORS_ORIGINS` minimali (solo domini tuoi)
- [ ] Copia variables in password manager (§3.5)
- [ ] Dopo incidente: **redeploy** da commit noto + rotazione **tutte** le env

**Dashboard:** https://railway.app → servizio `vestiflow-production`

### 6.3 Firebase / Google Cloud

- [ ] MFA sull’account Google
- [ ] IAM: solo persone necessarie sul progetto Firebase
- [ ] App Hosting collegato a repo Git (deploy tracciabile)
- [ ] Nessun secret nel bundle frontend (solo URL pubblici, anon key Supabase ok)
- [ ] Backup “implicito”: ogni push su `main` → build deployabile

**Console:** Firebase → App Hosting → progetto VestiFlow

### 6.4 GitHub (fondamentale per ripristino codice)

- [ ] Repository **privato**
- [ ] MFA obbligatorio organizzazione/account
- [ ] Branch protection su `main` (PR, CI verde)
- [ ] Secrets Actions separati per backup vs CI test
- [ ] Audit log (se piano GitHub lo consente)

---

## 7. Procedura restore database (prova su staging)

**Quando:** almeno 1 volta prima del primo cliente; poi ogni trimestre.

### Prerequisiti

- Dump file `.dump` (custom format) o `.sql.gz` cifrato
- Progetto Supabase vuoto (staging)
- `psql` / `pg_restore` installati

### Passi

1. Decifra il dump se cifrato:

```bash
age -d -o vestiflow-restore.dump vestiflow-YYYYMMDD.dump.age
```

2. Crea nuovo progetto Supabase staging (o svuota schema su DB dedicato).

3. Restore:

```bash
pg_restore --dbname="$STAGING_DIRECT_URL" --verbose --no-owner --no-acl vestiflow-restore.dump
```

4. Verifica:

```sql
SELECT COUNT(*) FROM "Tenant";
SELECT COUNT(*) FROM "Product";
SELECT COUNT(*) FROM "StockMovement";
```

5. Aggiorna **solo staging** Railway con nuove `DATABASE_URL` / JWT secret del progetto staging.

6. Smoke test login + una pagina dati.

7. Documenta problemi incontrati nel runbook.

- [ ] Restore di prova completato
- [ ] Data test e durata annotate: **\*\***\_\_\_**\*\***

---

## 8. Runbook — Disaster recovery (produzione)

Usa questa sequenza se: account compromesso, database cancellato, ransomware, provider irraggiungibile.

### 8.1 Containment (prima ora)

- [ ] Ruota **subito** `SUPABASE_SERVICE_ROLE_KEY` e password DB se sospetto leak
- [ ] Revoca sessioni Auth (JWT secret rotation Supabase) se account admin compromesso
- [ ] Disabilita deploy automatico temporaneamente se sospetto codice malevolo
- [ ] Cambia password + invalida token GitHub/Railway/Firebase se pannello compromesso
- [ ] Documenta timeline e azioni (per eventuale GDPR breach notification)

### 8.2 Ripristino database

- [ ] Recupera **ultimo dump valido** da storage esterno (non da Supabase se anche quello è compromesso)
- [ ] Crea **nuovo** progetto Supabase (o restore su progetto pulito)
- [ ] Esegui restore (§7)
- [ ] Riapplica migration Prisma se necessario: `npx prisma migrate deploy` in `api/`
- [ ] Verifica RLS: `npm run check:rls`

### 8.3 Ripristino API (Railway o alternativa)

- [ ] Nuovo servizio Railway **oppure** Fly.io/Render da stesso Dockerfile/repo
- [ ] Imposta **tutte** le variables da password manager (nuove chiavi Supabase)
- [ ] Aggiorna `CORS_ORIGINS`, `FRONTEND_URL`, `SHOPIFY_*`
- [ ] Deploy commit noto da `main`
- [ ] Verifica `GET /health` → `database: up`

### 8.4 Ripristino frontend (Firebase o alternativa)

- [ ] Nuovo progetto Firebase App Hosting **oppure** redeploy su progetto esistente pulito
- [ ] Collega repo GitHub, branch `main`
- [ ] Aggiorna environment Angular se cambiano URL API/Supabase
- [ ] Aggiorna DNS dominio custom (se usato)
- [ ] Aggiorna redirect URL Supabase Auth

### 8.5 Post-restore

- [ ] Forza **reconnect Shopify** per ogni tenant (token potenzialmente invalidati)
- [ ] Comunicazione clienti se downtime > SLA
- [ ] Post-mortem: cosa è fallito, cosa migliorare
- [ ] Reinstalla backup automatici sul nuovo progetto Supabase

**Obiettivo tempo totale (fase 1):** 4–8 ore con runbook provato.

---

## 9. Scenari d’attacco — cosa fare

| Scenario                     | Segnali                            | Azione immediata                                | Backup utile                              |
| ---------------------------- | ---------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Leak `service_role` key      | Traffico anomalo REST Supabase     | Ruota key, review RLS logs                      | Dump pre-incidente                        |
| Account Supabase compromesso | Progetti modificati, utenti creati | Supporto Supabase, nuovo progetto, restore dump | Dump esterno                              |
| Cancellazione tabelle        | App vuota, errori 500              | Stop API, restore dump                          | Dump esterno (Supabase backup se intatto) |
| Railway env leak             | Bot/scraper API                    | Rotazione env, redeploy                         | Codice da Git                             |
| Firebase account compromesso | Sito defaced                       | Redeploy da Git, revoke token Google            | Git history                               |
| Ransomware su backup         | File cifrati nel bucket            | Object Lock / copia offline non toccata         | Backup immutabile pre-attack              |

---

## 10. Costi indicativi (EUR/mese, ordine di grandezza)

| Voce                     | Fase 0 (free)      | Fase 1 (primo cliente)           |
| ------------------------ | ------------------ | -------------------------------- |
| Supabase                 | 0                  | ~25 (Pro)                        |
| Backup storage R2/B2     | 0–1                | 1–5 (dipende da dimensione dump) |
| GitHub Actions backup    | 0 (minuti inclusi) | 0                                |
| Uptime monitoring        | 0                  | 0–10                             |
| **Totale aggiuntivo DR** | **~0**             | **~30–40**                       |

Il costo maggiore è Supabase Pro: è anche backup nativo + supporto.

---

## 11. Roadmap riassuntiva (timeline)

```
Ora (Fase 0)
├── MFA su tutti i pannelli
├── Inventario segreti in password manager
├── Backup manuale pg_dump settimanale → storage esterno cifrato
└── Documento runbook letto almeno una volta

Primo cliente (Fase 1) — entro go-live
├── Supabase Pro
├── Workflow GitHub Actions backup giornaliero
├── Test restore su staging
└── Retention policy sul bucket

Crescita (Fase 2) — 6–12 mesi
├── PITR / replica (se volume lo giustifica)
├── Monitoring + alerting
├── Piano B hosting frontend documentato
└── Incident response + comunicazione clienti
```

---

## 12. Implementazioni future nel repository

Queste voci richiedono sviluppo CI (chiedi quando pronto):

- [ ] `.github/workflows/db-backup.yml` — backup automatico cifrato
- [ ] Script `scripts/restore-db.sh` — restore guidato per staging
- [ ] `scripts/export-env-checklist.mjs` — verifica env Railway vs `.env.example` (senza stampare secret)
- [ ] Notifica CI se backup fallisce 2 giorni consecutivi

---

## 13. Checklist rapida mensile (5 minuti)

- [ ] Backup ultimi 7 giorni presenti su storage esterno?
- [ ] CI Security checks verde?
- [ ] Nessun accesso sospetto su dashboard (Supabase/Railway/Firebase)?
- [ ] `npm audit` rivisto?
- [ ] MFA ancora attivo su tutti gli account?

---

## 14. Link dashboard

| Servizio              | URL                                                         |
| --------------------- | ----------------------------------------------------------- |
| Supabase (produzione) | https://supabase.com/dashboard/project/upuypsqavodytnxhlwvz |
| Railway API           | https://railway.app                                         |
| Firebase              | Console Google → Firebase → App Hosting                     |
| GitHub repo           | https://github.com/gestionewebstudio-beep/vestiflow         |
| GitHub Actions        | https://github.com/gestionewebstudio-beep/vestiflow/actions |

---

_Aggiorna la data in cima al documento quando completi una fase intera o cambi provider/piano._
