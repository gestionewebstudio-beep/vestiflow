# VestiFlow — Registro dei difetti dell'integrazione Shopify

**Data:** 8 agosto 2026 · **aggiornato il 14 agosto 2026**
**Stato:** censimento chiuso, difetti verificati salvo dove indicato

**Aggiunta del 14/08/2026 — quattro voci di origine diversa dalle altre.** I punti **2.13, 2.14, 2.15 e 3.8** non vengono da una lettura del codice ma da **operazioni vere condotte sul negozio di prova**: quattro ordini creati, evasi, rimborsati, resi e annullati, con lettura del database e del payload Shopify a ogni passo. Dove un numero è riportato, è stato letto — non calcolato a mente.
**Uso:** elenco di lavorazione. Ogni voce è correggibile da sola, senza aspettare la riorganizzazione descritta nel documento di specifica.

---

## Come leggere questo documento

Ogni difetto riporta **cosa succede**, **come lo sappiamo** e **cosa deve fare invece**.

La colonna "come lo sappiamo" non è un formalismo. Durante l'analisi tre affermazioni sono risultate false dopo verifica: un topic dato per rifiutato che non era mai stato richiesto, una data interpretata come prova del funzionamento dei webhook quando aveva sette possibili scrittori, e un ordine annullato dichiarato «senza stato leggibile» quando il campo esisteva, era valorizzato e la schermata lo mostrava.

**Tutte e tre nascono dallo stesso gesto: leggere colonne vicine a quella che serviva e concludere.** Non cambia il metodo, lo conferma — si misura la cosa esatta, non una accanto. Per questo ogni voce dichiara la propria origine, e quelle non verificate sono marcate come tali invece di essere presentate al pari delle altre.

I difetti sono ordinati per gravità, non per area. La gravità tiene conto di tre cose: se il difetto distrugge dati, se è raggiungibile da un operatore normale, e se lascia una traccia quando accade.

**Un difetto silenzioso è più grave di un difetto rumoroso di pari effetto.** Diverse voci di questo elenco sono durate mesi non perché fossero complicate, ma perché nulla le segnalava.

---

## Livello 1 — Distruggono dati o sono già rotti in produzione

### 1.1 — Migration disallineata sugli ordini fornitore

**Cosa succede.** Nel database condiviso tre colonne di `supplier_order_lines` sono già `numeric(16,6)` e `numeric(7,4)`, per effetto di una migration del 07/08 alle 20:55. Il codice in produzione (`main@c4044d9`) dichiara quelle stesse colonne come `Int`. Chi tocca gli ordini fornitore in produzione prende un errore, e la causa non ha niente a che vedere con Shopify.

**Come lo sappiamo.** Verificato leggendo le colonne nel database e confrontandole con lo schema dichiarato su main.

**Cosa deve fare invece.** Allineare schema e migration. È esattamente la situazione che la regola di progetto sul database condiviso doveva impedire: **schema e migration viaggiano in coppia**, sempre. Sui prezzi di prodotti e varianti non c'è divergenza — main li dichiara già `Decimal(16,6)` — quindi il problema è circoscritto agli ordini fornitore.

**La direzione dell'allineamento conta.** Lo stato giusto è quello del database, non quello del codice: quei decimali sono la decisione di prodotto sulla precisione. Il codice va portato al database dichiarando `Decimal` con quelle precisioni, non il contrario. Vanno esclusi `prisma migrate dev` e `prisma db push`, che partono dal codice per riscrivere il database e riporterebbero le colonne a `Int`.

**Non è una modifica locale.** Il ramo corrente dichiara già le colonne come le vuole il database. La divergenza esiste solo su `main`, cioè su ciò che gira in produzione: chiudere il difetto significa **rilasciare**, su un database condiviso.

**Il rischio sui decimali è stato escluso.** `lineTotalMinor` è rimasto `Int` mentre il costo unitario è `Decimal`, e il timore era che un `Decimal` di Prisma finisse dentro un'espressione aritmetica comportandosi da oggetto senza che nessun tipo se ne accorgesse. **Non accade:** i calcoli avvengono a monte su numeri, le scritture passano da `Prisma.Decimal` con i valori già ridotti alla scala della colonna, il servizio PDF converte, e il mapper del frontend è coperto da un test che usa proprio un valore a quattro decimali. Restano due `findMany` senza `select` che caricano i decimali usando solo colonne intere: **rischio latente, non attivo.**

**Il rilascio non è un cherry-pick.** Il diff dello schema fra main e il ramo contiene due lavori indipendenti: i tre decimali e `channelMissingSince`, che appartiene ad altro con la sua migration. Pescare solo i decimali in mezzo a nove commit rischia di portare su main una colonna senza la sua migration — lo stato che la regola vieta.

**Decisione: si rilascia il ramo intero quando è pronto**, non si forza un rilascio adesso. La divergenza esiste ma il danno si manifesta solo se qualcuno tocca gli ordini fornitore in produzione, e in produzione ci sono solo dati di test. **Questa voce scende quindi dal livello 1**: resta da chiudere, ma non è più urgente.

**Urgenza.** Oggi. È l'unico difetto di questo elenco che rompe una funzione in produzione adesso.

> ### La regola sul ritorno indietro
>
> **Il codice torna indietro, il database no.** Prisma non ha migration di ritorno e questo progetto non ne ha nessuna: ripristinare un rilascio precedente significa sempre **codice vecchio su database nuovo**, mai lo stato di prima.
>
> Quindi il ripristino è una rete di sicurezza **solo finché le migration sono additive**. Una colonna aggiunta il client Prisma vecchio non la seleziona nemmeno — non sa che esiste — e il codice precedente continua a funzionare. Una colonna tolta o rinominata invece la seleziona, non la trova, e ogni lettura di quella tabella va in errore: a quel punto tornare indietro non è più possibile, e non c'è nessun avviso che lo dica prima.
>
> **La prima migration che toglie, rinomina o restringe va quindi fatta in due tempi**: nel primo rilascio si aggiunge la forma nuova e si rilascia il codice che sa usare entrambe; nel secondo, quando il ripristino al rilascio precedente non serve più, si toglie la vecchia.
>
> Non è teoria. È il motivo per cui `webhooks_active_count` è ancora nello schema, derivata e non più letta da nessuna schermata, invece di essere già stata eliminata: toglierla adesso significherebbe rompere il ramo della cassa, che la seleziona ancora, e togliere la possibilità di ripristinare un rilascio precedente.
>
> **Il ritorno indietro non fallisce all'avvio.** L'immagine parte con `prisma migrate deploy`, e quel comando non confronta il database con la cartella: elenca le migration presenti, applica quelle non ancora applicate, e riferisce. Con una cartella che ne contiene meno di quante il database ne ha registrate, applica zero ed esce pulito. La divergenza la segnala `migrate status`, che è un altro comando e non gira all'avvio.

---

### 1.2 — Il valore di VestiFlow viene rimbalzato su Shopify, con o senza operatore — **parzialmente chiuso**

**Cosa succede.** Il servizio non scrive mai sulle giacenze di VestiFlow: legge Shopify e, dove trova una differenza, ripubblica su Shopify il valore di VestiFlow. Il pulsante «Sincronizza giacenze da Shopify» promette una direzione ed esegue l'opposta.

**Il percorso continuo conta più del pulsante.** Lo stesso comportamento parte dal webhook `inventory_levels/update`, senza pulsante e senza operatore: **ogni rettifica fatta nell'admin di Shopify rientra e viene rimbalzata**. Una conferma sul bottone protegge il gesto raro e lascia intatto quello continuo.

**Correzione rispetto alla prima stesura.** La voce diceva «percorso di distruzione dati raggiungibile il primo giorno». È troppo largo, e per tre motivi verificati:

L'azzeramento è **una-tantum per riga**: dopo il primo push riuscito un cortocircuito blocca i successivi. _Conseguenza sul metodo: chi misurasse cliccando due volte e leggendo lo stesso numero concluderebbe che non succede niente. La misura va fatta al primo click su una riga vergine._

Lo scenario primo giorno **non è immediato**: l'import catalogo non crea righe di giacenza, e senza riga il push esce prima di chiamare Shopify. Le righe nascono da un movimento, da un impegno o dall'import CSV. La sequenza pericolosa è «importo, qualcosa crea le righe a zero, poi premo».

Il danno resta reale ma richiede quella condizione.

**Cosa deve fare invece.** Il comportamento in sé è la decisione «VestiFlow comanda sulle giacenze» (specifica §2.5). Non è un difetto da correggere: **è una regola da dichiarare all'operatore**, perché oggi nessuno sa che una rettifica fatta su Shopify verrà rimbalzata indietro.

**Cosa è stato fatto.** Le tre stringhe riscritte: il pulsante è ora «Riallinea le giacenze su Shopify» in entrambi i punti, e l'hint della sezione dichiara la regola invece di descrivere il contrario. Il messaggio d'esito nomina la direzione. Al posto di una conferma è stata messa una **nota permanente** nella sezione, che vale sia per il pulsante sia per ciò che accade da solo: le giacenze le comanda VestiFlow, e una rettifica fatta nell'admin di Shopify viene riportata al valore del gestionale.

_Perché nota e non dialogo: una conferma che compare solo quando qualcuno preme insegnerebbe che il comportamento accade su richiesta, mentre accade sempre._

**Cosa resta.** Il comportamento in sé — il rimbalzo automatico via webhook — non è un difetto ma la regola del §2.5 della specifica. Resta da chiudere il contatore «N nuove», strutturalmente zero perché il ramo che lo alimenta è codice morto: va tolto insieme al test che asserisce la stringa «2 nuove».

