# VestiFlow — Specifica normativa Ordine cliente manuale

**Versione:** 1.0-r1 candidata  
**Data:** 28/08/2026  
**Stato:** candidata da revisionare e approvare prima dell'implementazione  
**Modulo:** Ordine cliente manuale  
**Natura:** specifica funzionale e di dominio; non è un audit tecnico e non è un ordine di modifica del codice  
**Obiettivo:** fissare in una sola fonte le regole correnti dell'Ordine cliente manuale, eliminando le contraddizioni con specifiche storiche e comportamenti tecnici legacy.

**Revisione r1:** recepisce la verifica tecnica su persistenza dello stato, visibilità `Impegna`, `forceConclude`, neutralizzazione reservation, riattivazione Annullato→Confermato e gap di eliminazione. Le due decisioni ancora non deliberate sono marcate esplicitamente e non vengono fatte passare per norme approvate.

---

# 0. Regola di prevalenza e uso del documento

In caso di conflitto si applica questo ordine:

1. decisioni più recenti confermate dall'owner;
2. questa specifica, dopo approvazione;
3. Master corrente VestiFlow;
4. contratti trasversali vigenti, in particolare:
   - contratto comune documenti e righe;
   - `12-specifica-collegamenti-documentali.md`;
   - specifica Elenchi comune;
   - specifica Listini;
   - specifica Pagamenti/Tesoreria;
5. Piano Master di verifica;
6. audit e mappe tecniche datate;
7. codice e test correnti;
8. materiale storico, mockup e benchmark esterni.

Il codice corrente descrive ciò che esiste; non decide automaticamente ciò che è corretto.

Questa specifica distingue sempre:

- **DECISO** — requisito funzionale;
- **STATO TECNICO** — comportamento osservato da verificare sul repository;
- **SUPERATO** — regola precedente da non reintrodurre;
- **FUORI PERIMETRO** — funzione non richiesta nella v1;
- **RINVIO** — regola governata da una specifica trasversale diversa.

---

# 1. Scopo

L'Ordine cliente manuale rappresenta un impegno commerciale registrato da VestiFlow.

Non è:

- un Preventivo;
- una Vendita al banco;
- una Vendita online Shopify;
- un DDT;
- una Fattura;
- un movimento fisico di magazzino;
- un Corrispettivo;
- un movimento finanziario.

L'Ordine cliente:

- può essere salvato e riaperto;
- può contenere righe prodotto/servizio;
- può impegnare quantità di magazzino quando lo stato e la riga lo prevedono;
- non modifica direttamente la Giacenza;
- può partecipare al sistema comune **Includi / Genera**;
- mantiene una propria identità e propri snapshot;
- resta modificabile anche quando è Concluso o Annullato, salvo permessi o blocchi indipendenti dallo stato;
- distingue nettamente gli ordini manuali dagli ordini posseduti da canali esterni.

---

# 2. Decisioni definitive in sintesi

## 2.1 Stati funzionali dell'Ordine cliente manuale

Gli stati funzionali VestiFlow sono quattro:

1. **Da confermare**
2. **Confermato**
3. **Concluso**
4. **Annullato**

Non esiste nel workflow manuale VestiFlow lo stato:

- `Parzialmente concluso`;
- `PartiallyConcluded`;
- equivalente funzionale visibile all'operatore.

## 2.2 Significato sintetico

| Stato             | Impegna magazzino                  | Includibile come sorgente  | Colonna `Impegna magazzino`          | Origine dello stato                            |
| ----------------- | ---------------------------------- | -------------------------- | ------------------------------------ | ---------------------------------------------- |
| **Da confermare** | No                                 | No                         | **Nascosta**                         | selezionabile dall'operatore                   |
| **Confermato**    | Sì, secondo le righe               | Sì, se la coppia è ammessa | **Visibile**                         | selezionabile dall'operatore; default corrente |
| **Concluso**      | Nessun nuovo impegno               | No                         | **Nascosta** (deciso il 29/08, §9.2) | automatico da collegamento conclusivo valido   |
| **Annullato**     | No; rilascia gli impegni esistenti | No                         | **Nascosta**                         | selezionabile dall'operatore                   |

`Concluso` deve essere visibile come stato effettivo dell'ordine, ma non è una normale scelta manuale equivalente a Confermato/Da confermare/Annullato.

## 2.3 Evasione parziale

**VestiFlow v1 non gestisce l'evasione parziale degli Ordini cliente manuali.**

Quindi non si implementano:

- quantità evasa per riga;
- quantità residua da evadere;
- seconda/terza evasione dello stesso ordine;
- stato Parzialmente concluso;
- scheda Ordinato / Consegnato / Da consegnare;
- `forceConclude` come workflow funzionale;
- motore di residui;
- riapertura automatica dell'ordine per il residuo.

Se un documento conclusivo viene modificato prima del salvataggio in modo da non coprire tutte le righe/quantità dell'ordine e il sistema riesce a rilevarlo:

- mostra un **warning non bloccante**;
- l'operatore può annullare l'operazione;
- se procede e il documento conclusivo viene salvato validamente, l'Ordine viene comunque considerato **Concluso**;
- non nasce alcun residuo evadibile;
- non nasce alcuno stato intermedio.

### ⭐ L'avviso di copertura incompleta — testo approvato il 29/08/2026

Il documento conclusivo che non copre tutte le righe/quantità mostra questo, **e nient'altro**:

```text
titolo    Il documento non copre tutto l'ordine

testo     Il documento non copre completamente l'ordine. Se prosegui,
          l'ordine verrà comunque concluso e non resterà alcun residuo.

elenco    i numeri degli ordini coinvolti

azioni    [ Annulla ]  ghost        [ Salva comunque ]  primary
```

⛔ **Non è un workflow di evasione parziale, ed è per questo che il testo è stato
riscritto.** Diceva _«Ordine non evaso del tutto — Non sono stati evasi tutti i prodotti
previsti. Forzare lo stato a Concluso?»_ con **tre** pulsanti: «Sì» chiamava
`force-conclude`, «No» lasciava l'ordine «Parzialmente concluso». Il criterio ora è la
**copertura**, non l'evasione, e gli esiti sono due.

⚠️ **La primitiva a tre pulsanti del componente condiviso NON è stata rimossa**
(`ConfirmDialog.extraLabel`), pur essendo rimasta senza consumer: è una primitiva
generica, e resta inattiva a condizione che non esponga il workflow parziale nella UI,
non venga chiamata dal workflow manuale, non produca effetti e non introduca stati o
percorsi alternativi. Il suo test è stato reso **neutro** apposta.

## 2.4 Vincolo tecnico già misurato: `Da confermare` richiede persistenza esplicita

**DECISO funzionalmente:** `Da confermare` appartiene al workflow v1.

**STATO TECNICO misurato sul codice corrente:** oggi non esiste un valore persistibile autonomo per rappresentarlo.

La situazione corrente è:

```text
Database/schema  → nessun campo "stato" manuale autonomo;
                   stato derivato da cancelledAt / fulfilledAt

Form             → status: 'confirmed' | 'cancelled'

DTO API          → status?: 'confirmed' | 'cancelled'
```

Conseguenze:

- `Da confermare` non può essere aggiunto correttamente con una sola modifica UI;
- serve una modifica di persistenza/schema e l'allineamento dei derivatori e dei consumer;
- questa specifica **non sceglie** a priori se la rappresentazione debba essere un campo stato, un timestamp dedicato o altra soluzione equivalente;
- la scelta tecnica deve essere fatta dopo audit della causa radice e dei consumer;
- la migration dello stato è un **intervento separato** e non appartiene alla tranche corrente di sola documentazione/audit;
- nessuno deve simulare `Da confermare` con combinazioni ambigue dei timestamp esistenti o con stato solo client-side.

Questo è un **rinvio tecnico**, non un rinvio funzionale: lo stato resta requisito della v1.

### ⭐ 2.4-bis · Il rinvio è sciolto — modello e backfill decisi il 28/08/2026

```text
SalesOrder.commercialState   enum OrderCommercialState        ANNULLABILE
                             to_confirm · confirmed · concluded · cancelled
                             NULL quando source ≠ manual
```

⭐ **Annullabile, e non è una comodità**: un ordine di canale **non ha** un ciclo commerciale
VestiFlow. `NULL` lo dichiara, e rende la separazione da Shopify **strutturale** invece che
convenzionale. Costa zero: l’eleggibilità filtra già `source = manual`.

⛔ **Non si riciclano `fulfilledAt` / `fulfillmentStatus`**, e non solo perché sono del canale:
`corrispettivi.service.ts` usa `fulfilledAt` come **data dell’evento economico** del registro.
Sovraccaricarlo sposterebbe righe di un registro fiscale.

⚠️ L’Ordine **fornitore** non prende una colonna nuova: il suo enum esiste e riceve `to_confirm`
in modo additivo (`17` §2.3). L’autorità comune resta `order-state.util.ts`; l’unificazione
fisica dei due tipi PostgreSQL è un refactor futuro separato, dichiarato e non urgente.

#### Il backfill: decide la RELAZIONE, non l’etichetta legacy

| condizione (in quest’ordine)       | → stato         |
| ---------------------------------- | --------------- |
| `source ≠ manual`                  | **`NULL`**      |
| `cancelledAt` valorizzato          | **`cancelled`** |
| collegamento conclusivo **attivo** | **`concluded`** |
| altrimenti                         | **`confirmed`** |

⛔ **`fulfilledAt` da solo NON è più prova di Concluso**, ed è la conseguenza diretta della
misura di §7.2-bis: `delete` può lasciarlo valorizzato dopo aver perso il collegamento. Un
ordine con `fulfilledAt` e nessun link attivo è un **residuo del vecchio workflow**, e il
backfill lo riporta a `confirmed`.

⭐ **Per la stessa ragione `partially_fulfilled` non ha più bisogno di una regola propria:** con
link attivo è `concluded`, senza è `confirmed`. È la relazione documentale a dire se quell’ordine
era davvero concluso.

⛔ **Nessun record storico diventa `to_confirm`**: non esiste un dato che lo dimostri. Quel
valore nasce solo per ordini nuovi.

#### ⭐ Il default alla creazione — deciso il 28/08/2026

⚠️ **Qui c'era un rinvio** («quale sia il default alla prima creazione è una decisione a
parte»). È chiuso:

> **Un Ordine cliente nuovo nasce CONFERMATO.** «Da confermare» è una scelta esplicita
> dell'operatore, non il nuovo default.

⭐ **La ragione è operativa, non tecnica:** chi crea normalmente un ordine non deve compiere un
passaggio in più solo perché abbiamo introdotto un quarto stato. Il comportamento di oggi resta
quello di domani; il nuovo valore serve a chi vuole **deliberatamente** salvare un ordine non
ancora operativo.

| alla creazione                             |                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------- |
| l'operatore lascia **Confermato** e salva  | reservation secondo le righe · Impegnata aggiornata · includibile |
| sceglie **Da confermare** prima di salvare | nessuna reservation · nessuna Impegnata · non includibile         |

#### ⛔ Il default sta nel SERVIZIO, non nel database

> **`commercialState` NON prende un `DEFAULT 'confirmed'` a livello PostgreSQL.** Resta
> annullabile e senza default; è il servizio ad assegnare `confirmed` quando crea un ordine
> con `source = manual`.

⚠️ **Un default di colonna assegnerebbe uno stato commerciale VestiFlow anche a un record di
canale**, ogni volta che una `INSERT` omettesse il campo — un import, una sync, uno script.
`NULL` per gli ordini di canale è una garanzia solo finché **nulla** la riempie da sé.

⭐ Sull'Ordine **fornitore** il problema non si pone: non esistono ordini fornitore di canale.
Lì la colonna ha già un default e lo conserva — `confirmed` — e l'enum riceve `to_confirm` in
modo additivo, senza cambiare il comportamento di creazione (`17` OF-001).

---

# 3. Grandezze di magazzino

VestiFlow usa le grandezze canoniche:

```text
Giacenza     = quantità fisica risultante dai movimenti
Impegnata    = quantità assegnata a ordini attivi
Disponibile  = Giacenza - Impegnata
```

## 3.1 Effetto dell'Ordine cliente

L'Ordine cliente:

- può modificare **Impegnata**;
- di conseguenza modifica **Disponibile**;
- non modifica direttamente **Giacenza**;
- non crea movimenti fisici per il solo cambio stato;
- non deve fingere un carico/scarico per rappresentare una prenotazione.

## 3.2 Stock insufficiente

L'insufficienza stock produce un **warning non bloccante**.

Sono ammessi:

- Giacenza negativa;
- Disponibile negativa;
- Impegnata superiore alla Giacenza.

Non introdurre nell'Ordine cliente manuale:

- errore 409 per sola insufficienza;
- blocco del salvataggio per sola insufficienza;
- riduzione automatica della quantità;
- disattivazione automatica di `Impegna magazzino`;
- prenotazione parziale automatica.

Esempio:

```text
Giacenza     5
Impegnata    4
Disponibile  1

Ordine Confermato:
riga Q.tà 3 con Impegna = ON

Risultato ammesso:
Giacenza     5
Impegnata    7
Disponibile -2

UI:
warning non bloccante
```

---

# 4. Stato `Da confermare`

## 4.1 Significato

`Da confermare` è un Ordine cliente salvato ma non ancora attivo ai fini dell'Impegnata.

Non è uno stato tecnico di autosalvataggio e non coincide con “form non salvato”.

## 4.2 Effetti

In `Da confermare`:

- l'ordine può contenere righe;
- l'ordine può essere modificato e salvato;
- **non esistono impegni attivi prodotti dall'ordine**;
- Giacenza resta invariata;
- Impegnata non viene aumentata;
- Disponibile non viene ridotta per effetto dell'ordine;
- l'ordine non è proponibile come sorgente in Includi/Genera;
- la colonna/controllo **Impegna magazzino è nascosta**.

## 4.3 Passaggio `Confermato → Da confermare`

Al salvataggio della transizione:

- rilasciare gli impegni attivi dell'ordine;
- non creare movimenti fisici;
- non cambiare Giacenza;
- riallineare Disponibile come conseguenza della riduzione di Impegnata;
- l'operazione deve essere idempotente.

La semplice scelta del valore nel form non deve produrre effetti prima del salvataggio.

## 4.4 Passaggio `Da confermare → Confermato`

Al salvataggio:

- la colonna `Impegna magazzino` torna operativa;
- vengono create/sincronizzate le reservation previste dalle righe;
- si rispettano variante, Location e flag di riga;
- stock insufficiente = warning non bloccante;
- nessun movimento fisico.

---

# 5. Stato `Confermato`

## 5.1 Significato

`Confermato` è lo stato operativo dell'Ordine cliente manuale.

È lo stato che può produrre Impegnata.

Lo stato iniziale proposto per un nuovo Ordine resta **Confermato**, salvo futura decisione esplicita diversa. L'introduzione di `Da confermare` non lo rende automaticamente il nuovo default.

## 5.2 Impegni

In `Confermato`:

- la colonna `Impegna magazzino` è visibile;
- l'effetto è valutato per riga;
- una riga con `Impegna magazzino = ON` può creare/mantenere una reservation;
- una riga con `Impegna magazzino = OFF` non crea reservation;
- servizi e articoli non gestiti a magazzino non devono creare Impegnata anche se il dato UI fosse valorizzato erroneamente;
- le reservation devono essere collegate all'ordine/riga/variante/Location secondo il modello canonico.

## 5.3 Nessun movimento fisico

Confermare un Ordine:

```text
NON carica
NON scarica
NON crea movimento fisico
```

Modifica soltanto Impegnata.

---

# 6. Stato `Annullato`

## 6.1 Significato

`Annullato` indica che l'ordine non è più operativo, ma resta nello storico.

Non significa eliminato.

## 6.2 Effetti

Al salvataggio di `Annullato`:

- tutti gli impegni attivi dell'ordine vengono rilasciati;
- Giacenza resta invariata;
- non viene creato alcun movimento fisico;
- l'ordine non è includibile/generabile come sorgente;
- la colonna **Impegna magazzino è nascosta**;
- l'ordine resta apribile e modificabile secondo permessi e lock ordinari.

## 6.3 Idempotenza

Ripetere il salvataggio di un ordine già Annullato:

- non deve rilasciare due volte;
- non deve creare eventi duplicati;
- non deve alterare la Giacenza;
- non deve modificare altri ordini.

## 6.4 Riattivazione

**DECISO:** `Annullato → Confermato` è ammesso come cambio operativo.

**STATO TECNICO già misurato:** il codice corrente azzera `cancelledAt` quando il salvataggio non è `cancelled` e il ramo `confirmed` ricostruisce/sincronizza gli impegni. La futura implementazione non deve duplicare questo comportamento: deve verificarlo e conservarlo.

Al salvataggio:

- ricostruire/sincronizzare gli impegni coerentemente alle righe;
- rispettare `Impegna magazzino`;
- rispettare la Location salvata/selezionata;
- warning non bloccante se la Disponibile risultante diventa negativa;
- nessun movimento fisico.

---

# 7. Stato `Concluso`

## 7.1 Significato

`Concluso` indica che l'Ordine è stato utilizzato in un collegamento documentale che, secondo il contratto canonico della coppia origine → destinazione, conclude l'ordine.

La matrice delle coppie e la definizione di quali destinazioni siano conclusive vivono esclusivamente in:

> `12-specifica-collegamenti-documentali.md`

Questa specifica non mantiene una seconda matrice.

## 7.2 Stato automatico

`Concluso`:

- non nasce dalla semplice selezione manuale del testo “Concluso”;
- non nasce aprendo un form di destinazione precompilato;
- non nasce premendo soltanto `Genera`;
- nasce quando il documento di destinazione viene **realmente salvato** e il collegamento conclusivo è validamente persistito.

Se l'utente apre il documento generato e poi chiude senza salvarlo:

```text
Ordine resta nello stato precedente
reservation restano coerenti
nessun collegamento definitivo
nessun movimento aggiuntivo
```

## 7.2-bis ⭐ La riapertura — decisa il 28/08/2026, norma in `12` §0.4-bis

> **Annullare o eliminare il documento conclusivo è un’operazione documentale che RIAPRE
> l’ordine.** Non è l’assenza del collegamento a farlo.

```text
⛔ NON è la regola    manca documentId  →  riapri
⭐ È la regola        l'operatore annulla/elimina il documento conclusivo
                      →  quella operazione riporta l'ordine a Confermato
                         e ripristina gli impegni, nella STESSA transazione
```

### La matrice, e il filtro che ne discende

| stato       | `documentId` | lettura                                       |
| ----------- | ------------ | --------------------------------------------- |
| `confirmed` | `NULL`       | ✅ **includibile**                            |
| `confirmed` | valorizzato  | ⛔ incoerenza `state-stale` → non includibile |
| `concluded` | valorizzato  | ✅ corretto, non includibile                  |
| `concluded` | `NULL`       | ⛔ incoerenza `link-stale` → non includibile  |

> **Filtro includibili:** `commercialState = confirmed AND documentId IS NULL`.

⛔ **Nessun ramo «documento collegato annullato»**, e non è una semplificazione: `cancel()`
azzera `documentId` su **tutti** gli ordini agganciati, incondizionatamente. Sul Cliente quel
caso non è uno stato normale, e ammetterlo nel filtro legittimerebbe una condizione che il
codice non produce. ⚠️ Sull’Ordine **fornitore** è invece normale, perché lì la chiave sta sul
documento e non sull’ordine (`17` §2.5).

### ⛔ Un difetto misurato: `cancel` e `delete` non convergono

```text
cancel   azzera documentId (sempre)  +  riapre lo stato (se il documento scaricava)
delete   azzera documentId dal DATABASE (ON DELETE SET NULL) e basta
         → l'ordine resta «Concluso» senza collegamento
```

Oggi non si vede, perché il filtro guarda solo `documentId IS NULL` e quell’ordine **ricompare**
fra gli includibili. Con l’eleggibilità sullo stato sparirebbe: è il verso opposto, e altrettanto
sbagliato.

> **`delete` deve usare la STESSA primitive di riapertura di `cancel`** — quella che riporta lo
> stato a Confermato e ripristina gli impegni. ⛔ **Non una funzione nuova:** due strade separate
> sono ciò che le ha fatte divergere una volta.

## 7.3 Effetti sulle reservation

Il passaggio a `Concluso` non deve essere un secondo motore di stock.

Gli effetti devono appartenere alla transazione/contratto del collegamento:

- il documento fisico di destinazione produce gli eventuali movimenti fisici;
- il collegamento conclusivo neutralizza gli impegni dell'ordine senza duplicare lo scarico;
- dopo la conclusione non devono restare reservation attive che continuino a ridurre Disponibile;
- nessuna variazione di Giacenza deve essere generata dal solo valore dello stato.

## 7.4 Nessuna evasione parziale v1

Se l'operatore modifica il documento conclusivo e salva una copertura inferiore all'ordine:

- warning non bloccante, se il confronto è affidabile;
- se procede, l'ordine è comunque Concluso;
- eventuale Impegnata residua deve essere neutralizzata;
- non si crea un residuo da evadere;
- non si rende nuovamente proponibile l'ordine per una seconda evasione;
- non si usa `PartiallyConcluded`.

**STATO TECNICO già misurato:** il collegamento corrente consuma tutte le reservation attive dell'Ordine nella stessa transazione, indipendentemente dalla copertura. Il ramo `fullyCovered / partially_fulfilled` decide oggi l'etichetta di fulfillment, non la quantità neutralizzata. Per la v1 senza evasione parziale, rendere `Concluso` incondizionato dopo un collegamento conclusivo valido non deve introdurre un secondo effetto quantitativo: il contratto del collegamento resta l'autorità sulle reservation.

