# VestiFlow — Guida per l'utente

**Versione documento:** 2.4 — Giugno 2026

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
| **Guida**            | Manuale utente integrato nell'app                                                        |

Su mobile, **Esci** è in fondo al menu ☰ (sotto tutte le voci); su desktop resta anche in topbar.

Dal menu **Magazzino** accedi subito alla ricerca; le altre sezioni magazzino (**Giacenze**, **Movimenti**, **Inventario fisico**) si aprono dai **tab** in alto nelle pagine del magazzino.

### Barra in alto (topbar)

Ordine da sinistra a destra (desktop):

- **VestiFlow** — nome del gestionale
- **Tema** — chiaro / scuro / sistema (icona sole, luna, monitor)
- **Selettore location** — filtra le operazioni per la sede attiva (negozio, magazzino, ecc.)
- **Sync Shopify** — chip con icona e **data/ora ultimo sync**; il punto colorato indica lo stato (verde = ok). Clic → Impostazioni
- **Avatar profilo** — foto o iniziali; **clic → Impostazioni**
- **Esci** — logout con conferma (desktop in topbar; su smartphone in fondo al menu ☰)

Su smartphone il menu hamburger apre la sidebar; tema, location e sync restano in topbar quando lo spazio lo consente.

### Impostazioni: cosa compare

Il contenuto di **Impostazioni** dipende dal **profilo canale** del tuo negozio (scelto in fase di attivazione). L’ordine dei pannelli è sempre: **Profilo** → **Sede fisica** (se presente) → integrazione canale → **Sicurezza account** → **Aspetto**.

| Profilo canale      | Pannelli visibili in Impostazioni                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| **Solo gestionale** | Profilo, **Sede fisica**, Sicurezza, Aspetto — nessuna integrazione e-commerce                        |
| **Shopify**         | Profilo, **Sede fisica**, **Integrazione Shopify** (inclusa tabella **Location**), Sicurezza, Aspetto |
| **TikTok Shop**     | Profilo, **Sede fisica**, Integrazione TikTok Shop, Sicurezza, Aspetto                                |

#### Sede fisica (anagrafica cliente)

Pannello **Sede fisica** in Impostazioni: mostra i dati commerciali registrati da VestiFlow all’attivazione (ragione sociale, negozio, P.IVA, indirizzo, contatti). È **indipendente** dalle sedi operative Shopify elencate sotto **Integrazione Shopify → Location**. I dettagli fiscali e di contatto opzionali sono in un riquadro espandibile **Dati fiscali e contatti**.

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

Una **sede** è un luogo dove conti le giacenze (negozio, magazzino, secondo punto vendita). Con profilo **Shopify**, le sedi operative si gestiscono in **Impostazioni → Integrazione Shopify → Location** e nel **selettore location** in alto.

Dopo **Sincronizza location**, compaiono le **Sedi Shopify** (importate dal negozio online) separate dalle eventuali **Sedi locali**. All’attivazione può esistere una sede temporanea di onboarding: viene rimossa automaticamente al primo sync se non ha giacenze.

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

| Pulsante                               | Quando usarlo                                       |
| -------------------------------------- | --------------------------------------------------- |
| **Sincronizza location**               | Primo setup o nuova sede su Shopify Admin           |
| **Attiva aggiornamenti automatici**    | Dopo connessione o cambio permessi app              |
| **Disattiva aggiornamenti automatici** | Pausa sync temporanea                               |
| **Importa catalogo da Shopify**        | Allineamento completo del catalogo                  |
| **Ripristina connessione**             | Errore stale ma negozio ancora raggiungibile        |
| **Cambia negozio**                     | Passare a un **altro dominio** Shopify              |
| **Disconnetti Shopify**                | Scollegamento senza cancellare i dati locali        |
| **Disconnetti e rimuovi dati**         | Scollegamento + rimozione dati importati da Shopify |

Solo **Titolare** e **Amministratore** vedono questi pulsanti.

### Cambiare negozio Shopify o rimuovere i dati importati

Per collegare un **dominio Shopify diverso** (es. da `negozio-a.myshopify.com` a `negozio-b.myshopify.com`) non basta disconnettere: serve la procedura guidata.

**Cambia negozio** (shop già connesso):

