# 25 — Specifica Cassa

_Contratto della **Cassa** di VestiFlow e della sua separazione dalla **Vendita al
banco**. Scritta il 04/09/2026 come tranche **C0** del recupero da
`origin/feature/cassa`, che resta sorgente storica in sola lettura._

> ⛔ **Questo documento non è la specifica della Vendita al banco.** Quella è
> `docs/11-specifica-vendita-al-banco.md` e **non cambia**. Qui si descrive un flusso
> operativo diverso che _usa_ quel documento, non lo sostituisce.

---

## 0. Le decisioni vigenti

| #   | Decisione                                                                                     | Dove si argomenta |
| --- | --------------------------------------------------------------------------------------------- | ----------------- |
| 1   | Vendita al banco e Cassa sono **due flussi distinti**, su **rotte separate**                  | §1, §3            |
| 2   | La Cassa produce una **normale `store_sale`**: nessun secondo documento economico             | §4                |
| 3   | La Vendita al banco conserva `cash \| card \| other`; la **Cassa usa `PaymentOption`**        | §5                |
| 4   | «Misto» è **calcolato a lettura dalle quote**, mai persistito                                 | §6                |
| 5   | `PaymentOption` va esteso: la migration è di **C2A**. la classe operativa è **C2B**           | §7                |
| 6   | Le sei tabelle esistono già nel database: **non si ricreano**                                 | §8                |
| 7   | Una sede ha **principale + riserva**, non due postazioni. Il dispositivo è **della sessione** | §10               |
| 8   | Ogni RT ha **numerazione e chiusura proprie**: si conserva sempre **chi ha emesso**           | §10               |
| 9   | La Cassa classifica i Tipi pagamento con `PaymentTenderKind`: **operativa**, non fiscale      | §7                |
| 10  | La rappresentazione fiscale AdE e il protocollo del dispositivo stanno in **C5**              | §10, §15          |

In caso di contrasto fra questo elenco e il corpo del documento, **vale l'elenco**.

---

## 1. Le due cose, e perché non sono la stessa

### Vendita al banco — un documento gestionale

È il normale documento modellato sulla schermata Danea: testata, righe, numero, serie,
data, cliente facoltativo, prezzi, IVA, totali, note. Si modifica secondo il contratto
documentale comune.

⛔ **Non è un carrello, non è una mini-cassa.** Non richiede una sessione, non richiede un
POS, non emette il documento commerciale. **Deve funzionare senza il modulo Cassa e senza
alcun registratore telematico configurato**, ed è il caso di ogni tenant che oggi la usa.

### Cassa — un flusso operativo

Interfaccia rapida a carrello, scanner, pagamento immediato ed eventualmente suddiviso,
contanti ricevuti e resto, sessione di apertura e chiusura, terminale POS, emissione del
documento commerciale via RT, esiti e ritentativi fiscali.

⭐ **La Cassa può creare una Vendita al banco come documento sottostante**, e lo fa: ma non
ne sostituisce la schermata e non introduce un secondo tipo di documento economico.

---

## 2. La collisione del vecchio ramo — verificata, e da non ripetere

Misurato il 04/09/2026 su `origin/feature/cassa` (`6e4f9e79`):

```text
store-sales.routes.ts   le QUATTRO rotte di /app/vendita-al-banco
                        caricavano StoreSaleRegisterComponent — il carrello
```

Su `develop` le stesse quattro rotte caricano `StoreSaleDocumentFormComponent`, e
`StoreSaleRegisterComponent` **è stato eliminato** con il rifacimento del 21/08/2026.

⛔ **Non si recuperano meccanicamente**: `store-sales.routes.ts` del vecchio ramo, i suoi
mount in `app.routes.ts`, i redirect `/app/sales/register`, le voci di menu, breadcrumb e
riquadri che chiamano «Cassa» la Vendita al banco, e `StoreSaleRegisterComponent` come
sostituto della maschera attuale.

⚠️ **Il difetto non era il carrello: era l'indirizzo.** Il carrello serve alla Cassa; ciò
che non deve accadere è che occupi le rotte del documento.

---

## 3. Le rotte

Le quattro rotte documentali **restano esattamente dove sono**, sullo stesso componente:

```text
/app/vendita-al-banco/nuova-vendita-al-banco    StoreSaleDocumentFormComponent
/app/vendita-al-banco/nuovo-reso-al-banco       StoreSaleDocumentFormComponent
/app/vendita-al-banco/vendita/:id/edit          StoreSaleDocumentFormComponent
/app/vendita-al-banco/reso/:id/edit             StoreSaleDocumentFormComponent
```

La Cassa nasce su una **radice propria**:

```text
/app/cassa              checkout
/app/cassa/reso         reso operativo, quando sarà deciso (§12)
/app/cassa/chiusure     sessioni e chiusure
```

⭐ **`cassa` in italiano è la convenzione recente**: i path di primo livello sono misti —
`customers`, `documents`, `products` in inglese, ma `vendita-al-banco`, `corrispettivi`,
`cambia-password` e `guide` in italiano, e sono i più recenti.

⛔ **`/app/vendita-al-banco` non si riusa per la Cassa**, in nessuna forma: né come figlio,
né come redirect, né come rotta gemella.

### Prove di routing obbligatorie

Devono dimostrare **contemporaneamente** che le quattro rotte documentali aprono la
maschera documentale, che `/app/cassa` apre la Cassa, e che **nessuna rotta Cassa
intercetta o sostituisce** quelle documentali.

---

## 4. La Cassa e il documento sottostante

La vendita conclusa in Cassa produce una normale **`DocumentType.store_sale`**.

⛔ **Non si crea**: un secondo documento «Vendita Cassa», una seconda tabella economica
della vendita, una seconda riga nel Registro Corrispettivi, né un tipo documento nuovo
senza prima dimostrare che quello esistente non basta.

### Come si distingue una vendita Cassa

`documents.cash_session_id` **esiste già** nel database (migration
`20260806220000_sessioni_di_cassa`, FK `ON DELETE SET NULL`) ed è il collegamento corretto.
Misurato il 04/09/2026: **0 valorizzati su 169 documenti**.

| Caso                         | Forma attesa                   |
| ---------------------------- | ------------------------------ |
| Vendita al banco ordinaria   | `cash_session_id = null`       |
| Vendita conclusa dalla Cassa | `cash_session_id` valorizzato  |
| Pagamento operativo          | righe in `store_sale_payments` |
| Documento commerciale        | relazione in `fiscal_receipts` |

⛔ **Nessun flag `isCashSale` e nessun campo origine nuovo.** Sessione, quote e ricevuta
fiscale distinguono già il flusso senza ambiguità. Se un caso reale dimostrasse il
contrario, va dimostrato **prima** di aggiungere schema.

### La sessione è obbligatoria, e non si eredita il vecchio comportamento

Una Cassa operativa ha normalmente **una sessione aperta per sede**. ⛔ Il comportamento del
vecchio ramo — «la vendita si registra comunque, senza sessione» — **non si recupera
automaticamente**: senza sessione non esiste una chiusura attendibile. Se emergono casi
reali che richiedono una modalità di emergenza, **si segnalano prima** di implementarla.

---

## 5. I pagamenti: due vocabolari, e uno solo è autorizzato per il nuovo codice

### Lo stato reale, misurato

⚠️ **La Vendita al banco NON usa il Tipo pagamento condiviso.** Misurato il 04/09/2026:

```text
create-store-sale.dto.ts   STORE_SALE_PAYMENT_METHODS = ['cash', 'card', 'other']
documents.payment_method   text libero: cash=17  card=3  «Bonifico bancario»=2  «Contanti»=1
```

È un **contratto legacy ancora attivo**, non il modello da copiare.

### La regola transitoria — decisa dal proprietario il 04/09/2026

> **La Vendita al banco ordinaria conserva `cash | card | other`. La Cassa usa
> esclusivamente le modalità condivise di `PaymentOption`.**

- ⛔ **C0 non cambia DTO, dati né comportamento della Vendita al banco.**
- ⛔ **`STORE_SALE_PAYMENT_METHODS` non si elimina**: sarebbe una migrazione nascosta.
- ⛔ **Il nuovo codice Cassa non scrive nulla** basato su quel vocabolario rigido.
- ⭐ La migrazione della Vendita al banco al Tipo pagamento condiviso è una **tranche
  successiva autonoma**, con censimento dei documenti e dei consumer. Non è implicita nella
  Cassa.

### L'adapter di lettura

Serve per mostrare i valori storici senza reinterpretarli:

| Valore persistito              | Mostrato                                |
| ------------------------------ | --------------------------------------- |
| `cash`                         | Contanti                                |
| `card`                         | Carta                                   |
| `other` + nota                 | Altro + nota                            |
| testo storico non riconosciuto | **così com'è**, senza reinterpretazione |

⛔ **Nessun backfill, nessuna normalizzazione cieca.**

---

## 5-bis. Le quote di pagamento: il contratto approvato per C4

⛔ **`store_sale_payments` NON si tocca in C2B.** Il contratto è approvato e scritto qui
perché C4 lo esegua senza ridiscuterlo, non perché sia già implementato.

| Campo               | Contratto                                                                    |
| ------------------- | ---------------------------------------------------------------------------- |
| riferimento al Tipo | **FK nullable** a `PaymentOption`: il Tipo può essere eliminato, la quota no |
| nome                | **snapshot immutabile**: rinominare il Tipo non riscrive le quote storiche   |
| classe              | **snapshot di `PaymentTenderKind`**, per la stessa ragione                   |
| importo             | in unità minori                                                              |
| `tenderedMinor`     | **solo per i contanti**: è il consegnato da cui nasce il resto               |
| posizione           | l'ordine in cui le quote sono state inserite                                 |
| `ticketCount`       | ⏸ **futuro**, quando i buoni saranno davvero abilitati                       |

⭐ **Gli snapshot sono la stessa disciplina delle righe documento**
(`regole-gestionale`): una quota registra un incasso avvenuto, e l'anagrafica di domani
non lo riscrive.

⛔ **`method` resta ESCLUSIVAMENTE legacy e non si sovraccarica.** È il vocabolario
`cash | card | other` della Vendita al banco (§5): estenderlo per far posto alla Cassa
creerebbe un terzo vocabolario travestito da secondo.

⛔ **«Misto» si calcola dalle quote e non si persiste** — §6, ed è una decisione già
vigente (§0.4).

### Che cosa la PRIMA versione non fa

- **completamente saldata**: la somma delle quote **è** il totale del documento. Nessun
  saldo parziale;
- ⏸ **non riscosso e la sua causale sono rinviati**: sono un concetto fiscale che vive nel
  blocco 4.1 dello schema AdE, per aliquota IVA, ed è materia di **C5**;
- ⭐ **l'elettronico lo conferma l'OPERATORE**, a mano. VestiFlow non parla col terminale
  di pagamento e non finge di averlo fatto: una risposta tecnica simulata sarebbe
  un'affermazione falsa su un incasso.

---

## 6. Il riepilogo pagamento è DERIVATO, non persistito

> **`store_sale_payments` è l'unica fonte canonica dei pagamenti Cassa.**
> «Misto» si calcola dalle quote, a lettura.

⛔ **Il codice `mixed` non si scrive in `documents.payment_method`.** Deciso dal
proprietario il 04/09/2026, correggendo una prima indicazione opposta: un valore persistito
può divergere dalle righe che dovrebbe riassumere, ed è la seconda verità che questo
progetto combatte ovunque.

### Precedenza di lettura

```text
1. esistono righe store_sale_payments  →  si usano ESCLUSIVAMENTE quelle
2. una riga                            →  riepilogo a pagamento unico
3. più righe                           →  riepilogo «Misto»
4. nessuna riga                        →  ripiego sul legacy documents.payment_method + nota
```

### Il contratto API

Il riepilogo derivato è **esplicito e distinto** dal campo persistito — il nome definitivo
segue le convenzioni correnti, il concetto no:

```ts
paymentSummary: {
  kind: 'none' | 'single' | 'mixed';
  label: string;
  payments: PaymentRow[];
}
```

⛔ **Non si sovraccarica il significato di `paymentMethod`.**

⛔ **Il dettaglio «Contanti 60,00 € + Carta 40,00 €» non si salva in
`payment_method_note`**, che resta riservato alla descrizione di un metodo «Altro». Si
calcola dalle stesse quote.

⚠️ **Un solo mapper centrale** per elenchi, dettaglio e stampe: tre letture diverse dello
stesso dato sono tre occasioni di divergere.

⚠️ **Attenzione all'N+1**: le quote si caricano per relazione o in lotto. L'indice su
`store_sale_payments.document_id` esiste già.

### Prove obbligatorie

- nessuna quota + legacy `cash` → «Contanti»;
- una quota condivisa → metodo unico;
- due quote 60+40 → «Misto»; tre quote → sempre «Misto»;
- modifica delle quote → riepilogo aggiornato da sé;
- quote e campo legacy **divergenti** → prevalgono le quote;
- **nessun codice applicativo scrive `mixed`** in `documents.payment_method`;
- nessun filtro o totale del Registro dipende dal campo legacy quando esistono le quote.

---

## 7. `PaymentOption`: il censimento di C0 e il contratto per C2

### Lo stato reale

```prisma
model PaymentOption {
  id  tenantId  kind (method|terms)  name  sortOrder  isSystem  isActive
}
```

⛔ **Nessuna classificazione.** Il codice normativo sta **dentro l'etichetta** —
`"Contanti (MP01)"`, `"Carta di pagamento (MP08)"` — e le anagrafiche ne salvano il **nome**
come snapshot.

⚠️ **E FatturaPA oggi non emette `ModalitaPagamento` proprio per questo.**
`fatturapa-xml.util.ts` lo dichiara: _«è un codice normativo MP01–MP23 che VestiFlow non
gestisce come tale, quindi NON viene emesso: sarebbe un valore inventato»_. L'estensione
sbloccherebbe anche quello — ma è una **decisione fiscale a sé**, non un effetto collaterale
da dare per scontato.

### Il censimento — 24 consumer, misurati il 04/09/2026

**API (11)** — `payment-options/` (service, controller, dto, seed, module), `app.module`,
`admin/tenant-delete.util`, `tenant-backup/` (export, import, constants),
`unit-of-measure-options.service`.

**Frontend (13)** — `core/models/payment-option.model`, `core/services/payment-options.service`,
`domain/customers/customer-form-fields`, `domain/suppliers/supplier-form-fields`,
`features/customers/customer-form`, `features/suppliers/supplier-form`,
`features/documents/document-list`, `features/documents/goods-receipt-form`,
`features/documents/purchase-invoice-form`, `features/orders/supplier-order-form`,
`features/sales-orders/customer-order-form`, `features/settings/payment-options-page`,
`features/settings/settings.routes`.

