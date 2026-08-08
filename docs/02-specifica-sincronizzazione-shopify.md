# VestiFlow — Sincronizzazione Shopify: disegno

**Data:** 8 agosto 2026
**Sostituisce:** «Attivazione iniziale Shopify, importazione controllata e cutover» v1.0 del 13 luglio 2026, che descriveva un'integrazione in sola lettura su un sistema che non esisteva ancora. Di quel documento restano tre idee, riprese qui: il saldo iniziale preso da `available`, il confine temporale sugli ordini, e il saldo che nasce da un documento invece che da una scrittura diretta.
**Rapporto con il registro dei difetti:** questo documento dice cosa deve diventare il sistema. Il registro dice cosa è rotto adesso. Diversi difetti si chiudono da soli applicando le regole qui descritte; quelli che non si chiudono restano nel registro.

---

## 1. Il problema di fondo

Tutti i difetti trovati appartengono a due famiglie. Non sono errori indipendenti da correggere uno per uno: sono due assenze strutturali che si ripresentano ovunque.

### 1.1 — Il sistema non sa in che fase si trova

Un'operazione di **popolamento iniziale** ha regole diverse da un'operazione di **aggiornamento ricorrente**. Sovrascrivere tutto è corretto quando non c'è niente da rispettare, ed è distruttivo quando c'è.

VestiFlow è nato come importatore di cataloghi. Le operazioni di quella fase sono rimaste accese in permanenza, e nessuna di esse sa che la fase è finita:

«Importa catalogo» sovrascrive dati che oggi qualcuno ha inserito a mano.
«Sync clienti» rimpiazza anagrafiche corrette in VestiFlow.
Il webhook `products/update` fa lo stesso, senza che nessuno prema niente.

Il pulsante e il webhook non sono due problemi: sono la **stessa operazione che non sa in che fase si trova**. Per questo la fase iniziale non è solo una comodità per il cliente nuovo — è la cosa che dà un prima e un dopo al sistema.

### 1.2 — Il sistema conferma di aver fatto, non dice se è ancora vero

La spia degli aggiornamenti automatici dice che una registrazione è riuscita mesi fa. Il verde di sincronizzazione sui prodotti dice che una richiesta è partita. Il conteggio dei webhook dice sette senza dire quali. Gli errori vengono cancellati dal primo successo che capita.

Ne consegue che **un difetto silenzioso può durare per sempre**, ed è esattamente quello che è successo: un topic mancante da luglio, eventi che non arrivano, un ciclo di riconciliazione che gira a vuoto da giorni. Nessuna di queste cose sarebbe mai stata scoperta da un operatore.

---

## 2. Le regole di proprietà dei dati

Sono la base di tutto il resto. Deciso una volta, vale ovunque: webhook, pulsanti, import massivi.

### 2.1 — La regola principale

> **Per ogni dato esiste un proprietario dichiarato. Un messaggio di Shopify può scrivere solo i dati di cui Shopify è proprietario — anche quando ne possiede altri.**

_Correzione rispetto alla prima stesura._ La regola era formulata come «un dato che Shopify non conosce non può essere modificato da un messaggio di Shopify». È falsa nei fatti: `cost` esiste sull'inventory item, `compare_at_price` sulla variante, e l'applicazione già li legge entrambi. Chi implementa si troverebbe davanti due campi che Shopify conosce benissimo, e o romperebbe la regola o la applicherebbe male.

La formulazione corretta è di **proprietà**, non di conoscenza. Shopify possiede il costo e il barrato, ma non ne è la fonte di verità: quei valori li decide il gestionale.

Il vantaggio che cercavamo si conserva intero — se domani si aggiunge un campo, basta dichiararne il proprietario, senza mantenere una lista di campi protetti sparsa nel codice.

**Conseguenza per il registro:** il ri-import non azzera costo e barrato, li **riporta ai valori di Shopify**. È comunque una violazione della proprietà, ma è un difetto diverso da quello descritto dal censimento, e va corretto sapendo qual è.

### 2.2 — Prezzi

Il **prezzo articolo** è dell'operatore. Nessun canale lo scrive mai in regime ordinario. Una promozione fatta nell'admin di Shopify aggiorna il prezzo del canale e il prezzo del negozio resta intatto.

Il **prezzo Shopify** è lo specchio bidirezionale del canale. È l'unico campo prezzo che un messaggio di Shopify può toccare.

**Alla nascita da import** si scrivono entrambi, perché è coerente con la regola già stabilita per la creazione manuale: i due prezzi partono uguali e diventano indipendenti dopo il salvataggio.

_Verificato dal vivo l'8 agosto: cambiando il prezzo su Shopify da 50 a 60, il prezzo articolo è rimasto 50 e il prezzo Shopify è diventato 60. La separazione funziona già._

### 2.3 — Costi

Il **costo effettivo** vive sulla variante, il **costo di riferimento** sull'articolo. Nessuno dei due è mai scritto da un messaggio di Shopify in regime ordinario.

