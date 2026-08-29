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

VestiFlow deve avere **un'unica AUTORITÀ STRUTTURALE per gli elenchi operativi**: una sola
grammatica, un solo insieme di contratti comuni.

> ⛔ **Non significa un unico COMPONENTE che tutti rendono.** Deciso il 29/08/2026.

```text
unica autorità strutturale     ✅ sì, ed è dove si lavora
mega-componente universale     ⛔ non è un requisito
shell leggero comune           ⏸ eventuale, e solo sui residui misurati
```

⚠️ **Qui c'era «un unico contenitore comune», letto come obbligo di un componente.** La
misura del 29/08/2026 ha mostrato perché non regge come prescrizione:

| | portata misurata |
| --- | --- |
| i **mixin** condivisi | **23** file |
| il **componente** condiviso `app-data-table` | **4** file |

⭐ **Il contratto costa una riga di `@include` e raggiunge anche chi non migrerà mai** — i
mixin di scorrimento e di altezza hanno raggiunto in un pomeriggio il Registro Corrispettivi,
che ha una tabella propria. Il componente è **tutto-o-niente per pagina**: chi non può
permettersi la migrazione oggi non prende niente e resta indietro finché qualcuno non trova
mezza giornata. È la ragione per cui lo stesso difetto dell'intestazione appiccicata è vissuto
in **quattro** posti: il motore l'aveva risolto per i suoi quattro consumatori, gli altri no.

### Dove passa la riga

```text
ASPETTO · GEOMETRIA · REGOLE          →  CONTRATTO  (mixin, token, modello)
  grammatica visiva, altezza righe, catena di altezze, regione di
  scorrimento, colonne, filtri, Periodo, riepilogo, azioni, stampa
  → normativi, e raggiungono il 100%

COMPORTAMENTO · STATO · INTERAZIONE   →  COMPONENTE
  ordinamento multi-chiave, selezione, selettore colonne, vista a card
  → non esprimibile in un mixin: va reso
```

⛔ **I sottocontratti restano normativi**: togliere l'obbligo dello shell **non** li indebolisce.
Stessa grammatica e stessi contratti ≠ stesso componente involucro.

Il contenitore è il telaio della pagina. Offre sempre le stesse **zone funzionali** e la stessa grammatica d'interazione; ogni modulo dichiara invece quali filtri, colonne, metriche, azioni, query e differenze di dominio utilizzare.

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

⚠️ **«Decide» è l'AUTORITÀ, non un componente** (§0): l'elenco qui sotto dice cosa è
**normato in un posto solo** — che sia un mixin, un token, un modello o, un giorno, uno
shell. Chi lo rende non cambia la norma.

L'autorità comune decide:

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

## 0.2 ⭐ I filtri DERIVANO dalle colonne — deciso il 29/08/2026

> **I filtri di un elenco non si dichiarano: sono le sue colonne.** Ogni colonna del
> riepilogo è filtrabile, e la dichiarazione vive dove la colonna è già dichiarata.
> Restano **esterni** solo Periodo e Ricerca, che colonne non sono.

⛔ **Qui c'era «il contenitore non inventa filtri di dominio: rende quelli dichiarati dal
modulo»**, e dietro quella riga una matrice di filtri profilo per profilo (§42-bis).
Misurato il 29/08/2026 sui due elenchi più grandi:

```text
Ordini cliente   Stato · Origine · Pagamento · Evasione · Cliente · Location
                 → 6 filtri su 6 sono già COLONNE dello stesso elenco

Arrivi merce     Fornitore · Collegamento · Magazzino · Tipo doc. · Pagamento
                 → 5 filtri su 5 sono già COLONNE dello stesso elenco
```

**La matrice per profilo duplicava una differenziazione che il file delle colonne già
conteneva**, perché anche le colonne sono per profilo. Il costo cresceva con
`profili × filtri × consumer` e ogni elenco nuovo lo riapriva: è la ragione misurabile
per cui questa migrazione non convergeva.

| | strada per profilo | strada per colonna |
| --- | --- | --- |
| dichiarazioni | 9 profili nel solo `document-list` | `filter` sulle **195 colonne già dichiarate** |
| markup filtri | **640 righe** in un solo consumer | zero: il controllo sta nel motore tabella |
| specifica | **648 righe** di matrici | la colonna **è** la matrice |
| un elenco nuovo | ricomincia | eredita |

### Le due vesti — che servono comunque

⛔ **Un meccanismo unico per desktop e mobile non esiste, e non è una scelta:** sotto `lg`
la tabella diventa card e `_responsive-table.scss` mette `thead { display: none }`. Dove
non c'è intestazione non c'è nulla su cui appoggiare un controllo di colonna.

```text
UNA dichiarazione     la colonna dice se è filtrabile e come

DUE rese              desktop → controllo nell'intestazione della colonna
                      mobile  → voce nel pannello Filtri (n)
```

⭐ **Il conto delle due vesti è già pagato oggi** — ogni elenco ha barra su desktop e
pannello su mobile. Il controllo in intestazione **sostituisce** la veste desktop, non ne
aggiunge una terza.

Desktop e mobile leggono lo **stesso stato**, usano gli stessi handler e producono la
stessa query.

### Il pulsante «Filtri» accende la modalità, e spegnerlo azzera

_Decisione owner, 29/08/2026._ I controlli di colonna **non sono sempre a schermo**: li
accende il pulsante «Filtri», come nel benchmark Danea.

| | |
| --- | --- |
| **acceso** | ogni colonna visibile mostra il proprio controllo di filtro |
| **spento** | i controlli spariscono **e i filtri di colonna si azzerano** |

⭐ **Lo spegnimento È l'azzeramento**, e non è una scorciatoia implementativa: un filtro
che resta attivo mentre il suo controllo non si vede è esattamente il difetto che Danea
deve rimediare con la striscia «Clicca qui per impostare un filtro».

⚠️ **Periodo e Ricerca non seguono il pulsante**: sono esterni, restano sempre visibili e
non si azzerano spegnendo la modalità.

### ⭐ Il PANNELLO filtri sotto `lg` è del telaio — deciso il 29/08/2026

_Su richiesta del proprietario: «il pannello filtri da mobile devi gestirlo bene in base
al nostro obiettivo»._

Cinque pagine avevano un `app-slide-panel` **proprio**, che **duplicava a mano** i
controlli della barra legandoli agli stessi segnali. Non più: il pannello è **uno**, del
telaio, e vale per ogni elenco.

⛔ **E non è una seconda copia: è LO STESSO contenitore, con un'altra veste.**

```text
scrivania    .list-page__filters   riga della barra strumenti
sotto lg     .list-page__filters   foglio laterale, aperto dal pulsante «Filtri»
```

⚠️ **La strada ovvia non funziona, e non fallisce.** Misurato il 29/08/2026: due
`<ng-content select="[filters]">` in rami esclusivi — uno in barra, uno dentro un
pannello — lasciano il contenuto in **nessuno dei due**. Nessun errore, nessun test rosso,
filtri spariti. Il contenuto proiettato si può rendere **una volta sola**.

⭐ È anche la regola di `regole-stile-ui` §9: «la stessa riga non esiste due volte». Le
cinque vesti duplicate erano già una violazione; ora l'istanza è una.

#### Cosa resta in barra anche sotto `lg`

**Ricerca** e **Periodo** — i due che non entrano nelle colonne (§0.2). Periodo ha per
questo uno slot proprio, `[period]`, in posizione fissa fra ricerca e filtri: è un
controllo di dominio, ma la sua **posizione** non è negoziabile.

#### Il pulsante «Filtri» ha due mestieri, perché sono due vesti

```text
scrivania    accende i controlli nelle INTESTAZIONI di colonna    spegnere = azzerare
sotto lg     APRE e chiude il pannello                            chiudere ≠ azzerare
```

⛔ **Chiudere il pannello NON azzera**, ed è il motivo per cui gli stati sono **due
segnali distinti**: chi apre i filtri, li imposta e preme «Vedi risultati» perderebbe
esattamente quello che ha appena scelto. Nel pannello l'azzeramento c'è, ed è **esplicito**
(«Azzera filtri»).

⭐ **Su scrivania spegnere azzera davvero, e da subito**: quel pulsante ha **preso il
posto** di «Azzera filtri», che stava in barra su sei pagine. Se spegnere non azzerasse,
l'azzeramento non esisterebbe più da nessuna parte.

#### Il conteggio lo dà la PAGINA

`[activeFilterCount]` — il telaio non sa cosa sia un filtro attivo, non conosce il
dominio. Sotto `lg` quel numero è l'unica cosa che dice che qualcosa sta restringendo
l'elenco, perché i controlli sono chiusi nel pannello.

