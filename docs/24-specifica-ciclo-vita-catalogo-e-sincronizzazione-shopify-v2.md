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

| Punto                                                                                | Dove           | Perché è aperto                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| comportamento del **prodotto quando tutte le varianti sono non attive**              | §3.4           | il prodotto sparisce, resta guscio, o si deriva? Nessuna delle tre è stata scelta                                                                               |
| **conseguenza remota dell'eliminazione dell'ultima variante** Shopify                | §11.3          | Shopify non ammette un prodotto a zero varianti: cosa si fa non è deciso                                                                                        |
| **proprietà di nome, descrizione, brand e prezzo Shopify**                           | §9.2           | la matrice esiste ma è una proposta, non una decisione                                                                                                          |
| **esatto contratto degli snapshot** e necessità delle **chiavi storiche** aggiuntive | §5.2, §5.3     | quali colonne servano davvero, e se le chiavi storiche siano necessarie, non è stabilito                                                                        |
| **contenuto tecnico del preflight**                                                  | §14.1          | i quattro requisiti funzionali sono decisi; hash, token, scadenze e idempotenza no                                                                              |
| struttura dell'**outbox**, lock e worker                                             | §8.4           | forma tecnica ipotizzata                                                                                                                                        |
| **wizard di prima sincronizzazione**                                                 | §12            | i nove passi sono una proposta, non un flusso approvato                                                                                                         |
| **politica delle publication per canale**                                            | §10.1          | quali canali, con quale regola                                                                                                                                  |
| casi di **conversione semplice ⇄ varianti**                                          | §8.6.2, §8.6.3 | il comportamento remoto non è deciso                                                                                                                            |
| comportamento in caso di **errore durante la cancellazione remota**                  | §11.5          | cosa resta locale, cosa si ritenta, cosa si dichiara                                                                                                            |
| **etichetta dello stato variante**                                                   | §3.3, §10.2    | nessuna scelta, e nessuna scartata. §3.3 porta una proposta consigliata — «Attiva/Non attiva» in locale, «Pubblicata/Non pubblicata» su Shopify — da confermare |
| variante **già salvata o sincronizzata ma priva di dipendenze**                      | §4.3, §7.4     | se i suoi identificativi si liberino, e chi possa eliminarla                                                                                                    |

⭐ **Un punto aperto non diventa chiuso perché una tranche lo attraversa.** Se un lavoro incontra una di queste voci, si ferma e la si decide.

---

## 1. Fondamenti — decisioni confermate e proposte

⛔ Il capitolo si intitolava **«Decisioni non negoziabili»**, e non tutte lo erano: due delle sette sottosezioni sono proposte tecniche di chi ha scritto il documento. Il titolo dava a tutte lo stesso peso.

### 1.1 Eliminare l'anagrafica non elimina la storia

> ✅ **Decisione confermata**

> Eliminare un prodotto o una variante significa rimuoverlo dall'anagrafica operativa e, se collegato, dal catalogo Shopify. Non significa eliminare o modificare la storia aziendale.

Dopo l'eliminazione:

- documenti e righe documento restano presenti e leggibili;
- movimenti restano presenti e invariati;
- prezzi, sconti, IVA, costi, quantità e totali storici non vengono ricalcolati;
- giacenze, impegni, lotti e matricole non vengono cancellati né rettificati automaticamente;
- non viene creato alcun movimento automatico;
- report e analisi continuano a includere gli stessi fatti;
- il record eliminato non compare nelle normali ricerche per nuove operazioni;
- le viste che rappresentano una realtà ancora esistente lo mostrano con l'etichetta `Eliminato`.

### 1.2 Nessuna dipendenza blocca l'eliminazione

> ✅ **Decisione confermata**

Documenti, movimenti, giacenze, impegni, lotti, matricole e collegamenti a canali producono avvisi, non divieti.

L'operatore autorizzato può confermare l'eliminazione anche con:

- giacenza positiva o negativa;
- impegni aperti;
- lotti o matricole ancora presenti;
- documenti in corso o storici;
- movimenti storici;
- pubblicazioni attive su Shopify;
- errori di sincronizzazione già presenti.

Il sistema deve mostrare quantità e conseguenze reali prima della conferma. Un messaggio generico come «ci sono dipendenze» non è sufficiente.

### 1.3 Nessun effetto inventariale nascosto

> ✅ **Decisione confermata**

L'eliminazione non può:

- azzerare una `InventoryLevel`;
- cancellare una `InventoryLevel` tramite `CASCADE`;
- annullare un impegno;
- cambiare lo stato di un lotto o di una matricola;
- creare una rettifica, uno scarico, un trasferimento o uno storno;
- riscrivere un movimento esistente.

Ogni variazione fisica continua a richiedere un'azione inventariale esplicita che produca il proprio movimento.

### 1.4 Stato locale non attivo ed eliminato sono diversi

> ✅ **Decisione confermata**

- **Lo stato locale non attivo** è reversibile e mantiene l'anagrafica completa.
- **Eliminato** sparisce dall'uso ordinario, ma mantiene una rappresentazione storica interna sufficiente a preservare collegamenti e analisi.
- **Eliminazione dello storico** non fa parte dell'eliminazione ordinaria e non viene progettata in questo lavoro.

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

Conseguenza: una cancellazione fisica o un semplice scollegamento renderebbero parte dello storico non identificabile o economicamente variabile.

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

### 3.1 Quattro assi indipendenti

> ✅ **Decisione confermata**

| Asse                  | Esempi                               | Domanda a cui risponde                                  |
| --------------------- | ------------------------------------ | ------------------------------------------------------- |
| Ciclo di vita locale  | in uso, non attivo, eliminato        | l'anagrafica è utilizzabile in VestiFlow?               |
| Pubblicazione Shopify | pubblicato/non pubblicato per canale | il cliente può vederla in quel canale?                  |
| Inventario            | giacenza, impegnata, disponibile     | quanta merce fisica o assegnata esiste?                 |
| Sincronizzazione      | allineato, in attesa, errore         | l'ultima intenzione locale è stata applicata al canale? |

