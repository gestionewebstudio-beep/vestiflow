# Specifica — Numerazione documenti

**Documento di prodotto.** Owner: Luigi. Le decisioni qui dentro sono definitive salvo revisione esplicita e datata.

Questo documento **supera**:

- `numerazione-documenti-verifica.md` (luglio 2026) — testo pre-decisione, diversi punti ribaltati
- le due stesure precedenti di questo file (11 agosto, mattina e pomeriggio) — §2 riformulato, §3 e §4 riscritti

Ultimo aggiornamento: 11 agosto 2026, sera.

---

## §0 — Migrazioni implicate

| Intervento                                               | Tipo            | Note                                         |
| -------------------------------------------------------- | --------------- | -------------------------------------------- |
| Proposta del numero per data                             | **Additiva**    | Serve un indice composito, vedi sotto        |
| Campo data sul DTO di anteprima                          | **Nessuna**     | Solo DTO                                     |
| Preferenza "non mostrare più"                            | **Additiva**    | Copiare `UserDocumentPriceModePreference`    |
| Sottotipo Nota di credito e Fattura d'acconto            | **Additiva**    | Nuovi valori su enum Postgres `DocumentType` |
| Rimozione numerazione dal Corrispettivo                  | **Distruttiva** | Vedi §8. Coordinare con `feature/cassa`      |
| Rimozione `DocumentSequence`                             | **Distruttiva** | Backup da sistemare **prima**. Vedi §9       |
| Ora sulla vendita al banco + marcatore RT fuori servizio | **Additiva**    | Vedi §8                                      |

**Già applicate** l'11 agosto sul ramo, additive: colonne del riferimento controparte, indici unici parziali, indice del numero sul numeratore.

Regola invariata: mai `prisma migrate dev` o `db push` sul database condiviso. Solo `prisma migrate deploy`.

---

## §0-bis — Regola di lavoro: la guida si aggiorna dentro il blocco

_Adottata 13 agosto 2026._

**Quando un blocco cambia ciò che l'operatore vede, la guida si aggiorna prima di dire «chiuso».** Non dopo, non a fine ciclo.

- La **fonte** è `docs/GUIDA-UTENTE-VESTIFLOW.md`. HTML e PDF sono artefatti: non si modificano a mano.
- Si rigenera con **`npm run docs:guide:all`**.
- Non è documentazione a margine: lo stesso comando scrive `public/guide/` e `src/assets/guide-admin/`, cioè **la guida che l'operatore legge dentro l'app**.

Il motivo è misurato, non teorico: al 13 agosto la guida diceva ancora _«I numeri progressivi vengono assegnati alla conferma»_ e non nominava né la testata Data/Serie/Numero, né il numero modificabile, né l'avviso di conflitto, né la sede. Era ferma all'8 agosto — cinque giorni e tre blocchi indietro. Riprendere una guida disallineata costa più che tenerla allineata, perché chi la riscrive dopo deve prima ricostruire cosa è cambiato.

**Voce aperta:** la **guida tecnica** esiste solo come HTML e PDF, senza sorgente nel repository. Un documento che non ha sorgente è un documento che nessuno potrà più aggiornare quando servirà. Va trovata la sua origine — non urgente, ma da non perdere di vista.

### Perimetro reale della proposta per data

**Dodici chiamate in sette file**, non nove in cinque come diceva la prima stesura (il conto vecchio veniva da un ramo precedente al commit `6fc27982`).

**Costo.** `NextNumberInput` oggi non riceve la data, e non esiste un indice che includa `documentDate` accanto a `(tenant, type, series)`. Senza, il calcolo del massimo fra i documenti con data anteriore scansionerebbe l'intera partizione — dentro il lock, che serializza tutti gli operatori sullo stesso contatore.

Due interventi necessari:

- **indice composito** `(tenant_id, type, series, document_date, number)`, così il primo passo diventa un accesso a indice
- **mai materializzare l'elenco dei numeri**, né in SQL né in JavaScript: la regola gira sotto lock e dev'essere logaritmica, non lineare

_Riformulato il 13/08/2026._ Qui c'era scritto «**una sola query** SQL che restituisce un intero». Il vincolo vero non era il numero di query: era il non tirare su l'elenco dei numeri. **Due query sotto indice lo rispettano**, e la differenza non è accademica — è ciò che permette di tenere il massimo sull'aggregato Prisma, quindi verificabile dai doppioni di prova, invece di spostare tutta la regola in SQL grezzo dove la suite può solo confrontare stringhe. Vedi «Stato al 13/08» qui sotto.

**Scartata** l'ipotesi di tenere `max+1` sotto lock mettendo la logica per data solo nella proposta mostrata: produrrebbe una divergenza sistematica fra numero visto e numero assegnato, non dovuta a concorrenza. Inaccettabile su un documento fiscale.

### Stato al 13/08/2026: indice fatto, regola ferma su un bivio

**Fatto e applicato:** l'indice composito, migration `20260813120000_indice_numerazione_per_data`, **additivo** — tre indici parziali, uno per fonte del numero, perché le tabelle sono tre con colonne data diverse:

| Fonte             | Partizione                        | Colonna data    |
| ----------------- | --------------------------------- | --------------- |
| `documents`       | (tenant, type, series)            | `document_date` |
| `supplier_orders` | (tenant, series)                  | `order_date`    |
| `sales_orders`    | (tenant, source='manual', series) | `placed_at`     |

Su `sales_orders` la data della testata finisce in **`placed_at`** — la maschera scrive `placedAt: documentDate` (`manual-sales-orders.service.ts:333`), e per gli ordini manuali è sempre la mezzanotte del giorno scelto, quindi il confronto sul timestamp coincide con quello per giorno. **Questo chiude il punto lasciato aperto nel §10** («quale campo di `SalesOrder` fa da data per la numerazione»): la risposta era già nel codice.

**Fatto:** la data arriva fino a `NextNumberInput.documentDate` da tutti i percorsi di assegnazione (Arrivo merce, Ordine cliente, Ordine fornitore) e dall'avviso di conflitto. Oggi il campo c'è e **non viene ancora letto**.

**Fermo:** la query. La regola non è esprimibile in Prisma — vuole `ORDER BY … LIMIT 1` con un `NOT EXISTS` correlato — e la versione in SQL grezzo, scritta e funzionante a compilazione, **fa fallire 29 test API**. Non per un doppione incompleto: perché quei test _descrivono la regola vecchia_, osservando `document.aggregate` e asserendo `max+1`. Con i doppioni attuali un `$queryRaw` è verificabile solo confrontando il **testo** della query, che è una prova fragile proprio sulla funzione più delicata di quest'area.

**Le tre strade, con il loro prezzo:**

| Strada                                                                                                                                           | Cosa costa                                                                                                  | Cosa si ottiene                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · Riscrivere i 29 test sul testo SQL**                                                                                                       | prove fragili: una riscrittura innocua della query le fa arrossare, e nessuna dice se il risultato è giusto | una query sola, come chiede il §0                                                                                                                        |
| **B · Due query index-backed**: il massimo resta l'aggregato Prisma (con il filtro data aggiunto), e solo il «primo libero > m» va in SQL grezzo | due accessi invece di uno, entrambi logaritmici                                                             | i test esistenti **conservano il significato** — continuano a osservare la partizione — e il filtro per data diventa verificabile con i doppioni di oggi |
| **C · Test di integrazione su Postgres vero**                                                                                                    | l'infrastruttura non c'è: la suite API gira tutta su doppioni                                               | l'unico modo di provare _davvero_ la regola, casi del §2 compresi                                                                                        |

**Scelta: B, con C in prospettiva** _(13/08/2026)_. La ragione del §0 è «mai materializzare l'elenco dei numeri», non «una query sola»: due query sotto indice la rispettano, e i test conservano il significato invece di diventare guardie di stringhe. C resta la sola strada che prova _davvero_ la regola sui casi qui sopra, ma vuole un Postgres in prova che oggi non c'è.

### Fatto — la regola è accesa (13/08/2026)

**Il primo passo, `lastAssignedNumber`, resta un aggregato Prisma** col filtro `documentDate < inizio del giorno`: è la parte che dice _quali_ documenti entrano nel conto, cioè dove la regola può sbagliare in silenzio, e i doppioni di prova la osservano. Due prove nuove la inchiodano: `lt` e non `lte` — i documenti dello stesso giorno restano fuori, ed è ciò che permette di tappare un buco fra due documenti di pari data — e il confine è sempre una **mezzanotte**, mai un istante.

**Il secondo passo, «primo libero > m», è l'unico in SQL grezzo**, perché Prisma non sa esprimerlo: `ORDER BY … LIMIT 1` con un `NOT EXISTS` correlato, sotto l'indice appena creato, senza mai materializzare l'elenco dei numeri.

**Uno scarto trovato dalla prova, non dalla lettura:** senza data l'implementazione non filtrava affatto — cioè restava «massimo + 1» — mentre il §2 dice **«il primo libero a partire da oggi»**. Il caso non è teorico: è la colonna «prossimo numero» dei Numeratori, che senza quel confine mostrerebbe un numero diverso da quello che la testata mostra due secondi dopo.

I 29 test che descrivevano `max+1` non sono stati riscritti: **conservano tutti il significato**, perché il massimo è rimasto dove sanno guardare. Ai doppioni è bastato imparare il secondo passo — e in `document-counters.service.spec.ts` lo ricavano dal massimo appena letto, così ogni test continua a configurare **una cosa sola**.

---

## §1 — Il contatore

_Deciso 3 agosto 2026. Verificato in codice 11 agosto: già implementato._

Il contatore è definito da **tenant + tipo documento + serie**. Ogni contatore ha il proprio progressivo, indipendente dagli altri: "serie 2026 per Ordini cliente" e "serie 2026 per Fatture" sono due contatori distinti e possono arrivare entrambi al 42 senza conflitto.

`DocumentCounter` **non memorizza il progressivo**: il numero si ricava dai documenti reali.

`locationId` determina **solo la disponibilità** della serie nella tendina, non partiziona il progressivo. Senza location la serie è disponibile ovunque; con location, solo per i documenti di quella sede.

**L'anno non esiste come concetto di sistema.** Non sta nel riferimento e non partiziona. Chi vuole il reset annuale crea una serie chiamata "2026".

Riferimento: `PREFISSO[-SERIE]-NNNN`. Il prefisso è proprietà del tipo documento e si configura nelle card per tipo. La serie si configura **solo** nei Numeratori.

Ogni tipo nasce con un contatore «Senza serie», seminato e non eliminabile → `OC-0001`.

**Superato:** la location come partizione; il progressivo modificabile nelle Impostazioni; l'anno come serie implicita.

---

## §1-bis — La sede

_Impianto deciso 3 agosto 2026. Completato l'11 agosto dopo la verifica del codice, che ha trovato la regola applicata a metà._

### Premessa: un tenant, un soggetto fiscale

**Un tenant corrisponde a una sola partita IVA.** Le sedi sono punti operativi dello stesso soggetto — magazzini, negozi, depositi — non aziende distinte.

Non era mai stato scritto. **Verificato l'11 agosto: il codice lo rispetta già ovunque**, e non per caso.

- I dati fiscali stanno tutti su `Tenant` in campi scalari singoli (`schema.prisma:309-330`): `legalName`, `vatNumber`, `fiscalCode`, `pec`, `sdiCode`, `iban`, indirizzo completo. Nessuna duplicazione, nessun modello «Azienda» separato dal Tenant
- `Location` non ha **nemmeno un campo fiscale**, neppure inutilizzato: solo nome, codice, attivo, legame allo `Store` e indirizzo denormalizzato — con un commento nello schema che lo dichiara già «display/etichette, non entità a sé». Anche `Store` è nudo. L'unico altro modello con partita IVA è `Party`, cioè le controparti
- Il **cedente/prestatore** nell'XML della fattura elettronica si costruisce interamente dal Tenant, cercato per il solo `tenantId` (`document-xml.service.ts:40-51`). Il `locationId` del documento non viene mai letto, e non esiste alcun blocco `StabileOrganizzazione`
- Tutti e tre i generatori PDF e l'export commercialista dei corrispettivi compongono l'intestazione dal Tenant. **Nessun generatore legge la sede**
- Registri IVA e liquidazioni non esistono in nessuna forma. L'aggregazione dei corrispettivi è per tenant: `CorrispettivoEntry` non ha nemmeno una colonna `locationId`

