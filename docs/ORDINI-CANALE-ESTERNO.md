# Ordini da canale esterno — perché non si modificano qui

Nato dal passo 5 del blocco documenti (`ORDINE-FORNITORE-RIGA.md`), dove la decisione di
partenza era: _il divieto sugli ordini Shopify diventa un avviso, coerente con la regola
«i controlli sono avvisi, mai blocchi»._

**Le verifiche hanno rovesciato quella decisione.** Il divieto resta. Quello che cambia è
che adesso si spiega, invece di manifestarsi come un errore tecnico a lavoro fatto.

Questo documento serve a chi trovasse la decisione vecchia e volesse riaprirla: le ragioni
sono qui, ed è più veloce leggerle che riscoprirle.

---

## Il principio

Un ordine arrivato da Shopify **non è un documento di VestiFlow**: è la registrazione di un
fatto avvenuto altrove. VestiFlow lo riceve, lo usa e lo rispetta, ma non lo riscrive.

Non è un ripiego in attesa di una fase 2. È la ragione per cui il divieto esiste, e regge
su quattro verifiche fatte sul codice.

## Le quattro ragioni, verificate

### 1. Il salvataggio riscriverebbe l'identità dell'ordine

In `manual-sales-orders.service.ts` l'oggetto `headerData` contiene `source:
SalesOrderSource.manual`, **e lo stesso oggetto serve sia alla create sia alla update**.
Salvare un ordine Shopify lo farebbe diventare manuale: sparirebbe dagli ordini di canale,
`externalRef` verrebbe sovrascritto dal campo della testata, e gli impegni sarebbero
risincronizzati con `channel: manual`. Non un errore visibile: una conversione silenziosa.

### 2. La modifica non sopravviverebbe comunque

Il tenant è iscritto al webhook `orders/updated`, e il sync fa `salesOrder.update` con i
dati Shopify (righe comprese, per id esterno). Alla prima modifica su Shopify di
quell'ordine, la testata locale viene riscritta.

Quindi la frase che la decisione originale voleva mostrare — _«la modifica resta solo in
VestiFlow»_ — sarebbe **falsa nel verso opposto**: non resta neanche in VestiFlow.

### 3. Su un ordine evaso, il registro fiscale smetterebbe di quadrare

E qui va tenuta una distinzione che è facile perdere: **i «corrispettivi» in VestiFlow sono
due cose diverse**.

|                                                                | Cos'è                                                  | Come si comporta                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| **Riepilogo per il commercialista** (`api/src/corrispettivi/`) | Aggrega i totali degli **ordini** per periodo e canale | **In diretta**: si ricalcola dall'ordine ogni volta               |
| **Registro COR-…** (`CorrispettivoEntry`)                      | Una voce per vendita online, creata all'evasione       | **Congelato**: copia i numeri alla nascita e non li ricalcola mai |

⚠️ **Aggiornamento del 14/08/2026: la seconda riga non descrive più il presente.** Il registro
`COR-…` **non nasce più**: dall'evasione è stata rimossa la scrittura, la sua maschera non è
più raggiungibile e la tabella è destinata a cadere in un rilascio distruttivo a sé
(specifica `08` §10). Ne resta **uno solo**, quello derivato, che dal 14/08 sottrae anche
resi e rimborsi alla loro data.

L'argomento di questa sezione **non cambia, si semplifica**: modificare un ordine evaso
sposta all'indietro un riepilogo che potrebbe essere già stato consegnato, e la copia in
⚠️ **Aggiornato il 16/08/2026: `CorrispettiviDelivery` non esiste più.** Il flusso «consegna
al commercialista» è stato ritirato — VestiFlow non tiene traccia di cosa è già stato mandato,
e l'operatore stampa o esporta un periodo quante volte vuole. Il ragionamento qui sotto resta
come cronaca: la sua metà sul registro congelato era già caduta prima.

Modificare un ordine evaso li romperebbe: il registro COR- resterebbe fermo mentre l'ordine
cambia, e il riepilogo si sposterebbe all'indietro.

⚠️ **La seconda metà di questo argomento è decaduta il 16/08/2026**, e va detto perché era
«l'argomento più forte che avevamo»: parlava della copia congelata in `CorrispettiviDelivery`
e dell'ordine marcato `delivered_to_accountant`. Non esistono più. Il divieto resta in piedi
sulla prima metà — il registro derivato e il riepilogo che divergono — che non dipendeva da
nessuna consegna.

### 4. La regola di progetto lo dice già

`regole-gestionale.md`, tabella OWNERSHIP DEI DATI: gli ordini di vendita online sono owned
da Shopify, «sempre read-only nel gestionale». La regola resta com'è: il codice e la
specifica adesso concordano.

---

## Cosa è stato fatto

### Il banner spiega, invece di dichiararsi

Diceva _«Le modifiche vanno gestite dal canale d'origine»_: corretto, e inutile — non dice
perché. Ora le frasi cambiano col canale e con lo stato di evasione.

**Ordine dal sito**, non ancora evaso:

- l'ordine arriva da Shopify, VestiFlow ne conserva la registrazione e non lo riscrive;
- per cambiarlo, si modifica su Shopify: al prossimo aggiornamento la modifica arriva qui;
- anche l'evasione la registra Shopify — quando l'ordine risulta evaso lì, VestiFlow crea
  la vendita online e scarica il magazzino.

**Ordine dal sito, già evaso**: al posto della terza frase, quella sul corrispettivo
registrato e sui totali del commercialista che si sposterebbero.

**Vendita da cassa (POS)**: un caso a parte, e sbagliarlo sarebbe stato lo stesso difetto
spostato altrove — **a uno scontrino non si può dire «modificalo su Shopify»**. Dice invece
che si corregge con un reso o un rimborso in cassa, e che quando quello arriva VestiFlow
**prepara** la rettifica del corrispettivo: non la emette.

#### Il dettaglio che è facile sbagliare

La frase sul corrispettivo è agganciata a **`fulfilledAt`**, non a `isSettledOrder()` che la
maschera usa altrove. L'evasione **parziale** non crea né vendita online né corrispettivo:
marca solo l'ordine come da verificare. Col segnale sbagliato il banner dichiarerebbe un
corrispettivo che non esiste. C'è un test che lo prova: sostituendo il segnale diventa
rosso.

### «Concludi ordine» sparisce sugli ordini da canale esterno

Non è una restrizione nuova — il server li rifiuta già in fondo alla strada
(`syncIncludedSalesOrdersTx`). Prima però ci si arrivava **dopo** aver lavorato:

- col **DDT** si compilava tutto e l'errore tecnico usciva al salvataggio;
- con la **Fattura accompagnatoria** il rifiuto veniva ingoiato dal frontend
  (`error: () => undefined`) e restava una fattura vuota, senza spiegazione.

Il secondo è il peggiore: l'operatore crede di aver fatto una cosa che non è avvenuta.

**Il doppio scarico non c'era.** Era il sospetto da cui è partita la verifica, ed è
infondato: la guardia del server tiene.

### L'eliminazione è rimasta com'era

Il pulsante è già nascosto sui non manuali e la selezione multipla li filtra. Non c'era
niente da ammorbidire, e permetterla non servirebbe: un ordine cancellato qui tornerebbe al
prossimo scarico, perché il sync fa upsert per `shopifyOrderId`.

---

## Gli ordini spariti da Shopify — fatto

La sincronizzazione ordini adesso se ne accorge. Sotto restano il perché delle scelte e le
guardie, che sono la parte da non smontare per distrazione.

### La precondizione — sciolta: il limite dei 60 giorni c'è

Verificato sulla documentazione Shopify (08/2026). **Di default un'app vede solo gli ordini
degli ultimi 60 giorni.** Per i più vecchi serve lo scope `read_all_orders`, che non si
aggiunge da soli: va **richiesto e approvato da Shopify** dal Partner Dashboard, motivando
l'uso. Noi chiediamo `read_orders` e basta.

Quindi **«assente dall'elenco» non significa «cancellato»: per tutto ciò che ha più di 60
giorni significa «fuori finestra»**, e una riconciliazione che cancellasse quello che non
vede farebbe sparire lo storico.

Le conseguenze per il lavoro, che ora sono decise e non più aperte:

- La riconciliazione **si applica solo agli ordini dentro i 60 giorni**. Fuori da lì
  l'assenza non è un'informazione, e va ignorata — non segnalata: una segnalazione falsa
  ripetuta su tutto lo storico è rumore che insegna a ignorare le segnalazioni vere.
- Dentro la finestra il segnale è affidabile, quindi **lì il rilascio degli impegni può
  essere immediato**: un ordine cancellato davvero non deve tenere merce bloccata.
- Se un giorno servisse coprire anche lo storico, la strada è chiedere `read_all_orders` —
  ed è una richiesta di approvazione, con tempi non nostri, non una riga di configurazione.

### Da dove arriva il segnale, e perché non serve un webhook

`orders/delete` **non è fra i webhook a cui siamo iscritti**, e la stringa non compare da
nessuna parte nel codice. Ma iscriversi non serviva: il pull (`listAllOrders`, `status=any`,
paginazione completa) **ha già in mano l'elenco remoto per intero**, e ci passava sopra in
un verso solo — aggiornava i remoti trovati, senza mai guardare i locali che non compaiono
più. Mancava il confronto, non il dato.

Il confronto va **in coda allo scarico ordini**, e l'esito compare nel messaggio del
pulsante «Sincronizza vendite da Shopify» — che sta nell'elenco vendite, cioè nel momento e
nel posto in cui l'operatore quel controllo se lo aspetta. Non esiste nessuno scheduler
nell'applicazione: la cadenza è quella con cui si sincronizza.

**L'annullamento è un'altra cosa e funzionava già**: `orders/cancelled` è iscritto e
`applyCancellationTx` scrive `cancelledAt` e rilascia gli impegni. Su Shopify annullare è
l'operazione normale, cancellare è più raro — il buco era reale ma stretto.

### Cosa fa, e cosa non fa

VestiFlow non cancella niente da solo. Scrive un'osservazione (`channelMissingSince`, una
data e non un flag: serve sapere da quando) e:

- **libera subito gli impegni** degli ordini **non evasi**, senza aspettare l'operatore.
  Merce riservata per un ordine che non esiste più è merce che non si può vendere, e dentro
  la finestra il segnale è affidabile;
- sugli ordini **già evasi** non tocca niente: gli impegni sono stati consumati
  all'evasione e la merce è uscita davvero — cancellare l'ordine sul canale non la riporta
  in magazzino. Resta la sola segnalazione, che serve perché è una situazione da guardare:
  quella vendita è entrata nei corrispettivi del periodo, e sul canale non risulta più;
- **toglie la segnalazione** se l'ordine ricompare. Una segnalazione rimasta accesa su un
  ordine tornato è falsa, e le false insegnano a ignorare anche le vere.

La rimozione resta una scelta dell'operatore, anche in selezione multipla.

### Le tre guardie — la parte da non smontare

Tutte contro lo stesso danno: **una segnalazione falsa libera impegni di ordini vivi**, cioè
fa vendere due volte la stessa merce. Non sono prudenza generica, sono tre scenari
concreti.

1. **Elenco remoto vuoto → non si conclude niente.** Da un elenco vuoto non si distingue
   «negozio senza ordini» da «la chiamata non ha portato nulla».
2. **Finestra più stretta di due giorni dei 60 dichiarati.** Fuori dai 60 Shopify non manda
   gli ordini, quindi l'assenza è il limite dell'API; il margine tiene fuori il bordo, che
   i due sistemi calcolano su orologi diversi. Si rinuncia a vedere le cancellazioni fra i
   58 e i 60 giorni — ordini che stanno comunque per uscire dalla finestra.
3. **Un'assenza di massa non si crede** (≥ 5 ordini e oltre il 20% dei candidati). Trovata
   provando a rompere la logica, e copre due scenari reali: `listAllOrders` chiude il ciclo
   su `page.orders ?? []`, quindi una pagina 2xx senza quella chiave **tronca l'elenco in
   silenzio**; e dopo un **cambio di negozio Shopify** gli ordini del negozio precedente non
   compaiono più. In entrambi i casi si segnalerebbero come cancellati centinaia di ordini
   vivi.

Una quarta, dalla stessa caccia: l'id locale può essere stato scritto come GID o come numero
nudo, e confrontarne una forma sola avrebbe fatto risultare sparito un ordine presente. Si
confrontano entrambe.

**Quando una guardia scatta, l'operatore lo sa.** Il controllo che non conclude lo dice nel
messaggio della sincronizzazione invece di restare nei log: il silenzio verrebbe letto come
«non è sparito niente», che è la conclusione opposta a quella giusta.

### Cosa è stato riusato invece di aggiungerci accanto

| Serviva                       | Si è usato                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Dire che l'ordine non c'è più | La colonna **«Stato sync»**, che esiste per dire come sta l'ordine rispetto al canale       |
| Rimuoverlo                    | L'**eliminazione a due conferme** e la selezione multipla già presenti, con l'avviso esteso |
| Trovarli tutti                | Un filtro sulla forma di `includable`, che era già lì                                       |
| Dire l'esito                  | Il **formattatore del messaggio** di sincronizzazione                                       |

L'unica cosa nuova è il campo, e serviva: la rimozione va abilitata su quel fatto preciso, e
gatearla sul testo di `reviewReason` sarebbe stato fragile.

La colonna «Stato» accanto è la chiave di lettura: **annullato e poi sparito** è la sequenza
normale e si rimuove senza pensarci; **confermato e sparito** è quella da guardare — lì
c'era merce impegnata.

### L'eccezione all'eliminazione, e perché è stretta

Gli ordini di canale non si eliminano: appartengono a Shopify, e cancellarli qui non
servirebbe — il prossimo scarico li riporterebbe, perché il sync fa upsert sull'id Shopify.

Il motivo cade **solo** quando sul canale non risultano più: lì non c'è più niente da cui
tornare. La guardia sulla Vendita online resta comunque in piedi, quindi **un ordine evaso
non si elimina** nemmeno se sparito.

### Rimuovere un ordine da VestiFlow non rimette mai merce in giacenza

### Rimuovere un ordine da VestiFlow non rimette mai merce in giacenza

Verificato, perché è la domanda che viene subito dopo. Oggi non si può — è bloccato tre
volte: bottone nascosto in UI, `source !== manual` lato API, e sugli ordini evasi anche la
guardia `onlineSale` più la foreign key in `Restrict`. Ma quando l'operatore potrà
rimuoverli, `delete()` fa **una cosa sola**: rilascia gli impegni **attivi** — `committed`
scende, `available` risale, e la nuova disponibilità viene spinta a Shopify.

**`onHand` non viene toccato, e nessun movimento viene creato o annullato.** Che è il
comportamento giusto in entrambi i casi:

- **ordine non evaso** → non era uscito niente, si libera solo la prenotazione;
- **ordine evaso** → gli impegni sono già consumati, quindi non c'è niente da rilasciare e
  lo scarico resta dov'è. La merce è uscita davvero, e cancellare un ordine non la riporta
  indietro.

### Se l'ordine evaso viene annullato su Shopify — verificato

Prima cosa, e cambia la domanda: **su Shopify un ordine già evaso non si annulla in un
gesto solo.** _«After an order is partially fulfilled, you can't cancel it directly. You can
cancel the fulfillment to make the order eligible for cancellation, or issue refunds and
manage returns.»_ Sono due strade, e portano segnali diversi.

I valori di `restock_type` sui rimborsi lo dicono con precisione: **`cancel`** = articoli
_non ancora evasi_; **`return`** = articoli _già consegnati che tornano indietro_. VestiFlow
genera un carico reale **solo** su `return` e `legacy_restock` (`emitRestockEvents`), e
ignora `cancel`. È già la scelta giusta.

- **Strada A — si annulla prima l'evasione, poi l'ordine.** Shopify rimette la giacenza.
  VestiFlow no: `fulfilledAt` resta valorizzato e non viene mai azzerato, quindi non ricrea
  impegni e non carica niente; vendita online, movimento e corrispettivo restano.
  **VestiFlow ha ragione, e i due divergono.**
- **Strada B — rimborso con reso.** `restock_type: return` → VestiFlow genera un carico
  vero. I due restano allineati, ed è corretto: lì il canale sta dichiarando un rientro
  fisico.

Nella strada A tocca alla riconciliazione rimettere Shopify in riga. **Lo fa** — e come, sta
nella sezione seguente.

---

## La riconciliazione dell'inventario: lo stesso meccanismo, due esiti opposti

Questa sezione tiene insieme due cose che sembravano separate — l'ordine evaso annullato su
Shopify e il buco della cassa — perché passano dallo stesso codice.

### La simmetria

Quando Shopify comunica una giacenza diversa dalla nostra e la differenza non è
giustificata, si finisce nel **«Caso D»**: VestiFlow resta fonte di verità e **ripubblica il
proprio valore** sul canale.

> **Lo stesso meccanismo corregge Shopify quando VestiFlow ha ragione, e propaga l'errore
> quando ha torto. A decidere quale dei due, è solo se il movimento di magazzino è stato
> scritto.**

| Situazione                                    | Movimento scritto?  | Chi ha ragione | Cosa fa il Caso D                                |
| --------------------------------------------- | ------------------- | -------------- | ------------------------------------------------ |
| Ordine evaso, annullato su Shopify (strada A) | ✅ sì, allo scarico | VestiFlow      | **Corregge**: Shopify torna al valore giusto     |
| Vendita dalla cassa Shopify                   | ❌ **no**           | Shopify        | **Propaga**: rimanda al canale il valore stantio |

Il Caso D si raggiunge direttamente in entrambi i casi: il «Caso C», che rimanda la
decisione, scatta solo quando l'osservato è _minore_ dell'atteso e ci sono impegni Shopify
attivi — condizione che nello scenario dell'annullamento non si presenta nemmeno.

### Cosa vuol dire per il buco del POS

**Che raddoppia il danno da solo.** Non è solo «VestiFlow non scarica»: non scarica, e poi
la riconciliazione **fa risalire la giacenza anche sul canale**, cancellando il calo che la
cassa aveva fatto correttamente. Un errore che nasce locale e si propaga.

Ed è anche il motivo per cui il buco del POS **non si può considerare un problema
sopportabile in attesa di tempo**: finché c'è, il Caso D — che è un meccanismo di difesa —
lavora contro.

### La fragilità — sistemata, tranne una parte

Il Caso D funzionava ma **non teneva**. Tre difetti; due chiusi, uno resta una scelta di
progetto.

**Chiusi.** La coda delle ripubblicazioni rimaste in sospeso ora si svuota **in coda allo
scarico inventario**, che l'operatore già lancia — stessa forma della riconciliazione
ordini, un servizio suo chiamato in coda al pull, che se fallisce non porta giù
l'importazione. E l'esito **arriva all'operatore** nel messaggio della sincronizzazione: se
qualcosa resta disallineato il tono non è di successo. Era questo il difetto vero —
l'informazione c'era e non usciva da nessuna parte.

Due dettagli che valgono più di quanto sembri:

- **tetto di 50 per passata**, perché l'Admin API è a quota e una coda lunga svuotata tutta
  insieme se la mangia, penalizzando le sincronizzazioni che l'operatore sta aspettando. I
  più vecchi per primi: una coda svuotata dal fondo lascia indietro sempre le stesse righe.
  E **quanti restano viene detto** — un tetto silenzioso si legge come «ho finito»;
- **non serve spegnere il flag a mano**: la ripubblicazione riuscita torna indietro come
  webhook, la riconciliazione la riconosce come eco del proprio push (Caso B) e lo spegne
  lei.

**Resta aperto: il ritentativo automatico.** Oggi si riprova quando l'operatore
sincronizza, non da solo. Per farlo da solo servirebbe uno scheduler, e
**nell'applicazione non ce n'è nessuno** — nessun `@Cron`, nessun `@Interval`, nessuno
`ScheduleModule`. Introdurlo è una decisione di progetto (dipendenza nuova, pattern nuovo,
e la domanda «dove gira in produzione»), non una correzione da fare di passaggio.

### Com'era prima — per capire cosa si è chiuso

1. **Un tentativo solo.** La ripubblicazione era un `pushLevel` fire-and-forget: se falliva,
   un warning nel log e finiva lì.
2. **Il segnale non lo leggeva nessuno.** `mismatchDetected` veniva alzato con una nota che
   spiegava la differenza, ma le uniche occorrenze del campo nel backend erano dentro il
   servizio stesso, che lo scriveva e lo cancellava. Nessuna schermata, nessun report.
3. **Nessuno riprovava.** Nessun job, da nessuna parte.

Un solo tentativo, e se andava male la divergenza restava **per sempre e in silenzio**, con
un flag acceso nel database che nessuno avrebbe guardato.

Da non confondere col buco del POS, che è un'altra cosa: **quello è un movimento che manca,
questo era un meccanismo di recupero senza memoria né voce.**

---

## Nota: la rettifica di un corrispettivo sbagliato

Quando i numeri arrivati dal canale sono sbagliati — per esempio un'aliquota che Shopify ha
applicato diversa da quella dell'articolo — **la correzione si fa sul corrispettivo, non
sull'ordine**.

Due ragioni, e la seconda è la più importante:

1. È l'unico posto dove la correzione **sopravvive**: il corrispettivo è un documento
   nostro e la sincronizzazione non ci arriva. La strada esiste già —
   `corrispettivo-register.service.ts` espone stato, data fiscale, esclusione e nota.
2. L'ordine registra **quello che è successo davvero**. Correggerlo significherebbe
   riscrivere un fatto.

Resta da valutare se serva una traccia esplicita di cos'era e cos'è diventato. Non deciso.

## ⚠️ Per chi lavora sulla cassa: le vendite dalla cassa Shopify NON scaricano il magazzino

Emerso rispondendo a «se il negoziante ha la cassa Shopify, quelle vendite arrivano qui e
sono gestite?». **Arrivano, generano Vendita online e corrispettivo, ma non toccano la
giacenza — e la riconciliazione rimanda su Shopify la giacenza vecchia.** Verificato sul
codice e sulla documentazione Shopify (08/2026). **Non corretto**: tocca il lavoro sulla
cassa, e va deciso lì.

### Quello che è certo, perché sta nel codice

VestiFlow **distingue** la cassa dal sito: `source_name === 'pos'` → `shopify_pos`, e la
location arriva da `order.location_id` mappato sulla sede (con fallback alla prima sede
licenziata attiva). Per il POS crea la Vendita online e **anche la voce COR-**: la creazione
del corrispettivo non è condizionata al canale.

Ma lo scarico di magazzino passa **solo per il consumo di un impegno**. In
`createFromFulfilledOrderTx`, una riga senza impegno viene saltata:

> `if (!reservation) { /* nessuno scarico silenzioso */ continue; }`

e gli impegni si creano **solo su un ordine ancora da evadere**: `applyOrderUpsertTx` esce
subito se `fulfillmentStatus !== unfulfilled`.

Quindi la catena, per un ordine che arriva **già evaso**, è: nessun impegno → nessun
consumo → **nessun movimento e nessuna giacenza scalata**. La Vendita online resta a
`inventoryStatus: not_applied`, e l'ordine **non viene nemmeno marcato da verificare**:
`requiresReview` si accende solo sullo scarico _parziale_, non su quello mancato del tutto.

E il webhook dell'inventario non rimedia, anzi: `inventory_levels/update` **non scrive la
giacenza di VestiFlow**. La riconciliazione tratta VestiFlow come fonte di verità — «Caso D»
— e **ripubblica su Shopify il proprio valore**, sovrascrivendo il calo fatto dalla cassa.

### Come arrivano davvero gli ordini POS — verificato su Shopify

Shopify ha un'impostazione **«Mark as fulfilled»** nelle preferenze di evasione della cassa,
e la sua stessa guida la raccomanda proprio al nostro caso: _«se i clienti portano via i
loro acquisti quando escono, è più semplice segnare automaticamente gli ordini come
evasi»_. Con quella attiva, la vendita al banco nasce **già evasa**.

Le tre configurazioni, e come le tratta VestiFlow:

| Vendita alla cassa                                                      | Stato all'arrivo         | Cosa fa VestiFlow                                        |
| ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------- |
| Merce portata via, «Mark as fulfilled» **attivo** — il caso del negozio | `fulfilled` subito       | **Nessuno scarico.** E nessuna segnalazione              |
| Misto: una parte portata via, una spedita                               | `partial` subito         | **Nessuno scarico**, ma l'ordine è marcato da verificare |
| «Mark as fulfilled» **spento**, o solo spedizione dal negozio           | `unfulfilled`, poi evaso | Corretto: impegni creati e poi consumati                 |

Quindi **funziona solo nella configurazione che un negozio con un banco non userebbe.**
L'unico dato che la documentazione Shopify non dichiara è il valore _predefinito_ di quel
toggle: è una scelta del negoziante. Ma la riga da guardare è la prima, ed è quella che
descrive un negozio di abbigliamento.

Nota la beffa: il caso **totalmente** mancato (`not_applied`) è l'unico che **non** viene
segnalato, mentre quello parziale sì. `requiresReview` si accende solo su
`partially_unloaded`.

### E la riconciliazione rimanda indietro la giacenza vecchia

Non è che VestiFlow «non se ne accorge»: **sovrascrive**.

Dopo la vendita al banco Shopify scala la propria giacenza (10 → 9) e manda
`inventory_levels/update`. VestiFlow non ha fatto nessun movimento, quindi il suo
pubblicabile è ancora 10. Osservato 9 < atteso 10, e non c'è nessun impegno Shopify attivo
su quella variante e sede — perché non è mai stato creato. Si finisce nel **«Caso D»**:
disallineamento non giustificato, **VestiFlow resta fonte di verità** e programma la
**ripubblicazione** del proprio 10 su Shopify.

Il calo fatto dalla cassa viene quindi annullato **anche su Shopify**. L'errore non resta
locale: si propaga al canale.

L'unica cosa che lo trattiene è il «Caso C»: se su quella variante e sede esistono altri
impegni Shopify attivi (per esempio da ordini online in corso), la riconciliazione viene
**differita** invece di ripubblicare. È un rinvio, non una soluzione — la giacenza resta
comunque sbagliata da entrambe le parti.

**Il buco raddoppia quindi il danno da solo**: non scarica, e poi fa risalire la giacenza
anche sul canale. E non è un difetto del Caso D — lo stesso meccanismo, quando il movimento
c'è, **corregge** Shopify invece di sporcarlo. Vedi «La riconciliazione dell'inventario: lo
stesso meccanismo, due esiti opposti», che è la sezione dove le due facce stanno insieme.

### Perché il meccanismo è fatto così

Non è una svista: il commento parla di «ordine storico/anomalia». Per l'importazione in
blocco di ordini passati, non scaricare è la scelta giusta — quella merce è uscita mesi fa e
riscalarla falserebbe le giacenze di oggi. Il problema è che **per la cassa quel ramo non è
l'eccezione, è la normalità**: ogni scontrino nasce già evaso.

### Dove sta la correzione — verificato

I campi che distinguono un ordine POS (`source_name`, `location_id`, `device_id`,
`processing_method`) VestiFlow li legge già, ma **non rispondono alla domanda che conta**:
un ordine che arriva già evaso è una vendita di adesso o un'importazione di storia?

Il segnale utile non è nel contenuto dell'ordine, è **nella strada da cui arriva**. Un
webhook `orders/create` è un fatto appena avvenuto, in tempo reale, uno per volta. Uno
scarico in blocco è storia.

**Verificato: oggi le due strade sono indistinguibili.** Convergono su un'unica funzione,
con una firma che non porta nessuna provenienza:

```
webhook  →  handleWebhook  ─┐
                            ├─→  applyOrderFromShopify(tenantId, order)  →  …  →  if (!reservation) continue
