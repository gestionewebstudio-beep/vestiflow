# 25 — Specifica Cassa

_Contratto della **Cassa** di VestiFlow e della sua separazione dalla **Vendita al
banco**. Scritta il 04/09/2026 come tranche **C0** del recupero da
`origin/feature/cassa`, che resta sorgente storica in sola lettura._

> ⛔ **Questo documento non è la specifica della Vendita al banco.** Quella è
> `docs/11-specifica-vendita-al-banco.md` e **non cambia**. Qui si descrive un flusso
> operativo diverso che _usa_ quel documento, non lo sostituisce.

---

## 0. Le decisioni vigenti

| #   | Decisione                                                                                        | Dove si argomenta |
| --- | ------------------------------------------------------------------------------------------------ | ----------------- |
| 1   | Vendita al banco e Cassa sono **due flussi distinti**, su **rotte separate**                     | §1, §3            |
| 2   | La Cassa produce una **normale `store_sale`**: nessun secondo documento economico                | §4                |
| 3   | La Vendita al banco conserva `cash \| card \| other`; la **Cassa usa `PaymentOption`**           | §5                |
| 4   | «Misto» è **calcolato a lettura dalle quote**, mai persistito                                    | §6                |
| 5   | `PaymentOption` va esteso: la migration è di **C2A**. la classe operativa è **C2B**              | §7                |
| 6   | Le sei tabelle esistono già nel database: **non si ricreano**                                    | §8                |
| 7   | Una sede ha **principale + riserva**, non due postazioni. Il dispositivo è **della sessione**    | §10               |
| 8   | Ogni RT ha **numerazione e chiusura proprie**: si conserva sempre **chi ha emesso**              | §10               |
| 9   | La Cassa classifica i Tipi pagamento con `PaymentTenderKind`: **operativa**, non fiscale         | §7                |
| 10  | La rappresentazione fiscale AdE e il protocollo del dispositivo stanno in **C5**                 | §10, §15          |
| 11  | Il contante si **conta**, l'elettronico si **riconcilia**: sono due gesti diversi                | §9                |
| 12  | I cambi di dispositivo hanno uno **storico append-only**, non una colonna riscritta              | §10               |
| 13  | **C3, C4 e C4B non si rilasciano separatamente**: nessuna chiusura provvisoria                   | §13               |
| 14  | Tre permessi: `retail.register` vede, `retail.cash_session` apre, `retail.cash_drawer` movimenta | §13               |
| 15  | La Cassa vive su `/app/cassa` con **tre sole aree**: Vendita · Operazioni · Sessioni             | §3                |
| 16  | Reso e chiusura sono **subordinati**, non voci di menu                                           | §3                |
| 17  | Il reso dichiara **quale riga** rettifica: il cumulativo si ricostruisce, non si contabilizza    | §12-bis           |
| 18  | Il rimborso è agganciato alla **quota di incasso**, non al Tipo pagamento                        | §13-quater        |
| 19  | La chiusura è **cieca** e **congela** gli attesi: la differenza resta derivata                    | §9, §13-quinquies |
| 20  | Il **validatore** blocca la riga di sessione: è l’unico punto di serializzazione della Cassa      | §13-sexies        |

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

### ⭐ Le rotte definitive — decise dal proprietario il 04/09/2026

```text
/app/cassa                        checkout, stato e riepilogo della sessione corrente
/app/cassa/operazioni             riepilogo globale multi-sede + registro vendite/resi
/app/cassa/operazioni/:id         dettaglio dell’operazione e dello scontrino
/app/cassa/sessioni               sessioni aperte e chiuse
/app/cassa/sessioni/:id           dettaglio, movimenti e quadratura
```

⭐ **Nel menu compaiono TRE voci sole**: Vendita · Operazioni · Sessioni. La principale apre
il checkout, con un’azione evidente «Nuova vendita»: un cassiere ci arriva senza attraversare
schermate amministrative.

⛔ **Reso e chiusura NON sono aree autonome**, e non compaiono nel menu:

| Procedura    | Da dove parte                                                           | Rotta persistente, se serve        |
| ------------ | ----------------------------------------------------------------------- | ---------------------------------- |
| **reso**     | «Richiama scontrino» in Cassa, o «Esegui reso» sul dettaglio operazione | `/app/cassa/operazioni/:id/reso`   |
| **chiusura** | dettaglio della sessione corrente                                       | `/app/cassa/sessioni/:id/chiusura` |

⚠️ Entrambe sono **subordinate** all’oggetto su cui agiscono: un reso senza operazione
originale e una chiusura senza sessione non esistono, e una rotta di primo livello
suggerirebbe il contrario.

⛔ **Niente `/app/cassa/corrispettivi` ancora.** In C5 gli stati fiscali compaiono come
**filtri del registro operazioni** — in attesa · emesso · fallito · incerto · annullato. Una
pagina propria arriva solo se emergerà la necessità di una vera coda di monitoraggio,
assistenza e ritentativo.

⛔ **`/app/cassa/chiusure` non aveva consumer**: verificato il 04/09/2026 — compariva in
questo solo documento, riga 97, e in nessun file di codice. Sostituito senza migrazione.

⛔ **`/app/vendita-al-banco` non si riusa per la Cassa**, in nessuna forma: né come figlio,
né come redirect, né come rotta gemella. Una vendita nata dalla Cassa si riconosce dal
proprio `cashSessionId`, non dalla rotta che l’ha creata.

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

### ⚠️ Una riga legacy esiste già, e vincola la forma della migration C4

Misurato sul condiviso in sola lettura e **provato** sul database usa-e-getta il 04/09/2026:
`store_sale_payments` contiene **una riga**, `{ method: "cash", amount_minor: 0,
tendered_minor: null }`.

```text
FK nullable a payment_options            ✅ passa
snapshot nome e tenderKind, nullable     ✅ passa
CHECK  amount_minor >= 0                 ✅ passa

CHECK  amount_minor > 0                  ⛔ BLOCCATA da quella riga
tender_kind  SET NOT NULL                ⛔ BLOCCATA da quella riga
```