⚠️ Il **backup di tenant** è fra i consumer: export e import devono continuare a funzionare
con i campi nuovi assenti.

### ⭐ Il modello di destinazione è GIÀ DECISO, e non è della Cassa

⛔ **Qui stavo per progettare un contratto nuovo. Era sbagliato.** La specifica
**Pagamenti/Tesoreria §2.1–2.3** definisce già il modello a **due livelli**, e il suo
vincolo è esplicito: _«Se il catalogo normativo esiste già nel repository, riusarlo e
correggerlo; **non crearne uno parallelo**»_.

```text
Modalità pagamento   catalogo NORMATIVO condiviso, con il codice FatturaPA   Bonifico → MP05
Tipo pagamento       preset AZIENDALE che punta a una Modalità              «Bonifico 60 gg F.M.»
```

⚠️ **Lo scarto fra quel modello e il codice**: `PaymentOption.kind` vale `method | terms`,
cioè **modalità e condizioni sono due elenchi paritari**, e il codice normativo non esiste
come dato — sta dentro l'etichetta. Manca il livello «Tipo che punta a una Modalità», e
manca il campo `code`.

⭐ **Quindi C2 non inventa niente per la Cassa: implementa ciò che la Tesoreria ha già
deciso**, e la Cassa è il primo consumatore che lo rende necessario. Il catalogo ufficiale
MP01–MP23 è in `Tesoreria §2.2`, e nel repository esiste già come
`SDI_PAYMENT_METHOD_NAMES` — da **correggere**, separando il codice dal nome, non da
duplicare.

### ⭐ C2A — il progetto, deciso dal proprietario il 04/09/2026

```prisma
/// GLOBALE, di sistema: le Modalità normative FatturaPA. Nessun tenantId.
model PaymentMethodCode {
  id        String  @id @default(uuid()) @db.Uuid
  code      String  @unique          // MP01…MP23
  label     String
  sortOrder Int
  isActive  Boolean @default(true)
  paymentOptions PaymentOption[]
}

model PaymentOption {                // invariato, più UN campo
  …
  methodCodeId String?            @map("method_code_id") @db.Uuid
  methodCode   PaymentMethodCode? @relation(fields: [methodCodeId], references: [id])
}
```

⭐ **UNA sola colonna codice, non `key` + `officialCode`.** Il catalogo ha un compito
preciso — rappresentare MP01–MP23 — e dentro quel perimetro le due colonne sarebbero
**identiche su tutte e 23 le righe**. In `VatNature` sono distinte per due ragioni che qui
non esistono: il formato differisce (`N2_1` contro `N2.1`) e quattro voci non hanno codice
normativo.

⛔ **PayPal e Contrassegno NON entrano nel catalogo.** Restano `PaymentOption` aziendali con
`methodCodeId` nullo finché l'utente non assegna una Modalità. Se un domani serviranno
modalità operative non normative, saranno **un concetto distinto** — non righe finte accanto
agli MP.

**Vincoli strutturali**

|                |                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `code`         | obbligatorio e **unico**                                                                                                  |
| FK             | `ON DELETE RESTRICT`: il catalogo si **disattiva**, non si cancella lasciando Tipi orfani                                 |
| `methodCodeId` | valorizzabile **solo** per `kind = method`; su `terms` sempre `NULL`. È un `CHECK` nella migration: Prisma non lo esprime |
| RLS            | `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL FROM anon, authenticated`, come ogni catalogo di sistema                        |
| seed           | **strutturato** (`code`, `label`, `sortOrder`), mai ricostruito dal nome                                                  |

### Il backfill: una whitelist dichiarata, mai una regex

⛔ **`MPxx` non si estrae MAI dall'etichetta** — né con espressioni regolari, né con
suffissi, né con parsing. Si usano **due mappe esatte**, limitate a `kind = method` **e**
`is_system = true`.

Le cinque voci legacy collegabili, decise una per una:

```text
Contanti            → MP01        Contrassegno   → NULL
Assegno             → MP02        PayPal         → NULL
Bonifico bancario   → MP05
Carta di pagamento  → MP08
RiBa                → MP12
```

⚠️ **`Contrassegno` resta scollegato di proposito**: descrive il momento e il canale
d'incasso, non come il cliente pagherà al corriere. **`PayPal`** non ha una corrispondenza
normativa univoca da assumere.

**Risultato atteso sui dati censiti** (148 righe, 4 tenant):

```text
 92  voci moderne collegate      (23 codici × 4 tenant)
 20  voci legacy collegate       ( 5 voci   × 4 tenant)
  8  legacy ancora NULL          ( 2 voci   × 4 tenant)
 28  terms NULL
───
112  collegate  ·  36  NULL  ·  148 totali
```

⛔ **Gli snapshot su documenti, clienti e fornitori NON si toccano.**

### Che cosa C2A non fa

- ⛔ non emette `ModalitaPagamento` nell'XML FatturaPA: è un intervento fiscale separato, con
  prove contro XSD e documenti storici;
- ⛔ non modifica alcun consumer documentale;
- ⛔ non introduce la classe RT.

### ⭐ C2B — la classificazione OPERATIVA, decisa il 04/09/2026

⛔ **Qui c'era «la classificazione RT, NON autorizzata»**, e la verifica normativa del
04/09/2026 ha smentito la premessa su cui era costruita: lo schema AdE **non ha un enum di
quattro valori**. I `Pagato*` stanno nel blocco 4.2, i `NonRiscosso*` nel **4.1 per
aliquota IVA**, `<Ticket>` porta importo **e conteggio**, `<ScontoApagare>` è un concetto a
sé. Non esisteva la cosa che si voleva modellare.

> **C2B non classifica per l'RT: classifica per il CHECKOUT.** È la domanda operativa —
> «questo Tipo pagamento si può incassare al banco, e come si comporta la maschera?» — e
> non ha bisogno di nessun dispositivo per essere risposta.

```prisma
enum PaymentTenderKind {
  cash
  electronic
  voucher
}

tenderKind PaymentTenderKind? @map("tender_kind")   // su PaymentOption
```

#### Il contratto, per differenza

⭐ **`NULL` è uno stato pieno e frequente**: «questo Tipo non è utilizzabile nella Cassa».
Bonifico, RIBA, MAV e le condizioni di pagamento restano `NULL` e devono restarci.

⛔ **Che cosa NON è**, e ognuna è una confusione che costerebbe cara:

| Non è                       | Perché la distinzione conta                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `PaymentMethodCode`         | quello è il **catalogo normativo globale** (MP01–MP23); questa è una proprietà del **tenant** |
| un codice **MP FatturaPA**  | MP01 e MP04 sono entrambi «contanti» per la normativa, ma solo uno si incassa al banco        |
| un valore di **protocollo** | nessun produttore, nessun numero di `paymentType`: il protocollo è **C5**                     |
| il **non riscosso**         | quello è fiscale, sta nel blocco 4.1 per aliquota, ed è **C5**                                |

