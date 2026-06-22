# VestiFlow — Guida per l'utente

**Versione documento:** 2.1 — Giugno 2026

**Per chi è questa guida:** titolari, responsabili magazzino, commessi e amministratori del negozio che usano VestiFlow ogni giorno.

**Prodotto:** VestiFlow — gestionale web multi-sede per boutique di abbigliamento, con integrazione opzionale a **Shopify** o **TikTok Shop** (in base al profilo scelto per il tuo negozio). L'integrazione **TikTok Shop è ancora parziale** — vedi [§7](#7-collegare-tiktok-shop).

---

## Indice

1. [Cos'è VestiFlow](#1-cosè-vestiflow)
2. [Accedere al gestionale](#2-accedere-al-gestionale)
3. [Orientarsi nell'interfaccia](#3-orientarsi-nellinterfaccia)
4. [Ruoli e permessi](#4-ruoli-e-permessi)
5. [Primi passi dopo l'attivazione](#5-primi-passi-dopo-lattivazione)
6. [Collegare Shopify](#6-collegare-shopify)
7. [Collegare TikTok Shop](#7-collegare-tiktok-shop)
8. [Cosa si sincronizza e dove](#8-cosa-si-sincronizza-e-dove)
9. [Prodotti e catalogo](#9-prodotti-e-catalogo)
10. [Magazzino e giacenze](#10-magazzino-e-giacenze)
11. [Ordini fornitori](#11-ordini-fornitori)
12. [Vendite e clienti](#12-vendite-e-clienti)
13. [Report e dashboard](#13-report-e-dashboard)
14. [Usare VestiFlow da smartphone](#14-usare-vestiflow-da-smartphone)
15. [Negozio fisico e Shopify POS](#15-negozio-fisico-e-shopify-pos)
16. [Profilo, foto e sicurezza account](#16-profilo-foto-e-sicurezza-account)
17. [Domande frequenti](#17-domande-frequenti)
18. [Guida nel menu](#18-guida-nel-menu)

---

## 1. Cos'è VestiFlow

VestiFlow è il **gestionale del tuo negozio**: catalogo, magazzino, ordini ai fornitori e — se previsto dal tuo profilo — allineamento con **Shopify** o **TikTok Shop**.

Con un account puoi:

- gestire **prodotti e varianti** (taglia, colore, SKU, barcode, prezzi);
- vedere e aggiornare **giacenze per sede** (negozio, magazzino, altri punti vendita);
- registrare **carichi, scarichi, trasferimenti e rettifiche** con storico;
- creare e ricevere **ordini fornitori**;
- consultare **vendite e clienti** importati da Shopify (profilo Shopify);
- tenere **catalogo e stock allineati** al canale e-commerce collegato, se presente.

VestiFlow **non sostituisce** il sito e-commerce: lo affianca per chi lavora in negozio e in magazzino.

### Cosa ti serve

| Requisito            | Note                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| Browser aggiornato   | Chrome, Edge, Safari o Firefox                                                        |
| Connessione internet | Il gestionale è online                                                                |
| Account VestiFlow    | Email e password ricevute all'attivazione                                             |
| Canale e-commerce    | **Shopify** o **TikTok Shop** se previsto dal tuo profilo; altrimenti solo gestionale |

---

## 2. Accedere al gestionale

### Login

1. Apri l'indirizzo del gestionale che ti è stato comunicato.
2. Inserisci **email** e **password**.
3. Se hai attivato la **verifica in due passaggi**, inserisci il codice a 6 cifre dall'app authenticator.
4. Entri nella **Dashboard**.

### Password dimenticata

1. Dalla schermata di login clicca **Password dimenticata**.
2. Inserisci la tua email e segui il link ricevuto per impostare una nuova password.

### Uscire

In alto a destra clicca l'icona **Esci** (freccia verso l'uscita). Compare una **conferma** prima di chiudere la sessione.

---

## 3. Orientarsi nell'interfaccia

### Menu laterale (sidebar)

Su desktop resta sempre visibile; su smartphone si apre con l'icona **menu** in alto.

| Voce                 | A cosa serve                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **Dashboard**        | Riepilogo attività                                                                       |
| **Prodotti**         | Catalogo, creazione, modifica, import/export CSV                                         |
| **Magazzino**        | Apre **Cerca giacenza** (ricerca rapida, ideale su mobile)                               |
| **Ordini Fornitori** | Acquisti dai fornitori                                                                   |
| **Vendite**          | Ordini da Shopify (sola lettura), export CSV                                             |
| **Clienti**          | Anagrafica da Shopify (sola lettura), export CSV                                         |
| **Report**           | Indicatori e riepiloghi                                                                  |
| **Impostazioni**     | Profilo, foto, tema, sedi, integrazione canale (Shopify o TikTok se prevista), sicurezza |

In fondo al menu trovi **Guida** (questo manuale integrato nell'app).

Dal menu **Magazzino** accedi subito alla ricerca; le altre sezioni magazzino (**Giacenze**, **Movimenti**, **Inventario fisico**) si aprono dai **tab** in alto nelle pagine del magazzino.

### Barra in alto (topbar)

- **Selettore sede** — filtra le operazioni per la location attiva (negozio, magazzino, ecc.)
- **Indicatore sync Shopify** — visibile solo con profilo **Shopify**; stato collegamento (clic → Impostazioni)
- **Tema** chiaro / scuro / sistema
- **Avatar profilo** — foto o iniziali; **clic → Impostazioni**
- **Esci** — logout con conferma

### Impostazioni: cosa compare

Il contenuto di **Impostazioni** dipende dal **profilo canale** del tuo negozio (scelto in fase di attivazione):

| Profilo canale      | Pannelli visibili in Impostazioni                                |
| ------------------- | ---------------------------------------------------------------- |
| **Solo gestionale** | Aspetto, **Profilo**, Location — nessuna integrazione e-commerce |
| **Shopify**         | Integrazione Shopify, Aspetto, **Profilo**, Location             |
| **TikTok Shop**     | Integrazione TikTok Shop, Aspetto, **Profilo**, Location         |

### Messaggi comuni

- **Caricamento** — skeleton o spinner mentre arrivano i dati
- **Elenco vuoto** — messaggio con suggerimento su cosa fare
- **Errore** — descrizione e pulsante **Riprova**

---

## 4. Ruoli e permessi

Ogni utente ha un **ruolo VestiFlow** (Titolare, Amministratore, Manager, Commesso). Il ruolo **non** viene da Shopify: sono due sistemi separati.

| Ruolo              | Chi è di solito                   |
| ------------------ | --------------------------------- |
| **Titolare**       | Proprietario del negozio          |
| **Amministratore** | Referente negozio / IT            |
| **Manager**        | Responsabile magazzino o acquisti |
| **Commesso**       | Operatore negozio o magazzino     |

### Cosa puoi fare (in sintesi)

| Operazione                                         | Titolare / Admin | Manager | Commesso |
| -------------------------------------------------- | ---------------- | ------- | -------- |
| Collegare Shopify / TikTok Shop, sync sedi, import | Sì               | No      | No       |
| Sync manuale vendite / clienti / giacenze          | Sì               | No      | No       |
| Creare e modificare prodotti, import/export CSV    | Sì               | Sì      | No       |
| Export/import CSV giacenze                         | Sì               | Sì      | No       |
| Export CSV vendite e clienti                       | Sì               | Sì      | No       |
| Creare e inviare ordini fornitori                  | Sì               | Sì      | No       |
| Ricevere merce su ordine fornitore                 | Sì               | Sì      | Sì       |
| Consultare giacenze, movimenti, vendite, clienti   | Sì               | Sì      | Sì       |
| Registrare movimenti di magazzino                  | Sì               | Sì      | Sì       |
| Inventario fisico (conteggio)                      | Sì               | Sì      | Sì       |
| Attivare MFA (Impostazioni)                        | Sì               | Sì      | No       |

Se un pulsante o una pagina non compare, il tuo ruolo non lo consente. Per nuovi account o cambio ruolo contatta il **referente VestiFlow** che ha attivato il gestionale.

**Buona pratica:** ogni persona deve avere il proprio account, senza condividere password.

---

## 5. Primi passi dopo l'attivazione

Percorso consigliato per il **titolare** del negozio:

| Step | Dove                     | Cosa fare                                               |
| ---- | ------------------------ | ------------------------------------------------------- |
| 1    | Login                    | Accedi con le credenziali ricevute                      |
| 2    | Impostazioni → Profilo   | Carica una **foto profilo** (opzionale)                 |
| 3    | Impostazioni → Sicurezza | Attiva MFA (consigliato)                                |
| 4    | Canale e-commerce        | Vedi tabella sotto in base al profilo del negozio       |
| 5    | Prodotti                 | Verifica e completa il catalogo                         |
| 6    | Magazzino → Giacenze     | Controlla stock e registra rettifiche iniziali se serve |

### Step 4 — in base al profilo canale

**Profilo Shopify:**

| Step | Dove         | Cosa fare                                                    |
| ---- | ------------ | ------------------------------------------------------------ |
| 4a   | Impostazioni | Collega il negozio Shopify                                   |
| 4b   | Impostazioni | **Sincronizza location** (sedi)                              |
| 4c   | Impostazioni | **Attiva aggiornamenti automatici**                          |
| 4d   | Impostazioni | **Importa catalogo da Shopify** (se hai già prodotti online) |

**Profilo TikTok Shop:**

| Step | Dove         | Cosa fare                        |
| ---- | ------------ | -------------------------------- |
| 4a   | Impostazioni | **Connetti TikTok Shop** (OAuth) |
| 4b   | Impostazioni | Verifica sedi in **Location**    |

**Profilo Solo gestionale:** salta il collegamento e-commerce; usa catalogo e magazzino solo in VestiFlow.

### Sedi (location)

Una **sede** è un luogo dove conti le giacenze (negozio, magazzino, secondo punto vendita). Dopo **Sincronizza location** in Impostazioni, le sedi Shopify compaiono in **Impostazioni → Location** e nel **selettore sede** in alto.

**Più sedi nello stesso shop Shopify** (es. Napoli + magazzino): supportato. **Due shop Shopify distinti** (due domini): servono **due account VestiFlow** separati — contatta il referente.

---

## 6. Collegare Shopify

### Prerequisiti

- Negozio Shopify attivo (`nome-negozio.myshopify.com`)
- Ruolo **Titolare** o **Amministratore** in VestiFlow

### Procedura

1. Vai in **Impostazioni → Integrazione Shopify**.
2. Inserisci il dominio del negozio (es. `mio-negozio.myshopify.com`).
3. Clicca **Connetti Shopify** e accetta i permessi sulla pagina Shopify.
4. Al ritorno lo stato deve essere **Connesso**.

### Dopo la connessione — tre passi importanti

| Azione                              | Dove         | Perché                                                     |
| ----------------------------------- | ------------ | ---------------------------------------------------------- |
| **Sincronizza location**            | Impostazioni | Importa e collega le sedi Shopify                          |
| **Attiva aggiornamenti automatici** | Impostazioni | Riceve prodotti, giacenze, ordini e clienti in tempo reale |
| **Importa catalogo da Shopify**     | Impostazioni | Scarica i prodotti già presenti online                     |

> Con cataloghi grandi l'import può richiedere **diversi minuti**. Resta sulla pagina finché compare il messaggio di esito. **Non premere più volte** lo stesso pulsante.

### Pulsanti utili in Impostazioni

| Pulsante                               | Quando usarlo                                |
| -------------------------------------- | -------------------------------------------- |
| **Sincronizza location**               | Primo setup o nuova sede su Shopify Admin    |
| **Attiva aggiornamenti automatici**    | Dopo connessione o cambio permessi app       |
| **Disattiva aggiornamenti automatici** | Pausa sync temporanea                        |
| **Importa catalogo da Shopify**        | Allineamento completo del catalogo           |
| **Ripristina connessione**             | Errore stale ma negozio ancora raggiungibile |
| **Disconnetti Shopify**                | Cambio shop o reset collegamento             |

Solo **Titolare** e **Amministratore** vedono questi pulsanti.

### Durante un'operazione di sync

1. Il pulsante mostra uno **spinner** e si disabilita.
2. Compare un **messaggio di avanzamento** sopra i pulsanti.
3. Al termine: messaggio verde (ok) o giallo (attenzione).

> **Nota:** il pannello **Integrazione Shopify** compare solo se il tuo negozio ha profilo canale **Shopify**.

---

## 7. Collegare TikTok Shop

> **Integrazione in fase iniziale.** Oggi sono previsti collegamento OAuth, invio prodotti e aggiornamento giacenze dopo movimenti di carico/scarico. Mancano ancora import da TikTok, webhook, vendite/clienti e parità con Shopify. Usa TikTok Shop solo se concordato con il referente VestiFlow.

Disponibile solo con profilo canale **TikTok Shop** (scelto in fase di attivazione).

### Prerequisiti

- Negozio attivo su **TikTok Shop Partner Center**
- Ruolo **Titolare** o **Amministratore** in VestiFlow

### Procedura

1. Vai in **Impostazioni → Integrazione TikTok Shop**.
2. Clicca **Connetti TikTok Shop** e completa l'autorizzazione OAuth su TikTok.
3. Al ritorno lo stato deve essere **Connesso**.

### Cosa sincronizza TikTok Shop (oggi)

| Dato                    | Comportamento                                        |
| ----------------------- | ---------------------------------------------------- |
| **Prodotti / varianti** | Create e update verso TikTok al salvataggio in VF    |
| **Giacenze**            | Aggiornamento dopo **carico** e **scarico** in VF    |
| **Vendite / clienti**   | **Non** gestiti in questa fase (solo catalogo/stock) |

### Pulsanti utili

| Pulsante                   | Quando usarlo                       |
| -------------------------- | ----------------------------------- |
| **Connetti TikTok Shop**   | Primo collegamento                  |
| **Ripristina connessione** | Errore OAuth o token scaduto        |
| **Disconnetti**            | Cambio negozio o reset collegamento |

Solo **Titolare** e **Amministratore** possono collegare o scollegare TikTok Shop.

---

## 8. Cosa si sincronizza e dove

| Dato                         | Dove si modifica in VestiFlow | Note                                                  |
| ---------------------------- | ----------------------------- | ----------------------------------------------------- |
| **Prodotti / varianti**      | Sì (push verso canale)        | Shopify o TikTok se connessi                          |
| **Prodotti nati su Shopify** | Solo lettura + import         | Import catalogo o webhook (profilo Shopify)           |
| **Giacenze**                 | Sì (carichi, rettifiche…)     | Vendite Shopify via webhook; TikTok dopo movimenti VF |
| **Ordini fornitori**         | Sì, solo in VestiFlow         | Non passano da Shopify/TikTok                         |
| **Vendite**                  | Sola lettura                  | Da Shopify Online e POS (profilo Shopify)             |
| **Clienti**                  | Sola lettura                  | Da Shopify (profilo Shopify)                          |
| **Sedi (location)**          | Import / gestione             | Sync location Shopify se applicabile                  |

### Badge sync sul prodotto

Nel dettaglio prodotto:

| Badge                | Significato                              |
| -------------------- | ---------------------------------------- |
| **Sincronizzato**    | Collegato e ultimo invio riuscito        |
| **Da sincronizzare** | Modifiche locali non ancora inviate      |
| **Errore sync**      | Ultimo invio fallito — usa sync manuale  |
| **Non collegato**    | Shopify non connesso o prodotto mai sync |

---

## 9. Prodotti e catalogo

### Concetti base

- **Prodotto** = scheda (nome, brand, categoria, stagione, descrizione, immagini).
- **Variante** = unità vendibile e di magazzino (es. Taglia M + Colore Rosso).
- Ogni variante ha **SKU univoco** (obbligatorio) e **barcode** opzionale.
- Lo **stock** non è sul prodotto: è per **variante × sede** (vedi Magazzino).

### Creare un prodotto

1. **Prodotti → Aggiungi prodotto**
2. **Dati generali** — nome, brand, categoria, immagini…
3. **Opzioni** — es. Taglia e Colore; VestiFlow genera le combinazioni
4. **Varianti** — SKU, prezzi, barcode per ogni combinazione
5. **Riepilogo** → **Crea prodotto**

### Modificare o eliminare

- **Modifica** dalla lista o dal dettaglio. Con Shopify connesso, al salvataggio i dati vengono inviati a Shopify.
- **Elimina** solo Titolare/Admin, con conferma.

### Import ed export CSV (catalogo)

| Azione                 | Dove                    | Cosa fa                                            |
| ---------------------- | ----------------------- | -------------------------------------------------- |
| **Esporta CSV**        | Prodotti (lista)        | Scarica catalogo (SKU, varianti, prezzi, metadati) |
| **Importa CSV**        | Prodotti → Importa CSV  | Carica prodotti da foglio formato Shopify          |
| **Importa da Shopify** | Prodotti o Impostazioni | Sync massiva dal negozio online (non è un CSV)     |

L'export serve per backup o lavorare in Excel. L'import CSV **non** sostituisce il sync Shopify: usa il percorso adatto al tuo caso.

### Cercare un prodotto con il barcode

In **Prodotti**, sopra i filtri, usa **Scansiona barcode** (su smartphone con Chrome/Android) oppure cerca per nome, brand o SKU. La scansione apre direttamente il **dettaglio prodotto** se il codice è riconosciuto.

---

## 10. Magazzino e giacenze

### Tab del magazzino

| Tab                   | Funzione                                             |
| --------------------- | ---------------------------------------------------- |
| **Giacenze**          | Tabella stock per sede, filtri, export/import CSV    |
| **Cerca**             | Ricerca rapida SKU/barcode — ottimizzata per mobile  |
| **Movimenti**         | Storico carichi, scarichi, trasferimenti, rettifiche |
| **Inventario fisico** | Conteggio periodico con chiusura e rettifiche        |

### Azioni principali (Giacenze)

| Pulsante                            | Funzione                                     |
| ----------------------------------- | -------------------------------------------- |
| **Sincronizza giacenze da Shopify** | Allinea quantità da Shopify (Titolare/Admin) |
| **Esporta CSV**                     | Scarica giacenze (SKU, sede, quantità)       |
| **Importa CSV**                     | Carica rettifiche da file                    |
| **Registra movimento**              | Carico, scarico, trasferimento o rettifica   |

### Registrare un movimento

1. **Magazzino → Registra movimento** (da Giacenze o Movimenti).
2. Scegli **tipo**, **variante**, **sede** e **quantità**.
3. Per le **rettifiche** il **motivo è obbligatorio**.
4. Controlla il **riepilogo** con l'impatto atteso e conferma.

Puoi **scansionare il barcode** sotto il campo Variante per selezionare automaticamente l'articolo.

### Tipi di movimento

| Tipo              | Quando usarlo                             |
| ----------------- | ----------------------------------------- |
| **Carico**        | Merce arrivata                            |
| **Scarico**       | Uscita merce (danneggiata, campionario…)  |
| **Trasferimento** | Spostamento tra due sedi                  |
| **Rettifica**     | Correzione quantità (motivo obbligatorio) |

Ogni movimento resta nello **storico** con data, operatore e origine (gestionale o Shopify).

### Cercare giacenze (SKU o barcode)

1. **Magazzino → Cerca** (o menu laterale **Magazzino**).
2. Digita SKU/barcode oppure **Scansiona barcode**.
3. Vedi giacenze per sede e link per **registrare movimento** o aprire il prodotto.

Lo scanner è disponibile anche in:

- **Giacenze** — filtra la tabella dopo la scansione
- **Registra movimento** — seleziona la variante
- **Inventario fisico** — durante il conteggio

Su **iPhone** la fotocamera può non essere disponibile: usa sempre l'inserimento manuale del codice.

### Import ed export CSV giacenze

**Export:** **Magazzino → Giacenze → Esporta CSV** (rispetta i filtri attivi).

**Import:**

1. **Magazzino → Giacenze → Importa CSV**
2. File con colonne **SKU**, **Location** (nome esatto come in Impostazioni), **Disponibile**
3. Controlla l'anteprima errori e conferma

Ogni riga valida genera una **rettifica tracciata** nello storico movimenti.

### Inventario fisico (conteggio)

1. **Magazzino → Inventario fisico → Nuova sessione** — scegli sede.
2. Inserisci quantità contate per variante (anche con **scanner barcode**).
3. In **revisione** controlli le differenze.
4. Alla **chiusura** VestiFlow applica le rettifiche e aggiorna le giacenze (e Shopify se collegato).

---

## 11. Ordini fornitori

Gestiti **solo in VestiFlow** (non su Shopify).

### Flusso tipico

1. **Ordini Fornitori → Nuovo ordine** — fornitore, righe (variante, quantità, prezzo acquisto)
2. **Invia ordine** — tracciamento interno
3. All'arrivo merce: **Ricevi ordine** — incrementa giacenze e crea movimenti di carico

- Creazione e modifica: **Manager** e superiori
- Ricezione merce: tutti i ruoli operativi (verifica con il titolare le regole interne)

---

## 12. Vendite e clienti

### Vendite

- Provengono da **Shopify Online** o **Shopify POS**.
- In VestiFlow sono **sola lettura**.
- Filtri: stato pagamento, canale (online / negozio), ricerca ordine o cliente.

| Azione                             | Dove            | Chi                      |
| ---------------------------------- | --------------- | ------------------------ |
| **Sincronizza vendite da Shopify** | Vendite (lista) | Titolare / Admin         |
| **Esporta CSV**                    | Vendite (lista) | Titolare, Admin, Manager |

### Clienti

- Anagrafica da Shopify, **sola lettura** in VestiFlow.
- Per modifiche usa **Shopify Admin**.

| Azione                             | Dove            | Chi                      |
| ---------------------------------- | --------------- | ------------------------ |
| **Sincronizza clienti da Shopify** | Clienti (lista) | Titolare / Admin         |
| **Esporta CSV**                    | Clienti (lista) | Titolare, Admin, Manager |

---

## 13. Report e dashboard

### Dashboard

Pagina iniziale dopo il login: vendite recenti e indicatori sintetici del negozio.

### Report

Tabelle e KPI su prodotti, giacenze e ordini. Usa i filtri disponibili per restringere periodo e dati.

---

## 14. Usare VestiFlow da smartphone

VestiFlow è una **app web installabile (PWA)**:

- icona sulla home del telefono;
- apertura a schermo intero;
- ideale per **Cerca giacenza** e **scanner barcode** in magazzino.

### Installazione

**Android (Chrome):** menu → **Aggiungi a schermata Home** / **Installa app**. Su **Magazzino → Cerca** può comparire un banner di installazione.

**iPhone (Safari):** **Condividi** → **Aggiungi a Home**.

### Limitazioni

- Serve connessione internet per i dati aggiornati.
- Scanner barcode: meglio su **Chrome/Android**; su iOS usa l'inserimento manuale del codice.

---

## 15. Negozio fisico e Shopify POS

VestiFlow **non è una cassa**. Le vendite in negozio passano da **Shopify POS**:

| Strumento       | Ruolo                                             |
| --------------- | ------------------------------------------------- |
| **Shopify POS** | Cassa su tablet/iPhone in negozio                 |
| **VestiFlow**   | Riceve vendite POS in **Vendite**, aggiorna stock |

Flusso: vendita POS → Shopify scala giacenza → webhook → VestiFlow (movimento + ordine consultabile).

VestiFlow **non** emette scontrini fiscali: usa il sistema collegato a Shopify o il tuo software fiscale.

---

## 16. Profilo, foto e sicurezza account

### Foto profilo

In **Impostazioni → Profilo** (o cliccando l'**avatar in alto**):

1. **Carica foto** — JPEG, PNG o WebP, max **2 MB**
2. Regola **inquadratura e zoom** nel dialog circolare, poi **Usa foto**
3. Con foto presente: **Cambia foto**, **Rimuovi**, oppure **clic sull'avatar** per vederla ingrandita

Senza foto compare un cerchio con le **iniziali** del tuo nome.

### Verifica in due passaggi (MFA)

La **verifica in due passaggi** protegge l'account anche se la password viene compromessa.

1. **Impostazioni → Sicurezza account**
2. Segui la procedura con app authenticator (Google Authenticator, Authy…)
3. Al login successivo: password + codice a 6 cifre

Consigliato per **titolari e amministratori**.

### Tema dell'interfaccia

In **Impostazioni → Aspetto** (o dalla **topbar**) scegli **Chiaro**, **Scuro** o **Sistema**.

---

## 17. Domande frequenti

### Il prodotto creato in VestiFlow non compare su Shopify

1. Impostazioni → Shopify è **Connesso**?
2. Dettaglio prodotto: badge **Errore sync**?
3. Prova **Sincronizza con Shopify** nel dettaglio prodotto
4. Se persiste: **Disconnetti** e **riconnetti** Shopify da Impostazioni

### Il prodotto su Shopify non compare in VestiFlow

1. **Importa catalogo da Shopify** in Impostazioni (attendi fine operazione)
2. Verifica che **Aggiornamenti automatici** sia attivo

### L'import catalogo è lento

Con molti prodotti è **normale**. Attendi il messaggio di esito senza ripremere il pulsante. Se compare un avviso su limiti Shopify, attendi 1–2 minuti e riprova **una volta**.

### Le giacenze non coincidono

1. Hai fatto **Sincronizza location**?
2. In **Impostazioni → Location** ogni sede usata è **Sincronizzata**?
3. Controlla lo **storico movimenti** (origine gestionale vs Shopify)
4. Verifica la **sede selezionata** in alto

### Vendite o clienti mancanti

Spesso serve l'approvazione dati clienti protetti su Shopify Partners. Catalogo e giacenze funzionano comunque. Chiedi al referente VestiFlow se la sync ordini/clienti è abilitata per il tuo negozio.

### Non trovo un articolo scansionando il barcode

- Verifica che la variante abbia **barcode** compilato in VestiFlow (o SKU uguale al codice letto).
- Prova a cercare manualmente lo **SKU** in **Cerca giacenza**.

### Upload immagine prodotto fallito

Usa JPEG, PNG o WebP, max 5 MB. Riprova dopo qualche minuto se il servizio era in manutenzione.

### Ho più sedi: le vedo tutte?

Sì, se sono **location nello stesso shop Shopify**: configura le sedi in Shopify Admin, poi **Sincronizza location** in VestiFlow. Controlla il selettore sede in alto.

### Non vedo Integrazione Shopify (o TikTok) in Impostazioni

Il **profilo canale** del tuo negozio potrebbe essere **Solo gestionale** o un altro canale. Contatta il referente VestiFlow se serve cambiare profilo.

### Il prodotto non compare su TikTok Shop

1. Impostazioni → TikTok Shop è **Connesso**?
2. Hai salvato il prodotto dopo la connessione?
3. Per le giacenze: registrato un **carico** o **scarico** dopo il collegamento?

### Upload foto profilo fallito

Usa JPEG, PNG o WebP, max 2 MB. Se l'errore persiste, riprova tra qualche minuto.

---

## 18. Guida nel menu

La voce **Guida** in fondo al menu laterale apre questo manuale dentro l'app (`/app/guide`).

- Usa l'**Indice** per saltare alle sezioni.
- In alto puoi **scaricare il PDF** per consultarlo offline o stamparlo.

La versione in-app è pensata per chi lavora nel negozio: passi operativi, dove cliccare e cosa aspettarsi. Per assistenza su configurazione o problemi di sync, contatta il tuo **referente VestiFlow**.

---
