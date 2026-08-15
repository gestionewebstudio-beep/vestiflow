# 09 · Movimenti di magazzino per riga documento

**Data:** 15/08/2026
**Stato del documento:** piano, non consuntivo. Le voci marcate _misurato_ sono state lette nel codice o nello schema, con la data. Le voci marcate _dedotto_ sono ragionamenti non ancora verificati e non vanno implementate come certe.
**Owner:** Luigi
**Migration richiesta: nessuna.** Le colonne e il vincolo esistono già (§1). Questa è una correzione di codice, non di schema.

**Perché esiste questo documento.** La regola «un movimento per riga» è scritta nello schema del database, ma era implementata in tre percorsi su quattro. Il quarto — lo **scarico di vendita**, cioè il DDT vendita e la famiglia Fattura che verrà — non la rispettava, e la differenza si vedeva a schermo: modificando un DDT da 3 a 2 pezzi il registro Movimenti mostrava due righe, `Vendita −3` e `Carico +1`, invece di una sola `Vendita −2`.

**Stato: corretto il 15/08/2026**, in due fasi — l'identità delle righe (§4-bis) e il sync dello scarico (§4-ter).

Il documento serve a tre cose: dichiarare la regola dove si legge, registrare **cosa è stato misurato** su ciascun percorso, e conservare la correzione con i suoi rischi — perché fra sei mesi la domanda non sarà «cosa è stato fatto», ma «perché è fatto così».

---

## §1 · La regola

> **Una riga di documento che movimenta magazzino ha esattamente un movimento collegato, identificato da `sourceLineId`. Il salvataggio successivo aggiorna quel movimento; non ne accoda un altro.**

Non è una scelta presa oggi: è già nello schema, con il vincolo che la fa rispettare al database.

```prisma
/// Riga documento origine: al massimo UN movimento per riga (no doppi carichi).
sourceLineId  String?  @map("source_line_id") @db.Uuid
...
@@unique([sourceDocumentType, sourceLineId])
```

_Misurato 15/08:_ `api/prisma/schema.prisma:893` e `:915`.

### Cosa ne discende, caso per caso

| Gesto dell'operatore                     | Effetto atteso sul registro                                                     | Effetto atteso sulla giacenza |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| Riga nuova movimentabile                 | un movimento nuovo, collegato alla riga                                         | −quantità (scarico)           |
| Quantità 3 → 2                           | **lo stesso** movimento passa da −3 a −2                                        | +1                            |
| Quantità 2 → 4                           | **lo stesso** movimento passa da −2 a −4                                        | −2                            |
| Spunta magazzino tolta, o riga eliminata | il movimento **sparisce**                                                       | ripristino pieno              |
| Risalvataggio senza modifiche            | **nessuna** scrittura                                                           | nessuna                       |
| Doppio salvataggio / retry di rete       | effetto identico a un salvataggio solo                                          | nessun doppio                 |
| Cambio location                          | l'effetto si sposta: storno pieno sulla vecchia, applicazione piena sulla nuova | due poste, nessun residuo     |
| Due righe dello stesso articolo          | **due** movimenti distinti                                                      | somma dei due                 |

### La distinzione che regge tutto

**Modificare un documento non è una seconda operazione fisica.** Se ieri il DDT diceva 3 pezzi e oggi si corregge a 2, non sono usciti 3 pezzi e poi ne è rientrato 1: **è sempre uscita una quantità sola, e il documento era compilato male.** Il movimento collegato alla riga rappresenta il **contenuto corrente** del documento, non la storia dei salvataggi.

Un movimento nuovo nasce solo quando accade un **secondo evento fisico**: merce che rientra davvero (documento di carico o Nota di credito con «Carica magazzino»), una differenza trovata a inventario (Rettifica), un trasferimento. In quei casi il movimento in più è corretto, ed è tracciabilità — non rumore.

Il confine è quindi netto, e va tenuto in mente leggendo il resto:

| Evento                              | Movimento                                |
| ----------------------------------- | ---------------------------------------- |
| modifica della riga di un documento | **aggiorna** quello collegato            |
| nuovo evento fisico successivo      | **nuovo** movimento                      |
| storno o rettifica esplicita        | **nuovo** movimento, tracciato come tale |

---

## §2 · Chi rispetta la regola — misurato 15/08, **aggiornato a lavoro eseguito**

Quattro famiglie di documenti movimentano magazzino. **Adesso le rispettano tutte e quattro**: la tabella qui sotto descrive lo stato di partenza, ed è tenuta perché senza di essa non si capisce cosa è stato corretto e perché. Lo stato di arrivo è nei §4-bis e §4-ter.

