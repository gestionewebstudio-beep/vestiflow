# regole-sicurezza — Sicurezza

_Sicurezza per frontend Angular e backend Node/NestJS. Provider-agnostico
(Supabase, Railway, Vercel, AWS, Cloudflare, GCP)._

# SCOPE

Queste regole valgono per VestiFlow: SPA Angular + API NestJS, database PostgreSQL su Supabase, deploy su Railway. I tag `[scope: supabase]`, `[scope: firebase]`, `[scope: vercel]`, `[scope: aws]` marcano dettagli specifici di un provider: vale quello in uso, gli altri restano come riferimento se l'infrastruttura cambia.

## ⚠️ Riallineamento del 19/08/2026 — quattro categorie, non una

Parte di queste regole era scritta per un **sito web pubblico**, e in un gestionale
interamente dietro login descriveva lavori impossibili o inutili. La revisione **non ha
cancellato**: ha diviso in quattro, perché le quattro si trattano in modo diverso.

|                                      |                                                                             | dove                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Non applicabile all'architettura** | il progetto non ha la cosa che la regola presuppone, e non è un arretrato   | CSP col nonce per request (nessun SSR)                                 |
| **Da rendere condizionale**          | vale altrove, o varrà qui a certe condizioni: si dichiara **quando** torna  | cookie banner · immagini LCP · Core Web Vitals (`regole-architettura`) |
| **Configurazione già divergente**    | il codice ha già deciso diversamente: vince il codice, la regola si allinea | soglie Lighthouse (`regole-qualita`)                                   |
| ⛔ **Lacuna vera**                   | la regola aveva ragione e **non è stata fatta**: resta APERTA               | header di sicurezza del frontend statico                               |

⛔ **Il criterio non è «è una regola da sito web, quindi via»: è dove finisce il valore.**
La CSP serve, il nonce no. Il GDPR serve, il banner no. Gli header servono, il middleware
Express no. Cancellare la prescrizione senza conservare l'obiettivo perde la parte utile —
ed è l'errore che questa revisione ha evitato apposta.

---

# ⛔ REGOLA ZERO — Segreti e Credenziali

- **VIETATO ASSOLUTO** hardcodare API key, token, password, connection string, certificati o qualsiasi segreto in qualsiasi file `.ts`, `.html`, `.json`, `.scss`, `.yml`, e committarli nel repository.
- Il repository contiene SOLO `.env.example` con i nomi delle variabili (valori vuoti o placeholder). Aggiorna `.env.example` ogni volta che aggiungi una variabile.
- I valori reali vivono in:
  - **Locale**: `.env` (presente in `.gitignore`, mai committato).
  - **Produzione**: variabili d'ambiente del provider che fanno riferimento a un secret manager:
    - `[scope: firebase]` Firebase App Hosting / Cloud Run → variabili in `apphosting.yaml` con riferimenti a Google Cloud Secret Manager.
    - `[scope: vercel]` Vercel → Environment Variables marcate `Sensitive` o riferimenti a Vercel Secrets.
    - `[scope: aws]` AWS → AWS Secrets Manager o Parameter Store con encryption.
- **VIETATO** esporre segreti in log, error message, response API.
- Verifica che `.gitignore` contenga: `.env`, `.env.local`, `.env.*.local`, `.env.production`, `*.key`, `*.pem`, `*.p12`, `serviceAccountKey.json`, `*.crt`.
- Rotazione segreti: programma una rotazione periodica (annuale minimo) per chiavi long-lived. Rotazione immediata su ogni sospetto leak.

## In caso di leak accidentale

1. **Revoca immediata** del segreto sul provider (non basta cancellarlo dal repo: la history Git lo conserva).
2. Genera un nuovo valore.
3. Riscrivi la history se possibile (`git filter-repo`) e force-push, ma considera il segreto compromesso permanentemente.
4. Verifica i log per uso non autorizzato dal momento del commit in poi.

---

# VARIABILI D'AMBIENTE ANGULAR (Frontend)

- Le variabili in `environment.ts` / `environment.prod.ts` sono **pubbliche per definizione** (incluse nel bundle JS). Non inserire mai dati sensibili.
- `environment.ts` può contenere SOLO: URL pubblici, flag feature, ID pubblici non segreti (es. Google Maps public key con HTTP referrer restriction, Firebase project config — pubblico by design, Stripe **publishable** key).
- Ogni variabile d'ambiente usata in `environment.ts` deve essere documentata in `.env.example` con commento sul significato.
- Per chiavi pubbliche di terzi (reCAPTCHA/Turnstile, mappe, e simili): configura **HTTP
  referrer restriction** sul provider, così la chiave funziona solo dal tuo dominio.
  ⚠️ **Oggi VestiFlow non ne usa nessuna** — la voce resta per quando arriveranno, non
  descrive una configurazione esistente da verificare.