---

### 1.3 — «Disconnetti Shopify» cancellava per sede — **CHIUSO**

**Cosa succedeva.** Il pannello ha due pulsanti: «Disconnetti Shopify» e «Disconnetti e rimuovi dati» in rosso. La separazione era già disegnata in interfaccia — sospendere è una cosa, rimuovere un'altra — ma il comportamento non la rispettava: **entrambi cancellavano.**

I due percorsi non erano però la stessa operazione, e la differenza è sostanziale:

Il percorso **rosso** cancella **per variante Shopify**: tocca solo ciò che viene dal canale. È dichiarato, ha le sue spunte, e la conferma richiede di digitare il dominio.

Il percorso **non dichiarato** cancellava **per sede**, tramite `cleanupResidualShopifyLocations`, in quest'ordine: sessioni di conteggio inventario e loro righe a cascata; giacenze della sede per `locationId`, quindi **anche di articoli nati solo in VestiFlow**; movimenti in uscita e in entrata, condizione che include `targetLocationId` e quindi **anche i trasferimenti arrivati da magazzini locali**; ordini fornitore diretti a quella sede in stato diverso da confermato. Solo dopo decideva se eliminare o archiviare la sede.

**Il difetto che rendeva il danno silenzioso.** Il controllo di eliminabilità contava **tutti** gli ordini fornitore della sede, mentre la pulizia ne cancellava solo i non-confermati. Bastava quindi un solo ordine fornitore confermato perché la sede sopravvivesse — archiviata — dopo che conteggi, giacenze, movimenti e ordini chiusi erano già spariti. Nessun errore, nessun 500: l'operatore vedeva la sede ancora al suo posto e credeva che non fosse successo niente.

**Aggravante ora rimossa:** il percorso rosso eseguiva la pulizia delle sedi **due volte**, una dichiarata dentro la purga e una dentro `disconnect()`.

**Come lo sappiamo.** Lettura del codice con l'ordine delle operazioni verificato, poi confermato dal confronto fra i due endpoint: `DELETE /shopify/connection` per il primo, `POST /shopify/shop-change/purge` seguito dallo stesso `DELETE` per il rosso.

**Cosa è stato fatto.** Tolta la chiamata di pulizia dal percorso di «Disconnetti Shopify», lasciandola in quello rosso dove è dichiarata e confermata. Rimossa anche la dipendenza dal servizio di cambio negozio, che serviva solo a quella riga: reintrodurre il comportamento richiederebbe reintrodurre la dipendenza — è una guardia, non solo una correzione. Rimosso il metodo rimasto senza chiamanti. Aggiunto un test che verifica che `disconnect` revochi, cancelli le credenziali e scolleghi le sedi **conservandole**, senza toccare giacenze, movimenti, conteggi e ordini fornitore.

**Corretto insieme:** `shopifyBulkSyncBusy()` aggiunto alle condizioni di disabilitazione — era l'unico dei quattro bottoni della fila a non averla, quindi premibile mentre un import stava scrivendo. Icona di sincronizzazione spostata dentro il blocco condizionale: compare solo durante il caricamento, e sparisce il travestimento da pulsante innocuo.

**Verificato dopo la correzione — nessuna porta scoperta.** Tutte e quattro passano dallo stesso `DELETE /shopify/connection`: il pulsante del pannello, «Disconnetti senza rimuovere» (che chiama solo quello), «Disconnetti e collega» e «Collega nuovo negozio» (che vi aggiungono l'avvio dell'autenticazione). La purga è invocata da **un solo punto** in tutto il frontend, quello dietro la conferma con il dominio digitato. La correzione le ha quindi sanate tutte insieme, e la promessa di «Disconnetti senza rimuovere» è ora vera.

**Resta aperto:** la disconnessione **non chiama mai la cancellazione delle sottoscrizioni** su Shopify, che restano orfane. Sommato alla deduplica per uguaglianza esatta degli indirizzi (2.2), una riconnessione può accumulare sottoscrizioni invece di sostituirle.

---

### 1.4 — La vendita POS Shopify non decrementa la giacenza, e l'errore torna indietro

**Cosa succede.** Il percorso di evasione richiede un impegno preesistente, che gli ordini POS non creano mai. Il movimento di magazzino viene saltato. Poi la riconciliazione delle giacenze legge la quantità di VestiFlow — più alta del vero — e la ripubblica su Shopify, propagando l'errore al canale.

**Come lo sappiamo.** Analisi precedente, non richiusa. Aperto in attesa del confronto con il collega che sta costruendo la cassa.

**Cosa deve fare invece.** L'evasione deve produrre il movimento anche in assenza di impegno. Un ordine POS è una vendita già avvenuta: non c'è niente da impegnare, c'è solo da scaricare.

**Nota per l'indagine.** Il ciclo di riconciliazione descritto al punto 1.5 mostra il caso opposto (Shopify 2, VestiFlow 0). Va verificato se le due cose sono collegate o indipendenti — **non lo diamo per assunto**.

---

### 1.5 — Il ciclo di riconciliazione gira a vuoto da giorni

**Cosa succede.** Nei log di produzione la stessa riga si ripete decine di volte al giorno, e quattro volte nello stesso secondo alle 18:25 del 07/08:

> `Disallineamento Shopify: osservato 2, pubblicabile VestiFlow 0 (Giacenza 0, Impegnata 0). Ripubblicazione programmata.`

Il sistema rileva la differenza, programma la ripubblicazione dello zero, e alla passata successiva ritrova 2. Non si risolve mai. O la ripubblicazione fallisce in silenzio, o parte e non ha effetto.

**Come lo sappiamo.** Letto direttamente nei Deploy Logs di Railway, giornate del 07/08 e 08/08.

**Cosa deve fare invece.** Due cose distinte, entrambe necessarie:

Il ciclo deve avere un **limite di tentativi**. Dopo quelli si ferma, e la variante finisce in un elenco visibile dove qualcuno decide. Nessun processo automatico può riprovare all'infinito.

Va capito **perché** la ripubblicazione non ha effetto, perché finché non si sa non si può escludere che il difetto si ripresenti sotto altra forma.

**Effetto collaterale attuale:** consumo continuo di quota API verso Shopify per un'operazione che non produce nulla.

---

### 1.6 — Il database contiene tabelle che nessuna migration di questo ramo descrive, e lo script di allineamento le cancella

**Cosa succede.** Il database condiviso contiene otto tabelle della cassa — `cash_sessions`, `cash_session_movements`, `fiscal_devices`, `fiscal_receipts`, `pos_terminals`, `store_sale_payments` e le due di appoggio — più due colonne (`documents.cash_session_id`, `corrispettivo_entries.document_id`) e quattro enum, che su `feature/listini` non esistono né nello schema né fra le migration.

La conseguenza è operativa e immediata. La regola di progetto prescrive di generare l'SQL di una migration nuova con `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script`: quel comando confronta il **database vero** con lo schema del ramo, e tutto ciò che il ramo non conosce compare nello script come `DROP TABLE`. Chi lo salva e lo applica **cancella il lavoro della cassa e i suoi dati**, senza che niente lo avverta.

Non è un'ipotesi: eseguito l'08/08 per aggiungere quattro colonne a `shopify_connections`, lo script conteneva otto `DROP TABLE`, quattro `DROP TYPE`, due `DROP COLUMN` e diciotto vincoli rimossi. Le quattro `ADD COLUMN` che servivano erano quattro righe su centoventi.

**`prisma migrate status` non lo vede.** Risponde «Database schema is up to date!» e non segnala nulla. Chi lo usa come verifica prima di procedere — che è ciò per cui la regola lo indica — riceve un via libera che non ha guardato le tabelle.

**Come lo sappiamo.** Verificato: lo script generato dal comando, l'assenza delle tabelle fra le migration e nello schema del ramo, l'esito di `migrate status`. La migration che le descrive **esiste**, si chiama `20260806220000_sessioni_di_cassa` e vive su `origin/feature/cassa` (commit `8ece224`), che non è antenato di questo ramo. Dedotto, non misurato: poiché Prisma segnalerebbe una migration applicata e assente in locale, e non lo fa, quelle strutture sono probabilmente arrivate al database senza una registrazione in `_prisma_migrations`. Da misurare, da parte di chi ha un client funzionante: il contenuto di quella tabella.

**Cosa deve fare invece.** Le tabelle vanno portate in una migration registrata dal ramo che le possiede. Non è lavoro di questo ramo e non vanno toccate da qui in nessun modo.

**Finché non è sistemato:** nessuno script generato da `migrate diff` va applicato senza averlo letto riga per riga, e da uno script del genere si preleva **solo** il blocco che riguarda la propria modifica. La regola di progetto che indica quel comando come procedura standard è, oggi, una regola che consegna in mano un `DROP TABLE`.

**Il rilascio non c'entra, ed è stato verificato.** L'immagine di Railway avvia con `npx prisma migrate deploy && node dist/main.js` (`api/Dockerfile`, e `api/railway.toml` conferma che il builder è quel Dockerfile). `migrate deploy` esegue **solo** l'SQL delle migration non ancora applicate e non tocca nulla che una migration non descriva: nessun `db push`, nessun allineamento dello schema. **Le tabelle della cassa non corrono alcun rischio da un rilascio.**

