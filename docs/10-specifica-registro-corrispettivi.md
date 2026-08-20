# 10 · Specifica — Struttura Vendite e Registro Corrispettivi

**Fonte:** nota funzionale del proprietario del progetto, 16/08/2026, più il censimento della
verticale legacy del 17/08 (§11). Questo file è la **specifica corrente** del Registro
Corrispettivi: in caso di conflitto con testi precedenti (`08`, `ORDINI-CANALE-ESTERNO`, guide)
vale questo.

---

## §1 · Principio

> **Il Registro Corrispettivi non è direttamente editabile e non esiste un Documento
> Corrispettivo.** Le vendite e le rettifiche note a VestiFlow confluiscono nel Registro dalle
> proprie sorgenti canoniche. È inoltre prevista una sorgente autonoma **«Corrispettivo
> manuale»**, esclusivamente economica e senza effetti di magazzino, per registrare importi non
> ricostruibili dalle sorgenti gestionali.

⚠️ **Formulazione corretta il 17/08/2026.** Qui c'era scritto che il Registro è «la vista
economica generale **derivata**», e quell'assoluto è diventato falso nel momento in cui si è
deciso il Corrispettivo manuale (§12): una registrazione digitata dall'operatore **è** un
record proprio, e nessuna derivazione la produce.

**Ciò che non cambia è il divieto vero**: il Registro non si corregge riga per riga, e non
esiste un tipo documento «Corrispettivo». Una riga entra o perché una sorgente viva l'ha
prodotta, o perché qualcuno ha registrato un importo che nessuna sorgente poteva produrre — e
in quel caso lo si vede, perché l'origine lo dice.

L'operatore vede il quadro completo e ottiene i sottoinsiemi con i **filtri**, non con archivi
o flussi paralleli. È lo stesso criterio già in uso nell'area Ordini:

| Livello             | Esempio                                             |
| ------------------- | --------------------------------------------------- |
| archivio generale   | **Ordini cliente**                                  |
| vista specializzata | **Vendite online**, **Ordini Shopify**              |
| registro economico  | **Corrispettivi** — generale, con filtri per ambito |

`Vendite online` e `Ordini Shopify` restano viste specializzate: **non** sono archivi economici
alternativi al Registro.

---

## §2 · Cosa contiene

Senza filtri, il Registro rappresenta **tutte** le vendite e le rettifiche economicamente
rilevanti, **mantenendo l'origine dell'evento**: vendite negozio VestiFlow, Shopify POS
(fisico), Shopify ecommerce, canali futuri (es. TikTok Shop), resi, rimborsi e rettifiche.

### La regola che evita l'errore più facile

> **Visibilità nel registro ≠ partecipazione a uno specifico totale o export.**

Una vendita può restare **consultabile** nel quadro generale ed essere **esclusa** da un
determinato riepilogo, in base alla regola economica o al filtro applicato.

Che una vendita fisica sia già certificata da una cassa o da un RT esterno **non significa che
debba sparire** dal quadro economico interno: deve restare visibile **una volta sola** e
correttamente classificata.

**Il doppio conteggio esiste solo se la stessa transazione è rappresentata due volte dentro
VestiFlow.** La certificazione esterna non è una seconda rappresentazione.

---

## §3 · Filtri

Il Registro non crea archivi separati per canale. I sottoinsiemi si ottengono con:

| Filtro           | Forma          | Valori                                                                            |
| ---------------- | -------------- | --------------------------------------------------------------------------------- |
| **Periodo**      | scelta singola | preset, giornata singola, intervallo personalizzato                               |
| **Origine**      | **insieme**    | Shopify online · Shopify POS · Vendita al banco · Corrispettivo manuale           |
| **Tipo evento**  | **insieme**    | Vendite · Resi · Rimborsi — ⚠️ **Resi e Rimborsi restano disgiunti**, vedi §18    |
| **Sede**         | **insieme**    | le sedi consultabili                                                              |
| **Raggruppa**    | scelta singola | Nessuno · Giorno                                                                  |
| **Fatturazione** | —              | fatturato / non fatturato — **mai** come flusso di consegna. Resta fuori, vedi §7 |

L'operatore inesperto entra e vede il quadro generale. Chi sa cosa cerca sceglie periodo e
filtri, poi stampa o esporta **quel** sottoinsieme.

⚠️ **Qui c'erano «Ambito» e «Canale» come dimensioni autonome, e non lo sono più.** La
descrizione è superata dal §16: con Origine a insieme le due erano ridondanti — e potevano
**contraddirsi**, producendo zero righe senza spiegare perché. «Canale» è uscito dalla barra il
17/08; «Ambito» il 18/08, e vive ora come **scorciatoia** dentro il menu Origine.

Restano nel modello e nell'API — un collegamento salvato con `ambito=online` continua a
funzionare — ma **la nuova interfaccia non li scrive più**: l'unica verità del filtro è
l'insieme `origini[]`.

---

## §4 · Shopify POS

> **Shopify POS compare nel Registro generale, classificato come vendita fisica/POS.**

Non è escluso in assoluto. Se un riepilogo deve contenere il solo ecommerce, è **il filtro o la
regola del riepilogo** a escludere il fisico — non un'etichetta sulla vendita.

Il dato che la classifica è la sua **origine** (`sales_orders.source`), che è un **fatto**
scritto alla creazione, non uno stato da ricordarsi di aggiornare:

| `source`         | Ambito     |
| ---------------- | ---------- |
| `shopify_online` | Online     |
| `shopify_pos`    | Fisico/POS |
| `store`          | Fisico/POS |
| `manual`         | —          |

⚠️ **Questa è una CLASSIFICAZIONE, non un filtro.** «Ambito» resta un modo di descrivere
un'origine — utile a raggrupparle e a nominare le scorciatoie — ma dal 18/08/2026 non è più una
dimensione autonoma della barra filtri: l'unica verità è l'insieme delle origini (§17).

### La duplicazione: verificata il 16/08, non c'è

Un ordine Shopify POS importato **non** genera anche una Vendita negozio VestiFlow. Le vendite
negozio nascono **solo** da `POST /store-sales`, un gesto esplicito dell'operatore alla cassa;
la sync Shopify crea un `SalesOrder` e basta. **Una transazione, una rappresentazione.**

⚠️ Se un giorno le rappresentazioni diventassero due, si corregge **la duplicazione alla causa
radice** — non si esclude indiscriminatamente tutto Shopify POS.

---

## §5 · Nessun flusso «commercialista»

> **VestiFlow non sa se i Corrispettivi sono stati inviati, consegnati o registrati dal
> commercialista.**

Il ciclo è: **periodo → filtri → stampa/CSV/export → fine.**

Quindi **nessuno** stato «da inviare», «inviato», «consegnato», «registrato esternamente»;
nessuno storico consegne; stampa ed export **non modificano stati né classificazioni**; lo
stesso periodo si esporta quante volte serve.

Il Registro è un **registro economico interno derivato**, non un documento gestionale
modificabile.

_Attuato il 16/08: rimossi `markDelivered`, lo storico consegne, il pannello, il filtro «solo da
consegnare», e le colonne «Stato fiscale» e «Data consegna commercialista» dall'export._

---

## §6 · `SalesOrderFiscalStatus` — rimosso

Il modello `sales_orders.fiscal_status` è stato **eliminato per intero** il 16/08/2026, colonna
e tipo PostgreSQL. Non è stato sostituito da nessun enum.

| Valore                    | Perché è caduto                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `delivered_to_accountant` | flusso commercialista, ritirato (§5)                                                           |
| `externally_registered`   | idem — **da non confondere** con l'omonimo di `DocumentStatus`                                 |
| `pending_registration`    | era il «non ancora consegnato»: senza il flusso, un default che non cambia mai                 |
| `excluded_pos_register`   | esprimeva l'esclusione del POS: **la decisione è l'opposta** (§4), e non era mai stato scritto |
| `invoiced`                | nessun producer, mai                                                                           |

**Nessun dato perso:** tutte e 37 le vendite portavano `pending_registration`, il default.

> **Le regole di inclusione, classificazione ed esclusione derivano da dati canonici e
> verificabili** — origine, canale, ambito, tipo evento, relazione reale con un documento
> fiscale — **non da un secondo flusso fiscale parallelo sulla vendita.**

---

## §7 · `CorrispettivoEntry` non è la sorgente

⚠️ **Correzione di una premessa sbagliata**, affermata due volte il 15 e 16/08 e smentita dal
censimento.

`CorrispettivoEntry` / `corrispettivo_entries` **non è la sorgente canonica del Registro**. Il
Registro attuale è **derivato direttamente dalle sorgenti vive**; quella tabella **non viene più
scritta da nessuno** dall'11/08 (`08` §10), e le sue righe residue — 6, al 16/08 — sono storia.

**Non si deduce la logica nuova da quelle righe.** In particolare non va più detto che
l'esclusione dei fatturati «vive» in `CorrispettivoEntry.excludedFromSummary`: era vero quando
la tabella si scriveva, non lo è ora.

> **Le esclusioni dai riepiloghi si determinano dalle sorgenti e dalle relazioni canoniche vive
> nel sistema, non da stati o tabelle storiche non più alimentate.**

### Conseguenza aperta, misurata e non chiusa

Oggi **nessuna esclusione è implementata**: il Registro seleziona le vendite evase e non guarda
né origine né documenti fiscali. Le due che serviranno:

1. **fatturato** — una vendita già fatturata non deve rientrare nei totali dove produrrebbe
   doppio conteggio: va determinata dalla **relazione reale col documento**;
2. ⚠️ **CORRETTO il 18/08/2026, misurato.** Qui c’era scritto che le vendite al banco «non
   entrano affatto» nel Registro e che «il Registro aggrega solo» gli ordini. **Erano vere
   fino al 16/08 e oggi sono false:** il Registro ha una terza sorgente dedicata che
   seleziona i `Document` di tipo `store_sale`, usata in tre punti del servizio — elenco,
   riepilogo e ripartizione per sede.

   ⚠️ **E dal 19/08 le sorgenti documentali sono DUE**: `store_return` è entrata come
   quinta sorgente del Registro, autonoma e col verso opposto. Vedi **§18**.

   Cade con esse anche la biforcazione che questo punto lasciava aperta («decide il
   risultato e lascia aperto il meccanismo»): la Vendita al banco **è già un `Document`**,
   creato in transazione con i propri movimenti. Non c’è nessuna scelta fra crearle un
   ordine e fare del Registro un’unione, e la domanda non va riaperta — vedi
   **`11-specifica-vendita-al-banco.md`, B1 e A9**.

Entrambe cambiano **cosa il Registro mostra**: sono lavoro proprio, non rifinitura.

---

## §8 · UI

| Prima                                    | Ora                                             |
| ---------------------------------------- | ----------------------------------------------- |
| «Corrispettivi commercialista»           | **«Corrispettivi»** (schermata e stampa)        |
| sottotitolo su «vendite online Shopify»  | quadro economico di vendite e rettifiche        |
| filtro «Tutti gli stati fiscali»         | **rimosso**                                     |
| filtro canale: Tutti · Shopify · Negozio | **ambito**: Tutti · **Online** · **Fisico/POS** |
| colonna «Stato fiscale» in tabella       | **rimossa**                                     |