Su Shopify esiste un campo `cost` sulla variante, che il negoziante usa per i propri rapporti. Serve **una volta sola**, nel popolamento iniziale.

### 2.4 — Anagrafica prodotto e cliente

Nome, descrizione, immagini, dati del cliente esistono in entrambi i sistemi e il cliente li completa dove preferisce. Sono bidirezionali per scelta.

Qui il trucco dei due campi separati usato per i prezzi non è applicabile: c'è un solo campo, e vince l'ultimo che scrive. Su una descrizione prodotto è quasi sempre il comportamento giusto — chi ha appena scritto si aspetta di vedere la sua modifica.

Non serve un padrone. Serve che **quando una sovrascrittura avviene si veda che è avvenuta**: non un blocco, una traccia consultabile.

### 2.5 — Giacenze

**VestiFlow comanda sempre.** È già implementato: `inventory_levels/update` non entra, confronta e ripubblica il valore di VestiFlow.

Va **dichiarato**, perché ha una conseguenza che oggi nessuno sa: una rettifica di giacenza fatta nell'admin di Shopify è impossibile, viene rimbalzata indietro. Se il negoziante ci prova, deve leggerlo prima e non scoprirlo dopo.

Conseguenza per il popolamento iniziale: **non esiste nessuna strada perché una giacenza entri in VestiFlow**, perché anche il webhook la chiude. Il documento di apertura descritto al punto 4 non è un'eleganza — è l'unico modo.

### 2.6 — Dati parziali

> **Se l'arricchimento fallisce, non si scrive un dato parziale: si segnala e si lascia il record com'era.**

Oggi vale il contrario, e produce record che nel database sembrano un successo. Un dato incompleto scritto sopra un dato buono è peggio di un aggiornamento mancato, perché è indistinguibile da un aggiornamento riuscito.

### 2.7 — Configurazione fiscale

La spunta **«prezzi comprensivi d'imposta»** si legge **al momento dell'operazione**. L'ultimo valore letto si conserva insieme alla data della lettura.

_Correzione rispetto alla prima stesura, che diceva «non si memorizza» e due righe dopo parlava di una cache. La versione corretta è una sola:_

Se la lettura riesce, si usa quel valore e si aggiorna la data.
Se la lettura fallisce, si usa l'ultimo valore conosciuto **dichiarando che è vecchio**, con la sua data.
Se non esiste alcun valore conosciuto, l'operazione non procede.

**Con una distinzione che va rispettata:** un valore vecchio basta per leggere, non per **pubblicare un prezzo**. Pubblicare significa scrivere sul negozio del cliente un numero il cui significato dipende da quella spunta, e se la spunta è cambiata nel frattempo il numero è sbagliato del 22%. È il caso già misurato: mercato passato da Stati Uniti a Italia senza che si muovesse niente, e da quel momento ogni prezzo significava un'altra cosa.

Il motivo per cui non ci si può fidare della memoria: `shop/update` non è fra i topic gestiti, quindi quella spunta può cambiare senza che VestiFlow lo sappia mai. Leggere al momento giusto rende ogni singola operazione corretta senza bisogno di ricordare nulla — e non promette un allineamento permanente che un connettore non può mantenere.

---

## 3. Le due fasi

### 3.1 — Popolamento iniziale

Si fa **una volta per cliente**. Sa di trovare il vuoto da una parte, quindi può scrivere tutto.

Non è una procedura unica: sono **due direzioni**, e si sceglie in base a dove stanno i dati.

**Direzione A — il catalogo è su Shopify, VestiFlow è vuoto.** È il caso principale: un negozio già avviato che adotta il gestionale.

**Direzione B — il catalogo è su VestiFlow, il negozio Shopify è nuovo.** Oggi **non esiste alcuno strumento** per questo caso: il push esiste solo sul singolo prodotto, quindi un cliente con quattrocento articoli dovrebbe aprire quattrocento schede. Nessuno se n'era accorto perché il sistema è nato dalla direzione opposta.

**Caso misto.** Entrambi popolati: nessuna sovrascrittura automatica, il conflitto si mostra e si decide.

Quando il popolamento è concluso, **non resta come strada principale**. Al suo posto compare il riepilogo di cosa è entrato e quando — consultabile, non ripetibile. Rifarlo esiste come azione separata, con una conferma che dichiara cosa sovrascriverà.

Questo è il punto che impedisce al difetto di ripresentarsi: se il popolamento iniziale resta un pulsante permanente, fra due anni qualcuno lo premerà.

### 3.2 — Regime ordinario

Dal momento in cui il popolamento è concluso, valgono le regole di proprietà del punto 2 senza eccezioni. Shopify aggiorna solo quello che possiede.

---

## 4. Il popolamento iniziale in dettaglio

### 4.1 — Prima di toccare qualsiasi cosa

