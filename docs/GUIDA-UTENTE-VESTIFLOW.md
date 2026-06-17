# VestiFlow — Guida completa al gestionale

**Versione documento:** 1.1 — Giugno 2026  
**Destinatari:** titolari di negozio, responsabili magazzino, amministratori  
**Prodotto:** VestiFlow — gestionale web multi-negozio per boutique di abbigliamento, integrato con Shopify

---

## Indice

1. [Cos'è VestiFlow](#1-cosè-vestiflow)
2. [Come accedere al gestionale](#2-come-accedere-al-gestionale)
3. [Panoramica dell'interfaccia](#3-panoramica-dellinterfaccia)
4. [Ruoli utente e permessi](#4-ruoli-utente-e-permessi)
5. [Configurazione iniziale del negozio](#5-configurazione-iniziale-del-negozio)
6. [Collegamento con Shopify](#6-collegamento-con-shopify)
7. [Sincronizzazione dati: cosa va dove](#7-sincronizzazione-dati-cosa-va-dove)
8. [Prodotti e catalogo](#8-prodotti-e-catalogo)
9. [Magazzino e giacenze](#9-magazzino-e-giacenze)
10. [Ordini fornitori](#10-ordini-fornitori)
11. [Vendite e clienti (Shopify)](#11-vendite-e-clienti-shopify)
12. [Report e dashboard](#12-report-e-dashboard)
13. [App PWA: installazione su smartphone](#13-app-pwa-installazione-su-smartphone)
14. [Cassa, POS e negozio fisico](#14-cassa-pos-e-negozio-fisico)
15. [Sicurezza account (MFA)](#15-sicurezza-account-mfa)
16. [Configurazione tecnica (riferimento)](#16-configurazione-tecnica-riferimento)
17. [Domande frequenti e risoluzione problemi](#17-domande-frequenti-e-risoluzione-problemi)
18. [Funzionalità in arrivo](#18-funzionalità-in-arrivo)

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

| Voce menu            | Funzione                                          |
| -------------------- | ------------------------------------------------- |
| **Dashboard**        | Riepilogo attività e indicatori principali        |
| **Prodotti**         | Catalogo, creazione e modifica prodotti           |
| **Magazzino**        | Ricerca giacenze (punto di ingresso mobile)       |
| **Ordini Fornitori** | Ordini di acquisto dai fornitori                  |
| **Vendite**          | Ordini di vendita (da Shopify, sola lettura)      |
| **Clienti**          | Anagrafica clienti (da Shopify, sola lettura)     |
| **Report**           | Indicatori e tabelle riepilogative                |
| **Impostazioni**     | Shopify, location, tema, sicurezza account        |
| **Nuovo cliente**    | Solo operatori VestiFlow — creazione nuovo tenant |

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

Ogni utente appartiene a un **tenant** (la tua azienda/negozio) e ha un **ruolo**.

| Ruolo                      | Descrizione tipica                | Permessi principali                        |
| -------------------------- | --------------------------------- | ------------------------------------------ |
| **Titolare (owner)**       | Proprietario del negozio          | Accesso completo, connessione Shopify, MFA |
| **Amministratore (admin)** | Store manager, IT                 | Come titolare su configurazione e Shopify  |
| **Manager**                | Responsabile magazzino / acquisti | Prodotti, magazzino, ordini fornitori      |
| **Commesso (clerk)**       | Operatore negozio                 | Consultazione e operazioni magazzino base  |

### Operazioni riservate a titolare e amministratore

- Collegare / disconnettere **Shopify**
- **Sincronizzare location** e **attivare aggiornamenti automatici**
- **Importare catalogo** da Shopify
- **Eliminare prodotti**
- Gestire **MFA** (verifica in due passaggi)

### Nota importante

I controlli in interfaccia **migliorano l'esperienza** ma la sicurezza reale è garantita dal **server**. Non condividere le credenziali tra più persone: creare un account per ogni operatore.

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

### Per l'operatore VestiFlow (onboarding nuovo cliente)

Gli operatori autorizzati vedono **Nuovo cliente** nel menu:

1. Compilare nome tenant, email e password del titolare.
2. Opzionalmente nome negozio e location iniziale.
3. Consegnare le credenziali al cliente in modo sicuro.
4. Il cliente completa i passi Shopify sopra.

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

### Disconnessione

In Impostazioni puoi **Disconnetti Shopify**. I dati già importati restano in VestiFlow; la sync si interrompe fino a una nuova connessione.

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

| Azione                              | Dove               | Quando                                                    |
| ----------------------------------- | ------------------ | --------------------------------------------------------- |
| **Importa catalogo da Shopify**     | Impostazioni       | Primo setup, allineamento totale                          |
| **Sincronizza location**            | Impostazioni       | Primo setup, nuova sede su Shopify, verifica collegamenti |
| **Sincronizza con Shopify**         | Dettaglio prodotto | Prodotto non aggiornato, errore sync                      |
| **Attiva aggiornamenti automatici** | Impostazioni       | Dopo cambio permessi app Shopify                          |

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

---

## 9. Magazzino e giacenze

### Sezioni Magazzino

| Tab / pagina        | Funzione                                                      |
| ------------------- | ------------------------------------------------------------- |
| **Cerca giacenza**  | Ricerca rapida per SKU o barcode — ottimizzata per smartphone |
| **Giacenze**        | Tabella livelli stock per location, filtri e soglie           |
| **Movimenti**       | Storico di carichi, scarichi, trasferimenti, rettifiche       |
| **Nuovo movimento** | Registra un'operazione inventariale                           |

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
- Filtri disponibili: stato pagamento, canale (online / negozio).

### Clienti

- Anagrafica importata da Shopify.
- **Sola lettura** in VestiFlow.
- Utile per consultare storico e riferimenti; le modifiche vanno fatte in Shopify Admin.

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

---

## 17. Domande frequenti e risoluzione problemi

### Il prodotto creato in VestiFlow non compare su Shopify

1. Impostazioni → Shopify è **Connesso**?
2. Permesso **Catalogo: scrittura** attivo? (riconnetti se hai cambiato scope)
3. Dettaglio prodotto → badge sync: c'è **Errore**?
4. Prova **Sincronizza con Shopify** nel dettaglio prodotto

### Il prodotto su Shopify non compare in VestiFlow

1. **Importa catalogo da Shopify** in Impostazioni
2. Verifica che **Aggiornamenti automatici** sia attivo (webhook prodotti)

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

| Area                                                       | Stato                            |
| ---------------------------------------------------------- | -------------------------------- |
| Gestione multi-store (più negozi commerciali in un tenant) | In roadmap                       |
| Creazione manuale location senza Shopify                   | In roadmap                       |
| Report aggregati lato server                               | In roadmap                       |
| Scanner barcode su più schermate                           | In roadmap                       |
| Integrazione cassa nativa / fiscale IT                     | Non prevista — usare Shopify POS |
| Notifiche email personalizzate (reset password IT)         | Configurazione Supabase          |
| Nascondere azioni UI per ruolo commesso                    | Miglioramento UX                 |

---

## Contatti e supporto

Per assistenza su configurazione, onboarding o problemi di sync, contatta il tuo **referente VestiFlow** o l'operatore che ha attivato il tenant.

---

_Documento generato per VestiFlow — Gestione Web Studio.  
Per la versione PDF: aprire `docs/GUIDA-UTENTE-VESTIFLOW.pdf` o stampare questo documento da un visualizzatore Markdown._