**Conseguenza da dichiarare:** un cliente con due partite IVA avrà due tenant, cioè due abbonamenti separati. Non è una limitazione tecnica ma la realtà fiscale — due partite IVA sono due aziende, e un trasferimento fra loro è una vendita con fattura, non un trasferimento interno.

**La sede non compare nell'XML in nessun punto.** È una scelta, non una dimenticanza: se un domani servisse la stabile organizzazione o un punto vendita dichiarato, il posto sarebbe `sedeBlock` e il dato oggi non esiste da nessuna parte.

**L'unico punto in cui la sede tocca qualcosa di fiscale-adiacente è la numerazione, e lo conferma invece di smentirlo:** `locationId` sul contatore decide quale serie è disponibile, non chi emette. Due negozi con numerazioni separate restano un solo soggetto con due serie.

La questione dei più soggetti fiscali sotto un'unica gestione resta aperta in §10, come ipotesi futura da non scoprire per caso.

### La regola

**Una serie assegnata a una sede è usabile solo in quella sede. Una serie senza sede è usabile ovunque.**

È la regola del 3 agosto, ricavata dallo scenario dei due negozi: con serie NAP legata a Napoli e MI legata a Milano, chi emette da Milano vede MI e le serie senza sede; NAP non è nemmeno selezionabile.

`locationId` sul contatore è quindi **disponibilità, non partizione**: due sedi con numerazioni separate si ottengono con due serie, non con la sede dentro la chiave del progressivo.

### Il filtro, per esteso

I contatori disponibili per un documento sono quelli **con la sede del documento** più quelli **senza sede**. Uguaglianza esatta, nessuna gerarchia, nessun fallback.

Se il documento non ha una sede selezionata, restano disponibili solo i contatori senza sede.

### La regola vale anche in assegnazione — non solo in tendina

_Difetto verificato l'11 agosto, da correggere._

Oggi il filtro esiste in un punto solo: `document-counters.service.ts:156-164`, che serve la tendina. La funzione che assegna la serie al salvataggio (`document-numbering.util.ts:90-100`) cerca il contatore `isDefault` **senza guardare la sede**, e non accetta nemmeno `locationId` come parametro.

Conseguenza: contatore NAP legato a Napoli e marcato predefinito, un operatore di Milano apre una fattura, la tendina correttamente non gli mostra NAP, lui non tocca la serie e salva — **il documento esce con serie NAP**. La tendina dice il vero, il salvataggio no.

**Il predefinito si applica solo se compatibile con la sede del documento.** Se non lo è, non si applica, e vale la regola già stabilita: un solo contatore disponibile → quello; più d'uno → nessuna proposta, sceglie l'operatore.

### «Senza serie» scelta deve valere come scelta

_Difetto verificato l'11 agosto, da correggere._

Oggi il frontend manda `series: … || undefined`, cioè **omette la chiave**, e il backend interpreta l'assenza come «usa il predefinito». Selezionare «Senza serie» in tendina non dice quindi _nessuna serie_: dice _decidi tu_ — e chi decide può essere un predefinito di un'altra sede.

La selezione esplicita dell'operatore deve viaggiare **come valore**. Il «decidi tu» resta solo quando l'operatore non tocca la tendina.

### Il cambio sede ricarica la tendina

_Difetto verificato l'11 agosto, da correggere._

Esiste una sola sottoscrizione a `locationId.valueChanges` in tutto il progetto (`customer-order-form.ts:1676`), e ricarica le disponibilità delle righe, non i contatori. Nessuna maschera ricarica quindi la tendina serie quando l'operatore cambia sede: l'elenco resta quello chiesto all'apertura.

Con la regola sopra diventerebbe anche incoerente col salvataggio. Il meccanismo di ricarica esiste già per il cambio tipo e il cambio data nell'Arrivo merce: è un innesto, non una costruzione.

### La sede predefinita dell'operatore

_Deciso 11 agosto 2026, riformulato dopo la verifica sulle sedi assegnate._

**Le sedi si assegnano all'operatore.** Con quattro sedi configurate, un operatore può averne assegnate una, alcune o tutte. **Non esiste un operatore senza sedi assegnate**, quindi quel caso non va gestito.

La regola nel campo Sede in testata:

- **Una sola sede assegnata** → esce quella. Non è una precompilazione, è l'unica opzione disponibile
- **Più sedi assegnate, con una marcata come predefinita** → esce la predefinita
- **Più sedi assegnate, senza predefinita** → il campo resta vuoto e l'operatore sceglie ogni volta

Il campo resta sempre modificabile fra le sedi selezionabili.

**Perché non contraddice il dominio.** Il servizio dichiara «mai usarla come fallback automatico» per i form, e resta vero: la sede non è un'ipotesi che il sistema costruisce, è un dato assegnato esplicitamente a quell'utente. Il commesso del negozio di Napoli non deve confermare a ogni documento di stare a Napoli. Chi lavora su più sedi senza predefinita sceglie ogni volta — che è corretto proprio per lui, perché è l'unico caso in cui la scelta è ambigua.

**Il suggerimento cliccabile sparisce.** Arrivo merce, Trasferimento e Rettifica mostravano un suggerimento («Usa la sede suggerita Milano») invece di preselezionare, con tre test a fissarlo. Non serve più: o il campo è già pieno, o l'operatore ha più sedi e deve scegliere consapevolmente. I tre test vanno riscritti sui casi nuovi.

**La Vendita in negozio resta com'è.** Lì la sede nasce dal selettore di sede della shell, quindi è già determinata dal contesto: non ha senso farla riconfermare a ogni scontrino.

### Sedi visibili e sedi selezionabili

_Deciso 11 agosto 2026._

**La tendina mostra sempre tutte le sedi del tenant. Sono selezionabili solo quelle assegnate all'operatore; le altre sono visibili ma disabilitate.**

Una regola sola per tutti i campi sede, nessuna distinzione per tipo documento.

Il motivo per mostrarle invece di nasconderle: l'operatore capisce _perché_ non può selezionarle. Vede che Milano esiste, è lì disabilitata, e sa di doverla chiedere. Nascondendola crederebbe che il sistema sia rotto o che Milano non esista.

**L'unica eccezione è la sede di destinazione del Trasferimento**, che è selezionabile fra **tutte** le sedi, assegnate o no. La sede di partenza segue invece la regola generale.

Il motivo è che i due campi dicono cose diverse: la partenza dice **da dove esce la merce** — l'operatore la governa, deve essere una delle sue; la destinazione dice **dove arriva** — lui non ci opera, la sceglie come si sceglie un indirizzo di consegna. Senza questa eccezione, il magazziniere di Napoli non potrebbe spedire a Milano, che è il caso d'uso principale dei trasferimenti.

**Precompilazione nei Trasferimenti:** solo la sede di partenza. La destinazione resta vuota — precompilarla produrrebbe un trasferimento verso sé stessa.

### Da verificare dopo il merge con `develop`

Il collega ha mergiato `feature/permessi-sezioni-documenti` su `develop` il 12 agosto, con un commit che dichiara «il permesso segue l'effetto, non il nome della rotta». Nello stesso periodo, su questo ramo, `destination_location_id` sull'Ordine fornitore è passata da vuota a popolata — ed **è già usata dal controllo d'accesso**. Finché era vuota ogni ordine era visibile a tutti; ora un ordine per Napoli sparisce a chi non ha Napoli.

I due lavori si incontrano al merge. Da verificare allora, non prima:

1. **Come si compongono i due meccanismi.** Un operatore col permesso giusto ma senza quella sede: vede o non vede? Il filtro per sede si somma al permesso o lo sostituisce?
2. **Il filtro per sede vale su tutti i documenti o solo sugli Ordini fornitore?**
3. **Documenti senza sede** (tutti quelli creati prima che il campo esistesse): restano visibili a tutti. Da confermare che sia il comportamento reale e non solo l'intenzione.
4. **La sede predefinita esiste come dato distinto** dall'elenco delle sedi assegnate, o va costruita?
5. **L'Ordine fornitore ha una tensione da sciogliere.** Lì `destination_location_id` dice dove il fornitore consegnerà — è una destinazione, non la sede in cui l'operatore lavora. Ma è anche il campo che la guardia usa per decidere chi vede l'ordine. Conseguenza: un operatore di Napoli che ordina merce per Milano **vede sparire il proprio ordine appena lo salva**. Probabilmente sbagliato, ma dipende da come è costruita la guardia: da chiarire col collega.

### Dove compare il campo Sede

**In tutti i documenti che muovono merce o che stanno in una catena che la muove.**

Il criterio di partenza era «dove il documento agisce su giacenze o disponibilità». Due precisazioni lo completano.

**La Fattura proforma ce l'ha**, pur non scaricando né impegnando: è il primo anello di una catena che scarica (proforma → DDT → fattura), e la sede decisa lì si propaga a valle, evitando che qualcuno la scelga diversa tre documenti dopo.

**La Registrazione fattura fornitore NON ce l'ha.** Non è un'eccezione arbitraria: la fattura del fornitore è intestata all'azienda, non alla sede — un'unica partita IVA, un unico registro acquisti — e una singola fattura può coprire arrivi merce di sedi diverse, perché il fornitore consegna a Napoli e a Milano e fattura tutto insieme. Un campo sede lì produrrebbe o un filtro sbagliato sugli arrivi merce collegabili, o un dato che non filtra niente.

**Attenzione a non confondere le due cose:** quel tipo ha **numerazione e serie come tutti gli altri**, si creano e si scelgono normalmente. Quello che non ha è il campo Sede in testata. Il `null` che passa oggi alla tendina è quindi corretto e non è un difetto: le serie senza sede sono disponibili ovunque, quindi quel tipo vede sempre le proprie serie.

✅ **Fatto il 13/08/2026.** Le tre maschere servite da `sales-document-form` (Proforma, Fattura, Fattura accompagnatoria) avevano il `FormControl locationId` ma **nessun campo nel template**: il valore poteva arrivare solo dal precompilato di conversione o dal documento riletto. Ora il campo c'è in testata (`sales-document-form.component.html:307`), incondizionato per tutti e tre i tipi, e si precompila con la sede predefinita dell'operatore come nelle altre maschere.

_Questa riga ha detto «Da implementare» per un giorno intero **dopo** che il campo esisteva, mentre più sotto lo stesso documento raccontava un difetto trovato e corretto proprio su quel campo. Un documento che si contraddice al suo interno è peggio di uno incompleto: chi legge non sa quale metà credere._

`Ordine fornitore` passa `null` fisso alla tendina perché non ha un campo sede: rientra nell'estensione. `Fattura acquisto` no, per il motivo sopra.

### Il campo Sede sul contatore non si blocca

_Deciso 11 agosto 2026._

Anche con una sola sede configurata, la tendina «Tutte le sedi» + sedi operative resta visibile nei Numeratori.

Con una sede sola assegnarla è inutile ma non dannoso: tutti i documenti hanno quella sede, quindi il filtro non esclude mai nulla. Nasconderla costerebbe di più — il giorno che apre il secondo punto vendita, il negoziante si troverebbe una funzione comparsa dal nulla e serie senza sede valide ovunque, senza capire perché.

### Il contatore «Senza serie» non può ricevere una sede

_Comportamento verificato, dichiarato voluto l'11 agosto._

La riga «Senza serie» — quella seminata d'ufficio per ogni tipo — non ha il pulsante Modifica (`document-counters.component.html:26-30`, reso solo `@if (counter.series !== null)`). Il backend non lo vieta: è il template a non offrire l'accesso.

**È corretto e va mantenuto.** Il contatore base di un tipo deve restare valido ovunque: assegnandogli una sede, quel tipo perderebbe il contatore universale e in qualche sede la tendina potrebbe restare vuota.

### Stato del codice