⭐ **Non è un ostacolo, è un vincolo di forma**: la migration C4 deve essere **additiva e
nullable**, come C2A e C2B. Se servisse davvero un importo strettamente positivo o uno
snapshot obbligatorio, quella riga va prima **decisa** — corretta, o dichiarata legittima e
il vincolo allentato. ⛔ Non si scopre applicando la migration.

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

### ⭐ La chiusura: il contante si CONTA, l'elettronico si RICONCILIA

> **Sono due gesti diversi, e avevano lo stesso nome.** `countedCardMinor` presupponeva
> che la carta si contasse, che fisicamente non accade.

| Grandezza                 | Che cos'è                                                                |
| ------------------------- | ------------------------------------------------------------------------ |
| `countedCashMinor`        | il contante **contato** aprendo il cassetto                              |
| `declaredElectronicMinor` | il totale che l'operatore **legge sul POS** e dichiara — **facoltativo** |
| `expectedCashMinor`       | atteso **calcolato** dalle quote e congelato                             |
| `expectedElectronicMinor` | idem, per l'elettronico                                                  |

⛔ **`declaredElectronicMinor` NON è una risposta tecnica del terminale.** VestiFlow non
parla col POS e non finge di averlo fatto: è una dichiarazione dell'operatore, e `NULL`
significa «non riconciliato» — una chiusura legittima.

⛔ **La differenza di cassa non è una colonna**: è `countedCash − expectedCash`, entrambi
congelati. Persisterla creerebbe un terzo valore capace di contraddire i due da cui deriva.

⚠️ **Nessuna colonna voucher, e non è una dimenticanza**: C2B li modella ma non li abilita.
Le vecchie `*_other_minor` sono state **rimosse** invece che rinominate — `other` era la
discarica dei metodi sconosciuti, non i buoni, e tradurla in `voucher` sarebbe stato
scrivere una cosa per un'altra.

### Le formule — si calcolano e si congelano in C4B, non prima

⛔ **Nessuna è calcolabile finché le quote non esistono** (C4). Fino ad allora gli attesi
restano `NULL`, e questo è il contratto che C4B eseguirà:

```text
fondo             openingFloatMinor                                   (all'apertura, ≥ 0)
venditeCash       Σ quote  tenderKind=cash        su documenti store_sale
resiCash          Σ quote  tenderKind=cash        su documenti store_return
venditeElettr.    Σ quote  tenderKind=electronic  su documenti store_sale
resiElettr.       Σ quote  tenderKind=electronic  su documenti store_return
versamenti        Σ movements type=deposit
prelievi          Σ movements type=withdrawal

expectedCashMinor        = fondo + venditeCash − resiCash + versamenti − prelievi
expectedElectronicMinor  = venditeElettr. − resiElettr.      ⭐ né fondo né cassetto
differenza               = countedCashMinor − expectedCashMinor      (derivata)

sessione senza vendite:  expectedCash = fondo + versamenti − prelievi
                         expectedElectronic = 0
```

⛔ **I documenti ANNULLATI non contribuiscono**, e va detto perché è l'errore che il ramo
storico faceva: la sua query era `where: { tenantId, document: { cashSessionId: {...} } }`
— **nessun filtro su `status`**. Un `store_sale` annullato entrava negli attesi.

⛔ **E la classe la porta la QUOTA, non il Tipo corrente**: è lo snapshot di `tenderKind`
del contratto §5-bis. Senza, riclassificare un Tipo domani cambierebbe la quadratura di una
sessione chiusa a marzo.

⚠️ **L'aggregazione è ESAUSTIVA sull'enum**, mai con un ramo di ripiego. Il `bucket()` del
ramo storico mandava «ogni metodo sconosciuto» in `other`: con `tenderKind` quella riga
farebbe sparire una classe nuova **in silenzio**.

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

### ⭐ Il cambio di dispositivo lascia una traccia — C2C

⚠️ C1C ha reso `cash_sessions.fiscal_device_id` il dispositivo **operativo corrente**.
Riscriverlo perde il **momento** e la **ragione** del passaggio al muletto — che è proprio
ciò che serve quando si riconcilia una chiusura con due serie fiscali.

```text
cash_session_device_changes     append-only, NESSUN updated_at
  tenant · location · session
  previousDeviceId?   ⭐ NULL al primo assegnamento: non è un dato mancante, è l'inizio
  newDeviceId?        ⭐ NULL quando si toglie: la sessione smette di fiscalizzare
  reason              obbligatoria, come sui movimenti di cassetto
  changedById? · changedByName · createdAt
```

⛔ **Non è un `CashSessionMovement`**: un cambio dispositivo non è un movimento di denaro, e
rappresentarlo lì richiederebbe di inventare un importo e di aggiungere un terzo valore a
`deposit | withdrawal`.

⛔ **Nessuna API di modifica o cancellazione**, e la garanzia è **strutturale**: la tabella
non ha `updated_at`. Una riga sbagliata si corregge con una riga nuova che lo dice.

#### Gli `onDelete`, e perché

| FK                                 |              |                                                                                                                                                                   |
| ---------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `previousDeviceId` · `newDeviceId` | **RESTRICT** | ⛔ mai `SET NULL`: azzererebbe l'identità che lo storico esiste per conservare, e in silenzio. È la stessa correzione fatta da C1C su `fiscal_receipts.device_id` |
| `sessionId`                        | **CASCADE**  | come per i movimenti: senza la sessione, lo storico non ha più un soggetto                                                                                        |
| `tenantId` · `locationId`          | RESTRICT     | come ovunque                                                                                                                                                      |

⚠️ **Ne discende che un dispositivo nominato in uno storico non si cancella più.** È voluto:
un dispositivo si **disabilita**, e disabilitarlo non tocca lo storico — C1B lo ha reso la
strada prevista.

#### ⛔ La Cassa non CANCELLA: nessuna API ordinaria, e una guardia che lo tiene

> **Una sessione sbagliata si CHIUDE. Un movimento sbagliato si corregge con un movimento**
> **OPPOSTO che lo cita nella causale. Una riga di storico, con una riga nuova.**

