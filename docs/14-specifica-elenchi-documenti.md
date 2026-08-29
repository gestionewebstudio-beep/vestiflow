# VestiFlow — Specifica comune elenchi operativi

## Contenitore comune, filtri, griglia, selezione, riepiloghi, azioni, ordinamento ed export

**Versione:** candidata 1.0-r5  
**Data:** 29/08/2026  
**Stato:** candidata consolidata definitiva per l'implementazione; layout, profili documentali, riepilogo compatto e policy colonne congelati  
**Ambito:** elenchi operativi/documentali VestiFlow  
**Riferimento UX:** coerenza strutturale Danea Easyfatt, adattata alla UI web/mobile VestiFlow  
**Fonti consolidate:** specifica comune elenchi r2 del 29/08/2026; precedente `docs/14` r2 del 28/08/2026; decisioni owner successive e specifiche di modulo prevalenti  
**Fonte unica:** questo file. ⛔ Le versioni r3 e r4 e i file `VestiFlow_Specifica_Comune_Elenchi_*` sono stati **eliminati** il 29/08/2026: una specifica normativa che esiste in tre copie non è una specifica, e la storia sta in `git log -p`.  
**Natura:** specifica normativa. Non è un audit, un diario dei commit o una proposta di nuove funzioni.

> Questa versione consolida il documento nuovo con i contratti già decisi nel precedente `docs/14`.
> Non introduce nuove funzioni per analogia.
> Dove una regola di modulo più recente è incompatibile con una regola generale precedente, prevale la regola di modulo più recente.
> Se durante l'implementazione emerge una decisione funzionale non coperta da questa specifica o dalle specifiche di modulo, l'implementazione si ferma e la decisione torna all'owner.

---

# 0. Decisione normativa da congelare

VestiFlow deve avere **un unico contenitore comune per gli elenchi operativi**.

Il contenitore è il telaio della pagina. Offre sempre le stesse **zone funzionali** e la stessa grammatica d'interazione; ogni modulo dichiara invece quali filtri, colonne, metriche, azioni, query e differenze di dominio utilizzare.

```text
CONTENITORE ELENCO COMUNE

┌─────────────────────────────────────────────────────────────┐
│ TESTATA                                                     │
│ Indietro · Titolo · Nuovo · azioni della pagina             │
├─────────────────────────────────────────────────────────────┤
│ RICERCA + FILTRI + CONTROLLI DI VISTA                       │
│ filtri dichiarati dal modulo                                │
│ desktop inline / mobile Filtri (n)                           │
├─────────────────────────────────────────────────────────────┤
│ DATI                                                        │
│ tabella / griglia / renderer dati del consumer               │
│ selezione · sorting · celle · sezioni                        │
├─────────────────────────────────────────────────────────────┤
│ TOTALI / RIEPILOGO COMPATTO                                 │
│ una fascia desktop; valori allineati alle colonne se utile   │
├─────────────────────────────────────────────────────────────┤
│ RIGA FUNZIONI                                               │
│ funzioni del profilo, sotto i totali                         │
└─────────────────────────────────────────────────────────────┘
```

Questa sequenza è normativa:

```text
dati
→ totali / riepilogo compatto
→ funzioni
```

Obiettivo esplicito: **massimizzare l'altezza disponibile per le righe**.

Il riepilogo desktop usa normalmente **una sola fascia orizzontale**. Quando una metrica corrisponde semanticamente a una colonna della griglia, il rendering può allinearla a quella colonna come un footer tabellare. Le metriche generali che non corrispondono a una colonna restano nella stessa fascia, in un gruppo compatto.

La riga delle funzioni sta **sotto i totali**. Non occupa spazio nella testata e non si confonde con i filtri.

## 0.1 Comune non significa contenuto identico

Il contenitore comune decide:

- impaginazione;
- posizione delle zone;
- comportamento desktop/mobile;
- grammatica visiva dei controlli equivalenti;
- resa dei filtri;
- conteggio filtri attivi;
- reset;
- loading/error/empty;
- selezione;
- posizione delle azioni;
- posizione del riepilogo;
- accessibilità;
- collegamento fra stato della vista e URL;
- infrastrutture equivalenti di griglia/export quando applicabili.

Il modulo decide:

- titolo;
- CTA `Nuovo`;
- ricerca sì/no e placeholder;
- filtri realmente esistenti;
- colonne;
- celle speciali;
- ordinamento predefinito;
- metriche;
- azioni;
- query/API;
- permessi;
- regole di dominio;
- eventuali differenze reali del renderer dati;
- export normativi o specifici.

Esempi:

```text
Ordini cliente
→ Periodo · Stato · Cliente

Ordini fornitore
→ Periodo · Stato · Fornitore

Corrispettivi
→ Periodo · Origine · Tipo · Sede · Raggruppa

un elenco senza ricerca
→ nessuna ricerca aggiunta per uniformità

un elenco senza riepilogo approvato
→ nessun riepilogo inventato
```

## 0.2 Un solo meccanismo filtri, configurazioni diverse

Il comportamento già presente nei Corrispettivi è il riferimento iniziale:

```text
desktop
→ filtri inline sopra l'elenco

mobile
→ un solo Filtri (n)
→ un solo SlidePanel
```

Desktop e mobile leggono **lo stesso stato**, usano gli stessi handler e producono la stessa query.

Il contenitore non inventa filtri di dominio. Rende quelli dichiarati dal modulo.

## 0.3 Un solo contenitore riepilogo, metriche diverse

Il riepilogo segue lo stesso principio:

```text
DOMINIO / MODULO
→ calcola o recupera valori canonici
→ dichiara metriche

CONTENITORE RIEPILOGO COMUNE
→ rende bande
→ label
→ valori
→ enfasi
→ tono
→ tooltip/note
→ responsive
```

Il contenitore **non calcola**:

- IVA;
- prezzi;
- sconti;
- Giacenza;
- Impegnata;
- Disponibile;
- residui;
- saldi;
- metriche fiscali;
- altri valori di dominio.

Corrispettivi è il riferimento visivo iniziale del riepilogo; le sue metriche fiscali restano specifiche del Registro.

## 0.4 Contenitore comune e motore tabella sono due responsabilità diverse

Un elenco può usare il contenitore comune anche se il proprio renderer dati non è ancora `DataTableComponent`.

Quando compatibile:

```text
contenitore comune
→ DataTableComponent
```

Quando esiste una differenza reale documentata, per esempio:

- grouping;
- subtotali;
- identità composita;
- card mobile specifica;

il consumer può mantenere temporaneamente il proprio renderer dati **dentro lo stesso contenitore comune**.

Non si degrada un elenco funzionante per poter dichiarare che usa la stessa tabella.

## 0.5 Regola anti-deriva

Questa specifica **non autorizza nuove funzioni**.

Durante l'unificazione è vietato:

- aggiungere un filtro perché «sarebbe utile»;
- aggiungere un riepilogo perché il contenitore lo supporta;
- aggiungere nuove metriche;
- cambiare formule economiche;
- cambiare stati o workflow;
- cambiare stock/movimenti;
- cambiare Shopify;
- cambiare pagamenti;
- cambiare routing di dominio;
- riscrivere query diverse solo per farle sembrare uguali;
- introdurre un secondo motore comune quando ne esiste già uno riusabile.

Se una differenza non è chiaramente tecnica e già coperta dalle specifiche:

```text
STOP
→ misura
→ riporta all'owner
→ nessuna decisione implicita
```

## 0.6 Gerarchia delle fonti

Questa specifica governa l'infrastruttura comune degli elenchi.

**Questa r5 sostituisce integralmente, per questo blocco, le precedenti r4/r3 e il vecchio `docs/14` come fonte normativa operativa.** Le versioni precedenti restano solo storico e non devono essere rilette per ridecidere il layout o i contratti già congelati qui.

Non sostituisce le specifiche di dominio.

In particolare:

- `docs/12` governa Includi/Genera e collegamenti documentali;
- `docs/17` governa Ordine fornitore;
- `docs/18` governa Ordine cliente manuale;
- le specifiche economiche governano segni e valori canonici;
- le specifiche Shopify governano ownership e canale;
- le specifiche di modulo governano filtri, metriche e azioni realmente approvate.

### Conflitti con regole UI precedenti

Se `regole-stile-ui` o altre regole trasversali precedenti descrivono ancora il riepilogo Corrispettivi in **due fasce desktop**, quella formulazione è superata da questa r5.

La decisione vigente è:

```text
desktop
→ una sola fascia compatta di totali/riepilogo
→ subito sotto i dati
→ funzioni subito sotto il riepilogo
```

Quando questa specifica entra nel repository come fonte approvata, **`regole-stile-ui` deve essere aggiornata nello stesso blocco documentale**, eliminando il riferimento alle due fasce come regola corrente. Non devono restare due testi normativi concorrenti.

---

# 1. Scopo

Questa specifica definisce il contratto comune di VestiFlow per:

- pagine elenco;
- testata;
- ricerca;
- filtri;
- controlli di presentazione;
- apertura delle righe;
- selezione;
- barra delle azioni;
- griglie tabellari desktop;
- resa mobile;
- colonne;
- ordinamento;
- ridimensionamento;
- conteggio risultati;
- riepiloghi;
- footer e metriche;
- loading/error/empty;
- stampa ed export quando equivalenti;
- coerenza fra UI, URL, API, stampa ed export.

L'obiettivo è condividere l'infrastruttura senza fondere domini differenti.

```text
infrastruttura comune
≠ riga universale
≠ colonna universale
≠ filtro universale
≠ metrica universale
≠ formula universale
≠ query universale
```

---

# 2. Famiglie di elenco

## 2.1 Elenchi documentali

Comprendono i record locali con identità documentale, numero o riferimento, data, soggetto e valori propri del documento, quando previsti.

Rientrano, quando dotati di elenco operativo:

- Preventivo;
- Proforma;
- DDT vendita;
- Fattura;
- Fattura accompagnatoria;
- Nota di credito;
- Arrivo merce;
- Registrazione fattura fornitore;
- Trasferimento;
- Rettifica;
- Vendita al banco;
- Reso al banco;
- Ordine cliente manuale;
- Ordine fornitore;
- altri documenti locali equivalenti approvati.

## 2.2 Stati funzionali negli elenchi

Non esiste una colonna `Stato` generica per tutti i documenti.

I due Ordini hanno il ciclo commerciale:

```text
Da confermare
Confermato
Concluso
Annullato
```

La semantica dei quattro stati non viene definita qui: appartiene a `docs/12`, `docs/17` e `docs/18`.