⚠️ **Oggi lo espone il solo Ordini fornitore**, ed è transitorio: con i filtri di colonna
il telaio possiede lo stato dei filtri e **il conteggio se lo calcola da sé**. Le pagine
non dovranno dichiararlo — quindi non è lavoro da fare adesso su dieci pagine.

⭐ **E sulla scrivania il numero diventa quasi ridondante**: ogni colonna filtrata mostra
il proprio controllo acceso. Resta essenziale **sotto `lg`**, dove i controlli sono
chiusi nel pannello e quel numero è l'unico segnale che l'elenco è ristretto.

### ⛔ Il telaio SCARTA in silenzio ciò che non ha uno slot — misurato il 29/08/2026

`app-list-page` ha caselle **tutte nominate** e nessuna casella senza nome. Angular
elimina dal DOM il contenuto proiettato che non trova uno slot.

```text
il costruttore del componente   GIRA
il suo DOM                      non compare da nessuna parte
errori, lint, test              nessuno
```

**Due pannelli persi così**, e li ha trovati una lettura a mano:

| Dove | Cosa non funzionava |
| --- | --- |
| Ordini fornitore | il pulsante «Filtri (n)» su mobile non apriva niente |
| Situazione magazzino | «Nuovo ordine fornitore» dagli articoli selezionati non compariva mai |

⚠️ E un terzo caso era peggio: su **Giacenze** il pannello «Quantità impegnata» non era
stato scartato — era stato **cancellato dal file** dallo script di migrazione. Ripristinato.

#### La casella `[overlays]`, e perché è provvisoria

_Proprietario, 29/08/2026: «gli overlay, se non trovi il posto giusto, mettili in overlay
da decidere dopo»._

Ci vanno le cose che non occupano **nessuna zona** perché sono `position: fixed`:
dialoghi di conferma, pannelli laterali di azione. ⏸ Il posto definitivo è da decidere —
la casella esiste perché non vengano scartate nel frattempo.

#### La guardia

`npm run check:list-page-slots`, dentro `npm run lint`: **scopre** le caselle dal
template del telaio (non le elenca) e fallisce su ogni figlio di primo livello che non ne
dichiari una. Falsificata in due modi il 29/08/2026 — e la prima stesura era **cieca**, un
gruppo greedy nel riconoscitore di tag inghiottiva la barra di `/>` e contava ogni tag
auto-chiuso come aperto.

### ⭐ Tutte le funzioni stanno nella barra in basso — confermato il 29/08/2026

_Proprietario, sul riferimento Danea: «come danea, tutte le funzioni vanno messe nella
barra decisa in basso» e «il tasto non deve essere nascosto, se non ci sono articoli
selezionati esce un messaggio»._

⭐ **Non è una regola nuova: è §5.1, e il contratto la scriveva già.**
`ListActionRequirement` in `list-selection.model.ts` dice testualmente che il campo
«ha cambiato mestiere: prima decideva se l'azione COMPARIVA; da quando le azioni sono
sempre visibili decide se è **abilitata**, e con quale motivo».

```text
0 selezionati   requires: 'none'        attiva, lavora sul risultato filtrato
                requires: 'oneOrMore'   SPENTA, «Seleziona almeno un elemento»
                requires: 'one'         SPENTA, «Seleziona un elemento»
```

⛔ **Il messaggio è il MOTIVO sull'azione spenta, non un dialogo al clic.** Sta lì prima
che si prema, si legge col mouse e col fuoco (`app-hover-tooltip` + `softDisabled`, che
tiene il pulsante nel giro del Tab). Un modale che spiega dopo il clic sarebbe un secondo
modo di dire la stessa cosa — `regole-stile-ui` §1.

#### Chi era fuori dalla regola — misurato il 29/08/2026

| Pagina | Stato |
| --- | --- |
| Ordini fornitore · Movimenti · Documenti · Ordini cliente | ✅ `app-list-actions-bar`, azioni sempre visibili |
| **Situazione magazzino** | ⛔ barra fatta a mano, «Nuovo ordine fornitore» **nascosto** senza selezione → **corretto**: ora usa la barra comune, `requires: 'oneOrMore'` |
| **Prodotti** | ⛔ barra fatta a mano, «Stampa etichette selezionate» nascosto senza selezione → ⏸ da portare sulla barra comune |

⏸ **Su Prodotti ci va anche «Copie per etichetta»**, che oggi sta nella riga dei filtri e
non è un filtro: è un parametro della stampa etichette, e appartiene al comando che lo usa.

### ⭐ «Nuovo ordine fornitore» PROPONE, non emette — deciso il 29/08/2026

_Proprietario: «poi si crea direttamente un ordine ed è errato. Gli articoli devono finire
in nuovo ordine e lì vanno gestiti gli articoli e le quantità da ordinare»._

```text
prima    scegli fornitore → CREA l'ordine via API → apre la modifica dell'ordine creato
ora      scegli fornitore → apre un ordine NUOVO precompilato → gestisci → salvi tu
```

⛔ **Il documento esisteva prima che l'operatore avesse visto una riga.** Le quantità
nascono tutte a 1 e vanno quasi sempre corrette: si finiva per modificare un documento già
emesso invece di compilarne uno.

| Cosa arriva | |
| --- | --- |
| **fornitore** | quello scelto nel pannello, in testata |
| **righe** | una per articolo selezionato, **quantità 1** |
| **descrizione, costo, IVA, U.M., codice fornitore** | dal **risolutore comune di richiamo articolo** (`03c`), lo stesso del percorso manuale |

⚠️ **Il precompilato porta gli IDENTIFICATIVI, non i valori.** Passare anche descrizione e
costo darebbe una seconda strada per riempire una riga, libera di divergere dalla prima —
e a divergere comincerebbe il giorno in cui il risolutore cambia.

#### Come viaggia

Nello **stato del router**, chiave `supplierOrderPrefill`
(`domain/supplier-orders/models/supplier-order-prefill.model.ts`), non nell'indirizzo.

⚠️ Con gli identificativi in query string l'indirizzo reggerebbe il ricarica-pagina, ma
cinquanta articoli fanno quasi duemila caratteri. Ricaricando la maschera si apre vuota —
e lì c'è comunque lavoro non salvato, che la maschera segnala già per conto suo.

⚠️ **Lo stato malformato vale «nessun precompilato»**, mai «un pezzo sì e uno no»: la
maschera si apre vuota invece che con un fornitore senza righe.

#### Due cose che sono cambiate con lei

- ⛔ **Il fornitore non si propone più in automatico** dagli articoli selezionati: il
  pannello lo chiede comunque, quindi la proposta aggiungeva un comportamento da spiegare
  senza togliere un passo.
- ✅ **Il fornitore nuovo si crea lì e resta creato** — è la scelta del proprietario: la
  creazione avviene prima di aprire la maschera, e il fornitore esiste anche se poi
  l'ordine non si salva.

#### ⚠️ «È lenta» — misurato, e una causa era vecchia

_Segnalato dal proprietario il 29/08/2026 provandola: «è lenta la precompilazione, ma il
sistema funziona bene, è corretto»._

Contate le interrogazioni al catalogo per un precompilato di **due** articoli:

```text
apertura precompilata     4 chiamate = 2 per articolo
  N   il richiamo articolo di ogni riga legge la sua variante
  N   le varianti «appuntate» del selettore le rileggono tutte in un colpo
```

⛔ **E ne è venuta fuori una che non c'entrava col precompilato.** `selectedVariantIds`
ricalcolava un array nuovo a **ogni** `lines.valueChanges` — cioè a ogni carattere
digitato in qualunque campo di riga — e l'array nuovo è sempre diverso per `Object.is`:
`pinnedVariants` rileggeva **una variante per riga del documento a ogni battuta**.

> Misurato: digitare un carattere in Quantità con un solo articolo faceva **3** chiamate
> invece di 2. Su un ordine da trenta righe sono trenta richieste per digitare «5».

✅ Corretto con un `distinctUntilChanged` sui **contenuti** della lista di id: è
l'insieme degli articoli a dover cambiare perché ci sia qualcosa da rileggere. Due prove lo
tengono fermo, e la falsificazione le fa arrossire entrambe.

#### Quanto costa davvero — sonda del 29/08/2026

Misurato con risposte **istantanee** (catalogo finto, nessuna rete), per isolare il lavoro
del client da quello del trasporto:

| Articoli | Chiamate | Lavoro del client |
| --- | --- | --- |
| 10 | 20 | 115 ms |
| 25 | 50 | 214 ms |
| 50 | **100** | **383 ms** |

⭐ **È lineare**, non quadratico: circa 7 ms per articolo più una quarantina fissi. Il
numero di chiamate è esattamente **2N**, come previsto.

⚠️ **La rete non è misurabile da qui**: servirebbe l'API contro il database condiviso. Il
tempo che l'operatore percepisce è quei ~0,4 s di client **più** cento andate e ritorni.

