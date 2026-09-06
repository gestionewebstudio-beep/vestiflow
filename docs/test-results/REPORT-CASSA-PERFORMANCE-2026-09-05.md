# Cassa: caricamento dei registri, 05/09/2026

La finestra desktop veniva disattivata durante il caricamento. A 5.000 operazioni,
due misure passano da **30.917–35.788 ms a 686–704 ms**, con lo stesso insieme
completo, gli stessi template proiettati e 43 righe / 1.125 nodi a regime.
La modalità compatta resta lenta a grandi volumi: **34.175 ms a 5.000 card**.
Questa tranche corregge il caricamento desktop, non completa l'ottimizzazione mobile.

Correzione e prove nel commit locale `e2913da9`, ramo `feature/recupero-cassa`.

Aggiornamento successivo: il [controllo mobile](REPORT-CASSA-MOBILE-2026-09-05.md)
riduce il caricamento di 5.000 card a 6,2–6,4 secondi. Le misure qui sotto
descrivono la prima tranche e restano conservate come confronto.

## Causa e prova

`ListPageComponent` istanzia il contenuto di `[data]` anche mentre mostra lo
skeleton; lo slot dati è allora staccato dal DOM. `DataTableComponent.avviaFinestra`
leggeva `scroller.clientHeight = 0` e sovrascriveva la stima iniziale di 800.
`finestraAttiva()` diventava falsa. Alla risposta API, `righeDaRendere()` restituiva
l'array completo e il primo rendering istanziava tutte le righe. Solo la misura
successiva del contenitore visibile riattivava la finestra.

La correzione conserva l'ultima misura positiva (o la stima iniziale) quando il
contenitore non è misurabile. Nessun taglio ai dati, modifica ai consumer, renderer
alternativo, aggiornamento di dipendenze o modifica a schema/migration.

Le query dei template restano reattive. In Angular installato, `collectQueryResults`
attraversa anche le viste create dai template proiettati (`MOVED_VIEWS`). Creare
queste viste invalida la query; le successive letture di `templateFor` la aggiornano
mentre l'albero cresce. La memoizzazione esistente non impedisce queste invalidazioni.
Il caricamento integrale temporaneo rende quindi rilevante il costo superlineare
delle query, anche se alla fine restano solo 43 righe.

Evidenze indipendenti:

- Il test `data-table-loading.component.spec.ts`, con contenitore a misura zero e
  dati arrivati dopo lo stato vuoto, fallisce prima della correzione:
  `expected 1000 to be less than 120`. Dopo passa e il conteggio accessibile resta 1.001.
- I campioni rAF prima mostrano picchi di 1.000 e 2.000 righe alle rispettive scale.
  A 5.000 il rAF vede soltanto 43: creazione e rimozione possono avvenire tra due
  campioni. **Un picco rAF di 43 non dimostra che 5.000 viste non siano state create.**
- La prova browser rafforzata conta anche le identità assegnate a `data-row-id`,
  comprese le righe staccate: dopo la correzione ne vengono create 56 all'avvio.
  Ripristinando temporaneamente solo la lettura della misura zero, la stessa prova
  fallisce contando 5.000 identità (`expected 5000 to be less than 120`). Il codice
  corretto è stato poi ripristinato e le prove browser sono passate.
  Log e trace della falsificazione: `test-results/cassa-defect-proof.log` e
  `test-results/cassa-defect-proof/`.
- Tempo inclusivo campionato sotto `refreshSignalQuery`, a 5.000 righe:
  **25.856–30.634 ms prima, 4–5 ms dopo**. `ScriptDuration` scende da
  29.512–34.373 ms a 88–89 ms. Non è un miglioramento ottenuto dalla rete mock.

## Misure riproducibili

Windows, Node 22.13.1, Angular 21.2.19, Playwright 1.62.1,
Chromium 151.0.7922.34. Build `e2e` non ottimizzata, un worker, nessun throttling;
desktop 1440 × 900. Due esecuzioni per scala. Baseline del codice applicativo:
`1974cd84`; il nuovo harness era già presente prima della modifica.