Questa specifica governa soltanto:

- posizione del filtro Stato;
- resa del valore;
- sorting;
- presenza nelle configurazioni delle liste;
- coerenza con l'API.

Non autorizza a:

- aggiungere `Stato` agli altri documenti;
- usare uno stato tecnico come filtro funzionale;
- usare lo stato come surrogato di permessi/routing;
- ridefinire gli effetti quantitativi dell'Ordine cliente;
- introdurre effetti quantitativi sull'Ordine fornitore.

## 2.3 Registri economici

Il Registro Corrispettivi è un registro economico derivato che unisce più origini.

La sua riga:

- non è una riga documento universale;
- può avere identità composta;
- mantiene riferimenti diversi secondo origine;
- applica metriche e segni economici propri;
- può supportare grouping e subtotali.

## 2.4 Movimenti

I Movimenti di magazzino sono eventi fisici.

Espongono, quando disponibili:

- quantità;
- direzione/tipo;
- data;
- Location;
- origine;
- documento sorgente;
- riga sorgente;
- prodotto/codici pertinenti.

Non assumono la semantica economica o gli stati di un documento.

## 2.5 Anagrafiche

Prodotti, Clienti e Fornitori possono adottare:

- shell;
- filtri;
- griglia;
- colonne;
- ordinamento;
- selezione;
- azioni;

quando la grammatica è equivalente.

Restano però entità con:

- filtri propri;
- colonne proprie;
- metriche proprie o nessun riepilogo;
- azioni proprie.

## 2.6 Report e analisi

Report, Analytics, Giacenze e Situazione mantengono formule e perimetri specifici.

Non vengono fusi in un riepilogo universale.

## 2.7 Inventario fisico

`inventory-count-list` può essere incluso nel **censimento tecnico** per conoscere l'infrastruttura esistente.

La sua migrazione funzionale al contenitore comune resta subordinata alla specifica Inventario fisico approvata.

Non si usa questa specifica per decidere comportamento, stati o workflow dell'Inventario.

## 2.8 Esclusioni

Non entrano automaticamente:

- lookup/scanner a risultato singolo;
- maschere di inserimento/modifica;
- griglie delle righe documento;
- dashboard;
- dettaglio documento;
- onboarding Shopify;
- nuove viste non ancora specificate.

---

# 3. Perimetro tecnico iniziale da verificare

Al 28/08/2026 erano stati individuati:

1. `document-list` — un componente con 9 profili:
   - `quote`;
   - `proforma`;
   - `sales-ddt`;
   - `invoice`;
   - `generic`;
   - `goods-receipt`;
   - `manual-unload`;
   - `purchase-invoice`;
   - `store-sale`;
2. `sales-order-list`;
3. `supplier-order-list`;
4. `corrispettivi-report`;
5. `stock-movements`;
6. `customer-list`;
7. `product-list`;
8. `supplier-list`;
9. `online-sale-list`;
10. `inventory-count-list` — censimento tecnico, migrazione subordinata alla specifica Inventario.

Questi numeri sono una fotografia, non una norma eterna.

Prima di implementare si riconfermano i consumer reali.

## 3.1 Fotografia tecnica di partenza

Misurazione del 28/08/2026 da riconfermare:

```text
mixin/stili list-page          ~18 consumer
colonne picker + service       ~16-17 consumer
primitive export               ~10 consumer
motore tabella comune             4 consumer
barra azioni comune               4 consumer
contenitore filtri comune          0 consumer
contenitore riepilogo comune       1 consumer circa
```

Il gap principale misurato è il contenitore filtri.

---

# 4. Danea come benchmark strutturale

Danea viene usato per capire la **grammatica costante** degli elenchi:

```text
titolo
ricerca
filtri
strumenti vista
griglia
selezione/azioni
totali
```

Cambiano:

- campi;
- colonne;
- filtri concreti;
- azioni;
- metriche;
- dominio.

Non si copia:

- grafica pixel-per-pixel;
- pannello laterale blu permanente;
- funzioni Danea non approvate in VestiFlow;
- workflow di dominio soltanto perché esistono nel benchmark.

---

# 5. Corrispettivi come baseline VestiFlow

Corrispettivi è il riferimento visivo e comportamentale iniziale perché possiede già:

- testata;
- filtri compatti;
- Periodo;
- multi-select;
- `Filtri (n)` su mobile;
- `SlidePanel`;
- `TableColumnPicker`;
- area elenco;
- conteggio;
- riepilogo finale a bande;
- export coerente coi filtri;
- URL canonico;
- una regione principale di scroll;
- grouping per giornata;
- subtotali;
- card mobile specifica.

Non è però il primo consumer da migrare meccanicamente al motore tabella comune.

Il contratto comune deve prima dimostrare di conservarne:

- grouping;
- subtotali;
- identità composita;
- resa mobile.

---

# 6. Architettura funzionale del contenitore

```text
COMMON LIST PAGE
┌──────────────────────────────────────────────────────────┐
│ LIST HEADER                                              │
│ Indietro · Titolo · Nuovo · azioni pagina               │
├──────────────────────────────────────────────────────────┤
│ LIST VIEW TOOLBAR                                        │
│ Ricerca · Filtri · Raggruppa · Colonne                  │
├──────────────────────────────────────────────────────────┤
│ LIST DATA REGION                                         │
│ tabella/griglia/lista mobile                             │
│ selezione · sort · celle · sezioni                      │
│ conteggio risultato                                     │
├──────────────────────────────────────────────────────────┤
│ LIST SUMMARY / TOTALS                                    │
│ una fascia compatta · metriche fornite dal modulo        │
├──────────────────────────────────────────────────────────┤
│ LIST FUNCTIONS                                           │
│ funzioni del profilo / selezione / filtrato              │
└──────────────────────────────────────────────────────────┘
```

I nomi tecnici dei componenti non sono prescritti.

Prima si riusa l'esistente.

---

# 7. Vocabolario obbligatorio

VestiFlow distingue:

| Funzione       | Significato                                     |
| -------------- | ----------------------------------------------- |
| **Modifica**   | maschera operativa del record                   |
| **Dettaglio**  | consultazione separata dalla maschera operativa |
| **Stampa/PDF** | output destinato alla stampa                    |

`Anteprima` non sostituisce automaticamente `Dettaglio`.

La stampa non è il Dettaglio.

---

# 8. Apertura delle righe e routing

## 8.1 Documenti locali

Per ogni documento locale con maschera operativa:

```text
clic/tap sulla riga
→ Modifica
```

Per gli Ordini:

```text
Ordine cliente manuale → Modifica
Ordine fornitore       → Modifica
```

Lo stato non decide la destinazione.

## 8.2 Shopify/read-only

Gli ordini posseduti dal canale Shopify restano read-only per ownership.

```text
Ordine Shopify online/POS
→ consultazione read-only
```

La decisione dipende dall'origine, non dallo stato.

## 8.3 Dettaglio

Il Dettaglio è un'azione distinta.

Il lavoro sugli elenchi non deve:

- eliminare rotte Dettaglio esistenti;
- rinominare Dettaglio in Stampa;
- usare Dettaglio come destinazione primaria dei documenti locali;
- creare un falso Dettaglio che apre la stessa Modifica.

## 8.4 Parità fra punti di ingresso

Per lo stesso record e utente:

```text
clic riga
ricerca globale
link trasversale
→ stessa destinazione canonica
```

quando il contesto di autorizzazione è equivalente.

## 8.5 Gesti vietati

Non usare come grammatica ordinaria:

- doppio clic;
- doppio tap;
- primo clic seleziona / secondo apre;
- long-press come unico modo di selezionare.

---

# 9. Testata comune

Schema:

```text
[Indietro] Titolo                         [Nuovo] [Azioni pagina]
```

`Nuovo`:

- compare solo dove previsto;
- rispetta feature gate e permessi;
- non viene dedotto dai filtri.

Le azioni pagina:

- appartengono alla pagina;
- non cambiano posizione con la selezione;
- su mobile possono entrare in menu nominati;
- non devono essere nascoste soltanto in un `...` anonimo.

---

# 10. Ricerca comune

Quando prevista:

- stessa zona;
- stessa componente/stile;
- debounce comune/configurabile;
- URL aggiornato quando riproducibile;
- non perde gli altri filtri;
- normalizza pagina/offset se presenti;
- stesso comportamento desktop/mobile.

Il modulo decide quali campi cercare.

La ricerca non viene aggiunta a una pagina che non ne ha bisogno.

---

# 11. Contratto comune dei filtri

Il contratto deve poter rappresentare almeno:

1. Periodo;
2. select singola;
3. select multipla;
4. entità ricercabile;
5. data singola;
6. intervallo date;
7. checkbox/toggle;
8. testo libero specifico;
9. controllo di presentazione.

Se due pagine usano lo stesso concetto:

- Periodo;
- Stato;
- Cliente;
- Fornitore;
- Sede;
- Tipo;
- Metodo pagamento;
- Operatore;

devono riusare lo stesso comportamento comune quando la semantica è equivalente.

Ordine visuale consigliato:

```text
Periodo
→ Tipo/Stato
→ Soggetto
→ Sede
→ filtri specifici
→ Raggruppa
→ Colonne
```

La ricerca resta separata.

---

# 12. Filtro Periodo

Il Periodo comune supporta almeno:

- Oggi;
- Ieri;
- Giorno specifico;
- Ultimi 7 giorni;
- Ultimi 30 giorni;
- Mese corrente;
- Mese scorso;
- Anno corrente;
- Mese di calendario;
- Trimestre;
- Anno di calendario;
- Personalizzato.

`Tutti` è disponibile soltanto dove previsto dal contratto della pagina o dalla famiglia.

Selettori condizionali:

```text
Giorno specifico → data
Mese              → mese + anno
Trimestre         → trimestre + anno
Anno              → anno
Personalizzato    → Dal + Al
```

I valori nascosti non devono continuare a filtrare.

## 12.1 Giorni civili

Il periodo è inclusivo sugli estremi e deve rappresentare gli stessi giorni civili in UI/API.

La scelta definitiva UTC/ora locale del motore Periodo resta separata se non già definita dalla specifica del modulo.

Non si decide osservando quale implementazione è più frequente.

---

# 13. Select singole e multiple

Select singola:

```text
Tutti
→ assenza di restrizione
```

quando il contratto della pagina lo consente.

Select multipla:

```text
insieme vuoto
= nessuna restrizione
= Tutti
```

Non creare contemporaneamente:

