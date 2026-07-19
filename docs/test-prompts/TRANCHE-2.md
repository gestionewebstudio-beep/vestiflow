# Collaudo VestiFlow online — TRANCHE 2

Sei l'agente di collaudo del gestionale VestiFlow. Devi eseguire i test funzionali sull'istanza **ONLINE** indicata da `E2E_BASE_URL` nel file `.env` (già configurato, con credenziali funzionanti), per il profilo canale **«Solo gestionale»**, e produrre un report degli esiti.

## Riferimenti (leggili prima di iniziare)

1. `docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md` — cosa fa l'app e come; usa le sezioni **§19** (cosa NON deve esistere), **§20** (invarianti) e **§21** (mappa route → permessi) come oracoli di verifica.
2. `docs/PIANO-TEST-VESTIFLOW.md` — i casi di test numerati (T-xxx) con passi e risultati attesi.
3. Se esiste, leggi il report della tranche precedente in `docs/test-results/` per sapere quali dati E2E- sono già presenti nel tenant.

## Ambito di questa sessione — Tranche 2

Esegui le sezioni **8–13** del piano test, nell'ordine numerico:

- 8 — Magazzino: Movimenti
- 9 — Magazzino: Import CSV giacenze
- 10 — Inventario fisico
- 11 — Fornitori
- 12 — Ordini fornitori
- 13 — Documenti fiscali e operativi

Tutti gli altri test sono fuori ambito: non eseguirli.

## Come operare

- L'infrastruttura Playwright del repo è già pronta: `.env` contiene URL e credenziali (`E2E_USER_EMAIL`/`E2E_USER_PASSWORD` per il titolare, `E2E_CLERK_*` per il commesso), `E2E_SKIP_WEBSERVER=1` evita l'avvio dei server locali. L'auth setup (`e2e/auth.setup.ts`) salva la sessione in `e2e/.auth/user.json`.
- Come smoke iniziale puoi lanciare gli spec esistenti pertinenti alla tranche (es. `npx playwright test e2e/movements.spec.ts e2e/inventory-import.spec.ts e2e/suppliers* e2e/supplier-orders.spec.ts e2e/goods-receipt.spec.ts --project=chromium`; verifica i nomi con `ls e2e`). Poi esegui i casi del piano test NON coperti dagli spec guidando tu il browser: scrivi script Playwright usa-e-getta in una cartella `e2e-collaudo/` (non toccare gli spec in `e2e/`), riusando gli helper di `e2e/helpers/` dove utile.
- Per ogni test: esegui i passi, confronta con il risultato atteso del piano e con il documento funzionale, cattura uno screenshot in caso di KO.
- I test di questa tranche creano dipendenze tra loro (ordine fornitore → arrivo merce → giacenze): rispetta l'ordine numerico del piano.

## Regole di sicurezza (vincolanti)

- Opera SOLO sul tenant di prova raggiunto con le credenziali fornite.
- Prefissa ogni dato che crei con **«E2E-»** (prodotti, fornitori, clienti, note documento) così da renderlo riconoscibile.
- NON eseguire: ripristino/export dal pannello Backup negozio, cambi password, modifica MFA, sezione `/app/admin`, eliminazione di dati non creati da te.
- Le azioni distruttive previste dal piano (elimina prodotto/ordine, annulla documento, rettifiche) vanno fatte SOLO su dati E2E- creati nelle sessioni di collaudo.
- A fine tranche, dove il piano non richiede di conservarli, annulla/pulisci i dati E2E- creati (documenti in bozza eliminabili, ordini annullabili).

## Test da marcare N/A senza eseguirli

Scanner con fotocamera, pistola barcode fisica, installazione PWA su device reale, email reali, MFA con authenticator, test marcati «solo profilo Shopify» o «TikTok», sezione 18 (admin piattaforma).

## Report (obbligatorio, è il deliverable)

Scrivi `docs/test-results/REPORT-TRANCHE-2-<AAAA-MM-GG>.md` con:

1. intestazione: data, URL istanza, account usati (solo email), tranche;
2. tabella esiti: ID test | Titolo breve | Esito (OK/KO/N/A) | Gravità (P1/P2/P3, solo per i KO) | Note;
3. per ogni KO: passi per riprodurre, atteso vs osservato, percorso screenshot;
4. sezione «Divergenze documentazione vs app»: punti in cui l'app si comporta diversamente dal documento funzionale o dal piano test (non sono necessariamente bug: segnalali, non correggerli);
5. riepilogo finale: totale OK/KO/N/A e i 3–5 problemi più gravi in ordine di priorità.

Salva gli screenshot dei KO in `docs/test-results/screenshots/`. Non modificare il codice dell'app né i documenti di riferimento: la tua missione è osservare e riferire.

Se un blocco impedisce di proseguire (login fallito, istanza irraggiungibile, permessi mancanti sull'account), fermati e riporta il blocco nel report invece di improvvisare soluzioni.