⚠️ Le due etichette vecchie del filtro **dicevano il falso**: «Shopify» comprendeva le sole
vendite online — anche il POS è Shopify — e «Negozio» indicava lo **Shopify POS**, non la cassa
di VestiFlow.

**Restano separate in navigazione** — hanno scopi diversi e non sono duplicati:
**Vendite online** · **Corrispettivi** · **Ordini Shopify**.

---

## §9 · Regola sintetica

> **Corrispettivi = quadro economico generale derivato.**
>
> Ogni vendita o rettifica che VestiFlow conosce resta consultabile **una sola volta**,
> classificata per origine. I sottoinsiemi si ottengono con filtri e riepiloghi.
>
> **Shopify POS resta visibile come fisico/POS**; non si esclude in assoluto.
>
> **Nessuna stampa, esportazione o consegna genera stati.**

---

## §10 · La guardia

`scripts/check-registro-legacy.mjs`, dentro `npm run lint`, attraversa **API, frontend ed e2e**
e fallisce se rientra uno dei **26** termini ritirati — `fiscalStatus`, `markDelivered`,
`excluded_pos_register`, `registerExternal`, `accountant-register`, e dal 17/08 i dodici del
Corrispettivo-documento (`CorrispettivoEntry`, `corrispettivo_entries`, `register/entries`,
`DocumentType.corrispettivo`, …).

Esiste perché **niente di tutto questo si romperebbe tornando**: un `fiscalStatus` riaggiunto a
un DTO compila, passa i test e non fa arrossare nulla. Ricostruisce solo un modello che abbiamo
deciso di non avere. Le decisioni funzionali non hanno un compilatore.

I commenti che **raccontano** la rimozione sono esentati: vietare anche quelli costringerebbe a
cancellare la spiegazione.

---

## §11 · La registrazione manuale economica — censita il 17/08, e non c'era

Prima di eliminare `corrispettivo_entries` è stata posta una domanda che valeva la pena porre:
**quella verticale conteneva già la registrazione manuale in stile Danea** — righe `Importo ·
IVA · Descrizione`, senza articoli e senza magazzino, che serve quando la cassa esterna ha
battuto e VestiFlow non c'era?

Censimento su `a4b6b5e8`, sei dimensioni indipendenti e tre verifiche in contraddittorio.

> **Risposta: no. Quella verticale era SOLO il duplicatore automatico.**
>
> La **forma della riga** era però già quella giusta, ed è l'unica eredità che vale.

### I tre livelli, tenuti distinti

|                            | Struttura dati | Codice che lo faceva | UI raggiungibile |
| -------------------------- | -------------- | -------------------- | ---------------- |
| schema delle due tabelle   | parziale       | no                   | no               |
| superficie API             | **no**         | no                   | no               |
| chi scriveva le voci       | parziale       | **no**               | no               |
| maschera legacy            | no             | no                   | **no**           |
| righe analitiche           | **sì**         | no                   | no               |
| magazzino · COR · sequenze | sì             | parziale             | no               |

⚠️ **La distinzione non è pedanteria.** Una struttura che _permette_ una cosa e un sistema che
la _fa_ sono lontanissimi: qui la riga era della forma giusta **per caso**, perché copiava un
documento importato che di articoli non ne portava.

### I fatti che chiudono la questione

- **Nessun `POST`, nessun `DELETE`, in nessuna versione.** Il controller importava da
  `@nestjs/common` i soli `Get` e `Patch` — non aveva nemmeno i simboli per farlo. E la porta
  generica era chiusa a chiave: `POST /documents` rifiutava il tipo con «generato
  automaticamente dal sistema e non può essere creato manualmente».
- **Il `PATCH` toccava quattro metadati** — stato, data fiscale, «fatturato», «escluso dal
  riepilogo». Il suo DTO lo dichiarava: «I totali NON sono modificabili: sono lo snapshot della
  Vendita online». È **riconciliazione**, il mestiere opposto a registrare.
- **La maschera non aveva un pulsante «Nuova»**, e al 14/08 era già **scollegata dalla rotta**:
  `/app/sales/corrispettivi` caricava già il registro derivato. Il suo stato vuoto lo diceva
  all'operatore: «Le voci del registro vengono create automaticamente insieme alle Vendite
  online».
- **Nessun campo distingueva automatico da manuale.** Il canale `manual` esiste nell'enum, ma
  nessun codice l'ha mai scritto su un corrispettivo.
- **Una voce non toccava le giacenze**: i movimenti erano della Vendita online e lo dicevano da
  sé (`sourceDocumentType: online_sale`). Su questo la verticale era già economica pura.
- **`DocumentType.corrispettivo`, il prefisso COR e la sequenza appartenevano al solo modello
  documentale**: serie `'A'` fissa e anno preso da `fulfilledAt`, cioè dal canale. L'operatore
  non poteva scegliere né serie, né anno, né numero — e la tabella `documents` non ha mai avuto
  una riga di quel tipo.

### Cosa si riprende come modello (non come codice)

1. **La riga senza articolo**: descrizione libera + quantità + imponibile + imposta + totale.
   Il precedente c'è, ed è in produzione da luglio — la voce «Spedizione».
2. **L'IVA per riga come Codice IVA + snapshot congelato**, mai un'aliquota nuda. Regge le
   aliquote miste nella stessa registrazione senza toccare la testata.
3. **Le due date distinte**, operativa e fiscale, con la seconda proposta dalla prima.
4. **Il vocabolario dei filtri**: periodo sulla data **fiscale**, non sulla data documento.

⚠️ **Un difetto da non ereditare: gli importi erano `Int`.** Una riga digitata **ivata** non
tornerebbe identica alla rilettura — è esattamente ciò che `regole-gestionale` vieta. Gli
unitari vanno `Decimal(16,6)`.

### Cosa resta legacy, e non torna

`onlineSaleId @unique` · `salesOrderId` · `channel` obbligatorio · `status` a cinque valori ·
`invoiceIssued` · `excludedFromSummary` · `exclusionReason` · `adjustmentNote` · `refundedAt` ·
`isShipping` · la derivazione dell'IVA per corrispondenza inversa · `DocumentType.corrispettivo`
col prefisso COR e la sua sequenza.

Sono tutti attrezzi per **correggere ciò che nasce da solo**. Su una riga che l'operatore scrive
lui non hanno oggetto.

### La domanda che il censimento NON può chiudere

Il Registro di oggi è una vista **derivata**, senza record propri (§1, §7). Una registrazione
manuale **è** un record proprio: da qualche parte deve stare.

**Se sia un tipo documento vero — con numerazione, stampa e contatore configurabile — oppure
una tabella dedicata al Registro, il legacy non lo dice**, perché il suo tipo era per
costruzione interno, non stampabile e fuori dai contatori. È una decisione di prodotto.

**Decisa il 17/08, subito dopo il censimento: §12.**

---

## §12 · Il Corrispettivo manuale — deciso il 17/08/2026

**Fonte:** nota funzionale del proprietario del progetto, 17/08/2026, scritta dopo il verdetto
del §11. Questa sezione è la specifica della funzione; l'implementazione la segue.

### La regola

> **Il Corrispettivo manuale è una registrazione ECONOMICA autonoma**, inserita direttamente
> dall'operatore quando VestiFlow conosce l'importo ma non la vendita analitica che l'ha
> prodotto.

I casi reali sono quattro, e sono tutti lo stesso caso: **il dato economico esiste, gli
articoli no.**

- la cassa esterna ha battuto mentre VestiFlow non era disponibile;
- vendite battute in cassa e non più ricostruibili riga per riga;
- differenza certa fra la chiusura della cassa esterna e ciò che VestiFlow conosce;
- recupero di importi storici di cui si sanno importo e IVA, non gli articoli.

### Cosa fa, e cosa non fa

| Fa                                     | Non fa                                           |
| -------------------------------------- | ------------------------------------------------ |
| entra nel Registro Corrispettivi       | **non** ha un registro proprio                   |
| entra nei totali                       | **non** crea prodotti né varianti                |
| entra in stampa, CSV ed export         | **non** genera movimenti di magazzino            |
| si include/esclude coi filtri normali  | **non** tocca Giacenza · Impegnata · Disponibile |
| è riconoscibile: **origine = manuale** | **non** crea `SalesOrder` né `Document`          |
| ha un numero progressivo proprio       | **non** crea pagamenti, incassi o Tesoreria      |

#### ⚠️ Multi-aliquota nella registrazione, aggregato nel Registro _(deciso il 17/08)_

Qui c'era scritto che entra «nei totali **e nella suddivisione IVA**». **La suddivisione IVA
del Registro non esiste**: il riepilogo ha un `taxMinor` unico, l'export una sola colonna
«IVA», e l'imponibile non è nemmeno letto — si ricava per differenza. Promettere di entrarci
prometteva una cosa inesistente.

> **La registrazione conserva OBBLIGATORIAMENTE le sue righe per aliquota**, ciascuna con
> Codice IVA e snapshot. **Nel Registro compare aggregata**, come ogni altra sorgente.

**Non si trasforma il Registro in una vista analitica per aliquota adesso.** Sarebbe un lavoro
che tocca tutte e quattro le sorgenti.

⚠️ **Correzione del 17/08**: qui era scritto che «Shopify, in questo flusso, il dettaglio IVA
per riga non lo porta». **È vero del flusso, falso del dato.** La sync persiste l'IVA e lo
snapshot su ogni riga, le rettifiche hanno una tabella dedicata per aliquota, e la Vendita al
banco ha il Codice IVA vero. **Il dato c'è: è il Registro che non lo legge**, perché le sue
query caricano solo le testate.

Il motivo per rimandare quindi non è l'assenza del dato — è che leggerlo per tutte le sorgenti
è un lavoro proprio, con almeno un ostacolo noto: `SalesOrder.taxMinor` viene da `total_tax` di
Shopify e **include l'imposta di spedizione**, che sulle righe non c'è. Un dettaglio
ricostruito dalle righe non tornerebbe con la colonna IVA della stessa riga.

✅ **Verificato il 17/08 — l'export non richiede alcun rifacimento.** L'informazione per
aliquota del Corrispettivo manuale si conserva in modo **additivo**: una colonna in coda alle
dodici esistenti, senza spostare nulla, senza cambiare il numero di righe, senza toccare PDF,
DTO, controller, frontend o test.

⚠️ **Il divieto sul magazzino non è una conseguenza: è la definizione.** Una registrazione che
non conosce gli articoli non può muovere quantità, e se un giorno qualcuno provasse a farlo
starebbe inventando merce. È il primo test obbligatorio (§17 della nota): creare, modificare ed
eliminare un Corrispettivo manuale deve produrre **zero** `StockMovement`.

### La testata

**Numero progressivo** · **Data** · **Location** · **modalità Ivati/Netti** · **Note**
(facoltative).

- **Una sola data**, che è quella economica e determina il periodo del Registro. ⚠️ **Non
  tornano** data fiscale e data registrazione del legacy: erano due perché una nasceva dal
  canale e l'altra la correggeva l'operatore. Qui la digita l'operatore, ed è una.
