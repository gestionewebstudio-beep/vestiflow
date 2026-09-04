# Vestiflow

> ## ⛔ Database e migration — leggere prima di toccare Prisma
>
> **Non lanciare mai `prisma migrate dev` né `prisma db push`.**
>
> Il database è **condiviso** e la sua storia delle migration può essere più avanti del
> ramo su cui stai lavorando: chi sta su un altro ramo applica le proprie migration allo
> stesso database. Con le storie divergenti:
>
> - **`prisma migrate dev`** non applica e basta — propone di **azzerare il database**
>   per riallinearlo. Si perde il lavoro degli altri rami, e i dati.
> - **`prisma db push`** allinea il database allo schema locale, quindi **cancella** le
>   tabelle che il ramo corrente non conosce.
> - **`prisma migrate reset`** fa esattamente quello che dice.
>
> Sono i comandi che si digitano per riflesso. Al loro posto:
>
> | Devi…                           | Comando                                 |
> | ------------------------------- | --------------------------------------- |
> | applicare le migration mancanti | `npm run prisma:deploy` (dentro `api/`) |
> | rigenerare il client            | `npm run prisma:generate`               |
> | vedere cosa manca               | `npx prisma migrate status`             |
> | scrivere una migration nuova    | vedi sotto                              |
>
> ⛔ **Qui c'era `npx prisma migrate diff --from-schema-datasource …`, e va NON usato.**
> Su questo database CONDIVISO quel comando fa una domanda dichiarativa — «quale SQL rende
> il database identico a questo file?» — e tutto ciò che sta nel database senza stare nello
> schema, per definizione dello strumento, è roba da togliere. Chiesto di aggiungere una
> colonna, l'11/08/2026 ha risposto con oltre quaranta istruzioni, `DROP` di `cash_sessions`,
> `fiscal_receipts` e `pos_terminals` comprese: le tabelle del ramo del collega.
>
> **Una migration nuova si scrive a mano**, davvero a mano: modifica `prisma/schema.prisma`,
> scrivi l’SQL in `prisma/migrations/<AAAAMMGGhhmmss>_<nome>/migration.sql` **con un commento
> che dica perché**, e applicalo con `npm run prisma:deploy`.
>
> ⚠️ Il dettaglio completo, con la ragione per cui `prisma migrate status` **non** se ne
> accorge, sta in `.claude/rules/regole-qualita.md` §«Un quarto comando vietato».
>
> Due protezioni sono già in piedi, ma **nessuna delle due ferma un terminale**:
> `.claude/settings.json` blocca quei comandi nelle sessioni Claude Code, e
> `npm run prisma:migrate` è stato sostituito da una guardia che spiega cosa fare.
>
> Se `prisma generate` dà `EPERM`, è il watcher dell'API che tiene bloccato il query
> engine: ferma `npm run start:dev` e rilancia.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
