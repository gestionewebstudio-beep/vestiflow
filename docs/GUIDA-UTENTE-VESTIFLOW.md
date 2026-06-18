# VestiFlow — Guida completa al gestionale

**Versione documento:** 1.4 — Giugno 2026

**Destinatari:** titolari di negozio, responsabili magazzino, amministratori

**Prodotto:** VestiFlow — gestionale web multi-location per boutique di abbigliamento, integrato con Shopify

---

## Indice

1. [Cos'è VestiFlow](#1-cosè-vestiflow)
2. [Come accedere al gestionale](#2-come-accedere-al-gestionale)
3. [Panoramica dell'interfaccia](#3-panoramica-dellinterfaccia)
4. [Ruoli utente e permessi](#4-ruoli-utente-e-permessi)
5. [Configurazione iniziale del negozio](#5-configurazione-iniziale-del-negozio)
6. [Collegamento con Shopify](#6-collegamento-con-shopify)
   - [Schermata Integrazione Shopify](#schermata-integrazione-shopify-dopo-il-collegamento)
   - [Limiti chiamate API Shopify](#limiti-delle-chiamate-api-shopify)
7. [Sincronizzazione dati: cosa va dove](#7-sincronizzazione-dati-cosa-va-dove)
8. [Prodotti e catalogo](#8-prodotti-e-catalogo)
9. [Magazzino e giacenze](#9-magazzino-e-giacenze)
10. [Ordini fornitori](#10-ordini-fornitori)
11. [Vendite e clienti (Shopify)](#11-vendite-e-clienti-shopify)
12. [Report e dashboard](#12-report-e-dashboard)
13. [App PWA: installazione su smartphone](#13-app-pwa-installazione-su-smartphone)
14. [Cassa, POS e negozio fisico](#14-cassa-pos-e-negozio-fisico)
15. [Sicurezza account (MFA)](#15-sicurezza-account-mfa)
16. [Domande frequenti e risoluzione problemi](#17-domande-frequenti-e-risoluzione-problemi)
17. [Funzionalità in arrivo](#18-funzionalità-in-arrivo)
18. [Guida integrata nel gestionale](#19-guida-integrata-nel-gestionale)

---

## 1. Cos'è VestiFlow

VestiFlow è un **gestionale cloud** pensato per negozi di abbigliamento che vendono anche online con **Shopify**.

Con un unico account puoi:

- gestire **prodotti e varianti** (taglia, colore, SKU, barcode, prezzi);
- controllare **giacenze per location** (negozio, magazzino, punto vendita);
- registrare **carichi, scarichi, trasferimenti e rettifiche** con storico tracciabile;
- creare e ricevere **ordini ai fornitori**;
- consultare **vendite e clienti** provenienti da Shopify (online e POS);
- collegare il negozio Shopify per mantenere **catalogo e inventario allineati**.

VestiFlow **non sostituisce** il sito e-commerce Shopify: lo **affianca** come strumento operativo per chi lavora in negozio e in magazzino.

### Cosa serve per usarlo

| Requisito                     | Note                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| Browser moderno               | Chrome, Edge, Safari, Firefox (versione recente)                 |
| Connessione internet          | Il gestionale è online; la PWA può aprirsi come app installata   |
| Account VestiFlow             | Email e password fornite dal titolare o dall'operatore VestiFlow |
| Negozio Shopify (consigliato) | Per sync catalogo, giacenze, ordini e clienti                    |

---

## 2. Come accedere al gestionale

### URL

L'indirizzo del gestionale ti viene comunicato al momento dell'attivazione (es. dominio Firebase App Hosting del tuo tenant VestiFlow).

### Login

1. Apri l'URL del gestionale.
2. Inserisci **email** e **password**.
3. Se hai attivato la **verifica in due passaggi (MFA)**, inserisci il codice a 6 cifre dall'app authenticator.
4. Sei reindirizzato alla **Dashboard**.

### Password dimenticata

1. Dalla schermata di login clicca **Password dimenticata**.
2. Inserisci la tua email.
3. Controlla la casella di posta e segui il link per impostare una nuova password.

### Logout

Dalla **barra in alto** (topbar) usa il menu utente e conferma l'uscita.

---

## 3. Panoramica dell'interfaccia

### Barra laterale (sidebar)

Menu principale, sempre disponibile su desktop; su smartphone si apre come **drawer** dal pulsante menu.

| Voce menu            | Funzione                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| **Dashboard**        | Riepilogo attività e indicatori principali                             |
| **Prodotti**         | Catalogo, creazione, modifica, import/export CSV, sync Shopify         |
| **Magazzino**        | Apre **Cerca giacenza** (ricerca rapida SKU/barcode, ideale su mobile) |
| **Ordini Fornitori** | Ordini di acquisto dai fornitori                                       |
| **Vendite**          | Ordini di vendita da Shopify (sola lettura), sync ed export CSV        |
| **Clienti**          | Anagrafica da Shopify (sola lettura), sync ed export CSV               |
| **Report**           | Indicatori e tabelle riepilogative                                     |
| **Guida**            | Manuale completo del gestionale (questo documento, versione in-app)    |
| **Impostazioni**     | Shopify, location, tema, sicurezza account                             |

Dal menu **Magazzino** accedi subito alla ricerca; le altre sezioni magazzino (Giacenze, Movimenti, Inventario fisico) si raggiungono dai **tab** in alto nelle pagine del magazzino oppure da link interni.

### Barra superiore (topbar)

- **Titolo / breadcrumb** della sezione corrente
- **Selettore location** — filtra le operazioni per la sede attiva (negozio, magazzino, ecc.); se hai più sedi, scegli quella su cui stai lavorando
- **Indicatore sync Shopify** — stato collegamento (cliccabile → Impostazioni)
- **Tema** chiaro / scuro / sistema
- **Profilo utente** e logout

### Stati comuni nelle pagine

Ogni area dati mostra in modo esplicito:

- **Caricamento** — skeleton o spinner
- **Elenco vuoto** — messaggio + azione suggerita
- **Errore** — descrizione + pulsante Riprova

---

## 4. Ruoli utente e permessi

Ogni utente appartiene a un **tenant** (la tua azienda) e ha un **ruolo VestiFlow** assegnato quando l'account viene creato nel gestionale.

| Ruolo                      | Descrizione tipica                |
| -------------------------- | --------------------------------- |
| **Titolare (owner)**       | Proprietario del negozio          |
| **Amministratore (admin)** | Store manager, referente IT       |
| **Manager**                | Responsabile magazzino / acquisti |
| **Commesso (clerk)**       | Operatore negozio / magazzino     |

### Da dove viene il ruolo (VestiFlow ≠ Shopify)

Il ruolo **non** viene da Shopify. Sono due sistemi separati:

|                      | **VestiFlow**                                                                                    | **Shopify Admin**                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Cosa regola**      | Chi può fare cosa **nel gestionale** (prodotti, magazzino, ordini fornitori, sync…)              | Chi può fare cosa **nel pannello Shopify** (tema, checkout, staff del negozio online…) |
| **Dove si assegna**  | Database VestiFlow, al momento della creazione account (oggi tramite **operatore VestiFlow**)    | Shopify → Impostazioni → Utenti e permessi                                             |
| **Sincronizzazione** | **Nessuna** — il ruolo Shopify di un dipendente non cambia automaticamente il ruolo in VestiFlow |

Esempio: una persona può essere **Amministratore** su Shopify ma **Commesso** in VestiFlow, o viceversa. Per un nuovo collega servono **due account distinti** (email/password VestiFlow + eventuale accesso Shopify), salvo diversa indicazione del referente.

Al **primo onboarding** del negozio, l'operatore VestiFlow crea il tenant e il **primo utente**, scegliendo il ruolo (di default **Titolare**). Per **ulteriori utenti** dello stesso negozio non c'è ancora una schermata self-service: vanno richiesti al referente VestiFlow.

### Cosa può fare ogni ruolo

VestiFlow applica i permessi **sul server** (API) e **in interfaccia**: pulsanti, form e route riservate non compaiono se il tuo ruolo non le consente. Se provi ad aprire un URL diretto senza permesso, vieni reindirizzato alla dashboard.

| Operazione                                                            | Titolare / Admin | Manager | Commesso |
| --------------------------------------------------------------------- | ---------------- | ------- | -------- |
| Collegare Shopify, sync location, webhook, import catalogo da Shopify | Sì               | No      | No       |
| Sync manuale vendite / clienti / giacenze da Shopify (liste)          | Sì               | No      | No       |
| Creare e modificare prodotti, import/export CSV prodotti              | Sì               | Sì      | No       |
| Sincronizzare un singolo prodotto verso Shopify (dettaglio prodotto)  | Sì               | Sì      | No       |
| Eliminare prodotti                                                    | Sì               | No      | No       |
| Export/import CSV giacenze                                            | Sì               | Sì      | No       |
| Export CSV vendite e clienti                                          | Sì               | Sì      | No       |
| Creare e inviare ordini fornitori                                     | Sì               | Sì      | No       |
| Ricevere merce su ordine fornitore                                    | Sì               | Sì      | Sì       |
| Consultare giacenze, movimenti, vendite, clienti                      | Sì               | Sì      | Sì       |
| Registrare movimenti di magazzino                                     | Sì               | Sì      | Sì       |
| Inventario fisico (sessioni di conteggio)                             | Sì               | Sì      | Sì       |
| Configurare MFA (Impostazioni)                                        | Sì               | Sì      | No       |

### Cosa non fa ancora il gestionale

- **Non** c'è una schermata per invitare **ulteriori** utenti o cambiare ruolo a un account esistente: oltre al primo utente creato in onboarding, i nuovi account vanno richiesti al **referente VestiFlow**.
- Le voci di menu restano visibili a tutti i ruoli (consultazione); le **azioni** sensibili sono nascoste o bloccate come nella tabella sopra.

### Buone pratiche

Non condividere le credenziali tra più persone: ogni operatore dovrebbe avere il proprio account con il ruolo adeguato.

---

## 5. Configurazione iniziale del negozio

Questa sezione descrive il percorso consigliato **dopo la prima attivazione**.

### Per il titolare del negozio

| Step | Dove                     | Cosa fare                                                    |
| ---- | ------------------------ | ------------------------------------------------------------ |
| 1    | Email                    | Accedi con le credenziali ricevute                           |
| 2    | Impostazioni → Sicurezza | Attiva MFA (consigliato)                                     |
| 3    | Impostazioni → Shopify   | Collega il negozio Shopify                                   |
| 4    | Impostazioni             | **Sincronizza location**                                     |
| 5    | Impostazioni             | **Attiva aggiornamenti automatici**                          |
| 6    | Impostazioni             | **Importa catalogo da Shopify** (se hai già prodotti online) |
| 7    | Prodotti                 | Verifica / completa il catalogo                              |
| 8    | Magazzino                | Controlla giacenze e registra eventuali rettifiche iniziali  |

<!-- vestiflow:exclude-in-app -->

### Per l'operatore VestiFlow (onboarding nuovo cliente)

Gli operatori piattaforma autorizzati vedono **Nuovo cliente** nel menu (non visibile ai clienti):

1. Compilare **identificazione** (nome commerciale), **anagrafica** opzionale (ragione sociale, P.IVA, CF, sede, PEC, SDI, telefono), **primo accesso** (ruolo VestiFlow, nome, email, password).
2. Opzionalmente nome negozio e location iniziale.
3. Consegnare le credenziali al titolare in modo sicuro.
4. Il titolare completa i passi Shopify sopra.

Dalla tabella **Clienti registrati** (stessa pagina) puoi aprire un tenant esistente per **modificare** anagrafica, titolare, negozio e location. L'email di accesso del titolare non si modifica da lì (Supabase Auth).

<!-- /vestiflow:exclude-in-app -->

### Location (punti di stock)

Una **location** è un luogo fisico o logico dove si contano le giacenze (negozio in centro, secondo punto vendita, magazzino, ecc.).  
Non coincide necessariamente con il "negozio" commerciale: un magazzino può esistere senza cassa.

Dopo il collegamento Shopify, **Sincronizza location** (in Impostazioni):

- **importa** le sedi presenti su Shopify che non esistono ancora in VestiFlow (nome e indirizzo);
- **collega** le location già presenti in VestiFlow a quelle Shopify (per ID o per nome uguale);
- aggiorna indirizzo e stato attivo/disattivo da Shopify.

Alla prima attivazione viene creata **una location iniziale** (es. «Negozio principale»). Se su Shopify hai già più sedi, al sync ne compariranno tutte in **Impostazioni → Location** e nel **selettore sede** in topbar.

#### Più sedi nello stesso shop Shopify

| Situazione                                                   | Comportamento VestiFlow                                                                      |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1 shop Shopify, **N location** (es. Napoli, Roma, magazzino) | **Supportato** — import e sync automatici                                                    |
| Giacenze per sede                                            | Ogni location ha stock separato (variante × location)                                        |
| Vendite POS / online                                         | Shopify scala la giacenza sulla location corretta → webhook → VestiFlow                      |
| **Più shop Shopify separati** (domini diversi)               | **Non supportato** in un unico account — ogni shop richiede un **tenant VestiFlow** dedicato |

> **Nota:** le sedi importate da Shopify sono associate allo **store** creato all'onboarding. La gestione di più store commerciali distinti in VestiFlow è prevista in un aggiornamento futuro.

---

## 6. Collegamento con Shopify

### Prerequisiti

- Avere un negozio Shopify attivo (`nome-negozio.myshopify.com`)
- Essere **titolare o amministratore** in VestiFlow
- L'app VestiFlow deve essere installata/autorizzata su Shopify Partners (gestito da VestiFlow)

### Procedura di collegamento

1. Vai in **Impostazioni**.
2. Nella sezione **Shopify**, inserisci il dominio del negozio (es. `mio-negozio.myshopify.com`).
3. Clicca **Connetti Shopify**.
4. Vieni reindirizzato alla pagina di autorizzazione Shopify: accetta i permessi richiesti.
5. Al ritorno in VestiFlow lo stato deve essere **Connesso**.

### Permessi richiesti (in sintesi)

| Area     | Permesso            | A cosa serve                                  |
| -------- | ------------------- | --------------------------------------------- |
| Catalogo | Lettura e scrittura | Push prodotti da VestiFlow; import da Shopify |
| Giacenze | Lettura e scrittura | Allineamento stock bidirezionale              |
| Location | Lettura             | Import e collegamento sedi da Shopify         |
| Ordini   | Lettura             | Import vendite online                         |
| Clienti  | Lettura             | Import anagrafica clienti                     |

Se modifichi i permessi sull'app Shopify, potrebbe essere necessario **riconnettere** il negozio.

### Dopo la connessione: tre azioni importanti

#### A) Sincronizza location

Importa e collega le **sedi** presenti su Shopify a VestiFlow.

- Al **primo collegamento** la sync parte anche automaticamente al ritorno da Shopify.
- Puoi ripeterla in qualsiasi momento se aggiungi una nuova sede su Shopify Admin.
- In **Impostazioni → Location** vedi l'elenco con **nome, indirizzo, codice** e badge **Sincronizzata** / **Non collegata**.

**Cosa fa il sync:**

1. Legge tutte le location attive (e disattive) dallo shop Shopify collegato.
2. Collega quelle già presenti in VestiFlow (stesso nome o già collegate in precedenza).
3. **Crea** in VestiFlow le sedi Shopify ancora assenti, con indirizzo importato.
4. Abilita l'allineamento giacenze per ogni coppia sede VestiFlow ↔ location Shopify.

Senza questo passaggio le variazioni giacenza da Shopify (vendite online, POS, rettifiche in Shopify Admin) **non** aggiornano correttamente il gestionale.

#### B) Attiva aggiornamenti automatici

Registra i **webhook** su Shopify affinché VestiFlow riceva in tempo reale:

- nuovi/aggiornati **prodotti**;
- variazioni **giacenze**;
- **ordini** e **clienti**.

> **Nota:** ordini e clienti possono richiedere l'approvazione "Protected customer data" su Shopify Partners. Se non approvato, catalogo e giacenze funzionano comunque; vendite e clienti potrebbero non arrivare automaticamente.

#### C) Importa catalogo da Shopify

Scarica **tutti i prodotti** già presenti su Shopify nel gestionale.  
Utile al primo collegamento o per un allineamento manuale completo.

> **Tempo di attesa:** con cataloghi grandi l'import può richiedere **diversi minuti**. Resta sulla pagina finché compare il messaggio di esito (vedi [Indicatori di avanzamento](#indicatori-di-avanzamento-loader)). Non premere più volte il pulsante.

### Schermata «Integrazione Shopify» (dopo il collegamento)

Quando il negozio è **Connesso**, la sezione mostra:

| Elemento                     | Significato                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **Badge Connesso**           | OAuth attivo; il server può chiamare Shopify per conto tuo                           |
| **Dominio shop**             | Negozio collegato (es. `mio-negozio.myshopify.com`)                                  |
| **Nome shop / Versione API** | Dati letti da Shopify al momento della connessione                                   |
| **Ultima connessione**       | Quando hai autorizzato l'app l'ultima volta                                          |
| **Ultimo sync**              | Ultimo evento di sync riuscito (webhook o operazione manuale)                        |
| **Location collegate**       | Quante sedi VestiFlow sono mappate su Shopify (Attivo / Da fare)                     |
| **Aggiornamenti automatici** | Webhook attivi per ordini, clienti, prodotti, giacenze (Attivo / Parziale / Da fare) |

### Accesso a Shopify — «Lettura» e «Scrittura»

Sotto **Accesso a Shopify** ogni riga corrisponde a **un permesso OAuth** concesso al collegamento, non a un modulo generico dell'app.

| Voce in elenco                                      | Badge tipico | Significato operativo                                                |
| --------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| **Clienti ecommerce**                               | Lettura      | VestiFlow importa l'anagrafica da Shopify; non modifica i clienti lì |
| **Ordini online**                                   | Lettura      | Riceve vendite e aggiornamenti ordini via webhook                    |
| **Location**                                        | Lettura      | Importa e aggiorna le sedi da Shopify                                |
| **Giacenze** (riga «Legge quantità…»)               | Lettura      | Legge stock per location da Shopify                                  |
| **Giacenze** (riga «Aggiorna quantità…»)            | Scrittura    | Invia carichi, rettifiche e allineamenti verso Shopify               |
| **Catalogo prodotti** (riga «Legge prodotti…»)      | Lettura      | **Obbligatorio per import catalogo** — legge prodotti e varianti     |
| **Catalogo prodotti** (riga «Pubblica e aggiorna…») | Scrittura    | Invia prodotti creati o modificati in VestiFlow verso Shopify        |

È **normale e corretto** che alcune aree abbiano **solo Lettura** (clienti, ordini, location) e che **Giacenze** e **Catalogo prodotti** compaiano **due volte** (Lettura + Scrittura).  
Se manca la riga **Catalogo prodotti → Lettura**, l'import catalogo è bloccato: vedi [Permessi mancanti (read_products)](#permessi-mancanti-read_products).

### Pulsanti di sincronizzazione

| Pulsante                               | Cosa fa                                               | Quando usarlo                                                   |
| -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| **Sincronizza location**               | Importa/collega le sedi da Shopify                    | Primo setup, nuova sede su Shopify Admin                        |
| **Attiva aggiornamenti automatici**    | Registra i webhook su Shopify                         | Dopo connessione o cambio permessi app                          |
| **Disattiva aggiornamenti automatici** | Rimuove i webhook; VestiFlow ignora nuovi eventi      | Manutenzione, debug, negozio in pausa                           |
| **Importa catalogo da Shopify**        | Scarica tutti i prodotti nello shop collegato         | Primo setup, allineamento totale, prodotti nati solo su Shopify |
| **Ripristina connessione**             | Azzera errori di sync locali se OAuth è ancora valido | Badge errore o messaggi stale ma negozio funzionante            |
| **Disconnetti Shopify**                | Revoca il token OAuth e rimuove il collegamento       | Cambio shop, reset permessi, disinstallazione                   |

Solo **titolare** e **amministratore** vedono questi pulsanti.

### Indicatori di avanzamento (loader)

Quando premi un pulsante di sync (location, catalogo, webhook, disconnessione, ripristino):

1. Il **pulsante premuto** mostra un **spinner** e si disabilita finché l'operazione non termina.
2. Sopra i pulsanti compare un **riquadro con messaggio** (es. «Import catalogo da Shopify in corso…»).
3. Al termine il riquadro scompare e compare un **messaggio di esito** verde (ok) o giallo (parziale/attenzione), che puoi chiudere.

**Cosa fare durante l'attesa**

- Resta sulla pagina Impostazioni (o almeno non chiudere il browser).
- **Non cliccare di nuovo** lo stesso pulsante: le richieste duplicate non accelerano l'operazione e possono peggiorare i tempi (vedi limiti API sotto).
- Per l'**import catalogo**, cataloghi con centinaia di prodotti possono richiedere **5–15 minuti** o più: è atteso.

Dopo un import catalogo riuscito, la **lista Prodotti** si aggiorna automaticamente quando torni su quella sezione (senza refresh manuale della pagina).

### Ripristina connessione

Compare se la connessione segnala **Errore** o un **messaggio di avviso** persistente, ma il negozio Shopify è ancora raggiungibile.

- **Non** rifà l'OAuth: non serve reinserire il dominio.
- Azzera stati di errore locali su prodotti/location e ripristina lo stato **Connesso** se le credenziali sul server sono ancora valide.
- Utile dopo un webhook fallito temporaneamente o un deploy dell'API.

Se il problema è sui **permessi OAuth** (manca `read_products`), serve invece **disinstallare l'app** dall'admin Shopify, **disconnettere** e **riconnettere** — non basta «Ripristina connessione».

### Disattiva aggiornamenti automatici

Disattivare i webhook **non** cancella i dati già importati. Da quel momento:

- VestiFlow **non** riceve più ordini, clienti, prodotti e giacenze in tempo reale.
- Puoi ancora usare **Importa catalogo** e **Sincronizza location** manualmente.
- I prodotti modificati su Shopify mentre i webhook erano spenti **non** compaiono da soli: serve un nuovo import o riattivare gli aggiornamenti automatici.

### Limiti delle chiamate API Shopify

Shopify applica un **limite al numero di richieste** che un'app può fare al minuto/secondo verso ogni negozio (piano **Basic**: circa **2 richieste al secondo** in media, con un «secchio» che si riempie e si svuota).

VestiFlow **non** invia chiamate dal browser: tutto passa dal **server** (Railway), che applica automaticamente:

| Comportamento                                      | A cosa serve                                                                                                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intervallo minimo tra richieste**                | Evita di superare il limite durante sync e import                                                                                                                                                                                |
| **Lettura header «secchio pieno»**                 | Se Shopify segnala che il limite è quasi esaurito, il server **aspetta** prima di continuare                                                                                                                                     |
| **Retry automatico su errore 429**                 | Se Shopify risponde «troppo veloce», il server riprova con attesa crescente (fino a 5 tentativi)                                                                                                                                 |
| **Un solo import catalogo per negozio alla volta** | Se l'import è già avviato, una seconda richiesta **si unisce** alla stessa operazione invece di duplicarla                                                                                                                       |
| **Import catalogo «leggero»**                      | Durante l'import massivo non vengono scaricati subito tutti i metadati extra (collezioni, metafield, costi) per ogni prodotto, per ridurre le chiamate; i dati essenziali (titolo, varianti, SKU, prezzi, tag) restano importati |

**In pratica per chi usa il gestionale**

1. **Un'operazione alla volta** — attendi la fine di «Importa catalogo» prima di lanciare altre sync pesanti sullo stesso negozio.
2. **Messaggio «Shopify ha limitato temporaneamente le richieste»** — attendi 1–2 minuti e riprova; non spamare il pulsante.
3. **Catalogo grande = tempi lunghi** — non è un blocco: il loader e il banner indicano che il lavoro è in corso.
4. **Più utenti sullo stesso tenant** — condividono lo stesso limite verso Shopify; evitare import simultanei da più postazioni.

I dettagli tecnici (variabili server) sono in [§16 — Rate limiting Shopify](#rate-limiting-shopify-lato-server).

### Permessi mancanti (read_products)

Se compare un avviso che **manca `read_products`** (o l'import catalogo è bloccato):

1. In **Dev Dashboard Shopify** (app VestiFlow) verifica che la **versione attiva** includa `read_products` e `read_inventory`, non solo `write_*`.
2. Su **Railway**, `SHOPIFY_API_KEY` deve coincidere **carattere per carattere** con il Client ID dell'app.
3. **Disinstalla** VestiFlow dall'admin del negozio (Impostazioni → App).
4. In VestiFlow: **Disconnetti**, poi **Connetti** di nuovo.
5. Controlla che in **Accesso a Shopify** compaia **Catalogo prodotti → Lettura**.

La schermata mostra anche **Ambiti richiesti dal server** vs **Ambiti concessi dal negozio** per capire se il problema è configurazione server o autorizzazione Shopify.

### Disconnessione

In Impostazioni puoi **Disconnetti Shopify**. Il server **revoca** il token su Shopify (non basta rimuovere i dati locali). I dati già importati restano in VestiFlow; la sync si interrompe fino a una nuova connessione OAuth.

---

## 7. Sincronizzazione dati: cosa va dove

Regola fondamentale: con Shopify connesso, ogni tipo di dato ha un **proprietario** della sincronizzazione.

| Dato                         | Chi comanda               | In VestiFlow                     | Verso Shopify                                            |
| ---------------------------- | ------------------------- | -------------------------------- | -------------------------------------------------------- |
| **Prodotti / varianti**      | Condiviso (write-through) | Crei e modifichi                 | Push automatico al salvataggio                           |
| **Prodotti nati su Shopify** | Shopify                   | Import / webhook                 | —                                                        |
| **Immagini prodotto**        | Condiviso                 | Carichi nel wizard               | Push verso Shopify                                       |
| **Giacenze**                 | Condiviso                 | Carichi, scarichi, rettifiche    | Push; vendite Shopify → webhook                          |
| **Ordini fornitori**         | Solo VestiFlow            | CRUD completo                    | Non sincronizzati                                        |
| **Vendite (online + POS)**   | Shopify                   | Sola lettura                     | Import webhook                                           |
| **Clienti ecommerce**        | Shopify                   | Sola lettura                     | Import webhook                                           |
| **Location**                 | Shopify (sedi master)     | Import automatico + collegamento | Lettura da Shopify; push giacenze verso location mappate |

### Sync manuale (quando usarla)

| Azione                                 | Dove               | Quando                                                    |
| -------------------------------------- | ------------------ | --------------------------------------------------------- |
| **Importa catalogo da Shopify**        | Impostazioni       | Primo setup, allineamento totale                          |
| **Disattiva aggiornamenti automatici** | Impostazioni       | Pausa sync realtime, manutenzione                         |
| **Ripristina connessione**             | Impostazioni       | Errore stale con OAuth ancora valido                      |
| **Sincronizza location**               | Impostazioni       | Primo setup, nuova sede su Shopify, verifica collegamenti |
| **Sincronizza con Shopify**            | Dettaglio prodotto | Prodotto non aggiornato, errore sync                      |
| **Attiva aggiornamenti automatici**    | Impostazioni       | Dopo cambio permessi app Shopify                          |

### Badge sync sui prodotti

Nel dettaglio prodotto compare lo stato Shopify:

| Badge                | Significato                                          |
| -------------------- | ---------------------------------------------------- |
| **Sincronizzato**    | Prodotto collegato e ultimo push riuscito            |
| **Da sincronizzare** | Modifiche locali non ancora inviate                  |
| **Errore sync**      | Ultimo invio fallito — usa "Sincronizza con Shopify" |
| **Non collegato**    | Shopify non connesso o prodotto mai sincronizzato    |

---

## 8. Prodotti e catalogo

### Concetti base

- **Prodotto** = scheda di catalogo (nome, brand, categoria, stagione, descrizione).
- **Variante** = unità minima di vendita e inventario (es. Taglia M + Colore Rosso).
- Ogni variante ha **SKU univoco** (obbligatorio), prezzo di vendita, barcode opzionale.

Lo **stock non vive sul prodotto**: vive per **variante × location** (vedi Magazzino).

### Creare un prodotto (wizard)

1. **Prodotti → Nuovo prodotto**
2. **Dati generali** — nome, brand, categoria, stagione, stato, descrizione, **immagini**
3. **Opzioni** — assi varianti (es. Taglia, Colore); VestiFlow genera le combinazioni
4. **Varianti** — SKU, prezzi, barcode per ogni combinazione
5. **Riepilogo** — controlla e **Crea prodotto**

> **Categoria e stagione:** puoi digitare liberamente i valori; con prodotti già presenti compaiono suggerimenti.

> **Immagini:** JPEG, PNG o WebP, max 5 MB ciascuna. Dopo il salvataggio vengono inviate a Shopify se connesso.

### Modificare un prodotto

Dalla lista → prodotto → **Modifica**. Le modifiche al salvataggio vengono **inviate a Shopify** se il negozio è connesso.

### Eliminare un prodotto

Solo **titolare/amministratore**. Azione irreversibile: richiede conferma.

### Import da Shopify

Prodotti creati **solo su Shopify** compaiono in VestiFlow dopo:

- **Importa catalogo da Shopify** (Impostazioni), oppure
- webhook automatici (se attivati).

### Import ed export CSV (catalogo)

| Azione                          | Dove                            | Cosa fa                                                                                  |
| ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| **Esporta CSV**                 | Prodotti (lista)                | Scarica catalogo con SKU, varianti, prezzi e metadati principali                         |
| **Importa CSV**                 | Prodotti → Importa CSV          | Carica prodotti/varianti da foglio di calcolo (controlla il template indicato in pagina) |
| **Importa catalogo da Shopify** | Prodotti (lista) o Impostazioni | Sync massiva da shop collegato (non è un CSV locale)                                     |

L'export CSV è utile per backup, analisi in Excel o preparazione di import controllati. L'import CSV **non** sostituisce il sync Shopify: usa il percorso adatto al tuo flusso (CSV manuale vs allineamento ecommerce).

---

## 9. Magazzino e giacenze

### Tab Magazzino

Nelle pagine del magazzino, i **tab** in alto permettono di passare tra:

| Tab                   | Percorso                   | Funzione                                                              |
| --------------------- | -------------------------- | --------------------------------------------------------------------- |
| **Giacenze**          | `/app/inventory`           | Tabella livelli stock per location, filtri, soglie, export/import CSV |
| **Cerca**             | `/app/inventory/lookup`    | Ricerca rapida SKU/barcode — ottimizzata per smartphone               |
| **Movimenti**         | `/app/inventory/movements` | Storico carichi, scarichi, trasferimenti, rettifiche                  |
| **Inventario fisico** | `/app/inventory/counts`    | Sessioni di conteggio periodico con chiusura e rettifiche             |

### Azioni principali (pagina Giacenze)

| Pulsante                            | Funzione                                                         |
| ----------------------------------- | ---------------------------------------------------------------- |
| **Sincronizza giacenze da Shopify** | Allinea le quantità da Shopify (titolare/admin, shop connesso)   |
| **Esporta CSV**                     | Scarica giacenze (SKU, location, quantità)                       |
| **Importa CSV**                     | Carica rettifiche da file con colonne SKU, Location, Disponibile |
| **Registra movimento**              | Apre il form per carico/scarico/trasferimento/rettifica          |

### Sezioni Magazzino (dettaglio)

| Tab / pagina          | Funzione                                                          |
| --------------------- | ----------------------------------------------------------------- |
| **Giacenze**          | Tabella livelli stock per location, filtri e soglie               |
| **Cerca giacenza**    | Ricerca rapida per SKU o barcode — ottimizzata per smartphone     |
| **Movimenti**         | Storico di carichi, scarichi, trasferimenti, rettifiche           |
| **Inventario fisico** | Conteggio periodico in negozio/magazzino con chiusura controllata |
| **Nuovo movimento**   | Registra un'operazione inventariale (da Giacenze o Movimenti)     |

### Inventario fisico (conteggio)

Serve per il **conteggio periodico** (es. annuale o spot): confronti quantità di sistema vs quantità contate in negozio.

1. **Magazzino → Inventario fisico → Nuova sessione** — scegli location e avvia.
2. Durante la sessione inserisci le quantità contate per variante (anche con **scanner barcode** dove supportato).
3. In **revisione** controlli le differenze rispetto al sistema.
4. Alla **chiusura** VestiFlow genera **rettifiche tracciate** e aggiorna le giacenze (con push verso Shopify se configurato).

Ogni sessione resta nello storico con operatore, data e location.

### Import giacenze da CSV

1. **Magazzino → Giacenze → Importa CSV** (o `/app/inventory/import`).
2. Prepara un file con colonne **SKU**, **Location** (nome esatto come in Impostazioni), **Disponibile**.
3. Carica il file: l'anteprima segnala errori (SKU sconosciuto, location errata, righe duplicate).
4. Conferma l'import: ogni riga valida produce una **rettifica** con traccia nello storico movimenti.

Usa questo strumento per allineamenti massivi dopo un inventario cartaceo o migrazione dati — non per vendite quotidiane (quelle arrivano da Shopify POS/online).

### Export giacenze CSV

Da **Giacenze → Esporta CSV** ottieni uno snapshot delle quantità per SKU e location, rispettando i filtri attivi (location, stato stock, ricerca).

### Tipi di movimento

| Tipo              | Uso                                             |
| ----------------- | ----------------------------------------------- |
| **Carico**        | Merce arrivata (fornitore, reso, ecc.)          |
| **Scarico**       | Uscita merce (danneggiata, campionario, ecc.)   |
| **Trasferimento** | Spostamento tra due location                    |
| **Rettifica**     | Correzione quantità con **motivo obbligatorio** |

Ogni movimento genera una **riga nello storico** con operatore, data, quantità e origine (gestionale o Shopify).

### Ricerca con barcode (mobile)

1. Apri **Magazzino** (Cerca giacenza).
2. Usa la **fotocamera** per scansionare il barcode (se il browser lo supporta) oppure digita SKU/barcode manualmente.
3. Visualizzi giacenze per location e prezzo.

### Installazione PWA da questa pagina

Su smartphone, la pagina **Cerca giacenza** può mostrare il prompt **Installa app** per aggiungere VestiFlow alla home del telefono.

### Sync giacenze con Shopify

- Movimenti registrati in VestiFlow → **push** verso Shopify (location mappate, variante collegata).
- Vendite o rettifiche su Shopify → **webhook** aggiorna VestiFlow con movimento origine "Shopify".
- Con **più sedi**, ogni location VestiFlow sincronizzata corrisponde a una location Shopify: le giacenze restano separate per sede. Usa il **selettore location** in topbar per filtrare le viste operative.

---

## 10. Ordini fornitori

Gestiti **interamente in VestiFlow** (non passano da Shopify).

### Flusso tipico

1. **Ordini Fornitori → Nuovo ordine** — fornitore, righe (variante, quantità, prezzo acquisto)
2. **Invia ordine** — cambia stato (tracciamento interno)
3. All'arrivo merce: **Ricevi ordine** — incrementa giacenze e crea movimenti di carico

### Chi può fare cosa

- Creazione e modifica: **manager** e superiori
- Ricezione merce: utenti autenticati del tenant (verifica con il titolare le policy interne)

---

## 11. Vendite e clienti (Shopify)

### Vendite

- Origine: **Shopify Online** o **Shopify POS** (cassa Shopify).
- In VestiFlow sono **sola lettura**: non si modificano da qui.
- Filtri disponibili: stato pagamento, canale (online / negozio), ricerca per numero ordine o cliente.

| Azione                             | Dove            | Chi                                      |
| ---------------------------------- | --------------- | ---------------------------------------- |
| **Sincronizza vendite da Shopify** | Vendite (lista) | Titolare / amministratore, shop connesso |
| **Esporta CSV**                    | Vendite (lista) | Titolare, admin, manager                 |

La sync manuale importa ordini non ancora presenti o aggiorna quelli esistenti. L'export CSV rispetta i filtri applicati in lista.

### Clienti

- Anagrafica importata da Shopify.
- **Sola lettura** in VestiFlow.
- Utile per consultare storico e riferimenti; le modifiche vanno fatte in Shopify Admin.

| Azione                             | Dove            | Chi                                      |
| ---------------------------------- | --------------- | ---------------------------------------- |
| **Sincronizza clienti da Shopify** | Clienti (lista) | Titolare / amministratore, shop connesso |
| **Esporta CSV**                    | Clienti (lista) | Titolare, admin, manager                 |

Il dettaglio cliente mostra email, telefono, indirizzo e badge **Shopify** se collegato all'ecommerce.

---

## 12. Report e dashboard

### Dashboard

Pagina iniziale dopo il login: riepilogo vendite recenti e indicatori sintetici.

### Report

Tabelle e KPI calcolati sui dati del gestionale (prodotti, giacenze, ordini).  
In evoluzione: report server-side dedicati per dataset molto grandi.

---

## 13. App PWA: installazione su smartphone

VestiFlow è una **Progressive Web App (PWA)**: si usa dal browser ma può essere **installata** come app sulla home del telefono, senza App Store.

### Vantaggi

- Icona dedicata sulla home
- Apertura a schermo intero (senza barra del browser)
- Aggiornamenti automatici con banner "Nuova versione disponibile"

### Come installare

**Android (Chrome):**

1. Apri VestiFlow in Chrome.
2. Vai in **Magazzino → Cerca giacenza** (può comparire il banner installazione).
3. Oppure: menu browser → **Aggiungi a schermata Home** / **Installa app**.

**iPhone (Safari):**

1. Apri VestiFlow in Safari.
2. Tocca **Condividi** → **Aggiungi a Home**.

### Limitazioni PWA

- Richiede connessione internet per i dati (non è un gestionale offline completo).
- La scansione barcode funziona meglio su **Chrome/Android**; su iOS il fallback manuale è sempre disponibile.
- Orientamento consigliato: **verticale** (portrait).

---

## 14. Cassa, POS e negozio fisico

### Cosa VestiFlow fa oggi

VestiFlow **non include una cassa nativa** né un registratore di corrispettivi italiano.

Il collegamento con il **punto vendita fisico** avviene tramite **Shopify POS**:

| Componente      | Ruolo                                                               |
| --------------- | ------------------------------------------------------------------- |
| **Shopify POS** | App cassa su tablet/iPhone per vendite in negozio                   |
| **VestiFlow**   | Riceve le vendite POS come ordini in **Vendite** (canale "Negozio") |
| **Giacenze**    | Le vendite POS scalano stock su Shopify → webhook → VestiFlow       |

### Flusso vendita in negozio (con Shopify POS)

```
Cliente paga in negozio (Shopify POS)
        ↓
Shopify aggiorna giacenza
        ↓
Webhook → VestiFlow (movimento + ordine vendita)
        ↓
Consultabile in Vendite e Magazzino
```

### Cosa NON fa VestiFlow (oggi)

- Non gestisce pagamenti con carta/contanti direttamente
- Non emette scontrini fiscali / corrispettivi (competenza del sistema POS/fiscale collegato a Shopify o altro)
- Non sostituisce software cassa italiano certificato

### Scenario consigliato per boutique

1. **Shopify** = ecommerce + POS negozio
2. **VestiFlow** = magazzino, acquisti, catalogo operativo, controllo giacenze
3. **Contabile / fiscalità** = strumenti dedicati integrati o parallelamente a Shopify

---

## 15. Sicurezza account (MFA)

La **verifica in due passaggi (MFA)** protegge l'account anche se la password viene compromessa.

### Attivazione

1. **Impostazioni → Sicurezza account**
2. Segui la procedura con app authenticator (Google Authenticator, Authy, ecc.)
3. Al prossimo login: password + codice a 6 cifre

Consigliato per **titolari e amministratori**.

---

<!-- vestiflow:exclude-in-app -->

_Appendice riservata al PDF / operatori — non mostrata nella guida in-app._

## 16. Configurazione tecnica (riferimento)

Questa sezione è per titolari tecnici e per l'operatore VestiFlow. **Il cliente finale di norma non deve fare nulla qui.**

### Architettura (un tenant = un negozio cliente)

Ogni **tenant** VestiFlow corrisponde a **un'azienda cliente** e a **un solo shop Shopify** collegato.  
All'interno di quello shop puoi avere **più location** (sedi fisiche): VestiFlow le importa e le gestisce separatamente.

| Componente                             | Funzione                                            |
| -------------------------------------- | --------------------------------------------------- |
| **Frontend**                           | App Angular su Firebase App Hosting                 |
| **Backend API**                        | NestJS su Railway                                   |
| **Database + Auth + Storage immagini** | Supabase (PostgreSQL, Auth, bucket `product-media`) |
| **E-commerce**                         | Shopify (OAuth, webhook, Admin API)                 |

### Cosa è condiviso tra tutti i clienti

Un solo progetto Supabase, un solo servizio Railway, un'app Shopify Partners — i dati sono isolati per **tenant** (multi-tenant).

### Cosa fa ogni nuovo cliente

1. Creazione tenant (operatore VestiFlow o procedura interna)
2. Login titolare
3. Collegamento **del proprio** negozio Shopify
4. Sync location + webhook + import catalogo

**Non** serve un nuovo Supabase o Railway per ogni boutique.  
Se un titolare possiede **due shop Shopify distinti** (due domini), servono **due tenant** VestiFlow separati.

### Bucket immagini Supabase

Per caricare foto dal gestionale il progetto Supabase deve avere un bucket public **`product-media`**. Configurazione una tantum a cura dell'operatore VestiFlow.

### Rate limiting Shopify (lato server)

Il backend VestiFlow regola tutte le chiamate **REST Admin API** verso ogni shop. Il frontend **non** contatta mai Shopify direttamente.

| Variabile (Railway / `api/.env`)    | Default             | Effetto                                                                                |
| ----------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `SHOPIFY_API_MIN_INTERVAL_MS`       | `550`               | Pausa minima tra due richieste consecutive (~1,8 req/s, sotto il limite Basic 2/s)     |
| `SHOPIFY_API_MAX_RETRIES`           | `5`                 | Tentativi su risposta HTTP **429 Too Many Requests**                                   |
| `SHOPIFY_API_BUCKET_HIGH_WATERMARK` | `0.85`              | Se l'header `X-Shopify-Shop-Api-Call-Limit` indica ≥85% del secchio usato, pausa breve |
| `SHOPIFY_API_BUCKET_PAUSE_MS`       | `1000`              | Durata della pausa quando il secchio è quasi pieno                                     |
| `SHOPIFY_SCOPES`                    | vedi `.env.example` | Ambiti richiesti in OAuth; devono essere ⊆ versione attiva app Partners                |

**Note operative**

- Il rate limiter è **per processo**: con più repliche Railway ogni istanza ha il proprio contatore (comportamento conservativo).
- L'**import catalogo** usa enrichment ridotto (`skipRemoteMetadata`) per limitare le chiamate per prodotto; metadati avanzati possono essere arricchiti in sync successive.
- In **disconnessione**, VestiFlow **revoca** il token OAuth su Shopify così la riconnessione richiede permessi aggiornati.
- Dopo OAuth il server legge gli scope effettivi da Shopify (`access_scopes`) oltre alla risposta token, per diagnostica più accurata in Impostazioni.

<!-- /vestiflow:exclude-in-app -->

---

## 17. Domande frequenti e risoluzione problemi

### Il prodotto creato in VestiFlow non compare su Shopify

1. Impostazioni → Shopify è **Connesso**?
2. Permesso **Catalogo: scrittura** attivo? (riconnetti se hai cambiato scope)
3. Dettaglio prodotto → badge sync: c'è **Errore**?
4. Prova **Sincronizza con Shopify** nel dettaglio prodotto

### Il prodotto su Shopify non compare in VestiFlow

1. **Importa catalogo da Shopify** in Impostazioni (attendi la fine del loader)
2. Verifica che **Aggiornamenti automatici** sia attivo (webhook prodotti)
3. Controlla che **Catalogo prodotti → Lettura** sia presente in Accesso a Shopify

### L'import catalogo impiega molto tempo o sembra bloccato

- È **normale** con molti prodotti: ogni articolo richiede almeno una chiamata API e il server rispetta i limiti Shopify.
- Verifica il **banner** «Import catalogo da Shopify in corso…» e lo **spinner** sul pulsante.
- **Non** premere di nuovo il pulsante finché non compare il messaggio di esito.
- Se compare «Shopify ha limitato temporaneamente le richieste», attendi 1–2 minuti e riprova una sola volta.

### Messaggio su permessi read_products

Vedi [Permessi mancanti (read_products)](#permessi-mancanti-read_products). Di solito serve riconnessione OAuth dopo aver verificato app Partners e `SHOPIFY_API_KEY` su Railway.

### Ho più negozi / sedi: le vedo tutte in VestiFlow?

**Sì**, se intendi **più location nello stesso shop Shopify** (es. due punti vendita + magazzino):

1. Configura le sedi in **Shopify Admin → Impostazioni → Location**.
2. In VestiFlow vai in **Impostazioni → Sincronizza location**.
3. Controlla **Impostazioni → Location** e il **selettore sede** in topbar: devono comparire tutte le sedi importate.

Se invece hai **due shop Shopify completamente separati** (due domini `*.myshopify.com`), oggi servono **due account VestiFlow** (due tenant). Contatta l'operatore VestiFlow per il secondo tenant.

### Le giacenze non si allineano

1. Hai fatto **Sincronizza location**?
2. In **Impostazioni → Location** ogni sede usata ha badge **Sincronizzata**?
3. La variante ha SKU collegato a Shopify (prodotto nato in VF e pushato)?
4. Controlla movimenti: origine **Shopify** vs gestionale
5. Se hai più sedi, verifica di aver selezionato la **location corretta** in topbar

### L'upload immagine fallisce

1. Formato JPEG/PNG/WebP, max 5 MB
2. Bucket Supabase `product-media` creato e public
3. Riprova dopo qualche minuto se il server era in deploy

### Vendite o clienti non arrivano

Probabilmente manca approvazione **Protected customer data** su Shopify Partners. Catalogo e giacenze non dipendono da questo.

### Non riesco a connettere Shopify

- Verifica dominio `*.myshopify.com`
- Devi essere **titolare o admin** in VestiFlow
- Controlla che l'URL API Railway sia raggiungibile (problema temporaneo hosting)

---

## 18. Funzionalità in arrivo

| Area                                                       | Stato                             |
| ---------------------------------------------------------- | --------------------------------- |
| Gestione multi-store (più negozi commerciali in un tenant) | In roadmap                        |
| Creazione manuale location senza Shopify                   | In roadmap                        |
| Report aggregati lato server                               | In roadmap                        |
| Scanner barcode su più schermate                           | In roadmap                        |
| Export/import CSV catalogo e giacenze                      | **Attivo**                        |
| Sync manuale vendite/clienti/giacenze dalle liste          | **Attivo**                        |
| Inventario fisico (sessioni di conteggio)                  | **Attivo**                        |
| Guida integrata nel menu **Guida**                         | **Attivo**                        |
| Anagrafica tenant estesa (operatore piattaforma)           | **Attivo** (solo admin VestiFlow) |
| Messaggi errore Shopify tradotti in italiano               | Attivo (sync, OAuth, import)      |
| Loader e feedback operazioni sync in Impostazioni          | Attivo                            |
| Diagnostica scope OAuth (richiesti vs concessi)            | Attivo                            |
| Integrazione cassa nativa / fiscale IT                     | Non prevista — usare Shopify POS  |
| Notifiche email personalizzate (reset password IT)         | Configurazione Supabase           |
| Permessi per ruolo in interfaccia (pulsanti e route)       | **Attivo**                        |

---

## 19. Guida integrata nel gestionale

Oltre a questo documento PDF, VestiFlow include la **Guida** nel menu laterale (`/app/guide`):

- spiega **ogni voce di menu** e le schermate principali;
- descrive **configurazione Shopify**, location, sync e permessi;
- illustra **prodotti, magazzino, ordini fornitori, vendite, clienti, report** passo passo.

La guida in-app è pensata per **titolari e staff del negozio**: non include la creazione di nuovi clienti VestiFlow (operazione riservata all'operatore piattaforma).

Usa l'**Indice** all'inizio del documento per saltare alle sezioni. In alto puoi anche **scaricare la versione PDF** completa (include l'appendice tecnica per operatori).

---

<!-- vestiflow:exclude-in-app -->

## Contatti e supporto

Per assistenza su configurazione, onboarding o problemi di sync, contatta il tuo **referente VestiFlow** o l'operatore che ha attivato il tenant.

<!-- /vestiflow:exclude-in-app -->
