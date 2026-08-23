# 03 · Specifica comune — righe documento, celle, colonne, ricerca e navigazione

**Stato:** specifica normativa consolidata  
**Data consolidamento:** 23/08/2026  
**Perimetro:** documenti VestiFlow con vere righe articolo/prodotto  
**Documento tecnico di stato collegato:** `03b-mappa-tecnica-righe-documento.md`

> Questa versione sostituisce integralmente la precedente `03-specifica-unificazione-righe-documento.md`.
>
> Qui si definisce **come deve essere strutturato e comportarsi il sistema comune delle righe documento**.
> Lo stato corrente del codice, i componenti già migrati, le misure e le divergenze appartengono a `03b-mappa-tecnica-righe-documento.md`.
>
> **Regola di lettura:** una decisione funzionale/architetturale corrente prevale sul codice osservato, sugli audit e sulle versioni precedenti incompatibili. Il codice serve a individuare il delta e la causa radice, non a riscrivere il requisito.

---

# 1. Obiettivo architetturale

VestiFlow deve avere:

> **un solo sistema comune di riga documento, composto da celle riutilizzabili e governato da configurazioni/policy del documento.**

Non si devono creare righe autonome per ogni modulo.

La forma obiettivo è:

```text
celle comuni
    ↓
riga/header/quick-row/card comuni
    ↓
configurazione + policy del documento
    ↓
form documento
    ↓
servizi/API/dominio specifici
```

## 1.1 Cosa significa “comune”

Devono essere comuni, dove applicabili:

- identità e ciclo della riga;
- header;
- quick-row / area di inserimento;
- celle;
- selettore Colonne;
- focus;
- tastiera;
- resa desktop;
- resa mobile/card;
- ricerca articolo;
- scansione;
- suggerimenti;
- comportamento base di quantità;
- U.M.;
- IVA;
- prezzo/costo come tipologia di cella;
- sconto;
- selezione/eliminazione righe quando il relativo contratto verrà consolidato;
- accessibilità.

## 1.2 Cosa NON significa “comune”

Non si fondono dati o regole di dominio differenti.

Esempi:

- `Impegna magazzino`, `Carica magazzino`, `Scarica magazzino` possono usare la stessa grammatica di cella, ma sono tre effetti diversi;
- costo e prezzo possono usare controlli simili, ma non hanno lo stesso significato;
- lotto/scadenza esistono solo dove pertinenti;
- un documento può rendere una colonna editabile e un altro sola lettura;
- una scansione può incrementare una riga in un documento e creare una nuova riga in un altro.

> **Stessa cella visuale non significa stesso campo backend.**

## 1.3 Vincolo fondamentale

I componenti comuni non devono diventare un mega-componente pieno di:

```ts
if (documentType === ...)
```

Le differenze devono arrivare dall'esterno come:

- configurazione;
- capacità;
- policy;
- callback;
- dati.

Il componente comune non deve conoscere l'elenco dei documenti che lo consumano.

---

# 2. Perimetro

Rientrano nel contratto delle righe articolo/prodotto:

- Ordine cliente
- Preventivo
- DDT vendita
- Vendita al banco
- Reso al banco
- Ordine fornitore
- Arrivo merce
- Trasferimento
- Proforma
- Fattura
- Fattura accompagnatoria
- Nota di credito
- Rettifica / Inventario, **quando verranno affrontati nel loro blocco dedicato**

Non rientrano nella normale griglia articolo:

- **Registrazione fattura fornitore**: righe economico-contabili; può includere Arrivi merce, ma produce righe a valore/totali;
- **Corrispettivo manuale**: registrazione economica, non normale documento a righe articolo.

## 2.1 Migrazione

Il contratto è comune, ma la migrazione del codice avviene:

> **un documento alla volta, con test e verifica prima di passare al successivo.**

Non si richiede una conversione massiva di tutte le maschere nello stesso commit.

Questo non autorizza divergenze permanenti: ogni documento migrato deve convergere sullo stesso contratto.

---

# 3. Separazione fra specifica e stato tecnico

`03` e `03b` hanno mestieri distinti.

## 3.1 `03` — normativa

Contiene:

- architettura obiettivo;
- comportamento delle celle;
- catalogo canonico;
- regole desktop/mobile;
- ricerca/scansione;
- policy;
- criteri di accettazione;
- strategia di migrazione.

Non deve contenere come verità permanente:

