# VestiFlow — Piano di test completo

**Versione documento:** 1.1 — Giugno 2026

**Scopo:** elenco ordinato di tutti i test manuali da eseguire sul gestionale, dal primo all'ultimo, con passaggi operativi e risultati attesi. Pensato per test in parallelo da più persone.

**Come usare questo documento**

1. Leggi la sezione **0 — Preparazione** prima di iniziare qualsiasi test.
2. Esegui i test **nell'ordine numerico** (T-001 → T-194). Alcuni test dipendono da dati creati in test precedenti.
3. Compila per ogni test: **Esito** (OK / KO / N/A), **Tester**, **Data**, **Note**.
4. In caso di KO, descrivi cosa è successo e allega screenshot se utile.
5. Non saltare i test contrassegnati **Obbligatorio** prima del go-live.

---

## Indice

0. [Preparazione ambiente e divisione lavoro](#0-preparazione-ambiente-e-divisione-lavoro)
1. [Accesso e autenticazione](#1-accesso-e-autenticazione)
2. [Shell, navigazione e UI generale](#2-shell-navigazione-e-ui-generale)
3. [Dashboard](#3-dashboard)
4. [Impostazioni](#4-impostazioni)
5. [Prodotti e catalogo](#5-prodotti-e-catalogo)
6. [Magazzino — Giacenze](#6-magazzino--giacenze)
7. [Magazzino — Cerca giacenza](#7-magazzino--cerca-giacenza)
8. [Magazzino — Movimenti](#8-magazzino--movimenti)
9. [Magazzino — Import CSV giacenze](#9-magazzino--import-csv-giacenze)
10. [Inventario fisico](#10-inventario-fisico)
11. [Ordini fornitori](#11-ordini-fornitori)
12. [Vendite](#12-vendite)
13. [Clienti](#13-clienti)
14. [Report](#14-report)
15. [Guida integrata](#15-guida-integrata)
16. [Amministrazione piattaforma](#16-amministrazione-piattaforma)
17. [Mobile e PWA](#17-mobile-e-pwa)
18. [Permessi per ruolo](#18-permessi-per-ruolo)
19. [Flussi end-to-end integrati](#19-flussi-end-to-end-integrati)

---

## Legenda campi test

| Campo                | Significato                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| **ID**               | Codice univoco del test (es. T-042)                                    |
| **Priorità**         | **P1** = bloccante · **P2** = importante · **P3** = secondario         |
| **Ruolo**            | Account necessario: Titolare, Admin, Manager, Commesso, Platform admin |
| **Device**           | Desktop, Mobile, o Entrambi                                            |
| **Prerequisiti**     | Condizioni da soddisfare prima del test                                |
| **Passaggi**         | Azioni da eseguire in sequenza                                         |
| **Risultato atteso** | Comportamento corretto da verificare                                   |
| **Esito**            | Compila: OK / KO / N/A                                                 |

---

## 0. Preparazione ambiente e divisione lavoro

### 0.1 Checklist ambiente (tutti i tester)

Prima di T-001, verifica:

| #   | Verifica                                                                      | OK  |
| --- | ----------------------------------------------------------------------------- | --- |
| 1   | Backend API avviato e raggiungibile                                           | ☐   |
| 2   | Frontend VestiFlow aperto su URL di test/staging                              | ☐   |
| 3   | Almeno un negozio Shopify di test collegabile (se test sync)                  | ☐   |
| 4   | Quattro account di test con ruoli diversi: Titolare, Admin, Manager, Commesso | ☐   |
| 5   | Almeno 2 location configurate (es. Negozio + Magazzino)                       | ☐   |
| 6   | Browser: Chrome o Edge aggiornato (desktop) + smartphone per test mobile      | ☐   |
| 7   | Foglio condiviso o canale per segnalare bug (es. chat, issue tracker)         | ☐   |

### 0.2 Dati di test consigliati

Crea (o verifica l'esistenza di) questi dati durante i primi test; serviranno ai test successivi:

- 1 prodotto con 2+ varianti (taglia/colore), SKU univoci, almeno 1 barcode
- Giacenze > 0 su almeno una location
- 1 fornitore (creato durante ordine fornitore)
- Shopify connesso (se ambiente lo prevede)

### 0.3 Divisione suggerita per 2 tester in parallelo

| Tester | Sezioni                         | ID test                                                    | Note                                                     |
| ------ | ------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| **A**  | 0 → 5 + 15 + 19 (parte A)       | T-001 → T-070, T-154 → T-156, T-176 → T-180                | Auth, setup Shopify, prodotti, guida, flussi catalogo    |
| **B**  | 6 → 14 + 17 → 18 + 19 (parte B) | T-071 → T-153, T-161 → T-164, T-170 → T-175, T-181 → T-185 | Magazzino, ordini, vendite, mobile, permessi, assistenza |

**Regola conflitto:** non modificare lo stesso prodotto/ordine/inventario contemporaneamente. Usate SKU o riferimenti diversi (es. prefisso `TEST-A-` / `TEST-B-`).

**Sync point:** dopo T-045 (Shopify) e T-070 (prodotti), fate un breve allineamento prima che il Tester B inizi i movimenti di magazzino.

---

## 1. Accesso e autenticazione

### T-001 — Login con credenziali valide

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Desktop               |

**Prerequisiti:** account attivo con email e password note.

**Passaggi:**

1. Apri l'URL del gestionale (es. `/login`).
2. Inserisci email e password corrette.
3. Clicca **Accedi**.

**Risultato atteso:** redirect a `/app/dashboard`. Topbar mostra nome utente. Sidebar visibile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-002 — Login con password errata

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Dalla schermata login inserisci email valida e password sbagliata.
2. Clicca **Accedi**.

**Risultato atteso:** resti su `/login`. Messaggio di errore visibile. Nessun accesso all'app.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-003 — Validazione campi login vuoti

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Lascia email e password vuote.
2. Clicca **Accedi**.
3. Compila solo email, lascia password vuota e invia di nuovo.

**Risultato atteso:** messaggi di errore inline sui campi mancanti/non validi. Nessuna chiamata di login riuscita.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-004 — Password dimenticata

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Da `/login` clicca **Password dimenticata**.
2. Inserisci email di un account esistente.
3. Invia la richiesta.
4. (Se possibile) apri il link ricevuto via email e imposta nuova password.
5. Torna al login e accedi con la nuova password.

**Risultato atteso:** messaggio di conferma invio email. Link reset funzionante. Login con nuova password OK.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-005 — Logout

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Desktop               |

**Prerequisiti:** utente autenticato.

**Passaggi:**

1. In topbar clicca **Esci** (icona/logout accanto al profilo).
2. Prova ad aprire manualmente `/app/dashboard`.

**Risultato atteso:** redirect a `/login`. Route `/app/*` non accessibili senza nuovo login.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-006 — Login con MFA (utente già configurato)

|              |                                 |
| ------------ | ------------------------------- |
| **Priorità** | P1                              |
| **Ruolo**    | Titolare o Admin con MFA attivo |
| **Device**   | Desktop                         |

**Prerequisiti:** MFA già attivato (vedi T-040).

**Passaggi:**

1. Login con email e password.
2. Quando compare la schermata **Verifica a due fattori**, inserisci codice a 6 cifre dall'app authenticator.
3. Clicca **Verifica e accedi**.

**Risultato atteso:** accesso alla dashboard. Codice errato → messaggio errore, nessun accesso.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-007 — Torna a email e password da schermata MFA

|              |                |
| ------------ | -------------- |
| **Priorità** | P3             |
| **Ruolo**    | Utente con MFA |
| **Device**   | Desktop        |

**Passaggi:**

1. Arriva alla schermata MFA dopo login.
2. Clicca **Torna a email e password**.

**Risultato atteso:** torni al form credenziali. Puoi reinserire email/password.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-008 — Guest guard: utente loggato non vede login

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P2                    |
| **Ruolo**    | Qualsiasi autenticato |
| **Device**   | Desktop               |

**Passaggi:**

1. Estando loggato, naviga manualmente a `/login`.

**Risultato atteso:** redirect automatico fuori dalla pagina login (es. dashboard).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 2. Shell, navigazione e UI generale

### T-010 — Sidebar: tutte le voci menu

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Titolare              |
| **Device**   | Desktop               |

**Passaggi:**

1. Dopo login verifica che la sidebar contenga: Dashboard, Prodotti, Magazzino, Ordini Fornitori, Vendite, Clienti, Report, Impostazioni.
2. Clicca ogni voce una alla volta.

**Risultato atteso:** ogni voce apre la pagina corretta. Titolo pagina e URL coerenti (`/app/dashboard`, `/app/products`, ecc.).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-011 — Voce Guida in sidebar

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Scorri in fondo alla sidebar.
2. Clicca **Guida**.

**Risultato atteso:** si apre `/app/guide` con indice e contenuto guida utente.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-012 — Selettore sede (location) in topbar

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Prerequisiti:** almeno 2 location configurate.

**Passaggi:**

1. In topbar apri il selettore sede.
2. Seleziona una location diversa da quella attuale.
3. Vai in Magazzino → Giacenze.

**Risultato atteso:** elenco giacenze filtrato o contestualizzato sulla sede selezionata. Il selettore mostra la sede scelta.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-013 — Indicatore sync Shopify in topbar

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Titolare/Admin |
| **Device**   | Desktop        |

**Passaggi:**

1. Osserva l'indicatore sync in topbar (con Shopify connesso e disconnesso, se possibile).
2. Clicca l'indicatore.

**Risultato atteso:** stato sync leggibile (connesso/errore/sync in corso). Click porta a Impostazioni o mostra dettaglio coerente.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-014 — Cambio tema (chiaro / scuro / sistema)

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Vai in **Impostazioni → Aspetto**.
2. Seleziona **Chiaro**, poi **Scuro**, poi **Sistema**.
3. Naviga in almeno 2 pagine diverse (Dashboard, Prodotti).

**Risultato atteso:** interfaccia cambia tema senza errori. Preferenza persiste dopo refresh pagina.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-015 — Sidebar mobile (drawer)

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Mobile    |

**Passaggi:**

1. Apri l'app su smartphone (o riduci finestra browser < breakpoint mobile).
2. Tocca icona **menu** in topbar.
3. Seleziona una voce (es. Prodotti).
4. Chiudi/riapri il drawer.

**Risultato atteso:** sidebar si apre come drawer. Navigazione funziona. Topbar sempre accessibile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-016 — Stati loading ed empty state

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Apri una lista (Prodotti o Movimenti) e osserva il caricamento iniziale.
2. Applica un filtro di ricerca che non restituisca risultati.

**Risultato atteso:** skeleton/spinner durante loading. Empty state con titolo, descrizione e (se previsto) CTA — non solo testo "Nessun dato".

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-017 — Stato errore con Riprova

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. (Se possibile) ferma temporaneamente l'API o simula offline.
2. Ricarica Dashboard o una lista.
3. Clicca **Riprova** dopo aver ripristinato la connessione.

**Risultato atteso:** messaggio errore dedicato con pulsante Riprova. Dopo Riprova i dati si caricano.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 3. Dashboard

### T-020 — KPI dashboard visibili

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Desktop               |

**Passaggi:**

1. Vai su `/app/dashboard`.
2. Attendi fine caricamento.

**Risultato atteso:** compaiono le card KPI: Prodotti, Pezzi disponibili, Sotto soglia, Ordini in arrivo, Vendite da evadere. Valori numerici formattati (tabular-nums).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-021 — Panel varianti sotto soglia

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Prerequisiti:** almeno una variante sotto soglia minima (o nessuna).

**Passaggi:**

1. Nella sezione **Varianti sotto soglia** verifica contenuto tabella o messaggio positivo.
2. Clicca **Vai al magazzino**.

**Risultato atteso:** tabella con varianti sotto soglia oppure messaggio "Nessuna variante sotto soglia". Link apre Magazzino.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-022 — Ultime vendite e link dettaglio

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Prerequisiti:** almeno una vendita sincronizzata da Shopify (se possibile).

**Passaggi:**

1. Nella sezione **Ultime vendite** clicca una riga.
2. Verifica la pagina di dettaglio vendita.

**Risultato atteso:** click apre dettaglio ordine vendita. Link **Vai alle vendite** apre lista vendite.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 4. Impostazioni

### T-030 — Visualizzazione profilo utente

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Vai in **Impostazioni → Profilo**.
2. Verifica nome, email e ruolo mostrati.

**Risultato atteso:** dati coerenti con account usato per il login.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-031 — Connessione Shopify (OAuth)

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Titolare o Admin      |
| **Device**   | Desktop               |

**Prerequisiti:** shop Shopify di test. Connessione non ancora attiva (o disconnetti prima).

**Passaggi:**

1. **Impostazioni → Integrazione Shopify**.
2. Inserisci dominio shop (es. `negozio-test.myshopify.com`).
3. Clicca **Connetti Shopify**.
4. Completa autorizzazione sulla pagina Shopify.
5. Torna in VestiFlow.

**Risultato atteso:** badge **Connesso**. Dominio shop visibile. Banner verde di conferma.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-032 — Sincronizza location

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Titolare o Admin      |
| **Device**   | Desktop               |

**Prerequisiti:** Shopify connesso.

**Passaggi:**

1. In Impostazioni clicca **Sincronizza location**.
2. Attendi completamento (spinner + messaggio avanzamento).
3. Scorri alla sezione **Location**.

**Risultato atteso:** messaggio esito verde/giallo. Tabella location popolata con sedi Shopify. Setup status "Location" = Attivo.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-033 — Attiva aggiornamenti automatici (webhook)

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Titolare o Admin      |
| **Device**   | Desktop               |

**Prerequisiti:** Shopify connesso, location sincronizzate.

**Passaggi:**

1. Clicca **Attiva aggiornamenti automatici**.
2. Attendi completamento.

**Risultato atteso:** setup status webhook = Attivo (o Parziale con spiegazione). Pulsante diventa **Disattiva aggiornamenti automatici**.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-034 — Importa catalogo da Shopify

|              |                  |
| ------------ | ---------------- |
| **Priorità** | P1               |
| **Ruolo**    | Titolare o Admin |
| **Device**   | Desktop          |

**Prerequisiti:** Shopify connesso con prodotti già presenti online.

**Passaggi:**

1. Da Impostazioni o Prodotti clicca **Importa catalogo da Shopify**.
2. Attendi fine operazione **senza** ripremere il pulsante.
3. Vai in Prodotti e verifica presenza prodotti importati.

**Risultato atteso:** messaggio esito. Prodotti visibili in lista. Badge sync sui prodotti importati.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-035 — Permessi Shopify visualizzati

|              |                  |
| ------------ | ---------------- |
| **Priorità** | P3               |
| **Ruolo**    | Titolare o Admin |
| **Device**   | Desktop          |

**Passaggi:**

1. In Impostazioni, sezione **Accesso a Shopify**, leggi l'elenco permessi.

**Risultato atteso:** ogni scope ha etichetta leggibile e badge lettura/scrittura.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-036 — Ripristina connessione (se errore stale)

|              |                  |
| ------------ | ---------------- |
| **Priorità** | P3               |
| **Ruolo**    | Titolare o Admin |
| **Device**   | Desktop          |

**Prerequisiti:** connessione in stato errore simulato o reale.

**Passaggi:**

1. Se compare **Ripristina connessione**, cliccalo.
2. Attendi esito.

**Risultato atteso:** errore cleared o messaggio esplicativo. Stato connessione migliorato.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-037 — Disconnetti Shopify

|              |                  |
| ------------ | ---------------- |
| **Priorità** | P2               |
| **Ruolo**    | Titolare o Admin |
| **Device**   | Desktop          |

**Passaggi:**

1. Clicca **Disconnetti Shopify** (non «Disconnetti e rimuovi dati»).
2. Verifica stato connessione.
3. **Riconnetti** subito dopo (T-031) per non bloccare altri test.

**Risultato atteso:** stato Disconnesso. I dati già importati (prodotti, clienti) restano in VestiFlow. Form per nuova connessione visibile. Riconnessione funziona.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-037b — Wizard Cambia negozio / Disconnetti e rimuovi dati

|                  |                                                     |
| ---------------- | --------------------------------------------------- |
| **Priorità**     | P2                                                  |
| **Ruolo**        | Titolare o Admin                                    |
| **Device**       | Desktop                                             |
| **Prerequisiti** | Shopify connesso, ambiente di test (non produzione) |

**Passaggi:**

1. **Impostazioni → Integrazione Shopify → Cambia negozio**.
2. Verifica anteprima conteggi (prodotti, clienti, ordini, location).
3. Chiudi il wizard **senza** confermare (Annulla).
4. Ripeti con **Disconnetti e rimuovi dati**; verifica che compaiano avvisi su irreversibilità e ordini fornitori.
5. **Non** completare la purge in staging con dati reali salvo test dedicato.

**Risultato atteso:** wizard multi-step, conteggi coerenti, conferma dominio richiesta, blockers visibili se ordini fornitori aperti.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-037c — Pannello Sede fisica

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Impostazioni → Sede fisica**.
2. Verifica nome commerciale, negozio, profilo canale.
3. Espandi **Dati fiscali e contatti** se presenti.

**Risultato atteso:** anagrafica tenant visibile; distinta dalle location Shopify sotto Integrazione Shopify.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-038 — Commesso non vede azioni Shopify

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Commesso |
| **Device**   | Desktop  |

**Passaggi:**

1. Accedi come Commesso.
2. Vai in Impostazioni → Integrazione Shopify.

**Risultato atteso:** nessun pulsante Connetti/Disconnetti/Sync. Messaggio che solo titolare/admin possono gestire Shopify.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-039 — Tabella location in Impostazioni

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Impostazioni → Integrazione Shopify → Location**.
2. Verifica gruppi **Sedi Shopify** e **Sede locale** (se presenti).
3. Verifica colonne: nome, stato sync, riferimenti utili.

**Risultato atteso:** location elencate nel pannello Shopify. Stato sync leggibile. Nome commerciale tenant **non** confuso con sedi Shopify.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-040 — Attivazione MFA

|              |                  |
| ------------ | ---------------- |
| **Priorità** | P1               |
| **Ruolo**    | Titolare o Admin |
| **Device**   | Desktop          |

**Passaggi:**

1. **Impostazioni → Sicurezza account**.
2. Avvia procedura MFA (QR code / codice setup).
3. Scansiona con app authenticator e inserisci codice di verifica.
4. Completa attivazione.

**Risultato atteso:** MFA risulta attivo. Al prossimo login richiede codice (T-006).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-041 — Commesso non vede sezione MFA

|              |          |
| ------------ | -------- |
| **Priorità** | P3       |
| **Ruolo**    | Commesso |
| **Device**   | Desktop  |

**Passaggi:**

1. Impostazioni come Commesso.

**Risultato atteso:** sezione **Sicurezza account** / MFA non visibile o non modificabile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 5. Prodotti e catalogo

### T-050 — Lista prodotti: caricamento e filtri

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Manager+              |
| **Device**   | Desktop               |

**Passaggi:**

1. Vai in **Prodotti**.
2. Usa ricerca libera (nome, brand, SKU).
3. Applica filtri categoria / brand / stagione se disponibili.
4. Reset filtri.

**Risultato atteso:** tabella si aggiorna. Risultati coerenti. Empty state se nessun match.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-051 — Creazione prodotto completa (wizard 4 step)

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Manager+              |
| **Device**   | Desktop               |

**Passaggi:**

1. **Prodotti → Aggiungi prodotto**.
2. **Step 1 — Dati generali:** nome `TEST-A-Giacca`, brand, categoria (select), stagione (select), descrizione. Aggiungi almeno 1 immagine (JPEG/PNG ≤ 5 MB).
3. **Step 2 — Opzioni:** aggiungi valori alla prima opzione (es. S, M, L) e alla seconda (es. Nero, Bianco). Verifica generazione combinazioni.
4. **Step 3 — Varianti:** compila SKU univoci per ogni variante, prezzo vendita, barcode opzionale su almeno una variante.
5. **Step 4 — Riepilogo:** controlla dati e clicca **Crea prodotto**.

**Risultato atteso:** prodotto creato. Redirect a dettaglio o lista. 6 varianti generate (3×2). Nessun errore SKU duplicato.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-052 — Select categoria/stagione e valore custom

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. In nuovo prodotto, step Dati generali, apri select **Categoria**.
2. Scegli voce dall'elenco.
3. Scegli **Altra categoria…** e inserisci testo libero.
4. Ripeti per **Stagione**.

**Risultato atteso:** select a larghezza piena come gli altri campi. Opzione custom mostra input testo. Valore salvato correttamente nel riepilogo.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-053 — Validazione SKU duplicato

|              |          |
| ------------ | -------- |
| **Priorità** | P1       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. In creazione/modifica prodotto, step Varianti, inserisci uno SKU già usato da un'altra variante.
2. Prova ad avanzare / salvare.

**Risultato atteso:** errore immediato su SKU duplicato. Salvataggio bloccato.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-054 — Uscita form con modifiche non salvate

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. Apri modifica prodotto o nuovo prodotto.
2. Modifica un campo senza salvare.
3. Clicca link **Prodotti** o altra voce menu.
4. Nel dialog VestiFlow scegli **Annulla** (resta) poi ripeti e scegli **Esci senza salvare**.

**Risultato atteso:** dialog di conferma VestiFlow (non popup browser nativo per navigazione interna). Annulla mantiene modifiche. Esci naviga via.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-055 — Dettaglio prodotto

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Dalla lista clicca un prodotto.
2. Verifica sezioni: dati generali, varianti, giacenze per location, badge sync Shopify.

**Risultato atteso:** tutte le informazioni coerenti con creazione. Tabella varianti con SKU, prezzi, barcode.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-056 — Modifica prodotto esistente

|              |          |
| ------------ | -------- |
| **Priorità** | P1       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. Dal dettaglio clicca **Modifica**.
2. Cambia nome e prezzo di una variante.
3. Salva.

**Risultato atteso:** modifiche persistite. Dettaglio aggiornato. Con Shopify connesso: badge sync aggiornato o sync manuale disponibile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-057 — Sync manuale prodotto con Shopify

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Titolare/Admin |
| **Device**   | Desktop        |

**Prerequisiti:** Shopify connesso. Prodotto con badge "Da sincronizzare" o simile.

**Passaggi:**

1. Nel dettaglio prodotto clicca **Sincronizza con Shopify**.
2. Attendi esito.

**Risultato atteso:** badge diventa **Sincronizzato** o messaggio errore chiaro. Prodotto visibile su Shopify Admin.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-058 — Elimina prodotto

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Titolare/Admin |
| **Device**   | Desktop        |

**Passaggi:**

1. Elimina un prodotto di test **senza movimenti** di magazzino (non usato altrove).
2. Conferma nel dialog.
3. Se Shopify connesso e prodotto sincronizzato: verifica rimozione anche su Shopify Admin.

**Risultato atteso:** prodotto rimosso da lista VestiFlow. Con sync attivo, rimosso anche da Shopify. Se il prodotto ha movimenti, eliminazione **bloccata** con messaggio chiaro.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-059 — Esporta CSV catalogo

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. Prodotti → **Esporta CSV**.
2. Apri il file scaricato.

**Risultato atteso:** file CSV con colonne SKU, varianti, prezzi, metadati. Dati coerenti con lista filtrata.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-060 — Importa CSV catalogo

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. **Prodotti → Importa CSV**.
2. Carica file CSV formato Shopify valido (con prodotti di test).
3. Controlla anteprima errori.
4. Conferma import.

**Risultato atteso:** prodotti importati o errori riga per riga in anteprima. Nessun import silenzioso di righe invalide.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-061 — Scanner barcode in lista prodotti

|              |                                              |
| ------------ | -------------------------------------------- |
| **Priorità** | P2                                           |
| **Ruolo**    | Manager+                                     |
| **Device**   | Mobile (Chrome/Android) o desktop con webcam |

**Prerequisiti:** variante con barcode compilato.

**Passaggi:**

1. In Prodotti clicca **Scansiona barcode**.
2. Scansiona barcode noto (o inserisci manualmente se no camera).

**Risultato atteso:** apertura diretta dettaglio prodotto corrispondente. Se non trovato: feedback chiaro.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-062 — Commesso non crea prodotti

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Commesso |
| **Device**   | Desktop  |

**Passaggi:**

1. Accedi come Commesso.
2. Vai in Prodotti. Prova `/app/products/new` manualmente.

**Risultato atteso:** pulsante Aggiungi prodotto assente o disabilitato. Route new bloccata (redirect o accesso negato).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 6. Magazzino — Giacenze

### T-070 — Tab Giacenze: tabella e filtri

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Desktop               |

**Passaggi:**

1. Vai in **Magazzino** (tab Giacenze, default).
2. Verifica colonne: prodotto/variante, SKU, quantità per stati (disponibile, impegnato…), location.
3. Usa filtri ricerca e stato stock.

**Risultato atteso:** tabella popolata. Numeri allineati a destra con tabular-nums. Filtri funzionanti.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-071 — Navigazione tab magazzino

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Clicca tab **Giacenze**, **Cerca**, **Movimenti**, **Inventario fisico**.

**Risultato atteso:** ogni tab apre la pagina corretta mantenendo shell coerente.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-072 — Sincronizza giacenze da Shopify

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Titolare/Admin |
| **Device**   | Desktop        |

**Passaggi:**

1. Giacenze → **Sincronizza giacenze da Shopify**.
2. Attendi completamento.

**Risultato atteso:** messaggio esito. Quantità aggiornate rispetto a Shopify.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-073 — Esporta CSV giacenze

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. Applica un filtro (es. una location).
2. **Esporta CSV**.
3. Apri file.

**Risultato atteso:** CSV con SKU, Location, quantità. Rispetta filtri attivi.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-074 — Link Registra movimento da Giacenze

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Da Giacenze clicca **Registra movimento**.

**Risultato atteso:** apertura form movimento `/app/inventory/movements/new`.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 7. Magazzino — Cerca giacenza

### T-080 — Ricerca per SKU

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Entrambi              |

**Passaggi:**

1. **Magazzino → Cerca** (o menu laterale Magazzino).
2. Digita SKU esistente.
3. Clicca **Cerca giacenza**.

**Risultato atteso:** scheda variante con giacenze per ogni location. Link a prodotto e **Registra movimento**.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-081 — Ricerca per barcode / scanner

|              |                  |
| ------------ | ---------------- |
| **Priorità** | P1               |
| **Ruolo**    | Qualsiasi        |
| **Device**   | Mobile preferito |

**Passaggi:**

1. In Cerca giacenza usa **Scansiona barcode** su variante con barcode noto.

**Risultato atteso:** stesso risultato di T-080. Su dispositivo senza camera: scanner disabilitato, ricerca manuale possibile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-082 — SKU inesistente

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Cerca SKU `INEXISTENT-99999`.

**Risultato atteso:** empty state o messaggio "non trovato". Nessun crash.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-083 — Layout mobile Cerca giacenza

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Mobile    |

**Passaggi:**

1. Apri Cerca giacenza su smartphone.
2. Verifica allineamento campo ricerca, pulsanti **Scansiona barcode** e **Cerca giacenza** sulla stessa riga.

**Risultato atteso:** pulsanti stessa altezza dell'input. Nessun overflow orizzontale.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 8. Magazzino — Movimenti

### T-090 — Lista movimenti e filtri

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Magazzino → Movimenti**.
2. Filtra per tipo movimento, data, location se disponibili.

**Risultato atteso:** storico movimenti con tipo, quantità, SKU, operatore, data. Filtri applicati correttamente.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-091 — Movimento CARICO

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Desktop               |

**Prerequisiti:** variante TEST-A-\* con giacenza nota.

**Passaggi:**

1. **Registra movimento**.
2. Tipo: **Carico**. Seleziona variante, location, quantità 5.
3. Vai al riepilogo e **Conferma**.

**Risultato atteso:** movimento in storico. Giacenza disponibile aumentata di 5 sulla location scelta.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-092 — Movimento SCARICO

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Tipo **Scarico**, quantità 2, variante con stock sufficiente.
2. Conferma dal riepilogo.

**Risultato atteso:** giacenza diminuita di 2. Movimento tracciato. Se stock insufficiente: errore prima della conferma.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-093 — Movimento TRASFERIMENTO tra location

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Desktop               |

**Prerequisiti:** 2 location con stock origine sufficiente.

**Passaggi:**

1. Tipo **Trasferimento**.
2. Location origine A, destinazione B, quantità 3.
3. Verifica riepilogo (origine −3, destinazione +3).
4. Conferma.

**Risultato atteso:** stock aggiornato su entrambe le location. Un movimento transfer in storico.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-094 — Movimento RETTIFICA con motivo obbligatorio

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Tipo **Rettifica**, imposta nuova quantità o delta.
2. Prova a confermare **senza** motivo.
3. Inserisci motivo (es. "Conteggio errato") e conferma.

**Risultato atteso:** validazione blocca submit senza motivo. Con motivo: rettifica applicata e visibile in storico.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-095 — Scanner barcode nel form movimento

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Mobile    |

**Passaggi:**

1. In Registra movimento scansiona barcode variante nota.

**Risultato atteso:** campo Variante precompilato. Feedback scan visibile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-096 — Fase revisione movimento (doppia conferma)

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Compila movimento e vai a **Riepilogo**.
2. Verifica dati mostrati (tipo, SKU, location, impatto quantità).
3. Torna indietro e modifica, poi conferma.

**Risultato atteso:** riepilogo chiaro prima del submit. Modifica possibile prima della conferma finale.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 9. Magazzino — Import CSV giacenze

### T-100 — Import CSV giacenze valido

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. **Magazzino → Giacenze → Importa CSV**.
2. Carica CSV con colonne SKU, Location (nome esatto), Disponibile.
3. Controlla anteprima.
4. Conferma import.

**Risultato atteso:** giacenze aggiornate. Movimenti rettifica generati in storico.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-101 — Import CSV con errori

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. Importa CSV con SKU inesistente o location errata.

**Risultato atteso:** anteprima segnala righe invalide. Nessuna applicazione parziale non segnalata.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 10. Inventario fisico

### T-110 — Crea nuova sessione inventario

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Magazzino → Inventario fisico**.
2. **Nuova sessione** (o equivalente).
3. Nome `TEST-INV-Giugno`, seleziona location, note opzionali.
4. **Avvia inventario**.

**Risultato atteso:** sessione creata in stato aperto/in corso. Snapshot giacenze attuali.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-111 — Inserimento quantità contate

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Entrambi  |

**Passaggi:**

1. Apri sessione inventario creata.
2. Inserisci quantità contate per almeno 3 varianti (diverse da sistema su almeno 1).
3. Usa scanner barcode su una variante (se mobile).

**Risultato atteso:** quantità salvate. Differenze calcolate rispetto a snapshot.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-112 — Revisione differenze

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Passa alla fase revisione (se separata).
2. Verifica elenco differenze (+/−).

**Risultato atteso:** differenze chiare per variante. Totali coerenti.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-113 — Chiusura inventario e applicazione rettifiche

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Desktop               |

**Passaggi:**

1. Chiudi sessione inventario con conferma.
2. Vai in Giacenze e Movimenti.

**Risultato atteso:** giacenze allineate alle quantità contate. Movimenti rettifica generati. Sessione in stato chiuso/completato.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 11. Ordini fornitori

### T-120 — Lista ordini fornitori

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Ordini Fornitori**.
2. Usa filtri stato / fornitore / ricerca.

**Risultato atteso:** tabella ordini con riferimento, fornitore, stato, totali.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-121 — Nuovo ordine fornitore

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Manager+              |
| **Device**   | Desktop               |

**Passaggi:**

1. **Nuovo ordine**.
2. Seleziona fornitore esistente (o **Nuovo fornitore** con nome/contatti).
3. **Aggiungi riga**: variante, quantità ordinata, prezzo acquisto.
4. Salva ordine.

**Risultato atteso:** ordine in bozza o stato iniziale corretto. Dettaglio con righe e totali in EUR.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-122 — Invia ordine

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. Dal dettaglio ordine in bozza clicca **Invia ordine**.

**Risultato atteso:** stato aggiornato (inviato/in attesa). Pulsante non più disponibile se non applicabile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-123 — Ricevi merce (ordine fornitore)

|              |                            |
| ------------ | -------------------------- |
| **Priorità** | P1 · **Obbligatorio**      |
| **Ruolo**    | Qualsiasi (anche Commesso) |
| **Device**   | Desktop                    |

**Passaggi:**

1. Apri ordine inviato/in arrivo.
2. Clicca **Ricevi merce**.
3. Inserisci quantità ricevute per ogni riga (parziale o totale).
4. Conferma ricezione.

**Risultato atteso:** giacenze incrementate sulla location destinazione. Movimenti carico in storico. Stato ordine aggiornato (parzialmente ricevuto / completato).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-124 — Commesso non crea ordini

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Commesso |
| **Device**   | Desktop  |

**Passaggi:**

1. Accedi come Commesso. Verifica assenza pulsante **Nuovo ordine**. Prova `/app/orders/new`.

**Risultato atteso:** creazione bloccata. Ricezione merce ancora possibile (T-123).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 12. Vendite

### T-130 — Lista vendite Shopify

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Prerequisiti:** vendite presenti su Shopify (online o POS).

**Passaggi:**

1. **Vendite**.
2. Filtra per stato pagamento e canale (online/negozio).
3. Cerca per numero ordine o cliente.

**Risultato atteso:** ordini read-only. Dati coerenti con Shopify Admin.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-131 — Dettaglio vendita

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Apri dettaglio di un ordine vendita.
2. Verifica righe, totali, cliente, stato, ID Shopify.

**Risultato atteso:** nessun pulsante modifica. Informazioni complete e formattazione prezzi corretta.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-132 — Sincronizza vendite da Shopify

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Titolare/Admin |
| **Device**   | Desktop        |

**Passaggi:**

1. **Sincronizza vendite da Shopify**. Attendi esito.

**Risultato atteso:** nuove vendite importate o messaggio "aggiornato". Commesso non vede il pulsante.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-133 — Esporta CSV vendite

|              |          |
| ------------ | -------- |
| **Priorità** | P3       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. **Esporta CSV** dalla lista vendite.

**Risultato atteso:** file scaricato con ordini filtrati.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 13. Clienti

### T-140 — Lista clienti

|              |           |
| ------------ | --------- |
| **Priorità** | P1        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Clienti**. Cerca per nome/email.

**Risultato atteso:** anagrafica read-only da Shopify. Nessun form modifica.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-141 — Dettaglio cliente

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Apri un cliente. Verifica email, telefono, ordini collegati se presenti.

**Risultato atteso:** dati allineati a Shopify. Solo consultazione.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-142 — Sincronizza clienti da Shopify

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Titolare/Admin |
| **Device**   | Desktop        |

**Passaggi:**

1. **Sincronizza clienti da Shopify**.

**Risultato atteso:** clienti aggiornati o messaggio esito.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 14. Report

### T-150 — KPI report

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Report**. Verifica KPI: Valore magazzino, Pezzi disponibili, Varianti sotto soglia, Fatturato.

**Risultato atteso:** valori numerici coerenti con Dashboard/Magazzino (ordine di grandezza).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-151 — Tabella giacenze per location

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Sezione **Giacenze per location** nel Report.

**Risultato atteso:** breakdown per sede con totali.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-152 — Vendite per stato pagamento

|              |           |
| ------------ | --------- |
| **Priorità** | P3        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Sezione **Vendite per stato pagamento**.

**Risultato atteso:** conteggi/importi per stato (pagato, in attesa, ecc.).

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 15. Guida integrata

### T-154 — Guida utente in-app

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. **Guida** dal menu.
2. Naviga indice, scorri sezioni.
3. Scarica PDF se disponibile.

**Risultato atteso:** contenuto leggibile. Link indice funzionanti. PDF scaricabile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-155 — Guida tecnica (solo platform admin)

|              |                |
| ------------ | -------------- |
| **Priorità** | P3             |
| **Ruolo**    | Platform admin |
| **Device**   | Desktop        |

**Passaggi:**

1. Verifica voce **Guida Tecnica** in sidebar (solo admin piattaforma).
2. Apri `/app/admin/guide`.

**Risultato atteso:** guida operatore/tecnica. Utente negozio normale non vede la voce.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 16. Amministrazione piattaforma

> Solo se avete accesso **platform admin**. Altrimenti segnate N/A.

### T-160 — Crea nuovo cliente (tenant)

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Platform admin |
| **Device**   | Desktop        |

**Passaggi:**

1. Apri `/app/admin/clients/new`.
2. Compila dati tenant e primo utente.
3. Salva.

**Risultato atteso:** tenant creato. Login con nuovo account funzionante.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-161 — Modifica cliente esistente

|              |                |
| ------------ | -------------- |
| **Priorità** | P3             |
| **Ruolo**    | Platform admin |
| **Device**   | Desktop        |

**Passaggi:**

1. `/app/admin/clients/{tenantId}`.
2. Modifica dati e salva.

**Risultato atteso:** modifiche persistite.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-162 — Avvia sessione assistenza da elenco clienti

|              |                |
| ------------ | -------------- |
| **Priorità** | P2             |
| **Ruolo**    | Platform admin |
| **Device**   | Desktop        |

**Passaggi:**

1. Login come platform admin.
2. Apri `/app/admin/clients` (tabella **Clienti registrati**).
3. Su un tenant cliente (non operatore), click **Apri gestionale (assistenza)** nella colonna **Assistenza**.

**Risultato atteso:** redirect al gestionale del tenant (es. dashboard). Nessun errore 500. Record sessione creato lato backend.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-163 — Sessione assistenza: banner e operatività

|                  |                                    |
| ---------------- | ---------------------------------- |
| **Priorità**     | P2                                 |
| **Ruolo**        | Platform admin                     |
| **Device**       | Desktop                            |
| **Prerequisiti** | Sessione assistenza attiva (T-162) |

**Passaggi:**

1. Verifica banner in basso: «Assistenza — {nome cliente}» e testo «Sessione attiva (max 2 ore)».
2. Apri **Magazzino → Giacenze** o **Prodotti** e consulta dati del tenant.
3. Esegui un'azione di scrittura consentita ad admin (es. rettifica giacenza di test o modifica prodotto).

**Risultato atteso:** banner sempre visibile; dati del tenant corretti; nessun 403 su operazioni admin; sidebar «Esci» non sovrapposta al banner su mobile.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-164 — Termina sessione assistenza

|                  |                                    |
| ---------------- | ---------------------------------- |
| **Priorità**     | P2                                 |
| **Ruolo**        | Platform admin                     |
| **Device**       | Desktop                            |
| **Prerequisiti** | Sessione assistenza attiva (T-162) |

**Passaggi:**

1. Dal banner in basso, click **Esci dall'assistenza**.
2. Attendi il redirect.

**Risultato atteso:** ritorno a `/app/admin/clients` (shell admin). Banner scomparso. Nuove richieste API tenant non usano più la sessione assistenza.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 17. Mobile e PWA

### T-170 — Installazione PWA (Android)

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P2                    |
| **Ruolo**    | Qualsiasi             |
| **Device**   | Mobile Android Chrome |

**Passaggi:**

1. Apri VestiFlow in Chrome.
2. Menu → **Aggiungi a schermata Home** / **Installa app**.
3. Apri da icona home.

**Risultato atteso:** app standalone a schermo intero. Login funzionante.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-171 — Installazione PWA (iPhone Safari)

|              |               |
| ------------ | ------------- |
| **Priorità** | P3            |
| **Ruolo**    | Qualsiasi     |
| **Device**   | iPhone Safari |

**Passaggi:**

1. **Condividi → Aggiungi a Home**.
2. Apri da icona.

**Risultato atteso:** shortcut funzionante. (Scanner barcode può essere N/A su iOS.)

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-172 — Operatività magazzino da mobile

|              |          |
| ------------ | -------- |
| **Priorità** | P1       |
| **Ruolo**    | Commesso |
| **Device**   | Mobile   |

**Passaggi:**

1. Cerca giacenza per SKU.
2. Registra un carico di 1 pezzo.
3. Consulta movimento in storico.

**Risultato atteso:** flusso completabile touch-friendly. Target touch ≥ 44px.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 18. Permessi per ruolo

### T-180 — Matrice permessi Titolare

|              |          |
| ------------ | -------- |
| **Priorità** | P1       |
| **Ruolo**    | Titolare |
| **Device**   | Desktop  |

**Passaggi:**

1. Verifica accesso a: Shopify, sync manuali, creazione prodotti, ordini, export CSV, MFA.

**Risultato atteso:** tutte le azioni P1 disponibili per titolare.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-181 — Matrice permessi Manager

|              |         |
| ------------ | ------- |
| **Priorità** | P2      |
| **Ruolo**    | Manager |
| **Device**   | Desktop |

**Passaggi:**

1. Verifica: crea prodotti OK, Shopify NO, sync vendite NO, movimenti OK, export OK.

**Risultato atteso:** coerente con tabella permessi guida utente §4.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-182 — Matrice permessi Commesso

|              |          |
| ------------ | -------- |
| **Priorità** | P2       |
| **Ruolo**    | Commesso |
| **Device**   | Desktop  |

**Passaggi:**

1. Verifica: solo consultazione prodotti, movimenti OK, ricezione ordine OK, niente creazione prodotti/ordini, niente Shopify.

**Risultato atteso:** UI nasconde azioni non permesse. Route protette non accessibili.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## 19. Flussi end-to-end integrati

> Eseguire **dopo** i test di sezione. Richiedono Shopify connesso.

### T-190 — Flusso onboarding negozio completo

|              |                       |
| ------------ | --------------------- |
| **Priorità** | P1 · **Obbligatorio** |
| **Ruolo**    | Titolare              |
| **Device**   | Desktop               |

**Passaggi:**

1. Login → Impostazioni → Connetti Shopify.
2. Sincronizza location → Attiva webhook → Importa catalogo.
3. Verifica prodotti in lista.
4. Sincronizza giacenze.
5. Dashboard mostra KPI aggiornati.

**Risultato atteso:** negozio operativo end-to-end senza errori bloccanti.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-191 — Prodotto VestiFlow → Shopify

|              |          |
| ------------ | -------- |
| **Priorità** | P1       |
| **Ruolo**    | Manager+ |
| **Device**   | Desktop  |

**Passaggi:**

1. Crea prodotto nuovo in VestiFlow con 2 varianti.
2. Attendi sync o sync manuale.
3. Verifica prodotto su Shopify Admin.

**Risultato atteso:** prodotto e varianti visibili su Shopify con SKU e prezzi corretti.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-192 — Vendita Shopify → giacenza VestiFlow

|              |          |
| ------------ | -------- |
| **Priorità** | P1       |
| **Ruolo**    | Titolare |
| **Device**   | Desktop  |

**Passaggi:**

1. Annota giacenza variante X su location Y.
2. Crea ordine test su Shopify (o POS) che include variante X.
3. Attendi webhook (1–3 min) o sync manuale vendite/giacenze.
4. Verifica giacenza e movimento in VestiFlow.

**Risultato atteso:** giacenza diminuita. Movimento tipo vendita/sale in storico con origine Shopify.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-193 — Ordine fornitore → carico magazzino

|              |                    |
| ------------ | ------------------ |
| **Priorità** | P1                 |
| **Ruolo**    | Manager + Commesso |
| **Device**   | Desktop            |

**Passaggi:**

1. Manager crea e invia ordine fornitore (10 pz variante Z).
2. Commesso riceve merce (10 pz).
3. Verifica giacenza +10 e movimento carico.

**Risultato atteso:** stock e storico coerenti. Ordine completato.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

### T-194 — Inventario fisico → rettifica → Shopify

|              |           |
| ------------ | --------- |
| **Priorità** | P2        |
| **Ruolo**    | Qualsiasi |
| **Device**   | Desktop   |

**Passaggi:**

1. Sessione inventario su location con sync Shopify.
2. Conta quantità diversa da sistema su 1 variante.
3. Chiudi inventario.
4. Verifica giacenza VestiFlow e (dopo sync) Shopify Admin.

**Risultato atteso:** rettifiche allineate. Movimenti tracciati.

| Esito           | Tester | Data | Note |
| --------------- | ------ | ---- | ---- |
| ☐ OK ☐ KO ☐ N/A |        |      |      |

---

## Riepilogo finale

Al termine di tutti i test, compilare:

| Metrica                 | Valore |
| ----------------------- | ------ |
| Test totali             | ~75    |
| OK                      |        |
| KO                      |        |
| N/A                     |        |
| Data inizio             |        |
| Data fine               |        |
| Ambiente testato (URL)  |        |
| Versione build / commit |        |

### Criteri go / no-go

| Esito     | Condizione                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------- |
| **GO**    | Tutti i test **P1 Obbligatori** = OK. KO P2/P3 documentati con workaround accettato.                     |
| **NO-GO** | Qualsiasi test P1 Obbligatorio = KO su funzione core (login, prodotti, movimenti, ordini, sync critica). |

### Bug da segnalare (template)

Per ogni KO copiare e compilare:

```
ID test: T-___
Titolo:
Passaggi eseguiti:
Risultato atteso vs ottenuto:
Browser/Device:
Screenshot: sì/no
Priorità bug: bloccante / alta / media / bassa
```

---

_Documento generato per VestiFlow. Rigenerare PDF: `npm run docs:test-plan:all`_
