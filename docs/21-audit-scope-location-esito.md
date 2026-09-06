# 21 · Scope Location — esito del Passo 5

**Data:** 28/08/2026
**Perimetro:** autorizzazione di sede sugli accessi per ID nel backend.
**Stato:** ⛔ **chiuso.** Nessun altro audit di sicurezza è in corso. Il test di
integrazione su PostgreSQL reale è stato eseguito il 28/08/2026 (§7 A).

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

### ✅ A · Il test d'integrazione su database vero — **ESEGUITO**

⚠️ **Qui era registrato come BLOCCATO**, in attesa di `DATABASE_URL_TEST`, che
non esisteva. Il blocco è caduto il 28/08/2026: l'ambiente esiste ed è
infrastruttura permanente.

```text
PostgreSQL 17 in Docker · localhost:5433 · vestiflow_test · 141 migration
HTTP → JwtAuthGuard → controller → service → Prisma → PostgreSQL
```

⭐ **L'autenticazione è REALE.** Il guard verifica il token e legge il profilo —
`assignedLocationIds` compreso — **dal database**. Cambia solo chi emette i
token: un emittente locale invece del progetto Supabase, così la verifica è
HS256 in memoria e non parte nessuna chiamata di rete. Nessuna guardia è
sostituita, nessun `@CurrentUser()` è iniettato a mano.

#### ⛔ La copertura è RAPPRESENTATIVA, non completa: 3 correzioni su 6

**Non chiamarla «copertura completa».** Il numero è misurato per
falsificazione — rimuovendo una alla volta la guardia e osservando le prove
arrossire — non affermato.

| #   | correzione                            | integrazione HTTP                   | prove rosse alla falsificazione |
| --- | ------------------------------------- | ----------------------------------- | ------------------------------- |
| 1   | `GET /inventory/reservations`         | ⛔ no — prove di servizio + guardia | —                               |
| 2   | `GET /store-sales/lookup`             | ✅ **sì**                           | 1                               |
| 3   | `GET /online-sales/:id` · `/by-order` | ⛔ no — prove di servizio + guardia | —                               |
| 4   | `PATCH /documents/:id` (sede del DTO) | ✅ **sì**                           | 2                               |
| 5   | `POST` · `PATCH /supplier-orders`     | ⛔ no — prove di servizio + guardia | —                               |
| 6   | riferimenti per ID                    | ⚠️ solo `linkedSalesDdtIds`         | 2                               |

⛔ Fuori dall'integrazione restano anche `linkedGoodsReceiptId`,
`supplierOrderId` e `import/preview` della #6.

⭐ **Le tre coperte non sono scelte a caso: sono una per FORMA del difetto** —
guardia morta (#2), guardia parziale (#4), guardia assente (#6). È un campione
dei meccanismi, non delle rotte.

#### Le 14 prove: 11 richieste HTTP + 3 verifiche sul database

⚠️ **Le due cose non coincidono**, e vanno tenute distinte: tre prove non
chiamano l'API — verificano che dopo un rifiuto il database non si sia mosso.

```text
11  richieste HTTP     401 · 200 /auth/me · 200/403/404 su GET /documents/:id
                       403 PATCH {locationId} × 2 · 403 PATCH {linkedSalesDdtIds}
                       403/200 lookup · 200 lettura col permesso
 3  verifiche DB       nessuna riga · nessun collegamento · nessun totale importato
```

⚠️ **I tre `GET /documents/:id` certificano il pattern, non una correzione**: quel
gate è **preesistente** (`ce73846a`), e non è fra le sei.

⭐ **E la #4 è provata due volte, con due utenti diversi**: un commesso e un
supervisore con `inventory.view_all_locations`. Il secondo **legge** A2 (200) e
**non può scriverci** (403) — la dimostrazione che lettura e scrittura restano
due politiche distinte.

⚠️ **Il cleanup ri-verifica la barriera prima del `TRUNCATE`**, non si fida di
quella fatta all'avvio: è l'unica operazione distruttiva della suite.

⭐ **La lezione che vale più delle sei correzioni:** un test di servizio verde
non dimostra che la rotta sia protetta. Il servizio della cassa aveva la guardia,
un commento che descriveva per esteso l'attacco, e sei prove verdi — mentre la
porta era aperta.