| Pezzo                                                                               | Stato                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentCounter.locationId` nullable, FK verso `locations` con `ON DELETE CASCADE` | ✅                                                                                                                                                                                                                                                                                 |
| Unicità `(tenantId, type, series)` — la sede **non** è nell'identità                | ✅ (migration 28/07 l'ha declassata da chiave ad attributo)                                                                                                                                                                                                                        |
| Campo Sede nei Numeratori, montato in Impostazioni e nel pannello dell'ingranaggio  | ✅                                                                                                                                                                                                                                                                                 |
| `documents.location_id` + `target_location_id`, popolati dall'operatore             | ✅                                                                                                                                                                                                                                                                                 |
| `sales_orders.location_id` precompilato dalla sede predefinita utente               | ✅ — unica maschera che lo fa                                                                                                                                                                                                                                                      |
| Filtro «quella sede + senza sede» nella tendina                                     | ✅                                                                                                                                                                                                                                                                                 |
| Stesso filtro in assegnazione                                                       | ✅ 13/08 — `defaultCounterSeries` riceve la sede; il predefinito si applica solo se compatibile, altrimenti «uno solo → quello, più d'uno → sceglie l'operatore». Aggiornata anche l'**anteprima** del numero, che altrimenti avrebbe mostrato una serie diversa da quella salvata |
| «Senza serie» che viaggia come valore                                               | ✅ 13/08 — `DocumentNumberingStore.chosenSeries()`, nove punti di invio. `undefined` solo se la tendina non è stata toccata                                                                                                                                                        |
| Ricarica tendina al cambio sede                                                     | ✅ 13/08 — `locationId.valueChanges` → `refreshNumberProposal`, sette maschere                                                                                                                                                                                                     |
| Sede predefinita nelle altre maschere                                               | ✅ 13/08 — regola unica in `domain/inventory/utils/default-location-prefill.util.ts`. **Erano quattro comportamenti diversi, non uno**: vedi sotto                                                                                                                                 |
| Sedi non assegnate visibili ma disabilitate in tendina                              | ❌ da fare — eccezione: destinazione del Trasferimento selezionabile fra tutte                                                                                                                                                                                                     |
| Campo Sede in testata su Proforma, Fattura, Fattura accompagnatoria                 | ✅ 13/08 — desktop e pannello mobile                                                                                                                                                                                                                                               |
| Campo Sede in testata su Ordine fornitore                                           | ✅ 13/08 — scrive in `supplier_orders.destination_location_id`, colonna che c'era già: **nessuna migration**. Riempirla ne cambia la visibilità, vedi sotto                                                                                                                        |
| Campo Sede sulla Registrazione fattura fornitore                                    | ⛔ non lo riceve, per decisione — il `null` che passa alla tendina è corretto                                                                                                                                                                                                      |

#### Le maschere non erano una, erano quattro comportamenti diversi

_Verificato 13/08/2026, in fase di implementazione._

La riga «oggi lo fa una maschera sola — l'Ordine cliente» non era esatta, ed è il tipo di scarto che cambia la decisione invece di limitarsi a eseguirla:

| Maschera       | Cosa faceva                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordine cliente | precompilava con la predefinita                                                                                                                               |
| Trasferimento  | precompilava l'origine con la predefinita, **oppure** con l'unica sede scrivibile se l'utente era mono-sede                                                   |
| Rettifica      | **non** usava la predefinita: precompilava **solo** in mono-sede                                                                                              |
| Arrivo merce   | non precompilava mai; mostrava un **suggerimento cliccabile**, e lo faceva di proposito — la regola era scritta nel servizio di dominio e fissata da tre test |

**Cosa è caduto, oltre al suggerimento: il ripiego mono-sede.** Con una sola sede scrivibile e nessuna predefinita, due maschere compilavano il campo da sole. Ora no: senza predefinita il campo resta vuoto ovunque. La sede predefinita è un dato che qualcuno **assegna**, non una deduzione dal numero di sedi — ed è la distinzione che fa convivere questa regola col divieto di dominio («mai un fallback automatico») invece di scavalcarlo.

**Il prezzo, dichiarato:** il negozio con una sede sola e nessuna predefinita assegnata paga un gesto in più per documento. Si azzera assegnando la predefinita ai suoi utenti.

#### Dove si assegna la predefinita, e chi può farlo

_Verificato 13/08/2026._ Colonna `users.default_location_id` (nullable, FK `ON DELETE SetNull`); scrittura in `admin-tenant-users.service.ts`, che **azzera il campo da sé** se l'utente perde l'accesso a quella sede (`:206-208`); lettura filtrata sulle sedi scrivibili in `OperationalLocationsService.defaultLocation`.

**L'UI esiste ma è solo dell'operatore di piattaforma**: la tendina «Sede predefinita utente» sta in `admin-tenant-users-panel`, dentro «Modifica cliente», protetta da `platformAdminGuard` in rotta e `PlatformAdminGuard` lato API. Gestione utenti lato tenant non esiste.

Conseguenza: la regola è utilizzabile, ma **il titolare non può assegnare la sede ai propri commessi**. Finché i clienti si configurano dall'area di piattaforma basta; il giorno che devono farlo da soli serve una pagina utenti lato tenant. **Non è in questo perimetro.**

#### La Vendita in negozio resta fuori

Prende la sede dal **selettore della topbar** (`LocationContextService`, persistito in `localStorage`), non dal profilo: `store-sale-register.component.ts:203-204`, più un effect che la fissa quando il tenant ha un solo negozio. Precisazione: quel contesto può valere `null` («tutte le sedi») e nasce da `localStorage` — su un browser nuovo la vendita parte senza sede finché l'operatore non la sceglie, salvo mono-negozio.

#### Scrivere la sede sull'Ordine fornitore ne cambia la visibilità

_Da sapere, 13/08/2026._

`supplier_orders.destination_location_id` non era una colonna inerte: è **già** usata dal controllo d'accesso per sede. `assertLocationReadableInUserScope` (`user-location-scope.util.ts:50-64`) esce subito quando la sede è `null`, e l'elenco filtra con `OR: [{ destinationLocationId: null }, { destinationLocationId: { in: scope } }]` (`supplier-orders.service.ts:404-405`).

Finché la colonna restava vuota, **ogni ordine era visibile a chiunque**. Ora che si riempie, un ordine destinato a Napoli non compare più — e in dettaglio dà 403 — a chi non ha Napoli fra le sedi assegnate. Chi ha accesso pieno o «vedi tutte le sedi» non è toccato.

È il comportamento che quella guardia già voleva, e non un effetto collaterale da correggere; ma **non era mai stato osservabile**. Gli ordini creati prima del 13/08 restano senza sede, quindi visibili a tutti.
| `supplier_orders.destination_location_id` | legacy verificato, nessun percorso di scrittura — vedi §9 |

---

## §2 — La proposta del numero

_Deciso 11 agosto 2026. Non ancora in codice: oggi la proposta è `lastAssignedNumber + 1`._

### La regola

> Sia **m** il numero più alto fra i documenti dello stesso contatore con **data strettamente anteriore** a quella del documento che sto creando.
> Si propone il **primo numero libero maggiore di m**.

Una sola formulazione, nessun ramo separato. Il riempimento dei buchi non è un caso speciale: è questa stessa regola vista da un'altra angolazione.

**Attenzione a "anteriore".** Data _strettamente_ anteriore, non "uguale o anteriore". La differenza non è formale: sull'esempio qui sotto la lettura sbagliata propone 5 dove la regola propone 3. Nella prima stesura era scritto "precede in data" ed è stato letto male da chi ha analizzato il documento — quindi si scrive **anteriore**.

### Perché non basta "l'ultimo più uno"

Ultimo preventivo: **10**. Ne prepari uno datato la settimana prossima e gli dai il **15**. Oggi ne apri un altro.

Con `max+1` la proposta è **16**: il documento futuro ti ha bruciato cinque numeri, e da lì tutta la numerazione corrente parte da dopo di lui.

Con la regola nuova la proposta è **11**: i documenti datati avanti non spostano la proposta di oggi.

### I casi, per esteso

Stato di partenza: documento **2** del 05/06/2026, documento **4** del 05/06/2026. Il **3** è il buco.

| Creo il…   | Documenti con data anteriore                        | m   | Proposta                 |
| ---------- | --------------------------------------------------- | --- | ------------------------ |
| 05/06/2026 | né il 2 né il 4 (stessa data) → solo il documento 1 | 1   | **3** — il buco si tappa |
| 06/06/2026 | 2 e 4                                               | 4   | **5** — il buco resta    |

Il 05/06 il buco si tappa perché il 4 è dello stesso giorno: nessuna progressione si rompe. Il 06/06 no, perché il 3 risulterebbe più recente del 4, che è del giorno prima.

Aggiungendo un documento **15 datato 12/06/2026**:

| Creo il…   | m   | Proposta                                                 |
| ---------- | --- | -------------------------------------------------------- |
| 06/06/2026 | 4   | **5**, poi 6, 7… — i buchi si riempiono in progressione  |
| 12/06/2026 | 4   | **5** e a seguire, fino a esaurire lo spazio sotto il 15 |

Il 15 fa da tetto finché non ci si arriva con la data.

**Proprietà importante:** i buchi si riempiono solo con documenti la cui data è compatibile con i numeri che li circondano. Il riempimento **non può quindi generare un'anomalia cronologica**. La regola è costruita apposta per essere compatibile col §4.

### Serie già fuori ordine

_Deciso 11 agosto 2026._

Il §4 è avviso e non blocco, quindi una serie può contenere un documento fuori posto. In quel caso **m è il numero più alto fra i documenti con data anteriore**, non l'ultimo per data.

Esempio: documento **9** del 1 agosto, documento **5** del 10 agosto (numero forzato a mano). Creo oggi, 11 agosto.

Partendo dall'ultimo per data (il 5) si proporrebbe il 6 — che nasce già in violazione contro il 9. Partendo dal numero più alto (il 9) si propone **10**, che è coerente.

Vale la seconda: **si parte sempre dal numero più alto fra i precedenti**, mai dall'ultimo per data.

### Caso terminale: numeri esauriti sotto un documento datato avanti

_Deciso 11 agosto 2026._

Esiste il 10 del 1 agosto e il 15 del 18 agosto. Oggi, 11 agosto, si creano documenti: 11, 12, 13, 14. Al quinto il primo libero maggiore di 14 è il **16**, perché il 15 è occupato. Si ottiene il 16 datato oggi contro il 15 datato fra una settimana: l'anomalia del §4.

**La proposta scavalca e prosegue.** Non si ferma, non chiede.

Il motivo: l'anomalia non l'ha creata il sistema, l'ha creata l'operatore nel momento in cui ha assegnato il 15 con data futura. Da quel momento la serie contiene un documento fuori posto, e tutti i numeri creati oggi si collocheranno necessariamente attorno a esso. Il sistema ha solo continuato a numerare per data, che è quello che gli è stato chiesto.

Il §4 non ha quindi bisogno di eccezioni: l'avviso segnala uno stato che esiste davvero, e la responsabilità è di chi l'ha creato. Che compaia al quinto documento anziché al primo è solo il momento in cui la conseguenza diventa visibile.

**Superata** l'ipotesi di fermare la proposta con un messaggio tipo «nessun numero libero prima del 15 del 18/08»: bloccherebbe l'operatore per una scelta legittima presa da lui.

### La proposta dipende dalla data

Conseguenza diretta: **cambiando la data in testata il numero si ricalcola.** Oggi il campo numero non si muove.

### L'elenco dei buchi

Il ramo ha aggiunto alla scheda del numeratore il conteggio dei buchi e l'elenco dei primi dieci. La funzione si tiene, con una condizione: **deve distinguere i buchi ancora riempibili da quelli chiusi.** Un elenco che li mette insieme fa perdere tempo su numeri che la regola non permette più di usare a quella data.

### Numero editabile

Il numero è sempre modificabile a mano. Serve a chi migra da un altro gestionale a metà anno e deve allineare la numerazione.

### Duplicazione di un documento

_Deciso 11 agosto 2026._

Un documento duplicato **riceve un numero nuovo**, non quello del documento d'origine. Il numero proposto segue la regola sopra, calcolata sulla data del duplicato.

Non è una scelta di comodo: il vincolo unique rende il numero d'origine impossibile da riusare, e un duplicato che nasce con lo stesso numero fallirebbe al salvataggio o produrrebbe il conflitto del §3 su un'azione che non lo merita.

Vale per tutte le serie e tutti i tipi documento.

### Duplicare un documento dà il numero successivo, mai lo stesso

_Deciso 13 agosto 2026. Verificato in codice: già così in tutte e sei le maschere che duplicano._

«Duplica documento» apre una maschera **nuova** precompilata col contenuto dell'originale — nessuna copia nasce a monte, il documento si crea al salvataggio. Il numero **non** si eredita: il campo si azzera, la data diventa oggi e riparte la proposta. Il duplicato prende quindi il primo libero **calcolato sulla data del duplicato**, non su quella dell'originale (§2).

È l'unico comportamento possibile col vincolo unico del §3, ma va scritto lo stesso perché è anche l'unico che si vuole: si duplica per non ridigitare venti righe, non per riemettere lo stesso documento.

**Implementazione** (`applyDuplicatePrefill` / `applyDuplicateFromDocument`): `documentNumber: null`, data odierna, riproposta dei contatori. Sono sei copie dello stesso gesto, e su un punto **divergono**: cinque azzerano anche la serie, la Registrazione fattura fornitore tiene quella dell'originale. Quando non esiste un contatore predefinito la riproposta non sovrascrive nulla, e la differenza si vede. **Da decidere quale sia quella giusta** — cioè se duplicare un documento di serie A debba dare un altro documento di serie A.

### Niente duplicati, niente "bis"

_Deciso 11 agosto 2026._

Il vincolo unique resta, i duplicati non sono ammessi.

Danea permette il "bis" (15, poi 15 bis) per correggere una doppia fattura senza rinumerare le successive. **Non lo adottiamo.** È un rimedio nato dal cartaceo: con la fattura elettronica la correzione passa dalla **nota di credito**, che è lo strumento previsto dalla legge e lascia traccia di cos'è successo.

Il numero resta un **intero**: proposta aritmetica, ordinamento numerico.

Conseguenza accettata: un eventuale import da Danea di fatture col bis non potrà mantenere quei numeri. Problema di migrazione dati, da affrontare se e quando l'import esisterà.

### La colonna «prossimo numero» dei Numeratori

_Deciso 11 agosto 2026._

`document-counters.service.ts:433` calcola quella colonna in una schermata di configurazione, dove una data del documento non esiste e non può esistere.

**Mostra il primo libero a partire da oggi**, così coincide con quello che l'operatore vedrà aprendo un documento in quel momento. Con `max+1` direbbe un numero diverso da quello che compare in testata due secondi dopo.

---

## §3 — Conflitto al salvataggio

_Deciso 8 agosto 2026, riconfermato l'11 agosto dopo una modifica del ramo che va annullata._

### Quando compare

**Solo se l'operatore ha digitato il numero a mano** e quel numero risulta occupato al salvataggio.

Accettando la proposta non compare mai. Il ramo ha aggiunto `lockDocumentCounter` — advisory lock transazionale su `(tenant, tipo-numeratore, serie)`, applicato in tutti e otto i punti di assegnazione — e il frontend manda il numero al server solo se digitato (`numberIsProposal()` → `requestedNumber` assente). Due operatori che salvano insieme prendono due numeri diversi senza vedere niente.

**Questo restringe molto l'avviso** rispetto a come era stato pensato: non è più il meccanismo che risolve la concorrenza, è solo il caso del numero scelto a mano.

### Il caso concreto

Lavorate in tre. Vedi nella scheda che il **7** è un buco riempibile, apri il documento e scrivi 7. Nel frattempo un collega fa lo stesso e salva prima di te. Premi Salva: il 7 non c'è più.

### Comportamento

Avviso a **bottone singolo**. Comunica che il numero digitato è occupato e che è stato aggiornato. **Il campo Numero si aggiorna.** OK chiude e il controllo torna all'operatore.

**Il documento non si salva da solo.** L'operatore vede il numero nuovo e preme Salva.

Se anche quello nel frattempo è stato preso, riappare lo stesso avviso col numero ulteriormente aggiornato.

Esc e OK fanno la stessa cosa.

### Perché il campo si aggiorna

Il numero digitato è comunque perso: quel treno è passato. Lasciare il campo com'era costringe l'operatore a ridigitare una cosa che il sistema già sa — e lavorando in tre **non può nemmeno sapere quale sia il primo libero**. Riscrivere a mano introduce l'errore di digitazione e un secondo conflitto.

L'11 agosto alle 03:07 il ramo ha rovesciato questo comportamento — «Il numero in testata non è stato modificato: correggilo e premi di nuovo Salva» — con la motivazione che sostituire il numero d'ufficio butta via l'intento di chi voleva quel buco preciso. La motivazione è comprensibile, ma **il costo è più alto del beneficio**: l'intento è comunque irrealizzabile, e l'operatore resta senza l'informazione che gli serve.

**Il codice va riportato al comportamento dell'8 agosto.**

### Due cose del ramo che si tengono

Il messaggio deve **nominare il numero effettivamente digitato**, non `nextAvailable - 1`. Prima, su una serie arrivata a 43, chi digitava 7 si sentiva parlare del 43 — un numero mai visto. Correzione giusta.

Il numero assegnato dev'essere il primo libero **secondo la regola del §2**, cioè compatibile con la data del documento.

### Da propagare insieme alla regola

`buildDocumentNumberConflict` (`document-numbering.util.ts:204`) chiama `nextDocumentNumber`, la stessa funzione della proposta: cambiando la regola in un punto, il conflitto la segue. **Ma eredita anche la mancanza della data**, che va propagata nei suoi tre punti di chiamata — `documents.service.ts:1032`, `goods-receipt-workflow.ts:199`, `transfer-adjustment-workflow.ts:188`. Se lì la data non arriva, l'avviso nominerebbe un numero calcolato con una regola diversa da quella che ha appena rifiutato il salvataggio.

Il testo del messaggio va riscritto insieme alla regola: oggi dice «Il prossimo numero della serie è il 44», dove `nextAvailable` è massimo+1. Sotto la regola nuova quel campo contiene il primo libero secondo la data, e la frase direbbe una cosa che il campo non contiene più.

**Superato:** il modale a due bottoni «Usa Y / Annulla» (24 luglio); il modale a tre opzioni con «Salva con numero duplicato» e l'evidenziazione arancione dei duplicati (`numerazione-documenti-verifica.md`); il campo non aggiornato (ramo, 11 agosto 03:07).

---

## §4 — Controllo cronologico

_Deciso l'11 agosto 2026. **Riscritto il 13 agosto**, dopo aver misurato che la prima versione arrivava sempre in ritardo di un gesto._

**Il fatto controllato:** dentro lo stesso contatore, a numero più alto deve corrispondere data uguale o successiva.

**Stessa data, nessuna anomalia mai.** Nella giornata l'ordine dei numeri non significa niente: creare, saltare, tornare indietro è tutto libero.

### La decisione che cambia tutto: si guarda il documento in salvataggio

Il controllo prende in ingresso **il numero e la data che l'operatore ha in testata**, e cerca chi li smentisce:

- un documento con **numero più basso e data successiva** — il caso di tutti i giorni;
- un documento con **numero più alto e data anteriore** — il simmetrico.

Al massimo due, uno per verso. Fra i candidati si sceglie il più lontano dall'ordine — la data più recente fra i numeri minori, la più antica fra i maggiori — perché è quello che rende evidente il salto.

#### Perché la prima versione era sbagliata, e non di poco

Interrogava **la serie intera** cercando chiunque fosse fuori posto. Siccome girava _prima_ di scrivere, nel momento che conta non vedeva niente: **l'anomalia la creava il salvataggio stesso**, e l'avviso compariva **al salvataggio successivo**, nominando un documento che l'operatore aveva già chiuso.

Misurato il 13/08 sul database vero, ed è la prova che ha deciso la riscrittura:

```
oggi 13/08, creo un documento datato 14/08     → n. 1, salvato
sempre oggi, ne creo un altro (data 13/08)     → la testata propone n. 2
   ⟵ QUI Danea avvisa.  Il nostro controllo dice: 0 anomalie
                                                salvato n. 2 del 13/08
