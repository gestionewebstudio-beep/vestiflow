# Piano di collaudo Shopify — BOZZA

> ⛔ **È una BOZZA, e non autorizza niente.** Non autorizza l'onboarding, non autorizza
> l'accesso al database condiviso, non autorizza chiamate a Shopify, non è un rilascio.
> Preparare uno scenario non significa poterlo eseguire, e uno scenario preparato non
> diventa una regola.

⭐ **A che cosa serve.** I metodi hanno i loro test; quello che manca è la prova che le cose
funzionino **insieme**, dall'interfaccia al database al negozio remoto, in sequenze che un
utente reale compie davvero. Un difetto che nasce fra due componenti corretti non lo trova
nessun test unitario.

⚠️ **Questo documento NON ripete le decisioni.** Ogni scenario rimanda alla sezione canonica
che lo governa: `docs/24-specifica-ciclo-vita-catalogo-e-sincronizzazione-shopify-v2.md` per
le decisioni di dominio, `docs/DA-FARE.md` per lo stato dei lavori. ⛔ Se questo piano e una
di quelle sezioni divergono, **vince la sezione canonica**, e la divergenza è un difetto di
questo file.

---

## 1 · Il criterio di completamento

> **Prima del rilascio e della chiusura del ramo serve una campagna di simulazioni
> end-to-end RIPRODUCIBILI, non soltanto test dei singoli metodi.**

⛔ **«Riproducibili» ha tre requisiti, e nessuno è facoltativo:**

|                          |                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------- |
| **dati versionati**      | il dataset sintetico vive nel repository, non in uno script dello scratchpad       |
| **seconda esecuzione**   | ogni scenario si esegue **due volte**: la seconda deve dare lo stesso esito        |
| **bersaglio verificato** | prima di eseguire si accerta **quale** database, **quale** API e **quale** negozio |

⚠️ **La campagna si prepara adesso e si esegue progressivamente**; alla fine si **ripete per
intero** la parte pertinente al rilascio. Uno scenario passato tre settimane prima, su un
ramo diverso, non è una prova di rilascio.

---

## 2 · Gli ambienti, e come si verifica il bersaglio

| Ambiente                        | Che cosa ci si fa                                                | Distruttivo |
| ------------------------------- | ---------------------------------------------------------------- | ----------- |
| `localhost:5433/vestiflow_test` | tutto ciò che scrive e cancella: fixture, TRUNCATE, DDL di prova | ✅ sì       |
| copia locale con dati veri      | ciò che dipende dal volume e dai casi reali                      | ✅ sì       |
| negozio Shopify di **sviluppo** | il collaudo mutativo del canale                                  | ⚠️ remoto   |
| interfaccia (Playwright)        | le verifiche su schermo                                          | —           |
| ⛔ **database condiviso**       | ⛔ **niente**                                                    | ⛔          |

### Prima di eseguire — la verifica del bersaglio

⛔ **Non si esegue nessuno scenario senza aver accertato dove si sta scrivendo.** Le barriere
esistono già e vanno usate, non riscritte:

| Bersaglio | Come si accerta                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| database  | `ambienteIntegrazione()` (host, porta e nome insieme) **più** `current_database()` interrogato sulla connessione usata   |
| API       | l'istanza avviata dalla suite, non un server già in ascolto: un `ng serve` sulla 4200 verrebbe riusato in silenzio       |
| Shopify   | `SHOPIFY_CONTRACT_TEST=1` **e** `VESTIFLOW_SHOPIFY_CONTRACT_SHOP=<dominio>` **e** `partnerDevelopment: true` sul negozio |

⚠️ **Il gate di contratto legge la credenziale dal database di SVILUPPO**, che è il
condiviso: è l'unico posto in cui il token cifrato esiste. Quella lettura è una `findFirst`
in sola lettura, ma **è un accesso al condiviso** e richiede la sua autorizzazione.

---

## 3 · I dati sintetici

⭐ **Riconoscibili a colpo d'occhio**, così una riga trovata fuori posto si attribuisce
subito. Il dataset vive in `api/src/test/fixtures/collaudo-shopify.dataset.ts`.

|                |                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------ |
| **due tenant** | `COLLAUDO ALFA` · `COLLAUDO BETA` — l'isolamento non si prova con un tenant solo           |
| **sedi**       | Alfa: `ALFA-NEGOZIO`, `ALFA-MAGAZZINO`, `ALFA-SENZA-CANALE` · Beta: `BETA-NEGOZIO`         |
| **articoli**   | codici `CLD-*`, nomi che dichiarano il caso: `Collaudo omonimo`, `Collaudo SKU duplicato`… |
| **GID finti**  | `gid://shopify/Product/9900xx` — la fascia `99xxxx` è riservata al collaudo                |

⛔ **Nessun dato reale, nessuna copia di un tenant vero.** E i GID sintetici non si usano
mai contro un negozio reale: là gli identificativi li assegna Shopify.

⭐ **Dal 09/09/2026 c'è un secondo dataset, GENERATO e deterministico**, per la campagna del
ciclo di utilizzo (scenario M): `api/src/test/fixtures/collaudo-ciclo-utilizzo.dataset.ts`.
Tre aziende — Alfa e Beta collegate a due negozi **simulati con stato** e distinti, Gamma
senza Shopify con catalogo e documenti — e cataloghi remoti e locali a **5, 50 e 500**
articoli con varianti, identificativi mancanti e le anomalie che le regole ammettono (SKU
assente o duplicato, barcode assente o duplicato). ⚠️ 50 e 500 sono dimensioni di prova,
non soglie di prestazione. Il simulatore è `api/src/test/integration/shopify-simulato.util.ts`:
conserva il catalogo remoto fra le chiamate e assegna id diversi a creazioni distinte, nella
fascia riservata.

---

## 4 · Come si legge una scheda

Ogni scenario porta i sette campi richiesti. In esecuzione se ne aggiungono tre.

| Campo                   | Che cosa contiene                                                         |
| ----------------------- | ------------------------------------------------------------------------- |
| **situazione iniziale** | i dati di partenza, dal dataset versionato                                |
| **azioni**              | la sequenza, nell'ordine                                                  |
| **risultato atteso**    | ⛔ **solo se una decisione approvata lo stabilisce**, col rimando         |
| **verifiche**           | UI · API · database · Shopify, ognuna dichiarata **reale** o **simulata** |
| **ambiente**            | quale dei cinque della §2                                                 |
| **manca**               | la decisione o l'implementazione assente, se c'è                          |
| **stato**               | vedi sotto                                                                |
| _in esecuzione_         | **risultato osservato** · **seconda esecuzione** · **data e commit**      |

### Gli stati