⚠️ **`ON DELETE CASCADE` sullo storico non è un permesso**, e va dichiarato o si legge come
tale:

|                    |                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ **ammessa**     | cancellazione integrale e **deliberata** di un tenant, o rimozione amministrativa di una sessione (manutenzione, dati di prova): lì lo storico non ha più un soggetto |
| ⛔ **non ammessa** | come operazione della **Cassa**. Non esiste, e non deve esistere, un'API ordinaria che cancelli una sessione o un movimento                                           |

⭐ **La garanzia non è questa riga: è `npm run check:cassa-append-only`**, dentro
`npm run lint`, che fa fallire la build se un controller espone `@Delete`, `@Put` o
`@Patch` su sessioni, movimenti o storico. Il **database** non può distinguere una
cancellazione amministrativa da una ordinaria — a distinguerle è la **superficie che si
espone**.

⚠️ Non vieta le scritture di servizio: la chiusura di C4B farà un `update` sulla sessione, e
va bene. Vieta la **rotta**. La deroga, se un giorno servisse una rotta amministrativa vera,
si scrive nel commento del metodo (`@cassa-append-only amministrativa`) e si vede in
revisione.

#### ⭐ E un CHECK è stato TOLTO, perché non vincolava

La migration `20260904180000` ne aveva due. Il secondo — «almeno un dispositivo presente» —
è implicato dal primo, e la tavola di verità lo mostra:

```text
NULL → A     IS DISTINCT FROM = true    passa
A → NULL     true                       passa
A → B        true                       passa
A → A        false                      RIFIUTATA
NULL → NULL  false                      RIFIUTATA   ← due NULL non sono distinti
```

⛔ **Un vincolo che non può fallire non è una protezione**: fa credere protetto ciò che lo è
già per un'altra ragione. Rimosso da `20260904190000` — ed era stato trovato **provando a
falsificarlo**, perché la prova che doveva arrossare restava verde.

#### ⛔ Che cosa il database NON garantisce, e resta a C3

Le chiavi esterne legano gli identificativi **uno per uno** (§13, limite ereditato). Restano
al **validatore transazionale**:

- che la sessione appartenga al tenant e alla sede indicati;
- che i due dispositivi appartengano allo stesso tenant e alla stessa sede della sessione;
- che `previousDeviceId` sia davvero il dispositivo corrente al momento del cambio;
- che la sessione sia **aperta**.

⚠️ **Dentro la transazione che scrive**: fra un controllo fuori transazione e la scrittura,
la sessione può chiudersi.

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

## 12-ter. Preflight C4 — le primitive esistenti, e quali si riusano

Censito il 04/09/2026 su `store-sales.service.ts` (**1542 righe**), che contiene già
`createSale` e `createReturn`.

| Primitiva                                                  | Oggi                                                              | In C4                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| `resolveVariants`                                          | privata, 2 chiamate                                               | **da estrarre**                               |
| `resolveVatContext` · `resolveLineVatCode`                 | private, 2 chiamate                                               | **da estrarre**                               |
| `lineDescription`                                          | privata, 2 chiamate                                               | **da estrarre**                               |
| `assertLocationExists` · `authorizeStoreDocumentLocations` | private                                                           | ⭐ **sostituite** da `assertCashContext` (C3) |
| `pushInventoryAsync`                                       | privata                                                           | **da estrarre**                               |
| `CreationIntentService`                                    | ✅ già condiviso — `claimTx`, `recordResultTx`, `resolveConflict` | **riuso diretto**                             |
| `StoreSaleLookupService`                                   | ✅ già un servizio proprio (189 righe)                            | **riuso diretto**                             |

⛔ **Non si richiama `createSale`.** Trascina la modifica documentale e il pagamento legacy
`cash | card | other`, che è esattamente ciò che la Cassa non deve scrivere. Le primitive si
**estraggono**; il caso d’uso no.

⚠️ **L’estrazione tocca un file da 1542 righe in produzione**: va fatta a comportamento
invariato, con i test della Vendita al banco verdi prima e dopo, e in un commit proprio —
separato da quello che introduce la Cassa.

---

## 12-bis. C4R — il reso dichiara quale riga rettifica

⭐ **Realizzata il 04/09/2026** (migration `20260904200000_reso_collegato_alla_riga`).

⛔ **Qui c’era «C4R è BLOCCATA», con tre alternative e nessuna scelta.** La scelta è
stata fatta dal proprietario — **alternativa A**, il campo sulla riga — e il testo che
confrontava le tre non serve più a nessuno. Resta quello che, sbagliato, tornerebbe.

### La struttura

```text
DocumentLine.returnedFromLineId   self-FK RESTRICT   la riga di vendita che questa rettifica
  UNIQUE(document_id, returned_from_line_id)         la stessa riga non entra due volte in un reso
FiscalReceipt.closureNumber       TEXT               il numero di azzeramento, provider-neutral
FiscalReceipt.originalReceiptId   SET NULL → RESTRICT
```

⭐ **Il cumulativo si RICOSTRUISCE dalle righe di reso**, e non esiste un contatore
`returnedQuantity` sulla riga originale: un contatore modificabile sarebbe un terzo valore
capace di contraddire le righe da cui deriva — la stessa disciplina della differenza di
cassa (§9) e dei movimenti per riga (`regole-gestionale`).

⚠️ **I documenti annullati non contano**, in entrambe le direzioni: un reso annullato
libera la quantità, e una vendita annullata non si rende.

### ⛔ Le tre cose che, rifatte diversamente, romperebbero di nuovo

**1. Aggregare per VARIANTE invece che per riga.** Due righe dello stesso articolo con
prezzi diversi — una scontata, una no — non sono intercambiabili: il rimborso che ne
deriverebbe sarebbe di un importo che il cliente non ha pagato.

**2. `SET NULL` sui collegamenti del reso.** Cancellare l’originale scollegherebbe il reso
**in silenzio**, e con lui il cumulativo — è la stessa correzione già fatta da C1C su
`fiscal_receipts.device_id`. Per questo la self-FK delle righe e `originalReceiptId` sono
`RESTRICT`.

