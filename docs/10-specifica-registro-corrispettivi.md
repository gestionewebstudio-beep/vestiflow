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

| Filtro           | Valori                                                      |
| ---------------- | ----------------------------------------------------------- |
| **Periodo**      | preset + intervallo personalizzato                          |
| **Ambito**       | Tutti · Online · Fisico/POS                                 |
| **Canale**       | Tutti · Shopify · VestiFlow · canali futuri                 |
| **Tipo evento**  | Vendita · Reso · Rimborso/rettifica                         |
| **Fatturazione** | fatturato / non fatturato — **mai** come flusso di consegna |

L'operatore inesperto entra e vede il quadro generale. Chi sa cosa cerca sceglie periodo e
filtri, poi stampa o esporta **quel** sottoinsieme.

**Stato al 16/08, sera:** Periodo, **Ambito**, **Canale** e Tipo evento ci sono — ambito e
canale come **dimensioni distinte derivate dall’origine** (`11` §21). Resta fuori la sola
**Fatturazione** —
vedi §7.

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
2. **le vendite negozio VestiFlow** oggi **non entrano affatto** nel Registro — specifica
   dedicata in **`11-specifica-vendita-al-banco.md`**, che decide il risultato (`Fisico/POS ·
VestiFlow`) e lascia aperto il meccanismo. Sono `Document`
   di tipo `store_sale`, non `SalesOrder`, e il Registro aggrega solo i secondi. Il §2 dice che
   devono esserci.

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
è tracciato come lacuna del blocco sincronizzazione (`02` e `DA-FARE-CORRISPETTIVI-E-SHOPIFY`).

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