| Righe | Caricamento prima (ms) | Dopo (ms) | Alla risposta mock, prima / dopo (ms) | Dopo la risposta, prima / dopo (ms) | Scroll al fondo, prima / dopo (ms) |
| ----: | ---------------------: | --------: | ------------------------------------: | ----------------------------------: | ---------------------------------: |
|   100 |                673–694 |   611–622 |                     529–564 / 503–519 |                   130–144 / 103–108 |                      51–52 / 54–81 |
| 1.000 |            1.814–1.935 |   619–628 |                     514–545 / 514–532 |                1.300–1.390 / 96–105 |                      59–69 / 52–58 |
| 2.000 |            5.028–5.300 |   639–648 |                     573–608 / 526–537 |               4.420–4.727 / 111–113 |                      38–61 / 45–47 |
| 5.000 |          30.917–35.788 |   686–704 |                     654–688 / 558–575 |             30.263–35.100 / 128–129 |                      45–69 / 65–77 |

43 righe e 1.125 nodi della tabella a regime in tutti i campioni desktop.
Lo scroll non aveva il costo iniziale: i numeri non dimostrano un suo miglioramento.

Il server completa la compilazione prima delle prove. Ogni prova visita prima il
registro per scaldare i moduli, poi torna alla dashboard; questa prima visita è
fuori dalla misura. La seconda navigazione è profilata. Il caricamento termina alla
prima riga visibile; in compatto attende anche tutte le card. La colonna "dopo la
risposta" include parsing, Angular, layout e attesa dell'asserzione Playwright:
non è una misura di solo paint. Anche la colonna "alla risposta" include bootstrap
e navigazione, non è latenza di rete reale. Lo scroll termina quando l'ultima riga
è visibile, senza sleep prefissati. La profilazione CDP è accesa sia prima sia dopo.

Numeri e profili sintetizzati: `CASSA-PERFORMANCE-2026-09-05.json` in questa cartella.
Profili CPU integrali e JSON originali, conservati localmente:
`test-results/cassa-performance/{before,after,after-mobile}/`.
Le misure sono di un browser desktop sulla macchina di sviluppo: non sono INP di
campo né una garanzia sui tempi di ogni dispositivo o ambiente di produzione.

Esecuzione PowerShell, dalla root (4310 deve essere libera):

```powershell
$env:E2E_USE_MOCK_AUTH = '1'
$env:E2E_BASE_URL = 'http://127.0.0.1:4310'
$env:CASSA_PERF_PHASE = 'after'
node node_modules/@playwright/test/cli.js test --config=e2e/cassa-isolated.config.ts cassa-performance --repeat-each=2
# Misura separata delle card:
$env:CASSA_PERF_MOBILE = '1'
node node_modules/@playwright/test/cli.js test --config=e2e/cassa-isolated.config.ts cassa-performance
Remove-Item Env:CASSA_PERF_MOBILE
```

La configurazione isolata avvia solo il frontend E2E, rifiuta la porta 4200 e il
riuso di server esistenti. Le fixture rispondono alle API; una richiesta API non
prevista riceve 404 nel browser. Nessuna API reale, autenticazione Supabase o DB.
`cassa-render-window.spec.ts` è incluso anche nel `testMatch` ordinario di
`chromium-ci`. Il 06/09 è stato rinominato il test, che usa già le schermate reali:
i tre file del componente sperimentale non collegato sono stati rimossi.
Asserzioni e misure restano conservate; nessun intervento sullo scroll o sul motore.

## Residuo compatto

390 × 844, una misura per scala, nessuna limitazione del contenuto delle card:

|  Card | Caricamento (ms) | Scroll al fondo (ms) | Nodi tabella |
| ----: | ---------------: | -------------------: | -----------: |
|   100 |              693 |                   71 |        2.548 |
| 1.000 |            2.375 |                  251 |       25.048 |
| 2.000 |            5.269 |                  439 |       50.048 |
| 5.000 |           34.175 |                1.226 |      125.048 |

La finestra ad altezza uniforme resta intenzionalmente spenta sulle card ad
altezza variabile. A 5.000 il risultato resta inutilizzabile per un uso operativo
reattivo. Serve una tranche dedicata al rendering compatto; non basta una riga ad
altezza fissa, un taglio del testo o un tetto ai risultati.

## Confronto con il passaggio di contesto

Sono superate le note sul tetto 100 e sul sort spento in `DA-FARE` e nella specifica
§13-septies: entrambi i consumer chiedono `all=1` e ordinano tutto il filtro.
Anche l'assenza dei totali Sessioni è superata: `totaliDiElenco` somma le colonne
previste dell'intero filtro. Il commento del catalogo colonne ripeteva le vecchie
limitazioni. Il rinvio generale della virtualizzazione in fondo a `DA-FARE` non
vincola questa tranche Cassa espressamente autorizzata.

La regola generale clic-documento → Modifica diverge dal contratto specifico Cassa
(operazioni concluse consultabili, correzione con reso); si preserva il dettaglio
Cassa approvato. Le note "migration applicata" riguardano il contesto di collaudo:
non certificano il condiviso. Questa tranche non ne verifica lo stato né autorizza
rilascio, merge o applicazioni di migration. Nessuna decisione fiscale è stata dedotta.

## Verifiche

Controlli completati sulla correzione:

- `npm run test:everything`: **5.735 test passati in 523 file** (2.038 frontend,
  1.268 componenti, 2.429 API). Coverage frontend: statement 86,34%, branch 81,04%,
  funzioni 81,83%, linee 86,77%, sopra le soglie del repository.
  Log: `test-results/cassa-full-suite-final.log`.
- **24 prove browser passate**, con API intercettate: Cassa, filtri Fornitori e
  tabella condivisa. Sono coperti ordinamento e filtro su tutto il risultato,
  ultima riga e dettaglio, allineamento, resize colonne, scroll orizzontale,
  tastiera e focus, totali Sessioni, viewport e passaggio desktop/card.
  Log: `test-results/cassa-e2e-verified.log`.
  Dopo il rafforzamento finale, ripassate anche le due prove mirate per
  PageDown/PageUp con layout al 125% e totali su 5.000 Sessioni
  (`test-results/cassa-e2e-scale-keys.log`).
- Tre nuove prove di componente coprono caricamento con altezza zero, selezione
  completa e identità dopo riordino, fallback delle sezioni con intestazioni e
  totali. La prova di selezione è inclusa nei 5.735 test.
- Benchmark: 8 campioni desktop prima, 8 dopo e 4 campioni compatti; dati e
  limiti sono riportati sopra. Le misure sono separate dai test pesanti.
- Lint completo e guardie del repository, typecheck frontend/API/E2E, build
  frontend di produzione e build API: passati. Log `test-results/cassa-lint.log`,
  `cassa-typecheck-frontend.log`, `cassa-typecheck-api.log`,
  `cassa-typecheck-e2e.log`, `cassa-build-frontend.log`, `cassa-build-api.log`
  nella stessa cartella locale `test-results`.

Il test di zoom modifica il layout CSS al 125%; non simula lo zoom nativo del
browser. Le card sono provate tramite viewport emulata, senza dispositivo fisico.
La prova preesistente sul focus nella ricerca protegge il comportamento osservato,
ma non dimostra isolatamente la necessità della guardia di ripristino del focus:
il limite resta esplicito nel test.

Non eseguiti test di integrazione sul database condiviso, verifiche RLS/API boot
con servizi reali, collaudi fiscali o dispositivi. Restano fuori da questa tranche,
insieme a rilascio e ottimizzazione delle card a grandi volumi.