**3. Riusare `sourceDocumentLineId`.** Quel nome esiste già su `DocumentLine` e significa
un’altra cosa: è il riferimento **transitorio** che compone una riga derivata
(`regole-gestionale`, «le righe nuove sono DUE cose diverse»), non si persiste, e non ha
niente a che vedere con un reso. Due significati sullo stesso nome sarebbero indistinguibili
a chi legge il payload.

⚠️ **`Document.sourceDocumentId` è rimasto `SET NULL`**, ed è deliberato: è il collegamento
documento→documento di **tutte** le conversioni, e portarlo a `RESTRICT` cambierebbe il
comportamento di percorsi che con la Cassa non c’entrano. Il legame che regge il cumulativo
è quello sulle **righe**, che è nuovo e nasce `RESTRICT`.

### ⚠️ Il reso al banco resta autonomo

`createReturn` della Vendita al banco **non** collega, e non è una dimenticanza: il reso al
banco nasce autonomo per contratto (`11` A11), perché la vendita reale può essere stata
battuta su una cassa esterna. Il reso **di Cassa** è un percorso diverso
(`cash-return.service.ts`) e parte sempre dal richiamo dello scontrino.

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

## 13-bis. C3 — validatore, sessione, cassetto, dispositivo

⭐ **Realizzata il 04/09/2026.** Non c'è la chiusura, e non è una dimenticanza.

### ⛔ Nessuna chiusura provvisoria, e il rilascio è unico

Deciso dal proprietario: **C3, C4 e C4B non saranno rilasciate o rese accessibili
separatamente**, e non si crea una chiusura amministrativa con attesi `NULL`.

⚠️ Ne discende un vincolo operativo da tenere presente: **una sessione aperta da C3 non ha
modo di chiudersi** finché C4B non esiste, e l'indice parziale impedisce di aprirne una
seconda sulla stessa sede. È accettabile **solo** perché la funzione non è accessibile
all'utente — nessun menu, nessuna schermata.

### Il validatore, e cosa NON duplica

```text
assertCashContext(tx, tenantId, user, { locationId, sessionId?, deviceId?, comeOperativo? })
```

⛔ **Riceve la TRANSAZIONE**, mai il client globale: fra un controllo fuori transazione e la
scrittura che lo presuppone, la sessione può chiudersi e il dispositivo essere disabilitato.

⛔ **Il tenant arriva dall'utente autenticato**, mai dal payload.

⭐ **Riusa `assertLocationInUserScope`** — già in 61 punti, e sorvegliata da
`check:location-scope` dal confine controller→servizio. Non è stato creato un secondo
sistema di scoping.

⚠️ **Gli errori non distinguono** «di un altro tenant», «di un'altra sede» e «inesistente»:
distinguerli trasformerebbe l'endpoint in un modo per scoprire cosa esiste altrove.

### Il registro degli adapter è VUOTO, ed è il comportamento voluto

`isFiscalAdapterRegistered` legge una whitelist **nel codice** (`api/src/fiscal/`). Oggi non
contiene nulla: C3 non fiscalizza.

|                                           |                                                 |
| ----------------------------------------- | ----------------------------------------------- |
| censire un dispositivo                    | ✅ si può                                       |
| aprire una sessione **senza** dispositivo | ✅ si può: quella sede non fiscalizza           |
| **selezionarlo come operativo**           | ⛔ no, finché il suo adapter non esiste davvero |

⭐ Meglio non poter emettere che credere di poterlo fare. E la chiave non diventa mai il
nome di qualcosa da caricare: nessun import dinamico, nessun percorso, nessun URL.

### Le API

```text
GET   /cash-sessions/current?locationId       retail.register     sessione + totali cassetto
POST  /cash-sessions/open                     retail.cash_session apertura
GET   /cash-sessions/:id/movements            retail.register
POST  /cash-sessions/:id/movements            retail.cash_drawer  versamento o prelievo
GET   /cash-sessions/:id/device-changes       retail.register     lo storico
POST  /cash-sessions/:id/device               retail.cash_session cambio o rimozione
```

⚠️ **Sono le rotte di C3, non tutte quelle della Cassa.** Le altre arrivano con la tranche
che le introduce, e si argomentano nella sua sezione:

```text
POST  /cash-sessions/checkout                    retail.register     C4A, §13-ter
GET   /cash-sessions/returns/lookup/:documentId  retail.cash_return  C4R, §13-quater
POST  /cash-sessions/returns                     retail.cash_return  C4R, §13-quater
POST  /cash-sessions/:id/close                   retail.cash_session C4B, §13-quinquies
```

⛔ **Nessun `DELETE`, `PUT` o `PATCH`**, e non per stile: `check:cassa-append-only` fa
fallire la build. Il cambio dispositivo è un `POST` perché **non è una modifica della
sessione**: è un evento che si aggiunge allo storico, e di cui la sessione porta il
risultato corrente.

⛔ **Nessuna rotta identificata dalla sola sede**: la sede è una _query_, la sessione un
_path parameter_. Il vecchio ramo aveva `PUT /fiscal-devices/{locationId}`, che con più
dispositivi non sa quale modificare.

### ⭐ Il prelievo NON è bloccato dal saldo teorico

Comportamento **dichiarato**, non dedotto: un prelievo maggiore del contante calcolato
passa. Il cassetto reale può divergere dal calcolo — è ciò che la quadratura serve a far
emergere — e rifiutarlo impedirebbe di registrare quello che è successo davvero.

### ⚠️ Due prove che sembravano dimostrare, e non dimostravano

Misurato provando a falsificarle:

| Prova                            | Che cosa si è scoperto                                                                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| due aperture con `Promise.all`   | ⛔ **resta verde anche togliendo l'indice parziale**: le due transazioni si serializzano abbastanza da far vedere alla seconda la sessione della prima, e a fermarla è il controllo applicativo. Serve una prova che interroghi il **database** scavalcando il servizio |
| il CHECK «almeno un dispositivo» | rimosso: implicato da `IS DISTINCT FROM` (rifinitura di C2C)                                                                                                                                                                                                            |

### ⛔ E una TERZA prova produceva un rifiuto non gestito INTERMITTENTE

