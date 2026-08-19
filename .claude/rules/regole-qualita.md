# regole-qualita — Qualità del codice

_Testing, linting, formatting, commit, CI/CD, performance budget, accessibility
check, dependency hygiene._

# SCOPE

Aree non architetturali ma indispensabili per la qualità nel tempo di VestiFlow: test, formatting, CI, observability di build, dipendenze.

---

# ⛔ DATABASE — Due comandi VIETATI

Il database di VestiFlow è **condiviso**, e la sua storia delle migration può essere più
avanti del ramo su cui si sta lavorando: chi sta su un altro ramo applica le proprie
migration allo stesso database. Non è un'ipotesi — è già successo, con sei migration
presenti nel database e assenti in locale.

Con le storie divergenti:

- **`prisma migrate dev`** — **VIETATO**. Non applica e basta: propone di **azzerare il
  database** per riallinearlo. Si perde il lavoro degli altri rami, e i dati.
- **`prisma db push`** — **VIETATO**. Allinea il database allo schema locale, quindi
  **cancella** le tabelle che il ramo corrente non conosce.
- **`prisma migrate reset`** — **VIETATO**, fa quello che dice.

Al loro posto, sempre e solo:

| Devi…                           | Comando                     |
| ------------------------------- | --------------------------- |
| applicare le migration mancanti | `npm run prisma:deploy`     |
| rigenerare il client            | `npm run prisma:generate`   |
| vedere cosa manca               | `npx prisma migrate status` |

⛔ **Mai** `prisma migrate diff --from-schema-datasource` per generare una migration
nuova: su questo database condiviso propone di cancellare le tabelle degli altri
rami. Vedi sotto.

Una **migration nuova** si scrive **a mano**, davvero a mano: si modifica
`prisma/schema.prisma`, si scrive l'SQL in
`prisma/migrations/<AAAAMMGGhhmmss>_<nome>/migration.sql` **con un commento che dica
perché**, e lo si applica con `npm run prisma:deploy`.

### ⛔ Un quarto comando vietato: `prisma migrate diff --from-schema-datasource`

**Questa regola diceva di generare l'SQL così. Era sbagliato, e il 11/08/2026 quel
comando ha proposto di cancellare mezzo database.** Chiesto di generare l'SQL per
aggiungere UNA colonna, ha risposto con oltre quaranta istruzioni: `DROP` di
`cash_sessions`, `fiscal_receipts`, `pos_terminals`, `store_sale_payments`,
`corrispettivo_entries.document_id`, i campi documento esterno degli ordini…

**Perché succede, e perché succederà ancora.** Quel comando fa una domanda
**dichiarativa**: «quale SQL rende il database identico a questo file di schema?».
Il tribunale è il file, e tutto ciò che sta nel database e non sta nel file è, per
definizione dello strumento, roba da togliere. Non esiste il concetto di «questo è
di un altro ramo, lascialo stare».

Ma su un database condiviso **il proprio schema è una descrizione parziale**: le
tabelle della cassa e dei documenti fiscali esistono nel database e non stanno né
nello `schema.prisma` di questo ramo né fra le sue migration — le ha applicate il
ramo del collega. Uno strumento dichiarativo non può lavorare contro una
descrizione parziale, e finché due rami condividono un database la descrizione è
parziale **per costruzione**.

**Il campanello non suona.** `prisma migrate status` in quel momento rispondeva
«Database schema is up to date!»: controlla che le migration locali siano
applicate, non si accorge che il database ne ha altre. Non è una rete.

**La variante innocua esiste**, e se un giorno servirà è questa:
`--from-migrations <cartella> --to-schema-datamodel` confronta la storia delle
migration con lo schema, quindi ciò che vive nel database non entra mai nel
confronto. Richiede però un **database ombra** (`--shadow-database-url`), che qui
non è configurato: finché non lo sarà, l'SQL si scrive a mano.

**`npm run prisma:deploy` non ha mai avuto questo rischio**: applica i file e
basta, non confronta niente. Il pericolo stava nel _generare_ il file.

`.claude/settings.json` blocca quei comandi via permessi, e `npm run prisma:migrate` è
una guardia che spiega — ma **nessuna delle due ferma un terminale**, quindi la regola
resta scritta qui.

Se `prisma generate` dà `EPERM`: è il watcher dell'API che tiene bloccato il query
engine. Fermare `npm run start:dev` e rilanciare.