⏸ **Resta aperto il 2N.** Il catalogo si interroga **un articolo alla volta**: il DTO
`ListVariantSummariesQueryDto` accetta `variantId` singolo. Con un `variantIds[]`
— parametro di query, nessuna migrazione — le chiamate passerebbero da 100 a **2**, e ne
beneficerebbe **ogni** documento con molte righe, non solo il precompilato.

⚠️ **I ~0,4 s di client resterebbero**: la parte che si toglie è solo il trasporto. Incide
**solo sulla velocità** — stessi dati, stesso risultato.

#### ⛔ E il difetto NON è del precompilato: è del richiamo articolo, in QUATTRO maschere

_Intuizione del proprietario il 29/08/2026 — «forse il problema è altrove, è proprio nel
richiamo articolo nei documenti» — verificata subito._

Il blocco `selectedVariantIds` + `pinnedVariants` è **copiato identico** in quattro
maschere. Confrontati carattere per carattere: tre hanno la **stessa impronta**, la quarta
differisce solo per la correzione appena fatta.

| Maschera | `distinctUntilChanged` |
| --- | --- |
| Ordine fornitore | ✅ corretto il 29/08/2026 |
| **Arrivo merce** | ⛔ **manca** |
| **Carico / scarico / rettifica** | ⛔ **manca** |
| **Trasferimento** | ⛔ **manca** |

> Su quelle tre, **ogni carattere digitato in una riga rilegge dal catalogo una variante
> per articolo del documento.** Sono le maschere che si usano tutti i giorni, e il
> precompilato dell'ordine fornitore non c'entra: il difetto è lì da prima.

⭐ **Il rimedio non è applicare la stessa toppa tre volte.** Il blocco va estratto una
volta sola — accanto a `document-line-article.service.ts`, dove il richiamo articolo già
vive — e con lui il passaggio a una lettura sola (`variantIds[]`) varrebbe per tutte e
quattro insieme, invece che quattro volte.

⏸ **Da fare, non fatto**: è un lavoro a sé, e apre la maschera dell'Arrivo merce, che è la
più delicata.

### Colonna spenta, filtro spento

_Decisione owner, 29/08/2026._ Una colonna nascosta dal selettore Colonne **non ha
filtro**: il controllo vive nella sua intestazione, e senza intestazione non c'è niente da
mostrare.

⛔ **Qui la regola precedente diceva il contrario** — «la presenza di un filtro non si lega
alla visibilità della colonna». Cade con la derivazione dalle colonne: filtrare una colonna
che non si vede significa restringere l'elenco per un criterio invisibile.

⭐ **Ma ogni colonna ha il suo filtro, anche quelle spente di serie**: la filtrabilità
appartiene alla colonna, non alla sua visibilità corrente. Accendendo una colonna dal
selettore Colonne, il suo filtro arriva con lei.

### Selezione multipla

I controlli di colonna sono a **selezione multipla** dove il dato è un insieme di valori,
come già fanno i Corrispettivi.

⚠️ Non è lavoro nuovo: `select-menu` espone `multiple` da prima di questa decisione.

---

## 0.7 ⭐ Il telaio `app-list-page` — deciso il 29/08/2026

Il censimento della Fase G ha risposto «sì» (vedi lì): tre zone su tre in tutte e undici le
pagine, e i quattro rami di stato scritti undici volte con gli **stessi nomi di segnale**.
Il telaio esiste.

```text
app-list-page
├─ TESTATA               posseduta   Indietro · titolo · [pageActions]
├─ [tabs]                slot        le quattro viste di Magazzino
├─ ZONA CONTROLLI        posseduta   ricerca · [period] · [filters] · Colonne · Filtri (n)
├─ [warnings]            slot
├─ AREA DATI             posseduta   i quattro stati; dentro, [data] libero
├─ [summary]             sede normata
├─ [listActions]         sede normata
└─ [overlays]            ⏸ provvisoria — dialoghi e pannelli `position: fixed`
```

### ⛔ La zona controlli è POSSEDUTA, non proiettata

⛔ **Qui la prima proposta aveva uno slot `[tools]` libero, e sarebbe stato inutile.**
Misurate il 29/08/2026, le undici pagine avevano **quattro forme diverse** di barra
strumenti — chi in una card, chi coi filtri nudi, chi con l'etichetta «Ricerca», chi dentro
un componente proprio. Uno slot libero le avrebbe lasciate diverse **per costruzione**, che
è esattamente il difetto che il telaio esiste per chiudere.

> **La pagina passa VALORI, non markup.** Dichiara il segnaposto della ricerca e la vista
> delle colonne; non decide dove stanno né che forma hanno.

⭐ Resta proiettato il solo gruppo **`[filters]`** — Periodo e i filtri di dominio — perché
sono controlli che il telaio non deve conoscere. **La loro posizione però non è
negoziabile.**

⚠️ **La forma è NUDA, senza card**: è quella del Registro Corrispettivi, riferimento visivo
dichiarato (`regole-stile-ui` §5). Quattro pagine avevano una card e si allineano.

### ⭐ Un solo pulsante: «Filtri», e non è un «Azzera»

_Decisione del proprietario, 29/08/2026._

⛔ **«Azzera filtri» sparisce.** Al suo posto c'è **«Filtri»**, che è un **interruttore**:

| | |
| --- | --- |
| **acceso** | ogni colonna visibile mostra il proprio controllo di filtro |
| **spento** | i controlli spariscono **e i filtri di colonna si azzerano** |

⭐ **Lo spegnimento È l'azzeramento**: non servono due pulsanti, perché non esistono due
azioni. Un filtro attivo il cui controllo non si vede è il difetto che Danea deve rimediare
con una striscia d'avviso in cima all'elenco.

⚠️ **Periodo e Ricerca non seguono l'interruttore**: sono esterni alle colonne (§11.2), e
spegnere i filtri di colonna non deve cambiare il periodo che si sta guardando.

⚠️ Il pulsante porta `aria-pressed`, aggiunto ad `app-button` per questo: un interruttore
che cambia solo aspetto non dice il proprio stato a chi non lo vede.

### ⛔ Niente sottotitoli

_Decisione del proprietario, 29/08/2026: «non servono, recuperiamo spazio»._

Prendevano una riga intera per dire cosa la schermata è, in una vista che serve a
consultare. **Il telaio non ha un input `subtitle`**: non è una convenzione da rispettare,
è una cosa che non si può passare.

⭐ Il Registro Corrispettivi c'era già arrivato da solo, tenendolo per i soli lettori di
schermo. Ora vale per tutti gli elenchi.

### Il titolo si dichiara una volta sola

⛔ Era stilato in **quattro** posti — `_list-page`, `_detail-page`, `_document-form` e il
telaio — tutti con le stesse quattro proprietà, di cui tre **già date dalla regola globale
degli heading**. La quarta, `font-weight: bold`, sovrascriveva il `semibold` globale.

⭐ Unificato: resta `margin: 0`, il peso è quello globale. **Un titolo di pagina è un `<h1>`
e si stila come tale.**

### Cosa NON fa il telaio, mai

- ⛔ niente dominio, niente query, niente `if tipo documento` (§59);
- ⛔ non decide colonne, filtri, metriche o permessi;
- ⛔ non conosce il renderer che ospita.

⭐ **Lo slot `[data]` accetta qualunque renderer.** È la ragione per cui il Registro
Corrispettivi — raggruppamenti e subtotali propri, fuori dal motore tabella comune — può
usare lo stesso telaio di un elenco documenti.

### ⚠️ `app-list-filters` non si monta

Quel componente è nato per il contratto **precedente**: Periodo più alcuni filtri scelti per
profilo. Quel contratto è stato superato dalla derivazione dalle colonne (§0.2).

| pezzo | destino |
| --- | --- |
| filtri scelti per profilo, `ListFilterDef` | ⛔ **superati** |
| il **pannello mobile** | ✅ resta utile: sotto `lg` non ci sono intestazioni, e i filtri di colonna hanno bisogno di una casa |
| Periodo | ✅ resta, ma esterno |

⛔ **Non si conserva codice perché è già stato scritto.** Quando i filtri di colonna
esisteranno, il pannello sarà rialimentato dalle colonne invece che da `ListFilterDef`; se a
quel punto non servirà, si cancella.

### Lo stato vuoto si uniforma

⛔ Corrispettivi, filtrando per una Sede senza registrazioni, mostrava una tabella con le
sole intestazioni e un riepilogo a zero. Le altre dieci mostrano un riquadro che dice cosa è
successo.

_Decisione del proprietario, 29/08/2026: si uniforma._ Il telaio rende il riquadro; la
pagina dichiara titolo, descrizione e icona.

⛔ **Senza CTA**: «nel riquadro resta vuoto, e i tasti sono quelli già predisposti, Indietro
e Nuovo in alto». Tre pagine ne avevano una, e duplicava un pulsante che sta già in testata a
due centimetri di distanza.