Si legge e si mostra all'operatore: il negozio collegato, quante sedi, quanti prodotti e varianti, **se i prezzi sono comprensivi d'imposta**, quante varianti hanno il tracciamento inventario attivo.

Nessuna scrittura verso Shopify in questa fase.

Se la spunta dei prezzi comprensivi non è leggibile, il popolamento non parte. È il dato senza il quale ogni prezzo importato significa un'altra cosa.

### 4.2 — Sedi

Il collegamento fra sedi Shopify e magazzini VestiFlow è obbligatorio e precede qualsiasi quantità. Preferibilmente uno a uno. Una sede può essere esclusa esplicitamente. Le configurazioni multiple (più sedi verso un magazzino o viceversa) richiedono una regola dichiarata e restano fuori dal flusso standard.

Nessuna quantità entra o esce prima che questo sia fatto.

### 4.3 — Catalogo, direzione A

I prodotti e le varianti entrano con i loro identificativi Shopify.

**Il Codice IVA entra come «da definire».** Non è un valore inventato: su Shopify non esiste un campo aliquota per prodotto — c'è solo la spunta «addebita imposte», e l'aliquota la decidono le regole fiscali del paese. Il prodotto in VestiFlow lo stai creando in quel momento, quindi nessuno gli ha mai assegnato un codice.

**Gli stati sono tre, non due.** Nella prima stesura ne avevamo previsti due, ma il campo vuoto ha già un significato nel form: significa «usa il predefinito aziendale». Quindi:

**Valorizzato** — l'articolo ha la sua aliquota.
**Vuoto** — eredita il predefinito aziendale. È una scelta di chi ha compilato la scheda.
**Da definire** — nessuno ha mai deciso. È lo stato degli articoli importati.

Lo zero non può fare da terzo stato perché **lo 0% è un'aliquota vera**.

> **«Da definire» non eredita il predefinito.** È la differenza che giustifica l'esistenza del terzo stato: se ereditasse, un'aliquota che nessuno ha confermato entrerebbe in silenzio in quattrocento articoli — esattamente il rischio che questo stato serve a evitare. Il vuoto eredita perché qualcuno ha scelto di lasciarlo vuoto; «da definire» no, perché nessuno ha scelto niente.

**Niente si blocca.** Quegli articoli sono già su Shopify, ci sono nati, e il negozio funziona: VestiFlow non deve impedire nulla. Il cliente sistemerà quello che va sistemato, con i suoi tempi.

_Resta aperta una domanda a valle, da decidere quando ci si arriva e non prima: cosa fa VestiFlow quando deve pubblicare il prezzo di un articolo con Codice IVA da definire, su un negozio a prezzi comprensivi, dove il lordo si calcola solo conoscendo l'aliquota. Vedi §8._

**L'import non si blocca.** Gli articoli entrano tutti, con lo stato «da definire» che è un valore filtrabile nell'elenco prodotti. L'operatore li richiama quando vuole e li sistema in blocco con l'azione massiva **«Assegna Codice IVA alla selezione»** — il frontend ha già tutto tranne l'endpoint.

**La schermata di assegnazione raggruppa per collezione Shopify**, così come il negoziante ha già organizzato il suo negozio, con «assegna a tutti» per il caso normale. Su un catalogo misto sono tre gesti invece di quattrocento.

> **Le collezioni servono solo a raggruppare, mai a dedurre l'aliquota.** Il nome è testo libero scritto da un umano: oggi «collezione pane 4%», domani «Alimentari» o «Panetteria Rossi». Estrarre un numero da quella stringa sarebbe un'inferenza travestita da dato. E anche col nome più chiaro del mondo, l'appartenenza non dice che ci sia un override né quale sia — l'aliquota dell'override non è leggibile via API.

_Prerequisito tecnico: oggi l'import massivo salta il passaggio che popola la collezione, quindi quel dato non arriva. Conviene chiedere le collezioni con i loro prodotti, non i prodotti con le loro collezioni: le collezioni sono poche, gli articoli molti._

### 4.4 — Prezzi nel popolamento

Il prezzo entra **grezzo**, com'è arrivato, e viene **ricalcolato nel momento in cui si assegna il Codice IVA**, con un riepilogo prima di confermare.

Se la spunta «prezzi comprensivi» è accesa, il numero è lordo e va scorporato. Se è spenta, è già netto e serve comunque il Codice IVA, perché è un dato che l'articolo deve avere.

> **Lo scorporo usa la funzione esatta**, quella che conserva la coda a sei decimali, non quella arrotondata usata per la visualizzazione. Sono due funzioni diverse e sbagliarla costa un centesimo.
>
> Controllo automatico obbligatorio sul percorso di import, come quelli già fatti sugli altri punti di uscita: **un lordo di 25,00 importato deve risultare esattamente 25,00 quando lo si rivede ivato in anagrafica, non 24,99.**

