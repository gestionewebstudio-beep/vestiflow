# Cosa resta da fare — VestiFlow

**Aggiornato:** 23/08/2026
**A che serve:** riprendere il lavoro in un'altra sessione **senza ricostruire niente**.
Ogni voce dice cosa è già misurato, cosa è deciso e cosa no.

⚠️ **Questo file era `DA-FARE-CORRISPETTIVI-E-SHOPIFY.md`.** Rinominato il 18/08/2026 su
indicazione del proprietario: le cose in sospeso non stavano più solo lì dentro — la
tabulazione delle anagrafiche, le soglie della vista a card, il netto/ivato in cassa non
hanno niente a che vedere coi corrispettivi, e tenerle sotto quel titolo voleva dire o
aprire un file per argomento, o scriverle sotto un nome che le nasconde. **Qui dentro sta
tutto ciò che è in sospeso**, qualunque sia l'area.

**Cosa NON va qui.** Le **specifiche** restano nei loro file numerati (`03` righe
documento, `04` numerazione, `10` Registro…) e le **regole** in `.claude/rules/`: quelli
dicono come una cosa deve funzionare, questo dice cosa manca. Quando una voce di qui
diventa una decisione stabile, si sposta lì e qui resta il rimando.

ATTENZIONE: il blocco in cima — **LAVORO IN CORSO, righe documento e varianti** — e' quello
aperto adesso. Il resto del file e' arretrato di aree diverse.

**Le aree, in ordine di comparsa:** **righe documento e varianti (in corso)** · prima sincronizzazione Shopify · sedi · anagrafica
articolo · difetti aperti · Corrispettivo manuale · **tabulazione da tastiera** (punto 7,
il lavoro grosso aperto).

⚠️ **Il ramo cambia, e questa riga invecchia da sola**: al 20/08/2026 si lavora su
`feature/pagamenti-tesoriera`. Chi riprende verifichi con `git branch --show-current`
invece di fidarsi di quanto scritto qui.

---

# ⛔ LAVORO IN CORSO — righe documento, varianti, struttura _(23/08/2026)_

⚠️ **Questo blocco sta in cima perché è quello aperto adesso.** È scritto per essere
ripreso da zero: ogni voce dice se è **decisa**, se è **fatta**, e cosa la blocca.

Le decisioni argomentate stanno in **`docs/CONTRATTO-COMUNE-DOCUMENTI.md`** (§3.2 titolo
e variante, §4 richiamo articolo, §5.5 sconto, §5.7 listino, §6.2 spunte magazzino).
Qui c'è **cosa resta da fare**, non perché.

## ✅ Fatto e committato — non va rifatto

| Commit     | Cosa                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `8fa6b3d0` | **L'IVA di riga dell'Ordine cliente si azzerava al risalvataggio.** Il contratto binario era onorato dal client e non dal server (`preservedLineVat` mancava in `sales-orders`). Colpiva 4 tipi documento                     |
| `f743c6e6` | **La spunta «Scarica giacenze» della Vendita al banco non viaggiava**: il client non la mandava, il server cablava `true`. Toglierla non fermava la merce                                                                     |
| `569ae890` | **«Duplica riga» rimossa** da tutte le maschere, wrapper card e componenti condivisi. Due test-guardia impediscono il rientro                                                                                                 |
| `66a4f5f4` | **U.M.: una regola sola.** Tolti i due ripieghi client e quello server; la maschera cattura, la riga conserva                                                                                                                 |
| `87369c2d` | **T0 varianti: una funzione sola** (`api/src/common/variant-label.util.ts` + gemella client). Chiude la forma a mappa e il sentinella Shopify                                                                                 |
| `16b78933` | **Arrivo merce sulla riga comune** — l'ultima delle sette. 26 `<th>` e 29 `<td>` locali → 0. Catalogo canonico a **31 colonne**; `fieldBlur` promosso a primitiva condivisa; il controllo sconto si chiama `discount` ovunque |
| `3462ad65` | **37 import senza template** rimossi dalle cinque maschere migrate (NG8113). Restano fuori i tre `InlineBannerComponent` degli elenchi, precedenti a questo filone                                                            |
| `27bbb89a` | **Il `<colgroup>` dell'Ordine cliente non conosceva la Variante**: 16 `<col>` che mappano per posizione, con la sesta in poi sulla colonna sbagliata. Stesso difetto dell'Arrivo merce, nella maschera di riferimento         |

## 🔵 BLOCCO A — la colonna Variante

**Deciso**: il titolo dell'articolo è **uno**; la variante va in una **colonna propria**,
mai dentro il titolo. Contiene i **soli valori** (`M / Rosso`), memorizzati come **testo
composto** — non dati grezzi da ricomporre: un documento emesso deve continuare a dire
quello che diceva.

|                                       | Stato                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T0** funzione unica di composizione | ✅ `87369c2d`                                                                                                                                                                                                                                                                           |
| **T1** schema + migration             | 🔵 **prossimo**. `variantLabel TEXT NOT NULL DEFAULT ''` su `document_lines`, `supplier_order_lines`, `sales_order_lines`, `online_sale_lines`, `inventory_count_lines`. Migration **a mano**, fine riga LF, poi `npm run prisma:deploy` + `prisma:generate` + **avvio reale dell'API** |
| **T2** la scrittura                   | ⛔ **insieme** alla rimozione della concatenazione del banco (`store-sales.service` scrive `productName — optionSummary` dentro `description`). Separarle produce «Maglietta — M / Rosso — M / Rosso»                                                                                   |
| **T3** colonna desktop                | ⛔ id **`variantLabel`**, MAI `variant`: `normalizeGoodsReceiptColumnId` rimappa `variant` su `product`, e la colonna sarebbe irraggiungibile in Arrivo merce, in silenzio                                                                                                              |
| **T4** card mobile                    | `variantLabel` **esiste già** su `document-line-card`, con stile: la riempie 1 maschera su 7                                                                                                                                                                                            |
| **T5** PDF e stampe                   | tre PDF: documento, ordine fornitore, ordine cliente. Le frazioni di larghezza devono sommare a 1.00                                                                                                                                                                                    |
| **T6** XML fattura elettronica        | ⛔ lì la colonna separata **non esiste**: un solo `<Descrizione>` per riga. Si ricompone in **un punto solo** (`document-xml.service`), non nella util. ⏸ **Da verificare sulla fonte ufficiale** cardinalità e lunghezza                                                               |

⭐ **Guadagno adiacente visto e non fatto**: lo SKU oggi il PDF lo stampa e l'XML lo perde.
`CodiceArticolo` è lo slot fatto apposta ed è vuoto.

⚠️ **Semantica da non perdere**: `''` = nessuna opzione visibile, **compresi** prodotto
semplice e il `Default Title` di Shopify. `variantId` resta l'identità tecnica,
`title` / `description` / `productName` restano il testo della riga. **Nessuna
concatenazione permanente.**

## 🔵 BLOCCO B — lo sconto a cascata ovunque

**Deciso**: formato e regola **uguali in ogni documento**. Una cella sola, cascata a N
valori (`5+7+10`), **notazione conservata alla riapertura**, «prezzo scontato» colonna a sé.

⚠️ **La cascata esiste già** e regge N valori. A mancare è la **conservazione**:
`SalesOrderLine.discount` è testo e la conserva, `DocumentLine.discountPercent` e
`SupplierOrderLine.discountPercent` sono `Decimal(7,4)` e memorizzano solo l'effettiva —
si digita `5+7+10`, si riapre e si legge `20,49`.

**Tocca lo schema**: colonna testo su quelle due tabelle, **nessun backfill** (convertire
13,6 in «4+10» è indecidibile). ⏸ Da valutare: `Decimal(7,4)` verso `(9,6)`, perché tre
valori a due decimali producono sei decimali.

## 🔵 BLOCCO C — il listino come sorgente del prezzo

**Deciso** (§5.7 del contratto): la sorgente si dichiara nell'**anagrafica della
controparte**, il documento la eredita all'apertura, la testata ha la **select** per
cambiarla — su vendita **e** acquisto — e cambiarla **ripopola tutte le righe**.

- ⛔ **`Customer` non ha nessun campo listino**: serve una colonna su `customers`
- il meccanismo di lettura **esiste già**: `document-listino.util`, adottato da **2 maschere su 8**
- ⛔ nessun ripiego: articolo senza valore per quel listino porta a **0,00 + segnalazione per riga**
- ⏸ **APERTO**: dove vive il «prezzo fornitore». Oggi `SupplierVariantLink.lastPurchasePriceMinor`
  è l'**ultimo prezzo pagato**, riscritto dai carichi — non un valore impostabile

## 🔵 BLOCCO D — il risolutore di riga unico

⭐ **È l'obiettivo grande**, e il resto ci converge. Oggi la domanda «ho scelto questo
articolo in questo documento: cosa scrivo sulla riga?» ha **una risposta per maschera**;
in ERPNext ne ha una sola (`get_item_details` più `transaction.js`).

**Il contratto proposto** sta nella sintesi del censimento del 23/08: funzione pura
`resolveDocumentLine(input): LineResolution`, con `set` (i campi **da scrivere**, già
filtrati dalla regola della fotografia), `live` (fatti che non si persistono mai) e
`issues` (avvisi, mai blocchi). Profilo **`Record` esaustivo per tipo**, non
`if(documentType)`.

⛔ **Il T0 del risolutore viene prima di qualunque unificazione**: il test di
caratterizzazione che fotografa **com'è oggi**. E va scritto sui **PERCORSI**, non sulla
matrice — la scansione dell'Arrivo merce forza `loadsStock = true` scavalcando la politica
dichiarata per quella maschera.

⚠️ **Tre «nuclei comuni» erano scritti più larghi di dove sono veri** (verificato da un
agente avversario):

- «tutte e otto leggono `VariantSummary`» → la Registrazione fattura ha **zero** occorrenze
- «il flag magazzino nasce dal tipo articolo, identico ovunque» → **esiti opposti** su un Servizio
- `DOCUMENT_LINE_COLUMNS` come «decisione già presa» → copre **3 maschere su 8**

## 🔵 BLOCCO E — decisioni prese, da applicare ovunque

|                            | Cosa manca                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Richiamo articolo** (§4) | sovrascrive **sempre** con l'anagrafica, anche a parità di articolo; **quantità e sconto digitati restano**. Oggi lo fa **solo l'Ordine fornitore**                           |
| **Servizio** (§6.2)        | non fa partire **nessuna** delle tre spunte. Oggi due formule con esiti opposti                                                                                               |
| **«Titolo»**               | rinominare «Nome prodotto» in «Titolo» ovunque, per parità con Shopify                                                                                                        |
| **Duplica documento**      | nella **barra azioni degli elenchi**, per tutti i tipi. ⛔ Tre tipi hanno rotta `null`, cioè comando **muto**; l'Ordine fornitore non ha duplicazione affatto (lavoro server) |
| **Registra movimento**     | i tre pulsanti in anagrafica aprono **quella maschera come popup**, articolo precompilato                                                                                     |
| **Inventario fisico**      | 5 passi di adozione dei componenti condivisi (elenco, filtri mobile, tabella righe, lookup e scanner, barra azioni). ⛔ **Non** `DocumentLineFocusStore`                      |

## ⛔ DIFETTI MISURATI E NON ANCORA CORRETTI

Trovati dal censimento del 23/08, tutti con file e riga nella sintesi. Per gravità:

1. **Registra movimento scrive il prezzo di VENDITA in `unitCostMinor`** sullo Scarico: la
   UI dice «Prezzo unitario», propone il listino, e quel numero finisce nella colonna del costo
2. **I movimenti di Registra movimento sono irreversibili**: nessun `PATCH`, nessun `DELETE`.
   ⏸ Decisione aperta: si accetta, o servono modifica ed eliminazione?
3. **Costo 0 diventa `null`** sull'Ordine fornitore, contro la decisione «un articolo senza
   costo ha costo 0» e contro il commento della maschera stessa
4. **`isReference` perso nel duplicato server-side**: una riga «Documento collegato» rinasce
   come riga ordinaria ed entra nei totali
5. **Il duplicato dell'Ordine cliente non azzera gli id** delle righe copiate (Trasferimento
   e Rettifica sì): il duplicato nasce dichiarando gli id dell'originale
6. **`applyConversionPrefill` non converte il prezzo** nella modalità del documento, mentre
   il suo gemello `onDocumentIncluded` sì
7. **Riga agganciata senza descrizione**: il salvataggio si rifiuta **senza dire quale riga**
8. **Il riallineamento in blocco ricattura la U.M. svuotata**: l'operatore non può lasciarla
   vuota su una riga con articolo _(emerso il 23/08 chiudendo la U.M.)_
9. **`TenantFeatureSettings.defaultUnitOfMeasure` non la legge nessuno**: esiste, è
   configurabile, e le maschere cablano `'pz'`. O si collega, o si toglie dalle Impostazioni
10. **Quattro maschere non ridistribuiscono le larghezze dal vivo** _(misurato 24/08/2026)_.
    Documenti vendita, Rettifica, Trasferimento e Ordine fornitore usano le **quote**
    percentuali (`lineColumnQuotaWidth`, `sumVisibleLineColumnsPx`) ma legano solo
    `(columnResized)`: trascinando una maniglia il totale cambia e **tutte** le altre
    colonne si riscalano, invece di far cedere spazio alla vicina. Arrivo merce e Ordine
    cliente lo fanno — ognuno con una **copia sua** di `redistributeLineColumns` +
    `lineColumnDraft`. Due sistemi a metà: o sale il pezzo mancante nell'utility comune,
    o le due copie restano a divergere
11. **Inventario fisico**: `finalize` applica un **delta relativo** invece di portare la
    giacenza al valore contato; `createdByName` è la stringa `'API'`; il documento è creato
    **fuori** dalla transazione che ha già scritto giacenze e movimenti

## ⏸ Da fare al riallineamento dei rami — `defaultUnitOfMeasure` _(26/08/2026)_

⛔ **Qui c’era scritto «si toglie al merge, non prima», e il presupposto era sbagliato.**
Dava per scontato che per ripulire il codice bisognasse eliminare la colonna. Non serve —
e «si toglie al merge» non era nemmeno un meccanismo: nessuno l’avrebbe letto al momento
giusto, e il collega non ne sapeva niente.

### Quello che si può fare SUBITO, senza coordinare niente

Il campo esce da `schema.prisma`, dal DTO, dai `DEFAULTS`, da `toDto` e dal modello
frontend. **La colonna resta nel database, orfana.**

⭐ **Una colonna che il database ha e lo schema non dichiara è invisibile a Prisma**, e
nel progetto è già così — provato il 26/08 sul database condiviso:

```text
documents.cash_session_id     nel DB ✔   nel nostro schema ✘
p.document.count()        →   169        nessun errore
p.document.findFirst()    →   66 campi   cashSessionId non c’è
```

È una colonna del ramo cassa, sulla tabella più letta dell’applicazione. E non è sola:
il ramo locale ha già applicato le 6 migration di cassa (commit `445eabb7`), quindi nel
database vivono **12 oggetti** che questo `schema.prisma` non dichiara.

### Quello che invece NON si fa adesso: il `DROP` fisico

Gli altri rami dichiarano ancora la colonna. Toglierla dal database romperebbe le loro
query che la **nominano**.