DOPO il salvataggio il controllo dice: 1 anomalia → n. 2, quello appena creato
```

Da qui discende anche la «persistenza» che la prima stesura dichiarava voluta: **non era una scelta**. L'avviso continuava a comparire perché denunciava un disordine che nessuno gli aveva segnalato al momento giusto, e che l'operatore non poteva sistemare dal dialogo. Un allarme che si ripete a ogni salvataggio e non è azionabile viene spento — è il modo in cui un avviso smette di essere letto.

#### La forma del messaggio

Nomina **tre cose**, e le tre insieme sono il punto:

> Stai assegnando il **numero 2** con data **13/08/2026**, ma esiste già **PRE-0001 del 14/08/2026**: un numero più basso con una data successiva, quindi numeri e date non sarebbero in ordine.

Prima diceva «un documento di questa serie porta un numero più alto di uno con data successiva»: vero, astratto, e riferito a un documento che l'operatore non stava toccando. La forma viene da Danea, che su questo ha ragione — «È incorretto assegnare il nr. 2 e la data 13/8/26 al documento perché esiste già "Prev. 1 del 15/8/26" e quindi numeri e date non sono in corretta progressione».

I bottoni restano **«Sì, salva comunque»** e **«No, torna al documento»**, ma il **predefinito è il No**: su un allarme, l'opzione che non scrive deve costare meno di quella che scrive. (Il fuoco iniziale era già sul No — il `<dialog>` nativo prende il primo elemento raggiungibile — ma il colore diceva il contrario.)

### Quando scatta: solo al Salva

**L'avviso compare esclusivamente alla pressione di Salva. Mai durante la compilazione**: nessuna segnalazione accanto ai campi, nessun indicatore che si accende digitando, nessun controllo al cambio data o al cambio numero.

La ragione è la natura della cosa: **se quell'avviso compare, qualcosa è andato storto e va sistemato a mano**. Non è un suggerimento mentre si lavora — è un allarme a cose fatte. Un allarme che si accende mentre l'operatore sta ancora scegliendo i valori diventa rumore, e il rumore si impara a ignorare.

### Il disordine già presente non si segnala

Il controllo guarda il documento in mano, quindi il disordine lasciato ieri **non compare più al salvataggio**. È voluto: chi apre un documento oggi non deve essere fermato da un errore che non ha commesso e che da lì non può correggere.

Dove si vede, allora? **Nel riepilogo dei documenti**, che c'è già: numero e data stanno uno accanto all'altro, ordinabili. Non si costruisce una seconda superficie di segnalazione per dire una cosa che l'elenco dice da sé.

### Casella «non mostrare più»

Spegne l'avviso **solo per il tipo documento in cui è comparsa**: chi sistema le fatture non resta cieco sui DDT. Una volta spenta resta spenta — nessuna riaccensione, nessun pannello nelle Impostazioni — e l'unico rimedio a una spunta presa per sbaglio è il database.

**Il senso però è cambiato, e va detto a chi la incontra.** Prima zittiva un rumore continuo: un avviso che tornava a ogni salvataggio parlando di documenti vecchi. Ora zittisce **un allarme sul documento che hai in mano**, che compare solo quando quel documento nasce fuori ordine. Spegnerla oggi costa di più di quanto costasse ieri, e chi lo fa dovrebbe saperlo.

**Si applica a tutti i tipi documento**, non solo ai fiscali. Non decidiamo noi a monte dove serve: lo decide l'operatore spegnendolo dove non gli interessa.

### Forma della preferenza

`UserDocumentChronologyWarningPreference`, chiavata su `(tenantId, userId, documentType)` — copiata da `UserDocumentPriceModePreference`, che è esattamente l'identità che serve. Migration `20260813160000_avviso_cronologico_preferenza`, applicata, con RLS e `REVOKE` nella stessa migration come vuole la regola di sicurezza.

Una scelta di forma: **l'esistenza della riga È la preferenza**, non c'è un booleano. Non esiste il caso «riacceso», quindi un booleano avrebbe un solo valore utile e un secondo stato da spiegare. `dismissed_at` resta per sapere _quando_.

### Quando nasce il disordine

Con la regola del §2 accesa **la proposta non genera anomalie riempiendo i buchi**. Ne restano **tre** sorgenti, e tutte e tre partono da un gesto dell'operatore:

1. **numero forzato a mano** in testata;
2. **data cambiata** su un documento già salvato;
3. **il caso terminale del §2** — i numeri liberi sotto un documento datato avanti si esauriscono e la proposta deve scavalcare.

Nel terzo caso **l'avviso deve comparire, ed è corretto**: l'anomalia l'ha creata chi ha datato il documento al futuro, il sistema ha solo proseguito a numerare per data.

_Nota: la prima stesura diceva «l'anomalia può nascere solo in due modi, perché la proposta automatica è corretta per costruzione». Era impreciso in due punti — i modi sono tre, e la proposta non crea anomalie ma può renderne visibile una già introdotta._

### Stato al 13/08/2026

**Fatto: il rilevamento**, in `document-chronology.util.ts`. Due sotto-query in `UNION ALL`, una per verso, ciascuna con `ORDER BY` e `LIMIT 1`: si cercano gli estremi, non si scorre la partizione.

Le prove sono di due nature, e la distinzione conta:

- **sei sulla regola**, con un tx finto che la esegue in JavaScript. Fissano la semantica, compresi i due casi che la riscrittura ha aggiunto: **«documento in ordine dentro una serie disordinata: nessun avviso»** — che è esattamente ciò che prima sbagliava — e **stessa data mai un conflitto**;
- **nove sulla forma della query**, che non la eseguono ma **leggono cosa chiede**: tabella, colonna data, colonna riferimento, normalizzazione della serie, esclusione del documento stesso in modifica, e i **quattro confronti stretti** (`number <`, `number >`, `>`, `<`). Sono nate da due difetti che nessuna prova poteva vedere — `reference` su `sales_orders`, che si chiama `order_number` e faceva rispondere 500; e `series = ''` invece di `series IS NULL`, per cui il controllo **non guardava mai la partizione senza serie**, la più usata di tutte.

⚠️ **Limite dichiarato:** nessuna delle due nature esegue l'SQL. Un `<=` messo per errore non lo prende né l'una né l'altra. Serve un Postgres di prova — è la «strada C» del §0 e la voce 12 di `GUARDIE-MANCANTI.md`.

**Fatto: il percorso completo.** `DocumentChronologyService`, due rotte su `documents` (`GET /documents/chronology`, `POST /documents/chronology/dismiss`), lo store `DocumentChronologyWarningStore` in `domain/`, il dialogo `app-document-chronology-warning-dialog` — che **non è un dialogo nuovo**: è `app-confirm-dialog` con dentro la casella, perché il comportamento modale non si riscrive una seconda volta. Il testo dell'avviso è una **funzione pura** (`chronologyWarningMessage`), come già per il conflitto sul numero: una frase che l'operatore legge in un momento difficile si prova senza montare un componente.

Due scelte di robustezza, entrambe nel verso giusto in cui sbagliare: se il **controllo** non risponde si salva lo stesso — un avviso mancato è meno grave di un documento perduto — e se lo **spegnimento** fallisce l'avviso ricompare, perché uno spegnimento che non si riaccende non va concesso per un errore di rete.

**Se la maschera non ha un numero in testata, non chiama.** Senza una coppia (numero, data) non c'è niente da verificare: si salva, e il numero lo assegna il server.

**Collegate tutte e sette**: Arrivo merce, Ordine cliente, Ordine fornitore, Trasferimento, Rettifica, Fatture, Registrazione fattura.

**Una guardia, non venti righe per sette.** Le prime venti righe scritte sull'Arrivo merce sono state estratte in `DocumentChronologyGuard` (`domain/documents/state/`) prima di replicarle: è la stessa forma che ha già prodotto tre divergenze silenziose in quest'area. Alla maschera restano **tre innesti**: `chronology.run(…)` al posto della chiamata di salvataggio, `chronology.confirm()` sul «Sì, salva comunque», e il dialogo in coda al template.

**Dove si innesta, maschera per maschera** — è l'unica cosa che cambia, e non si indovina:

| Maschera                            | Punto                              | Perché lì                                                                                                                                               |
| ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrivo merce                        | `requestSaveDocument`              | punto unico                                                                                                                                             |
| Ordine cliente                      | `saveDocument`                     | **sei** percorsi ci confluiscono (testata, dialogo disponibilità, copertura ordini): più a monte andrebbe replicato sei volte, e una si dimenticherebbe |
| Ordine fornitore                    | `submit`                           | pulsante, dialogo di uscita e conclusione ordine passano tutti di qui                                                                                   |
| Registrazione fattura               | `save`                             | pulsante e dialogo di uscita                                                                                                                            |
| Trasferimento · Rettifica · Fatture | `saveDraft` **e** `confirmAndSave` | due percorsi distinti: modifica di un documento confermato, e creazione con conferma                                                                    |

**Sull'ordine dei due dialoghi**, dove tre maschere differiscono e la differenza è voluta: Trasferimento, Rettifica e Fatture hanno già una conferma dell'operazione (regola delle azioni sensibili). Il controllo cronologico sta **dopo** quella conferma, non prima: sono due domande diverse — una chiede se muovere la merce, l'altro segnala com'è messa la numerazione — e invertirle farebbe rispondere «sì» due volte prima di aver deciso la cosa principale.

---

## §5 — Quale numerazione ha ciascun documento

_Lista definita da Luigi l'11 agosto 2026._

### Categoria A — Data interna, Numero interno, Serie interna

| Documento                | Note                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Preventivi               |                                                                                                                    |
| Ordine cliente (interno) | Solo `source = manual`. Gli ordini dai canali portano il numero del canale, vedi §8                                |
| Fattura proforma         | Oggi si chiama «Proforma», da rinominare                                                                           |
| DDT di vendita           | Da valutare il nome, vedi §10                                                                                      |
| Fattura                  | Con tutta la famiglia di sottotipi: accompagnatoria, d'acconto, nota di credito. **Un solo progressivo condiviso** |
| Ordini fornitore         |                                                                                                                    |
| Scarico manuale giacenze |                                                                                                                    |
| Trasferimenti interni    | Numerazione propria. Il DDT eventualmente generato ha la sua                                                       |

### Categoria B — due blocchi distinti

Documenti che arrivano dal fornitore: il numero contabile è quello del fornitore, il nostro serve a catalogare.

**Arrivi merce**

- Blocco _Documento fornitore_: Fornitore, **Tipo documento**, N. doc. fornitore, Data documento
- Blocco _Registrazione VestiFlow_: Data registrazione, Numero, Serie

Il **Tipo documento** è un elenco configurabile (DDT, fattura accompagnatoria, altro), perché la merce può arrivare accompagnata da documenti diversi. **Già implementato:** lo schema ha `ExternalDocumentType`, e il commento sull'enum dice esplicitamente che è un dato a parte, che compone la causale e non genera un tipo documento diverso.

**Registrazione fattura fornitore**

- Blocco _Documento fornitore_: Data documento, Numero documento fornitore
- Blocco _Registrazione VestiFlow_: Data interna, Numero, Serie

Qui il Tipo documento non serve: è già nel nome.

### Fuori da entrambe

**Corrispettivi.** Erano nella lista originale come Categoria A. **Escono con la decisione del §8**: diventano un registro, senza data-numero-serie propri.

**Ordini dai canali** (Shopify e altri): nessuna numerazione VestiFlow, portano quella del canale.

### Il numero interno si chiama "Numero", non "Protocollo"

_Deciso 11 agosto 2026, su verifica normativa._

L'obbligo di numerazione progressiva delle fatture d'acquisto **non esiste più**: l'art. 13 del D.L. 119/2018 lo ha eliminato dall'art. 25 del DPR 633/1972, per adeguare la norma alla fatturazione elettronica. Le fatture elettroniche si registrano liberamente, senza progressione né ordine di ricezione, con l'unico vincolo di essere annotate prima della liquidazione periodica in cui si detrae l'IVA.

Il numero interno resta utile come collegamento fra registrazione contabile e documento archiviato, ma è comodità gestionale, non vincolo di legge. Non c'è ragione di introdurre una seconda parola per la stessa cosa.

La confusione col numero del fornitore si risolve con la separazione visiva dei due blocchi.

**Superato:** «Protocollo» come etichetta (24 luglio) — motivato da un obbligo che non esiste.

**Superata** anche la Categoria C (Scarico manuale, Trasferimenti, Rettifiche con numero non editabile e senza serie), proposta il 24 luglio e sciolta subito dopo.

### Quale data usa la numerazione

_Verificato sul ramo l'11 agosto._

`Document.documentDate` è documentata nello schema come «Data interna di registrazione (solo giorno)», ed è colonna diversa da `externalDocDate`, «Data del documento della controparte». **La numerazione interna segue sempre la data di registrazione**; la data del documento del fornitore non entra mai nella proposta.

| #   | Punto                                               | Data                                                                                                |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `documents.service.ts:2946`                         | `documentDate` — da propagare, il metodo privato non la riceve                                      |
| 2   | `goods-receipt-workflow.ts:439` (Arrivo merce)      | `documentDate` = data registrazione                                                                 |
| 3   | `goods-receipt-workflow.ts:965` (Fattura fornitore) | idem                                                                                                |
| 4   | `transfer-adjustment-workflow.ts:156`               | `documentDate` — da verificare in scope                                                             |
| 5   | `store-sales.service.ts:119` (vendita banco)        | `dto.documentDate ?? new Date()`                                                                    |
| 6   | `store-sales.service.ts:291` (reso)                 | `new Date()`                                                                                        |
| 7   | `manual-sales-orders.ts:274` (ordine cliente)       | **Aperto** — non c'è una data del documento in scope, va deciso quale campo di `SalesOrder` fa fede |
| 8   | `supplier-orders.service.ts:175`                    | `dto.orderDate ?? new Date()`                                                                       |

**Anteprima — tre punti, e mancava il campo.** `documents.service.ts:788`, `manual-sales-orders.ts:90`, `supplier-orders.ts:122`. `PreviewDocumentNumberQueryDto` portava `type`, `series`, `year` e **nessuna data**.

✅ **Fatto il 13/08, e non era teoria.** La divergenza si è vista dal vivo: su un documento datato indietro la testata mostrava `5` e il salvataggio assegnava `2`. Peggio del numero sbagliato era il seguito — la maschera si accorge dello scarto e mostra il messaggio «il numero è stato preso da un altro operatore», che accusa un collega inesistente.

La data ora viaggia su `AvailableCountersQueryDto` (`@IsISO8601`), attraversa controller → `available()` → `toView()` → `nextNumber()`, e **tutte e sette le maschere richiedono l'anteprima a ogni cambio data**. Prima ce l'aveva solo l'Arrivo merce, e serviva a ricaricare le serie, non a rinumerare.

Un'avvertenza per chi tocca la Registrazione fattura: lì le date sono due, e quella che numera è `documentDate` (la data della fattura del fornitore), non `registrationDate`. È il campo che il server passa a `resolveDocumentNumber`, quindi la sottoscrizione sta su quello. Che sia la scelta giusta è un'altra questione — vedi la voce in §10.

Nota: quel `year` nel DTO è un residuo dell'anno che il §1 dichiara uscito dal modello.

---

## §6 — Serie e testata

_Deciso 3 agosto 2026, verificato 11 agosto._

Testata: **Data, Serie, Numero**.

La serie si sceglie da una tendina, non si scrive. Contiene i contatori del tipo documento corrente, filtrati sulla sede: quelli con quella sede più quelli senza.

Default: il contatore marcato `isDefault`.

**Superato:** «ultima serie usata dall'operatore» come default (24 luglio e `numerazione-documenti-verifica.md`). Vince `isDefault`, che è configurato e non segue l'operatore.

Al cambio serie il numero si ricalcola sul contatore nuovo. Il riferimento si ricompone anche quando cambia la sola serie — già implementato sul ramo.

Icona ⚙ accanto al campo Serie: apre il popup dei numeratori filtrato, riusando il componente delle Impostazioni. Aggiorna la tendina **senza auto-selezionare**.

Su un documento già salvato tutta la testata resta modificabile: data, serie e numero. Anche verso una serie che non è più quella corrente.

### Due cose da chiudere

**`DocumentTypeSetting`** porta ancora `autoNumbering` e `defaultSeries` (default `'A'`). La logica di numerazione non li consulta — la serie viene da `defaultCounterSeries` — ma restano trasportati da impostazioni e DTO. Il 3 agosto era stato deciso di rimuoverli, perché creavano una seconda configurazione della serie che non parlava coi contatori. **Da tracciare fino al frontend prima di toglierli.**

**Arrivo merce in modifica** ignora il numero digitato e il cambio serie. Preesistente, ma contraddice la regola sopra. **Decisione di prodotto aperta**, non un bug da sistemare senza chiedere.

Le righe, perché la prossima verifica non debba ricercarle — e perché l'asimmetria sta nello **stesso file**, a cinquecento righe di distanza:

| Documento                       | Dove                                              | Cosa fa in aggiornamento                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrivo merce                    | `goods-receipt-workflow.service.ts:426`           | `let number = existing?.number ?? null` — se il numero c'è, l'intero blocco di assegnazione è saltato: `dto.number` non viene letto e la serie nuova si scrive **senza ricomporre il riferimento**, che resta con la serie vecchia |
| Registrazione fattura fornitore | `goods-receipt-workflow.service.ts:954-956`       | riassegna se `dto.number` cambia **o** se cambia la serie                                                                                                                                                                          |
| Trasferimento e Rettifica       | `transfer-adjustment-workflow.service.ts:143-146` | come la Registrazione fattura                                                                                                                                                                                                      |

Non è quindi «l'Arrivo merce contro la regola»: è **l'Arrivo merce contro le altre tre**, e la maggioranza sta con la regola del §6.

---

## §7 — La famiglia fattura

_Deciso 11 agosto 2026 sul modello Danea. Comportamenti per sottotipo in §10._

Un solo tipo documento, un solo contatore per serie. Il sottotipo si sceglie da un selettore all'apertura ed è un campo del documento.

Sottotipi: Fattura, Fattura accompagnatoria, Fattura d'acconto, Nota di credito.

**Numerazione continua per tutti**, differenziati nell'elenco da una colonna che dice cosa sono. Il sottotipo non entra nella partizione: resta `(tenant, tipo, serie)`.

**Fattura proforma resta fuori.** Non è nell'elenco di Danea e non deve esserci: se consumasse la numerazione delle fatture bucherebbe il registro fiscale.

**Autofattura esclusa** in attesa di chiarimento: è l'unica dei cinque che non è un documento attivo, e in diversi casi vuole un registro separato.

**Stato:** `invoice_accompanying` è già nell'enum e `document-type.util.ts:35` la mappa già sul numeratore della fattura. Nota di credito e Fattura d'acconto vanno aggiunte all'enum — additivo. Vedi anche §9 sull'indice unico.

### ⛔ La Fattura accompagnatoria oggi non è utilizzabile

_Misurato il 13/08/2026 contro l'API e il database veri, non dedotto dal codice._

Questo paragrafo esiste perché tutto il resto del §7 fa credere che manchi solo il
selettore di sottotipo. Non è così: **la maschera c'è, ma un documento lì dentro non si
salva**, e non è una conseguenza del lavoro sulla numerazione — era già così.

Tre misure, stesso tenant, stessa sede, stessa riga:

| Prova                                   | Fattura                            | Fattura accompagnatoria                                              |
| --------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `GET /document-counters/available`      | 200, **1** contatore, propone n. 1 | 200, **0** contatori, nessuna proposta                               |
| `POST /documents` con una riga          | **201**, n. 1, `FT-0001`           | **422**                                                              |
| `POST /document-counters` per quel tipo | —                                  | **422** «Questo tipo documento non ha una numerazione configurabile» |

Quindi in testata il campo Numero resta vuoto e la Serie non è scegliibile — ma il fatto
che conta è il secondo: **non salva**.

**Il motivo del 422 sul documento non è stato letto**, ed è la prima cosa da guardare
quando si aprirà il lavoro: può essere la numerazione (il tipo è escluso dai contatori
configurabili e dal seed, mentre la scrittura risolve la serie rimappando il tipo) oppure
un requisito suo dell'accompagnatoria — trasporto, destinazione merce. Le due ipotesi
portano a correzioni diverse.

**Non si corregge qui.** La famiglia fattura è lavoro dopo il merge, su un ramo suo, con i
comportamenti per sottotipo ancora da decidere (§10). Questa nota serve a una cosa sola:
chi porta il ramo in `develop` deve sapere che porta anche una maschera ferma.

---

## §8 — Documenti senza operatore, e i Corrispettivi

_Deciso 11 agosto 2026._

### Ordini dai canali

Gli ordini importati da Shopify e dagli altri canali **portano il numero del canale**. `sales_orders.number` resta NULL per le origini non manuali: il numero del canale è il loro identificativo e serve a riconciliare.

### Corrispettivi: registro, non documento

VestiFlow conosce già tutte le vendite, riga per riga, con aliquota e totale. Il totale giornaliero per sede, canale e aliquota è quindi **una query su dati che già esistono**. Creare un documento per contenerlo significa duplicare informazione e doverla tenere allineata.

Il corrispettivo come documento nasce in sistemi che i dati di vendita non li hanno — Danea infatti lo fa registrare a mano a fine giornata, dichiarando come motivo il fatto che potrebbero esistere scontrini battuti fuori dal gestionale.

**Il registro** aggrega le vendite per giorno, sede, canale e aliquota. Nessuna numerazione, nessuna serie, nessun contatore. Filtri per periodo, canale e aliquota, esportazione per il commercialista.

Le vendite in negozio ci finiscono automaticamente. Il «registra corrispettivi di fine giornata» di Danea non esiste.

**Correzioni:** il corrispettivo non si corregge, si corregge il documento da cui deriva. Il registro si riallinea da sé.

**Superate:** la separazione per serie fra cassa e canali; «precompila e conferma» a fine giornata; la chiusura di periodo.

### Niente registrazione manuale

Valutata e scartata l'11 agosto. Il motivo non è il codice — sarebbe poca cosa — ma il fatto che offrirebbe **due strade per lo stesso risultato**: battere le vendite (che scaricano il magazzino e alimentano il registro) oppure digitare il totale a fine giornata (che il magazzino non lo tocca). La seconda è più veloce, quindi verrebbe scelta, e dopo tre giorni di guasto la giacenza è sbagliata senza che nessuno capisca perché.

I casi che sembravano richiederla sono già coperti: il **registro di emergenza** dalla vendita al banco (sotto), il **fatturato pregresso** dall'import iniziale.

Se dopo mesi di uso reale emerge un caso scoperto, si aggiunge — ma una scorciatoia che sbaglia il magazzino, una volta presa dagli operatori, non si toglie più.

### Il registro di emergenza

Quando l'RT si guasta o manca la rete, l'esercente deve segnalare il «fuori servizio» dal portale dell'Agenzia e annotare **ogni singola operazione** con data e ora, corrispettivo e aliquota, prima che il cliente esca dal negozio. Il registro può essere cartaceo **o tenuto con modalità informatiche**.

Ogni vendita al banco è già un'operazione con data, importo e aliquota. Registrando anche **l'ora** e sapendo stampare quell'elenco, **VestiFlow è il registro di emergenza**, senza che nessuno digiti nulla.

Servono due cose piccole e additive: **l'ora sulla vendita al banco** e un marcatore **«RT fuori servizio»** su giornata e sede, con una stampa filtrata su quei giorni.

### Base normativa

Il corrispettivo in VestiFlow **non è un documento fiscale**. Dal 1° gennaio 2020 il registro dei corrispettivi non è più obbligatorio: l'art. 2 comma 1 del D.Lgs. 127/2015 stabilisce che l'invio telematico dall'RT entro 12 giorni sostituisce gli obblighi di registrazione dell'art. 24 del decreto IVA. Solo le categorie esonerate dall'invio telematico usano ancora il registro in alternativa.

L'adempimento sta nel registratore telematico. Il registro serve a VestiFlow e al commercialista per controlli e quadrature. **La numerazione del corrispettivo non ha quindi vincoli di legge**, ed è ciò che rende possibile la decisione sopra.

### Cosa cade, e cosa va deciso prima

Il corrispettivo non è solo righe: esiste già `corrispettivo-register.service.ts` con elenco paginato, filtri, stato, `invoiceIssued`, `excludedFromSummary`, `exclusionReason`, righe analitiche con snapshot IVA, e lato frontend `corrispettivi-register.component.ts`. Fra schema, servizi, DTO, mapper e componenti sono **21 file** che nominano l'entità, più tre migration.

Cadono `corrispettivo_entries` e `corrispettivo_entry_lines`, e con loro **tre informazioni che le vendite non hanno**:

- lo **stato di verifica**
- la **motivazione** dell'esclusione dal riepilogo
- la **data fiscale** modificabile, separata dalla data operativa

L'esclusione in sé si ricostruisce (è la vendita fatturata, vedi §10). Le altre due no: sono decisioni prese da un operatore, non deducibili da nessun dato.

**Vanno decise prima di scrivere il prompt**, non durante.

### Il vecchio motore

Vendita online e Corrispettivo usano `DocumentSequence`: contatore autonomo, serie `'A'` scritta nel codice, anno nella partizione, riferimento `COR-2026-0001`. Tabelle proprie (`online_sales`, `corrispettivo_entries`) col vincolo `(tenant, serie, anno, numero)`.

Il lavoro non è «unificarlo sullo schema nuovo» ma **togliere al corrispettivo la numerazione che ha**.

`feature/cassa` ha già scritto codice sul corrispettivo con una sequenza condivisa fra cassa e online. **Quella scelta è superata da questa decisione** e va comunicata al collega prima che si lavori nella direzione vecchia.

---

## §9 — Residui e correzioni tecniche

_Verificati 11 agosto 2026._

### Fattura e Fattura accompagnatoria — bug corretto, non «già a posto»

Una stesura precedente diceva che condividevano già un solo progressivo e non c'era nulla da fare. Vero nella logica di proposta, **falso nel database**: l'indice unico stava sul tipo grezzo, quindi una Fattura 42 e una Accompagnatoria 42 potevano coesistere — il contrario della decisione. Il ramo l'ha trovato e corretto: l'indice è passato al numeratore, e le letture della partizione usano ora `documentNumberingTypes` al plurale, o il massimo vedrebbe metà dei documenti. Migration già applicata.

La correzione **rende vera** la decisione di condividere il progressivo, non la cambia.

### ⛔ Il difetto che il merge reintroduce, e che nessun test richiama

_Verificato il 13/08/2026 leggendo entrambi i rami. **Questa è la voce da non perdere.**_

Quella migration ha chiuso il difetto per due tipi. Ne sta arrivando un terzo, e all'unione il difetto **torna** — senza che niente lo segnali.

**Da una parte**, il ramo `feature/fattura-elettronica` aggiunge `credit_note` all'enum (`20260807020000_credit_note_document_type`). Il commento della sua migration dice testualmente: «Condivide il numeratore con le fatture (`documentNumberingType`, come l'accompagnatoria)». E il suo `document-type.util.ts` lo fa davvero:

```ts
return type === DocumentType.invoice_accompanying || type === DocumentType.credit_note
  ? DocumentType.invoice_draft
  : type;