| Percorso                                                      | Creazione / Conferma                                                  | **Modifica**                                                              | Annullamento / Eliminazione  |
| ------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------- |
| **Arrivo merce**                                              | per riga (`syncGoodsReceiptLineMovements`)                            | **per riga** — `goods-receipt-workflow.service.ts`                        | per riga, con ripiego legacy |
| **Rettifica**                                                 | per riga (`syncAdjustmentLineMovements`, `documents.service.ts:2356`) | per riga: l'aggregato è **scavalcato** quando esistono movimenti per riga | per riga, con ripiego legacy |
| **Trasferimento**                                             | per riga (`syncTransferLineMovements`, `:2389`)                       | per riga: idem                                                            | per riga, con ripiego legacy |
| **Scarico di vendita** (DDT vendita, Fattura accompagnatoria) | ~~aggregato~~ → **per riga** (§4-ter)                                 | ~~aggregato~~ → **per riga** (§4-ter)                                     | **per riga**, ripiego legacy |

⚠️ **Correzione a una lettura precedente di questo documento.** Qui era scritto che «la modifica è il percorso legacy per tutti e tre». **Non è vero per Rettifica e Trasferimento**, ed è stato verificato leggendo il gate: `documents.service.ts:1734-1745` conta i movimenti con `sourceLineId` non nullo e, se ce ne sono, **salta** la riconciliazione aggregata (`!hasTransferLineMovements` a `:1894`, `!hasAdjustmentLineMovements` a `:1978`). Il commento nel codice lo dichiara: _«una volta che il documento ha movimenti per riga, il PATCH generico NON deve più riconciliare in modo aggregato»_. Il reconcile aggregato resta come ripiego per i documenti storici che movimenti per riga non ne hanno.

**Quel gate è stato il precedente imitato in FASE 2**: dice come si fa convivere il modello nuovo col vecchio senza un interruttore globale — lo decide il documento, guardando i propri movimenti.

**Lo scarico di vendita era il solo che non aveva il modello per riga**, in nessuno dei suoi flussi. Ed era il percorso su cui verranno costruite Fattura e Fattura accompagnatoria: estenderlo così com'era significava allargare l'anomalia proprio mentre si allarga la famiglia documentale. È il motivo per cui è stato corretto **prima**.

### Perché lo scarico non poteva, non «non voleva»

_Misurato 15/08:_ `applyStockSale` (`api/src/inventory/inventory-movement.util.ts:76`) scriveva `externalRef` e basta — **non `sourceLineId`, né `sourceDocumentId`, né `sourceDocumentType`**. Il movimento che ne usciva non aveva alcun aggancio alla riga: al salvataggio successivo non c'era niente da ritrovare, e l'unica cosa che il codice poteva fare era accodare una rettifica. Il comportamento visto a schermo era la conseguenza obbligata di una colonna lasciata vuota.

_Dato al momento della correzione:_ **20 movimenti DDT senza legame alla riga, 0 con legame** — contro 70 su 70 con legame per l'Arrivo merce. Non qualche residuo storico: l'intero percorso.

---

## §3 · La causa radice non è la colonna vuota: è l'identità della riga

Qui la misura ha cambiato la forma del lavoro, e va letta prima di stimare qualunque costo.

_Misurato 15/08._ Il salvataggio generico dei documenti **cancella tutte le righe e le riscrive**:

```ts
// documents.service.ts:2051
if (lines) {
  await tx.documentLine.deleteMany({ where: { documentId: id } });
}
```

Le righe rinascono con **id nuovi a ogni salvataggio**. Un `sourceLineId` scritto ieri punterebbe a una riga che oggi non esiste più: non c'è nulla a cui ancorare il movimento.

L'Arrivo merce fa l'opposto, e il codice dice perché:

```ts
// goods-receipt-workflow.service.ts:671
// ── Upsert righe per id: preservare l'id riga è ciò che consente di
//    aggiornare il movimento collegato invece di duplicarlo (§2.3-2.4).
```

Cancella **solo le righe scomparse**, aggiorna per id quelle che restano, crea le nuove (`:678-717`). L'id sopravvive al salvataggio, e il movimento collegato con lui.

**Conseguenza sul piano di lavoro:** portare lo scarico di vendita al modello per riga non è scrivere un file nuovo. Richiede prima che il salvataggio generico **preservi l'identità delle righe**, il che tocca tutti i tipi che passano da `documents.service.update`. È il pezzo che allarga il raggio, e va deciso sapendolo.

### Un secondo effetto della stessa causa, indipendente da questo lavoro

_Misurato 15/08:_ `InventorySerial.documentLineId` ha `onDelete: SetNull` (`schema.prisma:2650`). Ogni salvataggio che riscrive le righe **azzera in silenzio il legame fra il numero di serie e la riga che l'ha consumato**. Il seriale resta, il suo stato resta, la tracciabilità riga-per-riga no.

Non è materia di questo lavoro e non lo apro qui — **ma si chiude da sé nel momento in cui le righe conservano l'id**, ed è un argomento in più a favore di quella correzione. Registrato perché non venga riscoperto fra sei mesi come difetto autonomo.

---

## §4 · La correzione, in ordine di dipendenza

Nessun passo va saltato: ognuno è il presupposto del successivo.

**Nessun passo è senza precedente**: l'Arrivo merce ha già percorso questa strada per intero, e ogni riga della tabella indica il modello da copiare. _Tutti i «oggi» sono misurati il 15/08._

