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

Quindici voci, di cui **sette verificate a mano** — quelle che hanno conseguenze più serie. Le
altre otto sono attendibili ma non confermate: valgono come punti di partenza, non come
fatti.

**Questo è il registro dichiarato dei difetti generali.** Ci finisce ciò che si trova
lavorando ad altro e che non riguarda il lavoro in corso — altrimenti resta in una chat e
si perde. Non ci va: i difetti dell'integrazione Shopify, che hanno il loro registro
(`01-registro-difetti-shopify.md`), e le cose da fare fuori dal repository — account,
domini, adempimenti — che stanno in `SICUREZZA-PENDENTE.md`, il quale dichiara di
contenere «solo ciò che devi fare tu». Un difetto di codice, anche se è di sicurezza,
sta qui.

_Aggiunte il 13/08/2026, trovate lavorando alla numerazione: la sezione «un secondo
bersaglio» dentro la voce 2, le voci 10, 11 e 12._

_Aggiunta il 15/08/2026, trovata lavorando alla famiglia Fattura: la voce 14._

_Aggiunta il 16/08/2026, trovata chiedendosi perché lo stesso selettore c'è sul DDT e non
sull'Ordine cliente: la voce **15**. Nello stesso giro la voce 8 è risultata **già risolta** —
la nota era rimasta indietro rispetto al codice, ed è segnalata come tale._

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

### La stessa radice, un secondo bersaglio: l'identità fiscale

**VERIFICATO il 13/08/2026.** Non è la riga utente, è la riga **tenant** — e la funzione
è un'altra: `importTenantProfile`
(`api/src/tenant/tenant-backup/tenant-backup-import.service.ts:289-303`).

```ts
const { id: _id, createdAt: _c, ...rest } = row;
await tx.tenant.update({ where: { id: tenantId }, data: rest as never });
```

Esclude `id` e `createdAt`. Tutto il resto entra: **`vatNumber`, `legalName`,
`fiscalCode`, `pec`, `sdiCode`, `iban`**, indirizzo — e anche
`licensedLocationCount`, cioè quante sedi il contratto prevede.

**Perché conta.** Quei campi sono **in sola lettura per l'utente del tenant**: il
controller `tenant-company.controller.ts` espone un `@Get('company')` e **nessun `@Patch`**
del profilo; in Impostazioni la scheda cliente li mostra e basta. Si modificano solo
dall'area operatore di piattaforma. L'import è quindi **l'unica scrittura raggiungibile
dal cliente**, ed è una scrittura totale.

**L'esito:** un owner esporta il backup, cambia la partita IVA — o la ragione sociale, o
l'IBAN che alimenta `DatiPagamento` nell'XML della fattura elettronica — reimporta, e il
gestionale emette documenti fiscali a nome di un soggetto diverso. Nessun controllo, e
nessuna traccia che distingua quel cambio da una configurazione legittima.

**La correzione è la stessa della voce sopra, e questo è il punto:** una lista bianca dei
campi che l'import può scrivere, per ogni entità. Non «escludi `id`», che è la forma
sbagliata — nasconde ciò che passa invece di dichiararlo, e ogni colonna nuova entra da
sola senza che nessuno decida.

Il test deve enunciare la regola: **nessun campo fuori dalla lista bianca arriva alla
scrittura**, per ogni entità del backup. Non «la partita IVA non si sovrascrive», che è
l'istanza.

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

> ✅ **RISOLTO — verificato il 16/08/2026, e la nota qui sotto era rimasta indietro.**
>
> Diceva che `SupplierOrderLine.unitCostMinor` e `enteredUnitCostMinor` sono **intere** e
> che lo scorporo perde mezzo centesimo. **Oggi sono `Decimal(16,6)`**, sia nello schema
> Prisma sia nel database. Il difetto è stato corretto e la nota no.
>
> _Lasciata visibile di proposito: è la prova che una nota invecchia mentre il codice
> cambia. Il 16/08 l'ho citata come fatto attuale senza misurare la colonna — lo stesso
> errore che aveva prodotto la rinomina di «Listino». **Una nota è un indizio, la colonna
> è la verità.**_
>
> Il testo originale, per storia: «l'Ordine fornitore ha la modalità costi netto/ivato
> attiva, ma le colonne sono intere e lo scorporo è arrotondato — il netto memorizzato è
> sbagliato di mezzo centesimo. Il sintomo visibile è uno solo: riaprendo l'ordine si
> rivede il valore digitato, e il centesimo sbagliato compare solo quando l'ordine viene
> importato in un Arrivo merce.» Vedi `docs/PREZZI-SHOPIFY-SPEC.md` §5-bis e §5-ter.

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

