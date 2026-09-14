# Rapporto — campagna del ciclo di utilizzo Shopify (09/09/2026)

> **Che cos'è.** Il collaudo riproducibile dello scenario **M** del piano
> (`docs/PIANO-COLLAUDO-SHOPIFY.md`): tre aziende sintetiche, due negozi **simulati con stato**,
> PostgreSQL vero, servizi applicativi veri. Eseguito cinque volte per intero, sul solo
> database sacrificabile. ⛔ Nessun accesso al condiviso, nessuna chiamata a Shopify, nessun commit.
>
> **Che cosa NON è.** Non è un rilascio, non misura Shopify né la produzione, e non copre il
> negozio reale. I difetti che ha trovato stanno in `DA-FARE` §26 con la loro riproduzione
> minima; uno solo (26.4, i motivi dei rifiuti) era stato chiuso mentre la campagna girava,
> perché era il secondo blocco autorizzato. ⛔ **Un ✓ non è un requisito verificato**: §4 legge
> ogni scenario in quattro classi.
>
> ⭐ **Aggiornamento della sera del 09/09/2026, DOPO questo rapporto**: il proprietario ha
> autorizzato il blocco **26.7 insieme a 26.2**, ed entrambi sono stati chiusi. Le osservazioni
> qui sotto restano **la riproduzione del difetto**, e vanno lette come tali: descrivono il
> comportamento **prima** del rimedio. Che cosa è cambiato sta in `DA-FARE` §26.

---

## 1 · Come si rilancia

```bash
# prerequisito: il container PostgreSQL di prova (docker-compose.test.yml), porta 5433
cd api
npm run test:integration -- src/test/integration/collaudo-ciclo-utilizzo.integration-spec.ts
```