pull     →  pullOrders     ─┘
```

`applyOrderFromShopify` prende `tenantId` e il payload grezzo, e basta. Da lì in giù il
codice è identico per entrambe: stesso evento, stesso `OnlineOrderEventInput` — che non ha
un campo per la provenienza — stesso ramo che salta lo scarico.

**Quindi il ramo che salta lo scarico è lo stesso per le due strade, ed è lì la
correzione.** La provenienza deve viaggiare dal chiamante fino a quel punto, dove «nessun
impegno da consumare» smetterebbe di avere un solo significato:

- arrivato da **webhook** → è una vendita appena avvenuta: si scarica davvero;
- arrivato da **scarico in blocco** → è storia: si salta, come oggi.

La forma è la più sicura possibile, perché è **additiva**: il comportamento storico resta il
default, e solo la strada in tempo reale guadagna lo scarico.

Una rassicurazione utile, già verificata: un ordine importato come storico che venisse poi
modificato su Shopify **non** verrebbe scaricato in ritardo. L'evento `fulfilled` non porta
un suffisso di dedupe, quindi la sua chiave è stabile e la seconda occorrenza viene
riconosciuta come duplicata e ignorata.

### La domanda da portare al collega che lavora sulla cassa

> **Quando la merce esce dal negozio, chi scrive il movimento?**

Lui l'ha appena risposto per la cassa VestiFlow. Per la cassa Shopify oggi la risposta è
«nessuno». Le due risposte devono stare nella stessa frase.

|                     | Percorso                    | Movimento di magazzino | Voce COR-                                       |
| ------------------- | --------------------------- | ---------------------- | ----------------------------------------------- |
| **Cassa VestiFlow** | Documento VN                | ✅ sì                  | ✅ ora sì (`store-corrispettivo-entry.util.ts`) |
| **Cassa Shopify**   | SalesOrder → Vendita online | ❌ **no**              | ✅ sì                                           |

Due casse, due strade, **entrambe scrivono nello stesso registro fiscale e solo una scarica
il magazzino**. Non è un conflitto di file — i due rami si fondono puliti e non condividono
nemmeno una riga in quella zona — è una decisione di disegno che va presa una volta per
tutte e due, altrimenti fra un mese ci sono due meccanismi che fanno la stessa cosa in due
modi diversi. Che è il problema da cui è nato tutto il lavoro sul blocco documenti.

### Il resto, che invece è a posto

⚠️ **Riscritto il 16/08/2026, ed è la seconda correzione in poche ore.** Qui si è detto
prima che le vendite POS erano «escluse dalla consegna al commercialista», poi che il
valore `excluded_pos_register` «non escludeva niente». Entrambe le frasi partivano
dall'idea che il POS andasse tolto dal Registro. **La decisione è l'opposta:**

> **Shopify POS compare nel Registro Corrispettivi, classificato come vendita
> fisica/POS.** Che la cassa o un RT esterno la certifichi non la fa sparire dal quadro
> economico interno — la classifica.

Il valore `excluded_pos_register` e tutto `SalesOrderFiscalStatus` **non esistono più**:
l'ambito si legge da `sales_orders.source`, che è un fatto. Specifica corrente:
`10-specifica-registro-corrispettivi.md` §4.

⚠️ **Misurato il 16/08/2026, e non è come la frase qui sopra diceva.** Diceva che le POS sono
«escluse dalla consegna al commercialista» e che solo `shopify_online` entra nel conteggio:
il conteggio non esiste più, ma soprattutto **quel valore non esclude niente**. Nessuna query
del registro lo legge come regola — è una classificazione scritta dalla sync e mostrata come
etichetta. Sopravvive per questo, non per un effetto che non ha.

### Un vincolo che vive solo in un commento

Il ramo della cassa aggiunge `store` all'enum `SalesOrderSource`, con questo contratto:

> `/// Cassa VestiFlow (vendita al banco): usato SOLO come canale dei corrispettivi, mai
come sorgente di un SalesOrder.`

Il contratto è giusto, ma **non lo protegge niente**: né il tipo — `store` è un valore
legittimo del campo `source` di `SalesOrder` — né un test, né un vincolo del database.

E se qualcuno lo violasse, il primo posto a mentire sarebbe il banner appena scritto:
`isExternalOrder()` è `source !== manual`, quindi un ordine con origine `store` finirebbe
nel ramo «esterno» e verrebbe presentato all'operatore come **«questo ordine arriva da
Shopify»**, con l'invito a modificarlo là. Una vendita del banco, mandata su Shopify.

Oggi non succede — nessuno crea SalesOrder con quell'origine. Ma un contratto scritto in un
commento è un contratto che regge finché qualcuno lo legge.

---

## I fallimenti silenziosi — chiusi

Nati dal caso della Fattura accompagnatoria, dove il rifiuto del server veniva ingoiato e
restava una fattura vuota. Cercati in tutto il frontend: erano **28** gli
`error: () => undefined`, ma non tutti uguali.

**Famiglia pericolosa — il precompilato da parametro di rotta: 10 punti, chiusi.**
L'operatore preme «Genera documento», «Concludi ordine» o «Duplica», atterra su una maschera
nuova, e se la precompilazione fallisce si ritrova **una maschera vuota indistinguibile da
un documento nuovo legittimo**. Crede di aver fatto una cosa che non è avvenuta, e se salva
crea il documento sbagliato. Riguardava `convertPrefill`, `concludeManualPrefill`,
`getDocumentById(duplicateFrom / fromDocument)`, `getSalesOrderById(includeOrder)` e
`applyDuplicatePrefill`, in tutte e sei le maschere documento.

**Famiglia innocua — lasciata com'è.** `getPriceModePreference` e i contatori documento
(`available()`): il fallimento produce un default sensato, non una schermata falsa. Un
avviso lì sarebbe rumore.

### Il messaggio dice la conseguenza, non l'errore

«Si è verificato un errore» non aggiunge niente a una maschera vuota, che l'operatore vede
già. Quello che non può sapere è **cosa creerebbe salvando lo stesso**, e quello dice il
messaggio — tre origini, tre conseguenze:

| Da dove veniva                   | Cosa dice                                                              |
| -------------------------------- | ---------------------------------------------------------------------- |
| `fromDocument` (conversione)     | «salvando adesso creeresti un documento nuovo, **non la conversione**» |
| `includeOrder` (concludi ordine) | «un documento che **non conclude nessun ordine**»                      |
| `duplicateFrom` (duplica)        | «un documento nuovo, **non la copia**»                                 |

### Cosa è stato riusato

Il testo e la transizione stanno in un `DocumentPrefillErrorStore`, sulla forma di
`DocumentNumberConflictStore`: una classe semplice istanziata per componente
(`new ...Store()`), non un service — non ha dipendenze e ogni maschera ne vuole una sua.
L'avviso è **`app-inline-banner`**, il componente unico che `regole-stile-ui` prevede per
gli errori in linea; con `tone="error"` è quella stessa regola a scegliere il ruolo ARIA.