## 10. ✅ Il regime fiscale nell'XML è una costante: ogni fattura dichiara RF01

**VERIFICATO il 13/08/2026.** Non è una guardia mancante: è un dato che non esiste, e che
viene comunque dichiarato all'Agenzia.

`api/src/documents/fatturapa-xml.util.ts:78-79`:

```ts
/** Regime fiscale: VestiFlow non lo gestisce, RF01 è il default ordinario. */
const DEFAULT_TAX_REGIME = 'RF01';
```

Scritto senza condizioni dentro `CedentePrestatore` (`:255`). Il commento è onesto — dice
che non è gestito — ma **il file XML non porta il commento**: porta `RF01`, cioè
«regime ordinario», come affermazione dell'emittente.

**Chi ne paga il prezzo.** Un negozio in **regime forfettario** è `RF19`, e la sua fattura
non espone IVA. Emettendola da VestiFlow dichiara un regime che non è il suo. Lo stesso per
minimi (`RF02`), editoria, agenzie di viaggio, agricoltura. È l'unico dei quattro valori
costanti del file che afferma qualcosa di **falso** invece di limitarsi a mancare: la
nazione predefinita `IT` e il codice destinatario `0000000` sono ripieghi corretti quando
il dato non c'è, questo no.

**Non è nel perimetro della numerazione**, e non si corregge con una guardia: manca il
campo. Serve `Tenant.taxRegime` (migration additiva, valore iniziale `RF01` per tutti —
che è il regime della quasi totalità), il campo nella scheda cliente dell'area di
piattaforma accanto a partita IVA e codice fiscale, e la lettura al posto della costante.

**Da decidere quando si aprirà il modulo fattura elettronica**, non prima: è lì che questa
riga smette di essere teorica.

---

## 11. ◻️ Sette difetti minori trovati simulando l'operatore (13/08/2026)

**DA VERIFICARE** salvo dove indicato. Sono emersi percorrendo la giornata di quattro
operatori diversi sulla numerazione e la sede — non leggendo il codice. Nessuno riguarda
il lavoro con cui sono stati trovati: **stanno qui per non perdersi in una chat.**

| #   | Difetto                                                                                                                                               | Dove                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | **Il lock del contatore salta quando il numero è imposto**, quindi chi non ha toccato niente può prendersi il conflitto al posto suo                  | `goods-receipt-workflow.service.ts:430-438` e `:958-964`, `transfer-adjustment-workflow.service.ts:149-155`, `documents.service.ts:888-903` — contro `supplier-orders.service.ts:182` e `manual-sales-orders.service.ts:282`, che lo prendono sempre |
| b   | **Sei maschere su sette non hanno un test sul percorso dell'avviso di conflitto**: l'unico è in `customer-order-form.component.spec.ts:581-634`       | le altre sei non nominano mai `acknowledgeConflictNumber`                                                                                                                                                                                            |
| c   | **L'avviso sbaglia l'elisione**: «è stato messo il 11», «il 8». La forma sbagliata è congelata anche dal test                                         | `document-number-conflict.util.ts:83-84`, `document-number-conflict.store.spec.ts:74`                                                                                                                                                                |
| d   | **L'avviso dice «premi Salva», il pulsante dice «Salva documento»**                                                                                   | `document-number-conflict.util.ts:84-85` contro `goods-receipt-form.component.html:1861`                                                                                                                                                             |
| e   | **Due richieste contatori in corsa all'apertura** dell'Arrivo merce, senza `switchMap` né cancellazione: può vincere la risposta della sede sbagliata | `goods-receipt-form.component.ts:1034` e `:1018-1020`                                                                                                                                                                                                |
| f   | **La tendina Serie e l'ingranaggio sembrano attivi** mentre il cancello di testata li tiene fermi: `select-menu` non ha regole `:disabled`            | `goods-receipt-form.component.html:417-443` + `select-menu.component.scss`                                                                                                                                                                           |
| g   | **Tre nomi diversi per lo stesso campo**: «Location destinazione», «Location di origine», «Sede»                                                      | `goods-receipt-form.component.html:387`, `customer-order-form.component.html:592-594`, e il §1-bis che lo chiama Sede                                                                                                                                |