Durata di un giro completo: **~125 s** su questa macchina. In coda stampa la tabella delle
misure e gli esiti per scenario (§5). Un singolo scenario si isola con `-t "S4 ·"`
(⚠️ su Windows il filtro deve contenere uno spazio, o `cmd` spezza il `|` dell'espressione).

| Pezzo                                   | Dove                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------- |
| gli scenari                             | `api/src/test/integration/collaudo-ciclo-utilizzo.integration-spec.ts`    |
| il negozio simulato                     | `api/src/test/integration/shopify-simulato.util.ts`                       |
| il dataset generato                     | `api/src/test/fixtures/collaudo-ciclo-utilizzo.dataset.ts`                |
| le prove deterministiche di concorrenza | `api/src/test/integration/concorrenza-import.integration-spec.ts` (C1–C5) |
| il costo del registro sul pool          | `api/src/test/integration/registro-pool.integration-spec.ts` (P1, P2)     |

## 2 · Bersaglio accertato

| Bersaglio | Come                                                                                                                                         | Esito                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| database  | `ambienteIntegrazione()` (host, porta, nome) e la barriera di `conStoricoSbloccato` a ogni `svuota`                                          | `localhost:5433/vestiflow_test`  |
| API       | i servizi istanziati dalla prova (`ShopifyProductPullService`, `ShopifyProductPushService`, `ProductsService`, backup, cancellazione tenant) | nessun server in ascolto riusato |
| Shopify   | `NegozioSimulato`, un'istanza per azienda, id nella fascia riservata `99xxxx`                                                                | **simulato**; zero rete          |

## 3 · Dati utilizzati

| Azienda            | Profilo                     | Negozio simulato                              | Contenuto iniziale                                       |
| ------------------ | --------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| **COLLAUDO ALFA**  | canale Shopify              | `collaudo-alfa.myshopify.com`, id da `990100` | vuota; riceve il catalogo remoto o locale dello scenario |
| **COLLAUDO BETA**  | canale Shopify              | `collaudo-beta.myshopify.com`, id da `995100` | vuota (S9: 3 articoli importati)                         |
| **COLLAUDO GAMMA** | `gestionale`, senza Shopify | —                                             | 5 articoli locali e 1 documento                          |

**Cataloghi generati, deterministici** (`catalogoRemoto` / `catalogoLocale`): 1–3 varianti per
articolo (taglie), prezzi e barcode derivati dall'indice. Anomalie **ammesse dalle regole**
(`regole-gestionale`, clausola di realtà): SKU assente (multipli di 7), barcode assente
(multipli di 11), SKU duplicato fra prodotti (multipli di 13), **un** barcode duplicato (il 17,
o il 5° nel catalogo piccolo). Nel catalogo locale: una variante senza SKU (multipli di 7).

⚠️ **5, 50 e 500 sono dimensioni di prova**, scelte per vedere che le sequenze reggono con
più righe e più anomalie. Non sono soglie di prestazione e non dicono niente sulla capacità di
Shopify (`docs/24` §8.9.2 vuole una misura sul negozio).

## 4 · Scenari e risultati

Ogni scenario gira **due volte dalla stessa situazione iniziale** dentro la prova, e la seconda
deve dare lo stesso esito (`dueEsecuzioni`). Questa è la ripetibilità del piano; l'**idempotenza**
di una richiesta ripetuta è provata dentro S1, S2 e S3. Dopo ogni passaggio si confrontano:
prodotti e varianti con i loro identificativi locali e remoti; identità, periodi e causali;
campi modificati e campi che devono restare invariati (matrice `docs/24` §9.2); isolamento
(Beta e Gamma fotografati prima e dopo); risultato dichiarato contro avvenuto.

⛔ **Un ✓ di Vitest non è un requisito verificato.** Ogni scenario è letto in quattro classi, e
uno scenario verde può contenerle tutte e quattro:

| Classe                         | Significa                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **verificato**                 | una regola approvata lo stabilisce, e la prova lo asserisce                                                     |
| **verificato in parte**        | la regola c'è, ma la prova ne copre un pezzo, o lo copre su una situazione costruita                            |
| **difetto riprodotto**         | la prova mostra un comportamento contrario a una regola approvata: resta rossa, o lo registra senza ammorbidire |
| **osservato senza conformità** | nessuna regola decide: la prova **registra** e non asserisce                                                    |

| #       | Sequenza                                                                                                                                                                          | Dim.         | ✅ Verificato                                                                                                                                                                         | ⚠️ Verificato in parte                                                                                                                                                                                                                                           | ⛔ Difetto riprodotto                                                                                                                                                                                                                                                                      | 👁 Osservato, senza asserzione                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1**  | importazione → reimportazione → modifica consentita → nuovo import                                                                                                                | 5 · 50 · 500 | `Product.name` solo VestiFlow (§1.9); titolo Shopify e barcode bidirezionali (§9.2); reimportazione idempotente; identità e periodi (B2); nessun doppione                             | **la matrice §9.2 è coperta per 7 campi** (nome, titolo, vendor, tipo, tag, barcode, prezzo Shopify): descrizione, SEO, immagini, metafield, stato, opzioni **non** sono asseriti · lo **SKU** rinominato su Shopify non arriva (26.6) e S1 **non lo asserisce** | **1 prodotto per lotto fallisce** — è D5 (26.1): S1 lo tollera esplicitamente e lo registra nell'esito, non lo nasconde                                                                                                                                                                    | il messaggio del fallimento («Conflitto su SKU o codici prodotto»)                                                                                               |
| **D5**  | un barcode duplicato in arrivo                                                                                                                                                    | 2 articoli   | —                                                                                                                                                                                     | —                                                                                                                                                                                                                                                                | ⛔ **rossa e lasciata rossa**: atteso del piano «importato e segnalato», osservato `failed` (26.1)                                                                                                                                                                                         | —                                                                                                                                                                |
| **S2**  | pubblicazione esplicita → aggiornamento → ripetizione                                                                                                                             | 5 · 50 · 500 | remoto = locale sui campi che il push manda; nessuna duplicazione; ripetizione senza effetti; identità (B3)                                                                           | solo i campi del push di oggi (titolo, descrizione, vendor, tipo, tag, stato, SKU, barcode, prezzo): immagini, metafield e tassonomia sono mock vuoti                                                                                                            | —                                                                                                                                                                                                                                                                                          | la variante **senza SKU** resta scollegata: comportamento del codice, non regola                                                                                 |
| **S3**  | webhook duplicato · identiche concorrenti · modifiche diverse concorrenti                                                                                                         | piccolo      | un solo effetto; nessuno stato misto; nessun doppione (§25)                                                                                                                           | l'ordine lo decide lo scheduler: il deterministico è C1–C5. ⛔ **Non verifica l'ordine cronologico** degli eventi: §25 risolve gli incroci, non chi sia il più recente (§8.5.3, non implementato)                                                                | —                                                                                                                                                                                                                                                                                          | quale dei due eventi «vince»                                                                                                                                     |
| **S4**  | variante eliminata dal percorso applicativo → webhook → lotto                                                                                                                     | piccolo      | non ricompare (B5–B6, §11.8); identità e periodo (B4); le altre varianti si aggiornano                                                                                                | —                                                                                                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                |
| **S5**  | collegamento chiuso, anagrafica viva → eventi                                                                                                                                     | piccolo      | nessuna riapertura, nessun doppione, webhook `skipped` (B5a)                                                                                                                          | **situazione costruita via SQL**: nessun percorso applicativo la produce (26.5)                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                |
| **S6**  | lotto con esclusi, due giri                                                                                                                                                       | piccolo      | esclusi restano esclusi, gli altri completano (B5–B6); ⭐ **i motivi persistono**: una riga `rifiutata` nel registro per giro, prodotto e variante (§10.3, dal 09/09)                 | l'articolo eliminato definitivamente è **costruito** (26.5)                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                |
| **S7**  | guasto iniettato → rollback → nuovo tentativo                                                                                                                                     | piccolo      | import: rollback completo, poi riesce; push: **motivo visibile** sul prodotto e recupero possibile (§8.9.4)                                                                           | §8.9.4 dice «fallita con motivo visibile»: qui è verificato lo **stato del prodotto**, non l'esito dell'**operazione**, che è falso (colonna accanto)                                                                                                            | ⛔ `pushProduct` dichiara `pushed: true` mentre l'aggiornamento remoto è fallito (26.2) — registrato nell'esito, **non** asserito né in un verso né nell'altro                                                                                                                             | il remoto **parziale** durante il guasto: titolo già aggiornato, varianti no (26.3)                                                                              |
| **S8**  | backup → esclusione → ripristino → **webhook con barcode nuovo** → **push** (con cache · con cache azzerata · prodotto chiuso senza cache) · backup → articolo nuovo → ripristino | piccolo      | 2b: l'esclusione **resta scritta** (identità, periodi); 3c: ripristino rifiutato nominando l'articolo; ⭐ il webhook **registra** `riaggancio_rifiutato (identita_eliminata)` (§10.3) | 2b è verificata **sullo storico**: sulla cache, sull'anagrafica ripristinate e sul push non esiste una regola da asserire                                                                                                                                        | ⛔ **26.7 su entrambe le sequenze**: l'import **aggiorna la variante esclusa** per cache; il push **scrive sul GID vietato**; con la cache azzerata il push **la rimette** per SKU; sul prodotto chiuso senza cache il push **crea un prodotto remoto nuovo** con identità e periodo nuovi | riga tornata con cache `990113`; barcode nuovo arrivato; prezzo 123,45 sul GID vietato; cache rimessa `990113`; +1 prodotto remoto, 2 identità, 1 periodo attivo |
| **S9**  | cancellazione di Alfa                                                                                                                                                             | piccolo      | Alfa sparisce con la traccia `tentativo → riuscita`; Beta e Gamma identici (§10.2, K5)                                                                                                | —                                                                                                                                                                                                                                                                | —                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                |
| **S10** | Gamma senza Shopify                                                                                                                                                               | piccolo      | 0 righe di canale, 0 chiamate; documento intatto; eliminazione definitiva locale (H3)                                                                                                 | la facciata del canale era **finta**: che sia lei a fermarsi per un tenant `gestionale` lo provano K7, non S10                                                                                                                                                   | —                                                                                                                                                                                                                                                                                          | la facciata invocata 7 volte                                                                                                                                     |

**Quattro giri completi**: `14 verdi · 1 fallito (D5)` ogni volta — 125,5 s · 125,0 s · 143,9 s
(col lint di radice in parallelo) · 129,0 s (giro 4: registro dei rifiuti e dimostrazione 26.7).

## 5 · Misure

⚠️ **Descrivono la PROVA** — questa macchina, container con `fsync=off`, simulatore in memoria.
Non se ne deduce la capacità di Shopify né le prestazioni della produzione.

`completate` = import/aggiornamenti/push riusciti; `scartate` = `skipped`; `fallite` = prodotti
in `failed` o push non riusciti; `chiamate simulate` = invocazioni ai due negozi simulati
(REST + GraphQL + arricchimento) durante lo scenario.

| scenario | esecuzione | durata ms (giro 1 / giro 2)   | completate | scartate | fallite | chiamate simulate |
| -------- | ---------- | ----------------------------- | ---------- | -------- | ------- | ----------------- |
| S1/5     | 1 · 2      | 421 / 467 · 356 / 341         | 13         | 0        | 3       | 19                |
| S1/50    | 1 · 2      | 3068 / 2919 · 2809 / 2879     | 148        | 0        | 3       | 154               |
| S1/500   | 1 · 2      | 30740 / 31183 · 30940 / 30514 | 1498       | 0        | 3       | 1504              |
| S2/5     | 1 · 2      | 279 / 309 · 270 / 268         | 7          | 0        | 0       | 20                |
| S2/50    | 1 · 2      | 1932 / 1962 · 2070 / 1959     | 52         | 0        | 0       | 110               |
| S2/500   | 1 · 2      | 20079 / 19812 · 19706 / 19439 | 502        | 0        | 0       | 1010              |
| S3       | 1 · 2      | 184 / 188 · 164 / 169         | 7          | 0        | 0       | 7                 |
| S4       | 1 · 2      | 130 / 132 · 134 / 136         | 3          | 0        | 0       | 4                 |
| S5       | 1 · 2      | 85 / 92 · 72 / 71             | 1          | 2        | 0       | 4                 |
| S6       | 1 · 2      | 320 / 301 · 278 / 278         | 10         | 2        | 0       | 15                |
| S7       | 1 · 2      | 159 / 157 · 172 / 159         | 4          | 0        | 2       | 11                |
| S8       | 1 · 2      | 808 / 754 · 696 / 687         | 7          | 0        | 1       | 7                 |
| S9       | 1 · 2      | 520 / 527 · 494 / 625         | 11         | 0        | 0       | 13                |
| S10      | 1 · 2      | 73 / 94 · 71 / 80             | 5          | 0        | 0       | 0                 |

Le tre `fallite` di S1 sono lo stesso prodotto (D5) a ognuno dei tre pull; le 2 di S7 sono i
due guasti iniettati; quella di S8 è il ripristino rifiutato per regola.

⭐ **Lettura utile**: a 500 articoli l'import costa ~3 chiamate simulate per articolo (lista,
arricchimento, …) e il push ~2; i tempi crescono in modo lineare con la dimensione (S1: 0,4 s →
3 s → 31 s). Che cosa significhi contro Shopify vero lo dirà la misura di §8.9.2, non questo.