⚠️ **Perimetro, misurato — non «ogni lettura».** Prisma nomina le colonne che la query
chiede: una `select` mirata sopravvive, cadono le query senza `select` (`upsert`,
`update`, l’export di backup) che fanno `RETURNING` di tutti gli scalari.

⛔ **E non è «facoltativo per sempre».** Non è urgente, ma una colonna fantasma è debito:
si toglie quando nessun ramo la dichiara più.

#### ⛔ La condizione è sui PROCESSI, non sulle dichiarazioni _(corretto dal proprietario, 26/08/2026)_

⛔ **Qui c’era scritto «si toglie quando nessun ramo la dichiara più». È troppo rigido**, e
trasformava un fatto operativo in una condizione quasi impossibile da soddisfare: un ramo
fermo su GitHub **non interroga niente**. Può dichiarare cento campi vecchi senza
conseguenze.

> **La condizione reale: nessun codice REALMENTE IN ESECUZIONE contro quel database deve
> ancora richiedere `defaultUnitOfMeasure`.**

I rami inattivi si riallineano **col merge** prima di essere rieseguiti — è esattamente a
questo che servono:

```text
ramo corrente (schema senza il campo)
   ├── merge → develop     develop diventa compatibile
   └── merge → main        main diventa compatibile
                              ↓
                   ⚠️ e POI il processo va ridistribuito:
                      il merge cambia il codice, non ciò che gira
```

⚠️ **Il merge non è una copia**: se quei rami hanno modifiche proprie divergenti, i
conflitti si risolvono — non si presume che diventino identici byte per byte.

#### Chi gira davvero contro questo database — misurato, con la sua riserva

Interrogato `pg_stat_activity` il 26/08/2026: **sei connessioni, tutte infrastruttura
Supabase** (`pg_cron`, `pg_net`, `postgres_exporter`, `PostgREST`, `Supavisor`) più una
anonima ferma da dodici giorni. **Nessuna connessione applicativa Prisma/NestJS visibile.**

⚠️ **Ma questa misura NON prova che Railway non sia connesso**, e va detto: le connessioni
passano dal pooler Supavisor, che le multiplexa — un client applicativo può non comparire
come connessione distinta. La misura dice «non se ne vede una», non «non ce ne sono».

⭐ **L’unico processo che conta resta `main` su Railway**, ed è lo stesso attore della
rinomina dell’enum (vedi `00-DECISIONI`, in testa). Le due cose si chiudono insieme, con
lo stesso merge e lo stesso ridispiegamento — non sono due lavori.

⭐ **E il `DROP` costerà zero**: nessun tenant ha mai cambiato quel valore —
`select count(*) where default_unit_of_measure <> 'pz'` → **0 righe**. Non c’è un dato da
salvare, solo una colonna da togliere.

#### Se il ramo cassa viene eliminato — cosa resta comunque da decidere

Le sue 6 migration sono **già applicate** al database e il ramo locale le porta
(commit `445eabb7`). Cancellare il ramo non annulla gli oggetti nel database.

⛔ **Le 6 cartelle di migration devono RESTARE** anche se il ramo sparisce: toglierle
farebbe divergere la storia (`_prisma_migrations` avrebbe 6 voci che la cartella non ha),
ed è la condizione che `prisma migrate status` segnala come `historiesDiverge`.

Restano invece **12 oggetti che nessuno schema dichiarerebbe più**. Sono praticamente
vuoti — quindi ripulirli, quando si deciderà, è gratis:

```text
cash_sessions · cash_session_movements · fiscal_receipts · fiscal_devices · pos_terminals    0 righe
store_sale_payments                                                                          1 riga
documents.cash_session_id                                                        0 valorizzati su 169
```

⏸ **Decisione aperta, non dedotta**: quegli oggetti si riconciliano nello schema o si
eliminano? Finché non è deciso restano orfani, e va bene — è lo stato in cui sono oggi.
---

## ⏸ DA PORTARE AL PROPRIETARIO — l’audit dei nove flag `TenantFeatureSettings`

⚠️ **Passo 1 fatto** (commit `caa9c82c`): tolte le due caselle «Giacenze negative»
(`warnNegativeInventory`, `blockNegativeInventory`) dal pannello Impostazioni, perché
non comandavano niente — nessun consumer, e la politica vera è quella di
`inventory-level-delta.util`: l’insufficienza **avvisa e non blocca mai**. Le colonne
restano nel database (vedi blocco qui sopra).

⛔ **I sette flag restanti NON si toccano** finché le domande sotto non hanno risposta.
Il proprietario è stato esplicito: _«non farei ancora modifiche automatiche»_, e un flag
che esiste non è un motivo per implementarlo.

## ⏸ DOMANDE APERTE — non colmarle per verosimiglianza

- **Prezzo fornitore**: dove vive il valore impostabile (blocco C)
- **XML fattura elettronica**: cardinalità e lunghezza di `<Descrizione>` **da verificare
  sulla fonte ufficiale**; e se il separatore lungo vada bene verso SdI
- **Import prodotti via XML**: il proprietario segnala che molti clienti caricano così. È un
  feed **diverso** da FatturaPA, e non ha ancora una specifica
- **Movimenti irreversibili** di Registra movimento (difetto 2 qui sopra)
- **I sette flag `TenantFeatureSettings` superstiti**: per ognuno, si implementa, si
  rimuove, o resta dichiarato aperto? Sono decisioni di prodotto, non di pulizia

---

## ⭐ Leggere prima: dal 20/08/2026 le decisioni stanno in `00-DECISIONI.md`

**Prima di cercare qui, si guarda lì.** `docs/00-DECISIONI.md` dice in una pagina che cosa è
già deciso e dove è argomentato, comprese **tutte le decisioni aperte in un posto solo**.
Questo file resta quello che era — **cosa manca** — e non è un indice.

### Chiuso il 20/08/2026, e non va più cercato qui

| Fatto                                                                                 | Dove è scritto |
| ------------------------------------------------------------------------------------- | -------------- |
| **motore tabella comune** su documenti, ordini cliente, ordini fornitore, movimenti   | `14` parte H   |
| **barra azioni e selezione** comuni, con il contratto `ListAction`                    | `14` parte D   |
| **clic di riga → Modifica**, dichiarato per tipo                                      | `14` §2        |
| **pulsante Dettaglio** su elenco documenti e ordini fornitore                         | `14` §E4, §E6  |
| **ordinamento** su tutti e tre gli elenchi paginati, con la guardia in `npm run lint` | `14` §H15      |
| **grammatica visiva** dei riepiloghi, decisa voce per voce                            | `14` §F6       |
| **niente paginazione**, apertura a 30 giorni, tetto dichiarato nel meta               | `14` §H14-bis  |

⚠️ **Restano da guardare a schermo**: le quattro schermate migrate, dopo la promozione della
grammatica. Build e test dicono che compila, non come si vede.

### Il prossimo blocco

**Vendita e Reso al banco** (`11`), che riparte in una sessione dedicata. §A11-quater di quel
documento elenca che cosa eredita dalla base comune: non si riprogetta niente di quello.

### ⛔ DUE BLOCCHI DEDICATI, dichiarati chiusi al lavoro corrente — 22/08/2026

Il proprietario li ha separati esplicitamente. ⚠️ **Non si aprono "per un pezzetto"**: sono
la ragione per cui una correzione può risultare **bloccata** invece che rimandata, ed è un
esito legittimo — improvvisarne metà di nascosto no.

#### Blocco A · **Includi / Genera**, e la provenienza di riga

Comprende il redesign del motore di inclusione e derivazione **e** il meccanismo che manca
sotto: un dato **per riga** che dica da quale documento quella riga proviene.

Il fatto che lo rende necessario, misurato il 22/08 (`07` §5-bis): **`DocumentLine` non ha
alcun campo di provenienza.** `lineSource` è della Registrazione fattura acquisto («Null
altrove»), `IncludedDocumentLine` trasporta solo `isReference`, e `sourceDocumentId` sta su
**`Document`** — dice da dove viene il documento, non la riga.

⭐ **Due cose esistono già e vanno usate come punto di partenza, non reinventate:**

| Cosa                                                              | Dov'è                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| una guardia di catena **in esercizio**                            | `Document.onlineSaleId` (`documents.service.ts` ~2343, `schema.prisma` ~2107) |
| un canale di aggancio **attivo**, separato da «Includi documento» | `linkedDdtIds` / `InvoiceSalesDdtLink`                                        |

⚠️ E **i motori di derivazione sono DUE** — `buildConversionDto` e `concludeManualPrefill`:
una guardia messa nel primo lascerebbe scoperto il secondo, che è quello attivo.

#### Blocco C · **Nota di credito → Fattura elettronica** _(registrato 22/08/2026)_

⛔ **Gap aperto, NON da correggere fuori dal suo blocco.** È emerso togliendo alla NC
l'aggancio DDT, e va tenuto distinto da quella correzione.

|                                                      |                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| tipo fiscale                                         | **`TD04`**                                                                                            |
| collegamento alla Fattura/Accompagnatoria originaria | **già deciso**                                                                                        |
| implementazione FE                                   | **non ancora completa** — il generatore emette `TD01` per ogni fattura esportata e non conosce `TD04` |
| dove si affronta                                     | blocco dedicato **Famiglia Fattura / FE**                                                             |

⚠️ **Non va confusa con «Includi»**: la Nota di credito **non include DDT**, e quel percorso è
chiuso dal 22/08 (`07` §5-bis). Il collegamento che le compete è quello con la **fattura
originaria**, ed è un'altra relazione — `Document.sourceDocumentId`.

⭐ **La distinzione conta proprio qui**: quando la FE della NC verrà implementata, i
riferimenti che l'XML richiede si prenderanno **attraverso la fattura di origine**. Chi
leggesse solo «alla NC servono dei riferimenti DDT» sarebbe tentato di riaprire l'ingresso
appena chiuso.

#### Blocco B · **Document Line trasversale** — il censimento NON è chiuso

Riprende dopo la chiusura dei difetti concreti. Comprende:

- il **catalogo canonico** delle celle e delle colonne condivise, completato;
- la verifica e la migrazione dei documenti che hanno ancora **celle locali o duplicazioni**,
  **un documento alla volta, con test di regressione**;
- il completamento della condivisione di **riga, intestazione e riga di inserimento** dove
  applicabile;
- Codice fornitore, SKU, EAN, descrizione riga, prezzi articolo che entrano nel catalogo
  **senza obbligare ogni documento ad avere tutte le colonne**.

> ⛔ **Il principio che governa tutto il blocco B, fissato dal proprietario:**
> **condividere il componente non significa condividere il significato o il dato sottostante.**

Le quattro applicazioni già dichiarate di quel principio:

| Caso                          | Si condivide            | NON si condivide                                                                   |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `commitsStock` / `loadsStock` | la cella                | **sono dati diversi**: uno impegna, l'altro movimenta                              |
| **quantità**                  | la cella e la sua veste | `min`, validatore ed effetti restano **policy del documento**                      |
| **Giacenza / Disponibile**    | la cella                | i dati sono **calcolati rispetto alla location** di quel documento                 |
| **costo**                     | la grammatica visiva    | costo **informativo**, costo **documento** e costo **anagrafica** restano distinti |

---

## ⚠️ Leggere prima: la specifica del Registro è cambiata il 16/08/2026

Esiste ora **`10-specifica-registro-corrispettivi.md`**, ed è la fonte corrente. Tre cose
che questo file dava per assodate non lo sono più:

1. **Nessun flusso «commercialista».** Consegne, invii e registrazioni sono stati
   rimossi — codice, UI e persistenza. Periodo → filtri → stampa/export → fine.
2. **Shopify POS compare nel Registro** come vendita fisica/POS. Non si esclude: si
   classifica, e la classificazione viene da `source`.
3. **`SalesOrderFiscalStatus` non esiste più**, colonna e tipo PostgreSQL. Non è stato
   sostituito.

E una che era scritta qui e altrove ed era falsa: **`CorrispettivoEntry` non è la sorgente
del Registro** — quella tabella non viene più scritta dall'11/08, e le sue righe residue
sono storia. Non ci si deduce la logica nuova (`10` §7).

---

## Prima di toccare qualsiasi cosa: tre fatti che cambiano come si legge tutto

### 1. I webhook di Shopify vanno in PRODUZIONE, non sulla macchina di sviluppo

Le sette sottoscrizioni puntano a `https://vestiflow-production.up.railway.app`, che gira **`main`**, sullo **stesso database** di sviluppo.

| Chi provoca il fatto                         | Chi lo esegue       | Con quale codice |
| -------------------------------------------- | ------------------- | ---------------- |
| un gesto su Shopify (ordine, evasione, reso) | ambiente pubblicato | `main`           |
| un pulsante nell'app locale                  | API sulla macchina  | il ramo corrente |

**Conseguenza pratica**: una correzione su questo ramo non entra in gioco finché qualcuno non preme un pulsante. Chi guarda il database vede il risultato della produzione e rischia di attribuirlo al proprio lavoro — **è già costato un errore** il 14/08 (la sede di scarico, dichiarata «corretta» guardando un movimento prodotto in realtà dal ripiego di `main`).

Dettaglio in `02-specifica-sincronizzazione-shopify.md` §4.11.

### 2. Il grado di certezza si dichiara, e sono tre