**Il più serio è (a)**, ed è l'unico con una conseguenza per l'operatore: chi digita un
numero salta il lock, quindi due salvataggi simultanei — uno con numero imposto e uno
automatico — possono incrociarsi, e il conflitto tocca a chi non ha scelto niente. È lo
stesso difetto in quattro punti, ed è già risolto correttamente in due.

**(g) è il più facile e il meno urgente**, ma vale la pena farlo quando si tocca quella
testata: la §1-bis ha scelto «Sede», le maschere non lo sanno ancora.

---

## 12. ✅ La logica scritta in SQL grezzo non è coperta da nessun test

**VERIFICATO il 13/08/2026**, perché è la conseguenza diretta di una scelta presa quel
giorno e va scritta prima che si dimentichi da dove viene.

La suite API gira **tutta su doppioni**: `PrismaService` è sostituito da oggetti che
rispondono a `findMany`, `aggregate`, `$queryRaw`. Per le query costruite con l'API di
Prisma questo basta — il doppione riceve l'oggetto `where`, e un test può verificarlo:
è così che si controlla, per esempio, che il massimo del progressivo guardi la partizione
giusta e i soli documenti di data anteriore.

**Per l'SQL grezzo no.** Il doppione riceve una stringa, e l'unica cosa verificabile è la
stringa stessa — cioè come è scritta la query, non cosa fa. In pratica quella logica è
**scoperta**: se qualcuno mette `<=` dove serve `<`, i test restano verdi perché guardano
il finto database, non quello vero.

### Dove si applica oggi

| Punto                                                     | Cosa fa in SQL grezzo                              |
| --------------------------------------------------------- | -------------------------------------------------- |
| `document-numbering.util.ts` → `primoNumeroLibero`        | il «primo numero libero maggiore di m» del §2      |
| `document-chronology.util.ts` → `findChronologyAnomalies` | i documenti fuori posto del §4 (funzione finestra) |

Entrambi hanno test che fissano la **semantica** — nel secondo il tx finto esegue la regola
in JavaScript — ma nessuno dei due prova l'SQL.

### La previsione si è avverata lo stesso giorno

_Aggiunto il 13/08/2026, poche ore dopo aver scritto la voce._

Questa voce diceva «diventa urgente quando qualcuno tocca una di quelle due, perché non
ha nulla che gli dica se l'ha rotta». Non è servito che qualcuno le toccasse: erano
**già rotte quando sono state scritte**, in due punti, e i test erano verdi.

- **`reference` non esiste su `sales_orders`.** La colonna lì si chiama `order_number`.
  Il commento sopra la query lo diceva — «il riferimento leggibile è `reference` ovunque
  tranne gli ordini cliente» — e la riga sotto selezionava `reference` comunque.
  L'endpoint rispondeva **500** su `customer_order`.
- **La serie vuota non è la serie senza nome.** La maschera manda `series=''`, i
  documenti senza serie hanno `series IS NULL`, e il confronto era `series = ''`. Il
  controllo cronologico **non ha mai guardato la partizione più usata di tutte** — e non
  trovare niente non somiglia a un errore, somiglia a «va tutto bene».

Nessuno dei due si vedeva dai test, e **nessuno dei due si vedeva rileggendo il codice**:
il primo l'ho riletto scrivendoci sopra il commento giusto. Si sono visti chiamando
l'applicazione vera contro il database vero.