## Lo schema e la sua migration sono una coppia

`prisma generate` da solo **rompe l'applicazione**. Il client rigenerato seleziona le
colonne dello schema, e se una di quelle nel database non c'è ancora, ogni lettura di
quella tabella va in 500 — anche le letture che con la colonna nuova non c'entrano
niente, perché `include` prende tutti gli scalari.

È già successo: colonna aggiunta allo schema, migration scritta ma non applicata «per
prudenza, il database è condiviso», `generate` lanciato — e l'elenco ordini è andato giù.
La prudenza ha prodotto lo stato peggiore dei due.

Quindi: **o tutti e tre insieme — schema, migration, `npm run prisma:deploy` — oppure
nessuno dei tre.** Non esiste una via di mezzo sicura. Se applicare non si può in quel
momento, non si tocca nemmeno lo schema.

---

# ⛔ FORMATTAZIONE — Mai su un albero intero

`lint-staged` copre `src/**` ed `e2e/**`, **non `api/**`**. Il backend è quindi fuori dal
cancello di formattazione, e un `prettier --write` su quell'albero non «sistema qualche
file»: **li riscrive tutti**. È già successo — 157 file riformattati, un commit da 177
file in cui la modifica vera era invisibile.

Il danno non è estetico. Sono conflitti fantasma con i rami degli altri su file che
nessuno ha cambiato davvero, e una revisione impossibile da fare.

- **VIETATO** `prettier --write` con un glob che copre una cartella (`api/**`, `**`, `.`).
- Si formatta **solo quello che si è toccato**, file per file.
- Sul frontend non serve nemmeno: ci pensa `lint-staged` al commit.

`.claude/settings.json` blocca le forme più grossolane (`.`, `api`, `api/src`), ma **non
può fare di più**: i permessi confrontano glob con il testo del comando, quindi un pattern
su `api/**` bloccherebbe anche `prettier --write api/src/un-file.ts`, che è il caso giusto.
Una guardia che impedisce il lavoro legittimo viene aggirata, non rispettata — per questo
il divieto vero è quello scritto qui, e la soluzione vera è `lint-staged` (sotto).

**Deciso e rimandato (08/2026): `api/**` entrerà in `lint-staged`, ma non adesso.** È la
soluzione alla radice — ogni file API si formatterebbe quando lo si mette in staging, e
nessuno avrebbe più motivo di lanciare Prettier in grande.

Si aspetta che questo ramo sia **unito con quello della cassa**. Il motivo è pratico: una
riformattazione di massa mentre due rami vanno in parallelo complica l'unione, ed è lo
stesso danno che la regola vuole evitare — solo distribuito nel tempo invece che in un
commit solo. Fino ad allora vale il divieto qui sopra.

---

# NODE & PACKAGE MANAGER

- **Pinna la versione Node**: file `.nvmrc` (o `engines.node` in `package.json`) con la versione LTS attiva. Aggiorna almeno una volta all'anno alla nuova LTS.

```
# .nvmrc
22
```

```json
// package.json
"engines": {
  "node": ">=22.0.0 <23.0.0"
}
```

- Scegli UN package manager per progetto (`npm` / `pnpm` / `yarn`). Documenta la scelta in README. Mai mischiare lockfile diversi.
- USA `packageManager` in `package.json` (Corepack-compatible):

```json
"packageManager": "npm@10.9.0"
```

