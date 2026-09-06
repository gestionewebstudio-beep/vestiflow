# Cosa portare al collega prima del merge

Ramo `bugfix/numerazione-documento`: **186 commit, 439 file, +45.798/−9.514 righe** rispetto
alla base comune con `main` (`c4044d98`).

Non è una lista di file: è cosa c'è da dirsi. Compilato il 13/08/2026 leggendo il diff e i
rami remoti, non eseguendo l'applicazione. Dove una cosa è dedotta e non misurata, è detto.

---

## 1. Chi incrocia chi — misurato, non supposto

Verificato con `git merge-base --is-ancestor` e `git diff --name-only` sui ref remoti.

| Ramo                          | Commit fuori          | Merge-base | File in comune | Verdetto                     |
| ----------------------------- | --------------------- | ---------- | -------------- | ---------------------------- |
| `feature/listini`             | **0**                 | —          | —              | **è già dentro questo ramo** |
| `bugfix/righe-documento`      | **0**                 | —          | —              | **è già dentro questo ramo** |
| `feature/fattura-elettronica` | 1 (`7866b80f`, 07/08) | `a6968b5c` | 15             | **il rischio più grande**    |
| `feature/cassa`               | 5                     | `a6968b5c` | ~10            | conflitto certo ma banale    |
| `origin/develop`              | **9** (11–13/08)      | `c1e57e07` | 47             | **nessuno lo nominava**      |

**Due preoccupazioni si tolgono dalla lista.** `feature/listini` e `bugfix/righe-documento`
non sono rami concorrenti: sono **antenati** di questo ramo, entrati col merge di develop
`db6e0510`. Con loro non c'è niente da unire. Il rischio, con quelli, è solo che qualcuno
ci scriva sopra **da adesso in poi**.

**Una preoccupazione si aggiunge, e non era nell'elenco di nessuno.** `origin/develop` è
**9 commit avanti** con il lavoro sui permessi a sezioni (11–13 agosto, il ramo più recente
di tutti). Tocca 34 file di `features/` — comprese **tutte e sei** le maschere documento —
e 13 file di `api/src`. È probabilmente la prima conversazione da fare, non l'ultima.

⚠️ **Freschezza dei dati.** I ref remoti di `cassa` e `fattura-elettronica` sono fermi al
07/08; l'ultimo fetch è del 13/08 alle 16:36. Se il collega ha lavoro non pubblicato, qui
non si vede. Tutto quanto segue vale per ciò che sta sul remoto.

---

## 2. I punti caldi, in ordine

### 2.1 · L'indice unico e la Nota di credito — collisione **certa**, e dopo il merge **muta**

Il ramo del collega aggiunge `credit_note` all'enum `DocumentType`
(`20260807020000_credit_note_document_type`) e nel suo `document-type.util.ts:41` la mappa
sul numeratore della fattura — il suo stesso commento dice «Condivide il numeratore con le
fatture, come l'accompagnatoria».

Questo ramo ha ricostruito `documents_number_unique` come indice **di espressione**, con un
`CASE` che copre **solo** `invoice_accompanying`
(`20260811090000_numero_unico_per_numeratore`).

**All'unione**: la Nota di credito condivide il numeratore nel codice ma **non nel
database**. Una Fattura 7 e una Nota di credito 7 potranno coesistere — che è esattamente
il difetto per cui quella migration è stata scritta, reintrodotto dal merge.

Serve una **terza migration al momento dell'unione**, che ricostruisca l'indice col
`credit_note` dentro il `CASE`, dopo aver verificato che nel database non esistano già
collisioni. La migration lo aveva previsto per iscritto: «Se un domani un altro tipo
dovesse condividere il numeratore, va aggiunto QUI oltre che in `documentNumberingType`».

**Non lo trova nessun test e nessun lint.** È il punto da mettere per primo.

### 2.2 · Due funzioni gemelle nello stesso file

Nel medesimo `api/src/documents/document-type.util.ts`:

- noi aggiungiamo `documentNumberingTypes(type)` — tutte le letture della partizione la usano;
- loro aggiungono `documentNumberingTypeSet(type)` — stessa cosa, nome diverso.

E in `document-numbering.util.ts` **riscrivono la stessa riga** di `lastAssignedNumber` che
riscriviamo noi (loro col loro set, noi col set nostro **più** il filtro per data del §2).
Il merge deve scegliere un nome, non tenerne due.

### 2.3 · I Corrispettivi di cassa — stessa correzione, fatta due volte

Verificato: `feature/cassa` e questo ramo hanno reso nullabili **le stesse quattro
proprietà** di `CorrispettivoEntryRow` (`onlineSaleId`, `onlineSaleReference`,
`salesOrderId`, `orderNumber`) e hanno introdotto **la stessa costante** `API_SOURCE_STORE`,
in modo indipendente e con commenti diversi. Conflitto certo, risoluzione banale — a patto
che nessuno lo risolva «tenendo il nostro» alla cieca.

Il contesto vale più del conflitto: la loro migration `20260806233000` ha già tolto il
`NOT NULL` **sul database condiviso**, e il nostro `schema.prisma` si allinea a ciò che il
database **è**, senza una migration propria. È il caso concreto della regola: finché le
migration sono additive due rami convivono; la prima che toglie o restringe li rompe a
vicenda.

### 2.4 · La maschera Fatture, riscritta da entrambi

`sales-document-form` è la maschera che il progetto dichiara **congelata** perché
`feature/fattura-elettronica` la sta riscrivendo. Il loro commit la modifica di +180 righe
nell'HTML; **questo ramo la modifica di +846**. È il conflitto testuale più grosso del
ramo, e non c'è modo di renderlo piccolo: va deciso chi riparte da chi.