---

# CHIAMATE HTTP E BACKEND

- Le chiamate verso servizi esterni **con credenziali private** (API key privata, OAuth client secret, chiavi Stripe/Braintree, accesso DB, ecc.) DEVONO transitare esclusivamente dal **backend** (Cloud Functions, Cloud Run, route SSR server-side, API route Vercel, Lambda, ecc.).
- Il client Angular chiama SOLO endpoint del proprio dominio o origine fidata configurata in CORS.
- **VIETATO** esporre credenziali backend in risposte API al frontend. Il frontend riceve solo i dati elaborati, non le chiavi usate per ottenerli.
- Usa `HttpClient` con un **interceptor** per aggiungere header di autenticazione. Non costruire header auth manualmente nelle chiamate component.
- Implementa interceptor per la gestione centralizzata degli errori HTTP:
  - `401` → tentativo di refresh token, poi redirect login.
  - `403` → pagina/messaggio "accesso negato".
  - `429` → backoff e messaggio "troppe richieste".
  - `5xx` → notifica generica utente + log in observability.

---

# SANITIZZAZIONE INPUT E OUTPUT

- **VIETATO** usare `innerHTML` con dati provenienti dall'utente o da API esterne senza sanitizzazione esplicita.
- Se `innerHTML` è necessario per HTML interno fidato, usa `DomSanitizer.sanitize(SecurityContext.HTML, value)`. Mai `bypassSecurityTrust*` su input non fidato.
- `bypassSecurityTrustHtml()`, `bypassSecurityTrustScript()`, `bypassSecurityTrustUrl()`, `bypassSecurityTrustResourceUrl()` sono **VIETATI** su qualsiasi dato proveniente da input utente o API esterna. Usabili SOLO su contenuto generato internamente, costante, e con commento `// REASON: ...` che giustifica l'uso.
- Ogni input utente inviato al backend DEVE essere validato e sanitizzato **lato server**, indipendentemente dalla validazione frontend. La validazione frontend è UX, non sicurezza.
- USA query parametrizzate o ORM per tutte le interazioni con database. **VIETATO** concatenare stringhe per costruire query SQL/NoSQL.
- USA validatori schema-based lato server (Zod, Joi, class-validator, AJV) per ogni endpoint che riceve payload.

---

# CONTENT SECURITY POLICY (CSP)

## ⚠️ Il nonce per request qui NON è rinviabile: è impossibile _(misurato 19/08/2026)_

Qui c'era scritto _«genera un **nonce** crittografico per ogni request servita dal
server»_. **VestiFlow non ha un server che serva la pagina.** Misurato in `angular.json`:

```text
builder: @angular/build:application     ssr: null     prerender: null     server: (nessuno)
```

Il frontend è un **bundle statico**. Non esiste la request in cui generare il nonce, né
l'HTML da riscrivere per iniettarlo. La prescrizione non descriveva un lavoro arretrato:
descriveva un'architettura che non è questa.

⛔ **Questo NON toglie la CSP**, che serve eccome. Cambia da dove viene: non da un
middleware applicativo ma dagli **header dell'hosting** che serve `dist/`.