```text
checkbox Tutti
+ tutte le singole checkbox
```

se l'insieme vuoto rappresenta già `Tutti`.

---

# 14. Soggetti

Il contenitore supporta un controllo entità comune ricercabile:

- Cliente;
- Fornitore;
- Soggetto;
- Cliente/Fornitore.

La pagina dichiara il dominio accettato.

Uniformità = interazione e rendering, non fusione dei domini.

---

# 15. Sede / Location

Quando pertinente:

- stesso controllo;
- stessa posizione;
- stessa grammatica;
- tenant-safe;
- scope utente rispettato lato API.

`Location non determinata` non va attribuita automaticamente.

Se l'esclusione di record senza Location modifica un riepilogo rilevante, l'utente deve essere avvisato secondo la policy del modulo.

---

# 16. Raggruppa e controlli di presentazione

`Raggruppa` non è un filtro se non cambia il dataset.

Quindi:

- sta nella toolbar;
- non conta in `Filtri (n)`;
- può stare nell'URL;
- non entra nella query dati se non serve;
- può azzerare sort incompatibili secondo policy del modulo.

Stessa regola per altri controlli di sola presentazione.

---

# 17. Desktop e mobile

## 17.1 Desktop — decisione owner

Desktop usa filtri **inline sopra l'elenco**.

```text
[Testata]
[Ricerca opzionale] [Periodo] [Tipo] [Stato] [Soggetto] [Sede] [...] [Raggruppa] [Colonne]
[Dati]
[Totali / riepilogo compatto]
[Funzioni]
```

Non viene adottato il pannello laterale permanente Danea.

## 17.2 Mobile

Mobile usa:

```text
[Testata / Nuovo]
[Filtri (n)] [Colonne] [controlli vista]
[Card/righe]
[Riepilogo compatto]
[Funzioni]
```

I filtri sono resi in un unico `SlidePanel`.

## 17.3 Una sola verità

Desktop e mobile:

- stessi valori;
- stessi handler;
- stessi query param;
- stessa richiesta;
- stessa policy reset.

Cambia soltanto la veste.

## 17.4 Una sola rappresentazione attiva

La stessa riga non deve esistere in due DOM attivi sulla stessa viewport.

Desktop e mobile sono due render dello stesso stato.

---

# 18. URL come fonte di verità

Quando applicabile, l'URL conserva:

- ricerca;
- periodo/date;
- stato;
- tipo;
- soggetto;
- sede;
- filtri specifici;
- sort;
- grouping.

I default deterministici possono essere omessi.

Non devono esistere due parametri per la stessa verità.

Non vanno nell'URL:

- pannello aperto;
- menu aperto;
- hover;
- focus;
- altri stati effimeri.

---

# 19. Conteggio filtri attivi e reset

`Filtri (n)` conta solo restrizioni opzionali.

Non contano:

- Periodo obbligatorio/default, quando classificato così dalla pagina;
- Raggruppa;
- sort;
- Colonne.

La ricerca resta separata salvo futura decisione trasversale.

`Azzera filtri`:

- rimuove filtri opzionali;
- ripristina default;
- non resetta Colonne;
- non resetta controlli di presentazione che non sono filtri;
- normalizza URL.

Badge e reset devono essere comuni/configurabili.

---

# 20. Selezione

## 20.1 Selezione multipla negli elenchi coperti

Negli elenchi operativi coperti dal contratto:

```text
checkbox riga
→ selezione/deselezione

checkbox testata
→ selezione generale secondo il contratto della lista

clic riga
→ apertura
```

La checkbox resta distinta dall'apertura.

Lookup/scanner e risultati singoli sono esclusi.

## 20.2 La checkbox non dipende dal numero di azioni

La selezione è una capacità comune stabile.

Non compare soltanto quando esiste una certa azione.

Nuove azioni future non devono richiedere un nuovo layout.

## 20.3 Identità

La selezione conserva identificativi canonici.

Per registri multi-origine, l'identità include origine quando necessario.

Non usa riferimenti DOM.

## 20.4 Cambio dataset

Normalmente la selezione non deve mantenere record diventati invisibili o fuori dataset dopo cambio filtri.

Se un flusso vuole conservare selezioni attraverso filtri/pagine per comporre un documento:

```text
policy specifica del modulo
→ decisione esplicita
```

Non si nasconde nella primitiva comune.

## 20.5 Riga selezionata

La selezione usa un leggero cambio di sfondo comune.

Il cursore/chevron di apertura compare solo dove esiste navigazione/apertura.

---

# 21. Riga delle funzioni / ListActionsBar

## 21.1 Posizione normativa

La riga delle funzioni è stabile:

```text
dati
→ totali / riepilogo
→ funzioni
```

Non:

- nella testata;
- mescolata ai filtri;
- sopra i totali;
- sticky in fondo allo schermo;
- visibile soltanto quando qualcosa è selezionato.

La separazione concettuale è obbligatoria:

```text
FILTRI / VISTA
→ decidono cosa e come vedere

TOTALI / RIEPILOGO
→ descrivono il risultato filtrato

FUNZIONI
→ agiscono sui record o sull'intero filtrato
```

Stampa, PDF, Excel, CSV/Esporta e le altre operazioni della pagina sono **funzioni**, non filtri né controlli di vista. Nel layout comune stanno normalmente nella riga funzioni inferiore, salvo eccezione di modulo esplicitamente approvata.

`Nuovo` resta invece nella testata perché crea un nuovo record e costituisce la CTA primaria della pagina.

## 21.2 Stato con zero/una/più selezioni

La posizione resta invariata.

La selezione può cambiare:

- ambito;
- abilitazione;
- conteggio;
- testo;
- motivo di disabilitazione.

Non deve cambiare la struttura.

## 21.3 Arità comune

Il contratto comune usa:

| `requires`  |       0 selezionati |      1 |           2+ |
| ----------- | ------------------: | -----: | -----------: |
| `none`      | attiva sul filtrato | attiva |       attiva |
| `one`       |        disabilitata | attiva | disabilitata |
| `oneOrMore` |        disabilitata | attiva |       attiva |

I motivi standard appartengono alla primitiva comune.

I vincoli di dominio possono fornire un motivo specifico.

## 21.4 Ambito filtrato vs selezione

Quando l'azione supporta l'intero risultato filtrato:

```text
0 selezionati
→ intero risultato corrente dei filtri

1+ selezionati
→ soltanto elementi selezionati
```

La selezione prevale sui filtri.

`filtered` non significa:

```text
pagina caricata
righe attualmente nel DOM
```

Su dataset remoto/paginato serve un endpoint che conosca l'intero filtro.

Se tale endpoint non esiste:

```text
azione = oneOrMore
```

e non si simula una capacità assente.

## 21.5 Comandi disabilitati

Quando una funzione deve spiegare il motivo:

- resta raggiungibile da tastiera;
- usa `aria-disabled`;
- il click è bloccato dal componente;
- la spiegazione è accessibile via mouse e focus.

Questa regola non obbliga ogni pulsante disabilitato dell'app ad avere lo stesso pattern.

## 21.6 Mobile

Su mobile la sequenza resta:

```text
card
→ riepilogo compatto
→ funzioni
```

Le funzioni possono essere raccolte in menu nominati quando lo spazio non consente di mostrarle tutte.

Non usare un `...` anonimo come unica casa delle funzioni principali.

---

# 22. Colonne e preferenze

Riutilizzare:

- `TableColumnPickerComponent`;
- `TableColumnPreferenceService`;
- `TableViewId`;
- configurazioni colonne esistenti.

## 22.1 Visibilità e preset

Per utente × tenant × vista si persistono:

- preset;
- colonne visibili.

Il comando `Colonne` serve quindi a **mostrare/nascondere** le colonne secondo il contratto già esistente.

## 22.2 Ordine delle colonne — decisione owner 29/08/2026

Per questa fase l'ordine delle colonne è **fisso e dichiarato dal profilo/configurazione**.

Non si implementano:

- drag&drop delle intestazioni;
- riordino manuale delle colonne;
- persistenza dell'ordine personale delle colonne;
- meccanismi temporanei di riordino validi solo fino al refresh.

Motivo funzionale: un riordino manuale che non viene salvato produce un'esperienza incompleta e non giustifica nuova complessità nel primo blocco di unificazione.

Quindi:

```text
Colonne
→ visibilità/preset

NON
→ riordino manuale
```

Se in futuro si vorrà rendere l'ordine personalizzabile, la funzione dovrà nascere insieme alla **persistenza dell'ordine per utente × tenant × vista**. Il drag senza persistenza non è un obiettivo.

## 22.3 Resize

Il resize già esistente resta consentito dove oggi previsto:

- usa la direttiva comune;
- non introduce un secondo meccanismo locale;
- resta temporaneo nella sessione della pagina salvo futura decisione diversa.

La decisione «ordine colonne fisso» non elimina il resize delle larghezze.

## 22.4 Allineamento riepilogo ↔ colonne

Il target funzionale è:

```text
metrica che corrisponde a una colonna
→ può essere allineata sotto quella colonna

metrica generale
→ resta nella zona libera della stessa fascia
```

L'implementazione **non deve introdurre un nuovo motore di misurazione DOM a runtime** soltanto per inseguire le larghezze di una tabella `table-layout:auto`.

Prima si verifica se il consumer può riusare una fonte di larghezze già esistente e condivisa, per esempio i contratti già presenti per:

- distribuzione larghezze;
- resize;
- visibilità colonne.

Se l'allineamento preciso richiede invece nuova infrastruttura complessa o una modifica trasversale `auto/fixed`, ci si ferma e si riporta all'owner. La fascia compatta resta corretta anche senza allineamento pixel-perfect.

Questa specifica decide **il risultato funzionale**, non impone una nuova architettura tecnica per ottenerlo.

### ⭐ Verifica ESEGUITA il 29/08/2026 — esito: fascia esterna, senza allineamento

Il paragrafo qui sopra chiede di verificare prima di costruire, e di fermarsi se serve
infrastruttura nuova. **La verifica è stata fatta, e la decisione è dell'owner.**

Cosa si è misurato sul Registro Corrispettivi, che è il consumer di riferimento:

```text
tabella           table-layout: auto        il browser calcola le larghezze
                                            internamente: nel DOM le celle non
                                            portano nessun `width` leggibile

riepilogo         componente FRATELLO       fuori dalla regione di scroll, perché
                                            deve restare fermo mentre le righe
                                            scorrono
```

Le due strade possibili, e perché nessuna delle due si prende adesso:

|                                                                                                                                       |                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| misurare il DOM a runtime e rispecchiare le larghezze                                                                                 | ⛔ è esattamente il «nuovo motore di misurazione» che §22.4 vieta                                     |
| adottare le larghezze dichiarate già esistenti (`line-column-widths.store`, `column-width-distribution.util`, la direttiva di resize) | ⛔ vivono su `table-layout: fixed`: adottarle è la modifica trasversale `auto/fixed` che §22.5 rinvia |

> **Decisione owner: i totali stanno in una fascia FISSA ed ESTERNA, su una riga, senza
> allineamento alle colonne.**

⭐ **La fascia compatta resta corretta**, come §22.4 stesso prevede: l'obiettivo era
recuperare spazio verticale, e una fascia sola lo recupera anche senza allineamento.

⚠️ **Il subtotale di RAGGRUPPAMENTO è un'altra cosa e non si tocca.** «Totale giornata»
è un `<tr>` **dentro** la tabella, quindi si allinea da sé — gratis, anche con
`table-layout: auto`, perché è la tabella a mettere la quinta cella nella quinta colonna.
Funziona già oggi ed è corretto. La decisione qui sopra riguarda **solo** la fascia
finale, che è fuori dalla tabella e non ha colonne sotto cui stare.

⭐ **Quando l'allineamento tornerà sul tavolo**, la strada è la seconda: le larghezze
dichiarate sono lo **stesso prerequisito** di allineamento, resize e riordino colonne —
un lavoro solo che ne abilita tre. Ma è una decisione `auto/fixed`, e §22.5 la rinvia.

## 22.5 Colonna stretta — decisione ancora rinviata

Non è consolidata una regola globale unica fra:

- `table-layout: auto`;
- `table-layout: fixed`;
- clipping;
- ellissi;
- larghezze iniziali;
- dimensionamento sul contenuto.

Finché non si decide:

- preservare comportamento del consumer;
- non introdurre globalmente `auto`/`fixed`;
- non rimuovere `truncate`;
- non aggiungere `min-width` per analogia;
- non cambiare più consumer contemporaneamente su questo punto.

---

# 23. Motore griglia / tabella

## 23.1 Adottare, non ricostruire

Esistono già:

- `DataTableComponent`;
- `TableColumnResizeDirective`;
- `TableColumnPreferenceService`;
- `TableColumnPickerComponent`;
- `DataTableSort[]`;
- comparatori condivisi;
- mixin/list styles.

Prima di creare un'altra primitiva si verifica il riuso.

## 23.2 Responsabilità comuni

Nei consumer compatibili il motore governa:

- `thead`/`tbody`;
- colonne visibili;
- selezione;
- sezioni;
- footer di sezione;
- ordinamento;
- resize;
- accessibilità header;
- eventi riga.

## 23.3 Responsabilità di dominio

Restano nel modulo/configurazione:

- contenuto celle;
- badge;
- link;
- icone;
- tipografia specifica motivata;
- filtri concreti;
- azioni;
- metriche;
- segno economico;
- destinazione;
- renderer mobile specifico motivato.

Il motore comune non contiene:

```text
if fattura
if movimento
if corrispettivo
```

## 23.4 Celle speciali

Usare template/slot/adattatori tipizzati.

Non convertire contenuti strutturati in stringhe soltanto per farli entrare nella tabella.

## 23.5 Sezioni

Il motore deve supportare:

- intestazione sezione opzionale;
- righe;
- footer sezione opzionale.

Una tabella piatta è una sezione senza header/footer.

I subtotali Corrispettivi arrivano dalla fonte canonica e non sono ricalcolati dal motore.

---

# 24. Grammatica visiva comune

Corrispettivi resta il riferimento visuale.

Le decisioni consolidate da preservare sono:

| Elemento           | Regola                                     |
| ------------------ | ------------------------------------------ |
| corpo tabella      | `12px` / `--text-xs`                       |
| padding celle      | `4px × 12px`                               |
| altezza testata    | `32px` dichiarati                          |
| intestazioni       | maiuscole con tracking                     |
| divisori verticali | assenti                                    |
| contrasto testata  | token dedicati ad alto contrasto           |
| numeri             | allineati; cifre tabulari quando opportuno |
| filtri             | grammatica visiva coerente col Registro    |
| ordinamento        | grammatica visiva/interattiva comune       |
| riga funzioni      | dopo le righe, prima dei totali            |

Una differenza resta locale solo se motivata dal dominio.

Non creare token/custom property per conservare divergenze accidentali.

Ogni promozione grafica comune richiede verifica visiva.

---

# 25. Ordinamento

## 25.1 Contratto

`DataTableSort[]` è la grammatica comune.

Query param, DTO e endpoint sono serializzazioni dello stesso contratto.

## 25.2 Più chiavi

Il ciclo è:

```text
assente
→ crescente

crescente
→ decrescente

decrescente
→ rimossa
```

Le altre chiavi restano.

Una chiave secondaria premuta diventa primaria.

## 25.3 Accessibilità

- `aria-sort` solo sulla primaria;
- direzione/priorità secondarie nel nome accessibile;
- priorità visibile solo con almeno due chiavi.

## 25.4 Valore canonico

Sort su valori canonici:

- timestamp/data;
- quantità numerica;
- importo numerico;
- etichetta di dominio appropriata.

Non sul testo formattato casualmente della cella.

## 25.5 Intero dataset

```text
dataset completo già caricato
→ sort client ammesso

lista remota/paginata
→ sort API sull'intero filtrato
```

Vietato ordinare solo la pagina visibile fingendo di aver ordinato tutto.

## 25.6 Persistenza

Il sort è temporaneo salvo decisione futura.

Alla riapertura torna il default della pagina.

## 25.7 Export

Un export dichiarato come **vista corrente** conserva:

- filtri;
- sort;
- scope tenant/Location;
- colonne previste dal contratto dell'azione.

Un export normativo diverso deve dichiararlo.

---

# 26. Regione scroll e conteggio risultati

Quando il layout lo consente:

- una sola regione principale di scroll dati;
- testata/toolbar stabili;
- riepilogo in posizione prevedibile.

Il conteggio distingue:

```text
righe caricate
≠ totale filtrato
```

Non confondere row count e metriche economiche.

---

# 27. Riepilogo comune dell'elenco

## 27.0 Layout desktop: una fascia compatta

Per gli elenchi documentali il riepilogo desktop usa come default **una sola riga/fascia**, subito sotto i dati e subito sopra le funzioni.

Schema:

```text
┌──────────────────────────────────────────────────────────────┐
│ N voci        metrica libera        NETTO     IVA     TOTALE │
└──────────────────────────────────────────────────────────────┘
```

Regole:

- `N voci`/conteggio può stare nella prima cella/zona a sinistra;
- quando una metrica corrisponde a una colonna visibile, può allinearsi alla stessa colonna;
- una metrica generale senza colonna corrispondente resta nella stessa fascia;
- niente seconda banda desktop salvo eccezione esplicita del modulo;
- niente ricalcoli nel renderer;
- il riepilogo deve occupare meno altezza possibile senza perdere leggibilità;
- sul mobile lo stesso contenuto può ridisporsi su più righe/card compatte.

L'allineamento alle colonne è **opportunistico, non obbligatorio a costo di nuova complessità**: si riusa l'infrastruttura larghezze esistente quando disponibile; non si crea un sistema di misurazione DOM dedicato soltanto per il footer.

Corrispettivi oggi usa due bande: nella convergenza al contenitore comune le stesse metriche devono essere **compattate in una fascia desktop**, senza modificarne valori, segni o semantica.

## 27.1 Responsabilità

Il componente rende, il dominio calcola.

Il contratto deve supportare:

- una o più bande;
- metriche monetarie;
- quantità;
- conteggi;
- label;
- `value`/`displayValue`;
- tone/kind;
- emphasis;
- tooltip/note;
- visibilità.

## 27.2 Corrispettivi come esempio

```text
BANDA 1 — fatti/conteggi
Rettifiche (4)   −205,01 €
Annullamenti      2
Vendite           8

BANDA 2 — risultati
Imponibile       517,99 €
IVA               96,02 €
Totale vendite   819,02 €
Corrispettivo     614,01 €
```

I numeri sono esempio di forma; la fonte canonica resta il dominio Corrispettivi.

## 27.3 Intero risultato filtrato

Il riepilogo pagina rappresenta:

```text
intero risultato filtrato
```

non soltanto:

```text
pagina visibile
righe caricate
```

Se necessario, una lista paginata usa un endpoint summary con gli stessi filtri.

## 27.4 Riepilogo pagina vs riepilogo selezione

Sono distinti:

```text
riepilogo pagina
→ tutto il filtrato

riga funzioni / selezione
→ elementi selezionati
→ eventuale totale selezionato
```

Non si fondono.

---

# 28. Riepiloghi operativi — contratto specifico

Questa sezione vale soltanto per pagine classificate dalla propria specifica come **riepilogo operativo**.

Non si applica automaticamente a tutti gli elenchi.

Per tali pagine, salvo specifica più recente diversa:

- nessuna paginazione visibile;
- apertura predefinita sugli ultimi 30 giorni;
- voce esplicita `Tutti`;
- nessun tetto arbitrario sul numero di righe;
- il contenimento iniziale è il Periodo;
- con Periodo attivo, le date effettive sono nell'URL;
- scegliendo `Tutti`, le date vengono rimosse dall'URL.

Corrispettivi è il riferimento iniziale.

Una pagina non diventa riepilogo operativo soltanto perché possiede un footer.

---

# 29. Footer, metriche e segno economico

## 29.1 Metriche specifiche

Il contenitore è comune; le metriche no.

Esempi:

- documenti: aggregazioni documentali approvate;
- Registrazione fattura fornitore: valori documento/saldo se previsti;
- Corrispettivi: vendite, rettifiche, corrispettivo;
- Movimenti: quantità entrata/uscita se approvate;
- anagrafiche: nessun footer o metriche specifiche.

Non introdurre una metrica perché il componente può renderla.

## 29.2 Nessun secondo motore economico

Un riepilogo:

- legge valori canonici persistiti;
- applica filtri;
- applica il verso già deliberato;
- aggrega.

Non:

- ricalcola prezzi;
- ricalcola sconti;
- ricalcola IVA;
- rivaluta storico con listino/prezzo corrente;
- ricostruisce il documento dalle righe.

Se manca un valore canonico:

```text
gap dichiarato
```

non sostituzione con dato anagrafico corrente.