```

**Dall'altra**, l'indice unico di questo ramo è un indice di **espressione**, e il suo `CASE` conosce un solo tipo:

```sql
CASE WHEN "type" = 'invoice_accompanying'::"DocumentType"
       THEN 'invoice_draft'::"DocumentType"
     ELSE "type" END
```

**Dopo il merge**, la Nota di credito condivide il numeratore **nel codice** ma non **nel database**: una Fattura 7 e una Nota di credito 7 potranno coesistere. È esattamente il difetto che questa migration è stata scritta per chiudere, reintrodotto dall'unione dei due lavori — e su documenti fiscali, dove due numeri uguali nello stesso registro non sono un fastidio.

**Serve una terza migration al momento di unire**, che ricostruisca l'indice col `credit_note` dentro il `CASE`, dopo aver verificato che nel database non esistano già collisioni. La migration originale lo aveva scritto in anticipo, e vale la pena rileggerlo:

> «Se un domani un altro tipo dovesse condividere il numeratore, va aggiunto QUI oltre che in `documentNumberingType`: sono due facce dello stesso patto, e disallinearle è esattamente il difetto che questa migration chiude.»

**Perché è muto.** Nessun test lo prende: le suite girano su doppioni, l'indice vive nel database e nessuno verifica che il `CASE` e `documentNumberingType` dicano la stessa cosa. Nessun lint lo prende: sono due file diversi, in due linguaggi diversi, su due rami diversi. E il merge testuale **riesce** — i due file non si toccano. Il difetto compare solo quando qualcuno emette la settima Nota di credito.

La guardia che mancherebbe: un test che legga i tipi mappati da `documentNumberingType` e verifichi che siano gli stessi nominati nel `CASE` dell'indice. Richiede un Postgres vero (vedi `GUARDIE-MANCANTI.md`, voce 12) oppure un confronto sul testo della migration, che è meno solido ma costa poco.

### «È ancora una proposta?» — una classe di errore chiusa alla radice

_Fatto 13 agosto 2026._

Il campo Numero dice «proposta» finché il documento è nuovo e nessuno l'ha digitato: da quel «proposta» dipende se il numero **viaggia al salvataggio**. La domanda si risolveva ricalcolando su `valueChanges` — che però **non emette su `markAsDirty()`**. Chi scriveva il valore prima di marcarlo otteneva una ricalcolata a controllo ancora pristine, e il numero digitato restava a terra: si salvava con quello automatico, in silenzio.

La correzione non è stata «rimettere le due righe nell'ordine giusto», che era già stata fatta e **non aveva tenuto**: la trappola era ricomparsa da sola nei sette gestori dell'avviso di conflitto, scritti dopo. Ora `numberIsDirty` legge un signal costruito su `control.events`, che includono `PristineChangeEvent`, e `markAsDirty()` emette **dopo** aver marcato: qualunque ordine si riallinea da solo. La dipendenza non è corretta, non c'è più.

Stato prima: una maschera col meccanismo giusto (Registrazione fattura), una che se l'era costruito e **non l'aveva collegato a niente** (Ordine cliente), cinque col ricalcolo debole. Ora tutte e sette leggono lo stesso signal, e il contratto dello store lo pretende per iscritto.

### Arrivo merce: «già numerato» guarda l'esistenza, non il riferimento

_Deciso 13 agosto 2026._

Questa maschera dopo «Salva documento» **resta aperta** (§10.7), quindi un documento salvato continua a vivere sulla rotta di creazione — dove le altre non arrivano mai, perché se ne vanno al dettaglio. Serviva una condizione in più, e prima era `Boolean(loadedDocument()?.reference)`. Ora è `persistedDocumentId() !== null`: la stessa cosa che le altre dicono con `isEditMode()`, detta per una maschera che non se ne va.

**La sola rotta non basta, ed è misurato.** Con `isEditMode()` da solo la prova `dopo il salvataggio il numero assegnato non torna a essere una proposta` fallisce: salvato col 46, la prima riproposta dei contatori riporta il campo al 42 di prima, e l'operatore trascrive un numero che non è del suo documento. La prova resta come guardia.

### Due difetti trovati simulando l'operatore, non leggendo il codice

_13/08/2026. Entrambi introdotti o resi visibili dal lavoro dello stesso giorno, entrambi corretti subito._

**Il campo Sede della Fattura non veniva salvato.** Era stato aggiunto in testata a Proforma, Fattura e Accompagnatoria, ma nel corpo del salvataggio `locationId` viaggiava **solo dentro il ramo della Fattura accompagnatoria**, dove serviva allo scarico. Sulle altre due l'operatore sceglieva la sede, la vedeva scritta, salvava — e non arrivava da nessuna parte.

**Al cambio sede la serie selezionata restava indietro.** Con un numero già digitato, `applyProposal` usciva subito per non sovrascrivere la scelta dell'operatore, e non toccava nemmeno la serie: la tendina si aggiornava, il valore selezionato no, e il documento si salvava sotto una serie che in quella sede non esiste. La regola ora è **il numero digitato resta, la serie sparita cede** — un numero è una scelta, una serie non più disponibile è un residuo. Con l'elenco vuoto (richiesta fallita o in volo) non si tocca niente.

### Cinque difetti che solo l'applicazione vera ha mostrato

_13/08/2026. Nessuno dei cinque era visibile dai test: le suite erano verdi prima e dopo._

Le prime tre si sono viste conducendo l'applicazione come un operatore; le ultime due
riprovando **dopo** le correzioni, che è il motivo per cui si riprova.

**1. Numero già preso → 500 invece di 409.** Il riconoscimento del conflitto leggeva i
nomi delle colonne dal `meta.target` di Prisma. Ma l'indice unico è di **espressione**
(dall'11/08 la serie assente partecipa come stringa vuota), e su quelli Prisma non sa
dire le colonne: manda `['tenant_id,']`, un troncone. L'operatore vedeva «errore
imprevisto» invece dell'avviso che nomina il numero. Ora si riconosce dal **modello**
(`Document`, `SalesOrder`, `SupplierOrder`), che c'è sempre — e l'inventario di
`pg_indexes` dice che su quelle tre tabelle nessun altro vincolo unico può scattare
salvando un documento. Verificato dal vivo: 409 con `{code, number, nextAvailable, series}`.

**2. La testata mostrava un numero che il salvataggio non avrebbe usato.** Misurato:
tendina 5, salvataggio 2. Vedi il §5 sopra: mancava la data sul DTO dei contatori, e sei
maschere su sette non richiedevano l'anteprima al cambio data.

**3. L'Ordine cliente chiedeva i contatori del Preventivo.** La maschera serve quattro
modalità; tre vivono nel registro `documents` e la quarta — l'Ordine cliente — in
`SalesOrder`, con un numeratore suo (`customer_order`). Il tipo si risolveva con una
ternaria il cui ramo finale era `Quote`, quindi l'Ordine cliente **cadeva nel ripiego**:
mostrava le serie del Preventivo in testata e controllava la cronologia sulla serie di un
altro tipo. Ora `numberingDocumentType` è separato da `registryDocumentType`.

**4. Il controllo cronologico rispondeva 500 sull'Ordine cliente.** La query in SQL
grezzo selezionava `reference`, colonna che su `sales_orders` non esiste — lì si chiama
`order_number`. Il commento sopra la query lo diceva già; la riga sotto non lo faceva.
Emerso solo perché la correzione 3 ha portato l'Ordine cliente a chiamare davvero quel
controllo.

**5. Il controllo cronologico non guardava mai i documenti senza serie.** La maschera
manda `series=''`, i documenti senza serie hanno `series IS NULL`, e il confronto era
`series = ''`: zero righe, sempre. Ed è la partizione **più usata di tutte**, perché è il
contatore predefinito. Ora la normalizzazione è in `serieCanonica`, accanto alla
numerazione. La stessa regola vive ancora **scritta a mano in dodici punti** dei servizi
di salvataggio (`(series ?? '').trim() || null`): lì non è sbagliata, e non l'ho toccata —
va deciso se accorparla.

**Cosa è stato riprovato dal vivo, a correzioni fatte** (database vero, API vera,
browser vero): il 409 col suo payload; testata e salvataggio che dicono lo stesso numero
su una data passata (2 e 2, mentre a oggi la testata dice 8 — la data cambia davvero la
proposta); i contatori dell'Ordine cliente distinti da quelli del Preventivo; il
controllo cronologico che risponde 200 su **tutti e sette** i tipi e trova il documento
fuori posto; il numero che si rifà al cambio data **nel browser**, su una maschera coi
campi non bloccati (21 → 5 passando dal 13/08 al 11/01); e l'avviso che **compare
davvero** al salvataggio, con dentro il documento fuori posto.

### Il §1-bis chiuso: cosa è cambiato

_13/08/2026._

Il predefinito si applica solo se compatibile con la sede; sedici punti di chiamata aggiornati, **anteprima compresa**. «Senza serie» viaggia, con la regola in un punto solo. E **l'avviso di conflitto calcola sulla partizione giusta**: risolveva la serie dal DTO grezzo, quindi con la testata che non ne sceglie una il documento veniva scritto sotto il predefinito mentre il «prossimo libero» si calcolava su «senza serie» — proponendo un numero destinato a un **secondo** conflitto. La guardia esisteva già in tre servizi gemelli.

**Un cambio di comportamento dichiarato:** prima la serie proposta viaggiava anche non toccata, perché la proposta la scriveva nel campo e il campo partiva. Ora no, e un test dell'Ordine fornitore che fissava il vecchio comportamento è stato riscritto sulla regola.

### Residui

**`nextDocumentNumber`** in `document-totals.util.ts:17` non ha chiamanti. Rimovibile.

**Rimossi il 13 agosto**, residui della migrazione allo store del giorno prima: `imposeDocumentNumber` / `proposeDocumentNumber` e il signal `documentNumberImposed` nell'Arrivo merce (nessun chiamante: il badge «proposta» dipendeva quindi dal solo «non ancora salvato», e non si spegneva quando l'operatore digitava il numero), più due copie morte di `refreshNumberProposal` — una nell'Arrivo merce, una nella Registrazione fattura.

**`DocumentSequence`** è agganciata al backup in cinque punti: due elenchi in `tenant-backup.constants.ts`, il ramo di export, e nell'import un `deleteMany` seguito da `createMany`.

Il vincolo vero non è il codice: **i pacchetti di backup già prodotti contengono un `documentSequences.json`**, formato dichiarato alla versione 1. Se si rimuove la tabella, l'import deve continuare a tollerare quel file negli archivi vecchi — altrimenti un ripristino si rompe in silenzio, che è il modo peggiore in cui un backup smette di essere un backup. **Il backup va sistemato prima della rimozione.**

**Aperti dal commit dell'11 agosto:** la scheda numeratori fa tre query per contatore; il PDF dell'ordine fornitore non porta il documento della controparte.

---

## §10 — Fuori perimetro

Da decidere in sessione dedicata:

- **Comportamenti per sottotipo fattura**: la fattura d'acconto accende la generazione della fattura di saldo; l'accompagnatoria aggiunge i dati di destinazione merce; la nota di credito inverte il segno. Autofattura da chiarire.
- **Nota di credito**: segno sulla riga, direzione del movimento di magazzino (una nota su merce resa è un **carico**), collegamento alla fattura d'origine. Creazione da zero e generazione da fattura esistente devono produrre lo stesso risultato.
- **Le due informazioni che cadono col corrispettivo**: motivazione dell'esclusione e data fiscale separata (vedi §8).
- **Resi**: riga negativa nel giorno del reso o rettifica sull'originale.
- **Esclusione automatica** delle vendite fatturate dall'aggregazione, per non contare due volte lo stesso incasso.
- **Trasferimenti interni**: comando «Genera DDT» disponibile sempre, nessun automatismo, nessuna proposta legata al confronto fra indirizzi. Il trasferimento tiene la sua numerazione, il DDT la sua.
- **Tipi mancanti** dalla lista del §5: Rettifiche di giacenza, inventario, reso di negozio.
- **Rinomini**: Proforma → Fattura proforma; Vendita in negozio → Vendita al banco; come qualificare il DDT di vendita senza confonderlo con quello del fornitore, visto che negli Arrivi merce «DDT» indica il documento in arrivo.
- **Arrivo merce in modifica**: oggi ignora numero digitato e cambio serie (vedi §6).
- **Ordine cliente**: quale campo di `SalesOrder` fa da data per la numerazione (§5, punto 7).
- **Registrazione fattura: quale delle due date numera.** La maschera ne ha due — «Data fattura» (`documentDate`, la data che il fornitore ha messo sulla sua fattura) e «Data registrazione» (`registrationDate`, il giorno in cui la si registra). Oggi il numero lo decide la **prima**, e il §5 qui sopra dichiara invece che «la numerazione interna segue sempre la data di registrazione»: le due frasi non stanno insieme. Non è un difetto da correggere di slancio, perché la scelta ha conseguenze sul registro acquisti: numerare sulla data del fornitore significa che una fattura di marzo arrivata a maggio si infila in mezzo ai numeri di marzo, tappando un buco che a quel punto non c'è più. Da chiedere al commercialista prima di toccare.
- ~~**Generazione massiva («Genera da…»)**~~ — **esce dal perimetro, 13/08/2026.** Non «da fare più avanti»: non si fa. La copertura è **il filtro «non ancora fatturati» sull'elenco DDT** (che esiste già ed è da sistemare) più **l'inclusione documenti** che c'è già: da lì l'operatore vede cosa resta in sospeso e apre la fattura del cliente che sceglie.

  Il ragionamento, perché la decisione si regga da sola: il valore della generazione massiva non era creare venti fatture in un colpo, era **sapere cosa non è ancora stato fatturato**. Con la sola inclusione devi ricordarti tu chi ha DDT in sospeso, e un DDT dimenticato è merce consegnata mai fatturata. Ma quel valore lo dà il filtro, che non crea niente — e il «genera tutte» era esattamente la parte complicata.

  Non era un requisito nostro: veniva da Danea, ed è il tipo di funzione che si eredita senza chiedersi se serve.

  **Nota tecnica, non decisione** — se un giorno con un cliente che fattura a centinaia servisse davvero, il problema è già mappato: venti documenti creati nella stessa transazione **non si vedono l'un l'altro**, perché la regola del §2 calcola **m** leggendo il database e le righe non ancora scritte non ci sono. Chiamarla venti volte darebbe venti volte lo stesso numero. La via indicata sarebbe la sequenza in memoria — si tiene l'ultimo assegnato del giro e si riapplica la regola dei buchi sui numeri appena presi — perché il risultato **deve essere identico a creare venti documenti a mano**. Esclusa invece l'assegnazione a blocco contiguo: salterebbe i buchi che la regola vuole tappare, e farebbe valere **due regole diverse a seconda di come crei**.

- **Sede e catena documenti**: quando una fattura scarica giacenza ereditando da un DDT, la sede da cui si scarica dev'essere quella del documento d'origine, non una scelta libera — altrimenti si scarica da Milano merce uscita da Napoli. Da chiudere insieme alla colonna «scarica giacenza» in fattura (disattivata se il DDT a monte ha già scaricato).
- **Più partite IVA sotto un'unica gestione**: oggi un tenant = un soggetto fiscale (vedi §1-bis), quindi un cliente con due partite IVA ha due tenant e due abbonamenti. L'alternativa — un tenant con più soggetti — renderebbe la partita IVA un attributo della sede e obbligherebbe ogni documento fiscale a sapere a quale soggetto appartiene: numerazione, registri e cedente XML separati per soggetto. Non è una funzione, è una dimensione nuova del gestionale. Da valutare solo se emergono clienti reali che la richiedono.
- **Il riferimento usato come numero fiscale** — deciso il 13/08: il numero è il numero, senza prefisso né zeri, e `<Numero>` deve contenere `19`. Resta aperto come si scrive con una serie (`5/MI`?). Analisi e perimetro nel **§11**, decisione da prendere col ramo della fattura elettronica.
- **Registratore telematico**: un browser non parla con un dispositivo sulla rete locale. Due strade — chiamata diretta al servizio di rete dell'RT, o programma ponte sul computer del negozio. Va scelta anche la lista dei modelli supportati.

### Domande per il commercialista

1. Con RT guasto e registro di emergenza tenuto correttamente: la trasmissione tramite «dispositivo fuori servizio» resta dovuta o è esonerata? Le fonti divergono, e la sanzione è il 90% dell'imposta non trasmessa.
2. VestiFlow deve produrre un file caricabile sul portale, o basta la stampa del registro?
3. Le sedi secondarie vanno dichiarate all'Agenzia come luoghi di deposito? La merce in un deposito non dichiarato rientra nella presunzione di cessione.

---

## §11 — Il riferimento non è il numero

_Deciso il 13/08/2026 guardando una fattura elettronica vera. **Voce aperta: niente è stato implementato**, e la parte che riguarda lo SdI non si decide qui (vedi in fondo)._

### La decisione

**Il numero del documento è il numero: senza prefisso e senza zeri di riempimento.**

La prova non è un'opinione di stile, è il tracciato. In una fattura elettronica reale:

- `<Numero>` contiene **`19`** — non `FT-19`, non `FT-0019`;
- il tipo sta nel **suo** campo, `<TipoDocumento>TD01</TipoDocumento>`;
- e i riferimenti in riga si scrivono allo stesso modo: **«Rif. Doc. di trasporto 17/2026 del 31/07/2026»** — numero, anno, data, e il tipo **come parola**.

Il prefisso incollato al numero è quindi **ridondanza**: dice una cosa che il documento dichiara già altrove, in un campo fatto apposta.

### Cosa questo rende sbagliato, oggi

`document.reference` **intero** finisce dentro `<Numero>`:

```ts
// api/src/documents/document-xml.service.ts:101
number: document.reference ?? String(document.number ?? '');
// → api/src/documents/fatturapa-xml.util.ts:277  tag('Numero', input.number)
```

**Non è una preferenza di formato: è il numero fiscale sbagliato.** Il numero che il cliente legge sulla fattura e che l'Agenzia registra è `FT-0019` invece di `19`.

Lo stesso valore esce anche in `<ProgressivoInvio>` (1.1.2), nel nome file SdI, e nel `<NumeroDDT>` dei DDT agganciati (2.1.8). Sul ramo `feature/fattura-elettronica` esiste un test che mette il comportamento per iscritto — atteso `<Numero>FT-2026-A-00042</Numero>` — quindi **non è una svista di questo ramo**: è una scelta consolidata da correggere insieme.

### Cosa resta il riferimento

**Un'etichetta interna, e in quel ruolo va benissimo.** Elenchi, collegamenti fra documenti, ricerca libera, riga «Rif. …»: dove serve capire al volo di che documento si parla, `AM-0009` fa il suo lavoro meglio di `9`.

Quello che non deve succedere è che **venga usato come numero fiscale**. Sono due cose diverse — un'etichetta per gli occhi e un identificativo per il registro — e oggi sono la stessa stringa. Separarle è il lavoro.

### Decisione aperta: come si scrive il numero quando c'è una serie

La convenzione italiana visibile nella fattura è **`17/2026`**: numero e sezionale separati da barra. Danea scrive **`DDT 264/Web 2026`**. Con una serie `MI` sarebbe quindi **`5/MI`**, non `MI-0005`.

Da decidere: la barra, l'ordine dei due pezzi, e se l'anno entra nella forma o resta il metadato che il §1 ha già fatto uscire dalla numerazione.

### L'analisi, perché non vada ri-fatta

_Censimento del 13/08/2026: sei letture con altrettanti verificatori indipendenti. **Nessuna delle sei è stata confermata** — i verificatori hanno trovato omissioni vere in tutte — quindi quanto segue è l'unione delle due passate, ed è una mappa buona ma non esaustiva._

**Dove il riferimento esce dal sistema.** L'XML FatturaPA (i quattro punti sopra). Tre PDF: documento, ordine fornitore, ordine cliente — nome file **e** corpo. I CSV e le stampe elenco. L'export corrispettivi per il commercialista. Email non ne esistono nel progetto; verso Shopify e TikTok il riferimento **non viaggia**.

**I formatter sono due, non uno.**

| Dove                                     | Forma                   | Note                                                                                                                                                                                                  |
| ---------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document-totals.util.ts:38`             | `PREFISSO[-SERIE]-NNNN` | canonico, **dodici chiamanti tutti backend** — il frontend non compone mai questa forma                                                                                                               |
| `online-sale-fulfillment.service.ts:674` | `PREFISSO-ANNO-NNNN`    | privato, per Vendite online e Corrispettivi. Mette l'anno che il canonico non ha, **omette la serie che la stessa riga memorizza**, ha i prefissi come costanti di modulo, e usa il vecchio contatore |