---

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

## 3.1 Fotografia tecnica — RICONFERMATA il 29/08/2026

La misurazione del 28/08 chiedeva di essere riconfermata prima di implementare. **È stata
rifatta sui dieci consumer**, ed è questa. È una fotografia datata, non una norma.

```text
consumer fisici                   10
dichiarazioni filtro             102   = 60 desktop + 42 copie mobile
motore tabella comune              4
barra azioni comune                4
selettore colonne                  7   ← nel perimetro dei dieci
contenitore riepilogo comune       1
contenitore filtri comune          0   ← il gap
```

### ⚠️ Due perimetri diversi, e non vanno confusi

Il `~16-17` del selettore colonne **non era sbagliato: misurava un perimetro più ampio.**

```text
selettore colonne, TUTTO il repository        16 file
  di cui elenchi del perimetro                 7
  di cui maschere documento e viste inventario 9
```

I nove fuori perimetro sono `goods-receipt-form`, `sales-document-form`,
`stock-operation-form`, `transfer-form`, `supplier-order-form`, `customer-order-form`,
`store-sale-document-form`, `inventory-levels`, `inventory-situation`. **Non sono elenchi**,
e non entrano in questa unificazione. Chi rimisura deve dire quale dei due perimetri sta
contando, o i numeri sembreranno smentirsi da soli.

## 3.2 La matrice della Fase A — misurata il 29/08/2026

⭐ **È l'output che la Fase A chiede**, e da qui parte la Fase B. Fotografia tecnica
datata: non decide niente di funzionale.

| Consumer                    | Filtri desktop | Copie mobile | Motore | Azioni | Picker | Riepilogo | Export |
| --------------------------- | -------------: | -----------: | :----: | :----: | :----: | :-------: | :----: |
| `document-list` (9 profili) |             21 |       **18** |   ✅   |   ✅   |   ✅   |     —     |   ✅   |
| `corrispettivi-report`      |             12 |       **11** |   —    |   —    |   ✅   |    ✅     |   ✅   |
| `sales-order-list`          |             10 |        **9** |   ✅   |   ✅   |   ✅   |     —     |   ✅   |
| `stock-movements`           |              8 |            0 |   ✅   |   ✅   |   ✅   |     —     |   ✅   |
| `product-list`              |              4 |            0 |   —    |   —    |   ✅   |     —     |   ✅   |
| `online-sale-list`          |              3 |        **3** |   —    |   —    |   —    |     —     |   —    |
| `supplier-order-list`       |              2 |        **1** |   ✅   |   ✅   |   —    |     —     |   ✅   |
| `customer-list`             |              0 |            0 |   —    |   —    |   ✅   |     —     |   ✅   |
| `supplier-list`             |              0 |            0 |   —    |   —    |   ✅   |     —     |   —    |
| `inventory-count-list`      |              0 |            0 |   —    |   —    |   —    |     —     |   —    |
| **totale**                  |         **60** |       **42** |   4    |   4    |   7    |     1     |   6    |

Differenze di dominio rilevanti, misurate:

- **`document-list`** serve **nove profili** con un solo componente: è il consumer con più
  filtri e più copie, ed è già sul motore, sulla barra azioni e sul selettore colonne.
- **`corrispettivi-report`** porta **637 righe di SCSS proprie** — la tabella più grande del
  perimetro — più raggruppamento, subtotali di giornata, card mobile e l'**unico** riepilogo
  esistente.
- **`product-list`** ha i filtri in un **componente figlio** (`app-product-toolbar`), non nel
  proprio template.
- **`supplier-order-list`** e **`stock-movements`** montano `app-data-table` **direttamente**;
  `document-list` e `sales-order-list` lo montano tramite la propria tabella di feature.

### ⚠️ Perché questi numeri differiscono da una misura precedente

Una prima misura dello stesso giorno aveva dato `97 = 55 + 42`. **Era sbagliata, e il modo
in cui lo era vale più del numero**: contava i controlli solo nel template del consumer.

```text
product-list        risultava 0 filtri     ha 4 in `app-product-toolbar`
app-segmented       non contato            i Corrispettivi lo usano per l'Ambito
```

⛔ **Un censimento di componenti non può fermarsi al primo livello del template.** Il numero
delle copie (42) non cambiava, ma il denominatore sì — e con lui la percentuale.

## 3.3 La causa tecnica della Fase B

```text
102 dichiarazioni filtro complessive
 60 desktop
 42 copie mobile          ← 41% delle dichiarazioni è duplicazione
```

Non è una stima: è la stessa `<app-select-menu>` scritta due volte, con lo **stesso stato** e
gli **stessi handler**. Su `document-list` in quattro casi l'etichetta lo dichiara —
«Filtra per cliente» e «Filtra per cliente (pannello filtri)».

⭐ **È questo il `0 → n` della Fase B**, e vale 42 dichiarazioni in meno.

⚠️ **La misura resta valida, la cura è cambiata** — 29/08/2026. La duplicazione non si
toglie dichiarando gli stessi filtri una volta sola per profilo, ma **derivandoli dalle
colonne** (§0.2): le 102 dichiarazioni non diventano 60, diventano **zero**.

## 3.4 Piloti della Fase B — ⛔ superati il 29/08/2026

⚠️ **Non esistono più piloti da scegliere**: derivando i filtri dalle colonne (§0.2) non c'è
una migrazione consumer per consumer, quindi non c'è un primo consumer. La misura qui sotto
resta perché dice **dove sta la duplicazione**, non più perché indichi da dove cominciare.

```text
document-list      21 desktop · 18 copie · già motore · già azioni · già picker
sales-order-list   10 desktop ·  9 copie · già motore · già azioni · già picker
```

Sono i due che **duplicano di più** e che hanno **già tutto il resto in comune**: il
contenitore filtri è l'unico pezzo che manca, quindi il pilota non trascina altro.

⛔ **Corrispettivi non è il primo consumer da modificare**, ed è confermato dalla misura: 11
copie ma anche 637 righe di stile proprio, raggruppamento, subtotali, card e l'unico
riepilogo. Ogni intervento lì ne trascina cinque insieme. **Resta il benchmark**: il
contenitore comune nasce generalizzando ciò che Corrispettivi fa già bene, non adeguando
Corrispettivi al contenitore.

## 3.5 Consumer senza pannello filtri mobile — due casi, non uno

⛔ **Vanno tenuti distinti**, perché il contenitore comune fa cose diverse ai due gruppi.

|                                                  | Consumer                                                 | Cosa comporta                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **ha filtri desktop, non ha il pannello mobile** | `stock-movements` (8), `product-list` (4)                | il contenitore **aggiungerebbe** la parità mobile: è il contratto già approvato in questo documento, ma **non fa parte dei due piloti** |
| **non ha filtri affatto**                        | `customer-list`, `supplier-list`, `inventory-count-list` | ⛔ il contenitore **non deve inventarne**: nessun filtro oggi, nessuno domani per analogia                                              |

⚠️ `inventory-count-list` resta **subordinato alla specifica Inventario**, come già scritto in
§2.7: il censimento tecnico c'è, la migrazione no.

⚠️ Da questa misura **non discende nessuna modifica funzionale**. È una fotografia.

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

## 7.1 ⭐ «Stato» non è una parola sola — deciso il 29/08/2026

> **Dove esiste un termine più preciso, «Stato» non si usa.** Tre concetti diversi
> stavano sotto la stessa etichetta, e l'operatore che passa da una schermata
> all'altra non poteva sapere quale dei tre stesse guardando.

| Termine                           | Che cosa dice                                                               | Dove vive                                                         |
| --------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Fase**                          | il **ciclo commerciale**: Da confermare · Confermato · Concluso · Annullato | Ordine cliente e Ordine fornitore (`17` §2.1, `18` §2.1)          |
| **Collegamento**                  | la situazione del documento **rispetto ad altri documenti**                 | ogni riepilogo dove il concetto esiste — Arrivo merce, e i futuri |
| **Saldo** (o **Stato economico**) | la situazione **economica**: Da saldare · Saldati                           | Proforma e Fatture                                                |

⛔ **I tre non sono sfumature dello stesso concetto.** Un Arrivo merce non ha una
Fase — non attraversa il ciclo commerciale — e una Fattura Saldata non è
«Conclusa». Chiamarli tutti «Stato» costringe a leggere le opzioni per capire di
che cosa si stia parlando.

### Come si applica

```text
etichetta a schermo      Fase · Collegamento · Saldo
chiave tecnica           invariata
```

⚠️ **Una rinomina visuale NON trascina quella tecnica.** `linkStatus`, `status`,
`commercialState`, i DTO, i query param e le rotte **restano come sono**: cambiarli
per allineare un nome a schermo è un refactor a sé, con la sua migrazione e i suoi
URL da non rompere, e non appartiene a un lavoro sui filtri.