## 29.3 Autorità del segno economico

La stessa autorità già centralizzata deve essere usata dove pertinente.

Regole:

```text
Fattura                  → +
Fattura accompagnatoria  → +
Nota di credito          → −
Vendita al banco         → +
Reso al banco            → −
Vendita online           → +
Rimborso online          → −
```

Casi di accettazione:

```text
Fattura 100,00 + Nota di credito 30,00 = 70,00

Vendita 100,00 + Reso 30,00 = 70,00
```

La stessa autorità serve:

- totale selezione;
- riepilogo/footer;
- stampa elenco;
- CSV;
- Excel;
- report equivalenti.

Non creare un secondo calcolo del segno dentro il contenitore.

## 29.4 Coerenza UI/export

Non è ammesso:

```text
UI      = 70
CSV     = 130
Stampa  = 130
```

sullo stesso dataset/contratto.

---

# 30. Esempi di metriche per modulo

Sono esempi di forma, non autorizzazioni a creare nuove metriche.

- Preventivi: conteggio, valori solo se già canonici/approvati.
- Ordini cliente: conteggio, valori persistiti, eventuali metriche quantitative solo da fonte canonica.
- Ordini fornitore: conteggio/valori approvati; nessuna metrica `In arrivo` introdotta per analogia.
- Fatture: numero documenti, imponibile, IVA, totale, residuo solo se approvato.
- Vendita/Reso al banco: metriche di registro quando previste.
- Registrazioni fatture fornitori: totale, IVA, saldo se previsto.
- Corrispettivi: metriche proprie del Registro.
- Movimenti: quantità e valori solo se già canonici.

---

# 31. Matrice filtri iniziale

Per i profili congelati al §42-bis prevale la matrice specifica del §42-bis.12. Per gli altri profili questa matrice resta indicativa e va verificata prima di implementare.

| Elenco                          | Filtri/controlli attesi                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Preventivi                      | Periodo · Cliente                                                                                    |
| Ordini cliente                  | Periodo · Stato · Cliente                                                                            |
| Ordini fornitore                | Periodo · Stato · Fornitore                                                                          |
| Fatture                         | Periodo · Tipo · Stato/Saldo se previsto · Cliente · eventuale Pagamento                             |
| DDT vendita                     | Periodo · Stato se previsto · Cliente/Soggetto · DDT da fatturare                                    |
| Vendita/Reso al banco           | Periodo · Tipo · Cliente · eventuale Pagamento · Operatore · Sede se prevista                        |
| Arrivi merce                    | Periodo · Fornitore · Sede/Location · filtri specifici già esistenti                                 |
| Registrazioni fatture fornitori | Periodo · Stato saldo · Fornitore                                                                    |
| Corrispettivi                   | Periodo · Origine · Tipo · Sede · Raggruppa                                                          |
| Movimenti                       | Periodo · Tipo/Stato movimento · Cliente/Fornitore · Prodotto · Lotto/Seriale · Location se prevista |

Questa tabella **non autorizza a inventare filtri**.

Ogni filtro deve avere:

- fonte normativa;
- oppure comportamento già approvato.

---

# 32. Loading, error, empty state e warning

Il contenitore governa la forma di:

- loading;
- skeleton;
- errore;
- retry;
- empty state;
- empty state filtrato;
- slot warning.

Il modulo fornisce:

- testo;
- icona;
- CTA;
- warning specifici.

Un 403 non deve essere trasformato silenziosamente in:

```text
nessun dato
```

quando il normale contratto errori della pagina prevede un errore.

---

# 33. Stampa, Excel ed Esporta

Sono azioni distinte.

| Azione      | Contratto                                 |
| ----------- | ----------------------------------------- |
| **Stampa**  | rappresentazione stampabile               |
| **Excel**   | foglio realmente compatibile con Excel    |
| **Esporta** | formati/tracciati dichiarati dalla pagina |

Excel non è un CSV rinominato.

## 33.1 Permessi

Ogni `Esporta` richiede:

```text
reports.export
```

oltre al diritto di vedere i dati.

La verifica esiste anche lato API.

Il permesso Excel non si deduce automaticamente: dipende dalla specifica della pagina.

## 33.2 Filtri e sort

Export della vista:

- stessi filtri;
- stesso scope;
- stesso sort;
- stesso dataset logico.

Stampa/export non ricostruiscono metà dei filtri localmente.

## 33.3 Builder comune

Gli export equivalenti convergono sulla primitiva comune.

Un builder parallelo resta soltanto se esiste una differenza reale documentata.

La convergenza del builder e il contratto B8 sort schermo/export sono due lavori distinti.

---

# 34. Tipi che convivono nello stesso elenco

La responsabilità appartiene alla configurazione del modulo, non al shell.

Esempi:

```text
Fatture
→ Fattura
→ Accompagnatoria
→ Nota di credito

Banco
→ Vendita
→ Reso
```

Il modulo dichiara i tipi.

Il dominio dichiara:

- segno;
- metriche;
- filtri;
- azioni.

---

# 35. Mobile dei riepiloghi

## 35.1 Card

La card Corrispettivi è il riferimento iniziale:

- gerarchia chiara;
- label a sinistra;
- numeri a destra quando coerente;
- chevron = navigazione;
- nessun chevron se non apre;
- nessuna espansione implicita.

Una pagina può proiettare una card specifica quando quella generica perde significato.

## 35.2 Card riepilogo vs card riga documento

Sono componenti diversi:

```text
card riepilogo
→ consultazione/navigazione

card riga documento
→ editing/compilazione
```

Non vanno unificati.

---

# 36. Permessi, tenant, Location

Il frontend non sostituisce i controlli API.

Il shell non decide l'autorizzazione.

Ogni API deve conservare:

- tenant;
- Location;
- permessi;
- ownership;
- feature gate.

Un permesso Export non amplia il perimetro dati.

Il refactor di elenco non deve indebolire le guardie Location introdotte nel backend.

---

# 37. Accessibilità

Requisiti comuni:

- checkbox native o equivalenti accessibili;
- focus visibile;
- apertura tastiera coerente col click;
- checkbox/comandi interni non propagano l'apertura riga;
- motivazioni di azioni disabilitate raggiungibili da tastiera;
- nessuna funzione essenziale solo hover;
- `aria-sort` coerente;
- priorità sort accessibile;
- numeri non comunicati soltanto via colore;
- regioni nominate;
- touch target adeguati;
- almeno una riga reale nei test dei consumer migrati.

---

# 38. Performance

Il contratto comune deve evitare regressioni:

- debounce comune/configurabile;
- confronto query per contenuto quando necessario;
- cambi di sola presentazione non ricaricano dati;
- opzioni anagrafiche non ricaricate inutilmente;
- riepilogo e righe usano stessi filtri canonici;
- sort API sulle liste grandi;
- niente aggregazioni del solo subset caricato quando il riepilogo dichiara intero filtrato;
- nessun doppio fetch desktop/mobile per lo stesso stato.

---

# 39. Contratto concettuale di configurazione

La forma TypeScript reale va decisa riusando i contratti esistenti.

Il risultato deve essere concettualmente equivalente a:

```text
ListPageConfig

identity
  title
  viewId
  rowLabel

header
  createAction
  pageActions

search
  enabled
  placeholder

filters[]
  id
  label
  kind
  options/source
  default
  multiple
  searchable
  countsAsActive
  urlKey

presentationControls[]
  groupBy
  ...

columns
  definitions
  presets

selection
  enabled
  actions

summary
  enabled
  metric provider/config

data
  query parser
  loader
  summary loader

routing
  row open policy

export
  actions/config
```

Non creare un secondo set di tipi solo per aderire a questo pseudomodello.

---

# 40. Riutilizzo obbligatorio dell'esistente

Prima di creare componenti nuovi censire almeno:

- `DataTableComponent`;
- `ListActionsBarComponent`;
- `SelectMenuComponent`;
- `SlidePanelComponent`;
- `TableColumnPickerComponent`;
- `TableColumnPreferenceService`;
- `ListAction`;
- `list-export.util`;
- `DocumentTotalsComponent` come pattern rendering-only;
- `CorrispettiviSummaryComponent`;
- `CorrispettiviOrdersTableComponent`;
- configurazioni registri/documenti;
- configurazioni colonne;
- mixin/stili lista;
- parser/query param esistenti;
- componenti Periodo esistenti.

Obiettivo:

```text
promuovere
riusare
configurare
```

non:

```text
riscrivere
duplicare
sostituire per moda architetturale
```

---

# 41. `document-list` come asset già condiviso

`document-list` serve nove profili con una sola implementazione.

Non va migrato nove volte.

Da riusare:

- configurazioni per profilo;
- `salesDocumentRegisterConfig`;
- filtri da config;
- `ListActionsBar`;
- `TableColumnPicker`;
- routing comune;
- `DataTable`/`DocumentTable`;
- principio profilo/configurazione.

Da eliminare progressivamente soltanto quando sostituibili senza regressione:

- rendering locale di filtri equivalenti;
- markup desktop/mobile duplicato;
- helper locali equivalenti a contratti comuni.

Nella matrice di migrazione è:

```text
1 consumer fisico
+ 9 configurazioni da verificare
```

---

# 42. Corrispettivi: cosa generalizzare e cosa lasciare specifico

## 42.1 Da usare come baseline

- densità;
- filtri;
- Periodo;
- multi-select;
- mobile `Filtri (n)`;
- Colonne;
- summary;
- warning;
- row count;
- URL;
- una regione scroll;
- card mobile;
- grouping/subtotali quando attivi.

## 42.2 Da generalizzare

- rendering filtri/config;
- pannello mobile;
- active-filter count;
- reset;
- summary container;
- row count;
- slot warning;
- posizione Colonne;
- azioni equivalenti.

## 42.3 Da lasciare specifico

- Origine;
- Tipo riga;
- Sede;
- logica fiscale;
- metriche;
- sorgente dati;
- export commercialista;
- grouping/subtotali;
- identità composita;
- card mobile finché il comune non la supporta senza perdita.

Corrispettivi non è il primo consumer della migrazione DataTable.

---

# 42-bis. Profili documentali: filtri fissi, riepiloghi e benchmark Danea

Questa sezione congela il **profilo minimo della pagina elenco** per i documenti indicati dall'owner il 29/08/2026.

Le regole qui sotto prevalgono sulla matrice generica del §31 quando più specifiche.

## 42-bis.1 Regole comuni ai profili

### Periodo

Tutti i profili indicati come `Periodo` riusano **lo stesso controllo data comune**.