_Contesto: 25,00 al 22% dà 20,491803…; con sei decimali il valore si conserva e la moltiplicazione inversa torna 25,00. Con due decimali si salverebbe 20,49 e tornerebbe 24,99. La verifica su tutte le aliquote italiane per prezzi da 0,01 a 5.000,00 dava zero discordanze con sei decimali e circa il 18% di errori con due._

Sia il prezzo articolo sia il prezzo Shopify vengono valorizzati, perché il prodotto sta nascendo. I tre listini aggiuntivi restano vuoti.

### 4.5 — Costi nel popolamento

Il costo si legge **dove esiste** su Shopify — il campo `cost` sulla variante — e questa è l'unica occasione in cui un dato di Shopify scrive un costo in VestiFlow.

Dove non esiste, **entra a zero**. Non serve uno stato «da definire» come per l'IVA: sul costo lo zero non ha un significato fiscale che confligge, e un costo a zero è anche un caso legittimo (omaggi, campioni).

Va detto cosa aspettarsi: molti negozianti non compilano quel campo, perché su Shopify serve solo ai rapporti. La prima importazione porterà dentro un catalogo con pochi costi valorizzati.

**Il costo di riferimento dell'articolo non si inventa** da medie o dalla prima variante. Resta vuoto e lo scriverà il primo Arrivo Merce, con la spunta di propagazione già esistente.

Nessuna segnalazione invasiva: chi vuole ritrovarli usa il **filtro «costo a zero»** nell'elenco prodotti, come per l'IVA da definire. Se il cliente non li guarda mai, è una sua scelta.

### 4.6 — Giacenze nel popolamento

Il saldo iniziale è la quantità **`available`** letta per variante e per sede al momento del passaggio. Non `on_hand`.

La distinzione conta: `on_hand` è tutto il fisicamente presente, e comprende quantità già impegnate da ordini precedenti. `available` è la quantità **libera che entra sotto la gestione di VestiFlow**. Le unità già assegnate a ordini vecchi restano nel perimetro della gestione precedente.

Si accetta consapevolmente che, finché quei vecchi ordini non sono evasi, la giacenza VestiFlow non coincida con tutta la merce fisicamente presente. La convergenza avviene da sé all'evasione:

```
Prima:  Shopify on_hand 10, impegnata 2, available 8  →  VestiFlow apre con 8
Dopo:   Shopify on_hand  8, impegnata 0, available 8  →  VestiFlow resta 8
```

In cambio non serve importare storico, ricostruire impegni, generare corrispettivi retroattivi o gestire vecchi fulfillment.

**Il saldo nasce da un documento di apertura**, non da una scrittura diretta sulla tabella dei saldi. I movimenti li genera il normale motore delle quantità. Il documento conserva: sede Shopify, magazzino VestiFlow, variante, quantità acquisita, data e ora della lettura, chi ha confermato.

`available` può essere negativa se il negozio vende oltre disponibilità. VestiFlow ammette quantità negative, quindi si importa così com'è, segnalata. Verso Shopify si pubblica comunque zero, perché le API non accettano una quantità negativa in impostazione assoluta.

Una quantità **letta e trovata identica non va ripubblicata**: si registra come già allineata. Nessun push inutile all'attivazione.

### 4.7 — Il confine sugli ordini

Gli ordini creati **prima** del passaggio non entrano in VestiFlow. Mai, e senza eccezioni automatiche.

Il confine usa la **data di creazione dell'ordine su Shopify** — non l'ora di ricezione del messaggio, non l'ora di evasione, non la data di ultima modifica.

Un evento successivo relativo a un ordine precedente viene registrato tecnicamente e ignorato, con il motivo scritto. Se un vecchio ordine viene annullato con rientro a magazzino, si genera una differenza che l'operatore risolve con una Rettifica manuale: non si importa retroattivamente niente.

Il recupero degli ordini parte da qualche minuto prima del confine per coprire le latenze, e la sovrapposizione non crea duplicati grazie all'identificativo dell'ordine.

> **Non esiste una fotografia istantanea globale.** Shopify e il database VestiFlow non possono condividere una transazione. La sicurezza viene dal confine sulla data, dalla sovrapposizione e dall'idempotenza — non dall'illusione di un istante comune.

### 4.8 — Gli ordini si registrano com'è avvenuto

Se Shopify ha applicato il 22% a un articolo che VestiFlow classifica al 10%, **l'ordine resta registrato con il 22%**: è quello che è successo e quello che il cliente ha pagato.

L'aliquota su un ordine è un **dato osservato**, non una scelta dell'utente. VestiFlow segnala la discrepanza, non riscrive. Il negoziante decide se rettificare.

### 4.9 — Direzione B: da VestiFlow verso Shopify

Shopify non è fonte di nulla in questo caso. I suoi zeri o le sue quantità provvisorie non devono azzerare VestiFlow.

Si collegano o si creano i prodotti partendo dalle anagrafiche VestiFlow, si mappano sedi e varianti, si calcola la quantità pubblicabile e **si mostra l'anteprima completa delle scritture prima di eseguirle**.