| #   | Passo                                      | Oggi, sulla vendita                                                    | Precedente da copiare                                                                                              |
| --- | ------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | Il controllo `id` nel gruppo riga del form | **assente** (`sales-document-form.component.ts:2645`)                  | `id: this.fb.control('')` (`goods-receipt-form.component.ts:3988`)                                                 |
| 2   | L'`id` nel corpo della richiesta           | **assente** da `DocumentLineInputBody` (`document-api.mapper.ts:395`)  | `SaveGoodsReceiptLineBody.id?` (`:532`), che estende lo stesso corpo                                               |
| 3   | L'`id` nel DTO lato server                 | **assente**                                                            | `save-goods-receipt.dto.ts:85` — «l'id è presente per le righe già salvate»                                        |
| 4   | Persistenza delle righe                    | `deleteMany` + ricrea tutto (`documents.service.ts:2051`)              | cancella le sole scomparse, aggiorna per id, crea le nuove (`goods-receipt-workflow.service.ts:678-717`)           |
| 5   | `document-stock-unload-sync.util.ts`       | **non esiste**                                                         | `document-goods-receipt-sync.util.ts` e `document-stock-adjustment-sync.util.ts`, già l'uno lo specchio dell'altro |
| 6   | Innesto nei flussi                         | conferma `:2312`, modifica `:1774`, annullamento `:2600`, eliminazione | rettifica e trasferimento, innestati agli stessi punti                                                             |
| 7   | Conversione dei movimenti storici          | —                                                                      | `convertLegacyMovements` (§5)                                                                                      |
| 8   | Test                                       | —                                                                      | §7                                                                                                                 |

I passi 1-4 sono il **prerequisito**: senza identità della riga il passo 5 non ha nulla a cui agganciarsi. I passi 1-3 sono additivi e non rompono nulla (un campo facoltativo in più); **il passo 4 è quello che cambia comportamento per tutti i tipi** che passano dal salvataggio generico, ed è il punto in cui misurare due volte.

---

## §4-bis · FASE 1 — eseguita il 15/08/2026

**I passi 1-4 sono fatti.** Il salvataggio generico non cancella più le righe: le aggiorna per id. I passi 5-8 (il sync dello scarico) **non sono stati toccati**: restano FASE 2.

### Cosa è cambiato, file per file