**letto** (ho letto la riga di codice) · **dedotto** (segue dallo strumento, non l'ho visto) · **provato** (eseguito sul sistema vero, database letto prima e dopo).

Quella che si perde più facilmente è la differenza fra le prime due: un'analisi di codice produce «letto», e il «quindi succede X» è **dedotto**.

### 3. Il database è condiviso col collega

Solo `npm run prisma:deploy`, mai `migrate dev` né `db push`. Migration scritte a mano. Ogni tabella nuova porta RLS e `REVOKE` nella stessa migration.

---

## Cosa è stato chiuso il 14/08 — non va rifatto

Diciassette commit, tutti su albero verde (1512 test API, lint completo, type-check di entrambi i lati). **Niente push, niente deploy.**

**Il registro corrispettivi è finito e funziona così:**

- è **derivato** da vendite e rettifiche — `corrispettivo_entries` non viene più scritta dal ramo;
- conta le vendite alla **data di evasione**; un ordine mai spedito non entra, un annullamento pre-evasione resta fuori da sé;
- **sottrae le rettifiche alla loro data**, saltando gli annullamenti;
- l'elenco mostra le rettifiche come **righe negative**: il totale in fondo si ricostruisce sommando la colonna;
- si filtra per **periodo di calendario** (mese, trimestre, anno precisi), **canale** e **tipo**, indipendenti fra loro;
- **CSV, Excel e PDF** usano lo stesso dataset della schermata e si riconciliano col proprio totale;
- è quello che l'operatore trova su **«Corrispettivi» in sidebar**; `/app/reports/corrispettivi` fa redirect.

**Riconciliazione di agosto 2026**, verificata per tre strade indipendenti:

```
venduto      411,02
rettifiche  −205,01
annullamenti      0     (vendite mai avvenute)
─────────────────────
corrispettivo 206,01
```

**Quattro difetti corretti**, tutti trovati con ordini costruiti apposta: la sede di scarico (`01` §3.8), l'IVA della spedizione nei rimborsi (`08` §4), il registro che contava merce mai partita (`01` §2.16), l'imposta di riga ridistribuita (`01` §3.12).

---

## Da fare, in ordine

### 1. ⭐ Procedura di prima sincronizzazione — **mai entrata in `docs/`**

È il lavoro più grande e blocca gli altri due. Deve contenere, oltre a quanto già discusso altrove:

- **la corrispondenza fra aliquota Shopify e Codice IVA di VestiFlow.** Oggi le righe importate portano `{"ratePercent": 22, "matched": false}` — l'aliquota osservata, **senza** codice interno. È deliberato: il dato del canale si conserva subito, la corrispondenza è una decisione. Senza di essa il **filtro per aliquota** non può tornare nel registro, perché sarebbe solo un'etichetta;
- **l'aggancio delle location**, che è il prerequisito per leggere le _fulfillment orders_ e chiudere il ripiego alfabetico sull'impegno (`01` §3.8, parte ancora aperta);
- il resto del disegno in `02-specifica-sincronizzazione-shopify.md`, che è **disegno e non consuntivo**.

### 2-bis. ✅ Il Corrispettivo manuale è costruito — 17/08/2026

**Fatto.** Entità, API, innesto nel Registro, colonna e filtro Sede, colonna origine e
dettaglio IVA nell'export, maschera di creazione/modifica/eliminazione, con le prove del
`10` §13. Il consuntivo della costruzione — le sette cose che il §13 non prevedeva, e cosa
resta — è in **`10` §14**.

⚠️ **La guida utente è stata aggiornata insieme** (§15). Qui sotto resta il testo di allora,
perché dice ancora _cosa_ doveva entrarci e serve a rileggerlo con occhio critico.

_Testo del 17/08, prima della costruzione:_

`GUIDA-UTENTE-VESTIFLOW.md` §15 «Corrispettivi» oggi **è ancora esatta** — verificato il
17/08: descrive il quadro economico per periodo, non nomina la verticale ritirata, e non
descriveva nemmeno il pulsante export doppione che è stato spento. Non c'è niente da correggere
adesso, e scrivere in guida una funzione che non c'è è peggio che non scriverla.

**Cosa andrà aggiunto quando la maschera sarà pronta**, in §15 subito dopo «Come si usa»:

- il pulsante **«+ Aggiungi corrispettivo»** e a cosa serve — i quattro casi reali (cassa
  esterna durante un guasto, vendite non ricostruibili, differenza di chiusura, importi
  storici), detti con parole da operatore;
- che è una registrazione **solo economica**: non tocca il magazzino, non crea prodotti;
- righe `Descrizione · Importo · Codice IVA`, più aliquote nella stessa registrazione;
- il selettore **Ivati/Netti**, che parte da Ivati perché si copiano i valori della cassa;
- che si può **correggere ed eliminare**, e che eliminando resta un buco nella numerazione —
  è normale e non si rinumera niente;
- la colonna **Location** e il perché di **«Non determinata»** sulle righe Shopify, con la
  riga che dichiara quante ne restano fuori quando si filtra per sede.

⚠️ E va aggiornata anche la tabella dei permessi di §15: la scrittura sul Registro passa da
`reports.fiscal_register`, la cui descrizione parla ancora di «marca le consegne al
commercialista» — flusso **ritirato**. Quel testo va riscritto quando il permesso viene usato
davvero: oggi non lo usa nessuna rotta.

### 2. Specifica sedi

Ferma dalla mattina del 14/08.

#### ⚠️ Lacuna registrata il 17/08: la Location Shopify non è strutturalmente affidabile

> **La Location delle vendite e delle evasioni Shopify deve essere sempre determinata in modo
> affidabile, e non deve dipendere da ripieghi arbitrari.**

Emersa costruendo il **Corrispettivo manuale** (`10` §12), che porta la colonna Location dentro
il Registro Corrispettivi. Misurata, non ipotizzata:

- `SalesOrder.locationId` **esiste ma è della sola testata manuale**, e la sync non lo scrive
  mai — né in `orderData` né nel `create`. Per gli ordini di canale il Registro può leggere la
  location **solo** dalla Vendita online;
- `OnlineSale.locationId` **è nullable**, e la sync passa una location all'evento solo se ci
  sono righe impegnabili;
- dove il valore c'è, **può essere stato indovinato**: se la sede Shopify non è mappata,
  `resolveShopifyOrderLocationId` ripiega sulla **prima sede licenziata in ordine alfabetico**
  (`orderBy: { name: 'asc' }`). Il danno è già stato misurato una volta e sta scritto nel
  codice: «Shopify spediva da _Shop location_, VestiFlow scaricava da _Magazzino test 3_ —
  prima per la M»;
- la relazione è `onDelete: SetNull`: il dato **si perde** se la sede viene eliminata.

⚠️ **Il punto che conta**: il valore letto **non porta con sé se sia stato dichiarato dal canale
o indovinato**. Chi lo legge non può distinguere i due casi.

**Nel frattempo il Registro dice «Non determinata»** e non inventa niente — è un'**anomalia
temporanea dichiarata**, non uno stato del modello (`10` §12). Quando questa lacuna sarà
chiusa, quella dicitura deve sparire da sé.

**Non si tocca la sync adesso**, per decisione esplicita del 17/08: il Corrispettivo manuale non
si blocca per sistemare Shopify. Questo caso si affronta qui, nel blocco sincronizzazione.

### 3. ✅ Eliminazione di `corrispettivo_entries` — **fatta il 17/08/2026**

Migration `20260817140000_ritira_corrispettivo_legacy`, applicata. Sono caduti: le due tabelle e i loro dati (6 voci, 11 righe, tutte ferme al 14/08 alle 20:53), la riga di numeratore rimasta, gli endpoint `/online-sales/register/entries`, il servizio, i DTO, la maschera `corrispettivi-register`, i mapper, `CorrispettivoEntryStatus` e `DocumentType.corrispettivo` **dal codice**.

⚠️ **Il valore resta morto nel tipo PostgreSQL**, ed è deliberato: `ALTER TYPE … DROP VALUE` non esiste, e ricostruire il tipo significherebbe riscrivere ogni colonna che lo usa. Stessa scelta già fatta il 16/08 per `externally_registered`. La guardia `check:registro` copre ora **26** termini e impedisce che rientri nel codice.

**Il rischio è stato messo a verbale e accettato**: `main` — che gira su Railway — scriveva ancora quelle tabelle a ogni evasione, quindi fino al rilascio di questo ramo un ordine evaso su un negozio collegato manda in rollback l'intera transazione. Nessun tenant è in produzione vera.

**Prima di eliminare è stato fatto un censimento** (`10` §11) per verificare che non stesse cadendo anche una funzione utile: la registrazione manuale economica in stile Danea. Verdetto **A** — era solo il duplicatore automatico. Da lì nasce il **Corrispettivo manuale** (`10` §12), che è funzione nuova, non un ripristino.

---

## Anagrafica articolo — deciso il 17/08, in parte fatto

### ✅ Fatto: il campo si chiama «Prezzo di vendita», ovunque

Lo stesso dato (`sellingPrice`) si chiamava in **cinque** modi: «Prezzo al pubblico» in Arrivo
merce e Ordine fornitore, «Prezzo articolo» in anagrafica e dettaglio, «Prezzo vendita» nel
passo varianti e nel riepilogo, «Prezzo» nelle tabelle strette, «Prezzo unitario» nei movimenti.

**29 sostituzioni in 15 file** più le prove e i documenti. Scelto **«Prezzo di vendita»** e non
«Prezzo al pubblico» — che pure era già il nome in due maschere — perché «al pubblico»
presuppone il dettaglio, e la convenzione aziendale netto/ivato appena introdotta ammette
esplicitamente che l’azienda possa ragionare all’ingrosso.

**Restano fuori di proposito:**

| Cosa                                                  | Perché                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| «Prezzo netto» / «Prezzo ivato» nelle righe documento | è la **modalità**, la scrive `priceModeRowLabel` e cambia da sola     |
| «Prezzo» secco nelle colonne strette                  | il contesto è già la riga, e allargare la colonna non aggiunge niente |
| «Prezzo unitario» nei movimenti                       | è il valore dell’**evento**, non il prezzo di catalogo                |
| «Prezzo barrato», «Prezzo Shopify»                    | sono altri prezzi, e si chiamano già bene                             |

### ✅ Fatto il 17/08: il prezzo barrato è un prezzo di vendita come gli altri

Era l’unico dei sei a ignorare il selettore netto/ivato, **in silenzio**. Adesso è in
`PRICE_FIELDS`, la colonna è `Decimal(16,6)` e il valore memorizzato è il netto canonico.

⚠️ **I 6 valori esistenti sono stati portati a `NULL`**, non a zero — il barrato è facoltativo
e zero direbbe «esiste e vale zero». Misurati prima: 6 prodotti su 250, tutti dello stesso
tenant di prova, tutti al 22%, coi nomi che lo dicono («test import listini», «The Compare at
Price Snowboard»). `Int → Decimal` è senza perdita **numerica**, ma la **semantica** cambiava:
un 70,00 scritto intendendo «ivati» sarebbe stato riletto come netto e mostrato 85,40.

**Difetto trovato dalle prove, non dall’occhio:** `currentDraft()` riscriveva cinque prezzi dal
netto canonico e lasciava passare il barrato **grezzo** dal form. Con il campo dentro
`PRICE_FIELDS` ma fuori da lì, il valore digitato non veniva mai scorporato.

`buildVariantsPayload` è stata estratta dal servizio di push in una util propria — era un
metodo privato che non usava `this`, e **nessuna prova la copriva** mentre decide due valori
che finiscono sotto gli occhi del cliente. Nove prove, fra cui quella che `null` non diventa
`0.00`.

#### ✅ Fatto: anche l’Arrivo merce

Le sue tre colonne di vendita — Prezzo di vendita, Prezzo barrato, Prezzo Shopify — **non
seguivano nessuna modalità**: si scrivevano e si rileggevano grezze, quindi nette senza dirlo.
E siccome la convenzione predefinita è ivata, in anagrafica si digitava ivato e qui lo stesso
numero finiva netto: **due schermate, stesso prezzo, due significati.**

Adesso hanno **un solo stato** netto/ivato, distinto da quello dei costi:

```text
salesPricesIncludeVat (tenant)  →  semina lo stato di sessione  →  il selettore lo cambia
                                                                →  nessuna persistenza
```

⚠️ **Seminato, non letto ogni volta.** Leggere la convenzione a ogni conversione avrebbe reso
la modalità **fissa**, e il selettore un comando che non comanda.

⚠️ **E non passa da `resolvePricesIncludeVat`**: l’Arrivo merce è un documento di acquisto,
quindi quella catena gli risponde `false` per costruzione. La convenzione arriva dal tenant,
che il componente aveva già iniettato.

**Il costo resta separato**, con la sua modalità di documento: concorre al totale, questi tre
no — sono dati dell’ARTICOLO che passano di qui, ed è la seconda porta che scrive l’anagrafica.

**Difetto trovato dalle prove, non dall’occhio:** al primo tentativo i netti venivano letti
**dopo** aver cambiato modalità, e il giro diventava un’identità — il campo non si muoveva di
un centesimo e la modalità cambiava solo di nome. Adesso si leggono prima e si riscrivono dopo,
come nell’Ordine cliente.

Nove prove, fra cui le sette chieste: azienda ivata e netta, i tre campi che si muovono
insieme, prezzi e costo che non si toccano a vicenda, il giro senza deriva, il campo vuoto che
resta vuoto. Mutazione: rimesso l’ordine sbagliato, due prove si accendono.

### ✅ Fatto il 17/08: «Prezzi di vendita» e «Listini» sono due sezioni

> **Un listino non è un altro prezzo: è una regola commerciale alternativa** — Ingrosso,
> Rivenditori — che assegna un prezzo diverso allo stesso articolo.

```text
Prezzi di vendita    Prezzo di vendita · Prezzo barrato · Prezzo Shopify (se attivo)
Listini              Listino 1 · 2 · 3        (nomi dati in Impostazioni)
(fuori)              Costo di riferimento (netto)
```

**Un solo selettore netto/ivato** per tutta l’area prezzi: sta nella testata della prima
sezione e governa tutti e sei i campi. Il costo è fuori, e adesso **lo dice l’etichetta** —
il tooltip diceva già «sempre al netto d’IVA», ma restava nascosto.

**Il barrato è salito** dalla coda della scheda, dove stava accanto al costo: è una componente
della politica di vendita, non un dato amministrativo. Era la parte di impaginato del lavoro,
non di parole.

⚠️ **E le due schermate adesso dicono la stessa cosa:** in Impostazioni i tre si chiamano
«Listini aggiuntivi», qui «Listini» ne indica esattamente tre. Prima ne indicava cinque.

Tre prove tengono la struttura: le due testate esistono, il barrato e il prezzo Shopify stanno
con il prezzo di vendita, e il costo dichiara la sua base.

### ✅ Fatto il 17/08: frecce e rotella dei campi numerici

**Frecce tolte solo dai campi di DENARO**, con una regola globale e **zero template toccati**.
La discriminante non è una classe da ricordare: è `inputmode`, che il codice già dichiara per
la tastiera del telefono.

```text
inputmode="decimal"    8 campi  →  tutti e soli i prezzi   ← la regola prende questi
inputmode="numeric"   12 campi  →  conteggi, frecce restano
inputmode assente     12 campi  →  conteggi, frecce restano
```

**Rotella spenta ovunque**, e il CSS non poteva farlo: `appearance: textfield` toglie le frecce,
la rotella resta. Un ascoltatore solo in cattura sul documento
(`core/services/number-input-wheel-guard.ts`), non una direttiva — una direttiva su
`input[type=number]` andrebbe importata in venti componenti standalone, e nel ventunesimo
dimenticata. Toglie il **fuoco** invece di annullare l’evento: `preventDefault` fermerebbe anche
lo scorrimento della pagina.

⬜ **Resta una sola cosa, piccola:** le **cinque** card di riga nascondono le frecce per conto
proprio, 6 righe SCSS ciascuna. Deciso il 17/08 che la regola giusta **non** è «nelle card
mobili si nascondono» ma:

> **Quando la quantità ha uno stepper esplicito − / valore / +, le frecce native si nascondono.**

⚠️ E non vanno consacrate «approvate mobile» le altre quattro maschere: **solo l’Ordine cliente**
è stato progettato e validato per mobile. L’estrazione deve centralizzare **soltanto** le regole
degli spinner, senza toccare bordi, radius o larghezze delle cinque card.

_In futuro − / input / + dovrebbe diventare un piccolo componente condiviso: quello sì è un
elemento ricorrente e funzionale._

## Prima sincronizzazione Shopify — deciso il 17/08/2026, da progettare

### 1 · `catalogOrigin` diventa provenienza, non permesso

> **Dopo che import e sincronizzazione sono completati, un articolo è di VestiFlow _e_ di
> Shopify: si distingue per come funziona e da dove nasce, ma si gestisce come tutti gli altri.**

Oggi non è così: `catalogOrigin = shopify` mette l’articolo in sola lettura. Misurato il
17/08: **87 articoli su 250, il 35% del catalogo.**

Il blocco vive in **17 punti**:

```text
API        catalog-origin.util · products.service · product-media.service
           shopify-product-push.service
FRONTEND   product-form + i tre step (general/options/variants) + detail
           i model, i mapper, catalog-origin.util
```

⚠️ **Il push NON è il problema, ed è bene saperlo prima di progettare.** Misurato: la guardia
del push (`evaluatePushGuard`) controlla connessione, scope `write_products`, prodotto non
archiviato e spunta `shopifySyncEnabled` — **non guarda `catalogOrigin`**, e il commento nel
codice lo dice: _«Gate per-prodotto: in AND col gating per origine»_. Se una modifica riesce a
salvarsi, viene spinta. Quindi togliere il blocco **non** lascerebbe le modifiche a metà strada.

Quello che serve progettare è l’altra metà: **cosa succede quando i due lati cambiano lo stesso
campo**. «Ultimo che scrive vince» è la direzione decisa, ma va reso vero — e riguarda i campi
che il canale possiede davvero (nome, descrizione, categoria, tassonomia, identità delle
varianti), non i prezzi.

✅ **Il prezzo di vendita è già uscito da qui il 17/08**, perché non è un campo del canale: a
Shopify va `shopifyPrice`, un’altra colonna. Sbloccarlo non anticipava nessuna decisione.

### 2 · Prezzo interno a zero all’import — idea da valutare

Il problema è già misurato e sta nella `PREZZI-SHOPIFY-SPEC`:

> `shopifyDecimalToMinor` restituisce **0** su valore malformato o assente, e il chiamante passa
> `variant.price ?? '0'`. Un prezzo mancante su Shopify diventa un prezzo di vendita **zero** in
> VestiFlow, senza errore.

E resta zero **per sempre**, perché il meccanismo è asimmetrico per costruzione:

| Momento                    | `sellingPrice`                        | `shopifyPrice` |
| -------------------------- | ------------------------------------- | -------------- |
| **nascita** (primo import) | scritto                               | scritto        |
| **ri-sync**                | ⛔ **mai toccato** — è dell’operatore | aggiornato     |

Quindi: articolo importato quando Shopify non aveva prezzo → interno a 0. Shopify poi il prezzo
ce l’ha → il ri-sync aggiorna solo il suo → **l’interno resta 0 e nessuno lo rialza**.

**L’idea:** quando il prezzo interno manca o è zero, si compila con il prezzo Shopify.

**Da determinare:**

- vale **solo alla prima volta**, o ogni volta che l’interno è zero? La seconda forma è più
  utile ma è una scrittura automatica su un campo dichiarato dell’operatore: va detto
  esplicitamente che «zero» conta come «non ancora deciso» e non come «deciso zero»;
- e il caso opposto — l’operatore che **vuole** un articolo a zero — come si distingue?

**Più un comando esplicito**, che è la parte senza ambiguità: nell’elenco prodotti, dopo aver
filtrato e selezionato, un pulsante **«Copia il prezzo Shopify nel prezzo interno»**. Copre lo
storico già andato storto, e non indovina niente: lo decide l’operatore su ciò che ha scelto.

⚠️ La forma automatica e il pulsante **non sono alternative**: il pulsante serve comunque per
gli articoli già a zero oggi, qualunque cosa si decida per l’import futuro.

### 3 · «Listini» in anagrafica: il nome vale per un sottoinsieme

La sezione prezzi dell’anagrafica si intitola **«Listini»** e contiene cinque campi:

| Campo               | È un listino?                  |
| ------------------- | ------------------------------ |
| **Prezzo articolo** | ⛔ no — è _il_ prezzo          |
| **Prezzo Shopify**  | ⛔ no — è il prezzo del canale |
| Listino 1 · 2 · 3   | ✅ sì                          |

**Il criterio per escludere lo dà già il codice**, in un commento di quella stessa sezione:
_«Barrato e costo di riferimento restano fuori: non sono listini»_. Applicato agli altri due,
esclude anche loro.

⚠️ **E le due schermate già non si capiscono fra loro:** in Impostazioni i tre si chiamano
**«Listini aggiuntivi»**; in anagrafica «Listini» ne indica cinque. La stessa parola vale per
due insiemi diversi a due schermate di distanza — che è il difetto vero, non la preferenza di
gusto.

**Proposta:** la sezione si intitola **«Prezzi»**, e i tre restano raggruppati dentro come
**«Listini aggiuntivi»** — lo stesso nome che hanno già in Impostazioni. Le due schermate
tornano a dire la stessa cosa con la stessa parola.

_Costo:_ due etichette e i test che le nominano. Nessuna colonna, nessuna migration.

---

## Difetti aperti, misurati e non ancora corretti

| Rif.       | Difetto                                                                                                  | Stato                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `01` §3.9  | Le righe importate ignoravano lo sconto: 120,00 di righe su un ordine da 104,00                          | ✅ **chiuso e provato** su `#1010`/`#1011` (15/08)                             |
| `01` §3.13 | Il Codice IVA della vendita online lo sceglieva l'imposta incassata, mai lo zero                         | ✅ **chiuso** — non ancora eseguito in produzione (scatta all'evasione)        |
| `01` §3.14 | La sync sedi partiva da sola, da tre punti, e creava/rinominava/cancellava                               | ✅ **inneschi spenti** — il servizio (nome, creazione automatica) resta aperto |
| `01` §3.15 | Le righe di canale scrivono importi IVATI in colonne lette come NETTE                                    | aperto — scelta di modello, non ancora presa                                   |
| sotto      | Ordine cliente: sconto a importo, sconto extra a importo, spedizione sui manuali                         | aperto — disegno deciso, non implementato                                      |
| `01` §3.12 | **Le righe della Vendita online** portano ancora l'aliquota media inventata                              | l'import è corretto, lo **snapshot** no                                        |
| `01` §3.11 | Vendita con una riga non scaricata dichiara «scarico completo»                                           | aperto                                                                         |
| `01` §3.8  | L'**impegno** usa ancora il ripiego alfabetico sulla sede                                                | chiuso solo lo scarico, e mai eseguito                                         |
| `01` §2.1  | `orders/cancelled` non registrato sul negozio                                                            | da fare **dall'ambiente pubblicato**                                           |
| `01` §2.14 | Il reso dichiarato e non ancora elaborato non esiste per VestiFlow                                       | aperto, da decidere se coprirlo                                                |
| `GM` §20   | **Il legame fra documenti non verifica il tenant** — misurato; sfruttabilità dedotta                     | aperto — **si chiude da solo**, non aspetta Includi/Genera                     |
| `CASSA`    | **Il ramo Cassa aggancia `documents` con `ON DELETE CASCADE`** — pagamenti, ricevute fiscali, sessione   | da censire **dopo** C 0 — ⛔ non limita la Vendita al banco (`11` C)           |
| sotto      | **La coda decimale del prezzo si perde riaprendo e risalvando un documento** — misurata il 21/08         | aperto — gap **trasversale**, si chiude nella **convergenza documentale**      |
| sotto      | **Le maschere mostrano l'IVA dal Codice VIVO, il server la conserva dallo snapshot** — misurata il 21/08 | aperto — gap **trasversale**, reso VISIBILE da T3                              |
| sotto      | **«Nessun contatore» e «contatore Senza serie» sono indistinguibili sul documento** — misurata il 21/08  | annotato — da decidere, non un difetto operativo oggi                          |
| sotto      | **L'orchestrazione della numerazione è ripetuta in 7 servizi** — misurata il 21/08                       | **rifattore trasversale futuro** — ⛔ non si estrae per un servizio solo       |