```
Quantità iniziale Shopify = max(0, Giacenza − Impegnata − scorta di sicurezza)
```

Il prezzo pubblicato è lordo se il negozio ha i prezzi comprensivi, netto altrimenti — letto al momento, come da punto 2.7.

---

### 4.10 — L'interruttore della sincronizzazione

Serve un interruttore che **ferma entrambe le direzioni**.

Oggi ne esiste uno che sembra questo e non lo è: «Attiva/Disattiva aggiornamenti automatici» spegne solo i webhook, cioè quello che entra. Il push di VestiFlow verso Shopify continua a ogni movimento, a ogni salvataggio, a ogni immagine. L'operatore crede di aver fermato la sincronizzazione e ne ha fermata metà — asimmetria che oggi non è dichiarata da nessuna parte.

**A cosa serve, per come è stato pensato:**

**Chiudere il popolamento iniziale con un gesto esplicito.** Finché è spento si configura, si importa, si controlla; quando si accende, il sistema entra in regime ordinario. È il momento che oggi manca del tutto — la fase iniziale finisce senza che nessuno la dichiari, ed è la radice del difetto descritto al §1.1.

**Fermare i danni.** Oggi, se la sincronizzazione sta facendo qualcosa di sbagliato, l'unico modo di fermarla è disconnettere — che cancella sedi, giacenze e movimenti. L'interruttore è la cosa che manca fra «va tutto bene» e «disconnetto».

**Cosa succede a ciò che accade mentre è spento: non si conserva.**

La ragione non è che conservare sia sbagliato in astratto, è che nei due casi per cui l'interruttore esiste non serve. Durante il popolamento non c'è niente da conservare, perché il sistema non è ancora in funzione e il popolamento legge tutto da capo. Durante un'emergenza il negoziante lo ha spento **perché** qualcosa stava andando storto: non vuole che gli eventi si accumulino e gli arrivino tutti insieme alla riaccensione.

Alla riaccensione si esegue il **controllo delle differenze**, che è comunque una funzione necessaria per altro (§6.2).

_Nota onesta: gli usi reali di questo interruttore sono da verificare sul campo. È stato pensato per l'installazione iniziale e per le emergenze; quando servirà davvero lo si scoprirà guardando perché qualcuno l'ha premuto, e a quel punto la scelta di non conservare va rivista alla luce di quei casi, non di ipotesi fatte adesso._

#### Cosa è stato misurato

**Venti punti pubblicano, due sole porte.** Diciannove percorsi passano dalla facciata dei canali — documenti, arrivo merce, trasferimenti, rettifiche, inventario, conteggi, immagini prodotto (un push completo per ogni immagine), import CSV, prodotti, ordini manuali, vendita al banco. Uno scavalca la facciata: il pull inventario, che è il percorso dietro «Riallinea le giacenze su Shopify». Due sono endpoint manuali.

Ma tutti convergono su **due soli servizi di push**, giacenze e prodotti. Anche il percorso che scavalca la facciata finisce lì. Quindi due guardie coprono tutto — non venti.

**L'interruttore di oggi non è un interruttore.** `autoSyncEnabled` è consultato in un solo punto dell'intera applicazione: il cancello sui webhook in entrata. Nessun servizio di push lo guarda.

E il difetto è più profondo del «ferma solo metà»: **quel campo non è uno stato che l'operatore governa, è la traccia di un'operazione distruttiva.** Diventa vero quando una registrazione riesce, falso quando le sottoscrizioni vengono cancellate su Shopify. Non descrive una volontà, descrive una conseguenza.

Da lì discendono i due problemi noti, che sono lo stesso problema: spegnere **cancella** invece di mettere in pausa, e per aggiungere un topic bisogna spegnere e riaccendere, perché la sola strada verso «registra» passa dall'etichetta che compare solo quando è spento.

#### Cosa deve diventare

**Uno stato locale che non tocca niente su Shopify.** In pausa le sottoscrizioni restano vive e gli eventi continuano ad arrivare: semplicemente non vengono trattati. Riattivando non si registra nulla di nuovo.

Il nome è libero — dopo il punto Uno, `autoSyncEnabled` non serve più a dire se i webhook sono registrati, lo dicono meglio l'elenco dei topic e la data dell'osservazione. Va chiamato per quello che è: **sincronizzazione in pausa**, non «aggiornamenti automatici», perché ferma entrambe le direzioni e non riguarda solo l'automatico.

**Schema:** una colonna additiva, `syncPausedAt` — un timestamp e non un booleano, perché dice anche _quando_, che è la differenza fra uno stato e una decisione databile. Eventualmente `syncPausedBy`.

**Costo delle guardie: zero query.** Entrambi i servizi di push leggono già la connessione come prima cosa; la pausa è una riga accanto, sullo stesso oggetto già caricato. E si innesta su un vocabolario esistente delle ragioni di salto, quindi tutto ciò che oggi sa mostrare perché un push è stato saltato lo mostra anche per la pausa.

#### Decisioni prese

