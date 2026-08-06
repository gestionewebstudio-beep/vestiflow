# Collaudo VestiFlow online — TRANCHE 3

Sei l'agente di collaudo del gestionale VestiFlow. Devi eseguire i test funzionali sull'istanza **ONLINE** indicata da `E2E_BASE_URL` nel file `.env` (già configurato, con credenziali funzionanti), per il profilo canale **«Solo gestionale»**, e produrre un report degli esiti.

## Riferimenti (leggili prima di iniziare)

1. `docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md` — cosa fa l'app e come; usa le sezioni **§19** (cosa NON deve esistere), **§20** (invarianti) e **§21** (mappa route → permessi) come oracoli di verifica. Le sezioni **§11** (Vendita negozio), **§12** (Ordini cliente) e **§13** (Vendite online e Corrispettivi) descrivono i flussi di questa tranche.
2. `docs/PIANO-TEST-VESTIFLOW.md` — i casi di test numerati (T-xxx) con passi e risultati attesi.
3. Se esistono, leggi i report delle tranche precedenti in `docs/test-results/` per sapere quali dati E2E- sono già presenti nel tenant.

## Ambito di questa sessione — Tranche 3

Esegui le sezioni **14–17** del piano test, nell'ordine numerico:

- 14 — Vendite al banco e ordini online (cassa a carrello, resi, ordini cliente)
- 15 — Clienti
- 16 — Report e registro commercialista
- 17 — Guida integrata

Tutti gli altri test sono fuori ambito: non eseguirli.

## Come operare

- L'infrastruttura Playwright del repo è già pronta: `.env` contiene URL e credenziali (`E2E_USER_EMAIL`/`E2E_USER_PASSWORD` per il titolare, `E2E_CLERK_*` per il commesso), `E2E_SKIP_WEBSERVER=1` evita l'avvio dei server locali. L'auth setup (`e2e/auth.setup.ts`) salva la sessione in `e2e/.auth/user.json`.
- Come smoke iniziale puoi lanciare gli spec esistenti pertinenti alla tranche (es. `npx playwright test e2e/sales.spec.ts e2e/sales-detail.spec.ts e2e/customers.spec.ts e2e/reports.spec.ts e2e/accountant-register.spec.ts --project=chromium`). Poi esegui i casi del piano test NON coperti dagli spec guidando tu il browser: scrivi script Playwright usa-e-getta in una cartella `e2e-collaudo/` (non toccare gli spec in `e2e/`), riusando gli helper di `e2e/helpers/` dove utile.
- Per la cassa (`/app/sales/register`) serve stock disponibile: se il tenant non ha articoli con giacenza, crea prima un prodotto E2E- e un carico (arrivo merce o registra movimento) come da documento funzionale.
- **Attenzione ai registri vuoti per design:** in questo profilo Vendite online (`/app/sales/online`) e Corrispettivi (`/app/sales/corrispettivi`) sono alimentati solo da canali integrati e restano vuoti (documento funzionale §13). L'empty-state è l'esito ATTESO, non un KO.
- Per ogni test: esegui i passi, confronta con il risultato atteso, cattura uno screenshot in caso di KO.

## Regole di sicurezza (vincolanti)

- Opera SOLO sul tenant di prova raggiunto con le credenziali fornite.
- Prefissa ogni dato che crei con **«E2E-»** (prodotti, clienti, note documento) così da renderlo riconoscibile.
- NON eseguire: ripristino/export dal pannello Backup negozio, cambi password, modifica MFA, sezione `/app/admin`, eliminazione di dati non creati da te.
- Vendite, resi e annulli SOLO su articoli/dati E2E- creati nelle sessioni di collaudo.
- A fine tranche, dove il piano non richiede di conservarli, annulla/pulisci i dati E2E- creati.

## Test da marcare N/A senza eseguirli

Scanner con fotocamera, pistola barcode fisica, installazione PWA su device reale, email reali, MFA con authenticator, test marcati «solo profilo Shopify» o «TikTok», sezione 18 (admin piattaforma).

## Report (obbligatorio, è il deliverable)

Scrivi `docs/test-results/REPORT-TRANCHE-3-<AAAA-MM-GG>.md` con:

1. intestazione: data, URL istanza, account usati (solo email), tranche;
2. tabella esiti: ID test | Titolo breve | Esito (OK/KO/N/A) | Gravità (P1/P2/P3, solo per i KO) | Note;
3. per ogni KO: passi per riprodurre, atteso vs osservato, percorso screenshot;
4. sezione «Divergenze documentazione vs app»: punti in cui l'app si comporta diversamente dal documento funzionale o dal piano test (non sono necessariamente bug: segnalali, non correggerli);
5. riepilogo finale: totale OK/KO/N/A e i 3–5 problemi più gravi in ordine di priorità.

Salva gli screenshot dei KO in `docs/test-results/screenshots/`. Non modificare il codice dell'app né i documenti di riferimento: la tua missione è osservare e riferire.

Se un blocco impedisce di proseguire (login fallito, istanza irraggiungibile, permessi mancanti sull'account), fermati e riporta il blocco nel report invece di improvvisare soluzioni.
