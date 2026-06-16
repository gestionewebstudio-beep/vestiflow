# VestiFlow — Sicurezza: cosa resta da fare (manuale)

> **Aggiornato:** 16 giugno 2026  
> **Lato codice:** il grosso è fatto (RLS, rate limit, ruoli, CSP, cifratura token Shopify, CI check RLS, ecc.).  
> Questo file elenca **solo ciò che devi fare tu** — configurazioni su piattaforme esterne, legali, account, DNS — perché non si può automatizzare dal repository.

Usa le checkbox `[ ]` / `[x]` man mano che completi.

---

## Già fatto nel codice (riferimento rapido)

Non devi rifare nulla qui, serve solo a ricordarti cosa è coperto:

- [x] Row Level Security (default-deny) su tutte le 18 tabelle Supabase
- [x] Rate limiting API (300 req/min per IP)
- [x] Autorizzazione per ruolo (`owner` / `admin` / `manager` / `clerk`)
- [x] Tenant solo da JWT verificato (mai da header client)
- [x] Token Shopify cifrati a riposo (AES-256-GCM)
- [x] Webhook Shopify verificati con HMAC
- [x] CSP stretta in build di produzione
- [x] Helmet + filtro errori globale (niente stack trace al client)
- [x] Script CI `npm run check:rls` + workflow `.github/workflows/security.yml`
- [x] Secret GitHub `SUPABASE_URL` + `SUPABASE_ANON_KEY` configurati (Actions → Secrets)
- [x] CI **Security checks** verde in produzione (verificato 16/06/2026 — run #2)

---

## Priorità alta — fai prima di vendere a un negozio reale

### 1. Impostazioni Supabase Auth

Dashboard: **Supabase → Authentication → Settings**

- [ ] **Conferma email obbligatoria** per i nuovi utenti (evita account fake)
- [ ] **Password policy** adeguata (lunghezza minima ≥ 8, meglio 12+)
- [ ] **Rate limiting login** attivo (di default Supabase ne ha; verifica che non sia disabilitato)
- [ ] **MFA (2FA)** almeno per account **owner/admin** del gestionale (Supabase → Auth → MFA)
- [ ] **MFA anche sui tuoi account** Supabase / GitHub / Railway (protezione del pannello, non dell’app)

---

### 2. Backup database

Dashboard: **Supabase → Project Settings → Database → Backups**

- [ ] Verifica che i **backup automatici** siano attivi (piano Pro o superiore per backup point-in-time; sul free verifica cosa è incluso)
- [ ] Annota dove recuperare un backup e **prova un restore una volta** in un progetto di test (prima del primo cliente pagante)
- [ ] Decidi una **retention** (es. 30 giorni operativi, 1 anno per audit se serve)

---

### 3. Variabili d’ambiente produzione (Railway)

Dashboard: **Railway → servizio API → Variables**

Controlla che siano tutte impostate e **non** siano ancora valori di demo/locali:

- [ ] `DATABASE_URL` / `DIRECT_URL` (Supabase, connection string corrette)
- [ ] `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET`
- [ ] `CORS_ORIGINS` — deve includere l’URL **Firebase App Hosting** (es. `https://<tuo-progetto>.web.app`), **non** solo `localhost`
- [ ] `SHOPIFY_*` (quando colleghi Shopify: URL pubblici Railway, chiave cifratura ≥ 32 caratteri random)
- [ ] `FRONTEND_URL` — URL reale del frontend deployato
- [ ] **Nessun** `DEMO_OWNER_PASSWORD` in produzione se non serve (o cambialo subito dopo il seed)

File di riferimento: `api/.env.example`

---

### 4. Credenziali demo / seed

- [ ] Se in produzione hai eseguito il seed con `owner@demo-boutique.it`, **cambia quella password** o disabilita l’utente demo
- [ ] Non lasciare password demo prevedibili su un ambiente accessibile da internet

---

## Priorità media — prima o subito dopo il primo cliente

### 5. Observability errori (Sentry o equivalente)

**Perché:** oggi gli errori 5xx finiscono solo nei log Railway (effimeri). Senza alerting non ti accorgi di attacchi o bug gravi.

- [ ] Crea account **Sentry** (o Datadog / simile)
- [ ] Crea progetto per **frontend Angular** e **backend NestJS**
- [ ] Copia i **DSN** (sono pubblici, vanno in env — non sono secret)
- [ ] Chiedi di cablarli in `ObservabilityService` (frontend) e nel filtro errori API (backend) — è una modifica piccola quando hai i DSN

**Stato:** rimandato — niente DSN al momento.

---

### 6. GDPR (obbligatorio se vendi a negozi in UE)

**Perché:** tratti dati di clienti/negozi (email, ordini, anagrafiche). Serve base legale documentata.

- [ ] **Privacy policy** sul sito / app (titolare, finalità, base giuridica, retention, diritti utente, contatti DPO o referente)
- [ ] **Termini di servizio** / contratto SaaS con i negozi
- [ ] **Cookie banner** se aggiungi analytics/marketing (cookie tecnici Supabase/auth spesso bastano senza banner invasivo — verifica con un legale)
- [ ] **DPA (Data Processing Agreement)** firmati con:
  - Supabase
  - Firebase / Google Cloud
  - Railway
  - Shopify (quando connesso)
- [ ] Pagina o email per **diritti GDPR** (accesso, cancellazione, portabilità)
- [ ] Ambienti **staging/dev** senza dati reali di clienti (o pseudonimizzati)

**Stato:** rimandato — servono i tuoi dati aziendali (ragione sociale, P.IVA, email referente, sede).

---

### 7. Dominio personalizzato + DNS

**Perché:** URL Firebase `*.web.app` va bene per test; per vendere conviene dominio proprio (fiducia, email, CSP/CORS puliti).

- [ ] Acquista dominio (es. `vestiflow.it`)
- [ ] Collega dominio a **Firebase App Hosting** (record DNS indicati da Firebase)
- [ ] Aggiorna `CORS_ORIGINS` su Railway con il nuovo dominio
- [ ] Aggiorna `FRONTEND_URL` e URL app Shopify con il dominio definitivo
- [ ] Aggiorna `connect-src` in `src/index.prod.html` se cambia host API (se resta su Railway, nessuna modifica CSP frontend)

**Stato:** rimandato — non hai ancora DNS.

---

### 8. Header di sicurezza lato hosting (frontend)

La CSP è già nel `index.html` di produzione. Restano header che **non** si possono mettere via meta tag:

- [ ] `X-Frame-Options: DENY` o CSP `frame-ancestors 'none'` (anti clickjacking)
- [ ] `Strict-Transport-Security` (HSTS) sul dominio frontend — utile **dopo** dominio custom + HTTPS stabile
- [ ] Valuta **HSTS preload** solo dopo settimane di HTTPS senza problemi ([hstspreload.org](https://hstspreload.org))

**Dove:** Firebase App Hosting / CDN — verifica nella console Firebase se esiste configurazione header; altrimenti valuta Cloudflare davanti al dominio.

**Nota:** l’API su Railway ha già Helmet con HSTS.

---

## Shopify — quando colleghi il primo negozio

### 9. App Shopify Partners

Dashboard: **Shopify Partners → App → Configuration**

- [ ] **App URL** e **Allowed redirection URL(s)** puntano a produzione (`https://vestiflow-production.up.railway.app/api/v1/shopify/auth/callback` o dominio custom)
- [ ] **Webhook URL** pubblico e raggiungibile da Shopify
- [ ] `SHOPIFY_APP_URL` su Railway = URL base API pubblica
- [ ] `SHOPIFY_TOKEN_ENCRYPTION_KEY` generata una volta e **mai** cambiata senza migrare i token già cifrati
- [ ] Test OAuth end-to-end + almeno un webhook (es. `orders/create`) con HMAC valido

---

## Manutenzione continua (non dimenticare)

### 10. Ogni nuova tabella nel database

- [ ] Nella **stessa migration** Prisma che crea la tabella:  
      `ALTER TABLE "nome_tabella" ENABLE ROW LEVEL SECURITY;`
- [ ] Push → la CI `check:rls` deve restare **verde** (scopre le tabelle dallo schema automaticamente)

Regola scritta in: `.cursor/rules/regole-sicurezza.mdc` (sezione Supabase RLS)

---

### 11. Dipendenze e vulnerabilità

- [ ] Settimanalmente (o a ogni PR Dependabot): rivedi `npm audit` — root e `api/`
- [ ] Major Angular / NestJS: finestra dedicata, non mischiare con altre feature
- [ ] Dopo ogni deploy: controlla che **non** ci siano secret committati per sbaglio (`git log -- .env` deve essere vuoto)

---

### 12. Rotazione segreti (almeno 1 volta l’anno, o subito se sospetto leak)

| Segreto                        | Dove ruotarlo                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`    | Supabase → API → rigenera (attenzione: invalida la vecchia)                             |
| `SUPABASE_JWT_SECRET`          | Supabase → JWT Settings (invalida sessioni esistenti)                                   |
| `SHOPIFY_API_SECRET`           | Shopify Partners                                                                        |
| `SHOPIFY_TOKEN_ENCRYPTION_KEY` | Railway — **solo** se non hai ancora negozi connessi, altrimenti serve migrazione token |
| Password DB                    | Supabase → Database settings                                                            |

---

### 13. Checklist rapida pre-release (copia prima di ogni go-live)

- [ ] CI **Security checks** verde su GitHub (gira automaticamente a ogni push; controlla solo se hai aggiunto tabelle)
- [ ] Login/logout e refresh token funzionano in produzione
- [ ] Un utente **clerk** non può eliminare prodotti / collegare Shopify
- [ ] API `/health` → `database: up`
- [ ] Nessuna password demo attiva in produzione
- [ ] `CORS_ORIGINS` include solo domini tuoi (no wildcard)
- [ ] Backup DB verificato negli ultimi 30 giorni

---

## Cosa NON serve fare (per evitare paranoia)

- **Non** nascondere la anon key Supabase: è pubblica by design; la protezione è la RLS (già attiva).
- **Non** aspettarti “sicurezza al 100%”: obiettivo realistico = rischi critici chiusi + monitoraggio + processi (backup, GDPR, rotazione).
- **Sentry e GDPR** li abbiamo rimandati apposta: fallo quando hai DSN / dati aziendali / dominio.

---

## Contatti utili (link dashboard)

| Servizio         | URL                                                         |
| ---------------- | ----------------------------------------------------------- |
| GitHub Actions   | https://github.com/gestionewebstudio-beep/vestiflow/actions |
| Supabase         | https://supabase.com/dashboard/project/upuypsqavodytixhlwvz |
| Railway          | https://railway.app (servizio `vestiflow-production`)       |
| Firebase         | Console Firebase → App Hosting                              |
| Shopify Partners | https://partners.shopify.com                                |

---

_Quando completi una voce, spunta la checkbox e aggiorna la data in cima al file se cambia qualcosa di sostanziale._
