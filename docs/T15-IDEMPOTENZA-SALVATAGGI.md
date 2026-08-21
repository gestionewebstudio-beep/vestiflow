# T15 — Idempotenza dei salvataggi documentali

_Censimento del 21/08/2026. Mappa di **57 comandi** di scrittura, ricavata leggendo controller,
servizi, schema e maschere. Nessuna riga di implementazione è stata scritta._

⛔ **Non è un documento di soluzione.** Descrive che cosa succede oggi, con l'evidenza, e
distingue ciò che va chiuso ora da ciò che appartiene ad altri lavori.

---

## 1. La regola richiesta

Dichiarata dal proprietario il 21/08/2026 come regola **trasversale** di VestiFlow — non un
requisito della sola Vendita al banco:

> **Lo stesso comando di salvataggio, reinviato per doppio clic, timeout, perdita della risposta
> o retry, non deve duplicare dati né effetti.**
>
> Un nuovo intento **volontario** deve invece restare libero di produrre un documento identico al
> precedente.

Le tre righe che ne discendono:

1. un retry della stessa **creazione** non deve creare un secondo documento;
2. un retry dello stesso **aggiornamento** non deve riapplicare quantità, movimenti o altri effetti;
3. due clienti che comprano la stessa maglietta nello stesso minuto restano **due vendite**.

⚠️ **Il requisito è citato come FND-012 del Piano Master, che è un `.docx` ESTERNO a questo
repository e non è leggibile da qui.** Lo dichiarano `docs/13` §572 e `GUARDIE-MANCANTI.md` §1082,
con la nota che «l'esistenza dei `.docx` non è verificata». La regola qui sopra è quindi riportata
**come consegnata a voce**, non citata. ⛔ E c'è un precedente: un altro requisito del Piano Master
— il salvataggio progressivo — è già stato **ritirato dai documenti del repo** perché promettevano
una cosa che il codice non faceva. I due mondi hanno già divergiuto una volta.

### ⛔ Due meccanismi diversi, che vanno tenuti separati

Confonderli è ciò che ha reso confusa la prima stesura di questa mappa:

| Meccanismo                   | Quando parte il secondo comando         | Chi lo ferma oggi                                                                    |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| **Doppio clic**              | prima che il primo risponda             | guardie di rientro (`if (pending) return`) e pulsanti disabilitati, **dove ci sono** |
| **Risposta persa / timeout** | dopo che il primo ha **già committato** | ⛔ **niente**                                                                        |

Il primo è un problema di interfaccia, e su diverse maschere è già chiuso. Il secondo è il
problema di T15, e non è chiuso da nessuna parte.

⚠️ La guardia di rientro vale **dentro un'istanza del componente**: due schede, un refresh a metà
volo o una sessione ripresa la scavalcano. È una guardia di processo, non un contratto.

---

## 2. Il comportamento osservato — la causa radice

> **Ogni effetto è riconciliato su una chiave che appartiene al record. Un secondo record porta
> chiavi nuove, quindi ogni riconciliazione riparte da zero.**

Il solo discriminante fra creazione e aggiornamento è **`dto.id`**, che per costruzione il client
non possiede quando la risposta si perde: l'id lo impara nel ramo `next` della sottoscrizione, che
in quel caso non viene mai eseguito. Il reinvio è quindi, per il server, una creazione nuova e
legittima.

Le tre riconciliazioni che reggono l'aggiornamento, e che la creazione azzera:

| Effetto       | Chiave                                                          | Aggiornamento       | Retry della creazione              |
| ------------- | --------------------------------------------------------------- | ------------------- | ---------------------------------- |
| **Righe**     | `line.id` (upsert per id)                                       | aggiornate          | id nuovi → righe nuove             |
| **Movimenti** | `sourceLineId` + `@@unique([sourceDocumentType, sourceLineId])` | aggiornati in posto | id nuovi → movimenti nuovi         |
| **Impegni**   | `salesOrderLineId`, dentro un sync                              | riconciliati        | righe ordine nuove → impegni nuovi |

E gli effetti che **non hanno** una chiave di riconciliazione:

- **Lotti** — `quantity: { increment }` (`inventory-lot.util.ts:39`), senza alcun legame con la
  riga che li ha mossi. Protetti in aggiornamento solo di riflesso, dal filtro
  `sync.createdLineIds`; scoperti alla creazione, dove tutte le righe sono nuove.
- **Numero documento** — ogni creazione ne consuma uno nuovo. ⚠️ E l'advisory lock del contatore
  **peggiora la leggibilità del danno**: al secondo giro consegna il numero successivo, quindi il
  duplicato esce con un numero regolare e non somiglia a un errore.
- **Registri e riepiloghi** — il Registro Corrispettivi somma i documenti: se raddoppiano i
  documenti, raddoppiano imponibile, IVA e totale.

### ⭐ Il vizio da non ripetere leggendo questa mappa

Una guardia che impedisce di **rieseguire lo stesso record** non impedisce che ne nasca un
**secondo**. Sono duplicazioni diverse, e scambiarle fa dichiarare protetto un percorso che non lo
è. Ogni voce di questa mappa dichiara quindi **quale duplicazione il meccanismo impedisce** e
**quale lascia possibile**.

---

## 3. Come si legge questa mappa

Ogni comando è censito come **comando dell'operatore**, non come stato del documento.

⛔ **`draft`, `confirm` e stati analoghi compaiono solo come comportamento tecnico osservato**, con
il tipo documento e la rotta su cui è stato letto. **Non se ne deduce alcuno stato o workflow
funzionale VestiFlow.**

I due casi sono sempre separati:

- **A · prima creazione** — il client potrebbe non conoscere ancora l'id del record;
- **B · modifica** — un id esiste già, e va verificato se gli effetti sono **davvero** riconciliati
  per differenza.

Le tre classificazioni:

|                              |                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ⛔ **VULNERABILE**           | il reinvio duplica dati o effetti, e niente lo impedisce                                                            |
| ⚠️ **PARZIALMENTE PROTETTO** | un meccanismo impedisce _una_ duplicazione ma non _quella_ in questione, oppure il caso B è protetto e il caso A no |
| ✅ **PROTETTO**              | il reinvio non duplica, e la voce dichiara perché                                                                   |

⚠️ La mappa è stata prodotta da un censimento a ventaglio con una **fase avversariale** il cui
compito era smontare le classificazioni troppo generose. Ha corretto cause tecniche in **sei
famiglie su sette**: le correzioni sono incorporate nelle voci.

---

## 3-bis. ⭐ CHECKLIST PERMANENTE — lo stato di ogni cosa censita

> ⛔ **Questa tabella è la fonte.** Nessun problema censito deve restare soltanto
> in una conversazione: se non è qui, per il progetto non esiste. Ogni voce
> chiusa porta il commit e i test che la tengono chiusa.

**Stati:** `DA FARE` · `FIXED` · `DEFERRED PER MODULO` (registrato, ma appartiene
a un modulo non ancora affrontato funzionalmente) · `FUORI PERIMETRO`.

### Infrastruttura

| #   | Cosa                                                                                                                                | Stato        | Commit · test                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| I1  | Registro comune degli intenti di creazione: tabella `creation_intents`, vincolo `(tenant_id, intent_id)`, RLS + REVOKE              | ✅ **FIXED** | `feat(idempotenza): registro comune degli intenti di creazione (T15A)` · 11 test in `store-sales.service.spec.ts` §T15A |
| I2  | Claim come **prima** scrittura della transazione; riferimento al record come **ultima**                                             | ✅ **FIXED** | idem · test «rollback — nessun claim residuo»                                                                           |
| I3  | Nessuna interazione con `isDocumentNumberConflict`                                                                                  | ✅ **FIXED** | idem · test «un intento duplicato non diventa mai numero già assegnato»                                                 |
| I4  | Il client genera l'intento **una volta per compilazione** e lo conserva attraverso timeout e reinvii                                | ✅ **FIXED** | `feat(store-sales): l'intento di creazione viaggia dal client, e diventa obbligatorio (T15B)` · 6 test client           |
| I5  | Il contratto è **chiuso**: creare senza intento viene rifiutato (`@ValidateIf` in creazione + rete nel servizio)                    | ✅ **FIXED** | T15B · 3 test di servizio + 4 di DTO                                                                                    |
| I6  | Il **409 non è una categoria sola**: `creation_intent_mismatch` e `_in_progress` NON azzerano l'intento; `document_number_taken` sì | ✅ **FIXED** | `fix(store-sales): il 409 non e' una categoria sola… ` · 4 test client                                                  |
| I7  | `creation_intent_mismatch` porta `resultRef`, per ricondurre l’operatore al documento già creato                                    | ✅ **FIXED** | idem                                                                                                                    |

### Percorsi in perimetro

| #   | Percorso                                                                                                                                               | Stato          | Commit · test                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------- |
| P1  | **Vendita al banco** — `POST /store-sales`                                                                                                             | ✅ **FIXED**   | T15A (backend) + T15B (client e contratto chiuso) |
| P2  | **Reso al banco** — `POST /store-sales/returns`                                                                                                        | ✅ **FIXED**   | idem                                              |
| P3  | **Arrivo merce** — `POST /documents/goods-receipt/save` (caso base, lotti, seriali, carico manuale, carico iniziale, ordine incluso, articolo da riga) | ⛔ **DA FARE** | —                                                 |
| P4  | **Ordine fornitore** — `POST /supplier-orders`                                                                                                         | ⛔ **DA FARE** | —                                                 |
| P5  | **Ordine cliente manuale** — `POST /sales-orders/manual/save` (⚠️ crea **impegni** di magazzino: il reinvio li raddoppia)                              | ⛔ **DA FARE** | —                                                 |
| P6  | **Corrispettivo manuale** — `POST /manual-receipts`                                                                                                    | ⛔ **DA FARE** | —                                                 |
| P7  | **Documenti generici** — `POST /documents` (nove tipi, quattro maschere)                                                                               | ⛔ **DA FARE** | —                                                 |
| P8  | **Fornitore/Cliente creati dal pannello** — `POST /suppliers`, `POST /customers`                                                                       | ⛔ **DA FARE** | —                                                 |
| P9  | **Allegati** — `POST /documents/:id/attachments`, `POST /sales-orders/:id/attachments`                                                                 | ⛔ **DA FARE** | —                                                 |
| P10 | **Movimento singolo** — `POST /inventory/movements`                                                                                                    | ⛔ **DA FARE** | —                                                 |
| P11 | **Sessione di inventario** — `POST /inventory/counts`                                                                                                  | ⛔ **DA FARE** | —                                                 |

### Difetti puntuali emersi dal censimento

| #   | Difetto                                                                                                                                              | Stato                                                                                   | Commit · test                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Annulla documento: doppio storno** con due richieste concorrenti — guardia fuori dalla transazione e scrittura finale senza condizione sullo stato | ✅ **FIXED**                                                                            | `fix(documents): l'annullamento rivendica il documento prima di stornare` · test «due annullamenti concorrenti stornano UNA volta sola» |
| D2  | **Conta inventario: la seconda scansione si perde** — incremento calcolato sul client, nessuna guardia in volo sullo scanner                         | ⏸ **FUORI PERIMETRO** — difetto di segno opposto (perdita, non duplicazione). Vedi §6.1 | —                                                                                                                                       |
| D3  | **Duplica documento** delega a `save` senza id, ereditando l'intera vulnerabilità della creazione, impegni compresi                                  | ⏸ **FUORI PERIMETRO** — funzione volontaria, si affronta con quella funzione. Vedi §6.2 | —                                                                                                                                       |

### Invarianti fragili (§7)

| #   | Invariante                                                                                          | Stato                                                                |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| V1  | `StockMovement.sourceLineId` senza `@relation`: è ciò che permette lo storno degli orfani           | ⚠️ **DA FARE** — dichiarato qui, non protetto da alcun test          |
| V2  | `isDocumentNumberConflict` regge sul fatto che `documents` abbia un solo vincolo unico              | ✅ **rispettato da T15A**, che non aggiunge vincoli a quella tabella |
| V3  | `SalesOrder.documentId` non ha vincolo unico: il freno è applicativo, e cede a due POST sovrapposti | ⛔ **DA FARE**                                                       |
| V4  | I lotti sono protetti in aggiornamento solo di riflesso, da `sync.createdLineIds`                   | ⚠️ **DA FARE** — nessun test lo inchioda                             |

### Moduli non affrontati funzionalmente

| #   | Modulo                                            | Stato                                                                                            |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| M1  | **Trasferimento e Rettifica** — 6 comandi censiti | ⏸ **DEFERRED PER MODULO** — registrato in §5, ⛔ nessuna decisione di dominio dal codice attuale |

---

## 4. Problemi da risolvere ORA — 45 comandi in perimetro

Sono i comandi normali di creazione e salvataggio, sullo scenario
**commit riuscito → risposta persa → stesso comando reinviato**.

### ⛔ VULNERABILI — 12

#### 1. `POST /documents/goods-receipt/save → GoodsReceiptWorkflowService.saveGoodsReceipt → saveGoodsReceiptInner`

**Comando** — «Salvo l'arrivo merce» — caso base: nessun ordine fornitore incluso, nessun lotto, nessun seriale, nessun articolo creato dalla riga. Premo Salva documento, la rotellina gira, dopo 15s compare l'errore di timeout, ripremo Salva.

**Il client manda** — LETTO. Corpo costruito in buildSaveGoodsReceiptBody (goods-receipt-form.component.ts:4628-4715): `id: this.persistedDocumentId() ?? undefined` (:4645), `number: this.requestedDocumentNumber()` (:4667, = undefined se il numero non è stato digitato — document-numbering.store.ts:235-240), `series`, testata, e `lines[]` con `id: line.id || undefined` (:4680). NESSUNA chiave di richiesta, nessun nonce, nessun header Idempotency-Key (verificato: grep su src/app/core/interceptors/ — solo error.interceptor e loading.interceptor; nessun retry RxJS). Timeout client 15000ms (document.service.ts:34, 213-227).

**Create vs update** — LETTO. Unico discriminante: la presenza di `dto.id`. goods-receipt-workflow.service.ts:461-465 `if (dto.id) existing = await tx.document.findFirst(...)`; :601-615 `if (existing) update else create`. Lato client `persistedDocumentId()` = `editDocumentId() ?? loadedDocument()?.id ?? null` (:4596-4597): su documento NUOVO entrambi sono null finché non arriva la risposta, perché `loadedDocument.set(doc)` e la navigazione a /edit avvengono SOLO nel ramo `next` (:4498, :4508-4511). Risposta persa = il client non impara mai l'id → il reinvio è di nuovo una CREAZIONE.

**A · prima creazione** — ⛔ DUPLICA TUTTO. • Secondo record documentale: SÌ — `tx.document.create` (:605-613), scritto con `status: DocumentStatus.confirmed` e `confirmedAt: new Date()` (:559-560) — riporto questo come COMPORTAMENTO TECNICO OSSERVATO su questa rotta per questi tre tipi, non come stato funzionale. • Secondo numero consumato: SÌ — `number` è null (existing null), `requestedNumber` è null, quindi `lockDocumentCounter` + `resolveDocumentNumber` (:538-551) assegnano il PRIMO LIBERO, che dopo il commit del primo tentativo è il successivo: il duplicato occupa un secondo numero reale della serie e nessun vincolo scatta (`documents_number_unique` è su (tenant, tipo, serie, numero): numeri diversi non collidono — migrations/20260811090000_numero_unico_per_numeratore/migration.sql:29-43). • Righe duplicate: SÌ — nessun id riga inviato e `existingLineIds` vuoto, quindi ogni riga passa da `tx.documentLine.create` (:713-717). • Movimenti fisici duplicati: SÌ — il sync cerca i movimenti con `sourceDocumentId: params.documentId` (document-goods-receipt-sync.util.ts:148-154); il documentId è nuovo → `byLineId` vuoto → ramo `if (!movement)` per ogni riga: `applyInventoryDelta(+quantity)` e `stockMovement.create` (:180-203). La giacenza RADDOPPIA (`onHand`/`available` con `increment` — inventory-level-delta.util.ts:34-37). Il vincolo `@@unique([sourceDocumentType, sourceLineId])` (schema.prisma:930) NON aiuta: le righe nuove hanno id nuovi, quindi la coppia è diversa. • Impegni duplicati: nessuno — questo percorso non scrive mai `committed` né crea prenotazioni (verificato: nessuna occorrenza di committed/reserv in goods-receipt-workflow.service.ts; applyInventoryDelta muove solo onHand e available). • Lotti duplicati: non applicabile in questo caso base (nessun lotCode); vedi la voce dedicata. • Aggiornamenti anagrafici ripetuti: RIPETUTI MA INNOCUI — `applySupplierPriceUpdates` scrive `purchasePriceMinor` con `updateMany` di un valore (document-supplier-price.util.ts:141-146) e `SupplierVariantLink.lastPurchasePriceMinor` con `upsert` di un valore (:154-168); `applyArticlePriceUpdates` scrive `sellingPriceMinor`/`shopifyPriceMinor` con `updateMany` di un valore (document-article-price.util.ts:135). Sono assegnazioni, non incrementi: riscrivono lo stesso valore. Nessuno storico prezzi esiste nello schema. • Effetti economici / registri / riepiloghi: SÌ — due documenti confermati con lo stesso imponibile/IVA/totale in elenco; nessun riepilogo sommante è stato trovato sull'elenco documenti (documents.service.ts non aggrega totali), ma i due compaiono ENTRAMBI in `listLinkableGoodsReceipts` (goods-receipt-workflow.service.ts:889-917) se marcati «In attesa fattura», quindi la stessa merce è fatturabile due volte; e la valorizzazione di magazzino raddoppia perché onHand è raddoppiato. Il push canale ripropone la giacenza gonfiata (:832 → pushInventory → channel-sync.facade.ts:125-137, desired-state).

**B · modifica** — ✅ RICONCILIATO. Con `dto.id` presente e tutte le righe già dotate di id (il client li ha adottati in adoptSavedLineState :4801), il reinvio identico non produce nulla di nuovo. • Secondo record documentale: NO — ramo `tx.document.update` (:602). • Secondo numero: NO — `number = existing.number` e il blocco di assegnazione è saltato (:527-529). • Righe duplicate: NO — `incomingIds` contiene gli id inviati che esistono già, quindi `documentLine.update` (:713-714); la `deleteMany ... id notIn incomingIds` (:678-680) non tocca nulla. • Movimenti duplicati: NO — il sync ritrova il movimento per `sourceLineId` (sync util :176), `quantityDelta = 0` (:216) → nessun applyInventoryDelta, e `needsUpdate` è falso perché sku/reason/costi/data coincidono (:246-257): il movimento non viene nemmeno riscritto. • Impegni: nessuno. • Lotti: NO — `createdLines` è vuoto (`sync.createdLineIds` vuoto), quindi il blocco lotti/seriali di :772-777 non parte. • Anagrafica: riscritti gli stessi valori (assegnazioni, vedi sopra). • Registri/riepiloghi: NO — `sync.deltas` è vuoto quindi nessuna seconda DocumentRevision (:804-806), e `totalsChanged` è falso quindi nessun `totalsCheckPending` (:811-824); `pushInventory` riceve `syncTargets` vuoto.

**Causa tecnica** — Non esiste alcun meccanismo di protezione su questo comando nel caso A: il solo discriminante è `dto.id`, che per costruzione il client non possiede quando la risposta si perde. Le guardie presenti non coprono questo caso — `if (this.saving()) return` (:3446, :4472) impedisce SOLO il doppio clic durante il volo, non il reinvio dopo il timeout (il ramo error riporta lo stato a 'error' e la maschera resta usabile, :4516-4526); l'advisory lock `lockDocumentCounter` (document-numbering.util.ts:366-377) serializza gli operatori sul contatore ma non riconosce un reinvio: al secondo giro consegna il numero successivo, che è esattamente ciò che rende il duplicato invisibile; il vincolo unico sul numero impedisce DUE DOCUMENTI COLLO STESSO NUMERO, non un secondo documento con un numero diverso; la transazione (:459) garantisce l'atomicità del singolo tentativo, non l'unicità fra tentativi. Nel caso B la protezione è reale ed è la disciplina «un movimento per riga»: la chiave (sourceDocumentType, sourceLineId) e l'upsert per id riga rendono il salvataggio una riconciliazione per differenza.

**Evidenza** — api/src/documents/goods-receipt-workflow.service.ts:459-465, 527-552, 559-560, 601-615, 673-680, 713-717, 759-768, 832; api/src/documents/document-goods-receipt-sync.util.ts:148-159, 176-207, 216-236, 246-257; api/src/inventory/inventory-level-delta.util.ts:34-37; api/prisma/schema.prisma:930; api/prisma/migrations/20260811090000_numero_unico_per_numeratore/migration.sql:29-43; src/app/features/documents/goods-receipt-form.component.ts:3445-3462, 4471-4527, 4596-4597, 4628-4715, 4773-4808; src/app/domain/documents/services/document.service.ts:34, 213-227

#### 2. `POST /documents/goods-receipt/save → applyInventoryLotsFromDocumentLines`

**Comando** — «Salvo un arrivo merce indicando il lotto e la scadenza sulle righe». Salvo, la risposta si perde, risalvo.

**Il client manda** — LETTO. `lotCode: line.lotCode.trim() || undefined` e `lotExpiryDate` (goods-receipt-form.component.ts:4707-4710). Nessun identificativo di operazione: il lotto viaggia come testo sulla riga.

**Create vs update** — Il lotto non ha alcun concetto di create/update: viene applicato SOLO alle righe che hanno prodotto un movimento NUOVO — `const createdLines = savedLines.filter((line) => sync.createdLineIds.includes(line.id))` e poi `applyInventoryLotsFromDocumentLines` (goods-receipt-workflow.service.ts:772-775). È l'unica cosa che lo trattiene.

**A · prima creazione** — ⛔ ACCUMULA, ed è l'effetto più difficile da recuperare. Il secondo documento produce righe nuove → tutti i movimenti sono nuovi → tutte le righe finiscono in `createdLines` → per ogni riga con lotCode l'upsert esegue il ramo `update: { quantity: { increment: line.quantity } }` (inventory-lot.util.ts:22-43, in particolare :39-40). La chiave del lotto è (tenantId, variantId, locationId, lotCode) — schema.prisma:2557 — e NON contiene né il documento né la riga: due carichi distinti dello stesso lotto sono indistinguibili da un carico fatto due volte, per costruzione. Sopra questo si somma tutto ciò che è descritto nella voce «caso base»: secondo documento, secondo numero, righe, movimenti, giacenza raddoppiata. Impegni: nessuno. Anagrafica: riscritture idempotenti.

**B · modifica** — ⚠️ RICONCILIATO SOLO NEL REINVIO PURO. Reinvio identico di una modifica con tutte le righe già dotate di id: `createdLineIds` è vuoto, il blocco :772-777 non parte, il lotto non si muove. MA se la modifica AGGIUNGEVA una riga con lotto: il primo tentativo incrementa il lotto di q; al reinvio la riga creata al primo giro viene eliminata dalla `deleteMany` di :678-680, il suo movimento diventa orfano e viene cancellato con `applyInventoryDelta(-quantity)` (sync util :281-292) — ma NESSUNO decrementa il lotto: la giacenza torna giusta, il lotto no. La riga ricreata rientra in `createdLines` e incrementa il lotto una seconda volta di q. Risultato: `InventoryLot.quantity` = 2q contro `InventoryLevel.onHand` = q. Verificato che non esiste alcun rimedio: `applyInventoryLotsFromDocumentLines` è l'UNICA scrittura su `inventoryLot` in tutto il backend fuori dal backup (grep su api/src: solo goods-receipt-workflow.service.ts:775 e inventory-lot.util.ts:22; le altre occorrenze sono tenant-backup export/import). Nessun percorso di annullamento o eliminazione documento decrementa i lotti.

**Causa tecnica** — Il solo trattenimento è `createdLineIds`, che è una guardia PER RIGA e vale unicamente finché l'id della riga sopravvive: impedisce il doppio incremento quando la stessa riga si risalva, e non impedisce nulla quando la riga è nuova — che è esattamente ciò che accade nel caso A (righe nuove per definizione) e nel caso B quando la modifica aggiunge una riga. Manca al lotto la chiave verso la riga che lo ha mosso, cioè lo stesso legame che sui movimenti è `sourceLineId`; senza quel legame l'operazione è additiva e non ha alcun modo di riconoscersi.

**Evidenza** — api/src/inventory/inventory-lot.util.ts:15-44 (increment a :39-40); api/prisma/schema.prisma:2541-2559 (@@unique a :2557, nessuna colonna di riga o documento); api/src/documents/goods-receipt-workflow.service.ts:678-680, 772-777; api/src/documents/document-goods-receipt-sync.util.ts:281-292; src/app/features/documents/goods-receipt-form.component.ts:4707-4710

#### 3. `POST /documents/goods-receipt/save — stessa rotta, stesso servizio; il tipo lo decide il corpo della richiesta (goods-receipt-workflow.service.ts:309-313 accetta i tre DOCUMENT_STOCK_LOAD_TYPES)`

**Comando** — «Registro un carico manuale» o «Carico iniziale» dalla stessa maschera (tipo manual_load / initial_load). Salvo, la risposta si perde, risalvo.

**Il client manda** — LETTO. Stesso corpo, `type` = manual_load o initial_load. La maschera è la stessa e per questi tipi non richiede fornitore (goods-receipt-form.component.ts:928, 945, 1007, 5064: `supplierRequired = type !== ManualLoad && type !== InitialLoad`); lato server `SUPPLIER_REQUIRED_TYPES = INVOICE_LINKABLE_RECEIPT_TYPES` = solo goods_receipt (goods-receipt-workflow.service.ts:73, 317-321).

**Create vs update** — Identico: solo `dto.id`, e il client non lo possiede se la risposta si perde.

**A · prima creazione** — ⛔ DUPLICA TUTTO, e con MENO reti del goods_receipt. Vale integralmente la voce «caso base» (secondo documento confermato, secondo numero della serie, righe nuove, movimenti nuovi con giacenza raddoppiata, nessun impegno, anagrafica riscritta con assegnazioni, elenco documenti con due voci). In più cadono due delle protezioni collaterali censite: (1) la guardia dell'ordine fornitore non può scattare, perché senza fornitore non c'è ordine da includere — `dto.supplierOrderId` assente ⇒ il blocco :498-511 non viene nemmeno valutato; (2) `applySupplierPriceUpdates` con `supplierId` null non scrive `SupplierVariantLink` (document-supplier-price.util.ts:154), quindi nemmeno l'effetto anagrafico che segnalerebbe qualcosa. Restano solo le reti che dipendono dalla merce: SKU/barcode del nuovo articolo e seriali.

**B · modifica** — ✅ RICONCILIATO come nel caso base: `dto.id` presente, righe con id, movimenti ritrovati per `sourceLineId` con delta 0, `createdLineIds` vuoto ⇒ nessun lotto, nessun seriale, nessuna revisione. Le stesse riserve del caso base valgono per le righe aggiunte in modifica (lotto che si somma, articolo nuovo senza SKU che si duplica).

