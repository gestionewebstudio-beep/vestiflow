# VestiFlow — Allineamento architetturale e messa in sicurezza

Rapporto di lavoro: che cosa è stato cambiato, perché, come è stato verificato
e che cosa è stato deliberatamente lasciato stare.

|                  |                                      |
| ---------------- | ------------------------------------ |
| **Branch**       | `refactor/allineamento-architettura` |
| **Commit**       | 16                                   |
| **File toccati** | 347 · +3.522 / −963                  |
| **`main`**       | intatto                              |
| **Data**         | 1–2 agosto 2026                      |

---

## In sintesi

Il punto di partenza era una domanda: separare gli ambienti «solo gestionale» e
«gestionale + Shopify» per avere più stabilità. La risposta è stata **no** — ma
l'analisi ha fatto emergere problemi reali altrove, e il lavoro è andato lì.

| Metrica                | Prima  | Dopo                   |
| ---------------------- | ------ | ---------------------- |
| Test                   | 1.718  | **1.835**              |
| Dipendenze fra feature | 119    | **0**                  |
| Violazioni di layer    | 8      | **0**                  |
| Letture N+1 in ciclo   | 18     | **7** (tutte motivate) |
| Errori di lint         | 0      | 0                      |
| Bundle iniziale        | 553 kB | 553 kB (budget 800)    |

---

## 01 · La linea di base, prima di toccare qualsiasi cosa

Non si rifattorizza senza sapere da dove si parte: un test rosso a metà lavoro
va attribuito, non indovinato.

Prima riga di codice scritta: nessuna. Ho eseguito le due suite complete e il
lint. Erano **1.718 test verdi** (1.032 API, 686 frontend) e zero errori. Quel
numero è diventato il metro di paragone per tutto il resto.

---

## 02 · Audit: quattro classi di bug cercate con strumenti, non a occhio

Per ciascuna ho scritto un analizzatore dedicato invece di affidarmi a una
ricerca testuale, perché i falsi positivi di un `grep` nascondono i casi veri.

### Multi-tenant — pulito

Analizzatore che estrae le query Prisma su tutti i **54 modelli** con `tenantId`
e ne segue lo scope di funzione.

594 query esaminate. 96 candidati grezzi → 19 seguendo lo scope → **0 leak
reali**: tutti helper privati o interni a transazione, a valle di un'entità già
verificata per tenant.

### Denaro — pulito

Ricerca di aritmetica in virgola mobile sui **60 campi `*Minor`**.

Interi ovunque. Le sole divisioni per 100 sono conversioni al confine (FatturaPA,
TikTok) verso stringa decimale, con `Math.round` sullo scorporo IVA.

### Subscription — pulito

Analizzatore che risale la catena `.pipe()` di ogni `subscribe` cercando un
operatore di terminazione.

**247 su 260** con `takeUntilDestroyed`. Le 10 restanti sono HTTP one-shot, che
completano da sole, o gestite a mano con `finalize`. Nessun memory leak.

### N+1 — qui c'era il problema

Analizzatore che rileva query Prisma dentro un ciclo, con lo stack di
annidamento. **74 occorrenze in 26 file**, di cui 18 letture.

---

## 03 · Il seam dei canali: il profilo del cliente governa i push

Questo è ciò che rispondeva alla domanda iniziale sugli ambienti separati.

Il problema non era la mancanza di due ambienti: erano **due autorità che
potevano divergere**. Il canale attivo veniva deciso dallo stato della
connessione, non da `Tenant.channelProfile`, che è la decisione commerciale su
cosa il cliente ha comprato.

### Che cosa è cambiato

- `ChannelSyncFacade` legge il profilo del tenant, con cache a 60 secondi e
  invalidazione esplicita al cambio dal pannello admin.
- Il facade è diventato la **porta unica**: nessun service di dominio inietta più
  i push service. Le due operazioni utente-iniziate (eliminazione prodotto, sync
  manuale) passano da metodi che restituiscono l'esito.
- Nuovo `ChannelProfileGuard` con decoratore `@RequireChannelProfile` sui
  controller Shopify e TikTok: il controllo è centralizzato in un guard invece
  che sparso in 18 handler, e legge il profilo dal JWT già risolto — **zero query
  aggiuntive**.

