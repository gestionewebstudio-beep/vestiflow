# Setup locale VestiFlow — da PC vuoto a app funzionante

Guida per chi non ha mai lavorato al progetto. Al termine avrai il gestionale
in esecuzione su `http://localhost:4200`, con l'API su `http://localhost:3000`.

Due cose da sapere prima di cominciare, perché cambiano tutto il resto:

1. **Il repository contiene due progetti**: il frontend Angular (nella root) e
   l'API NestJS (in `api/`). Sono due `package.json` distinti, due `npm install`,
   due processi da avviare.
2. **Il database non gira sul tuo PC.** È PostgreSQL ospitato su **Supabase**, e
   ci si collega via connection string. Non devi installare nessun database.

---

## 1. Cosa installare (e cosa no)

| Software                | Serve? | Note                                                                    |
| ----------------------- | ------ | ----------------------------------------------------------------------- |
| **Node.js 22.13.x**     | ✅ sì  | Versione vincolata: `>=22.13.0 <23.0.0`. Con Node 24 l'install si rompe |
| **Git**                 | ✅ sì  | Serve anche dopo il clone: l'hook Husky gira a ogni `npm install`       |
| **Editor** (VS Code)    | ✅ sì  | Estensioni consigliate: Angular Language Service, ESLint, Prettier      |
| **Angular CLI globale** | ❌ no  | È già una devDependency del progetto — vedi sotto                       |
| **PostgreSQL**          | ❌ no  | Il DB sta su Supabase                                                   |
| **Docker**              | ❌ no  | Niente container nel flusso di sviluppo                                 |

### Node — il modo consigliato