### Esiti per scenario (giro 5, esecuzione 1 — la 2 è identica per costruzione della prova)

```text
S1/5    importati 4 · falliti [990120] (D5: «Conflitto su SKU o codici prodotto…») · prodotti 4 · varianti 8 · identità 4 · identità varianti 8
S1/50   importati 49 · falliti [990180] · prodotti 49 · varianti 98 · identità 49/98
S1/500  importati 499 · falliti [990180] · prodotti 499 · varianti 998 · identità 499/998
S2/5    pubblicati 5 · remoti 5 · identità 5 · identità varianti 10 · scollegate senza SKU 1
S2/50   pubblicati 50 · remoti 50 · identità 50 · identità varianti 94 · scollegate senza SKU 7
S2/500  pubblicati 500 · remoti 500 · identità 500 · identità varianti 930 · scollegate senza SKU 71
S3      prodotti 3 · identità 3 · identità varianti 6 · esiti delle identiche concorrenti [imported, updated]
S4      varianti 2 · identità varianti 3 (1 eliminata)
S5      webhook skipped · lotto [0 importati, 0 aggiornati, 1 saltato, 0 falliti] · prodotti 1
S6      giri [[0,3,1,0],[0,3,1,0]] · prodotti 3 · identità 4 (1 eliminata) · registro: 1 riga per giro (prodotto) + 1 per giro (variante)
S7      titolo remoto durante il guasto «Titolo con guasto» · stato out_of_sync · dichiarato pushed:true
S8      prodotti 5 · identità 6 · identità varianti 12 (giro 5: il push ha creato un prodotto remoto in più, con identità e periodo)
        osservato 26.7 — webhook: riga tornata dal backup SÌ · cache dopo il ripristino 990113 · barcode dopo il webhook 8007777777770 (ARRIVATO) ·
        cache dopo il webhook 990113 · rifiuti registrati per la variante [riaggancio_rifiutato (identita_eliminata)]
        osservato 26.7 — push: con cache → pushed true, prezzo remoto sul GID vietato 123.45 · con cache AZZERATA → pushed true, cache RIMESSA 990113,
        identità non riagganciata, periodi [unlinked] · prodotto CHIUSO senza cache → pushed true, +1 prodotto remoto, cache nuova ≠ GID chiuso,
        identità del prodotto 2, periodi attivi 1
S9      Alfa 0 prodotti · Beta 3 · traccia [tentativo, riuscita]
S10     prodotti 6 · documenti 1 · facciata del canale invocata 7 volte (enqueueProductPush) — finta, ha solo contato
```