⚠️ **`voucher` si modella ma NON è selezionabile nella prima versione del checkout.** Un
buono ha un conteggio oltre all'importo (`<Ticket>` porta entrambi) e regole di resto
proprie: modellarlo ora costa una riga di enum, aggiungerlo dopo costerebbe una migration
sull'enum. Abilitarlo è una decisione separata.

#### Il backfill: una mappa dichiarata, e solo due voci

⛔ **Non si deduce dal nome visualizzato** — l'utente lo rinomina — **né automaticamente
dal catalogo normativo**: «tutte le MP0x sono contanti» è falso, e sarebbe una regola
inventata.

⭐ **La chiave della mappa è il CODICE normativo, non il nome**, e la ragione è la
condizione che questa tranche deve garantire: _rinominare un Tipo non cambia la
classificazione_. Una mappa per nome la violerebbe per costruzione.

```text
MP01  Contanti              → cash          l'unico contante che si incassa al banco
MP08  Carta di pagamento    → electronic    il POS
tutto il resto              → NULL
```

⚠️ **Si applica alle sole voci di SISTEMA** (`is_system = true`) già collegate a quel
codice. Le voci personalizzate del tenant non si classificano da sole: chi le ha create
sa cosa sono, e la Cassa non deve indovinarlo.

⚠️ **L'assegno resta `NULL`**, ed è una scelta: non è contante e non è elettronico. Il
titolare può classificarlo dalle Impostazioni se al suo banco lo accetta.

### ⛔ Il ramo NON gira contro il database condiviso finché C2A non vi è applicata

`regole-qualita` lo dice senza sfumature: _«`prisma generate` da solo rompe l'applicazione.
Il client rigenerato seleziona le colonne dello schema, e se una di quelle nel database non
c'è ancora, **ogni lettura di quella tabella va in 500**»_. Con C2A `payment_options`
acquisisce `method_code_id`: sul database condiviso quella colonna **non esiste**, quindi
andrebbero in errore le dodici chiamate di `payment-options.service`, del backup di tenant
e dell'eliminazione tenant — e `list()` la invocano clienti, fornitori, documenti, ordini e
Impostazioni.

⭐ **Deciso il 04/09/2026: il ramo resta isolato.** La migration si applica e si collauda
**solo** sul PostgreSQL usa-e-getta (`docker-compose.test.yml`, porta 5433). Su
`feature/recupero-cassa` non si eseguono `start`, `start:dev`, E2E né integrazioni puntate
al condiviso.

⚠️ **Non si aggirano l'assenza della colonna** con query manuali o compatibilità dinamiche:
sarebbe codice scritto per nascondere uno stato, e resterebbe lì dopo.

**Prima del merge in `develop`**, con procedura distinta e autorizzata: verificare lo stato
del database condiviso, creare un punto di sicurezza dei dati coinvolti, applicare la
migration additiva, verificare che il codice **precedente** continui a funzionare, e solo
allora unire.

### Il rollback, che non è un `DROP`

⛔ **Non si descrive questa migration come «reversibile facendo `DROP`».** Il database è
condiviso: eliminare colonne o tabelle è una perdita, non un ritorno indietro.

⭐ **Il rollback ammesso è distribuire temporaneamente il codice precedente sopra lo schema
additivo.** Ne discende un vincolo sulla migration: deve essere **compatibile con il codice
vecchio** — colonna nullable, nessun `NOT NULL`, nessuna rinomina, nessun `DROP`.

---

## 8. Lo schema dormiente

Le tabelle **esistono già** nel database condiviso e **non sono** nel Prisma corrente.
Misurato il 04/09/2026:

```text
store_sale_payments       1 riga  (22/07/2026, un documento store_sale con payment_method='cash')
cash_sessions             0
cash_session_movements    0
fiscal_devices            0
fiscal_receipts           0
pos_terminals             0
documents.cash_session_id 0 valorizzati su 169
```

⛔ **Non si ricreano e non si modificano le migration già applicate.** C1 aggiunge a
`schema.prisma` soltanto i modelli e le relazioni corrispondenti, con `@map`/`@@map`
**esatti**, verificando indici, FK, cancellazioni, tenant e location.

⚠️ **La riga legacy si tratta, non si cancella e non si estende con un backfill cieco.** È
un pagamento che duplica `documents.payment_method` dello stesso documento: la precedenza di
lettura di §6 la fa già prevalere sul campo legacy, ed è il comportamento voluto.

---

## 9. Quadratura del checkout

Una vendita Cassa con totale maggiore di zero si conclude **solo** quando: esiste almeno una
quota valida, ogni quota è positiva, la somma delle quote **coincide esattamente** con il
totale lordo, non esiste residuo, l'eventuale carta è stata accettata, e i contanti ricevuti
non sono inferiori alla relativa quota.

Per i contanti si distinguono tre grandezze:

```text
amountMinor     la quota che PAGA la vendita          60,00 €
tenderedMinor   il denaro CONSEGNATO                  70,00 €
resto           tendered − amount                     10,00 €
```

⛔ **Il pagamento e l'importo fiscale contanti valgono 60 €, non 70.**

### Carta rifiutata

La vendita non è conclusa, il documento non risulta pagato, **il documento commerciale non
si emette**, i movimenti di magazzino non si duplicano, e il checkout **resta recuperabile**
per un nuovo tentativo o per l'annullamento.

### Idempotenza

⭐ **L'identità d'intento esiste già** e va usata: `CreationIntent` (`intentId` generato dal
client una volta per compilazione, `fingerprint` della richiesta, vincolo unico su tenant +
intento), oggi impiegata da `store-sales.service`. Il ritentativo non deve duplicare
documento, righe, pagamenti, movimenti di magazzino, movimento finanziario né ricevuta
fiscale.

---

## 10. Documento commerciale e RT

⛔ **Solo il flusso Cassa richiede l'emissione via RT.** La normale Vendita al banco no.

VestiFlow prepara e invia il comando; il registratore telematico certificato memorizza
l'operazione, emette il documento commerciale, restituisce l'esito e provvede alla
trasmissione fiscale secondo il proprio funzionamento.

Per 100 € pagati 60 contanti + 40 carta, il mapper fiscale produce: **totale 100 €, contanti
60 €, elettronico 40 €, non riscosso 0 €**.

⛔ **Il mapper parte dalle quote canoniche, mai dal riepilogo «Misto»**, che è una lettura e
non un dato.

### ⭐ I QUATTRO LIVELLI, e nessuno conosce il produttore del successivo

⛔ **La Cassa non si progetta intorno a un produttore.** Deciso il 04/09/2026 (tranche
**C1B**): Epson è il riferimento storico del vecchio ramo e potrà diventare **un** adapter,
non il modello su cui si costruisce il nucleo.

```text
Cassa                vendita, quote, sessione, movimenti, quadratura
  ↓  richiesta fiscale NORMALIZZATA
Fiscalizzazione      stato dell'emissione, ritentativi, identificativi restituiti
  ↓  adapter selezionato
Adapter fiscale      traduce la richiesta nel protocollo di UN fornitore
  ↓
Trasporto            browser · agente locale · backend · servizio cloud
```

⚠️ **Ogni livello conosce solo il proprio contratto.** La Cassa non sa che esista un XML; la
fiscalizzazione non sa che esista un indirizzo di rete; l'adapter non sa da dove parte la
chiamata.

### Il contratto della richiesta fiscale normalizzata

⛔ **Non contiene**: nomi di produttore, `fpmate.cgi`, `paymentType` numerici, XML, indirizzi
IP, reparti codificati secondo un firmware.