### ⏸ Conseguenza misurata, non ancora applicata

Il ciclo commerciale chiuso col Passo 6 oggi si chiama **«Stato»** a schermo, in tre
punti misurati il 29/08/2026:

```text
supplier-order-form.component.html:188    <app-document-header-field label="Stato">
customer-order-form.component.html:391    <app-document-header-field label="Stato">
supplier-order-list.component.ts:575      { id: 'status', label: 'Stato' }
```

Secondo questa regola dovrebbero dire **«Fase»**. ⛔ **Non è stato cambiato**: è
fuori dal perimetro del lavoro sui filtri, e rinominare un campo di testata mentre
si migra un contenitore di elenco mescola due cose che vanno verificate
separatamente. Resta una voce aperta, e questa riga è il suo promemoria.

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

La derivazione dalle colonne è in §0.2. Qui c'è **cosa** una colonna può dichiarare e
**dove** finisce ciò che colonna non è.

## 11.1 Ciò che si dichiara sulla colonna

La filtrabilità sta su `TableColumnDef`, accanto a `sortable` — che è già una capacità
dichiarata sulla colonna e non un elenco a parte.

```text
TableColumnDef {
  sortable?  già presente
  filter?    'values' | 'text' | 'range'
}
```

| forma | quando | reso come |
| --- | --- | --- |
| `values` | insieme chiuso o ricorrente (Stato, Pagamento, Sede, Cliente) | elenco a **selezione multipla** dei valori presenti |
| `text` | testo libero (Commento, riferimenti) | contiene / non contiene |
| `range` | numerico e denaro (Totale, Netto, Righe) | da–a |

⚠️ **`values` legge i valori dall'insieme caricato**, non da un endpoint per colonna. È
corretto perché l'insieme caricato **è** il risultato del filtro (§11.4): senza quella
condizione l'elenco dei valori sarebbe parziale e non si vedrebbe che lo è.

### ⭐ Opt-out: una colonna nasce filtrabile — chiuso il 29/08/2026

> **Chi non dichiara niente È filtrabile. Si dichiara solo l'eccezione: `filter: false`.**

⚠️ Qui la domanda era aperta. L'ha chiusa il codice: `TableColumnDef.sortable` porta già
questa disciplina, scritta con la sua ragione — _«una colonna nasce ordinabile e
ridimensionabile, e dichiara solo ciò che non deve essere: il difetto da evitare è la
colonna che si è dimenticata di essere ordinabile, che nessuno nota»_.

⭐ **Vale identico per il filtro, e con meno vincoli.** `sortable` è una whitelist dove
l'elenco lo consulta — `DOCUMENT_LIST_SORTABLE_COLUMNS` — perché **il server** deve saper
ordinare quella colonna. Il filtro legge l'insieme già caricato (§11.4): non c'è nessun
server da insegnare, quindi nessuna ragione per una whitelist.

La forma, quando non è dichiarata, si **deduce**:

```text
filter dichiarato    →  quello
filter: false        →  nessun filtro
numeric              →  range     totali, quantità, importi
display code/trunc   →  text      alta cardinalità: SKU, riferimenti, commenti
altrimenti           →  values    insieme di valori distinti, a scelta multipla
```

⚠️ **La deduzione è un default sensato, non un oracolo**, e sbaglia in una direzione
precisa: una colonna DATA porta spesso `display: 'code'` e finirebbe `text` mentre vuole
`range`. Lì il `filter` si dichiara.

⭐ **La direzione dell'errore è voluta**: si sbaglia verso il *filtro sbagliato*, mai verso
il *filtro assente*. Il primo si vede aprendolo, il secondo non si vede mai.

Implementato in `table-column-filter.util.ts` (`resolveColumnFilterKind`), con la sua
guardia: tre falsificazioni — default a `null`, `filter: false` ignorato, `numeric`
dedotto `text` — mandano rossi rispettivamente 3, 2 e 2 test.

## 11.2 Ciò che resta fuori dalle colonne

```text
Periodo    filtra la data ma deve MOSTRARE il proprio default senza aprire nulla
Ricerca    non è una colonna
```

Restano nella barra, sempre visibili, e **non seguono il pulsante «Filtri»**.

⚠️ **Un'eccezione è una condizione che nessuna colonna esprime COME SI VUOLE CHIEDERLA.**
Non basta che il dato manchi da una colonna: se la colonna c'è ma la domanda naturale è
un'altra, l'eccezione è legittima — «non saldato» su una colonna che contiene un importo,
per esempio.

⛔ Qui era citato «DDT da fatturare» come eccezione: **non lo è**, si filtra dalla colonna
Collegamento (vedi sotto). L'unica eccezione confermata è il **Saldo delle Fatture**.

⚠️ Se le eccezioni crescessero, il segno è che manca una colonna, non che ne serve un'altra.

### ⭐ Il bersaglio della barra, scritto invece che dedotto — 29/08/2026

Applicata la regola, in barra resta pochissimo. Vale per **ogni** elenco:

```text
FILTRO          Periodo          se le righe hanno una data (§12.2)
FILTRO          Ricerca          dove prevista
CONTROLLO       Raggruppa        non è un filtro: non cambia il dataset (§16)
CONTROLLO       Colonne
INTERRUTTORE    Filtri           accende i controlli di colonna, spegnendolo li azzera (§0.7)
```

⛔ **Tutto il resto sparisce dalla barra** e vive nell'intestazione della propria colonna.

| Elenco | oggi in barra | dopo |
| --- | --- | --- |
| **Corrispettivi** | Periodo · Origine · Tipo · Sede · Raggruppa | Periodo · Raggruppa — **Origine, Tipo e Sede diventano colonne** |
| **Ordini cliente** | Periodo · Stato · Origine · Pagamento · Evasione · Cliente · Location | Periodo — **le altre sei sono già colonne** |
| **Arrivi merce** | Periodo · Fornitore · Collegamento · Magazzino · Tipo doc. · Pagamento | Periodo — **le altre cinque sono già colonne** |

⭐ **È la misura di §0.2 letta al contrario**: erano già colonne, per questo possono tornarci.

### ⭐ «DDT da fatturare» NON è un'eccezione — 29/08/2026

_Decisione del proprietario:_ «per i DDT non ci sono altri filtri oltre a periodico e
cliente, perché quelli da fatturare si possono già filtrare dalla colonna in testata».

La colonna **Collegamento** mostra la fattura derivata quando c'è: filtrarla per «nessuna»
dà i DDT da fatturare. Un filtro in meno in barra, e nessuna condizione derivata da
mantenere a parte.

⚠️ **Una differenza misurata, e va conosciuta**: il filtro attuale `pendingInvoice` non
chiede solo «senza fattura». Chiede anche che il DDT sia **confermato, stampato o inviato**
— quindi **esclude le bozze** — e ignora le fatture **annullate**, perché una fattura
annullata non consuma il DDT.

```text
filtro colonna «Collegamento: nessuna»   →  include anche le BOZZE
pendingInvoice di oggi                   →  le esclude
```

⛔ **Se una bozza di DDT non deve comparire fra quelli da fatturare, i due non sono
equivalenti** e la colonna da sola non basta. È una domanda di prodotto, non tecnica, e sta
qui perché non si perda quando qualcuno toglierà `pendingInvoice`.

### ⭐ Le Fatture hanno «Saldato / Non saldato», in barra — confermato il 29/08/2026

_Decisione del proprietario._ Non è un forse: è un filtro **esterno**, accanto al Periodo,
come nel benchmark Danea.

⛔ **E non lo copre la colonna, anche se la colonna c'è.** «Ancora da saldare» contiene un
**importo**; «non saldato» è una **condizione** su quell'importo. Tradotta in filtro di
colonna sarebbe un intervallo «da 0,01 a infinito» — tecnicamente equivalente e
inutilizzabile per chi vuole solo vedere cosa deve incassare.

⭐ **È la forma dell'eccezione prevista da §11.2**: una condizione derivata che nessuna
colonna esprime *come si vorrebbe chiederla*. Vale per le Fatture e per la Proforma, dove
lo stato economico è già dichiarato in specifica.

⚠️ **Resta subordinato al motore Pagamenti**: finché non dà il dato canonico, il filtro non
si simula con campi tecnici (§42-bis.1). Si dichiara e si implementa quando la sorgente
esiste.

### ⛔ Nessun costruttore di filtri avanzati

_Decisione del proprietario, 29/08/2026, guardando il «Filtro avanzato» di Danea:_ «non
dico di costruire tutto ciò, ma di fare in modo di poter filtrare l'essenziale nelle
colonne».

Le forme sono **tre**, e non se ne aggiungono altre per analogia:

```text
values   insieme di valori distinti, a scelta multipla
text     contiene / non contiene
range    da–a
```