### L'orchestrazione della numerazione è ripetuta in sette servizi — 21/08/2026

⭐ **Il motore è già condiviso**: `serieCanonica`, `defaultCounterSeries`, `lockDocumentCounter`,
`resolveDocumentNumber`, `buildDocumentNumberConflict`, `isDocumentNumberConflict` vivono tutte in
`api/src/documents/document-numbering.util.ts`. Non è quello il problema.

⛔ **È la SEQUENZA con cui si chiamano a essere ripetuta**, in sette servizi: documenti generici,
Arrivo merce (due volte), Trasferimento/Rettifica, Corrispettivo manuale, Ordine cliente manuale,
Ordine fornitore, Vendita/Reso al banco (due volte). `defaultCounterSeries` da sola compare 13
volte.

**È esattamente la forma che il progetto ha già consolidato sul CLIENT.** Il docblock di
`DocumentNumberingStore` lo dice: _«il blocco viveva in cinque maschere in copie quasi identiche…
copie di quel tipo non divergono con un errore, divergono con una sfumatura»_.

⚠️ **E la divergenza-per-sfumatura è già documentata sul server**: la correzione della serie nel
conflitto è arrivata il 13/08 sull'Arrivo merce mentre «gli altri tre servizi gemelli risolvevano
già». Una copia era rimasta indietro senza che nessun test la trovasse.

⚠️ **Un secondo sintomo, misurato il 21/08**: `serieCanonica` esiste dal giorno in cui il
controllo cronologico è nato cieco, e il suo docblock conta **dodici punti** che l'avevano
riscritta a mano. Al 21/08 nessun percorso di salvataggio la usava — solo
`document-chronology.util.ts`. La Vendita al banco è il primo servizio di scrittura ad averla
adottata (T8A).

> ⛔ **Non si estrae per un servizio solo.** Farlo per il banco creerebbe l'ottava variante invece
> di toglierne sette. Quando si farà, si fa per tutti — ed è un lavoro con perimetro proprio, da
> misurare prima (quali rami divergono davvero, e quali divergenze sono volute).

**Grado di certezza: letto** (conteggio con grep sui sette file, righe citate nei commit T7A/T7B/T8A).

### «Nessun contatore» e «Senza serie» danno lo stesso documento — annotato il 21/08/2026

Emerso censendo la numerazione del banco (T7/T8), e **non è un difetto operativo**: la creazione
funziona in entrambi i casi. È un'ambiguità concettuale che vale la pena decidere prima che
qualcuno ci costruisca sopra.

`seedDefaults` — che semina il contatore «Senza serie», quello che ogni tipo dovrebbe avere per
nascita — è chiamato **solo** da `list()` e `available()` di
`api/src/documents/document-counters.service.ts`, cioè dalla schermata Numeratori e dalla tendina
di testata. Un tenant che non ha mai aperto né l'una né l'altra **non ha materialmente il
contatore**.

```text
nessun contatore configurato   → defaultCounterSeries ritorna null → documento con series = null
contatore «Senza serie» reale  → defaultCounterSeries ritorna null → documento con series = null
```

⚠️ **Le due situazioni producono lo stesso documento e lo stesso riferimento**, quindi guardando
un documento non si può sapere in quale delle due si era. Finché nessuno ha bisogno di
distinguerle non fa danno; comincia a farne il giorno in cui una schermata dicesse «questo
documento usa il contatore X» e non ci fosse una X da nominare.

⛔ **Non toccato in T7A/T7B**, ed è fuori dal loro perimetro: quei due commit passano al motore
comune il contesto che gli mancava, non cambiano chi semina i contatori.

**Grado di certezza: letto** (i due soli chiamanti di `seedDefaults` verificati con grep); che
esistano tenant reali in quello stato è **non provato**.

### L'IVA a schermo non è quella del documento — gap trasversale, registrato il 21/08/2026

⚠️ **Emerso da una revisione avversariale del lavoro T3** (snapshot IVA della Vendita al banco),
che ha confermato il rilievo come **preesistente e trasversale**, non introdotto da T3.

Il server, per una riga già esistente, **conserva** `vatCodeId` e `vatSnapshot` persistiti. Le
maschere invece calcolano l'IVA da mostrare risolvendo il Codice IVA nel **registro vivo**, e
usano l'aliquota dello snapshot solo come ripiego quando il codice non si trova:

```text
store-sale-register.component.ts:1081   const vatCode = line.vatCodeId ? this.vatCodeById().get(...) : undefined;
                                        return vatCode ? vatInputFromVatCode(vatCode)      ← aliquota VIVA
                                                       : vatInputFromLegacyRate(line.vatRatePercent);
```

Stesso schema in `sales-document-form`, `customer-order-form` e `goods-receipt-form`.

⭐ **E la funzione giusta esiste già**: `vatInputFromSnapshot` in
`src/app/domain/documents/utils/document-vat.util.ts:118` è **esportata e non la usa nessuno** —
verificato con un grep su `src/` e `api/src/`. Non manca lo strumento: manca il consumo.

**La conseguenza si vede solo se qualcuno cambia un'aliquota.** Riaprendo un documento più
vecchio del cambio, lo schermo mostra i totali all'aliquota di oggi mentre il documento vale
quelli di allora.

> ⛔ **T3 non ha creato questo difetto: lo ha reso visibile sulla Vendita al banco.** Prima, su
> quel percorso, schermo e documento coincidevano — ma coincidevano sul valore **sbagliato**,
> perché il client ri-prezzava il documento storico e il server obbediva. T3 ha corretto il dato
> persistito; la vista è rimasta dov'era.

⛔ **Non si corregge maschera per maschera.** Le quattro hanno già adottato il contratto binario
lato salvataggio: il rimedio è far consumare `vatInputFromSnapshot` sulle righe caricate, una
volta per tutte, nella **convergenza documentale**.

⚠️ **Nota adiacente, stesso ambito**: `preservedLineVat` ricostruisce il dato di calcolo con
`vatInputFromLegacyRate(vatSnapshotRatePercent(...))`, cioè dalla **sola aliquota** dello
snapshot — natura, `nonDeductiblePercent` e `calculationMode` non rientrano nel ricalcolo, pur
restando salvati nella colonna. Irrilevante in modalità standard con indetraibile a zero; da
verificare prima di usare modalità diverse.

**Grado di certezza: letto** (righe citate sopra, verificate direttamente); che un cliente reale
abbia mai cambiato un'aliquota è **non provato**.

#### La voce «Predefinito» della cassa, e perché NON si corregge — deciso il 21/08/2026

Censito lo stesso giorno: `vatCodeIdForLinePayload` ritorna `string | undefined` e **non può
esprimere `null`**, quindi la scelta esplicita «torna al predefinito dell'articolo» non è
trasmissibile. Il server invece la capirebbe già: `null !== undefined` fa saltare la
conservazione in `preservedLineVat`, e `resolveLineVatCode(null, …)` risolve da
articolo/predefinito aziendale. **Manca solo la firma della primitiva.**

La voce vuota esiste in **una sola** maschera — la Vendita al banco, che usa `app-select-menu`
(`includeEmptyOption` vale `true` di default e nessuno le ha passato `false`). Fatture, Ordine
cliente e Arrivo merce usano `app-document-line-select-cell`, che dichiara
`valueChange = output<string>()` e sull'insieme chiuso dell'IVA fa `commit(this.value())`: non
può emettere vuoto. Lì il problema non esiste.

> ⛔ **Decisione del proprietario: NON si corregge la vecchia maschera pos.** È legacy e verrà
> sostituita; spegnere l'interruttore lì sarebbe lavoro su codice destinato a sparire.
>
> ⭐ **Il vincolo si sposta sulla maschera NUOVA di Vendita/Reso**: dovrà usare la **cella IVA
> documentale comune** già adottata dagli altri documenti (`app-document-line-select-cell` o la
> sua evoluzione condivisa), **senza varianti locali**. Con quella cella la voce vuota non
> esiste, e il problema non si ripresenta.
>
> ⚠️ Se un giorno «Ripristina il predefinito dall'articolo» dovrà essere una funzione vera delle
> righe documento, si progetta **trasversalmente** nella convergenza documentale — semantica
> **tri-state** (`undefined` / `string` / `null`) e test comuni — non riaccendendo un
> interruttore su una maschera sola.

### La coda decimale del prezzo — gap trasversale, registrato il 21/08/2026

⚠️ **Trovato mentre si decideva tutt'altro** (il contratto del prezzo del Reso al banco, `11` T4)
e messo da parte apposta: non si corregge dentro un lavoro che ha un altro perimetro.