⭐ **Deve poter rappresentare**, in modo neutrale:

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| operazione   | vendita · reso o annullo **collegato all'originale**   |
| contenuto    | righe e riepiloghi IVA                                 |
| incasso      | le quote, nella forma canonica di §6                   |
| identità     | identificativo **idempotente** del tentativo           |
| destinazione | il dispositivo **selezionato**, non «il primo trovato» |
| esito        | confermato · fallito · **incerto**                     |
| ritorno      | identificativi fiscali restituiti                      |
| diagnostica  | dati dell'adapter, **mai fonte canonica**              |

⛔ **Nessun adapter concreto si scrive in C1B.**

### ⭐ Come si sceglie il dispositivo — deciso dal proprietario il 04/09/2026

> **Principale + riserva, non due postazioni operative. Il dispositivo appartiene alla**
> **SESSIONE** (tranche **C1C**).

C1B ha tolto l'unicità per sede e ha aperto la domanda; la vecchia risposta
(`findFirst({ locationId, enabled: true })`) era deterministica **solo** grazie a quel
vincolo, e senza diventa «uno a caso».

⭐ **Il vincolo che rende la scelta «principale + riserva» e non «due postazioni» esiste
già**, ed è su un'altra tabella — misurato sul condiviso il 04/09/2026:

```text
cash_sessions   UNIQUE (location_id) WHERE status = 'open'      ← ancora attivo
fiscal_devices  UNIQUE (location_id)                             ← rimosso da C1B
```

Più dispositivi, **una sola sessione aperta per sede**: quindi un operatore alla volta, e il
secondo dispositivo serve al guasto e al ricambio.

⭐ **Non è una scorciatoia da disfare.** Il legame dispositivo↔sessione serve identico anche
nello scenario a due postazioni: quello che cambia lì è la **quadratura** — fondo cassa,
movimenti, chiusura — che nessun negozio reale ci ha ancora dettato.

#### ⛔ Ma «due dispositivi, una serie fiscale» era SBAGLIATO

⚠️ Corretto dal proprietario il 04/09/2026, con la Guida dell'Agenzia delle Entrate alla
mano: è **il singolo RT** a memorizzare l'operazione, emettere il documento commerciale e
predisporre alla chiusura i dati giornalieri da trasmettere.

> **Due dispositivi sono due serie fiscali, anche quando non lavorano insieme.** Entrando in
> funzione la riserva si usa un altro RT, con identità e riferimenti fiscali propri.

⭐ **Ne discende che i campi sono DUE, e non è ridondanza:**

| Campo                            | Che cosa dice                                          |
| -------------------------------- | ------------------------------------------------------ |
| `cash_sessions.fiscal_device_id` | il dispositivo **operativo corrente** della sessione   |
| `fiscal_receipts.device_id`      | il dispositivo che ha **realmente emesso** quella riga |

⚠️ **Il passaggio al muletto riscrive il primo e non tocca il secondo**: le ricevute già
emesse restano riconciliabili con la chiusura giornaliera del registratore che le ha
prodotte. Con un campo solo, quell'informazione non esisterebbe.

⛔ **E `fiscal_receipts.device_id` era `ON DELETE SET NULL`**: cancellare un dispositivo
azzerava il riferimento su **tutte** le ricevute che aveva emesso, in silenzio. Corretto in
`RESTRICT` da C1C — un dispositivo si **disabilita**, non si cancella, e disabilitarlo non
tocca lo storico (prova in `dispositivo-di-sessione.integration-spec.ts`).

#### Il contratto della selezione

1. ⛔ **`NULL` non significa «prendi il predefinito»**: significa che la sessione non ha un
   dispositivo, e allora non si emette. La selezione implicita è ciò che C1C elimina.
2. **Il passaggio alla riserva è un'azione esplicita e tracciata**, non un ripiego
   automatico su un guasto.
3. ⛔ **Un ritentativo non va MAI a un dispositivo diverso**: dopo un esito **incerto**
   produrrebbe una doppia emissione su due memorie fiscali distinte. Si riemette sullo
   stesso, o si dichiara un'operazione nuova.
4. **Dispositivo e sessione appartengono allo stesso tenant e alla stessa sede.** ⚠️ Il
   database non lo verifica (§13): è una guardia **applicativa**, e va scritta prima che
   un'API scriva quel campo.
5. Il dispositivo dev'essere **abilitato** e avere un `adapterKey` **presente nel registro
   statico**: una chiave sintatticamente valida ma non registrata si rifiuta.
6. ⛔ **Nessun `findFirst` come selezione.** Chi legge un dispositivo lo legge per
   identificativo, e l'identificativo viene dalla sessione.
7. ⛔ **Nessuna API identificata dalla sola sede.** Il vecchio ramo aveva
   `PUT /fiscal-devices/{locationId}`, che con più dispositivi non sa quale modificare o
   disattivare: la chiave è **l'id del dispositivo**.

⚠️ **Nel ramo corrente quell'API non esiste** — nessun servizio `fiscal-devices` è stato
recuperato. Non c'è un contratto da correggere: c'è da scriverlo con la chiave giusta alla
prima riga, perché riscriverlo com'era è l'errore facile.

#### ⏸ Se un giorno servissero due casse contemporanee

Dichiarato ora perché la strada resti aperta, **non da fare**:

- serve un'entità propria — per esempio `checkout_stations`;
- ⛔ **non `pos_terminals`**, che è il **terminale di pagamento elettronico** anagrafato per
  il collegamento logico POS↔strumento di certificazione (`acquirer_name` è la banca,
  `portal_linked_at` il portale AdE). Il nome inganna: chi cercasse «la postazione» la
  troverebbe e modellerebbe la Cassa sulla tabella sbagliata;
- il vincolo di sessione passa da `UNIQUE(location_id) WHERE open` a `UNIQUE(station_id)`,
  cioè una **migration su un vincolo esistente**, non additiva;
- la quadratura diventa **per postazione**: fondo, movimenti, conteggio, chiusura;
- ⭐ il legame dispositivo↔sessione di C1C **resta valido**: la sessione appartiene alla
  postazione, e continua a dichiarare il proprio dispositivo.

### Il trasporto non è deciso, e il modello non deve deciderlo

| Forma                           | HTTPS / CORS / rete                     | Credenziali   | Con Railway                | Offline | Prova     |
| ------------------------------- | --------------------------------------- | ------------- | -------------------------- | ------- | --------- |
| browser → dispositivo LAN       | ⚠️ contesto sicuro e certificati locali | nel negozio   | il server non entra in LAN | ✅      | difficile |
| agente locale                   | ✅ controllabile                        | nel negozio   | indipendente               | ✅      | media     |
| backend → dispositivo o gateway | ⚠️ richiede raggiungibilità             | centralizzate | ✅                         | ⛔      | facile    |
| API cloud del fornitore         | ✅                                      | centralizzate | ✅                         | ⛔      | facile    |

⛔ **Nessuna è esclusa dal modello.** L'indirizzo di collegamento è **opzionale** proprio
perché un adapter cloud o un agente locale possono non averne uno.

### ⭐ Perché il vecchio ramo passava dal BROWSER, e perché resta una strada valida

⚠️ **Non è una stranezza da correggere.** Il flusso storico è stato riletto file per file su
`origin/feature/cassa` (`6e4f9e79`) il 04/09/2026, e i quattro passi sono confermati **dai
commenti originari**:

```text
1  il backend COMPONE il payload      «composto dal SERVER: il driver in negozio
   fiscal-print-payload.util.ts        (browser → stampante in LAN) si limita a
                                       renderizzarlo nel protocollo della marca»

2  il browser CHIAMA il dispositivo   «parla con la stampante RT nella LAN del negozio
   epson-fiscal-printer.service.ts     DAL BROWSER — il server non la raggiunge»

3  il browser RIPORTA l'esito         «è il browser in negozio a parlare con la
   report-fiscal-outcome.dto.ts        stampante, il server ne registra il risultato»

4  il backend REGISTRA lo stato       `pending` alla vendita, poi `emitted` o `failed`
   fiscal-receipts.service.ts          su ciò che il browser dichiara
```

⭐ **La ragione è scritta**: «il server non la raggiunge». ⚠️ **Ciò che invece NON è scritto**
è il perché: l'ipotesi — che il backend su Railway non possa raggiungere un indirizzo privato
del negozio, mentre il browser della postazione è nella stessa rete — è **coerente e non
confermata**. Nel vecchio ramo Railway compare solo per variabili d'ambiente, healthcheck e
proxy, **mai** in relazione alla stampante.

#### Cosa questa forma risolve davvero

- ⭐ **nessuna porta del negozio esposta su Internet**: il dispositivo resta in rete locale;
- ⭐ **nessuna VPN, nessun agente da installare** su ogni postazione;
- ⭐ **nessuna credenziale nel frontend**: il vecchio ramo usava `fetch` puro «non
  HttpClient: verso la stampante non devono viaggiare né l'`Authorization` dell'app né gli
  interceptor d'errore del backend» — la separazione era deliberata;
- ⭐ funziona **anche senza Internet**, finché la rete del negozio è viva.

#### E cosa costa

- ⚠️ **HTTPS, certificati e contesto sicuro**: il commento storico avvisava che serve HTTPS
  sulla stampante e il certificato accettato dalla postazione, «altrimenti il browser blocca
  la chiamata come mixed content». Ed è lo stesso terreno del difetto già registrato in
  `regole-qualita`: su `http://192.168.…` il contesto non è sicuro;
- ⚠️ **CORS e Private Network Access**: una pagina pubblica che chiama un indirizzo privato è
  proprio ciò che i browser stanno restringendo. Va verificato sul campo, non dato per dato;
- ⛔ **il browser non è fidato.** È il punto più grave: nel vecchio ramo `emitted` era una
  **dichiarazione del client**, e il server la registrava. Un client può sbagliare, essere
  manomesso, o riferire un successo che non c'è stato;
- ⛔ **la risposta si può perdere**: il documento esce dalla stampante e la conferma non
  torna. Senza un'identità idempotente, il ritentativo **emette due volte**;
- ⛔ **il vecchio DTO ammetteva due soli esiti** — `['emitted', 'failed']` — e **non aveva
  l'incerto**, che è precisamente lo stato in cui questa architettura finisce più spesso.

#### Ne discendono tre obblighi, per qualunque trasporto

1. **identità idempotente** del tentativo, che il dispositivo o l'adapter possa riconoscere;
2. **cronologia append-only** dei tentativi (§ più sotto): con una risposta persa, l'unica
   difesa è sapere cosa si era già provato;
3. ⛔ **`emitted` non si scrive su dichiarazione**: serve un riscontro — identificativo
   fiscale restituito, o una riconciliazione successiva contro il dispositivo.

⭐ **La chiamata dal browser resta quindi una strategia supportata**, non la strategia. Ogni
adapter **dichiara quale trasporto usa e quale configurazione richiede**; il contratto
fiscale generale non lo sa e non deve saperlo.

### ⭐ I vecchi vincoli erano GARANZIE, e vanno ricostruite

⛔ **Toglierli e basta lascia dei buchi.** Verificato su `origin/feature/cassa` (`6e4f9e79`)
il 04/09/2026, riga per riga, cosa ciascuno reggeva davvero:

| Vincolo tolto               | Che cosa garantiva                                              | Dove si vede                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **unicità per sede**        | la selezione era **automatica e deterministica**                | `store-sales.service.ts:193` — `findFirst({ locationId, enabled: true })`; `upsert({ where: { locationId } })`; e nell'API `PUT /fiscal-devices/{locationId}`: la sede **era** l'identificativo |
| **`endpoint` obbligatorio** | nessuna configurazione incompleta                               | `NOT NULL` sulla colonna                                                                                                                                                                        |
| **`brand` come selettore**  | **whitelist implicita** dei driver: l'enum era chiuso           | il `brand` decideva il codice                                                                                                                                                                   |
| **salvare = attivare**      | il dispositivo era subito operativo, e non poteva essere a metà | `@default(true)` su `enabled`, più i due vincoli sopra                                                                                                                                          |

⚠️ Il commento storico è esplicito anche sull'attivazione: «la vendita nasce **da
fiscalizzare** e la cassa emette subito dopo la conferma».

#### Le dodici garanzie della forma nuova

**Nel database, da ora** (migration `20260904150000`):

1. ⭐ `enabled` nasce **`false`**: senza unicità e senza indirizzo obbligatorio, «attivo
   appena censito» significherebbe attivo senza sapergli parlare;
2. ⭐ **non si abilita senza `adapterKey`** — `CHECK`, non solo controllo di servizio.

**Nel codice, quando esisterà** (C3/C5) — e sono contratto, non suggerimenti:

3. ⛔ `adapterKey` si risolve **solo** contro un **registro statico** di adapter compilati
   nell'applicazione;
4. ⛔ **mai** import dinamici, percorsi di file, URL o esecuzione di codice a partire da
   `adapterKey`: è testo che arriva da una scrittura del tenant;
5. ⛔ un valore **sintatticamente valido ma non nel registro** si **rifiuta**;
6. ogni adapter valida la propria configurazione con uno **schema esplicito**;
7. campi sconosciuti, configurazione incompleta e **segreti** in `adapterConfig` si rifiutano
   o si redigono;
8. l'**endpoint lo richiede l'adapter** il cui trasporto ne ha bisogno — lì torna la garanzia
   del vecchio `NOT NULL`, ma solo per chi serve;
9. con più dispositivi sulla stessa sede la scelta è **esplicita**;
10. ⛔ **nessun `findFirst` come selezione del dispositivo**: era deterministico solo grazie
    all'unicità, e senza diventa «uno a caso»;
11. il dispositivo si assegna alla **sessione** (`cash_sessions.fiscal_device_id`), deciso
    dal proprietario il 04/09/2026 e implementato da **C1C**. ⛔ Non è un predefinito di
    sede e non è una postazione: quella non esiste, e se servirà sarà un'entità propria;
12. un **ritentativo conserva dispositivo, adapter e versione** originari.

⭐ **Il punto 3 è di sicurezza, non di ordine.** Finché `brand` era un enum, la whitelist dei
driver era il database a farla. Aperta la chiave, la whitelist deve tornare **esplicita nel
codice** — o un valore scritto da un tenant diventerebbe il nome di qualcosa da caricare.

### ⚠️ La cronologia dei ritentativi oggi si perde