Le due forme convivono nella stessa colonna «Documento» dei Movimenti.

**Che il frontend non lo componga mai è la notizia buona**: cambiare la forma è lavoro di backend, non di dodici maschere.

**Gli snapshot congelati** — dove il riferimento è saldato dentro un testo che nessuno riscriverà:

- `stock_movements.reason` — «Trasferimento TR-0009», «Annullamento …», «Vendita negozio …». Per arrivo merce, trasferimento e rettifica la frase si riscrive a ogni salvataggio; **per le vendite il movimento nasce una volta e non si tocca più**;
- `documents.external_ref` e `internal_comment` («Convertito da FT-0001»);
- `stock_reservations.external_order_ref` e le note degli eventi impegno;
- la riga **«Rif. Preventivo PRE-2026-0001 del …»**, persistita come descrizione di riga documento — e che **entra nell'XML**, perché nessuno filtra le righe di riferimento.

**Un vincolo duro:** `supplier_orders` ha `@@unique([tenantId, reference])`. Lì il riferimento **non è un'etichetta: è un'identità del database**, e cambiarne la forma tocca un indice unico.

**Non esiste archivio degli XML trasmessi, né una colonna col numero inviato.** L'XML si ricostruisce al volo a ogni download, dal `reference` corrente: nessun `sentAt`, nessun progressivo conservato, nessun canale di trasmissione nel codice — il file esce solo dal pulsante «Scarica XML». Conseguenza, che è deduzione e non fatto letto: se il formato cambia e i documenti vecchi tengono in colonna il valore vecchio, i loro XML restano coerenti; con un backfill cambierebbero anche a ritroso, e **non c'è codice che scelga fra le due**.