Due proprietà buone emerse dalla stessa lettura: il `&&` rende il boot a rovina chiusa — se una migration fallisce l'applicazione non parte, quindi non esiste lo stato «database mezzo migrato con l'app che gira sopra» — e il client Prisma viene generato in fase di build dallo schema del ramo, coerente con le migration che quello stesso ramo porta.

**Urgenza.** Media, e circoscritta al banco di lavoro. Il danno si produce **solo** se qualcuno genera uno script con `migrate diff` e lo applica a mano. Il rilascio è fuori dal perimetro. Nessuno l'ha fatto.

---

### 1.7 — «Attiva aggiornamenti automatici» registra verso l'ambiente da cui parte, quindi da locale scrive `localhost` sul negozio vero

**Cosa succede.** La registrazione dei webhook usa `shopifyConfig.webhookUrl`, cioè l'indirizzo **dell'ambiente da cui parte la chiamata**, non quello del negozio. Su una macchina di sviluppo quel valore è `http://localhost:3000/api/v1/shopify/webhooks`, ereditato dal modello `.env.example` (vedi 2.2-bis).

Quindi premere **«Attiva aggiornamenti automatici» da un computer locale crea otto sottoscrizioni verso `localhost` sul negozio Shopify reale del cliente.** Non è un'ipotesi di laboratorio: è un pulsante nel pannello Impostazioni, raggiungibile adesso, con un click.

E siccome la deduplica confronta gli indirizzi per **uguaglianza esatta**, quelle otto non sostituiscono le sette buone: **si sommano**. Il negozio si ritrova con due gruppi, uno dei quali non consegnerà mai.

**Cosa produce, in ordine.** Shopify tenta la consegna verso `localhost`, fallisce, e conta i fallimenti: alla lunga rimuove le sottoscrizioni che non rispondono (vedi 2.4). Nel frattempo l'osservazione salvata da VestiFlow può registrare il gruppo sbagliato come «indirizzo di consegna» — e il database è condiviso, quindi quel valore lo legge anche l'ambiente pubblicato. Un gesto fatto su una macchina di sviluppo finisce nella verità che vede la produzione.

**Cosa NON produce**, per non gonfiare la voce: nessun dato di VestiFlow viene cancellato, e le sottoscrizioni buone restano al loro posto.

**Come lo sappiamo.** Verificato sul codice (`resyncWebhooks` passa `shopifyConfig.webhookUrl` a `registerWebhooksForTenant`) e sul valore reale della variabile nell'ambiente locale.

**Cosa deve fare invece.** Rifiutare la registrazione quando l'indirizzo configurato non è uno a cui Shopify possa consegnare — non HTTPS, oppure `localhost`, loopback, rete privata, `.local`. Il controllo va nel **percorso condiviso**, `registerWebhooksForTenant`, dove passano tutte e tre le strade: OAuth iniziale, interruttore, e l'azione di riparazione. Sulla strada dell'OAuth non deve interrompere la connessione ma **lasciare un avviso registrato**, che è anche il rimedio al «saltata in silenzio» del 2.2-bis.

Il criterio esclude ciò che non è un riferimento, non ciò che è insolito: chi sviluppa con ngrok o cloudflared ha un indirizzo pubblico in HTTPS e passa.

**Urgenza.** Alta e attiva. È il 2.2-bis raggiungibile con un click, adesso.

---

### 1.8 — Il ramo della cassa ha reso nullabili due colonne che questo ramo dichiara obbligatorie

**Non è un difetto Shopify.** Sta qui perché è della stessa famiglia — il database condiviso che si muove sotto un ramo — e perché fuori di qui andrebbe perso.

**Cosa succede.** Il 6 agosto la migration `20260806233000_corrispettivi_canale_cassa`, del ramo `feature/cassa`, ha applicato al database condiviso:

```sql
ALTER TABLE "corrispettivo_entries" ALTER COLUMN "online_sale_id" DROP NOT NULL;
ALTER TABLE "corrispettivo_entries" ALTER COLUMN "sales_order_id"  DROP NOT NULL;
```

È corretto dal suo punto di vista: uno scontrino di cassa non ha né una vendita online né un ordine cliente, quindi quelle due colonne devono poter essere vuote.

Ma `feature/listini` dichiara le stesse due colonne **obbligatorie** (`schema.prisma`, modello `CorrispettivoEntry`: `onlineSaleId String` e `salesOrderId String`, senza `?`) e legge quella tabella — due `findMany` e due `findFirst`. Quando il client Prisma riceve `null` su un campo che il suo schema dichiara non-nullabile **solleva un'eccezione**: non restituisce un dato sbagliato, fallisce la lettura. Basta **una sola riga** di cassa nel database perché quelle quattro letture smettano di funzionare.

È il difetto 1.1 rovesciato: là era `main` a essere indietro rispetto al database, qui è il database ad essere avanti rispetto a questo ramo.

**Come lo sappiamo.** Verificato: la migration sul ramo remoto, le due colonne nello schema locale, i quattro punti di lettura nel codice.

**E misurato sul database condiviso l'08/08:**

```
SELECT count(*) FROM corrispettivo_entries WHERE online_sale_id IS NULL OR sales_order_id IS NULL
→ 1     (su 2 righe totali)
```

**La riga esiste già. Il difetto è attivo, non potenziale.**

**Il percorso più esposto è l'elenco dei corrispettivi.** `CorrispettivoRegisterService.list()` fa `findMany` con `include: { onlineSale: … }`: non è solo un campo obbligatorio che riceve `null`, è una **relazione obbligatoria** che non può essere risolta perché la chiave esterna è vuota. L'ordinamento è per data fiscale decrescente, quindi una riga di cassa recente sta in prima pagina. Stessa esposizione per `getDetail()`. `count()` invece non materializza le righe e continua a funzionare — il che rende il guasto ancora più confondente: il totale si legge, l'elenco no.

**Non misurato:** a quale tenant appartiene quella riga. Se è di un tenant diverso da quello che si sta guardando, il filtro su `tenantId` la esclude e l'elenco funziona lo stesso — ma è una fortuna, non una protezione.

**Cosa deve fare invece.** All'unione dei rami le due colonne vanno dichiarate opzionali anche qui, e i quattro punti di lettura devono reggere il `null` — è lo stato giusto, perché è quello del database e riflette una decisione di prodotto reale (i corrispettivi della cassa). Fino ad allora, sapere che quel percorso può fallire.

**La lezione generale, che vale oltre questo caso.** Il rischio di tenere due rami separati a lungo **non cresce con i commit**: il codice su un ramo è inerte. Cresce **a ogni migration che qualcuno applica al database comune**. Cinque delle sei migration della cassa sono `CREATE TABLE` e non danno fastidio a nessuno; l'unica che rilassa un vincolo è anche l'unica che fa danno. È la stessa regola del ritorno indietro vista dall'altro lato: **finché le migration sono additive due rami convivono; la prima che toglie o restringe li rompe a vicenda.**

**Urgenza.** Alta e **attiva**: la riga esiste. Non rompe la produzione, perché `main` non ha questo schema — rompe **questo ramo**, cioè lo sviluppo in corso e ciò che verrà rilasciato.

---

## Livello 2 — Silenzi: il difetto esiste e niente lo dice

Questa sezione è la ragione per cui l'analisi di oggi è stata necessaria. Tutti i difetti che seguono possono durare per sempre, perché il sistema non ha modo di accorgersene né di dirlo.

### 2.1 — Aggiungere un topic al codice non lo attiva, e nessuno se ne accorge

**Cosa succede.** `orders/cancelled` è stato aggiunto alla lista dei topic il 13 luglio. Le registrazioni sui due negozi sono del 18 e 30 giugno, quando il codice ne conosceva sette. La registrazione avviene **solo** al ritorno dall'autenticazione OAuth o premendo il pulsante, mai da sola. Quindi da luglio quel topic è nel codice e non su Shopify.

Il database salva un **numero** (`webhooksActiveCount = 7`), non l'elenco. Nessuna riga confronta quel numero con la lunghezza della lista attesa. Sette è indistinguibile da «tutto attivo», sia nel database sia nella schermata.

**Come lo sappiamo.** Verificato sulla storia del file dei topic (commit del 16/06 con 5, del 17/06 con 7, del 13/07 con 8) e sull'elenco reale interrogando l'API di Shopify. **Correzione di un'affermazione precedente:** non è mai stato un rifiuto di Shopify, era una registrazione mai eseguita.

**Cosa deve fare invece.** Il pannello confronta i topic registrati con quelli attesi e segnala la differenza, con il nome di quelli mancanti. Salvare l'**elenco**, non il conteggio.

**Provvedimento immediato.** Rieseguire la registrazione sui due negozi per attivare `orders/cancelled`.

**Aggiornamento del 14/08/2026 — la spia ora funziona, e il topic manca ancora.** Premendo «Verifica ora» il log riporta `Webhook mancanti su test-vestiflow.myshopify.com: orders/cancelled` (`shopify-webhook-status.service.ts:91`). È il confronto che questo punto chiedeva: non più «7», ma il nome. Il provvedimento resta da eseguire, e **va eseguito dall'ambiente pubblicato**: in locale `SHOPIFY_APP_URL=http://localhost:3000`, e registrare da lì creerebbe sottoscrizioni verso `localhost` che si sommano alle buone (punto 2.2-bis). Il codice lo impedisce già con un rifiuto esplicito (`shopify-oauth.service.ts:415`).

**E il buco sembra meno largo di quanto il nome suggerisca** — ma la conclusione poggia su una deduzione, e va marcata.

