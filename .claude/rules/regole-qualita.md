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

Una **migration nuova** si scrive a mano, senza toccare il database: si modifica
`prisma/schema.prisma`, si genera l'SQL con `prisma migrate diff`
(`--from-schema-datasource` → `--to-schema-datamodel`, `--script`), lo si mette in
`prisma/migrations/<AAAAMMGGhhmmss>_<nome>/migration.sql` **con un commento che dica
perché**, e lo si applica con `npm run prisma:deploy`.

`.claude/settings.json` blocca quei comandi via permessi, e `npm run prisma:migrate` è
una guardia che spiega — ma **nessuna delle due ferma un terminale**, quindi la regola
resta scritta qui.

Se `prisma generate` dà `EPERM`: è il watcher dell'API che tiene bloccato il query
engine. Fermare `npm run start:dev` e rilanciare.

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
| `test:coverage`   | **il gate di copertura**: soglie 80/75 sul codice non-componente |
| `test:components` | i soli test di componente, senza copertura                       |
| `test:everything` | i tre sopra più l'API — è quello che gira al push                |

La soglia di copertura si applica a service, util, pipe e validator, non ai
componenti: quelli sono coperti da test di comportamento, dove un numero di
righe eseguite dice poco. Misurarla sull'unione dei due mondi darebbe un 55%
che non significa niente e farebbe fallire per sempre il comando più ovvio —
che è il modo migliore per insegnare a ignorarlo.

## Coverage Reporting

- Genera report `lcov` e mostralo nel CI (Codecov, Coveralls, GitHub Actions summary).
- Soglia minima totale: 80%.
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

- `@lhci/cli` come devDependency. Script in `package.json`:

```json
"audit:lhci": "lhci autorun"
```

- File `.lighthouserc.json` in root:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4200/app/dashboard", "http://localhost:4200/app/products"],
      "numberOfRuns": 3,
      "settings": { "preset": "desktop" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.95 }]
      }
    },
    "upload": { "target": "filesystem", "outputDir": "./lighthouse-reports" }
  }
}
```

- Aggiungi `lighthouse-reports/` a `.gitignore`.
- Esegui in CI su PR (con build di staging) e blocca merge se sotto soglia.
- La categoria **SEO non si misura**: l'app è dietro login, non è indicizzabile e non ha traffico organico. Contano performance, accessibility e best-practices.

---

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