⛔ Niente finestra «mostra le righe che… assomiglia a… E/O…», niente operatori componibili,
niente filtri salvati. Chi ha bisogno di quella potenza usa l'export.

### ⚠️ Su mobile la barra non esiste: c'è il pannello

Sotto `lg` non ci sono intestazioni di colonna, quindi i filtri di colonna vivono nel
pannello «Filtri (n)», e le righe restano **card**. Non è un'eccezione al modello: è la
seconda veste dello stesso contratto (§0.2), e non cambia con questa decisione.

## 11.3 Concetti condivisi

Se due elenchi usano lo stesso concetto — Periodo, Stato, Cliente, Fornitore, Sede, Tipo,
Metodo pagamento, Operatore — riusano lo **stesso comportamento comune** quando la
semantica è equivalente.

Ordine visuale della barra esterna:

```text
Periodo → Ricerca → Filtri → Raggruppa → Colonne
```

La ricerca resta separata dai filtri.

## 11.4 Il presupposto: nessun TETTO di righe a schermo

_Decisione owner, 29/08/2026._ **Un elenco mostra tutto il risultato del proprio filtro, e
lo si scorre.** Non c'è un tetto di venti righe, non c'è un paginatore.

⛔ **Qui la regola divideva**: riepiloghi senza impaginazione, anagrafiche paginate «perché
senza asse temporale 30 giorni nasconde il catalogo». La divisione cade — non perché
l'argomento fosse sbagliato, ma perché **un filtro di colonna che legge l'insieme caricato
richiede che l'insieme caricato sia tutto**, e due comportamenti diversi darebbero un
filtro corretto su un elenco e silenziosamente parziale sull'altro.

### ⚠️ Ma «niente impaginazione» è il TETTO DI VISUALIZZAZIONE, non ogni concetto di pagina

⛔ **L'interpretazione larga rompeva un file che non è un elenco.** Misurato:
`global-search.component.ts:149` chiede cinque righe per fonte a **sei** servizi di elenco
in `forkJoin`, a ogni tasto. Presa alla lettera, ogni ricerca globale avrebbe scaricato
catalogo, clienti, fornitori, ordini e documenti interi — o, tolti `page`/`pageSize` dai
tipi, quel file non avrebbe più compilato.

> _«Niente impaginazione mi riferivo a quella limitata a 20 righe … mi riferivo solo alla
> visualizzazione. Per chi non ha il filtro periodo, possiamo far visualizzare l'elenco nel
> contenitore e man mano si scorrono i risultati.»_ — proprietario, 29/08/2026

| | |
| --- | --- |
| **elenchi** — documenti, ordini, anagrafiche, movimenti, giacenze | niente tetto: tutto il risultato, e si scorre |
| **ricerca globale** | ⛔ **fuori perimetro**: è un'anteprima da cinque righe per fonte, non un elenco |

⚠️ **Il contenimento resta diseguale, e la scelta è dichiarata provvisoria**: i riepiloghi
datati si contengono col Periodo (§12.2), le anagrafiche non hanno un asse temporale che
faccia lo stesso mestiere e fino a nuova decisione caricano tutto — _«per ora lo facciamo
semplice e libero da limiti, poi ce ne occuperemo in un secondo momento»_.

### ⭐ E da qui discende un requisito, non una preferenza

Senza tetto di righe un elenco può essere lungo centinaia di schermate. **L'intestazione
deve quindi restare fissa mentre le righe scorrono** — altrimenti porterebbe via con sé i
controlli di filtro che questa migrazione ci mette dentro. Misura e decisione in §11.5 D3.

## 11.5 I tre blocchi, e come il proprietario li ha sciolti — 29/08/2026

Mappa avversariale su tutto il repository: sette agenti, due col solo compito di smentire
gli altri cinque. Le misure sono state **riverificate a mano** sul codice, una per una.

⛔ **Tre cose bloccavano la derivazione.** Sono state decise il 29/08/2026 e sono qui sotto
con le misure che le hanno motivate: senza quelle, la decisione fra un mese sembra
arbitraria.

---

### ✅ D1 · I cinque filtri senza colonna — decisione: si aggiunge la COLONNA

**La misura.** Presi alla lettera, «i filtri sono le colonne» cancellava cinque filtri
funzionanti, che §42-bis.0 vieta di rimuovere in un refactor:

| Filtro | Dove | Colonna corrispondente |
| --- | --- | --- |
| **Operatore** (`createdById`) | elenco documenti, html:313 | ⛔ nessuna: nei 18 id non c'è `createdBy` |
| **Cliente/Fornitore** | movimenti, html:127 | ⛔ nessuna colonna controparte |
| **Location** | situazione magazzino, html:80 | ⛔ nessuna delle 16 è location |
| DDT da fatturare | elenco documenti | condizione derivata — eccezione già prevista in §11.2 |
| Ambito (Fisico/Online/Manuale) | dentro Origine, Corrispettivi | `app-segmented` proiettato, non una colonna |

> **La decisione del proprietario:** _«la colonna operatore possiamo metterla attivabile,
> spenta per default e, quando accesa, si impostano regole semplici che non ci bloccano il
> lavoro né altro»._

⭐ **Il filtro non era orfano: mancava la colonna.** Operatore, Controparte e Location sono
dati veri che l'elenco non mostrava. Diventano colonne normali — `defaultVisible: false` —
e il filtro arriva da sé, senza nessuna eccezione al contratto.

⚠️ **Combacia con una decisione già presa lo stesso giorno**: _«il filtro deve esserci anche
sulle colonne spente per default»_ (§0.2). Le due insieme dicono che una colonna spenta non
è una colonna assente: porta il suo filtro nel pannello e si accende quando serve.

⛔ **Restano due eccezioni vere**, e restano dichiarate in §11.2: «DDT da fatturare» è una
condizione derivata che nessuna colonna esprime, e l'Ambito dei Corrispettivi è una
scorciatoia proiettata dentro un altro filtro.

---

### ✅ D2 · «Niente impaginazione» era il LIMITE DI VISUALIZZAZIONE, non il meccanismo

**La misura.** L'interpretazione larga rompeva un file che non è un elenco:
`global-search.component.ts:149` chiede **5 righe per fonte a sei servizi** in `forkJoin`, a
ogni tasto — prodotti, clienti, fornitori, ordini fornitore, ordini cliente, documenti.

```text
interpretazione larga  →  ogni tasto scarica catalogo + clienti + fornitori + ordini + documenti
                       →  oppure, tolti page/pageSize dai tipi, quel file non compila
```

> **La decisione del proprietario:** _«niente impaginazione mi riferivo a quella limitata a
> 20 righe. Il problema è solo sull'impaginazione che non hanno filtro periodo, ma mi
> riferivo solo alla visualizzazione. Per chi non ha il filtro periodo, possiamo far
> visualizzare l'elenco nel contenitore e man mano si scorrono i risultati. Per ora lo
> facciamo semplice e libero da limiti, poi ce ne occuperemo in un secondo momento.»_

⭐ **Quello che sparisce è il TETTO DI RIGHE A SCHERMO, non ogni concetto di pagina.** Un
elenco mostra tutto il risultato del filtro dentro il proprio contenitore, e lo si scorre.

| | |
| --- | --- |
| **elenchi** — documenti, ordini, anagrafiche, movimenti, giacenze | niente tetto: si mostra il risultato e si scorre |
| **ricerca globale** | ⛔ **fuori perimetro**: non è un elenco, è un'anteprima da cinque righe per fonte |

⚠️ **Il contenimento resta diseguale, ed è accettato per ora.** I riepiloghi datati si
contengono col Periodo (§12.2); le anagrafiche non hanno un asse temporale che faccia lo
stesso mestiere, quindi caricano tutto. Il proprietario ha dichiarato la scelta
**provvisoria**: _«poi ce ne occuperemo in un secondo momento»_.

⛔ **Non si chiuda questa voce dicendo che il problema non esiste.** I DEFAULT misurati oggi
— `DEFAULT_CUSTOMER_PAGE_SIZE` 20, `DEFAULT_PRODUCT_PAGE_SIZE` 10, `DEFAULT_INVENTORY_PAGE_SIZE`
20, `DEFAULT_SUPPLIER_PAGE_SIZE` 20 — e i sei elenchi che hanno ancora un paginatore a
schermo (clienti, fornitori, prodotti, giacenze, situazione magazzino, vendite online) sono
il perimetro del lavoro, non un dettaglio.

---

### ✅ D3 · L'intestazione DEVE restare fissa mentre le righe scorrono

**La misura, ed è il difetto più insidioso dei tre.** `data-table.component.scss:146-149`:

```scss
.data-table-scroll {
  overflow-x: auto;   // l'altro asse computa `auto` per spec
  inline-size: 100%;
}                     // ⛔ nessun max-block-size: non scorre MAI in verticale
```