_Letto:_ i tre topic degli ordini finiscono nella stessa funzione (`shopify-sync.service.ts:44-47`), e l'annullamento non si riconosce dal topic ma da `cancelled_at` dentro il payload (`:367`). _Provato:_ l'annullamento di `#1007` è arrivato ed è stato trattato correttamente (specifica `08` §3) **pur senza la sottoscrizione mancante**.

⚠️ _Dedotto:_ che sia arrivato tramite `orders/updated`, e più in generale che Shopify emetta quel topic a ogni annullamento. **Non è stato verificato quale consegna abbia prodotto quel risultato** — poteva essere anche una sincronizzazione manuale eseguita nella stessa sessione di prova. Finché non lo si guarda nei Network Logs di Shopify, «funzione coperta» resta un'aspettativa ragionevole e non un fatto: se fosse sbagliata, gli annullamenti arriverebbero solo quando qualcuno preme un pulsante. La registrazione del topic mancante resta quindi da fare, e la fretta con cui farla dipende da questa verifica.

---

### 2.2 — L'indirizzo dei webhook non è memorizzato

**Cosa succede.** La registrazione confronta i webhook esistenti **per indirizzo**, e anche la cancellazione lavora per indirizzo. Ma l'indirizzo usato non viene salvato da nessuna parte: nel modello della connessione ci sono la data e il conteggio, non la destinazione.

Due conseguenze. La prima: VestiFlow non sa a chi ha detto di consegnare, e per scoprirlo bisogna interrogare Shopify a mano — che è come l'abbiamo scoperto noi. La seconda: se l'indirizzo cambia, VestiFlow non vede più i vecchi webhook, quindi non li cancella e ne registra un secondo gruppo. Nessuno se ne accorge.

**Come lo sappiamo.** Codice del client Shopify. L'ipotesi peggiore — registrazioni verso `localhost` — è stata **esclusa**: tutti e quattordici puntano a `https://vestiflow-production.up.railway.app/api/v1/shopify/webhooks`, nessun duplicato, nessun residuo. Il rischio è reale nel disegno ma non si è ancora materializzato.

**Cosa deve fare invece.** Salvare l'indirizzo con la connessione e mostrarlo nel pannello.

---

### 2.2-bis — Il modello distribuisce un indirizzo irraggiungibile, e non esiste modo di aggiungere un topic

**Cosa succede.** Due difetti che si aggravano a vicenda, entrambi sulla registrazione dei webhook.

**Il modello è sbagliato alla sorgente.** `api/.env.example` distribuisce `SHOPIFY_APP_URL=http://localhost:3000`. Chiunque prepari un ambiente dal modello eredita l'indirizzo verso cui Shopify non può consegnare, e la validazione non impone né forma né schema. Non è un problema di una macchina: è la sorgente.

Sommato alla deduplica per uguaglianza esatta (2.2): una registrazione eseguita da un ambiente col valore ereditato **non riconoscerebbe nessuna delle sottoscrizioni esistenti** e ne aggiungerebbe altre verso `localhost`, che si sommano invece di sostituire.

**Non esiste un modo di aggiungere un topic — nella UI.** L'unico percorso è l'interruttore a due stati. Con gli aggiornamenti automatici accesi l'etichetta è «Disattiva», e premerlo **cancella tutte le sottoscrizioni senza alcuna conferma**. Per ri-registrare bisogna spegnere e riaccendere: una finestra a zero webhook, e se il secondo passo fallisce si resta senza.

_Correzione alla prima stesura, che riduce la stima._ **L'operazione additiva esiste già nell'API**: `POST /shopify/sync/webhooks` salta i topic presenti, aggiunge solo i mancanti e non cancella niente. Ciò che manca non è l'operazione — è che sia raggiungibile: quel percorso sta dietro l'etichetta «Attiva», che sparisce appena gli aggiornamenti automatici sono accesi. Non c'è da costruire, c'è da **esporre**.

_Seconda correzione, sulla parola._ Lo stato «disattivato» non viene scritto _prima_ della cancellazione in senso cronologico: viene scritto **dopo che la chiamata è tornata, ma prima che il suo esito venga guardato, e comunque indipendentemente da esso**. Il danno e il rimedio non cambiano; la parola esatta sì.

**E l'esito, se è un fallimento, non lascia traccia da nessuna delle due parti.** È la conseguenza peggiore della riga qui sopra, e nasce dall'incontro con il 2.5. Se le cancellazioni falliscono e VestiFlow scrive comunque «disattivato»: Shopify continua a consegnare; `process()` esce subito per il cancello sugli aggiornamenti automatici; il controller risponde **200**. Quindi Shopify registra una consegna riuscita — non conta un fallimento, non riprova, non rimuove mai la sottoscrizione — e VestiFlow butta l'evento senza scrivere niente. Da una parte risulta consegnato, dall'altra risulta spento, e l'evento è perso per sempre. **È l'unico difetto dell'elenco che non lascia traccia da nessun lato**, quindi l'unico che nessuna delle due piattaforme può aiutare a scoprire.

**La registrazione post-autenticazione viene saltata in silenzio** se l'indirizzo non è configurato. Un negozio può risultare connesso con zero webhook e nessuna traccia.

**E la lettura delle sottoscrizioni esistenti tronca a cinquanta.** Sia la registrazione sia la cancellazione chiedono a Shopify `/webhooks.json` **senza `limit`**, e il valore predefinito è 50. Con quattordici sottoscrizioni oggi non fa danno. Ma è esattamente nello scenario descritto qui sopra — le orfane che si accumulano perché si sommano invece di sostituirsi — che la deduplica smetterebbe di vedere quelle oltre la cinquantesima e la cancellazione ne lascerebbe indietro: **si romperebbe nel momento in cui servirebbe di più**, e in silenzio. Il client di sola lettura introdotto per «Verifica ora» chiede già `limit=250`; **i due metodi esistenti restano da correggere**, quando si tocca quel percorso.

**Come lo sappiamo.** Lettura del codice e del file modello. Verificato l'08/08 riga per riga: `api/.env.example:29`, l'assenza di vincoli di forma sulla variabile in `env.validation.ts`, l'interruttore unico in `shopify-integration-panel.component.ts`, l'`if (webhookUrl)` senza `else` in `shopify-oauth.service.ts`, e l'ordine delle chiamate in `disableWebhooks`.

**Cosa deve fare invece.** Correggere il modello e validare l'indirizzo (schema obbligatorio, no localhost in produzione). **Esporre** l'operazione additiva che già esiste, separandola dall'interruttore, così che «aggiungi i topic mancanti» sia raggiungibile anche ad aggiornamenti accesi. Scrivere lo stato **dopo** aver guardato l'esito, e non scriverlo affatto se le cancellazioni non sono riuscite.

**La lettura diagnostica non deve poter scrivere.** «Verifica ora» — l'azione che chiede a Shopify l'elenco reale delle sottoscrizioni — va costruita su un metodo del client che **sa solo elencare**, senza accesso né alla registrazione né alla cancellazione. La regola «mai da locale» resta scritta, ma non deve essere l'unica protezione: se ciò che separa una diagnosi da una registrazione verso `localhost` è la memoria di chi preme, prima o poi cede.

**Nota operativa.** L'aggiunta di `orders/cancelled` sui due negozi collegati **non è una correzione di codice**: è un'azione su Shopify da eseguire dall'ambiente pubblicato chiamando direttamente l'endpoint di attivazione, che è additivo. Va fatta a parte, con la mano di chi la esegue.

---

### 2.3 — La spia verde dice «ho spedito», non «arriva qualcosa»

**Cosa succede.** «Aggiornamenti automatici attivi» significa che una registrazione è andata a buon fine una volta, mesi fa. Continuerà a dirlo per sempre, che gli eventi arrivino o no.

È lo stesso difetto del verde di sincronizzazione sui prodotti: conferma la partenza, non l'arrivo.

**Come lo sappiamo.** Dimostrato oggi in modo indipendente dal merito: un evento del mattino non è arrivato e il pannello non ha cambiato colore.

**Cosa deve fare invece.** «Attivi» deve significare **è arrivato qualcosa di recente**. Basta registrare e mostrare la data dell'ultimo evento ricevuto. È l'unica cosa che distingue «non è cambiato niente» da «non arriva più niente» — la distinzione che oggi non esiste ed è il motivo per cui il difetto è potuto durare.

---

### 2.4 — Quattro silenzi che rispondono errore

**Cosa succede.** Un webhook può essere scartato per corpo grezzo mancante, intestazioni mancanti, firma non valida o negozio non risolto. In tutti e quattro i casi VestiFlow non scrive niente e non registra niente, perché il filtro degli errori registra solo dai 500 in su.

Lasciano però traccia presso Shopify, che li conta come consegne fallite e alla lunga rimuove la sottoscrizione.

**Come lo sappiamo.** Lettura del codice più prove dal vivo: bussando con firma errata risponde l'applicazione con 401, non un proxy. Le quattordici sottoscrizioni sono vive da giugno, quindi **nessuno di questi quattro può essere stato lo stato permanente**.

**Cosa deve fare invece.** Registrare ogni webhook rifiutato con il motivo, e mostrarne il conteggio nel pannello. Un rifiuto è un fatto, non un non-evento.

---

### 2.5 — Due silenzi che rispondono «ricevuto» e possono durare per sempre

**Cosa succede.** Due casi rispondono correttamente a Shopify e non fanno niente: **aggiornamenti automatici disattivati**, e **topic fuori dallo switch**. Nessuna traccia da nessuna parte, né in VestiFlow né presso Shopify, che considera la consegna riuscita.