`regole-gestionale` dice che un prezzo unitario è `NUMERIC(16,6)` e che **la coda è ciò che fa
tornare identico un prezzo digitato ivato**. Il round-trip però non la conserva fino in fondo:

```text
database → JSON            intatta   Prisma serializza il Decimal come STRINGA, nessun mapper
JSON → modello Angular     intatta   document-api.mapper.ts:212 — Number(), nessun arrotondamento
modello → campo di input   ⛔ PERSA  sales-document-form.component.ts:2357 → money.util.ts:161 (Math.round)
campo → server             intero    sales-document-form.component.ts:2221 ri-analizza la stringa a 2 decimali
```

**Il difetto morde in modalità prezzi NETTI**, dove il valore re-inviato viene salvato così com'è:
un `2049,180300` in database, riaperto e risalvato, torna `2049`. In modalità ivata il valore non
è conservato ma **ricalcolato** dallo scorporo, quindi coincide solo finché la coda nasceva da
quello stesso scorporo a quella stessa aliquota.

⭐ **Non è un difetto di tutte le maschere, ed è questa la parte utile.** Chi tiene il netto
canonico in un dato separato dalla rappresentazione a due decimali non lo ha:

| Maschera                                 | Coda                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `sales-document-form` (famiglia Fattura) | ⛔ persa — la stringa a 2 decimali è l'unica sorgente al salvataggio |
| `supplier-order-form`                    | ✅ salva — control canonico `unitCostNetMinor` separato (`:819-823`) |
| `store-sale-register` (banco)            | ✅ salva — il netto sta nel signal, il campo lo MOSTRA e basta       |

`supplier-order-form.component.ts:792-796` porta già il commento che spiega perché si è sottratta
allo schema: _«quello converte il valore MOSTRATO, già arrotondato a due decimali, e su un costo
digitato ivato perde il centesimo nel 18% dei casi al 22%»_.

> ⛔ **Decisione del proprietario, 21/08/2026: la famiglia Fattura NON è un'eccezione
> strutturale.** Quando verrà affrontata dovrà convergere sulla stessa struttura e sugli stessi
> contratti comuni degli altri documenti. La correzione appartiene quindi alla **convergenza
> documentale**, non a un intervento locale sulla maschera.

**Grado di certezza: letto** (percorso seguito riga per riga, file e numeri sopra); che il valore
in database venga effettivamente sovrascritto è **dedotto**, non ancora provato leggendo la
colonna prima e dopo. Una prova va fatta prima di dichiararlo chiuso.

### Il prezzo articolo digitato in riga non aggiorna l'anagrafica — 22/08/2026

⛔ **Difformità da chiudere nel blocco Arrivo merce, DOPO l'unificazione delle
componenti/celle di riga.** Non si corregge prima: la cella comune si scrive **una volta
sola**, e la policy specifica del documento gliela passa il documento.

**Il requisito era già deciso** nel lavoro sulle righe documento: nell'Arrivo merce il
prezzo articolo di riga è il **prezzo di catalogo della variante**, e la spunta **«Aggiorna
prezzi articolo»** — accesa di default — governa l'aggiornamento dell'anagrafica. A spunta
spenta i campi relativi devono essere **in sola lettura**.

#### ⛔ La strada dello snapshot su `DocumentLine` è stata VALUTATA E SCARTATA — 22/08/2026

Verificando perché il campo torna `0,00` alla riapertura si era misurato che `DocumentLine`
non ha alcuna colonna per il prezzo: dei 39 campi, **cinque fotografano il costo**
(`enteredUnitCost`, `unitCostNet`, `unitCostGross`, `unitVatAmount`,
`costEntryModeSnapshot`), del prezzo **nessuno**. Da lì la proposta di aggiungerne tre.

**Il proprietario ha fermato quel filone**, e la ragione toglie il dubbio invece di
rimandarlo: quel valore **non è una fotografia dell'operazione**, è il prezzo di catalogo
che la spunta propaga all'anagrafica. Lo `0,00` alla riapertura non è la prova che serva uno
snapshot — è la stessa difformità vista da un'altra angolazione.

⛔ **Nessuna colonna, nessuna migration prezzi**, finché il blocco non si apre.

#### Il comportamento attuale, misurato

Sul documento `fd04d542-e8aa-4889-84f9-3c4f859ec076` del tenant Test SG Luigi:

|                                                            |                                             |
| ---------------------------------------------------------- | ------------------------------------------- |
| il campo si popola all'inserimento riga                    | ✅ `setSalesPrice(line, 'sellingPrice', …)` |
| il valore entra nel payload                                | ✅ `sellingPriceMinor`                      |
| il salvataggio aggiorna `ProductVariant.sellingPriceMinor` | ⛔ **no**                                   |
| alla riapertura il campo mostra                            | ⛔ `0,00`                                   |
| a spunta spenta i campi sono in sola lettura               | ⛔ **no**                                   |

⚠️ **Non c'è rischio di azzeramento silenzioso**, ed è la ragione per cui la difformità può
aspettare il suo blocco: il payload usa `?? undefined` — **assenza**, non zero — e l'intero
gruppo è subordinato a `updateArticlePrices()`. Un campo lasciato vuoto non scrive `0` in
anagrafica.

**Riguarda i tre valori articolo** che la riga ospita: prezzo al pubblico, prezzo barrato e
prezzo Shopify — quest'ultimo solo dove il tenant ha davvero il canale.

### `vatRatePercent` arrotondato a intero — rischio per aliquote frazionarie, censito il 22/08/2026

⛔ **Censito, NON corretto.** Emerso dal censimento della precisione costi e lasciato fuori
dal blocco corrente per decisione del proprietario: è un'**aliquota**, non un costo, quindi
non appartiene alla famiglia delle colonne portate a `NUMERIC(16,6)`.

```text
api/src/documents/goods-receipt-vat.util.ts:145   vatRatePercent: Math.round(Number(vatCode.ratePercent))
api/src/store-sales/store-sales.service.ts:1400   vatRatePercent: Math.round(Number(vatCode.ratePercent))
```

**Il rischio, in una riga**: un'aliquota con decimali — 2,5% — viaggia come **3**.

⭐ **Oggi non morde, e la ragione va scritta perché è ciò che rende il rinvio legittimo:**

| Fatto                                                               | Conseguenza                                     |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| `vatRatePercent` **non è una colonna** (assente da `schema.prisma`) | è un campo di trasporto, non un dato persistito |
| accanto viaggia `vat`, che porta l'aliquota **esatta**              | il calcolo vero non passa da qui                |
| le aliquote italiane in uso sono intere (22 · 10 · 5 · 4)           | il troncamento non ha ancora nulla da troncare  |

⚠️ **Il giorno in cui morde è dichiarato**: un tenant con un'aliquota frazionaria — una
percentuale di compensazione agricola, o un'aliquota estera — e la riga di calcolo che
ricadesse sul campo legacy invece che su `vat`. Non è una possibilità remota per un prodotto
che [`vestiflow-non-solo-abbigliamento`] dichiara non legato a una merceologia sola.

**Quando si chiude**: insieme al gap trasversale «L'IVA a schermo non è quella del
documento», che tocca gli stessi due percorsi. Correggerlo da solo qui sarebbe un tocco
isolato in una famiglia che va guardata intera.

### ✅ Il costo vuoto vale ZERO — deciso e implementato il 22/08/2026

⛔ **Qui c'era un difetto che NON era un difetto.** Si intitolava «il costo di riga lasciato
vuoto azzera il costo in anagrafica» e prescriveva di far viaggiare l'assenza fino in fondo —
`number | null` da `lineCostEnteredMinor`, campo omesso dal payload. ⚠️ **È la correzione da
non fare mai**, ed è la ragione per cui questa voce resta invece di essere cancellata.

**Due errori, uno di misura e uno di modello.**

Di misura: la prova che lo aveva «trovato» svuotava il campo con un `fill('')` da script. Nel
flusso reale non succede — richiamando un articolo la cella **si precompila dall'anagrafica**
(`goods-receipt-form.component.ts` ~3327).

Di modello: il proprietario ha deciso il 22/08 che per il dominio costo «non valorizzato» e
«zero» sono **lo stesso caso**.

> **Un costo canonico non è mai NULL. Se non è valorizzato, vale zero.**
>
> ```text
> articolo nuovo         →  nasce a 0, e la cella mostra 0,00
> costo digitato 0,00    →  0
> costo valorizzato      →  il valore, modificabile
> ```

Cinque colonne sono `NOT NULL DEFAULT 0` dalla migration
`20260823010000_costi_canonici_not_null`.

⚠️ **`null` resta legittimo in UN solo posto: i DTO di risposta**, dove significa «costo non
visibile con i tuoi permessi» — non «costo assente». Non nasce da una colonna, lo mette il
servizio, e chi lo togliesse «per coerenza» mostrerebbe **0,00** a chi non ha il permesso di
vedere i costi: un'informazione falsa al posto di una negata.

#### Cosa è sparito con la vecchia semantica

Il «costo sconosciuto» non era solo una colonna nullable: era una **metrica esposta**.

| Sparito                                            | Dove                                                       |
| -------------------------------------------------- | ---------------------------------------------------------- |
| `costKnownRevenueMinor` — ricavo a costo noto      | `movement-sales.util`                                      |
| `costCoveragePercent` — copertura del costo        | DTO analytics, modello frontend                            |
| `missingCost` — valorizzazione a costo incompleta  | `business-analytics.service`                               |
| «Compila i costi d'acquisto per calcolare…»        | `marginHint`, sotto il margine in dashboard                |
| «Margine stimato su X% del fatturato (costo noto)» | idem                                                       |
| il fallback del reso sul costo NULL                | `movement-cost.util` — resta solo se la vendita NON esiste |

⭐ **`marginHint` distingue ora ciò che prima confondeva**: a chi non ha il permesso diceva
«Compila i costi d'acquisto in catalogo» — un invito a compilare qualcosa che quella persona
non può nemmeno vedere. Ora dice «Margine non visibile con i tuoi permessi».

#### I controlli TRUTHY, che sono l'ultima forma dello stesso errore

Un `if (costo)` o un `costo > 0` tratta lo **zero come un'assenza**. Finché il costo poteva
essere NULL i due casi coincidevano; ora no, e con il backfill lo zero è il valore più comune.

**Corretti il 23/08:**

```text
goods-receipt-form ~3330/3334   articolo richiamato → la cella mostra 0,00, non resta vuota
goods-receipt-form ~4804        `|| undefined` → `?? undefined` (il commento sopra lo diceva già)
supplier-order-form ~1760       `netMinor > 0 ? … : null` → il costo si scrive, zero compreso
```

⭐ **Tre `> 0` restano, e sono corretti**: `document-line-code-cell`,
`document-line-product-cell` e `variant-select-menu.util` omettono il costo dal **testo di un
suggerimento** a discesa. Lì non è un dato che si compila: è una riga compatta, e «Costo 0,00»
su ogni articolo sarebbe rumore. La distinzione da tenere è fra **un campo** — che il valore
lo dichiara sempre — e **un'etichetta**, che può tacere ciò che non aggiunge nulla.

#### Una cosa che il vincolo avrebbe rotto in silenzio

⚠️ **Il ripristino da backup.** Ogni pacchetto prodotto prima della migration porta `null` nei
costi, e `createMany` lo avrebbe rifiutato con violazione di vincolo — togliendo al cliente
l'unica strada per rimettere in piedi i propri dati. `normalizzaCostiCanonici` converte quei
`null` in `0` all'ingresso, e un test con un backup legacy lo tiene fermo.

### `GM` §20 — il difetto di sicurezza trovato il 18/08/2026

> **Fonte canonica: `docs/GUARDIE-MANCANTI.md` voce 20.** Lì stanno la misura per esteso, i tre
> gradi di certezza e i passi della prova cross-tenant. Qui c'è solo il rimando, perché questa è
> la lista che si legge per prima.

In una riga: `sourceDocumentId` è accettato **senza verifica di esistenza, tenant e compatibilità
origine→destinazione**, e in lettura le due relazioni non sono filtrate per tenant. ⚠️ **La
sfruttabilità è dedotta, non provata**: non va chiamata una fuga di dati finché la prova dinamica
non la conferma.

⛔ **Non si corregge dentro il lavoro su Includi/Genera**: si chiude autonomamente.

---

## Novità della notte del 15/08 — da leggere prima di riprendere

**Fatto, provato, committato** — 5 commit sul ramo, tutti verdi (961+418 frontend, 1527 API):

1. Sconto di riga Shopify — si legge da `discount_allocations`, mai si ricalcola. Provato su due ordini costruiti apposta, uno con sconto a importo.
2. Codice IVA della vendita online — si aggancia solo se univoco; mai a zero, mai con più codici alla stessa aliquota.
3. Maschera Ordine cliente — su un ordine di canale il riepilogo si legge dalla testata (spedizione, sconto, imponibile per differenza), non si ricalcola col motore manuale.
4. Sedi — i tre inneschi automatici sono spenti. Il pulsante manuale resta.

**Deciso ma non implementato — è il prossimo lavoro sull'Ordine cliente.** Una banda unica in entrambi i documenti (manuale e Shopify), con questi campi editabili in tutti e due:

```
Totale prodotti
Sconto ordine        ← dal canale, sola presa d'atto · 0,00 sui manuali
Sconto extra   [ 0% ]
Sconto importo [ 0,00 ]   ← NUOVO, colonna additiva su sales_orders
Spedizione            ← NUOVO su tutti e due i documenti
Imponibile
IVA
Totale documento
```

Decisioni prese, da non riaprire:

- l'importo del canale (`discountMinor`, esiste già) resta **distinto** dal nuovo campo che scrive l'operatore — altrimenti il sync lo cancellerebbe al prossimo giro;
- ordine di applicazione: **prima la percentuale, poi l'importo**;
- l'IVA dell'importo si ripartisce sulle righe in proporzione, come già fa la percentuale — **tranne** sulle righe Shopify, dove l'allocazione del canale non si ricalcola mai;
- **su un ordine Shopify il campo sconto importo diventa editabile**: resta pieno col valore del canale finché l'operatore non lo tocca. Da decidere il comportamento al prossimo sync — oggi la maschera di un ordine di canale è di sola lettura su tutto il resto, e questo campo ne uscirebbe da solo;
- migration: colonna additiva `document_discount_minor` su `sales_orders`, scritta a mano, `prisma:deploy`.

**Non deciso, resta il §3.15.** Se scorporare i prezzi Shopify a netto all'import (come fa già il catalogo) o dichiarare che le colonne dell'ordine di canale sono lorde. `PREZZI-SHOPIFY-SPEC.md` §1-bis e §4.1 la analizzano dal 7 agosto; i rimborsi la applicano già (leggono `taxes_included`), l'import degli ordini no — stessa cartella, stesso payload, due dottrine.

**La fase iniziale di collegamento Shopify** _(deciso il 15/08, sospesa)_. Le sedi si agganciano **a mano** — non più solo per nome — quando esistono già da entrambe le parti; ogni sede completa i propri dati (indirizzo, impostazioni); e questo passo sta insieme all'assegnazione del Codice IVA ai prodotti importati (`02` §4.1-4.3). Non è più «poi un avviso»: è il lavoro descritto lì, ed è il più grande dei tre rimasti.

