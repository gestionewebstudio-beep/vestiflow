# 21 · Scope Location — esito del Passo 5

**Data:** 28/08/2026
**Perimetro:** autorizzazione di sede sugli accessi per ID nel backend.
**Stato:** ⛔ **chiuso.** Nessun altro audit di sicurezza è in corso.

> **La regola che il Passo 5 ha reso vera:** conoscere un ID non concede alcun
> diritto. Filtrare un elenco è ergonomia; autorizzare è rifiutare la richiesta
> diretta per ID.

⚠️ **Questo documento è lo stato finale.** La misura di partenza sta in
`19-audit-ordine-cliente-manuale.md`, che è **congelato** e non si riscrive: serve
a rispondere alla domanda «era già così?», e perde quel valore se lo si aggiorna.

---

## 1. Il quadro

|                                           |                          |
| ----------------------------------------- | ------------------------ |
| Vulnerabilità confermate dal doppio cieco | **6**                    |
| Corrette e falsificate                    | **6**                    |
| Falsi positivi del censimento             | **3**                    |
| Percorsi verificati e già protetti        | **8**                    |
| ⏸ Policy non decise                       | **8**                    |
| Guardia architetturale                    | **1**, in `npm run lint` |

---

## 2. ⛔ Le sei vulnerabilità corrette

Tutte della stessa forma: un ID arriva dal client, nessun predicato lo confronta
con l'ambito dell'utente — **mentre il selettore che alimenta quel campo è già
filtrato**.

| #   | Punto d'ingresso                                                                    | Cosa poteva fare                                                                                                            | Politica  |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | `GET /inventory/reservations`                                                       | leggere gli impegni di qualunque sede: ordine, canale, quantità, SKU                                                        | lettura   |
| 2   | `GET /store-sales/lookup`                                                           | la cassa di un negozio leggeva Giacenza/Impegnata/Disponibile di ogni altra sede                                            | lettura   |
| 3   | `GET /online-sales/:id` · `/by-order/:id`                                           | righe, movimenti e perfino il **nome della sede** di un magazzino non proprio                                               | lettura   |
| 4   | `PATCH /documents/:id`                                                              | ⛔ **scrittura**: aprire un proprio documento della sede A, salvarlo con sede B, e muovere il magazzino di B                | scrittura |
| 5   | `POST` · `PATCH /supplier-orders`                                                   | creare ordini nel contesto di una sede altrui, e spostarci quelli esistenti                                                 | scrittura |
| 6   | `linkedGoodsReceiptId` · `linkedSalesDdtIds` · `supplierOrderId` · `import/preview` | agganciare per ID documenti di sedi non proprie e leggerne i dati economici; l'anteprima import come oracolo di Disponibile | lettura   |

### Tre forme, non una

⭐ **La distinzione è utile perché porta a correzioni diverse:**

|                         |                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **la guardia morta**    | il predicato è scritto, commentato, coperto da test verdi — e **inerte**, perché `user?` è opzionale e il controller non lo passa. Casi 1, 2, 3 |
| **la guardia assente**  | la sede non è nemmeno selezionata dalla query. Caso 6                                                                                           |
| **la guardia parziale** | il controllo c'è ma copre lo stato **persistito**, mentre la scrittura avviene su quello **risultante dal DTO**. Casi 4 e 5                     |

⚠️ **Nella prima forma i test del servizio erano verdi.** In due casi su tre
esisteva perfino una prova che codificava il buco come contratto — _«senza utente
le chiamate interne passano»_ — dove chiamanti interni non ce n'erano. Quelle
prove sono state riscritte, con la ragione al loro posto.

---

## 3. ✅ I falsi positivi, e perché contano

Su nove punti verificati a mano, **tre non erano difetti**. Vale la pena
registrarli: un elenco consegnato senza verifica sarebbe stato per un terzo
sbagliato, in entrambe le direzioni.