Vale anche per `purchase-invoice-form` (+138 righe da parte loro) e per i due file di
innesto in `domain/`: `document-counter.model.ts` e `document-api.mapper.ts`.

### 2.5 · Quello che git **non** segnala

Tre movimenti che passano il merge senza un conflitto e rompono la compilazione dopo:

| Cosa                                                 | Da                   | A                            |
| ---------------------------------------------------- | -------------------- | ---------------------------- |
| `DocumentEditLockService`                            | `shared/services/`   | `domain/documents/services/` |
| `location-suggestion-hint` (3 file)                  | `shared/components/` | **rimosso**                  |
| `OperationalLocationsService.suggestedWriteLocation` | —                    | **rimosso**                  |

Chi li importa dal vecchio percorso non conflitta: il merge riesce, e `tsc` fallisce dopo.
È il caso descritto in `regole-qualita.md` — «una rinomina da una parte e una chiamata
dall'altra non producono conflitto testuale». Vale in particolare per
`feature/fattura-elettronica`, che riscrive due maschere che quel servizio lo usano.

### 2.6 · Dodici migration da applicare al database condiviso

Dalla `20260807120000` alla `20260813160000`, tutte additive, nessuna rimossa. Si applicano
con `npm run prisma:deploy`. Le due più recenti sono di questo lavoro: l'indice composito
per la proposta per data e la tabella della preferenza sull'avviso cronologico.

---

## 3. Cosa il ramo tocca **fuori** dalla numerazione

Su 72 temi censiti, **49 non riguardano la numerazione** e 9 sono misti. In ordine di quanto
si vedono usando il gestionale.

**Le righe documento — è il blocco più grosso del ramo.**

- **Le due viste diventano esclusive.** Prima la tabella non veniva rimossa sotto la soglia,
  solo nascosta col CSS: ogni riga esisteva **due volte**, `getElementById` trovava quella
  invisibile e `.focus()` diventava un no-op silenzioso. Nasce `ViewportService` con una
  soglia unica.
- **La card di riga è una sola** per tutti i documenti: il componente dà la forma, quello che
  cambia entra come contenuto proiettato, non come interruttore.
- **Il campo codice confronta invece di cercare**: si digita, si conferma, e la conferma ha
  tre esiti (uno, più d'uno, nessuno). Cade il ripiego per cui digitando «100» uscivano i
  «Jeans 100 slim».
- **Codice IVA e Unità di misura** passano a una cella a ricerca-e-selezione: un `<input>`
  vero, quindi rientra nel giro del Tab — prima, essendo un `<button>`, ne era fuori.
- **Riordino righe** per trascinamento e per contenuto di colonna, colonna `#` su tutte e sei
  le maschere, con conferma prima di rinumerare.
- **Pulsante Colonne e larghezze** ricordate per utente; le intestazioni si fermano a due
  righe.
- **Tastiera e fuoco** in un punto solo, con l'ordine dei campi che arriva come dato.

**Le maschere.**

- **Fatture**: riga articolo come tutte le altre, Colonne, riordino, card sotto la soglia,
  Codice IVA nuovo. _(Vedi 2.4: è il perimetro congelato.)_
- **Magazzino** (Trasferimento, Rettifica, Registra movimento): erano rimaste indietro su
  tutto — riga, card, blocco testata, colonne condivise.
- **Ordine fornitore**: cinque lacune colmate — allegati, sconto extra di chiusura, ordine
  delle righe persistito, sede di destinazione, decimali del costo. **È il blocco più
  isolato del ramo: nessun altro ramo tocca quei file. Buon candidato a essere unito per
  primo.**
- **La testata governa le righe**: finché mancano i campi obbligatori, le righe non si
  mostrano — stato vuoto che dice cosa manca, e il campo si segna con una tinta d'attesa
  (terracotta, non il rosso dell'errore).
- **Il documento riaperto nasce protetto**, con banner di sblocco.

**Fuori dai documenti.**

- **Shopify**: la connessione dichiara _quali_ webhook ha e verso dove, non più «7 attivi»;
  «Disconnetti» **sospende** invece di cancellare (prima cancellava sessioni, giacenze,
  movimenti e ordini per sede, anche di articoli mai stati su Shopify); ordini spariti dal
  canale segnalati e impegni liberati; riconciliazione dell'inventario.
- **Unità di misura**: elenco per tenant, suggerito e non imposto.
- **Ricerca prodotti**: per barcode/EAN e per codice fornitore.
- **Routing**: guard in `core/`, due guard morti rimossi, titoli centralizzati, ESLint che
  vieta anche gli `import()` dinamici cross-layer.

---

## 4. Due documenti che dicono il contrario del codice

Trovati durante l'inventario, **non corretti**:

1. `docs/03-specifica-unificazione-righe-documento.md` §4.11 (riga 525) dice ancora che la
   maschera Fatture «non si tocca adesso» e che la vista a card è «assente». Tre commit del
   12/08 l'hanno riscritta comunque. L'ultimo tocco a quel documento è **precedente** a
   quei tre commit.
2. `docs/04-specifica-numerazione-documenti.md:243` dice «Da implementare» per il campo Sede
   su `sales-document-form`, che invece **c'è** (`sales-document-form.component.html:307`).
   La riga 836 dello stesso documento racconta il difetto trovato e corretto **su quel
   campo**: il documento si contraddice al suo interno.

---

## 5. Cosa questo inventario **non** copre

- Non è stata eseguita l'applicazione, né i test, né una build: è lettura di codice e di
  `git`. Dove il comportamento a runtime è affermato, viene dai messaggi di commit e dal
  codice, non da una prova.
- I rami remoti sono quelli pubblicati. Il lavoro locale del collega non è visibile.
- Non si sa quale persona stia dietro a quale ramo: tutti i commit remoti sono dello stesso
  account.