⚠️ **Due letture che meritano una riga.** In S8 la **riga** della variante esclusa dopo il backup
torna dal ripristino con la cache `shopify_variant_id` valorizzata; il webhook successivo — con
un barcode riconoscibile — la **aggiorna** (registrando ora il riaggancio rifiutato), il push
**scrive sul GID vietato**, e tolta la cache il push **la rimette** per SKU — o, sul prodotto col
collegamento chiuso, **crea un prodotto remoto nuovo**. **L'esclusione resta scritta, ma non viene
rispettata dai percorsi operativi**, e il solo azzeramento della cache non basta (§6, 26.7;
dimostrazione completa e rimedio corretto in `DA-FARE` §26.7). In S10 la facciata del canale
viene invocata anche per un tenant `gestionale`: è la facciata vera a fermarsi (prove K7); qui
era finta e ha contato le chiamate — nessuna ha raggiunto un negozio.

## 6 · Difetti riproducibili — registrati in `DA-FARE` §26

⛔ **Tre cause diverse, tre interventi diversi.** §24 (creazione remota riuscita con esito locale
fallito), 26.1 (barcode duplicato in arrivo) e 26.2 (esito falso di `pushProduct`) somigliano
solo nella forma — «qualcosa fallisce a metà» — e **non si affrontano come intervento unico**.