- conteggi “N maschere su M”;
- conteggi di righe;
- numero corrente di test;
- branch;
- commit;
- “FATTO” legato a una fotografia destinata a cambiare.

## 3.2 `03b` — mappa tecnica

Contiene:

- componenti realmente esistenti;
- consumatori;
- duplicazioni;
- misure datate;
- gap;
- test presenti;
- stato di migrazione;
- divergenze osservate.

Va aggiornato dopo le migrazioni significative.

---

# 4. Contratto di configurazione del documento

Ogni documento deve poter dichiarare la propria configurazione senza duplicare i componenti comuni.

Concettualmente la configurazione deve poter esprimere almeno:

```text
columns
defaultVisibleColumns
editable/readOnly
feature gates
quantity policy
price/cost policy
stock effect policy
scan/add policy
focus order
mobile presentation
specialized extensions
```

La forma tecnica concreta può evolvere, ma il principio è vincolante:

> **il documento passa le differenze; la riga comune applica il meccanismo.**

---

# 5. Catalogo canonico delle celle/colonne

## 5.1 Principio

Esiste un **catalogo canonico** dei concetti di colonna.

Per ogni colonna devono esistere, in un punto comune:

- `columnId` stabile;
- etichetta base;
- larghezza base;
- larghezza minima;
- allineamento;
- natura numerica/testuale;
- componente/cella di riferimento;
- comportamento tastiera/accessibilità;
- eventuale feature gate.

Il singolo documento non deve ridefinire da zero questi attributi senza una ragione esplicita.

## 5.2 Tre stati distinti

Per ogni documento una colonna può essere:

### Disponibile

Può essere attivata dall'operatore tramite **Colonne**.

### Visibile di default

È disponibile ed è inclusa nel preset iniziale.

### Esclusa

Non appartiene a quel documento e **non compare nemmeno nel selettore Colonne**.

Esempio già deciso:

```text
Vendita al banco
Costo articolo → ESCLUSO
EAN → DISPONIBILE
Prezzo Shopify → DISPONIBILE solo con Shopify
```

## 5.3 Catalogo di riferimento

Il catalogo comune deve poter rappresentare almeno:

- Cod. articolo
- Cod. fornitore
- SKU
- EAN
- Nome prodotto
- Q.tà
- U.M.
- Giacenza
- Disponibile
- Costo articolo
- Prezzo
- Prezzo barrato
- Prezzo Shopify
- Sconto
- IVA
- Totale riga
- Impegna magazzino
- Carica magazzino
- Scarica magazzino
- Azioni riga

Ulteriori celle specialistiche possono esistere:

- Lotto
- Scadenza
- Seriali, quando il loro contratto verrà ricostruito
- altri dati realmente di dominio

## 5.4 `columnId`

Lo stesso `columnId` non deve rappresentare due concetti diversi.

> **Impegna, Carica e Scarica devono essere identificatori semantici distinti nel contratto UI, anche se il backend legacy usa campi storici differenti o condivisi.**

## 5.5 Preferenze già salvate

Le preferenze colonne sono dati dell'utente.

Prima di:

- rinominare un `columnId`;
- separare un id legacy;
- fondere cataloghi;

va censito il formato persistito e definita la migrazione/fallback.

> **Non si perde una preferenza utente per una semplice rifattorizzazione interna.**

---

# 6. Riga desktop comune

## 6.1 Obiettivo

Tutti i documenti a righe articolo devono convergere sulla stessa infrastruttura desktop.

La riga comune:

- riceve la configurazione del documento;
- rende le celle disponibili;
- applica visibilità;
- gestisce focus/navigazione;
- emette eventi semantici;
- non contiene logiche di business del documento.

## 6.2 Estensione, non riscrittura

L'infrastruttura comune già esistente va **evoluta e completata**, non sostituita con una seconda astrazione parallela.

Prima di aggiungere una nuova riga locale bisogna dimostrare che il requisito non è esprimibile con:

- nuova cella comune;
- nuova policy;
- nuovo input/output;
- estensione specialistica.

## 6.3 Celle specialistiche

Un documento può avere celle che altri non hanno.

La presenza di una cella specialistica **non autorizza a duplicare l'intera riga**.

---

# 7. Header e quick-row comuni

Header e quick-row devono derivare dallo stesso contratto delle colonne della riga.

Devono condividere:

- `columnId`;
- ordine;
- visibilità;
- larghezze;
- etichette;
- gruppi;
- menu di intestazione;
- stato Netto/Ivato o altre modalità quando la relativa colonna lo prevede.