**Topologia del ramo, verificata il 15/08.** `numerazione-documento-2` contiene **tutto `develop`** più 33 commit — non diverge, è un fast-forward pulito (6 migration, tutte aggiunte pure). È `main` a essere 205 commit indietro rispetto a `develop`, ed è `main` che gira in produzione su Railway sullo stesso database condiviso. Il merge previsto è su `develop`: il rischio di migration incrociate descritto per `main` non si applica a questo passaggio.

Sul §3.12: la **correzione all'import è provata sui dati veri** (righe d'ordine riscritte con 2,31 al 4% e 4,51 al 22%). Restano sbagliati gli **snapshot** già scritti — `VO-2026-0004`, `VO-2026-0005`, `COR-2026-0005/0006` — e **non si toccano**: sono istantanee, e sono l'unica testimonianza rimasta del difetto.

---

## Decisioni prese che NON si riaprono

- Il registro corrispettivi è **derivato dalle vendite**; `corrispettivo_entries` cade _(11/08, riconfermata 14/08)_.
- **Il passato non si riscrive, si rettifica**: la vendita resta alla sua data, il reso arriva alla propria _(base normativa riferita: Ris. 274/E/2009)_.
- **Gli annullamenti non si filtrano**: un annullamento pre-evasione non ha data di evasione e resta fuori da sé. Filtrarli farebbe sparire retroattivamente una vendita già avvenuta.
- **I rimborsi da annullamento si conservano e si classificano**, non si scartano in scrittura: è il registro a decidere se un fatto ha effetto, non la traduzione a decidere se esiste.
- **Canale predefinito «Tutti»**: un totale gonfiato si nota, uno a cui manca una parte no.
- **Il filtro Tipo agisce sull'elenco, non sul riepilogo**: guardando «Solo resi» il totale deve continuare a dire il corrispettivo del periodo.
- `exclusionReason` **si deriva dal legame** con la fattura; `fiscalDate` modificabile **cade**.

## Limite noto, dichiarato e non aggirato

Il registro usa la **data di evasione**, che è la regola ordinaria per le cessioni di beni mobili. Non è la regola completa: l'art. 6 anticipa il momento di effettuazione se il corrispettivo è pagato prima della consegna — cosa che su un ordine incassato con carta accade quasi sempre.

**VestiFlow non può derivarlo oggi**: _misurato_, nessuna data di incasso è persistita, le transazioni del canale non si importano. Manca il dato, non la logica. La formulazione da usare è «per il flusso supportato oggi il registro usa la data di evasione», **non** «la data di evasione è la data fiscale».

---

## Come si verifica una modifica su questo ramo

1. **Il percorso del pulsante è locale**: «Sincronizza vendite» esegue il codice del ramo, e una correzione all'import si può provare così.
2. **Il percorso dell'evento no**: evasione, rimborso e reso li elabora la produzione. Provarli richiede i webhook puntati a un tunnel.
3. **Il caso di prova deve essere quello scomodo.** Il difetto dell'IVA è vissuto per mesi perché con **una sola aliquota** la ripartizione proporzionale coincide col vero: qualunque verifica sarebbe passata. È emerso con un ordine costruito con 4% e 22% insieme.
4. **Si fotografa il database prima e dopo**, e si aspetta che il pulsante torni premibile: misurare a passata in corso è già capitato due volte.

---

## Corrispettivo manuale — due difetti trovati usandolo (17/08/2026)

Trovati dal proprietario del progetto sulla maschera appena consegnata, **non da un
test**: è il tipo di difetto che nessuna prova verde intercetta.

> ### ✅ Stato al 18/08/2026: 1, 2 e 3 sono chiusi. Resta aperto solo il 4.
>
> Verificato nel codice, non dedotto da questo file — che era rimasto indietro e li
> dava tutti e tre per aperti. **È il difetto di questo documento, non del codice**, ed
> è esattamente il modo in cui si fa ricominciare qualcuno da un lavoro già fatto.
>
> | #   | Dove si vede che è chiuso                                                                                                             |
> | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
> | 1   | `manual-receipt-form.component.html`: un `app-inline-banner` legato al rifiuto, col commento «Il rifiuto del salvataggio si VEDE»     |
> | 2   | `_document-form.scss` → `td.doc-form__col--tax .doc-select-cell`: fondo `--color-input-bg` e bordo dentro la cella del gruppo calcoli |
> | 3   | `api/src/corrispettivi/corrispettivi.service.spec.ts` → «un pageSize piccolo non taglia più niente»                                   |
>
> E la **guardia** che il §1 chiedeva è stata capita alla radice invece che rattoppata:
> `check-form-errors.mjs` porta ora due commenti che citano proprio questa maschera —
> «aveva un banner che parlava d'altro».
>
> Il testo originale resta qui sotto: dice **come** i tre difetti erano stati misurati,
> e quel metodo serve ancora.

### 1. ✅ CHIUSO — Il salvataggio rifiutato era MUTO

```ts
178:  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
```

`_submitState` è **privato e non arriva al template**. `save()` calcola diligentemente i
suoi messaggi — «Aggiungi almeno una riga con descrizione e importo», «Riga N: scegli il
Codice IVA della riga» — li scrive lì dentro, e **nessuno li legge**: l'unico
`app-inline-banner` della maschera è agganciato a `loadError()`, cioè agli errori di
_caricamento_.

Quindi **ogni** rifiuto del salvataggio è silenzioso, compresi gli errori dell'API. Il
pulsante sembra rotto.

Il percorso misurato: lettere digitate nel campo importo → `parseMoneyInput` rende `null`
→ il netto canonico resta `null` → `buildLinesBody` scarta la riga come vuota →
`lines.length === 0` → messaggio corretto, scritto in un signal che non arriva a schermo.

**La correzione**: esporre lo stato, legarlo al banner, e un test che provi che un rifiuto
**si vede**. Il campo importo resta `type="text" inputmode="decimal"` — con i separatori
decimali italiani `type="number"` non va — ma senza errore visibile l'operatore non ha modo
di sapere che «abc» non è un importo.

⚠️ **E poi la guardia.** `check:form-errors` dice «22 form rifiutano l'invio, e tutti dicono
perché»: questa maschera evidentemente non rientra nel suo censimento. Una guardia che non
copre l'ultimo form aggiunto non proteggerà nemmeno il prossimo — va capito **perché** l'ha
saltata, non aggiunto un caso a mano.

### 2. ✅ CHIUSO — Il Codice IVA di riga non sembrava editabile

Nella tabella righe la cella IVA ha lo stesso fondo grigio delle celle calcolate, mentre è
un valore **che si sceglie**. Va vestita come un campo: **fondo bianco**, come gli altri
controlli editabili della riga.

È la stessa distinzione che il resto della maschera già fa — importo si digita, imponibile e
imposta si leggono — e qui non la fa: la freccina del menu è l'unico indizio, e non basta.

### 3. ✅ PRESIDIATO — `page` e `pageSize` accettati e ignorati

Tolto il limite delle cento righe, `listOrders` restituisce l'insieme intero e i due
parametri **non decidono più niente**. Restano nel contratto perché `Paginated` è una forma
condivisa con mezzo backend, e rifattorizzarla per una schermata sarebbe sproporzionato.

⚠️ **Ma un parametro accettato e ignorato è esattamente il difetto di `onlineOnly`**, che
questa stessa area ha già pagato: qualcuno lo manda, l'API lo prende, non succede niente, e
nessuno se ne accorge finché non conta. Qui il presidio è un test — con `pageSize: 10` le
righe restituite restano 150 — non un commento.

Da riprendere quando si toccherà `Paginated` per altre ragioni, **non prima**: aprire quel
refactor adesso significherebbe muovere un tipo condiviso per un problema che oggi un test
tiene fermo.

### 4. Il Codice IVA si comporta in due modi diversi — e non è un duplicato

Osservato in anagrafica prodotto il 17/08/2026: il campo Codice IVA della scheda **non si
usa da tastiera** come quello delle righe documento.

Non è codice copiato. Sono **due componenti con due modelli di interazione**:

| Dove                | Componente                      | Cos'è, tecnicamente        | Tastiera                                                                                  |
| ------------------- | ------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| righe documento     | `app-document-line-select-cell` | un `<input>` vero          | si digita e filtra, Invio sceglie e resta, **Tab risolve e va al campo dopo**, ←/→ escono |
| anagrafica, testate | `app-select-menu`               | un `<button>` con pannello | si apre, si cerca dentro il pannello, Escape chiude                                       |

⚠️ **La divergenza è dichiarata, non accidentale.** `regole-stile-ui` §5 dice che la cella di
riga «sostituisce `app-select-menu` dentro le righe, **e solo lì** — le altre 179 istanze del
menu restano dove sono», perché nata per un problema delle righe: il giro del fuoco fra le
colonne, che in una tabella è il gesto principale.

**Il difetto vero non è la duplicazione: è che all'operatore i due campi sembrano lo stesso
campo.** Stesso dato, stesso aspetto, e il dito sul Tab ottiene due cose diverse a seconda
della schermata.

Tre strade, e nessuna è gratis:

1. **Portare la cella di riga fuori dalle righe** — contraddice la regola citata, che è stata
   scritta con una ragione: fuori da una tabella il Tab non ha un «campo dopo» nella stessa
   colonna, e metà del contratto della cella non ha senso.
2. **Dare a `select-menu` la parte di tastiera che manca** (digita-e-filtra sul trigger, Tab che
   risolve). È la strada più coerente, e tocca **179 istanze**: va misurata prima, non decisa qui.
3. **Accettare la differenza** e dichiararla, se si conclude che una scheda e una riga sono
   contesti diversi anche per il dito.

Da decidere quando si riprenderà l'anagrafica, **non di straforo dentro un lavoro sui
Corrispettivi**: qualunque delle tre tocca componenti condivisi da mezza applicazione.

### 5. Restyle mobile del Registro — FATTO il 18/08/2026

Sessione di rifinitura visiva guidata dagli screenshot, tutta sul Registro
Corrispettivi. **I pattern che ne sono usciti sono scritti in
`regole-stile-ui.md`** e valgono per le altre schermate che verranno riviste:
non vanno riscoperti leggendo questo codice.

| Area           | Prima                                   | Dopo                                                           |
| -------------- | --------------------------------------- | -------------------------------------------------------------- |
| Testata mobile | 5 fasce di comandi prima del primo dato | 2 — «Nuovo» accanto al titolo, poi Esporta · Filtri · Colonne  |
| Filtri mobile  | 6 chip a 44px                           | 1 pulsante «Filtri (n)» + pannello (mixin condiviso)           |
| Export mobile  | 4 pulsanti                              | menu «Esporta» (`app-action-menu` con `triggerLabel`)          |
| Righe mobile   | ripiego `data-label`, 8 righe per card  | card progettata a 3 fasce, accento laterale per tipo           |
| Elenco lungo   | tutto, il riepilogo irraggiungibile     | 25 righe + «Mostra le altre N righe», solo su schermo compatto |
| Riepilogo      | banda piatta, 3 blocchi responsive      | riquadro unico con fili, 2 fasce, **zero** media query         |
| Scroll mobile  | elenco in una finestrella di ~330px     | scorre la pagina, il riepilogo è la coda                       |

**Componenti condivisi estesi** (sempre con `input()` o custom property, mai
`::ng-deep`): `app-button` (`ariaLabel`), `app-action-menu` (`triggerLabel`,
`triggerIcon`, punti di regolazione), più l'estrazione del mixin
`list-page-mobile-filters` da `list-page`, che ora serve anche a chi ha un
layout proprio.