| #    | Difetto                                                                                                                  | Riproduzione minima                                                                        | Stato                                                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26.1 | un **barcode duplicato** in arrivo fa fallire l'import del prodotto, e il messaggio nomina lo **SKU**                    | prova `D5`, rossa                                                                          | ⛔ aperto — intervento a sé                                                                                                                                                                                                                                                                                               |
| 26.2 | `pushProduct` dichiara `pushed: true` quando l'aggiornamento remoto è fallito (stato `out_of_sync`, non `error`)         | `S7`, esito registrato                                                                     | ✅ **CHIUSO la sera del 09/09/2026** insieme a 26.7: l'esito lo dichiara il lavoro (`outcome`), e `S7` ora lo **asserisce**                                                                                                                                                                                               |
| 26.3 | il push **non è atomico** sul remoto: titolo aggiornato, varianti no                                                     | `S7`, esito registrato                                                                     | ℹ️ limite dichiarato; §24 è il caso peggiore della famiglia, e resta a sé                                                                                                                                                                                                                                                 |
| 26.4 | i **motivi** delle esclusioni non persistevano                                                                           | `S6`, `divieto-ricreazione` B5a·B5a-bis·B5a-ter·B5a-quater·B6a·B6c·B6d·B6f·B6g·B6h·B6i·B6j | ✅ **chiuso il 09/09, conforme al mandato**: la riga sopravvive al rollback dell'import (B6i), il registro guasto fa cadere l'import prima del commit (B6j), la correlazione è quella dell'ingresso (B6c, S6), la copertura è completa — anche i collegamenti chiusi con identificativi presenti (`riaggancio_rifiutato`) |
| 26.5 | nessun percorso applicativo **chiude un collegamento** senza eliminare, né elimina definitivamente un articolo collegato | `S5`, `S6` (situazioni costruite)                                                          | ℹ️ limite                                                                                                                                                                                                                                                                                                                 |
| 26.6 | lo **SKU** rinominato su Shopify non arriva sulla variante già abbinata                                                  | `concorrenza-import` C2/C4                                                                 | ⛔ **implementazione mancante** di una decisione presa (§9.2: bidirezionale)                                                                                                                                                                                                                                              |
| 26.7 | dopo un **ripristino** l'esclusione resta scritta ma **non viene rispettata** — dall'import **e dal push**               | `S8`, esiti `osservato26_7` e `osservatoPush`, entrambe le sequenze                        | ✅ **CHIUSO la sera del 09/09/2026**: import e push interrogano lo storico prima di usare un identificativo, il ripristino allinea le cache, ogni rifiuto è registrato. Prove nuove `collegamento-escluso` E1–E12, sette guardie falsificate una per una; `S8` è passata da osservazione ad asserzione                    |

