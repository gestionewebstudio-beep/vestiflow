# Report collaudo VestiFlow online — Tranche 1

|                    |                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Data**           | 17 luglio 2026                                                                                                    |
| **Istanza**        | https://vestiflow--gestione-web-studio.europe-west4.hosted.app (API: https://vestiflow-production.up.railway.app) |
| **Profilo canale** | Solo gestionale                                                                                                   |
| **Account usati**  | Titolare: `test@sologestionale.it` · Commesso: `commesso@test.it`                                                 |
| **Tranche**        | 1 — sezioni 0–7 del piano test (T-001 → T-083)                                                                    |
| **Metodo**         | Spec Playwright esistenti (`e2e/`) come smoke + script usa-e-getta in `e2e-collaudo/` per i casi non coperti      |

## Sezione 0 — Preparazione ambiente

- Backend API raggiungibile (`/api/v1/health` → 200) e frontend online (200). ✅
- Account disponibili: **solo Titolare e Commesso** — mancano Admin negozio e Manager (checklist 0.1 punto 4 parziale; i test che li richiedono non sono in questa tranche).
- **Location configurate: 1 sola** («Test SG») — la checklist 0.1 punto 6 chiede almeno 2; questo rende N/A il test T-012 (cambio sede) e limita i futuri test di trasferimento (tranche 2).
- Shopify non previsto dal profilo (le voci 0.1/3 non si applicano).
- Nota ambiente: il catalogo del tenant contiene dati di prova poco significativi (prodotti con nome «eeee», SKU «dd», «5»); non è un problema funzionale ma rende meno leggibili gli esiti.

## Tabella esiti

Esiti: **OK** = conforme · **KO** = difforme (gravità P1/P2/P3) · **N/A** = non applicabile o non eseguibile (motivo in nota).

### 1. Accesso e autenticazione

| ID    | Titolo                        | Esito  | Gravità | Note                                                                     |
| ----- | ----------------------------- | ------ | ------- | ------------------------------------------------------------------------ |
| T-001 | Login credenziali valide      | OK     |         | Redirect a dashboard, topbar e sidebar presenti                          |
| T-002 | Login password errata         | OK     |         | Messaggio «Email o password non corretti.», si resta su /login           |
| T-003 | Validazione campi login vuoti | OK     |         | Errori inline «Inserisci la tua email/password.», nessuna chiamata login |
| T-004 | Password dimenticata          | **KO** | **P2**  | Vedi dettaglio KO-1                                                      |
| T-005 | Logout                        | OK     |         | Dialog di conferma; /app/\* → redirect a /login                          |
| T-006 | Login con MFA                 | N/A    |         | MFA non attivabile (vietato dalle regole di collaudo)                    |
| T-007 | Torna a email/password da MFA | N/A    |         | Come sopra                                                               |
| T-008 | Guest guard                   | OK     |         | Utente loggato su /login → redirect all'app                              |

### 2. Shell, navigazione e UI generale

| ID    | Titolo                   | Esito  | Gravità | Note                                                                                                                                                   |
| ----- | ------------------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-010 | Sidebar: tutte le voci   | OK     |         | 18 voci del profilo presenti e navigabili; «Canali online»/«Ordini Shopify» assenti (§19 ok); «Preventivi» visibile e disabilitata                     |
| T-011 | Voce Guida               | OK     |         | /app/guide con manuale del gestionale                                                                                                                  |
| T-012 | Selettore sede in topbar | N/A    |         | Prerequisito non soddisfatto: il tenant ha 1 sola location; etichetta fissa coerente con §3.2                                                          |
| T-013 | Indicatore sync Shopify  | N/A    |         | Solo profilo Shopify; verificato in negativo: chip sync assente (§19 ok)                                                                               |
| T-014 | Cambio tema              | OK     |         | Chiaro/Scuro/Sistema da Impostazioni → Aspetto; `data-theme` applicato e persistente dopo refresh. **Divergenza D-1**: nessun selettore tema in topbar |
| T-015 | Sidebar mobile (drawer)  | OK     |         | Drawer da hamburger, navigazione e riapertura ok (Pixel 5)                                                                                             |
| T-016 | Loading ed empty state   | OK     |         | Empty state con messaggio dedicato su ricerca senza risultati                                                                                          |
| T-017 | Stato errore con Riprova | **KO** | **P3**  | Vedi dettaglio KO-2                                                                                                                                    |

### 3. Dashboard