1. **Impostazioni → Integrazione Shopify → Cambia negozio**
2. Leggi l’**anteprima** (conteggio prodotti, clienti, ordini, location collegati a Shopify)
3. Scegli se **rimuovere i dati importati da Shopify** prima del cambio (consigliato per evitare mix tra due negozi)
4. Conferma digitando il **dominio attuale** del negozio
5. Al termine: riconnetti il **nuovo** negozio con **Connetti Shopify**

**Disconnetti e rimuovi dati** (senza cambiare subito negozio):

1. Stessa procedura guidata con anteprima
2. Rimuove catalogo, clienti, ordini vendita e location **collegati a Shopify** in VestiFlow
3. **Non** elimina ordini fornitori, movimenti di magazzino locali né l’anagrafica in **Sede fisica**
4. Se hai **ordini fornitori aperti** collegati a location Shopify, la rimozione può essere **bloccata** finché non li chiudi o annulli

> **Attenzione:** la rimozione dati è **irreversibile** in VestiFlow. I prodotti su Shopify Admin **non** vengono cancellati automaticamente; VestiFlow elimina solo la copia locale e i collegamenti sync.

**Disconnetti Shopify** (semplice): scollega l’app e mantiene prodotti, clienti e ordini già importati in sola lettura locale. Utile per una pausa temporanea, non per cambiare negozio.

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

| Dato                                                  | Dove si modifica in VestiFlow | Note                                                                                                                  |
| ----------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Prodotti creati in VestiFlow** (`Fonte: VestiFlow`) | Sì — catalogo completo        | Push al salvataggio verso Shopify/TikTok se connessi                                                                  |
| **Prodotti importati da Shopify** (`Fonte: Shopify`)  | Solo dati operativi           | Titolo, prezzi vendita, varianti e immagini in **Shopify Admin**; in VestiFlow: **stagione** e **prezzo di acquisto** |
| **Giacenze**                                          | Sì (carichi, rettifiche…)     | Vendite Shopify via webhook; TikTok dopo movimenti VF                                                                 |
| **Ordini fornitori**                                  | Sì, solo in VestiFlow         | Non passano da Shopify/TikTok                                                                                         |
| **Vendite**                                           | Sola lettura                  | Da Shopify Online e POS (profilo Shopify)                                                                             |
| **Clienti**                                           | Sola lettura                  | Da Shopify (profilo Shopify)                                                                                          |
| **Sedi (location)**                                   | Import / gestione             | Sync location Shopify se applicabile                                                                                  |

### Etichetta «Fonte» (catalogo)

Nella **lista prodotti** (colonna **Fonte**) e nel **dettaglio prodotto** compare un’etichetta che indica **chi gestisce il catalogo ecommerce**:

| Etichetta     | Significato                                                                                | Cosa puoi fare in VestiFlow                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **VestiFlow** | Prodotto nato nel gestionale (creato o importato CSV, poi eventualmente inviato al canale) | Modifica completa; eliminazione (se consentita) anche su Shopify se collegato                               |
| **Shopify**   | Prodotto importato dal negozio online                                                      | Catalogo in sola lettura; modifica solo **stagione** e **prezzo di acquisto**; elimina da **Shopify Admin** |

L’etichetta **Fonte** è distinta dallo **stato sync Shopify** (colonna **Shopify** in lista, se visibile): la Fonte dice _chi possiede il catalogo_; lo stato sync dice se l’ultimo invio verso Shopify è riuscito (solo per prodotti **Fonte: VestiFlow** collegati).

### Badge sync sul prodotto

Nel dettaglio prodotto (solo prodotti **Fonte: VestiFlow** collegati a Shopify):

| Badge                | Significato                                             |
| -------------------- | ------------------------------------------------------- |
| **Sincronizzato**    | Collegato e ultimo invio riuscito                       |
| **Sync in corso**    | Invio verso Shopify in corso (colonna Shopify in lista) |
| **Da sincronizzare** | Modifiche locali non ancora inviate                     |
| **Errore sync**      | Ultimo invio fallito — usa sync manuale                 |
| **Non collegato**    | Shopify non connesso o prodotto mai sync                |

I prodotti **Fonte: Shopify** si allineano automaticamente da Shopify Admin: non compare il pulsante **Sincronizza con Shopify**.

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

