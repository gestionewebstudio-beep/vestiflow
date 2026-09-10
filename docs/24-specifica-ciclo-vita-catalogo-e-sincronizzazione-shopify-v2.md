# VestiFlow — Ciclo di vita del catalogo e sincronizzazione Shopify V2

**Data:** 2 settembre 2026  
**Stato:** **Bozza in revisione funzionale.** Contiene decisioni confermate, questioni aperte e proposte tecniche non ancora autorizzate.  
**Ambito:** prodotti, varianti, storia documentale e inventariale, pubblicazione Shopify, prima sincronizzazione e sincronizzazione continuativa  
**Owner funzionale:** Luigi  
**Vincolo di esecuzione:** nessuna tranche successiva può aggirare i criteri di uscita della tranche precedente

## Come si legge questo documento

⛔ **Non tutte le sezioni hanno lo stesso peso, e prima di questa revisione lo sembravano.** Il documento nasceva marcato «decisione funzionale approvata» e apriva con un capitolo intitolato «Decisioni non negoziabili»: chi lo leggeva non poteva distinguere ciò che il proprietario aveva deciso da ciò che era stato _proposto_ costruendo. È lo stesso difetto che questo progetto combatte nel codice — un'affermazione che sembra autorevole e non lo è.

Ogni sezione porta quindi una marca:

| Marca                                    | Che cosa significa                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| ✅ **Decisione confermata**              | il proprietario l'ha decisa esplicitamente. Si esegue                                                   |
| ❓ **Decisione da prendere**             | serve una scelta, e non è stata fatta. **Non si implementa**                                            |
| 🔧 **Proposta tecnica da verificare**    | una forma tecnica ipotizzata da chi scrive. Non è una decisione dell'utente, e va confermata o scartata |
| 👁 **Comportamento osservato nel codice** | una misura di com'è oggi. Non prova che sia giusto                                                      |

⚠️ **Una proposta tecnica non diventa una decisione perché è scritta qui.** Dove la marca manca, la sezione è da riclassificare prima di eseguirla.

---

## 0. Autorità del documento

⛔ **Questo documento è una BOZZA, e non sostituisce ancora nulla.** Apriva dichiarandosi «la specifica operativa di riferimento» che «sostituisce» quattro fonti: non può esserlo mentre è in revisione, e non poteva esserlo nemmeno prima — un documento che contiene domande aperte non può prevalere su regole approvate.

### Che cosa vale, oggi

|                                                     |                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ✅ le singole **decisioni marcate come confermate** | **prevalgono da subito**, ciascuna per sé                                                    |
| ❓ domande aperte e 🔧 proposte tecniche            | **non sostituiscono nessuna regola precedente** e **non autorizzano alcuna implementazione** |
| il documento **nel suo insieme**                    | diventerà specifica operativa **solo dopo approvazione funzionale**                          |
| i **gate** delle tranche                            | non possono considerare approvato ciò che è ancora aperto                                    |

⭐ **Il criterio è la marca, non il documento.** Una sezione confermata vale anche se sta in una bozza; una proposta non vale nemmeno se sta in una specifica approvata.

### Quando sarà approvato, sostituirà — nelle parti incompatibili:

- `02-specifica-sincronizzazione-shopify.md` per il push catalogo, il modello degli stati, la prima sincronizzazione e il regime continuativo;
- la specifica esterna `08-specifica-prima-sincronizzazione-shopify.md`, le cui decisioni ancora valide sono incorporate qui;
- ogni comportamento attuale che deduca la cancellazione di una variante dalla sua assenza nel payload di aggiornamento del prodotto;
- ogni regola che blocchi la cancellazione anagrafica a causa della presenza di documenti, movimenti, giacenze, impegni, lotti o matricole.

Restano documenti distinti:

- `01-registro-difetti-shopify.md`: descrive evidenze e difetti del sistema attuale;
- `03*`: governa il contratto comune delle righe documento;
- `09-specifica-movimenti-per-riga.md`: governa la produzione e la riconciliazione dei movimenti;
- `10-specifica-registro-corrispettivi.md`: governa il Registro Corrispettivi e i suoi valori economici;
- `00-DECISIONI.md`: deve ricevere solo un riepilogo delle decisioni definitive e un collegamento a questa specifica;
- `DA-FARE.md`: deve ricevere tranche, stato ed esito, non duplicare questa specifica.

In caso di conflitto prevalgono, nell'ordine:

1. le decisioni più recenti confermate dal proprietario;
2. le sezioni di **questa bozza marcate ✅ confermate**;
3. le specifiche verticali sopra indicate;
4. il comportamento del codice esistente.

⛔ Le sezioni ❓ **aperte** e 🔧 **proposte** di questa bozza **non entrano in questa scala**: non prevalgono su niente, nemmeno sul punto 4. Il documento diceva «questa specifica» al secondo posto senza distinguere, e così una proposta tecnica batteva una specifica verticale approvata.

Il codice esistente è un dato da censire, non una prova della regola corretta.

---

## 0-bis. Ciò che NON è deciso — riaperto il 02/09/2026

⛔ **Questi punti erano scritti come requisiti approvati e non lo sono.** Finché non vengono decisi, restano proposte o domande: **non si implementano**, e nessuna tranche può passarci sopra dichiarandoli acquisiti.

| Punto                                                                                | Dove       | Perché è aperto                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **esatto contratto degli snapshot** e necessità delle **chiavi storiche** aggiuntive | §5.2, §5.3 | quali colonne servano davvero, e se le chiavi storiche siano necessarie, non è stabilito                                                                        |
| **contenuto tecnico del preflight**                                                  | §14.1      | i quattro requisiti funzionali sono decisi; hash, token, scadenze e idempotenza no                                                                              |
| struttura dell'**outbox**, lock e worker                                             | §8.4       | forma tecnica ipotizzata                                                                                                                                        |
| **wizard di prima sincronizzazione**                                                 | §12        | i nove passi restano una proposta, non un flusso approvato. ⚠️ Per gli **articoli** vale ora §12.0: due direzioni iniziali approvate, dettagli operativi aperti |
| **politica delle publication per canale**                                            | §10.1      | quali canali, con quale regola                                                                                                                                  |

⭐ **Un punto aperto non diventa chiuso perché una tranche lo attraversa.** Se un lavoro incontra una di queste voci, si ferma e la si decide.

### ✅ Voci CHIUSE il 03/09/2026

Tolte dalla tabella perché **decise**, non perché attraversate. Restano elencate qui: chi le cercava deve trovare dove sono finite, non il silenzio.

| Voce che era aperta                                           | Dove è decisa ora | Che cosa dice                                                                                       |
| ------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| proprietà di **nome, descrizione, brand e prezzo Shopify**    | **§9.2**          | la matrice non è più «iniziale»: è la matrice **canonica**, e vale per ogni campo                   |
| conseguenza remota dell'eliminazione dell'**ultima variante** | §11.1, §11.3      | la domanda si **dissolve**: VestiFlow non cancella su Shopify, quindi non si arriva a zero varianti |
| errore durante il **ritiro remoto**                           | §11.5             | l'eliminazione locale non si completa, l'elemento resta nel cestino, l'operatore è avvisato         |
| **etichetta dello stato variante**                            | §3.3, §3.7        | «Attiva / Non attiva» in locale, «Pubblicata / Non pubblicata» su Shopify; «Fuori uso» scartata     |
| prodotto con **tutte le varianti non attive**                 | §3.4              | resta locale e sincronizzato; Shopify passa in bozza, senza ripubblicazione automatica              |
| identificativi di un elemento **senza storia**                | §4.3, §7.4        | restano riservati nel cestino e si liberano solo con l'eliminazione definitiva                      |
| conversione **semplice ⇄ varianti**                           | §8.6.2, §8.6.3    | nessuna fusione: l'operatore sceglie la variante che conserva identità, giacenza e mapping          |
| politica di vendita oltre disponibilità                       | §10.4             | dato Shopify bidirezionale, indipendente da stato, pubblicazione e quantità                         |

---

### ✅ Voci CHIUSE il 07/09/2026 — sedi, clienti, ordini, acquisizione

| Voce                                                          | Dove è decisa  | Che cosa dice                                                                                                                      |
| ------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **identità di sede e location**                               | §1.13          | due entità autonome; senza collegamento esplicito non si sincronizza niente, in nessuna direzione                                  |
| **come nasce un collegamento di sede**                        | §1.13.1, §12.4 | mai automatico; tre scelte per riga; nome e indirizzo non sono prove d'identità; uno-a-uno nello stesso negozio                    |
| **anagrafiche delle sedi**                                    | §1.13.2        | non si sincronizzano, nemmeno quando la creazione parte da una delle due piattaforme                                               |
| **location scomparsa da Shopify**                             | §1.13.3        | la sede resta con tutti i suoi dati; il collegamento si chiude conservando la storia; nessun riaggancio per nome                   |
| **quando una sede si può eliminare**                          | §1.13.4        | solo se non collegata e libera secondo tutte e 21 le relazioni; altrimenti si rende non operativa                                  |
| **chi può disattivare una sede**                              | §1.13.4        | l'operatore; **mai** una sincronizzazione di canale                                                                                |
| **eliminazione di clienti e ordini da funzioni Shopify**      | §1.14          | non avviene: si chiude o sospende il collegamento. `purgeOrders` è un **difetto da correggere**                                    |
| **rilascio degli impegni alla disconnessione**                | §1.14.3        | non avviene: gli impegni seguono il ciclo di annullamento dell'ordine                                                              |
| **ordini acquisiti alla prima connessione**                   | §1.15.1        | si registra l'istante e si parte da lì; nessuna importazione storica, nemmeno proposta                                             |
| **recupero del periodo non sincronizzato alla riconnessione** | §1.15.2        | proposto, dall'ultimo checkpoint riuscito alla riconnessione, idempotente, solo per lo stesso `shop_gid`                           |
| **che cosa sopravvive alla disconnessione**                   | §1.15.3        | identità del negozio, prima connessione, disconnessione, ultimo checkpoint, intervallo, riconnessione                              |
| **fonte autorevole delle quantità dopo un recupero**          | §1.15.5        | VestiFlow; una modifica manuale su Shopify è un disallineamento da mostrare, non una sovrascrittura                                |
| **da dove parte il primo allineamento degli ARTICOLI**        | §12.0          | **due direzioni approvate**: si importa da Shopify, o si crea da VestiFlow. L'identita' non si deduce mai da nome, SKU o barcode   |
| **completezza del primo allineamento**                        | §8.9.1         | nessuna priorità fra campi: un articolo parziale **non** è completato. Interruzioni e ripetizioni senza perdite né duplicazioni    |
| **margine di sincronizzazione**                               | §8.9.2         | si **misura**, con attenzione ai picchi e agli aggiornamenti massivi: la media giornaliera non basta                               |
| **priorità sotto carico**                                     | §8.9.3         | disponibilità e prezzi prima delle descrizioni, quando serve; le meno urgenti si conservano e si completano                        |
| **nessuna perdita silenziosa**                                | §8.9.4         | tre stati soli — confermata, da eseguire, fallita con motivo e recupero. Anche le modifiche arrivate durante il primo allineamento |

---

### ⏸ Voci APERTE dopo il consolidamento del 07/09/2026

⛔ **Dopo questo consolidamento restano aperte soltanto queste sei**, più quelle
già elencate sopra. Un punto che non compare in nessuna delle due liste è
**deciso**: si applica la sezione che lo argomenta.

| #   | Punto aperto                                                                     | Dove                     | Perché non si può dedurre                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **termine definitivo** per una sede non eliminabile                              | §1.13.4                  | la proposta corrente è «Disattiva», non «Sospendi». La regola funzionale è decisa e non dipende dal nome                                                                                                                                                                                                                             |
| 2   | **comportamento della sede collegata quando viene disattivata localmente**       | §1.13.5                  | il comportamento proposto è registrato per non perderlo, non perché sia acquisito                                                                                                                                                                                                                                                    |
| 3   | **conseguenza del rifiuto** di recuperare gli ordini mancanti alla riconnessione | §1.15.4                  | avviso permanente, o blocco del riallineamento delle quantità: due strade difendibili                                                                                                                                                                                                                                                |
| 4   | **dettagli operativi** del primo allineamento degli articoli                     | §12.0, §12.6             | le due direzioni sono approvate; la procedura dell'operatore, gli schermi e il trattamento dei cataloghi gia' popolati non lo sono                                                                                                                                                                                                   |
| 5   | ✅ **giacenze iniziali per sede** — CHIUSA il 10/09/2026                         | `docs/DA-FARE.md` §31.-1 | il piano di funzionamento la scioglie: la base **non si calcola e non si deduce**, si crea con una **partenza controllata a fasi** (ordini acquisiti prima, quantita' allineate dopo). E' una **procedura, non un obbligo** verificato dal prodotto. ⏸ Resta aperta solo la quantita' di partenza di un articolo creato in VestiFlow |
| 6   | **audit persistente e backup pre-operazione**                                    | `docs/DA-FARE.md`        | progettazione e implementazione: di una cancellazione oggi resta una riga di log sul container, che il riavvio perde                                                                                                                                                                                                                 |

### ⏸ Voci APERTE dal 06/09/2026 — ciclo di vita e stato Shopify

Emerse consolidando §1.11 e §1.12. ⛔ **Non sono state decise, e non vanno dedotte dal
comportamento attuale del codice**: nessuna tranche può darle per acquisite.

| #     | Punto aperto                                                                                           | Dove         | Perché non si può dedurre                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **rappresentazione tecnica di una singola variante ritirata ma conservata**                            | §10.1, §11.2 | `publishableUnpublish` sulla variante è una via, non l'unica: vanno pesate contro la reversibilità e contro ciò che il cliente vede                                                                         |
| 2     | **si può eliminare definitivamente un articolo VestiFlow già salvato?**                                | §4.2, §7.1   | il cestino e l'eliminazione definitiva sono descritti, ma **se** un articolo salvato debba poter sparire del tutto è una scelta di prodotto                                                                 |
| ~~3~~ | ~~che cosa si ripristina alla riattivazione~~ — **RISOLTO il 06/09/2026**                              | §10.3        | «Riattiva» agisce solo sul locale; «Rimetti in vendita» usa le pubblicazioni conservate se l'entità è Collegata, «Pubblica nuovamente» se è Eliminata su Shopify                                            |
| 4     | **comportamento atomico quando il ritiro Shopify fallisce SUL COMANDO «Sincronizza con Shopify»**      | §1.10, §11.5 | risolto per «Disattiva» (§1.11: non annulla, stato «Ritiro Shopify non riuscito», retry auto+manuale) — **resta aperto per il comando esistente**, che oggi annulla lo spegnimento                          |
| 5     | **operazioni massive molto numerose: sincrone o processo tracciato?**                                  | §1.12        | cambia l'API, la resa a schermo e il significato di «riprova i falliti». Non si sceglie implementando                                                                                                       |
| 6     | **come scollegare l'archiviazione remota dallo spegnimento della sincronizzazione**                    | §1.11        | oggi le due cose sono UN'operazione sola (`archiveOnSyncDisabled`); il modello a cinque assi le vuole indipendenti, ma la forma della separazione — che cosa protegge lo stock nel frattempo — non è scelta |
| 7     | **quali segnali contano come «possibile corrispondenza manuale»** per «Pubblica nuovamente su Shopify» | §11.9        | stesso SKU? stesso titolo? stesso handle? la regola dice che la conferma serve, non su cosa si basa                                                                                                         |

⚠️ **Non è un punto aperto, è un prerequisito di collaudo**: cinque webhook su otto (ordini,
resi, clienti) non sono registrabili sullo shop di sviluppo per mancata approvazione Shopify
«Protected customer data» — misurato il 06/09/2026, dettaglio in §8.5.6. Nessuna correzione di
codice lo risolve, e **non ferma lo sviluppo del ciclo di vita del catalogo**: va chiuso prima
del collaudo completo e della futura entrata in esercizio.

⚠️ **E una decisione tecnica che NON va consolidata adesso**: `DRAFT` più
`publishableUnpublish` su tutti i canali sembra la forma ovvia del ritiro, ma Shopify dichiara
che `DRAFT` è **già** indisponibile ai clienti — le due azioni insieme potrebbero essere
ridondanti, e la seconda ha un costo di reversibilità (per ripubblicare bisogna sapere **dove**
era pubblicato prima). ⚠️ **`DRAFT` è uno stato di `ProductStatus`: la VARIANTE non ne ha uno
proprio.** Per il prodotto la domanda è «`DRAFT`, `publishableUnpublish`, o entrambi»; per la
variante — che non può andare in bozza — la domanda è solo l'effetto di `publishableUnpublish`
sul suo GID, sulla sua visibilità per canale e sulla ripubblicazione. Sono **due verifiche
distinte**, non una sola declinata su due entità. Nessuna delle due si fa leggendo la
documentazione Shopify: è un **collaudo mutativo** su un'entità di prova, con fotografia dello
stato prima, una variazione alla volta, verifica dal punto di vista del cliente e ripristino —
mai eseguito finora. Va fatto prima di scrivere la forma qui come requisito.

## 1. Fondamenti — decisioni confermate e proposte

⛔ Il capitolo si intitolava **«Decisioni non negoziabili»**, e non tutte lo erano: due delle sette sottosezioni sono proposte tecniche di chi ha scritto il documento. Il titolo dava a tutte lo stesso peso.

### 1.1 Cestino ed eliminazione definitiva sono due operazioni diverse

> ✅ **Decisione confermata**

> **Spostare nel cestino** è reversibile e conserva tutto. **Eliminare definitivamente** è
> irreversibile e rimuove l'anagrafica e le sue dipendenze operative, dopo un doppio avviso.

Nel **cestino**:

- prodotto o variante spariscono dall'anagrafica ordinaria e dalle nuove selezioni;
- documenti, movimenti, giacenze, impegni, lotti, matricole e collegamenti restano invariati;
- non viene creato alcun movimento automatico;
- il record può essere ripristinato.

Con **Elimina definitivamente**:

- vengono rimossi il record anagrafico e le dipendenze operative collegate: livelli di
  inventario, movimenti, impegni, lotti, matricole, collegamenti fornitore e dati di canale;
- eliminando un prodotto vengono eliminate definitivamente anche le sue varianti;
- le righe dei documenti restano presenti e leggibili attraverso i propri snapshot, ma non
  conservano un collegamento vivo all'anagrafica eliminata;
- i documenti non vengono riscritti e i loro importi non vengono ricalcolati;
- analisi o ricostruzioni fondate sui movimenti eliminati possono cambiare o non essere più
  disponibili: il secondo avviso deve dichiararlo esplicitamente;
- l'operazione non genera rettifiche, scarichi o altri movimenti automatici.

### 1.2 Le dipendenze avvisano, non bloccano

> ✅ **Decisione confermata**

Documenti, movimenti, giacenze, impegni, lotti, matricole e collegamenti a canali producono
avvisi, non divieti. Nel cestino vengono conservati; nell'eliminazione definitiva vengono
eliminati secondo §1.1, salvo le righe documento che restano come fotografie autonome.

L'operatore autorizzato può confermare l'eliminazione anche con:

- giacenza positiva o negativa;
- impegni aperti;
- lotti o matricole ancora presenti;
- documenti in corso o storici;
- movimenti storici;
- pubblicazioni attive su Shopify;
- errori di sincronizzazione già presenti.

Il sistema deve mostrare quantità e conseguenze reali prima della conferma. Un messaggio
generico come «ci sono dipendenze» non è sufficiente. La presenza di conseguenze attiva il
doppio avviso, ma non disabilita il comando amministrativo.

### 1.3 Nessun effetto inventariale nascosto

> ✅ **Decisione confermata**

Lo stato Non attivo e lo spostamento nel cestino non possono:

- azzerare una `InventoryLevel`;
- cancellare una `InventoryLevel` tramite `CASCADE`;
- annullare un impegno;
- cambiare lo stato di un lotto o di una matricola;
- creare una rettifica, uno scarico, un trasferimento o uno storno;
- riscrivere un movimento esistente.

L'eliminazione definitiva può cancellare i dati inventariali elencati nel preflight, ma non
deve fingere che sia avvenuto un evento fisico: non crea movimenti compensativi e non rettifica
le quantità prima di rimuoverle. Ogni variazione fisica ordinaria continua a richiedere
un'azione inventariale esplicita che produca il proprio movimento.

### 1.4 Stato locale non attivo ed eliminato sono diversi

> ✅ **Decisione confermata**

- **Lo stato locale Non attivo** è reversibile e mantiene l'anagrafica completa.
- **Nel cestino** è reversibile, sparisce dall'uso ordinario e conserva anagrafica e dipendenze.
- **Eliminato definitivamente** non è ripristinabile: elimina anagrafica e dipendenze
  operative; restano soltanto le fotografie già persistite nelle righe documento e il minimo
  registro tecnico necessario a impedire una reimportazione Shopify involontaria.

### 1.5 Shopify non definisce il significato dello stato locale

> ✅ **Decisione confermata**

Stato locale, pubblicazione per canale, inventario e stato tecnico di sincronizzazione sono assi separati. Nessun singolo booleano può rappresentarli tutti.

### 1.6 Il push Shopify migra da REST a GraphQL

> ✅ **Decisione confermata**
>
> **Il push Shopify di catalogo, varianti e inventario viene migrato dal percorso REST deprecato alle API GraphQL prima di costruire la prima sincronizzazione e il regime continuativo. Dopo il cutover nessuna scrittura di catalogo, varianti o inventario deve utilizzare il vecchio percorso REST.**

⛔ **Non è rimandabile, e non è una proposta.** In una revisione precedente questa sezione era stata declassata a «proposta tecnica da verificare»: era un errore di chi correggeva, non una scelta del proprietario. La migrazione è decisa, e va eseguita adesso.

⭐ **E non è ammesso aggiungere nuove funzioni al percorso REST**: ogni funzione nuova su un percorso che si sta dismettendo è lavoro che andrà rifatto, e allontana il cutover invece di avvicinarlo.

#### 🔧 Quello che resta da verificare

La decisione riguarda il **fatto** della migrazione, non la sua forma. Restano proposte tecniche:

- la **versione API esatta** da fissare — `2026-07` è indicata perché introduce la pubblicazione indipendente delle varianti, ma va confermata sullo shop di sviluppo. ⚠️ Fermo resta che non si usa `latest`, `unstable` o una versione implicita in produzione: quella è una regola, non una versione;
- la **struttura del client**;
- **outbox, lock e worker**;
- l'**idempotency key** e la sua forma;
- **feature flag** e modalità di cutover;
- le **mutation esatte** per ciascuna operazione, da provare sullo shop di sviluppo prima di scriverle qui.

### 1.7 La prima sincronizzazione precede il regime continuativo

> 🔧 **Proposta tecnica da verificare**

La sincronizzazione automatica bidirezionale non si abilita finché non sono stati completati:

- collegamento e verifica permessi;
- mappatura sedi/location;
- riconciliazione prodotti e varianti;
- definizione del trattamento di prezzi e IVA;
- acquisizione della baseline inventariale;
- riconciliazione delle pubblicazioni;
- anteprima e conferma del cutover.

La qualità imperfetta dei dati produce avvisi. Il passaggio attraverso la procedura è invece obbligatorio, perché stabilisce la baseline e il confine temporale.

---

### 1.8 Interruttore, cestino, ripristino e azioni massive

> ✅ **Decisione confermata** (03/09/2026)

**«Sincronizza con Shopify»** è l'unico interruttore Shopify del prodotto, ed è un controllo di
VestiFlow. Spento: il prodotto Shopify va in `ARCHIVED`, la singola variante viene rimossa dalle
publication, nessuna quantità fittizia a zero; **si fermano tutti i flussi, inventario compreso**.
Riacceso: riallineamento completo. Mapping e ID Shopify restano sempre conservati.

✅ Lo spegnimento viene atteso: se Shopify non conferma l'archiviazione, il flag torna acceso,
l'inventario continua a sincronizzarsi e l'operatore riceve immediatamente lo stato effettivo.

**Cestino**: separato da `ProductStatus` — `archived` resta «non attivo», non «eliminato».
Ripristinabile. Spostare nel cestino toglie dalla vendita Shopify ma non cancella;
`shopifySyncEnabled` resta invariato: è il cestino a sospendere il canale, senza un campo nuovo
che ricordi la checkbox.

**Varianti**: anche la singola variante può essere Non attiva, nel cestino, eliminata
definitivamente. Un prodotto nel cestino nasconde le varianti senza riscriverne lo stato; al
ripristino le varianti conservano lo stato precedente.

**Ripristino dal cestino**: il prodotto torna **Non attivo** in VestiFlow e su Shopify resta
offline in **Bozza**; la variante torna Non attiva e Non pubblicata; mapping e ID conservati;
**nessun elemento torna automaticamente in vendita**.

**Elimina definitivamente**: doppio avviso. ⛔ Qui c'era «cancella anche su Shopify se esiste
il collegamento», ed è **superato da §11.1**: su Shopify il prodotto viene **archiviato**, non
cancellato, e l'eliminazione locale si completa solo dopo la conferma che non sia più
acquistabile (§11.5). In locale vengono poi eliminate anagrafica e dipendenze operative come
stabilito in §1.1 e §4.2.

**Tenant senza Shopify**: checkbox, banner e blocchi del canale sono assenti.

**Azioni massive** nella pagina Prodotti: selezione multipla e menu «Azioni» estensibile, che
distingue stato VestiFlow (Attiva / Non attiva), sincronizzazione (Abilita / Disabilita),
stato Shopify (Bozza / Attivo / Archiviato), varianti Shopify (Pubblica / Non pubblicare).
Solo azioni decise: nessun «altro».

**Prodotti importati da Shopify** (decisione dell'08/08 riconfermata): sono modificabili —
l'origine è provenienza, non sola lettura. Il salvataggio avvia subito la sincronizzazione; un
errore Shopify non annulla il salvataggio locale ma lascia uno stato visibile. Il push passa
da GraphQL (§1.6), non dal REST.

⛔ **Qui c'era la direzione dei campi** — «anagrafica, immagini, SKU e barcode sono
bidirezionali e vince l'ultima modifica; le quantità sono solo VestiFlow → Shopify». Era una
seconda scrittura della stessa regola, e **divergeva**: la descrizione è solo VestiFlow →
Shopify, di immagini se ne sincronizza **una sola**, e §1.9 ha dovuto correggere il nome per
conto proprio. ⭐ **La direzione di ogni campo sta in §9.2, e in nessun altro posto.**

### 1.9 Il nome interno e il «Nome Shopify» sono DUE campi — deciso il 03/09/2026

> **`Product.name` è il nome con cui si lavora; `shopifyTitle` è il titolo con cui il
> prodotto si vende. Dopo l'inizializzazione, vivono indipendenti.**

_Il proprietario: «si potrebbe riempire con la prima anagrafica di VestiFlow in automatico,
poi l'operatore può cambiarla online senza farla cambiare sul gestionale, che spesso si
preferisce avere nomi brevi»._

⛔ **Erano lo stesso campo, e il pull lo riscriveva a OGNI giro.** Chi accorciava il nome
per il magazzino se lo vedeva tornare lungo al primo webhook; e chi lo accorciava apposta
lo rimandava su Shopify, accorciando anche la vetrina. Un campo solo non poteva servire due
mestieri opposti: uno si cerca digitando poche lettere, l'altro si legge in una pagina
prodotto.

#### Il contratto

- **`Product.name` / «Nome prodotto» è esclusivamente interno** — magazzino, ricerche,
  documenti, stampe, snapshot di riga: Shopify non lo sovrascrive mai, in nessun percorso;
- **`shopifyTitle` / «Nome Shopify» è il `title` su Shopify, e basta**, sincronizzato in
  ENTRAMBE le direzioni: una modifica su Shopify lo aggiorna, una modifica in VestiFlow
  aggiorna il titolo Shopify;
- **prevale l'ultima modifica valida**, e non si formano circuiti: il push manda ciò che ha
  in `shopifyTitle`, il pull scrive ciò che trova — valori uguali, nessun effetto; valori
  diversi, vince chi ha scritto per ultimo;
- **duplicando un prodotto**, `shopifyTitle` NON viene copiato e resta vuoto: il duplicato lo
  inizializza dal proprio nome alla sua prima sincronizzazione. Due prodotti con lo stesso
  titolo sulla vetrina sono indistinguibili per chi compra;
- spegnere la sincronizzazione o usare il cestino **non** cancella `shopifyTitle`.

#### L'inizializzazione avviene UNA volta, e il lato da cui si legge non è indifferente

| Prodotto                        | Valore iniziale del «Nome Shopify»                      |
| ------------------------------- | ------------------------------------------------------- |
| **creato in VestiFlow**         | il nome interno, alla **prima sincronizzazione**        |
| **importato da Shopify**        | il titolo ricevuto — e i due nomi nascono uguali        |
| **già collegato** (177 sul dev) | ⛔ si **LEGGE da Shopify**, mai dedotto dal nome locale |

Salvo che l'operatore l'abbia già compilato: in quel caso vale il suo.

⛔ **Dedurlo dal nome interno su un prodotto già collegato è il danno che questa decisione
esiste per evitare**: rimanderebbe su Shopify il nome di magazzino, sovrascrivendo il titolo
con cui il prodotto si vende. Il push lo procura con una lettura (`getProductTitle`) prima
di comporre l'aggiornamento, e lo salva con un filtro `shopifyTitle: null` — quindi una
volta sola, anche a push ripetuti.

⚠️ **L'etichetta nel gestionale è «Nome Shopify»**, non «Nome online»: il campo riguarda solo
quel canale, e un nome generico prometterebbe una sincronizzazione che non esiste altrove.

⚠️ **La migration si chiama ancora `prodotto_nome_online`**, e il suo commento pure: era il
nome del primo giro, e un file di migration **già applicato non si tocca** — Prisma ne
confronta il checksum e `migrate deploy` fallirebbe. La colonna è `shopify_title`, che è ciò
che conta.

⚠️ **Svuotare il campo non è un errore**: significa «torna a decidertelo da solo», e al push
successivo si re-inizializza. Per questo non ha `required`.

#### Nella scheda prodotto

Etichetta **«Nome Shopify»**, sotto il nome prodotto, **solo con Shopify attivo** — senza il
canale sarebbe un campo senza destinazione. Segnaposto «Come il nome prodotto», e un comando
**«Copia nome VestiFlow»** che riallinea i due su richiesta.

⛔ **Il riallineamento è un COMANDO, non un automatismo**: farlo scattare a ogni modifica del
nome interno rimetterebbe il nome di magazzino sulla vetrina, cioè il difetto da cui nascono
due campi invece di uno.

⏸ **Come azione massiva** («Copia nome VestiFlow» su una selezione) è **registrata, non
implementata**: entra col menu delle azioni massive di §1.8.

⭐ **La direzione di ogni altro campo sta nella matrice canonica di §9.2**, che ha assorbito
anche la riga di §1.8 da cui questa decisione doveva difendersi. ⛔ Qui c'era «corregge la
bidirezionalità di §1.8 SOLO per il nome: descrizione, immagini, SKU, barcode e prezzi restano
come sono» — una frase che rimandava a una regola nel frattempo rivista, e che avrebbe
continuato a dire il contrario di §9.2.

#### ⛔ Finché il ramo non è in produzione, l'eco riscrive il nome interno

I webhook Shopify sono registrati verso **Railway**, che gira `main` e scrive sullo **stesso
database**. Misurato il 03/09/2026 sullo shop di sviluppo: dopo un push, il nome interno torna
al titolo remoto **0,7 secondi dopo la fine dell'operazione** — non è il ramo, è la produzione
che elabora il webhook col codice precedente, quello che scriveva il titolo in `Product.name`.

⚠️ **Non è un difetto da correggere qui, ed è la ragione per cui una prova reale può fallire
mentre la prova unitaria è verde**: chi verifica a mano deve saperlo, o cercherà a lungo un
difetto che nel ramo non c'è. Sparisce da sé quando il ramo va in produzione. ⭐ L'eco è
**intermittente**: in una prova successiva non è arrivata entro 20 secondi.

### 1.10 Spegnere la sincronizzazione è un'operazione SOLA — deciso il 03/09/2026

> **Il flag locale spento e il prodotto archiviato su Shopify sono due metà della stessa
> azione. Se la seconda non riesce, la prima si annulla.**

⛔ **Trattare l'archiviazione fallita come un push fallito qualunque lascia il prodotto IN
VENDITA con le giacenze ferme**: il flag spento blocca anche il push inventario, quindi si
continua a vendere online una quantità che non si aggiorna più. È il danno peggiore dei due,
e non lo dichiarava niente.

| Esito                        | Conseguenza                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| **archiviazione confermata** | flag spento, ogni push fermo — compreso l'inventario                     |
| **archiviazione fallita**    | la disattivazione **si annulla**: flag di nuovo acceso, giacenze in moto |

Il messaggio dice la **conseguenza**, non la causa: **«Il prodotto potrebbe essere ancora in
vendita su Shopify»**, con il motivo tecnico in coda. ⚠️ Vive in `shopify-user-error.util`, e
la traduzione dei messaggi lo lascia passare intatto — senza quel ramo, un timeout lo
sostituirebbe con «ha impiegato troppo tempo», che è vero e non dice niente.

⭐ `out_of_sync` resta come **stato tecnico** (il prodotto va davvero riallineato), ma da solo
nasconderebbe la conseguenza: quella sta nel messaggio, che è ciò che l'operatore legge.

⭐ **Ripetere non duplica effetti**: l'annullamento filtra su `shopifySyncEnabled: false`, quindi
chi ha già il flag acceso non viene toccato e una decisione più recente non viene sovrascritta.

#### ⭐ E l'esito si ATTENDE: la risposta al salvataggio dice cosa è successo — 03/09/2026

> **Il salvataggio di un prodotto già collegato non risponde finché Shopify non ha confermato
> l'archiviazione. La risposta porta il prodotto nello stato EFFETTIVO.**

⛔ **Qui l'archiviazione partiva accodata** — `enqueueProductSyncDisabled`, un `void` con
`catch` — e la regola qui sopra restava vera **solo dal lato del database**: il flag si
riaccendeva davvero, ma la risposta era già partita dicendo «spenta». L'operatore chiudeva la
scheda convinto di aver tolto il prodotto dalla vendita, e l'unico posto dove la verità
compariva era una riga minuta nel Dettaglio, che non aveva motivo di aprire.

⚠️ **Non era un difetto della reversibilità: era un difetto di CHI LO VIENE A SAPERE.** È la
stessa forma del guasto muto che questo progetto combatte ovunque — niente fallisce, e nessuno
lo scopre.

| Esito                        | La risposta contiene                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| **archiviazione confermata** | flag **spento**, catalogo e inventario fermi                              |
| **archiviazione fallita**    | flag **acceso**, `out_of_sync`, e il messaggio in `shopifyLastError`      |
| **prodotto mai collegato**   | flag **spento** senza aver chiamato Shopify: non c'è niente da archiviare |

⛔ **E non solleva.** Le altre modifiche della scheda — nome, prezzi, listini — sono già in
database: un errore HTTP direbbe «salvataggio fallito» di un salvataggio riuscito, e manderebbe
a rifare un lavoro che c'è. L'esito viaggia **dentro il prodotto restituito**, non nel codice
di stato.

⭐ **La maschera lo riconosce da un confronto, non da una stringa**: ha chiesto `false` e si è
vista tornare `true`. Allora **non naviga** — qualunque destinazione butterebbe l'avviso — mostra
il banner e **ricarica**, così l'interruttore torna su ACCESO, che è lo stato vero. Riprovare
diventa una scelta esplicita, non un secondo tentativo alla cieca.

⚠️ **La lettura del prodotto sta DENTRO il `try`** di `archiveOnSyncDisabled`: se fallisce lei,
il flag è già spento e l'archiviazione non è mai partita — cioè la metà pericolosa. L'unica
uscita che **non** annulla è il prodotto mai collegato, dove non c'è niente da annullare.

⭐ **Il messaggio dice prima cosa NON è successo**: «La sincronizzazione non è stata disattivata.
Il prodotto potrebbe essere ancora in vendita su Shopify», e il motivo tecnico in coda. La prima
frase è stata aggiunta lo stesso giorno: senza, l'avviso descriveva un rischio senza dire che
il comando appena dato non aveva avuto effetto.

#### ⛔ E lo spegnimento deve restare REVERSIBILE — misurato il 03/09/2026

> **A sincronizzazione spenta il prodotto si IGNORA INTEGRALMENTE**: un webhook o un pull non
> ne cambiano nome, descrizione, brand, categoria, stato, opzioni, varianti o immagini.

L'archiviazione su Shopify la facciamo noi, spegnendo l'interruttore. Shopify manda allora un
`products/update` con `status: archived`, e importarlo significa **credere a un'eco della
propria voce**: il prodotto locale diventava `archived`, e da lì `executePushWork` si rifiutava
di lavorarci (`reason: 'archived'`). Misurato sullo shop di sviluppo: riaccendere la
sincronizzazione **non riallineava più niente**, e il prodotto restava archiviato sulla vetrina.

⛔ **Qui c'era «il pull non importa lo stato remoto — il resto continua ad arrivare»**, che era
la prima correzione, del mattino. Non bastava: reggeva solo per lo stato, mentre nome,
descrizione, opzioni, varianti e immagini passavano lo stesso. Spegnere l'interruttore significa
«questo prodotto non si tocca da Shopify», e **una guardia che ne lascia passare metà è peggio
di nessuna**, perché fa credere che il prodotto sia protetto.

⚠️ **La guardia è la PRIMA cosa che succede**, prima ancora di leggere il titolo dal payload:
`normalizeWebhookProduct` non lo valida, e un titolo assente farebbe lanciare la lettura →
il catch scriverebbe `shopifySyncStatus: error` sul prodotto che la guardia doveva proteggere.

### 1.11 Disattivare, riattivare, ritirare: tre assi che non si confondono — deciso il 06/09/2026

> ✅ **Decisione confermata dal proprietario.**

#### Le parole, e sono queste

| Comando                                                   | Che cosa fa                                | Asse (§3.1)          |
| --------------------------------------------------------- | ------------------------------------------ | -------------------- |
| **Disattiva** / **Riattiva**                              | l'entità è usabile o no **nel gestionale** | ciclo di vita locale |
| **Ritira da Shopify** / **Rimetti in vendita su Shopify** | l'entità è acquistabile o no **online**    | pubblicazione        |
| **Attiva / Disattiva sincronizzazione**                   | i dati viaggiano o no fra i due sistemi    | sincronizzazione     |

⭐ **«Disattiva» significa REVERSIBILE, e la parola va presa alla lettera**: l'entità resta nel
database con la propria storia, i propri identificativi Shopify e i propri collegamenti. Non è
il cestino (§1.1) e non è l'eliminazione definitiva (§4.2).

⚠️ **Sono tre interruttori diversi, non tre nomi dello stesso interruttore.** La
sincronizzazione governa lo **scambio dei dati**; il ritiro governa la **vendita online**; la
disattivazione governa l'**utilizzabilità in VestiFlow**. Chi ne usa uno per ottenere l'effetto
di un altro costruisce un'interfaccia che mente senza sbagliare un dato — è §3.7, applicata ai
comandi invece che agli stati.

#### ⛔ Oggi «Sincronizza con Shopify» ne governa DUE, ed è una divergenza misurata

Verificato nel codice il 06/09/2026, non dedotto:

```text
shopifySyncEnabled = false   ferma il push prodotto      shopify-product-push.service.ts:176
                             ferma il push giacenze      shopify-inventory-push.service.ts:83
                             ferma pull e webhook        shopify-product-pull.service.ts:462
                             E ARCHIVIA su Shopify       products.service.ts:929
                                                         → archiveOnSyncDisabled → ARCHIVED
```

L'ultima riga è l'asse **vendita**, non l'asse **sincronizzazione**: spegnere lo scambio dati
oggi toglie anche il prodotto dalla vendita. ⛔ **È un accoppiamento fra due assi che questa
stessa sezione dichiara indipendenti, e va registrato come DEBITO — non come comportamento da
conservare.** §1.10 lo aveva introdotto deliberatamente, per impedire che un prodotto restasse
in vendita con lo stock congelato: era una risposta ragionevole finché il modello non
distingueva i tre assi. Il modello ora li distingue, e questa sezione **non presume** che
l'archiviazione remota debba restare legata allo spegnimento della sincronizzazione — è
l'opposto di ciò che §3.1 e la matrice qui sotto chiedono.

⏸ **La FORMA della separazione NON è decisa** (§0-bis, voce 6): se spegnere la sincronizzazione
debba lasciare il prodotto esattamente dov'era, o debba comunque proteggere lo stock con un
meccanismo diverso dall'archiviazione automatica. È un punto aperto, non una proposta implicita
di questo paragrafo. **Il codice non si tocca finché la forma non è decisa**: qui si registra il
debito, non si autorizza un intervento.

#### La matrice di validità

| Stato VestiFlow | Vendita Shopify | Validità                                       |
| --------------- | --------------- | ---------------------------------------------- |
| **Attivo**      | In vendita      | ✅ valida                                      |
| **Attivo**      | Ritirato        | ✅ valida — vendibile internamente, non online |
| **Disattivato** | Ritirato        | ✅ valida                                      |
| **Disattivato** | In vendita      | ⛔ **non valida, e va impedita**               |

Ne discendono, come conseguenze della matrice e non come regole nuove:

- **disattivare in VestiFlow comporta necessariamente il ritiro da Shopify**: è l'unico modo di
  non finire nella quarta riga;
- ⭐ **l'interfaccia INFORMA della conseguenza, non la CHIEDE.** «Verrà ritirato anche dalla
  vendita online» è un avviso; «Vuoi ritirarlo anche da Shopify?» è una domanda che offre uno
  stato vietato come se fosse una scelta;
- **ritirare solo da Shopify lascia l'entità attiva in VestiFlow** — è la seconda riga, uno
  stato legittimo che si raggiunge di proposito;
- ⛔ **la riattivazione in VestiFlow non rimette in vendita da sola**: la matrice ammette
  «Attivo + Ritirato», quindi tornare attivi non implica tornare in vetrina. Serve una regola
  esplicita, e non c'è ancora (§0-bis);
- **ritirando l'ultima variante vendibile, il prodotto Shopify passa in Bozza** e non viene
  cancellato (§11.3);
- **una riattivazione futura deve restare possibile**: collegamenti e informazioni necessarie si
  conservano, sempre.

#### Una variante si elimina solo finché non è mai stata salvata — e non si disattiva da sola

> **Prima del primo salvataggio una riga si toglie dal form: non è mai esistita, e togliendola
> non si crea alcun record. Dopo il primo salvataggio, l'ASSENZA dal payload non produce alcun
> effetto sullo stato della variante — né cancellazione, né disattivazione implicita.**

È §7.1 detta dalla parte della variante, ed è la stessa distinzione: togliere una riga dal form
non è un'eliminazione anagrafica.

⛔ **Assente dal payload non è un comando.** Un payload che non menziona una variante può
significare «questa riga è stata tolta dal form», ma anche un invio parziale, una pagina che non
ha caricato tutte le varianti, un client con un difetto. Dedurre uno stato da questo silenzio —
cancellata, o anche solo disattivata — lascia che un'assenza involontaria produca un effetto
voluto. **Lo stato di una variante salvata cambia SOLO tramite un comando esplicito e
verificabile**: «Disattiva» su quella variante precisa, mai come effetto collaterale del
salvataggio del prodotto.

⛔ **Il codice oggi fa il peggio dei due errori**, misurato il 06/09/2026:
`products.service.ts:1176-1179` **cancella dal database** ogni variante che non compare nel
payload, con le sue giacenze, purché non abbia movimenti. È già vietato da §14.3 —
«`UpdateProductDto.variants` aggiorna o crea ciò che contiene, non elimina ciò che manca» —
quindi non è una decisione nuova: è **debito tecnico da chiudere**, registrato in `DA-FARE.md`.
⚠️ **E la correzione non è «disattivarla invece di cancellarla»**: sarebbe lo stesso errore
spostato di un gradino — un'omissione dal payload continuerebbe a decidere lo stato della
variante, solo con un esito meno distruttivo.

#### Due cose che non si fanno, e non sono opinioni

⛔ **VestiFlow non cancella prodotti o varianti da Shopify. Mai, e nemmeno come evoluzione
futura.** La cancellazione GraphQL non va descritta come possibile: §11.1 lo dice già, e questa
sezione lo ribadisce perché il percorso REST che la esegue **esiste ancora** (`DA-FARE.md`).

⛔ **Nessun «Nome online» generico.** `Product.name` è il nome interno VestiFlow; `shopifyTitle`
è il dato **specifico di Shopify** (§1.9, §9.3). Una piattaforma futura porterà i **propri** dati
di canale, non riuserà questo campo: è l'isolamento che rende possibile una sincronizzazione
bidirezionale indipendente fra piattaforme diverse. Fondere i due campi in un nome generico
sembra una semplificazione e chiude quella strada.

⛔ **Per questa fase, nessun comando di cancellazione remota**: non solo VestiFlow non cancella
mai da sé, ma non offre nemmeno all'operatore un comando che lo chieda. La pulizia definitiva
di un'entità su Shopify è un'azione che si fa **nel pannello Shopify**, dall'utente.

#### La disattivazione, passo per passo — deciso il 06/09/2026

Quando l'utente disattiva un articolo o una variante **vendibile su Shopify**:

1. la disattivazione locale **ha effetto immediato**: non aspetta l'esito remoto;
2. viene **richiesto il ritiro remoto** (§10.2, §11.2) come conseguenza — non come domanda:
   l'interfaccia informa che l'entità verrà ritirata anche dalla vendita online, non chiede se
   farlo (matrice di validità qui sopra);
3. il collegamento Shopify **si conserva** in ogni caso;
4. **se il ritiro fallisce, la disattivazione locale NON si annulla e non si elimina nulla**:
   l'operatore ha comunque ottenuto l'effetto locale che ha chiesto;
5. lo stato diventa **«Ritiro Shopify non riuscito»** — un valore tecnico dell'asse
   Sincronizzazione (§3.1), non una bugia sullo stato di Vendita: l'entità resta quello che
   era su Shopify finché il ritiro non riesce davvero;
6. esistono **retry automatico e retry manuale** su quello stato;
7. **eventuali ordini Shopify ricevuti nel frattempo continuano a essere acquisiti e
   collegati** (§13.1): un ritiro pendente non è un motivo per smettere di registrare la
   realtà commerciale.

⚠️ **Punto 4 e 5 chiudono, per QUESTO comando, parte della voce aperta di §0-bis** («comportamento
atomico quando il ritiro Shopify fallisce»): «Disattiva» non annulla mai. ⛔ **Non si estende da
sé al comando esistente «Sincronizza con Shopify»**, il cui fallimento oggi annulla lo
spegnimento (§1.10) — sono due comandi diversi, e solo il primo ha qui una risposta.

### 1.12 La gestione massiva vive nel registro Prodotti — deciso il 06/09/2026

> ✅ **Decisione confermata dal proprietario.**

⛔ **Non si costruisce una pagina parallela nelle impostazioni Shopify.** Le operazioni di stato
su molti articoli sono lavoro di catalogo, e il posto del catalogo è il **registro Prodotti**.
Una seconda schermata che elenca gli stessi prodotti con altri filtri è un secondo elenco da
tenere allineato al primo.

⭐ **Riusa il sistema condiviso, non lo riscrive**: ricerca, filtri, ordinamento, selezione,
configurazione delle colonne, virtualizzazione e azioni massive sono già del motore comune.

**Due granularità nello stesso registro**, non due pagine: vista **Articoli** e vista
**Varianti**. La seconda serve perché ritiro e disattivazione sono per variante (§11.2), e da un
elenco di articoli quelle operazioni non si esprimono.

⛔ **Nessun editor a foglio elettronico** in stile Shopify per queste operazioni di stato.

**Le colonne di stato sono TRE**, separate, per i tenant con Shopify attivo:

```text
Stato VestiFlow      attivo / disattivato
Vendita Shopify      in vendita / ritirato / bozza
Sincronizzazione     attiva / spenta / in attesa / errore / allineata
```

⛔ **Per un tenant senza il modulo Shopify non compare NULLA di Shopify**: né colonne, né filtri,
né azioni, né messaggi, né indicatori. È la regola già in vigore nel resto dell'applicazione
(`showShopifyIntegration`), e qui vale per intero.

**Azioni massive previste:** Disattiva / Riattiva in VestiFlow · Ritira / Rimetti in vendita su
Shopify · Attiva / Disattiva sincronizzazione · Sincronizza adesso · Riprova gli errori.

**La selezione distingue tre cose**, e la distinzione non è cosmetica:

|                                   |                                                                          |
| --------------------------------- | ------------------------------------------------------------------------ |
| righe **selezionate manualmente** | quelle che l'operatore ha spuntato                                       |
| **tutte le righe visibili**       | quelle a schermo adesso                                                  |
| **tutti i risultati dei filtri**  | anche quelli non caricati — è selezione per QUERY, non per insieme di id |

⚠️ **La terza non esiste oggi**: `createListSelection` tiene un insieme di id e `isAllSelected`
guarda le righe visibili. Senza impaginazione la differenza fra la seconda e la terza si
assottiglia ma non sparisce — con la virtualizzazione «visibile» non significa «caricato». Va
progettata, non dedotta.

**Prima di eseguire, un riepilogo dell'impatto**: la **quantità corrispondente ai filtri**
attivi, elementi che cambiano, elementi **già conformi** allo stato richiesto, elementi **non
collegati** a Shopify, prodotti che passerebbero in **Bozza**, e gli eventuali **blocchi**. È
lo stesso principio del preflight di eliminazione (§7.2): si conferma su ciò che accadrà, non
su ciò che si spera.

**Durante l'esecuzione, un avanzamento**: un'operazione massiva Shopify è tracciata, non è un
comando che parte e risponde solo alla fine — su una selezione ampia l'operatore deve poter
vedere che sta procedendo, non solo che è partita.

**Dopo l'esecuzione, un risultato**: riusciti, ignorati, falliti — e la possibilità di
**riprovare solo i falliti**. ⚠️ Oggi nessun elenco lo fa: l'eliminazione multipla dei prodotti
dice «N prodotti non sono stati eliminati» e non offre nessun modo di ritentare quelli.

### 1.13 Sede VestiFlow e location Shopify sono DUE entità autonome — deciso il 07/09/2026

> **Una sede VestiFlow e una location Shopify sono identità indipendenti. La
> sincronizzazione avviene soltanto dove esiste un collegamento esplicito, e
> quel collegamento lo dichiara una persona.**

⛔ **Senza collegamento non succede NIENTE**, e va preso alla lettera:

- nessuna quantità viene sincronizzata;
- nessuna anagrafica viene sincronizzata;
- nessuna entità viene creata, modificata, disattivata o eliminata sull'altra piattaforma;
- ciascuna sede si gestisce con le funzioni della propria piattaforma.

⭐ **Non è una limitazione: è ciò che rende prevedibile il resto.** Una sede che
non è collegata non ha un corrispondente, quindi nessuna regola di
sincronizzazione può nominarla — e nessun automatismo può decidere per lei.

#### 1.13.1 Prima configurazione — l'utente sceglie, riga per riga

Per ogni **sede VestiFlow** non collegata, tre possibilità:

- collegarla a una location Shopify esistente;
- creare una nuova location Shopify;
- mantenerla soltanto in VestiFlow.

Per ogni **location Shopify** non collegata, le tre simmetriche:

- collegarla a una sede VestiFlow esistente;
- creare una nuova sede VestiFlow;
- mantenerla soltanto in Shopify.

⛔ **Il collegamento non è mai automatico. Nome e indirizzo NON sono prove
d'identità.** Due negozi possono chiamarsi «Magazzino» in due città diverse, e
lo stesso indirizzo può ospitare due punti vendita distinti. Una proposta basata
sul nome può comparire come **aiuto alla lettura**, mai come collegamento
applicato.

⭐ **All'interno dello stesso negozio Shopify il collegamento è uno-a-uno.** Le
configurazioni molti-a-uno o uno-a-molti richiederebbero una regola di
ripartizione delle quantità che non esiste e non è stata chiesta.

#### 1.13.2 Le anagrafiche NON si sincronizzano

Nome, indirizzo e ogni altro dato anagrafico delle sedi **non** si
sincronizzano. Si modificano separatamente sulle due piattaforme.

⚠️ **Vale anche quando la creazione parte da una delle due.** Se si crea una
location Shopify a partire da una sede VestiFlow — o viceversa — i dati
dell'altra piattaforma vanno **controllati e confermati a mano**: la creazione
propone, non replica.

⭐ **Il collegamento serve a instradare i flussi previsti, non a rendere
identiche le due anagrafiche.** È la stessa distinzione già fatta per il nome
del prodotto (§1.9): due campi possono descrivere la stessa cosa e servire due
mestieri diversi.

#### 1.13.3 Location scomparsa da Shopify

Se una location collegata non esiste più su Shopify:

- **la sede VestiFlow resta**;
- giacenze, movimenti, documenti e riferimenti restano **invariati**;
- il collegamento **si chiude conservandone la storia**;
- la sincronizzazione per quella sede **si ferma**;
- VestiFlow **mostra** che la location non è più disponibile su Shopify;
- la sede **non viene ricreata** automaticamente su Shopify;
- una nuova location con **lo stesso nome non viene riagganciata** automaticamente;
- l'utente può collegare esplicitamente la sede a un'altra location, o crearne una nuova.

⛔ **«Chiudere conservando la storia» richiede uno storico dei collegamenti delle
location**, equivalente a `shopify_product_links` e `shopify_variant_links`
(§8.5): senza, «il collegamento è chiuso» e «il collegamento non è mai esistito»
sono indistinguibili.

⚠️ **Ma quella distinzione non AUTORIZZA nulla, e la frase qui sopra finiva con «ed è
esattamente la differenza che impedisce il riaggancio automatico»** — letta di corsa
suggerisce che, avuto lo storico, agganciare per nome una sede **mai collegata** torni
lecito. ⛔ **Non lo è, in nessuno dei due casi**: il collegamento lo dichiara una persona,
e lo storico serve a dire **quale dei due casi è**, non a permettere il primo.

⚠️ **Ed è un errore già commesso**, l'08/09/2026, proprio partendo da questa riga: una
proposta di tranche prescriveva di «condizionare il riaggancio per nome all'assenza di un
periodo chiuso» — che avrebbe lasciato l'aggancio automatico su ogni sede mai collegata.
Correzione e censimento in `docs/DA-FARE.md` §12.

⭐ **Una proposta per nome resta ammessa come AIUTO alla lettura**, mai applicata da sola:
è la stessa forma già scritta per gli articoli, «proposta per nome/opzioni, mai automatica».

#### 1.13.6 La coppia è STABILE: niente riassegnazioni — deciso il 07/09/2026

> **Una sede VestiFlow e una location Shopify già collegate e utilizzate non
> possono essere riassegnate ad altre controparti.**

| Cosa                                                                         | Si può?                                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **interrompere e ripristinare la stessa coppia**                             | ✅ conservando la storia, e recuperando gli eventi mancanti prima del riallineamento |
| **correggere un abbinamento iniziale errato**                                | ✅ soltanto se non ha ancora prodotto effetti, **verificandolo**                     |
| riassegnare la sede a un'altra location                                      | ⛔                                                                                   |
| riassegnare la location a un'altra sede                                      | ⛔                                                                                   |
| creare una sede nuova e collegarla a una location già appartenuta a un'altra | ⛔ è il modo per aggirare il divieto, ed è vietato per nome                          |

**Se la location Shopify viene eliminata e ricreata, o il nuovo negozio ne
richiede una diversa, si usa una NUOVA SEDE VestiFlow e si forma una nuova
coppia.** ⛔ Non esistono procedure di sostituzione o migrazione dei
collegamenti, e non si realizzano ora.

⭐ **Cambiare soltanto nome o indirizzo non cambia l'identità della coppia.** È
la stessa ragione per cui il modello non contiene né l'uno né l'altro.

##### ⚠️ La conseguenza da rendere chiara: la nuova sede NON eredita le giacenze

La vecchia sede **conserva documenti, movimenti e giacenze**. Nessuna
disattivazione, nessuna cancellazione, nessuna movimentazione automatica.

⛔ **La merce non passa da sola alla sede nuova.** Se deve passare, lo fa
l'operatore con la **normale funzione di trasferimento di magazzino** — quella
che esiste già, con il suo movimento tracciabile. Documenti e movimenti
precedenti restano dove sono stati registrati, sulla vecchia sede: è la stessa
disciplina della fotografia documentale (`regole-gestionale`).

##### ⛔ Perché le tabelle sono DUE

**Un indice unico sui soli collegamenti attivi non basta**, e questa è la
ragione tecnica della forma:

```text
UNIQUE (location_id) WHERE status = 'active'
  → appena il collegamento è chiuso, la sede torna libera
  → la riassegnazione passa, ed è ciò che la decisione esclude
```

Servono quindi **due cose distinte**, e il modello le tiene distinte:

|                                          |                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **`shopify_location_pairs`** — la coppia | stabile. Porta i due `UNIQUE` **totali**: una sede una sola coppia, una location una sola coppia |
| **`shopify_location_links`** — i periodi | molti nel tempo. Un solo periodo `active` per coppia; la storia è il loro elenco                 |

⛔ **I periodi NON sono il checkpoint, e non lo sostituiscono.** Il recupero
degli ordini riparte dall'**ultimo checkpoint riuscito** (§1.15.2-3), che dice
fin dove si è letto con successo — non quando il collegamento era acceso. Un
ordine può essere arrivato a collegamento vivo e non essere stato acquisito:
prenderli come equivalenti farebbe saltare proprio quelli.

⭐ Ciò che i periodi danno è il **contesto**: quando il collegamento si è
interrotto e perché. Serve a spiegare all'operatore che cosa è successo e a
delimitare la finestra da ispezionare, non a decidere da dove ripartire.

⭐ **Il trigger di immutabilità è la terza gamba**, e serviva: i due `UNIQUE`
impediscono di _inserire_ una seconda coppia, non di _modificare_ quella
esistente. Misurato il 07/09/2026 — un `UPDATE` del GID e uno della sede sono
passati entrambi, sulla stessa riga, senza che nessun vincolo se ne accorgesse.
Le colonne identitarie sono ora immutabili, e `updated_at` resta libera.

⚠️ **È il primo trigger di questo database**: le regole di questo tipo vivevano
in guardie statiche sul codice (`check:cassa-append-only`), che però proteggono
la superficie esposta, non il dato. Qui la decisione è «la coppia non si
riassegna mai», e una regola che vale sempre va dove non si può aggirare.

⛔ **`superseded_by_link_id` è stato tolto.** Era stato deciso lo stesso giorno
per la «sostituzione esplicita»: senza procedure di sostituzione non esiste un
successore da indicare, e i periodi di una coppia si susseguono nel tempo.

#### ✅ Le tabelle sono scritte — 07/09/2026

La tabella è nella migration `20260907000000_shopify_link_history`, insieme alle
due sorelle. ⚠️ Qui c'era «il requisito è registrato e la migration **non è
scritta**»: non vale più.

**Quattro decisioni sono state prese dal proprietario prima di scriverla**,
perché il modello non era interamente derivabile e dedurle sarebbe stato
inventarle:

| Decisione                                | Scelta                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| **cardinalità**                          | **coppia stabile**: `UNIQUE (location_id)` e `UNIQUE (shop_id, gid)`, TOTALI |
| **cambio negozio**                       | chiude **anche** i collegamenti di sede, con causale `shop_change`           |
| **`superseded_by_link_id`**              | ⛔ **ritirato** da §1.13.6: senza sostituzione non c'e' un successore        |
| **unicità sull'inventory item** (§8.5.2) | si delibera come **quinta** garanzia                                         |

⚠️ **Le prime due voci sono state superate poche ore dopo, dallo stesso
proprietario** (§1.13.6): «una sede, un solo collegamento vivo» era un indice
PARZIALE, e un indice parziale lascia la sede libera appena il collegamento è
chiuso — cioè consente proprio le riassegnazioni che la decisione esclude.
Restano scritte perché il passaggio spieghi la forma attuale.

⛔ **La cardinalità era ambigua fra due testi entrambi scritti**: questa sezione
diceva «uno-a-uno all'interno dello stesso negozio», le garanzie 3-4 di §8.5.2
sono per entità locale a prescindere dal negozio. **Vince la più stretta**, col
metodo di §8.5.1: il vincolo si rilassa solo dopo aver dichiarato per iscritto
il caso commerciale che lo giustifica. Una sede non può quindi essere collegata
a due negozi insieme — sincronizzare quantità verso due negozi richiederebbe una
regola di ripartizione che non esiste e non è stata chiesta.

⛔ **Qui c'era la descrizione di `superseded_by_link_id` come colonna esistente** —
«per una sede è la sostituzione esplicita decisa dall'operatore», con la sua FK. È
testo morto: la colonna è stata **ritirata lo stesso giorno**, due paragrafi più
sopra e nella tabella delle quattro decisioni, e non è mai entrata nella migration.
Restava a contraddire il proprio ritiro nella stessa sezione.

⚠️ **Nessuna colonna di nome o indirizzo**, ed è la parte che tiene in piedi il
divieto di riaggancio: un nome in quella tabella sarebbe l'appiglio per il
riaggancio automatico che la tabella esiste per impedire. E **nessun**
`last_event_at` / `last_event_triggered_at`, al contrario delle sorelle: quelle
colonne ordinano eventi webhook, e per le location **non esiste alcun topic
registrato** (`shopify-webhook-topics.ts`).

⚠️ **La tabella nasce vuota**, come le due sorelle: nessun backfill in questa
fase (§8.5.8).

#### 1.13.4 Eliminare una sede VestiFlow

Una sede si elimina **fisicamente** soltanto quando è tutte queste cose insieme:

- **non collegata** a Shopify;
- **realmente vuota**;
- priva di giacenze, movimenti, documenti, conteggi, ordini, dispositivi,
  assegnazioni e qualsiasi altro riferimento;
- **libera secondo tutte e ventidue le relazioni censite** verso `Location`.

Se esiste anche un solo riferimento, la sede **non si elimina**. Deve poter
essere resa **non operativa** conservando storia e dati.

⛔ **Una sincronizzazione Shopify non può eseguire automaticamente questa
disattivazione.** È un'azione dell'operatore, non un effetto collaterale di un
sync di canale.

⏸ **Il termine dell'azione è l'ultimo dettaglio da confermare.** La proposta
corrente è **«Disattiva»**, non «Sospendi». La regola funzionale qui sopra è
decisa e non dipende dal nome che le si darà.

#### 1.13.5 Sede disattivata mentre è collegata — 🔧 DA CONFERMARE

> 🔧 **Comportamento proposto, non ancora deciso.** Registrato perché non vada
> perso, non perché sia acquisito: nessuna tranche può implementarlo.

- la sede Shopify **non viene modificata**;
- la sincronizzazione della sede **si ferma**;
- il collegamento **storico resta**;
- alla riattivazione viene mostrato il **confronto delle quantità**;
- nessuna quantità viene sovrascritta automaticamente prima della riconciliazione.

---

### 1.14 Una funzione Shopify non ELIMINA clienti e ordini VestiFlow — deciso il 07/09/2026

> **Nessuna operazione del canale Shopify cancella fisicamente un cliente o un
> ordine VestiFlow. Può chiudere o sospendere il collegamento; l'eliminazione
> locale è una funzione VestiFlow separata e controllata.**

⭐ **È la stessa regola già valida per il catalogo (§1.8, §11), estesa alle due
entità che ne erano rimaste fuori.** Il criterio non cambia: scollegare un
canale è un'operazione di canale, e non può decidere della vita del dato locale.

#### 1.14.1 Clienti

Una funzione Shopify **non elimina** il cliente VestiFlow. Può chiudere o
sospendere il collegamento Shopify.

L'eventuale eliminazione locale del cliente è una funzione VestiFlow separata,
con i suoi permessi e le sue conferme.

#### 1.14.2 Ordini

Una funzione Shopify **non elimina** un ordine VestiFlow.

⚠️ **La regola vale anche quando l'ordine non ha ancora generato un documento.**
È il caso che sembra innocuo — «non è ancora diventato niente» — ed è quello in
cui la cancellazione sembra più giustificabile.

Devono essere conservati i collegamenti a **vendite, documenti, pagamenti, resi,
movimenti e impegni**.

⛔ **`purgeOrders` oggi contiene una cancellazione fisica: è un difetto da
correggere, non un punto da decidere.** La decisione è presa; l'implementazione
va allineata. Registrato in `docs/DA-FARE.md`.

#### 1.14.3 Gli impegni non si rilasciano per disconnessione

Gli impegni di magazzino **non** vengono rilasciati implicitamente dalla
disconnessione Shopify: seguono il ciclo di **annullamento dell'ordine**.

⚠️ **Non è una precisazione teorica.** `stock_reservations.sales_order_id` è
`ON DELETE CASCADE` — misurato il 07/09/2026 — quindi cancellare un ordine
porta via i suoi impegni e lascia `inventory_levels.committed` gonfio di impegni
che non esistono più. È la ragione tecnica per cui §1.14.2 non ammette
eccezioni.

---

### 1.15 Acquisizione degli ordini: prima connessione e riconnessione — deciso il 07/09/2026

#### 1.15.1 Prima connessione — si parte da adesso

Alla **prima** connessione:

- viene registrato **l'istante della connessione**;
- vengono acquisiti gli ordini creati **da quel momento in avanti**;
- gli ordini precedenti **non** vengono importati;
- **non** viene proposta un'importazione storica automatica.

⭐ **Il confine è un fatto registrato, non una preferenza.** Senza un istante
salvato, «da quando acquisiamo» diventa una domanda a cui si risponde
diversamente ogni volta che qualcuno la fa.

#### 1.15.2 Riconnessione allo STESSO negozio — si propone il recupero

Alla riconnessione VestiFlow **propone** di recuperare il periodo non
sincronizzato.

L'intervallo parte **dall'ultimo checkpoint di sincronizzazione ordini
completato con successo** — normalmente vicino alla disconnessione — e termina
alla riconnessione.

⚠️ **Non parte dalla data di disconnessione**, e la differenza conta: fra
l'ultimo checkpoint riuscito e la disconnessione può esserci una finestra in cui
la sincronizzazione era già ferma o in errore. Prendere la disconnessione come
inizio salterebbe proprio gli ordini di quella finestra.

Se l'utente accetta:

1. vengono acquisiti gli ordini mancanti;
2. vengono riconciliati anche gli **aggiornamenti** avvenuti nel periodo su
   ordini già noti;
3. l'acquisizione è **idempotente** tramite gli identificativi Shopify;
4. VestiFlow applica i relativi effetti;
5. calcola la situazione aggiornata;
6. mostra il **confronto** con Shopify;
7. **prevalgono le quantità calcolate da VestiFlow**;
8. Shopify viene **riallineato a VestiFlow**.

⛔ **Vale soltanto per la riconnessione allo stesso `shop_gid`.** Un negozio
differente **non eredita** l'intervallo del precedente: i suoi ordini non sono
mai stati «non sincronizzati», sono di un'altra storia.

#### 1.15.3 Che cosa va conservato, e che NON si azzera alla disconnessione

- identità del negozio (`shop_gid`);
- data della **prima connessione**;
- data della **disconnessione**;
- **ultimo checkpoint ordini riuscito**;
- **intervallo non sincronizzato**;
- data della **riconnessione**.

⛔ **La disconnessione non azzera queste informazioni.** Azzerarle rende
impossibile calcolare l'intervallo, e la proposta di recupero non può esistere.

⚠️ È il difetto già visto altrove in questo documento: `disconnect()` azzera
oggi `lastSyncAt` e `lastWebhookEventAt` (§8). Quelle due colonne servono a
un'altra domanda; la storia della connessione ha bisogno di campi propri, che
la disconnessione **scrive** invece di cancellare.

#### 1.15.4 Se l'utente RIFIUTA il recupero — ⏸ APERTO

⏸ Non deciso. Le due strade, entrambe difendibili:

- consentire la ripresa mostrando un **avviso permanente**;
- **bloccare il riallineamento delle quantità** finché il periodo non viene recuperato.

⛔ Nessuna tranche può scegliere implementando.

#### 1.15.5 Fonte delle quantità — prevale VestiFlow

Dopo il recupero degli ordini prevale **VestiFlow**, perché nel periodo di
disconnessione può aver registrato **altre operazioni locali** — vendite al
banco, rettifiche, carichi, trasferimenti — che Shopify non ha mai visto.

```text
ordini e aggiornamenti      Shopify  →  VestiFlow
calcolo della disponibilità             VestiFlow
quantità da vendere                     VestiFlow  →  Shopify
```

⭐ **Coerente con la regola già in vigore** (`regole-gestionale`): «Shopify non è
fonte della quantità». Qui se ne dichiara la conseguenza sul caso della
riconnessione, che è quello in cui la tentazione di fidarsi del remoto è più
forte.

⚠️ **Una modifica manuale delle quantità su Shopify produce un disallineamento
da MOSTRARE**: non sovrascrive automaticamente VestiFlow, e non viene ignorata
in silenzio.

---

## 2. Situazione osservata nel codice al 2 settembre 2026

Questa sezione descrive il presente. Non è il comportamento da conservare.

### 2.1 Push Shopify

Nel percorso corrente:

- `shopify-product-push.service.ts` costruisce un prodotto completo con `variants: variantRows`;
- `shopify-admin.client.ts` crea con `POST /products.json`;
- `shopify-admin.client.ts` aggiorna con `PUT /products/{id}.json`;
- l'eliminazione prodotto usa `DELETE /products/{id}.json`;
- l'inventario usa `POST /inventory_levels/set.json`;
- la configurazione predefinita dichiara API `2025-01`;
- il client GraphQL esiste, ma è usato solo per una parte delle funzioni, fra cui tassonomia e metafield;
- non esiste un comando applicativo esplicito per eliminare una singola variante Shopify;
- non esiste gestione della pubblicazione per singola variante e singolo canale;
- non esiste gestione di `inventoryPolicy` nel repository.

Rischi conseguenti:

- l'assenza di una variante da un payload completo può essere interpretata come cancellazione remota;
- un aggiornamento di prezzo o descrizione può produrre effetti strutturali non richiesti sulle varianti;
- gli ID Shopify possono essere persi o riassegnati senza un comando di ciclo di vita esplicito;
- `2025-01` non è più una versione supportata nel settembre 2026 e Shopify può applicare il fall-forward;
- il comportamento reale può quindi appartenere a una versione diversa da quella dichiarata.

### 2.2 Eliminazione locale

Nel percorso corrente:

- `ProductsService.delete` blocca il prodotto quando trova movimenti;
- prova a eliminare prima il prodotto Shopify e poi esegue `prisma.product.delete`;
- `syncVariants` elimina ogni variante esistente che non compare nel payload del form;
- `deleteVariantInTx` blocca la variante quando trova movimenti;
- `deleteVariantInTx` cancella esplicitamente i livelli inventariali;
- `ProductVariant` è padre con `CASCADE` di `InventoryLevel` e altre relazioni;
- il form possiede il concetto `included`, ma i principali percorsi lo inizializzano a `true` e non espongono un comando di eliminazione coerente.

Questo comportamento è incompatibile con i §§1.1–1.3.

### 2.3 Storia incompleta

La riga documento conserva già molti snapshot economici e fiscali, ma non possiede un contratto uniforme e persistito per:

- codice articolo;
- nome prodotto;
- barcode;
- identificatore storico stabile del prodotto e della variante.

Il movimento conserva oggi lo SKU e i costi, ma dipende ancora dalla relazione obbligatoria alla variante per nome prodotto, codice articolo, variante e valuta.

⚠️ **Il difetto del prezzo corrente appartiene al VECCHIO export dai movimenti, non al Registro.** `inventory-export.service.ts` legge `variant.sellingPriceMinor`; il modulo canonico `api/src/corrispettivi` non lo fa e non ha mai letto le righe prodotto — somma i **totali finali persistiti** dalle sue cinque fonti. Confonderli porterebbe a «correggere» un modulo che è già conforme (§2.6).

Conseguenza: il cestino o un semplice scollegamento non devono cambiare lo storico. Una
cancellazione definitiva può invece rimuovere movimenti e analisi collegate, ma le righe dei
documenti devono restare identificabili ed economicamente stabili attraverso i propri snapshot.

### 2.4 Filtri per stato

`searchVariantSummaries` è un motore condiviso da ricerca commerciale, magazzino, rilettura documentale, stampa etichette e altre funzioni. Filtrare lì i record non attivi o eliminati romperebbe i consumatori storici e inventariali.

I punti corretti sono i contesti chiamanti:

- pannello comune di ricerca prodotto nei documenti;
- servizio comune di ricerca per codice;
- scanner;
- lookup per codice fornitore;
- viste inventariali e storiche, che devono dichiarare regole diverse.

### 2.5 Due difetti già presenti da correggere nelle prime tranche

1. `inventory-export.service.ts` — il **vecchio export dai movimenti**, non il Registro canonico — calcola l'importo storico con `variant.sellingPriceMinor × quantity`. Cambiare il listino cambia quindi un export passato.

   ⭐ **Non si ripara: si dismette.** Il suo unico consumatore converge sul Registro canonico, che è già conforme (§5.5). Investire lavoro in quel percorso ne ritarderebbe la fine.

2. `inventory-situation.service.ts` esclude i prodotti `archived`, nascondendo anche giacenza fisica, entrate e uscite collegate.

Il primo è un difetto economico indipendente da Shopify e viene corretto prima di attivare l'eliminazione. Il secondo viene corretto insieme al nuovo modello di visibilità.

### 2.6 Tre motori omonimi, e non sono la stessa cosa — censito il 02/09/2026

⛔ **Dire «i Corrispettivi» non basta più**: nel gestionale ci sono tre percorsi diversi che producono un file con quel nome, e le prescrizioni di questo documento non valgono per tutti allo stesso modo.

|                                  | Che cos'è                                                                     | Da dove prende i numeri                                                                                                                                | Stato                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modulo canonico**              | `api/src/corrispettivi` + `src/app/features/reports/.../corrispettivi-report` | i **totali finali di testata già persistiti** dalle cinque fonti — ordini di vendita, rimborsi, vendite al banco, resi al banco, corrispettivi manuali | ⭐ è la **fonte di verità**. Non legge mai le righe documento (verificato: zero occorrenze di `documentLine` nel modulo) e non tocca l'anagrafica |
| **Vecchio export dai movimenti** | `inventory-export.service.ts`, metodo `exportCorrispettiviCsv`                | i **movimenti di magazzino**, moltiplicati per il prezzo di listino **corrente**                                                                       | ✅ **RIMOSSO il 03/09/2026**, insieme al suo unico consumatore                                                                                    |
| **Export Ordini Shopify**        | `/sales-orders/export/csv`                                                    | gli ordini del canale                                                                                                                                  | percorso a sé, sano, **non è un Corrispettivo**                                                                                                   |

⚠️ **Lo stesso pulsante ne usa due**: la pagina Report ha un ternario su quattro canali, e con `?corrChannel=shopify` non passa dal vecchio export ma dal terzo motore. Chi parlasse di «deviare il pulsante» ne sposterebbe un ramo lasciando l'altro dov'è.

⭐ **Il canonico SOMMA, non ricalcola.** È già conforme alla regola di `regole-gestionale`: legge `totalMinor`, `taxMinor` e `subtotalMinor` dalle testate e li aggrega. La correzione del §5.5 riguarda quindi il **vecchio export**, non lui.

### ✅ La dismissione è confermata — deciso il 03/09/2026

> **L'intera funzione «Export Corrispettivi» della pagina Report va RIMOSSA**, pulsante e selettore canale compresi.

⛔ **Non va trasformata in un report analitico**, né in nient'altro: va via. Il difetto §2.5 n. 1 si chiude togliendo il percorso, non riparandolo.

**Restano intatti, e non sono toccati da questa rimozione:**

|                                                           |                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| il **link a Vendite → Corrispettivi** nella pagina Report | ⭐ **resta.** Si toglie il blocco che esporta, non la via per arrivare al Registro |
| **Vendite → Corrispettivi**                               | il Registro canonico e i suoi export — CSV, foglio di calcolo, PDF                 |
| l'export della pagina **Vendite Shopify**                 | è l'export Ordini Shopify, e vive già lì per conto suo                             |

⭐ **Il modulo canonico resta l'UNICA fonte del Registro** — per la visualizzazione, per la **stampa** e per gli export. Non ne esistono altre, e non se ne aprono.

> **Stampe ed export leggono i totali finali persistiti dalle fonti. Mai movimenti × prezzo corrente.**

⚠️ Vale per ciò che c'è **e per ciò che verrà**: è la regola che impedisce di rifare il difetto §2.5 n. 1 in un'altra schermata, con un'altra motivazione. Un file che nasce moltiplicando una quantità per il listino di oggi non è un documento storico, comunque si chiami e da qualunque pagina esca.

⭐ **È ciò che rende la rimozione sicura.** Il pulsante di Report è un ternario che, col canale Shopify, porta al terzo motore: ma quel motore ha **già** il proprio ingresso nella pagina Vendite Shopify, dove la stessa card è montata. Togliendo il pulsante da Report non si perde nessuna funzione — si toglie un secondo ingresso a una cosa che ne ha già uno, e l'unico ingresso a un percorso che deve sparire.

### ✅ Rimosso il 03/09/2026

Il vecchio percorso **non esiste più**. Sono spariti:

|                                                                        |                                            |
| ---------------------------------------------------------------------- | ------------------------------------------ |
| il blocco export e il selettore canale                                 | dalla pagina Report                        |
| la rotta `inventory/movements/export/corrispettivi`                    | controller e servizio API                  |
| `exportCorrispettiviCsv` e il suo tipo                                 | client Angular                             |
| `corrispettivi-channel.model.ts` e `export-corrispettivi.query.dto.ts` | **file interi**, rimasti senza consumatori |

⚠️ **Con il blocco è sparito tutto l'apparato del periodo** della pagina Report — selettore, date personalizzate, sincronizzazione con l'URL: serviva soltanto a lui. Le giacenze sono uno snapshot corrente e non lo usano.

⛔ **E lì c'era una trappola.** Il pannello analitico aveva `hidePeriodFilter="true"` perché il selettore glielo forniva la card: togliendo la card senza togliere quella riga, la pagina sarebbe rimasta **senza alcun modo di cambiare periodo**. Ora il pannello usa il proprio, come già fa nella dashboard.

⭐ **La card `report-corrispettivi-export` NON è stata toccata**: la usa ancora la pagina Vendite Shopify, che le passa `showChannelFilter="false"`.

⚠️ **Quando si farà, chi usava quel pulsante vedrà di più, non di meno**: il vecchio export applica lo scope delle sedi dell'utente, il Registro canonico no — **ed è corretto così**, perché raggruppa tutti i corrispettivi dell'azienda (`10` §21). È una conseguenza voluta della regola, non un effetto collaterale della rimozione.

---

## 3. Modello funzionale degli stati

### 3.1 Cinque assi indipendenti

> ✅ **Decisione confermata** — rivista il 06/09/2026

⛔ **Qui c'erano QUATTRO assi, e «Pubblicazione Shopify» ne confondeva due.** Un'entità
Shopify **esiste ancora** e un'entità Shopify **è in vendita** sono due fatti diversi — una
variante può esistere e non essere in vendita, e può essere in vendita senza che nulla dica se
esiste ancora finché non lo si verifica. Confonderli è quello che rendeva ambiguo lo stato
«Non presente su Shopify» di §3.7 vecchia, che nominava «pubblicazione» per un fatto di
presenza.

| Asse                 | Valori                                                     | Domanda a cui risponde                                          |
| -------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| Ciclo di vita locale | attivo, non attivo, nel cestino, eliminato definitivamente | l'anagrafica è utilizzabile o ancora recuperabile in VestiFlow? |
| **Presenza Shopify** | **Mai pubblicato / Collegato / Eliminato su Shopify**      | **l'entità esiste ancora sul negozio online?**                  |
| **Vendita Shopify**  | **In vendita / Ritirato / Bozza**                          | **il cliente può acquistarla ORA, ammesso che esista?**         |
| Inventario           | giacenza, impegnata, disponibile                           | quanta merce fisica o assegnata esiste?                         |
| Sincronizzazione     | Attiva / Spenta / In corso / Errore                        | l'ultima intenzione locale è stata applicata al canale?         |

⭐ **Presenza e Vendita sono ORTOGONALI, e le quattro combinazioni sono tutte significative**:
Collegato+In vendita è il caso comune; Collegato+Ritirato è un ritiro deciso in VestiFlow;
Collegato+Bozza è l'ultima variante venduta (§3.4); Eliminato+qualunque-valore-di-vendita è lo
stato dopo una cancellazione fatta nel pannello Shopify (§11.7) — lì il valore di vendita
diventa senza oggetto, ma non si azzera: resta quello dell'ultima osservazione, per lo storico.

È vietato usare:

- giacenza zero per rappresentare lo stato non attivo;
- `inventoryPolicy = DENY` per rappresentare lo stato non attivo;
- `ProductStatus.archived` per nascondere la realtà inventariale;
- errore di sincronizzazione per cambiare lo stato locale;
- assenza dal payload per rappresentare eliminazione;
- **la Vendita Shopify per dedurre la Presenza Shopify, o viceversa**: «Ritirato» non
  implica «esiste ancora», e «Collegato» non implica «in vendita». Nessuno dei cinque assi
  si deduce da un altro (regola esplicita del proprietario, 06/09/2026).

### 3.2 Stato prodotto

> ✅ **Decisione confermata**

La colonna esistente `Product.status` mantiene i significati:

- `draft`: anagrafica non pronta o non ancora attiva commercialmente;
- `active`: prodotto in uso;
- `archived`: prodotto non attivo.

✅ **Adottato con la Tranche 1A** (commit `8bf85363`, 03/09/2026). Colonne su `Product`:

- `deletedAt` nullabile;
- `deletedById` nullabile — snapshot d'audit senza vincolo referenziale, come
  `StockMovement.createdById`;
- `deletionReason` nullabile.

`deletedAt != null` significa **nel cestino**, non «eliminato definitivamente»: dopo la purga il
record non esiste più. L'enum non ha un valore `deleted`, che creerebbe due fonti per lo stesso
fatto.

⛔ **`deletionOperationId` NON si aggiunge**, né a prodotto né a variante — deciso il
03/09/2026. Qui era elencato fra le colonne proposte: l'eventuale correlazione con un'operazione
remota appartiene alla tabella delle operazioni (§8.4), non all'anagrafica.

### 3.3 Stato variante

> ✅ **Decisione confermata** (03/09/2026)

La variante ha uno **stato locale proprio, indipendente da Shopify**. Non lo si deduce dal canale, e non lo si rappresenta con la quantità o con `inventoryPolicy`.

#### Le etichette

| Asse              | Etichetta                       |
| ----------------- | ------------------------------- |
| **stato locale**  | «Attiva» / «Non attiva»         |
| **stato Shopify** | «Pubblicata» / «Non pubblicata» |

**Perché questa coppia.** Un tenant che non usa Shopify deve comunque capire lo stato locale, e «pubblicare» lì non significa niente. E una variante **localmente attiva può essere non pubblicata** sul canale: sono due assi indipendenti (§1.5), quindi due parole diverse.

⛔ **Qui la coppia era una «proposta consigliata, da confermare»**, e l'enum alternativo era `active` / `out_of_use` con l'etichetta «Fuori uso». La proposta è stata **confermata** dal proprietario il 03/09/2026 insieme all'elenco completo degli stati (§3.7); «Fuori uso» è scartata.

⭐ **L'elenco completo, e quali stati non vanno confusi fra loro, sta in §3.7.**

✅ **Adottato con la Tranche 1A** (commit `8bf85363`): `ProductVariant.lifecycleStatus`
(`active` / `inactive`, default `active`) e le tre colonne del cestino `deletedAt`,
`deletedById`, `deletionReason`, con `deletedAt != null` come unica fonte dello stato **nel
cestino**. ⛔ `deletionOperationId` non c'è, per la stessa decisione di §3.2.

### 3.4 Stato effettivo derivato

> ✅ **Decisione confermata**

Una variante è selezionabile in un nuovo documento commerciale solo se:

```text
product.deletedAt IS NULL
AND variant.deletedAt IS NULL
AND product.status = active
AND variant.lifecycleStatus = active
```

Quando tutte le varianti sono Non attive o nel cestino:

- il prodotto VestiFlow resta esistente e il suo stato locale non viene riscritto;
- l'interruttore «Sincronizza con Shopify» resta acceso;
- l'interfaccia mostra lo stato derivato **«Nessuna variante attiva»**;
- il prodotto Shopify passa in **Bozza** e non è acquistabile;
- non viene eliminato né archiviato definitivamente.

#### ⭐ La Bozza porta una CAUSALE, e governa se la riattivazione si propaga — deciso il 06/09/2026

⛔ **Qui c'era «riattivare una variante non ripubblica MAI automaticamente il prodotto»**,
senza eccezioni. Non basta più: bisogna distinguere **perché** il prodotto è in Bozza.

> **Una Bozza Shopify ha SEMPRE una causale, memorizzata: «assenza di varianti vendibili»
> oppure «ritiro manuale». Rimettere in vendita una variante può far tornare il prodotto
> attivo automaticamente SOLO nel primo caso. Nel secondo, mai.**

| Perché il prodotto è in Bozza                           | Rimettere in vendita una variante           |
| ------------------------------------------------------- | ------------------------------------------- |
| **automatica**, per assenza di varianti vendibili (qui) | ⭐ può far tornare il prodotto attivo da sé |
| **manuale**, l'operatore ha premuto «Ritira da Shopify» | ⛔ resta in Bozza: il ritiro era una scelta |

⭐ **La ragione è che altrimenti un ritiro deciso dall'operatore si annullerebbe da solo** alla
prima variante rimessa in vendita — un comportamento che nessuno ha chiesto e che contraddice
proprio l'atto di ritirare.

⚠️ **La struttura per questa causale non esiste**: misurato il 06/09/2026, né `Product` né
`ShopifySyncStatus` portano un campo che distingua le due Bozze — un `ProductStatus.draft` letto
da Shopify oggi non dice da dove viene. È lavoro di schema per la tranche che introduce il
comando «Ritira da Shopify», non una conseguenza automatica di questa decisione.

### 3.5 Articolo semplice e variante base

> 🔧 **Proposta tecnica da verificare**

Il core VestiFlow usa un solo modello, anche quando Shopify non è disponibile:

```text
Prodotto
└── almeno una variante reale
```

Un articolo semplice possiede quindi una **variante base reale**, anche se l'interfaccia non mostra un'etichetta di variante. Su quella riga vivono identità, SKU, barcode, prezzi, costo, giacenze e movimenti. Non è una variante Shopify, non è una variante fantasma e non nasce per soddisfare un vincolo del canale: è l'unità inventariale e commerciale minima del gestionale.

Quando il modulo Shopify è attivo:

- la variante `Default Title`/standalone di Shopify viene collegata alla variante base reale di VestiFlow;
- il mapping vive nel connettore Shopify e non contamina il core;
- l'etichetta tecnica `Default Title` non viene mostrata come variante commerciale all'operatore;
- prezzi, SKU, barcode, inventory item e publication della variante Shopify appartengono comunque alla variante base mappata;
- non può esistere stabilmente una variante Shopify nascosta, senza mapping e ignorata dal gestionale.

Per un tenant senza Shopify non cambia nulla: usa lo stesso prodotto e la stessa variante base, senza creare righe di mapping o stati di canale.

Lo spostamento nel cestino o l'eliminazione definitiva dell'unica variante base **non elimina e
non cambia automaticamente lo stato del prodotto**. Il prodotto resta esistente e mostra lo
stato derivato «Nessuna variante attiva» (§3.4). Per tornare a usarlo come articolo semplice
l'operatore deve ripristinare la variante base oppure crearne e scegliere esplicitamente una
nuova. L'eventuale eliminazione del prodotto è un comando amministrativo distinto.

### 3.6 Stato tecnico del ritiro da Shopify

> 🔧 **Proposta tecnica da verificare**

Il ritiro remoto — spubblicazione della variante o archiviazione del prodotto — è un processo,
non un booleano. L'operazione conserva almeno:

- `queued`;
- `unpublishing`;
- `archiving_remote`;
- `verifying`;
- `completed`;
- `retryable_error`;
- `permanent_error`;
- `cancelled`.

⛔ **Il passo si chiamava `deleting_remote`**, ed era il nome di un'operazione che VestiFlow non esegue: verso Shopify si **archivia** e si **spubblica**, mai si cancella (§11.1). Un nome di stato che afferma una cancellazione remota insegna a scriverla.

Lo stato vive nella tabella delle operazioni/outbox, non nell'enum di ciclo di vita.

### 3.7 Stati da NON confondere

> ✅ **Decisione confermata** (03/09/2026, tabella rifatta il 06/09/2026 sul modello a 5 assi)

Questi stati appartengono ad **assi differenti** (§3.1) e **non sono sinonimi**. Usarne uno al
posto di un altro è il modo in cui un'interfaccia mente senza sbagliare un dato.

⛔ **Qui la tabella aveva otto righe e infilava «pubblicazione» come un asse solo.** Dopo la
separazione di §3.1 la stessa informazione si scrive su due assi, «Non presente su Shopify»
cambia nome in «Eliminato su Shopify» (Presenza), e compaiono i due valori che prima non
avevano una riga propria: «Mai pubblicato» e «Bozza».

| Stato                                      | Asse (§3.1)          | Che cosa afferma                                                                                         |
| ------------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------- |
| **Attiva in VestiFlow**                    | ciclo di vita locale | si può selezionare in un nuovo documento                                                                 |
| **Non attiva in VestiFlow**                | ciclo di vita locale | non selezionabile, ma esistente e reversibile                                                            |
| **Nel cestino VestiFlow**                  | ciclo di vita locale | ritirata, ripristinabile, storia intatta                                                                 |
| **Eliminata definitivamente da VestiFlow** | ciclo di vita locale | non ripristinabile; dipendenze operative eliminate, righe documento leggibili dai propri snapshot (§1.1) |
| **Mai pubblicato**                         | presenza Shopify     | non è mai esistito sul canale: non c'è nulla da ritirare né da perdere                                   |
| **Collegato**                              | presenza Shopify     | esiste su Shopify con un id valido, quale che sia il suo stato di vendita                                |
| **Eliminato su Shopify**                   | presenza Shopify     | su Shopify non esiste più: cancellato di là (§11.7). Sostituisce «Non presente su Shopify»               |
| **In vendita**                             | vendita Shopify      | il cliente la vede e la acquista sul canale                                                              |
| **Ritirato**                               | vendita Shopify      | collegato, ma non acquistabile: l'operatore l'ha tolto dalla vendita (§10.2, §11.2)                      |
| **Bozza**                                  | vendita Shopify      | il prodotto esiste, non è acquistabile; causale distinta manuale/per-assenza (§3.4)                      |

⚠️ **Le confusioni che costano di più:**

- **«Ritirato» ≠ «Eliminato su Shopify»**: la prima è una decisione di vendita reversibile con
  «Rimetti in vendita su Shopify»; la seconda è un fatto di presenza, e la riattivazione
  possibile è «Pubblica nuovamente su Shopify» — un comando diverso, che crea un'entità nuova
  (§11.9);
- **«Nel cestino» ≠ «Eliminata definitivamente»**: dal cestino si torna indietro, e §11.5
  dice che finché Shopify non conferma l'elemento **resta** nel cestino;
- **«Bozza» non è un valore unico**: la stessa etichetta copre due cause opposte per la
  riattivazione automatica del prodotto — vedi la tabella di §3.4;
- **nessuno di questi stati implica un altro**: «Ritirato» non dice se è ancora «Collegato» o
  già «Eliminato su Shopify» — sono due assi, e vanno letti entrambi (§3.1).

---

## 4. Strategia di persistenza: cestino reversibile ed eliminazione definitiva

### 4.1 Cestino

> ✅ **Decisione confermata**

Il primo livello di eliminazione è il **cestino**, realizzato come cancellazione logica.

Dal punto di vista dell'operatore il prodotto o la variante sparisce dall'anagrafica ordinaria
e dalle nuove selezioni. Nel database resta il record completo, marcato come nel cestino, per
mantenere:

- relazioni ai documenti;
- relazioni ai movimenti;
- giacenze e impegni;
- lotti e matricole;
- raggruppamenti storici;
- audit e possibilità di ripristino.

Il cestino è ripristinabile. Non modifica né elimina le dipendenze e non è sinonimo dello stato
locale Non attivo.

### 4.2 Eliminazione definitiva

> ✅ **Decisione confermata**

Dal cestino, un amministratore autorizzato può scegliere **Elimina definitivamente**. È una
purga fisica, irreversibile e distinta dal cestino.

L'operazione:

- richiede un primo avviso riepilogativo e un secondo avviso esplicito di irreversibilità;
- ricalcola sul server le conseguenze immediatamente prima dell'esecuzione;
- elimina prodotto o variante e le dipendenze operative indicate in §1.1;
- se elimina il prodotto, comprende tutte le sue varianti;
- lascia le righe documento come snapshot testuali e scollega il riferimento vivo quando
  necessario;
- non crea movimenti di rettifica o compensazione;
- conserva soltanto l'audit minimo dell'operazione e gli identificativi storici che non possono
  essere riutilizzati.

La forma tecnica — cancellazioni esplicite o vincoli referenziali mirati — deve essere provata
sullo schema reale. Non è ammesso affidarsi a un `CASCADE` generico senza aver enumerato e
mostrato nel preflight tutte le righe che verranno rimosse.

### 4.3 Unicità dopo la cancellazione

#### ✅ Decisione confermata

|                                                                |                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| identificativo presente nello **storico**                      | ⛔ **non è riutilizzabile**. Vale per codice articolo, SKU e barcode |
| forzatura amministrativa                                       | ⛔ **non esiste**, e nessun permesso può concederla                  |
| se appartiene a un record **nel cestino**                      | il sistema mostra il record e **propone il ripristino**              |
| se appartiene a un record definitivamente eliminato con storia | il sistema spiega perché non può essere riutilizzato                 |
| variante **mai salvata**                                       | ✅ non riserva nulla: quegli identificativi restano liberi           |
| elemento **nel cestino**                                       | ⛔ continua a riservare gli identificativi: può essere ripristinato  |
| elemento eliminato definitivamente **senza storia**            | ✅ gli identificativi tornano disponibili                            |

⛔ **Qui c'era un residuo del riuso forzato**, sopravvissuto alla prima correzione: _«un permesso amministrativo potrà forzare il riuso solo dopo conferma, mantenendo identità storiche distinte»_. È eliminato. La clausola «dopo conferma» non lo rendeva accettabile: una regola d'integrità che un permesso può scavalcare non è una regola, e «identità storiche distinte» descriveva il modo di aggirarla, non una garanzia.

⭐ E il «non **automaticamente**» delle vecchie righe era la stessa apertura, scritta più piano: lasciava intendere che esistesse una via non automatica. Non esiste.

Una variante salvata o sincronizzata ma mai entrata in documenti, movimenti o altro storico
segue la stessa regola: nel cestino conserva gli identificativi; dopo l'eliminazione definitiva
li libera. La cancellazione resta un comando amministrativo.

#### 🔧 Proposta tecnica da verificare

Gli indici unici esistenti non vanno semplicemente rimossi. Se si introduce unicità parziale
sui non eliminati, serve comunque un controllo applicativo che distingua il record nel cestino,
l'identificativo storico non riutilizzabile e quello realmente liberato dall'eliminazione
definitiva.

---

## 5. Snapshot e immutabilità storica

### 5.1 Regola generale

> ✅ **Decisione confermata**

> La riga documento e il movimento dichiarano ciò che è avvenuto in quel momento. Non ricaricano la propria identità economica dall'anagrafica corrente.

La disponibilità mostrata accanto a una riga può restare live. Nome, codice, variante, prezzo, IVA, costo e totali del fatto storico non lo sono.

### 5.2 Snapshot della riga documento

> ✅ **Decisione funzionale confermata** · 🔧 **contratto tecnico residuo da verificare**

È confermato che la riga documento conserva la propria identità, i valori economici e fiscali
e resta leggibile anche dopo l'eliminazione definitiva dell'anagrafica. Lo snapshot viene
composto dal server; duplicazioni e conversioni lo ereditano dalla riga sorgente tramite un
riferimento verificato, non tramite valori affidati al client. Un valore storico `null` resta
`null` e non viene ricostruito dall'anagrafica corrente.

Il contratto completo deve comprendere almeno:

- `productId` e `variantId` quando disponibili, come collegamenti tecnici;
- `productHistoricalKey` e `variantHistoricalKey` immutabili;
- `articleCodeSnapshot`;
- `productNameSnapshot`;
- `description` di riga;
- `variantLabelSnapshot`;
- `skuSnapshot`;
- `barcodeSnapshot`;
- `unitOfMeasureSnapshot`;
- valuta;
- prezzo unitario effettivamente usato;
- sconto effettivo;
- snapshot IVA completo;
- costo unitario e modalità costo quando richiesti;
- totali determinati.

DTO, mapper, salvataggi, caricamenti, duplicazioni, conversioni, inclusioni e stampe devono
trasportare lo stesso contratto. Non basta aggiungere colonne se un percorso non invia il valore
al server.

🔧 Resta da verificare se servano davvero chiavi storiche dedicate
(`productHistoricalKey`/`variantHistoricalKey`) oltre agli snapshot già persistiti, e come
coprire i percorsi ancora dichiarati incompleti. Questa scelta tecnica non rimette in discussione
la regola funzionale sopra.

### 5.3 Snapshot minimo del movimento

> ❓ **Decisione da prendere**

Ogni movimento deve essere leggibile e aggregabile senza join obbligatorio all'anagrafica corrente. Deve conservare almeno:

- `productHistoricalKey`;
- `variantHistoricalKey`;
- `articleCodeSnapshot`;
- `productNameSnapshot`;
- `variantLabelSnapshot`;
- `skuSnapshot`;
- `barcodeSnapshot`;
- unità di misura;
- valuta;
- sede e direzione;
- quantità;
- costo unitario e totale congelati;
- per vendite e resi, prezzo unitario e importo di ricavo congelati;
- origine del prezzo storico (`document_line`, `online_sale_line`, `manual`, `legacy_unknown`);
- documento e riga origine quando esistono.

Il prezzo di vendita corrente della variante non è mai una fonte ammessa per ricostruire un ricavo passato.

### 5.4 Pregresso

> ✅ **Decisione confermata**

> Non dobbiamo inventare una fotografia del passato.

Il backfill può usare solo dati realmente presenti e riferibili all'evento, ad esempio:

- snapshot già persistiti nella riga documento;
- prezzo e totale della riga vendita online;
- dati fiscali già salvati;
- riferimenti immutabili dell'evento.

Non può usare per riempire il passato:

- nome attuale dell'articolo come se fosse storico;
- prezzo attuale;
- IVA attuale;
- costo attuale;
- categoria attuale.

Quando il valore storico non è ricostruibile:

- il campo resta null;
- viene marcato `legacy_unknown` o equivalente;
- export e UI mostrano `Dato storico non disponibile`;
- non viene sostituito da zero o dal valore corrente.

### 5.5 Corrispettivi — convergenza, non riparazione

> ✅ **Decisione confermata**

|                                                          |                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/src/corrispettivi`                                  | ⭐ **resta la fonte di verità.** Somma i totali finali persistiti dalle sue fonti, non legge le righe prodotto, non ha mai letto il listino |
| il **vecchio export dai movimenti**                      | ⛔ **va DISMESSO**                                                                                                                          |
| il suo unico consumatore                                 | deve **convergere** sul percorso canonico                                                                                                   |
| l'export **Ordini Shopify** (`/sales-orders/export/csv`) | percorso a sé: ⚠️ **non è un Corrispettivo** e non va confuso col Registro                                                                  |
| i dati di prova esistenti                                | ⛔ **nessun recupero, nessun backfill**                                                                                                     |

⛔ **Il vecchio export non si ripara, e non si alimenta con nuovi snapshot economici.** Qui c'era un piano in cinque punti per correggerlo — «l'export smette di leggere `variant.sellingPriceMinor`», «usa il valore congelato», «per il pregresso usa una fonte storica dimostrabile» — che avrebbe investito lavoro in un motore destinato a sparire, e ne avrebbe ritardato la fine.

⭐ **Il difetto del prezzo corrente si chiude facendo convergere il consumatore**, non riscrivendo il percorso da dismettere. È la stessa disciplina che il progetto applica al push REST (§1.6): non si aggiungono funzioni a ciò che si sta togliendo.

⚠️ **§5.4 «Pregresso» resta scritto ma non si applica qui**: tutti i dati presenti sono dati di prova. La politica torna valida il giorno in cui ci fossero dati veri.

#### Esportazione per aliquota — RINVIATA

⚠️ Non confonderla col **raggruppamento della schermata**: sono due cose diverse, e il menu «Raggruppa» ha oggi due sole opzioni — **Nessuno** e **Giorno**. Mensile e annuale non esistono, e nessuna delle due separa gli importi per aliquota.

La scomposizione per aliquota o natura esiste in un solo punto: la colonna «Dettaglio IVA» dell'export, popolata dalla **sola** sorgente Corrispettivo manuale. Sulle altre quattro esce vuota.

⭐ È **attività rinviata**, non un difetto del raggruppamento: le fonti che la conoscono sono le righe (`vatSnapshot` + `lineVatTotalMinor`, che dalla tranche 0A.1 è persistito anche sul percorso generico), e il canonico oggi non le legge mai. Farla significa decidere **se** debba leggerle — che è una decisione di modello, non un'aggiunta.

---

## 6. Matrice di visibilità e selezionabilità

| Contesto                                                  | Attiva |              Non attiva |                                                  Nel cestino |                                Eliminata definitivamente |
| --------------------------------------------------------- | -----: | ----------------------: | -----------------------------------------------------------: | -------------------------------------------------------: |
| Nuovo preventivo/ordine/vendita/DDT/fattura               |     sì |                      no |                                                           no |                                                       no |
| Ricerca commerciale per codice o scanner                  |     sì |                      no |                                                           no |                                                       no |
| Nuovo ordine fornitore/arrivo destinato a riassortimento  |     sì | no, salvo riattivazione |                                                           no |                                                       no |
| Trasferimento, rettifica, inventario, esaurimento residui |     sì |       sì, con etichetta | sì, solo nei contesti amministrativi o inventariali previsti |                                                       no |
| Documento storico salvato                                 |     sì |                      sì |                                                           sì |                          sì, tramite snapshot della riga |
| Documento aperto già contenente la riga                   |     sì |                      sì |                                                           sì |          sì, tramite snapshot; la riga non viene rimossa |
| Situazione magazzino                                      |     sì |                      sì |                               sì, con badge e quantità reali |             no: i dati inventariali sono stati eliminati |
| Lotti, matricole, impegni                                 |     sì |                      sì |                                                           sì |        no: sono stati eliminati col preflight definitivo |
| Movimenti                                                 |     sì |                      sì |                                                           sì |        no: sono stati eliminati col preflight definitivo |
| Analisi basate sui documenti e sui loro totali            |     sì |                      sì |                                                           sì |                  sì, se leggono gli snapshot documentali |
| Analisi basate sui movimenti                              |     sì |                      sì |                                                           sì | possono cambiare: i movimenti eliminati non esistono più |
| Stampa documenti storici                                  |     sì |                      sì |                                                           sì |                          sì, tramite snapshot della riga |
| Anagrafica ordinaria                                      |     sì |        filtro opzionale |                                     no; visibile nel Cestino |                                                       no |

### 6.1 Regola per le query

> ✅ **Decisione confermata**

`searchVariantSummaries` resta un lettore neutro capace di restituire tutti gli stati quando interrogato per ID o da un contesto storico.

Il chiamante deve dichiarare un contesto esplicito, ad esempio:

- `commercial_selection`;
- `procurement_selection`;
- `warehouse_operation`;
- `historical_resolution`;
- `inventory_reality`;
- `admin_catalog`.

Non usare un booleano ambiguo come `includeArchived`. Il contesto deve essere un tipo chiuso e testato.

### 6.2 Guardia statica obbligatoria

> 🔧 **Proposta tecnica da verificare**

Si aggiunge un controllo automatico, ad esempio `check:historical-catalog-state`, che fallisce se nei moduli di reportistica storica vengono introdotti filtri su:

- `Product.status`;
- `Product.deletedAt`;
- `ProductVariant.lifecycleStatus`;
- `ProductVariant.deletedAt`.

Le eccezioni devono essere nominate in allowlist con motivazione. Nessuna regex globale può sostituire i test di comportamento, ma la guardia evita il difetto silenzioso più pericoloso.

---

## 7. Esperienza dello stato locale, eliminazione e ripristino

### 7.1 Comandi espliciti

#### ✅ Decisione confermata

Esistono, come **capacità distinte**:

|                                                          |                                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **spostamento nel cestino**                              | reversibile; di un prodotto o di una variante esistente. Comando amministrativo                                                              |
| **ripristino**                                           | di un record nel cestino. Amministrativo                                                                                                     |
| **eliminazione definitiva**                              | irreversibile; disponibile dal cestino con doppio avviso. Amministrativo                                                                     |
| **stato locale reversibile**, distinto dall'eliminazione | portare una variante a non attiva, e riportarla in uso                                                                                       |
| **rimozione di una riga non ancora salvata**             | durante la compilazione del form, da chi sta modificando l'articolo. ⭐ **Non è un'eliminazione anagrafica**: quella riga non è mai esistita |

⭐ Togliere una riga dal form o cambiare le opzioni **non equivale a eliminarla**. È la distinzione che regge tutto il capitolo.

Le etichette funzionali sono **«Sposta nel cestino»**, **«Ripristina»** ed **«Elimina
definitivamente»**. Il comando «Riprova sincronizzazione» e la forma dettagliata del confronto
fra combinazioni restano proposte tecniche/UI, non prerequisiti per applicare le regole sopra.

⭐ **E le etichette dei DUE comandi reversibili sono state fissate il 06/09/2026** (§1.11):
**«Disattiva»** e **«Riattiva»** per lo stato locale, **«Ritira da Shopify»** e **«Rimetti in
vendita su Shopify»** per la vendita online.

⚠️ **Non sostituiscono le tre qui sopra: appartengono a un altro asse.** «Sposta nel cestino» e
«Disattiva» non sono sinonimi — dal cestino un record esce solo con «Ripristina», mentre un
record disattivato è **presente e usabile in lettura**, con storia, identificativi Shopify e
collegamenti intatti. Confonderli è la prima delle confusioni elencate in §3.7.

### 7.2 Preflight di eliminazione

> 🔧 **Proposta tecnica da verificare**

Prima della conferma, il server calcola nello stesso tenant:

- giacenza totale e per sede;
- disponibile e impegnata;
- numero di movimenti;
- numero di documenti e righe documento;
- ordini o documenti aperti;
- lotti aperti;
- matricole in stock o assegnate;
- prenotazioni;
- collegamenti fornitore;
- vendite online;
- collegamento Shopify e pubblicazioni per canale;
- stato dell'ultima sincronizzazione;
- conseguenza dell'ultima variante.

La risposta contiene numeri, etichette e identificativi utili. Non esegue alcuna modifica.

### 7.3 Conferme proporzionate e non bloccanti

> ✅ **Decisione confermata**

Per **Sposta nel cestino** basta una conferma ordinaria che spiega che l'elemento sparirà dalle
nuove operazioni ma resterà ripristinabile.

Per **Elimina definitivamente** sono sempre richiesti due passaggi. Il primo mostra le
conseguenze calcolate dal server, ad esempio:

```text
Stai eliminando definitivamente: Maglia Aurora — XL / Rosso

Verranno eliminati:
- 36 movimenti
- giacenze in 2 sedi: 12 pezzi complessivi
- 3 impegni aperti
- 2 lotti e 4 matricole

Resteranno leggibili come testo:
- 8 righe documento

Le analisi basate sui movimenti eliminati potranno cambiare.
Su Shopify la variante resterà esistente ma non pubblicata.
```

Il secondo passaggio dichiara che l'operazione è irreversibile e richiede una nuova conferma
esplicita. Gli avvisi non disabilitano il pulsante all'amministratore autorizzato.

### 7.4 Permessi e audit

> ✅ **Decisione confermata**

Non codificare il ruolo direttamente nel servizio. Introdurre o riusare un permesso applicativo esplicito per:

- portare una variante allo **stato locale non attivo**;
- eliminare;
- ripristinare.

⛔ **NON esiste un permesso per «forzare il riuso di SKU/barcode/codice storico», e non deve esistere.** Il documento ne prevedeva uno, con «default consigliato: eliminazione e riuso forzato abilitati a titolare/amministratore». È contrario alla decisione confermata: **un identificativo presente nello storico non è riutilizzabile per un'entità diversa, e nessun comando amministrativo può forzarlo.** Un permesso che consente di violare una regola di integrità storica non è un permesso: è la regola che smette di esistere per chi ha quel permesso.

⭐ La regola completa, confermata:

|                                                       |                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| identificativo presente nello **storico**             | ⛔ **non riutilizzabile**, da nessuno, in nessun modo      |
| variante **mai salvata**, tolta dal form              | ✅ non riserva nulla: quegli identificativi restano liberi |
| variante **salvata o sincronizzata, ma senza storia** | nel cestino riserva; dopo eliminazione definitiva libera   |

Default per l'eliminazione: titolare/amministratore, configurabile col sistema permessi esistente.

L'audit conserva:

- tenant;
- operatore;
- data e ora;
- record e snapshot identificativo;
- avvisi mostrati;
- conferma ricevuta;
- stato Shopify prima e dopo;
- ID dell'operazione remota;
- tentativi ed errori originali.

### 7.5 Ripristino

> ✅ **Decisione confermata**

Il ripristino locale è disponibile soltanto dal cestino e:

- rimuove `deletedAt` e i metadati di cancellazione;
- non crea, elimina o modifica movimenti;
- non modifica documenti;
- ripristina l'anagrafica nello stato **Non attiva** per evitare ripubblicazioni involontarie;
- richiede un comando separato per rimettere in uso.

Se il ritiro da Shopify non era ancora completato, l'operazione pendente viene annullata senza
duplicare effetti.

Se la risorsa era stata eliminata direttamente su Shopify, il ripristino locale non può
recuperare lo stesso ID remoto:

- crea una nuova risorsa Shopify solo su comando esplicito;
- salva il nuovo GID;
- conserva il vecchio GID nell'audit;
- non ripubblica automaticamente su tutti i canali.

---

## 8. Architettura Shopify di destinazione

### 8.1 Versione e fonti ufficiali

> 🔧 **Proposta tecnica da verificare**

Target: GraphQL Admin API `2026-07`.

Motivi:

- la pubblicazione indipendente delle varianti è disponibile da `2026-07`;
- `ProductVariant` implementa `Publishable`;
- `productVariantsBulkCreate` e `productVariantsBulkUpdate` sono le mutation dedicate (esiste anche `productVariantsBulkDelete`, che però VestiFlow **non usa** — §11.1);
- `productSet` è previsto per sincronizzare cataloghi da una fonte esterna;
- `inventorySetQuantities` in `2026-07` richiede protezioni di concorrenza e direttiva `@idempotent`;
- le versioni stabili Shopify hanno supporto limitato e `2025-01` non deve restare dichiarata.

Fonti:

- <https://shopify.dev/docs/api/usage/versioning>
- <https://shopify.dev/changelog/publish-and-unpublish-product-variants-independently-from-product>
- <https://shopify.dev/docs/apps/build/sales-channels/product-publishing>
- <https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productSet>
- <https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkCreate>
- <https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkUpdate>
- <https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productVariantsBulkDelete>
- <https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/productDelete>
- <https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/inventorySetQuantities>

### 8.2 Permessi Shopify

> 🔧 **Proposta tecnica da verificare**

La connessione deve censire e verificare almeno gli scope richiesti dalle funzioni abilitate:

- `read_products`;
- `write_products`;
- `read_publications` se richiesto dallo schema/operazione usata;
- `write_publications`;
- `read_inventory`;
- `write_inventory`;
- gli scope già necessari per ordini, clienti, location e fulfillment.

L'aggiunta di `write_publications` richiede un flusso di riconnessione/riautorizzazione. Finché manca:

- VestiFlow mostra la funzione come non disponibile;
- non finge che giacenza zero o `DENY` equivalgano a spubblicazione;
- può continuare le funzioni che non richiedono quello scope;
- registra l'operazione di pubblicazione come sospesa, non come riuscita.

### 8.3 Client GraphQL comune

> 🔧 **Proposta tecnica da verificare**

Il client deve fornire un contratto comune per:

- transport error;
- HTTP error;
- `errors` GraphQL;
- `userErrors` delle mutation;
- `extensions.cost.throttleStatus`;
- retry consentiti;
- correlation ID;
- versione effettiva restituita da Shopify;
- log senza token o dati sensibili.

Ogni mutation deve trattare `userErrors` come esito applicativo fallito. Una risposta HTTP 200 non equivale a successo.

### 8.4 Outbox persistente

> 🔧 **Proposta tecnica da verificare**

⚠️ **Questa sezione descrive UNA forma possibile; i requisiti che qualunque forma deve
soddisfare stanno in §8.9** — nessuna perdita silenziosa, priorità sotto carico, completezza
del primo allineamento, margine misurato. ⛔ **Outbox, worker e Bulk Operations restano
opzioni da valutare**, non implementazioni autorizzate: leggere questa sezione come una
decisione presa è l'errore che §8.9 esiste anche per prevenire.

Le scritture Shopify non devono dipendere da un `void` in memoria.

La transazione locale registra:

- intenzione;
- tipo operazione;
- aggregate ID locale;
- versione attesa del record;
- payload canonico o riferimento ricostruibile;
- idempotency key;
- tenant e shop;
- stato e numero tentativi.

Un worker persistente esegue le operazioni. Il riavvio dell'API non perde la coda.

Il worker:

- serializza per shop e aggregate quando necessario;
- usa `pg_try_advisory_xact_lock` solo sui brevi tratti database;
- non mantiene una transazione o un lock durante la chiamata HTTP;
- applica backoff con jitter;
- distingue errori ripetibili e permanenti;
- non cancella un errore di un tipo a causa del successo di un'altra operazione.

### 8.5 Identità remota

> 🔧 **Proposta tecnica da verificare**

Conservare GID GraphQL completi per:

- prodotto;
- variante;
- inventory item;
- location;
- publication;
- media rilevanti.

Non convertire i GID in numeri come identità canonica. Gli eventuali legacy ID REST sono dati di migrazione.

Per rendere stabile il matching, valutare un metafield app-owned con UUID VestiFlow per prodotto e variante. Non affidarsi soltanto a:

- SKU, che può essere vuoto o duplicato sul remoto;
- barcode, che può mancare;
- posizione della variante;
- titolo opzioni;
- ordine di risposta.

⛔ **Qui c'era «la tabella di mapping del connettore deve inoltre distinguere almeno: mapping
attivo, mapping ritirato ma conservato per audit, …»** — quattro righe che dicevano _che cosa_
serviva senza dire _come_. Il modello è stato progettato per intero il 06/09/2026, con stati,
vincoli e registro delle consegne: **§8.5.1-§8.5.5**. La distinzione «standalone/default» resta
qui perché riguarda il **ruolo Shopify** della variante (§3.5), non il suo collegamento.

`standalone/default` descrive il ruolo della variante nel modello Shopify. Non significa `tecnica da ignorare`: per un articolo semplice deve essere collegata alla variante base reale di VestiFlow.

### 8.5.1 Identità del negozio

> ✅ **Decisione confermata** (06/09/2026)

Misurato sullo shop di sviluppo il 06/09/2026: `Shop.id` GraphQL è **`gid://shopify/Shop/{numero}`**,
permanente per il negozio. `myshopifyDomain` è di fatto stabile ma è una stringa, non
un'identità: il cambio negozio riscrive `ShopifyConnection.shopDomain`, quindi non basta a
risalire al negozio precedente.

**Nuova entità `ShopifyShop`**, separata dalla connessione corrente:

```text
shopify_shops
  id (uuid) · tenant_id (FK tenants)
  shop_gid              gid://shopify/Shop/{id}          — identità immutabile
  myshopify_domain      fotografia al momento del collegamento
  first_seen_at · last_seen_at

  UNIQUE (tenant_id, shop_gid)
  UNIQUE (shop_gid)                  ← vedi sotto
  UNIQUE (id, tenant_id)             ausiliaria per le FK composite di §8.5.2-8.5.3
```

⭐ **`shop_gid` è univoco GLOBALMENTE, non solo per tenant** — deciso il 06/09/2026: **lo stesso
negozio Shopify non può appartenere contemporaneamente a due tenant VestiFlow.** Un negozio
online è un'entità fisica di un solo commerciante; due tenant che lo collegano insieme
significherebbe due gestionali che si contendono lo stesso catalogo e gli stessi ordini.

⚠️ **Salvo un caso commerciale contrario, che oggi non è documentato.** Se un giorno esistesse
un motivo di prodotto per cui più tenant devono poter leggere lo stesso negozio — un gruppo con
un unico negozio online e più sedi gestite come tenant separati, per esempio — quel caso va
dichiarato esplicitamente qui, con le sue regole di conflitto, prima di rilassare il vincolo.
Finché non esiste, il vincolo resta globale e il database lo impone da solo.

⭐ **La connessione punta al negozio, non lo sostituisce**: `ShopifyConnection.shopId` (FK
verso `ShopifyShop`) si aggiunge alla connessione esistente. `ShopifyConnection` resta
`tenantId @unique` — una sola connessione corrente per tenant — ma può aver puntato a negozi
diversi nel tempo, e ognuno lascia una riga propria qui.

#### La transazione di cambio negozio

Riconfigurare la connessione su un negozio diverso è **un'operazione sola**, nella stessa
transazione:

1. **si crea** (o si ritrova, se già noto) l'identità immutabile del nuovo negozio in
   `shopify_shops`;
2. **si aggiorna** `ShopifyConnection` a puntare al nuovo `shop_id` e al nuovo `shopDomain`;
3. **si chiudono** tutti i link `active` del **vecchio** negozio — prodotto, variante **e
   sede** — con `close_reason = shop_change` (§8.5.2);
   ⚠️ **Le famiglie sono TRE, non due** — deciso il 07/09/2026. Qui erano nominate solo
   prodotto e variante, e le sedi sarebbero rimaste collegate a un negozio che non è più
   quello connesso;
4. gli identificativi remoti del vecchio negozio **restano storici**: nessuna riga si cancella,
   nessun id si azzera;
5. **le colonne-cache** esistenti (`shopifyProductId`, `shopifyVariantId`,
   `shopifyInventoryItemId` su `Product`/`ProductVariant`) si aggiornano **nella stessa
   transazione** — coerentemente con §8.5.5: dopo il cambio negozio non devono restare a
   puntare a un id che appartiene ormai a un negozio diverso.

⛔ **Nessuno di questi passi è nuovo per il progetto**: il purge da cambio negozio esiste già
(`shopify-shop-change.service.ts`) e oggi **cancella** prodotti e clienti collegati invece di
chiudere i link. Il comportamento richiesto qui è diverso da quello attuale, e va registrato
come lavoro di tranche, non come correzione immediata.

#### ✅ Preflight eseguito: entrambi i negozi espongono un GID valido — 07/09/2026

Due letture in sola lettura, una per connessione, con la query `{ shop { id myshopifyDomain } }`
alla versione API **effettiva del client** (`2026-07`):

|                                        | Negozio A | Negozio B |
| -------------------------------------- | --------- | --------- |
| Shop GID presente e formalmente valido | ✅        | ✅        |
| distinti fra loro                      | ✅        | ✅        |
| `myshopifyDomain` == dominio locale    | ✅        | ✅        |
| errori o permessi mancanti             | nessuno   | nessuno   |

⛔ **GID e domini reali non compaiono in questo documento, né nelle migration.** Restano nel
database e nelle letture: un identificativo di negozio in un file versionato è un dato del
cliente in un posto che non lo riguarda.

⭐ **Il valore che mancava esiste ed è acquisibile**: era l'unico punto in cui il backfill
dipendeva da un dato assente in locale (§8.5.8).

⚠️ **`apiVersion` registrata `2025-01` su un negozio è un valore informativo STANTIO, e non
blocca niente.** La lettura è avvenuta a `2026-07` ed è riuscita: la colonna si aggiorna solo
a una riconnessione (`shopify-oauth.service.ts:169`), mentre le chiamate leggono sempre la
configurazione. È un **debito separato** — il pannello mostra quella colonna — registrato in
`DA-FARE.md`, non un ostacolo a questo modello.

#### ⭐ L'identificativo canonico è il GID completo — deciso il 07/09/2026

> **Nelle tabelle di collegamento l'identificativo remoto è il GID Shopify completo.** Il
> modello nuovo è GraphQL, e il GID porta con sé il **tipo** della risorsa: `Product` e
> `ProductVariant` non possono essere scambiati per errore, cosa che due numeri accanto non
> impediscono.

Conversioni del backfill, deterministiche:

```text
prodotto        gid://shopify/Product/{id}
variante        gid://shopify/ProductVariant/{id}
inventory item  gid://shopify/InventoryItem/{id}
negozio         gid://shopify/Shop/{id}
```

⚠️ **Gli identificativi numerici attuali NON si sovrascrivono e non si eliminano**: misurato il
06/09/2026, sono tutti in forma legacy REST — 178 prodotti e 287 varianti, zero `gid://`.
Restano nelle colonne esistenti come **cache di compatibilità** per il codice non ancora
migrato (§8.5.5), e il loro ritiro è la tranche finale.

⛔ **Nelle tabelle nuove non si mette una seconda copia numerica.** Il numero è già disponibile
nelle colonne legacy e si ricava dal GID con una divisione di stringa: duplicarlo creerebbe due
scritture da tenere allineate per un dato derivabile — cioè la stessa doppia fonte che §8.5.5
esiste per chiudere.

⭐ **Il tipo si verifica nel database, non solo nel codice**: ogni colonna GID porta un `CHECK`
che ne impone il prefisso esatto. Un `gid://shopify/Product/…` in una colonna di variante viene
rifiutato da PostgreSQL, non da una convenzione.

### 8.5.2 Storico dei collegamenti Shopify — modello

> ✅ **Decisione confermata** (06/09/2026) · ⭐ **modello dati ristrutturato il 07/09/2026**

⛔ **Qui c'erano DUE tabelle, `ShopifyProductLink` e `ShopifyVariantLink`, che facevano
due mestieri insieme**: dicevano _quale articolo locale è quel GID_ e insieme _da quando a
quando è stato collegato_. Reggeva finché l'anagrafica locale non si eliminava mai. Dal
momento in cui l'eliminazione definitiva locale è stata decisa (§1.8, §7), quella forma si
è spezzata su due punti misurati, e la ristrutturazione non è un ripensamento estetico:

|                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| una riga con `product_id` **NOT NULL** e FK `RESTRICT` rende l'eliminazione definitiva **impossibile**: o si toglie il vincolo, o non si elimina            |
| resa `product_id` **nullable**, la FK composita `(product_id, tenant_id)` diventa **inerte**: `MATCH SIMPLE` non verifica nulla quando una colonna è `NULL` |

⭐ **Il modello effettivo separa l'IDENTITÀ dai PERIODI**, ed è la stessa forma già decisa
per le sedi (§1.13.6): la cosa stabile da una parte, i suoi intervalli di tempo dall'altra.

```text
shopify_product_identities          ← chi è quel GID, per sempre
  id · tenant_id · shop_id
  shopify_product_gid               gid://shopify/Product/{id}, forma imposta da CHECK
  original_product_id               l'appartenenza ORIGINARIA — immutabile, SENZA FK
  product_id                        il riferimento VIVO — nullable, FK RESTRICT
  local_deleted_at                  si scrive una volta sola
  viva                              GENERATED ALWAYS AS (product_id IS NOT NULL) STORED

shopify_product_links               ← DA QUANDO A QUANDO è stato collegato
  id · tenant_id · identity_id
  original_product_id               denormalizzato, e una FK composita gli impedisce di mentire
  status            active | remotely_deleted | unlinked
  close_reason      null | remote_delete | not_found | operator | shop_change | local_delete
  linked_at · closed_at
  last_event_at · last_event_triggered_at
  richiede_viva     GENERATED ALWAYS AS (CASE WHEN status='active' THEN true END) STORED

shopify_variant_identities          ← due identificativi remoti, non uno
  … + shopify_variant_gid · shopify_inventory_item_gid
  product_identity_id · original_variant_id · original_product_id
  variant_id · product_id           i due riferimenti vivi, che si sganciano INSIEME

shopify_variant_links               ← come sopra, più product_link_id (il periodo padre)
```

#### ⭐ L'appartenenza è scritta DUE VOLTE, e la distinzione è tutto il modello

|                       |                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `original_product_id` | **dato storico**, come uno snapshot documentale. Immutabile, **senza chiave esterna**, sopravvive alla purga |
| `product_id`          | **riferimento vivo**. Nullable, FK `RESTRICT`. Si azzera alla purga, e da lì la FK non verifica più nulla    |

⚠️ **Ciò che quella FK smette di garantire lo garantisce la FK diretta sul tenant**, che
resta `NOT NULL`: una riga sganciata non diventa senza padrone.

⭐ **E `original_product_id` è ciò che blocca la ricreazione automatica**: l'identità
rimane, quindi un GID già visto non torna assegnabile a un articolo diverso, nemmeno dopo
che l'anagrafica locale è stata eliminata. È il requisito che l'eliminazione definitiva
doveva soddisfare, e la ragione per cui la colonna non porta una FK.

#### ⛔ `superseded_by_link_id` NON esiste più

Era stato deciso il 06/09/2026 come «l'esistenza di un successore, e quale». La
ristrutturazione del 07/09 lo ha superato: **la ripubblicazione è una seconda identità
sullo stesso `original_product_id`**, e i periodi di un'identità si susseguono nel tempo.
Un successore da indicare non c'è — si leggono ordinati per `linked_at`.

⚠️ Cade con lui il CHECK «un link non punta a se stesso», e cade il problema che esso non
risolveva: il ciclo fra due righe, che un vincolo di riga non può vedere. **La garanzia
applicativa «nessun ciclo» non serve più a nessuno**, perché non c'è più il puntatore che
poteva formarne uno.

#### Unicità — cinque garanzie, e adesso stanno su DUE tabelle

⭐ **Le garanzie non sono cambiate: è cambiato dove vivono.** Le prime due, e la quinta,
riguardano l'**identità remota** e stanno sulle tabelle delle identità; la terza e la
quarta riguardano il **collegamento attivo** e stanno sui periodi.

| #   | Garanzia                                                  | Indice, e su quale tabella                                                    |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | un solo record, **storico o corrente**, per GID prodotto  | `UNIQUE (shop_id, shopify_product_gid)` su **identities** — su TUTTE le righe |
| 2   | un solo record, **storico o corrente**, per GID variante  | `UNIQUE (shop_id, shopify_variant_gid)` su **identities** — idem              |
| 3   | un solo collegamento `active` per **anagrafica** prodotto | `UNIQUE (original_product_id) WHERE status = 'active'` su **links**, parziale |
| 4   | un solo collegamento `active` per **anagrafica** variante | `UNIQUE (original_variant_id) WHERE status = 'active'` su **links**, parziale |
| 5   | variante ↔ inventory item è uno-a-uno dentro il negozio   | `UNIQUE (shop_id, shopify_inventory_item_gid)` su **identities**              |

⭐ **Le garanzie 3-4 poggiano su `original_*`, NON su `product_id`/`variant_id`**, ed è la
conseguenza diretta del nullable: un indice parziale su una colonna che dopo la purga vale
`NULL` smetterebbe di garantire qualcosa proprio per le righe che più contano. La colonna
storica non si azzera mai, quindi l'indice morde sempre.

⭐ **Una sesta unicità, tecnica**: `UNIQUE (identity_id) WHERE status = 'active'` — un solo
periodo vivo per identità. Non è una garanzia di dominio nuova, è il modo in cui i periodi
esprimono «adesso è collegato una volta sola».

⚠️ La quinta colonna è nullable e PostgreSQL non fa collidere i NULL: il vincolo morde solo
sulle varianti con inventory item noto.

⭐ **E le sedi hanno le proprie**, con la stessa forma — `UNIQUE (shop_id,
shopify_location_gid)` e `UNIQUE (location_id)` sulla **coppia**, entrambi su tutte le
righe: vedi §1.13.3 e §1.13.6.

⭐ **Un indice unico parziale è già un pattern del progetto**: usato da
`cash_sessions_open_per_location` e `vat_codes_tenant_default_key`. Non introduce una
tecnica nuova.

#### ⛔ Un indice unico non basta: la concorrenza vuole una FK, non un trigger

> **Un periodo `active` esige un'identità VIVA, e a esigerlo è una CHIAVE ESTERNA.**

⚠️ **Misurato il 07/09/2026** su due connessioni vere: con la sola guardia procedurale — un
trigger, o un controllo nel servizio — due sessioni si incrociano, **entrambe committano**,
e resta un periodo attivo su un'identità eliminata. Un trigger legge lo stato con il
proprio snapshot e non vede la transazione dell'altro.

⭐ **Il rimedio è dichiarativo**, e PostgreSQL lo serializza da sé:

```sql
-- sull'identità: vero quando l'anagrafica c'è ancora
viva          GENERATED ALWAYS AS (product_id IS NOT NULL) STORED
UNIQUE (id, viva)

-- sul periodo: `true` se attivo, NULL se chiuso
richiede_viva GENERATED ALWAYS AS (CASE WHEN status='active' THEN true END) STORED
FOREIGN KEY (identity_id, richiede_viva)
  REFERENCES shopify_product_identities (id, viva)
  ON DELETE RESTRICT ON UPDATE RESTRICT
```

⭐ **`MATCH SIMPLE` qui lavora a favore**, per una volta: su un periodo **chiuso**
`richiede_viva` è `NULL`, quindi la FK non verifica nulla e **la storia sopravvive alla
purga**. Su un periodo **attivo** vale `true`, e allora esige `(id, true)` — cioè
un'identità viva.

⚠️ **È lo stesso `MATCH SIMPLE` che rendeva inerte la vecchia FK su `product_id`.** Non è
una contraddizione: là l'inerzia era un difetto perché il vincolo doveva valere sempre,
qui è la funzione perché il vincolo deve valere **solo** sui periodi attivi. La differenza
è che ora è **dichiarata**, non subita.

⚠️ **Verificato in concorrenza, nei due ordini**
(`shopify-articoli-identita.integration-spec.ts`): una transazione riesce, l'altra è
**rifiutata dalla FK** — e la prova esige il nome del vincolo, perché un rifiuto
dell'indice unico dei periodi attivi direbbe la cosa giusta per la ragione sbagliata.

#### Stati — tre, non quattro

> ⛔ **Corretto il 06/09/2026: `superseded` NON è uno stato.** Rappresentava solo
> l'esistenza di un successore, e usarlo come stato **cancella la causa vera**: un link
> chiuso perché il prodotto è stato eliminato su Shopify, dopo una ripubblicazione,
> diventerebbe genericamente «sostituito».

| Colonna        | Che cosa dice                                                            | Quando cambia                      |
| -------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| `status`       | dov'è il collegamento adesso: `active` · `remotely_deleted` · `unlinked` | una volta, alla chiusura — mai più |
| `close_reason` | **perché** si è chiuso                                                   | fissata alla chiusura, non cambia  |

⭐ **Ripubblicazione, corretta**: il vecchio periodo resta `remotely_deleted` con la sua
`close_reason` originale (`remote_delete` o `not_found`) — **non la perde mai**. Nasce
un'identità **nuova** con il GID nuovo, e su di lei un periodo `active`. Nessuna
riapertura, nessuna riscrittura della causale.

⭐ **Ripresa della stessa identità** (stesso GID che torna disponibile): non nasce una
seconda identità, nasce un **periodo nuovo** sulla stessa. È la distinzione che il modello
a due tabelle rende esprimibile e che quello a una non poteva.

⛔ **La ripresa riguarda un'anagrafica ANCORA ESISTENTE, e vuole un'azione esplicita
autorizzata.** Non è il ripristino di un'identità eliminata definitivamente: quella ha
`local_deleted_at` valorizzato e `product_id` a `NULL`, e su di lei un periodo `active` è
**impossibile** — lo vietano il trigger `…_immutabile` (che rifiuta sia di riagganciare sia
di riscrivere la data) e la FK `…_identita_viva_fkey`, ciascuno da solo. Confondere le due
cose è l'errore che fa sembrare aperta una regola che il database applica già.

⚠️ **Il permesso non è «l'operatore»**: §7.4 chiede un permesso applicativo esplicito, con
default a titolare/amministratore, e la ripresa di un collegamento è della stessa famiglia.

⛔ **L'immutabilità la impongono TRIGGER, non i soli UNIQUE**, e la distinzione è stata
misurata: i vincoli unici impediscono di **inserire** un doppione, non di **modificare** una
riga esistente. `shopify_product_identities_immutabile` rifiuta di spostare il GID o
l'appartenenza originaria; `shopify_periodo_immutabile` rifiuta di riscrivere una causale o
di riaprire un periodo chiuso.

#### ⭐ Una sesta causale: `local_delete`

Ammessa **solo** su prodotti e varianti, e vietata sulle sedi da un CHECK a lista bianca:
una sede non si elimina definitivamente finché ha una storia (§1.13.4). È la causale con
cui si chiude un periodo quando è l'**anagrafica locale** a sparire — distinta da
`remote_delete`, che dice che a sparire è stato il prodotto su Shopify.

#### I CHECK — vanno letti come un gruppo

```sql
-- Sui PERIODI · 1-2: bidirezionale. Attivo ⇒ nessuna chiusura; chiuso ⇒ chiusura completa.
CHECK (status <> 'active' OR (closed_at IS NULL AND close_reason IS NULL))
CHECK (status =  'active' OR (closed_at IS NOT NULL AND close_reason IS NOT NULL))

-- 3-4: la causale ammessa dipende dallo stato.
CHECK (status <> 'remotely_deleted' OR close_reason IN ('remote_delete', 'not_found'))
CHECK (status <> 'unlinked' OR close_reason IN ('operator', 'shop_change', 'local_delete'))

-- 5: un periodo non si chiude prima di aprirsi.
CHECK (closed_at IS NULL OR closed_at >= linked_at)

-- Sulle IDENTITÀ · il riferimento vivo, quando c'è, È l'articolo originario.
CHECK (product_id IS NULL OR product_id = original_product_id)
-- O viva, o eliminata localmente. Nessun terzo stato.
CHECK ((product_id IS NULL) = (local_deleted_at IS NOT NULL))
-- E il GID ha una forma, non è una stringa qualunque.
CHECK (shopify_product_gid ~ '^gid://shopify/Product/[0-9]+$')
```

⚠️ **I CHECK 3 e 4 non reggono da soli**: `close_reason IN (...)` su `NULL` vale `NULL`, e un
CHECK fallisce solo su `FALSE` — un `close_reason` lasciato vuoto su un periodo
`remotely_deleted` supererebbe 3-4 in silenzio. È il **CHECK 2** a chiudere il varco,
imponendo `close_reason NOT NULL` per ogni stato diverso da `active`. **Vanno scritti e
letti insieme**: un giorno il 2 può sembrare ridondante rispetto a 3-4 e venire tolto per
pulizia — non lo è.

⭐ **Il CHECK «stato coerente» è quello che tiene onesta l'eliminazione**: senza,
esisterebbe la riga «sganciata ma senza data di eliminazione», che è lo stato in cui non si
sa più se l'articolo è stato eliminato o se qualcuno ha semplicemente azzerato una colonna.

#### Le FK

```text
-- IDENTITÀ
FK (tenant_id)             → tenants(id)
FK (shop_id, tenant_id)    → shopify_shops(id, tenant_id)
FK (product_id, tenant_id) → products(id, tenant_id)          nullable ⇒ inerte dopo la purga
   original_product_id                                        NESSUNA FK, per costruzione

-- PERIODI
FK (identity_id, tenant_id)          → identities(id, tenant_id)          ON DELETE RESTRICT
FK (identity_id, original_product_id)→ identities(id, original_product_id) la denormalizzazione non mente
FK (identity_id, richiede_viva)      → identities(id, viva)               ON DELETE/UPDATE RESTRICT

-- VARIANTE, in più
FK (product_identity_id, tenant_id)  → product_identities(id, tenant_id)
FK (product_link_id)                 → product_links(id)                  il periodo padre
```

⚠️ **`ON DELETE RESTRICT` esplicito ovunque.** Mai `SET NULL` (perderebbe il legame senza
che nessuno se ne accorga) e mai `CASCADE` (su una catena di ripubblicazioni propagherebbe
una cancellazione lungo tutta la storia).

⭐ **E la FK del padre variante confronta colonne che non si azzerano mai**
(`original_product_id`), quindi regge anche quando i riferimenti vivi sono già stati
sganciati — che è esattamente il momento in cui una FK sui riferimenti vivi smetterebbe di
dire qualcosa.

**Ausiliarie sulle tabelle esistenti**, additive:

```text
products          UNIQUE (id, tenant_id)
product_variants  UNIQUE (id, tenant_id) · UNIQUE (id, product_id)
locations         UNIQUE (id, tenant_id)
```

#### ⛔ La storia non si CANCELLA — e il TRUNCATE non è un DELETE

⚠️ **Misurato il 07/09/2026**: il `DELETE` di un periodo passava — nessun vincolo lo
guardava — e da lì passava anche quello dell'identità, con lo stesso GID che rinasceva su
un altro prodotto. È la stessa asimmetria già vista sulle sedi («i due UNIQUE impediscono di
INSERIRE, non di MODIFICARE») un passo più in là: **non impediscono nemmeno di CANCELLARE**.

`BEFORE DELETE` e `BEFORE TRUNCATE` su identità e periodi delle due famiglie, più i periodi
di sede: dieci trigger. `BEFORE TRUNCATE` è `FOR EACH STATEMENT` ed è **separato** dal
`BEFORE DELETE`: un `TRUNCATE` non fa scattare i trigger di riga.

⛔ **La COPPIA di sede non li ha, ed è deliberato**: una coppia **senza periodi** deve
restare cancellabile, perché è la correzione dell'abbinamento iniziale sbagliato (§1.13.6).

⚠️ **I due divieti non hanno la stessa robustezza, e va saputo**: quelli sulle **identità**
(riaggancio, riscrittura della data) poggiano su un **trigger utente**, spegnibile
dall'owner; quello sui **periodi** poggia su una **FK**, che per essere tolta richiede il
superuser. ⛔ E `check:storico-non-cancellabile` verifica oggi solo `mai_delete` /
`mai_truncate`: se qualcuno cancellasse i trigger `…_immutabile` non arrossirebbe niente.

⛔ **E non è una barriera di PRIVILEGI.** L'API si connette come **owner** del database — la
stessa scelta per cui scavalca la RLS — quindi `ALTER TABLE … DISABLE TRIGGER` da un
servizio riuscirebbe. Questi trigger fermano la cancellazione **accidentale**: un `CASCADE`
che arriva da `tenants`, un `TRUNCATE` di pulizia, una query di manutenzione. A fermare un
servizio che li spegnesse deliberatamente è una **guardia statica**,
`npm run check:storico-non-cancellabile`, che fa fallire il lint se un `DISABLE TRIGGER`
compare fuori da `api/src/test/`. Ferma chi lo scrive, non chi lo esegue — ed è tutto ciò
che una guardia può fare.

#### ⚠️ Il Client Prisma non conosce l'indice parziale, i CHECK né le colonne generate

Verificato: Prisma legge e scrive la tabella normalmente, ma non valida questi vincoli — una
violazione arriva come errore PostgreSQL grezzo (`23505`, `23514`, `23503`), non come `P2002`
con `meta.target` leggibile, e va tradotta a mano nel servizio applicativo.

⚠️ **Le colonne generate (`viva`, `richiede_viva`, `attivo`) non compaiono nello
`schema.prisma`**: Prisma non le esprime, e non deve — sono calcolate dal database. Vivono
nella migration, e i modelli le dichiarano nei commenti `///`.

⭐ **La mitigazione è già una convenzione del progetto**: un commento `///` sul campo che
dichiara dove vive il vincolo che Prisma non può esprimere — usata su `PaymentOption`,
`CashSession`, `CashSessionDeviceChange`. È applicata identica qui.

#### ⏸ Stato: il modello esiste, i servizi non lo usano ancora

| Fatto                                                                   | Non fatto                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| schema, migration, vincoli, trigger, RLS e REVOKE                       | **backfill** dai dati esistenti (§8.5.8)                                |
| collaudo locale: migration da vuoto, da copia con dati, rollback a metà | **passaggio dei lettori** al nuovo modello: i servizi leggono ancora    |
| falsificazione dei vincoli, concorrenza nei due ordini                  | le colonne-cache su `Product`/`ProductVariant`                          |
| ⛔ nessuna applicazione al database CONDIVISO                           | la **funzione operativa** di eliminazione definitiva, e il suo registro |

⚠️ **Finché il backfill non c'è, queste tabelle sono vuote**: nessuna lettura le interroga e
nessuna scrittura le popola. Il modello è verificato, non ancora in servizio.

⛔ **Un guasto muto che si manifesterà alla PRIMA riga scritta** — misurato l'08/09/2026,
e **più largo di come era stato scritto lo stesso giorno**. Qui c'era «fallirà
`DELETE /admin/tenants/:id`», come se riguardasse la sola cancellazione amministrativa. La
causa è una primitiva **condivisa**, `purgeTenantBackupData`, e i suoi chiamanti sono **due**:

```text
api/src/admin/tenant-delete.util.ts:11                     cancellazione amministrativa
api/src/tenant/tenant-backup/…-import.service.ts:148       RIPRISTINO di un backup
```

⚠️ **Quindi alla prima identità scritta si rompe anche il RIPRISTINO di qualunque backup**,
compreso uno fatto cinque minuti prima: il ripristino purga e reinserisce, e l'ordine di
cancellazione contiene `products`, `productVariants` e `locations` — che le identità e le
coppie trattengono con `RESTRICT`.

⛔ **E per identità e periodi non basta aggiungerli all'ordine di cancellazione**, perché
`shopify_storico_non_si_cancella` vieta ogni DELETE. Le tre operazioni — backup applicativo,
ripristino, cancellazione del tenant — vanno trattate **separatamente**: la proposta completa,
con l'effetto sulle esclusioni registrate dopo la data del backup, è in `docs/DA-FARE.md` §10.

⚠️ Oggi non si vede solo perché le tabelle sono vuote — cioè è esattamente il tipo di difetto
che si scopre in fase 2.

### 8.5.3 Registro delle consegne webhook — un INBOX, non solo una deduplica

> ✅ **Decisione confermata** (06/09/2026) — corretta rispetto alla proposta del 06/09 mattina

⛔ **Una sola colonna `last_event_dedupe_key` sul link non basta**: perdeva ogni consegna
precedente, e non distingueva «mai arrivato» da «arrivato e mai elaborato» da «arrivato e
fallito». Il registro deve essere un **inbox affidabile**, con la consegna come entità propria.

```text
shopify_webhook_deliveries
  id · tenant_id · shop_id (FK shopify_shops)
  webhook_id         X-Shopify-Webhook-Id      — identità della consegna, per la deduplica
  event_id           X-Shopify-Event-Id        nullable — per correlare consegne della STESSA azione
  topic · api_version
  triggered_at       X-Shopify-Triggered-At    — l'istante di ORIGINE dell'evento, per l'ordine
  received_at
  processing_started_at · processed_at
  status             received | processing | processed | failed
  attempt_count      Int, default 0
  last_error         nullable

  UNIQUE (shop_id, webhook_id)
  INDEX  (tenant_id, topic, triggered_at DESC)
  INDEX  (status, processing_started_at)        ← per trovare le righe scadute o bloccate
```

⭐ **`X-Shopify-Webhook-Id` deduplica, `X-Shopify-Triggered-At` ordina, `X-Shopify-Event-Id`
correla** — tre header, tre usi distinti. Più consegne della stessa azione commerciale (un
prodotto e le sue varianti aggiornati nello stesso salvataggio su Shopify) possono condividere
lo stesso `event_id`: utile per capire che due `products/update` ravvicinati sono la stessa
causa, non due modifiche indipendenti.

#### Il ciclo di vita di una consegna

1. **HMAC verificato PRIMA di ogni altra cosa** — se non torna, la richiesta si rifiuta e non
   si scrive nulla nel registro: un evento non autenticato non è una consegna, è rumore;
2. `INSERT … ON CONFLICT (shop_id, webhook_id) DO NOTHING` con `status = 'received'` —
   **nella stessa transazione** che verifica l'HMAC;
3. se l'`INSERT` non inserisce nulla (conflitto): è un duplicato. Si risponde `200`
   **senza ripetere alcun effetto**, e senza toccare lo stato della riga esistente — se
   quella riga è ancora `received` o `processing`, il duplicato **non la fa apparire
   conclusa**;
4. se l'`INSERT` inserisce: un worker (o lo stesso processo, con un `UPDATE … WHERE status =
'received' RETURNING …`) marca `processing`, con `processing_started_at`;
5. **l'acquisizione è per riga**: `UPDATE shopify_webhook_deliveries SET status = 'processing',
processing_started_at = now() WHERE id = $1 AND status = 'received' RETURNING id` — se due
   worker tentano la stessa riga, solo uno la trova ancora `received` e la acquisisce; l'altro
   riceve zero righe e si ritira. Nessun lock esplicito necessario: la `WHERE` sullo stato
   basta;
6. si applicano gli effetti (§8.5.4);
7. **successo** → `processed`, `processed_at`; **fallimento** → `failed`, `last_error`,
   `attempt_count += 1`.

#### Recupero — tre casi, tre codici diversi

| Riga trovata                             | Significa                                                  | Azione                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `received` da più del timeout previsto   | mai stata presa in carico: crash fra INSERT e acquisizione | si riacquisisce come una riga nuova                                                                                                     |
| `processing` da più del timeout previsto | il worker che l'aveva presa è morto a metà                 | si riacquisisce: **gli effetti applicati devono essere idempotenti** (§8.5.2 già lo richiede: chiudere un link già chiuso non fa nulla) |
| `failed`                                 | elaborata e fallita                                        | riprovabile, manuale o a soglia di `attempt_count`                                                                                      |

⚠️ **Il timeout non è deciso qui**: è un parametro tecnico, non funzionale. La regola
funzionale è che una riga scaduta **si riprende**, non che si abbandona.

### 8.5.4 Risoluzione: entità mancante, eventi fuori ordine, riconciliazione

> ✅ **Decisione confermata** (06/09/2026)

#### Import e push: dove serve interrogare i link — censito il 06/09/2026

| Punto oggi                                                        | Comportamento                       | Con il modello                                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `shopify-product-pull.service.ts:344` — prodotto, primo import    | `findFirst → null → create`         | prima si interroga `shopify_product_links` per `(shop_id, shopify_product_id)`: **presente e chiuso** → si scarta; **assente** → import normale |
| `:366`, `:439` — variante                                         | idem                                | idem su `shopify_variant_links`                                                                                                                 |
| `persistShopifyIds` (push, `:1003-1018`) — ricollegamento per SKU | collega senza verificare lo storico | **rifiuta** se lo SKU risolve a un id remoto con link chiuso: è un'ambiguità, si segnala per riconciliazione, non si collega                    |
| `shopify-variant-match.util.ts` — SKU → barcode → opzioni         | idem                                | idem                                                                                                                                            |

⛔ **Nessun punto oggi azzera `shopifyProductId`/`shopifyVariantId`** (verificato): il rischio
di «errore remoto → creazione Shopify» non esiste nel codice attuale. Con il modello, comunque,
la creazione va condizionata all'**assenza di un link non chiuso**, non alla sola assenza della
colonna-cache — perché è il link, non la colonna, la fonte (§8.5.5).

#### Assenza remota: che cosa la dichiara — e che cosa NON deve poterla dichiarare

Chiude un collegamento **solo**:

- un nodo GraphQL che risolve a **`null`**, con `errors` assente e `userErrors` vuoto;
- un `404` REST **di risorsa**, con corpo nel formato d'errore Shopify, su una versione API
  valida e un token accettato.

**Non chiude mai**: `401` · `403` · `429` · `5xx` · timeout · errori di rete · `errors` GraphQL
di schema/versione/campo · `userErrors` · un `404` che in realtà è di **endpoint o versione**
(una versione API scaduta risponde `404` a qualunque path, indistinguibile a occhio da un
prodotto assente).

#### Come si rileva una variante eliminata — la sequenza, per intero

> ✅ **Decisione confermata** (06/09/2026)

Shopify **non ha un topic di cancellazione variante** (verificato sullo shop di sviluppo il
06/09: gli unici topic con `VARIANT` nel nome sono `VARIANTS_IN_STOCK` e
`VARIANTS_OUT_OF_STOCK`, che riguardano lo stock). La rilevazione è quindi una sequenza, e
va scritta per esteso perché ogni passo saltato produce una chiusura sbagliata:

1. **arriva un `products/update`** per il prodotto;
2. **si rilegge l'elenco remoto COMPLETO** delle varianti di quel prodotto — non ci si ferma al
   payload, che è parziale per contratto (§13.1);
3. **si confrontano** gli id remoti letti con i collegamenti **attivi** di quel prodotto
   (`shopify_variant_links`, `status = 'active'`);
4. **si chiudono soltanto le varianti realmente assenti** dall'elenco completo, con
   `close_reason = remote_delete`.

⛔ **Il passo 2 non è un'ottimizzazione da saltare quando il payload sembra completo**: un
payload che non nomina una variante non è la prova che non esista più, ed è la differenza fra
chiudere un collegamento e perderne uno per una lettura affrettata.

#### `INVENTORY_ITEMS_DELETE` — un segnale aggiuntivo da verificare, non la prova

> 🔧 **Proposta tecnica, non decisione** — corretto il 06/09/2026

Eliminando una variante, Shopify elimina anche il suo inventory item — osservato sullo shop di
sviluppo come topic disponibile (§8.5, ricognizione del 06/09). VestiFlow conserva già
`shopifyInventoryItemId` sulla variante, quindi l'evento sarebbe risolvibile senza rileggere
nulla.

⛔ **Ma è solo un innesco per una verifica mirata, non una prova di cancellazione.** Un
inventory item può sparire per altre ragioni che il contratto non garantisce essere assenti
(riorganizzazioni interne Shopify, per esempio). La cancellazione di una **variante** si
conferma **rileggendo l'elenco remoto completo del prodotto**, normalmente in risposta a un
`products/update` — mai da un payload parziale, e mai dal solo `INVENTORY_ITEMS_DELETE`. Quel
topic, se sottoscritto, serve solo ad **accelerare** la verifica, non a sostituirla.

#### Fuori ordine — tre categorie

| Categoria                                      | Esempio                              | Regola                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **terminale su un id preciso**                 | `products/delete`                    | si applica **sempre** al link di quell'id remoto: la cancellazione non si «supera» con un aggiornamento successivo                        |
| **aggiornamento sullo stesso id**              | `products/update`                    | si applica **solo se** `triggered_at` dell'evento è più recente di `last_event_triggered_at` del link; altrimenti si scarta come obsoleto |
| **evento sul vecchio id dopo ripubblicazione** | `products/delete` del GID sostituito | risolve al vecchio link, già chiuso: nessun effetto, il nuovo link — id remoto diverso — non viene toccato                                |

⭐ **La chiave di risoluzione è sempre l'id remoto**, mai l'entità locale: è ciò che rende la
terza riga vera per costruzione.

#### Riconciliazione — obbligatoria, non sostituibile dai webhook

Periodica e su richiesta: confronta l'elenco remoto completo con i link `active` e apre una
voce per ogni divergenza. **Necessaria**, non opzionale: misurato il 06/09/2026, **cinque
webhook su otto non sono nemmeno sottoscrivibili su questo negozio** (§8.5.6) — un sistema che
si fidasse solo dei webhook non si accorgerebbe mai di una cancellazione ordini, perché gli
ordini non arrivano affatto via webhook qui.

#### Ordini e resi risolvono id storici, sempre

`applyOrderFromShopify` e i suoi analoghi **non devono filtrare per `status` del link**: la
risoluzione è «trova il link per id remoto, qualunque sia il suo stato, e prendi l'entità
locale». È l'unica lettura che ignora `status` di proposito — coerente con §13.1.

### 8.5.5 Fonte di verità

> ✅ **Decisione confermata** (06/09/2026)

> **Le tabelle di collegamento sono la fonte canonica. `shopifyProductId`, `shopifyVariantId` e
> `shopifyInventoryItemId` restano come cache, aggiornate nella STESSA transazione del link.**

| Tranche            | Stato della duplicazione                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| 1 (questo modello) | link canonici + colonne-cache scritte insieme; ogni lettura **nuova** passa dai link |
| 2-6                | i lettori esistenti migrano ai link uno alla volta                                   |
| 7                  | ⭐ **le colonne-cache si rimuovono**, con una guardia che ne impedisca il ritorno    |

⛔ **La rimozione non è un'intenzione: è la tranche 7 già fissata nella sequenza.** Due fonti
autorevoli a tempo indeterminato sono il difetto che questo modello esiste per chiudere — non
si dichiara qui una data, ma non si dichiara nemmeno un «per sempre» implicito.

### 8.5.6 Cinque webhook su otto non sono registrabili: prerequisito di collaudo

> ⚠️ **Prerequisito per il collaudo completo e per la futura entrata in esercizio — misurato il
> 06/09/2026.** ⛔ **Non è un blocco allo sviluppo del ciclo di vita del catalogo**: prodotti e
> varianti si progettano e si costruiscono senza aspettare questa approvazione.

Verificato nel codice, non dedotto: `registerWebhooks` (`shopify-admin.client.ts:212`) **tenta
la registrazione di tutti gli 8 topic**, inclusi i cinque protetti
(`orders/create`, `orders/updated`, `orders/cancelled`, `customers/create`,
`customers/update`). `SHOPIFY_PROTECTED_WEBHOOK_TOPICS` non filtra nulla **prima** della
chiamata: viene letto solo **dopo**, in `shopify-oauth.service.ts:460-462`, per classificare un
fallimento già avvenuto.

**L'evidenza che il fallimento è di Shopify, non di VestiFlow** — tre citazioni dal codice:

1. `shopify-webhook-topics.ts:27` — _«Richiedono Protected customer data approval su Shopify
   Partners.»_
2. `shopify-oauth.service.ts:467-472` — messaggio salvato quando i topic protetti falliscono:
   _«Webhook giacenze attivo. Ordini e clienti richiedono permesso Protected customer data su
   Shopify Partners (app VestiFlow): riconnetti dopo averlo abilitato.»_
   (`code: webhook_partial_registration`)
3. `shopify-oauth.service.ts:475-481` — se falliscono anche le giacenze: _«Webhook
   ordini/clienti non registrati: Shopify richiede Protected customer data sull'app VestiFlow…»_
   (`code: webhook_registration_failed`)

⭐ **La limitazione arriva in UI**: `shopify-integration-panel.component.ts:295` legge
`lastError.code === 'webhook_partial_registration'` per mostrare l'esito parziale
all'operatore — non è silenziosa.

**Che cosa comporta, con precisione**: §8.5.4 (risoluzione ordini/resi su id storici) e §13.1
presuppongono che gli eventi commerciali **arrivino**. Senza l'approvazione «Protected customer
data», ordini e clienti non arrivano via webhook in nessuna forma — non in ritardo, non
parziali: mai. Nessuna correzione di codice lo risolve: serve l'approvazione su Shopify
Partners, un'azione **esterna al repository**.

⛔ **E la riconciliazione NON lo sostituisce.** §8.5.4 confronta il **catalogo** remoto con i
link attivi, quindi trova prodotti e varianti mancanti anche senza webhook. Ordini, resi e
clienti sono un'altra materia: nessun confronto di catalogo li ricostruisce. Chi legge la
riconciliazione come rete di sicurezza generale sbaglia il perimetro.

**Quando conta**: è un prerequisito del **collaudo completo** e della **futura entrata in
esercizio**, non una condizione per costruire il ciclo di vita del catalogo. Registrato in
`DA-FARE.md` come prerequisito, con la stessa distinzione.

### 8.5.7 Sequenza di lavoro e gate di collaudo

> ✅ **Decisione confermata** (06/09/2026)

⭐ **L'ordine non è un'opinione organizzativa**: ogni passo esiste perché il successivo, senza
di lui, dovrebbe indovinare qualcosa.

| #   | Passo                                                                                                      | Perché sta qui                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | **patch di sicurezza contro la cancellazione remota**                                                      | indipendente da tutto il resto: toglie una capacità, non ne aggiunge                 |
| 2   | **identità immutabile del negozio e collegamenti storici** (§8.5.1-§8.5.2)                                 | tutto il resto ha bisogno di dove scrivere lo stato di un collegamento               |
| 3   | **backfill verificato** (§8.5.8)                                                                           | i link devono esistere per i dati già collegati, o ogni lettura nuova trova il vuoto |
| 4   | **inbox affidabile delle consegne webhook** (§8.5.3)                                                       | prima di sottoscrivere un evento nuovo serve dove registrarlo senza perderlo         |
| 5   | **`products/delete`, classificazione dell'assenza remota, blocco della ricreazione** (§8.5.4, §11.7-§11.8) | il primo consumatore vero dell'inbox e dei link                                      |
| 6   | **riconciliazione prodotti e varianti, risoluzione degli id storici** (§8.5.4)                             | la rete che non dipende dai webhook                                                  |
| 7   | 🔬 **collaudo mutativo sullo shop di sviluppo**                                                            | ⭐ **gate operativo, non necessariamente un commit** — vedi sotto                    |
| 8   | **decisione tecnica sulla forma del ritiro** (§0-bis voce 1)                                               | si decide **dopo** il collaudo, con i fatti in mano                                  |
| 9   | **comandi Disattiva / Riattiva / Ritira / Rimetti in vendita** (§1.11)                                     | il primo passo che cambia ciò che l'operatore vede                                   |
| 10  | **gestione massiva** (§1.12)                                                                               | gli stessi comandi, in blocco                                                        |
| 11  | **inventario GraphQL**                                                                                     | indipendente dal ciclo di vita, ma dopo di esso                                      |
| 12  | **rimozione delle colonne-cache** (§8.5.5)                                                                 | ⛔ solo **dopo** che tutti i lettori sono migrati ai link                            |

#### Il gate di collaudo (passo 7) — che cosa deve produrre

⛔ **Nessun comando di ritiro si implementa prima di questo gate**, perché §0-bis voce 1 — la
forma tecnica del ritiro di una singola variante — non è decidibile leggendo la documentazione
Shopify: va osservata.

È un **collaudo mutativo su entità di prova**, con fotografia iniziale, una variazione alla
volta, verifica dal punto di vista del cliente e ripristino dello stato iniziale. Due prove
distinte, perché una variante non ha uno stato `DRAFT` proprio:

| Entità       | Che cosa si prova                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **prodotto** | `DRAFT` · unpublish · **ripristino** — quale forma rende non acquistabile, e che cosa serve sapere per tornare esattamente allo stato di prima |
| **variante** | ritiro per **pubblicazione** · visibilità effettiva per il cliente · **ripristino**                                                            |

⚠️ **Il ripristino fa parte della prova, non è il riordino dopo**: la domanda del gate è quanto
fedelmente si torna indietro, e senza provarlo non la si è misurata.

### 8.5.8 Migration e backfill

> ✅ **Decisione confermata** (06/09/2026) — forma del rilascio decisa il 07/09/2026

#### ⭐ Rilascio ESPANDIBILE A FASI, non una migration atomica — deciso il 07/09/2026

⛔ **L'atomica è stata valutata e scartata, e non per prudenza**: il suo passo «collegamento
della connessione al negozio» richiede lo `shop_gid`, che **non esiste nei dati locali** — non
è in `ShopifyConnection`, non è in `ShopifyCredential`, e `getShop()` (`shopify-admin.client.ts:106`)
lo scarta leggendo solo `{ name }`. Una migration atomica dovrebbe interrogare Shopify, cosa
che una migration non fa.

Le cinque fasi, in quest'ordine:

| #   | Fase                                                                                      | Vincolo                                                 |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **schema**: tabelle, enum, indici, FK, CHECK — con `shop_gid` **nullable**                | RLS e REVOKE **nella stessa migration di ogni tabella** |
| 2   | **acquisizione esplicita dell'identità**: `shop_gid` letto e scritto per ogni connessione | passo dichiarato, mai nascosto dentro una migration     |
| 3   | **backfill dei collegamenti**                                                             | preceduto dai controlli bloccanti                       |
| 4   | **verifica completa**: conteggi prima/dopo, nessun id ambiguo                             | —                                                       |
| 5   | **`NOT NULL` e unicità globale**                                                          | solo qui, e solo se 2-4 sono verdi                      |

⭐ **Il rischio di fermarsi a metà si chiude con lo SCHEMA, non con l'atomicità**: se i campi
identitari nascono nullable e le tabelle non sono ancora canoniche, un'interruzione lascia uno
stato **incompleto ma coerente**. Con l'atomica lascerebbe uno stato **impossibile**.

⛔ **Le tabelle NON sono fonte canonica** finché il backfill non è completo e verificato **e**
i lettori di push e pull non sono migrati (§8.5.5). Fino ad allora sono una fonte in
costruzione, e vanno descritte così anche a chi legge il codice.

**Una sola migration** per la creazione: enum, le **cinque** tabelle — `shopify_shops`,
`shopify_product_links`, `shopify_variant_links`, `shopify_location_pairs` e
`shopify_location_links` — gli indici
(compresi i parziali), le ausiliarie su `products`/`product_variants`/`locations`, la colonna
`shopify_connections.shop_id`, le FK composite, i `CHECK`, **e nello stesso file `ENABLE ROW
LEVEL SECURITY` più le `REVOKE`**. ⛔ Non deve esistere una finestra, nemmeno di una migration,
in cui una tabella applicativa è priva di RLS.

⚠️ **Erano «le tre tabelle», ed erano tre per davvero fino al 07/09/2026**: §1.13 ha aggiunto
lo storico delle sedi lo stesso giorno, e questa riga era rimasta indietro di una decisione.
Le tabelle si **nominano** invece di contarle, così la prossima aggiunta non lascia un numero
a smentire un elenco.

⭐ **`shopify_connections.shop_id` è materia di fase 1** e non era stata scritta: senza, non
esiste modo — nel database — di sapere quale riga di `shopify_shops` sia la corrente per un
tenant, e il passo 2 della transazione di cambio negozio non ha dove scrivere. Nasce
**nullable**, come `shop_gid`, e per una ragione in più: una connessione `not_connected` non
ha alcun negozio a cui puntare, quindi il `NOT NULL` non sarebbe corretto nemmeno a regime.

**Il backfill è preceduto da controlli bloccanti.** La migration si ferma se una qualunque di
queste query restituisce righe:

1. `shopify_product_id` duplicato fra prodotti dello stesso tenant;
2. `shopify_variant_id` o `shopify_inventory_item_id` duplicato;
3. varianti collegate il cui prodotto ha un `shopifyProductId` di un altro tenant, o nullo;
4. `product_variants.tenant_id` diverso dal `tenant_id` del prodotto padre.

⛔ **Nessuna deduplica automatica, nessuna scelta euristica.** Se un duplicato esiste, lo
risolve una persona prima che la migration riparta: decidere da soli quale collegamento «vince»
è esattamente la decisione silenziosa che questo modello esiste per impedire.

### 8.6 Operazioni GraphQL ammesse

> 🔧 **Proposta tecnica da verificare**

| Intenzione                                 | Mutation primaria                                              |
| ------------------------------------------ | -------------------------------------------------------------- |
| Creazione/riallineamento completo iniziale | `productSet` con lista esplicita e anteprima                   |
| Aggiornamento soli campi prodotto          | `productUpdate`                                                |
| Creazione nuove varianti                   | `productVariantsBulkCreate`                                    |
| Aggiornamento varianti esistenti           | `productVariantsBulkUpdate` con `allowPartialUpdates: false`   |
| Ritiro di una variante                     | `publishableUnpublish` sul GID variante                        |
| Ritiro di un prodotto                      | `productUpdate` con `status: ARCHIVED`                         |
| Pubblicazione/spubblicazione per variante  | `publishablePublish` / `publishableUnpublish` sul GID variante |
| Quantità assoluta autorevole               | `inventorySetQuantities` con `@idempotent`                     |

⛔ **`productVariantsBulkDelete` e `productDelete` NON sono operazioni ammesse**, e le due
righe che le elencavano sono state tolte: VestiFlow non cancella definitivamente su Shopify
(§11.1). Restano nell'elenco delle fonti ufficiali sotto perché esistono nell'API, non perché
le si usi.

`productSet` ha semantica sostitutiva sui campi lista. Perciò:

- è ammesso nel popolamento iniziale e nei riallineamenti completi esplicitamente confermati;
- nel regime ordinario non deve essere usato per un semplice cambio nome o prezzo;
- la lista varianti non deve essere omessa o costruita da un sottoinsieme filtrato;
- una cancellazione deve sempre risultare da un comando esplicito e da una mutation dedicata.

### 8.6.1 Creazione di un articolo semplice

> 🔧 **Proposta tecnica da verificare**

1. VestiFlow crea il prodotto e la propria variante base senza conoscere Shopify.
2. Il connettore crea il prodotto Shopify.
3. Shopify restituisce il prodotto e la variante standalone obbligatoria.
4. Il connettore collega quella variante Shopify alla variante base VestiFlow.
5. Salva GID variante, inventory item, opzioni effettive e stato publication.
6. Verifica che esista una sola variante remota e un solo mapping attivo.

Non si crea una seconda variante locale, non si ignora la standalone e non si usa `Default Title` come chiave di matching.

### 8.6.2 Conversione da semplice a prodotto con varianti

> ✅ **Decisione confermata**

La conversione è un comando strutturale esplicito, non l'effetto collaterale del salvataggio delle opzioni.

1. L'operatore sceglie esplicitamente quale nuova combinazione eredita la variante base.
2. La variante base conserva identità locale, GID Shopify, giacenza e storico.
3. La standalone Shopify esistente viene aggiornata per rappresentare la combinazione scelta:
   non viene eliminata e non viene sostituita da una riga nuova.
4. Le altre combinazioni vengono create come nuove varianti locali e Shopify.
5. Nessuna combinazione viene scelta automaticamente per posizione, titolo o ordine di
   generazione.

La conversione non prosegue finché l'operatore non ha indicato quale combinazione eredita la
base. Non esiste il caso in cui la standalone venga rimossa automaticamente.

### 8.6.3 Conversione da varianti ad articolo semplice

> ✅ **Decisione confermata**

Eliminare tutte le righe visibili non è una conversione valida. Il comando dedicato `Converti
in articolo semplice` deve:

1. richiedere che resti una sola variante locale attiva;
2. far scegliere esplicitamente all'operatore quale variante diventa la variante base;
3. conservare su quella variante identità, GID Shopify, giacenza e storico;
4. non sommare o trasferire quantità, movimenti o identità delle altre varianti;
5. portare le altre varianti allo stato Non attiva o nel cestino secondo la scelta esplicita
   dell'operatore;
6. lasciare le corrispondenti varianti Shopify esistenti ma non pubblicate;
7. mantenere il mapping della variante scelta e renderla l'unica variante acquistabile;
8. verificare che nessuna altra variante remota sia acquistabile.

Poiché VestiFlow non cancella varianti su Shopify, la conversione locale a semplice **non
promette** che Shopify esponga tecnicamente `hasOnlyDefaultVariant = true`: le vecchie varianti
possono restare presenti ma non pubblicate. VestiFlow tratta l'articolo come semplice perché
una sola variante locale e remota è operativa, non perché abbia distrutto le altre sul canale.

La sequenza GraphQL esatta deve essere provata contro uno shop di sviluppo sulla versione
stabile scelta. È vietato basarla su un esempio disponibile soltanto nello schema `unstable`.

Se la verifica fallisce, il prodotto viene messo in stato di riconciliazione e non viene dichiarato allineato.

### 8.7 Migrazione del push REST

> ✅ **La migrazione è decisa** (§1.6). 🔧 **L'elenco qui sotto è la sua forma proposta**: le mutation esatte vanno provate sullo shop di sviluppo prima di essere fissate.

La migrazione comprende, senza rinvio:

- creazione prodotto REST → GraphQL;
- aggiornamento prodotto REST con varianti annidate → mutation GraphQL per intenzione;
- ritiro prodotto REST → `productUpdate` con `status: ARCHIVED` (⛔ **non** `productDelete`, §11.1);
- creazione/aggiornamento variante → mutation bulk dedicate; il ritiro passa da `publishableUnpublish`;
- push inventario `/inventory_levels/set.json` → `inventorySetQuantities`;
- letture di verifica necessarie al push → query GraphQL;
- parsing ID e persistenza GID;
- test su errori applicativi e rate limit.

Le letture REST non indispensabili al push possono essere migrate nella stessa campagna o in una tranche immediatamente successiva, ma nessun nuovo percorso deve essere aggiunto a REST.

### 8.8 Guardia contro regressioni REST

> 🔧 **Proposta tecnica da verificare**

Dopo il cutover si aggiunge `check:shopify-rest-catalog` che fallisce in presenza di nuovi usi di:

- `/products.json` per scrittura;
- `/products/{id}.json` per scrittura o cancellazione;
- payload prodotto con `variants` annidate;
- `/variants/` REST;
- `/inventory_levels/set.json`.

Le eventuali letture REST residue devono essere in allowlist nominata con ticket di rimozione.

### 8.9 Capacità di sincronizzazione — quattro requisiti CONFERMATI, 09/09/2026

> ⛔ **Questa sezione dice COSA deve succedere, non COME.** §8.3 e §8.4 restano marcate
> «proposta tecnica da verificare»: outbox, worker e Bulk Operations sono **opzioni da
> valutare**, non implementazioni autorizzate. I quattro requisiti qui sotto sono invece
> **confermati dal proprietario**, e vincolano qualunque soluzione si scelga.

⚠️ **Nessuno di questi requisiti tocca la matrice dei campi (§9.2)**, né il funzionamento
autonomo di VestiFlow senza Shopify: quelli restano quello che sono.

#### 8.9.1 Primo allineamento — nessuna priorità fra campi

> **Ogni articolo deve risultare completo per tutti i dati previsti. Un articolo importato
> parzialmente NON va dichiarato completato.**

⛔ **Nel primo allineamento non esiste una gerarchia fra campi**: non si porta prima il
prezzo e poi la descrizione dichiarando fatto l'articolo. O l'articolo è completo per tutto
ciò che la matrice prevede, o è ancora in corso.

⚠️ **La differenza con §8.9.3 è deliberata, e va letta insieme**: sotto carico ordinario
esiste una precedenza fra tipi di aggiornamento; nel primo allineamento **no**. Sono due
momenti diversi con due regole diverse, e confonderli produrrebbe cataloghi dichiarati
allineati e incompleti.

⭐ **Interruzioni e ripetizioni non devono produrre perdite né duplicazioni.** Un
allineamento interrotto si riprende; ripreso due volte non raddoppia niente. È lo stesso
criterio che §12.0 già applica all'identità — che non si deduce mai da nome, SKU o barcode —
qui esteso alla completezza.

#### 8.9.2 Attività ordinaria — il margine va MISURATO, non stimato

> **Si deve misurare il margine effettivo di sincronizzazione con Shopify, con particolare
> attenzione ai picchi improvvisi e agli aggiornamenti massivi.**

⛔ **La media giornaliera non basta**, ed è il punto: un margine che regge in media può non
reggere nell'ora in cui il negozio ricarica il magazzino o applica un listino nuovo. Una
capacità si dimensiona sui picchi, non sulla media.

⚠️ **Misura, non congettura.** Finché i numeri non ci sono, qualunque affermazione sul
«quanto regge» è un'ipotesi — comprese quelle già scritte in questo documento.

#### 8.9.3 Priorità sotto carico — prima ciò che il cliente vede

> **Disponibilità e prezzi destinati al canale hanno precedenza sulle informazioni
> descrittive, quando serve. Le operazioni meno urgenti restano conservate e vengono
> completate.**

⭐ **Precedenza, non esclusione.** Una descrizione che aspetta non è una descrizione persa:
resta in coda e si completa. Un arretrato descrittivo è accettabile; un arretrato che si
dimentica no.

⚠️ **Il criterio è che cosa il cliente vede sulla vetrina**: una quantità sbagliata vende
merce che non c'è, un prezzo sbagliato la vende al prezzo sbagliato. Una descrizione vecchia
di un'ora non ha lo stesso effetto.

#### 8.9.4 Nessuna perdita silenziosa

> **Ogni operazione deve trovarsi sempre in uno di tre stati: confermata, ancora da eseguire,
> oppure fallita con motivo visibile e possibilità di recupero.**

⛔ **Un quarto stato non esiste**, e in particolare non esiste «sparita». Vale
indipendentemente dalle priorità di §8.9.3: essere in fondo alla coda è «ancora da eseguire»,
non è un esito.

⭐ **Anche le modifiche arrivate DURANTE il primo allineamento devono sopravvivere.** È il
caso più facile da perdere: l'allineamento è lungo, e nel frattempo qualcuno tocca un prezzo.
Quella modifica non può essere sovrascritta dall'allineamento né scartata perché arrivata nel
momento sbagliato.

⭐ **Primo caso applicato — 09/09/2026, `DA-FARE` §25**: due webhook sovrapposti dello stesso
prodotto. Il secondo aspetta sul lock di `importProduct` PRIMA di leggere, poi aggiorna col
proprio payload: il barcode e il titolo che portava arrivano a destinazione (prova `C5`).
Rispondere `skipped` avrebbe evitato il doppione perdendo la modifica — cioè il quarto stato
che qui non esiste.

⚠️ **Raccordo con §8.4**: «il riavvio dell'API non perde la coda» è la stessa esigenza vista
dal lato tecnico. Lì è una proposta; qui è il requisito che quella proposta — o un'altra —
dovrà soddisfare.

#### ⏸ Che cosa resta APERTO, e non va dedotto da qui

| Aperto                              | Perché non è deciso                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **soglie accettabili**              | ritardo tollerato per un aggiornamento critico, dimensione massima dell'arretrato, tempo di smaltimento: sono numeri, e vanno scelti dopo la misura di §8.9.2 |
| **politica precisa delle priorità** | §8.9.3 dice quale famiglia viene prima; _come_ (code separate, pesi, finestre) non è deciso                                                                   |
| **soluzione tecnica**               | outbox (§8.4), worker, Bulk Operations: ⛔ **opzioni da valutare, non implementazioni autorizzate**                                                           |

⛔ **Nessuna di queste scelte si fa scrivendo codice**: i requisiti sono registrati per essere
verificabili, non per essere implementati adesso. Gli scenari corrispondenti — picchi,
disponibilità e prezzi durante un arretrato descrittivo, interruzione e ripresa, assenza di
duplicazioni, completamento delle attività secondarie — vivono nel piano di collaudo, con le
misure da raccogliere.

---

### 8.10 ⏸ PROPOSTA DA VALUTARE — importazione massiva con conferma prima dell'invio

> ⛔ **NON APPROVATA.** È la proposta del proprietario del 09/09/2026, registrata qui perché
> §8.10 è il punto canonico: salvare prima nel gestionale, mostrare il riepilogo, e inviare a
> Shopify **solo dopo conferma dell'operatore**.
>
> ⚠️ **Questa sezione non ripete §8.9**: i quattro requisiti confermati restano lì e valgono
> per qualunque soluzione. Qui si valuta **se e come** la proposta li rispetterebbe.
>
> ⛔ **Non riapre l'onboarding sospeso** (§12), che resta sospeso.

#### 8.10.1 La domanda che decide la proposta

> **Che cosa succede se, prima della conferma, uno degli articoli importati viene VENDUTO o
> MODIFICATO?**

⭐ **È la domanda giusta, e non basta sospendere il solo invio iniziale**: se un altro percorso
pubblica comunque quei dati, la conferma non governa niente. La ricognizione del 09/09/2026 ha
censito **tutti** i percorsi che scrivono verso Shopify (elenco e prove in `DA-FARE`,
«ricognizione della sincronizzazione massiva»), e la risposta è in due metà.

**Metà buona.** L'interruttore per prodotto `shopifySyncEnabled` è letto da **tutti e tre** i
percorsi che toccherebbero quegli articoli, e li ferma:

| Percorso                    | Dove legge il flag                  | Effetto a interruttore spento       |
| --------------------------- | ----------------------------------- | ----------------------------------- |
| push del CATALOGO           | `shopify-product-push.service.ts`   | rifiuta con `sync_disabled`         |
| push delle QUANTITÀ         | `shopify-inventory-push.service.ts` | rifiuta con `sync_disabled`         |
| pull del catalogo (webhook) | `shopify-product-pull.service.ts`   | ⛔ **scarta il webhook per intero** |

Quindi una vendita durante la sospensione muove la giacenza **in locale** e non parte; alla
conferma il push manda la **quantità corrente**, non un delta, quindi la vendita è già dentro
e non si perde. Lo stesso per una modifica di prezzo o di descrizione.

**Metà cattiva — tre ostacoli, tutti verificati nel codice.**

⛔ **1 · Spegnere l'interruttore su un articolo GIÀ COLLEGATO lo ARCHIVIA su Shopify.** La
transizione acceso→spento su un salvataggio esegue l'archiviazione remota, attesa
(`products.service.ts`, e §1.8). L'interruttore è quindi utilizzabile per articoli **nuovi**,
creati già spenti, e **inutilizzabile** per trattenere aggiornamenti di articoli esistenti: li
toglierebbe dalla vendita. ⚠️ La stessa etichetta «Sincronizza con Shopify» esiste in due
punti diversi dell'interfaccia — una casella nella scheda e un pulsante nel dettaglio — e
solo la casella ha questo effetto.

⛔ **2 · A interruttore spento i webhook in arrivo NON vengono messi in coda: vengono
scartati.** È una perdita nella direzione opposta, ed è il quarto stato che §8.9.4 vieta. Una
sospensione lunga su un catalogo collegato perderebbe in silenzio le modifiche fatte
dall'altra parte.

⛔ **3 · L'import CSV non onora l'interruttore, e non potrebbe.** Mancano **due** anelli: la
colonna «Sincronizza con Shopify» non esiste né in export né in import, e il percorso di
import non passa dal servizio che onorerebbe il campo — scrive con una `create` propria, quindi
il valore cade sul default di schema, che è **acceso**. Ogni prodotto importato da CSV nasce
sincronizzato e viene accodato al push subito. ⚠️ E una colonna aggiunta a mano dall'operatore
verrebbe **scartata in silenzio**: le intestazioni sconosciute non producono nessun avviso.

#### 8.10.2 Tre casi diversi, che la proposta non deve confondere

| Caso                                        | Che cosa cambia                                                                                                    | Che cosa serve davvero                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primo caricamento**                       | il catalogo non è ancora su Shopify: non c'è niente da archiviare, e l'interruttore spento alla creazione è sicuro | §8.9.1 chiede **completezza per articolo**: oggi non esiste nessun dato che dica «questo articolo è completo». La conferma dell'operatore non la sostituisce              |
| **Importazione massiva durante l'attività** | gli articoli toccati possono essere **già collegati**, e intorno si vende                                          | ⛔ l'interruttore qui **non si può usare** (ostacolo 1). Serve un marcatore diverso, che trattenga l'INVIO senza toccare lo stato di vendita remoto né scartare i webhook |
| **Ripristino di un backup**                 | ⛔ **non è un'importazione**, e non va trattato come tale                                                          | il ripristino ha già le sue regole (2b, 3c, allineamento delle cache). ⚠️ E dopo un ripristino i dati su cui un riepilogo si baserebbe **mentono**: vedi §8.10.3          |

#### 8.10.3 Il riepilogo prima della conferma: su quali dati si costruirebbe

⭐ **Il proprietario chiede tre classi distinte.** La ricognizione dice quali sono costruibili
oggi:

| Classe                                       | Stato                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) differenze locali non ancora inviate** | costruibile per le **quantità** (confronto di valore fra il Disponibile e l'ultimo inviato) e per le **immagini**; ⛔ **non costruibile per i campi del catalogo**: non esiste un marcatore di «modificato e non inviato», e il confronto fra le date non lo sostituisce perché entrambe le date le muove la sincronizzazione stessa |
| **(b) divergenze osservate su Shopify**      | esiste **solo per le quantità**, e solo se i webhook sono attivi. Per i campi del catalogo il pull sovrascrive senza confrontare: nessuna divergenza viene registrata                                                                                                                                                                |
| **(c) esiti incerti dopo un'interruzione**   | ⛔ **non costruibile**. Il meccanismo giusto esiste nel progetto — una riga di registro «tentativo» senza esito — ma i percorsi Shopify non lo usano per i tentativi, solo per i rifiuti                                                                                                                                             |

⛔ **E «ultimo invio riuscito» non dimostra lo stato remoto attuale.** Non lo dimostra nemmeno
nell'istante in cui viene scritto — dice che cosa VestiFlow ha mandato, non che cosa Shopify
ha adesso — e dopo un **ripristino** torna indietro nel tempo insieme al Disponibile locale.
⚠️ Il caso peggiore non è che il dato sia vecchio: è che diventi **falso e coerente con sé
stesso**, perché Disponibile e ultimo-inviato tornano dallo stesso archivio e coincidono. Il
push conclude allora che non c'è niente da mandare, mentre Shopify tiene un numero diverso.

⭐ **La forma giusta esiste già nel progetto, per gli ordini**: la riconciliazione degli ordini
spariti dal canale confronta lo stato locale con l'elenco remoto invece di fidarsi di ciò che
si crede di aver inviato, e si rifiuta di concludere quando l'elenco remoto è sospetto. È il
precedente da guardare se il riepilogo dovrà dire qualcosa sul remoto.

#### 8.10.4 Le decisioni da chiedere al proprietario

⛔ **Nessuna di queste si prende scrivendo codice**, e nessuna è dedotta qui.

| #   | Decisione                                                                                                                                                           | Perché non è deducibile                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Il **marcatore di sospensione** è l'interruttore esistente (solo per articoli nuovi) o un campo nuovo che trattenga l'invio senza archiviare né scartare i webhook? | la prima è a costo zero e copre solo il primo caricamento; la seconda copre anche l'importazione durante l'attività, ma è un concetto nuovo nel modello |
| 2   | Durante la sospensione, i **webhook in arrivo** su quegli articoli si scartano (come oggi), si mettono in attesa, o si applicano?                                   | §8.9.4 vieta lo scarto silenzioso, ma «si applicano» significa che il riepilogo mostra dati che cambiano sotto gli occhi dell'operatore                 |
| 3   | La conferma è **per lotto** o **per articolo**?                                                                                                                     | un lotto è un gesto solo; per articolo consente di escludere le righe sospette, ma moltiplica i gesti su un'importazione grande                         |
| 4   | Che cosa succede agli articoli **non confermati** dopo un tempo, o se l'operatore non conferma mai?                                                                 | restano sospesi per sempre è un arretrato invisibile; scadono è una decisione che nessuno ha preso                                                      |
| 5   | Il riepilogo deve dire qualcosa sullo **stato remoto**, o solo su ciò che si sta per mandare?                                                                       | dire il remoto richiede di leggerlo davvero (vedi §8.10.3), che è un'altra funzione e un altro costo                                                    |
| 6   | La colonna CSV «Sincronizza con Shopify» va aggiunta, e con quale **contratto sui valori**?                                                                         | oggi non esiste in nessuna direzione; se si aggiunge vanno decisi il valore vuoto, quello sconosciuto, e che cosa fa un giro export→import              |

⚠️ **Vincolo che vale comunque**: VestiFlow senza Shopify continua a funzionare, e la matrice
dei campi (§9.2), i movimenti e le regole delle quantità non cambiano.

---

### 8.11 Il FUNZIONAMENTO RICHIESTO — regole CONFERMATE, 09-10/09/2026

> ✅ **Confermate dal proprietario.** Prevalgono da subito, ciascuna per sé (§0). ⛔ Non
> autorizzano codice: lo stato e la differenza da colmare stanno in `DA-FARE.md`, le prove
> nello scenario `N` del piano di collaudo.
>
> ⭐ **Raccordo con il quadro funzionale.** `SINCRONIZZAZIONE-QUADRO-FUNZIONALE.md` è la
> lettura d'insieme preparata dal proprietario; **questa sezione ne è la resa normativa**, e le
> due non vanno tenute allineate a mano su tutto: qui entra **solo ciò che il quadro marca come
> richiesto**. L'aggiornamento del **10/09/2026** recepisce la partenza controllata, la scelta
> dell'operatore sulle vendite aperte, il regime continuo e il comando Allinea. Supera le
> precedenti proposte incompatibili su questi punti, ma non le trasforma in codice già pronto.
> Restano aperti i dettagli tecnici non decisi e le scelte sulle importazioni da file e sulla
> colonna sì/no. Lo stato applicativo resta in `DA-FARE`.
>
> ⚠️ **Non ripetono la matrice dei campi (§9.2), i movimenti né le regole delle quantità**: le
> presuppongono.

#### 8.11.1 Prima configurazione — sedi

Per gestire il magazzino serve **almeno una sede operativa VestiFlow**. I collegamenti con le
location Shopify sono **uno-a-uno** e li sceglie **l'operatore**.

⛔ **Nessuna somma automatica delle quantità di sedi diverse.** ⛔ **Nessun collegamento
indovinato dal nome**: un nome uguale non è un'identità.

#### 8.11.2 Prima configurazione — catalogo

Si sceglie **una direzione iniziale**: Shopify → VestiFlow, oppure VestiFlow → Shopify (le due
direzioni di §12.0).

⛔ **La fusione automatica di due cataloghi già popolati è ESCLUSA da questa fase.** ⛔ E la
scelta non autorizza **cancellazioni o sovrascritture** del catalogo di destinazione.

**Partenza delle quantità — decisione del 10/09/2026.** Dopo la mappatura delle sedi,
l'allineamento iniziale si svolge in una o più fasi controllate: si acquisiscono e si verificano
gli ordini online pendenti del periodo gestito e si sistemano le differenze. Un effetto già
compreso nelle quantità iniziali non deve essere contato di nuovo quando arriva l'ordine.
Un ordine aperto ma già correttamente impegnato non deve essere evaso per consentire l'avvio.

**VestiFlow non ferma le vendite Shopify e non ne richiede la sospensione come condizione di
esecuzione.** È l'operatore a scegliere se fermarle dal negozio oppure allineare a vendite
aperte, accettando il rischio di nuovi ordini durante l'operazione e di ulteriori passaggi.
La sincronizzazione resta operativa durante l'allineamento; non si introduce un blocco di
manutenzione che impedisca gli scambi necessari.

La preparazione stabilisce il punto di partenza del regime continuo. Non equivale a inizializzare
le righe con una sovrascrittura automatica alla prima vendita o al primo carico locale.
I dettagli precedentemente proposti per il wizard (§12) non sono autorizzati da questo flusso.

#### 8.11.3 Attività ordinaria

La matrice canonica dei campi (§9.2) **resta invariata**, e **la scelta iniziale non cambia la
direzione della sincronizzazione successiva**: è un punto di partenza, non un regime.

⛔ **VestiFlow deve funzionare integralmente anche senza Shopify.**

#### 8.11.4 Ordini — il confine temporale

Alla **prima connessione** si registra un **confine temporale**: entrano soltanto gli ordini
creati **da quel momento in poi**.

⛔ **Una pausa o una riconnessione allo stesso negozio NON sposta quel confine**, e non deve
far dimenticare gli ordini del periodo intermedio.

⚠️ **Che cosa un ordine autorizza, e che cosa no.** Le informazioni dell'ordine devono
identificare **articoli, quantità ordinate e sedi interessate**. ⛔ **Non sono
un'autorizzazione a copiare la disponibilità Shopify nella giacenza locale.**

#### 8.11.5 Quantità e ORIGINE degli effetti

| Origine dell'effetto         | Che cosa deve succedere                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **già applicato da Shopify** | si **acquisisce** in VestiFlow, e per quella sola acquisizione **non** parte un reinvio automatico della disponibilità al canale |
| **operazione locale**        | genera un **aggiornamento da trasmettere**                                                                                       |

⛔ **L'arrivo di un ordine Shopify non deve cancellare aggiornamenti locali ancora pendenti.**

⛔ **Nessun invio della sincronizzazione continua deve sovrascrivere vendite online non ancora acquisite**, e la protezione
dev'essere **effettiva**: non bastano dichiarare VestiFlow autorevole, attendere qualche
secondo, o confrontare due numeri uguali.

Una vendita locale genera il proprio effetto da sottrarre, un carico quello da aggiungere;
un effetto acquisito da Shopify non viene rispedito. Restano invariate le regole della quantità
pubblicabile e dei negativi: non è un'autorizzazione a inviare delta grezzi senza tali regole.
Il risultato richiesto è la convergenza dopo l'elaborazione, non l'uguaglianza istantanea durante
il transito degli eventi.

**Rettifiche manuali Shopify.** Non diventano giacenza o movimenti VestiFlow e non vengono
corrette automaticamente imponendo il totale locale. L'operatore deve gestire le quantità in
VestiFlow; se interviene nell'admin Shopify o tramite altri sistemi, l'eventuale scarto resta
fuori dalla garanzia di allineamento ordinario e si corregge col comando esplicito di §8.11.7.
Il limite va spiegato nelle guide. Non esonera dall'acquisire ordini o dal conservare gli effetti
locali pendenti.

#### 8.11.6 Emergenza e ripresa

Serve una **sospensione riconoscibile**, **distinta dalla cancellazione dei collegamenti**.

⛔ Non deve **archiviare prodotti**, **azzerare quantità** né **interrompere il lavoro locale**.

La pausa esplicita ferma ingressi e uscite; alla riattivazione si recupera il periodo sospeso e
il lavoro locale conservato. La sospensione per articolo o variante vale su tutte le sue sedi.
È distinta dall'allineamento: non si attiva automaticamente per la preparazione iniziale o per
Allinea, e non spegne le vendite del negozio Shopify.

#### 8.11.7 Riallineamento manuale, e importazioni massive

**Decisione del 10/09/2026:** il comando **Allinea** è richiedibile dall'operatore quando vuole,
anche a vendite aperte. Controlla le differenze per variante e sede e porta **Shopify alle
disponibilità pubblicabili di VestiFlow**, mai il contrario.
Non riscrive le coppie uguali e non sospende automaticamente sincronizzazione o vendite.

Il suo effetto su Shopify è limitato alle disponibilità: non pubblica catalogo, non cambia prezzi
e non modifica lo stato degli ordini. **Resta da confermare** se il pulsante debba acquisire
automaticamente prima gli ordini del periodo gestito o usare quelli acquisiti dal percorso
ordinario o manuale. Il recupero automatico non è stato deciso implicitamente dal nome Allinea.

La scelta di eseguirlo a vendite aperte comporta un rischio residuo accettato: fra recupero e
scrittura può arrivare un ordine non ancora acquisito e può essere necessaria una nuova passata.
Una lista vuota o due quantità uguali non provano che gli eventi siano esauriti; non si promette
che un singolo giro chiuda sempre ogni scarto. Registrare una sovrascrittura la rende tracciabile,
non annulla eventuali vendite prodotte da una quantità errata.

Questa decisione riguarda il riallineamento esplicito, non autorizza un invio ordinario a imporre
un totale incompleto. Restano le protezioni su tenant, negozio, sedi, identità escluse,
concorrenza, idempotenza, esiti incerti e modifiche locali sopraggiunte. Un errore tecnico non
diventa un successo per il solo fatto che l'operatore ha accettato il rischio degli ordini in volo.
La forma della UI oltre al comando richiesto non è definita qui.

**Stato: funzionamento approvato, non dichiarato implementato da questa modifica documentale.**
Implementazione e collaudi restano in `DA-FARE` §31. Il ritentativo di un invio e il riallineamento
esplicito restano operazioni diverse.

Le **importazioni massive** servono anche durante l'attività ordinaria, da file come CSV
Shopify e XML fornitori. ⛔ **Un file non dimostra un collegamento remoto**, e ⛔ **la
disponibilità del fornitore non è la giacenza VestiFlow.**

---

## 9. Proprietà e direzione dei campi — MATRICE CANONICA

> ✅ **Decisione confermata** (03/09/2026)

⭐ **Questo capitolo è l'UNICO posto in cui la direzione di un campo è decisa.** Ogni altro
punto di questo documento, e ogni altro documento del progetto, vi **rimanda** invece di
ripetere la regola.

⛔ **Non è pedanteria: è già successo.** §1.8 dichiarava «anagrafica, immagini, SKU e barcode
bidirezionali», §1.9 ha dovuto correggerla per il solo nome, e nessuna delle due si accorgeva
dell'altra. Una direzione scritta in due punti diverge al primo cambiamento, e il lettore non
ha modo di sapere quale delle due vale.

### 9.1 Le tre regole che valgono per ogni campo

Per ogni campo esiste una politica dichiarata. Un webhook o un comando manuale non può
scrivere campi fuori dalla propria allowlist. Da qui discendono tre vincoli, validi su ogni
percorso di sincronizzazione:

1. **Ogni sincronizzazione modifica soltanto i campi di propria competenza.** ⛔ Non si
   reinvia il prodotto intero sovrascrivendo dati che appartengono all'altra piattaforma:
   è il modo in cui un push di prezzo cancella una descrizione scritta su Shopify.
2. **Per i campi bidirezionali prevale l'ultima modifica valida salvata.**
3. **La sincronizzazione di ritorno non crea cicli**: ricevere l'eco di una modifica appena
   inviata non deve produrre una nuova modifica identica.

### 9.2 La matrice

⛔ **Qui c'era la «matrice iniziale», marcata «❓ Decisione da prendere»**, e dichiarava cose
oggi superate: «Nome, descrizione, brand → bidirezionale», «Immagini e arricchimenti Shopify
→ bidirezionale per allowlist», «Categorie/collezioni/metafield → Shopify o configurazione
esplicita». È sostituita per intero, e la direzione di ogni campo è ora **decisa**.

| Dato                                            | Direzione                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Nome VestiFlow (`Product.name`)                 | **solo VestiFlow**                                                     |
| Nome Shopify (`shopifyTitle`)                   | **bidirezionale**                                                      |
| Descrizione                                     | **VestiFlow → Shopify**                                                |
| Categoria VestiFlow                             | **solo VestiFlow**                                                     |
| Tipo prodotto Shopify (`productType`)           | **bidirezionale**                                                      |
| Categoria standard Shopify                      | **bidirezionale**                                                      |
| Brand VestiFlow / vendor Shopify                | **bidirezionale**                                                      |
| Tag                                             | **bidirezionali**                                                      |
| Collezioni manuali                              | **bidirezionali** per l'appartenenza del prodotto                      |
| Collezioni automatiche                          | **Shopify → VestiFlow**, per la sola visualizzazione dell'appartenenza |
| Immagine principale                             | **bidirezionale**                                                      |
| Immagini Shopify aggiuntive                     | **solo Shopify**, non gestite da VestiFlow                             |
| SEO                                             | **solo Shopify**, non gestita da VestiFlow                             |
| Metafield configurati in VestiFlow              | **bidirezionali**                                                      |
| Metafield non configurati                       | **solo Shopify**, mai modificati da VestiFlow                          |
| SKU e barcode                                   | **bidirezionali**                                                      |
| Prezzi di vendita                               | **VestiFlow → Shopify**                                                |
| Quantità                                        | **VestiFlow → Shopify**                                                |
| Vendita oltre disponibilità (`inventoryPolicy`) | **bidirezionale**                                                      |
| Opzioni e varianti                              | **bidirezionali**, con le regole sulla cancellazione di §11.1 e §11.7  |

### 9.3 Nome VestiFlow e Nome Shopify

Sono **due campi**, e il contratto completo — inizializzazione, indipendenza, duplicazione,
etichetta nella scheda — sta in **§1.9**. Qui resta il minimo che la matrice richiede:

- il **Nome VestiFlow** è il nome interno usato nel gestionale, e **Shopify non può
  modificarlo**, in nessun percorso;
- il **Nome Shopify** è il titolo della vetrina e si sincronizza in **entrambe** le direzioni;
- alla **prima** sincronizzazione, se vuoto, viene inizializzato dal Nome VestiFlow;
- da lì in poi i due nomi restano **indipendenti**;
- **duplicare un prodotto non copia il Nome Shopify**: il duplicato parte vuoto e alla propria
  prima sincronizzazione lo inizializza dal proprio Nome VestiFlow.

### 9.4 Descrizione

- la descrizione viene inviata **esclusivamente da VestiFlow a Shopify**;
- una modifica eseguita direttamente **su Shopify non aggiorna VestiFlow**;
- un invio successivo da VestiFlow può quindi **sostituire** la descrizione presente su
  Shopify.

⚠️ **Questo comportamento va dichiarato nell'interfaccia** (§9.9). Chi scrive la descrizione
nell'admin Shopify non ha modo di sapere che il prossimo salvataggio dal gestionale la
sovrascriverà, e lo scoprirebbe solo dopo averla persa.

### 9.5 Categorie: quattro concetti distinti, non sinonimi

| #   | Concetto                                    | Direzione      |
| --- | ------------------------------------------- | -------------- |
| 1   | **Categoria VestiFlow**                     | solo VestiFlow |
| 2   | **Tipo prodotto Shopify** (`productType`)   | bidirezionale  |
| 3   | **Categoria standard Shopify** (tassonomia) | bidirezionale  |
| 4   | **Collezioni Shopify**                      | vedi §9.6      |

La **Categoria VestiFlow** è una classificazione esclusivamente gestionale: non viene inviata
a Shopify e non viene sovrascritta da Shopify.

Il **Tipo prodotto Shopify** è un campo Shopify separato, memorizzato in VestiFlow e
sincronizzato in entrambe le direzioni.

La **Categoria standard Shopify** è un nodo della tassonomia ufficiale Shopify:

- si conserva tramite il proprio **identificativo Shopify**, non tramite l'etichetta;
- si sincronizza in entrambe le direzioni;
- **non sostituisce** la Categoria VestiFlow;
- può concorrere al trattamento fiscale previsto da Shopify.

⛔ **Le collezioni usate per aliquote o override fiscali restano distinte dalla tassonomia
standard.** Un override fiscale associato a una collezione Shopify **non** modifica
automaticamente la categoria o l'aliquota IVA interna di VestiFlow: l'IVA di un documento
italiano non si deduce da un raggruppamento di vetrina.

### 9.6 Collezioni

- VestiFlow **importa e mostra** le collezioni associate al prodotto;
- l'operatore può **aggiungere o rimuovere il prodotto** dalle collezioni **manuali**, e
  queste modifiche si sincronizzano in entrambe le direzioni;
- per le collezioni **automatiche** l'appartenenza è calcolata dalle regole Shopify: VestiFlow
  la **mostra** ma non consente di modificarla direttamente;
- **creazione, rinomina, regole ed eliminazione** delle collezioni non fanno parte della
  scheda prodotto e non sono gestite da questa sincronizzazione.

### 9.7 Immagine principale

- VestiFlow gestisce **una sola immagine**: l'immagine principale;
- se cambia su Shopify, viene aggiornata in VestiFlow; se cambia in VestiFlow, viene
  aggiornata su Shopify;
- se viene **rimossa**, la rimozione si propaga nell'altra direzione;
- le altre immagini presenti su Shopify **non** vengono importate, riordinate, modificate o
  eliminate da VestiFlow;
- ⛔ **sostituire l'immagine principale non cancella le altre immagini Shopify.**

### 9.8 Metafield

- si sincronizzano in entrambe le direzioni **soltanto i namespace e le chiavi esplicitamente
  configurati in VestiFlow**;
- i metafield **sconosciuti** — del tema, di Shopify, di altre applicazioni — restano
  **intatti**;
- ⛔ **non esiste una sincronizzazione indiscriminata di tutti i metafield**;
- per ogni metafield configurato devono essere noti il **tipo** e il **campo VestiFlow
  corrispondente**.

### 9.9 Come la matrice si vede nella scheda prodotto

I **tenant senza Shopify** non devono vedere sezioni, campi, indicatori, tooltip, errori o
stati Shopify: senza il canale sarebbero promesse senza destinazione.

Per i tenant **con** Shopify:

- i campi del canale si raggruppano in una sezione **«Dati Shopify»**;
- ogni campo porta un indicatore sintetico:

| Indicatore       | Significato                                  |
| ---------------- | -------------------------------------------- |
| `↔ Shopify`      | bidirezionale                                |
| `→ Shopify`      | VestiFlow scrive, Shopify non torna indietro |
| `Solo VestiFlow` | il canale non lo vede e non lo tocca         |

- le spiegazioni si aggiungono **solo dove la direzione o l'effetto non sono evidenti**;
- ⛔ **tooltip e spiegazioni devono essere utilizzabili anche con tastiera e da dispositivo
  touch**, e **nessuna conseguenza importante può dipendere dal solo passaggio del mouse**:
  in magazzino il mouse non c'è.

Testi funzionali minimi:

| Campo                                      | Testo                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Categoria VestiFlow**                    | «Usata solo nel gestionale. Non modifica Shopify.»                                             |
| **Tipo prodotto Shopify**                  | «Si sincronizza in entrambe le direzioni con Shopify.»                                         |
| **Categoria standard Shopify**             | «Categoria della tassonomia ufficiale Shopify. Si sincronizza in entrambe le direzioni.»       |
| **Collezioni**                             | «Le appartenenze manuali si sincronizzano. Quelle automatiche dipendono dalle regole Shopify.» |
| **Descrizione**                            | «Viene inviata da VestiFlow a Shopify. Le modifiche fatte su Shopify non vengono importate.»   |
| **Immagine**                               | «VestiFlow sincronizza soltanto l'immagine principale.»                                        |
| **Metafield**                              | «Si sincronizzano soltanto i campi Shopify configurati in VestiFlow.»                          |
| **Continua a vendere senza disponibilità** | «Impostazione Shopify sincronizzata in entrambe le direzioni. Non modifica la giacenza.»       |

### 9.10 Ultimo scrittore non significa sovrascrittura cieca

> 🔧 **Proposta tecnica da verificare** — il MECCANISMO, non la regola. Che prevalga l'ultima
> modifica valida salvata, e che l'eco non generi una nuova modifica, è **deciso** in §9.1.

Per i campi bidirezionali conservare:

- valore;
- origine dell'ultima scrittura;
- timestamp remoto e locale;
- hash dell'ultimo valore sincronizzato;
- operazione che lo ha modificato.

Un webhook relativo a una scrittura appena effettuata da VestiFlow deve essere riconosciuto come eco. In caso di modifiche concorrenti, la divergenza viene registrata e risolta secondo la politica del campo; non si usa l'ora del server come unico criterio senza considerare clock e ordine degli eventi.

---

## 10. Pubblicazione, stato locale e inventario Shopify

### 10.1 Pubblicazione variante

#### ✅ La regola funzionale

> Una variante locale **non attiva e già sincronizzata** deve diventare **non pubblicata** su Shopify, **senza alterare quantità, giacenza, impegni, movimenti o `inventoryPolicy`**.

⭐ È tutto ciò che è confermato, ed è una regola di comportamento: dice _cosa_ deve succedere, non _come_.

#### 👁 La capacità tecnica, verificata

Con API `2026-07` esistono `publishablePublish` e `publishableUnpublish` sul GID della variante. È un **fatto misurato sull'API**, non una decisione: dice che la regola funzionale è realizzabile, non come la si realizzerà.

#### 🔧 Quello che resta proposta

- la **matrice persistita** variante × publication (il documento la dava per necessaria: «lo stato locale deve conservare la matrice, non un unico booleano»);
- **quali publication** VestiFlow governa, e quali lascia stare;
- la **policy per ciascun canale**;
- gli **scope** Shopify e la procedura di **riautorizzazione**;
- il **meccanismo di accodamento**.

⚠️ Resta osservato che il prodotto deve essere attivo e pubblicato sul canale perché una variante possa apparire: lo stato prodotto prevale su quello della variante, ma non lo sostituisce.

### 10.2 Stato locale non attivo

> ✅ **Decisione confermata**

portare una variante allo stato locale non attivo:

1. aggiorna lo stato locale;
2. la esclude dalle nuove selezioni commerciali;
3. non cambia giacenza, impegni, documenti o movimenti;
4. accoda la spubblicazione da tutte le publication gestite;
5. conserva prodotto, variante e GID Shopify;
6. consente la successiva riattivazione.

Non imposta la giacenza a zero. Non usa `inventoryPolicy = DENY` come sostituto.

### 10.3 Riattivazione

> ✅ **Decisione confermata** — precisata il 06/09/2026 sulla presenza Shopify (§3.1)

⭐ **«Riattiva in VestiFlow» agisce SOLO sullo stato locale.** Non ripubblica automaticamente
su Shopify: rimettere in vendita è un comando separato, «Rimetti in vendita su Shopify», con
il proprio esito ed i propri errori.

Rimettere in uso localmente:

1. rende la variante di nuovo selezionabile in un nuovo documento;
2. non tocca in nessun modo lo stato di vendita Shopify;
3. non pubblica su nessun canale.

**«Rimetti in vendita su Shopify» si ramifica sulla PRESENZA (§3.1), non è un comando unico:**

| Presenza Shopify dell'entità              | Azione disponibile                                   | Comportamento                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Collegato** (esiste ancora)             | **«Rimetti in vendita su Shopify»**                  | usa le publication conservate dal ritiro; pubblica la quantità calcolata da VestiFlow; verifica l'esito per canale |
| **Eliminato su Shopify** (non esiste più) | **«Pubblica nuovamente su Shopify»**, non «Riattiva» | crea un'entità nuova, con nuovi identificativi (§11.9): non c'è nulla da «rimettere»                               |

⛔ **Offrire «Rimetti in vendita» su un'entità Eliminata su Shopify sarebbe un comando che
promette un effetto che non può produrre**: non esiste un id remoto da ripubblicare. L'unica
azione onesta in quello stato è quella che dichiara di creare qualcosa di nuovo.

### 10.4 Inventory policy

> ✅ **Decisione confermata**

`inventoryPolicy` governa la vendita oltre disponibilità:

- `DENY`: non vendere quando la quantità vendibile è esaurita;
- `CONTINUE`: ammette overselling secondo decisione commerciale.

È un'impostazione Shopify per variante, esposta in VestiFlow come **«Continua a vendere senza
disponibilità»** e sincronizzata in entrambe le direzioni.

- non rappresenta lo stato locale della variante;
- non pubblica e non spubblica la variante;
- non modifica giacenza, impegnata o disponibile;
- non viene usata per sospendere un prodotto o una variante;
- per una nuova variante usa la preferenza configurata per il negozio Shopify;
- se il negozio non ha ancora una preferenza configurata, il valore iniziale è `DENY`.

### 10.5 Quantità pubblicabile

> ✅ **Decisione confermata**

```text
disponibile VestiFlow      = giacenza − impegnata
quantità inviata a Shopify = max(0, disponibile VestiFlow)
```

#### ⭐ Il «disponibile VestiFlow» è una COLONNA, e si legge — non si rifà — 09/09/2026

> **`inventory_levels.available` è il valore canonico. Il canale lo legge da lì, come lo
> legge la schermata. L'unica trasformazione che resta è il clamp: `max(0, available)`.**

⛔ **Fino al 09/09/2026 il push e la riconciliazione RICALCOLAVANO `giacenza − impegnata`**
per conto loro, con `computeShopifyPublishableAvailable(onHand, committed, 0)`. Era un
secondo motore del Disponibile accanto a quello del gestionale: finché i due coincidevano
non si vedeva, e il giorno che avessero divergere l'operatore avrebbe letto un numero e il
canale ne avrebbe ricevuto un altro — senza che nessuno dei due risultasse sbagliato.

⭐ **Il cambio è stato autorizzato dopo una VERIFICA, non per simmetria.** Censite le sette
aree che scrivono giacenza, impegni e disponibile — documenti e movimenti, impegni e ordini,
cassa, inventario fisico, import CSV, ripristino e anagrafica, Shopify — ognuna con una
seconda lettura indipendente incaricata di confutare la prima. Nessun verdetto è stato
ribaltato. In tutto il codice di produzione i punti che scrivono `inventory_levels` sono sei,
e i tre campi dell'invariante li toccano **solo** le due util centrali, che li muovono
sempre insieme:

| Punto                                                  | Che cosa scrive                                |
| ------------------------------------------------------ | ---------------------------------------------- |
| `inventory-level-delta.util.ts`                        | `onHand` e `available` dello **stesso** delta  |
| `committed-delta.util.ts`                              | `committed` e `available` di delta **opposti** |
| `inventory-incoming.util.ts`                           | solo `incoming`, fuori dall'invariante         |
| `inventory-import.service.ts` · `inventory.service.ts` | solo `minThreshold`                            |
| `products.service.ts`                                  | `deleteMany`: toglie la riga intera            |
| ripristino da backup                                   | reinserisce le righe **com'erano**             |

⚠️ Nessun SQL grezzo tocca `inventory_levels` nel codice di produzione.

⭐ **Verificato anche sul database**, non solo letto: `invariante-disponibile.integration-spec`
misura `available = onHand - committed` dopo carico, scarico sotto zero, impegno e rilascio,
nascita della riga, `incoming`, rollback a scritture avvenute, dodici delta in parallelo,
giacenza e impegni mescolati, export e ripristino. ⛔ Il controllo conta le righe **incoerenti
dell'intero tenant**, non guarda la riga in mano: una riga sfuggita altrove lo farebbe fallire
lo stesso. Una prova costruisce un'incoerenza a mano per verificare che il controllo la veda.

⛔ **La scorta di sicurezza è stata TOLTA dalla formula** (02/09/2026), e il **parametro** è
stato tolto dal codice il 09/09/2026: restava accettato dalla funzione e valorizzato a `0` da
entrambi i chiamanti — un comando che non comandava, e che prima o poi qualcuno avrebbe
valorizzato credendolo configurato. Compariva come «regola base già confermata» — `max(0, giacenza − impegnata − scorta di sicurezza)` — e non era confermata da nessuno: è una proposta che si era travestita da decisione.

⭐ **La disponibilità negativa resta visibile in VestiFlow**, ed è un fatto che l'operatore deve vedere. Non viene trasformata in un movimento, in una rettifica o in un azzeramento: verso il canale si pubblica zero, in casa si legge il numero vero.

Se la variante è non attiva o eliminata, la quantità **non** è il modo di nasconderla: governa soltanto l'inventario. La rimozione dalle publication è l'atto commerciale.

#### ⭐ La sincronizzazione inventario non deve rimettere in vendita — deciso il 06/09/2026

> **Lo stato di Vendita Shopify (§3.1) PREVALE sulla quantità locale. Aggiornare la quantità di
> una variante Ritirata non la rimette in vendita, e non deve farlo nemmeno per effetto
> indiretto. Solo «Rimetti in vendita su Shopify» cambia lo stato di vendita.**

⛔ **È il caso che questa sezione descriveva a metà**: diceva che la quantità «governa soltanto
l'inventario», ma non diceva esplicitamente che il ciclo periodico di sincronizzazione
inventario **non deve interpretare** un aggiornamento di quantità come un segnale per
ripubblicare. I due fatti sono indipendenti per costruzione (§3.1), ma un ciclo di
riconciliazione che scrivesse quantità e, distrattamente, anche stato di pubblicazione
violerebbe la separazione degli assi silenziosamente.

⚠️ **Nel codice oggi non esiste il concetto da proteggere**: misurato il 06/09/2026,
`shopify-inventory-push.service.ts` non legge `lifecycleStatus` né alcuno stato di
pubblicazione prima di scrivere la quantità — perché oggi **non esiste ancora un ritiro** da
proteggere (nessun comando lo produce). Non è un difetto da correggere ora: è un vincolo da
rispettare quando il ritiro esisterà, registrato qui perché non si scopra per tentativi il
giorno in cui la prima variante ritirata riceve un aggiornamento di giacenza.

⚠️ `inventoryPolicy` è una **decisione separata** — se si possa vendere senza disponibilità — e sta in §10.4. Non rappresenta lo stato della variante.

> 🔧 **Proposta tecnica da verificare** — il resto di questo paragrafo: il push GraphQL userebbe quantità assolute autorevoli, `changeFromQuantity` secondo la politica di concorrenza scelta e `@idempotent` con chiave persistente, con `referenceDocumentUri` riconducibile a VestiFlow. È una forma tecnica ipotizzata, non una decisione presa.

---

## 11. Ritiro da Shopify, eliminazioni remote e reimportazione

### 11.1 VestiFlow non elimina MAI definitivamente da Shopify

> ✅ **Decisione confermata** (03/09/2026)

> **VestiFlow è non distruttivo verso Shopify. Non usa operazioni Shopify di cancellazione
> definitiva di prodotti o varianti.**

⛔ **Qui c'era il contrario**, in tre punti di questo stesso capitolo: `productVariantsBulkDelete`
fra i passi di §11.2, `productDelete` fra quelli di §11.4, e in §11.3 «eliminare il solo
prodotto remoto» fra le strade praticabili. Sono state **tolte**: una cancellazione definitiva
su Shopify non è annullabile da VestiFlow, e non è un effetto che un comando del gestionale
possa produrre sul negozio di qualcun altro.

Quando l'azione nasce da VestiFlow:

| Azione locale                                     | Effetto su Shopify                                         |
| ------------------------------------------------- | ---------------------------------------------------------- |
| prodotto **non attivo** o **nel cestino**         | prodotto reso **non acquistabile** e **archiviato**        |
| variante **non attiva** o **nel cestino**         | variante **rimossa dalle pubblicazioni**                   |
| **eliminazione definitiva** locale del prodotto   | il prodotto Shopify **resta archiviato**                   |
| **eliminazione definitiva** locale della variante | la variante Shopify **resta esistente, ma non pubblicata** |

⛔ **Non si usa la quantità zero per rappresentare la sospensione** (§3.1, §10.5): la quantità
governa l'inventario, la rimozione dalle pubblicazioni è l'atto commerciale.

⭐ **La cancellazione definitiva su Shopify si fa soltanto dall'amministrazione Shopify.** È
una scelta di chi possiede il negozio, non una conseguenza di un comando nel gestionale.

#### La conferma precede il completamento

Prima di completare l'eliminazione locale definitiva, VestiFlow **attende la conferma che
l'elemento non sia più acquistabile su Shopify**.

| Esito                                   | Conseguenza                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopify **conferma**                    | l'eliminazione locale definitiva si completa                                                                                                          |
| Shopify **non conferma**                | l'eliminazione **non** si completa · l'elemento **resta nel cestino** · l'operatore viene **avvisato** che potrebbe essere ancora acquistabile online |
| l'elemento è **già assente** da Shopify | l'eliminazione locale può proseguire                                                                                                                  |

⚠️ È la stessa disciplina di §1.10 per lo spegnimento della sincronizzazione: l'operazione si
**attende** e, se il canale non conferma, **non si finge** che sia riuscita.

#### Quello che questa sezione non decide

> 🔧 **Proposta tecnica da verificare** — il come.

Shopify e PostgreSQL non condividono una transazione. La sicurezza deriva da:

- intenzione persistita;
- stati espliciti;
- idempotenza;
- retry;
- verifica finale;
- cancellazione fisica locale soltanto dopo la conferma remota, se il comando richiesto è
  «Elimina definitivamente».

### 11.2 Ritiro di una variante quando il prodotto ne ha altre

> 🔧 **Proposta tecnica da verificare** — la sequenza. Ciò che è **deciso** è §11.1: nessuna
> cancellazione definitiva su Shopify, e conferma di non acquistabilità prima di completare.

1. Eseguire il preflight locale e remoto.
2. Registrare conferma, snapshot e operazione in una transazione locale.
3. Impostare `deletedAt` localmente: da quel momento non è selezionabile.
4. Accodare la spubblicazione da tutte le publication gestite.
5. Trattare ogni `userError` come fallimento.
6. Verificare che la variante non sia più **acquistabile** su Shopify.
7. Se il comando è «Sposta nel cestino», marcare l'operazione completata senza cancellare
   dipendenze locali.
8. Se il comando è «Elimina definitivamente», eseguire la purga locale descritta in §4.2 e
   conservare il solo audit minimo previsto.

⛔ **Qui c'erano due passi in più**: «accodare `productVariantsBulkDelete`» e «verificare che
il GID variante non sia più risolvibile». Entrambi presupponevano una cancellazione remota
definitiva, che §11.1 esclude. La variante Shopify **resta esistente e non pubblicata**, e il
suo GID **resta risolvibile**: verificare il contrario fallirebbe sempre.

Il ritiro dal canale e lo spostamento nel cestino non modificano storia o inventario locale.
La successiva eliminazione definitiva rimuove invece le dipendenze operative dichiarate nel
secondo avviso (§1.1, §4.2).

### 11.3 Ultima variante

> ✅ **Decisione confermata** — il vincolo locale E la conseguenza remota (03/09/2026)

> **Il ritiro o l'eliminazione locale di una variante, compresa l'ultima variante attiva, non
> elimina mai automaticamente il prodotto locale né le altre varianti locali.**

⛔ Qui era scritto il contrario: _«se l'operatore conferma, si usa `productDelete` e il prodotto locale viene eliminato logicamente con tutte le varianti»_. È stato **espressamente rifiutato**. Un'azione su una variante non può propagarsi al prodotto e ai suoi fratelli: sarebbe una cancellazione a cascata innescata da un vincolo del canale, cioè la cosa che tutto questo documento vieta.

⭐ **L'eliminazione del prodotto locale resta un comando distinto, esplicito e amministrativo.** Mai una conseguenza.

⭐ **La conseguenza remota non è più aperta.** VestiFlow non cancella la variante su Shopify:
la rimuove dalle pubblicazioni e la lascia esistere. Se non resta alcuna variante locale attiva,
si applica §3.4: il prodotto Shopify passa in Bozza e non torna online automaticamente.

Una variante `Default Title` o standalone trovata su Shopify non viene mai considerata una
scorta tecnica sacrificabile. Deve essere mappata alla variante base locale oppure segnalata
come anomalia. Finché il mapping non è risolto, nessun push può renderla acquistabile o
assegnarle automaticamente quantità e identità di un'altra variante.

Il codice Shopify `CANNOT_DELETE_LAST_VARIANT` non deve originare da VestiFlow, perché il
connettore non usa operazioni di cancellazione remota (§11.1). Se compare per un percorso non
previsto, è un errore da correggere: non introduce un nuovo flusso funzionale.

### 11.4 Eliminazione prodotto

> ✅ **Decisione confermata**

1. Preflight completo di tutte le varianti.
2. Conferma con somme aggregate e dettaglio espandibile.
3. Marcatura logica del prodotto e delle varianti nella stessa transazione locale.
4. Sospensione di nuovi push ordinari per quell'aggregate.
5. Spubblicazione tecnica quando utile a chiudere una finestra di vendita.
6. **Archiviazione** del prodotto Shopify, che lo rende non acquistabile.
7. Verifica che il prodotto non sia più **acquistabile** su Shopify.
8. Se il comando è «Sposta nel cestino», completamento della sola marcatura logica.
9. Se il comando è «Elimina definitivamente», purga fisica locale del prodotto, delle varianti
   e delle dipendenze operative dichiarate nel doppio avviso (§4.2).

Senza conferma del punto 7 l'eliminazione definitiva non si completa e il prodotto resta nel
cestino.

⛔ **Ai passi 6 e 7 c'erano `productDelete` GraphQL e «verifica dell'assenza remota»**. Il
prodotto Shopify **non viene eliminato**: resta archiviato, quindi è ancora presente e
verificarne l'assenza fallirebbe sempre (§11.1).

### 11.5 Errori e disconnessione

> ✅ **Decisione confermata** (03/09/2026)

Una dipendenza locale non blocca. Un problema tecnico remoto produce invece un'operazione pendente:

- ⛔ **l'eliminazione locale definitiva NON si completa**: l'elemento **resta nel cestino**,
  ripristinabile, e la sua storia resta dov'è (§11.1);
- l'operatore è **avvisato che l'elemento potrebbe essere ancora acquistabile online**;
- la UI non dichiara «eliminato anche da Shopify»;
- il worker riprova;
- l'operatore può riconnettere Shopify o riprovare;
- gli errori permanenti richiedono un'azione esplicita.

⛔ **Qui c'era «localmente il record resta eliminato e non selezionabile»**, con l'etichetta
`Eliminato in VestiFlow — rimozione Shopify in attesa`. Era il contrario di quanto §11.1
decide: si dichiarava concluso in casa ciò che sul canale non era ancora avvenuto, e
l'elemento usciva dal cestino — cioè dall'unico posto da cui si può ancora recuperare.

⭐ **Il cestino è lo stato d'attesa**, e non ne serve uno nuovo: l'elemento è già fuori dalle
selezioni commerciali, e il ripristino esiste. Un'eliminazione definitiva a metà avrebbe
invece richiesto uno stato parallelo che nessuno ha chiesto.

Non ripristinare automaticamente il record locale per un errore di rete. Non fingere che il remoto sia stato ritirato.

### 11.6 Concorrenza

> 🔧 **Proposta tecnica da verificare**

Durante una cancellazione pendente:

- i normali push di prodotto/variante vengono accorpati o scartati come superati;
- un webhook remoto non riattiva il record;
- un ripristino crea un comando compensativo ordinato dopo la cancellazione o annulla l'operazione se non partita;
- due click ripetuti producono **un solo effetto**, comunque sia realizzato.

### 11.7 Eliminazioni eseguite direttamente su Shopify

> ✅ **Decisione confermata** (03/09/2026, protocollo reso prescrittivo il 06/09/2026)

> **La cancellazione eseguita su Shopify non cancella mai automaticamente il prodotto o la
> variante da VestiFlow. Shopify può essere modificato direttamente dal titolare del negozio:
> VestiFlow deve recepire il fatto, conservare la corrispondenza storica, e non ricreare
> automaticamente ciò che è stato eliminato volontariamente.**

⭐ È il verso opposto di §11.1, e la simmetria è voluta: nessuna delle due piattaforme
distrugge dati nell'altra. Un negozio online non decide che cosa esiste in magazzino.

⛔ **Qui l'operatore sceglieva fra quattro opzioni** — ricreare, lasciare locale, rendere non
attiva, spostare nel cestino — **ed è stato sostituito**: la reazione a un'eliminazione remota
non è più una scelta al momento, è una transizione automatica e una sola via di ritorno.

Quando un **prodotto o una variante collegati** vengono eliminati su Shopify, per entrambi:

1. si riceve l'evento Shopify pertinente (o si verifica lo stato remoto, vedi sotto);
2. il record locale **si conserva integralmente**: variante o prodotto, storico, giacenza,
   impegni e movimenti VestiFlow restano invariati;
3. l'identificativo remoto **si conserva nello storico**, non si cancella e non si riusa come
   se fosse ancora valido;
4. lo stato di Presenza (§3.1) diventa **«Eliminato su Shopify»**;
5. il push automatico ordinario **si ferma per quella entità**: non tenta di aggiornare un id
   che non esiste più;
6. **nessuna ricreazione automatica** su Shopify;
7. resta possibile collegare ordini, resi ed eventi storici già legati a quell'identificativo:
   la storia commerciale non dipende dal fatto che l'entità esista ancora sul canale;
8. l'unica via per tornare in vendita è un comando esplicito, **«Pubblica nuovamente su
   Shopify»** (§11.9) — non «Riattiva», che agisce solo sullo stato locale (§10.3).

⛔ **La stessa regola vale per un 404.** Quando una lettura o una scrittura verso Shopify
riceve `404`, l'entità remota mancante **non equivale mai a un'entità da creare**: si applica
la stessa transizione del punto 4, non un tentativo di ricrearla per farla tornare a posto.

⛔ **Un webhook di modifica prodotto NON basta a dichiarare eliminata una variante.** Prima
della decisione VestiFlow deve **verificare lo stato remoto completo** interrogando Shopify:
un payload parziale che non nomina una variante non è la prova che non esista più — è la
regola già scritta in §13.1 («non considerare il payload parziale come fotografia completa»),
qui applicata al caso in cui sbagliarsi costa una riga di magazzino.

#### ⛔ Il meccanismo che dovrebbe innescare questa sezione NON esiste — misurato il 06/09/2026

Questa sezione descrive **come reagire**, non **quando**. Verificato nel codice:

- `SHOPIFY_WEBHOOK_TOPICS` (`shopify-webhook-topics.ts`) **non contiene `products/delete`**:
  nessuna sottoscrizione, nessuna registrazione, nessun evento in arrivo. Se il titolare
  cancella un prodotto su Shopify oggi, **VestiFlow non lo saprà mai** finché qualcosa non
  tenta di aggiornarlo e fallisce;
- Shopify **non ha un webhook di cancellazione variante**: l'unico segnale possibile è
  l'assenza da un `products/update` (già coperto sopra) o una verifica esplicita — nessuna
  delle due è oggi implementata come innesco di questa sezione;
- il trattamento del `404` (punto ⛔ sopra) **non esiste nel codice**: `shopify-admin-http.
client.ts` intercetta il `404` solo per le `DELETE` in uscita (e lo tratta come successo,
  perché quella chiamata sta per essere rimossa — vedi debito in `DA-FARE.md`); su una lettura
  o un aggiornamento un `404` diventa oggi un errore generico indistinguibile da qualunque
  altro fallimento di rete.

⚠️ **Questa sezione descrive quindi un bersaglio senza grilletto**: il protocollo è deciso, ma
oggi nessun evento e nessun controllo lo attiva. È lavoro di tranche, non debito da correggere
in una riga.

⭐ **Il modello che dà a questa sezione dove scrivere il proprio esito è SCRITTO E COLLAUDATO
in locale** (§8.5.2): identità remote `shopify_product_identities` /
`shopify_variant_identities` e periodi `shopify_product_links` / `shopify_variant_links`, con
gli stati `active` / `remotely_deleted` / `unlinked` che sostituiscono ogni interpretazione ad
hoc di «eliminato».

⚠️ **Ma resta un bersaglio senza grilletto anche per un secondo motivo**: le tabelle esistono
e **nessun servizio le scrive**. Mancano il backfill e il passaggio dei lettori (§8.5.8), che
sono lavoro di tranche: il modello verificato non è il modello in servizio.

### 11.8 Prevenzione della reimportazione

> ✅ **Decisione confermata** (03/09/2026)

Dopo l'eliminazione definitiva locale, VestiFlow conserva **esclusivamente il riferimento
tecnico minimo** necessario a riconoscere l'ID Shopify **escluso**.

Questo riferimento:

- **non** conserva l'anagrafica dell'articolo;
- **non** conserva giacenze, impegni, movimenti o documenti;
- **impedisce** che il normale pull Shopify ricrei automaticamente l'elemento;
- può essere superato **soltanto da un comando amministrativo esplicito** di nuova
  importazione.

⚠️ **Senza di esso l'eliminazione definitiva non è definitiva**: il prodotto resta su Shopify
— archiviato, ma presente (§11.1) — e il primo pull lo riporterebbe dentro come articolo
nuovo, senza storia e senza giacenza. L'operatore lo eliminerebbe di nuovo, e di nuovo.

⛔ **La struttura tecnica non si decide qui.** Tabella, forma e collocazione del riferimento
appartengono a chi implementa: questa sezione dichiara il **risultato**, non il come.

#### ⛔ La sua assenza è già sfruttabile OGGI — confermato leggendo il codice il 06/09/2026

Non è solo «non ancora costruita»: è una lacuna **attiva**. `importProductFromWebhook`
(`shopify-product-pull.service.ts:175`) cerca il prodotto locale con

```ts
const existing = await this.prisma.product.findFirst({ where: { tenantId, shopifyProductId } });
```

e se `existing` è `null` **procede a `product.create`** (riga 344). Un `shopifyProductId` mai
visto e un `shopifyProductId` **eliminato definitivamente in VestiFlow** producono lo stesso
`null`: il codice non li distingue, perché non esiste alcuna tabella di esclusione da
interrogare. Il controllo di sincronizzazione spenta (`syncSpentaPerRemoto`) non aiuta: su un
prodotto mai trovato restituisce `false` (nessuna riga da cui leggere il flag), quindi non
salta l'importazione.

⚠️ **Conseguenza pratica**: se oggi esistesse già l'eliminazione definitiva (non esiste, §0-bis
voce 2), il primo `products/update` o `products/create` in arrivo per quello stesso
`shopifyProductId` **lo ricreerebbe**, esattamente lo scenario che questa sezione esiste per
impedire. Non è ipotetico: è il comportamento che il codice produce oggi, verificato leggendo
la funzione.

⭐ **Il «riferimento tecnico minimo» che questa sezione chiedeva è SCRITTO** (§8.5.2), e non è
il periodo: è l'**identità remota** — `shopify_product_identities` con `local_deleted_at`
valorizzato e `original_product_id` intatto.

⛔ **La distinzione conta.** Un periodo chiuso dice che _quel collegamento_ è finito; è
l'identità a dire che _quel GID appartiene a quell'articolo, per sempre_, ed è lei a
sopravvivere all'eliminazione definitiva dell'anagrafica — proprio perché
`original_product_id` **non porta una chiave esterna**. Cercare l'esclusione fra i periodi
avrebbe lasciato passare la reimportazione nel caso che questa sezione esiste per impedire.

⚠️ `findFirst` dovrà interrogare le **identità** prima di concludere «mai visto» (§8.5.4). Non
lo fa ancora: le tabelle sono vuote finché non c'è il backfill.

### 11.9 Pubblicazione successiva

> ✅ **Decisione confermata** (06/09/2026)

«Pubblica nuovamente su Shopify» è il comando che segue un'entità **Eliminata su Shopify**
(§3.1, §3.7) o **Mai pubblicato**. Non è un sinonimo di «Rimetti in vendita»: quel comando
presuppone che l'entità esista ancora (§10.3); questo presuppone che non esista, e deve
crearla.

1. **crea una nuova entità su Shopify**, con **nuovi identificativi**: non esiste un vecchio
   GID da far rivivere;
2. gli identificativi **precedenti restano nello storico** (§11.8): non si cancellano, non si
   riassegnano, restano un fatto del passato;
3. pubblica **soltanto le varianti locali Attive e abilitate per Shopify** — una variante Non
   attiva o nel cestino non risale sul canale come effetto collaterale di questo comando;
4. **non riusa silenziosamente il vecchio collegamento**: anche se un id remoto storico
   sembrasse ancora valido, questo comando non tenta di riagganciarlo — crea, non ripara;
5. **richiede conferma esplicita** se esistono possibili corrispondenze create manualmente su
   Shopify nel frattempo: un titolare che ha già ricreato a mano il prodotto durante l'assenza
   di VestiFlow non deve trovarsi con un duplicato silenzioso.

⛔ **La forma tecnica del punto 5 non è decisa qui**: quali segnali contano come «possibile
corrispondenza» (stesso SKU? stesso titolo? stesso handle?) è un lavoro di tranche, non una
regola funzionale già scritta.

---

## 12. Prima sincronizzazione: riconciliazione, baseline e attivazione

> 🔧 **PROPOSTA DA ESAMINARE — l'intero capitolo.**
>
> I nove passi qui descritti sono una forma ipotizzata del wizard, non un flusso approvato. Nessuna sottosezione di questo capitolo autorizza un'implementazione.

### 12.0 Il primo allineamento degli ARTICOLI — due direzioni approvate, 07/09/2026

> **Stato aggiornato al 10/09/2026:** due direzioni iniziali approvate e partenza controllata
> delle quantità confermata in §8.11.2. Restano da realizzare i dettagli tecnici; il wizard
> completo qui proposto non è autorizzato implicitamente da quelle decisioni.

⭐ **La COMPLETEZZA di questo allineamento è ora un requisito confermato, e vive in §8.9.1**:
nessuna priorità fra campi, un articolo parziale non è completato, e interruzioni o
ripetizioni non producono perdite né duplicazioni. ⚠️ Con esso vanno letti §8.9.4 — le
modifiche che arrivano **durante** l'allineamento non si perdono — e §8.9.3, che introduce
una precedenza fra tipi di aggiornamento valida **solo a regime**, non qui.

⚠️ **Qui c'era «la progettazione è SOSPESA», e non vale più.** La sospensione era
totale e nasceva da un problema vero — non esiste una regola affidabile per
stabilire l'identità di un articolo fra le due piattaforme — ma quel problema si
aggira scegliendo **da dove si parte**, invece di risolverlo dopo.

#### Le due direzioni

|                            |                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 · Parto da Shopify**   | si importano prodotti e varianti in VestiFlow **conservando gli identificativi remoti**, e i collegamenti si registrano **durante l'importazione**                  |
| **2 · Parto da VestiFlow** | si prepara il catalogo a mano o via CSV; quando VestiFlow **crea** prodotti e varianti su Shopify, registra gli identificativi restituiti e i relativi collegamenti |

⭐ **In entrambi i casi la corrispondenza non si deduce: discende dall'operazione
stessa.** Chi importa sa da quale prodotto remoto è nato ogni articolo locale;
chi crea sa quale identificativo Shopify ha appena restituito. ⛔ **Nome, SKU e
barcode non entrano nella determinazione dell'identità**, in nessuno dei due
percorsi — è la stessa regola di §8.5.4 e §11.9.

⚠️ **Questa scelta riguarda esclusivamente il punto di partenza.** La matrice dei
campi bidirezionali e unidirezionali di **§9.2 resta invariata**: da dove si parte
non cambia chi possiede cosa.

#### ⛔ I limiti, che vanno dichiarati e non aggirati

- **Due cataloghi già popolati**, con articoli apparentemente uguali e senza
  collegamenti certi, **non sono risolti** da nessuna delle due direzioni. Il
  caso resta aperto.
- **Un CSV ordinario non dimostra l'identità** di articoli già presenti su
  Shopify: crea articoli locali, non prova che corrispondano a quelli remoti.
- **Nessuna fusione automatica**, nessuna cancellazione, nessuna sostituzione
  implicita del catalogo di destinazione.
- **La scelta delle giacenze iniziali per sede resta da definire**: importare le
  anagrafiche **non autorizza** a sommare o sovrascrivere quantità (§12.9).

#### L'importazione CSV che esiste già

⚠️ **Non è da scrivere: è da verificare e adattare.** E non è nemmeno «solo
locale»: l'importazione **innesca già un invio ai canali**. Vanno tenuti distinti
quattro livelli, perché l'adattamento li tocca tutti.

| #   | Livello                                | Che cosa fa oggi (letto il 07/09/2026)                                                                                                                                                                                                                        |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **creazione locale dal CSV**           | `shopify-csv.parse.ts` e `shopify-csv.mapper.ts` producono prodotti e varianti **locali**. Formato accettato: quello **di Shopify** — handle, tag e prezzi decimali passano dai mapper Shopify. ⛔ Non è «un CSV qualsiasi». Nel mapper non compare alcun GID |
| 2   | **invio automatico ai canali**         | `ProductsImportService` chiama `channelSync.enqueueProductPush` **dopo ogni creazione**. È post-commit e non bloccante: un fallimento diventa un `logger.warn` e l'import riesce lo stesso                                                                    |
| 3   | **registrazione degli identificativi** | la fa il **percorso di pubblicazione**, non il CSV: `shopify-product-push.service.ts` scrive `shopifyProductId`, `shopifyVariantId` e `shopifyInventoryItemId` **nelle colonne legacy**                                                                       |
| 4   | **nuovo storico dei collegamenti**     | ⛔ **non ancora adottato da nessun servizio**: le tabelle esistono e restano vuote (§8.5.5)                                                                                                                                                                   |

⭐ **La distinzione è tutta qui**: l'assenza di GID nel mapper dimostra che **il
mapper** non ricostruisce collegamenti remoti — non che l'importazione resti
locale. Su un tenant Shopify un catalogo caricato da CSV **viene pubblicato**, e
gli identificativi tornano indietro per la via del push.

⛔ **Non va quindi descritta come assente, né come già conforme al primo
allineamento.** Il suo adattamento dovrà considerare anche gli **effetti
successivi al caricamento**: se e quando l'invio automatico debba scattare
durante un primo allineamento, che cosa accade alle righe che falliscono in
silenzio, e come il percorso di pubblicazione registrerà i collegamenti **nel
nuovo modello** oltre che nelle colonne legacy.

⚠️ Che cosa cambiare — e se il formato Shopify resti l'unico accettato — è parte
dei dettagli operativi ancora aperti.

#### ⏸ Il futuro CSV ESTESO VestiFlow — requisito registrato, da non implementare ora

⚠️ **Due formati, e non vanno confusi**:

|                          |                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV di Shopify**       | quello che l'export di Shopify produce e che l'import odierno accetta. ⛔ **Non porta identificativi remoti**: handle, titolo, opzioni, prezzi. Da un file così **nessuna corrispondenza remota è dimostrabile** |
| **CSV esteso VestiFlow** | non esiste ancora. Aggiunge **colonne opzionali** che dichiarano l'identità remota, e solo grazie a quelle un caricamento può registrare collegamenti                                                            |

##### Che cosa dovrà fare, quando si farà

**Le colonne sono DUE e distinte** — l'ID prodotto Shopify e l'ID variante
Shopify — perché rispondono a due domande diverse e possono essere presenti una
senza l'altra.

**Prima di scrivere qualunque cosa, si verifica:**

- il **negozio di provenienza**: un identificativo di un altro negozio non vale
  per questo;
- che la **variante appartenga davvero al prodotto indicato**, e non a un altro.

⭐ **Solo dopo le verifiche** i riferimenti si conservano nel **nuovo modello dei
collegamenti** — identità remote e periodi (§8.5.2) — non nelle sole colonne
legacy.

**Che cosa non deve poter accadere:**

- ⛔ **riassegnare un'identità già associata a un altro articolo**: è la
  condizione che il modello impone per costruzione, e il CSV non fa eccezione;
- ⛔ **riaprire automaticamente un collegamento chiuso**: un collegamento si
  chiude per una ragione, e un file caricato non è quella ragione;
- ⛔ **creare copie su Shopify quando gli identificativi sono validi**: l'articolo
  remoto **esiste già**, e ricrearlo è il duplicato che tutto questo impianto
  serve a evitare;
- ⛔ **ripiegare sulla creazione quando gli identificativi sono errati o
  incoerenti**: si **segnala il problema** e ci si ferma su quella riga. Il
  ripiego silenzioso su «allora lo creo» è il modo in cui un errore di battitura
  diventa un catalogo doppio.

**E ripetere l'importazione non deve duplicare nulla** — né prodotti, né
varianti, né collegamenti. L'idempotenza è un requisito, non una proprietà
sperata: un file ricaricato per sbaglio è il caso normale, non l'eccezione.

##### ⛔ Due cose che un identificativo NON autorizza

**Un CSV senza queste colonne non dimostra alcuna corrispondenza remota.**
Resta un caricamento di anagrafiche locali, e ricade nella direzione 2.

**E nemmeno un ID valido, da solo, autorizza a fondere due articoli locali
preesistenti.** Sapere che il prodotto remoto X corrisponde all'articolo locale A
non dice nulla su che cosa fare dell'articolo locale B che gli somiglia: la
fusione di due anagrafiche locali è un'altra decisione, che nessun file può
prendere.

##### Dipendenze e perimetro

⚠️ **Questo requisito poggia sul modello a identità e periodi**, che oggi esiste
come schema ma **non è adottato da alcun servizio** (§8.5.5). Non si implementa
prima che quel modello sia adottato e collaudato.

⛔ **Restano invariati**: le giacenze iniziali (aperte, §12.9), la matrice dei
campi (§9.2) e il piano tecnico corrente. Questo requisito riguarda **come nasce
un collegamento da un file**, non chi possiede cosa né quante unità ci sono.

#### Che cosa NON diventa approvato

⛔ **Il wizard a nove passi di questo capitolo resta una proposta**, e le
schermate di corrispondenza fra articoli (§12.6) **non sono approvate**. Le due
direzioni qui sopra non passano da un matching: lo rendono superfluo, che è
un'altra cosa dal renderlo valido.

Fino a nuova progettazione restano esclusi:

- proposte automatiche di corrispondenza;
- collegamenti dedotti da nome, SKU o barcode;
- creazioni automatiche che possano produrre duplicati;
- importazione di quantità per varianti non già collegate in modo certo;
- interfacce di abbinamento.

⚠️ **Una schermata di abbinamento non risolve il problema: lo sposta
sull'operatore.** Confermare centinaia di corrispondenze proposte su basi
inaffidabili produce conferme date per stanchezza, e un duplicato confermato a
mano è indistinguibile da uno corretto.

#### Che cosa NON è il primo allineamento

⛔ **La riconnessione allo stesso negozio non lo ripete.** Conserva i
collegamenti e segue il recupero già deciso in §1.15.2 — dall'**ultimo checkpoint
riuscito**, idempotente, senza duplicare gli effetti.

⛔ **E il backfill non è la procedura dell'operatore.** Il backfill (§8.5.8,
fase 3) è la conversione tecnica dei collegamenti **già esistenti** nelle colonne
legacy verso il modello a identità e periodi: non chiede nulla a nessuno e non
crea articoli. Sono due lavori distinti e non si sostituiscono.

⭐ **Che cosa NON è mai stato sospeso**: §12.4 (sedi e location) segue §1.13, che
è decisa. Connessione, verifica tecnica e ordini seguono §1.15, anch'essa decisa.

### 12.1 Stati della connessione

La connessione distingue almeno:

- modulo Shopify non disponibile per il tenant;
- modulo disponibile ma non configurato;
- collegato, onboarding non iniziato;
- onboarding in corso;
- pronto per anteprima;
- attivazione in corso;
- regime continuativo attivo;
- sospeso;
- errore che richiede intervento.

Un tenant senza modulo Shopify non vede menu, campi, banner, indicatori o errori Shopify.

### 12.2 Blocco iniziale

Prima del completamento:

- niente push automatico;
- niente applicazione automatica dei webhook al catalogo;
- gli eventi possono essere ricevuti e accodati per deduplica, ma non applicati fuori baseline;
- ogni lettura o anteprima è non distruttiva.

### 12.3 Step 0 — Verifica tecnica

Mostrare:

- negozio e shop domain;
- versione API richiesta ed effettiva;
- scope presenti e mancanti;
- topic webhook attesi e registrati;
- capacità di leggere prodotti, varianti, publication, location e inventario;
- impostazione prezzi comprensivi di imposta con data lettura;
- conteggi Shopify e VestiFlow;
- eventuale uso di feature non supportate.

Nessuna scrittura.

### 12.4 Step 1 — Sedi e location

⭐ **La regola vive in §1.13**, che è la sede canonica della decisione. Qui resta
solo ciò che riguarda il passo del wizard.

⛔ **Qui c'era «proposta per nome solo come aiuto» dentro un elenco che non
diceva altro**, e letta insieme a «nessuna duplicazione automatica prima del
matching» lasciava intendere che dopo il matching una duplicazione automatica ci
fosse. §1.13 chiude la questione: **il collegamento non è mai automatico**, né
prima né dopo, e nome e indirizzo non sono prove d'identità.

Il passo presenta le due liste — location Shopify e sedi VestiFlow — e per ogni
riga **non collegata** offre le tre scelte di §1.13.1: collegare a una esistente,
crearne una sull'altra piattaforma, o lasciarla dov'è.

- conferma **umana** per ogni collegamento;
- possibilità di **escludere** una location;
- una proposta per nome può comparire come **aiuto alla lettura**, mai applicata;
- **nessuna** creazione o duplicazione automatica, in nessun momento;
- **nessuna** sincronizzazione di nome e indirizzo (§1.13.2).

Il flusso standard è **uno-a-uno** dentro lo stesso negozio Shopify. Le
configurazioni molti-a-uno o uno-a-molti richiedono una regola di ripartizione
delle quantità che non esiste e non è stata chiesta.

⛔ **Nessun fallback su «la prima sede».** Se una location non è collegata, le
sue quantità non vanno da nessuna parte: non esiste una sede di ripiego, né
alfabetica né per data di creazione. È la conseguenza diretta di §1.13 — senza
collegamento non si sincronizza niente.

### 12.5 Step 2 — Lettura snapshot remoto

Acquisire in modo paginato:

- prodotti e stato;
- opzioni e varianti;
- SKU, barcode, prezzi, compare-at price;
- inventory item e tracking;
- media;
- publication prodotto e variante;
- metafield/collezioni necessari;
- quantità per location mappata;
- timestamp e cursori.

La lettura viene identificata da un `reconciliationRunId`. Se scade o il remoto cambia sostanzialmente, l'anteprima viene rigenerata.

### 12.6 Step 3 — Matching prodotti e varianti

> ⛔ **NON APPROVATA, e resa superflua dalle due direzioni di §12.0.** L'ordine
> di affidabilita` qui sotto resta una proposta, e la sua parte automatica e`
> esclusa: nessun collegamento per SKU, barcode, nome o opzioni, nemmeno come
> proposta applicata.
>
> ⭐ Nei due percorsi approvati **non c'e` un matching da fare**: la
corrispondenza discende dall'importazione o dalla creazione. Questa sezione
resta scritta perche` descrive il caso che le due direzioni **non** risolvono
> — due cataloghi gia` popolati senza collegamenti certi — che e` tuttora
> aperto.

Ordine di affidabilità:

1. GID già salvato e coerente;
2. metafield tecnico VestiFlow;
3. collegamento precedentemente confermato;
4. SKU univoco e non ambiguo;
5. barcode univoco e non ambiguo;
6. proposta per nome/opzioni, mai automatica.

Per un prodotto semplice già presente su entrambe le parti, la singola variante Shopify standalone può essere proposta come corrispondenza della singola variante base locale solo se il prodotto è già stato collegato o il prodotto stesso è stato confermato nello step corrente. La parola `Default Title` da sola non costituisce una corrispondenza.

Ogni elemento finisce in uno stato:

- collegato con certezza;
- candidato da confermare;
- presente solo in VestiFlow;
- presente solo in Shopify;
- conflitto;
- duplicato/ambiguo;
- escluso esplicitamente.

Nessun match ambiguo viene applicato in silenzio.

### 12.7 Step 4 — Decisione di direzione

Sono supportati nello stesso wizard:

- Shopify popolato, VestiFlow vuoto;
- VestiFlow popolato, Shopify vuoto;
- entrambi popolati.

Nel caso misto la decisione è per gruppo o record, non una sovrascrittura globale obbligatoria. L'anteprima mostra quali campi cambiano su ciascun lato.

### 12.8 Step 5 — IVA e prezzi

Shopify non fornisce un Codice IVA VestiFlow per prodotto.

La procedura:

- legge se i prezzi negozio sono inclusivi di imposta;
- conserva valore e data lettura;
- permette assegnazione del Codice IVA per gruppi e selezioni;
- può usare collezioni solo per raggruppare, mai per dedurre aliquote;
- mantiene lo stato `da definire` distinto da `eredita predefinito`;
- mostra il ricalcolo prima della conferma;
- usa precisione a sei decimali;
- non blocca l'onboarding per dati incompleti, ma li rende filtrabili e correggibili.

Un lordo 25,00 al 22% deve tornare 25,00 dopo scorporo e ricomposizione.

### 12.9 Step 6 — Baseline inventariale

> **Aggiornamento del 10/09/2026:** il funzionamento della partenza controllata, anche in più
> passaggi e a vendite aperte per scelta dell'operatore, è approvato in §8.11.2. Non è più una
> domanda aperta su come l'utente debba lavorare. Le modalità tecniche di questo step restano
> invece una proposta: il documento di apertura e il wizard descritti sotto non sono autorizzati
> implicitamente. La scelta del catalogo non autorizza somme di sedi né un riallineamento
> automatico nascosto nel primo invio ordinario.

Le quantità vengono trattate solo dopo la mappatura location.

Per la direzione Shopify → VestiFlow:

- la quantità iniziale usa `available` secondo la decisione esistente;
- nasce da un documento di apertura e dai suoi movimenti;
- conserva lettura, data, location, sede, operatore e run;
- accetta quantità negative con avviso;
- non importa lo storico ordini precedente al cutover.

Per la direzione VestiFlow → Shopify:

- VestiFlow non viene azzerato dai valori provvisori Shopify;
- l'anteprima mostra quantità pubblicabile per variante × location;
- la scrittura usa `inventorySetQuantities` idempotente.

### 12.10 Step 7 — Pubblicazioni

Mostrare una matrice:

```text
prodotto / variante × Negozio online / Shop / POS / altre publication gestite
```

L'operatore decide quali publication VestiFlow governa. Le altre restano osservate o escluse.

La baseline salva:

- stato rilevato;
- stato desiderato;
- origine della decisione;
- data e run.

### 12.11 Step 8 — Anteprima completa

> ⛔ **NON APPROVATA nella forma qui descritta per gli ARTICOLI**: l'anteprima
> elenca creazioni e collegamenti che dipendono da un matching che le due
> direzioni di §12.0 non usano. Resta valida la forma — si conferma cio` che
accadra`, non cio` che si spera — e resta valida per sedi e ordini.
>
> ⚠️ Che cosa mostri l'anteprima nei due percorsi approvati e` parte dei
> **dettagli operativi ancora aperti**.

Prima di scrivere mostrare:

- creazioni;
- collegamenti;
- aggiornamenti per campo;
- varianti da creare;
- nessuna variante da eliminare implicitamente;
- prodotti/varianti da portare allo stato non attivo o lasciare invariati;
- quantità da impostare;
- publication da aggiungere/rimuovere;
- anomalie;
- elementi esclusi;
- stima delle operazioni API.

L'anteprima è esportabile e identificata da hash. La conferma vale solo per quell'hash.

### 12.12 Step 9 — Esecuzione e cutover

1. Congelare l'anteprima confermata.
2. Registrare l'istante di cutover.
3. Eseguire operazioni tramite outbox.
4. Conservare risultati elemento per elemento.
5. Riprendere dopo interruzione senza duplicare.
6. Verificare conteggi, mapping e quantità.
7. Attivare il regime continuativo.
8. Elaborare gli eventi successivi al confine con sovrapposizione temporale e deduplica.

Gli ordini con `createdAt` precedente al confine non entrano automaticamente. Gli eventi successivi relativi a ordini precedenti vengono registrati e ignorati con motivo.

### 12.13 Ripetizione

La prima sincronizzazione completata non torna un pulsante ordinario. Rimane un riepilogo consultabile.

Un nuovo allineamento completo è un comando separato:

- produce nuova anteprima;
- dichiara cosa può cambiare;
- non cancella varianti per omissione;
- richiede conferma rafforzata.

---

## 13. Sincronizzazione continuativa

> 🔧 **PROPOSTA TECNICA — l'intero capitolo.**
>
> Webhook, outbox, ownership, riconciliazione e monitoraggio sono qui descritti in una forma possibile. La regola funzionale — cosa deve succedere — è in parte confermata altrove; il _come_ di questo capitolo no.

### 13.1 Eventi in ingresso

Ogni webhook:

- verifica HMAC prima di associare il tenant;
- salva identificatore evento/topic/shop;
- è idempotente;
- conserva payload grezzo secondo policy dati;
- non considera il payload parziale come fotografia completa;
- accoda una lettura GraphQL quando serve arricchimento;
- applica soltanto la allowlist del campo/topic.

⭐ **«Salva identificatore evento» e «è idempotente» sono ora il registro delle consegne
di §8.5.3**, non una frase generica: `X-Shopify-Webhook-Id` deduplica, `X-Shopify-Triggered-At`
ordina, `X-Shopify-Event-Id` correla. Un duplicato risponde `200` senza ripetere effetti **e
senza far apparire conclusa** una consegna mai elaborata (§8.5.3).

#### ⭐ Spegnere la sincronizzazione NON deve fermare tutto — deciso il 06/09/2026

> **«Disattiva sincronizzazione» ferma l'allineamento automatico di catalogo e inventario, e
> mostra che Shopify non sarà più mantenuto da VestiFlow. Non deve impedire l'elaborazione
> degli eventi necessari alla sicurezza e allo storico: cancellazioni remote, ordini,
> pagamenti e resi continuano a essere acquisiti e collegati.**

⭐ **Verificato il 06/09/2026: per ordini e inventario è già così.** `applyOrderFromShopify` e
`applyInventoryLevelFromShopify` (`shopify-sync.service.ts`) **non leggono
`Product.shopifySyncEnabled`**: solo `products/create` e `products/update` lo controllano,
tramite `shopify-product-pull.service.ts`. Un ordine o un reso legati a un prodotto con la
sincronizzazione spenta vengono acquisiti lo stesso.

⛔ **Ma «cancellazioni remote» non può ancora rientrare in questa regola**: non c'è un evento
da lasciar passare, perché non esiste (§11.7, il paragrafo sul meccanismo mancante). Il vincolo
è corretto e va rispettato quando quell'evento sarà costruito; oggi non c'è nulla da eccettuare.

⛔ **Registrato come debito, non come questa regola**: lo spegnimento della sincronizzazione
**per prodotto** archivia oggi anche il prodotto remoto (`archiveOnSyncDisabled`), che è un
fatto di **Vendita**, non di scambio dati — vedi §1.11 e `DA-FARE.md`. Questa sezione non lo
risolve: dice solo che gli eventi di sicurezza/storico non vanno bloccati, non tocca
l'accoppiamento sync↔archiviazione.

### 13.2 Eventi in uscita

Ogni modifica locale significativa crea un'intenzione deduplicabile:

- aggiornamento prodotto;
- aggiornamento variante;
- cambio struttura opzioni;
- cambio prezzo canale;
- cambio publication;
- cambio quantità;
- stato locale non attivo;
- riattivazione;
- eliminazione.

Operazioni più recenti possono sostituire quelle obsolete sullo stesso aggregate, salvo quelle già inviate al canale.

⚠️ Qui c'era «salvo le operazioni **distruttive** già inviate». Verso Shopify VestiFlow non ne esegue (§11.1): l'eccezione vale per qualunque operazione già partita, il cui esito non si può più annullare accodandone un'altra.

### 13.3 Riconciliazione periodica

I webhook non sono prova di allineamento permanente. Un processo periodico confronta:

- mapping prodotto/varianti;
- hash campi governati;
- publication gestite;
- quantità pubblicabili;
- topic webhook e versione API;
- operazioni sospese.

La riconciliazione corregge automaticamente solo i dati di cui VestiFlow è fonte primaria e per i quali la correzione è dichiarata. Le divergenze bidirezionali producono una voce risolvibile.

### 13.4 Pausa

L'interruttore di pausa ferma entrambe le direzioni applicative:

- nessun push;
- nessuna applicazione inbound;
- ricezione e deduplica tecnica possono continuare;
- alla ripresa si esegue una riconciliazione, non una riproduzione cieca di eventi vecchi.

### 13.5 Stato visibile

Non esiste un unico verde globale che cancelli errori diversi.

Mostrare almeno:

- catalogo;
- inventario;
- pubblicazioni;
- ordini;
- webhook;
- ultima riconciliazione;
- operazioni pendenti;
- errori per tipo con messaggio originale e ultimo tentativo.

---

## 14. API applicative da introdurre o modificare

I nomi definitivi seguono le convenzioni del repository; il contratto funzionale è obbligatorio.

### 14.1 Preflight

#### La parte funzionale

> ✅ **Decisione confermata**

Prima di un'eliminazione:

- vengono mostrate le **conseguenze reali**, non un avviso generico;
- l'operatore **conferma**;
- il server **ricontrolla** che quelle conseguenze non siano cambiate nel frattempo;
- richieste ripetute **non duplicano** l'operazione.

⭐ Sono quattro requisiti, e nessuno dei quattro dice _come_. È tutto ciò che il proprietario ha deciso.

#### Il dettaglio tecnico

> 🔧 **Proposta tecnica da verificare** — nessuno di questi punti è una decisione funzionale, e non vanno implementati come se lo fossero.

```text
GET /products/{productId}/deletion-impact
GET /products/{productId}/variants/{variantId}/deletion-impact
```

Risposta ipotizzata: snapshot identificativo, contatori e quantità, stato locale, stato Shopify verificato o `unknown`, conseguenza ultima variante.

⚠️ **Hash, token, scadenze e meccanismo di idempotenza sono dettagli tecnici da definire.** Il documento li elencava fra i contenuti della risposta come se fossero acquisiti: «token/hash di conferma con scadenza breve» è **una** forma possibile del terzo e del quarto requisito funzionale, non la loro definizione.

### 14.2 Comandi

> 🔧 **Proposta tecnica da verificare**

```text
POST /products/{id}/out-of-use
POST /products/{id}/reactivate
DELETE /products/{id}
POST /products/{id}/restore

POST /products/{id}/variants/{variantId}/out-of-use
POST /products/{id}/variants/{variantId}/reactivate
DELETE /products/{id}/variants/{variantId}
POST /products/{id}/variants/{variantId}/restore
```

Il `DELETE` riceve:

- token/hash del preflight;
- presa visione;
- motivazione facoltativa o obbligatoria secondo policy;
- idempotency key client.

Se l'impatto è cambiato in modo rilevante dal preflight, il server restituisce il nuovo impatto e richiede una nuova conferma. Non blocca per la dipendenza: impedisce una conferma su informazioni vecchie.

### 14.3 Nessuna cancellazione implicita nel DTO prodotto

> ✅ **Decisione confermata**

`UpdateProductDto.variants` aggiorna o crea ciò che contiene. Non elimina ciò che manca.

Le eliminazioni passano esclusivamente dall'endpoint dedicato. Se il form propone una nuova matrice opzioni, deve inviare comandi espliciti per le varianti rimosse dopo conferma.

---

## 15. Migration dati

### 15.1 Additive prima, vincoli dopo

> 🔧 **Proposta tecnica da verificare**

Ordine:

1. aggiungere colonne nullabili e tabelle nuove;
2. distribuire codice dual-read/dual-write dove necessario;
3. backfill soltanto da fonti vere;
4. verificare copertura;
5. rendere obbligatori solo i campi realmente garantiti;
6. rimuovere i vecchi percorsi dopo cutover.

### 15.2 Dati minimi nuovi

> 🔧 **Proposta tecnica da verificare**

Da validare sullo schema reale prima della migration:

- ✅ metadati cestino su `Product` e `ProductVariant` — **fatto**, Tranche 1A (§3.2, §3.3);
- ✅ lifecycle variante — **fatto**, Tranche 1A (§3.3);
- snapshot identità su `DocumentLine`;
- snapshot identità e ricavo su `StockMovement`;
- tabella publication variante × canale;
- tabella operazioni Shopify/outbox;
- tabella tentativi/esiti o log append-only;
- stato onboarding e reconciliation run;
- mapping e hash di sincronizzazione;
- API version effettiva osservata.

### 15.3 RLS e tenant

> ✅ **Decisione confermata**

Ogni tabella tenant-owned:

- ha `tenantId` obbligatorio salvo deroga esplicita per eventi rifiutati prima dell'autenticazione;
- ha indice coerente con le query per tenant;
- ha RLS e verifica automatica;
- non accetta ID di prodotto/variante di un altro tenant;
- include tenant nelle chiavi applicative e nelle operazioni outbox.

### 15.4 Rollback migration

> 🔧 **Proposta tecnica da verificare**

Il rollback non deve cancellare snapshot acquisiti. Se una release applicativa viene ritirata:

- le colonne additive restano;
- il vecchio codice deve tollerarle;
- l'outbox viene sospesa;
- non si ripristina il push REST annidato dopo che il nuovo motore ha iniziato a gestire le varianti.

---

## 16. Tranche di implementazione

### Tranche 0 — Fermare i difetti storici

**Obiettivo:** impedire che numeri e identità del passato cambino prima di abilitare l'eliminazione.

Lavori:

1. far **convergere** il consumatore del vecchio export sul Registro canonico, e poi dismettere quel percorso — ⛔ non ripararlo;
2. introdurre gli snapshot mancanti su righe e movimenti;
3. coprire tutti i DTO e i workflow documentali;
4. aggiungere test di invarianza storica sul **Registro canonico e sui suoi export**.

⛔ **Sono spariti due lavori.** «Sostituire il prezzo corrente con il valore storico vero» riguardava il percorso da dismettere. «Definire backfill non inventato» non si applica: i dati presenti sono dati di prova (§5.5).

**Gate:** cambiando nome, prezzo, barcode e IVA dell'articolo o eliminandolo logicamente, documento, stampa, movimenti, Corrispettivi e analisi dello stesso periodo non cambiano.

#### Stato di esecuzione, al 02/09/2026

La Tranche 0 si esegue a fette, una alla volta, con verifica prima di passare alla successiva.

⚠️ **La Tranche 0 non è ancora completata**, ma le fette 0A.1, 0A.2a, 0A.2b, 0A.2c e
0B.1 sono chiuse. Restano il contratto autonomo dei movimenti e la lacuna dichiarata del
percorso «Concludi ordine».

|           |                                                                                                               |                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0A.1**  | **totali economici di riga sul percorso generico**                                                            | ✅ **completata e verificata**, con i test eseguiti                                                                                                                                              |
| **0B.1**  | **filtro Sede del Registro canonico**                                                                         | ✅ **completata e verificata**, con i test eseguiti                                                                                                                                              |
| **0A.2a** | **snapshot identificativi di riga sul percorso generico**                                                     | ✅ **completata e verificata**, con i test eseguiti                                                                                                                                              |
| **0A.2b** | **consumo degli snapshot: riapertura, interfaccia, stampa**                                                   | ✅ **completata e verificata**, con i test eseguiti                                                                                                                                              |
| **0A.2c** | **duplicazioni e conversioni: gli snapshot seguono la riga sorgente**                                         | ✅ **completata e verificata**, con i test eseguiti                                                                                                                                              |
| —         | «Concludi ordine» (ordine cliente → documento)                                                                | ⏸ **lacuna dichiarata**: `SalesOrderLine` non ha `articleCode` né `productName`                                                                                                                  |
| —         | **convergenza Corrispettivi**                                                                                 | ✅ **fatta il 03/09/2026**: il vecchio export è stato rimosso, il Registro canonico è l'unica fonte                                                                                              |
| —         | contratto autonomo dei movimenti (§5.3)                                                                       | ⏸ da fare                                                                                                                                                                                        |
| **1A**    | **modello locale del ciclo di vita**: `lifecycleStatus`, cestino, indici, migration                           | ✅ **completata e verificata il 03/09/2026**, commit `8bf85363` — build, 2345 unit, 72 integrazione                                                                                              |
| **1B**    | **esposizione e visibilità**: predicati, elenco/Cestino/selezioni, etichette, guardia §6.2                    | ✅ **completata il 03/09/2026** — vedi commit `feat(catalogo): applica visibilità e stati`                                                                                                       |
| —         | cestino e ripristino come COMANDI, eliminazione definitiva                                                    | ⚠️ i **quattro comandi API** sono scritti (08/09/2026, `DA-FARE` §17); restano l'interfaccia, il registro e il collaudo operativo, e per gli articoli **collegati** il cestino non è disponibile |
| —         | interruttore Shopify: ferma anche le giacenze, `ARCHIVED` (§1.8)                                              | ✅ **fatto il 03/09/2026** · ⏸ resta l'unpublish per variante (`publishablePublish`, Tranche 3)                                                                                                  |
| —         | nome interno separato dal «Nome Shopify» (§1.9)                                                               | ✅ **fatto e provato sullo shop il 03/09/2026** · ⏸ resta l'azione massiva «Copia nome VestiFlow»                                                                                                |
| —         | spegnere la sync non lascia il prodotto in vendita, ed è reversibile (§1.10)                                  | ✅ **fatto e provato sullo shop il 03/09/2026**                                                                                                                                                  |
| —         | prodotti importati modificabili (§1.8) — **primo pezzo della Tranche 2**                                      | ✅ **completata e verificata il 03/09/2026**, comprese le prove d'integrazione                                                                                                                   |
| **2A**    | **primitive GraphQL del catalogo** (§8.6): productSet, varianti, opzioni, publication, collezioni, inventario | ✅ **completata il 03/09/2026** · ⚠️ prove unitarie: il contratto va verificato sullo shop                                                                                                       |
| —         | **migrazione push Shopify a GraphQL** (Tranche 2B e 3)                                                        | ⏸ **da eseguire**, decisa in §1.6                                                                                                                                                                |

⛔ **Non c'è più una voce «correzione del vecchio export dai movimenti».** Quel percorso **non si ripara**: si dismette. Ripararlo — e a maggior ragione alimentarlo con nuovi snapshot economici — significherebbe investire lavoro in un motore che deve sparire, e ritardarne la fine.

**0A.1 — che cosa ha chiuso.** `ComputedLine` non dichiarava `lineVatTotalMinor` né `lineGrossTotalMinor` e la persistenza era uno spread di quel tipo: le due colonne restavano al proprio `@default(0)` su **ogni** documento del percorso generico — preventivo, proforma, fattura, fattura accompagnatoria, nota di credito, DDT vendita, vendita manuale. L'imposta di riga veniva calcolata in `computeTotals`, sommata in testata e **buttata**.

⭐ Il difetto era **vivo, non teorico**: `business-analytics` legge `lineGrossTotalMinor` come ricavo, quindi il ricavo di un DDT di vendita valeva **zero** nei report.

⛔ **La guardia sta nel compilatore, non in uno script testuale**: il mapper dichiara un tipo che rende obbligatorie le colonne economiche, e dimenticarne una **non compila**. Una guardia a ricerca testuale sarebbe stata cieca — `documents.service.ts` _nomina_ `lineVatTotalMinor` in una costante che non viene mai persistita, e sarebbe stato assolto.

⚠️ **Resta aperto lo sconto di testata**: i totali di riga sono al lordo dello sconto documento, quindi con uno sconto attivo la somma delle righe supera la testata. Non tocca il Registro canonico (che somma le testate) ma riguarda le **analisi per riga**. La semantica va decisa prima di implementarla.

**0A.2a — che cosa ha chiuso.** `DocumentLine` persisteva `sku`, `description` e `variantLabel`, ma **non** il codice articolo, il nome del prodotto e il barcode: quei tre si rileggevano dall'anagrafica corrente a ogni consultazione. Rinominare un prodotto riscriveva quindi il nome sul DDT di marzo, e una variante eliminata lasciava la riga senza identità — che è il difetto per cui la Tranche 0 esiste.

⭐ **La fotografia la scatta il SERVER**, dalla variante scelta: i tre campi non entrano nel DTO di riga e il client non può imporli. È la precisazione del proprietario del 02/09/2026 — «così non dipende da dati incompleti o manipolati inviati dall'interfaccia».

Il comportamento è a tre casi, gli stessi di `variantLabelSnapshot`, e non uno di più:

| Sulla riga…                      | I tre campi                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------- |
| **esistente**, stessa variante   | ⭐ **conservano** il valore persistito: l'anagrafica di oggi non li tocca     |
| **esistente**, variante cambiata | si **rifanno** sulla nuova: è un altro articolo, e la riga è un'altra cosa    |
| **nuova**, o senza articolo      | valore corrente, oppure `null` — che è uno stato valido, non un dato mancante |

⚠️ **«Esistente» vuol dire con l'`id` dichiarato.** Una modifica che non lo manda descrive una riga nuova, e una riga nuova si rifotografa: è il contratto che `CreateDocumentLineDto` porta già con `id?: string`, ed è così anche per l'etichetta variante. La prova di integrazione l'ha misurato — senza `id`, i tre campi si riscrivevano con l'anagrafica corrente e sembrava un difetto del server.

⛔ **La guardia sta nel compilatore**, come per la 0A.1: i tre campi sono entrati in `DocumentLineRequiredEconomicColumns`, quindi un mapper che ne dimentica uno **non compila**. Sono nullable, ma dichiararli resta obbligatorio — `null` deve essere una decisione, non un'omissione, che è esattamente la forma in cui le due colonne economiche erano rimaste vuote.

⚠️ **Le righe SINTETICHE dichiarano `null` per contratto.** Quelle costruite in memoria per la riconciliazione dello stock non esistono nel documento e non hanno un'identità da fotografare: lo dice `EMPTY_LINE_IDENTITY_FIELDS`, tenuta separata da `EMPTY_LINE_VAT_FIELDS` perché fonderle darebbe un nome che mente su metà del proprio contenuto.

**Test**: 5 prove di **integrazione** su `vestiflow_test` (`snapshot-identita-riga.integration-spec.ts`) — creazione, risalvataggio dopo modifica dell'anagrafica, cambio variante, riga senza articolo, e **rilettura**: il caricamento deve restituire i tre campi, o persisterli varrebbe zero per chi apre il documento. ⭐ Sono di integrazione e non sul servizio perché la domanda è **cosa resta scritto nella colonna** dopo un secondo salvataggio: su Prisma finto si vedrebbe ciò che il mapper produce, non ciò che il database conserva.

⭐ **Falsificate tutte e tre le direzioni**, e ognuna colpisce solo ciò che deve: ignorando il valore persistito arrossa **solo** il risalvataggio; scrivendo `null` dal mapper arrossano le tre prove che si aspettano un valore e resta verde quella che si aspetta `null`; omettendo i campi dal caricamento arrossa **solo** la rilettura — le altre leggono dal database e da sole non direbbero niente sulla risposta HTTP.

**Suite**: 623 prove sui documenti · **2292** nella suite API · **61** di integrazione (erano 56) · type-check, lint, build API e build frontend puliti.

⚠️ **A quel punto restava la 0A.2b**: duplicazione, conversione e stampe non erano ancora
state toccate. Le sezioni successive registrano la chiusura di 0A.2b e 0A.2c; Arrivo merce,
Vendita al banco e il contratto autonomo dei movimenti restano fuori dal loro perimetro.

**0A.2b — che cosa ha chiuso, e dov'era davvero il difetto.** Il censimento ha rovesciato l'attesa: il **backend era già pulito**. PDF, XML e `getById` leggono tutti dalla riga persistita, senza una sola join sull'anagrafica — la cella «Articolo» della stampa passa da `printArticleCellLines`, che è una funzione pura e non può leggere il catalogo nemmeno volendo.

⛔ **Il difetto era tutto nel client, in due file gemelli**: `transfer-form` e `stock-operation-form`. `lineArticleCode` e `lineBarcode` leggevano `lineVariantSummary(index)`, cioè il riepilogo caricato da `searchVariantSummaries` — **l'anagrafica di adesso** — e il controllo del form era solo un ripiego. Su un documento riaperto quel controllo era vuoto, quindi vinceva sempre l'anagrafica: **ricodificare un articolo cambiava ciò che un documento di marzo diceva**.

⭐ **La premessa era scritta nel codice, ed è caduta**: «Il documento non li salva — sono chiavi di ricerca, non dati della riga». Dalla 0A.2a li salva.

**La forma non è nuova: è quella di `variantLabel`**, decisa in questi stessi file e col suo commento già a posto — «arriva dal risolutore quando l'articolo entra, e dal DOCUMENTO quando la riga si ricarica». I due form ora patchano `articleCode` e `barcode` dal documento, e i lettori leggono solo il controllo.

⛔ **Nessuna funzione condivisa, ed è una decisione.** La regola a tre casi vive già nel backend (`lineIdentitySnapshot`); applicata questa forma, il client non decide più niente — il lettore diventa `controls.articleCode.value ?? ''`, una riga, identica a `variantLabelOf` che convive duplicato per la stessa ragione. Estrarre una funzione per un accesso a un controllo sarebbe astrazione di nulla. **La correzione toglie il ragionamento invece di spostarlo**, ed è il motivo per cui non c'è niente da condividere.

⚠️ **`productName` non è stato toccato**: era già uno snapshot, perché il form lo prende da `line.description`, che il documento persiste. Non era anagrafica corrente, quindi non rientrava nel mandato («sostituisci soltanto la lettura dall'anagrafica corrente»).

⚠️ **Un prerequisito, senza il quale la correzione peggiorava le cose.** Il ramo di modifica di una rettifica _già confermata_ non passa da `documents.service` ma da `transfer-adjustment-workflow.service`, che **ricrea** le righe e non scriveva gli snapshot: le righe nuove aggiunte da lì sarebbero rimaste senza identità, e la maschera — che ora dallo snapshot legge — avrebbe mostrato una cella **vuota**. Quel percorso ora scrive l'identità con la stessa funzione unica, accanto all'etichetta variante. L'`update` delle righe esistenti non li menziona, quindi li lasciava già intatti.

⭐ **Il metodo `lineVariantSummary` è stato rimosso** da entrambi i form: senza il ripiego non aveva più chiamanti, e lasciarlo in casa significava lasciare la strada per tornare indietro senza accorgersene.

**Test**: 7 prove di componente, 2 sul mapper e 2 di integrazione — riapertura dopo rinomina, e stampa dopo rinomina. ⭐ Fra le prime c'è **la riga NUOVA**, che deve continuare a prendere la variante scelta adesso: senza, «leggi sempre e solo il controllo» varrebbe anche dove non deve, e una riga appena compilata smetterebbe di mostrare il codice dell'articolo richiamato.

⭐ **Le due sul mapper coprono l'anello che si rompe in SILENZIO**: le prove di componente partono da un `DocumentRecord` già mappato, quindi un campo che il mapper smettesse di copiare le lascerebbe tutte verdi — e la maschera tornerebbe alla cella vuota, cioè a metà del difetto.

⭐ **Una falsificazione è FALLITA, ed è la cosa più utile di questa tranche.** La prova «snapshot assente non ripiega sull'anagrafica» restava **verde** col ripiego reintrodotto: `pinnedVariants` è un `toSignal` alimentato da un effect, che nel test non aveva girato — quindi anche il codice guasto trovava il catalogo vuoto e restituiva la stessa stringa vuota per la ragione sbagliata. Con `TestBed.flushEffects()` l'anagrafica risponde davvero, e la prova arrossa come deve.

⚠️ **Lo stesso dubbio valeva per la stampa**, e la risposta è stata cercata invece che data per buona: il confronto fra i due PDF è stato verificato cambiando la descrizione di riga, e arrossa. ⛔ Il confronto normalizza `/ID` e le date: pdfkit li genera casuali a ogni produzione, quindi due stampe dello stesso documento non sono mai identiche byte per byte — un confronto diretto avrebbe fallito sempre, per una ragione che col difetto non c'entra.

**Suite**: 1201 prove di componente · 2019 unità e copertura (86,3% / 80,8% / 81,7% / 86,7%, soglie 76/69/71/76) · 2292 API · 63 di integrazione. Type-check, lint, build API e build frontend puliti.

⚠️ **Resta fuori, e non per dimenticanza: le ETICHETTE prodotto.** `printFromDocumentLines` stampa un'etichetta partendo dalle righe di un documento e legge nome e barcode dall'anagrafica corrente. **Non è la stampa del documento**: è un'etichetta che si attacca alla merce, e un barcode storico su un'etichetta nuova renderebbe il pezzo non scansionabile. È una decisione di prodotto da prendere a parte, non una conseguenza di questa tranche.

**0A.2c — che cosa ha chiuso, e la decisione che ha richiesto.** Duplicare o convertire un
documento produce righe **senza `id`**, quindi `lineIdentitySnapshot` le trattava — correttamente
per il proprio contratto — come righe nuove e le **rifotografava dall'anagrafica di oggi**.
Duplicare un DDT di marzo a settembre ne cambiava il nome articolo.

⛔ **Il lavoro si è fermato prima di scrivere codice**, perché la correzione ovvia — mettere i
tre snapshot nel DTO di riga — **viola** la regola della 0A.2a: «la fotografia la compone il
server, non l'interfaccia». Le due regole si escludevano a vicenda, ed è una decisione di
prodotto, non una scelta tecnica.

⭐ **La decisione del proprietario (03/09/2026)**: duplicato e convertito **conservano
integralmente** gli snapshot della sorgente, `null` compresi; solo una riga davvero nuova, dal
catalogo, prende i valori correnti. La regola documentale è stata estesa di conseguenza:
`regole-gestionale` distingue ora **tre** casi di riga, non due — esistente, **derivata**, nuova
da catalogo.

**La forma che tiene insieme le due regole**: il client manda un **riferimento**, non dei
valori. `DocumentLineInputDto.sourceDocumentLineId` porta l'id della riga sorgente; il server
ci risale, **verifica il tenant** e ne copia gli snapshot **dal database**. Il client indica,
il server compone.

```text
assente                → riga nuova → anagrafica corrente
presente e valido      → copia dalla riga sorgente (null inclusi)
presente e NON valido  → salvataggio RIFIUTATO
variante diversa       → si rifotografa: è un altro articolo
```

⛔ **Il terzo stato è stato aggiunto dopo**, e la prima stesura aveva il difetto che la
tranche chiude. Un riferimento non risolto ricadeva su «riga nuova»: sembrava prudente —
nessun dato altrui copiato — ma la riga veniva rifotografata dall'anagrafica **corrente** e
il documento si salvava. ⭐ Un risultato plausibile e sbagliato, che nessuno va a
controllare. Corretto su indicazione del proprietario prima di considerare chiusa la tranche.

⚠️ **I due casi non validi — id inesistente, id di un'altra azienda — falliscono allo stesso
modo, con lo stesso messaggio.** Distinguerli trasformerebbe il campo in un modo per scoprire
se un id di riga esiste altrove.

⭐ **Contratto binario, come per il Codice IVA**: nel payload una riga duplicata da una riga
senza codice e una riga appena creata sono **identiche** — entrambe senza `id` e senza
snapshot. Senza la chiave esplicita non si potrebbero distinguere, e la regola «`null` resta
`null`» non sarebbe applicabile.

⚠️ **Il riferimento non si persiste, e non serve una migration**: compone la riga e finisce lì.
Dal salvataggio dopo, quella riga ha un `id` proprio ed è una riga esistente come le altre.

⚠️ **Il controllo sulla variante sta anche sul SERVER**, non solo nel client che azzera il
riferimento al cambio articolo: un client che se ne dimenticasse farebbe copiare l'identità
del prodotto di prima sopra quello appena scelto — un difetto peggiore di quello chiuso.

⭐ **Copiati anche `variantLabel` e `unitOfMeasure`**: sono snapshot della stessa famiglia, e la
conversione li perdeva entrambi allo stesso modo. ⚠️ L'unità di misura la sorgente la dà come
**default**: se il client la dichiara vince il client, perché quel campo è editabile nella
maschera e sovrascriverlo sempre impedirebbe di cambiarlo su un duplicato.

⭐ **La regola del legame sta in UNA funzione**, `document-line-source-link.util` in
`domain/documents/models/`, e le tre maschere la chiamano. Sono due sole regole — «duplicando,
l'id diventa riferimento» e «cambiando articolo, il riferimento si azzera» — perché sono le
uniche parti che portano una decisione: dichiarare il controllo nel form e metterlo nel payload
è contratto della singola maschera, e resta dov'è.

⛔ **Erano state scritte tre volte, ed è stato un errore mio**: copia-incollate nelle due
maschere gemelle senza chiedersi cosa fosse condivisibile. Il proprietario l'ha fermato prima
del commit. ⚠️ La prova che il copia-incolla degenera in fretta: nella stessa ora le tre copie
avevano **già due grafie diverse** — `riga.controls.x` da una parte, `riga.get('x')`
dall'altra — che nessuno avrebbe più confrontato.

⚠️ **E una delle tre copie portava un difetto che la funzione unica ha fatto emergere**: per
azzerare l'id tentava di indovinare il tipo del controllo con `typeof id.value === 'string'`,
che guarda il VALORE e non il controllo. Un campo nullabile contenente una stringa prendeva la
forma sbagliata. Distinguerli a runtime non si può, e non serve: la stringa vuota va bene per
tutte le forme, e il payload manda `id || undefined`.

⭐ **Le maschere che duplicano sono TRE, non una.** Oltre al documento di vendita, anche
**Trasferimento** e **Movimento di magazzino** hanno il loro «Duplica», e azzeravano l'id di riga
senza mettere il riferimento: il duplicato perdeva l'identità esattamente come gli altri. ⚠️ Il
difetto era invisibile finché la 0A.2b non ha reso quelle maschere capaci di LEGGERE gli
snapshot — prima non li mostravano, quindi perderli non si vedeva.

**Test**: 6 prove di integrazione — duplicazione dopo rinomina, conversione dopo rinomina (dal
**precompilato vero**, non da un corpo scritto a mano), cambio variante, `null` conservati,
riferimento inesistente e riferimento di altro tenant (entrambi rifiutati, senza creare il
documento), sorgente non modificata — **9 prove dirette sulla funzione condivisa**, e 4
di componente sul trasporto lato client: una per ciascuna delle tre maschere che duplicano, più
una sull'azzeramento al cambio articolo.

⭐ **La divisione delle prove segue la divisione del codice**: quelle dirette verificano che le
due regole facciano la cosa giusta, quelle di componente che ogni maschera le CHIAMI. Togliendo
il corpo della funzione condivisa arrossano tutte e quattro le prove di maschera — che è la
misura del fatto che nessuna se la sia riscritta per conto proprio.

⭐ **Cinque falsificazioni, e una è FALLITA.** La prova di isolamento tenant restava **verde**
togliendo il filtro `tenantId`: la riga «altrui» era stata creata **senza variante**, quindi a
scartarla era il controllo sulla variante e non il filtro — la prova misurava la cosa
sbagliata. Data la stessa variante, arrossa come deve. ⚠️ È la seconda volta in questo lavoro
che una falsificazione smaschera una prova cieca: senza, sarebbe rimasta a certificare un
isolamento che non stava verificando.

⚠️ **Lacuna dichiarata — «Concludi ordine»**: un documento generato da un ordine cliente
continua a fotografare l'anagrafica corrente. ⛔ Non è dimenticanza: `SalesOrderLine` **non
possiede** `articleCode` né `productName`, quindi la conservazione sarebbe parziale per
costruzione — e i due campi mancanti **non si recuperano** dall'anagrafica di oggi per far
tornare i conti, perché sarebbe il difetto stesso con un'altra faccia. Si chiude col progetto
Ordine cliente.

**Prodotti importati modificabili — primo pezzo della Tranche 2 (03/09/2026).** Il push di un
prodotto **già collegato** passa da GraphQL: `productUpdate` per campi e stato, `productVariantsBulkUpdate`
(`allowPartialUpdates: false`) per SKU, barcode e prezzo, `productUpdate(media:)` per le immagini. Versione API fissata a **`2026-07`** (⚠️ va aggiornata in ogni `.env`: `2025-01` è
fuori supporto). Gli id restano numerici in tabella; il GID si compone in un punto solo
(`toShopifyGid`), che ha assorbito due copie preesistenti.

⛔ **Nessun fallback REST.** Restano sul vecchio percorso, dichiarati: la **creazione** (finché
la Tranche 2 non porta `productSet`), il metafield stagione e il costo variante. Non sono
funzioni nuove: sono quelle di sempre, e il cutover le raggiungerà.

**Le varianti senza `shopifyVariantId`** (18 sul DB di sviluppo) si abbinano SOLO dentro il
prodotto collegato e SOLO se la corrispondenza è univoca — SKU, poi barcode, poi opzioni; con
zero o più candidate il push si ferma con un errore che nomina la variante. Mai un salto
silenzioso, mai una variante creata per conto dell'operatore.

**«Sincronizza con Shopify» spento** ferma ora anche l'inventario (`sync_disabled` nel push
livelli) e porta il prodotto collegato in `ARCHIVED`; riacceso, il push ordinario riallinea
tutto, stato locale compreso. **Lock read-only rimosso**: maschera, tre passi, Dettaglio, e la
guardia API di update/sync/media. ⚠️ La guardia sull'**eliminazione** resta apposta: è fuori
mandato. La checkbox compare solo con il canale attivo.

**Test**: 9 prove sul servizio di push (GraphQL e non REST, stato da `ProductStatus`, errore
remoto visibile, orfana univoca, orfana ambigua, immagine già remota, ARCHIVED a flag spento,
archiviazione rifiutata → `out_of_sync`, non collegato), 8 sull'abbinamento, 2 sull'input GraphQL
della variante (un campo assente NON entra: `null` non è zero, come sul REST), 1 sull'inventario
a flag spento, 2 sulla checkbox — più 2
d'integrazione sulla `PATCH` di un importato. ⚠️ **Le due d'integrazione non sono state
eseguite**: Docker Desktop risulta spento sulla macchina di sviluppo. Vanno lanciate prima di
considerare chiusa la tranche: `npm run test:integration` in `api/`.

**Una decisione sola per ogni cosa** (revisione strutturale del 03/09): i campi prodotto verso il
canale escono da `productChannelFields`, usata dal REST e dal GraphQL; l'input variante da
`variantBulkInput`; l'esito di una scrittura remota da `markPushSucceeded`/`markPushFailed` — e
un'archiviazione rifiutata su un prodotto collegato marca **`out_of_sync`**, non `error`, come il
push ordinario. ⚠️ Resta dichiarata, non unificata, la politica di abbinamento della **creazione**
REST (`persistShopifyIds`: solo SKU, chi non corrisponde resta scollegato senza errore): si unifica
con `productSet`.

#### ⛔ Le immagini NON si riconoscono per URL d'origine — misurato il 03/09/2026

La prima stesura cercava i media remoti per `originalSource.url` e caricava solo ciò che
mancava. **Non poteva funzionare**: Shopify ri-ospita il file e restituisce un URL firmato
proprio, che è `null` subito dopo il caricamento e **cambia a ogni lettura** (due letture
consecutive, due firme diverse, scadenza 5 minuti). Il confronto non trovava mai nulla, e a
ogni salvataggio la stessa immagine veniva ricaricata: **due media dopo il secondo push**.

⭐ A tenerle uniche è il `shopifyImageId` **salvato**. I media nuovi si riconoscono per
**differenza**: la mutation restituisce _tutti_ i media del prodotto, e quelli che prima non
c'erano sono i nostri, nell'ordine in cui li abbiamo mandati.

⚠️ **Resta aperto**: un media che Shopify rifiuta resta in stato `FAILED` e prende comunque il
suo id, quindi non viene ricaricato e nessuno se ne accorge. Va deciso se leggere `status` e
segnalarlo — fuori dal perimetro di questa tranche.

✅ **Provato sullo shop di sviluppo il 03/09/2026** (§1.6), con un prodotto creato apposta e
rimosso alla fine: lettura del titolo su `2026-07`, Nome prodotto che non tocca il titolo
Shopify, Nome Shopify che lo aggiorna, webhook che aggiorna solo `shopifyTitle`, SKU/barcode/
prezzo via `productVariantsBulkUpdate`, immagine via `productUpdate(media:)` senza duplicato al
secondo salvataggio, archiviazione allo spegnimento con inventario fermo, e riattivazione che
riporta il prodotto ad `ACTIVE` senza duplicarlo.
**0B.1 — che cosa è successo, in ordine.**

1. ⛔ È stato introdotto **per errore** uno scope automatico per le sedi autorizzate all'utente: dedotto dal fatto che il vecchio export dai movimenti lo applicava, e mai deciso da nessuno. L'effetto sarebbe stato un corrispettivo totale più basso del vero, senza segnale.
2. ✅ Quello scope è stato **rimosso**. Nel codice attuale **non c'è più**, ed esiste una prova che ne impedisce il ritorno (`corrispettivi-filtro-sedi.spec.ts`).
3. Nel codice restano tre cose, tutte legittime: la **normalizzazione del filtro Sede esplicito**, la **correzione dei Corrispettivi manuali** e il **conteggio per il banner**.

✅ **Chiusa il 03/09/2026.** Verificati tutti e cinque i punti, su ognuno dei sei percorsi di lettura — elenco, riepilogo, stampa, CSV, foglio di calcolo, PDF.

| Punto                                                                  | Come è garantito                                                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| senza filtro entrano **tutte le sedi e le righe «Non determinata»**    | prova su tutti e sei i percorsi                                                                                                                    |
| con filtro, **tutte e cinque le fonti** lo applicano, manuali compresi | prova su elenco, riepilogo e i tre export                                                                                                          |
| le **sedi assegnate all'utente non filtrano**                          | ⭐ **garanzia strutturale**: `listOrders`, `buildRegisterRows` e `getSummary` **non ricevono l'utente**. Il codice non ha l'informazione per farlo |
| **banner** coerente                                                    | il conteggio si calcola col filtro esplicito, ed è zero senza                                                                                      |
| **isolamento tenant**                                                  | `tenantId` su tutte e cinque le sorgenti, in elenco, riepilogo ed export                                                                           |

**Test**: 20 prove sul filtro Sede (da 13) · 129 nella suite Corrispettivi · **2292** nella suite API · 66 sui componenti del Registro, stampa compresa · **56 di integrazione** su `vestiflow_test`. Type-check, lint e build puliti.

⭐ **Falsificate**: rompendo l'isolamento del tenant su **una sola** sorgente diventano rosse quattro prove; reintroducendo una restrizione di sede non chiesta ne diventano rosse altre quattro, fra cui quella sugli export.

⚠️ **Una prova era andata persa e ora è tornata.** Quella sull'isolamento tenant viveva in `corrispettivi-scope-sedi.spec.ts`, il file eliminato disfacendo lo scope: il comportamento era rimasto corretto, ma senza niente che lo tenesse fermo. Toglierne una garanzia non poteva indebolirne un'altra.

⚠️ **Qui c'era una formulazione fuorviante**, ed è utile resti scritto: «implementata sulla base di una regola autorizzativa errata; da correggere prima di procedere» lasciava intendere che il codice contenesse ancora lo scope sbagliato. Non era così — era già stato rimosso quando quella frase è stata scritta.

### Tranche 1 — Modello locale e visibilità

**Obiettivo:** introdurre stato locale Non attivo, cestino, ripristino, eliminazione definitiva
e contesti di ricerca.

Lavori:

1. migration lifecycle/audit;
2. rimuovere blocchi per movimenti e cancellazioni di livelli;
3. eliminare la cancellazione implicita da `syncVariants`;
4. endpoint preflight e comandi;
5. UI e conferme;
6. separazione contesti di ricerca;
7. situazione magazzino inclusiva con badge;
8. guardia report storici;
9. test multi-tenant e permessi.

**Gate:** il cestino non modifica alcuna dipendenza; l'eliminazione definitiva è disponibile
all'amministratore dopo doppio avviso, rimuove le dipendenze operative dichiarate e lascia
leggibili le righe documento attraverso gli snapshot.

### Tranche 2 — Fondazione GraphQL

> ✅ **DA ESEGUIRE.** La migrazione a GraphQL è decisa (§1.6): questa tranche e la 3 non sono sospese.
>
> ⚠️ I _lavori_ elencati restano però una forma proposta: versione esatta, struttura del client, outbox e worker vanno confermati prima di scriverli come requisiti.

**Obiettivo:** costruire il client e le primitive senza ancora sostituire il percorso produttivo.

Lavori:

1. configurazione GraphQL `2026-07` separata durante la transizione;
2. verifica versione effettiva;
3. scope e riautorizzazione;
4. client error/userErrors/throttle comune;
5. query publication prodotto/variante;
6. mutation prodotto, opzioni, varianti, publication e inventario;
7. 🔧 un meccanismo che garantisca il recupero delle operazioni — outbox e worker sono **una** forma possibile, non un requisito approvato;
8. test contract contro shop di sviluppo.

**Gate:** ogni primitiva ha test su successo, `userErrors`, rete, timeout, retry, e dimostra che **una richiesta ripetuta non produce un effetto doppio**.

⚠️ Il gate diceva «idempotenza», che è il nome di una soluzione. Il requisito è l'effetto: comunque lo si ottenga.

#### ✅ 2A — la superficie GraphQL è completa (03/09/2026)

Dodici primitive nuove in `ShopifyGraphqlClient`, tutte sopra il `graphql()` e il
`throwOnUserErrors()` che già c'erano: autenticazione, throttle, retry sul 429 e
traduzione degli `userErrors` restano in **un posto solo**, e nessun client parallelo è
stato creato.

| Intenzione                              | Primitiva                                                                |
| --------------------------------------- | ------------------------------------------------------------------------ |
| creare un prodotto                      | `createProduct` (`productSet`)                                           |
| creare varianti                         | `bulkCreateVariants`                                                     |
| aggiornare varianti                     | `bulkUpdateVariants`, ora con `inventoryPolicy`                          |
| opzioni: creare, aggiornare, riordinare | `createProductOptions` · `updateProductOption` · `reorderProductOptions` |
| leggere i canali                        | `listPublications`                                                       |
| pubblicare e ritirare                   | `publishablePublish` · `publishableUnpublish` (prodotto E variante)      |
| collezioni manuali                      | `addProductToCollection` · `removeProductFromCollection`                 |
| leggere la quantità remota              | `getRemoteQuantities`                                                    |
| scrivere le giacenze                    | `setInventoryQuantities`                                                 |

⛔ **`productSet` NON può aggiornare, e lo impone la FIRMA**: `ShopifyProductSetInput` non
ha `id`. Non è una raccomandazione nel commento — è il tipo che rende impossibile il ramo
«aggiorna», dove una lista parziale farebbe **eliminare** a Shopify ciò che si è omesso.

⛔ **Le opzioni si toccano solo con `variantStrategy: LEAVE_AS_IS`**, sia alla creazione sia
all'aggiornamento. Il default di Shopify è `CREATE` (genera combinazioni che nessuno ha
chiesto) e `MANAGE` **cancella** le varianti che usano un valore rimosso.

⛔ **Nessun `productDelete`, nessun `productVariantsBulkDelete`.** Una prova legge il
sorgente del client e fallisce se una di quelle chiamate compare; una seconda scorre i
metodi del prototipo e fallisce se ne spunta uno distruttivo.

⭐ **`setInventoryQuantities`**: quantità assoluta, `referenceDocumentUri` obbligatorio,
il confronto concorrenziale sempre dichiarato — non è un'opzione — e `@idempotent(key:)`
come richiede `2026-07`. La chiave la decide il chiamante, che è l'unico a sapere quale
operazione sta ripetendo.

⚠️ **Ambiti nuovi: `read_publications` e `write_publications`**, aggiunti al default del
server e a `.env.example`. Un negozio **già collegato** ha un token che non li contiene: la
diagnostica lo dice, e l'interfaccia spiega che cosa fare invece di lasciarlo fallire alla
prima pubblicazione. In UI compaiono come capacità «Canali di vendita».

⛔ **Nessun chiamante produttivo è stato cambiato**, ed è il perimetro della 2A: le
primitive esistono e sono provate, il collegamento dei percorsi REST è della 2B.

#### ✅ 2A · lavoro 8 — il gate di contratto è stato eseguito (03/09/2026)

> **`npm run test:shopify:contract`** — dodici prove contro Shopify vero, su uno shop di
> sviluppo (`plan.partnerDevelopment: true`), su **un solo** prodotto `DRAFT` marcato
> `vestiflow-contract-test`, riusato a ogni esecuzione. Non gira in nessuna suite
> ordinaria e non salta mai in silenzio: senza dominio, senza credenziali o senza rete
> **fallisce**.

⭐ **Ha trovato CINQUE difformità che nessun test con `fetch` simulato poteva vedere**, e
sono la ragione per cui questo gate esiste. Le prime tre facevano rifiutare la chiamata al
primo tentativo reale; la quinta — la rimozione da collezione, asincrona — è più sotto,
nella chiusura della tranche:

| Difformità                                                       | Che cosa diceva Shopify                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `@idempotent` messa sull'**operazione** invece che sul **campo** | «'@idempotent' can't be applied to mutations (allowed: fields)»       |
| `ignoreCompareQuantity: false` mandato nell'input                | in `2026-07` **il campo non esiste** in `InventorySetQuantitiesInput` |
| `compareQuantity` come nome del confronto                        | si chiama **`changeFromQuantity`**                                    |
| `OptionReorderInput` con `id` **e** `name` insieme               | «OptionReorderInput requires exactly one of id, name»                 |

Le prime tre stavano tutte in `setInventoryQuantities`: la primitiva più delicata della
tranche era **interamente inservibile**, e i test con mock erano verdi — anzi, uno di essi
_asseriva_ la forma sbagliata. La quarta era una firma troppo permissiva: ora il tipo è
un'unione, e passarli entrambi non compila.

⭐ **E il confronto concorrenziale funziona davvero**: con un `changeFromQuantity` diverso
dal persistito Shopify risponde «The changeFromQuantity argument no longer matches the
persisted quantity» e **non scrive**. Verificato leggendo la quantità dopo il rifiuto.

**Verificato davvero, contro il negozio:**

| Operazione                                                           | Esito                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `productSet` in sola creazione (prodotto + opzione + variante + SKU) | ✅                                                                         |
| `productOptionsCreate` con `LEAVE_AS_IS`                             | ✅ nessuna variante creata né persa; le esistenti prendono il primo valore |
| `productOptionUpdate` (rinomina opzione, aggiunge valore)            | ✅                                                                         |
| `productOptionsReorder`                                              | ✅ dopo la correzione                                                      |
| `productVariantsBulkCreate` (con `inventoryItem.tracked`)            | ✅                                                                         |
| `productVariantsBulkUpdate` con `inventoryPolicy`                    | ✅ andata e ritorno                                                        |
| lettura della quantità remota                                        | ✅                                                                         |
| `inventorySetQuantities` con idempotenza e confronto                 | ✅ dopo le correzioni                                                      |
| collezione manuale: crea → aggiungi → verifica → rimuovi → elimina   | ✅ ciclo completo, su una collezione creata e distrutta dal gate           |
| `ProductVariant` implementa `Publishable`                            | ✅ per introspezione, quindi senza dipendere dagli ambiti                  |

#### ✅ Chiusura della 2A (03/09/2026) — protezione, collezioni, publication

**La protezione dell'ambiente ha DUE condizioni, e nessuna basta da sola.**

| Condizione                      | Da chi arriva | Da che cosa protegge                               |
| ------------------------------- | ------------- | -------------------------------------------------- |
| `SHOPIFY_CONTRACT_TEST=1`       | da chi lancia | dal comando eseguito senza sapere che **scrive**   |
| `plan.partnerDevelopment: true` | dal negozio   | dal bersaglio sbagliato, cioè un negozio **reale** |

⛔ **La prima sta sul TOKEN**, non davanti alle singole mutation: senza consenso non si
ottengono le credenziali, quindi non parte nemmeno una lettura e non esiste un percorso che
arrivi a una scrittura aggirando il controllo. La seconda si verifica in `beforeAll` prima
della prima scrittura, e abilita anche le mutation di **fixture**.

⚠️ **Perché un flag, se lo script è già dedicato.** Lo script protegge da chi non sa; il
flag protegge da chi sa e sbaglia negozio — un domani il comando può finire in un file di
automazione o essere lanciato con un `.env` aperto per un'altra ragione. Verificato: senza
la variabile il gate si ferma con l'errore che spiega, e **nessuna prova viene eseguita**.

**✅ Collezioni manuali: eseguite davvero, non più solo contro lo schema.**

Il ciclo completo su una collezione **creata e distrutta dal gate stesso**: creazione →
aggiunta del prodotto → lettura dell'appartenenza → rimozione → verifica → eliminazione.

⛔ **`collectionCreate` e `collectionDelete` NON sono primitive della 2A e non entrano nel
client**: VestiFlow non crea né elimina collezioni (§9.6), quindi sarebbero superficie che
nessun percorso userà mai. Vivono nel gate come **fixture**, e ciò che è sotto prova —
`addProductToCollection`, `removeProductFromCollection` — passa dal client compilato.

⭐ **Quinta difformità trovata: la RIMOZIONE è asincrona.** Il payload di
`collectionRemoveProducts` è un **`job`**, non la collezione aggiornata — mentre
l'aggiunta restituisce la collezione ed è sincrona. Il client scartava il job e dichiarava
compiuta un'operazione ancora in corso: ora lo restituisce, ed è l'unico modo che ha il
chiamante di sapere quando la rimozione è finita.

⚠️ **Con un solo prodotto è risultata già applicata al ritorno** — appartenenza a zero
immediatamente — ma è il caso più piccolo, non una garanzia: su una rimozione in blocco il
job va atteso. Il gate concede infatti qualche tentativo invece di dare per scontato un
tempo che Shopify non promette.

⚠️ **`collectionCreate` prende `CollectionCreateInput`**, non `CollectionInput`, e vuole
`title`. Senza `ruleSet` la collezione nasce **manuale**, che è l'unico tipo su cui
l'appartenenza si può scrivere.

**✅ La variante è `Publishable`, e ora è verificato.**

`ProductVariant` implementa `Publishable` ed espone `publishedOnPublication`: è il
**presupposto** di §10.1 — ritirare una singola taglia senza toccare quantità o
`inventoryPolicy`. L'introspezione non è ristretta dagli ambiti, quindi questa verifica non
dipende dalla riautorizzazione ed è stata fatta.

#### ✅ Pubblicazione per canale: eseguita davvero (03/09/2026, sera)

Gli ambiti `read_publications` e `write_publications` sono stati concessi, e **tutte e
cinque le operazioni sono state eseguite contro il negozio**:

| Operazione                                | Esito                                             |
| ----------------------------------------- | ------------------------------------------------- |
| `publications` — elenco dei canali        | ✅ tre canali (Online Store, Shop, Point of Sale) |
| `publishablePublish` sul **prodotto**     | ✅                                                |
| `publishableUnpublish` sul **prodotto**   | ✅                                                |
| `publishablePublish` sulla **variante**   | ✅ — è §10.1: ritirare UNA taglia                 |
| `publishableUnpublish` sulla **variante** | ✅, e si esce non pubblicati                      |

⭐ **`ProductVariant` è `Publishable` e lo si è verificato scrivendo**, non solo per
introspezione: la variante è stata pubblicata e ritirata da sola, senza toccare quantità né
`inventoryPolicy`. Il presupposto di §10.1 regge.

#### ⛔ Sesta e settima difformità: due indicatori che mentono

**1 · Su un prodotto in BOZZA, `publishedOnPublication` del prodotto resta `false` anche
quando la pubblicazione è riuscita.**

```text
prodotto DRAFT, dopo publishablePublish   publishedOnPublication = false
la sua variante, stesso momento           publishedOnPublication = true
```

⚠️ La mutation **aveva funzionato**: le varianti risultavano pubblicate. È il campo a non
riportarlo, perché un prodotto in bozza non è disponibile su nessun canale per definizione.
⛔ Chi verificasse una pubblicazione leggendo quel campo su un draft concluderebbe che non
è avvenuta, e la rifarebbe. Il gate mette quindi il prodotto ad `ACTIVE` per la durata
della prova, e lo riporta a `DRAFT` nel `finally`.

**2 · `Product.totalInventory` è EVENTUALMENTE CONSISTENTE.**

Misurato: subito dopo l'azzeramento diceva ancora `3` mentre i livelli per location erano
già `0`; qualche minuto dopo diceva `0` senza che nessuno avesse scritto nulla. ⭐ **Il
dato autorevole sono i livelli** (`inventoryLevels.quantities`), che rispondono subito. Un
controllo di riconciliazione costruito su `totalInventory` segnalerebbe differenze che non
esistono.

#### ⭐ E una lezione sul gate stesso: il ritiro va nel `finally`

La prima esecuzione con gli ambiti concessi è fallita a metà — sull'indicatore del punto 1 —
e si è fermata **prima del ritiro**, lasciando una variante **pubblicata** sul negozio. Il
negozio è stato ripulito a mano.

> **Un gate che scrive deve rimettere a posto anche quando fallisce.** Se il ripristino sta
> in coda al percorso felice, il primo rosso lo salta — e proprio il rosso è il momento in
> cui serve di più.

Il ritiro copre ora **tutti** i canali e sia il prodotto sia le varianti, perché pubblicare
un prodotto propaga alle sue varianti; e ignora l'errore, perché ritirare ciò che non è
pubblicato non è un problema, mentre un rosso lì maschererebbe il rosso vero.

#### Che cosa ha richiesto, fuori dal codice

Nulla di questo era un difetto da correggere: erano quattro passaggi di configurazione, e
vanno ricordati perché si ripresenteranno a ogni ambiente nuovo.

1. `SHOPIFY_SCOPES` con i due ambiti sulla variabile d'ambiente del server, **e la
   ridistribuzione** — il valore si legge all'avvio;
2. i due ambiti dichiarati nella **versione dell'app** e la versione **rilasciata**: Shopify
   concede solo il sottoinsieme dichiarato, **senza segnalare** che sta concedendo meno di
   quanto richiesto;
3. la **riautorizzazione** del negozio, perché gli ambiti si fissano al consenso;
4. `SHOPIFY_API_VERSION=2026-07` sull'ambiente, altrimenti vale il default del ramo servito.

⚠️ **Il punto 2 è quello che inganna**: la connessione riesce, l'interfaccia dice «collegato»,
e solo contando gli ambiti concessi ci si accorge che ne mancano due.

⚠️ **Che cosa il gate NON dimostra.** Che i percorsi produttivi siano corretti: nessuno di
essi chiama ancora queste primitive. Dimostra che il **contratto** regge, cioè il
presupposto della 2B.

### Tranche 3 — Migrazione completa del push

> ✅ **DA ESEGUIRE**, insieme alla 2 e prima della prima sincronizzazione (§1.6).

**Obiettivo:** sostituire il push REST senza cambiare il significato funzionale dei dati.

Lavori:

1. nuovo builder per intenzione;
2. creazione prodotto GraphQL;
3. aggiornamento prodotto senza lista varianti implicita;
4. create/update e ritiro delle varianti espliciti, senza cancellazioni definitive su Shopify;
5. media/metafield/tassonomia senza perdita;
6. inventory GraphQL, con la garanzia che una ripetizione non duplichi l'effetto;
7. persistenza e verifica GID;
8. shadow comparison o ambiente pilota;
9. 🔧 cutover — il feature flag per tenant è una modalità proposta, da confermare;
10. rimozione delle scritture REST e guardia che ne impedisca il ritorno.

**Gate:** ⭐ **nessuna scrittura di catalogo o inventario passa da REST** (§1.6, confermato); una modifica non strutturale non crea, elimina o riassegna varianti.

### Tranche 4 — Prima sincronizzazione

> ✅ **DA PREPARARE DOPO LE TRANCHE 2 E 3.** Il tema non è più sospeso; il flusso funzionale
> del wizard (§12) deve essere riesaminato e approvato prima dell'implementazione.

**Obiettivo:** realizzare wizard, riconciliazione, baseline e cutover.

Lavori: §§12.1–12.13 completi, non un semplice pulsante `Importa catalogo`.

**Gate:** i tre scenari (Shopify pieno, VestiFlow pieno, entrambi pieni) producono anteprima ripetibile, nessun duplicato silenzioso e attivazione idempotente.

### Tranche 5 — Regime continuativo

> ✅ **DA PREPARARE DOPO LA PRIMA SINCRONIZZAZIONE.** Outbox, lock e worker restano possibili
> soluzioni tecniche (§8.4), non requisiti funzionali già approvati.

**Obiettivo:** webhook, outbox, ownership, riconciliazione e monitoraggio.

**Gate:** perdita o duplicazione di webhook, riavvio del worker e modifiche concorrenti non duplicano entità e non cambiano campi fuori allowlist.

### Tranche 6 — Ciclo di vita sincronizzato

**Obiettivo:** collegare stato non attivo, riattivazione, cestino, eliminazione definitiva e
ripristino al percorso GraphQL e al regime continuativo.

Lavori:

1. 🔧 la rappresentazione locale delle publication — la **matrice persistita** è una forma proposta (§10.1), non un requisito;
2. la variante non attiva smette di essere acquistabile sul canale;
3. riattivazione controllata;
4. cestino ed eliminazione definitiva della variante;
5. ✅ caso **ultima variante** — non è più un bivio: VestiFlow non cancella la variante remota, la spubblica (§11.1), quindi il prodotto Shopify non arriva mai a zero varianti (§11.3);
6. cestino ed eliminazione definitiva del prodotto;
7. errori pendenti e recupero;
8. concorrenza con webhook e push;
9. audit end-to-end.

**Gate:** ogni combinazione locale/remota termina in uno stato verificabile; il cestino non
altera storia o inventario; l'eliminazione definitiva rimuove soltanto ciò che il doppio avviso
ha dichiarato; nessuna operazione produce effetti duplicati.

### Tranche 7 — Pulizia e consolidamento

**Obiettivo:** rimuovere codice morto, aggiornare documenti e chiudere il registro difetti.

Lavori:

- eliminare client/metodi REST non più usati;
- rimuovere flag temporanei;
- aggiornare `00-DECISIONI.md`, `01`, `02`, `10` e `DA-FARE.md`;
- segnare difetti chiusi con test che li prova;
- aggiornare guida utente e piano collaudo;
- verificare che nessun tenant senza Shopify veda elementi del modulo.

---

## 17. Criteri di accettazione obbligatori

### 17.1 Storia

- Un documento con variante poi rinominata, non attiva o eliminata mantiene ogni valore e stampa.
- Finché esiste, un movimento continua a mostrare identità, costo e ricavo senza join
  obbligatorio all'anagrafica attiva.
- **Il Registro canonico e i suoi export**, prima e dopo un cambio di listino, sono byte-identici salvo metadati non economici dichiarati — e lo restano dopo la convergenza del consumatore del vecchio percorso.

  ⛔ Il criterio riguardava «l'export Corrispettivi» senza dire quale, e finiva per pretendere l'**invarianza del vecchio export**: cioè di ripararlo. Quel percorso si dismette, quindi non ha criteri di accettazione — ne ha solo il Registro.

- I report dello stesso periodo mantengono conteggi e totali dopo il passaggio a Non attiva o
  nel Cestino. Dopo l'eliminazione definitiva restano invariati i report fondati sui documenti
  e sui loro snapshot; quelli fondati sui movimenti eliminati possono cambiare, come dichiarato
  nel secondo avviso.
- Il pregresso non ricostruibile è esplicitamente mancante, non valorizzato col dato corrente.

### 17.2 Eliminazione locale

- Variante con movimenti, giacenza, impegni, lotti o matricole: spostabile nel cestino dopo
  avviso; record collegati invariati e ancora visibili nei contesti previsti.
- Dal cestino, la stessa variante è eliminabile definitivamente dopo doppio avviso: le
  dipendenze operative dichiarate vengono rimosse, le righe documento restano leggibili.
- Prodotto con tutte le condizioni insieme: stesso comportamento, con riepilogo aggregato di
  tutte le varianti.
- Due richieste identiche: **nessun effetto duplicato** — una sola marcatura nel cestino oppure
  una sola purga definitiva, e nessuna operazione remota ripetuta.

  ⚠️ Il criterio diceva «una sola operazione outbox», cioè imponeva l'outbox come soluzione dentro un criterio di accettazione. Outbox, lock, worker, hash e token restano **possibili** soluzioni tecniche: il requisito è che l'effetto non si duplichi, comunque lo si ottenga.

- Un tenant non può preflightare o eliminare il record di un altro tenant.
- Il ripristino non genera movimenti.

### 17.3 Ricerca e UI

- Una variante Non attiva o nel cestino non appare nelle nuove selezioni commerciali.
- Una variante non attiva appare nelle operazioni di magazzino consentite.
- Una variante nel cestino con quantità appare nella Situazione magazzino con badge; dopo
  l'eliminazione definitiva non esistono più quantità locali da mostrare.
- Riaprire un documento storico non perde nome, codice o barcode.
- Scanner e ricerca per codice rispettano il contesto.
- Nessun contatore varianti viene calcolato dalle sole combinazioni teoriche delle opzioni.

### 17.4 Shopify GraphQL

⚠️ **Sono criteri sul RISULTATO.** Dove una voce nominava un meccanismo ancora aperto, è stata riscritta in ciò che deve essere vero.

- La versione API richiesta ed effettiva **coincidono** e sono **fissate**, mai `latest` o implicite. 🔧 Quale sia esattamente è ancora da confermare (§1.6).
- `userErrors` impedisce lo stato `synced`.
- Cambio nome prodotto non modifica il numero o gli ID delle varianti.
- Cambio prezzo di una variante aggiorna soltanto quella variante.
- L'eliminazione esplicita di una variante la rende **non pubblicata** su Shopify e la **lascia esistere** (§11.1). ⛔ Il criterio diceva «usa `productVariantsBulkDelete`»: prescriveva la cancellazione remota che ora è vietata.
- L'ultima variante ritirata resta esistente ma non pubblicata su Shopify e non elimina il prodotto locale.
- Articolo semplice: la standalone Shopify è mappata alla variante base locale e non rimane fantasma.
- Nella conversione **semplice → varianti**, l'operatore sceglie quale combinazione eredita
  variante base, identità, giacenza e mapping; nessuna scelta avviene per posizione.
- Nella conversione **varianti → semplice**, una sola variante resta attiva e acquistabile;
  nessuna quantità o storia viene fusa e le altre varianti Shopify restano non pubblicate.
- Eliminando tutte le varianti visibili non può riapparire online una vecchia standalone non mappata.
- La variante smette di essere acquistabile **senza** che quantità, giacenza, impegni o `inventoryPolicy` vengano alterati per ottenerlo. 🔧 La matrice persistita variante × publication è una forma proposta (§10.1), non un requisito.
- L'inventario si spinge via GraphQL, con un **riferimento auditabile** e la garanzia che **una ripetizione non duplichi l'effetto**. 🔧 L'idempotency key persistente è una forma possibile di quella garanzia, non un requisito approvato.
- Nessuna scrittura catalogo/inventario usa REST dopo il cutover.

### 17.5 Prima sincronizzazione

- Nessuna quantità si muove prima della mappatura location.
- Matching ambiguo non viene confermato automaticamente.
- L'esecuzione agisce **sullo stesso stato che l'anteprima ha mostrato**, e se è cambiato se ne accorge. 🔧 Hash o numero di versione sono forme possibili, non requisiti.
- Un'interruzione può essere ripresa.
- Il cutover non importa ordini antecedenti.
- L'attivazione ripetuta non duplica prodotti, varianti, documenti di apertura o movimenti.

### 17.6 Tenant e modulo

- Tenant senza modulo Shopify: nessun menu, campo, banner, errore, indicatore o chiamata Shopify.
- Tenant con modulo non configurato: stato distinto e nessun errore operativo invasivo.
- **Nessun dato o operazione di un tenant può raggiungerne un altro**, in nessuna parte del meccanismo di sincronizzazione. 🔧 «Lock, outbox, mapping partizionati» è una forma di questa garanzia, non la garanzia.

---

## 18. Piano test minimo per tranche

Ogni tranche consegna unit test, integration test e almeno un E2E sul percorso critico.

### 18.1 Test database

- migration su database vuoto;
- migration su dati realistici con tutte le dipendenze;
- rollback applicativo senza perdita snapshot;
- RLS;
- indici e query principali;
- nessun `DELETE`/`CASCADE` durante eliminazione ordinaria.

### 18.2 Test fault injection Shopify

Per ogni mutation:

- timeout prima della risposta;
- timeout dopo scrittura remota;
- HTTP 429;
- HTTP 5xx;
- GraphQL top-level error;
- `userErrors`;
- scope mancante;
- GID non trovato;
- risposta parziale;
- retry dopo riavvio;
- doppio worker sullo stesso shop.

### 18.3 Test concorrenza

- salvataggio prodotto mentre parte eliminazione variante;
- webhook `products/update` durante il passaggio a non attiva;
- vendita Shopify durante spubblicazione/eliminazione;
- due eliminazioni contemporanee sullo stesso prodotto;
- ripristino mentre la cancellazione è pendente;
- cambio quantità mentre il worker pubblica;
- stesso shop da due istanze e shop diversi in parallelo.

### 18.4 Test regressione documentale

Copertura di tutti i workflow che creano o ricaricano righe articolo, inclusi almeno:

- preventivo;
- DDT/vendita/fattura;
- vendita al banco;
- ordine fornitore;
- arrivo merce;
- ordine cliente quando entrerà nel perimetro richiesto;
- trasferimento;
- rettifica/operazione di magazzino;
- vendita online e reso.

L'Ordine cliente non va implementato o modificato oltre quanto necessario a non regredire contratti condivisi, finché non viene richiesto esplicitamente.

---

## 19. Regole per chi implementa

Per ogni tranche:

1. leggere questa specifica e le specifiche verticali richiamate;
2. ispezionare il codice e documentare la causa radice prima di modificarlo;
3. separare nel resoconto: regola richiesta, comportamento osservato, ipotesi tecnica;
4. presentare la lista dei file e delle migration previste;
5. non correggere difetti adiacenti fuori perimetro senza registrarli;
6. implementare un solo gate per volta;
7. eseguire test mirati, lint/guardie e test di regressione proporzionati;
8. mostrare evidenza degli effetti database e Shopify;
9. non dichiarare conclusa una tranche con test saltati o simulazioni che non coprono l'integrazione reale;
10. aggiornare documenti e registro difetti soltanto dopo l'esito verificato.

È vietato:

- conservare il vecchio push REST come fallback automatico;
- usare `inventory 0 + DENY` come fuori uso;
- filtrare i report storici sullo stato attuale;
- backfillare snapshot con valori correnti;
- cancellare una variante perché manca dal DTO prodotto;
- trasformare un errore Shopify in perdita dello stato locale;
- cancellare gli ID remoti prima della verifica;
- catturare e sostituire `userErrors` con un generico successo parziale;
- tenere transazioni database aperte durante chiamate Shopify.

---

## 20. Mappa iniziale dei punti di codice

La mappa serve per iniziare l'ispezione; non limita il perimetro reale.

| Area                                | Punti noti                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eliminazione prodotto/varianti      | `api/src/products/products.service.ts`                                                                                                                       |
| Schema e relazioni                  | `api/prisma/schema.prisma`, migration applicate                                                                                                              |
| Push catalogo                       | `api/src/shopify/shopify-product-push.service.ts`                                                                                                            |
| Client REST                         | `api/src/shopify/shopify-admin.client.ts`                                                                                                                    |
| Client GraphQL                      | `api/src/shopify/shopify-graphql.client.ts`                                                                                                                  |
| Facade/inneschi                     | `api/src/channels/channel-sync.facade.ts`                                                                                                                    |
| Push inventario                     | `api/src/shopify/shopify-inventory-push.service.ts`                                                                                                          |
| Reconciliation inventario           | `api/src/shopify/shopify-inventory-reconciliation.service.ts`                                                                                                |
| Pull catalogo                       | `api/src/shopify/shopify-product-pull.service.ts`                                                                                                            |
| OAuth/scope                         | `api/src/shopify/shopify-oauth.service.ts`, configurazione Shopify                                                                                           |
| Form prodotto                       | `src/app/domain/products/product-form.component.*`, mapper e step varianti                                                                                   |
| Ricerca condivisa                   | `searchVariantSummaries`, `document-product-search-panel`, `DocumentCodeLookupService`, scanner e lookup fornitore                                           |
| Situazione magazzino                | `api/src/inventory/inventory-situation.service.ts`                                                                                                           |
| **Corrispettivi — modulo canonico** | `api/src/corrispettivi/*` (servizio, export, query, classificazione, totali) e `src/app/features/reports/pages/corrispettivi-report` — ⭐ la fonte di verità |
| **Corrispettivi — filtro Sede**     | `api/src/corrispettivi/corrispettivi-location-filter.util.ts` — normalizzazione del filtro, NON un’autorizzazione                                            |
| **Corrispettivi — vecchio export**  | ✅ **rimosso il 03/09/2026**; la pagina Report conserva il collegamento al Registro canonico, unica fonte per visualizzazione, stampa ed export              |
| Export Ordini Shopify               | `/sales-orders/export/csv` — percorso a sé, non è un Corrispettivo                                                                                           |
| **Totali economici di riga**        | `api/src/documents/document-line-economic-totals.util.ts` e `computeLines`/`toLineCreateData` in `documents.service.ts`                                      |
| Snapshot righe                      | DTO e workflow sotto `api/src/documents`, `src/app/features/documents` e moduli collegati                                                                    |
| Movimenti                           | `StockMovement`, servizi documentali/inventariali e analytics                                                                                                |
| Guardie                             | `scripts/check-*.mjs`, script `lint` del `package.json`                                                                                                      |

---

## 21. Condizione finale di completamento

⚠️ **Sono RISULTATI, non soluzioni.** La condizione finale dice cosa dev'essere vero, mai con quale meccanismo: imporre qui una forma tecnica ancora aperta significherebbe averla decisa senza deciderla.

Il lavoro è completo soltanto quando:

- spostare nel cestino non altera storia, inventario o analisi;
- eliminare definitivamente conserva documenti e totali attraverso gli snapshot, ma rimuove
  le dipendenze operative dichiarate nel doppio avviso e può quindi cambiare le analisi basate
  sui movimenti;
- ogni dipendenza produce un avviso concreto ma non un blocco;
- stato locale, eliminazione, pubblicazione e giacenza sono assi indipendenti;
- i report non dipendono dallo stato anagrafico corrente;
- una variante locale non attiva e sincronizzata non è più acquistabile su Shopify, **senza** che quantità, giacenza, impegni, movimenti o `inventoryPolicy` siano stati alterati per ottenerlo;
- la prima sincronizzazione crea una baseline **verificabile e ripetibile**;
- la sincronizzazione continuativa **non produce effetti duplicati**, è osservabile e recuperabile;
- ⭐ **il push di catalogo, varianti e inventario NON usa più REST**: dopo il cutover nessuna scrittura passa dal vecchio percorso (§1.6, decisione confermata);
- un tenant senza Shopify non percepisce l'esistenza del modulo;
- i vecchi documenti conservano la stessa lettura e gli stessi numeri dopo qualunque operazione;
  i movimenti restano invariati con Non attiva e Cestino, mentre non esistono più dopo
  l'eliminazione definitiva che li ha inclusi esplicitamente nel preflight.

⚠️ **La cessazione delle scritture REST è un risultato, non una soluzione**, ed è per questo che sta qui: dice cosa dev'essere vero alla fine, non con quale client, quale versione o quale meccanismo di cutover — che restano aperti (§1.6).

⛔ È stata invece tolta _«Shopify è governato tramite GraphQL `2026-07` con publication per variante»_: fissava una **versione** e un **meccanismo** in un criterio di completamento, e nessuno dei due è ancora confermato. E _«idempotente»_ è stato sostituito col risultato che descrive — «nessun effetto duplicato» — perché l'idempotenza è un modo di ottenerlo, non l'obiettivo.