**Token nuovi**: `--border-width-accent` (l'accento laterale, prima scritto
come `--space-1` — un token di spaziatura prestato a un bordo) e
`--summary-item-min-w` (misurato sull'etichetta più lunga della banda totali).

⚠️ **Quello che resta da verificare**: tutto è stato provato ridimensionando la
finestra su PC, **mai su un telefono vero**. La larghezza e le media query sono
fedeli; il tocco no. Da controllare su dispositivo: bersagli da 44px raggiungibili
col pollice, pannello filtri, menu Esporta, e lo scorrimento dell'elenco lungo.

### 6. Pulsante di collasso sidebar a icone — confermato, non ancora costruito

⚠️ **Fuori tema** (shell applicativa, non Corrispettivi): segnato qui solo perché è emerso
durante il restyle di questo Registro (larghezza sidebar, densità filtri), ed è questo il
file da cui si riprende quella sessione.

Deciso il 18/08/2026: dopo aver ridotto `--sidebar-width` da 232px a 196px per prova visiva
passo per passo, resta l'idea di un pulsante che colassi la sidebar a sola icona sulle
finestre strette — confermata dal proprietario del progetto («tasto per ridurla mi piace
l'idea»), mai costruita.

Misurato, per chi riprende:

- Pattern di riferimento: `core/services/theme.service.ts` — `providedIn: 'root'`, `signal` +
  `localStorage` con fallback try/catch. Lo stesso schema serve per lo stato
  collassato/espanso.
- Wiring: `ShellLayoutComponent` (smart, tiene lo stato) → `AppSidebarComponent` (resta dumb:
  riceve via `input()`, emette il toggle via `output()`).
- Il toggle va nella riga del brand (`.app-sidebar__brand`), e solo da `lg` in su: sotto quella
  soglia la sidebar è già un cassetto mobile, il collasso a icone è un problema di larghezza
  _desktop_, non di quello.
- Il token della larghezza collassata **esiste già e non è mai usato**:
  `--sidebar-width-collapsed: 3.5rem` in `_design-tokens.scss` — verificato via grep, nessun
  selettore lo referenzia.
- In collassato, `.app-sidebar__label` / `.app-sidebar__section-title` / `.app-sidebar__brand-copy`
  si nascondono VISIVAMENTE (stile `.sr-only`: clip, non `display:none`), non si tolgono dal DOM
  — il nome della voce deve restare annunciato dallo screen reader anche a sidebar collassata.

Pattern nuovi da riusare, documentati in `regole-stile-ui.md` §5 durante lo stesso lavoro
(barre filtri dense, modalità `select-menu`, variante `flat` di `segmented`, riepilogo di fondo
pagina, riga di subtotale in tabella): utili anche per gli altri riepiloghi/elenchi da
sistemare dopo, non solo per la sidebar.

### 7. ⭐ L'inserimento da TASTIERA nelle anagrafiche — deciso il 18/08/2026, da fare

> **In un gestionale una scheda si compila da tastiera, dall'inizio alla fine. Se un solo
> campo costringe al mouse, l'operatore ha perso il ritmo su tutti gli altri.**

**Come è emerso.** Cercando perché il Codice IVA si comportasse in due modi. La risposta è
che il problema non è il campo IVA: **nelle anagrafiche la tabulazione non è mai stata
progettata**. L'IVA è solo il punto in cui si è visto.

⚠️ **Il criterio con cui questo lavoro va giudicato è di prodotto, non di codice.** La prima
proposta fatta in sessione — «rendere la cella indipendente dalla riga», «togliere un input
obbligatorio» — è stata respinta dal proprietario del progetto con la motivazione giusta:
_«le soluzioni non devono essere solo risolutive, ma coerenti col gestionale, non solo
semplificare il processo di codice»_. Vale per chiunque riprenda questo punto.

**Il requisito**, detto una volta:

- lo stesso dato si sceglie **nello stesso modo** in ogni schermata — riga documento o scheda;
- il giro del Tab **arriva a ogni campo e riparte**, nell'ordine logico della maschera;
- si digita per cercare, l'elenco filtra **per prefisso del codice**, Invio conferma e resta.

**Perimetro da verificare** (non solo l'articolo): scheda articolo, fornitore, cliente,
Impostazioni. Per ognuna: ordine del Tab nel DOM, campi che lo interrompono, controlli che
non si operano da tastiera.

**Cosa NON basta**, e va detto perché è la tentazione: sistemare il solo campo IVA. Sposta il
problema invece di chiuderlo — gli altri diciannove campi della scheda restano come sono.

**Misure già in mano** (18/08, due indagini):

- `app-select-menu` è un `<button>`: il Tab ci arriva, ma poi non si digita. L'unico
  `keydown` di tutto il componente è Escape — niente frecce, niente type-ahead. **È più
  povero di un `<select>` nativo**, e le linee guida ARIA per `role="listbox"` chiedono
  entrambe le cose. Vale per tutte le sue istanze, non solo l'IVA.
- Le istanze sono **186** (erano 179 il 17/08: sette in più in due giorni), e sono **due
  popolazioni**: ~97 filtri e barre strumenti, dove il trigger a bottone è la scelta
  **giusta**, e ~89 campi di form, dove sta il difetto. Il numero che ha bloccato la
  decisione due volte contava le prime insieme ai secondi.
- La cella di riga **non è specifica delle righe**: su 16 istanze solo 7 stanno nel giro
  delle colonne.
- ⚠️ `select-menu` ha 23 input, 186 istanze e **nessuno spec**. Qualunque modifica al suo
  comportamento di tastiera oggi non ha nulla che la fermi: la rete va messa prima.
- ⚠️ La destinazione **non** è `shared/`: ESLint vieta a `shared/**` di importare `@domain/*`,
  e si trascinerebbe dietro un grappolo di 34 file. I punti di chiamata stanno in `domain/`,
  e `domain → domain` è consentito.
- **Riferimento esterno utile** (dal proprietario): Danea tiene **due** comportamenti — nella
  scheda articolo un elenco con type-ahead, nelle righe una cella che si digita. Quindi due
  comportamenti non sono di per sé un difetto; VestiFlow però ha scelto di **unificarli sul
  modello delle righe**, che è più coerente.

#### Stato al 18/08/2026 sera — cosa è già fatto del punto 7

Due commit sul ramo, albero verde (build, lint con 9 guardie, 504 test di componente):

- `d8da0d3f` — la cella `document-line-select-cell` esce dalle righe: `lineIndex`
  facoltativo, più `selectOnFocus`, `includeEmptyOption`/`emptyOptionLabel` e `boxed`.
  Tutte additive: le sedici istanze dentro una riga non cambiano.
- `965ca4c1` — scheda **articolo** e scheda **fornitore** usano quella cella per il
  Codice IVA. Opzioni da `vatCodeSelectOption` (label = codice), che è la condizione
  perché il filtro per prefisso funzioni.

**Decisione di dominio registrata** (proprietario del progetto): il Codice IVA
predefinito **propone**, non determina. Un articolo nuovo nasce col predefinito
**scritto nel campo**; se l'operatore lo svuota resta vuoto e nessuno glielo rimette —
un articolo senza Codice IVA è legittimo. A campo vuoto **non c'è scritto nulla**.

#### «IVA in ordine fornitore non va bene» — misurato il 18/08/2026

La domanda posta dal proprietario era la sola che contasse: **è cambiato qualcosa, o già
prima non funzionava?** In Ordine cliente lo stesso campo sembrava a posto.

**Risposta: non è cambiato niente il 18/08.** I due commit di quel giorno hanno toccato il
componente cella (in modo additivo), la scheda articolo e la scheda fornitore — **nessuna
delle due maschere d'ordine**. Il `git blame` sulle celle IVA di riga dice `11/08/2026` per
entrambe (`57ad10c4`, `1ee64a50`, `b5a292c4`), e la voce vuota del fornitore risale al
`18/07/2026`.

**La divergenza però era reale.** Confrontando **quattro** maschere e non due, l'Ordine
fornitore risultava l'unico fuori riga:

|                                       | Ordine cliente    | Arrivo merce      | Corrisp. manuale | **Ordine fornitore**   |
| ------------------------------------- | ----------------- | ----------------- | ---------------- | ---------------------- |
| voce vuota `—` in cima all'elenco IVA | no                | no                | no               | **sì**                 |
| `[value]` legato a                    | `lineVatValue(i)` | `lineVatValue(i)` | —                | **il control diretto** |

**✅ CORRETTO — la voce vuota.** `vatCodeOptionsBase` anteponeva `{ value: '', label: '—' }`
alle opzioni: eredità di quando la colonna era un `select-menu`, dove una tendina senza
scelta è normale. Sulla cella a ricerca-e-selezione quella voce è la **prima evidenziata**:
aprire e battere Invio senza guardare azzerava il Codice IVA della riga, e il salvataggio
poi la rifiutava. È il vicolo cieco che `document-line-select-cell` descrive da sé su
`includeEmptyOption`. Guardia: `l'elenco del Codice IVA di riga non offre la voce vuota`,
**provata rossa** rimettendo il codice di prima.

⚠️ **DUE ERRORI DI ANALISI, registrati perché non si rincorrano di nuovo.**

1. **«`onLineVatSelect` non chiama `markFormDirty()`, quindi la modifica si perde» — FALSO.**
   Il gestore davvero non lo chiama mentre i suoi fratelli di riga sì, e `dirtySinceLastSave`
   davvero si accende solo dentro `markFormDirty`. Ma **una delle chiamate a `markFormDirty`
   è una sottoscrizione unica su `form.valueChanges`** (costruttore, dal 19/07/2026), e il
   `setValue` di quel gestore emette: la protezione c'era già. L'errore è stato cercare chi
   **scrive** la variabile senza mai elencare chi **chiama** la funzione che la scrive.
2. **La guardia di sola lettura aggiunta al gestore contraddiceva una scelta dichiarata**:
   due righe sotto quella sottoscrizione il codice dice «Sola lettura = form disabilitato.
   Un solo punto invece di una guardia in ogni gestore». Entrambe le modifiche sono state
   **ritirate**.

⚠️ **E la correzione dell'id duplicato del 18/08 quasi certamente non c'entra.** Stava nel
pannello «Nuovo fornitore»; ma il pannello «Nuovo cliente» dell'Ordine cliente **non ha
affatto un campo Codice IVA** — è stato verificato. Un confronto «cliente contro fornitore»
può quindi riguardare solo le **righe**, non i pannelli.

**Resta aperto**: se dopo questa correzione l'operatore vede ancora qualcosa che non va,
serve uno screenshot. La divergenza `[value]` della tabella qui sopra è **una fragilità, non
un guasto misurato** — altri binding dello stesso template leggono `formValue()`, quindi il
giro di rilevamento parte lo stesso — e va allineata col lavoro grosso, non di straforo.

#### La tabulazione dell’anagrafica — primo passo fatto il 18/08/2026

Indicazione del proprietario: _«in anagrafica possiamo iniziare a proporre questo
comportamento di tabulazione provvisorio che abbiamo già per le righe, poi la progettiamo e
definiamo e mettiamo nei documenti»_. Quindi **primo passo, non il lavoro**.

⚠️ **Due difetti misurati, non ipotizzati** — con una prova usa-e-getta sulla scheda
articolo, poi cancellata:

1. **Sedici icone informative erano fermate del Tab**, e portavano insieme `tabindex="0"` e
   `aria-hidden="true"`. Le due cose si contraddicono: l’elemento riceve il fuoco ma è
   tolto dall’albero accessibile — ed è la coppia che fa comparire l’avviso in console
   quando il fuoco ci finisce dentro. Misurato: uscendo col Tab dal Codice IVA il fuoco
   andava su un `<i>`, non sul campo dopo.
2. **Il Tab entrava nell’elenco aperto e poi perdeva il fuoco.** Causa nel pannello
   condiviso dei suggerimenti — dettaglio in `03-specifica…` §4.3. Misurato: digitando `1`
   e premendo Tab il valore si risolveva in `10` (giusto) e poi il fuoco finiva sul
   `<body>` (da nessuna parte).

**Correzioni**: `tabindex="-1"` in entrambi i casi.

⚠️ **Perché `-1` e non togliere l’attributo**, che sembrerebbe più pulito: il tooltip si
apre anche col **fuoco**, e su schermo touch quello è l’**unico** modo — la regola CSS è
`@media (hover: none) { .hover-tooltip:focus-within … }`. Togliendo del tutto il
`tabindex` il suggerimento diventerebbe irraggiungibile da tablet. Con `-1` l’icona esce
dal giro del Tab (che su tablet non esiste, come ha fatto notare il proprietario) ma resta
raggiungibile col tocco.

**Misura dopo**: Tab dal Codice IVA → il controllo successivo; digita e Tab → valore
risolto **e** fuoco sul campo dopo. Sedici fermate in tutto nella scheda.

**Cosa NON è stato fatto, ed è il lavoro vero**: la tabulazione della scheda non è
progettata — l’ordine è quello del DOM, nessuno l’ha deciso. Restano fuori anche fornitore,
cliente e Impostazioni. E resta aperta la domanda del §4.3 su cosa il Tab debba portarsi
dietro quando l’elenco è aperto ma l’operatore non ha scelto niente.

**Non fatto, e volutamente**: il rinominare la cella. Si chiama ancora
`document-line-select-cell` mentre ora vive anche in due anagrafiche — è l'anti-pattern
che `regole-architettura` nomina («i nomi dichiarano l'appartenenza»). Tocca 18 istanze e
va fatto col lavoro grosso, non di straforo. **Debito dichiarato.**

---

### 8. ⭐ Vista tablet / vista PC nelle Impostazioni — deciso, da costruire

> **Le due soglie automatiche e la scelta manuale si progettano INSIEME, non una dopo
> l'altra.** _(deciso dal proprietario il 18/08/2026)_

La decisione di base è in `regole-stile-ui` §9, presa l’11/08: la vista a card di un
documento non dipende dalla larghezza ma dal **tipo di puntatore** — col mouse le card
sotto 820px, col dito sotto 1400px — **più una scelta manuale** che il dispositivo si
ricorda, per «il monitor touch grande, chi sul portatile preferisce le card».

⚠️ **Le due soglie vanno RIVISTE quando la scelta manuale esiste** _(deciso dal proprietario
il 18/08/2026)_, e la ragione è che le due decisioni si sono prese in ordine inverso.

**I 1400px** del dito sono tarati per non sbagliare **mai** su un tablet, perché oggi la soglia
è l’unico rimedio: deve coprire anche il caso più largo, e per farlo manda alle card anche
schermi dove la tabella starebbe benissimo. Con la valvola manuale quel compito cambia — la
soglia deve essere giusta per la **maggioranza**, non per tutti, e le eccezioni le prende
l’impostazione. Una soglia prudente senza valvola è cautela; **la stessa soglia con la valvola
è un default che sbaglia più spesso del necessario**, e ogni volta costa all’operatore un giro
nelle Impostazioni.

**Vincoli di esecuzione già scritti** (`regole-stile-ui` §9, da rileggere prima di
toccare): le due condizioni si scrivono **una volta sola** in un mixin di
`styles/_breakpoints.scss`; si muovono **entrambe le direzioni insieme** (~14 fogli), o
nella fascia di mezzo si accendono **tutte e due le viste**; si muove **tutta la vista
documento**, non le sole righe; la **sidebar resta sulla larghezza**.

**Collegato, e da non dimenticare**: su tablet **il Tab non esiste**. Tutto il lavoro sulla
tabulazione (punto 7) vale per chi ha una tastiera; la vista del dito deve reggersi sul
tocco, e le due cose non si sostituiscono a vicenda.

---

### 9. ⭐ Vendita e Reso al banco — la specifica è `docs/11`

⛔ **Qui non si riassumono le decisioni, e non si riassumono gli interventi.** La fonte è
`11-specifica-vendita-al-banco.md`: le **decisioni** in sezione A, la **misura** del codice in
B, gli **interventi** in C, ognuno agganciato alla decisione che lo genera.

⚠️ **Questa sezione conteneva un riassunto delle decisioni del 18/08, ed era già smentito dalla
specifica in tre punti** — diceva «origine facoltativa» dove A11 stabilisce **nessun documento
origine**, teneva aperto il prezzo del Reso che A11 ha chiuso, e motivava le regole col fatto
che «il codice le applicava», che è il metodo che `11` dichiara **non valido**. È stato tolto il
18/08: un riassunto di decisioni è una seconda fonte, e invecchia alla prima decisione.

**Cosa sapere da qui, senza aprire `11`:**

- il documento è stato riscritto da capo il 18/08 ed è l'**unica specifica attiva** del modulo —
  si aggiorna lì, non nascono file paralleli;
- il **contratto del Reso al banco è chiuso** (nessun documento origine, prezzo dall'anagrafica
  secondo il contratto prezzi comune, causale facoltativa, rimborso informativo, correzione come
  la Vendita);
- una **Vendita o un Reso conclusi si riaprono, si modificano e si eliminano**, con
  riconciliazione per differenza — è l'intervento più grande, ed è il primo;
- l'ordine di esecuzione è in `11` sezione C: prima il prerequisito tecnico, poi le tre fasi di
  interfaccia.

---

### 10. ⭐ La matrice documentale Includi/Genera — da verificare e applicare a TUTTI i documenti

> **Non è un seguito della Vendita al banco.** È il contratto di come i documenti si agganciano
> fra loro, e riguarda l'intera famiglia.

⛔ **La fonte canonica è `12-specifica-collegamenti-documentali.md`**, e ha due metà che vanno
tenute distinte: **la matrice e le regole** (il contratto: dove si deve arrivare) e **la sezione
B** (la misura del codice attuale, riverificata da un secondo lettore). ⛔ **Qui non si tiene né
una copia della matrice né conteggi propri del divario**: invecchiano alla prima rimisura, ed è
già successo.

**Il lavoro, in una riga:** completare la copertura della matrice comune **estendendo i
meccanismi esistenti senza duplicarli**, ⛔ senza costruire un secondo motore parallelo in
nessun modulo, e ⛔ senza cancellare le conversioni oggi in uso — la matrice dice dove si deve
arrivare, non che l'esistente sia sbagliato.

⚠️ **Il divario col codice è grande, e va letto in `12` §B prima di stimare qualsiasi cosa.**
La misura del 18/08 non conta «un motore da estendere»: conta **più meccanismi parziali e
indipendenti**, alcuni dei quali non passano nemmeno dal backend.

**Le due regole che stanno sopra la matrice** — testo in `12`, qui solo i nomi:

1. **Un collegamento non autorizza mai a duplicare un movimento già avvenuto**, e senza
   trattamenti speciali per nome di documento.
2. **Il comando si chiama «Genera documento» ovunque** — «Concludi ordine» ritirato il 18/08;
   sparisce il nome, non il comportamento.

✅ **Chiuso il 21/08/2026:** la posizione della **Proforma** nella matrice è censita in `12` —
non include nulla, genera verso DDT vendita e Fattura. Qui c'era «da censire in `12` senza
aggiungere collegamenti non verificati.

---

### 10b. Comando documento per la spunta di movimentazione su tutte le righe

**Requisito trasversale emerso in `docs/11` A11-ter**, che è la sua fonte: nei documenti che
hanno la spunta di movimentazione **per riga** deve esistere un comando **a livello documento**
per impostarla in blocco. Con molte righe non è accettabile obbligare l'operatore a toccarla
articolo per articolo.

⚠️ **Sta qui perché è trasversale**, non del Reso né della Vendita al banco: se restasse solo in
`11` si perderebbe quando si lavora agli altri documenti. **Da coordinare con il lavoro di
unificazione righe (`03`).**

---

### 11. ⭐ Gli stati di DDT e Fatture non sono un ciclo — misurato il 18/08/2026

> **L’elenco offre cinque stati, la maschera non ne espone nessuno, il codice ne sa scrivere
> tre, e il metodo che gestirebbe i passaggi non lo chiama nessuno.**

Emerso da una domanda del proprietario — «gli stati in DDT e fatture sono funzionanti?» — e
misurato subito dopo.

| Stato                   | Chi lo scrive                            |                                               |
| ----------------------- | ---------------------------------------- | --------------------------------------------- |
| `draft`                 | 1 punto, alla creazione                  | vivo                                          |
| `confirmed`             | 5 punti                                  | vivo                                          |
| `printed`               | **nessuno**                              | ⛔ morto                                      |
| `sent`                  | **nessuno**                              | ⛔ morto                                      |
| `cancelled`             | 1 punto, via `POST :id/cancel`           | vivo                                          |
| `externally_registered` | **nessuno**, tolto dallo schema il 16/08 | ⛔ morto, resta il valore nel tipo PostgreSQL |

⛔ **`transition(tenantId, id, next, allowedFrom)` esiste e fa la cosa giusta** — rifiuta i
passaggi non ammessi con «Transizione di stato non consentita» — **ma non lo chiama nessuno.**
Nel controller l’unico endpoint di stato è `POST :id/cancel`: non esiste «segna come
stampato», né «segna come inviato», né un cambio di stato generico.

**Quindi il ciclo non esiste**: un documento nasce, si conferma, e da lì l’unica transizione è
annullare.

⚠️ **Cosa vede l’operatore, ed è la parte che fa danno.** Nella maschera del DDT **non c’è
nessun campo Stato** — non esiste neanche il form control. Ma l’elenco offre i filtri:

```text
DDT vendita   Bozza · Confermato · STAMPATO · INVIATO · Annullato
Fattura       Bozza · Da emettere · INVIATA AL COMMERCIALISTA · Annullata
```

Gli stati in maiuscolo **nessun documento nuovo può assumerli**: quei filtri, salvo storici,
tornano sempre vuoti. E l’operatore non ha modo di marcare un documento come stampato nemmeno
volendo.

⚠️ E i tre `CONFIRMED_EDITABLE_STATUSES` includono `printed` e `sent`: gate che contemplano
stati irraggiungibili. Non fanno danno, ma raccontano un ciclo che non c’è.

⏸️ **Tre strade, e nessuna è stata scelta:** togliere dai filtri gli stati che nessuno assegna
· implementare le transizioni mancanti · lasciare com’è e dichiararlo. La prima è l’unica delle
tre che l’operatore vede.

---

### 12. Sconto extra: le REGOLE DI CALCOLO sono del motore economico, non di una maschera

⚠️ **Attenzione a cosa è aperto: non il campo, il calcolo.**

|            |                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deciso** | il documento ha lo **Sconto extra a piè documento**, con un campo **percentuale** e un campo **importo**, coerente con gli altri documenti VestiFlow (`11` A16) |
| **Aperto** | le **regole di calcolo** di quello sconto                                                                                                                       |

Restano da definire: se **percentuale e importo** siano cumulabili o alternativi, l’**ordine di
applicazione**, gli **arrotondamenti**, il comportamento con **più aliquote**, il rapporto con
**castelletto e totali**.

⚠️ **Non sono decisioni della Vendita al banco**, e non stanno nella sua specifica: la risposta
deve valere identica su ogni documento che ha uno sconto extra. Deciderle dentro una maschera
produrrebbe una regola valida per quella sola.

⚠️ **Non esiste una specifica che le ospiti** — verificato il 18/08: nessun file in `docs/` le
governa. Stanno qui finché non ne nasce una, o finché non si decide che la loro casa è il
documento del motore economico.

⚠️ **E più aliquote non sono un motivo per togliere l’importo**: è un caso che il modello
economico deve saper gestire, non una funzione da sacrificare.

⛔ **Ma il campo importo OGGI NON ESISTE**, e va saputo prima di stimare. Misurato il 18/08: il
contratto comune ha **solo la percentuale** — `documentDiscountPercent` in ingresso e un
importo come risultato calcolato. **Nessun campo importo in ingresso**, in nessun documento e
in nessuno strato.

Quindi la decisione «percentuale e importo» **richiede di estendere il contratto comune**, e
quella estensione va fatta **dove il contratto vive**. ⛔ **Non** aggiungendo un campo locale a
una maschera: un importo che esiste in un documento solo è la logica locale che si sta
evitando.

**La regola generale**, che vale oltre gli sconti: se durante l’implementazione il contratto
comune risulta **incompleto o incoerente**, lo si **segnala** — non lo si aggira in locale. È
la stessa disciplina del motore Includi/Genera al punto 10.

---

### 13. ⭐⭐ `invoice_draft`: uno STATO modellato come TIPO — censimento del 18/08/2026

> **«Bozza fattura» doveva essere uno stato della fattura non ancora confermata. È nato come
> tipo di documento a sé, e da lì viene il disordine.**

Diagnosi del proprietario, e il codice la conferma da solo. Nello schema, sulla tabella
`documents`:

```text
«le BOZZE (number NULL) non collidono ma i confermati sì»
```

Il concetto di bozza **è già uno stato**: un documento senza numero. E `DocumentStatus.draft`
esiste. Quindi «bozza» è modellata **due volte** — una volta bene come stato, una volta male
come nome di tipo.

⚠️ **E non esiste nessun tipo fattura «non bozza»**: `invoice_draft` è l’unica fattura di
vendita. Il commento del suo enum lo dice: `invoice_draft // Fattura (fiscale…)`. Il nome
promette una distinzione che nel modello non c’è.

#### ⛔ Chi è appoggiato su quel tipo — la parte che rende pericoloso toccarlo

**Due altri documenti ci numerano dentro:**

```text
invoice_accompanying  ─┐
credit_note           ─┴──→  numerano sotto  invoice_draft
```

Fattura, Fattura accompagnatoria e Nota di credito **condividono un solo progressivo**, e chi
lo possiede è `invoice_draft`. Il codice avverte che usarlo come filtro di uguaglianza su
`type` è **«un errore silenzioso»**: si vedrebbe metà partizione e si proporrebbero numeri già
occupati, che l’indice unico boccia. C’è una migration dell’11/08 che chiude proprio quello.

**Gli altri appoggi, misurati:**

| Dove                    | Cosa                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `document-type.util.ts` | **10 punti**: numerazione, conversione, insiemi                                                              |
| conversione             | è **destinazione** sia da Proforma sia da DDT vendita                                                        |
| permessi                | famiglia `invoice`                                                                                           |
| modalità prezzo         | è in `SALES_PRICE_MODE_TYPES`                                                                                |
| Nota di credito         | ci si genera sopra (`07` §6)                                                                                 |
| viste tabella           | chiave **persistita** `invoice_draft_documents_list` — rinominarla orfana le colonne salvate dagli operatori |
| API                     | parametro `?type=invoice_draft` — collegamenti salvati e integrazioni                                        |
| migration               | **7 file** già applicati                                                                                     |
| in tutto                | **131 occorrenze**, 72 fuori dai test, su **46 file**                                                        |

#### I tre lavori, di natura diversa — e con case diverse

⚠️ **Qui c'era scritto che i primi due «stanno in `11` C1». È sbagliato**, e va corretto per
natura del lavoro invece che spostando il rimando: `docs/11` non è la casa di `invoice_draft`,
e **C1 riguarda la terminologia «Vendita negozio»** — in tutto `11` non esiste una sola
occorrenza di `invoice_draft` né di «Bozza fattura».

**La divisione che conta è fra terminologia esposta e identificatore tecnico**, ed è la stessa
distinzione che `11` A6 fa per «Vendita negozio»: sono due lavori con rischi diversi, e vanno
tenuti separati.

|       | Cosa                                                                      | Casa                                                                                               | Rischio                                       |
| ----- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **1** | il **termine esposto** → «Fattura»: guida, documento funzionale, messaggi | **`docs/12`**, sezione «Bozza fattura non è un tipo documentale» — è lì che la regola è dichiarata | nessuno, e risolve il problema dell'operatore |
| **2** | una **guardia** che impedisca il rientro del termine, su `check:registro` | **`docs/12`**, insieme alla regola che deve far rispettare                                         | quasi nessuno                                 |
| **3** | l'**enum tecnico** `invoice_draft`: mapping, rotte, numerazione, rinomina | **la Famiglia Fattura (`docs/07`)** — non `11`, non la matrice                                     | ⛔ alto — vedi sopra                          |

⛔ **Il 3 non è una rinomina, e non si fa automaticamente perché il nome tecnico è storico.** È
disfare un tipo su cui poggia il numeratore di tre documenti: toccarlo male significa **numeri
duplicati sulle fatture**, il danno peggiore possibile qui. Se si farà, la partizione del
numeratore è il **primo** vincolo da affrontare, non una scoperta a metà strada. E il database è
condiviso col collega.

⏸️ **Il 3 non è deciso.** I primi due sì.

---

# Elenchi lunghi: la resa, non i dati _(rimandato 20/08/2026, con evidenza)_

Il registro Movimenti non pagina più: entra sugli **ultimi 30 giorni** e «Tutti» è una scelta
esplicita. Resta aperto **cosa succede quando il risultato è molto grande** — e la decisione del
proprietario è di **non fissare ora un tetto**, perché non esistono dati reali su cui tararlo.

## Cosa sappiamo già, misurato

Non serve rimisurarlo: l'evidenza è sufficiente per dire che il DOM tradizionale non scala
all'infinito, e insufficiente per scegliere un numero.

```text
frame Chromium (layout+paint, senza Angular)   28 ms @100 · 102 ms @1.000 · 585 ms @5.000
motore in jsdom (Angular, senza layout)       132 ms @100 · 507 ms @1.000 · 2.597 ms @5.000
selezionare UNA riga                           15 ms @1.000 · 59 ms @5.000 · 134 ms @10.000
peso per riga (misurato su 285 righe vere)     726 B mediana · 843 B p95 · l'API NON comprime
```

⚠️ Il costo che conta **non è il primo disegno**: è ogni tocco successivo, perché il ciclo per
colonna si rivaluta su tutte le righe rese. Ed è quello che l'operatore paga tutto il giorno.

Il metro dichiarato dal progetto è **INP < 200 ms** (`regole-architettura`).

## La strada da valutare, quando servirà

⭐ **Virtualizzazione delle righe**, non caricamento progressivo. La differenza è sostanziale:

|                      |                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtualizzazione** | l'intero risultato filtrato è **già nel client**; nel DOM esistono solo le righe visibili più un piccolo margine. Ordinamento, selezione, export e conteggi continuano a riguardare tutto         |
| **Infinite scroll**  | il client scarica altri blocchi mentre si scorre. ⛔ Molto più invasivo: ordinamento, selezione, export e conteggi dovrebbero rappresentare un insieme di cui **una parte non è ancora arrivata** |

`@angular/cdk` è **già dipendenza** del progetto (`cdk-virtual-scroll` ha oggi zero occorrenze):
sarebbe un candidato naturale, il che **non significa** che sia già scelto.

⚠️ Da verificare prima di adottarla, perché sono le cose che si rompono per prime: la ricerca del
browser (Ctrl+F), la stampa di pagina, l'export dalla vista, «seleziona tutti», l'intestazione
appiccicata e il ridimensionamento colonne.

## ⛔ Cosa NON è deciso

Nessun tetto — **né 500, né 2.000, né altro** — è stato fissato. Il numero va scelto **su dati
reali**, e oggi tutti i tenant sono banchi di prova: 285 movimenti in tutto, 161 negli ultimi
trenta giorni, di cui 106 in un solo giorno.

⭐ **Quando servirà, la forma da imitare è già in casa**: il Registro Corrispettivi conta _prima_
di leggere e risponde «il periodo contiene N righe: restringi le date». Si copia **la forma**,
mai la cifra — il suo 5.000 protegge da un costo di backend che nei Movimenti non esiste, e non
nomina mai il browser.

---

# ✅ La Fattura accompagnatoria scaricava senza avvisare — CORRETTO il 26/08/2026

Trovato chiudendo il passo 1 dell’audit dei flag, e corretto lo stesso giorno su
indicazione del proprietario («non lascerei le cose indietro»).

## Il difetto

I tipi che scaricano giacenza sono **tre** (`DOCUMENT_STOCK_UNLOAD_TYPES`): DDT vendita,
Vendita manuale e Fattura accompagnatoria. I primi due stanno sull’Ordine cliente e
mostravano disponibilità e avviso; la terza **né l’una né l’altro**.

⚠️ Grave perché la regola esclude il blocco: l’insufficienza di stock **avvisa e non
blocca mai**. Escluso il blocco, l’avviso è l’unico presidio — e dove manca, lo scarico
oltre disponibile passa in perfetto silenzio.

## ⭐ Mancava il DATO, non la capacità

La riga condivisa porta `exceedsAvailability` e `availabilityHint` **da sempre**
(`document-line-row.model.ts`). La maschera dei documenti di vendita non teneva i
riepiloghi delle varianti delle proprie righe, quindi non sapeva quanta merce ci fosse.

## Come è stato corretto, e le tre cose che NON si sono fatte

|                    |                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| il **calcolo**     | estratto in `variant-availability.util` — puro, niente rete: l’Ordine cliente lo aveva inline e copiarlo avrebbe fatto la **terza** implementazione dello stesso avviso |
| il **caricamento** | esteso il servizio che già esisteva, `DocumentLineArticleService.summariesByIds` — l’asincrono sta nel service, mai in un util                                          |
| il **gate**        | la riga, non il tipo: `loadsStock`. ⛔ Nessun `if (invoice_accompanying)` in una maschera che la migrazione ha appena reso comune                                       |

⚠️ **Il messaggio è UNO** (`availabilityHintText`). Due copie dello stesso avviso in questo
progetto sono già divergute **su un apostrofo**, e nessun test lo vedeva.

## ⏸ Cosa resta aperto, e non è stato dedotto

- **Trasferimento e Rettifica** riducono anch’essi una giacenza ma **non** stanno in
  `DOCUMENT_STOCK_UNLOAD_TYPES` e passano da un altro meccanismo. Se debbano mostrare lo
  stesso avviso è una **domanda**, non un difetto misurato.
- **Le implementazioni dell’avviso restano tre** — Ordine cliente e documenti di vendita
  ora condividono calcolo e testo, ma la Vendita al banco ha una strada sua (`line.available`
  sulla riga) e il Movimento di magazzino un’altra ancora (`lineExceedsAvailability` locale).
  Unificarle richiede il censimento dei consumatori **prima**, come ogni altra unificazione
  di questo filone.
- **Ordine cliente e Arrivo merce** procurano ancora i riepiloghi **inline**, con un ciclo di
  chiamate e `mergeVariantSummaries`, invece di `summariesByIds`. Seguito meccanico, misurato,
  non incluso qui per non allargare una correzione mirata.