> **Una promessa creata in anticipo e awaitata dopo può essere rifiutata mentre nessuno la
> sta ancora ascoltando.** Node emette `unhandledRejection`, Vitest lo riporta come errore
> non gestito — e la suite resta **verde**, perché la prova poi l'`await` lo fa.

```text
const altrui      = service.open(…)   ⛔ questa puo` fallire mentre il primo await
const inesistente = service.open(…)      e` ancora in viaggio verso il database
await expect(altrui).rejects…
await expect(inesistente).rejects…    ← il gestore arriva TROPPO TARDI
```

⚠️ **Misurato il 04/09/2026: 2 esecuzioni complete su 10**, sempre sulla stessa prova
(`sessione-cassa`, «una sede di un ALTRO tenant è rifiutata»), e la causa isolata fuori dal
progetto in dieci righe — `unhandledRejection` seguito da `rejectionHandled`.

⭐ **Il difetto era della PROVA, non del prodotto**, e il rimedio è eseguire una chiamata
alla volta catturandone l'errore. Nell'occasione la prova è diventata anche più forte:
adesso verifica che i due messaggi siano **identici**, che è ciò che il suo nome dichiara e
che prima non controllava nessuno.

---

## 13-ter. C4A — il checkout, con le quote

⭐ **Realizzata il 04/09/2026** (migration `20260904210000_quote_di_incasso`,
`cash-checkout.service.ts`).

### La quota di incasso

```text
store_sale_payments.payment_option_id      FK SET NULL   il Tipo, finche` esiste
                    option_name_snapshot                 il nome di ALLORA
                    tender_kind_snapshot                 la classe di ALLORA
                    method                 → nullable    il legacy della Vendita al banco
  CHECK amount_minor >= 0
  CHECK tendered_minor IS NULL OR tendered_minor >= amount_minor
  UNIQUE(document_id, position)
```

⭐ **Gli snapshot non sono ridondanza: sono la fotografia** (`regole-gestionale`). Il Tipo
si rinomina e si elimina; la quota deve continuare a dire con che cosa si è incassato quel
giorno. È anche ciò che rende rimborsabile una quota il cui Tipo non esiste più (§13-quater).

⚠️ **`SET NULL` sul Tipo, e non `RESTRICT`**: il titolare deve poter dismettere un Tipo che
non usa più senza che il database glielo impedisca per una vendita di due anni fa. Ciò che
non si perde è **come si è incassato**, e quello sta negli snapshot.

⛔ **`amount_minor >= 0`, non `> 0`.** Nel database condiviso esiste **una** riga legacy con
importo 0: un vincolo stretto avrebbe rifiutato la migration. Il minimo `1` lo impone il DTO,
dove riguarda solo le quote nuove.

### Il replay ha TRE esiti, non due

```text
stesso intento, stesso payload      → restituisce la vendita GIA` CREATA
stesso intento, payload diverso     → conflitto
due richieste concorrenti           → una crea, l_altra recupera lo stesso risultato
```

⛔ **«Il retry si ferma sul vincolo unico» non è un esito accettabile**: chi ripete perché
la rete è caduta riceverebbe un errore su un_operazione riuscita, e riproverebbe ancora.
`replayIfAlreadyDone` sta nel `catch` e chiede a `CreationIntentService.resolveConflict` di
quale dei tre casi si tratti.

### L_ordine dentro la transazione, e perché è quello

```text
1  intento          PRIMA di tutto: e` cio` che rende ripetibile il resto
2  contesto         sede, sessione aperta, permessi (assertCashContext, C3)
3  varianti, IVA    le primitive estratte da store-sales (commit a parte)
4  ricalcolo        i totali si rifanno sul SERVER: il client propone, non decide
5  quote            somma == totale, resto solo sul contante
6  numerazione      lockDocumentCounter + resolveDocumentNumber
7  documento        confermato, con cash_session_id
8  righe            e le quote con i loro snapshot
9  movimenti        syncUnloadLineMovements, DENTRO la transazione
10 esito            recordResultTx
```

⚠️ **Il push ai canali sta FUORI**: non è un movimento, è una notifica a Shopify e TikTok, e
una loro lentezza non deve tenere aperta una transazione che blocca righe e numeratori.

---

## 13-quater. C4R — il reso, e il rimborso agganciato alla QUOTA

⭐ **Realizzata il 04/09/2026**, con una correzione lo stesso giorno
(`20260904220000_rimborso_collegato_alla_quota`).

### ⛔ Il difetto: contare i rimborsi per TIPO PAGAMENTO

La prima stesura calcolava il residuo rimborsabile per `paymentOptionId`. Il Tipo però non è
l’identità di un incasso: **la quota lo è**. Tre casi lo rompevano, e il secondo è il più
grave perché fa uscire denaro due volte:

| Caso                                                  | Effetto                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Tipo **eliminato** (C4A lo permette)                  | la quota spariva dalla mappa: quel denaro non era più rimborsabile        |
| Tipo eliminato **dopo un rimborso parziale**          | ⛔ quel rimborso usciva dal cumulativo: **lo stesso incasso si restituiva due volte** |
| Due quote della **stessa classe** (due carte diverse) | si sommavano in una sola, e il residuo dell’una copriva l’altra           |
| Due resi **concorrenti su righe prodotto diverse**    | non competevano su nessuna riga: il lock stava solo sulle righe           |

⚠️ **Il Tipo RINOMINATO non era un caso a sé**, ed è la parte che già funzionava: gli
snapshot di C4A conservano il nome di allora, e il rimborso li copia dalla quota — non
rilegge l’anagrafica.

### La struttura

```text
store_sale_payments.refunded_from_payment_id   self-FK RESTRICT
  UNIQUE(document_id, refunded_from_payment_id)
  INDEX(refunded_from_payment_id)
```

⭐ **La quota di rimborso COPIA dalla quota originale**: `paymentOptionId` se il Tipo esiste
ancora, `optionNameSnapshot` e `tenderKindSnapshot` sempre. Con il Tipo eliminato il rimborso
resta possibile e la quota nasce con `paymentOptionId = NULL`.