Il controllo deve poter rappresentare almeno:

- Tutti;
- Oggi;
- Ieri;
- Ultimi 7 giorni;
- Ultimi 30 giorni;
- Settimana corrente;
- Settimana scorsa;
- Mese corrente;
- Mese scorso;
- Trimestre corrente;
- Trimestre scorso;
- Anno corrente;
- Anno scorso;
- mese di calendario;
- intervallo personalizzato `Dal / Al`.

La UI può raggruppare le scelte meno frequenti sotto `Altro…`, come nel benchmark Danea, senza cambiare il contratto.

Il filtro Periodo:

- è sempre lo stesso concetto fra questi profili;
- usa giorni civili coerenti fra UI e API;
- scrive date riproducibili nell'URL quando applicabile;
- non viene reimplementato localmente per documento.

### Stato commerciale Ordini

Per Ordine cliente e Ordine fornitore il filtro Stato usa soltanto:

```text
Tutti
Da confermare
Confermato
Concluso
Annullato
```

La semantica appartiene alle specifiche Ordini.

### Stato economico Proforma/Fatture

Per Proforma e Fatture il filtro non è uno stato documentale.

È uno **stato economico/di saldo**:

```text
Tutti
Da saldare
Saldati
```

Questa capacità è il target funzionale, ma non va simulata con campi tecnici se il motore Pagamenti/Saldo non fornisce ancora il dato canonico.

Finché la sorgente canonica non esiste:

```text
filtro dichiarato nel profilo
→ implementazione sospesa
→ nessun dato inventato
```

### Cliente / Fornitore / Soggetto

I filtri soggetto usano il controllo entità comune.

Non si crea un filtro testuale parallelo per ogni pagina.

### Totali

Il riepilogo per i profili documentali è un **footer a una riga**.

Regola:

```text
conteggio a sinistra
+ aggregazioni approvate
+ allineamento alle colonne quando possibile
```

Le metriche Danea osservate nelle immagini sono usate come benchmark. Non autorizzano automaticamente metriche non ancora presenti/canoniche in VestiFlow, in particolare `Guadagno` e `Margine`.

---

## 42-bis.2 Preventivi

### Filtri fissi — decisione owner

```text
Periodo
Cliente
```

Non introdurre filtro Stato per analogia.

### Benchmark Danea osservato

La schermata mostra:

- filtro Periodo;
- filtro Cliente;
- colonne fra cui `Tot. dovuto`;
- nessun filtro Stato funzionale visibile nel pannello;
- nel ritaglio fornito il footer non è visibile, quindi non si deducono altri totali Danea.

### Riepilogo VestiFlow minimo

```text
N preventivi
Totale documenti
```

Se nel profilo VestiFlow esistono già colonne canoniche Netto/IVA e si decide di mostrarne l'aggregato, possono essere aggiunte al footer senza cambiare il contenitore. Non vanno introdotte soltanto perché disponibili nel database.

### Funzioni

Usa la riga funzioni comune in basso.

Le azioni concrete restano quelle già approvate dal modulo. Non copiare automaticamente le azioni Danea.

---

## 42-bis.3 Ordini cliente

### Filtri fissi — decisione owner

```text
Periodo
Stato commerciale
Cliente
```

Valori Stato:

```text
Tutti
Da confermare
Confermato
Concluso
Annullato
```

### Benchmark Danea osservato

Nel footer dell'immagine risultano aggregazioni sotto le colonne:

- `Tot. dovuto` → 1.006,76 €;
- `Tot. netto` → 915,22 €;
- `Guadagno` → 467,93 €;
- `IVA` → 91,54 €;
- conteggio righe → 17 voci.

`Guadagno` è benchmark Danea, **non requisito automatico VestiFlow**.

### Riepilogo VestiFlow

Target minimo:

```text
N ordini
Netto
IVA
Totale
```

I valori devono provenire dai valori canonici/persistiti dell'ordine.

Nessun calcolo di Impegnata nel footer viene introdotto da questa specifica.

### Funzioni

Riga funzioni sotto il footer.

Le funzioni documentali restano configurazione dell'Ordine cliente.

---

## 42-bis.4 Proforma

### Filtri fissi — decisione owner

```text
Periodo
Stato economico
Cliente
```

Stato economico target:

```text
Tutti
Da saldare
Saldati
```

### Benchmark Danea osservato

Il pannello mostra:

- Periodo;
- Stato `Tutti / Da saldare / Saldati`;
- Cliente.

L'immagine fornita non contiene righe e non rende leggibile un footer con totali; non si inventano metriche Danea non osservate.

### Riepilogo VestiFlow target

Quando la posizione di saldo è disponibile da fonte canonica:

```text
N proforma
Netto
IVA
Totale
Da saldare
```

`Da saldare` dipende dal motore pagamenti/saldo e non viene ricostruito localmente dalla lista.

---

## 42-bis.5 DDT vendita

### Filtri fissi — decisione owner

```text
Periodo
Cliente / Soggetto
```

Nessun filtro Stato aggiunto per analogia in questo profilo.

### Benchmark Danea osservato

Il footer mostra:

- `300 voci`;
- `Tot. documento` → 17.509,11 €;
- `Guadagno` → 978,23 €.

`Guadagno` resta benchmark, non requisito automatico VestiFlow.

### Riepilogo VestiFlow minimo

```text
N DDT
Totale documenti
```

Se la specifica economica della famiglia DDT approva anche Netto/IVA nell'elenco, il contenitore può renderli, ma non vengono introdotti da questa specifica.

---

## 42-bis.6 Vendita al banco / Reso al banco

### Filtri fissi — decisione owner

```text
Periodo
Cliente
```

Il profilo può includere `Tipo = Vendita / Reso` soltanto se la lista fisica unisce già i due documenti e la specifica del modulo lo prevede. Questa riga non autorizza a creare una nuova unione.

### Riepilogo VestiFlow

Quando Vendita e Reso convivono nello stesso elenco:

```text
N documenti
Netto
IVA
Totale
```

con verso economico centralizzato:

```text
Vendita → +
Reso    → −
```

Se la lista è separata per tipo, il riepilogo mantiene gli stessi valori senza bisogno di un motore di segno aggiuntivo.

---

## 42-bis.7 Fatture

Il profilo comprende la famiglia di vendita che convive nell'elenco secondo la configurazione già approvata, senza ridefinire qui la matrice dei tipi.

### Filtri fissi — decisione owner

```text
Periodo
Stato economico
Cliente
```

Stato economico target:

```text
Tutti
Da saldare
Saldati
```

Non è lo stato FE e non è un generico stato documentale.

### Benchmark Danea osservato

Il footer mostra chiaramente:

- `20 voci`;
- `Tot. dovuto` → 4.818,78 €;
- `Tot. netto` → 4.383,96 €;
- `Ancora da saldare` → 1.998,60 €;
- `IVA` → 434,82 €.

È inoltre visibile un'ulteriore aggregazione nell'area Guadagno/Margine, ma lo screenshot non è sufficiente per consolidarne la semantica; non viene trasformata in requisito.

### Riepilogo VestiFlow

```text
N documenti
Netto
IVA
Totale
Da saldare
```

Per aggregazioni miste Fattura/Nota di credito il verso usa l'autorità economica centralizzata.

`Da saldare` arriva dalla fonte finanziaria canonica.

---

## 42-bis.8 Ordini fornitore

### Filtri fissi — decisione owner

```text
Periodo
Stato commerciale
Fornitore
```

Valori Stato:

```text
Tutti
Da confermare
Confermato
Concluso
Annullato
```

### Benchmark Danea osservato

Il footer mostra:

- `2 voci`;
- `Tot. documento` → 334,67 €.

### Riepilogo VestiFlow

```text
N ordini
Totale documenti
```

Non introdurre nel footer:

- Giacenza;
- Impegnata;
- Disponibile;
- `In arrivo`;

per analogia.

Le informazioni Ricevuto/Residuo già appartenenti al flusso Ordine fornitore/Arrivo merce restano materia della specifica del modulo, non del riepilogo comune.

---

## 42-bis.9 Arrivi merce

### Filtri fissi

Il filtro temporale è definitivo:

```text
Periodo
```

Per il soggetto, il benchmark Danea usa `Soggetto`; nel dominio VestiFlow l'Arrivo merce ordinario è legato al fornitore.

Il profilo VestiFlow usa quindi:

```text
Periodo
Fornitore / Soggetto
```

senza trasformarlo in `Cliente` per analogia.

Se l'owner intende includere in questo stesso elenco arrivi da soggetti non-fornitore, la label `Soggetto` va confermata nella specifica Arrivo merce; il contenitore comune non prende questa decisione.

### Benchmark Danea osservato

Il footer mostra:

- `105 voci`;
- `Tot. documento` → 182.800,80 €.

### Riepilogo VestiFlow

```text
N arrivi
Totale documenti
```

Nessun riepilogo di Giacenza viene calcolato qui: la Giacenza deriva dai movimenti, non dai totali documentali della lista.

---

## 42-bis.10 Corrispettivi — baseline da compattare

### Filtri attuali VestiFlow da preservare

```text
Periodo
Origine
Tipo
Sede
```

Controllo vista:

```text
Raggruppa
```

`Raggruppa` non è un filtro.

### Metriche attuali da preservare

Oggi il riepilogo VestiFlow contiene:

```text
Rettifiche
Annullamenti
Vendite
Imponibile
IVA
Totale vendite
Corrispettivo
```

La convergenza non modifica valori né formule.

### Nuovo layout comune

Sul desktop le metriche vengono rese in **una sola fascia compatta**:

```text
N righe
Rettifiche
Annullamenti
Vendite
Imponibile
IVA
Totale vendite
Corrispettivo
```

Le metriche monetarie possono allinearsi alle colonne economiche quando ciò migliora la lettura.

Le funzioni:

```text
Stampa
PDF
Excel
CSV/Esporta
...
```

passano nella riga funzioni **sotto il riepilogo**, invece di occupare la testata, salvo eccezione specifica approvata.

Su mobile le stesse metriche possono disporsi su più righe compatte; non devono essere duplicate o ricalcolate.

---

## 42-bis.11 Profili non congelati da questa decisione

Questa sezione non decide automaticamente filtri/totali per:

- Registrazione fattura fornitore;
- Trasferimenti;
- Rettifiche;
- altri profili `document-list`;
- Inventario;
- altri report.

Fino a una decisione specifica:

```text
preservare comportamento corrente
→ nessun nuovo filtro
→ nessuna nuova metrica
```