| ID    | Titolo                | Esito | Gravità | Note                                                                                                                                                                                                                   |
| ----- | --------------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-020 | KPI dashboard         | OK    |         | Card «Prodotti a catalogo», «Ordini in arrivo» e pannello Performance (Fatturato, Margine lordo, Pezzi venduti, Previsione mese, Valore magazzino, ecc.). «Vendite da evadere» assente come previsto dal profilo (§19) |
| T-021 | Varianti sotto soglia | OK    |         | Tabella/messaggio positivo + link «Vai al magazzino»                                                                                                                                                                   |
| T-022 | Ultime vendite        | N/A   |         | Tabella solo profilo Shopify; verificato il testo informativo §5.4 previsto per il profilo gestionale                                                                                                                  |

### 4. Impostazioni

| ID                        | Titolo                           | Esito | Gravità | Note                                                                                                                                                  |
| ------------------------- | -------------------------------- | ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-030                     | Profilo utente                   | OK    |         | Email account visibile nel pannello Profilo                                                                                                           |
| T-031→T-039, T-042, T-044 | Shopify / TikTok / Location sync | N/A   |         | Non esistono nel profilo Solo gestionale; verificato in negativo (§19 ok: nessun pannello Shopify/TikTok/Location)                                    |
| T-037c                    | Pannello Sede fisica             | OK    |         | Anagrafica tenant con riquadro «Dati fiscali e contatti»                                                                                              |
| T-040                     | Attivazione MFA                  | N/A   |         | Vietato dalle regole di collaudo (modifica MFA)                                                                                                       |
| T-041                     | Commesso non vede/gestisce MFA   | OK    |         | Con account commesso il pannello non offre azioni di attivazione                                                                                      |
| T-045                     | Magazzino e documenti            | OK    |         | Flag lotti/seriali salvati e persistenti dopo reload; valori originali ripristinati a fine test. Pagine dedicate Codici IVA e Pagamenti raggiungibili |

### 5. Prodotti e catalogo

| ID    | Titolo                           | Esito         | Gravità | Note                                                                                                                                        |
| ----- | -------------------------------- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T-047 | Inserimento rapido               | **KO**        | **P1**  | Vedi dettaglio KO-3 (creazione prodotto → 500)                                                                                              |
| T-048 | Rapido → wizard varianti         | **KO**        | **P1**  | Stesso difetto KO-3; il passaggio di modalità e le 6 varianti in UI funzionano, il salvataggio no                                           |
| T-050 | Lista: ricerca e filtri          | OK            |         | Ricerca per SKU/nome e empty state ok (su dati esistenti)                                                                                   |
| T-051 | Wizard completo 4 step           | **KO**        | **P1**  | Stesso difetto KO-3; wizard percorribile fino al riepilogo, immagine accettata                                                              |
| T-052 | Select categoria/stagione custom | OK (parziale) |         | Inserimento valori custom esercitato senza errori nel wizard; persistenza non verificabile per KO-3                                         |
| T-053 | Validazione SKU duplicato        | **KO**        | **P2**  | Vedi dettaglio KO-4                                                                                                                         |
| T-054 | Modifiche non salvate            | OK            |         | Dialog VestiFlow «Modifiche non salvate»; «Resta nella pagina» conserva i dati, «Esci senza salvare» naviga. **Divergenza D-3** (etichette) |
| T-055 | Dettaglio prodotto               | OK            |         | Varianti con SKU, badge fonte VestiFlow, nessun elemento sync (§19 ok)                                                                      |
| T-056 | Modifica prodotto                | N/A           |         | Bloccato: senza prodotti E2E- creabili (KO-3) la modifica andrebbe fatta su dati non di collaudo — vietato dalle regole                     |
| T-057 | Sync manuale Shopify             | N/A           |         | Solo profilo Shopify                                                                                                                        |
| T-058 | Elimina prodotto                 | N/A           |         | Bloccato da KO-3: il prodotto E2E- da eliminare non può essere creato                                                                       |
| T-059 | Esporta CSV catalogo             | OK            |         | CSV scaricato con intestazione SKU/varianti/prezzi                                                                                          |
| T-060 | Importa CSV catalogo             | **KO**        | **P1**  | Vedi dettaglio KO-5 (stessa causa backend di KO-3)                                                                                          |
| T-061 | Scanner barcode lista            | N/A           |         | Richiede fotocamera/pistola fisica                                                                                                          |
| T-062 | Commesso non crea prodotti       | OK            |         | CTA assente e route /app/products/new reindirizzata                                                                                         |
| T-063 | Stampa etichetta                 | OK            |         | Anteprima singola con SKU su route print-label; bulk non verificato (selezione multipla non esercitata sui dati esistenti)                  |

### 6. Magazzino — Giacenze