### Un comportamento che è cambiato davvero

Prima il facade spingeva _sempre a entrambi_ i canali, affidandosi ai push
service per uscire con «non connesso». Ora spinge solo al canale del profilo. È
sicuro perché il profilo ne ammette uno solo: la seconda chiamata era da sempre
codice morto che costava query.

**Guadagno concreto:** un documento da 40 righe salvato da un tenant «solo
gestionale» faceva ~80 query verso le tabelle di connessione. Ora ne fa una,
cachata.

---

## 04 · Il layer `domain/`: 119 dipendenze fra feature portate a zero

L'intervento più esteso — **322 file** — e quello più duraturo, perché adesso è
il lint a difenderlo.

Le feature si importavano a vicenda: **119 collegamenti su 63 file**. Componenti
pieni di dominio (il form prodotto, le celle di riga documento, i connettori
canale) vivevano dentro la feature che li aveva generati per prima, e le altre
andavano a prenderseli lì.

Il problema di fondo era che il progetto aveva **due sole case** — `features/` o
`shared/` — ma **tre categorie** di componenti. Ciò che serve a più schermate e
porta logica di business non poteva stare in `shared/` senza far smettere
`shared/` di essere agnostico.

| Confine                          | Prima | Dopo |
| -------------------------------- | ----: | ---: |
| `features` → `features`          |   119 |    0 |
| `core` → `domain` / `features`   |     8 |    0 |
| `domain` → `features`            |     — |    0 |
| `shared` → `domain` / `features` |     0 |    0 |

### Come sono stati scelti i file da spostare

Non a occhio: uno script calcola la **chiusura transitiva** partendo dai file
consumati da altre feature e risalendo tutte le dipendenze interne. È l'insieme
minimo che deve migrare perché non resti alcun collegamento fra feature.

Dodici aree di dominio: `channels`, `products`, `documents`, `customers`,
`suppliers`, `supplier-orders`, `sales-orders`, `store-sales`, `inventory`,
`reports`, `analytics`, `tenant`.

### Perché non può regredire

Aggiunto `no-restricted-imports` con una regola per layer in
`eslint.config.mjs`. Un import fra feature adesso **fa fallire il lint**, con un
messaggio che dice cosa fare. La regola in `regole-architettura.md` e il codice
non possono più divergere in silenzio.

Direzione consentita: `core → shared → domain → features`.

### Due service erano nel posto sbagliato

Le 8 violazioni di `core/` erano `barcode-lookup.service` e
`operational-locations.service`: service di dominio finiti nel layer che non deve
conoscere il dominio. Spostati sotto `domain/`.

### I nomi non mentono più

Tre componenti si chiamavano `goods-receipt-*` ma li usano due o tre tipi
documento diversi:

- `goods-receipt-line-code-cell` → `document-line-code-cell`
- `goods-receipt-line-product-cell` → `document-line-product-cell`
- `goods-receipt-product-search-panel` → `document-product-search-panel`
- `goods-receipt-vat.util` → `document-vat.util`

`goods-receipt-line-card` invece **resta**: lo usa solo l'arrivo merce, quindi il
nome è corretto.

### Un bug introdotto durante il lavoro, e come è emerso

La rinomina ha rotto `templateUrl` e `styleUrl` in tre componenti: sono stringhe,
`tsc` non le verifica e nessun test le copre. L'ha visto solo il compilatore
Angular in fase di build.

Corretto, e poi scritto uno scanner che verifica **tutti i 316 riferimenti a
template e stili** del progetto: zero rotti.

---

## 05 · La rete, prima di toccare i form dove passano i soldi

I due form documento pesano insieme oltre 9.000 righe e non avevano alcun test
sui totali. Rifattorizzarli senza copertura sarebbe stato il modo più veloce per
introdurre un errore su una fattura.

Ho scritto test di **caratterizzazione**: non descrivono come il form _dovrebbe_
comportarsi, fotografano come si comporta _oggi_. I valori attesi li ho calcolati
a mano dalla specifica di dominio — imponibile, sconto documento ripartito per
aliquota, IVA sul netto scontato — e sono risultati corretti al primo run.