**Mitigazione applicata subito**, che non sostituisce la guardia mancante: sei test che
non eseguono la query ma **leggono cosa chiede** — ricompongono il testo SQL dai
frammenti Prisma e verificano tabella, colonna data, colonna riferimento e la forma del
confronto sulla serie. Prendono la classe di errore «hai chiesto la colonna sbagliata»,
che è quella che è capitata due volte. **Non** prendono `<=` al posto di `<`: per quello
serve Postgres.

### Quando diventa urgente

Le tre condizioni di prima restano, ma la prima è già più vicina di quanto sembrasse:

- le query grezze diventano **tre o quattro**: la probabilità che una sbagli in silenzio
  smette di essere trascurabile;
- si aggiunge un caso alla regola (§2 o §4) e va provato sul serio;
- **si tocca una colonna** di `documents`, `sales_orders` o `supplier_orders`: le tre
  tabelle sono nominate in SQL grezzo, e una rinomina non fa arrossare niente.

### Cosa servirebbe

Un test di **integrazione su un Postgres vero** — container effimero o database di prova —
con i casi del §2 (buco tappato lo stesso giorno, buco che resta il giorno dopo, caso
terminale che scavalca) e del §4 (stessa data mai anomalia, numero forzato indietro).

È l'unica strada che prova _davvero_ la regola, ed è la «strada C» già valutata e
rimandata nel §0 di `04-specifica-numerazione-documenti.md`. **Non è lavoro da fare ora:
serve che sia scritto.**

## 13. ✅ Il service worker mette in cache l'avvio ma non l'applicazione

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

## 14. ✅ Il riferimento del documento ha due compositori, e uno non ha seguito il cambio

**VERIFICATO il 15/08/2026** su codice, cronologia git e righe di database.

L'invariante non è nemmeno dichiarato: si dà per scontato che «il riferimento di un
documento si scrive in un modo solo». Ne esistono **due**.

| Dove                                           | Forma                   | Chi la usa                  |
| ---------------------------------------------- | ----------------------- | --------------------------- |
| `api/src/documents/document-totals.util.ts:38` | `PREFISSO[-SERIE]-NNNN` | dodici punti del backend    |
| `api/src/order-reservations/…:618` (privata)   | `PREFISSO-ANNO-NNNN`    | un punto: le vendite online |

La copia mette **l'anno** dove il canonico mette **la serie** — e la riga salva
`series: 'A'` in colonna, quindi la serie c'è ma nella stringa non compare mai.

**La prova che nessuna guardia esiste**: il 28/07 il commit `8b60a7d9` ha tolto l'anno
dalla forma canonica. La copia non ha seguito, e **per diciotto giorni nessuno se n'è
accorto** — trovato per caso il 15/08 misurando altro. I test non mancano: ce ne sono per
entrambe, ed entrambe passano. Nessuno mette in relazione le due, ed è esattamente il
difetto — non sta in nessuna delle due funzioni, sta nel fatto che siano due.

Perché il progetto non poteva accorgersene da solo: le vendite online le genera un
**webhook**, non un operatore, quindi nessuno guarda mentre nascono; e le due forme si
incontrano in un posto solo — la colonna «Documento» dei Movimenti — che è **nascosta di
default**.

**Gravità oggi: bassa.** Il riferimento della vendita online è un'etichetta interna
(`online_sale` e `corrispettivo` sono tipi interni, esclusi per scelta dai Numeratori), e
il registro Corrispettivi ordina sulla colonna intera, non sulla stringa. Nessun conto
sbagliato.

**Gravità domani: è il punto.** `04-…§11` toglierà sigla e zeri dal numero visibile di
tutti i documenti. Se si cambia la sola funzione canonica succede la stessa cosa del
28/07, ma peggio: i documenti diventano `5`, le vendite online restano `VO-2026-0005`, e
le due forme oggi simili diventano irriconoscibili.

**Forma della correzione — e attenzione a non sbagliare bersaglio.** Per la vendita online
la risposta **non** è allineare la forma: quel numero non deve esistere (`04-…§8`, dove il
numero del canale che lo sostituisce è già in tabella). Ciò che va aggiunto qui è la
guardia: uno script che fallisce se un riferimento documento viene composto fuori dalla
funzione unica — la stessa forma di `check-vat-formulas.mjs` proposto al punto 8, e per la
stessa ragione: è ciò che intercetta la **terza** copia, non la seconda.