- **Location obbligatoria**, `NOT NULL` nel database e verificata sia dall'API sia dalla
  maschera: precompilata se ce n'è una sola utilizzabile o se esiste un default valido, sempre
  modificabile, e **se ce ne sono più d'una e nessuna è scelta, non si salva**.

  > **Non esiste un Corrispettivo manuale con Location non determinata.** È una regola del
  > modello, non una convalida di maschera.

  La stessa regola vale funzionalmente per la **Vendita al banco**, dove la location serve
  anche al movimento fisico.

- **Modalità Ivati/Netti**: un solo selettore per l'intera registrazione, **senza memoria
  operatore**, e parte da **Ivati** — perché il caso operativo è riportare i valori di una
  chiusura di cassa, che sono ivati. Cambiando modalità i valori si **convertono**, non si
  reinterpretano.
- **Niente** cliente, pagamento, protocollo, serie, prefisso.

### Le righe

`Descrizione` · `Importo` · `Codice IVA`. Più righe, più aliquote.

```text
70,00 | IVA 22% | Vendite cassa esterna
30,00 | IVA 10% | Vendite cassa esterna
```

- L'importo è **ivato o imponibile secondo la modalità** della testata.
- L'IVA usa i **Codici IVA reali** dell'anagrafica fiscale, mai una percentuale scollegata, e
  la riga porta lo **snapshot storico**: se il Codice IVA cambia domani, la registrazione di
  ieri non cambia. È l'unica cosa che si eredita dal legacy, ed era la sua parte migliore.
- **Niente quantità, SKU, EAN, prodotto o variante.** Una riga senza articolo è già stata
  progettata e messa in produzione in questo gestionale — la voce «Spedizione» delle vendite
  online — quindi non è un precedente da inventare.
- Una riga vuota pronta all'inserimento **non è una riga del database**.

### La precisione

⚠️ **Il difetto da non ereditare.** Nel legacy gli importi erano `Int`, e con `Int` un importo
digitato **ivato non torna identico** alla rilettura. Vale la regola del denaro: **unitari
`Decimal(16,6)`, totali interi, si arrotonda solo all'uscita**.

Il caso che deve passare, ed è il test che decide se la funzione è fatta bene:

> **70,00 ivati al 22% → salvato → riaperto in modalità Ivati = 70,00.** Non 69,99, non 70,01.

Si riusano le utility economiche già in casa. **Non si scrive un secondo motore IVA.**

### La numerazione

Numero progressivo automatico, **riusando il motore comune** del progetto: tenant-safe,
assegnazione atomica sotto lo stesso lucchetto degli altri, stessa regola di data.

Tecnicamente serve una **chiave** nell'elenco dei tipi che i numeratori usano — `manual_receipt`
— ed è **la stessa cosa che fanno già l'Ordine cliente manuale e l'Ordine fornitore**, che
vivono in tabelle proprie e non hanno mai una riga in `documents`. Il codice lo dice: «l'enum
serve solo al numeratore». Quell'elenco non è «i documenti»: è **le chiavi dei numeratori**.

⚠️ **Nessun contatore ad hoc, e nessun ritorno di `DocumentType.corrispettivo` o del prefisso
`COR`.** Il numero identifica la registrazione, non la trasforma in un documento fiscale. Si
mostra **nudo** — `1`, `2`, `3` — secondo la convenzione già decisa, senza zeri di riempimento.

Il numero compare nella maschera, nel Registro, nei filtri se il pattern comune li prevede, e
negli export dove serve identificare la registrazione.

#### ⚠️ Il numero segue la dottrina di VestiFlow, buchi compresi _(corretto il 17/08)_

Qui c'era scritto «**nessun riuso del numero dopo una cancellazione**». **È stato corretto**,
perché contraddiceva il motore vivo e perché la ragione per cui sembrava servire non regge.

Il motore di VestiFlow dichiara il contrario in testa al proprio file: eliminando l'ultimo
della sequenza il progressivo scende e quel numero torna disponibile; i buchi **in mezzo**
restano tali. Non è un difetto: è la conseguenza voluta di aver tolto il contatore autonomo
dall'assegnazione.

> **Il Corrispettivo manuale numera come tutto il resto. I buchi sono ammessi, e non si
> rinumera mai un record successivo per tapparne uno.**

**Il motivo è che non è un documento fiscale.** Il documento commerciale emesso da un
registratore telematico ha una sua numerazione progressiva prevista dal sistema RT; questa è
una **registrazione economica interna** e il numero serve a una cosa sola — identificarla:

```text
Corrispettivo manuale 21
Corrispettivo manuale 22   ← eliminato
Corrispettivo manuale 23
```

`21, 23` va benissimo. Non c'è niente da proteggere, e inventare una regola speciale avrebbe
richiesto proprio quel contatore persistente che il paragrafo sopra vieta: le due frasi non
potevano valere insieme.

#### ⚠️ «Idempotente su doppio invio»: si tiene ciò che c'è _(corretto il 17/08)_

Anche questa è stata ridimensionata. **In VestiFlow non esiste un protocollo di idempotenza**
— `idempotency` non compare in una riga di codice, né nell'API né nel frontend. Le chiavi di
dedupe esistono solo per i fatti che arrivano dai canali esterni.

> **Non se ne introduce uno qui.** Valgono le protezioni correnti: la guardia `saving()` lato
> UI, la transazione, e l'assegnazione atomica del numero sotto lucchetto.

Due invii non prenderanno mai lo stesso numero — **quello è già garantito**. Che due invii
completi non creino due registrazioni è un problema **trasversale a tutte le creazioni** di
VestiFlow, non di questo modulo, e si affronta quando lo si affronta per tutti.

### L'integrazione

Il Corrispettivo manuale **non ha una schermata sua**: la schermata Corrispettivi resta unica,
e dentro convivono le sorgenti derivate e le registrazioni manuali, distinguibili dall'origine.

Il pulsante **«+ Aggiungi corrispettivo»** sta lì, ed è **la primary CTA della pagina**.

⚠️ Per esserlo bisogna **spegnere una primary che c'è già e non si vede**: la schermata monta
il componente di export senza disattivarne il bottone, che è acceso per default e senza
variante — quindi primary. È un **doppione**: la stessa azione è già in testata come «Export
per commercialista». Si spegne quello. Due primary nella stessa vista sono vietate da
`regole-stile-ui` §5.

Senza filtri i manuali **sono inclusi** nel Registro e nei suoi totali; con i filtri si isolano
o si escludono. Vale il principio di sempre: **ciò che il Registro mostra è ciò che esce**, e
il totale a schermo deve coincidere col totale esportato.

#### La colonna Location, e «Non determinata» _(deciso il 17/08)_

Il Registro oggi **non conosce la location affatto** — zero occorrenze in
`api/src/corrispettivi/`, nemmeno per la Vendita al banco, dove il dato sarebbe già lì. Con
questo lavoro entra: colonna e filtro.

| Sorgente                  | Location                                                       |
| ------------------------- | -------------------------------------------------------------- |
| **Vendita al banco**      | certa — obbligatoria nel DTO, verificata, scritta in testata   |
| **Corrispettivo manuale** | certa e obbligatoria per costruzione                           |
| **Shopify** online e POS  | certa **quando disponibile**; altrimenti **«Non determinata»** |

⚠️ **«Non determinata» è un'anomalia temporanea, non uno stato del modello.** Non è una terza
possibilità legittima accanto alle altre: è il modo onesto di dire «questo dato oggi non c'è»
finché la sincronizzazione Shopify non sarà rivista. La regola target resta una sola — **ogni
riga del Registro ha una location certa** — e quando la sync sarà sistemata quella dicitura
deve sparire da sé.

**Perché serve.** Per gli ordini Shopify il Registro può leggere la location solo dalla Vendita
online, dove il valore **può mancare** e, dove c'è, **può essere stato indovinato**: se la sede
Shopify non è mappata, il codice ripiega sulla **prima sede in ordine alfabetico**. Il danno è
già stato misurato una volta — «Shopify spediva da _Shop location_, VestiFlow scaricava da
_Magazzino test 3_ — prima per la M». Il valore letto **non porta con sé se sia stato
dichiarato o indovinato**, e presentare come fatto una scelta alfabetica del codice, in un
registro che va al commercialista, è peggio che non dire niente.

> **Mai inventare una sede. Mai mostrare il ripiego alfabetico come se fosse reale.**

**Filtrando per una sede**, le righe «Non determinata» non possono esserle attribuite, quindi
**escono dal risultato** — ma la schermata **lo dichiara**:

```text
3 registrazioni con Location non determinata non incluse nel filtro
```

⚠️ **Non spariscono in silenzio**, ed è il punto: un Registro che perde righe appena si sceglie
una sede mostrerebbe un totale più basso del vero, che in un registro fiscale è il difetto
peggiore possibile. **Senza filtro Location restano normalmente nel Registro e nei totali.**

**Fuori da questo lavoro**: rendere affidabile la location Shopify. Non si tocca la sync qui —
è tracciato come lacuna del blocco sincronizzazione (`02` e `DA-FARE`).

⚠️ **Stampa ed export non scrivono nulla**: nessuno stato, nessun «inviato al commercialista»,
ripetibili quante volte si vuole. È la stessa decisione del §5, e non si riapre.

### Modifica ed eliminazione

La modifica **aggiorna lo stesso record**, non ne crea un secondo: una registrazione digitata a
mano si può sbagliare, ed è normale correggerla.

#### L'eliminazione è semplice, e resta semplice _(deciso il 17/08)_

> **Tre verbi e basta: creare, modificare, eliminare.** L'eliminazione rimuove la registrazione
> e le sue righe; da quel momento non partecipa più al Registro, ai totali né agli export.

**Niente `status`, niente stato «Annullato», niente soft-delete, niente controregistrazione,
niente workflow.** E soprattutto: **nessun pattern di audit nuovo**, perché VestiFlow oggi non
ne ha uno — misurato il 17/08:

| Cercato                | Trovato                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------- |
| soft-delete vero       | **una sola tabella** in tutto il progetto (`external_document_types`), e condizionale  |
| il secondo `deletedAt` | `vat_codes` — **letto in undici punti, scritto da nessuno**: sembra esistere e non c'è |
| eliminazione documenti | **hard delete** vero, con le revisioni in cascata                                      |
| audit log generico     | non esiste: l'unico copre i soli account utente                                        |
| `updatedBy`            | **non esiste in nessuna tabella** dello schema                                         |

⚠️ **La conseguenza va detta, non nascosta**: eliminando il n. 12 il Registro passa da 11 a 13,
e un export di agosto ristampato a settembre non conterrà più quella registrazione. **È
accettabile**, ed è il prezzo di non costruire un impianto che il progetto non ha da nessuna
altra parte. Il giorno in cui VestiFlow avrà un audit vero, questa funzione lo erediterà come
tutte le altre.

**E il buco non si tappa mai**: non si rinumerano le registrazioni successive.

### Fuori perimetro, dichiarato