È vietato usare:

- giacenza zero per rappresentare lo stato non attivo;
- `inventoryPolicy = DENY` per rappresentare lo stato non attivo;
- `ProductStatus.archived` per nascondere la realtà inventariale;
- errore di sincronizzazione per cambiare lo stato locale;
- assenza dal payload per rappresentare eliminazione.

### 3.2 Stato prodotto

> ✅ **Decisione confermata**

La colonna esistente `Product.status` mantiene i significati:

- `draft`: anagrafica non pronta o non ancora attiva commercialmente;
- `active`: prodotto in uso;
- `archived`: prodotto non attivo.

Si aggiungono almeno:

- `deletedAt` nullabile;
- `deletedById` nullabile;
- `deletionReason` nullabile;
- `deletionOperationId` nullabile;
- dati di audit della conferma.

`deletedAt != null` significa eliminato. Non aggiungere contemporaneamente un valore `deleted` all'enum: due fonti per lo stesso fatto produrrebbero stati impossibili.

### 3.3 Stato variante

> ❓ **Decisione da prendere**

✅ **Confermato**: la variante ha uno **stato locale proprio, indipendente da Shopify**. Non lo si deduce dal canale, e non lo si rappresenta con la quantità o con `inventoryPolicy`.

❓ **Da decidere: come si chiama.** Il documento proponeva l'enum `active` / `out_of_use`, e con esso l'etichetta «Fuori uso» in tutta l'interfaccia. **Nessuna terminologia è stata scelta**: la differenza non è cosmetica — è la parola che l'operatore leggerà ovunque e cercherà nella guida.

#### 🔧 Proposta consigliata, da confermare

| Asse              | Etichetta proposta              |
| ----------------- | ------------------------------- |
| **stato locale**  | «Attiva» / «Non attiva»         |
| **stato Shopify** | «Pubblicata» / «Non pubblicata» |

**Perché questa coppia.** Un tenant che non usa Shopify deve comunque capire lo stato locale, e «pubblicare» lì non significa niente. E una variante **localmente attiva può essere non pubblicata** sul canale: sono due assi indipendenti (§1.5), quindi due parole diverse.

⚠️ **È una proposta di chi scrive, non una decisione del proprietario**, e nemmeno un'esclusione: nessuna delle candidate è stata scartata. Vale finché lui non conferma.

⚠️ Nel testo funzionale di questo documento si usa intanto la forma neutra **«stato locale non attivo»**: è una descrizione, non un'etichetta UI.

🔧 **Proposta tecnica, da verificare**: colonne `deletedAt`, `deletedById`, `deletionReason`, `deletionOperationId`, tutte nullabili, con `deletedAt != null` come unica fonte della cancellazione. La forma è ipotizzata; la regola «una sola fonte per la cancellazione» è invece confermata (§4.1).

### 3.4 Stato effettivo derivato

> ❓ **Decisione da prendere**

Una variante è selezionabile in un nuovo documento commerciale solo se:

```text
product.deletedAt IS NULL
AND variant.deletedAt IS NULL
AND product.status = active
AND variant.lifecycleStatus = active
```

Il prodotto con tutte le varianti non attive o eliminate mostra lo stato derivato `Nessuna variante attiva`. Non deve essere trasformato automaticamente in `archived`: l'automatismo riscriverebbe una decisione dell'operatore. L'interfaccia propone `(etichetta da decidere)` — portare il prodotto allo stato non attivo, ma non la esegue da sola.

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

La cancellazione dell'unica variante base segue la regola dell'ultima variante: l'operatore sceglie se eliminare il prodotto oppure portarlo allo stato locale non attivo. Se vuole mantenere il prodotto come articolo semplice, deve esistere una variante base reale a cui collegare dati e giacenze.

### 3.6 Stato tecnico della cancellazione Shopify

> 🔧 **Proposta tecnica da verificare**

La cancellazione remota è un processo, non un booleano. L'operazione conserva almeno:

- `queued`;
- `unpublishing`;
- `deleting_remote`;
- `verifying`;
- `completed`;
- `retryable_error`;
- `permanent_error`;
- `cancelled`.

Lo stato vive nella tabella delle operazioni/outbox, non nell'enum di ciclo di vita.

---

## 4. Strategia di persistenza: eliminazione logica con identità storica

### 4.1 Scelta

> ✅ **Decisione confermata**

L'eliminazione ordinaria è una cancellazione logica.

Dal punto di vista dell'operatore il prodotto o la variante è eliminato: sparisce dall'anagrafica ordinaria e dalle nuove selezioni. Nel database resta una riga minima, marcata con `deletedAt`, per mantenere:

- relazioni ai documenti;
- relazioni ai movimenti;
- giacenze e impegni;
- lotti e matricole;
- raggruppamenti storici;
- audit e possibilità di ripristino.

Questa non è una semplice archiviazione: il record eliminato è escluso dall'uso ordinario e segue il flusso di cancellazione remota. La permanenza tecnica serve soltanto a rispettare la storia.

### 4.2 Divieti di database

> ✅ **Decisione confermata**

La migration deve impedire che l'eliminazione ordinaria invochi `DELETE` sulle righe `products` o `product_variants`.

Non devono essere attivati per questa funzione:

- `CASCADE` da prodotto a varianti;
- `CASCADE` da variante a livelli inventariali;
- `SET NULL` generalizzato come sostituto degli snapshot;
- cancellazioni manuali di dipendenze prima della marcatura.

Una futura funzione di purga fisica, se mai verrà richiesta, avrà specifica, permesso e backup separati.

### 4.3 Unicità dopo la cancellazione

#### ✅ Decisione confermata