| File                                                                                          | Modifica                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api/src/documents/dto/create-document.dto.ts`                                                | `DocumentLineInputDto.id?` — facoltativo, `@IsUUID`. Vale anche per l'update, che riusa lo stesso DTO di riga                                                                        |
| `api/src/documents/documents.service.ts`                                                      | `ComputedLine.id`; `computeLines` lo trasporta; **`persistDocumentLinesTx`** (nuovo) sostituisce `deleteMany` + `lines: { create }`; `toLineCreateData` **scarta** l'id in creazione |
| `src/app/domain/documents/services/document-api.mapper.ts`                                    | `DocumentLineInputBody.id?`                                                                                                                                                          |
| `src/app/features/documents/sales-document-form.component.ts`                                 | controllo `id` nella riga, popolato al caricamento, inviato nel salvataggio, **azzerato nella duplicazione**                                                                         |
| `src/app/features/sales-orders/customer-order-form.component.ts`                              | l'id della riga documento non si azzera più al caricamento; `buildRegistryLines` lo invia                                                                                            |
| `src/app/features/documents/stock-operation-form.component.ts` · `transfer-form.component.ts` | l'id, che il salvataggio dedicato già portava, ora viaggia anche nel PATCH generico                                                                                                  |

### Le regole, come sono scritte nel codice

1. riga con `id` noto → **update**, stesso id, posizione aggiornata;
2. riga senza `id` → **create**, id nuovo dal database (l'id dichiarato dal client **non** diventa mai chiave di una riga nuova);
3. riga non più inviata → **delete della sola riga sparita**;
4. `id` sconosciuto o ripetuto nello stesso salvataggio → **422**, prima di scrivere qualunque cosa;
5. la riga sparita sotto un salvataggio concorrente → **409**, invece di scrivere altrove.

L'appartenenza non è affidata al solo controllo applicativo: il `where` dell'update porta **id + documento + tenant**, quindi la impone il database.

### Chi è passato dal nuovo salvataggio, e chi no

Il PATCH generico serve **Preventivo, Ordine cliente (documenti collegati), DDT vendita, Scarico manuale, Rettifica, Trasferimento, Proforma e la famiglia Fattura**. Ne restano fuori per costruzione, e non sono stati toccati:

- **Arrivo merce e famiglia carico** — hanno il percorso dedicato, che l'upsert per id ce l'aveva già (`isDedicatedWorkflowDocumentType` rifiuta il PATCH generico);
- **Vendite e resi di negozio** — non modificabili (`isFlowOnlyDocumentType`);
- **Ordine fornitore** — tabella diversa (`SupplierOrderLine`), e lì il difetto gemello resta: vedi `03b` §8.2, dove `supplierOrderLineId` viene azzerato a ogni salvataggio.

### Cosa NON è cambiato, di proposito

- **Nessun movimento di magazzino è stato toccato.** Lo scarico di vendita continua ad accodare rettifiche esattamente come prima: è FASE 2.
- **Nessuna pulizia dei movimenti storici.** I 20 movimenti DDT senza `sourceLineId` sono ancora lì, intatti.
- **Nessuna migration.** Nessuna colonna nuova, nessun vincolo nuovo.
- **`InventorySerial.documentLineId` non è più reciso a ogni salvataggio** — è una conseguenza gratuita dell'identità stabile, non una modifica a sé. Oggi la tabella è vuota (0 righe), quindi nessun dato è stato riparato: semplicemente il difetto non si arma più.

### Verifiche eseguite

| Verifica                                         | Esito                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Type-check API (`tsc --noEmit`)                  | pulito                                                                         |
| Type-check frontend (`tsc -p tsconfig.app.json`) | pulito                                                                         |
| Test API (`vitest run`)                          | **1566 test, 180 file — verdi**, di cui **11 nuovi** sull'identità delle righe |
| Test frontend (`npm test`)                       | 1390 test, 205 file — verdi                                                    |
| Test di componente (`npm run test:components`)   | 418 test, 47 file — verdi                                                      |
| ESLint sui file toccati                          | pulito                                                                         |

Gli 11 test nuovi stanno in `documents.service.spec.ts`, gruppo _«update — identità delle righe»_, e coprono uno per uno i punti del checkpoint: id invariati; id nuovo solo alle righe nuove; eliminazione della sola riga rimossa; due righe dello stesso articolo distinte; righe di riferimento e righe senza articolo; riordino che cambia posizione e non identità; doppio salvataggio; id estraneo rifiutato; id ripetuto rifiutato; documento e tenant nel `where`; riga sparita sotto una modifica concorrente.

Il passo 4 non è progettazione: i due sync esistenti — `document-goods-receipt-sync.util.ts` e `document-stock-adjustment-sync.util.ts` — sono già l'uno lo specchio dell'altro, commento per commento. Il terzo li segue: cambia il tipo di movimento (`sale`), il verso (scarico), e il fatto che la location è una sola.

---

## §4-ter · FASE 2 — eseguita il 15/08/2026

**Lo scarico di vendita è passato al modello per riga**, per entrambi i tipi che fanno uscire la merce dal percorso generico: **DDT vendita e Fattura accompagnatoria**.

### Il file nuovo

`api/src/documents/document-stock-unload-sync.util.ts` — terzo specchio di quelli di Arrivo merce e Rettifica, stessa forma e stessi nomi. Un movimento `sale` per riga, collegato via `sourceLineId`, ritrovato e **aggiornato in posto**; conversione dei movimenti legacy inclusa (§5).

### Dove è innestato

| Flusso           | Prima                                                                                        | Adesso                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Conferma**     | ciclo di `applyStockSale`, un movimento per riga ma **senza legame**                         | `syncUnloadLineMovements` — stesso numero di movimenti, con `sourceLineId`                                                        |
| **Modifica**     | `reconcileDocumentStockUnload`: aggregava per variante e **accodava** «rettifica scarico ±n» | `syncUnloadLineMovements` dopo la persistenza delle righe, che ora hanno id stabili (FASE 1)                                      |
| **Annullamento** | storno accodato                                                                              | sync con righe vuote se il documento ha movimenti per riga; **storno accodato come ripiego** per i documenti mai passati dal sync |

Il sync della modifica gira **dopo** `persistDocumentLinesTx` e **dopo** l'aggancio dei DDT: gli servono gli id definitivi delle righe e l'elenco DDT aggiornato — da cui dipende se un'accompagnatoria scarica.

### La Fattura accompagnatoria, che prima non riconciliava affatto

Era il difetto misurato in giornata: modificabile dopo la conferma (nessun controllo per tipo, né in maschera né nel servizio), scaricava alla conferma e alla modifica **non riconciliava nulla** — documento e magazzino divergevano in silenzio. Zero accompagnatorie nel database, quindi mai incontrato da nessuno; ma il percorso era raggiungibile per intero. **Adesso passa dallo stesso sync del DDT**, e un test di servizio lo fissa.

### Una regressione, trovata al primo collaudo a schermo

⚠️ **Da tenere, perché è il tipo di trappola che questo lavoro arma per costruzione.**

Esisteva già una guardia nel PATCH generico: _«Questo documento usa movimenti per riga: aggiornalo dal suo flusso dedicato, non con PATCH»_ (`documents.service.ts:1440`). Era stata scritta per Trasferimento e Rettifica, che i propri movimenti per riga li mantengono **altrove** — nel loro endpoint di salvataggio dedicato. Ma la condizione non guardava il tipo: guardava solo se il documento **avesse** movimenti per riga.

Dal momento in cui lo scarico di vendita ha cominciato ad averne, il DDT ci è finito dentro. E in un modo che inganna: **il primo salvataggio funzionava** — il documento aveva ancora i movimenti legacy, la guardia non scattava, il sync convertiva e creava i movimenti per riga — mentre **dal secondo in poi il documento veniva respinto dalla guardia che esso stesso aveva appena armato**. A schermo sembrava «aumentare la quantità funziona, diminuirla no», perché quella era la seconda modifica.

La correzione distingue i due casi, ed è una riga: la guardia vale per i documenti che tengono i movimenti per riga **fuori** dal PATCH; lo scarico di vendita li tiene **dentro** (`syncUnloadLineMovements` gira in questo stesso PATCH).

**I test non l'avevano preso**, e il motivo va scritto: nel mock di servizio `stockMovement.count` torna `0` per impostazione predefinita, cioè «nessun movimento per riga» — proprio lo stato in cui la guardia non scatta. Il test aggiunto ora parte dallo stato opposto: un DDT che i movimenti per riga ce li ha già. Rimettendo la guardia com'era, quel test fallisce con la stessa eccezione vista a schermo: **verificato**, non supposto.

### Codice rimosso

`reconcileDocumentStockUnload` **non esiste più**. Non è stata lasciata come ripiego: era la funzione che accodava le rettifiche, e finché resta qualcuno la richiama. Al suo posto, nel file, un commento che dice cosa c'era e perché non deve tornare. Restano invece `reverseDocumentStockUnload` e `reverseDocumentStockLoad`, che servono ai documenti legacy in annullamento.

### La data dei movimenti ricostruiti

Dettaglio che vale un paragrafo perché è invisibile finché non fa danno: la conversione **cancella** i movimenti legacy e li **riscrive**. Riscriverli con la data di oggi li porterebbe in cima al registro, ma quell'uscita è di allora. Il sync prende quindi la data del **più vecchio dei movimenti legacy che sta convertendo** e la dà ai movimenti ricostruiti. Un documento nuovo, che legacy non ne ha, prende l'ora corrente come sempre.

### Verifiche

| Verifica                                                          | Esito                           |
| ----------------------------------------------------------------- | ------------------------------- |
| Test del sync (`document-stock-unload-sync.util.spec.ts`, nuovo)  | **15 test, verdi**              |
| Test di servizio sull'accompagnatoria modificata dopo la conferma | verde                           |
| Test API completi                                                 | **1582 test, 181 file — verdi** |
| Test frontend · componenti                                        | 1390 · 418 — verdi              |
| Type-check API e frontend, ESLint                                 | puliti                          |

I 15 test del sync coprono, nell'ordine: DDT nuovo con `sourceLineId`; 3→2 senza carico di rettifica; 2→4; riga eliminata; due righe stesso articolo; cambio location; salvataggio identico; DDT legacy con rettifica a saldo invariato; movimento orfano assorbito; righe non movimentabili; spunta tolta; annullamento; tenant in ogni lettura; causale invariata; e **il caso della schermata** — da 3 a 2 resta una sola «Vendita −2».

---

## §5 · Come si riconcilia un DDT storico — la ricetta

È la domanda posta esplicitamente prima di scrivere, e la risposta è: **si riusa la conversione che i due sync esistenti già fanno**, adattandone il filtro.

### Cosa c'è nel database oggi, per un DDT già salvato e poi modificato

| Movimento                          | Tipo   | Da dove viene                              | `sourceLineId` |
| ---------------------------------- | ------ | ------------------------------------------ | -------------- |
| lo scarico originale               | `sale` | `applyStockSale` alla conferma             | **null**       |
| la rettifica in aumento di scarico | `sale` | `reconcileDocumentStockUnload` (delta > 0) | **null**       |
| la rettifica in diminuzione        | `load` | `reconcileDocumentStockUnload` (delta < 0) | **null**       |
| lo storno da annullamento          | `load` | `reverseDocumentStockUnload`               | **null**       |

Tutti portano `externalRef = <id del documento>` e nient'altro. È l'unico appiglio, ed è sufficiente.

### La conversione

Identica per struttura a `convertLegacyMovements` (`document-goods-receipt-sync.util.ts:71`), con il filtro sui tipi dello scarico:

1. leggere i movimenti con `tenantId`, `externalRef = documentId`, `sourceLineId = null`, `type ∈ {sale, load, unload}`;
2. calcolarne l'**effetto netto per coppia (variante, location)** — `sale` e `unload` negativi, `load` positivo;
3. applicare alla giacenza il **netto opposto**, cioè annullarne l'effetto;
4. cancellare quei movimenti;
5. lasciare che il sync per riga ricostruisca lo stato corretto dalle righe correnti.

Il risultato è che **la giacenza non si muove di un pezzo** — si toglie il netto vecchio e si riscrive lo stesso netto sotto forma di movimenti per riga — mentre il registro passa da N righe a una per riga di documento.

### Le due insidie, dichiarate

- **`externalRef` non è di uso esclusivo.** Lo schema lo descrive come «riferimento esterno, es. id ordine Shopify». Il filtro deve quindi restare ancorato a `tenantId` **e** all'id del documento, che è un UUID: nessuna collisione possibile con un id di canale. _Dedotto dalla forma degli identificativi, non provato su dati reali: da verificare con un conteggio prima di eseguire la conversione in produzione._
- **Il DDT generato da una vendita online non ha movimenti propri** (`documents.service.ts:2301`, fase 2 §9: la merce è già uscita col giro dell'ordine). La conversione su quei documenti non deve trovare nulla, e se trova qualcosa è un dato da guardare prima di cancellarlo, non da assorbire in silenzio.

---

## §6 · Rischi di regressione — misurati, uno per uno

| #   | Rischio                                   | Misura                                                                                                                                     | Valutazione                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **DDT esistenti**                         | i loro movimenti non hanno `sourceLineId`; la conversione del §5 li assorbe al primo salvataggio                                           | **Medio.** Il netto è preservato per costruzione, ma il registro storico cambia forma: le righe `rettifica scarico` spariscono. È l'effetto voluto, va detto prima perché è visibile all'operatore                                                                    |
| 2   | **Due righe della stessa variante**       | oggi `aggregateStockLines` le **fonde** in un movimento solo (`document-stock-reconcile.util.ts:25-30`)                                    | **Alto, ed è il cuore del cambiamento.** Dopo la correzione diventano due movimenti. La giacenza non cambia; cambia il conteggio delle righe nel registro e in qualunque report che conti movimenti invece di sommarne le quantità (vedi #6)                          |
| 3   | **Eliminazione o modifica riga**          | il sync elimina il movimento orfano e ripristina la giacenza (`goods-receipt-sync:241-252`)                                                | **Basso.** Comportamento già in esercizio su tre percorsi                                                                                                                                                                                                             |
| 4   | **Cambio location**                       | i sync fanno storno pieno sulla vecchia coppia e applicazione piena sulla nuova (`:186-198`); il reconcile fa lo stesso in forma aggregata | **Basso.** Semantica invariata, cambia la granularità                                                                                                                                                                                                                 |
| 5   | **Ordine cliente → DDT, consumo impegni** | `concludeLinkedManualOrderTx` è chiamato alla conferma (`:2378`) e nell'update (`:2080`), **fuori** dal blocco movimenti                   | **Basso.** Non tocca i movimenti e non viene toccato. Da coprire comunque con un test, perché è il legame che trasforma l'impegnato in scarico                                                                                                                        |
| 6   | **Report e registro Movimenti**           | il registro elenca movimenti; i report di vendita filtrano per tipo e sommano quantità con segno per tipo                                  | **Medio.** Chi somma quantità non si accorge di nulla; chi conta righe vede numeri diversi. Da censire prima di eseguire: è la stessa verifica già aperta per il segno della Nota di credito                                                                          |
| 7   | **Chiamanti di `applyStockSale`**         | **due soli**, entrambi in perimetro: `documents.service.ts:2312` e `document-stock-reconcile.util.ts:112,138`                              | **Basso.** Nessun chiamante esterno da inseguire                                                                                                                                                                                                                      |
| 8   | **Retry e idempotenza**                   | il modello per riga è idempotente **per costruzione**: si ritrova il movimento e lo si riscrive                                            | **Basso, e migliora.** Oggi un doppio salvataggio passa dal reconcile, che confronta vecchio e nuovo e quindi non duplica; ma se un percorso inserisse invece di ritrovare, il duplicato nascerebbe. Con `sourceLineId` c'è il vincolo unico del database a impedirlo |
| 9   | **Tenant**                                | tutti i sync filtrano per `tenantId`, il vincolo unico è su `(sourceDocumentType, sourceLineId)` e l'id riga è già per tenant              | **Basso.** Nessuna via di fuga fra tenant                                                                                                                                                                                                                             |

### Un difetto trovato durante la misura, da decidere a parte

_Misurato 15/08:_ la riconciliazione in modifica è invocata **solo per `sales_ddt`** (`documents.service.ts:1747`). La **Fattura accompagnatoria** scarica alla conferma (`:2301`) ma, se modificata dopo, **non riconcilia nulla**: le giacenze restano ferme sui valori del primo salvataggio.

Non lo correggo dentro questo lavoro e non lo do per certo come difetto vissuto: **va prima verificato se la maschera consenta di modificare un'accompagnatoria già confermata.** Se lo consente, è un difetto vivo oggi; se non lo consente, è una trappola che si arma il giorno in cui la famiglia Fattura diventa modificabile — cioè il lavoro che stiamo per iniziare.

---

## §7 · Casi di collaudo

Ognuno va scritto come test che **fallisce senza la correzione**.

**Il registro, che è ciò che l'operatore guarda**

1. DDT con una riga, quantità 3, confermato → **un** movimento `sale` −3 con `sourceLineId` valorizzato.
2. Lo stesso DDT modificato a 2 → **sempre un** movimento, ora −2. Nessuna riga `Carico +1`.
3. Modificato a 4 → sempre uno, −4.
4. Risalvato identico → nessuna scrittura, nessun movimento nuovo.
5. Salvato due volte di fila (retry) → effetto di un salvataggio solo.

**Le righe**

6. Due righe della stessa variante → **due** movimenti distinti, giacenza pari alla somma.
7. Riga eliminata → il suo movimento sparisce, la giacenza torna su; **le altre righe non si toccano**.
8. Spunta magazzino tolta su una riga → stesso esito del punto 7, limitato a quella riga.
9. Riga con servizio o importo, senza variante → **nessun** movimento, e il documento si salva lo stesso.

**Le giacenze**

10. Cambio location → storno pieno sull'origine, applicazione piena sulla destinazione, nessun residuo.
11. Cambio variante sulla riga → l'effetto si sposta sulla nuova variante per intero.

**Lo storico**

12. DDT storico con movimenti aggregati e una rettifica: dopo un salvataggio, movimenti per riga e **giacenza identica al centesimo di pezzo** rispetto a prima.

**I confini**

13. DDT collegato a vendita online → nessun movimento, prima e dopo.
14. Scarico manuale giacenze → **nessun movimento**, prima e dopo (§8).
15. Ordine cliente concluso in DDT → impegni consumati come oggi.

---

## §8 · Confini — cosa questo lavoro non tocca

**Lo Scarico manuale giacenze resta fuori, sempre.** _Deciso, e già in vigore:_ `manual_unload` sottrae la giacenza direttamente al salvataggio **senza creare alcun movimento** (`document-stock-manual-unload.util.ts`, deroga documentata in `regole-gestionale`). Il documento è l'unica evidenza dello scarico. Il tipo compare in `DOCUMENT_STOCK_UNLOAD_TYPES` insieme a DDT e accompagnatoria, ma è instradato altrove (`documents.service.ts:2326`): il nuovo sync **non deve raccoglierlo**, e un test lo verifica (§7.14).

**Il DDT generato da vendita online resta senza movimenti**: la merce è già uscita col giro dell'ordine.

**Non si tocca la Rettifica né il Trasferimento**, nonostante la modifica sia legacy anche per loro (§2). Sono lavoro dello stesso tipo, da fare dopo e a sé — una correzione alla volta, con i suoi test.

**Nessuna migration.** Colonne e vincolo esistono dal giorno in cui l'Arrivo merce è passato al modello per riga.

---

## §9 · Perché si fa adesso e non insieme alla famiglia Fattura

Perché Fattura e Fattura accompagnatoria **passeranno da qui**. Costruirle sopra il percorso aggregato significa scrivere codice nuovo su un modello che è già dichiarato superato dallo schema, e doverlo poi correggere due volte — una per il DDT e una per le fatture — con il doppio dei test e il doppio del rischio.

E c'è la Nota di credito: se prende la casella «Carica magazzino» (`07-specifica-famiglia-fattura.md` §6), il suo carico deve nascere sul percorso per riga. Su quello aggregato l'operatore vedrebbe comparire movimenti di rettifica al primo cambio di quantità — esattamente il difetto che questo documento chiude.

**Deciso 15/08: si fa adesso, come correzione a sé, prima della famiglia Fattura.** Non resta registrato come difetto noto da correggere insieme alle fatture: sarebbe scrivere codice nuovo su un modello già dichiarato superato dallo schema.

---

## §9-bis · L'annullamento: due comportamenti, e resta aperto

**Registrato, non deciso.** La modifica ordinaria è chiusa — aggiorna lo stesso movimento — ma l'annullamento è semanticamente un'altra cosa, e questo lavoro ci ha lasciato dentro due comportamenti diversi:

| Documento                              | Annullandolo                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| già convertito (ha movimenti per riga) | il sync a righe vuote li **rimuove**: i movimenti spariscono, la giacenza torna               |
| mai passato dal sync (legacy)          | resta il comportamento storico: uno **storno accodato**, e i due movimenti restano a registro |

Il primo è il comportamento che l'Arrivo merce ha già, ed è il motivo per cui è stato imitato. Ma **non è stato deciso che sia la regola generale**, e non va dedotto da qui: un documento annullato che cancella le proprie tracce e uno che le lascia con lo storno raccontano due storie diverse a chi legge il registro fra sei mesi.

Va chiuso a sé, prima di estendere la politica ad altri tipi.

---

## §9-ter · Censimento: chi legge i movimenti, e cosa cambia per lui

_Misurato 15/08, dopo FASE 2._ La domanda era: passando da «un movimento eventualmente aggregato per variante» a «un movimento per riga documento», qualche risultato funzionale cambia?

### Chi conta le righe

| Punto                                                        | Cosa fa                      | Cambia                                           |
| ------------------------------------------------------------ | ---------------------------- | ------------------------------------------------ |
| Elenco Movimenti (totale paginazione)                        | conta righe                  | **sì** — più righe, ed è il comportamento voluto |
| Export movimenti                                             | esporta righe                | **sì** — più righe                               |
| Cambio shop Shopify («quanti movimenti verranno cancellati») | conta righe                  | **sì** — numero più grande                       |
| «Il prodotto ha movimenti?» prima di eliminarlo              | presenza                     | no                                               |
| «La location ha movimenti?» prima di cancellarla             | presenza                     | no                                               |
| Guardie del salvataggio documenti                            | presenza                     | no                                               |
| Situazione di magazzino                                      | `SUM(quantity)` per variante | **no**                                           |

### ⚠️ Il punto vero sono i report vendite, e non era previsto

Il ricavo di un movimento **non sta sul movimento**: si legge dalla riga collegata via `sourceLineId` (`movement-sales-revenue.util.ts`). I movimenti dello scarico di vendita non ce l'avevano, quindi:

| Grandezza              | Prima di FASE 2                                | Dopo                             |
| ---------------------- | ---------------------------------------------- | -------------------------------- |
| Pezzi venduti          | i DDT c'erano già (tipo `sale`)                | invariato                        |
| **Fatturato**          | DDT = **0**, la riga non era risolvibile       | DDT = totale delle righe         |
| **Numero transazioni** | DDT **non contati** (`sourceDocumentId` nullo) | contati, una volta per documento |
| Margine                | DDT fuori (costo non congelato sul movimento)  | invariato                        |

E cambia **documento per documento**, man mano che ciascuno si converte al primo salvataggio: per un periodo i report mescolano DDT convertiti e non.

### ⚠️ La decisione che rende il punto più grande: **i DDT non sono vendite**

_Dichiarato da Luigi il 15/08._ Se il DDT non è una vendita, allora **non era giusto nemmeno prima**: i suoi pezzi finivano già in «pezzi venduti», ed erano invisibili solo nel fatturato perché il ricavo non si risolveva. FASE 2 non ha creato il problema — lo ha reso visibile.

Ma la conseguenza va guardata in faccia prima di correggere: **il fatturato dei report nasce dai MOVIMENTI, non dai documenti fiscali.** La Fattura che segue un DDT non movimenta nulla, quindi togliendo i DDT dal report quel fatturato **non viene sostituito da niente**: sparisce. Il che dice che la fonte del ricavo, per un gestionale che fattura, non può essere il magazzino.

**Non toccato, e da chiudere a sé.** Qui si registra soltanto che cosa è misurato e perché la correzione non è «filtrare via i DDT».

---

## §10 · Stato e punto di ripresa

**Stato al 15/08/2026: FASE 1 e FASE 2 eseguite** (§4-bis e §4-ter). L'identità delle righe è stabile nel salvataggio generico, e lo scarico di vendita — DDT e Fattura accompagnatoria — scrive un movimento per riga che si aggiorna in posto. Nessuna migration, nessuna pulizia dei dati storici: la conversione avviene documento per documento, al primo salvataggio.

### Cosa è già deciso

| Voce                                                                     | Stato                                                                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La regola «un movimento per riga, aggiornato in posto»                   | **decisa**, ed è nello schema dal giorno dell'Arrivo merce                                                                                                |
| Allineare lo scarico di vendita **adesso**, prima della famiglia Fattura | **deciso 15/08**                                                                                                                                          |
| Lo Scarico manuale giacenze resta **sempre** escluso: non crea movimenti | **deciso**, deroga già in vigore                                                                                                                          |
| Nessuna migration                                                        | **misurato**: colonne e vincolo esistono                                                                                                                  |
| Nessuna FK verso `StockMovement`                                         | **misurato 15/08**: zero relazioni entranti, zero colonne `movementId`, nessun id di movimento salvato altrove. La conversione può cancellare fisicamente |
| Rettifica e Trasferimento: la modifica è legacy anche per loro           | **superato**: il gate per-riga esiste già anche per loro (§2)                                                                                             |

### Cosa resta aperto

1. **Il censimento di chi conta i movimenti invece di sommarli** (rischio #6). Due righe dello stesso articolo ora sono due movimenti: chi somma quantità non se ne accorge, chi conta righe sì. **Da eseguire**: non è stato fatto.
2. **L'Ordine fornitore** ha il difetto gemello su `SupplierOrderLine` (`03b` §8.2): righe ricreate a ogni salvataggio, e `supplierOrderLineId` azzerato sulle righe arrivo merce. Non toccato.
3. **La prova sul campo**: rifare il caso della schermata sull'applicazione vera — DDT da 3 a 2 — e verificare che nel registro resti una sola «Vendita −2». I test lo fissano, il collaudo lo conferma.

### Come si riprende

Tutto ciò che serve è qui: i percorsi (§2), la causa radice (§3), la catena eseguita (§4, §4-bis, §4-ter), la ricetta di conversione (§5), i rischi (§6) e i casi di collaudo (§7). Le misure portano la data del **15/08**: il database è condiviso e il codice si muove, quindi prima di dedurre qualcosa dallo stato dei dati va rifatta la lettura — in particolare quanti documenti abbiano ancora movimenti legacy da convertire.

**La conversione non è un'operazione da lanciare.** Non esiste uno script, e non serve: ogni documento si converte da sé al primo salvataggio che lo tocca. I documenti mai più riaperti restano com'erano, con la loro giacenza corretta.
