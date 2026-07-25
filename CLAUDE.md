# Regole di progetto

Le regole di VestiFlow vivono in `.claude/rules/`, un file per tipologia, e sono
importate qui sotto: vengono caricate a ogni sessione, non serve citarle.

I nomi dei file (`regole-architettura`, `regole-gestionale`, `regole-qualita`,
`regole-sicurezza`, `regole-stile-ui`) sono gli stessi citati nei commenti del
codice — es. `// ...(regole-sicurezza)`: quel nome porta al file della regola.

@.claude/rules/regole-architettura.md
@.claude/rules/regole-gestionale.md
@.claude/rules/regole-qualita.md
@.claude/rules/regole-sicurezza.md
@.claude/rules/regole-stile-ui.md

- **regole-architettura** — Angular moderno: struttura, signals, forms, state,
  HTTP, design system, performance.
- **regole-gestionale** — dominio retail multi-tenant: varianti, giacenze per
  location, movimenti, Shopify, UX da gestionale.
- **regole-qualita** — testing, lint, commit, CI/CD, budget, a11y, dipendenze.
- **regole-sicurezza** — sicurezza frontend e backend Node/NestJS.
- **regole-stile-ui** — fonte di verità visiva: token, componenti, tabelle,
  form documentali, shell. Ogni modifica alla UI deve rispettarlo.

In caso di conflitto vale l'ordine: **1. Sicurezza · 2. Architettura · 3. Gestionale · 4. Stile UI · 5. Qualità generale.**