| Stato                | Significa                                                                |
| -------------------- | ------------------------------------------------------------------------ |
| **da preparare**     | lo scenario è descritto, la prova non è ancora scritta                   |
| **eseguibile**       | la prova esiste e si può lanciare                                        |
| **eseguito**         | lanciata, verde, con la seconda esecuzione                               |
| **fallito**          | lanciata e rossa — ⭐ un fallito è un risultato, non un errore del piano |
| **non verificabile** | manca la decisione o l'implementazione: ⛔ **non si inventa un atteso**  |

⛔ **«Non verificabile» non si converte in verde aggiungendo una regola.** Se uno scenario
non ha un atteso, la mancanza è il risultato.

---

## 5 · Gli scenari

### A · Entrambe le piattaforme vuote

**Situazione iniziale** — tenant `COLLAUDO ALFA` senza articoli; negozio di sviluppo senza
prodotti. **Azioni** — primo collegamento, poi la scelta di direzione.

|                      |                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **risultato atteso** | ⛔ **nessuno**: le due direzioni sono approvate (`docs/24` §12.0) ma l'onboarding **non è implementato**, e i dettagli operativi sono aperti (`DA-FARE` §8) |
| **verifiche**        | —                                                                                                                                                           |
| **ambiente**         | test locale + negozio di sviluppo                                                                                                                           |
| **manca**            | implementazione dell'onboarding; giacenze iniziali; wizard §12 **non approvato**                                                                            |
| **stato**            | ⛔ **non verificabile**                                                                                                                                     |

⚠️ **Ciò che si può verificare oggi**, e va tenuto separato: che il collegamento non
importi né crei niente da sé. Questo sì è uno scenario eseguibile — è **E1**.

### B · VestiFlow popolato, Shopify vuoto

**Situazione iniziale** — Alfa con 5 articoli `CLD-*`, negozio vuoto.
**Azioni** — collegamento, poi pubblicazione esplicita di un articolo.

|                      |                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **risultato atteso** | la pubblicazione crea il prodotto remoto e ne registra gli identificativi (`docs/24` §12.0 «Parto da VestiFlow», §11.9). ⭐ **Dal 09/09/2026 la registrazione nel nuovo modello c'è**: `persistShopifyIds` scrive colonne-cache **e** identità e periodi nella stessa transazione (B3, `storico-push.integration-spec.ts` 3a–3h) |
| **verifiche**        | API: gli id tornano sull'articolo · DB: colonne-cache valorizzate **e identità presenti** · Shopify **simulato con stato**: il prodotto remoto esiste e corrisponde campo per campo (scenario M, S2) · Shopify **reale**: ⛔ non ancora · UI: stato di sincronizzazione                                                          |
| **ambiente**         | test locale (eseguito) + negozio di sviluppo (⛔ non autorizzato)                                                                                                                                                                                                                                                                |
| **manca**            | la verifica sul negozio reale; il caso §24 (prodotto remoto orfano dopo un fallimento locale) resta aperto                                                                                                                                                                                                                       |
| **stato**            | ✅ **eseguito** sul simulato, 09/09/2026 — scenario M, S2 a 5/50/500 articoli, due esecuzioni · ⏸ **da eseguire** sul reale                                                                                                                                                                                                      |

### C · Shopify popolato, VestiFlow vuoto

**Situazione iniziale** — negozio con 5 prodotti, Alfa senza articoli.
**Azioni** — collegamento, poi pull del catalogo.

|                      |                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **risultato atteso** | l'import crea articoli locali conservando gli identificativi remoti (`docs/24` §12.0 «Parto da Shopify»). ⭐ **Dal 09/09/2026 scrive anche identità e periodi** (B2), e due import sovrapposti dello stesso prodotto non producono doppioni né perdono aggiornamenti (`DA-FARE` §25) |
| **verifiche**        | API: elenco articoli · DB: `shopifyProductId` valorizzato **e** `shopify_product_identities` popolata · Shopify **simulato con stato**: campo per campo secondo §9.2 (scenario M, S1) · Shopify **reale**: ⛔ non ancora · UI: gli articoli compaiono                                |
| **ambiente**         | test locale (eseguito) + negozio di sviluppo (⛔ non autorizzato)                                                                                                                                                                                                                    |
| **manca**            | giacenze iniziali (`DA-FARE` §8, aperto); la verifica sul reale                                                                                                                                                                                                                      |
| **stato**            | ✅ **eseguito** sul simulato, 09/09/2026 — scenario M, S1 a 5/50/500 articoli, due esecuzioni · ⏸ **da eseguire** sul reale                                                                                                                                                          |

### D · Entrambi popolati

⛔ **Questa famiglia è la più importante e la meno verificabile**, e va detto per prima cosa:
**due cataloghi popolati senza collegamenti certi non sono risolti da nessuna delle due
direzioni approvate** (`DA-FARE` §8, «Limiti dichiarati, e non aggirabili»).

| Caso                                   | Situazione iniziale                                                                    | Stato                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** articoli **distinti**           | 3 locali `CLD-A*`, 3 remoti senza corrispondenza                                       | ⛔ **non verificabile**: manca l'onboarding                                                                                                                  |
| **D2** apparentemente **uguali**       | stesso nome, stesso prezzo, **nessuno SKU** da entrambi i lati                         | ⛔ **non verificabile** — ⭐ ed è il caso che dimostra perché: senza identificativi **nessuna regola può decidere**, e inventarne una qui sarebbe il difetto |
| **D3** **omonimi**                     | due locali `Collaudo omonimo` e un remoto omonimo                                      | ⛔ **non verificabile**                                                                                                                                      |
| **D4** SKU **duplicato**               | due varianti locali con lo stesso SKU (stato che Shopify ammette, `regole-gestionale`) | **da preparare**: l'import non deve rompersi, e l'anomalia va **segnalata**                                                                                  |
| **D5** barcode duplicato o **assente** | come sopra, sul barcode                                                                | **da preparare**                                                                                                                                             |

⚠️ **D4 e D5 sono verificabili perché hanno una regola approvata** — «SKU duplicati o vuoti
NON devono rompere il sync: vanno importati e segnalati come anomalie» (`regole-gestionale`,
«SKU e Shopify — clausola di realtà»). D1-D3 no.

⛔ **Preparare D1-D3 non autorizza a implementare l'onboarding**, e la loro presenza qui non
va letta come un impegno a farlo.

### E · Collegamento, disconnessione, riconnessione