## La CSP che questo progetto può avere

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' <origine dell'API>;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests;
```

- `script-src 'self'` **senza** `'unsafe-inline'` e senza nonce: il build Angular non
  emette script inline, quindi il nonce non serve — è la ragione per cui la sua assenza
  non è una perdita di sicurezza in questo progetto.
- `style-src 'unsafe-inline'` resta tollerato: gli stili inline li genera il framework.
- Testa con [CSP Evaluator](https://csp-evaluator.withgoogle.com/) prima del deploy.
- Rollout in `Content-Security-Policy-Report-Only` prima di applicarla.

⚠️ **Se un giorno arrivasse l'SSR**, il nonce torna a essere la forma giusta e questa
sezione va riletta: la regola vecchia non era sbagliata in assoluto, era di un'altra
architettura.

---

# HEADER DI SICUREZZA HTTP

## ⛔ LACUNA APERTA: sul frontend statico non li imposta nessuno _(misurato 19/08/2026)_

Qui c'era `app.use((_req, res, next) => res.setHeader(...))` «nel middleware del
server», e leggendola sembrava una prescrizione soddisfatta. Non lo è, e la forma
stessa della regola **nascondeva il buco** invece di dichiararlo.

Misurato:

|                               |                                                    |
| ----------------------------- | -------------------------------------------------- |
| `helmet` in `api/src/main.ts` | protegge l'**API NestJS**, che serve JSON ✅       |
| chi serve il documento HTML   | **nessuna configurazione di hosting è committata** |

Cercati e assenti: `railway.json`, `nixpacks.toml`, `Dockerfile`, `vercel.json`,
`netlify.toml`, `public/_headers`.

> **Per la pagina HTML di VestiFlow, in questo repository, `Content-Security-Policy`,
> `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP` e `CORP` non li
> imposta nessuno.**

⚠️ **Questa voce resta APERTA finché non è chiusa davvero**, e non va tolta per far
tornare i conti: è una lacuna, non una regola inadatta. Chiuderla significa aggiungere
al repository la configurazione di hosting che emette gli header, e dichiarare qui dove
vive.

## Gli header, e dove ognuno appartiene

**Sull'API (NestJS, già fatto con `helmet`)**: HSTS, `X-Content-Type-Options`,
`Referrer-Policy`, CORS. Proteggono le risposte JSON.

**Sul documento HTML (da fare, vedi sopra)**: CSP, `X-Frame-Options: DENY` (o
`frame-ancestors 'none'`), `Referrer-Policy`, `Permissions-Policy`, COOP/CORP. Sono gli
header che riguardano la **pagina**, e vanno dove la pagina viene servita.

- **HSTS**: solo su HTTPS. `preload` dopo verifica su [hstspreload.org](https://hstspreload.org).
- **X-Frame-Options / frame-ancestors**: previene clickjacking — per un gestionale dietro
  login è il più importante dei due elenchi.
- **Permissions-Policy**: disabilita le API browser non usate. ⚠️ `camera=()` **no**: lo
  scanner barcode della Vendita al banco la usa.
- **COOP / CORP**: protezione dai side-channel.

---

# CORS

- CORS configurato SOLO per gli endpoint API backend. Mai abilitare CORS su pagine HTML.
- Lista bianca delle origini consentite: solo domini propri + origini terze strettamente necessarie. **MAI** wildcard `*` su endpoint che ricevono credenziali.
- Non abilitare `credentials: true` (cookie/auth header) con `origin: '*'` (è proibito dalla spec stessa).
- Per API pubbliche read-only (es. dati aperti): `origin: '*'` ammesso senza credenziali.

---

# AUTENTICAZIONE E SESSIONI

- USA cookie `HttpOnly`, `Secure`, `SameSite=Lax` (o `Strict` per app sensibili) per i token di sessione.
- **VIETATO** salvare token di autenticazione a vita lunga in `localStorage` o `sessionStorage`: vulnerabili a XSS.
- Se devi usare token in storage (es. SPA + API stateless): usa access token a breve durata (15min–1h) + refresh token rotation, mai un solo long-lived token.
- I controlli di autorizzazione (ruoli, permessi, tenant) si applicano **lato server** su ogni richiesta. Nascondere UI non è sicurezza.
- Route guard Angular: utili per UX, **non** sostituiscono la verifica server-side.
- Password storage (se gestisci tu l'autenticazione): bcrypt/argon2 con cost factor adeguato. Mai SHA1/MD5/SHA256 nudo.
- MFA / 2FA per account sensibili (admin, owner di tenant).
- Rate limit sul login: max 5 tentativi falliti consecutivi, poi lockout temporaneo + alert.

## Protezione CSRF

- Per API stateful con cookie: usa pattern double-submit cookie o sync token.
- Per API stateless con `Authorization: Bearer`: CSRF non si applica (token non auto-inviato dal browser).
- `SameSite=Lax` mitiga la maggior parte degli attacchi CSRF cross-site.

---

# AUTORIZZAZIONE — Modello a Permessi

- Definisci il modello di autorizzazione PRIMA di scrivere endpoint: chi può vedere/modificare cosa.
- Pattern raccomandato: **role-based + resource-ownership**.
- Centralizza i check in middleware/guard server-side, non sparpagliati negli handler.
- Log di ogni decisione "negato" per anomalia detection.

---

# `[scope: firebase]` FIREBASE SECURITY

## Firebase Authentication

- Verifica il token JWT Firebase **lato server** (Cloud Functions / Cloud Run) su ogni chiamata autenticata. Non fidarti della validazione client.
- USA **Custom Claims** per ruoli e permessi. Non salvare ruoli in Firestore se devi usarli nelle Security Rules (sono già nel token).

## Firestore / Realtime Database Security Rules

- Le Security Rules sono codice di sicurezza, non documentazione. Ogni collection DEVE avere rules esplicite.
- **VIETATO** deploy con `allow read, write: if true` in produzione.
- Regola di default: `allow read, write: if false` — apri solo ciò che serve.
- Valida la struttura dei documenti nelle rules (`request.resource.data`).
- Testa le rules con l'**emulatore Firebase** prima del deploy. Le rules vanno nel CI con test automatici.

## Firebase Storage Rules

- Stesso principio: default deny, regole esplicite per ogni path.
- Limita dimensione upload nelle rules: `request.resource.size < 5 * 1024 * 1024`.

## Firebase App Hosting / Cloud Run

- USA **Identity-Aware Proxy** (IAP) per proteggere ambienti di staging/preview non pubblici.
- Le Cloud Functions che ricevono dati DEVONO validare input, verificare autenticazione e limitare le dimensioni del payload.

---

# `[scope: supabase]` ROW LEVEL SECURITY — Obbligatoria su ogni tabella

La anon/publishable key Supabase è **pubblica** (finisce nel bundle JS). Senza RLS, la Data API (PostgREST) espone le tabelle a chiunque possieda la chiave, scavalcando l'API applicativa e il filtro `tenantId`. È la vulnerabilità più grave di un'app Supabase multi-tenant.

- **OGNI tabella nuova nello schema (Prisma o SQL) DEVE avere la RLS abilitata** nella stessa migration che la crea: `ALTER TABLE "..." ENABLE ROW LEVEL SECURITY;`. Default deny: nessuna policy = nessun accesso per `anon`/`authenticated`.
- Difesa in profondità: `REVOKE ALL ON ... FROM anon, authenticated` sulle tabelle di business.
- **VIETATO** affidarsi solo al filtro `tenantId` dell'API: se la RLS manca, la Data API resta aperta comunque.
- L'API backend si connette come **owner** del DB (bypassa la RLS): abilitare la RLS NON rompe l'app. Non usare `FORCE ROW LEVEL SECURITY` (bloccherebbe anche l'owner).
- **Verifica obbligatoria in CI**: lo script `scripts/check-rls.mjs` (workflow `.github/workflows/security.yml`) scopre le tabelle dallo schema Prisma e fallisce se la anon key riesce a leggere anche una sola riga. Gira su ogni push/PR e settimanalmente. Una tabella nuova senza RLS fa fallire la build.
- Test manuale equivalente: `GET {SUPABASE_URL}/rest/v1/<tabella>` con header `apikey`/`Authorization` = anon key → deve dare `401`/`403` o array vuoto, mai righe.

---

# UPLOAD DI FILE

- Limita dimensione massima dei file (es. 5MB per immagini, 10MB per documenti). Configura i limiti sia lato client (UX) che lato server (sicurezza).
- Valida il **tipo MIME reale** del file lato server (non fidarti dell'estensione o del `Content-Type` dichiarato dal client). USA librerie come `file-type` (Node) per ispezionare i magic bytes.
- Lista bianca dei tipi di file accettati (es. `image/jpeg`, `image/png`, `image/webp`, `application/pdf`).
- Salva i file su object storage (Cloud Storage, S3, R2), non sul filesystem del server. Genera URL firmati con scadenza per l'accesso.
- Rinomina sempre il file salvato con un UUID: il nome originale è user-controlled e non sicuro come path.
- Scansiona i file per malware se accetti documenti da utenti anonimi (Cloud Functions con ClamAV o servizio dedicato).
- Per immagini caricate dall'utente: ri-encoda lato server (libreria `sharp`) per stripping di metadata EXIF e payload nascosti.

---

# RATE LIMITING E PROTEZIONE DOS

- Implementa rate limiting sugli endpoint API backend (`express-rate-limit`, middleware Vercel/Cloudflare, Cloud Armor).
- Soglie tipiche di partenza: 60 req/min per endpoint pubblici, 600 req/min per utenti autenticati, 5 req/min per login/signup.
- Proteggi con **reCAPTCHA v3** o **Cloudflare Turnstile** gli endpoint raggiungibili senza autenticazione (login, signup, recupero password).
- Non esporre informazioni sulla struttura interna dell'app in messaggi di errore API (niente stack trace in produzione).
- Risposte di errore API: messaggi generici per l'utente, dettagli completi solo in observability/log.

---

# HTTPS E TRASPORTO

- **HTTPS obbligatorio** in produzione. Nessuna risorsa caricata via HTTP su pagine HTTPS (mixed content).
- Verifica che tutti i link interni, le chiamate API e le risorse esterne usino `https://`.
- Precarica il sito su HSTS Preload List dopo verifica della configurazione.
- TLS 1.2 minimo, TLS 1.3 preferito. Disabilita ciphers deboli.