Lo scorrimento verticale vero vive in `.shell__content`
(`shell-layout.component.scss:191-192`). Il `position: sticky; inset-block-start: 0` del
`<th>` (`data-table.component.scss:167-172`) si ancora quindi a uno scrollport che non
scorre.

⛔ **L'intestazione appiccicata probabilmente non appiccica già oggi**, e nessuno se n'era
accorto perché con venti righe a schermo non si vedeva.

> **La decisione del proprietario:** _«l'intestazione deve essere fissa e scorrere le
> righe»._

⭐ **Diventa un requisito, non una correzione.** E le due decisioni si tengono in piedi a
vicenda: senza tetto di righe un elenco può essere lungo centinaia di schermate, e
un'intestazione che scorre via porterebbe con sé **i controlli di filtro** — che è
esattamente ciò che questa migrazione mette lassù.

```text
niente tetto di righe   →   elenchi lunghi
elenchi lunghi          →   l'intestazione DEVE restare
l'intestazione resta    →   i filtri in intestazione hanno senso
```

⚠️ **Va verificato col browser, non con i test.** Build e prove non dicono se una cosa
resta a schermo: è la stessa ragione per cui questo difetto è vissuto finora senza che
nessuna guardia lo notasse.

---

### ⏸ Cosa resta aperto: da dove arrivano le VOCI di un filtro a valori

Oggi «Operatore» arriva da due endpoint dedicati — `documents.controller.ts:101`,
`inventory.controller.ts:241` — ed elenca **tutti** gli operatori. Letto dall'insieme
caricato elencherebbe **solo quelli presenti nel risultato corrente**.

⚠️ **Non è un dettaglio implementativo**: chi non trova più un collega in tendina conclude
che non ha movimenti, mentre è il Periodo ad averli esclusi.

⭐ **La decisione D2 lo attenua ma non lo chiude**: senza tetto di righe l'insieme caricato
è tutto il risultato del filtro, quindi la tendina è completa **rispetto a ciò che si sta
guardando**. Resta la differenza fra «tutti gli operatori» e «gli operatori di questo
periodo».

Si procede con la strada semplice — **valori dall'insieme caricato** — coerente con
_«per ora lo facciamo semplice»_. Se i due endpoint restano orfani si ritirano, ma non in
questo passaggio.

---

### Gli ostacoli tecnici — lavoro dichiarato, non decisioni

| | Misura |
| --- | --- |
| **`cellText` non copre `status` né `linkStatus`** | `document-table.component.ts:361` ha `default: return ''`; le due colonne sono rese da `<ng-template appCell>`. **Un filtro a valori nascerebbe VUOTO proprio dove il caso d'uso è principale** |
| **Le pseudo-colonne prenderebbero un filtro** | `select` e `actions` sono `TableColumnDef` come le altre: sotto opt-out ne ricevono uno. Nove casi. Serve `filter: false` |
| **Nessuna delle 11 colonne data deduce `range`** | 7 deducono `text` (portano `display: 'code'`), 4 deducono `values` — cioè una tendina con un valore per ogni data |
| **91 colonne non sono elenchi** | sei configurazioni sono griglie di RIGHE DOCUMENTO, rese da `document-line-head` e non da `app-data-table`: `filterableColumns()` offrirebbe un filtro anche a loro |
| **Due elenchi non ricevono i `TableColumnDef`** | `corrispettivi-orders-table` prende `visibleColumns: string[]`; `online-sale-table` non ha né colonne né `TableViewId` |
| **Sei elenchi non hanno veste filtri mobile** | prodotti, movimenti, giacenze, situazione, clienti, fornitori: il pannello va creato, non adattato |
| **La consistenza righe non guarda `filter`** | `document-line-columns.consistency.spec.ts:80` elenca cinque proprietà e non questa |
| **Un e2e aggancia un filtro per nome** | `permissions-owner.spec.ts:143` cerca `'Filtra per location'`: spostarlo nell'intestazione lo rompe |
| **Il commento del motore contraddice §11.4** | `data-table.component.ts:48-51`: «Gli elenchi sono paginati lato server» |
| **237 colonne, ZERO dichiarano `filter`** | dedotte oggi: `values` 147 · `text` 21 · `range` 69 |

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

## 12.2 ⭐ Periodo obbligatorio e visibile sui riepiloghi datati — 29/08/2026

> **Un riepilogo le cui righe hanno una data di riferimento DEVE esporre un filtro
> Periodo visibile, con default «Ultimi 30 giorni».**

```text
riepilogo con righe datate
  → filtro Periodo VISIBILE
  → default «Ultimi 30 giorni»
  → la chiamata iniziale è già limitata a quei 30 giorni
  → l'operatore VEDE il limite applicato
  → può scegliere gli altri preset, «Tutti» o «Personalizzato»

«Tutti»            rimuove `dateFrom`/`dateTo` — nessun limite temporale
«Personalizzato»   usa Dal/Al, inclusivi sugli estremi (§12.1)
```

⭐ **Lo scopo è anche prestazionale**, e va detto perché è metà della ragione: la
prima chiamata chiede solo le righe del periodo invece di tutto lo storico del
tenant. Un elenco che si apre su «Tutti» fa contare al database ogni riga prima
ancora che l'operatore abbia guardato qualcosa.

### ⛔ Ciò che non deve più esistere

> **Un limite temporale applicato alla query senza un controllo che lo mostri.**

Misurato il 29/08/2026 su `document-list`: il costruttore scriveva `dateFrom`/
`dateTo` a trenta giorni **per ogni profilo**, ma il selettore Periodo esisteva
**solo** sull'Arrivo merce. I Preventivi si aprivano filtrati sugli ultimi trenta
giorni senza dirlo — con «Azzera filtri» già visibile e il badge a 1, e nessun
controllo a schermo che spiegasse perché.

⚠️ **Se il riepilogo è limitato, l'operatore deve poterlo vedere e cambiare.**
Le due cose vanno insieme o nessuna delle due: un limite invisibile è peggio di
nessun limite, perché l'operatore cerca righe che ci sono e non le trova.

### La data di riferimento è quella che il riepilogo già usa

⛔ **Non si introduce una seconda semantica temporale** durante una migrazione.

Per `document-list` è **verificato**: l'API filtra sempre su `documentDate`
(`api/src/documents/documents.service.ts`), per tutti e nove i profili.
`registrationDate` è una colonna di sola visualizzazione e **non è filtrabile** —
zero occorrenze nel servizio. Nessuna ambiguità da risolvere.

⚠️ Se un riepilogo presentasse **più date** e non fosse determinabile dal
comportamento corrente quale governa il filtro, ci si ferma e si riporta: non si
sceglie per analogia.

⛔ **Non si inventa un Periodo dove non c'è una data funzionale di riferimento.**
La regola dice «riepilogo con righe datate», non «tutti i riepiloghi».

### L'eccezione dell'Arrivo merce, che resta

```text
Arrivo merce             Dal/Al visibili SOLO con «Personalizzato»
altri profili            Dal/Al sempre visibili
```

È la condizione `!isGoodsReceiptList() || isCustomPeriod()` già in essere, e
questa decisione **non autorizza a uniformarla**: due rese diverse di Dal/Al sono
un fatto misurato, non un'incoerenza da correggere di passaggio.

### ⚠️ Divergenza dichiarata: dodici preset scritti, otto implementati

§12 elenca dodici voci — vi compaiono «Giorno specifico», «Mese di calendario»,
«Trimestre», «Anno di calendario». L'implementazione condivisa
(`MOVEMENT_PERIOD_OPTIONS`, in `domain/inventory/models/movement-period.util.ts`)
ne ha **otto**:

```text
Tutti · Ultimi 7 giorni · Ultimi 30 giorni · Mese corrente
Mese scorso · Anno corrente · Anno scorso · Personalizzato
```

⛔ **Le quattro mancanti non si aggiungono in un refactor dei filtri.** §12 dice
«supporta almeno», quindi non c'è violazione — ma chi legge le due sezioni
insieme deve sapere che la lista lunga è un obiettivo e la corta è ciò che esiste.
Aggiungere un preset è una decisione con la sua aritmetica dei giorni civili, e
appartiene al motore Periodo, non a questa migrazione.

⚠️ La questione **UTC / ora locale** resta rinviata come da §12.1: questa
decisione non la tocca.

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

# 31. ⛔ La terza matrice dei filtri — tolta il 29/08/2026

Qui c'era una **«matrice filtri iniziale»**: un terzo elenco di quali filtri spettassero a
ogni profilo, che rimandava a sua volta al §42-bis.12.

Erano tre copie della stessa cosa — questa, le dieci sezioni per profilo e la matrice
sintetica — e tenerle allineate era un lavoro che nessuno avrebbe fatto.