|                                           |                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------- |
| identificativo presente nello **storico** | ⛔ **non è riutilizzabile**. Vale per codice articolo, SKU e barcode |
| forzatura amministrativa                  | ⛔ **non esiste**, e nessun permesso può concederla                  |
| se l'operatore prova a riusarlo           | il sistema mostra il record eliminato e **propone il ripristino**    |
| variante **mai salvata**                  | ✅ non riserva nulla: quegli identificativi restano liberi           |

⛔ **Qui c'era un residuo del riuso forzato**, sopravvissuto alla prima correzione: _«un permesso amministrativo potrà forzare il riuso solo dopo conferma, mantenendo identità storiche distinte»_. È eliminato. La clausola «dopo conferma» non lo rendeva accettabile: una regola d'integrità che un permesso può scavalcare non è una regola, e «identità storiche distinte» descriveva il modo di aggirarla, non una garanzia.

⭐ E il «non **automaticamente**» delle vecchie righe era la stessa apertura, scritta più piano: lasciava intendere che esistesse una via non automatica. Non esiste.

#### ❓ Decisione ancora aperta

Il trattamento degli identificativi di una variante **salvata o sincronizzata, ma mai entrata nello storico** — nessun documento, nessun movimento, nessuna dipendenza. Se si liberino o restino riservati non è deciso: vedi §0-bis.

#### 🔧 Proposta tecnica da verificare

Gli indici unici esistenti non vanno semplicemente rimossi. Se si introduce unicità parziale sui non eliminati, serve comunque un controllo applicativo che intercetti il record storico e impedisca ambiguità silenziose.

---

## 5. Snapshot e immutabilità storica

### 5.1 Regola generale

> ✅ **Decisione confermata**

> La riga documento e il movimento dichiarano ciò che è avvenuto in quel momento. Non ricaricano la propria identità economica dall'anagrafica corrente.

La disponibilità mostrata accanto a una riga può restare live. Nome, codice, variante, prezzo, IVA, costo e totali del fatto storico non lo sono.

### 5.2 Snapshot minimo della riga documento

> ❓ **Decisione da prendere**

Ogni riga articolo deve persistere almeno:

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

DTO, mapper, salvataggi, caricamenti, duplicazioni, conversioni, inclusioni e stampe devono trasportare lo stesso contratto. Non basta aggiungere colonne se un percorso non invia il valore al server.

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

| Contesto                                                  | In uso |              Non attiva |                                                      Eliminato |
| --------------------------------------------------------- | -----: | ----------------------: | -------------------------------------------------------------: |
| Nuovo preventivo/ordine/vendita/DDT/fattura               |     sì |                      no |                                                             no |
| Ricerca commerciale per codice o scanner                  |     sì |                      no |                                                             no |
| Nuovo ordine fornitore/arrivo destinato a riassortimento  |     sì | no, salvo riattivazione |                                                             no |
| Trasferimento, rettifica, inventario, esaurimento residui |     sì |       sì, con etichetta |                 solo tramite vista residui o previo ripristino |
| Documento storico salvato                                 |     sì |                      sì |                                                             sì |
| Documento aperto già contenente la riga                   |     sì |                      sì |                                  sì; la riga non viene rimossa |
| Situazione magazzino                                      |     sì |                      sì | sì quando esistono quantità o attività; etichetta obbligatoria |
| Lotti, matricole, impegni                                 |     sì |                      sì |                                                             sì |
| Movimenti                                                 |     sì |                      sì |                                                             sì |
| Analisi e report storici                                  |     sì |                      sì |                                                             sì |
| Stampa etichette storiche                                 |     sì |                      sì |                                                             sì |
| Anagrafica ordinaria                                      |     sì |        filtro opzionale |                            no; visibile con `Mostra eliminati` |

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
| **eliminazione**                                         | di un prodotto o di una variante esistente. Comando amministrativo                                                                           |
| **ripristino**                                           | di un record eliminato. Amministrativo                                                                                                       |
| **stato locale reversibile**, distinto dall'eliminazione | portare una variante a non attiva, e riportarla in uso                                                                                       |
| **rimozione di una riga non ancora salvata**             | durante la compilazione del form, da chi sta modificando l'articolo. ⭐ **Non è un'eliminazione anagrafica**: quella riga non è mai esistita |

⭐ Togliere una riga dal form o cambiare le opzioni **non equivale a eliminarla**. È la distinzione che regge tutto il capitolo.

#### ❓ Non ancora confermati

- le **etichette esatte** dei comandi — vedi §3.3 e §0-bis;
- il comando UI **«Riprova sincronizzazione»**, che il documento elencava fra i comandi confermati: nessuno l'ha chiesto, e presuppone il modello di sospensione remota che è ancora aperto (§11.5);
- il **flusso dettagliato per le combinazioni generate dalle opzioni**. Il documento prescriveva: «se una modifica delle opzioni rende alcune combinazioni obsolete, il sistema mostra un confronto e chiede quale azione applicare a ciascuna variante». È una proposta ragionevole, **non una decisione**;
- **chi può eliminare** una variante già salvata o sincronizzata ma senza dipendenze.

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

### 7.3 Conferma rafforzata ma non bloccante

> ✅ **Decisione confermata**

Se non esistono conseguenze, basta una conferma ordinaria.

Se esistono conseguenze, la finestra mostra ad esempio:

```text
Stai eliminando: Maglia Aurora — XL / Rosso

Resteranno invariati:
- 36 movimenti storici
- 8 righe documento
- giacenza: 12 pezzi in 2 sedi
- 3 impegni aperti
- 2 lotti e 4 matricole

La variante non sarà più selezionabile nelle nuove operazioni.
Su Shopify verrà rimossa dai canali e poi eliminata.
```

L'operatore deve spuntare una presa visione e confermare. Gli avvisi non disabilitano il pulsante.

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
| variante **salvata o sincronizzata, ma senza storia** | ❓ **da decidere** — vedi §0-bis                           |

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