| Copertura aggiunta | Test | Che cosa fissa                                                                                                                                                                       |
| ------------------ | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordine cliente     |   12 | Totali (vuoto, senza IVA, 22%, codice non standard, righe «documento collegato» escluse, sconto su una e due aliquote, scorporo in modalità ivata) e serializzazione del salvataggio |
| Arrivo merce       |    7 | Gli stessi scenari più la dimensione che qui esiste e lì no: **reverse charge**, dove l'imponibile conta e l'IVA resta fuori dal totale                                              |
| Elenco documenti   |   24 | I **nove profili** di elenco: che il profilo di rotta arrivi al componente e che nessuna delle sei etichette derivate resti vuota                                                    |

### Perché l'elenco documenti meritava attenzione

È _un_ componente che serve _nove_ tipi documento: titolo, sottotitolo,
placeholder e stato vuoto sono derivati dal profilo di rotta. Una regressione lì
non rompe niente — mostra l'etichetta di un altro tipo documento, e non se ne
accorge nessuno finché non lo segnala un cliente.

---

## 06 · Le estrazioni, una fetta alla volta con i test verdi a ogni passo

Cinque estrazioni. Ogni volta la prova che il comportamento non è cambiato non è
un'affermazione di fiducia: sono i test di caratterizzazione, verdi prima e verdi
dopo.

| Estratto                   | Dove                                                    | Test | Note                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Algoritmo dei totali       | `domain/documents/utils/document-totals.util`           |   11 | Le due copie divergevano su un solo punto: come si decide se l'IVA di una riga concorre al totale. Ora è un dato in ingresso e l'algoritmo è uno. Da 56 e 62 righe a 32 e 25 di sola mappatura |
| Opzioni Codice IVA di riga | `domain/documents/utils/document-vat-options.util`      |    7 | Cambiava solo l'insieme di codici attivi in ingresso: vendita contro acquisto                                                                                                                  |
| Lookup variante di riga    | `domain/products/utils/variant-summary-search.util`     |    5 | Lo stesso `merge().find()` era ripetuto in **cinque** form                                                                                                                                     |
| Stato dialog numerazione   | `domain/documents/state/document-number-conflict.store` |    7 | Due signal, due computed e tre transizioni identiche in entrambi i form                                                                                                                        |
| Stato pannello prodotto    | `domain/documents/state/document-product-panel.store`   |   12 | Sei signal e quattro handler identici byte per byte                                                                                                                                            |

### La scelta di design sugli ultimi due

Il pannello prodotto e il dialog numerazione erano duplicati nella _logica_, non
nel markup. Ho estratto **la macchina a stati, non il componente**: classi senza
dipendenze, un'istanza per form come campo del componente.

I membri del componente conservano i nomi di prima e diventano riferimenti ai
signal dello store, quindi **i template non cambiano di una riga**. Era il
vincolo che permetteva di lavorare in autonomia: estraendo il componente con la
UI ci sarebbe stato lo stesso problema degli SCSS — nessun modo di verificare il
risultato.

### Una cosa che ha insegnato la build, e che `tsc` non poteva dire

Il template lega il dialog con `[(open)]`: l'apertura è **co-posseduta**, perché
il dialog si chiude da sé con Esc o backdrop. Il flag resta quindi scrivibile,
mentre il payload del conflitto è di sola lettura verso l'esterno. È una
distinzione reale di proprietà, e adesso sta scritta nel codice.

### Un errore corretto dal codice esistente

`openForEdit` era stato scritto per azzerare la riga di destinazione
dell'aggancio, ragionando che in modifica il prodotto esiste già. **Entrambi i
form invece la impostano**: serve a far tornare sulla riga di partenza una
variante nata dal pannello. Semantica ripristinata e fissata con un test che
spiega il perché.

---

## 07 · Le query N+1: sette eliminate, sette classificate

Non è stato fatto un batch a tappeto. Per ognuna delle rimaste c'è una ragione
scritta, perché «accorpare sempre» è il modo di introdurre bug silenziosi.

### Eliminate

