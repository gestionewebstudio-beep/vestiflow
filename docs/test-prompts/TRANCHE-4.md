# Collaudo VestiFlow online — TRANCHE 4 (finale)

Sei l'agente di collaudo del gestionale VestiFlow. Devi eseguire i test funzionali sull'istanza **ONLINE** indicata da `E2E_BASE_URL` nel file `.env` (già configurato, con credenziali funzionanti), per il profilo canale **«Solo gestionale»**, e produrre un report degli esiti.

## Riferimenti (leggili prima di iniziare)

1. `docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md` — cosa fa l'app e come; per questa tranche sono centrali **§4** (ruoli e permessi), **§20** (invarianti) e **§21** (mappa route → permessi: ogni route con il permesso richiesto).
2. `docs/PIANO-TEST-VESTIFLOW.md` — i casi di test numerati (T-xxx) con passi e risultati attesi.
3. I report delle tranche precedenti in `docs/test-results/` (dati E2E- già presenti nel tenant, KO già noti).

## Ambito di questa sessione — Tranche 4

Esegui le sezioni **19–21** del piano test, nell'ordine numerico:

- 19 — Mobile e PWA (solo la parte automatizzabile: viewport mobile via Playwright, drawer, liste a card; installazione su device reale = N/A)
- 20 — Permessi per ruolo (titolare vs commesso: usa `E2E_CLERK_EMAIL`/`E2E_CLERK_PASSWORD` per il commesso)
- 21 — Flussi end-to-end integrati (es. ordine fornitore → arrivo merce → giacenza → vendita al banco → reso; ordine cliente → impegno → concludi → DDT → scarico)

La sezione 18 (admin piattaforma) è fuori ambito: marcala N/A in blocco.

## Come operare

- L'infrastruttura Playwright del repo è già pronta: `.env` contiene URL e credenziali, `E2E_SKIP_WEBSERVER=1` evita l'avvio dei server locali.
- Per i test mobile usa il progetto `mobile-chrome` (`npx playwright test --project=mobile-chrome`) o un viewport Pixel 5 negli script usa-e-getta.
- Per i test permessi: login con il commesso e verifica per ogni area che voci di menu/pulsanti assenti e route protette corrispondano a §21 del documento funzionale (route senza permesso → redirect, non errore). Gli spec `e2e/permissions*.spec.ts` coprono una parte: lanciali come smoke (quelli che richiedono gli account `E2E_CLERK_CATALOG_IMPORT_*`/`E2E_CLERK_INVENTORY_IMPORT_*` falliranno se quegli account non esistono sul tenant: marcali N/A).
- Per i flussi end-to-end usa le **invarianti di §20** come verifiche a ogni passo (Disponibile = Giacenza − Impegnata; bozza non movimenta; conferma assegna il numero; ecc.).
- Scrivi gli script usa-e-getta in `e2e-collaudo/` (non toccare gli spec in `e2e/`); screenshot a ogni KO.

## Regole di sicurezza (vincolanti)

- Opera SOLO sul tenant di prova raggiunto con le credenziali fornite.
- Prefissa ogni dato che crei con **«E2E-»**.
- NON eseguire: ripristino/export dal pannello Backup negozio, cambi password, modifica MFA, sezione `/app/admin`, eliminazione di dati non creati dal collaudo.
- A fine tranche esegui la **pulizia finale**: annulla/elimina i dati E2E- residui di tutte le tranche dove possibile (ordini annullati eliminabili, bozze, prodotti E2E- senza vincoli); elenca nel report ciò che NON è ripulibile (es. prodotti con movimenti storici, documenti confermati) così può essere gestito a mano.

## Test da marcare N/A senza eseguirli

Scanner con fotocamera, pistola barcode fisica, installazione PWA su device reale, email reali, MFA con authenticator, test «solo profilo Shopify» o «TikTok», sezione 18, spec permessi granulari senza i relativi account.

## Report (obbligatorio, è il deliverable)

Scrivi `docs/test-results/REPORT-TRANCHE-4-<AAAA-MM-GG>.md` con:

1. intestazione: data, URL istanza, account usati (solo email), tranche;
2. tabella esiti: ID test | Titolo breve | Esito (OK/KO/N/A) | Gravità (P1/P2/P3, solo per i KO) | Note;
3. per ogni KO: passi per riprodurre, atteso vs osservato, percorso screenshot;
4. sezione «Divergenze documentazione vs app»;
5. **riepilogo complessivo del collaudo**: aggrega gli esiti di tutte le 4 tranche (leggi i report precedenti) — totale OK/KO/N/A generale e la classifica dei problemi più gravi dell'intero collaudo in ordine di priorità;
6. elenco dei dati E2E- non ripulibili rimasti nel tenant.

Salva gli screenshot dei KO in `docs/test-results/screenshots/`. Non modificare il codice dell'app né i documenti di riferimento: la tua missione è osservare e riferire.

Se un blocco impedisce di proseguire, fermati e riporta il blocco nel report invece di improvvisare soluzioni.
