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

Modificare un ordine evaso li romperebbe in due modi opposti: il registro COR- resterebbe
fermo mentre l'ordine cambia, e il riepilogo si sposterebbe all'indietro. Se quel periodo
era già stato consegnato, la copia congelata in `CorrispettiviDelivery` resta com'era, il
riepilogo ne mostra altri, e l'ordine è marcato `delivered_to_accountant` — quindi **niente
segnala la differenza**.

> **Il divieto non protegge solo un registro interno: protegge i numeri già consegnati al
> commercialista.** È l'argomento più forte che abbiamo.

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

## Da fare: gli ordini spariti da Shopify

Lavoro a sé, non ancora aperto.

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

### Cosa succede oggi

- `orders/delete` **non è fra i webhook a cui siamo iscritti** (`shopify-webhook-topics.ts`),
  e la stringa non compare da nessuna parte nel codice. Un ordine cancellato su Shopify
  resta qui per sempre.
- Il pull (`listAllOrders`, `status=any`, paginazione completa) **ha già in mano l'elenco
  completo degli ordini remoti**, ma ci passa sopra in un verso solo: cicla sui remoti e fa
  upsert, non guarda mai i locali che non compaiono più. La riconciliazione non richiede
  quindi né un webhook nuovo né uno scope nuovo — richiede solo il confronto che manca.
- **L'annullamento invece funziona**: `orders/cancelled` è iscritto e `applyCancellationTx`
  scrive `cancelledAt` e rilascia gli impegni. Su Shopify annullare è l'operazione normale,
  cancellare è più raro — quindi il buco è reale ma stretto.

### Il comportamento voluto

VestiFlow non cancella niente da solo. Quando scopre che un ordine non risulta più su
Shopify:

- **segnala** sull'ordine che non risulta più. È un'informazione, non un'azione.
- **lascia all'operatore** la decisione se rimuoverlo, anche in selezione multipla.
- se l'ordine è **già evaso** — c'è una vendita online e un corrispettivo — nessuna
  rimozione è possibile: la merce è uscita davvero e il registro fiscale esiste. Solo
  segnalazione. (Il database si opporrebbe comunque: la FK è `onDelete: Restrict`.)

**Sul rilascio degli impegni: dipende dalla precondizione.** Se l'ordine è stato cancellato
davvero, l'impegno non ha più senso e la merce va liberata subito — tenerla bloccata per un
ordine che non esiste significa non poterla vendere. Ma se l'unico segnale è «non compare
più nell'elenco», quello non basta: potrebbe essere fuori finestra, e liberare gli impegni
di un ordine vivo significa venderne la merce due volte. **Prima si stabilisce se il segnale
è affidabile, poi si decide il rilascio.**

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

### Perché il meccanismo è fatto così

Non è una svista: il commento parla di «ordine storico/anomalia». Per l'importazione in
blocco di ordini passati, non scaricare è la scelta giusta — quella merce è uscita mesi fa e
riscalarla falserebbe le giacenze di oggi. Il problema è che **per la cassa quel ramo non è
l'eccezione, è la normalità**: ogni scontrino nasce già evaso.

### Il resto, che invece è a posto

Le vendite POS sono **escluse dalla consegna al commercialista**: prendono
`fiscalStatus: excluded_pos_register`, e solo `shopify_online` entra nel conteggio dei
documenti da consegnare. A registrarle fiscalmente è la cassa. Questo è coerente e voluto.

---

## Rimasto sul tavolo: i fallimenti silenziosi

Cercati su richiesta, **elencati e non corretti**: la decisione è da prendere insieme.

Sono 28 gli `error: () => undefined` nel frontend, ma non sono tutti uguali. Si dividono in
due famiglie, e solo una è come il caso della Fattura accompagnatoria.

**Famiglia pericolosa — il precompilato da query param (≈10 punti).** L'operatore ha
premuto «Genera documento», «Concludi ordine» o «Duplica», è atterrato su una maschera
nuova, e se la chiamata di precompilazione fallisce si ritrova **una maschera vuota che
sembra un documento nuovo legittimo**. Nessun errore, nessuna spiegazione. Riguarda
`convertPrefill`, `concludeManualPrefill`, `getDocumentById(duplicateFrom / fromDocument)`,
`getSalesOrderById(includeOrder)` e `applyDuplicatePrefill`, in `sales-document-form`,
`customer-order-form`, `goods-receipt-form`, `purchase-invoice-form`, `stock-operation-form`
e `transfer-form`.

**Famiglia innocua.** `getPriceModePreference` e i contatori documento (`available()`): il
fallimento produce un default sensato, non una schermata falsa.

Il punto della Fattura accompagnatoria è chiuso dalla sparizione di «Concludi ordine», ma
solo per quella strada: la famiglia resta.