| Caso   | Azioni                                                             | Atteso e rimando                                                                                                                                              | Stato                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1** | collegamento su due cataloghi vuoti                                | ⭐ **non succede niente**: nessun articolo, nessuna sede creata, nessuna quantità (`docs/24` §1.13)                                                           | **da preparare**                                                                                                                                                                                                                                                                                            |
| **E2** | disconnessione                                                     | interrompe la sincronizzazione; ⭐ conserva coppie e collegamenti; ⛔ **nessun `shop_change`** (`DA-FARE` §15.2)                                              | ⛔ **non verificabile**: identità e periodi ora si scrivono (B2–B3, 09/09), ma **nessun servizio chiude un collegamento senza eliminare** — la disconnessione non li tocca. ⚠️ Che un collegamento **chiuso** non si riapra ai webhook è invece **eseguito** (B5a; scenario M, S5, su situazione costruita) |
| **E3** | operazioni **locali** durante la pausa (cestino, modifiche prezzi) | riescono, e non toccano il canale                                                                                                                             | **eseguibile**                                                                                                                                                                                                                                                                                              |
| **E4** | **ordini Shopify** durante la pausa                                | ⛔ **atteso da decidere**: §1.15.3 elenca ciò che non si azzera e cita l'«intervallo non sincronizzato», ma il recupero dal checkpoint **non è implementato** | ⛔ **non verificabile**                                                                                                                                                                                                                                                                                     |
| **E5** | riconnessione allo **stesso** negozio                              | riprende dal checkpoint, senza duplicare (`docs/24` §1.15.2)                                                                                                  | ⛔ **non verificabile**                                                                                                                                                                                                                                                                                     |
| **E6** | riconnessione a un negozio **diverso**                             | chiude i collegamenti con `shop_change`, la storia resta (`docs/24` §8.5.1)                                                                                   | ⛔ **non verificabile**                                                                                                                                                                                                                                                                                     |

⚠️ **E5 ed E6 dipendono dall'identità del negozio** (`shop_gid`), che oggi **non viene mai
acquisita**: il negozio è riconosciuto dal dominio (`DA-FARE` §9 residuo 2).

### F · Sedi

⭐ **Questa famiglia è eseguibile SUBITO, e serve a misurare una divergenza già nota**: la
regola è decisa e il codice non la rispetta.

| Caso   | Azioni                                                        | Atteso e rimando                                                                                | Stato                                                                                           |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **F1** | location Shopify **senza** sede corrispondente                | ⛔ **nessuna sede creata**: la creazione è una delle tre scelte dell'utente (`docs/24` §1.13.1) | ⚠️ **eseguibile, e oggi FALLISCE** — il sync ne crea (`shopify-location-sync.service.ts:80`)    |
| **F2** | sede locale con lo **stesso nome**, mai collegata             | ⛔ **non collegata**: nome e indirizzo non sono prove d'identità (`docs/24` §1.13.1)            | ⚠️ **eseguibile, e oggi FALLISCE** — `findMatch` aggancia per nome (`:294`)                     |
| **F3** | location **scomparsa** da Shopify                             | la sede resta, il collegamento si chiude con la storia (`docs/24` §1.13.3)                      | ⛔ **non verificabile**: lo storico non è in servizio                                           |
| **F4** | location **ripristinata** su Shopify dopo la scomparsa        | ⛔ nessun riaggancio automatico (`docs/24` §1.13.3)                                             | ⛔ **non verificabile**                                                                         |
| **F5** | **riassegnazione** di una coppia già usata                    | ⛔ **vietata** (`docs/24` §1.13.6): la coppia è stabile, i vincoli sono TOTALI                  | ✅ **eseguito** — 33 prove in `shopify-link-vincoli.integration-spec.ts`, sul database di prova |
| **F6** | disconnetti e riconnetti, poi una location con lo stesso nome | ⛔ non riagganciata                                                                             | ⚠️ **eseguibile, e oggi FALLISCE**: `disconnect()` azzera `shopifyLocationId` e F2 riparte      |

⭐ **Un «fallito» qui è il risultato utile**: misura la distanza fra la regola e il codice, ed
è la stessa distanza che la fase B (`DA-FARE` §13 B7) deve chiudere.

### G · Modifiche ai campi, da entrambi i lati

⛔ **La direzione per campo è la matrice di `docs/24` §9.2, e vive SOLO lì.** Questo piano non
la ricopia: ogni caso rimanda alla riga della matrice.

| Caso   | Campo                        | Da dove parte la modifica | Stato                                                                                                   |
| ------ | ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| **G1** | `Product.name`               | VestiFlow                 | **da preparare** — ⭐ solo VestiFlow, Shopify non lo sovrascrive mai (`docs/24` §1.9)                   |
| **G2** | `shopifyTitle`               | entrambi i lati           | **da preparare** — bidirezionale                                                                        |
| **G3** | prezzo di vendita            | entrambi                  | **da preparare** — ⚠️ e va provato con la convenzione netto/ivato accesa e spenta (`regole-gestionale`) |
| **G4** | **quantità**                 | entrambi                  | **da preparare** — ⭐ la quantità autorevole è di VestiFlow (`regole-gestionale`, «OWNERSHIP»)          |
| **G5** | tag, brand, descrizione, SEO | entrambi                  | **da preparare** — ognuno con la sua riga di §9.2                                                       |
| **G6** | un campo **non** in matrice  | —                         | ⛔ **non verificabile**: se un campo non è in §9.2, la sua direzione non è decisa                       |

⚠️ **G1-G5 sono «da preparare» e non «eseguibili»** perché la verifica seria richiede il
negozio di sviluppo: un mock direbbe quello che gli si è insegnato.

### H · Cestino, ripristino, eliminazione

| Caso   | Azioni                                                                    | Atteso e rimando                                                                    | Stato                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** | cestino e ripristino di un articolo **solo locale**                       | reversibile, nessun movimento, traccia conservata (`docs/24` §1.1, `DA-FARE` §10.3) | ✅ **eseguito** — 14 prove in `registro-cestino.integration-spec.ts`                                                                                                                                                                                                                                                                                                   |
| **H2** | cestino di un articolo **collegato**                                      | ⛔ rifiutato in questa prima tranche (`DA-FARE` §17)                                | ✅ **eseguito**                                                                                                                                                                                                                                                                                                                                                        |
| **H3** | eliminazione definitiva **consentita** (articolo locale, senza movimenti) | rimuove anagrafica e dipendenze (`docs/24` §1.1)                                    | **da preparare**                                                                                                                                                                                                                                                                                                                                                       |
| **H4** | webhook `products/update` **dopo** l'eliminazione                         | ⛔ **non deve ricreare** (`docs/24` §11.8, confermata il 03/09/2026)                | ✅ **eseguito** 09/09/2026 — B5–B6 (`divieto-ricreazione` B6a–j) e scenario M, S6: l'escluso resta escluso, il lotto prosegue e **il motivo persiste nel registro** (§10.3, con la correlazione del lotto). ⚠️ L'eliminazione definitiva di un articolo **collegato** non ha un percorso applicativo (`delete()` la rifiuta): la situazione è **costruita** come in B6 |
| **H5** | variante eliminata dal form, poi webhook                                  | ⛔ non deve ricreare                                                                | ✅ **eseguito** 09/09/2026 — B4/B6d e scenario M, S4: dal percorso applicativo (`ProductsService.update`), poi webhook e lotto                                                                                                                                                                                                                                         |
| **H6** | cestino, ripristino, e **poi** un webhook                                 | il ripristino non rimette in vendita; il webhook non riattiva (`docs/24` §1.8)      | **da preparare**                                                                                                                                                                                                                                                                                                                                                       |