⛔ **`RESTRICT` e non `SET NULL`**, per la stessa ragione del legame fra righe: azzerare il
riferimento perderebbe l’origine **in silenzio**, e con lei il cumulativo — cioè il difetto
che questo collegamento chiude.

⚠️ **L’unico è per DOCUMENTO, non globale.** La stessa quota si rimborsa più volte in resi
distinti — un reso oggi, un altro domani; quello che non può è comparire due volte **nello
stesso** reso, dove il cumulativo diventerebbe ambiguo da leggere. A limitare il totale sono
il lock e la transazione, non un vincolo.

### Dentro la transazione del reso

```text
1  intento
2  contesto        sede corrente, sessione aperta
3  lock RIGHE      SELECT … WHERE id = ANY(...) ORDER BY id FOR UPDATE
3b lock QUOTE      lo stesso, sulle quote originali indicate dal rimborso
4  la vendita      e la verifica che ogni riga le appartenga
5  cumulativo QTA  ricostruito dalle righe di reso non annullate
6  importi         proporzionali sulla RIGA ORIGINALE, mai dal listino di oggi
7  cumulativo EUR  per QUOTA, dai rimborsi precedenti non annullati
8  documento, righe, quote, movimenti di rientro
```

⭐ **L’ordine dei lock è deterministico** (`ORDER BY id`): due resi che bloccassero le stesse
righe in ordine diverso si aspetterebbero a vicenda. Ordinati, il secondo aspetta e basta.

⛔ **Il lock sulle QUOTE non è ridondante rispetto a quello sulle righe.** Due resi che
riguardano righe prodotto **diverse** non competono su nessuna riga — e passerebbero entrambi
— ma possono attingere all’ultimo importo disponibile della **stessa** quota di incasso. È la
prova `due resi CONCORRENTI su righe DIVERSE, stessa quota`.

### Il rimborso: solo le quote di QUESTA vendita

⛔ Nessuna modalità **nuova**: si restituisce come si è incassato. Un buono al posto del
contante è una decisione che non è stata presa.

⚠️ E nemmeno la quota di **un altro scontrino**, anche se dello stesso Tipo: col conteggio
per Tipo sarebbe passata.

⚠️ Una quota **storica senza classificazione** (precedente a C2B) non si rimborsa dalla
Cassa: non si sa come restituirla, e indovinarlo sarebbe peggio che fermarsi.

### La merce rientra nella sede CORRENTE

⭐ Non in quella della vendita: il cliente può tornare in un altro negozio, e la merce sta
dove viene fisicamente riportata. Il documento di reso porta quindi la sede della sessione
aperta, non quella dello scontrino richiamato.

### Le prove, e cosa falsifica cosa

| Guasto introdotto                                     | Prova che diventa rossa                                    |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| lock sulle quote disattivato                          | `due resi CONCORRENTI su righe DIVERSE, stessa quota`      |
| cumulativo contato per Tipo (difetto originale)       | `il cumulativo regge anche dopo l_eliminazione del Tipo`   |
| quote senza Tipo saltate                              | `un Tipo ELIMINATO non impedisce il rimborso`              |
| controllo della quota ripetuta rimosso                | `la stessa quota non compare due volte nello stesso rimborso` |
| indice unico `(document_id, refunded_from_payment_id)` rimosso | `la stessa quota di incasso NON si rimborsa due volte nello stesso reso` |
| self-FK portata a `SET NULL`                          | `la quota di incasso non si cancella finche` un rimborso la restituisce` |

⚠️ **Due prove sono state riscritte perché NON isolavano**, e la seconda passava per il
motivo sbagliato:

- «non si rende più della quantità venduta» era fermata dal limite del **rimborso**, non da
  quello della quantità. Isolata con due righe da un pezzo, rendendone due dalla prima.
- «il cumulativo regge dopo l’eliminazione del Tipo» chiedeva 200,00 € per un reso da
  100,00: a fermarla era «il rimborso copre il reso». Isolata con **due quote da 100,00**,
  esaurendo la prima e richiedendola di nuovo — così la somma torna e a fermarlo può essere
  solo il residuo.

⭐ **Ed è la ragione per cui si falsifica**: entrambe erano verdi, e verdi restavano
riproducendo il difetto che dicevano di escludere.

⚠️ **Una prova che elimina un Tipo CONDIVISO lega le successive alla propria riuscita**: se
fallisce prima di ricrearlo, cadono anche quelle dopo. Misurato — un guasto solo, quattro
prove rosse. Le due prove usano ora un Tipo **usa-e-getta**.

---
## 13-quinquies. C4B — la chiusura, e la quadratura congelata

⭐ **Realizzata il 04/09/2026** (`cash-closing.service.ts`), **senza migration**: le
colonne le aveva già preparate C2C, e restavano `NULL` perché gli attesi non erano
calcolabili finché non esistevano le quote.

```text
POST /cash-sessions/:id/close?locationId=…      retail.cash_session
  countedCashMinor           obbligatorio, >= 0
  declaredElectronicMinor    facoltativo, `null` = non riconciliato
  notes                      facoltative
