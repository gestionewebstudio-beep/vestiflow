# VestiFlow — Guida per l'utente

**Versione documento:** 3.4 — Luglio 2026

**Per chi è questa guida:** titolari, responsabili magazzino, commessi e amministratori del negozio che usano VestiFlow ogni giorno.

**Prodotto:** VestiFlow — gestionale web multi-sede per **retail e negozi con inventario fisico**, con integrazione opzionale a **Shopify** o **TikTok Shop** (in base al profilo scelto per il tuo negozio). Adatto ad abbigliamento, accessori, cosmetica, food con varianti, e-commerce Shopify e altri settori con SKU e magazzino. L'integrazione **TikTok Shop è ancora parziale** — vedi [§7](#7-collegare-tiktok-shop).

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
12. [Anagrafica fornitori](#12-anagrafica-fornitori)
13. [Documenti fiscali e operativi](#13-documenti-fiscali-e-operativi)
14. [Vendite e clienti](#14-vendite-e-clienti)
15. [Report, dashboard e corrispettivi](#15-report-dashboard-e-corrispettivi)
16. [Usare VestiFlow da smartphone](#16-usare-vestiflow-da-smartphone)
17. [Negozio fisico: vendite al banco](#17-negozio-fisico-vendite-al-banco)
18. [Profilo, foto e sicurezza account](#18-profilo-foto-e-sicurezza-account)
19. [Domande frequenti](#19-domande-frequenti)
20. [Guida nel menu](#20-guida-nel-menu)

---

## 1. Cos'è VestiFlow

VestiFlow è il **gestionale del tuo negozio**: catalogo, magazzino, ordini ai fornitori e — se previsto dal tuo profilo — allineamento con **Shopify** o **TikTok Shop**.

Con un account puoi:

- gestire **prodotti e varianti** (opzioni come taglia, colore, capacità, modello — SKU, barcode, prezzi);
- vedere e aggiornare **giacenze per sede** (negozio, magazzino, altri punti vendita);
- registrare **carichi, scarichi, trasferimenti e rettifiche** con storico;
- creare e ricevere **ordini fornitori**;
- gestire **documenti** (arrivi merce, DDT, trasferimenti, rettifiche, proforma e bozze fattura);
- consultare i **Corrispettivi**, e i **DDT da fatturare** dalla lista Documenti;
- **registrare vendite e resi al banco** con scansione barcode (profilo **Solo gestionale**);
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

| Voce                 | A cosa serve                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------ |
| **Dashboard**        | Riepilogo attività                                                                         |
| **Prodotti**         | Catalogo, creazione, modifica, import/export CSV                                           |
| **Magazzino**        | Apre **Cerca giacenza** (ricerca rapida, ideale su mobile)                                 |
| **Fornitori**        | Anagrafica fornitori (nome, contatti, P.IVA)                                               |
| **Ordini Fornitori** | Acquisti dai fornitori                                                                     |
| **Documenti**        | Registro documenti: arrivi merce, DDT, trasferimenti, rettifiche, impostazioni numerazione |
| **Registra vendita** | Vendite e storni al banco con barcode (tutti i profili canale)                             |
| **Vendite**          | Ordini da Shopify (sola lettura), export CSV (**solo profilo Shopify**)                    |
| **Clienti**          | Anagrafica da Shopify (sola lettura), export CSV (**solo profilo Shopify**)                |
| **Report**           | Indicatori e riepiloghi                                                                    |
| **Corrispettivi**    | Quadro economico di vendite e rettifiche per periodo, con filtri e stampa/export           |
| **Impostazioni**     | Profilo, foto, tema, sedi, integrazione canale (Shopify o TikTok se prevista), sicurezza   |
| **Guida**            | Manuale utente integrato nell'app                                                          |

Su mobile, **Esci** è in fondo al menu ☰ (sotto tutte le voci); su desktop resta anche in topbar.

Dal menu **Magazzino** accedi subito alla ricerca; le altre sezioni magazzino (**Giacenze**, **Movimenti**, **Inventario fisico**) si aprono dai **tab** in alto nelle pagine del magazzino. La voce **Magazzino** (e le altre sezioni) resta **evidenziata in sidebar** su qualsiasi tab o sotto-pagina della stessa area.

#### Voci menu per profilo canale

| Profilo             | Registra vendita | Vendite (lista ordini) | Clienti |
| ------------------- | ---------------- | ---------------------- | ------- |
| **Solo gestionale** | Sì               | No                     | No      |
| **Shopify**         | Sì               | Sì                     | Sì      |
| **TikTok Shop**     | Sì               | No                     | No      |

### Barra in alto (topbar)

Ordine da sinistra a destra (desktop):

- **VestiFlow** — nome del gestionale
- **Tema** — chiaro / scuro / sistema (icona sole, luna, monitor)
- **Selettore location** — indica la **sede operativa** per carichi, scarichi, trasferimenti e vendite al banco (solo sedi attive nel piano; vedi [§5 Sedi](#sedi-location)). Comportamento:
  - **Titolare** o **Amministratore** con più sedi: menu a tendina per cambiare sede attiva.
  - **Manager** o **Commesso** con **sede assegnata**: compare solo l’**etichetta** della sede (nessun cambio sede in topbar).
  - **Una sola sede** disponibile: etichetta fissa per tutti.
  - Nei **filtri** di Magazzino (es. Giacenze) puoi vedere altre sedi se hai il permesso «Vedere giacenze di tutte le sedi»; le **azioni** restano comunque sulla sede operativa in topbar.
- **Sync Shopify** — chip con icona e **data/ora ultimo sync**; il punto colorato indica lo stato (verde = ok). Clic → Impostazioni
- **Avatar profilo** — foto o iniziali; **clic → Impostazioni**
- **Esci** — logout con conferma (desktop in topbar; su smartphone in fondo al menu ☰)

Su smartphone il menu hamburger apre la sidebar; tema, location e sync restano in topbar quando lo spazio lo consente.

### Impostazioni: cosa compare

Il contenuto di **Impostazioni** dipende dal **profilo canale** del tuo negozio (scelto in fase di attivazione). L’ordine dei pannelli è sempre: **Profilo** → **Sede fisica** (se presente) → **Magazzino e documenti** (Titolare/Admin) → integrazione canale → **Sicurezza account** → **Aspetto**.

| Profilo canale      | Pannelli visibili in Impostazioni                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solo gestionale** | Profilo, **Sede fisica**, **Magazzino e documenti**, Sicurezza, Aspetto — nessuna integrazione e-commerce                                   |
| **Shopify**         | Profilo, **Sede fisica**, **Magazzino e documenti**, **Integrazione Shopify** (Location + **Sedi attive in VestiFlow**), Sicurezza, Aspetto |
| **TikTok Shop**     | Profilo, **Sede fisica**, **Magazzino e documenti**, Integrazione TikTok Shop, Sicurezza, Aspetto                                           |

#### Magazzino e documenti (impostazioni operative)

Pannello visibile a **Titolare** e **Amministratore** (accesso completo al tenant). Consente di attivare:

- **Prezzi di vendita: Netti o Ivati** — come la tua azienda ragiona sui prezzi (vedi sotto)
- **Gestione lotti e scadenze** — colonne lotto/scadenza in arrivo merce
- **Gestione numeri seriali** — colonna seriali in arrivo merce
- **Policy aggiornamento prezzo fornitore** in carico: sempre / chiedi conferma / mai
- **Unità di misura** e **IVA predefinita** per nuovi articoli
- Avvisi e blocco su **giacenze negative**

Le modifiche si applicano a tutti gli utenti del negozio.

##### Prezzi di vendita: Netti o Ivati _(dal 16 agosto 2026)_

Dice come la tua azienda **normalmente** esprime i prezzi di vendita. Non è una regola rigida:
è il punto di partenza.

| Se vendi…                          | Scegli                                    |
| ---------------------------------- | ----------------------------------------- |
| al **dettaglio**, al pubblico      | **Ivati** — il prezzo che il cliente paga |
| all'**ingrosso**, ad altre aziende | **Netti** — imponibile, l'IVA si aggiunge |

**Dove si vede:**

- ogni **documento di vendita nuovo** (preventivo, ordine cliente, DDT, fattura) parte da qui;
- l'**anagrafica articoli** mostra i prezzi di listino nello stesso modo.

**Cosa NON cambia:**

- i **documenti già salvati** restano come sono. Ognuno si ricorda la modalità con cui è stato
  compilato, e riaprendolo la ritrovi — anche se nel frattempo l'impostazione è cambiata, e
  anche se lo apre un tuo collega;
- il **valore** dei documenti non si tocca mai: cambia solo come il prezzo si scrive e si legge.

**Sul singolo documento puoi sempre cambiare modalità**, con il menu sull'intestazione della
colonna Prezzo. VestiFlow **si ricorda la tua ultima scelta per quel tipo di documento**: se fai
sempre le fatture in netto, le tue fatture nuove partiranno nette anche se l'azienda è impostata
su ivato.

⚠️ **Se cambi l'impostazione aziendale, quelle memorie si azzerano** e tutti ripartono dalla
scelta nuova. È voluto: altrimenti cambieresti l'impostazione e non succederebbe niente a chi ha
già lavorato.

**E i costi di acquisto?** Partono **sempre netti** — arrivo merce e ordine fornitore. Puoi
passare alla vista ivata sul singolo documento quando ti conviene (per esempio per confrontare
con la fattura del fornitore), e quel documento se la ricorda; ma il documento successivo
riparte netto. Non c'è un'impostazione aziendale per i costi, perché per un'azienda che detrae
l'IVA il costo **è** l'imponibile.

**La cassa (vendita al banco)** resta sempre ivata: al banco il prezzo esposto è quello che il
cliente paga.

#### Sede fisica (anagrafica cliente)

Pannello **Sede fisica** in Impostazioni: mostra i dati commerciali registrati da VestiFlow all’attivazione (ragione sociale, negozio, P.IVA, indirizzo, contatti). È **indipendente** dalle sedi operative Shopify elencate sotto **Integrazione Shopify → Location**. I dettagli fiscali e di contatti opzionali sono in un riquadro espandibile **Dati fiscali e contatti**. Il pannello è visibile se il tuo account ha il permesso **Impostazioni azienda** (tipico per Titolare e Amministratore).

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

Il **Titolare** ha sempre **accesso completo** (tutti i permessi), inclusa la **connessione OAuth** a Shopify e TikTok Shop.

Per **Amministratore**, **Manager** e **Commesso** il referente VestiFlow assegna un set di **permessi granulari** (checkbox al momento della creazione o modifica utente). Si parte da un **preset** legato al ruolo, personalizzabile utente per utente. Se un pulsante, una voce di menu o una pagina non compare, manca il permesso richiesto — non necessariamente «il ruolo intero».

**Dopo una modifica permessi** da parte del referente: **esci e rientra** oppure ricarica con **Ctrl+F5** (Mac: **Cmd+Shift+R**) così menu e pulsanti si allineano al profilo aggiornato.

### Permessi granulari (cosa controllano)

| Permesso                             | Cosa abilita                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Vedere giacenze di tutte le sedi** | Consulta stock e movimenti oltre la sede assegnata (le **azioni** restano sulla sede operativa in topbar). |
| **Gestire giacenze**                 | Carichi, scarichi, trasferimenti, rettifiche, inventario fisico, **Registra movimento**.                   |
| **Import/export e sync giacenze**    | Export/import CSV giacenze e pulsante **Riallinea le giacenze su Shopify**.                                |
| **Gestire catalogo**                 | Crea e modifica prodotti, varianti e prezzi.                                                               |
| **Import/export e sync prodotti**    | Export/import CSV catalogo, **Importa da Shopify** e **Sincronizza catalogo** dalla lista prodotti.        |
| **Eliminare prodotti**               | Rimozione prodotti dal catalogo (nei limiti previsti da Fonte/sync).                                       |
| **Gestire ordini fornitore**         | Crea, modifica, invia e annulla ordini fornitore.                                                          |
| **Ricevere ordini fornitore**        | Registra merce in arrivo da ordine fornitore (flusso rapido da **Ordini Fornitori**).                      |
| **Consultare documenti**             | Lista e dettaglio **Documenti**; filtro **DDT da fatturare**.                                              |
| **Gestire documenti**                | Crea e modifica documenti (arrivo merce, DDT, trasferimenti, rettifiche, impostazioni numerazione).        |
| **Registrare vendite al banco**      | Schermata **Registra vendita** (vendite e storni).                                                         |
| **Consultare report**                | Dashboard e sezione **Report**.                                                                            |
| **Esportare dati**                   | Export CSV vendite, clienti, giacenze, catalogo; sync manuale **vendite** e **clienti** da Shopify.        |
| **Impostazioni azienda**             | Pannello **Sede fisica** in Impostazioni.                                                                  |
| **Visualizzare clienti**             | Lista e dettaglio clienti (sola lettura, profilo Shopify).                                                 |
| **Gestire clienti**                  | Crea/modifica anagrafiche clienti (solo profili che lo prevedono).                                         |

**Nota:** consultare giacenze, movimenti e liste di base sulla **propria sede** è in generalità consentito agli utenti autenticati; le righe sopra governano le **azioni** e le aree sensibili.

### Operazioni riservate al Titolare

| Operazione                                                              | Chi                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| Collegare / disconnettere **Shopify** o **TikTok Shop** (OAuth)         | Solo **Titolare**                                |
| **Sincronizza location**, **Salva sedi attive**, cambio negozio Shopify | Solo **Titolare** (Amministratore **non** basta) |

L’**Amministratore** con preset completo ha tutti i permessi granulari tranne la connessione OAuth ai canali e-commerce.

### Preset tipici per ruolo (punto di partenza)

I valori sotto sono i default **prima** di eventuali personalizzazioni del referente VestiFlow.

| Operazione                                      | Titolare | Admin (preset) | Manager (preset) | Commesso (preset)         |
| ----------------------------------------------- | -------- | -------------- | ---------------- | ------------------------- |
| Connessione Shopify / TikTok                    | Sì       | No             | No               | No                        |
| Sync sedi / salva sedi attive                   | Sì       | No             | No               | No                        |
| Catalogo completo + import/export/sync prodotti | Sì       | Sì             | Sì               | No                        |
| Elimina prodotti                                | Sì       | Sì             | No               | No                        |
| Giacenze + import/export/sync giacenze          | Sì       | Sì             | Sì               | No                        |
| Movimenti / inventario fisico                   | Sì       | Sì             | Sì               | Sì                        |
| Vede tutte le sedi (filtri)                     | Sì       | Sì             | Sì               | No                        |
| Ordini fornitore (gestione)                     | Sì       | Sì             | Sì               | No                        |
| Ricezione merce                                 | Sì       | Sì             | Sì               | Sì                        |
| Documenti (consultazione / gestione)            | Sì       | Sì             | Sì               | Consultazione             |
| Corrispettivi                                   | Sì       | Sì             | Sì               | No                        |
| Registra vendita al banco                       | Sì       | Sì             | Sì               | Sì                        |
| Report + export CSV / sync vendite-clienti      | Sì       | Sì             | Sì               | Solo consultazione report |
| Sede fisica (anagrafica)                        | Sì       | Sì             | No               | No                        |

Per nuovi account, cambio permessi o sede assegnata contatta il **referente VestiFlow** che ha attivato il gestionale.

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

**Profilo Solo gestionale:**

| Step | Dove             | Cosa fare                                              |
| ---- | ---------------- | ------------------------------------------------------ |
| 4a   | Impostazioni     | Verifica **Sede fisica** e location operative          |
| 4b   | Prodotti         | Completa barcode/SKU sulle varianti vendute in negozio |
| 4c   | Registra vendita | Prova una scansione di test dopo il primo carico       |

**Profilo Shopify:**

| Step | Dove             | Cosa fare                                                                          |
| ---- | ---------------- | ---------------------------------------------------------------------------------- |
| 4a   | Impostazioni     | Collega il negozio Shopify                                                         |
| 4b   | Impostazioni     | **Sincronizza location** (importa le sedi da Shopify)                              |
| 4c   | Impostazioni     | **Sedi attive in VestiFlow** — seleziona le sedi del piano e **Salva sedi attive** |
| 4d   | Impostazioni     | **Attiva aggiornamenti automatici**                                                |
| 4e   | Impostazioni     | **Importa catalogo da Shopify** (se hai già prodotti online)                       |
| 4f   | Registra vendita | Prova scansione test se vendi in negozio con cassa esterna                         |

**Profilo TikTok Shop:**

| Step | Dove             | Cosa fare                                       |
| ---- | ---------------- | ----------------------------------------------- |
| 4a   | Impostazioni     | **Connetti TikTok Shop** (OAuth)                |
| 4b   | Impostazioni     | Verifica sedi in **Location**                   |
| 4c   | Registra vendita | Prova scansione test se vendi in negozio fisico |

**Profilo Solo gestionale:** salta il collegamento e-commerce; usa catalogo e magazzino solo in VestiFlow.

### Sedi (location)

Una **sede** è un luogo dove conti le giacenze (negozio, magazzino, secondo punto vendita). Con profilo **Shopify**, le location importate si vedono in **Impostazioni → Integrazione Shopify** (tabella **Location**); le sedi **operative** in VestiFlow si scelgono nel pannello **Sedi attive in VestiFlow** e nel **selettore location** in alto.

#### Piano sedi e selezione attiva

Il tuo contratto include un numero massimo di **sedi operative** in VestiFlow (es. 1, 3 o 10). Non tutte le location presenti su Shopify devono essere attive nel gestionale: ne selezioni fino al limite del piano.

| Fase                   | Cosa succede                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Dopo sync location** | Compaiono tutte le sedi Shopify importate; nel pannello **Sedi attive in VestiFlow** scegli quali attivare (entro il limite) |
| **Primo salvataggio**  | Clic **Salva sedi attive** — da quel momento la scelta è **bloccata**                                                        |
| **Dopo il blocco**     | Vedi solo le sedi attive; compare il messaggio _«Contatta l'assistenza per modificare le sedi attive»_                       |
| **Cambio sedi**        | Solo il **referente VestiFlow** può sbloccarti **una volta**; poi salvi di nuovo e la selezione si riblocca                  |

Solo il **Titolare** può salvare la selezione sedi (l’Amministratore non basta per questa operazione).

**Eccezione piano 1 sede:** se Shopify espone **una sola** location attiva, VestiFlow può pre-selezionarla al sync, ma il **blocco** scatta solo dopo il tuo **primo salvataggio** esplicito (se il piano prevede più sedi o devi confermare).

#### Sync e sedi locali

Dopo **Sincronizza location**, compaiono le **Sedi Shopify** (importate dal negozio online) separate dalle eventuali **Sedi locali**. All’attivazione può esistere una sede temporanea di onboarding: viene rimossa automaticamente al primo sync se non ha giacenze.

Magazzino, movimenti, giacenze e selettore in topbar mostrano **solo le sedi attive** nel piano — non tutte quelle presenti su Shopify.

**Più sedi nello stesso shop Shopify** (es. Napoli + magazzino): supportato entro il limite contrattuale. **Due shop Shopify distinti** (due domini): servono **due account VestiFlow** separati — contatta il referente.

---

## 6. Collegare Shopify

### Prerequisiti

- Negozio Shopify attivo (`nome-negozio.myshopify.com`)
- Ruolo **Titolare** in VestiFlow (solo il titolare avvia OAuth e sync sedi)

### Procedura

1. Vai in **Impostazioni → Integrazione Shopify**.
2. Inserisci il dominio del negozio (es. `mio-negozio.myshopify.com`).
3. Clicca **Connetti Shopify** e accetta i permessi sulla pagina Shopify.
4. Al ritorno lo stato deve essere **Connesso**.

### Dopo la connessione — tre passi importanti

| Azione                              | Dove         | Perché                                                     |
| ----------------------------------- | ------------ | ---------------------------------------------------------- |
| **Sincronizza location**            | Impostazioni | Importa le sedi da Shopify                                 |
| **Sedi attive in VestiFlow**        | Impostazioni | Scegli quali sedi usare nel gestionale (entro il piano)    |
| **Attiva aggiornamenti automatici** | Impostazioni | Riceve prodotti, giacenze, ordini e clienti in tempo reale |
| **Verifica ora**                    | Impostazioni | Chiede a Shopify quali notifiche sono davvero attive       |
| **Importa catalogo da Shopify**     | Impostazioni | Scarica i prodotti già presenti online                     |

> Con cataloghi grandi l'import può richiedere **diversi minuti**. Resta sulla pagina finché compare il messaggio di esito. **Non premere più volte** lo stesso pulsante.

### Pulsanti utili in Impostazioni

| Pulsante                               | Quando usarlo                                       |
| -------------------------------------- | --------------------------------------------------- |
| **Sincronizza location**               | Primo setup o nuova sede su Shopify Admin           |
| **Salva sedi attive**                  | Dopo sync: conferma quali sedi usare in VestiFlow   |
| **Attiva aggiornamenti automatici**    | Dopo connessione o cambio permessi app              |
| **Disattiva aggiornamenti automatici** | Pausa sync temporanea                               |
| **Verifica ora**                       | Per sapere cosa risulta davvero su Shopify adesso   |
| **Registra le notifiche mancanti**     | Dopo una verifica, se ne manca qualcuna             |
| **Importa catalogo da Shopify**        | Allineamento completo del catalogo                  |
| **Ripristina connessione**             | Errore stale ma negozio ancora raggiungibile        |
| **Cambia negozio**                     | Passare a un **altro dominio** Shopify              |
| **Disconnetti Shopify**                | Scollegamento senza cancellare i dati locali        |
| **Disconnetti e rimuovi dati**         | Scollegamento + rimozione dati importati da Shopify |

Solo il **Titolare** vede i pulsanti di connessione, sync sedi e gestione OAuth.

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
- Ruolo **Titolare** in VestiFlow

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

Solo il **Titolare** può collegare o scollegare TikTok Shop.

---

## 8. Cosa si sincronizza e dove

| Dato                                                  | Dove si modifica in VestiFlow             | Note                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Prodotti creati in VestiFlow** (`Fonte: VestiFlow`) | Sì — catalogo completo                    | Push al salvataggio verso Shopify/TikTok se connessi                                                                  |
| **Prodotti importati da Shopify** (`Fonte: Shopify`)  | Solo dati operativi                       | Titolo, prezzi vendita, varianti e immagini in **Shopify Admin**; in VestiFlow: **stagione** e **prezzo di acquisto** |
| **Giacenze**                                          | Sì (carichi, rettifiche…)                 | Vendite Shopify via webhook; vendite negozio via **Registra vendita** (tutti i profili); push canale dopo scansione   |
| **Ordini fornitori**                                  | Sì, solo in VestiFlow                     | Non passano da Shopify/TikTok                                                                                         |
| **Vendite al banco**                                  | Sì — **Registra vendita**                 | Tutti i profili; movimento magazzino (origine **Vendita al banco**), non ordine di vendita                            |
| **Vendite (lista ordini)**                            | Sola lettura                              | Da Shopify Online e POS (**solo profilo Shopify**)                                                                    |
| **Clienti**                                           | Sola lettura                              | Da Shopify (profilo Shopify)                                                                                          |
| **Sedi (location)**                                   | Sync + **selezione attiva** (entro piano) | Solo sedi attive in magazzino, movimenti e topbar; blocco dopo primo salvataggio                                      |

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
- **Variante** = unità vendibile e di magazzino (es. opzione «Taglia» M + «Colore» Rosso, oppure «Capacità» 500 ml + «Aroma» Vaniglia).
- Ogni variante ha **SKU univoco** (obbligatorio) e **barcode** opzionale.
- Lo **stock** non è sul prodotto: è per **variante × sede** (vedi Magazzino).

### Creare un prodotto

1. **Prodotti → Aggiungi prodotto**

All’apertura compare la modalità **Inserimento rapido** (consigliata per aggiungere velocemente un articolo). Puoi passare a **Con varianti** in qualsiasi momento, o tornare al rapido con il toggle in alto.

#### Inserimento rapido (predefinito)

Su **un’unica schermata** compili:

| Campo              | Obbligatorio | Note                                              |
| ------------------ | ------------ | ------------------------------------------------- |
| **Nome prodotto**  | Sì           |                                                   |
| **SKU**            | Sì           | Suggerito automaticamente dal nome (modificabile) |
| **EAN**            | No           | Opzionale; pulsante **Genera** per codice EAN-13  |
| **Prezzo vendita** | Sì           |                                                   |
| **Brand**          | No           |                                                   |
| **Categoria**      | No           | Completabile anche dopo                           |

- **Altri dati catalogo** (sezione espandibile): stagione, stato, IVA, unità di misura, tag, descrizione, immagini…
- Pulsante **Crea prodotto** in fondo — **non** serve completare brand, categoria o opzioni taglia/colore.

Per un prodotto con **taglia, colore o altre opzioni**, clic **Configura taglia/colore…** (o il toggle **Con varianti**).

#### Con varianti (wizard completo)

1. **Dati essenziali** — nome, brand e categoria (opzionali), immagini; sezione **Altri dati catalogo** per il resto
2. **Opzioni** — assi predefiniti «Taglia» e «Colore» più un terzo opzionale; i valori generano le combinazioni. Se il prodotto ha **un solo SKU**, puoi **saltare** questo passo e andare avanti
3. **Varianti** — SKU, prezzi, EAN/barcode per ogni combinazione (pulsante **Genera** sul barcode)
4. **Riepilogo** → **Crea prodotto**

**Modifica prodotto:** il wizard completo resta disponibile; i campi obbligatori restano essenziali (nome + dati varianti).

#### Categoria Shopify e attributi categoria (profilo Shopify)

Se il negozio ha **Shopify connesso**, compare il picker **Categoria prodotto Shopify** (tassonomia ufficiale Shopify, come in Shopify Admin). In **inserimento rapido** è **consigliata** per la sync ma **non obbligatoria** — puoi completarla anche dopo la creazione.

Dopo aver scelto la categoria, compare la sezione **Attributi categoria**: metafield collegati a quella categoria Shopify (es. materiale, fascia d'età, ingredienti — dipendono dalla categoria scelta). Servono per Shopify e Google; **non** creano varianti SKU — opzioni e combinazioni SKU restano nello step **Opzioni**.

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

| Azione                              | Dove                    | Cosa fa                                            | Permesso richiesto                |
| ----------------------------------- | ----------------------- | -------------------------------------------------- | --------------------------------- |
| **Esporta CSV**                     | Prodotti (lista)        | Scarica catalogo (SKU, varianti, prezzi, metadati) | **Esportare dati**                |
| **Importa CSV**                     | Prodotti → Importa CSV  | Carica prodotti da foglio formato Shopify          | Import/export e sync **prodotti** |
| **Sincronizza catalogo da Shopify** | Prodotti (lista)        | Allinea catalogo dal negozio online                | Import/export e sync **prodotti** |
| **Importa da Shopify**              | Prodotti o Impostazioni | Sync massiva catalogo                              | Import/export e sync **prodotti** |
| **Crea / modifica prodotto**        | Lista o dettaglio       | CRUD catalogo                                      | Gestire **catalogo**              |
| **Elimina prodotto**                | Dettaglio               | Rimozione (se consentita da Fonte)                 | **Eliminare prodotti**            |

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

### Elenco e ricerca in Giacenze

Senza testo nella **barra di ricerca**, la tab **Giacenze** elenca solo articoli **già tracciati** in magazzino (carichi, vendite, sync Shopify, rettifiche, inventario fisico, ecc.).

Per trovare un prodotto **mai movimentato** o con **giacenza zero** su una sede:

- digita **SKU**, **barcode** o **nome prodotto** nella ricerca della tab Giacenze, oppure
- usa la tab **Cerca** (ottimizzata per mobile).

In entrambi i casi vedi la variante con disponibile **0** e stato **Esaurito** se non c'è stock. Il primo **carico**, **rettifica**, **arrivo merce** (documento) o **import CSV** crea la riga inventario definitiva.

### Colonna «In arrivo»

Nella tabella **Giacenze** la colonna **In arrivo** mostra quantità **attese** da ordini fornitore già **inviati** ma non ancora ricevuti. Quando confermi un **Arrivo merce** (documento collegato all'ordine o creato da **Registra arrivo merce**), la quantità passa da _in arrivo_ a _disponibile_ sulla sede di destinazione.

### Azioni principali (Giacenze)

| Pulsante                             | Funzione                                         | Permesso richiesto                |
| ------------------------------------ | ------------------------------------------------ | --------------------------------- |
| **Riallinea le giacenze su Shopify** | Riporta il negozio online al valore di VestiFlow | Import/export e sync **giacenze** |
| **Esporta CSV**                      | Scarica giacenze (SKU, sede, quantità)           | **Esportare dati**                |
| **Importa CSV**                      | Carica rettifiche da file                        | Import/export e sync **giacenze** |
| **Registra movimento**               | Carico, scarico, trasferimento o rettifica       | Gestire **giacenze**              |

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

Le **vendite** e i **resi al banco** non si registrano nel form **Registra movimento**: usa **Registra vendita** in sidebar. Nello **storico movimenti** compaiono come tipo **Vendita** o **Reso** con origine **Vendita al banco**.

Ogni movimento resta nello **storico** con data, operatore e origine (gestionale, Shopify o vendita negozio).

### Cercare giacenze (SKU o barcode)

1. **Magazzino → Cerca** (o menu laterale **Magazzino**).
2. Digita SKU/barcode oppure **Scansiona barcode**.
3. Vedi giacenze per sede e link per **registrare movimento** o aprire il prodotto.

Lo scanner è disponibile anche in:

- **Giacenze** — filtra la tabella dopo la scansione (mostra anche articoli a zero se non ancora tracciati)
- **Registra movimento** — seleziona la variante
- **Registra vendita** — campo vendita e storno
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
2. **Invia ordine** — tracciamento interno; le quantità compaiono in **In arrivo** in Giacenze
3. All'arrivo merce: dal dettaglio ordine **Registra arrivo merce** (crea bozza in Documenti collegata all'ordine) **oppure** **Documenti → Arrivo merce** manuale — incrementa giacenze, azzera _in arrivo_ e crea movimenti di carico tracciati

Il pulsante **Registra arrivo merce** sull'ordine apre il form **Documenti → Arrivo merce** con righe e quantità residue già precompilate; non esiste più una ricezione «silenziosa» senza documento.

### Compilare un ordine

- **Fornitore** e **Variante** (per ogni riga): nel menu a tendina usa la **ricerca** per filtrare per nome prodotto o SKU.
- **Righe in griglia tabellare** con menu **Colonne** (preset, mostra/nascondi, **Ripristina colonne**); su smartphone le righe diventano **card** impilate.
- **Quantità** e **Costo unitario**; il **Subtotale** riga si calcola automaticamente.
- **Data attesa** (opzionale): selettore con **calendario** (stesso stile dei filtri data nei report).
- Puoi creare un **nuovo fornitore** inline dal form (**Nuovo fornitore**).

### Stati e azioni

| Stato ordine         | Cosa puoi fare (Manager e superiori, salvo dove indicato)           |
| -------------------- | ------------------------------------------------------------------- |
| **Bozza**            | Modifica bozza, Invia ordine, Annulla ordine                        |
| **Inviato**          | Annulla ordine, **Registra arrivo merce** (tutti i ruoli operativi) |
| **Annullato**        | **Elimina ordine** — rimozione definitiva dall'elenco               |
| **Ricevuto** / parz. | Solo consultazione                                                  |

L'**Annulla ordine** segna l'ordine come annullato ma lo lascia in lista. **Elimina ordine** (solo su ordini già annullati) lo rimuove in modo irreversibile.

- Creazione e modifica: **Manager** e superiori
- Ricezione merce: tutti i ruoli operativi (verifica con il titolare le regole interne)

---

## 12. Anagrafica fornitori

Menu **Fornitori**: elenco anagrafiche usate negli **ordini fornitore** e negli **arrivi merce**.

| Azione              | Dove                         | Permesso richiesto           |
| ------------------- | ---------------------------- | ---------------------------- |
| Consultare elenco   | **Fornitori**                | Autenticato (area ordini)    |
| Creare / modificare | **Fornitori → Nuovo** / riga | **Gestire ordini fornitore** |

Campi tipici: ragione sociale, P.IVA, indirizzo, email, telefono, note. Puoi anche creare un fornitore **inline** dal form ordine o arrivo merce (**Nuovo fornitore**).

---

## 13. Documenti fiscali e operativi

VestiFlow centralizza i documenti che impattano magazzino e contabilità. **Non sostituisce** il software di fatturazione elettronica o il commercialista: traccia numeri, stati, collegamenti e movimenti di stock.

### Dove trovarli

- **Documenti** — registro completo con filtri, colonne personalizzabili e azioni di creazione
- **Corrispettivi** — quadro economico per periodo, con filtri e stampa/export (vedi [§15](#15-report-dashboard-e-corrispettivi))

### Tipi di documento

| Tipo                        | Uso operativo                                                         |
| --------------------------- | --------------------------------------------------------------------- |
| **Arrivo merce**            | Carico da fornitore con righe, costi, opzionale collegamento a ordine |
| **Carico manuale**          | Carico magazzino senza DDT fornitore (fornitore opzionale)            |
| **Carico iniziale**         | Stock di partenza / primo inventario (fornitore opzionale)            |
| **DDT vendita**             | Consegna merce al cliente; base per successiva fatturazione           |
| **Bozza fattura**           | Dati per emissione fattura (anche da conversione DDT)                 |
| **Proforma**                | Preventivo non fiscale                                                |
| **Trasferimento**           | Spostamento stock tra sedi (origine → destinazione)                   |
| **Scarico manuale**         | Uscita merce (campionario, deteriorata, …)                            |
| **Rettifica**               | Correzione quantità con motivo obbligatorio                           |
| **DDT / fatture fornitore** | Registrazione documenti in ingresso (collegamento a carichi)          |

Alcuni tipi (es. inventario fisico) possono essere generati automaticamente da altre sezioni (**Magazzino → Inventario fisico**).

### Stati del documento

| Stato                       | Significato                                                      |
| --------------------------- | ---------------------------------------------------------------- |
| **Bozza**                   | Modificabile; **nessun** movimento di magazzino                  |
| **Confermato**              | Numero assegnato; movimenti applicati                            |
| **Stampato** / **Inviato**  | Tracciamento operativo / invio al commercialista (bozze fattura) |
| **Registrato esternamente** | Fattura o documento registrato fuori da VestiFlow                |
| **Annullato**               | Documento invalidato (con regole di reversibilità stock)         |

Le azioni disponibili nel **dettaglio documento** dipendono da tipo e stato (conferma, stampa, invio, registrazione esterna, conversione DDT → bozza fattura, annullamento).

### Registro documenti — filtri utili

| Filtro / vista       | A cosa serve                                                          |
| -------------------- | --------------------------------------------------------------------- |
| **Tipo** e **Stato** | Restringe l'elenco (es. solo DDT vendita confermati)                  |
| **Periodo** (da / a) | Intervallo date documento                                             |
| **Cliente**          | Documenti vendita per anagrafica                                      |
| **DDT da fatturare** | DDT con «Seguirà doc. di vendita» che nessuna fattura viva ha incluso |
| **DDT da fatturare** | DDT vendita attivi **senza** bozza fattura collegata                  |
| **Ricerca**          | Numero, riferimento, note                                             |

I filtri restano nell'**URL** della pagina: puoi salvare o condividere il link con il commercialista.

### Creare documenti

Da **Documenti**, pulsante **Nuovo documento** (se hai **Gestire documenti**):

| Documento                      | Percorso tipico                                 |
| ------------------------------ | ----------------------------------------------- |
| Arrivo merce                   | **Documenti → Arrivo merce**                    |
| Trasferimento                  | **Documenti → Trasferimento**                   |
| Scarico / Rettifica            | **Documenti → Scarico manuale** / **Rettifica** |
| DDT / Proforma / Bozza fattura | **Documenti → Nuovo** (tipo vendita)            |

**Arrivo merce — schermata e campi principali**

- **Testata:** tipo documento (**Arrivo merce**, DDT fornitore, Fattura accompagnatoria, **Carico manuale**, **Carico iniziale**), fornitore (obbligatorio per arrivo/DDT/fattura accomp.; opzionale per carichi manuali), sede destinazione, data documento VestiFlow, numero/data **documento fornitore** (es. DDT 242/2026), **causale di carico**, flag **Seguirà fattura**, riferimento fattura fornitore, note.
- **Numero interno VestiFlow:** in bozza vedi l'**anteprima** (es. `CAR-2026-0045`); il numero definitivo viene assegnato alla **conferma** (distinto dal documento del fornitore).
- **Righe in griglia:** menu **Colonne** (preset, resize intestazioni, **Ripristina colonne**); cerca articolo per **nome, SKU o barcode/EAN**; **Crea articolo rapido** o **Crea anagrafica completa** (pannello laterale senza uscire dal documento). Colonne: descrizione, quantità, costo, IVA, lotto/scadenza/seriali (se attivi in Impostazioni), flag **Carica magazzino**, totale riga.
- **Ordine fornitore collegato:** se apri l'arrivo da **Registra arrivo merce** sull'ordine, compaiono anche colonne **Ordinato / Già ricevuto / Residuo** per ogni riga.
- **Conferma:** se il costo differisce dall'ultimo prezzo fornitore e la policy lo prevede, compare un dialog per **aggiornare i prezzi fornitore**.
- **Prezzi articolo:** due spunte in testata decidono cosa il carico scrive in anagrafica — vedi qui sotto.
- **Documento già confermato:** dal form restano disponibili **Anteprima stampa** e il download del PDF. L'arrivo merce non ha azioni di ciclo di vita fiscale: la copertura contabile è tracciata dal collegamento alla fattura fornitore.
- Opzionali per riga: **lotto**, **scadenza lotto**, **numeri seriali** (testo separato da virgola).

Alla **conferma** dell'arrivo merce (o carico manuale/iniziale) VestiFlow registra i **carichi** in magazzino, aggiorna le giacenze e, se collegato, l'ordine fornitore e l'**in arrivo** (e Shopify/TikTok se collegati).

#### Cosa il carico scrive in anagrafica _(dal 16 agosto 2026)_

In fondo alla testata trovi **due spunte**, tutte e due accese di default. Fanno cose diverse,
e vale la pena saperlo:

| Spunta                                                   | Cosa decide                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| **Aggiorna anche il costo di riferimento in anagrafica** | se il costo pagato aggiorna anche il costo dell’**articolo** |
| **Aggiorna prezzi articolo**                             | se i prezzi che scrivi sulle righe aggiornano l’anagrafica   |

⚠️ **Non funzionano allo stesso modo, e la differenza si vede.**

Il **costo** che paghi è un dato del carico: il costo della singola taglia si aggiorna
**sempre**, e la prima spunta decide solo se propagarlo anche al costo di riferimento
dell'articolo.

Il **prezzo al pubblico** invece **non è un dato del documento**: è il prezzo di listino
dell'articolo, e il carico è solo il momento comodo per cambiarlo. Perciò:

- **spunta accesa** → il campo si scrive, e quello che scrivi aggiorna il prezzo della taglia
  in anagrafica;
- **spunta spenta** → il campo resta **visibile ma non modificabile**.

Non è una limitazione: prima quella casella si poteva scrivere sempre, e per gli articoli già
esistenti **il valore digitato non andava da nessuna parte**. Meglio un campo che dice
chiaramente «adesso non si tocca» di uno che accetta un numero e lo butta via.

**Se hai Shopify collegato** compare anche la colonna **Prezzo Shopify**, che puoi accendere
o spegnere dal menu **Colonne** (di default è spenta). Segue la stessa spunta: si scrive solo
a spunta accesa.

⚠️ **Prezzo al pubblico e Prezzo Shopify restano due prezzi distinti**, ed è voluto: quello
che pubblichi online può essere diverso da quello del tuo listino. Con Shopify collegato,
cambiare uno **non** cambia l’altro. Senza Shopify collegato la colonna non c’è, e il prezzo
del canale segue quello di listino solo quando questo cambia davvero.

**Modifica di un documento già confermato:** apri il documento in modifica, clicca **Sblocca modifica** e conferma l'avviso — VestiFlow aggiorna movimenti e giacenze e salva lo storico revisioni.

### Allegati

Nel **form arrivo merce** (dopo il primo salvataggio bozza) e nel **dettaglio documento**, pannello **Allegati**: carica PDF o immagini (es. DDT cartaceo del fornitore, foto colli). Utile per audit e consegna al commercialista.

### Colonne personalizzabili

Usa **Colonne** sopra le tabelle principali per mostrare/nascondere campi, scegliere un **preset** (Completo, Magazzino, Fornitore, …) e **Ripristina colonne**. Le preferenze si **sincronizzano** con il tuo account.

Viste con column picker: **Documenti**, **Giacenze**, **Movimenti**, **Fornitori**, **Prodotti**, **Clienti**, righe **Ordine fornitore** e righe **Arrivo merce**. Su mobile molte liste passano a **card** con etichette campo.

### Numerazione dei documenti

**In testata di ogni documento** trovi **Data, Serie e Numero**.

- Il **numero** che vedi aprendo un documento nuovo è una **proposta**: è il primo libero
  in quel momento, e se lo prende chi salva per primo. Puoi lasciarlo com'è — al
  salvataggio il sistema assegna il primo libero di allora — oppure **scriverne uno tuo**,
  per esempio per tappare un buco nella numerazione.
- Se il numero che hai scritto risulta già preso, un avviso te lo dice, **mette in testata
  il primo numero libero** e aspetta che tu prema Salva: nessun numero viene cambiato alle
  tue spalle.
- La **serie** si sceglie da una tendina, non si scrive. Contiene le serie utilizzabili
  nella sede del documento (vedi sotto). Se non la tocchi, il documento prende la serie
  predefinita.
- L'icona **⚙** accanto alla serie apre la gestione delle numerazioni senza uscire dal
  documento.

**Duplicando un documento** il numero **non** si eredita: il duplicato prende il primo
libero e la data di oggi.

**Il numero proposto tiene conto della data.** Se hai preparato un documento datato la
settimana prossima e gli hai dato un numero alto, quel numero non brucia la numerazione di
oggi: aprendo un documento con la data di oggi ti viene proposto il primo libero fra i
documenti che lo precedono. È anche il motivo per cui, a volte, il numero proposto **tappa
un buco** invece di andare in coda — succede solo quando la data lo consente.

### Se la numerazione va fuori ordine

Dentro la stessa serie, a un numero più alto deve corrispondere una data uguale o
successiva. Nella stessa giornata l'ordine non conta: numerare 3, poi 1, poi 2 tutti dello
stesso giorno va benissimo.

Quando l'ordine si rompe — di solito perché un numero è stato scritto a mano, o perché è
stata cambiata la data di un documento già salvato — al salvataggio compare un avviso con
**l'elenco dei documenti fuori posto**, non solo quello che stai salvando.

- **Non è un blocco**: «Sì, salva comunque» prosegue.
- **Continua a comparire** finché la serie resta fuori ordine, anche sui documenti
  successivi che sono in ordine. È voluto: un buco non giustificato va sistemato, e un
  avviso che sparisce da solo si dimentica.
- La casella **«Non mostrare più»** lo spegne **solo per quel tipo di documento**: chi
  sistema le fatture continua a vederlo sui DDT. Una volta spento **non si riaccende**, e
  non c'è un pannello per riattivarlo — quindi spuntala solo se sei sicuro.

### La sede in testata

Ogni documento porta la **Sede** — il magazzino o il negozio a cui appartiene.

- Se l'amministratore ti ha assegnato una **sede predefinita**, il campo esce già
  compilato con quella: non devi confermarla a ogni documento.
- Se non ce l'hai — è il caso di chi lavora su più sedi — il campo parte **vuoto** e la
  sede va scelta. È voluto: è l'unico caso in cui la scelta non è ovvia.
- Nei **Trasferimenti** si precompila solo la sede di **partenza**; la destinazione la
  scegli tu.
- Fanno eccezione la **Registrazione fattura fornitore**, che non ha il campo perché la
  fattura è intestata all'azienda e non a una sede, e la **Vendita al banco**, che prende
  la sede dal selettore in alto.

**La sede decide quali serie puoi usare**: una serie assegnata a una sede è utilizzabile
solo lì, una serie senza sede vale ovunque. Cambiando sede la tendina si aggiorna.

### Impostazioni numerazione

**Documenti → Impostazioni documenti** (solo **Gestire documenti**): prefissi per tipo
documento e gestione delle serie (i **Numeratori**). Qui si crea una serie, le si assegna
una sede e si sceglie quale è la predefinita del tipo.

Il riferimento di un documento ha la forma `PREFISSO-SERIE-NUMERO` (es. `AM-A-0042`), o
`PREFISSO-NUMERO` se la serie non c'è. Chi vuole ricominciare da 1 ogni anno crea una
serie chiamata come l'anno.

### Permessi

| Permesso                 | Cosa abilita                                      |
| ------------------------ | ------------------------------------------------- |
| **Consultare documenti** | Lista, dettaglio, stampa anteprima, filtri        |
| **Gestire documenti**    | Creazione, modifica bozze, conferma, impostazioni |

---

## 14. Vendite e clienti

Il menu dipende dal **profilo canale** del negozio:

| Profilo canale      | Voci in sidebar                    | Contenuto                                                                             |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| **Solo gestionale** | **Registra vendita**               | Scansione vendite e storni al banco — vedi [§17](#17-negozio-fisico-vendite-al-banco) |
| **Shopify**         | **Registra vendita** + **Vendite** | Doppia scansione al banco **oppure** ordini sync da Shopify (online/POS)              |
| **TikTok Shop**     | **Registra vendita**               | Scansione al banco; giacenze pushate a TikTok dopo la scansione                       |

### Registra vendita (tutti i profili)

Schermata **Registra vendita** per aggiornare le giacenze dopo vendita o reso in negozio fisico. **Non sostituisce la cassa fiscale** e non crea un ordine di vendita in VestiFlow: registra il movimento di magazzino (e, con Shopify/TikTok connessi, aggiorna le giacenze sul canale).

**Flusso consigliato con cassa esterna (doppia scansione):**

1. Incasso alla **cassa fiscale** o POS esterno.
2. Scansione dello stesso barcode in **Registra vendita** → **Registra vendita** (scarico 1 pezzo).
3. Per un reso: pannello **Registra storno** (reingresso 1 pezzo).

**Con Shopify POS collegato:** le vendite POS arrivano anche in **Vendite** via sync; usa **Registra vendita** solo se incassi fuori da Shopify POS (cassa fiscale separata).

**Elementi della schermata:**

- **Sede (location)** — obbligatoria; deve essere quella dove avviene l’operazione.
- Campo barcode/SKU con **Registra vendita** e **Registra storno**.
- **Scansione camera** (se abilitata) — icona fotocamera come in Magazzino.
- **Pistola barcode USB** — funziona come tastiera: focus nel campo, scan, Invio o pulsante.
- **Sessione corrente** — ultime operazioni della sessione (non sostituisce lo storico movimenti).

Ogni scansione valida genera un movimento in **Magazzino → Movimenti** con origine **Vendita al banco**. Se lo stock **disponibile** è insufficiente, la vendita viene rifiutata.

### Vendite (solo profilo Shopify)

- Provengono da **Shopify Online** o **Shopify POS**.
- In VestiFlow sono **sola lettura**.
- Filtri: stato pagamento, canale (online / negozio), ricerca ordine o cliente.

| Azione                             | Dove            | Permesso richiesto |
| ---------------------------------- | --------------- | ------------------ |
| **Sincronizza vendite da Shopify** | Vendite (lista) | **Esportare dati** |
| **Esporta CSV**                    | Vendite (lista) | **Esportare dati** |

#### ⚠️ Resi e rimborsi con più sedi — cosa controllare su Shopify

Se hai **più di una sede**, quando elabori un reso o un rimborso con ricarica di magazzino **controlla la sede proposta da Shopify prima di confermare**: non è quella da cui la merce è partita.

Verificato il 14/08/2026 su ordini reali: un ordine spedito da «Shop location» proponeva il rientro su un'altra sede. Shopify segue la **priorità delle sedi** configurata, non l'evasione — quindi il default è quasi sempre da correggere a mano, e nessuno te lo segnala.

Il posto dove guardare è la tendina **«Restituisci articolo a inventario presso: …»**, nella schermata del rimborso o dell'elaborazione del reso. Cambiala sulla sede da cui la merce era realmente uscita.

Con **una sola sede** questo non ti riguarda: non c'è niente da scegliere.

> Esiste anche un difetto di VestiFlow sullo stesso tema, già registrato e da correggere: la sede da cui il gestionale scarica non è sempre quella che ha spedito. Finché non è chiuso, con più sedi le giacenze per sede vanno lette con prudenza — il totale resta corretto, la ripartizione no.

### Clienti (profilo Shopify)

- Anagrafica da Shopify, **sola lettura** in VestiFlow.
- Per modifiche usa **Shopify Admin**.
- **Non disponibile** nel profilo Solo gestionale.

| Azione                             | Dove            | Permesso richiesto |
| ---------------------------------- | --------------- | ------------------ |
| **Sincronizza clienti da Shopify** | Clienti (lista) | **Esportare dati** |
| **Esporta CSV**                    | Clienti (lista) | **Esportare dati** |

---

## 15. Report, dashboard e corrispettivi

### Dashboard

Pagina iniziale dopo il login: vendite recenti, ordini fornitore in attesa e indicatori sintetici del negozio.

### Report

Tabelle e KPI su prodotti, giacenze e ordini. I filtri **periodo** (da / a) usano un **selettore data con calendario**, coerente con la data attesa negli ordini fornitori e con i **Corrispettivi**.

### Corrispettivi

Voce dedicata in sidebar, sotto **Vendite**: il **quadro economico** delle vendite e delle rettifiche che VestiFlow conosce, per periodo.

> ⚠️ **Cambiato il 16 agosto 2026.** Qui c'era il **Registro commercialista**, con dei contatori che dividevano i documenti fra «già inviati» e «da inviare» al commercialista, e un pulsante «Segna consegnato». **Non ci sono più**, e non torneranno: VestiFlow non tiene traccia di cosa hai già mandato.

**Come si usa, in tre passi:**

1. scegli il **periodo** — preset rapidi, oppure Mese / Trimestre / Anno, oppure un intervallo tuo;
2. restringi con i **filtri** se ti serve un sottoinsieme: **ambito** (Tutti · Online · Fisico/POS) e **tipo** (vendite, resi, rimborsi);
3. **stampa o esporta** quel sottoinsieme — CSV, foglio Excel o PDF.

Fine. **Non c'è un «dopo».** Puoi esportare lo stesso periodo dieci volte: non cambia niente, non resta traccia, nessuna vendita viene marcata. Se il commercialista ti richiede marzo a settembre, rifai marzo.

**Le vendite in negozio con Shopify POS ci sono**, classificate come **Fisico/POS**. Che le abbia già certificate il registratore di cassa non è un motivo per nasconderle: nel quadro economico interno devono comparire, una volta sola e riconoscibili. Se ti serve il solo ecommerce, metti **ambito = Online**.

**Per i DDT ancora da fatturare** non usi questa pagina: vai in **Documenti → DDT vendita** e spunti il filtro **«DDT da fatturare»**. Ti mostra quelli su cui hai messo «Seguirà doc. di vendita» e che nessuna fattura ha ancora incluso — e se una fattura viene annullata, il suo DDT ricompare lì.

#### Come leggere i corrispettivi _(agosto 2026)_

**Il periodo si sceglie per calendario, non a mano.** Oltre ai preset rapidi (ultimi 7 o 30 giorni, mese corrente, mese scorso, anno corrente) trovi **Mese…**, **Trimestre…** e **Anno…**: scegliendoli compaiono i selettori che servono — il mese e l'anno, il trimestre e l'anno, l'anno soltanto. Per il 2° trimestre 2026 non devi scrivere `01/04` e `30/06`: lo scegli.

I selettori compaiono **solo** dove hanno senso: «mese corrente» non chiede l'anno, perché è il mese di adesso. **Personalizzato** resta per i periodi che non sono di calendario, tipo dal 15 marzo al 18 maggio.

**Una vendita entra nel registro quando la merce parte, non quando l'ordine arriva.** Un ordine ricevuto il 30 luglio e spedito il 2 agosto è un corrispettivo di **agosto**. Un ordine mai spedito non compare in nessun periodo, e un ordine annullato prima della spedizione non compare mai — la vendita non è avvenuta.

**I resi e i rimborsi compaiono come righe a sé, con l'importo in negativo**, alla data in cui sono avvenuti — non a quella della vendita. Quindi in un elenco puoi trovare:

| Data  | Tipo     | Ordine | Totale |
| ----- | -------- | ------ | ------ |
| 14/08 | Vendita  | #1008  | 130,01 |
| 14/08 | Reso     | #1008  | −80,01 |
| 14/08 | Rimborso | #1008  | −5,00  |

**«Reso» e «Rimborso» sono cose diverse**: nel primo caso la merce è tornata in magazzino, nel secondo sono tornati solo i soldi (un capo rovinato, uno sconto concesso dopo la vendita).

**Il totale in fondo si ricostruisce sommando la colonna.** È voluto: se il numero non torna, lo vedi riga per riga senza dover chiedere a nessuno. La vendita originale **non viene mai cancellata né corretta** — resta alla sua data, e il reso la rettifica alla propria. È anche ciò che permette a chi tiene la contabilità di collegare il reso alla vendita da cui viene.

**Gli annullamenti non tolgono niente al totale.** Li vedi contati nel riepilogo, ma valgono zero: annullano una vendita che non era mai stata registrata.

Se qualche vendita risulta **evasa senza data**, il riepilogo te lo dice: non è conteggiata in nessun periodo, e va sistemata. Non sparisce in silenzio.

**Il file che esporti contiene le stesse righe che vedi.** CSV, Excel e PDF portano vendite e rettifiche con una colonna **Tipo**, in ordine di data, e la somma delle righe fa esattamente il totale stampato in testa. È il modo per cui il commercialista può rifare il conto senza chiederti niente.

#### Canale e tipo

Accanto al periodo trovi altri due filtri, indipendenti fra loro e dal periodo:

- **Canale** — tutti, Shopify, oppure Negozio. Di partenza il registro mostra **tutti i canali**: se una parte delle vendite restasse fuori per difetto, nessuno se ne accorgerebbe;
- **Tipo** — vendite e rettifiche insieme, oppure solo vendite, solo resi, solo rimborsi.

Puoi combinarli: «2° trimestre 2026 · Shopify · Solo resi» per vedere cosa è tornato indietro in quel trimestre.

**Attenzione a una cosa, ed è voluta**: il filtro **Tipo** cambia solo l'elenco, non il totale. Se guardi «Solo resi», in fondo continui a leggere il corrispettivo del periodo — non la somma dei soli resi. Serve a non avere mai sotto gli occhi un numero negativo che sembra un totale e non lo è.

---

## 16. Usare VestiFlow da smartphone

VestiFlow è una **app web installabile (PWA)**:

- icona sulla home del telefono;
- apertura a schermo intero;
- ideale per **Cerca giacenza**, **Registra vendita** e **scanner barcode** in magazzino.

### Installazione

**Android (Chrome):** menu → **Aggiungi a schermata Home** / **Installa app**. Su **Magazzino → Cerca** può comparire un banner di installazione.

**iPhone (Safari):** **Condividi** → **Aggiungi a Home**.

### Limitazioni

- Serve connessione internet per i dati aggiornati.
- Scanner barcode: meglio su **Chrome/Android**; su iOS usa l'inserimento manuale del codice.

---

## 17. Negozio fisico: vendite al banco

### Profilo Solo gestionale (senza Shopify/TikTok)

Per negozi con **cassa fiscale o POS esterno** e VestiFlow solo come gestionale:

1. Incassa alla cassa (VestiFlow non emette scontrini).
2. Apri **Registra vendita** in sidebar.
3. Seleziona la **sede** corretta.
4. Scansiona il barcode (pistola USB o camera) e **Registra vendita**.
5. Per un reso cliente: **Registra storno** nello stesso schermo.

**Consigli:** mantieni il campo vendita a fuoco; verifica barcode/SKU sulle varianti; controlla **Movimenti** con origine **Vendita al banco** se qualcosa non quadra.

Non compare la lista **Vendite** né **Clienti**: il tracciamento vendite in VestiFlow è il movimento di magazzino.

### Profilo Shopify (negozio fisico)

Due scenari possibili:

**A — Cassa esterna o fiscale + doppia scansione**

Come il profilo Solo gestionale: incasso alla cassa, poi **Registra vendita** in VestiFlow. In sidebar compaiono anche **Vendite** (ordini online/POS da Shopify).

**B — Shopify POS**

| Strumento       | Ruolo                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| **Shopify POS** | Cassa su tablet/iPhone — vendite sync automatiche                                                               |
| **VestiFlow**   | **Vendite** (ordini) + movimenti da webhook; **Registra vendita** opzionale se serve rettifica manuale al banco |

Flusso POS: vendita POS → Shopify scala giacenza → webhook → VestiFlow (movimento + ordine in **Vendite**).

### Profilo TikTok Shop (negozio fisico)

Usa **Registra vendita** per vendite e storni al banco (cassa esterna). Le giacenze vengono inviate a TikTok Shop dopo la scansione. Non c’è lista **Vendite** sync da TikTok in questa fase.

VestiFlow **non** emette scontrini fiscali in nessun profilo: usa il sistema collegato al POS o il tuo software fiscale.

---

## 18. Profilo, foto e sicurezza account

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

## 19. Domande frequenti

### Non vedo un pulsante o una voce di menu che mi aspettavo

1. Verifica con il referente VestiFlow quali **permessi granulari** ha il tuo account (non basta il ruolo).
2. Dopo una modifica permessi: **esci e rientra** o ricarica con **Ctrl+F5** (Mac: **Cmd+Shift+R**).
3. Esempi: **Sincronizza catalogo** richiede import/export prodotti; **Registra movimento** richiede gestione giacenze; **Documenti** richiede consultare/gestire documenti; **Collega Shopify** è solo per il **Titolare**.

### Non vedo Documenti o Corrispettivi

Verifica i permessi **Consultare documenti** e **Consultare report**. I **Corrispettivi** richiedono accesso ai report. Dopo una modifica permessi: esci e rientra.

### Cosa significa «DDT da fatturare»?

Sono i **DDT vendita** su cui hai spuntato **«Seguirà doc. di vendita»** e che nessuna Fattura viva ha ancora incluso. Li trovi in **Documenti → DDT vendita**, spuntando il filtro **«DDT da fatturare»**.

⚠️ **Corretto il 16 agosto 2026.** Prima diceva «confermati senza bozza fattura collegata», e il filtro faceva davvero così: mostrava **tutti** i DDT confermati, compresi quelli che una fattura non la aspettano. Ora guarda la spunta — e se una fattura viene **annullata**, il DDT che aveva incluso **torna** nell'elenco.

### Differenza tra Registra arrivo merce (ordine) e Arrivo merce manuale

Entrambi usano lo **stesso form Documenti → Arrivo merce**. Da un ordine **Inviato**, **Registra arrivo merce** crea una **bozza collegata** con righe e quantità residue precompilate (colonne Ord./Ric./Res.). Da **Documenti → Nuovo arrivo merce** crei un carico anche **senza ordine** precedente. In entrambi i casi serve **Conferma e carica magazzino** per movimentare lo stock; in bozza il magazzino non cambia.

### Il prodotto creato in VestiFlow non compare su Shopify

1. Impostazioni → Shopify è **Connesso**?
2. Dettaglio prodotto: etichetta **Fonte: VestiFlow** (non Shopify)?
3. Badge sync **Errore sync** nella colonna Shopify o nel dettaglio?
4. Prova **Sincronizza con Shopify** nel dettaglio prodotto (solo **Fonte: VestiFlow**)
5. Se persiste: **Disconnetti** e **riconnetti** Shopify da Impostazioni

### Il prodotto su Shopify non compare in VestiFlow

1. **Importa catalogo da Shopify** in Impostazioni (attendi fine operazione)
2. Verifica che **Aggiornamenti automatici** sia attivo
3. Premi **Verifica ora**: dice quali notifiche risultano davvero attive su Shopify. Se fra i mancanti compaiono quelle dei prodotti, i cambiamenti fatti online non arrivano — ed è quello il motivo, non l'import

### Capire lo stato delle notifiche

Sotto lo stato della connessione ci sono quattro informazioni. Servono a distinguere **«non è cambiato niente»** da **«non arriva più niente»**, che viste da fuori si assomigliano.

| Cosa leggi                 | Cosa significa                                                         |
| -------------------------- | ---------------------------------------------------------------------- |
| **Ultimo evento ricevuto** | quando Shopify ha comunicato qualcosa l'ultima volta                   |
| **Notifiche registrate**   | quante sono attive sulle attese, **con il nome di quelle che mancano** |
| **Indirizzo di consegna**  | dove Shopify sta consegnando                                           |
| **Ultima verifica**        | quando abbiamo chiesto a Shopify come stanno le cose                   |

**«Non verificate» e «Mai» non sono un guasto.** Vogliono dire che non l'abbiamo ancora chiesto a Shopify: è diverso da «non c'è niente». Premi **Verifica ora** e diventano numeri.

**Nessun evento da giorni non è di per sé un problema.** Se non hai ordini online e nessuno tocca le giacenze, non c'è niente da comunicare. Per questo VestiFlow riporta la data e non dà giudizi: l'unico modo di sapere davvero com'è messa la connessione è **Verifica ora**.

### «Manca una notifica» e non trovo il pulsante per registrarla

**Registra le notifiche mancanti** compare solo dopo una verifica, e solo quando c'è qualcosa da registrare. Se non lo vedi, i motivi sono due e portano a cose diverse:

**Non c'è niente da registrare.** «Notifiche registrate» non nomina nessun mancante: è tutto a posto e non serve fare niente.

**Stai guardando da un ambiente che Shopify non può raggiungere.** In questo caso i mancanti sono comunque nominati, ma accanto all'indirizzo leggi **«confronto non possibile da questo ambiente»**. Succede quando si apre il gestionale da un computer di sviluppo invece che dall'indirizzo pubblico. Il pulsante è nascosto **apposta**: registrare da lì creerebbe notifiche verso un indirizzo che non riceverà mai niente, e si sommerebbero a quelle buone invece di sostituirle. La riparazione va fatta dall'indirizzo pubblico del gestionale.

### L'import catalogo è lento

Con molti prodotti è **normale**. Attendi il messaggio di esito senza ripremere il pulsante. Se compare un avviso su limiti Shopify, attendi 1–2 minuti e riprova **una volta**.

### Le giacenze non coincidono

1. Hai fatto **Sincronizza location**?
2. Hai **selezionato e salvato** le sedi attive in **Sedi attive in VestiFlow**?
3. In **Impostazioni → Location** ogni sede usata è **Sincronizzata**?
4. Controlla lo **storico movimenti** (origine gestionale vs Shopify)
5. Verifica la **sede selezionata** in alto (solo sedi attive nel piano)

### Vendite o clienti mancanti

Spesso serve l'approvazione dati clienti protetti su Shopify Partners. Catalogo e giacenze funzionano comunque. Chiedi al referente VestiFlow se la sync ordini/clienti è abilitata per il tuo negozio.

**Profilo Solo gestionale o TikTok:** la lista **Vendite** non esiste per design. Usa **Registra vendita** per aggiornare lo stock e **Storico movimenti** per verificare le operazioni.

### Non vedo «Registra vendita» in sidebar

La voce compare per tutti i profili canale attivi. Se manca, verifica di essere loggato con un ruolo operativo (commesso o superiore) o contatta il referente VestiFlow.

### Registra vendita e Vendite insieme (Shopify)

È **normale** con profilo Shopify: **Registra vendita** serve per la doppia scansione al banco; **Vendite** mostra gli ordini sincronizzati da Shopify. Non confondere movimento magazzino (scansione) con ordine ecommerce (lista Vendite).

### La vendita viene rifiutata («stock insufficiente»)

La sede selezionata non ha quantità **disponibile** ≥ 1 per quella variante. Controlla **Giacenze** per sede, verifica di aver scansionato il codice giusto, oppure registra prima un **carico** se la merce è appena arrivata.

### Ho scansionato due volte per errore

Usa **Registra storno** con lo stesso barcode per reingressare 1 pezzo, oppure chiedi a un responsabile una **rettifica** in Magazzino con motivo documentato.

### Non trovo un articolo scansionando il barcode

- Verifica che la variante abbia **barcode** compilato in VestiFlow (o SKU uguale al codice letto).
- Prova a cercare manualmente lo **SKU** in **Cerca giacenza**.

### Upload immagine prodotto fallito

Carica JPEG, PNG o WebP (max 5 MB). VestiFlow **ottimizza automaticamente** le immagini in WebP sul server. Riprova dopo qualche minuto se il servizio era in manutenzione.

### Ho più sedi: le vedo tutte?

Dipende dal **piano** e dalla **selezione attiva**:

1. Configura le location in **Shopify Admin**, poi **Sincronizza location** in Impostazioni.
2. Nel pannello **Sedi attive in VestiFlow** seleziona fino al numero di sedi incluse nel contratto e clic **Salva sedi attive**.
3. Il **selettore location** in alto e il magazzino mostrano **solo** quelle attive — non tutte le location Shopify se ne hai importate di più.

Per **cambiare** le sedi attive dopo il primo salvataggio contatta il **referente VestiFlow** (non puoi modificarle da solo).

### Non posso modificare le sedi attive

Dopo il **primo salvataggio** la selezione è **bloccata** per policy commerciale. Compare il messaggio _«Contatta l'assistenza per modificare le sedi attive»_. Il referente VestiFlow può concederti **un solo round** di modifica; dopo il nuovo salvataggio si riblocca.

Se vedi _«Modifica consentita una sola volta…»_, seleziona le nuove sedi e salva subito.

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

### Il referente VestiFlow può accedere al mio gestionale?

Sì, **solo per supporto tecnico** e **solo quando necessario**. L'operatore VestiFlow può aprire una **sessione di assistenza** temporanea (durata massima **2 ore**) sul tuo account negozio, senza conoscere la tua password. Ogni sessione è **registrata** (chi, quando, su quale negozio). Non devi fare nulla in app: durante l'assistenza l'operatore vede il gestionale come un amministratore del negozio; tu continui a usare VestiFlow normalmente con il tuo account.

---

## 20. Guida nel menu

La voce **Guida** compare in sidebar subito sotto **Impostazioni** e apre questo manuale dentro l'app (`/app/guide`).

- Usa l'**Indice** per saltare alle sezioni.
- In alto puoi **scaricare il PDF** per consultarlo offline o stamparlo.

La versione in-app è pensata per chi lavora nel negozio: passi operativi, dove cliccare e cosa aspettarsi. Per assistenza su configurazione o problemi di sync, contatta il tuo **referente VestiFlow**.

---

### Le Vendite al banco nei Corrispettivi _(dal 16 agosto 2026)_

Una **Vendita al banco** conclusa compare nei **Corrispettivi**, classificata come
**Fisico/POS · VestiFlow**. Prima non ci compariva affatto: il Registro leggeva solo le vendite
arrivate dai canali, e quello che battevi alla cassa restava fuori dal tuo quadro economico.

**Che il registratore di cassa la certifichi non la fa sparire da qui.** Se registri 19,99 € in
VestiFlow e poi batti 19,99 € sulla tua cassa, per VestiFlow **c'è una vendita sola**: il
Registro rappresenta quella vendita, non ne crea una seconda.

⚠️ **Non è il contrario, però:** vedere la vendita nei Corrispettivi **non vuol dire** che
VestiFlow abbia verificato che lo scontrino sia stato emesso. Sono due cose distinte, e possono
esistere vendite battute solo sulla cassa che VestiFlow non conosce.

**Due filtri, non uno.** «Ambito» dice **come è arrivata** la vendita — Online oppure
Fisico/POS — e «Canale» dice **chi l'ha raccolta** — Shopify o VestiFlow. Servono entrambi
perché rispondono a domande diverse:

| Vuoi vedere                               | Ambito     | Canale    |
| ----------------------------------------- | ---------- | --------- |
| le tue vendite al banco                   | Fisico/POS | VestiFlow |
| il POS di Shopify                         | Fisico/POS | Shopify   |
| l'ecommerce                               | Online     | Shopify   |
| **tutto Shopify**, negozio e sito insieme | Tutti      | Shopify   |
| il quadro completo                        | Tutti      | Tutti     |