### I · Ripetizioni, duplicati, interruzioni

| Caso   | Azioni                                                              | Atteso e rimando                                                                                                                                                                | Stato                                                                        |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **I1** | stessa richiesta di cestino **due volte**                           | nessun effetto doppio, nessuna traccia orfana (`DA-FARE` §10.3)                                                                                                                 | ✅ **eseguito**                                                              |
| **I2** | **stesso** webhook consegnato due volte                             | idempotente: un solo effetto (`docs/24` §8.5.3)                                                                                                                                 | ⛔ **non verificabile**: l'inbox `shopify_webhook_deliveries` **non esiste** |
| **I3** | webhook **fuori ordine** (update prima di create)                   | l'ordine si risolve con `X-Shopify-Triggered-At` (`docs/24` §8.5.3)                                                                                                             | ⛔ **non verificabile**                                                      |
| **I4** | **interruzione** a metà di un'operazione di cestino                 | la transazione rotola indietro; resta il `tentativo` senza esito                                                                                                                | ✅ **eseguito**                                                              |
| **I5** | pubblicazione **già partita** quando arriva il cestino              | ⛔ **atteso da decidere**: il rimedio nel `where` è **parziale** e non copre il caso in cui la richiesta a Shopify è partita e gli id locali non ci sono ancora (`DA-FARE` §17) | ⛔ **non verificabile**                                                      |
| **I6** | cestino e pubblicazione **nei due ordini**, con incastro dichiarato | ⛔ atteso da decidere, come sopra                                                                                                                                               | ⛔ **non verificabile**                                                      |

⚠️ **I5 e I6 richiedono due connessioni e l'incastro letto da `pg_stat_activity`**, la stessa
forma già usata per le identità: un mock non può mostrarli.

### J · Backup e ripristino, dopo tutto il resto

| Caso   | Azioni                                                            | Atteso e rimando                                                                                                                                                                                                                                          | Stato                                                                                                                                                |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **J1** | backup di Alfa, poi un'esclusione, poi ripristino del backup      | ⭐ **implementato**: lo storico è nel pacchetto (v5), l'esclusione decisa dopo il backup **non viene sovrascritta**, un articolo ancora collegato assente dal backup fa **rifiutare** il ripristino nominandolo (`ripristino-storico-shopify` 1d, 2b, 3c) | ✅ **eseguito** 09/09/2026 — A1–A3 e scenario M, S8 (esclusione dal percorso applicativo, poi ripristino; poi articolo nuovo e ripristino rifiutato) |
| **J2** | ripristino su **database vuoto**, con identità già eliminate      | lo storico si recupera col permesso di riga (`DA-FARE` §10.1 S2-bis)                                                                                                                                                                                      | ✅ **eseguito** — `ripristino-storico-shopify` 2a, nel ramo                                                                                          |
| **J3** | esclusione registrata **dopo** la data del backup                 | sopravvive al ripristino (`DA-FARE` §10.1 S2)                                                                                                                                                                                                             | ✅ **eseguito** — 2b, e scenario M, S8                                                                                                               |
| **J4** | **il registro** sopravvive alla cancellazione dei dati del tenant | ⭐ sì: nessuna FK verso `tenants`                                                                                                                                                                                                                         | ✅ **eseguito**                                                                                                                                      |
| **J5** | cancellazione amministrativa del tenant con storico               | consentita e tracciata (`DA-FARE` §10.2)                                                                                                                                                                                                                  | ✅ **eseguito** — `cancellazione-tenant` 1a–3c e scenario M, S9: Alfa sparisce con la traccia, Beta e Gamma identici a prima                         |

---

### K · ⛔ VestiFlow SENZA Shopify — il vincolo che viene prima di tutti

> **VestiFlow deve funzionare integralmente anche senza Shopify.** Le modifiche
> all'integrazione non devono trasformarla in una dipendenza del gestionale.

⛔ **Tre stati distinti, e non vanno confusi:**

| Stato                                | Che cosa deve succedere                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| **modulo assente**                   | nessun elemento e nessun avviso Shopify a schermo, **nessuna chiamata al canale** |
| **modulo presente, non configurato** | il pannello esiste ma non è connesso: nessuna chiamata, nessun avviso di errore   |
| **integrazione configurata**         | il comportamento descritto negli scenari A–J                                      |

⚠️ **Il tenant di prova deve avere DATI, non essere vuoto**: un tenant vuoto non distingue
«funziona senza Shopify» da «non fa niente».

⛔ **«Eseguibile» e «verificato» sono due colonne diverse**, e la seconda si compila solo dopo
l'esecuzione corrispondente. Sotto, «verificato 08/09» significa: eseguito quel giorno, su
questo ramo, contro il PostgreSQL locale sacrificabile.

| #   | Caso                                                     | Prove usate                                                                                | Stato                  |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| K1  | catalogo, prezzi, giacenze e movimenti locali            | suite di integrazione completa: 39 file, **674 prove verdi**                               | ✅ verificato 08/09    |
| K2  | cassa                                                    | `reso-cassa`, `cassa-*` dentro quella stessa suite                                         | ✅ verificato 08/09    |
| K3  | backup ed esportazione                                   | `tenant-backup-storage`, più `5b` di `ripristino-storico-shopify` (tenant senza Shopify)   | ✅ verificato 08/09    |
| K4  | ripristino da backup                                     | idem: il ripristino non richiede identità né collegamenti                                  | ✅ verificato 08/09    |
| K5  | cancellazione amministrativa su tenant **con dati**      | `3b-bis` di `cancellazione-tenant`: dati presenti, zero righe Shopify, traccia scritta     | ✅ verificato 08/09    |
| K6  | le operazioni locali non chiedono identità o credenziali | `K6a`/`K6b` di **`senza-shopify`**: tenant `gestionale` **con catalogo e documenti**       | ⚠️ verificato in parte |
| K7  | un tenant `gestionale` non può collegare Shopify         | `K7a`–`K7g` di `senza-shopify`: avvio, completamento, e i due cambi di profilo concorrenti | ✅ verificato 08/09    |