**I pulsanti manuali si fermano.** «Fermare i danni» non funziona se il gesto manuale passa: chi preme «Riallinea le giacenze» a sincronizzazione in pausa è esattamente la persona che l'interruttore deve proteggere.

**La pausa nasce silenziosa.** Gli eventi scartati durante la pausa non lasciano traccia, come oggi. La traccia arriva col passo 5 (registro 2.4/2.5). Non è un peggioramento: è lo stato attuale con in più un interruttore che funziona.

**Riaccendere non riallinea**, perché il controllo delle differenze del §6.2 richiede lo scheduler, che non esiste. Ma **l'interfaccia deve dirlo esplicitamente alla riaccensione**: quello che è successo durante la pausa non è stato recuperato. Un interruttore che c'è vale più di uno che aspetta lo scheduler, purché non finga.

**Simmetrico su TikTok.** È lo stesso difetto sullo stesso codice; farlo solo su Shopify significa tornarci.

**Conferma per spegnere**, che qui dichiara una decisione voluta invece di legittimare un difetto — e deve dire che gli eventi della pausa non si recuperano.

#### Da prevedere, non ancora disegnato

**Il riallineamento dopo la pausa, da VestiFlow verso Shopify.** Alla riaccensione le due parti possono essere divergenti: VestiFlow ha continuato a lavorare, Shopify ha continuato a vendere. Serve un modo di ripubblicare ciò che è cambiato nel gestionale mentre la sincronizzazione era ferma, senza rifare tutto il catalogo.

Non è lo stesso del controllo delle differenze del §6.2, che confronta e segnala in sola lettura: qui si tratta di **riportare Shopify allo stato di VestiFlow**, cioè di scrivere. Va disegnato quando si affronta, con le stesse cautele di ogni scrittura verso il canale — anteprima di cosa cambierà, nessuna scrittura senza divergenza dichiarata.

---

Questa parte è piccola come lavoro e **abilita tutto il resto**. Senza di essa qualunque pannello nuovo mostrerebbe le stesse spie che mentono.

**Salvare l'indirizzo** a cui i webhook sono registrati, insieme alla connessione. Oggi non c'è, ed è il motivo per cui abbiamo dovuto chiedere a Shopify una cosa che VestiFlow dovrebbe sapere di sé.

**Salvare l'elenco dei topic**, non il conteggio. E confrontare i registrati con gli attesi, segnalando la differenza con i nomi. «Sette» senza dire quali è un'informazione che non serve a niente: è il motivo per cui `orders/cancelled` è mancato per un mese senza che nessuno lo sapesse.

**Registrare la data dell'ultimo evento ricevuto, in un campo nuovo.** È l'unica cosa che distingue «non è cambiato niente» da «non arriva più niente».

_Non si può riusare `lastSyncAt`: ha sette scrittori, sei dei quali sono sincronizzazioni manuali. Un timestamp che si muove sia per un webhook sia perché qualcuno ha premuto un pulsante non distingue niente — è l'ambiguità che durante questa analisi ha già prodotto una deduzione sbagliata. Il campo nuovo registra **solo i webhook accolti**, e costa una colonna._

**«Aggiornamenti automatici attivi» deve significare che è arrivato qualcosa di recente**, non che una registrazione è riuscita una volta.

**Gli errori si accumulano e si risolvono, non si cancellano.** Un successo su un'operazione non dice niente sul fallimento di un'altra.

**Conservare il messaggio originale di Shopify** sui fallimenti, invece di sostituirlo con un testo preconfezionato. Una diagnosi inventata manda a cercare nel posto sbagliato.

**Registrare i webhook rifiutati** con il motivo. Un rifiuto è un fatto, non un non-evento.

---

## 6. I sospesi e i processi automatici

### 6.1 — Le due direzioni non sono simmetriche

**Quello che esce, VestiFlow lo sa.** Se una pubblicazione fallisce, il fallimento è suo e lo può registrare. Qui riprovare da soli ha senso: l'operatore non ha motivo di accorgersene e non deve.

**Quello che entra, VestiFlow non lo sa.** Un evento che non arriva non fallisce — semplicemente non accade. Non c'è niente da rimettere in coda. L'unico modo di accorgersene è andare a guardare e confrontare.

### 6.2 — Decisione

Serve uno scheduler, con **due compiti soli e stretti**:

**Uno.** Far ripartire la coda in uscita, con un **numero massimo di tentativi** e attesa progressiva. Esauriti i tentativi si smette, e la riga finisce in un elenco visibile dove qualcuno decide.

**Due.** Eseguire il **controllo periodico delle differenze, in sola lettura**. Confronta e segnala, non riscrive mai da solo. Serve soprattutto per i tre cambiamenti che non arrivano mai — spunta dei prezzi comprensivi, tax override sulle collezioni, disinstallazione dell'app.

Tutto il resto resta manuale.

### 6.3 — Le due regole che ne derivano