Il ripristino locale:

- rimuove `deletedAt` e i metadati di cancellazione;
- non crea, elimina o modifica movimenti;
- non modifica documenti;
- ripristina l'anagrafica nello stato `out_of_use` per evitare ripubblicazioni involontarie;
- richiede un comando separato per rimettere in uso.

Se Shopify non aveva ancora completato la cancellazione, l'operazione pendente viene annullata in modo idempotente.

Se Shopify aveva già eliminato la risorsa, il ripristino non può recuperare lo stesso ID remoto:

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
- `productVariantsBulkCreate`, `productVariantsBulkUpdate` e `productVariantsBulkDelete` sono le mutation dedicate;
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

La tabella di mapping del connettore deve inoltre distinguere almeno:

- mapping attivo;
- mapping ritirato ma conservato per audit;
- variante standalone/default;
- variante con opzioni esplicite;
- anomalia remota non ancora riconciliata.

`standalone/default` descrive il ruolo della variante nel modello Shopify. Non significa `tecnica da ignorare`: per un articolo semplice deve essere collegata alla variante base reale di VestiFlow.

### 8.6 Operazioni GraphQL ammesse

> 🔧 **Proposta tecnica da verificare**

| Intenzione                                 | Mutation primaria                                              |
| ------------------------------------------ | -------------------------------------------------------------- |
| Creazione/riallineamento completo iniziale | `productSet` con lista esplicita e anteprima                   |
| Aggiornamento soli campi prodotto          | `productUpdate`                                                |
| Creazione nuove varianti                   | `productVariantsBulkCreate`                                    |
| Aggiornamento varianti esistenti           | `productVariantsBulkUpdate` con `allowPartialUpdates: false`   |
| Eliminazione varianti                      | `productVariantsBulkDelete`                                    |
| Eliminazione prodotto                      | `productDelete`                                                |
| Pubblicazione/spubblicazione per variante  | `publishablePublish` / `publishableUnpublish` sul GID variante |
| Quantità assoluta autorevole               | `inventorySetQuantities` con `@idempotent`                     |

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

> ❓ **Decisione da prendere**

La conversione è un comando strutturale esplicito, non l'effetto collaterale del salvataggio delle opzioni.

Sono ammessi due casi:

**La variante base diventa una combinazione reale.** Il connettore conserva il GID esistente, aggiunge le opzioni con una strategia che mantiene la standalone, aggiorna quella variante con la prima combinazione confermata e crea le altre con `productVariantsBulkCreate`.

**La variante base non corrisponde a nessuna nuova combinazione.** Il connettore crea l'intera matrice e usa la strategia Shopify `REMOVE_STANDALONE_VARIANT`. Prima di rimuovere la standalone deve aver acquisito e persistito i GID delle nuove varianti. Il mapping precedente diventa `retired`; la variante locale storica resta disponibile ai documenti e movimenti secondo il ciclo di vita deciso.

La scelta fra i due casi viene mostrata nell'anteprima. Non si deduce dalla posizione o dal titolo.

### 8.6.3 Conversione da varianti ad articolo semplice

> ❓ **Decisione da prendere**

Eliminare tutte le righe visibili non è una conversione valida. Il comando dedicato `Converti in articolo semplice` deve:

1. scegliere o creare una variante base locale reale;
2. mostrare cosa accade alle varianti precedenti;
3. applicare stato non attivo o eliminazione locale secondo le conferme ricevute;
4. inviare a Shopify una configurazione completa e intenzionale con una sola variante;
5. acquisire il GID della variante risultante;
6. mapparla alla variante base locale;
7. verificare `hasOnlyDefaultVariant` e l'assenza di varianti remote orfane.

La sequenza GraphQL esatta deve essere provata contro uno shop di sviluppo sulla versione stabile `2026-07`. È vietato basarla su un esempio disponibile soltanto nello schema `unstable`.

Se la verifica fallisce, il prodotto viene messo in stato di riconciliazione e non viene dichiarato allineato.

### 8.7 Migrazione del push REST

> ✅ **La migrazione è decisa** (§1.6). 🔧 **L'elenco qui sotto è la sua forma proposta**: le mutation esatte vanno provate sullo shop di sviluppo prima di essere fissate.

La migrazione comprende, senza rinvio:

- creazione prodotto REST → GraphQL;
- aggiornamento prodotto REST con varianti annidate → mutation GraphQL per intenzione;
- eliminazione prodotto REST → `productDelete`;
- creazione/aggiornamento/eliminazione variante → mutation bulk dedicate;
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

---

## 9. Proprietà dei dati in regime ordinario

### 9.1 Regola

> ✅ **Decisione confermata**

Per ogni campo esiste una politica dichiarata. Un webhook o un comando manuale non può scrivere campi fuori dalla propria allowlist.

### 9.2 Matrice iniziale

> ❓ **Decisione da prendere**