Il contenitore comune può essere adottato senza cambiare il contenuto funzionale del profilo.

---

## 42-bis.12 Matrice sintetica definitiva dei filtri

| Profilo          | Periodo | Stato                         | Soggetto           | Altri filtri fissi                        |
| ---------------- | ------- | ----------------------------- | ------------------ | ----------------------------------------- |
| Preventivi       | sì      | no                            | Cliente            | —                                         |
| Ordini cliente   | sì      | Commerciale                   | Cliente            | —                                         |
| Proforma         | sì      | Economico: Da saldare/Saldati | Cliente            | —                                         |
| DDT vendita      | sì      | no                            | Cliente/Soggetto   | —                                         |
| Vendita al banco | sì      | no                            | Cliente            | —                                         |
| Fatture          | sì      | Economico: Da saldare/Saldati | Cliente            | —                                         |
| Ordini fornitore | sì      | Commerciale                   | Fornitore          | —                                         |
| Arrivi merce     | sì      | no                            | Fornitore/Soggetto | —                                         |
| Corrispettivi    | sì      | no                            | —                  | Origine · Tipo · Sede · Raggruppa (vista) |

Questa matrice è normativa per i profili elencati.

Non aggiungere filtri oltre questa matrice senza una decisione owner o una specifica di modulo più recente.

---

## 42-bis.13 Matrice sintetica dei riepiloghi

| Profilo               | Conteggio    | Totali minimi VestiFlow                                                                 |
| --------------------- | ------------ | --------------------------------------------------------------------------------------- |
| Preventivi            | N preventivi | Totale documenti                                                                        |
| Ordini cliente        | N ordini     | Netto · IVA · Totale                                                                    |
| Proforma              | N proforma   | Netto · IVA · Totale · Da saldare                                                       |
| DDT vendita           | N DDT        | Totale documenti                                                                        |
| Vendita/Reso al banco | N documenti  | Netto · IVA · Totale                                                                    |
| Fatture               | N documenti  | Netto · IVA · Totale · Da saldare                                                       |
| Ordini fornitore      | N ordini     | Totale documenti                                                                        |
| Arrivi merce          | N arrivi     | Totale documenti                                                                        |
| Corrispettivi         | N righe      | Rettifiche · Annullamenti · Vendite · Imponibile · IVA · Totale vendite · Corrispettivo |

`Da saldare` viene implementato soltanto quando la fonte finanziaria canonica è disponibile.

`Guadagno`/`Margine` osservati in Danea non diventano metriche VestiFlow senza decisione esplicita.

---

# 43. Strategia di implementazione definitiva

Le fasi seguenti costruiscono lo **stesso contenitore comune**.

Non sono sei refactor indipendenti.

## 43.0 Disciplina delle fonti durante l'implementazione

Per questo blocco Claude deve usare **questa r5 come fonte normativa principale**.

Non deve riaprire:

- r4/r3;
- vecchio `docs/14`;
- audit storici;
- proposte ritirate;

per ridecidere struttura, filtri, riepiloghi, posizione funzioni o colonne.

Altri documenti si consultano soltanto quando questa r5 rimanda esplicitamente a una regola di dominio che serve per conoscere un valore, un filtro o un'azione concreta.

Se un altro documento storico contraddice una decisione congelata qui:

```text
non si media
non si sceglie la versione più comoda
→ vale la fonte più recente e specifica
→ la contraddizione documentale viene segnalata e bonificata
```

Regola:

```text
un sottocontratto alla volta
→ consumer pilota
→ test
→ review
→ estensione agli equivalenti
→ rimozione duplicazione
```

Se una fase richiede modifiche a:

- stati;
- economia;
- magazzino;
- Shopify;
- pagamenti;
- workflow documentali;

si ferma: è uscita dal perimetro.

## Fase A — audit consumer reali, zero modifiche

Per ogni consumer:

- shell/testata;
- ricerca;
- filtri;
- URL;
- desktop/mobile;
- tabella/griglia;
- sort;
- colonne;
- selezione;
- azioni;
- riepilogo;
- row count;
- export/stampa;
- componenti comuni;
- duplicazioni;
- differenze reali.

Output: matrice verificata.

## Fase B — contenitore filtri comune `0 → n`

Definire un contratto che renda gli stessi filtri in:

```text
desktop inline
mobile Filtri (n)
```

con:

- stesso stato;
- stessi handler;
- stessi query param.

Pilotare su almeno due consumer con esigenze diverse, uno alla volta, preferendo:

- `document-list`;
- `sales-order-list`;

o altri consumer già vicini all'infrastruttura comune.

Non partire da Corrispettivi se ciò obbliga a inglobare grouping/subtotali/card nello stesso intervento.

## Fase C — motore tabella comune `4 → n`

Migrare i consumer compatibili.

Prima i casi lineari.

Corrispettivi per ultimo.

Se Corrispettivi richiede una capacità realmente riusabile, si estende il contratto comune.

Non si degrada Corrispettivi.

## Fase D — barra azioni comune `4 → n`

Adottare `ListActionsBar`/`ListAction` dove la semantica è equivalente.

Preservare:

- posizione;
- arità;
- filtered/selected;
- motivi disabilitazione.

## Fase E — contenitore riepilogo comune `1 → n`

Estrarre/promuovere il rendering comune.

Supportare:

- più bande;
- metriche monetarie;
- quantità;
- conteggi;
- tono;
- enfasi;
- tooltip/note;
- visibilità;
- responsive.

Metriche/valori restano del modulo.

## Fase F1 — builder export `2 → 1`

Assorbire implementazioni equivalenti nella primitiva condivisa.

Configurazione del dominio resta fuori.

## Fase F2 — B8 sort schermo/export

Correggere separatamente i consumer misurati:

- Ordini cliente CSV;
- Ordini fornitore Excel;
- Prodotti CSV;
- altri eventuali consumer.

Gate:

```text
cambio sort a schermo
→ export conserva lo stesso ordine globale
```

quando l'export dichiara la vista corrente.

## Fase G — consolidamento fisico shell e rimozione duplicazioni

Il contratto del contenitore è già deciso al §0.

Questa fase consolida fisicamente lo shell quando i sottocontratti sono già provati.

Il risultato:

- compone sottocontratti;
- non contiene `if pagina === ...`;
- permette renderer dati specifici soltanto per differenze reali documentate;
- elimina markup/helper paralleli equivalenti.

---

# 44. Metodo di adozione per consumer

Per ogni consumer:

1. leggere specifica di famiglia/modulo;
2. ispezionare markup e servizi reali;
3. classificare comune vs dominio;
4. migrare soltanto il comportamento comune;
5. conservare celle/filtri/azioni/metriche specifiche;
6. testare una riga reale;
7. verificare desktop;
8. verificare mobile;
9. rimuovere implementazione parallela equivalente;
10. fermarsi per review se emerge una decisione funzionale.

Non fare più consumer contemporaneamente se questo rende difficile capire una regressione.

---

# 45. Verifica visiva obbligatoria

Lint, build e test verdi non dimostrano la correttezza visiva.

Per ogni consumer migrato verificare almeno:

- intestazioni;
- densità;
- colonne lunghe;
- badge;
- link;
- numeri;
- selezione;
- azioni;
- riepilogo;
- filtri;
- Colonne;
- card mobile;
- empty;
- loading;
- error;
- viewport desktop;
- viewport mobile.

L'HTML provvisorio non è prova definitiva del comportamento.

---

# 46. Criteri di accettazione — Shell

- unico telaio per consumer equivalenti;
- ordine zone conforme al §0;
- stessa grammatica toolbar;
- stesso punto Colonne;
- stessa posizione ListActionsBar;
- stesso punto riepilogo;
- loading/error/empty comuni;
- differenze come configurazione/policy;
- nessun `if pagina === ...` di dominio.

---

# 47. Criteri di accettazione — Filtri

- Periodo equivalente = stesso contratto;
- Cliente/Fornitore equivalenti = stesso controllo;
- desktop/mobile stesso stato;
- nessun filtro invisibile attivo;
- `Filtri (n)` corretto;
- `Raggruppa` non conta;
- reset coerente;
- URL riproducibile;
- export/stampa stessa sorgente filtri;
- nessun filtro nuovo introdotto per analogia.

---

# 48. Criteri di accettazione — Routing e selezione

- documento locale con form → Modifica;
- stato non decide routing;
- Shopify read-only per ownership;
- Dettaglio separato;
- ricerca globale/link trasversale stessa autorità;
- checkbox separata dal click riga;
- selezione multipla;
- checkbox testata;
- nessun doppio clic/tap necessario;
- selezione non lascia record invisibili salvo policy specifica.

---

# 49. Criteri di accettazione — Azioni

- riepilogo/totali subito dopo i dati;
- riga funzioni subito dopo il riepilogo;
- posizione stabile con 0/1/N selezioni;
- arità rispettata;
- `filtered` = intero dataset filtrato;
- selezione prevale;
- endpoint adeguato per operazioni sul filtrato;
- motivi disabilitazione accessibili;
- Stampa/Excel/Esporta distinti;
- `reports.export` verificato lato UI/API per Esporta.

---

# 50. Criteri di accettazione — Tabella/Griglia

- motore comune riusato dove compatibile;
- ordine colonne fisso da configurazione;
- nessun drag/reorder colonne in questa fase;
- `Colonne` governa visibilità/preset, non ordine manuale;
- niente secondo motore equivalente;
- celle speciali preservate;
- sorting comune;
- resize comune;
- colonne configurabili;
- numeri allineati;
- row count corretto;
- sezioni/footer supportati dove necessari;
- Corrispettivi non perde grouping/subtotali/mobile.

---

# 51. Criteri di accettazione — Ordinamento

- più chiavi;
- ciclo completo;
- priorità;
- accessibilità;
- valori canonici;
- dataset completo;
- sort API sulle liste remote;
- sort temporaneo;
- export vista coerente.

---

# 52. Criteri di accettazione — Riepilogo

- stesso contenitore sui consumer con summary;
- una sola fascia desktop come default;
- posizione: dopo dati, prima delle funzioni;
- metriche allineabili alle colonne quando semanticamente corrispondenti;
- metriche configurate dal modulo;
- nessuna nuova metrica inventata;
- nessun ricalcolo documento;
- intero risultato filtrato;
- pagina e selezione distinti;
- verso economico comune dove pertinente;
- Corrispettivi mantiene riconciliazione esistente;
- riepilogo non trasforma un elenco in report analitico.

---

# 53. Criteri di accettazione — Mobile