**Pagamenti e Tesoreria.** Il riferimento Danea mostra la scheda pagamento, e VestiFlow la
collegherà quando quel dominio esisterà. Fino ad allora il Corrispettivo manuale non crea
incassi, scadenze, risorse finanziarie né movimenti di tesoreria — e **non si costruisce una
mini-Tesoreria dentro i Corrispettivi**.

**Sconti.** Non entrano: è una registrazione per aliquota e importo, non una vendita analitica.

---

## §13 · Come si costruisce — il punto d'innesto, misurato

_Censimento del 17/08/2026 sul codice vivo. Le fondamenta (enum `manual_receipt`, tabelle,
migration) sono **già applicate**; qui c'è quello che resta._

⚠️ **Questa sezione esiste perché non si rimisuri.** I riferimenti sono al codice del 17/08:
se una riga non torna, vale il codice — ma la **forma** del ragionamento resta valida.

### Il Registro non è una UNION: sono query indipendenti fuse in memoria

E la Vendita al banco — che è un `Document`, non un ordine — è entrata **senza tabelle nuove e
senza cambiare la forma**. È il precedente esatto da imitare: la quarta sorgente fa lo stesso
percorso della terza.

### I sette punti, in quattro file

1. **`REGISTRO_BY_SOURCE`** (`corrispettivi-classification.util.ts`) — una voce in più. È
   l'**unico** posto dove si decide «questo è un corrispettivo», ed è un `Record` esaustivo
   apposta: da lì derivano da sole le sorgenti, la classificazione e tutti i filtri
   ambito/canale.
2. **Una `buildCorrispettiviManualWhere`** in `corrispettivi-query.util.ts`, gemella di quella
   della Vendita al banco. Stessa firma, e **soprattutto** stesso `return null` quando i filtri
   escludono già la sorgente: è così che una domanda che riguarda solo gli ordini — stato di
   pagamento, «solo resi» — spegne una sorgente che ordine non è.
3. **`buildRegisterRows`** — tre innesti puntuali, non una riscrittura: un quarto `count` nel
   `Promise.all` (⚠️ **senza, il tetto di 5.000 misura meno di quanto elenca**), un quarto
   `findMany`, un quarto blocco `.map`. Il `.sort` finale non si tocca.
4. **`getSummary`** — leggere, sommare, contare la sorgente nuova. ⚠️ **Toccando solo il punto 3
   la colonna smette di fare il totale in fondo**: è un difetto che questa schermata ha già
   avuto una volta, e il commento nel codice lo racconta.
5. **`CorrispettiviRegisterRow`** — il prefisso di `rowId` e il campo che porta l'origine.
6. **L'etichetta dell'origine** — è uno `switch` esaustivo **senza ramo predefinito**: non
   compila finché non la si dichiara. È una guardia buona, ma è un file in più da toccare.
7. **⚠️ Il settimo non è opzionale.** La mappa delle etichette dell'export è stata resa
   esaustiva il 17/08 proprio per questo: un tipo nuovo **non compila** finché non ha un nome.
   Prima, una riga non mappata usciva **«Rettifica»** — cioè a segno negativo — su un file
   consegnato al commercialista.

### L'origine: si allarga il tipo della riga, non l'enum del database

Non esiste oggi una dimensione che dica «questa riga è un Corrispettivo manuale»: le dimensioni
sono **due** — ambito e canale — ed entrambe derivano da un unico dato, l'origine dell'ordine.
E la casella più vicina è **già occupata** dalla Vendita al banco: classificarcelo dentro
mescolerebbe le due cose in un filtro.

> **Si allarga il tipo della riga del Registro, non l'enum `SalesOrderSource`.**

La riga del Registro è già un DTO normalizzato — `salesOrderId` è nullabile apposta, e
`documentId` esiste proprio per le sorgenti che ordini non sono. Mettere in
`sales_orders.source` un'origine che quella tabella non avrà **mai** è scrivere una cosa falsa
per comodità di tipizzazione. Il `Record` resta esaustivo sulla nuova unione, quindi **la
guardia del compilatore non si perde**.

La colonna dell'export si chiama «Canale»: con una quarta origine va letta **«Origine»**. È una
stringa da cambiare, non un lavoro.

### Cosa si riusa tale e quale — nessuna matematica nuova

⚠️ **Non si scrive un secondo motore IVA.** Tutto ciò che serve esiste ed è collaudato:

| Serve                                         | Si usa                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- |
| netto **da memorizzare** (con la coda)        | `netFromGrossExact`                                                 |
| ivato **da mostrare** (arrotondato)           | `grossFromNetMinor`                                                 |
| tagliare la coda a quanto tiene la colonna    | `toStorableMinor`                                                   |
| «è cambiato?»                                 | `sameAmountAtCent` — al centesimo                                   |
| imponibile/imposta/totale da un importo ivato | `computeVatLineAmounts` con `vat_included`                          |
| snapshot del Codice IVA                       | `buildVatCodeSnapshot` — il suo commento nomina già i corrispettivi |
| selettore Ivati/Netti                         | `app-price-mode-menu`, già condiviso da cinque testate              |
| cella Codice IVA di riga                      | `app-document-line-select-cell`, `freeText=false`                   |
| anatomia della maschera                       | i fogli globali `_document-form*.scss`                              |

⚠️ **Due trappole già misurate.** `amounts.unitNetMinor` è **arrotondato** e NON è il netto da
salvare — il gesto giusto sta nell'Ordine fornitore. E il meccanismo di conversione fra
modalità si copia dalla forma **nuova** (Ordine fornitore, netto canonico in un controllo
nascosto), **mai** dalla maschera Fatture: quella riconverte il valore mostrato a due decimali
e perde il centesimo, ed è dichiarata congelata.

**Permessi**: `reports.fiscal_register` esiste già — ⚠️ ma **nessun template, guard o rotta lo
usa**: questa sarebbe la prima applicazione, quindi non c'è un precedente da copiare. E la sua
descrizione parla ancora di «marca le consegne al commercialista», flusso **ritirato**: va
riscritta.

**Location**: si segue la sequenza dell'Ordine cliente manuale e la guardia **pura**
`assertLocationInUserScope`. ⛔ **Non** quella della Vendita al banco: pretende
`inventory.manage`, che su un'entità senza magazzino è un requisito sbagliato.

⚠️ **Il riepilogo totali non è un componente**: è lo stesso blocco ricopiato in cinque
maschere. Il Corrispettivo manuale sarebbe la sesta copia. Estrarlo è la cosa giusta, ma è
**lavoro dichiarato** — non un ritocco da fare di straforo qui.

### Le prove obbligatorie

La prima non è negoziabile e viene prima delle altre:

1. **creare, modificare ed eliminare un Corrispettivo manuale produce ZERO `StockMovement`**, e
   non muove Giacenza, Impegnata né Disponibile;
2. **70,00 ivati al 22% → salvato → riaperto in modalità Ivati = 70,00.** Non 69,99, non 70,01;
3. cambio Ivati → Netti **senza variazione economica**: i valori si convertono, non si
   reinterpretano;
4. più righe con **aliquote diverse** nella stessa registrazione;
5. una **riga vuota non viene salvata**;
6. Codice IVA + snapshot: cambiando il Codice IVA, **la registrazione storica non cambia**;
7. la modifica **aggiorna lo stesso record**, non ne crea un secondo;
8. **tenant A non vede né modifica** i corrispettivi di tenant B;
9. compare **una sola volta** nel Registro, con origine visibile, e **dentro i totali**;
10. il filtro isola ed esclude il manuale; **totale a schermo = totale esportato**, incluso ed
    escluso;
11. l'export ripetuto **non ha effetti collaterali**;
12. **nessuna regressione** delle tre sorgenti già presenti.

---

## §14 · Com'è stato costruito — 17/08/2026

_Consuntivo della costruzione, non un secondo disegno. Il §12 dice **cosa** deve fare e il §13
**dove** si innesta; qui c'è ciò che si è scoperto **facendolo**, e che né l'uno né l'altro
potevano sapere._

### Le sette cose che il §13 non prevedeva

#### 1. ⚠️ Il motore di numerazione aveva bisogno di una QUARTA sorgente

Il §12 dice «si riusa il motore comune, con la chiave `manual_receipt`», e non basta.
`numberSourceForType` conosceva tre tabelle — `documents`, `sales_orders`, `supplier_orders` —
con `'document'` come **ramo predefinito**. Una chiave nuova ci sarebbe caduta dentro in
silenzio: il massimo si sarebbe letto su `documents`, dove `manual_receipt` non comparirà mai,
quindi **sempre 0**, ogni registrazione nata col numero 1, e a fermarle il vincolo unico — dopo il
lavoro.

`DocumentNumberSource` ha ora un quarto valore, e con lui il ramo in `lastAssignedNumber`, la
tabella in `primoNumeroLibero` e `'ManualReceipt'` in `MODELLI_NUMERATI` (che è ciò che fa
riconoscere il conflitto dal **modello**, non dalle colonne).

#### 2. Il numero non si sceglie, quindi il conflitto non si negozia

Le maschere documento, al numero rifiutato, rispondono con `buildDocumentNumberConflict` e un
avviso che propone il primo libero. Qui **non c'è un campo numero**: proporne uno sarebbe un
comando che non comanda. Il conflitto si **riconosce** con la guardia comune
(`isDocumentNumberConflict`) e si dice cosa è successo — «assegnato a un'altra registrazione
nello stesso istante, riprova». È quasi irraggiungibile: l'assegnazione passa dall'advisory lock.

#### 3. L'origine è un'unione, e la classificazione la condivide con la Vendita al banco

`CorrispettivoOrigin = SalesOrderSource | 'manual_receipt'`, e `REGISTRO_BY_SOURCE` è esaustivo
su **quell'unione**. La classificazione è **Fisico/POS · VestiFlow**, la stessa della Vendita al
banco — ed è giusto: sono entrambe incassi fisici raccolti da VestiFlow, e chi filtra quella
coppia le vuole tutte e due.

> **Ciò che non si condivide è l'ORIGINE.** Il §13 avvertiva che «la casella più vicina è già
> occupata»: il rischio non era la coppia, era riusare `source = store` sulla riga — che avrebbe
> reso una registrazione digitata indistinguibile da una vendita battuta al banco, in colonna e
> nel file per il commercialista.

`CORRISPETTIVI_SOURCES` resta la sola parte **interrogabile su `sales_orders`**: è ciò che
impedisce a un valore che quella tabella non ha di finire in un filtro Prisma.

#### 4. Un `kind` proprio — provato, e ritirato lo stesso giorno

Il settimo innesto del §13 si era realizzato con un terzo valore di `CorrispettiviRowKind`,
«Registrazione», per non chiamare «Vendita» una riga che nessuno aveva battuto.

**È durato il tempo di vederlo in colonna.** Un Registro che affianca «Vendita», «Reso»,
«Rimborso» e «Registrazione» mette sullo stesso asse tre **fatti economici** e una **provenienza**:
di quella riga l'operatore continuava a non sapere il segno. E il segno c'era — economicamente
è una vendita avvenuta.