Non devono esistere cataloghi separati di header, quick-row e riga che possano divergere in silenzio.

---

# 8. Mobile / card comune

## 8.1 Principio

> **La card mobile appartiene allo stesso sistema di riga della vista desktop.**

Non deve essere una seconda implementazione funzionale del documento.

La card può avere un layout diverso, ma usa:

- gli stessi dati;
- le stesse celle/controlli comuni dove pertinenti;
- le stesse policy;
- le stesse regole di editabilità;
- gli stessi effetti;
- lo stesso snapshot.

## 8.2 Struttura

È ammesso un modello compositivo:

```text
guscio card comune
+ controlli/celle comuni
+ proiezione delle sole parti specifiche
```

Non è richiesto che tutte le card abbiano identico HTML interno.

È invece vietato che ogni documento riscriva quantità, IVA, prezzo, sconto, focus, ricerca o scanner solo perché la vista è mobile.

## 8.3 Riferimento operativo

La resa mobile consolidata sull'Ordine cliente costituisce il riferimento funzionale per la card comune, salvo eccezioni esplicitamente decise.

Vendita/Reso al banco devono usare la stessa base comune, non una card locale.

## 8.4 Una sola vista viva

Tabella desktop e card mobile non devono essere due rappresentazioni operative vive contemporaneamente.

> **Una sola vista delle righe deve essere montata/attiva alla volta.**

Il cambio breakpoint può perdere il cursore/focus, ma non può perdere valori, dirty state, disabled/read-only o identità delle righe.

---

# 9. Ricerca articolo e inserimento rapido

## 9.1 Un solo motore

La ricerca articolo deve essere comune ai documenti.

Deve poter cercare, secondo la configurazione disponibile:

- Cod. articolo
- Cod. fornitore
- SKU
- EAN
- Nome prodotto

Il documento non deve implementare un proprio motore locale se quello comune è sufficiente.

## 9.2 Query ≠ riga

> **La query digitata nell'area di ricerca non è una riga documento.**

La presenza di testo in un campo di ricerca non autorizza il salvataggio di una riga.

## 9.3 Ricerca rapida e nuova riga esplicita

Il motore comune deve distinguere il **gesto** dal risultato.

Esempio già deciso per Vendita/Reso al banco:

```text
scanner / ricerca rapida
stessa variante già presente
→ incrementa la riga esistente
```

ma:

```text
Nuova riga esplicita
seleziono variante già presente
→ resta una seconda riga distinta
```

Il motore di ricerca/scansione non applica quindi una regola universale “stessa variante = accorpa”. La policy viene passata dal documento.

## 9.4 Parametri della ricerca per nome _(fissati il 24/08/2026)_

I parametri sono **del motore**, non del documento: non esiste una maschera che cerca da tre caratteri e un'altra da due.

|                             | Valore                                                               | Perché                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| soglia minima               | **2 caratteri**                                                      | allineata all'apertura del pannello dei suggerimenti: la ricerca parte nello stesso momento in cui l'elenco compare, così non si vede un elenco vuoto che si riempie dopo |
| attesa prima della chiamata | **300 ms**                                                           | chi digita «magli» farebbe cinque ricerche di cui quattro buttate                                                                                                         |
| risultati richiesti         | **30**                                                               | non è quanti ne esistono: è quanti se ne mostrano. Un elenco più lungo non si scorre, si cerca meglio                                                                     |
| ambito                      | filtrata per la **sede della testata** quando il documento ne ha una | la disponibilità mostrata accanto al risultato dev'essere quella della sede su cui si sta lavorando                                                                       |
| errore di rete              | **elenco vuoto**, nessun errore a schermo                            | la ricerca è un aiuto: se non risponde, si continua a digitare                                                                                                            |

⛔ **Vivono in un modulo solo**: `domain/documents/utils/document-variant-search.config.ts`. Erano in **otto copie** — sette maschere più il pannello condiviso, che chiamava la propria costante `SEARCH_DEBOUNCE_MS` invece di `VARIANT_SEARCH_DEBOUNCE_MS`: stesso valore, nome diverso, quindi invisibile a chi cercava le copie.

I valori coincidevano tutti, ma per coincidenza tenuta a mano: cambiarne uno avrebbe cambiato il comportamento di **una maschera sola**, e niente lo avrebbe fatto vedere — non rompe la compilazione, non arrossa un test, e a schermo si nota solo mettendo due maschere accanto.