#### Categoria Shopify e attributi categoria (profilo Shopify)

Se il negozio ha **Shopify connesso**, nello step **Dati generali** compare il picker **Categoria prodotto Shopify** (tassonomia ufficiale Shopify, come in Shopify Admin).

Dopo aver scelto la categoria, compare la sezione **Attributi categoria**: metafield collegati a quella categoria (es. tessuto, fascia d'età, target gender). Servono per Shopify e Google; **non** creano varianti SKU — taglia/colore e combinazioni restano nello step **Opzioni**.

| Comportamento               | Cosa significa                                                                |
| --------------------------- | ----------------------------------------------------------------------------- |
| Select con **(più valori)** | Puoi scegliere **più opzioni** nello stesso attributo (come in Shopify Admin) |
| Select senza indicazione    | Un solo valore per attributo                                                  |
| **Seleziona…** (voce vuota) | Rimuove tutte le scelte per quell'attributo                                   |

Per chiudere un menu a più valori, clicca fuori dal pannello. I valori scelti compaiono nel trigger (nomi o «N selezionati») e nel **Riepilogo** prima del salvataggio.

Al **salvataggio**, VestiFlow invia categoria e attributi a Shopify insieme al resto del catalogo (prodotti **Fonte: VestiFlow**). In **dettaglio prodotto** e nel riepilogo del form gli attributi sono elencati per nome con i valori separati da virgola.

**Nota:** **Tipo prodotto** (campo testuale locale) e **Categoria Shopify** sono distinti: la categoria taxonomy è quella usata per sync e metafield di categoria.

### Modificare o eliminare

- **Fonte: VestiFlow** — modifica completa dalla lista o dal dettaglio. Con Shopify connesso, al salvataggio i dati catalogo vengono inviati a Shopify.
- **Fonte: Shopify** — il pulsante diventa **Modifica dati operativi**: puoi aggiornare solo **stagione** e **prezzo di acquisto** delle varianti. Nome, descrizione, prezzi di vendita, opzioni, SKU, barcode e immagini vanno modificati in **Shopify Admin**; VestiFlow si allinea con import catalogo o aggiornamenti automatici.

#### Eliminazione prodotto

| Fonte / condizione                                           | Comportamento                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Fonte: Shopify**                                           | **Non eliminabile** da VestiFlow — usa **Shopify Admin**                                    |
| **Fonte: VestiFlow**, senza movimenti di magazzino           | Eliminazione consentita; se collegato a Shopify, VestiFlow tenta di rimuoverlo anche online |
| **Fonte: VestiFlow**, con movimenti storici                  | **Bloccato** — archivia o lascia in catalogo                                                |
| Shopify **disconnesso** ma prodotto sincronizzato in passato | **Bloccato** — riconnetti Shopify e riprova                                                 |
| Errore API Shopify (permessi, rete)                          | Prodotto **non** rimosso da VestiFlow; messaggio di errore                                  |

Dopo l’eliminazione riuscita di un prodotto **Fonte: VestiFlow**, la scheda scompare da **Prodotti** e non è più presente su Shopify Admin (se era collegato).

### Import ed export CSV (catalogo)

| Azione                 | Dove                    | Cosa fa                                            |
| ---------------------- | ----------------------- | -------------------------------------------------- |
| **Esporta CSV**        | Prodotti (lista)        | Scarica catalogo (SKU, varianti, prezzi, metadati) |
| **Importa CSV**        | Prodotti → Importa CSV  | Carica prodotti da foglio formato Shopify          |
| **Importa da Shopify** | Prodotti o Impostazioni | Sync massiva dal negozio online (non è un CSV)     |

L'export serve per backup o lavorare in Excel. L'import CSV **non** sostituisce il sync Shopify: usa il percorso adatto al tuo caso.

### Stampare etichette dalla lista

1. In **Prodotti**, seleziona uno o più articoli con le **caselle** a sinistra (oppure **Seleziona tutti** in pagina).
2. Nella barra azioni compare **Stampa etichette selezionate** — apre la stampa per tutti i prodotti scelti.
3. L'icona **stampa** su ogni riga stampa le etichette di **un solo** prodotto (come dal dettaglio).

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

1. **Ordini Fornitori → Nuovo ordine** — fornitore, destinazione merce, righe (variante, quantità, costo unitario)
2. **Invia ordine** — tracciamento interno (salva bozza o invia subito)
3. All'arrivo merce: **Ricevi merce** — incrementa giacenze e crea movimenti di carico

### Compilare un ordine

- **Fornitore** e **Variante** (per ogni riga): nel menu a tendina usa la **ricerca** per filtrare per nome prodotto o SKU.
- **Quantità** e **Costo unitario**; il **Subtotale** riga si calcola automaticamente (campo in sola lettura).
- **Data attesa** (opzionale): selettore con **calendario** (stesso stile dei filtri data nei report).
- Puoi creare un **nuovo fornitore** inline dal form (**Nuovo fornitore**).

### Stati e azioni

| Stato ordine         | Cosa puoi fare (Manager e superiori, salvo dove indicato) |
| -------------------- | --------------------------------------------------------- |
| **Bozza**            | Modifica bozza, Invia ordine, Annulla ordine              |
| **Inviato**          | Annulla ordine, Ricevi merce (tutti i ruoli operativi)    |
| **Annullato**        | **Elimina ordine** — rimozione definitiva dall'elenco     |
| **Ricevuto** / parz. | Solo consultazione                                        |

L'**Annulla ordine** segna l'ordine come annullato ma lo lascia in lista. **Elimina ordine** (solo su ordini già annullati) lo rimuove in modo irreversibile.

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

Tabelle e KPI su prodotti, giacenze e ordini. I filtri **periodo** (da / a) usano un **selettore data con calendario**, coerente con la data attesa negli ordini fornitori.

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
2. Dettaglio prodotto: etichetta **Fonte: VestiFlow** (non Shopify)?
3. Badge sync **Errore sync** nella colonna Shopify o nel dettaglio?
4. Prova **Sincronizza con Shopify** nel dettaglio prodotto (solo **Fonte: VestiFlow**)
5. Se persiste: **Disconnetti** e **riconnetti** Shopify da Impostazioni

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

Sì, se sono **location nello stesso shop Shopify**: configura le sedi in Shopify Admin, poi **Sincronizza location** in Impostazioni (dentro **Integrazione Shopify**). Controlla il selettore location in alto. Le sedi Shopify sono elencate separatamente dalle sedi locali.

### Devo cambiare negozio Shopify (altro dominio)

Usa **Cambia negozio** in Impostazioni, non il semplice **Disconnetti Shopify**. Segui la procedura guidata e, se indicato, rimuovi i dati importati prima di collegare il nuovo shop.

### Ho eliminato un prodotto ma resta su Shopify (o viceversa)

- **Fonte: Shopify** — l’eliminazione va fatta in **Shopify Admin**, non in VestiFlow.
- **Fonte: VestiFlow**, Shopify **connesso** — l’eliminazione da VestiFlow dovrebbe rimuovere anche su Shopify. Se vedi un errore, controlla permessi app (`write_products`) e riprova.
- **Fonte: VestiFlow**, Shopify **disconnesso** — VestiFlow **non** elimina sul negozio online finché non riconnetti.

### Non riesco a modificare nome o prezzo di un prodotto

Controlla l’etichetta **Fonte** nel dettaglio. Se è **Shopify**, modifica titolo, varianti e prezzi di vendita in **Shopify Admin**; in VestiFlow restano editabili solo **stagione** e **prezzo di acquisto** (pulsante **Modifica dati operativi**).

### Non vedo gli attributi categoria nel form prodotto

Gli **Attributi categoria** compaiono solo dopo aver selezionato una **Categoria prodotto Shopify** nello step Dati generali. Verifica che Shopify sia **connesso** e che il profilo canale preveda l’integrazione. Se la categoria non ha metafield associati, la sezione può restare vuota («Nessun attributo per questa categoria»).

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

La voce **Guida** compare in sidebar subito sotto **Impostazioni** e apre questo manuale dentro l'app (`/app/guide`).

- Usa l'**Indice** per saltare alle sezioni.
- In alto puoi **scaricare il PDF** per consultarlo offline o stamparlo.

La versione in-app è pensata per chi lavora nel negozio: passi operativi, dove cliccare e cosa aspettarsi. Per assistenza su configurazione o problemi di sync, contatta il tuo **referente VestiFlow**.

---
