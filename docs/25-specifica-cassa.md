# 25 — Specifica Cassa

_Contratto della **Cassa** di VestiFlow e della sua separazione dalla **Vendita al
banco**. Scritta il 04/09/2026 come tranche **C0** del recupero da
`origin/feature/cassa`, che resta sorgente storica in sola lettura._

> ⛔ **Questo documento non è la specifica della Vendita al banco.** Quella è
> `docs/11-specifica-vendita-al-banco.md` e **non cambia**. Qui si descrive un flusso
> operativo diverso che _usa_ quel documento, non lo sostituisce.

---

## 0. Le decisioni vigenti

| #   | Decisione                                                                              | Dove si argomenta |
| --- | -------------------------------------------------------------------------------------- | ----------------- |
| 1   | Vendita al banco e Cassa sono **due flussi distinti**, su **rotte separate**           | §1, §3            |
| 2   | La Cassa produce una **normale `store_sale`**: nessun secondo documento economico      | §4                |
| 3   | La Vendita al banco conserva `cash \| card \| other`; la **Cassa usa `PaymentOption`** | §5                |
| 4   | «Misto» è **calcolato a lettura dalle quote**, mai persistito                          | §6                |
| 5   | `PaymentOption` va esteso: la migration è di **C2A**. La classe RT è **C2B**, sospesa  | §7                |
| 6   | Le sei tabelle esistono già nel database: **non si ricreano**                          | §8                |

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

### ⏸ C2B — la classificazione RT, NON autorizzata

⛔ **Non si aggiunge un `PaymentTenderClass` lasciato tutto a `NULL`.** Prima va verificato:
specifiche RT correnti; il protocollo del dispositivo che si vorrà supportare; la differenza
fra contante, elettronico, **non riscosso**, buoni e altre categorie; le differenze fra
marche e firmware; e soprattutto **se la classificazione sia un dato del catalogo o un mapper
versionato per dispositivo e protocollo** — che è una forma diversa e va scelta, non dedotta.

⚠️ **La verifica normativa è stata fatta** (04/09/2026) e ha smentito l'ipotesi di partenza:
lo schema AdE non ha un enum di quattro valori. I `Pagato*` stanno nel blocco 4.2, i
`NonRiscosso*` nel **4.1 per aliquota IVA**, `<Ticket>` porta importo **e conteggio**, e
`<ScontoApagare>` è un concetto a sé. Resta da verificare il **protocollo di un dispositivo
reale**, che non esiste ancora.

⛔ Finché non è verificato, **C2 non è completata** e la Cassa non introduce pagamenti reali
né fiscalizzazione.

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

### Come si sceglie il dispositivo

La rimozione dell'unicità per sede apre la domanda, e la risposta non può essere «il primo».

- una sede può avere **più dispositivi**;
- la scelta è **esplicita**: dispositivo predefinito della sede, oppure legato alla sessione
  o alla postazione;
- un dispositivo **disabilitato** non è selezionabile per operazioni nuove, ma le ricevute
  già emesse continuano a riferirlo;
- ⛔ **un ritentativo non cambia dispositivo in silenzio**: si riemette sullo stesso, o si
  dichiara un'operazione nuova;
- tenant e sede si verificano su ogni scrittura.

### Il trasporto non è deciso, e il modello non deve deciderlo

| Forma                           | HTTPS / CORS / rete                     | Credenziali   | Con Railway                | Offline | Prova     |
| ------------------------------- | --------------------------------------- | ------------- | -------------------------- | ------- | --------- |
| browser → dispositivo LAN       | ⚠️ contesto sicuro e certificati locali | nel negozio   | il server non entra in LAN | ✅      | difficile |
| agente locale                   | ✅ controllabile                        | nel negozio   | indipendente               | ✅      | media     |
| backend → dispositivo o gateway | ⚠️ richiede raggiungibilità             | centralizzate | ✅                         | ⛔      | facile    |
| API cloud del fornitore         | ✅                                      | centralizzate | ✅                         | ⛔      | facile    |

⛔ **Nessuna è esclusa dal modello.** L'indirizzo di collegamento è **opzionale** proprio
perché un adapter cloud o un agente locale possono non averne uno.

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

| Tranche | Contenuto                                                                                                                                                       | Migration               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **C0**  | questa specifica, separazione delle rotte, contratto transitorio dei pagamenti, censimento `PaymentOption`                                                      | ⛔ nessuna              |
| **C1**  | modelli Prisma delle tabelle Cassa **già esistenti**, relazioni, prove di schema e isolamento                                                                   | ⛔ nessuna              |
| **C1B** | neutralizzazione dell'infrastruttura fiscale: nessuna assunzione su produttore, LAN, browser o «un solo dispositivo per sede»                                   | ✅ additiva/compatibile |
| **C2A** | catalogo globale delle Modalità normative, codice FatturaPA strutturato, FK nullable da `PaymentOption`, backfill esplicito, Impostazioni                       | ✅ additiva, nullable   |
| **C2B** | ⏸ classificazione RT — **non autorizzata**: prima va verificata (§7)                                                                                            | ⏸ da decidere           |
| **C3**  | checkout Cassa, sessione aperta, pagamento unico e misto, quadratura, resto, carta fallita, creazione idempotente                                               | —                       |
| **C4**  | sessioni e riconciliazione: apertura/chiusura, fondo, movimenti di cassetto, conteggio, differenze, terminali POS                                               | —                       |
| **C5**  | fiscalizzazione **indipendente dal produttore**, tramite adapter; il primo adapter si sceglie quando saranno disponibili dispositivo, firmware e documentazione | —                       |
| _poi_   | migrazione della **Vendita al banco** da `cash \| card \| other` a `PaymentOption`                                                                              | tranche **autonoma**    |

⛔ **Non si comincia una tranche lasciando rossa la precedente.**

⚠️ La sequenza è stata **rivista il 04/09/2026** rispetto al mandato iniziale, che metteva il
checkout in C2: la classificazione di `PaymentOption` è una dipendenza del checkout, quindi
viene prima. Sessioni e fiscalizzazione slittano di conseguenza.

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