---

# DEPENDENCY SECURITY

- Esegui `npm audit` prima di ogni deploy in produzione. Risolvi le vulnerabilità critiche e alte prima del go-live.
- Mantieni le dipendenze aggiornate. USA Dependabot / Renovate per aggiornamenti automatici con PR.
- Non usare dipendenze abbandonate (ultimo commit > 2 anni e issue critiche aperte) o con CVE noti non risolti.
- Lockfile (`package-lock.json` / `pnpm-lock.yaml`) SEMPRE committato.
- USA `npm ci` (o equivalente) in CI per installazioni riproducibili dal lockfile.
- Verifica integrità: `npm ci --audit-level=high`.
- Per pacchetti critici (auth, crypto, framework di sicurezza): valuta `--save-exact` per pinnare versioni esatte.

---

# LOGGING E AUDIT

- Non loggare mai dati personali (email plain, password, token, dati anagrafici sensibili) nei log del server.
- USA un servizio centralizzato per i log di produzione (Cloud Logging, Datadog, CloudWatch, Logtail). I log su filesystem effimero del container vengono persi.
- Implementa audit log per azioni sensibili: login (success/fail), cambio password, modifica dati utente, azioni amministrative, accesso a dati personali altrui.
- I log di errore non devono esporre path del filesystem, variabili d'ambiente o configurazione interna.
- Retention dei log: definisci una policy (es. 90 giorni operativi, 1 anno audit) e applicala.