| Percorso                                                    | Prima                          | Dopo              |
| ----------------------------------------------------------- | ------------------------------ | ----------------- |
| Riconciliazione ordine fornitore (arrivo merce da 50 righe) | ~100 round-trip                | 2                 |
| Verifica seriali in carico                                  | una query **per seriale**      | una per documento |
| Conferma documento (DDT vendita e trasferimento)            | una lettura variante per riga  | una per documento |
| Aggancio ordini cliente al documento                        | due query per ordine           | 2                 |
| Evasione ordini da documento                                | una lettura impegni per ordine | 1                 |
| Batch movimenti magazzino                                   | una lettura variante per riga  | 1                 |

### Il momento più utile di tutto il lavoro

Era stata accorpata anche la lettura delle **giacenze** nel batch movimenti. Un
test sulle rettifiche l'ha smascherato: ogni riga muta la giacenza, quindi una
seconda riga sulla stessa variante deve partire dal valore lasciato dalla prima.
Con la lettura anticipata la seconda riga vedeva un valore stale e **il risultato
finale cambiava** — una rettifica in meno applicata.

Quella parte è stata revocata, tenendo il batch delle varianti (che non cambiano
nel ciclo), e aggiunto un test che rende l'invariante esplicito perché non venga
rifatto. È il motivo per cui i test venivano prima del refactoring e non dopo.

### Perché le sette rimaste non vanno toccate

- **Due sono cicli di retry** per generare un codice univoco (SKU prodotto,
  codice fornitore): ogni tentativo dipende dall'esito del precedente. Non sono
  N+1.
- **Una è un falso positivo**: la query sta nell'intestazione di un `for…of`,
  quindi gira una volta sola.
- **Una è la giacenza per riga di rettifica**, lasciata deliberatamente dentro il
  ciclo — l'invariante di cui sopra.
- **Una itera su due elementi** (sede di partenza e destinazione).
- **Una su una o due location** di un reso, sul percorso webhook già accodato.
- **Una filtra per variante e location della riga**: il batch richiederebbe una
  `OR` composta, con guadagno modesto visto che la query parte solo per articoli
  a tracciamento seriale.

---

## 08 · Una raccomandazione che è stata corretta

Nella mappa iniziale il cluster «predicati di riga» era indicato come estraibile
a rischio quasi nullo. **Guardandolo davvero era sbagliato.** La metrica di
similarità misura la forma del corpo, non la regola che codifica.

| Metodo              | Ordine cliente                      | Arrivo merce               |
| ------------------- | ----------------------------------- | -------------------------- |
| `lineHasDiscount`   | sconti a cascata (`"10+5"`)         | percentuale singola        |
| `lineRowComplete`   | prodotto **+ quantità > 0**         | prodotto **+ costo**       |
| `totalPiecesCount`  | salta anche le righe «riferimento»  | non ha righe riferimento   |
| `lineUnitOfMeasure` | ripiega sull'unità digitata in riga | solo quella della variante |

Sono differenze **volute**: un arrivo merce senza costo è incompleto, un ordine
cliente senza quantità sì. Unificarle avrebbe richiesto di passare predicati e
accessor — cioè un'API più grande del corpo che sostituisce — o, peggio, avrebbe
fuso due regole di business diverse.

La mappa in `docs/CORE-FORM-DOCUMENTO.md` è stata corretta, con la lezione
scritta accanto: _la percentuale di similarità è un indizio su dove guardare, non
una prova che due cose siano la stessa cosa._

Unica eccezione applicata: `lineVariantSummary` era identico e ripetuto in
**cinque** form. È diventato `findVariantSummaryById`.

---

## Che cosa _non_ è stato fatto

Il piano non è finito, e la parte mancante non è dimenticata: è ferma per ragioni
precise.

### Gli SCSS oltre budget — rinviato per scelta

Sei file sforano il budget `anyComponentStyle`, il peggiore a 25,88 kB contro 12.
È l'unica cosa misurabile lato client rimasta.

**Nessun test copre il CSS.** Riscrivere 3.800 righe di stili senza poter
guardare il risultato significa che un errore verrebbe scoperto la settimana
dopo, non sul momento. Va fatto col browser aperto.

### La copertura dei componenti

