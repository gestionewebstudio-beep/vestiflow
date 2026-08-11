# Guardie mancanti e difetti attivi

_Analisi di agosto 2026. Cerca gli **invarianti dichiarati che niente fa rispettare** —
regole scritte in un commento, in una regola di progetto o nello schema, che un umano può
violare senza che compilazione, test o lint se ne accorgano._

## Come leggere questo documento

Ogni voce porta uno **stato di verifica**, e va preso sul serio:

| Stato                | Significato                                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| ✅ **VERIFICATO**    | riaperto e ricontrollato a mano sul codice, con le prove qui sotto          |
| ◻️ **DA VERIFICARE** | risultato dell'analisi, non ricontrollato: **da confermare prima di agire** |

Dieci voci, di cui **tre verificate a mano** — quelle che hanno conseguenze più serie. Le
altre sette sono attendibili ma non confermate: valgono come punti di partenza, non come
fatti.

> **Il criterio di accettazione che ne esce**, e vale come regola di revisione:
>
> **Una correzione è finita quando il test parla della regola, non del caso che l'ha
> fatta scoprire.** «Il campo X non viene azzerato» è l'istanza. «Nessun campo che
> l'importazione non ha letto viene azzerato» è la regola. La prima si riscrive fra sei
> mesi; la seconda no.

---

## 1. ✅ Il backend non passa da nessun controllo automatico

**VERIFICATO.** È il punto che va per primo, perché non aggiunge una guardia: accende
l'interruttore che rende reali tutte le altre.

Controllato uno per uno:

- `npm run lint` = `ng lint && check:tokens && check:subscriptions && check:table-views`
  — **tutto frontend**. Non chiama mai il lint dell'API.
- `api/package.json` **ha** uno script `lint` (`eslint "src/**/*.ts"`), ma **nessuna
  pipeline lo invoca**.
- **Non esiste alcun typecheck per l'API**: gli unici script sono `lint` e `lint:fix`.
- `lint-staged` (package.json) copre `src/**`, `e2e/**`, `playwright.config.ts` —
  **non** `api/**`.
- `.github/workflows/ci.yml`: lint frontend, test frontend, test componenti, **test API**,
  build frontend. **Nessun lint API, nessun typecheck API, nessuna build API.**
- I test API girano con Vitest, che traspila senza controllare i tipi: **un errore di tipo
  passa**.

**L'unica macchina che compila il backend è il Dockerfile di Railway** — cioè al deploy,
a valle della revisione.

**Conseguenza dimostrata:** è il motivo per cui il difetto `lineNetExactMinor` (commit
`2a397de`) ha rotto il salvataggio di ogni documento per due giorni senza che nulla se ne
accorgesse. E rende inutili le guardie _di tipo_: se nessuno compila il backend, un errore
di compilazione non ferma niente.

**Cosa manca: la chiamata, non lo script.**

1. aggiungere `"typecheck": "tsc --noEmit -p tsconfig.json"` in `api/package.json`
2. estendere `lint` in `package.json` con `&& npm run lint --prefix api && npm run typecheck --prefix api`
3. aggiungere `api/**/*.ts` a `lint-staged`
4. in `ci.yml` spostare l'installazione delle dipendenze API **prima** del passo di lint
   (oggi è dopo)

**Costo:** un'ora. Entrambi i comandi sono **già verdi oggi**: zero righe da bonificare.

---

## 2. ✅ Il ripristino da backup permette di scalare i privilegi

**VERIFICATO passo per passo**, perché è la voce più grave e la catena poteva cadere in
più punti. Non cade.

### La catena

**Passo 1** — Il ripristino riscrive la riga dell'utente corrente prendendo i campi **dal
file ZIP caricato** (`api/src/tenant/tenant-backup/tenant-backup-import.service.ts`,
intorno a :330):

```ts
const { id: _id, ...rest } = backupSelf;
await tx.user.update({
  where: { id: currentUser.id },
  data: { ...rest, tenantId, id: currentUser.id } as never,
});
```

Viene escluso **solo** `id`. `rest` include **`email`** e **`authUserId`**.

**Passo 2** — Il riconoscimento dell'amministratore di piattaforma legge l'email **dal
database**, non dal token verificato (`api/src/auth/jwt-auth.guard.ts:94`):

```ts
const appUser = toUserProfileDto(user, this.platformAdmin.isPlatformAdmin(user.email));
```