| Dato                                   | Fonte primaria                            | Comportamento dall'altra parte                                                         |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Codice articolo VestiFlow              | VestiFlow                                 | mai inviato come identità Shopify pubblica; può essere metafield tecnico               |
| UUID/identità di collegamento          | VestiFlow                                 | metafield tecnico/app-owned e tabella mapping                                          |
| Opzioni e struttura varianti           | VestiFlow dopo cutover                    | modifiche Shopify entrano come divergenza da riconciliare, non cancellano localmente   |
| SKU/barcode                            | bidirezionale controllato                 | ultimo aggiornamento ammesso con audit; conflitti/duplicati richiedono riconciliazione |
| Nome, descrizione, brand               | bidirezionale                             | ultimo valore ammesso con traccia di provenienza e data                                |
| Immagini e arricchimenti Shopify       | bidirezionale per allowlist               | merge per ID, mai sostituzione cieca su errore parziale                                |
| Categorie/collezioni/metafield Shopify | Shopify o configurazione esplicita        | non sovrascrivono categorie interne fuori allowlist                                    |
| Prezzo interno                         | VestiFlow                                 | Shopify non lo scrive                                                                  |
| Prezzo Shopify                         | bidirezionale del canale                  | usa campo dedicato, non cambia il prezzo interno                                       |
| Costo effettivo variante               | VestiFlow                                 | Shopify lo alimenta solo durante la prima sincronizzazione se deciso                   |
| IVA/codice fiscale interno             | VestiFlow                                 | Shopify non lo deduce                                                                  |
| Giacenza pubblicabile                  | VestiFlow                                 | Shopify viene riallineato                                                              |
| Pubblicazione per canale               | VestiFlow quando gestione canali è attiva | modifiche remote diventano evento con audit, secondo configurazione                    |
| Stato locale non attivo o eliminato    | VestiFlow                                 | Shopify non può riattivarlo tramite webhook                                            |

### 9.3 Ultimo scrittore non significa sovrascrittura cieca

> 🔧 **Proposta tecnica da verificare**

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

> ✅ **Decisione confermata**

Rimettere in uso:

1. rende la variante di nuovo selezionabile localmente;
2. non la pubblica automaticamente su tutti i canali;
3. ripristina, su conferma, le publication precedentemente gestite o quelle selezionate ora;
4. pubblica la quantità calcolata da VestiFlow;
5. verifica l'esito per canale.

### 10.4 Inventory policy

> ❓ **Decisione da prendere**

`inventoryPolicy` governa la vendita oltre disponibilità:

- `DENY`: non vendere quando la quantità vendibile è esaurita;
- `CONTINUE`: ammette overselling secondo decisione commerciale.

È un'impostazione distinta dal ciclo di vita e dalla pubblicazione. La specifica non impone `DENY` a tutte le varianti: la politica va modellata come dato di canale.

### 10.5 Quantità pubblicabile

> ✅ **Decisione confermata**

```text
disponibile VestiFlow      = giacenza − impegnata
quantità inviata a Shopify = max(0, disponibile VestiFlow)
```

⛔ **La scorta di sicurezza è stata TOLTA dalla formula** (02/09/2026). Compariva come «regola base già confermata» — `max(0, giacenza − impegnata − scorta di sicurezza)` — e non era confermata da nessuno: è una proposta che si era travestita da decisione.

⭐ **La disponibilità negativa resta visibile in VestiFlow**, ed è un fatto che l'operatore deve vedere. Non viene trasformata in un movimento, in una rettifica o in un azzeramento: verso il canale si pubblica zero, in casa si legge il numero vero.

Se la variante è non attiva o eliminata, la quantità **non** è il modo di nasconderla: governa soltanto l'inventario. La rimozione dalle publication è l'atto commerciale.

⚠️ `inventoryPolicy` è una **decisione separata** — se si possa vendere senza disponibilità — e sta in §10.4. Non rappresenta lo stato della variante.

> 🔧 **Proposta tecnica da verificare** — il resto di questo paragrafo: il push GraphQL userebbe quantità assolute autorevoli, `changeFromQuantity` secondo la politica di concorrenza scelta e `@idempotent` con chiave persistente, con `referenceDocumentUri` riconducibile a VestiFlow. È una forma tecnica ipotizzata, non una decisione presa.

---

## 11. Flusso di eliminazione Shopify

### 11.1 Principio transazionale distribuito

> 🔧 **Proposta tecnica da verificare**

Shopify e PostgreSQL non condividono una transazione. La sicurezza deriva da:

- intenzione persistita;
- stati espliciti;
- idempotenza;
- retry;
- verifica finale;
- nessuna cancellazione fisica locale.

### 11.2 Eliminazione di una variante con altre varianti remote

> 🔧 **Proposta tecnica da verificare**

1. Eseguire il preflight locale e remoto.
2. Registrare conferma, snapshot e operazione in una transazione locale.
3. Impostare `deletedAt` localmente: da quel momento non è selezionabile.
4. Accodare la spubblicazione da tutte le publication gestite.
5. Accodare `productVariantsBulkDelete` con `productId` e `variantsIds`.
6. Trattare ogni `userError` come fallimento.
7. Verificare che il GID variante non sia più risolvibile o non appartenga più al prodotto.
8. Marcare l'operazione `completed` e conservare il vecchio GID nell'audit.

Nessuno dei passaggi modifica storia o inventario locale.

### 11.3 Ultima variante

> ❓ **Decisione da prendere**

> ✅ **Decisione confermata — il vincolo locale**
>
> **L'eliminazione di una variante Shopify, compresa l'ultima variante remota, non elimina mai automaticamente il prodotto locale né le altre varianti locali.**

⛔ Qui era scritto il contrario: _«se l'operatore conferma, si usa `productDelete` e il prodotto locale viene eliminato logicamente con tutte le varianti»_. È stato **espressamente rifiutato**. Un'azione su una variante non può propagarsi al prodotto e ai suoi fratelli: sarebbe una cancellazione a cascata innescata da un vincolo del canale, cioè la cosa che tutto questo documento vieta.

⭐ **L'eliminazione del prodotto locale resta un comando distinto, esplicito e amministrativo.** Mai una conseguenza.

❓ **Resta aperta solo la conseguenza REMOTA.** Shopify mantiene almeno una variante per prodotto: quando quella richiesta è l'ultima remota, le strade sono quattro e **nessuna è stata scelta**.

|                                                |                                                |
| ---------------------------------------------- | ---------------------------------------------- |
| bloccare l'eliminazione della variante         | il prodotto remoto resta com'è                 |
| lasciare il prodotto remoto **non pubblicato** | resta su Shopify, non acquistabile             |
| trasformarlo in **bozza**                      | idem, con uno stato che l'admin Shopify mostra |
| eliminare il **solo prodotto remoto**          | il locale resta intatto in ogni caso           |