> `kind` risponde a «**cosa è successo**», `source` a «**da dove arriva**». La distinzione
> tecnica che serviva davvero la porta già la colonna **Origine**, dove «Corrispettivo manuale»
> sta accanto a «Shopify online» e «Vendita al banco» senza rubare il posto a niente.

`CorrispettiviRowKind` è tornato a due valori.

#### 5. L'export ha preso DUE colonne in coda, non una

Il §12 ne prevedeva una. Sono due, e la seconda è una scelta presa costruendo:

| Colonna           | Perché                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dettaglio IVA** | quella prevista: l'informazione per aliquota della registrazione, vuota sulle altre tre sorgenti — dove il dato esiste ma il Registro non lo legge                |
| **Sede**          | con questo lavoro il Registro mostra la sede e ci si filtra sopra. Un file prodotto con quel filtro attivo, che la sede non la nomina, non dice di quale sede sia |

Entrambe **in coda**: le dodici precedenti non si spostano, e chi ha un foglio agganciato alle
loro posizioni continua a leggerle dov'erano. Un test lo presidia.

E la quarta colonna si chiama **«Origine»**, non più «Canale» — su schermo, nel CSV e nel PDF.
Con una sorgente che nessun canale ha raccolto, «canale» diceva il falso.

#### 6. ⚠️ Due elenchi di sedi, perché sono due domande diverse

`GET /inventory/locations` chiede `section.inventory`, e chi lavora sul Registro tipicamente non
ce l'ha: la tendina sarebbe arrivata **vuota con un 403 assorbito in silenzio** dal frontend, e
una sede obbligatoria che non si può scegliere è una maschera che non salva.

| Endpoint                         | Domanda                           | Permesso               |
| -------------------------------- | --------------------------------- | ---------------------- |
| `GET /corrispettivi/locations`   | «di quali sedi posso CONSULTARE?» | vista del Registro     |
| `GET /manual-receipts/locations` | «su quali posso REGISTRARE?»      | scrittura sul Registro |

Unificarli darebbe o un filtro chiuso a chi può solo leggere, o una tendina che propone sedi su
cui il salvataggio poi risponde 403.

⚠️ **Due endpoint, ma UNA sola regola d'accesso**, ed è quella centrale. Qui, costruendo, ne era
nata una seconda: «il Registro è storico, quindi il suo elenco non filtra per sede attiva né
inclusa nel piano». Ragionevole a leggersi, e **inventata**: viveva solo in questo file, e
avrebbe reso il Corrispettivo manuale l'unico posto di VestiFlow con una politica di sedi propria
— cioè il posto dove un domani una revoca di licenza non sarebbe arrivata.

È stata ritirata. Entrambi gli endpoint passano da `listLocationsInScope`, quindi dallo stesso
`resolveOperationalLocationScope` del resto dell'applicazione; **la differenza fra i due resta
quella che il modello centrale già faceva** — lettura contro scrittura, dove la sola lettura
ammette in più `inventory.view_all_locations`. Nessuna terza regola.

E `POST`/`PATCH` verificano sempre tutti e tre i cardini, in quest'ordine: sede **del tenant** e
utilizzabile (`resolveLicensedLocationScope`), poi **utente autorizzato** su quella sede
(`assertLocationInUserScope`, in modalità scrittura).

#### 7. Le righe si spengono a testata incompleta — per uniformità, non per necessità tecnica

Qui il ragionamento e la decisione sono andati in direzioni diverse, ed è giusto che il
consuntivo lo dica.

`regole-stile-ui` §7 prescrive lo stato vuoto finché mancano «i campi obbligatori **che le
governano**», e in questa maschera **nessuna riga dipende dalla sede**: descrizione, importo e
Codice IVA non leggono articoli, giacenze né prezzi. Sul piano tecnico la premessa della regola
non c'era.

**La scelta è stata comunque il varco**, ed è del proprietario del progetto: chi apre un
Corrispettivo manuale ha appena chiuso un Ordine cliente o un Arrivo merce, e in quelle maschere
la prima cosa che si fa è scegliere. Un'eccezione «tecnicamente giustificata» sarebbe rimasta
un'eccezione da spiegare a ogni operatore nuovo. **L'uniformità di un gesto ripetuto vale più
della libertà di digitare un importo prima del suo luogo.**

La sede è anche il campo che si segna con la **tinta d'attesa** (`--color-field-waiting`): aprire
una registrazione nuova non è un errore dell'operatore.

### Il filtro Sede, e la riga che dichiara ciò che toglie

Filtrando per una sede, le righe che una sede non ce l'hanno **escono** — a quella sede non sono
attribuibili — e la schermata lo dice:

```text
3 registrazioni con Location non determinata non incluse nel filtro
```

Il numero arriva dal riepilogo (`locationUndeterminedExcludedCount`) e si calcola dagli **stessi
builder** dell'elenco, con un `undeterminedLocationOnly` che sostituisce la sede scelta con
«nessuna sede». Una seconda catena di filtri scritta a mano conterebbe righe diverse da quelle
che spariscono, ed è esattamente ciò che il numero deve smentire.

**Senza filtro Sede il numero è zero**, e non è una scorciatoia: senza filtro quelle righe sono
dentro il Registro e dentro i totali.

### Il permesso: prima applicazione vera

`reports.fiscal_register` esisteva dal piano permessi e **nessuna rotta, guard o template lo
usava**. Ora governa creazione, modifica ed eliminazione — insieme alla vista del Registro, nella
stessa forma dell'export (vista + `reports.export`).

La sua descrizione è stata **riscritta su entrambe le sponde**: diceva «marca le consegne al
commercialista, cambia lo stato fiscale di un ordine e corregge le righe del registro», e sono
tre cose che non esistono più — il flusso commercialista è ritirato (§5), lo stato fiscale della
vendita è stato eliminato (§6), e il Registro non si corregge riga per riga (§1).

### Le prove, e dove stanno

| Prova del §13                                    | Dove                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| 1 — **zero `StockMovement`**, giacenze intoccate | `manual-receipts.service.spec.ts`, sui tre verbi                   |
| 2 — 70,00 ivati → salvato → riaperto = **70,00** | `manual-receipt-totals.util.spec.ts` **e** la maschera             |
| 3 — Ivati ⇄ Netti senza variazione economica     | entrambi, e con il controesempio a 85,40                           |
| 4 — più aliquote nella stessa registrazione      | `manual-receipt-totals.util.spec.ts`                               |
| 5 — la riga vuota non si salva                   | util, service e maschera                                           |
| 6 — snapshot: il codice cambia, lo storico no    | `manual-receipt-totals.util.spec.ts`                               |
| 7 — la modifica aggiorna lo **stesso** record    | `manual-receipts.service.spec.ts`                                  |
| 8 — tenant A non vede né modifica quelli di B    | `manual-receipts.service.spec.ts`                                  |
| 9–10 — origine visibile, filtri, totali          | `corrispettivi-classification.util.spec.ts`, `-query.util.spec.ts` |
| 11–12 — export ripetibile, nessuna regressione   | `corrispettivi-export.service.spec.ts` + la suite intera           |

La prima è scritta come **spie sulle delegate proibite** (`stockMovement`, `inventoryLevel`,
`stockReservation`, `document`, `salesOrder`): il difetto da fermare non è un calcolo sbagliato,
è qualcuno che un giorno «collega anche il magazzino».

### ⚠️ L'ordinamento del Registro non era brutto: non esisteva

Il difetto è saltato fuori guardando la schermata — il n. 1 sopra il n. 2 — e la causa non era
un ordine sbagliato: era **l'assenza di un ordine**.

Due sorgenti su quattro portano una data economica `DATE`. Letta come istante è **mezzanotte**,
quindi due Corrispettivi manuali dello stesso giorno pareggiano, e `Array.sort` lasciava l'ordine
in cui le quattro query erano state concatenate. **Quell'ordine il database non lo garantisce**:
lo stesso periodo poteva tornare diverso a ogni caricamento, ed è il difetto peggiore di un
registro contabile — chi lo confronta due volte trova due documenti diversi senza aver toccato
niente.

L'ordine canonico è a tre livelli, e non contiene nessuna priorità inventata fra Vendita, Reso e
Rimborso, né fra sorgenti:

| Livello | Criterio                   | Perché                                                                                                                                                 |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | **giorno economico**, DESC | è la grandezza che tutte e quattro le sorgenti hanno davvero. Tiene le righe di una giornata **contigue**                                              |
| 2       | **istante reale**, DESC    | dove esiste strutturalmente. Una vendita e il suo reso si ordinano per l'ora in cui sono avvenuti — non perché «i resi vanno sopra»                    |
| 3       | `rowId`, crescente         | il pareggio esiste (righe importate dalla stessa sincronizzazione, stesso millisecondo) e deve risolversi **sempre allo stesso modo**, non come capita |

⚠️ Il primo livello è il **giorno**, non l'istante, e la differenza non è cosmetica: con
l'istante grezzo una registrazione manuale delle 18:10 finirebbe **sotto** una vendita delle
14:32, perché la sua data economica è una mezzanotte. Sarebbe un artefatto del tipo di colonna,
presentato all'operatore come ordine dei fatti.

L'export usa il verso **crescente** dello stesso comparatore — il file per il commercialista si
legge dal primo giorno — e un test verifica che sia l'inverso esatto, riga per riga: un registro
che si riconcilia col proprio riepilogo non può riordinarsi per strada.

La contiguità per giornata è anche la **precondizione** di ciò che verrà: i subtotali per
giornata economica in stampa (vedi «Cosa resta»). Il dettaglio delle singole righe **non** è
stato aggregato.

### La schermata, dopo averla usata

Il §12 e il §13 non disegnavano il Registro: queste sono correzioni nate guardandolo pieno.

- **Le colonne sono configurabili** (`TableViewId.CorrispettiviRegister`). La tabella mostra
  Data · Tipo · Numero · Origine · Sede · Imponibile · IVA · Totale; Cliente e Pagamento
  **esistono ma nascono spente** — il Registro non è un archivio clienti, e lo stato di pagamento
  fra sorgenti che un ciclo di pagamento non ce l'hanno crea più incoerenza che informazione.
  Nessun dato è stato tolto dall'API né dall'export.
- **Il filtro Origine è una dimensione vera**, non un ripiego. Isolare il Corrispettivo manuale
  prima non si poteva: il filtro `source` accettava solo `online`/`pos`, nessuna schermata lo
  mandava, e Ambito + Canale restituiscono insieme Vendita al banco e Corrispettivo manuale
  (condividono la coppia, vedi §14.3). **Canale è sparito dalla barra** — con Origine accanto era
  ridondante — ma resta nel modello, nell'API e nell'indirizzo.
- **Niente pill nelle celle.** Tipo e Pagamento si leggono dal **colore della parola**: un
  riquadro segnala un'eccezione, e in una colonna che ha un valore su **ogni** riga non distingue
  niente — alza solo la riga in una vista che si consulta a colpo d'occhio.
- **La riga si apre cliccandola**, come in `document-table`. Il varco era il _numero_
  sottolineato: un collegamento largo un carattere, in una colonna dove «#1009» non fa niente e
  «2» si apriva. Le righe delle altre tre sorgenti non prendono né mano né `tabindex`: non hanno
  dove aprirsi.