dove `user` è la riga letta dal database.

**Passo 3** — Il riconoscimento è un puro confronto di stringa
(`api/src/common/platform-admin/platform-admin.service.ts`):

```ts
return this.adminEmails.includes(email.trim().toLowerCase());
```

### L'esito

Un **owner di tenant** esporta il proprio backup, modifica la propria email dentro lo ZIP
mettendo quella di un amministratore di piattaforma, reimporta → **diventa amministratore
di piattaforma**. Da lì `GET /admin/tenants` restituisce gli identificativi di tutti i
tenant, e le sessioni di supporto danno accesso ai dati di chiunque.

Il ruolo `owner` richiesto per fare un ripristino non è un ostacolo: **è esattamente il
ruolo di chi fa i ripristini**.

**Precondizione:** conoscere un'email presente in `PLATFORM_ADMIN_EMAILS`. Non è un
segreto — compare nelle comunicazioni di supporto.

**Urgenza:** oggi bassa, perché i tenant sono interni e di test. Diventa alta **il giorno
prima** che entri il primo cliente vero.

### La correzione

La versione economica è una **sanificazione prima dello smistamento**:

- forzare `tenantId` al tenant corrente su ogni riga che ha quella colonna, e rifiutare le
  righe con tenant estraneo
- per l'utente corrente, **vietare esplicitamente** `email`, `authUserId` e `role`: sono
  identità, non dati

Sopra, un test che enuncia la **regola** e non il caso: per ogni entità della lista di
backup, una riga con tenant estraneo non deve mai arrivare alla scrittura.

⚠️ Il test attuale usa un finto database che **butta via** le chiamate invece di
conservarle (`tenant-backup-import.service.spec.ts:12-25`): va sostituito, altrimenti il
nuovo test non può vedere niente.

**Adiacente, stesso file:** gli allegati vengono ricaricati sullo storage usando il
percorso scritto **dentro lo ZIP** (:520-527), e il prefisso di cartella è l'unica
separazione fra i file di tenant diversi. Ricostruire il percorso lato server
(`${tenantId}/` + coda del nome) e caricare senza sovrascrittura.

---

## 3. ◻️ La scrittura `...oggetto` spegne il controllo dei tipi — quattro punti aperti

**DA VERIFICARE.** È la stessa famiglia del difetto `lineNetExactMinor` già corretto, in
altri posti.

Quando si costruisce il pacchetto da scrivere sul database scrivendo i campi uno per uno,
TypeScript segnala subito un campo che non è una colonna. Quando invece si riversa un
oggetto già pronto — `...totals`, `...line` — **quel controllo non scatta**.