⚠️ **K6 resta «in parte», e la differenza va detta**: `K6a` e `K6b` provano che un giro di
scritture ordinarie (rinomina, prezzo, cestino, ripristino) non crea righe Shopify e non
chiama il canale. **Non** provano ogni percorso applicativo del gestionale uno per uno — la
copertura di quelli è la suite di dominio, che non è scritta in chiave «senza Shopify».

⭐ **K7 copre ora quattro momenti distinti**, non uno:

| Prova       | Momento                                                                                       | Esito atteso                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `K7a` `K7b` | avvio del collegamento                                                                        | rifiutato, **nessuna riga e nessuna chiamata**                                        |
| `K7c`       | avvio da un tenant abilitato                                                                  | ✅ consentito — la guardia non blocca tutti                                           |
| `K7d`       | il profilo è già `gestionale` quando arriva il callback                                       | rifiutato **prima** delle chiamate a Shopify                                          |
| `K7g`       | il profilo cambia **mentre** il callback parla con Shopify                                    | rifiutato dentro la transazione, niente scritto                                       |
| `K7e`       | collegamento e cambio profilo **simultanei**                                                  | esattamente uno dei due passa, e mai uno stato misto                                  |
| `K7h`       | il collegamento è **trattenuto prima del commit**, il cambio profilo parte in quella finestra | il cambio **attende** il lock e, al commit, viene rifiutato per la connessione attiva |
| `K7f`       | controllo: il cambio profilo, da solo, riesce                                                 | ✅ — senza, `K7e` sarebbe verde per il motivo sbagliato                               |

⭐ **`K7h` è la prova deterministica del lato amministrativo**: le altre due corse sono
governate dal caso, questa impone l'incrocio. La transazione si trattiene sostituendo
`$transaction` sul **client di prova** — nell'applicazione non esiste nessun gancio, e un
gancio operativo proverebbe il gancio.

⚠️ **Tre prove in più sulla classificazione degli errori** (`shopify-oauth-shop-identity`,
unitarie): una lettura del profilo fallita per un motivo **tecnico** risale invece di
diventare «canale non abilitato», e `P2028` risale invece di diventare «conflitto con un
altro collegamento». Più una quarta che verifica che i rifiuti veri continuino a funzionare.

⭐ **K5 è la prova che il vincolo regge dopo A4**: il tenant senza Shopify si cancella con i
propri dati, la traccia si scrive, e il tenant che Shopify ce l'ha non viene toccato.

⛔ **Da verificare a ogni modifica dell'integrazione**, non una volta sola: è il criterio che
impedisce all'integrazione di diventare un prerequisito.

---

### L · ⏸ Capacità di sincronizzazione sotto carico — i requisiti di `docs/24` §8.9

> **Registrati il 09/09/2026.** ⛔ **Nessuno di questi scenari è eseguibile oggi**, e non per
> una lacuna del piano: la soluzione tecnica non è scelta — outbox, worker e Bulk Operations
> restano opzioni da valutare (§8.4, §8.9) — e senza di essa non c'è niente da misurare.
>
> ⭐ **Lo stato del codice su cui questi scenari gireranno è censito** in `DA-FARE` §27, e la
> proposta dell'importazione con conferma sta in `docs/24` §8.10. Da lì vengono i sette casi
> aggiunti (L9–L15).

⚠️ **Gli attesi qui sotto sono i REQUISITI, non le soglie.** Le soglie numeriche non esistono
ancora e non vanno inventate: si scelgono **dopo** la misura di §8.9.2. Uno scenario che
dichiarasse «entro N secondi» prima di quella misura sarebbe un atteso costruito a tavolino.

| #   | Caso                                                               | Atteso                                                                                                   | Stato              |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------ |
| L1  | **picco improvviso**: molti aggiornamenti in pochi minuti          | nessuna perdita; il margine verso Shopify regge o l'arretrato si smaltisce; ogni operazione ha uno stato | ⏸ non verificabile |
| L2  | **aggiornamento massivo**: listino o ricarico su tutto il catalogo | idem, e il primo allineamento non viene confuso con l'attività ordinaria (§8.9.1 vs §8.9.3)              | ⏸ non verificabile |
| L3  | **disponibilità e prezzi durante un arretrato descrittivo**        | passano **prima**; le descrizioni restano in coda e **si completano** (§8.9.3)                           | ⏸ non verificabile |
| L4  | **interruzione e ripresa** del primo allineamento                  | si riprende senza perdite; nessun articolo dichiarato completo se parziale (§8.9.1)                      | ⏸ non verificabile |
| L5  | **ripetizione**: la stessa operazione due volte                    | nessuna duplicazione, né locale né su Shopify (§8.9.1)                                                   | ⏸ non verificabile |
| L6  | **modifica DURANTE il primo allineamento**                         | non si perde, non viene sovrascritta dall'allineamento (§8.9.4)                                          | ⏸ non verificabile |
| L7  | **completamento delle attività secondarie** dopo il picco          | l'arretrato meno urgente arriva in fondo: conservato **e** completato                                    | ⏸ non verificabile |
| L8  | **errore permanente** su una singola operazione                    | fallita **con motivo visibile** e possibilità di recupero; non blocca le altre (§8.9.4)                  | ⏸ non verificabile |

#### ⭐ Sette casi AGGIUNTI il 09/09/2026, dopo la ricognizione

> **Preparati, non eseguiti.** Vengono dalla ricognizione registrata in `DA-FARE` §27 e dalla
> proposta di `docs/24` **§8.10**: sono i casi che quella proposta dovrà superare, e che L1–L8
> non coprivano. ⛔ Restano **⏸ non verificabili** per la stessa ragione degli altri: la
> soluzione tecnica non è scelta.

| #   | Caso                                                                                                               | Atteso                                                                                                                                                                | Stato |
| --- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| L9  | **carico massivo INSIEME alle vendite**: importazione in corso mentre il banco vende gli stessi articoli           | nessuna quantità perduta; la vendita non viene sovrascritta dal carico; alla fine il canale ha la quantità **corrente**, non quella di partenza                       | ⏸     |
| L10 | **modifica DURANTE l'invio** di quello stesso articolo                                                             | la modifica sopravvive e arriva; non viene scartata perché «arrivata nel momento sbagliato» (§8.9.4)                                                                  | ⏸     |
| L11 | **doppio clic** sul comando massivo                                                                                | una sola esecuzione, o due esecuzioni che producono lo stesso risultato. ⚠️ Oggi la guardia è **solo nel browser**: una seconda scheda o un ricaricamento la aggirano | ⏸     |
| L12 | **riavvio dell'API** durante un invio massivo                                                                      | ciò che era in coda si riprende; nessun articolo resta bloccato in «in corso»; nessun doppione remoto (§8.9.1)                                                        | ⏸     |
| L13 | **limite di frequenza raggiunto** sul canale                                                                       | l'invio rallenta e prosegue; niente si perde; l'arretrato si smaltisce. ⚠️ Da misurare col margine residuo, non solo con l'esito                                      | ⏸     |
| L14 | **fallimento PARZIALE** di un lotto                                                                                | ciò che è arrivato resta riconosciuto, ciò che è fallito resta visibile con il motivo, e il **recupero non duplica** quanto già inviato                               | ⏸     |
| L15 | **conferma dell'operatore** (se §8.10 verrà approvata): vendita e modifica di un articolo **prima** della conferma | alla conferma parte lo stato **corrente**; niente di ciò che è successo nel frattempo va perduto, in nessuna delle due direzioni                                      | ⏸     |