**Gli zeri di riempimento non reggono nessun ordinamento.** Nessun elenco ordina sul testo del riferimento: tutti per data, il registro corrispettivi per `number` (colonna intera). La colonna «Numero» delle tabelle documento non è nemmeno cliccabile. Unica eccezione in tutta l'API: `orderBy: { reference: 'asc' }` in `shopify-shop-change.service.ts:514`, la lista dei motivi che bloccano il cambio negozio — non una schermata di navigazione.

**E `CAR` è il prefisso configurato dell'Arrivo merce**, non il tipo di movimento: la somiglianza con «Carico» è casuale (Carico manuale ha `CM`, Carico iniziale `CI`, e generano movimenti `load` identici). Nella colonna «Documento» dei Movimenti c'è il riferimento memorizzato; nella causale, accanto, c'è una frase ricostruita da `number` + data che **il riferimento non lo guarda mai** — e in cui **la serie non compare mai**, quindi due arrivi n. 9 di serie diverse hanno causali identiche. Nota utile a chi decide: quella colonna «Documento» è **nascosta di default**; di norma l'operatore vede solo la causale, cioè già la forma «parola + numero».

### Chi decide, e dove

**Il `<Numero>` verso lo SdI è materia del ramo `feature/fattura-elettronica`**, che vive dentro `develop`. Va deciso **con il collega**, non qui: è lui che sta riscrivendo quel percorso, e il test che fissa il comportamento attuale è suo.

Da questa parte non è stato implementato niente, di proposito.

---

## Ordine di esecuzione

1. **§3 — riportare l'avviso di conflitto al comportamento dell'8 agosto** (campo che si aggiorna), tenendo le due migliorie del ramo. Piccolo e indipendente.
2. **§2 — proposta per data.** Dodici chiamate in sette file, più i tre punti del conflitto, il campo data sul DTO di anteprima, l'indice composito e la query in SQL puro.
3. **§4 — controllo cronologico** con avviso persistente. Dipende dal 2.
4. **§7 — famiglia fattura**, sottotipi. Additivo.
5. **Rimozione della numerazione dal Corrispettivo** — coordinare con `feature/cassa`, e decidere prima le due informazioni che cadono.
6. **Rimozione di `DocumentSequence`** — backup sistemato prima.

I punti 1, 2 e 3 non collidono con `bugfix/righe-documento` né con i rami del collega.