| Segnalato                                             | Realtà                                                                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentAttachmentsService` — «stesso identico buco» | ⛔ **falso.** Il controllo c'è, nel **controller**: tutte e sei le rotte passano da `getById` (lettura) o `assertWritableById` (scrittura). Avevo letto il servizio senza aprire i chiamanti                                                       |
| `PATCH /documents/:id` — «falso allarme»              | ⛔ **la smentita era sbagliata.** Il rilievo diceva una cosa più sottile: autorizza la sede vecchia e scrive nella nuova. È il difetto #4                                                                                                          |
| `POST /inventory/levels/import`                       | ✅ **PROTETTO** — e la divergenza si spiega: un analista guardava la scrittura (protetta da `registerMovement`), l'altro la lettura dei livelli (scoperta). Avevano ragione entrambi su metà, e la metà mancante l'ha chiusa il fix dell'anteprima |

---

## 4. ⏸ POLICY NON DECISE — non sono bug aperti

> ⛔ **Nessuna di queste è una vulnerabilità residua.** Sono domande di prodotto:
> il comportamento corrente è misurato e intenzionalmente **non** modificato.
> Chi le rilegge fra sei mesi non deve scambiarle per lavoro rimasto indietro.

| #   | Domanda                                                                                                                         | Comportamento oggi                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Registro Corrispettivi** — è un registro economico _aziendale_ o _per sede_?                                                  | non scopato: cinque rotte, nessuna riceve l'utente                                                                                       |
| 2   | **Le tre mutazioni sugli Ordini fornitore** (`PATCH` gate, `cancel`, `delete`) devono chiedere la scrittura o basta la lettura? | passano da `getById`, quindi **lettura**. I Documenti usano invece lettura **+** scrittura: l'asimmetria è misurata, non decisa          |
| 3   | **Record senza Location** — leggibile da chiunque abbia il permesso di modulo?                                                  | passa: è il contratto dichiarato del predicato                                                                                           |
| 4   | **Destinazione dei trasferimenti** — l'esenzione è voluta?                                                                      | `assertLocationInUserScope` esce sempre su `transferDestination`                                                                         |
| 5   | **Anagrafica sedi** (`GET /inventory/locations`)                                                                                | restituisce tutte le sedi del tenant. Distinguere «conoscere che esiste» da «poterla usare»                                              |
| 6   | **Anteprima import** — deve usare la politica di **scrittura** dell'import vero?                                                | usa la **lettura**, che è il pavimento documentato (`T15` §12: «sola lettura»)                                                           |
| 7   | **Numeratori e anteprima numerazione**                                                                                          | il numeratore è `tenant + tipo + serie`, **non** la Location. La Location filtra quali Serie sono usabili, non partiziona il progressivo |
| 8   | **Sync inventario Shopify**                                                                                                     | processo tenant-level: il perimetro sono le Location **mappate**, non quelle personali di chi lo avvia                                   |

⚠️ **Su §1 il criterio è stato posto dal proprietario e non è ancora deliberato:**
un registro scopato fa esistere **N totali diversi per lo stesso periodo**; uno non
scopato mostra al commesso l'incasso di tutte le sedi. **La decisione non è
frazionabile**: filtri, righe, riepilogo, stampa ed export devono muoversi insieme.

---

## 5. ⭐ La guardia architetturale

`scripts/check-location-scope.mjs`, dentro `npm run lint`.

⛔ **Non cerca `assertLocation…` dentro i servizi.** Cercarla non avrebbe trovato
niente: c'era, in tutti e quattro i casi. **Il difetto sta al confine
controller → servizio**, ed è lì che la guardia guarda.

```text
R1 · un metodo di servizio RAGGIUNTO DA UN CONTROLLER che applica uno scope di
     sede non può dichiarare l'utente opzionale.  →  cricchetto, 14 in baseline
R2 · la rotta che lo chiama deve DICHIARARE @CurrentUser() e PASSARLO.
     →  errore duro, e oggi è a zero
