# VestiFlow — Documento funzionale · Profilo «Solo gestionale»

**Versione:** 1.0 — 17 luglio 2026
**Fonte:** analisi del codice sorgente (frontend Angular + API NestJS) al commit `273fb75`.
**Ambito:** tutto ciò che il gestionale offre a un negozio attivato con **profilo canale «Solo gestionale»** (`gestionale`), senza integrazione e-commerce.
**Uso previsto:** riferimento funzionale completo, adatto anche come input a un agente di test automatizzato (le route, i permessi e i risultati attesi sono indicati per ogni area). Per i casi di test passo-passo esiste già `docs/PIANO-TEST-VESTIFLOW.md` (T-001 → T-206).

---

## Indice

1. [Il profilo canale «Solo gestionale»](#1-il-profilo-canale-solo-gestionale)
2. [Accesso e autenticazione](#2-accesso-e-autenticazione)
3. [Struttura dell'interfaccia (shell)](#3-struttura-dellinterfaccia-shell)
4. [Ruoli e permessi](#4-ruoli-e-permessi)
5. [Dashboard](#5-dashboard)
6. [Prodotti e catalogo](#6-prodotti-e-catalogo)
7. [Magazzino](#7-magazzino)
8. [Fornitori](#8-fornitori)
9. [Ordini fornitori](#9-ordini-fornitori)
10. [Documenti](#10-documenti)
11. [Vendita negozio (cassa a carrello)](#11-vendita-negozio-cassa-a-carrello)
12. [Ordini cliente](#12-ordini-cliente)
13. [Vendite online e Corrispettivi](#13-vendite-online-e-corrispettivi)
14. [Clienti](#14-clienti)
15. [Report e Registro commercialista](#15-report-e-registro-commercialista)
16. [Impostazioni](#16-impostazioni)
17. [Guida integrata](#17-guida-integrata)
18. [Funzioni trasversali](#18-funzioni-trasversali)
19. [Cosa NON esiste in questo profilo](#19-cosa-non-esiste-in-questo-profilo)
20. [Invarianti di magazzino e regole chiave](#20-invarianti-di-magazzino-e-regole-chiave)
21. [Appendice — Mappa route e permessi](#21-appendice--mappa-route-e-permessi)

---

## 1. Il profilo canale «Solo gestionale»

VestiFlow è un gestionale web multi-tenant e multi-sede per negozi con inventario fisico. In fase di attivazione l'**operatore piattaforma VestiFlow** (admin) crea il cliente da `/app/admin/clients` scegliendo un **profilo canale** tra:

| Profilo             | Valore interno | Descrizione                                                                                   |
| ------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| **Solo gestionale** | `gestionale`   | Magazzino, prodotti, ordini fornitori, vendite e documenti **senza** integrazione e-commerce. |
| Shopify             | `shopify`      | Come sopra + collegamento OAuth al negozio Shopify.                                           |
| TikTok Shop         | `tiktok_shop`  | Integrazione parziale, in manutenzione.                                                       |

Il profilo determina **quali voci di menu, pannelli e pulsanti esistono** per tutti gli utenti del tenant. Questo documento copre esclusivamente il profilo **Solo gestionale**; le differenze rispetto agli altri profili sono elencate in [§19](#19-cosa-non-esiste-in-questo-profilo).

Con il profilo Solo gestionale:

- il catalogo è interamente di proprietà del gestionale (ogni prodotto ha **Fonte: VestiFlow**);
- le **sedi operative (location)** sono create/assegnate dall'operatore piattaforma in fase di setup (non esiste sync location);
- le giacenze cambiano **solo** per azioni interne: carichi, scarichi, trasferimenti, rettifiche, inventario fisico, vendite negozio, resi, import CSV, conferma documenti;
- il negozio incassa con **cassa fiscale/POS esterni**: VestiFlow non emette scontrini né fatture — traccia magazzino, documenti e registri di supporto al commercialista.

---

## 2. Accesso e autenticazione

| Pagina            | Route                    | Note                                                              |
| ----------------- | ------------------------ | ----------------------------------------------------------------- |
| Login             | `/login`                 | Email + password. Riservata ai guest (utente loggato → redirect). |
| Recupero password | `/login/forgot-password` | Invia email con link di reset.                                    |
| Nuova password    | `/login/reset-password`  | Raggiunta dal link email.                                         |

**Flusso login:**

1. Inserire email e password → **Accedi**.
2. Se l'account ha la **verifica in due passaggi (MFA)** attiva: viene richiesto il codice a 6 cifre dell'app authenticator.
3. Ingresso in `/app/dashboard`.

**Logout:** icona/voce **Esci** (topbar su desktop, fondo sidebar su mobile) → dialog di **conferma** → ritorno a `/login`.

**Protezioni:** tutte le route sotto `/app` richiedono autenticazione (`authGuard`); ogni sezione applicativa è inoltre protetta da guard sui permessi tenant (vedi [§21](#21-appendice--mappa-route-e-permessi)). Un URL non esistente reindirizza a `/app/dashboard`.

**Sessione di assistenza:** l'operatore piattaforma può aprire una sessione di supporto temporanea (max 2 ore) sul tenant; durante la sessione compare un **banner** in shell con pulsante per terminarla. Ogni sessione è registrata.

---

## 3. Struttura dell'interfaccia (shell)

### 3.1 Sidebar (menu laterale)

Voci visibili nel profilo Solo gestionale (ognuna compare solo se l'utente ha i permessi indicati in [§21](#21-appendice--mappa-route-e-permessi)):

**Sezione principale**
| Voce | Route | Contenuto |
| --- | --- | --- |
| Dashboard | `/app/dashboard` | Panoramica commerciale e magazzino |
| Prodotti | `/app/products` | Catalogo |
| Magazzino | `/app/inventory/lookup` | Apre «Cerca giacenza»; tab interne per le altre viste |
| Fornitori | `/app/suppliers` | Anagrafica fornitori |
| Ordini Fornitori | `/app/orders` | Acquisti |
| Documenti | `/app/documents` | Hub tipologie documento |

**Sezione «Vendite»**
| Voce | Route | Contenuto |
| --- | --- | --- |
| Vendita negozio | `/app/sales/register` | Cassa a carrello (vendite e resi al banco) |
| Ordini cliente | `/app/sales` | Registro ordini cliente (in questo profilo: solo ordini manuali) |
| Preventivi | `/app/documents/registro?type=quote` | Registro preventivi (sotto Ordini cliente; maschera identica all'Ordine cliente, numerazione PRE) |
| Vendite online | `/app/sales/online` | Registro vendite online (read-only) |
| Corrispettivi | `/app/sales/corrispettivi` | Registro corrispettivi |
| Proforma | `/app/documents/registro?type=proforma` | Registro documenti filtrato |
| DDT vendita | `/app/documents/registro?type=sales_ddt` | Registro documenti filtrato |
| Bozze fattura | `/app/documents/registro?type=invoice_draft` | Registro documenti filtrato |

**Sezione gestione**
| Voce | Route |
| --- | --- |
| Clienti | `/app/customers` |
| Report | `/app/reports` |
| Registro commercialista | `/app/reports/accountant-register` |
| Impostazioni | `/app/settings` |
| Guida | `/app/guide` |

In fondo alla sidebar: **Esci** (con conferma). Non esiste la sezione «Canali online» (solo profilo Shopify).

### 3.2 Topbar

Da sinistra: brand VestiFlow · campo **ricerca globale** · selettore **tema** (chiaro/scuro/sistema) · **selettore sede operativa** · **avatar** (click → Impostazioni) · **Esci**. Nel profilo Solo gestionale **non** compare il chip di stato sync Shopify.

**Selettore sede:** indica la sede su cui agiscono carichi, scarichi, vendite al banco ecc.

- Titolare/Admin con più sedi attive: menu a tendina.
- Manager/Commesso con sede assegnata: **etichetta fissa**, nessun cambio.
- Una sola sede: etichetta fissa per tutti.

### 3.3 Ricerca globale

Apertura con **Ctrl+K / Cmd+K** o click sul campo in topbar. Placeholder: _«Cerca prodotti, clienti, documenti o vai a una pagina…»_. Cerca su **Prodotti**, **Clienti**, **Documenti** e propone la navigazione alle pagine dell'app.

### 3.4 Comportamenti comuni

- **Caricamento:** skeleton/spinner. **Elenco vuoto:** empty-state con suggerimento. **Errore:** messaggio + pulsante **Riprova**.
- **Breadcrumb** sotto la topbar nelle pagine di dettaglio.
- **PWA:** app installabile (Android: «Installa app»; iOS: «Aggiungi a Home»); banner aggiornamento quando è disponibile una nuova versione.
- Su mobile la sidebar diventa **drawer** (hamburger) e molte tabelle passano a **card** impilate.

---

## 4. Ruoli e permessi

Ogni utente del tenant ha un **ruolo**: **Titolare** (`owner`), **Amministratore** (`admin`), **Manager** (`manager`), **Commesso** (`clerk`). Il Titolare ha sempre accesso completo. Per gli altri ruoli l'operatore piattaforma assegna **permessi granulari** (partendo da un preset per ruolo, personalizzabile).

Permessi granulari e cosa abilitano:

| Permesso                               | Abilita                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Vedere giacenze di tutte le sedi       | Consultazione stock/movimenti oltre la sede assegnata (le azioni restano sulla sede in topbar)               |
| Gestire giacenze                       | Registra movimento, inventario fisico                                                                        |
| Import/export e sync giacenze          | Export/import CSV giacenze                                                                                   |
| Gestire catalogo                       | Crea/modifica prodotti, varianti, prezzi                                                                     |
| Import/export e sync prodotti          | Export/import CSV catalogo                                                                                   |
| Eliminare prodotti                     | Rimozione prodotti                                                                                           |
| Vedere costi d'acquisto                | Colonna Costo nelle maschere di vendita (senza permesso la colonna non esiste nemmeno nel selettore colonne) |
| Gestire ordini fornitore               | Crea/modifica/invia/annulla ordini fornitore; anagrafica fornitori                                           |
| Ricevere ordini fornitore              | Registra arrivo merce da ordine                                                                              |
| Consultare documenti                   | Liste e dettagli Documenti                                                                                   |
| Gestire documenti                      | Creazione/conferma documenti, impostazioni numerazione, ordini cliente                                       |
| Registrare vendite al banco            | Schermata Vendita negozio                                                                                    |
| Consultare report                      | Dashboard analytics, Report, registri vendite, Registro commercialista                                       |
| Esportare dati                         | Export CSV (catalogo, giacenze, ordini, corrispettivi)                                                       |
| Impostazioni azienda                   | Pannello Sede fisica                                                                                         |
| Visualizzare clienti / Gestire clienti | Lista/dettaglio clienti · crea/modifica anagrafiche                                                          |

**Effetto sull'interfaccia:** senza permesso, la voce di menu / il pulsante **non compare** e la route reindirizza. Dopo una modifica permessi serve rientrare (o Ctrl+F5).

---

## 5. Dashboard

Route: `/app/dashboard`. Prima pagina dopo il login.

Contenuto nel profilo Solo gestionale (nessun pannello Shopify):

1. **Performance commerciale** (pannello analytics, per chi ha «Consultare report»): KPI su periodo selezionabile (7 giorni, 30 giorni, Mese, Mese scorso, Anno, Personalizzato con date da/a):
   - **Fatturato**, **Margine lordo**, **Pezzi venduti**, **Previsione mese**;
   - **Valore magazzino** (disponibile a prezzo di vendita, snapshot), **Margine stock**, **Pezzi disponibili**, **Sotto soglia**;
   - **Fatturato per canale** (vendite negozio / online) e **Top prodotti** (prodotto, SKU, pezzi, fatturato).
   - Le vendite manuali usano il prezzo di vendita corrente al momento della registrazione.
2. **Card operative:** «Prodotti a catalogo» (attivi) e «Ordini fornitore aperti» (confermati, non ancora conclusi). La card «Vendite da evadere» è solo Shopify.
3. **Varianti sotto soglia:** tabella delle varianti con stock basso + link «Vai al magazzino»; se vuota: _«Nessuna variante sotto soglia: giacenze in ordine.»_
4. **Attività recente:** nel profilo Solo gestionale mostra il testo informativo _«Le vendite manuali (negozio e online) compaiono nei movimenti di magazzino e nei corrispettivi in Report.»_ (la tabella «Ultime vendite» è solo Shopify).

---

## 6. Prodotti e catalogo

Route principali: lista `/app/products`, nuovo `/app/products/new`, dettaglio `/app/products/:id`, modifica `/app/products/:id/edit`, import CSV `/app/products/import`, stampa etichetta `/app/products/:id/print-label`.

### 6.1 Concetti

- **Prodotto** = scheda (nome, brand, categoria, stagione, descrizione, immagini, tag, IVA, unità di misura).
- **Variante** = unità vendibile (combinazione di opzioni, es. Taglia M + Colore Rosso). Ha **SKU obbligatorio e univoco**, **EAN/barcode opzionale**, prezzo di vendita, prezzo d'acquisto.
- Lo stock è per **variante × sede** (mai sul prodotto).
- Nel profilo Solo gestionale ogni prodotto è **Fonte: VestiFlow** (badge in lista e dettaglio); non esistono colonna/stato sync.

### 6.2 Lista prodotti

- Ricerca per nome, brand, SKU; **Scansiona barcode** (apre il dettaglio se il codice è riconosciuto).
- Filtri e paginazione; **menu Colonne** (mostra/nascondi, preset, ripristina — preferenze sincronizzate sull'account).
- Selezione multipla con checkbox → **Stampa etichette selezionate**; icona stampa per riga per l'etichetta singola.
- **Esporta CSV** (permesso Esportare dati) · **Importa CSV** (permesso import/export prodotti) · **Aggiungi prodotto** (permesso Gestire catalogo).

### 6.3 Creazione prodotto

**Inserimento rapido** (modalità predefinita, un'unica schermata):

- Campi: **Nome** (obbligatorio), **SKU** (obbligatorio, suggerito dal nome), **EAN** (opzionale, pulsante **Genera** EAN-13), **Prezzo vendita** (obbligatorio), Brand e Categoria (opzionali).
- Sezione espandibile **Altri dati catalogo**: stagione, stato, IVA, unità di misura, tag, descrizione, immagini.
- **Crea prodotto** in fondo.

**Con varianti** (wizard, attivabile con il toggle o «Configura taglia/colore…»):

1. **Dati essenziali** — nome, brand, categoria, immagini.
2. **Opzioni** — assi predefiniti «Taglia» e «Colore» + terzo asse opzionale; i valori generano le combinazioni (saltabile se singolo SKU).
3. **Varianti** — per ogni combinazione: SKU, prezzi, EAN (con **Genera**).
4. **Riepilogo** → **Crea prodotto**.

Il form prodotto è riusato anche **embedded in pannello laterale** («Crea articolo rapido» / «Crea anagrafica completa») dalla cassa, dall'arrivo merce e dall'ordine cliente, con prefill del codice cercato/scansionato.

### 6.4 Modifica ed eliminazione

- **Modifica:** wizard completo dal dettaglio o dalla lista (permesso Gestire catalogo).
- **Eliminazione** (permesso Eliminare prodotti):
  - senza movimenti di magazzino → consentita;
  - con movimenti storici → **bloccata** (il prodotto resta in catalogo).

### 6.5 Import/Export CSV

- **Export:** scarica il catalogo (SKU, varianti, prezzi, metadati).
- **Import** (`/app/products/import`): carica CSV prodotti (max 15 MB, UTF-8); VestiFlow valida righe e SKU, mostra anteprima/errori e crea prodotti e varianti.

### 6.6 Immagini

Upload JPEG/PNG/WebP max 5 MB; il server ottimizza in WebP.

---

## 7. Magazzino

Tab della sezione (la voce di menu apre **Cerca**): **Giacenze** `/app/inventory` · **Cerca** `/app/inventory/lookup` · **Movimenti** `/app/inventory/movements` · **Inventario fisico** (sessioni da `/app/inventory/counts/new`).

### 7.1 Giacenze

- Tabella stock per **variante × sede** con colonne personalizzabili. Grandezze chiave: **Giacenza** (fisica), **Impegnata** (riservata da ordini cliente), **Disponibile** (giacenza − impegnata), **In arrivo** (storica: gli ordini fornitore non la alimentano più — prompt 2026-07).
- Senza testo di ricerca elenca solo articoli **già tracciati**; cercando per SKU/barcode/nome compaiono anche varianti mai movimentate (disponibile 0, stato Esaurito).
- Filtro sede: chi ha «Vedere giacenze di tutte le sedi» può consultare le altre sedi; le azioni restano sulla sede in topbar.
- Azioni: **Esporta CSV** (permesso Esportare dati) · **Importa CSV** (permesso import/export giacenze) · **Registra movimento** (permesso Gestire giacenze).

### 7.2 Cerca giacenza

Ricerca rapida per SKU/barcode/nome, ottimizzata per mobile, con **scanner barcode** (camera su Chrome/Android; su iOS inserimento manuale). Mostra giacenze per sede e link rapidi a «Registra movimento» e al prodotto.

### 7.3 Movimenti

Storico completo: tipo (**Carico**, **Scarico**, **Trasferimento**, **Rettifica**, **Vendita**, **Reso**), variante, sede, quantità, data, operatore e **origine** (gestionale, vendita negozio, documento…). Filtri per tipo/origine/periodo/sede.

### 7.4 Registra movimento

Route `/app/inventory/movements/new` (permesso Gestire giacenze):

1. Tipo: Carico · Scarico · Trasferimento (sede origine → destinazione) · Rettifica (**motivo obbligatorio**).
2. Variante (ricerca o **scanner barcode**), sede, quantità.
3. Riepilogo con impatto atteso → conferma.

Le vendite/resi al banco **non** si registrano qui: usare **Vendita negozio** ([§11](#11-vendita-negozio-cassa-a-carrello)).

### 7.5 Import CSV giacenze

Route `/app/inventory/import`: file con colonne **SKU**, **Location** (nome esatto), **Disponibile**; anteprima errori → conferma. Ogni riga valida genera una **rettifica tracciata** nei movimenti.

### 7.6 Inventario fisico

1. **Nuova sessione** (`/app/inventory/counts/new`): scegliere la sede.
2. Conteggio per variante (anche con scanner).
3. **Revisione** differenze.
4. **Chiusura**: VestiFlow applica le rettifiche, aggiorna le giacenze e genera il documento di tipo **Inventario**.

---

## 8. Fornitori

Route: lista `/app/suppliers`, nuovo `/app/suppliers/new`, dettaglio `/app/suppliers/:id`, modifica `/app/suppliers/:id/edit`.

- Anagrafica usata da ordini fornitore e arrivi merce: ragione sociale, P.IVA, indirizzo, email, telefono, note.
- Consultazione: chi accede all'area ordini. Creazione/modifica: permesso **Gestire ordini fornitore**.
- Creazione **inline** («Nuovo fornitore») anche dal form ordine e dal form arrivo merce.

---

## 9. Ordini fornitori

Route: lista `/app/orders`, nuovo `/app/orders/new`, dettaglio `/app/orders/:id`, modifica `/app/orders/:id/edit`. Gli ordini fornitore vivono **solo** in VestiFlow.

### 9.1 Flusso tipico (aggiornato — prompt 2026-07)

1. **Nuovo ordine** — testata: **Fornitore**, **Data**, **Consegna prevista**, **Rif. ordine fornitore**. Numerazione propria dal numeratore `supplier_order` (**Numeratori**); nessun listino fornitore per ora; nessuna sezione Trasporto o Indirizzi; nessuna sede (l'ordine non tocca il magazzino). «Nuovo fornitore» inline.
2. **Righe** — colonne visibili di default: Cod. articolo, SKU, EAN, Cod. fornitore, Nome prodotto, Q.tà, U.m., **Costo netto/ivato** (switch nell'intestazione colonna, come Arrivo merce), Sconto, IVA, Totale. Attivabili dal selettore colonne: Prezzo al pubblico, Prezzo barrato, Q.tà giacenza, Q.tà disponibile. **Nessuna colonna «Mag.»**: l'ordine fornitore non incide sulle giacenze.
3. **Verso l'Arrivo merce** — tre modalità: (a) arrivo merce creato da zero, indipendente; (b) arrivo merce che **include** l'ordine dal pannello «Includi ordine»; (c) **«Crea arrivo merce»** direttamente dal dettaglio ordine. In tutti i casi, quando l'ordine viene agganciato a un arrivo merce diventa **Concluso** e il collegamento è visibile in entrambi i documenti.

### 9.2 Stati e azioni

| Stato                                       | Azioni disponibili                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Confermato** (default alla creazione)     | Modifica, Annulla, Crea arrivo merce. **Nessun effetto** su giacenze o disponibilità |
| **Concluso** (agganciato a un arrivo merce) | Consultazione; collegamento all'arrivo merce visibile nel documento                  |
| **Annullato**                               | **Elimina ordine** (rimozione definitiva)                                            |

L'annullo dell'arrivo merce collegato riporta l'ordine a Confermato. Filtri lista: stato, fornitore, periodo, ricerca. Permessi: gestione = «Gestire ordini fornitore»; ricezione = anche solo «Ricevere ordini fornitore».

---

## 10. Documenti

### 10.1 Hub

Route `/app/documents`: scelta della tipologia, organizzata per flusso:

- **Acquisti e fornitori:** Ordini fornitore (→ `/app/orders`) · Arrivi merce (`/app/documents/arrivi-merce`) · Registrazione fattura (registro filtrato `supplier_invoice`).
- **Magazzino:** Trasferimenti · Rettifiche (registri filtrati) · Scarichi manuali (pagina dedicata `/app/documents/manual-unload`) · Inventario (registro filtrato).
- **Vendite:** Vendita negozio (→ cassa) · Vendita/Reso in negozio (pagina dedicata `/app/documents/vendite-negozio`, elenco condiviso `store_sale` + `store_return` con filtro «Tipo») · Proforma · DDT vendita · Bozze fattura · Preventivi (registro filtrato `quote`).
- **Registro:** Tutti i documenti (`/app/documents/registro`).

### 10.2 Tipi di documento

`supplier_order` Ordine fornitore · `goods_receipt` Arrivo merce · `supplier_ddt` DDT fornitore · `supplier_invoice_accompanying` Fattura accompagnatoria · `supplier_invoice` Fattura fornitore (registrazione) · `manual_load` Carico manuale · `initial_load` Carico iniziale · `sales_ddt` DDT vendita · `transfer` Trasferimento · `manual_unload` Scarico manuale · `adjustment` Rettifica · `inventory` Inventario · `proforma` Proforma · `invoice_draft` Bozza fattura · `store_sale` Vendita negozio · `store_return` Reso vendita negozio.

### 10.3 Stati e regole generali

| Stato                       | Significato                                                           |
| --------------------------- | --------------------------------------------------------------------- |
| **Bozza**                   | Modificabile, **nessun movimento di magazzino**                       |
| **Confermato**              | Numero progressivo assegnato; movimenti applicati                     |
| **Stampato / Inviato**      | Tracciamento operativo (invio al commercialista per le bozze fattura) |
| **Registrato esternamente** | Documento emesso/registrato fuori da VestiFlow                        |
| **Annullato**               | Invalidato; gli effetti di magazzino vengono stornati secondo il tipo |

- **Numerazione:** in bozza si vede l'**anteprima** (es. `CAR-2026-0045`); il numero definitivo è assegnato **alla conferma**. Prefissi e serie per tipo in **Impostazioni documenti** (`/app/documents/settings`, permesso Gestire documenti).
- **Modifica di un confermato:** pulsante **Sblocca modifica** con avviso; al salvataggio VestiFlow ricalcola movimenti/giacenze e conserva lo storico revisioni.
- **Duplica documento:** crea una **bozza** scollegata (nessun riferimento a ordini/fatture di origine) che non genera movimenti finché non viene salvata/confermata.
- **Stampa:** anteprima di stampa da `/app/documents/:id/print`.
- **Allegati:** nel form arrivo merce (dopo il primo salvataggio bozza) e nel dettaglio: upload PDF/immagini.
- **Registro** (`/app/documents/registro`): filtri Tipo, Stato, Periodo, Cliente, ricerca (numero/riferimento/note), **vista commercialista** e **DDT da fatturare**; i filtri restano nell'URL (link condivisibili). Colonne personalizzabili.

### 10.4 Arrivo merce

Form `/app/documents/goods-receipt/new` (permesso Gestire documenti):

- **Testata:** tipo (Arrivo merce, DDT fornitore, Fattura accompagnatoria, Carico manuale, Carico iniziale), fornitore (obbligatorio per arrivo/DDT/fattura; opzionale per carichi), sede di destinazione, data, numero/data **documento fornitore**, **causale di carico**, flag **Seguirà fattura**, riferimento fattura, note.
- **Righe in griglia:** ricerca articolo per nome/SKU/EAN, **Crea articolo rapido** o **Crea anagrafica completa** (pannello laterale), quantità, costo, IVA, **lotto/scadenza/seriali** (se attivi in Impostazioni), flag **Carica magazzino**, totale riga. Giro Tab/Invio deterministico tra le celle; scan `quantità*codice`.
- Se aperto da un ordine: colonne **Ordinato / Già ricevuto / Residuo**.
- **Conferma e carica magazzino:** genera i carichi, aggiorna giacenze, ordine collegato e «in arrivo». Se il costo differisce dall'ultimo prezzo fornitore e la policy lo prevede → dialog **aggiorna prezzi fornitore**.

### 10.5 Registrazione fattura fornitore

Form `/app/documents/registrazione-fattura/new`: registra la fattura ricevuta e la **collega agli arrivi merce** (evidenza nel Registro commercialista tra i «documenti fornitore da registrare»).

### 10.6 Trasferimenti e rettifiche

Form dedicati (`transfer/new`, `adjustment/new`): documenti di magazzino con righe articolo; alla conferma generano i movimenti corrispondenti (trasferimento = uscita origine + ingresso destinazione; rettifica con motivo).

### 10.6-bis Scarico manuale (maschera DDT, scarico diretto)

Maschera tipo DDT vendita (`manual-unload/new`, stessa struttura righe: articolo, quantità, prezzo richiamato automaticamente ed editabile, totale; totali in fondo; stampa documento):

- **Cliente facoltativo:** dall'anagrafica clienti oppure **digitato liberamente solo per la stampa** (in quel caso NON viene salvato in anagrafica).
- **Logica giacenze (deroga documentata):** al **salvataggio** la giacenza si aggiorna **direttamente sottraendo le quantità** (es. 10 − 3 = 7), **senza creare movimenti** nel log magazzino; il push inventario verso i canali resta attivo. Nessuna gestione seriali.
- **Avviso non bloccante:** se la quantità supera la disponibilità → «Stai scaricando più di quanto disponibile. Continuare?» (Sì / Annulla).
- **Persistenza:** il documento resta nell'elenco Scarichi manuali (`/app/documents/manual-unload`) finché l'operatore non lo **elimina**; nessun annullamento.
- **Eliminazione definitiva:** cancella SOLO il documento — le giacenze già scalate **non vengono ripristinate**.
- **Modifica:** riconciliazione a delta (3 → 5 scarica solo 2 in più; cambio location ripristina la vecchia e scarica la nuova), sempre senza movimenti.

### 10.7 Documenti di vendita (Proforma · DDT vendita · Bozza fattura)

Form unico `sales-document-form` su route dedicate (`proforma/new`, `sales-ddt/new`, `invoice-draft/new`, modifica `sales/:id/edit`):

- Testata con **cliente** (anagrafica di [§14](#14-clienti), con eventuale nota automatica/avviso configurati sul cliente), date, condizioni di pagamento, note; righe articolo con quantità, prezzi, sconti, IVA.
- **Proforma:** documento non fiscale (preventivo), nessun effetto magazzino.
- **DDT vendita:** alla conferma **scarica il magazzino** dalla sede indicata (salvo DDT collegato a una vendita online che ha già scaricato — nessun secondo scarico). Un DDT confermato senza bozza fattura collegata è conteggiato tra i **DDT da fatturare**.
- **Bozza fattura:** raccoglie i dati per l'emissione (anche per **conversione da DDT**); stati operativi Inviato / Registrato esternamente per il giro col commercialista.

### 10.8 Preventivi

Maschera dedicata (`quote/new`, modifica `quote/:id/edit`) **identica all'Ordine cliente** (stessa tabella righe con colonne ridimensionabili, scan rapido, sconti a cascata, nuovo cliente/prodotto inline), con queste differenze:

- Testata: **Cliente, Location, Data, Rif., Pagamento, Consegna prevista** — nessuno **stato documento**.
- **Non impegna e non blocca** la disponibilità di magazzino (nessuna colonna Q.tà disponibile/Impegna, nessun avviso disponibilità).
- **Numerazione propria `PRE-AAAA-NNNN`** dal tipo documento `quote`, gestita dai **Numeratori** come gli altri documenti; il numero è assegnato al salvataggio.
- Voce sidebar **Preventivi** sotto Ordini cliente → registro documenti filtrato `quote`.

### 10.9 «Includi documento» (trasversale)

Dove presente il pulsante **«Includi documento»**, al click compare la lista dei **tipi di documento compatibili**; scelto il documento, viene inserita una **riga di testo descrittiva** con il riferimento all'origine (es. «Rif. Preventivo PRE-2026-0001 del 17/07/2026») seguita dalle **righe articolo copiate**. I dati di testata restano quelli del documento corrente. Mappa compatibilità attuale:

| Documento      | Può includere da            |
| -------------- | --------------------------- |
| Ordine cliente | Preventivo                  |
| DDT vendita    | Preventivo · Ordine cliente |
| Preventivo     | — (si crea sempre da zero)  |

---

## 11. Vendita negozio (cassa a carrello)

Route `/app/sales/register` (permesso **Registrare vendite al banco**). Cassa **non fiscale**: l'incasso avviene sulla cassa/POS esterni; VestiFlow registra documento e movimenti.

### 11.1 Vendita

1. Verificare la **Location negozio** (sede operativa in topbar).
2. **Cerca articolo**: campo unico «Barcode, SKU o nome prodotto» — pistola USB (funziona come tastiera), scanner camera, o ricerca manuale. Scan ripetuti dello stesso codice incrementano la quantità.
3. **Carrello:** per ogni riga — quantità, **prezzo modificabile**, **Sconto %**, **IVA** (codice IVA risolto automaticamente da articolo/predefinito aziendale, override sempre possibile), totale riga. Il controllo quantità è sulla **Disponibile** (giacenza − impegnata): superarla blocca la vendita.
4. **Metodo di pagamento:** Contanti · Carta · Altro. **Note** facoltative; cliente opzionale.
5. **Concludi vendita:** il backend crea in **un'unica transazione** il documento **Vendita negozio** (`store_sale`, riferimento es. `VN-2026-0001`) + i movimenti di scarico. La UI mostra l'esito con il disponibile residuo per riga.

Se un codice non viene riconosciuto: proposta **Crea articolo rapido** (form prodotto in pannello laterale con codice precompilato) senza uscire dalla cassa.

### 11.2 Reso vendita negozio

Pannello **Reso** nella stessa schermata:

1. **Cerca la vendita origine** tra le vendite negozio recenti («Cerca per numero vendita, cliente o SKU»); **Cambia vendita** per correggere la scelta.
2. **Articoli da rendere:** per riga — quantità venduta, quantità **da rendere**, flag **Vendibile** (se attivo la merce rientra a magazzino; se disattivo il reso è tracciato senza ricarico).
3. **Causale reso obbligatoria** + note.
4. **Registra reso:** documento **Reso vendita negozio** (`store_return`) + eventuali movimenti di rientro.

### 11.3 Tracciabilità

Ogni vendita/reso è consultabile in **Documenti → Vendita/Reso in negozio** (`/app/documents/vendite-negozio`) e in **Magazzino → Movimenti** (tipo Vendita/Reso, origine vendita negozio). Il pannello «Storico movimenti» della cassa linka le operazioni recenti.

L'elenco mostra Data, Numero, Tipo, Cliente, Totale, Metodo pagamento e Righe, con filtri per periodo, tipo, cliente, metodo di pagamento e operatore; la riga apre l'anteprima di dettaglio. Elenco e dettaglio sono di **sola consultazione**: vendite e resi nascono in un'unica transazione con i movimenti di magazzino, quindi non si modificano né si eliminano da qui — una merce che rientra si registra come **Reso** dalla cassa.

---

## 12. Ordini cliente

Route: lista `/app/sales`, nuovo `/app/sales/new`, dettaglio `/app/sales/:id`, modifica `/app/sales/:id/edit`. Nel profilo Solo gestionale il registro contiene esclusivamente ordini con **origine Manuale** (creati nel gestionale).

L'Ordine cliente serve per la merce **promessa ma non ancora consegnata** (ordini telefonici, prenotazioni, vendite con consegna): **impegna** il magazzino senza scaricarlo.

### 12.1 Lista

Permesso: **Consultare report**. Filtri: **periodo**, **stato**, **evasione**, **cliente**, **location**, ricerca; paginazione; **Esporta CSV** (permesso Esportare dati). Colonne principali: numero, data, cliente, stato pagamento, evasione, totale, quantità impegnata, location.

### 12.2 Creazione / modifica (permesso Gestire documenti)

Maschera identica per impostazione all'Arrivo merce (testata compatta + righe in griglia con colonne ridimensionabili e giro Tab/Invio):

- **Testata:** **Cliente** (ricerca in anagrafica; **Nuovo cliente** inline con il form completo di [§14](#14-clienti)); **Location** di origine degli impegni; **Rif. esterno**; **Data prevista consegna**; **Condizioni di pagamento** (dalle opzioni configurate in Impostazioni → Pagamenti); **Sconto documento %** (extra, dopo gli sconti riga); note.
- **Righe:** articolo per codice/SKU/barcode/nome (scan `quantità*codice` supportato; **Crea articolo rapido** per codici sconosciuti), quantità, prezzo unitario, **sconto a cascata** (es. `10%` o `4+10%`), codice IVA, flag **Impegna magazzino** per riga. La colonna **Costo** esiste solo con il permesso «Vedere costi d'acquisto». Totali (imponibile, IVA, totale) ricalcolati in tempo reale, riga totale sticky.
- **Salvataggio unico** («Salva» / «Salva e chiudi»): testata + righe + **impegni** in una sola operazione. Le righe con «Impegna magazzino» attivo creano **prenotazioni stock**: Impegnata ↑, Disponibile ↓, **Giacenza invariata**.
- **Controllo disponibilità NON bloccante:** se una riga supera la disponibile compare un riepilogo delle righe critiche con scelta **Salva comunque**.

### 12.3 Stati e ciclo di vita

Non esiste bozza: l'ordine salvato è **Confermato**. Stati derivati:

| Stato          | Come ci si arriva                           | Effetto sugli impegni                   |
| -------------- | ------------------------------------------- | --------------------------------------- |
| **Confermato** | Salvataggio                                 | Impegni attivi                          |
| **Annullato**  | Azione Annulla                              | Impegni rilasciati (Disponibile risale) |
| **Concluso**   | Conferma del documento di scarico collegato | Impegni consumati                       |

**Concludi ordine:** dalla maschera, genera il **documento di scarico precompilato in bozza** (oggi: **DDT vendita**) collegato all'ordine. Alla **conferma del documento**: scarico giacenze + consumo impegni + ordine **Concluso**. Se il documento di scarico viene **annullato**, l'ordine **si riapre** (torna Confermato e gli impegni vengono ricreati). Finché esiste un documento di scarico attivo, «Concludi ordine» riusa quello.

### 12.4 Dettaglio

Read-only: dati ordine (numero, data, cliente, stati, location, rif. esterno, consegna prevista, condizioni pagamento), righe con sconti/IVA, totali, quantità ancora impegnata, eventuale documento collegato. Pulsante **Modifica ordine** (se permesso e ordine non annullato).

---

## 13. Vendite online e Corrispettivi

### 13.1 Vendite online (`/app/sales/online`)

Registro **read-only** delle vendite generate automaticamente dall'**evasione degli ordini dei canali online integrati**: nessuna schermata crea o modifica vendite online. Filtri: ricerca, canale, periodo di evasione; paginazione in URL. Dettaglio (`/app/sales/online/:id`): righe con quantità/prezzi/IVA, movimenti collegati, stato magazzino (**Scaricata / Parzialmente scaricata / Non applicata**), Corrispettivo collegato, ordine di origine.

> **Nota per il profilo Solo gestionale:** oggi gli eventi che alimentano questo registro provengono solo dai canali integrati (Shopify). Senza canale collegato il registro è tipicamente **vuoto** (empty-state con invito a modificare i filtri) — comportamento atteso, non un difetto.

### 13.2 Corrispettivi (`/app/sales/corrispettivi`)

Registro dei corrispettivi generati insieme alle vendite online. **Non è una trasmissione fiscale automatica**: è un registro operativo di supporto. Filtri per periodo, canale, stato, aliquota, fatturato, incluso/escluso, numeri ordine/vendita. Ogni voce ha uno **stato** modificabile dal dettaglio: **Da verificare · Incluso · Escluso (fatturato) · Rettificato · Rimborsato**. Vale la stessa nota del §13.1 sull'alimentazione.

---

## 14. Clienti

Route: lista `/app/customers`, nuovo `/app/customers/new`, dettaglio `/app/customers/:id`, modifica `/app/customers/:id/edit`. Nel profilo Solo gestionale l'anagrafica clienti è **completa e modificabile** (permessi Visualizzare/Gestire clienti) — è l'anagrafica canonica usata da ordini cliente e documenti di vendita.

**Campi del form:**

- **Dati anagrafici:** Nome, Cognome / Ragione sociale, Codice cliente, P. IVA, Codice fiscale, Indirizzo (+ riga 2), CAP, Città, Provincia, Paese, Email, PEC, Telefono, Sito web, Referente, Note anagrafiche.
- **Dati commerciali:** **Sconto** (notazione a cascata, es. `10%` o `10+5+4`), **Modalità di pagamento** e **Condizioni di pagamento** (dalle opzioni di Impostazioni → Pagamenti), **Incaricato trasporto**, Note commerciali.
- **Automatismi documento:** «Inserisci nota nei documenti» (testo aggiunto automaticamente alle note dei documenti del cliente) e «Mostra avviso alla creazione documento» (es. _verificare il fido_).
- Flag **«È anche fornitore»**: la stessa anagrafica vale come fornitore.

Il form cliente è riusato **inline** nell'ordine cliente e nei documenti di vendita («Nuovo cliente» in pannello).

---

## 15. Report e Registro commercialista

### 15.1 Report (`/app/reports`, permesso Consultare report)

Sottotitolo profilo gestionale: _«Analytics commerciali, export corrispettivi e snapshot magazzino.»_

1. **Link rapidi** (per chi ha Esportare dati): «Apri registro corrispettivi commercialista →» e «Registro commercialista unificato →».
2. **Export corrispettivi:** selettore periodo (con calendario) + **canale**: **Negozio fisico** (vendite/storni al banco) o **Vendita online**; l'export usa i movimenti registrati e il prezzo di vendita corrente della variante. Formati disponibili via API: CSV, foglio di calcolo, PDF.
3. **Performance commerciale:** stesso pannello analytics della Dashboard ([§5](#5-dashboard)) filtrato sul periodo scelto.
4. **Giacenze per location:** snapshot attuale per sede (non filtrato per periodo).

### 15.2 Corrispettivi commercialista (`/app/reports/corrispettivi`)

Riepilogo delle vendite online registrate nel gestionale con stati fiscali, **export** e **storico consegne** al commercialista (azione «segna consegnato»); vendite POS escluse (gestite dalla cassa fiscale). Pagina di **stampa** dedicata (`/app/reports/corrispettivi/print`).

### 15.3 Registro commercialista (`/app/reports/accountant-register`)

Riepilogo per **periodo** su due tab:

- **Documenti** — KPI: **Totale documenti**, **Da emettere** (bozze fattura), **Inviate al commercialista**, **Emesse/Registrate esternamente**, **DDT vendita da fatturare**, **Documenti fornitore da registrare**. Collegamenti rapidi: «Apri registro documenti filtrato» (vista commercialista con date del periodo) e «DDT da fatturare».
- **Corrispettivi** — riepilogo corrispettivi del periodo con link ai dettagli.

---

## 16. Impostazioni

Route `/app/settings`. Pannelli visibili nel profilo Solo gestionale (in quest'ordine):

| Pannello                  | Visibilità                                      | Contenuto                                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Profilo**               | Tutti                                           | Dati utente e **foto profilo**: upload JPEG/PNG/WebP max 2 MB, ritaglio circolare con zoom; Cambia/Rimuovi; senza foto → iniziali                                                                                                                                      |
| **Sede fisica**           | Permesso Impostazioni azienda                   | Anagrafica commerciale del negozio registrata dall'operatore VestiFlow (ragione sociale, P.IVA, indirizzo, contatti) con riquadro espandibile **Dati fiscali e contatti**; indipendente dalle sedi operative                                                           |
| **Magazzino e documenti** | Titolare/Admin (accesso completo)               | **Gestione lotti e scadenze** · **Gestione numeri seriali** · **Policy aggiornamento prezzo fornitore** (sempre / chiedi / mai) · **Unità di misura** e **IVA predefinita** per i nuovi articoli · avvisi/blocco su **giacenze negative**. Valida per tutto il negozio |
| **Codici IVA**            | Titolare/Admin                                  | Gestione codici IVA (aliquota, natura, ambito vendite/acquisti, attivo) — pagina dedicata `/app/settings/codici-iva`                                                                                                                                                   |
| **Pagamenti**             | Titolare/Admin                                  | Opzioni di pagamento/condizioni usate da clienti, ordini e documenti — pagina dedicata `/app/settings/pagamenti`                                                                                                                                                       |
| **Backup negozio**        | Titolare/Admin (azioni riservate al titolare)   | **Esporta** o **ripristina** una copia completa dei dati del negozio                                                                                                                                                                                                   |
| **Sicurezza account**     | Tutti (gestione MFA: titolare/admin per policy) | **Verifica in due passaggi (MFA)** con app authenticator; al login successivo password + codice a 6 cifre                                                                                                                                                              |
| **Aspetto**               | Tutti                                           | Tema **Chiaro / Scuro / Sistema** (anche dalla topbar)                                                                                                                                                                                                                 |

**Non presenti in questo profilo:** Integrazione Shopify, Integrazione TikTok Shop, pannello Location con sync/licensing sedi (le sedi operative sono gestite dall'operatore piattaforma).

---

## 17. Guida integrata

Voce **Guida** in sidebar (`/app/guide`): manuale utente dentro l'app con indice e **download PDF**. Intro nel profilo gestionale: _«Manuale del gestionale: prodotti, magazzino, documenti, ordini fornitore e vendite al banco.»_

---

## 18. Funzioni trasversali

- **Colonne personalizzabili** con preset e «Ripristina colonne» su: Documenti, Giacenze, Movimenti, Fornitori, Prodotti, Clienti, righe Ordine fornitore, righe Arrivo merce, righe Ordine cliente. Preferenze **sincronizzate sull'account** (non solo nel browser).
- **Filtri nell'URL** nelle liste principali (documenti, vendite, ordini): i link filtrati sono salvabili/condivisibili.
- **Scanner barcode** (camera o pistola USB) in: lista Prodotti, Giacenze, Cerca giacenza, Registra movimento, Inventario fisico, Vendita negozio, righe Arrivo merce e Ordine cliente (sintassi `quantità*codice` nelle griglie).
- **Protezione modifiche non salvate:** i form principali (arrivo merce, ordine cliente) chiedono conferma prima di uscire con modifiche pendenti.
- **Formati denaro/date** italiani; valuta di default EUR.

---

## 19. Cosa NON esiste in questo profilo

Utile come lista di **test negativi** (l'elemento non deve comparire):

| Elemento                                                                   | Dove sarebbe (profilo Shopify)                             |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Pannelli Integrazione Shopify / TikTok in Impostazioni                     | `/app/settings`                                            |
| Pannello Location (sync/licensing sedi) in Impostazioni                    | `/app/settings`                                            |
| Chip stato sync in topbar                                                  | topbar                                                     |
| Pannello «Integrazione Shopify» in Dashboard                               | `/app/dashboard`                                           |
| Card «Vendite da evadere» in Dashboard                                     | `/app/dashboard`                                           |
| Sezione sidebar «Canali online» / voce «Ordini Shopify»                    | `/app/sales/shopify` (la route reindirizza a `/app/sales`) |
| Colonna/badge stato sync Shopify su prodotti                               | lista/dettaglio prodotti                                   |
| Pulsanti «Sincronizza … da Shopify» (catalogo, giacenze, vendite, clienti) | liste prodotti/giacenze/vendite/clienti                    |
| Categoria prodotto Shopify + Attributi categoria nel form prodotto         | form prodotto                                              |
| VestiFlow che emette scontrini o fatture fiscali                           | — (mai, in nessun profilo)                                 |

Inoltre: la sezione `/app/admin` è riservata all'**operatore piattaforma** (un utente tenant non la vede).

---

## 20. Invarianti di magazzino e regole chiave

Regole sempre vere, utili come oracoli nei test end-to-end:

1. **Disponibile = Giacenza − Impegnata.** Le vendite al banco e i controlli di cassa usano la **Disponibile**, non la giacenza.
2. **Un documento in Bozza non muove mai il magazzino.** I movimenti nascono solo alla **conferma** (o da Registra movimento / import CSV / chiusura inventario).
3. **Il numero definitivo del documento è assegnato alla conferma**; in bozza si vede solo l'anteprima della numerazione.
4. **Ogni variazione di stock è un movimento tracciato** (data, operatore, origine) visibile in Magazzino → Movimenti.
5. **Ordine cliente:** il salvataggio impegna (Impegnata ↑, Disponibile ↓, Giacenza invariata); l'annullo rilascia; la conclusione via documento di scarico consuma impegni e scarica la giacenza; l'annullo del documento di scarico riapre l'ordine e ricrea gli impegni.
6. **L'ordine fornitore non incide mai su giacenze o disponibilità** (prompt 2026-07): nasce Confermato e diventa Concluso quando viene incluso/agganciato a un Arrivo merce; solo la conferma dell'arrivo merce carica la giacenza.
7. **Vendita rifiutata per stock insufficiente** se la disponibile della sede è inferiore alla quantità richiesta in cassa.
8. **Rettifiche e resi richiedono una causale** (motivo rettifica; causale reso).
9. **Le rettifiche da import CSV giacenze** generano una rettifica tracciata per ogni riga valida.
10. **I filtri di lista vivono nell'URL**: ricaricare la pagina mantiene la vista.

---

## 21. Appendice — Mappa route e permessi

| Route                                                                                       | Pagina                              | Permesso richiesto (uno tra)                                                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| `/login`, `/login/forgot-password`, `/login/reset-password`                                 | Autenticazione                      | — (guest)                                                                       |
| `/app/dashboard`                                                                            | Dashboard                           | autenticato                                                                     |
| `/app/products`                                                                             | Lista prodotti                      | sezione catalogo (catalogo/giacenze/ordini fornitore)                           |
| `/app/products/new`, `/app/products/:id/edit`                                               | Form prodotto                       | Gestire catalogo                                                                |
| `/app/products/import`                                                                      | Import CSV prodotti                 | Import/export prodotti                                                          |
| `/app/products/:id`, `/app/products/:id/print-label`                                        | Dettaglio / etichetta               | sezione catalogo                                                                |
| `/app/inventory`                                                                            | Giacenze                            | sezione magazzino                                                               |
| `/app/inventory/lookup`                                                                     | Cerca giacenza                      | sezione magazzino                                                               |
| `/app/inventory/movements`                                                                  | Movimenti                           | sezione magazzino                                                               |
| `/app/inventory/movements/new`                                                              | Registra movimento                  | Gestire giacenze                                                                |
| `/app/inventory/import`                                                                     | Import CSV giacenze                 | Import/export giacenze                                                          |
| `/app/inventory/counts/new`, `/app/inventory/counts/:id`                                    | Inventario fisico                   | Gestire giacenze                                                                |
| `/app/suppliers` (+`/new`, `/:id`, `/:id/edit`)                                             | Fornitori                           | vista: area ordini · gestione: Gestire ordini fornitore                         |
| `/app/orders` (+`/new`, `/:id`, `/:id/edit`)                                                | Ordini fornitori                    | vista: Gestire o Ricevere ordini fornitore · gestione: Gestire ordini fornitore |
| `/app/documents`                                                                            | Hub documenti                       | Consultare o Gestire documenti                                                  |
| `/app/documents/registro`, `/app/documents/arrivi-merce`                                    | Registri                            | Consultare o Gestire documenti                                                  |
| `/app/documents/goods-receipt/new`, `…/:id/edit`                                            | Arrivo merce                        | Gestire documenti                                                               |
| `/app/documents/registrazione-fattura/new`                                                  | Registrazione fattura               | Gestire documenti                                                               |
| `/app/documents/transfer/new`, `…/manual-unload/new`, `…/adjustment/new`                    | Trasferimento / Scarico / Rettifica | Gestire documenti                                                               |
| `/app/documents/proforma/new`, `…/sales-ddt/new`, `…/invoice-draft/new`, `…/sales/:id/edit` | Documenti di vendita                | Gestire documenti                                                               |
| `/app/documents/settings`                                                                   | Impostazioni numerazione            | Gestire documenti                                                               |
| `/app/documents/:id`, `/app/documents/:id/print`                                            | Dettaglio / stampa                  | Consultare o Gestire documenti                                                  |
| `/app/sales`                                                                                | Ordini cliente (lista)              | Consultare report                                                               |
| `/app/sales/new`, `/app/sales/:id/edit`                                                     | Ordine cliente (form)               | Gestire documenti                                                               |
| `/app/sales/:id`                                                                            | Dettaglio ordine                    | Consultare report                                                               |
| `/app/sales/register`                                                                       | Vendita negozio                     | Registrare vendite al banco                                                     |
| `/app/sales/online`, `/app/sales/online/:id`                                                | Vendite online                      | Consultare report                                                               |
| `/app/sales/corrispettivi`                                                                  | Corrispettivi                       | Consultare report                                                               |
| `/app/customers` (+`/:id`)                                                                  | Clienti                             | Visualizzare o Gestire clienti                                                  |
| `/app/customers/new`, `/app/customers/:id/edit`                                             | Form cliente                        | Gestire clienti                                                                 |
| `/app/reports`                                                                              | Report                              | Consultare report                                                               |
| `/app/reports/corrispettivi` (+`/print`)                                                    | Corrispettivi commercialista        | Consultare report                                                               |
| `/app/reports/accountant-register`                                                          | Registro commercialista             | Consultare report                                                               |
| `/app/settings` (+`/codici-iva`, `/pagamenti`)                                              | Impostazioni                        | autenticato (pannelli per permesso)                                             |
| `/app/guide`                                                                                | Guida                               | autenticato                                                                     |

---

_Documento generato dall'analisi del codice; in caso di divergenza tra questo documento e l'app, fa fede il comportamento dell'app (e va segnalata la divergenza)._