`FiscalReceipt` ha `documentId @unique` e campi scalari singoli — `status`, `rawResponse`,
`errorMessage`. Un secondo tentativo **sovrascrive** il primo: della risposta precedente non
resta nulla, e con una risposta incerta è esattamente ciò che servirebbe per riconciliare.

⏸ **Proposta, non implementata in C1B**: una tabella **append-only** dei tentativi, figlia
della ricevuta, con esito, istante, adapter e diagnostica. `FiscalReceipt` resterebbe lo
stato corrente. Va decisa insieme all'adapter, perché la forma della diagnostica dipende da
cosa i dispositivi restituiscono davvero.

### Se il pagamento riesce e l'RT non risponde

Vendita e pagamento **non** si duplicano né si cancellano; `fiscal_receipts` registra
`pending` o `failed`; esiste un ritentativo **della sola emissione fiscale**, che non ripete
carta, contanti né scarico di magazzino; l'interfaccia dice chiaramente **«pagamento
registrato, documento commerciale non emesso»**.

⛔ **Mai dichiarare `emitted` prima della conferma effettiva dell'RT.** Si conservano
identificativi fiscali, matricola, data e ora, risposta tecnica ed errore, per la
riconciliazione.

⚠️ Va verificata anche la **configurazione operativa 2026 del collegamento POS–RT**: il
codice non sostituisce l'adempimento sul dispositivo reale.

---

## 11. Registro Corrispettivi

⛔ **Non si recupera nulla** di `corrispettivo_entries`, del suo backfill, della numerazione
`COR-*` né del vecchio modello persistito. La tabella è stata eliminata il 17/08/2026 da
`20260817140000_ritira_corrispettivo_legacy`, e il Registro attuale è una **vista derivata**
che legge i documenti (`buildCorrispettiviStoreSaleWhere`).

| Regola                              |                                           |
| ----------------------------------- | ----------------------------------------- |
| Vendita al banco ordinaria da 100 € | compare **una volta** per 100 €           |
| Vendita Cassa da 100 €              | compare **una volta** per 100 €           |
| 60 contanti + 40 carta              | ⛔ **non** diventano due righe economiche |
| `store_sale_payments`               | dettaglio e riconciliazione               |
| `fiscal_receipts`                   | stato fiscale                             |

⛔ Nessuna di queste tabelle raddoppia imponibile, IVA o totale. Un eventuale filtro o
riepilogo per metodo **aggrega le quote senza cambiare il totale economico** del Registro.

---

## 12. Modifica, fiscalizzazione, resi

La Vendita al banco ordinaria **resta modificabile** secondo il contratto documentale
attuale.

⛔ Una vendita conclusa in Cassa e **fiscalizzata** non può avere pagamenti, totale o righe
fiscali riscritti in silenzio dalla normale modifica documentale.

```text
prima della conclusione        checkout modificabile
dopo il pagamento, prima RT    stato recuperabile
dopo l'emissione RT            dati fiscali e pagamenti NON riscrivibili in silenzio
correzione successiva          annullo / reso / rimborso, collegato all'originale
```

⏸ **Il comportamento finale del Reso Cassa non si inventa.** Se il protocollo fiscale o la
specifica non lo chiudono, si implementa prima la vendita e si segnala precisamente la
decisione residua.

---

## 13. Sicurezza e permessi

⚠️ **Oggi esiste un solo permesso retail: `retail.register`**, e governa la **Vendita al
banco** — non la Cassa. Il nome inganna, ed è un residuo del periodo in cui quelle rotte
portavano al carrello.

La Cassa richiede: modulo visibile **solo ai tenant abilitati**; permessi **distinti** per
usare la Cassa, aprire e chiudere sessioni, gestire dispositivi e terminali; isolamento
tenant su ogni lettura e scrittura; location obbligatoria dove serve davvero; **nessuna
esposizione delle tabelle via Data API** e RLS coerente; indirizzi dei dispositivi e configurazione POS
mai esposti inutilmente al frontend; nessuna credenziale nei log.

⛔ **La Vendita al banco continua a funzionare per chi ha i suoi permessi anche senza alcun
permesso Cassa.**

### ⛔ Limite ereditato: il database NON garantisce l'isolamento tenant

Misurato sul database di prova il 04/09/2026, durante C1. Le chiavi esterne collegano gli
identificativi **uno per uno**, e il `tenant_id` viaggia in un vincolo **separato**:

```text
FK verso entita' di business che vincolano ANCHE il tenant:   0 su 12
UNIQUE/PK composti (tenant_id, id) sulle tabelle bersaglio:   nessuno
```

Senza un `UNIQUE(tenant_id, id)` sulle tabelle bersaglio, una chiave esterna composta non
sarebbe **nemmeno dichiarabile**. Ne discende che il database, da solo, non impedisce di
collegare una quota del tenant A a un documento del tenant B, un documento a una sessione di
un altro tenant, o una sessione a una sede altrui.

⚠️ **Non è un difetto della Cassa e C1 non lo ha introdotto**: vale allo stesso modo per
`documents(location_id)` e `documents(source_document_id)`, che esistono da molto prima. È un
limite dell'intero schema.

⭐ **Va affrontato prima dei servizi applicativi della Cassa** (C3): finché l'isolamento vive
solo nel codice, ogni percorso di scrittura deve verificare il tenant da sé, e ogni percorso
nuovo è un'occasione di dimenticarlo. Se e come chiuderlo — vincoli compositi, RLS, o
verifica applicativa centralizzata — è una decisione da prendere, non da dedurre.

### ⛔ DUE CONDIZIONI OBBLIGATORIE prima di dichiarare completa la Cassa

⚠️ Deciso dal proprietario il 04/09/2026. Le prove di integrazione **dimostrano** questi due
difetti e sono verdi: un test verde si legge come comportamento atteso anche quando il suo
nome dice il contrario, quindi vanno dichiarati **qui** e non solo nei commenti dei test.

> **Restano fuori dalle migration attuali soltanto perché oggi non esistono né API né
> utilizzo reale. Non sono il comportamento atteso della Cassa completa.**

| #   | Condizione                                                       | Entro quando                      | Prova che lo dimostra                                      |
| --- | ---------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------- |
| 1   | **Protezione cross-tenant**: tenant e sede verificati insieme    | prima di esporre servizi e API    | `dispositivo-di-sessione` · `dispositivo-fiscale-neutrale` |
| 2   | **Cronologia dei tentativi append-only**: nessuna sovrascrittura | prima della fiscalizzazione reale | `dispositivo-fiscale-neutrale`, ultimo caso                |

⛔ **Nessuna delle due si può rimandare oltre quel punto**: la prima perché ogni percorso di
scrittura nuovo è un'occasione di dimenticare il tenant, e la seconda perché la traccia del
primo tentativo serve **proprio** quando l'esito è incerto — cioè nel caso in cui la sua
assenza costa una doppia emissione.

---

## 14. Riuso: cosa si condivide e cosa resta distinto

⛔ **Non si copia la maschera Vendita al banco per costruire la Cassa**, e non si copia il
vecchio carrello per intero.

**Si condivide o si estrae** (quando è davvero comune): ricerca articolo, scanner, modelli
delle righe, calcoli netto/IVA/lordo, validazione di quantità e prezzi, costruzione delle
righe documento, totali, formattazione del denaro, selettore delle modalità di pagamento,
chiamate applicative per creare documento e movimenti.

**Restano due orchestratori distinti:**

