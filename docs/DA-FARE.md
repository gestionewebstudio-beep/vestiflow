# Cosa resta da fare — VestiFlow

## ⛔ IL RESIDUO DEL BERSAGLIO CONDIVISO — aperto il 07/09/2026

> **`DATABASE_URL` resta in `api/.env` perché serve all’applicazione. Quindi tre
> percorsi possono ancora raggiungere il database di sviluppo condiviso, e non è
> una svista: è una conseguenza che si chiude solo spostando il bersaglio.**

⭐ **Quello che è chiuso**: i comandi di migration. `migrate deploy`,
`db execute --schema` e `migrate resolve` passano da `directUrl`, che non sta più
nel `.env` — falliscono con **P1012 prima di aprire una connessione**. La guardia
`npm run check:bersaglio-condiviso` tiene ferme le due condizioni da cui dipende.

⚠️ **Quello che resta aperto**: tutto ciò che passa dal **client** Prisma, che usa
`url` e legge `api/.env` **per conto proprio** — misurato, non dedotto: con il
`.env` rimosso il client non si connette, con la porta cambiata nel file contatta
la nuova porta.

| Percorso                                                      | Cosa può fare                    | Attrito attuale                        |
| ------------------------------------------------------------- | -------------------------------- | -------------------------------------- |
| `npm run prisma:seed`                                         | 18 scritture                     | conferma se il bersaglio non è locale  |
| `npm run prisma:studio`                                       | scrive da interfaccia            | conferma se il bersaglio non è locale  |
| `node api/scripts/delete-tenant.mjs <id>`                     | **21 `deleteMany` + 1 `delete`** | conferma se il bersaglio non è locale  |
| `provision-e2e-permission-users.mjs`                          | crea utenti                      | conferma se il bersaglio non è locale  |
| `backfill-catalog-origin`, `backfill-shopify-order-documents` | scrivono                         | già protetti da `--apply`              |
| `npm run start:dev`                                           | scrive come applicazione         | ⭐ nessuno, ed è voluto: è lo sviluppo |

⭐ **La conferma scatta SOLO se il bersaglio non è locale**, ed è la parte pensata
per durare: il giorno in cui `DATABASE_URL` punterà al database di prova duplicato,
smetterà di comparire da sola. Nessuno dovrà ricordarsi di togliere niente.

### ⛔ `start:dev` in WATCH esegue il lavoro NON COMMITTATO — accertato il 09/09/2026

> **L'ultima riga della tabella dice «nessun attrito, ed è voluto: è lo sviluppo». È vero
> per il codice committato. Con un watcher attivo mentre si lavora, quel percorso esegue
> anche le modifiche in corso, contro il condiviso, prima che siano verificate.**

Accertato in sola lettura, senza toccare il database:

| Evidenza    |                                                                                                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| processi    | `nest start --watch` (pid 26692, dalle 07:08) → `cmd` → `node …\vestiflow\api\dist\main` (pid 24564, **riavviato alle 08:11:43**), in ascolto su `:3000`. Nessun processo esegue da `C:\vf-stabile` |
| bersaglio   | `api/.env` → `DATABASE_URL` = pooler **condiviso** (`…pooler.supabase.com:6543`, `connection_limit=5`), non `DATABASE_URL_TEST` (`localhost:5433/vestiflow_test`)                                   |
| connessione | `Get-NetTCPConnection`: **ESTABLISHED** verso il pooler **due secondi dopo l'avvio** — `PrismaService.onModuleInit` fa `$connect()`                                                                 |
| riavvii     | almeno tre osservati nella sessione; e `npm run build` scrive nella **stessa** `dist/` che quel processo esegue                                                                                     |

⚠️ **Che cosa NON è accertato, e non va dichiarato**: se siano state eseguite query
applicative. `$connect()` apre la connessione senza interrogare, non esistono job
schedulati nel codice (`@Cron`, `ScheduleModule`, `@Interval`: nessuno), `SHOPIFY_APP_URL`
punta a `localhost:3000` quindi **nessun webhook Shopify raggiunge quel processo**, e non
c'è nessun file di log da leggere. Resta possibile che il **frontend** (`ng serve` sulla
4200, vivo) abbia fatto richieste se il browser era aperto: non c'è evidenza né in un
senso né nell'altro.

⛔ **Il rischio concreto misurato in questa sessione**: le due migration del registro
(`import_rifiutato`, `riaggancio_rifiutato`) sono applicate **al solo database di prova**,
mentre il processo in watch eseguiva il codice che scrive quei valori. Su un rifiuto reale
l'`INSERT` sarebbe caduto con «invalid input value for enum» — cioè **codice avanti allo
schema**, la coppia che `regole-qualita` vuole tenere insieme, spezzata dal watcher e non
da un comando.

⭐ **Azione presa il 09/09/2026, su autorizzazione**: fermati **quei tre soli** processi
(watcher e discendenti), con guardie che verificano un unico watcher, l'appartenenza al
ramo di lavoro e l'assenza di `vf-stabile`. Porta 3000 libera; `ng serve` sulla 4200
**intatto**; nessuna configurazione toccata, nessuna migration applicata al condiviso.

⛔ **Non si riavvia** finché `DATABASE_URL` di sviluppo non punta a un ambiente isolato:
riavviarlo ora rimetterebbe il lavoro in corso davanti al condiviso. È lo stesso «come si
chiude davvero» qui sotto — con una condizione in più: **finché si lavora sul ramo, il
watcher e il condiviso non stanno insieme**.

⚠️ **L’attrito non è una barriera**, e non va raccontato come tale: chi lancia il
comando può confermare. Serve a rendere visibile il bersaglio — che prima non lo
era: `delete-tenant.mjs` cancellava un tenant intero dal condiviso senza nominarlo,
e il log del backup diceva solo «Connessione: DIRECT_URL».

### Come si chiude davvero

**Quando esisterà l’ambiente di prova duplicato**, `DATABASE_URL` di `api/.env`
punterà a quello, e le credenziali di produzione staranno fuori dai computer di
sviluppo. Da quel momento:

- i tre percorsi qui sopra atterrano sul duplicato, e la conferma non compare più;
- `npm run start:dev` scrive sul duplicato, che è ciò che si vuole;
- la produzione si raggiunge solo da Railway o da una procedura protetta.

⛔ **Fino ad allora nessuno dei tre va dichiarato «risolto»**: sono attenuati, non
chiusi, e la differenza conta il giorno in cui il gestionale avrà dati veri.

### ✅ Due cose viste lavorando, e chiuse il 07/09/2026

- ✅ **Il test della guardia gira in CI**, nel job `lint-and-test` di `ci.yml` che ha
  già le due installazioni: passo «Prove delle guardie e dei caricatori di ambiente».
  ⭐ **Serviva perché `npm run lint` non basta**: esegue la guardia e dice se OGGI il
  repository è a posto, non se la guardia funzionerebbe ancora dopo una modifica — una
  regex svuotata la lascerebbe verde per sempre. Il passo la mette alla prova su alberi
  finti: `DIRECT_URL` rimessa in un `.env`, `directUrl` tolta da uno schema, il valore
  che non deve comparire nell’output.
- ✅ **`scripts/backup/load-env.spec.mjs` non assume più il nome della cartella.**
  Asseriva `repoRoot` contro `/vestiflow$/i` — cioè contro **dove qualcuno ha messo il
  repository**, non contro una proprietà del codice: rosso in ogni worktree, in ogni
  copia per un collaudo, e per chiunque rinomini la cartella dopo il clone. Ora
  verifica la **relazione**: `repoRoot` è due livelli sopra `scripts/backup/`, e la
  prova regge ovunque. ⭐ E i test dei caricatori ora girano davvero: prima non li
  eseguiva nessuno, ed è per questo che il difetto è stato scoperto solo lavorandoci.

---

## ⛔ COLLAUDO DISTRUTTIVO SHOPIFY — quattro lacune di schema, 07/09/2026

> **Misurate contro PostgreSQL vero, non dedotte dallo schema.** Il collaudo
> (`api/src/test/integration/shopify-distruttivo.integration-spec.ts`, 36 prove)
> ha trovato quattro divergenze fra ciò che lo schema Prisma dichiara e ciò che
> il database applica. Nessun test a mock poteva vederle: un mock non ha vincoli
> di integrità.

### 1 · `shopify_inventory_sync_states.location_id` NON HA CHIAVE ESTERNA

```text
relazioni verso Location nello schema Prisma   21
chiavi esterne verso locations nel database    20
```

⛔ **La colonna esiste, la relazione è dichiarata, il vincolo non c'è.**
Cancellare una sede lasciava quella riga orfana, puntando a un id che non
esiste più, e nessun vincolo se ne accorgeva.

⚠️ **Oggi la protezione è solo applicativa**: `RIFERIMENTI_SEDE` include quella
relazione, quindi `canDeleteLocation` la conta e rifiuta. È una difesa nel
chiamante, non nel database: un percorso nuovo che chiamasse `location.delete`
senza passare di lì tornerebbe a creare orfani.

**Da fare**: portare la colonna sotto vincolo. Tranche schema separata — la
migration è condivisa col ramo del collega, e va misurato prima quante righe
orfane esistono già.

### 2 · Schema Prisma e database DIVERGONO sull'azione di due FK

| Relazione                             | Prisma dice                           | il database applica |
| ------------------------------------- | ------------------------------------- | ------------------- |
| `SalesOrder.locationId`               | `SetNull` (opzionale, non dichiarata) | **RESTRICT**        |
| `SupplierOrder.destinationLocationId` | `SetNull` (opzionale, non dichiarata) | **RESTRICT**        |

⭐ **Il database è più protettivo dello schema**, quindi non c'è perdita di
dati. Ma qualunque ragionamento fatto leggendo lo schema Prisma sbaglia su due
relazioni su ventuno — ed è il motivo per cui `check:cascate-sede` non decide
più in base all'azione: pretende che ogni relazione sia dichiarata, qualunque
cosa faccia.

### 3 · `mapPurgeError` nomina una causa che non c'entra

⛔ Ogni violazione di chiave esterna (P2003) durante la purga diventa:

```text
«…Chiudi gli ordini fornitore aperti e riprova.»
```

**Misurato con tutti gli ordini fornitore chiusi**: a bloccare era
`online_sales.sales_order_id`, che è `RESTRICT`. L'operatore chiude gli ordini
fornitore, riprova, fallisce di nuovo, e non ha modo di sapere perché.

⚠️ **Non è perdita di dati: è il suo opposto.** Il database protegge e la
transazione non lascia niente a metà. È un difetto di diagnosi.

⏸ **Che cosa debba dire il messaggio è una decisione non presa** — vedi sotto.

### 4 · `stock_reservations.sales_order_id` è `CASCADE`, confermato

Cancellare un ordine Shopify cancella i suoi impegni di magazzino, lasciando
`inventory_levels.committed` gonfio di impegni che non esistono più. La guardia
introdotta col commit `e0a837ab` lo impedisce, e il collaudo lo verifica contro
il database vero (scenario 4).

---

## ⏸ DECISIONI FUNZIONALI APERTE — emerse dal collaudo, non decise

Ognuna è **fotografata da una prova**: il giorno in cui la decisione verrà
presa e applicata, quella prova diventerà rossa e lo dirà.

| #   | Domanda                                                                                         | Comportamento attuale                 | Prova          |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------- | -------------- |
| A   | Una sede **realmente vuota** dev'essere eliminata o sempre archiviata?                          | eliminata                             | scenari 10, 11 |
| B   | Una sede **con dati** può essere disattivata da un sync di canale, senza che nessuno lo chieda? | sì, `isActive: false`                 | scenario 13    |
| C   | Un **cliente Shopify** importato può essere eliminato fisicamente?                              | oggi la purga fallisce prima          | scenario 14    |
| D   | Un **ordine Shopify** con vendita online collegata può essere eliminato?                        | no, il database lo impedisce          | scenario 14    |
| E   | Se un documento perde il cliente, deve conservarne uno **snapshot**?                            | non applicabile finché C non è deciso | —              |

⚠️ **La B è la più insidiosa**: la sede sparisce dai selettori operativi e
`setLicensedLocations` rifiuta di riattivarla («Riattivale da Shopify Admin»,
istruzione impossibile per una sede che su Shopify non esiste più).

---

## Matrice distruttiva — Shopify, aggiornata al 07/09/2026 (dopo le correzioni)

⛔ **Qui c'era la matrice del comportamento PRECEDENTE**, scritta prima delle
correzioni: descriveva `purge()` che cancellava clienti e ordini, e i tre
percorsi di sincronizzazione che eliminavano o disattivavano sedi. È rimasta
ferma mentre il codice cambiava sotto — il difetto che questo progetto combatte
ovunque, in un documento invece che nel codice.

| Operazione                            | Chiamante                                                      | Entità            | Effetto oggi                                                                   | Collaudo           |
| ------------------------------------- | -------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ | ------------------ |
| `disconnect()`                        | `DELETE /shopify/connection` (owner)                           | ShopifyCredential | cancella le **credenziali**; le sedi perdono `shopifyLocationId`; nient'altro  | ✅ scen. 1         |
| `purge(*)` — ogni combinazione        | `POST /shop-change/purge`                                      | —                 | ⛔ **rifiutata prima di ogni lettura**: nessun record cambia                   | ✅ 7 combinazioni  |
| `syncFromShopify()` → sede sparita    | `POST /sync/locations` (owner) e **callback OAuth automatico** | Location          | conserva sede, identificativo e dati; segnala `shopifySyncStatus: error`       | ✅ scen. 8, 10, 12 |
| `cleanupUnlinkedImportLocations()`    | stessa catena                                                  | Location          | conserva e segnala; **non disattiva più**                                      | ✅ scen. 13        |
| ~~`removeEmptyOnboardingLocation()`~~ | —                                                              | —                 | **rimossa**: esisteva solo per eliminare                                       | —                  |
| `applyOrderFromShopify()`             | webhook ordini, pull bulk                                      | SalesOrderLine    | riscrive le righe dell'ordine; **payload senza righe → aggiornamento sospeso** | ✅ 6 scenari       |

⭐ **Le uniche cancellazioni rimaste nel perimetro Shopify** sono su entità
tecniche del canale — stato OAuth, credenziali — e sulle righe figlie di un
ordine che il canale possiede. Verificate una per una, e sorvegliate da
`check:shopify-inventario`.

⚠️ **La colonna «log» resta la ragione per cui serve un registro persistente**:
di un'operazione resta una riga di `logger` sul container, che Railway perde al
riavvio. Non c'è modo di dire **chi** ha innescato un sync, **quando**, e con
quale effetto.

---

## ✅ LE REGOLE SEDI, CLIENTI E ORDINI SONO IMPLEMENTATE — 07/09/2026

> **Le otto regole di `docs/24` §§1.13-1.14 sono in codice e sotto collaudo su
> PostgreSQL reale.** Qui resta ciò che il modello storico non ancora esistente
> impedisce di fare bene, e i debiti che la correzione ha lasciato dietro.

### Che cosa fa oggi la sincronizzazione delle sedi

| Situazione                        | Prima                        | Ora                                             |
| --------------------------------- | ---------------------------- | ----------------------------------------------- |
| sede vuota, non collegata         | **eliminata**                | conservata                                      |
| sede vuota, sparita da Shopify    | **eliminata**                | conservata, collegata, segnalata                |
| sede con dati, sparita da Shopify | disattivata e **scollegata** | conservata, operativa, **collegata**, segnalata |
| residuo di import non collegato   | **disattivato**              | conservato, segnalato                           |
| sede `LOC-01` di onboarding vuota | **eliminata**                | conservata                                      |
| purge, ogni combinazione          | eseguita in parte            | **rifiutata** prima di ogni lettura             |

Il segnale è `shopifySyncStatus: error` più un messaggio che dice all'operatore
che cosa è successo e che cosa può fare.

---

### ⏸ Che cosa NON è implementabile senza `shopify_location_links`

⚠️ **Il titolo va letto con una precisazione del 07/09/2026**: la tabella **è
scritta** (migration `20260907000000_shopify_link_history`, punti 1 e 9 sotto).
Ciò che manca non è più lo schema: è il **backfill** e il passaggio dei servizi,
quindi le tabelle sono vuote e nessun lettore le interroga. Il ripiego qui sotto
resta perciò in vigore esattamente com'è descritto.

⛔ **Il comportamento definitivo di §1.13.3** — «il collegamento si chiude
conservandone la storia» — **non è implementabile oggi**, e ciò che c'è al suo
posto è un ripiego dichiarato.

| Regola                                                             | Perché serve lo storico                                                                                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «il collegamento **viene chiuso** conservandone la storia»         | non esiste un posto dove scrivere che un collegamento è finito: c'è solo `shopifyLocationId`, che è presente o assente                                                       |
| «una nuova location con lo stesso nome **non viene riagganciata**» | oggi il riaggancio per nome è impedito solo perché l'identificativo **non viene azzerato**: se una location tornasse con un id nuovo, `findMatch` la riaggancerebbe per nome |
| «VestiFlow **mostra** che la location non è più disponibile»       | oggi lo dice un messaggio d'errore su un campo che serve anche ad altro; è leggibile, non è uno stato del collegamento                                                       |

⚠️ **Il ripiego ha un costo, ed è giusto conoscerlo**: la sede resta collegata a
un identificativo Shopify che non esiste più. È deliberato — la traccia vale più
della coerenza formale — ma significa che una sede può restare in quello stato a
tempo indefinito, e nessuno la riconcilia se non l'operatore.

⭐ **Lo stesso vale per clienti e ordini**: §1.14 dice «può chiudere o sospendere
il collegamento», e nemmeno quello esiste. Per questo la purge non è stata
riscritta come scollegamento: è stata **sospesa**. Scrivere lo scollegamento
senza il posto dove registrarlo avrebbe prodotto un secondo ripiego, in un
percorso che l'operatore invoca esplicitamente.

---

### Debiti lasciati dalla correzione

**1 · `verificaSedeCancellabile` e `RIFERIMENTI_SEDE` non hanno consumatori di
produzione.** Sono il contratto della funzione VestiFlow dedicata
all'eliminazione (§1.13.4), che non esiste ancora. Restano verificati da
`check:cascate-sede` e dalle 21 prove generate dall'elenco — non è codice
dimenticato, è un contratto in attesa del suo consumatore. Quando la funzione
dedicata verrà scritta, deve usare quello e non riscriverne un altro.

**2 · `mapPurgeError` è stata rimossa col resto della purga**, e con lei il
difetto che traduceva ogni violazione di chiave esterna in «Chiudi gli ordini
fornitore aperti». Non è stato corretto: è diventato irraggiungibile. Quando la
purga tornerà come scollegamento, servirà una traduzione degli errori — e quella
dovrà nominare il vincolo vero.

**3 · `preview()` conta ancora `removableShopifyLocations`.** Promette una
capacità che non esiste più: nessuna sede è rimovibile da lì. Non è distruttivo
— l'anteprima è di sola lettura — ma il numero è una promessa falsa, e il
frontend lo mostra.

**4 · ✅ `notIn: []` — MISURATO, ERA UN DIFETTO, CORRETTO il 07/09/2026.**

⛔ **Era una deduzione, e la deduzione era giusta.** Misurato contro PostgreSQL
17.11: `prisma.salesOrderLine.deleteMany` con
`externalLineId: { notIn: [] }` cancella **tutte** le righe — `count = 2` su
due righe che avevano entrambe un `externalLineId`.

⚠️ **Che cosa sarebbe successo.** Un ordine con righe e impegni attivi,
raggiunto da un payload magro — risposta troncata, webhook parziale, errore di
serializzazione a monte — perdeva TUTTE le righe. Gli impegni venivano poi
rilasciati dal dominio, perché `emitCanonicalOrderEvents` ricostruisce le righe
correnti rileggendole dal database: nessuna riga, nessun impegno da tenere. La
giacenza tornava disponibile per merce già venduta.

⭐ **La correzione è a monte, non sulla query**: un payload senza righe sospende
l'aggiornamento, conserva righe e impegni, e registra un errore di
sincronizzazione sulla connessione. Un ordine Shopify senza righe non esiste: se
il payload non ne porta, è il payload a essere incompleto — non l'ordine.

Sei scenari in `shopify-righe-ordine.integration-spec.ts`, più la misura del
comportamento di Prisma come contratto dello strumento: se un aggiornamento ne
cambiasse la semantica, quella prova diventerebbe rossa e lo direbbe.

---

### Collaudi da eseguire quando lo storico esisterà

- collegamento creato, chiuso, e **non riagganciato** al ritorno della location;
- una location che torna con un **id nuovo** e lo stesso nome: non si riaggancia;
- scollegamento di un cliente e di un ordine: l'entità resta, il collegamento no;
- riconnessione allo stesso `shop_gid` dopo uno scollegamento: la storia è leggibile.

---

## ⏸ LE FK VERSO `Location` RESTANO IN CASCATA — tranche schema, aperta il 07/09/2026

> **Il rischio è chiuso nel CODICE, non nello SCHEMA.** `canDeleteLocation` ora
> rifiuta di cancellare una sede che porterebbe via qualcosa, e la sede viene
> archiviata invece che eliminata. Ma se domani un percorso nuovo chiamasse
> `location.delete` senza passare di lì, il database eseguirebbe la cascata
> senza dire niente.

⛔ **Qui c'era «aperto: `canDeleteLocation` non controlla tutto ciò che la
cascata porta via», con una tabella di quattro `Cascade`.** Erano quattro su
**undici**: il censimento completo, fatto il 07/09/2026 leggendo lo schema, ha
trovato **21 relazioni verso `Location`** —

```text
 4  Cascade    l'entità collegata SPARISCE
 7  SetNull    l'entità resta, ma perde la sede — in silenzio
10  Restrict   il database rifiuta il DELETE: si difendono da sole
```

⚠️ **Le sette `SetNull` erano invisibili perché NON SONO DICHIARATE.** Quindici
relazioni su ventuno non scrivono `onDelete`, e il default di Prisma dipende
dall'opzionalità: `Restrict` se la relazione è obbligatoria, `SetNull` se è
facoltativa. Una lettura che cercasse `onDelete: Cascade` nello schema ne
perderebbe sette su undici — ed è esattamente quello che era successo.

⭐ **Fra le sette c'è `Document.locationId`**: cancellare una sede scollegava i
documenti che l'avevano emessa, lasciandoli senza sede di origine.

⚠️ **`DocumentCounter` resta il più insidioso**: è la numerazione dei documenti
di quella sede. Cancellarla non rompe niente subito — settimane dopo la serie
riparte da un numero già usato, il vincolo di unicità lo rifiuta, e il guasto si
manifesta lontano dalla causa.

### Che cosa resta da fare, e perché non ora

**Portare le quattro `Cascade` a `Restrict`** è la difesa che vale anche per il
codice che non è ancora stato scritto: sposta la protezione dal chiamante al
database, dove nessun percorso nuovo può scavalcarla.

⛔ **Richiede una tranche schema separata** — decisione del proprietario del
07/09/2026, presa insieme alla patch di sicurezza. Non è prudenza generica: una
migration su questo database è condivisa con il ramo del collega, e cambiare una
FK a `Restrict` fa fallire ogni percorso che oggi si affida alla cascata. Va
misurato prima quali sono.

⭐ **Nel frattempo la protezione è verificata da due guardie che si tengono a
vicenda**, ed è il motivo per cui il rinvio è accettabile:

| Guardia                          | Che cosa impedisce                                               |
| -------------------------------- | ---------------------------------------------------------------- |
| `npm run check:cascate-sede`     | che l'elenco delle relazioni resti indietro rispetto allo schema |
| le 11 prove generate dall'elenco | che una voce dichiarata non trattenga davvero la sede            |

⚠️ **La stessa domanda vale per il `canDeleteLocation` gemello** in
`shopify-shop-change.service.ts`, che sopravvive perché `preview()` lo usa per
CONTARE le sedi rimovibili: conta come rimovibile una sede che porterebbe via i
contatori, quindi il numero mostrato all'operatore è ottimista. Non distrugge
niente — la purga del catalogo è sospesa — ma il numero è sbagliato.

---

## ⛔ UN FIX DI PERDITA DATI È RIMASTO 29 GIORNI FUORI DA `main` — 07/09/2026

> **Il difetto che ha distrutto le giacenze di un tenant era già stato trovato,
> corretto e coperto da un test. La correzione non è arrivata in produzione, e
> nessuno se n’è accorto per un mese.**

```text
c4044d98   06/08/2026 12:33   ultimo commit servito da Railway
81a9fc45   08/08/2026 16:28   il fix: «disconnettere sospende, non cancella»
b2b3c8ab   10/08/2026 20:04   il fix entra in develop
                              ⋮  29 giorni
03/09/2026 ~18:51 UTC         ⛔ il danno: giacenze e movimenti cancellati
9b59a14b   06/09/2026 19:44   il fix entra finalmente in main
```

⭐ **Il test esisteva già** — «disconnect non cancella giacenze, movimenti,
conteggi né ordini fornitore», introdotto dallo stesso commit del fix. Girava in
CI su `develop` a ogni PR, ed è sempre stato verde. **Non ha protetto nessuno**,
perché ciò che gira in produzione non era quel ramo.

⚠️ **Questo NON è un difetto di codice**: il codice era corretto dall’08/08. È un
difetto del **rilascio**, e va chiuso lì — nella patch di sicurezza non entra.

### ⛔ La guardia sbagliata da NON scrivere

Una guardia «`main` deve contenere `develop`» sarebbe **falsa come regola**: i due
rami divergono legittimamente, e `develop` contiene lavoro non ancora rilasciabile.
Fallirebbe quasi sempre, e una guardia che fallisce sempre si impara a ignorare —
è già scritto in `regole-qualita` a proposito del gate di copertura.

### La politica da definire: cinque punti

|                                         |                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 · classificare**                    | un fix che impedisce una perdita di dati porta un’etichetta esplicita — `perdita-dati` sul commit o sulla PR. Oggi `81a9fc45` non si distingue da un `fix` qualunque, e la sua urgenza si legge solo aprendo il registro dei difetti |
| **2 · promuovere**                      | un fix così classificato non aspetta il prossimo rilascio: va su `main` da solo, con la sua PR                                                                                                                                       |
| **3 · verificare dopo il deploy**       | che il commit correttivo sia **davvero** nell’immagine in esercizio. `git merge-base --is-ancestor <fix> origin/main` dice solo che è nel ramo, non che Railway lo stia servendo                                                     |
| **4 · controllare la versione servita** | oggi l’API di produzione non espone il commit che sta eseguendo: `/health` risponde `{"status":"ok","database":"up"}` e basta. Senza quel dato, «è in produzione?» non è una domanda a cui si possa rispondere da fuori              |
| **5 · registrare l’esito**              | data di rilascio e verifica, accanto al difetto nel registro                                                                                                                                                                         |

⭐ **Il punto 4 è quello che avrebbe rotto il silenzio.** Con il commit servito
esposto da `/health`, chiunque avrebbe potuto vedere il 09/08 che la produzione
era ferma al 06/08 — e il difetto è vissuto un altro mese proprio perché quella
domanda non aveva risposta.

⚠️ **Non è una guardia automatica**: è una politica, e va decisa. Qui è registrata
come debito, non come lavoro fatto.

---

## Cassa — correzioni del preflight (aggiornato 06/09/2026)

- Consegna 05/09: corretto l'editing quantità checkout. Il vuoto resta in modifica,
  la riga si rimuove solo con **Togli**, le quantità invalide bloccano nuovi invii.
  Totali sull'ultima quantità valida con avviso, quote conservate, recupero del
  comando incerto senza perdere il draft. Confrontati validator e componenti
  documentali esistenti; riusato il mixin mobile condiviso per mantenere quantità
  e Togli accessibili, campo da 44 px. Digitazione e clipboard reali verificate
  su desktop e mobile, comprese scansioni e risposta persa già committata nel DB.
- Precisazione IVA: **il controllo netto + IVA = lordo non distingue i regimi**.
  Il censimento del 05/09 (25 Nature/sei modalità, 72 codici nel condiviso) è
  storico, non rieseguito. Dopo approvazione, la sola Cassa ora accetta nuovi
  checkout `standard` o `zero_rate` a zero, escludendo i codici solo acquisti.
  Rifiuta esplicitamente RC, split, margine, informativo e `zero_rate` positivo,
  anche con imposta arrotondata a zero. Catalogo, primitive e autorizzazioni
  invariati; replay e resi conservano lo storico. Prove e limiti aggiornati nella
  specifica, sezione «Perimetro IVA temporaneo approvato».
- Verificata l'immutabilità sui percorsi alternativi del banco e dei documenti,
  inclusi allegati e conversione: 38 prove HTTP su PostgreSQL TEST, a sessione
  aperta e chiusa. Il normale banco e il reso autonomo restano modificabili.
- Corretto il retry di vendita e reso: conservazione del comando nel browser,
  impronta completa e nuova verifica della sede sul replay, anche dopo revoca.
  Prove dedicate: 28 HTTP sul database isolato e 27 frontend; il collaudo finale
  browser/API/database resta distinto dai test delle schermate con API simulate.
- Corretta la ripartizione dei resi successivi sugli importi originali: 36,56 €
  si esauriscono esattamente, conservando imponibile + IVA = lordo e i prezzi
  unitari Decimal. L'anteprima usa lo stesso calcolo del salvataggio e le quote
  ancora rimborsabili. Prove dedicate: 28 HTTP, incluse concorrenza e anomalie
  storiche; 226 test di integrazione Cassa/collegamenti e 54 economici passati.
- Applicata solo su PostgreSQL TEST la nuova migration correttiva
  `20260905210000_protezione_storico_dispositivi_cassa`: RLS e revoche anche a
  PUBLIC, senza riscrivere la migration originaria. Passano 16 prove sui
  privilegi reali, accessi con GRANT accidentali e percorsi HTTP dello storico.
- Corretto il backup tecnico: registro condiviso delle entità, ZIP v4 completo
  della Cassa e dipendenze, compatibilità v3 quando i riferimenti sono presenti,
  cataloghi globali risolti per chiave e mai riscritti. Ripristino DB atomico,
  allegati caricati su nuovi percorsi prima della pubblicazione dei riferimenti,
  cancellazione amministrativa con lo stesso ordine e revoca della cache profili.
  Passano 28 prove su PostgreSQL TEST: export/ZIP/import HTTP, privilegi admin,
  riferimenti invalidi/cross-tenant, rollback e SDK Storage su endpoint HTTP locale.
  Lo Storage Supabase condiviso non è stato contattato; dettagli e limiti in
  `BACKUP-DISASTER-RECOVERY.md`, sezione sul backup logico del tenant.
- Collaudate le 158 migration da zero e l'aggiornamento dal `develop` locale
  (`d0a1d95b`, 147 migration), con documenti, quota legacy e Decimal rappresentativi.
  Un terzo percorso verifica la nuova RLS su uno storico dispositivi già popolato
  con privilegi concessi: dati invariati e privilegi revocati. Comando esplicito
  `npm --prefix api run test:migration:cassa`, protetto sul solo database TEST.
  Il baseline supportato mantiene vuote le tabelle dormienti della vecchia Cassa;
  non è una conversione di una precedente Cassa già in esercizio.
- Collaudato il percorso browser → API Nest → PostgreSQL TEST su desktop e mobile:
  accesso con SDK ordinario/emittente locale, apertura, IVA 22% e Decimal,
  pagamento misto/resto, risposte perse e recupero dopo modifica carrello o reload,
  resi 1+2 da 36,56 €, versamento/prelievo, chiusura e registro. Due percorsi
  completi passati senza risposte simulate alle API gestionali. Comando root
  `npm run test:cassa:real`; screenshot, trace e richieste in
  `test-results/cassa-browser-real/`. Il provider Auth locale non certifica
  l'infrastruttura Supabase o il suo MFA reale.
- Il job CI Cassa esegue migration, integrazione API, browser reale e regressioni
  UI isolate, sul PostgreSQL effimero senza segreti. Il baseline upgrade è fissato
  al commit verificato, per conservarlo dopo il futuro merge. La CI remota non
  è stata avviata: nessun push. Le verifiche complessive locali sono concluse.
- Corretto il contratto checkout: anteprima IVA dalle primitive condivise con
  snapshot completo (incluse aliquote frazionarie), arrotondamento a fine riga,
  traduzione di `totaleMinor`/`restoMinor` dal server. Passano 13 prove frontend
  e 3 HTTP reali. La Cassa rifiuta codici IVA espliciti non disponibili nel tenant
  e modalità che produrrebbero imponibile + IVA diversi dal lordo pagato, senza
  effetti economici. Il supporto dei regimi particolari resta da definire;
  non è stato cambiato il calcolo della normale Vendita al banco.
- Prestazioni mobile ferme alla tranche conclusa: il limite a grandi volumi resta.
  Nessun rilascio o intervento sul database condiviso è incluso in queste correzioni.

### ⭐ PREFLIGHT ESEGUITO — le 11 migration provate davvero (06/09/2026)

Non su carta: su un database **ripristinato dal backup del condiviso** e usa-e-getta.
Nessuna migration è stata applicata al condiviso, che è rimasto in sola lettura.

```text
1  backup cifrato del condiviso   pg_dump via container, 454 kB, fuori dal repository
2  ripristino su usa-e-getta      postgres:17 su :5433 — MAI sul condiviso
3  verifica del ripristino        75 tabelle, 147 migration, conteggi IDENTICI
4  le 11 con prisma:deploy:test   158 applicate, 0 annullate, 0 interrotte
```

#### Che cosa hanno prodotto le 11

|                            |                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| tabelle                    | 75 → **77** (`payment_method_codes`, `cash_session_device_changes`)                          |
| protezione delle due nuove | `rls=true`, e **zero privilegi** ad `anon`, `authenticated`, `PUBLIC`                        |
| codici normativi           | 23 seminati, da MP01 a MP23                                                                  |
| Tipi pagamento             | 148 totali → **112 collegate** a un codice, **16 classificate** per l'incasso                |
| `cash_sessions`            | `expected_electronic_minor` e `declared_electronic_minor` presenti; le due `_other_` sparite |

⭐ **RLS su tutto lo schema migrato**: 76 tabelle su 77 con RLS abilitata, e l'unica
esente è `_prisma_migrations` — la contabilità di Prisma, fuori dal perimetro. **Nessuna
tabella concede privilegi ad `anon` o `authenticated`.**

⚠️ **La sonda live non è stata eseguita, e va detto perché**: `check-rls` interroga la
Data API di Supabase con `SUPABASE_ANON_KEY`, che **non è in `api/.env`** — è un secret di
GitHub. E anche potendo, interrogherebbe il **condiviso**, dove le 11 non sono applicate:
non direbbe nulla sullo schema migrato. La verifica sopra, fatta sui privilegi effettivi
del database migrato, è l'equivalente locale e per questo schema è più stretta.

#### `main@c4044d98` contro lo schema migrato

Worktree isolato, dipendenze proprie, **client Prisma generato dallo schema di main** —
l'unico modo di provare quello che main fa davvero.

```text
✅ avvio API           /api/v1/health → HTTP 200, {"status":"ok","database":"up"}
✅ letture ordinarie   tenant, prodotti+varianti, documenti+righe, Tipi pagamento
✅ Tipo pagamento      creato, modificato, riletto, cancellato
✅ documento           risalvato col deleteMany delle righe (documents.service.ts)
```

#### ⛔ LA FK DEL RESO: il blocco è CONFERMATO, ed è peggio del previsto

`document_lines_returned_from_line_id_fkey` è `ON DELETE RESTRICT`. Misurato con quattro
prove in transazioni annullate:

| Caso                                                                       | Esito                   |
| -------------------------------------------------------------------------- | ----------------------- |
| cancellare una riga **non referenziata**                                   | ✅ riesce — è main oggi |
| cancellare la riga **puntata**, con la puntante viva                       | ⛔ rifiutata, `23503`   |
| **`deleteMany` di TUTTE le righe del documento**, col collegamento interno | ⛔ **rifiutata**        |
| cancellare le righe della **vendita**, col reso che le punta               | ⛔ rifiutata            |

⛔ **Il terzo caso è quello che conta, ed è controintuitivo**: anche cancellando la riga
referenziante nello **stesso statement**, `RESTRICT` rifiuta — non è differibile, a
differenza di `NO ACTION`. Quindi `documents.service.ts:1856`, che fa `deleteMany` delle
righe **a ogni salvataggio**, fallisce sul documento coinvolto.

⚠️ **Oggi non scatta**: `returned_from_line_id` è tutta `NULL`. **Si arma alla prima
vendita con reso fatta dal codice di develop** (`cash-return.service.ts:326`). Da quel
momento, riaprire e risalvare in main quella vendita non riesce più.

⭐ **La conseguenza operativa, e va decisa prima del rilascio**: applicare le 11 al
condiviso mentre la produzione gira ancora con `main` è sicuro **finché nessuno usa la
Cassa**. Non appena la Cassa registra un reso, main non può più risalvare quel documento.
Le due cose — migration al condiviso e `develop → main` — vanno quindi fatte **vicine**,
o la finestra in mezzo va tenuta senza resi.

#### Suite di integrazione di develop

**474 prove su 27 file, tutte verdi** sul database ripristinato e migrato.

⚠️ **La suite RISCRIVE i dati** (`svuota` e fixture): va eseguita **dopo** ogni misura sui
dati ripristinati, non prima. Costata una misura da rifare.

### ✅ DOPPIONI DEI TIPI PAGAMENTO — corretti con una migration dati (06/09/2026)

`20260906120000_ritiro_doppioni_sintetici_pagamento`, **dodicesima** pendente, dopo le
undici. ⛔ Nessuna migration già applicata è stata riscritta, e il condiviso non è stato
toccato: resta a **147 applicate**.

#### La regola, e cosa NON è

⛔ **Non è una deduplica per codice normativo**, ed è la distinzione che governa tutto.
Più Tipi pagamento distinti che puntano allo stesso `MPxx` sono **legittimi**: «Carta —
banco» e «Carta — online», entrambi MP08, che l'azienda vuole separati nei riepiloghi.
Una regola per codice li spegnerebbe, e sarebbe un difetto peggiore del doppione.

⭐ **Si ritira solo ciò che il progetto ha seminato due volte**, riconosciuto per **nome
letterale** delle due generazioni di seed. Cinque coppie, scritte una per una: nessuna
euristica, nessun `LIKE`, nessuna estrazione del codice dal nome.

Cinque condizioni, tutte necessarie, prima di spegnere una voce:

```text
nome         esattamente quello sintetico del seed nuovo
kind         'method'
is_system    true          ← una voce dell'utente non si tocca mai
is_active    true          ← se il titolare l'ha già spenta, non c'è niente da fare
codice       quello atteso ← un nome giusto con codice rimappato non è la coppia
storica      esiste nello STESSO tenant, di sistema, ATTIVA, stesso codice
```

⚠️ **L'ultima condizione è quella che protegge di più**: senza la storica accesa, la
sintetica **resta accesa**. Lasciare un tenant senza nessuna voce attiva per un codice
sarebbe molto peggio di un doppione.

⛔ **Nessuna riga viene cancellata**: si spegne `is_active`. Le quote incassate e gli
snapshot restano leggibili — `payment_option_id` continua a risolvere su una riga che
esiste, e `option_name_snapshot` conserva comunque il nome. Cancellare avrebbe azzerato
il riferimento (`ON DELETE SET NULL`) e lasciato la quota senza origine.

⭐ **La Cassa continua a mostrare tutte le opzioni ATTIVE.** Questa migration non tocca
la presentazione: riduce il numero di voci attive, che si vede in ogni elenco.

#### Provata sul database ripristinato, da 147

|                                       |                                                                 |
| ------------------------------------- | --------------------------------------------------------------- |
| migrazione                            | 147 → **159**, zero annullate, zero interrotte                  |
| doppioni sintetici attivi             | **20 → 0**                                                      |
| voci storiche                         | **20, tutte ancora attive**                                     |
| righe cancellate                      | **nessuna** (148 + 2 di prova = 150)                            |
| `(MPxx)` senza equivalente storico    | **72 su 72 ancora attive**                                      |
| due opzioni deliberate, stesso codice | **entrambe visibili**                                           |
| Cassa                                 | da **4 voci per tenant a 2** — «Contanti», «Carta di pagamento» |
| seconda applicazione                  | **zero modifiche**, nemmeno `updated_at`                        |

#### La prova automatica costruisce i casi che i dati veri non hanno

Sul condiviso non esistono opzioni utente omonime né coppie a metà: la prova in
`cassa-migrations.integration-spec.ts` le fabbrica. **Falsificata due volte**, una per
guardia:

```text
tolto  EXISTS della storica   → la (MP08) senza partner si spegne     ⛔ prova rossa
tolto  is_system              → la voce dell'UTENTE si spegne          ⛔ prova rossa
```

⚠️ **La seconda falsificazione non funzionava alla prima stesura**, e la nota serve: il
caso dell'utente aveva il codice a `null`, quindi a proteggerlo era il controllo sul
codice e non `is_system`. Reso stretto — nome esatto, codice giusto, storica accanto —
l'unica cosa che lo distingue è `is_system`, ed è finalmente quello che la prova verifica.

---

### ⚠️ NOTA DI RILASCIO — da tenere fino a rilascio avvenuto

**1. Il backup eseguito dimostra lo STRUMENTO, non sostituisce quello del rilascio.**
Il backup del 06/09/2026 serviva a provare che la catena funziona — e ha trovato tre
difetti che la rendevano inservibile. Prima di applicare le migration al condiviso serve
un **backup nuovo**, fatto in quel momento: quello vecchio non contiene ciò che è successo
nel frattempo.

**2. Migration e distribuzione del nuovo codice devono essere RAVVICINATE.** Fra le due
c'è una finestra in cui il database ha lo schema nuovo e la produzione gira ancora con
`main`. La finestra è sicura solo finché nessuno usa la Cassa.

**3. ⛔ Nessun reso prima del collaudo.** `document_lines_returned_from_line_id_fkey` è
`ON DELETE RESTRICT`, e misurato: rifiuta il `deleteMany` delle righe **anche quando la
riga referenziante è cancellata nello stesso statement**. Alla prima vendita con reso
registrata dal codice di develop, `main` non riesce più a risalvare quel documento —
`documents.service.ts:1856` fa quel `deleteMany` a ogni salvataggio.

### ⏸ DECISIONE APERTA — i Tipi pagamento sono doppi, e dopo le 11 si vedono (06/09/2026)

Misurato in **sola lettura** sul condiviso, e verificato sul database migrato per cosa
l'operatore vedrebbe davvero.

#### Il fatto

Tutti e **quattro** i tenant portano **due generazioni di seed insieme**. Trenta Tipi
pagamento «metodo» ciascuno, di cui **cinque coppie** che nominano lo stesso codice
normativo — e in tutti e quattro i tenant **entrambe le voci di ogni coppia sono attive**:

```text
MP01   «Contanti»            +  «Contanti (MP01)»
MP02   «Assegno»             +  «Assegno (MP02)»
MP05   «Bonifico bancario»   +  «Bonifico (MP05)»
MP08   «Carta di pagamento»  +  «Carta di pagamento (MP08)»
MP12   «RiBa»                +  «RIBA (MP12)»
                                        20 coppie attive su 4 tenant
```

⭐ **Non è un difetto delle 11 migration.** La `20260904120000` lo sapeva già: ha due
blocchi di backfill, `4a` per i nomi nuovi e `4b` per quelli vecchi, col commento
«misurato il 04/09/2026: i clienti usano _Bonifico bancario_». Le migration **collegano
entrambe** al codice, ed è la scelta giusta — scollegare quella vecchia perderebbe il
significato normativo dei documenti che la usano.

#### Che cosa vedrebbe l'operatore in Cassa

Misurato sul database migrato, per ogni tenant:

```text
  Contanti                    (cash)
  Carta di pagamento          (electronic)
  Contanti (MP01)             (cash)
  Carta di pagamento (MP08)   (electronic)
```

⛔ **Quattro pulsanti d'incasso dove i modi di pagare sono due.** Al banco si sceglie
alla svelta, e due voci che dicono la stessa cosa costringono a fermarsi — o, peggio, si
scelgono a caso e lo stesso incasso finisce classificato in due modi diversi a giorni
alterni.

⚠️ Le altre tre coppie (MP02, MP05, MP12) **non** compaiono in Cassa: `tender_kind` resta
`NULL`, perché la `20260904170000` classifica solo MP01 e MP08. Il doppione lì si vede
nelle tendine dei documenti, non al banco.

#### Nessun dato le referenzia, oggi

Misurato sul condiviso: **nessuna chiave esterna punta a `payment_options`**, e nessuna
riga le referenzia. Il collegamento `store_sale_payments.payment_option_id` nasce con la
`20260904210000`, e l'unica riga esistente non lo valorizza.

⭐ **Questo cambia il costo della correzione**: oggi ritirare una voce di ogni coppia non
rompe nessun documento storico. Dopo il primo incasso in Cassa, non è più vero.

#### La proposta, e ⛔ non cancella né spegne niente da sola

**Nessun `UPDATE` automatico.** Un seed che disattiva voci scelte da lui è esattamente il
modo in cui si perde la fiducia in una migration: il titolare troverebbe spenta una voce
che magari usa in fattura.

La forma proposta, in tre pezzi, da decidere:

1. ⭐ **Il pannello Impostazioni → Tipi pagamento mostra il doppione e lo dice.** Due voci
   che portano lo stesso `method_code_id` si segnalano con un avviso non bloccante — «due
   Tipi puntano a MP01: al banco compariranno entrambi» — e un comando **«Unisci»** che
   l'operatore preme se vuole. Unire = spegnere quella che sceglie lui e, quando serviranno,
   spostare i riferimenti.
2. ⭐ **La Cassa intanto non aspetta**: nell'elenco d'incasso si mostra **una voce per
   codice normativo**, scegliendo quella che il tenant ha effettivamente usato di più (e a
   parità, quella con `sort_order` minore). Le altre restano disponibili sotto «Altri
   Tipi». È una decisione di **presentazione**, reversibile, e non tocca un dato.
3. ⚠️ **Il seed dei tenant nuovi resta com'è**: nasce già con i soli nomi `(MPxx)`, quindi
   il problema non si riproduce. Riguarda solo i quattro tenant esistenti.

⛔ **Che cosa NON proporre**: un `UPDATE ... SET is_active = false WHERE name IN (...)`
dentro una migration. Sceglie per il titolare, non è reversibile senza sapere cosa c'era
prima, e su un tenant che avesse rinominato una voce colpirebbe quella sbagliata.

⏸ **Da decidere dal proprietario**: se il punto 2 (una voce per codice in Cassa) sia
accettabile come comportamento predefinito, o se preferisca vedere tutto e sistemare a
mano dal pannello.

### ⭐ CONSERVATO dal vecchio ramo `feature/cassa` — la conoscenza, non il codice (06/09/2026)

Il ramo `origin/feature/cassa` (testa `6e4f9e79`, 19/08/2026) resta **intatto e non
eliminato**. Non porta migration né oggetti di schema che manchino a `develop`: le sue
sei migration sono **byte-identiche** a quelle già applicate, verificato per hash di blob.

⛔ **Qui non si copia codice.** Dei 52 file che `develop` non ha, la classificazione ha
lasciato in piedi **quattro isole di conoscenza** — misurate, non stimate, e ognuna
sopravvissuta a una verifica avversaria che cercava l'equivalente in `develop` e non
l'ha trovato. Quello che segue è ciò che va **saputo** per riscriverle; il codice si
recupera dal ramo con `git show`, quando e se servirà.

⚠️ **Perché non riportarle adesso.** Tre delle quattro appartengono alla fiscalizzazione,
che `docs/25` §0 decisione 10 rinvia alla tranche C5, e la loro forma vecchia viola il
contratto neutrale (nomi di produttore, `paymentType` numerici, indirizzi codificati).
La quarta — i terminali POS — ha già modello e migration in `develop` e **nient'altro**.

---

#### 1 · La finestra di comunicazione POS al portale

**Dove**: `api/src/pos-terminals/pos-portal-window.util.ts` e `.spec.ts`, commit
`577235db` (07/08/2026).

⭐ **È l'unico pezzo di logica NORMATIVA che `develop` non ha in nessuna forma.** Il
resto del gruppo POS è ricostruibile (un CRUD e un pannello); questa regola no — sta in
un provvedimento, non in un'intuizione.

La regola, per come è stata letta dal Provv. AdE 424470/2025 e dalle FAQ 2026:

```text
regime           dal 6° giorno all'ultimo giorno del SECONDO mese successivo
                 all'attivazione o variazione
                 (attivato ad aprile → finestra 6–30 giugno)
prima finestra   POS in uso al 01/01/2026, o attivati entro il 31/01/2026
                 → 5 marzo – 20 aprile 2026
stato            linked · upcoming · open · overdue
```

⚠️ **Due scelte di attuazione da non riscoprire:**

- la norma dice «ultimo giorno **lavorativo**»; l'attuazione usa l'**ultimo giorno del
  mese**, perché «il promemoria deve anticipare, non inseguire il calendario festivi».
  È una semplificazione deliberata, non un difetto;
- i calcoli sono in **UTC puro** (`Date.UTC`), e il caso del cavallo d'anno
  (novembre → gennaio successivo) è uno dei casi di prova.

#### 2 · Il protocollo Epson ePOS-Print

**Dove**: `src/app/domain/fiscal/models/epson-fiscal-xml.util.ts` e `.spec.ts`, commit
`e6e01d0f` (07/08/2026). Stampanti RT FP-81II / FP-90III.

⭐ **Il valore non è il codice: sono le costanti del dialetto**, che si ricostruirebbero
solo leggendo il firmware o sbagliando contro un dispositivo vero.

```text
endpoint      <base>/cgi-bin/fpmate.cgi?devid=local_printer&timeout=10000
vendita       printRecItem per riga  +  printRecTotal per metodo di pagamento
reso          printRecRefund per riga, preceduto dal preambolo «RESO MERCE»
              con numero zRep-progressivo, data e matricola dell'originale
messageType   4 = preambolo del reso   ·   3 = riferimento interno in coda
descrizione   troncata a 38 caratteri
importi       stringa decimale col punto, valore assoluto
```

⚠️ **Il preambolo del reso è convenzione documentata, non verificata sul campo**: il
commento originale avverte che «il firmware ha l'ultima parola» e che il flusso di reso
va validato su dispositivo reale in fase di POC. Va riportato come dubbio, non come
fatto.

⛔ **La forma vecchia non si riusa**: `develop` ha adottato un contratto **neutrale**
(`adapterKey` + registro statico, `api/src/fiscal/fiscal-adapter-registry.ts`) che vieta
esplicitamente nomi di produttore e `paymentType` numerici nel contratto normalizzato.
Questa conoscenza appartiene all'**adapter Epson**, quando esisterà — non al contratto.

⚠️ **La prova XML è la parte più preziosa**: `epson-fiscal-xml.util.spec.ts` fissa le
stringhe attese **carattere per carattere** (`printRecItem`, `printRecRefund`,
`printRecTotal` con `paymentType` 0 e 2, `printRecMessage` con messageType 3 e 4). È la
forma più verificabile in cui questa conoscenza esista.

#### 3 · I casi numerici dell'arrotondamento fiscale

**Dove**: `api/src/fiscal-devices/fiscal-print-payload.util.spec.ts`, commit `e6e01d0f`.

⭐ **Restano validi qualunque sia l'adapter**, perché non parlano di protocollo ma di
denaro — e sono la disciplina di `regole-gestionale` («si arrotonda solo all'uscita»)
applicata alla stampa:

| Caso                                 | Numeri                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| lordo **divisibile** per la quantità | 4856 minori su 2 pezzi → quantità reale 2, unitario **2428**                                                                 |
| lordo **non divisibile** (sconti)    | 10000 su 3 → **una riga sola a quantità 1** col totale 10000                                                                 |
| reparto IVA                          | aliquota mappata sul dispositivo; **ripiego sul reparto 1** se la mappa manca, se l'aliquota manca o se la voce è malformata |

⛔ **La regola che i numeri codificano**: quando il lordo non si divide esattamente per
la quantità, **non si arrotonda l'unitario** — si stampa una riga sola a quantità 1 col
totale esatto, perché «il totale stampato deve tornare al centesimo». È lo stesso
principio di `regole-gestionale` «l'arrotondamento sta sul totale di riga, mai sul
prezzo unitario», applicato dove sbagliarlo produce uno scontrino che non quadra.

#### 4 · Il pannello Impostazioni, e cosa esattamente ricostruire

**Dove**: `src/app/features/settings/components/pos-terminals-panel/` (commit
`577235db`) e `.../fiscal-device-panel/` (commit `e6e01d0f`), più il **delta** in
`settings.component.ts` / `.html`.

⛔ **I due file `settings.component.*` NON si prendono**: quelli di `develop` sono
divergenti e sostituirli sarebbe una regressione. Serve **solo il delta**, che è:

```text
settings.component.ts    il computed `showFiscalDevicePanel`, gated su
                         `canManageSettingsCompany` (che in develop esiste ancora)
settings.component.html  due <section> sotto @if (showFiscalDevicePanel()):
                         «Dispositivo fiscale» e «Terminali POS»
```

⭐ **Il pannello POS è quello che vale la pena ricostruire per primo**, e non per la
grafica: il suo template porta il **testo normativo** della finestra di comunicazione e
i quattro stati resi all'operatore. È la parte di dominio che, riscritta da zero,
verrebbe riscoperta a fatica.

⚠️ **Il pannello dispositivo fiscale va invece RIPROGETTATO, non ricostruito**: presume
`brand` come selettore del driver, `endpoint` obbligatorio ed `enabled` con default
`true` — tre cose che le migration `20260904140000` e `20260904150000` hanno rovesciato
(`enabled` nasce **false**, e un CHECK impone che sia false finché non c'è un
`adapter_key`).

---

⚠️ **Che cosa NON è stato conservato, e perché non è una perdita.** Tre voci sono state
respinte da una verifica che cercava di smentirle, e l'ha fatto: il servizio stampante
lato browser (`develop` ha già deciso la strada e la documenta in `docs/25`), il modello
`PosTerminal` del frontend (i campi persistiti sono **già identici** in
`api/prisma/schema.prisma`, righe 3635-3654) e il servizio HTTP dei terminali
(«boilerplate che `develop` ripete 40 volte»).

### Tranche 2 — finestra mobile ad altezze variabili (06/09/2026)

**Il motore condiviso è stato ESTESO, non affiancato.** Nessun componente,
breakpoint o logica della Cassa: `app-data-table`, `appRowCard`, gli stili
`list-card`, il catalogo e le preferenze colonne, i filtri, l'ordinamento, la
selezione e i totali restano quelli di tutti.

#### Che cosa è cambiato, in una riga

`altezzaRiga` era **uno scalare**, e tutta la finestra era «altezza × indice».
Ora sono **offset cumulativi** costruiti su altezze misurate per `rowId`.

| Prima                       | Ora                               |
| --------------------------- | --------------------------------- |
| `floor(scorrimento / h)`    | ricerca binaria sugli offset      |
| `i · h`, `(N − j) · h`      | `offset[i]`, `totale − offset[j]` |
| una riga misurata per tutte | ogni riga resa, per identità      |
| finestra spenta sotto `lg`  | accesa a ogni larghezza           |

⛔ **Gli offset NON si ricostruiscono a ogni scorrimento**: il `computed`
dipende da righe, stima e versione delle misure — **non** da `scorrimento`.
Scorrere costa una ricerca binaria, non una somma su cinquemila elementi.

⭐ **Le misure si invalidano sulla LARGHEZZA**, non a ogni evento del
`ResizeObserver`: una card si riimpagina quando cambia la larghezza, non quando
cambia l'altezza del contenitore.

⭐ **E sulle COLONNE, che è la stessa cosa un piano più in là** — aggiunto il
06/09/2026. Spegnere una colonna cambia cosa **ogni** card scrive dentro, non
solo quelle rese: tenere le misure vecchie per le righe fuori finestra lasciava
la barra di scorrimento lunga come prima — misurato, **29.044px** per un elenco
che ne vale 19.500.

⚠️ **Il cambio dei DATI no**, ed è la differenza: lì le righe fuori finestra
possono essere le stesse di prima, e la loro misura è comunque migliore della
stima. Si rimisurano quelle rese e basta.

⚠️ **Si confronta la FIRMA delle colonne, non l'identità dell'array**: un
genitore che ricostruisse l'elenco a ogni giro di rilevamento farebbe altrimenti
azzerare le misure di continuo, e la finestra sfarfallerebbe.

#### L'ancoraggio, che è la parte delicata

⛔ **Niente doppia compensazione**: il contenitore dichiara `overflow-anchor:
none` **solo** con la finestra accesa. Dove non compensa nessuno, l'ancoraggio
del browser resta.

⚠️ **CINQUE difetti trovati NEL BROWSER, non ragionandoci sopra.** I primi due
il 05/09, gli altri tre il 06/09 rispondendo alla verifica mirata chiesta dal
proprietario sui due punti della finestra.

1. Chi era in fondo non ci restava: le altezze misurate cambiavano
   `scrollHeight`, il browser conservava `scrollTop`, e restavano **6px** di
   residuo — con la vista alta 248px l'ultima card sbordava di 2px dal ritaglio
   e `toBeInViewport({ ratio: 1 })` la vedeva al **97%**.
2. Il primo rimedio non funzionava: stava dentro la guardia `cambiate`, e quando
   le righe di coda erano già misurate non si eseguiva. Il ripristino è ora
   **fuori** da quella guardia e **dopo** il render.
3. ⛔ **L’ancora era un INDICE RICALCOLATO, non un’identità.** `primaDi` e
   `dopo` leggevano `offsets()[indicePrimo()]` prima e dopo la misura, e
   `indicePrimo()` è un `computed` che dipende da `offsets()`: le due letture
   cadevano su **due righe diverse**. Misurato con una sonda dentro il
   componente: saltando a metà elenco l’ancora resta `d-150` mentre l’indice
   ricalcolato dice via via **139, 167, 113, 160**, e i delta applicati a
   `scrollTop` valgono **+1177, −2260, +4264, −1218** pixel. Chi saltava al 50%
   della barra atterrava su `d-129` invece che su `d-150` — duemila pixel più
   su di dove la barra diceva di essere.
4. ⛔ **Si misurava l’ALTEZZA della riga, non il PASSO del layout.** Sotto `lg`
   la riga-card porta un `margin-block-end` di 4px che
   `getBoundingClientRect().height` **non comprende**: il modello avanzava di
   4px meno del layout a ogni riga, e lo scarto cresceva con la distanza — fra
   la prima riga resa e quella al bordo della vista faceva **~40px**. Ora si
   misura il passo fra due righe rese, così qualunque cosa lo produca —
   margine, `border-spacing`, `gap` — resta giusto.
5. ⛔ **La misura arrivava sempre UN EVENTO IN RITARDO.** `misuraRigheRese` gira
   sincrona dentro l’ascoltatore di scorrimento, quindi misura la finestra
   **precedente**: le righe che il nuovo `scorrimento` fa entrare non esistono
   ancora nel DOM. Misurato: saltando a metà elenco le righe rese erano
   `d-138…d-164` e la misura girava su `d-0…d-14`. Ora si rimisura **dopo il
   render** (`rimisuraDopoIlRender`), ripetendo finché qualcosa cambia, con un
   numero di giri limitato.

⛔ **Nessuno dei tre falliva niente.** Cima e fondo restavano giusti — lì
l'indice è zero, o ci si ri-ancora alla coda — e le sette prove esistenti
guardavano esattamente cima e fondo. Vivevano a **metà elenco**, dove sopra la
finestra restano righe ancora stimate.

#### Misura prima/dopo, stessa macchina e stessa build

```text
TELEFONO, 5.000 operazioni       PRIMA       DOPO    variazione
tempo totale                    6.476ms      803ms      8,1x
  di cui dopo la risposta       5.586ms      242ms     23,1x
scorrimento fino in fondo       1.259ms       29ms     43,4x
righe rese nel DOM                5.000         15    333,3x
nodi dentro la tabella          125.048        425    294,2x
memoria JS usata                  371MB       22MB     16,9x
```

⭐ **E la scrivania non è peggiorata**: 698 ms contro 671-692 di prima, 31 righe
rese, 825 nodi, 26 MB — tutti dentro la variabilità già osservata. Rimisurata
dopo le tre correzioni del 06/09: **683 ms**, 31 righe, 825 nodi.

#### La scala mobile, dopo — ed è PIATTA

La misura non bloccante (`cassa-prestazioni.config.ts`, tre giri per volume,
questa macchina):

```text
  300 card   min 1002 ms   mediana 1012 ms   max 1120 ms   dispersione 12%
 1000 card   min 1001 ms   mediana 1063 ms   max 1094 ms   dispersione  9%
 2000 card   min 1034 ms   mediana 1040 ms   max 1105 ms   dispersione  7%
 5000 card   min 1061 ms   mediana 1071 ms   max 1134 ms   dispersione  7%
```

⭐ **Fra 300 e 5.000 card corrono 59 ms**, cioè meno della dispersione dei tre
giri: il tempo ha smesso di dipendere dal numero di righe, che era lo scopo.

⚠️ **Sono numeri di QUESTA macchina, non del corridore CI a 2 core.** La scelta
del volume e della soglia del futuro cancello va fatta sui numeri del
corridore, ed è la ragione per cui quel passo continua a girare non bloccante.

#### Che cosa ho riusato, esteso, creato

|             |                                                                                                                                                                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Riusato** | `app-data-table` e il suo template, `appRowCard` e gli stili `list-card`, catalogo e preferenze colonne, filtri di colonna, ordinamento, selezione, totali, gestione del fuoco per identità, righe distanziatrici, `data-row-id`        |
| **Esteso**  | la finestra: da scalare a offset; la misura: da una riga a tutte quelle rese; `finestraAttiva`: tolto il veto sulle card                                                                                                                |
| **Creato**  | `indiceAllOffset` (ricerca binaria) e l'ancoraggio dello scorrimento — **le due sole cose che non esistevano**: senza la prima ogni evento di scorrimento costerebbe 5.000 confronti, senza il secondo il contenuto salta sotto il dito |

⭐ **`ViewportService` esiste ed è stato verificato prima di toccare qualsiasi
rilevamento**: risponde a «è viva la vista a card?» col token
`--viewport-compact-max`, e lo usano 17 consumatori. **Non serviva**, e non è
stato introdotto un secondo rilevamento: con gli offset misurati la finestra
funziona in entrambe le vesti, quindi la domanda «quale modalità?» non si pone
più. È sparito anche il `getComputedStyle` per evento di scorrimento che il
vecchio `aggiornaVeste` faceva.

#### `ResizeObserver` nei test

⛔ **Gestito nel setup, non ignorato**: `src/test-setup.ts` definisce un doppio
che rispetta il contratto — `observe`, `unobserve`, `disconnect` — e **non invoca
mai la richiamata**. jsdom non impagina: fabbricare una misura vorrebbe dire far
credere alle prove di aver misurato. Prima l'assenza produceva
`ReferenceError: ResizeObserver is not defined` dentro `afterNextRender`, che
Angular registra e non propaga: le prove passavano e l'errore restava nel log.

⚠️ **Le verifiche geometriche decisive restano nel browser vero**, ed è dove
sono stati trovati entrambi i difetti dell'ancoraggio.

#### Prove aggiornate, nessuna eliminata

Sette asserzioni codificavano la vecchia decisione «sotto `lg` si rende tutto» e
sono state **riscritte, non cancellate**, ognuna con la nota di che cosa diceva
prima:

| File                  | Che cosa diceva                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `cassa-render-window` | «sul telefono la finestra NON si accende» → ora si accende, con altezze diverse fra loro       |
| `cassa-render-window` | `aria-rowcount` nullo in compatto → ora c'è a ogni larghezza                                   |
| `cassa-render-window` | 300 righe rese dopo il passaggio a compatto → ora poche                                        |
| `cassa-mobile`        | `toHaveCount(5000)` e `toHaveCount(300)` sulle righe rese → la completezza si legge in testata |
| `cassa-mobile`        | zero distanziatrici → ora presenti                                                             |
| `cassa-performance`   | `dom.rows === size` su mobile → ora `< 120`                                                    |

⭐ **Otto prove nuove**, tutte in `cassa-render-window.spec.ts`. Le prime due il
05/09 — la finestra accesa sul telefono con altezze diverse, e l'ultima card
raggiungibile senza spazio vuoto in coda — le altre sei il 06/09:

| Prova                                                                        | Che cosa inchioda                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| «saltando a metà elenco ${donde}, si ATTERRA a metà» ×2                      | l'ancora è un'identità: si atterra su `d-150 ± 12`, non su `d-129` |
| «scorrendo ${verso} la card resta LA STESSA e si sposta del passo esatto» ×2 | scorrendo di N pixel una card visibile si sposta di N pixel, ±3    |
| «dati nuovi con gli STESSI rowId»                                            | la geometria segue le altezze nuove                                |
| «colonna spenta: le card si accorciano e la geometria segue»                 | la rimisura al cambio di colonne                                   |

⭐ **Ognuna è stata FALSIFICATA rimettendo il difetto**, uno per volta:

```text
ancora per indice ricalcolato   → rosse le 2 «ATTERRA»
altezza invece del passo        → rosse le 2 «passo esatto»
niente rimisura dopo il render  → rosse le 2 «passo esatto»
effetto sul contenuto spento    → rossa «colonna spenta»
```

⚠️ **Una NON è falsificata da nessuna delle quattro, ed è scritto nel file**:
«dati nuovi con gli STESSI rowId» resta verde con ognuna, perché il cambio di
periodo passa da una richiesta — la zona dati si stacca e si riattacca, il
`ResizeObserver` scatta e la rimisura arriva comunque. Protegge il
comportamento osservabile, non una riga di codice.

⛔ **E il fixture ha dovuto cambiare forma per provare qualcosa.** Con altezze
a ciclo di tre righe ogni finestra contiene la stessa mescolanza, la **stima**
delle righe mai viste non si muove mai e gli offset di ciò che sta sopra
restano fermi — cioè sparisce proprio la condizione che l'ancoraggio deve
reggere. Provato: col ciclo di tre, le prove restavano verdi anche rimettendo
il difetto. Ora sono **blocchi di venti righe** su tre altezze.

⚠️ **E `cassa-prestazioni.spec.ts` è stato riscritto, non cancellato**:
aspettava `toHaveCount(quante)` sulle righe rese e dichiarava in testa che «la
finestra è spenta sotto `lg` per scelta». Ora aspetta `aria-rowcount` — il
risultato intero — e asserisce che le righe rese siano **poche**.

#### Limiti rimasti

⚠️ **La soglia 2.000/7.000 resta non armata**: la misura prestazionale mobile
continua a girare nel passo CI non bloccante. Con questi numeri andrà ritarata,
ed è una decisione del proprietario — non un ritocco.

⚠️ **La stima delle righe mai viste è la media di quelle viste**: su un elenco
molto disomogeneo la barra di scorrimento può cambiare lunghezza mentre si
scorre. Non produce salti — l'ancoraggio li assorbe — ma è un comportamento da
guardare su dati reali.

### Tranche 1 — date e periodi della Cassa (06/09/2026)

**Il fuso dell'attività è `Europe/Rome`, costante applicativa centralizzata.**
Nessuna migration: non è una colonna su tenant o sede, e il giorno in cui lo
diventerà i punti da cambiare sono **due** — `api/src/common/business-time.util.ts`
e `src/app/core/utils/business-day.util.ts` — non venti.

#### ⛔ Il difetto non era nel filtro: era nel DATO

`documentDate` è una colonna `@db.Date` e riceveva `new Date()`: Prisma ne prende
la parte **UTC**. Una vendita alle 00:30 del 7 settembre a Roma si archiviava
**col 6**. Nessun confine di ricerca poteva rimediarlo — il documento era già
datato ieri.

⚠️ **Difetto gemello, stesso punto**: l'anno della serie veniva da
`getFullYear()`, che è locale al **processo**. In produzione i contenitori
girano in UTC, in locale no: lo stesso codice dava due risposte, e a Capodanno
un documento poteva prendere la serie dell'anno nuovo con la data dell'anno
vecchio.

#### ⭐ Data civile e istante sono due cose diverse

| Grandezza                   | Che cosa riceve            |
| --------------------------- | -------------------------- |
| `documentDate` (`@db.Date`) | la **data civile** di Roma |
| `year` della numerazione    | l'anno **di quella data**  |
| `StockMovement.createdAt`   | l'**istante**, invariato   |
| `CashSession.openedAt`      | l'**istante**, invariato   |

⛔ **Il movimento poteva finire a mezzanotte**, ed è il difetto che la
distinzione ha evitato: `movementDate` alimenta `StockMovement.createdAt`, e
passargli la data civile avrebbe fatto risultare ogni movimento di Cassa fatto a
mezzanotte. Ora riceve `adesso`.

⛔ **Per una colonna `DATE` la mezzanotte giusta è UTC**, non quella di Roma:
`dataCivile('2026-09-07')` è `2026-09-07T00:00:00Z`. Passare l'inizio del giorno
romano (`2026-09-06T22:00Z`) la archivierebbe col 6 — lo stesso difetto con un
travestimento nuovo, e c'è una prova che lo tiene fermo.

#### I confini: `[inizio, inizio del giorno dopo)`

⛔ Non `lte 23:59:59.999`: perde l'ultimo millisecondo e, nel giorno del cambio
d'ora, **un'ora intera** — quel giorno dura 23 o 25 ore, non 24.

⚠️ **I due registri usano confini di natura diversa, ed è corretto**: Operazioni
confronta date `@db.Date` (`dataCivile` + giorno successivo), Sessioni confronta
l'istante `openedAt` (`intervalloDiGiorni`). Scambiarli sposterebbe i confini di
due ore.

#### I periodi

⭐ **Oggi e Ieri aggiunti al sistema CONDIVISO**, `movement-period.util`, non a un
elenco della Cassa: lo usano anche Documenti, Ordini cliente, Ordini fornitore,
Movimenti e Vendite online, con regressioni che ne tengono fermi gli intervalli.

- **Operazioni**: parte da **Oggi**, visibile nel selettore e azzerabile con
  «Tutti». Le date nascono già valorizzate: se partissero vuote, la **prima**
  richiesta chiederebbe tutta la storia.
- **Sessioni**: **nessun periodo predefinito**. Filtra su `openedAt`, e con
  «Oggi» una sessione aperta ieri e ancora aperta sparirebbe. «Oggi più quelle
  aperte» sarebbe un filtro con un'eccezione nascosta, che è peggio.
- **Richiamo scontrino**: indipendente per costruzione — endpoint separato con
  `from`/`to` propri e opzionali, che la maschera di reso non collega al
  periodo del registro.

⛔ **«Oggi» NON è la soluzione del problema mobile**, e non va raccontato così:
è una scelta funzionale, e il limite a grandi volumi resta aperto (tranche 2).

#### Prove

| Prova                                | Copertura                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `business-time.util.spec.ts` (API)   | 10 casi: mezzanotte, cambio anno, entrambi i cambi d'ora (23 e 25 ore), confine `[gte, lt)`, colonna DATE, giorno malformato |
| `business-day.util.spec.ts` (client) | 4 casi: mezzanotte, «ieri» su mese/anno/cambio d'ora                                                                         |
| `movement-period.util.spec.ts`       | 13 casi, di cui 4 nuovi + **una regressione** che tiene fermi gli altri preset                                               |
| `cassa-fuso-orario.integration-spec` | 5 casi **contro il database**, con l'orologio spostato: data, anno di serie, istante del movimento, filtro, storico          |
| `cash-operations.component.spec.ts`  | 3 casi nuovi: parte da Oggi **nella prima richiesta**, è visibile e azzerabile, «Ieri» è un giorno solo                      |

**Conteggi, per suite e non sommati:**

| Suite                                | File | Prove     |
| ------------------------------------ | ---- | --------- |
| Frontend con copertura               | 220  | **2.081** |
| Componenti (ATL)                     | 89   | **1.315** |
| API unitari                          | 221  | **2.456** |
| Integrazione API/PostgreSQL (mirata) | 1    | **5**     |

⚠️ Copertura frontend 85,97 / 80,93 / 81,03 / 86,37. **La suite d'integrazione
completa non è stata rieseguita** in questa tranche: ho eseguito il solo file
nuovo, ripetuto nei due fusi di processo.

⭐ **Indipendenza dal fuso del processo, dimostrata**: le prove dell'API girano
verdi con `TZ=UTC`, `America/New_York`, `Pacific/Kiritimati` ed `Europe/Rome`; le
attese sono assolute, quindi il corridore CI (UTC) e la macchina di sviluppo
(Roma) devono concordare.

⚠️ **`Document.createdAt` NON è asseribile in quelle prove, e non è un difetto**:
è `@default(now())`, quindi lo genera PostgreSQL. È corretto che sia il database
a datare la riga; l'orologio finto di Node non lo tocca, e il campo che
l'applicazione decide è `StockMovement.createdAt`, che è asserito.

⭐ **Falsificate, non solo passate**: rimesso il difetto (`documentDate = adesso`,
`year = getFullYear()`), tre prove d'integrazione arrossano e i messaggi sono
letteralmente il guasto — «expected '2026-09-06' to be '2026-09-07'» e «expected
'2026-12-31' to be '2027-01-01'».

#### ⚠️ Altri endpoint: UN difetto riprodotto, sei da VERIFICARE

⛔ **Riprodotto è solo quello della Cassa**, e solo perché ha una prova che lo
mostra fallire. Degli altri ho letto il codice e il tipo della colonna — è un
fatto — ma **non ho scritto la prova che dimostri un difetto visibile**, e senza
quella non si dice «difetto».

⚠️ **Un taglio a mezzanotte UTC su una colonna `DATE` può essere CORRETTO**, e la
prima stesura di questa sezione lo liquidava come «meno grave»: è una
semplificazione sbagliata. Una `DATE` non ha ora né fuso, quindi confrontarla con
una mezzanotte UTC è il confronto giusto — a essere in questione è **come quel
valore è stato scritto**, che è una domanda diversa e va posta caso per caso.

| Registro                   | Campo filtrato            | Tipo letto nello schema        | Stato                                        |
| -------------------------- | ------------------------- | ------------------------------ | -------------------------------------------- |
| Vendite online             | `placedAt`, `fulfilledAt` | `DateTime` — **istante**       | da verificare, forma nota rischiosa          |
| Ordini fornitore           | `orderDate`               | `DateTime` — **istante**       | da verificare, forma nota rischiosa          |
| Ordini cliente             | `placedAt`                | `DateTime` — **istante**       | da verificare, forma nota rischiosa          |
| Corrispettivi (rettifiche) | `occurredAt`              | `DateTime` — **istante**       | da verificare, forma nota rischiosa          |
| Corrispettivi (registro)   | `documentDate`            | `DateTime @db.Date` — **data** | da verificare: dipende da come viene scritta |
| Corrispettivo manuale      | data del documento        | `@db.Date` — **data**          | da verificare: dipende da come viene scritta |
| Analytics / report         | periodo                   | non ispezionato                | da verificare                                |

⭐ **La domanda da porre a ciascuno è una sola**, e sono due domande diverse a
seconda del tipo:

```text
colonna ISTANTE   il confine è calcolato nel fuso dell'attività?
                  (qui il taglio UTC sposta davvero le righe)

colonna DATE      il valore ARCHIVIATO è la data civile dell'attività,
                  o è la parte UTC di un istante?
                  (è la domanda a cui la Cassa ha risposto «no»)
```

⛔ **Nessuno dei sette è stato toccato**, come da mandato, e nessuno è dichiarato
sano: sono dichiarati **non verificati**.

⚠️ **E anche `resolveMovementPeriodRange` resta al fuso del browser** per tutti i
preset diversi da Oggi/Ieri: per un utente in Italia non sposta una riga, ma è
divergenza dichiarata, non risolta.

### Integrazione in develop — PR #2 aperta il 06/09/2026

**Le due evidenze che il preflight dichiarava mancanti sono chiuse.**

⛔ **Nessuna protezione su `develop`, e nemmeno su `main`.** Letto via API con la
credenziale del repository: `branches/develop` risponde `"protected": false`, i
ruleset sono un elenco vuoto e `rules/branches/develop` pure. **Nessun controllo
di stato è obbligatorio**, quindi la CI informa ma non ferma: a impedire un merge
prematuro c'è solo la disciplina di chi lo esegue.

⚠️ **Il token disponibile ha `push`, non `admin`**: le protezioni si possono
leggere ma non creare, e non sono state toccate. ⚠️ Registrato anche il fatto che
il repository risulta **pubblico** (`"private": false`), che non era un
presupposto di nessuna decisione presa finora e va saputo.

⭐ **La migration col checksum divergente cambia SOLO un commento, dimostrato.**
`20260811120000_supplier_order_line_number`: la revisione il cui contenuto
corrisponde al checksum registrato è `25b33168`, e fra quella e HEAD l'**SQL
eseguibile** — il testo privato delle righe `--` e di quelle vuote — ha lo stesso
SHA-256, `d2083997…`, 10 righe per parte. Cambiano 13 righe di commento sul
timestamp doppio. Nessun SQL storico e nessun checksum sono stati modificati.

⚠️ **`migrate status` da solo non lo dimostrava**: dice che non ci sono migration
modificate, non _che cosa_ è cambiato in un file il cui checksum diverge.

**Consegnato:** ramo spinto (hook `pre-push` passato: build API, type-check dei
test API, `test:everything`, build frontend) e **PR #2 verso `develop`**, 72
commit e 211 file. **Nessun merge, nessuna migration applicata, nessuna scrittura
sul database condiviso.**

#### Esito della prima CI remota — una prova rossa, e non è una sorpresa

| Job                                  | Esito                                   |
| ------------------------------------ | --------------------------------------- |
| Security checks                      | ✅ success                              |
| Lint & unit tests                    | ✅ success                              |
| Playwright E2E                       | ✅ success                              |
| Lighthouse CI                        | ✅ success                              |
| Audit dipendenze                     | ✅ success                              |
| Cassa API, migration e browser reali | ⛔ **failure** — 31 prove passate su 32 |

⛔ **`e2e/cassa-mobile.spec.ts:42` — «mobile: 5.000 card complete senza stallo
iniziale»**: `expect(loadMs).toBeLessThan(10_000)` ha ricevuto **10.610 ms**.
Sforamento del **6%** del budget, sul corridore GitHub a 2 core.

⭐ **È il limite che questo documento dichiara già aperto**, non un difetto nuovo:
«prestazioni mobile ferme alla tranche conclusa» e il P2 «grandi volumi mobile
ancora pesanti». Sotto `lg` la finestra di rendering **è spenta per scelta** — le
card non hanno un'altezza unica — quindi 5.000 card stanno tutte nel DOM.

⚠️ **Non è causato dalla correzione dello stato sessione**: quella prova apre
`/app/cassa/operazioni`, il registro, mentre la modifica è su
`cash-register.component`, la schermata di vendita. Rotte e componenti diversi.

⛔ **Il budget NON è stato abbassato, e la prova non è stata disabilitata.** Il
commento nel test dice a cosa serve quel numero: «distinguere il difetto da 30 s
dalla normale variabilità CI». 10,6 s non è quel difetto — ma decidere se il
budget vada tarato sul corridore, o se la prova a 5.000 card debba restare fuori
dal cancello finché la virtualizzazione mobile non esiste, **è una decisione del
proprietario**, non un ritocco da fare di passaggio.

⭐ **Seconda misura: 10.366 ms.** Due esecuzioni indipendenti sopra soglia, +3,7%
e +6,1%: **superamento sistematico sul corridore, non variabilità.**

### ⭐ DEROGA — la sola soglia temporale mobile esce dal cancello (06/09/2026)

**Autorizzata dal proprietario, e circoscritta a un numero.** Non è una funzione
completata: è un **limite noto e temporaneamente accettato**.

#### Che cosa resta obbligatorio

⛔ **Tutte le verifiche funzionali**, e nessuna prova è stata eliminata. Della
prova `mobile: 5.000 card complete senza stallo iniziale` è uscita **una riga su
sei**:

| Verifica                                         | Stato         |
| ------------------------------------------------ | ------------- |
| le 5.000 card ci sono tutte (nessun troncamento) | **bloccante** |
| finestra di rendering spenta sotto `lg`          | **bloccante** |
| ultima riga raggiungibile scorrendo              | **bloccante** |
| apertura dell'operazione col tocco               | **bloccante** |
| ricerca, filtri, azzeramento, testi lunghi       | **bloccante** |
| totali su 390px, date e calendari                | **bloccante** |
| `loadMs < 10.000`                                | non bloccante |

⛔ **`continue-on-error` sta sul singolo passo, non sul job.** Preparazione
dell'ambiente, migration, integrazione API e browser reali restano bloccanti —
verificato leggendo il workflow: dei tredici passi del job Cassa, **uno solo** è
non bloccante.

⛔ **Nessun dato è stato troncato e nessun timeout è stato alzato per ottenere
verde.** Il volume resta 5.000 e la misura continua a essere eseguita e
pubblicata: log, `test-results/prestazioni-mobile.txt` e allegati, dentro
l'artefatto `cassa-integration`.

#### Il limite per chi usa l'applicazione

Su telefono il registro Cassa **carica tutte le righe del filtro nel DOM**: sotto
`lg` la finestra di rendering è spenta per scelta, perché le card non hanno
un'altezza unica (misurate 83, 105 e 127px sullo stesso elenco) e una finestra
che sbaglia l'altezza salta righe.

Conseguenza pratica: **con un periodo molto ampio l'elenco impiega secondi ad
apparire** — misurato su hardware da corridore CI, ~10,5 s per 5.000 operazioni.
I dati sono completi e corretti: lento è il primo disegno, non il risultato.
**Il rimedio operativo è restringere il periodo**, e su un telefono in negozio è
anche il gesto naturale.

⚠️ Su scrivania il problema non esiste: lì la finestra di rendering è accesa e il
tempo non dipende dal numero di righe (misurato: 1,5 s da 100 a 5.000).

#### Il lavoro futuro, non fatto ora

⛔ **Nessuna virtualizzazione mobile è stata implementata in questa tranche**, e
non va improvvisata: richiede una finestra ad **altezze variabili** — misurare e
memorizzare l'altezza di ogni card, o imporne una uniforme, che è una decisione
di disegno con conseguenze su `regole-stile-ui`. Resta in `DA-FARE` come P2.

#### La misura sul corridore, per scegliere la soglia futura

`e2e/cassa-prestazioni.spec.ts` misura una **scala** — 300, 1.000, 2.000, 5.000
card — **tre volte per volume nella stessa esecuzione**, e pubblica minimo,
mediana, massimo e dispersione. Serve a scegliere il volume e la soglia del
cancello prestazionale obbligatorio **con i numeri del corridore CI**, non con
quelli della macchina di chi sviluppa.

⚠️ **Riferimento locale (macchina di sviluppo, NON la base della soglia):**

```text
  300 card   min 1.109  mediana 1.156  max 1.172 ms   dispersione  5%
1.000 card   min 1.610  mediana 1.650  max 1.810 ms   dispersione 12%
2.000 card   min 2.717  mediana 2.954  max 2.980 ms   dispersione  9%
5.000 card   min 5.655  mediana 5.717  max 5.851 ms   dispersione  3%
```

Il corridore CI è circa **1,8×** più lento (5.000 card: 5,7 s in locale contro
10,4–10,6 s in CI).

⛔ **Nessuna soglia è ancora armata, e l'assenza è dichiarata invece che
nascosta.** Sceglierne una prima di avere la scala misurata in CI significherebbe
sceglierla perché passa. Il volume e la soglia si propongono al proprietario
dopo la prima esecuzione della scala.

### Residui di processo del preflight — chiusi il 06/09/2026

**Tre residui indicati dal proprietario, chiusi in tre commit locali separati.**
Ripresa da `ade2d339`, ramo `feature/recupero-cassa`, albero pulito e nessuna
lavorazione concorrente; `docs/RIPRESA-03-09-2026.md` resta non tracciato e
intatto. **Nessun push, merge, cambio ramo, intervento sui servizi locali o
scrittura sul database condiviso.** La tranche IVA non è stata riaperta.

| Commit     | Residuo                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2f9abf1c` | `check:rls:static` in coda a `npm run lint` (60 passi): fase 1 offline, 74 tabelle, ~1 s. `check:rls` resta invariato e **obbligatorio** in `security.yml` per l'ambiente reale                                  |
| `5931f727` | Ordine CI: due installazioni e `prisma:generate` in testa, poi lint e type-check, poi i test. Tredici passi, gli stessi di prima — confronto degli elenchi ordinati. `regole-qualita` allineata al percorso vero |
| `e93609ad` | Soglie di copertura API alla misura reale troncata: **67 / 59 / 69 / 67** contro 44 / 35,5 / 56 / 43. Nessuna esclusione toccata, nessun test indebolito                                                         |

⭐ **Le due guardie si sono viste FALLIRE, non solo passare.**

- RLS: lo script vero eseguito su un albero finto con una tabella priva di
  `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` esce **1** e nomina la tabella;
  aggiunta la riga, lo stesso albero esce **0**. Il controllo positivo evita che
  un albero finto sbagliato faccia sembrare riuscita la falsificazione.
- Copertura: con le soglie alzate di mezzo punto sopra la misura, **senza toccare
  il file**, `vitest` esce **1** su lines e functions.

⛔ **Lo scarto di copertura non era solo sulle funzioni.** Branches e lines erano i
più lontani, oltre 23 punti: il divario nasceva dalle esclusioni allineate il
05/09 al perimetro di `tsconfig.build` senza rileggere le soglie.

⚠️ **Misura riproducibile**: `npm run test:coverage --prefix api` su `2f9abf1c`,
albero pulito, **due esecuzioni con esito identico al centesimo** su tutti e
quattro gli indici — 67,52 / 59,65 / 69,17 / 67,65, 220 file e 2.446 test verdi.

⚠️ **`.claude/rules/regole-qualita.md` committato senza l'hook**: il file non era
già conforme a Prettier prima della modifica, e lasciarlo riformattare avrebbe
prodotto **1672 righe cambiate** invece delle poche toccate. Stessa ragione per
cui il progetto vieta Prettier su un albero intero.

**Non toccati, come da mandato:** letture di layout durante lo scorrimento, query
DOM del motore tabella, nomi misti dell'API di checkout, fiscalizzazione e
rifiniture estetiche.

⛔ **I limiti documentati restano aperti e NON sono chiusi da questa consegna:**
riferimenti tecnici dei pagamenti POS assenti, checkout privi di
`issuerSnapshot`, storico append-only dei tentativi fiscali. Nessuna migration,
integrazione o dato sintetico è stato introdotto per completarli. Valgono
invariate le voci della tabella «Residui prioritari» qui sotto.

### Preflight aggiornato — chiusura per pausa del 06/09/2026

**Consegna locale per revisione, non approvazione al merge o al rilascio.** Stato
iniziale verificato: `42ff9f86`, ramo `feature/recupero-cassa`, nessuna modifica
tracciata; solo `docs/RIPRESA-03-09-2026.md` non tracciato, lasciato intatto.
Cartella: `C:/Users/Utente/Desktop/Progetto-Vestiflow/vestiflow`.
Riferimento della correzione: `c5e3979f`; questo preflight e la
specifica sono consegnati in un commit di documentazione separato.

**Chiuso in questa tranche:** perimetro IVA temporaneo approvato sui nuovi
checkout, con validazione server nella transazione prima degli effetti e dopo
il recupero dell'intento concluso. Il frontend impedisce le modalità escluse;
il server controlla anche `usageScope` del codice risolto, compresa l'IVA
dell'articolo. Nessuna sostituzione con un codice dalla stessa aliquota o nuova
classificazione. Non si confondono Natura, regime e aliquota. I codici inattivi
vendite/entrambi non ricevono un nuovo divieto indiscriminato.

Preservati Decimal(16,6), primitive economiche, snapshot storici, prezzo originale,
quote e resi proporzionali. Replay dopo modifica del catalogo non è bloccato dal
nuovo filtro, mantiene documento e controlli tenant/sede. Nessuna modifica al
codice della normale Vendita al banco, al reso autonomo o ai permessi esistenti.
Il caso IVA solo acquisti continua a funzionare nell'API ordinaria del banco.

**Prove rieseguite in questa consegna:**

| Verifica                   | Esito e confine                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:everything`  | **5.827 passati**: 2.073 frontend con coverage, 1.308 componenti, 2.446 API unitari                                                                                                                                                         |
| `npm run test:integration` | **469 passati**, 26 file HTTP/PostgreSQL TEST; include protezioni documentali, tenant/sede, idempotenza e recupero, resi, backup/import/delete e privilegi SQL                                                                              |
| Matrice IVA                | **53 casi** nel file dedicato: 45 nuovi checkout/censimento e 7 storici con replay/consultazione/reso/retry, più IVA articolo solo acquisti e banco indipendente; rifiuti senza effetti su documenti, quote, magazzino/quadratura e intenti |
| `npm run test:cassa:real`  | **4 percorsi passati**, browser → API Nest → PostgreSQL TEST, desktop 1440 px e Chromium mobile emulato 390 px; quantità/totali, risposte perse, recupero leggibile/illeggibile, copia locale, resi e chiusura                              |
| Controlli statici/build    | Lint completo, type-check frontend e test API, build frontend production/API; RLS offline su 74 tabelle                                                                                                                                     |
| Coverage API               | 2.446 test passati, funzioni **69,17%** contro soglia invariata 56%; nessuna esclusione o soglia modificata                                                                                                                                 |

RED conservati: 19 accettazioni API precedenti e sette anteprime frontend
riproducevano i casi da bloccare. Dopo il filtro tutti i casi sono verdi.
I sette scenari storici usano fixture TEST rappresentative delle modalità già
accettate, senza riscrivere dati applicativi reali. L'ultima ripetizione mirata
verifica anche l'etichetta variante copiata nel reso; nessuna esenzione alla
guardia degli snapshot. I test reali non sono sostituiti dai mock; l'Auth provider
è locale e mobile è emulato, non Supabase/MFA reali, Safari o telefono fisico.

Log locali ignorati da Git: `test-results/cassa-pausa-{all-tests,integration,iva-final,browser-real,lint-final,types,api-test-types,build,api-build,api-coverage-final,rls-static}.log`,
RED `cassa-pausa-{iva-red,frontend-red}.log`; screenshot/trace/richieste in
`test-results/cassa-browser-real/`. Test e comandi restano versionati.

**Evidenze precedenti, non rieseguite:** tre percorsi migration (installazione
158, upgrade 147→158 e 157→158 con storico/GRANT), fotografie del condiviso e
deriva del 05/09, 15 prove UI isolate dei registri dopo rimozione spike, misure
desktop/mobile a grandi volumi. Nessuna migration o modifica del motore di
rendering in questa tranche. Non confondere questi risultati con nuove prove.

**Residui prioritari:**

| Priorità / passaggio                             | Cosa rimane                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prima del merge                                  | Revisione della consegna e CI remota sul bersaglio effettivo, sotto mandato successivo; nessun push o fetch eseguito. Le prove locali non certificano l'allineamento remoto                                                                                                                                                                               |
| Prima del rilascio                               | Piano coordinato delle **11 migration** con client/API e gestione della deriva; RLS/revoche/privilegi e Data API effettivi, backup/restore sull'infrastruttura prevista, Auth/MFA reali. L'accesso all'ambiente del proprietario può attendere l'allineamento; non è dichiarato collaudato                                                                |
| Dati storici da non promettere come recuperabili | Quote elettroniche prive di terminale/transazione acquirer; checkout senza `issuerSnapshot`. Non si può garantire riconciliazione puntuale degli incassi precedenti o ricostruire l'emittente storico per emissioni retroattive dai soli dati Cassa. Problema segnalato prima di qualsiasi migration, senza inventare riferimenti o riaprire integrazioni |
| Prima della prima fiscalizzazione reale          | Storico append-only dei tentativi e legame stabile a dispositivo/configurazione/contenuto effettivi; gli adapter compilati e il writer fiscale sono assenti. Il dispositivo corrente della sessione non dimostra chi abbia ricevuto un futuro invio incerto                                                                                               |
| Pendenze non confermate                          | Recupero rimane sola lettura per dati illeggibili: verifica intenti/tenant/sede/tipo, apertura e conferma esplicita. Identità assente/incompatibile, richiesta in corso/non trovata o accesso revocato non significano «operazione non registrata»; verifica amministrativa, nessuno scarto/retry o sblocco forzato                                       |
| Limite della copia locale                        | Byte originali e risultato copiati/riletti nello stesso `sessionStorage` per tenant/utente; non è archivio cifrato/durevole e non resiste a chiusura scheda o cancellazione browser. Archiviazione fallita non chiude la pendenza                                                                                                                         |
| Rinviabili nel perimetro attuale                 | Adapter e fiscalizzazione reale, voucher, stampe/esportazioni operative, prestazioni mobile a grandi volumi. Gli importi/legami gestionali restano conservati; questa affermazione non comprende i metadati storici mancanti sopra                                                                                                                        |

**Migration future prevedibili, non create:** storico fiscale append-only con
identità e snapshot del dispositivo effettivo, tenant/sede/RLS/revoche e indici;
estensione compatibile del registro backup/import/delete; eventuali riferimenti
tecnici dei pagamenti/rimborsi per riconciliazione puntuale, dopo definizione
del requisito e fonte reale. Sono estensioni additive: non richiedono di
ricostruire vendite, quote o magazzino. Gli archivi storici senza questi dati
restano incompleti su quel punto, non si popolano con tentativi sintetici.
Disegno e prove concrete nella specifica, sezione «Dati per fiscalizzazione e
riconciliazione future».

Nessun push, merge, cambio ramo, modifica protezioni GitHub, scrittura sul
database condiviso o intervento sulla porta 4200. Nessun nuovo permesso o sistema
di attivazione tenant. Il successivo `develop → main` richiede comunque un
preflight separato dell'intero rilascio. La Cassa si ferma qui per revisione.

### Preflight precedente — recupero e proposta IVA del 06/09/2026

**Evidenza storica consegnata in `42ff9f86`.** La proposta IVA non ancora
approvata descritta sotto è superata dal perimetro attuale riportato sopra.
Conteggi, diff e «questa tranche» di questa sezione si riferiscono a quella
consegna, non alla chiusura per pausa.

**Consegna per revisione, non approvazione al merge o al rilascio.** Ripresa da
`13a1bbdc` sul ramo `feature/recupero-cassa`. Nessun fetch/push, merge o cambio di
ramo. Database condiviso e servizio 4200 non toccati. In questa tranche nessun
file Prisma/schema/migration, motore economico, codice applicativo Vendita al
banco o permesso esistente viene modificato. I nuovi GET riusano i permessi Cassa;
non introducono un sistema di attivazione tenant.

Riferimento del codice verificato: `f92418e7`; confronto con `develop` locale
`d0a1d95b`: 64 commit esclusivi sul feature, nessuno sul lato develop e 210 file
nel diff. Le migration
aggiunte nel diff restano 11 e nessuna è cambiata dopo `13a1bbdc`. Il commit di
documentazione finale segue questo riferimento; non certifica il bersaglio remoto.

| Commit locale | Intervento                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `bfed74c7`    | RLS: opzione statica senza credenziali/rete; probe reale inconcludente su 500 o risposta 200 non interpretabile ora fallisce             |
| `3cf25335`    | Rimossi solo i tre file del componente spike senza utilizzatori; test rinominato `cassa-render-window.spec.ts` senza cambiarne i 15 casi |
| `a21b0199`    | Recupero in sola lettura degli invii illeggibili e relative prove                                                                        |
| `f92418e7`    | Sette caratterizzazioni delle primitive IVA documentali, senza modificare il calcolo                                                     |

La proposta IVA e questa documentazione sono consegnate in un commit distinto
dalla correzione e dal commit delle prove di confronto con gli acquisti.

**Problemi chiusi in questa tranche:**

- Invio illeggibile: percorso consultazione → apertura documento → conferma
  esplicita, con nuova lettura autorizzata del registro intenti. Il server verifica
  tenant, tipo/scope, documento Cassa concluso, sede e sessione. Nessun POST
  checkout/reso per cercare l'esito; il normale banco e il reso autonomo non sono
  recuperati come Cassa. Il carrello in modifica resta da rivedere, senza reinvio.
- Conservazione: JSON malformato e campi interni incompatibili non vengono
  scartati. La chiusura scrive e rilegge la copia originale per tenant/utente;
  errore di archiviazione, contesto diverso o revoca impediscono la chiusura.
  Una pendenza checkout non blocca il tipo reso e viceversa. Dettagli e confine
  della protezione locale nella specifica, sezione «Recupero di invii locali
  illeggibili».
- RLS locale: `npm run check:rls -- --static` passa su 74 tabelle, anche senza
  credenziali e senza contattare il condiviso. Dieci test offline provano assenza
  di rete in modalità statica e corretta distinzione degli esiti della modalità
  reale. Il workflow conserva il probe reale obbligatorio e aggiunge i test dello
  stesso script. Non sono state aggiunte guardie per aumentare il conteggio.
- Pulizia: nessun utilizzatore del vecchio componente spike trovato; rimossi
  solo quei file. Configurazione ordinaria e isolata, `testMatch` e rapporto
  prestazioni aggiornati al nuovo nome. Conservate misure e prove su componenti
  effettivamente in uso; nessuna nuova virtualizzazione o modifica dello scroll.

**Prove di questa consegna:** 455 integrazioni HTTP/PostgreSQL TEST passate (26
file), comprese le 38 prove di idempotenza/consultazione intenti; quattro percorsi
browser → API Nest → PostgreSQL TEST, desktop 1440 px e Chromium mobile emulato
390 px. I due nuovi percorsi corrompono i dati dopo una risposta persa già
committata, provano JSON rotto/versione ignota, consultazione ripetuta, apertura
reale del dettaglio, conferma e copia. Resta **un solo POST** originario per
vendita/reso; snapshot di documenti, quote, magazzino/quadratura e intenti invariati
durante il recupero. Le API provano anche transazione ancora aperta, revoca della
sede, altro tenant e riferimenti incompatibili. Dati originali raggiungibili nel
viewport con lo scroll esistente; nessun overflow orizzontale a 390/1440 px.

Le 15 prove browser conservate dei registri sono passate anche dopo la pulizia;
sono **API simulate**, distinte dai quattro percorsi reali sopra. Discovery
ordinaria del file rinominato: 15 casi. Le prove frontend mirate di recupero e
regressione checkout/reso sono 79, più tre del contratto HTTP frontend. Per l'IVA,
51 prove sulle primitive documentali (sette nuove) e le 39 caratterizzazioni API
della matrice, incluse nella suite integrata: nessuna nuova restrizione applicata.

**Controlli complessivi conclusi:** `npm run test:everything` passa con **5.825
test** (2.073 frontend con coverage, 1.306 componenti, 2.446 API). Passano inoltre
`npm run lint` completo, `npm run check:types`, `npm --prefix api run typecheck:test`,
build frontend production e build API. Coverage API rieseguita: funzioni 69,17%
contro soglia 56%, senza modificare soglie o contratti per uniformità estetica.
I quattro percorsi browser reali sono passati; i due con dati illeggibili sono
stati ripetuti dopo aver aggiunto la prova di raggiungibilità dei dati originali
nel viewport, anch'essa passata. Non è un collaudo su telefono fisico o Safari.

Log locali ignorati da Git: `test-results/cassa-residui-{all-tests,integration,lint,types,api-types,build,api-build,api-coverage}.log`,
`cassa-unreadable-{api-red,api-green,storage-red,nested-red,final-unit,browser,browser-evidence}.log`,
`cassa-iva-primitives.log`, `cassa-rls-static{,-red,-green}.log`,
`cassa-spike-{cleanup,ordinary-list}.log`; screenshot/trace/richieste in
`cassa-browser-real/`. Le prime prove RED riproducono i GET mancanti (404) e
l'assenza del recupero; sei ulteriori regressioni riproducono campi annidati
corrotti che prima passavano la decodifica. Test e comandi sono versionati.

**Residui e decisioni, in ordine:**

| Priorità                                          | Residuo / prossimo passaggio                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 — prima del merge/rilascio                     | CI remota sul bersaglio effettivo e piano coordinato delle 11 migration con client/API. Il dato 147 applicate/158 locali e la deriva descritta sotto sono evidenza del 05/09, non una nuova lettura del condiviso. Nessuna migration applicata qui; le tre prove installazione/upgrade restano evidenze precedenti, non rieseguite perché l'SQL non cambia                            |
| P1 — decisione IVA prima dell'uso con quei codici | In `25-specifica-cassa.md`, sezione «Proposta IVA circoscritta»: mantenere ordinaria/zero; proporre stop ai nuovi checkout RC, split, margine, informativo anche se l'IVA arrotonda a zero, e `zero_rate` con aliquota positiva; decidere l'ambito solo acquisti. Riutilizzare primitive esistenti per ogni futuro trattamento. **Nessuna delle restrizioni proposte è implementata** |
| P1 — pendenze non confermate                      | Identità assente, versione incompatibile, intento non trovato, contesto non corrispondente o accesso revocato richiedono verifica amministrativa; nessuno sblocco forzato. Copia protetta dal percorso applicativo nello stesso `sessionStorage`, non archivio cifrato/durevole; chiudere la scheda o cancellare i dati può perdere le evidenze locali                                |
| P1 — ambiente reale                               | RLS/revoche effettive, privilegi/percorsi alternativi e Data API, backup/ripristino sull'infrastruttura prevista, autenticazione/MFA reali restano obbligatori al rilascio. Il controllo statico cerca `ENABLE RLS` nella storia: non ricostruisce lo stato finale né certifica policy/privilegi                                                                                      |
| Rinviati invariati                                | Limite mobile a grandi volumi, fiscalizzazione, stampe/esportazioni operative e voucher; nessun lavoro riaperto                                                                                                                                                                                                                                                                       |

Il successivo `develop → main` richiede sempre un preflight separato dell'intero
rilascio. La sezione seguente conserva le evidenze precedenti; le frasi «questa
tranche» al suo interno si riferiscono esclusivamente al 05/09.

### Preflight precedente — consegna del 05/09/2026

**Correzioni consegnate per revisione, non approvate per merge; rilascio non
autorizzato.** Il riferimento della consegna precedente è `3b8a2844`. Perimetro di codice
revisionato: `develop` locale `d0a1d95b` → `e010d501`, 59 commit e 204 file nel diff
reale, incluse specifiche e prove. Il ramo discende da quel `develop` senza commit
esclusivi sul lato develop; non è stato fatto fetch, quindi non certifica il futuro
bersaglio remoto. I commit da `05ff072c` a `6fcd8acb` separano protezioni documentali,
idempotenza, resi, RLS, backup, contratto IVA e collaudi. Nessun vecchio SQL di migration
è modificato dal diff: sono aggiunte 11 migration.

**Commit dell'ultima correzione:** `e010d501` — quantità in modifica, adattamento
mobile del carrello, prove browser reali e caratterizzazione delle modalità IVA.
La documentazione di consegna è in un commit locale separato. Questa tranche
modifica solo il checkout Cassa e le prove: niente codice applicativo API, schema,
migration, permessi o normale Vendita al banco.

| Ambito                            | Prova conclusiva                                                                                                                                                                                                 | Esito                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Documenti Cassa e banco ordinario | 38 chiamate HTTP: mutazioni alternative rifiutate, nessun effetto su quote/magazzino/quadratura; banco e reso autonomo modificabili                                                                              | Verificato                                                                                                               |
| Invio incerto e importi originali | HTTP diretto, concorrenza, replay dopo revoca, matrice IVA/sconti/resi e due percorsi browser reali                                                                                                              | Verificato                                                                                                               |
| Isolamento tenant/sede            | Guardie ordinarie, riferimenti indiretti, replay, restore e cancellazione del solo tenant; privilegi SQL reali dello storico                                                                                     | Verificato nel DB TEST; nessuna pretesa di FK tenant composite                                                           |
| Backup tecnico                    | Export ZIP/import multipart reali; SDK Storage su HTTP locale, rollback DB e pulizia nuovi oggetti, v3 valido/v4, riferimenti invalidi e cross-tenant                                                            | Verificato; limiti infrastrutturali in `BACKUP-DISASTER-RECOVERY.md`                                                     |
| Installazione e upgrade           | 158 migration da zero; 147→158 con dati; 157→158 con storico e GRANT preesistenti                                                                                                                                | 3 percorsi passati                                                                                                       |
| Browser reale                     | Desktop e mobile: editing quantità da tastiera/clipboard, blur e invalidi, scansioni, apertura, IVA/Decimal, incasso misto/resto, perdita risposta e recupero del draft, resi 1+2, cassetto, chiusura e registro | 2 percorsi estesi passati; Auth provider locale, API gestionali e DB reali; mobile Chromium emulato, non telefono fisico |
| Modalità IVA                      | 39 nuovi casi HTTP: 12 codici seed, tutte le 25 Nature rappresentate, snapshot/Decimal e replay; cinque nuove prove di anteprima                                                                                 | Accettazione attuale censita; nessun nuovo regime o filtro introdotto, limiti nella specifica                            |
| Regressioni UI isolate            | Componenti condivisi, registri, tastiera, filtri e mobile                                                                                                                                                        | 32 prove passate; API simulate, distinte dal collaudo precedente                                                         |

**Controlli globali:** `npm run lint` completo, `npm run check:types`, type-check
test API, build frontend production e build API passati. `npm run test:everything`:
5.784 test (2.051 frontend con coverage + 1.294 componenti + 2.439 API).
`npm run test:integration`: 445 test su PostgreSQL TEST, 26 file. Il componente
Cassa è stato rieseguito dopo l'adattamento mobile: 26 prove passate. Le prove
RED iniziali riproducevano otto fallimenti sull'editing; quella mobile misurava
24 px contro i 44 px richiesti, oltre al taglio di Togli osservato negli screenshot.
La copertura API della consegna precedente (`npm --prefix api run test:coverage`,
non rieseguita in questa tranche senza cambiamenti al codice API) era:
funzioni 69,31% contro soglia 56%, mantenuta invariata.
Il conteggio esclude ora le fixture e i test, come `tsconfig.build.json`, senza
escludere codice applicativo Cassa. Corrette le fixture con date non distinguibili;
la ripartizione verifica anche lo snapshot della variante dopo modifica del catalogo.

Log dell'ultima tranche in `test-results/cassa-edit-all-tests.log`,
`cassa-edit-integration.log`, `cassa-edit-lint.log`, `cassa-edit-types.log`,
`cassa-edit-api-typecheck.log`, `cassa-edit-build.log`, `cassa-edit-api-build.log`,
`cassa-quantity-red.log`, `cassa-quantity-mobile-red.log`, `cassa-quantity-green.log`,
`cassa-quantity-browser.log`, `cassa-vat-modes.log` e `cassa-browser-real/`.
I 42 test del log IVA mirato sono 39 nuovi più tre precedenti.

Evidenze precedenti conservate in `test-results/cassa-preflight-full-tests.log`,
`cassa-preflight-full-integration.log`, `cassa-preflight-full-lint.log`,
`cassa-preflight-api-coverage.log`, `cassa-preflight-migrations.log`,
`cassa-preflight-browser-regressions.log`.
Le tre prove migration e le 32 regressioni UI isolate restano evidenze della
consegna precedente, non rieseguite qui; nessun SQL o motore dei registri è cambiato.
I file di evidenza sono locali e ignorati da Git; i test e i comandi sono committati.

**Database condiviso, sola lettura alle 22:08:** transazione con
`transaction_read_only=on`; 147 migration applicate contro 158 locali. Sessioni,
movimenti, dispositivi, ricevute fiscali e POS dormienti hanno zero righe;
`store_sale_payments` conserva una riga. La precondizione di upgrade è ancora
coerente, ma va ricontrollata immediatamente prima dell'applicazione autorizzata.
Permane `tenant_feature_settings.default_unit_of_measure`, assente da Prisma:
quattro righe, tutte `pz`. Confrontando i checksum applicati con i blob di HEAD,
sei differiscono: cinque per terminatori di riga, uno per il commento storico
aggiunto a `20260811120000_supplier_order_line_number` (diff da `25b33168` privo
di cambiamenti SQL). Non sono stati riscritti file storici o checksum nel database.
Evidenza: `test-results/cassa-preflight-shared-readonly.json`.

**Interventi ancora necessari, in ordine:**

| Priorità e confine                               | Cosa manca                                                                                                                                   | Criterio di chiusura                                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0 — prima del merge che avvii codice su develop | Piano coordinato per le 11 migration e il client/API corrispondenti; CI del bersaglio effettivo ancora da eseguire                           | Autorizzare quel passaggio, verificare il nuovo diff e la CI, applicare le migration solo nel rilascio concordato. Il codice attuale non va avviato contro lo schema condiviso a 147             |
| P1 — uso reale con regimi IVA particolari        | Il controllo aritmetico lascia passare split payment, margine/informativo a zero e RC con IVA arrotondata a zero, senza trattamento dedicato | Rivedere i controesempi della matrice IVA prima dell'uso con quei codici; eventuali restrizioni o regimi richiedono un mandato successivo. Non sono risolti dal solo bilanciamento degli importi |
| P1 — uso reale/infrastruttura                    | Verifiche post-deploy RLS/revoche e Data API, backup e ripristino sull'infrastruttura del rilascio, autenticazione/MFA reali                 | Collaudo autorizzato nell'ambiente previsto; il provider locale e il PostgreSQL usa-e-getta non sostituiscono questi passaggi                                                                    |
| P1 — uso come cassa fiscale                      | C5, adapter e cronologia dei tentativi fiscali non implementati                                                                              | Tranche separata prima di dichiarare emissione fiscale; nessuna fiscalizzazione o stampa aggiunta qui                                                                                            |
| P2 — rinviabili                                  | Grandi volumi mobile ancora pesanti; voucher; stampe/esportazioni operative                                                                  | Mandati separati. Virtualizzazione e prestazioni non riaperte; per IVA vedere il limite P1 sopra                                                                                                 |

**Quantità chiusa in questa tranche:** il caso `1 → vuoto → 12`, selezione e
sostituzione, incolla reale, blur vuoto, invalidi e scansioni ripetute sono provati;
nessun nuovo invio parte con draft invalido. Il recupero mantiene intento e payload
originali, un solo documento e una sola variazione di magazzino/quadratura. Non
viene introdotto il salvataggio dei draft non inviati dopo ricarica pagina.

**Abilitazione tenant:** per mandato si mantengono le autorizzazioni esistenti.
Menu: canale previsto + `section.sales` + `retail.register`. Pagine e API:
workspace/autenticazione e permessi dell'azione `retail.register`,
`retail.cash_session`, `retail.cash_drawer`, `retail.cash_return`; controllo
tenant/sede nei servizi. Menu e accesso diretto non hanno lo stesso filtro di
sezione/canale. Il titolare ha tutti i permessi. Un'attivazione ulteriore servirebbe
solo se si volesse negare la Cassa a interi tenant, titolari inclusi, lasciando
accessibile la normale Vendita al banco. Non è implementata né assunta come nuovo
blocco di questa consegna; dettaglio verificato in §13 della specifica.

Le annotazioni C0/C1 sui permessi, sulle API assenti e su C3 senza chiusura sono
state aggiornate nella specifica. `develop` locale usa già `invoice`; il `main`
locale usa ancora `invoice_draft`: l'indice `00-DECISIONI.md` distingue ora i fatti
attuali dalla fotografia del 26/08. **`develop → main` richiede il preflight
dell'intero rilascio**, inclusi i problemi di produzione riportati sotto.

## ✅ PRODUZIONE — le tre voci del 03/09 sono CHIUSE dal rilascio Cassa (06/09/2026)

⛔ **Qui c'erano tre allarmi, e non valgono più.** Restano nominati perché chi li ricorda non
li cerchi invano, e perché la forma in cui si erano incastrati può tornare.

| Diceva                                                                                        | Oggi                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «la produzione è ferma da 28 giorni: la CI è rossa e Railway salta ogni deploy»               | ✅ Railway serve `main@9b59a14b`, CI verde su `main`                                                                                                         |
| «dieci disallineamenti fra il database condiviso e il codice in produzione», su 147 migration | ✅ **159/159 migration applicate**, zero pendenti e zero annullate; gli endpoint Shopify girano col codice nuovo                                             |
| «`purchase_price_minor` fa fallire ogni creazione da webhook, da undici giorni»               | ✅ il codice scrive `?? 0` su ogni percorso di pull; nessun percorso produttivo passa `null`. Il vincolo `NOT NULL DEFAULT 0` resta, ed è corretto che resti |

⭐ **La lezione che vale ancora**, ed è la ragione per cui questa sezione non si cancella del
tutto: il difetto non era il vincolo del database, era **un codice vecchio servito da un deploy
che non passava mai**. Un cancello di CI che blocca ogni distribuzione produce un sistema in cui
ogni correzione sembra fatta e nessuna è in produzione — e nulla lo dichiara in modo evidente.

⚠️ **Una traccia rimane visibile**: la connessione di uno dei negozi di prova porta ancora
`lastErrorCode: product_webhook_failed` del 03/09 alle 23:40, con il messaggio sul vincolo. È
storia, non un guasto attuale — ma il pannello la mostra come «ultimo errore» (vedi la sezione
SHOPIFY più sotto).

⏸ **Resta aperta una sola domanda delle tre**, ed è quella che il rilascio non poteva chiudere:
se il pannello debba distinguere «collegato» da «sta ricevendo eventi», e se contare i rifiuti
HMAC valga come primo indicatore. Vedi la voce «rifiuti HMAC invisibili».

## ✅ I test dell'API sono type-checked — chiuso il 04/09/2026

⛔ **Qui c'era un debito aperto**: «i test dell'API non sono type-checked da nessun gate»,
con 62 errori invisibili e un ordine di lavoro in quattro passi. È stato eseguito lo stesso
giorno. Resta scritto **perché** era invisibile, che è la parte che può tornare.

```text
npm run typecheck:test --prefix api      0 errori · 224 file di prova · ~3 secondi
   nel pre-push, dopo la build API      e in CI, prima di test:coverage
```

### ⛔ La causa: `types` SOSTITUISCE, non aggiunge

`tsconfig.spec.json` dichiarava `"types": ["vitest/globals", "node"]` per avere `describe` e
`it`. Ma quella chiave **sostituisce** l'elenco dei pacchetti `@types` caricati: toglieva
`multer`, `express` e gli altri tipi ambientali, e faceva fallire **file di produzione** con
`TS2694: Namespace 'global.Express' has no exported member 'Multer'`.

⭐ **Il rimedio non è elencare i tipi mancanti**, che è una lista da ricordare a mano a ogni
dipendenza nuova: è una direttiva di riferimento in `src/test/vitest-globals.d.ts`, che
**aggiunge** i globali senza togliere niente. La configurazione non restringe più nulla —
né `types`, né `include`.

### ⚠️ E il glob escludeva proprio i test di integrazione

`"include": ["src/**/*.spec.ts"]` vuole un punto prima di `spec`; i file di integrazione si
chiamano `*.integration-spec.ts`, col trattino. **Zero** file di integrazione compilati, e
un controllo che sembrava esserci.

### I due difetti reali trovati, entrambi invisibili a runtime

In `shopify-product-push.service.spec.ts`, e nessuno dei due faceva arrossare un test —
vitest esegue con esbuild, che i tipi li strippa:

| Difetto                                                            | Perché contava                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `as unknown as ShopifyGraphqlClient` con il tipo **non importato** | il cast non verificava **niente**: il finto client poteva divergere da quello vero   |
| `mock.calls as [[{ where }]][]`, una parentesi di troppo           | l'argomento risultava un array, quindi l'asserzione era tipizzata su una forma falsa |

---

## ✅ CASSA — i due registri sono passati al motore tabella (04/09/2026)

⛔ **Qui c’era un RINVIO**, e il proprietario l’ha respinto lo stesso giorno: «non
accetto la duplicazione registrata semplicemente in DA-FARE».

⚠️ **E la stima era sbagliata.** La voce diceva che adottare `app-data-table` «porta con
sé catalogo colonne, viste salvate, filtri di colonna, card di riga e i sei controlli che
li presidiano — farlo male costa più che non farlo». Quelle cose **esistevano già**: la
migrazione è costata un file di configurazione colonne e due template riscritti.

⭐ **A trovare i difetti sono state le guardie citate come costo.** Cinque, una dopo
l’altra, e nessuno si vedeva compilando:

```text
check:table-views          le due viste mancavano lato API: preferenza colonne → 400 muto
check:colonne-rese         `type` e `paymentMethod` dichiarate e non rese: colonne VUOTE
check:filtri-colonna       filtri mostrati che non restringevano niente
check:catena-altezze       il contenitore righe non si stirava: piede non ancorato
check:sticky-scrollport    due intestazioni dichiarate che non esistevano piu’
```

I due registri caricano **tutto il risultato del filtro** (`all=1`) e lo ordinano
in memoria dal 05/09/2026. Le precedenti note sul tetto di cento righe e sul sort
spento erano superate. Le Sessioni sommano le colonne previste con `totaliDiElenco`.

---

## CASSA — corretto il caricamento desktop; compatto ancora aperto (05/09/2026)

La misura a zero del contenitore ancora staccato dal DOM durante il loading
spegneva la finestra: alla risposta venivano istanziate tutte le righe, poi ridotte
alle 43 finali. Il campione rAF di 43 **non escludeva** quel rendering temporaneo.
Ora si conserva la stima iniziale o l'ultima misura positiva fino alla misura valida.

Due prove a 5.000 operazioni: **30.917–35.788 ms prima, 686–704 ms dopo**.
Stessi dati completi, componenti, template e 1.125 nodi della tabella a regime.
Le query di contenuto passano da 25.856–30.634 ms a 4–5 ms nel profilo campionato.

**Compatto migliorato, ancora aperto a grandi volumi**: il controllo mobile
successivo ha spostato le letture dei template fuori dai cicli di riga. A 5.000
card ad altezza variabile: 31.233–31.633 ms prima, 6.236–6.362 ms dopo, su viewport
390 × 844. Sei secondi restano troppi; le 5.000 card / 125.048 nodi sono ancora
tutti presenti. Corretto anche il periodo che usciva dal bordo sui telefoni:
due campi e calendari completi nei registri Operazioni e Sessioni.
Dettagli e limiti nel [controllo mobile](test-results/REPORT-CASSA-MOBILE-2026-09-05.md).
Nessun limite ai dati o taglio del testo.
La virtualizzazione generale degli altri consumer resta fuori da questa tranche.

Causa, prove, misure a 100/1.000/2.000/5.000 righe, riproduzione senza database e
limiti nel [report della correzione](test-results/REPORT-CASSA-PERFORMANCE-2026-09-05.md).

---

## ⛔ CASSA — due condizioni OBBLIGATORIE prima di dichiararla completa (04/09/2026)

Decise dal proprietario il 04/09/2026, chiudendo C1C. **Non sono note di analisi**: sono
condizioni di chiusura, e stanno qui perché le prove che le dimostrano sono **verdi** —
un test verde si legge come comportamento atteso anche quando il suo nome dice il
contrario.

Contratto completo in `docs/25-specifica-cassa.md` §13.

### 1 · ⛔ Protezione cross-tenant — prima di esporre servizi e API

Il database **accetta** una sessione del tenant A che punta a un dispositivo censito sulla
sede del tenant B. Le chiavi esterne legano gli identificativi uno per uno e il `tenant_id`
viaggia in un vincolo separato: **0 FK su 12** vincolano anche il tenant.

```text
api/src/test/integration/dispositivo-di-sessione.integration-spec.ts
  «il database NON verifica tenant e sede: la guardia dovrà essere applicativa»
api/src/test/integration/dispositivo-fiscale-neutrale.integration-spec.ts
  «il database NON protegge dal cross-tenant»
```

⚠️ **Non è un difetto introdotto dalla Cassa**: vale per `documents(location_id)` e
`documents(source_document_id)`, che esistono da molto prima. Ma ogni percorso di scrittura
nuovo è un'occasione di dimenticare il tenant, e i servizi Cassa sono percorsi nuovi.

⭐ **Come chiuderla è una decisione da prendere**, non da dedurre: vincoli compositi
`UNIQUE(tenant_id, id)` sulle tabelle bersaglio, RLS, o verifica applicativa centralizzata.

#### Stato al 04/09/2026 — la terza strada è **presa**, la voce resta aperta

C3 ha scelto la **verifica applicativa centralizzata**: `assertCashContext`
(`api/src/cash-sessions/cash-context.validator.ts`) è l'unico punto che verifica sede,
sessione e dispositivo, **riceve la transazione** e non il client globale, e prende il
tenant dall'utente autenticato. Ci passano **dieci** punti di ingresso, letture comprese:
apertura, sessione corrente, movimenti, cambio dispositivo e storico, checkout (C4A),
richiamo scontrino e reso (C4R), chiusura (C4B).

⛔ **Ma il database continua a non garantirlo**, ed è la ragione per cui questa voce non si
spunta: la guardia vive nel codice, e un percorso nuovo che non chiami il validatore
scavalcherebbe tutto senza che niente lo fermi. La decisione da prendere è se aggiungere il
livello di database — e quella non è stata presa.

⚠️ **Nessuna guardia automatica sorveglia oggi che i servizi Cassa passino dal
validatore**: `check:location-scope` copre il confine controller→servizio, non questo.

### 2 · ⛔ Cronologia dei tentativi append-only — prima della fiscalizzazione reale

`fiscal_receipts.document_id` è **unico** e i campi di esito sono scalari singoli: un secondo
tentativo **sovrascrive** la risposta del primo, e del fallimento precedente non resta nulla.

```text
api/src/test/integration/dispositivo-fiscale-neutrale.integration-spec.ts
  «la cronologia dei tentativi OGGI si perde: il secondo sovrascrive il primo»
```

⛔ **Serve proprio quando l'esito è INCERTO** — pagamento riuscito, RT che non risponde —
cioè nell'unico caso in cui la sua assenza costa una doppia emissione. E con due dispositivi
nella stessa sede (principale + riserva) le memorie fiscali sono due: senza traccia di quale
tentativo è andato dove, la riconciliazione con la chiusura giornaliera non si può fare.

⚠️ **Restano fuori dalle migration attuali solo perché oggi non esistono né API né utilizzo
reale**: `fiscal_receipts` e `cash_sessions` hanno zero righe. Non è una deroga permanente.

---

## 📋 DECISIONI SHOPIFY DEL 07/09/2026 — che cosa resta da fare

> **Le decisioni sono in `docs/24` §§1.13, 1.14, 1.15 e nell'intestazione di
> §12.** Qui c'è solo il lavoro che ne discende: implementazione, collaudi,
> guide e ciò che resta da decidere.

### ✅ 1 · Requisito di schema — `shopify_location_links` è SCRITTA (07/09/2026)

La tabella è nella migration `20260907000000_shopify_link_history`, insieme alle
due sorelle, e conserva tutto ciò che questa voce chiedeva: identità della sede
(FK composita col tenant), identità della location Shopify (GID con `CHECK` di
forma), identità del negozio (FK verso `shopify_shops`), quando il collegamento
è nato, quando si è chiuso e **perché**.

⚠️ Qui c'era «la migration NON è stata scritta, ed è deliberato: questa tranche è
documentale». Non vale più.

**Quattro decisioni prese dal proprietario prima di scriverla** — il modello non
era interamente derivabile, e dedurle sarebbe stato inventarle: cardinalità (una
sede, un solo collegamento vivo), cambio negozio (chiude anche le sedi, con
`shop_change`), `superseded_by_link_id`, unicità sull'inventory item (deliberata
come quinta garanzia). Le motivazioni stanno in `docs/24` §1.13.3.

⛔ **Due di quelle quattro sono state superate poche ore dopo, dallo stesso
proprietario**, e vanno lette così: la cardinalità è diventata **coppia stabile**
con vincoli TOTALI (un indice parziale lasciava la sede libera appena il
collegamento si chiudeva, cioè permetteva le riassegnazioni che la decisione
esclude), e `superseded_by_link_id` è stato **ritirato** — senza procedure di
sostituzione non esiste un successore da indicare, e i periodi si susseguono nel
tempo. Nella migration quella colonna non è mai entrata.

**Chiuse insieme, nella stessa migration**, due lacune che il confronto ha fatto
emergere:

- **`shopify_connections.shop_id`** — decisa in §8.5.1 senza condizioni e assente
  da schema e migration: senza, non esiste modo di sapere quale riga di
  `shopify_shops` sia la corrente per un tenant;
- **l'ausiliaria `UNIQUE (id, tenant_id)` su `locations`** — senza, la FK
  composita col tenant non era nemmeno scrivibile, e l'isolamento sarebbe
  rimasto affidato al servizio applicativo.

⛔ **Restano fuori, e non per dimenticanza**: il backfill (le tabelle nascono
vuote, §8.5.8 fase 3), la doppia scrittura, la migrazione dei lettori e il ritiro
delle colonne legacy. Le tabelle **non sono ancora fonte canonica**.

#### ⛔ La storia di questo file — corretta il 07/09/2026

⚠️ **Qui e nel messaggio del commit `d3aee37d` era scritto che la migration non
era «mai stata applicata in alcun ambiente». È FALSO.**

Una **versione precedente** è stata applicata **per errore al database
condiviso**, e successivamente rimossa. La versione attuale — quella con
`shopify_location_links`, `shopify_connections.shop_id` e l'ausiliaria su
`locations` — è stata collaudata **soltanto in locale**.

⛔ **La conseguenza è operativa, non archivistica.** Se «rimossa» ha riguardato
solo la riga di `_prisma_migrations` e non gli oggetti, il condiviso porta
ancora enum e tabelle di quella versione, e la nuova migration fallirebbe al
primo `CREATE TYPE` con «type already exists».

⭐ **Non è un'ipotesi: è lo stato in cui è stata trovata una copia locale il
07/09/2026** — schema già a 160, registro fermo a 159. Se ne era accorto solo
un `migrate deploy` che si è rifiutato di partire.

**Prima di applicarla al condiviso** va quindi verificato, in sola lettura, che
non esistano residui: i due enum, le tre tabelle sorelle, gli indici ausiliari
su `products`/`product_variants`. ⛔ Se ci sono, la rimozione è un passo
**dichiarato e autorizzato a parte** — non una `IF NOT EXISTS` aggiunta alla
migration, che nasconderebbe la divergenza invece di chiuderla.

✅ **La domanda che restava aperta sugli ARTICOLI è chiusa dal modello**, ed è la
ragione della ristrutturazione descritta al punto 9. Qui c'era: «le FK verso
`products`/`product_variants` sono `ON DELETE RESTRICT`, §11.8 dichiara che il
riferimento anti-reimportazione **è** il link chiuso, ma §4.2 descrive la purga
locale come fisica e irreversibile — con `RESTRICT` la riga di prodotto non è
cancellabile finché esiste un link, e nessun testo scioglie la tensione».

⭐ **La scioglie l'appartenenza scritta due volte**: il riferimento
anti-reimportazione non è il periodo chiuso, è l'**identità remota** con
`original_product_id` — che **non porta una chiave esterna** e quindi non trattiene
nulla. `RESTRICT` resta dov'è, sul solo riferimento vivo, che alla purga si azzera.

⚠️ **Per le SEDI la tensione non si pone e non va risolta allo stesso modo**: una
sede con una storia **non si elimina** (§1.13.4), e la causale `local_delete` è
vietata su quella famiglia da un CHECK a lista bianca. ⛔ §0-bis resta aperta sul
punto diverso — se un articolo già salvato possa essere eliminato definitivamente
**dall'interfaccia**, e con quali avvisi: qui è stato reso possibile dal modello,
non autorizzato come funzione.

### 2 · Storia della connessione — campi da conservare

§1.15.3 elenca sei informazioni che la disconnessione **non deve azzerare**:
`shop_gid`, prima connessione, disconnessione, ultimo checkpoint ordini
riuscito, intervallo non sincronizzato, riconnessione.

⛔ **Oggi `disconnect()` azzera `lastSyncAt` e `lastWebhookEventAt`.** Quelle
due colonne rispondono a un'altra domanda: la storia della connessione ha
bisogno di campi propri, che la disconnessione **scrive** invece di cancellare.

### 3 · Difetto da correggere — `purgeOrders` cancella fisicamente

⛔ **Non è un punto da decidere: la decisione è presa** (§1.14.2). L'attuale
`purgeOrders` esegue `salesOrder.deleteMany`, e va sostituito con la chiusura o
sospensione del collegamento.

⚠️ **Due conseguenze misurate il 07/09/2026 che rendono la correzione urgente:**

- `stock_reservations.sales_order_id` è `ON DELETE CASCADE`: cancellare l'ordine
  porta via gli impegni e lascia `inventory_levels.committed` gonfio;
- `documents.customer_id`, `sales_orders.customer_id` e `online_sales.customer_id`
  sono `SET NULL`: rimuovere i clienti scollega i documenti che li nominano.

⭐ La guardia sugli impegni attivi introdotta con `e0a837ab` (ramo
`fix/shopify-purge-preserves-inventory`) mitiga il primo caso; non lo chiude,
perché la cancellazione resta possibile a impegni chiusi.

### 4 · Difetto da correggere — il messaggio d'errore della purga mente

`mapPurgeError` traduce **ogni** violazione di chiave esterna in «Chiudi gli
ordini fornitore aperti e riprova». Misurato con tutti gli ordini fornitore
chiusi: a bloccare era `online_sales.sales_order_id`, che è `RESTRICT`.

L'operatore chiude gli ordini fornitore, riprova, fallisce di nuovo, e non ha
modo di sapere perché.

### 5 · Collaudi da eseguire, dopo l'implementazione

| Che cosa                                                                                    | Perché non basta un test a mock                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| collegamento di sede creato, chiuso e **non riagganciato** dopo il ritorno della location   | la storia del collegamento è una riga in una tabella: solo un database vero dice se c'è |
| sede collegata che **sparisce da Shopify**: dati invariati, sync fermo, collegamento chiuso | già coperto in parte dallo scenario 8 del collaudo distruttivo                          |
| **prima connessione**: nessun ordine anteriore importato                                    | serve un negozio di prova con ordini precedenti                                         |
| **riconnessione allo stesso negozio**: recupero dell'intervallo, idempotente                | l'idempotenza si prova solo rieseguendo contro dati reali                               |
| **riconnessione a un negozio diverso**: nessuna eredità dell'intervallo                     | due `shop_gid` distinti                                                                 |
| `purgeOrders` corretto: l'ordine **resta**, il collegamento si chiude                       | il collaudo distruttivo ha già la fotografia che lo verifica                            |

⚠️ **Prerequisito già noto e non risolto**: cinque webhook su otto (ordini,
resi, clienti) non sono registrabili sullo shop di sviluppo per mancata
approvazione Shopify «Protected customer data» (`docs/24` §8.5.6). I collaudi
sugli ordini dipendono da quella approvazione.

### 6 · Guide utente — che cosa dovrà entrarci, DOPO il collaudo

⛔ **Non si scrivono adesso**: la funzione non è implementata, e una guida che
descrive una funzione inesistente è peggio di nessuna guida.

Da scrivere quando il collaudo sarà passato:

- **come si collega una sede a una location Shopify**, e che la scelta è sempre
  dell'operatore: nessun collegamento automatico, nome e indirizzo non bastano;
- **che le anagrafiche non si sincronizzano**: cambiare il nome di una sede in
  VestiFlow non lo cambia su Shopify, e viceversa;
- **che cosa succede quando una location sparisce da Shopify**: la sede resta,
  con tutti i suoi dati, e il collegamento si chiude — non si riaggancia da sola
  se la location ritorna;
- **quando una sede si può eliminare** e cosa fare quando non si può: la si
  rende non operativa, e la storia resta;
- **da quando arrivano gli ordini** alla prima connessione: da adesso, non da
  prima;
- **che cosa propone la riconnessione**, e che le quantità che prevalgono sono
  quelle di VestiFlow;
- **che una modifica di quantità fatta su Shopify** compare come disallineamento
  e non sovrascrive VestiFlow.

### 6-bis · Guide che DESCRIVONO un comportamento ora dichiarato difetto

⚠️ **Non vanno corrette adesso** — descrivono il codice com'è, e finché è così
sono vere. Vanno corrette **insieme** all'implementazione, o descriveranno una
funzione che non esiste:

| Documento                                       | Che cosa dice oggi                                                                 | Perché va rivisto                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GUIDA-OPERATORE-VESTIFLOW.md` (endpoint purge) | «Rimuove dati importati/syncati da Shopify (prodotti, varianti, clienti, ordini…)» | `purgeCatalog` è **sospeso** e la rimozione di clienti e ordini diventa chiusura del collegamento (§1.14) |
| `GUIDA-UTENTE-VESTIFLOW.md` (cambio negozio)    | «Rimuove catalogo, clienti, ordini vendita e location collegati a Shopify»         | stessa ragione, più le **location**: non si rimuovono, si scollegano (§1.13.3)                            |

⭐ `GUIDA-OPERATORE-VESTIFLOW.md` dice già «**non** collega più automaticamente
la sede onboarding `LOC-01` al primo match Shopify»: quella riga è **coerente**
con §1.13.1 e non va toccata.

### 7 · Decisioni residue

Le sei che restano aperte sono elencate in `docs/24` §0-bis, «Voci APERTE dopo
il consolidamento del 07/09/2026». In sintesi: il termine per «Disattiva», il
comportamento della sede collegata disattivata localmente, la conseguenza del
rifiuto di recuperare gli ordini, i **dettagli operativi** del primo
allineamento degli articoli, le **giacenze iniziali per sede**, e l'audit
persistente con i backup pre-operazione.

### 8 · Primo allineamento degli ARTICOLI — due direzioni approvate (07/09/2026)

> **La decisione è argomentata in `docs/24` §12.0.** Qui c'è solo il lavoro che
> ne discende e i limiti da non aggirare.

⚠️ **Qui la formula era «progettazione interamente sospesa». Non vale più.** Lo
stato preciso è:

> **Due direzioni iniziali approvate; dettagli operativi e giacenze iniziali
> ancora aperti; implementazione dell'onboarding non ancora autorizzata.**

|                        |                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Parto da Shopify**   | importo prodotti e varianti conservando gli identificativi remoti, e **registro i collegamenti durante l'importazione**             |
| **Parto da VestiFlow** | preparo il catalogo a mano o via CSV; quando VestiFlow **crea** su Shopify, registra gli identificativi restituiti e i collegamenti |

⛔ **L'identità non si deduce mai** da nome, SKU o barcode: in entrambi i
percorsi discende dall'operazione. La matrice di §9.2 **resta invariata** — da
dove si parte non cambia chi possiede cosa.

**Limiti dichiarati, e non aggirabili**: due cataloghi già popolati senza
collegamenti certi non sono risolti da nessuna delle due direzioni; un CSV
ordinario non dimostra l'identità di articoli già su Shopify; nessuna fusione,
cancellazione o sostituzione implicita del catalogo di destinazione; importare
anagrafiche **non autorizza** a sommare o sovrascrivere quantità.

#### Che cosa fare sull'importazione CSV, che esiste già

⛔ **Non è da scrivere e non è già conforme: è da verificare e adattare.** E non
è nemmeno «solo locale» — l'importazione **innesca già un invio ai canali**.
Letto il 07/09/2026, i livelli da tenere distinti sono quattro:

| #   | Livello                                | Oggi                                                                                                                                                                                                                                    |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **creazione locale dal CSV**           | `shopify-csv.parse.ts` e `shopify-csv.mapper.ts` producono prodotti e varianti locali, nel formato **di Shopify** (handle, tag, prezzi dai mapper Shopify) — ⛔ non «un CSV qualsiasi». Nel mapper non compare alcun GID                |
| 2   | **invio automatico ai canali**         | `ProductsImportService` chiama `channelSync.enqueueProductPush` dopo ogni creazione; `pushProductToChannels` verifica il canale e delega. Post-commit e **non bloccante**: un fallimento è un `logger.warn` e l'import riesce lo stesso |
| 3   | **registrazione degli identificativi** | la fa il percorso di **pubblicazione**: `shopify-product-push.service.ts` scrive `shopifyProductId`, `shopifyVariantId`, `shopifyInventoryItemId` nelle **colonne legacy**                                                              |
| 4   | **nuovo storico dei collegamenti**     | ⛔ **nessun servizio lo adotta ancora**; le tabelle restano vuote                                                                                                                                                                       |

⭐ **L'assenza di GID nel mapper dimostra che il MAPPER non ricostruisce
collegamenti — non che l'import resti locale.** Su un tenant Shopify un catalogo
caricato da CSV **viene pubblicato**, e gli identificativi rientrano per la via
del push.

**Che cosa dovrà considerare l'adattamento**, oltre al formato: se e quando
l'invio automatico debba scattare durante un primo allineamento, che cosa accade
alle righe che falliscono in silenzio, e come il percorso di pubblicazione
registrerà i collegamenti **nel nuovo modello** oltre che nelle colonne legacy.

#### ⏸ Il CSV ESTESO VestiFlow — requisito registrato, da NON implementare ora

⚠️ **Due formati, e non vanno confusi**: quello **di Shopify** che l'import
odierno accetta — e che ⛔ **non porta identificativi remoti**, quindi da un file
così nessuna corrispondenza è dimostrabile — e un **formato esteso VestiFlow**
che non esiste ancora.

Il requisito completo è in `docs/24` §12.0. In sintesi, il CSV esteso dovrà:

- avere **due colonne opzionali distinte**, ID prodotto Shopify e ID variante
  Shopify;
- **verificare** il negozio di provenienza e che la variante appartenga davvero
  al prodotto indicato, **prima** di scrivere;
- conservare i riferimenti nel **nuovo modello dei collegamenti**, non nelle sole
  colonne legacy;
- ⛔ non riassegnare identità già associate ad altri articoli, e non riaprire
  automaticamente collegamenti chiusi;
- ⛔ non creare copie su Shopify quando gli identificativi sono validi: l'articolo
  remoto esiste già;
- ⛔ **segnalare** identificativi errati o incoerenti, senza ripiegare sulla
  creazione di nuovi prodotti;
- essere **idempotente**: ripetere l'importazione non duplica prodotti, varianti
  né collegamenti.

⛔ **E due cose che un identificativo non autorizza**: un CSV senza quelle colonne
non dimostra alcuna corrispondenza remota; e nemmeno un ID valido, da solo,
autorizza a **fondere due articoli locali** preesistenti.

⚠️ **Poggia sul modello a identità e periodi**, che oggi è schema e nessun
servizio adotta: non si implementa prima. Giacenze iniziali, matrice §9.2 e piano
tecnico corrente **restano invariati**.

#### Che cosa NON diventa approvato

⛔ Il **wizard a nove passi** di `docs/24` §12 e le **schermate di
corrispondenza** (§12.6, §12.11) restano proposte non approvate. Le due
direzioni non passano da un matching: lo rendono superfluo, che è altra cosa dal
renderlo valido.

#### Che cosa NON è il primo allineamento

- la **riconnessione allo stesso negozio** non lo ripete: conserva i
  collegamenti e recupera dall'**ultimo checkpoint riuscito** (§1.15.2), senza
  duplicare gli effetti;
- il **backfill** (§8.5.8, fase 3) è la conversione tecnica dei collegamenti già
  esistenti nelle colonne legacy: non chiede nulla a nessuno e non crea
  articoli. Due lavori distinti.

### ✅ 9 · Modello dati degli ARTICOLI — identità e periodi (07-08/09/2026)

> **Il modello è argomentato in `docs/24` §8.5.2.** Qui c'è solo lo stato di
> avanzamento e ciò che resta operativo.

⛔ **Il modello precedente non reggeva l'eliminazione definitiva locale**, e i due
punti erano misurati, non temuti: con `product_id` **NOT NULL** e FK `RESTRICT`
la purga era impossibile; reso nullable, la FK composita diventava **inerte**
(`MATCH SIMPLE` non verifica nulla con una colonna `NULL`).

**La ristrutturazione separa l'IDENTITÀ dai PERIODI** — la stessa forma delle
sedi (§1.13.6) — e l'appartenenza si scrive due volte: `original_product_id`
storico, immutabile e **senza chiave esterna**, `product_id` vivo, nullable e con
FK. È la colonna senza FK a sopravvivere alla purga, ed è lei a impedire che un
GID già visto torni assegnabile a un altro articolo.

#### Che cosa è fatto e verificato — in LOCALE

| Fatto                                                           | Come è stato verificato                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| sette tabelle, vincoli, CHECK, indici parziali, RLS e REVOKE    | migration da vuoto e da copia con dati; seconda esecuzione; errore iniettato a metà e rollback completo   |
| **la concorrenza**: un periodo attivo esige un'identità viva    | FK su colonne generate (`viva` / `richiede_viva`), non un trigger — un trigger non regge, ed era misurato |
| **la storia non si cancella**: dieci trigger DELETE e TRUNCATE  | falsificati togliendo i trigger: il GID rinasceva su un altro prodotto                                    |
| ciò che deve restare POSSIBILE: ripubblicazione, ripresa, purga | prove dedicate — «un controllo che blocca tutto non è accettabile»                                        |

⭐ **Le prove di concorrenza coordinano le due transazioni esplicitamente** e
verificano che una **si blocchi davvero** su un lock, quale delle due riesce,
quale è rifiutata e **con quale vincolo per nome**.

⛔ **La prima stesura era verde per il motivo sbagliato**, ed è la ragione per cui
questa riga esiste: lanciava le due transazioni sperando che si incrociassero,
accettava «entrambe fallite» come esito buono, e lasciava attivo il periodo di
partenza — così a rifiutare era l'indice unico dei periodi attivi, e la FK nuova
non veniva nemmeno interrogata.

⭐ **Falsificata togliendo la FK sul solo database sacrificabile**: senza,
**riescono entrambe** — che è il difetto originale — e la corsa lascia nel
database esattamente il periodo appeso su un'identità eliminata che la FK
esiste per impedire.

#### ⛔ Che cosa NON è fatto

| Residuo                                   |                                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **backfill**                              | le tabelle nascono **vuote** (§8.5.8, fase 3): nessuna lettura le interroga, nessuna scrittura le popola                                  |
| **passaggio dei lettori**                 | i servizi leggono ancora le colonne-cache su `Product` / `ProductVariant`                                                                 |
| **funzione operativa di eliminazione**    | l'API che sgancia l'identità, chiude i periodi e purga l'anagrafica **non esiste**: c'è il modello che la rende possibile, non il comando |
| **divieto di riapertura automatica**      | ⭐ **implementazione mancante, non decisione aperta** — la decisione è §11.8, confermata il 03/09/2026. Vedi sotto                        |
| **identità del negozio**                  | ⭐ **controllo da definire, non decisione aperta** — l'identità è `shop_gid` (§8.5.1) e il rilascio a fasi è §8.5.8. Vedi sotto           |
| **registro delle operazioni**             | ⭐ **già richiesto** da §7.4, §4.2 e `regole-gestionale`. Manca la forma minima e chi la scrive. Vedi sotto                               |
| ⛔ **applicazione al database CONDIVISO** | mai eseguita in questa forma. La migration è collaudata **solo in locale**                                                                |

#### ⚠️ Riclassificati l'08/09/2026 — erano descritti come decisioni aperte, e non lo sono

⛔ **Qui i tre residui erano presentati come «decisioni, non codice».** Era sbagliato per
tutti e tre, e in un modo che costa: una decisione aperta si rimanda in attesa di
qualcuno che decida; un'implementazione mancante si pianifica. Presentare la seconda come
la prima ferma il lavoro senza che nessuno l'abbia deciso.

##### ⛔ 1 · Il divieto di riapertura e reimportazione automatica — È DECISO

> **§11.8 «Prevenzione della reimportazione», decisione confermata il 03/09/2026:** il
> riferimento tecnico minimo «**impedisce** che il normale pull Shopify ricrei
> automaticamente l'elemento» e «può essere superato **soltanto da un comando
> amministrativo esplicito**».

⭐ **Pull, webhook e risincronizzazioni non devono aggirarlo**, né riaprendo un periodo né
creando **identità nuove** o **articoli nuovi**: creare un articolo nuovo con un GID già
escluso è la stessa violazione con un altro nome.

###### ⛔ E la mia formulazione precedente confondeva due cose diverse

Qui c'era: _«nulla vieta a un servizio di aprire un periodo nuovo sulla stessa identità
appena l'anagrafica torna viva… il modello lo consente di proposito: è la ripresa»_. Sono
**due situazioni che non si toccano**:

|                                       | **Collegamento chiuso**                           | **Articolo eliminato definitivamente**            |
| ------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| l'anagrafica locale                   | **esiste ancora**                                 | **non esiste più**                                |
| `shopify_product_identities`          | `product_id` valorizzato, `local_deleted_at` NULL | `product_id` NULL, `local_deleted_at` valorizzato |
| un periodo nuovo `active`             | ✅ possibile — **è la ripresa**                   | ⛔ **impossibile: lo vieta il database**          |
| serve un'azione esplicita autorizzata | ✅ sì                                             | — non si pone                                     |

⭐ **La «ripresa» riguarda SOLO la prima colonna**: un'anagrafica ancora esistente, il cui
collegamento era stato chiuso, che si ricollega con un **periodo nuovo** e un'**azione
esplicita autorizzata**. Non è, e non è mai stata, il ripristino di un'identità eliminata.

⛔ **Il secondo caso il database lo vieta già**, con quattro sbarramenti indipendenti
(misurati l'08/09/2026, e ognuno basta da solo):

1. `shopify_product_identities_immutabile` rifiuta `product_id` da `NULL` a un valore —
   _«un'identità sganciata non si riaggancia»_;
2. lo stesso trigger rifiuta di riscrivere `local_deleted_at`, e per il CHECK
   `stato_coerente` le due cose si esigono a vicenda: non se ne può fare una sola;
3. la FK `…_identita_viva_fkey` rifiuta un periodo `active` su un'identità con `viva =
false`;
4. `mai_delete` / `mai_truncate` più l'`UNIQUE` totale su `(shop_id, gid)` chiudono la via
   «cancello e reinserisco».

⚠️ **«L'operatore sempre» era troppo ampio**, e va corretto: §7.4 chiede un **permesso
applicativo esplicito** per eliminare e ripristinare, con default a titolare/amministratore.
La ripresa di un collegamento è della stessa famiglia — non è un'azione che chiunque abbia
accesso alla scheda compie per il fatto di averla aperta.

###### ⚠️ Una differenza di robustezza, che non cambia la classificazione

I divieti sulle **identità** poggiano su un **trigger utente**, spegnibile da chi si
connette come owner — cioè l'API; quelli sui **periodi** poggiano su una **FK**, che
richiede il superuser. E `check:storico-non-cancellabile` verifica oggi solo
`mai_delete` / `mai_truncate`, **non** che i trigger `…_immutabile` esistano: cancellarli
non farebbe arrossare niente. Estendere la guardia è lavoro piccolo e va fatto con la
tranche.

###### I tre percorsi automatici che oggi ricreano — misurati l'08/09/2026

| #   | Percorso                                                                                | Stato                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | webhook `products/*` → `importProduct` ricrea una **variante** eliminata dall'operatore | ⛔ **raggiungibile oggi**: `deleteVariantInTx` non ha guardia Shopify e il push non cancella la remota                                                |
| 2   | webhook `products/*` ricrea un **prodotto** assente                                     | l'eliminazione di un prodotto collegato è oggi rifiutata, quindi non raggiungibile — ma è lo scenario di §11.8 il giorno che lo sarà                  |
| 3   | sync Location post-OAuth **riaggancia una sede per NOME**                               | ⛔ **raggiungibile oggi**, e viola una regola già decisa (§1.13): certo dopo disconnetti/riconnetti, perché `disconnect()` azzera `shopifyLocationId` |
| 4   | sync Location post-OAuth **crea sedi VestiFlow** (`:80`)                                | ⛔ **raggiungibile oggi**, e viola §1.13.1: la creazione è una delle tre scelte dell’utente, non un effetto della sincronizzazione (§15.3)            |

⭐ **Il motore che crea è UNO SOLO** — `importProduct` in `shopify-product-pull.service.ts`
— raggiunto sia dal pull manuale sia dai webhook: `findFirst` per `shopifyProductId`, `if
(!existing)`, `create`. Le due guardie esistenti (`shopifySyncEnabled`,
`shouldSkipShopifyCatalogImport`) sono condizionate a un prodotto locale **già esistente**,
quindi su un'assenza **non scattano affatto**. Un punto solo da correggere è una buona
notizia.

⚠️ **I webhook si accendono da soli**: `autoSyncEnabled` viene attivato alla fine del
callback OAuth, e da lì l'ingresso è pubblico (solo HMAC).

##### ⛔ 2 · L'identità del negozio — la chiave È `shop_gid`, e il controllo va definito

> **§8.5.1, decisione confermata:** _«`myshopifyDomain` è di fatto stabile ma è una
> stringa, non un'identità»_, e `shop_gid` è **univoco globalmente** — lo stesso negozio
> non appartiene a due tenant insieme.

⛔ **Oggi il negozio è riconosciuto dal DOMINIO**, contro quella decisione, e in due
depositi indipendenti (misurato l'08/09/2026):

| Verso                          | Dove legge                        | Vincolo    |
| ------------------------------ | --------------------------------- | ---------- |
| **ingresso** (webhook)         | `shopify_connections.shop_domain` | ⛔ nessuno |
| **uscita** (ogni chiamata API) | `shopify_credentials.shop_domain` | ⛔ nessuno |

Nessun indice unico, **nessun indice affatto**, e nulla che leghi le due colonne: la
risoluzione dominio→tenant è un `findFirst` che, con due righe uguali, sceglie
arbitrariamente. E `shop_gid` **non viene mai acquisito**: `getShop()` legge `/shop.json` e
tiene solo `{ name }`, scartando l'id. `shopify_shops` non è scritta da nessun servizio.

###### Il controllo, prima dell'uso operativo delle identità

⭐ **È la FASE 2 del rilascio già scritto** (§8.5.8): _«acquisizione esplicita
dell'identità: `shop_gid` letto e scritto per ogni connessione»_, con il vincolo _«passo
dichiarato, mai nascosto dentro una migration»_. Non serve inventare una sequenza: serve
eseguire quella.

Il controllo, in forma minima:

1. **si legge il `shop_gid` da Shopify** al callback OAuth e alla riconnessione, e si
   **rifiuta di proseguire** se non lo si ottiene. ⛔ Nessuna deduzione dal dominio: il
   dominio resta una fotografia, non una chiave;
2. si **cerca** la riga di `shopify_shops` per quel `shop_gid` — che è globalmente unico —
   e la si **crea solo se assente**. Ritrovare è la via normale, creare l'eccezione;
3. `shopify_connections.shop_id` punta a quella riga: da lì in poi «quale negozio» ha una
   risposta sola;
4. ⛔ **due righe ambigue non si fondono automaticamente**. Si **segnalano** e si fermano
   le operazioni che dipendono dall'identità. Una fusione automatica sceglierebbe al posto
   di una persona proprio dove la scelta è irreversibile;
5. il blocco «sei già connesso a un altro negozio» va portato **anche sul `shop_gid`**, e i
   punti sono **due** — `beginAuth` e `handleCallback` — da toccare insieme.

⚠️ **`shop_gid` resta NULLABLE fino alla fase 5**, ed è voluto: `NOT NULL` e unicità globale
si stringono _«solo qui, e solo se 2-4 sono verdi»_. Il rilascio graduale non si accorcia.

⛔ **E c'è un guasto muto che la fase 2 farebbe emergere**: le sette tabelle nuove sono
**fuori** da backup, purge e cancellazione del tenant, e la loro FK verso `tenants` è
`ON DELETE RESTRICT`. Appena esisterà **una** riga, `DELETE /admin/tenants/:id` fallirà. E
per identità e periodi non basta aggiungerli all'ordine di cancellazione: i trigger
`shopify_storico_non_si_cancella` vietano ogni DELETE. Va deciso e risolto **prima** della
fase 2, non dopo.

##### ⛔ 3 · Il registro delle operazioni — già richiesto, manca la forma minima

> **§7.4 «Permessi e audit», decisione confermata**, elenca già nove voci che l'audit
> conserva; **§4.2** prescrive che l'eliminazione definitiva conservi «l'audit minimo
> dell'operazione»; `regole-gestionale` («AUDITABILITÀ UI») chiede chi, quando, su quale
> entità e con quale stato prima/dopo.

⛔ **I trigger non lo sostituiscono**: impediscono che la storia sparisca, non dicono
**chi** ha sganciato un'identità. `close_reason` dice la **categoria**, non l'autore — i
periodi hanno i timestamp dell'evento e nessun campo che dica chi.

###### La proposta minima

⭐ **Non è un modello nuovo: è §7.4 con tre precisazioni** — l'autore può essere un
processo, il negozio è una dimensione a sé, e i tentativi **rifiutati** si registrano quanto
quelli riusciti.

| Campo            | Contenuto                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **autore**       | ⭐ umano **o processo**, dichiarato: `utente` con snapshot testuale, oppure `webhook` / `pull` / `backfill`                                    |
| **tenant**       | sempre, ed è la dimensione di isolamento                                                                                                       |
| **negozio**      | `shop_gid` — ⭐ non è fra le nove di §7.4, e serve: la stessa operazione su due negozi è due operazioni                                        |
| **entità**       | famiglia (prodotto / variante / sede) + identificativo locale + GID remoto, come **snapshot testuali**                                         |
| **operazione**   | che cosa si è tentato: sgancio, chiusura periodo, ripresa, eliminazione definitiva, creazione da canale                                        |
| **motivo**       | la causale dichiarata, distinta dal `close_reason` tecnico                                                                                     |
| **data e ora**   | dell'evento                                                                                                                                    |
| **esito**        | ⭐ l’insieme canonico è in §10.3: `tentativo` · `riuscita` · `ininfluente` · `rifiutata` · `fallita`, col vincolo o la regola che ha rifiutato |
| **correlazione** | id dell'operazione remota e/o della consegna webhook, per ricucire una catena                                                                  |

###### Tre vincoli di forma, e vengono da pattern già in casa

1. ⭐ **Snapshot testuali, nessuna FK verso l'attore o il bersaglio.** È la forma di
   `TenantUserAuditLog`, e la ragione è la stessa: la riga deve restare leggibile dopo che
   l'utente è stato rinominato o l'articolo eliminato — che è esattamente il caso qui.
2. ⭐ **Append-only per STRUTTURA**, come `CashSessionDeviceChange`: nessun `updatedAt`,
   nessuna API che modifichi o cancelli, riferimenti `onDelete: Restrict`. La superficie si
   tiene chiusa con una guardia sul modello di `check:cassa-append-only`, che fa fallire la
   build se un controller espone `@Delete` / `@Put` / `@Patch`.
3. ⛔ **La regola di scrittura è UNA, e sta in §10.2-§10.3**: il **rifiuto** fuori dalla
   transazione che ha fallito — o sparisce col rollback — e la **riuscita** dentro quella
   dell'operazione, così che le due commettano insieme.

   ⚠️ **Qui c'era una seconda stesura che diceva soltanto la metà**: «il tentativo rifiutato
   va scritto fuori dalla transazione», senza la riuscita. Letta da sola generalizzava il
   fuori-transazione a tutto il registro — lo stesso difetto che A5 aveva in §13. ⛔ Non si
   riassume in due posti: si rimanda.

   ⭐ Resta la differenza di forma rispetto a `TenantUserAuditLog`, che scrive solo dopo
   un'operazione riuscita: qui metà dei casi utili sono fallimenti, e sono proprio quelli
   che si vanno a cercare.

⚠️ **Senza segreti né dati personali**: `regole-sicurezza` («LOGGING E AUDIT») vieta token,
credenziali e payload interi. Del payload di un webhook si registra la **correlazione**, non
il contenuto.

⚠️ **`shopify_webhook_deliveries` (§8.5.3) è un'altra cosa** e non va confusa: quella è
l'**inbox** delle consegne — a che punto è una consegna — questo è il registro di **che cosa
è stato fatto**. Condividono la chiave di correlazione, non il mestiere.

⭐ **Ma il suo SOTTOINSIEME MINIMO entra nella prima tranche** — §10.3, indicato dal
proprietario l'08/09/2026: «non basta scrivere "si registra" lasciando il registro
interamente fuori perimetro». Un rifiuto che nessuno può leggere è indistinguibile da un
articolo che non è mai arrivato.

⛔ **Il registro COMPLETO resta un lavoro suo**, elencato in §0-bis voce 6 insieme al backup
pre-operazione: le nove voci di §7.4 non sono coperte dal minimo.

### ⏸ 10 · PROPOSTA — compatibilità con backup, ripristino e cancellazione

> ⛔ **Proposta, non lavoro autorizzato.** Nessuna implementazione, nessuna
> modifica alla politica attuale.

#### ⚠️ Come si legge questa sezione — tre stati, non due

⛔ **Consolidato l'08/09/2026, perché il testo li confondeva.** Le tabelle di misura qui
sotto dicono «✅ riesce», e lette di corsa sembrano descrivere il comportamento di oggi. Non
lo fanno.

| Marcatore                  | Significa                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| ✅ **implementato**        | è nel codice del ramo, gira, ha i suoi test                                                 |
| 🔬 **verificato in prova** | provato su una copia locale sacrificabile, **poi rimesso com'era**: nel ramo non c'è niente |
| ⏸ **proposto**             | scritto qui e basta                                                                         |

**Lo stato reale di §10, dichiarato:**

| Rimedio                                                         | Stato                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| quattro FK a `NO ACTION DEFERRABLE` (S1)                        | ⭐ ✅ **implementato l'08/09/2026** — migration `20260908210000`, differite **per nome** dal solo ripristino                                                 |
| storico mai purgato, reinserito per assenza (S2)                | ⭐ ✅ **implementato** — escluso da `TENANT_BACKUP_DELETE_ORDER`, reinserito da `soloAssenti`                                                                |
| permesso di riga per far nascere un'identità eliminata (S2-bis) | ⭐ ✅ **implementato** — tre condizioni insieme, e `set_config` LOCAL alla transazione                                                                       |
| pre-controllo delle incongruenze (S3)                           | ⭐ ✅ **implementato** — `verificaStoricoRipristinabile`, che NOMINA campo, id e GID                                                                         |
| permesso di riga per la cancellazione tenant (§10.2)            | ⭐ ✅ **implementato l'08/09/2026** — due funzioni distinte, DELETE per tenant e TRUNCATE sempre vietato (§10.2-bis)                                         |
| traccia della cancellazione tenant (§10.2)                      | ⭐ ✅ **implementato** — `cancellazione_tenant`, sequenza riusata dal cestino, 14 prove sul database reale                                                   |
| `PlatformAuditLog` (§10.3)                                      | ⭐ ✅ **implementato l’08/09/2026** — schema, migration locale, servizio, integrazione nei quattro comandi del cestino, guardia e 26 prove su database reale |

⚠️ **Qui c'era «per i rimedi di QUESTA sezione, nel ramo non è cambiata una riga di schema,
di migration o di servizio».** Non vale più dall'08/09/2026: il gruppo backup/ripristino è
implementato — vedi §10.1-bis. Resta vero per A4, che è l'unica riga ancora `⏸` sopra.

##### ⛔ Le tre eccezioni NON sono varchi aperti: sono proposte

⚠️ **Precisato l'08/09/2026, perché il linguaggio stava scivolando.** Chiamarle «porte
autorizzate» e chiedersi «chi le sorveglia» le descrive come se esistessero nel codice
operativo. **Non esistono.**

| Eccezione                                                       | Nel ramo                      | Provata dove                                                                                  |
| --------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| FK differite per il ripristino (§10.1 S1)                       | ⭐ ✅ **sì**, dall'08/09/2026 | migration `20260908210000`, e 20 prove sul database di prova (§10.1-ter)                      |
| permesso di riga per far nascere un'identità eliminata (S2-bis) | ⭐ ✅ **sì**, dall'08/09/2026 | idem, con le prove di uso improprio, isolamento e rollback (gruppo 4)                         |
| permesso di riga per la cancellazione tenant (§10.2)            | ⭐ ✅ **sì**, dall'08/09/2026 | migration `20260908230000`, con uso improprio, isolamento, rollback e riuso della connessione |

⚠️ **Qui c'era «ciò che è stato dimostrato è che la TECNICA funziona, non che sia in casa».**
Vale ancora per la sola cancellazione tenant. Le prime due **sono in casa**, e sono nate con i
controlli che questa stessa sezione esigeva: uso improprio (permesso su un altro tenant),
isolamento (una riga viva resta rifiutata anche a permesso acceso), rollback e riutilizzo
della connessione dal pool. ⛔ E ognuna è stata **falsificata sul database**: rimessa la FK a
`RESTRICT` cadono 11 prove su 20, tolto il permesso dal trigger ne cadono 3.

⛔ **Quando si implementeranno, nasceranno insieme ai propri controlli**: non basta una
guardia statica. Servono le prove di **uso improprio** (la porta aperta sul bersaglio
sbagliato), di **isolamento** (un tenant che non può toccare le righe di un altro) e di
**rollback** (che cosa resta quando l'operazione fallisce a metà). La guardia statica ferma
chi scrive il codice; queste prove verificano che cosa fa il codice scritto.

#### ⛔ E le protezioni che questi rimedi aggirano NON erano inutili

⚠️ **Detto male l'08/09/2026** — «rigidità accidentali: nessuna proteggeva qualcosa». È
falso, e va corretto perché è il tipo di frase che poi autorizza a toglierle.

| Protezione               | Che cosa protegge, davvero                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nasce_agganciata`       | ⭐ impedisce di **fabbricare identità dal nulla**: senza, un servizio potrebbe inserire un'identità remota che non corrisponde a nessun articolo, e da lì escludere GID a piacere |
| le quattro FK `RESTRICT` | ⭐ impediscono di **cancellare l'anagrafica mentre è collegata**, lasciando l'identità appesa a un articolo che non c'è più                                                       |
| i trigger `mai_delete`   | ⭐ impediscono che un `CASCADE` o un `TRUNCATE` porti via la storia, ed è la ragione per cui un GID escluso resta escluso                                                         |

⭐ **Il difetto non era la protezione: era l'assenza di un'ECCEZIONE AUTORIZZATA.** Ogni
regola che vale sempre ha bisogno di dichiarare i casi in cui, deliberatamente, non vale —
il ripristino e la cancellazione di un tenant sono quei casi. I rimedi proposti non
indeboliscono le protezioni: le **dotano di una porta stretta e sorvegliata**, e ogni prova
di §13 verifica che fuori da quella porta continuino a rifiutare.

⛔ **Il guasto non è uno.** La causa è **una primitiva condivisa**,
`purgeTenantBackupData`, e i suoi chiamanti sono **due**:

```text
api/src/admin/tenant-delete.util.ts:11                  cancellazione amministrativa
api/src/tenant/tenant-backup/…-import.service.ts:148    RIPRISTINO di un backup
```

⚠️ Alla prima identità scritta non si rompe solo la cancellazione di un tenant: si rompe il
**ripristino di qualunque backup**, compreso uno fatto cinque minuti prima.

#### Le tre cose vanno tenute distinte, perché si comportano diversamente

|                                   | Che cos'è                                                         | Sa delle sette tabelle?                                                           |
| --------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Backup applicativo del tenant** | ZIP per tenant: `manifest.json` + `data/<entità>.json` + allegati | ⛔ **no** — non sono in `TENANT_BACKUP_MODELS`                                    |
| **Ripristino** dello stesso ZIP   | purga tutto il tenant e reinserisce, in **una** transazione       | ⛔ **no** — e la purga si scontra con le FK                                       |
| **Dump completo** (`backup:full`) | `pg_dump` cifrato dell'**intero database**                        | ✅ **sì per costruzione**: fotografa lo schema, senza elenchi da tenere allineati |

⭐ **Il dump completo non richiede lavoro**, ed è la rete che oggi esiste davvero.

#### ⛔ 10.1 · Il nodo — «zero collegamenti attivi» NON basta

⚠️ **Qui la stesura dell'08/09 proponeva di rifiutare il ripristino finché esistono
collegamenti ATTIVI. È insufficiente**, e la verifica locale del 08/09/2026 lo mostra: a
trattenere l'anagrafica non sono i **periodi**, sono le **identità** e le **coppie**, che
restano vive anche quando tutti i periodi sono chiusi.

**Misurato** sul database di prova, in una transazione annullata, con `periodi attivi = 0` su
tutte e tre le famiglie:

```text
DELETE variante   RIFIUTATO   shopify_variant_identities_variant_id_tenant_id_fkey
DELETE prodotto   RIFIUTATO   shopify_product_identities_product_id_tenant_id_fkey
DELETE sede       RIFIUTATO   shopify_location_pairs_location_id_tenant_id_fkey
DELETE coppia     RIFIUTATO   shopify_location_links_pair_id_tenant_id_fkey
```

⛔ **E «sganciare per far passare il ripristino» è una trappola**, non una soluzione:
`shopify_product_identities_immutabile` vieta poi di riagganciare, per sempre. Si otterrebbe
un ripristino che riesce e lascia articoli che **non potranno mai più** essere ricollegati al
proprio GID.

⛔ **Neanche differire aiuta, com'è oggi**: `SET CONSTRAINTS ALL DEFERRED` non ha effetto su
una FK `RESTRICT` — misurato, il DELETE resta rifiutato. È documentato in PostgreSQL:
`RESTRICT` è come `NO ACTION` «tranne che il controllo non è differibile».

#### ⭐ La soluzione: differire il controllo, non sciogliere il collegamento

> **Il ripristino cancella e reinserisce le righe CON LO STESSO `id`. La violazione è
> transitoria: esiste fra il DELETE e l'INSERT, e non esiste più al commit.**

Il rimedio è dire questo al database, invece di aggirarlo.

##### S1 · Quattro FK diventano `NO ACTION DEFERRABLE INITIALLY IMMEDIATE`

Sono **quattro**, misurate, e sono le sole che trattengono un'anagrafica che il ripristino
purga e reinserisce:

```text
shopify_product_identities_product_id_tenant_id_fkey        → products
shopify_variant_identities_variant_id_tenant_id_fkey        → product_variants
shopify_variant_identities_variante_del_prodotto_fkey       → product_variants
shopify_location_pairs_location_id_tenant_id_fkey           → locations
```

⛔ **Tutte le altre restano `RESTRICT`**: le sette FK verso `tenants` (il ripristino non
cancella la riga tenant) e le quindici **interne** fra identità, periodi e coppie — lo storico
non si purga mai, quindi lì non c'è niente da differire.

⭐ **`INITIALLY IMMEDIATE` è il punto**: la FK si comporta **esattamente come oggi** finché
qualcuno non la differisce esplicitamente. Misurato l'08/09/2026 su uno schema di prova
isolato, con quella come **unica** FK presente:

| Prova                                                              | Esito                                             |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| `DELETE` nudo, fuori transazione                                   | ⛔ **rifiutato** — protegge come `RESTRICT`       |
| `DELETE` dentro una transazione, senza differire                   | ⛔ **rifiutato**                                  |
| `SET CONSTRAINTS … DEFERRED` + `DELETE` + `INSERT` dello stesso id | ✅ **riesce**                                     |
| differita, ma **senza** reinserire                                 | ⛔ **rifiutata al commit**, transazione annullata |

⭐ **L'ultima riga è la garanzia che rende la proposta accettabile**: differire non spegne il
vincolo, lo **sposta al commit**. Un ripristino che non rimette al suo posto un articolo
trattenuto **fallisce per intero**, e non lascia niente a metà.

⚠️ **Il `SET CONSTRAINTS` si scrive NOMINANDO le quattro FK**, mai `ALL`: `ALL` differirebbe
anche le quindici interne, e una violazione dello storico verrebbe scoperta al commit invece
che sull'istruzione che l'ha causata.

##### S2 · Lo storico non si purga MAI, e si reinserisce solo per ASSENZA

| Operazione                              | Sulle sette tabelle                                        |
| --------------------------------------- | ---------------------------------------------------------- |
| **export**                              | ✅ esportate: un backup deve poter essere letto per intero |
| **purga** durante il ripristino         | ⛔ **mai**                                                 |
| **reinserimento** durante il ripristino | ⭐ **solo le righe il cui `id` non esiste già in locale**  |
| **sovrascrittura** di una riga presente | ⛔ **mai**                                                 |

⭐ **È la regola che risolve i due casi opposti con una frase sola:**

| Caso                                                                     | Che cosa succede                                                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **recupero su database VUOTO**                                           | niente esiste ⇒ **tutto viene inserito**: lo storico si recupera, ed è il caso che la stesura precedente lasciava scoperto |
| **ripristino su tenant esistente, backup precedente a nuove esclusioni** | le identità esistono ⇒ **non toccate**: l'esclusione scritta dopo il backup **sopravvive**                                 |

⛔ **«Esportare ma non reinserire mai» era sbagliato**, ed era la lacuna della stesura
precedente: su un database vuoto avrebbe perso lo storico, e con esso ogni esclusione. La
discriminante non è «ripristinare sì o no»: è **per assenza**.

⚠️ **Conflitto di GID**: una riga del pacchetto con un `id` nuovo ma un
`(shop_id, shopify_product_gid)` che in locale appartiene a un'**altra** riga. L'`UNIQUE`
totale la rifiuterebbe con un errore grezzo: va intercettata dal pre-controllo (S3) e
**nominata**, perché significa che quel pacchetto e quel database raccontano due storie
diverse dello stesso GID.

##### ⛔ S2-bis · «Per assenza» da sola NON basta: un'identità eliminata non può NASCERE

⚠️ **Il proprietario l'ha trovato leggendo i vincoli, e la verifica dell'08/09/2026 lo
conferma sullo schema completo con tutti i trigger accesi.**

`shopify_product_identities_nasce_agganciata` è un `BEFORE INSERT` che rifiuta
`product_id IS NULL`. Un'identità **già eliminata definitivamente** — che è proprio la riga
che porta l'esclusione — nel pacchetto ha `product_id` a `NULL`. Su un database vuoto non
esiste nessuna riga a cui agganciarla, e l'inserimento è **rifiutato**:

```text
A · lo stato esportabile si produce davvero      purga variante RIESCE · purga prodotto RIESCE
                                                 identita' 1 · periodi chiusi 1 · prodotti 0
B · recupero su database vuoto, trigger di oggi
      identita' prodotto (product_id NULL)       RIFIUTATA  shopify_product_identities_nasce_agganciata
      identita' variante (variant_id NULL)       RIFIUTATA  shopify_variant_identities_nasce_agganciata
```

⛔ **Due scorciatoie che NON si prendono**, e vanno nominate perché sono le prime che vengono
in mente: **indebolire** il trigger per tutti gli inserimenti — cadrebbe la garanzia che
un'identità nasce agganciata al proprio articolo, che è ciò che impedisce di fabbricare
identità dal nulla; e **ricreare anagrafiche fittizie** per far passare l'inserimento —
resusciterebbe articoli che l'operatore ha eliminato, e la prova passerebbe mentendo.

##### ⭐ Il recupero autorizzato: lo STESSO permesso di riga di §10.2

```sql
IF NEW."product_id" IS NULL THEN
  -- unico varco: il RIPRISTINO di QUEL tenant, dichiarato per transazione,
  -- e soltanto per una riga che porta gia' la propria data di eliminazione
  IF current_setting('vestiflow.ripristino_tenant', true) = NEW."tenant_id"::text
     AND NEW."local_deleted_at" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'shopify_product_identities_nasce_agganciata: …';
END IF;
```

⭐ **È lo stesso meccanismo della cancellazione tenant, non un secondo**: permesso di riga,
per transazione, confrontato con il tenant della riga. Due eccezioni autorizzate, una sola
forma da capire e da sorvegliare.

⚠️ **La seconda condizione stringe il varco**: `local_deleted_at IS NOT NULL`. Anche a
permesso acceso non si può far nascere un'identità semplicemente sganciata — solo una **già
eliminata**, che è l'unica cosa che un pacchetto può contenere.

**Verificato l'08/09/2026, con il permesso in piedi:**

| Prova                                                          | Esito                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| C1 · inserimento ordinario, **senza** permesso                 | ⛔ **ancora rifiutato** — nulla è indebolito                |
| C2 · permesso impostato su un **altro** tenant                 | ⛔ rifiutato                                                |
| C3 · permesso sul tenant giusto: identità + varianti + periodi | ✅ recuperati, nello stato corretto                         |
| C4 · lo stesso inserimento **dopo il commit**                  | ⛔ rifiutato: il permesso è finito con la transazione       |
| C5 · seconda identità con lo **stesso GID**                    | ⛔ rifiutata dall'`UNIQUE` totale: **il GID resta escluso** |

⭐ **C5 è il punto**: il recupero rimette l'esclusione, non la scioglie.

⚠️ **Le funzioni originali dei trigger sono state catturate prima e rimesse dopo**, con
verifica; il tenant di prova non ha lasciato residui.

##### S3 · Il pre-controllo — e non basta l'`id` della riga

⛔ **Confrontare solo l'`id` sarebbe una verifica finta**: due righe con lo stesso `id`
possono raccontare storie diverse dello stesso GID, e il ripristino le fonderebbe in
silenzio.

> **Le colonne che i trigger `…_immutabile` proteggono devono COINCIDERE. Quelle che
> descrivono lo stato NON si sovrascrivono.**

| Riga del pacchetto                   | Che cosa si verifica                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **presente** in locale (stesso `id`) | ⭐ devono coincidere `tenant_id`, `shop_id`, il **GID** (prodotto, variante, inventory item), `original_product_id` / `original_variant_id` e, per la variante, `product_identity_id`. ⛔ Una divergenza è un'**incongruenza**: si nomina e si rifiuta |
| **assente** in locale                | il GID non deve essere già di **un'altra** riga (`UNIQUE` totale); il `tenant_id` dev'essere quello che si sta ripristinando                                                                                                                           |
| **locale, assente dal pacchetto**    | ⛔ non si tocca: non si purga mai                                                                                                                                                                                                                      |

⭐ **`product_id` e `local_deleted_at` NON si confrontano, ed è deliberato**: sono
esattamente ciò che può essere legittimamente cambiato dopo il backup. Il locale vince, e
l'esclusione scritta dopo sopravvive.

⚠️ **È lo stesso criterio, detto una volta**: ciò che il database dichiara immutabile deve
combaciare, o le due storie non sono la stessa; ciò che è mutevole appartiene al presente,
non al pacchetto.

**Le altre due verifiche del pre-controllo**, invariate:

| Cosa verifica                                                                         | Se fallisce                                                                  |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ogni **identità viva** e ogni **coppia** ha la propria anagrafica dentro il pacchetto | ⛔ rifiuta, ed **elenca** articoli e sedi che il ripristino farebbe sparire  |
| `assertNoIncomingTenantReferences` **esteso alle sette tabelle**                      | oggi itera solo i modelli del registro: un riferimento da lì non lo vedrebbe |

⭐ **Senza il pre-controllo il rimedio funzionerebbe lo stesso** — la FK differita fallisce al
commit e annulla tutto. Serve a far capire **perché**, non alla sicurezza.

⛔ **Nessuna chiusura e nessuno sganciamento impliciti.** Il ripristino o riesce così com'è, o
si rifiuta dicendo cosa manca.

#### ✅ 10.1-ter · Il gruppo backup/ripristino è IMPLEMENTATO — 08/09/2026

> **A1 · A2 · A2-bis · A2-ter · A2-quater · A3 · A6.** Autorizzati insieme dal proprietario
> perché sono una sola soluzione a un solo nodo: lo storico non deve rompere backup e
> ripristino che già funzionano. ⛔ A4 non è dentro, e resta separato.

##### Che cosa è stato trovato PRIMA di scrivere

⭐ **La verifica delle dipendenze ha cambiato il lavoro**, e le prime tre non erano nel piano:

| Trovato                                                                                         | Conseguenza                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `TENANT_BACKUP_V4_ENTITY_FILES` **non esisteva**                                                | il piano la nominava come se ci fosse: andava creata                                 |
| gli archivi vecchi si rompevano in **DUE** punti indipendenti                                   | non bastava la lista dei file: c'era anche il cancello sui **conteggi** del manifest |
| `TENANT_BACKUP_MODELS` è un registro **unico** per export, import, purga e cancellazione tenant | aggiungerci le sette tabelle tocca anche un percorso che non è del ripristino        |
| ⛔ `ShopifyLinkCloseReason` **divergeva** fra database e Prisma                                 | vedi sotto: era una trappola latente, non un dettaglio                               |

##### ⛔ I due cancelli erano DUE, e uno solo si vedeva

```text
1  i FILE richiesti      required = formatVersion === 3 ? V3 : TUTTI
2  i CONTEGGI richiesti  formatVersion >= 4 && entityCounts[key] === undefined  ->  rifiuta
```

Il primo è quello che il piano prevedeva. ⛔ **Il secondo rifiutava lo stesso archivio v4 anche
dopo aver corretto il primo**, con un messaggio che parla d'altro — «Conteggio backup non
coerente» — perché un manifest v4 non dichiara i conteggi di file che a v4 non esistevano.

⭐ Ora entrambi leggono **una sola fonte**, `tenantBackupFileAttesi(formatVersion)`, costruita
sulla versione in cui ciascun file è **comparso**. Un v6 che aggiunga altre tabelle non
riaprirà la stessa buca.

##### ⛔ Una divergenza schema ↔ database, trovata scrivendo una prova

`ShopifyLinkCloseReason` ha **cinque** valori nel database — la migration del 07/09 li crea
tutti — e ne dichiarava **quattro** in `schema.prisma`: mancava `local_delete`.

⭐ **Non è innocua, ed è il contrario di quello che sembra**: una riga con quel valore fa
fallire **ogni lettura Prisma di quella tabella**, export del backup compreso, con
`Value 'local_delete' not found in enum`. Cioè: il giorno in cui B4 chiude un collegamento per
eliminazione locale, il backup di quel tenant smette di funzionare — e nessuno collega le due
cose.

⚠️ **Nessuna migration**: il tipo PostgreSQL ha già il valore. Si è allineato Prisma al
database, non il contrario.

⭐ **Trovata da una prova, non da una lettura**: `2b` simula un'esclusione decisa dopo il
backup, e per farlo deve chiudere il periodo con la causale che il dominio prescrive.

##### ⚠️ Altre due divergenze dello stesso tipo, NON toccate

Il confronto sistematico dei 44 enum ne ha trovate altre due — `DocumentStatus.externally_registered`
e `DocumentType.corrispettivo`, presenti nel database e assenti da `schema.prisma`.

⛔ **Lasciate come stanno, e dichiarate qui invece che corrette in silenzio.** Vengono da
migration di quest'area documentale, **zero righe** le portano, e hanno tutta l'aria di valori
**ritirati** di proposito: PostgreSQL non sa togliere un valore da un tipo, quindi un ritiro si
fa in Prisma e lascia il tipo com'è. Correggerle sarebbe uscire dal perimetro su una
supposizione.

##### Le decisioni, e dove vivono

| Decisione                                                  | Dove                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| formato **v5**, minimo ancora **3**                        | `tenant-backup.constants.ts`                                |
| le sette tabelle nel registro, in ordine di **dipendenza** | idem — precedono `shopifyConnections`, che ha FK al negozio |
| lo storico **fuori** dall'ordine di cancellazione          | `TENANT_BACKUP_DELETE_ORDER`                                |
| reinserimento **solo per assenza**                         | `soloAssenti`, nel ciclo di import                          |
| quattro FK `NO ACTION DEFERRABLE INITIALLY IMMEDIATE`      | migration `20260908210000`                                  |
| differite **per nome**, mai `ALL`                          | `VINCOLI_DA_DIFFERIRE`                                      |
| permesso di riga a **tre condizioni**, `set_config` LOCAL  | migration `20260908210000` + `PERMESSO_RIPRISTINO`          |
| pre-controllo che **nomina** campo, id e GID               | `verificaStoricoRipristinabile`                             |

⭐ **Il conteggio dichiarato dall'import è quello delle righe DAVVERO inserite**: dire «12
identità» dopo averne saltate 12 sarebbe un resoconto falso.

##### ⛔ Che cosa questo blocco NON risolve

|                                   |                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A4** — cancellazione tenant     | ⛔ invariata. Un tenant con storico si ferma sulla FK come si fermava prima: le sette tabelle non erano nel registro, ora ci sono ma restano fuori dalla purga. **Nessun peggioramento e nessun rimedio** |
| **fase B** — la prima scrittura   | ⛔ non iniziata: le tabelle restano vuote in esercizio                                                                                                                                                    |
| **cestino ↔ pubblicazione** (§17) | ⛔ invariato                                                                                                                                                                                              |

##### Le prove, e la loro falsificazione

`ripristino-storico-shopify.integration-spec.ts` — **20 prove** sul PostgreSQL sacrificabile.

⭐ **Export e ripristino passano dai servizi VERI**, non da SQL scritto per l'occasione: è
l'unico modo di vedere se i vincoli differiti e il permesso funzionano dove si usano. Le sole
prove in SQL diretto sono quelle sul permesso (gruppo 4), dove il bersaglio è il trigger.

Rimesso un difetto alla volta — **nel codice e nel DATABASE** — arrossiscono:

| Difetto rimesso                                                  | Rosse                  |
| ---------------------------------------------------------------- | ---------------------- |
| i file richiesti tornano a essere quelli di oggi anche per un v4 | 1b, 1c, 3c             |
| il cancello dei conteggi torna a pretenderli per ogni file       | 1b, 3c                 |
| lo storico torna nell'ordine di cancellazione                    | 1b, 1c, 1d, 2b, 2c, 5a |
| lo storico si reinserisce sempre, non solo per assenza           | 1d, 2b, 2c, 5a         |
| il confronto delle colonne immutabili è spento                   | 3a                     |
| il controllo dei GID già presi è spento                          | 3b                     |
| il controllo delle anagrafiche riferite è spento                 | 3c                     |
| il ripristino non differisce più i vincoli                       | 1b, 1c, 1d, 2b, 2c, 5a |
| ⭐ la FK torna a `ON DELETE RESTRICT` **[database]**             | 11 prove su 20         |
| ⭐ il trigger torna **senza** permesso di riga **[database]**    | 2a, 4d, 4e             |

⚠️ **Le due falsificazioni sul database hanno un primo esito da ricordare**: sono fallite
prima di toccare qualunque cosa, perché Node su Windows risolve `/tmp` come `C:\tmp`. Verificato
dopo, riga per riga, che il database fosse intatto — poi ripetute per davvero, e ripristinate.

⭐ **Dopo la falsificazione distruttiva l'ambiente è stato riverificato**: 4 FK differibili,
permesso presente nel trigger, **0 trigger spenti**.

⚠️ **Due mock incompleti hanno prodotto rossi che col backup non c'entravano**: la transazione
finta della spec di import non aveva `$executeRawUnsafe` — che il ripristino ora usa per
dichiarare i vincoli e accendere il permesso — e restituiva un delegate al suo posto. Un finto
client che omette un metodo non è «neutro»: fallisce dicendo un'altra cosa.

##### ⛔ Due VERIFICHE erano più deboli di quello che dichiaravano — corrette l'08/09/2026

Rilevate dal proprietario rileggendo codice e prove. Nessuna delle due riguardava backup e
storico: riguardavano **la capacità di accorgersene**, che è peggio.

###### 1 · La prova `3d` passava per il motivo sbagliato

Accettava un errore di chiave esterna **qualunque** (`/…_fkey|foreign key/i`) e non guardava
se la cancellazione fosse riuscita. ⛔ **Riprodotto**: rimessa la FK a `ON DELETE RESTRICT` —
cioè tolto esattamente ciò che la prova doveva dimostrare — restava **verde**.

⭐ **La correzione non è un'asserzione più stretta sul messaggio**, che sotto `RESTRICT`
nomina comunque lo stesso vincolo. Sono due variabili che restano al valore iniziale se il
rifiuto arriva prima della fine del corpo:

```text
prodottiDentroLaTransazione === 0   la cancellazione e` RIUSCITA dentro
corpoConcluso === true              il corpo e` arrivato in fondo
  ⇒ a rifiutare e` stato il COMMIT, non un'istruzione
```

Ora, con `RESTRICT`, la prova fallisce con «expected null to be +0»: la cancellazione non è
mai avvenuta. ⚠️ E si differisce **solo il vincolo in esame**, non tutti e quattro: differirli
in blocco renderebbe la prova incapace di dire quale abbia rifiutato.

###### 2 · La guardia sorvegliava la stringa, non l'uso

`check:storico-non-cancellabile` cercava il letterale `'vestiflow.ripristino_tenant'`. ⛔ Ma
**il servizio legittimo non lo scrive**: importa la costante `PERMESSO_RIPRISTINO`. Copiare
quell'uso in un altro servizio non incontrava alcun controllo — e la guardia dichiarava
«acceso in un posto solo» qualcosa che non aveva verificato.

⭐ **Riprodotto** aggiungendo il permesso all'export del backup **tramite la costante**:
guardia verde. Ora sorveglia **entrambi i nomi**, e ne segnala due occorrenze (l'import e
l'uso), lasciando consentito il ripristino legittimo.

⚠️ **Aggiunto anche `VINCOLI_DA_DIFFERIRE`** allo stesso elenco: è la stessa classe di buco —
differire quelle FK altrove aprirebbe la finestra del ripristino in un percorso che nessuno ha
esaminato.

⭐ **E un controllo perché la guardia non diventi cieca**: se un simbolo sorvegliato non
esiste più in nessuno dei file autorizzati, la build fallisce. Senza, una rinomina renderebbe
la guardia sempre verde e nessuno se ne accorgerebbe. Falsificato rinominando la costante in
entrambi i file: «il simbolo sorvegliato non esiste più».

#### 10.1-bis · Il formato del backup

Misurato: con `formatVersion >= 4` un `entityCounts` mancante è un **rifiuto al cancello**
(`tenant-backup-archive.util.ts:107-112`). ⚠️ Aggiungere le sette tabelle a
`TENANT_BACKUP_MODELS` invaliderebbe quindi **tutti gli archivi v4 esistenti**.

⭐ La via è quella già usata due volte: si alza `TENANT_BACKUP_FORMAT_VERSION` a **5** e si
dichiara `TENANT_BACKUP_V4_ENTITY_FILES` — l'elenco dei file obbligatori per un archivio v4 —
come già esiste `TENANT_BACKUP_V3_ENTITY_FILES`. ⛔ `TENANT_BACKUP_MIN_FORMAT_VERSION` resta
**3**: alzarlo renderebbe illeggibili archivi che oggi si leggono.

⚠️ **In un archivio v4 le chiavi nuove valgono `[]`, e per la regola S2 `[]` non cancella
niente**: non c'è più il rischio che un pacchetto vecchio spazzi via lo storico, perché il
ripristino non purga.

#### ⏸ 10.2 · La cancellazione amministrativa del tenant resta una cosa a parte

> ⛔ **Non è un'operazione Shopify.** È l'eliminazione di un intero cliente dal gestionale, e
> non deve passare per nessuno dei percorsi di canale.

⛔ **E non deve riusare lo sblocco dei test.** `conStoricoSbloccato` spegne i trigger con
`ALTER TABLE … DISABLE TRIGGER`: è DDL, è per tabella, e vale **per tutte le righe di tutti i
tenant** finché la transazione è aperta. Portarlo nell'applicazione significherebbe che la
cancellazione di un tenant apre una finestra in cui lo storico di **ogni altro tenant** è
cancellabile.

##### Il permesso di riga, per transazione

```sql
-- dentro shopify_storico_non_si_cancella, prima di rifiutare
IF current_setting('vestiflow.cancellazione_tenant', true) = OLD.tenant_id::text THEN
  RETURN OLD;   -- ammesso, e solo per QUESTO tenant
END IF;
RAISE EXCEPTION 'shopify_storico_non_si_cancella: …';
```

| Proprietà                          | Perché conta                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **limitato al tenant richiesto**   | il confronto è con `OLD.tenant_id`: le righe di un altro tenant restano protette a permesso acceso     |
| **per transazione**                | `set_config(..., true)` è locale: sparisce al commit come al rollback, non resta acceso                |
| **nessun DDL**                     | non serve l'ownership, non c'è niente da riaccendere, un errore a metà non lascia una tabella scoperta |
| **non riutilizzabile per sbaglio** | il valore da impostare è **l'id del tenant**: non esiste un «accendi tutto»                            |

⚠️ **Autorizzazione: resta `PLATFORM_ADMIN_EMAILS`** su `DELETE /admin/tenants/:id`. ⛔ Questa
proposta **non la cambia**.

##### ⛔ E la traccia deve SOPRAVVIVERE all'operazione che descrive

⚠️ **«Si scrive prima» non basta, ed era il difetto della stesura precedente.** Due modi in
cui una traccia scritta prima sparisce comunque:

1. è **dentro la stessa transazione**: il rollback di un tentativo fallito la porta via, e del
   fallimento non resta niente — proprio il caso che si vuole leggere dopo;
2. porta un **`tenantId`**: rientra nell'ordine di cancellazione, e l'operazione **cancella la
   propria traccia** un istante dopo averla scritta.

⭐ **Dove sopravvive**: una tabella **di piattaforma**, non del tenant. Misurato l'08/09/2026 —
su 81 modelli, solo `PaymentMethodCode` e `VatNature` non sono legati a un tenant, e sono
cataloghi globali: **una tabella così, per l'amministrazione, non esiste ancora**.

| Proprietà                           | Perché                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **nessuna FK verso `tenants`**      | il tenant sta per sparire: il riferimento va conservato come **testo**, com'è già per attore e bersaglio in `TenantUserAuditLog` |
| **fuori da `TENANT_BACKUP_MODELS`** | altrimenti torna nell'ordine di cancellazione, e si autocancella                                                                 |
| **append-only per struttura**       | nessun `updatedAt`, nessuna rotta che modifichi o cancelli                                                                       |

##### La sequenza — la riuscita sta DENTRO la transazione che cancella

```text
1  TENTATIVO      commit proprio, PRIMA di aprire la transazione di cancellazione
2  cancellazione + RIUSCITA     nella STESSA transazione, sul registro di piattaforma
3  FALLIMENTO     a parte, dopo un rollback ACCERTATO
```

⛔ **Qui la stesura precedente scriveva la riuscita DOPO, in una transazione sua, e apriva
una finestra**: la cancellazione committa, il processo muore, e resta una cancellazione
**completata senza log finale** — indistinguibile, guardando il registro, da una mai
avvenuta. Segnalato dal proprietario e **riprodotto** l'08/09/2026:

```text
sequenza PRECEDENTE — riuscita scritta dopo
  cancellazione committata, poi il log muore
     registro: tentativo          tenant: sparito     ->  INCOERENTE
```

⭐ **Con la riuscita dentro la transazione, quella finestra non esiste**, e vale un
invariante: **tenant sparito ⇔ riga «riuscita» presente**. Le due cose commettono insieme o
non commettono affatto.

##### ⛔ «Tentativo senza esito» NON significa «processo morto a metà»

⚠️ **Era scritto così, ed era una deduzione sbagliata.** Ciò che si può affermare dipende
dallo **stato del tenant**, non dal solo registro. Simulato l'08/09/2026 su schema isolato,
con la sequenza proposta:

| Scena                                                    | Registro               | Tenant   | Che cosa si può AFFERMARE                 |
| -------------------------------------------------------- | ---------------------- | -------- | ----------------------------------------- |
| percorso felice                                          | tentativo + riuscita   | sparito  | **completata**                            |
| cancellazione fallita, rollback accertato                | tentativo + fallimento | presente | **fallita**                               |
| interruzione fra tentativo e cancellazione               | tentativo              | presente | **non completata — causa non registrata** |
| la scrittura della **riuscita** fallisce                 | tentativo              | presente | **non completata — causa non registrata** |
| cancellazione riuscita, processo morto subito dopo       | tentativo + riuscita   | sparito  | **completata**                            |
| il client **crede** di aver fallito, ma aveva committato | tentativo + riuscita   | sparito  | **completata**                            |

⭐ **Un esito incerto non si presenta come fallimento certo.** «Tentativo, tenant presente»
dice con **certezza** che la cancellazione **non ha commesso** — perché se avesse commesso la
riuscita sarebbe lì — e lascia incerta **solo la causa**. Si scrive «non completata, causa non
registrata», mai «fallita».

##### ⭐ Il fallimento si scrive solo dopo un rollback ACCERTATO

Nella simulazione una scena lo esercita: il client perde la connessione e **crede** di aver
fallito, ma la transazione aveva commesso. Prima di scrivere «fallimento» si rilegge il
tenant: **c'è ancora?** Se non c'è, il fallimento **non si scrive** — sarebbe una bugia
messa a verbale.

⚠️ **La scrittura del registro può fallire a sua volta**, e i tre casi hanno esiti diversi:

| Fallisce…                              | Conseguenza                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| il **tentativo**                       | ⛔ la cancellazione **non parte**: nessuna operazione senza traccia iniziale |
| la **riuscita**, dentro la transazione | ⭐ **rotola indietro tutto**: il tenant sopravvive, ed è lo stato coerente   |
| il **fallimento**, dopo il rollback    | resta «tentativo, tenant presente» — leggibile come non completata           |

⛔ **La correlazione tiene insieme le righe**: portano lo stesso identificativo di
operazione, o «tentativo» ed «esito» diventano due fatti che nessuno sa accoppiare.

##### Le alternative scartate, e perché

| Scartata                                                           | Perché                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| aggiungere le sette tabelle a `TENANT_BACKUP_DELETE_ORDER` e basta | non basta: i trigger vietano il DELETE. Fallirebbe uguale, più tardi e con un errore peggiore                                                                                                                                                 |
| togliere i trigger `mai_delete`                                    | ⛔ è la protezione, e la cancellazione di un tenant è l'unico caso che la deve superare                                                                                                                                                       |
| `ON DELETE CASCADE` verso `tenants`                                | ⛔ una cancellazione accidentale porterebbe via lo storico senza che nessun vincolo si opponga                                                                                                                                                |
| **tutta** la traccia dentro la transazione di cancellazione        | ⛔ col rollback sparirebbe anche il **tentativo**, e di un’operazione fallita non resterebbe niente. ⚠️ Da non confondere con la soluzione approvata, che dentro quella transazione registra **soltanto la riuscita**, insieme all’operazione |
| non cancellare mai, solo marcare il tenant                         | è una decisione di prodotto che nessuno ha preso, e cambierebbe la politica attuale                                                                                                                                                           |

#### ✅ 10.2-bis · A4 è IMPLEMENTATA — 08/09/2026

> **La cancellazione amministrativa del tenant è tracciata, e cancella lo storico dei
> collegamenti del SOLO tenant richiesto.** Sequenza, registro e prova di terminazione sono
> quelli già collaudati dal cestino: non ne è nato un secondo.

##### ⭐ La sequenza NON è stata riscritta: è stata SPOSTATA

`conRegistro` viveva dentro `ProductsService`, privato. Al secondo consumatore, copiarlo
avrebbe significato due copie della stessa decisione — quello che `regole-qualita` vieta «al
secondo punto che applica la stessa regola». Vive ora in `PlatformAuditService.conRegistro`,
e il cestino ci delega.

⚠️ **Le 27 prove del registro sono rimaste verdi senza toccarne una**: è ciò che dimostra
che è stato uno spostamento e non una riscrittura.

##### ⛔ Due funzioni distinte, e la ragione non è solo tecnica

Deciso dal proprietario. `shopify_storico_non_si_cancella` serviva **entrambi** i trigger, di
riga (DELETE) e di istruzione (TRUNCATE). Un permesso che confronta `OLD."tenant_id"` non ha
senso dove `OLD` non esiste — ma soprattutto, con una funzione sola non si vede più che cosa
è autorizzato e che cosa non lo è.

```text
shopify_storico_delete_col_permesso   ammette il DELETE del SOLO tenant autorizzato
shopify_storico_truncate_vietato      rifiuta SEMPRE, senza eccezioni
```

I dieci trigger sono stati ripuntati **conservando i nomi** — sono quelli che la fixture
spegne uno per uno e che la guardia verifica — e la funzione ambigua è stata **eliminata**,
perché lasciarla disponibile significherebbe poterci tornare dentro per distrazione.

⚠️ **Il messaggio d'errore è rimasto identico**, ed è voluto: la guardia e le prove lo
riconoscono, e cambiarlo qui avrebbe trasformato una correzione in una rottura silenziosa di
ciò che la verifica.

##### Le due chiavi della cancellazione, che non funzionano da sole

|                         |                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **il permesso di riga** | `vestiflow.cancellazione_tenant`, `set_config(…, true)`, confronto con `OLD.tenant_id` |
| **l'ordine completo**   | `TENANT_BACKUP_DELETE_ORDER_COMPLETO`, chiesto con `includiStorico`                    |

⭐ **L'ordine era già giusto e non è stato inventato**: le sette tabelle stanno nel registro
prima di `shopifyConnections`, quindi al contrario le connessioni si cancellano prima dei
negozi a cui puntano, e lo storico prima delle anagrafiche a cui si aggancia. Nessuna seconda
sequenza da tenere allineata.

⛔ **Il ripristino da backup continua a NON toccare lo storico**: sono due ordini diversi, e
la prova `3c` lo verifica confrontandoli.

##### L'attore, dal profilo autenticato

`attoreDaProfilo(request.appUser)` — `displayName` come nome, `email` nel campo dedicato.
⚠️ **Nessun valore dal corpo della richiesta**, e le autorizzazioni restano `PlatformAdminGuard`
con `PLATFORM_ADMIN_EMAILS`: A4 non le cambia.

⭐ **Il controller riceveva già l'attore** per tre altri comandi via `request.appUser`: qui non
si è aggiunto un meccanismo, si è usato quello che c'era.

##### ⭐ Il negozio Shopify torna collegabile, ma solo con una NUOVA autorizzazione

Deciso dal proprietario l'08/09/2026. Cancellata definitivamente l'azienda, `shopGid` — che è
unico globalmente — torna libero, e quel negozio può essere collegato a un'altra azienda
**tramite una nuova autorizzazione esplicita**.

⛔ **Nessun trasferimento automatico** di dati, credenziali o collegamenti. ⛔ E **una
semplice disconnessione non libera** questa appartenenza: quella lascia coppie e periodi al
loro posto (§15.2). ⚠️ A4 **non tocca il negozio su Shopify** e **non implementa** il nuovo
collegamento.

##### Le prove, e la loro falsificazione

`cancellazione-tenant.integration-spec.ts` — **14 prove** dal servizio vero, più la spec del
controller per l'attore.

| Difetto rimesso                                     | Rosse                  |
| --------------------------------------------------- | ---------------------- |
| la riuscita torna FUORI dalla transazione           | 1e                     |
| il permesso non si accende affatto                  | 1a, 1b, 1c, 1d, 3a     |
| il permesso si accende NON locale                   | 2a, 2c, 2e             |
| lo storico torna fuori dall'ordine di cancellazione | 1a, 1b, 1c, 1d, 3a     |
| l'attore viene preso da altrove                     | la spec del controller |
| ⭐ il permesso diventa LARGO **[database]**         | 2a, 2b, 2c             |
| ⭐ il TRUNCATE diventa autorizzabile **[database]** | 2f                     |

⛔ **Due falsificazioni non producevano rosso, ed è stata la parte utile.**

1. **La riuscita fuori dalla transazione**: tredici prove su tredici restavano verdi. `1b`
   non poteva distinguere — lì la scrittura fallisce comunque, dentro o fuori. Serviva una
   prova in cui la riuscita **riesce** e a cadere è ciò che viene dopo: è `1e`, e senza di
   lei l'invariante di §10.2 non era verificato da nessuno.
2. **L'attore preso da altrove**: verde nell'integrazione perché quella spec costruisce
   l'attore da sé. A coprirlo è la spec del **controller**, che asserisce l'oggetto esatto.

⚠️ **E una prova passava per il motivo sbagliato al primo colpo**: il `TRUNCATE` su
`shopify_product_links` è rifiutato da PostgreSQL **prima** del trigger, con `0A000` — «cannot
truncate a table referenced in a foreign key constraint». Ora si tronca una **foglia**
(`shopify_variant_links`), così a rifiutare è davvero il trigger.

##### Che cosa A4 NON risolve

|                                                |                                                              |
| ---------------------------------------------- | ------------------------------------------------------------ |
| **fase B**                                     | ⛔ non iniziata: le sette tabelle restano vuote in esercizio |
| **il nuovo collegamento del negozio liberato** | ⛔ non implementato: richiede l'autorizzazione esplicita     |
| **cestino ↔ pubblicazione** (§17)              | ⛔ invariato                                                 |

#### ⏸ 10.3 · Il registro — UNO solo, che nasce con il sottoinsieme minimo

> ⭐ **Deciso dal proprietario l'08/09/2026: un unico registro definitivo, che all'inizio
> porta solo il sottoinsieme minimo necessario. Non due registri da fondere dopo.**

⛔ **«Si registra» non basta**, ed era la lacuna della stesura precedente: il primo percorso
operativo rifiuta una reimportazione e lascia una riga di log su un container che il riavvio
perde. Un rifiuto invisibile è indistinguibile da un articolo che non è mai arrivato.

⚠️ **E nemmeno «un registro minimo adesso, quello vero dopo» andava bene**: due registri sono
due schemi, due scritture da tenere allineate e una fusione da fare — e la fusione è il lavoro
che non si fa mai.

##### I campi — quelli di §7.4, con tre precisazioni

| Campo            | Nella prima tranche                                                                                             | §7.4                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **autore**       | ⭐ umano **o processo**: `webhook` · `pull` · `push` · `utente` + snapshot testuale                             | «operatore»            |
| **tenant**       | ✅ come **testo**, per la ragione di §10.2                                                                      | ✅                     |
| **negozio**      | ⭐ `shop_gid` — non è fra le nove: la stessa operazione su due negozi è due operazioni                          | —                      |
| **entità**       | famiglia + GID remoto + identificativo locale, come snapshot testuali                                           | «record e snapshot»    |
| **operazione**   | `creazione_rifiutata` · `identita_scritta` · `periodo_aperto` · `riaggancio_rifiutato` · `cancellazione_tenant` | —                      |
| **motivo**       | la regola che ha deciso, per nome                                                                               | «avvisi · conferma»    |
| **data e ora**   | ✅                                                                                                              | ✅                     |
| **esito**        | ⭐ `tentativo` · `riuscita` · `ininfluente` · `rifiutata` · `fallita` (il quinto: sotto)                        | «tentativi ed errori»  |
| **correlazione** | consegna webhook, lotto di pull, o operazione amministrativa                                                    | «ID operazione remota» |

⏸ **Restano da riempire, e le colonne nascono già previste**: avvisi mostrati, conferma
ricevuta, stato Shopify prima e dopo. È il senso di «un registro solo»: si aggiungono valori,
non tabelle.

##### La scelta della tabella — motivata rispetto a ciò che esiste

| Modello esistente         | Perché non si riusa                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TenantUserAuditLog`      | ⭐ **la forma giusta** (snapshot testuali, nessuna FK verso l'attore) ma il **dominio è sbagliato**: è l'audit degli utenti di un tenant, ha `tenantId` con FK, e sparirebbe con lui |
| `OnlineOrderEvent`        | registro di **eventi ricevuti** con chiave di deduplica: qui si registra ciò che **noi** abbiamo fatto                                                                               |
| `CashSessionDeviceChange` | ⭐ **il modello strutturale da copiare** — append-only senza `updatedAt` — ma è legato a una sessione di cassa                                                                       |
| `StockMovement`           | è un movimento di magazzino, con effetti sulla giacenza: non è un registro di operazioni                                                                                             |
| `DocumentRevision`        | numerazione progressiva per documento, dominio documentale                                                                                                                           |

⭐ **Quindi una tabella nuova, che prende la FORMA di `TenantUserAuditLog` e la
STRUTTURA append-only di `CashSessionDeviceChange`**, e non è legata al tenant da una FK.

##### ⭐ Il nome: `PlatformAuditLog` / `platform_audit_logs`

| Perché questo                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- |
| ⭐ **fa coppia con `TenantUserAuditLog`**: stesso suffisso, scope diverso — e chi conosce l'uno riconosce l'altro            |
| ⭐ **il prefisso dichiara la proprietà che conta**: è della PIATTAFORMA, non del tenant, quindi non sparisce con lui         |
| ⭐ **«platform» è già il vocabolario del progetto**: `PlatformAdminGuard`, `PLATFORM_ADMIN_EMAILS`, `common/platform-admin/` |
| ⚠️ **non nomina Shopify**, ed è voluto: porta anche la cancellazione del tenant, e domani altro                              |

⛔ **Scartati**: `OperationLog` («log» suggerisce qualcosa di eliminabile, e questo non lo
è), `ShopifyAuditLog` (il perimetro è più largo del canale), `AuditEvent` (non dice a che
livello vive, che è l'unica cosa che lo distingue da `TenantUserAuditLog`).

##### ✅ Stato — A5 e` implementato l'08/09/2026, e NON completa il resto

| Pezzo                                                                                                                                                                                                               | Stato                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| modello `PlatformAuditLog` + tre enum (`Actor`, `Operation`, `Outcome`)                                                                                                                                             | ✅ implementato                                                                                                                                                      |
| migration `20260908120000_platform_audit_log`, con RLS e REVOKE                                                                                                                                                     | ✅ implementata, applicata al **solo** database di prova                                                                                                             |
| `PlatformAuditService` con i **tre modi** della sequenza canonica                                                                                                                                                   | ✅ implementato, globale come `PlatformAdminModule`                                                                                                                  |
| integrazione nei **quattro comandi** di cestino e ripristino                                                                                                                                                        | ✅ implementata                                                                                                                                                      |
| guardia `check:registro-append-only`, falsificata in quattro direzioni                                                                                                                                              | ✅ nella catena di `npm run lint`                                                                                                                                    |
| 14 prove su **database reale** (`registro-cestino.integration-spec.ts`)                                                                                                                                             | ✅ verdi                                                                                                                                                             |
| quinto esito `ininfluente` + migration `20260908180000_esito_ininfluente`                                                                                                                                           | ✅ implementato, applicato al **solo** database di prova (§10.3-bis)                                                                                                 |
| 12 prove di **concorrenza** (`registro-cestino-concorrenza.integration-spec.ts`)                                                                                                                                    | ✅ verdi, falsificate in cinque direzioni                                                                                                                            |
| ⭐ **i rifiuti dell'import** (B5-B6): valori `import_prodotto_rifiutato`, `import_variante_rifiutata`, `riaggancio_rifiutato` + migration `20260909030000_import_rifiutato` e `20260909080000_riaggancio_rifiutato` | ✅ implementati il **09/09/2026**, applicati al **solo** database di prova                                                                                           |
| `PlatformAuditService.registraRifiuto(dati, detail, correlationId)` — una riga `rifiutata`, **connessione propria** (sopravvive al rollback dell'import), correlazione dell'**ingresso**, errore non ingoiato       | ✅ implementato e corretto sul mandato lo stesso giorno (B5–B6, «La registrazione persistente»)                                                                      |
| i punti d'uso in `ShopifyProductPullService`: guardia prodotto, guardia variante, `registraStorico` (prodotto e variante) — attore `pull` o `webhook`                                                               | ✅ implementati, log conservato accanto alla riga                                                                                                                    |
| prove su database reale: `divieto-ricreazione` B5a, B5a-bis, B5a-ter, B5a-quater, B5f, B5f-bis, B6a, B6c, B6d, B6f, B6g, B6h, B6h-bis, **B6i** (rollback), **B6j** (registro guasto), B6k; campagna M, S6 e S8      | ✅ verdi; falsificate in tre direzioni (scrittura spenta · riga dentro `tx` · errore ingoiato)                                                                       |
| ⭐ **la connessione RISERVATA al registro** (`PlatformAuditPrismaClient`, `connection_limit=1`) per le sole scritture autonome, con `registro-pool` P1/P2 e la prova unitaria di `urlRiservataAlRegistro`           | ✅ implementata il **09/09/2026** e falsificata (scritture rimesse sul pool condiviso → P1 rossa); cestino, concorrenza del cestino e cancellazione tenant invariati |

⛔ **Che cosa questa tranche NON risolve**, e non va letto come risolto:

|                                                  |                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A4** — la traccia della cancellazione tenant   | ⛔ non fatta: l'enum non porta `cancellazione_tenant`, e `DELETE /admin/tenants/:id` **non ha nemmeno l'attore** (non usa `@CurrentUser`)                                                                                                                                                          |
| **backup e ripristino** (§10.1)                  | ⛔ invariati                                                                                                                                                                                                                                                                                       |
| **storico operativo** — le sette tabelle Shopify | ⛔ invariato: restano vuote                                                                                                                                                                                                                                                                        |
| **concorrenza cestino ↔ pubblicazione** (§17)    | ⛔ non collaudata, e il rimedio nel `where` resta una proposta parziale. ⚠️ §10.3-bis copre la concorrenza **cestino ↔ cestino**, che è un'altra cosa: lì i due contendenti sono entrambi locali e il lock di riga li mette in fila. Con Shopify il secondo contendente sta **fuori dal database** |

##### Le tre garanzie, e come sono state dimostrate

| Garanzia                                       | Prova                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **la traccia sopravvive al ripristino**        | il cestino azzera le sue tre colonne, il registro conserva le quattro righe **e il motivo**   |
| **non dipende dalla sopravvivenza del tenant** | `svuota` tronca `tenants` con `CASCADE`: il registro resta, con `tenantId` e attore leggibili |
| **riuscita insieme all'operazione**            | rotta la scrittura della riuscita **sul database**, il prodotto **non** finisce nel cestino   |

⭐ **Nessuna chiave esterna, e il database lo impone insieme al codice**: tre CHECK — un
utente porta un nome, un processo non ne porta, un esito negativo dice perché. La guardia
statica rifiuta un `updatedAt`, una relazione, e il modello dentro `TENANT_BACKUP_MODELS`.

⚠️ **L'idempotenza sta PRIMA del tentativo**: una richiesta che non ha niente da fare non
lascia una traccia orfana, o «tentativo senza esito» smetterebbe di significare «qualcosa è
andato storto».

##### ⛔ 10.3-bis · Due difetti di CONCORRENZA, riprodotti e corretti l'08/09/2026

Indicati dal proprietario prima di chiudere A5. Nessuno dei due si vedeva: le 14 prove
sopra erano verdi, e restano verdi.

###### 1 · Lo stato dell'articolo NON accerta il rollback

```text
        transazione COMMESSA        registro: tentativo + riuscita
        la risposta si perde        (rete, processo, timeout del client)
        un ALTRO utente ripristina  l'articolo torna fuori dal cestino
        la verifica rilegge         deletedAt e' null  ->  "quindi e' rotolato indietro"
        scrive                      ⛔ fallita, accanto a una riuscita gia' a verbale
```

⛔ **Il registro conteneva due fatti incompatibili per la stessa correlazione**, e nessuno
dei due era sbagliato preso da solo: la riuscita l'aveva scritta la transazione, il
fallimento la verifica. A sbagliare era **la domanda**: lo stato corrente è di tutti, e
chiunque può averlo cambiato nel frattempo.

> ⭐ **La prova del rollback è il REGISTRO, non l'entità.** `riuscita` e `ininfluente` si
> scrivono **dentro** la transazione dell'operazione: se non ci sono, quella transazione non
> ha commesso — e nessun terzo può cambiare questo fatto.

⚠️ **Esito incerto ⇒ non si scrive.** Se la lettura del registro fallisce, nessuno può dire
se l'operazione abbia commesso: resta il `tentativo` senza esito, che si legge «non si sa».
⛔ Mai una `fallita` scritta al buio.

###### ⛔ 1-bis · E l'ASSENZA di esito non basta: bisogna sapere che la transazione è FINITA

Indicato dal proprietario subito dopo la prima correzione, ed è **la stessa deduzione
sbagliata spostata di un passo**.

> **La riuscita presente prova il commit. La sua assenza prova il rollback soltanto se la
> transazione è terminata.**

⛔ La prima stesura leggeva «nessun esito nel registro» come «rollback accertato». Ma una
transazione **ancora in volo** non ha scritto niente _e può ancora commettere_: la sua
assenza dal registro non è una prova di niente. Il caso non è teorico — è il client che
rinuncia per timeout mentre la transazione è ferma su un lock di riga, cioè esattamente la
concorrenza di cui parla il caso 2.

⭐ **La risposta la dà PostgreSQL, non una deduzione**: `pg_current_xact_id()` come **prima**
istruzione della transazione, e `pg_xact_status(xid)` al momento della verifica.

| Stato letto             | Significa                                                            | Si scrive? |
| ----------------------- | -------------------------------------------------------------------- | ---------- |
| esito già nel registro  | ha **commesso**, risposta persa dopo                                 | ⛔ no      |
| xid **mancante**        | non è arrivata alla prima istruzione: l'operazione non è mai partita | ✅ sì      |
| `aborted`               | **rollback accertato**                                               | ✅ sì      |
| `in progress`           | può ancora commettere                                                | ⛔ no      |
| `committed` senza esito | anomalia                                                             | ⛔ no      |
| lettura fallita         | non si sa                                                            | ⛔ no      |

⭐ **`aborted` è conclusivo, e per una ragione precisa**: quella risposta arriva solo quando
lo xid è uscito dal procarray, cioè quando la sorte è ormai decisa. Nella finestra fra la
scrittura nella CLOG e l'uscita dal procarray la risposta è `in progress` — **l'errore cade
sempre dalla parte dell'incertezza**, mai da quella opposta.

⚠️ **Verificato in croce fra due sessioni sul database di prova**, invece che dedotto dalla
documentazione: una transazione viva di un'altra sessione risulta `in progress`, e dopo la
chiusura `committed` o `aborted`. PostgreSQL 17.11.

⛔ **DA VERIFICARE PRIMA DEL RILASCIO — l'utenza vera dell'applicazione.** Indicato dal
proprietario l'08/09/2026. La misura sopra è stata fatta sul container di prova, dove il
ruolo è `vestiflow` con `usesuper = true`: `has_function_privilege('public', …)` rispondeva
`true`, ma è l'immagine PostgreSQL di serie, e un provider può revocare.

| Funzione               | Chi la usa               | Se non fosse disponibile                                                                   |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `pg_current_xact_id()` | **codice di produzione** | ⛔ `identificaTransazione` lancia come **prima** istruzione: ogni cestino fallirebbe       |
| `pg_xact_status(xid8)` | **codice di produzione** | la verifica non sa come sia finita ⇒ esito sempre **incerto**: nessuna `fallita` a verbale |
| `pg_blocking_pids()`   | solo le **prove**        | non tocca il rilascio                                                                      |

⭐ **I due esiti sono molto diversi**, e per questo la verifica va fatta prima e non dopo: il
secondo degrada in modo sicuro (si perde informazione, non si scrive niente di falso), il
**primo rompe la funzione**. Si verifica con l'utenza effettiva dell'API sull'ambiente di
destinazione, in sola lettura, e il risultato si scrive qui.

⚠️ **E i due controlli sono RIDONDANTI nel percorso reale**, il che va dichiarato: se un
esito c'è, lo stato risponderebbe `committed` e ci si fermerebbe comunque. Il controllo sul
registro resta perché è la prova **positiva** del commit e non dipende dal privilegio di
eseguire `pg_xact_status` — ma **nessuna delle altre prove arrossisce togliendolo**, e per
questo ne ha una sua (`1f`, costruita sull'incoerenza che il controllo esiste per non
peggiorare).

###### 2 · Due richieste simultanee — e le due finestre sono diverse

La lettura di idempotenza sta **prima** del tentativo, quindi una seconda richiesta
_sequenziale_ non arrivava neppure a registrarsi. Ma fra quella lettura e la transazione
c'è una finestra, e dentro la transazione ce n'è una seconda:

| Dove cade la seconda lettura | Che cosa succedeva                                                                                                                                                 | Ora           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **dopo** il primo commit     | ⛔ «Prodotto non trovato» — un **404 falso** su un prodotto che esiste                                                                                             | `ininfluente` |
| **prima** del primo commit   | l'`updateMany` si blocca sul lock, poi aggiorna **0 righe** — ⛔ `count` ignorato, e si scriveva `riuscita`: la modifica veniva attribuita a chi non l'aveva fatta | `ininfluente` |

⭐ **Il quinto esito, `ininfluente`.** Non è un fallimento: niente è andato storto. Non è un
rifiuto: nessuna regola ha detto no. E non è una riuscita: non ha cambiato niente.

⛔ **Senza di lui il `tentativo` della seconda richiesta resterebbe senza esito**, e
«tentativo senza esito» smetterebbe di significare «qualcosa è andato storto» — che è
l'unica cosa che quella forma deve poter dire.

⚠️ **È un valore aggiunto all'enum**, quindi una modifica al modello: migration
`20260908180000_esito_ininfluente`, applicata al **solo** database di prova. Non era
previsto in §10.3 e non è un ampliamento discrezionale — è ciò che il requisito «nessun
tentativo lasciato senza esito da una normale richiesta concorrente» impone.

⛔ **E `ininfluente` non copre tutto**: la riga **davvero** scomparsa resta un 404. Il
discrimine è `if (!dentro)` contro `if (dentro.deletedAt != null)`, e sono due condizioni
distinte proprio perché prima erano fuse in un `||`.

###### Le prove, e la loro falsificazione

`registro-cestino-concorrenza.integration-spec.ts` — 12 prove sul PostgreSQL sacrificabile,
**prodotti e varianti**, stato finale **e** righe di registro insieme.

⭐ **La concorrenza è CAUSALE, non a tempo e non per conteggio.** La prima transazione
dichiara il proprio `pg_backend_pid()` **dopo** aver acquisito il lock, e la seconda parte
solo allora; poi si attende che qualcuno risulti bloccato **proprio da quella sessione**,
con `pg_blocking_pids`.

⛔ **Qui prima si contavano i lock non concessi** (`SELECT count(*) FROM pg_locks WHERE NOT
granted`), e sono due difetti in uno: un lock qualunque — di un altro file di prova, di
un'altra sessione — bastava a dichiarare osservata una concorrenza **non causata dalla
prova**; e la seconda richiesta partiva senza garanzia che la prima avesse già preso il
lock, quindi l'ordine dei due lo decideva lo scheduler. La prova `0` conserva questa
falsificazione nel repository: costruisce un blocco fra sessioni **estranee**, verifica che
il conteggio sarebbe passato, e che l'attesa causale invece rifiuta.

⚠️ **Entrambe le transazioni si chiudono sempre**, anche quando la prova fallisce: una
transazione lasciata aperta tiene il lock, e i file successivi si fermerebbero sul
troncamento della fixture con un errore che non nomina la causa.

Rimesso un difetto alla volta, arrossano **esattamente** le prove che lo coprono:

| Difetto rimesso                                         | Rosse                   |
| ------------------------------------------------------- | ----------------------- |
| la verifica non guarda più il registro                  | 1f — e nessun'altra     |
| «nessun esito» torna a valere come «rollback accertato» | 1d, 1e — e nessun'altra |
| «già nel cestino» torna a essere un 404                 | 2d, 2e — e nessun'altra |
| `updateMany.count` torna a essere ignorato              | 1d, 1e, 2a, 2b, 2c      |
| l'attesa torna a contare i blocchi invece di nominarli  | 0 — e nessun'altra      |

⚠️ **Sei prove unitarie erano rosse dopo la correzione, e il difetto era nel MOCK**: `updateMany`
non restituiva `{ count }`, quindi la destrutturazione falliva con un errore che col cestino non
c'entrava niente. Un finto client che omette il valore di ritorno non è «neutro».

##### Tre vincoli di forma

1. ⛔ **Il rifiuto si scrive FUORI dalla transazione che ha rifiutato**, o sparisce col
   rollback. È la differenza rispetto a `TenantUserAuditLog`, che scrive solo dopo un'operazione
   riuscita: qui metà dei casi utili sono fallimenti, e sono proprio quelli che si vanno a cercare.
2. **Append-only per struttura**, con una guardia sul modello di `check:cassa-append-only`.
3. ⚠️ **Nessun segreto e nessun dato personale**: del webhook si registra la **correlazione**,
   non il contenuto (`regole-sicurezza`, «LOGGING E AUDIT»).

---

### ⏸ 11 · Censimento — che cosa incontra `RESTRICT` dopo la prima identità

⛔ **La doppia scrittura non deve rendere impossibili eliminazioni oggi consentite.** Questo è
l'elenco misurato l'08/09/2026 di ciò che, scritta la prima identità, si troverebbe davanti
una FK `RESTRICT` — e per ognuno la risposta proposta.

| #   | Comando                                                                       | Chi lo trattiene                                    | Oggi                                    | Proposta                                                                                                                              |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`deleteVariantInTx`** — variante tolta dal form prodotto (`:1268`)          | `shopify_variant_identities.variant_id`             | ✅ consentita se non ha movimenti       | ⭐ **resta consentita**: prima si **chiude il collegamento**, poi si **elimina definitivamente in locale** (§15.5), poi la riga       |
| 2   | **`removeProduct`** — eliminazione prodotto (`:961`)                          | `shopify_product_identities.product_id`             | ⛔ già rifiutata se collegato a Shopify | invariata: chi non è collegato non ha identità, chi lo è era già rifiutato                                                            |
| 3   | **ripristino da backup** — purga `products` / `productVariants` / `locations` | identità e coppie, **anche a periodi tutti chiusi** | ✅ consentito                           | ⭐ **riesce**: quattro FK differite al commit, storico mai purgato (§10.1)                                                            |
| 4   | **cancellazione amministrativa del tenant**                                   | `shopify_shops.tenant_id` e le altre sei            | ✅ consentita                           | permesso di riga per transazione, limitato a quel tenant (§10.2)                                                                      |
| 5   | **`disconnect()`** — azzera `shopifyLocationId` sulle sedi                    | nessuno: aggiorna, non cancella                     | ✅ consentito                           | ✅ **deciso** (§15.2): coppie e periodi **restano**, nessun `shop_change`; a fermare la sincronizzazione è lo stato della CONNESSIONE |
| 6   | **sync location** — non cancella più sedi (due `location.delete` già rimossi) | —                                                   | ✅                                      | invariato                                                                                                                             |

⭐ **Il punto 1 è quello che il proprietario ha nominato, ed è il caso vero.** Oggi togliere
una variante dal form di un prodotto Shopify **è consentito** (l'unico blocco sono i
movimenti), e la variante resta viva sul negozio remoto perché il push non cancella. Se la
doppia scrittura le desse un'identità e null'altro, quell'eliminazione **smetterebbe di
funzionare**: una funzione che c'era sparirebbe come effetto collaterale.

> **Chi scrive l'identità si prende anche il dovere di chiuderne il collegamento.** La
> doppia scrittura e la chiusura in eliminazione sono lo **stesso** lavoro, e non si spezzano
> in due tranche.

⚠️ **Due parole distinte, e §15.5 spiega perché**: **chiudere il collegamento** finisce il
periodo e lascia viva l'identità; **eliminare definitivamente in locale** azzera `product_id`,
scrive `local_deleted_at` ed è **irreversibile**. «Sganciare», da solo, le confondeva.

⚠️ **Eliminare definitivamente non è cancellare l'identità**: quella resta, con
`local_deleted_at` valorizzato e il periodo chiuso con causale `local_delete`. L'esclusione del GID **nasce lì**, ed è la ragione
per cui il caso 1 è insieme il rischio e il primo consumatore utile del modello.

#### Che cosa la doppia scrittura COPRE — e che cosa dichiaratamente no

| Percorso                                                                   | Copre?                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **pull manuale** del catalogo → `importProduct`                            | ✅ prodotto e varianti create                                                            |
| **webhook** `products/create` · `products/update` → stesso `importProduct` | ✅ è lo stesso motore                                                                    |
| **push verso Shopify** → `persistShopifyIds` (`:960`)                      | ✅ **sì, e va detto**: crea il remoto e ne scrive gli id, quindi crea un collegamento    |
| varianti **senza SKU locale**, o il cui SKU non torna dal remoto           | ⛔ **no**: `persistShopifyIds` non scrive i loro id, quindi non c'è identità da scrivere |
| **import CSV** → crea in locale e accoda un push                           | ✅ per via del push, non per via propria (`docs/24` §12.0)                               |
| **sync location** → crea sedi e collega                                    | ⚠️ famiglia sede: coppia + periodo, e con la correzione del punto sotto                  |
| articoli **collegati prima** della tranche                                 | ⛔ **no**: le loro identità non esistono finché non c'è il backfill (fase 3)             |

⛔ **La riga delle varianti senza SKU non è un dettaglio**: dopo un push, un prodotto può
avere l'identità e **alcune** varianti no. È uno stato parziale legittimo, e ogni lettore
deve tollerarlo — non è un difetto da «riparare» inventando identità per varianti che
Shopify non ha ancora abbinato.

---

### ⏸ 12 · Correzione — nessun collegamento automatico di sede per NOME

⛔ **La stesura precedente diceva «il riaggancio per NOME si condiziona all'assenza di un
periodo chiuso». È sbagliata**, e va corretta: condizionata così, una sede **mai collegata**
verrebbe agganciata automaticamente per nome, che è esattamente ciò che §1.13 vieta.

> **`docs/24` §1.13, decisione del 07/09/2026: «la sincronizzazione avviene soltanto dove
> esiste un collegamento esplicito, e quel collegamento lo dichiara una persona».**

⭐ **Non esiste un collegamento automatico per nome, punto.** Né dopo una chiusura, né senza
periodi precedenti, né alla prima connessione.

| Situazione                                      | Oggi                                                        | Proposta                                          |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| sede con `shopifyLocationId` **corrispondente** | ✅ riconosciuta per id                                      | ✅ invariato: è un id, non un nome                |
| sede **senza** `shopifyLocationId`, stesso nome | ⛔ **agganciata automaticamente** (`findMatch`, `:294-302`) | ⛔ **non agganciata**                             |
| location Shopify senza sede corrispondente      | crea una sede nuova già collegata                           | ⛔ **non la crea**: §1.13.1 lo decide già (§15.3) |

⚠️ **Una proposta per nome può restare come AIUTO alla lettura**, mai applicata da sola: è
già la forma scritta in `docs/24` §11.x per gli articoli — «proposta per nome/opzioni, mai
automatica».

⛔ **E va corretta anche la frase di §1.13 che ha generato l'errore.** Dice che senza storico
«"il collegamento è chiuso" e "il collegamento non è mai esistito" sono indistinguibili, ed è
esattamente la differenza che impedisce il riaggancio automatico»: letta di corsa suggerisce
che **con** lo storico il riaggancio per nome dei mai-collegati torni lecito. Non è così — lo
storico serve a **dire quale dei due casi è**, non ad autorizzare il primo.

---

### ⏸ 13 · La prima tranche ATTUABILE

> ⛔ **Proposta. Non autorizzata, non implementata.** ⚠️ **Non è la §10 della stesura
> precedente**: quella cominciava dal divieto e lasciava fuori compatibilità, sedi e
> registro. Con i sei punti dell'08/09 il perimetro cambia — e cambia anche l'ORDINE.

⭐ **Prima si rende il modello compatibile con ciò che esiste, poi si comincia a scriverci
dentro.** Scrivere la prima identità con backup, ripristino e cancellazione ancora fragili
significa rompere tre funzioni che oggi lavorano, e scoprirlo dal campo.

#### Fase A — compatibilità, senza scrivere una sola identità

| #            | Lavoro                                                                                                                                                                                     | Chiude     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| A1 ✅        | backup **v5**: le sette tabelle nell'export, `TENANT_BACKUP_V4_ENTITY_FILES` per gli archivi vecchi                                                                                        | §10        |
| A2 ✅        | quattro FK verso l'anagrafica a `NO ACTION DEFERRABLE INITIALLY IMMEDIATE`, differite **per nome** dal ripristino                                                                          | §10.1      |
| A2-bis ✅    | permesso di riga per far nascere un'identità **già eliminata**, senza indebolire gli inserimenti ordinari (§10.1 S2-bis)                                                                   | §10.1      |
| A2-ter ✅    | pre-controllo che confronta le colonne **immutabili** (tenant, negozio, GID, appartenenze) e **non** sovrascrive lo stato: le incongruenze si nominano (§10.1 S3)                          | §10.1      |
| A2-quater ✅ | ripristino: **non purga mai** lo storico e lo reinserisce **solo per assenza** — è ciò che salva il recupero su database vuoto                                                             | §10        |
| A3 ✅        | pre-controllo che **spiega** prima di aprire la transazione, con `assertNoIncomingTenantReferences` esteso alle sette tabelle                                                              | §10        |
| A4 ✅        | cancellazione tenant: permesso di riga per transazione, limitato a quel tenant; **traccia** su tabella di piattaforma. ⛔ La sequenza **non si riassume qui**: è quella canonica di §10.2  | §10.2      |
| A5 ✅        | il registro **definitivo** `PlatformAuditLog`, che nasce col sottoinsieme minimo; guardia append-only. ⛔ La regola di scrittura **non si riassume qui**: è quella canonica di §10.2-§10.3 | §10.3      |
| A6 ✅        | `check:storico-non-cancellabile` esteso ai trigger `…_immutabile` e al nuovo permesso di riga                                                                                              | robustezza |

⭐ **La fase A è interamente verificabile a tabelle VUOTE più fixture**, e non cambia il
comportamento di nessuna funzione esistente: è compatibilità, non funzione nuova.

⚠️ **A5 va in fase A, non in fase B**, ed è la correzione del punto 5: se il registro arriva
dopo, il primo rifiuto della fase B è un rifiuto che nessuno può leggere.

#### Fase B — la prima scrittura, e il divieto

| #   | Lavoro                                                                                                                                 | Dove                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| B1  | **fase 2 di §8.5.8**: acquisizione dello `shop_gid`, riga `shopify_shops`, `shopify_connections.shop_id`                               | `shopify-admin.client.ts` · `shopify-oauth.service.ts` (2 punti) |
| B2  | **doppia scrittura** su `importProduct`: identità + periodo nella stessa transazione delle colonne-cache                               | `shopify-product-pull.service.ts` (`:314`, `:344`, `:439`)       |
| B3  | **doppia scrittura sul push**: `persistShopifyIds` scrive anche identità e periodo                                                     | `shopify-product-push.service.ts:960`                            |
| B4  | **chiusura in eliminazione**: `deleteVariantInTx` chiude il collegamento ed elimina definitivamente in locale, prima della riga        | `products.service.ts:1244`                                       |
| B5  | **interrogazione prima di creare**: assenza di un collegamento **non chiuso**, non della sola colonna-cache                            | `shopify-product-pull.service.ts`                                |
| B6  | **il rifiuto**: identità con `local_deleted_at` ⇒ non crea, non apre, **registra** e prosegue                                          | idem                                                             |
| B7  | **sedi**: tolti il collegamento automatico per nome **e la creazione automatica** (§15.3); coppia + periodo sul collegamento esplicito | `shopify-location-sync.service.ts:80`, `:294`                    |

#### ⚠️ B5-B6 · stato al 09/09/2026 — implementato, provato, e ciò che MANCA

> ⛔ **Non è «completato».** Tre cose diverse, e vanno tenute separate:

|                                              | stato                                                  |
| -------------------------------------------- | ------------------------------------------------------ |
| **il divieto** — non si crea, non si riapre  | ✅ implementato e provato sul servizio reale           |
| **la registrazione PERSISTENTE del rifiuto** | ⛔ **manca**: oggi il motivo va nel solo `logger.warn` |
| **i casi ancora da provare**                 | ⚠️ elencati sotto                                      |

##### ✅ Che cosa il divieto fa, e dove è provato

`divieto-ricreazione.integration-spec.ts`, 12 prove sul servizio di import reale:
prodotto eliminato non reimportato · ripetizione senza residui · lotto che prosegue ·
variante eliminata non ricreata mentre il resto si aggiorna · collegamento chiuso senza
doppione · **nessuna riapertura automatica** · articolo mai collegato · già importato ·
isolamento tenant · connessione non migrata · nessuna connessione.

⭐ **La guardia interroga lo storico, non la colonna-cache** (`docs/24` §8.5.4).

##### ⛔ La riapertura automatica era un secondo difetto, e non dipendeva dalla colonna-cache

Rilevato dal proprietario il 09/09/2026 e **riprodotto**: `B5a` azzerava
`shopify_product_id`, quindi provava solo il ramo di creazione. Con l'identificativo **ancora
presente**, l'import passa dal ramo di **aggiornamento** — dove la guardia di creazione non
arriva — e proseguiva fino allo storico, dove l'assenza di un periodo _attivo_ faceva aprire
un periodo **nuovo**: una ripresa automatica, che §8.5.2 riserva a un'azione esplicita
autorizzata.

⭐ **Corretto in un punto solo**: trovando periodi chiusi e nessuno attivo non si apre niente
e si dichiara `collegamento_chiuso`. Vale anche per la singola variante. Prove `B5a-bis` e
`B5a-ter`, entrambe falsificate.

##### ✅ La registrazione persistente — fatta il 09/09/2026, corretta lo stesso giorno sul mandato

> **`docs/DA-FARE` §10.3 esclude espressamente il solo log tecnico**: «di un'operazione resta
> una riga di `logger` sul container, che Railway perde al riavvio». Fino al 09/09 il motivo
> del rifiuto andava in `logger.warn` e basta.

⛔ **La prima stesura (mattina del 09/09) deviava dal mandato in tre punti**, rilevati dal
proprietario: la riga stava **dentro** la transazione dell'import e il commento prescriveva che
un rollback successivo la cancellasse; ogni riga aveva una correlazione **propria** invece di
quella dell'ingresso; e la copertura contava una riga in **tre** casi soltanto. Quella stesura è
stata sostituita; qui sotto c'è quella corretta, e le prove che la falsificano.

###### Il perimetro, com'è finito

| #   | Che cosa                                                                                                                                                                           | Fatto                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **tre valori di enum**: `import_prodotto_rifiutato`, `import_variante_rifiutata`, **`riaggancio_rifiutato`**                                                                       | ✅ i primi due sono i «due valori» del perimetro presentato; il terzo è il nome che **§10.3 elenca fin dall'inizio** fra le operazioni della prima tranche, ed è servito per i collegamenti chiusi con identificativi locali presenti (sotto) |
| 2   | **due migration scritte a mano**: `20260909030000_import_rifiutato`, `20260909080000_riaggancio_rifiutato` — `ALTER TYPE … ADD VALUE IF NOT EXISTS`                                | ✅ applicate al **solo** database di prova, `npm run prisma:deploy:test`                                                                                                                                                                      |
| 3   | **un metodo nel servizio esistente**: `PlatformAuditService.registraRifiuto(dati, detail, correlationId)`                                                                          | ✅ l'unico registro; scrive su una **connessione propria**                                                                                                                                                                                    |
| 4   | i punti d'uso in `ShopifyProductPullService`: guardia del prodotto (creazione), guardia della variante (aggiornamento), **`registraStorico`** per prodotto e variante (riaggancio) | ✅ attore `pull` dal lotto, `webhook` dalla consegna; il `logger.warn` resta accanto                                                                                                                                                          |

###### Le tre proprietà del mandato, e come si vedono

| Proprietà                                                         | Come                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Prova                                                                                                                                                                                                                                                                                                          | Falsificata                                                                                       |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **la traccia sopravvive a un rollback successivo dell'import**    | la riga si scrive su una connessione propria, **prima** del commit dell'import; un rollback dopo non la tocca. La riga dice che cosa è stato rifiutato e perché — **non** che l'import sia riuscito o fallito: nessuna `riuscita`/`fallita` accanto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `B6i`: variante rifiutata e registrata, poi lo storico cade → titolo invariato, variante non tornata, prodotto in `error` col motivo; **la riga resta, da sola**; la consegna ritentata riesce e lascia la sua riga con un'altra correlazione                                                                  | ✅ riga riportata dentro `tx` → `B6i` cade («expected [] to have a length of 1»), e con lei `B6j` |
| **se il registro non si scrive, l'import non commette e lo dice** | `registraRifiuto` non ingoia: l'eccezione risale dentro la transazione, prima del commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `B6j`: registro che lancia → l'import rifiuta con quel messaggio, niente committato, prodotto in `error` col motivo, registro vuoto; col registro tornato la stessa consegna riesce                                                                                                                            | ✅ errore ingoiato → `B6j` cade («promise resolved 'updated' instead of rejecting»)               |
| **la correlazione è quella dell'INGRESSO**                        | `Ingresso { attore, correlationId }` nasce in `executePullCatalog` (una per lotto) e in `importProductFromWebhook` (una per consegna) e scende a ogni riga. ⛔ Non è l'id di consegna Shopify: il controller non legge `X-Shopify-Webhook-Id`, e non lo si inventa — leggerlo vorrebbe dire cambiare controller, `ShopifyWebhookService` e `ShopifySyncService`, cioè un'altra implementazione. ⚠️ Conseguenza dichiarata: una **riconsegna** dello stesso webhook da parte di Shopify produce una seconda riga con un'altra correlazione. Distinguere «stesso evento riconsegnato» da «due eventi» è il mestiere dell'inbox `shopify_webhook_deliveries` (`docs/24` §8.5.3), decisa e non implementata: il registro conta decisioni, non consegne | `B6c`: due esclusi nello stesso lotto → due righe, **stessa** correlazione; `B6k`: due varianti rifiutate nella **stessa consegna** → due righe, stessa correlazione; `B6i`: due consegne → due correlazioni diverse; `S6`: prodotto e variante dello stesso giro condividono la correlazione, giri diversi no | — (asserita direttamente)                                                                         |

⚠️ **Costo dichiarato**: per la durata della scrittura l'import tiene **due** connessioni del
pool (la sua transazione e quella del registro). A pool esaurito la scrittura fallisce col
timeout del pool e l'import cade **visibilmente**, non in silenzio. E una consegna ripetuta
di Shopify che rifiuta di nuovo lascia una riga in più: due consegne, due rifiuti, due righe —
non è un doppione, è la storia.

⭐ **Una riga sola, `rifiutata`, senza `tentativo`**: la valutazione è conclusa e il suo esito È
la decisione. Un `tentativo` prima direbbe che qualcosa poteva andare storto, e qui niente
poteva: «tentativo senza esito» deve continuare a significare solo quello.

###### La copertura — tutti i rifiuti autorizzati, non tre

| Punto dell'import                                | Verdetto/esito dello storico | Situazione                                                                                                                                                              | `operation` · `detail`                                                    | Prova                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| guardia del prodotto (creazione)                 | `eliminato_definitivamente`  | anagrafica eliminata definitivamente                                                                                                                                    | `import_prodotto_rifiutato` · `eliminato_definitivamente: …`              | B6a (webhook) · B6c (lotto, `pull`) · S6                                                                                                                                                                                                            |
| guardia del prodotto                             | `gia_collegato`              | collegamento chiuso, anagrafica viva, cache azzerata                                                                                                                    | `import_prodotto_rifiutato` · `gia_collegato: …`                          | B5a                                                                                                                                                                                                                                                 |
| guardia del prodotto                             | `gia_collegato`              | periodo **attivo**, cache azzerata — il doppione canonico di B5                                                                                                         | `import_prodotto_rifiutato` · `gia_collegato: …`                          | B5f                                                                                                                                                                                                                                                 |
| guardia della variante                           | `eliminato_definitivamente`  | variante eliminata definitivamente                                                                                                                                      | `import_variante_rifiutata` · …                                           | B6d · B6k (due nella stessa consegna) · S6                                                                                                                                                                                                          |
| guardia della variante                           | `gia_collegato`              | periodo chiuso, variante viva, cache azzerata                                                                                                                           | `import_variante_rifiutata` · `gia_collegato: …`                          | B5a-quater                                                                                                                                                                                                                                          |
| guardia della variante                           | `gia_collegato`              | periodo **attivo**, cache azzerata                                                                                                                                      | `import_variante_rifiutata` · `gia_collegato: …`                          | B5f-bis                                                                                                                                                                                                                                             |
| guardia operativa → prodotto                     | `collegamento_chiuso`        | periodo chiuso, **cache presente**. ⛔ Fino al 09/09/2026 l'anagrafica si aggiornava lo stesso e a essere rifiutato era il solo riaggancio: con 26.7 l'import **salta** | `riaggancio_rifiutato` · `collegamento_chiuso: …`                         | B5a-bis · E1 · (push) E4                                                                                                                                                                                                                            |
| guardia operativa → prodotto                     | `identita_eliminata`         | anagrafica **ricomparsa** con la cache di un'identità eliminata (ripristino, §26.7)                                                                                     | `riaggancio_rifiutato` · `identita_eliminata: …`                          | B6f · E2                                                                                                                                                                                                                                            |
| guardia operativa → prodotto                     | `gid_di_un_altro`            | la cache punta al GID di un'altra anagrafica                                                                                                                            | `riaggancio_rifiutato` · `gid_di_un_altro: …`                             | B6h                                                                                                                                                                                                                                                 |
| guardia operativa → variante                     | `collegamento_chiuso`        | periodo chiuso, cache presente                                                                                                                                          | `riaggancio_rifiutato` · …                                                | B5a-ter · E3 · (push) E5 · E6                                                                                                                                                                                                                       |
| guardia operativa → variante                     | `identita_eliminata`         | variante ricomparsa con la cache (ripristino)                                                                                                                           | `riaggancio_rifiutato` · …                                                | B6g · S8                                                                                                                                                                                                                                            |
| guardia operativa → variante                     | `gid_di_un_altro`            | la cache punta al GID di un'altra variante (la legittima senza cache, un'altra riga dello stesso prodotto con la sua)                                                   | `riaggancio_rifiutato` · `gid_di_un_altro: …`                             | B6h-bis — ⚠️ qui c'era scritto «non costruibile»: era falso, e un revisore l'ha smentito. ⚠️ Il nome era `gid_di_un_altra` finché il rifiuto veniva dalla scrittura dello storico: la guardia di 26.7 parla una lingua sola per prodotti e varianti |
| ramo **senza negozio** (`negozioDelTenant` null) | —                            | connessione preesistente non migrata, o nessuna connessione                                                                                                             | **nessuna riga**: senza storico non c'è niente da rifiutare, per progetto | B5d · B5e · E10 (asseriscono il registro vuoto)                                                                                                                                                                                                     |
| **push** → anagrafica senza cache con una storia | `ha_storia`                  | il push avrebbe pubblicato da zero un articolo con identità chiusa o eliminata                                                                                          | `ripubblicazione_rifiutata` · `ha_storia: …`                              | E7 · S8                                                                                                                                                                                                                                             |

⭐ **`riaggancio_rifiutato` è un valore a sé, e la ragione è la verità della riga**: l'import
**non è stato rifiutato in blocco** — il prodotto esiste, la richiesta è stata elaborata — a
essere rifiutato è l'**uso di quel collegamento**. Una riga «import rifiutato» direbbe che non
è stato creato niente, che è un'altra cosa.

⛔ **Qui c'era «in questi casi l'import va a buon fine e aggiorna l'anagrafica (B5a-bis lo
consente)».** Non vale più dal 09/09/2026: con 26.7 l'aggiornamento **non passa** attraverso un
collegamento chiuso, e l'import risponde `skipped`. Il nome dell'operazione resta corretto per
la ragione qui sopra, ed è il motivo per cui non è stato cambiato. Per farlo,
`registraVariante` ora **restituisce** il proprio esito (prima i rami che non scrivevano
tornavano in silenzio) e in `registraProdotto`/`registraVariante` l'identità **eliminata** si
controlla **prima** della proprietà: un GID escluso non «appartiene» a nessuno, e il registro
deve dire il motivo giusto. Gli effetti non cambiano — in entrambi i rami non si scrive niente.

| La riga porta              |                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor`                    | `pull` o `webhook`, senza nome (CHECK «processo senza nome»)                                                                                                                          |
| `correlationId`            | quella dell'ingresso: il lotto, o la consegna                                                                                                                                         |
| `shopGid`                  | il `shop_gid` dello storico, letto dal negozio del tenant                                                                                                                             |
| `entityId` / `entityLabel` | import rifiutato: `null` + titolo remoto (l'articolo locale non esiste); variante rifiutata: il prodotto che la ospita; riaggancio: l'anagrafica locale trovata (prodotto o variante) |
| `remoteGid`                | `gid://shopify/Product/…` o `gid://shopify/ProductVariant/…`                                                                                                                          |
| `detail`                   | `<tipo del verdetto o dell'esito>: <motivo>`                                                                                                                                          |

⚠️ **Sui nomi**: la tabella di §10.3 elencava `creazione_rifiutata`; nell'enum è diventata
la coppia `import_prodotto_rifiutato` / `import_variante_rifiutata`, per coerenza con
`cestino_prodotto` / `cestino_variante` che già distinguono i due. `riaggancio_rifiutato` è
invece il nome di §10.3, tale e quale.

⚠️ **Che cosa NON fa**: non c'è una schermata che le mostri — il registro si legge dal
database.

⭐ **Il percorso PUSH è entrato il 09/09/2026, con 26.7.** Qui c'era scritto che restava fuori,
e che i suoi esiti finivano in un `logger.warn` o venivano scartati senza leggerli. Ora il push
riceve l'`Ingresso` (una correlazione per operazione, generata all'entrata) e il servizio del
registro come nono argomento, e scrive:

| Situazione sul push                                                                     | Operazione                  | Attore |
| --------------------------------------------------------------------------------------- | --------------------------- | ------ |
| il GID del **prodotto** in cache non è utilizzabile                                     | `riaggancio_rifiutato`      | `push` |
| il GID di una **variante** non è utilizzabile (in cache, o appena scelto fra le orfane) | `riaggancio_rifiutato`      | `push` |
| l'anagrafica **senza cache** ha già una storia su quel negozio                          | `ripubblicazione_rifiutata` | `push` |

⚠️ **`ripubblicazione_rifiutata` è un valore NUOVO**, con la sua migration
(`20260909110000_ripubblicazione_rifiutata`, applicata **solo** al database di prova). Non è
`riaggancio_rifiutato` e la differenza non è formale: lì un GID remoto c'era ed è stato
rifiutato, qui non c'è — e la riga non può portarlo. Confonderli renderebbe impossibile
distinguere «non ho aggiornato» da «non ho creato».

⚠️ Resta fuori il rifiuto per **SKU su link chiuso** di §8.5.4 nella forma che quel paragrafo
descrive: qui il candidato si scarta perché lo storico lo vieta, non perché lo SKU risolve a un
link chiuso in una ricerca dedicata.

###### ⛔ Il costo sul POOL — misurato il 09/09/2026, e CORRETTO lo stesso giorno

> **Con il limite del condiviso, cinque import che rifiutavano insieme si bloccavano a vicenda:
> la riga chiedeva una connessione che solo loro potevano liberare.** Il rimedio è sotto, e la
> misura qui è quella del difetto, conservata perché la prova non torni a essere indulgente.

Prova `registro-pool.integration-spec.ts`, sul solo database sacrificabile, con la
configurazione **di produzione**: `connection_limit=5`, `pool_timeout` al default (10 s),
`PRODUCT_IMPORT_TX` invariato. ⛔ Nessun limite e nessun timeout è stato alzato per farla
passare — sarebbe stato misurare un'altra configurazione.

| `P1` — cinque import, cinque rifiuti simultanei |                                                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| incrocio imposto e verificato                   | 5/5 al punto d'incontro, **5 sessioni `idle in transaction`**: il pool è pieno di transazioni                               |
| scritture di registro tentate                   | **5**                                                                                                                       |
| import riusciti                                 | **0** — tutti e cinque caduti                                                                                               |
| durata                                          | **10 074 ms ciascuno**: esattamente il `pool_timeout`                                                                       |
| motivo                                          | `Timed out fetching a new connection from the connection pool … (Current connection pool timeout: 10, connection limit: 5)` |
| righe di registro scritte                       | **0**                                                                                                                       |
| articoli ricreati                               | **0**: il divieto B5–B6 vale comunque                                                                                       |
| rilascio                                        | ✅ dopo la caduta il pool torna sano: il client risponde, nessuna sessione resta `active` o `idle in transaction`           |

⭐ **`P2` è il controllo che rende `P1` leggibile**: **quattro** import con lo stesso pool, gli
stessi timeout e la stessa meccanica — una connessione resta libera — completano tutti
(`skipped`) e scrivono **4** righe. A far cadere `P1` è quindi il pool, non altro.

⚠️ **L'attesa è nel CLIENT, non nel database**: durante il blocco `pg_stat_activity` mostra
cinque sessioni ferme e **nessuna** in attesa di lock. Il database non sa niente; a contendersi
le connessioni è il pool di Prisma.

⚠️ **Perché cinque bastano**: i webhook di prodotto si elaborano in linea e in concorrenza
(`ShopifyWebhooksController` → `handleWebhook` → `importProductFromWebhook`), senza la mappa
in-flight che protegge `pullCatalog`. Cinque consegne che rifiutano nello stesso momento sono
un picco ordinario, non un caso di laboratorio.

###### ✅ Il rimedio — IMPLEMENTATO e provato il 09/09/2026, nel perimetro autorizzato

> **Una connessione RISERVATA al registro, fuori dal pool dell'applicazione, per le sole
> scritture autonome.**

`PlatformAuditPrismaClient`: un `PrismaClient` con `connection_limit=1` sulla **stessa URL**
dell'applicazione — host, database, credenziali, `pgbouncer` e ogni altro parametro invariati,
cambia solo il limite. È un provider di `PlatformAuditModule`, che è globale: **uno solo per
istanza**, mai uno per richiesta. ⛔ Non è esportato: nessuno può iniettarlo per scriverci
altro. ⛔ E non è un secondo registro né un secondo database: stessa tabella, stesso database.

⭐ **Il perimetro è per USO, non per servizio** — i nove punti del servizio, classificati:

| Punto                                                                             | Uso                                                                                                                 | Client                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `registraTentativo` · `registraRifiuto` · la scrittura di `registraEsitoNegativo` | **scritture autonome**: stanno fuori dalla transazione dell'operazione, ed è ciò che le fa sopravvivere al rollback | **riservato**              |
| `conRegistro` (la transazione di **cestino** e **cancellazione azienda**)         | transazione operativa                                                                                               | **applicativo, invariato** |
| `registraRiuscita` · `registraIninfluente` · `identificaTransazione`              | dentro `tx` dell'operazione                                                                                         | **`tx`, invariato**        |
| il conteggio degli esiti e `pg_xact_status` in `registraEsitoNegativo`            | letture che decidono, a transazione già conclusa                                                                    | **applicativo, invariato** |

⛔ **Non si è sostituito il client applicativo**, ed è la richiesta esplicita del proprietario:
spostare `conRegistro` sulla connessione riservata metterebbe cestino e cancellazione azienda su
**una sola** connessione, serializzandole tutte. Si è spostato solo ciò che rubava una
connessione a sé stesso.

| Prova                                                            | Prima (difetto)                                     | Dopo (rimedio)                                                                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P1` — cinque import, cinque rifiuti simultanei                  | 0 completati, 5 cadute a **10 074 ms**, **0 righe** | **5 `skipped`**, 0 cadute, **5 righe**, 0 ricreazioni, **nessun timeout**; totale **56 ms**                                                                       |
| attese delle scritture, serializzate sulla connessione riservata | —                                                   | tre esecuzioni: **13·14·15·15·16**, **10·11·11·12·13**, **9·9·10·10·11 ms** — ⚠️ misurate a ogni giro, non dichiarate a priori, e variabili fra un giro e l'altro |
| `P2` — quattro import (controllo)                                | 4 `skipped`, 4 righe                                | invariato                                                                                                                                                         |
| rilascio                                                         | ✅                                                  | ✅ entrambi i client rispondono, nessuna sessione `active` o `idle in transaction`                                                                                |

⭐ **`P1` non accetta più successi e fallimenti indifferentemente**: pretende cinque `skipped`,
cinque righe coi cinque GID, nessuna ricreazione e **nessuna caduta**. ⭐ **Falsificata**:
rimettendo le scritture sul pool condiviso torna rossa, con le cinque attese a 10 020–10 025 ms
e zero righe.

⭐ **Le garanzie di prima reggono**, verificate insieme: `B6i` (la traccia sopravvive al
rollback), `B6j` (registro guasto → l'import non commette e lo dice), e le **66 prove** di
cestino, concorrenza del cestino e cancellazione tenant, con le loro transazioni, opzioni
(`Serializable`, `timeout` 300 s) e garanzie invariate.

| Costo, dichiarato                                                          |                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **+1 connessione per istanza** dell'API verso il pooler                    | va contata nel dimensionamento (§8.9.2), come le altre                                                                                                                                                                                                                                                                                                              |
| le scritture del registro si **serializzano**                              | misurate a 13–16 ms con cinque in fila. ⛔ **Non è una certificazione di capacità illimitata**: il rimedio toglie l'esaurimento reciproco riprodotto, non garantisce che nessuna attesa possa mai crescere. Con molte più scritture simultanee la fila si allunga, e il numero di connessioni riservate è un parametro da rimisurare, non una proprietà della forma |
| le due **letture** di `registraEsitoNegativo` restano sul pool applicativo | limite dichiarato: a pool esaurito possono fallire, e allora l'esito non si scrive e resta il tentativo senza esito (lo dice `taci`)                                                                                                                                                                                                                                |

⛔ **Due strade scartate, e perché non vanno riprese senza deciderlo:**

| Scartata                                        | Perché                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **alzare `connection_limit` / `pool_timeout`**  | sposta la soglia, non toglie la competizione: con N import concorrenti serve N+1, e il numero giusto non esiste                                                                               |
| **scrivere la riga DOPO il commit dell'import** | toglierebbe la competizione, ma perde «nessun effetto senza traccia»: se quella scrittura fallisce, l'import è già avvenuto e il rifiuto diventa invisibile — esattamente ciò che §10.3 vieta |

##### ⚠️ Casi ancora DA PROVARE

|                                                 |                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| il rifiuto sul percorso **push**                | `persistShopifyIds` collega per SKU: `docs/24` §8.5.4 chiede che **rifiuti** se lo SKU risolve a un id remoto con link chiuso. Non implementato, non provato |
| `shopify-variant-match.util.ts`                 | stesso rifiuto, stesso motivo: non toccato                                                                                                                   |
| il rifiuto in **`pullCatalog` su lotti grandi** | provato con due articoli; il comportamento su un lotto reale non è misurato                                                                                  |
| la **registrazione** del rifiuto                | ✅ provata il 09/09/2026 — B6a, B6c, B6d e campagna M S6 (vedi «La registrazione persistente»)                                                               |

##### ✅ Concorrenza — verificata il 09/09/2026 con richieste davvero sovrapposte, e CORRETTA lo stesso giorno

⛔ **Stare nella stessa transazione non rende sicura una guardia**: il database di prova è a
**Read Committed** (letto dal server), e fra controllo e scrittura un'altra transazione può
intervenire anche così. Quello che protegge, se qualcosa protegge, è un vincolo o un lock: ed è
stato cercato, nominato, e — dove mancava — messo.

| percorso                               | esito                              | protezione identificata                                                                                                                                                                                                                                                                                                                                   | prova                          |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **prodotto nuovo**                     | ✅ sicuro dal 09/09                | l'advisory lock di `importProduct` su `(tenant, shopify_product_id)`, preso **prima** di leggere `existing`: chi arriva secondo aspetta, rilegge, trova l'articolo e **aggiorna** col proprio payload. Prima non c'era niente: la sola barriera era l'unicità `(tenant_id, sku)`, accidentale, e con uno SKU rinominato nasceva un doppione senza storico | `C1`, `C2` — falsificate       |
| **variante nuova**, prodotto esistente | ✅ sicuro, e ora **senza perdite** | lo stesso lock. Prima era la riga del prodotto (`UPDATE` come prima istruzione): evitava il doppione ma arrivava DOPO la lettura della mappa varianti, e il secondo evento veniva saltato con tutto quello che portava                                                                                                                                    | `C3`, `C4`, `C5` — falsificate |

⚠️ `gia_collegato → skipped` **non era il rimedio giusto** (precisazione del proprietario):
avrebbe evitato il doppione perdendo l'aggiornamento. Il metro è la **consegna in sequenza**:
due webhook sovrapposti lasciano lo stesso stato che avrebbero lasciato uno dopo l'altro.
Dettaglio, prove, falsificazioni e limiti in **§25**.

⛔ **B4 non è separabile da B2 e B3.** Chi scrive un'identità si prende il dovere di
chiuderne il collegamento: separati, la tranche toglierebbe un'eliminazione che oggi funziona.

⛔ **Il rifiuto NON ferma il lotto.** Un import che si interrompe al primo articolo escluso è
peggio del difetto: si salta, si registra, si prosegue.

#### Le dipendenze, in ordine

```text
A1…A6 ✅  ──▶  B1 (shop_gid)  ──▶  B2 B3 B4  ──▶  B5 B6 B7
                                    │
                                    └── e SOLO dopo, in una tranche sua: backfill (fase 3)
```

⚠️ **B1 non è opzionale**: `shopify_product_identities.shop_id` è `NOT NULL` con FK a
`shopify_shops`. Senza una riga negozio **non si può scrivere nessuna identità**. E il
divieto ha grana per negozio: senza sapere quale negozio, «GID già visto» non è una domanda
ben posta.

#### ⏸ Capacità di sincronizzazione — quattro requisiti confermati il 09/09/2026

> **La formulazione canonica è in `docs/24` §8.9. Qui non si ripete: si rimanda.**

Completezza del primo allineamento (§8.9.1), margine da **misurare** e non stimare (§8.9.2),
precedenza di disponibilità e prezzi sotto carico (§8.9.3), nessuna perdita silenziosa
(§8.9.4). Gli scenari e le quattro misure da raccogliere stanno in
`docs/PIANO-COLLAUDO-SHOPIFY.md`, scenario **L**.

⛔ **Non sono lavoro autorizzato, e non entrano nella sequenza A→B qui sopra.** Soglie,
politica delle priorità e soluzione tecnica restano da scegliere; outbox, worker e Bulk
Operations sono **opzioni da valutare**, non implementazioni approvate.

#### ⛔ Sviluppo e collaudo locale NON sono il rilascio al condiviso

> **La fase A e la fase B si scrivono, si provano e si chiudono interamente sul database
> di prova locale. L'applicazione al condiviso è un passo SEPARATO, con un'autorizzazione
> sua.**

| Ambiente                        | Che cosa ci si fa                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `localhost:5433/vestiflow_test` | tutto: migration da vuoto e da copia con dati, suite, falsificazioni, concorrenza, rollback a metà  |
| copia locale con dati veri      | le prove che dipendono dal volume e dai casi reali                                                  |
| ⛔ **condiviso**                | ⛔ **niente**, finché non c'è un'autorizzazione esplicita e la verifica dei residui in sola lettura |

⚠️ **La migration del 07/09 non è mai stata applicata al condiviso in questa forma**, e una
versione precedente ci era finita per errore. Prima di qualunque applicazione va verificato,
**in sola lettura**, che non restino enum, tabelle o indici di quella versione — e se ci sono,
la rimozione è un passo dichiarato e autorizzato a parte, non una `IF NOT EXISTS` aggiunta
alla migration.

#### I test

⚠️ **Nessuno è un test unitario con mock**: la regola vive in un database, e un mock direbbe
quello che gli si è insegnato.

**Fase A** — integrazione, tabelle popolate da fixture:

| Prova                                                         | Esito atteso                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| export v5 di un tenant con identità e periodi                 | il pacchetto li contiene, con i conteggi nel manifest             |
| import di un archivio **v4** (senza le chiavi nuove)          | ✅ accettato; le chiavi nuove valgono `[]`                        |
| import di un archivio **v3**                                  | ✅ ancora accettato: il minimo non si alza                        |
| ripristino di un articolo **collegato**, presente nel backup  | ✅ riesce: FK differita, riga reinserita con lo stesso `id`       |
| ripristino di un articolo con **tutti i periodi chiusi**      | ✅ riesce — è il caso che la stesura precedente sbagliava         |
| **sede** con coppia storica e nessun periodo attivo           | ✅ riesce                                                         |
| articolo **collegato ma assente** dal backup                  | ⛔ rifiutato dal pre-controllo, che lo **nomina**                 |
| lo stesso, con il pre-controllo disattivato                   | ⛔ rifiutato **al commit** dalla FK differita: niente a metà      |
| **recupero su database vuoto**, identità ancora agganciate    | ⭐ si reinseriscono: nulla esiste, tutto è assente                |
| **recupero su database vuoto**, identità già **eliminate**    | ⭐ col permesso di riga; ⛔ senza, `nasce_agganciata` le rifiuta  |
| lo stesso, permesso su un **altro** tenant                    | ⛔ rifiutato                                                      |
| lo stesso, **dopo** il commit                                 | ⛔ rifiutato: il permesso è finito con la transazione             |
| il GID di un'identità recuperata                              | ⭐ resta **escluso**: la seconda identità è rifiutata             |
| riga col medesimo `id` ma **GID diverso**                     | ⛔ incongruenza nominata, ripristino rifiutato                    |
| riga col medesimo `id` ma **appartenenza originaria diversa** | ⛔ incongruenza                                                   |
| riga locale con `local_deleted_at` scritto **dopo** il backup | ⭐ **non sovrascritta**                                           |
| **conflitto di GID** fra pacchetto e database                 | ⛔ rifiutato dal pre-controllo, che nomina i GID                  |
| ripristino con un collegamento **attivo**                     | ✅ riesce, come sopra: non è più un caso speciale                 |
| ripristino con soli collegamenti **chiusi**                   | ✅ riesce, e **lo storico è ancora lì dopo**: non è stato purgato |
| esclusione registrata **dopo** la data del backup             | ⭐ **sopravvive**: la riga esiste, e per assenza non si tocca     |
| cancellazione tenant A con storico di A **e di B**            | A sparisce, **lo storico di B è intatto**                         |
| cancellazione tenant senza il permesso di riga                | ⛔ rifiutata dal trigger                                          |
| permesso di riga impostato sul tenant **sbagliato**           | ⛔ rifiutata: il confronto è con `OLD.tenant_id`                  |
| dopo il commit e dopo un rollback                             | il permesso **non è più attivo**                                  |
| cancellazione tenant interrotta a metà                        | ⭐ resta la riga **tentativo**, senza esito: e si vede            |
| dopo la cancellazione del tenant                              | ⭐ la traccia **esiste ancora**: tentativo + il suo unico esito   |
| rifiuto registrato                                            | la riga di registro **esiste** anche se la transazione è fallita  |
| cancellazione tenant riuscita                                 | ⭐ tenant sparito **e** riga «riuscita»: commettono insieme       |
| interruzione fra tentativo e cancellazione                    | ⭐ «non completata, causa non registrata» — ⛔ mai «fallita»      |
| la scrittura della **riuscita** fallisce                      | ⭐ rotola indietro tutto: il tenant sopravvive                    |
| il client crede di aver fallito, ma aveva commesso            | ⛔ il «fallimento» **non si scrive**                              |
| la scrittura del **tentativo** fallisce                       | ⛔ la cancellazione non parte                                     |

**Fase B** — integrazione:

| Prova                                                 | Esito atteso                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| GID mai visto                                         | crea, **e scrive identità + periodo**                                  |
| GID con identità viva e periodo attivo                | aggiorna, **non** apre un secondo periodo                              |
| GID con identità viva e periodo **chiuso**            | ⛔ non riapre da solo                                                  |
| GID con identità **eliminata**                        | ⛔ non crea, non apre, **registra**, prosegue col resto                |
| lo stesso da **webhook** invece che dal pull          | stesso esito: la porta non cambia la regola                            |
| **push** di un prodotto nuovo                         | scrive identità e periodo per il prodotto e le varianti abbinate       |
| push con una variante **senza SKU**                   | identità del prodotto sì, di quella variante no — e non è un errore    |
| variante tolta dal form, prodotto collegato           | ⭐ **riesce**: collegamento chiuso, poi eliminazione definitiva locale |
| sede senza `shopifyLocationId` con lo **stesso nome** | ⛔ **non collegata**, né la prima volta né dopo una chiusura           |
| lo stesso GID su **due negozi**                       | due identità distinte, nessuna interferenza                            |

**Concorrenza**, con la forma già collaudata (due connessioni, incastro dichiarato letto da
`pg_stat_activity`): due webhook per lo stesso GID in parallelo ⇒ **una** identità, **un**
periodo, la seconda transazione rifiutata dall'`UNIQUE`.

**Falsificazioni obbligatorie**, sul solo database sacrificabile:

- tolta l'interrogazione ⇒ le prove del rifiuto devono **cadere**;
- tolta la doppia scrittura ⇒ «scrive identità + periodo» deve **cadere**;
- tolta la chiusura del collegamento da `deleteVariantInTx` ⇒ l'eliminazione della variante deve **fallire**;
- rimesse le quattro FK a `RESTRICT` ⇒ le prove del ripristino devono **cadere**;
- differite con `ALL` invece che per nome ⇒ deve cadere la prova che uno storico incoerente è rifiutato **subito**;
- tolta la condizione `local_deleted_at IS NOT NULL` dal permesso di ripristino ⇒ deve cadere la prova che un'identità **semplicemente sganciata** non può nascere;
- spostata la scrittura della «riuscita» FUORI dalla transazione di cancellazione ⇒ deve comparire il caso «tenant sparito, registro col solo tentativo»;
- tolto il confronto con `OLD.tenant_id` ⇒ la prova del tenant sbagliato deve **cadere**;
- tolto il trigger `…_immutabile` ⇒ la guardia estesa deve **arrossare**.

⛔ **Una falsificazione che non fa cadere niente non prova che il codice è buono: prova che il
test è cieco.** È già successo due volte in questa tranche, una delle quali perché un backtick
aveva troncato la stringa da sostituire e la sostituzione non era mai avvenuta.

**Guardie statiche**: `check:storico-non-cancellabile` esteso; una guardia che impedisca a un
percorso di scrivere `shopifyProductId` **senza** scrivere l'identità nella stessa transazione;
una guardia append-only sul registro, sul modello di `check:cassa-append-only`.

#### Che cosa questa tranche NON garantisce

⛔ **Gli articoli collegati PRIMA restano scoperti** finché non c'è il backfill: le loro
identità non esistono, quindi per loro «GID già visto» continua a rispondere no. Il divieto è
vero **da qui in avanti**, non retroattivo.

⛔ **Il modello non diventa fonte canonica**: §8.5.8 chiede backfill verificato **e** lettori
migrati, e questa tranche non soddisfa nessuna delle due.

⛔ **Il registro resta MINIMO**: le nove voci di §7.4 non sono coperte tutte, e il backup
pre-operazione (§0-bis voce 6) resta fuori.

---

### ⏸ 14 · Intervento di sicurezza SEPARATO — gli script di backfill

> ⛔ **Non si esegue niente adesso.** Questa voce esiste per dichiarare un rischio misurato,
> non per correggerlo di passaggio dentro un'altra tranche.

⚠️ **Misurato l'08/09/2026.** Due script accodati a `package.json` puntano al database
**condiviso** senza dichiarare il bersaglio:

| Script                                             | Comando                                          | Client                        | Bersaglio                     |
| -------------------------------------------------- | ------------------------------------------------ | ----------------------------- | ----------------------------- |
| `api/scripts/backfill-catalog-origin.mjs`          | `npm run backfill:catalog-origin:apply`          | `new PrismaClient()` **nudo** | `DATABASE_URL` = il condiviso |
| `api/scripts/backfill-shopify-order-documents.mjs` | `npm run backfill:shopify-order-documents:apply` | idem                          | idem                          |

⭐ **Non sono privi di rete**: entrambi sono **dry-run per default** e scrivono solo con
`--apply`, e il primo accetta `--tenant=`. È una protezione vera, e va detto invece di
descriverli come sguarniti.

⛔ **Ma il bersaglio non è dichiarato in nessun punto.** Chi lancia `…:apply` non vede da
nessuna parte **su quale database** sta per scrivere: lo decide una variabile d'ambiente che
non compare nel comando. È la stessa forma del difetto già corretto in `conStoricoSbloccato`
— un controllo che non guarda il bersaglio reale — un piano più in su, e su un database che
non è sacrificabile.

⚠️ **`backfill-catalog-origin` scrive `catalogOrigin` e `shopifyCatalogLinkKind` con
un'euristica** — tolleranza di 15 secondi fra `shopifyLastSyncAt` e `createdAt`, presenza di
immagini locali. Un'euristica applicata al bersaglio sbagliato riscrive l'origine del catalogo
di un tenant che non c'entra, e `catalogOrigin` governa se un'eliminazione è consentita
(`assertShopifyCatalogDeleteAllowed`).

##### Che cosa serve PRIMA di una qualunque applicazione

1. **bersaglio esplicito e dichiarato**, sul modello di `scripts/backup/backup-url.mjs`:
   `--database-url` / `--env-file` / una variabile dedicata — mai il ripiego muto su
   `DATABASE_URL`;
2. **conferma quando il bersaglio non è locale**, sul modello di `api/scripts/bersaglio.mjs`
   (che `delete-tenant.mjs` già usa);
3. **il bersaglio stampato prima di scrivere** — nome del database e classe dell'host, mai
   credenziali;
4. `--tenant=` **obbligatorio** in applicazione, o almeno un conteggio per tenant nel
   riepilogo del dry-run: un backfill che tocca tutti i tenant insieme non è verificabile;
5. **una riga di registro** di ciò che ha scritto, con la stessa forma di §10.3.

⛔ **E l'applicazione resta un atto autorizzato a parte**, con il dry-run riletto da una
persona. Non entra nella tranche §13: è un intervento di sicurezza su codice esistente, e
mescolarlo a un lavoro di modello renderebbe illeggibili entrambi.

---

### ✅ 15 · Le sei domande — chiuse dal proprietario l'08/09/2026

⛔ **Non erano sei decisioni nuove**, ed era un mio errore di classificazione: quattro erano
già decise o già risolvibili, e la prima era un **problema tecnico**, non una scelta.

| #   | Era presentata come            | In realtà                                                             |
| --- | ------------------------------ | --------------------------------------------------------------------- |
| 1   | scelta A o B sul ripristino    | ⭐ **problema tecnico**, ora risolto in §10.1: nessuna scelta serviva |
| 2   | «cosa fa `disconnect()`»       | ✅ **decisa**: la disconnessione non è un cambio negozio              |
| 3   | «il sync può creare una sede?» | ✅ **già decisa in §1.13.1**, e non l'avevo riconosciuta              |
| 4   | permesso di ripresa            | ✅ **decisa**: permesso di gestione dei collegamenti                  |
| 5   | GID diverso                    | ✅ **già prevista in §11.9**, più una correzione di vocabolario       |
| 6   | uno o due registri             | ✅ **decisa**: uno solo (§10.3)                                       |

#### 15.1 · Ripristino — non era una scelta

⛔ **Né A né B**, ed entrambe erano sbagliate: chiudere i periodi non toglie le FK delle
identità vive e delle coppie, quindi «zero collegamenti attivi» non garantiva niente
(misurato, §10.1). La soluzione è **differire il controllo**, non sciogliere il collegamento.

✅ **La scelta d’interfaccia è chiusa** (§16, 08/09/2026): davanti al rifiuto l’operatore vede
**soltanto l’elenco** delle incompatibilità. ⛔ Nessun comando nuovo di scollegamento, e in
nessun caso il ripristino chiude o cancella qualcosa da sé.

#### 15.2 · Disconnessione — ✅ DECISA

> **La normale disconnessione interrompe la sincronizzazione. Non equivale a un cambio
> negozio: conserva coppie e collegamenti per la riconnessione allo STESSO negozio.**

|     |                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------ |
| ⛔  | **`shop_change` non si usa quando il negozio non è cambiato**: la causale racconterebbe un fatto falso |
| ✅  | coppie e periodi **restano**, ed è ciò che rende la riconnessione una ripresa e non una ricostruzione  |
| ⛔  | **un periodo attivo NON autorizza a sincronizzare** mentre la connessione è disattiva                  |

⭐ **Il cancello della sincronizzazione è lo stato della CONNESSIONE, non quello del
collegamento.** I due rispondono a domande diverse — «questo negozio è raggiungibile adesso?»
e «questa sede è abbinata a quella location?» — e confonderli farebbe ripartire il traffico
verso un negozio da cui ci si è disconnessi.

⚠️ **Il cambio negozio resta il caso distinto già deciso** (§8.5.1): lì i collegamenti si
chiudono davvero, con `shop_change`, perché il negozio è un altro.

#### 15.3 · Creazione delle sedi — ✅ GIÀ DECISA in §1.13.1

⛔ **Non era una domanda aperta, e averla posta è un mio errore**: §1.13.1 decide già che per
ogni location non collegata l'utente sceglie fra **collegare**, **creare** o **lasciarla
soltanto su Shopify**. Una sede nuova nasce da quella scelta, non dalla sincronizzazione.

> **Nessuna sede creata automaticamente dalla sincronizzazione.** ⚠️ Oggi il sync post-OAuth
> ne crea (`shopify-location-sync.service.ts:80`): è un difetto rispetto a §1.13.1, non una
> lacuna di specifica.

⏸ **Il wizard di prima configurazione non si implementa ora**: la decisione qui è che la
creazione automatica **si toglie**, non che l'interfaccia che la sostituisce si scriva adesso.

#### 15.4 · Permesso di ripresa — ✅ DECISA

> **Un permesso di GESTIONE DEI COLLEGAMENTI nel sistema permessi esistente, con default
> titolare/amministratore.**

|     |                                                                                             |
| --- | ------------------------------------------------------------------------------------------- |
| ⛔  | **non si lega automaticamente al permesso di eliminazione**: sono due capacità diverse      |
| ⛔  | **non si codificano i ruoli nel servizio** — è la prescrizione di §7.4, e vale identica qui |
| ✅  | default titolare/amministratore, configurabile col sistema permessi esistente               |

#### 15.5 · GID diverso — ✅ GIÀ PREVISTA, e una parola da correggere

> **Per un articolo ANCORA ESISTENTE, la pubblicazione esplicita che produce un nuovo GID è
> già prevista** (§11.9, §7.5): conserva la vecchia identità e ne crea una nuova.

⛔ **Non è un'autorizzazione a due cose diverse**, e vanno dette entrambe:

- **non** autorizza ad abbinare arbitrariamente un prodotto remoto **già esistente** a un
  articolo locale: l'identità nasce da un'operazione, non da una somiglianza (§1.13.1 dice la
  stessa cosa per le sedi, e §8.5.4 per gli articoli);
- **non** autorizza a riesumare un'identità **eliminata definitivamente**: quella resta con
  `local_deleted_at`, e i trigger la tengono ferma.

##### ⛔ La parola «sganciato» significava due cose, e va corretta

⚠️ **È l'ambiguità che ha reso plausibile la domanda 5.** Nel testo dell'08/09 «sganciare»
indicava sia la chiusura di un collegamento sia l'eliminazione definitiva dell'identità — che
sono l'una reversibile e l'altra no.

| Da qui in avanti si dice…               | Che cosa significa                                                             | Reversibile?                                 |
| --------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| **chiudere il collegamento**            | il periodo finisce. L'identità resta **viva**, `product_id` valorizzato        | ✅ sì: si apre un periodo nuovo — la ripresa |
| **eliminare definitivamente in locale** | `product_id → NULL` e `local_deleted_at` scritto: l'anagrafica locale sparisce | ⛔ **no**: il GID resta escluso per sempre   |

⛔ **«Sganciare» non si usa più da solo.** Dove serve nominare la seconda operazione si scrive
**«sganciare definitivamente»**, e il testo di §11 e §13 è stato allineato: `deleteVariantInTx`
**chiude il collegamento** e poi elimina definitivamente in locale — due cose, nell'ordine.

#### 15.6 · Registro — ✅ DECISA: uno solo

Vedi §10.3. ⭐ Un unico registro definitivo, che nasce con il sottoinsieme minimo; la scelta
concreta della tabella è motivata lì rispetto ai cinque modelli esistenti.

---

### ⏸ 16 · Che cosa resta APERTO davvero

| #   | Domanda                                | Chi la chiude                                                                                                    |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | ~~Davanti al rifiuto del ripristino~~  | ✅ **deciso**: per ora **solo un elenco chiaro** delle incompatibilità. ⛔ Nessun comando nuovo di scollegamento |
| 2   | ~~Nome della tabella del registro~~    | ✅ **scelto**: `PlatformAuditLog` / `platform_audit_logs` (§10.3)                                                |
| 3   | ~~Il dump completo come prerequisito~~ | ✅ **deciso**: **no, non ora**. Resta distinto dalla copia preventiva del singolo tenant                         |

✅ **E una quarta, aperta e chiusa l'08/09/2026**: il cestino si attiva sui soli articoli
**esclusivamente locali**; per i collegati aspetta il ritiro dalla vendita. È una limitazione
temporanea del rilascio, non una regola nuova (§17).

#### ⭐ Le tre erano scelte, e sono state fatte l'08/09/2026

**1 · Solo l'elenco.** Davanti a un ripristino rifiutato l'operatore vede **che cosa** lo
blocca — articoli e sedi, per nome — e nient'altro. ⛔ Non si aggiunge un comando di
scollegamento: sarebbe un'azione irreversibile offerta nel momento peggiore, cioè dentro un
ripristino d'emergenza. Chi deve scollegare lo farà dai percorsi ordinari, quando esisteranno.

**2 · `PlatformAuditLog`** — motivato in §10.3 rispetto ai cinque modelli esistenti.

**3 · Il dump completo NON diventa un prerequisito automatico**, e le due cose restano
distinte:

|                                                  |                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **dump amministrativo completo** (`backup:full`) | `pg_dump` dell'intero database, tutti i tenant. È la rete dell'amministratore, non un passo di un flusso applicativo            |
| **copia preventiva del singolo tenant**          | il pacchetto del tenant che si sta per toccare: appartiene all'operazione, ed è la cosa che un giorno potrà diventarne un passo |

⛔ **Legarli adesso sarebbe sbagliato due volte**: renderebbe un'operazione di tenant
dipendente da una procedura di piattaforma, e farebbe credere che un `pg_dump` riuscito dica
qualcosa sul singolo tenant — che non dice, perché non è verificato per tenant.

---

### ⚠️ 17 · Il cestino di prodotti e varianti — comandi SCRITTI e RAGGIUNGIBILI, da non distribuire

> ⚠️ **Testata corretta l'08/09/2026, a lavoro fatto.** Qui c'era «⛔ Proposta circoscritta,
> non autorizzata. **Non implementata**», e la tabella sotto diceva che nessun percorso
> scrive `deletedAt`. Vero fino al perimetro, **falso dopo**: i quattro comandi esistono.
> Lasciare la vecchia formula e aggiungere in fondo un paragrafo aggiornato avrebbe prodotto
> una sezione che si contraddice a metà.

#### Stato reale, riga per riga

| Pezzo                                                                                                                 | Stato                                                           |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| colonne `deletedAt`, `deletedById`, `deletionReason` su **prodotto e variante**, più `@@index([tenantId, deletedAt])` | ✅ implementato — preesistente                                  |
| predicati del ciclo di vita in `product-lifecycle.util.ts`                                                            | ✅ implementato — preesistente                                  |
| filtro dell'elenco API: `trash=1` → cestino, altrimenti esclusione                                                    | ✅ implementato — preesistente                                  |
| vista Cestino nel frontend, rotta `/app/products/trash`                                                               | ✅ implementato — preesistente, e **in sola lettura**           |
| permesso `catalog.delete`                                                                                             | ✅ implementato — preesistente                                  |
| **chi SCRIVE `deletedAt`** — i due comandi «sposta nel cestino»                                                       | ⭐ ✅ **implementato l'08/09/2026**                             |
| **ripristino** — prodotto e variante                                                                                  | ⭐ ✅ **implementato l'08/09/2026**                             |
| regola «solo articoli locali» (`product-trash.util.ts`)                                                               | ⭐ ✅ **implementato l'08/09/2026**                             |
| `DELETE /products/:id`                                                                                                | ✅ invariato: resta la **cancellazione fisica**, non il cestino |
| **collegamento dell'interfaccia** ai quattro comandi                                                                  | ⛔ **non fatto**                                                |
| **registro** `PlatformAuditLog`                                                                                       | ⛔ **non fatto** — è la dipendenza dell'attivazione             |

⛔ **«Non implementato» non vale più per questa sezione**, e non va riscritto altrove. ⚠️ Il
testo che lo diceva è stato **rimosso**, non lasciato in piedi: se ricompare, è una regressione.

#### I comandi — quattro, e nessuno nuovo nel vocabolario

| Comando                           | Che cosa fa                                                                                                                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sposta nel cestino** (prodotto) | scrive `deletedAt`, `deletedById`, `deletionReason`                                                                                                                                                                                                                        |
| **Sposta nel cestino** (variante) | le stesse tre colonne, sulla variante                                                                                                                                                                                                                                      |
| **Ripristina** (prodotto)         | azzera le tre colonne **e scrive `status: archived`** — quattro campi: il prodotto torna Non attivo (§1.8)                                                                                                                                                                 |
| **Ripristina** (variante)         | azzera le tre colonne **e scrive `lifecycleStatus: inactive`**. ⚠️ §1.8 dice anche «Non pubblicata»: **non esiste una colonna locale di pubblicazione**, e il ripristino non fa nulla verso il canale — nel perimetro dei soli articoli locali quella parte non ha effetto |
| **Elimina definitivamente**       | resta ciò che è oggi: distinta, esplicita, autorizzata, con doppio avviso                                                                                                                                                                                                  |

⭐ **`DELETE /products/:id` non cambia mestiere**: resta l'eliminazione definitiva, con
`catalog.delete`. Il cestino sono rotte nuove, così il comando irreversibile non cambia
significato sotto i piedi di chi lo chiama già.

⚠️ **Un prodotto nel cestino NASCONDE le sue varianti senza riscriverne lo stato**, e al
ripristino le varianti conservano quello di prima (§1.8). Le tre colonne del cestino non si
propagano dal prodotto alle varianti.

#### I criteri, che non sono nuovi

| Criterio                                                                                          | Dove è già deciso |
| ------------------------------------------------------------------------------------------------- | ----------------- |
| documenti, movimenti, giacenze, impegni, lotti, matricole e collegamenti restano **invariati**    | §1.1              |
| **nessun movimento automatico**, né entrando né uscendo dal cestino                               | §1.1, §1.3        |
| sparizione dall'anagrafica ordinaria e **dalle nuove selezioni**                                  | §1.1, §3.4        |
| ripristino **senza duplicazioni**: si azzerano le colonne della riga esistente, non si crea nulla | §7.5              |
| il ripristino **non tocca** movimenti e documenti, e non rimette in vendita                       | §7.5, §1.8        |
| l'eliminazione definitiva resta **distinta ed esplicita**, con doppio avviso                      | §1.1, §1.4        |
| gli identificativi di un elemento senza storia **restano riservati** nel cestino                  | §4.3, §7.4        |

⛔ **Nessuno di questi va deciso di nuovo**: sono decisioni confermate, e il perimetro le
esegue.

#### Il comportamento Shopify — e qui c'è il limite vero

§1.8 decide che «spostare nel cestino toglie dalla vendita Shopify ma non cancella», e che al
ripristino «su Shopify resta offline in **Bozza**», con mapping e ID conservati.

⛔ **Ma la FORMA TECNICA del ritiro non è ancora decidibile**: §0-bis voce 1 la dichiara
aperta, e §8.5.7 la colloca al passo 8 — **dopo** il collaudo mutativo sullo shop di
sviluppo (passo 7), perché non è deducibile dalla documentazione Shopify e va osservata.

⭐ **Quindi il cestino LOCALE è costruibile adesso; il suo effetto sul canale no.** E i due
non vanno confusi: il primo non dipende dal modello dei collegamenti, il secondo sì.

#### ✅ La decisione — prima tranche ai soli articoli ESCLUSIVAMENTE LOCALI

> **Deciso dal proprietario l'08/09/2026.** Il cestino si attiva sugli articoli non
> collegati a Shopify. Per i collegati, l'attivazione **aspetta il ritiro dalla vendita**,
> che la specifica prevede già (§1.8).

⚠️ **È una limitazione temporanea del RILASCIO, non una regola nuova.** Il comportamento
definitivo resta quello di §1.8 — «spostare nel cestino toglie dalla vendita Shopify ma non
cancella» — e la limitazione cade quando il ritiro esiste.

##### ⛔ «Non collegato» NON è «connessione disattivata» né «sincronizzazione spenta»

⚠️ **Sono tre assi diversi (§1.5)**, e confonderli farebbe entrare nel cestino proprio gli
articoli che stanno sul negozio:

| Asse                      | Dove vive                               |
| ------------------------- | --------------------------------------- |
| **collegamento**          | `shopifyProductId` · `shopifyVariantId` |
| interruttore del prodotto | `shopifySyncEnabled`                    |
| stato della connessione   | `ShopifyConnection.status`              |

⭐ **Un prodotto con la sincronizzazione spenta resta COLLEGATO**: gli ID sono conservati
apposta (§1.8, «mapping e ID Shopify restano sempre conservati») e il prodotto remoto
continua a esistere. Lo stesso vale per una connessione disattivata: il negozio non sparisce
perché VestiFlow ha smesso di parlargli.

⛔ **Qui c'era un'affermazione FALSA, e va corretta invece che tolta**: «(b) è la sola utile
ai tenant **senza** Shopify». Non è vero. Per un tenant senza Shopify **nessun articolo porta
un identificativo remoto**, quindi la limitazione non si vede: il cestino è disponibile per
l'intero catalogo, ed è la scelta adottata a servirli — non l'alternativa scartata.

##### ⭐ Per la VARIANTE si guardano DUE identificativi

Una variante senza SKU locale, o il cui SKU non torna dal remoto, **non riceve**
`shopifyVariantId` da `persistShopifyIds` — ma il prodotto è pubblicato e lei è sul canale
lo stesso. Il collegamento del **prodotto** basta a fermarla.

##### ⛔ Le ROTTE SONO REGISTRATE: «manca l'interfaccia» non vuol dire «disabilitate»

⚠️ **Corretto l'08/09/2026.** Qui c'era «i comandi sono implementati, l'attivazione no», con
l'interfaccia non collegata data come se bastasse a tenerli spenti. **Non basta.**

> **Le quattro rotte sono dichiarate nel controller e registrate all'avvio. Chi distribuisce
> questa versione le rende raggiungibili a chiunque abbia `catalog.delete`, pulsanti o no.**

⛔ **Un'API non ha bisogno di un bottone per essere usata.** L'assenza di interfaccia toglie
la scoperta, non la capacità: la stessa richiesta la fa uno script, un'integrazione, o una
persona che legge la rete del browser.

⚠️ **Quindi questa versione non va distribuita come funzionalità pronta.** Il registro non è
un miglioramento successivo: è ciò che rende accettabile che l'operazione sia raggiungibile.

##### ⛔ DIPENDENZA: la traccia non sopravvive al ripristino

`deletedAt`, `deletedById` e `deletionReason` si azzerano tornando dall'archivio. Sono lo
**stato** del cestino, non un registro: dopo un ripristino non resta traccia di chi avesse
spostato l'articolo, quando, né perché.

✅ **Il registro esiste dall’08/09/2026** (§10.3): i quattro comandi lo scrivono, e la
traccia sopravvive al ripristino — dimostrato su database reale.

⛔ **Ma il ramo resta non distribuibile**, e la ragione non era solo il registro:

| Manca ancora                            |                                                   |
| --------------------------------------- | ------------------------------------------------- |
| **collaudo operativo** del cestino      | le prove del service restano su database simulato |
| **concorrenza cestino ↔ pubblicazione** | non collaudata; il rimedio nel `where` è parziale |
| **interfaccia**                         | la vista Cestino è ancora in sola lettura         |

⏸ **Come tenere chiuse le rotte fino ad allora è una decisione da prendere**, e non si
anticipa qui: le strade sono un interruttore d'ambiente, un permesso dedicato che nessuno ha
ancora, oppure non distribuire questa versione. ⛔ Nessuna delle tre è stata implementata, e
finché non lo è **le rotte rispondono**.

##### ⚠️ Che cosa le prove dimostrano — e che cosa NO

⛔ **Le prove del cestino usano un database SIMULATO** (mock di Prisma). Vanno lette per
quello che sono, o si dichiara collaudato ciò che non lo è.

| Prova                                                                                                                                                              | Tipo                     | Che cosa dimostra                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| colonne scritte, `tenantId` nel `where`, varianti non toccate                                                                                                      | 🧪 database **simulato** | la **logica del service**: che cosa chiede al database                          |
| rifiuto sugli articoli collegati, nei tre casi                                                                                                                     | 🧪 simulato + unitaria   | la regola «solo locale», falsificata in quattro direzioni                       |
| seconda richiesta che non riscrive la data                                                                                                                         | 🧪 simulato              | il **ritorno anticipato**, non l'atomicità                                      |
| `where: { deletedAt: null }` presente nella chiamata                                                                                                               | 🧪 simulato              | che la guardia **viene passata**, non che il database la applichi come previsto |
| **ripristino**: tre colonne azzerate, `status: archived`, `lifecycleStatus: inactive`, nessuna riga creata, 404 sull’inesistente, nessun effetto fuori dal cestino | 🧪 simulato              | che il ripristino scrive **esattamente** quei campi e non ne inventa altri      |
| il cestino non chiama mai `product.delete`                                                                                                                         | 🧪 simulato              | che i due comandi restano distinti                                              |

⛔ **Non sono dimostrati, e non vanno dichiarati tali:**

| Che cosa manca                                                             | Perché un mock non può dirlo                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **fallimento a metà operazione** e rollback                                | non c'è transazione vera da annullare: il mock restituisce quello che gli si dice                                                                                                |
| **concorrenza reale**, due richieste sulla stessa riga                     | serve un secondo connesso davvero, come per le prove sulle identità                                                                                                              |
| **concorrenza con una pubblicazione Shopify** in corso                     | il collegamento può nascere _fra_ la lettura e la scrittura: il controllo su `shopifyProductId` è fatto **prima** dell'`updateMany`, e nel mezzo un push potrebbe pubblicare     |
| che il **filtro `deletedAt`** escluda davvero l’articolo da ogni selezione | ⚠️ quattro prove **simulate** lo coprono già (elenco, vista Cestino, riepiloghi varianti, ricerca per codice): quello che manca è la verifica su **dati veri**, non la copertura |

⭐ **Il terzo è quello che vale la pena nominare**: fra `findFirst` e `updateMany` c'è una
finestra in cui un push concorrente può assegnare `shopifyProductId`. La riga finirebbe nel
cestino **e** sul canale.

⛔ **E il rimedio che avevo indicato è PARZIALE, non una soluzione dimostrata.** Qui c'era
«il rimedio esiste — la stessa forma già usata altrove, il controllo dentro il `where`
dell'aggiornamento»: mettere `shopifyProductId: null` nel `where` chiude **un** ordine, non
il caso che conta di più.

| Ordine                                                                                     | Il `where` basta?                                                                                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| il push ha **già scritto** `shopifyProductId`, poi arriva il cestino                       | ⏸ sì, **col rimedio proposto**: oggi il `where` è `{ id, tenantId, deletedAt: null }` e non guarda gli id remoti |
| il cestino scrive per primo, poi il push scrive gli identificativi                         | ⚠️ no: il `where` del cestino non ha nulla da vedere — serve una guardia sul PUSH                                |
| ⛔ la richiesta a Shopify **è già partita** e gli identificativi locali non ci sono ancora | ⛔ **no, e nessun `where` può vederlo**: il prodotto remoto esiste, il database locale non lo sa                 |

⛔ **Il terzo caso è quello vero.** `persistShopifyIds` scrive **dopo** che Shopify ha
risposto: fra la chiamata e la scrittura il prodotto è pubblicato e in locale nessuna colonna
lo dice. Un controllo che interroga solo il database non lo può sapere — e questo significa
che il rimedio non è una clausola, ma una decisione su **dove** si serializza il collegamento.

⏸ **Non si progetta adesso**, e non si dichiara risolto.

##### Che cosa dovrà coprire il collaudo, quando si farà

| Prova                                                                                         |
| --------------------------------------------------------------------------------------------- |
| cestino → pubblicazione, con l'incastro dichiarato e letto da `pg_stat_activity`              |
| pubblicazione → cestino, stesso metodo                                                        |
| ⛔ richiesta Shopify **già partita**, identificativi locali ancora assenti, cestino nel mezzo |
| rollback: che cosa resta quando una delle due fallisce a metà                                 |
| uso improprio e isolamento fra tenant, sulle stesse due sequenze                              |

⚠️ **Su database reale, con due connessioni**, come per le prove sulle identità: un mock non
può mostrare nessuno dei cinque casi.

⚠️ **Le prove reali si fanno come quelle delle identità**: database di prova locale, due
connessioni, incastro dichiarato letto da `pg_stat_activity`, e le falsificazioni. Non sono
state fatte.

#### Che cosa questo perimetro NON è

⛔ **Il cestino NON rende l'eliminazione a due passi**, e qui c'era scritto il contrario:
«copre l'eliminazione rendendola a due passi, così l'operazione irreversibile diventa
deliberata». **Falso.** `DELETE /products/:id` è rimasto quello che era: una cancellazione
fisica in un passo solo, con `catalog.delete`, raggiungibile esattamente come prima.

⭐ **Il cestino ha AGGIUNTO un percorso reversibile accanto a quello irreversibile.** Non lo
ha sostituito, non lo ha preceduto, non lo ha reso obbligatorio. Perché tutte le eliminazioni
passino da due passi servirebbe una decisione che nessuno ha preso — se `DELETE` debba
rifiutare un articolo che non è già nel cestino — e quella decisione **non è stata presa**.

⛔ **E non è una funzionalità completata.** I comandi esistono; mancano tre cose, e nessuna è
un dettaglio:

| Manca                  |                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| **registro**           | `PlatformAuditLog`: senza, di un cestino ripristinato non resta memoria                                    |
| **interfaccia**        | la vista Cestino è in sola lettura: nessun comando è raggiungibile dai pulsanti                            |
| **collaudo operativo** | le prove sono su database **simulato**: rollback, concorrenza e interazione col canale non sono verificati |

⛔ **Non tocca** il collegamento sbagliato (§18), e non introduce nessuna eccezione nuova ai
vincoli del modello.

⛔ **E non consuma i prerequisiti di §13**: il cestino non scrive nelle sette tabelle, non
tocca backup, ripristino, cancellazione tenant, identità del negozio, doppia scrittura,
backfill né il passaggio dei lettori. È lavoro **parallelo**, non sostitutivo.

⚠️ **Il registro è l'eccezione, e va detto qui**: `PlatformAuditLog` non è lavoro che il
cestino lascia intatto — è una dipendenza che **condivide** con il piano storico, e sulla
quale il cestino arriva per primo, perché le sue rotte sono già registrate. Il quadro
completo è in §19.

---

### ⏸ 18 · Casi di errore realistici sui collegamenti

> ⛔ **Nessuna eccezione nuova viene progettata qui.** Si classifica soltanto: che cosa è già
> impedito, che cosa si corregge, che cosa no.

⚠️ **Non si aspettano incidenti reali per saperlo**: questi otto casi si leggono dal codice e
dai vincoli misurati fra il 07 e l'08/09/2026.

#### ✅ Già impediti dal database, oggi

| Caso                                                             | Chi lo impedisce                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| due webhook simultanei per lo **stesso GID** creano due identità | `UNIQUE (shop_id, gid)` totale + la FK sulle colonne generate        |
| un periodo attivo resta su un'identità **eliminata**             | `…_identita_viva_fkey`, serializzata da PostgreSQL                   |
| lo stesso GID viene **spostato** su un altro articolo            | `…_immutabile`: il GID e l'appartenenza originaria non si riscrivono |
| un'identità eliminata viene **riagganciata**                     | `…_immutabile`, due divieti ridondanti fra loro                      |

⭐ **Sono i quattro che il modello esiste per chiudere**, e sono chiusi in modo dichiarativo:
non dipendono da un servizio che si ricordi di controllare.

#### ⛔ Non ancora impediti — e sono lavoro, non incognite

| Caso                                                               | Oggi                                                                                  | Chiuso da           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------- |
| il **webhook ricrea una variante** che l'operatore aveva eliminato | ⛔ raggiungibile: `deleteVariantInTx` non ha guardia e il push non cancella la remota | fase B (B2, B4, B5) |
| il **pull reimporta** un articolo eliminato definitivamente        | ⛔ nessuna esclusione da interrogare (§11.8, misurato)                                | fase B (B5, B6)     |
| il **sync location** aggancia o crea una sede **per nome**         | ⛔ raggiungibile, e viola §1.13 / §1.13.1                                             | fase B (B7)         |

⚠️ **Il primo è quello che capita per primo nell'uso normale**: togliere una variante da un
prodotto sincronizzato è un gesto ordinario, non un caso limite. ⛔ E oggi **non ha rimedio**, ma prodotto e variante non si comportano allo stesso modo:

|                                       | Cestino (§17)      | Eliminazione                                                                              |
| ------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| **prodotto collegato**                | ⛔ non disponibile | ⛔ **rifiutata** da `assertShopifyLinkedDeleteAllowed`                                    |
| **singola variante** di quel prodotto | ⛔ non disponibile | ⚠️ **riesce**: `deleteVariantInTx` controlla i **movimenti**, non il collegamento Shopify |

⛔ **Ed è proprio la seconda riga a tenere aperto il difetto.** La variante si elimina in
locale, resta viva sul negozio — il push non la cancella — e il primo webhook la **ricrea**.
Niente lo impedisce oggi: il divieto di ricreazione automatica è deciso (§11.8) e non
implementato.

#### ⚠️ Correggibili, ma solo con lavoro già previsto

| Caso                                                            | Come si corregge                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **elimino l’articolo sbagliato**                                | ⚠️ **solo se non l’ho ancora eliminato**: il cestino (§17) **aggiunge** un percorso reversibile accanto a `DELETE /products/:id`, non lo sostituisce e non lo rende obbligatorio. ⛔ Una cancellazione definitiva già avvenuta **non si annulla**. ⛔ E su un articolo **collegato a Shopify** questa prima tranche del cestino **non è disponibile** |
| **ripristino un backup che farebbe sparire articoli collegati** | ⭐ il ripristino si **rifiuta e li nomina** (§10.1 S3): l'errore non arriva a compiersi                                                                                                                                                                                                                                                               |
| **disconnetto per sbaglio**                                     | ⭐ si riconnette: coppie e collegamenti restano (§15.2)                                                                                                                                                                                                                                                                                               |
| **riconnetto e il negozio è un altro**                          | i collegamenti si chiudono con `shop_change`, la storia resta, si ricollega a mano                                                                                                                                                                                                                                                                    |

#### ⛔ NON correggibile — uno solo, e va nominato

> **Collego il GID giusto all'articolo SBAGLIATO, e me ne accorgo dopo.**

Il periodo si chiude, ma l'identità resta: quel GID è legato a quell'articolo **per sempre**,
e l'articolo giusto non potrà mai riceverlo.

⚠️ **Nessuna delle tre regole che lo producono è sbagliata** — unicità totale sul GID,
identità immutabile, storia non cancellabile — ed è l'effetto della loro somma, non di
nessuna di esse.

⛔ **Non si progetta un rimedio adesso**, per decisione dell'08/09/2026: entrambe le strade
richiedono di allargare qualcosa (una terza porta nei trigger, o l'unicità totale), e un
rimedio disegnato prima di sapere quanto serve è il modo in cui si aggiunge la prossima
rigidità.

⭐ **Quello che si può fare senza costo, ed è già la forma del resto**: rendere il
collegamento un'**azione dichiarata** — l'operatore sceglie, vede che cosa sta collegando, e
conferma. È già ciò che §1.13.1 prescrive per le sedi. Un errore che non si può correggere si
previene al momento in cui si commette, non dopo.

#### ⚠️ E uno che non è un errore, ma ci somiglia

Un **articolo ripubblicato** su Shopify riceve un GID nuovo: nasce una **seconda identità**
sullo stesso `original_product_id`, e la prima resta con la sua storia. ⛔ Non è un doppione
da correggere: è il comportamento previsto da §11.9, ed è la ragione per cui non esiste
unicità su `original_product_id`.

---

### ⛔ 19 · Il quadro completo — il cestino NON sostituisce niente

⚠️ **Va scritto perché è la lettura sbagliata più facile**: si passa al cestino, che è piccolo
e utile, e il resto scivola fuori dallo sguardo. Il cestino è una tranche **aggiuntiva**.

#### Il piano, nell'ordine di §13 — non un elenco piatto

⛔ **Corretto l'08/09/2026.** Qui c'era una tabella di nove voci intitolata «I prerequisiti
della PRIMA SCRITTURA», con dentro anche backfill e passaggio dei lettori. **Non lo sono**:
vengono **dopo** la prima scrittura, e presentarli come prerequisiti fa sembrare che serva
tutto insieme prima di poter cominciare.

⭐ **L'ordine è quello di §13, e non cambia**: nessuna di queste voci è stata tolta, spostata
o declassata. Cambia solo dove ciascuna cade.

| Momento                                             | Lavori                                                                                                                                                                                                                                                      | Perché lì                                                                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 · compatibilità e registro** (fase A)           | registro `PlatformAuditLog` (§10.3 — ✅ **fatto per il cestino** l’08/09/2026; resta da estendere alla cancellazione tenant e ai percorsi dello storico) · backup e ripristino (§10.1) · recupero dello storico (S2-bis) · cancellazione del tenant (§10.2) | alla **prima riga scritta** ripristino e cancellazione tenant si rompono: vanno chiusi prima che quella riga esista                                                              |
| **2 · identità del negozio** (fase B, B1)           | fase 2 di §8.5.8: `shop_gid`, riga `shopify_shops`, `shopify_connections.shop_id`                                                                                                                                                                           | `shop_id` è `NOT NULL`: senza, **non si scrive nessuna identità**                                                                                                                |
| **3 · prima scrittura controllata** (fase B, B2-B7) | doppia scrittura con **eliminazioni compatibili** (§11) · divieto di ricreazione automatica (§11.8) · sedi (§12)                                                                                                                                            | è il primo momento in cui le tabelle si popolano, e l'eliminazione deve continuare a funzionare                                                                                  |
| **4 · backfill** (§8.5.8 fase 3)                    | conversione dei collegamenti già esistenti                                                                                                                                                                                                                  | ⛔ **dopo** la prima scrittura: prima non c'è la forma in cui convertire. ⚠️ La collocazione esatta fra B2-B7 la dà **§13**, «Le dipendenze, in ordine»: qui non si ricostruisce |
| **5 · passaggio dei lettori** (§8.5.4, §8.5.5)      | i servizi smettono di leggere le colonne-cache                                                                                                                                                                                                              | ⛔ **ultimo**: solo qui le sette tabelle diventano fonte canonica                                                                                                                |

⚠️ **Il registro è il primo blocco, e non per gerarchia**: delle **due** dipendenze che il
cestino condivide col piano storico (vedi sotto), è quella che morde **già oggi**, perché le
sue rotte sono registrate.

#### E il resto del piano resta dov'è

⏸ **Nessuno di questi si anticipa**, e nessuno si perde di vista:

| Lavoro                                                         | Dove                |
| -------------------------------------------------------------- | ------------------- |
| **sedi**: nessun collegamento né creazione automatici          | §12, §15.3, §13 B7  |
| **riconnessione** allo stesso negozio, distinta dal cambio     | §15.2               |
| **matrice dei campi** e direzione per campo                    | `docs/24` §9.2      |
| **CSV esteso** VestiFlow con gli identificativi remoti         | §8, `docs/24` §12.0 |
| **primo allineamento** degli articoli, due direzioni approvate | §8                  |
| **script di backfill** come intervento di sicurezza separato   | §14                 |
| **cestino**: registro, interfaccia, collaudo operativo         | §17                 |

#### ⭐ Cestino e piano storico condividono DUE dipendenze, non una

⚠️ **Corretto l'08/09/2026.** Qui c'era «l'unico punto in cui i due si toccano è l'effetto
Shopify del cestino». È incompleto: ne condividono **due**, e la seconda è la più stringente.

| Dipendenza condivisa                     | Per il cestino                                                            | Per il piano storico                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| **`PlatformAuditLog`** (§10.3)           | ⛔ le rotte sono già registrate: senza registro non si distribuisce (§17) | ⛔ un rifiuto illeggibile non è un rifiuto utile     |
| **ritiro dalla vendita** (§0-bis voce 1) | ⛔ è ciò che tiene la prima tranche ai soli articoli locali               | ⚠️ è il passo 8 di §8.5.7, dopo il collaudo mutativo |

⭐ **Il registro è UNO SOLO**, e questo è il punto: non ne esiste una versione «per il
cestino» e una «per lo storico». Chi lo costruisce lo costruisce per entrambi, ed è la
ragione per cui §10.3 dice «un unico registro definitivo, che nasce col sottoinsieme minimo».

#### Che cosa il cestino NON consuma

⭐ Non scrive nelle sette tabelle, non tocca backup, ripristino, cancellazione tenant,
identità del negozio, doppia scrittura, backfill né il passaggio dei lettori. Su quei fronti
non fa avanzare e non fa arretrare niente.

---

### ✅ 22 · CHIUSO l'08/09/2026 — una riga negozio rimasta da un tentativo INCOMPLETO respinge un altro tenant

> **Misurato l'08/09/2026**, prova `6d` di `identita-negozio-shopify`. Era un effetto del
> disegno di B1, non un difetto di implementazione: la riga si scriveva prima che il
> collegamento fosse confermato.

⭐ **Chiuso lo stesso giorno**, col rimedio descritto sotto: identità, credenziale,
connessione e consumo dello stato OAuth stanno ora in **una sola transazione**. La prova `6d`
è stata **invertita** — misurava il difetto, ora misura che il tenant B completa — e `6b`
verifica che dopo un fallimento `shopify_shops` sia **vuota**.

⚠️ **Resta fuori, e richiede autorizzazione separata**: le righe **già create** da tentativi
incompleti prima di oggi. Nessuna rimozione è stata fatta; il criterio per distinguerle è più
sotto.

#### L'effetto

```text
tenant A  collega → identità letta → riga shopify_shops creata (tenant A)
          → getShop cade → nessuna credenziale, nessuna connessione
          A NON è collegato

tenant B  collega lo STESSO negozio, che è davvero suo
          → registra() trova la riga di A → «rivendicato_altrove»
          ⛔ B respinto da un tentativo che non è mai andato a buon fine
```

⚠️ **Non è un caso di laboratorio**: basta che la chiamata a `/shop.json` cada dopo che
l'identità è stata letta — due chiamate remote consecutive, la seconda può fallire da sola.

#### ⛔ La prima proposta era INSERVIBILE — corretta l'08/09/2026

Avevo proposto una regola di sola **lettura**: «il controllo di appartenenza guarda le
identità rivendicate, non quelle solo scritte». ⛔ **Non funziona**, e a dirlo sono due
vincoli che ho verificato dopo:

| Vincolo                                                           | Effetto su B                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| `shopify_shops_shop_gid_key` — unicità **globale** su `shop_gid`  | B non può creare una riga propria per quel negozio        |
| `shopify_connections_shop_id_tenant_id_fkey (shop_id, tenant_id)` | B non può puntare alla riga di A: i tenant non coincidono |

⭐ **Anche superando il controllo, B non ha dove scrivere.** Rilassare la lettura senza
toccare le righe lascia il problema identico.

#### Il rimedio — ✅ **implementato l'08/09/2026**

> **L'identità nasce INSIEME alla connessione, nella stessa transazione.** Un tentativo
> incompleto non lascia nessuna riga, e la domanda «residuo o negozio vero?» smette di doversi
> porre.

Oggi la riga si scrive prima, e fra quel momento e la connessione ci sono ancora una chiamata
remota e una transazione. Spostando la ricerca-o-creazione **dentro** la transazione finale:

- un fallimento a qualunque punto **annulla anche la riga**;
- l'unicità globale resta intatta e non si rilassa niente;
- nessuna riassegnazione e nessuna cancellazione di storico.

⚠️ **Il costo tecnico, dichiarato**: la ripresa da `P2002` non sopravvive dentro una
transazione — un conflitto di unicità la aborta. Dentro la transazione la ricerca-o-creazione
va quindi fatta in isolamento `Serializable` **senza** catturare il conflitto: due connessioni
simultanee allo stesso negozio producono un errore di serializzazione su una delle due, che è
un esito legittimo e ripetibile.

#### ⛔ E i conflitti NON sono di un tipo solo — misurato, non assunto

> **195 coppie concorrenti sul database di prova, 08/09/2026.** Avevo assunto `P2002`, che è
> la forma con cui Prisma segnala l'unicità altrove. **Non esce mai.**

```text
P2034            «write conflict or deadlock» di Prisma
P2010 + 40001    serialization_failure grezza di PostgreSQL
P2010 + 23505    unicità violata: rara, e sulla chiave COMPOSTA (tenant_id, shop_gid)
```

⭐ **E la scelta dell'isolamento è stata fatta con la stessa misura**, non per prudenza:

| isolamento      | stesso negozio, due tenant | stesso tenant, negozi diversi                         |
| --------------- | -------------------------- | ----------------------------------------------------- |
| `ReadCommitted` | 1 completa ✅              | ⛔ **2 completano**, e uno dei due «connesso» è falso |
| `Serializable`  | 1 completa ✅              | 1 completa ✅                                         |

⚠️ **Il prezzo del `Serializable`, dichiarato**: due riconnessioni simultanee allo **stesso**
negozio producono un fallimento riprovabile su una delle due. Il callback lo riconosce e
risponde `shopify=connection_conflict` — un esito comprensibile, dopo un rollback completo,
con la possibilità di riprovare — invece di lasciar salire un 500.

⛔ **Il riconoscimento guarda DUE campi**, non uno: il `code` di Prisma e `meta.code` di
PostgreSQL. Un errore estraneo (`P2022`, per esempio) **risale**: trattare qualunque errore
come «riprova» nasconderebbe i guasti veri.

#### E per le righe GIÀ create, la distinzione richiesta

⛔ **Un residuo non è uno storico, e i due si distinguono per ciò che li referenzia:**

|                          |                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **tentativo incompleto** | nessuna connessione lo referenzia, **e** nessuna identità prodotto o variante, **e** nessuna coppia sede, **e** nessun periodo |
| **negozio reale**        | anche uno solo di quei riferimenti                                                                                             |

⭐ Solo il primo caso è rimuovibile, come **passo di manutenzione autorizzato** — mai
automatico, mai dentro il flusso di connessione. ⚠️ `shopify_shops` non ha trigger
`mai_delete`, quindi la rimozione è tecnicamente possibile: è la **decisione** a doverla
limitare, non il database.

⛔ **Alternativa scartata**: consentire a B di subentrare in una riga «incompleta» di A. È una
riassegnazione, e non si fa in automatico per nessuna soglia di tempo.

---

### ✅ 23 · CHIUSO l'08/09/2026 — uno stato OAuth pendente sopravviveva al cambio di profilo canale

> **Misurato l'08/09/2026**, prova `K7d` di `senza-shopify`, e **corretto lo stesso giorno**
> su autorizzazione esplicita del proprietario.

Il vincolo dichiarato è che **VestiFlow funziona anche senza Shopify**, e che un tenant di
solo gestionale non collega il canale. La guardia c'è, e regge:

```text
beginAuth      assertTenantChannelProfile(…, shopify)   ⛔ rifiuta, e PRIMA di tutto:
                                                          nessuna riga, nessuna chiamata
handleCallback  (nessun controllo di profilo)
```

**Il buco è nella finestra fra i due.** Il cambio profilo è consentito finché non c'è una
connessione attiva: se il titolare avvia il collegamento e poi passa a `gestionale`, lo stato
OAuth pendente resta valido e il callback **completa**. Misurato:

```text
esito   shopify=connected
righe   negozi 1 · connessioni 1 · credenziali 1        su un tenant `gestionale`
```

⚠️ **La portata è limitata, e va detta**: serve che il collegamento sia già stato avviato e
che il profilo cambi entro la vita dello stato OAuth. Non è raggiungibile da un tenant che
non abbia mai premuto «collega».

#### Il rimedio, che è in TRE punti — non uno

⛔ **La prima idea era una riga sola** («la stessa guardia anche nel callback»), e non
bastava: chiudeva il caso in cui il profilo è già cambiato all'arrivo del callback, e lasciava
scoperti i due casi in cui cambia **mentre** il collegamento è in corso.

| #   | Dove                                                                  | Che cosa copre                                                                           | Prova |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----- |
| 1   | `handleCallback`, **prima** delle chiamate                            | profilo già `gestionale` all'arrivo: rifiuta senza scrivere e **senza chiamare Shopify** | `K7d` |
| 2   | `handleCallback`, **dentro** la transazione, dopo `FOR UPDATE`        | il profilo cambia durante le due chiamate remote                                         | `K7g` |
| 3   | `updateTenant`, verifica **dentro** la transazione, dopo `FOR UPDATE` | il cambio profilo decide su dati aggiornati, non su una lettura vecchia                  | `K7h` |

⭐ **Il punto 2 non poteva essere `Serializable` e basta.** Avevo scritto che una lettura
serializzabile vale da prenotazione: **è falso**, e `K7e` l'ha dimostrato al primo giro — la
protezione SSI di PostgreSQL vale solo fra transazioni **entrambe** serializzabili, e un
`UPDATE` singolo non lo è. Il collegamento si completava lo stesso. Serve `FOR UPDATE`, che
blocca chiunque a qualunque isolamento.

#### ✅ Il punto 3 ha ora la sua prova — `K7h`, e falsifica

⚠️ **Qui c'era scritto che il punto 3 non era falsificabile**, e che restava «un rafforzamento
ragionato, non un difetto dimostrato». Era vero per le prove di allora, e non è più vero: il
proprietario ha indicato la forma mancante — trattenere il callback **prima del commit** e far
partire il cambio profilo mentre la connessione non è ancora visibile.

```text
1. il callback ha SCRITTO la connessione, non ha ancora committato
2. da fuori la connessione NON si vede: una verifica fatta ora direbbe «si può cambiare»
3. il cambio profilo ASPETTA, perché la riga del tenant è bloccata
4. al commit trova la connessione attiva e RIFIUTA
```

⛔ **E falsifica davvero**: riportando `updateTenant` com'era — verifica fuori dalla
transazione, nessun `FOR UPDATE` — `K7h` diventa rossa con `expected 'fulfilled' to be
'rejected'`, cioè il cambio profilo riesce e resta un cliente **Solo gestionale** con Shopify
collegato. `K7e` cade con lei.

⚠️ **La prima falsificazione era imprecisa e non falsificava niente**: spostava fuori la sola
`assert` lasciando il `FOR UPDATE`. Quel lock, anche fuori transazione, fa comunque da
barriera — la `SELECT … FOR UPDATE` si mette in coda e la verifica finisce per avvenire dopo
il commit del callback. Una falsificazione che lascia in piedi metà del rimedio dimostra solo
che l'altra metà bastava.

⭐ **La strumentazione è confinata ai test**: la transazione si trattiene sostituendo
`$transaction` sul client di prova (`trattieniLaProssimaTransazione`, in `concorrenza.util`).
Nell'applicazione non esiste nessun gancio, ed è la ragione per cui la prova dimostra
qualcosa — un gancio operativo proverebbe il gancio.

#### ⛔ E un GUASTO non si traveste da decisione — corretto l'08/09/2026

Il rimedio, appena scritto, sbagliava a classificare due cose. Le ha rilevate il proprietario
leggendo il codice, prima che facessero danno:

| Difetto                                                  | Perché è grave                                                                                                                                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| il `catch` attorno alla lettura del profilo era **nudo** | una lettura fallita per un motivo **tecnico** — connessione persa, timeout — usciva come «canale non abilitato»: una risposta di dominio falsa, che manda a controllare il profilo del cliente mentre il guasto è nel database |
| `P2028` era nell'elenco dei **conflitti**                | è il «transaction API error» di Prisma — transazione scaduta o chiusa. Dire «riprova, un altro collegamento è in corso» è falso, e riprovare non risolve un timeout                                                            |

⭐ **La discriminante è il TIPO, non il caso per caso**: `assertTenantChannelProfile` esprime
le proprie decisioni con `BadRequestException`; qualunque altra cosa non è una decisione e
**risale con la causa intatta**. Vale in entrambi i punti — prima delle chiamate e dentro la
transazione.

⚠️ **`P2002` invece resta**, e la differenza va detta: non è mai stato osservato, ma **è** un
conflitto — la forma con cui Prisma segnala l'unicità violata, che qui può venire solo da un
secondo collegamento sullo stesso `shop_gid`. Coprire un percorso non misurato con la
classificazione **giusta** è diverso dal coprirlo con una comoda.

⭐ Tre prove mirate, e tutte e tre falsificate disattivando la correzione corrispondente:
lettura rotta prima delle chiamate, lettura rotta dentro la transazione, `P2028`. Più una
quarta che verifica che i rifiuti **veri** — profilo non abilitato, conflitto riconosciuto —
continuino a funzionare.

⭐ **Il verso opposto è coperto**: se il collegamento vince la corsa, `K7e` pretende che il
cambio profilo sia stato rifiutato **e per la ragione giusta** («Disconnetti Shopify»), e
`K7f` verifica che quel cambio, da solo, riesca — senza, `K7e` sarebbe verde anche con un
cambio profilo che fallisce sempre.

#### I due rifiuti possibili, e perché vanno bene entrambi

```text
channel_not_enabled    il cambio era già committato quando la transazione ha letto il profilo
connection_conflict    il cambio ha committato a transazione aperta: PostgreSQL la fa fallire
                       con 40001 sul lock di riga
```

⚠️ In **entrambi** i casi non è stato scritto niente e il messaggio non promette nulla di
falso: riprovando, il secondo tentativo trova `gestionale` e risponde `channel_not_enabled`.

---

### ⏸ 24 · APERTO — un fallimento locale dopo la creazione remota lascia un prodotto ORFANO su Shopify, e il tentativo successivo ne crea un secondo

> **Misurato il 09/09/2026**, prova `3h` di `storico-push.integration-spec.ts`. ⛔ **Non
> corretto**: è un limite operativo da risolvere **prima del rilascio**, non un difetto di
> queste prove.

#### Che cosa succede

```text
1. push          →  Shopify CREA il prodotto 665001                    ✅ remoto
2. scrittura locale cade  →  rollback: VestiFlow non ha traccia        ⛔ locale annullato
3. nuovo tentativo  →  nessun `shopifyProductId`: si CREA di nuovo     →  665002
   ────────────────────────────────────────────────────────────────────────────
   DUE prodotti remoti per UN articolo VestiFlow, e il primo non è nominato
   da nessuna identità: VestiFlow non sa che esiste
```

⭐ **Localmente è tutto coerente**: una sola identità, un solo periodo, due identità variante,
il prodotto punta al secondo. ⛔ **Il disallineamento è tutto sul canale**, ed è esattamente
ciò che una transazione non può impedire: il database annulla sé stesso, non una chiamata già
accettata da Shopify.

#### ⚠️ Non confondere con l'idempotenza locale, che invece funziona

|                                                    |                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| **idempotenza locale** (`3c`)                      | lo stesso GID visto due volte non duplica identità né periodi ✅ |
| **recupero dopo creazione remota riuscita** (`3h`) | ⛔ nessun meccanismo: si ricrea                                  |

La differenza sta in **chi assegna il GID**: se è lo stesso, lo storico lo riconosce; se
Shopify ne assegna uno nuovo — e lo fa a ogni creazione — non c'è niente da riconoscere.

#### ⛔ Nessuna soluzione è implementata, e non va dedotta da qui

Le strade esistono e vanno **scelte**, non improvvisate: una chiave di idempotenza inviata a
Shopify, una ricerca del prodotto per identificativo prima di crearlo, la registrazione
dell'intenzione **prima** della chiamata remota. ⚠️ Ognuna ha un costo e un caso limite
proprio, e la scelta appartiene alla stessa famiglia di decisioni ancora aperte in `docs/24`
§8.9 — dove il requisito «nessuna perdita silenziosa» (§8.9.4) già la sfiora senza deciderla.

⚠️ **La finestra è stretta ma reale**: serve che la creazione remota riesca e la scrittura
locale cada subito dopo. Non è ipotetica — è la stessa finestra che `3e` esercita.

⭐ **La prova resta a misurare il limite**, non a dichiararlo accettabile: quando il rimedio
arriverà, `3h` andrà riscritta e dirà l'opposto.

---

### ✅ 25 · CHIUSO il 09/09/2026 — due import sovrapposti dello stesso prodotto: il secondo ASPETTA prima di leggere, poi AGGIORNA

> **Misurato il 09/09/2026** dal revisore (prova `C2` di `concorrenza-import.integration-spec.ts`)
> e **corretto lo stesso giorno** dall'unico implementatore, con la precisazione del proprietario
> al rimedio proposto: `gia_collegato → skipped` **non era automaticamente corretto**. Il secondo
> evento può portare una modifica valida — un titolo Shopify, un barcode — e non è un doppione
> da scartare.

#### Che cosa succedeva — riprodotto in modo deterministico PRIMA di correggere

```text
T1  guardia (storico): «si crea»  ─┐  entrambe aperte insieme, entrambe passate
T2  guardia (storico): «si crea»  ─┘  (idle in transaction, misurato su pg_stat_activity)
T1  advisory lock → crea articolo → varianti → identità + periodo → COMMIT
T2  advisory lock (ora libero) → crea un SECONDO articolo con lo stesso shopify_product_id
    → varianti con gli STESSI id remoti → registraProdotto: «gid_di_un_altro» → COMMIT
```

| prova                                                        | prima della correzione                                                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C2` — SKU rinominato nel secondo webhook                    | **doppione senza storico**, esito `imported` senza errore. Su `products` non c'è unicità per `(tenant_id, shopify_product_id)`, e l'advisory lock di `nextArticleCodeInTx` arrivava DOPO la guardia |
| `C1` — stesso payload                                        | la seconda cadeva sull'unicità `(tenant_id, sku)` — protezione **accidentale** — e `recordProductImportError` marcava `error` **il prodotto sano** della prima                                      |
| `C5` — variante nuova, barcode aggiornato nel secondo evento | la mappa delle varianti era letta PRIMA dell'attesa: la guardia rispondeva `gia_collegato`, la variante veniva saltata e con lei il barcode nuovo — V2 restava `EAN-PRIMA`                          |

⚠️ **`C5` non esisteva**: `C3` e `C4` provavano l'assenza di doppioni, non la conservazione degli
aggiornamenti — rilievo del proprietario. È stata scritta e fatta girare **sul codice non
corretto** prima di toccarlo, e cadeva dove doveva.

#### Il rimedio — `importProduct` è UNA transazione, e il lock viene PRIMA della lettura

```text
BEGIN
  pg_advisory_xact_lock(hashtext('shopify_import:<tenant>'), hashtext(<shopify_product_id>))
  existing ← letto ORA, su tx          chi ha aspettato vede il commit dell'altro
  guardie (spento · syncing · catalogo VestiFlow) e productData — su QUELLA lettura
  ramo creazione   (guardia storico → codice articolo → create → storico)   ┐ invariati,
  ramo aggiornamento (update → varianti dalla mappa FRESCA → storico)        ┘ solo dentro
COMMIT
```

⭐ **Chi aspetta riparte su uno stato aggiornato e NON salta**: trova l'articolo appena creato
dall'altro, prende il ramo di aggiornamento con il **proprio** payload, e titolo Shopify,
barcode e gli altri campi della matrice arrivano a destinazione. **Il metro è la consegna in
sequenza**: due webhook sovrapposti lasciano lo stesso stato che avrebbero lasciato arrivando
uno dopo l'altro.

⚠️ **«In sequenza» è l'ordine di ELABORAZIONE, non quello degli eventi** — precisazione del
proprietario del 09/09/2026. Il secondo payload elaborato **non è necessariamente il più
recente**: §25 risolve gli incroci provati (doppioni, perdite), non l'ordine cronologico dei
webhook, che resta `docs/24` §8.5.3 (`X-Shopify-Triggered-At`, inbox) e **non è implementato**
(piano, I2–I3).

| scelta                                                                | perché                                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lock **prima della lettura**, non prima della scrittura               | un lock dopo la lettura serializza la scrittura ma non la DECISIONE, già presa su uno stato che non c'è più — falsificato (`F2`, sotto)                    |
| chiave `(tenant, shopify_product_id)`, non `(negozio, gid)`           | vale anche per le connessioni preesistenti senza `shop_id`, che il doppione lo producono uguale                                                            |
| stessa tecnica di `nextArticleCodeInTx`, che resta e viene preso DOPO | ordine sempre uguale, quindi nessun ciclo                                                                                                                  |
| nessun cambio d'isolamento, nessuna coda, nessuna politica nuova      | come da mandato: i rami esistenti sono gli stessi, soltanto dentro la transazione (`loadTenantSkus`, `updateMany` del titolo e `negozioDelTenant` su `tx`) |
| nessuna chiamata di rete nella transazione                            | `enrichProduct` è già stato fatto dal chiamante; `syncProductImagesFromShopify` non ne fa                                                                  |

#### Le prove — riscritte per il comportamento corretto, e falsificate DUE volte

Cinque prove, ognuna con il blocco **causale** (`pg_blocking_pids`) e con il **tipo** di attesa
letto da `pg_stat_activity` — `Lock/advisory`, non `Lock/transactionid`: dire «T2 è bloccata
da T1» non basta, va detto DOVE.

| prova                                               | esito                                                                                                                                                      | che cosa dimostra                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `C1` stesso payload                                 | T2 ferma sull'advisory lock PRIMA di leggere, poi `updated`; **nessuna** guardia eseguita da T2; storico `registrato`; il prodotto è `synced`, non `error` | niente doppione, niente effetto collaterale         |
| `C2` SKU rinominato                                 | UN articolo, storico agganciato a lui, nessun identificativo remoto duplicato su **tutto** il tenant                                                       | il difetto originale                                |
| `C3` variante nuova                                 | T2 non passa dalla guardia: trova la variante di T1 nella mappa fresca e la aggiorna                                                                       | niente «variante saltata»                           |
| `C4` variante nuova, SKU rinominato                 | come `C3`                                                                                                                                                  | la protezione non è lo SKU                          |
| `C5` barcode e titolo aggiornati nel secondo evento | V2 = `EAN-DOPO`, titolo = quello di T2                                                                                                                     | **l'aggiornamento non si perde** (`docs/24` §8.9.4) |

| falsificazione                                  | risultato                                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** — lock tolto                             | `C1`/`C2`: **nessun** blocco causale, T2 tira dritto; `C3`/`C4`/`C5`: T2 ferma su `Lock/transactionid` — la riga del prodotto, cioè la protezione DOPO la lettura            |
| **F2** — lock presente ma preso DOPO la lettura | tutte e cinque rosse: `C1`/`C2` rispondono `skipped` (niente doppione, aggiornamento perso — esattamente il rimedio non approvato), `C3`/`C4`/`C5` tornano a `gia_collegato` |

Entrambe le metà del rimedio sono necessarie. Dopo ogni falsificazione il file è tornato
**byte per byte** a quello corretto (`cmp`).

⚠️ **Adeguata la spec unitaria**: lettura di `existing`, SKU riservati e scrittura del solo Nome
Shopify stanno ora su `tx`; la transazione è il contenitore di ogni import, anche quando
l'esito è `skipped` — ciò che si esclude è la scrittura del catalogo, non il contenitore.

#### Che cosa NON chiude — dichiarato

|                                                                                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SKU di una variante già abbinata**                                              | il ramo di aggiornamento **non lo riscrive** (`variantSyncData` non lo contiene): `C2`/`C4` conservano lo SKU della prima anche se il secondo webhook lo rinomina. È lo stesso esito della consegna in sequenza — quindi non è concorrenza — ma `docs/24` §9.2 dichiara SKU e barcode **bidirezionali**. Divario preesistente, fuori da questo blocco: da decidere se e come applicarlo                                                                                                       |
| **l'attesa è limitata dal timeout della transazione** (`PRODUCT_IMPORT_TX`, 30 s) | un import che aspetta il lock più a lungo fallisce con `Transaction already closed` e viene marcato `error` — un errore vero e visibile, non una perdita muta. E mentre aspetta tiene una connessione del pool. Visto nel primo giro, quando le vecchie `C1`/`C2` trattenevano T2 oltre i 30 s                                                                                                                                                                                                |
| **`recordProductImportError` sui fallimenti veri**                                | resta, e marca per `shopifyProductId`: ora che gli import dello stesso prodotto sono serializzati e l'articolo è uno, marca l'articolo il cui import è fallito — non più quello sano di un'altra richiesta                                                                                                                                                                                                                                                                                    |
| **registro persistente dei rifiuti** (§10.3) e **§24**                            | aperti, separati, invariati                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **la suite di integrazione è instabile a suite piena**                            | tre giri completi il 09/09: il primo con 4 file rossi, il secondo con un hook, il terzo tutto verde (46 file, 737 prove). ⛔ **Non attribuito** — né alla catena già accertata di §21-bis né a questo blocco, che però ha cambiato il codice applicativo lo stesso pomeriggio e **non è escluso come concausa**. Le evidenze, coi messaggi verbatim e ciò che NON è stato conservato, sono in §21-bis, «Episodi del 09/09/2026». Le cinque prove di concorrenza sono state verdi in ogni giro |

### ⏸ 26 · APERTO — difetti e limiti RIPRODUCIBILI emersi dalla campagna del ciclo di utilizzo (09/09/2026)

> Rapporto: `docs/RAPPORTO-COLLAUDO-CICLO-UTILIZZO-09-09-2026.md`. Collaudo rieseguibile:
> `api/src/test/integration/collaudo-ciclo-utilizzo.integration-spec.ts` (piano, scenario M).
> ⛔ **Qui c'era «Nessun punto qui sotto è stato corretto».** Vale ancora per 26.1, 26.3, 26.5
> e 26.6; **26.2 e 26.7 sono stati chiusi insieme il 09/09/2026**, nel blocco autorizzato dal
> proprietario. Ognuno degli altri ha una riproduzione minima nel collaudo, e gli attesi NON
> sono stati ammorbiditi per farli passare.

| #        | Che cosa                                                                                                                                       | Dove si riproduce                                                                                                                                                           | Atteso (fonte)                                                                                                                                                                                   | Osservato                                                                                                                                                                                                                                                                                                                                                                                                                                           | Peso                                                                                                                                                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **26.1** | **un barcode DUPLICATO in arrivo da Shopify fa FALLIRE l'import di quel prodotto**                                                             | prova `D5` — rossa, e resta rossa                                                                                                                                           | «SKU duplicati o vuoti NON devono rompere il sync: si importano e si **segnalano**» (`regole-gestionale`, clausola di realtà); il piano, D5, lo estende al barcode                               | il `create` della variante cade sull'unicità `(tenant_id, barcode)`; il prodotto finisce in `failed` col messaggio **«Conflitto su SKU o codici prodotto»**, che nomina il campo sbagliato (`shopify-user-error.util.ts:117` mappa ogni `unique constraint` su quel testo). A 50 e 500 articoli: 1 prodotto per lotto, a ogni pull                                                                                                                  | ⚠️ **media**: un catalogo con un EAN ripetuto su due taglie non entra, e il messaggio manda a cercare uno SKU                                                                                                                                                                                                         |
| **26.2** | ✅ **CHIUSO il 09/09/2026** — l'esito del push lo dichiara il LAVORO, non una rilettura dello stato                                            | `S7`, ora **asserito**: `pushed: false`, `outcome: 'fallito'`, il motivo nel `detail`; `shopify-product-push.service.spec` (7 asserzioni riscritte)                         | `docs/24` §8.9.4: fallita **con motivo visibile** — e ora anche con un **esito veritiero**                                                                                                       | `executePushWork` restituisce un esito strutturato — `completato · parziale · rifiutato · fallito · gia_in_corso` — e `pushProduct` lo traduce senza rileggere lo stato del prodotto. `readProductSyncStatus` è stato **rimosso**: era la lettura che non poteva distinguere un successo con avvertimento da un fallimento, perché `markPushFailed` scrive `out_of_sync` proprio come il parziale. `enqueuePush` risponde `avviato`, non «riuscito» | chiuso; il contratto pubblico ha ora `outcome` e `detail`, e il dettaglio prodotto mostra il motivo del rifiuto invece di «verifica connessione e permessi»                                                                                                                                                           |
| **26.3** | **il push NON è atomico sul remoto**                                                                                                           | `S7` — registrato: `titoloRemotoDuranteGuasto: 'Titolo con guasto'`                                                                                                         | nessuna decisione: si registra                                                                                                                                                                   | quando `bulkUpdateVariants` fallisce, `updateProductCatalog` era già passato: titolo nuovo su Shopify, prezzi vecchi. Il tentativo successivo riallinea tutto                                                                                                                                                                                                                                                                                       | ℹ️ limite dichiarato; **§24** è il caso peggiore della stessa famiglia (creazione riuscita, locale fallito)                                                                                                                                                                                                           |
| **26.4** | ✅ **CHIUSO il 09/09/2026** — i MOTIVI dell'esclusione ora persistono                                                                          | `S6`: una riga per giro del lotto, per il prodotto escluso e per la variante esclusa; `divieto-ricreazione` B6a/B6c/B6d                                                     | §10.3, registro persistente dei rifiuti                                                                                                                                                          | `PlatformAuditLog` riceve `import_prodotto_rifiutato` / `import_variante_rifiutata`, `rifiutata`, attore `pull`/`webhook`, negozio, GID, regola per nome (B5–B6, «La registrazione persistente»)                                                                                                                                                                                                                                                    | chiuso; resta senza schermata. ⭐ Il rifiuto sul **push** esiste dal 09/09/2026 (26.7) e si registra: `riaggancio_rifiutato` e `ripubblicazione_rifiutata`, attore `push`                                                                                                                                             |
| **26.5** | **nessun percorso applicativo chiude un collegamento senza eliminare, né elimina definitivamente un articolo collegato**                       | `S5`, `S6` — situazioni **costruite** via SQL, come B5a e B6                                                                                                                | E2/E6 del piano; `docs/24` §11.1                                                                                                                                                                 | `delete()` rifiuta l'articolo collegato (voluto); la disconnessione non chiude i periodi                                                                                                                                                                                                                                                                                                                                                            | ℹ️ limite: le prove sul «collegamento chiuso» partono da uno stato che nessun utente può produrre oggi                                                                                                                                                                                                                |
| **26.6** | ⛔ **IMPLEMENTAZIONE MANCANTE di una decisione presa**: lo SKU rinominato su Shopify non arriva sulla variante già abbinata                    | `concorrenza-import` C2/C4 (nota nel test); S1 non lo asserisce                                                                                                             | §9.2: SKU **bidirezionale** — deciso, non da decidere (precisazione del proprietario, 09/09)                                                                                                     | il ramo di aggiornamento non riscrive `sku` (`variantSyncData` non lo contiene). ⚠️ Applicarlo incontra l'unicità `(tenant_id, sku)` e la regola di `resolveImportSku` (suffisso se preso): va progettato, non solo aggiunto                                                                                                                                                                                                                        | da implementare come blocco a sé; fino ad allora è una divergenza dichiarata fra codice e §9.2                                                                                                                                                                                                                        |
| **26.7** | ✅ **CHIUSO il 09/09/2026** per i percorsi di CATALOGO — import, push del prodotto e ripristino. ⚠️ Il push delle QUANTITÀ resta fuori (`E14`) | `collegamento-escluso` E1–E12 (nuova, 12 prove); `S8` con le osservazioni convertite in asserzioni; `B5a-bis`, `B6f`, `B6h`, `B6h-bis` aggiornate al comportamento superato | le due regole decise dal proprietario: un collegamento chiuso non autorizza **né una riapertura né il passaggio automatico di aggiornamenti attraverso la cache**; il rifiuto è **per variante** | import e push interrogano lo storico **prima** di usare un identificativo, con cache presente e assente; il ripristino allinea le cache incoerenti (pulizia, non protezione); ogni rifiuto è registrato con attore `push` o `webhook`. Le sette guardie sono state **falsificate** una per una: spenta ognuna, la prova che la copre torna rossa                                                                                                    | chiuso nel ramo; ⚠️ **residuo dichiarato**: né il riaggancio (§8.5.2) né «Pubblica nuovamente» (§11.9) esistono come comando, quindi un articolo rifiutato resta bloccato verso Shopify — accettato dal proprietario per il ramo non rilasciato, e dipendenza esplicita prima di presentare la funzione come completa |
| **26.8** | ✅ **CHIUSO il 09/09/2026** — il push delle QUANTITÀ interroga lo storico prima di usare un identificativo remoto                              | `collegamento-escluso` E14–E24 (undici prove), con `E14` trasformata da riproduzione del difetto in prova del comportamento corretto                                        | la stessa regola di 26.7: un collegamento chiuso non lascia passare aggiornamenti attraverso la cache                                                                                            | il difetto era misurato: con giacenza 7 e impegnata 2 la quantità **5 partiva** attraverso un collegamento chiuso, e nessun rifiuto veniva registrato. Ora la guardia sta **prima** del controllo «invariata» e prima di risolvere l'articolo di inventario: nessun invio, **nessuno zero al posto del rifiuto**, nessun «ultimo invio riuscito», e una riga `riaggancio_rifiutato` con attore `push`                                               | chiuso; il valore inviato resta `max(0, available)` e nessun calcolo di giacenza, impegno o sede è stato toccato                                                                                                                                                                                                      |

###### 26.7 — la dimostrazione COMPLETA (webhook e push), e il rimedio corretto (non applicato)

Sequenza (`S8`, due esecuzioni identiche): import di 4 articoli → backup → la variante S del
terzo viene eliminata dal percorso applicativo (identità esclusa, periodo `unlinked /
local_delete`) → ripristino del backup → **(i)** su Shopify quella variante prende il barcode
`8007777777770` → webhook `products/update`; **(ii)** in VestiFlow la riga tornata prende il
prezzo Shopify 123,45 → push; **(iii)** la cache della riga viene azzerata a mano (la
simulazione del «solo azzeramento») → push; **(iv)** sul quarto articolo si chiudono i periodi e
si azzera la cache di prodotto e varianti (situazione costruita) → push.

| Che cosa si guarda, INSIEME | (i) dopo il webhook                                           | (ii) push con la cache                    | (iii) push con la cache AZZERATA                                        | (iv) push, prodotto CHIUSO senza cache                                         |
| --------------------------- | ------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **anagrafica** (la riga)    | tornata dal backup, col barcode **nuovo**                     | invariata                                 | invariata                                                               | invariata                                                                      |
| **cache**                   | `990113` (quello del backup), prima e dopo                    | `990113`                                  | ⛔ **rimessa dal push a `990113`**: `linkOrphanVariants` abbina per SKU | ⛔ **nuovo GID**: il push ha **creato un prodotto remoto** (+1 sul simulatore) |
| **identità**                | esclusa (`variant_id` nullo, `local_deleted_at`)              | esclusa                                   | esclusa: il push NON la riaggancia, ma la cache la contraddice          | quella chiusa resta chiusa; ne nasce **una seconda**, viva                     |
| **periodi**                 | `[unlinked]`, nessuno nuovo                                   | idem                                      | idem                                                                    | ⛔ **un periodo attivo nuovo**, sulla seconda identità                         |
| **remoto** (simulatore)     | —                                                             | ⛔ **il prezzo 123,45 è sul GID vietato** | riscritto sul GID vietato                                               | **prodotto remoto duplicato**, con le sue varianti                             |
| **registro** (§10.3)        | ⭐ ora **1 riga** `riaggancio_rifiutato (identita_eliminata)` | nessuna: il push non registra             | nessuna                                                                 | nessuna                                                                        |
| **lo decide una regola?**   | ⛔ no, sull'aggiornamento; ✅ 2b sullo storico                | ⛔ no                                     | ⛔ no — ma §8.5.4 lo aveva già deciso per lo SKU su link chiuso         | ⛔ no: «creazione remota non prevista»                                         |

⭐ **La distinzione che conta**: «l'esclusione resta scritta» è vero — lo storico dice esclusa,
nessun percorso lo tocca, e dal 09/09 il webhook lo **registra** (`riaggancio_rifiutato`).
«L'esclusione viene rispettata dai percorsi operativi» è **falso su tutti e tre**: l'import
aggiorna la riga per cache; il push scrive sul GID vietato per cache; e tolta la cache, il
push **la rimette** — o, per il prodotto, **ne crea un'altra** con un prodotto remoto nuovo.

⛔ **Quindi il solo azzeramento della cache al ripristino NON basta** — misurato in (iii) e (iv):
la cache torna al primo push per corrispondenza di SKU/barcode/opzioni, e un prodotto senza
cache viene ripubblicato come nuovo. Il rimedio deve chiudere anche le due porte del push.

###### Due situazioni con DUE possibilità di ripresa diverse — precisazione del proprietario

|                                           | **Collegamento CHIUSO** (identità viva, anagrafica viva)                                            | **Identità ELIMINATA definitivamente**                                                                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| che cosa dice lo storico                  | il GID appartiene ancora a questa anagrafica, il periodo è chiuso                                   | il GID **non è riutilizzabile** (`docs/24` §7, §11.8): non appartiene più a nessuno                                                                                                                        |
| ripresa possibile                         | ✅ sì, **solo esplicita e autorizzata** (`docs/24` §8.5.2): riapre un periodo sulla stessa identità | ⛔ **no, mai su quel GID**. L'anagrafica tornata dal backup è, per lo storico, un articolo **nuovo**: se va su Shopify, ci va con un GID nuovo, per **decisione esplicita** («Pubblica nuovamente», §11.9) |
| che cosa NON è mai automatico             | riaprire il periodo · far passare dati per cache · ripubblicare                                     | riagganciare il GID escluso (per cache o per SKU) · ripubblicare                                                                                                                                           |
| che cosa autorizza il recupero dal backup | il **ritorno dell'anagrafica**, non del collegamento                                                | il ritorno dell'anagrafica, **non il riuso del GID escluso**                                                                                                                                               |

###### Il PERIMETRO di 26.7 — proposto il 09/09/2026, **approvato e IMPLEMENTATO** lo stesso giorno

> ✅ **Applicato per intero, insieme a 26.2.** Il testo qui sotto resta perché descrive i punti
> di codice e le alternative: dove diceva «da decidere», ora c'è la decisione presa; dove
> diceva «non applicato», c'è che cosa è stato scritto. Le quattro decisioni del proprietario,
> alla lettera:
>
> | #   | Decisione                                                                                                                                                                                                                                                                                                                                                                                                                              |
> | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | 1   | **rifiuto per VARIANTE**: se il collegamento del prodotto è valido si salta la sola variante esclusa e si prosegue; se è vietato il collegamento del prodotto, nessun aggiornamento remoto passa da lì. ⛔ **Non si estende agli errori tecnici né alle ambiguità di abbinamento**: quelli non vanno nascosti come normali esclusioni                                                                                                  |
> | 2   | **lo storico si rispetta nei percorsi operativi**: le cache incoerenti si allineano al ripristino, ma import e push controllano lo storico **prima** di usare un identificativo — la sicurezza non dipende dall'essere passati dal ripristino. ⚠️ **«Percorsi operativi» qui vuol dire CATALOGO**: import del prodotto, push del prodotto, ripristino. Il push delle **quantità** non è stato toccato, ed è verificato aperto da `E14` |
> | 3   | **nessun comando nuovo in questa tranche**: niente riaggancio, niente ripubblicazione, nessuna schermata. Il blocco temporaneo delle operazioni Shopify interessate è accettato nel ramo non rilasciato; catalogo locale, cassa, documenti e magazzino continuano a funzionare                                                                                                                                                         |
> | 4   | **esiti veritieri, anche dal pulsante reale**: avvio, completamento, aggiornamento parziale e fallimento sono distinti; un parziale non risulta interamente sincronizzato, e le varianti escluse sono riconoscibili col motivo                                                                                                                                                                                                         |

**1 · Che cosa deve vedere l'operatore — e i due casi NON sono lo stesso caso**

|                                   | **Collegamento CHIUSO** (identità viva, anagrafica viva)                                                                                         | **Identità ELIMINATA definitivamente**                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| che cosa dice lo storico          | il GID appartiene ancora a questa anagrafica; nessun periodo attivo                                                                              | il GID **non è riutilizzabile**: `local_deleted_at` valorizzato, `product_id`/`variant_id` a `NULL`                                                                                                    |
| ripresa                           | ✅ possibile: **nasce un periodo nuovo sulla stessa identità**, con un'**azione esplicita autorizzata** e un permesso applicativo (§8.5.2, §7.4) | ⛔ **impossibile su quel GID**, e non per scelta di codice: il trigger `…_immutabile` e la FK `…_identita_viva_fkey` la rifiutano ciascuno da solo                                                     |
| via d'uscita                      | riagganciare                                                                                                                                     | ⭐ **«Pubblica nuovamente su Shopify»** (§11.9): crea una **nuova** entità con **nuovi** identificativi, non ripara la vecchia, e chiede conferma se esiste una possibile corrispondenza creata a mano |
| che cosa l'operatore legge, oggi  | «questo articolo era collegato e il collegamento è chiuso: il canale non lo aggiorna finché non lo riagganci»                                    | «questo articolo è stato eliminato da Shopify: per rimetterlo in vendita va **ripubblicato**, e prenderà identificativi nuovi»                                                                         |
| ⛔ che cosa NON deve mai accadere | che un webhook o un push lo riaggancino **da soli**, per cache o per SKU                                                                         | che un push crei un prodotto remoto **come effetto collaterale**, o riusi il GID escluso                                                                                                               |

⚠️ **Nessuna delle due vie ha oggi un comando**: né il riaggancio (§8.5.2) né «Pubblica
nuovamente» (§11.9) esistono come azione dell'operatore. È la conseguenza da pesare al punto 4.

**2 · I punti di codice — il GID escluso non si usa né con cache presente né con cache assente**

| #   | Dove                                                                                                  | Oggi                                                                                                                                                                                      | Che cosa cambia                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **ripristino**, `TenantBackupImportService` dopo il reinserimento                                     | la riga torna col `shopify_product_id` / `shopify_variant_id` del backup, mentre l'identità è chiusa o eliminata                                                                          | per ogni identità **senza periodo attivo** o **eliminata**, azzerare la cache sulla riga reinserita che porta quel GID. La riga torna **com'è nel backup, ma scollegata**: nessun dato cancellato, storico intatto (2b resta vera)                                                                                                                                                     |
| B   | **import**, ramo di aggiornamento (`byShopifyVariantId`, e `existing` trovato per `shopifyProductId`) | la riga esclusa è `matched` **per cache** e viene aggiornata senza interrogare lo storico                                                                                                 | con A la riga non ha più cache e ricade nella guardia, che già rifiuta e **registra** (dal 09/09). ⚠️ Senza A questo punto resta aperto: è la scelta «cache autorevole» del punto 4                                                                                                                                                                                                    |
| C   | **push, cache PRESENTE**, `updateLinkedProductViaGraphql`                                             | `productGid` viene da `product.shopifyProductId`, e ogni `variant.shopifyVariantId` finisce negli `inputs` di `bulkUpdateVariants` → **scrive sul GID vietato** (misurato: prezzo 123,45) | prima di comporre gli input, interrogare lo storico su prodotto e varianti: identità chiusa o eliminata → non si scrive su quel GID                                                                                                                                                                                                                                                    |
| D   | **push, cache ASSENTE**, `linkOrphanVariants`                                                         | abbina per SKU → barcode → opzioni e **riscrive la cache** con `productVariant.update` → rimette il GID vietato (misurato)                                                                | prima di abbinare, scartare i candidati remoti il cui GID ha un'identità chiusa o eliminata. È il rifiuto che `docs/24` §8.5.4 chiede già («rifiuta se lo SKU risolve a un id remoto con link chiuso»), quindi **non è una regola nuova**                                                                                                                                              |
| E   | **push, prodotto senza cache**, ramo `else { createProduct }`                                         | un prodotto con identità chiusa o eliminata e senza cache viene **ripubblicato come nuovo**: +1 prodotto remoto, identità e periodo nuovi (misurato)                                      | prima di `createProduct`, interrogare lo storico **per l'anagrafica locale**: se ha una storia (identità chiusa o eliminata), il push ordinario **non crea**. ⚠️ Creare è giusto per un articolo **mai collegato** — quello è il caso normale, e non si tocca. Ciò che si vieta è la creazione come **effetto collaterale** di «Sincronizza», che §11.9 riserva a un comando esplicito |
| F   | ogni rifiuto di C, D, E                                                                               | resta nel log o non esiste                                                                                                                                                                | **riga di registro** `riaggancio_rifiutato`, attore `push`, con la correlazione dell'ingresso: l'infrastruttura esiste già dal 09/09, va solo estesa al push                                                                                                                                                                                                                           |

**3 · Le altre varianti valide, e che cosa risponde il push**

⛔ **Oggi il push si ferma tutto**: `linkOrphanVariants` lancia se anche una sola variante non
è abbinabile, e lo fa **prima** di `updateProductCatalog` — quindi non passa nemmeno il titolo.
⭐ **L'import ha già deciso il contrario**, ed è una decisione approvata: «il rifiuto è per
VARIANTE, non per prodotto» (B6d), il prodotto e le altre varianti si aggiornano.

| Alternativa                                           | Conseguenza                                                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) fermare tutto il push**                         | coerente col comportamento attuale di `linkOrphanVariants`, ma un articolo con dieci varianti buone e una esclusa non si aggiorna più su Shopify: prezzi e quantità restano indietro |
| **(b) saltare la variante rifiutata e proseguire** ⭐ | coerente con l'import e con B6d; le varianti valide arrivano, la esclusa no, e il rifiuto è registrato                                                                               |

⛔ **Qualunque delle due, l'esito dichiarato è oggi INAFFIDABILE, e qui 26.7 DIPENDE da 26.2**:
`markPushFailed` mette `out_of_sync` su un prodotto collegato, e `pushProduct` risponde
`pushed: false` **solo** se lo stato è `error`. Quindi:

- con **(a)**, il push fallisce ma `pushProduct` dice `pushed: true`;
- con **(b)**, il push riesce «in parte» e non esiste un modo per dirlo: oggi il risultato ha
  solo `pushed` e un `reason` da un elenco chiuso (`not_connected`, `missing_write_products_scope`,
  `archived`, `sync_disabled`, `not_linked`, `shopify_error`), in cui «una variante rifiutata»
  non c'è.

⭐ **Quindi 26.2 va chiuso prima o insieme**: senza, il rimedio di 26.7 sarebbe corretto nel
database e **muto per l'operatore** — cioè `docs/24` §8.9.4 («fallita con motivo visibile»)
resterebbe insoddisfatta proprio nel caso che 26.7 introduce.

**4 · Le decisioni — PRESE dal proprietario il 09/09/2026** (le altre erano già approvate: §8.5.2, §11.9, B6d, 2b, 3c)

| #   | Decisione                                                                 | Come è stata risolta                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **(a) o (b)** del punto 3: il push si ferma o salta la variante esclusa   | ⭐ **(b)**, coerente con l'import e con B6d. ⛔ Con un limite esplicito: **solo** per le esclusioni dello storico. L'ambiguità di abbinamento continua a lanciare, e `linkOrphanVariants` conserva il suo errore che nomina le varianti non abbinabili |
| 2   | dove si allinea la cache                                                  | ⭐ **entrambe, e non sono alternative**: il ripristino allinea (`allineaCacheIncoerenti`), ma è **pulizia**; la protezione sta nelle guardie di import e push, che reggono anche su un database dove nessuno è mai passato da un ripristino            |
| 3   | l'articolo resta bloccato finché non esistono i comandi di §8.5.2 e §11.9 | ⭐ **resta bloccato, consapevolmente**: nessun comando nuovo in questa tranche. ⚠️ È una **dipendenza dichiarata** prima di presentare la funzione come completa, non un residuo scoperto dopo                                                         |
| 4   | se 26.2 si chiude insieme a 26.7 o prima                                  | ⭐ **insieme**, come previsto: senza, il rimedio sarebbe stato corretto nel database e muto per l'operatore                                                                                                                                            |

**I test di accettazione — ESEGUITI il 09/09/2026**

⭐ Le riproduzioni sono state scritte **prima** del rimedio, in un file a sé
(`collegamento-escluso.integration-spec.ts`), e girate contro il codice non modificato: E1–E7
rosse, cioè il difetto riprodotto. Poi il rimedio, e le stesse prove verdi.

| #                                  | Prova                                                                                   | Che cosa tiene fermo                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1                                 | import, collegamento chiuso e **cache presente**                                        | il webhook **non** aggiorna il prodotto; nessuna riapertura; una riga `riaggancio_rifiutato (collegamento_chiuso)`                                                                                                                                                                                                                                                                          |
| E2                                 | import, **identità eliminata** e anagrafica ricomparsa con la cache                     | idem, con `identita_eliminata`                                                                                                                                                                                                                                                                                                                                                              |
| E3                                 | import, **una variante esclusa**, prodotto valido                                       | le **sorelle si aggiornano**, lei no: il rifiuto è per variante                                                                                                                                                                                                                                                                                                                             |
| E4                                 | push, collegamento del prodotto chiuso                                                  | **nessuna** scrittura remota (`updateProductCatalog`, `bulkUpdateVariants`, `createProduct` a zero); esito `rifiutato`; il motivo su `shopifyLastError`; riga di registro con attore `push`                                                                                                                                                                                                 |
| E5                                 | push, **una variante esclusa**                                                          | la sorella arriva (prezzo 88,88), l'esclusa resta a 10,00; esito **`parziale`**, `pushed: false`, e `shopifyLastError` **nomina lo SKU escluso**                                                                                                                                                                                                                                            |
| E6                                 | push **senza cache**                                                                    | il candidato vietato non si abbina, e **non se ne abbina un altro**: la cache resta nulla, lo storico invariato                                                                                                                                                                                                                                                                             |
| E7                                 | push di un prodotto con **storia chiusa e senza cache**                                 | **nessuna** creazione remota, nessuna identità nuova, nessun periodo attivo                                                                                                                                                                                                                                                                                                                 |
| E8                                 | ⭐ **limite** — storico vecchio chiuso, collegamento **attuale valido su un altro GID** | l'aggiornamento passa: import `updated`, push **non rifiutato**, scrittura sul GID nuovo. ⚠️ L'esito è `parziale` perché l'articolo si porta dietro le varianti del collegamento vecchio, che restano escluse: è la risposta vera                                                                                                                                                           |
| E9                                 | ⭐ **limite** — articolo **mai collegato**                                              | il push lo crea come sempre                                                                                                                                                                                                                                                                                                                                                                 |
| E10                                | ⭐ **limite** — connessione **non migrata** (nessun negozio)                            | import e push restano quelli di prima, e il registro resta vuoto: assenza di storico non è esclusione                                                                                                                                                                                                                                                                                       |
| E6-bis                             | ⭐ **il filtro DOPO la scelta, dimostrato**                                             | il candidato vietato si trova per SKU; accanto ce n'è uno **libero col barcode della variante esclusa**. Nessun riabbinamento alternativo, rifiuto registrato sul GID **vietato**, sorella aggiornata, esito `parziale`. ⚠️ L'ultima asserzione è quella che resta rossa anche se il filtro anticipato facesse **fallire** il push invece di agganciare la variante sbagliata               |
| E11–E12                            | l'**allineamento** delle cache al ripristino                                            | si azzerano solo le cache che lo storico non autorizza (chiuso, eliminato, GID di un altro); quella valida e quella **senza storia** non si toccano; lo storico non cambia                                                                                                                                                                                                                  |
| E13                                | 26.2 · il **costo** che non arriva                                                      | il catalogo arrivato resta riconosciuto (titolo e varianti scritti, i costi delle altre varianti partiti), il costo caduto resta visibile: esito `parziale`, stato non `synced`, messaggio che nomina la variante caduta. ⚠️ `reason: 'shopify_error'`, non `collegamento_escluso`: è un guasto tecnico, non una regola applicata                                                           |
| E14                                | ⛔ **verifica, non correzione**: il push delle QUANTITÀ                                 | riproduce 26.8: la quantità parte attraverso un collegamento chiuso                                                                                                                                                                                                                                                                                                                         |
| `product-detail.component.spec`    | 26.2 · il percorso del **pulsante**                                                     | avvio annunciato, poi il motivo vero a schermo senza «completata»; rifiuto immediato senza il messaggio della connessione; e il messaggio della connessione che resta per il caso che lo merita. ⛔ Le asserzioni leggono **il solo elemento del messaggio**: cercando il testo in tutta la pagina erano verdi per il motivo sbagliato — il pannello Shopify mostra a sua volta `lastError` |
| `S8`                               | le due sequenze del difetto originale                                                   | le osservazioni sono diventate **asserzioni**: cache allineata dal ripristino, barcode non arrivato, prezzo non finito sul GID vietato, cache non rimessa, nessun prodotto remoto nuovo                                                                                                                                                                                                     |
| `S7`                               | 26.2                                                                                    | `pushed: false`, `outcome: 'fallito'`, `detail` col motivo — era registrato e non asserito                                                                                                                                                                                                                                                                                                  |
| `B5a-bis`, `B6f`, `B6h`, `B6h-bis` | il **comportamento superato**                                                           | aggiornate dichiarando che cosa facevano prima e perché non vale più                                                                                                                                                                                                                                                                                                                        |

⭐ **Falsificazione — le sette guardie, una per una.** Spenta ognuna nel codice, la prova che la
copre torna **rossa**; poi il file è stato rimesso com'era.

```text
import, guardia del PRODOTTO          → E1, E2   ROSSE
import, guardia della VARIANTE        → E3       ROSSA
push, guardia del PRODOTTO            → E4       ROSSA
push, guardia della VARIANTE          → E5       ROSSA
push, filtro DOPO la scelta (orfane)  → E6       ROSSA
push, guardia della PUBBLICAZIONE     → E7       ROSSA
ripristino, allineamento delle cache  → E11, E12 ROSSE
propagazione del COSTO fallito        → E13      ROSSA
filtro spostato PRIMA del matcher     → E6-bis   ROSSA
ramo del rifiuto nel dettaglio        → pulsante ROSSA
```

⚠️ **Il quinto è quello che conta di più**, ed è la ragione per cui il filtro sta **dopo** la
scelta e non prima: togliendo il candidato vietato dall'elenco, `matchOrphanVariants`
ripiegherebbe **in silenzio** sul candidato successivo per barcode o opzioni — cioè
aggancerebbe la variante sbagliata invece di non agganciarne nessuna.

###### ✅ 26.9 — `available` è il valore canonico: VERIFICATO, e il canale ora lo legge

> **Domanda del 09/09/2026, prima di toccare il calcolo usato da Shopify: la colonna
> `inventory_levels.available` è mantenuta dal gestionale, o è una copia di cui non ci si
> può fidare?** L'obiettivo non era introdurre una seconda logica, ma far leggere lo stesso
> numero a schermata, invio e riconciliazione.

⛔ **Il difetto da chiudere era una DIVERGENZA POSSIBILE, non un numero sbagliato.** La
schermata Giacenze, la Situazione magazzino e l'elenco articoli leggono la colonna
`available`; il push e la riconciliazione ricalcolavano `onHand − committed`. Finché i due
coincidono nessuno se ne accorge — ed è esattamente la forma di difetto che questo progetto
combatte: due motori per la stessa grandezza, che il giorno che divergono non dichiarano
nessuno dei due sbagliato.

**La verifica.** Sette aree censite, ognuna con una seconda lettura indipendente incaricata di
confutare la prima. **Nessun verdetto ribaltato.** I punti che scrivono `inventory_levels` in
tutto il codice di produzione sono sei, e i tre campi dell'invariante li toccano solo le due
util centrali (`applyInventoryDelta`, `applyCommittedDelta`), che li muovono sempre insieme.
Nessun SQL grezzo. Elenco completo e prove in `docs/24` §10.5.

**Le prove sul database sacrificabile** — `invariante-disponibile.integration-spec`, 14 prove:

```text
I1–I5    carico · scarico sotto zero · impegno e rilascio · nascita della riga · incoming
I6       rollback DOPO le scritture: nessun dato e nessuna incoerenza
I7–I9    concorrenza: 12 delta insieme · giacenza e impegni mescolati · la nascita contesa
I10      export e ripristino: i livelli tornano com'erano, e coerenti
I11      la falsificazione del controllo: un'incoerenza costruita a mano viene vista
I12–I14  la sonda del numero canonico: quale colonna legge il canale
```

⭐ **Il controllo conta le righe incoerenti dell'INTERO tenant**, non guarda la riga in mano:
una riga sfuggita a un percorso che la prova non conosce la farebbe fallire lo stesso.

**Che cosa è cambiato nel codice.** `computeShopifyPublishableAvailable` riceve il Disponibile
e restituisce `max(0, available)`; push e riconciliazione leggono la colonna. Il parametro
`safetyStock` è stato rimosso (nessuno lo passava). Falsificato: rimesso il ricalcolo nel push
`I12` diventa rossa, nella riconciliazione `I13`, e tolto il clamp `I14`.

⚠️ **Distinto da 26.8, e la distinzione è il punto**: leggere il numero giusto **non** autorizza
a mandarlo attraverso un collegamento chiuso. Il push delle quantità continua a non
interrogare lo storico, `E14` continua a dimostrarlo, e quel difetto resta aperto.

###### Che cosa il censimento ha trovato per strada — candidati, non mandati

⚠️ Nessuno di questi rompe l'invariante, e nessuno è stato toccato. Si scrivono perché una
misura che resta in chat è una misura persa.

| #   | Osservazione                                                                                                                                                                                                                                                                                                                                                         | Dove                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| a   | ✅ **CHIUSO il 09/09/2026** — il ripristino non verificava la coerenza NUMERICA dell'archivio: una riga senza la chiave `available` nasceva con lo `0` di schema, incoerente e in silenzio. Ora `validateInventoryCoherence` rifiuta **prima della purga** (vedi sotto)                                                                                              | `tenant-backup-entities.util.ts`    |
| b   | **L'import CSV non è un punto di riconciliazione**: il numero del file atterra in modo assoluto sul Disponibile e il delta si applica a entrambi i campi, quindi con `committed > 0` la Giacenza non coincide col numero scritto nel file. L'invariante regge; l'intento «l'import ripara le giacenze» non è soddisfatto, e non risulta che sia l'intento            | `inventory-import.service.ts`       |
| c   | **Le intestazioni CSV `on hand (new)` / `on hand (current)` scrivono sul Disponibile**, mentre l'export chiama «Fisico» la Giacenza e «Disponibile» il disponibile                                                                                                                                                                                                   | `inventory-csv.util.ts`             |
| d   | **L'inventario fisico non porta la giacenza al valore contato** se qualcosa la muove fra apertura e chiusura: il delta è calcolato contro la fotografia presa all'apertura. L'invariante regge, la frase «porta al valore contato» no                                                                                                                                | `inventory-count.service.ts`        |
| e   | **`finalize` di una sessione può applicarsi due volte** se invocato due volte ravvicinate: il controllo di stato è fuori dalla transazione che scrive                                                                                                                                                                                                                | `inventory-count.service.ts`        |
| f   | **La nascita CONTESA di una riga di livello fa cadere una delle due transazioni** con `Unique constraint failed (variant_id, location_id)`: l'`upsert` di Prisma con `update: {}` non compila in un `INSERT … ON CONFLICT`. ⭐ Non lascia incoerenza — la transazione che cade fa rollback per intero — ma l'operazione va ripetuta. Misurato e tenuto fermo da `I9` | le due util centrali                |
| g   | **`setInventoryQuantities` (GraphQL) esiste e non ha chiamanti**: capacità predisposta, non collegata. Quando lo sarà, dovrà derivare il numero dalla stessa colonna, o nascerà un secondo motore di pubblicazione accanto a quello REST                                                                                                                             | `shopify-graphql.client.ts`         |
| h   | **`imported` del pull inventario è strutturalmente sempre 0**, e `updated` conta un Caso D in cui in locale non è cambiato niente. Il log dice «+N ~M»: numeri che suggeriscono un'importazione che non avviene                                                                                                                                                      | `shopify-inventory-pull.service.ts` |
| i   | **Un impegno orfanato non rompe l'invariante**, perché `committed` e `available` restano sbagliati insieme. È una famiglia di difetti che un controllo sull'invariante dichiarerebbe sana, e va cercata in un altro modo                                                                                                                                             | `order-reservations/`               |

###### ✅ 26.8 — le QUANTITÀ passano dallo storico, e la prova va nelle DUE direzioni

> **Il valore resta `max(0, available)`.** Nessun calcolo, nessuna giacenza, nessun impegno,
> nessun movimento, nessuna regola di sede è stata toccata: cambia solo **se** quel numero
> parte.

⛔ **Il difetto, misurato prima**: `pushLevel` risolveva l'articolo di inventario dalla
colonna-cache — o andava a leggerlo su Shopify partendo dal GID di variante — senza chiedere
niente allo storico. Una variante col periodo chiuso e la cache conservata riceveva comunque
la quantità, e nessun rifiuto veniva registrato.

⭐ **Dove sta la guardia, e perché lì.** Prima di usare qualunque identificativo remoto, e
**prima del controllo «invariata»**: la risposta a «posso usare questo collegamento?» non deve
dipendere dal fatto che il numero sia per caso uguale all'ultimo inviato, o la protezione
sarebbe intermittente per costruzione. È la stessa ragione per cui in 26.7 la sicurezza non
dipende dall'essere passati dal ripristino. ⚠️ **Costo dichiarato**: due letture in più su ogni
livello, comprese le moltissime che finiscono in `unchanged`. È il moltiplicatore per riga che
la pipeline C4 vuole togliere; toglierlo qui a scapito della verifica sarebbe il baratto
sbagliato.

⛔ **Il rifiuto non è uno zero.** Mandare `0` sarebbe una scrittura remota attraverso il
collegamento vietato, e per giunta toglierebbe dalla vendita un prodotto che nessuno ha chiesto
di ritirare. Non parte niente, non si registra nessun «ultimo invio riuscito», e la riga di
registro è `riaggancio_rifiutato` con attore `push`.

⛔ **Un guasto del registro non annulla l'operazione locale.** Il push inventario è
post-commit: la giacenza è stata scritta molto prima. Far risalire l'eccezione annullerebbe
un'operazione locale riuscita per un guasto di tracciamento. Il rifiuto resta valido — la
quantità non parte comunque — e il guasto si dichiara nel log come **errore**.

**Le prove** (`collegamento-escluso`, sezione delle quantità):

| #   | Che cosa tiene fermo                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| E14 | collegamento **chiuso** con la cache presente: nessun invio, nessuno stato sync, rifiuto registrato col GID di variante               |
| E15 | identità **eliminata**: stesso rifiuto, motivo diverso                                                                                |
| E16 | ⭐ il collegamento **valido continua a sincronizzare**, col numero giusto e l'anti-loop registrato                                    |
| E17 | ⭐ la **sorella valida parte** anche se la vicina è esclusa                                                                           |
| E18 | ⭐ **limite**: uno storico vecchio chiuso non blocca il collegamento attuale su un altro GID                                          |
| E19 | ⭐ **limite**: connessione **non migrata**, la quantità parte come prima e il registro resta vuoto                                    |
| E20 | identificativi **mancanti**: è `variant_not_linked`, non un rifiuto dello storico, e non si registra                                  |
| E21 | articolo di inventario **senza GID di variante**: rifiutato perché non verificabile                                                   |
| E22 | **isolamento**: il collegamento chiuso di un tenant non blocca l'altro, che porta lo stesso identificativo remoto nel proprio negozio |
| E23 | **registro guasto**: il rifiuto resta valido, non solleva, la giacenza locale è intatta                                               |
| E24 | il rifiuto **non dipende** dal fatto che la quantità sia invariata                                                                    |

⭐ **Falsificata nelle DUE direzioni**, che è ciò che il mandato chiedeva: non basta che non
parta ciò che è vietato.

```text
guardia SPENTA                        → E14 · E15 · E21 · E24   ROSSE
rifiuto sostituito da uno ZERO        → E14 · E15               ROSSE
guardia TROPPO LARGA (rifiuta tutto)  → E16 · E17 · E18 · E19 · E20  ROSSE
guardia che blocca le NON migrate     → E19                     ROSSA
```

⚠️ **Una falsificazione era debole e va detto**: la prima stesura del caso «troppo larga»
lasciava la guardia restituire `undefined` per un collegamento valido, quindi non bloccava
niente — `E17` restava verde per il motivo sbagliato. Riscritta forzando un rifiuto vero.

###### ✅ 26.10 — il RIPRISTINO ha un cancello sui numeri, non solo sulla struttura

> **Un archivio valido nella struttura ma con una giacenza che non torna viene rifiutato,
> prima della purga e di ogni scrittura.** Era il candidato (a) qui sopra, e non poteva
> restare aperto: dichiarare l'invariante protetto dai percorsi applicativi e insieme
> accettare un pacchetto che lo viola è una contraddizione, non una lacuna.

⛔ **Riprodotto prima**: un archivio esportato e riscritto con `available` a 7 su una riga
7 / 2 / 5 veniva **accettato** e ripristinato, e la stessa cosa succedeva togliendo del tutto
la chiave `available`.

⭐ **Dove sta il cancello e perché lì**: `validateInventoryCoherence`, chiamata subito dopo
`validateBackupReferences`, cioè prima della purga, prima degli upload e prima che si apra
una transazione. Un archivio rifiutato lascia il tenant **esattamente com'era** — e la prova
lo verifica confrontando una fotografia di tenant, prodotti, varianti e livelli.

⛔ **Non ricalcola, non azzera, non corregge.** Un archivio che non torna si rifiuta:
«sistemarlo» vorrebbe dire decidere quale dei tre numeri è quello vero, e dall'esterno un
Disponibile sbagliato e una Giacenza sbagliata hanno la stessa faccia.

⚠️ **Il messaggio nomina variante, sede e i numeri** — «Disponibile 7, atteso 5 (Giacenza 7 −
Impegnata 2)» — e le prime tre righe rotte, col totale: chi lo legge deve poter aprire il file
e guardare la riga giusta.

**Le prove** (`invariante-disponibile`, sezione `R`):

| #   | Caso                              | Atteso                                                   |
| --- | --------------------------------- | -------------------------------------------------------- |
| R1  | 7 / 2 / 5                         | accettato                                                |
| R2  | 7 / 2 / 7                         | rifiutato, nomina variante e sede, tenant e dati intatti |
| R3  | `available` assente               | rifiutato                                                |
| R4  | 2 / 5 / −3 (negativo coerente)    | accettato: il negativo è un fatto, non un errore         |
| R5  | archivi **v4** e **v3** legittimi | si ripristinano ancora                                   |

⭐ **Nessuna regola di conversione fra i formati, e la ragione è verificata**: `inventoryLevels`
esiste dal **v3** con la stessa forma (`TENANT_BACKUP_V3_ENTITY_FILES`), e l'export scrive
tutti gli scalari del modello. Il cancello non chiede niente che un archivio legittimo più
vecchio non abbia già. ⚠️ Se un giorno comparisse un formato in cui uno dei tre campi manca
per costruzione, quella sarebbe una regola di conversione: va decisa, non dedotta.

---

### ⏸ 27 · RICOGNIZIONE della sincronizzazione massiva e continua — 09/09/2026

> **Sola ricognizione**: nessuna implementazione, nessuna prova nuova eseguita, nessuna
> configurazione toccata. ⭐ **La PROPOSTA** — salvare prima nel gestionale, riepilogo, invio
> dopo conferma — sta nel punto canonico, `docs/24` **§8.10**, ed è **da valutare, non
> approvata**. Qui c'è lo **stato del codice** su cui quella valutazione si appoggia.
>
> ⛔ **I requisiti restano in `docs/24` §8.9** e non si ricopiano qui.
>
> ⚠️ **Metodo**: sei aree censite in parallelo, ognuna riletta da un secondo agente incaricato
> di confutarla. **Quattro confutazioni su sei hanno trovato errori veri**, e le voci qui sotto
> sono già corrette. Chi legge non deve fidarsi del censimento: deve fidarsi della correzione.

#### 27.1 · Che cosa ESISTE ed è collegato

| Cosa                                       | Nota                                                                                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Porta unica verso i canali**             | i servizi di dominio non iniettano mai i push Shopify direttamente: passano tutti da `ChannelSyncFacade`, che fa da cancello sul profilo del tenant                                                                                                        |
| **Push catalogo, un prodotto alla volta**  | `enqueuePush` è fire-and-forget vero: marca `syncing`, lancia il lavoro senza attenderlo, risponde «avviato»                                                                                                                                               |
| **Push quantità, una variante × una sede** | `pushLevels` è un ciclo sequenziale, non un lotto. Prima di ogni invio fa cinque letture più due per lo storico                                                                                                                                            |
| **Lotto in SCRITTURA per il CATALOGO**     | prezzi e varianti escono in **una** chiamata per prodotto ⚠️ mentre la disponibilità — la famiglia a cui §8.9.3 dà la **precedenza** — costa una chiamata per coppia. Il percorso che dovrebbe passare per primo consuma più quota per unità di variazione |
| **Regolatore di frequenza**                | esiste per negozio, con attesa calcolata, sia REST sia GraphQL. È **per processo**: con più repliche il margine osservato è di un'istanza, non del negozio                                                                                                 |
| **Riconciliazione delle quantità**         | il webhook in arrivo classifica in quattro casi e accende un marcatore di disallineamento. È **l'unico dato del progetto** che dica «ho guardato Shopify e ho visto un'altra cosa»                                                                         |
| **Riconciliazione degli ordini spariti**   | l'unico percorso che **confronta** stato locale e remoto invece di fidarsi di ciò che crede di aver inviato, con soglie che rifiutano di concludere su assenze di massa. ⭐ È la forma da guardare per il riepilogo di §8.10.3                             |
| **Idempotenza persistente RIUSABILE**      | `CreationIntent` è generica per costruzione, con rivendicazione prima degli effetti e un servizio di recupero collegato: la usano cassa e resi. ⛔ **Shopify non la usa**, in nessun punto                                                                 |

#### 27.2 · Che cosa MANCA

| Cosa                                                        | Conseguenza                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⛔ **coda persistente delle scritture**                     | l'**intenzione di inviare** non esiste come dato. Se l'API si spegne fra il commit locale e la conferma remota non resta niente da cui ripartire: §8.9.4 chiede tre stati, e «ancora da eseguire» oggi **non è rappresentabile** per nessuna operazione Shopify                                                                                                                                                                                                                                             |
| ⛔ **temporizzatore, worker, ripresa all'avvio**            | nessuna dipendenza di coda, nessuna pianificazione, nessun recupero all'avvio. L'unico ritentativo esistente gira **solo** se un operatore preme «Sincronizza inventario»                                                                                                                                                                                                                                                                                                                                   |
| ⛔ **sblocco dello stato «in corso»**                       | un push interrotto lascia il prodotto in `syncing`, e in quello stato il pull **scarta in silenzio** ogni webhook di quel prodotto. Nessun automatismo lo sblocca: serve che un umano risalvi o risincronizzi quell'articolo                                                                                                                                                                                                                                                                                |
| ⛔ **chiave di idempotenza sulla CREAZIONE remota**         | un guasto fra la creazione su Shopify e la scrittura del legame locale lascia il prodotto remoto **senza traccia** in VestiFlow: al push successivo la guardia non trova l'identità e ne crea un **secondo**. È il caso che quella guardia esiste per impedire, e da questa porta le sfugge                                                                                                                                                                                                                 |
| ⛔ **gestione del lavoro pendente e RECUPERABILE**          | ⚠️ **Correzione del 09/09/2026**: qui c'era «un invio caduto non lascia nessuna traccia». **Non è vero per il catalogo**, che conserva stato ed errore sul prodotto (`shopifySyncStatus`, `shopifyLastError`) e li mostra nella scheda. Ciò che manca è un elenco del lavoro **pendente e recuperabile**: un invio caduto non entra in nessuna coda, non si ritenta da solo, e per le **quantità** non lascia traccia affatto — il marcatore di disallineamento si accende **solo** da un webhook in arrivo |
| ⛔ **marcatore «modificato e non inviato» per il catalogo** | il confronto fra le date non lo sostituisce: entrambe le date le muove la sincronizzazione stessa, e la modifica di una variante non tocca la data del prodotto                                                                                                                                                                                                                                                                                                                                             |
| ⛔ **misura**                                               | zero cronometri in tutta l'API. Nessun tempo, nessun contatore di arretrato, nessuna traccia: §8.9.2 chiede di misurare sui **picchi**, e oggi non c'è niente da leggere                                                                                                                                                                                                                                                                                                                                    |
| ⛔ **comandi di RIAGGANCIO e RIPUBBLICAZIONE**              | `docs/24` §8.5.2 e §11.9 li descrivono, il codice **manda l'operatore a usarli** nei messaggi di rifiuto, e nell'interfaccia **non esistono**. Un articolo col collegamento escluso resta disallineato con scritto di usare un comando che non c'è                                                                                                                                                                                                                                                          |
| ⛔ **colonna CSV «Sincronizza con Shopify»**                | non esiste né in export né in import; l'import non passa dal servizio che onorerebbe il campo, quindi ogni prodotto importato nasce **sincronizzato** e viene accodato subito. Una colonna aggiunta a mano viene **scartata in silenzio**                                                                                                                                                                                                                                                                   |
| ⛔ **lettura del registro dei rifiuti**                     | le righe si scrivono e nessun endpoint né schermata le legge                                                                                                                                                                                                                                                                                                                                                                                                                                                |

#### 27.3 · Quattro cose che il censimento aveva scritto male, e che la confutazione ha corretto

⭐ **Si scrivono perché sono i punti in cui un lettore frettoloso concluderebbe l'opposto.**

| #   | La correzione                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **«Riallinea le giacenze su Shopify» non è un riallineamento in lettura: è oggi la più grande sorgente di scritture remote dell'applicazione, e senza tetto.** Ogni livello divergente fa partire un invio non atteso, uno per livello, mentre il ritentativo che gira in coda ne ha 50. ⚠️ Il picco peggiore non è un salvataggio umano: è questo pulsante                                                                                                                                                                                                                                                                           |
| 2   | **Il ritentativo dei disallineamenti, nel suo caso tipico, non ripubblica niente e dice di aver finito.** Il caso che accende il marcatore non aggiorna il valore «ultimo inviato», e il push si ferma prima di partire perché quel valore coincide con quello da mandare. Il contatore delle riuscite conta ogni chiamata che non ha sollevato, quindi l'arretrato risulta **sotto-riportato**: l'errore va nella direzione «sembra meglio di com'è». ✅ **Chiusa in due tempi**: il conteggio da §27.5, la ripubblicazione da §27.6 — che porta con sé un **limite dichiarato**, da leggere prima di considerare la voce archiviata |
| 3   | **Il pulsante «Sincronizza con Shopify» del dettaglio è fire-and-forget**, nonostante il commento della porta unica dichiari che l'esito torna al chiamante: risponde «avviato» prima che il lavoro sia fatto. L'unico invio davvero atteso è l'archiviazione a interruttore spento                                                                                                                                                                                                                                                                                                                                                   |
| 4   | ⚠️ **Corretto il 09/09/2026, era detto troppo forte.** Un import con fallimenti **mostra già un avviso**: il messaggio non è di successo. Il difetto è che quell'esito è **rappresentato male** su tre fronti: il messaggio dice «importato con N errori» anche quando non è entrato **niente**; il timbro di fine sincronizzazione viene dato **comunque**; e quel timbro **cancella anche gli errori** della connessione. ⛔ E il contatore dei prodotti **saltati** esiste nel contratto e non viene mai mostrato: con 50 importati e 50 saltati il messaggio è di pieno successo                                                  |

⛔ **Nessuna di queste quattro è un mandato**: sono misure, e la correzione è un blocco a sé.

#### ✅ 27.5 — gli ESITI dei comandi massivi dicono la verità (blocco chiuso il 09/09/2026)

> **Perimetro**: solo la rappresentazione dell'esito. ⛔ Nessuna coda, nessuna sospensione
> delle importazioni, nessun ridisegno dei pulsanti, e **il criterio d'invio del push non è
> stato toccato**.

**Il ritentativo delle quantità** distingue ora quattro classi che prima erano una sola:

| Classe           | Significato                                                 | Ritentare serve?                     |
| ---------------- | ----------------------------------------------------------- | ------------------------------------ |
| **ripubblicata** | invio confermato, la quantità è partita                     | —                                    |
| **nessun invio** | il push non aveva niente da mandare, o mancava un requisito | no                                   |
| **rifiutata**    | lo storico vieta quel collegamento (26.8)                   | ⛔ no: si riaggancia, non si ritenta |
| **fallita**      | il canale ha rifiutato o non ha risposto                    | ✅ sì                                |

⛔ **Non si conta più una chiamata come riuscita solo perché non ha sollevato**: `pushLevel`
cattura i propri errori e li restituisce, quindi contare la chiamata invece dell'esito rendeva
la misura falsa nella direzione peggiore, «sembra meglio di com'è». ⭐ E l'arretrato si
**riconta** invece di dedurlo per sottrazione: è l'unico numero che corrisponde a ciò che resta
davvero da risolvere.

**L'import del catalogo** distingue cinque casi — vuoto, interamente fallito, parziale, di soli
saltati, riuscito — e il **timbro di fine sincronizzazione non è più incondizionato**: un lotto
in cui non è entrato niente non marca la connessione come sincronizzata e **non cancella
l'errore precedente**. ⚠️ Il metodo condiviso `touchSync` **non è stato toccato**: lo chiamano
anche gli import di giacenze, clienti e vendite, e cambiarlo avrebbe cambiato il significato del
timbro per tutti. Qui si decide soltanto **se** chiamarlo.

**A schermo** i saltati si vedono, con il loro numero, e **non sono chiamati errori**: sono
prodotti che una regola ha escluso, e mandare l'operatore a cercare un guasto sarebbe sbagliato
quanto tacerli.

##### La falsificazione del blocco 27.5

```text
si conta la CHIAMATA invece dell'esito   → V1 · V2 · V4   ROSSE
il rifiuto confuso con un fallimento     → V2 · V4        ROSSE
il timbro torna incondizionato           → V5             ROSSA
il timbro non si dà mai (troppo largo)   → V6             ROSSA
l'arretrato torna una sottrazione        → V4             ⚠️ VERDE — poi chiusa da §27.6
```

⚠️ **L'ultima riga era un limite dichiarato**: in una passata sequenziale l'arretrato ricontato
e quello sottratto danno lo stesso numero, e nessuna prova li distingueva. ⭐ **Chiusa il
09/09/2026 dalla prova `V10`** (§27.6), che riproduce la concorrenza in modo deterministico
invece di aspettarla.

#### ✅ 27.6 — il RECUPERO del disallineamento delle quantità (blocco chiuso il 09/09/2026)

> **Autorizzato dal proprietario con una precisazione**: deve correggere un disallineamento
> **ancora valido**, non introdurre un invio incondizionato. ⛔ Nessuna coda persistente,
> nessuna colonna CSV, nessuna sospensione massiva, nessun ridisegno, nessuna migration.

**Il caso.** «Disponibile uguale all'ultimo inviato, ma Shopify osservato diverso». Il push si
fermava prima di partire perché il numero da mandare coincideva con l'ultimo inviato — ed è
proprio l'«ultimo inviato» che il disallineamento mette in dubbio.

##### La forma: due porte pubbliche, un solo corpo

| Porta                                                          | Chi la usa                                                                        | La scorciatoia dell'«invariata»                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pushLevel` — push **ordinario**                               | documenti, movimenti, riconciliazione, porta unica dei canali (quattro chiamanti) | ⭐ **la conserva**: lì la domanda è «è cambiato qualcosa da mandare?», e la risposta è l'ultimo inviato |
| `ripubblicaDisallineamento` — percorso **interno di recupero** | **solo** il ritentativo delle quantità                                            | ⛔ la supera, ma **solo dopo** tre rivalutazioni nuove                                                  |

⛔ **Non esiste nessun modo di chiedere un invio forzato**: nessun parametro, nessun campo di
richiesta, nessuna rotta. La firma del push ordinario **non è cambiata**, quindi nessun
chiamante può accendere il recupero nemmeno per sbaglio.

##### Che cosa NON supera

Tutte le guardie che stanno prima restano dove sono, e sono quelle che contano: connessione,
scope `write_inventory`, **interruttore «Sincronizza con Shopify»**, sede mappata, livello
esistente, **storico 26.8**. E il valore inviato resta `max(0, available)`: nessuna quantità
locale, nessun movimento, nessuna regola di rinvio è stata toccata.

##### Le tre rivalutazioni nuove — «una selezione precedente non è un'autorizzazione permanente»

| #   | Domanda                                                                                                   | Se la risposta ferma l'invio                                                              |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | il marcatore è **ancora acceso**? Fra la lettura della coda e questa riga possono passare decine di righe | nessun invio                                                                              |
| 2   | l'ultima osservazione dice che Shopify porta **già** il numero che si manderebbe?                         | nessun invio ⚠️ e il marcatore **non** si spegne: quello è mestiere della riconciliazione |
| 3   | è sopravvenuto un **rinvio** (Caso C)?                                                                    | nessun invio, e la riga resta in coda                                                     |

⭐ **Il rinvio si chiede alla riconciliazione, che è la sola a possedere quella regola**
(`rinvioAttivo`, estratto dal predicato che già stava dentro il Caso C). Riscriverlo nel
ritentativo avrebbe prodotto due definizioni dello stesso rinvio, destinate a divergere.

##### ⛔ Il pericolo era reale, e non era dove sembrava

Il ramo differito della riconciliazione **non spegne un marcatore già acceso**: esce prima di
qualunque scrittura. Quindi un disallineamento vecchio resta in coda anche dopo che un evento
successivo ha fatto deliberare un rinvio, e senza la rivalutazione n. 3 il ritentativo avrebbe
calpestato quel rinvio **entro la stessa chiamata HTTP** — perché nell'unico chiamante di
produzione la riconciliazione di tutti i livelli gira **pochi secondi prima** del ritentativo.
Non un incidente di tempistica raro: una volta per passata, per ogni coppia con traffico
Shopify in corso.

⚠️ **E `pushLevel` non ha mai consultato gli impegni**: il rinvio non era «protetto e poi
scavalcato», non era rivalutato **da nessuna parte** del percorso d'invio. Per le righe con
valore diverso dall'ultimo inviato il ritentativo lo ignorava già oggi — questo blocco lo
chiude per tutte le righe che passano dal recupero, non solo per quelle che sblocca.

##### Le prove — sette nuove, tutte di integrazione con Shopify simulato

| Prova | Che cosa fissa                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `V1`  | il caso canonico **parte**: valore attuale inviato, remoto simulato aggiornato, arretrato a zero                                                                    |
| `V8`  | disallineamento pendente → evento che richiede il rinvio → ritentativo: **nessun invio**. Gli stati li produce la **riconciliazione vera**, non sono scritti a mano |
| `V9`  | disallineamento già risolto (Shopify porta già quel numero): nessuna ripubblicazione inutile                                                                        |
| `V10` | un altro pendente si risolve **durante** la passata: riconta 0, sottrazione 1                                                                                       |
| `V11` | collegamento escluso **nel sottoinsieme che il recupero sblocca**: rifiuto, e nemmeno zero                                                                          |
| `V12` | «Sincronizza con Shopify» spento, stesso sottoinsieme: nessun invio                                                                                                 |
| `V13` | guasto remoto: nessuna falsa riuscita, nessun «ultimo invio riuscito», problema ancora in coda                                                                      |
| `V14` | seconda passata senza nuove divergenze: non ripete l'invio                                                                                                          |
| `V15` | ⭐ la porta **ordinaria**, sullo stesso identico stato, **non** supera il confronto — col controllo inverso sulla porta di recupero, che invece manda               |

##### ⚠️ La suite di integrazione NON gira al `pre-push`, e le prove sopra da sole non fanno da guardia

Misurato: `test:everything` esegue copertura, componenti, **API unitaria** e guardie —
`test:integration` ha una configurazione a parte e **non è nella catena**. Le prove `V1..V15`
dimostrano il comportamento sul database vero, ma non fermerebbero nessuno.

Per questo il rimedio è ancorato **anche** dove il cancello passa:

| Dove                                                                   | Che cosa fissa                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **sette prove unitarie** su `shopify-inventory-push.service.spec.ts`   | il sorpasso, le tre rivalutazioni, l'interruttore, il guasto — e che la porta **ordinaria**, sullo stesso stato, non manda                  |
| ⭐ **`npm run check:ripubblicazione-interna`** (dentro `npm run lint`) | che la porta di recupero abbia **un solo chiamante** applicativo e che la bandiera che supera il confronto si accenda **da una porta sola** |

⛔ **La guardia è stata falsificata a sua volta**, perché una guardia mai vista fallire non
dimostra niente: accendere la bandiera nel push ordinario, spegnerla nel recupero, riportare il
ritentativo alla porta ordinaria e aggiungere un secondo chiamante la fanno **rossa** in tutti e
quattro i casi.

##### Che cosa ha corretto la revisione avversariale, dopo il verde

⭐ **Quattro lenti indipendenti incaricate di smentire il lavoro**, non di confermarlo. Hanno
trovato cose vere:

| Trovato                                                                                                                                                                      | Corretto                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ⛔ il vincolo «solo nel percorso di recupero» **non era falsificato da niente**                                                                                              | `V15` più la guardia più le prove unitarie                                                  |
| ⛔ `V4` nominava come guasta la variante **sbagliata**: il guasto colpisce la prima chiamata, non l'ultima riga                                                              | nomi corretti e **attribuzione riga per riga** asserita, non solo il conteggio delle classi |
| ⛔ due commenti dicevano il **contrario** di ciò che questo lavoro aveva appena fatto — «la riconta non è falsificata da nessuna prova» e «il criterio d'invio non si tocca» | riscritti entrambi                                                                          |
| ⚠️ l'ordine della coda si affidava a `updatedAt`, che Prisma scrive **dal client al millisecondo**: due righe di seguito possono coincidere                                  | `segnaDisallineata` **fissa** la posizione in coda                                          |
| ⚠️ «valore remoto aggiornato» non era verificato: il negozio simulato registrava le chiamate, non lo **stato**                                                               | il simulato ora porta una quantità, e «mai toccata» si distingue da «messa a zero»          |
| ⚠️ la classe «nessun invio» accorpa otto motivi, e nessuna prova guardava il **motivo**                                                                                      | `V8`, `V9`, `V12` asseriscono il motivo esatto                                              |

⚠️ **Due segnalazioni erano attribuzioni sbagliate**: il cambio del numero pubblicato e quello
del contratto dell'esito sono del blocco **27.5** e di 26.9, non di questo — il confronto era
fatto con l'ultimo commit, che precede entrambi.

⚠️ **Quattro erano VERDI anche prima del rimedio** — `V8`, `V9`, `V11`, `V12` — e per una
ragione che stava per sparire: la scorciatoia le fermava prima. Il loro valore è tutto nella
falsificazione, ed è dichiarato nel file di prova invece che lasciato intendere.

⚠️ **`V4` è stata corretta, non adattata**: la sua riga «nessun invio» era costruita come il
caso `V1`, che ora parte. Lasciata com'era avrebbe misurato il contrario di quello che dice.

##### La falsificazione — dieci guasti sul codice, quattro sulla guardia, tutti presi

```text
la scorciatoia torna a valere anche nel recupero      → V1 V8 V13 V14 V15
anche la porta ORDINARIA supera il confronto          → V15    ⭐ il vincolo del mandato
il recupero non rivaluta il RINVIO                    → V8
il recupero non verifica se il disallineamento vale   → V4 · V9
il recupero eredita la selezione invece di rileggere  → V10
la guardia dello storico 26.8 salta                   → V2 · V4 · V11
l'interruttore «Sincronizza con Shopify» non si legge → V12
l'arretrato torna una sottrazione                     → V10    ⭐ prima era VERDE
si conta la CHIAMATA invece dell'esito                → V2 V4 V8 V9 V10 V11 V12 V13
il rifiuto confuso con un fallimento                  → V2 · V4 · V11

la bandiera si accende nel push ordinario             → guardia ROSSA
la bandiera si spegne nel recupero                    → guardia ROSSA
il ritentativo torna alla porta ordinaria             → guardia ROSSA
compare un secondo chiamante applicativo              → guardia ROSSA
```

⭐ **Le due falsificazioni del timbro (`V5`, `V6`) sono state rieseguite** e continuano a
prendere il guasto.

⚠️ **Il primo tentativo di rieseguirle diceva «punto di guasto NON TROVATO», e non era vero**:
`grep -q $'\r'` aveva risposto «solo LF» su un file che in quel punto è **CRLF**. È il guasto
muto che questo repository ha già registrato — una sostituzione con `\n` non trova niente e
**si legge come una falsificazione che non prende**, cioè la conclusione opposta.

##### ⛔ IL LIMITE, e va letto: lo stato su disco NON dice che cosa è successo

> **Il sottoinsieme che il recupero sblocca è quello in cui il Disponibile NETTO è fermo
> dall'ultima pubblicazione riuscita. Non è la stessa cosa che «non è successo niente».**

⛔ **Qui c'era «coincide con quello in cui VestiFlow non ha registrato nessun movimento», ed
era sbagliato** — corretto il 09/09/2026 su indicazione del proprietario. **Disponibile
invariato non dimostra assenza di movimenti**: variazioni opposte si compensano. Una vendita
di due pezzi e un carico di due pezzi lasciano il Disponibile identico, e i movimenti ci sono
entrambi.

⚠️ **L'errore non è di dettaglio: cambia la diagnosi.** Da «lo stato coincide con l'assenza di
movimenti» discenderebbe che basta guardare il Disponibile per sapere se c'è stato uno scarico
— e non è così. Lo stato è **compatibile** con almeno queste storie, e nessuna colonna del
disallineamento dice quale sia:

```text
Shopify abbassato a mano                 →  VestiFlow ha ragione  →  ripubblicare è il rimedio
una vendita di canale non scaricata      →  SHOPIFY ha ragione    →  ripubblicare è sovravendita
movimenti che si compensano              →  nessuno dei due è in errore sul netto
più cause insieme, nello stesso periodo  →  il netto non le separa
```

⭐ **E ne discende una regola di metodo per il blocco successivo**: se una vendita di canale
sia stata scaricata **si chiede ai movimenti e agli impegni**, non al Disponibile. Il
Disponibile è un saldo, e un saldo non racconta la storia che lo ha prodotto.

La causa da verificare è documentata in `ORDINI-CANALE-ESTERNO.md`: un ordine di canale che
nasce **già evaso** (la cassa Shopify con «Mark as fulfilled») non crea impegni e non produce
scarico, quindi il Caso C non scatta e il disallineamento finisce in Caso D.

✅ **La ricognizione mirata è stata fatta il 09/09/2026**, in sola lettura, e vive in
`ORDINI-CANALE-ESTERNO.md` → «RICOGNIZIONE MIRATA — 09/09/2026». ⛔ **Ne esce una correzione a
questa stessa sezione**: «se una vendita di canale abbia prodotto uno scarico» **è memorizzato**
— `OnlineSale.inventoryStatus`, il movimento con `sourceDocumentType = online_sale` e il vincolo
unico per riga. Quello che manca è un piano più sotto: **se quella vendita debba incidere sulle
giacenze di questa gestione**.

⏸ **E quella è una decisione APERTA, non solo non eseguita.** `docs/02` §4.6-4.7 la dava per
presa; `docs/24` §0-bis (02/09/2026) e §12.0 (07/09/2026) la **riaprono**, e §12.9 marca lo
stesso contenuto come «proposta precedente, non una decisione». Non sono scenari diversi: è lo
stesso, e divergono su **stato** e **portata** — il raccordo per esteso sta in
`ORDINI-CANALE-ESTERNO.md` §1. ⛔ I due documenti **non sono stati armonizzati**: la divergenza
è registrata, non risolta.

⚠️ **La scorciatoia che questo blocco supera stava contenendo quel buco per caso.** Non per
disegno: nessuno l'aveva scritto, e il documento sosteneva l'opposto — che a trattenerlo fosse
il Caso C. Nel caso a valori uguali il Caso C non c'entra: a trattenere era il confronto con
l'ultimo inviato. ⭐ Corretto anche là.

**Che cosa si è fatto, non potendo distinguere le storie:**

- il **rinvio** si rivaluta, e copre la parte di rischio che ha un impegno a spiegarla;
- l'invio che **alza** la quantità su Shopify — il verso che può rimettere in vendita merce
  già uscita — scrive un **avviso nominato** nel registro, con la coppia e i due numeri.

⛔ **L'avviso è una TRACCIA, non una giustificazione** — precisato dal proprietario il
09/09/2026: «l'avviso nel registro non rende attendibile una quantità né autorizza da solo a
rialzarla». Serve a non propagare l'errore in silenzio, e non trasforma un invio incerto in un
invio legittimo. Chi legge questa sezione fra sei mesi non deve concluderne che il verso
ascendente sia stato sdoganato: è **tollerato per il solo ritentativo manuale**, ed è la
ragione per cui il percorso automatico è rimasto fuori.

⏸ **Le decisioni che restano al proprietario**, e nessuna appartiene a questo blocco:

1. **restringere il recupero al solo verso discendente** (ripubblicare solo quando Shopify
   mostra **più** di VestiFlow). Toglierebbe il rischio di **sovravendita** — ⛔ e metà del
   rimedio: il caso `V1` autorizzato è proprio in verso opposto;
2. **estendere il recupero al percorso automatico** del Caso D. ⛔ Non autorizzato: renderebbe
   automatico un invio che questa stessa sezione dichiara incerto;
3. **chiudere il buco alla radice**, registrando lo scarico degli ordini di canale nati già
   evasi. È l'unica strada che rende la ripubblicazione sicura invece che ragionevole, e non è
   un lavoro di sincronizzazione: è del ciclo di vita degli ordini. ⚠️ **E non si fa
   scaricando tutto ciò che arriva già evaso**: una vendita storica già compresa nelle giacenze
   iniziali verrebbe scaricata due volte.

⚠️ **Una misura non fatta, e si può fare in sola lettura**: quante righe hanno oggi il
marcatore acceso, e con quale verso. È il dato che direbbe se il rischio è di due righe o di
duecento.

##### Che cosa questo blocco NON ha risolto

⛔ **Il rimedio agisce solo quando l'operatore preme «Sincronizza inventario».** La
ripubblicazione **immediata** che parte a ogni Caso D passa ancora dalla porta ordinaria
(`shopify-sync.service`), quindi nel caso canonico continua a non mandare niente. Non è una
dimenticanza: il mandato dice «circoscritto al **ritentativo**», e portare il recupero sul
percorso automatico significherebbe scrivere sul canale a ogni webhook, in uno stato che il
limite qui sopra dichiara ambiguo. ⏸ **È una decisione, non un lavoro.**

⛔ Un **rinvio trattenuto** resta in coda a ogni passata, e a schermo si legge «senza invio»:
il rinvio non ha una classe sua nell'esito, e distinguerlo cambierebbe il contratto fino alla
schermata. ⛔ Un **marcatore stantio** (`V9`) non viene spento dal ritentativo: lo spegne la
riconciliazione al webhook dopo.

⚠️ **Tre cose che la revisione ha trovato e che questo blocco non tocca**, tutte preesistenti:

- il rinvio si rivaluta sull'**ultima osservazione memorizzata**, non su una lettura fresca del
  canale: metà del predicato è per costruzione vecchia quanto l'ultimo webhook;
- le righe **permanentemente bloccate** (livello assente, collegamento escluso) restano in
  testa alla coda, che è ordinata dalla più vecchia: oltre le cinquanta, affamano le altre;
- il `try` copre anche le scritture **dopo** l'invio riuscito: se `recordSuccessfulPush`
  cadesse, l'esito direbbe «fallita» su una quantità partita davvero — e ora la passata
  successiva la rimanderebbe, invece di fermarsi su «invariata».

⚠️ **E lo stesso difetto di 27.5 sopravvive su un altro comando**: il recupero degli **ordini
mancanti** chiama il push inventario e **butta via l'esito** (`shopify-missing-orders.service`,
`await this.inventoryPush.pushLevel(...)` senza assegnazione). Una riga rifiutata o non
inviata è lì indistinguibile da una riuscita. ⛔ Fuori dal perimetro di questo blocco: si
segnala, non si corregge di iniziativa.

⛔ **La coda persistente e la deriva delle chiavi esterne restano dove sono** (§21-ter): questo
blocco non le tocca.

#### ⏸ 27.7 · PERIMETRO DEL CHECKPOINT LOCALE — preparato il 09/09/2026, non eseguito

> ⛔ **Nessun commit è stato fatto.** L'autorizzazione sarà separata, e **non significherà
> rilascio**. Qui c'è solo il perimetro, perché al momento dell'autorizzazione non si debba
> ricostruirlo a memoria.

##### Che cosa c'è nell'albero, e perché non è un commit solo

L'albero porta **98 percorsi** — 53 modificati e 45 non tracciati — accumulati da più blocchi
consecutivi mai committati. `regole-qualita` chiede che **ogni commit sia un albero valido e
verificato**, quindi il checkpoint va spaccato per argomento, non appiattito:

| #   | Argomento                                                  | Nucleo                                                                                                                                                  |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Storico dei collegamenti** (26.7, 26.8)                  | `shopify-link-history.service`, `shopify-shop-identity.service`, le guardie di import/push/ripristino, le migration dello storico                       |
| 2   | **Registro dei rifiuti §10.3**                             | `api/src/common/audit/`, le tre migration `*_rifiutato`, `check-registro-append-only`                                                                   |
| 3   | **Cestino prodotti e cancellazione tenant**                | `product-trash.util`, `trash-product.dto`, `tenant-delete.util`, `admin-tenants.*`                                                                      |
| 4   | **Ripristino e backup compatibili con lo storico**         | `tenant-backup-*`, la migration del ripristino                                                                                                          |
| 5   | **`available` canonico e cancello numerico** (26.9, 26.10) | `shopify-publishable-available.util`, push e riconciliazione inventario                                                                                 |
| 6   | **Esiti veritieri dei comandi massivi** (27.5)             | `shopify-inventory-republish.service`, `shopify-product-pull.service`, il DTO e il messaggio a schermo                                                  |
| 7   | **Recupero del disallineamento** (27.6)                    | `shopify-inventory-push.service`, `shopify-inventory-reconciliation.service`, `check-ripubblicazione-interna`, `esiti-comandi-massivi.integration-spec` |
| 8   | **Documentazione**                                         | `docs/`                                                                                                                                                 |

⚠️ **6 e 7 toccano gli stessi file e vanno nell'ordine**: prima gli esiti, poi il recupero —
il secondo si appoggia alle quattro classi del primo.

⚠️ **`docs/RIPRESA-03-09-2026.md` resta NON TRACCIATO e intatto**: è un appunto di ripresa, non
un documento di progetto.

##### Verifiche già eseguite, e quando

| Verifica                                                                      | Esito                                                                            | Quando               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------- |
| API unitaria                                                                  | **2573 su 2573 verdi**                                                           | dopo il rimedio 27.6 |
| API integrazione                                                              | **822 su 823** — l'unica rossa è `D5`, il barcode duplicato dichiarato dal piano | dopo il rimedio 27.6 |
| `npm run lint` — 67 guardie, `ng lint` e lint API compresi                    | **verde**                                                                        | dopo il rimedio 27.6 |
| type-check applicativo (`tsc -p tsconfig.json`) e dei test (`typecheck:test`) | **puliti**                                                                       | dopo il rimedio 27.6 |
| falsificazione 27.6 — dieci guasti sul codice, quattro sulla guardia          | **tutti presi**                                                                  | 09/09/2026           |

⛔ **Che cosa NON è stato eseguito, e va detto invece di lasciarlo intendere:**

- **le suite del frontend** (copertura, componenti) e le **build** non sono state rieseguite
  dopo il blocco 27.6. Motivo: nessun sorgente del frontend è cambiato in quel blocco — l'unica
  modifica fuori da `api/` è **una riga di script** in `package.json`. ⚠️ Vanno rieseguite prima
  del commit, perché l'hook `pre-push` le esegue comunque e un albero che non le passa non è un
  albero valido;
- **`npm run e2e`** non gira né in `test:everything` né al `pre-push`, e non è stato eseguito;
- ⛔ **la suite di integrazione NON è nella catena di `test:everything`**: le prove `V1..V15`
  vanno lanciate a mano (`npm run test:integration --prefix api`), o il commit sembra verificato
  più di quanto sia.

##### Limiti da dichiarare nel messaggio di commit

1. ⛔ **`D5` è rossa per scelta** — difetto 26.1, atteso dal piano: va nominata, o il primo che
   esegue la suite pensa di aver rotto qualcosa.
2. ⛔ **Il recupero del disallineamento può alzare la quantità su Shopify in uno stato ambiguo**
   (§27.6): l'avviso nel registro è una traccia, **non** una giustificazione.
3. ⛔ **Una correzione di commento è dovuta e NON è stata fatta**, perché la tranche di
   ricognizione era di sola lettura: `shopify-inventory-push.service.ts:339-347` afferma che il
   criterio che distingue le due cause «non è memorizzato da nessuna parte». È **falso** al
   livello della vendita — `OnlineSale.inventoryStatus` e il movimento rispondono — ed è vero
   solo un piano più sotto, dove manca il **confine** sugli ordini. Va corretto prima del
   commit, con un'autorizzazione di una riga.
4. ⚠️ **Sette migration non applicate al condiviso** stanno nell'albero: il commit **non** è un
   rilascio, e applicarle è una decisione a sé.

#### 27.4 · Dove prendere le misure, quando si deciderà di misurare

⭐ **Nessuno dei punti richiede di inventare un dato nuovo.**

```text
t0  l'istante LOCALE          la porta unica verso i canali, dove la variazione è committata
t1  l'attesa IMPOSTA          il regolatore: l'attesa è già calcolata, va solo registrata
t2  la durata della CHIAMATA  intorno alla richiesta, tenuta separata da t1
t3  la conferma REMOTA        l'eco del webhook: il ritardo di giro completo è t3 − t0
```

⚠️ **Il ritardo di giro completo è già calcolato e buttato via**: la riconciliazione lo valuta
per decidere se un webhook è un'eco, e non lo conserva.

⚠️ **E la coppia «ultimo osservato» è già scritta a ogni webhook e non è letta da nessuno**:
il materiale grezzo del ritardo vero è già persistito e inutilizzato.

⛔ **Tre ostacoli da dichiarare**: l'eco arriva solo se i webhook sono attivi, e il flag che li
abilita **nasce spento**; il regolatore è per processo, quindi con più repliche misura
un'istanza; e senza coda persistente **l'arretrato non ha un oggetto da contare** — due delle
quattro misure che il piano di collaudo dichiara necessarie non hanno oggi un soggetto.

---

### ⏸ 21-ter · `1b` cade a suite piena — causa TROVATA, allineamento del database APERTO

> ⛔ **Voce separata da §21-bis apposta.** L'episodio ha un sintomo diverso — nessun timeout,
> nessun blocco della pulizia — e attribuirlo all'instabilità già nota sarebbe una
> conclusione, non una misura. Che sia la stessa famiglia **non è escluso e non è stabilito**.

**Il fatto.** `1b` di `ripristino-storico-shopify` cade solo nella suite piena. Da sola, e in
coppia con i file sospetti, è verde. Il messaggio è preciso:

```text
BadRequestException: Riferimento assente o di un altro negozio:
                     shopifyInventorySyncStates.variantId
```

L'archivio esportato dalla prova conteneva una riga di stato sync la cui variante non era nel
pacchetto, e il ripristino l'ha rifiutata — correttamente.

**Le misure**, nell'ordine in cui sono state prese:

| Giro    | Condizione                                                | Esito                                                  |
| ------- | --------------------------------------------------------- | ------------------------------------------------------ |
| 1, 2, 3 | col file `invariante-disponibile`                         | `1b` rossa (nel giro 1 anche `I10`, poi verde da sola) |
| 4       | **senza** quel file                                       | solo `D5`, la rossa voluta                             |
| 5       | col file, più due query di sola lettura dentro `1b`       | verde                                                  |
| 6, 7    | col file, più la cancellazione esplicita degli stati sync | verde (nel 6 è caduta `S1/500`)                        |

⚠️ **Che cosa i giri dicevano, e che cosa NON dicevano.** Dicevano che il fallimento compariva
solo in presenza di quel file e che era **intermittente**: due giri con lo stesso codice hanno
dato esiti diversi. ⛔ **Non dicevano la causa**, e il giro 5 — due letture aggiunte, giro
verde — era **un'osservazione**, non una diagnosi.

⭐ **La causa è stata poi trovata, ed è più sotto**: la tabella degli stati sync non ha chiavi
esterne, quindi il troncamento non la raggiunge. L'intermittenza dipendeva da quali prove
avessero lasciato righe prima, non dai tempi.

#### ⭐ La causa è STATA TROVATA — 09/09/2026, e non era quella che sembrava

⛔ **`shopify_inventory_sync_states` NON HA NESSUNA CHIAVE ESTERNA nel database.** Misurato
in sola lettura sul database di prova, interrogando `pg_constraint`: l'unico vincolo della
tabella è la chiave primaria.

```text
shopify_inventory_sync_states_pkey   (p)   → nessuna tabella riferita
```

⛔ **Ed è una DERIVA fra schema e database**, non una scelta dichiarata: `schema.prisma`
dichiara tre relazioni — tenant, variante, sede — e il progetto non usa
`relationMode = "prisma"`, quindi quelle FK dovrebbero esistere. La migration che crea la
tabella (`20260713140000_shopify_inventory_sync_state`, 26 righe) semplicemente non le scrive.

⭐ **Da qui viene tutto il resto, e si spiega senza ipotesi:**

| Conseguenza                                                       | Perché                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| il `TRUNCATE … CASCADE` su `tenants` **non raggiunge** la tabella | il CASCADE segue le FK, e qui non ce ne sono                         |
| le righe di un file di prova **sopravvivono** a quello dopo       | il tenant si ricrea con lo **stesso** id, quindi restano anche «sue» |
| una riga può puntare a una **variante che non esiste più**        | nessuna FK lo impedisce                                              |
| l'export porta quella riga, e il ripristino la **rifiuta**        | è esattamente il messaggio di `1b`                                   |

⚠️ **La mia ipotesi precedente era sbagliata, ed è stata ritirata.** Avevo scritto che due
letture aggiunte facevano sparire il difetto e che quindi era «di tempi, non di dati». Era una
conclusione tratta da un giro solo: è un difetto **di dati**, e la sua intermittenza dipende
da quali prove hanno lasciato righe prima.

⭐ **Riprodotto in modo deterministico dentro UN file**: nella sezione delle quantità di
`collegamento-escluso`, `E23` vedeva quattro righe di stato sync lasciate dalle prove
precedenti dello stesso file, dopo un `beforeEach` che tronca. È la stessa cosa, senza dover
attendere la suite piena.

⛔ **Non l'ho corretta.** Aggiungere le tre chiavi esterne è una migration su uno schema a
storia condivisa e cambia il comportamento delle cancellazioni: è un intervento a sé, con il
suo mandato. ⚠️ **Conseguenza in produzione, non solo nei test**: la cancellazione di una
VARIANTE (`products.service.ts`) rimuove le righe di giacenza ma **non** gli stati sync, e
senza FK niente lo impedisce — restano orfani. La cancellazione del tenant e la purga del
ripristino li tolgono, perché passano dall'elenco delle entità di backup.

⛔ **Che cosa resta inspiegato**: nulla del meccanismo. Resta da decidere **se e come** allineare
il database allo schema, che è la voce aperta qui sopra.

⛔ **Il rimedio applicato è un CONTENIMENTO, e resta tale anche ora che la causa si conosce.**
I due file che creano stati sync li cancellano esplicitamente, con la causa scritta accanto —
non è una pulizia silenziosa. La pulizia non ingoia più gli errori: ogni passo si tenta, la
connessione si rilascia comunque, e i fallimenti si sollevano invece di restare muti.

⚠️ **Il contenimento non è la correzione**: finché la tabella non ha le sue chiavi esterne,
qualunque prova futura che crei uno stato sync si porterà dietro lo stesso problema, e dovrà
ricordarsene. È la ragione per cui l'allineamento del database resta aperto.

⚠️ **Nello stesso giro 6 è caduta `S1/500`** con
`Timed out fetching a new connection from the connection pool (timeout 10, limit 13)`: è il
file più pesante della suite, sotto il lotto da 500 articoli. Sintomo diverso, e nemmeno
questo è stato attribuito.

---

### ⏸ 21-bis · APERTO — la suite di integrazione è INSTABILE a suite piena

> ⛔ **Tre cose distinte, e vanno tenute separate leggendo tutto il resto:**
>
> |                                | stato                                                                                                                               |
> | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
> | **strumentazione diagnostica** | ✅ **completata** — soglie, fotografia, sonda, misura del processo, e prove che le falsificano                                      |
> | **catena di amplificazione**   | ✅ **individuata e corretta** — riprodotta a comando, correzione misurata (4 prove cadute → 1)                                      |
> | **causa dell'innesco**         | ✅ **ACCERTATA l'08/09/2026** — il PostgreSQL di prova si saturava fino a riavviarsi: `longest fsync = 57,5 s` dentro un hook da 60 |
>
> ⭐ **La causa non era nel codice della suite**: era il database di prova che collassava sotto
> il proprio carico di `TRUNCATE` — 449 188 file per checkpoint — fino al riavvio del server.
> Rimedio applicato al compose di prova (`fsync=off` e compagni), che è dichiaratamente
> usa-e-getta.
>
> ⚠️ **La voce resta APERTA finché la verifica non è compiuta**: la campagna sulla causa
> corretta è in corso, e una diagnosi non si dichiara chiusa dal ragionamento che l'ha
> prodotta. ⛔ E i giri verdi da soli non basteranno: quello che li rende una prova, stavolta,
> è che la causa è **misurata** e il rimedio agisce **esattamente su quella misura**.

> ⛔ **Osservato DUE volte l'08/09/2026, con ampiezza molto diversa, e non diagnosticato.**
> I giri verdi successivi non lo chiudono.

| #   | Che cosa                                             | Esito                                     |
| --- | ---------------------------------------------------- | ----------------------------------------- |
| 1   | una prova sola (`ripristino-storico-shopify` → `2b`) | `1 failed \| 660 passed (661)`            |
| 2   | **crollo diffuso**: 29 file su 38                    | `153 failed \| 188 passed \| 323 skipped` |

⭐ **Il secondo è il dato che conta**, e sposta l'ipotesi: il fallimento non era nelle prove
ma nella **fixture** — `conStoricoSbloccato` (`fixture.ts:167`), cioè la transazione che
spegne le protezioni per poter troncare. Quella chiede un lock esclusivo sulle tabelle: se una
sessione precedente ha lasciato una transazione aperta, si ferma lì e porta giù tutto quello
che viene dopo.

⚠️ **Verificato SUBITO dopo, e il database era pulito**: 0 trigger spenti, **0 sessioni
attive**. Quindi ciò che teneva il lock era già sparito — coerente con una transazione di un
file precedente chiusa in ritardo, non con uno stato corrotto.

⛔ **Frequenza misurata: 2 su 7 giri completi.** Gli ultimi cinque sono verdi (664/664), e
non significa niente: è esattamente la forma in cui un difetto di concorrenza si nasconde.

#### ⭐ La firma è STATA CATTURATA — 08/09/2026, campagna con log conservati

⛔ **Riprodotto due volte su quattro giri**, con i log tenuti. Il messaggio è sempre lo stesso:

```text
Error: Hook timed out in 60000ms.
  ❯ beforeEach → svuota → conStoricoSbloccato
```

| Giro | File colpito                | Ampiezza       |
| ---- | --------------------------- | -------------- |
| 3    | `shopify-articoli-identita` | 1 prova su 666 |
| 4    | `reso-cassa`                | 2 prove su 666 |

⭐ **File diversi, hook identico**: non è un difetto di quelle prove — è **la pulizia** che
resta appesa. E la pulizia, misurata, dura fra 104 e 1 639 ms: qui supera i 60 000.

⭐ **Frequenza sull'intera campagna: 4 giri su 17** (≈24 %), con ampiezza da 1 prova a 29 file.

⚠️ **I giri 15, 16 e 17 dell'08/09/2026 sono verdi**, log conservati — l'ultimo con le nuove
soglie: 40 file, 680 prove, 182 s, **nessun avviso di lentezza** (la spia non è scattata
nemmeno una volta su ~680 pulizie). ⛔ **Non chiudono niente**: la frequenza osservata è di
uno su quattro, quindi tre giri verdi di fila sono l'esito più probabile anche a difetto
intatto — ⛔ e nemmeno le soglie nuove lo chiudono: **rendono leggibile** il prossimo rosso,
non impediscono il blocco.

#### ⛔ Che cosa la strumentazione NON ha ancora preso

⚠️ **La prima fotografia era nel `catch`, e non è mai scattata**: `vitest` abbandona l'hook
senza sollevare dentro `conStoricoSbloccato`, quindi né il `catch` né il `finally` vengono
raggiunti in tempo. È stata aggiunta una **spia indipendente** a 15 s, che fotografa mentre la
pulizia è ancora appesa.

⛔ **Tre giri successivi sono verdi e la spia non ha sparato**: non è una conferma di niente.
⚠️ E non si può nemmeno escludere che la strumentazione stessa abbia perturbato la sequenza —
è la ragione per cui la voce resta aperta invece di essere dichiarata «in osservazione».

⛔ **E la durata dei giri RIUSCITI non dice niente su quello bloccato.** Le otto misure della
pulizia (104–1 639 ms) vengono da esecuzioni andate a buon fine: descrivono il caso normale,
non il caso patologico. Servono a escludere che 60 s siano una durata _plausibile_, non a
spiegare che cosa succeda durante lo stallo — quello lo può dire solo una fotografia presa
mentre è in corso.

#### ⚠️ Due difetti INTRODOTTI dalla strumentazione, corretti — e non sono la causa

| Difetto                                                            | Riprodotto | Perché non è la causa di §21-bis                                |
| ------------------------------------------------------------------ | ---------- | --------------------------------------------------------------- |
| la spia non veniva cancellata dopo una pulizia **riuscita**        | ✅ sì      | la spia non esisteva ai giri 3 e 4, quando il guasto si è visto |
| in `6c` un errore nell'attesa saltava `riprendi()` e le due attese | ✅ sì      | quella prova non esisteva alla prima osservazione               |

⭐ Il secondo è comunque grave nel merito: un attrezzo di prova che lascia una transazione
sospesa coi propri lock, **dentro un'indagine su transazioni lasciate aperte**, avrebbe
inquinato ogni misura successiva.

⚠️ **E lo stesso difetto era in `chiusura-cassa`, in cinque punti, da prima di questa
indagine.** Lì non era strumentazione: era il codice di prova normale. È la catena di
amplificazione descritta più sotto — cioè la cosa che ho cercato altrove mentre stava,
identica, nel file che gira due posizioni prima di quello che falliva.

#### ⭐ Il MECCANISMO è stato riprodotto — 08/09/2026, prova `pulizia-bloccata`

⛔ **Quello che mancava non era una teoria: era un errore leggibile.** Lo stallo si
presentava come `Hook timed out in 60000ms` — nessuna tabella, nessun pid, nessuna fase.
Adesso il meccanismo è riprodotto di proposito, e il fallimento dice tutto quello che serve.

**Come si riproduce**, ed è banale: una sessione apre una transazione, fa una `SELECT` su una
tabella protetta e la lascia aperta. Nient'altro.

```text
sessione A   BEGIN; SELECT count(*) FROM shopify_product_identities;   ← e resta lì
sessione B   svuota() → conStoricoSbloccato → TRUNCATE …               ← in coda
```

#### ⛔ E la fase bloccata NON è quella che sembrava

| Istruzione                      | Lock richiesto       | Convive con una `SELECT` altrui? |
| ------------------------------- | -------------------- | -------------------------------- |
| `ALTER TABLE … DISABLE TRIGGER` | SHARE ROW EXCLUSIVE  | ✅ **sì**: passa                 |
| `TRUNCATE`                      | **ACCESS EXCLUSIVE** | ⛔ no: si mette in coda          |

⚠️ **Avevo attribuito lo stallo allo spegnimento dei trigger** — è il DDL, sembrava il
sospetto naturale. È falso, e l'ha detto la riproduzione: a fermarsi è il TRUNCATE. La
differenza conta, perché cambia chi si va a cercare: non chi tocca i trigger, ma **chiunque**
abbia una transazione aperta su una qualsiasi delle tabelle troncate.

#### Le quattro soglie, e perché stavano nell'ordine sbagliato

```text
PRIMA                                    ORA
  hookTimeout vitest      60 s  ← primo    lock_timeout          15 s  ← primo
  timeout transazione    120 s             statement_timeout     30 s
                                           timeout transazione   45 s
                                           hookTimeout vitest    60 s  ← ultimo
```

⛔ **Non è «alzare i timeout»: è il contrario.** Finché il primo a scadere era l'hook, vitest
abbandonava senza sollevare dentro la pulizia — quindi né il `catch` né il `finally` venivano
raggiunti, e la fotografia che esisteva già **non veniva mai scattata**. Ora cede per prima
l'istruzione bloccata, e cede dicendo perché.

⚠️ **15 s sono nove volte la pulizia più lenta mai misurata** (1 639 ms): un giro
legittimamente lento non diventa rosso per questo.

#### Che cosa dice oggi un fallimento — misurato, non promesso

```text
conStoricoSbloccato fallita dopo 15033ms:
  bloccata durante «pulizia (TRUNCATE / DELETE)»: … 55P03 … lock timeout
── concorrenza al momento del fallimento ──
  ATTESA pid=206433 relazione=shopify_product_identities modo=AccessExclusiveLock
  pid=206179 stato=idle in transaction eta_tx=00:00:15.03 bloccanti=[] SELECT …
```

⭐ **Tre dati che prima non c'erano**: la **fase**, la **relazione** contesa, e il **pid** di
chi la teneva con l'età della sua transazione.

⚠️ **La relazione la vede solo la spia**, non la fotografia finale: a fatto compiuto il lock
non è più in coda e `pg_locks` non ha più niente da dire. Per questo la spia è scesa da 15 s
a **8 s** — sotto `lock_timeout`, così scatta **mentre** la contesa è in corso. A 15 s
scattava insieme alla rinuncia, e riportava «lock_non_concessi=0»: il contrario di ciò che
serve.

#### ⛔ Due difetti DELLA STRUMENTAZIONE, rilevati dal proprietario — 08/09/2026

La diagnosi appena scritta aveva due buchi, e li ha trovati chi l'ha letta, non chi l'ha
eseguita. Nessuno dei due sarebbe emerso da un giro verde.

##### 1 · La scala ordinata non dimostrava che il TOTALE ci stesse

> **`15 < 30 < 45 < 60` sembrava una prova, e non lo era.** Lasciava fuori il primo pezzo
> della sequenza: l'attesa di una connessione dal pool.

```text
   1. maxWait      30 s   ← non era nella scala
   2. transazione  45 s
   3. diagnosi        —   ← nemmeno questa
   ──────────────────────
      75 s prima ancora di fotografare, contro un hookTimeout di 60
```

⛔ **Cioè lo stallo muto restava possibile esattamente come prima, per un'altra strada.** Una
pulizia che aspettasse il pool avrebbe fatto scadere l'hook prima di arrivare alla parte che
sa spiegarsi.

⭐ Il bilancio è ora **una somma dichiarata**, non una scala:

| soglia              | valore   | perché                                                                 |
| ------------------- | -------- | ---------------------------------------------------------------------- |
| `maxWait`           | 5 s      | se il pool non risponde in 5 s il problema è il pool: dirlo subito     |
| `lock_timeout`      | 10 s     | sei volte la pulizia più lenta mai misurata (1 639 ms)                 |
| `statement_timeout` | 15 s     | una singola istruzione impantanata cede comunque                       |
| timeout transazione | 20 s     | dodici volte la pulizia più lenta                                      |
| fotografia          | 5 s      | la diagnosi non può costare più del guasto che descrive                |
| **totale peggiore** | **30 s** | contro `hookTimeout` 60 s — e il margine serve anche a `creaDataset()` |

⛔ **E la somma è sorvegliata da una prova, non da un commento.** ⚠️ La prima stesura misurava
il tempo reale contro un tetto **calcolato dalle stesse costanti**: rimettendo `maxWait` a 30 s
e la transazione a 45 restava verde, cioè non sorvegliava niente. Ora il confronto è con
`hookTimeout`, che è un numero esterno: `expected 80000 to be less than or equal to 30000`.

##### 2 · La fotografia non partiva proprio quando serviva

> **Usava lo stesso client della pulizia.** Ma il momento in cui la diagnosi serve è
> precisamente quello in cui quel client è occupato.

⛔ Riprodotto: con una sola connessione nel pool, tenuta da una transazione aperta, la
fotografia restituisce `fotografia non riuscita: … Invalid prisma…` dopo il timeout del pool.
La diagnosi diventava parte del guasto invece di descriverlo.

⭐ Ora la fotografia apre un **client dedicato** con una connessione propria
(`connection_limit=1`, `pool_timeout=2`) e un tetto di 5 s: entra da una porta che nessuno sta
usando, guarda, e si chiude. ⚠️ Se la costruzione fallisce si ripiega sul client passato — una
diagnosi parziale vale più di nessuna.

⚠️ **Strumentazione confinata ai test**: vive in `fixture.ts`, che nessun percorso applicativo
importa. Nell'applicazione non è stato aggiunto nessun gancio.

#### ⭐ La sonda del PRECURSORE — cercare la causa senza aspettare il sintomo

> **Una transazione lasciata aperta che non blocca nessuno passa inosservata, e resta lì
> pronta a bloccare il giro dopo.**

Prima di ogni pulizia, una query sola cerca le sessioni `idle in transaction` più vecchie di
2 s. Se ne trova, le nomina — con il **pid**, da **quanto** sono aperte, la loro **ultima
query**, e **dopo quale prova** sono comparse:

```text
[diagnosi §21-bis] TRANSAZIONE ORFANA prima di «X» (la precedente era «Y»):
  pid=207431 aperta_da=00:00:03.2 ultima_query=SELECT …
```

⭐ **È il salto da «aspettare il rosso» a «trovare il precursore»**: il responsabile si può
identificare in un giro verde, senza dover attendere la coincidenza che lo fa esplodere.

⚠️ La soglia è 2 s perché le prove di concorrenza aprono transazioni **apposta**, e durano
meno: sotto quel valore ci sarebbe rumore invece di segnale.

#### ⭐ LA CATENA DI AMPLIFICAZIONE — riprodotta e corretta l'08/09/2026

> ⛔ **Questa è la causa del CROLLO, non quella dell'innesco.** La distinzione regge tutto il
> resto di questa sezione: si sa ora perché un fallimento qualsiasi diventava un crollo muto;
> non si sa ancora che cosa facesse fallire la prima prova.

##### Come è stata trovata

Non aspettando un giro rosso: cercando **chi può lasciare una transazione aperta**. Una
scansione dei file di integrazione ha dato i candidati — le transazioni avviate senza `await`
immediato — e fra quelli `chiusura-cassa` ne ha **cinque**, con **zero** `finally` nel file.

```text
const tenuta = prisma.$transaction(async (tx) => {
  await lockDocumentCounter(tx, …);   // ⛔ prende il lock sul numeratore
  cancello.segnalaPresa();
  await cancello.attesa;              // ⛔ e lo tiene finché il cancello non si apre
}, { timeout: 30_000 });

await cancello.preso;
…
expect(chiude.conclusa()).toBe(false);   // ⛔ SE CADE QUI…
cancello.apri();                          // …questa non viene mai eseguita
await tenuta;
```

⭐ **E la posizione nel giro combacia**: `chiusura-cassa` è il **10°** file eseguito, e
`shopify-articoli-identita` — uno dei due su cui i giri 3 e 4 sono falliti — è il **12°**,
dentro la finestra dei 30 s di quella transazione.

##### L'esperimento controllato, e cosa ha detto davvero

**Rotta UNA sola asserzione**, di proposito, e misurato:

|                                    | prima della correzione          | dopo        |
| ---------------------------------- | ------------------------------- | ----------- |
| prove cadute                       | **4** su 27                     | **1** su 27 |
| `Error: Hook timed out in 60000ms` | ⛔ **sì** — la firma di §21-bis | ✅ no       |
| transazioni superstiti a fine file | 0                               | 0           |

⭐ **La firma di §21-bis è stata riprodotta a comando.** Una prova che cade lascia la
transazione appesa coi propri lock; i `beforeEach` successivi si bloccano e vanno in hook
scaduto; il fallimento si moltiplica e diventa muto.

⚠️ **E una cosa che credevo non è vera**: le transazioni **non** sopravvivono al termine del
file — misurato, zero superstiti. Quindi il contagio è **dentro** un file, non fra file.
⛔ Il crollo di «29 file su 38» del giro 4 **non** è spiegato da questa catena, e resta aperto.

##### Le due correzioni, e perché ce ne vogliono due

| Dove                          | Che cosa                                                                             | Copre                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `chiusura-cassa`, `afterEach` | i cancelli si aprono **sempre**, e si aspetta che le transazioni si chiudano davvero | le cinque prove di quel file, e quelle che verranno: `apriCancello()` si registra da sé |
| client di integrazione        | **`lock_timeout=30s` di sessione**, nell'URL                                         | **ogni** query di **ogni** prova, non solo la pulizia                                   |

⛔ **La seconda non è un doppione della prima**: il `lock_timeout` della sola pulizia non
bastava, e l'ha mostrato la riproduzione — a bloccarsi non era solo il `TRUNCATE`, erano anche
gli `INSERT` di `creaDataset()`, che nella transazione di pulizia non stanno. L'hook scadeva lo
stesso.

⭐ **Misurato che basta da sola**: rimettendo il file _senza_ la correzione mirata ma _con_ il
`lock_timeout` di sessione, la stessa rottura dà **1 sola prova rossa** invece di quattro. La
rete regge anche per i file che nessuno ha corretto.

⚠️ **30 s e non 10**: le prove di concorrenza aspettano lock **apposta**. Le loro attese
misurate durano meno di un secondo; 30 s stanno sotto l'hook e sopra qualunque attesa
legittima.

⭐ **E che il parametro arrivi è stato LETTO dal server**, non dedotto:

```text
senza options : lock_timeout = 0
con options   : lock_timeout = 30s
```

⚠️ Un parametro d'URL che PostgreSQL ignora non fallisce: si limita a non esserci. È lo stesso
genere di guasto muto che questa sezione insegue.

#### ⭐ LA CAUSA — accertata l'08/09/2026 nei log del CONTAINER

> ⛔ **La suite non era instabile: era il database di prova a collassare.**

Mezza giornata di indagine ha cercato lock contesi e transazioni lasciate aperte. Erano
ipotesi ragionevoli, e una — la catena di amplificazione — era pure vera. Ma la causa stava
in un posto che nessuna delle prove poteva vedere: **i log del container PostgreSQL**, che
non erano mai stati aperti.

```text
19:13:11  checkpoint complete: sync=357.880 s, total=614.467 s, sync files=449188
19:32:59  checkpoint complete: sync=614.938 s, total=888.674 s, sync files=158354,
                               longest=57.508 s
19:58:56  terminating any other active server processes
19:59:11  database system was interrupted; last known up at 19:45:42
20:11:40  syncing data directory (fsync), elapsed time: 748.27 s
```

⭐ **`longest=57.508 s` è il numero che spiega «Hook timed out in 60000ms»**: un singolo
fsync che blocca cinquantasette secondi dentro un hook che ne concede sessanta. Non c'era
nessun lock conteso — **il database era fermo**.

##### Perché il database si satura: è la suite a produrre il carico

⚠️ Ogni giro esegue **~680 pulizie**, ognuna con un `TRUNCATE` su decine di tabelle. In
PostgreSQL un `TRUNCATE` **crea un file nuovo** per ogni tabella (nuovo relfilenode), e il
checkpoint successivo deve sincronizzarli tutti:

```text
449 188 file in un solo checkpoint
```

E ogni giro ne aggiunge. ⭐ **Questo spiega il crollo PROGRESSIVO** misurato nella campagna
21-23 — 9, poi 97, poi 172 prove cadute: non era casualità, era un ambiente che degradava
giro dopo giro fino al riavvio del server.

##### Il rimedio, e perché qui è quello giusto

```yaml
command: [postgres, -c, fsync=off, -c, synchronous_commit=off, -c, full_page_writes=off]
```

⭐ **Toglie esattamente ciò che è stato misurato**: i fsync. Il container di prova dichiara
sé stesso «isolato, usa-e-getta» dalla prima riga del suo compose, ed è la condizione precisa
in cui questi parametri sono corretti e non una scorciatoia.

⛔ **Cosa si perde, dichiarato**: se il container viene ucciso o la macchina va giù, il
database può restare corrotto e va ricreato con `npm run db:test:reset`. Su un database
usa-e-getta è un costo nullo; su qualunque altro sarebbe inaccettabile — e per questo la riga
sta nel compose **di prova** e in nessun altro posto.

⚠️ **Verificato leggendo dal server**, non dedotto: `fsync off`, `synchronous_commit off`,
`full_page_writes off`.

##### La misura del rimedio: lo stesso checkpoint, prima e dopo

```text
PRIMA   sync files=449188   sync=614.938 s   longest=57.508 s
DOPO    sync files=     0   sync=  0.041 s   longest= 0.000 s
```

⭐ **Il rimedio agisce esattamente sulla grandezza misurata**, e questo è ciò che distingue
una correzione da una coincidenza: non «i giri sono tornati verdi», ma «la cosa che durava
614 secondi adesso ne dura 0,04».

##### ⛔ Che cosa questo NON cancella

|                                 |                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **la catena di amplificazione** | resta reale e corretta: una prova che cade lasciando una transazione appesa fa crollare le successive. Riprodotta a comando, e la correzione misurata (4 prove cadute → 1) |
| **la strumentazione**           | resta necessaria: è ciò che ha permesso di leggere il giro 21 e arrivare qui                                                                                               |
| **il bilancio dei tempi**       | resta necessario: senza, lo stallo tornerebbe muto                                                                                                                         |

⭐ **E la lezione che vale oltre questo caso**: per mezza giornata ho cercato la causa dentro
il codice che potevo modificare, e la prova decisiva stava in un log che non avevo mai
guardato — quello del processo che stavo interrogando. ⚠️ La fotografia della concorrenza
mostrava «nessun lock in attesa» fin dal primo giro rosso: era già la risposta, e l'ho letta
come un'anomalia invece che come un'indicazione.

#### ⭐ L'INNESCO NON È UNA CONTESA — il giro 21 dell'08/09/2026

> **Il primo giro rosso dopo la strumentazione ha parlato, e ha detto una cosa che nessuna
> delle ipotesi precedenti prevedeva.**

⛔ **Nove prove cadute su 684**, in quattro file diversi — `chiusura-cassa`,
`dispositivo-di-sessione`, `registro-cestino`, `ripristino-storico-shopify`. E per la prima
volta il log dice **cosa** stava succedendo:

```text
conStoricoSbloccato fallita dopo 15850ms: bloccata durante «pulizia (TRUNCATE / DELETE)»
conStoricoSbloccato fallita dopo 35897ms: bloccata durante «pulizia (TRUNCATE / DELETE)»
conStoricoSbloccato fallita dopo 41494ms: bloccata durante «spegnimento delle protezioni»
```

##### Ma le fotografie dicono che NESSUNO stava bloccando

```text
sessioni=1 lock_non_concessi=0
  (nessun lock in attesa in questo istante)
  pid=220748 stato=active attesa=-  bloccanti=[]  TRUNCATE TABLE …   ← da 8 secondi
  pid=220807 stato=active attesa=-  bloccanti=[]  COMMIT             ← da 8,6 secondi
```

⛔ **Nessun lock in attesa. Nessun bloccante. Nessuna sessione idle in transaction.** Un
`TRUNCATE` che gira da otto secondi senza aspettare niente, e un `COMMIT` che ne impiega otto.

##### E il dato che chiude la questione

```text
Transaction API error: Transaction already closed.
The timeout for this transaction was 20000 ms,
however 101339 ms passed since the start of the transaction.

fotografia non riuscita: diagnosi non conclusa entro 5000ms
```

⭐ **Centouno secondi fra due query della stessa transazione**, e la diagnosi che non riesce a
concludere una query in cinque. Quel tempo **non si perde nel database**: si perde nel
processo che non arriva a chiedere.

##### Le due famiglie di causa, che finora erano una sola

|             | il database aspetta                      | il client non chiede                                                                    |
| ----------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| **sintomo** | lock in attesa, `bloccanti=[…]`, `55P03` | `active` senza attesa, timeout di transazione superati di 5×, diagnosi che non conclude |
| **rimedio** | chiudere le transazioni, `lock_timeout`  | ⛔ **tutt'altro**: carico, I/O, parallelismo, risorse della macchina                    |

⚠️ **Tutta l'indagine precedente guardava la prima colonna.** La catena di amplificazione
trovata (transazioni lasciate appese) è reale, riprodotta e corretta — ma è la causa del
**crollo**, non della **scintilla**. La scintilla, oggi, ha tutta l'aria di essere fame di CPU
o di I/O sulla macchina che esegue la suite.

⚠️ **E spiega ciò che nessuna ipotesi di contesa spiegava**: perché i file colpiti siano
**diversi ogni volta** e senza relazione fra loro, e perché l'ampiezza vada da una prova a
ventinove file. Una macchina satura non sceglie il file.

##### Che cosa è stato aggiunto per confermarlo o smentirlo

⭐ Una misura continua del **ritardo dell'event loop** del processo di test, riportata accanto
alla fotografia. Se durante uno stallo il ritardo è di decine di secondi, la causa è il
processo; se resta a zero mentre il database aspetta, è contesa.

```text
── stato del processo ──
  ritardo event loop: ultimo=…ms massimo=…ms · heap=…/…MB rss=…MB · attivo da …s
```

⛔ **Non è ancora una conferma.** È l'attrezzo che permetterà di darla o toglierla al prossimo
episodio: la misura esiste da adesso, e i giri rossi precedenti non la portano.

##### ⚠️ Una precisazione su ciò che avevo scritto poche ore prima

Avevo dichiarato che `ALTER TABLE … DISABLE TRIGGER` **passa sempre**, perché il suo SHARE ROW
EXCLUSIVE convive con l'ACCESS SHARE di una `SELECT`. È vero per le `SELECT`, e **falso in
generale**: quel lock confligge con il ROW EXCLUSIVE di qualunque scrittura concorrente. Il
giro 21 riporta infatti una caduta «durante lo spegnimento delle protezioni».

⚠️ Quel caso specifico però **non prova una contesa**: l'errore era `Transaction already
closed`, cioè di nuovo il client fermo. La fase dice **dove** la transazione era quando è
morta, non **perché**.

#### ⛔ Riprodurre il MECCANISMO non è identificare il COLPEVOLE

> **Che una transazione lasciata aperta blocchi la pulizia è ora dimostrato. Chi la lasciasse
> aperta ai giri 3 e 4 resta ignoto.**

⚠️ E non lo si può dedurre a posteriori: quei log riportano l'hook scaduto e basta. Lo si
saprà **al prossimo episodio**, perché adesso l'errore nomina la fase, la relazione e il pid.

⛔ **Quindi §21-bis resta APERTA**, e i giri verdi non la chiudono: la frequenza osservata è
di uno su tre o quattro, quindi un giro verde è l'esito più probabile anche a difetto intatto.
Quello che è cambiato è che il prossimo giro rosso sarà **leggibile**.

#### ⛔ Che cosa è ACCERTATO, che cosa è IPOTESI, che cosa resta da verificare

⚠️ **Qui c'era scritto «non è una regressione del codice applicativo», e non era dimostrato.**
L'argomento era «ogni file, eseguito da solo, è verde» — che non esclude niente: una
regressione che si manifesta solo in sequenza o sotto concorrenza è verde in isolamento **per
definizione**. La frase è stata tolta.

|                                 |                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **accertato**                   | il fallimento è `Hook timed out in 60000ms` sulla pulizia `conStoricoSbloccato`, su file diversi; la pulizia normale dura 104–1 639 ms; frequenza 4 su 14; subito dopo il database risulta pulito (0 trigger spenti, 0 sessioni)                                                                                   |
| **accertato**                   | il disallineamento `hookTimeout` 60 s / transazione 120 s è **reale ed è il meccanismo di amplificazione**: vitest abbandona l'hook mentre la transazione vive ancora coi lock esclusivi                                                                                                                           |
| **accertato** _(08/09)_         | **il meccanismo**: una transazione altrui lasciata aperta su una tabella protetta mette in coda il `TRUNCATE` della pulizia. Riprodotto e verde in `pulizia-bloccata.integration-spec.ts`                                                                                                                          |
| **accertato** _(08/09)_         | ⛔ **non è lo spegnimento dei trigger**: `ALTER TABLE … DISABLE TRIGGER` prende uno SHARE ROW EXCLUSIVE e convive con l'ACCESS SHARE di una `SELECT` altrui. Passa. A bloccarsi è il TRUNCATE                                                                                                                      |
| **accertato** _(08/09)_         | **la catena di amplificazione**: una prova che cade prima di rilasciare un cancello lascia la transazione appesa coi lock, e i `beforeEach` successivi vanno in hook scaduto. Riprodotta a comando: una asserzione rotta → **4** prove cadute e `Hook timed out`; dopo la correzione → **1** e nessun hook scaduto |
| **accertato** _(08/09)_         | ⛔ le transazioni **non sopravvivono** al termine del file (misurato: zero superstiti). Il contagio è **dentro** un file, non fra file — quindi il crollo di 29 file su 38 **non** è spiegato da questa catena                                                                                                     |
| **misurato** _(08/09, giro 21)_ | ⛔ **l'innesco non è una contesa**: `TRUNCATE` e `COMMIT` `active` per 8 s **senza** lock in attesa né bloccanti, e **101 s** fra due query della stessa transazione. Il tempo si perde nel processo, non nel database                                                                                             |
| **ipotesi, ora la principale**  | fame di **CPU o I/O** sulla macchina che esegue la suite. Spiega ciò che nessuna ipotesi di contesa spiegava: file colpiti diversi ogni volta, e ampiezza da 1 prova a 29 file                                                                                                                                     |
| **ipotesi, ancora aperta**      | che cosa saturi la macchina, e se dipenda da qualcosa dentro la suite (parallelismo, memoria, container) o da fuori                                                                                                                                                                                                |
| **da verificare**               | la misura del **ritardo dell'event loop**, aggiunta l'08/09: esiste da adesso e i giri rossi precedenti non la portano. Al prossimo episodio confermerà o toglierà l'ipotesi                                                                                                                                       |
| **scartata come origine**       | il disallineamento dei timeout da solo: richiederebbe un rallentamento di 40–500× rispetto al misurato, cioè sarebbe l'effetto e non la causa                                                                                                                                                                      |
| **non riprodotta**              | lo stub globale di `fetch` sopravvissuto al file: chiuso comunque, ma mai osservato causare il guasto                                                                                                                                                                                                              |
| **da verificare**               | ⛔ **Una regressione applicativa NON è esclusa**: nessuna misura la esclude oggi                                                                                                                                                                                                                                   |

#### I due candidati, e come si distinguono

| Candidato                                                                                                      | Come si verifica                                                        |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| una transazione tenuta aperta da un file precedente (`sospendiLaPrimaRichiesta`, i callback concorrenti di B1) | log di `pg_stat_activity` **al momento del fallimento**, non dopo       |
| lo stub globale di `fetch` sopravvissuto al proprio file                                                       | già chiuso con `unstubAllGlobals`, ma non riprodotto: resta non provato |

⛔ **Alla prossima comparsa servono**: il messaggio d'errore completo, l'elenco dei file già
girati, e una fotografia di `pg_stat_activity` presa **mentre** fallisce.

#### ✅ La strumentazione c'è — 08/09/2026

⭐ **La fotografia si prende ORA sul momento**, non a fatto compiuto: `conStoricoSbloccato`
cattura sessioni, età delle transazioni, `pg_blocking_pids` e lock non concessi **prima** di
rilanciare l'errore, e li allega al messaggio. È la ragione per cui le due osservazioni
precedenti non hanno prodotto una diagnosi: si guardava dopo, e chi teneva il lock era già
sparito.

⭐ **E una spia sulla durata**: una pulizia oltre 5 s viene segnalata anche quando riesce.

#### ⛔ Il disallineamento dei timeout NON è l'origine — misurato

|                                          |                                                        |
| ---------------------------------------- | ------------------------------------------------------ |
| `hookTimeout` di vitest                  | 60 000 ms                                              |
| timeout della transazione di pulizia     | 120 000 ms                                             |
| **durata reale della pulizia**, 8 misure | 104 · 127 · 159 · 233 · 353 · 551 · 859 · **1 639 ms** |

⭐ **La pulizia sta 36 volte sotto il limite dell'hook nel caso peggiore misurato.** Perché il
disallineamento produca il crollo servirebbe un rallentamento di **40–500×**: cioè la lentezza
sarebbe l'effetto di qualcos'altro, non la causa.

⚠️ **Resta però un AMPLIFICATORE credibile, e va corretto lo stesso**: se qualcosa blocca la
pulizia oltre i 60 s, vitest abbandona l'hook mentre la transazione **resta aperta** — con i
lock esclusivi del `DISABLE TRIGGER` in mano per un altro minuto. Un solo stallo diventa così
il crollo di ogni file successivo, che è esattamente la forma osservata.

⛔ **Ma allineare i timeout NON chiude questa voce**: spegnerebbe la cascata, non l'origine —
e un difetto che smette di essere visibile è la cosa peggiore che possa succedere qui.
L'origine resta da trovare, e la strumentazione serve a quello.

⚠️ **Finché non è diagnosticato, un giro verde della suite non è una prova di rilascio**: va
detto insieme al numero, non lasciato intendere.

---

#### ⛔ Episodi del 09/09/2026 — evidenze conservate, causa NON attribuita

> **Tre giri completi della suite nello stesso pomeriggio: il primo con quattro file rossi, il
> secondo con un hook, il terzo tutto verde.** ⛔ Il giro verde **non chiude** niente (frequenza
> osservata: 1 su 3–4), e i due giri rossi **non si attribuiscono** alla catena già accertata:
> hanno un'altra firma, e vanno letti come episodi nuovi.

| Giro                                                   | File                                        | Punto                                                                              | Messaggio, com'è arrivato                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                                                      | `pulizia-bloccata.integration-spec.ts`      | prova «la pulizia bloccata FALLISCE dicendo la tabella e chi la teneva», 11 599 ms | `AssertionError: expected '[diagnosi §21-bis] pulizia ANCORA IN …' to match /ATTESA pid=\d+ relazione=\w+/`                                                                                                                                                             |
| 1                                                      | `shopify-link-vincoli.integration-spec.ts`  | prova «rifiuta due periodi ATTIVI sulla stessa coppia», 45 682 ms                  | `Error: conStoricoSbloccato fallita dopo 45666ms: bloccata durante «pulizia (TRUNCATE / DELETE)»:`                                                                                                                                                                      |
| 1                                                      | `cassa-vat-modes.integration-spec.ts`       | hook                                                                               | `Error: conStoricoSbloccato fallita dopo 24280ms: bloccata durante «pulizia (TRUNCATE / DELETE)»:`                                                                                                                                                                      |
| 1                                                      | `shopify-link-rollback.integration-spec.ts` | hook                                                                               | `Error: Hook timed out in 60000ms.`                                                                                                                                                                                                                                     |
| 2                                                      | `prodotti-importati.integration-spec.ts`    | hook                                                                               | `Error: conStoricoSbloccato fallita dopo 51052ms: Transaction API error: Transaction already closed: A commit cannot be executed on an expired transaction. The timeout for this transaction was 20000 ms, however 50980 ms passed since the start of the transaction.` |
| 3                                                      | —                                           | —                                                                                  | 46 file, 737 prove verdi (log intero conservato nello scratchpad della sessione: `integrazione-giro3.log`)                                                                                                                                                              |
| 4 (sera, dopo registro e campagna)                     | —                                           | —                                                                                  | 47 file, 752 prove: 751 verdi, 1 rossa **voluta** (`D5`, §26.1); 287 s; log intero conservato (`integrazione-giro4.log`). Nessun episodio                                                                                                                               |
| 5 (dopo la correzione del registro sul mandato)        | —                                           | —                                                                                  | 47 file, 762 prove: 761 verdi, 1 rossa voluta (`D5`); 290 s; log intero conservato (`integrazione-giro5.log`). Nessun episodio — e non chiude niente                                                                                                                    |
| 6 (con la prova del pool, `registro-pool`)             | —                                           | —                                                                                  | 48 file, 764 prove: 763 verdi, 1 rossa voluta (`D5`); 298 s; log intero conservato (`pool-giro5.log`). Nessun episodio                                                                                                                                                  |
| 7 (dopo il rimedio: connessione riservata al registro) | —                                           | —                                                                                  | 48 file, 764 prove: 763 verdi, 1 rossa voluta (`D5`); 311 s; log intero conservato (`integrazione-giro7.log`). Nessun episodio, e nessuna sessione residua dai due client della prova del pool                                                                          |

⚠️ **Che cosa NON è stato conservato, e non va rifatto**: nei giri 1 e 2 l'uscita è passata da
un filtro di lettura che ha tenuto la riga del messaggio e **tagliato la fotografia allegata**
(`pg_stat_activity`, età delle transazioni, `pg_blocking_pids`) che `conStoricoSbloccato`
mette proprio dopo i due punti. È l'informazione che §21-bis dice di raccogliere «al momento»,
ed era lì. **Al prossimo episodio il log si salva intero, prima di leggerlo.**

⚠️ **Che cosa si può dire, e che cosa no:**

|                                                                                                                          |                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **due firme diverse**                                                                                                    | giro 1: pulizia **bloccata** (un lock in attesa) e una fotografia **senza** `ATTESA pid=` nella prova della diagnostica; giro 2: pulizia **non bloccata ma lenta** — 51 s per una transazione da 20 s, «Transaction already closed» — cioè di nuovo il tempo perso nel processo, la firma del giro 21 dell'08/09 |
| **il giro 1 potrebbe essere la catena di amplificazione** (una prova caduta trascina la pulizia dei file dopo)           | ⛔ **non è accertato**: la prima prova caduta è quella della diagnostica stessa, e la sua transazione trattenuta ha un `chiudi()` in `finally`. Se abbia lasciato qualcosa aperto non lo dice nessuna fotografia, perché la fotografia è quella tagliata                                                         |
| **i quattro file, isolati, sono verdi**                                                                                  | non esclude niente, per la ragione già scritta sopra: una regressione che si manifesta solo in sequenza è verde in isolamento per definizione                                                                                                                                                                    |
| **il codice applicativo era cambiato quel pomeriggio** (§25: `importProduct` in una transazione sola, con advisory lock) | ⛔ **non escluso come concausa**: la modifica tiene una connessione del pool per tutta la durata di ogni import, anche `skipped`. Nessuno dei file caduti passa dall'import, ma la suite gira in un solo processo con un solo pool                                                                               |

⛔ **§21-bis resta APERTA.** Il quarto e quinto giro della sola campagna del ciclo di utilizzo
(15 prove, 125–144 s) sono stati verdi: non contano, per la stessa ragione.

### ⏸ 21 · APERTO — un fallimento INTERMITTENTE, osservato una volta

> ⛔ **Non è risolto, e i giri verdi successivi non lo chiudono.** Un difetto
> intermittente che smette di comparire non è un difetto corretto: è un difetto che non si
> è ancora capito.

**Che cosa è successo**, l'08/09/2026:

```text
prova     ripristino-storico-shopify → «2b · un ESCLUSIONE decisa DOPO il backup non viene sovrascritta»
quando    suite di integrazione COMPLETA, primo giro che includeva il file nuovo di B1
esito     1 failed | 660 passed (661)
poi       verde in esecuzione isolata, verde nei due giri completi successivi
```

⚠️ **L'errore preciso non è stato conservato**: il filtro di riepilogo ha mostrato il nome
della prova e non il messaggio. È il primo dato da raccogliere alla prossima comparsa.

#### L'ipotesi, dichiarata come tale

⭐ La spec di B1 (`identita-negozio-shopify`) sostituisce **`fetch` globale** per simulare lo
scambio del token, e nella prima stesura **non lo ripristinava**. I file di integrazione girano
in sequenza nello stesso processo (`fileParallelism: false`), e in ordine alfabetico
`identita-…` precede `ripristino-…`, che passa dallo **Storage** — cioè da `fetch`.

⚠️ **È un'ipotesi coerente con l'ordine e con la coincidenza temporale, non una diagnosi**:
non è stata riprodotta. Lo `unstubAllGlobals` è stato aggiunto comunque, perché uno stub
globale che sopravvive al proprio file è un difetto a prescindere.

⛔ **Se ricompare**, servono: il messaggio d'errore completo, quali file hanno girato prima, e
se `fetch` risulta ancora sostituito. Finché non si riproduce, resta qui.

---

### ⛔ 19-bis · Criterio di chiusura — le GUIDE si allineano con la tranche

> **Deciso dal proprietario l'08/09/2026.** Una tranche non è chiusa finché le guide
> descrivono ancora il comportamento di prima.

⭐ **Le guide esistono già, e sono due**: non se ne crea un terzo manuale.

| Guida                          | Che cosa ci va                                                            |
| ------------------------------ | ------------------------------------------------------------------------- |
| `GUIDA-UTENTE-VESTIFLOW.md`    | le operazioni del negozio: Shopify, sync, sedi, cestino, prezzi, quantità |
| `GUIDA-OPERATORE-VESTIFLOW.md` | l'amministrazione della piattaforma: aziende, manutenzione, recupero      |

⛔ **Vincoli, trigger e motivazioni progettuali NON ci vanno**: restano nelle specifiche. Nelle
guide vanno le risposte pratiche, e sono sei per operazione:

```text
chi può farla · come si esegue · cosa cambia · cosa resta intatto
è reversibile? · cosa fare quando viene rifiutata
```

⛔ **Un'istruzione superata si CORREGGE, non si affianca.** Lasciare la versione nuova accanto
a quella incompatibile è peggio di non aggiornare: chi legge non sa quale delle due vale.

⭐ **E si distinguono sempre TRE stati**, perché confonderli fa promettere pulsanti che non
esistono:

|                           |                                                      |
| ------------------------- | ---------------------------------------------------- |
| **deciso**                | approvato nelle specifiche, **non** nel prodotto     |
| **implementato nel ramo** | c'è nel codice, **non** ancora installato da nessuno |
| **rilasciato**            | è quello che l'utente ha davanti oggi                |

⚠️ **Prima del rilascio si allineano anche HTML e PDF**, con gli strumenti già presenti
(`guide-print.css`). ⛔ Nessuna pubblicazione o distribuzione anticipata.

#### Il caso che ha fatto scrivere questo criterio

La guida utente consigliava di **rimuovere i dati importati** durante il cambio negozio —
«consigliato per evitare mix tra due negozi» — mentre §8.5.1 aveva poi deciso la gestione **non
distruttiva**, in cui i collegamenti si chiudono e i dati restano. ⚠️ **E quella decisione non è
implementata**: la correzione non poteva quindi presentare la procedura nuova come disponibile,
ma solo togliere il consiglio sbagliato e dire cosa fare oggi.

---

### ⛔ 20 · Criterio di completamento — la campagna end-to-end

> **Deciso dal proprietario l'08/09/2026.** Prima del rilascio e della chiusura del ramo
> serve una **campagna di simulazioni end-to-end riproducibili**, non soltanto test dei
> singoli metodi.

⭐ **Perché non bastano i test dei metodi.** Ogni difetto trovato in questa tranche è nato
**fra** componenti corretti: la fixture che non ripristinava i trigger, la prova di
concorrenza verde per il motivo sbagliato, le rotte del cestino raggiungibili senza registro,
la finestra fra `findFirst` e `updateMany`. Nessuno di questi lo trova un test unitario,
perché nessuno di questi sta dentro un metodo.

⛔ **«Riproducibile» ha tre requisiti**, e nessuno è facoltativo:

|                          |                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **dati versionati**      | il dataset sta nel repository (`api/src/test/fixtures/collaudo-shopify.dataset.ts`), non in uno script di sessione |
| **seconda esecuzione**   | ogni scenario si esegue due volte: la seconda deve dare lo stesso esito                                            |
| **bersaglio verificato** | prima di eseguire si accerta **quale** database, **quale** API, **quale** negozio                                  |

⭐ **Il piano è `docs/PIANO-COLLAUDO-SHOPIFY.md`**, in bozza: dieci famiglie di scenari, con
per ognuno situazione iniziale, azioni, atteso col rimando alla decisione, verifiche su UI /
API / database / Shopify, ambiente, ciò che manca, e lo stato.

⚠️ **Gli scenari si preparano e si collaudano PROGRESSIVAMENTE**; alla fine si ripete per
intero la parte pertinente al rilascio. Uno scenario passato tre settimane prima, su un ramo
diverso, non è una prova di rilascio.

⛔ **E un «non verificabile» non si converte in verde aggiungendo una regola.** Cataloghi
entrambi popolati senza collegamenti certi, giacenze iniziali e dettagli dell'onboarding
restano **da decidere**: è il risultato, non una lacuna del piano.

⚠️ **Copertura assente, dichiarata**: nessun negozio di sviluppo è stato autorizzato per la
campagna, il gate di contratto legge la credenziale dal **condiviso**, i webhook reali
arrivano solo alla produzione, e la vista Cestino non ha ancora i pulsanti. Il piano le
elenca in §6 invece di lasciarle intendere.

---

## SHOPIFY — stato al 06/09/2026

⛔ **Qui c'era «⏸ SHOPIFY — quello che questa tranche lascia aperto (03/09/2026)»**, con la
decisione dei 12 prodotti dichiarata da prendere. **È stata presa il 03/09**: vale il quarto
criterio di abbinamento — una variante locale libera si collega a una remota libera, e basta uno
SKU, un barcode, un'opzione vera o più di una candidata per lato perché non si applichi. La
regola è in `docs/24` §1.8 e nel codice (`shopify-variant-match.util.ts`).

### Comportamento ATTUALE, misurato il 06/09/2026

|                       |                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| migration             | **159/159 applicate**, zero pendenti, zero annullate                                                                                                          |
| ambiente «production» | Railway serve `main@9b59a14b`, CI verde, endpoint Shopify eseguiti dal codice nuovo. ⚠️ **Si chiama così, ma non serve attività reale**: nessun utente lo usa |
| prodotti collegati    | **178**; con almeno una variante senza GID: **18**                                                                                                            |
| i «12 nudi»           | **esistono ancora come record** (una sola variante, senza SKU, barcode né opzioni)                                                                            |
| database              | ⚠️ **soli dati di prova**, creati dal proprietario con account diversi, su sei tenant                                                                         |
| negozio Shopify       | ⚠️ **shop di sviluppo**, non un negozio commerciale                                                                                                           |

⭐ **Ne discende come si leggono le voci qui sotto**: sono correzioni **strutturali** da fare
prima che qualcuno usi davvero il gestionale, non emergenze su dati commerciali. Le prove
mutative sullo shop, quando autorizzate, si eseguono su entità di test con fotografia iniziale
e ripristino (`docs/24` §8.5.7).

### ⏸ Aperti — e ognuno dice PERCHÉ

| Cosa                                            | Stato                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **i 12 prodotti a variante nuda**               | ⚠️ regola **decisa e implementata**; la voce si chiude **solo dopo la prova sullo shop di sviluppo**, che non è stata fatta. Le prove esistenti sono unitarie                                                                                                                                                                                                                                                          |
| **media Shopify in stato `FAILED`**             | ⏸ aperto e **confermato nel codice**: `MEDIA_SELECTION` legge `media(first: 250) { nodes { id } }` — solo l'id, nessuno `status`. Un media fallito prende il suo id, non viene ricaricato, e l'immagine non arriva in vetrina senza che niente lo dica                                                                                                                                                                 |
| **creazione prodotto ancora su REST**           | ⏸ passa a `productSet` con la Tranche 2B; con lei l'abbinamento varianti di `persistShopifyIds`, oggi a solo SKU                                                                                                                                                                                                                                                                                                       |
| **metafield stagione e costo variante su REST** | ⏸ stesso cutover                                                                                                                                                                                                                                                                                                                                                                                                       |
| **azione massiva «Copia nome VestiFlow»**       | ⏸ decisa in `docs/24` §1.9, entra col menu delle azioni massive                                                                                                                                                                                                                                                                                                                                                        |
| **`apiVersion` mostrata nel pannello**          | ⚠️ **debito separato, NON bloccante** — riconfermato il 07/09/2026: viene dalla riga di connessione, aggiornata solo a una riconnessione (`shopify-oauth.service.ts:169`), mentre le chiamate usano `SHOPIFY_API_VERSION`. Un negozio registra `2025-01` e risponde correttamente a `2026-07`: è un valore **informativo stantio**, non un difetto di comunicazione col canale. Non blocca il modello dei collegamenti |
| **rifiuti HMAC invisibili**                     | ⏸ `verifyHmac` lancia 401 e nulla di più: nessun contatore, nessuna traccia, nessuna degradazione dello stato. ⭐ `lastWebhookEventAt` **esiste ora** ed è timbrato, quindi l'assenza di eventi si vede; il **motivo** no                                                                                                                                                                                              |
| **Location indovinata**                         | ⛔ **ora è VIETATO, non solo da chiudere** (`docs/24` §1.13, §12.4): senza collegamento esplicito nessuna quantità si sincronizza, e non esiste una sede di ripiego. `shopify-order-location.util.ts:52` ripiega ancora sulla prima sede in ordine alfabetico, e il valore letto non dice se è dichiarato o dedotto                                                                                                    |

### ✅ Il modello che manca è ora PROGETTATO — 06/09/2026, non ancora costruito

⛔ **Qui c'era «il meccanismo di "non ricreare" non esiste»**, come se fosse un buco senza
forma. Ora ha una forma: `ShopifyShop`, `ShopifyProductLink`, `ShopifyVariantLink` e il
registro delle consegne webhook, progettati per intero in `docs/24` §8.5.1-§8.5.6. Restano
**tre lavori di costruzione**, non più tre incognite:

| Direzione                                                | Cosa manca nel codice OGGI                                                                                                                                                                                                                                                                               | Dove il modello lo risolve                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Shopify elimina → VestiFlow deve saperlo**             | `SHOPIFY_WEBHOOK_TOPICS` **non contiene `products/delete`**: nessuna sottoscrizione, nessun evento in arrivo, mai                                                                                                                                                                                        | `docs/24` §8.5.6, §11.7                                                                                 |
| **404 su lettura/scrittura → deve significare qualcosa** | `shopify-admin-http.client.ts` intercetta il `404` **solo sulle `DELETE`** (e lo tratta come successo); su GET/PUT diventa un errore generico indistinguibile da un guasto di rete                                                                                                                       | `docs/24` §8.5.4 (classificazione: solo nodo GraphQL nullo o 404 di risorsa autenticata chiude un link) |
| **VestiFlow elimina → non deve rientrare dal pull**      | 🔴 **CONFERMATO ATTIVO, non solo assente**: `importProductFromWebhook` (`shopify-product-pull.service.ts:175`) cerca il prodotto con `findFirst({ shopifyProductId })`; se `null` **procede a `product.create` (riga 344)**. Un id mai visto e un id di un prodotto eliminato producono lo stesso `null` | `docs/24` §8.5.2 (le due tabelle di collegamento) + §8.5.4 (dove interrogarle nel pull/push)            |

⚠️ **La terza riga non è teorica**: è il comportamento che il codice produce **oggi**, appena
esisterà un comando di eliminazione definitiva locale (§0-bis voce 2, ancora non decisa). Va
costruita prima che quel comando lo sia, non dopo.

### ⚠️ PREREQUISITO DI COLLAUDO — cinque webhook su otto non sono registrabili, e non è un bug

Misurato leggendo il codice il 06/09/2026, non dedotto. `registerWebhooks`
(`shopify-admin.client.ts:212`) **tenta** la registrazione di tutti gli 8 topic — inclusi i
cinque protetti (`orders/create`, `orders/updated`, `orders/cancelled`, `customers/create`,
`customers/update`). `SHOPIFY_PROTECTED_WEBHOOK_TOPICS` **non filtra nulla prima** della
chiamata: viene letto solo **dopo**, in `shopify-oauth.service.ts:460-462`, per classificare un
fallimento già avvenuto.

**L'evidenza che il fallimento è di Shopify, non un difetto VestiFlow** — tre citazioni:

1. `shopify-webhook-topics.ts:27` — _«Richiedono Protected customer data approval su Shopify
   Partners.»_
2. `shopify-oauth.service.ts:467-472`, quando falliscono solo i protetti: _«Webhook giacenze
   attivo. Ordini e clienti richiedono permesso Protected customer data su Shopify Partners
   (app VestiFlow): riconnetti dopo averlo abilitato.»_ (`code: webhook_partial_registration`)
3. `shopify-oauth.service.ts:475-481`, se falliscono anche le giacenze: _«Webhook
   ordini/clienti non registrati: Shopify richiede Protected customer data sull'app
   VestiFlow…»_ (`code: webhook_registration_failed`)

⭐ **La UI lo mostra**: `shopify-integration-panel.component.ts:295` legge
`lastError.code === 'webhook_partial_registration'` — non è un difetto silenzioso, è un
permesso mancante comunicato all'operatore.

⚠️ **Che cosa comporta, con precisione**: `docs/24` §8.5.4 e §13.1 presuppongono che ordini,
resi e clienti **arrivino** via webhook per poter risolvere identificativi storici. Senza
l'approvazione «Protected customer data» non arriva nulla di tutto questo — non in ritardo, non
parziale. Nessuna riga di codice lo risolve: serve l'approvazione su **Shopify Partners**,
un'azione esterna al repository.

⛔ **E la riconciliazione non lo copre**: confronta il **catalogo**, quindi trova prodotti e
varianti mancanti anche senza webhook, ma ordini, resi e clienti sono un'altra materia.

⭐ **Non ferma lo sviluppo del ciclo di vita del catalogo**: è un prerequisito del **collaudo
completo** e della **futura entrata in esercizio**. I passi 2-6 e 9-12 della sequenza
(`docs/24` §8.5.7) si costruiscono e si verificano senza di esso.

### ⛔ Superato dal rilascio Cassa — non cercarlo più qui

Le tre voci «la produzione è ferma da 28 giorni», «dieci disallineamenti fra database e codice»
e «`purchase_price_minor` fa fallire ogni creazione da webhook» **non valgono più**. Restano
nominate solo perché chi le ricorda non le cerchi invano: il rilascio le ha chiuse tutte e tre.

⚠️ Ne resta **una traccia visibile e ingannevole**: la riga di connessione di uno dei due
negozi di prova porta ancora `lastErrorCode: product_webhook_failed` del 03/09 alle 23:40, col
messaggio sul vincolo `purchase_price_minor`. È un errore **storico** che il pannello mostra
come ultimo errore.

### ✅ Preflight del modello storico — eseguito il 07/09/2026

Fotografia anonimizzata, in sola lettura: **due connessioni**, entrambe `connected`, entrambe
con credenziale. Negozio A: 125 prodotti e 222 varianti collegati. Negozio B: 53 prodotti e 65
varianti. **Nessun prodotto collegato senza connessione risolvibile**, **nessun negozio su più
tenant**.

**Tredici controlli bloccanti, tutti a zero righe**: nessun duplicato di `shopifyProductId`,
`shopifyVariantId` o `shopifyInventoryItemId` (né dentro un tenant né fra tenant), nessuna
variante collegata con prodotto scollegato, nessuna incoerenza di tenant fra variante e
prodotto, nessun identificativo vuoto o con spazi. I dati di prova sono **coerenti**: il
backfill non dovrà correggere nulla — e non deve essere messo in condizione di farlo.

⚠️ **Gli identificativi salvati sono TUTTI numerici (legacy REST)**: 178 prodotti, 287 varianti,
zero in forma `gid://`. Le tabelle nuove useranno il **GID completo** (`docs/24` §8.5.1); le
colonne numeriche restano come cache di compatibilità e **non si toccano** in questa fase.

⭐ **`shop_gid` è acquisibile**: due letture in sola lettura hanno confermato che entrambi i
negozi espongono un Shop GID valido e distinto, col dominio coincidente con quello locale. Era
l'unico dato del backfill che non esisteva in locale.

---

## CICLO DI VITA DI ARTICOLI E VARIANTI — debito, attuale, richiesto (06/09/2026)

Le decisioni funzionali stanno in `docs/24` §1.11 e §1.12. Qui c'è solo lo scarto fra quelle
decisioni e il codice di oggi, diviso per quello che è: **debito**, **comportamento attuale**,
**comportamento richiesto**.

### 🔴 Debito tecnico — deciso da tempo, mai chiuso

| #   | Debito                                                                                                                                                                                                                                                                                                                                                                                 | Evidenza                                                                                                                         | Regola violata        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | **VestiFlow cancella prodotti su Shopify.** `DELETE /admin/api/…/products/{id}.json` parte da due pulsanti dell'interfaccia                                                                                                                                                                                                                                                            | `shopify-admin.client.ts:281` ← `shopify-product-push.service.ts:350` ← `channel-sync.facade.ts:198` ← `products.service.ts:960` | `docs/24` §11.1       |
| 2   | **82 prodotti di prova sono oggi eliminabili** anche da Shopify: origine VestiFlow, collegati, senza movimenti. ⚠️ **Dati di prova su shop di sviluppo**, non catalogo commerciale: è una correzione strutturale, non un'emergenza                                                                                                                                                     | misurato sul database il 06/09                                                                                                   | idem                  |
| 3   | **La guardia anti-cancellazione guarda dalla parte sbagliata**: le prove leggono il sorgente del **client GraphQL**, dove la cancellazione non c'è. Il client REST, dove c'è, non è sorvegliato                                                                                                                                                                                        | `shopify-graphql.client.spec.ts:561-564`                                                                                         | —                     |
| 4   | **Una variante che sparisce dal payload viene cancellata dal database**, con le sue giacenze, se non ha movimenti                                                                                                                                                                                                                                                                      | `products.service.ts:1176-1179`                                                                                                  | `docs/24` §14.3       |
| 5   | **Gli avvisi di eliminazione non nominano Shopify**: né nell'elenco né nel dettaglio. Chi preme non sa che il prodotto sparisce anche dalla vetrina                                                                                                                                                                                                                                    | `product-detail.component.html:97` · `product-list.component.ts:583`                                                             | `docs/24` §7.3        |
| 6   | **`lifecycleStatus` della variante esiste e non lo cambia nessuno**: nessun comando, nessun endpoint, nessuna azione                                                                                                                                                                                                                                                                   | modello `VariantLifecycleStatus`; nessun chiamante                                                                               | `docs/24` §7.1        |
| 7   | **«Sincronizza con Shopify» governa DUE assi**: spegnerlo ferma lo scambio dati **e** archivia il prodotto su Shopify in una sola operazione (`archiveOnSyncDisabled`). Il modello a tre assi separati li vuole indipendenti — ⚠️ **non si assume che l'archiviazione remota debba restare legata allo spegnimento della sincronizzazione**: è debito, non comportamento da conservare | `products.service.ts:929` → `shopify-product-push.service.ts:365-420`                                                            | `docs/24` §1.11, §3.1 |

⚠️ **Il debito #7 non ha ancora una correzione scritta**: la FORMA della separazione — che cosa
protegge lo stock mentre la sincronizzazione è spenta, se non l'archiviazione automatica — è un
punto aperto (`docs/24` §0-bis, voce 6), non una scelta implicita di questa riga.

### 👁 Comportamento attuale — vero, e non necessariamente sbagliato

- **Il push GraphQL non cancella varianti remote**: aggiorna solo quelle abbinate. Ne discende
  che una variante cancellata in VestiFlow **resta in vendita su Shopify**, orfana.
- **`mismatchDetected` esiste e non arriva all'operatore**: lo accende la riconciliazione, lo
  legge il republish, nessuna schermata lo mostra.
- **L'eliminazione locale è bloccata se manca `write_products`**: una regola remota impedisce
  un'operazione locale.
- ⭐ **Ordini, resi e inventario GIÀ rispettano la regola «non fermare gli eventi di
  sicurezza», verificato il 06/09/2026**: `applyOrderFromShopify` e
  `applyInventoryLevelFromShopify` (`shopify-sync.service.ts`) non leggono
  `Product.shopifySyncEnabled` — solo `products/create`/`products/update` lo controllano. Un
  ordine per un prodotto con la sincronizzazione spenta viene acquisito lo stesso, oggi, senza
  bisogno di nessuna correzione (`docs/24` §13.1).
- ⛔ **Ma non c'è niente da far passare per «cancellazioni remote»**: nessun webhook
  `products/delete` è sottoscritto, quindi quella categoria di evento non arriva mai, a
  sincronizzazione accesa o spenta che sia. Vedi la sezione Shopify qui sopra.

### 🎯 Comportamento richiesto

1. la cancellazione remota **non esiste più**: al suo posto ritiro dalla vendita o bozza;
2. la guardia automatica copre **entrambi** i client, REST compreso;
3. ⛔ **una variante salvata NON si cancella e NON si disattiva per assenza dal payload**: il
   suo stato cambia solo con un comando esplicito e verificabile («Disattiva» su quella
   variante). Una riga non ancora salvata si toglie dal form senza creare alcun record;
4. gli avvisi dicono che cosa accade **al negozio online**;
5. i comandi si chiamano **Disattiva**, **Riattiva**, **Ritira da Shopify**, **Rimetti in
   vendita su Shopify**;
6. la gestione massiva vive nel **registro Prodotti**, viste Articoli e Varianti, con riepilogo
   d'impatto prima e risultato con «riprova i falliti» dopo;
7. ⭐ **risolto il 06/09/2026 per «Disattiva»**: se il ritiro remoto fallisce, la
   disattivazione locale **non si annulla e non elimina nulla**; lo stato diventa **«Ritiro
   Shopify non riuscito»**, con retry automatico e manuale, e gli ordini nel frattempo
   continuano a essere acquisiti (`docs/24` §1.11). ⚠️ **Non si estende al comando esistente**
   «Sincronizza con Shopify» (§1.10), che oggi annulla lo spegnimento su fallimento: sono due
   comandi diversi, risolti in momenti diversi;
8. la riattivazione si ramifica sulla **presenza** dell'entità (`docs/24` §10.3): «Rimetti in
   vendita» se è ancora Collegata, «Pubblica nuovamente su Shopify» — comando diverso, nuova
   entità — se è stata Eliminata su Shopify;
9. un'eliminazione fatta **su Shopify** produce automaticamente lo stato «Eliminato su
   Shopify», ferma il push per quell'entità, e non ricrea nulla; la stessa regola vale per un
   `404` su lettura o scrittura (`docs/24` §11.7). ⛔ **Nessuno dei due meccanismi che
   dovrebbero innescarla esiste oggi** — vedi la sezione Shopify qui sopra;
10. una Bozza Shopify porta una **causale** (assenza di varianti vendibili, o ritiro manuale):
    solo la prima permette al prodotto di tornare attivo da sé quando si rimette in vendita
    una variante (`docs/24` §3.4). La struttura per questa causale non esiste ancora.

⚠️ **Nessuna riga qui sopra autorizza a toccare l'eliminazione locale del prodotto.** Se il
ritiro remoto debba bloccare o no il salvataggio della disattivazione locale resta un punto
aperto per il comando «Elimina» (`docs/24` §0-bis voce 2): il modello privilegia la
disattivazione reversibile e la conservazione del collegamento Shopify, non la cancellazione.

⛔ **Sette punti restano NON decisi** e non vanno dedotti: `docs/24` §0-bis, voci 1-2 e 5-7 del
06/09/2026 (la 3 e parte della 4 sono state chiuse dalle decisioni di oggi, sopra).

⭐ **L'ordine dei lavori è fissato in `docs/24` §8.5.7**, dodici passi dalla patch di sicurezza
alla rimozione delle colonne-cache, col **gate di collaudo mutativo** (passo 7) che precede
ogni comando di ritiro. Non si ripete qui: una sequenza scritta in due posti diverge al primo
cambiamento.

### 📝 Testo pronto per la guida utente — requisito preparato, pubblicazione differita

⭐ **Confermato dal proprietario il 06/09/2026**: la documentazione delle guide resta un
**requisito preparato**; le guide operative definitive si pubblicano **quando le funzioni
esisteranno davvero**.

I dieci casi sono quindi scritti qui, pronti, e **non** in `GUIDA-UTENTE-VESTIFLOW.md`: è la
stessa regola che questo documento applica altrove (vedi «Prima sincronizzazione Shopify», più
sotto) — _«scrivere in guida una funzione che non c'è è peggio che non scriverla»_. Nessuno dei
dieci casi esiste nel prodotto oggi: sono decisioni funzionali consolidate, non funzioni
costruite.

**Le due sedi corrette esistono già**, e non vanno duplicate:

| Sede                                                                                                            | Perché è quella giusta                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GUIDA-UTENTE-VESTIFLOW.md` §6, **«La casella Sincronizza con Shopify»** (riga 517)                             | è già dove il toggle sync/vendita è documentato: i comandi Disattiva/Riattiva/Ritira/Rimetti-in-vendita sostituiranno e amplieranno questo paragrafo, non ne apriranno uno nuovo                                                  |
| `GUIDA-UTENTE-VESTIFLOW.md` §14 troubleshooting, **«Ho eliminato un prodotto ma resta su Shopify»** (riga 1449) | descrive oggi correttamente il comportamento attuale (l'eliminazione locale cancella anche su Shopify) — diventerà falsa non appena la Tranche A-sicurezza sostituisce quella chiamata, e va riscritta in quel momento, non prima |

**Il testo, pronto da incollare quando le funzioni esisteranno** (voce per voce, nell'ordine
chiesto, con riferimento alla decisione che lo autorizza):

1. **Disattivare una variante** — «Disattiva» la rende non selezionabile nei nuovi documenti;
   se è in vendita su Shopify, VestiFlow te lo dice e la ritira anche online. Il collegamento
   resta: non stai eliminando niente (`docs/24` §1.11).
2. **Ritirarla solo da Shopify** — «Ritira da Shopify» toglie la variante dalla vendita online
   e la lascia attiva in VestiFlow: puoi continuare a venderla in negozio (`docs/24` §1.11,
   §10.2).
3. **Ultima variante vendibile** — se ritiri l'ultima variante in vendita di un prodotto, il
   prodotto su Shopify passa in Bozza: resta lì, non viene cancellato (`docs/24` §3.4).
4. **Riattivazione locale** — «Riattiva» rimette la variante fra quelle selezionabili in
   VestiFlow, ma **non** la rimette in vendita su Shopify da sola: sono due comandi diversi
   (`docs/24` §10.3).
5. **Rimessa in vendita Shopify** — «Rimetti in vendita su Shopify» usa le pubblicazioni che
   aveva prima del ritiro. Se nel frattempo il prodotto era stato rimosso dal titolare
   direttamente su Shopify, il comando disponibile diventa «Pubblica nuovamente su Shopify»
   (`docs/24` §10.3, §11.9).
6. **Eliminazione fatta nel pannello Shopify** — se elimini un prodotto o una variante
   dall'amministrazione Shopify, in VestiFlow non sparisce nulla: resta tutto, con lo stato
   «Eliminato su Shopify» (`docs/24` §11.7).
7. **Stato «Eliminato su Shopify»** — significa che l'entità non esiste più sul canale, ma
   VestiFlow conserva record, storico e identificativo per lo storico. Non prova a
   ricrearla da sé (`docs/24` §11.7, §11.8).
8. **Pubblicazione successiva** — «Pubblica nuovamente su Shopify» crea un prodotto nuovo, con
   un nuovo collegamento: non rianima quello vecchio. Se VestiFlow sospetta che qualcuno lo
   abbia già ricreato a mano su Shopify, te lo chiede prima di procedere (`docs/24` §11.9).
9. **Spegnimento della sincronizzazione** — ferma l'aggiornamento automatico di catalogo e
   giacenze verso Shopify. Non tocca da sola se il prodotto è in vendita o no: sono due cose
   separate (`docs/24` §1.11, §13.1). ⚠️ **Questo caso descrive il comportamento RICHIESTO, non
   quello attuale**: oggi spegnerla archivia anche il prodotto — vedi il debito #7 qui sopra.
   Non va scritto finché il codice non corrisponde.
10. **Operazioni massime e fallimenti** — dal registro Prodotti puoi disattivare, ritirare o
    rimettere in vendita più articoli insieme. Prima di partire, VestiFlow ti mostra quanti
    cambieranno davvero; alla fine, quanti sono riusciti e quanti no, con un pulsante per
    ritentare solo questi ultimi (`docs/24` §1.12).

⚠️ **Il caso 9 è l'unico dove il testo descrive un comportamento diverso da quello vivo oggi**:
va inserito per ultimo, e solo insieme alla correzione del debito #7.

## ⏸ IN SOSPESO DAL 02/09/2026 — la colonna prezzo, e cosa è saltato fuori indagandola

_Il proprietario: «salva il lavoro che stavamo facendo e che ha fatto uscire fuori questi
problemi, così lo riprendiamo dopo senza perderlo»._

> ⚠️ **VINCOLO DA TENERE PRESENTE, dichiarato dal proprietario**: _«VestiFlow deve poter
> vivere anche senza implementazione Shopify»_. I difetti qui sotto **non sono difetti di
> sync**: la transizione perde giacenze e collegamenti fornitore, che sono magazzino puro.
> Shopify aggrava, non causa.

### 1 · La colonna prezzo unica — ⭐ DECISA, fatta a metà

La decisione è in `03b` §«La colonna prezzo è una sola, in ogni documento». ✅ **Fatto**:
l'Arrivo merce (il selettore agganciato al ruolo, verificato a schermo). ⏸ **Resta**:

| Dove                 | Cosa                                               | Editabile       |
| -------------------- | -------------------------------------------------- | --------------- |
| **Ordine fornitore** | colonna «Prezzo netto/ivato» col selettore         | ⛔ sola lettura |
| **Trasferimento**    | colonna attivabile                                 | ⛔ sola lettura |
| **Rettifica**        | colonna attivabile                                 | ⛔ sola lettura |
| **Inventario**       | colonna per il **controllo prezzi dei cartellini** | ⛔ sola lettura |

⭐ **Nessuna migration**: dove è in sola lettura il prezzo si legge dall'anagrafica, non è un
dato del documento. Il Trasferimento è un `Document`, e `DocumentLine.unitPriceMinor` esiste
già — ma il suo DTO non ha campi monetari e il servizio scrive `0` cablato, quindi la colonna
arriverebbe a schermo e si salverebbe a zero. Per la sola lettura non serve toccarli.

### 2 · La catena dei prezzi verso l'anagrafica — quattro difetti misurati

⭐ **Cosa FUNZIONA** (verificato tracciando la catena fino al database): l'articolo **nuovo**
porta il prezzo su `Product` **e** su `ProductVariant`, a prescindere dalla spunta — come
deciso. ⚠️ Ma «sopravvive per caso»: nessun commento lo dichiara, tre lo contraddicono, e
nessun test lo copre.

| #   | Difetto                                                                                                                                                                                                                                                                                                                                                                             | Gravità  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| a   | ⛔ **Il prezzo del carico torna indietro.** Su articolo SEMPLICE l'Arrivo merce scrive solo la variante, l'anagrafica legge e riscrive da `Product`: al primo salvataggio della scheda — **anche solo un cambio di nome** — `mirrorSimpleProductPrice` riporta il valore vecchio, che poi va su Shopify. Serve un SECONDO carico perché accada: alla creazione i due nascono uguali | **alta** |
| b   | Il **prezzo Shopify** digitato su un articolo NUOVO è scartato in silenzio: il campo non esiste nel DTO, e la variante nasce con `shopifyPriceMinor = sellingPriceMinor`. ⭐ Il proprietario ha deciso: **eredita se non compilato** (già così), ma **va rispettato se compilato**                                                                                                  | media    |
| c   | Il **prezzo barrato** su articolo ESISTENTE è digitabile ma non ha destinazione: `compareAt` non compare in `applyArticlePriceUpdates`. ⭐ Deciso: **resta vuoto se non editato** (già così), ma va salvato se editato                                                                                                                                                              | media    |
| d   | `articlePricesReadOnly` è **codice morto** (una sola occorrenza: la propria dichiarazione) e tre commenti affermano che a spunta spenta i campi sono in sola lettura. Non lo sono. ⚠️ Chi lo «riparasse» collegandolo **romperebbe** il comportamento del punto ⭐ qui sopra                                                                                                        | media    |

#### Le due strade sul difetto (a), e perché conta la scelta

**Nessuno ha mai deciso chi comanda** fra `Product.sellingPriceMinor` e
`ProductVariant.sellingPriceMinor` su un articolo semplice: l'Arrivo merce tratta come verità
la variante, l'anagrafica l'articolo. Entrambi hanno le loro ragioni.

- **(a) l'Arrivo merce scrive anche `Product`** — i due restano allineati, e la scheda mostra
  il prezzo giusto. ⭐ Il caso «più varianti a prezzi diversi» **non si presenta**: la
  correzione userebbe la stessa guardia di `mirrorSimpleProductPrice`, che esce subito se
  l'articolo ha opzioni. Il codice oggi dichiara «se servirà, è una decisione a sé»: sarebbe
  quella decisione.
- **(b) l'anagrafica non riallinea se il prezzo non cambia** — salva il dato ma **lascia il
  numero sbagliato a schermo**: il difetto si sposta da «perdo il prezzo» a «vedo un prezzo
  che non è quello vero».

⏸ **Non decisa.**

### 3 · ⛔ Un articolo semplice che riceve varianti PERDE la variante anonima

_Domanda del proprietario: «posso avere l'articolo semplice e poi gli creo le varianti?
Questo farebbe saltare il sync con Shopify? È sbagliato come metodo generale?»._

⭐ **Il metodo NON è sbagliato**: «semplice, poi le varianti» è il modello Shopify ed è il
modello VestiFlow. **È l'implementazione della transizione che manca.**

La scheda «Varianti» in anagrafica permette di aggiungere opzioni a un articolo esistente.
Ma la variante anonima non viene convertita: **viene cancellata e ne nascono di nuove** — la
sua chiave sugli assi è vuota, le nuove sono «M», «L», nessuna corrispondenza.

| L'articolo           | Cosa succede                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ha movimenti**     | ⛔ salvataggio **fallisce con 409** «varianti da rimuovere hanno movimenti». L'operatore non ha chiesto di rimuovere niente: il messaggio non gli dice cosa ha sbagliato, e non ha modo di procedere |
| **non ha movimenti** | ⚠️ passa **in silenzio**: con la variante se ne vanno giacenze (`InventoryLevel`, `onDelete: Cascade`), collegamenti fornitore (`Cascade`) e id Shopify                                              |

⭐ **E il sync si spezza da entrambi i lati**: le varianti nuove nascono **senza SKU** («mai
generato in automatico»), e il riaggancio degli id Shopify avviene **solo per SKU** — quindi
le salta. Restano con `shopifyVariantId = null`, e il push delle giacenze si ferma sul
nascere.

⚠️ **Nessun avviso, in nessun punto**: i template della scheda non contengono le parole
«giacenza», «movimenti» o «attenzione».

⏸ **Da decidere**: se questo caso sia frequente nel lavoro reale. Se lo è, viene prima del
prezzo; se è raro, va messo in coda **con un avviso** che almeno impedisca il danno
silenzioso.

### 4 · Tre cose trovate strada facendo

- ⛔ **Un articolo importato da Shopify senza opzioni non è «semplice» per l'anagrafica.** Il
  pull gli dà `optionValues: [{ Title: 'Default Title' }]`, l'anagrafica ne ricava un asse
  «Title», e **al primo salvataggio** scrive `Product.options = [{ Title: [...] }]`. Da quel
  momento quell'articolo smette di essere semplice e il prezzo non si specchia più.
- ⚠️ **Le due guardie «articolo semplice» non coincidono**: il backend guarda
  `options.length === 0`, il client «nessun asse **e** varianti ≤ 1». Un articolo con
  `options: []` e 2+ varianti verrebbe **appiattito** sul prezzo dell'articolo. Non
  producibile dall'interfaccia; **dall'import di catalogo sì**.
- ⚠️ **`shopify_inventory_sync_states` non ha la chiave esterna**: lo schema dichiara la
  relazione, la migration non emette il `FOREIGN KEY`. Cancellata una variante, restano righe
  di stato sync orfane.

### 5 · I test che mancano

Nessuno copre: che il prezzo dell'articolo **nuovo** arrivi a `Product` e `ProductVariant`
(`quick-product-create.util.ts` **non ha un `.spec`**); che parta anche a **spunta spenta**
(la decisione del 02/09, oggi tenuta in piedi solo da dove passa il codice);
`mirrorSimpleProductPrice` (zero occorrenze nei test); e lo **scenario di sequenza** — carico
che cambia il prezzo, poi salvataggio dell'anagrafica — che è quello che perde il dato.

---

**Aggiornato:** 29/08/2026
**A che serve:** riprendere il lavoro in un'altra sessione **senza ricostruire niente**.
Ogni voce dice cosa è già misurato, cosa è deciso e cosa no.

⚠️ **Questo file era `DA-FARE-CORRISPETTIVI-E-SHOPIFY.md`.** Rinominato il 18/08/2026 su
indicazione del proprietario: le cose in sospeso non stavano più solo lì dentro — la
tabulazione delle anagrafiche, le soglie della vista a card, il netto/ivato in cassa non
hanno niente a che vedere coi corrispettivi, e tenerle sotto quel titolo voleva dire o
aprire un file per argomento, o scriverle sotto un nome che le nasconde. **Qui dentro sta
tutto ciò che è in sospeso**, qualunque sia l'area.

**Cosa NON va qui.** Le **specifiche** restano nei loro file numerati (`03` righe
documento, `04` numerazione, `10` Registro…) e le **regole** in `.claude/rules/`: quelli
dicono come una cosa deve funzionare, questo dice cosa manca. Quando una voce di qui
diventa una decisione stabile, si sposta lì e qui resta il rimando.

ATTENZIONE: il blocco in cima — **LAVORO IN CORSO, righe documento e varianti** — e' quello
aperto adesso. Il resto del file e' arretrato di aree diverse.

---

## 👁 CONTROLLI VISIVI IN SOSPESO

_Aperta il 02/09/2026 su richiesta del proprietario: «ora non ho la possibilità di
verificare, dobbiamo segnare i controlli visivi sui lavori svolti»._

⛔ **Build verde, lint pulito e test verdi non dicono come una cosa si VEDE.** Le
regressioni di layout non falliscono niente: una riga che non si ancora, una classe rimasta
orfana, un comando che sparisce invece di spegnersi. Qui si accumula ciò che aspetta un paio
d'occhi, e **si cancella la voce quando è stata guardata** — non prima.

⚠️ **Ogni voce dice cosa deve VEDERSI**, non cosa è stato scritto: chi verifica non deve
rileggere il codice per sapere se è giusto.

| #      | Dove                                                                                    | Cosa deve vedersi                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | **qualunque elenco**, trascinando il bordo di una colonna                               | La colonna arriva dove la si rilascia e **ci resta**; le altre cedono spazio senza che compaia una barra orizzontale. ⛔ Prima rimbalzava indietro e al secondo trascinamento **non si muoveva più**                                                                                                                                                                                                                                          |
| 2      | **qualunque elenco**, dopo aver regolato una colonna → **F5**                           | La larghezza è ancora quella. ⛔ Prima spariva a ogni ricaricamento                                                                                                                                                                                                                                                                                                                                                                           |
| 3      | Magazzino → **Inventario** (`/app/inventory/counts`)                                    | Il contenitore delle righe prende **tutta l'altezza** disponibile, e «N voci» sta **in fondo al contenitore** — non appoggiata sotto l'ultima riga col vuoto sotto                                                                                                                                                                                                                                                                            |
| 4      | Magazzino → **Inventario**                                                              | La colonna «Azioni» col cestino **non c'è più**. Selezionando una sessione **annullata**, «Elimina» in barra è attivo; selezionandone una **completata**, è spento e dice perché                                                                                                                                                                                                                                                              |
| 5      | **Dettaglio inventario** (`/app/inventory/counts/:id`)                                  | Ci sono selettore **Colonne** e pulsante **Filtri**; «Contato» è ancora un **campo dove si batte**; il Delta ha segno e colore; le righe con differenza si distinguono                                                                                                                                                                                                                                                                        |
| 6      | **Dettaglio inventario**, scansionando un articolo                                      | La sua riga **si accende per un momento** e la pagina ci scorre sopra se non è già in vista                                                                                                                                                                                                                                                                                                                                                   |
| 7      | **Ordini cliente** (`/app/sales`), scrivania **e** telefono                             | Il menu «···» **non c'è più** in nessuna delle due vesti. Con una riga selezionata, «Duplica» in barra è attivo e apre il duplicato                                                                                                                                                                                                                                                                                                           |
| 8      | **Ordini cliente**, card su telefono                                                    | Il piede della card mostra la sede senza lasciare un vuoto a destra dove stava il menu                                                                                                                                                                                                                                                                                                                                                        |
| 9      | **Ricerca giacenza** (`/app/inventory/lookup`), **da telefono**                         | Scrivendo «mag» non succede niente; alla **terza lettera** compaiono gli articoli da soli, senza premere nulla. Ogni riga ha miniatura, nome, n° taglie, disponibile e prezzo                                                                                                                                                                                                                                                                 |
| 10     | **Ricerca giacenza**, toccando un articolo                                              | Si apre la griglia **taglie × sedi** al posto dei risultati, con «Torna ai risultati» in cima. Toccando un numero si aprono gli ordini che lo impegnano                                                                                                                                                                                                                                                                                       |
| 11     | **Ricerca giacenza**, scansionando un codice                                            | Se il codice porta a un solo articolo, la sua scheda si apre **da sé** senza passare dall'elenco                                                                                                                                                                                                                                                                                                                                              |
| 12     | **Ricerca giacenza**, articolo senza immagine                                           | Al posto della foto c'è l'icona segnaposto, e la riga resta **alta uguale** alle altre — l'elenco non deve ballare mentre si scorre                                                                                                                                                                                                                                                                                                           |
| 13     | **Fattura, Fatt. accompagnatoria, Nota di credito, Proforma** — documento **nuovo**     | Al posto della tabella righe c'è uno **stato vuoto** che dice «Scegli il cliente e la sede». Scelto uno solo dei due, il testo nomina **quello che manca ancora**. Scelti entrambi, compare la tabella                                                                                                                                                                                                                                        |
| 14     | Gli stessi quattro tipi, **da telefono**                                                | Lo stato vuoto compare **al posto delle card**, non insieme a esse. ⛔ Prima la vista compatta era un `@if` separato: si vedevano tutte e due                                                                                                                                                                                                                                                                                                 |
| 15     | Gli stessi quattro tipi, aprendo una **fattura già salvata** priva di sede              | Le righe **ci sono**. Il blocco vale sui documenti nuovi: nasconderle su uno storico renderebbe illeggibile ciò che è già stato emesso                                                                                                                                                                                                                                                                                                        |
| 16     | **Arrivo merce** — testata                                                              | «Aggiorna costo in anagrafica» e «Aggiorna prezzi in anagrafica» stanno nella fascia **«Dati del documento ricevuto»**, accanto a «Seguirà registrazione fattura», ognuna su **una riga sola**. ⛔ Prima erano in fondo alla pagina, in una colonnina, col testo a capo su **quattro** righe                                                                                                                                                  |
| 17     | **Arrivo merce** — piede                                                                | Sotto le righe restano **solo** «Note documento» e «Commento interno». La banda finale è **più bassa** di prima, e il vuoto a destra della testata si è ridotto                                                                                                                                                                                                                                                                               |
| 18     | **Tutte e sei le maschere documento** — piede                                           | Le due caselle di testo sono alte **64px** invece di 96: il piede scende di 32px e li prende il contenitore righe. Le caselle restano **gemelle** (stessa altezza, fondi allineati) e si allargano ancora trascinando l'angolo                                                                                                                                                                                                                |
| 19     | **Arrivo merce, Fatture, Movimento, Trasferimento, Ordine cliente e fornitore** — righe | Il **Tab** gira fra le celle come prima, ←/→ escono ai bordi, ↑/↓ cambiano riga e in fondo ne creano una nuova. ⚠️ È la verifica dei ponti rimossi: 340 righe tolte da sei maschere, il comportamento deve essere identico                                                                                                                                                                                                                    |
| 20     | Le stesse sei, **premendo Tab su una colonna nascosta** dal selettore Colonne           | La colonna spenta viene **scavalcata**, non riceve il fuoco. ⚠️ Era il lavoro del filtro che è sceso dentro lo store                                                                                                                                                                                                                                                                                                                          |
| 21     | **Arrivo merce** — le tre spunte in fascia                                              |
| ~~26~~ | ✅ **Arrivo merce** — la colonna prezzo                                                 | **VERIFICATA dal proprietario il 02/09/2026**: `COSTO NETTO ⌄ · PREZZO IVATO ⌄ · PREZZO SHOPIFY · PREZZO BARRATO`. Una sola colonna prezzo, col chevron, nessun doppione. ⛔ Il selettore era **cablato e morto** dal 24/08 (la testata cercava `unitPrice`, che questa maschera non dichiara), e il primo tentativo di correzione aveva **aggiunto** una colonna invece di sostituirla — visto a schermo dal proprietario prima che dai test |
| 22     | **Ordine fornitore** — riga documento                                                   | Il Tab arriva su **«Cod. fornitore»**. ⛔ Prima si fermava lì e non faceva più niente: lo store cercava l'id `po-suppcode-N` mentre la riga comune rende `po-supplier-code-N`                                                                                                                                                                                                                                                                 |
| 23     | **Fattura, Proforma, Fatt. accompagnatoria, Nota di credito** — cella **U.m.**          | Ci si arriva col Tab da «Q.tà», e si esce col Tab verso «Prezzo». ⛔ Prima era una **trappola**: ci si entrava solo col mouse e non se ne usciva più con la tastiera — Tab, Shift+Tab e le quattro frecce non facevano niente                                                                                                                                                                                                                 |
| 24     | **Fatture, Rettifica, Trasferimento** — con un preset che spegne una colonna            | Aprire «Colonne» → preset **Magazzino** (toglie Prezzo). Il Tab da «Q.tà» **salta alla colonna successiva accesa**. ⛔ Prima si fermava, perché il giro cercava una cella non più nel DOM                                                                                                                                                                                                                                                     |
| 25     | **Arrivo merce** — accendendo la colonna **Descrizione**                                | Il Tab ci passa, fra «Nome prodotto» e «Q.tà». ⛔ Prima la scavalcava in entrambi i versi pur essendo un campo editabile                                                                                                                                                                                                                                                                                                                      |     | Ognuna sta su **una riga di testo**, non a capo. Cliccando l'etichetta si accende la spunta (l'associazione `for`/`id` è stata rifatta a mano dopo un errore di sostituzione) |

---

## ⛔ IL GIRO DEL TAB — quattro difetti, e perché un motore condiviso non basta

_Il proprietario: «il tab ha qualche problema». E poi, alla spiegazione: «ma se è un motore
condiviso, perché può dare problemi altrove?»._

> **Il motore è condiviso. La sua CONFIGURAZIONE no — ed è lì che sono i difetti.**

```text
DocumentLineFocusStore     condiviso ✅   la logica del giro
document-line-row          condivisa ✅   rende le celle e COMPONE gli id
elencoCampi + elementId    ⛔ per maschera, riscritti a mano, sei volte
catalogo colonne           ⛔ un terzo elenco, in un altro file ancora
```

⭐ **Tre elenchi che devono coincidere per convenzione, non per costruzione.** Il contratto
dello store dice «chiede l'id a chi lo conosce», ma **due posti diversi lo conoscono**: la
riga comune lo compone come `${idPrefix}-${alias}-${indice}`, e ogni maschera lo ridichiara.

⚠️ **È lo stesso schema del filtro dei campi corretto lo stesso giorno**: lo store possedeva
già l'elenco, ma la domanda «è mio?» stava fuori, ricopiata sei volte. Qui il dato che sta in
due posti è l'**identificativo DOM**.

### I quattro difetti, tutti PREESISTENTI (verificato con `git`)

| #   | Dove                                            | Cosa succedeva                                                                                                                                                  |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ordine fornitore**, campo «Cod. fornitore»    | Lo store cercava `po-suppcode-N`, la riga comune rende `po-supplier-code-N`. Il Tab **si fermava**: `focusField` tornava `false` e `next()` non guarda l'esito  |
| 2   | **Le quattro maschere Fattura**, cella **U.m.** | **Trappola del fuoco**: colonna accesa di serie, cella editabile, ma `unitOfMeasure` fuori dal giro. Ci si entrava col mouse e non se ne usciva con la tastiera |
| 3   | **Fatture, Rettifica, Trasferimento**           | `isFieldEnabled` non controllava la **visibilità di colonna** — le altre tre lo facevano. Con un preset che spegne una colonna del giro, il Tab si bloccava     |
| 4   | **Arrivo merce**, colonna **Descrizione**       | Campo editabile fuori dal giro: scavalcato in entrambi i versi                                                                                                  |

⚠️ **Nessuno faceva fallire niente**: `getElementById` di un id assente non lancia, e
`focusField` torna `false` a chi non lo legge. Nessun test copriva il giro del fuoco su
quelle maschere.

### Perché la U.m. era una TRAPPOLA e non solo un campo saltato

⭐ La discriminante non è «la cella è editabile»: è **chi annulla l'evento**.

| Cella                                                         | Cosa fa col tasto                        | Fuori dal giro                                                            |
| ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `select-cell` (Codice IVA) e `unit-cell` (U.m.), che la monta | `preventDefault()` **da sé**, poi emette | ⛔ **trappola**: il Tab nativo è già annullato e lo store scarta l'evento |
| `<input>` semplice (Costo, Prezzo, Prezzo barrato)            | emette e basta                           | ✅ nessun danno: resta il Tab del browser                                 |

⚠️ È il motivo per cui `sellingPrice` e `compareAtPrice` dell'**Ordine fornitore**, pur
essendo fuori dal giro, **non sono un difetto** — e per cui la guardia è stata ristretta:
una che segnala falsi positivi viene spenta.

### Le due guardie

- **`check:id-fuoco`** — confronta gli id che lo store CERCA con quelli che la riga comune
  RENDE. 58 campi su sei maschere.
- **`check:colonne-nel-giro`** — una colonna resa da una cella che annulla l'evento deve
  stare nel giro della maschera che la dichiara. Vale anche per le colonne **spente di
  serie**: si accendono dal selettore, e lì la trappola compare.

Entrambe falsificate reintroducendo il guasto vero.

⏸ **La correzione alla radice resta da valutare**: far DERIVARE l'elenco dei campi e la mappa
id dal catalogo colonne, invece di riscriverli. Toglierebbe la classe intera di difetti, ma
tocca il contratto condiviso di sei maschere.

---

## 🔎 LE DISCREPANZE FRA LE OTTO MASCHERE — censite il 02/09/2026

_Il proprietario: «a breve faremo un lavoro di ristrutturazione visiva comune, per questo
motivo voglio che tu completi queste discrepanze che esistono nei nuovi documenti quando
non sono giustificate da logiche che portano per forza a diversificare»._

⭐ **L'Arrivo merce usa tutti e tredici i pezzi condivisi.** È il riferimento, e non per
caso: `_document-form.scss` nasce come suo foglio, poi promosso al livello globale.

```text
                    1  2  3  4  5  6  7  8  9 10 11 12 13   scss  righe TS
Arrivo merce        X  X  X  X  X  X  X  X  X  X  X  X  X   NO     5.641
Registr. fattura    X  X  .  X  X  X  X  .  X  .  .  .  X   sì     1.840
Fatture (4 tipi)    X  X  X  X  X  .  X  X  X  .  X  .  .   sì     3.597
Movimento           X  X  X  X  X  .  X  X  X  .  X  .  X   sì     1.982
Trasferimento       X  X  X  X  X  .  X  X  X  .  X  .  .   sì     1.991
Ordine cliente      X  X  X  X  X  .  X  X  X  X  X  .  .   sì     5.709
Ordine fornitore    X  .  X  X  .  .  X  X  X  .  X  .  .   sì     2.981
Vendita al banco    X  .  X  X  .  .  X  .  X  .  .  .  .   sì     2.295

1 testata · 2 note · 3 riga comune · 4 stati di pagina · 5 avviso precompilazione
6 controparte · 7 cella testata · 8 giro del fuoco · 9 numerazione · 10 pannello prodotti
11 ricerca per codice · 12 allegati · 13 stampa
```

### Le assenze, e quali sono giustificate

| Assenza                                   | Verdetto                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **riga comune** — Registrazione fattura   | ✅ **giustificata**: le sue righe sono CONTABILI (Importo · IVA · Descrizione), non articoli                                                                                                              |
| **giro del fuoco** — Vendita al banco     | ✅ **giustificata**: al banco si scansiona, non si tabula fra colonne (`commitScan` su Invio)                                                                                                             |
| **ricerca per codice** — Registr. fattura | ✅ **giustificata**: stesso motivo della riga comune                                                                                                                                                      |
| ⏸ **area note** — Ordine fornitore        | **da decidere**: il modello `SupplierOrder` non ha le colonne. Non è un buco della maschera — è che il dominio non le prevede. Aggiungerle è una decisione di prodotto con migration, non un allineamento |
| ⏸ **allegati** — sei maschere su otto     | li hanno solo Arrivo merce e Registrazione fattura. Da capire se è una scelta o un arretrato                                                                                                              |
| ⏸ **stampa** — cinque su otto             | idem                                                                                                                                                                                                      |

### Discrepanze già chiuse il 02/09/2026

- ⭐ **Il filtro dei campi di riga** (`campoDiQuestoDocumento`) era ricopiato in **sei**
  maschere insieme a otto metodi-ponte identici: **340 righe** che rigiravano l'evento allo
  store del fuoco. Il filtro è sceso dentro `DocumentLineFocusStore`, che possiede già
  l'elenco dei campi, e i template chiamano lo store direttamente.
- ⭐ **L'elenco dei campi era scritto DUE volte per maschera** — la costante che definisce il
  tipo, e i `fields` passati allo store. Dovevano coincidere a mano: se divergevano, il
  filtro lasciava passare un campo che il giro non conosce, **in silenzio**. Ora la costante
  alimenta i `fields`. L'Arrivo merce lo faceva già: la forma esisteva, non l'aveva estesa
  nessuno.
- ⭐ **L'altezza delle caselle note era dichiarata due volte** (64px nella base, 96px nel
  piede) e la seconda sforava il tetto di `regole-stile-ui` §7 («max ~90px»). Ora una sola.

### 🗺 QUALI SONO LE OTTO MASCHERE, e cosa apre ognuna — 02/09/2026

_Il proprietario: «dimmi anche quali sono queste 8 e vediamo se devono rientrarci altri
documenti»._

> **Le otto coprono tutti i 17 tipi che hanno una maschera. Nessuno resta fuori.**

Elenco autorevole: `DOCUMENT_ROW_OPENS` in `document-routing.util.ts`, che è un `Record`
esaustivo per tipo — aggiungerne uno senza dichiararlo non compila.

| Maschera                   | Tipi che apre                                                                      | N   |
| -------------------------- | ---------------------------------------------------------------------------------- | --- |
| `customer-order-form`      | Ordine cliente · Preventivo · DDT vendita · **Vendita manuale**                    | 4   |
| `sales-document-form`      | Proforma · Fattura · Fatt. accompagnatoria · Nota di credito                       | 4   |
| `goods-receipt-form`       | Arrivo merce · Carico manuale · Carico iniziale                                    | 3   |
| `store-sale-document-form` | Vendita al banco · Reso al banco                                                   | 2   |
| `purchase-invoice-form`    | Registrazione fattura fornitore                                                    | 1   |
| `stock-operation-form`     | Rettifica                                                                          | 1   |
| `transfer-form`            | Trasferimento                                                                      | 1   |
| `supplier-order-form`      | Ordine fornitore                                                                   | 1   |
| —                          | **Inventario fisico**: nessuna maschera, flusso proprio in `/app/inventory/counts` | 1   |

⭐ **La mappa spiega le dimensioni.** `customer-order-form` ha 5.709 righe e sei fogli SCSS
perché fa **quattro mestieri diversi**: un ordine che impegna, un preventivo che non impegna,
un DDT che scarica, e una Vendita manuale che scavalca il motore dei movimenti. Non è
disordine gratuito.

⏸ **`stock-operation-form` (1.982 righe) e `transfer-form` (1.991) portano UN tipo ciascuna**,
e sono due operazioni di magazzino quasi gemelle. È la discrepanza di dimensione meno
giustificata delle otto: da guardare quando si affronta l'unificazione vera.

### 🔎 CONTENITORE PAGINA e TESTATE — censiti il 02/09/2026

_Il proprietario: «questo mi fa capire che probabilmente il contenitore pagina e testate
documenti non siano condivisi o in comune; tecnicamente non so come debbano essere, ma molti
differiscono tra loro e senza motivo»._

#### ✅ Il contenitore pagina È comune — e non era questo il problema

Tutte e otto aprono con `<section class="doc-form doc-form--m-ref">`. L'unica che aggiunge
qualcosa è l'**Ordine cliente**, con `co-form`.

#### ⛔ Ma il CSS proprio è distribuito in modo molto disuguale

```text
globale condiviso                        3.356 righe   _document-form (2.473)
                                                       _document-form-mobile (620)
                                                       _document-form-footer (263)

proprio, SETTE maschere insieme            381 righe
proprio, SOLO l'Ordine cliente           1.097 righe   ← quasi il TRIPLO delle altre sette
```

| Maschera           | Fogli | Righe     |
| ------------------ | ----- | --------- |
| **Ordine cliente** | **6** | **1.097** |
| Registr. fattura   | 1     | 138       |
| Vendita al banco   | 1     | 95        |
| Ordine fornitore   | 1     | 65        |
| Fatture            | 1     | 52        |
| Movimento          | 1     | 21        |
| Trasferimento      | 1     | 10        |
| **Arrivo merce**   | **0** | **0**     |

⚠️ **I due estremi raccontano due storie opposte.** L'Arrivo merce non ha foglio perché il
suo è stato **promosso** a `_document-form.scss`: è il riferimento. L'Ordine cliente ne ha
sei, e i nomi dicono che sono strati sovrapposti nel tempo — `mobile.scss`,
`mobile-cards.scss`, `mobile-polish.scss`, `reference-mobile.scss`: **quattro fogli per la
sola vista mobile**, di una maschera sola.

⏸ **Da decidere prima della ristrutturazione**: quanto di quelle 1.097 righe è dominio
dell'Ordine cliente e quanto è aspetto che dovrebbe stare nel livello comune. È il singolo
blocco che più può divergere dalla ristrutturazione visiva, perché è quello che il livello
comune non governa.

#### ⛔ La testata comune è configurata in tre modi diversi

`app-document-header` lo usano **tutte e otto** ✅. Ma:

```text
con [flowRow]="true"   Arrivo merce (fascia 1) · Registr. fattura · Fatture (fascia 1 e 2)
senza                  ARRIVO MERCE (FASCIA 2) · Movimento · Trasferimento
                       Ordine fornitore (×2) · Vendita al banco
```

⚠️ **`flowRow` decide se la fascia si distende** (flex a quote proporzionali) **o resta una
griglia a una colonna**. Non esiste una regola che dica quando si usa: cinque maschere su
otto non lo passano, e non è dichiarato se sia una scelta o un'omissione.

⛔ **La fascia 2 dell'Arrivo merce è l'unica combinazione del suo genere in tutto il
progetto**: un `document-counterparty-ref` in modalità fascia, dentro un `app-document-header`
**senza** `flowRow`. Le Fatture, che pure hanno due fasce, passano `flowRow` a entrambe e non
usano il counterparty-ref. È la combinazione che si vede rotta a schermo (fascia larga ~560px
su 1744, celle impilate a due per riga).

#### ✅ LA CAUSA, misurata in un browser vero e CORRETTA — 02/09/2026

> **La fascia non era «stretta»: era un grid item in UNA colonna su TRE.**

```text
div .doc-form__grid--header   1041px   grid → 336.328px 336.328px 336.344px   ← tre colonne
  ├ fieldset (contents)          0
  ├ counterparty-ref (contents)  0
  └ div .doc-form__header-row--secondary   336px   ← occupava UNA colonna
```

La causa è in `_document-form.scss` riga ~427:

```scss
@include bp.media-up('md') {
  .doc-form__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

⭐ **I numeri combaciano al decimale**: `(1041 − 2 × 16 di gap) / 3 = 336,3px`.

⛔ **Tre tentativi di fila hanno mancato il bersaglio**, e la ragione è una sola: su un grid
item `inline-size: 100%` vale il 100% **della sua colonna**, non del contenitore. Solo
`grid-column` cambia quante colonne occupa. Nessuna delle tre correzioni poteva funzionare,
e nessuna faceva fallire build, lint o i 3.212 test.

⭐ **La fascia 1 non ha mai avuto il problema** perché riceve `[flowRow]`, che porta il
contenitore a `display: flex` e rende le colonne irrilevanti.

✅ **Correzione**: `grid-column: 1 / -1` nel foglio di `document-counterparty-ref`, cioè nel
componente che rende la fascia. Vale anche per la **Registrazione fattura**, che usa lo
stesso componente nella stessa forma. **Verificata a schermo dal proprietario.**

⚠️ **La lezione, e vale oltre questo caso**: quattro letture del CSS non hanno trovato una
causa che una misura in un browser ha dato in dieci secondi. Per un difetto di layout la
prima mossa è misurare la catena reale, non dedurla — le regole possono essere tutte giuste
e il risultato sbagliato lo stesso.

#### ⏸ E resta il censimento: 29 componenti condivisi su 77 senza `display`

`app-document-header` non dichiara il proprio `display`, quindi il suo host è `inline`. Non
era **questa** la causa della fascia, ed è stato dichiarato comunque (`display: block`)
perché un componente che rende struttura deve essere un blocco.

Censito il 02/09/2026 su `domain/documents/components` e `shared/components`:

```text
48 dichiarano il display sull host
29 NO   — fra cui document-header, document-header-field, document-header-group,
          document-line-row, document-line-head, document-totals
```

⚠️ **Non tutti ne hanno bisogno**: un dialogo o un toast sono `position: fixed` e l'host
inline non conta. Ma i sei nominati qui sopra rendono **struttura** — fasce, celle di
testata, righe — e per loro l'host inline è una mina che esplode solo in certe combinazioni,
come è appena successo.

⏸ **Da fare prima della ristrutturazione visiva**: passarli uno a uno e dichiarare il
display che ognuno deve avere (`block`, `contents`, o `flex`). È lavoro piccolo e a rischio
basso, ma va fatto **guardando a schermo**: cambiare il display di un componente condiviso
cambia come si dispone in ogni maschera che lo usa.

### ⛔ LE TESTATE: sette maschere su otto non dimensionano i campi

_Il proprietario: «le discrepanze che più mi preoccupano sono sul contenitore delle righe,
sulle colonne e sulle testate»._

> **`--doc-field-min` dà a una cella di testata la misura del suo dato. Lo impostava
> l'Ordine cliente, e nessun altro.**

```text
customer-order-form    3 celle dimensionate sul dato
le altre SETTE         0
```

La fascia legge `flex: 1 1 var(--doc-field-min, var(--field-w-md))`: senza il canale, ogni
cella vale **176px** — una data larga quanto una ragione sociale — e la fascia **va a capo**
prima del necessario, lasciando il vuoto a destra che il proprietario ha cerchiato
sull'Arrivo merce.

⛔ **Il meccanismo esiste dal giorno in cui la fascia è passata a flex**, e il commento nel
foglio lo dava per risolto: «ora il minimo di un campo è la misura del suo dato, dichiarata
dal campo stesso». Dichiarata da **una** maschera.

✅ **Chiuso per l'Arrivo merce il 02/09/2026**: le tre celle di
`document-counterparty-ref` (tipo, numero, data) si dimensionano nel proprio foglio — è il
componente a sapere cosa contengono — e le quattro celle proiettate dalla maschera
(Pagamento e le tre spunte) con `style`, come fa l'Ordine cliente. Il knob è ora dichiarato
nella tabella dei punti di regolazione di `regole-stile-ui`.

⏸ **Restano sei maschere**: Registrazione fattura, Fatture, Movimento, Trasferimento,
Ordine fornitore, Vendita al banco. Ognuna va guardata a schermo dopo l'intervento — è una
taratura visiva, non una sostituzione meccanica.

### ⏸ Resta duplicato, e non è ovvio dove appartenga

Tre ponti dei **suggerimenti**, ancora identici in cinque maschere:
`onRowSuggestionNavigated`, `onProductSuggestionNavigate`, `onRowSuggestionPicked`
(~23 righe × 4 copie). ⚠️ Non passano dallo store del fuoco: parlano al pannello
suggerimenti, che ha uno store proprio. Vanno guardati con lo stesso criterio — «chi
possiede il dato risponde alla domanda» — ma la risposta non è la stessa e va verificata.

---

## 📏 LE SETTE MASCHERE DOCUMENTO: quanto è già unificato — misurato il 02/09/2026

_Il proprietario, guardando le righe di una fattura: «anche l'intera pagina di contenitore
dei nuovi documenti potrebbe essere condivisa senza duplicati? sarebbe meglio?». E poi,
guardando l'Arrivo merce: «ci sono documenti che sono ancora diversi e quindi sembra strano
che sia tutto condiviso»._

> **È già condivisa al 91%. Quello che resta nelle maschere non è duplicazione: è la
> configurazione del singolo documento.**

```text
23.324 righe di TS in sette maschere
   658 import su 721  (91%)  vengono da @domain / @shared / @core
```

| Maschera           | Righe | Import da livelli condivisi |
| ------------------ | ----- | --------------------------- |
| `customer-order`   | 5.777 | 124 / 133                   |
| `goods-receipt`    | 5.686 | 119 / 135                   |
| `sales-document`   | 3.653 | 103 / 112                   |
| `store-sale`       | 2.294 | 80 / 86                     |
| `transfer`         | 2.042 | 83 / 90                     |
| `stock-operation`  | 2.033 | 82 / 90                     |
| `purchase-invoice` | 1.839 | 67 / 75                     |

### Che cosa resta duplicato, diviso per quanto costa deciderlo

Misurati i membri di classe presenti in **almeno tre** maschere:

```text
157 membri condivisi da 3+ maschere
 51 IDENTICI parola per parola   →  ~615 righe    unificabili senza decisioni
106 DIVERGENTI                   →  ~4.201 righe  ma quasi tutti sono CONFIGURAZIONE
```

⛔ **Il numero grosso inganna, e va letto prima di usarlo.** I «divergenti» più costosi non
sono logica ricopiata: sono la dichiarazione di _questo_ documento, che per forza differisce.

| Membro                  | ×   | Forme | ~Righe | Che cos'è davvero                                          |
| ----------------------- | --- | ----- | ------ | ---------------------------------------------------------- |
| `lineFocus`             | 5   | 5     | 51     | **configurazione**: campi e id di `DocumentLineFocusStore` |
| `form`                  | 4   | 4     | 61     | **configurazione**: i campi del documento                  |
| `numbering`             | 4   | 4     | 32     | **configurazione** di `DocumentNumberingStore`             |
| `persist`               | 3   | 3     | 99     | logica vera, ma solo ×3                                    |
| `constructor`           | 4   | 4     | 82     | avvio: in parte logica, in parte cablaggio                 |
| `patchFormFromDocument` | 5   | 5     | 25     | logica vera, cinque forme distinte                         |

⭐ **`DocumentLineFocusStore` è già in `domain/documents/state/`**: le cinque «forme
divergenti» di `lineFocus` sono cinque elenchi di campi, non cinque copie di un motore. È il
motivo per cui la misura grezza va classificata prima di essere usata come arretrato.

### L'unico blocco sicuro da unificare, e perché non è stato fatto

Otto metodi, **identici parola per parola in cinque maschere** — il giro del fuoco fra le
celle di riga e la scelta dai suggerimenti:

```text
onRowSuggestionNavigated  ×5      onRowFieldKeydown   ×5      onRowLineAdvance  ×5
onProductSuggestionNavigate ×5    onRowFieldAdvance   ×5      onRowLineRetreat  ×5
onRowSuggestionPicked     ×5      onRowFieldRetreat   ×5
```

⚠️ **Sono PONTI, non logica**: tre-nove righe che passano dal template allo store condiviso.
Unificarli vale **~212 righe su 23.324 (0,9%)** e richiede di toccare **cinque template**,
perché è il template a chiamarli per nome.

⏸ **Non fatto: il rapporto fra rischio e guadagno va deciso dal proprietario**, non dedotto.
Le tre strade, se si decidesse di farlo: classe base astratta (tocca il meno possibile ma
introduce ereditarietà dove oggi c'è composizione), un helper esposto come proprietà (il
template chiama `righe.avanza(i, campo)`), o una direttiva sulla tabella.

---

## ⭐ L'AVVISO DI DISPONIBILITÀ — deciso il 02/09/2026

_Il proprietario, guardando la cella Q.tà: «potremmo anche toglierlo, il testo intendo, e
segnalare la casella col colore dell'avviso, così ad occhio capiscono della disponibilità.
Diversamente da mobile che bisogna valutare»._

> **Su SCRIVANIA l'avviso si legge dal COLORE della cella. Su MOBILE resta scritto.**

⭐ **Il colore c'era già e diceva la stessa cosa**: cella con fondo ambra, input con bordo e
testo ambra. Il testo dentro la cella era la **terza copia** dello stesso segnale, e nella
colonna più stretta della riga andava a capo — una seconda riga di testo per ogni riga in
eccesso, su una tabella densa.

⚠️ **Il dato non si perde**, che è ciò che `regole-gestionale` chiede — «mai un valore
leggibile solo dal colore»:

|                               |                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **col mouse**                 | il `title` sull'input dice «disponibili solo N» — c'era già                                                           |
| **con un lettore di schermo** | uno `sr-only` nella cella                                                                                             |
| **su mobile**                 | il testo **per esteso** nella card (`document-line-card`), dove non c'è passaggio del mouse e lo spazio verticale c'è |

### ⛔ E con lui cade la ragione dei 72px

Il catalogo dell'Ordine cliente diceva: «Q.tà ospita l'avviso: qualche pixel in più a lei».
**Falso**, e per tre ragioni indipendenti:

```text
lo STESSO commit (23/07) fa andare a capo l'avviso   white-space: normal · overflow-wrap: anywhere
la tabella è table-layout: fixed                     il contenuto non decide MAI la larghezza
dal 02/09 nella riga il testo non c'è più            resta il colore
```

⚠️ **La misura si era propagata per ereditarietà**: DDT vendita e Vendita manuale derivano da
quel catalogo, e il **Preventivo** eredita i 72px pur essendo l'unico documento che quell'avviso
non lo mostra mai. Il commento è stato corretto sul posto, lasciando scritto cosa diceva di
sbagliato.

⏸ **La larghezza canonica di `quantity` resta da decidere** — sei valori su sei cataloghi,
dichiarati in `DIVERGENZE_NOTE`. Il punto acquisito è che **non si decide guardando l'avviso**.

### ✅ Il testo, unificato

⛔ La Vendita al banco aveva una **terza copia** del messaggio, lunga sei volte l'originale —
«Quantità superiore alla disponibilità. Giacenza X, impegnata Y, disponibile Z. Si può
concludere comunque.», centosette caratteri dentro una colonna da ottanta pixel — e
contraddiceva il commento della funzione comune: «il messaggio, in un posto solo: due copie
divergono, e si vede tardi». Erano già divergenti. Ora passa da `availabilityHintText`.

### 🔴 Da fare: la colonna disponibilità dove serve

_Il proprietario: «la colonna disponibilità va prevista ovunque serva. Lo scarico e la
rettifica agisce direttamente sulle giacenze. Anche trasferimento, ma qui bisogna trattarlo
quasi come un documento come info contenute, l'operatore deve sapere cosa sta trasferendo»._

⛔ **Oggi Scarico, Rettifica e Trasferimento documentali tolgono merce e non avvisano
affatto**: né avviso né colonna disponibilità (`stock-operation-form`, `transfer-form`: zero
occorrenze di `availabilityHint`). È la stessa famiglia di difetti della Fattura
accompagnatoria, corretta il 26/08.

|                             |                                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scarico** · **Rettifica** | agiscono **direttamente** sulle giacenze: la disponibilità è il dato che governa il gesto                                                            |
| **Trasferimento**           | ⭐ **va trattato «quasi come un documento»**: l'operatore deve sapere **cosa sta trasferendo**, non solo quanto — quindi più di una colonna numerica |

⚠️ **Un difetto vicino, da correggere insieme**: l'Arrivo merce **dichiara** `stockAvailable`
e nessuno lo popola — accendendo quella colonna si ottengono celle vuote.

---

## 🔴 COMPLETARE LE COLONNE — riepiloghi e nuovi documenti

_Chiesto dal proprietario il 02/09/2026: «completiamo le colonne sia nei riepiloghi che nei
nuovi documenti»._

**Lo stato è misurato** dal censimento del 02/09/2026 (42 schermate, ogni area verificata da
un secondo agente incaricato di smentire il primo).

### Già a posto — 18 schermate

Undici elenchi sul motore comune più sette maschere documento: selettore Colonne, filtri di
colonna e **larghezze che si conservano** (`14` §22.3).

### ⏸ I riepiloghi che restano fuori

| Schermata                                                                     | Cosa manca   | Nota                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registro Corrispettivi**                                                    | le larghezze | ⚠️ La vista è **già registrata** e la visibilità colonne già si salva: manca solo che `corrispettivi-orders-table` passi `[viewId]` al motore. Una riga — ma accende anche i **filtri di colonna**, che lì oggi non ci sono: è una decisione, non un allineamento |
| **Utenti · Codici IVA · Sedi** (Impostazioni)                                 | tutto        | tabelle proprie. `regole-stile-ui` le dichiarava già come «non ancora nel motore»                                                                                                                                                                                 |
| **Scorte basse · Vendite recenti** (Dashboard)                                | tutto        | idem                                                                                                                                                                                                                                                              |
| **Riepilogo per sede** · **Dettaglio ordine online** · **Pannello analytics** | tutto        | tabelle proprie                                                                                                                                                                                                                                                   |
| **Varianti prodotto** · **Fornitori collegati** (scheda articolo)             | tutto        | dentro l'anagrafica, non elenchi autonomi                                                                                                                                                                                                                         |
| **Importazione prodotti** · **Importazione inventario**                       | —            | ⛔ **decise fuori** il 02/09: sono flussi di passaggio, le preferenze lì non tornano indietro a nessuno                                                                                                                                                           |

### ⏸ I nuovi documenti

| Maschera                                                                                                      | Stato                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Arrivo merce · DDT/Fatture · Movimento · Trasferimento · Ordine fornitore · Ordine cliente · Vendita al banco | ✅ colonne e larghezze (`createLineColumnWidths`, dal 24/08) |
| **Registrazione fattura**                                                                                     | ⏸ **non è lo stesso caso** — vedi sotto                      |

### ⭐ I sei cataloghi colonne: cosa vale unire — analisi del 02/09/2026

_Il proprietario: «massima attenzione a quelle nei documenti, devi vedere se sono condivise e
se e quali vale la pena unire, **forse nessuno perché hanno logiche diverse le righe**»._

**Confrontati tutti e sei colonna per colonna**, col comportamento di ognuna letto nella
maschera che la usa, e la proposta passata a tre lenti incaricate di demolirla (cosa si
perde, quanto costa, quali divergenze sono difetti).

> **L'ipotesi regge, e il fatto è più forte di come è stata formulata: non è che i cataloghi
> abbiano logiche diverse — è che NON CONTENGONO LOGICA.**

I sei file dichiarano **91 voci** per **31 concetti**, e il vocabolario **è già unico**:
`DOCUMENT_LINE_COLUMNS` con il tipo `DocumentLineColumnId`, che impedisce di inventare un id.
Quello che i cataloghi contengono è id, etichetta e larghezza. La logica sta già tutta nel
motore condiviso.

```text
11 concetti su 31  (35%)  appartengono a UN SOLO documento
17 su 31           (55%)  stanno in al massimo due
```

⛔ **E il comportamento editabile / sola-lettura non è nel catalogo**: lo decide
`haControllo(name)` in `document-line-row` — cioè se il form di quel documento ha quel
controllo. `sellingPrice` e `compareAtPrice` hanno id, etichetta e larghezza quasi identici
fra Arrivo merce e Ordine fornitore, e sono **editabili nel primo, in sola lettura nel
secondo**. Unire i cataloghi non toccherebbe questo di un millimetro.

#### ⛔ Perché la SELEZIONE non si unisce — e c'è un precedente misurato

Quali colonne ogni documento dichiara è il **90% del contenuto** dei sei file. Unirla
sposterebbe soltanto il punto in cui si sceglie il sottoinsieme, da un file di configurazione
a un elenco di id dentro un componente.

⚠️ **E il costo non è ipotetico**: il 24/08/2026 l'aggiunta di `loadsStock` a un catalogo
comune ha prodotto **due colonne «Imp.»** sull'Ordine cliente — la sua `commitsStock` più una
`loadsStock` che non dichiara. Da lì viene la prima riga di `isLineColumnVisible` in tre
maschere: «una colonna è visibile solo se QUESTO documento la dichiara». La selezione
separata non è un residuo storico: è la guardia contro un difetto già accaduto.

#### ⭐ Le tre cose che invece vale unire, e la scoperta che le motiva

⛔ **La `label` del catalogo NON è mai l'intestazione che l'operatore legge.**
`document-line-head` cabla le proprie stringhe (SKU, EAN, Articolo, Variante, Q.tà, U.M.,
Seriali, Azioni), e `{{ row.label }}` è letto **in un solo punto di tutta l'app**: il
selettore Colonne.

⚠️ **Il che produce un difetto visibile oggi**: l'operatore accende «Quantità» nel selettore
Colonne, e sulla colonna trova «Q.tà». Accende «U.m.» e trova «U.M.».

| Da unire                                             | Perché                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **le etichette**, col modello di `column-catalog.ts` | ⭐ La forma canonica **non va scelta**: è già scritta nella testata condivisa. Non si mettono d'accordo sei file fra loro — se ne allineano sei a un settimo che ha già ragione. Con `fisso: true` la divergenza diventa **impossibile da scrivere**, invece che segnalata da una guardia   |
| **`numeric` e `filter`**                             | `numeric` è proprietà del **dato**, non del documento — dichiararla sei volte è sei occasioni di sbagliarla e zero di deciderla. `filter` va con lei per la ragione opposta: nella riga documento è **inerte** (nessun controllo di filtro reso), eppure una guardia lo confronta fra i sei |
| **le larghezze delle colonne d'identità**            | `articleCode`, `sku`, `barcode`, `unitOfMeasure` sono **già identiche** ovunque. ⚠️ Ma come default **sovrascrivibile**: `product` va da 240 a 300px, e la ragione è scritta — senza prezzo, sconto e IVA quella riga ha spazio da dare al nome. Non è divergenza, è adattamento            |

#### ⏸ Da fare: la mappa «quale colonna è condivisa CON CHI»

_Chiesto dal proprietario il 02/09/2026: «altro controllo da fare dopo è se le colonne sono
condivise e se possono esserlo e con chi»._

⭐ **Metà della risposta c'è già** dall'analisi qui sopra: il vocabolario **è** condiviso —
`DOCUMENT_LINE_COLUMNS` con il tipo `DocumentLineColumnId`, 31 concetti, e nessun documento
può inventarne uno. E la distribuzione è misurata:

```text
6 id in tutti e sei     sku · barcode · product · variantLabel · quantity · actions
3 in cinque             articleCode · discount · vat
2 in quattro            unitOfMeasure · lineTotal
3 in tre                serials · unitPrice · stockAvailable
6 in due                supplierCode · unitCost · sellingPrice · compareAtPrice · loadsStock · commitsStock
11 in UNO SOLO          description · poOrdered · poReceived · poRemaining · shopifyPrice ·
                        lot · expiry · stockOnHand · discountedCost · purchaseCost · discountedPrice
```

⏸ **Quello che manca è la mappa nominale**: per ciascuno dei 31, quali documenti la
dichiarano e con quale comportamento — così si vede a colpo d'occhio chi condivide cosa con
chi, invece di leggere sei file.

⚠️ E la domanda «**possono** esserlo» ha già un vincolo noto: il comportamento
editabile/sola-lettura **non sta nel catalogo** ma in `haControllo(name)`, quindi due
documenti possono dichiarare la stessa colonna e renderla in modi diversi. La mappa deve
dirlo, o suggerirebbe unificazioni che non stanno in piedi.

#### Le quattro divergenti, guardate una per una — 02/09/2026

⛔ **Delle quattro segnalate dall'analisi, solo UNA era un difetto.** Le altre tre sono
decisioni, o un caso più profondo. È il motivo per cui vanno aperte una per una invece di
allinearle in blocco.

| Colonna                               | Esito                                                                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`quantity`**                        | ✅ **allineata a «Q.tà»** — la testata ha una forma sola (`<span title="Quantità">Q.tà</span>`), e i cataloghi che dicevano «Qtà» e «Quantità» sono passati a lei. Due righe di diff                                                                |
| **`commitsStock`** · **`loadsStock`** | ⛔ **non sono difetti: sono decisioni, e sono scritte nel codice.** La testata non cabla quelle etichette, le **riceve** (`stockToggleLabel`), e il commento dice perché: «lo stesso campo dice _Carica giacenze_ su un reso e _Scarica_ su un DDT» |
| **`product`**                         | ⏸ **resta aperta, e la ragione è un'altra da quella che sembrava**                                                                                                                                                                                  |

##### ⛔ `product`: la testata diverge DA SÉ

Stavo per allineare i cinque cataloghi a «Articolo», sulla premessa che la testata condivisa
avesse già la forma canonica. **La premessa è falsa**, e va scritta perché è il genere di
errore che si ripete:

```text
document-line-head, colonna «product»
  ordinabile        <button>  «Nome prodotto»     riga 140
  non ordinabile    <span>    «Articolo»          riga 151
```

La stessa colonna, nella stessa testata, con due parole diverse a seconda che sia ordinabile.

⭐ **Quindi la forma canonica non esiste ancora**: allineare i cataloghi all'una o all'altra
sceglierebbe per il proprietario invece di chiedergli. Prima si decide **che parola porta
quella colonna**, poi si allineano sei cataloghi **e due rami della testata**.

⚠️ Il ripristino è stato chirurgico: la Vendita al banco è tornata a «Articolo» — l'unica che
lo diceva — invece di restare uniformata per sbaglio.

⭐ **La lezione di metodo**: «la testata ha già ragione» era un'ottima ipotesi e reggeva per
`quantity`. Per `product` no, e a smentirla è bastato leggere le dodici righe intorno
all'etichetta invece della sola etichetta.

---

### ⛔ Registrazione fattura: NON è «l'ottava rimasta indietro»

⚠️ **Qui c'era scritto il contrario** — «sette maschere su otto hanno lo stesso sistema e la
ottava no, non c'è una decisione da prendere, solo da allinearla». **Sbagliato**, e corretto
il 02/09/2026 aprendo il template invece di fidarsi del censimento.

> **Quella maschera non ha righe ARTICOLO: ha righe CONTABILI.**

```text
righe articolo (le altre sette)   codice · articolo · quantità · prezzo · sconto · IVA · totale…
Registrazione fattura             Importo · IVA · Importo IVA · Descrizione
```

Registra gli **importi di una fattura fornitore ricevuta**, non la merce: non c'è un
articolo, non c'è una quantità, non c'è un magazzino da muovere. Ha anche una seconda
tabella — le **rate** (Data scadenza · Importo · Saldato · Data saldo) — che nelle altre
maschere non esiste affatto.

⭐ **Con quattro colonne tutte necessarie, un selettore Colonne non ha niente da offrire**:
quale si spegnerebbe, l'IVA? La descrizione? E le larghezze si conservano per chi trascina,
ma su quattro colonne che stanno già tutte in riga nessuno trascina.

⏸ **Resta da decidere**, e la domanda giusta è un'altra: se convenga dare **alle rate** o
alla riga contabile qualcosa del motore comune — non se «allinearla alle altre sette».

---

## 🧹 CODICE MORTO — `product-review-step`, e la lezione che porta con sé

_Trovato dal censimento del 02/09/2026, mentre si misurava lo stato delle tabelle. Il
proprietario ha chiesto di «analizzare bene, vedere cos'era e decidere se pulire in modo
controllato»._

### Cos'era, e da quando non serve

|                 |                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Cos'era**     | il passo **«Riepilogo»** del wizard di creazione prodotto: mostrava in sola lettura dati generali, opzioni e varianti generate **prima di salvare**. Presentazionale, nessuna logica |
| **Nato**        | 08/06/2026 — `b7512885`, «add review step with full product summary»                                                                                                                 |
| **Orfano da**   | **19/07/2026** — `c3abd6db`, «anagrafica prodotto a 4 tab»: il wizard a passi è stato sostituito, e con lui il passo di revisione                                                    |
| **Quanto pesa** | quattro file (ts, html, scss, spec)                                                                                                                                                  |

⭐ **La funzione non è stata persa: è stata sostituita.** Con le quattro schede si vede tutto
mentre si compila, quindi un riepilogo prima del salvataggio non ha più un momento in cui
servire. Togliere il componente non toglie niente all'operatore.

⭐ **E non produce cascata**: le cinque util che importa — `selectedOptionValue`,
`variantOptionNames`, `productStatusLabel`, `productStatusTone`, `moneyFromMajor` — sono
usate da tre a cinque altri file ciascuna. Si porta via solo se stesso.

### ⛔ Perché nessuno se n'era accorto per 45 giorni

> **Ha un proprio `.spec.ts`, e quei test passano.**

⚠️ **È il caso più insidioso del codice morto**, e vale la pena scriverlo perché si
ripeterà: un file provato sembra un file vivo. La suite è verde, la copertura lo conta, e
nessun controllo distingue «provato» da «usato». Gli altri tre passi del wizard —
`product-general-step`, `product-options-step`, `product-variants-step` — sono invece
ancora montati dall'anagrafica: la differenza non si vedeva da nessuna parte.

⚠️ **Le regole di progetto danno 30 giorni** («Codice non toccato»: rimuovi entro 30 giorni
dall'identificazione, con `ts-prune` o equivalente). Nessuno strumento del genere gira in
CI, ed è per questo che la scadenza non è mai scattata.

### Non era solo, ed erano quattro — censimento del 02/09/2026

Cercato in tutto il repository (componenti, servizi, util, API, stili), con un verificatore
per famiglia incaricato di **smentire** i ritrovamenti. Esito: **63 elementi**, di cui
**5 smentiti** dai verificatori.

#### I quattro componenti — 1.651 righe

| Componente                       | Righe | Cos'era, e perché è morto                                                                                                                                                                                                             |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProductReviewStepComponent`     | 341   | il passo «Riepilogo» del wizard — sostituito dalle 4 schede il 19/07                                                                                                                                                                  |
| `ListFiltersComponent`           | 527   | il contenitore comune dei filtri — superato dalla decisione del **29/08**: «i filtri di un elenco stanno nelle sue COLONNE», e il pannello è passato al telaio                                                                        |
| `PaginationComponent`            | 447   | il paginatore condiviso — **migrazione completata**: nessun elenco impagina più                                                                                                                                                       |
| `DocumentLineMoneyCellComponent` | 336   | la cella d'importo di riga documento: ⛔ **non è stata superata, non è mai stata cablata**. Nata gemella di `document-line-unit-cell` e `document-line-code-cell`, che sono entrambe usate — `document-line-row` non l'ha mai montata |

⭐ **Tutti e quattro hanno un proprio `.spec.ts`**, ed è la ragione per cui sono sopravvissuti:
i test passano, la copertura li conta, e nessun controllo distingue «provato» da «usato».

#### Le funzioni — 59 fra `src/` e `api/`

Predicati di permesso, wrapper già marcati `@deprecated`, util di calcolo, tre endpoint API
mai chiamati dal client (`/customers/preview-code`, `/suppliers/preview-code`,
`/online-sales/by-order/:id`). Sono piccole — dalle 3 alle 50 righe.

⚠️ **Verificato un sospetto grave, e smentito**: i predicati di permesso morti
(`canViewSupplierOrders`, `canViewInventoryAllLocations`, `isTenantAdmin`…) potevano essere
**controlli dimenticati** invece che codice morto — cioè porte senza guardia. Non lo sono:
il permesso di **vista** è imposto dalla rotta (`tenantPermissionGuard` coi gruppi), quello
di **gestione** dal componente con un predicato diverso e vivo. La funzione c'è, il predicato
inutilizzato è un doppione.

#### ⛔ Cinque smentiti dai verificatori

Il più istruttivo è `DataTableRowActionsDirective`, dichiarata morta e invece **viva**: la usa
il motore tabella (`contentChild` + `ngTemplateOutlet`) e la sorveglia una guardia dentro
`npm run lint`. Anche `view-mode.model.ts` è stato smentito.

⚠️ **Un falso positivo di metodo, riportato dall'agente stesso**: cercare `<app-customer-form`
aggancia anche `<app-customer-form-fields`. Chi rifà questa analisi deve usare il confine
`<selettore([[:space:]/>]|$)`, o conta usi che non esistono.

### ⏸ Da decidere

- **Cosa togliere e in quanti passi.** I quattro componenti sono il caso netto; le funzioni
  sono molte e piccole.
- ⚠️ **Le guardie e le allowlist che puntano al codice morto vanno potate insieme**, o
  restano a validare il vuoto — lo segnala il censimento stesso.
- **Se serve una guardia nuova**: un controllo sui componenti mai istanziati impedirebbe al
  prossimo di restare 45 giorni. ⚠️ Va pesato: il progetto ha già oltre cinquanta guardie in
  `npm run lint`, e ognuna costa a ogni commit.

⚠️ **E questo documento ha una voce superata da correggere**: dice ancora «restano cinque
elenchi che impaginano ancora… `<app-pagination>` via». Non è più vero — è esattamente il
testo morto che `regole-qualita` vieta.

---

## 🔴 APERTO ORA — le cinque cose chieste il 01/09/2026

_Dettate dal proprietario dopo il rifacimento dell'anagrafica fornitore, in un messaggio
solo. Sono elencate nell'ordine in cui le ha dette; **i filtri restano per ultimi**, come
ha chiesto («poi passiamo ai filtri che abbiamo lasciato in sospeso»)._

| #   | Cosa                                                                                                                             | Stato                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A   | **Anagrafica CLIENTE come quella fornitore**                                                                                     | ✅ fatto (catalogo colonne compreso)               |
| B   | **Colonne del riepilogo fornitore** = i campi dell'anagrafica, principali attive di serie, **larghezza per tipo di dato**        | ✅ fatto                                           |
| C   | **Dettaglio fornitore**: togliere gli articoli collegati · vestirlo meglio · **decidere se le pagine di dettaglio si unificano** | ✅ fatto (l'unificazione: risposta col censimento) |
| D   | **I bottoni delle pagine fornitore sono più grandi degli altri**                                                                 | ✅ fatto                                           |
| E   | **I filtri**, ripresi da dove erano rimasti (modello Danea: selezione multipla, esclusione)                                      | ✅ fatto                                           |

### ✅ A — L'anagrafica cliente _(chiusa il 01/09/2026)_

Stesso lavoro del fornitore, e ora la **grammatica è scritta una volta sola**:
`styles/_anagrafica.scss`, mixin `anagrafica-fields($blocco)`, incluso dalle due schede.
Larghezze per contenuto, ordine di battitura, avvisi di digitazione, densità a **26px**
(`--control-h-entry`, sceso da 28 su richiesta del proprietario).

⭐ **Verificato in un browser vero** a 1440: 25 campi, scheda alta **945px**, nessuno
scorrimento orizzontale, giro del Tab nell'ordine di battitura (denominazione → fiscale →
indirizzo → contatti).

⭐ **E la spunta «Attivo» c'è**: `Customer.isActive` esisteva già nel database e nella
vista API, ma **nessuna maschera lo scriveva** — lo stesso buco del fornitore. Ora il DTO,
il servizio e il form lo portano fino in fondo.

⭐ **IBAN e cellulare** sono comparsi anche qui senza migration: stanno sul **soggetto**,
quindi sono lo stesso dato della scheda fornitore. Chi è cliente e fornitore ha un conto
solo, e si aggiorna da entrambe le schede.

⭐ **Costa poco adesso**: `domain/fiscal/` (P. IVA, codice fiscale, IBAN, CAP, provincia),
`app-form-section` e i token esistono già. E **IBAN e cellulare sono già nel database sul
soggetto**, quindi il cliente li eredita **senza migration**.

⭐ **E le COLONNE dell'elenco vanno rese comuni ai due** — indicato dal proprietario il
01/09/2026 spiegando perché Danea mette «Tipo» per primo: _«saranno colonne condivise che si
ripartiscono le schermate. Questa sarà condivisa con clienti»_.

Oggi `SUPPLIER_LIST_COLUMN_DEFS` sta in `features/suppliers/models/` ed è dei soli
fornitori, ma **i campi sono gli stessi perché è lo stesso soggetto**: codice, denominazione,
codici fiscali, indirizzo, contatti, note. Restano di ruolo solo sconto, pagamenti, IVA
predefinita, trasporto, IBAN/banca (fornitore) e SDI, listino, Shopify (cliente).

✅ **Estratto il 01/09/2026, quando i consumatori sono diventati due**:
`shared/table-columns/anagrafica-columns.ts` dichiara i segmenti del SOGGETTO — fiscali,
indirizzo, contatti, pagamento, IBAN, trasporto, sito, stato ruolo, ruolo gemello — e i due
elenchi li compongono con le proprie colonne di ruolo.

⛔ **Non un array unico con bandierine**: i due elenchi hanno colonne diverse (Ns. banca e
Porto di qua, Codice destinatario e Note commerciali di là), e un array solo avrebbe
richiesto interruttori per spegnerne metà.

⚠️ Nel catalogo fornitore «Anche cliente» è già in prima posizione, che è la posizione del
«Tipo» di Danea: quando i due elenchi condivideranno le definizioni, sarà il discriminante
che dice di quale dei due parla la riga.

⚠️ Il cliente ha in più il **codice SDI**, che il fornitore non ha: il controllo di forma
sta già scritto in `docs/06b` §B.4, con la contraddizione dichiarata sui 6 caratteri della
PA — va letta prima di implementarlo.

### B — Le colonne del riepilogo fornitore

> _«Adesso sappiamo quali colonne potrebbero essere selezionate nel riepilogo fornitore,
> sarebbero quelle dell'anagrafica. Di default facciamo partire le colonne principali
> attive e magari, se riusciamo, diamo una grandezza non obbligata ma di partenza consone
> al tipo di colonna.»_

Due cose distinte:

1. **Il catalogo**: le colonne attivabili diventano i campi dell'anagrafica (compresi i
   tre nuovi: IBAN, cellulare, Ns. banca). Le principali accese di serie.
2. ⭐ **La larghezza per TIPO di dato**, non obbligata ma di partenza: «cap e codice
   fornitore saranno molto ristrette, città leggermente più grande, denominazione ancora
   più larga, altre hanno campi obbligati e quindi conosciamo la larghezza».

⚠️ **Il motore ha già `widthOf`**, che deduce la larghezza dal tipo di colonna
(`regole-stile-ui` §6): il lavoro è dichiarare il tipo sulle colonne dell'anagrafica, non
inventare un secondo meccanismo.

### C — Il Dettaglio fornitore, e la domanda che vale per tutti

Tre pezzi, e il terzo è una **domanda di progetto**, non un compito:

- ⛔ **Togliere gli articoli collegati** dal Dettaglio fornitore.
- ⛔ **Vestire meglio la scheda.**
- ⏸ _«Il dubbio che mi viene è che la pagina dettagli può avere il componente condiviso
  con tutte le altre? Può essere unificata? Ottimizzata?»_

⚠️ **La domanda va risposta con un censimento, non a intuito**: esistono già
`_detail-page.scss` (mixin) e `app-detail-facts` (griglia etichetta/valore). Serve sapere
quante pagine di dettaglio ci sono, cosa hanno davvero in comune e cosa è proprio di
ognuna — e solo allora decidere se un componente condiviso è giustificato o se le
differenze sono troppe (la regola «quando NON estrarre» di `regole-architettura` vale
qui).

### D — I bottoni delle pagine fornitore

> _«I tasti di tutte le pagine che riguardano fornitore sono grandi rispetto agli altri.»_

⚠️ Da misurare a schermo prima di toccare: l'ipotesi è che le pagine fornitore **non
includano** la dichiarazione di densità che le altre hanno, non che abbiano una regola in
più. Le due cose si correggono in modo opposto.

### ✅ «Stato ruolo»: risolto lo stesso giorno — scelta la strada 1

Il proprietario ha scelto: _«a questo punto facciamo la 1. disattiviamo»_. La maschera
fornitore ha ora la spunta **«Attivo»**, accanto a «È anche cliente». Meccanismo verificato
sul database (tabella in `ANAGRAFICA-CANONICA-SPEC`), guida utente aggiornata con i due
interruttori.

✅ **Fatto anche sul CLIENTE** il 01/09/2026, con §A: la maschera ha la spunta «Attivo»
accanto a «È anche fornitore», e il percorso di scrittura (DTO → servizio → `Customer`)
esiste da oggi.

Qui sotto resta la diagnosi, perché spiega perché il difetto era invisibile.

### ⛔ Com'era: «Stato ruolo» non si impostava da nessuna parte _(01/09/2026)_

Domanda del proprietario: _«nel riepilogo del fornitore c'è uno "Stato ruolo" attivo, ma non
so cosa sia e dove si imposta»._ **Non si imposta: da qui, non si può.**

`Supplier.isActive` è lo stato del **ruolo** — disattivato significa «escluso dai nuovi
utilizzi, storico intatto». Cercato chi lo scrive, in tutta l'API:

```text
customers.service.ts:352   supplier.update({ isActive: false })   ← toglie la spunta «È anche fornitore»
                                                                     sulla scheda CLIENTE
suppliers.service.ts:671   isActive: original.isActive            ← la duplicazione copia il valore
```

⛔ **Non c'è nessun altro scrittore.** Dalla scheda fornitore, dalla sua maschera e dal suo
elenco non esiste un comando che lo cambi: un fornitore nasce attivo e resta attivo per
sempre, a meno che lo stesso soggetto sia **anche cliente** e qualcuno tolga la spunta «È
anche fornitore» **dalla scheda cliente**.

⚠️ **Quindi la colonna mostra uno stato che quella pagina non governa**, e nella pratica dice
sempre «Attivo». Le strade sono due, ed è una decisione:

|                           |                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Dargli un comando**     | una spunta «Attivo» nella maschera fornitore, come «È anche cliente» — così la colonna diventa utile |
| **Toglierla dall'elenco** | se il ruolo si disattiva solo di rimbalzo dal cliente, la colonna è rumore                           |

⚠️ **La stessa asimmetria vale al contrario sul cliente** (`customers.service.ts:298`): lì la
spunta c'è, ed è per questo che il difetto si vede solo da questa parte.

### ✅ E — I filtri _(chiusi il 01/09/2026)_

Adattati al modello Danea, e senza «cose complicate» com'era stato chiesto:

| Chiesto                | Dove sta                                                  |
| ---------------------- | --------------------------------------------------------- |
| **selezione multipla** | c'era già: `values` è un menu multiplo                    |
| **esclusione**         | ⭐ nuovo: verso «Includi / Escludi» nel pannello del menu |
| `(Tutto)`              | ⭐ nuovo: «Tutti», che svuota la selezione                |
| **AND fra colonne**    | c'era già, ed è l'unica combinazione (`14` §0.2)          |

⛔ **E strada facendo si è scoperto che i filtri a valori non si potevano usare
AFFATTO**: la tendina si apriva **invisibile**, ritagliata dall'`overflow: hidden` che
l'intestazione porta dal taglio a colonna del 30/08. Riquadro pieno, posizione giusta,
zero pixel dipinti — e la prova di resa che li guarda misurava proprio il riquadro.
Diagnosi e correzione in `14` §0.2.

**Le aree, in ordine di comparsa:** **righe documento e varianti (in corso)** · prima sincronizzazione Shopify · sedi · anagrafica
articolo · difetti aperti · Corrispettivo manuale · **tabulazione da tastiera** (punto 7,
il lavoro grosso aperto).

⚠️ **Il ramo cambia, e questa riga invecchia da sola**: al 20/08/2026 si lavora su
`feature/pagamenti-tesoriera`. Chi riprende verifichi con `git branch --show-current`
invece di fidarsi di quanto scritto qui.

---

# ⏸ VERIFICA VISIVA MANUALE PENDENTE — Passo 6 _(29/08/2026)_

> **Non blocca la chiusura funzionale del Passo 6**, che è CHIUSO: 6A backend e 6B UI.
> È un controllo successivo, non un difetto aperto.

Il selettore di stato commerciale (Ordine cliente e Ordine fornitore) e la visibilità
della colonna «Impegna magazzino» sono coperti da 18 prove di componente e 53 di
integrazione HTTP su PostgreSQL, ma **non sono mai stati guardati in un browser**.

⛔ **Perché non è stato fatto, e perché non va ritentato per altre strade.** Il
proprietario era da telefono. La via automatica si è fermata su due ostacoli misurati:
i progetti Playwright autenticati non esistono senza `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`,
e la via `mock-auth` riusa il server di sviluppo già in ascolto su `:4200` — compilato
con la configurazione vera invece che con `--configuration e2e`, quindi il login finto
non passa. Farla girare richiederebbe di fermare il server di sviluppo di chi sta
lavorando: **non si fa, e non si cercano configurazioni alternative.**

Quando si potrà, si guardano queste cose e basta:

```text
ORDINE CLIENTE
  nuovo                   Stato = Confermato · colonna «Impegna magazzino» visibile
  → Da confermare         la colonna sparisce subito · nessun effetto quantitativo
  salva e riapri          lo stato resta quello scelto (i tre)
  Concluso                mostrato, campo bloccato, altri campi modificabili,
                          «Impegna» nascosto

ORDINE FORNITORE
  nuovo                   Stato = Confermato
  selettore               Da confermare · Confermato · Annullato
  Concluso                mostrato e bloccato · nessuna colonna «Impegna» né «In arrivo»
  Ordine → Arrivo merce   flusso invariato: Ricevuto/residuo, collegamenti riga,
                          Arrivo merce snapshot autonomo
```

⭐ **Un punto della lista è già verificato**, e non serve rifarlo: l'endpoint
`POST /sales-orders/manual/:id/force-conclude` risponde **404** sull'API viva e non
compare fra le rotte mappate all'avvio.
---

# ⛔ LAVORO IN CORSO — righe documento, varianti, struttura _(23/08/2026)_

⚠️ **Questo blocco sta in cima perché è quello aperto adesso.** È scritto per essere
ripreso da zero: ogni voce dice se è **decisa**, se è **fatta**, e cosa la blocca.

Le decisioni argomentate stanno in **`docs/CONTRATTO-COMUNE-DOCUMENTI.md`** (§3.2 titolo
e variante, §4 richiamo articolo, §5.5 sconto, §5.7 listino, §6.2 spunte magazzino).
Qui c'è **cosa resta da fare**, non perché.

## ✅ RICERCA GIACENZA — rifatta il 02/09/2026

> **Fatta.** Cosa è cambiato, e cosa resta aperto, sotto la specifica dei requisiti.

⛔ **Il difetto era di una riga**: la schermata chiamava `findVariantByCode`, che risolve un
codice **esatto** e restituisce **una** variante (404 se ambiguo). Ecco perché «maglie» non
trovava niente — non mancavano i dati, era la domanda sbagliata.

⭐ **Quasi tutto esisteva già**, e non è stato scritto nulla di nuovo lato server:

| Pezzo                                                     | Cosa dà                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `searchVariantSummaries` (`/products/variants/summaries`) | cerca per testo → N risultati con **immagine, prezzi, giacenza, disponibilità**; una sola query Prisma, nessun N+1                       |
| `buildInventoryVariantSearchWhere`                        | il filtro copre **nome, SKU, barcode, codice articolo, SKU fornitore**, ed è multi-parola. `contains`, quindi «maglie» trova «magliette» |
| `VARIANT_SEARCH_DEBOUNCE_MS`                              | il debounce già condiviso con la ricerca articolo dei documenti                                                                          |

**Cosa è stato scritto:** il raggruppamento per articolo (`articolo-trovato.model`, 10 prove)
e la composizione della griglia taglia × sede (`ricerca-giacenza.model`).

### Le decisioni prese dal proprietario

| Domanda                              | Risposta                                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| varianti o articoli fra i risultati? | **articoli**, poi le taglie toccando — tre modelli con quindici taglie sono tre righe, non quarantacinque |
| toccando un risultato?               | **la situazione per sede** — la domanda del commesso è «ce l'ho, e dove?»                                 |

### Come funziona adesso

```text
scrivi (dalla 3ª lettera, debounce, switchMap)
  → ARTICOLI: miniatura · nome · codice · n° taglie · disponibile · prezzo
      → tocco
          → griglia TAGLIA × SEDE, col totale
              → tocco su un numero: gli ordini che lo impegnano
```

⭐ **Chi scansiona salta un passaggio**: se il codice letto porta a un articolo solo, la sua
scheda si apre da sé. Vale solo per la scansione — digitando «mag» si possono avere per un
attimo pochi risultati, e aprirne uno porterebbe via dalla ricerca in corso.

### ⏸ Cosa resta aperto

#### ⛔ «Registra movimento» dalla Ricerca: **da gestire o rimuovere**

_Proprietario, 02/09/2026: «Registra movimento sulla taglia non ha senso, è una funzione che
va gestita o rimossa, da fare»._

⛔ **Tolto dalla schermata il 02/09/2026**, insieme al predicato di permesso che lo
governava: era rimasto attivo solo per lui, e un predicato che nessuno legge è debito.

**Perché sulla taglia non stava**: quindici taglie fanno quindici link nella stessa colonna,
e portano tutti a una maschera che **non sa in quale sede** — mentre la sede è esattamente
ciò che la griglia sta mostrando. Prima il link stava in testa alla scheda, e reggeva solo
perché la vecchia schermata mostrava **una variante sola**.

⚠️ **La domanda vera non è dove metterlo, è se ci vada.** Questa schermata è di
consultazione: si cerca per sapere «ce l'ho?». Un'azione che **modifica il magazzino**
dentro una vista di sola lettura è una decisione di prodotto, non una collocazione.

| Se si decide di gestirla       | Cosa servirebbe                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| dalla **cella** taglia × sede  | il contesto sarebbe completo (variante **e** sede), ma ogni cella avrebbe due gesti — il numero apre gli impegni, e il movimento cosa? |
| dalla **scheda** dell'articolo | serve prima scegliere taglia e sede: è una maschera, non un link                                                                       |
| **da nessuna parte**           | la Ricerca resta di sola consultazione, e il movimento si registra da Magazzino → Movimenti, dov'è già                                 |

⭐ **La terza è la più coerente con quello che la schermata è** — ma è una scelta, e va
fatta, non dedotta.

#### Il resto

- **Il tetto di 100 varianti per ricerca**, dichiarato a schermo con un avviso. Toglierlo
  richiede un aggregato di stock **per articolo** lato API, che oggi non esiste: `/products`
  non porta giacenze e `variants/summaries` pagina sulle varianti.
- **La catena di altezze**: l'esenzione in `stock-lookup.component.scss` resta finché non si
  guarda a schermo se la pagina debba stirarsi. Ora che i risultati sono un elenco, la
  risposta probabilmente cambia.
- **Nessuna vista registrata**: niente selettore Colonne né larghezze. Qui però non è una
  mancanza: l'elenco non è una tabella a colonne, è una lista di card per il pollice.

---

## 🔴 I REQUISITI, come sono stati dettati — 02/09/2026

_Dettati dal proprietario: «è nata senza un criterio e immagino la sua utilità per un
operatore che cerca un articolo tramite ean, sku o nome […] Un po' come i commessi di
Footlocker»._

> **È il palmare del commesso in negozio**: cerco, e vedo subito la situazione di ogni
> articolo che risponde — con l'immagine, la giacenza, la disponibilità e i prezzi.

### Cosa deve fare

|                  |                                                                                   |
| ---------------- | --------------------------------------------------------------------------------- |
| **Si cerca per** | EAN · SKU · **nome**                                                              |
| **Col nome**     | i risultati compaiono **man mano, dalla terza lettera** — non serve premere Invio |
| **Quanti**       | **tutti** quelli che corrispondono: «maglie» trova maglie, maglietta, magliette…  |
| **Per ognuno**   | immagine **piccola**, giacenza, disponibilità, prezzi, e i dati essenziali        |

⭐ **La ricerca per nome è a PREFISSO PARZIALE, non esatta**, ed è il punto: il commesso
non sa come è registrato l'articolo, sa come lo chiama il cliente. «maglie» deve trovare
tutta la famiglia.

⚠️ **Dalla TERZA lettera**, non dalla prima: con una o due lettere il risultato è mezzo
catalogo, e la richiesta parte a ogni tasto. È anche la soglia che rende utile il debounce
già prescritto per le liste grandi (`regole-gestionale`, «Performance»).

⚠️ **L'immagine è piccola e in elenco**, quindi valgono le regole già scritte per le
miniature di tabella (`regole-architettura`, «Immagini»): `width`/`height` sempre — o la
riga si assesta dopo il caricamento e la lista balla sotto il dito — più `loading="lazy"`
e `decoding="async"`.

### Cosa c'è oggi, e perché non basta

La schermata esiste (`features/inventory/stock-lookup`) e cerca **un articolo alla volta**,
mostrandone la scheda con una tabella di giacenze per location. ⛔ Non è un elenco di
risultati: è il dettaglio di una cosa sola, quindi la domanda «quali maglie ho?» non ha
risposta.

⚠️ **Ha anche il lettore ottico** (`app-barcode-scanner`), che va conservato: è la strada
veloce quando il capo ce l'hai in mano.

### Due cose tecniche già misurate, da tenere presenti quando si farà

⏸ **La catena di altezze è esentata, non risolta.** `stock-lookup` è l'unica pagina che
monta `app-list-page` senza passare l'altezza al telaio: oggi ha un'esenzione dichiarata
nel proprio foglio, perché nella sua zona dati c'è la scheda di un risultato e non un
elenco. **Con l'elenco di risultati la domanda cambia** e l'esenzione va tolta — la
guardia è `npm run check:catena-altezze`.

⏸ **Nessuna vista registrata**: niente selettore Colonne, niente larghezze che si
conservano. Diventando un elenco vero, entra nel giro come gli altri (`14` §22.3).

---

## ⏸ IL RISCONTRO DELLA SCANSIONE non c'è dove si inseriscono articoli in continuo — 02/09/2026

_Trovato dal proprietario provando l'**Arrivo merce**, che ha una cella per l'EAN: «non ha
già lo stesso comportamento? mi sa di no, ho verificato e non lo fa». Verificato: è così._

> **Dove si inseriscono articoli uno dopo l'altro — con la pistola o battendo l'EAN — la
> riga toccata deve dirlo: si accende per un momento, e la pagina ci scorre sopra se non
> è già in vista.**

⛔ **Oggi lo fa solo il dettaglio inventario.** Al banco, dopo una scansione
(`afterAcquire` in `store-sale-document-form`), succede questo:

```text
campo svuotato · beep (solo su mobile) · fuoco che torna alla ricerca
```

⚠️ **E il caso che lo giustifica è l'EAN RIPETUTO.** Il banco ha la regola «stesso EAN due
volte → la riga esistente cresce» (`11` A14, `stepQuantity`): se quella riga è fuori vista
perché il documento ne ha venti, **non si vede cambiare niente**. Il commento nel codice
dice «su desktop la riga che compare è già la conferma» — vero per una riga **nuova** e
**visibile**, falso per un incremento lontano. Su desktop il beep non suona nemmeno.

### Il parere dato al proprietario, che ha chiesto se vale ovunque

| Caso                                                         | Serve                                  |
| ------------------------------------------------------------ | -------------------------------------- |
| EAN ripetuto che **incrementa una riga lontana**             | ⭐ **sì, è il caso che lo giustifica** |
| riga nuova inserita **non in fondo** (banco, Ordine cliente) | ✅ sì                                  |
| riga nuova già visibile in un documento corto                | ➖ indifferente: il lampo non disturba |

⭐ **I due pezzi NON si adottano allo stesso modo.** L'**evidenziazione** vale ovunque: non
sposta niente e risponde all'unica domanda che ci si fa — _ha letto la riga giusta?_ Lo
**scorrimento** solo con `block: 'nearest'`, che **non fa nulla se la riga è già in vista**.

⛔ **Mai `block: 'start'`** — la forma usata altrove nell'app per Allegati e banner d'errore:
quella salta **sempre**, e in una maschera documento vuol dire che chi sta compilando la riga
3 si ritrova alla 18 e perde il posto. Nell'inventario il rischio non c'è perché si conta e
basta; in un documento sì.

### ⚠️ Le due famiglie sono separate, e l'aggancio è di una sola

|                                                              |                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| **motore tabella** (`data-table`)                            | ✅ ha `highlightedRowId` e `[data-row-id]` dal 02/09/2026 |
| **griglia di riga documento** (`document-line-head` + righe) | ⛔ non usa il motore: serve il gemello                    |

⭐ **Al secondo consumatore l'estrazione diventa obbligatoria** (`regole-architettura`,
regola «1 + 1»): la sequenza — trova l'articolo, accendi, scorri se serve, spegni dopo 2,5s
— oggi vive solo in `inventory-count-detail`. Quando si fa il gemello, quella va estratta
invece di copiata.

### Dove si applica — misurato il 02/09/2026 su 42 schermate

Censimento di tutte le schermate con tabella, ogni area verificata da un secondo agente
incaricato di smentire il primo. **Sette schermate inseriscono o cercano articoli in
continuo; sei non hanno il riscontro:**

| Schermata                  | Riscontro                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Dettaglio inventario       | ✅ ce l'ha (è quella da cui è nato)                                                       |
| **Arrivo merce**           | ⛔ — la cella EAN da cui è partita la segnalazione                                        |
| **Vendita al banco**       | ⛔ — ed è il caso peggiore: l'EAN ripetuto incrementa una riga che può essere fuori vista |
| **Ordine cliente**         | ⛔                                                                                        |
| **Movimento di magazzino** | ⛔                                                                                        |
| **Ricerca giacenza**       | ⛔ — ma va rifatta comunque (sezione sopra)                                               |
| **Giacenze**               | ⛔ — da verificare se lì lo scanner filtra invece di inserire                             |

⚠️ **Prodotti ha lo scanner ma NON è questo caso**, e l'ha corretto il verificatore: la
scansione trova l'articolo e **naviga alla sua scheda** — si esce dall'elenco, non si
aggiunge una riga. Nessun riscontro da dare.

⭐ **Le due famiglie restano separate**: il motore tabella ha già l'aggancio, la griglia
di riga documento no — e cinque delle sei schermate qui sopra sono maschere documento.

---

## ⛔ PRODOTTI: cinque colonne dichiarate ordinabili, e l'ordinamento non arriva — 01/09/2026

_Trovato dalla revisione del 01/09/2026, e **non è lavoro di quella giornata**: è
preesistente. Riportato invece di correggerlo di passaggio, perché la correzione tocca
l'API e va decisa._

> **L'operatore preme «Brand», la freccia si accende, l'URL diventa `?sort=brand&order=asc`
> — e le righe non si muovono.**

La catena è interrotta in **tre punti**, e ognuno da solo basta:

| Dove                                                          | Cosa manca                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `product-table.component.ts:44`                               | `PRODUCT_SORTABLE_COLUMNS` marca ordinabili name, brand, category, season, status                                        |
| `domain/products/services/product.service.ts` (`getProducts`) | costruisce gli `HttpParams` con page, pageSize, all, search, status, category, brand, season — **mai `sort` né `order`** |
| `api/src/products/dto/list-products.query.dto.ts`             | non ha nessun campo `sort` o `order`: anche mandandoli, verrebbero scartati                                              |

⚠️ **Il commento del componente dichiara la strada scelta** — «L'ordinamento è del SERVER:
`sortChange` risale fino alla query» — quindi non è un ripiego dimenticato: è una strada
imboccata e non finita.

⛔ **QUI C'ERA SCRITTO «non si rimedia ordinando in memoria», e la premessa era FALSA** —
corretto il 01/09/2026, un'ora dopo averlo scritto. La motivazione addotta era che l'elenco
Prodotti carica una pagina per volta, quindi ordinare in memoria avrebbe ordinato la sola
pagina a schermo.

⭐ **L'elenco Prodotti carica TUTTE le righe del filtro**, e lo dichiara:
`getProducts(query, { tutto: true })` in `product-list.component.ts:252`, col commento
«l'elenco mostra tutte le righe del filtro, non una pagina» — è la decisione «nessun tetto
di righe». Esattamente come Clienti e Fornitori, che infatti ordinano in memoria.

⭐ **Quindi la via breve è quella giusta, e non è un ripiego**: `ordinaPerColonne`, la
stessa funzione dei cinque elenchi che già la usano. Nel componente sono una decina di
righe, sul modello di `customer-table.component.ts:86`:

```ts
private readonly ordinate = computed(() =>
  ordinaPerColonne(this.righe(), this.sortState(), {
    cellText: (riga, columnId) => this.cellText(riga, columnId),
  }),
);
```

⚠️ **Resta da decidere UNA cosa**, ed è di prodotto, non tecnica: l'ordinamento scelto oggi
finisce nell'**URL** (`?sort=brand&order=asc`, scritto da `onSortChange` a riga 380), che è
un pregio — il link si condivide e si ricarica ordinato. Ordinando in memoria quel pezzo si
può tenere: l'URL resta la memoria della scelta, e ad applicarla è il client. Va confermato
che si vuole tenerlo.

⛔ **E il commento del componente va corretto insieme al codice.** Dice «L'ordinamento è del
SERVER: `sortChange` risale fino alla query»: è il residuo della strada imboccata e non
finita, e chi lo legge dopo la correzione cercherebbe un percorso che non esiste più.

⚠️ **La strada del server resta possibile** — `sort`/`order` nel DTO, whitelist, `orderBy`
in Prisma, come `parseDocumentListSort` e `parseSupplierOrderSort` — ma oggi non serve a
niente: il server manda comunque tutte le righe, quindi ordinarle là costa un giro di rete
in più per lo stesso risultato. Tornerà utile il giorno in cui i Prodotti reintroducessero
la paginazione.

## ⏸ Corrispettivi: 14 blocchi di CSS orfano dopo il telaio — 29/08/2026

Testata, riga filtri, pulsante «Filtri» mobile e i campi del vecchio pannello sono del
telaio: le loro regole in `corrispettivi-report.component.scss` non agganciano più niente.

`corrispettivi__header · __heading · __title-row · __title · __count · __subtitle ·
__header-actions · __filters · __filters-main · __filter--active · __mobile-filters ·
__columns-picker · __field · __label`

⚠️ **Sono inerti** — non possono sporcare la resa — ma vanno tolte. Un tentativo con uno
script il 29/08 ha mangiato le chiusure dei commenti e sbilanciato le graffe: **annullato**.
Va fatto a mano, blocco per blocco, con la build a ogni passo.

## ✅ Il riepilogo Corrispettivi — chiuso il 30/08/2026

⛔ **Qui c'era «ha DUE fasce, la regola ne vuole UNA»**, aperta il 29/08. La voce è
superata: il 30/08 la forma è cambiata di nuovo, e la domanda «una o due fasce» non è più
quella giusta.

**Come sta adesso**, e la regola lo dichiara in «Riepilogo di fondo pagina»: voci
**impilate** (etichetta sopra, valore sotto) a **ogni** larghezza, in una griglia
`auto-fit` che decide da sé quante colonne stanno — due a 320px, tre a 390, quattro da
430, tutte su una riga da `lg` in su.

⭐ **La forma impilata ha chiuso anche la «DECISIONE APERTA» sulla soglia**: serviva
sapere a quale larghezza la fascia a riga unica dovesse cedere. Impilata ci sta sempre —
615px invece di 918 — quindi non c'è più una soglia da decidere.

## ⛔ Corrispettivi: manca l'imponibile diviso per ALIQUOTA — 01/09/2026

_Proprietario: «manca la divisione dell'imponibile in base alle aliquote, almeno nelle
stampe ed esportazione per dare i dati al commercialista»._

⭐ **Il perimetro è dichiarato: stampa ed export.** A schermo può restare com'è — questa
voce non chiede una colonna nuova nel Registro né una fascia nel riepilogo.

### Cosa c'è già, e non va rifatto

|                            |                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| la **struttura per riga**  | `CorrispettivoVatBreakdownRow` — `ratePercent · netMinor · vatMinor`, già nel modello dell'API |
| la **colonna nell'export** | «Dettaglio IVA», ultima colonna di `corrispettivi-export.service`                              |
| chi la **riempie**         | **solo il Corrispettivo manuale**, l'unica sorgente che conserva le proprie righe per aliquota |

### ⛔ Cosa manca, e perché è stato lasciato così

Le altre tre sorgenti — ordini, vendite al banco, resi — lasciano quella colonna **vuota**,
e il commento dell'export dice perché:

> _«il dato esiste nel database ma il Registro non lo legge, e riempirla per corrispondenza
> inversa direbbe una cosa non verificata su un file che va fuori dall'azienda»_

⚠️ **La cautela era giusta e va rispettata**: il lavoro non è «riempire la colonna», è
**leggere le righe IVA delle altre tre sorgenti** e portarle fino all'export. Ricavare
l'aliquota per differenza (imposta ÷ imponibile) è la scorciatoia da non prendere: su un
documento a due aliquote dà un numero che non esiste.

### ⏸ Le due domande da chiudere prima di scrivere

1. **Per riga o per periodo?** Il commercialista di solito vuole il **riepilogo per
   aliquota del periodo** — «imponibile 22%, imposta 22%, imponibile 10%…» — che è una cosa
   diversa dal dettaglio riga per riga che l'export ha oggi. Probabilmente servono
   entrambi, e vanno decisi separatamente.
2. **Nel riepilogo del Registro no, ma nella stampa dove?** In coda al documento come
   sezione di riconciliazione, o come foglio a parte dell'export.

⚠️ **Vale la regola del riepilogo**: gli importi per aliquota si ottengono **sommando gli
importi IVA finali delle righe** di quel codice — mai `imponibile × aliquota`, che è lo
stesso errore di arrotondamento un piano più in alto (`regole-gestionale`, «L'IVA per
aliquota segue la stessa regola»).

---

# ⛔ DA FARE OGGI — deciso dal proprietario il 30/08/2026

_«Segnati queste cose da fare e oggi vanno fatte, non perderle.»_

## 1. ⛔ La nuova VENDITA AL BANCO non si salva — ANCORA APERTA

> **Il proprietario apre da `localhost`, e il 01/09/2026 ha confermato: «ancora
> non funziona».**

⛔ **Quindi la causa trovata quel giorno NON è la sua**, ed è scritto qui perché
è l'errore da non ripetere: un difetto reale, misurato e sullo stesso percorso
**non è per questo il difetto segnalato**. Da `localhost` il contesto è sicuro e
`crypto.randomUUID` c'è.

⭐ **Quel che si è imparato resta e vale**, ed è elencato sotto: il server è a
posto (prove di integrazione), e una seconda causa possibile è stata chiusa.

### ⭐ La domanda del proprietario, che è la pista buona

> _«Dovrebbe essere un documento come tutti gli altri e con componenti condivisi.
> Cambia solo la contabilità.»_

⚠️ **E oggi non lo è**: la Vendita al banco ha un endpoint proprio
(`POST /store-sales`), un servizio proprio e una maschera propria — è la
**quarta strada** che persiste un `Document` senza passare da
`confirmDocumentTx`, e lo dice già un commento nel suo DTO. Ogni difetto
trovato lì è un difetto che le altre maschere non hanno perché non passano di
lì.

**Da fare quando si riprende**, in quest'ordine:

1. riprodurre il rifiuto **con l'utente vero** (non l'auth mock, che l'API non
   accetta) e leggere stato e corpo della risposta;
2. solo allora decidere se si corregge il caso o si **rientra nel percorso
   comune**, che è la domanda che il proprietario ha posto.

### ✅ Quel che è già stato chiuso il 01/09/2026

**Il server è a posto, e non è una deduzione**: tre prove di integrazione HTTP su
PostgreSQL vero (`vendita-al-banco.integration-spec.ts`) creano una vendita con
riga, una senza righe e verificano l'idempotenza dell'intento. Verdi al primo
colpo, col payload esatto della maschera.

**Una seconda causa, reale ma non la sua:** `crypto.randomUUID()` non esiste
fuori dal contesto sicuro.

Misurato in Chrome, sulla build di questa applicazione:

```text
http://127.0.0.1:4212      isSecureContext true    crypto.randomUUID  function
http://192.168.1.50:4212   isSecureContext FALSE   crypto.randomUUID  undefined
                                                    crypto.getRandomValues  function
```

⛔ **Non restituisce un valore sbagliato: LANCIA.** E lancia nel punto peggiore —
dentro `save()`, mentre genera l'intento di creazione, prima che parta la
richiesta: nessun `error:` la raccoglie, nessun avviso compare. A chi preme
sembra soltanto che **non succeda niente**, che è la segnalazione parola per
parola.

⚠️ **La correzione del 30/08 — portare in vista l'avviso d'errore — non poteva
funzionare**: non c'era nessun errore da mostrare, perché la richiesta non
nasceva.

⭐ **Il server era ed è a posto**, e non è una deduzione: quattro prove di
integrazione su PostgreSQL vero (`vendita-al-banco.integration-spec.ts`) creano
una vendita con riga, una senza righe e verificano l'idempotenza dell'intento.
Tutte verdi al primo colpo. La causa non era mai stata lì.

⚠️ **Nessun test poteva prenderlo**, e vale la pena saperlo: jsdom e Chrome
headless su `localhost` sono **entrambi contesti sicuri**. Il difetto esiste solo
dove l'applicazione si usa davvero — il telefono in magazzino — e lì non gira
nessuna suite.

**Corretto** con `nuovoId()` (`@core/utils/uuid.util`), che ripiega su
`getRandomValues` — che invece c'è, misurato. La guardia è
`npm run check:contesto-sicuro`.

⚠️ **Restava un secondo consumatore, e più largo**: `toast.service` usava la
stessa API. Da un'origine di rete **ogni notifica** lanciava — cioè l'errore che
nasconde l'errore.

⚠️ **Confermato il 01/09/2026: apre da `localhost`**, quindi questo non era il
suo caso. Resta corretto perché chiunque apra il gestionale dal telefono in
magazzino lo incontrerebbe — e perché rompeva **ogni toast** su quell'origine.

## 2. ⛔ ELIMINA e DUPLICA — la semantica è quella dell'U.M. e del Codice IVA

⭐ **Decisione del proprietario, 30/08/2026**, e chiude la domanda che era rimasta
aperta:

> _«Quello che deve succedere con Elimina è come funziona con l'IVA e con l'U.M.:
> quando cancello un'u.m., il dato nei documenti diventa testo e non sparisce.
> Tutto quello che è salvato nel gestionale resta, quindi i dati dai movimenti e
> documenti non spariscono, sparisce solo la scheda cliente.»_

**Il criterio:** ciò che è **fotografato** dentro un documento o un movimento è
del documento, non dell'anagrafica. Eliminare l'anagrafica toglie la scheda; gli
snapshot restano leggibili come testo.

⚠️ **Non è un soft-delete travestito**: la riga anagrafica sparisce davvero. È il
documento che non aveva bisogno di lei, perché aveva già copiato quello che gli
serviva.

⛔ **Da verificare PRIMA di scrivere l'endpoint**: quali snapshot esistono già
sulle righe (nome, codice, partita IVA), e quali riferimenti sono invece **chiavi
esterne** che il database rifiuterebbe di lasciare orfane. Dove manca lo snapshot,
va aggiunto prima — o l'eliminazione romperebbe una lettura.

Entità coinvolte: **Clienti**, **Fornitori** (nessun `DELETE` nell'API oggi).

## 3. ⛔ Le PILL colorate spariscono dai riepiloghi

_«Le card colorate intorno ai testi vanno levate nei riepiloghi, resta solo il
testo colorato, come abbiamo già fatto altrove.»_

Fatto su prodotti, clienti, giacenze e situazione. **Restano** i movimenti (colonna
Tipo), i documenti, gli ordini, le vendite online, l'inventario.

## 4. ⛔ INVENTARIO — l'elenco sessioni non è nel motore

`/app/inventory/counts`: tabella propria, niente riga totali, niente selezione,
pill piene. Va nel motore come gli altri undici.

## 5. ⛔ VENDITA MANUALE — riepilogo e maschera

Sia l'**elenco** (contenitore comune e colonne) sia la **maschera di nuova vendita
manuale**.

⚠️ **Attenzione al pannello di controllo**: la Vendita manuale si disattiva da
Impostazioni (`TenantFeatureSettings.manualUnloadEnabled`), nasce **spenta**, e il
rifiuto è sull'**API** — non solo nella UI. Toccare quella maschera senza tenerne
conto significa riaprire un interruttore di sicurezza.

## 6. ⛔ I riepiloghi dei DOCUMENTI come quelli dei Corrispettivi

_«I riepiloghi, almeno quelli dei documenti, possiamo sistemarli e unificarli come
quelli dei corrispettivi.»_ — e verificare che **contenitore e colonne** siano
davvero quelli comuni, non solo simili.

---

# ✅ IL MOTORE TABELLA È COMPLETO — 30/08/2026

**Undici elenchi su undici** usano lo stesso motore. Nessuno impagina più.

|                  |                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **entrati oggi** | Prodotti · Clienti · Giacenze · Situazione magazzino                                                                                                                                                                                                                                                         |
| **c'erano già**  | Documenti · Ordini cliente · Ordini fornitore · Vendite online · Movimenti · Corrispettivi                                                                                                                                                                                                                   |
| **entrati dopo** | **Fornitori** e **Inventario** — ⛔ qui c'era «fuori dal motore, ha ancora una tabella propria»: **falso**, verificato il 02/09/2026 in `supplier-table.component.html` e `inventory-count-table.component.html`, che montano entrambi `<app-data-table>`. Chi leggeva credeva di avere un elenco da migrare |     |

## Che cosa ha preso ognuno

- **taglio a colonna**: il testo sta su una riga e viene tagliato dalla colonna
  successiva, col divisore verticale che segna dove. Il testo intero resta nel
  `title` di ogni cella;
- **altezza di riga dichiarata** (`--table-row-h`), che prima era un token che
  nessun elenco leggeva;
- **maniglia di larghezza visibile** — era un bersaglio trasparente da 4px;
- **riga totali**: «N voci» più le somme delle colonne visibili, che seguono la
  selezione. Sui documenti col **verso economico** — fattura 100 + nota di credito
  30 = 70;
- **titolo della card** dichiarato dalla colonna (`cardTitle: true`), che prima lo
  dava un mixin CSS legato a una classe e si era perso migrando;
- **pill piatte**: testo colorato invece di pastiglie, che è anche ciò che
  assottiglia la riga.

## ⏸ Quel che resta, e serve una decisione

⛔ **«Duplica ed Elimina dappertutto» non si può completare.** L'eliminazione c'è
sui prodotti e sui documenti, dove l'API la espone. Altrove **non esiste
l'endpoint**:

| entità                          | `DELETE`      | duplicazione  |
| ------------------------------- | ------------- | ------------- |
| Clienti · Fornitori · Movimenti | ⛔ non esiste | ⛔ non esiste |

⚠️ **E prima dell'endpoint c'è una decisione di dominio, non tecnica**: si può
eliminare un cliente che ha **fatture emesse**? Il documento conserva i suoi dati
fotografati e non si romperebbe, ma sparirebbe l'anagrafica da cui è nato. Le
strade sono tre — eliminazione vera, disattivazione (come `linkedSupplierActive`,
che già esiste), blocco se ha movimenti — e sono tre lavori diversi.

⏸ **I filtri dei Prodotti** sono ancora in una toolbar dedicata
(`app-product-toolbar`), mentre `regole-stile-ui` dal 29/08 dice che «i filtri di
un elenco sono le sue colonne». È l'ultimo elenco con la forma vecchia.

⏸ **Le larghezze di colonna** vanno tarate pagina per pagina — decisione del
proprietario, 30/08: «le gestiremo pagina per pagina successivamente».

⚠️ **Nulla di tutto questo è stato verificato a schermo**: la build di prova non
ha dati, e le misure sono state fatte leggendo il codice e i test.

---

# ⛔ APERTO ADESSO — deciso il 30/08/2026, da eseguire

Tre lavori chiesti dal proprietario nella stessa sessione, in ordine di come li
ha posti. ⚠️ Nessuno è cominciato: qui c'è quanto basta a riprenderli senza
ricostruire il ragionamento.

## 1. ⏸ Il SELETTORE DI VISTA — base fatta, manca l'ultimo pezzo _(30/08/2026)_

### ✅ Quello che c'è già, e non va rifatto

```text
view-mode.model.ts        auto · compact · wide, con etichette e spiegazioni
ViewportService           la scelta, la persistenza per DISPOSITIVO, e compact()
                          che la rispetta — i 17 consumatori non sanno che esiste
attributo data-vista      scritto sulla radice solo quando la vista è imposta
mixin vista-compatta      il ramo CSS, +4 kB (+0,09%)
```

⭐ **È inerte e non fa danno**: senza il selettore nessuno può impostare nulla,
quindi `data-vista` non viene mai scritto e nessuna regola cambia peso.

### ⛔ E QUELLO CHE MANCA, con la misura che l'ha smascherato

Il selettore in Impostazioni → Aspetto era stato scritto, provato **a schermo** e
poi **ritirato**, perché la funzione non funzionava:

```text
1400px, «Sempre compatta»    card visibili 6 · intestazioni visibili 9
```

⛔ **Le due viste insieme** — il difetto che `regole-stile-ui` §9 chiama «la
stessa riga non esiste due volte». A nascondere l'intestazione è
`data-table-mobile-cards`, che è **incluso da 19 componenti**: convertirlo
moltiplica la duplicazione per diciannove.

```text
solo il motore tabella (3 blocchi)    +4 kB     ⛔ card e intestazioni insieme
+ il mixin delle card (19 volte)      +100 kB   ✅ funziona   (+2,2% su 4,48 MB)
```

⚠️ **La prima misura era giusta e la conclusione sbagliata**: avevo misurato il
costo senza verificare che il risultato funzionasse. L'ho scoperto solo provandolo
nel browser — build e test erano verdi in entrambi i casi.

### ⭐ COME RIPRENDERLO, in un colpo solo

Deciso dal proprietario il 30/08/2026: «adesso nessuno utilizza il gestionale,
possiamo lasciare così, completare altro lavoro e poi riprendere questo,
eviteremmo di fare il doppio».

1. **Rifattorizzare `data-table-mobile-cards`** perché la regola che nasconde
   l'intestazione stia in un punto solo invece che dentro il mixin incluso 19
   volte. È il lavoro che fa tornare indietro i 100 kB.
2. **Poi** convertire quel punto a `vista-compatta`.
3. **Infine** il selettore in Impostazioni, accanto al tema — che è la sua casa:
   sono le due scelte su come si vede l'app su QUESTO schermo.

⛔ **In quest'ordine, e non al contrario.** Aggiungere prima il selettore
consegnerebbe una funzione rotta; rifattorizzare prima di avere la funzione che
gira significa lavorare al buio — ed è da lì che è nato il difetto sopra.

### Le decisioni già prese, che restano

|                                                                           |                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **«Compatta» ed «estesa»**, non «mobile» e «desktop»                      | nominano ciò che si vede, non il dispositivo che si suppone. Chi sceglie «compatta» su un monitor da 27 pollici vuole le card, non sta dicendo di essere su un telefono         |
| **La scelta vive nel DISPOSITIVO**                                        | non sul profilo: chi impone la compatta sul monitor del banco non la vuole sul portatile                                                                                        |
| **Il default è `auto`**                                                   | la soglia sbaglia solo sui casi limite: partire da una vista imposta li renderebbe la regola                                                                                    |
| ⛔ **Sostituisce la doppia soglia per PUNTATORE** di `regole-stile-ui` §9 | decisa l'11/08, mai eseguita, superata il 30/08. La ragione stava già in quella regola: «nessuna linea fissa chiude la questione» — e vale identica per le soglie del puntatore |

⚠️ **Copre la vista, non ogni dettaglio.** Metà del progetto è mobile-first — 105
`media-up` contro 95 `media-down` — e quei blocchi continuano a valere sullo
schermo largo: la tabella diventa card, ma qualche spaziatura resta quella da
scrivania. Sopprimere anche i `media-up` chiede di avvolgerli, e **quello sì**
cambia la specificità di ogni regola responsive — con tre difetti di specificità
già incontrati in una sola giornata, è un lavoro a sé.

## 2. ⛔ «Nuovo arrivo merce» non ha senso nel Registro documenti

> _«Nuovo arrivo merci nei documenti generali non ha senso che esista quel
> pulsante. Al massimo resta quello affianco "Altro documento" e viene
> rinominato in "Crea documento" e fa selezionare il documento che vogliamo.»_

Il Registro documenti è l'elenco di TUTTI i tipi: offrire come azione primaria la
creazione di UNO — l'arrivo merce — è una scorciatoia che privilegia un tipo
senza una ragione visibile.

**Da fare:** togliere il pulsante primario, e rinominare il menu accanto da
«Altro documento» a **«Crea documento»**. ⚠️ Il menu ha già i test
(`document-list.component.spec.ts`) che verificano che offra solo i tipi
gestibili dai permessi: quelli vanno aggiornati, non rifatti.

⚠️ **Riguarda il solo Registro generale.** Gli elenchi filtrati per famiglia —
Arrivi merce, Vendite al banco — hanno un'azione primaria legittima, perché lì
il tipo è uno solo e non c'è niente da scegliere.

## 3. ⛔ Gli INDIRIZZI mescolano due lingue, e tre sono nomi di database

Misurato il 30/08/2026 sull'intera mappa delle rotte.

```text
primo livello   corrispettivi · vendita-al-banco · cambia-password        ← italiano
                dashboard · products · inventory · orders · suppliers
                documents · sales · online · customers · reports
                guide · settings · admin                                  ← inglese

dentro Documenti  arrivi-merce · registro · proforma
                  registrazioni-fatture-fornitori                         ← italiano
                  sales-ddt · manual-unload · quote · fattura             ← inglese, e «fattura» in mezzo
```

✅ **Due fatti il 30/08/2026**: `manual-unload` → `vendita-manuale` e
`sales-ddt` → `ddt-vendita`, in codice, test, briciole, guida admin e documenti.

## ⛔ E il terzo — `quote` — NON si rinomina come gli altri

Provato, e **ha rotto la build in cinque punti**. La causa è una distinzione che
non si vede finché non la si urta:

```text
SalesDdt      'sales_ddt'      ≠  rotta 'sales-ddt'       → rinominabile
ManualUnload  'manual_unload'  ≠  rotta 'manual-unload'   → rinominabile
Quote         'quote'          =  rotta 'quote'           ⛔ LA STESSA STRINGA
```

⭐ **Il trattino contro l'underscore** teneva separati il tipo documento e il
segmento di rotta nei primi due. Su `quote` la stessa stringa fa **due mestieri**:
è il valore che va e viene dal database _e_ l'indirizzo. Rinominarla ha cambiato
un membro dell'unione `DocumentType`, cioè un valore che l'API si aspetta.

⛔ **E il danno non era solo di compilazione.** Sono state trovate a mano due cose
che nessun errore avrebbe segnalato:

- `describe('quote')` in un test sulle **quote percentuali** delle colonne,
  rinominato in `describe('preventivo')` — la parola italiana «quote» non c'entra
  niente con i preventivi;
- la mappa delle **briciole** aveva la chiave `quote:` non quotata, quindi la
  sostituzione non la toccava: la rotta sarebbe diventata `preventivo` e la
  briciola avrebbe mostrato il segmento grezzo. Il commento sopra quella mappa lo
  dice da sempre — «senza questa voce il segmento usciva grezzo».

⏸ **Come si farà**: non rinominando il tipo, ma **disaccoppiando** la rotta dal
tipo. `SALES_FORM_ROUTE_SEGMENT` fa già esattamente questo per altri quattro —
`Invoice → 'fattura'`, `CreditNote → 'nota-di-credito'` — e `quote` va aggiunto
lì invece che sostituito ovunque.

### ⭐ La rinomina COMPLETA all'italiano: si fa

⚠️ **I due vincoli che la frenavano non esistono più**, ed entrambi li ha tolti
il proprietario il 30/08/2026:

- **niente clienti, niente dominio** — «il gestionale è in realizzazione e nessun
  cliente lo tiene»: nessun segnalibro da rompere, nessun redirect di
  compatibilità da mantenere;
- **il ramo del collega** «andrà cancellato o adattato, noi procediamo»: cade
  l'argomento dei conflitti fantasma su oltre 200 file.

## ⛔ IL METODO, e non è una formalità

> _«Bisogna farlo facendo attenzione a cosa è davvero ogni rotta e non combinare
> guai, e vedere bene dove si trova.»_ — il proprietario

### 1. Quattro segmenti sono SOTTOSTRINGA di un altro

Una sostituzione cieca ne corrompe un secondo, e il danno **non si vede**: la
rotta continua a esistere, punta altrove.

```text
«sales»   dentro «sales-ddt»
«edit»    dentro «nota-di-cr-EDIT-o»      ← la peggiore
«print»   dentro «print-label»
«fattura» dentro «fattura-accompagnatoria»
```

### 2. Due parole esistono già NELLE DUE LINGUE

`new` e `nuovo`, `edit` e `modifica`: la stessa azione con due nomi, che è
peggio di una scelta coerente in una lingua sola.

### 3. ⛔ `clients` e `customers` sono DUE COSE DIVERSE

```text
/app/admin/clients   i TENANT della piattaforma   (titolo: «Clienti»)
/app/customers       i clienti dell'AZIENDA
```

Tradurli entrambi in `clienti` farebbe collidere due concetti che il gestionale
tiene separati. Serve una parola diversa per il primo — `aziende`, `tenant` — e
la scelta è di prodotto, non tecnica.

### 4. I segmenti non sono tutti letterali

`SALES_FORM_ROUTE_SEGMENT` e `STORE_SALE_ROUTE_SEGMENT` costruiscono rotte da
costanti: chi cerca solo `path: '...'` non li trova.

### 5. Dove guardare, oltre ai file di rotta

`routerLink`, `router.navigate`, i `redirectTo`, le utility di navigazione
(`document-routing.util`, `store-sale-routing.util`), gli e2e. ⭐ La guardia
`check:router-links` esiste già e conta 21 destinazioni statiche più 10 in
binding: va rieseguita a ogni passo, non solo alla fine.

⭐ **Si procede un segmento alla volta**, con build e test dopo ciascuno. Una
rinomina di rotte che sbaglia non fallisce a compilazione: manda l'operatore su
una pagina diversa.

## 3-ter. ⛔ L'AUDIT: 41 RISCHI, TUTTI SILENZIOSI _(30/08/2026)_

Il proprietario ha chiesto: «sei certo che la rinomina delle rotte non crei
danni?». **No.** Novantasei agenti su sette lenti, ognuno obbligato a CONFUTARE
il rischio prima che entrasse in elenco.

```text
41 rischi confermati · 41 silenziosi · 0 che falliscono a compilazione o in un test
   4 bloccano   31 seri   6 minori
```

### ⛔ I QUATTRO CHE BLOCCANO

**1. `authGuard` rimanda a `'/login'` scritto a mano** — `auth.guard.ts:19`

```text
utente non autenticato → /accesso (non esiste) → wildcard → app/dashboard
                       → authGuard → /accesso → …
```

⛔ **Nessuno raggiunge più la maschera di accesso.** Verificato che nulla lo
intercetta: `check:router-links` legge solo gli `.html` e solo `routerLink`,
mentre questo è un `.ts` con `createUrlTree`. E lo spec resta verde **per
costruzione** — fornisce un Router finto, quindi confronta il letterale della
guardia con una sua copia.

⚠️ Nota di merito dell'agente: la rotta reale è `/login` alla **radice**, non
`/app/login` come dicevo io. Da lei dipendono anche `login/forgot-password` e
`login/reset-password`.

**2. Il link di recupero password nelle EMAIL** — `supabase-auth.gateway.ts:128-130`

**3. Lo stesso link, costruito anche dal BACKEND** — `api/src/admin/admin-tenants.service.ts:480`

⛔ E l'indirizzo `/login/reset-password` è registrato in una **allow-list di
Supabase che sta FUORI dal repository**: nessun grep lo trova, nessun test lo
copre, e il link nell'email smette di funzionare per chi lo riceve.

**4. La sidebar lega ogni voce a DUE letterali** — `shell-layout.component.ts:347-348`
`route` e `activeRoutePrefix`: rinominarne uno solo lascia la voce che naviga
bene e non si evidenzia più, o viceversa.

### ⛔ Il moltiplicatore: il wildcard rende tutto muto

`app.routes.ts:204` — `{ path: '**', redirectTo: 'app/dashboard' }`. Un agente ha
**scritto ed eseguito una sonda** e misurato:

```text
con il wildcard      navigazione RIUSCITA · url = /app/dashboard · nessun errore
senza il wildcard    NG04002: Cannot match any routes
```

⭐ **Non è un difetto da correggere**: è ciò che trasforma ogni indirizzo morto in
«il pulsante porta in dashboard» invece che in un errore. La contromisura è
**procedurale** — spegnerlo _per la durata_ della rinomina.

### I temi degli altri 37

| Tema                                         | Esempi                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Il backend costruisce URL del frontend**   | callback OAuth Shopify e TikTok → `/app/settings`; link email di invito e recupero. Due unità di deploy, nessun confine di compilazione                                                                                                                |
| **Codice che DECIDE confrontando segmenti**  | `parentRoute`/`ACTION_SEGMENTS` (il pulsante Indietro), le briciole (**cinque** confronti cablati, non solo la mappa), la ricerca globale (**due** tabelle di letterali), `CreateClientComponent`, `SECONDARY_PAGES`, i query param dell'hub Documenti |
| **I test restano verdi per costruzione**     | i guard spec mockano `createUrlTree`; lo spec di `parentRoute` si alimenta con letterali inglesi propri; quello della ricerca globale sostituisce la nav reale                                                                                         |
| **Nessuna guardia verifica le destinazioni** | `check:router-links` lo **dichiara** nella propria intestazione, e cita un precedente già avvenuto qui: rotta rimossa il 25/08, link superstite, 4817 test verdi, difetto visibile solo cliccando                                                      |

### ⚠️ Una mia affermazione da correggere

Avevo verificato e detto: «nessuna preferenza salvata dipende dai segmenti di
rotta». È vero **solo se non si tocca `TableViewId`**: la chiave di
`table-column-preference.service.ts:201` finisce con quell'id, e **20 dei 30 id
contengono una parola di rotta** (`products_list`, `sales_orders_list`…). Una
rinomina testuale li prenderebbe e orfanerebbe le preferenze salvate di tutti.

### ⚠️ E il censimento che ho scritto è cieco

`scripts/censimento-rotte.mjs` guarda solo `src/` ed `e2e/`: **non vede
`api/`, `public/`, `docs/` né i file di configurazione** — cioè esattamente dove
stanno i quattro rischi che bloccano. Va esteso prima di usarlo per decidere.

### Il numero che governa tutto

```text
334 letterali di percorso in TypeScript   documents 133 · sales 56 · inventory 40 · products 34 · orders 23
 72 dentro navigate/navigateByUrl
 16 routerLink negli HTML
  0 costanti di rotta                     non esiste nessun path-builder
```

### ⭐ LE TRE PRECONDIZIONI, prima di rinominare qualunque cosa

1. **Le costanti di rotta.** Un solo posto che dichiari i segmenti, e tutto il
   resto che lo importa. Senza, ogni rinomina è 334 sostituzioni a mano.
2. **Il wildcard spento durante il lavoro**, così i letterali rimasti si
   annunciano come `NG04002` invece che come un atterraggio in dashboard.
3. **Una guardia che verifichi le DESTINAZIONI**, non solo la forma: anche in
   `.ts`, anche dentro `createUrlTree` e `navigate`, e anche in `api/`.

⚠️ E il backend va trattato come un consumatore esterno: i suoi URL non li
protegge nessun compilatore, e la allow-list Supabase non sta nemmeno nel
repository.

---

## 3-bis. ⛔ LA VERA DOMANDA NON È LA LINGUA: È LA STRUTTURA _(30/08/2026)_

⚠️ **Scoperto discutendo i nomi, non cercandolo.** Il proprietario ha chiesto
perché `sales` e `orders` si chiamino su due assi diversi, e la risposta ha
spostato tutto il lavoro.

```text
rotte      dashboard products inventory orders suppliers documents sales customers reports guide settings admin
cartelle   dashboard products inventory orders suppliers documents sales-orders customers reports guide settings admin
```

⛔ **Le rotte ricalcano le cartelle di `features/`, una per una.** Non c'è
nessuna divisione per acquisti e vendite, nessuna logica fiscale: c'è **il layout
del codice finito nella barra degli indirizzi**.

### I sintomi, tutti incontrati senza cercarli

| Sintomo                                         | Causa                                                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders` (fornitore) e `sales` (cliente)        | due cartelle chiamate così, non una decisione: la stessa cosa nominata per ENTITÀ e per DOMINIO                                                                                                   |
| Ordini cliente sulla **radice** di `/app/sales` | `sales-orders.routes` ha un `path: ''`, quindi la pagina occupa la sezione e gli altri tre rami sembrano suoi figli                                                                               |
| Corrispettivi sotto `/app/sales`                | il componente sta in `features/reports/` ma la voce di menu è in Vendite                                                                                                                          |
| `vendita-al-banco` fuori da tutto               | ⛔ la prova più netta: quell'indirizzo sta lì per un vincolo di ARCHITETTURA — «una feature non importa da un'altra feature», dice il commento — non per una ragione che l'operatore possa capire |

### ⭐ Il criterio, indicato dal proprietario senza chiamarlo così

> **L'indirizzo deve ricalcare il percorso che l'operatore fa col MENU**, perché
> è l'unica struttura che lui conosce. Le cartelle sono un fatto nostro.

Il menu oggi raggruppa così — ed è la mappa da cui ripartire:

```text
Fornitori        → Ordini fornitore
VENDITE          → Nuova vendita al banco · Vendite online · Corrispettivi
CANALI ONLINE    → Ordini Shopify
Clienti · Documenti · Magazzino · Report · Impostazioni
```

### ⛔ Una proposta scartata, e perché non va rifatta

Raggruppare tutto sotto `/app/ordini/` — ordine cliente, ordine fornitore,
shopify, online — **raggruppa per grammatica, non per lavoro**: due ordini hanno
in comune il sostantivo, non il mestiere. Chi compra e chi vende non aprono mai
l'elenco dell'altro, hanno permessi diversi, e stanno in due punti opposti del
menu. In più due delle quattro voci non sono ordini (le vendite online sono
vendite) e i **corrispettivi non avrebbero casa**.

### ✅ Una preoccupazione verificata e infondata

⚠️ «Spostare le rotte separerebbe i riepiloghi che oggi condividono il motore» —
**falso, misurato**: `DocumentListComponent` è montato su **dieci rotte**, alcune
su rami del tutto separati (`/app/vendita-al-banco` sta fuori da `documents` e
usa lo stesso riepilogo). E **nessuna rotta dichiara `providers:` o `resolve:`** —
l'unico meccanismo per cui figli della stessa rotta condividerebbero un'istanza.
Il riuso passa dal componente, non dall'indirizzo.

### Decisioni già prese, che restano valide

|                                   |                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/app/admin/clienti`              | il prefisso `admin` disambigua già dai clienti del negozio: aggiungere un suffisso ripeterebbe ciò che il percorso porta |
| `/app/documenti/registro`         | il segmento genitore dice già di che registro si parla                                                                   |
| `new`/`nuovo` e `edit`/`modifica` | oggi convivono **nelle due lingue**: vanno unificati comunque                                                            |
| `edit` **è** modifica             | `/…/:id/edit` rende la maschera, `/…/:id` il Dettaglio. Già corretti, cambia solo la parola                              |

### ⏸ Cosa manca prima di toccare qualunque rotta

1. **L'esito dell'audit a sette lenti** (permessi, persistenza, navigazione
   composta, backend, superfici esterne, test/e2e, deduzione dall'URL). Se
   qualcosa dipende dalla FORMA attuale dei percorsi, spostare costa più che
   rinominare.
2. **Uno strumento di rinomina che capisca il CONTESTO**, non il testo. Quello
   usato finora sostituisce ogni occorrenza quotata, ed è così che ha rotto
   `quote`. Deve toccare solo `path:`, gli indirizzi `/app/…`, `routerLink`,
   `navigate([...])`, le chiavi delle briciole e i documenti — e **mai** valori di
   enum, chiavi di permesso (`section.products`), viste salvate
   (`products_list`) o scope Shopify (`read_products`).
3. **La decisione di struttura**, che viene prima dei nomi: se gli indirizzi
   ricalcano il menu, alcune pagine si SPOSTANO, e allora non è più una
   rinomina.

⭐ `scripts/censimento-rotte.mjs` dice, per ogni segmento, **quanti mestieri fa**
oltre a essere un indirizzo. ⚠️ Restringe il campo, **non decide**: su `products`
ha trovato due accoppiamenti veri (permesso, vista) e due falsi allarmi (scope
Shopify, un binding di template). La prova va letta.

## 4. ⏸ Elimina: restano nove schermate e due pulizie

Fatto: il componente condiviso, Documenti, Ordini cliente, `edit-client`.

**Restano a conferma singola:** dettaglio documento, dettaglio prodotto,
dettaglio ordine fornitore, utenti, codici IVA, elenco inventari, maschera
Corrispettivo manuale, pannello allegati.

**E due pulizie:** «Elimina» dal catalogo negli elenchi che non ce l'hanno, e via
il duplicato dal menu di riga di Ordini cliente — che è scritto a mano e per
questo sfugge a `check:list-actions`.

---

## ⛔ ELIMINARE UN ORDINE DI CANALE — dubbio dichiarato, non risolto _(30/08/2026)_

> _«Su corrispettivi forse sarebbe giusto poter eliminare, altrimenti non ci
> sarebbe mai modo di farlo. Quello che poi va gestita è la sincro con Shopify,
> che non dovrebbe sempre riportare ordini già cancellati. Ma si avrebbero
> problemi di sincro immagino. È una cosa che va risolta.»_ — il proprietario

⭐ **La regola di prodotto è chiara e vale già**: _«se elimino un ordine, si
dovrebbe eliminare il corrispettivo»_. La cancellazione si fa **sull'ordine**, e
il registro segue.

⭐ **La conseguenza immediata è stata applicata**: nel Registro si può scegliere
**solo il Corrispettivo manuale** — l'unica cosa che nasce lì. Le righe che
vengono da un ordine restano consultabili e non selezionabili.

## ⏸ Ma il problema di fondo resta aperto, ed è di SINCRONIZZAZIONE

Se un ordine Shopify si elimina nel gestionale, **il prossimo scarico lo
riporta**: per Shopify quell'ordine esiste ancora, e la nostra cancellazione è
invisibile. Oggi il codice lo dice esplicitamente — «gli ordini di canale non si
eliminano: appartengono a Shopify, e il prossimo scarico li riporterebbe» — e
consente l'eliminazione solo di quelli che **su Shopify non risultano più**
(`channelMissingSince`).

⚠️ **Le domande da chiudere**, e nessuna ha oggi una risposta nel codice:

| Domanda                                                                 | Perché non è banale                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Eliminare da noi deve **cancellare anche su Shopify**?                  | è l'unica cancellazione che non torna indietro, ma è distruttiva su un sistema che non possediamo            |
| Oppure serve una **lista di esclusi** che il sync non reimporta?        | cresce senza fine, e un ordine escluso per errore sparisce per sempre senza che nessuno se ne accorga        |
| Oppure si «elimina» solo **dal registro**, lasciando vivo l'ordine?     | contraddice la regola del proprietario — sarebbero due verità diverse sullo stesso fatto                     |
| E un ordine cancellato su Shopify **dopo** essere entrato nel registro? | fiscalmente il corrispettivo di un giorno chiuso non si riscrive: è una **rettifica**, non una cancellazione |

⛔ **L'ultima riga è la più importante e cambia la forma della risposta**: un
registro dei corrispettivi è un documento fiscale. Cancellare una riga di un
giorno già chiuso non è un'operazione di database — è una rettifica, che il
registro sa già rappresentare. Prima di scrivere codice va deciso **se
«eliminare» qui significhi davvero eliminare**, o rettificare.

---

## ✅ La selezione di riga su Corrispettivi — fatta il 30/08/2026

⛔ **Qui c'erano due domande aperte**, entrambe chiuse dal proprietario lo stesso giorno:

- **il riepilogo segue la selezione** — sommando i valori di riga, che sono già finali
  (`docs/14` §0-bis, «sommare non è ricalcolare»). ⚠️ Avevo scritto che fosse vietato: era
  falso, ed è stato corretto;
- **«Annullamenti» resta del periodo**, perché non è una riga del registro.

⏸ **Resta aperto solo cosa fanno le AZIONI**: Stampa, Excel ed Esporta agiscono ancora
sull'elenco filtrato, non sulla selezione. Toccarle significa toccare stampa ed export, non
solo la UI.

⭐ La forma della selezione — caselle su scrivania, modalità «Seleziona» nella vista a card
— è in `docs/14` §0-ter.

---

## ✅ Il motore comune li ha presi TUTTI — chiuso il 31/08/2026

⛔ Qui c'era l'elenco dei quattro rimasti fuori (clienti, prodotti, giacenze,
situazione) e la nota che «document-table copre più elenchi di quanti sembri».

**Sono dodici su dodici**, e l'ultimo — i **fornitori** — non era nemmeno in quella
lista: aveva una `<table>` scritta a mano e non usava `app-data-table`, quindi il
conteggio non lo vedeva. È il tipo di svista che una lista scritta a mano produce,
ed è la ragione per cui le guardie di questo progetto **cercano** invece di
elencare.

⭐ Ognuno ha ora: taglio a colonna, altezza di riga dichiarata, maniglia visibile,
riga totali, card progettata a tre fasce e piede ancorato sotto `lg`.

⏸ **Tre non hanno la selezione** — Inventario, Giacenze, Vendite online — perché
non hanno azioni che la usino. Ora che la riga totali segue la selezione, resta
comunque una differenza fra elenchi: va decisa, non lasciata cadere.

## ⏸ Due domande di forma rimaste aperte — 30/08/2026

1. **I due verdi del telefono.** «Vendite» e «Corrispettivo» usano `--color-ok` sotto `lg`
   e `--color-primary` sopra. Il proprietario ha chiesto il verde la mattina e
   l'allineamento ai colori della scrivania la sera: le due indicazioni si contraddicono, e
   **non è stata presa una decisione al posto suo**. O si allineano al navy, o il verde sale
   anche sulla scrivania.

2. **L'allineamento dei totali su tablet.** Fra 768 e 1024px le colonne della fascia sono
   larghe ~240px per ~60px di contenuto: la forma del telefono applicata a una larghezza da
   scrivania. Nessuna decisione presa.

---

## ⛔ Il richiamo articolo rilegge il catalogo a ogni battuta — misurato 29/08/2026

Il blocco `selectedVariantIds` + `pinnedVariants` è copiato identico in **quattro**
maschere. Solo l'Ordine fornitore ha il `distinctUntilChanged`: sulle altre tre —
**Arrivo merce**, **Carico/scarico/rettifica**, **Trasferimento** — ogni carattere
digitato in una riga rilegge una variante per articolo del documento.

Il rimedio non è la stessa toppa tre volte: il blocco va **estratto una volta**, accanto
a `document-line-article.service.ts`. Con lui conviene il passaggio a una lettura sola
(`variantIds[]` nel DTO API, nessuna migrazione): l'apertura di un documento da 50 righe
passa da 100 chiamate a 2.

Misure e tabella in `14` §0.2.

## ⛔ LA VIRTUALIZZAZIONE È DIVENTATA UN PREREQUISITO — 30/08/2026

Era il **punto 2** di un piano in tre passi, ed era descritta come un'ottimizzazione. Non
lo è più.

_Decisione del proprietario, lo stesso giorno:_

> «Non deve esserci nessun limite di visualizzazione. Se il cliente ha il filtro di 30
> giorni, deve sapere vedere il totale di quel periodo, anche se si tratta di vedere mille
> ordini. **Questo vale ovunque.**»

⭐ **Il tetto di 25 righe su schermo compatto è stato tolto** dal Registro Corrispettivi, e
la regola vale per ogni elenco. Il problema che il tetto risolveva — arrivare ai totali
senza scorrere centinaia di card — lo risolve il **piede ancorato** (`regole-stile-ui`).

⛔ **Ma senza tetto, mille righe sono mille card nel DOM**, e il motore tabella non
virtualizza:

```text
righe    nodi DOM (card mobile, ~6 nodi ciascuna)
   25         150
  300       1.800
1.000       6.000
5.000      30.000     ⛔ qui il primo disegno costa secondi
```

⚠️ **Non è più «si può fare dopo»**: la decisione di mostrare tutto è già presa e già
applicata, quindi l'unica cosa che tiene in piedi il caso «mille ordini in 30 giorni» è la
virtualizzazione. Va misurata e fatta.

⭐ **E vale per la CARD, non solo per la tabella.** La tecnica descritta più sotto —
altezza di riga nota e uguale — sulla tabella funziona; sulla card no, perché le card hanno
altezze diverse. Serve una misura per card, o un'altezza dichiarata. È il pezzo che manca
al piano.

## ⭐ TOGLIERE L'IMPAGINAZIONE dalle anagrafiche — deciso il 30/08/2026

_Il proprietario: «mettere un tetto alla visualizzazione di clienti e prodotti rende
difficile la gestione», e poi «per sistemare tutto, a questo punto, conviene togliere le
impaginazioni»._

Ha ragione, ed è la stessa cosa che fanno i gestionali di riferimento: **Danea non impagina
le anagrafiche**, mostra l'archivio intero in una griglia che scorre. Su un'anagrafica
spesso non sai cosa cerchi — **scorri per riconoscerlo** — e «pagina 3 di 250» è una domanda
a cui l'operatore non sa rispondere.

⛔ **Ma è l'ULTIMO dei tre passi, non il primo.** Toglierlo per primo peggiora tutto:

```text
oggi, pagina da 20      30 kB di rete ·     220 nodi DOM
tetto tolto, così       7,4 MB di rete · 115.000 nodi DOM   ⛔
tetto tolto, dopo 1 e 2 1,3 MB di rete ·     900 nodi DOM   ✅
```

⚠️ **Danea è un'applicazione DESKTOP** con il database sulla stessa macchina: «tutto» gli
costa niente. Una web app paga la rete a ogni riga, e i due passi qui sotto sono ciò che
colma quella differenza.

---

### 1 ⭐ LA RIGA MAGRA — l'API manda 47 campi per mostrarne 9

**Misurato il 30/08/2026 sull'elenco prodotti.**

`PRODUCT_LIST_SELECT` (`api/src/products/products.service.ts`) chiede **47 colonne**. La
tabella dell'elenco ne legge **nove**:

```text
articleCode · brand · catalogOrigin · id · name · options · season · shopify · status
```

Gli altri 38 partono dal database, attraversano la rete, arrivano nel browser e **nessuno
li guarda**: `shopifyMetafields`, `shopifyCollections`, `seoTitle`, `seoDescription`,
`shopifyTaxonomyCategoryFullName`, i tre listini, i cinque campi TikTok, `internalNotes`,
`description`.

**«Riga magra» significa una cosa sola: l'endpoint dell'elenco restituisce una forma sua,
con i soli campi dell'elenco.** Il prodotto completo resta quello che si carica aprendo la
scheda, dove serve davvero.

|                                | riga di oggi | riga magra              |
| ------------------------------ | ------------ | ----------------------- |
| una riga                       | 1.525 B      | **270 B** — 82% in meno |
| 5.000 articoli                 | 7,4 MB       | **1,3 MB**              |
| 30 aziende insieme, picco Node | 218 MB       | **39 MB**               |

⚠️ **I 218 MB sono un picco simultaneo**, non una media: `JSON.stringify` tiene la stringa
intera in memoria prima di scriverla sul socket. Su un container da 512 MB, trenta richieste
contemporanee lo saturano.

⭐ **Verificata fattibile, non solo desiderabile.** Il rischio era che qualcosa leggesse la
riga intera: la duplicazione — l'unico sospetto — chiama `duplicateProduct(product.id)`,
manda **solo l'id** e il resto lo fa il server. Nessun ostacolo trovato.

⭐ **Conviene anche se il tetto restasse**: oggi una pagina da 20 articoli trasferisce
30 kB per mostrarne 5.

**Il lavoro**: un `select` di elenco distinto da quello di dettaglio, per prodotti,
clienti, fornitori, giacenze e vendite online. Nessuna migration, nessun cambio di schema.

---

### 2 ⭐ VIRTUALIZZARE il motore tabella

Il browser tiene **tutte** le righe in memoria, ma ne **disegna** solo le ~40 visibili.

```text
contenitore     altezza dichiarata: 5.000 × 30px = 150.000px
  ├─ blocco vuoto alto quanto le righe SOPRA la vista
  ├─ ~40 <tr> veri     ← le uniche che esistono nel DOM
  └─ blocco vuoto alto quanto le righe SOTTO
```

La barra di scorrimento è vera perché il contenitore è davvero alto. Scorrendo, il codice
calcola `prima riga = scorrimento ÷ altezza riga` e **riscrive il contenuto** di quelle
stesse quaranta `<tr>` — non le crea e non le distrugge.

⛔ **Non è il caricamento progressivo** (_infinite scroll_), e la differenza decide
l'ordinamento:

|                            | virtualizza il DOM       | carica scorrendo                         |
| -------------------------- | ------------------------ | ---------------------------------------- |
| dati nel browser           | **tutti**                | solo quelli scaricati                    |
| **riordinare una colonna** | ⭐ istantaneo e corretto | ⛔ lo rifà il server, si riparte da capo |
| filtrare, cercare          | istantaneo               | round-trip                               |

⭐ **Risolve l'ordinamento senza toccare l'API**: se il client ha tutte le righe, ordinare è
un `sort` su un array — niente `orderBy` Prisma, niente lista bianca, niente DTO. Rende
superfluo il lavoro descritto nella sezione «Quattro API non sanno ordinare» qui sotto.

⚠️ **Richiede altezza di riga nota e uguale per tutte**, quindi non si applica alla vista a
card mobile: lì serve una tecnica diversa, o si lascia non virtualizzata.

⚠️ **Un'azione su una riga oggi ricarica la pagina da 20.** Senza tetto ricaricherebbe
5.000 righe a ogni eliminazione: va aggiornata **la sola riga toccata** in memoria. È lavoro
in più rispetto a oggi, e va messo in conto.

⚠️ **Regge comodamente fino a ~50.000 righe** — dieci volte i numeri dichiarati (5.000
articoli, 3.000 clienti). Oltre le 200.000 sarebbe un'altra conversazione.

---

### 3 ⭐ E la vista di serie non è «tutto»: è «tutto quello che è vivo»

Articoli attivi, clienti non archiviati. «Tutto tutto» diventa un filtro che si accende.
Riduce il carico senza togliere niente — nessuno lavora sugli archiviati per sbaglio.

---

### ✅ Deciso e NON da fare: lo staleness

_Il proprietario, 30/08/2026: «per ora questo va bene»._

Nessun polling, nessun avviso «aggiornato alle 14:32», nessun canale in tempo reale.
L'operatore ricarica quando gli serve.

⚠️ Misurato lo stesso giorno: **è già così oggi** — nessun WebSocket, nessun SSE, nessun
ricaricamento al ritorno sulla scheda. Una pagina da 20 righe è già una fotografia, quindi
togliere il tetto non introduce il problema. Lo rende solo più visibile, perché su un elenco
senza tetto ci si sta più a lungo.

## ⏸ Quattro API non sanno ordinare — misurato 30/08/2026

L'ordinamento di colonna è una capacità del **motore comune**, e sugli elenchi paginati
funziona solo se l'API lo applica **prima** di impaginare.

```text
sanno ordinare      corrispettivi · documents · sales-orders · supplier-orders
NON sanno ordinare  suppliers · customers · inventory · online-sales
```

Nei quattro che non sanno, il DTO non ha un parametro `sort` e l'`orderBy` è cablato.

⛔ **La toppa lato client è peggio del buco.** Ordinare l'array già ricevuto riordina la
**pagina corrente** — venti righe su centoventisette — e l'intestazione si comporta come
se avesse funzionato. Chi ordina per «Totale» decrescente e legge la prima riga crede di
avere il documento più alto: ne ha il più alto fra venti.

Quindi finché l'API non c'è, quelle colonne dichiarano `sortable: false`, che è la
verità. Vendite online è già così (30/08/2026).

**Il lavoro**: parametro `sort` nei quattro DTO, mappatura colonna → `orderBy` con una
lista bianca (mai il nome di colonna grezzo dentro Prisma), e poi `sortable` torna al suo
valore di serie — che è acceso.

## ⏸ La sede è «Sede» negli elenchi, non ancora nei nomi accessibili — 30/08/2026

La decisione di `14` §15 è **applicata** a colonne di elenco, filtri visibili e schede di
dettaglio, ed è tenuta ferma da `npm run check:column-catalog`.

⛔ **Restano indietro i nomi ACCESSIBILI e la topbar**, e sono stati lasciati apposta:
cambiarli rompe due specifiche e2e che non si possono eseguire senza un server, quindi la
correzione va fatta insieme al loro aggiornamento, non prima.

| Dove                                                                   | Quante | Dice ancora                |
| ---------------------------------------------------------------------- | ------ | -------------------------- |
| `ariaLabel` dei filtri sede (5 elenchi)                                | 5      | «Filtra per location»      |
| topbar, selettore sede attiva                                          | 3      | «Tutte le location»        |
| `e2e/permissions-owner.spec.ts:143,149` · `e2e/permissions.spec.ts:89` | 3      | agganciano quelle stringhe |

⚠️ **Un `ariaLabel` è testo che qualcuno legge** — glielo pronuncia lo screen reader — e
sta nell'elenco di §15 come «etichetta di filtro». Non è un identificatore tecnico, e
lasciarlo «location» significa che chi non vede sente una parola che sullo schermo non c'è.

⚠️ **E non è un'uniformazione da fare in blocco.** Alcuni «Magazzino» sono **giusti** e non
sono la sede: la sezione di navigazione, la scheda dell'articolo, la colonna «impegna
magazzino» di una riga documento. Il criterio è §15 — si cambia dove la parola nomina **la
location** — e restano da rileggere, quando si toccano, titoli di stampa, intestazioni di
export, testi di aiuto e messaggi di errore.

## ✅ Fatto e committato — non va rifatto

| Commit     | Cosa                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8fa6b3d0` | **L'IVA di riga dell'Ordine cliente si azzerava al risalvataggio.** Il contratto binario era onorato dal client e non dal server (`preservedLineVat` mancava in `sales-orders`). Colpiva 4 tipi documento                     |
| `f743c6e6` | **La spunta «Scarica giacenze» della Vendita al banco non viaggiava**: il client non la mandava, il server cablava `true`. Toglierla non fermava la merce                                                                     |
| `569ae890` | **«Duplica riga» rimossa** da tutte le maschere, wrapper card e componenti condivisi. Due test-guardia impediscono il rientro                                                                                                 |
| `66a4f5f4` | **U.M.: una regola sola.** Tolti i due ripieghi client e quello server; la maschera cattura, la riga conserva                                                                                                                 |
| `87369c2d` | **T0 varianti: una funzione sola** (`api/src/common/variant-label.util.ts` + gemella client). Chiude la forma a mappa e il sentinella Shopify                                                                                 |
| `16b78933` | **Arrivo merce sulla riga comune** — l'ultima delle sette. 26 `<th>` e 29 `<td>` locali → 0. Catalogo canonico a **31 colonne**; `fieldBlur` promosso a primitiva condivisa; il controllo sconto si chiama `discount` ovunque |
| `3462ad65` | **37 import senza template** rimossi dalle cinque maschere migrate (NG8113). Restano fuori i tre `InlineBannerComponent` degli elenchi, precedenti a questo filone                                                            |
| `27bbb89a` | **Il `<colgroup>` dell'Ordine cliente non conosceva la Variante**: 16 `<col>` che mappano per posizione, con la sesta in poi sulla colonna sbagliata. Stesso difetto dell'Arrivo merce, nella maschera di riferimento         |

## 🔵 BLOCCO A — la colonna Variante

**Deciso**: il titolo dell'articolo è **uno**; la variante va in una **colonna propria**,
mai dentro il titolo. Contiene i **soli valori** (`M / Rosso`), memorizzati come **testo
composto** — non dati grezzi da ricomporre: un documento emesso deve continuare a dire
quello che diceva.

|                                       | Stato                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T0** funzione unica di composizione | ✅ `87369c2d`                                                                                                                                                                                                                                                                                |
| **T1** schema + migration             | 🔵 **prossimo**. `variantLabel TEXT NOT NULL DEFAULT ''` su `document_lines`, `supplier_order_lines`, `sales_order_lines`, `online_sale_lines`, `inventory_count_lines`. Migration **a mano**, fine riga LF, poi `npm run prisma:deploy:test` + `prisma:generate` + **avvio reale dell'API** |
| **T2** la scrittura                   | ⛔ **insieme** alla rimozione della concatenazione del banco (`store-sales.service` scrive `productName — optionSummary` dentro `description`). Separarle produce «Maglietta — M / Rosso — M / Rosso»                                                                                        |
| **T3** colonna desktop                | ⛔ id **`variantLabel`**, MAI `variant`: `normalizeGoodsReceiptColumnId` rimappa `variant` su `product`, e la colonna sarebbe irraggiungibile in Arrivo merce, in silenzio                                                                                                                   |
| **T4** card mobile                    | `variantLabel` **esiste già** su `document-line-card`, con stile: la riempie 1 maschera su 7                                                                                                                                                                                                 |
| **T5** PDF e stampe                   | tre PDF: documento, ordine fornitore, ordine cliente. Le frazioni di larghezza devono sommare a 1.00                                                                                                                                                                                         |
| **T6** XML fattura elettronica        | ⛔ lì la colonna separata **non esiste**: un solo `<Descrizione>` per riga. Si ricompone in **un punto solo** (`document-xml.service`), non nella util. ⏸ **Da verificare sulla fonte ufficiale** cardinalità e lunghezza                                                                    |

⭐ **Guadagno adiacente visto e non fatto**: lo SKU oggi il PDF lo stampa e l'XML lo perde.
`CodiceArticolo` è lo slot fatto apposta ed è vuoto.

⚠️ **Semantica da non perdere**: `''` = nessuna opzione visibile, **compresi** prodotto
semplice e il `Default Title` di Shopify. `variantId` resta l'identità tecnica,
`title` / `description` / `productName` restano il testo della riga. **Nessuna
concatenazione permanente.**

## 🔵 BLOCCO B — lo sconto a cascata ovunque

**Deciso**: formato e regola **uguali in ogni documento**. Una cella sola, cascata a N
valori (`5+7+10`), **notazione conservata alla riapertura**, «prezzo scontato» colonna a sé.

⚠️ **La cascata esiste già** e regge N valori. A mancare è la **conservazione**:
`SalesOrderLine.discount` è testo e la conserva, `DocumentLine.discountPercent` e
`SupplierOrderLine.discountPercent` sono `Decimal(7,4)` e memorizzano solo l'effettiva —
si digita `5+7+10`, si riapre e si legge `20,49`.

**Tocca lo schema**: colonna testo su quelle due tabelle, **nessun backfill** (convertire
13,6 in «4+10» è indecidibile). ⏸ Da valutare: `Decimal(7,4)` verso `(9,6)`, perché tre
valori a due decimali producono sei decimali.

## 🔵 BLOCCO C — il listino come sorgente del prezzo

**Deciso** (§5.7 del contratto): la sorgente si dichiara nell'**anagrafica della
controparte**, il documento la eredita all'apertura, la testata ha la **select** per
cambiarla — su vendita **e** acquisto — e cambiarla **ripopola tutte le righe**.

- ⛔ **`Customer` non ha nessun campo listino**: serve una colonna su `customers`
- il meccanismo di lettura **esiste già**: `document-listino.util`, adottato da **2 maschere su 8**
- ⛔ nessun ripiego: articolo senza valore per quel listino porta a **0,00 + segnalazione per riga**
- ⏸ **APERTO**: dove vive il «prezzo fornitore». Oggi `SupplierVariantLink.lastPurchasePriceMinor`
  è l'**ultimo prezzo pagato**, riscritto dai carichi — non un valore impostabile

## 🔵 BLOCCO D — il risolutore di riga unico

⭐ **È l'obiettivo grande**, e il resto ci converge. Oggi la domanda «ho scelto questo
articolo in questo documento: cosa scrivo sulla riga?» ha **una risposta per maschera**;
in ERPNext ne ha una sola (`get_item_details` più `transaction.js`).

**Il contratto proposto** sta nella sintesi del censimento del 23/08: funzione pura
`resolveDocumentLine(input): LineResolution`, con `set` (i campi **da scrivere**, già
filtrati dalla regola della fotografia), `live` (fatti che non si persistono mai) e
`issues` (avvisi, mai blocchi). Profilo **`Record` esaustivo per tipo**, non
`if(documentType)`.

⛔ **Il T0 del risolutore viene prima di qualunque unificazione**: il test di
caratterizzazione che fotografa **com'è oggi**. E va scritto sui **PERCORSI**, non sulla
matrice — la scansione dell'Arrivo merce forza `loadsStock = true` scavalcando la politica
dichiarata per quella maschera.

⚠️ **Tre «nuclei comuni» erano scritti più larghi di dove sono veri** (verificato da un
agente avversario):

- «tutte e otto leggono `VariantSummary`» → la Registrazione fattura ha **zero** occorrenze
- «il flag magazzino nasce dal tipo articolo, identico ovunque» → **esiti opposti** su un Servizio
- `DOCUMENT_LINE_COLUMNS` come «decisione già presa» → copre **3 maschere su 8**

## 🔵 BLOCCO E — decisioni prese, da applicare ovunque

|                            | Cosa manca                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Richiamo articolo** (§4) | sovrascrive **sempre** con l'anagrafica, anche a parità di articolo; **quantità e sconto digitati restano**. Oggi lo fa **solo l'Ordine fornitore**                           |
| **Servizio** (§6.2)        | non fa partire **nessuna** delle tre spunte. Oggi due formule con esiti opposti                                                                                               |
| **«Titolo»**               | rinominare «Nome prodotto» in «Titolo» ovunque, per parità con Shopify                                                                                                        |
| **Duplica documento**      | nella **barra azioni degli elenchi**, per tutti i tipi. ⛔ Tre tipi hanno rotta `null`, cioè comando **muto**; l'Ordine fornitore non ha duplicazione affatto (lavoro server) |
| **Registra movimento**     | i tre pulsanti in anagrafica aprono **quella maschera come popup**, articolo precompilato                                                                                     |
| **Inventario fisico**      | 5 passi di adozione dei componenti condivisi (elenco, filtri mobile, tabella righe, lookup e scanner, barra azioni). ⛔ **Non** `DocumentLineFocusStore`                      |

## ⛔ DIFETTI MISURATI E NON ANCORA CORRETTI

Trovati dal censimento del 23/08, tutti con file e riga nella sintesi. Per gravità:

1. **Registra movimento scrive il prezzo di VENDITA in `unitCostMinor`** sullo Scarico: la
   UI dice «Prezzo unitario», propone il listino, e quel numero finisce nella colonna del costo
2. **I movimenti di Registra movimento sono irreversibili**: nessun `PATCH`, nessun `DELETE`.
   ⏸ Decisione aperta: si accetta, o servono modifica ed eliminazione?
3. **Costo 0 diventa `null`** sull'Ordine fornitore, contro la decisione «un articolo senza
   costo ha costo 0» e contro il commento della maschera stessa
4. **`isReference` perso nel duplicato server-side**: una riga «Documento collegato» rinasce
   come riga ordinaria ed entra nei totali
5. **Il duplicato dell'Ordine cliente non azzera gli id** delle righe copiate (Trasferimento
   e Rettifica sì): il duplicato nasce dichiarando gli id dell'originale
6. **`applyConversionPrefill` non converte il prezzo** nella modalità del documento, mentre
   il suo gemello `onDocumentIncluded` sì
7. **Riga agganciata senza descrizione**: il salvataggio si rifiuta **senza dire quale riga**
8. **Il riallineamento in blocco ricattura la U.M. svuotata**: l'operatore non può lasciarla
   vuota su una riga con articolo _(emerso il 23/08 chiudendo la U.M.)_
9. **`TenantFeatureSettings.defaultUnitOfMeasure` non la legge nessuno**: esiste, è
   configurabile, e le maschere cablano `'pz'`. O si collega, o si toglie dalle Impostazioni
10. **Quattro maschere non ridistribuiscono le larghezze dal vivo** _(misurato 24/08/2026)_.
    Documenti vendita, Rettifica, Trasferimento e Ordine fornitore usano le **quote**
    percentuali (`lineColumnQuotaWidth`, `sumVisibleLineColumnsPx`) ma legano solo
    `(columnResized)`: trascinando una maniglia il totale cambia e **tutte** le altre
    colonne si riscalano, invece di far cedere spazio alla vicina. Arrivo merce e Ordine
    cliente lo fanno — ognuno con una **copia sua** di `redistributeLineColumns` +
    `lineColumnDraft`. Due sistemi a metà: o sale il pezzo mancante nell'utility comune,
    o le due copie restano a divergere
11. **Inventario fisico**: `finalize` applica un **delta relativo** invece di portare la
    giacenza al valore contato; `createdByName` è la stringa `'API'`; il documento è creato
    **fuori** dalla transazione che ha già scritto giacenze e movimenti

## ⏸ Da fare al riallineamento dei rami — `defaultUnitOfMeasure` _(26/08/2026)_

⛔ **Qui c’era scritto «si toglie al merge, non prima», e il presupposto era sbagliato.**
Dava per scontato che per ripulire il codice bisognasse eliminare la colonna. Non serve —
e «si toglie al merge» non era nemmeno un meccanismo: nessuno l’avrebbe letto al momento
giusto, e il collega non ne sapeva niente.

### Quello che si può fare SUBITO, senza coordinare niente

Il campo esce da `schema.prisma`, dal DTO, dai `DEFAULTS`, da `toDto` e dal modello
frontend. **La colonna resta nel database, orfana.**

⭐ **Una colonna che il database ha e lo schema non dichiara è invisibile a Prisma**, e
nel progetto è già così — provato il 26/08 sul database condiviso:

```text
documents.cash_session_id     nel DB ✔   nel nostro schema ✘
p.document.count()        →   169        nessun errore
p.document.findFirst()    →   66 campi   cashSessionId non c’è
```

È una colonna del ramo cassa, sulla tabella più letta dell’applicazione. E non è sola:
il ramo locale ha già applicato le 6 migration di cassa (commit `445eabb7`), quindi nel
database vivono **12 oggetti** che questo `schema.prisma` non dichiara.

### Quello che invece NON si fa adesso: il `DROP` fisico

Gli altri rami dichiarano ancora la colonna. Toglierla dal database romperebbe le loro
query che la **nominano**.

⚠️ **Perimetro, misurato — non «ogni lettura».** Prisma nomina le colonne che la query
chiede: una `select` mirata sopravvive, cadono le query senza `select` (`upsert`,
`update`, l’export di backup) che fanno `RETURNING` di tutti gli scalari.

⛔ **E non è «facoltativo per sempre».** Non è urgente, ma una colonna fantasma è debito:
si toglie quando nessun ramo la dichiara più.

#### ⛔ La condizione è sui PROCESSI, non sulle dichiarazioni _(corretto dal proprietario, 26/08/2026)_

⛔ **Qui c’era scritto «si toglie quando nessun ramo la dichiara più». È troppo rigido**, e
trasformava un fatto operativo in una condizione quasi impossibile da soddisfare: un ramo
fermo su GitHub **non interroga niente**. Può dichiarare cento campi vecchi senza
conseguenze.

> **La condizione reale: nessun codice REALMENTE IN ESECUZIONE contro quel database deve
> ancora richiedere `defaultUnitOfMeasure`.**

I rami inattivi si riallineano **col merge** prima di essere rieseguiti — è esattamente a
questo che servono:

```text
ramo corrente (schema senza il campo)
   ├── merge → develop     develop diventa compatibile
   └── merge → main        main diventa compatibile
                              ↓
                   ⚠️ e POI il processo va ridistribuito:
                      il merge cambia il codice, non ciò che gira
```

⚠️ **Il merge non è una copia**: se quei rami hanno modifiche proprie divergenti, i
conflitti si risolvono — non si presume che diventino identici byte per byte.

#### Chi gira davvero contro questo database — misurato, con la sua riserva

Interrogato `pg_stat_activity` il 26/08/2026: **sei connessioni, tutte infrastruttura
Supabase** (`pg_cron`, `pg_net`, `postgres_exporter`, `PostgREST`, `Supavisor`) più una
anonima ferma da dodici giorni. **Nessuna connessione applicativa Prisma/NestJS visibile.**

⚠️ **Ma questa misura NON prova che Railway non sia connesso**, e va detto: le connessioni
passano dal pooler Supavisor, che le multiplexa — un client applicativo può non comparire
come connessione distinta. La misura dice «non se ne vede una», non «non ce ne sono».

⭐ **L’unico processo che conta resta `main` su Railway**, ed è lo stesso attore della
rinomina dell’enum (vedi `00-DECISIONI`, in testa). Le due cose si chiudono insieme, con
lo stesso merge e lo stesso ridispiegamento — non sono due lavori.

⭐ **E il `DROP` costerà zero**: nessun tenant ha mai cambiato quel valore —
`select count(*) where default_unit_of_measure <> 'pz'` → **0 righe**. Non c’è un dato da
salvare, solo una colonna da togliere.

#### Se il ramo cassa viene eliminato — cosa resta comunque da decidere

Le sue 6 migration sono **già applicate** al database e il ramo locale le porta
(commit `445eabb7`). Cancellare il ramo non annulla gli oggetti nel database.

⛔ **Le 6 cartelle di migration devono RESTARE** anche se il ramo sparisce: toglierle
farebbe divergere la storia (`_prisma_migrations` avrebbe 6 voci che la cartella non ha),
ed è la condizione che `prisma migrate status` segnala come `historiesDiverge`.

Restano invece **12 oggetti che nessuno schema dichiarerebbe più**. Sono praticamente
vuoti — quindi ripulirli, quando si deciderà, è gratis:

```text
cash_sessions · cash_session_movements · fiscal_receipts · fiscal_devices · pos_terminals    0 righe
store_sale_payments                                                                          1 riga
documents.cash_session_id                                                        0 valorizzati su 169
```

⏸ **Decisione aperta, non dedotta**: quegli oggetti si riconciliano nello schema o si
eliminano? Finché non è deciso restano orfani, e va bene — è lo stato in cui sono oggi.
---

## ⏸ DA PORTARE AL PROPRIETARIO — l’audit dei nove flag `TenantFeatureSettings`

⚠️ **Passo 1 fatto** (commit `caa9c82c`): tolte le due caselle «Giacenze negative»
(`warnNegativeInventory`, `blockNegativeInventory`) dal pannello Impostazioni, perché
non comandavano niente — nessun consumer, e la politica vera è quella di
`inventory-level-delta.util`: l’insufficienza **avvisa e non blocca mai**. Le colonne
restano nel database (vedi blocco qui sopra).

⛔ **I sette flag restanti NON si toccano** finché le domande sotto non hanno risposta.
Il proprietario è stato esplicito: _«non farei ancora modifiche automatiche»_, e un flag
che esiste non è un motivo per implementarlo.

## ⏸ DOMANDE APERTE — non colmarle per verosimiglianza

- **Prezzo fornitore**: dove vive il valore impostabile (blocco C)
- **XML fattura elettronica**: cardinalità e lunghezza di `<Descrizione>` **da verificare
  sulla fonte ufficiale**; e se il separatore lungo vada bene verso SdI
- **Import prodotti via XML**: il proprietario segnala che molti clienti caricano così. È un
  feed **diverso** da FatturaPA, e non ha ancora una specifica
- **Movimenti irreversibili** di Registra movimento (difetto 2 qui sopra)
- **I sette flag `TenantFeatureSettings` superstiti**: per ognuno, si implementa, si
  rimuove, o resta dichiarato aperto? Sono decisioni di prodotto, non di pulizia

---

## ⭐ Leggere prima: dal 20/08/2026 le decisioni stanno in `00-DECISIONI.md`

**Prima di cercare qui, si guarda lì.** `docs/00-DECISIONI.md` dice in una pagina che cosa è
già deciso e dove è argomentato, comprese **tutte le decisioni aperte in un posto solo**.
Questo file resta quello che era — **cosa manca** — e non è un indice.

### Chiuso il 20/08/2026, e non va più cercato qui

| Fatto                                                                                 | Dove è scritto |
| ------------------------------------------------------------------------------------- | -------------- |
| **motore tabella comune** su documenti, ordini cliente, ordini fornitore, movimenti   | `14` parte H   |
| **barra azioni e selezione** comuni, con il contratto `ListAction`                    | `14` parte D   |
| **clic di riga → Modifica**, dichiarato per tipo                                      | `14` §2        |
| **pulsante Dettaglio** su elenco documenti e ordini fornitore                         | `14` §E4, §E6  |
| **ordinamento** su tutti e tre gli elenchi paginati, con la guardia in `npm run lint` | `14` §H15      |
| **grammatica visiva** dei riepiloghi, decisa voce per voce                            | `14` §F6       |
| **niente paginazione** su OGNI elenco, anagrafiche comprese                           | `14` §11.4     |
| **filtri derivati dalle colonne**, con il pulsante che li accende e azzera            | `14` §0.2      |

⚠️ **Restano da guardare a schermo**: le quattro schermate migrate, dopo la promozione della
grammatica. Build e test dicono che compila, non come si vede.

### Il prossimo blocco

**Vendita e Reso al banco** (`11`), che riparte in una sessione dedicata. §A11-quater di quel
documento elenca che cosa eredita dalla base comune: non si riprogetta niente di quello.

### ⛔ DUE BLOCCHI DEDICATI, dichiarati chiusi al lavoro corrente — 22/08/2026

Il proprietario li ha separati esplicitamente. ⚠️ **Non si aprono "per un pezzetto"**: sono
la ragione per cui una correzione può risultare **bloccata** invece che rimandata, ed è un
esito legittimo — improvvisarne metà di nascosto no.

#### Blocco A · **Includi / Genera**, e la provenienza di riga

Comprende il redesign del motore di inclusione e derivazione **e** il meccanismo che manca
sotto: un dato **per riga** che dica da quale documento quella riga proviene.

Il fatto che lo rende necessario, misurato il 22/08 (`07` §5-bis): **`DocumentLine` non ha
alcun campo di provenienza.** `lineSource` è della Registrazione fattura acquisto («Null
altrove»), `IncludedDocumentLine` trasporta solo `isReference`, e `sourceDocumentId` sta su
**`Document`** — dice da dove viene il documento, non la riga.

⭐ **Due cose esistono già e vanno usate come punto di partenza, non reinventate:**

| Cosa                                                              | Dov'è                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| una guardia di catena **in esercizio**                            | `Document.onlineSaleId` (`documents.service.ts` ~2343, `schema.prisma` ~2107) |
| un canale di aggancio **attivo**, separato da «Includi documento» | `linkedDdtIds` / `InvoiceSalesDdtLink`                                        |

⚠️ E **i motori di derivazione sono DUE** — `buildConversionDto` e `concludeManualPrefill`:
una guardia messa nel primo lascerebbe scoperto il secondo, che è quello attivo.

#### Blocco C · **Nota di credito → Fattura elettronica** _(registrato 22/08/2026)_

⛔ **Gap aperto, NON da correggere fuori dal suo blocco.** È emerso togliendo alla NC
l'aggancio DDT, e va tenuto distinto da quella correzione.

|                                                      |                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| tipo fiscale                                         | **`TD04`**                                                                                            |
| collegamento alla Fattura/Accompagnatoria originaria | **già deciso**                                                                                        |
| implementazione FE                                   | **non ancora completa** — il generatore emette `TD01` per ogni fattura esportata e non conosce `TD04` |
| dove si affronta                                     | blocco dedicato **Famiglia Fattura / FE**                                                             |

⚠️ **Non va confusa con «Includi»**: la Nota di credito **non include DDT**, e quel percorso è
chiuso dal 22/08 (`07` §5-bis). Il collegamento che le compete è quello con la **fattura
originaria**, ed è un'altra relazione — `Document.sourceDocumentId`.

⭐ **La distinzione conta proprio qui**: quando la FE della NC verrà implementata, i
riferimenti che l'XML richiede si prenderanno **attraverso la fattura di origine**. Chi
leggesse solo «alla NC servono dei riferimenti DDT» sarebbe tentato di riaprire l'ingresso
appena chiuso.

#### Blocco B · **Document Line trasversale** — il censimento NON è chiuso

Riprende dopo la chiusura dei difetti concreti. Comprende:

- il **catalogo canonico** delle celle e delle colonne condivise, completato;
- la verifica e la migrazione dei documenti che hanno ancora **celle locali o duplicazioni**,
  **un documento alla volta, con test di regressione**;
- il completamento della condivisione di **riga, intestazione e riga di inserimento** dove
  applicabile;
- Codice fornitore, SKU, EAN, descrizione riga, prezzi articolo che entrano nel catalogo
  **senza obbligare ogni documento ad avere tutte le colonne**.

> ⛔ **Il principio che governa tutto il blocco B, fissato dal proprietario:**
> **condividere il componente non significa condividere il significato o il dato sottostante.**

Le quattro applicazioni già dichiarate di quel principio:

| Caso                          | Si condivide            | NON si condivide                                                                   |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `commitsStock` / `loadsStock` | la cella                | **sono dati diversi**: uno impegna, l'altro movimenta                              |
| **quantità**                  | la cella e la sua veste | `min`, validatore ed effetti restano **policy del documento**                      |
| **Giacenza / Disponibile**    | la cella                | i dati sono **calcolati rispetto alla location** di quel documento                 |
| **costo**                     | la grammatica visiva    | costo **informativo**, costo **documento** e costo **anagrafica** restano distinti |

---

## ⚠️ Leggere prima: la specifica del Registro è cambiata il 16/08/2026

Esiste ora **`10-specifica-registro-corrispettivi.md`**, ed è la fonte corrente. Tre cose
che questo file dava per assodate non lo sono più:

1. **Nessun flusso «commercialista».** Consegne, invii e registrazioni sono stati
   rimossi — codice, UI e persistenza. Periodo → filtri → stampa/export → fine.
2. **Shopify POS compare nel Registro** come vendita fisica/POS. Non si esclude: si
   classifica, e la classificazione viene da `source`.
3. **`SalesOrderFiscalStatus` non esiste più**, colonna e tipo PostgreSQL. Non è stato
   sostituito.

E una che era scritta qui e altrove ed era falsa: **`CorrispettivoEntry` non è la sorgente
del Registro** — quella tabella non viene più scritta dall'11/08, e le sue righe residue
sono storia. Non ci si deduce la logica nuova (`10` §7).

---

## Prima di toccare qualsiasi cosa: tre fatti che cambiano come si legge tutto

### 1. I webhook di Shopify vanno in PRODUZIONE, non sulla macchina di sviluppo

Le sette sottoscrizioni puntano a `https://vestiflow-production.up.railway.app`, che gira **`main`**, sullo **stesso database** di sviluppo.

| Chi provoca il fatto                         | Chi lo esegue       | Con quale codice |
| -------------------------------------------- | ------------------- | ---------------- |
| un gesto su Shopify (ordine, evasione, reso) | ambiente pubblicato | `main`           |
| un pulsante nell'app locale                  | API sulla macchina  | il ramo corrente |

**Conseguenza pratica**: una correzione su questo ramo non entra in gioco finché qualcuno non preme un pulsante. Chi guarda il database vede il risultato della produzione e rischia di attribuirlo al proprio lavoro — **è già costato un errore** il 14/08 (la sede di scarico, dichiarata «corretta» guardando un movimento prodotto in realtà dal ripiego di `main`).

Dettaglio in `02-specifica-sincronizzazione-shopify.md` §4.11.

### 2. Il grado di certezza si dichiara, e sono tre

**letto** (ho letto la riga di codice) · **dedotto** (segue dallo strumento, non l'ho visto) · **provato** (eseguito sul sistema vero, database letto prima e dopo).

Quella che si perde più facilmente è la differenza fra le prime due: un'analisi di codice produce «letto», e il «quindi succede X» è **dedotto**.

### 3. Il database è condiviso col collega

Migration scritte a mano, provate con `npm run prisma:deploy:test`; mai `migrate dev` né `db push`. Al database di Railway ci pensa il deploy, e ⛔ **per il condiviso non esiste un comando locale** (07/09/2026). Ogni tabella nuova porta RLS e `REVOKE` nella stessa migration.

---

## Cosa è stato chiuso il 14/08 — non va rifatto

Diciassette commit, tutti su albero verde (1512 test API, lint completo, type-check di entrambi i lati). **Niente push, niente deploy.**

**Il registro corrispettivi è finito e funziona così:**

- è **derivato** da vendite e rettifiche — `corrispettivo_entries` non viene più scritta dal ramo;
- conta le vendite alla **data di evasione**; un ordine mai spedito non entra, un annullamento pre-evasione resta fuori da sé;
- **sottrae le rettifiche alla loro data**, saltando gli annullamenti;
- l'elenco mostra le rettifiche come **righe negative**: il totale in fondo si ricostruisce sommando la colonna;
- si filtra per **periodo di calendario** (mese, trimestre, anno precisi), **canale** e **tipo**, indipendenti fra loro;
- **CSV, Excel e PDF** usano lo stesso dataset della schermata e si riconciliano col proprio totale;
- è quello che l'operatore trova su **«Corrispettivi» in sidebar**; `/app/reports/corrispettivi` fa redirect.

**Riconciliazione di agosto 2026**, verificata per tre strade indipendenti:

```
venduto      411,02
rettifiche  −205,01
annullamenti      0     (vendite mai avvenute)
─────────────────────
corrispettivo 206,01
```

**Quattro difetti corretti**, tutti trovati con ordini costruiti apposta: la sede di scarico (`01` §3.8), l'IVA della spedizione nei rimborsi (`08` §4), il registro che contava merce mai partita (`01` §2.16), l'imposta di riga ridistribuita (`01` §3.12).

---

## Da fare, in ordine

### 1. ⭐ Procedura di prima sincronizzazione — **mai entrata in `docs/`**

È il lavoro più grande e blocca gli altri due. Deve contenere, oltre a quanto già discusso altrove:

- **la corrispondenza fra aliquota Shopify e Codice IVA di VestiFlow.** Oggi le righe importate portano `{"ratePercent": 22, "matched": false}` — l'aliquota osservata, **senza** codice interno. È deliberato: il dato del canale si conserva subito, la corrispondenza è una decisione. Senza di essa il **filtro per aliquota** non può tornare nel registro, perché sarebbe solo un'etichetta;
- **l'aggancio delle location**, che è il prerequisito per leggere le _fulfillment orders_ e chiudere il ripiego alfabetico sull'impegno (`01` §3.8, parte ancora aperta);
- il resto del disegno in `02-specifica-sincronizzazione-shopify.md`, che è **disegno e non consuntivo**.

### 2-bis. ✅ Il Corrispettivo manuale è costruito — 17/08/2026

**Fatto.** Entità, API, innesto nel Registro, colonna e filtro Sede, colonna origine e
dettaglio IVA nell'export, maschera di creazione/modifica/eliminazione, con le prove del
`10` §13. Il consuntivo della costruzione — le sette cose che il §13 non prevedeva, e cosa
resta — è in **`10` §14**.

⚠️ **La guida utente è stata aggiornata insieme** (§15). Qui sotto resta il testo di allora,
perché dice ancora _cosa_ doveva entrarci e serve a rileggerlo con occhio critico.

_Testo del 17/08, prima della costruzione:_

`GUIDA-UTENTE-VESTIFLOW.md` §15 «Corrispettivi» oggi **è ancora esatta** — verificato il
17/08: descrive il quadro economico per periodo, non nomina la verticale ritirata, e non
descriveva nemmeno il pulsante export doppione che è stato spento. Non c'è niente da correggere
adesso, e scrivere in guida una funzione che non c'è è peggio che non scriverla.

**Cosa andrà aggiunto quando la maschera sarà pronta**, in §15 subito dopo «Come si usa»:

- il pulsante **«+ Aggiungi corrispettivo»** e a cosa serve — i quattro casi reali (cassa
  esterna durante un guasto, vendite non ricostruibili, differenza di chiusura, importi
  storici), detti con parole da operatore;
- che è una registrazione **solo economica**: non tocca il magazzino, non crea prodotti;
- righe `Descrizione · Importo · Codice IVA`, più aliquote nella stessa registrazione;
- il selettore **Ivati/Netti**, che parte da Ivati perché si copiano i valori della cassa;
- che si può **correggere ed eliminare**, e che eliminando resta un buco nella numerazione —
  è normale e non si rinumera niente;
- la colonna **Location** e il perché di **«Non determinata»** sulle righe Shopify, con la
  riga che dichiara quante ne restano fuori quando si filtra per sede.

⚠️ E va aggiornata anche la tabella dei permessi di §15: la scrittura sul Registro passa da
`reports.fiscal_register`, la cui descrizione parla ancora di «marca le consegne al
commercialista» — flusso **ritirato**. Quel testo va riscritto quando il permesso viene usato
davvero: oggi non lo usa nessuna rotta.

### 2. Specifica sedi

Ferma dalla mattina del 14/08.

#### ⚠️ Lacuna registrata il 17/08: la Location Shopify non è strutturalmente affidabile

> **La Location delle vendite e delle evasioni Shopify deve essere sempre determinata in modo
> affidabile, e non deve dipendere da ripieghi arbitrari.**

Emersa costruendo il **Corrispettivo manuale** (`10` §12), che porta la colonna Location dentro
il Registro Corrispettivi. Misurata, non ipotizzata:

- `SalesOrder.locationId` **esiste ma è della sola testata manuale**, e la sync non lo scrive
  mai — né in `orderData` né nel `create`. Per gli ordini di canale il Registro può leggere la
  location **solo** dalla Vendita online;
- `OnlineSale.locationId` **è nullable**, e la sync passa una location all'evento solo se ci
  sono righe impegnabili;
- dove il valore c'è, **può essere stato indovinato**: se la sede Shopify non è mappata,
  `resolveShopifyOrderLocationId` ripiega sulla **prima sede licenziata in ordine alfabetico**
  (`orderBy: { name: 'asc' }`). Il danno è già stato misurato una volta e sta scritto nel
  codice: «Shopify spediva da _Shop location_, VestiFlow scaricava da _Magazzino test 3_ —
  prima per la M»;
- la relazione è `onDelete: SetNull`: il dato **si perde** se la sede viene eliminata.

⚠️ **Il punto che conta**: il valore letto **non porta con sé se sia stato dichiarato dal canale
o indovinato**. Chi lo legge non può distinguere i due casi.

**Nel frattempo il Registro dice «Non determinata»** e non inventa niente — è un'**anomalia
temporanea dichiarata**, non uno stato del modello (`10` §12). Quando questa lacuna sarà
chiusa, quella dicitura deve sparire da sé.

**Non si tocca la sync adesso**, per decisione esplicita del 17/08: il Corrispettivo manuale non
si blocca per sistemare Shopify. Questo caso si affronta qui, nel blocco sincronizzazione.

### 3. ✅ Eliminazione di `corrispettivo_entries` — **fatta il 17/08/2026**

Migration `20260817140000_ritira_corrispettivo_legacy`, applicata. Sono caduti: le due tabelle e i loro dati (6 voci, 11 righe, tutte ferme al 14/08 alle 20:53), la riga di numeratore rimasta, gli endpoint `/online-sales/register/entries`, il servizio, i DTO, la maschera `corrispettivi-register`, i mapper, `CorrispettivoEntryStatus` e `DocumentType.corrispettivo` **dal codice**.

⚠️ **Il valore resta morto nel tipo PostgreSQL**, ed è deliberato: `ALTER TYPE … DROP VALUE` non esiste, e ricostruire il tipo significherebbe riscrivere ogni colonna che lo usa. Stessa scelta già fatta il 16/08 per `externally_registered`. La guardia `check:registro` copre ora **26** termini e impedisce che rientri nel codice.

**Il rischio è stato messo a verbale e accettato**: `main` — che gira su Railway — scriveva ancora quelle tabelle a ogni evasione, quindi fino al rilascio di questo ramo un ordine evaso su un negozio collegato manda in rollback l'intera transazione. Nessun tenant è in produzione vera.

**Prima di eliminare è stato fatto un censimento** (`10` §11) per verificare che non stesse cadendo anche una funzione utile: la registrazione manuale economica in stile Danea. Verdetto **A** — era solo il duplicatore automatico. Da lì nasce il **Corrispettivo manuale** (`10` §12), che è funzione nuova, non un ripristino.

---

## Anagrafica articolo — deciso il 17/08, in parte fatto

### ✅ Fatto: il campo si chiama «Prezzo di vendita», ovunque

Lo stesso dato (`sellingPrice`) si chiamava in **cinque** modi: «Prezzo al pubblico» in Arrivo
merce e Ordine fornitore, «Prezzo articolo» in anagrafica e dettaglio, «Prezzo vendita» nel
passo varianti e nel riepilogo, «Prezzo» nelle tabelle strette, «Prezzo unitario» nei movimenti.

**29 sostituzioni in 15 file** più le prove e i documenti. Scelto **«Prezzo di vendita»** e non
«Prezzo al pubblico» — che pure era già il nome in due maschere — perché «al pubblico»
presuppone il dettaglio, e la convenzione aziendale netto/ivato appena introdotta ammette
esplicitamente che l’azienda possa ragionare all’ingrosso.

**Restano fuori di proposito:**

| Cosa                                                  | Perché                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| «Prezzo netto» / «Prezzo ivato» nelle righe documento | è la **modalità**, la scrive `priceModeRowLabel` e cambia da sola     |
| «Prezzo» secco nelle colonne strette                  | il contesto è già la riga, e allargare la colonna non aggiunge niente |
| «Prezzo unitario» nei movimenti                       | è il valore dell’**evento**, non il prezzo di catalogo                |
| «Prezzo barrato», «Prezzo Shopify»                    | sono altri prezzi, e si chiamano già bene                             |

### ✅ Fatto il 17/08: il prezzo barrato è un prezzo di vendita come gli altri

Era l’unico dei sei a ignorare il selettore netto/ivato, **in silenzio**. Adesso è in
`PRICE_FIELDS`, la colonna è `Decimal(16,6)` e il valore memorizzato è il netto canonico.

⚠️ **I 6 valori esistenti sono stati portati a `NULL`**, non a zero — il barrato è facoltativo
e zero direbbe «esiste e vale zero». Misurati prima: 6 prodotti su 250, tutti dello stesso
tenant di prova, tutti al 22%, coi nomi che lo dicono («test import listini», «The Compare at
Price Snowboard»). `Int → Decimal` è senza perdita **numerica**, ma la **semantica** cambiava:
un 70,00 scritto intendendo «ivati» sarebbe stato riletto come netto e mostrato 85,40.

**Difetto trovato dalle prove, non dall’occhio:** `currentDraft()` riscriveva cinque prezzi dal
netto canonico e lasciava passare il barrato **grezzo** dal form. Con il campo dentro
`PRICE_FIELDS` ma fuori da lì, il valore digitato non veniva mai scorporato.

`buildVariantsPayload` è stata estratta dal servizio di push in una util propria — era un
metodo privato che non usava `this`, e **nessuna prova la copriva** mentre decide due valori
che finiscono sotto gli occhi del cliente. Nove prove, fra cui quella che `null` non diventa
`0.00`.

#### ✅ Fatto: anche l’Arrivo merce

Le sue tre colonne di vendita — Prezzo di vendita, Prezzo barrato, Prezzo Shopify — **non
seguivano nessuna modalità**: si scrivevano e si rileggevano grezze, quindi nette senza dirlo.
E siccome la convenzione predefinita è ivata, in anagrafica si digitava ivato e qui lo stesso
numero finiva netto: **due schermate, stesso prezzo, due significati.**

Adesso hanno **un solo stato** netto/ivato, distinto da quello dei costi:

```text
salesPricesIncludeVat (tenant)  →  semina lo stato di sessione  →  il selettore lo cambia
                                                                →  nessuna persistenza
```

⚠️ **Seminato, non letto ogni volta.** Leggere la convenzione a ogni conversione avrebbe reso
la modalità **fissa**, e il selettore un comando che non comanda.

⚠️ **E non passa da `resolvePricesIncludeVat`**: l’Arrivo merce è un documento di acquisto,
quindi quella catena gli risponde `false` per costruzione. La convenzione arriva dal tenant,
che il componente aveva già iniettato.

**Il costo resta separato**, con la sua modalità di documento: concorre al totale, questi tre
no — sono dati dell’ARTICOLO che passano di qui, ed è la seconda porta che scrive l’anagrafica.

**Difetto trovato dalle prove, non dall’occhio:** al primo tentativo i netti venivano letti
**dopo** aver cambiato modalità, e il giro diventava un’identità — il campo non si muoveva di
un centesimo e la modalità cambiava solo di nome. Adesso si leggono prima e si riscrivono dopo,
come nell’Ordine cliente.

Nove prove, fra cui le sette chieste: azienda ivata e netta, i tre campi che si muovono
insieme, prezzi e costo che non si toccano a vicenda, il giro senza deriva, il campo vuoto che
resta vuoto. Mutazione: rimesso l’ordine sbagliato, due prove si accendono.

### ✅ Fatto il 17/08: «Prezzi di vendita» e «Listini» sono due sezioni

> **Un listino non è un altro prezzo: è una regola commerciale alternativa** — Ingrosso,
> Rivenditori — che assegna un prezzo diverso allo stesso articolo.

```text
Prezzi di vendita    Prezzo di vendita · Prezzo barrato · Prezzo Shopify (se attivo)
Listini              Listino 1 · 2 · 3        (nomi dati in Impostazioni)
(fuori)              Costo di riferimento (netto)
```

**Un solo selettore netto/ivato** per tutta l’area prezzi: sta nella testata della prima
sezione e governa tutti e sei i campi. Il costo è fuori, e adesso **lo dice l’etichetta** —
il tooltip diceva già «sempre al netto d’IVA», ma restava nascosto.

**Il barrato è salito** dalla coda della scheda, dove stava accanto al costo: è una componente
della politica di vendita, non un dato amministrativo. Era la parte di impaginato del lavoro,
non di parole.

⚠️ **E le due schermate adesso dicono la stessa cosa:** in Impostazioni i tre si chiamano
«Listini aggiuntivi», qui «Listini» ne indica esattamente tre. Prima ne indicava cinque.

Tre prove tengono la struttura: le due testate esistono, il barrato e il prezzo Shopify stanno
con il prezzo di vendita, e il costo dichiara la sua base.

### ✅ Fatto il 17/08: frecce e rotella dei campi numerici

**Frecce tolte solo dai campi di DENARO**, con una regola globale e **zero template toccati**.
La discriminante non è una classe da ricordare: è `inputmode`, che il codice già dichiara per
la tastiera del telefono.

```text
inputmode="decimal"    8 campi  →  tutti e soli i prezzi   ← la regola prende questi
inputmode="numeric"   12 campi  →  conteggi, frecce restano
inputmode assente     12 campi  →  conteggi, frecce restano
```

**Rotella spenta ovunque**, e il CSS non poteva farlo: `appearance: textfield` toglie le frecce,
la rotella resta. Un ascoltatore solo in cattura sul documento
(`core/services/number-input-wheel-guard.ts`), non una direttiva — una direttiva su
`input[type=number]` andrebbe importata in venti componenti standalone, e nel ventunesimo
dimenticata. Toglie il **fuoco** invece di annullare l’evento: `preventDefault` fermerebbe anche
lo scorrimento della pagina.

⬜ **Resta una sola cosa, piccola:** le **cinque** card di riga nascondono le frecce per conto
proprio, 6 righe SCSS ciascuna. Deciso il 17/08 che la regola giusta **non** è «nelle card
mobili si nascondono» ma:

> **Quando la quantità ha uno stepper esplicito − / valore / +, le frecce native si nascondono.**

⚠️ E non vanno consacrate «approvate mobile» le altre quattro maschere: **solo l’Ordine cliente**
è stato progettato e validato per mobile. L’estrazione deve centralizzare **soltanto** le regole
degli spinner, senza toccare bordi, radius o larghezze delle cinque card.

_In futuro − / input / + dovrebbe diventare un piccolo componente condiviso: quello sì è un
elemento ricorrente e funzionale._

## Prima sincronizzazione Shopify — deciso il 17/08/2026, da progettare

### 1 · `catalogOrigin` diventa provenienza, non permesso

> **Dopo che import e sincronizzazione sono completati, un articolo è di VestiFlow _e_ di
> Shopify: si distingue per come funziona e da dove nasce, ma si gestisce come tutti gli altri.**

Oggi non è così: `catalogOrigin = shopify` mette l’articolo in sola lettura. Misurato il
17/08: **87 articoli su 250, il 35% del catalogo.**

Il blocco vive in **17 punti**:

```text
API        catalog-origin.util · products.service · product-media.service
           shopify-product-push.service
FRONTEND   product-form + i tre step (general/options/variants) + detail
           i model, i mapper, catalog-origin.util
```

⚠️ **Il push NON è il problema, ed è bene saperlo prima di progettare.** Misurato: la guardia
del push (`evaluatePushGuard`) controlla connessione, scope `write_products`, prodotto non
archiviato e spunta `shopifySyncEnabled` — **non guarda `catalogOrigin`**, e il commento nel
codice lo dice: _«Gate per-prodotto: in AND col gating per origine»_. Se una modifica riesce a
salvarsi, viene spinta. Quindi togliere il blocco **non** lascerebbe le modifiche a metà strada.

Quello che serve progettare è l’altra metà: **cosa succede quando i due lati cambiano lo stesso
campo**. «Ultimo che scrive vince» è la direzione decisa, ma va reso vero — e riguarda i campi
che il canale possiede davvero (nome, descrizione, categoria, tassonomia, identità delle
varianti), non i prezzi.

✅ **Il prezzo di vendita è già uscito da qui il 17/08**, perché non è un campo del canale: a
Shopify va `shopifyPrice`, un’altra colonna. Sbloccarlo non anticipava nessuna decisione.

### 2 · Prezzo interno a zero all’import — idea da valutare

Il problema è già misurato e sta nella `PREZZI-SHOPIFY-SPEC`:

> `shopifyDecimalToMinor` restituisce **0** su valore malformato o assente, e il chiamante passa
> `variant.price ?? '0'`. Un prezzo mancante su Shopify diventa un prezzo di vendita **zero** in
> VestiFlow, senza errore.

E resta zero **per sempre**, perché il meccanismo è asimmetrico per costruzione:

| Momento                    | `sellingPrice`                        | `shopifyPrice` |
| -------------------------- | ------------------------------------- | -------------- |
| **nascita** (primo import) | scritto                               | scritto        |
| **ri-sync**                | ⛔ **mai toccato** — è dell’operatore | aggiornato     |

Quindi: articolo importato quando Shopify non aveva prezzo → interno a 0. Shopify poi il prezzo
ce l’ha → il ri-sync aggiorna solo il suo → **l’interno resta 0 e nessuno lo rialza**.

**L’idea:** quando il prezzo interno manca o è zero, si compila con il prezzo Shopify.

**Da determinare:**

- vale **solo alla prima volta**, o ogni volta che l’interno è zero? La seconda forma è più
  utile ma è una scrittura automatica su un campo dichiarato dell’operatore: va detto
  esplicitamente che «zero» conta come «non ancora deciso» e non come «deciso zero»;
- e il caso opposto — l’operatore che **vuole** un articolo a zero — come si distingue?

**Più un comando esplicito**, che è la parte senza ambiguità: nell’elenco prodotti, dopo aver
filtrato e selezionato, un pulsante **«Copia il prezzo Shopify nel prezzo interno»**. Copre lo
storico già andato storto, e non indovina niente: lo decide l’operatore su ciò che ha scelto.

⚠️ La forma automatica e il pulsante **non sono alternative**: il pulsante serve comunque per
gli articoli già a zero oggi, qualunque cosa si decida per l’import futuro.

### 3 · «Listini» in anagrafica: il nome vale per un sottoinsieme

La sezione prezzi dell’anagrafica si intitola **«Listini»** e contiene cinque campi:

| Campo               | È un listino?                  |
| ------------------- | ------------------------------ |
| **Prezzo articolo** | ⛔ no — è _il_ prezzo          |
| **Prezzo Shopify**  | ⛔ no — è il prezzo del canale |
| Listino 1 · 2 · 3   | ✅ sì                          |

**Il criterio per escludere lo dà già il codice**, in un commento di quella stessa sezione:
_«Barrato e costo di riferimento restano fuori: non sono listini»_. Applicato agli altri due,
esclude anche loro.

⚠️ **E le due schermate già non si capiscono fra loro:** in Impostazioni i tre si chiamano
**«Listini aggiuntivi»**; in anagrafica «Listini» ne indica cinque. La stessa parola vale per
due insiemi diversi a due schermate di distanza — che è il difetto vero, non la preferenza di
gusto.

**Proposta:** la sezione si intitola **«Prezzi»**, e i tre restano raggruppati dentro come
**«Listini aggiuntivi»** — lo stesso nome che hanno già in Impostazioni. Le due schermate
tornano a dire la stessa cosa con la stessa parola.

_Costo:_ due etichette e i test che le nominano. Nessuna colonna, nessuna migration.

---

## Difetti aperti, misurati e non ancora corretti

| Rif.       | Difetto                                                                                                  | Stato                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `01` §3.9  | Le righe importate ignoravano lo sconto: 120,00 di righe su un ordine da 104,00                          | ✅ **chiuso e provato** su `#1010`/`#1011` (15/08)                             |
| `01` §3.13 | Il Codice IVA della vendita online lo sceglieva l'imposta incassata, mai lo zero                         | ✅ **chiuso** — non ancora eseguito in produzione (scatta all'evasione)        |
| `01` §3.14 | La sync sedi partiva da sola, da tre punti, e creava/rinominava/cancellava                               | ✅ **inneschi spenti** — il servizio (nome, creazione automatica) resta aperto |
| `01` §3.15 | Le righe di canale scrivono importi IVATI in colonne lette come NETTE                                    | aperto — scelta di modello, non ancora presa                                   |
| sotto      | Ordine cliente: sconto a importo, sconto extra a importo, spedizione sui manuali                         | aperto — disegno deciso, non implementato                                      |
| `01` §3.12 | **Le righe della Vendita online** portano ancora l'aliquota media inventata                              | l'import è corretto, lo **snapshot** no                                        |
| `01` §3.11 | Vendita con una riga non scaricata dichiara «scarico completo»                                           | aperto                                                                         |
| `01` §3.8  | L'**impegno** usa ancora il ripiego alfabetico sulla sede                                                | chiuso solo lo scarico, e mai eseguito                                         |
| `01` §2.1  | `orders/cancelled` non registrato sul negozio                                                            | da fare **dall'ambiente pubblicato**                                           |
| `01` §2.14 | Il reso dichiarato e non ancora elaborato non esiste per VestiFlow                                       | aperto, da decidere se coprirlo                                                |
| `GM` §20   | **Il legame fra documenti non verifica il tenant** — misurato; sfruttabilità dedotta                     | aperto — **si chiude da solo**, non aspetta Includi/Genera                     |
| `CASSA`    | **Il ramo Cassa aggancia `documents` con `ON DELETE CASCADE`** — pagamenti, ricevute fiscali, sessione   | da censire **dopo** C 0 — ⛔ non limita la Vendita al banco (`11` C)           |
| sotto      | **La coda decimale del prezzo si perde riaprendo e risalvando un documento** — misurata il 21/08         | aperto — gap **trasversale**, si chiude nella **convergenza documentale**      |
| sotto      | **Le maschere mostrano l'IVA dal Codice VIVO, il server la conserva dallo snapshot** — misurata il 21/08 | aperto — gap **trasversale**, reso VISIBILE da T3                              |
| sotto      | **«Nessun contatore» e «contatore Senza serie» sono indistinguibili sul documento** — misurata il 21/08  | annotato — da decidere, non un difetto operativo oggi                          |
| sotto      | **L'orchestrazione della numerazione è ripetuta in 7 servizi** — misurata il 21/08                       | **rifattore trasversale futuro** — ⛔ non si estrae per un servizio solo       |

### L'orchestrazione della numerazione è ripetuta in sette servizi — 21/08/2026

⭐ **Il motore è già condiviso**: `serieCanonica`, `defaultCounterSeries`, `lockDocumentCounter`,
`resolveDocumentNumber`, `buildDocumentNumberConflict`, `isDocumentNumberConflict` vivono tutte in
`api/src/documents/document-numbering.util.ts`. Non è quello il problema.

⛔ **È la SEQUENZA con cui si chiamano a essere ripetuta**, in sette servizi: documenti generici,
Arrivo merce (due volte), Trasferimento/Rettifica, Corrispettivo manuale, Ordine cliente manuale,
Ordine fornitore, Vendita/Reso al banco (due volte). `defaultCounterSeries` da sola compare 13
volte.

**È esattamente la forma che il progetto ha già consolidato sul CLIENT.** Il docblock di
`DocumentNumberingStore` lo dice: _«il blocco viveva in cinque maschere in copie quasi identiche…
copie di quel tipo non divergono con un errore, divergono con una sfumatura»_.

⚠️ **E la divergenza-per-sfumatura è già documentata sul server**: la correzione della serie nel
conflitto è arrivata il 13/08 sull'Arrivo merce mentre «gli altri tre servizi gemelli risolvevano
già». Una copia era rimasta indietro senza che nessun test la trovasse.

⚠️ **Un secondo sintomo, misurato il 21/08**: `serieCanonica` esiste dal giorno in cui il
controllo cronologico è nato cieco, e il suo docblock conta **dodici punti** che l'avevano
riscritta a mano. Al 21/08 nessun percorso di salvataggio la usava — solo
`document-chronology.util.ts`. La Vendita al banco è il primo servizio di scrittura ad averla
adottata (T8A).

> ⛔ **Non si estrae per un servizio solo.** Farlo per il banco creerebbe l'ottava variante invece
> di toglierne sette. Quando si farà, si fa per tutti — ed è un lavoro con perimetro proprio, da
> misurare prima (quali rami divergono davvero, e quali divergenze sono volute).

**Grado di certezza: letto** (conteggio con grep sui sette file, righe citate nei commit T7A/T7B/T8A).

### «Nessun contatore» e «Senza serie» danno lo stesso documento — annotato il 21/08/2026

Emerso censendo la numerazione del banco (T7/T8), e **non è un difetto operativo**: la creazione
funziona in entrambi i casi. È un'ambiguità concettuale che vale la pena decidere prima che
qualcuno ci costruisca sopra.

`seedDefaults` — che semina il contatore «Senza serie», quello che ogni tipo dovrebbe avere per
nascita — è chiamato **solo** da `list()` e `available()` di
`api/src/documents/document-counters.service.ts`, cioè dalla schermata Numeratori e dalla tendina
di testata. Un tenant che non ha mai aperto né l'una né l'altra **non ha materialmente il
contatore**.

```text
nessun contatore configurato   → defaultCounterSeries ritorna null → documento con series = null
contatore «Senza serie» reale  → defaultCounterSeries ritorna null → documento con series = null
```

⚠️ **Le due situazioni producono lo stesso documento e lo stesso riferimento**, quindi guardando
un documento non si può sapere in quale delle due si era. Finché nessuno ha bisogno di
distinguerle non fa danno; comincia a farne il giorno in cui una schermata dicesse «questo
documento usa il contatore X» e non ci fosse una X da nominare.

⛔ **Non toccato in T7A/T7B**, ed è fuori dal loro perimetro: quei due commit passano al motore
comune il contesto che gli mancava, non cambiano chi semina i contatori.

**Grado di certezza: letto** (i due soli chiamanti di `seedDefaults` verificati con grep); che
esistano tenant reali in quello stato è **non provato**.

### L'IVA a schermo non è quella del documento — gap trasversale, registrato il 21/08/2026

⚠️ **Emerso da una revisione avversariale del lavoro T3** (snapshot IVA della Vendita al banco),
che ha confermato il rilievo come **preesistente e trasversale**, non introdotto da T3.

Il server, per una riga già esistente, **conserva** `vatCodeId` e `vatSnapshot` persistiti. Le
maschere invece calcolano l'IVA da mostrare risolvendo il Codice IVA nel **registro vivo**, e
usano l'aliquota dello snapshot solo come ripiego quando il codice non si trova:

```text
store-sale-register.component.ts:1081   const vatCode = line.vatCodeId ? this.vatCodeById().get(...) : undefined;
                                        return vatCode ? vatInputFromVatCode(vatCode)      ← aliquota VIVA
                                                       : vatInputFromLegacyRate(line.vatRatePercent);
```

Stesso schema in `sales-document-form`, `customer-order-form` e `goods-receipt-form`.

⭐ **E la funzione giusta esiste già**: `vatInputFromSnapshot` in
`src/app/domain/documents/utils/document-vat.util.ts:118` è **esportata e non la usa nessuno** —
verificato con un grep su `src/` e `api/src/`. Non manca lo strumento: manca il consumo.

**La conseguenza si vede solo se qualcuno cambia un'aliquota.** Riaprendo un documento più
vecchio del cambio, lo schermo mostra i totali all'aliquota di oggi mentre il documento vale
quelli di allora.

> ⛔ **T3 non ha creato questo difetto: lo ha reso visibile sulla Vendita al banco.** Prima, su
> quel percorso, schermo e documento coincidevano — ma coincidevano sul valore **sbagliato**,
> perché il client ri-prezzava il documento storico e il server obbediva. T3 ha corretto il dato
> persistito; la vista è rimasta dov'era.

⛔ **Non si corregge maschera per maschera.** Le quattro hanno già adottato il contratto binario
lato salvataggio: il rimedio è far consumare `vatInputFromSnapshot` sulle righe caricate, una
volta per tutte, nella **convergenza documentale**.

⚠️ **Nota adiacente, stesso ambito**: `preservedLineVat` ricostruisce il dato di calcolo con
`vatInputFromLegacyRate(vatSnapshotRatePercent(...))`, cioè dalla **sola aliquota** dello
snapshot — natura, `nonDeductiblePercent` e `calculationMode` non rientrano nel ricalcolo, pur
restando salvati nella colonna. Irrilevante in modalità standard con indetraibile a zero; da
verificare prima di usare modalità diverse.

**Grado di certezza: letto** (righe citate sopra, verificate direttamente); che un cliente reale
abbia mai cambiato un'aliquota è **non provato**.

#### La voce «Predefinito» della cassa, e perché NON si corregge — deciso il 21/08/2026

Censito lo stesso giorno: `vatCodeIdForLinePayload` ritorna `string | undefined` e **non può
esprimere `null`**, quindi la scelta esplicita «torna al predefinito dell'articolo» non è
trasmissibile. Il server invece la capirebbe già: `null !== undefined` fa saltare la
conservazione in `preservedLineVat`, e `resolveLineVatCode(null, …)` risolve da
articolo/predefinito aziendale. **Manca solo la firma della primitiva.**

La voce vuota esiste in **una sola** maschera — la Vendita al banco, che usa `app-select-menu`
(`includeEmptyOption` vale `true` di default e nessuno le ha passato `false`). Fatture, Ordine
cliente e Arrivo merce usano `app-document-line-select-cell`, che dichiara
`valueChange = output<string>()` e sull'insieme chiuso dell'IVA fa `commit(this.value())`: non
può emettere vuoto. Lì il problema non esiste.

> ⛔ **Decisione del proprietario: NON si corregge la vecchia maschera pos.** È legacy e verrà
> sostituita; spegnere l'interruttore lì sarebbe lavoro su codice destinato a sparire.
>
> ⭐ **Il vincolo si sposta sulla maschera NUOVA di Vendita/Reso**: dovrà usare la **cella IVA
> documentale comune** già adottata dagli altri documenti (`app-document-line-select-cell` o la
> sua evoluzione condivisa), **senza varianti locali**. Con quella cella la voce vuota non
> esiste, e il problema non si ripresenta.
>
> ⚠️ Se un giorno «Ripristina il predefinito dall'articolo» dovrà essere una funzione vera delle
> righe documento, si progetta **trasversalmente** nella convergenza documentale — semantica
> **tri-state** (`undefined` / `string` / `null`) e test comuni — non riaccendendo un
> interruttore su una maschera sola.

### La coda decimale del prezzo — gap trasversale, registrato il 21/08/2026

⚠️ **Trovato mentre si decideva tutt'altro** (il contratto del prezzo del Reso al banco, `11` T4)
e messo da parte apposta: non si corregge dentro un lavoro che ha un altro perimetro.

`regole-gestionale` dice che un prezzo unitario è `NUMERIC(16,6)` e che **la coda è ciò che fa
tornare identico un prezzo digitato ivato**. Il round-trip però non la conserva fino in fondo:

```text
database → JSON            intatta   Prisma serializza il Decimal come STRINGA, nessun mapper
JSON → modello Angular     intatta   document-api.mapper.ts:212 — Number(), nessun arrotondamento
modello → campo di input   ⛔ PERSA  sales-document-form.component.ts:2357 → money.util.ts:161 (Math.round)
campo → server             intero    sales-document-form.component.ts:2221 ri-analizza la stringa a 2 decimali
```

**Il difetto morde in modalità prezzi NETTI**, dove il valore re-inviato viene salvato così com'è:
un `2049,180300` in database, riaperto e risalvato, torna `2049`. In modalità ivata il valore non
è conservato ma **ricalcolato** dallo scorporo, quindi coincide solo finché la coda nasceva da
quello stesso scorporo a quella stessa aliquota.

⭐ **Non è un difetto di tutte le maschere, ed è questa la parte utile.** Chi tiene il netto
canonico in un dato separato dalla rappresentazione a due decimali non lo ha:

| Maschera                                 | Coda                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `sales-document-form` (famiglia Fattura) | ⛔ persa — la stringa a 2 decimali è l'unica sorgente al salvataggio |
| `supplier-order-form`                    | ✅ salva — control canonico `unitCostNetMinor` separato (`:819-823`) |
| `store-sale-register` (banco)            | ✅ salva — il netto sta nel signal, il campo lo MOSTRA e basta       |

`supplier-order-form.component.ts:792-796` porta già il commento che spiega perché si è sottratta
allo schema: _«quello converte il valore MOSTRATO, già arrotondato a due decimali, e su un costo
digitato ivato perde il centesimo nel 18% dei casi al 22%»_.

> ⛔ **Decisione del proprietario, 21/08/2026: la famiglia Fattura NON è un'eccezione
> strutturale.** Quando verrà affrontata dovrà convergere sulla stessa struttura e sugli stessi
> contratti comuni degli altri documenti. La correzione appartiene quindi alla **convergenza
> documentale**, non a un intervento locale sulla maschera.

**Grado di certezza: letto** (percorso seguito riga per riga, file e numeri sopra); che il valore
in database venga effettivamente sovrascritto è **dedotto**, non ancora provato leggendo la
colonna prima e dopo. Una prova va fatta prima di dichiararlo chiuso.

### Il prezzo articolo digitato in riga non aggiorna l'anagrafica — 22/08/2026

⛔ **Difformità da chiudere nel blocco Arrivo merce, DOPO l'unificazione delle
componenti/celle di riga.** Non si corregge prima: la cella comune si scrive **una volta
sola**, e la policy specifica del documento gliela passa il documento.

**Il requisito era già deciso** nel lavoro sulle righe documento: nell'Arrivo merce il
prezzo articolo di riga è il **prezzo di catalogo della variante**, e la spunta **«Aggiorna
prezzi articolo»** — accesa di default — governa l'aggiornamento dell'anagrafica. A spunta
spenta i campi relativi devono essere **in sola lettura**.

#### ⛔ La strada dello snapshot su `DocumentLine` è stata VALUTATA E SCARTATA — 22/08/2026

Verificando perché il campo torna `0,00` alla riapertura si era misurato che `DocumentLine`
non ha alcuna colonna per il prezzo: dei 39 campi, **cinque fotografano il costo**
(`enteredUnitCost`, `unitCostNet`, `unitCostGross`, `unitVatAmount`,
`costEntryModeSnapshot`), del prezzo **nessuno**. Da lì la proposta di aggiungerne tre.

**Il proprietario ha fermato quel filone**, e la ragione toglie il dubbio invece di
rimandarlo: quel valore **non è una fotografia dell'operazione**, è il prezzo di catalogo
che la spunta propaga all'anagrafica. Lo `0,00` alla riapertura non è la prova che serva uno
snapshot — è la stessa difformità vista da un'altra angolazione.

⛔ **Nessuna colonna, nessuna migration prezzi**, finché il blocco non si apre.

#### Il comportamento attuale, misurato

Sul documento `fd04d542-e8aa-4889-84f9-3c4f859ec076` del tenant Test SG Luigi:

|                                                            |                                             |
| ---------------------------------------------------------- | ------------------------------------------- |
| il campo si popola all'inserimento riga                    | ✅ `setSalesPrice(line, 'sellingPrice', …)` |
| il valore entra nel payload                                | ✅ `sellingPriceMinor`                      |
| il salvataggio aggiorna `ProductVariant.sellingPriceMinor` | ⛔ **no**                                   |
| alla riapertura il campo mostra                            | ⛔ `0,00`                                   |
| a spunta spenta i campi sono in sola lettura               | ⛔ **no**                                   |

⚠️ **Non c'è rischio di azzeramento silenzioso**, ed è la ragione per cui la difformità può
aspettare il suo blocco: il payload usa `?? undefined` — **assenza**, non zero — e l'intero
gruppo è subordinato a `updateArticlePrices()`. Un campo lasciato vuoto non scrive `0` in
anagrafica.

**Riguarda i tre valori articolo** che la riga ospita: prezzo al pubblico, prezzo barrato e
prezzo Shopify — quest'ultimo solo dove il tenant ha davvero il canale.

### `vatRatePercent` arrotondato a intero — rischio per aliquote frazionarie, censito il 22/08/2026

⛔ **Censito, NON corretto.** Emerso dal censimento della precisione costi e lasciato fuori
dal blocco corrente per decisione del proprietario: è un'**aliquota**, non un costo, quindi
non appartiene alla famiglia delle colonne portate a `NUMERIC(16,6)`.

```text
api/src/documents/goods-receipt-vat.util.ts:145   vatRatePercent: Math.round(Number(vatCode.ratePercent))
api/src/store-sales/store-sales.service.ts:1400   vatRatePercent: Math.round(Number(vatCode.ratePercent))
```

**Il rischio, in una riga**: un'aliquota con decimali — 2,5% — viaggia come **3**.

⭐ **Oggi non morde, e la ragione va scritta perché è ciò che rende il rinvio legittimo:**

| Fatto                                                               | Conseguenza                                     |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| `vatRatePercent` **non è una colonna** (assente da `schema.prisma`) | è un campo di trasporto, non un dato persistito |
| accanto viaggia `vat`, che porta l'aliquota **esatta**              | il calcolo vero non passa da qui                |
| le aliquote italiane in uso sono intere (22 · 10 · 5 · 4)           | il troncamento non ha ancora nulla da troncare  |

⚠️ **Il giorno in cui morde è dichiarato**: un tenant con un'aliquota frazionaria — una
percentuale di compensazione agricola, o un'aliquota estera — e la riga di calcolo che
ricadesse sul campo legacy invece che su `vat`. Non è una possibilità remota per un prodotto
che [`vestiflow-non-solo-abbigliamento`] dichiara non legato a una merceologia sola.

**Quando si chiude**: insieme al gap trasversale «L'IVA a schermo non è quella del
documento», che tocca gli stessi due percorsi. Correggerlo da solo qui sarebbe un tocco
isolato in una famiglia che va guardata intera.

### ✅ Il costo vuoto vale ZERO — deciso e implementato il 22/08/2026

⛔ **Qui c'era un difetto che NON era un difetto.** Si intitolava «il costo di riga lasciato
vuoto azzera il costo in anagrafica» e prescriveva di far viaggiare l'assenza fino in fondo —
`number | null` da `lineCostEnteredMinor`, campo omesso dal payload. ⚠️ **È la correzione da
non fare mai**, ed è la ragione per cui questa voce resta invece di essere cancellata.

**Due errori, uno di misura e uno di modello.**

Di misura: la prova che lo aveva «trovato» svuotava il campo con un `fill('')` da script. Nel
flusso reale non succede — richiamando un articolo la cella **si precompila dall'anagrafica**
(`goods-receipt-form.component.ts` ~3327).

Di modello: il proprietario ha deciso il 22/08 che per il dominio costo «non valorizzato» e
«zero» sono **lo stesso caso**.

> **Un costo canonico non è mai NULL. Se non è valorizzato, vale zero.**
>
> ```text
> articolo nuovo         →  nasce a 0, e la cella mostra 0,00
> costo digitato 0,00    →  0
> costo valorizzato      →  il valore, modificabile
> ```

Cinque colonne sono `NOT NULL DEFAULT 0` dalla migration
`20260823010000_costi_canonici_not_null`.

⚠️ **`null` resta legittimo in UN solo posto: i DTO di risposta**, dove significa «costo non
visibile con i tuoi permessi» — non «costo assente». Non nasce da una colonna, lo mette il
servizio, e chi lo togliesse «per coerenza» mostrerebbe **0,00** a chi non ha il permesso di
vedere i costi: un'informazione falsa al posto di una negata.

#### Cosa è sparito con la vecchia semantica

Il «costo sconosciuto» non era solo una colonna nullable: era una **metrica esposta**.

| Sparito                                            | Dove                                                       |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `costKnownRevenueMinor` — ricavo a costo noto      | `movement-sales.util`                                      |
| `costCoveragePercent` — copertura del costo        | DTO analytics, modello frontend                            |
| `missingCost` — valorizzazione a costo incompleta  | `business-analytics.service`                               |
| «Compila i costi d'acquisto per calcolare…»        | `marginHint`, sotto il margine in dashboard                |
| «Margine stimato su X% del fatturato (costo noto)» | idem                                                       |
| il fallback del reso sul costo NULL                | `movement-cost.util` — resta solo se la vendita NON esiste |

⭐ **`marginHint` distingue ora ciò che prima confondeva**: a chi non ha il permesso diceva
«Compila i costi d'acquisto in catalogo» — un invito a compilare qualcosa che quella persona
non può nemmeno vedere. Ora dice «Margine non visibile con i tuoi permessi».

#### I controlli TRUTHY, che sono l'ultima forma dello stesso errore

Un `if (costo)` o un `costo > 0` tratta lo **zero come un'assenza**. Finché il costo poteva
essere NULL i due casi coincidevano; ora no, e con il backfill lo zero è il valore più comune.

**Corretti il 23/08:**

```text
goods-receipt-form ~3330/3334   articolo richiamato → la cella mostra 0,00, non resta vuota
goods-receipt-form ~4804        `|| undefined` → `?? undefined` (il commento sopra lo diceva già)
supplier-order-form ~1760       `netMinor > 0 ? … : null` → il costo si scrive, zero compreso
```

⭐ **Tre `> 0` restano, e sono corretti**: `document-line-code-cell`,
`document-line-product-cell` e `variant-select-menu.util` omettono il costo dal **testo di un
suggerimento** a discesa. Lì non è un dato che si compila: è una riga compatta, e «Costo 0,00»
su ogni articolo sarebbe rumore. La distinzione da tenere è fra **un campo** — che il valore
lo dichiara sempre — e **un'etichetta**, che può tacere ciò che non aggiunge nulla.

#### Una cosa che il vincolo avrebbe rotto in silenzio

⚠️ **Il ripristino da backup.** Ogni pacchetto prodotto prima della migration porta `null` nei
costi, e `createMany` lo avrebbe rifiutato con violazione di vincolo — togliendo al cliente
l'unica strada per rimettere in piedi i propri dati. `normalizzaCostiCanonici` converte quei
`null` in `0` all'ingresso, e un test con un backup legacy lo tiene fermo.

### `GM` §20 — il difetto di sicurezza trovato il 18/08/2026

> **Fonte canonica: `docs/GUARDIE-MANCANTI.md` voce 20.** Lì stanno la misura per esteso, i tre
> gradi di certezza e i passi della prova cross-tenant. Qui c'è solo il rimando, perché questa è
> la lista che si legge per prima.

In una riga: `sourceDocumentId` è accettato **senza verifica di esistenza, tenant e compatibilità
origine→destinazione**, e in lettura le due relazioni non sono filtrate per tenant. ⚠️ **La
sfruttabilità è dedotta, non provata**: non va chiamata una fuga di dati finché la prova dinamica
non la conferma.

⛔ **Non si corregge dentro il lavoro su Includi/Genera**: si chiude autonomamente.

---

## Novità della notte del 15/08 — da leggere prima di riprendere

**Fatto, provato, committato** — 5 commit sul ramo, tutti verdi (961+418 frontend, 1527 API):

1. Sconto di riga Shopify — si legge da `discount_allocations`, mai si ricalcola. Provato su due ordini costruiti apposta, uno con sconto a importo.
2. Codice IVA della vendita online — si aggancia solo se univoco; mai a zero, mai con più codici alla stessa aliquota.
3. Maschera Ordine cliente — su un ordine di canale il riepilogo si legge dalla testata (spedizione, sconto, imponibile per differenza), non si ricalcola col motore manuale.
4. Sedi — i tre inneschi automatici sono spenti. Il pulsante manuale resta.

**Deciso ma non implementato — è il prossimo lavoro sull'Ordine cliente.** Una banda unica in entrambi i documenti (manuale e Shopify), con questi campi editabili in tutti e due:

```
Totale prodotti
Sconto ordine        ← dal canale, sola presa d'atto · 0,00 sui manuali
Sconto extra   [ 0% ]
Sconto importo [ 0,00 ]   ← NUOVO, colonna additiva su sales_orders
Spedizione            ← NUOVO su tutti e due i documenti
Imponibile
IVA
Totale documento
```

Decisioni prese, da non riaprire:

- l'importo del canale (`discountMinor`, esiste già) resta **distinto** dal nuovo campo che scrive l'operatore — altrimenti il sync lo cancellerebbe al prossimo giro;
- ordine di applicazione: **prima la percentuale, poi l'importo**;
- l'IVA dell'importo si ripartisce sulle righe in proporzione, come già fa la percentuale — **tranne** sulle righe Shopify, dove l'allocazione del canale non si ricalcola mai;
- **su un ordine Shopify il campo sconto importo diventa editabile**: resta pieno col valore del canale finché l'operatore non lo tocca. Da decidere il comportamento al prossimo sync — oggi la maschera di un ordine di canale è di sola lettura su tutto il resto, e questo campo ne uscirebbe da solo;
- migration: colonna additiva `document_discount_minor` su `sales_orders`, scritta a mano, `prisma:deploy`.

**Non deciso, resta il §3.15.** Se scorporare i prezzi Shopify a netto all'import (come fa già il catalogo) o dichiarare che le colonne dell'ordine di canale sono lorde. `PREZZI-SHOPIFY-SPEC.md` §1-bis e §4.1 la analizzano dal 7 agosto; i rimborsi la applicano già (leggono `taxes_included`), l'import degli ordini no — stessa cartella, stesso payload, due dottrine.

**La fase iniziale di collegamento Shopify** _(deciso il 15/08, sospesa)_. Le sedi si agganciano **a mano** — non più solo per nome — quando esistono già da entrambe le parti; ogni sede completa i propri dati (indirizzo, impostazioni); e questo passo sta insieme all'assegnazione del Codice IVA ai prodotti importati (`02` §4.1-4.3). Non è più «poi un avviso»: è il lavoro descritto lì, ed è il più grande dei tre rimasti.

**Topologia del ramo, verificata il 15/08.** `numerazione-documento-2` contiene **tutto `develop`** più 33 commit — non diverge, è un fast-forward pulito (6 migration, tutte aggiunte pure). È `main` a essere 205 commit indietro rispetto a `develop`, ed è `main` che gira in produzione su Railway sullo stesso database condiviso. Il merge previsto è su `develop`: il rischio di migration incrociate descritto per `main` non si applica a questo passaggio.

Sul §3.12: la **correzione all'import è provata sui dati veri** (righe d'ordine riscritte con 2,31 al 4% e 4,51 al 22%). Restano sbagliati gli **snapshot** già scritti — `VO-2026-0004`, `VO-2026-0005`, `COR-2026-0005/0006` — e **non si toccano**: sono istantanee, e sono l'unica testimonianza rimasta del difetto.

---

## Decisioni prese che NON si riaprono

- Il registro corrispettivi è **derivato dalle vendite**; `corrispettivo_entries` cade _(11/08, riconfermata 14/08)_.
- **Il passato non si riscrive, si rettifica**: la vendita resta alla sua data, il reso arriva alla propria _(base normativa riferita: Ris. 274/E/2009)_.
- **Gli annullamenti non si filtrano**: un annullamento pre-evasione non ha data di evasione e resta fuori da sé. Filtrarli farebbe sparire retroattivamente una vendita già avvenuta.
- **I rimborsi da annullamento si conservano e si classificano**, non si scartano in scrittura: è il registro a decidere se un fatto ha effetto, non la traduzione a decidere se esiste.
- **Canale predefinito «Tutti»**: un totale gonfiato si nota, uno a cui manca una parte no.
- **Il filtro Tipo agisce sull'elenco, non sul riepilogo**: guardando «Solo resi» il totale deve continuare a dire il corrispettivo del periodo.
- `exclusionReason` **si deriva dal legame** con la fattura; `fiscalDate` modificabile **cade**.

## Limite noto, dichiarato e non aggirato

Il registro usa la **data di evasione**, che è la regola ordinaria per le cessioni di beni mobili. Non è la regola completa: l'art. 6 anticipa il momento di effettuazione se il corrispettivo è pagato prima della consegna — cosa che su un ordine incassato con carta accade quasi sempre.

**VestiFlow non può derivarlo oggi**: _misurato_, nessuna data di incasso è persistita, le transazioni del canale non si importano. Manca il dato, non la logica. La formulazione da usare è «per il flusso supportato oggi il registro usa la data di evasione», **non** «la data di evasione è la data fiscale».

---

## Come si verifica una modifica su questo ramo

1. **Il percorso del pulsante è locale**: «Sincronizza vendite» esegue il codice del ramo, e una correzione all'import si può provare così.
2. **Il percorso dell'evento no**: evasione, rimborso e reso li elabora la produzione. Provarli richiede i webhook puntati a un tunnel.
3. **Il caso di prova deve essere quello scomodo.** Il difetto dell'IVA è vissuto per mesi perché con **una sola aliquota** la ripartizione proporzionale coincide col vero: qualunque verifica sarebbe passata. È emerso con un ordine costruito con 4% e 22% insieme.
4. **Si fotografa il database prima e dopo**, e si aspetta che il pulsante torni premibile: misurare a passata in corso è già capitato due volte.

---

## Corrispettivo manuale — due difetti trovati usandolo (17/08/2026)

Trovati dal proprietario del progetto sulla maschera appena consegnata, **non da un
test**: è il tipo di difetto che nessuna prova verde intercetta.

> ### ✅ Stato al 18/08/2026: 1, 2 e 3 sono chiusi. Resta aperto solo il 4.
>
> Verificato nel codice, non dedotto da questo file — che era rimasto indietro e li
> dava tutti e tre per aperti. **È il difetto di questo documento, non del codice**, ed
> è esattamente il modo in cui si fa ricominciare qualcuno da un lavoro già fatto.
>
> | #   | Dove si vede che è chiuso                                                                                                             |
> | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
> | 1   | `manual-receipt-form.component.html`: un `app-inline-banner` legato al rifiuto, col commento «Il rifiuto del salvataggio si VEDE»     |
> | 2   | `_document-form.scss` → `td.doc-form__col--tax .doc-select-cell`: fondo `--color-input-bg` e bordo dentro la cella del gruppo calcoli |
> | 3   | `api/src/corrispettivi/corrispettivi.service.spec.ts` → «un pageSize piccolo non taglia più niente»                                   |
>
> E la **guardia** che il §1 chiedeva è stata capita alla radice invece che rattoppata:
> `check-form-errors.mjs` porta ora due commenti che citano proprio questa maschera —
> «aveva un banner che parlava d'altro».
>
> Il testo originale resta qui sotto: dice **come** i tre difetti erano stati misurati,
> e quel metodo serve ancora.

### 1. ✅ CHIUSO — Il salvataggio rifiutato era MUTO

```ts
178:  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
```

`_submitState` è **privato e non arriva al template**. `save()` calcola diligentemente i
suoi messaggi — «Aggiungi almeno una riga con descrizione e importo», «Riga N: scegli il
Codice IVA della riga» — li scrive lì dentro, e **nessuno li legge**: l'unico
`app-inline-banner` della maschera è agganciato a `loadError()`, cioè agli errori di
_caricamento_.

Quindi **ogni** rifiuto del salvataggio è silenzioso, compresi gli errori dell'API. Il
pulsante sembra rotto.

Il percorso misurato: lettere digitate nel campo importo → `parseMoneyInput` rende `null`
→ il netto canonico resta `null` → `buildLinesBody` scarta la riga come vuota →
`lines.length === 0` → messaggio corretto, scritto in un signal che non arriva a schermo.

**La correzione**: esporre lo stato, legarlo al banner, e un test che provi che un rifiuto
**si vede**. Il campo importo resta `type="text" inputmode="decimal"` — con i separatori
decimali italiani `type="number"` non va — ma senza errore visibile l'operatore non ha modo
di sapere che «abc» non è un importo.

⚠️ **E poi la guardia.** `check:form-errors` dice «22 form rifiutano l'invio, e tutti dicono
perché»: questa maschera evidentemente non rientra nel suo censimento. Una guardia che non
copre l'ultimo form aggiunto non proteggerà nemmeno il prossimo — va capito **perché** l'ha
saltata, non aggiunto un caso a mano.

### 2. ✅ CHIUSO — Il Codice IVA di riga non sembrava editabile

Nella tabella righe la cella IVA ha lo stesso fondo grigio delle celle calcolate, mentre è
un valore **che si sceglie**. Va vestita come un campo: **fondo bianco**, come gli altri
controlli editabili della riga.

È la stessa distinzione che il resto della maschera già fa — importo si digita, imponibile e
imposta si leggono — e qui non la fa: la freccina del menu è l'unico indizio, e non basta.

### 3. ✅ PRESIDIATO — `page` e `pageSize` accettati e ignorati

Tolto il limite delle cento righe, `listOrders` restituisce l'insieme intero e i due
parametri **non decidono più niente**. Restano nel contratto perché `Paginated` è una forma
condivisa con mezzo backend, e rifattorizzarla per una schermata sarebbe sproporzionato.

⚠️ **Ma un parametro accettato e ignorato è esattamente il difetto di `onlineOnly`**, che
questa stessa area ha già pagato: qualcuno lo manda, l'API lo prende, non succede niente, e
nessuno se ne accorge finché non conta. Qui il presidio è un test — con `pageSize: 10` le
righe restituite restano 150 — non un commento.

Da riprendere quando si toccherà `Paginated` per altre ragioni, **non prima**: aprire quel
refactor adesso significherebbe muovere un tipo condiviso per un problema che oggi un test
tiene fermo.

### 4. Il Codice IVA si comporta in due modi diversi — e non è un duplicato

Osservato in anagrafica prodotto il 17/08/2026: il campo Codice IVA della scheda **non si
usa da tastiera** come quello delle righe documento.

Non è codice copiato. Sono **due componenti con due modelli di interazione**:

| Dove                | Componente                      | Cos'è, tecnicamente        | Tastiera                                                                                  |
| ------------------- | ------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| righe documento     | `app-document-line-select-cell` | un `<input>` vero          | si digita e filtra, Invio sceglie e resta, **Tab risolve e va al campo dopo**, ←/→ escono |
| anagrafica, testate | `app-select-menu`               | un `<button>` con pannello | si apre, si cerca dentro il pannello, Escape chiude                                       |

⚠️ **La divergenza è dichiarata, non accidentale.** `regole-stile-ui` §5 dice che la cella di
riga «sostituisce `app-select-menu` dentro le righe, **e solo lì** — le altre 179 istanze del
menu restano dove sono», perché nata per un problema delle righe: il giro del fuoco fra le
colonne, che in una tabella è il gesto principale.

**Il difetto vero non è la duplicazione: è che all'operatore i due campi sembrano lo stesso
campo.** Stesso dato, stesso aspetto, e il dito sul Tab ottiene due cose diverse a seconda
della schermata.

Tre strade, e nessuna è gratis:

1. **Portare la cella di riga fuori dalle righe** — contraddice la regola citata, che è stata
   scritta con una ragione: fuori da una tabella il Tab non ha un «campo dopo» nella stessa
   colonna, e metà del contratto della cella non ha senso.
2. **Dare a `select-menu` la parte di tastiera che manca** (digita-e-filtra sul trigger, Tab che
   risolve). È la strada più coerente, e tocca **179 istanze**: va misurata prima, non decisa qui.
3. **Accettare la differenza** e dichiararla, se si conclude che una scheda e una riga sono
   contesti diversi anche per il dito.

Da decidere quando si riprenderà l'anagrafica, **non di straforo dentro un lavoro sui
Corrispettivi**: qualunque delle tre tocca componenti condivisi da mezza applicazione.

### 5. Restyle mobile del Registro — FATTO il 18/08/2026

Sessione di rifinitura visiva guidata dagli screenshot, tutta sul Registro
Corrispettivi. **I pattern che ne sono usciti sono scritti in
`regole-stile-ui.md`** e valgono per le altre schermate che verranno riviste:
non vanno riscoperti leggendo questo codice.

| Area           | Prima                                   | Dopo                                                           |
| -------------- | --------------------------------------- | -------------------------------------------------------------- |
| Testata mobile | 5 fasce di comandi prima del primo dato | 2 — «Nuovo» accanto al titolo, poi Esporta · Filtri · Colonne  |
| Filtri mobile  | 6 chip a 44px                           | 1 pulsante «Filtri (n)» + pannello (mixin condiviso)           |
| Export mobile  | 4 pulsanti                              | menu «Esporta» (`app-action-menu` con `triggerLabel`)          |
| Righe mobile   | ripiego `data-label`, 8 righe per card  | card progettata a 3 fasce, accento laterale per tipo           |
| Elenco lungo   | tutto, il riepilogo irraggiungibile     | 25 righe + «Mostra le altre N righe», solo su schermo compatto |
| Riepilogo      | banda piatta, 3 blocchi responsive      | riquadro unico con fili, 2 fasce, **zero** media query         |
| Scroll mobile  | elenco in una finestrella di ~330px     | scorre la pagina, il riepilogo è la coda                       |

**Componenti condivisi estesi** (sempre con `input()` o custom property, mai
`::ng-deep`): `app-button` (`ariaLabel`), `app-action-menu` (`triggerLabel`,
`triggerIcon`, punti di regolazione), più l'estrazione del mixin
`list-page-mobile-filters` da `list-page`, che ora serve anche a chi ha un
layout proprio.

**Token nuovi**: `--border-width-accent` (l'accento laterale, prima scritto
come `--space-1` — un token di spaziatura prestato a un bordo) e
`--summary-item-min-w` (misurato sull'etichetta più lunga della banda totali).

⚠️ **Quello che resta da verificare**: tutto è stato provato ridimensionando la
finestra su PC, **mai su un telefono vero**. La larghezza e le media query sono
fedeli; il tocco no. Da controllare su dispositivo: bersagli da 44px raggiungibili
col pollice, pannello filtri, menu Esporta, e lo scorrimento dell'elenco lungo.

### 6. Pulsante di collasso sidebar a icone — confermato, non ancora costruito

⚠️ **Fuori tema** (shell applicativa, non Corrispettivi): segnato qui solo perché è emerso
durante il restyle di questo Registro (larghezza sidebar, densità filtri), ed è questo il
file da cui si riprende quella sessione.

Deciso il 18/08/2026: dopo aver ridotto `--sidebar-width` da 232px a 196px per prova visiva
passo per passo, resta l'idea di un pulsante che colassi la sidebar a sola icona sulle
finestre strette — confermata dal proprietario del progetto («tasto per ridurla mi piace
l'idea»), mai costruita.

Misurato, per chi riprende:

- Pattern di riferimento: `core/services/theme.service.ts` — `providedIn: 'root'`, `signal` +
  `localStorage` con fallback try/catch. Lo stesso schema serve per lo stato
  collassato/espanso.
- Wiring: `ShellLayoutComponent` (smart, tiene lo stato) → `AppSidebarComponent` (resta dumb:
  riceve via `input()`, emette il toggle via `output()`).
- Il toggle va nella riga del brand (`.app-sidebar__brand`), e solo da `lg` in su: sotto quella
  soglia la sidebar è già un cassetto mobile, il collasso a icone è un problema di larghezza
  _desktop_, non di quello.
- Il token della larghezza collassata **esiste già e non è mai usato**:
  `--sidebar-width-collapsed: 3.5rem` in `_design-tokens.scss` — verificato via grep, nessun
  selettore lo referenzia.
- In collassato, `.app-sidebar__label` / `.app-sidebar__section-title` / `.app-sidebar__brand-copy`
  si nascondono VISIVAMENTE (stile `.sr-only`: clip, non `display:none`), non si tolgono dal DOM
  — il nome della voce deve restare annunciato dallo screen reader anche a sidebar collassata.

Pattern nuovi da riusare, documentati in `regole-stile-ui.md` §5 durante lo stesso lavoro
(barre filtri dense, modalità `select-menu`, variante `flat` di `segmented`, riepilogo di fondo
pagina, riga di subtotale in tabella): utili anche per gli altri riepiloghi/elenchi da
sistemare dopo, non solo per la sidebar.

### 7. ⭐ L'inserimento da TASTIERA nelle anagrafiche — deciso il 18/08/2026, da fare

> **In un gestionale una scheda si compila da tastiera, dall'inizio alla fine. Se un solo
> campo costringe al mouse, l'operatore ha perso il ritmo su tutti gli altri.**

**Come è emerso.** Cercando perché il Codice IVA si comportasse in due modi. La risposta è
che il problema non è il campo IVA: **nelle anagrafiche la tabulazione non è mai stata
progettata**. L'IVA è solo il punto in cui si è visto.

⚠️ **Il criterio con cui questo lavoro va giudicato è di prodotto, non di codice.** La prima
proposta fatta in sessione — «rendere la cella indipendente dalla riga», «togliere un input
obbligatorio» — è stata respinta dal proprietario del progetto con la motivazione giusta:
_«le soluzioni non devono essere solo risolutive, ma coerenti col gestionale, non solo
semplificare il processo di codice»_. Vale per chiunque riprenda questo punto.

**Il requisito**, detto una volta:

- lo stesso dato si sceglie **nello stesso modo** in ogni schermata — riga documento o scheda;
- il giro del Tab **arriva a ogni campo e riparte**, nell'ordine logico della maschera;
- si digita per cercare, l'elenco filtra **per prefisso del codice**, Invio conferma e resta.

**Perimetro da verificare** (non solo l'articolo): scheda articolo, fornitore, cliente,
Impostazioni. Per ognuna: ordine del Tab nel DOM, campi che lo interrompono, controlli che
non si operano da tastiera.

**Cosa NON basta**, e va detto perché è la tentazione: sistemare il solo campo IVA. Sposta il
problema invece di chiuderlo — gli altri diciannove campi della scheda restano come sono.

**Misure già in mano** (18/08, due indagini):

- `app-select-menu` è un `<button>`: il Tab ci arriva, ma poi non si digita. L'unico
  `keydown` di tutto il componente è Escape — niente frecce, niente type-ahead. **È più
  povero di un `<select>` nativo**, e le linee guida ARIA per `role="listbox"` chiedono
  entrambe le cose. Vale per tutte le sue istanze, non solo l'IVA.
- Le istanze sono **186** (erano 179 il 17/08: sette in più in due giorni), e sono **due
  popolazioni**: ~97 filtri e barre strumenti, dove il trigger a bottone è la scelta
  **giusta**, e ~89 campi di form, dove sta il difetto. Il numero che ha bloccato la
  decisione due volte contava le prime insieme ai secondi.
- La cella di riga **non è specifica delle righe**: su 16 istanze solo 7 stanno nel giro
  delle colonne.
- ⚠️ `select-menu` ha 23 input, 186 istanze e **nessuno spec**. Qualunque modifica al suo
  comportamento di tastiera oggi non ha nulla che la fermi: la rete va messa prima.
- ⚠️ La destinazione **non** è `shared/`: ESLint vieta a `shared/**` di importare `@domain/*`,
  e si trascinerebbe dietro un grappolo di 34 file. I punti di chiamata stanno in `domain/`,
  e `domain → domain` è consentito.
- **Riferimento esterno utile** (dal proprietario): Danea tiene **due** comportamenti — nella
  scheda articolo un elenco con type-ahead, nelle righe una cella che si digita. Quindi due
  comportamenti non sono di per sé un difetto; VestiFlow però ha scelto di **unificarli sul
  modello delle righe**, che è più coerente.

#### Stato al 01/09/2026 — l'anagrafica FORNITORE è fatta, le altre no

Rifatta per intero (larghezze per contenuto, ordine di battitura, densità a 28px, sezioni
piatte allineate, avvisi di digitazione). Il giro del Tab è stato **verificato in un browser
vero**: 26 fermate in ordine di DOM, dalla ragione sociale ai due pulsanti, nessuna trappola,
la cella del Codice IVA raggiunta come ogni altro campo. La forma è in `regole-stile-ui`
§7-bis.

⭐ **E l'anagrafica ha tre dati in più — 01/09/2026**, chiesti dal proprietario davanti alle
schede Danea: **IBAN**, **Cellulare**, **Ns. banca**. L'IBAN era il solo davvero essenziale:
un fornitore lo si paga con un bonifico, la modalità di pagamento c'era già ma il numero con
cui il bonifico si fa no.

**La divisione fra le due tabelle non è arbitraria**, e vale come precedente per il cliente:

```text
iban          → parties     è il conto di CHI INCASSA, cioè del soggetto
mobile_phone  → parties     è un recapito del soggetto, come `phone`
our_bank_name → suppliers   è la NOSTRA banca per questo rapporto
```

Danea li mostra nella stessa scheda perché non separa soggetto e ruolo; VestiFlow sì, e il
commento di `Party` lo dichiara. Quindi **il cliente eredita IBAN e cellulare senza
migration**: le colonne sono già sue.

⚠️ **Restano non aggiunti, e per una ragione**: Fido e Conto acq. presuppongono un
affidamento e un piano dei conti che VestiFlow non ha — sarebbero caselle che nessuno
riempie. Fax è obsoleto. Indirizzi e contatti multipli («Aggiungi indirizzo…») sono un
lavoro a sé, non un campo.

⚠️ **Restano da fare: cliente, articolo, Impostazioni.** `customer-form-fields` è oggi la
copia esatta del difetto corretto qui — griglia a due colonne uguali, nessun controllo su
P. IVA, codice fiscale, CAP e provincia, `font: inherit` sugli input (13px: sotto la soglia
iOS). I controlli fiscali sono già pronti e condivisi in `src/app/domain/fiscal/`.

⛔ **E c'è un difetto di dominio trovato per strada**, che non riguarda la veste: il Codice
IVA del fornitore non arriva sugli articoli creati da Arrivo merce se le righe si aggiungono
DOPO aver scelto il fornitore — cioè nell'ordine naturale dei gesti. Misure, catena e
divergenza dell'Ordine fornitore in `docs/03c-contratto-risolutore-riga.md` §P1.

#### Stato al 18/08/2026 sera — cosa è già fatto del punto 7

Due commit sul ramo, albero verde (build, lint con 9 guardie, 504 test di componente):

- `d8da0d3f` — la cella `document-line-select-cell` esce dalle righe: `lineIndex`
  facoltativo, più `selectOnFocus`, `includeEmptyOption`/`emptyOptionLabel` e `boxed`.
  Tutte additive: le sedici istanze dentro una riga non cambiano.
- `965ca4c1` — scheda **articolo** e scheda **fornitore** usano quella cella per il
  Codice IVA. Opzioni da `vatCodeSelectOption` (label = codice), che è la condizione
  perché il filtro per prefisso funzioni.

**Decisione di dominio registrata** (proprietario del progetto): il Codice IVA
predefinito **propone**, non determina. Un articolo nuovo nasce col predefinito
**scritto nel campo**; se l'operatore lo svuota resta vuoto e nessuno glielo rimette —
un articolo senza Codice IVA è legittimo. A campo vuoto **non c'è scritto nulla**.

#### «IVA in ordine fornitore non va bene» — misurato il 18/08/2026

La domanda posta dal proprietario era la sola che contasse: **è cambiato qualcosa, o già
prima non funzionava?** In Ordine cliente lo stesso campo sembrava a posto.

**Risposta: non è cambiato niente il 18/08.** I due commit di quel giorno hanno toccato il
componente cella (in modo additivo), la scheda articolo e la scheda fornitore — **nessuna
delle due maschere d'ordine**. Il `git blame` sulle celle IVA di riga dice `11/08/2026` per
entrambe (`57ad10c4`, `1ee64a50`, `b5a292c4`), e la voce vuota del fornitore risale al
`18/07/2026`.

**La divergenza però era reale.** Confrontando **quattro** maschere e non due, l'Ordine
fornitore risultava l'unico fuori riga:

|                                       | Ordine cliente    | Arrivo merce      | Corrisp. manuale | **Ordine fornitore**   |
| ------------------------------------- | ----------------- | ----------------- | ---------------- | ---------------------- |
| voce vuota `—` in cima all'elenco IVA | no                | no                | no               | **sì**                 |
| `[value]` legato a                    | `lineVatValue(i)` | `lineVatValue(i)` | —                | **il control diretto** |

**✅ CORRETTO — la voce vuota.** `vatCodeOptionsBase` anteponeva `{ value: '', label: '—' }`
alle opzioni: eredità di quando la colonna era un `select-menu`, dove una tendina senza
scelta è normale. Sulla cella a ricerca-e-selezione quella voce è la **prima evidenziata**:
aprire e battere Invio senza guardare azzerava il Codice IVA della riga, e il salvataggio
poi la rifiutava. È il vicolo cieco che `document-line-select-cell` descrive da sé su
`includeEmptyOption`. Guardia: `l'elenco del Codice IVA di riga non offre la voce vuota`,
**provata rossa** rimettendo il codice di prima.

⚠️ **DUE ERRORI DI ANALISI, registrati perché non si rincorrano di nuovo.**

1. **«`onLineVatSelect` non chiama `markFormDirty()`, quindi la modifica si perde» — FALSO.**
   Il gestore davvero non lo chiama mentre i suoi fratelli di riga sì, e `dirtySinceLastSave`
   davvero si accende solo dentro `markFormDirty`. Ma **una delle chiamate a `markFormDirty`
   è una sottoscrizione unica su `form.valueChanges`** (costruttore, dal 19/07/2026), e il
   `setValue` di quel gestore emette: la protezione c'era già. L'errore è stato cercare chi
   **scrive** la variabile senza mai elencare chi **chiama** la funzione che la scrive.
2. **La guardia di sola lettura aggiunta al gestore contraddiceva una scelta dichiarata**:
   due righe sotto quella sottoscrizione il codice dice «Sola lettura = form disabilitato.
   Un solo punto invece di una guardia in ogni gestore». Entrambe le modifiche sono state
   **ritirate**.

⚠️ **E la correzione dell'id duplicato del 18/08 quasi certamente non c'entra.** Stava nel
pannello «Nuovo fornitore»; ma il pannello «Nuovo cliente» dell'Ordine cliente **non ha
affatto un campo Codice IVA** — è stato verificato. Un confronto «cliente contro fornitore»
può quindi riguardare solo le **righe**, non i pannelli.

**Resta aperto**: se dopo questa correzione l'operatore vede ancora qualcosa che non va,
serve uno screenshot. La divergenza `[value]` della tabella qui sopra è **una fragilità, non
un guasto misurato** — altri binding dello stesso template leggono `formValue()`, quindi il
giro di rilevamento parte lo stesso — e va allineata col lavoro grosso, non di straforo.

#### La tabulazione dell’anagrafica — primo passo fatto il 18/08/2026

Indicazione del proprietario: _«in anagrafica possiamo iniziare a proporre questo
comportamento di tabulazione provvisorio che abbiamo già per le righe, poi la progettiamo e
definiamo e mettiamo nei documenti»_. Quindi **primo passo, non il lavoro**.

⚠️ **Due difetti misurati, non ipotizzati** — con una prova usa-e-getta sulla scheda
articolo, poi cancellata:

1. **Sedici icone informative erano fermate del Tab**, e portavano insieme `tabindex="0"` e
   `aria-hidden="true"`. Le due cose si contraddicono: l’elemento riceve il fuoco ma è
   tolto dall’albero accessibile — ed è la coppia che fa comparire l’avviso in console
   quando il fuoco ci finisce dentro. Misurato: uscendo col Tab dal Codice IVA il fuoco
   andava su un `<i>`, non sul campo dopo.
2. **Il Tab entrava nell’elenco aperto e poi perdeva il fuoco.** Causa nel pannello
   condiviso dei suggerimenti — dettaglio in `03-specifica…` §4.3. Misurato: digitando `1`
   e premendo Tab il valore si risolveva in `10` (giusto) e poi il fuoco finiva sul
   `<body>` (da nessuna parte).

**Correzioni**: `tabindex="-1"` in entrambi i casi.

⚠️ **Perché `-1` e non togliere l’attributo**, che sembrerebbe più pulito: il tooltip si
apre anche col **fuoco**, e su schermo touch quello è l’**unico** modo — la regola CSS è
`@media (hover: none) { .hover-tooltip:focus-within … }`. Togliendo del tutto il
`tabindex` il suggerimento diventerebbe irraggiungibile da tablet. Con `-1` l’icona esce
dal giro del Tab (che su tablet non esiste, come ha fatto notare il proprietario) ma resta
raggiungibile col tocco.

**Misura dopo**: Tab dal Codice IVA → il controllo successivo; digita e Tab → valore
risolto **e** fuoco sul campo dopo. Sedici fermate in tutto nella scheda.

**Cosa NON è stato fatto, ed è il lavoro vero**: la tabulazione della scheda non è
progettata — l’ordine è quello del DOM, nessuno l’ha deciso. Restano fuori anche fornitore,
cliente e Impostazioni. E resta aperta la domanda del §4.3 su cosa il Tab debba portarsi
dietro quando l’elenco è aperto ma l’operatore non ha scelto niente.

**Non fatto, e volutamente**: il rinominare la cella. Si chiama ancora
`document-line-select-cell` mentre ora vive anche in due anagrafiche — è l'anti-pattern
che `regole-architettura` nomina («i nomi dichiarano l'appartenenza»). Tocca 18 istanze e
va fatto col lavoro grosso, non di straforo. **Debito dichiarato.**

---

### 8. ⭐ Vista tablet / vista PC nelle Impostazioni — deciso, da costruire

> **Le due soglie automatiche e la scelta manuale si progettano INSIEME, non una dopo
> l'altra.** _(deciso dal proprietario il 18/08/2026)_

La decisione di base è in `regole-stile-ui` §9, presa l’11/08: la vista a card di un
documento non dipende dalla larghezza ma dal **tipo di puntatore** — col mouse le card
sotto 820px, col dito sotto 1400px — **più una scelta manuale** che il dispositivo si
ricorda, per «il monitor touch grande, chi sul portatile preferisce le card».

⚠️ **Le due soglie vanno RIVISTE quando la scelta manuale esiste** _(deciso dal proprietario
il 18/08/2026)_, e la ragione è che le due decisioni si sono prese in ordine inverso.

**I 1400px** del dito sono tarati per non sbagliare **mai** su un tablet, perché oggi la soglia
è l’unico rimedio: deve coprire anche il caso più largo, e per farlo manda alle card anche
schermi dove la tabella starebbe benissimo. Con la valvola manuale quel compito cambia — la
soglia deve essere giusta per la **maggioranza**, non per tutti, e le eccezioni le prende
l’impostazione. Una soglia prudente senza valvola è cautela; **la stessa soglia con la valvola
è un default che sbaglia più spesso del necessario**, e ogni volta costa all’operatore un giro
nelle Impostazioni.

**Vincoli di esecuzione già scritti** (`regole-stile-ui` §9, da rileggere prima di
toccare): le due condizioni si scrivono **una volta sola** in un mixin di
`styles/_breakpoints.scss`; si muovono **entrambe le direzioni insieme** (~14 fogli), o
nella fascia di mezzo si accendono **tutte e due le viste**; si muove **tutta la vista
documento**, non le sole righe; la **sidebar resta sulla larghezza**.

**Collegato, e da non dimenticare**: su tablet **il Tab non esiste**. Tutto il lavoro sulla
tabulazione (punto 7) vale per chi ha una tastiera; la vista del dito deve reggersi sul
tocco, e le due cose non si sostituiscono a vicenda.

---

### 9. ⭐ Vendita e Reso al banco — la specifica è `docs/11`

⛔ **Qui non si riassumono le decisioni, e non si riassumono gli interventi.** La fonte è
`11-specifica-vendita-al-banco.md`: le **decisioni** in sezione A, la **misura** del codice in
B, gli **interventi** in C, ognuno agganciato alla decisione che lo genera.

⚠️ **Questa sezione conteneva un riassunto delle decisioni del 18/08, ed era già smentito dalla
specifica in tre punti** — diceva «origine facoltativa» dove A11 stabilisce **nessun documento
origine**, teneva aperto il prezzo del Reso che A11 ha chiuso, e motivava le regole col fatto
che «il codice le applicava», che è il metodo che `11` dichiara **non valido**. È stato tolto il
18/08: un riassunto di decisioni è una seconda fonte, e invecchia alla prima decisione.

**Cosa sapere da qui, senza aprire `11`:**

- il documento è stato riscritto da capo il 18/08 ed è l'**unica specifica attiva** del modulo —
  si aggiorna lì, non nascono file paralleli;
- il **contratto del Reso al banco è chiuso** (nessun documento origine, prezzo dall'anagrafica
  secondo il contratto prezzi comune, causale facoltativa, rimborso informativo, correzione come
  la Vendita);
- una **Vendita o un Reso conclusi si riaprono, si modificano e si eliminano**, con
  riconciliazione per differenza — è l'intervento più grande, ed è il primo;
- l'ordine di esecuzione è in `11` sezione C: prima il prerequisito tecnico, poi le tre fasi di
  interfaccia.

---

### 10. ⭐ La matrice documentale Includi/Genera — da verificare e applicare a TUTTI i documenti

> **Non è un seguito della Vendita al banco.** È il contratto di come i documenti si agganciano
> fra loro, e riguarda l'intera famiglia.

⛔ **La fonte canonica è `12-specifica-collegamenti-documentali.md`**, e ha due metà che vanno
tenute distinte: **la matrice e le regole** (il contratto: dove si deve arrivare) e **la sezione
B** (la misura del codice attuale, riverificata da un secondo lettore). ⛔ **Qui non si tiene né
una copia della matrice né conteggi propri del divario**: invecchiano alla prima rimisura, ed è
già successo.

**Il lavoro, in una riga:** completare la copertura della matrice comune **estendendo i
meccanismi esistenti senza duplicarli**, ⛔ senza costruire un secondo motore parallelo in
nessun modulo, e ⛔ senza cancellare le conversioni oggi in uso — la matrice dice dove si deve
arrivare, non che l'esistente sia sbagliato.

⚠️ **Il divario col codice è grande, e va letto in `12` §B prima di stimare qualsiasi cosa.**
La misura del 18/08 non conta «un motore da estendere»: conta **più meccanismi parziali e
indipendenti**, alcuni dei quali non passano nemmeno dal backend.

**Le due regole che stanno sopra la matrice** — testo in `12`, qui solo i nomi:

1. **Un collegamento non autorizza mai a duplicare un movimento già avvenuto**, e senza
   trattamenti speciali per nome di documento.
2. **Il comando si chiama «Genera documento» ovunque** — «Concludi ordine» ritirato il 18/08;
   sparisce il nome, non il comportamento.

✅ **Chiuso il 21/08/2026:** la posizione della **Proforma** nella matrice è censita in `12` —
non include nulla, genera verso DDT vendita e Fattura. Qui c'era «da censire in `12` senza
aggiungere collegamenti non verificati.

---

### 10b. Comando documento per la spunta di movimentazione su tutte le righe

**Requisito trasversale emerso in `docs/11` A11-ter**, che è la sua fonte: nei documenti che
hanno la spunta di movimentazione **per riga** deve esistere un comando **a livello documento**
per impostarla in blocco. Con molte righe non è accettabile obbligare l'operatore a toccarla
articolo per articolo.

⚠️ **Sta qui perché è trasversale**, non del Reso né della Vendita al banco: se restasse solo in
`11` si perderebbe quando si lavora agli altri documenti. **Da coordinare con il lavoro di
unificazione righe (`03`).**

---

### 11. ⭐ Gli stati di DDT e Fatture non sono un ciclo — misurato il 18/08/2026

> **L’elenco offre cinque stati, la maschera non ne espone nessuno, il codice ne sa scrivere
> tre, e il metodo che gestirebbe i passaggi non lo chiama nessuno.**

Emerso da una domanda del proprietario — «gli stati in DDT e fatture sono funzionanti?» — e
misurato subito dopo.

| Stato                   | Chi lo scrive                            |                                               |
| ----------------------- | ---------------------------------------- | --------------------------------------------- |
| `draft`                 | 1 punto, alla creazione                  | vivo                                          |
| `confirmed`             | 5 punti                                  | vivo                                          |
| `printed`               | **nessuno**                              | ⛔ morto                                      |
| `sent`                  | **nessuno**                              | ⛔ morto                                      |
| `cancelled`             | 1 punto, via `POST :id/cancel`           | vivo                                          |
| `externally_registered` | **nessuno**, tolto dallo schema il 16/08 | ⛔ morto, resta il valore nel tipo PostgreSQL |

⛔ **`transition(tenantId, id, next, allowedFrom)` esiste e fa la cosa giusta** — rifiuta i
passaggi non ammessi con «Transizione di stato non consentita» — **ma non lo chiama nessuno.**
Nel controller l’unico endpoint di stato è `POST :id/cancel`: non esiste «segna come
stampato», né «segna come inviato», né un cambio di stato generico.

**Quindi il ciclo non esiste**: un documento nasce, si conferma, e da lì l’unica transizione è
annullare.

⚠️ **Cosa vede l’operatore, ed è la parte che fa danno.** Nella maschera del DDT **non c’è
nessun campo Stato** — non esiste neanche il form control. Ma l’elenco offre i filtri:

```text
DDT vendita   Confermato · STAMPATO · INVIATO · Annullato
Fattura       Da emettere · INVIATA AL COMMERCIALISTA · Annullata
```

Gli stati in maiuscolo **nessun documento nuovo può assumerli**: quei filtri, salvo storici,
tornano sempre vuoti. E l’operatore non ha modo di marcare un documento come stampato nemmeno
volendo.

⚠️ E i tre `CONFIRMED_EDITABLE_STATUSES` includono `printed` e `sent`: gate che contemplano
stati irraggiungibili. Non fanno danno, ma raccontano un ciclo che non c’è.

⏸️ **Tre strade, e nessuna è stata scelta:** togliere dai filtri gli stati che nessuno assegna
· implementare le transizioni mancanti · lasciare com’è e dichiararlo. La prima è l’unica delle
tre che l’operatore vede.

---

### 12. Sconto extra: le REGOLE DI CALCOLO sono del motore economico, non di una maschera

⚠️ **Attenzione a cosa è aperto: non il campo, il calcolo.**

|            |                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deciso** | il documento ha lo **Sconto extra a piè documento**, con un campo **percentuale** e un campo **importo**, coerente con gli altri documenti VestiFlow (`11` A16) |
| **Aperto** | le **regole di calcolo** di quello sconto                                                                                                                       |

Restano da definire: se **percentuale e importo** siano cumulabili o alternativi, l’**ordine di
applicazione**, gli **arrotondamenti**, il comportamento con **più aliquote**, il rapporto con
**castelletto e totali**.

⚠️ **Non sono decisioni della Vendita al banco**, e non stanno nella sua specifica: la risposta
deve valere identica su ogni documento che ha uno sconto extra. Deciderle dentro una maschera
produrrebbe una regola valida per quella sola.

⚠️ **Non esiste una specifica che le ospiti** — verificato il 18/08: nessun file in `docs/` le
governa. Stanno qui finché non ne nasce una, o finché non si decide che la loro casa è il
documento del motore economico.

⚠️ **E più aliquote non sono un motivo per togliere l’importo**: è un caso che il modello
economico deve saper gestire, non una funzione da sacrificare.

⛔ **Ma il campo importo OGGI NON ESISTE**, e va saputo prima di stimare. Misurato il 18/08: il
contratto comune ha **solo la percentuale** — `documentDiscountPercent` in ingresso e un
importo come risultato calcolato. **Nessun campo importo in ingresso**, in nessun documento e
in nessuno strato.

Quindi la decisione «percentuale e importo» **richiede di estendere il contratto comune**, e
quella estensione va fatta **dove il contratto vive**. ⛔ **Non** aggiungendo un campo locale a
una maschera: un importo che esiste in un documento solo è la logica locale che si sta
evitando.

**La regola generale**, che vale oltre gli sconti: se durante l’implementazione il contratto
comune risulta **incompleto o incoerente**, lo si **segnala** — non lo si aggira in locale. È
la stessa disciplina del motore Includi/Genera al punto 10.

---

### 13. ⭐⭐ `invoice_draft`: uno STATO modellato come TIPO — censimento del 18/08/2026

> **«Bozza fattura» doveva essere uno stato della fattura non ancora confermata. È nato come
> tipo di documento a sé, e da lì viene il disordine.**

Diagnosi del proprietario, e il codice la conferma da solo. Nello schema, sulla tabella
`documents`:

```text
«le BOZZE (number NULL) non collidono ma i confermati sì»
```

Il concetto di bozza **è già uno stato**: un documento senza numero. E `DocumentStatus.draft`
esiste. Quindi «bozza» è modellata **due volte** — una volta bene come stato, una volta male
come nome di tipo.

⚠️ **E non esiste nessun tipo fattura «non bozza»**: `invoice_draft` è l’unica fattura di
vendita. Il commento del suo enum lo dice: `invoice_draft // Fattura (fiscale…)`. Il nome
promette una distinzione che nel modello non c’è.

#### ⛔ Chi è appoggiato su quel tipo — la parte che rende pericoloso toccarlo

**Due altri documenti ci numerano dentro:**

```text
invoice_accompanying  ─┐
credit_note           ─┴──→  numerano sotto  invoice_draft
```

Fattura, Fattura accompagnatoria e Nota di credito **condividono un solo progressivo**, e chi
lo possiede è `invoice_draft`. Il codice avverte che usarlo come filtro di uguaglianza su
`type` è **«un errore silenzioso»**: si vedrebbe metà partizione e si proporrebbero numeri già
occupati, che l’indice unico boccia. C’è una migration dell’11/08 che chiude proprio quello.

**Gli altri appoggi, misurati:**

| Dove                    | Cosa                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `document-type.util.ts` | **10 punti**: numerazione, conversione, insiemi                                                              |
| conversione             | è **destinazione** sia da Proforma sia da DDT vendita                                                        |
| permessi                | famiglia `invoice`                                                                                           |
| modalità prezzo         | è in `SALES_PRICE_MODE_TYPES`                                                                                |
| Nota di credito         | ci si genera sopra (`07` §6)                                                                                 |
| viste tabella           | chiave **persistita** `invoice_draft_documents_list` — rinominarla orfana le colonne salvate dagli operatori |
| API                     | parametro `?type=invoice_draft` — collegamenti salvati e integrazioni                                        |
| migration               | **7 file** già applicati                                                                                     |
| in tutto                | **131 occorrenze**, 72 fuori dai test, su **46 file**                                                        |

#### I tre lavori, di natura diversa — e con case diverse

⚠️ **Qui c'era scritto che i primi due «stanno in `11` C1». È sbagliato**, e va corretto per
natura del lavoro invece che spostando il rimando: `docs/11` non è la casa di `invoice_draft`,
e **C1 riguarda la terminologia «Vendita negozio»** — in tutto `11` non esiste una sola
occorrenza di `invoice_draft` né di «Bozza fattura».

**La divisione che conta è fra terminologia esposta e identificatore tecnico**, ed è la stessa
distinzione che `11` A6 fa per «Vendita negozio»: sono due lavori con rischi diversi, e vanno
tenuti separati.

|       | Cosa                                                                      | Casa                                                                                               | Rischio                                       |
| ----- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **1** | il **termine esposto** → «Fattura»: guida, documento funzionale, messaggi | **`docs/12`**, sezione «Bozza fattura non è un tipo documentale» — è lì che la regola è dichiarata | nessuno, e risolve il problema dell'operatore |
| **2** | una **guardia** che impedisca il rientro del termine, su `check:registro` | **`docs/12`**, insieme alla regola che deve far rispettare                                         | quasi nessuno                                 |
| **3** | l'**enum tecnico** `invoice_draft`: mapping, rotte, numerazione, rinomina | **la Famiglia Fattura (`docs/07`)** — non `11`, non la matrice                                     | ⛔ alto — vedi sopra                          |

⛔ **Il 3 non è una rinomina, e non si fa automaticamente perché il nome tecnico è storico.** È
disfare un tipo su cui poggia il numeratore di tre documenti: toccarlo male significa **numeri
duplicati sulle fatture**, il danno peggiore possibile qui. Se si farà, la partizione del
numeratore è il **primo** vincolo da affrontare, non una scoperta a metà strada. E il database è
condiviso col collega.

⏸️ **Il 3 non è deciso.** I primi due sì.

---

# Elenchi lunghi: la resa, non i dati _(rimandato 20/08/2026, con evidenza)_

## ⏸ QUANDO SI FA: **alla fine di tutti i lavori** — deciso il 30/08/2026

_Il proprietario: «la virtualizzazione la inserirei nel documento da fare e la riprenderei alla
fine di tutti i lavori»._

⭐ **Non è un rinvio prudenziale: è l'ordine che costa meno**, e la ragione è che la
virtualizzazione va scritta contro un motore FERMO. Il motore tabella sta ancora prendendo forma —
il 30/08 ha preso `table-layout: fixed`, i divisori di colonna e il taglio a colonna; deve ancora
prendere la **riga totali**, che si incolonna con le colonne, e tre elenchi devono ancora
entrarci. La virtualizzazione tocca **esattamente** quelle cose: altezza di riga, intestazione
appiccicata, allineamento delle colonne. Scritta prima, si riscrive dopo.

### ⭐ E il lavoro del 30/08 è il suo PREREQUISITO, non un suo rivale

Una lista virtualizzata deve sapere **quanto è alta una riga** per calcolare quali disegnare.
Fino al 30/08 l'altezza dipendeva dal contenuto: un nome lungo mandava la riga a due righe di
testo. Il **taglio a colonna** l'ha resa costante — cioè ha appena reso la virtualizzazione
scrivibile.

### ⛔ L'impaginazione si toglie PRIMA, non dopo — corretto il 30/08/2026

⛔ **Qui c'era l'ordine opposto**, scritto un'ora prima: «l'impaginazione va tolta AL PASSO 3»,
insieme alla virtualizzazione, «la stessa modifica fatta una volta invece di due».

⭐ **Il proprietario l'ha ribaltato con una frase**: _«se non togli l'impaginazione non possiamo
ottimizzarla»_. Ed è dirimente: **con dieci righe a pagina il costo di un elenco lungo non si
manifesta mai.** Non lo si può misurare, non lo si può tarare, e la virtualizzazione resterebbe
una scelta al buio — cioè esattamente ciò che questo documento rimprovera altrove («il numero va
scelto su dati reali»).

⚠️ **L'argomento che avevo usato era vero e irrilevante**: sì, sono due modifiche invece di una.
Ma la seconda non si può nemmeno progettare finché la prima non è fatta, quindi il risparmio non
esisteva.

### L'ordine, corretto

```text
1. togliere l'impaginazione      ✅ fatto sui PRODOTTI il 30/08
2. finire la forma del motore    riga totali · spazi · gli ultimi tre elenchi
3. virtualizzare                 alla fine, con il costo finalmente visibile e misurabile
```

✅ **Finito, e questa riga era testo morto.** Diceva «restano cinque elenchi che impaginano
ancora: Clienti, Fornitori, Giacenze, Situazione magazzino, Vendite online». **Non è più vero
dal 30/08**: nessun elenco impagina, e il 02/09/2026 il componente `app-pagination` è stato
rimosso perché non lo montava più nessuno.

⚠️ **L'ha trovato il censimento del codice morto, non una rilettura**: cercando i componenti
mai usati è emerso che il paginatore era orfano, e leggendo _perché_ si è scoperto che questa
riga lo dava ancora per vivo. È lo scarto che `regole-qualita` §«Testo morto nelle specifiche»
descrive — un documento che afferma un arretrato già chiuso.

⭐ **Il meccanismo lato API esisteva già** e non è stato inventato per l'occasione:
`UnpagedQueryDto` + `pageWindow` li usano documenti, ordini cliente, ordini fornitore e
inventario dal 21/08. Sui prodotti è bastato aggiungere `all?: boolean` al DTO e sostituire lo
`skip`/`take` scritto a mano.

⛔ **Il rischio, dichiarato**: da ora un elenco lungo è lento davvero, e si vedrà. **È lo scopo**
— ma va detto, perché la prima segnalazione di lentezza non sarà una regressione: sarà la misura
che serviva.

⚠️ **Oggi resta comunque quasi nullo**: nessun cliente usa il gestionale e il catalogo di prova
ha 50 articoli.

Il registro Movimenti non pagina più: entra sugli **ultimi 30 giorni** e «Tutti» è una scelta
esplicita. Resta aperto **cosa succede quando il risultato è molto grande** — e la decisione del
proprietario è di **non fissare ora un tetto**, perché non esistono dati reali su cui tararlo.

## Cosa sappiamo già, misurato

Non serve rimisurarlo: l'evidenza è sufficiente per dire che il DOM tradizionale non scala
all'infinito, e insufficiente per scegliere un numero.

```text
frame Chromium (layout+paint, senza Angular)   28 ms @100 · 102 ms @1.000 · 585 ms @5.000
motore in jsdom (Angular, senza layout)       132 ms @100 · 507 ms @1.000 · 2.597 ms @5.000
selezionare UNA riga                           15 ms @1.000 · 59 ms @5.000 · 134 ms @10.000
peso per riga (misurato su 285 righe vere)     726 B mediana · 843 B p95 · l'API NON comprime
```

⚠️ Il costo che conta **non è il primo disegno**: è ogni tocco successivo, perché il ciclo per
colonna si rivaluta su tutte le righe rese. Ed è quello che l'operatore paga tutto il giorno.

Il metro dichiarato dal progetto è **INP < 200 ms** (`regole-architettura`).

## La strada da valutare, quando servirà

⭐ **Virtualizzazione delle righe**, non caricamento progressivo. La differenza è sostanziale:

|                      |                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtualizzazione** | l'intero risultato filtrato è **già nel client**; nel DOM esistono solo le righe visibili più un piccolo margine. Ordinamento, selezione, export e conteggi continuano a riguardare tutto         |
| **Infinite scroll**  | il client scarica altri blocchi mentre si scorre. ⛔ Molto più invasivo: ordinamento, selezione, export e conteggi dovrebbero rappresentare un insieme di cui **una parte non è ancora arrivata** |

`@angular/cdk` è **già dipendenza** del progetto (`cdk-virtual-scroll` ha oggi zero occorrenze):
sarebbe un candidato naturale, il che **non significa** che sia già scelto.

⚠️ Da verificare prima di adottarla, perché sono le cose che si rompono per prime: la ricerca del
browser (Ctrl+F), la stampa di pagina, l'export dalla vista, «seleziona tutti», l'intestazione
appiccicata e il ridimensionamento colonne.

## ⛔ Cosa NON è deciso

Nessun tetto — **né 500, né 2.000, né altro** — è stato fissato. Il numero va scelto **su dati
reali**, e oggi tutti i tenant sono banchi di prova: 285 movimenti in tutto, 161 negli ultimi
trenta giorni, di cui 106 in un solo giorno.

⭐ **Quando servirà, la forma da imitare è già in casa**: il Registro Corrispettivi conta _prima_
di leggere e risponde «il periodo contiene N righe: restringi le date». Si copia **la forma**,
mai la cifra — il suo 5.000 protegge da un costo di backend che nei Movimenti non esiste, e non
nomina mai il browser.

---

# ✅ La Fattura accompagnatoria scaricava senza avvisare — CORRETTO il 26/08/2026

Trovato chiudendo il passo 1 dell’audit dei flag, e corretto lo stesso giorno su
indicazione del proprietario («non lascerei le cose indietro»).

## Il difetto

I tipi che scaricano giacenza sono **tre** (`DOCUMENT_STOCK_UNLOAD_TYPES`): DDT vendita,
Vendita manuale e Fattura accompagnatoria. I primi due stanno sull’Ordine cliente e
mostravano disponibilità e avviso; la terza **né l’una né l’altro**.

⚠️ Grave perché la regola esclude il blocco: l’insufficienza di stock **avvisa e non
blocca mai**. Escluso il blocco, l’avviso è l’unico presidio — e dove manca, lo scarico
oltre disponibile passa in perfetto silenzio.

## ⭐ Mancava il DATO, non la capacità

La riga condivisa porta `exceedsAvailability` e `availabilityHint` **da sempre**
(`document-line-row.model.ts`). La maschera dei documenti di vendita non teneva i
riepiloghi delle varianti delle proprie righe, quindi non sapeva quanta merce ci fosse.

## Come è stato corretto, e le tre cose che NON si sono fatte

|                    |                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| il **calcolo**     | estratto in `variant-availability.util` — puro, niente rete: l’Ordine cliente lo aveva inline e copiarlo avrebbe fatto la **terza** implementazione dello stesso avviso |
| il **caricamento** | esteso il servizio che già esisteva, `DocumentLineArticleService.summariesByIds` — l’asincrono sta nel service, mai in un util                                          |
| il **gate**        | la riga, non il tipo: `loadsStock`. ⛔ Nessun `if (invoice_accompanying)` in una maschera che la migrazione ha appena reso comune                                       |

⚠️ **Il messaggio è UNO** (`availabilityHintText`). Due copie dello stesso avviso in questo
progetto sono già divergute **su un apostrofo**, e nessun test lo vedeva.

## ⏸ Cosa resta aperto, e non è stato dedotto

- **Trasferimento e Rettifica** riducono anch’essi una giacenza ma **non** stanno in
  `DOCUMENT_STOCK_UNLOAD_TYPES` e passano da un altro meccanismo. Se debbano mostrare lo
  stesso avviso è una **domanda**, non un difetto misurato.
- **Le implementazioni dell’avviso restano tre** — Ordine cliente e documenti di vendita
  ora condividono calcolo e testo, ma la Vendita al banco ha una strada sua (`line.available`
  sulla riga) e il Movimento di magazzino un’altra ancora (`lineExceedsAvailability` locale).
  Unificarle richiede il censimento dei consumatori **prima**, come ogni altra unificazione
  di questo filone.
- **Ordine cliente e Arrivo merce** procurano ancora i riepiloghi **inline**, con un ciclo di
  chiamate e `mergeVariantSummaries`, invece di `summariesByIds`. Seguito meccanico, misurato,
  non incluso qui per non allargare una correzione mirata.

## Filtri per colonna — perimetro misurato il 29/08/2026

Mappa avversariale (7 agenti, 2 di sola smentita), riverificata a mano. Decisioni in
`14` §11.4 e §11.5; qui c'è solo cosa resta da fare.

| Da fare                                                                                                                            | Dove          |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **intestazione fissa**: dare uno scrollport verticale a `.data-table-scroll`                                                       | `14` §11.5 D3 |
| **togliere il tetto di righe** sui sei elenchi col paginatore (clienti, fornitori, prodotti, giacenze, situazione, vendite online) | `14` §11.4    |
| **tre colonne nuove**, spente di serie: Operatore, Controparte, Location                                                           | `14` §11.5 D1 |
| `cellText` non copre `status` e `linkStatus`: il filtro a valori nascerebbe vuoto                                                  | `14` §11.5    |
| `filter: false` sulle 9 pseudo-colonne (`select`, `actions`)                                                                       | `14` §11.1    |
| `filter: 'range'` sulle 11 colonne data: nessuna lo deduce                                                                         | `14` §11.1    |
| escludere le 91 colonne di RIGHE documento dalla filtrabilità                                                                      | `14` §11.5    |
| ✅ ~~portare `corrispettivi-orders-table` e `online-sale-table` sul contratto colonne~~ — **fatto il 30/08/2026**                  | `14` §11.5    |
| veste filtri mobile per sei elenchi che non ce l'hanno                                                                             | `14` §0.2     |
| `filter` in `document-line-columns.consistency.spec.ts:80`                                                                         | `14` §11.5    |
| l'e2e `permissions-owner.spec.ts:143` aggancia `'Filtra per location'` per nome                                                    | `14` §11.5    |
| il commento `data-table.component.ts:48-51` dice ancora «paginati lato server»                                                     | `14` §11.4    |

⚠️ **Da guardare a schermo, non con i test**: che l'intestazione resti davvero fissa
scorrendo un elenco lungo. Un `sticky` che non appiccica non fallisce — non fa niente.

---

## ⏸ Il residuo negativo e il modello ENTRATE / USCITE — 31/08/2026

> _«Registrazione fattura fornitore avrà colonna entrate ed uscite e una delle
> differenze.»_ — proprietario

⭐ **È la forma che risolve il difetto trovato**, e risolve anche perché il
rimedio ovvio non era quello giusto.

### Il difetto misurato

`goods-receipt-workflow.service.ts:1174` calcola

```ts
const outstandingMinor = Math.max(0, totalMinor - settledMinor);
```

e su quel documento **un importo negativo è legittimo**: in Registrazione
fattura entrano anche le **note di credito del fornitore**, e
`save-purchase-invoice.dto.ts` è l'unico DTO monetario del progetto senza
`@Min(0)` — con un test che lo dichiara voluto.

⛔ **Conseguenza**: una nota di credito da −146,40 € risulta **saldata**, e
l'esposizione sommata non scende mai. In quattro punti — colonna, riga totali,
PDF, maschera — tutti coerenti con quello zero e tutti sbagliati.

⚠️ **Aggravante**: le rate hanno `@Min(0)`, quindi la scadenza negativa che
chiuderebbe il conto **non è nemmeno registrabile**.

### Perché «togliere il clamp» NON è la risposta

Un «Ancora da saldare» che scende sotto zero dice una cosa che quella colonna
non significa: sotto zero non c'è nulla _da saldare_, c'è un **credito**. Sono
due grandezze diverse costrette in una colonna sola.

⭐ **Il modello deciso sono TRE colonne**: entrate, uscite, e la differenza fra
le due. Ogni riga contabile sta dalla sua parte, e il saldo è una sottrazione
esplicita invece di un numero che cambia significato col segno.

### Da fare, e da decidere prima

- [ ] verificare **come si tratta contabilmente** un credito verso fornitore
      (indagine chiesta dal proprietario, non ancora fatta)
- [ ] definire che cosa entra in «entrate» e che cosa in «uscite» per la
      Registrazione fattura
- [ ] togliere `@Min(0)` dalle rate, o dichiarare quale altra forma chiude il
      conto
- [ ] ⚠️ **anche gli ORDINI gestiscono i negativi** (indicato dal proprietario):
      il perimetro non è la sola Registrazione fattura

⛔ **Fino ad allora nulla si tocca.** Il clamp resta, e con lui il commento
sbagliato che avevo scritto nella riga totali — «il residuo l'ha già scalato»:
non lo scala, glielo impedisce il clamp.