Il primo dei due si combina con il 2.2-bis nel modo peggiore: se lo stato «disattivato» è stato scritto mentre le cancellazioni fallivano, le sottoscrizioni sono vive e consegnano, e questo silenzio le assorbe tutte rispondendo 200. Vedi 2.2-bis per la catena completa.

Nel secondo caso cadono i webhook obbligatori GDPR (`customers/data_request`, `customers/redact`, `shop/redact`) che Shopify invia di propria iniziativa: VestiFlow risponde «ricevuto» e non fa niente.

**Come lo sappiamo.** Lettura del codice.

**Cosa deve fare invece.** Un topic non gestito va registrato come tale, non ignorato in silenzio. Sui GDPR va deciso a parte cosa fare — sono un obbligo verso Shopify, non una funzione del gestionale.

---

### 2.6 — L'arricchimento fallito scrive un dato degradato che sembra un successo

**Cosa succede.** Se l'arricchimento fallisce dentro un webhook prodotto — token scaduto, un 429 di Shopify — l'import prosegue lo stesso e scrive il prodotto **senza costi, tag e metafield**. L'unica traccia è un avviso volatile.

Non è un errore: è una verità degradata nel database, indistinguibile da un successo.

**Come lo sappiamo.** Lettura del codice, trovato durante la diagnosi.

**Cosa deve fare invece.** Se l'arricchimento fallisce, **non si scrive un dato parziale**: si segnala e si lascia il record com'era. È la regola opposta a quella attuale, e vale anche altrove — un dato incompleto scritto sopra un dato buono è peggio di un aggiornamento mancato.

Sui costi il problema si chiude da sé applicando la regola di proprietà descritta nella specifica (Shopify non tocca il costo). Resta aperto su tag e metafield.

---

### 2.7 — Ogni sincronizzazione riuscita cancella la storia degli errori

**Cosa succede.** I campi d'errore vengono azzerati a ogni sincronizzazione riuscita. Non si accumulano: l'ultimo successo cancella tutto.

Conseguenza concreta: l'elenco dei topic falliti durante la registrazione finiva in un messaggio d'avviso, e quel messaggio oggi è vuoto su entrambi i negozi perché una sincronizzazione riuscita successiva l'ha azzerato. **Il difetto è sopravvissuto alla propria segnalazione.**

**Come lo sappiamo.** Lettura del codice e stato attuale del database.

**Cosa deve fare invece.** Gli errori si accumulano in un registro e si risolvono, non si cancellano perché nel frattempo è andata bene un'altra cosa. Un successo su un'operazione non dice niente sul fallimento di un'altra.

> **La tabella nuova non basta da sola, e questa parte va fatta insieme.** Il problema non è la capienza di un campo: è che `touchSync` azzera l'errore a ogni sincronizzazione riuscita, e le sincronizzazioni che lo chiamano sono sette, di operazioni diverse. **Un pull clienti andato bene cancella l'errore di un push prodotti fallito** — due cose che non hanno niente a che vedere fra loro. Se si costruisce il registro degli errori lasciando in piedi quell'azzeramento, la tabella nuova convive con un meccanismo che continua a cancellare le prove: si guadagna la capienza e si perde comunque la storia. Le due cose si tolgono nello stesso passo.

---

### 2.8 — Il messaggio vero di Shopify viene buttato e sostituito con uno falso

**Cosa succede.** Quando una registrazione fallisce, il messaggio restituito da Shopify viene raccolto e poi scartato ovunque: nei log finisce un testo preconfezionato, all'operatore arriva solo il nome del topic.

Quel testo preconfezionato incolpa il permesso «Protected customer data», che i dati mostrano essere concesso — gli altri quattro topic protetti sono registrati. Se ci fosse stato un fallimento vero, **il database ne avrebbe conservato una spiegazione falsa.**

**Come lo sappiamo.** Lettura del codice, confrontata con lo stato reale delle registrazioni.

**Cosa deve fare invece.** Conservare e mostrare il messaggio originale. Una diagnosi inventata è peggio di nessuna diagnosi, perché manda a cercare nel posto sbagliato.

---

### 2.9 — Non esiste nessuno scheduler: niente si ripara col tempo

**Cosa succede.** Nessun Cron, nessun processo periodico lato server. Ogni cosa rimasta indietro resta indietro finché un umano non preme qualcosa.

**Come lo sappiamo.** Verificato sul codice.

**Cosa deve fare invece.** Vedi la specifica: due compiti soli, coda in uscita con tentativi limitati e controllo periodico delle differenze in sola lettura.

---

### 2.10 — Tre cambiamenti di Shopify non arrivano mai

**Cosa succede.** Tre eventi non sono fra i topic gestiti e non generano nessun altro evento che li segnali:

`shop/update` — cambio di valuta, paese, mercato, o della spunta **«prezzi comprensivi d'imposta»**. Cambiare quella spunta non modifica alcun prodotto, quindi non fa scattare nemmeno `products/update`. È il caso già misurato: il mercato è passato da Stati Uniti a Italia, non si è mosso niente, e da quel momento ogni prezzo significava un'altra cosa.

**Le collezioni** — un tax override che porta un articolo dal 22% al 4% resta invisibile per sempre.

`app/uninstalled` — se il negoziante disinstalla l'app, VestiFlow non lo viene mai a sapere: la connessione resta «collegata» con la spia verde.

**Come lo sappiamo.** Elenco dei topic registrati, verificato su Shopify.

**Cosa deve fare invece.** I primi due sono la ragione per cui la configurazione fiscale va **riletta a ogni operazione** invece che memorizzata, e per cui il controllo periodico delle differenze serve davvero e non è un residuo. Il terzo va aggiunto ai topic: una connessione verso un'app disinstallata non deve mostrarsi verde.

---

### 2.11 — Il backend non passa da nessun controllo automatico, e un cancello sembra esserci

**Cosa succede.** Il codice di `api/` non viene controllato da niente, né al commit né al push.

`.husky/pre-commit` esegue solo `npx lint-staged`, e le quattro regole configurate coprono `src/**/*.{ts,html}`, `e2e/**/*.ts`, `playwright.config.ts` e `*.{json,md,scss,yaml,yml}`. **`api/**` non compare in nessuna** — è una scelta dichiarata in `regole-qualita`, rimandata di proposito finché i rami non si uniscono, per non fare una riformattazione di massa mentre due lavori vanno in parallelo.

`.husky/pre-push` esegue `npm run test:everything` e `npm run build`. I test dell'API ci sono. **Ma `npm run build` alla radice compila l'app Angular, non l'API**: il passo si chiama «build», passa, e non ha compilato la metà di codice che uno si aspetterebbe. Un errore di tipo in `api/src` attraversa entrambi i cancelli, salvo che rompa un test che importa proprio quel file — quindi un file che nessuna spec tocca non è verificato da niente.

È la stessa forma di quasi tutto questo elenco: **un cancello che sembra esserci e sta guardando altrove.**

**Come lo sappiamo.** Verificato l'08/08 leggendo la configurazione `lint-staged` in `package.json`, i due file in `.husky/`, e gli script di `api/package.json` (che `lint`, `build` e `test` propri li ha — semplicemente nessuno li chiama).

**Cosa deve fare invece.** Il `build` di pre-push deve compilare anche l'API, e `api/**` deve entrare in `lint-staged` — che è già deciso e rimandato all'unione dei rami, insieme alla riformattazione. **Le due cose si chiudono nello stesso momento**, perché è la stessa attesa.

**Nel frattempo** i controlli si eseguono a mano dopo ogni modifica al backend: `npm run lint`, `npm run build` e `npm run test` dentro `api/`, più `npm run lint` e `npm run test:everything` alla radice. **È una protezione che dipende da chi si ricorda di eseguirla**, quindi non è una soluzione: è un rimedio dichiarato, con la sua data di scadenza.

---

### 2.12 — Un errore viene nascosto apposta, e la condizione che lo giustifica non è legata a niente

**Cosa succede.** Nel DTO della connessione, `hideScopeDuplicate` sopprime `lastError` quando la diagnostica sugli ambiti sta già segnalando lo stesso problema di permessi. **Oggi è corretto**: è deduplicazione di un fatto mostrato due volte, non mascheramento di due fatti diversi — la distinzione che vale in tutta questa sezione.

Il difetto non è nel comportamento, è nella **dipendenza**. Quella soppressione è valida solo finché la diagnostica sugli ambiti continua a coprire quel caso. Se un domani cambia — un codice d'errore rinominato, la diagnostica ristrutturata, il messaggio spostato altrove — l'errore smette di comparire e **niente lo sostituisce**: sparisce, e nessuno ricollegherà le due cose, perché stanno in due punti che non si citano a vicenda.

È la forma latente dello stesso schema che ha prodotto il «7 su 8» muto: un'informazione la cui visibilità dipende da una condizione altrove.

**Come lo sappiamo.** Lettura del codice, `toDto` in `shopify-connection.service.ts`.

**Cosa deve fare invece.** Lasciarlo com'è — non c'è niente di rotto da correggere. Ma chi tocca la diagnostica sugli ambiti deve sapere che quel `lastError` dipende da lei. La correzione strutturale, quando si passerà di lì, è che la soppressione sia decisa **dalla presenza effettiva dell'altro messaggio**, non da un codice d'errore che si presume corrisponda.

---

### 2.13 — Il reso di un ordine non pagato lascia il corrispettivo come se l'incasso ci fosse stato

_Misurato il 14/08/2026 conducendo l'operazione vera su negozio, API e database._