⛔ **Gli attesi non sono stati modificati** per far passare il comportamento attuale: D5 resta
rossa; S7 asserisce solo l'atteso approvato (motivo visibile, recupero possibile) e registra
l'esito dichiarato senza asserirlo; S8 asserisce 2b sullo storico e registra il resto.

## 7 · Limiti di questa campagna

| Limite                                     | Perché                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shopify simulato**                       | il simulatore accetta ciò che il servizio manda: non conosce rate limit, validazioni, permessi, né il comportamento su id inesistenti. Ogni verifica «reale» resta scoperta (piano §6) |
| **la matrice §9.2 è coperta in parte**     | S1 e S2 asseriscono 7 campi; descrizione, SEO, immagini, metafield, stato, opzioni e lo SKU sul ri-sync non hanno un'asserzione di conformità                                          |
| **l'ordine degli eventi non è verificato** | S3 e §25 risolvono gli **incroci**; chi sia il payload più recente lo decide `docs/24` §8.5.3, che non è implementato (I2–I3)                                                          |
| **situazioni costruite** (S5, S6)          | «collegamento chiuso con anagrafica viva» e «articolo collegato eliminato definitivamente» non hanno un percorso applicativo: si costruiscono via SQL come in B5a e B6                 |
| **quantità e movimenti**                   | nessuno scenario li coinvolge: non si inventano giacenze iniziali (`DA-FARE` §8 è aperto)                                                                                              |
| **onboarding, matching, backfill, code**   | fuori perimetro e non implementati: non si inventano comportamenti                                                                                                                     |
| **UI**                                     | nessuna verifica a schermo: gli scenari passano dai servizi; il registro dei rifiuti non ha una schermata                                                                              |
| **suite di integrazione instabile**        | fuori da questa campagna, e **non attribuita**: le evidenze dei due giri rossi del 09/09 sono in `DA-FARE` §21-bis, «Episodi del 09/09/2026»; un giro verde non li chiude              |

## 8 · I due blocchi autorizzati, e come sono finiti