---

# PRIVACY E DATI PERSONALI (GDPR)

VestiFlow tratta dati personali — clienti, operatori — quindi questa sezione si applica.

## ⚠️ Il cookie banner NON si applica _(misurato 19/08/2026)_

Qui c'era: _«Cookie banner conforme: nessun cookie/script di tracciamento prima del
consenso esplicito»_. È una prescrizione da **sito pubblico**, e qui non c'è niente da
consentire:

- l'app è **interamente dietro `authGuard`** — non esiste una pagina che un visitatore
  raggiunga prima di autenticarsi;
- **nessuno script di tracciamento terzo** (nessun analytics, nessun pixel, nessuna mappa);
- il cookie di sessione è **tecnico strettamente necessario**, che la stessa regola
  esentava già.

Verificato: nessun componente di consenso esiste in `src/app`, e non è una dimenticanza.

⛔ **Il resto della sezione si applica eccome**, ed è la parte che conta:

- Privacy policy aggiornata che elenca: titolare, finalità, basi giuridiche, destinatari, tempi di conservazione, diritti dell'utente.
- Pagina dedicata per esercizio dei diritti GDPR (accesso, rettifica, cancellazione, portabilità).
- Data Processing Agreement (DPA) con tutti i fornitori che trattano dati per conto tuo (cloud, email, analytics, payment).
- Pseudonimizza/anonimizza dati negli ambienti non-produzione.

---

# CHECKLIST SICUREZZA PRE-DEPLOY

Prima di ogni deploy in produzione, verifica:

- [ ] Nessun segreto in `.env` committato (`git log --all --full-history -- .env`)
- [ ] `npm audit` senza vulnerabilità critiche/alte
- [ ] CSP configurata e testata (no `'unsafe-inline'` su `script-src`)
- [ ] Header di sicurezza dell'**API** presenti (`curl -I <origine API>` e verifica)
- [ ] ⛔ Header di sicurezza del **documento HTML**: **LACUNA APERTA** — nessuna
      configurazione di hosting è committata. Non spuntare finché non c'è (vedi sezione)
- [ ] HTTPS forzato + HSTS attivo
- [ ] Rate limiting attivo su tutti gli endpoint pubblici e su login/signup
- [ ] reCAPTCHA/Turnstile su form pubblici
- [ ] CORS configurato senza wildcard su endpoint con credenziali
- [ ] Cookie sessione con `HttpOnly`, `Secure`, `SameSite`
- [ ] Security Rules / IAM Policies deployate e testate
- [ ] `[scope: supabase]` RLS attiva su tutte le tabelle (`npm run check:rls` verde)
- [ ] Messaggi di errore API generici, dettagli solo in log
- [ ] Privacy policy e DPA aggiornati (⚠️ il cookie banner non si applica: app dietro login, nessun tracciamento — vedi GDPR)
- [ ] Lockfile committato + `npm ci` in CI