⚠️ Il resto di questa sezione descrive la classificazione delle varianti remote e la gestione di `CANNOT_DELETE_LAST_VARIANT`: è **proposta tecnica**, e presuppone una scelta fra le quattro qui sopra che non è stata fatta.

Il conteggio deve essere verificato sul remoto al momento dell'esecuzione, non dedotto soltanto dal database locale.

Per `ultima variante` si intende **ultima variante effettiva e mappata**, non semplicemente l'ultimo GID contato nella risposta. Prima dell'operazione il connettore classifica tutte le varianti remote come:

- mappata alla variante base semplice;
- mappata a una variante esplicita;
- mapping ritirato;
- anomalia/orfana.

Una vecchia standalone riapparsa e priva di mapping non rende sicura la cancellazione delle varianti reali. Se l'operazione lascerebbe soltanto quella riga, VestiFlow deve:

- proporre `Converti in articolo semplice`, collegandola a una variante base reale;
- oppure eseguire il percorso di eliminazione prodotto;
- oppure portare il prodotto allo stato locale non attivo.

Non deve lasciarla pubblicata, attribuirle una giacenza per posizione o mapparla automaticamente a una variante cancellata.

Il codice Shopify `CANNOT_DELETE_LAST_VARIANT` viene gestito come esito funzionale deterministico: aggiorna l'anteprima e conduce ai tre percorsi sopra, non diventa un errore tecnico generico.

Se una standalone/orfana viene scoperta durante una riconciliazione, il prodotto viene segnalato come divergente. Finché non è risolto, nessun push completo deve poterla rendere acquistabile accidentalmente.

### 11.4 Eliminazione prodotto

> ✅ **Decisione confermata**

1. Preflight completo di tutte le varianti.
2. Conferma con somme aggregate e dettaglio espandibile.
3. Marcatura logica del prodotto e delle varianti nella stessa transazione locale.
4. Sospensione di nuovi push ordinari per quell'aggregate.
5. Spubblicazione tecnica quando utile a chiudere una finestra di vendita.
6. `productDelete` GraphQL.
7. Verifica dell'assenza remota.
8. Completamento dell'operazione.

### 11.5 Errori e disconnessione

> ❓ **Decisione da prendere**

Una dipendenza locale non blocca. Un problema tecnico remoto produce invece un'operazione pendente:

- localmente il record resta eliminato e non selezionabile;
- la UI non dichiara «eliminato anche da Shopify»;
- mostra `Eliminato in VestiFlow — rimozione Shopify in attesa`;
- il worker riprova;
- l'operatore può riconnettere Shopify o riprovare;
- gli errori permanenti richiedono un'azione esplicita.

Non ripristinare automaticamente il record locale per un errore di rete. Non fingere che il remoto sia stato eliminato.

### 11.6 Concorrenza

> 🔧 **Proposta tecnica da verificare**

Durante una cancellazione pendente:

- i normali push di prodotto/variante vengono accorpati o scartati come superati;
- un webhook remoto non riattiva il record;
- un ripristino crea un comando compensativo ordinato dopo la cancellazione o annulla l'operazione se non partita;
- due click ripetuti producono **un solo effetto**, comunque sia realizzato.

---

## 12. Prima sincronizzazione: riconciliazione, baseline e attivazione

> 🔧 **PROPOSTA DA ESAMINARE — l'intero capitolo.**
>
> I nove passi qui descritti sono una forma ipotizzata del wizard, non un flusso approvato. Nessuna sottosezione di questo capitolo autorizza un'implementazione.

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

Tabella di corrispondenza esplicita:

- location Shopify a sinistra;
- sede VestiFlow a destra;
- proposta per nome solo come aiuto;
- conferma umana;
- possibilità di escludere una location;
- nessuna duplicazione automatica prima del matching.

Le configurazioni molti-a-uno o uno-a-molti richiedono una regola separata. Il flusso standard è uno-a-uno.

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

Operazioni più recenti possono sostituire quelle obsolete sullo stesso aggregate, salvo le operazioni distruttive già inviate.

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

- metadati cancellazione su `Product` e `ProductVariant`;
- lifecycle variante;
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

⛔ **La Tranche 0 NON è completata.** Una sola delle sue fette lo è.

|           |                                                                       |                                                                                                     |
| --------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **0A.1**  | **totali economici di riga sul percorso generico**                    | ✅ **completata e verificata**, con i test eseguiti                                                 |
| **0B.1**  | **filtro Sede del Registro canonico**                                 | ✅ **completata e verificata**, con i test eseguiti                                                 |
| **0A.2a** | **snapshot identificativi di riga sul percorso generico**             | ✅ **completata e verificata**, con i test eseguiti                                                 |
| **0A.2b** | **consumo degli snapshot: riapertura, interfaccia, stampa**           | ✅ **completata e verificata**, con i test eseguiti                                                 |
| **0A.2c** | **duplicazioni e conversioni: gli snapshot seguono la riga sorgente** | ✅ **completata e verificata**, con i test eseguiti                                                 |
| —         | «Concludi ordine» (ordine cliente → documento)                        | ⏸ **lacuna dichiarata**: `SalesOrderLine` non ha `articleCode` né `productName`                     |
| —         | **convergenza Corrispettivi**                                         | ✅ **fatta il 03/09/2026**: il vecchio export è stato rimosso, il Registro canonico è l'unica fonte |
| —         | contratto autonomo dei movimenti (§5.3)                               | ⏸ da fare                                                                                           |
| —         | eliminazione locale                                                   | ⏸ da fare                                                                                           |
| —         | **migrazione push Shopify a GraphQL** (Tranche 2 e 3)                 | ⏸ **da eseguire**, decisa in §1.6                                                                   |

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