- ⚠️ **La pagina occupa l'area, e a scorrere è il solo elenco.** Chiedeva `block-size: 100%` a
  `main.shell__content`, dove però **non è sola**: sopra di lei ci sono le briciole di pane.
  Otteneva quindi il 100% di un'area già in parte occupata — barra di scorrimento sull'intera
  pagina e riepilogo tagliato sotto il bordo. `main` è ora una colonna flessibile e la pagina
  dichiara `flex: 1`: riceve **ciò che resta**, senza tetti in `dvh` decisi a occhio, che erano
  il difetto opposto (spazio buono lasciato vuoto con poche righe).

### Cosa resta, dichiarato

- **Il riepilogo totali è ora la sesta copia.** Il §13 lo diceva già — estrarlo è lavoro proprio,
  non un ritocco da fare di straforo qui. Il **foglio** però non è duplicato: la maschera usa le
  classi globali `_document-form*.scss`, quindi è il solo markup a ripetersi.
- **La location Shopify resta inaffidabile**, e «Non determinata» con lei. Fuori da questo lavoro
  per decisione del §12: è una lacuna del blocco sincronizzazione.
- **Riepilogo e stampa per giornata economica** — il prossimo affinamento del Registro, indicato
  esplicitamente dal proprietario del progetto. L'ordine canonico è già la sua precondizione: le
  righe di una giornata sono contigue, quindi i subtotali si possono introdurre **senza toccare
  la semantica** né aggregare il dettaglio. ⚠️ **Non è l'invio RT**, e le due cose non vanno
  confuse: questo è un modo di leggere il registro, quello è una trasmissione fiscale.
- **L'ordinamento cliccabile sulle colonne resta fuori.** Un riordino locale agirebbe sulle sole
  righe caricate — cento su un periodo che ne ha di più — e produrrebbe un ordine che sembra
  globale e non lo è. Quando si farà, si farà sull'insieme intero, lato API.
- **La suddivisione IVA del Registro** non esiste ancora per le altre tre sorgenti. Il dato c'è,
  è il Registro che non lo legge, e leggerlo per tutte è un lavoro con un ostacolo noto
  (`SalesOrder.taxMinor` include l'imposta di spedizione, che sulle righe non c'è).
- ✅ **La stampa del Registro divergeva dalla schermata, ed è stata corretta** (era un difetto
  preesistente, trovato costruendo). `corrispettivi-print.component.ts` leggeva un parametro che
  nessuno mandava più (`onlineOnly` — unica occorrenza viva nel repository, mai spedita da
  `buildParams`) e **non leggeva affatto** `ambito`, `canale` e `rowType`, che la schermata gli
  passa nell'indirizzo: chi stampava guardando «2° trimestre · Fisico/POS · Resi» otteneva un
  foglio con tutto il trimestre.

  La correzione non è una seconda lettura dei parametri, che sarebbe la stessa divergenza
  riscritta più in là: schermata e stampa leggono ora **la stessa funzione**
  (`corrispettivi-filters.util.ts`), e i test confrontano **la domanda che le due pagine fanno
  all'API** — un filtro Fisico/POS + Resi + Sede X deve produrre lo stesso sottoinsieme di qua e
  di là.

---

## §15 · Export e Stampa non sono la stessa famiglia — 17/08/2026

_Decisione del proprietario del progetto, presa progettando il raggruppamento giornaliero.
Precede l'implementazione: qui c'è **cosa deve valere**, non com'è fatto oggi._

Oggi le tre uscite sono **la stessa cosa in tre formati**: PDF, Excel e CSV nascono dallo stesso
`exportQuery()` sul frontend, dallo stesso `ListCorrispettiviQueryDto` sull'API, e si chiamano
tutte e tre `corrispettivi-commercialista`. La decisione le divide in **due famiglie con due
mestieri diversi**.

| Uscita     | Cos'è                                 | Deve rispettare                                                                               |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| **PDF**    | export della **vista corrente**       | periodo · filtri · **raggruppamento attivo** · ordinamento corrente · **colonne configurate** |
| **Excel**  | export della **vista corrente**       | le stesse cinque cose                                                                         |
| **CSV**    | export **dati** per il commercialista | il **sottoinsieme filtrato**. Non deve replicare graficamente la vista                        |
| **Stampa** | funzione **separata**                 | da progettare a parte: contenuto e formato propri                                             |

### Le tre conseguenze che questa riga di tabella porta con sé

**1. Le colonne devono viaggiare.** È la novità vera: finora nessuna uscita sapeva quali colonne
fossero accese, perché il selettore Colonne vive nel frontend e l'export aveva un elenco fisso.
PDF ed Excel ora ne dipendono.

⚠️ E qui c'è un impegno preso in §14.5 da non rompere: le **dodici colonne originali dell'export
non si spostano**, perché chi ha un foglio agganciato alle loro posizioni continua a leggerle
dov'erano. Quella garanzia vale ora per il **CSV**, che è l'export dati; PDF ed Excel seguono la
vista, ed è esattamente il motivo per cui le due famiglie devono separarsi invece di condividere
un elenco di colonne che non può essere fisso e mobile insieme.

**2. Il raggruppamento è presentazione, e non deve poter diventare un filtro.** Viaggia in un tipo
suo (`groupBy`), separato dai filtri: chi costruisce le query Prisma non lo riceve proprio. La
prova che lo inchioda: **a parità di filtri, `groupBy = none` e `groupBy = day` restituiscono le
stesse righe e lo stesso riepilogo complessivo** — cambia solo la disposizione.

**3. ⚠️ I subtotali giornalieri si calcolano sull'API, non sulle righe caricate.** Il Registro
carica cento righe per volta: un subtotale calcolato a schermo è giusto **finché la giornata sta
tutta in una pagina**, e sbaglia in silenzio appena un giorno si spezza fra due pagine. Sbaglia
per difetto e in modo plausibile, che su un registro contabile è la forma peggiore. L'aggregato
per giornata è quindi fratello del riepilogo complessivo, calcolato sull'intero insieme filtrato.

### Stampa: esplicitamente NON agganciata al PDF

> **Stampa non è «il PDF su carta», e non va legata alla sua pipeline né al suo layout.**

Oggi sono due strade tecniche diverse — la Stampa è una pagina Angular che rilegge l'indirizzo,
il PDF lo disegna il server — e la tentazione di unificarle è forte proprio perché il risultato
si somiglia. La decisione è di **non** unificarle adesso: contenuto e formato della Stampa si
decidono a parte, quando ci si arriva.

Ciò che resta valido da subito è la correzione di §14: la Stampa legge **gli stessi filtri** della
schermata, dalla stessa funzione. È il minimo che non può divergere, qualunque forma prenderà poi.

---

## §16 · I filtri diventano insiemi, e Ambito smette di essere una dimensione — 17/08/2026

_Decisione del proprietario del progetto. **Aggiorna il §3**, dove Ambito e Canale erano dimensioni
autonome: quella struttura resta valida come descrizione di ciò che il Registro sa dire, non più
come forma del filtro._

### Il segnale c'era già nel codice

La scelta singola era **già** insufficiente, e l'aveva ammesso da sé: il servizio calcola un
`rowType` di valore `refunds_and_returns` quando arriva il vecchio `refundsOnly`. È una
**congiunzione inventata come stringa**, perché il tipo enumerato non poteva esprimere un insieme.

> Quando un enum comincia a contenere delle «e», sta chiedendo di diventare un insieme. Qui non si
> aggiunge una comodità: si dà al dato la forma che aveva già.

### Cosa è a scelta singola e cosa a insieme

| Filtro        | Forma           | Perché                                                                                  |
| ------------- | --------------- | --------------------------------------------------------------------------------------- |
| **Periodo**   | scelta singola  | un intervallo è uno                                                                     |
| **Origine**   | **insieme**     | «Vendita al banco + Corrispettivo manuale» è una domanda reale, e oggi non si può porre |
| **Tipo**      | **insieme**     | il Registro è multi-evento per natura: Vendite + Resi, Resi + Rimborsi                  |
| **Sede**      | **insieme**     | in un multi-magazzino «due negozi su quattro» è la norma, non l'eccezione               |
| **Raggruppa** | scelta singola  | Nessuno · Giorno                                                                        |
| **Ambito**    | **scorciatoia** | vedi sotto: non viaggia più come filtro                                                 |

⚠️ **Nessuna casella «Tutti» dentro i menu.** Assenza di restrizione **è** «tutti»: una casella
«Tutti» accanto alle voci crea lo stato contraddittorio «Tutti spuntato insieme ad alcune». Il chip
dice «Origine: Tutte», «Origine: 2», o i nomi quando sono pochi.

### ⚠️ Ambito è una scorciatoia, non una seconda dimensione

> **Una sola verità nel filtro: l'insieme `origini[]`.**

Con Origine a insieme, Ambito diventa ridondante **nello stesso identico modo in cui lo era
Canale**, ritirato dalla barra il giorno prima: Online è `{shopify_online}`, Fisico/POS è
`{store, shopify_pos, manual_receipt}`.

E non è solo ridondante: **i due possono contraddirsi**. `Ambito: Online` + `Origine: Vendita al
banco` è un insieme vuoto, e l'operatore vede zero righe senza che niente gliene dica il motivo. Un
filtro che può negare sé stesso è un difetto che nessun test trova, perché tecnicamente funziona.

Ambito resta quindi come **comando rapido** che spunta un gruppo di origini:

| Scorciatoia    | Spunta                                                     |
| -------------- | ---------------------------------------------------------- |
| **Tutti**      | tutte le origini                                           |
| **Online**     | Shopify online                                             |
| **Fisico/POS** | Vendita al banco · Shopify POS · **Corrispettivo manuale** |

Dopo la scorciatoia l'operatore affina liberamente, e **Ambito non continua a dire rigidamente
«Fisico/POS»**: ha inizializzato una selezione, non l'ha vincolata. Togliendo Shopify POS
dall'insieme, il filtro non entra in contraddizione con nulla — perché non c'è più nulla con cui
contraddirsi.

**Il Corrispettivo manuale sta fra le origini fisiche**, ed è una scelta di dominio dichiarata:
serve a recuperare corrispettivi non registrati analiticamente in VestiFlow, tipicamente da una
cassa esterna. Non lo si usa per correggere vendite online Shopify, che sono recuperabili.

### Compatibilità: i vecchi indirizzi continuano a funzionare

La traduzione avviene **in un punto solo** — `parseCorrispettiviFilters` — che è il posto nato
apposta perché schermata e stampa non divergessero (§14):

> ⚠️ **I tre parametri di origine si convertono INSIEME, non uno per uno.** Ambito, Canale e
> Origine oggi si combinano per **intersezione** — è ciò che fa `sourcesFor(ambito, canale,
origine)` — e tradurli separatamente per poi unire i risultati darebbe un insieme più largo di
> quello che l'indirizzo salvato descriveva.