```

### ⭐ La cecità è STRUTTURALE, non una scelta della maschera

> **Gli attesi non esistono finché la sessione è aperta.** Le colonne sono `NULL`, e
> nessuna rotta li calcola: si materializzano dentro la transazione di chiusura, **dopo**
> che l’operatore ha dichiarato quanto ha contato.

⛔ **Non c’è un endpoint di anteprima**, e non è una dimenticanza: un conteggio fatto
sapendo il risultato non è un conteggio. Se domani servisse un «atteso provvisorio» per
un ruolo di controllo, è una decisione da prendere — non un’aggiunta innocua.

⚠️ `GET /cash-sessions/current` restituisce **solo** `session`, `depositsMinor` e
`withdrawalsMinor`: i due totali del cassetto sono movimenti che l’operatore ha inserito
lui, non una previsione della cassa. La prova verifica anche **quali chiavi** torna, così
un campo aggiunto per comodità non apre una feritoia in silenzio.

### Le formule, e cosa NON entra

```text
expectedCashMinor       = fondo + venditeCash − resiCash + versamenti − prelievi
expectedElectronicMinor = venditeElettroniche − resiElettronici        ⭐ né fondo né cassetto
cashDifferenceMinor     = countedCash − expectedCash                    ⭐ DERIVATA
electronicDifference    = dichiarato − atteso, oppure `null`            se non riconciliato
```

⛔ **La differenza non è una colonna**, e la prova lo verifica interrogando
`information_schema`: persisterla creerebbe un terzo valore capace di contraddire i due da
cui deriva. È la stessa disciplina del cumulativo dei resi (§12-bis).

⛔ **I documenti ANNULLATI non contribuiscono.** Era il difetto del ramo storico: la sua
query non filtrava su `status`, e un `store_sale` annullato entrava negli attesi.

⛔ **La classe la porta la QUOTA, non il Tipo corrente.** Riclassificare un Tipo domani
cambierebbe altrimenti la quadratura di una sessione chiusa a marzo.

### ⛔ Nessun ramo di ripiego sull’enum

Il `bucket()` del ramo storico mandava «ogni metodo sconosciuto» in `other`: con
`tenderKind` quella riga farebbe **sparire in silenzio** una classe nuova dalla quadratura.
Qui lo `switch` è esaustivo e ogni caso non trattato **ferma la chiusura**:

| Quota                     | Esito                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| `cash` · `electronic`     | quadrano                                                               |
| `voucher`                 | ⛔ ferma: modellato in C2B, non abilitato al checkout                  |
| snapshot `null` (storica) | ⛔ ferma: non si sa come classificarla, e indovinare sarebbe peggio    |
| una classe **futura**     | ⛔ ferma: il giorno che l’enum cresce, questo punto deve farsi trovare |

⚠️ **La sessione resta APERTA** quando la quadratura si ferma: non si chiude una cassa
che non quadra, e l’operatore deve poter sistemare la quota prima di riprovare.

### La chiusura concorrente

⭐ **A decidere è il lock di sessione del validatore** (§13-sexies): la seconda chiusura si
mette in fila, e quando tocca a lei trova la sessione già chiusa.

⚠️ **Qui c’era scritto che a decidere fosse l’aggiornamento condizionale** — `updateMany
where status = open` — «non un lock, ma una scrittura che contiene la propria
precondizione». Era vero quando la sezione è stata scritta, e lo stesso giorno è stato
misurato che **non bastava**: due chiusure si contendono la riga alla fine, ma una vendita
in volo passa in mezzo.

⭐ **L’aggiornamento condizionale RESTA**, e non è ridondante: è la rete che regge se un
percorso futuro scrivesse quella riga senza passare dal validatore. Il rifiuto può quindi
arrivare da due punti — la prova accetta entrambi, perché sono due messaggi per lo stesso
fatto.

### Le prove, e cosa falsifica cosa

| Guasto introdotto                                | Prova che diventa rossa                            |
| ------------------------------------------------ | -------------------------------------------------- |
| condizione `status = open` tolta dall’update     | `due chiusure SIMULTANEE`                          |
| filtro sui documenti annullati tolto             | `i documenti ANNULLATI non contribuiscono`         |
| classe letta dal Tipo corrente invece che dalla quota | `riclassificare il Tipo NON sposta la quadratura` |
| ramo di ripiego aggiunto allo `switch`           | `una quota VOUCHER ferma la quadratura`            |
| il fondo aggiunto anche all’elettronico          | `la quadratura: fondo, vendite, resi…`             |

⚠️ **Una prova che riclassifica il Tipo CONDIVISO lega le successive alla propria
riuscita**: se fallisce prima di rimetterlo a posto, cadono anche quelle dopo. Usa un Tipo
usa-e-getta — è la stessa lezione di §13-quater, arrivata da una falsificazione.

---
## 13-sexies. Il punto di serializzazione della sessione

⭐ **Deciso e realizzato il 04/09/2026**, chiudendo C4B: `assertCashContext` prende un
`SELECT … FOR UPDATE` sulla riga `cash_sessions` quando la richiesta nomina una sessione.

> **Sta nel validatore, non nei servizi.** Distribuire un lock per servizio significa che
> dimenticarne uno basta a riaprire il buco — e il servizio che lo dimentica è sempre
> quello scritto dopo.

```text
checkout · reso · versamento · prelievo · cambio dispositivo · chiusura
  → passano tutte da assertCashContext(sessionId)
  → si mettono in fila sulla STESSA riga