⚠️ **Resta la 0A.2b**: duplicazione, conversione e stampe non sono state toccate, e gli altri percorsi di scrittura — Arrivo merce, Vendita al banco, movimenti — restano fuori come da perimetro dichiarato.

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
sourceDocumentLineId presente → copia dalla riga sorgente (null inclusi)
sourceDocumentLineId assente  → riga nuova → anagrafica corrente
variante diversa dalla sorgente → si rifotografa: è un altro articolo
```

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
isolamento tenant, sorgente non modificata — **9 prove dirette sulla funzione condivisa**, e 4
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

**Obiettivo:** introdurre lo stato locale non attivo, l'eliminazione logica, ripristino e contesti di ricerca.

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

**Gate:** si elimina con qualsiasi dipendenza dopo avviso; nessuna riga storica o inventariale viene cancellata o modificata.

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

### Tranche 3 — Migrazione completa del push

> ✅ **DA ESEGUIRE**, insieme alla 2 e prima della prima sincronizzazione (§1.6).

**Obiettivo:** sostituire il push REST senza cambiare il significato funzionale dei dati.

Lavori:

1. nuovo builder per intenzione;
2. creazione prodotto GraphQL;
3. aggiornamento prodotto senza lista varianti implicita;
4. create/update/delete varianti espliciti;
5. media/metafield/tassonomia senza perdita;
6. inventory GraphQL, con la garanzia che una ripetizione non duplichi l'effetto;
7. persistenza e verifica GID;
8. shadow comparison o ambiente pilota;
9. 🔧 cutover — il feature flag per tenant è una modalità proposta, da confermare;
10. rimozione delle scritture REST e guardia che ne impedisca il ritorno.

**Gate:** ⭐ **nessuna scrittura di catalogo o inventario passa da REST** (§1.6, confermato); una modifica non strutturale non crea, elimina o riassegna varianti.

### Tranche 4 — Ciclo di vita sincronizzato

**Obiettivo:** collegare stato non attivo, riattivazione, eliminazione e ripristino al nuovo motore.

Lavori:

1. 🔧 la rappresentazione locale delle publication — la **matrice persistita** è una forma proposta (§10.1), non un requisito;
2. la variante non attiva smette di essere acquistabile sul canale;
3. riattivazione controllata;
4. eliminazione variante;
5. ❓ caso **ultima variante** — le quattro strade remote sono aperte (§11.3): questo lavoro non parte finché non si sceglie;
6. eliminazione prodotto;
7. errori pendenti e recupero;
8. concorrenza con webhook e push;
9. audit end-to-end.

**Gate:** ogni combinazione locale/remota termina in uno stato **verificabile**, non altera storia né inventario, e **non produce effetti duplicati**.

### Tranche 5 — Prima sincronizzazione

> ⏸ **SOSPESA in attesa delle decisioni di §0-bis.** Non autorizza alcuna implementazione: il wizard (§12) è una proposta da esaminare.

**Obiettivo:** realizzare wizard, riconciliazione, baseline e cutover.

Lavori: §§12.1–12.13 completi, non un semplice pulsante `Importa catalogo`.

**Gate:** i tre scenari (Shopify pieno, VestiFlow pieno, entrambi pieni) producono anteprima ripetibile, nessun duplicato silenzioso e attivazione idempotente.

### Tranche 6 — Regime continuativo

> ⏸ **SOSPESA in attesa delle decisioni di §0-bis.** Outbox, lock e worker sono proposte tecniche (§8.4), non requisiti approvati.

**Obiettivo:** webhook, outbox, ownership, riconciliazione e monitoraggio.

**Gate:** perdita o duplicazione di webhook, riavvio del worker e modifiche concorrenti non duplicano entità e non cambiano campi fuori allowlist.

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
- Un movimento continua a mostrare identità, costo e ricavo senza join obbligatorio all'anagrafica attiva.
- **Il Registro canonico e i suoi export**, prima e dopo un cambio di listino, sono byte-identici salvo metadati non economici dichiarati — e lo restano dopo la convergenza del consumatore del vecchio percorso.

  ⛔ Il criterio riguardava «l'export Corrispettivi» senza dire quale, e finiva per pretendere l'**invarianza del vecchio export**: cioè di ripararlo. Quel percorso si dismette, quindi non ha criteri di accettazione — ne ha solo il Registro.

- I report dello stesso periodo mantengono conteggi e totali dopo il passaggio a non attiva o l'eliminazione.
- Il pregresso non ricostruibile è esplicitamente mancante, non valorizzato col dato corrente.

### 17.2 Eliminazione locale

- Variante con movimenti: eliminabile dopo avviso.
- Variante con giacenza: eliminabile dopo avviso; giacenza resta visibile.
- Variante con impegni/lotti/matricole: eliminabile dopo avviso; record collegati invariati.
- Prodotto con tutte le condizioni insieme: eliminabile dopo avviso aggregato.
- Due richieste identiche: **nessun effetto duplicato** — una sola eliminazione logica, e nessuna operazione remota ripetuta.

  ⚠️ Il criterio diceva «una sola operazione outbox», cioè imponeva l'outbox come soluzione dentro un criterio di accettazione. Outbox, lock, worker, hash e token restano **possibili** soluzioni tecniche: il requisito è che l'effetto non si duplichi, comunque lo si ottenga.

- Un tenant non può preflightare o eliminare il record di un altro tenant.
- Il ripristino non genera movimenti.

### 17.3 Ricerca e UI

- Una variante non attiva o eliminata non appare nelle nuove selezioni commerciali.
- Una variante non attiva appare nelle operazioni di magazzino consentite.
- Eliminato con quantità appare nella Situazione magazzino con badge.
- Riaprire un documento storico non perde nome, codice o barcode.
- Scanner e ricerca per codice rispettano il contesto.
- Nessun contatore varianti viene calcolato dalle sole combinazioni teoriche delle opzioni.

### 17.4 Shopify GraphQL

⚠️ **Sono criteri sul RISULTATO.** Dove una voce nominava un meccanismo ancora aperto, è stata riscritta in ciò che deve essere vero.

- La versione API richiesta ed effettiva **coincidono** e sono **fissate**, mai `latest` o implicite. 🔧 Quale sia esattamente è ancora da confermare (§1.6).
- `userErrors` impedisce lo stato `synced`.
- Cambio nome prodotto non modifica il numero o gli ID delle varianti.
- Cambio prezzo di una variante aggiorna soltanto quella variante.
- Eliminazione esplicita di una variante usa `productVariantsBulkDelete`.
- Ultima variante conduce al percorso prodotto o allo stato non attivo, mai a uno stato impossibile.
- Articolo semplice: la standalone Shopify è mappata alla variante base locale e non rimane fantasma.
- 🔧 Le **conversioni semplice ⇄ varianti** non hanno ancora criteri approvati: il loro comportamento remoto è aperto (§0-bis). Resta fermo il solo risultato: **nessuna variante orfana e nessun fantasma acquistabile**.
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

| Area                                | Punti noti                                                                                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eliminazione prodotto/varianti      | `api/src/products/products.service.ts`                                                                                                                               |
| Schema e relazioni                  | `api/prisma/schema.prisma`, migration applicate                                                                                                                      |
| Push catalogo                       | `api/src/shopify/shopify-product-push.service.ts`                                                                                                                    |
| Client REST                         | `api/src/shopify/shopify-admin.client.ts`                                                                                                                            |
| Client GraphQL                      | `api/src/shopify/shopify-graphql.client.ts`                                                                                                                          |
| Facade/inneschi                     | `api/src/channels/channel-sync.facade.ts`                                                                                                                            |
| Push inventario                     | `api/src/shopify/shopify-inventory-push.service.ts`                                                                                                                  |
| Reconciliation inventario           | `api/src/shopify/shopify-inventory-reconciliation.service.ts`                                                                                                        |
| Pull catalogo                       | `api/src/shopify/shopify-product-pull.service.ts`                                                                                                                    |
| OAuth/scope                         | `api/src/shopify/shopify-oauth.service.ts`, configurazione Shopify                                                                                                   |
| Form prodotto                       | `src/app/domain/products/product-form.component.*`, mapper e step varianti                                                                                           |
| Ricerca condivisa                   | `searchVariantSummaries`, `document-product-search-panel`, `DocumentCodeLookupService`, scanner e lookup fornitore                                                   |
| Situazione magazzino                | `api/src/inventory/inventory-situation.service.ts`                                                                                                                   |
| **Corrispettivi — modulo canonico** | `api/src/corrispettivi/*` (servizio, export, query, classificazione, totali) e `src/app/features/reports/pages/corrispettivi-report` — ⭐ la fonte di verità         |
| **Corrispettivi — filtro Sede**     | `api/src/corrispettivi/corrispettivi-location-filter.util.ts` — normalizzazione del filtro, NON un’autorizzazione                                                    |
| **Corrispettivi — vecchio export**  | `api/src/inventory/inventory-export.service.ts` (`exportCorrispettiviCsv`) — ⛔ **da dismettere**, unico consumatore `src/app/features/reports/reports.component.ts` |
| Export Ordini Shopify               | `/sales-orders/export/csv` — percorso a sé, non è un Corrispettivo                                                                                                   |
| **Totali economici di riga**        | `api/src/documents/document-line-economic-totals.util.ts` e `computeLines`/`toLineCreateData` in `documents.service.ts`                                              |
| Snapshot righe                      | DTO e workflow sotto `api/src/documents`, `src/app/features/documents` e moduli collegati                                                                            |
| Movimenti                           | `StockMovement`, servizi documentali/inventariali e analytics                                                                                                        |
| Guardie                             | `scripts/check-*.mjs`, script `lint` del `package.json`                                                                                                              |

---

## 21. Condizione finale di completamento

⚠️ **Sono RISULTATI, non soluzioni.** La condizione finale dice cosa dev'essere vero, mai con quale meccanismo: imporre qui una forma tecnica ancora aperta significherebbe averla decisa senza deciderla.

Il lavoro è completo soltanto quando:

- eliminare non altera storia, inventario o analisi;
- ogni dipendenza produce un avviso concreto ma non un blocco;
- stato locale, eliminazione, pubblicazione e giacenza sono assi indipendenti;
- i report non dipendono dallo stato anagrafico corrente;
- una variante locale non attiva e sincronizzata non è più acquistabile su Shopify, **senza** che quantità, giacenza, impegni, movimenti o `inventoryPolicy` siano stati alterati per ottenerlo;
- la prima sincronizzazione crea una baseline **verificabile e ripetibile**;
- la sincronizzazione continuativa **non produce effetti duplicati**, è osservabile e recuperabile;
- ⭐ **il push di catalogo, varianti e inventario NON usa più REST**: dopo il cutover nessuna scrittura passa dal vecchio percorso (§1.6, decisione confermata);
- un tenant senza Shopify non percepisce l'esistenza del modulo;
- vecchi documenti e movimenti conservano la stessa lettura e gli stessi numeri prima e dopo tutte queste operazioni.

⚠️ **La cessazione delle scritture REST è un risultato, non una soluzione**, ed è per questo che sta qui: dice cosa dev'essere vero alla fine, non con quale client, quale versione o quale meccanismo di cutover — che restano aperti (§1.6).

⛔ È stata invece tolta _«Shopify è governato tramite GraphQL `2026-07` con publication per variante»_: fissava una **versione** e un **meccanismo** in un criterio di completamento, e nessuno dei due è ancora confermato. E _«idempotente»_ è stato sostituito col risultato che descrive — «nessun effetto duplicato» — perché l'idempotenza è un modo di ottenerlo, non l'obiettivo.