Il `package.json` dichiara già `volta.node: 22.13.1`. Se installi
[**Volta**](https://volta.sh), entrando nella cartella del progetto prende da
sola la versione giusta, per sempre, senza che tu debba ricordartene:

```powershell
winget install Volta.Volta
```

In alternativa, l'installer classico di [nodejs.org](https://nodejs.org) scegliendo
la **22.13.1 LTS**, oppure `nvm-windows` (`nvm install 22.13.1 && nvm use 22.13.1`).

Verifica:

```bash
node -v   # deve stampare v22.13.x
npm -v    # 10.9.x
```

### Git — installazione e accesso al repository

Da PowerShell:

```powershell
winget install --id Git.Git -e
```

Poi **chiudi e riapri il terminale** — il PATH si aggiorna solo nelle sessioni
nuove — e verifica con `git --version`.

In alternativa l'installer da [git-scm.com](https://git-scm.com/download/win): una
quindicina di schermate in cui i valori di default vanno tutti bene.

In entrambi i casi si installa **Git for Windows**, che comprende `git` per
PowerShell e Prompt dei comandi, **Git Bash** (shell in stile Unix, comoda perché
capisce i comandi delle guide come `cp` e `ls`) e il **Git Credential Manager**,
che è il pezzo che serve al punto 2.

> Git e GitHub sono due cose distinte: Git è il programma sul PC e funziona
> anche offline e senza account; GitHub ospita solo la copia remota del
> repository. Avere un account non installa niente — il programma va messo su
> questa macchina in ogni caso.

**1. Identità.** Senza queste due righe il primo commit fallisce con
`Please tell me who you are`:

```bash
git config --global user.name "Nome Cognome"
git config --global user.email "email@esempio.it"
```

Si imposta una volta per PC, non per progetto. Non è un'autenticazione: è solo
l'etichetta che finisce sui commit. Il nome è testo libero; per l'email conviene
usare quella dell'account GitHub, così la piattaforma riconosce i commit e li
collega al profilo — con un'email diversa il commit riesce comunque, ma resta
senza collegamento.

**2. Accesso al repository.** È l'ostacolo vero, non l'installazione: il progetto
sta su un repository GitHub privato, quindi serve un account che vi abbia
accesso. Due strade equivalenti dal punto di vista del setup:

- l'**account condiviso del team**, se ne usate uno;
- un **account proprio** aggiunto come collaboratore (repository → Settings →
  Collaborators → Add people). Più ordinato: l'accesso si revoca da solo, la 2FA
  è personale e il registro di sicurezza distingue le persone.

In entrambi i casi, al primo `git clone` si apre da solo il browser per
l'autenticazione: il Credential Manager salva la credenziale e non la richiede
più. Non serve generare token a mano.

Se l'account non ha accesso, il clone fallisce con `repository not found` —
messaggio fuorviante: GitHub non distingue «non esiste» da «non hai accesso».
Stesso errore se sul PC è già salvata la credenziale di un altro account: si
rimuove da _Gestione credenziali_ di Windows, voce `git:https://github.com`.

**3. Fine riga.** Il progetto non ha un `.gitattributes` e Prettier è configurato
con `endOfLine: "lf"`. Conviene quindi partire con:

```bash
git config --global core.autocrlf input
```

Evita che al primo `prettier --check` ogni file risulti da riformattare. È un
dettaglio di comodità, non un blocco: con il default `true` di Windows il
progetto funziona comunque.

### Perché l'Angular CLI globale non serve

`@angular/cli` è una devDependency del progetto: dopo `npm install` hai già la
versione **esatta** che il progetto si aspetta (21.2.x). Usa `npm start` e
`npx ng ...`. Installarne una globale di versione diversa è uno dei modi più
comuni di ritrovarsi build che falliscono senza motivo apparente.

Se lo vuoi comunque per comodità di `ng generate`, allineati alla major giusta:
`npm i -g @angular/cli@21`.

---

## 2. Prima di tutto: il database di sviluppo

> ⛔ **Non usare il database di produzione.** Il file `api/.env` in uso sul PC di
> chi ha sviluppato il progetto punta al Supabase **reale**, quello con i dati dei
> clienti. Se lo copi così com'è, il tuo `localhost` scrive in produzione — e la
> `SUPABASE_SERVICE_ROLE_KEY` scavalca ogni protezione a livello di riga. Un
> `prisma migrate dev` lanciato per sbaglio azzera il database vero.

La strada corretta è **un progetto Supabase separato**, dedicato allo sviluppo.
Si crea in cinque minuti su [supabase.com](https://supabase.com) (il piano free
è sufficiente) e da lì servono questi valori:

| Dove trovarlo (dashboard Supabase)                    | Variabile                   |
| ----------------------------------------------------- | --------------------------- |
| Project Settings → Database → **Pooler** (porta 6543) | `DATABASE_URL`              |
| Project Settings → Database → **Direct** (porta 5432) | `DIRECT_URL`                |
| Project Settings → API → Project URL                  | `SUPABASE_URL`              |
| Project Settings → API → **service_role**             | `SUPABASE_SERVICE_ROLE_KEY` |
| Project Settings → API → JWT Settings                 | `SUPABASE_JWT_SECRET`       |
| Project Settings → API → **anon / publishable**       | serve al frontend (§ 5)     |

Crea anche i bucket in **Storage** (Public per i primi due):
`product-media`, `user-avatars`, `document-attachments`, `supplier-attachments`.

---

## 3. Clone e installazione

```bash
git clone https://github.com/gestionewebstudio-beep/vestiflow.git
cd vestiflow

npm install                # frontend Angular

cd api
npm install                # backend NestJS
npm run prisma:generate    # genera il client Prisma dallo schema
cd ..
```

Il primo `npm install` è lento (qualche minuto): scarica anche il toolchain
Angular e i binari nativi di `sharp`. È normale.

---

## 4. Configurare l'API — `api/.env`

Questo file **non è nel repository** (contiene segreti) e senza di lui l'API non
parte: la configurazione è validata all'avvio, quindi un valore mancante fa
fallire il boot con un messaggio esplicito invece di rompersi più tardi.

```bash
cd api
cp .env.example .env      # su PowerShell: Copy-Item .env.example .env
```

Poi compila almeno queste, con i valori del **tuo** progetto Supabase di sviluppo:

```ini
DATABASE_URL=postgresql://...:6543/postgres?pgbouncer=true&connection_limit=5
DIRECT_URL=postgresql://...:5432/postgres
SUPABASE_URL=https://<tuo-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
CORS_ORIGINS=http://localhost:4200
FRONTEND_URL=http://localhost:4200
PLATFORM_ADMIN_EMAILS=tua.email@esempio.it
```

Note che fanno risparmiare tempo:

- **`connection_limit=5` è un minimo**, non un dettaglio: con `connection_limit=1`
  Prisma va in timeout (`Unable to start a transaction`) appena arrivano due
  richieste insieme.
- `PLATFORM_ADMIN_EMAILS` è l'elenco di chi può creare nuovi clienti (tenant).
  Mettici l'email con cui farai il primo accesso — serve al § 6.
- Tutto il blocco Shopify e TikTok è **opzionale**: senza quelle variabili le
  integrazioni restano semplicemente disattivate, l'app funziona.
- Il file è in `.gitignore`. Verifica che resti così: non deve mai finire in un
  commit.

---

## 5. Configurare il frontend

In sviluppo il frontend legge [`src/environments/environment.ts`](../src/environments/environment.ts),
che **è committato** perché contiene solo valori pubblici. Punta già a
`http://localhost:3000/api/v1`, quindi l'URL dell'API non va toccato.

Va invece allineato il progetto Supabase: se usi un progetto di sviluppo tuo
(e devi), **cambia `url` e `anonKey`** con quelli del tuo progetto. Se restano
quelli di un altro progetto, il login fallisce in modo poco leggibile: il token
viene emesso da un progetto e verificato da un altro.

```typescript
supabase: {
  url: 'https://<tuo-project-ref>.supabase.co',
  anonKey: 'sb_publishable_...',   // API → anon / publishable
},
```

> ⚠️ Questa modifica è **locale**: non committarla, o cambieresti la configurazione
> di tutti. Puoi tenerla fuori dai commit con
> `git update-index --skip-worktree src/environments/environment.ts`
> (e riabilitarla con `--no-skip-worktree` quando serve modificarla davvero).

---

## 6. Creare schema e dati

Dalla cartella `api/`:

```bash
npm run prisma:deploy    # crea tutte le tabelle applicando le migrazioni
npm run prisma:seed      # dati di esempio: tenant "Sandbox locale", negozio,
                         # magazzino, prodotti con varianti, giacenze
```

> ⛔ **Mai `npm run prisma:migrate`** (cioè `prisma migrate dev`) su un database
> che non sia il tuo, usa e getta: ricostruisce lo schema da zero cancellando i
> dati. Serve solo a chi sta modificando lo schema, sul proprio DB di sviluppo.
> Per applicare migrazioni esistenti si usa sempre `prisma:deploy`.

---

## 7. Avvio

Due terminali, uno per processo:

```bash
# terminale 1 — API su http://localhost:3000
npm run start:api          # dalla root (equivale a: cd api && npm run start:dev)

# terminale 2 — frontend su http://localhost:4200
npm start
```

Verifica che l'API sia viva prima di aprire il browser — l'endpoint controlla
anche la connessione al database:

```bash
curl http://localhost:3000/api/v1/health
```

Poi apri `http://localhost:4200`.

---

## 8. Primo accesso

Il seed crea i **dati** ma non un utente: l'identità vive in Supabase Auth, non
nel database applicativo. Il percorso più pulito è creare un cliente dalla UI di
amministrazione.

1. **Crea l'utente amministratore** nella dashboard Supabase:
   Authentication → Users → **Add user** → email + password, con
   _Auto Confirm User_ attivo. Usa la stessa email che hai messo in
   `PLATFORM_ADMIN_EMAILS`.
2. **Accedi** su `http://localhost:4200/login`.
3. Vai su **`/app/admin/clients/new`** e crea un cliente: il backend genera il
   tenant, l'utente titolare e il relativo account Supabase Auth.
4. **Esci e rientra** con le credenziali del titolare appena creato: quello è
   l'account con cui si usa davvero il gestionale.

Il tenant nuovo parte vuoto. Se preferisci lavorare sui dati del seed
("Sandbox locale", con prodotti e giacenze già pronti), l'alternativa è collegare
a mano il tuo utente Auth a quel tenant — da `npx prisma studio` nella cartella
`api/`, tabella `users`, inserendo una riga con:

| Campo          | Valore                                                   |
| -------------- | -------------------------------------------------------- |
| `tenant_id`    | `11111111-1111-4111-8111-111111111111` (tenant del seed) |
| `auth_user_id` | l'UUID dell'utente in Supabase → Authentication → Users  |
| `email`        | la stessa email dell'utente Auth                         |
| `display_name` | un nome qualsiasi                                        |
| `role`         | `owner`                                                  |

---

## 9. Comandi utili

| Comando                   | Cosa fa                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `npm start`               | Frontend in watch su :4200                                     |
| `npm run start:api`       | API in watch su :3000                                          |
| `npm run lint`            | ESLint + i controlli su token, subscription e viste tabella    |
| `npm test`                | Test frontend (Vitest via Angular CLI)                         |
| `npm run test:everything` | Copertura + test di componente + test API — gira anche al push |
| `npm run build`           | Build di produzione del frontend                               |
| `npx prisma studio`       | (in `api/`) esplora e modifica il DB da browser                |
| `npm run e2e`             | Playwright — richiede prima `npx playwright install`           |

> I test frontend si lanciano **solo** con `npm test` / `ng test`, mai con
> `npx vitest` diretto: la configurazione del runner arriva dal builder Angular,
> e senza quella si ottengono decine di fallimenti che non esistono.

---

## 10. Se qualcosa non parte

| Sintomo                                                  | Causa e rimedio                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm install` fallisce con errore su `engines`           | Versione Node sbagliata. `node -v` deve dire 22.13.x                                        |
| `Configurazione ambiente non valida — DATABASE_URL: ...` | `api/.env` assente o incompleto (§ 4)                                                       |
| `@prisma/client did not initialize yet`                  | Manca `npm run prisma:generate` in `api/`                                                   |
| `Unable to start a transaction`                          | Nella `DATABASE_URL` manca `connection_limit=5` (o è a 1)                                   |
| Il login gira a vuoto / 401 su ogni chiamata             | `anonKey` in `environment.ts` di un progetto Supabase diverso da quello di `api/.env` (§ 5) |
| Errori CORS nella console del browser                    | `CORS_ORIGINS` in `api/.env` deve contenere `http://localhost:4200`                         |
| `husky - .git can't be found`                            | Stai lavorando su una copia scaricata come ZIP invece che clonata con Git                   |
| Porta 3000 o 4200 occupata                               | `npx kill-port 3000` oppure cambia porta con `npm start -- --port 4300`                     |
| Il frontend parte ma ogni pagina è vuota                 | L'API non è in esecuzione: controlla il terminale 1 e `curl .../health`                     |

---

## Checklist finale

- [ ] `node -v` stampa 22.13.x
- [ ] `npm install` eseguito **due volte**: root e `api/`
- [ ] `api/.env` compilato con un progetto Supabase **di sviluppo**, non quello di produzione
- [ ] `environment.ts` allineato allo stesso progetto Supabase
- [ ] `npm run prisma:deploy` e `npm run prisma:seed` eseguiti
- [ ] `http://localhost:3000/api/v1/health` risponde
- [ ] Accesso completato su `http://localhost:4200`