| ID     | Titolo                    | Esito | Gravità | Note                                                                                                                 |
| ------ | ------------------------- | ----- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| T-070  | Tabella giacenze e filtri | OK    |         | Colonne Giacenza/Impegnata/Disponibile/In arrivo; ricerca ed empty state ok                                          |
| T-070b | Ricerca stock 0           | OK    |         | Variante a disponibile 0: assente senza ricerca, trovata cercando per SKU con stato Esaurito; coerente con tab Cerca |
| T-071  | Navigazione tab           | OK    |         | Giacenze / Cerca / Movimenti / Inventario fisico                                                                     |
| T-072  | Sync giacenze Shopify     | N/A   |         | Solo profilo Shopify; pulsante assente (§19 ok)                                                                      |
| T-073  | Esporta CSV giacenze      | OK    |         | Colonne: Variante, SKU, Location, Disponibile, Fisico, Impegnato, In arrivo                                          |
| T-074  | Link Registra movimento   | OK    |         | Apre /app/inventory/movements/new                                                                                    |

### 7. Magazzino — Cerca giacenza

| ID    | Titolo              | Esito         | Gravità | Note                                                                                  |
| ----- | ------------------- | ------------- | ------- | ------------------------------------------------------------------------------------- |
| T-080 | Ricerca per SKU     | OK            |         | Scheda variante con giacenze per sede e link rapidi                                   |
| T-081 | Ricerca per barcode | OK (parziale) |         | Ricerca testuale per EAN funziona; scanner con fotocamera N/A                         |
| T-082 | SKU inesistente     | OK            |         | Messaggio dedicato, nessun crash                                                      |
| T-083 | Layout mobile       | OK            |         | Nessun overflow orizzontale; «Scansiona barcode» e «Cerca giacenza» sulla stessa riga |

## Dettaglio KO

### KO-1 · T-004 — Recupero password risponde con errore sbagliato (P2)

- **Passi:** `/login` → «Password dimenticata?» → inserire l'email di un account esistente (`test@sologestionale.it`) → «Invia link di recupero».
- **Atteso:** messaggio di conferma invio email.
- **Osservato:** alert rosso **«Email o password non corretti.»** — messaggio peraltro incoerente col contesto (qui non esiste una password). L'invio del link non risulta avvenuto.
- **Screenshot:** `screenshots/T-004-forgot-password-errore.png`
- Il giro completo via email (T-004 passi 4-5) resta comunque N/A (email reali fuori ambito).

### KO-2 · T-017 — Nessuno stato errore/Riprova quando l'API non risponde (P3)

- **Passi:** con rete verso `/api/v1/products` bloccata (simulazione API giù), aprire `/app/products`.
- **Atteso:** messaggio di errore dedicato con pulsante **Riprova** (§3.4 del documento funzionale).
- **Osservato:** la lista resta in **«Caricamento in corso» a tempo indefinito** (osservati oltre 60 secondi); il componente `app-error-state` non compare mai.
- **Screenshot:** `screenshots/t-017-stato-errore-con-riprova-quando-l-api-non-risponde.png`

### KO-3 · T-047 / T-048 / T-051 — Creazione prodotto impossibile: API 500 (P1)

- **Passi:** Prodotti → Aggiungi prodotto → compilare Nome (`E2E-Maglietta-…`), SKU, Prezzo → «Crea prodotto». Stesso esito dal wizard con varianti.
- **Atteso:** prodotto creato, redirect a dettaglio/lista.
- **Osservato:** `POST /api/v1/products` risponde **500 «Errore interno del server»** e il prodotto non viene creato. Causa radice visibile dall'import (KO-5): errore Prisma «_Failed to deserialize column of type 'void'_» su `$queryRaw`, quindi un problema di backend/schema DB dell'istanza online.
- **Aggravante UI (P2):** in modalità **Inserimento rapido non compare alcun messaggio di errore** — il form resta fermo senza feedback (il blocco `submitError` è renderizzato solo nello step Riepilogo del wizard). L'utente non ha modo di capire che il salvataggio è fallito.
- **Nota positiva:** «Genera SKU» e «Genera» EAN-13 funzionano correttamente lato UI.
- **Screenshot:** `screenshots/t-047-…png`, `screenshots/t-048-…png`, `screenshots/t-051-…png`, `screenshots/t-058-…png` (T-058 bloccato dallo stesso difetto).

### KO-4 · T-053 — Nessun errore inline su SKU duplicato (P2)

- **Passi:** Nuovo prodotto (rapido) → inserire nello SKU il valore di uno SKU già esistente a catalogo («dd») → attendere.
- **Atteso:** errore immediato «SKU già in uso» e salvataggio bloccato (il form prevede il messaggio, e il piano lo richiede).
- **Osservato:** nessun errore inline entro 20 secondi. La verifica lato server non è possibile per via di KO-3 (il submit fallisce comunque con 500), quindi il rischio pratico attuale è mascherato dal bug più grave.
- **Screenshot:** `screenshots/t-053-validazione-sku-duplicato-inline-client-side.png`

### KO-5 · T-060 — Import CSV catalogo fallisce (P1)