|                         | Preso da solo                          | In combinazione                                    |
| ----------------------- | -------------------------------------- | -------------------------------------------------- |
| `ambito=fisico_pos`     | `{store, shopify_pos, manual_receipt}` |                                                    |
| `canale=shopify`        | `{shopify_online, shopify_pos}`        |                                                    |
| **`ambito=…&canale=…`** | —                                      | **`{shopify_pos}`** — l'intersezione, non l'unione |

La conversione corretta è quindi una sola: **si tiene l'origine che soddisfa TUTTI e tre i vincoli
presenti**, esattamente come oggi. In pratica è la stessa funzione già scritta, letta al contrario —
non una nuova tabella da mantenere allineata a mano.

| Vecchio parametro               | Diventa                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `ambito` · `canale` · `origine` | `origini` = le origini che soddisfano **tutti** i vincoli presenti |
| `rowType=returns`               | `tipi = {returns}`                                                 |
| `refundsOnly=1`                 | `tipi = {returns, refunds}` — la congiunzione, esplicitata         |
| `locationId=x`                  | `sedi = {x}`                                                       |

I nuovi indirizzi portano solo il plurale. Nessun indirizzo salvato smette di funzionare, e nessuno
dei due sensi di lettura vive in due posti.

### Insieme vuoto = nessuna restrizione = Tutti, **ovunque**

La regola non vale solo per la UI: deve leggersi allo stesso modo in **interfaccia, indirizzo,
parser, API e riepilogo**. Da cui due conseguenze che vanno scritte, perché sono il punto in cui
un'implementazione fedele può divergere lo stesso:

- **Un insieme che contiene tutti i valori si normalizza a vuoto.** Altrimenti `origini=a,b,c,d` e
  l'assenza del parametro sarebbero due scritture della stessa domanda, e due indirizzi diversi per
  la stessa schermata — che è come nascono le divergenze fra stampa ed elenco.
- **Vuoto non diventa mai un `in: []` nella query.** Un `in` con l'insieme vuoto in Prisma non
  significa «tutti»: significa **niente**. Il filtro va omesso, non passato vuoto — ed è il modo più
  facile di trasformare «Tutti» in «nessuna riga».

### Il riepilogo segue la selezione — ed è un CAMBIO di comportamento

Oggi **tutti i campi economici del riepilogo ignorano il filtro Tipo**: `getSummary` non ha gli
interruttori `wantsSales`/`wantsRefunds` che l'elenco applica nel servizio, e interroga le
rettifiche con `rowType: undefined` esplicito. Era deliberato — «filtrando Resi il totale deve
continuare a dire quanto si è incassato, non −205,01, che qualcuno trascriverebbe».

**La proprietà che ora si pretende è più forte**, e le due non convivono:

> **A parità di filtri, la somma dei sottoinsiemi deve fare il riepilogo del periodo.**

Se i giorni filtrano e il periodo no, non possono riconciliarsi per costruzione. Il riepilogo segue
quindi la selezione — e la vecchia preoccupazione cade da sé con la multi-selezione: con Vendite +
Resi + Rimborsi spuntati (il default) il numero è quello di sempre, e un totale di soli resi non ha
bisogno di un'etichetta speciale perché **è** il totale di ciò che si è chiesto di vedere.

⚠️ Resta preesistente e da verificare un'incoerenza interna: `locationUndeterminedExcludedCount`
riceve la query intera e quindi **segue** il Tipo, mentre l'economia no. Già oggi il riepilogo non
è coerente con sé stesso.

### ⚠️ `max(0, …)` esce dalla matematica: il massimo non distribuisce

```text
Σ(totale − imposta)         =  Σtotale − Σimposta          ✅ additiva
Σ max(0, totale − imposta)  ≠  max(0, Σtotale − Σimposta)  ❌
```

Due campi lo usano: `taxableMinor` e `netTaxableMinor`. Il clamp scatta su un sottoinsieme in cui le
rettifiche superano le vendite: quello esce 0 invece del suo valore negativo, e la somma delle parti
supera il tutto.

**Togliere il clamp non cambia il significato economico di nessuna sorgente**: cambia che un
imponibile netto negativo viene detto invece di essere schiacciato. Ed è già ciò che il Registro fa
**sulle righe**, dove un reso mostra −73,24 €.

È lo stesso principio della dottrina del denaro — _si arrotonda solo all'uscita_ — applicato al
clamp: **si clampa solo all'uscita, mai dentro il calcolo.** L'accumulatore resta fatto di sole
somme e differenze, quindi additivo per costruzione, e «Σparti = tutto» diventa un test che non può
passare per caso.

### L'ordine dei due blocchi, e perché non si invertono

| Blocco | Contenuto                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------- |
| **A**  | filtri a insieme, Ambito scorciatoia, riepilogo che segue la selezione, clamp fuori, accumulatore unico |
| **B**  | preset Oggi/Ieri/Giorno, `Raggruppa: Giorno`, subtotali giornalieri, PDF ed Excel fedeli alla vista     |

B poggia su A: un subtotale giornaliero non si può scrivere prima di sapere **quale insieme
rappresenta**, e il PDF non può riprodurre fedelmente una vista che sta ancora cambiando forma.
Farli insieme significherebbe scrivere due volte lo stesso accumulatore.

### Gli Annullamenti restano fuori dai tipi selezionabili

Oggi non sono un tipo di riga: sono esclusi **sempre** dalle righe (`kind: { not: cancellation }`) e
contati a parte nel riepilogo, perché la vendita che annullano non è mai entrata nel registro
(specifica `08` §4). Renderli selezionabili significherebbe mostrare righe **con un importo che non
deve entrare in nessun totale** — una riga che si legge diversamente da tutte le altre. Restano dove
sono: dichiarati nel riepilogo, fuori dall'elenco.

---

## §17 · Come si legge il Registro — 18/08/2026

_Consuntivo di ciò che è **realmente implementato**, non un disegno. Aggiorna il §3 e chiude il §16: ciò che lì era deciso, qui è misurato._

### La barra filtri

```text
Periodo: Ultimi 30 giorni   Origine   Tipo   Sede   Raggruppa: Nessuno
```

**Solo Periodo e Raggruppa mostrano il valore.** Origine, Tipo e Sede dicono **soltanto il proprio nome**, sempre, qualunque cosa sia spuntato.

⚠️ **Non è minimalismo: è che i controlli non devono ballare.** Il trigger predefinito mostra la selezione, e «Tutte» è largo un terzo di «Vendita al banco, Corrispettivo manuale»: a ogni spunta il filtro accanto si spostava di lato. Su una schermata che si consulta con la coda dell'occhio è rumore continuo, e a barra chiusa quel dettaglio non serve — chi vuole sapere cosa è selezionato apre il menu.

Che un filtro stia **restringendo** si vede dallo **stato premuto**: stesso testo, stessa larghezza, stesso padding, stessa posizione. `labelOnly` su `app-select-menu`, spento per default — le altre 178 istanze non cambiano.

⚠️ Lo stato premuto predefinito faceva posto alla **×** che azzera il filtro, e quel padding sposta il testo. In questa modalità la × non c'è e la chevron resta al suo posto: il punto è che **niente si muova**. Il filtro si azzera dal menu, che è dove si è appena stati.

### Le scorciatoie stanno dentro il menu Origine

| Scorciatoia    | Spunta                                                     |
| -------------- | ---------------------------------------------------------- |
| **Tutte**      | nessuna restrizione — insieme vuoto                        |
| **Online**     | Shopify online                                             |
| **Fisico/POS** | Shopify POS · Vendita al banco · **Corrispettivo manuale** |

⚠️ **Lo stato attivo si DERIVA dall'insieme, non si conserva.** Una scorciatoia è accesa solo se le origini coincidono **esattamente** col suo preset: cliccando «Fisico/POS» e togliendo poi Shopify POS, la scorciatoia si spegne da sé. Non compare nessun «Personalizzato» — non c'è uno stato in più da spiegare, c'è solo l'insieme.

Un valore conservato accanto all'insieme sarebbe una **seconda verità**, e due verità che possono divergere sono precisamente il difetto per cui «Ambito» è stato ritirato da filtro.

**Nessuna casella «Tutti» dentro i menu**: assenza di restrizione **è** «tutti», e una casella con quel nome accanto alle voci crea lo stato contraddittorio «Tutti spuntato insieme ad alcune».

### Il periodo comprende la giornata singola

Oggi · Ieri · Giorno specifico, oltre ai preset esistenti.

⚠️ **Non introducono una seconda semantica della data**: sono intervalli con inizio e fine sullo stesso giorno, risolti dalle stesse funzioni UTC di tutti gli altri preset. Un secondo modo di intendere «giorno» sarebbe la premessa di un Registro che mostra righe diverse a seconda di come si è scelta la data.

«Giorno specifico» ha un **campo suo** e non riusa quello «da»: sono due domande diverse, e un campo che cambia significato col preset è il modo in cui si chiede «dal 17» e si ottiene «il 17 e basta».

> **Periodo e raggruppamento sono due cose diverse**: il primo decide QUALI dati appartengono all'insieme, il secondo COME si legge un intervallo che ne contiene più d'uno.

### La vista per giornata

```text
Data: 18/08/2026
  Vendita   Corrispettivo manuale 3   …
  Vendita   Corrispettivo manuale 2   …
  Reso      #1008                     …
  Totale giornata            293,44 €   64,56 €   358,00 €

Data: 17/08/2026
  …
```

**Una riga di subtotale, non una card.** Cade nelle **stesse colonne economiche** delle righe che chiude, ed è metà del suo valore: su un registro contabile un numero si verifica incolonnandolo sopra quelli che lo compongono, non affiancandolo in un riquadro.

Il raggruppamento è una **piegatura** dell'elenco, non un secondo elenco: stesse righe, stesso ordine canonico — giorno economico DESC, istante reale DESC, `rowId` come terzo livello — e le righe di una giornata sono già contigue per costruzione. Il markup della riga sta in un `ng-template` e si riusa nei due rami: due copie divergerebbero alla prima colonna aggiunta.

### ⚠️ La matematica: il totale del periodo È la somma delle giornate

```ts
perGiornata = accumulaPerGiorno(...); // stesso accumulatore, per bucket
totale = totaleDaiGiorni(perGiornata);
```

La proprietà richiesta —

```text
somma Imponibile dei giorni = Imponibile periodo
somma IVA dei giorni        = IVA periodo
somma Totale dei giorni     = Totale periodo
```

— **non è verificata: è costruita.** Non esistono due percorsi che potrebbero divergere; ne esiste uno solo, letto a due granularità.

⚠️ **Funziona solo perché l'accumulatore è fatto di sole somme e differenze.** Se qualcuno ci rimettesse dentro un clamp, quella riga comincerebbe a mentire — ed è il motivo per cui è stato tolto, non un ripensamento estetico. Una giornata con rettifiche superiori alle vendite ha un totale **negativo**, e lo mostra col suo segno.

`giornoEconomico` è **una** definizione, la stessa di ordinamento e filtri: due letture di «giorno» darebbero un raggruppamento che non combacia con l'ordine delle righe — una giornata spezzata in due blocchi, o una riga sotto l'intestazione sbagliata.