**Cosa succede.** Ordine in sospeso (contrassegno, o comunque `financial_status: pending`), evaso, poi reso — il pacco rifiutato alla consegna. **La merce rientra correttamente**, ma il Corrispettivo generato all'evasione **resta `to_verify` col suo importo pieno**, la Vendita online non risulta rimborsata, e `requiresReview` non viene scritto. Nessuna traccia, da nessuna parte, che quella vendita non è avvenuta.

Il registro corrispettivi continua quindi a dichiarare un incasso che non è mai entrato — e in contrassegno **non entrerà mai**, perché il denaro non era stato preso.

**Come lo sappiamo.** Prova completa su `#1006`: creato in sospeso, evaso (nasce `VO-2026-0003` e `COR-2026-0004 · to_verify · 60,00 €`), poi reso elaborato con ricarica. Dopo: movimento `return/shopify` presente e giacenza tornata da −2 a −1 — **ma corrispettivo, vendita e `requiresReview` identici a prima.**

La causa è una riga sola: il ramo che rettifica il corrispettivo è `if (financial === refunded)` (`shopify-sync.service.ts`). Elaborando il reso di un ordine mai incassato, Shopify porta l'ordine a **`paid`** — totale zero, quindi pagato — e quella condizione non è mai vera. Verificato sul payload: `financial_status: paid`, `refunds[1]` con importo zero e `restock_type: return`.

**È il caso peggiore dei tre, ed è il più comune.** Sul rimborso di un ordine già pagato (`#1005`) lo stato diventa `refunded`, il ramo si accende e almeno una segnalazione resta. Qui no: **più il flusso è ordinario, meno traccia lascia.**

**Cosa deve fare invece.** La rettifica non può dipendere dallo stato del pagamento — e **nemmeno dal rientro della merce**, come era scritto qui prima: il rimborso senza ricarica (`no_restock`) non produce nessun movimento e va sottratto lo stesso, mentre l'annullamento con ricarica ne produce uno e non va sottratto. **Il fatto da seguire è il rimborso.** Ragionamento completo, con la tabella dei tre casi, in `08-specifica-resi-e-annullamenti-canale.md` §4.

E non va marcato uno stato sull'originale: il corrispettivo del giorno della vendita resta quello che fu, e il reso è una **riga negativa alla propria data**. Cade così anche la domanda su «quale stato assegnare»: l'enum non ha un valore per «vendita non avvenuta» e non gliene serve uno.

**Stato al 14/08: metà chiuso.** Il rimborso ora si **persiste** — importo, imposta e data, in `sales_order_refunds` (migration additiva `20260814120000_rimborsi_ordine_vendita`), letti da `refunds[].refund_line_items[]` che erano già nel payload e si buttavano. **Resta da fare la sottrazione nel registro derivato**, che tuttora somma i totali pieni e si limita a contare i resi.

---

### 2.14 — Il reso dichiarato ma non ancora elaborato non esiste per VestiFlow

_Misurato il 14/08/2026._

**Cosa succede.** Fra il momento in cui l'operatore dichiara un reso su Shopify e quello in cui lo elabora, **VestiFlow non sa niente**: nessun evento, nessuno stato, nessuna segnalazione. Continua a credere che la merce sia venduta e l'incasso acquisito. Su Shopify l'ordine porta il badge «Reso in corso» e il reso ha un identificativo suo (`#1006-R1`); in VestiFlow non esiste.

**Come lo sappiamo.** Creato il reso su `#1006` e riletto il database: eventi fermi all'evasione, corrispettivo, giacenza e `requiresReview` invariati. Coerente con i topic registrati — `orders/*`, `customers/*`, `products/*`, `inventory_levels/update`: **`returns/*` non c'è**, e un reso aperto non tocca né l'ordine né l'inventario, quindi non arriva nemmeno un `orders/updated`.

**Cosa deve fare invece.** Non è detto che serva iscriversi ai topic dei resi: il rientro della merce arriva comunque all'elaborazione, incartato in un rimborso (vedi 2.13). Ma la finestra va **dichiarata**, perché in quel periodo il gestionale mostra dati che chi guarda Shopify sa già essere superati. Se si decide di coprirla, i topic sono `returns/*` e vanno aggiunti a `SHOPIFY_WEBHOOK_TOPICS` — con la trappola del punto 2.1: aggiungerli al codice non li attiva.

---

### 2.15 — Il rimborso con ricarica scrive due messaggi che dicono il falso

_Misurato il 14/08/2026: i due messaggi sono stati letti nel database subito dopo l'operazione._

**Cosa succede.** Rimborsando un ordine con la ricarica attiva, VestiFlow scrive sul corrispettivo:

> «Rimborso comunicato dal canale dopo la Vendita online: predisporre la rettifica del corrispettivo. **La giacenza NON è stata modificata** (il rientro fisico richiede un evento di reso reale).»

La giacenza **è stata modificata**, 0,4 secondi dopo, proprio da quell'evento. `applyRefundAfterSaleTx` gira prima di `applyRestockAfterSaleTx` e afferma come fatto una cosa che smette di essere vera subito dopo, nella stessa sequenza.

Lo stesso vale per `reviewReason`, che chiede di «verificare … l'eventuale rientro fisico della merce» — rientro che il sistema ha già eseguito da solo.

**Come lo sappiamo.** Prova su `#1005`: rimborso con ricarica alle 11:42:22, movimento `return/shopify` alle 11:42:22, evento `online_order_restocked` alle 11:42:26, e nota del corrispettivo che dichiara il contrario. Letti nello stesso database, a operazione conclusa.

**Cosa deve fare invece.** Il messaggio non può essere scritto prima di sapere: o la nota si compone **dopo** aver applicato l'eventuale restock, o dice cosa è successo davvero («la giacenza è rientrata» / «nessun rientro dichiarato dal canale»). E `requiresReview` deve chiedere di verificare **la rettifica fiscale**, che resta da fare, non il rientro fisico, che è già avvenuto.

---

## Livello 3 — Comportamenti sbagliati sui dati

### 3.1 — L'import non scorpora, nemmeno quando potrebbe

**Cosa succede.** Un prezzo impostato a 60 su un negozio con prezzi comprensivi entra in VestiFlow come **60 netti**, cioè 73,20 ivati. Il valore corretto sarebbe 49,18.

**Come lo sappiamo.** Misurato dal vivo oggi: prezzo cambiato da 50 a 60 nell'admin di Shopify, webhook arrivato e accettato (`POST /api/v1/shopify/webhooks` → 201 alle 14:48), scheda prodotto in VestiFlow che mostra 60 con il selettore su «Netti».

**Il dettaglio che allarga il problema:** quel prodotto **ha** un Codice IVA. Quindi lo scorporo era possibile e non è avvenuto lo stesso. Non è solo la questione dell'aliquota mancante all'importazione — è che il percorso del webhook non scorpora affatto.

**Cosa deve fare invece.** Vedi la specifica, sezione prezzi. Sintesi: si legge la spunta «prezzi comprensivi» al momento dell'operazione, si scorpora con la funzione **esatta** che conserva la coda a sei decimali, e un controllo automatico verifica che un lordo di 25,00 torni esattamente 25,00 quando lo si rivede ivato — non 24,99.

---

### 3.2 — Due filtri della stessa schermata non conoscono la stessa condizione

**Cosa succede.** Nell'elenco ordini, il filtro per **Stato** esclude gli ordini annullati — la condizione porta `cancelledAt: null` esplicito. Il filtro per **Evasione** no: guarda solo `fulfillmentStatus` e ignora l'annullamento.

Risultato: chi filtra per Stato non vede l'ordine annullato, chi filtra per «Da evadere» se lo ritrova fra le cose da fare. Due filtri sulla stessa lista dicono cose diverse sullo stesso ordine.

**Come lo sappiamo.** Verificato sul codice delle due condizioni, e visibile nell'elenco: #1003 mostra correttamente «Annullato» nella colonna Stato e «Da evadere» nella colonna Evasione.

**Correzione di una voce ritirata.** La prima stesura riportava qui un difetto diverso — «l'ordine annullato risulta vivo, l'annullamento non lascia nessun segno leggibile». **È falso.** Il campo `cancelledAt` esiste, viene scritto all'arrivo dell'evento, è valorizzato su #1003, arriva al client, e la schermata mostra «Annullato» con tono d'errore. Verificato a schermo. L'errore nasceva dall'aver letto `financialStatus` e `fulfillmentStatus` senza mai leggere `cancelledAt` — cioè dall'aver guardato due colonne vicine a quella che serviva.

**Cosa deve fare invece.** La colonna Evasione e il suo filtro diventano consapevoli dell'annullamento, come lo è già il filtro Stato.

**Da non fare:** scrivere «annullato» dentro `fulfillmentStatus`. È lo specchio di un campo Shopify, cioè un dato osservato, e Shopify non ha uno stato di evasione «annullato» — ha un ordine annullato che resta non evaso. Scriverci un valore che il canale non ha mai detto viola il §4.8 della specifica, e una ri-sincronizzazione lo rimetterebbe comunque com'era.

---

### 3.2-bis — La colonna Location si svuota in ogni stato terminale — **CHIUSO**

**Cosa succede.** La colonna Location dell'elenco ordini è alimentata dal **primo impegno attivo**. All'evasione l'impegno viene consumato, all'annullamento viene rilasciato: in entrambi i casi la colonna si svuota.