**130 componenti su 155 non hanno spec.** Ne è stato aggiunto uno. Di quei 130,
70 sono sotto le 150 righe — presentazionali, dove una spec aggiunge
manutenzione più che sicurezza.

Il rischio è concentrato in una decina di file:

| Componente                             |     Righe | Perché conta                                    |
| -------------------------------------- | --------: | ----------------------------------------------- |
| `settings.component`                   |     1.099 | orchestra impostazioni tenant, canali, permessi |
| `sales-order-list`                     |     1.072 | filtri, stati, azioni sugli ordini              |
| `product-form`                         |       882 | creazione prodotto — usato da 4 form documento  |
| `document-detail`                      |       807 | dettaglio e azioni su documento confermato      |
| `stock-operation-form`                 |       733 | **movimenta giacenze**                          |
| `shell-layout`                         |       552 | navigazione, permessi, location attiva          |
| `inventory-levels` / `stock-movements` | 548 / 511 | lettura giacenze e movimenti                    |

Stima per i cinque principali: **3–4 ore**. Il costo non dipende dalle righe ma
dal numero di dipendenze da mockare, e tutti ne hanno meno dei due form già
coperti (19 ciascuno).

### La duplicazione residua fra i due form

Da 34 metodi / ~690 righe a **29 / ~613**. Quel che resta non è più logica pura:
è stato di componente accoppiato alla UI. La mappa completa, con la
raccomandazione per ciascun cluster — inclusi i due che è stato deciso di **non**
toccare — è in `docs/CORE-FORM-DOCUMENTO.md`.

### Sulla richiesta «assenza di bug»

Non è certificabile. Quello che si può dire con i numeri è che tre delle quattro
classi di bug più pericolose per un gestionale multi-tenant sono state cercate
con strumenti dedicati e sono risultate chiuse; la quarta è stata ridotta; e la
parte del codice che ne aveva davvero bisogno ora ha una rete che ha già
dimostrato di funzionare, fermando un errore introdotto durante questo stesso
lavoro.

---

## Registro dei commit

| Hash      | Commit                                                                           | File |
| --------- | -------------------------------------------------------------------------------- | ---: |
| `6e8b307` | refactor(architettura): nuovo layer domain/, zero dipendenze tra feature         |  322 |
| `b5372e1` | perf(documenti): elimina le query N+1 sul percorso di conferma documento         |   10 |
| `93aef17` | test(ordine cliente): caratterizzazione su totali e serializzazione              |    1 |
| `414836e` | test(arrivo merce): caratterizza i totali documento, reverse charge incluso      |    1 |
| `1758703` | refactor(documenti): un solo algoritmo per i totali, condiviso dai form          |    4 |
| `5d04c28` | perf(magazzino): varianti in blocco nel batch movimenti, giacenza no             |    2 |
| `bd12389` | refactor(documenti): opzioni Codice IVA di riga condivise dai form               |    4 |
| `bc64e02` | docs: mappa del residuo di duplicazione nei form documento                       |    1 |
| `2a68a08` | refactor(prodotti): lookup variante di riga condiviso, via un service morto      |    9 |
| `7705660` | perf(documenti): ultime N+1 accorpabili, e classificazione di quelle che restano |    2 |
| `94eabe3` | refactor(documenti): macchina a stati del dialog numerazione condivisa           |    4 |
| `fd036c6` | refactor(documenti): macchina a stati del pannello prodotto condivisa            |    4 |
| `d0df85b` | test(documenti): caratterizza i nove profili dell'elenco documenti               |    1 |

---

## Verifica finale

| Controllo                                 | Esito                                |
| ----------------------------------------- | ------------------------------------ |
| Test API                                  | 147 file · 1.051 test verdi          |
| Test frontend                             | 148 file · 771 test verdi            |
| Lint (incluse le nuove regole di confine) | 0 errori                             |
| Build di produzione                       | bundle iniziale 553 kB su budget 800 |
| Confini fra layer                         | 0 violazioni in 4 direzioni          |
| Riferimenti a template e stili            | 316 verificati, 0 rotti              |

Tutto su `origin/refactor/allineamento-architettura`. `main` non è mai stato
toccato dopo il primo commit.