| Blocco                                       | Esito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§25 — concorrenza d'import**               | ✅ chiuso: `importProduct` è una transazione sola, lock `(tenant, prodotto remoto)` **prima** della lettura; chi aspetta rilegge e **aggiorna** col proprio payload. `C1`–`C5` riscritte, falsificate (F1 lock tolto, F2 lock dopo la lettura). ⚠️ Risolve gli incroci provati, **non** l'ordine cronologico degli eventi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **§10.3 — registro persistente dei rifiuti** | ✅ chiuso **conforme al mandato**, dopo una prima stesura corretta lo stesso giorno: la riga si scrive su una **connessione propria** e **sopravvive al rollback** dell'import senza dichiararne l'esito (B6i); se il registro non scrive, l'import **non commette e lo dice** (B6j); la correlazione è quella dell'**ingresso** — un lotto, una consegna (B6c, B6i, B6k, S6); la copertura è **completa** sui rifiuti autorizzati, compresi i collegamenti chiusi con identificativi presenti, col terzo valore `riaggancio_rifiutato` che §10.3 elencava fin dall'inizio (B5a, B5a-bis, B5a-ter, B5a-quater, B5f, B5f-bis, B6f, B6g, B6h, B6h-bis; B5d/B5e asseriscono il registro vuoto senza negozio). Falsificato in tre direzioni: scrittura spenta, riga dentro `tx`, errore ingoiato. ⭐ Il **push** è entrato la sera stessa con 26.7: riceve la correlazione dell'ingresso e scrive `riaggancio_rifiutato` e `ripubblicazione_rifiutata` con attore `push` |
| **§10.3 — il costo sul pool**                | ✅ difetto misurato e **corretto** il 09/09: connessione **riservata** al registro (`connection_limit=1`, stesso database) per le sole scritture autonome; `conRegistro` e le transazioni operative di cestino e cancellazione azienda **restano sul client applicativo**. `P1` pretende ora cinque `skipped`, cinque righe e **nessun timeout**; falsificata rimettendo le scritture sul pool condiviso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| verifiche                                    | build API e type-check dei test puliti; 2 558 unitarie verdi; 40 prove d'integrazione dei file toccati verdi; campagna M giro 4 identica ai precedenti; lint di radice verde con tutte le guardie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 9 · Che cosa resta necessario prima del rilascio

1. ⛔ **§24** — il prodotto remoto orfano dopo un fallimento locale: bloccante, aperto, **intervento a sé**.
2. ⛔ **Collaudo sul negozio di sviluppo** (piano §6): tutto ciò che qui è «simulato» va ripetuto sul reale, con la credenziale letta dal condiviso previa autorizzazione.
3. ✅ **26.7 — chiuso la sera del 09/09/2026.** ⚠️ Resta una **dipendenza dichiarata**: né il riaggancio (`docs/24` §8.5.2) né «Pubblica nuovamente» (§11.9) esistono come comando, quindi un articolo rifiutato resta bloccato verso Shopify. Va colmata prima di presentare la funzione come completa.
4. ⚠️ **26.1** — barcode duplicato in arrivo: importare e segnalare, come per lo SKU; correggere il messaggio. **Intervento a sé.**
5. ✅ **26.2 — chiuso la sera del 09/09/2026**, insieme a 26.7.
6. ⚠️ **26.6** — SKU bidirezionale sul ri-sync: implementazione mancante di una decisione presa.
7. ⚠️ **Giacenze iniziali e primo allineamento** (`DA-FARE` §8, `docs/24` §8.9.1): non implementati, non provabili.
8. ⚠️ **§21-bis** — l'instabilità della suite: evidenze conservate, causa non attribuita; al prossimo episodio il log si salva intero.
9. ✅ **Il costo del registro sul pool** — misurato e **corretto** il 09/09 (`registro-pool`):
   con `connection_limit=5` cinque import che rifiutavano insieme si esaurivano a vicenda (0
   righe, 5 cadute a 10 s); con la connessione riservata al registro completano tutti e cinque
   e scrivono cinque righe in 56 ms. Falsificato. ⚠️ Non certifica capacità illimitata: le
   attese si misurano (`DA-FARE` §10.3).
10. ℹ️ Il registro dei rifiuti non ha una schermata, e il rifiuto sul push (§8.5.4) non esiste.

## 10 · Prossimo intervento circoscritto consigliato

**26.7**, da solo: è l'unico dei difetti riprodotti che ha già una dimostrazione completa (S8),
una regola approvata a un passo (2b protegge lo storico) e un rimedio minimo scritto — allineare
la cache allo storico al ripristino, senza cancellare dati né cambiare regole. Chiuso quello, la
catena «esclusione → ripristino → webhook» diventa verificabile per intero, con il rifiuto
registrato dal §10.3 appena fatto. §24, 26.1 e 26.2 restano tre interventi separati, ognuno
con la propria riproduzione (`storico-push` 3h, `D5`, `S7`).