```

### ⛔ Il difetto, misurato prima di correggerlo

Una vendita **in volo** — passata dal validatore, ferma sul numeratore, non ancora
confermata — non era vista dalla chiusura. La chiusura calcolava gli attesi, congelava e
chiudeva; un attimo dopo la vendita si confermava **dentro una sessione chiusa e fuori
dalla quadratura**.

```text
prima del lock    vendita confermata 100,00 €   ·   expectedCash congelato 0
dopo il lock      vendita confermata 100,00 €   ·   expectedCash congelato 100,00 €
```

⚠️ **La sola concorrenza fra due `close` non lo prendeva**, ed è la ragione per cui la
prova esisteva ed era verde: due chiusure si contendono la stessa riga alla fine, mentre
il problema è fra la lettura degli attesi e la scrittura di **un’altra** operazione.

### ⛔ E il `FOR KEY SHARE` gratuito non bastava — è la trappola di questa verifica

PostgreSQL prende **da solo** un `FOR KEY SHARE` sulla riga padre quando si inserisce un
figlio: un documento con `cash_session_id`, un movimento di cassetto. Quel lock confligge
con un `FOR UPDATE` esterno — quindi una prova che blocchi la riga da fuori e guardi se
l’operazione **attende** passava già **cinque volte su sei** prima della correzione.

⭐ **Ma due `FOR KEY SHARE` sono compatibili fra loro.** Vendita e chiusura potevano
procedere insieme, e la chiusura prendeva `FOR UPDATE` solo alla fine — dopo aver letto.
Una prova di sola attesa non distingue i due casi: servono le prove che mettono davvero
in corsa la chiusura con un’altra operazione.

### Il risultato, nei due versi

| Chi prende il lock per primo | Che cosa succede                                                          |
| ---------------------------- | ------------------------------------------------------------------------- |
| **l’operazione**             | conclude, e la chiusura — che ha aspettato — la **include** negli attesi  |
| **la chiusura**              | l’operazione attende, poi trova la sessione chiusa ed è **rifiutata**     |

⛔ **Non esiste il terzo caso**: una vendita, un reso o un movimento confermato dopo il
calcolo e assente dagli attesi congelati.

### ⚠️ Una conseguenza dichiarata: due cambi dispositivo concorrenti ora riescono ENTRAMBI

Prima si sovrapponevano, leggevano lo stesso «precedente» e a fermare il secondo era
l’aggiornamento condizionale. Ora si mettono in fila e il secondo si applica **sopra** il
primo.

⭐ **La garanzia non era «uno solo riesce»: era che lo storico restasse una CATENA** — ogni
riga che parte da dove finisce la precedente — e quella regge, anzi è più forte. Rifiutare
il secondo, ora che legge un «precedente» aggiornato, sarebbe rifiutare un cambio legittimo.

⚠️ **Gli aggiornamenti condizionali RESTANO** — sul cambio dispositivo e sulla chiusura — e
non sono ridondanti: sono la rete che regge se un percorso futuro scrivesse quelle righe
senza passare dal validatore.

### L’ordine dei lock, e perché non si annoda

```text
sessione  →  numeratore (advisory)        checkout
sessione  →  righe  →  quote               reso
sessione  →  (nient’altro)                 movimenti, dispositivo, chiusura
```

⭐ La sessione si blocca **per prima ovunque**, perché il validatore è il primo passo di
ogni transazione: nessun ciclo di attesa è possibile fra queste operazioni.

⚠️ **Le letture non bloccano**: `current`, l’elenco movimenti, lo storico dispositivi e il
richiamo dello scontrino passano dal validatore **senza** `sessionId`, quindi non prendono
il lock. Consultare la cassa non deve mettersi in fila dietro a chi vende.

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

## 14-bis. Il contratto dei componenti di pagamento

⛔ **Scritto ora perché non venga deciso mentre lo si scrive.** Nessun componente si
implementa in C2C.

| Livello                                             |                    |                                                                   |
| --------------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| **anagrafica `PaymentOption`, servizio, selettore** | ✅ **condivisi**   | esistono, e la Cassa li usa come sono                             |
| **componente finanziaria dei documenti**            | resta **distinta** | scadenze, condizioni, esposizione: un documento si paga nel tempo |
| **componente Cassa per le quote immediate**         | **specializzato**  | si incassa adesso, in una o più quote, e si chiude                |

⭐ **Il componente Cassa è PRESENTAZIONALE**: riceve i Tipi ammessi, il totale e le quote,
e restituisce **un valore validato**. Nient'altro.

⛔ **Restano al backend**, e non si spostano nel componente per comodità: persistenza,
idempotenza, tenant, sessione, movimenti.

⛔ **Nessuna copia locale del catalogo Pagamenti.** Un secondo elenco diverge dal primo, e
diverge in silenzio: è la stessa ragione per cui il catalogo normativo di C2A è **globale**
e non per tenant.

⛔ **Nessuna dipendenza dalla UI della Vendita al banco.** Sono due flussi distinti (§1), e
un componente condiviso fra i due li legherebbe di nuovo — proprio ciò che C0 ha separato.

⚠️ **«Tipi ammessi» significa `tenderKind IS NOT NULL` e `isActive`**, deciso dal backend:
il componente non filtra il catalogo, lo riceve già filtrato.

---

## 15. La sequenza

| Tranche | Contenuto                                                                                                                                                 | Migration               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **C0**  | questa specifica, separazione delle rotte, contratto transitorio dei pagamenti, censimento `PaymentOption`                                                | ⛔ nessuna              |
| **C1**  | modelli Prisma delle tabelle Cassa **già esistenti**, relazioni, prove di schema e isolamento                                                             | ⛔ nessuna              |
| **C1B** | neutralizzazione dell'infrastruttura fiscale: nessuna assunzione su produttore, LAN, browser o «un solo dispositivo per sede»                             | ✅ additiva/compatibile |
| **C1C** | il dispositivo fiscale si lega alla **sessione**; `fiscal_receipts.device_id` smette di perdere chi ha emesso                                             | ✅ additiva + FK        |
| **C2A** | catalogo globale delle Modalità normative, codice FatturaPA strutturato, FK nullable da `PaymentOption`, backfill esplicito, Impostazioni                 | ✅ additiva, nullable   |
| **C2B** | classificazione **operativa** dei Tipi pagamento per il checkout (`PaymentTenderKind`), backfill dichiarato, Impostazioni, backup                         | ✅ additiva, nullable   |
| **C2C** | consolidamento dello schema dormiente: vocabolario della chiusura secondo C2B, storico append-only dei cambi dispositivo                                  | ✅ rinomina + tabella   |
| **C3**  | ✅ validatore transazionale, apertura, sessione corrente, scelta e cambio dispositivo con storico, versamenti e prelievi. ⛔ **senza chiusura**: è di C4B | ⛔ nessuna              |
| **C4A** | ✅ **checkout**: quote, pagamento misto, resto, carta rifiutata, creazione idempotente, `store_sale_payments` (contratto in §5-bis)                       | ✅ applicata            |
| **C4R** | ✅ **reso** collegato allo scontrino, riga per riga, con rimborso agganciato alla quota di incasso                                                        | ✅ applicata            |
| **C4B** | ✅ **chiusura**: quadratura cieca, attesi congelati dalle quote, differenza derivata, chiusura concorrente                                                | ⛔ nessuna              |
| **C5**  | **fiscalizzazione provider-neutral**: rappresentazione fiscale AdE, adapter, trasporto, dispositivo reale. Nessun produttore è predeterminato             | —                       |
| _poi_   | migrazione della **Vendita al banco** da `cash \| card \| other` a `PaymentOption`                                                                        | tranche **autonoma**    |

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