**Causa tecnica** — Nessun meccanismo protegge il caso A. È la stessa lacuna del caso base, con la superficie residua più ampia perché due delle protezioni accidentali censite altrove (stato dell'ordine fornitore, scrittura del prezzo fornitore) sono inapplicabili per assenza di fornitore. Notato senza dedurne un workflow: la rotta è protetta dal permesso `goods_receipt` ma il tipo arriva dal corpo, e per questo il servizio riverifica il permesso sul tipo effettivo (:164, 248-255) — è un controllo di autorizzazione, non ha alcun effetto sulla duplicazione.

**Evidenza** — api/src/documents/document-stock.constants.ts:4-8; api/src/documents/goods-receipt-workflow.service.ts:73, 164, 248-255, 309-313, 317-321, 498, 779-785; api/src/documents/document-supplier-price.util.ts:154; src/app/features/documents/goods-receipt-form.component.ts:928, 945, 1007, 5064

#### 4. `POST /documents/goods-receipt/save — stesso endpoint, secondo punto di ingresso lato client (confirmExitSaveDocument)`

**Comando** — «Chiudo la maschera senza aver salvato, il gestionale mi chiede se salvare, scelgo Salva e chiudi». La risposta si perde: resto nella maschera con un errore, e ripremo Salva (o riprovo a chiudere).

**Il client manda** — LETTO. Esattamente lo stesso corpo del pulsante Salva: `saveDocument$()` senza opzioni (goods-receipt-form.component.ts:3920), quindi `updateArticleCost: undefined` — differenza rilevante sull'anagrafica ma non sull'idempotenza. Nessuna chiave di richiesta neanche qui.

**Create vs update** — Identico agli altri: solo `dto.id` da `persistedDocumentId()`. Nota: questo percorso NON esegue `preserveEditSession` né la navigazione a /edit del ramo `next` (confronta :3925-3931 con :4495-4515): imposta solo `loadedDocument.set(doc)` e risolve l'uscita. Su documento nuovo salvato da qui l'id resta quindi solo in `loadedDocument`.

**A · prima creazione** — ⛔ IDENTICO alla voce «caso base»: secondo documento confermato, secondo numero, righe, movimenti, giacenza raddoppiata, impegni nessuno, lotti come da voce lotti, anagrafica riscritta con assegnazioni, due voci in elenco e nell'elenco arrivi collegabili a fattura. In più: `confirmExitSaveDocument` NON ha la guardia di rientro `if (this.saving()) return` che hanno `requestSaveDocument` (:3446) e `executeExplicitSave` (:4472). Il doppio invio contemporaneo da QUESTO percorso è impedito solo indirettamente, perché `canDeactivate` rifiuta l'uscita finché `saving()` è vero (:3892-3894) e quindi il dialogo non si riapre. È una protezione per via traversa e non copre comunque il reinvio dopo il timeout: il ramo error riporta lo stato a 'error' e risolve l'uscita con `false` (:3932-3938), lasciando l'operatore nella maschera con il documento già scritto sul server e nessun segno che lo dica.

**B · modifica** — ✅ RICONCILIATO come la voce «riapro e risalvo»: stesso corpo, stesso `dto.id`, stesse riserve sulle righe aggiunte in modifica (lotto, revisione spuria, articolo senza codici, seriali).

**Causa tecnica** — Nessun meccanismo protettivo proprio. Va censito a parte perché è un SECONDO punto di ingresso allo stesso comando con guardie client diverse: la protezione contro il doppio clic è qui a carico di `canDeactivate`, non del metodo di salvataggio. Anche fosse completa, resterebbe una guardia sul GESTO contemporaneo — nessuna guardia lato client può riconoscere un reinvio dopo che la risposta è andata perduta, perché il client non sa se il server ha committato.

**Evidenza** — src/app/features/documents/goods-receipt-form.component.ts:3885-3904 (canDeactivate, saving() a 3892), 3906-3940 (nessuna guardia saving() all'ingresso; error a 3932-3938), 3445-3462, 4471-4479; api/src/documents/documents.controller.ts:128-149

#### 5. `POST /documents → DocumentsService.create (documents.service.ts:972) → createDocumentRecord (:1006) → tx.document.create (:1064) → confirmDocumentTx (:1142), TUTTO dentro la stessa transazione aperta a :1049`

**Comando** — «Salva documento» su una maschera aperta in CREAZIONE. Sono nove tipi, con quattro maschere diverse: Proforma, Fattura, Fattura accompagnatoria, Nota di credito (sales-document-form.component.ts:2263); Preventivo, DDT vendita, Scarico manuale (customer-order-form.component.ts:4748); Rettifica (stock-operation-form.component.ts:1629); Trasferimento (transfer-form.component.ts:1637). L'API ne accetta altri tre che nessuna maschera manda qui: supplier_order, supplier_invoice, inventory — quest'ultimo lo crea il dominio (inventory-count.service.ts:324).

**Il client manda** — Testata + righe. NESSUN id documento (non esiste ancora). Righe SENZA id: il payload manda `id: line.id || undefined` e in creazione line.id è vuoto (sales-document-form.component.ts:2225, customer-order-form.component.ts:4614, stock-operation-form.component.ts:1611, transfer-form.component.ts:1623). `number` viaggia SOLO se l'operatore l'ha digitato in testata — `this.numbering.imposedNumber()` (sales-document-form.component.ts:2172); se è la proposta del numeratore il campo si OMETTE, e il numero lo assegna il server. Nessun header Idempotency-Key: verificato con grep su api/src e src, zero occorrenze. Nessun campo del corpo identifica il COMANDO — solo il suo contenuto.

**Create vs update** — Lo decide il CLIENT scegliendo il verbo: `editId ? updateDocument(editId, …) : createDocument(body)` (sales-document-form.component.ts:2262-2263; stessa forma negli altri tre form). Il SERVER non distingue nulla: POST /documents esegue sempre `tx.document.create` (:1064) — letto, non esiste in create() né in createDocumentRecord() alcuna ricerca di un documento equivalente già presente, alcuna chiave naturale, alcun confronto sul contenuto. L'unica cosa che il database può rifiutare è il NUMERO (indice `documents_number_unique`).

**A · prima creazione** — DUPLICA. Scenario: il POST commit-ta, la risposta si perde (timeout 15s — document.service.ts:34 — o tab chiusa), l'operatore ripreme Salva su una maschera che è ancora in stato «creazione» perché la navigazione verso l'edit avviene solo nel `next` (sales-document-form.component.ts:2283).

• SECONDO RECORD DOCUMENTALE: SÌ. `tx.document.create` (:1064) senza alcuna chiave di deduplica. Sul modello Document non esiste `@@unique` (schema.prisma:2161-2170: solo indici non unici); l'unica unicità è l'indice parziale `documents_number_unique` su (tenant, tipo-numeratore, serie, numero) WHERE number IS NOT NULL (migration 20260815210000_credit_note_numerazione_condivisa/migration.sql:31-48).

• SECONDO NUMERO CONSUMATO: SÌ, ed è il caso normale. Col numero OMESSO (proposta non digitata) `confirmDocumentTx` entra nel ramo `if (number == null)` (:2324) e chiama `nextNumber` (:2334), che prende l'advisory lock (document-numbering.util.ts:366-377) e calcola il primo libero leggendo il MASSIMO dai documenti esistenti (lastAssignedNumber :100-158) — non da un contatore prenotato. Il secondo documento prende quindi il numero SUCCESSIVO: due documenti, due numeri diversi, nessuna collisione, nessun errore, nessun segnale all'operatore. È esattamente il comportamento già accertato su store-sales.
⚠️ ECCEZIONE, e dipende da un gesto dell'operatore: se il numero è stato DIGITATO, il secondo create scrive lo stesso numero a :1064-1070, l'indice unico lo rifiuta, `throwNumberConflict` (:1195) trasforma il P2002 in 409 e la transazione si ribalta — nessun secondo documento, nessun effetto. Il freno esiste solo per chi ha imposto il numero a mano.

• RIGHE DUPLICATE: SÌ. `lines: { create: … }` a :1121: il secondo documento nasce con le proprie righe e id nuovi generati dal database (toLineCreateData scarta esplicitamente l'id in ingresso, :3621-3626).

• MOVIMENTI FISICI DUPLICATI: SÌ, per i tipi che movimentano, e per la stessa ragione dei store-sales — i movimenti sono chiavati su `sourceLineId` e le righe nuove hanno id nuovi:
– DDT vendita e Fattura accompagnatoria senza DDT agganciato → `syncUnloadLineMovements` (:2362): le righe nuove non stanno in `byLineId`, quindi crea un movimento nuovo e applica `applyInventoryDelta(-qty)` (document-stock-unload-sync.util.ts:191-217). Giacenza scesa DUE volte.
– Scarico manuale → `applyDocumentStockManualUnloads` (:2384): sottrae la giacenza DIRETTAMENTE e senza creare alcun movimento (deroga documentata, document-stock-manual-unload.util.ts:23-45). Giacenza scesa due volte e nessun movimento che lo racconti.
– Rettifica → `syncAdjustmentLineMovements` (:2408). Trasferimento → `syncTransferLineMovements` (:2441). Stessa meccanica per riga, stesso esito.
– Preventivo, Proforma, Fattura, Nota di credito, Registrazione fattura fornitore, Inventario: nessun effetto magazzino su questo percorso. ⚠️ Per la Nota di credito è un fatto MISURATO, non una deduzione: `loadsStock` si persiste sulla riga ma in confirmDocumentTx non esiste alcun ramo per credit_note (grep `credit_note` su api/src/documents: solo elenchi di tipo, etichette, prefissi, numerazione — nessun effetto stock).

• IMPEGNI DUPLICATI: NO, e qui il secondo create viene proprio RIFIUTATO — ma solo in un sotto-caso. Se il corpo porta `includedSalesOrderIds` (DDT vendita o Fattura accompagnatoria salvati da «Concludi ordine»), `syncIncludedSalesOrdersTx` (:1311) trova l'ordine già agganciato al PRIMO documento e solleva ConflictException (:1400-1409): `SalesOrder.documentId` è una FK singola, un ordine non può puntare a due documenti. Gira a :1136, cioè PRIMA di confirmDocumentTx (:1142), quindi la transazione si ribalta senza nemmeno bruciare un numero. ⛔ Ma la protezione vale SOLO quando l'elenco ordini c'è: il client lo manda solo se non è vuoto (sales-document-form.component.ts:2155-2157), e un DDT senza ordini agganciati si duplica liberamente. In più `consumeReservationTx` è comunque idempotente per conto suo (guardia `status: active`, stock-reservation.service.ts:157-163).

• LOTTI DUPLICATI: NO — non applicabile. `applyInventoryLotsFromDocumentLines` ha UN solo chiamante in tutta l'API, goods-receipt-workflow.service.ts:775 (grep `inventory-lot.util` su api/src): il percorso generico non scrive mai InventoryLot. L'additività di inventory-lot.util.ts:39 non tocca questa famiglia.

• AGGIORNAMENTI ANAGRAFICI RIPETUTI: NO. `applyArticlePriceUpdates` e `applySupplierPriceUpdates` sono importati solo da goods-receipt-workflow.service.ts:45-46; documents.service.ts importa esclusivamente `findSupplierPriceDiffs` (:119), che LEGGE. L'unica scrittura anagrafica del percorso è `priceModePreference.remember` (:1174-1175), che riscrive lo stesso valore: idempotente.

• EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: il secondo documento compare nel Registro documenti come riga a sé, con numero proprio, e pesa nei suoi totali. Il Registro Corrispettivi NON lo vede: legge solo store_sale e store_return (corrispettivi-query.util.ts:333 e :393) — questa famiglia non ci entra. Nessun DocumentRevision viene scritto in creazione (`recordRevision` compare solo nei rami di update e cancel, :2201/:2676/:2714/:2763/:2822).

• FRENO ACCESSORIO SUI SERIALI, per i soli articoli tracciati: il secondo create fallisce con 422 — in scarico perché il seriale non è più `in_stock` (assertSerialNumbersForUnloadLines, inventory-serial.util.ts:145-184), in carico perché è già presente (assertSerialNumbersForDocumentLines, :88-140). Rollback pieno. Non è una protezione del comando: è un effetto collaterale del tracciamento, e sugli articoli non tracciati non c'è.

**B · modifica** — NON APPLICABILE a questo comando: il POST non porta un id e non può colpire un record esistente — crea sempre. La modifica è il comando 2 (PATCH). Va però detto che i due casi si toccano: finché la risposta del POST non arriva, il client NON conosce l'id, quindi il reinvio non può che essere un secondo POST — non c'è modo, in questo percorso, che un timeout in creazione si trasformi da sé in una modifica.

**Causa tecnica** — ⛔ RISPOSTA ALLA DOMANDA CENTRALE. La guardia `doc.status !== DocumentStatus.draft` (documents.service.ts:2302) impedisce UNA cosa sola: che gli effetti di conferma vengano rieseguiti SULLO STESSO RECORD già confermato. Protegge il record, non il comando.

Ciò che lascia possibile è esattamente lo scenario chiesto, e lo lascia possibile per costruzione: il reinvio del POST non torna sul documento numero 1 — ne crea uno NUOVO (:1064) che è in stato `draft` appena scritto, e che quindi ATTRAVERSA la guardia senza nemmeno sfiorarla, perché la guardia è vera per lui. Da lì il secondo record «segue la sua strada»: prende il lock del contatore, riceve il proprio numero (:2334), esegue i movimenti del suo tipo (:2362 / :2384 / :2408 / :2441), conclude gli ordini agganciati (:2430) e finisce `confirmed` (:2464). Il tutto nella STESSA transazione della creazione (:1049 → :1142): non esiste una finestra in cui il documento resti bozza e qualcuno possa accorgersi che ne esiste già uno identico.

⚠️ E c'è un fatto che rende la guardia ancora meno rilevante di quanto sembri: **non è raggiungibile via HTTP**. Non esiste alcuna rotta di conferma — documents.controller.ts letto per intero (477 righe) non ne ha, e `grep "@Post('.*confirm"` su api/src non trova nulla. `DocumentsService.confirm` (:2244) ha un solo chiamante in tutta l'applicazione: inventory-count.service.ts:346. Quindi la guardia a :2302 non arbitra nessun comando dell'operatore su questo percorso.

Le uniche tre cose che frenano davvero un reinvio, e nessuna delle tre è una protezione del comando: (1) l'indice unico sul numero, ma solo se l'operatore ha DIGITATO il numero; (2) la FK singola `SalesOrder.documentId`, ma solo se il corpo porta ordini agganciati; (3) l'unicità del seriale, ma solo per articoli tracciati. Nel caso ordinario — numero proposto, nessun ordine agganciato, articoli non tracciati — non frena niente.

Lato client la sola difesa è `if (this.formReadOnly() || this.saving()) return` (sales-document-form.component.ts:2115, stock-operation-form.component.ts:1463, transfer-form.component.ts:1481, customer-order-form.component.ts:4233): copre il doppio clic mentre la richiesta è in volo, NON sopravvive al timeout di 15s, dopo il quale lo stato torna `error` e il pulsante è di nuovo premibile.

**Evidenza** — documents.controller.ts:425-433 · documents.service.ts:972, 980, 985, 990, 1006, 1049, 1058, 1064, 1121, 1136, 1142, 1174, 1195, 2302, 2324, 2334, 2362, 2384, 2408, 2430, 2441, 2464, 3621 · document-numbering.util.ts:100-158, 338-341, 366-377 · document-stock-unload-sync.util.ts:191-217 · document-stock-manual-unload.util.ts:23-45 · inventory-serial.util.ts:88-140, 145-184 · stock-reservation.service.ts:151-163 · corrispettivi-query.util.ts:333, 393 · prisma/schema.prisma:2161-2170 · prisma/migrations/20260815210000_credit_note_numerazione_condivisa/migration.sql:31-48 · src/app/domain/documents/services/document.service.ts:34, 196-200 · src/app/features/documents/sales-document-form.component.ts:2115, 2172, 2225, 2262-2263, 2283 · src/app/features/sales-orders/customer-order-form.component.ts:4233, 4614, 4748

#### 6. `POST /supplier-orders → SupplierOrdersService.create · PATCH /supplier-orders/:id → SupplierOrdersService.update`

**Comando** — Preme «Salva documento» sulla maschera Ordine fornitore (/app/orders/new oppure /app/orders/:id/edit).

**Il client manda** — LETTO. supplier-order-form.component.ts:2168-2187 compone un solo `body` (supplierId, series, number, orderDate, expectedAt, destinationLocationId, supplierReference, documentDiscountPercent, costEntryMode, currency, lines[]). Le righe (2134-2166) NON portano un id: SupplierOrderLine non ha una colonna id nel payload — l'unico indice è la posizione. `series` = numbering.chosenSeries(), `number` = numbering.imposedNumber() (document-numbering.store.ts:235-240: `undefined` finché l'operatore non digita un numero — su documento nuovo è la proposta, e la proposta NON viaggia). Nessun header Idempotency-Key, nessun campo di correlazione. Timeout client 15 s (supplier-order.service.ts:22, applicato a createOrder :70-74 e updateOrder :76-80).

**Create vs update** — LETTO. supplier-order-form.component.ts:2189-2197: `const editId = this.editOrderId()` → `editId ? updateOrder(editId, body) : createOrder(body)`. `editOrderId` è un computed sul PARAMETRO DI ROTTA (:297 `this.paramMap().get('id')`), non su una risposta del server. Su /new resta null finché il router non naviga, e naviga solo nel ramo `next` (:2236). DEDOTTO: se la risposta si perde, il client resta convinto di dover CREARE.

**A · prima creazione** — VULNERABILE, nessuna guardia server. LETTO: (1) SECONDO RECORD DOCUMENTALE — sì: `tx.supplierOrder.create` (supplier-orders.service.ts:187) non ha alcun predicato di esistenza; una seconda POST identica produce una seconda riga `supplier_orders`. (2) SECONDO NUMERO CONSUMATO — sì: con `number` assente il server chiama `nextDocumentNumber` (:174-184), che è «il primo numero libero maggiore del massimo» (document-numbering.util.ts:188-241), non un contatore riletto: al reinvio restituisce il numero SUCCESSIVO, quindi l'indice unico parziale `supplier_orders_number_unique` su (tenant_id, series, number) (migration 20260728110000_numbering_series_prefix_number:41-44) non scatta MAI, e nemmeno `@@unique([tenantId, reference])` (schema.prisma:1104) perché il reference è composto dallo stesso numero nuovo (:185). L'advisory lock `lockDocumentCounter` (:171) serializza operatori concorrenti, NON riconosce un reinvio. (3) RIGHE DUPLICATE — sì: l'intero set viene ricreato dentro la create annidata (:209-211). (4) MOVIMENTI FISICI — nessuno, mai: l'elenco completo delle scritture del servizio è `supplierOrder.create/update/delete` + `supplierOrderLine.deleteMany` (verificato enumerando ogni `tx.`/`prisma.` del file). (5) IMPEGNI — nessuno: nessun riferimento a StockReservation/committed in tutto api/src/supplier-orders (grep senza risultati). (6) QUANTITÀ IN ARRIVO (incoming) — NON esistono: `applyIncomingDelta` (api/src/inventory/inventory-incoming.util.ts:8-48) è additiva (`incoming: { increment: delta }`, :28) ma NON HA UN SOLO CHIAMANTE DI PRODUZIONE — l'unico riferimento nel repo è il suo spec (inventory-incoming.util.spec.ts:3,16,38). L'ordine fornitore non muove `incoming`, coerentemente col commento di classe (:89-94). (7) LOTTI — nessuno. (8) ANAGRAFICA — nessun aggiornamento: `computeLines` legge soltanto le varianti (:606) e i codici IVA; il costo NON viene scritto sull'articolo (quello è dell'Arrivo merce, non di qui). (9) EFFETTI ECONOMICI / RIEPILOGHI — sì, per conteggio: dashboard.service.ts:84-89 conta gli ordini `confirmed` e mostrerebbe 2 dove ce n'è 1; supplier-orders.service.ts:489-496 (elenco e totale) e listAllForExport (:458-477) restituiscono entrambe le righe; suppliers.service.ts:277 conta gli ordini per fornitore. Nessun registro fiscale è coinvolto (l'ordine fornitore non produce documenti in `documents`).

**B · modifica** — RICONCILIATO per contenuto, NON per differenza. LETTO: (1) nessun secondo record — `tx.supplierOrder.update({ where: { id } })` (:287) agisce sulla riga esistente. (2) nessun numero nuovo — `numberChanged` è `dto.number !== undefined && dto.number !== order.number` (:276): reinviando lo stesso body è false, `nextNumber = order.number` (:278) e il ramo di rinumerazione riscrive gli stessi valori (:296-306). (3) RIGHE — il numero di righe resta stabile, ma NON perché siano riconciliate: `tx.supplierOrderLine.deleteMany({ where: { orderId: id } })` (:286) cancella TUTTE le righe e le ricrea da zero (:328-330). Contenuto identico, ma id di riga NUOVI a ogni salvataggio; `DocumentLine.supplierOrderLineId` (schema.prisma:2232, FK :2248 con `onDelete: SetNull`) perde il legame verso l'arrivo merce — è una perdita, non una duplicazione, e va registrata come tale. (4-8) nessun movimento, impegno, lotto o scrittura anagrafica, come nel caso A. (9) nessun raddoppio nei riepiloghi. Guardia di stato: `order.status !== confirmed` → 409 (:245-249), che però riguarda gli ordini conclusi/annullati, non i reinvii.