Il **riepilogo del periodo non cambia** accendendo il raggruppamento: cambia solo la lettura delle stesse registrazioni.

### Due famiglie di export

| Uscita     | Cos'è                 | Rispetta                                                                 |
| ---------- | --------------------- | ------------------------------------------------------------------------ |
| **PDF**    | la **vista corrente** | periodo · filtri · ordinamento · **raggruppamento** · **colonne accese** |
| **Excel**  | la **vista corrente** | le stesse cinque cose                                                    |
| **CSV**    | export **dati**       | il sottoinsieme filtrato, e basta                                        |
| **Stampa** | funzione **separata** | da progettare a parte — non è il PDF su carta                            |

⚠️ **Il CSV ignora raggruppamento e colonne di proposito.** Una riga per evento, nessuna riga artificiale di subtotale, e le **dodici colonne storiche nella stessa posizione**: qualcuno ci ha agganciato un foglio, e spostargliele sotto i piedi romperebbe il suo lavoro senza che da questa parte se ne accorga nessuno. Un test gli passa i parametri di presentazione e verifica che non cambi niente.

⚠️ **Il subtotale nei file non si ricalcola dalle righe**: arriva dallo stesso accumulatore del totale del periodo, di cui è un addendo. Sommare le righe del foglio sarebbe la seconda matematica, e il piede di una giornata potrebbe non fare più il totale in fondo.

Le colonne del PDF erano **otto, scritte a mano** nel renderer: chi spegneva Cliente dal selettore se lo ritrovava nel file, chi accendeva Sede no. Ora derivano dalla vista, e la traduzione fra i due vocabolari — id di colonna contro intestazioni del file — sta in **una** tabella esplicita.

### Il limite delle cento righe non torna

Il Registro è delimitato dal **periodo e dai filtri**, non da un numero di righe. Se il sottoinsieme ne contiene 850, si consultano 850.

Non si reintroducono paginazione funzionale, «Carica altre», scroll infinito, tagli silenziosi né un `pageSize` che tagli. `page` e `pageSize` restano nel contratto ma **non decidono più niente**, e un test lo presidia — un parametro accettato e ignorato è il difetto di `onlineOnly`, che quest'area ha già pagato una volta.

Il tetto tecnico di fusione resta **fuori da questo lavoro**.

---

## §18 · Il Reso al banco entra nel Registro — 19/08/2026, fatto e verificato

> **`store_return` è la QUINTA sorgente del Registro: una sorgente documentale
> autonoma, non un allargamento del ramo `store_sale`.**

Fino al 18/08 il Registro leggeva un tipo documento solo, e la conseguenza era misurata
in `11` B13: **nessun reso di cassa diminuiva l'incasso lordo**. Ora lo diminuisce.

### ⛔ Perché non si allarga il filtro esistente

`type: { in: [store_sale, store_return] }` è una riga sola, sembra la modifica ovvia, e
produce un errore di **segno**. Il reso entrerebbe dal ramo che mappa `kind: 'sale'` con
importi positivi e lo conta in `orderCount`:

```text
un reso da 100 €   ALZEREBBE il registro di 100 invece di abbassarlo
                   200 € di scarto, e comparirebbe filtrando «Solo vendite»
```

È la stessa regola che l'enum `DocumentType` dichiara per la **Nota di credito**:
_«quantità e importi restano POSITIVI: il verso economico negativo lo dà il TIPO, mai il
segno nella quantità»_. Qui il tipo lo dichiara una sorgente separata.

### Il contratto, per intero

|                         | `store_sale`                              | `store_return`                                                  |
| ----------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| `kind`                  | `sale`                                    | **`refund`**                                                    |
| `refundKind`            | —                                         | **`return_with_restock`** → etichetta **«Reso»**, già esistente |
| importi **nella vista** | positivi                                  | **negativi**                                                    |
| conteggio               | `orderCount`                              | **`refundCount`**                                               |
| interruttore            | `wantsSales`                              | **`wantsReturns`**                                              |
| Origine                 | Vendita al banco · Fisico/POS · VestiFlow | **la stessa**                                                   |

⚠️ **Due convenzioni di segno, e vanno tenute distinte.** Nelle RIGHE gli importi sono
negativi — è ciò che rende la colonna sommabile a occhio. Al RIEPILOGO arrivano
**positivi**, perché lì c'è una sottrazione:

```text
netTotal = total − refundTotal          refundTotal resta POSITIVO
```

Passarli negativi anche là li farebbe **sommare**, e il netto salirebbe invece di scendere.

### ⚠️ `wantsReturns`, non `wantsRefunds`: un reso non è un rimborso

`wantsRefunds` è la disgiunzione «resi O rimborsi», e serve ad accendere la sorgente delle
rettifiche Shopify; dentro quella sorgente il genere si distingue poi nella clausola `kind`
(`returns` → `return_with_restock`, `refunds` → `refund_only`).

Il Reso al banco è una sorgente **intera di un genere solo**: la distinzione che là avviene
nella clausola, qui deve avvenire **nell'interruttore**.

> **«Solo rimborsi» NON include il Reso al banco.**

⛔ Sull'interruttore sbagliato lo stesso reso cadeva in due sottoinsiemi che la maschera
presenta come distinti, e la proprietà dichiarata dal modulo — _somma dei sottoinsiemi =
riepilogo del periodo_ — cadeva sulla partizione a tre.

| filtro                                            | il Reso     |
| ------------------------------------------------- | ----------- |
| Tutti · Solo resi · resi+rimborsi · `refundsOnly` | **c'è**     |
| Solo vendite · **Solo rimborsi**                  | **non c'è** |

### ⚠️ «Carica giacenze» non decide la presenza economica

> **Un Reso con la spunta magazzino spenta su TUTTE le righe non genera alcun movimento,
> e nel Registro entra lo stesso, come rettifica negativa.**

La spunta decide se la merce **rientra in giacenza**; il Registro registra che il cliente
**ha reso**, e quanto gli si è reso. Un capo difettoso torna, si rimborsa, in magazzino non
ci va — e il corrispettivo va abbattuto lo stesso, perché il denaro è uscito.

Il Registro quella spunta **non la filtra e non la legge affatto**: nessuna clausola su
`lines`, nessun `loadsStock` nel `select`. Tre prove lo inchiodano.

### Il Registro non tocca il magazzino, e ora è presidiato

Sei endpoint, tutti `GET`; nessuna scrittura Prisma nel modulo. Era un fatto **misurato ma
non presidiato**: la guardia ora esercita elenco, riepilogo, sedi e i **tre** export su
dieci combinazioni di filtri, e verifica ogni spia di `stockMovement` e `inventoryLevel`
più `$transaction` e `$executeRaw`.

⚠️ **Provata rossa**, iniettando una lettura di movimenti: due prove falliscono. Morde
anche su una lettura, non solo su una scrittura.

### Cosa NON è servito, e perché è la conferma che la forma era giusta

- **Nessuna Origine nuova.** Il Reso ha la stessa origine della vendita che rettifica:
  dargliene una propria farebbe vedere, a chi filtra «Vendita al banco», le vendite al
  **lordo** delle rettifiche che le abbattono — su un registro fiscale.
- **Nessun valore nuovo nel filtro Tipo.** `returns` esiste e significa già «la merce è
  tornata». Non mancava un valore: mancava una **sorgente**.
- **Niente lato client.** Non filtra né classifica per tipo documento — non conosce il
  concetto. `return_with_restock` è già etichettato «Reso», lo stile del negativo è già
  agganciato a `kind === 'refund'`, e la colonna Tipo è già accesa in tre preset su sei.
- **Nessuna riga in `sales_order_refunds`.** Quella tabella ha un solo produttore in tutto
  il backend, la sincronizzazione Shopify, e pretende un `salesOrderId` che un reso al
  banco non ha. È ciò che esclude il doppio conteggio alla radice.

### Il commento interno non esce

La riga porta `notes`, la nota **pubblica**, come fa la rettifica Shopify. La causale del
reso vive in `internalComment` e lì resta: è un campo che si chiama interno, e finirebbe nel
file che va al commercialista mentre le note pubbliche dello stesso documento non ci vanno.
Una guardia verifica che «Causale reso» non compaia né nella riga né nel CSV.

_Mostrare anche la causale è una decisione separata, e riguarda tutti i documenti._

### Verificato sul database reale

Non solo a prove unitarie. Vendita 100,00 e Reso 30,00 su un tenant di prova, letti dal
servizio vero:

```text
riepilogo   vendite 100,00   rettifiche 30,00   netto 70,00   (vendite 1 · resi 1)

Tutti · Solo vendite · Solo resi · Solo rimborsi · refundsOnly · Origine · export
elenco, tetto di fusione, riepilogo, subtotali per giorno, righe senza sede: coerenti
somma delle righe esportate = netto del riepilogo
zero movimenti di magazzino creati dal Registro
```

Più il caso della spunta spenta, con giacenze invariate prima e dopo tutte le letture.

---

## §19 · Il Registro è diventato la grammatica di tutti — 20/08/2026

Il proprietario ha indicato questo Registro come **riferimento grafico di partenza** dei
riepiloghi (`14` §F5). Le sette divergenze fra la sua tabella e il motore comune sono state
misurate, messe a confronto sui dati veri, e **decise tutte nella forma del Registro**:

```text
font 12px · padding 4×12 · intestazione 32px MAIUSCOLA
niente divisori di colonna · larghezze sul contenuto · token dedicati §2
```

⭐ **Non è più «la grafica dei Corrispettivi»: è la grammatica dei riepiloghi**, e vive nel
mixin `summary-grammar()`. Le quattro schermate già sul motore la ereditano; gli altri elenchi
la adottano con una riga.

⚠️ **Con una modifica che tocca anche questa schermata**: `--color-table-header-fg` è stato
scurito da #3f4c51 a **#2f3d43** — contrasto da 7,5:1 a 9,5:1 — su richiesta esplicita. Il
Registro usa quel token, quindi la sua intestazione cambia con tutte le altre.

### Che cosa resta suo, e non si promuove

- l'**accento laterale per tipo** e il fondo della rettifica;
- la **giornata come raggruppamento**, col suo piede;
- la **card mobile progettata** (§17), che è il riferimento mobile dei riepiloghi ma **non**
  entra nel motore finché i Corrispettivi non ci entrano.

### ⛔ Due misure che riguardano questo documento

1. **Le righe espandibili non esistono**, né desktop né mobile: i due `colspan` sono
   l'intestazione di giornata e l'etichetta del subtotale, e il chevron della card **naviga**.
   Era stato censito come «capacità che manca al motore»: non manca, non c'è.
2. **`documentId` c'è già lato API** (`corrispettivi.service.ts`, valorizzato sulle righe di
   banco) e **si perde nel DTO del client**. È il campo che servirebbe per dare a quelle righe
   un pulsante «Dettaglio»: manca un mapping, non un dato.

⏸ **Il gap vero del Dettaglio qui è il Corrispettivo manuale**, che ha una maschera di
modifica e nessuna vista di consultazione. È una decisione di prodotto, non un lavoro tecnico.