Sull'ordine annullato il vuoto è la verità — non c'è più merce impegnata da nessuna parte. **Sull'ordine evaso è un'informazione persa:** la merce è uscita da un magazzino e l'ordine non dice quale.

Detto in modo più utile: **la colonna funziona finché l'ordine è aperto, cioè finché il dato è una previsione, e smette proprio quando diventa storia.**

**Come lo sappiamo.** Osservato sull'elenco (#1004 evaso con Location vuota, #1002 e #1001 aperti con «Magazzino test 3») e verificato sui dati: l'evasione di #1004 ha prodotto regolarmente il movimento di scarico su «Magazzino test 3», la giacenza è scesa, l'impegno risulta consumato, e la vendita online porta il proprio `locationId`. Il dato esiste, la colonna guarda nel posto sbagliato.

**Cosa deve fare invece.** Aggiungere la location alla selezione della vendita online — l'elenco la include già ma non seleziona quel campo — e dare alla colonna una catena di ripiego: impegno attivo, altrimenti location della vendita online. Nessuna migration, nessun campo nuovo.

Sull'ordine annullato il vuoto resta. Mostrare dove _era_ impegnata la merce sarebbe una scelta di prodotto, non una correzione.

**Nota sul nome, non è un difetto.** «Location» si legge come «da quale magazzino esce quest'ordine», mentre il valore risponde a «dove è impegnata la merce adesso». Sugli ordini vivi le due domande hanno la stessa risposta e la differenza non si vede.

**Verificato per esclusione:** non è collegato al difetto della cassa POS (1.4). Quello nasce dall'assenza di un impegno preesistente; qui l'impegno c'era e l'evasione l'ha consumato regolarmente. Le due cose restano indipendenti.

---

### 3.3 — Il webhook clienti sovrascrive l'anagrafica corretta a mano

**Cosa succede.** `customers/create` e `customers/update` scrivono sul soggetto canonico: nome, email, telefono, note e indirizzo corretti in VestiFlow vengono rimpiazzati a ogni passata, senza avviso. Lo stesso fa il pulsante «Sync clienti».

**Come lo sappiamo.** Censimento e lettura del codice.

**Cosa deve fare invece.** Vedi la specifica, regole di proprietà. È un comportamento corretto durante il popolamento iniziale e sbagliato dopo — lo stesso schema di quasi tutto questo elenco.

---

### 3.4 — «Importa catalogo» riporta costo e barrato ai valori di Shopify

**Cosa succede.** Il ri-import riscrive costo di riferimento e prezzo barrato con i valori presenti su Shopify. Sono due dati che il gestionale decide e il canale non deve toccare.

**Correzione rispetto alla prima stesura.** Il censimento diceva «azzera», ed è stato riportato così. La misura dice altro: dopo un ri-import quei due valori **tornano indietro corretti da Shopify**, non azzerati. La differenza conta, perché il difetto da correggere non è un'assenza interpretata come zero — è una sovrascrittura da parte di chi non è proprietario del dato.

**Come lo sappiamo.** Misurato. Il percorso del webhook, verificato separatamente l'8 agosto dopo un cambio di prezzo, ha invece lasciato intatti costo (3,00) e barrato (70,00): i due percorsi si comportano diversamente e vanno guardati entrambi.

**Cosa deve fare invece.** Applicare la regola di proprietà della specifica (§2.1): Shopify possiede quei campi ma non ne è la fonte di verità, quindi un'operazione di ingresso non li scrive mai in regime ordinario. Restano scrivibili solo durante il popolamento iniziale, dove il costo si legge una volta.

---

### 3.5 — Varianti fantasma dopo il pull

**Cosa succede.** Il pull confronta le varianti ricevute da Shopify ma non controlla quelle rimaste indietro. Una variante eliminata su Shopify resta in VestiFlow senza che nessuno la tocchi più.

**Come lo sappiamo.** Analisi precedente.

**Cosa deve fare invece.** Serve un passaggio finale che chiuda il confronto: la variante rimasta va **disattivata** se ha storico, **eliminata** se non ne ha — coerente con il modello già deciso (mai cancellare ciò che è stato usato). Va verificato se lo stesso accade anche aggiungendo varianti da VestiFlow.

---

### 3.6 — TikTok pubblica un numero diverso da Shopify

**Cosa succede.** Il push verso TikTok calcola la quantità come **somma su tutte le sedi**, mentre Shopify riceve il **disponibile per sede**. Due tenant che premono lo stesso «Salva» pubblicano numeri diversi sui due canali. TikTok non ha inoltre alcun pulsante di sincronizzazione: ogni push è invisibile per costruzione.

**Come lo sappiamo.** Censimento.

**Cosa deve fare invece.** La quantità pubblicabile si calcola una volta sola, con la stessa formula per tutti i canali. Le differenze fra canali riguardano cosa il canale accetta, non come VestiFlow calcola.

---

### 3.7 — «Ripristina connessione» ripubblica prodotti senza dirlo

**Cosa succede.** Non ricollega, non riautentica, non chiama Shopify: azzera gli errori. Effetto non annunciato: riporta i prodotti da «errore» a «da sincronizzare», quindi verranno **ripubblicati** al prossimo push.

**Come lo sappiamo.** Censimento.

**Cosa deve fare invece.** O il nome dice cosa fa («Azzera gli errori»), o l'azione fa quello che il nome promette. La ripubblicazione che ne consegue va dichiarata prima, non scoperta dopo.

---

### 3.8 — La sede da cui VestiFlow scarica è la prima in ordine alfabetico, non quella che ha spedito — **SCARICO CHIUSO il 14/08, IMPEGNO APERTO**

_Misurato il 14/08/2026 su tre ordini, e confermato dal payload._

**Cosa succede.** Per ogni ordine online VestiFlow impegna e scarica da una sede che **non ha nulla a che vedere con quella che ha evaso**. Shopify impegna, spedisce e ricarica su una sede; VestiFlow su un'altra. I due sistemi tengono i numeri su scaffali diversi, e il totale per sede diverge senza che nessuno lo chieda.

La causa è un ripiego che scatta sempre. `extractShopifyOrderLocationId` cerca la sede in due posti:

- `order.location_id` — sugli ordini online **è assente**;
- `order.fulfillments[].location_id` — esiste **solo dopo** l'evasione.

Alla creazione dell'ordine nessuno dei due c'è, quindi `resolveShopifyOrderLocationId` ricade su
`findFirst({ licensedInVf: true, isActive: true }, orderBy: { name: 'asc' })` — **la prima sede licenziata in ordine alfabetico**.

Peggio: **dopo l'evasione il dato corretto arriva e viene scavalcato.** `createFromFulfilledOrderTx` preferisce la sede dell'impegno (`computedLines.find(l => l.reservation)?.reservation?.locationId ?? event.locationId`), cioè quella scelta a caso prima, invece di `fulfillments[].location_id` che a quel punto è nel payload.

**Come lo sappiamo.** Tre ordini di prova, stesso esito ogni volta: Shopify evade da «Shop location» (`fulfillments[].location_id = 113512284455`), VestiFlow impegna e scarica su «Magazzino test 3» — che è la prima sede in ordine alfabetico fra quelle licenziate. Confronto diretto delle due giacenze a fine prove:

```
  sede                     │ VestiFlow onHand │ Shopify available
  Magazzino test 3         │               -1 │                 1
  Shop location            │   (non tracciata)│                -1
```

**La divergenza nasce alla creazione dell'ordine, non all'evasione**: già all'impegno Shopify scala una sede e VestiFlow un'altra.

**Con una sede sola non si vede.** È il motivo per cui è sopravvissuto: il ripiego dà sempre la risposta giusta finché la lista ha una voce sola.

### ✅ Chiuso il 14/08 — lo scarico segue l'evasione

Lo scarico fisico, il movimento e la sede della riga di Vendita online usano ora `event.locationId`, cioè `fulfillments[].location_id` mappato — il dato che al momento dell'evasione **è già nel payload** e che prima veniva scavalcato. Il ripiego sulla sede dell'impegno resta solo se quel dato manca.

**Perché la correzione non crea la divergenza che sembrerebbe.** Il dubbio è legittimo: se l'impegno sta su una sede e lo scarico su un'altra, il consumo dell'impegno e lo scarico non si compensano più. **Verificato che si compensano lo stesso**, e la ragione è che il consumo non è la contropartita dello scarico — è la contropartita della **creazione** dell'impegno:

```
creazione ordine   applyCommittedDelta(+q)  su A     →  impegnata +1, disponibile −1
evasione           applyCommittedDelta(−q)  su A     →  impegnata −1, disponibile +1   ⇒ saldo A = ZERO
evasione           applyInventoryDelta(−q)  su B     →  giacenza −1, disponibile −1    ⇒ unica scrittura che resta
```

Su A non resta niente; su B esce la merce. È coperto dal test `scarica dalla sede dell'evasione, non da quella dell'impegno`, che **fallisce senza la correzione** — verificato togliendola.

### ⚠️ Resta aperto — l'impegno usa ancora il ripiego alfabetico

Alla **creazione** dell'ordine la sede dell'evasione non esiste ancora nel payload (`order.location_id` assente, `fulfillments[]` vuoto), quindi `resolveShopifyOrderLocationId` ricade sulla prima sede licenziata in ordine alfabetico. L'impegno nasce lì.

**Il danno residuo è transitorio e circoscritto**: fra creazione ed evasione, la sede del ripiego mostra una disponibilità più bassa del vero e quella dell'evasione più alta. Non lascia traccia permanente — all'evasione il saldo torna a zero.