|                                  |                         |
| -------------------------------- | ----------------------- |
| `StoreSaleDocumentFormComponent` | il documento gestionale |
| componente Cassa                 | il checkout operativo   |

⚠️ Prima di creare un componente nuovo si verifica se esiste già una primitiva condivisa —
`docs/MAPPA-RIUSO-VENDITA-AL-BANCO.md` è il punto di partenza. Se per riusarla serve estrarre
un contratto comune, **lo si estrae senza cambiare il comportamento dei consumer attuali**.

### La mappa, misurata su `develop` il 04/09/2026

⭐ **Quasi tutto ciò che serve alla Cassa esiste già**, e il vecchio ramo non serve a
procurarlo:

| Serve alla Cassa           | Esiste in `develop`                                                                                              | Esito                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ricerca articolo           | `domain/documents/components/document-product-search-panel`                                                      | **riuso diretto**                                     |
| scanner                    | `document-scan-overlay` + `core/services/barcode-detection.service` + `core/utils/parse-barcode-scan-input.util` | **riuso diretto**                                     |
| celle di riga              | `document-line-code-cell`, `-product-cell`, `-unit-cell`, `-select-cell`, `-row`, `-card`, `-quick-row`          | **riuso diretto**                                     |
| totali                     | `document-totals`                                                                                                | **riuso diretto**                                     |
| modello riga banco         | `domain/store-sales/models/store-sale-document-line.model`                                                       | **riuso diretto**                                     |
| colonne riga banco         | `store-sale-line-columns.config`                                                                                 | **riuso**, con profilo proprio della Cassa            |
| modalità vendita/reso      | `store-sale-mode.descriptor`                                                                                     | **riuso diretto**                                     |
| etichette pagamento legacy | `store-sale-payment.util`                                                                                        | **riuso in sola lettura** (adapter di §5)             |
| identità d'intento         | `api/src/common/idempotency/creation-intent.util`                                                                | **riuso diretto**                                     |
| quote, sessione, RT, POS   | —                                                                                                                | **da portare**, e solo qui il vecchio ramo è la fonte |

⛔ **Non si riusa `StoreSaleDocumentFormComponent`**, né incorporandolo né copiandolo: è
l'orchestratore del documento, e la Cassa è l'altro orchestratore.

---

## 15. La sequenza

| Tranche | Contenuto                                                                                                                                     | Migration               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **C0**  | questa specifica, separazione delle rotte, contratto transitorio dei pagamenti, censimento `PaymentOption`                                    | ⛔ nessuna              |
| **C1**  | modelli Prisma delle tabelle Cassa **già esistenti**, relazioni, prove di schema e isolamento                                                 | ⛔ nessuna              |
| **C1B** | neutralizzazione dell'infrastruttura fiscale: nessuna assunzione su produttore, LAN, browser o «un solo dispositivo per sede»                 | ✅ additiva/compatibile |
| **C1C** | il dispositivo fiscale si lega alla **sessione**; `fiscal_receipts.device_id` smette di perdere chi ha emesso                                 | ✅ additiva + FK        |
| **C2A** | catalogo globale delle Modalità normative, codice FatturaPA strutturato, FK nullable da `PaymentOption`, backfill esplicito, Impostazioni     | ✅ additiva, nullable   |
| **C2B** | classificazione **operativa** dei Tipi pagamento per il checkout (`PaymentTenderKind`), backfill dichiarato, Impostazioni, backup             | ✅ additiva, nullable   |
| **C3**  | **isolamento tenant/location** e **ciclo della sessione**: apertura, chiusura, fondo, movimenti di cassetto, conteggio, differenze            | —                       |
| **C4**  | **checkout**: quote, pagamento misto, resto, carta rifiutata, creazione idempotente, `store_sale_payments` (contratto in §5-bis)              | ✅ prevista             |
| **C5**  | **fiscalizzazione provider-neutral**: rappresentazione fiscale AdE, adapter, trasporto, dispositivo reale. Nessun produttore è predeterminato | —                       |
| _poi_   | migrazione della **Vendita al banco** da `cash \| card \| other` a `PaymentOption`                                                            | tranche **autonoma**    |

⛔ **Non si comincia una tranche lasciando rossa la precedente.**

⚠️ La sequenza è stata **rivista due volte il 04/09/2026**. La prima rispetto al mandato
iniziale, che metteva il checkout in C2: la classificazione di `PaymentOption` è una sua
dipendenza, quindi viene prima.

⛔ **La seconda perché C4 precedeva il servizio che apre la sessione**, e non poteva:
l'ordine di prima aveva il checkout in C3 e le sessioni in C4, cioè si sarebbe incassato
dentro una sessione che nessun servizio sapeva ancora aprire. Ora il ciclo della sessione
viene prima del checkout che la usa.

⭐ E l'isolamento tenant/location sta in **C3 con la sessione**, non in una tranche sua:
è la prima cosa che ogni percorso di scrittura deve verificare, e il primo percorso di
scrittura della Cassa è proprio l'apertura di sessione (§13, condizione obbligatoria 1).

---

## 16. Obbligo di segnalazione

⛔ Prima di applicare una soluzione diversa da questo contratto ci si **ferma e si segnala**:
quale comportamento reale del codice o del database lo impedisce, con **file e righe**; la
conseguenza funzionale; l'alternativa proposta; il rischio di regressione; e la prova che
falsifica il comportamento precedente.

⛔ **Non si colmano con supposizioni** le lacune del protocollo fiscale, dei resi o
dell'integrazione con la Tesoreria.

---

## Appendice storica — quello che il vecchio ramo sapeva di Epson

> ⛔ **QUESTA SEZIONE NON È NORMATIVA.** Non è un contratto, non è una configurazione, non
> autorizza nulla. È il verbale di ciò che `origin/feature/cassa` (`6e4f9e79`) conteneva al
> 19/08/2026, conservato perché **la conoscenza non si ricostruisce** e perso il ramo si
> perderebbe. Nessuna riga qui dentro si copia in un contratto senza prima verificarla sul
> dispositivo reale.

Il vecchio ramo aveva un adapter per stampanti Epson RT che parlava **Fiscal ePOS-Print XML**
su envelope SOAP, con endpoint `…/cgi-bin/fpmate.cgi`. Conosceva: la costruzione del
documento di vendita e di reso, il preambolo di reso con gli estremi della ricevuta
originale, la mappa aliquota→reparto, la lettura della risposta con numero scontrino e
progressivo di chiusura, e una tabella di tipi pagamento numerici.

⚠️ **Il suo stesso autore lo dichiarava non verificato**: l'intestazione del file diceva che
il flusso di reso andava validato sul dispositivo reale, e che «il firmware ha l'ultima
parola».

⛔ **Il commento «FP-81II/FP-90III» è storico e nient'altro**: nessun dispositivo è mai stato
configurato — `fiscal_devices` ha **0 righe**, misurate il 04/09/2026 — quindi non esiste un
modello «realmente utilizzato» da cui dedurre alcunché.

⭐ **Quando arriverà un dispositivo**, questa appendice serve a sapere **cosa già si era
capito** e cosa andava riverificato: non a saltare la verifica.

---

## Il risultato atteso

> Due flussi distinti · un solo documento economico sottostante · componenti comuni riusati ·
> nessuna duplicazione nei Corrispettivi · pagamenti Cassa compatibili con l'RT · vecchio
> ramo conservato **solo** come fonte tecnica.