⚠️ **L15 dipende da una decisione non presa**: senza l'approvazione di §8.10 quel caso non
esiste, e non va eseguito «per vedere che succede».

#### Le quattro MISURE da raccogliere

⭐ **Sono la parte che rende gli scenari qualcosa di più di una descrizione.** Ognuno di L1-L8
va eseguito raccogliendole, altrimenti dice solo «è andata» senza dire quanto margine restava.

| Misura                                  | Che cosa dice                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **consumo API**                         | quanto del budget Shopify si usa — e quanto ne resta al picco, non in media                                                                                                                                                                                                                                                                                                                |
| **arretrato**                           | quante operazioni sono in attesa, e come varia nel tempo                                                                                                                                                                                                                                                                                                                                   |
| **ritardo degli aggiornamenti critici** | quanto tempo passa fra una variazione di disponibilità o prezzo e la sua uscita. ⭐ **I quattro punti dove prenderlo sono censiti** in `DA-FARE` §27.4, e nessuno richiede di inventare un dato nuovo. ⛔ **Non si costruisce sull'«ultimo invio riuscito»**: quel dato dice quando VestiFlow ha spedito, non quando la vetrina ha mostrato, e dopo un ripristino torna indietro nel tempo |
| **tempo di smaltimento**                | quanto ci mette l'arretrato a tornare a zero dopo il picco                                                                                                                                                                                                                                                                                                                                 |

⚠️ **La media giornaliera non è una di queste misure**, ed è esplicito in §8.9.2: va
registrato l'andamento nel tempo, con i massimi. Un margine che regge in media può non
reggere nell'ora in cui il negozio ricarica il magazzino.

#### ⛔ Che cosa NON va dedotto da questo scenario

|                                |                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| le **soglie**                  | non esistono: si scelgono dopo la misura, non prima                                         |
| la **politica delle priorità** | §8.9.3 dice quale famiglia viene prima; code separate, pesi o finestre non sono decisi      |
| la **soluzione tecnica**       | ⛔ registrare gli scenari **non autorizza** a implementare outbox, worker o Bulk Operations |

⚠️ **E la matrice dei campi non è in gioco**: §9.2 resta quella. Qui si parla di _quando_ un
aggiornamento parte e con quale precedenza, mai di _quale direzione_ abbia un campo.

⭐ **Il vincolo K vale anche qui**: su un tenant senza Shopify nessuno di questi meccanismi
deve esistere, misurare o rallentare qualcosa.

---

### M · ⭐ Campagna del CICLO DI UTILIZZO — eseguita il 09/09/2026, tre giri completi

> **Tre aziende sintetiche, due negozi simulati con stato, PostgreSQL vero, servizi veri.**
> Dataset generato (§3), collaudo rieseguibile in
> `api/src/test/integration/collaudo-ciclo-utilizzo.integration-spec.ts`
> (`npm run test:integration -- src/test/integration/collaudo-ciclo-utilizzo.integration-spec.ts`),
> rapporto unico in `docs/RAPPORTO-COLLAUDO-CICLO-UTILIZZO-09-09-2026.md`.

⭐ **Due ripetibilità diverse, e vanno tenute distinte.** Ogni scenario gira **due volte dalla
stessa situazione iniziale** dentro la prova, e i due esiti devono coincidere; l'**idempotenza**
di una richiesta ripetuta sugli stessi dati è invece provata DENTRO gli scenari (S1:
reimportazione; S2: ripetizione del push; S3: stesso webhook due volte). E la campagna intera è
stata lanciata tre volte con lo stesso risultato.

⚠️ **Dentro uno scenario i dati si conservano fra i passaggi**: si azzera solo fra un'esecuzione
e l'altra. Gli attesi sono quelli della matrice §9.2 e delle regole approvate; ⛔ non sono
stati ammorbiditi per il comportamento attuale, e il rosso di D5 è un risultato.