## 7.5 Modificabilità dopo la conclusione

Un ordine Concluso:

- resta apribile in Modifica;
- può essere modificato e salvato secondo le normali regole del modulo;
- non ricrea Impegnata;
- non riscrive il documento già generato/incluso;
- non modifica retroattivamente righe, prezzi, quantità o snapshot del documento successivo.

Le modifiche successive appartengono all'Ordine, non al documento già emesso.

## 7.6 Riapertura / scollegamento

La riapertura documentale, lo scollegamento, la cancellazione del documento successivo e il ritorno in includibilità sono materia del contratto comune `12`.

Questa specifica **non autorizza** un reset manuale `Concluso → Confermato` che ignori il collegamento esistente.

---

# 8. Macchina degli stati

## 8.1 Transizioni operative

| Da            | A             | Ammessa                                 | Effetto principale                                            |
| ------------- | ------------- | --------------------------------------- | ------------------------------------------------------------- |
| Da confermare | Confermato    | Sì                                      | crea/sincronizza Impegnata                                    |
| Da confermare | Annullato     | Sì                                      | nessuna Impegnata attiva                                      |
| Confermato    | Da confermare | Sì                                      | rilascia Impegnata                                            |
| Confermato    | Annullato     | Sì                                      | rilascia Impegnata                                            |
| Annullato     | Da confermare | Sì                                      | resta senza Impegnata                                         |
| Annullato     | Confermato    | Sì                                      | ricrea/sincronizza Impegnata                                  |
| Confermato    | Concluso      | solo via collegamento conclusivo valido | chiusura documentale, reservation neutralizzate dal contratto |
| Da confermare | Concluso      | No come cambio manuale                  | non ammesso                                                   |
| Annullato     | Concluso      | No come cambio manuale                  | non ammesso                                                   |
| Concluso      | altri stati   | non via semplice selettore              | governato da `12`                                             |

## 8.2 Effetti soltanto al salvataggio/commit

Cambiare il valore del selettore Stato nel form non deve:

- creare reservation immediatamente;
- rilasciare reservation immediatamente;
- creare movimenti;
- chiamare percorsi paralleli invisibili.

Gli effetti diventano reali soltanto con un salvataggio riuscito o con il commit del collegamento conclusivo.

---

# 9. Colonna `Impegna magazzino`

## 9.1 Natura del campo

`Impegna magazzino` è un effetto di riga, distinto da:

- `Carica magazzino`;
- `Scarica magazzino`.

Non deve essere sostituito da un effetto generico “movimenta”.

## 9.2 Visibilità per stato

Regole esplicitamente approvate:

```text
Da confermare → colonna nascosta
Confermato    → colonna visibile
Annullato     → colonna nascosta
```

### ⭐ Concluso — decisione CHIUSA il 29/08/2026

> **Anche in `Concluso` la colonna `Impegna magazzino` è nascosta.**

Il proprietario ha confermato l'opzione raccomandata. La ragione è quella già
scritta qui: in `Concluso` non nasce nessun nuovo impegno, quindi la colonna non
rappresenta più un effetto operativo attivo — e ⛔ **non è ammesso lasciare una
checkbox apparentemente operativa che non comanda alcun effetto.**

```text
Da confermare → colonna nascosta
Confermato    → colonna visibile
Concluso      → colonna nascosta
Annullato     → colonna nascosta
```

⚠️ **La colonna segue il valore del CAMPO, non lo stato salvato**, e discende
dalla stessa proibizione: scegliendo «Da confermare» su un ordine nuovo, lo stato
salvato è ancora Confermato: gate sul salvato, la colonna resterebbe visibile su
un ordine che non impegnerà niente — cioè la checkbox che questo paragrafo vieta.

⚠️ Nascondere **non cancella** `commitsStock` sulle righe: vedi §9.3, che resta
com'è. L'intento di riga sopravvive e torna visibile rimettendo `Confermato`.

## 9.3 Persistenza dell'intento di riga

Nascondere la colonna per stato non deve obbligare a distruggere i dati di riga per motivi puramente visuali.

La macchina quantità deve distinguere:

```text
intento/configurazione della riga
≠ effetto reservation attualmente attivo
```

Quindi il cambio di stato può disattivare/rilasciare l'effetto senza necessariamente cancellare lo snapshot/flag della riga.

Alla riattivazione in `Confermato`, il sistema riconcilia le reservation con lo stato finale delle righe.

## 9.4 Righe non movimentabili

Servizi, righe informative e articoli senza gestione magazzino:

- non producono Impegnata;
- non devono generare reservation fantasma;
- non devono far fallire l'intero ordine per il solo fatto di essere non movimentabili.

---

# 10. Cliente e Location

## 10.1 Gate delle righe

Per operare sulle righe dell'Ordine cliente servono:

- Cliente;
- Location di origine.

Finché uno dei due manca:

- la sezione righe resta non operativa/nascosta secondo il contratto comune;
- l'interfaccia spiega che cosa manca;
- ricerca/scansione non deve creare righe aggirando il gate.

## 10.2 Salvataggio della sola testata

Il documento può essere salvato anche senza righe.

La testata può essere salvata senza trasformare automaticamente una query o una riga vuota in riga documento.

Cliente/Location obbligatori per l'operatività delle righe non significano “nessun salvataggio della testata”.

## 10.3 Location

`locationId = null` significa nessuna Location.

Non esiste fallback nascosto a:

- prima location disponibile;
- location corrente della shell;
- location di default non persistita.

Una Location predefinita può soltanto precompilare il nuovo documento e deve restare modificabile.

## 10.4 Cambio Location

Se un Ordine Confermato cambia Location:

- gli impegni devono passare dalla vecchia alla nuova per differenza;
- nessuna duplicazione;
- nessun momento finale con entrambe le reservation attive;
- tenant e autorizzazioni verificati lato API;
- nessun movimento di Giacenza.

---

# 11. Righe documento

L'Ordine cliente usa il sistema comune delle righe documento.

## 11.1 Riga valida

Una riga vuota o una query di ricerca non è una riga documento.

La persistenza deve distinguere:

- riga esistente;
- riga nuova;
- riga eliminata;
- riga tecnica di ricerca.

## 11.2 Identità stabile

In modifica:

- riga esistente conserva il proprio ID;
- riga nuova riceve un nuovo ID;
- riga eliminata rimuove soltanto il proprio effetto;
- riordino non crea una nuova identità.

## 11.3 Modifiche per differenza

Per un Ordine Confermato:

- quantità 3 → 5: reservation finale 5, non 3 + 5;
- quantità 5 → 2: rilascia 3;
- cambio variante: neutralizza la vecchia reservation e applica la nuova;
- cambio Location: sposta l'effetto;
- `Impegna ON → OFF`: rilascia la reservation;
- `Impegna OFF → ON`: crea/sincronizza reservation;
- eliminazione riga: rilascia l'effetto della sola riga.

## 11.4 Stock insufficiente in modifica

Se l'aumento o il cambio porta Disponibile negativa:

- warning non bloccante;
- il salvataggio resta consentito;
- non ripristinare automaticamente la quantità precedente;
- non disattivare automaticamente l'impegno.

