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
> | Devi…                            | Comando                                      |
> | -------------------------------- | -------------------------------------------- |
> | applicare le migration in locale | `npm run prisma:deploy:test` (dentro `api/`) |
> | rigenerare il client             | `npm run prisma:generate`                    |
> | vedere cosa manca                | `npx prisma migrate status`                  |
> | scrivere una migration nuova     | vedi sotto                                   |
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
> che dica perché**, e provalo con `npm run prisma:deploy:test` sul database di prova.
>
> ⚠️ Il dettaglio completo, con la ragione per cui `prisma migrate status` **non** se ne
> accorge, sta in `.claude/rules/regole-qualita.md` §«Un quarto comando vietato».
>
> ### ⛔ Il database condiviso non è un bersaglio raggiungibile per sbaglio
>
> **`DIRECT_URL` non sta in `api/.env`.** Non è una dimenticanza: è la protezione.
> La CLI Prisma carica quel file **da sé** — «Environment variables loaded from .env»,
> senza che nessuno glielo chieda — e `migrate deploy` non usa `url`, usa `directUrl`.
> Finché la variabile stava lì, ogni comando Prisma digitato dentro `api/` partiva già
> connesso al database di sviluppo condiviso.
>
> ⚠️ **È successo il 07/09/2026**: un `npx prisma migrate deploy` con la sola
> `DATABASE_URL` sovrascritta ha applicato una migration al condiviso. Il comando ha
> risposto «All migrations have been successfully applied» e sembrava aver scritto sulla
> copia locale. Nessun dato è andato perso, ed è stato annullato in transazione.
>
> Tolta la variabile, i tre comandi che scrivono lo schema falliscono **prima di aprire
> una connessione**:
>
> ```text
> migrate deploy       P1012 · Environment variable not found: DIRECT_URL
> db execute --schema  P1012 · idem
> migrate resolve      P1012 · idem
> ```
>
> ### ⛔ Non esiste un comando locale per applicare migration al condiviso
>
> ⚠️ **Qui c’era `DATABASE_URL=… DIRECT_URL=… npx prisma migrate deploy`**, presentato
> come «l’operazione eccezionale». Era la stessa scorciatoia che ha causato l’incidente,
> riscritta in una riga da incollare: una protezione che si aggira copiando la riga sotto
> non è una protezione, è un promemoria.
>
> | Devi…                             | Come                                                |
> | --------------------------------- | --------------------------------------------------- |
> | provare una migration             | `npm run prisma:deploy:test`, sul database di prova |
> | applicarla al database di Railway | **lo fa il deploy**, da sé, all’avvio dell’immagine |
> | intervenire a mano sul condiviso  | ⛔ **non c’è un modo supportato**                   |
>
> L’ultima riga è deliberata, e vale finché non esisterà la procedura test → produzione:
> un intervento manuale eccezionale richiede **una nuova autorizzazione e una procedura
> preparata per quel caso**, non un comando pronto in un README.
>
> `api/.env.rilascio` (ignorato da Git, caricato da nessuno) esiste per le credenziali
> che servono agli strumenti di backup e restore quando qualcuno le indica loro
> esplicitamente — non per rimettere in circolazione il deploy diretto.
>
> ### Spostare `DIRECT_URL`: si fa una volta, con un editor
>
> ⚠️ **A mano, non con un comando.** Una riga che riscrive `api/.env` con una
> pipeline può troncarlo se qualcosa va storto a metà, e quel file contiene ogni
> credenziale del progetto. Aprilo, sposta la riga, salva.
>
> 1. crea `api/.env.rilascio` — è già in `.gitignore`, non finirà mai in un commit;
> 2. **taglia** da `api/.env` la sola riga che comincia con `DIRECT_URL=` e incollala lì;
> 3. lascia `DATABASE_URL` dov’è: serve all’applicazione.
>
> ⚠️ **`DIRECT_URL_TEST` non si tocca**: è il database di prova in container, e resta
> in `api/.env` insieme a `DATABASE_URL_TEST`.
>
> Poi verifica, senza aprire i valori:
>
> ```bash
> grep -c "^DATABASE_URL=" api/.env        # deve dire 1
> grep -c "^DIRECT_URL="   api/.env        # deve dire 0
> grep -c "^DIRECT_URL="   api/.env.rilascio   # deve dire 1
> npm run check:bersaglio-condiviso
> ```
>
> ⭐ `grep -c` conta le righe e **non ne stampa nessuna**: i valori non compaiono a
> schermo né nella cronologia del terminale. L’ancora `^` e l’`=` finale escludono
> `DIRECT_URL_TEST`.
>
> Tre protezioni sono in piedi, ma **nessuna ferma un terminale**:
> `npm run check:bersaglio-condiviso` (dentro `npm run lint`) verifica che `DIRECT_URL`
> non sia rientrata nel `.env` e che `directUrl` sia ancora dichiarato nello schema —
> ⚠️ **la seconda condizione è quella che non si vede**: tolta quella riga, `migrate
deploy` ripiega su `DATABASE_URL`, che nel `.env` resta perché serve all’applicazione.
> `.claude/settings.json` blocca quei comandi nelle sessioni Claude Code, e
> `npm run prisma:migrate` e `npm run prisma:deploy` sono stati sostituiti da guardie
> che spiegano cosa fare.
>
> ⚠️ **Restano fuori `db seed`, `prisma studio` e gli script `.mjs`**: passano dal
> CLIENT Prisma, che usa `DATABASE_URL` e legge `api/.env` per conto proprio. Chiedono
> conferma mostrando il bersaglio mascherato; si chiuderanno davvero quando
> `DATABASE_URL` locale punterà al database di prova duplicato (`docs/DA-FARE.md`).
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