```

**Come distingue senza falsi positivi:** parte dai controller e segue le chiamate.
Un metodo che nessuna rotta raggiunge non la riguarda — quindi i servizi interni
non sono costretti a ricevere utenti finti. I casi di sistema veri si dichiarano
col marcatore `@scope-location system`, e la deroga si vede in revisione.

⚠️ **La baseline è un cricchetto, non un condono.** I 14 metodi elencati **non
sono vulnerabilità** — le rotte che li chiamano l'utente lo passano. Sono la
_condizione_ che ha reso possibili i quattro difetti. Un metodo nuovo non entra
nella lista: fallisce. E se uno viene stretto, la guardia **pretende** che sia
tolto dalla baseline: una baseline che non si accorcia comincia a coprire difetti
veri.

**Falsificata su quattro comportamenti**, tutti verificati rossi:
rotta che non propaga · firma nuova con utente opzionale · baseline invecchiata ·
deroga esplicita che deve invece passare.

---

## 6. Verifica finale

```text
212 file · 2218 test API verdi
tsc            0 errori di produzione
nest build     pulito
eslint         pulito
npm run lint   14 guardie verdi, inclusa check:location-scope
```

⭐ **E non basta che siano verdi.** Tutti e sei i pattern corretti sono stati
rifalsificati reintroducendo il difetto specifico:

| Difetto reintrodotto                     | Prove rosse |
| ---------------------------------------- | ----------- |
| ID diretto fuori scope (impegni)         | 1           |
| mancata propagazione dell'utente (cassa) | 2           |
| cambio Location via `PATCH`              | 4           |
| relazione verso documento fuori scope    | 6           |
| array di ID con uno solo fuori scope     | 4           |
| anteprima usata come oracolo di giacenza | 3           |

---

## 7. Rischi residui

⚠️ **Il censimento ha coperto il backend di oggi, non quello di domani.** La
guardia è ciò che tiene la linea da qui in avanti, ma copre il pattern trovato —
non forme che nessuno ha ancora inventato.

⚠️ **Molte prove positive asseriscono «il gate non rifiuta», non «funziona».** Dove
i mock non reggono un salvataggio completo, l'asserzione è più debole di quanto il
conteggio suggerisca. Le prove che valgono davvero sono quelle **negative**, e
quelle sono solide: lo dimostra la rifalsificazione qui sopra.

⭐ **Le 14 firme con utente opzionale sono state strette — 28/08/2026.** Qui erano
registrate come rischio residuo «non urgente». Cercati i chiamanti di ognuna,
**nessuna aveva un chiamante di sistema senza utente**: sono state strette tutte
(più tre propagate dal compilatore), e `BASELINE_UTENTE_OPZIONALE` è ora **vuota**.
Un metodo nuovo che ci finirebbe dentro fallisce il lint.

### ⏸ A · Il test d'integrazione su database vero — **BLOCCATO**

⛔ **La verifica più forte del Passo 5 non è stata eseguita, e la sua assenza va
detta qui invece che in fondo a una chat.** Le sei correzioni sono provate contro
**mock di Prisma**: nessuna prova ha mai visto due tenant veri, due sedi vere e un
utente assegnato a una sola.

**Cosa manca, misurato il 28/08/2026:**

```text
DATABASE_URL_TEST            0 file nel repository
api/.env.example             DATABASE_URL · BACKUP_DATABASE_URL — nessuna terza
test con PrismaClient vero   0
```

> **Stato: BLOCCATO — e SOLO finché non esiste `DATABASE_URL_TEST`.** Non è una
> decisione di prodotto e non aspetta una deliberazione: aspetta un database di
> prova dedicato. Il giorno in cui quella variabile esiste, il blocco cade da sé.

⛔ **E non si scrive un test saltabile nel frattempo.** Un `describe.skip`
condizionale che diventa verde quando il database manca è peggio dell'assenza:
contribuisce alla sensazione che l'integrazione sia verificata mentre non lo è —
che è esattamente il difetto che questo audit ha trovato sei volte nel codice.
Quando l'infrastruttura ci sarà, il test dovrà **fallire** se il database non è
configurato, non saltare.

⛔ **Il database DEV condiviso non è un ripiego.** Porta le migration del ramo del
collega, e questa suite non lo tocca in nessun caso.

**Cosa coprirà quando si potrà scrivere** — Tenant A `{A1, A2}` + Tenant B `{B1}`,
utente limitato ad A1: lettura diretta per ID · cambio di sede in scrittura ·
relazione per ID verso un documento di un'altra sede · anteprima import come
oracolo di giacenza.

⭐ **La lezione che vale più delle sei correzioni:** un test di servizio verde
non dimostra che la rotta sia protetta. Il servizio della cassa aveva la guardia,
un commento che descriveva per esteso l'attacco, e sei prove verdi — mentre la
porta era aperta.