⚠️ `scripts/check-search-config.mjs` fa fallire il lint sulla nona copia.

⏸ **Aperto, e da non confondere con questo**: `SEARCH_DEBOUNCE_MS = 300` esiste anche in **tredici** elenchi (clienti, fornitori, movimenti, documenti, ricerca globale, picker). Sono ricerche **diverse** da questa, e la loro unificazione è un altro perimetro — quello dei riepiloghi.

---

# 10. Campi codice della riga

L'area di ricerca rapida e le celle codice della riga sono due strumenti diversi.

Le celle:

- Cod. articolo
- Cod. fornitore
- SKU
- EAN

servono a inserire/confermare un codice sulla riga.

Alla conferma applicano il motore comune di corrispondenza esatta.

Esiti:

- una corrispondenza → aggancio;
- più corrispondenze → scelta;
- nessuna → il valore resta secondo il contratto della riga; non diventa automaticamente una ricerca per nome.

Il pannello/area di ricerca serve invece a trovare un articolo quando l'operatore non sta necessariamente inserendo un codice esatto.

---

# 11. Scansione barcode/EAN

## 11.1 Infrastruttura comune

Devono essere comuni:

- scanner HID / keyboard wedge;
- scanner fotocamera;
- overlay;
- focus;
- prevenzione dell'inserimento accidentale del barcode negli input;
- risoluzione del codice;
- gestione codice non risolto.

Il documento non crea uno scanner proprio.

## 11.2 Policy dopo la scansione

Il motore comune restituisce il risultato.

Il documento decide la policy:

- incrementa riga esistente;
- crea nuova riga;
- applica altre regole realmente necessarie.

## 11.3 Nessun effetto fisico durante la scansione

Scansione e ricerca compilano il documento.

Non salvano il documento, non movimentano il magazzino e non creano effetti economici definitivi.

---

# 12. Quantità

La cella Quantità è comune.

Sono policy del documento:

- minimo;
- massimo, se esiste un vincolo reale;
- step;
- possibilità di zero;
- validator;
- precisione;
- effetto della quantità.

Non deve esistere un `min=1` universale solo perché una maschera lo aveva storicamente.

Stepper e digitazione diretta devono usare lo stesso controllo comune.

---

# 13. Unità di misura

La U.M. segue il contratto comune già consolidato:

- cella comune;
- ricerca/selezione;
- testo libero ammesso;
- default dall'articolo;
- modificabile sulla riga;
- valore salvato come snapshot del documento;
- la modifica della riga non riscrive l'anagrafica.

La lista U.M. è un insieme di suggerimenti, non l'autorità referenziale della riga.

---

# 14. Prezzo e costo

Prezzo e costo possono riusare grammatica e controlli comuni, ma non sono lo stesso dato.

Il documento dichiara:

- quale valore usa;
- sorgente del default;
- Netto/Ivato quando pertinente;
- editabile/read-only;
- precisione;
- eventuale propagazione esplicita all'anagrafica.

Un valore portato nella riga diventa dato del documento.

La presenza di una cella nel catalogo canonico non obbliga tutti i documenti a renderla disponibile.

> **Costo articolo è escluso da Vendita al banco e Reso al banco.**

---

# 15. Netto / Ivato

La modalità usa il componente e il contratto comuni.

Su desktop il controllo vive nella **testata della colonna Prezzo** dove previsto, non necessariamente nella testata generale del documento.

Il documento definisce/eredita:

- default;
- memoria operatore prevista;
- persistenza della modalità.

Il cambio Netto/Ivato cambia la rappresentazione del medesimo valore economico e non altera il significato della riga.

---

# 16. IVA

IVA usa il componente comune esistente.

Regole:

- dato alfanumerico;
- ricerca per codice;
- precedenza al codice durante il filtro;
- selezione da valori validi;
- snapshot nel documento;
- nessuna variante locale del controllo per singolo modulo salvo requisito dimostrato.

---

# 17. Sconto e totali

## 17.1 Sconto riga

Usa il componente comune.

## 17.2 Sconto documento

Quando un documento lo prevede, usa il contratto comune dello sconto extra documento.

Non creare implementazioni parallele.

## 17.3 Totale riga

Il totale è calcolato, non digitato.

La precisione economica segue il contratto comune:

- precisione sufficiente sugli unitari/intermedi;
- valori definitivi di riga arrotondati a due decimali euro;
- totale documento = somma dei valori definitivi delle righe.