> **Niente che gira da solo può riprovare all'infinito.**
> **Niente che gira da solo può scrivere su Shopify senza che ci sia stata prima una divergenza dichiarata.**

La prima nasce dal ciclo di riconciliazione osservato in produzione, che riprova da giorni senza risolvere e senza che nessuno lo sappia. La seconda impedisce che un processo di manutenzione diventi una sorgente di scritture non richieste.

### 6.4 — L'elenco dei sospesi

È l'unica parte **permanente** della sezione dedicata. Contiene cosa non è arrivato a destinazione — pubblicazioni fallite, righe esaurite dai tentativi, divergenze rilevate dal controllo periodico — con il tasto per rifare **quelle righe**, non tutto.

È la ragione per cui oggi i pulsanti massivi vengono premuti: l'operatore è il meccanismo di ripristino e l'unico strumento che ha è un martello che passa su quattrocento articoli per sistemarne tre.

---

## 7. La sezione dedicata nelle Impostazioni

### 7.1 — Il criterio: frequenza, non argomento

La sezione **non è un contenitore di tutte le sincronizzazioni**. Se lo fosse, i doppioni attuali — otto pulsanti per quattro operazioni — non si risolverebbero, si consacrerebbero.

Il criterio è la frequenza:

**Nella sezione sta quello che si fa una volta o quasi mai.**
**Nelle schermate resta quello che si fa lavorando**, dove l'operatore guarda il dato che sta per cambiare e dove vede l'esito.

### 7.2 — Cosa contiene

**In alto, dove si sta.** Negozio collegato, indirizzo dei webhook, topic attesi contro registrati, data dell'ultimo evento ricevuto, prezzi comprensivi sì o no, sedi collegate, aggiornamenti automatici.

**Il popolamento iniziale**, visibile solo se non è ancora stato fatto, con la scelta della direzione. Concluso, al suo posto resta il riepilogo — consultabile, non ripetibile.

**I sospesi**, permanenti.

### 7.3 — Cosa sparisce

L'intero blocco «Sync manuale da Shopify». Quattro dei suoi cinque pulsanti hanno oggi un gemello nella schermata di competenza: esistevano perché quelle schermate non c'erano.

«Ripristina connessione», nome di quando l'unico guasto possibile era la connessione.

Il chip sync in topbar come falso pulsante di sincronizzazione.

I tre «Riprova» che non contattano Shopify.

### 7.4 — Cosa resta e dove

Il **push del singolo prodotto**: unico modo di forzare una pubblicazione e unico posto dove l'esito si vede oggi.

La **casella per-prodotto**: decide se un articolo va online. Funziona; va spostata dalla posizione che il codice stesso dichiara temporanea.

Gli **aggiornamenti automatici** vengono sostituiti dall'interruttore del §4.10, che ferma entrambe le direzioni. L'attuale ne ferma una sola senza dirlo.

Le **operazioni ricorrenti nelle rispettive schermate**, con un vocabolario unico e la direzione dichiarata nel nome.

**Sincronizza sedi** come funzione, ma non deve più partire da sola all'apertura della pagina, e deve dichiarare che cancella.

---

## 8. Cosa resta aperto

**Le configurazioni multi-sede** (più sedi Shopify verso un magazzino, o viceversa) richiedono una regola di aggregazione o ripartizione dichiarata. Fuori dal flusso standard finché non serve a un cliente vero.

**La pausa dell'integrazione:** se gli eventi ricevuti durante la pausa vengono conservati e riprodotti, o se restano fuori e la ripresa richiede un nuovo allineamento. La seconda è più semplice e più onesta finché la conservazione non è collaudata.

**I webhook GDPR obbligatori** — oggi ricevuti e ignorati in silenzio. Sono un obbligo verso Shopify, non una funzione del gestionale: va deciso a parte.

**Il comportamento di «Importa catalogo» su costo e barrato** — vedi registro dei difetti 3.4.

**Cosa pubblica VestiFlow per un articolo con Codice IVA da definire.** Su un negozio a prezzi comprensivi il lordo si calcola solo conoscendo l'aliquota. L'articolo è già su Shopify con il suo prezzo, quindi non manca nulla al negozio; la domanda riguarda cosa succede quando VestiFlow dovrebbe ripubblicare quel prezzo. Non decisa: va affrontata insieme alla gestione complessiva degli articoli senza aliquota, e non prima.

**Il lucchetto sui processi periodici.** Se l'ambiente pubblicato gira su più di un'istanza, un processo periodico parte più volte in parallelo. In sola lettura è innocuo; sulla coda in uscita no. Da decidere quando si implementa il §6, non prima.

**Il riallineamento dopo la pausa** — vedi §4.10, ultimo paragrafo.