- filtri inline desktop;
- unico `Filtri (n)` mobile;
- unico pannello;
- stessi handler;
- Colonne accessibile;
- azioni nominate;
- riepilogo compatto dopo le card;
- riga funzioni dopo il riepilogo;
- una sola rappresentazione DOM attiva;
- chevron solo per navigazione;
- nessuna logica duplicata desktop/mobile.

---

# 54. Criteri di accettazione — Export

- stessi filtri;
- stesso scope;
- stesso sort quando vista corrente;
- builder equivalenti convergenti;
- tracciati normativi specifici dichiarati;
- nessun ricalcolo economico;
- UI/export coerenti.

---

# 55. Test obbligatori

## 55.1 Unit/contract

- filter config → URL;
- URL → filter config;
- active filter count;
- reset;
- Periodo;
- groupBy fuori dai filtri dati;
- selection identity;
- action arity;
- filtered vs selected;
- summary config;
- column config;
- sort multikey;
- export query.

## 55.2 Component

- filtri desktop;
- pannello mobile;
- stessi handler;
- row click;
- checkbox;
- checkbox testata;
- loading;
- error;
- empty;
- summary;
- columns;
- resize;
- selection;
- ListActionsBar;
- motivi disabilitazione.

## 55.3 Integration

- lista e summary stessa query;
- export stessi filtri;
- sort export coerente;
- summary full-filtered;
- azione filtered usa intero risultato;
- permessi export;
- tenant/Location invariati.

## 55.4 Regression

- Corrispettivi invariati;
- segno Fatture/NC invariato;
- Shopify gating invariato;
- Movimenti invariati;
- routing invariato;
- permessi invariati;
- nessun effetto stock/economico da refactor UI.

## 55.5 Visual

Per ogni consumer migrato:

- almeno una riga reale;
- desktop;
- mobile;
- tabella/card;
- footer;
- filtri;
- azioni;
- contenuti lunghi;
- badge/link;
- error/empty.

---

# 56. Guardia architetturale

Dopo la convergenza, introdurre protezioni contro:

- nuovo elenco operativo fuori dal shell comune senza eccezione;
- nuovo Periodo locale equivalente;
- nuovo pannello mobile filtri equivalente;
- nuovo summary container equivalente;
- nuovo builder export equivalente;
- nuovo motore sort equivalente;
- nuova ListActionsBar equivalente.

La guardia non vieta:

- cella speciale;
- metrica specifica;
- query specifica;
- export normativo;
- card specifica motivata;
- differenza vera di dominio.

---

# 57. Decisioni rinviate

Restano fuori e non autorizzano deduzioni:

- azioni massive su selezioni eterogenee;
- esiti parziali delle azioni massive;
- eventuale menu Stampa con varianti;
- rifacimento Dettaglio;
- nuovo Dettaglio Corrispettivo manuale;
- migrazione completa Corrispettivi al DataTable se perde capacità;
- selezione persistente per flussi compositivi;
- specifica completa Giacenze/Situazione;
- specifica Inventario fisico semplice;
- semantica unica UTC/ora locale del Periodo se non già definita;
- comportamento globale colonna stretta;
- persistenza larghezze colonne;
- eventuale riordino manuale colonne futuro, soltanto insieme alla persistenza dell'ordine per utente/tenant/vista;
- ulteriori metriche non già approvate.

---

# 58. Definition of Done

Il blocco è concluso solo quando:

1. esiste una sola autorità per il telaio comune;
2. tutti i consumer reali sono censiti;
3. consumer equivalenti sono migrati;
4. differenze residue = configurazioni/policy;
5. filtri equivalenti hanno un solo comportamento;
6. desktop/mobile usano lo stesso stato;
7. selezione usa il contratto comune;
8. riga azioni ha posizione e arità comuni;
9. riepilogo usa contenitore comune;
10. griglia usa motore comune dove compatibile;
11. sort usa contratto comune;
12. export equivalenti convergono;
13. B8 è chiuso separatamente;
14. non restano copie locali equivalenti non motivate;
15. test unit/component/integration/regression sono verdi;
16. verifica visiva desktop/mobile è eseguita;
17. guardie impediscono regressioni;
18. documentazione Master e regole operative riportano la decisione finale.

---

# 59. Cose da NON fare

- Non copiare Danea pixel-per-pixel.
- Non creare un mega-componente che conosce tutti i domini.
- Non introdurre `if pagina === ...` nel shell.
- Non creare nuovi filtri per analogia.
- Non creare nuovi riepiloghi per analogia.
- Non creare metriche perché il renderer le supporta.
- Non ricalcolare totali nei riepiloghi.
- Non ricalcolare IVA.
- Non ricalcolare prezzi/sconti.
- Non rifare `DataTable` se l'esistente soddisfa il contratto.
- Non creare un secondo filter engine se si può promuovere quello esistente.
- Non duplicare stato desktop/mobile.
- Non unificare query di dominio differenti solo per estetica.
- Non modificare stati, economia, magazzino, pagamenti o Shopify durante il refactor elenchi.
- Non trattare `usa la stessa tabella` come unificazione completa.
- Non degradare Corrispettivi per farlo entrare nel motore comune.
- Non usare una build verde come prova visiva.
- Non inventare decisioni quando la specifica non copre il caso.
- Non implementare drag&drop/riordino colonne in questa fase.
- Non introdurre un riordino colonne non persistente.
- Non creare un motore di misurazione DOM per allineare il riepilogo se l'infrastruttura larghezze esistente non basta.
- Non ricreare due bande desktop di riepilogo quando le metriche possono stare nella fascia unica comune.
- Non lasciare Stampa/PDF/Excel/CSV in testata se appartengono alla riga funzioni del profilo comune, salvo eccezione approvata.

---

# 60. Decisione finale da riportare nel Master

> **Gli elenchi operativi VestiFlow convergono su un unico contenitore/telaio di pagina.** Il contenitore offre zone comuni e ordinate per testata, ricerca/filtri, dati, riepilogo/totali compatti e funzioni. Sul desktop i filtri dichiarati dal modulo sono inline sopra l'elenco; sul mobile gli stessi filtri, con lo stesso stato e gli stessi handler, sono resi tramite un unico `Filtri (n)`/pannello. La selezione è distinta dall'apertura della riga e il riepilogo/totali resta subito sotto i dati e la riga delle funzioni resta stabile subito sotto il riepilogo. Il riepilogo usa un contenitore comune di rendering, mentre metriche e valori sono forniti dal dominio e non vengono ricalcolati dal shell. Il renderer dati usa il motore tabella comune quando compatibile e può restare specifico soltanto per differenze reali documentate. Colonne, sorting, azioni ed export riusano i contratti comuni esistenti. Corrispettivi è il riferimento visivo e comportamentale per filtri, densità, mobile e riepilogo, ma non viene degradato né migrato meccanicamente per primo. `document-list` resta un unico consumer fisico con configurazioni per profilo. L'ordine delle colonne resta fisso nella configurazione del profilo; `Colonne` gestisce visibilità/preset e non introduce drag&drop. L'allineamento dei totali alle colonne viene realizzato solo quando può riusare infrastrutture di larghezza già esistenti, senza un nuovo motore di misurazione. L'unificazione elimina duplicazione strutturale equivalente e **non autorizza nuove funzioni, nuove metriche o cambi di dominio**.

---

# 61. Sintesi operativa vincolante

```text
UN SOLO CONTENITORE
  testata
  ricerca/filtri
  dati
  riepilogo/totali
  funzioni

FILTRI
  desktop inline
  mobile Filtri (n)
  stesso stato
  stesso URL
  configurati dal modulo

RIGA
  click → Modifica per documenti locali
  checkbox → selezione
  Shopify → read-only per ownership

SELEZIONE
  multipla
  checkbox riga + testata
  identità canonica

AZIONI
  dopo il riepilogo/totali
  posizione stabile
  none / one / oneOrMore
  filtered ≠ pagina visibile

RIEPILOGO
  contenitore comune
  una fascia desktop come default
  subito sotto i dati
  valori del dominio
  intero filtrato
  allineabile alle colonne
  nessun ricalcolo

GRIGLIA
  infrastruttura comune
  renderer specifico solo se realmente necessario

ORDINAMENTO
  multichiave
  dataset completo
  temporaneo
  export coerente

COLONNE
  ordine fisso per profilo
  preset + visibilità persistiti
  nessun drag/reorder in questa fase
  resize temporaneo

MOBILE
  stessa verità del desktop
  una sola rappresentazione attiva

CORRISPETTIVI
  benchmark filtri/riepilogo/mobile
  non primo consumer DataTable

NESSUNA DERIVA
  niente nuove funzioni
  niente nuove metriche
  niente cambi di dominio
  dubbio → owner
```

---

# 62. Fonte visiva della revisione r4

La revisione r4 consolida il layout sulla base della UI VestiFlow Corrispettivi esistente e delle schermate Danea fornite dall'owner il 29/08/2026 per Preventivi, Ordini cliente, Proforma, DDT, Fatture, Ordini fornitore e Arrivi merce.

Le schermate Danea sono benchmark di struttura, filtri e footer; non sono fonte per introdurre funzioni non approvate in VestiFlow.

---

# 63. Chiusura decisioni della revisione r5

Decisioni owner consolidate il 29/08/2026:

```text
RIEPILOGO DESKTOP
→ una sola fascia compatta
→ sotto i dati
→ sopra le funzioni
→ obiettivo: più spazio verticale per le righe

FUNZIONI
→ sotto il riepilogo
→ separate da filtri e controlli vista

COLONNE
→ ordine fisso per ora
→ visibilità/preset configurabili
→ resize esistente preservato
→ nessun drag/reorder senza persistenza

ALLINEAMENTO TOTALI  — verificato e CHIUSO il 29/08
→ fascia FISSA ed ESTERNA, su una riga
→ NESSUN allineamento alle colonne: richiederebbe o un motore DOM
  (vietato da §22.4) o il passaggio auto→fixed (rinviato da §22.5)
→ il subtotale di raggruppamento resta allineato: è dentro la tabella
→ quando si riaprirà: larghezze dichiarate, non misurazione DOM

FONTI  — consolidate il 29/08
→ QUESTO file (`docs/14`) è la fonte operativa, e l’unica
→ le versioni r3/r4 e i file `VestiFlow_Specifica_Comune_Elenchi_*`
  sono stati ELIMINATI: la storia sta in git, non in copie parallele
→ `regole-stile-ui` è stata allineata sulla fascia unica
```