- Lockfile (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`) **SEMPRE committato**.
- `.gitignore` deve contenere: `node_modules/`, `.angular/`, `dist/`, `coverage/`, `lighthouse-reports/`.

---

# LINTING — ESLint Obbligatorio

- Configurazione minima con `@angular-eslint`, `@typescript-eslint`, plugin `eslint-plugin-rxjs`, `eslint-plugin-unused-imports`.
- File config: `eslint.config.mjs` (flat config, formato moderno).
- Regole non negoziabili (errore, non warning):
  - `@typescript-eslint/no-explicit-any`: error
  - `@typescript-eslint/no-floating-promises`: error
  - `@typescript-eslint/no-unused-vars`: error
  - `@angular-eslint/no-output-on-prefix`: error
  - `@angular-eslint/component-class-suffix`: error
  - `@angular-eslint/use-lifecycle-interface`: error
  - `unused-imports/no-unused-imports`: error
- Regole template Angular: `@angular-eslint/template/no-negated-async`, `@angular-eslint/template/click-events-have-key-events`, `@angular-eslint/template/interactive-supports-focus`.
- Script in `package.json`:

```json
"lint": "ng lint",
"lint:fix": "ng lint --fix"
```

- CI fallisce se `npm run lint` ritorna errori. Mai pushare codice con lint error.

---

# FORMATTING — Prettier Obbligatorio

- Configurazione condivisa in `.prettierrc.json`.
- Esegui Prettier come pre-commit hook (vedi sezione Husky). Mai PR con file non formattati.
- Config consigliata di partenza:

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "htmlWhitespaceSensitivity": "css"
}
```

- ESLint e Prettier non si sovrappongono: usa `eslint-config-prettier` per disabilitare le regole stilistiche di ESLint.

---

# PRE-COMMIT HOOKS — Husky + lint-staged

- USA `husky` + `lint-staged` per blockare commit con codice non conforme.
- Hook `pre-commit` esegue su file staged:
  - Prettier su tutto.
  - ESLint con `--fix` su file `.ts` / `.html`.
  - Type-check (`tsc --noEmit`) sui file modificati o sull'intero progetto se la velocità lo consente.

```json
// .husky/pre-commit (script)
npx lint-staged
```

```json
// package.json → "lint-staged"
{
  "*.{ts,html}": ["eslint --fix", "prettier --write"],
  "*.{json,md,scss,yaml,yml}": ["prettier --write"]
}
```

- Hook `commit-msg`: valida il messaggio con `@commitlint/cli` (vedi sezione Commit).
- Hook `pre-push`: esegue `npm run test:everything` e `npm run build` per evitare push rotti.

---

# UNIONE DEI RAMI — chi prevale in caso di contesa

Decisione del proprietario del progetto (08/2026): **in caso di conflitto prevale
l'implementazione di `feature/listini`.** È il ramo che porta le decisioni di prodotto
prese esplicitamente, e il criterio è deciso prima proprio per non doverlo discutere nel
momento in cui il conflitto si presenta.

In pratica:

- si unisce **il ramo dell'altro dentro `feature/listini`**, stando su `feature/listini`:
  così la parte che deve prevalere è già «ours»;
- nei punti in conflitto vero — le stesse righe toccate da entrambi — si tiene la versione
  di `feature/listini`, senza aprire una discussione.

## Prevalere non è scartare, e la differenza è tutta qui

**VIETATO `-X ours` alla cieca.** Quell'opzione risolve i conflitti _in silenzio_, e il
silenzio è il difetto che questo progetto combatte ovunque — dai fallimenti del
precompilato al tetto delle ripubblicazioni. Le modifiche dell'altro ramo **in punti
diversi devono sopravvivere**: la regola arbitra le contese, non cancella il lavoro altrui.

Due cose che nessuna strategia di merge risolve, e che vanno verificate a mano dopo:

- **I conflitti che git non vede.** Una rinomina da una parte e una chiamata dall'altra non
  producono conflitto testuale: il merge riesce e il codice si rompe. Li trovano solo
  `tsc --noEmit` e i test, che vanno eseguiti **dopo** ogni merge, mai prima soltanto.
- **Il database è uno solo e porta le migration di entrambi i rami.** Scartare il codice
  dell'altro lasciando applicate le sue migration produce esattamente lo stato rotto
  descritto sopra in «Lo schema e la sua migration sono una coppia». Se si scarta del
  codice, va verificato cosa resta appeso nel database.

Al termine di un merge con conflitti: **riportare cosa è stato scartato e perché**, invece
di risolvere e passare oltre.

---

# COMMIT CONVENTION — Conventional Commits

- USA il formato [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<scope opzionale>): <descrizione breve>

<corpo opzionale>

<footer opzionale: BREAKING CHANGE, refs>
```

- Tipi consentiti: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Validazione automatica con `@commitlint/config-conventional`:

```javascript
// commitlint.config.cjs
module.exports = { extends: ['@commitlint/config-conventional'] };
```

- Beneficio: changelog automatico (`standard-version`, `release-please`) e versioning semantico.

---

# TESTING — Strategia Multi-livello

## Unit Test

- USA **Vitest** (Angular 20+) o Jest per unit test di service, pipe, validator, funzioni pure.
- Coverage minimo:
  - Service: 80% di lines/branch.
  - Pipe / Validator / Funzioni pure: 100%.
  - Componenti dumb: snapshot + interazioni base.
- Naming: file accanto al sorgente, `*.spec.ts`.
- Pattern AAA (Arrange / Act / Assert) o Given/When/Then.
- Ogni bug fix DEVE essere accompagnato da un test che fallisce senza il fix.

```typescript
import { describe, it, expect } from 'vitest';

describe('formatPrice', () => {
  it('formatta in EUR con due decimali', () => {
    expect(formatPrice(1234.5)).toBe('€ 1.234,50');
  });
});
```

## Component Test

- USA **Angular Testing Library** (`@testing-library/angular`) per testare componenti dal punto di vista utente.
- VIETATO testare implementation detail (selettori CSS specifici, lifecycle interni). Testa il comportamento osservabile.
- Componenti smart: mock dei service via `provide`.

## Integration Test

- Testa flussi che attraversano più service/component (es. login → fetch dati → redirect).
- USA `HttpTestingController` per mockare HTTP a livello di interceptor.

## E2E Test

- USA **Playwright** (raccomandato) o Cypress.
- Copertura minima: gli **happy path** delle 3-5 user journey più critiche (es. login, creazione prodotto con varianti, registrazione carico, emissione documento di vendita).
- E2E gira in CI su PR critiche e su deploy in staging.
- Mai test E2E che dipendono da dati esterni reali: usa fixture o ambiente dedicato.

## Come sono divisi gli script di test

| script            | cosa fa                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `test`            | esegue tutti i test del frontend e dice se passano. Nient'altro. |
| `test:watch`      | lo stesso, in watch, per lavorarci                               |
| `test:coverage`   | **il gate di copertura**: soglie 76/69/71/76 sul non-componente  |
| `test:components` | i soli test di componente, senza copertura                       |
| `test:everything` | i tre sopra più l'API — è quello che gira al push                |

La soglia di copertura si applica a service, util, pipe e validator, non ai
componenti: quelli sono coperti da test di comportamento, dove un numero di
righe eseguite dice poco. Misurarla sull'unione dei due mondi darebbe un 55%
che non significa niente e farebbe fallire per sempre il comando più ovvio —
che è il modo migliore per insegnare a ignorarlo.

### ⚠️ `tsc --noEmit` non verifica i template Angular

**Misurato il 16/08/2026, due volte nello stesso lavoro.** `npx tsc --noEmit`
è passato pulito mentre nei template c'erano **errori veri** — un componente non
importato, un binding a un input inesistente, una proprietà mancante su un tipo
di controlli. Li ha trovati `npm test`, che invoca il compilatore Angular.

**Quindi «type-check pulito» non vuol dire «l'applicazione compila».** Per
qualunque modifica che tocchi un `.html` di componente — o un tipo che un
template legge — il controllo minimo è un comando che accenda il **template
compiler**: oggi `npm test`, o `npm run build`.

Vale soprattutto per chi rifattorizza tipi condivisi: un campo aggiunto a
un'interfaccia di controlli si vede nei template, non in `tsc`.

_Registrato come **requisito di verifica**, non come modifica alla
configurazione: rendere il controllo più esplicito (un `typecheck` che includa i
template, o un passo di build in CI) è una scelta separata, da fare quando si
decide — non un effetto collaterale di questa nota._

## Coverage Reporting

- Genera report `lcov` e mostralo nel CI (Codecov, Coveralls, GitHub Actions summary).
- Soglia minima: **76% statement e righe, 69% branch, 71% funzioni**, con
  `coverageExclude` sui componenti — **`.ts` e `.html` insieme**.

### ⚠️ Il gate misurava i template, ed era rosso da sempre _(17/08/2026)_

Qui c’era scritto «soglia minima totale: 80%». Non è mai stata applicata, perché
`angular.json` aveva le soglie ma **nessun `coverageExclude`**: il `--exclude` sulla riga di
comando toglie i **test** dei componenti dall’esecuzione, non i loro **file** dal denominatore.

Risultato: si misurava la copertura di codice i cui test non venivano eseguiti, **template
inclusi** — ogni `.component.html` a 0%. Il totale usciva **14,37%**, il gate falliva sempre, e
siccome sta nell’hook `pre-push`, **non si riusciva a pushare**.

```text
con i template dentro          14,37%   ← quello che si misurava
esclusi solo i .component.ts   22,56%
esclusi anche i .component.html 76,44%  ← la prima misura vera
```

**Le soglie sono state portate alla misura reale, non abbassate.** Un gate sempre rosso è un
gate spento: non ferma niente, e chi lo incontra impara ad aggirarlo. A 76/69/71/76 comincia a
fare il suo mestiere — **da lì può solo salire**, e una regressione la ferma davvero.

⚠️ **Alzarle è lavoro dichiarato, non un ritocco al numero.** Misurato il 17/08: **167 file
non-componente su 325 non hanno un proprio test**, così distribuiti —

```text
32  core/models        in gran parte interfacce e tipi: poco da coprire
18  domain/documents
13  domain/products
13  core/auth
11  features/documents
```

— mentre le aree che contano di più sono già alte: `core/api` 91%, `core/auth` 97%,
`core/interceptors` 100%, `core/guards` 90%.

⚠️ **E i componenti restano fuori dal numero per scelta**, non per pigrizia: i loro test
esistono (`npm run test:components`, 451 prove) ma sono test di **comportamento**, dove le righe
eseguite dicono poco. Misurarli qui rimetterebbe il gate a 14%.

- Nuovo codice DEVE avere coverage ≥ 80% (regola "diff coverage").

---

# ACCESSIBILITY CHECK — Automatico

- USA **`@axe-core/playwright`** o **`jest-axe`** per asserzioni a11y nei test E2E/component.
- Esegui axe su ogni route principale: zero violazioni `serious` o `critical`.
- In CI: il check axe fallisce la build se compaiono violazioni nuove.
- Lighthouse Accessibility ≥ 95 (vedi sezione Lighthouse CI).
- Esegui anche test manuali periodici con screen reader (NVDA, VoiceOver) sulle pagine principali — nessun automatismo cattura il 100%.

---

# LIGHTHOUSE CI

## ⚠️ Qui c'era una configurazione che il progetto aveva già smentito _(corretto 19/08/2026)_

Questa sezione prescriveva soglie e un `.lighthouserc.json` che **non sono quelli reali**.
È lo scarto più insidioso fra tutti: la regola sembra autorevole, il file la contraddice,
e nessun controllo automatico se ne accorge.

|                | la regola diceva | `.lighthouserc.json` reale |
| -------------- | ---------------- | -------------------------- |
| performance    | **error** 0.85   | **warn** 0.75              |
| accessibility  | error 0.95       | error **0.9**              |
| best-practices | error 0.95       | **warn** 0.9               |
| seo            | «non si misura»  | `"off"` ✅ concordava      |

⛔ **Le soglie qui sotto sono ora quelle vere.** Non sono state abbassate: sono state
_lette_. Alzarle è lavoro dichiarato, come per la copertura — non un ritocco al numero.

## ⭐ Il pezzo che la regola non nominava, e che è ciò che lo fa funzionare

L'app è **interamente dietro login**: Lighthouse puntato su `/app/dashboard` misurerebbe
la pagina di redirect al login. Il file reale lo risolve così, e chi tocca questa
configurazione deve saperlo:

```json
"startServerCommand": "npm run build -- --configuration=e2e && npx http-server dist/vestiflow/browser -p 4210 -c-1",
"puppeteerScript": "./scripts/lhci-mock-auth.cjs",
"url": ["…/login", "…/app/dashboard", "…/app/products"],
"numberOfRuns": 1
```

Il `puppeteerScript` autentica con l'auth mock prima della misura; la build `e2e` è
quella che quell'auth mock la contiene. **Senza uno dei due, i numeri sono di un'altra
pagina** — e sarebbero pure buoni, il che è il difetto peggiore.

## Le soglie

```json
"categories:performance":    ["warn",  { "minScore": 0.75 }],
"categories:accessibility":  ["error", { "minScore": 0.9  }],
"categories:best-practices": ["warn",  { "minScore": 0.9  }],
"categories:seo": "off"
```

- **Accessibility è l'unica `error`**, ed è la scelta giusta per un gestionale usato tutto
  il giorno da chi ci lavora: le altre due avvisano, questa ferma.
- **SEO è `off`**: l'app è dietro login, non è indicizzabile, non ha traffico organico.
- `@lhci/cli` è devDependency, lo script è `npm run audit:lhci`, e `lighthouse-reports/`
  sta in `.gitignore`.

⚠️ **Se cambi le soglie, cambiale nel FILE**: questa sezione le rispecchia, non le
comanda. Una regola che diverge dalla configurazione insegna a non fidarsi di nessuna
delle due.

# PERFORMANCE BUDGETS — Build Time

- Configura `budgets` in `angular.json` (campo `architect.build.configurations.production.budgets`):

```json
[
  { "type": "initial", "maximumWarning": "800kB", "maximumError": "1.5MB" },
  { "type": "anyComponentStyle", "maximumWarning": "12kB", "maximumError": "26kB" }
]
```

- Sono i valori attualmente in `angular.json`: alzarli richiede una motivazione, non è la reazione di default a un budget sforato.
- Ogni superamento del budget deve generare un'analisi: `npx source-map-explorer dist/.../main-*.js` per capire cosa pesa.

---

# CI/CD — Pipeline Minima

Una pipeline CI deve eseguire (in ordine, fail-fast):

1. **Install**: `npm ci` (riproducibilità dal lockfile).
2. **Lint**: `npm run lint`.
3. **Type-check**: `tsc --noEmit` (se non già coperto da `ng build`).
4. **Test unit/component**: `npm run test:everything` (è quello che gira anche al push).
5. **Build**: `npm run build` con `--configuration=production`.
6. **E2E** (su PR/staging): `npm run e2e:headless`.
7. **Lighthouse CI** (su PR/staging): `npm run audit:lhci`.
8. **Audit dipendenze**: `npm audit --audit-level=high`.
9. **Deploy** (solo su `main` / tag): provider-specific.

GitHub Actions / GitLab CI / Bitbucket Pipelines: scegli uno e mantieni un solo file `.yml` di pipeline. Documenta in README come riprodurre i passi localmente.

---

# DEPENDENCY HYGIENE

- Aggiornamenti automatici via Dependabot / Renovate, raggruppati per categoria (Angular, dev-deps, prod-deps).
- Frequenza di review delle PR di update: settimanale per security, mensile per minor/patch.
- Major Angular: pianifica una finestra dedicata, mai mischiare con altri major.
- Dipendenze deprecate: rimuovi entro 1 mese dal warning ufficiale.
- Dipendenze duplicate: `npm dedupe` periodicamente; controlla con `npm ls <pkg>` se hai versioni multiple della stessa lib.

---

# DOCUMENTAZIONE MINIMA

Ogni repository DEVE avere:

- **README.md** in root con: nome progetto, stack, requisiti (Node, npm), `npm install` + `npm start`, link a docs interne, contatti.
- **.env.example** completo e aggiornato.
- **CHANGELOG.md** generato automaticamente da Conventional Commits (release-please / standard-version).
- **CONTRIBUTING.md** se altri sviluppatori toccano il repo (regole branch, PR, code review).

Per architetture non banali (> 1 service, decisioni di design discutibili): cartella `docs/adr/` con [Architecture Decision Records](https://adr.github.io/) numerati. Una decisione importante = un ADR. Mai più "boh, perché si è sempre fatto così".

---

# CODICE NON TOCCATO — Regole

- Codice morto (file non importati, funzioni non chiamate): rimuovi entro 30 giorni dall'identificazione. USA `unused-imports` plugin + analisi periodica con `ts-prune` o equivalente.
- TODO / FIXME nel codice: ammessi se hanno un riferimento a issue tracker (`// TODO(#123): ...`). TODO senza tracking = debito invisibile.
- Codice commentato out: VIETATO in main. USA Git history per recuperarlo se serve.

---

# OSSERVABILITÀ DEL BUILD

- Abilita `--stats-json` in build di produzione e analizzala periodicamente:
  - `npx webpack-bundle-analyzer dist/.../stats.json` (per Webpack).
  - `source-map-explorer` per esbuild/Vite-based builds Angular.
- Monitora la dimensione dei bundle nel tempo: una crescita inattesa segnala dipendenze non lazy o duplicate.

---

# CHECKLIST QUALITÀ PRE-RELEASE

Prima di un release in produzione:

- [ ] `npm run lint` pulito
- [ ] `npm run test:everything` verde (unit, component, API)
- [ ] `npm run e2e` verde sui happy path
- [ ] `npm run build` senza warning di budget
- [ ] Lighthouse CI ≥ soglie configurate
- [ ] axe-core: zero violazioni `serious`/`critical`
- [ ] `npm audit` senza vulnerabilità high/critical
- [ ] CHANGELOG aggiornato
- [ ] Versione bumpata seguendo SemVer
- [ ] Release notes preparate per stakeholder