**Analisi già fatte, da riprendere senza rifarle.** Il passo 5 (errori che si accumulano, messaggio originale conservato, rifiuti registrati) e l'interruttore del §4.10 sono stati analizzati l'8 agosto. Del passo 5 restano fissate quattro decisioni: due tabelle separate, contatori invece di righe per i rifiuti che arrivano prima dell'autenticazione (l'endpoint è pubblico per costruzione e non gli si dà una leva sul database), `tenantId` nullabile sulla tabella dei rifiuti come deroga dichiarata alla regola multi-tenant, stato della connessione derivato invece che scritto, e potatura opportunistica in attesa dello scheduler.

La decisione centrale di quel passo non sono le tabelle: è che **«risolvere» diventi per-tipo e non globale.** Oggi l'errore di connessione viene azzerato in sei punti, tre dei quali sono il successo di un'operazione che cancella il fallimento di un'altra.

---

## 9. Ordine di implementazione

**Stato all'8 agosto 2026, fine giornata.** Punto Zero e punto Uno chiusi e committati sul ramo `feature/listini`, non ancora uniti né rilasciati. Il resto è fermo in attesa del merge, che si fa con il collega al suo rientro. Le due analisi già fatte — passo 5 e interruttore — sono scritte qui e non vanno rifatte.

L'ordine non è una preferenza: alcuni pezzi non si possono progettare finché non se ne conoscono altri.

**Zero — quello che si corregge subito.** Colonna Location sugli stati terminali, conferma e disabilitazione concorrente su «Disconnetti Shopify», tre stringhe e conferma su «Sincronizza giacenze».

_Era cinque voci, poi quattro, ora tre. Lo stato leggibile sull'ordine annullato è stato ritirato — funziona già. La registrazione di `orders/cancelled` è uscita perché non è una correzione di codice ma un'azione su Shopify, additiva, da eseguire dall'ambiente pubblicato: vedi registro 2.2-bis. La migration degli ordini fornitore è uscita perché si chiude rilasciando il ramo quando è pronto, e il rischio sui decimali è stato escluso per misura._

**Uno — la verità sullo stato** (punto 5). Poco lavoro, e senza di essa tutto il resto si appoggia su spie che mentono.

**Due — le regole di proprietà** (punto 2). Applicate a webhook e pulsanti insieme, perché sono la stessa operazione.

**Tre — lo scorporo corretto** (punto 4.4), con il controllo automatico. Chiude un difetto attivo ed è prerequisito del popolamento.

**Quattro — il popolamento iniziale**, direzione A prima, direzione B dopo.

**Cinque — scheduler e sospesi** (punto 6).

**Sei — la riorganizzazione della sezione** (punto 7). A questo punto è quasi solo rimozione: i pulsanti che non servono più cadono da soli.

---

## Appendice — Principi da non reinterpretare in fase di sviluppo

Queste scelte sono deliberate. Se durante l'implementazione sembrano sbagliate, vanno **segnalate come conflitto**, non corrette in silenzio.

**VestiFlow è la fonte di verità.** Shopify e gli altri canali sono costruiti attorno, non il contrario.

**Per ogni dato esiste un proprietario dichiarato.** Un messaggio di Shopify scrive solo i dati di cui Shopify è proprietario, anche quando ne possiede altri. Costo e prezzo barrato sono su Shopify e non sono suoi.

**Il saldo iniziale è `available`, non `on_hand` + impegnata.** Il compromesso è consapevole.

**Gli ordini precedenti non si importano mai.** Le eccezioni rare si risolvono con Rettifica manuale.

**I controlli sono avvisi, mai blocchi** — salvo dove una modifica sarebbe priva di senso.

**Il prezzo memorizzato è sempre netto**, a sei decimali. Il selettore netto/ivato è di visualizzazione e non tocca mai la memorizzazione.

**Non si cancellano movimenti a cascata.** Si disattiva conservando lo storico. Vale per le varianti, vale per la disconnessione del canale.

**Un'operazione di popolamento non resta accesa in permanenza.** È il difetto che ha generato metà di questo documento.

**Nessuna informazione importante dietro una priorità, nessuna lista dentro un segnale.**

Una catena di `if` non è sospetta di per sé: lo diventa **quando i rami possono essere veri insieme**. Da qui i tre casi:

- Su **stati mutuamente esclusivi** va bene: non possono coesistere, quindi nessuno nasconde l'altro.
- Su **fatti indipendenti** è un difetto: coesistono, e il primo copre gli altri proprio quando ce ne sono di più.
- Ciò che è **indipendente** si aggiunge a ogni ramo, non si mette in gara con essi.

E una banda è un segnale, dimensionata per un colpo d'occhio: appena contiene un elenco lungo smette di essere un segnale e diventa un documento che nessuno legge. Il dettaglio che cresce va in una struttura che regge la crescita — i fatti sempre visibili, e l'elenco dei sospesi del §6.4.

_Nasce da un difetto reale: il nome del topic mancante viveva solo dentro una banda che doveva prima vincere sulle altre segnalazioni, e con l'indirizzo sbagliato non compariva più da nessuna parte. Restava «7 su 8» — lo stesso numero muto che questo lavoro doveva togliere._