---

# 12. Ricerca prodotto, barcode e creazione articolo

Usare l'infrastruttura comune del progetto.

## 12.1 Ricerca

La ricerca può usare i dati realmente supportati, per esempio:

- codice;
- SKU;
- EAN;
- nome prodotto;
- variante.

La sola query:

- non crea prodotto;
- non crea riga;
- non crea reservation.

## 12.2 Barcode

Il lettore HID desktop resta supportato come input.

La fotocamera mobile viene offerta soltanto secondo la policy comune:

```text
flag ambiente
AND fotocamera presente
AND schermo compatto
```

## 12.3 Creazione rapida

La creazione articolo è esplicita.

Nome minimo; SKU/EAN facoltativi secondo il contratto catalogo.

Nessun SKU/EAN casuale deve essere inventato per rendere valida una riga.

---

# 13. Prezzi, Netto/Ivato, IVA e Listini

## 13.1 Snapshot economico

Prezzo, sconto, IVA e altri valori economici della riga sono snapshot del documento.

Modifiche future ad anagrafica/listino non riscrivono automaticamente l'ordine storico.

Questa regola **non è in conflitto** con il riprezzamento da cambio Listino (§13.3):

- modifica futura dell'anagrafica/listino senza azione sull'Ordine → nessuna riscrittura;
- cambio Listino eseguito esplicitamente dall'operatore dentro l'Ordine → atto volontario che ricalcola e sostituisce i prezzi delle righe presenti.

## 13.2 Netto/Ivato

L'Ordine cliente usa il contratto comune:

- selettore disponibile;
- modalità persistita;
- riapertura coerente;
- nessuna perdita di precisione;
- default aziendale/operatore solo come precompilazione secondo la policy corrente.

## 13.3 Listino

Il Listino è selezionabile in testata.

Decisione definitiva:

> quando l'operatore cambia Listino e sono già presenti righe prodotto, i prezzi delle righe esistenti vengono ricalcolati e sostituiti con i prezzi proposti dal nuovo Listino.

La regola vale per:

- righe future;
- righe già presenti.

Se il prezzo proposto è zero:

- la UI può mostrare prezzo vuoto;
- al salvataggio vuoto = `0,00`.

Non introdurre una seconda matematica economica specifica dell'Ordine cliente.

---

# 14. Salvataggio e uscita

L'Ordine cliente segue il contratto comune Salva/Chiudi.

## 14.1 Primo Salva

Per un documento nuovo:

> “Sei sicuro di voler salvare il documento appena creato?”

Azioni:

- Sì;
- Annulla e ritorna.

## 14.2 Chiudi con modifiche non salvate

> “Sei sicuro di voler uscire senza salvare?”

Azioni:

- Sì;
- Annulla.

## 14.3 Nessun autosalvataggio bloccante

Il sistema non deve:

- salvare silenziosamente il documento per una normale azione di riga;
- ribloccare la sessione senza motivo;
- perdere focus durante l'inserimento per un salvataggio non richiesto.

## 14.4 Idempotenza

Retry, doppio click o risposta persa non devono produrre:

- due ordini;
- due set di reservation;
- doppie righe;
- doppie relazioni.

---

# 15. Eliminazione dell'Ordine

La specifica precedente non normava l'eliminazione oltre a dire che lo stato non deve governarla.

## 15.1 Stato tecnico misurato

Nel servizio corrente, il percorso di eliminazione non usa `documentId` / `fulfilledAt` come protezione sufficiente del collegamento. È quindi possibile che un Ordine già agganciato a un documento successivo venga eliminato, lasciando una relazione/storia incoerente o non più consultabile correttamente.

Questo comportamento è **NON CONFORME come integrità documentale**, ma la policy funzionale definitiva deve essere coerente con il contratto comune `12`.

## 15.2 Regola minima inderogabile

Qualunque sia la policy finale:

- eliminare un Ordine non deve lasciare collegamenti orfani;
- non deve cancellare o riscrivere in silenzio documenti di destinazione già salvati;
- non deve perdere la tracciabilità di un documento successivo già emesso;
- se l'Ordine possiede reservation attive e l'eliminazione è ammessa, tali reservation devono essere rilasciate nella stessa operazione transazionale;
- l'eliminazione non crea movimenti fisici;
- tenant e permessi devono essere verificati lato API.

## 15.3 Decisione di prodotto da confermare prima dell'implementazione

**Raccomandazione:** un Ordine manuale con almeno un collegamento documentale definitivo non è eliminabile direttamente. L'operatore deve prima usare l'eventuale procedura di scollegamento/riapertura prevista dal contratto comune `12`; la relazione storica non va distrutta implicitamente dal comando Elimina.

Un Ordine senza collegamenti definitivi può invece essere eliminato secondo le normali autorizzazioni, con rilascio atomico delle reservation attive.

Questa raccomandazione deve essere approvata dall'owner prima di diventare norma definitiva.

---

# 16. Routing, Modifica, lock e stato

Lo stato dell'Ordine **non governa**:

- click di riga;
- apertura della Modifica;
- Salva;
- Elimina;
- lock/sblocco;
- permessi.

Regola:

```text
ordine locale MANUAL
→ click riga elenco
→ Modifica
```

Vale anche per:

- Da confermare;
- Confermato;
- Concluso;
- Annullato.

Le limitazioni reali derivano da:

- origine esterna;
- permessi;
- feature gate;
- lock del documento;
- vincoli specifici indipendenti dallo stato.

---

# 17. Ordine manuale vs ordini Shopify/esterni

## 17.1 Ordine manuale

La maschera manuale crea/modifica soltanto ordini di origine `MANUAL`.

## 17.2 Shopify

Gli ordini posseduti da Shopify:

- restano read-only secondo il flusso canale;
- non devono essere trasformati in ordini manuali per riutilizzare la maschera;
- possono usare stati/fulfillment tecnici propri del canale;
- possono mantenere `partially_fulfilled` se necessario al dominio Shopify.

La rimozione del workflow manuale `Parzialmente concluso` **non autorizza** a cancellare enum/campi globali ancora usati da Shopify.

## 17.3 Tenant senza Shopify

Un tenant senza modulo Shopify non vede nell'Ordine cliente:

- campi Shopify;
- filtri Shopify;
- badge;
- banner;
- errori;
- indicatori;
- menu;
- colonne, neppure nel selettore Colonne.

---

# 18. Includi e Genera

L'Ordine cliente aderisce al dominio comune delle relazioni documentali.

Questa specifica stabilisce solo le regole locali dell'Ordine.

La matrice completa vive in:

> `12-specifica-collegamenti-documentali.md`

## 18.1 Operazioni distinte

**Includi**

```text
documento destinazione già aperto
→ sceglie una o più sorgenti compatibili
→ porta righe/dati secondo il contratto
```

**Genera**

```text
documento origine aperto
→ sceglie destinazione compatibile
→ apre un nuovo documento precompilato
```

Devono usare una sola infrastruttura comune con policy per coppia.

## 18.2 Eleggibilità dell'Ordine cliente come sorgente

Per l'Ordine manuale:

```text
Da confermare → NO
Confermato    → SÌ, se ammesso dalla coppia
Concluso      → NO
Annullato     → NO
```

La regola deve essere garantita:

- UI;
- API;
- transazione server;
- eventuali route/query-param che bypassano il pannello.

## 18.3 Nessun effetto al solo prefill

Premere `Genera` e aprire il documento successivo:

- non conclude ancora l'ordine;
- non consuma/rilascia reservation;
- non crea movimenti;
- non crea relazione definitiva.

Gli effetti scattano al salvataggio valido del documento di destinazione.

## 18.4 Più sorgenti nel documento destinazione

Il motore comune può supportare N documenti origine → 1 destinazione dove la matrice lo prevede.

Non progettare l'Ordine cliente con un secondo motore locale per questo scopo.

## 18.5 Nessuna evasione parziale

Vedi §2.3 e §7.4.

Un documento conclusivo parziale non apre una seconda evasione.

## 18.6 Modifiche dopo la derivazione

Una volta salvato il documento successivo:

- le sue righe sono proprie del documento destinazione;
- possono essere modificate secondo il dominio della destinazione;
- modificare l'Ordine origine non aggiorna retroattivamente la destinazione.

---

# 19. Pagamenti e altre testate condivise

L'Ordine cliente non crea un proprio dominio Pagamenti.

Deve usare le anagrafiche e i componenti condivisi previsti dal contratto Pagamenti.

Non introdurre localmente:

- seconda tabella Tipi pagamento;
- scadenze autonome non previste;
- movimenti finanziari per il solo salvataggio dell'Ordine;
- Risorse o allocazioni fuori dal dominio comune.

Note, trasporto, indirizzi e altre sezioni della testata usano i contratti comuni e mantengono snapshot modificabili.

---

# 20. Elenco Ordini cliente

L'elenco aderisce alla specifica Elenchi comune.

## 20.1 Stato

Il filtro Stato dell'Ordine cliente deve comprendere, dopo approvazione di questa specifica:

- Da confermare;
- Confermato;
- Concluso;
- Annullato.

La specifica Elenchi precedente che elenca solo tre stati dovrà essere riallineata.

## 20.2 Click di riga

Click → Modifica, indipendentemente dallo stato.

## 20.3 Includibilità

L'elenco normale e il pannello Includi sono due viste diverse.

Il pannello Includi mostra soltanto gli ordini eleggibili secondo §17.2.

---

# 21. Regole SUPERATE da non reintrodurre

Dopo approvazione di questa specifica sono superate, per l'Ordine cliente manuale, le seguenti formulazioni storiche:

1. **“Da confermare non esiste.”**  
   Corrente: esiste e non produce Impegnata.

2. **“Gli stati sono solo Confermato/Concluso/Annullato.”**  
   Corrente: aggiunto `Da confermare`.

3. **“Impegna magazzino non è una spunta di riga.”**  
   Corrente: il contratto corrente usa l'effetto di riga `Impegna magazzino`; la sua attivazione effettiva dipende anche dallo stato.

4. **“Stock insufficiente blocca il nuovo Ordine manuale.”**  
   Corrente: warning non bloccante; Disponibile negativa ammessa.

5. **“Un Ordine senza righe non si salva.”**  
   Corrente: la testata può essere salvata; una riga vuota/query non viene persistita.

6. **“Il cambio Listino propone soltanto il ricalcolo.”**  
   Corrente: il cambio Listino ricalcola e sostituisce i prezzi delle righe esistenti.

7. **“Parzialmente concluso è uno stato del workflow manuale.”**  
   Corrente: non viene gestito.

8. **“Concludi ordine è un motore diverso da Genera.”**  
   Corrente: il comportamento deriva dal contratto comune origine → destinazione; eventuali etichette UI non creano motori paralleli.

9. **“Lo stato decide Modifica/Dettaglio.”**  
   Corrente: lo stato non governa routing/editabilità generica.

---

# 22. FUORI PERIMETRO v1

Non implementare in questa versione:

> **Nota sullo stato `Da confermare`:** non è fuori dal perimetro funzionale v1. È fuori dalla **tranche corrente di sola documentazione/audit** la migration necessaria a renderlo persistibile. La migration sarà un intervento dedicato e autorizzato separatamente dopo l'audit.

- evasione parziale con residui;
- stato Parzialmente concluso;
- più documenti successivi per completare progressivamente lo stesso ordine;
- quantità Consegnata / Da consegnare;
- scheda situazione ordine;
- opzione “Metti Q.tà = 0” per evasione parziale;
- approvvigionamento automatico delle quantità mancanti;
- multi-location per singola riga;
- motore finanziario locale dell'Ordine;
- onboarding/cutover Shopify;
- sincronizzazione manuale bidirezionale dell'Ordine con Shopify;
- nuove formule economico/IVA non ancora approvate;
- duplicazione del motore Includi/Genera dentro il modulo.

---

# 23. Stato tecnico da verificare prima di qualunque implementazione

Questa sezione non è normativa. È una checklist derivata dalle verifiche tecniche recenti e deve essere riverificata da Claude Code sul branch corrente.

## 23.1 Backend reservation

Da verificare:

- il salvataggio `confirmed` sincronizza le reservation;
- gli altri stati passano da release;
- `cancelled` rilascia già gli impegni;
- il rilascio è idempotente;
- il cambio Location è transazionale;
- le reservation sono tenant-scoped.

## 23.2 Frontend colonna Impegna

Da verificare:

- oggi la colonna `Imp.`/`Impegna magazzino` risulta dichiarata senza policy di stato;
- in `Annullato` può restare visibile nonostante le reservation siano state rilasciate;
- non esiste ancora la policy UI per `Da confermare`.

## 23.3 Workflow parziale legacy

Da censire completamente:

- `PartiallyConcluded`;
- `partially_fulfilled` nel manuale;
- dialogo “Ordine non evaso del tutto”;
- comando `forceConclude`;
- endpoint;
- service method;
- guardie;
- test;
- consumer reali.

Rimuovere soltanto il workflow **manuale** se non ha altri consumer.

Non cancellare strutture condivise ancora necessarie a Shopify.

## 23.4 Genera/Concludi

Da verificare:

- il comando attuale apre un documento precompilato;
- nessun documento nasce fino al salvataggio;
- il percorso client-side e quello server-side non devono restare motori paralleli;
- il consumo dell'Impegnata deve essere parte del contratto della coppia, non del nome del pulsante.

## 23.5 Routing

Da verificare, ma non riprogettare se già conforme:

- stato non usato come criterio per aprire Modifica;
- MANUAL editabile;
- Shopify read-only.

---

# 24. Cause radice da dimostrare prima della modifica

Alcune risposte sono già state misurate e non devono essere riscoperte come se fossero ignote:

| Punto                                        | Risposta tecnica già misurata                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| Persistenza stato manuale                    | nessun campo stato autonomo; stato derivato da `cancelledAt` + `fulfilledAt`   |
| Visibilità `Impegna`                         | nessuna policy di stato; colonna attualmente sempre visibile quando dichiarata |
| Consumer `forceConclude` fuori dal manuale   | nessuno rilevato; unico chiamante nel form Ordine cliente manuale              |
| Neutralizzazione reservation al collegamento | tutte le reservation attive vengono consumate nella stessa transazione         |

Claude Code deve **confermare che queste evidenze sono ancora vere sul branch corrente** e completare le domande residue, senza ripartire da ipotesi astratte:

1. Quale enum/campo persiste oggi gli stati manuali?
2. Dove viene mappato il valore di stato fra UI, DTO, Prisma e API?
3. Quale servizio è l'unica autorità sulle reservation dell'Ordine manuale?
4. Il flag `commitsStock`/equivalente è persistito sulla riga o derivato?
5. Chi decide oggi la visibilità della colonna `Impegna magazzino`?
6. Esistono consumer che assumono “tre stati”?
7. Esistono filtri/list export/PDF che non conoscono `Da confermare`?
8. `forceConclude` ha consumer fuori dall'Ordine manuale?
9. `partially_fulfilled` è usato da Shopify o altri canali?
10. Il collegamento conclusivo neutralizza tutte le reservation in un'unica transazione?
11. Esistono percorsi che possono impostare `Concluso` senza relazione valida?
12. Esistono percorsi che includono/generano da `Da confermare` bypassando la UI?
13. In caso di retry del documento destinazione, relazione, movimento e reservation restano idempotenti?
14. Il cambio stato nel form produce effetti prima del Salva?
15. La modifica di un ordine Concluso può ricreare accidentalmente reservation?

Nessuna correzione prima della risposta a queste domande.

---

# 25. Criteri di accettazione — stati e Impegnata

## OC-MAN-001 — Nuovo ordine

Dato un nuovo Ordine manuale:

- stato proposto = Confermato;
- nessun effetto finché non viene salvato;
- nessun movimento fisico.

## OC-MAN-002 — Salvataggio Da confermare

Creare/salvare un Ordine `Da confermare` con righe fisiche.

Atteso:

- ordine persistito;
- righe persistite;
- zero reservation attive dell'ordine;
- Giacenza invariata;
- colonna Impegna nascosta;
- ordine escluso da Includi/Genera come sorgente.

## OC-MAN-003 — Da confermare → Confermato

Atteso al Salva:

- reservation create/sincronizzate solo per righe pertinenti;
- nessun movimento;
- Giacenza invariata;
- Impegnata aggiornata una sola volta;
- colonna Impegna visibile.

## OC-MAN-004 — Confermato → Da confermare

Atteso:

- tutte le reservation attive dell'ordine rilasciate;
- Giacenza invariata;
- Disponibile riallineata;
- colonna Impegna nascosta;
- secondo salvataggio identico non duplica effetti.

## OC-MAN-005 — Confermato → Annullato

Atteso:

- reservation rilasciate;
- nessun movimento fisico;
- colonna Impegna nascosta;
- ordine resta apribile in Modifica;
- non compare fra sorgenti includibili.

## OC-MAN-006 — Annullato → Confermato

Atteso:

- reservation ricreate/sincronizzate;
- nessun movimento;
- warning non bloccante se Disponibile diventa negativa.

## OC-MAN-007 — Stock insufficiente

Giacenza 5, Impegnata 4, nuova reservation 3.

Atteso:

- salvataggio consentito;
- Impegnata 7;
- Disponibile -2;
- warning visibile;
- nessun rollback per sola insufficienza.

## OC-MAN-008 — Impegna OFF

Ordine Confermato, riga fisica `Impegna = OFF`.

Atteso:

- nessuna reservation per quella riga;
- Giacenza invariata.

## OC-MAN-009 — Servizio

Ordine Confermato con riga servizio.

Atteso:

- nessuna reservation;
- nessun movimento;
- salvataggio consentito.

## OC-MAN-010 — Quantità per differenza

Riga Q.tà 3 con reservation 3 → modifica Q.tà 5.

Atteso:

- reservation finale 5;
- non 8;
- retry = sempre 5.

## OC-MAN-011 — Riduzione quantità

5 → 2.

Atteso:

- rilascio 3;
- reservation finale 2.

## OC-MAN-012 — Eliminazione riga

Atteso:

- rilascio della reservation della sola riga;
- altre righe invariate.

## OC-MAN-013 — Cambio variante

Atteso:

- nessuna reservation duplicata;
- vecchia variante neutralizzata;
- nuova variante coerente.

## OC-MAN-014 — Cambio Location

Atteso:

- vecchia reservation neutralizzata;
- nuova reservation nella nuova Location;
- nessun doppio impegno finale;
- Giacenza invariata.

---

# 26. Criteri di accettazione — collegamenti

## OC-MAN-015 — Da confermare non includibile

Tentare via UI e via API/route diretta.

Atteso:

- non compare nel pannello;
- richiesta diretta rifiutata;
- nessun documento creato;
- nessuna reservation modificata.

## OC-MAN-016 — Annullato non includibile

Stesso atteso di OC-MAN-015.

## OC-MAN-017 — Concluso non includibile

Stesso atteso di OC-MAN-015.

## OC-MAN-018 — Genera senza salvare destinazione

Ordine Confermato → Genera documento conclusivo → chiudi destinazione senza salvare.

Atteso:

- ordine ancora Confermato;
- reservation ancora attive;
- nessuna relazione definitiva;
- nessun movimento.

## OC-MAN-019 — Genera e salva destinazione conclusiva

Atteso:

- documento destinazione creato una sola volta;
- relazione persistita;
- eventuale movimento fisico creato dalla destinazione una sola volta;
- reservation dell'ordine neutralizzate;
- ordine Concluso;
- nessun doppio scarico.

## OC-MAN-020 — Destinazione ridotta rispetto all'ordine

Modificare righe/quantità della destinazione prima del Salva.

Atteso:

- warning non bloccante se il sistema rileva copertura inferiore;
- se l'utente annulla, nessun effetto;
- se procede, ordine Concluso;
- nessun `Parzialmente concluso`;
- nessun residuo da evadere;
- nessuna reservation residua attiva.

## OC-MAN-021 — Modifica Ordine Concluso

Dopo collegamento, modificare descrizione/prezzo/quantità dell'Ordine.

Atteso:

- Ordine salvabile secondo le regole ordinarie;
- documento destinazione già emesso invariato;
- nessuna nuova reservation;
- nessun nuovo movimento nella destinazione.

## OC-MAN-022 — Retry collegamento

Ripetere lo stesso intento per timeout/doppio click.

Atteso:

- un documento destinazione;
- una relazione;
- un set di movimenti;
- una neutralizzazione reservation.

---

# 27. Criteri di accettazione — UI e documenti comuni

## OC-MAN-023 — Salvataggio testata senza righe

Atteso:

- documento salvabile;
- nessuna riga tecnica persistita;
- nessuna reservation.

## OC-MAN-024 — Query vuota

Atteso:

- nessuna riga;
- nessun prodotto;
- nessuna reservation.

## OC-MAN-025 — Gate Cliente/Location

Atteso:

- righe non operative finché mancano i campi richiesti;
- messaggio chiaro;
- nessun bypass tramite scanner.

## OC-MAN-026 — Cambio Listino

Con righe già presenti.

Atteso:

- prezzi delle righe esistenti sostituiti con quelli proposti dal nuovo Listino;
- nuove righe usano il nuovo Listino;
- nessun doppio ricalcolo.

## OC-MAN-027 — Netto/Ivato

Salvare, riaprire e cambiare modalità secondo il contratto comune.

Atteso:

- modalità persistita;
- importi coerenti;
- nessuna perdita di precisione.

## OC-MAN-028 — Tenant senza Shopify