⭐ **I filtri di un elenco sono le sue colonne** (§0.2): la dichiarazione sta dove la
colonna è già dichiarata, e non esiste un elenco parallelo da mantenere.

⚠️ Restano fuori dalle colonne solo **Periodo** e **Ricerca** (§11.2).

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

# 42-bis. Profili documentali: regole comuni e riepiloghi

Restano qui le regole **comuni ai profili** (§42-bis.1) e la matrice dei **riepiloghi**
(§42-bis.13).

⛔ **I filtri non stanno più qui**: derivano dalle colonne (§0.2, §11).

## 42-bis.0 ⛔ Le matrici di filtri per profilo sono state TOLTE — 29/08/2026

Qui c'erano dieci sezioni con i «filtri base» di ogni profilo, più una matrice sintetica
che li ricapitolava: **circa 550 righe di elenchi**.

Sono state cancellate perché descrivevano a mano una cosa che le colonne già dichiarano
(§0.2): misurati, **6 filtri su 6 dell'Ordine cliente e 5 su 5 dell'Arrivo merce erano già
colonne dello stesso elenco**.

⚠️ **Due errori valgono la pena di essere ricordati, perché possono tornare.**

Il primo: la matrice era nata con la parola **«filtri fissi»**, e letta alla lettera
durante l'unificazione avrebbe **cancellato quattro filtri esistenti** dell'Arrivo merce —
Collegamento, Magazzino, Tipo di documento e Pagamento — nessuno dei quali era mai stato
messo in discussione. La correzione del 29/08 la ribattezzò «filtri base, non whitelist».

Il secondo, nella correzione stessa: **«non si introduce un filtro per ogni colonna»**. Era
una guardia contro il generare filtri a caso, e puntava esattamente contro la decisione
presa poche ore dopo.

> ⛔ **Nessuna rimozione funzionale durante un refactor.** Resta valida e non dipende dalle
> matrici: un filtro esistente si toglie con una decisione esplicita del proprietario, mai
> perché non compare in un elenco sintetico.

Ciò che governa i filtri oggi sta in **§0.2** (derivazione dalle colonne, le due vesti, il
pulsante che accende e azzera, colonna spenta = filtro spento) e in **§11** (cosa dichiara
una colonna, cosa resta fuori, niente impaginazione).

⭐ §42-bis.1 resta: sono le regole **comuni** — presets del Periodo, valori di Stato,
controllo entità per i soggetti, footer dei totali — che non erano per profilo e non
dipendono da come i filtri si dichiarano.

### E copre i profili che qui erano esclusi

⛔ Qui c'era anche un elenco di profili «non congelati da questa decisione» — Registrazione
fattura fornitore, Trasferimenti, Rettifiche, Inventario, altri report — con la regola
«nessun nuovo filtro fino a decisione specifica».

⭐ **Cade, ed è voluto**: derivando dalle colonne, ogni elenco riceve i propri filtri
perché ha delle colonne, non perché qualcuno gliene abbia assegnati. _«I filtri sulle
colonne, e a tutte quelle del riepilogo, qualsiasi esso sia»_ — decisione owner del
29/08/2026.

⚠️ **Resta invece ferma per le METRICHE**: un riepilogo non guadagna totali nuovi perché
ha colonne nuove. Filtri e metriche non si muovono insieme (§29, §42-bis.13).

---

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

Le fasi seguenti costruiscono la **stessa autorità strutturale** (§0): un solo insieme di
contratti, non sei refactor indipendenti.

⚠️ **Non costruiscono necessariamente un componente involucro.** La Fase G — l'unica che
produrrebbe uno shell fisico — è **condizionata** alla duplicazione che resta dopo i
contratti, e può concludersi con «non c'è niente da estrarre».

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

✅ **ESEGUITA il 29/08/2026. L’output è in §3.2**, con la fotografia riconfermata
in §3.1, la causa tecnica in §3.3, i piloti congelati in §3.4 e i consumer senza
pannello mobile in §3.5.

⛔ **Zero modifiche al codice**, come la fase richiede.

## Fase B — filtri derivati dalle colonne

⛔ **Qui c'era «definire un contratto che renda gli stessi filtri dichiarati dal modulo»**,
con i piloti `document-list` e `sales-order-list` uno alla volta. La strada è cambiata il
29/08/2026 (§0.2): i filtri non si dichiarano per consumer, derivano dalle colonne — quindi
non c'è una migrazione consumer per consumer da pilotare.

Ordine dei passi:

```text
1  TableColumnDef       aggiungere  filter?: 'values' | 'text' | 'range'
2  motore tabella       il controllo nell'intestazione, acceso dal pulsante Filtri
3  pannello mobile      le stesse colonne filtrabili come voci
4  barra esterna        restano Periodo e Ricerca
5  consumer             togliere le dichiarazioni e il markup filtri
```

⚠️ **Il passo 5 arriva per ultimo e per tutti insieme**: finché i consumer dichiarano
ancora i propri filtri, i due meccanismi convivrebbero e la stessa colonna avrebbe due
controlli — che è il difetto vietato da §17.4.

⭐ **`app-list-filters` non si butta**: diventa la veste mobile e ospita Periodo e Ricerca
sul desktop.

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

## Fase G — ⏸ shell leggero, SE resta duplicazione reale

⛔ **Non è più un passo obbligato.** Deciso il 29/08/2026: lo shell fisico si estrae solo se,
applicati e verificati tutti i sottocontratti, resta duplicazione **strutturale e
comportamentale** vera.

### Il criterio, e non è opinabile

```text
il residuo è GEOMETRIA o ASPETTO
  → manca un contratto, o va migliorato
  → ⛔ NON giustifica uno shell

il residuo è la STESSA STRUTTURA
  stessi slot · stessi stati loading/empty/error · stesso comportamento ripetuto
  → ✅ candidato reale a shell leggero
```

⚠️ **Senza questo criterio «censire i residui» è una domanda a cui si può rispondere in due
modi opposti**, ed è il motivo per cui sta qui e non nella testa di chi eseguirà.

### ✅ Il censimento è stato fatto, e dice SÌ — 29/08/2026

Applicati i contratti di geometria alle undici pagine elenco, il residuo è stato misurato.
**Non è geometria: è struttura.**

```text
ZONE                          SEGNALI DI STATO
testata       11 / 11         loading()             11 / 11
stati         11 / 11         error()               11 / 11
dati          11 / 11         isEmpty()             10 / 11
toolbar       10 / 11         app-table-skeleton    11 / 11
totali/pag.    9 / 11
azioni         6 / 11
```

⭐ **Tre zone in tutte e undici, e i tre segnali di stato con gli STESSI NOMI.** Non è una
somiglianza: è una convenzione che esiste già e non è mai stata formalizzata. I quattro rami
`@if (loading()) … @else if (error()) … @else if (isEmpty()) … @else` sono scritti undici
volte, identici, con gli stessi componenti nello stesso ordine.

⭐ **E i contratti non erano l'alternativa allo shell: erano il suo prerequisito.** Prima,
adottarlo significava anche riparare undici geometrie diverse — ed è la ragione per cui non
è mai stato fatto. Ora resta **solo consolidamento di markup**, senza rischio funzionale.

⚠️ **Corrispettivi è l'unica senza `isEmpty()`**, e va guardata prima di generalizzare: se
gestisce il vuoto dentro la tabella, o lo shell prevede il caso o quella pagina resta fuori
da una zona.

⚠️ **`product-list` ha i filtri dentro `app-product-toolbar`**, un componente proprio: nel
conteggio sta a 0 sulla toolbar. Non è un ostacolo — è uno slot riempito da un componente
invece che da markup — ma va previsto.

⭐ E lo shell, se nascerà, dev'essere **stupido**: niente dominio, niente query, niente
`if tipo documento`. Compone sottocontratti già provati, o non serve.

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

# 46. Criteri di accettazione — Shell ⏸ *(valgono SE lo shell viene estratto)*

⚠️ Lo shell fisico non è un requisito (§0, Fase G). Questi criteri descrivono **com'è fatto
bene se si decide di estrarlo**, non un traguardo da raggiungere.

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

⛔ **Qui il primo punto era «nuovo elenco operativo fuori dal shell comune».** Cambiato il
29/08/2026 insieme al §0: pretendeva lo shell fisico, che non è più un requisito — ed era la
formulazione più insidiosa delle cinque, perché è quella che **qualcuno esegue**.

⭐ Il bersaglio giusto è più forte dell'originale: non «una pagina fuori dal telaio», ma **una
seconda implementazione di qualcosa che è già comune**. È il difetto vero — quello che ha
prodotto quattro contenitori di scorrimento scritti a mano, ognuno col proprio difetto.

Dopo la convergenza, introdurre protezioni contro:

- nuova implementazione **equivalente** di un contratto già comune;
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
- Non introdurre `if pagina === ...` in NIENTE di condiviso — shell, mixin o componente.
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