---

# 18. Impegna / Carica / Scarica magazzino

Sono tre concetti distinti.

## 18.1 Impegna magazzino

Effetto su `Impegnata`. Non modifica Giacenza.

## 18.2 Carica magazzino

Effetto: `Giacenza +Q`.

## 18.3 Scarica magazzino

Effetto: `Giacenza -Q`.

## 18.4 UI comune, dominio distinto

È possibile riusare checkbox/toggle, layout, stile, accessibilità e base della cella.

Non si devono unificare:

- campo persistito;
- regola di default;
- effetto backend;
- significato.

---

# 19. Focus e tastiera

## 19.1 Un solo motore

Focus e navigazione devono vivere nel sistema comune, con il documento che fornisce ordine dei campi, identità delle celle, campi attivi, sola lettura, numero righe, creazione riga, eventuali hook specifici e predicato riga vuota.

## 19.2 Tab

- cella successiva;
- segue l'ordine delle colonne attive/focalizzabili;
- non salva;
- le voci di un popup non sono fermate del Tab.

## 19.3 Shift+Tab

- cella precedente;
- stessa logica comune.

## 19.4 Frecce verticali

- riga precedente/successiva;
- conserva la colonna quando possibile;
- applica fallback espliciti quando quella cella non esiste nella riga target.

## 19.5 Frecce orizzontali

Nei campi testuali prima editing/cursore, poi uscita dalla cella quando il cursore è al bordo.

## 19.6 Invio

> **Invio conferma il valore; non è un secondo Tab e non salva il documento.**

## 19.7 Mouse

Il comportamento comune deve evitare varianti locali e mantenere coerenza con la tastiera.

---

# 20. Ordinamento e spostamento righe

Questa specifica distingue ordine delle colonne e ordine delle righe.

## 20.1 Spostamento colonne

Lo spostamento libero delle colonne non è requisito corrente.

Restano:

- mostra/nascondi;
- ridimensionamento;
- preferenze.

## 20.2 Ordinamento righe

Quando previsto, deve usare un motore comune.

Deve preservare:

- identità stabile delle righe;
- snapshot;
- effetti;
- `lineNumber`/posizione persistita dove previsto.

## 20.3 Drag riga

Dove previsto, usa un unico comportamento comune e non sostituisce l'identità della riga con l'indice.

---

# 21. Identità stabile della riga

Una riga salvata mantiene il proprio `id`.

Una riga nuova deve avere anche una identità stabile lato client sufficiente a rendering, riordino, focus, card/table switch e update.

Non usare `track $index` come identità funzionale della riga.

Non cancellare/ricreare tutte le righe a ogni modifica solo per semplificare il salvataggio.

---

# 22. Feature gating

Le celle possono avere feature gate.

Esempio Shopify:

- tenant senza modulo Shopify → nessuna colonna Prezzo Shopify;
- la colonna non compare nemmeno nel selettore;
- nessun placeholder, warning o indicatore Shopify.

Il feature gate è una capacità fornita dal documento/configurazione, non un ramo hardcoded dentro ogni cella.

---

# 23. Estensioni specialistiche

Una estensione è ammessa quando esiste una reale differenza di dominio.

Esempi:

- Lotto / Scadenza;
- Seriali, dopo la relativa ricostruzione;
- campi di ricezione;
- altre informazioni realmente proprie del documento.

Regola:

> **estendere la riga comune, non sostituirla.**

---

# 24. Regole per non creare nuove duplicazioni

Prima di aggiungere codice locale a un documento, verificare:

1. esiste già un componente comune?
2. può essere esteso senza introdurre logica di tipo?
3. la differenza è UI o dominio?
4. può essere espressa come policy/configurazione?
5. esiste già un precedente in un altro documento?
6. il nuovo codice duplicherà scanner, ricerca, focus, IVA, quantità, prezzo o card?

Se la risposta mostra duplicazione, fermarsi e consolidare il punto comune.

---

# 25. Strategia di migrazione dell'esistente

## Fase 1 — protezione del nucleo comune

Prima di aumentare i consumatori, aggiungere/rafforzare i test sui componenti comuni critici:

- riga;
- header;
- quick-row;
- celle senza copertura;
- mobile/card;
- configurazione colonne.

## Fase 2 — catalogo canonico

Censire i cataloghi correnti e produrre:

- id canonici;
- etichette;
- larghezze;
- mapping legacy;
- strategia preferenze.

