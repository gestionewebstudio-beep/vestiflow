# Test automatizzati del gestionale online con Claude Code — setup e prompt

**Scopo:** far eseguire a Claude Code il collaudo completo del gestionale **online** (profilo «Solo gestionale») usando come riferimento `docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md` e `docs/PIANO-TEST-VESTIFLOW.md`.

Il file ha due parti: **A** — cosa devi preparare tu (una volta sola); **B** — il prompt da incollare in Claude Code (uno per tranche).

---

## A. Checklist di preparazione (da fare tu, prima di lanciare)

### 1. Tenant di prova

- [ ] Crea (o fatti creare dall'admin piattaforma) un **tenant dedicato ai test** con profilo canale **Solo gestionale**. Mai usare un negozio con dati reali: il piano prevede eliminazioni, rettifiche, annulli e resi.
- [ ] Almeno **2 sedi operative** attive (per testare trasferimenti e filtri location).
- [ ] Account per la matrice ruoli (tutti **senza MFA**):
  - Titolare (account principale dei test)
  - Commesso con permessi ridotti (per i test permessi)
  - (opzionali) Commesso + import catalogo, Commesso + import giacenze — servono solo per `permissions-granular.spec.ts`

### 2. File `.env` nella root del progetto

Il config Playwright lo legge da solo ([playwright.config.ts](../playwright.config.ts)). Contenuto minimo:

```env
# Istanza online da testare
E2E_BASE_URL=https://<indirizzo-del-gestionale>
E2E_API_URL=https://<indirizzo-api>
# Non avviare i server locali: si testa l'istanza remota
E2E_SKIP_WEBSERVER=1

# Account titolare del tenant di prova
E2E_USER_EMAIL=titolare-test@example.com
E2E_USER_PASSWORD=********

# Account commesso per i test permessi (opzionale ma consigliato)
E2E_CLERK_EMAIL=commesso-test@example.com
E2E_CLERK_PASSWORD=********
```

- [ ] `.env` è già ignorato da git — verifica di **non** committarlo.
- [ ] Verifica a mano che il login funzioni con quelle credenziali.

### 3. Decidi le tranche

Una sessione di Claude Code per tranche, ciascuna con report separato:

| Tranche | Sezioni del piano test | Contenuto                                                                                                      |
| ------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| **1**   | 0–7                    | Accesso, shell/navigazione, dashboard, impostazioni, prodotti, giacenze, cerca giacenza                        |
| **2**   | 8–13                   | Movimenti, import CSV, inventario fisico, fornitori, ordini fornitore, documenti                               |
| **3**   | 14–17                  | Vendita negozio, ordini cliente, vendite online/corrispettivi, clienti, report, registro commercialista, guida |
| **4**   | 19–21                  | Mobile/PWA (parziale), permessi per ruolo, flussi end-to-end integrati                                         |

La sezione 18 (admin piattaforma) resta **fuori** dal collaudo agente: richiede l'account operatore.

---

## B. Prompt da incollare in Claude Code

> **Versione pronta all'uso:** i prompt già compilati per le 4 tranche sono in `docs/test-prompts/TRANCHE-1.md` … `TRANCHE-4.md`. Per lanciare una tranche basta aprire una nuova chat di Claude Code nella cartella del progetto e scrivere:
>
> ```
> Leggi docs/test-prompts/TRANCHE-1.md ed esegui esattamente le istruzioni che contiene.
> ```
>
> (poi `TRANCHE-2.md`, ecc.). Non serve allegare file: Claude Code legge i documenti dal progetto da solo.
>
> Il template sottostante è la versione generica di riferimento (`<N>` = numero tranche), utile solo se vuoi comporre una tranche personalizzata.

```text
Sei l'agente di collaudo del gestionale VestiFlow. Devi eseguire i test funzionali
sull'istanza ONLINE indicata da E2E_BASE_URL nel file .env, per il profilo canale
«Solo gestionale», e produrre un report degli esiti.

RIFERIMENTI (leggili prima di iniziare):
1. docs/DOCUMENTO-FUNZIONALE-SOLO-GESTIONALE.md — cosa fa l'app e come; usa le
   sezioni §19 (cosa NON deve esistere), §20 (invarianti) e §21 (mappa route →
   permessi) come oracoli di verifica.
2. docs/PIANO-TEST-VESTIFLOW.md — i casi di test numerati (T-xxx) con passi e
   risultati attesi.

AMBITO DI QUESTA SESSIONE — TRANCHE <N>:
esegui le sezioni <elenco sezioni, es. "0–7"> del piano test, nell'ordine numerico.
Tutti gli altri test sono fuori ambito: non eseguirli.

COME OPERARE:
- L'infrastruttura Playwright del repo è già pronta: .env contiene URL e
  credenziali (E2E_USER_EMAIL/E2E_USER_PASSWORD per il titolare, E2E_CLERK_* per
  il commesso), E2E_SKIP_WEBSERVER=1 evita l'avvio dei server locali. L'auth setup
  (e2e/auth.setup.ts) salva la sessione in e2e/.auth/user.json.
- Come smoke iniziale puoi lanciare gli spec esistenti pertinenti alla tranche
  (es. npx playwright test e2e/products.spec.ts --project=chromium). Poi esegui i
  casi del piano test NON coperti dagli spec guidando tu il browser: scrivi script
  Playwright usa-e-getta in una cartella e2e-collaudo/ (non toccare gli spec in
  e2e/), riusando gli helper di e2e/helpers/ dove utile.
- Per ogni test: esegui i passi, confronta con il risultato atteso del piano e con
  il documento funzionale, cattura uno screenshot in caso di KO.
- Un elenco vuoto con empty-state NON è un errore dove il documento funzionale lo
  prevede (es. Vendite online e Corrispettivi in §13 sono vuoti per design in
  questo profilo).

REGOLE DI SICUREZZA (vincolanti):
- Opera SOLO sul tenant di prova raggiunto con le credenziali fornite.
- Prefissa ogni dato che crei con «E2E-» (prodotti, fornitori, clienti, note
  documento) così da renderlo riconoscibile.
- NON eseguire: ripristino/export dal pannello Backup negozio, cambi password,
  modifica MFA, sezione /app/admin, eliminazione di dati non creati da te.
- Le azioni distruttive previste dal piano (elimina prodotto, annulla documento,
  reso) vanno fatte SOLO su dati E2E- creati nella sessione.
- A fine tranche, dove il piano non richiede di conservarli, annulla/pulisci i
  dati E2E- creati (documenti in bozza eliminabili, ordini annullabili).

TEST DA MARCARE N/A SENZA ESEGUIRLI:
- scanner con fotocamera, pistola barcode fisica, installazione PWA su device
  reale, email reali (reset password end-to-end), MFA con authenticator,
  test marcati «solo profilo Shopify» o «TikTok», sezione 18 (admin piattaforma).

REPORT (obbligatorio, è il deliverable):
- Scrivi docs/test-results/REPORT-TRANCHE-<N>-<AAAA-MM-GG>.md con:
  1. intestazione: data, URL istanza, account usati (solo email), tranche;
  2. tabella esiti: ID test | Titolo breve | Esito (OK/KO/N/A) | Note;
  3. per ogni KO: passi per riprodurre, atteso vs osservato, percorso screenshot;
  4. sezione «Divergenze documentazione vs app»: punti in cui l'app si comporta
     diversamente dal documento funzionale o dal piano test (non sono
     necessariamente bug: segnalali, non correggerli);
  5. riepilogo finale: totale OK/KO/N/A e i 3–5 problemi più gravi in ordine di
     priorità.
- Salva gli screenshot dei KO in docs/test-results/screenshots/.
- Non modificare il codice dell'app né i documenti di riferimento: la tua
  missione è osservare e riferire.

Se un blocco impedisce di proseguire (login fallito, istanza irraggiungibile,
permessi mancanti sull'account), fermati e riporta il blocco nel report invece
di improvvisare soluzioni.
```

---

## Note operative

- **Un prompt per sessione.** Alla tranche successiva, riparti con lo stesso prompt cambiando `<N>` e le sezioni. I report si accumulano in `docs/test-results/`.
- **Test permessi (tranche 4):** servono le credenziali `E2E_CLERK_*` nel `.env`; senza, l'agente marcherà N/A i test della sezione 20.
- **Dati sporchi:** se una tranche fallisce a metà può lasciare dati `E2E-` nel tenant; sono riconoscibili dal prefisso e ripulibili a mano o all'inizio della tranche successiva.
- **Dopo il collaudo:** i KO e le divergenze del report si possono ridare a Claude Code nel repo come lista di fix, una alla volta.