> ⚠️ **Classificazione, fissata il 15/08.** `online-sale-fulfillment.service.ts` **non** va
> registrato come «secondo formatter da uniformare»: è un **residuo del vecchio modello di
> numerazione della Vendita online**, da riesaminare nell'esecuzione di `04-…§8`. Questa
> voce riguarda la **guardia mancante** — l'invariante «un solo compositore» che niente fa
> rispettare — e resta valida anche dopo che quel file sarà sparito, perché il rischio non
> è quel file: è il prossimo.

**Adiacente, stessa radice, trovato nella stessa misura:** esistono **due funzioni con lo
stesso nome** in due file — `nextDocumentNumber` in `document-numbering.util.ts:310` (viva,
`max+1` sui documenti reali) e in `document-totals.util.ts:17` (il vecchio
`documentSequence.upsert`). La seconda **non ha nemmeno un chiamante**: zero riferimenti in
tutto `api/src`, neanche un test. È codice morto che porta il nome di codice vivo — chi
cerca «dove si assegna il numero» ha una probabilità su due di leggere il motore sbagliato.
Va rimossa **insieme** alla tabella `DocumentSequence`, non prima.

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

---

## 15. 🔴 Sette colonne di prezzo unitario non sono nella forma canonica

**VERIFICATO il 16/08/2026** sul database, colonna per colonna. Non è un'ipotesi: è la mappa completa di ogni colonna di denaro dello schema.

La regola è ora scritta in `regole-gestionale` → «La colonna è una, i comportamenti sono tanti»: **ogni prezzo o costo unitario è `Decimal(16,6)`, i totali sono interi**. Queste sette non la rispettano.

### Chi è a posto, e perché il confronto vale

**14 colonne sono già canoniche** — e sono esattamente i prezzi e costi _unitari_: `document_lines.unit_price_minor`, `entered_unit_cost`, `unit_cost_net`, `unit_cost_gross`, `unit_vat_amount`, `product_variants.selling_price_minor`, `shopify_price_minor`, `products.selling_price_minor`, `shopify_price_minor`, `listino1..3_price_minor`, `supplier_order_lines.unit_cost_minor`, `entered_unit_cost_minor`.

**65 sono intere, e quasi tutte giustamente**: `subtotal`, `tax`, `total`, `line_total`, `amount` sono **totali**, e il totale si arrotonda al centesimo per regola.

### Le sette fuori norma

| Colonna                                                                   | Cos'è                                                                        | Chi la legge (punti da rivedere) |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| **`sales_order_lines.unit_price_minor`**                                  | il prezzo digitato al cliente                                                | ~25                              |
| `products.purchase_price_minor` · `product_variants.purchase_price_minor` | costo d'acquisto                                                             | ~42                              |
| `products.compare_at_price_minor`                                         | prezzo barrato                                                               | ~17                              |
| `stock_movements.unit_cost_minor`                                         | costo del movimento                                                          | ~25                              |
| `supplier_variant_links.last_purchase_price_minor`                        | ultimo prezzo pagato                                                         | ~9                               |
| `online_sale_lines.unit_price_minor`                                      | prezzo da canale — **caso a parte**, arriva da Shopify come stringa decimale | —                                |

_I conteggi escludono i punti già avvolti in `Number(...)`, che reggerebbero il cambio senza modifiche._

### Il sintomo che l'ha fatta emergere

L'**Ordine cliente non ha il selettore netto/ivato**, mentre il DDT — stessa maschera, stesso componente — ce l'ha. Non è una scelta di interfaccia: il DDT scrive su `Document`, che la coda decimale ce l'ha; l'Ordine cliente scrive su `SalesOrder`, che non ce l'ha. Digitare **25,00 ivato** al 22% dà **20,491803…** netto: su una colonna intera diventa `2049`, e rimostrato ivato torna **24,9978**.

### Perché non si fa tutto in un colpo