Atteso:

- nessun riferimento Shopify in form, lista, filtri, colonne o warning.

## OC-MAN-029 — Routing per stato

Aprire Da confermare / Confermato / Concluso / Annullato dall'elenco.

Atteso:

- tutti i MANUAL aprono Modifica;
- lo stato non cambia il routing.

## OC-MAN-030 — Shopify read-only

Aprire ordine Shopify.

Atteso:

- consultazione read-only del canale;
- nessun accesso alla normale modifica MANUAL.

---

# 28. Test tecnici minimi richiesti

L'implementazione futura deve coprire almeno:

### Frontend

- rendering stato;
- visibilità `Impegna` per Da confermare/Confermato/Annullato;
- badge/list filter con 4 stati;
- dirty state;
- Salva/Chiudi;
- warning stock;
- warning copertura incompleta;
- nessun workflow `Parzialmente concluso`;
- routing manuale vs Shopify.

### API/service

- transizioni;
- reservation sync/release;
- idempotenza;
- tenant;
- Location;
- link conclusivo;
- bypass delle sorgenti non eleggibili;
- nessun Concluso senza relazione valida.

### Database

Verificare dopo ogni scenario pertinente:

- stato ordine;
- righe;
- reservation attive;
- eventi reservation, se previsti;
- relazione documentale;
- movimenti fisici;
- `sourceLineId`/equivalente;
- tenantId/locationId.

### Regressioni

- ordini Shopify;
- fulfillment Shopify;
- annullamento Shopify;
- DDT;
- Fattura accompagnatoria;
- Preventivo → Ordine;
- Ordine fornitore;
- DataTable/list filter Ordini;
- export/stampa che mostrano Stato.

Build verde non sostituisce questi test.

---

# 29. Sequenza di lavoro consigliata

Questa specifica non autorizza una correzione isolata e immediata del modulo se il codice deve poi essere riscritto dall'unificazione trasversale.

Ordine consigliato:

```text
A. approvare questa specifica
B. bonificare/approvare `12-specifica-collegamenti-documentali.md`
C. completare i contratti comuni Elenchi / Includi-Genera
D. audit causa-radice dell'Ordine cliente contro le specifiche approvate
E. decidere la rappresentazione persistente dello stato `Da confermare`
F. autorizzare e applicare la migration dello stato come intervento dedicato
G. implementare le sole divergenze residue sull'infrastruttura comune
H. collaudo completo Ordine cliente una volta sulla struttura definitiva
```

Non creare oggi:

- filtro Stato locale duplicato se il filtro comune è in costruzione;
- motore locale Includi/Genera;
- secondo servizio reservation;
- riga mobile specifica;
- export specifico se deve convergere sul builder comune.

---

# 30. Mandato da dare a Claude Code

## Fase corrente — DOCUMENTAZIONE E AUDIT, NON IMPLEMENTAZIONE

Leggi in quest'ordine:

1. questa specifica;
2. Master corrente VestiFlow;
3. `12-specifica-collegamenti-documentali.md`;
4. specifica comune Elenchi;
5. contratto comune documenti/righe;
6. specifica Listini;
7. specifica Pagamenti/Tesoreria;
8. codice corrente Ordine cliente manuale.

### Obiettivo

Produrre una matrice:

| Regola | Stato                              | Evidenza | File/simbolo | Divergenza | Impatto |
| ------ | ---------------------------------- | -------- | ------------ | ---------- | ------- |
| ...    | CONFORME / NON CONFORME / PARZIALE | ...      | ...          | ...        | ...     |

### Devi verificare espressamente

- 4 stati manuali;
- default Confermato;
- Da confermare senza Impegnata;
- colonna Impegna nascosta in Da confermare e Annullato;
- Confermato con reservation per riga;
- stock insufficiente non bloccante;
- Annullato rilascia;
- stato non governa Modifica/Salva/Elimina/lock;
- Concluso solo da collegamento conclusivo;
- nessun workflow manuale Parzialmente concluso;
- `forceConclude` e consumer;
- `partially_fulfilled` Shopify;
- nessun residuo/evasione parziale v1;
- nessun effetto al solo prefill Genera;
- idempotenza;
- tenant/Location;
- modifiche per differenza;
- salvataggio testata vuota;
- Listino sulle righe esistenti;
- Netto/Ivato;
- Shopify gating.

### Prima di proporre modifiche

Per ogni divergenza:

1. dimostra la causa radice;
2. indica se il difetto è UI, API, DB o più livelli;
3. identifica l'infrastruttura comune esistente;
4. indica il rischio di regressione;
5. proponi test concreti;
6. segnala eventuale decisione ancora mancante.

### Stop obbligatorio

Dopo audit e matrice:

**FERMATI.**

Non modificare codice, schema, migration o documentazione canonica senza nuova autorizzazione.

In particolare, **non introdurre `Da confermare` con una migration in questa tranche**: devi soltanto censire gli impatti e proporre le alternative tecniche, perché la migration verrà autorizzata come intervento separato.

Non eseguire:

- commit;
- push;
- merge;
- deploy;
- pubblicazioni;
- `prisma migrate dev`;
- `db push`;
- modifiche distruttive al database.

---

# 31. Fonti usate per questa candidata

Fonti di progetto consultate:

- Master corrente VestiFlow del 27/08/2026;
- Registro decisioni confermate corrente del 27/08/2026;
- precedente `VestiFlow_Specifica_Funzionale_Ordine_Cliente_Manuale.docx` del 15/07/2026, usata come storico da correggere;
- `12-specifica-collegamenti-documentali.md`, usata come fonte corrente da bonificare;
- specifica Elenchi corrente;
- decisioni più recenti confermate nella conversazione di progetto del 28/08/2026.

Benchmark funzionale fornito dall'owner:

- Danea Easyfatt — stati Ordine;
- inclusione/generazione documenti;
- gestione magazzino;
- evasione ordini.

Il benchmark Danea è usato per comprendere la grammatica funzionale; non viene copiato automaticamente.

---

# 32. Sintesi vincolante

```text
ORDINE CLIENTE MANUALE

STATI
  Da confermare
  Confermato
  Concluso
  Annullato

NESSUN
  Parzialmente concluso
  residuo da evadere
  workflow di evasione parziale

DA CONFERMARE
  no Impegnata
  Impegna nascosto
  non includibile

CONFERMATO
  Impegna visibile
  reservation secondo le righe
  includibile
  stock insufficiente = warning, non blocco

ANNULLATO
  release reservation
  Impegna nascosto
  non includibile
  Giacenza invariata

CONCLUSO
  automatico da collegamento conclusivo salvato
  non manuale come normale scelta
  non includibile
  nessuna reservation residua attiva
  ordine ancora modificabile
  modifiche successive non riscrivono la destinazione

STATO
  non governa routing
  non governa Modifica/Salva/Elimina/lock

MAGAZZINO
  Giacenza invariata dall'Ordine
  Impegnata = reservation attive
  Disponibile = Giacenza - Impegnata
  valori negativi ammessi

INCLUDI/GENERA
  motore comune
  effetti per coppia
  nessun effetto al prefill
  nessun motore locale

IMPLEMENTAZIONE
  prima audit causa-radice
  poi infrastrutture comuni
  poi Ordine cliente
  un solo collaudo finale sulla struttura definitiva
```