**Causa tecnica** — I meccanismi presenti IMPEDISCONO: (a) due righe con lo STESSO numero (indice unico parziale su tenant+serie+numero, e @@unique su tenant+reference); (b) due operatori concorrenti che leggono lo stesso massimo (advisory lock, :171); (c) in modifica, la duplicazione di testata e righe (l'id di rotta instrada su PATCH e le righe si azzerano-e-riscrivono). NON IMPEDISCONO: la nascita di un SECONDO ordine completo, perché il numero del reinvio è diverso per costruzione — «primo libero maggiore di m» restituisce m+2 la seconda volta — e il vincolo unico giudica una collisione, non un doppione. L'unico caso in cui il vincolo scatta è il numero IMPOSTO dall'operatore: lì la seconda POST dà 409 e `throwNumberConflict` (:558-599) propone il primo libero, che l'operatore può accettare — ottenendo comunque il duplicato, con un numero diverso.

**Evidenza** — api/src/supplier-orders/supplier-orders.service.ts:126-235 (create), :171-185 (numerazione), :187-214 (create testata+righe), :238-347 (update), :286 (deleteMany righe), :558-599 (409 numero); api/src/documents/document-numbering.util.ts:188-241 (primo libero); api/prisma/migrations/20260728110000_numbering_series_prefix_number/migration.sql:41-44; api/prisma/schema.prisma:1104, :2232, :2248; api/src/inventory/inventory-incoming.util.ts:8-48 (senza chiamanti); api/src/dashboard/dashboard.service.ts:84-89; src/app/features/orders/supplier-order-form.component.ts:297, :2110-2117, :2168-2197, :2236; src/app/domain/supplier-orders/services/supplier-order.service.ts:22, :70-80; src/app/domain/documents/state/document-numbering.store.ts:235-240

#### 7. `POST /suppliers → SuppliersService.create (SupplierOrdersService.createSupplier delega, supplier-orders.service.ts:110-112)`

**Comando** — Crea un fornitore dal pannello «+ Nuovo fornitore» dentro la maschera Ordine fornitore, senza uscire dal documento.

**Il client manda** — LETTO. `mapSupplierFormToInput(raw)` (src/app/domain/suppliers/utils/supplier-form.util.ts:43-71): nome, partita IVA, codice fiscale, recapiti, condizioni, `code` opzionale — e `code` parte VUOTO, perché nessuna maschera chiama `previewNextCode` (grep su tutto src: zero chiamanti). Nessun identificatore di richiesta.

**Create vs update** — Non distingue: il pannello crea sempre. L'endpoint di modifica è un altro (PATCH /suppliers/:id), non raggiungibile da qui.

**A · prima creazione** — VULNERABILE. LETTO: con `code` assente, la transazione alloca il codice come «massimo esistente + 1» (`allocateNextSupplierCodeTx`, suppliers.service.ts:577-586, che legge tutti i codici e delega a `nextNumericSupplierCode`), poi crea una `Party` e un `Supplier` (:170-177). Al reinvio il codice calcolato è DIVERSO, quindi `@@unique([tenantId, code])` (schema.prisma:1022) non scatta: nasce un secondo soggetto anagrafico completo, con lo stesso nome e la stessa partita IVA. Nessun vincolo su nome o partita IVA nello schema. Se la spunta «anche cliente» è attiva, `setCustomerRoleForSupplier` (:181-183) viene eseguita anche per il secondo. Non ci sono documenti, numeri, righe, movimenti, impegni o lotti in gioco: la duplicazione è puramente anagrafica — ed è la peggiore da ripulire, perché i documenti che nel frattempo la puntano restano legati al doppione. Guardia client: `_savingSupplier` (supplier-order-form.component.ts:2044, 2049) blocca il doppio clic in volo, non il reinvio dopo un errore.

**B · modifica** — Non applicabile da questa maschera.

**Causa tecnica** — Il vincolo unico sul codice impedirebbe due fornitori con lo STESSO codice; ma il codice non viene mai reinviato dal client — se lo calcola il server, e al secondo giro ne calcola uno nuovo. Il vincolo giudica una collisione che il meccanismo di allocazione rende impossibile.

**Evidenza** — api/src/supplier-orders/suppliers.service.ts:148-185, :577-586; api/prisma/schema.prisma:1022; src/app/features/orders/supplier-order-form.component.ts:2043-2073; src/app/domain/suppliers/utils/supplier-form.util.ts:43-71

#### 8. `POST /sales-orders/manual/save → ManualSalesOrdersService.save (rotta unica per creazione e modifica)`

**Comando** — Preme «Salva documento» sulla maschera Ordine cliente (/app/sales/new oppure /app/sales/:id/edit).

**Il client manda** — LETTO. `buildSavePayload()` (customer-order-form.component.ts:4483-4535): `id: this.editOrderId() ?? undefined`, customerId, locationId, documentDate, pricesIncludeVat, series, number, externalRef, expectedDeliveryDate, status, notes, paymentTerms, documentDiscountPercent, e `lines[]` in cui OGNI riga porta `id: raw.id || undefined` (:4495). `series` = numbering.chosenSeries(), `number` = numbering.imposedNumber() — `undefined` su documento nuovo non toccato. Nessun Idempotency-Key. Timeout 15 s (sales-order.service.ts:21, applicato in saveManualOrder :162-177).

**Create vs update** — LETTO, ed è dichiarato nel DTO stesso: «`id` assente = creazione» (api/src/sales-orders/dto/save-manual-sales-order.dto.ts:89). Server: `if (dto.id)` → `tx.salesOrder.findFirst` (manual-sales-orders.service.ts:243-247), altrimenti create (:348-350). L'`id` del client viene dal PARAMETRO DI ROTTA (customer-order-form.component.ts:494, :4518), che cambia solo dopo una risposta riuscita (:4587-4590). DEDOTTO: risposta persa ⇒ il client rimanda `id: undefined` ⇒ il server crea.

**A · prima creazione** — VULNERABILE, ed è il caso più costoso della famiglia perché tocca il magazzino. LETTO: (1) SECONDO RECORD — sì: `tx.salesOrder.create` (:350). (2) SECONDO NUMERO — sì: senza `number`, il ramo `if (!orderNumber)` (:276-304) chiama `nextDocumentNumber` (primo libero, document-numbering.util.ts:188-241): al reinvio è il successivo, quindi `sales_orders_number_unique` su (tenant_id, series, number) WHERE source='manual' (migration 20260728110000:31-34) non scatta. `lockDocumentCounter` (:290) serializza, non deduplica. (3) RIGHE DUPLICATE — sì: le righe del payload non hanno id, quindi tutte cadono nel ramo `tx.salesOrderLine.create` (:381-383). (4) MOVIMENTI FISICI — nessuno: l'Ordine cliente manuale non scrive mai StockMovement (enumerate tutte le scritture del servizio: salesOrder, salesOrderLine, inventoryLevel in sola lettura :446, stockReservation in sola lettura :395). (5) IMPEGNI DUPLICATI — SÌ, ed è l'effetto grave: `syncOrderReservationsTx` (stock-reservation.service.ts:68-122) cerca gli impegni esistenti PER salesOrderId (:72-74) e li indicizza per salesOrderLineId (:75-79). Il secondo ordine ha un id nuovo e righe con id nuovi, quindi `existing` è vuoto e ogni riga passa da `createReservationTx` (:90-92, :272-311), che chiude con `applyCommittedDelta(+quantity)` — e quella funzione è ADDITIVA: `committed: { increment: delta }, available: { increment: -delta }` (committed-delta.util.ts:30-33). Risultato: Impegnata raddoppiata e Disponibile decrementata due volte sulla stessa variante×location, senza che nulla lo segnali. L'indice unico `stock_reservations_sales_order_line_id_key` (migration 20260712130000:69-70, schema.prisma:1497 «chiave di idempotenza») garantisce UN impegno per riga ordine: non impedisce che due ordini diversi impegnino due volte la stessa merce. (6) LOTTI — nessuno. (7) ANAGRAFICA — nessuna scrittura: varianti e codici IVA sono solo letti (:168-209). (8) EFFETTI ECONOMICI / REGISTRI — l'ordine NON entra nel Registro Corrispettivi: `buildCorrispettiviWhere` filtra per origine ed esclude esplicitamente il manuale (corrispettivi-query.util.ts:189-199, col commento che riporta la misura dei «due ordini per 229,36 €» già entrati una volta). Duplica però l'elenco /app/sales e il suo totale (sales-orders.service.ts:64-137) e, DEDOTTO dal codice letto, spinge ai canali una disponibilità sbagliata: `pushInventoryTargets` (:493, :830-846) invia lo stato corrente di `inventoryLevel`, che ora porta il committed doppio.

**B · modifica** — RICONCILIATO PER DIFFERENZA sulle quantità, con un residuo di righe di servizio. LETTO: (1) nessun secondo record: `tx.salesOrder.update({ where: { id: existing.id } })` (:349). (2) nessun numero nuovo: `orderNumber` esiste, quindi il ramo di assegnazione è saltato (:276) e quello di riscrittura (:305-318) ricompone lo stesso riferimento. (3) RIGHE: quelle con id vanno in `update` (:376-379), quelle non più presenti sono cancellate per differenza (:388-391) — nessuna duplicazione. (4) MOVIMENTI: nessuno. (5) IMPEGNI: riconciliati davvero — se la riga esiste e `delta === 0` con stessa sede, `continue` senza toccare `committed` (stock-reservation.service.ts:100-109); gli impegni orfani vengono RILASCIATI, non cancellati (:114-121), e il rilascio è protetto da `updateMany where status: active` (:370-375), quindi un doppio rilascio è no-op. (6) LOTTI: nessuno. (7) ANAGRAFICA: nessuna. (8) RIEPILOGHI: invariati. RESIDUO LETTO E DEDOTTO: se durante la modifica l'operatore ha aggiunto una riga NUOVA (senza id) e la risposta si perde, il reinvio dello stesso corpo crea una terza riga e cancella quella creata dal primo giro (removedLineIds, :388-391); la prenotazione agganciata alla riga cancellata NON sparisce — la FK è `onDelete: SetNull` (schema.prisma:1515) — quindi resta viva con `salesOrderLineId` NULL, viene rilasciata (−q) mentre per la riga nuova ne nasce un'altra (+q). Saldo su `committed`: ZERO. Costo: una riga `stock_reservations` rilasciata e due `stock_reservation_events` in più a ogni reinvio.

**Causa tecnica** — I meccanismi presenti IMPEDISCONO: (a) due impegni sulla STESSA riga d'ordine (indice unico su sales_order_line_id); (b) due ordini manuali con lo STESSO numero (indice unico parziale); (c) il doppio rilascio e il doppio consumo di un impegno (`updateMany ... status: active`, stock-reservation.service.ts:157-161 e :370-375); (d) in modifica, la duplicazione di testata, righe e impegni, riconciliati per differenza sull'id. NON IMPEDISCONO la nascita di un SECONDO ordine con righe nuove: le tre guardie sono tutte ancorate a un id (ordine, riga, impegno) che al reinvio in creazione non esiste ancora. È esattamente la distinzione richiesta — una guardia che vieta di rieseguire lo stesso record non vieta che ne nasca un secondo — e qui il secondo record porta con sé un secondo impegno di magazzino, additivo.

**Evidenza** — api/src/sales-orders/manual-sales-orders.service.ts:124-500 (save), :243-260 (ramo id), :276-318 (numerazione), :348-350 (create/update), :376-391 (righe), :406-432 (impegni), :493 e :830-846 (push canali); api/src/order-reservations/stock-reservation.service.ts:68-122, :272-311, :364-400; api/src/order-reservations/committed-delta.util.ts:12-33; api/src/sales-orders/dto/save-manual-sales-order.dto.ts:86-92; api/prisma/schema.prisma:1497, :1514-1515; api/prisma/migrations/20260728110000_numbering_series_prefix_number/migration.sql:31-34; api/prisma/migrations/20260712130000_online_order_reservations/migration.sql:66-70; api/src/corrispettivi/corrispettivi-query.util.ts:182-210; src/app/features/sales-orders/customer-order-form.component.ts:494, :4233-4235, :4483-4535, :4560-4600; src/app/domain/sales-orders/services/sales-order.service.ts:21, :162-177

#### 9. `POST /customers → CustomersService.create`

**Comando** — Crea un cliente dal pannello «+ Nuovo cliente» dentro la maschera Ordine cliente, senza uscire dal documento.

**Il client manda** — LETTO. `mapCustomerFormToInput(this.customerForm.getRawValue())` (customer-order-form.component.ts:782-783); il campo `code` parte vuoto (nessun chiamante di un'anteprima codice nel frontend). Nessuna chiave di richiesta.

**Create vs update** — Non distingue: il pannello crea sempre.

**A · prima creazione** — VULNERABILE, stesso schema del «Nuovo fornitore». LETTO: con `code` assente la transazione lo alloca come progressivo (`allocateNextCustomerCode`, customers.service.ts:160), poi crea `Party` (:162-165) e `Customer` (:166-169). Al reinvio il codice è diverso, quindi `@@unique([tenantId, code])` (schema.prisma:1195) non scatta e nasce un secondo cliente anagrafico completo. Se la spunta «anche fornitore» è attiva, `setSupplierRoleTx` (:171-173) tocca anche l'anagrafica gemella. Nessun documento, numero, riga, movimento, impegno o lotto. L'effetto è anagrafico e permanente. Guardia client: `savingCustomer` (customer-order-form.component.ts:769, :780) blocca solo il doppio clic in volo.

**B · modifica** — Non applicabile da questa maschera.

**Causa tecnica** — Il vincolo unico sul codice cliente impedisce due clienti con lo STESSO codice; ma il codice se lo calcola il server e al secondo giro ne calcola uno nuovo, quindi il vincolo non ha mai occasione di scattare. Nessun vincolo su ragione sociale, partita IVA o codice fiscale nello schema.

**Evidenza** — api/src/customers/customers.service.ts:143-178; api/prisma/schema.prisma:1195; src/app/features/sales-orders/customer-order-form.component.ts:767-799

#### 10. `POST /sales-orders/:id/attachments → AttachmentsService.upload (via SalesOrdersController.uploadAttachment)`

**Comando** — Allega un file all'ordine cliente (modale allegati della maschera).

**Il client manda** — LETTO. multipart con il campo `file` (sales-orders.controller.ts:194-204, FileInterceptor). Nessun hash del contenuto, nessuna chiave di richiesta.

**Create vs update** — Non distingue: l'upload crea sempre un nuovo allegato; la modifica è un endpoint separato (PATCH :id/attachments/:attachmentId, che rinomina soltanto).

**A · prima creazione** — VULNERABILE. LETTO: `upload` compone il percorso di storage con `randomUUID()` (attachments.service.ts:106-107), carica il byte stream con `upsert: false` (:109-111) e crea una riga `Attachment` (:119-130). Il nome del file NON entra nel percorso e nessun confronto sul contenuto viene fatto: il reinvio produce un SECONDO oggetto nello storage e una SECONDA riga, con lo stesso nome mostrato. La quota (`assertAttachmentQuota`, :101) viene consumata due volte. Nessun effetto su documenti, numeri, righe, movimenti, impegni, lotti o registri.

**B · modifica** — Non applicabile: l'upload non ha una forma di modifica. La rinomina (:134-147) scrive un valore ed è idempotente; la cancellazione dà 404 al secondo giro.

**Causa tecnica** — L'unico meccanismo presente è `upsert: false` sullo storage, che impedirebbe di sovrascrivere un percorso esistente — ma il percorso è nuovo a ogni chiamata per costruzione (`randomUUID()`), quindi la collisione che quel flag giudica non può verificarsi. Nessuna chiave sul contenuto o sulla richiesta.

**Evidenza** — api/src/attachments/attachments.service.ts:92-131; api/src/sales-orders/sales-orders.controller.ts:186-249

#### 11. `POST /inventory/movements → InventoryService.registerMovement`

**Comando** — Registrazione di un singolo movimento di magazzino (endpoint esposto e usato anche internamente dall'import CSV giacenze).

**Il client manda** — LETTO. RegisterMovementDto: type, variantId, locationId, targetLocationId, quantity, direction, reason (src/app/domain/inventory/services/inventory.service.ts:326-340). Quantità sempre RELATIVA, mai una giacenza voluta. Nessuna chiave di richiesta.

**Create vs update** — Non lo distingue: non esiste un aggiornamento di movimento. Ogni chiamata crea.

**A · prima creazione** — VULNERABILE senza attenuanti. Il delta è `sourceDelta(dto)` (:445), applicato con increment (:446-449 → inventory-level-delta.util.ts:34-37), e il movimento si crea in coda (:451-467). Al reinvio: secondo stockMovement (senza sourceLineId, quindi fuori dal vincolo di schema.prisma:930), giacenza mossa due volte (e sulla destinazione del trasferimento pure), push canali ripetuto con il valore sbagliato (:472-480). Nessun record documentale, nessun numero, nessun impegno, nessun lotto, nessuna scrittura anagrafica. Effetto sui registri economici: nessuno diretto — i movimenti non entrano nel Registro Corrispettivi — ma la giacenza pubblicata sui canali diverge.

**B · modifica** — Non applicabile: nessun percorso rilegge e riscrive un movimento esistente da questo endpoint.

**Causa tecnica** — Non c'è nessun meccanismo: né chiave di richiesta, né chiave verso l'origine, né guardia di stato. La colonna che potrebbe farlo esiste ed è già vincolata — sourceDocumentType/sourceLineId con `@@unique` (schema.prisma:906-930) — ma questo percorso non la valorizza, perché un movimento manuale non nasce da una riga di documento.

**Evidenza** — api/src/inventory/inventory.controller.ts:268-278; api/src/inventory/inventory.service.ts:414-481; api/src/inventory/inventory-level-delta.util.ts:16-37; api/prisma/schema.prisma:904-930; src/app/domain/inventory/services/inventory.service.ts:326-340.

#### 12. `POST /documents/:id/attachments → DocumentAttachmentsService.uploadAttachment`

**Comando** — Allega un file a un documento (modale allegati).

**Il client manda** — LETTO. multipart con il solo file; l'id documento è in rotta (documents.controller.ts:311-324). Nessun hash, nessuna chiave di richiesta.

**Create vs update** — Il caricamento è sempre una creazione. L'unica modifica è la rinomina (PATCH :id/attachments/:attachmentId), che opera su un id noto.

**A · prima creazione** — VULNERABILE. Il percorso nel bucket è costruito con `randomUUID()` (document-attachments.service.ts:84), quindi due invii dello stesso file producono DUE oggetti distinti nello storage e DUE righe `documentAttachment` (:99-109). Non c'è confronto per nome, dimensione o contenuto, e nessun vincolo unico su (documentId, fileName). La quota del documento (:78) viene consumata due volte. Nessun numero consumato, nessun movimento, nessun impegno, nessun lotto, nessuna scrittura anagrafica, nessun effetto sui registri economici: la duplicazione è documentale e di spazio.

**B · modifica** — La rinomina (PATCH) scrive un valore su un id noto (:113-135): reinviarla riscrive lo stesso nome — riconciliata per differenza, nessun record in più.

**Causa tecnica** — Nessun meccanismo: né chiave di richiesta, né chiave di contenuto, né vincolo unico. L'unica difesa è la guardia in-flight del client, che non copre il timeout né la risposta persa. L'`upsert: false` sull'upload nello storage (:90) non protegge nulla, perché il percorso è nuovo a ogni tentativo per costruzione.

**Evidenza** — api/src/documents/documents.controller.ts:311-345; api/src/documents/document-attachments.service.ts:70-135 (:78 quota, :84 randomUUID, :86-97 upload, :99-109 create).

### ⚠️ PARZIALMENTE PROTETTI — 18

#### 1. `POST /store-sales → StoreSalesService.createSale  (store-sales.controller.ts:47-56 → store-sales.service.ts:103)`

**Comando** — L'operatore batte il carrello alla cassa e preme «Concludi vendita» (conferma nel dialogo). Dalla rotta di modifica (`.../:id/edit`) lo stesso pulsante RISALVA una vendita già registrata.

**Il client manda** — LETTO — store-sale-register.component.ts:1171-1203 (concludeSale) e domain/store-sales/models/store-sale.model.ts:40-51. Payload: { id?, locationId, paymentMethod, paymentMethodNote?, customerId?, notes?, lines[{ id?, variantId, quantity, unitPriceMinor, discountPercent?, vatCodeId? }] }.

⛔ Ciò che il client NON manda, e che quindi non può fare da freno: nessun `number`, nessun `series`, nessun `documentDate` (il modello `CreateStoreSalePayload` non ha quei campi, mentre il DTO server li accetta — create-store-sale.dto.ts:110-150). Nessun header di idempotenza (grep `Idempotency` su src/app e api/src: zero occorrenze). Nessun retry RxJS: la pipe è solo `timeout(15000)` (features/store-sales/services/store-sales.service.ts:16,39).

Unica guardia lato client: `if (!locationId || this.salePending()) return` (componente:1165) più `[busy]`/`[loading]` sul pulsante (component.html:373,385-387). Copre il doppio clic MENTRE la chiamata è in volo, e nient'altro: allo scadere dei 15 s il ramo `error` rimette `salePending` a false (componente:1217-1221), il carrello resta pieno (viene svuotato solo nel ramo `next`, riga 1210) e il messaggio mostrato è «Operazione non riuscita. Riprova.» — un TimeoutError non ha la proprietà `kind`, quindi non è un AppError (core/models/app-error.model.ts:30-38) e cade nel ripiego generico (componente:1391). DEDOTTO: la maschera invita esplicitamente al reinvio che duplica.

**Create vs update** — LETTO — un solo campo: `dto.id`. Assente → `existing = null`; presente → `loadEditableStoreDocument` carica il documento imponendo tenant e tipo nel `where` e rifiutando gli annullati (service.ts:112-114, 400-452). Il ramo di numerazione e la `document.create` stanno dentro `if (!existing)` (service.ts:153, 308); l'altro ramo fa `document.update` sullo stesso id (service.ts:302).

⛔ Il punto che decide tutto: lato client `dto.id` è il PARAMETRO DI ROTTA `:id` (`editDocumentId`, componente:351,1176), non l'id restituito dalla risposta. `lastSaleResult` (componente:1209) non viene mai rimesso nel payload. Quindi dopo una risposta persa la maschera resta esattamente nello stato in cui era: in modo CREAZIONE, e il reinvio è una seconda creazione — non un ritentativo dello stesso comando.

**A · prima creazione** — PRIMA CREAZIONE — reinviando lo stesso comando (accertato, qui completato voce per voce):

• SECONDO RECORD DOCUMENTALE: SÌ. Nuova `tx.document.create` (service.ts:308-346) con `status: confirmed` e `confirmedAt` nuovo. Nessun vincolo unico può fermarla: l'unico indice unico su `documents` è quello del numero — (tenant, tipo-che-possiede-il-numeratore, serie, numero), migration 20260811090000_numero_unico_per_numeratore/migration.sql:29-42 — e i due documenti hanno numeri DIVERSI, quindi non collidono mai. Nessun altro indice guarda il contenuto (schema.prisma:2012-2178, solo @@index non-unici).

• SECONDO NUMERO CONSUMATO: SÌ. Si rientra nel ramo `!existing` (153): `nextDocumentNumber` legge il massimo dai documenti e fa +1 (document-numbering.util.ts:338-341, chiamato da resolveDocumentNumber:384-399). Non esiste un contatore da riavvolgere — il numero è «consumato» per il solo fatto che un secondo documento numerato esiste. L'advisory lock (service.ts:180, document-numbering.util.ts:366-377) SERIALIZZA due casse concorrenti, non riconosce un reinvio: anzi garantisce che il secondo invio ottenga un numero pulito e diverso, cioè che non collida.

• RIGHE DUPLICATE: SÌ. In creazione le righe partono senza `id` (`serverLineId` è null, componente:763,799-800,1184) e nascono con `lines: { create: … }` (service.ts:332-338). Ogni riga del carrello esiste due volte, su due documenti.

• MOVIMENTI FISICI DUPLICATI: SÌ (accertato; meccanismo verificato). `syncUnloadLineMovements` cerca i movimenti esistenti per `sourceDocumentId` (document-stock-unload-sync.util.ts:170-176): il documento è nuovo, la mappa `byLineId` è vuota, ogni riga cade nel ramo `if (!movement)` (194) e produce `applyInventoryDelta(-quantity)` + `stockMovement.create` (196-219). Il vincolo `@@unique([sourceDocumentType, sourceLineId])` (schema.prisma:931) NON protegge: le righe nuove portano id nuovi, quindi la coppia è nuova. Giacenza e disponibile scendono due volte (inventory-level-delta.util.ts:17-38 muove `onHand` e `available` insieme).

• IMPEGNI DUPLICATI: NO — perché non esistono affatto. `StockReservation` non è mai scritto da questo percorso (grep `stockReservation` su api/src: solo order-reservations/, sales-orders/, shopify/, tenant-backup/ — mai store-sales) e `applyInventoryDelta` non tocca `committed`. Non è una protezione: è un effetto che questa famiglia non ha.

• LOTTI DUPLICATI: NO, stessa ragione. `applyInventoryLotsFromDocumentLines` (inventory-lot.util.ts:9, quello additivo con `increment`) ha un solo chiamante: goods-receipt-workflow.service.ts:23,775. La vendita al banco non lo chiama e non scrive mai `lotCode` sulle righe (service.ts:213-256: il record di riga non contiene `lotCode`).

• AGGIORNAMENTI ANAGRAFICI RIPETUTI: NO. `createSale` legge e basta: l'unico accesso a `productVariant` è una `findMany` (service.ts:869-885). L'unica scrittura anagrafica dell'intera catena è `productVariant.update({ shopifyInventoryItemId })` dentro il push (shopify-inventory-push.service.ts:183-186), che riscrive lo stesso valore: idempotente.

• EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: SÌ. Nessuna riga di registro viene scritta al salvataggio (grep `corrispettivoEntry` su api/src: zero scritture): il Registro Corrispettivi è DERIVATO dalla tabella `documents` in lettura, con filtro `status: { not: cancelled }` (corrispettivi-query.util.ts:331-345), quindi conta entrambi i documenti in elenco, in `orderCount` e nei totali. Ricavo e margine di analytics derivano dai movimenti duplicati (analytics/movement-sales-revenue.util.ts:23-31). ⛔ E il duplicato NON è rimediabile con gli strumenti normali: la Vendita al banco non si annulla (documents.service.ts:2585-2590 «registra un Reso») e non si elimina (documents.service.ts:2885-2892 «fanno parte dello storico movimenti»). Il push verso i canali riparte per ogni variante (service.ts:384-388) e pubblica una giacenza sbagliata — ma il push in sé non è additivo: `/inventory_levels/set.json` scrive un valore assoluto (shopify-admin.client.ts:147-162).

**B · modifica** — MODIFICA (rotta `.../:id/edit`) — reinviando lo stesso comando: gli effetti SI RICONCILIANO DAVVERO per differenza. Dimostrazione, non fiducia nella transazione:

• SECONDO RECORD DOCUMENTALE: NO. `tx.document.update` sullo stesso id (service.ts:302-306). Numero, serie, riferimento e data documento sono conservati e non ricalcolati (service.ts:131-135 per la data, 199 per il riferimento; test store-sales.service.spec.ts:987-1002).

• SECONDO NUMERO CONSUMATO: NO. Tutto il blocco di numerazione (lock + resolveDocumentNumber) sta dentro `if (!existing)` (service.ts:153-198): in modifica non viene nemmeno letto un massimo.

• RIGHE DUPLICATE: NO per le righe che portano l'id. `persistDocumentLinesByIdTx` fa `updateMany` per (id, documento, tenant) (document-line-upsert.util.ts:77-101); un id che non appartiene al documento o ripetuto due volte è 422, mai una creazione silenziosa (righe 52-66). Il client rimanda sempre l'id del server per le righe caricate (`serverLineId` = `DocumentLine.id`, componente:414-416,1184).
⚠️ ECCEZIONE DA NOMINARE — riga AGGIUNTA durante la modifica: parte senza id, quindi al reinvio la riga creata dal primo tentativo non viene rivendicata, finisce in `removedIds` ed è ELIMINATA (upsert:69-75), mentre la stessa riga viene ricreata con un id nuovo. Il conteggio righe resta corretto (nessuna duplicazione), ma l'identità della riga cambia a ogni reinvio. DEDOTTO dalla lettura del codice: nessun test copre questo caso.

• MOVIMENTI FISICI DUPLICATI: NO. `syncUnloadLineMovements` ritrova il movimento per `sourceLineId` nella mappa `byLineId` (document-stock-unload-sync.util.ts:170-182); con payload identico `targetChanged` è false, `quantityDelta` è 0, `sku` e `reason` (`Vendita al banco ${reference}`, con reference conservato) sono invariati e `nextTotalCostMinor` si ricalcola dal costo unitario GIÀ congelato sul movimento (righe 250-265): `needsUpdate` è false, quindi non parte nemmeno una `update`, e nessun `applyInventoryDelta` viene chiamato. Prova diretta: store-sales.service.spec.ts:1050-1064 «doppio salvataggio identico: nessun movimento in piu e nessuna variazione di giacenza», e spec:964-984 per la modifica 2→1 (delta −1, stesso id movimento).
Per la riga aggiunta senza id (eccezione sopra): il movimento della riga eliminata diventa orfano e viene STORNATO (+quantity) e cancellato (unload-sync:284-293), mentre la riga ricreata ne genera uno nuovo (−quantity) (194-219). Effetto netto sulla giacenza ZERO — nessuna duplicazione — ma il movimento cambia id nel registro. DEDOTTO.

• IMPEGNI / LOTTI: nessuno, come nel caso A e per le stesse ragioni.

• AGGIORNAMENTI ANAGRAFICI RIPETUTI: nessuno: nessuna scrittura anagrafica in questo percorso.

• EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: NO. È lo stesso documento, quindi il Registro Corrispettivi lo conta una volta sola; i totali di testata si ricalcolano dalle stesse righe e danno gli stessi valori (service.ts:259-261). Il push canali riparte comunque (service.ts:384-388) ma è desired-state assoluto (shopify-admin.client.ts:154-161): non è additivo.

**Causa tecnica** — CHE COSA IMPEDISCE il meccanismo esistente: in MODIFICA la duplicazione è impedita da due identità stabili, non dalla transazione. (1) `dto.id` viene dalla ROTTA, quindi è lo stesso a ogni reinvio e il ramo `!existing` non si riapre (service.ts:153); (2) `line.id` viaggia nel payload, e su di esso poggiano l'upsert per id (document-line-upsert.util.ts:77-101) e il ritrovamento del movimento via `sourceLineId` (unload-sync:177-182), che con payload identico non scrive nulla (`needsUpdate` false, righe 257-265).

CHE COSA LASCIA POSSIBILE: tutto il caso A. Nessuno dei meccanismi presenti guarda il CONTENUTO del comando —
• la transazione (service.ts:144) rende ATOMICO un singolo comando, non UNICO fra due comandi;
• l'advisory lock (service.ts:180) serializza gli assegnatari di numero: garantisce che il reinvio prenda un numero DIVERSO, cioè esattamente ciò che gli evita la collisione;
• l'indice unico su `documents` copre solo (tenant, tipo-numeratore, serie, numero) — due numeri diversi non collidono (migration 20260811090000);
• `@@unique([sourceDocumentType, sourceLineId])` (schema.prisma:931) impedisce DUE movimenti sulla STESSA riga, non la nascita di righe nuove con id nuovi che portano i propri movimenti;
• la guardia di stato `loadEditableStoreDocument` (service.ts:450-452) rifiuta di modificare un annullato: non ha alcun rapporto con la creazione di un secondo documento.
Lato client la sola guardia è `salePending` (componente:1165), che copre il doppio clic in volo e non il reinvio dopo il timeout di 15 s — dove per giunta il messaggio mostrato è «Riprova» (componente:1391).

**Evidenza** — api/src/store-sales/store-sales.controller.ts:47-56 · api/src/store-sales/store-sales.service.ts:103,112-114,131-135,144,153,180,185-198,199,281-301,302-306,308-346,348-366,384-388,400-452,869-885 · api/src/documents/document-line-upsert.util.ts:52-66,69-75,77-101 · api/src/documents/document-stock-unload-sync.util.ts:170-182,194-219,225-273,284-293 · api/src/documents/document-numbering.util.ts:338-341,366-377,384-399 · api/src/inventory/inventory-level-delta.util.ts:17-38 · api/src/inventory/inventory-lot.util.ts:9 (chiamato solo da goods-receipt-workflow.service.ts:23,775) · api/prisma/schema.prisma:931,2012-2178 · api/prisma/migrations/20260811090000_numero_unico_per_numeratore/migration.sql:29-42 · api/src/corrispettivi/corrispettivi-query.util.ts:331-345 · api/src/documents/documents.service.ts:2585-2590,2885-2892 · api/src/analytics/movement-sales-revenue.util.ts:23-31 · api/src/shopify/shopify-inventory-push.service.ts:151-158,183-186 · api/src/shopify/shopify-admin.client.ts:147-162 · api/src/store-sales/store-sales.service.spec.ts:964-984,987-1002,1026-1048,1050-1064 · src/app/features/store-sales/store-sale-register.component.ts:351,414-416,763,799-800,1165,1171-1203,1206-1216,1217-1221,1391 · src/app/features/store-sales/services/store-sales.service.ts:16,36-40 · src/app/domain/store-sales/models/store-sale.model.ts:29-51 · src/app/core/models/app-error.model.ts:30-38

#### 2. `POST /store-sales/returns → StoreSalesService.createReturn  (store-sales.controller.ts:58-66 → store-sales.service.ts:470)`

**Comando** — L'operatore compone il reso al banco (righe, spunta «carica giacenze» per riga, causale) e preme «Concludi reso». Dalla rotta `.../:id/edit` lo stesso pulsante risalva un reso già registrato.

**Il client manda** — LETTO — store-sale-register.component.ts:1292-1305 (concludeReturn) e store-sale.model.ts:86-93. Payload: { id?, locationId, reason, notes?, lines[{ id?, variantId, quantity, restockable, unitPriceMinor }] }.

⛔ Come per la vendita: nessun `number`, nessun `series`, nessun `documentDate` nel modello client (il DTO server li accetterebbe — create-store-return.dto.ts:186-233); nessun header di idempotenza; nessun retry; pipe `timeout(15000)` (features/store-sales/services/store-sales.service.ts:16,46). Il client non manda `vatCodeId` né `discountPercent` sulle righe di reso, pur essendo previsti dal DTO (create-store-return.dto.ts:58-66,140).

Guardia client: `if (!locationId || this.returnPending()) return` (componente:1281) e `[busy]`/`[loading]` (component.html:513,525-527). Al timeout il ramo `error` (componente:1316-1320) rimette `returnPending` a false e mostra «Operazione non riuscita. Riprova.» (componente:1391); le righe del reso restano compilate, perché `clearReturn()` sta solo nel ramo `next` (componente:1313).

**Create vs update** — LETTO — identico alla vendita, stesso unico discriminante `dto.id`: `loadEditableStoreDocument(tenantId, dto.id, store_return)` (service.ts:477-479, 400-452), numerazione e `document.create` dentro `if (!existing)` (service.ts:519, 675), altrimenti `document.update` sullo stesso id (service.ts:669). Lato client `dto.id` è il parametro di rotta (componente:351,1295); l'id restituito dalla risposta precedente (`lastReturnResult`, componente:1311) non rientra mai nel payload, quindi dopo una risposta persa il reinvio è una seconda creazione.

**A · prima creazione** — PRIMA CREAZIONE — reinviando lo stesso comando:

• SECONDO RECORD DOCUMENTALE: SÌ. `tx.document.create` di tipo `store_return`, già `confirmed` (service.ts:675-708). Stessa assenza di vincoli sul contenuto della vendita: l'unico indice unico è quello del numero (migration 20260811090000), e i due resi hanno numeri diversi.

• SECONDO NUMERO CONSUMATO: SÌ. Il Reso ha un contatore PROPRIO (`store_return` non condivide il numeratore, DocumentType non rientra nel CASE della migration), e il ramo `!existing` riassegna il primo libero (service.ts:519-546 → document-numbering.util.ts:338-341). L'advisory lock (service.ts:534) serializza, non deduplica.

• RIGHE DUPLICATE: SÌ. Righe senza `id` in creazione (componente:1300) create in blocco (service.ts:695-701).

• MOVIMENTI FISICI DUPLICATI: SÌ, per le sole righe con la spunta. `syncGoodsReceiptLineMovements` (service.ts:711-733) cerca i movimenti per `sourceDocumentId` (document-goods-receipt-sync.util.ts:148-155): documento nuovo → mappa vuota → ogni riga valida cade in `if (!movement)` (178) e produce `applyInventoryDelta(+quantity)` + `stockMovement.create` di tipo `return`, origine `vestiflow_pos` (179-205). La merce rientra DUE volte. Il filtro è `loadsStock`, che qui è la spunta di riga `restockable` (service.ts:619; `isStockLine`, goods-receipt-sync:81-83): una riga senza spunta non genera movimento né la prima né la seconda volta — ma il documento e i suoi effetti economici si duplicano lo stesso.

• IMPEGNI DUPLICATI: NO, non esistono: nessuna scrittura su `StockReservation` in questo percorso; `applyInventoryDelta` muove solo `onHand`/`available` (inventory-level-delta.util.ts:31-37).

• LOTTI DUPLICATI: NO. Anche se il verso è quello di CARICO, `applyInventoryLotsFromDocumentLines` (inventory-lot.util.ts:9, l'`increment` additivo) resta appeso al solo Arrivo merce (goods-receipt-workflow.service.ts:775) e non è chiamato da `createReturn`; le righe del reso non scrivono `lotCode` (service.ts:558-620).

• AGGIORNAMENTI ANAGRAFICI RIPETUTI: NO. Sola lettura di `productVariant` (service.ts:869-885). ⚠️ Da notare: `unitCostForNewLine` congela il costo corrente della variante su OGNI movimento nuovo (service.ts:727) — quindi il duplicato porta un secondo movimento con il proprio costo congelato; è un effetto duplicato, non una scrittura in anagrafica.

• EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: SÌ. Il Reso è la quinta sorgente del Registro Corrispettivi, derivata in lettura da `documents` con `status: { not: cancelled }` (corrispettivi-query.util.ts:368-400, `buildCorrispettiviStoreReturnWhere`): due resi identici abbattono il registro del doppio. Nessuna riga di registro è scritta al salvataggio (nessuna scrittura `corrispettivoEntry` in api/src). ⛔ Anche qui il duplicato non si annulla e non si elimina dal registro documenti (documents.service.ts:2585-2590, 2885-2892: il blocco `isFlowOnlyDocumentType` copre `store_sale` E `store_return`, document-defaults.ts:56-59). Push canali rilanciato (service.ts:748-752), desired-state assoluto.

**B · modifica** — MODIFICA — reinviando lo stesso comando: riconciliato per differenza, con lo stesso impianto della vendita ma sul motore di CARICO.

• SECONDO RECORD DOCUMENTALE: NO. `document.update` sullo stesso id (service.ts:669-673); numero, serie, riferimento e data restano (service.ts:502-506, 548; test store-sales.service.spec.ts:1287).

• SECONDO NUMERO CONSUMATO: NO — blocco di numerazione dentro `if (!existing)` (service.ts:519-546).

• RIGHE DUPLICATE: NO per le righe con id (stesso `persistDocumentLinesByIdTx`, service.ts:648-668 → document-line-upsert.util.ts:77-101; id estraneo o ripetuto = 422, righe 52-66). ⚠️ Stessa eccezione della vendita per una riga AGGIUNTA in modifica (senza id): al reinvio viene eliminata e ricreata con id nuovo (upsert:69-75) — nessuna duplicazione di conteggio, ma identità di riga e di movimento che cambiano. DEDOTTO, non coperto da test.

• MOVIMENTI FISICI DUPLICATI: NO. `byLineId` ritrova il movimento per `sourceLineId` (document-goods-receipt-sync.util.ts:148-155). Con payload identico: `targetChanged` false, `quantityDelta` 0, `sku` e `reason` invariati (il reason include il riferimento conservato e la causale, service.ts:718-720), `totaleCostoAggiornato` ricalcolato dal costo unitario già congelato sul movimento e confrontato al centesimo con `sameNullableAmountAtCent`, e `movementDateChanged` falso perché `movementDate` è la `documentDate` conservata (service.ts:722, 502-506) uguale al `createdAt` scritto alla creazione (goods-receipt-sync:196) → `needsUpdate` false (righe 240-262): nessuna scrittura, nessun `applyInventoryDelta`.
⚠️ Prove: esistono i test 2→1 (spec:1188-1216), costo congelato non rivalutato (spec:1233), spunta tolta → movimento eliminato e giacenza restituita (spec:1259). NON esiste per il Reso il test «doppio salvataggio identico» che invece copre la Vendita (spec:1050): per il Reso l'idempotenza dell'invio identico è DEDOTTA dal motore condiviso e dalla lettura di `needsUpdate`, non asserita.
Per la riga aggiunta senza id: movimento orfano stornato (−quantity) e cancellato (goods-receipt-sync:281-291) mentre la riga ricreata ne crea uno nuovo (+quantity): effetto netto sulla giacenza zero. DEDOTTO.

• IMPEGNI / LOTTI: nessuno, come nel caso A.

• AGGIORNAMENTI ANAGRAFICI RIPETUTI: nessuno.

• EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: NO — stesso documento, contato una volta sola dal Registro; totali ricalcolati identici (service.ts:624-626). Push canali rilanciato ma desired-state.

**Causa tecnica** — IMPEDISCE: in modifica, le stesse due identità stabili della vendita — `dto.id` dalla rotta (componente:351,1295) che tiene chiuso il ramo `!existing` (service.ts:519), e `line.id` nel payload su cui poggiano l'upsert per id e il ritrovamento del movimento via `sourceLineId` (goods-receipt-sync:148-155), con `needsUpdate` che non scatta su payload identico (240-262).

LASCIA POSSIBILE: l'intero caso A, per le stesse ragioni strutturali della vendita. In più, due particolarità del Reso da mettere a verbale:
(a) il contatore del Reso è indipendente, quindi il secondo invio brucia un progressivo di `store_return` senza alcuna possibilità di collisione;
(b) il verso è POSITIVO — un reinvio non fa «scendere due volte» una giacenza, la fa SALIRE due volte: crea merce che non è mai rientrata, e la pubblica sui canali con `/inventory_levels/set.json`.
Nessuna guardia guarda il contenuto: la transazione (service.ts:515) è atomicità di un comando; `loadEditableStoreDocument` rifiuta gli annullati (service.ts:450-452) ma non ha rapporto con la nascita di un secondo documento; `@@unique([sourceDocumentType, sourceLineId])` (schema.prisma:931) vieta due movimenti sulla stessa riga, non due righe nuove con due movimenti. Lato client `returnPending` (componente:1281) copre solo il doppio clic in volo.

**Evidenza** — api/src/store-sales/store-sales.controller.ts:58-66 · api/src/store-sales/store-sales.service.ts:470,477-479,502-506,515,519,534,536-546,548,558-620,624-626,632-644,648-668,669-673,675-708,711-733,748-752 · api/src/store-sales/dto/create-store-return.dto.ts:22-30,58-66,140,186-233 · api/src/documents/document-goods-receipt-sync.util.ts:81-83,148-155,178-205,210-262,281-291 · api/src/documents/document-line-upsert.util.ts:52-66,69-75,77-101 · api/src/documents/document-numbering.util.ts:338-341,366-377 · api/src/documents/document-defaults.ts:52-62 · api/src/inventory/inventory-level-delta.util.ts:17-38 · api/src/inventory/inventory-lot.util.ts:9 · api/src/inventory/movement-cost.util.ts:47-52 · api/prisma/schema.prisma:931 · api/prisma/migrations/20260811090000_numero_unico_per_numeratore/migration.sql:29-42 · api/src/corrispettivi/corrispettivi-query.util.ts:347-400 · api/src/documents/documents.service.ts:2585-2590,2885-2892 · api/src/shopify/shopify-admin.client.ts:147-162 · api/src/store-sales/store-sales.service.spec.ts:1188-1216,1233,1259,1287 · src/app/features/store-sales/store-sale-register.component.ts:351,1281,1292-1305,1309-1315,1316-1320,1391 · src/app/features/store-sales/services/store-sales.service.ts:16,43-47 · src/app/domain/store-sales/models/store-sale.model.ts:53-93

#### 3. `POST /documents/goods-receipt/save → saveGoodsReceiptInner (blocco ordine fornitore)`

**Comando** — «Salvo un arrivo merce nel quale ho incluso un ordine fornitore» (pulsante Includi documento → ordine fornitore Confermato). Salvo, la risposta si perde, risalvo.

**Il client manda** — LETTO. Lo stesso corpo, più `supplierOrderId` quando presente: `...(supplierOrderId ? { supplierOrderId } : {})` (goods-receipt-form.component.ts:4669), risolto da `resolveSupplierOrderId()` = `loadedDocument()?.linkedSupplierOrder?.id ?? pendingSupplierOrderId() ?? null` (:4227). DEDOTTO ma verificabile: alla perdita della risposta `pendingSupplierOrderId` NON viene azzerato (l'azzeramento sta solo nel ramo next, :4500-4501), quindi il reinvio porta di nuovo `supplierOrderId`. Le righe portano `supplierOrderLineId` (:4706).

**Create vs update** — Identico al caso base: solo `dto.id`. In più, il collegamento all'ordine viene ricontrollato solo quando cambia: `if (dto.supplierOrderId && dto.supplierOrderId !== existing?.supplierOrderId)` (:498) — su creazione `existing` è null, quindi il controllo scatta SEMPRE.

**A · prima creazione** — ✅ BLOCCATO, per effetto collaterale di una guardia di stato — e va detto esattamente cosa blocca. Al primo tentativo `reconcileSupplierOrderReceipt` (:749) chiama in coda `syncSupplierOrderConclusion` (document-supplier-order.util.ts:173, 37-66), che conta i documenti attivi agganciati (≥1) e porta l'ordine a `SupplierOrderStatus.concluded`. Al reinvio, il blocco :498-511 rilegge lo stato dell'ordine e, non essendo più `confirmed`, solleva ConflictException «Solo ordini fornitore confermati (non ancora conclusi) possono essere agganciati a un arrivo merce». Il throw avviene alla riga 506-510, PRIMA del `document.create` di riga 605: la transazione rolla indietro e NON nasce nulla. Quindi: secondo record documentale NO, secondo numero NO (il numero si assegna a :540, dopo la guardia), righe NO, movimenti NO, lotti NO, impegni nessuno, ricevuto ordine NON incrementato, anagrafica NON toccata, registri NO. ⚠️ QUALE DUPLICAZIONE NON IMPEDISCE: nulla di questo vale se `dto.supplierOrderId` è assente — cioè per ogni arrivo merce non collegato a un ordine, e per manual_load/initial_load. La guardia protegge il collegamento all'ordine, non il salvataggio; il fatto che protegga anche il reinvio è un effetto collaterale, e cade nel momento in cui quella regola di stato cambiasse.

**B · modifica** — ✅ RICONCILIATO PER DIFFERENZA, e va dimostrato. Il ricevuto è ADDITIVO nella forma (`receivedQuantity + delta`, document-supplier-order.util.ts:166-170), ma il delta si calcola fra due fotografie: `oldLines = existing.lines` lette all'inizio della transazione (:747-748, `existing && existing.status !== draft ? existing.lines : []`) e `newLines = savedLines` (:749). Al reinvio identico oldMap e newMap coincidono → `delta === 0` → `continue` (:151-153): nessuna scrittura. Vale anche per il caso insidioso «modifica che AGGIUNGE una riga»: al secondo giro la riga creata al primo tentativo è ancora in `existing.lines` con il suo `supplierOrderLineId` (scritto a :736-739), quindi entra in oldMap; la riga ricreata entra in newMap sulla STESSA chiave di riga ordine (l'aggregazione è per `supplierOrderLineId`, :13-28) → delta 0. Secondo record/numero/righe: NO (ramo update). Movimenti: NO nel reinvio puro. Impegni: nessuno. Lotti: NO nel reinvio puro, SÌ se la modifica aggiungeva una riga con lotto (vedi voce lotti). Registri: nessuna DocumentRevision se deltas è vuoto (:804). ⚠️ Esiste anche una seconda rete, di natura diversa: se il carico copre TUTTO l'ordinato, `remaining` è 0 e un delta positivo verrebbe rifiutato con 422 «Quantità eccessiva per SKU …» (:158-164). È una guardia di quantità, non di idempotenza: su un carico PARZIALE non scatta.

**Causa tecnica** — Il meccanismo che impedisce il caso A è la guardia di stato dell'ordine fornitore (:498-511 + syncSupplierOrderConclusion), non una protezione contro il reinvio: impedisce che un secondo documento si agganci a un ordine già Concluso, e per questo impedisce anche il duplicato. Lascia possibile: ogni duplicazione descritta nella voce «caso base» quando l'ordine non c'è; e non copre il caso in cui l'ordine fosse stato riportato a Confermato (annullando il primo arrivo) fra i due tentativi. Il meccanismo che riconcilia il caso B è invece intenzionale: `reconcileSupplierOrderReceipt` lavora su differenza fra stato persistito e stato inviato, non su accumulo.

**Evidenza** — api/src/documents/goods-receipt-workflow.service.ts:498-511, 726-750; api/src/documents/document-supplier-order.util.ts:13-28, 37-66, 129-173 (in particolare 147-171 e la guardia 158-164); src/app/features/documents/goods-receipt-form.component.ts:4227, 4500-4501, 4669, 4706

#### 4. `POST /documents/goods-receipt/save → saveGoodsReceiptInner → createQuickProductWithVariant`

**Comando** — «Salvo un arrivo merce in cui ho creato l'articolo direttamente dalla riga» (riga senza articolo collegato + dati del nuovo prodotto). Salvo, la risposta si perde, risalvo.

**Il client manda** — LETTO. La riga viaggia senza `variantId` e con `newProduct` (goods-receipt-form.component.ts:4676-4678, 4712), costruito da buildNewProductBody (:4719-4739): `name` obbligatorio, `sku: line.sku.trim() || undefined`, `barcode: line.barcode.trim() || undefined` — entrambi FACOLTATIVI (save-goods-receipt.dto.ts:35-43). L'adozione di variantId/sku dalla risposta avviene solo in adoptSavedLineState (:4788-4792), quindi al reinvio la riga è di nuovo «senza articolo, con newProduct».

**Create vs update** — La riga crea un articolo solo se `!line.variantId && line.newProduct` (goods-receipt-workflow.service.ts:623-625). Non c'è alcuna ricerca di un articolo già creato da un tentativo precedente: la decisione è solo «la riga porta una variante?».

**A · prima creazione** — ⚠️ DIPENDE DA UN CAMPO FACOLTATIVO. (a) Se `newProduct` porta SKU o barcode: BLOCCATO — `assertVariantSkuAvailableInTx` / `assertVariantBarcodeAvailableInTx` (quick-product-create.util.ts:122-123, 39-60, 63-84) trovano la variante creata e committata dal primo tentativo e sollevano ConflictException «SKU già presente a catalogo: …». Il throw avviene a riga 626 del workflow, DOPO `document.create` (:605) ma DENTRO la stessa transazione (:459): il rollback cancella anche il documento appena creato. Quindi nessun secondo documento, nessun numero, nessuna riga, nessun movimento, nessun lotto, nessuna anagrafica. (b) Se `newProduct` NON porta né SKU né barcode: ⛔ DUPLICA — `sku`/`barcode` normalizzati a NULL (:120-121, 25-33), i pre-check ritornano subito, e gli indici `product_variants_tenant_id_sku_key` / _barcode_key sono UNIQUE ordinari (migrations/0001_init/migration.sql:336), quindi Postgres ammette più NULL. Nasce un SECONDO Product + variante, con un secondo `articleCode` progressivo, e il commento del file lo dichiara: «Omonimi ammessi: il nome NON è univoco» (:21). Sopra questo si somma tutta la duplicazione della voce «caso base»: secondo documento, secondo numero, righe, movimenti, giacenza raddoppiata, e in più un SECONDO push prodotto verso i canali (`this.channelSync.enqueueProductPush(tenantId, created.productId)` per ogni elemento di createdProducts, :835-837) — cioè un articolo doppio anche sulla vetrina online.

**B · modifica** — Stesso comportamento del caso A per le RIGHE che creano articolo, perché la creazione non dipende da `dto.id` ma dalla riga: una riga aggiunta in modifica e priva di variantId ripete il ramo di creazione al reinvio. (a) con SKU/barcode: ConflictException e rollback dell'INTERA modifica (nessun effetto, ma nemmeno il salvataggio riesce). (b) senza SKU né barcode: nasce un secondo Product/variante e un secondo push prodotto; la riga documento invece si riconcilia (la riga creata al primo tentativo viene eliminata dalla `deleteMany` di :678-680 e ricreata), quindi il documento resta con UNA riga sola mentre a catalogo restano DUE articoli — il primo dei quali resta orfano, senza riga che lo citi. Movimenti: riconciliati per differenza (orfano eliminato con -qty a sync util :281-292, nuovo creato con +qty), giacenza netta corretta ma spostata sulla variante nuova, e la variante creata al primo tentativo resta con la sua giacenza a zero. Impegni: nessuno. Lotti: vedi voce lotti. Registri: nasce una DocumentRevision spuria perché `sync.deltas` non è vuoto (:804-806).

**Causa tecnica** — Il meccanismo protettivo è l'unicità di SKU e barcode a catalogo (pre-check in transazione + vincolo unico come ultima difesa): impedisce che nasca un secondo articolo con lo STESSO codice, e come effetto collaterale fa rollare indietro l'intero secondo salvataggio. Lascia possibile: la nascita di un secondo articolo quando SKU e barcode sono entrambi vuoti — che è un caso previsto e documentato («SKU facoltativo, specifica cliente §SKU», save-goods-receipt.dto.ts:22-29) — e con esso l'intera duplicazione documentale, perché in quel ramo non resta niente che fermi la transazione.

**Evidenza** — api/src/documents/goods-receipt-workflow.service.ts:620-655, 626, 835-837; api/src/products/quick-product-create.util.ts:25-33, 39-60, 63-84, 115-186; api/prisma/migrations/0001_init/migration.sql:336; api/src/documents/dto/save-goods-receipt.dto.ts:22-43; src/app/features/documents/goods-receipt-form.component.ts:4676-4678, 4712, 4719-4739, 4788-4792

#### 5. `POST /documents/goods-receipt/save → assertSerialNumbersForDocumentLines + applyInventorySerialsFromDocumentLines`

**Comando** — «Salvo un arrivo merce di articoli a numero seriale, digitando i seriali riga per riga». Salvo, la risposta si perde, risalvo.

**Il client manda** — LETTO. `serialNumbers: parseSerialNumbersText(line.serialNumbersText)` (goods-receipt-form.component.ts:4711); array di stringhe, max 500 (save-goods-receipt.dto.ts:183-188).

**Create vs update** — Come i lotti: seriali applicati SOLO alle righe con movimento nuovo (goods-receipt-workflow.service.ts:772-776). La validazione `assertSerialNumbersForDocumentLines` gira sulle stesse righe, PRIMA della scrittura (:774).

**A · prima creazione** — ✅ BLOCCATO, ma da una validazione di dominio, non da una protezione sul comando. Al reinvio le righe sono nuove → entrano in `createdLines` → `assertSerialNumbersForDocumentLines` interroga `tx.inventorySerial.findMany({ where: { tenantId, serialNumber: { in: allSerials } } })` senza filtro di stato né di riga (inventory-serial.util.ts:123-127) e trova i seriali scritti e committati dal primo tentativo (:220-228). Solleva UnprocessableEntityException «Seriali già presenti a magazzino: …» (:136-140). Essendo dentro la transazione (:459), rolla indietro anche il documento creato a :605: nessun secondo documento, nessun numero, nessuna riga, nessun movimento, nessun lotto, nessuna anagrafica riscritta. ⚠️ QUALE DUPLICAZIONE NON IMPEDISCE: solo le righe di articoli con `inventoryTracking === serial` alimentano il controllo (:106-108). Un arrivo senza articoli seriali non è toccato; e un arrivo MISTO viene bloccato per intero — cioè il comportamento cambia in base a un attributo dell'anagrafica, non alla natura del comando.

**B · modifica** — ✅ BLOCCATO nello stesso modo, con la stessa riserva. Reinvio puro di una modifica: `createdLines` vuoto → la validazione non gira e non c'è nulla da duplicare. Modifica che AGGIUNGEVA una riga seriale: al reinvio la riga del primo tentativo viene eliminata (:678-680) — i seriali NON vengono cancellati, la relazione è `onDelete: SetNull` (schema.prisma:2578) e restano `in_stock` con `documentLineId` null — poi la riga ricreata entra in `createdLines`, la validazione trova quei seriali e solleva 422. Effetto: la modifica non passa MAI (l'operatore resta bloccato finché non toglie i seriali), ma nessun dato si duplica perché il rollback annulla tutto. Impegni: nessuno. Registri: nessuna revisione, la transazione non arriva mai al commit.

**Causa tecnica** — Il meccanismo è l'unicità del seriale a magazzino (`@@unique([tenantId, serialNumber])`, schema.prisma:2577, più il controllo esplicito che la anticipa con un messaggio leggibile): impedisce che lo stesso numero seriale entri due volte in stock, e come effetto collaterale fa fallire l'intero secondo salvataggio. Lascia possibile: tutte le duplicazioni della voce «caso base» per ogni riga NON seriale — e poiché il controllo è per riga ma il fallimento è per documento, l'esito dipende dalla merce che l'arrivo contiene, non da come è stato inviato. Non è quindi una garanzia sul comando: è una garanzia sul seriale.

**Evidenza** — api/src/inventory/inventory-serial.util.ts:88-141 (lettura senza filtri a :123-127, throw a :136-140), 200-231; api/prisma/schema.prisma:2561-2583 (@@unique a :2577, onDelete: SetNull a :2578); api/src/documents/goods-receipt-workflow.service.ts:459, 605, 678-680, 772-777

#### 6. `POST /documents/goods-receipt/save → resolveDocumentNumber con requestedNumber`

**Comando** — «Scrivo io il numero in testata» (o accetto il numero proposto dal dialogo di conflitto) e salvo. La risposta si perde, risalvo.

**Il client manda** — LETTO. `number: this.requestedDocumentNumber()` = `numbering.imposedNumber()`, che restituisce il numero SOLO se non è più una proposta (document-numbering.store.ts:235-240; goods-receipt-form.component.ts:4611-4626, 4667). Dopo il dialogo di conflitto il numero proposto diventa una scelta e viaggia (`numbering.onNumberChange(nuovo)`, :4530-4541).

**Create vs update** — Sempre e solo `dto.id`. Ma quando `number` è presente il ramo automatico cambia: niente `lockDocumentCounter` e `resolveDocumentNumber` restituisce il numero imposto tale e quale (goods-receipt-workflow.service.ts:530-539; document-numbering.util.ts:384-399).

**A · prima creazione** — ✅ BLOCCATO dal vincolo unico — e va detto cosa blocca esattamente. Il primo tentativo ha scritto (tenant, tipo, serie, numero); il reinvio riporta lo STESSO numero, quindi `document.create` (:605) viola l'indice parziale `documents_number_unique` (NULLS NOT DISTINCT, WHERE number IS NOT NULL — migrations/20260811090000_numero_unico_per_numeratore/migration.sql:29-43). Il P2002 viene intercettato da `throwNumberConflict` (:183-193, 202-241) e diventa un 409 con il numero rifiutato e il primo libero. La transazione rolla indietro: nessun secondo documento, nessuna riga, nessun movimento, nessun lotto, giacenza intatta, anagrafica intatta. ⛔ MA IL BLOCCO NON REGGE ALLA PRESSIONE SUCCESSIVA: la maschera reagisce al 409 aprendo il dialogo, che SCRIVE IN TESTATA IL NUMERO NUOVO e lascia all'operatore la pressione di Salva (:4519-4523, 4530-4541). Alla pressione successiva il numero è diverso, il vincolo non scatta più, e nasce il secondo documento con tutti gli effetti della voce «caso base». Il vincolo impedisce due documenti CON LO STESSO NUMERO; non impedisce un secondo documento, e il percorso che l'operatore vede lo guida proprio verso quello. ⚠️ Va aggiunto che l'operatore, davanti a un avviso «numero già preso», non ha modo di distinguere «il mio salvataggio è passato e questa è la sua eco» da «un collega ha preso il mio numero»: il messaggio è lo stesso.

**B · modifica** — ✅ RICONCILIATO. In modifica il numero non viene riassegnato affatto: `let number = existing?.number ?? null` e il blocco di assegnazione è saltato quando è già valorizzato (:527-529); `headerData` riscrive lo stesso numero su se stesso (:557), quindi l'indice unico non è violato. Nessun secondo record, nessun secondo numero, righe/movimenti/lotti come nel caso base in modifica.

**Causa tecnica** — Il meccanismo è l'indice unico parziale sul numero documento. Impedisce: la nascita di due documenti con lo stesso (tenant, numeratore, serie, numero) — quindi impedisce la duplicazione SOLO nella forma in cui il duplicato porterebbe lo stesso numero. Lascia possibile: (a) tutta la duplicazione quando il numero NON è imposto, perché il secondo tentativo prende il primo libero successivo e non collide (è il caso normale della maschera, dato che `imposedNumber()` restituisce undefined per la proposta); (b) la duplicazione al gesto immediatamente successivo, perché il rimedio offerto all'operatore è cambiare numero e riprovare.

**Evidenza** — api/src/documents/goods-receipt-workflow.service.ts:147-195 (throwNumberConflict a 183-193), 202-241, 527-552, 557, 605; api/src/documents/document-numbering.util.ts:338-341, 366-377, 384-399; api/prisma/migrations/20260811090000_numero_unico_per_numeratore/migration.sql:29-43; api/prisma/schema.prisma:2161-2163 (commento che dichiara l'indice parziale); src/app/features/documents/goods-receipt-form.component.ts:4519-4523, 4530-4541, 4611-4626, 4667; src/app/domain/documents/state/document-numbering.store.ts:235-240

#### 7. `POST /documents/goods-receipt/save con dto.id valorizzato`

**Comando** — «Riapro un arrivo merce già salvato, cambio una quantità (o una data, o la causale) e risalvo». La risposta si perde, risalvo di nuovo.

**Il client manda** — LETTO. `id` della testata da `persistedDocumentId()` = `editDocumentId()` (dal parametro di rotta, :410) — quindi presente e STABILE anche se la risposta si perde, perché viene dall'URL e non dalla risposta. Le righe portano il proprio `id` (:4680), letto all'apertura del documento.

**Create vs update** — `dto.id` presente ⇒ `existing` letto in transazione (:461-465) e ramo `tx.document.update` (:602). Le righe: `incomingIds` = id inviati che appartengono davvero al documento (:673-676); tutto ciò che è nel documento e non è negli incomingIds viene ELIMINATO (:678-680).

**A · prima creazione** — Non applicabile: il comando nasce con un id. (Se però l'operatore avesse aperto la maschera in creazione, salvato con successo e la navigazione a /edit non fosse avvenuta, ricadrebbe nel caso A della prima voce — ma la navigazione `router.navigate([...,'edit'], {replaceUrl:true})` sta nello stesso ramo `next` che imposta `loadedDocument`, :4508-4511, quindi i due stati non divergono.)

**B · modifica** — ✅ PROTETTO NEL REINVIO PURO, con due eccezioni misurate. Reinvio identico: secondo record NO (update), secondo numero NO (:527-529), righe duplicate NO (update per id), movimenti duplicati NO (ritrovati per `sourceLineId`, delta 0, `needsUpdate` falso — sync util :176, 216, 246-257), impegni nessuno, lotti NO (`createdLineIds` vuoto ⇒ :772-777 non parte), anagrafica riscritta con assegnazioni (nessuno storico), registri NO (`sync.deltas` vuoto ⇒ nessuna DocumentRevision a :804-806; `totalsChanged` falso ⇒ nessun `totalsCheckPending` a :811-824), push canale con `syncTargets` vuoto. ⚠️ ECCEZIONE 1 — la modifica AGGIUNGEVA una riga: la riga creata al primo tentativo ha un id che il client non conosce, quindi al reinvio non è in `incomingIds` e viene ELIMINATA (:678-680), il suo movimento diventa orfano e viene cancellato con -qty (sync util :281-292), poi la riga viene ricreata con +qty. La giacenza e il ricevuto ordine tornano corretti, ma restano tre scorie: il LOTTO è stato incrementato due volte e mai decrementato (vedi voce lotti); nasce una DocumentRevision spuria con `sku +q, sku -q` perché `sync.deltas` non è vuoto (:804-806, 1354-1377); gli eventuali seriali della riga eliminata restano in stock con `documentLineId` null (onDelete: SetNull) e fanno fallire il reinvio con 422. ⚠️ ECCEZIONE 2 — la modifica aggiungeva una riga con `newProduct` senza SKU né barcode: al reinvio nasce un secondo articolo a catalogo e un secondo push prodotto, mentre il documento resta con una riga sola (vedi voce articolo nuovo).

**Causa tecnica** — Il meccanismo è deliberato ed è la disciplina «un movimento per riga»: `@@unique([sourceDocumentType, sourceLineId])` (schema.prisma:930) più l'upsert per id riga e la riconciliazione per differenza del sync. Impedisce: il doppio carico della stessa riga, il movimento accodato invece che aggiornato, il ricevuto ordine sommato due volte, la revisione spuria sul reinvio puro. Lascia possibile: tutto ciò che riguarda una RIGA il cui id il client non ha ancora imparato — l'incremento ripetuto del lotto, la creazione ripetuta dell'articolo senza codici, la revisione spuria — perché la protezione è ancorata all'id di riga e quell'id è precisamente ciò che una risposta persa non consegna.

**Evidenza** — api/src/documents/goods-receipt-workflow.service.ts:461-465, 527-529, 602, 673-680, 713-717, 759-777, 804-806, 811-824, 1354-1377; api/src/documents/document-goods-receipt-sync.util.ts:155-159, 176, 210-236, 246-257, 281-292; api/prisma/schema.prisma:930, 2578; src/app/features/documents/goods-receipt-form.component.ts:410, 4508-4511, 4680, 4801

#### 8. `PATCH /documents/:id → DocumentsService.update (documents.service.ts:1432); transazione unica aperta a :1784`

**Comando** — «Salva documento» su una maschera aperta in MODIFICA di un documento esistente. Stessi nove tipi del comando 1, con due esclusioni: Trasferimento e Rettifica GIÀ CONFERMATI non passano di qui (il client li manda a transfer/save e adjustment/save — transfer-form.component.ts:1502, e il server li rifiuterebbe comunque, :1518).

**Il client manda** — Testata + righe, con l'id del documento nella rotta e — punto decisivo — l'ID DI OGNI RIGA GIÀ SALVATA: `id: line.id || undefined` con line.id valorizzato dal caricamento del documento (sales-document-form.component.ts:2225; stock-operation-form.component.ts:1658-1662 mostra dove l'id viene ripescato dal documento). Il `number` viaggia SEMPRE in modifica, anche se è quello che il documento ha già (sales-document-form.component.ts:2144-2148). Nessun Idempotency-Key, nessun numero di versione, nessun ETag.

**Create vs update** — Lo decide il client con il verbo e con la presenza di `editId`. Il server, ricevuto il PATCH, non deve distinguere nulla: l'id è nella rotta. La distinzione che conta qui è un'altra, ed è RIGA per RIGA, dentro `persistDocumentLinesByIdTx` (document-line-upsert.util.ts:31-98): riga con id noto → update in posto; riga senza id → create; id presente sul documento ma non rimandato → delete; id sconosciuto o ripetuto → 422 prima di scrivere qualsiasi cosa (:55-66).

**A · prima creazione** — NON APPLICABILE a questo comando: il PATCH porta sempre un id nella rotta e non può creare un documento. Se l'id non esiste più, `getById` (:1438 → :851-853) solleva NotFoundException — 404, nessun record creato per ripiego.

**B · modifica** — RICONCILIA PER DIFFERENZA — con due residui, che non sono duplicazioni di dati né di magazzino ma vanno nominati.

• SECONDO RECORD DOCUMENTALE: no. `tx.document.update` su un id fisso (:2076).

• SECONDO NUMERO CONSUMATO: no. Il numero si riscrive solo se cambia davvero: `numberChanged = dto.number !== undefined && dto.number !== doc.number` (:1673). Al reinvio identico, dopo il primo commit `doc.number` è già quello mandato, quindi `numberChanged` è falso e la colonna non si tocca. Nessun `nextNumber` esiste nel percorso di update.

• RIGHE DUPLICATE: no, ed è verificato da un test dedicato — «salvare due volte lo stesso documento non duplica né ricrea nulla» (documents.service.spec.ts:1858-1874), che asserisce `documentLine.create` e `documentLine.deleteMany` mai chiamati.
⚠️ Il sottocaso che sembra rompere e non rompe: se il PATCH conteneva una riga NUOVA (senza id) e la risposta si perde, il reinvio manda di nuovo quella riga senza id. Al secondo giro la riga creata dal primo (L2) non è più «reclamata», quindi finisce in `removedIds` e viene CANCELLATA (:69-74), mentre la riga senza id viene ricreata (L3). Il documento resta con lo stesso numero di righe: non si duplica. Il residuo è che l'IDENTITÀ della riga cambia (L2→L3) a ogni reinvio.

• MOVIMENTI FISICI DUPLICATI: no. `syncUnloadLineMovements` gira a :2121, dopo la persistenza delle righe, e lavora sui movimenti già esistenti del documento indicizzati per `sourceLineId` (document-stock-unload-sync.util.ts:169-180): a reinvio identico `needsUpdate` è falso (:254-262) e la giacenza non si muove di un pezzo. Nel sottocaso della riga senza id sopra, il movimento di L2 finisce nel giro degli orfani (:277-287) che RESTITUISCE la giacenza, mentre L3 ne crea uno nuovo che la toglie: delta netto zero. Per lo Scarico manuale la riconciliazione è a delta per variante (`reconcileDocumentStockManualUnload`, :1860): a payload identico i delta sono zero.

• IMPEGNI DUPLICATI: no. Al secondo PATCH `syncIncludedSalesOrdersTx` (:1311) trova gli ordini già agganciati a QUESTO documento, quindi `toLink` e `toUnlink` sono vuoti: no-op. `concludeLinkedManualOrderTx` (:2102) rilegge solo gli ordini con `fulfilledAt: null` (:3166-3173) e, sui parzialmente evasi che ripassano, `consumeReservationTx` non consuma nulla perché l'impegno non è più `active` (stock-reservation.service.ts:157-163).

• LOTTI DUPLICATI: non applicabile — vedi comando 1, il percorso generico non scrive InventoryLot.

• AGGIORNAMENTI ANAGRAFICI RIPETUTI: nessuno. L'update non tocca prezzi articolo né listini fornitore.

• EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: i totali si ricalcolano dalle stesse righe e danno lo stesso risultato (:1738-1742). ⚠️ RESIDUO: `recordRevision` (:2201) scrive una riga NUOVA in `document_revisions` a ogni PATCH su documento confermato, con `revisionNumber` = ultimo + 1 (:2967-2982). Un reinvio identico produce quindi una SECONDA revisione con lo stesso contenuto: è un record di audit duplicato, e nella cronologia del documento l'operatore vede due modifiche dove ne ha fatta una.

• I SERIALI reggono: `restoreConsumedSerialsForDocument` sugli id vecchi (:1790) precede il riconsumo sugli id nuovi (:2151-2157), quindi il seriale non resta né orfano né consumato due volte.

**Causa tecnica** — Il meccanismo che protegge è la RICONCILIAZIONE PER DIFFERENZA su un id stabile, a due livelli: la riga si ritrova per `DocumentLine.id` (document-line-upsert.util.ts:31-98) e il movimento si ritrova per `StockMovement.sourceLineId`, con l'unicità imposta dal database (`@@unique([sourceDocumentType, sourceLineId])`, schema.prisma:930). Impedisce quindi: righe duplicate, movimenti duplicati, doppio scarico o doppio carico di giacenza, doppio consumo di impegni, secondo numero.

Ciò che NON impedisce, e va detto per non far passare «protetto» dove non lo è:

1. **Una seconda riga in `document_revisions` a ogni reinvio** (:2201). Non c'è nessuna guardia sul contenuto: `recordRevision` scrive sempre. Il registro delle revisioni conta i SALVATAGGI ARRIVATI, non le modifiche fatte.
2. **La rotazione dell'identità delle righe nuove.** Una riga mandata senza id viene cancellata e ricreata con un id diverso a ogni reinvio. Il saldo torna, ma tutto ciò che si appende alla riga (il movimento, il seriale via `InventorySerial.documentLineId`) viene staccato e riattaccato — ed è la stessa causa radice che `docs/09-specifica-movimenti-per-riga.md` §3 ha già misurato altrove.
3. **La lettura fuori transazione.** `getById` sta a :1438, la transazione apre a :1784, e non c'è né SELECT FOR UPDATE né un update condizionato su una versione. Due PATCH davvero SOVRAPPOSTI (doppio clic, non reinvio dopo commit) leggono lo stesso stato di partenza. Lì il freno non è una guardia ma l'indice unico su `sourceLineId`, che fa fallire uno dei due — un errore, non una riconciliazione.
4. Il PATCH generico si rifiuta di riconciliare i documenti con movimenti per riga mantenuti altrove (:1514-1522, ConflictException): non è idempotenza, è una porta chiusa che manda il comando al percorso dedicato.

**Evidenza** — documents.controller.ts:435-444 · documents.service.ts:851-853, 1432, 1438, 1514-1522, 1673, 1738-1742, 1784, 1786, 1790, 1860, 2068, 2076, 2102, 2121, 2151-2157, 2201, 2967-2982, 3166-3173 · document-line-upsert.util.ts:31-98 (in particolare 55-66, 69-74, 89-97) · document-stock-unload-sync.util.ts:169-180, 254-262, 277-287 · document-stock-manual-unload.util.ts:52-60 · stock-reservation.service.ts:157-163 · documents.service.spec.ts:1858-1874 · prisma/schema.prisma:930 · src/app/features/documents/sales-document-form.component.ts:2144-2148, 2225 · src/app/features/documents/transfer-form.component.ts:1502

#### 9. `POST /documents/:id/cancel → DocumentsService.cancel (documents.service.ts:2576); transazione a :2637`

**Comando** — «Annulla documento»: l'operatore annulla un documento già salvato. Ammesso su tutti i tipi del percorso tranne Vendita/Reso al banco (rifiutati, :2585) e Scarico manuale (rifiutato per scelta esplicita, :2593).

**Il client manda** — Solo l'id nella rotta. Nessun corpo (documents.controller.ts:458-466). Nessun identificatore del comando.

**Create vs update** — Non si pone: agisce su un id esistente e ne cambia lo stato. Non crea nulla.

**A · prima creazione** — Non applicabile: non crea documenti.

**B · modifica** — IL REINVIO SEQUENZIALE È BLOCCATO. Dopo il commit del primo annullamento lo stato è `cancelled` (:2862-2865) e il secondo comando incontra `if (doc.status === DocumentStatus.cancelled)` a :2598 → ConflictException «Il documento è già annullato.». Non si esegue quindi due volte lo storno dei movimenti (`syncUnloadLineMovements` con righe vuote, :2687-2700, o `syncGoodsReceiptLineMovements`, :2648-2660), non si riapre due volte l'ordine cliente (`reopenLinkedManualOrderTx`, :2841), non si ricreano due volte gli impegni, non si scrive una seconda revisione (:2676/:2714/:2763/:2822). Nessun record nuovo, nessun numero.

⚠️ SCENARIO DIVERSO, non coperto: due richieste di annullamento SOVRAPPOSTE (doppio clic con entrambe in volo). `getById` legge a :2576-2577, cioè FUORI dalla transazione che apre a :2637, e l'update finale è incondizionato (`tx.document.update({ where: { id } … })`, :2862) — nessun `SELECT FOR UPDATE`, nessun `updateMany` condizionato sullo stato. Sotto READ COMMITTED entrambe le richieste possono leggere `confirmed` e superare la guardia. Non è lo scenario «commit → risposta persa → reinvio» dichiarato, ma è una delle forme di doppio invio nominate nel requisito.

**Causa tecnica** — IMPEDISCE: la ripetizione dello storno su un documento già annullato, perché lo stato annullato è persistito nella stessa transazione degli storni (:2862-2865) e la guardia lo legge prima di scrivere (:2598).

LASCIA POSSIBILE: (a) l'esecuzione doppia in caso di richieste sovrapposte, perché la lettura dello stato sta fuori dalla transazione e l'aggiornamento non è condizionato — la guardia protegge dal reinvio, non dalla concorrenza; (b) — e vale la pena dirlo perché è la simmetria del comando 1 — annullare il documento duplicato NON è un rimedio automatico: va fatto a mano, e sullo Scarico manuale non è nemmeno possibile (:2593), dove il duplicato si può solo eliminare senza che le giacenze tornino.

**Evidenza** — documents.controller.ts:458-466 · documents.service.ts:2576-2577, 2585, 2593, 2598-2600, 2637, 2648-2660, 2676, 2687-2700, 2714, 2763, 2822, 2841, 2853-2856, 2862-2865

#### 10. `POST /manual-receipts → ManualReceiptsService.create · PATCH /manual-receipts/:id → ManualReceiptsService.update — entrambi confluiscono nello stesso metodo privato save()`

**Comando** — Compila il Corrispettivo manuale (data, sede, righe Importo + Codice IVA, note) e preme «Salva corrispettivo».

**Il client manda** — LETTO. Il corpo intero a ogni salvataggio (SaveManualReceiptDto): documentDate, locationId, pricesIncludeVat, notes, lines[] con description/amountMinor/vatCodeId. Le righe NON portano id — SaveManualReceiptLineDto non ha il campo (dto:26-57). Non viaggiano numero né serie, e il DTO lo dichiara (dto:66-70). Nessun Idempotency-Key, nessun id di richiesta, nessun hash del contenuto. Timeout client 15 s (manual-receipt.service.ts:13) e nessun retry RxJS.

**Create vs update** — LETTO. Solo dal verbo HTTP, scelto lato CLIENT dal signal receiptId(): `const request = id ? this.manualReceipts.update(id, body) : this.manualReceipts.create(body)` (manual-receipt-form.component.ts:725-726). receiptId() nasce dal parametro di rotta (:147) e viene valorizzato SOLO dentro il next del salvataggio riuscito (:744). Lato server save() decide sul solo `id === null` (manual-receipts.service.ts:217-231): il server non ha nessun altro modo di riconoscere che il corpo che sta ricevendo è già stato registrato.

**A · prima creazione** — VULNERABILE — stessa forma già accertata su store-sales. (1) SECONDO RECORD DOCUMENTALE: sì. Il ramo di creazione arriva a `tx.manualReceipt.create` (:278) senza alcuna ricerca di una registrazione equivalente: nessun confronto su (data, sede, totale, righe), nessuna finestra temporale, niente. (2) SECONDO NUMERO CONSUMATO: sì, e i due record portano numeri DIVERSI. `nextDocumentNumber` (:269) è «il primo numero libero dopo il massimo dei documenti di data anteriore» (document-numbering.util.ts:338-341 e 134-142 per il ramo manual_receipt, 172-240 per il primo libero): il primo salvataggio ha preso m+1, al reinvio m+1 risulta occupato, la query scavalca la corsa dei contigui e restituisce m+2. Ne discende un fatto importante: il vincolo `@@unique([tenantId, series, number])` (schema.prisma:2710) NON PUÒ scattare, perché i due numeri sono distinti per costruzione. (3) RIGHE DUPLICATE: sì — l'intero blocco `lines: { create: … }` (:288) viene riscritto sotto il secondo id. (4) MOVIMENTI FISICI: nessuno, né la prima né la seconda volta — l'entità non tocca il magazzino per definizione (:79-105 e dto:20-25), e c'è una prova che lo presidia (service.spec.ts:148-166). (5) IMPEGNI: nessuno. (6) LOTTI: nessuno. (7) AGGIORNAMENTI ANAGRAFICI: nessuno — i Codici IVA si leggono soltanto (:355-391). (8) EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: sì, ed è qui che il doppione si vede. Il Corrispettivo manuale ENTRA nel Registro Corrispettivi come quarta sorgente: l'elenco lo legge con `manualReceipt.findMany` (corrispettivi.service.ts:394) e ne fa una riga `manual:<id>` (:535-566) → DUE righe distinte in elenco; il riepilogo lo rilegge con lo stesso where (:672) e lo accumula (:770), e l'accumulatore somma subtotalMinor + taxMinor + totalMinor di OGNI registrazione (corrispettivi-totals.util.ts:136-143) contandola in orderCount (:153-154) → DUE registrazioni nei totali, importo raddoppiato, conteggio +2, e la giornata sballata anche nei subtotali per giorno (:271-290). Lo stesso dataset alimenta l'export per il commercialista: lista ed export chiamano entrambi buildRegisterRows (corrispettivi.service.ts:232 e corrispettivi-export.service.ts:279), quindi il doppione esce anche in CSV/XLS/PDF. Il filtro non deduplica: è solo periodo + sede + testo (corrispettivi-query.util.ts:431-462).

**B · modifica** — PROTETTO, e con una prova già scritta. Il ramo di modifica opera su `where: { id: existing.id }` (:252). (1) Nessun secondo record — test «la modifica aggiorna lo STESSO record: non ne crea un secondo» (service.spec.ts:200). (2) Nessun secondo numero: il blocco lock + numerazione (:262-276) sta nel ramo else, e l'oggetto `header` (:235-243) non contiene né number né series. (3) Righe: `deleteMany` + ricreazione integrale (:251-254) — non si accodano, il conteggio resta identico. Cambia però l'uuid di OGNI riga a ogni salvataggio: i lines[].id del DTO non sono stabili. Oggi nessuno li referenzia — nessun movimento, nessun impegno, nessun collegamento documentale — ed è esattamente ciò che il commento :248-250 dichiara come condizione. (4-6) Nessun movimento, impegno o lotto, prima o dopo (service.spec.ts:157-166). (7) Nessuna scrittura anagrafica. (8) I totali si RISCRIVONO dallo stesso input, non si sommano (:232-243): il Registro continua a vedere una riga e a contarla una volta. Reinviare lo stesso PATCH è quindi riconciliazione per differenza vera, non semplice assenza di crescita. DEDOTTO, e resta scoperto: non c'è controllo di versione né updatedAt atteso, quindi due PATCH sovrapposti si sovrascrivono — perdita di aggiornamento, non duplicazione.

**Causa tecnica** — Lato client l'unico meccanismo è la guardia in-flight `if (this.saving()) return` (manual-receipt-form.component.ts:685): impedisce il secondo clic mentre la richiesta è in volo, nella stessa scheda, e nient'altro. Non copre lo scenario in mandato — al timeout di 15 s lo stato passa a error (:753), saving() torna falso, receiptId() è ancora null e Salva riparte con un POST. Esiste una seconda strada allo stesso esito: dirtySinceLastSave viene azzerato solo nel next (:742), quindi dopo un timeout l'uscita apre il dialogo e «Salva e chiudi» (:874) rifà lo stesso POST. Lato server l'advisory lock sul contatore (:268 → document-numbering.util.ts:366-377) impedisce che due salvataggi contemporanei prendano lo STESSO numero: serializza e garantisce a ciascuno un numero valido — cioè impedisce la collisione di numerazione e NON la nascita del secondo record; anzi è ciò che la rende pulita e priva di errori. Il 409 di isDocumentNumberConflict (:295-304) dice «Riprova a salvare» ed è corretto lì, perché in quel percorso la transazione è annullata. In modifica la protezione non è una guardia ma la struttura stessa: un where su un id già noto.

**Evidenza** — api/src/manual-receipts/manual-receipts.service.ts:143-163 (create/update), :187-307 (save), :217-231, :245-306, :251-254, :262-291, :295-304, :355-391; api/src/manual-receipts/manual-receipts.controller.ts:70-89; api/src/manual-receipts/dto/save-manual-receipt.dto.ts:26-57, :60-103; api/src/documents/document-numbering.util.ts:134-142, :172-240, :338-341, :366-377; api/prisma/schema.prisma:2661-2714 (:2710 vincolo unico); api/src/corrispettivi/corrispettivi.service.ts:232, :301-311, :394-411, :535-566, :672-681, :770; api/src/corrispettivi/corrispettivi-totals.util.ts:136-154, :271-290; api/src/corrispettivi/corrispettivi-query.util.ts:431-462; api/src/corrispettivi/corrispettivi-export.service.ts:216, :279; src/app/features/reports/pages/manual-receipt-form/manual-receipt-form.component.ts:147, :162, :684-755, :874; src/app/features/reports/services/manual-receipt.service.ts:13, :46-53; api/src/manual-receipts/manual-receipts.service.spec.ts:148-218.

#### 11. `POST /inventory/movements/batch → InventoryService.registerMovementBatch`

**Comando** — Dal form «Registra movimento» sceglie il tipo (Carico / Scarico / Trasferimento / Rettifica), la sede, le righe articolo, e conferma nel dialogo di riepilogo.

**Il client manda** — LETTO. RegisterMovementBatchInput: type, operationDate, locationId, targetLocationId, reason, partyId/partyName e lines[] con variantId più — a seconda del tipo — `quantity` (carico/scarico/trasferimento) OPPURE `newOnHand`, cioè la giacenza VOLUTA, assoluta (rettifica) — movement-form.component.ts:576-585. Nessun id di richiesta, nessun id di riga, nessun Idempotency-Key. Timeout 15 s (src/app/domain/inventory/services/inventory.service.ts:109, :342-347).

**Create vs update** — Non lo distingue affatto: non esiste un PATCH di un movimento registrato. Ogni invio è una creazione (inventory.controller.ts:258-266).

**A · prima creazione** — Dipende dal TIPO, ed è la distinzione che conta. • CARICO / SCARICO / TRASFERIMENTO: VULNERABILE. Il delta è preso dalla riga (`quantity`) e applicato con increment atomico (inventory-level-delta.util.ts:34-37), poi si crea uno stockMovement per riga (inventory.service.ts:580-601). Al reinvio: MOVIMENTI FISICI DUPLICATI, uno in più per riga — e i movimenti manuali non portano sourceLineId (la colonna resta nulla), quindi il vincolo `@@unique([sourceDocumentType, sourceLineId])` di schema.prisma:930 non è nemmeno in gioco; GIACENZA spostata DUE volte (e sulla destinazione del trasferimento pure); nessun record documentale e nessun numero consumato (i movimenti manuali non ne hanno); nessun impegno, nessun lotto per questa via; nessun aggiornamento anagrafico; effetti economici indiretti: il push inventario verso i canali riparte (:611-620) e pubblica su Shopify/TikTok la quantità sbagliata. • RETTIFICA: PROTETTO per costruzione — la riga porta la giacenza voluta, il delta si calcola contro la giacenza LETTA in quel momento dentro la transazione (:551-556) e al reinvio vale zero: `continue`, nessun movimento, nessuna variazione, risposta `{ created: 0 }`.

**B · modifica** — Non applicabile: un movimento registrato non si modifica da questo percorso — nel controller non esiste alcun PATCH/PUT su /inventory/movements (inventory.controller.ts:258-286), e la correzione avviene registrando un ALTRO movimento, che è un evento nuovo e non un reinvio. Per la sola rettifica il reinvio dello stesso corpo si comporta di fatto come un caso B e si riconcilia per differenza (delta zero).

**Causa tecnica** — La protezione della rettifica NON è un meccanismo di idempotenza: è la semantica del valore ASSOLUTO. Impedisce la duplicazione dell'effetto (la giacenza finisce comunque a `newOnHand`) e, per la stessa ragione, non saprebbe distinguere un reinvio da un secondo intento volontario — che però su una rettifica coincidono. Non impedisce il movimento in più quando fra i due invii qualcun altro ha mosso quella variante: lì il secondo invio riporta la giacenza al valore voluto e genera un movimento nuovo, che è corretto ma indistinguibile da un doppione. Per carico/scarico/trasferimento non esiste NESSUNA difesa lato server; lato client c'è solo la guardia in-flight `if (this.saving()) return` (movement-form.component.ts:559-561), che al timeout chiude il dialogo, mostra l'errore e lascia il pulsante di nuovo attivo (:601-604).

**Evidenza** — api/src/inventory/inventory.controller.ts:258-286; api/src/inventory/inventory.service.ts:488-624 (:518 transazione, :551-556 delta rettifica, :562-576 delta additivo, :580-601 create, :611-620 push); api/src/inventory/inventory-level-delta.util.ts:16-37; api/prisma/schema.prisma:904, :930; src/app/features/inventory/movement-form.component.ts:549-604; src/app/domain/inventory/services/inventory.service.ts:109, :342-347.

#### 12. `Maschera store-sale-register → POST /store-sales (StoreSalesService.createSale) · POST /store-sales/returns (createReturn) — src/app/features/store-sales/services/store-sales.service.ts:36-47`

**Comando** — Vendita al banco / Reso al banco: l'operatore scansiona, preme «Concludi vendita» (o «Concludi reso») e conferma nel dialogo

**Il client manda** — LETTO. Corpo con `id: this.editDocumentId() ?? undefined` (store-sale-register.component.ts:1176 vendita, :1295 reso) e righe con `id: line.serverLineId ?? undefined` (:1185, :1300). `editDocumentId` è SOLO un computed sul parametro di rotta `:id` (:351): nulla lo scrive mai a runtime. Nessun identificativo generato dal client entra nel payload: `nuovoIdRiga()` (:101-104) produce `nuova-N`, un contatore di sessione dichiarato esplicitamente come id di sola UI (:124-129) e mai spedito. Nessun header di idempotenza. Timeout 15000 ms (store-sales.service.ts:17,38,44).

**Create vs update** — LETTO. Solo dalla presenza di `id` nel corpo, e quell'id viene esclusivamente dall'URL. La maschera NON naviga mai verso il documento appena creato: l'unico `router.navigate` è `goToList()` (:391), usato dallo stato «non disponibile». Quindi dopo una creazione riuscita la rotta resta /new e `editDocumentId()` resta null.

**A · prima creazione** — (a) Doppio clic PROTETTO: `canConcludeSale` include `!salePending()` (:538) e il pulsante è `[disabled]="!canConcludeSale()" [loading]="salePending()"` (html:372-373); il dialogo di conferma ha `[busy]="salePending()"` (html:385) e confirm-dialog disabilita entrambi i pulsanti su busy (shared/components/confirm-dialog/confirm-dialog.component.html:14,22-24 → button.component.html:12 `[disabled]="disabled() || loading()"`); in più `concludeSale` riguarda `if (!locationId || this.salePending()) return;` (:1164-1167) e `salePending.set(true)` è sincrono prima della POST (:1169). Il reso è speculare (:566, :1281, html:512-514,525).
(b) Al fallimento il contenuto SOPRAVVIVE: il ramo `error` tocca solo `salePending`, `saleConfirmOpen` e `saleError` (:1217-1221) — il carrello resta intero. Il messaggio generico è «Operazione non riuscita. Riprova.» (:1387-1390) e su TimeoutError è quello che l'operatore legge, perché il `timeout()` sta nel service, a valle dell'errorInterceptor, quindi non passa dalla mappatura HTTP. L'operatore può ripremere subito.
(c) L'id NON viene memorizzato: `editDocumentId` è solo di rotta, non c'è navigazione dopo la create e nulla scrive l'id ricevuto. `lastSaleResult.set(result)` (:1209) conserva la ricevuta, non l'id per il payload. DEDOTTO ma diretto: dopo un salvataggio riuscito il carrello si svuota (`this.cart.set([])`, :1210) e `canConcludeSale` richiede `cart().length > 0`, quindi un secondo Salva con lo STESSO contenuto è impossibile — per rimandarlo l'operatore deve riscansionare, cioè esprimere un intento nuovo. Il reinvio pericoloso è quindi solo quello dopo un ERRORE/TIMEOUT: carrello intatto, `id` ancora assente, secondo comando identico = seconda creazione.

**B · modifica** — In modifica la rotta porta `:id`, quindi `editDocumentId()` è sempre valorizzato e l'`id` viaggia in ogni invio; le righe caricate portano `serverLineId` (patchFromDocument, :412-415, con il commento :393-398 che dichiara perché l'id del server va conservato). Reinviare lo stesso comando è quindi un update dello stesso documento: nessun secondo Document, nessun secondo numero. NON verificato lato server in questa famiglia (fuori perimetro), ma lato client il comando reinviato è identico e indirizzato allo stesso record. Nota: anche in modifica il ramo `next` svuota il carrello (:1210), quindi dopo un salvataggio riuscito un ulteriore Salva è comunque bloccato da `canConcludeSale`.

**Causa tecnica** — Il meccanismo impedisce (1) il doppio clic prima della risposta — segnale `salePending` messo a true in modo sincrono, guardia in testa al metodo, pulsante e dialogo disabilitati; (2) la ripetizione dopo un salvataggio RIUSCITO, perché il carrello si svuota e la condizione di abilitazione cade. NON impedisce il reinvio dopo risposta persa/timeout: `salePending` torna false, il carrello resta intero e `editDocumentId` non è mai stato scritto, quindi il secondo comando è identico al primo ma senza `id` = seconda creazione. È il percorso già accertato lato server.

**Evidenza** — src/app/features/store-sales/store-sale-register.component.ts:101-104,351,516,538,546,566,1164-1176,1185,1207-1221,1281-1300,1310-1320,1387-1390; src/app/features/store-sales/store-sale-register.component.html:372-374,381-387,512-514,521-527; src/app/features/store-sales/services/store-sales.service.ts:17,36-47; src/app/shared/components/confirm-dialog/confirm-dialog.component.html:14,22-24; src/app/shared/components/button/button.component.html:12

#### 13. `Maschera goods-receipt-form → POST /documents/goods-receipt/save (DocumentService.saveGoodsReceipt) — src/app/domain/documents/services/document.service.ts:208-227`

**Comando** — Arrivo merce: l'operatore compila testata e righe e preme «Salva documento» (o Ctrl/Cmd+S, o «Salva e chiudi» dal dialogo di uscita)

**Il client manda** — LETTO. `buildSaveGoodsReceiptBody()` mette `id: this.persistedDocumentId() ?? undefined` (goods-receipt-form.component.ts:4646) dove `persistedDocumentId()` = `this.editDocumentId() ?? this.loadedDocument()?.id` (:4596-4597). Righe con `id: line.id || undefined` (:4680). Numero solo se imposto (`requestedDocumentNumber()`, :4622-4624). Nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms (document.service.ts:34,221).

**Create vs update** — LETTO. Presenza di `id` nel corpo, con DUE fonti: il parametro di rotta e — fondamentale — il signal `loadedDocument`, scritto in modo SINCRONO nel ramo `next` (`this.loadedDocument.set(doc)`, :4498 e :3928) prima di qualunque navigazione. È l'unica maschera documentale del gruppo che non dipende dal router per ricordare l'id.

**A · prima creazione** — (a) Doppio clic PROTETTO, con due meccanismi indipendenti. Il pulsante è `[loading]="saving()" [disabled]="saving()"` (html:1892-1893, e la variante mobile :1947); `executeExplicitSave` riguarda `if (this.saving()) return;` (:4472) e mette `_submitState` a 'saving' in modo sincrono (:4486). In più `requestSaveDocument` riguarda a monte (:3445-3447). ATTENZIONE a una finestra reale: fra il clic e l'invio c'è una chiamata HTTP di controllo cronologico (`this.chronology.run(...)`, :3458), durante la quale `saving()` è ancora false e il pulsante è cliccabile. La duplicazione lì è però impedita dalla guardia condivisa, che COALESCE: `DocumentChronologyGuard` tiene un solo campo `sospeso` (domain/documents/state/document-chronology-guard.ts:67,76,113-117), quindi la seconda `run()` sovrascrive la prima e la prima risposta che arriva consuma `sospeso` mettendolo a null — la seconda risposta non chiama nulla. Ctrl/Cmd+S (:3959-3966) passa dalla stessa `requestSaveDocument`.
(b) Al fallimento il form SOPRAVVIVE: il ramo `error` scrive solo `_submitState` (:4514-4524) — e nel caso «numero già preso» apre il dialogo del conflitto e torna a 'idle' (:4516-4521). Gli id di riga si adottano SOLO in caso di successo (`adoptSavedLineState`, :4773-4806, svuotata `lastSavedLineEntries` a fine adozione), quindi dopo un errore le righe restano senza id. L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO di un documento NUOVO l'id È memorizzato, e in modo robusto: `loadedDocument.set(doc)` sincrono (:4498) PIÙ `router.navigate(['/app/documents', doc.id, 'edit'], {replaceUrl:true})` (:4508-4511). Anche se la navigazione non arrivasse, `persistedDocumentId()` restituirebbe già l'id. Un secondo Salva è quindi una MODIFICA. Il percorso «Salva e chiudi» (`confirmExitSaveDocument`, :3905-3939) fa lo stesso `loadedDocument.set(doc)` (:3928) — non ha però una propria guardia `saving()`, si affida al solo `[disabled]="saving()"` del pulsante (html:2026-2027).
Resta esposta la sola finestra fra invio e risposta persa: fino al ritorno della risposta nulla ha scritto l'id, quindi un reinvio in quel momento è una seconda creazione.

**B · modifica** — Con `id` presente il comando reinviato indirizza lo stesso documento e le righe portano gli id adottati al salvataggio precedente (:4802). Il reinvio è quindi indirizzato allo stesso record e alle stesse righe — non nascono id nuovi lato client. Le righe aggiunte dopo l'ultimo salvataggio hanno `id` vuoto (`this.fb.control('')`, es. :4415) e in un reinvio verrebbero rimandate senza id: il loro esito dipende dal server, fuori dal perimetro di questa famiglia.

**Causa tecnica** — Impedisce il doppio clic (pulsante disabilitato + guardia in `executeExplicitSave` + coalescing del controllo cronologico) e impedisce la seconda creazione dopo un salvataggio RIUSCITO, perché l'id finisce in un signal sincrono e non nel solo URL. NON impedisce la seconda creazione quando la risposta del PRIMO salvataggio si perde: in quell'istante `loadedDocument` è ancora null, `editDocumentId()` è null, e il corpo reinviato è identico e senza `id`.

**Evidenza** — src/app/features/documents/goods-receipt-form.component.ts:410,414,2466,3445-3447,3458-3461,3905-3939,3959-3966,4472,4486,4495-4512,4514-4524,4596-4597,4622-4624,4646,4680,4773-4806; src/app/features/documents/goods-receipt-form.component.html:1892-1896,1947-1951,2026-2030; src/app/domain/documents/services/document.service.ts:34,208-227; src/app/domain/documents/state/document-chronology-guard.ts:67,76,80-100,113-117

#### 14. `Maschera sales-document-form → POST /documents (createDocument) oppure PATCH /documents/:id (updateDocument) — sales-document-form.component.ts:2254-2263, document.service.ts:198-201,307-311`

**Comando** — Proforma · Fattura (bozza) · Fattura accompagnatoria · Nota di credito: l'operatore compila e preme «Salva documento», poi conferma nel dialogo

**Il client manda** — LETTO. `const editId = this.editDocumentId();` (:2137) e poi `editId ? updateDocument(editId, this.toUpdateBody(body)) : createDocument(body)` (:2254-2263). Righe costruite dal form; nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms.

**Create vs update** — LETTO. Solo `editDocumentId()`, computed sul parametro di rotta (:285). Il signal `loadedDocument` (:288) viene scritto solo al CARICAMENTO (:625), mai nel ramo `next` del salvataggio.

**A · prima creazione** — (a) Doppio clic PROTETTO: pulsante `[loading]="saving()" [disabled]="formReadOnly() || saving()"` (html:1346,1358), dialogo di conferma con `[busy]="saving()"` (html:1382), `persist()` riguarda `if (this.formReadOnly() || this.saving()) return;` (:2116-2118) con 'saving' sincrono (:2252). Finestra del controllo cronologico (`this.chronology.run(...)`, :2016 e :2038) coperta dal coalescing della guardia condivisa.
(b) Al fallimento il form SOPRAVVIVE: `error` scrive solo `_submitState`, con il ramo dedicato al conflitto di numero che torna a 'idle' e apre il dialogo (:2288-2295). L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO l'id NON viene memorizzato: `next` azzera `dirtySinceLastSave` e naviga al Dettaglio (`router.navigate([this.listPath, doc.id])`, :2286), oppure — se il salvataggio arriva da «Salva e chiudi» — esegue `onSaved()` e prosegue la navigazione sospesa (:2277-2282). In nessuno dei due rami l'id viene scritto in un signal della maschera. Con la risposta persa nulla di tutto ciò accade: rotta ancora /new, `editDocumentId()` null, reinvio = seconda creazione.

**B · modifica** — In modifica `editDocumentId()` è valorizzato e il comando è un PATCH sullo stesso `:id`. Il corpo della modifica è deliberatamente diverso da quello della creazione (`toUpdateBody`, :2254-2262 con il commento che spiega perché `type` e `sourceDocumentId` non possono viaggiare in PATCH). Il reinvio indirizza lo stesso record; le righe già salvate portano il proprio `id`.

**Causa tecnica** — Impedisce il doppio clic (guardia in `persist()`, pulsante e dialogo disabilitati, coalescing cronologico). NON impedisce la seconda creazione dopo risposta persa: l'identità nasce solo dall'URL e l'URL cambia solo dentro il ramo `next`, che con la risposta persa non viene eseguito.

**Evidenza** — src/app/features/documents/sales-document-form.component.ts:285,288,597,607-636,2011-2039,2116-2118,2137,2252-2263,2269-2296; src/app/features/documents/sales-document-form.component.html:54,1346-1359,1382,1457-1474; src/app/features/documents/documents.routes.ts:200-250; src/app/domain/documents/services/document.service.ts:198-201,307-311

#### 15. `Maschera customer-order-form, ramo ordine → POST /sales-orders/manual/save (SalesOrderService.saveManualOrder) — customer-order-form.component.ts:4569, src/app/domain/sales-orders/services/sales-order.service.ts:162-171`

**Comando** — Ordine cliente: l'operatore compila e preme «Salva documento» (ramo ordine manuale della maschera customer-order-form)

**Il client manda** — LETTO. `buildSavePayload()` mette `id: this.editOrderId() ?? undefined` (:4518); righe con `id` della riga quando esiste (`isExistingLine: Boolean(raw.id)`, :4510). `editOrderId` è un computed sul parametro di rotta (:494). Nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms (sales-order.service.ts:21,170).

**Create vs update** — LETTO. Solo `editOrderId()`, cioè il parametro di rotta. ATTENZIONE: il ramo `next` scrive `this.loadedOrder.set(result.order)` (:4573), ma `buildSavePayload()` NON lo legge — l'unica fonte dell'`id` resta l'URL, che cambia in modo ASINCRONO (`router.navigate([...], {replaceUrl:true})`, :4587-4591).

**A · prima creazione** — (a) Doppio clic PROTETTO, ma con una catena più fragile delle altre. Il pulsante principale è `[loading]="saving()" [disabled]="saving()"` (html:2457-2459,2508-2510) e `requestSaveDocument()` riguarda `if (this.saving() || this.formReadOnly()) return;` (:4232-4234). ⚠️ Ma i metodi terminali NON hanno guardia propria: `saveDocumentNow()` (:4557) e il ramo registro `saveRegistryDocument()` (:4704) non ricontrollano `saving()` — a differenza di goods-receipt, transfer, stock-operation, sales-document-form e supplier-order, che la ricontrollano tutti. La protezione poggia quindi interamente su (i) `[disabled]` del pulsante, (ii) la guardia di `requestSaveDocument`, e (iii) il coalescing del controllo cronologico (`saveDocument()` = `this.chronology.run(() => this.saveDocumentNow(onSaved))`, :4553-4555; document-chronology-guard.ts:67,113-117), che è ciò che copre la finestra in cui `saving()` è ancora false. Anche i dialoghi intermedi «Salva comunque» (disponibilità, html:2653-2658) e «Sì» (ordini parziali, html:2617) NON hanno `[disabled]="saving()"`: si chiudono però sincronamente e azzerano il proprio flag di sospensione (`confirmAvailabilityDialog`, :4434-4443; `confirmPartialOrdersDialog`, :4446-4451).
(b) Al fallimento il form SOPRAVVIVE: `error` scrive solo `_submitState` (:4596-4598). L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO l'id è memorizzato SOLO tramite la rotta: `loadedOrder` viene scritto (:4573) ma il payload non lo legge. Fino a quando `router.navigate` non risolve, `editOrderId()` resta null. DEDOTTO: in quella finestra un secondo Salva sarebbe una seconda creazione — è però una finestra breve e coperta di fatto dalla guardia `saving()`, che si spegne solo dopo la scrittura di `loadedOrder`. Il percorso davvero esposto resta la risposta persa: `next` non gira, nulla naviga, `editOrderId()` null, reinvio = seconda creazione.

**B · modifica** — In modifica `editOrderId()` è valorizzato e viaggia in `id` (:4518); le righe già salvate portano il proprio id e il codice IVA usa il contratto binario `vatCodeIdForLinePayload({ isExistingLine: Boolean(raw.id) })` (:4506-4511), cioè il valore persistito non si rifotografa al risalvataggio. Il reinvio indirizza lo stesso record. In modifica il ramo `next` non naviga: fa `patchFormFromOrder(result.order)` e `refreshAllLineSummaries()` (:4592-4594).

**Causa tecnica** — Impedisce il doppio clic, ma con una rete in meno delle maschere sorelle: i due metodi che eseguono davvero la POST non hanno guardia `saving()`, e la finestra del controllo cronologico è chiusa dal coalescing della guardia condivisa, non da una guardia della maschera. NON impedisce la seconda creazione dopo risposta persa, perché l'`id` nel payload viene letto dall'URL e non dal signal `loadedOrder` che il ramo `next` scrive.

**Evidenza** — src/app/features/sales-orders/customer-order-form.component.ts:494,497,502,4232-4234,4434-4443,4446-4451,4506-4518,4553-4555,4557,4565-4598,5132-5140; src/app/features/sales-orders/customer-order-form.component.html:2457-2461,2503-2516,2617,2653-2658,2677-2694,2825; src/app/domain/sales-orders/services/sales-order.service.ts:21,162-171; src/app/domain/documents/state/document-chronology-guard.ts:67,113-117

#### 16. `Maschera customer-order-form, ramo registro → POST /documents (createDocument) oppure PATCH /documents/:id (updateDocument) — customer-order-form.component.ts:4726-4767, document.service.ts:198-201,307-311`

**Comando** — Preventivo · DDT vendita · Scarico manuale: l'operatore compila e preme «Salva documento» (ramo «registro documenti» della STESSA maschera customer-order-form)

**Il client manda** — LETTO. `const editId = this.editOrderId();` (:4706) e poi `editId ? updateDocument(editId, {...}) : createDocument({...})` (:4726-4767). Il numero viaggia solo se imposto (`this.numbering.imposedNumber()`, :4730). Nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms.

**Create vs update** — LETTO. Solo `editOrderId()`, il parametro di rotta. Il ramo `next` scrive `this.loadedQuoteDoc.set(doc)` (:4779) ma `saveRegistryDocument` non lo legge mai: la sola fonte dell'`id` resta l'URL, aggiornato in modo asincrono da `router.navigate(['/app/documents', editPath, doc.id, 'edit'], {replaceUrl:true})` (:4781-4790).

**A · prima creazione** — (a) Doppio clic PROTETTO dagli stessi tre meccanismi del ramo ordine (pulsante `[disabled]="saving()"`, guardia in `requestSaveDocument` :4232-4234, coalescing cronologico :4553-4555). ⚠️ `saveRegistryDocument()` (:4704) NON ha guardia `saving()` propria e — a differenza di quasi tutte le altre maschere — non usa nemmeno un campo `submitSubscription` per annullare un invio precedente: `save$.pipe(take(1), takeUntilDestroyed(...)).subscribe(...)` (:4771) è una sottoscrizione anonima. Due invii sovrapposti resterebbero entrambi vivi.
(b) Al fallimento il form SOPRAVVIVE: `error` scrive solo `_submitState`, con il ramo del conflitto di numero che torna a 'idle' e apre il dialogo (:4796-4805). L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO l'id vive solo nella rotta (vedi sopra). Con la risposta persa nulla naviga e nulla scrive: reinvio = seconda creazione, con un secondo numero PRE/DDT/SCA consumato dal numeratore.

**B · modifica** — In modifica `editOrderId()` è valorizzato: PATCH sullo stesso `:id`, con un corpo dedicato che riscrive per intero la testata (i commenti :4738-4744 dichiarano che l'assenza di un campo AZZERA il valore) e le righe con il proprio id. Il reinvio indirizza lo stesso record.

**Causa tecnica** — Impedisce il doppio clic per via del pulsante disabilitato, della guardia di `requestSaveDocument` e del coalescing cronologico. NON impedisce la seconda creazione dopo risposta persa: l'`id` si legge dall'URL e il ramo `next` — l'unico che quell'URL lo cambia — non viene eseguito. In più, qui manca sia la guardia terminale sia l'annullamento della sottoscrizione precedente presenti nelle altre maschere.

**Evidenza** — src/app/features/sales-orders/customer-order-form.component.ts:4232-4234,4553-4555,4704-4708,4726-4767,4771-4795,4796-4805; src/app/features/sales-orders/customer-order-form.component.html:2457-2461,2503-2516; src/app/domain/documents/services/document.service.ts:198-201,307-311

#### 17. `Maschera supplier-order-form → POST /supplier-orders (createOrder) oppure PATCH /supplier-orders/:id (updateOrder) — supplier-order-form.component.ts:2194-2196, src/app/domain/supplier-orders/services/supplier-order.service.ts:70-80`

**Comando** — Ordine fornitore: l'operatore compila e preme «Salva documento» (o «Salva e chiudi» dal dialogo di uscita)

**Il client manda** — LETTO. `const editId = this.editOrderId();` (:2189) e poi `editId ? updateOrder(editId, body) : createOrder(body)` (:2194-2196). Il numero viaggia solo se imposto (`this.numbering.imposedNumber()`, :2170). Righe SENZA id: `lines` porta `variantId`, descrizione, quantità, costo, sconto, codice IVA e unità di misura, mai un id di riga (:2132-2162). Nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms (supplier-order.service.ts:73,79).

**Create vs update** — LETTO. Solo `editOrderId()`, computed sul parametro di rotta (:297). Non esiste alcun signal che conservi l'ordine salvato per il payload: dopo la creazione l'unica scrittura dell'identità è `router.navigate([this.listPath, order.id, 'edit'], {replaceUrl:true})` (:2236), asincrona.

**A · prima creazione** — (a) Doppio clic PROTETTO: pulsante `[disabled]="saving()" [loading]="saving()"` (html:1184-1185,1197-1198), `submitNow()` riguarda `if (this.saving()) return;` (:2114-2116) con 'saving' sincrono (:2190). La finestra del controllo cronologico (`submit()` = `this.chronology.run(() => this.submitNow(onSaved))`, :2110-2112) è coperta dal coalescing della guardia condivisa e comunque dalla guardia di `submitNow`.
(b) Al fallimento il form SOPRAVVIVE: `error` scrive solo `_submitState` (:2238-2241). Gli avvisi sui costi mancanti sono raccolti PRIMA dell'invio (:2192) proprio per non dipendere dalla risposta. L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO l'id vive SOLO nella rotta. Il commento :2226-2235 lo dichiara esplicitamente come intenzione («cambia solo l'URL, da /new a /:id/edit … un secondo salvataggio aggiorna invece di crearne un altro»): la memoria dell'identità è quindi affidata al router, non a un signal. Con la risposta persa `next` non gira, la navigazione non avviene, `editOrderId()` resta null e il reinvio è una seconda creazione.

**B · modifica** — In modifica `editOrderId()` è valorizzato e il comando è un PATCH sullo stesso `:id`; il ramo `next` in modifica non ricostruisce il form (`this.editLock.relock(editId); return;`, :2216-2224, col commento che spiega perché) e non naviga. ⚠️ Le righe non portano id (:2132-2162): il corpo reinviato descrive l'elenco righe per intero, quindi l'esito di un reinvio sulle righe dipende interamente da come il server tratta quell'elenco — fuori dal perimetro di questa famiglia.

**Causa tecnica** — Impedisce il doppio clic (guardia `saving()` in `submitNow` + pulsante disabilitato + coalescing cronologico). NON impedisce la seconda creazione dopo risposta persa, perché l'identità dell'ordine è affidata per scelta dichiarata al cambio di URL, che avviene solo dentro il ramo `next`.

**Evidenza** — src/app/features/orders/supplier-order-form.component.ts:297,1069-1077,2110-2116,2132-2162,2170,2189-2196,2198-2237,2238-2241; src/app/features/orders/supplier-order-form.component.html:34,1181-1198,1228-1245,1336; src/app/domain/supplier-orders/services/supplier-order.service.ts:31,70-80

#### 18. `Maschera manual-receipt-form → POST /manual-receipts (create) oppure PATCH /manual-receipts/:id (update) — manual-receipt-form.component.ts:725-726, src/app/features/reports/services/manual-receipt.service.ts:46-53`

**Comando** — Corrispettivo manuale: l'operatore compila righe e importi e preme «Salva corrispettivo» (o «Salva e chiudi» dal dialogo di uscita)

**Il client manda** — LETTO. `const id = this.receiptId(); const request = id ? this.manualReceipts.update(id, body) : this.manualReceipts.create(body);` (:725-726). Il corpo porta data, sede, modalità prezzi, note e righe. Nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms (manual-receipt.service.ts:13,47,52).

**Create vs update** — LETTO. Dal signal `receiptId` (:147), inizializzato da `route.snapshot.paramMap.get('id')` MA — unico caso insieme all'Arrivo merce — RISCRITTO in modo sincrono nel ramo `next`: `this.receiptId.set(saved.id)` (:744). Il commento :737-743 lo dichiara come decisione esplicita: «L'id assegnato si tiene: da qui in avanti ogni salvataggio è un PATCH sullo stesso record. Senza, un secondo Salva avrebbe creato una seconda registrazione con un secondo numero.»

**A · prima creazione** — (a) Doppio clic PROTETTO: pulsante `[loading]="saving()" [disabled]="saving()"` (html:485-486) e `save()` riguarda `if (this.saving()) return;` (:684-686) con `_submitState` a 'saving' sincrono (:724). Nessun controllo cronologico davanti all'invio (la maschera non usa `DocumentChronologyGuard` — verificato per assenza con grep su tutto il file): non esiste quindi la finestra a `saving()` false che le altre maschere hanno.
(b) Al fallimento il form SOPRAVVIVE: `error` scrive solo `_submitState` (:752-754). L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO l'id È memorizzato, nel modo più diretto di tutte le maschere: signal scritto sincrono (:744), senza navigazione e senza dipendere dal router. Un secondo Salva è una MODIFICA. Resta esposta la sola finestra fra invio e risposta persa: fino al ritorno della risposta `receiptId` è null, quindi un reinvio in quel momento è una seconda creazione con un secondo numero.

**B · modifica** — Con `receiptId` valorizzato — sia da rotta sia da salvataggio precedente — il comando è un PATCH sullo stesso record. Il reinvio indirizza lo stesso `:id`. ⚠️ Le righe del corpo non portano id (`buildLinesBody()`), quindi l'esito di un reinvio sulle righe dipende dal server, fuori perimetro.

**Causa tecnica** — Impedisce il doppio clic (guardia `saving()` + pulsante disabilitato) e impedisce la seconda creazione dopo un salvataggio RIUSCITO, perché l'id ricevuto viene scritto in un signal sincrono che il payload legge davvero. NON impedisce la seconda creazione quando la risposta del PRIMO salvataggio si perde: in quell'istante `receiptId` è ancora null e il corpo reinviato è identico e senza id.

**Evidenza** — src/app/features/reports/pages/manual-receipt-form/manual-receipt-form.component.ts:147,179,684-686,715-726,728-754; src/app/features/reports/pages/manual-receipt-form/manual-receipt-form.component.html:466,472,485-486,530-547; src/app/features/reports/services/manual-receipt.service.ts:13,46-53

### ✅ PROTETTI — 15

#### 1. `POST /documents/:id/cancel → DocumentsService.cancel (documents.controller.ts:458-467 → documents.service.ts:2576).`

**Comando** — Annulla documento (Trasferimento o Rettifica confermata): dalla pagina Dettaglio l'operatore preme «Annulla documento» e conferma; le giacenze mosse tornano indietro e il documento passa a stato annullato.

**Il client manda** — Solo l'id nella rotta, corpo vuoto (document.service.ts:398 `cancelDocument(id)`; document-detail.component.ts:699-702 → :741-757 `runAction`). Nessuna chiave di richiesta. L'unica difesa lato client è `actionSaving()` (:743), che copre il doppio clic mentre la richiesta è in volo ma decade appena il timeout di 15s trasforma la chiamata in errore.

**Create vs update** — Non si pone: è un comando su un record esistente e identificato dall'URL. `getById` fuori transazione carica il documento e solleva 404 se non esiste.

**A · prima creazione** — NON APPLICABILE: il comando non crea nulla. Nessun Document, nessuna riga, nessun numero.

**B · modifica** — PROTETTO NELLO SCENARIO DICHIARATO (reinvio sequenziale dopo commit e risposta persa). Al secondo invio `getById` rilegge lo stato ormai `cancelled` e la guardia risponde 409 «Il documento è già annullato» (documents.service.ts:2598-2600) prima di aprire la transazione: nessun secondo storno di giacenza, nessuna seconda revisione, nessun movimento in più. • Anche superata la guardia, gli effetti non si riapplicherebbero: per Trasferimento e Rettifica lo storno passa da `syncTransferLineMovements` / `syncAdjustmentLineMovements` invocati con `lines: []` (documents.service.ts:2721-2737 e :2776-2795), che agiscono sui movimenti ESISTENTI — al secondo giro non ce ne sono più, quindi `deltas` è vuoto e nessun `applyInventoryDelta` parte. • ⚠️ QUELLO CHE LA GUARDIA NON COPRE, e va detto perché il requisito nomina anche il doppio clic: la lettura dello stato è FUORI dalla transazione (`getById` a :2577, `$transaction` a :2638) e dentro la transazione lo stato non viene riletto — l'update finale è un `document.update` incondizionato (:2863-2866). Due richieste davvero concorrenti passano entrambe il controllo. Che non si duplichi lo storno è DEDOTTO, non misurato: la seconda transazione, in READ COMMITTED, leggerebbe gli stessi movimenti e poi si bloccherebbe sul `stockMovement.delete` della riga già eliminata dalla prima, fallendo con record-not-found e rollback dell'intera transazione. È una protezione emergente dal lock di riga, non una guardia scritta. • Duplicazione residua osservabile: una seconda `DocumentRevision` non viene scritta perché la transazione non si apre affatto nel caso sequenziale.

**Causa tecnica** — La guardia di stato `status === cancelled` (documents.service.ts:2598-2600) impedisce la seconda esecuzione sullo STESSO record, ed è esattamente ciò che serve qui perché questo comando non può generarne un secondo — non crea entità. La protezione vale per il reinvio sequenziale dichiarato nello scenario; per due richieste realmente simultanee la guardia è fuori transazione e non serializza nulla: a impedire il doppio storno resterebbe solo il fallimento della `delete` sul movimento già rimosso, che è un effetto collaterale del lock di riga, non una difesa progettata.

**Evidenza** — api/src/documents/documents.controller.ts:458-467 · api/src/documents/documents.service.ts:2576-2579, :2598-2600, :2623-2632, :2638, :2721-2737, :2776-2795, :2822-2829, :2863-2866 · src/app/domain/documents/services/document.service.ts:398 · src/app/features/documents/document-detail.component.ts:699-702, :741-757

#### 2. `DELETE /documents/:id → DocumentsService.delete (documents.controller.ts:468-477 → documents.service.ts:2881).`

**Comando** — Elimina documento (Trasferimento o Rettifica): dalla pagina Dettaglio l'operatore preme «Elimina» e conferma. Su questi due tipi è ammesso solo dopo l'annullamento.

**Il client manda** — Solo l'id nella rotta (document-detail.component.ts:720-739). Nessuna chiave di richiesta; guardia `actionSaving()` solo per la richiesta in volo (:723).

**Create vs update** — Non si pone: comando distruttivo su un record identificato dall'URL.

**A · prima creazione** — NON APPLICABILE: il comando non crea nulla.

**B · modifica** — PROTETTO. • Su un Trasferimento o una Rettifica CONFERMATA il comando non passa affatto: `isFinalized` è vero e nessuna delle tre esenzioni si applica — `isDeletableReceipt` copre solo i tipi di carico e la fattura fornitore, `isDeletableManualUnload` solo `manual_unload`, `isDeletableQuote` solo `quote` (documents.service.ts:2890-2912) → 409 «Solo i documenti in bozza o annullati possono essere eliminati». • Su un documento già annullato l'eliminazione procede, ma non ha effetti di magazzino da duplicare: i movimenti e le giacenze sono già stati stornati dall'annullamento, e i rami di ripristino dentro la transazione sono condizionati a `documentTypeLoadsStockOnConfirm(doc.type)` (:2923), falso per transfer e adjustment. • Al reinvio, `getById` non trova più il documento e solleva 404 (:2882). Nessuna riga, nessun movimento, nessun numero, nessun record duplicato: l'eliminazione ripetuta è per natura non duplicabile. • Il numero rimane comunque bruciato nella serie, ma è una conseguenza dell'eliminazione, non del reinvio.

**Causa tecnica** — Non c'è duplicazione possibile perché il comando rimuove invece di creare, e la sparizione del record è essa stessa la guardia sul reinvio (404). La guardia di stato a :2890-2912 non riguarda il reinvio: impedisce di eliminare un documento confermato, cioè restringe QUANDO il comando è ammesso, non quante volte.

**Evidenza** — api/src/documents/documents.controller.ts:468-477 · api/src/documents/documents.service.ts:2881-2884, :2890-2912, :2922-2945 · src/app/features/documents/document-detail.component.ts:720-739

#### 3. `NESSUNA ROTTA HTTP → DocumentsService.confirm (documents.service.ts:2244) → confirmDocumentTx (:2247, transazione a :2246). Unico chiamante nell'intera API: inventory-count.service.ts:346`

**Comando** — CONFERMA di un documento in bozza. ⛔ Non è un comando che l'operatore possa inviare: non esiste alcuna rotta HTTP che lo esponga. Lo invoca un solo punto del dominio, la chiusura di una sessione di Inventario fisico.

**Il client manda** — Nulla: il client non può chiamarlo. documents.controller.ts è stato letto per intero (477 righe) e non contiene alcun handler di conferma; `grep "@Post('.*confirm"` e `@Patch('.*confirm` su tutto api/src non trovano nulla; sul frontend nessun service chiama una rotta `confirm` di documento. I due commenti che citano «POST /documents/:id/confirm» (documents.controller.ts:176 e :193) descrivono un percorso che non esiste più: il commento a :2244-2249 lo dichiara esplicitamente («non è più esposta via endpoint»).

**Create vs update** — Non si pone: non crea e non aggiorna contenuto — porta un documento esistente da `draft` a `confirmed` assegnandogli numero ed effetti. La distinzione che fa è di STATO, non di identità.

**A · prima creazione** — Non applicabile: non crea documenti. La creazione è il comando 1, che esegue gli stessi effetti in-transazione senza passare di qui.

**B · modifica** — IL REINVIO SULLO STESSO RECORD È BLOCCATO. Al secondo giro `confirmDocumentTx` rilegge il documento (:2278-2283) e trova `status = confirmed`: la guardia a :2302 solleva ConflictException «Solo i documenti in bozza possono essere confermati.» prima di qualunque scrittura. Quindi, sullo stesso id: nessun secondo numero (il ramo `if (number == null)` a :2324 non viene mai raggiunto), nessun movimento aggiuntivo, nessun impegno riconsumato, nessuno stato riscritto. Il passaggio a `confirmed` avviene nella STESSA transazione degli effetti (:2461-2469), quindi non c'è finestra in cui gli effetti risultino applicati e lo stato ancora bozza.

⚠️ COMPORTAMENTO TECNICO OSSERVATO, riportato come tale e non come workflow: `DocumentsService.create` è oggi «nasce-confermato» — createDocumentRecord chiama confirmDocumentTx dentro la propria transazione (:1142). Il documento che inventory-count.service.ts:324 riceve da `documents.create` è quindi GIÀ `confirmed`, e la `documents.confirm` che segue a :346 incontra la guardia a :2302. Letto dal codice, non esercitato dai test: in inventory-count.service.spec.ts il DocumentsService è mockato (`create: vi.fn()`, :25), quindi la sequenza reale non viene mai percorsa in prova.

**Causa tecnica** — ⛔ La guardia a :2302 va misurata per quello che è: **una guardia sul RECORD, non sul COMANDO**, e questo è il punto che l'area doveva chiarire.

Quello che IMPEDISCE, dimostrato: rieseguire numerazione ed effetti magazzino su un documento che li ha già ricevuti. Il test è la lettura dello stato a :2296-2303 prima di ogni scrittura, e il fatto che stato ed effetti si scrivano nella stessa transazione (:2461-2469): un secondo giro sullo stesso id non trova mai una bozza.

Quello che LASCIA POSSIBILE, ed è il difetto vero dell'area: **non ha alcuna voce in capitolo sulla nascita di un SECONDO documento**. Un record appena creato è `draft` per definizione, quindi soddisfa la guardia e riceve numero ed effetti come se fosse il primo. Un secondo POST /documents produce esattamente questo (vedi comando 1). Dire «il percorso è protetto perché c'è una guardia di stato» sarebbe la conclusione sbagliata: la guardia difende un documento da se stesso, non il sistema da un comando ripetuto.

Da aggiungere: essendo la conferma non raggiungibile via HTTP, la guardia non arbitra nemmeno un comando dell'operatore — arbitra una chiamata interna che, per come create() si comporta oggi, arriva già a giochi fatti.

**Evidenza** — documents.controller.ts (477 righe, nessun handler di conferma; commenti obsoleti a :176 e :193) · documents.service.ts:1142, 2238-2249, 2266, 2278-2283, 2296-2303, 2324, 2461-2469 · inventory/inventory-count.service.ts:324, 346 · inventory/inventory-count.service.spec.ts:25 · grep su api/src: nessun `@Post`/`@Patch` con «confirm»

#### 4. `DELETE /documents/:id → DocumentsService.delete (documents.service.ts:2881); transazione a :2921`

**Comando** — «Elimina documento» dall'elenco. Ammesso su bozze e annullati per tutti i tipi, e in più su Arrivi merce, Registrazione fattura, Scarico manuale e Preventivo anche da salvati (:2903-2919).

**Il client manda** — Solo l'id nella rotta. Nessun corpo (documents.controller.ts:468-476).

**Create vs update** — Non si pone: agisce su un id esistente.

**A · prima creazione** — Non applicabile: non crea documenti.

**B · modifica** — IL REINVIO È BLOCCATO, e dal fatto stesso che il record non c'è più. Il secondo DELETE parte da `getById` (:2882) che non trova la riga e solleva NotFoundException (:851-853) — 404 prima di qualunque scrittura. Nessun secondo storno di movimenti (`syncGoodsReceiptLineMovements` con righe vuote, :2923-2931), nessun secondo riapri-ordine-fornitore (:2934), nessun secondo ripristino di seriali (:2936-2940). Il `tx.document.delete` (:2942) sta nella stessa transazione degli storni, quindi o si è fatto tutto o non si è fatto niente.

⚠️ Nota necessaria, perché il reinvio qui non è il rischio: eliminare NON è un annullamento. Per lo Scarico manuale la cancellazione non ripristina le giacenze (deroga dichiarata, document-stock-manual-unload.util.ts:14-18) — quindi il documento duplicato descritto al comando 1 può sparire dall'elenco lasciando la giacenza scesa due volte, senza nemmeno un movimento a raccontarlo.

**Causa tecnica** — IMPEDISCE la ripetizione degli effetti perché la condizione di esecuzione è l'ESISTENZA del record, e il record viene rimosso nella stessa transazione che esegue gli storni (:2921-2943): dopo il commit non c'è più nulla su cui il comando possa riagire, e il secondo invio muore in lettura con 404.

LASCIA POSSIBILE, per completezza: due DELETE sovrapposti leggono entrambi il documento fuori transazione (:2882), ma il secondo `tx.document.delete` fallirebbe comunque sul record già rimosso — l'esito è un errore, non un doppio storno.

**Evidenza** — documents.controller.ts:468-476 · documents.service.ts:851-853, 2881-2882, 2903-2919, 2921-2943 · document-stock-manual-unload.util.ts:14-18

#### 5. `POST /documents/:id/convert-prefill → DocumentsService.convertPrefill (documents.service.ts:2478) → buildConversionDto (:2487)`

**Comando** — «Converti in…»: da una Proforma o da un DDT vendita l'operatore chiede la precompilazione del documento di destinazione (Fattura, DDT, Proforma).

**Il client manda** — Id dell'origine nella rotta e il tipo di destinazione nel corpo (ConvertDocumentDto).

**Create vs update** — Non si pone: non crea e non aggiorna. Restituisce un oggetto di precompilazione che la maschera di destinazione mostra; il documento nasce solo quando l'operatore preme Salva, ed è il comando 1.

**A · prima creazione** — Non applicabile: nessuna scrittura. `buildConversionDto` (:2487-2574) esegue una `getById` e costruisce un DTO in memoria — letto riga per riga, non contiene alcuna chiamata di scrittura Prisma.

**B · modifica** — Non applicabile: nessuna scrittura, quindi nessun effetto da riconciliare. Reinviarlo N volte restituisce N volte lo stesso oggetto.

⚠️ Da segnalare perché appartiene comunque all'inventario: le righe del prefill escono SENZA id (:2560-2573), il che è corretto — sono righe di un documento che non esiste ancora — ma significa che ogni Salva successivo è una creazione piena. E `sourceDocumentId` non ha alcun vincolo di unicità: sullo schema è una semplice relazione con soli indici non unici (prisma/schema.prisma:2143, 2169-2170). Nulla impedisce quindi che dalla STESSA proforma nascano due documenti identici — che nel caso volontario è corretto, e nel caso del reinvio del comando 1 è la duplicazione già descritta lì.

**Causa tecnica** — IMPEDISCE ogni duplicazione per la ragione più semplice possibile: non scrive niente. Il meccanismo è l'assenza di effetti, non una guardia.

LASCIA POSSIBILE: nulla di proprio. Ma non aggiunge alcuna protezione a valle — il documento che nascerà da questo prefill passa dal comando 1 e ne eredita per intero la vulnerabilità.

**Evidenza** — documents.controller.ts:446-456 · documents.service.ts:2478-2485, 2487-2574 (in particolare 2492 getById e 2560-2573 righe senza id) · prisma/schema.prisma:2143, 2169-2170

#### 6. `POST /supplier-orders/:id/cancel → SupplierOrdersService.cancel`

**Comando** — Annulla un ordine fornitore (azione dall'elenco o dalla maschera).

**Il client manda** — LETTO. Corpo vuoto `{}` (supplier-order.service.ts:82-86); l'identità è l'id in rotta.

**Create vs update** — Non si applica: è una transizione su un record esistente, esiste solo il caso B.

**A · prima creazione** — Non applicabile: il comando richiede un id già esistente in rotta (supplier-orders.controller.ts:151-159, ParseUUIDPipe).

**B · modifica** — PROTETTO. LETTO: `cancel` rilegge l'ordine e pretende `status === confirmed` (:355-360); dopo il primo annullamento lo stato è `cancelled` (:363), quindi il reinvio esce con 409 «Solo gli ordini confermati possono essere annullati» prima di qualunque scrittura. Nessun secondo record, nessun numero, nessuna riga, nessun movimento/impegno/lotto (non ne esistono per questo tipo), nessuna scrittura anagrafica. Effetto sui riepiloghi: il conteggio dashboard degli ordini `confirmed` scende una volta sola.

**Causa tecnica** — La guardia di stato impedisce la RIESECUZIONE sullo stesso record, che qui è l'unica duplicazione possibile: il comando non può generare un secondo record perché lavora su un id fisso. Il prezzo è che il reinvio restituisce un errore invece di un successo idempotente — l'operatore vede un 409 su un'operazione che è già andata a buon fine.

**Evidenza** — api/src/supplier-orders/supplier-orders.service.ts:350-367; api/src/supplier-orders/supplier-orders.controller.ts:151-159; src/app/domain/supplier-orders/services/supplier-order.service.ts:82-86

#### 7. `DELETE /supplier-orders/:id → SupplierOrdersService.delete`

**Comando** — Elimina definitivamente un ordine fornitore annullato.

**Il client manda** — LETTO. Nessun corpo; id in rotta (supplier-orders.controller.ts:161-169).

**Create vs update** — Non si applica: solo caso B.

**A · prima creazione** — Non applicabile: richiede un id esistente.

**B · modifica** — PROTETTO. LETTO: `delete` passa da `getById`, che lancia NotFoundException se la riga non c'è (:135-137); il reinvio dà 404. Prima ancora, pretende `status === cancelled` (:372-374). Le righe scendono in cascade col record. Nessun movimento/impegno/lotto da stornare (non esistono per questo tipo, vedi comando 1), quindi nessuno storno da riapplicare due volte.

**Causa tecnica** — L'assenza del record dopo la prima esecuzione è essa stessa la guardia. Impedisce la seconda cancellazione; non impedirebbe nulla se il comando creasse qualcosa — ma qui non crea.

**Evidenza** — api/src/supplier-orders/supplier-orders.service.ts:370-376, :512-537 (getById/NotFound)

#### 8. `POST /sales-orders/manual/:id/conclude-prefill → ManualSalesOrdersService.concludePrefill`

**Comando** — «Concludi ordine»: chiede il documento di scarico precompilato da cui si aprirà il DDT/fattura.

**Il client manda** — LETTO. Corpo `{ documentType }` (sales-orders.controller.ts:139-148, ConcludeManualSalesOrderDto); id in rotta.

**Create vs update** — Non si applica: il comando non scrive nulla. Il commento del metodo lo dichiara — «Nessun documento nasce qui: si crea solo al salvataggio» (manual-sales-orders.service.ts:551-554).

**A · prima creazione** — PROTETTO per costruzione. LETTO: `concludePrefill` (:556-649) esegue solo `findFirst` sull'ordine (:569) ed eventualmente sul documento collegato (:591), poi COMPONE e restituisce un `CreateDocumentDto`. Nessuna create, nessuna update, nessun numero consumato, nessuna riga, nessun movimento, nessun impegno, nessun lotto, nessuna scrittura anagrafica, nessun effetto economico. Reinviarlo mille volte non lascia traccia.

**B · modifica** — Idem: il comando è in sola lettura in entrambi i casi.

**Causa tecnica** — Non c'è una guardia perché non c'è una scrittura: l'idempotenza qui è strutturale. ⚠️ Da NON confondere con la protezione del documento che ne consegue: il salvataggio del DDT/fattura precompilato appartiene alla famiglia documenti, fuori da questo perimetro, e la sola guardia visibile da qui è `order.documentId` già valorizzato (:590-602), che diventa efficace solo DOPO che il primo documento è stato creato e agganciato.

**Evidenza** — api/src/sales-orders/manual-sales-orders.service.ts:548-649; api/src/sales-orders/sales-orders.controller.ts:134-148

#### 9. `POST /sales-orders/manual/:id/force-conclude → ManualSalesOrdersService.forceConclude`

**Comando** — Forza a «Concluso» un ordine parzialmente concluso.

**Il client manda** — LETTO. Nessun corpo; id in rotta (sales-orders.controller.ts:151-160).

**Create vs update** — Non si applica: transizione su record esistente, solo caso B.

**A · prima creazione** — Non applicabile.

**B · modifica** — PROTETTO, e dichiaratamente. LETTO: `if (order.fulfilledAt) { return; }` con il commento «Già concluso: forzatura idempotente» (:679-681): il reinvio esce senza toccare nulla, e senza errore. Anche entrando, il rilascio impegni passa da `releaseOrderReservationsTx` → `releaseReservationTx`, protetto da `updateMany where status: active` con uscita a `count === 0` (stock-reservation.service.ts:370-375): un secondo rilascio non applica un secondo `applyCommittedDelta` negativo, quindi la Impegnata non scende due volte. Nessun secondo record, nessun numero, nessuna riga, nessun movimento fisico, nessun lotto, nessuna scrittura anagrafica.

**Causa tecnica** — Due guardie in fila, e sono di tipo diverso: la prima è sullo STATO del record (fulfilledAt valorizzato) e impedisce la riesecuzione; la seconda è sulla RIGA CONDIZIONATA (`updateMany ... status: active`) e impedisce che l'effetto sul committed venga applicato due volte anche se qualcuno rientrasse. È l'unico comando della famiglia in cui il reinvio restituisce successo senza duplicare — la forma corretta.

**Evidenza** — api/src/sales-orders/manual-sales-orders.service.ts:651-715; api/src/order-reservations/stock-reservation.service.ts:124-140, :364-400

#### 10. `DELETE /sales-orders/manual/:id → ManualSalesOrdersService.delete`

**Comando** — Elimina un ordine cliente manuale dall'elenco.

**Il client manda** — LETTO. Nessun corpo; id in rotta, risposta 204 (sales-orders.controller.ts:163-172).

**Create vs update** — Non si applica: solo caso B.

**A · prima creazione** — Non applicabile.

**B · modifica** — PROTETTO. LETTO: `findFirst` e NotFoundException se assente (:724-737): il reinvio dà 404. Il rilascio impegni prima della cancellazione (:764-768) è protetto dallo stesso `updateMany where status: active`, e comunque gli impegni cadrebbero in cascade (`order ... onDelete: Cascade`, schema.prisma:1514). Nessun doppio storno della Impegnata, nessun secondo record, nessun movimento fisico (non ne esistono per questo tipo), nessun lotto, nessuna scrittura anagrafica.

**Causa tecnica** — L'assenza del record dopo la prima esecuzione è la guardia; impedisce la seconda cancellazione e il secondo rilascio della Impegnata. Non avrebbe alcun valore contro un comando che crea — ma questo non crea.

**Evidenza** — api/src/sales-orders/manual-sales-orders.service.ts:717-776; api/prisma/schema.prisma:1514; api/src/order-reservations/stock-reservation.service.ts:364-375

#### 11. `DELETE /manual-receipts/:id → ManualReceiptsService.remove`

**Comando** — Elimina il Corrispettivo manuale dalla maschera (pulsante Elimina, con dialogo di conferma).

**Il client manda** — LETTO. Solo l'id in rotta, nessun corpo. Guardia in-flight `deleting()` (manual-receipt-form.component.ts:813-817), timeout 15 s, nessun retry.

**Create vs update** — Non si applica: verbo distruttivo, il bersaglio è identificato per id + tenantId (:174-180).

**A · prima creazione** — Non esiste una «prima creazione» per questo comando. Reinvio dopo il commit: findFirst non trova più nulla e si esce con 404 (:177-180) — nessun secondo effetto, nessun altro record toccato. Le righe se ne sono già andate per cascata (schema.prisma:2757). Nessuna giacenza da ripristinare, perché non ne aveva mai mosse (:165-172). Il numero NON si riusa e il buco resta, dichiarato (:171).

**B · modifica** — Non applicabile: non esiste la modifica di un'eliminazione. Va però registrato l'effetto sui registri, perché è la ragione per cui qui non c'è nulla da riconciliare: la riga sparisce da elenco, totali ed export perché il Registro è interamente DERIVATO dalle sorgenti (corrispettivi.service.ts:394, :672) — non esiste una copia persistita del corrispettivo dentro un registro.

**Causa tecnica** — Il comando opera su un id: la seconda esecuzione non produce un secondo effetto ma un 404. Impedisce quindi la doppia eliminazione e la cancellazione di un record diverso; non impedisce — e non c'entra — la nascita di un secondo record, che è il difetto del salvataggio (voce precedente).

**Evidenza** — api/src/manual-receipts/manual-receipts.service.ts:165-183; api/src/manual-receipts/manual-receipts.controller.ts:91-100; api/prisma/schema.prisma:2724-2762 (:2757 cascata); src/app/features/reports/pages/manual-receipt-form/manual-receipt-form.component.ts:809-834; api/src/manual-receipts/manual-receipts.service.spec.ts:167-177.

#### 12. `POST /inventory/levels/import/preview (sola lettura) e POST /inventory/levels/import → InventoryImportService.importCsv`

**Comando** — Import giacenze da CSV: carica il file, guarda l'anteprima, spunta le righe e preme Importa.

**Il client manda** — LETTO. multipart con il file e l'elenco `keys` delle righe scelte in anteprima (inventory.controller.ts:147-170). Timeout 300 s (src/app/domain/inventory/services/inventory.service.ts:111). Guardia in-flight `loading()` (inventory-import.component.ts:111-116).

**Create vs update** — Non c'è la distinzione: il CSV non porta id. La riga si aggancia per SKU + nome sede (inventory-import.service.ts:121-128) e la quantità è la giacenza VOLUTA, assoluta.

**A · prima creazione** — PROTETTO dalla semantica del valore assoluto, non da una chiave. `buildPreviewItems` confronta la quantità del CSV con `available` letto adesso; la riga già allineata esce con status `unchanged` (:153-162) e non viene applicata; solo `delta !== 0` chiama registerMovement (:387-407). Reinviando lo STESSO file dopo un import riuscito, tutte le righe risultano `unchanged`: nessun movimento in più, nessuna giacenza mossa due volte. Nessun record documentale, nessun numero, nessun impegno, nessun lotto. L'unica scrittura non-movimento è `minThreshold` con updateMany di un valore (:409-418): idempotente. Effetti su registri economici: nessuno.

**B · modifica** — Non applicabile: non esiste la modifica di un import. Va però detto che la protezione è di RISULTATO, non di operazione: ogni riga gira in una transazione propria — registerMovement apre la sua (inventory.service.ts:432) — e l'esito è per riga (updated/unchanged/skipped/failed, :195-216). Un import interrotto a metà lascia metà applicato, e il reinvio COMPLETA invece di duplicare. È il comportamento voluto, ma il conteggio `updated` della seconda risposta non descrive più l'intero file.

**Causa tecnica** — Protegge perché il dato inviato è uno STATO desiderato e non una variazione: il delta si ricalcola contro il valore corrente a ogni giro. Lascia possibile — ed è corretto che lo lasci — un movimento nuovo se fra i due import qualcuno ha mosso quella variante: lì il secondo import riporta la giacenza al valore del file, e quel movimento è un evento vero.

**Evidenza** — api/src/inventory/inventory.controller.ts:147-170; api/src/inventory/inventory-import.service.ts:95-220 (:153-162 unchanged, :186-198 applicazione), :387-419; api/src/inventory/inventory.service.ts:414-481; src/app/features/inventory/inventory-import.component.ts:111-137; src/app/domain/inventory/services/inventory.service.ts:111, :408-430.

#### 13. `POST /documents/chronology/dismiss → DocumentChronologyService.dismiss`

**Comando** — Spegne l'avviso cronologico per un tipo documento («non mostrarlo più»).

**Il client manda** — LETTO. Il tipo documento in query, nessun corpo utile (documents.controller.ts:249-257).

**Create vs update** — Non deve distinguerlo: la scrittura è un upsert su chiave naturale.

**A · prima creazione** — PROTETTO. `userDocumentChronologyWarningPreference.upsert` su `tenantId_userId_documentType` (:98-102): la prima volta crea, ogni volta successiva non fa nulla (`update: {}`). Nessun secondo record, nessuna riga in più, nessun numero, nessun movimento, nessun effetto economico.

**B · modifica** — Coincide con il caso A: il comando è per costruzione la stessa operazione ogni volta.

**Causa tecnica** — È l'unico punto della famiglia in cui la scrittura è agganciata a una chiave che il CLIENT può riprodurre da sé — (tenant, utente, tipo) — e a cui il database dà un vincolo unico. Impedisce sia il secondo record sia la doppia esecuzione. Vale la pena nominarlo perché mostra la differenza: qui l'identità del record non dipende dal fatto che il client sappia l'id assegnato, e per questo il reinvio è innocuo.

**Evidenza** — api/src/documents/documents.controller.ts:249-257; api/src/documents/document-chronology.service.ts:93-103.

#### 14. `POST /tenant/backup/import?confirm=REPLACE → TenantBackupImportService.importFromZipBuffer`

**Comando** — Ripristina il tenant da un file di backup (solo titolare, con conferma esplicita).

**Il client manda** — LETTO. multipart con lo ZIP più il parametro `confirm=REPLACE`, che il controller esige e che è l'unica barriera (tenant-backup.controller.ts:48-70).

**Create vs update** — Non c'è la distinzione: ogni import è una SOSTITUZIONE integrale.

**A · prima creazione** — PROTETTO dalla semantica di sostituzione, non da una chiave. L'operazione svuota le tabelle operative del tenant (`purgeTenantData`, :65 e :144-285) e ricrea le righe con gli id contenuti nell'archivio (:357 e seguenti), tutto dentro una singola transazione (:65). Reinviando lo stesso ZIP si riparte dalla stessa cancellazione e si riscrive lo stesso contenuto: nessun record documentale in più, nessuna riga in più, nessun movimento in più — le stesse righe con gli stessi id. Nessun numero consumato dal motore di numerazione (i numeri arrivano dal file). Aggiornamenti anagrafici: ripetuti, ma con lo stesso esito.

**B · modifica** — Non applicabile: non esiste la modifica di un import. Ogni invio si comporta come una riscrittura completa.

**Causa tecnica** — Protegge perché ciò che si invia è uno STATO completo, non un incremento, e perché la cancellazione precede la riscrittura dentro la stessa transazione: non esiste una finestra in cui un reinvio possa accodarsi al risultato del precedente. ⚠️ Osservazione fuori mandato, riportata perché tocca l'entità di questa famiglia e l'ho letta cercando: `manual_receipts` NON compare nel backup — né in export, né nella purga, né nell'ordine di import (`grep -rn 'manualReceipt|manual_receipt' api/src/tenant/tenant-backup/` non restituisce nulla) — mentre la purga cancella `Location` (:206) e `manual_receipts.location_id` è una FK obbligatoria verso Location (schema.prisma:2682, :2704). Non è un problema di idempotenza: è un candidato da verificare separatamente.

**Evidenza** — api/src/tenant/tenant-backup.controller.ts:47-70; api/src/tenant/tenant-backup/tenant-backup-import.service.ts:44-90 (:65 transazione e purga), :144-285 (purga), :357+ (ricreazione); api/prisma/schema.prisma:2682, :2704.

#### 15. `POST /shopify/sync/orders → ShopifyOrdersPullService.pullOrders → ShopifySyncService.applyOrderFromShopify · POST /shopify/webhooks → ShopifyWebhookService.process`

**Comando** — Scarica gli ordini dal canale (pulsante Sincronizza) e ricezione dei webhook Shopify.

**Il client manda** — LETTO. Corpo vuoto per la sincronizzazione manuale (shopify.controller.ts:224-231); per il webhook, il payload dell'ordine con HMAC verificato e gli header topic/shop-domain (shopify-webhooks.controller.ts:19-46). In entrambi i casi il dato porta con sé un'identità ESTERNA (l'id ordine Shopify).

**Create vs update** — Sul valore esterno: `findFirst` per (tenantId, shopifyOrderId) e poi update oppure create (shopify-sync.service.ts:141-149, :202-215).

**A · prima creazione** — PROTETTO. Reinviare la sincronizzazione o rielaborare lo stesso webhook non crea un secondo SalesOrder: la ricerca per id esterno lo trova e passa al ramo di update, e se la ricerca fallisse per concorrenza il database ferma comunque il secondo con `@@unique([tenantId, shopifyOrderId])` (schema.prisma:1336) — la riga finisce nell'elenco `failed` del pull (shopify-orders-pull.service.ts:98-104), non in un doppione. Le righe si riscrivono per id esterno di riga (:216-222), quindi non si accodano. Movimenti dello scarico da vendita online: uno solo per riga, garantito dal vincolo `@@unique([sourceDocumentType, sourceLineId])` (schema.prisma:930), che quel percorso valorizza davvero (online-sale-fulfillment.service.ts:255-271). Impegni ed eventi: chiavati da `dedupeKey` (online-order-lifecycle.service.ts:108-124, online-sale-fulfillment.service.ts:165). Registri: il Registro Corrispettivi legge gli ordini una volta sola, perché il record è uno solo.

**B · modifica** — Coincide con il caso A: ogni passata è un aggiornamento del record identificato per id esterno, e riconcilia per differenza.

**Causa tecnica** — Impedisce il secondo record perché l'identità NON dipende dal fatto che il client conosca l'id assegnato da noi: arriva dall'esterno, è riproducibile a ogni tentativo, e ha un vincolo unico nel database che la fa rispettare anche sotto concorrenza (la lettura di :146 è fuori dalla transazione di :202, quindi da sola non basterebbe). ⚠️ È esattamente la proprietà che manca a tutte le scritture di origine INTERNA di questa famiglia: il Corrispettivo manuale, il movimento manuale, la sessione di inventario e l'allegato non hanno un'identità che il client possa ripetere, e infatti sono i quattro casi vulnerabili.

**Evidenza** — api/src/shopify/shopify.controller.ts:218-231; api/src/shopify/shopify-webhooks.controller.ts:14-46; api/src/shopify/shopify-sync.service.ts:137-222; api/src/shopify/shopify-orders-pull.service.ts:60-102; api/prisma/schema.prisma:1336, :930; api/src/order-reservations/online-sale-fulfillment.service.ts:165, :253-271; api/src/order-reservations/online-order-lifecycle.service.ts:108-124.

---

## 5. Moduli non ancora affrontati funzionalmente — registrato, non deciso

⛔ **Trasferimento e Rettifica non sono ancora stati affrontati funzionalmente.** Quanto segue è
**registrato come osservazione**, e vale una sola avvertenza, che è la più importante di questa
sezione:

> **Non trarre decisioni di dominio dal loro codice attuale, e non modificarli in T15.**

Quello che il codice fa oggi descrive uno stato di fatto, non una scelta di prodotto: le due
cose vanno separate quando quel modulo verrà affrontato.

### ⭐ Ma una cosa emersa qui va segnata subito, perché è un invariante fragile

La protezione del caso B su Trasferimento e Rettifica **non è** la riconciliazione per
`sourceLineId`, come sembrerebbe: per una riga ricreata con id nuovo quella riconciliazione **non
avviene affatto**, e il ramo `!movement` applica la quantità **piena** su origine e destinazione.

A impedire il raddoppio è il **ramo degli orfani**: la riga del primo salvataggio viene cancellata,
il suo movimento resta appeso, viene ritrovato per `sourceDocumentId`, **stornato per intero** e
cancellato. Somma zero.

> ⛔ **Quello storno funziona SOLO perché `sourceLineId` è una colonna UUID nuda, senza `@relation`
> verso `DocumentLine`** (`api/prisma/schema.prisma:909`). Con un `onDelete: Cascade` lì, il
> movimento sparirebbe insieme alla riga **prima** di poter essere stornato, e la giacenza
> resterebbe sbagliata.

⚠️ È una dipendenza da un'assenza, e nessuno l'ha dichiarata: chi un giorno "sistemasse" quella
colonna aggiungendole la relazione che sembra mancarle romperebbe la riconciliazione di
Trasferimento, Rettifica **e** di ogni altro percorso che si appoggia agli orfani, senza che
nessun test lo trovi.

### Trasferimento e Rettifica — 6

#### 1. `POST /documents → DocumentsService.create → createDocumentRecord → confirmDocumentTx (documents.service.ts:972 / :1006 / :2266). NON tocca transfer-adjustment-workflow.service.ts.`

**Comando** — Nuovo Trasferimento: l'operatore compila la maschera, preme «Salva documento», conferma il dialogo «Confermare il trasferimento?» e il documento nasce già confermato con le giacenze mosse.

**Il client manda** — LETTO in transfer-form.component.ts:1584-1637 (persistNewOrUpdate): { type: Transfer, documentDate, number: this.numbering.imposedNumber(), locationId, targetLocationId, currency, notes, internalComment, lines: [{ id: line.id || undefined, variantId, sku, description, quantity, unitPriceMinor: 0, loadsStock, serialNumbers }] }. NESSUN id di documento. NESSUNA chiave di richiesta: Idempotency-Key non compare né qui né nell'interceptor. `number` viaggia SOLO se l'operatore ha digitato il numero (document-numbering.store.ts:235-241: `isProposal()` → undefined); nel caso normale la testata mostra una proposta e il numero NON parte.

**Create vs update** — Lo decide il CLIENT, non il server: transfer-form.component.ts:1502 sceglie fra `saveTransfer(...)` e `persistNewOrUpdate(editId, raw)` in base a `confirmedEdit = isConfirmedEdit()` (:520-523 → doc caricato dalla rotta + `isConfirmedEditableDocumentStatus`). Senza `:id` nella rotta, `editDocumentId()` è null (:516) → si va sempre su POST /documents. Il server, da parte sua, non distingue niente: POST /documents crea e basta (documents.service.ts:1064 `tx.document.create`), non ha alcun parametro con cui riconoscere un reinvio.

**A · prima creazione** — VULNERABILE su tutta la linea. • SECONDO RECORD DOCUMENTALE: sì. `createDocumentRecord` esegue sempre `tx.document.create` (documents.service.ts:1064); non esiste nessuna lettura preventiva di «esiste già un documento uguale», nessun vincolo di unicità sul contenuto (schema.prisma, model Document: gli unici indici sono non-unici, righe 154-161). • SECONDO NUMERO CONSUMATO: sì, e con numero DIVERSO. Senza numero imposto, `confirmDocumentTx` assegna il primo libero sotto advisory lock (documents.service.ts:2334 → document-numbering.util.ts:338-341 e :366-377): il secondo documento prende il numero successivo, quindi la serie brucia due numeri per un'operazione sola. Non c'è un contatore da incrementare — il numero si ricalcola dai documenti esistenti — quindi il buco non è recuperabile se non annullando. ⚠️ CON numero IMPOSTO la guardia scatta ma NON protegge: l'indice unico parziale `documents_number_unique` (migration 20260815210000_credit_note_numerazione_condivisa/migration.sql:31-47, su tenant + tipo-numeratore + serie + numero) rifiuta il secondo insert → P2002 riconosciuto (document-numbering.util.ts:468-519) → 409; ma il dialogo di conflitto scrive in testata il PRIMO LIBERO (document-number-conflict.store.ts:59-80, `acknowledge()` restituisce `nextAvailable` e la maschera lo segna come scelto) e l'operatore ripreme Salva → il secondo documento nasce lo stesso, con un numero diverso. Il vincolo impedisce il NUMERO doppio, non il DOCUMENTO doppio. • RIGHE DUPLICATE: sì. Le righe si creano annidate nel `document.create` (documents.service.ts:1146 `lines: { create: ... }`): id nuovi, sempre. L'`id` che il client manda per le righe già salvate qui non ha nessun effetto — non c'è un documento su cui fare upsert. • MOVIMENTI FISICI DUPLICATI: sì, e SU ENTRAMBE LE SEDI. `confirmDocumentTx` chiama `syncTransferLineMovements` (documents.service.ts:2441); poiché le righe hanno id nuovi, `byLineId.get(line.id)` non trova nulla (document-stock-transfer-sync.util.ts:141-143) e per ogni riga si crea un movimento `transfer` nuovo con `applyInventoryDelta(-qty)` sull'ORIGINE e `applyInventoryDelta(+qty)` sulla DESTINAZIONE (:145-160). Il vincolo `@@unique([sourceDocumentType, sourceLineId])` (schema.prisma:930) non intercetta nulla: la chiave è la RIGA, e le righe del secondo documento sono righe nuove — esattamente lo stesso meccanismo già accertato su store-sales. Risultato misurabile: origine −2×qty, destinazione +2×qty, due movimenti nello Storico. `applyInventoryDelta` non blocca mai per quantità insufficiente (inventory-level-delta.util.ts:5-13, policy dichiarata) quindi l'origine può andare in negativo senza un errore. • IMPEGNI DUPLICATI: no. `applyInventoryDelta` scrive solo `onHand` e `available` (inventory-level-delta.util.ts:34-36); il trasferimento non tocca `committed` e non ha aggancio a ordini cliente (`concludeLinkedManualOrderTx` è riservato ai tipi di scarico, documents.service.ts:2428-2432). • LOTTI DUPLICATI: no. `applyInventoryLotsFromDocumentLines` ha un solo chiamante, goods-receipt-workflow.service.ts:23; il DTO trasferimento non porta `lotCode` (save-transfer.dto.ts) e nemmeno il body del client. • AGGIORNAMENTI ANAGRAFICI RIPETUTI: nessuno. Il percorso non scrive prezzi/costi di variante (nessun `productVariant.update` in transfer-adjustment-workflow.service.ts; grep verificato) — l'aggiornamento costo è dell'Arrivo merce. • EFFETTI ECONOMICI / REGISTRI / RIEPILOGHI: nessun effetto economico (righe a `unitPriceMinor: 0` / `lineTotalMinor: 0`) e nessun Registro Corrispettivi: `DocumentType.transfer` non compare in nessun modulo API fuori da `documents/` salvo auth/document-permission.util.ts:41 (grep verificato). Si duplicano invece: la riga nell'elenco Documenti, i due movimenti nello Storico movimenti, e il push inventario ai canali (`pushInventoryLevels`, documents.service.ts:1156-1163) che pubblica su Shopify/TikTok una giacenza sbagliata su ENTRAMBE le sedi. • UNICA PROTEZIONE PARZIALE, e vale solo per una minoranza di articoli: se il prodotto ha `inventoryTracking: serial`, il secondo invio muore su `assertSerialNumbersForTransferLines` (documents.service.ts:2435 → inventory-serial.util.ts:190-197 → :145-187), perché i seriali dopo il primo trasferimento non sono più in stock all'ORIGINE → UnprocessableEntity e rollback. Per gli articoli a tracciamento quantità — il caso normale — non esiste nessun blocco.

**B · modifica** — NON APPLICABILE a questo endpoint, ed è dimostrabile: POST /documents non accetta un id di documento e non ha un ramo di aggiornamento. Il percorso generico di modifica è un'altra rotta (PATCH /documents/:id, documents.controller.ts:435 → documents.service.ts:1432) e su un Trasferimento già confermato è CHIUSO da una guardia esplicita: `hasPerLineMovements` conta i movimenti con `sourceLineId != null` e, trovandone, risponde 409 «Questo documento usa movimenti per riga: aggiornalo dal suo flusso dedicato, non con PATCH» (documents.service.ts:1503-1522). La guardia però impedisce il PERCORSO, non una duplicazione: un Trasferimento in stato `draft` senza movimenti (residuo storico — con la nascita-confermato non se ne creano più) la attraversa, e lì il PATCH ricrea le righe. Non l'ho misurato, è dedotto dalla lettura della condizione.

**Causa tecnica** — Non c'è alcun meccanismo di deduplicazione: nessuna chiave di richiesta, nessun vincolo sul contenuto, e la sola guardia esistente (indice unico sul numero) si attiva solo quando l'operatore impone il numero — e in quel caso il flusso client la aggira scrivendo in testata il primo libero e invitando a risalvare. Il vincolo `@@unique([sourceDocumentType, sourceLineId])` non è una protezione contro il reinvio della CREAZIONE: protegge una riga dal ricevere due movimenti, ma il secondo documento porta righe nuove con id nuovi, quindi produce legittimamente il suo secondo movimento. Il blocco sui seriali è reale ma copre solo i prodotti a tracciamento `serial`.

**Evidenza** — src/app/features/documents/transfer-form.component.ts:1480-1523, :1584-1637 · src/app/domain/documents/services/document.service.ts:34, :198-202 · api/src/documents/documents.controller.ts:425 · api/src/documents/documents.service.ts:972, :1006, :1058, :1064, :1142, :1146, :1156-1163, :2334, :2435, :2441 · api/src/documents/document-stock-transfer-sync.util.ts:118-124, :141-160 · api/src/inventory/inventory-level-delta.util.ts:5-13, :31-37 · api/src/inventory/inventory-serial.util.ts:145-197 · api/prisma/schema.prisma:906-909, :930 · api/prisma/migrations/20260815210000_credit_note_numerazione_condivisa/migration.sql:31-47 · src/app/domain/documents/state/document-number-conflict.store.ts:59-80 · src/app/domain/documents/state/document-numbering.store.ts:235-241

#### 2. `POST /documents (type=adjustment) → DocumentsService.create → createDocumentRecord → confirmDocumentTx (documents.service.ts:972 / :1006 / :2266). NON tocca transfer-adjustment-workflow.service.ts.`

**Comando** — Nuova Rettifica di inventario: l'operatore sceglie sede, direzione (aumento/diminuzione), scrive il motivo obbligatorio, compila le righe e preme «Salva documento»; il documento nasce già confermato con la giacenza rettificata.

**Il client manda** — LETTO in stock-operation-form.component.ts:1576-1629 (persistNewOrUpdate): { type, documentDate, number: imposedNumberForSubmit(), locationId, adjustmentDirection, currency, notes, internalComment, lines: [{ id: line.id || undefined, variantId, sku, description, quantity, unitPriceMinor: 0, loadsStock, serialNumbers }] }. Nessun id di documento, nessuna chiave di richiesta. Come per il Trasferimento, `number` parte solo se digitato (:1541-1552 → document-numbering.store.ts:235-241).

**Create vs update** — Lo decide il client: stock-operation-form.component.ts:1485-1511 sceglie `saveAdjustment(...)` solo se `confirmedEdit && isAdjustment()`, altrimenti `persistNewOrUpdate(editId, raw)` → `createDocument` quando `editId` è null (:1627-1629). ⚠️ Da segnalare come comportamento tecnico osservato: la STESSA maschera serve anche lo Scarico manuale, che il commento a :1482-1486 dichiara escluso dalla migrazione e tenuto sempre sul percorso generico. Il server non distingue nulla: POST /documents crea e basta.

**A · prima creazione** — VULNERABILE, con la stessa anatomia del Trasferimento e una sola sede coinvolta. • SECONDO RECORD DOCUMENTALE: sì — `tx.document.create` incondizionato (documents.service.ts:1064), nessun vincolo di unicità sul contenuto. Il motivo obbligatorio (`internalComment`, validato in transfer-adjustment-workflow.service.ts:463-467 e lato client) NON è una chiave: due rettifiche con lo stesso motivo sono perfettamente legittime. • SECONDO NUMERO CONSUMATO: sì, diverso, per lo stesso meccanismo (documents.service.ts:2334 → document-numbering.util.ts:338-341). Con numero imposto: 409 dall'indice `documents_number_unique`, poi il dialogo scrive il primo libero in testata (document-number-conflict.store.ts:59-80) e il secondo documento nasce comunque. • RIGHE DUPLICATE: sì, id nuovi (`lines: { create: ... }`, documents.service.ts:1146). • MOVIMENTI FISICI DUPLICATI: sì. `confirmDocumentTx` chiama `syncAdjustmentLineMovements` (documents.service.ts:2408); righe nuove ⇒ `byLineId.get(line.id)` vuoto (document-stock-adjustment-sync.util.ts:141-143) ⇒ per ogni riga un movimento `adjustment` nuovo con `applyInventoryDelta(signedDelta(direction, qty))` (:145-152). Risultato: la sede prende ±2×qty invece di ±qty, con due movimenti di rettifica nello Storico. Con direzione `decrease` la giacenza può scendere sotto zero senza errore (inventory-level-delta.util.ts:5-13). • IMPEGNI DUPLICATI: no (`applyInventoryDelta` muove solo `onHand` e `available`, inventory-level-delta.util.ts:34-36). • LOTTI DUPLICATI: no (nessun chiamante di `applyInventoryLotsFromDocumentLines` fuori da goods-receipt-workflow.service.ts:23; `lotCode` assente dal DTO rettifica). • AGGIORNAMENTI ANAGRAFICI RIPETUTI: nessuno. • EFFETTI ECONOMICI / REGISTRI: nessuno — righe a zero, e `DocumentType.adjustment` non compare in nessun modulo API fuori da `documents/` salvo auth/document-permission.util.ts:43. Si duplicano la riga in elenco Documenti, i movimenti nello Storico, e il push inventario pubblica ai canali una giacenza sbagliata (documents.service.ts:1156-1163). • PROTEZIONE PARZIALE, solo articoli a tracciamento `serial`: con `decrease` il secondo invio muore su `assertSerialNumbersForUnloadLines` (documents.service.ts:2422) perché i seriali sono già `consumed`; con `increase` muore su `applyInventorySerialsFromDocumentLines` (:2427 → inventory-serial.util.ts:200-231, che fa `inventorySerial.create`) contro `@@unique([tenantId, serialNumber])` (schema.prisma, model InventorySerial). ⚠️ Quel P2002 NON è riconosciuto come conflitto di numero — `isDocumentNumberConflict` filtra sul modello e ammette solo Document/SalesOrder/SupplierOrder/ManualReceipt (document-numbering.util.ts:468-519) — quindi l'errore viene rilanciato grezzo: rollback corretto, ma all'operatore arriva un 500. Per gli articoli a tracciamento quantità nessun blocco di alcun tipo.

**B · modifica** — NON APPLICABILE a questo endpoint: POST /documents non accetta un id e non ha ramo di aggiornamento. Il PATCH generico su una Rettifica già confermata è chiuso dalla stessa guardia del Trasferimento — `hasPerLineMovements` ⇒ 409 «Questo documento usa movimenti per riga: aggiornalo dal suo flusso dedicato, non con PATCH» (documents.service.ts:1503-1522). La modifica vive sulla riga successiva di questo inventario.

**Causa tecnica** — Nessuna deduplicazione: niente chiave di richiesta, niente vincolo sul contenuto. L'indice unico sul numero si attiva solo col numero imposto e il flusso client lo converte in «prendi il primo libero e risalva», cioè in un secondo documento. Il vincolo `@@unique([sourceDocumentType, sourceLineId])` non è pertinente al reinvio della creazione: le righe del secondo documento sono nuove. Il vincolo `@@unique([tenantId, serialNumber])` blocca davvero, ma solo per i prodotti a tracciamento seriale e con un 500 invece di un messaggio.

**Evidenza** — src/app/features/documents/stock-operation-form.component.ts:1461-1533, :1576-1629 · src/app/domain/documents/services/document.service.ts:198-202 · api/src/documents/documents.controller.ts:425 · api/src/documents/documents.service.ts:1064, :1146, :1156-1163, :2334, :2408, :2422-2429, :1503-1522 · api/src/documents/document-stock-adjustment-sync.util.ts:118-124, :141-152 · api/src/inventory/inventory-level-delta.util.ts:5-13, :31-37 · api/src/inventory/inventory-serial.util.ts:200-231 · api/src/documents/document-numbering.util.ts:338-341, :468-519 · api/prisma/schema.prisma (model InventorySerial, @@unique([tenantId, serialNumber])) · api/prisma/migrations/20260815210000_credit_note_numerazione_condivisa/migration.sql:31-47

#### 3. `POST /documents/transfer/save → TransferAdjustmentWorkflowService.saveTransfer (documents.controller.ts:178-186 → transfer-adjustment-workflow.service.ts:211).`

**Comando** — Modifica di un Trasferimento GIÀ CONFERMATO: l'operatore apre il documento dalla riga di elenco, preme «Sblocca e modifica», cambia quantità/righe/sedi/data e preme «Salva documento».

**Il client manda** — LETTO in transfer-form.component.ts:1527-1560 (buildSaveTransferBody): { id: editId, documentDate, number: this.numbering.imposedNumber(), series: this.numbering.chosenSeries(), locationId, targetLocationId, notes, internalComment, lines: [{ id: line.id || undefined, variantId, sku, description, quantity, loadsStock, serialNumbers }] }. L'id del DOCUMENTO c'è sempre. L'id di RIGA c'è solo per le righe già persistite: una riga aggiunta dall'operatore parte senza id (`line.id || undefined`, :1521). In modifica il numero viaggia SEMPRE ed è quello del documento (document-numbering.store.ts:200-206 e :235-241: `isEdit()` ⇒ non è una proposta).

**Create vs update** — Il server non fa upsert: `dto.id` è obbligatorio (save-transfer.dto.ts:68 `@IsUUID() id!: string`) e la transazione apre con `tx.document.findFirst({ id: dto.id, tenantId, type: transfer })` che, se non trova, solleva 404 (transfer-adjustment-workflow.service.ts:270-276). Questo endpoint NON crea documenti in nessun ramo. In più rifiuta ciò che non è una modifica di confermato: 409 su `cancelled` (:277-279) e 409 se lo stato non è in {confirmed, printed, sent} (:280-284, costante :52-56).

**A · prima creazione** — IMPOSSIBILE per costruzione, e la dimostrazione è la firma stessa: senza un `id` esistente e appartenente al tenant e di tipo `transfer`, la richiesta esce con 404 prima di toccare qualunque cosa (transfer-adjustment-workflow.service.ts:270-276). Non esiste un percorso in cui questo endpoint scriva un secondo Document, consumi un secondo numero o crei righe su un documento nuovo. La prima creazione di un Trasferimento passa esclusivamente da POST /documents (riga precedente di questo inventario), ed è lì che il difetto vive.

**B · modifica** — IN GRAN PARTE RICONCILIATO PER DIFFERENZA, con UNA duplicazione residua di record. • SECONDO RECORD DOCUMENTALE: no, vedi sopra. • SECONDO NUMERO CONSUMATO: no. `resolveImposedNumber` corto-circuita quando né numero né serie cambiano: `numberChanged = dto.number != null && dto.number !== existing.number`, e se `!numberChanged && series === current` restituisce numero e riferimento esistenti senza toccare né lock né contatore (transfer-adjustment-workflow.service.ts:143-146). Al reinvio `existing` è riletto DENTRO la transazione (:270-273), quindi porta già il numero scritto dal primo invio: vale anche quando l'operatore aveva imposto un numero nuovo — al secondo giro quel numero È `existing.number` e non viene riassegnato. • RIGHE DUPLICATE: no, per le righe già persistite. `incomingIds` tiene solo gli id che il documento ha davvero (:305-309), il `deleteMany ... id notIn incomingIds` le risparmia (:321-323) e ognuna viene `update`ata con gli stessi valori (:340-342). • MOVIMENTI FISICI DUPLICATI: no. `syncTransferLineMovements` ritrova il movimento via `sourceLineId` (document-stock-transfer-sync.util.ts:118-124, :141), e con `shapeChanged` falso e `quantityDelta === 0` NON chiama `applyInventoryDelta` su nessuna delle due sedi (:190-231): né l'origine né la destinazione si muovono. Anche `needsUpdate` resta falso se sku, causale e data non cambiano (:233-243). È coperto da test: document-stock-transfer-sync.util.spec.ts:265 «nessuna modifica: salvataggio idempotente, nessun update». Vale anche per il reinvio di una modifica VERA (3→5 pezzi): al secondo giro il movimento porta già 5, il delta è 0, le due sedi restano ferme. • SERIALI: riconciliati. `reverseTransferInventorySerialsForDocument` riporta i seriali all'origine e stacca `documentLineId` PRIMA della modifica righe (:313-319 → inventory-serial.util.ts:344-368), poi `transferInventorySerialsFromDocumentLines` li rimanda a destinazione (:369-375 → inventory-serial.util.ts:277-315). Reinvio identico ⇒ stesso stato finale. • IMPEGNI / LOTTI / ANAGRAFICA / EFFETTI ECONOMICI: nessuno, per le stesse ragioni della riga precedente (righe forzate a `unitPriceMinor: 0`, transfer-adjustment-workflow.service.ts:334-336; nessuna scrittura su variante; nessun registro fiscale). • ⚠️ LA DUPLICAZIONE CHE RESTA — riguarda una RIGA AGGIUNTA nella modifica, e produce record spurii, non stock sbagliato. Una riga nuova viaggia senza id; il primo invio la crea con un id che il client non riceverà mai. Al reinvio la stessa riga torna ancora senza id, quindi non è in `incomingIds` e il `deleteMany` CANCELLA la riga creata dal primo invio (:321-323), che viene poi ricreata con un id nuovo (:343-345). Il movimento della riga cancellata resta orfano — `StockMovement.sourceLineId` è una colonna nuda, senza FK verso `DocumentLine` (schema.prisma:906-909) — e il sync lo raccoglie nel giro finale, lo elimina e ne storna l'effetto su entrambe le sedi (document-stock-transfer-sync.util.ts:285-303), mentre la riga nuova ne crea un altro (:143-160). Effetto sulla giacenza: NETTO ZERO, corretto. Effetto sui record: id di riga e id di movimento cambiati (chi avesse annotato il movimento non lo ritrova), e soprattutto `sync.deltas` NON è vuoto — contiene +qty e −qty — quindi `recordRevision` scrive una SECONDA revisione documentale con riepilogo «giacenza: SKU +3, SKU −3», che afferma due movimenti di magazzino mai avvenuti (:403-405 → :678-701). È il tipo di rumore nel registro che regole-gestionale vieta esplicitamente. Questo passaggio è LETTO nel codice, non eseguito.

**Causa tecnica** — IMPEDISCE: la nascita di un secondo documento (id obbligatorio + 404), il consumo di un secondo numero (corto-circuito su numero e serie invariati), la duplicazione delle righe già persistite (upsert per id) e — il punto che conta — la doppia applicazione della giacenza su ORIGINE e DESTINAZIONE, perché la riconciliazione è per differenza sul movimento agganciato a `sourceLineId`, non una riapplicazione. LASCIA POSSIBILE: la ricreazione con id nuovi di una riga aggiunta in modifica (il client non conosce l'id assegnato dal primo invio) e, come conseguenza diretta, una revisione documentale spuria che dichiara un +qty e un −qty che non corrispondono a nessun evento fisico. La guardia di stato (`CONFIRMED_EDITABLE_STATUSES`) qui non c'entra col reinvio: impedisce di usare questa rotta su un documento annullato o non confermato, non impedisce nulla al secondo invio dello stesso comando.

**Evidenza** — api/src/documents/transfer-adjustment-workflow.service.ts:122-170, :211-228, :270-284, :305-323, :325-347, :354-375, :377-405, :678-701 · api/src/documents/dto/save-transfer.dto.ts:68 · api/src/documents/documents.controller.ts:178-186 · api/src/documents/document-stock-transfer-sync.util.ts:118-124, :141-160, :190-243, :285-303 · api/src/documents/document-stock-transfer-sync.util.spec.ts:265 · api/src/inventory/inventory-serial.util.ts:277-315, :344-368 · api/prisma/schema.prisma:906-909, :930 · src/app/features/documents/transfer-form.component.ts:1502, :1521, :1527-1560 · src/app/domain/documents/services/document.service.ts:237-239

#### 4. `POST /documents/adjustment/save → TransferAdjustmentWorkflowService.saveAdjustment (documents.controller.ts:195-203 → transfer-adjustment-workflow.service.ts:432).`

**Comando** — Modifica di una Rettifica GIÀ CONFERMATA: l'operatore apre il documento, sblocca la modifica, cambia righe/quantità/direzione/sede/motivo e preme «Salva documento».

**Il client manda** — LETTO in stock-operation-form.component.ts:1487-1510: { id: editId, documentDate, number: imposedNumberForSubmit(), series: chosenSeries(), locationId, adjustmentDirection, notes, internalComment (obbligatorio), lines: [{ id: line.id || undefined, variantId, sku, description, quantity, loadsStock, serialNumbers }] }. Id documento sempre presente; id riga solo per le righe già persistite.

**Create vs update** — Come il Trasferimento: `dto.id` obbligatorio (save-adjustment.dto.ts:70) e `tx.document.findFirst({ id: dto.id, tenantId, type: adjustment })` → 404 se non trovato (transfer-adjustment-workflow.service.ts:479-485). Nessun ramo di creazione. Rifiuta con 409 il documento annullato (:486-488) e quello non in {confirmed, printed, sent} (:489-493).

**A · prima creazione** — IMPOSSIBILE per costruzione: senza un id esistente del tenant e di tipo `adjustment` la richiesta esce con 404 prima di scrivere qualunque cosa (transfer-adjustment-workflow.service.ts:479-485). Questo endpoint non produce mai un secondo Document, non consuma numeri e non crea righe su un documento nuovo.

**B · modifica** — RICONCILIATO PER DIFFERENZA, con la stessa singola duplicazione residua di record del Trasferimento. • SECONDO RECORD DOCUMENTALE: no. • SECONDO NUMERO CONSUMATO: no — `resolveImposedNumber` esce subito se numero e serie non cambiano (transfer-adjustment-workflow.service.ts:578-586 → :143-146), e al reinvio `existing` è riletto dentro la transazione (:479-482), quindi porta già il numero del primo invio. • RIGHE DUPLICATE: no per le righe già persistite — `incomingIds` le protegge dal `deleteMany` (:515-523) e vengono `update`ate con gli stessi valori (:540-542). • MOVIMENTI FISICI DUPLICATI: no. `syncAdjustmentLineMovements` ritrova il movimento via `sourceLineId` (document-stock-adjustment-sync.util.ts:118-124, :141); con `shapeChanged` falso (stessa sede, stessa direzione, stessa variante) e `quantityDelta === 0` non chiama `applyInventoryDelta` (:180-203). Test esistente: document-stock-adjustment-sync.util.spec.ts:269. Vale anche per il reinvio di una modifica vera: il movimento porta già la quantità nuova, il delta è 0. • SERIALI: riconciliati, e in modo asimmetrico per direzione — `decrease` ⇒ `restoreConsumedSerialsForDocument` riporta i seriali a `in_stock` prima della modifica e `consumeInventorySerialsFromDocumentLines` li riconsuma dopo (:509-513, :571-573); `increase` ⇒ `reverseInventorySerialsForDocument` li cancella e `applyInventorySerialsFromDocumentLines` li ricrea (:512, :575). In entrambi i casi il reinvio identico riproduce lo stesso stato, e la `create` dell'increase non collide con `@@unique([tenantId, serialNumber])` proprio perché la cancellazione la precede nella stessa transazione. • IMPEGNI / LOTTI / ANAGRAFICA / EFFETTI ECONOMICI: nessuno (righe a `unitPriceMinor: 0`, :534-536; nessuna scrittura su variante; nessun registro fiscale). • ⚠️ LA DUPLICAZIONE CHE RESTA, identica al Trasferimento: una riga AGGIUNTA in modifica viaggia senza id (stock-operation-form.component.ts:1504 `id: line.id || undefined`); il primo invio la crea con un id che il client non conosce, il reinvio non la riconosce, il `deleteMany` cancella la riga del primo invio (:521-523) e la ricrea con id nuovo (:543-545). Il movimento della riga cancellata resta orfano (nessuna FK, schema.prisma:906-909), viene raccolto nel giro finale, eliminato e stornato (document-stock-adjustment-sync.util.ts:254-268), mentre la riga nuova ne crea un altro. Giacenza finale corretta; ma id riga e id movimento cambiano, e `sync.deltas` contiene +qty e −qty ⇒ `recordRevision` scrive una SECONDA revisione con un riepilogo giacenza che afferma due rettifiche mai avvenute (:601-603 → :678-701). Letto nel codice, non eseguito.

**Causa tecnica** — IMPEDISCE: secondo documento (id obbligatorio + 404), secondo numero (corto-circuito su numero/serie invarianti), righe già persistite duplicate (upsert per id) e doppia applicazione della rettifica in giacenza (riconciliazione per differenza sul movimento agganciato a `sourceLineId`). LASCIA POSSIBILE: la ricreazione con id nuovi di una riga aggiunta in modifica, e la revisione documentale spuria che ne consegue. La guardia di stato non protegge dal reinvio: filtra su quali documenti questa rotta accetta, non su quante volte lo stesso comando viene eseguito.

**Evidenza** — api/src/documents/transfer-adjustment-workflow.service.ts:432-467, :479-499, :503-523, :525-547, :554-576, :578-603, :678-701 · api/src/documents/dto/save-adjustment.dto.ts:70 · api/src/documents/documents.controller.ts:195-203 · api/src/documents/document-stock-adjustment-sync.util.ts:118-124, :141-152, :180-243, :254-268 · api/src/documents/document-stock-adjustment-sync.util.spec.ts:269 · api/src/inventory/inventory-serial.util.ts:200-231, :234-270, :321-342, :370-380 · src/app/features/documents/stock-operation-form.component.ts:1487-1510, :1504

#### 5. `Maschera transfer-form → POST /documents (createDocument) o PATCH /documents/:id (updateDocument) sul primo salvataggio; POST /documents/transfer/save (saveTransfer) sulla modifica di un documento già confermato — transfer-form.component.ts:1502-1503, document.service.ts:198-201,235-238,307-311`

**Comando** — Trasferimento fra sedi: l'operatore compila e preme «Salva documento», poi conferma nel dialogo «Confermare il trasferimento?»

**Il client manda** — LETTO. Sul percorso generico: `persistNewOrUpdate(editId, raw)` (:1595-1637) chiama `updateDocument(editId, body)` se `editId` esiste, altrimenti `createDocument(body)`. Sul percorso dedicato: `buildSaveTransferBody(editId!, raw)` con `id: editId` (:1532+). `editId = this.editDocumentId()` (:1489), computed sul parametro di rotta (:516). Nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms.

**Create vs update** — LETTO. Solo `editDocumentId()`, cioè il parametro di rotta. Esiste un signal `loadedDocument` (:519) ma NON viene usato per costruire il corpo, e il ramo `next` non lo scrive: `persist()` naviga via (`router.navigate([this.listPath, doc.id])`, :1512).

**A · prima creazione** — (a) Doppio clic PROTETTO: il pulsante è `[disabled]="formReadOnly() || saving()"` / `[disabled]="saving()"` (html:666-667,670,685,687) e `persist()` riguarda `if (this.formReadOnly() || this.saving()) return;` (:1481-1483) con `_submitState` a 'saving' sincrono (:1496). Due finestre in cui `saving()` è ancora false vanno però nominate: (i) il dialogo di conferma dell'operazione NON ha `[busy]` (html:714-721) — è però `confirmAndSave()` a chiuderlo per primo in modo sincrono (`this.confirmDialogOpen.set(false)`, :1387) e la guardia di `persist()` resta l'ultima rete; (ii) il controllo cronologico (`this.chronology.run(...)`, :1370 e :1388) è una chiamata HTTP che precede l'invio, ma è coalescata dal campo `sospeso` della guardia condivisa (document-chronology-guard.ts:67,113-117), quindi un secondo passaggio non produce un secondo salvataggio.
(b) Al fallimento il form SOPRAVVIVE: il ramo `error` scrive solo `_submitState` (:1514-1523); sul conflitto di numero torna a 'idle' e apre il dialogo (:1516-1521). Il messaggio generico è «Operazione non riuscita.» (:1707-1712). L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO l'id NON viene memorizzato in maschera: si naviga al Dettaglio (:1512). Se la navigazione avviene il problema non si pone (la maschera non c'è più); se NON avviene — ed è esattamente il caso della risposta persa, dove `next` non gira affatto — la maschera resta su /new con `editDocumentId()` null. Il reinvio è quindi una seconda creazione.

**B · modifica** — In modifica `editDocumentId()` è valorizzato e viaggia sempre: sul documento confermato via `saveTransfer` con `id: editId` e righe con `id: line.id || undefined` (:1532+), altrimenti via `updateDocument(editId, body)`. Il reinvio indirizza lo stesso record. Lato client nulla genera id nuovi per le righe già salvate; le righe aggiunte dopo l'ultimo salvataggio hanno `id` vuoto e verrebbero rimandate senza id anche al secondo invio — esito lato server, fuori perimetro.

**Causa tecnica** — Impedisce il doppio clic (guardia `saving()` in `persist()` + pulsante disabilitato + chiusura sincrona del dialogo + coalescing cronologico). NON impedisce la seconda creazione dopo risposta persa: l'identità del documento vive SOLO nell'URL, e la sola cosa che l'avrebbe scritta — la navigazione al Dettaglio — sta dentro il ramo `next`, che con la risposta persa non viene mai eseguito.

**Evidenza** — src/app/features/documents/transfer-form.component.ts:516,519,706,1369-1371,1373-1378,1386-1389,1481-1489,1496,1502-1512,1514-1523,1532-1545,1595-1637,1707-1712; src/app/features/documents/transfer-form.component.html:46,666-687,714-721,779-789; src/app/domain/documents/services/document.service.ts:198-201,235-238,307-311

#### 6. `Maschera stock-operation-form (rotte documents/adjustment/new e adjustment/:id/edit) → POST /documents o PATCH /documents/:id sul primo salvataggio; POST /documents/adjustment/save sulla modifica di una rettifica già confermata — stock-operation-form.component.ts:1485-1512,1628-1629, document.service.ts:245-250`

**Comando** — Rettifica inventario: l'operatore compila e preme «Salva documento», poi conferma nel dialogo

**Il client manda** — LETTO. `editId = this.editDocumentId()` (:1471), computed sul parametro di rotta (:327). Il corpo dedicato porta `id: editId!` e righe con `id: line.id || undefined` (:1487,1505). Nessun header di idempotenza, nessun id generato dal client. Timeout 15000 ms.

**Create vs update** — LETTO. Solo `editDocumentId()`, cioè il parametro di rotta. Il signal `loadedDocument` (:345) esiste ma non entra nella costruzione del corpo e non viene scritto nel ramo `next`.

**A · prima creazione** — (a) Doppio clic PROTETTO: pulsanti `[disabled]="formReadOnly() || saving()"` / `[disabled]="saving()"` (html:698-699,702,717,719), `persist()` riguarda `if (this.formReadOnly() || this.saving()) return;` (:1462-1463) e mette 'saving' sincrono (:1478). Stesse due finestre del Trasferimento: il dialogo di conferma dell'operazione NON ha `[busy]` (html:746-753) ma viene chiuso sincronamente da `confirmAndSave()`; il controllo cronologico precede l'invio (:1352,:1369) ed è coalescato dalla guardia condivisa.
(b) Al fallimento il form SOPRAVVIVE: `error` scrive solo `_submitState` (:1526-1533), con il ramo dedicato al conflitto di numero. L'operatore può ripremere.
(c) Dopo un salvataggio RIUSCITO l'id NON viene memorizzato: si naviga al Dettaglio (:1522). Con la risposta persa `next` non gira, la maschera resta su /new e `editDocumentId()` resta null: il reinvio è una seconda creazione.

**B · modifica** — In modifica `editDocumentId()` è valorizzato e viaggia sempre; il percorso dedicato `saveAdjustment` manda `id` e gli id di riga (:1487,1505) proprio perché — dice il commento :1479-1484 — i movimenti per riga si aggiornino invece di duplicarsi. Il reinvio indirizza lo stesso record.

**Causa tecnica** — Identico al Trasferimento: impedisce il doppio clic, non impedisce la seconda creazione dopo risposta persa, perché l'identità del documento vive solo nell'URL e la scrittura di quell'URL sta dentro il ramo `next`.

**Evidenza** — src/app/features/documents/stock-operation-form.component.ts:327,345,598,1352,1369,1462-1478,1485-1512,1516-1522,1526-1533,1628-1629; src/app/features/documents/stock-operation-form.component.html:51,698-719,746-753,817; src/app/features/documents/documents.routes.ts:468-491; src/app/domain/documents/services/document.service.ts:245-250

---

## 6. Fuori dal perimetro T15

Emersi dal censimento, **reali**, e deliberatamente lasciati fuori. Registrati qui perché non si
perdano, non perché si facciano ora.

### 6.1 ⭐ Conta inventario — la seconda scansione si PERDE

⛔ **Non è duplicazione: è il difetto di segno opposto**, ed è per questo che non appartiene a T15.

`incrementLineCount` calcola l'incremento **sul client**, da stato locale
(`inventory-count-detail.component.ts:335`), e lo stato locale si aggiorna **solo nel ramo `next`**
(`:379`). Il percorso dello scanner **non ha guardia in volo**: `savingLineId` disabilita soltanto
l'`<input>` manuale (`inventory-count-detail.component.html:227`), non la scansione.

Conseguenza: due passate dello stesso barcode mentre la prima `PATCH` è in volo mandano lo
**stesso valore assoluto**. Il reinvio è innocuo — e questo è il motivo per cui il comando risulta
`PROTETTO` nella mappa rispetto alla duplicazione — ma **la seconda scansione non viene contata**.

⚠️ In un inventario fisico un pezzo non contato è un ammanco che compare come rettifica, ed è
esattamente il tipo di errore che nessuno attribuisce alla causa giusta.

### Conta inventario — 5

#### 1. `POST /inventory/counts → InventoryCountService.create`

**Comando** — Avvia una sessione di inventario fisico: sceglie la sede, il nome, le note e conferma.

**Il client manda** — LETTO. CreateInventoryCountDto: locationId, name, notes (inventory-count-new.component.ts:118-124). Nessuna chiave di richiesta. Guardia in-flight `submitting()` (:112).

**Create vs update** — Solo per assenza di id in rotta. Non esiste un PATCH di testata sessione: il controller espone POST, PATCH sulla singola riga, submit, finalize, cancel e DELETE (inventory.controller.ts:288-360).

**A · prima creazione** — VULNERABILE. Al reinvio nasce una SECONDA sessione con tutte le sue righe: `inventoryCountSession.create` (:155-165) seguito da `inventoryCountLine.createMany` su tutti i livelli della sede (:167-178), senza alcuna ricerca di una sessione equivalente. Il modello non porta vincoli unici — solo due indici, `@@index([tenantId, status])` e `@@index([tenantId, createdAt])` (schema.prisma:858-859) — quindi nemmeno il nome ripetuto viene rifiutato. RIGHE DUPLICATE: sì, l'intera fotografia della sede una seconda volta. Movimenti, impegni, lotti: nessuno in questo momento — la sessione è ancora solo una fotografia. Nessun numero consumato, nessun aggiornamento anagrafico, nessun effetto economico immediato. ⚠️ L'effetto arriva dopo: due sessioni gemelle sulla stessa sede possono essere ENTRAMBE concluse, e a quel punto la seconda calcola i propri delta contro `systemQuantity` fotografato PRIMA che la prima applicasse le sue rettifiche (il valore è congelato alla creazione, :175) — le rettifiche della prima verrebbero riapplicate.

**B · modifica** — Non applicabile alla testata. La modifica che esiste è quella della singola riga (voce successiva) e usa un id noto.

**Causa tecnica** — Nessun meccanismo lato server. La transazione (:154) garantisce che sessione e righe nascano insieme, cioè che non resti una sessione monca — non che non ne nasca una seconda: è esattamente la distinzione fra atomicità e idempotenza. Lato client la sola guardia in-flight (:112), che al timeout lascia il pulsante di nuovo attivo (:126-141).

**Evidenza** — api/src/inventory/inventory.controller.ts:288-297; api/src/inventory/inventory-count.service.ts:125-180; api/prisma/schema.prisma:838-878 (:858-859 indici, nessun @@unique); src/app/features/inventory/inventory-count-new.component.ts:110-146; src/app/domain/inventory/services/inventory.service.ts:367-371.

#### 2. `POST /inventory/counts/:id/finalize → InventoryCountService.finalize`

**Comando** — Conclude l'inventario fisico: applica le rettifiche contate.

**Il client manda** — LETTO. Corpo vuoto `{}`, id in rotta (src/app/domain/inventory/services/inventory.service.ts:389-393). Guardia in-flight `actionPending()` (inventory-count-detail.component.ts:318-324).

**Create vs update** — Transizione di stato su un id noto; ma è il comando che PRODUCE effetti nuovi — movimenti di rettifica, giacenze e un documento di inventario.

**A · prima creazione** — Il reinvio SEQUENZIALE dopo il commit è respinto: `status !== review` → 409 (:265-269). Il record non si riesegue. ⚠️ Il reinvio CONCORRENTE no: la sessione è letta FUORI dalla transazione (:257-262), la guardia è valutata lì (:265), e la transazione parte dopo (:278). Due finalize sovrapposti — due schede, due operatori, o un doppio clic che superi la guardia client — leggono entrambi `review`, passano entrambi, e applicano entrambi: GIACENZA rettificata DUE volte (applyDelta con increment, :285 → inventory-level-delta.util.ts:34-37), DUE stockMovement per riga, DUE documenti di inventario creati e confermati (:324-347) con DUE numeri documento consumati, e due push inventario verso i canali (:313-320). Impegni e lotti: non toccati da questo percorso. Nessun effetto sul Registro Corrispettivi (il documento `inventory` non è una vendita). ⚠️ Esiste una chiave deterministica e NON è vincolata: `externalRef: 'inventory-count:<sessionId>:<lineId>'` (:298) è esattamente il valore che riconoscerebbe il doppione, ma la colonna non ha indice unico — schema.prisma:904 la dichiara `String?` e l'unico vincolo del modello è su (sourceDocumentType, sourceLineId), :930, che questo percorso non valorizza.

**B · modifica** — Non applicabile: una sessione conclusa non si modifica e non si annulla (cancel la rifiuta esplicitamente, :368-374). Va però registrato un effetto PARZIALE che il reinvio non può più sanare: la transazione commette movimenti, giacenze e `status = completed` (:278-311), mentre il documento di inventario si crea DOPO, fuori dalla transazione (:323-350). Se il processo cade in quella finestra, le rettifiche restano applicate senza documento e con `documentId` a null, e il retry viene respinto dal 409. ⚠️ Precisazione necessaria: il timeout di 15 s del client NON produce questo stato — interrompe l'attesa, non il lavoro del server, che prosegue e crea il documento. La finestra si apre solo con un arresto o riavvio del processo.

**Causa tecnica** — La guardia di stato impedisce che la STESSA sessione venga rieseguita in sequenza — è la protezione reale e vale per lo scenario in mandato (risposta persa, poi retry). Non impedisce l'esecuzione doppia CONCORRENTE, perché lettura e verifica avvengono fuori dalla transazione che applica gli effetti; e non impedisce che una seconda sessione gemella (voce «Avvia sessione inventario») riapplichi le stesse rettifiche, perché la guardia parla della sessione, non dell'effetto. Lato client, in errore `runAction` non ricarica la sessione (:413-434): la schermata continua a mostrare `review` e il pulsante Concludi resta premibile, restituendo un 409 con il messaggio generico «Operazione non riuscita. Riprova.»

**Evidenza** — api/src/inventory/inventory.controller.ts:336-344; api/src/inventory/inventory-count.service.ts:252-352 (:257-262 lettura fuori transazione, :265-269 guardia, :278 transazione, :285 delta, :286-300 movimento e externalRef, :302-310 stato, :313-320 push, :323-350 documento), :356-380; api/prisma/schema.prisma:904, :930; src/app/features/inventory/inventory-count-detail.component.ts:318-324, :413-434; src/app/domain/inventory/services/inventory.service.ts:389-393.

#### 3. `PATCH /inventory/counts/:sessionId/lines/:lineId → InventoryCountService.updateLine`

**Comando** — Conta una riga della sessione: digita la quantità o passa il barcode allo scanner.

**Il client manda** — LETTO. `{ countedQuantity }`, un valore ASSOLUTO, con sessionId e lineId in rotta (src/app/domain/inventory/services/inventory.service.ts:373-381). Lo scanner calcola `(countedQuantity ?? 0) + 1` lato client e manda il RISULTATO, non l'incremento (inventory-count-detail.component.ts:334-341).

**Create vs update** — È sempre e solo una modifica: la riga esiste già, creata insieme alla sessione. L'id è in rotta.

**A · prima creazione** — Non applicabile: questo comando non crea nulla.

**B · modifica** — PROTETTO. Il servizio verifica che la riga appartenga alla sessione e al tenant (:214-220) e scrive il valore assoluto su un id noto (:222-224): reinviare lo stesso PATCH riscrive lo stesso numero. Nessuna riga duplicata, nessun movimento (le rettifiche si applicano solo al finalize), nessun impegno, nessun lotto, nessun numero, nessun effetto economico. ⚠️ Un difetto c'è, ma è l'OPPOSTO della duplicazione: lo stato locale della riga si aggiorna solo nel next (inventory-count-detail.component.ts:377-379), quindi se la risposta si perde la scansione successiva ricalcola `+1` da un valore rimasto indietro e manda un assoluto che CONTA UNO IN MENO. Si corregge da sé alla prima ricarica della sessione.

**Causa tecnica** — Protegge perché il payload è uno stato e non un incremento, e il bersaglio è un id già esistente: non c'è niente da far nascere due volte. Non protegge dalla perdita di aggiornamento fra due operatori sulla stessa riga — la guardia `assertEditableSession` (:211, :408-419) verifica lo STATO della sessione, non la versione della riga.

**Evidenza** — api/src/inventory/inventory.controller.ts:308-323; api/src/inventory/inventory-count.service.ts:204-225, :404-419; src/app/features/inventory/inventory-count-detail.component.ts:334-341, :367-389; src/app/domain/inventory/services/inventory.service.ts:373-381.

#### 4. `POST /inventory/counts/:id/submit → InventoryCountService.submitForReview`

**Comando** — Invia la sessione di inventario a revisione.

**Il client manda** — LETTO. Corpo vuoto `{}`, id in rotta (src/app/domain/inventory/services/inventory.service.ts:383-387). Guardia in-flight `actionPending()` (inventory-count-detail.component.ts:310-316).

**Create vs update** — È una transizione di stato su un id noto: non crea nulla.

**A · prima creazione** — Non applicabile.

**B · modifica** — PROTETTO. Il metodo esige `status === in_progress` (assertEditableSession, :404-419) e poi scrive `status = review` (:243-246). Reinvio dopo il commit: lo stato è già `review`, la guardia risponde 409. Anche se la guardia fosse aggirata da due invii contemporanei, la scrittura è l'assegnazione di un valore fisso, quindi il risultato coinciderebbe. Nessun record, nessuna riga, nessun movimento, nessun numero, nessun effetto economico.

**Causa tecnica** — Impedisce la ripetizione perché la transizione è unidirezionale E la scrittura è idempotente (un valore fisso, non un incremento). Va detto che il merito è della seconda proprietà più che della prima: la guardia legge fuori da qualsiasi transazione (:404-412) e non serializza nulla — semplicemente qui non c'è niente che possa raddoppiare.

**Evidenza** — api/src/inventory/inventory.controller.ts:326-334; api/src/inventory/inventory-count.service.ts:227-250, :404-419; src/app/features/inventory/inventory-count-detail.component.ts:310-316, :413-434.

#### 5. `POST /inventory/counts/:id/cancel → InventoryCountService.cancel · DELETE /inventory/counts/:id → InventoryCountService.deleteCancelled`

**Comando** — Annulla la sessione di inventario, ed eventualmente la elimina.

**Il client manda** — LETTO. Corpo vuoto o nulla, id in rotta (src/app/domain/inventory/services/inventory.service.ts:395-406). Guardia in-flight `actionPending()` (inventory-count-detail.component.ts:326-332).

**Create vs update** — Transizioni di stato su un id noto; non creano nulla.

**A · prima creazione** — Non applicabile.

**B · modifica** — PROTETTO. Cancel rifiuta le sessioni già `completed` o `cancelled` con 409 (:368-374) e poi scrive un valore fisso (:376-379): il reinvio non produce un secondo effetto. Delete esige `status === cancelled` (:395-399) e opera su un id: il reinvio dà 404 o 409. Nessuna riga duplicata, nessun movimento, nessun numero, nessun effetto economico. ⚠️ Nota di correttezza, non di duplicazione: cancel rifiuta la sessione conclusa, quindi le rettifiche già applicate non si annullano da qui — è coerente, non è un difetto di idempotenza.

**Causa tecnica** — Impedisce la ripetizione perché la transizione è unidirezionale e la scrittura è l'assegnazione di un valore fisso. La guardia legge fuori transazione (:361-367, :388-394), quindi non serializzerebbe due invii concorrenti — ma il risultato coinciderebbe comunque, non essendoci nulla di additivo.

**Evidenza** — api/src/inventory/inventory.controller.ts:346-360; api/src/inventory/inventory-count.service.ts:356-402; src/app/features/inventory/inventory-count-detail.component.ts:326-332.

### 6.2 Duplica documento — funzione volontaria, tema separato

Il censimento l'ha raccolta e la lascio qui isolata, **fuori dal conteggio dei 57 in perimetro**,
per decisione esplicita del proprietario: è una funzione **volontaria**, e il tema della
duplicazione verrà affrontato quando si affronterà quella funzione — nota come storicamente
incompleta e non uniforme.

⚠️ Un fatto emerso che servirà allora: `duplicate` **non scrive niente da sé, delega a `save` senza
id** (`manual-sales-orders.service.ts:827`), quindi eredita per intero la vulnerabilità della
creazione — **impegni di magazzino compresi**.

### Duplica documento — 1

#### 1. `POST /sales-orders/manual/:id/duplicate → ManualSalesOrdersService.duplicate`

**Comando** — Duplica un ordine cliente su un altro cliente (dall'elenco /app/sales, modale «Duplica»).

**Il client manda** — LETTO. Corpo `{ customerId }` (sales-order.service.ts:187-196); l'ordine di partenza è l'id in rotta. Nessuna chiave di richiesta.

**Create vs update** — Non distingue: `duplicate` costruisce un `SaveManualSalesOrderDto` SENZA `id` (manual-sales-orders.service.ts:804-825) e chiama `save` — è per costruzione sempre una creazione.

**A · prima creazione** — VULNERABILE, e con gli stessi effetti del comando «Salva documento» in creazione, perché è lo stesso percorso. LETTO: il dto costruito a :804-825 non porta né `id`, né `series`, né `number`; `save` crea quindi un nuovo SalesOrder, consuma un nuovo numero, crea tutte le righe e — poiché le righe copiate mantengono `commitsStock` (:822) — crea un set completo di NUOVI impegni con `applyCommittedDelta(+quantity)`. Al reinvio: due ordini duplicati e Impegnata contata due volte. Nessun movimento fisico, nessun lotto, nessuna scrittura anagrafica, nessun effetto sul Registro Corrispettivi (origine manuale esclusa). Elenco e totale di /app/sales mostrano due righe. Guardia client: `duplicateBusy` (sales-order-list.component.ts:949, :952) blocca il doppio clic in volo, ma il ramo `error` chiude la modale e azzera il flag (:963-967) — DEDOTTO: dopo un timeout l'operatore riapre la modale e riconferma, ottenendo il secondo duplicato.

**B · modifica** — Non applicabile: il comando non ha una forma di modifica.

**Causa tecnica** — Nessun meccanismo lato server distingue una duplicazione voluta da un reinvio: l'unica coppia (ordine di partenza, cliente) non è vincolata da nulla — e non deve esserlo, perché duplicare due volte lo stesso ordine sullo stesso cliente è un intento legittimo. Gli indici unici sul numero non scattano per la ragione già detta (numero calcolato come primo libero).

**Evidenza** — api/src/sales-orders/manual-sales-orders.service.ts:783-828; api/src/sales-orders/sales-orders.controller.ts:174-184; src/app/features/sales-orders/sales-order-list.component.ts:946-968; src/app/domain/sales-orders/services/sales-order.service.ts:187-196

---

## 7. Invarianti fragili emersi dal censimento

Cose su cui il sistema si appoggia **senza che nessuno le abbia dichiarate**. Non sono difetti
oggi; diventano difetti il giorno in cui qualcuno "sistema" ciò che sembra mancante.

| Invariante                                                                                                                                                                         | Cosa lo romperebbe                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StockMovement.sourceLineId` è una colonna UUID **senza `@relation`**                                                                                                              | aggiungerle un `onDelete: Cascade`: gli orfani sparirebbero prima di poter essere stornati                                                                                                                              |
| `isDocumentNumberConflict` riconosce il conflitto **dal modello Prisma**, e il suo docblock lo giustifica con «documents → SOLO `documents_number_unique`. Nessun altro candidato» | ⛔ **aggiungere un secondo vincolo unico su `documents`**: un P2002 di altra natura verrebbe riportato all'operatore come «numero già assegnato», con la proposta di un numero libero che non c'entra niente            |
| `SalesOrder.documentId` **non ha un vincolo unico**, solo un indice                                                                                                                | il freno è un controllo applicativo dentro la transazione: due POST davvero sovrapposti lo attraverserebbero entrambi. E se il primo documento fosse **annullato**, il secondo si prende l'ordine **senza dire niente** |
| I lotti sono protetti in aggiornamento solo di riflesso, dal filtro `sync.createdLineIds`                                                                                          | qualunque cambiamento che faccia risultare "nuove" le righe di un documento risalvato re-incrementerebbe i lotti                                                                                                        |

⚠️ **Il secondo riguarda direttamente T15**: qualunque soluzione che aggiunga un vincolo unico
sulla tabella `documents` deve sistemare `isDocumentNumberConflict` **nello stesso lavoro**, o il
difetto si scopre in produzione con tutti i test verdi.

---

## 8. Annulla / Elimina / Crea — la divergenza è risolta, e lascia un punto aperto

Due famiglie del censimento avevano classificato `POST /documents/:id/cancel` in modo diverso
(`PROTETTO` e `PARZIALMENTE PROTETTO`), e la mappa lo riporta in entrambe le sezioni con la voce
originale di ciascuna. ⛔ **La divergenza non è però irrisolta: guardavano due assi diversi.**

Il quadro reale, deciso dal proprietario il 21/08/2026:

| Comando        | Secondo documento | Retry dopo risposta persa | Due richieste **contemporanee**                                  |
| -------------- | ----------------- | ------------------------- | ---------------------------------------------------------------- |
| **Annulla**    | no                | ✅ protetto               | ⚠️ **da verificare: possibile doppio storno**                    |
| **Elimina**    | no                | ✅ protetto               | strutturalmente molto più protetto — transazione + delete finale |
| **Crea nuovo** | **sì, oggi può**  | ⛔ vulnerabile            | ⛔ vulnerabile                                                   |

⭐ **I due assi sono diversi, e le classificazioni divergenti dicevano ciascuna il vero sul
proprio**: sul retry dopo risposta persa l'annullamento è protetto — la seconda richiesta trova il
documento già annullato e riceve un 409. Sulla concorrenza no.

### ⚠️ Il punto aperto su Annulla — misurato il 21/08/2026

```ts
const doc = await this.getById(tenantId, id, user);          // ← lettura FUORI dalla transazione
if (doc.status === DocumentStatus.cancelled) throw ...       // ← guardia su quel valore
const wasStockLoaded = doc.status !== draft && ...           // ← e i flag di storno idem

await this.prisma.$transaction(async (tx) => { /* storno */ });
await tx.document.update({ where: { id }, data: { status: cancelled } });   // ← nessuna condizione
```

Due richieste che leggono entrambe `confirmed` passano entrambe la guardia, calcolano entrambe i
flag di storno e applicano entrambe la reintegra. La scrittura finale non porta alcuna condizione
sullo stato (`where: { id }`), quindi la seconda non trova nulla che la fermi.

⛔ **Non si parcheggia**: va provato con un test che simuli l'interleaving, e se il doppio storno è
confermato si corregge subito.

**Grado di certezza: letto** per la struttura (righe citate sopra); **da provare** che il doppio
storno si materializzi in tutti i rami — quello dell'Arrivo merce passa da
`syncGoodsReceiptLineMovements`, il cui conteggio dei movimenti potrebbe comportarsi diversamente
sotto blocco di riga.

---

## 9. Che cosa NON contiene questo documento

- nessuna soluzione, nessuna colonna, nessuna tabella, nessuna chiave di idempotenza;
- nessuna migration e nessun codice;
- nessuna decisione di dominio su Trasferimento e Rettifica;
- nessuna estensione di perimetro: solo comandi normali di creazione e salvataggio, e solo lo
  scenario **commit riuscito → risposta persa → stesso comando reinviato**.