| #       | Scenario                                                                                                                                                                                          | Dimensioni   | Esito                                                                                                                                                                                                                                                                                                                                                  | Rimandi                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **S1**  | importazione → reimportazione → modifica consentita (nome interno in VestiFlow; titolo e barcode su Shopify) → nuovo import                                                                       | 5 · 50 · 500 | ✅ **eseguito** — §9.2 rispettata campo per campo; SKU assente → `SHOPIFY-<id>`, SKU duplicato → suffisso; **1 prodotto per lotto fallisce** (D5)                                                                                                                                                                                                      | C, G1, G2                               |
| **D5**  | barcode **duplicato** in arrivo da Shopify                                                                                                                                                        | 2 articoli   | ⛔ **fallito** — l'import del prodotto cade sull'unicità del barcode, col messaggio che nomina lo SKU (`DA-FARE` §26.1)                                                                                                                                                                                                                                | D5                                      |
| **S2**  | pubblicazione esplicita → aggiornamento (titolo Shopify, prezzo Shopify) → ripetizione, locale e remoto a confronto                                                                               | 5 · 50 · 500 | ✅ **eseguito** — nessuna duplicazione locale né remota; la variante **senza SKU** resta scollegata (comportamento di oggi, dichiarato nel codice, non dalla matrice)                                                                                                                                                                                  | B                                       |
| **S3**  | stesso webhook due volte · richieste identiche concorrenti · modifiche valide **diverse** concorrenti                                                                                             | piccolo      | ✅ **eseguito** — un solo effetto; nessuno stato misto. Il caso **deterministico** è `concorrenza-import` C1–C5 (`DA-FARE` §25)                                                                                                                                                                                                                        | I1, I2 (resta non verificabile l'inbox) |
| **S4**  | variante eliminata dal percorso applicativo → webhook e lotto                                                                                                                                     | piccolo      | ✅ **eseguito** — non ricompare; l'identità resta `local_deleted`; le altre varianti si aggiornano                                                                                                                                                                                                                                                     | H5                                      |
| **S5**  | collegamento **chiuso** con anagrafica viva → eventi successivi                                                                                                                                   | piccolo      | ✅ **eseguito** su situazione **costruita** — webhook `skipped`, nessuna riapertura, nessun doppione (`DA-FARE` §26.5)                                                                                                                                                                                                                                 | E2                                      |
| **S6**  | lotto con validi ed esclusi, due giri                                                                                                                                                             | piccolo      | ✅ **eseguito** — 3 aggiornati, 1 saltato, 0 falliti, due volte; i **motivi persistono** nel registro (§10.3, dal 09/09): una riga `rifiutata` per giro, per il prodotto escluso e per la variante esclusa                                                                                                                                             | H4                                      |
| **S7**  | errore iniettato in un punto preciso → rollback → nuovo tentativo                                                                                                                                 | piccolo      | ✅ **eseguito** — import: rollback completo, poi riesce; push: motivo visibile, riallineamento al tentativo dopo. ⚠️ esito dichiarato `pushed: true` e remoto parziale (`DA-FARE` §26.2, §26.3)                                                                                                                                                        | I4, L8                                  |
| **S8**  | backup → esclusione → ripristino → webhook con barcode nuovo → **push** (con cache · cache azzerata · prodotto chiuso senza cache) · backup → articolo nuovo collegato → ripristino **rifiutato** | piccolo      | ✅ **verificato** per 2b e 3c; il webhook **registra** il riaggancio rifiutato (§10.3) · ⛔ **difetto riprodotto su entrambe le sequenze** (`DA-FARE` §26.7): l'import aggiorna la variante esclusa per cache; il push scrive sul GID vietato, rimette la cache per SKU se azzerata, e su un prodotto chiuso senza cache crea un prodotto remoto nuovo | J1, J3                                  |
| **S9**  | cancellazione di Alfa                                                                                                                                                                             | piccolo      | ✅ **eseguito** — Beta e Gamma identici a prima; traccia `tentativo → riuscita`; Beta continua a importare                                                                                                                                                                                                                                             | J5, K5                                  |
| **S10** | Gamma senza Shopify: creazione, modifica, cestino, ripristino, duplicazione, eliminazione definitiva                                                                                              | piccolo      | ✅ **eseguito** — zero righe di canale, zero chiamate ai negozi simulati                                                                                                                                                                                                                                                                               | K6, H1, H3                              |

#### Che cosa questa campagna NON dice

|                                          |                                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **negozio reale**                        | niente: il simulatore accetta ciò che il servizio manda e non conosce i limiti di Shopify (rate limit, validazioni, permessi) |
| **prestazioni**                          | i tempi sono di questa macchina, su un container con `fsync=off`; 50 e 500 sono dimensioni, non soglie                        |
| **quantità e movimenti**                 | nessuno scenario li coinvolge: non si inventano giacenze iniziali (`DA-FARE` §8)                                              |
| **onboarding, backfill, code, priorità** | fuori, come da mandato                                                                                                        |

### N · ⏸ Il FUNZIONAMENTO RICHIESTO — le sette regole di `docs/24` §8.11

> **Le regole sono confermate; queste sono le prove che le misurano.** Lo stato del codice e la
> differenza da colmare stanno in `DA-FARE` §28, e non si ripetono qui.
>
> ⛔ **Nessuna di queste è stata eseguita**: il mandato del 09/09/2026 era di sola ricognizione.

| Caso    | Azioni                                                                                                                                                                                                         | Atteso e rimando                                                                                                                                                                                                                                                                                                 | Stato                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1**  | due sedi VestiFlow con lo **stesso nome** di due location Shopify; si sincronizzano le sedi                                                                                                                    | ⛔ **nessun collegamento**: l'operatore li sceglie uno-a-uno (§8.11.1). E un ordine senza sede nel payload **non** viene attribuito a una sede indovinata                                                                                                                                                        | ⛔ **fallito atteso**: `findMatch` collega per nome, e la sede dell'ordine ripiega sulla prima in ordine alfabetico                                                                                                                                                                                                                                                                         |
| **N2**  | catalogo popolato da entrambi i lati; si preme l'import                                                                                                                                                        | ⛔ **rifiuto o richiesta di direzione**: la fusione automatica è esclusa (§8.11.2), e nessun articolo di destinazione viene cancellato o sovrascritto                                                                                                                                                            | ⛔ **non verificabile**: il momento della scelta non esiste                                                                                                                                                                                                                                                                                                                                 |
| **N3**  | ⭐ **due ordini online, ma uno solo arrivato a VestiFlow.** Ordine A creato **prima** della connessione, ordine B **dopo**; poi si sincronizzano gli ordini                                                    | **entra solo B.** A resta fuori, e resta fuori anche alle sincronizzazioni successive (§8.11.4)                                                                                                                                                                                                                  | ⛔ **non verificabile**: il confine non è registrato da nessun campo, e l'elenco remoto non è filtrato per data                                                                                                                                                                                                                                                                             |
| **N4a** | ⭐ **vendita locale mentre un ordine online è ancora in transito.** Si vende 1 pz alla cassa VestiFlow; l'ordine Shopify sulla stessa variante è già passato su Shopify ma il suo evento non è ancora arrivato | l'invio della quantità locale **non sovrascrive** la vendita online non ancora acquisita: la scrittura viene **rifiutata dal confronto concorrenziale**, non «vinta» perché VestiFlow è autorevole (§8.11.5)                                                                                                     | ⭐ **coperto dal 09/09/2026**, su Shopify **simulato**: il trasporto è `inventorySetQuantities` con confronto contro l'ultimo valore CONFERMATO, e la scrittura viene rifiutata — prova `P1`. ⚠️ **Copre la finestra, non la correttezza del valore**: se la convinzione di VestiFlow coincide per caso col remoto il confronto passa (`P2`, ancora aperto). Da rieseguire su negozio reale |
| **N4b** | acquisizione di un effetto **già applicato da Shopify** (Caso D)                                                                                                                                               | l'effetto entra in VestiFlow e **non fa partire** un reinvio della disponibilità per quella sola acquisizione (§8.11.5)                                                                                                                                                                                          | ⛔ **fallito atteso, con una copertura parziale nuova**: il Caso D lancia ancora un push. Oggi non arriva al canale per `base_assente` (prova `P4`), che è una protezione **provvisoria**; con una base confermata pari al remoto riscrive lo stesso (prova `P4-bis`). ⛔ **Non è ancora una regola sull'ORIGINE dell'effetto**                                                             |
| **N4c** | ⭐ **riconsegna dello stesso evento**: lo stesso `orders/updated` consegnato tre volte                                                                                                                         | **un solo effetto**: una sola vendita, un solo movimento, giacenza ferma dopo la prima (§8.11.5)                                                                                                                                                                                                                 | ⭐ **eseguibile**: le tre barriere di deduplica esistono — chiave dell'evento, vendita unica per ordine, vincolo unico sul movimento                                                                                                                                                                                                                                                        |
| **N5**  | ⭐ **pausa e ripresa con attività locale e online.** Si sospende; si vende alla cassa VestiFlow; arriva un ordine Shopify; si riprende                                                                         | durante la pausa: il lavoro locale **prosegue**, nessun prodotto archiviato, nessuna quantità azzerata, **e nessuna scrittura verso Shopify**. Alla ripresa l'intervallo non coperto è **dichiarato**, e gli aggiornamenti locali pendenti **non sono stati cancellati** dall'ordine arrivato (§8.11.6, §8.11.5) | ⛔ **non verificabile in parte**: l'interruttore ferma solo l'ingresso, lo stato «sospeso» non esiste, e gli aggiornamenti pendenti non esistono come dato. ⚠️ La metà locale è invece **eseguibile** (vedi `E3`)                                                                                                                                                                           |
| **N6**  | ⭐ **nuovo ordine fra anteprima e conferma del riallineamento.** Si apre l'anteprima del riallineamento; arriva un ordine Shopify sulla variante mostrata; si conferma                                         | ⛔ **la riga cambiata non viene inviata col valore dell'anteprima**: o si rifiuta, o si ricontrolla (§8.11.7)                                                                                                                                                                                                    | ⛔ **non verificabile**: l'anteprima non esiste, e il comando attuale non è per variante e sede                                                                                                                                                                                                                                                                                             |
| **N7**  | import CSV Shopify di articoli con la colonna «Sincronizza con Shopify» valorizzata                                                                                                                            | la colonna è **onorata o rifiutata**, mai ignorata in silenzio; e l'import **non dimostra** un collegamento remoto (§8.11.7)                                                                                                                                                                                     | ⛔ **fallito atteso**: la colonna non esiste e viene scartata senza dirlo. XML fornitori: **non esiste nulla**                                                                                                                                                                                                                                                                              |

⚠️ **N1, N4b e N7 sono «fallito atteso», non «non verificabile»**, e la differenza conta: il
codice c'è e si comporta in modo misurabile — solo, diversamente dalla regola. Sono le prove
che si possono scrivere **subito**, e che diventano verdi con la correzione.

⭐ **N4a è uscito da quel gruppo il 09/09/2026**, ed è la prima riga di questa tabella a
muoversi: la protezione c'è, misurata su Shopify **simulato** (`P1`). ⛔ **Non è la regola di
§8.11.5 soddisfatta**: quella chiede che nessun invio sovrascriva vendite online non ancora
acquisite, e `P2` mostra il caso in cui il confronto passa lo stesso. Vedi `DA-FARE` §29.6.

⏸ **E il riallineamento manuale di §8.11.7 resta richiesto e non fatto**, quindi `N6` resta
non verificabile: dopo questa correzione è anche l'**unica** strada per una divergenza
accertata, perché il ritentativo non la risolve più per costruzione.

---

## 6 · Copertura ASSENTE, dichiarata

⛔ **Queste non sono lacune del piano: sono cose che oggi nessuno può provare**, e vanno
dichiarate invece che lasciate intendere.

| Che cosa                                    | Perché manca                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **negozio Shopify di sviluppo**             | non ne è stato autorizzato nessuno per questa campagna: ogni verifica «Shopify **reale**» resta scoperta                 |
| **il gate di contratto legge il condiviso** | la credenziale cifrata vive solo lì: eseguirlo è un accesso al condiviso, e richiede la sua autorizzazione               |
| **consegna reale dei webhook**              | i webhook arrivano alla produzione, che serve `main`: sul ramo si possono solo **simulare** (HMAC ricalcolato)           |
| **permessi dell'app Shopify**               | non verificati per questa campagna: uno scope mancante fa fallire uno scenario per una ragione che non è quella in prova |
| **interfaccia dei comandi di cestino**      | la vista Cestino è in sola lettura: le verifiche UI di H1-H3 non hanno un pulsante da premere                            |

⚠️ **Una verifica «Shopify» va sempre marcata reale o simulata.** Un mock che risponde quello
che gli si è insegnato non è una prova del canale, ed è la forma di falso verde più facile.

---

## 7 · Registro di esecuzione

⛔ **Vuoto, e resta vuoto finché la campagna non parte.** Si riempie una riga per esecuzione,
non si riscrive una riga esistente.

| Data       | Commit                                                                                                                                           | Scenario                                    | Ambiente                                              | Bersaglio accertato                                                           | Osservato                                                                                                                            | 2ª esecuzione                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 09/09/2026 | albero di lavoro su `feature/shopify-link-history` (base `02bedc7e`), **non committato**                                                         | M, giro 1 (S1–S10 + D5, 5/50/500)           | `localhost:5433/vestiflow_test`, Shopify **simulato** | `ambienteIntegrazione()` + `svuota` → `conStoricoSbloccato` (host e database) | 14 verdi, **D5 fallito**; 125,5 s                                                                                                    | ✅ interna a ogni scenario, esiti identici |
| 09/09/2026 | idem                                                                                                                                             | M, giro 2                                   | idem                                                  | idem                                                                          | 14 verdi, **D5 fallito**; 125,0 s — misure sovrapponibili al giro 1                                                                  | ✅                                         |
| 09/09/2026 | idem                                                                                                                                             | M, giro 3 (con esiti per scenario stampati) | idem                                                  | idem                                                                          | 14 verdi, **D5 fallito**; 143,9 s (lint di radice in parallelo); esiti nel rapporto §5                                               | ✅                                         |
| 09/09/2026 | idem, più registro dei rifiuti (§10.3) e dimostrazione 26.7 in S8                                                                                | M, giro 4                                   | idem                                                  | idem                                                                          | 14 verdi, **D5 fallito**; 129,0 s; S6 legge le righe del registro; S8 registra l'osservato di 26.7                                   | ✅                                         |
| 09/09/2026 | idem, registro corretto sul mandato (riga fuori dalla transazione, correlazione dall'ingresso, `riaggancio_rifiutato`); S8 con ripristino → push | M, giro 5                                   | idem                                                  | idem                                                                          | 14 verdi, **D5 fallito**; 134,9 s; S8: il push scrive sul GID vietato, rimette la cache, crea un prodotto remoto nuovo (rapporto §5) | ✅                                         |

⚠️ **Gli scenari già marcati «eseguito»** (F5, H1, H2, I1, I4, J4) lo sono per le prove di
integrazione che li coprono **oggi**, sul database di prova. ⛔ Non contano come esecuzione
di campagna: quella li ripete tutti insieme, prima del rilascio.