| File                                         | Riga      | Cosa                                                                                                                                                      |
| -------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/src/documents/documents.service.ts`     | 942       | `...totals` nella testata; la funzione che li calcola (:3304) dichiara un tipo locale slegato dal database e contiene già una variabile che non è colonna |
| `api/src/store-sales/store-sales.service.ts` | 192 e 353 | `...line` nelle righe di vendita al banco e di reso                                                                                                       |

**Forma:** **tipo**. Vincolare il risultato al modello del database. Il pattern esiste già
in casa: `api/src/admin/tenant-profile.util.ts:5-22`,
`api/src/documents/goods-receipt-workflow.service.ts:918`.

In aggiunta: il test che legge le colonne vere da `Prisma.dmmf`
(`documents.service.spec.ts:319-344`, scritto proprio dopo il bug originale) guarda **solo**
le righe documento — mai la testata, mai la cassa. Va esteso ai tre payload gemelli.

**Gravità:** alta per contesto più che per frequenza — sulla cassa un errore qui blocca il
negozio con lo scontrino già battuto.

---

## 4. ◻️ L'elenco dei campi che la sincronizzazione Shopify possiede

**DA VERIFICARE.**

Un commento dichiara che gli update successivi non toccano i campi dell'operatore perché
non compaiono nell'allowlist `productData` (`shopify-product-pull.service.ts:283-287`), e
lo schema lo ripete. Ma `productData` è un oggetto **senza tipo dichiarato** (:245),
riversato con `...` nella scrittura (:351). Un commento non è una guardia. Il servizio,
per giunta, **non ha nessun file di test**.

Il danno di una violazione è silenzioso: un campo aggiunto per distrazione fa sì che ogni
ri-sincronizzazione riscriva i prezzi decisi a mano.

**Forma:** tipo, con un limite dichiarato onestamente — contro un campo _inventato_ è un
muro; contro un campo che **è** una colonna vera è un **dosso**: chi lo aggiunge
all'elenco passa. Il valore è rendere l'atto esplicito in revisione.

---

## 5. ◻️ `::ng-deep` non è fatto rispettare da niente

**DA VERIFICARE (ma a costo quasi nullo).**

Le regole di stile dichiarano che nell'app non esiste nessun `::ng-deep`. Erano 65, sono
zero — le 7 occorrenze rimaste sarebbero tutte dentro commenti. Ma niente lo impedisce.

Il controllo esistente sui token (`scripts/check-tokens.mjs:82-91`) **percorre già ogni
file `.scss` e ne toglie già i commenti**: mancano cinque righe dentro un ciclo che
esiste. Verde dal primo giorno, nessuna bonifica.

---

## 6. ◻️ Nessun punto d'ingresso senza autenticazione

**DA VERIFICARE.**

Il controllo di autenticazione non è registrato una volta per tutta l'applicazione: è
**ripetuto a mano** su ogni controller. Oggi risulterebbero 30 punti d'ingresso, 28
protetti, 2 legittimamente aperti. Ma un controller nuovo che se lo dimentica **compila,
passa i test e passa il lint**, ed esporrebbe i dati di tutti i tenant senza
autenticazione. Nessun test verifica il rifiuto su rotta non autenticata.

**Forma:** script in `npm run lint`, sullo stile di `check-subscriptions.mjs`: ogni
`*.controller.ts` deve montare il controllo o comparire in un elenco di eccezioni
motivate.

---

## 7. ◻️ Il backup «completo» che non lo è

**DA VERIFICARE — e il danno descritto è serio, quindi va confermato prima di tutto.**

La lista delle entità salvate è scritta a mano (`tenant-backup.constants.ts:9-51`, 41
voci) e nessuno la confronta con lo schema. Risulterebbero **18 entità con dati di tenant
fuori dal backup**, e alcune verrebbero **distrutte** dal ripristino per effetto a catena
(rate di pagamento dei documenti, assegnazioni utente-location) senza tornare indietro;
un'altra (le vendite online) avrebbe un vincolo che fa **fallire** il ripristino.

**Forma:** script in `npm run lint`, ricalcato sulla prima fase di `check-rls.mjs:39-60`
che già sa leggere lo schema. Il caso di maggior valore: far fallire anche quando
un'entità esclusa è legata **a cascata** a una inclusa — è la combinazione che trasforma
un backup incompleto in perdita di dati.

---

## 8. ◻️ Ordine fornitore: una terza copia della formula IVA

**PARZIALMENTE VERIFICATO.** Ho confermato a mano che la maschera Ordine fornitore usa una
formula propria e arrotondata; non ho ricontrollato la misura del 30,5%.

Il calcolo dell'imposta di riga dovrebbe esistere in una sola forma. Le due copie ufficiali
(server e frontend condiviso) sono allineate, e il commento che le accompagna dichiara
**per iscritto** quale forma è sbagliata: `round(nettoArrotondato × aliquota)`
(`api/src/vat/vat-line-calculation.util.ts:129-137`).

La maschera Ordine fornitore fa esattamente quella
(`src/app/features/orders/supplier-order-form.component.ts:375-376`), mentre il server
salva con la formula giusta. **A schermo e nel documento salvato compaiono numeri
diversi.** Misura riportata: 30,5% di combinazioni divergenti su 102.921 casi realistici —
esempio, costo 10,05 con sconto 13% al 22%: a schermo IVA 1,92, salvata 1,93. Nessuno dei
7 test della maschera tocca i totali. L'Arrivo merce **non** è affetto: chiama il calcolo
condiviso.

> Questo si somma a un difetto **separato e verificato** dello stesso file: l'Ordine
> fornitore ha la modalità costi netto/ivato **attiva**, ma le colonne
> `SupplierOrderLine.unitCostMinor` e `enteredUnitCostMinor` sono **intere** e lo scorporo
> è arrotondato — il netto memorizzato è sbagliato di mezzo centesimo.
> Il sintomo visibile però è **uno solo**: riaprendo l'ordine si rivede il valore digitato
> (il form legge `enteredUnitCost`, :906), e il centesimo sbagliato compare solo quando
> l'ordine viene importato in un Arrivo merce. Misurato: correzione **CONTENUTA**, ~10
> punti su 6 file, mezza giornata, valle vuota. Vedi `docs/PREZZI-SHOPIFY-SPEC.md`
> §5-bis e §5-ter.

**Forma:** cancellare il calcolo locale e chiamare quello condiviso (come fa già l'Arrivo
merce), più uno script `check-vat-formulas.mjs` che fallisce se una formula IVA compare
fuori dalle cartelle autorizzate — è ciò che intercetta la **quarta** copia, che altrimenti
nascerà nella prossima maschera.

---

## 9. ◻️ La sincronizzazione Shopify azzera quattro campi che non ha letto

**PARZIALMENTE VERIFICATO.** Ho confermato a mano che il costo d'acquisto dell'articolo
viene azzerato; non ho ricontrollato gli altri tre campi.

L'importazione del catalogo chiede di proposito una versione ridotta dei dati
(`shopify-product-pull.service.ts:142`), che restituisce campi vuoti. Poi li scrive
comunque. L'asimmetria è visibile a occhio nudo, righe adiacenti dello stesso blocco:

```ts
season: enrichment?.season ?? existing?.season ?? null; // :254  conserva
seoTitle: enrichment?.seoTitle ?? null; // :256  AZZERA
```

Stessa cosa per descrizione SEO (:257), collezioni (:258) e **costo d'acquisto
dell'articolo** (:359) — mentre il costo della _variante_, dodici righe sotto, conserva
(:370).

Il costo d'acquisto è alimentato dall'operatore, dai carichi e dall'importazione CSV.
**Un clic sul pulsante di sincronizzazione lo cancella.**

**Prova che è una classe e non un caso:** lo stesso difetto è **già avvenuto** per un altro
campo ed è stato tappato con un aiutante dedicato, il cui commento lo racconta
(`shopify-category-metafields.util.ts:29-32`). È stata corretta l'istanza; la regola non è
mai stata enunciata; gli altri quattro campi sono rimasti scoperti.

**Forma:** il primo file di test di quel servizio, che enuncia la regola — dato un prodotto
esistente valorizzato e l'importazione ridotta che il pulsante produce davvero, il pacchetto
scritto non deve contenere valori vuoti per nessun campo che l'importazione non ha letto.
**Il test fallisce oggi**: è quindi anche la specifica della correzione.

---

## 10. ✅ Il service worker mette in cache l'avvio ma non l'applicazione

_Trovato durante il lavoro sui permessi (11/08/2026), verificato sulla build di
produzione. Non c'entra con i permessi: è annotato qui e lasciato fuori da quel ramo
per scelta esplicita — va corretto con una build e una prova offline vera, non a
occhio._

**Il fatto.** `ngsw-config.json` elenca in `assetGroups` soltanto `index.html`,
`main-*.js`, `styles-*.css`, il manifest e la favicon. La build di produzione emette
**213 file `chunk-*.js`**, e la prima riga di `main-*.js` li importa staticamente:
`import{a as Dt}from"./chunk-5RQIOJQY.js";…`. Il `ngsw.json` generato lo conferma:
**cinque** URL nell'assetGroup «app», duecentotredici file nella cartella.

**Le due conseguenze**, e la seconda è peggiore della prima:

1. **Offline la PWA non parte affatto.** Non è «le rotte pigre non funzionano»: il
   service worker serve `index.html` e `main.js` dalla cache, i moduli che il main
   importa vanno in rete e falliscono. L'applicazione non si avvia.
2. **Dopo una pubblicazione, un client fermo sulla versione vecchia chiede file che
   non esistono più.** Con `outputHashing: "all"` e `navigationRequestStrategy:
"performance"`, chi ha in cache il vecchio `index.html` + `main.js` continua a
   chiedere al server chunk con l'hash di prima: 404, e avvio fallito. È l'unico
   meccanismo nel repository per cui un browser può restare su codice più vecchio del
   server — e produce una pagina che non si apre, non una schermata sbagliata.

**Forma della correzione:** aggiungere i chunk all'assetGroup, e verificare con
`npm run build` seguito da una prova offline reale (DevTools → Network → Offline,
ricaricare). Una verifica statica non basta: il file che conta è il `ngsw.json`
generato, non quello scritto a mano.

**Nota collegata, stesso giro:** `serve:pwa` (`package.json:13`) pubblica il contenuto
di `dist/` senza dipendere da alcuna build. Chi lo lancia da solo serve qualunque
artefatto sia rimasto su disco — e se l'ultima build era `production`, quel bundle
parla con l'API di produzione mentre si crede di provare in locale. La guida operatore
prescrive i due comandi in coppia; il difetto è che nulla lo fa rispettare.

---

## Da rimandare, e perché

**«Ogni entità ha la colonna tenant».** I numeri tornerebbero (6 modelli su 61 senza) ma
la conclusione no: nessuna violazione attiva, e uno script che guarda le _colonne_ non
intercetterebbe il rischio che si teme, che riguarda i _filtri delle interrogazioni_. La
parte che vale è un'altra: **un vincolo di database composto (tenant + documento)** sulle
due entità-riga, così è Postgres a rifiutare la riga col tenant sbagliato — e chiuderebbe
anche l'inserimento cieco del punto 2. Da fare quando si tocca comunque lo schema.

**Il pacchetto prodotto inviato a Shopify non è tipizzato**
(`shopify-product-push.service.ts:366`). Il gemello TikTok fa la cosa giusta, quindi la
convenzione esiste. Ma Shopify **accetta e ignora** gli attributi che non riconosce: un
refuso non fa rumore, e non c'è un danno dimostrato. Si fa quando si riapre quel file.

**La validazione del denaro non distingue interi e decimali**
(`api/src/products/dto/money.dto.ts:14`): un solo controllo permette quattro cifre di
centesimo su **tutti** i campi denaro del prodotto, anche sui due la cui colonna accetta
solo interi (costo d'acquisto e prezzo barrato). Oggi non è raggiungibile — le maschere
arrotondano prima. È una **trappola per domani**: il giorno in cui il costo entrerà nel
selettore netto/ivato, ogni salvataggio con un costo andrà in errore, e i test resteranno
verdi perché il finto database accetta qualsiasi numero.

> ⚠️ Nota importante: qui la correzione che ha risolto il bug originale — **dichiarare il
> tipo di ritorno** — è già applicata e **non serve a nulla**, perché il tipo di un intero
> e quello di un decimale sono lo stesso tipo TypeScript. Questa classe di errore è
> invisibile al compilatore per costruzione: serve il controllo sul dato in ingresso.

**Il prezzo Shopify netto o lordo** era in questa lista come «decisione di prodotto mai
presa». **Non è più da rimandare: è stata presa.** Vedi `docs/PREZZI-SHOPIFY-SPEC.md`.

---

## Il tema — vale più della lista

**a) Una sola scrittura spegne la guardia più forte che il progetto ha.** Il `...oggetto`
riversa i campi di un oggetto in un altro, e in quel passaggio TypeScript **smette di
controllare** che siano colonne vere. Lo stesso vale per `as never`, che è la versione
dichiarata dello stesso spegnimento. È il meccanismo del bug originale, e ricorre in
cinque punti: `documents.service.ts:942`, `store-sales.service.ts:192` e `:353`,
`shopify-product-pull.service.ts:300` e `:351`, `tenant-backup-import.service.ts:344`.

> **Un pacchetto di dati destinato al database si dichiara col tipo del modello, sempre —
> e i campi si scrivono, non si riversano.**

**b) Il backend non passa da nessun cancello, ed è lì che sta tutto.** Dodici delle
quattordici guardie mancanti sono in `api/`. Non è sfortuna: tutti i controlli automatici
che il progetto si è dato guardano il frontend. Il backend è l'unica parte del sistema
dove si può scrivere qualsiasi cosa e scoprirlo in produzione. **È la ragione per cui il
punto 1 va per primo.**

**c) Si corregge l'istanza, non si enuncia mai la regola.** Un commento racconta un bug
identico al punto 9, già capitato e già tappato — **per un campo solo**, mentre altri
quattro restavano rotti nello stesso blocco. Il test scritto dopo il bug originale guarda
solo le righe documento, mentre tre pacchetti gemelli restano scoperti. I due test sul
calcolo IVA sono copiati a mano l'uno dall'altro e lo dichiarano nel titolo — una coppia di
test duplicati non è una guardia contro la divergenza: è la stessa duplicazione un piano
più su.
