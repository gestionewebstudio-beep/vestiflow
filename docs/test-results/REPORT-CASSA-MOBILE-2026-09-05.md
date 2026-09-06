# Cassa: verifica mobile e lettura dei template, 05/09/2026

Il controllo successivo alla tranche desktop ha confermato e ridotto la lentezza
mobile: **5.000 card passano da 31.233–31.633 ms a 6.236–6.362 ms** in due prove
profilate per versione. Tutte le card restano nel DOM, con gli stessi 125.048 nodi
della tabella e altezze variabili. **Sei secondi restano troppi per considerare
completa l'ottimizzazione mobile**; lo scorrimento al fondo resta circa 1,2 secondi.

Baseline: commit `f3ef77a8`, ramo `feature/recupero-cassa`. La correzione desktop
`e2913da9` è presente sia prima sia dopo. Nessun aggiornamento di dipendenze.
Correzione mobile e prove nel commit locale `5c10b513`.

## Causa e correzione

La finestra desktop evita di creare tutte le righe. Sulle card, dove la finestra ad
altezza uniforme è disattivata, il costo delle query di contenuto rimaneva invece
esposto: durante la creazione delle viste proiettate, ogni cella rileggeva il
computed della mappa template tramite `templateFor`; ogni card rileggeva anche la
propria query. La creazione di viste invalida le query, che attraversano l'albero
in crescita. Memoizzare la mappa non basta se la si rilegge dopo ogni invalidazione.

Ora tre `@let`, prima dei cicli del template condiviso, leggono mappa celle, card e
azioni. Le righe usano quei riferimenti. Le query restano reattive: il render
successivo vede aggiunte, rimozioni e cambi di colonna. Nessuna snapshot permanente,
restrizione ai template condizionali o nuova implementazione specifica Cassa.

Prove della causa:

- Il nuovo E2E mobile, prima della modifica, fallisce il budget ampio di 10 secondi
  con **24.722 ms**, senza profiler e con 5.000 card presenti. Dopo passa.
  Log e trace conservati in `test-results/cassa-mobile-defect-proof.log` e
  `test-results/cassa-mobile-defect-proof/`.
- Nelle misure profilate a 5.000 card, il tempo inclusivo campionato sotto
  `refreshSignalQuery` scende da **23.578–23.989 ms a 14–15 ms**;
  `ScriptDuration` passa da **26.490–26.991 ms a 1.457–1.467 ms**.
- Due nuove prove di componente verificano template condizionali che compaiono,
  scompaiono e ricompaiono, cambio dell'id di colonna, aggiornamento del contenuto
  catturato e azioni dentro le celle su più sezioni. Passano senza rendere statiche
  le query. Corretta anche la vecchia annotazione del test che dichiarava impossibile
  trovare un template condizionale: la prova attuale dimostra il contrario.

## Misure

Stesso harness della [tranche desktop](REPORT-CASSA-PERFORMANCE-2026-09-05.md):
Windows, Node 22.13.1, Angular 21.2.19, Playwright 1.62.1, Chromium 151.0.7922.34.
Viewport 390 × 844, build E2E non ottimizzata, un worker, nessun throttling CPU.
Due ripetizioni per scala prima e dopo; nessun altro test pesante durante le misure.

|  Card | Caricamento prima (ms) |   Dopo (ms) | Dopo risposta mock, prima / dopo (ms) | Scroll al fondo, prima / dopo (ms) | Nodi tabella |
| ----: | ---------------------: | ----------: | ------------------------------------: | ---------------------------------: | -----------: |
|   100 |                688–703 |     664–688 |                     179–193 / 167–170 |                      46–67 / 47–73 |        2.548 |
| 1.000 |            2.418–2.536 | 1.824–1.856 |             1.834–1.951 / 1.233–1.273 |                  235–250 / 288–307 |       25.048 |
| 2.000 |            5.577–5.635 | 3.000–3.002 |             4.967–4.969 / 2.349–2.404 |                  434–493 / 451–473 |       50.048 |
| 5.000 |          31.233–31.633 | 6.236–6.362 |           30.388–30.798 / 5.397–5.485 |          1.151–1.201 / 1.175–1.250 |      125.048 |

Controllo desktop dopo la modifica, due campioni a 5.000 righe: **675–677 ms**,
43 righe e 1.125 nodi a regime, scroll al fondo 44–47 ms.

La compilazione e una prima visita di riscaldamento restano fuori dalle misure.
Il caricamento mobile termina quando tutte le card sono presenti e la prima è
visibile. La risposta mock include bootstrap e navigazione; il tempo successivo
include parsing, rendering, layout e attesa Playwright, non soltanto paint.
La profilazione CDP è accesa in entrambi i gruppi e introduce il medesimo tipo di
overhead. Il test funzionale senza profiler ha un percorso di riscaldamento diverso:
il suo valore non va sostituito a quelli della tabella.

Dati sintetizzati in [CASSA-MOBILE-2026-09-05.json](CASSA-MOBILE-2026-09-05.json).
JSON originali e CPU profile conservati localmente in:

- `test-results/cassa-performance/mobile-before-mobile/`
- `test-results/cassa-performance/mobile-after-mobile/`
- `test-results/cassa-performance/mobile-check-desktop/`

Riproduzione PowerShell dalla root, con porta 4310 libera:

```powershell
$env:E2E_USE_MOCK_AUTH = '1'
$env:E2E_BASE_URL = 'http://127.0.0.1:4310'
$env:CASSA_PERF_PHASE = 'mobile-after'
$env:CASSA_PERF_MOBILE = '1'
node node_modules/@playwright/test/cli.js test --config=e2e/cassa-isolated.config.ts cassa-performance --repeat-each=2
Remove-Item Env:CASSA_PERF_MOBILE
node node_modules/@playwright/test/cli.js test --config=e2e/cassa-isolated.config.ts --grep-invert 'prestazioni Cassa'
```

## Controlli funzionali e limiti

Il controllo visivo ha trovato anche un secondo difetto: i due campi del periodo
conservavano ciascuno la larghezza predefinita di 224px, oltre i bordi del telefono.
A 360px il secondo campo era visibile solo per il 48,2%; la prova mirata falliva
prima della correzione (`test-results/cassa-mobile-date-before.log`).
Un mixin condiviso assegna ora due colonne uguali sotto `md` ai registri Operazioni
e Sessioni. I calendari usano la larghezza dell'intera coppia e si ancorano dal lato
del proprio campo, tramite le variabili CSS già esposte da `app-date-input`.
La modifica riguarda la geometria del periodo; le misure della tabella sopra
isolano invece la correzione delle letture dei template.

**28 prove browser passate sullo stato finale**, comprese le precedenti prove Cassa, Fornitori e
tabella desktop. I nuovi controlli mobile verificano:

- 5.000 operazioni complete, ultima card interamente nel viewport e apertura del
  dettaglio corretto con `tap`;
- filtro dalla posizione in fondo, risultato corretto visibile e azzeramento;
- viewport 360 × 800, 390 × 844 e 768 × 1024, senza overflow orizzontale;
- campi Dal/Al e rispettivi calendari completamente nel viewport a 360/390/768px
  in entrambi i registri;
- nome lungo completo e altezze differenti sul telefono; a 768px il testo entra
  su una riga e le altezze possono coincidere;
- 5.000 Sessioni, totale sull'intero risultato, piede fisso e ultima card visibile;
- permanenza delle garanzie desktop su ordinamento completo, tastiera, focus,
  resize colonne, layout al 125% e cambio desktop/compatto.

Log finale: `test-results/cassa-mobile-final.log` (28 passate, 1,5 minuti);
la suite precedente di 27 prove resta in `test-results/cassa-mobile-regressions.log`.
Screenshot di inizio/fondo e delle
tre larghezze conservati sotto `test-results/cassa-mobile-checked/` e controllati
visivamente. Dopo la correzione del periodo, screenshot aggiornati dei registri e
dei due calendari in `test-results/cassa-mobile-date-after/`: le due prove mirate
sono passate (`test-results/cassa-mobile-date-after.log`). Il primo tentativo del test responsive chiedeva altezze diverse anche
a 768px: l'asserzione era sbagliata perché lì il nome lungo entra su una riga; il
log iniziale resta conservato e il controllo è ora limitato alle larghezze telefoniche.

`npm run test:everything`: **5.737 test passati in 524 file** (2.038 frontend,
1.270 componenti, 2.429 API), log `test-results/cassa-mobile-full-suite.log`.
Coverage frontend: statement 86,26%, branch 81,04%, funzioni 81,57%, linee 86,68%,
sopra le soglie del repository. Lint completo e guardie, typecheck frontend/E2E,
build frontend di produzione e build API passati. Dopo l'ultima modifica SCSS
sono stati ripetuti i controlli pertinenti (lint, typecheck E2E, build frontend e prove
browser); nessuna logica API è cambiata.

Log dei controlli: `test-results/cassa-mobile-lint-final.log`,
`cassa-mobile-typecheck.log`, `cassa-mobile-e2e-typecheck-final.log`,
`cassa-mobile-build-final.log` e `cassa-mobile-api-build.log`, tutti nella cartella
locale `test-results`.

Le prove touch usano l'emulazione mobile Chromium. Non sono un collaudo su telefono
fisico né su Safari/iOS. Il costo residuo cresce con tutte le card e i nodi: serve
ancora un intervento sul rendering a grandi volumi che preservi altezze variabili,
testi, accessibilità, selezione e raggiungibilità delle righe. Non si deduce dal
benchmark che sei secondi su questa macchina siano accettabili su un telefono.

Il servizio sulla porta 4200 e il database condiviso restano fuori dalle prove:
solo frontend E2E isolato, auth mock e API intercettate. Nessun test di integrazione
DB, fiscalizzazione, dispositivo reale o rilascio è incluso in questo controllo.