Nessuna rinomina distruttiva senza migrazione.

## Fase 3 — ricerca/scansione

Consolidare:

- motore ricerca;
- scanner;
- overlay;
- policy post-risoluzione.

Rimuovere copie solo dopo test equivalenti.

## Fase 4 — Vendita/Reso al banco

Migrare/verificare contro la specifica corrente.

## Fase 5 — Ordine cliente

Verificare che il riferimento mobile/ricerca sia un consumatore dello stesso comune, non una sorgente da copiare.

## Fase 6 — altri documenti

Procedere uno alla volta.

Rettifica/Inventario restano rinviati al loro blocco dedicato.

---

# 26. Test minimi del contratto comune

## LINE-001 — nessuna logica per tipo nel componente comune

Nessun ramo funzionale su nomi documento nelle celle/riga comuni; differenze fornite come policy/config.

## LINE-002 — configurazione colonne

Subset diversi rispettano disponibile/visibile/esclusa; una colonna esclusa non compare nel picker.

## LINE-003 — preferenze

Nascondere/ridimensionare, salvare e riaprire conserva le preferenze; una migrazione id non le perde.

## LINE-004 — desktop/mobile

Una sola vista operativa viva; dati, dirty e read-only invariati.

## LINE-005 — quantità

Stessa cella, policy min/step/validator differenti correttamente applicate.

## LINE-006 — IVA

Stesso componente e ricerca per codice.

## LINE-007 — U.M.

Stessa cella, snapshot di riga, nessun update automatico dell'anagrafica.

## LINE-008 — query di ricerca

Il solo testo di ricerca non viene persistito come riga documento.

## LINE-009 — scansione

Stesso motore scanner; policy documento applicata dopo la risoluzione; nessun salvataggio/movimento durante la scansione.

## LINE-010 — aggiunta rapida vs nuova riga

Su policy Banco: aggiunta rapida stessa variante → incremento; nuova riga esplicita stessa variante → due righe.

## LINE-011 — focus

Tab/Shift+Tab/frecce/Invio seguono il comportamento comune e non salvano.

## LINE-012 — feature gate Shopify

Tenant senza Shopify: colonna e voce picker assenti.

## LINE-013 — stock flags

Impegna, Carica e Scarica restano semanticamente distinti.

## LINE-014 — identità riga

Riordino/modifica/riapertura non sostituiscono inutilmente l'identità della riga.

---

# 27. Verifiche tecniche da mantenere in `03b`

Dopo ogni migrazione significativa aggiornare `03b` con:

- componenti comuni reali;
- documenti migrati;
- card locali residue;
- cataloghi colonne residui;
- scanner/ricerca duplicati;
- condizionali di tipo trovati;
- test presenti;
- test mancanti;
- gap di preferenze;
- misure datate utili.

Questi numeri non vanno copiati dentro questa specifica normativa.

---

# 28. Cose esplicitamente da NON fare

Non:

- creare un nuovo sistema parallelo di riga;
- riscrivere quantità/IVA/prezzo in ogni documento;
- costruire una card mobile autonoma per modulo;
- costruire scanner locali;
- costruire motori ricerca locali;
- fondere Impegna/Carica/Scarica;
- usare lo stesso `columnId` per concetti opposti;
- rinominare id persistiti senza migrazione;
- usare `track $index` come identità della riga;
- dedurre una regola funzionale dal comportamento del codice;
- migrare tutte le maschere in un colpo solo senza checkpoint;
- lasciare permanentemente un documento su una variante locale “temporanea”.

---

# 29. Criterio finale

La struttura è corretta quando:

> **aggiungere o correggere una funzione comune richiede modificare il punto comune e verificare i documenti interessati, non riscrivere lo stesso comportamento in ogni form.**

E contemporaneamente:

> **una differenza reale di dominio resta dichiarata nel documento/policy e non viene nascosta dentro il componente comune.**

---

## Fonti da usare insieme a questa specifica

- `VestiFlow_Contesto_Master_Progetto.docx`
- `CONTRATTO-COMUNE-DOCUMENTI.md`
- `03b-mappa-tecnica-righe-documento.md`
- specifiche dei singoli documenti
- `09-specifica-movimenti-per-riga.md`
- `12-specifica-collegamenti-documentali.md`
- specifica Pagamenti/Tesoreria quando pertinente

In caso di conflitto, prevalgono le decisioni più recenti confermate e la specifica funzionale specifica del documento per le sue eccezioni esplicite.