**La migration è banale** — `ALTER COLUMN ... TYPE numeric(16,6)` è una conversione senza perdita, e le tabelle sono minuscole: 59 righe ordine, 250 prodotti, 438 varianti, 179 movimenti, 23 link, 8 righe online.

**Il costo è il codice**: `Int → Decimal` cambia il tipo TypeScript da `number` a `Prisma.Decimal`, e ogni uso aritmetico non avvolto in `Number(...)` smette di compilare. Sono **~118 punti** su aree scorrelate fra loro — ordini, prodotti, movimenti, link fornitore.

**Vanno quindi affettate**, una colonna (o una coppia coerente) per commit, ognuno con albero valido e verificato. La prima fetta naturale è `sales_order_lines.unit_price_minor`: è la più piccola (~25 punti, tutti in `sales-orders/`), è autoconclusa, e **sblocca una funzione visibile** — il netto/ivato sull'Ordine cliente.

⚠️ **Nessuna migration è stata scritta né applicata.** Il database è condiviso: si scrive a mano e si applica solo su via esplicito.

### Un dato che ridimensiona l'urgenza, senza toglierla

Delle 137 righe documento già su `numeric(16,6)`, **una sola** ha davvero una coda decimale. Il difetto è quindi **latente**, non attivo: si manifesta quando qualcuno digita ivato, e nei dati di prova è successo una volta. Ma la regola esiste perché a regime, con aliquota 22%, **un prezzo su cinque** perde un centesimo.

---

## 16. 🟡 Una colonna esiste, il codice la scrive, e nessuno l'ha mai esercitata (16/08/2026)

`documents.source_document_id` è nello schema dal 1º luglio, è indicizzata, ha la sua foreign
key — ed è **NULL su tutti i 105 documenti del database**.

⚠️ **Questa voce è già stata corretta una volta, lo stesso giorno.** Era intitolata «nessuno la
scrive», ed era falsa: il percorso c'è tutto — `convertPrefill` restituisce l'id dell'origine,
la maschera lo conserva e lo rimanda nel corpo del create, il DTO lo accetta, il servizio lo
persiste. Avevo dedotto «mai scritta» da «sempre vuota», che è esattamente l'errore che questo
documento raccoglie.

**La causa vera è più interessante della prima.** Nel database non esiste **un solo documento
nato da una conversione**: le uniche previste sono Proforma → Fattura e DDT → Fattura/Proforma,
e nessuno le ha mai salvate. I documenti collegati che ci sono nascono da **inclusione** o da
**Concludi ordine**, e né l'una né l'altro passano di lì.

**Perché resta una guardia mancante.** Un percorso completo, compilato, tipizzato e **mai
percorso** non è più affidabile di uno assente: è solo più convincente. La colonna vuota si
comporta come una piena — la query riesce, il tipo torna, i test passano — e un elenco «note di
credito nate da questa fattura» risponderebbe **«nessuna»** per ogni fattura senza sbagliare una
riga di SQL.

**La stessa classe, trovata nella stessa misura:**

- `document_lines.line_source` — **NULL su tutte le 137 righe**;
- `documents.reference` — valorizzata su tutte, ma **non contiene ciò che il nome promette**: è
  il numero del documento stesso, non un riferimento a un altro documento. Peggiore della
  colonna vuota, perché chi la legge ottiene una stringa sensata.

**Le due guardie che mancano**, e sono distinte:

1. un controllo periodico che elenchi le **colonne dichiarate e mai popolate** — non deve
   fallire la build, una colonna nuova è legittimamente vuota il primo giorno, ma deve
   **comparire**: oggi l'unico modo di saperlo è interrogare il database a mano;
2. un test che **percorra almeno una volta** ogni cammino documento→documento fino alla
   persistenza. Il primo controllo dice che la colonna è vuota; solo il secondo dice se il
   codice che dovrebbe riempirla funziona.

**Non si sta proponendo di rimuoverla.** `sourceDocumentId` serve, ed è il punto di partenza del
blocco «Collegamenti Fattura ↔ Nota di credito» — dove ora si sa che va **collegato a una coppia
origine→destinazione nuova**, non costruito da zero.