- **Passi:** Prodotti → Importa CSV → file valido con 1 prodotto (`E2E-IMP-…`) → «Analizza file» (anteprima: 1 pronto, 0 errori) → conferma import.
- **Atteso:** prodotto importato.
- **Osservato:** esito **«Import non riuscito: 0 importati · 1 falliti»** con messaggio backend: `Invalid prisma.$queryRaw() invocation … Failed to deserialize column of type 'void'`. Stessa causa radice di KO-3. A differenza dell'inserimento rapido, qui **la UI riporta correttamente l'errore** all'utente.
- **Screenshot:** `screenshots/t-060-importa-csv-catalogo-con-anteprima.png`

## Divergenze documentazione vs app

Non necessariamente bug: punti in cui l'app osservata differisce dal documento funzionale (§) o dal piano test (T).

1. **D-1 — Selettore tema in topbar** (doc §3.2): la topbar contiene solo ricerca globale, blocco profilo ed Esci. Il tema si cambia esclusivamente da Impostazioni → Aspetto (dove funziona e persiste). Anche il piano T-014 cita la doppia collocazione.
2. **D-2 — SKU «obbligatorio e suggerito dal nome»** (doc §6.1/§6.3, piano T-047 passo 4): nell'app lo SKU dell'inserimento rapido è **facoltativo** («vuoto, a mano oppure Genera SKU») e la generazione è **manuale** tramite pulsante, non automatica dal nome. Presente inoltre un campo «Codice articolo (vuoto = generato automaticamente)» non descritto dal documento.
3. **D-3 — Etichette dialog modifiche non salvate** (piano T-054): il piano cita «Annulla»; l'app usa «Resta nella pagina» / «Esci senza salvare». Comportamento comunque conforme.
4. **D-4 — Piano T-020**: elenca la card «Vendite da evadere» tra i KPI attesi, ma per il profilo Solo gestionale il documento funzionale (§19) ne prevede l'assenza — l'app è coerente col documento, il piano è tarato sul profilo Shopify.
5. **D-5 — Spec Playwright in `e2e/` non allineati alla UI attuale** (manutenzione test, non bug app): `auth.spec.ts` cerca il pulsante topbar «Impostazioni (…» (oggi «Profilo e impostazioni — …»); `dashboard.spec.ts` usa un locator ambiguo su «Fatturato» (strict mode) e clicca un pulsante «Tema chiaro» che non esiste più; l'a11y spec del forgot-password fallisce per selettore axe. Da aggiornare.
6. **D-6 — Sessioni E2E**: il riuso dello `storageState` Playwright dopo la rotazione del refresh token fa rimbalzare al login le navigazioni successive (osservato e risolto rigenerando la sessione prima di ogni batch). Non riproducibile come bug utente in sessione normale, ma da considerare per la stabilità dei test automatici.

## Riepilogo

| Esito                       | Totale |
| --------------------------- | ------ |
| **OK**                      | 32     |
| **KO**                      | 7      |
| **N/A**                     | 23     |
| **Totale casi considerati** | 62     |

I N/A sono in larga parte strutturali: 13 test di Impostazioni riguardano integrazioni Shopify/TikTok/location sync che non esistono nel profilo Solo gestionale (verificati comunque in negativo secondo §19), più MFA/scanner/email reali esclusi dalle regole di collaudo e 3 test bloccati dal difetto P1 di creazione prodotto.

### Problemi più gravi, in ordine di priorità

1. **P1 — Creazione prodotto impossibile su tutta la linea** (KO-3: inserimento rapido, wizard con varianti) — `POST /api/v1/products` → 500. Blocca l'operatività di catalogo e, a cascata, i test su modifica/eliminazione (T-056/T-058) e parte della tranche 2.
2. **P1 — Import CSV catalogo fallisce** (KO-5) — stessa causa radice backend (errore Prisma «deserialize column of type 'void'»): da correggere lato server/schema DB dell'istanza.
3. **P2 — Inserimento rapido senza feedback d'errore** (parte di KO-3): quando il salvataggio fallisce l'utente non vede nulla; mostrare l'errore anche fuori dallo step Riepilogo.
4. **P2 — Recupero password rotto o con messaggio errato** (KO-1): l'utente che chiede il reset riceve «Email o password non corretti.».
5. **P3 — Nessuno stato errore/Riprova con API irraggiungibile** (KO-2): le liste restano in caricamento infinito.

### Dati di collaudo

Nessun dato E2E- residuo nel tenant: tutte le creazioni sono fallite per KO-3 (verificato con ricerca finale «E2E-» → 0 risultati); le impostazioni modificate in T-045 sono state riportate ai valori originali. Gli script usa-e-getta sono in `e2e-collaudo/` (gli spec ufficiali in `e2e/` non sono stati toccati).