**Perché non lo chiudiamo adesso.** La sede assegnata Shopify la conosce già — la mostra sull'ordine inevaso — ma vive nelle **fulfillment orders**, una risorsa che VestiFlow non legge. Leggerla significa aprire una chiamata nuova verso Shopify proprio mentre la **procedura di prima sincronizzazione**, che governa l'aggancio delle location, non è ancora scritta. Meglio farla dopo, sapendo cosa la mappatura garantisce.

**Strada futura, in ordine:** prima la procedura di prima sincronizzazione, poi la lettura delle fulfillment orders all'impegno.

**Nota per chi ha più sedi.** Al reso Shopify propone una sede di rientro che **non è quella da cui la merce è partita** — segue la priorità delle sedi, non l'evasione. Riferito dall'assistente Shopify e coerente con l'osservato; **da verificare** in Impostazioni → Sedi e nelle regole di reso. Con la correzione dello scarico le logiche in campo scendono da tre a due, ma restano due.

---

## Livello 4 — Consumo e comportamenti non richiesti

### 4.1 — «Sincronizza location» parte da sola

Si avvia a ogni apertura della pagina Impostazioni e al ritorno dall'autenticazione. È l'azione che **crea e cancella sedi** e può modificare il piano del tenant. È l'unica del pannello che cancella e l'unica che parte da sola: almeno una delle due cose va resa esplicita.

### 4.2 — Letture ripetute continue

Lo stato della connessione viene riletto **ogni 15 secondi su tutte le schermate**, e di nuovo a ogni ritorno sulla scheda del browser. Quella lettura, da sola, può riportare la connessione da «errore» a «collegata» nel database — cioè cancella una segnalazione senza che nessuno abbia risolto niente. La scheda prodotto in sincronizzazione si rilegge **ogni 2 secondi**.

### 4.3 — «Categoria Shopify» interroga Shopify a ogni digitazione

Consuma quota API mentre l'operatore crede di sfogliare un elenco locale.

### 4.4 — Il pulsante giacenze mente sul conteggio

Dice «N nuove» ma il numero è sempre zero, e la «ripubblicazione programmata» tipicamente non parte nel caso canonico.

---

## Livello 5 — Nomi, doppioni e cose che non fanno quello che dicono

Questi non rompono niente, ma sono il motivo per cui un operatore non può sapere quale pulsante premere. Si risolvono quasi tutti con la riorganizzazione descritta nella specifica; li elenco perché non vadano persi.

**Otto pulsanti per quattro operazioni.** Quattro endpoint hanno due etichette ciascuno a seconda di dove ti trovi: «Importa catalogo» / «Sincronizza catalogo da Shopify», «Sync giacenze» / «Sincronizza giacenze da Shopify», «Sync clienti» / «Sincronizza da Shopify», «Sync vendite» / «Sincronizza vendite da Shopify». Tre vocabolari — importa, sync, sincronizza — per la stessa famiglia, senza nessuna regola.

**Due etichette quasi identiche fanno l'opposto.** «Sincronizza con Shopify» (dettaglio prodotto: l'unico push dell'intera applicazione) e «Sincronizza catalogo da Shopify» (pull).

**Tre pulsanti «Riprova» su tre endpoint diversi**, nessuno dei quali contatta Shopify.

**Il chip sync in topbar** è su ogni schermata, è l'elemento che più somiglia a un «Sincronizza», ed è l'unico che non sincronizza: apre le Impostazioni.

**«Attiva/Disattiva aggiornamenti automatici»** sono i webhook, parola che non compare mai. Asimmetria non dichiarata: spegnerli non ferma il push di VestiFlow verso Shopify, che continua a ogni movimento.

**La casella «Sincronizza con Shopify» nel form prodotto** funziona correttamente — verificata: viene salvata e letta come guardia dal push — ma il commento nel codice dichiara la sua posizione «temporanea».

**Le pubblicazioni senza pulsante non riportano mai l'esito.** Salva prodotto, Importa CSV, aggiungi o rimuovi immagine (un push completo per **ogni** immagine), ogni movimento di magazzino, ogni documento, la cassa. L'unico punto dell'applicazione dove un esito di pubblicazione si vede è il pulsante del dettaglio prodotto.

---

## Cosa resta aperto

**L'evento perso delle 13:17 dell'8 agosto.** Verificato: non è mai arrivato all'applicazione — i Network Logs sono vuoti in quella finestra, e `lastSyncAt` non si è mosso. Verificato anche che la catena funziona: gli eventi provocati (quattro consegne accolte fra le 14:20 e le 14:22 durante la diagnosi, una alle 14:48 dal cambio di prezzo manuale) sono arrivati e accettati in pochi secondi. Restano due ipotesi: o quella data su Shopify si è mossa per una causa che non genera webhook, o Shopify ha saltato una consegna senza ritentare. **Non risolto, e non necessariamente risolvibile.** Rafforza però la conclusione del punto 2.3: senza la data dell'ultimo evento ricevuto, un buco così non è rilevabile dall'interno.

**Se «Importa catalogo» azzeri ancora costo e barrato** — punto 3.4.

**Cosa fare dei webhook GDPR obbligatori** — punto 2.5.

**Il Corrispettivo nasce all'evasione, a prescindere dall'incasso — e non è un difetto.** _Misurato il 14/08/2026._ `#1006` era in sospeso — `Pagato 0,00 €`, `Saldo 60,00 €` — e all'evasione VestiFlow ha creato `COR-2026-0004` da 60,00 € datato quel giorno. Sembrava una decisione di prodotto mai presa; è invece il comportamento corretto: _base normativa riferita_, per le cessioni di beni mobili il momento di effettuazione è la consegna o spedizione (art. 6 DPR 633/1972), e il contrassegno incassato dopo è un evento finanziario che non sposta quella data. **Resta da fare una cosa sola: scrivere quel perché accanto al codice**, che oggi non lo dichiara — ed è per questo che leggendolo sembrava un buco. Vedi `08` §5.

**Al registro corrispettivi manca il filtro per canale.** _Misurato il 14/08/2026:_ `CorrispettivoEntry.channel` esiste e il registro **aggrega già per canale** con etichetta, ma **nella lista il filtro non c'è** — il dato è presente e l'operatore non può usarlo. Deciso il 14/08: registro unico, filtrabile per canale, con export separato negozio/online producibile. Serve perché i due flussi hanno adempimenti diversi (vedi `08` §8). La parte di trasmissione telematica arriva col ramo cassa del collega, dove vivono già `fiscal_devices` e `fiscal_receipts`.

**`excluded_invoiced` esclude un importo senza che l'esclusione sia verificabile.** _Misurato il 14/08/2026:_ lo stato si imposta con la spunta «fattura emessa» (`invoiceIssued`) sul registro, **senza collegamento a una fattura reale**: nessuno può risalire a quale fattura giustifichi l'esclusione, né accorgersi di una spunta messa per errore.

**Non toglie però nulla all'estrazione per il commercialista**, e questa voce prima diceva il contrario: _misurato_, l'export (`api/src/corrispettivi/`) legge `salesOrder` e **non tocca `corrispettivoEntry`**. Il danno è quindi circoscritto alla vista del registro, non ai dati che escono.

Nessuna nozione di «periodo chiuso» serve: i dati per il commercialista si estraggono su richiesta con export filtrati, e **i controlli in VestiFlow sono avvisi, mai blocchi**. Da affrontare quando si costruiranno i filtri e gli export del registro derivato — e ricordando che le entries cadono (`04` §8).

**VestiFlow non può sapere che un ordine è in contrassegno.** _Misurato il 14/08/2026:_ nessuna lettura di `gateway`, `payment_gateway_names`, `payment_terms` o `processing_method` in tutto `api/src` — zero occorrenze. Arriva solo `financial_status: pending`, che non distingue «pagherà alla consegna» da «pagherà a 30 giorni». Rilevante per il modulo Pagamenti: **oggi non ci sarebbe niente su cui agganciare il credito verso il corriere.**

**`cancel_reason` esiste, è valorizzato e nessuno lo legge.** _Misurato il 14/08/2026 sul payload di `#1007`: `cancel_reason: customer`._ Non serve a distinguere i casi che ci interessavano — l'annullamento su Shopify esiste solo prima dell'evasione — ma è un campo disponibile e mai raccolto.

**`lastWebhookEventAt` non si aggiorna in produzione.** Entrambe le connessioni hanno il campo a `null` pur avendo ricevuto decine di eventi il 14/08. Coerente con Railway che gira `main`, dove `recordWebhookEventReceived` non esiste (verificato: zero occorrenze su `origin/main`). Si chiude col rilascio del ramo, ma finché non accade la spia del punto 2.3 mente per difetto.

**Due connessioni Shopify risultano entrambe `connected`.** `test-vestiflow.myshopify.com` e `vestiflow-test-hifqgyz0.myshopify.com`, la seconda senza indirizzo webhook. Da lì vengono le sedi duplicate («Shop location» ×2, «My Custom Location» ×2, «Negozio principale» ×3) che rendono il ripiego alfabetico del punto 3.8 ancora più arbitrario. Rumore di ambiente di prova, ma va ripulito prima di misurare qualsiasi cosa sulle sedi.

---

## Un avviso di sicurezza fuori elenco

Durante l'analisi la `SUPABASE_SERVICE_ROLE_KEY` è comparsa parzialmente in uno screenshot. È la chiave che scavalca ogni permesso sul database. Conviene rigenerarla da Supabase per prudenza, e in generale evitare di fotografare quel file.
