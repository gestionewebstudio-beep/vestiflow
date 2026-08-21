# Mappa di riuso — maschera Vendita e Reso al banco (FASE UI 3)

**Che cos'è:** il confronto puntuale fra `StoreSaleRegisterComponent` (la maschera di oggi) e
`CustomerOrderFormComponent` (il riferimento indicato da `11` §A12), area per area, con la
classificazione richiesta prima di scrivere codice.

**Misurato il 21/08/2026 (mattina)** sul ramo `feature/pagamenti-tesoriera` a `9259d19c`.

---

## ⭐ LEGGERE PRIMA — che cosa è stato CHIUSO dopo la misura (21/08, sera)

⚠️ **Le misure di questo documento sono di stamattina, e da allora tredici commit hanno chiuso
buona parte dei prerequisiti.** Il §8 «Ordine di implementazione» qui sotto porta lo stato
aggiornato passo per passo: **non ripartire da lì senza averlo letto**, o si rifà lavoro fatto.

⛔ **Chiusi, e da NON riaprire salvo evidenza di regressione:**

|           |                                                                | Commit     |
| --------- | -------------------------------------------------------------- | ---------- |
| **T13**   | `column-width-distribution` promossa a `shared/table-columns/` | `73c1fd49` |
| **E-1**   | motore comune delle larghezze colonne                          | `2412719d` |
| **T6**    | autorizzazione sede: anche quella del documento ESISTENTE      | `4f537d0c` |
| **T1/T2** | identità create/update e righe — `uiId` ≠ `serverLineId`       | `7fd05142` |
| **T3**    | snapshot IVA che non si rifotografa (Vendita e Reso)           | `52a25b71` |
| **T4**    | prezzo del Reso obbligatorio, niente più `?? 0`                | `ea9d029d` |
| **T7A**   | sede e data nel calcolo della numerazione                      | `0591624c` |
| **T7B**   | collisione numero → 409 strutturato, non 500                   | `0e49cd21` |
| **T8A**   | contratto backend numero/serie, con `serieCanonica`            | `5318af8f` |
| **T15A**  | registro comune degli intenti di creazione + tabella e RLS     | `7bf89c0c` |
| **T15B**  | intento generato dal client, e contratto chiuso                | `3f149123` |
| —         | il 409 non è una categoria sola (correzione a T15B)            | `0ff13421` |
| —         | concorrenza su `cancel`: rivendica prima di stornare           | `6586de36` |

⭐ **Lo stato completo di T15 sta in `docs/T15-IDEMPOTENZA-SALVATAGGI.md` §3-bis**, che è una
checklist permanente: ogni voce porta stato, commit e test.

⛔ **Restano APERTI** — e sono il lavoro della maschera nuova:

- **T8B** — `DocumentNumberField` + `DocumentNumberingStore` + `DocumentCountersService.available`
  lato client (le voci E-6 ed E-7 del §5). ⚠️ **Non si fa sulla vecchia pos**: decisione del
  proprietario, quella UI verrà sostituita.
- **la cella IVA documentale comune** al posto di `app-select-menu` — stessa ragione: si fa nella
  maschera nuova. Il perché sta in `DA-FARE.md` §«La voce Predefinito della cassa».
- **tutti i passi 8-13** del §8: la maschera vera e propria.
- **T9/T10/T11** (eliminazione) e **E-8** (scanner), che restano lavori a sé.

⛔ **Non è una specifica e non decide niente.** Le decisioni della Vendita al banco stanno in
`docs/11`; qui c'è solo _che cosa esiste già_, _che cosa manca_ e _dove la cosa che manca
appartiene_. Dove il confronto ha trovato una decisione da prendere, è nominata in fondo — non
risolta.

---

## 0. Le misure di partenza

```text
CustomerOrderFormComponent    5230 TS · 2829 HTML · 345+900 SCSS (6 fogli)
StoreSaleRegisterComponent    1337 TS ·  596 HTML · 639 SCSS (1 foglio)

doc-form nel banco            0 classi  ·  0 celle app-document-line-*
_document-form*.scss          3167 righe GLOBALI, già caricate, che il banco non usa
```

⭐ **Il rapporto 5230:1337 inganna.** L'Ordine cliente serve **quattro** tipi documento —
`order`, `quote`, `sales-ddt`, `manual-unload` (`formKind` da `route.data`) — e porta trasporto,
indirizzi, allegati, «Includi», «Genera», conversioni. La parte che il banco userebbe è una
frazione. **Non è il file da copiare: è il file da cui prendere i pezzi**, e i pezzi migliori
sono già usciti da lì e stanno in `domain/`.

⚠️ **La differenza strutturale vera è un'altra, e non si vede dalle righe:**

|                              | Ordine cliente                        | Banco                                  |
| ---------------------------- | ------------------------------------- | -------------------------------------- |
| stato delle righe            | `FormArray` di `FormGroup` (Reactive) | `signal<readonly DocumentLineDraft[]>` |
| import `ReactiveFormsModule` | sì                                    | **no**                                 |

⭐ **Non è un ostacolo quanto sembra**: le celle di riga condivise (`document-line-code-cell`,
`-product-cell`, `-select-cell`, `-unit-cell`, `-suggestions`) sono **form-agnostiche** —
espongono `value` + `valueChange`, non un `formControlName`. Anche `DocumentLineFocusStore` lo è:
riceve funzioni, non controlli. Il vincolo al form resta solo su `customer-order-line-card` (che
lega `[formControl]`), ed è il pezzo che al banco va comunque riscritto perché porta campi
diversi.

---

## 1. La tabella maestra

| Area                     | Categoria                                     | In una riga                                                                   |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------- |
| **testata**              | DA ESTRARRE/GENERALIZZARE                     | il vestito globale `doc-form__header` c'è già; manca l'adozione               |
| **Cliente**              | RIUSO DIRETTO                                 | stesso `CustomerService` + `app-select-menu`; al banco resta facoltativo      |
| **Location**             | RIUSO DIRETTO                                 | `OperationalLocationsService` + `prefillDefaultLocation` + `headerGateActive` |
| **numerazione**          | SPECIFICO BANCO (adozione)                    | il campo e lo store esistono; **al banco non c'è nessun campo numero**        |
| **ricerca prodotto**     | RIUSO DIRETTO                                 | `app-document-product-search-panel` è **già usato da entrambi**               |
| **scanner**              | DA ESTRARRE/GENERALIZZARE                     | tre implementazioni, nessuna regge il caso richiesto — §3                     |
| **righe desktop**        | DA ESTRARRE/GENERALIZZARE                     | celle condivise pronte; la griglia è markup da scrivere                       |
| **quantità**             | SPECIFICO BANCO                               | lo stepper del banco è quello giusto; l'Ordine cliente ce l'ha solo su card   |
| **prezzo**               | DA ESTRARRE/GENERALIZZARE                     | `price-mode-menu` esiste; al banco l'ivato è **forzato nel codice**           |
| **sconto**               | ⛔ GAP DEL CONTRATTO COMUNE                   | riga: c'è. Extra documento: **non esiste al banco**, e il comune ha solo la % |
| **IVA**                  | RIUSO DIRETTO                                 | `document-vat.util` + `document-vat-options.util` già usati da entrambi       |
| **disponibilità**        | DA ESTRARRE/GENERALIZZARE                     | due implementazioni non allineate, stessa regola                              |
| **colonne/resize**       | RIUSO DIRETTO                                 | `STORE_SALE_LINE_COLUMNS` **già scritto e mai usato**                         |
| **focus/tastiera**       | RIUSO DIRETTO                                 | `DocumentLineFocusStore`, contratto a 10 voci                                 |
| **card mobile**          | RIUSO DIRETTO (forma) + SPECIFICO (contenuto) | `app-document-line-card` è la forma; serve un `store-sale-line-card`          |
| **totali/piede**         | DA ESTRARRE/GENERALIZZARE                     | `computeDocumentTotals` esiste; al banco c'è **solo il Totale**               |
| **salvataggio/modifica** | ⛔ GAP APERTO                                 | l'API sa risalvare per differenza, **il client non gliene dà i mezzi**        |

---

## 2. Area per area

### 2.1 Testata — DA ESTRARRE/GENERALIZZARE

**Ordine cliente:** `.doc-form__header` è una griglia di celle bordate vestita da
`styles/_document-form.scss` (globale, 2315 righe) e, sotto `lg`, da `_document-form-mobile.scss`
(611) tramite `app-document-mobile-panel` — pannelli comprimibili con medaglione, riepilogo e
riga di stato.

**Banco:** `.pos__context` — due campi affiancati, 639 righe di SCSS proprio, e **sei sole
`bp.media-up('md')`**, nessuna delle quali sulla testata: nessun adattamento mobile.

> ⭐ **Il costo dell'adozione è quasi tutto già pagato.** I fogli globali sono caricati da
> `src/styles.scss` per ogni pagina dell'app: usare `doc-form__*` non aggiunge un byte al bundle,
> e la testata mobile comprimibile arriva con `app-document-mobile-panel` senza scrivere CSS. Le
> 639 righe di `pos__*` sono un vestito parallelo per la stessa cosa.

**Da estrarre:** niente di nuovo. **Da adottare:** markup `doc-form__header` +
`app-document-mobile-panel`. **Da eliminare:** l'intero foglio `pos__*`.

### 2.2 Cliente — RIUSO DIRETTO

Identici in entrambi: `CustomerService.getAllCustomers()` → `SelectMenuOption[]` con
`customerDisplayName`. L'Ordine cliente aggiunge la creazione in linea
(`CustomerFormFieldsComponent` in `doc-form__supplier-box`) e l'apertura del dettaglio.

Al banco il cliente è **facoltativo** (`11` A13): non entra nel gate della testata, e la
creazione in linea è una scelta di prodotto — non un requisito ereditato.

### 2.3 Location — RIUSO DIRETTO

Entrambi su `OperationalLocationsService`. Il banco ha in più `LocationContextService` e
`isFixedSingleStore`/`fixedSingleStoreLabel`, che sono **giusti e vanno tenuti**: chi sta al banco
ha una sede sola, e vedersela come etichetta invece che come tendina è il comportamento corretto.

⭐ Il gate «senza Location non si prosegue» (`11` A13, A22) è **già implementato** nell'Ordine
cliente come `headerGateActive()` più lo stato vuoto al posto della tabella. Per il banco vale la
forma `manual-unload`: **solo** `locationId`, non il cliente.

### 2.4 Numerazione — SPECIFICO BANCO (adozione, non costruzione)

|                      | Ordine cliente                                           | Banco       |
| -------------------- | -------------------------------------------------------- | ----------- |
| campo Numero/Serie   | `app-document-number-field`                              | **assente** |
| proposta e serie     | `DocumentNumberingStore` + `DocumentCountersService`     | —           |
| conflitto sul numero | `DocumentNumberConflictStore` + avviso a bottone singolo | —           |

Il numero del banco lo assegna il server alla conclusione (`nextDocumentNumber` in
`api/src/store-sales/store-sales.service.ts`) e l'operatore lo vede solo dopo, dentro
`lastSaleResult.reference`.

⚠️ **`11` A5 dice «sistema comune», non «campo in testata».** Che il numero sia proposto e
modificabile prima del salvataggio è una **decisione non presa** — vedi §5.

### 2.5 Ricerca prodotto — RIUSO DIRETTO ✅

`app-document-product-search-panel` dentro `app-slide-panel` è **già usato da tutti e due**, con
gli stessi `launchTerm` / `launchSeq` / `locationId`. Anche `ProductFormComponent` in pannello
(creazione articolo al volo) è già condivisa, e `BarcodeLookupService` pure.

⚠️ **Ma al banco è raggiungibile solo in modalità VENDITA** — vedi il gap G2.

L'Ordine cliente ha in più i **suggerimenti in riga** (`document-line-suggestions` +
`DocumentProductSuggestStore`) e il **lookup per codice in cella** (`DocumentCodeLookupStore` +
`DocumentCodeLookupService`, che sa distinguere «nessuna», «una», «più d'una»). Al banco arrivano
gratis con la griglia righe.

### 2.6 Scanner — DA ESTRARRE/GENERALIZZARE ⛔ (verifica speciale, §3)

### 2.7 Righe desktop — DA ESTRARRE/GENERALIZZARE

**Banco oggi:** `<table class="pos-cart">` a sette colonne fisse dentro `.pos__cart-scroll`:
Articolo · Q.tà · Prezzo · Sconto % · IVA · Totale · azioni.

**Da riusare senza toccarle** (tutte form-agnostiche, `value` + `valueChange`):

```text
app-document-line-code-cell      codice / SKU / EAN con scelta fra più corrispondenze
app-document-line-product-cell   nome con suggerimenti e apertura ricerca
app-document-line-select-cell    IVA (insieme chiuso, freeText=false)
app-document-line-unit-cell      unità di misura
app-document-line-suggestions    la tendina, condivisa dalle due sopra
```

**Da scrivere:** il markup della griglia (`<colgroup>`, `<thead>`, `<tbody>`). È markup, non
logica, e l'unica ragione per cui non si «estrae» è che ogni documento ha colonne sue.

⭐ **Il piano colonne del banco esiste già**:
`domain/store-sales/models/store-sale-line-columns.config.ts` (`STORE_SALE_LINE_COLUMNS`,
`STORE_SALE_LINE_PRESETS`, `TableViewId.StoreSaleLines`), scritto il 19/08 e **oggi importato da
nessuno**. Dichiara sette colonne e **non dichiara il costo**, che è il modo — l'unico — per non
offrirlo nel selettore.

### 2.8 Quantità — SPECIFICO BANCO

|                | desktop                    | mobile                     |
| -------------- | -------------------------- | -------------------------- |
| Ordine cliente | `<input type=number>` nudo | stepper −/valore/+ in card |
| Banco          | stepper −/valore/+         | (nessuna vista mobile)     |

`11` A15 chiede «digitazione diretta **e** stepper». Lo stepper desktop del banco è la cosa giusta
e **non va persa nell'adozione**: è l'unico punto in cui la maschera di oggi è più avanti del
riferimento.

### 2.9 Prezzo — DA ESTRARRE/GENERALIZZARE, con un forcing da rimuovere

`app-price-mode-menu` vive nella **testata della colonna Prezzo** dell'Ordine cliente, ed è
esattamente dove `11` A4 lo vuole.

⚠️ **Il forcing di B3 è ancora tutto lì, misurato oggi:**

```text
api/src/documents/document-price-mode.util.ts   store_sale/store_return: «sempre ivati»
.claude/rules/regole-gestionale                 esonerati da SALES_PRICE_MODE_TYPES
src/.../store-sale-register.component.ts        conversione ivato↔netto nei metodi, nessun selettore
```

⭐ Le `regole-gestionale` non lo difendono: dicono «**Sulla cassa c'è una revisione in sospeso** …
da rivedere col rifacimento della Vendita al banco, non di straforo». Il rifacimento è adesso, e
`11` A4 (18/08) è la decisione più recente. **Entrare nel contratto comune significa ereditarlo
tutto**, memorie azzerate comprese.

### 2.10 Sconto — ⛔ gap del contratto comune, non del banco

- **di riga**: l'Ordine cliente ha gli sconti a cascata (`"10+5"`, `discount-percent.util`); il
  banco ha una percentuale singola. Adozione, non estrazione.
- **extra documento**: al banco **non esiste**. E nel comune esiste solo la **percentuale** —
  `computeDocumentTotals(lines, documentDiscountPercent, currency)`, un solo parametro.

`11` A16 vuole **due campi, percentuale e importo**, e dice dove va fatto: «dove il contratto
vive», non con un campo locale. Le regole di calcolo (cumulabili o alternativi, ordine,
arrotondamento, castelletto) **non sono decisioni della Vendita al banco** e non hanno ancora un
documento che le ospiti (`DA-FARE.md`).

> ⛔ **Questo è il gap che può bloccare la fase**, ed è l'unico che non si chiude dentro la
> maschera.

### 2.11 IVA — RIUSO DIRETTO ✅

Già condivisi da entrambi: `document-vat.util` (`netFromGrossExact`, `grossFromNetMinor`,
`computeVatLineAmounts`), `VatCodeService`, `isSalesVatCode`, `vatCodeOptionLabel`. L'Ordine
cliente aggiunge `document-vat-options.util` (`vatOptionsIncludingSelected` — l'opzione
disattivata resta visibile finché è quella della riga) e il contratto binario di
`document-line-vat-payload.util`. Il secondo diventa **obbligatorio** appena il banco si risalva:
senza, il risalvataggio rifotograferebbe lo snapshot IVA (`regole-gestionale`, «la riga è una
fotografia»).

### 2.12 Disponibilità — DA ESTRARRE/GENERALIZZARE

Stessa regola («warning non bloccante», `11` A18 e `regole-gestionale`), due implementazioni:

|               | Ordine cliente                                                    | Banco                                       |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| dato          | `VariantSummary` + prenotazioni proprie (`reloadOwnReservations`) | `onHand/committed/available` dentro la riga |
| segnale       | cella `--exceeds` + hint + `collectAvailabilityIssues` + dialogo  | classe riga `--warning` + banner            |
| aggiornamento | `refreshAllLineSummaries`                                         | mai dopo l'inserimento                      |

⚠️ L'Ordine cliente sottrae il **proprio** impegno per non contarsi contro
(`lineEffectiveAvailable`): al banco non serve — la vendita non impegna. È il punto in cui
l'estrazione va tagliata sulla regola, non sul corpo del metodo (`CORE-FORM-DOCUMENTO` §5,
«predicati di riga»).

### 2.13 Colonne e resize — RIUSO DIRETTO ✅

`app-table-column-picker` · `TableColumnPreferenceService` · `TableColumnResizeDirective` ·
`redistributeColumnWidths`. Nulla da estrarre: si dichiara la vista e si usa.

⚠️ `redistributeColumnWidths` sta in
`features/sales-orders/models/column-width-distribution.util.ts` — cioè **dentro una feature**, e
una feature non importa da un'altra (`regole-architettura`). Al primo uso fuori da lì va promosso
in `shared/table-columns/`.

### 2.14 Fuoco e tastiera — RIUSO DIRETTO ✅

`DocumentLineFocusStore`, contratto a **dieci voci**, generico sul tipo del campo. Già in uso da
tre maschere. Il banco ne fornisce sette (nessuna riga «riferimento», quindi `isRowSkipped`
assente) e ha l'insieme di campi più piccolo di tutti.

`11` A19 («l'operatore non deve riposizionare il cursore») è coperto **dentro la riga**. Non è
coperto fra scanner e riga: §3.

### 2.15 Card mobile — RIUSO DIRETTO (forma) + SPECIFICO BANCO (contenuto)

`app-document-line-card` è **la forma condivisa**, già promossa: banda d'avviso, titolo con
elimina e chevron, variante, riga meta, striscia dei valori sempre visibili, corpo a due colonne,
piede. Ha input semplici — **non richiede un FormGroup**.

Il contenuto è per documento: `customer-order-line-card` e `goods-receipt-line-card` sono gemelle
e restano due perché portano campi diversi. **Al banco ne serve una terza**, con quattro imbocchi
soli (Q.tà · Prezzo · Sconto · IVA) più lo SKU nella riga meta (`11` C, 19/08).

⛔ **Oggi il banco non ha nessuna vista mobile.** Gli attributi `data-label` sono nel markup ma
**nessuna regola li usa**: sotto `lg` resta una tabella a sette colonne in scroll orizzontale.

### 2.16 Totali e piede — DA ESTRARRE/GENERALIZZARE

|        | Ordine cliente                                                        | Banco             |
| ------ | --------------------------------------------------------------------- | ----------------- |
| motore | `computeDocumentTotals`                                               | somma locale      |
| voci   | Imponibile righe · Sconto extra · Imponibile · IVA · Totale           | **solo Totale**   |
| forma  | `doc-form__totals-bar` + note + azioni (`_document-form-footer.scss`) | `pos__sticky-bar` |
| mobile | lista verticale in coda al documento                                  | —                 |

`11` A17 chiede il piede comune. È adozione, più il gap dello sconto extra (§2.10).

⚠️ **Il campo Sconto extra deve mostrare `0%` invece di un pulsante che lo rivela**
(`regole-stile-ui` §7, deciso 08/2026): guardando il riepilogo non si deve poter confondere «lo
sconto è zero» con «il campo è chiuso».

### 2.17 Salvataggio e modifica — ⛔ GAP APERTO (G1)

Il piano `11` C0 dà «salvataggio ✅ / riconciliazione per differenza ✅». **È vero dell'API, non
del client**, e le due cose non erano distinte:

```text
API   CreateStoreSaleDto      id? (documento) · lines[].id? · lines[].description? · documentDate?
      CreateStoreReturnDto    id? · lines[].id? · lines[].description? · documentDate? · reason FACOLTATIVA
      (creazione e modifica dallo stesso metodo, come saveGoodsReceipt)

CLIENT  CreateStoreSalePayload   nessun id, né di documento né di riga
        StoreSaleLineInput       variantId · quantity · unitPriceMinor · discountPercent? · vatCodeId?
        concludeSale()           chiama sempre createSale(), anche in modifica
```

**Conseguenza:** risalvare una vendita aperta in modifica **ne crea una seconda**. Il documento di
partenza resta, col suo scarico. È il difetto più grave trovato.

⭐ La forma giusta esiste già e ha un precedente esplicito: `saveGoodsReceipt`, «l'unico altro
documento che sta fuori dal percorso generico e si modifica lo stesso» (commento del DTO).

---

## 3. ⚠️ Verifica speciale — lettore laser HID / keyboard wedge

**Il requisito** (`11` A14 e A22): con il fuoco dentro Quantità, Prezzo, Sconto, Nome o un'altra
cella, una scansione dev'essere **riconosciuta** e il barcode **non deve finire nel campo attivo**.

### Che cosa esiste, misurato

| Percorso                 | Dove           | Come funziona                                                 |
| ------------------------ | -------------- | ------------------------------------------------------------- |
| `quickScan`              | Ordine cliente | `<input>` dedicato in coda alla tabella + `commitQuickScan()` |
| `barcodeScan`            | Arrivo merce   | `<input>` dedicato + dock, `commitBarcodeScan()`              |
| `searchDraft`            | Banco          | `<input>` di ricerca + `onSearchSubmit()` → `commitScan()`    |
| `app-barcode-scanner`    | 6 schermate    | **fotocamera**, non HID                                       |
| `app-order-scan-overlay` | Ordine cliente | **fotocamera** a tutto schermo, scansione continua            |

Le tre righe HID sono la **stessa idea scritta tre volte**, e condividono lo stesso limite: sono
`<input>` che devono **avere il fuoco**. Il codice del lettore va dove sta il cursore.

### ⛔ Il requisito NON è soddisfatto da nessuna parte

```text
ricerca in tutta src/app (esclusi gli spec), 21/08/2026 :

  intercettazioni di tastiera GLOBALI — sei, nessuna riguarda la scansione
    goods-receipt-form.component.ts:3960     @HostListener('window:keydown')      → Ctrl/Cmd+S
    layout/shell-layout.component.ts:88      host: '(window:keydown)'             → Cmd/Ctrl+K
    price-mode-menu.component.ts:45          host: '(document:keydown.escape)'    → close()
    shared/action-menu.component.ts:32       host: '(document:keydown.escape)'    → close()
    shared/date-input.component.ts:46        host: '(document:keydown.escape)'    → close()
    shared/select-menu.component.ts:33       host: '(document:keydown.escape)'    → close()

  document.addEventListener('keydown')   nessuna
  rilevamento a tempo fra i tasti        nessuno
  prefisso/suffisso configurabile        nessuno
```

⛔ **Qui c'era «`@HostListener('window:keydown')`: 1 sola occorrenza», ed era una misura
sbagliata — corretta il 21/08/2026 da un controllo avversariale.** La conclusione non cambia
(nessuno riconosce una battuta da lettore), ma il conteggio sì, e **l'errore era di forma**:
cercare `@HostListener` non trova i listener dichiarati con `host: { … }`, che in questa
codebase sono cinque su sei.

⭐ **E il dettaglio conta per chi implementerà.** `shell-layout.component.ts:88` è già un
keydown di **finestra**, montato sulla shell che avvolge ogni schermata: è la superficie da cui
una futura battuta HID dovrà passare, e l'unico punto dove esiste già un ascolto globale che
non appartiene a una maschera. I quattro `keydown.escape` sono innocui per lo scanner, ma
vanno conosciuti: una cattura globale che non lasci passare Escape spegnerebbe la chiusura di
menu, tendine e calendari in tutta l'app.

**Quindi manca anche nell'Ordine cliente**, e la domanda posta nel prompt ha risposta negativa:
non è un buco del banco da tappare localmente.

⭐ **Non è nemmeno un difetto latente uguale nei tre.** Nell'Ordine cliente la scansione è un gesto
fra i tanti; al banco è **il** gesto, ripetuto tutto il giorno — e il caso «modifico il prezzo, poi
sparo» di A22 lì è la normalità, non un caso limite. La stessa mancanza pesa in modo diverso, ed è
questo che rende il banco il posto giusto da cui far **nascere** la capacità comune, ma **non** il
posto dove farla **vivere**.

### ⭐ Stesso EAN scansionato due volte: la regola è PER MASCHERA — deciso il 21/08/2026

Deciso dal proprietario, e chiude un buco reale: `03` lascia la scansione **fuori dal proprio
perimetro** («lo scanner non usa questo pannello»; «resta alla scansione… è una decisione che
non è stata presa», `03b` §360-366).

| Maschera             | Stesso EAN due volte                          | Oggi                                 |
| -------------------- | --------------------------------------------- | ------------------------------------ |
| **Vendita al banco** | **incremento della riga esistente**           | ✅ già così (`addToCart`)            |
| **Ordine cliente**   | **il proprio contratto attuale** — incremento | ✅ invariato (`applyScannedVariant`) |
| **Arrivo merce**     | ⛔ **nuova riga distinta**                    | ❌ oggi incrementa: **da cambiare**  |

⭐ **La divergenza non è una preferenza: discende dal modello.** La riga dell'Arrivo merce porta
**Lotto**, **Scadenza**, **Seriali** e un **costo unitario** propri
(`goods-receipt-line-columns.config.ts:113-115`, `:76`). Due carichi dello stesso articolo con
lotti o costi diversi **sono due righe**, e fonderli per variante distruggerebbe un dato che la
riga è fatta apposta per portare. Al banco è il contrario: passare due volte lo stesso capo sul
lettore vuol dire «due pezzi», non due righe — e il commento di `addToCart` lo diceva già.

⭐ **E la decisione dissolve un difetto invece di richiedere una correzione a parte.** Il
censimento aveva trovato che nell'Arrivo merce **la prima scansione di un articolo nuovo produce
quantità 2**: `applyScannedVariant` fa sempre `currentQty + quantity` su una riga che nasce già a
1 (`goods-receipt-form.component.ts:3686-3705`). L'Ordine cliente ha lo stesso metodo scritto
bene — sulla riga nuova **imposta** invece di sommare
(`customer-order-form.component.ts:3846-3868`). Passando l'Arrivo merce a «riga nuova sempre»,
il ramo che sommava non esiste più.

⚠️ **Conseguenza sul contratto dello scanner condiviso, ed è la parte che vale oltre questa
decisione:** la capacità comune **non decide che cosa diventa una scansione**. Riconosce la
battuta, la separa dalla digitazione umana e consegna `(quantità, codice)`. Che cosa farne — riga
nuova, incremento, o altro ancora domani — resta **della maschera**, dichiarato nel suo
contratto. È la stessa divisione di `DocumentLineFocusStore`: dentro la classe il meccanismo,
nel contratto ciò che differisce.

⛔ Se la consegna fosse decisa dalla capacità comune, questa tabella diventerebbe un `if` dentro
`domain/` — cioè la cascata di flag che si sta evitando ovunque.

### Dove appartiene

Il rilevamento di una battuta da lettore non è materia di una maschera: è la stessa domanda —
«questa sequenza di tasti viene da una tastiera o da una pistola?» — con la stessa risposta in ogni
documento scanner-first. Sono le tre condizioni che `regole-architettura` chiede per `domain/`: più
feature, logica di dominio, nessuna UI.

La forma coerente col resto del progetto è quella già usata per il fuoco di riga: **una
classe-campo con un contratto fornito dalla maschera**, come `DocumentLineFocusStore` — non un
service globale che deve indovinare chi è attivo.

⛔ **Tre cose da non decidere di straforo**, perché sono decisioni e non dettagli:

1. **la firma della battuta** — soglia di tempo fra i tasti, oppure prefisso/suffisso
   configurabile (`11` A14 «avanzata»), oppure entrambe con la seconda che vince;
2. **che cosa fa il campo attivo** — l'evento si annulla (`preventDefault`) e il campo non vede
   niente, oppure il campo vede e poi si ripulisce. La prima è l'unica che rispetta A22 alla
   lettera;
3. **il perimetro** — se nasce comune, nasce **anche** per Ordine cliente e Arrivo merce, che oggi
   hanno lo stesso buco. Un meccanismo comune acceso in una maschera sola è la quarta variante, non
   l'unificazione.

⚠️ E resta il vincolo di `11` A12: `03` sta unificando le righe documento. La battuta da lettore
**non** è area di `03` (nessuna delle sue voci la nomina), quindi qui non c'è il rischio di
costruire la strada che verrà sostituita — ma il punto di **consegna** della battuta (quale riga si
incrementa, come si torna pronti) sì, e va agganciato ai meccanismi di `03`, non riscritto.

---

## 4. Le quattro categorie — riclassificato il 21/08/2026

⛔ **Questa sezione sostituisce «I gap reali» e «Le decisioni da prendere».** Erano una lista
sola, e mescolava cose che si trattano in modo opposto: una decisione già presa non si ridiscute,
un difetto tecnico non si «decide». La divisione è del proprietario.

### 4.A · DECISO — non si riapre

| Decisione                                                                                                                                                                                             | Dove                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Vendita e Reso al banco hanno una **maschera propria**, non un ramo di `CustomerOrderFormComponent`                                                                                                   | 21/08, questa fase       |
| **Il vecchio `pos` non evolve in parallelo**: resta intatto finché il nuovo percorso non lo sostituisce integralmente, poi si elimina in blocco (passo 13)                                            | 21/08, questa fase       |
| Vendita e Reso **condividono** quella maschera; il tipo viene dalla **rotta**                                                                                                                         | 21/08 · `11` A3          |
| La modalità è un **descrittore discriminato**, non booleani sparsi né due famiglie di signal                                                                                                          | 21/08                    |
| Un solo modello di riga · una collezione · una ricerca/scansione · gli stessi totali · un solo stato di salvataggio                                                                                   | 21/08                    |
| **Un solo percorso client** ≠ un solo endpoint: sotto, la modalità delega al contratto backend corretto                                                                                               | 21/08                    |
| Vendita e Reso conclusi si **riaprono, modificano, risalvano ed eliminano**; l'eliminazione neutralizza gli effetti                                                                                   | `11` A2                  |
| L'azione finale dice **«Concludi vendita» / «Concludi reso»**                                                                                                                                         | `11` A17                 |
| **Numerazione comune completa**, proposta visibile prima del primo salvataggio compresa                                                                                                               | 21/08 · `11` A5          |
| **Sconto extra: percentuale + importo.** Aperte solo le regole di calcolo                                                                                                                             | `11` A16 · `DA-FARE` §12 |
| Netto/ivato: **contratto comune**, selettore nella testata della colonna Prezzo                                                                                                                       | `11` A4                  |
| **Una scansione non contamina mai il campo attivo**                                                                                                                                                   | `11` A14 · A22           |
| Stesso EAN: **banco incrementa · Ordine cliente il proprio contratto · Arrivo merce riga nuova**                                                                                                      | 21/08 · §3               |
| **Una scansione normale vale quantità 1.** Una quantità diversa deriva SOLO da una sintassi esplicitamente supportata (es. moltiplicatore in prefisso) — mai da un conteggio implicito di ripetizioni | 21/08 · §3               |
| **Includi/Genera non si riapre**: la matrice è in `12`, Proforma compresa                                                                                                                             | `12` · `11` A7           |
| Clic di riga → **Modifica**; il Dettaglio ha il suo pulsante                                                                                                                                          | `14` §2                  |

### 4.B · COMPORTAMENTO OSSERVATO — è così oggi, e va sostituito

Non sono difetti da correggere sul ramo `pos`: sono lo **stato di partenza** che la maschera
nuova rimpiazza. ⛔ Nessuno di questi giustifica un intervento cosmetico sul vecchio.

| #   | Oggi                                                                                                          | Evidenza                                                            |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| O1  | Nel **Reso non si possono aggiungere righe**: ricerca e scanner stanno dentro `@if (mode() === 'sale')`       | `store-sale-register.component.html:90`                             |
| O2  | **«Modifica reso» apre vuoto**: `patchFromDocument` scrive solo in `cart`, il ramo reso legge `returnLines()` | `store-sale-register.component.ts:373-392`                          |
| O3  | **Diciassette signal in due famiglie parallele** e due percorsi di salvataggio                                | `:469-507` · `:1101` · `:1202`                                      |
| O4  | **Nessuna vista mobile**: `data-label` nel markup, nessuna regola che li usi, nessun `media-down`             | `store-sale-register.component.scss` (6 `media-up`, 0 `media-down`) |
| O5  | **Nessun campo Numero/Serie**: il numero arriva dopo, dentro `lastSaleResult.reference`                       | `:1115-1150`                                                        |
| O6  | **Nessuno sconto extra**, in nessuno strato — né UI, né DTO, né calcolo                                       | —                                                                   |
| O7  | **Il piede mostra solo il Totale**: niente imponibile, IVA, sconto                                            | `…html:365-380`                                                     |
| O8  | Il **Reso dice «Registra reso»** e l'uscita usa una terza coppia, «Salva e chiudi» / «Registra e chiudi»      | `…html:517` · `:591`                                                |
| O9  | La **causale del Reso è obbligatoria in UI**, facoltativa nell'API                                            | `:522` vs DTO `@IsOptional()`                                       |
| O10 | Terminologia legacy: intestazione **«Vendita origine»**, conferma che parla di «merce vendibile»              | `…html:408` · `:1207-1211`                                          |
| O11 | 639 righe di `pos__*`, **zero classi `doc-form`, zero celle `app-document-line-*`**                           | misurato                                                            |
| O12 | `isEditMode` **dichiarato e mai usato**; `loadedDocument` scritto e mai letto                                 | `:317-318` · `:394`                                                 |

⚠️ **E fuori dal banco, tre osservazioni che riguardano ciò che si sta per riusare:**

| #   | Oggi                                                                                                                                                             | Dove                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| O13 | **Arrivo merce: la prima scansione di un articolo nuovo produce quantità 2** (`currentQty + quantity`)                                                           | `goods-receipt-form.component.ts:3686-3705` |
| O14 | **Ordine cliente: `enableMobileScanKeyboard()` e `mobileScanEditing` sono codice morto** — nessun template                                                       | verificato su tutta `src/`                  |
| O15 | I percorsi di scansione di **Ordine cliente e Arrivo merce non hanno un solo test**, e il doppio di `parseScanInput` restituisce una stringa invece dell'oggetto | spec OC                                     |

⭐ **O13 si estingue con la decisione EAN** (§3): passando l'Arrivo merce a «riga nuova sempre»,
il ramo che sommava non esiste più. Non è una correzione a parte.

### 4.C · GAP TECNICO — si chiude scrivendo codice, non decidendo

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                  | Dove si chiude                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Il client non manda mai `id` di documento né di riga**: `concludeSale/Return` chiamano sempre `create…`                                                                                                                                                                                                                                                            | `store-sales.service.ts` (client) + `store-sale.model.ts`                                                                                                                                                                           |
| T2  | Campi che l'API accetta e il client non ha: `documentDate`, `causale`, `lines[].description`, `lines[].discountPercent` (reso)                                                                                                                                                                                                                                       | stesso posto                                                                                                                                                                                                                        |
| T3  | **`vatCodeId` non esiste nel DTO del Reso**: il servizio chiama sempre `resolveLineVatCode(null, …)`                                                                                                                                                                                                                                                                 | `api/.../create-store-return.dto.ts` + `:431` · `:491`                                                                                                                                                                              |
| T4  | **Un reso senza prezzo vale zero in silenzio**: `line.unitPriceMinor ?? 0`                                                                                                                                                                                                                                                                                           | `api/.../store-sales.service.ts:483`                                                                                                                                                                                                |
| T5  | **Netto/ivato forzato in quattro punti**: `costEntryMode:'vat_excluded'` (197, 499) · `pricesIncludeVat:true` (294, 597)                                                                                                                                                                                                                                             | `api/.../store-sales.service.ts` + `document-price-mode.util.ts`                                                                                                                                                                    |
| T6  | **Lo scope di sede è verificato solo su `dto.locationId`**, mai su quella del documento esistente → la merce si sposta. ⛔ Non è solo un dato che si disallinea: un operatore autorizzato SOLO sulla sede A potrebbe prendere un documento della sede B e «portarlo» in A modificandone la location, aggirando il gate che oggi controlla solo il valore in ingresso | `:106` · `:418`; `loadEditableStoreDocument` non seleziona nemmeno `locationId`. **Va verificata l'autorizzazione su ENTRAMBE**: la sede del documento esistente e quella nuova richiesta                                           |
| T7  | **`store-sales` è l'unico percorso numerato senza payload di conflitto**: un `P2002` degrada a **500**                                                                                                                                                                                                                                                               | `store-sales.service.ts` + `all-exceptions.filter.ts`                                                                                                                                                                               |
| T8  | Per il banco la **serie ignora la sede** e il **numero ignora la data documento**, benché entrambe siano disponibili                                                                                                                                                                                                                                                 | `:113-118` · `defaultCounterSeries`                                                                                                                                                                                                 |
| T9  | **Eliminazione**: `FLOW_ONLY` è solo il primo di **tre** cancelli — restano il gate di stato (`confirmed`) e l'assenza dai tipi che stornano                                                                                                                                                                                                                         | `documents.service.ts:2890-2946`                                                                                                                                                                                                    |
| T10 | **14 effetti da neutralizzare** all'eliminazione, quattro bloccanti (movimenti · giacenze · gate · storno)                                                                                                                                                                                                                                                           | censimento `FLOW_ONLY`                                                                                                                                                                                                              |
| T11 | I due specchi frontend del divieto hanno **nove punti d'uso**, non quattro; due non c'entrano con l'eliminazione                                                                                                                                                                                                                                                     | `isStoreFlowDocumentType`                                                                                                                                                                                                           |
| T12 | `document-table.component.ts:216-221` etichetta la voce **«Apri»** con un commento che dice «mai una modifica» — testo rimasto indietro rispetto a `14` §2                                                                                                                                                                                                           | frontend elenchi                                                                                                                                                                                                                    |
| T13 | **`redistributeColumnWidths` sta dentro una feature** (`features/sales-orders/models/`): una feature non importa da un'altra                                                                                                                                                                                                                                         | promozione a `shared/table-columns/`                                                                                                                                                                                                |
| T14 | **Battuta HID non riconosciuta in nessuna delle tre maschere**                                                                                                                                                                                                                                                                                                       | nuova capacità comune (§3)                                                                                                                                                                                                          |
| T15 | ⛔ **Idempotenza della creazione**: se il commit riesce ma la risposta si perde (timeout client, rete), oggi nulla impedisce all'operatore di ripremere e creare un secondo documento identico. Nessuna chiave lato client, nessun `retry()`. Stesso difetto generale misurato per l'Arrivo merce                                                                    | `docs/13-specifica-prestazioni-salvataggio.md` §11 — la tecnica proposta (claim idempotente `createMany({skipDuplicates:true})` dentro la stessa transazione, sul modello di `OnlineOrderEvent`) è del motore comune, non del banco |

⚠️ **T9/T10 hanno un modello che è a sua volta incompleto.** L'eliminazione dell'Arrivo merce
ripristina le giacenze ma **non inverte** `applySupplierPriceUpdates` (riscrive
`ProductVariant.purchasePriceMinor`) né `applyInventoryLotsFromDocumentLines` (gonfia
`InventoryLot.quantity`). Copiarlo così erediterebbe il difetto.

⚠️ **Il contratto snapshot non riguarda solo l'IVA.** `regole-gestionale` («la riga è una
fotografia») si applica allo stesso modo a **prezzo** e **descrizione** su una riga GIÀ
esistente: se non modificati esplicitamente dall'operatore, il risalvataggio deve conservare i
valori persistiti, non rifotografarli. T4 (`?? 0` sul prezzo del Reso) è il sintomo peggiore —
un prezzo mancante non deve mai diventare zero — ma il contratto binario va esteso a
`description` quanto lo è già, per l'IVA, a `vatCodeId` (`document-line-vat-payload.util`, §2.11).
Va verificato insieme a T1/T2: appena il client impara a mandare gli id di riga, deve imparare
anche a **non mandare** i campi non toccati, non a mandarli sempre con un valore ricalcolato.

⚠️ **`costEntryMode` / `enteredUnitCostMinor`: nome improprio, verificato il 21/08.** Il grep
sui consumer mostra che i due campi non sono confinati ai costi d'acquisto:
`store-sales.service.ts:197,499` li forza a `'vat_excluded'` per calcolare il **prezzo di
vendita** della riga, non un costo. Il nome dichiara «costo», il contratto è già generico
(qualunque importo unitario netto/ivato). ⛔ **Prima di togliere il forcing (T5), censire TUTTI
i consumer** di `document-vat.util` che leggono questi due campi — non solo store-sales — e
generalizzare il nome **solo se** il contratto è davvero lo stesso per costi e prezzi di
vendita in ognuno. Se anche un solo consumer avesse una semantica diversa dietro lo stesso nome,
la correzione è distinguere i due contratti, non forzarli a uno. **Nessuna utility parallela
locale al banco**: se il contratto è comune, il fix vive dove vive `document-vat.util`.

### 4.D · VERA DECISIONE TRASVERSALE APERTA — non si chiude scrivendo codice

⛔ **Riclassificato il 21/08/2026: era UNA sola, non tre.** D2 e D3 erano registrate qui come
«decisioni funzionali aperte». Non lo sono: **confondevano un requisito già deciso con
l'implementazione tecnica che lo realizza.** Una decisione funzionale si prende con un
documento; una misura tecnica si prende con uno strumento in mano. Sono andate in §4.E.

| #   | Aperta                                                                                                                                 | Perché è del motore, non del banco                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1  | **Regole di calcolo dello sconto extra a importo**: cumulabile o alternativo alla %, ordine, arrotondamento, più aliquote, castelletto | La risposta deve valere **identica su ogni documento**. `DA-FARE.md` la ospita, nessuna specifica la governa |

⛔ **D1 ha una contraddizione documentale da dirimere prima**, e non è del banco:

```text
15/08  «solo percentuale, nessun campo in euro, nessuna migration»
       07 §8 · 06b §A.4-bis · QUADRO-DECISIONI-FATTURE riga 24
18/08  «un campo PERCENTUALE e un campo IMPORTO»
       11 A16 · DA-FARE §12 · DA-FARE §banda-unica
```

Per il metodo di `00` vince il **18/08**, ed è **già vigente**, non da rimettere in discussione:
la presenza dei due campi percentuale + importo è decisa; restano aperte solo le regole di
calcolo (D1 sopra). I tre documenti del 15/08 appartengono alla famiglia Fattura, governata da
`feature/fattura-elettronica`: **non si correggono su questo ramo**, per non aprire un conflitto
documentale che quel ramo dovrebbe poi riconciliare. ⛔ **Vanno segnalati esplicitamente**: i tre
testi del 15/08 sono superati e **da sostituire, non da interpretare**, quando `feature/fattura-elettronica`
verrà riallineato. La verifica che la contraddizione sia sparita si fa allora, non ora.

### 4.E · MISURE E PROGETTAZIONI TECNICHE PENDENTI — non decisioni, requisiti già presi

Il requisito che le governa è **già deciso** ed è in 4.A: «una scansione non contamina mai il
campo attivo». Quello che resta è **come** realizzarlo, e su due punti non si può scegliere a
tavolino.

| #   | Pendente                                                                                                                                                           | Come si chiude                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **La firma della battuta da lettore**: soglia a tempo fra i tasti, oppure prefisso/suffisso configurabile, oppure entrambe                                         | ⛔ **Con un lettore vero in mano**, non a tavolino. Vale per Ordine cliente e Arrivo merce quanto per il banco — è E-8/§3                                 |
| M2  | **Il meccanismo con cui il campo attivo resta integro**: l'evento si annulla (`preventDefault`, il campo non vede niente) oppure il campo vede e si ripulisce dopo | Scelta di implementazione della capacità comune (E-8): la prima rispetta A22 alla lettera senza dipendere da un ripulisci successivo che potrebbe fallire |

⚠️ **Perché la distinzione conta per l'ordine di lavoro**: M1 e M2 **non bloccano** l'inizio
della costruzione della nuova maschera. Bloccano solo E-8 (la capacità di scansione HID), che
è già l'ultimo passo del piano (§8, passo 15) — dopo la maschera e dopo l'eliminazione.
Vendita/Reso possono nascere e funzionare con la ricerca/scansione **di oggi** (input dedicato),
e adottare la capacità comune quando M1 è misurata.

---

## 5. Le estrazioni proposte

⛔ **Nessuna è proposta per omonimia.** Il residuo è stato classificato leggendo i contratti veri
in Ordine cliente, Arrivo merce e Ordine fornitore, con un contro-esame avversariale su ogni voce.
Esito su **96 voci**:

```text
42  ORCHESTRAZIONE DELLA MASCHERA   restano dove sono, anche se omonime
33  DAVVERO COMUNE                  candidate all'estrazione
15  GIA COMUNE                      si riusano, niente da fare
 3  DOMINIO ORDINE CLIENTE          non passano al banco
 3  LEGACY BANCO                    si eliminano col percorso nuovo
```

⭐ **Il rapporto è il risultato che conta: due voci su cinque restano nella maschera.** Il
sospetto di partenza — 610 righe di residuo da estrarre — era gonfiato, ed è la conferma sul
campo di `CORE-FORM-DOCUMENTO` §5.

### 5.1 Da estrarre — in ordine di valore, misurato in fonti di verità eliminate

| Pezzo                                                                                                                                                                                                                      | Da → a                                                                                                | Consumer                                                                                                  | Perché                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E-1 · Motore larghezze colonne** — `lineColumnPx` · `lineColumnsTotalPx` · `lineColumnWidth` · `lineColumnMinWidth` · `lineIndexColumnWidth` · `onLineColumnResizing` · `onLineColumnResize` · `redistributeLineColumns` | 6 maschere → `shared/table-columns/`                                                                  | banco, Ordine cliente + famiglia, Ordine fornitore, Fatture/Proforma, Rettifica/Inventario, Trasferimento | Meccanismo **unico e indivisibile** (px salvati → somma delle visibili → quota %). Quattro maschere sono ferme a una variante **senza clamp**; l'Arrivo merce restituisce ancora `px` invece della quota. Estrarre **corregge tutte in un colpo** |
|                                                                                                                                                                                                                            | ⛔ **prerequisito**: promuovere `column-width-distribution.util.ts` fuori da `features/sales-orders/` | —                                                                                                         | T13: una feature non importa da un'altra. Il banco non può usarlo dov'è                                                                                                                                                                           |
| **E-2 · `applyLineSort` + riordino righe** — e il contro-esame l'ha **allargato**: la stessa funzione copre anche `onLineDrop`                                                                                             | 6 maschere → `domain/documents/utils/`                                                                | le stesse sei + banco                                                                                     | Sei corpi identici riga per riga. Il `clear()` + push **degli stessi controlli** conserva l'identità della riga: riscriverlo perderebbe lo stato «toccato/sporco»                                                                                 |
| **E-3 · `lineSortAriaLabel`** — la frase accessibile                                                                                                                                                                       | 6 maschere **+ il motore elenchi** → `shared/`                                                        | le sei maschere righe, `data-table`, banco                                                                | **Sette copie di un testo.** Un testo divergente non lo trova nessun test. ⚠️ Scoperto strada facendo: `aria-sort` c'è **solo** nel motore elenchi — chi ascolta non sa che le righe documento sono ordinate                                      |
| **E-4 · Il `<th>` con il pulsante di ordinamento** (markup)                                                                                                                                                                | 6 maschere → `domain/documents/components/`                                                           | le sei + banco                                                                                            | È lì la duplicazione vera del cluster. ⛔ Non in `shared/`: il ciclo dei versi è **due** stati nelle righe e **tre** negli elenchi — divergenza deliberata e argomentata                                                                          |
| **E-5 · Stato del pannello di ricerca in riga** — `closeLineProductSearch` · `onProductSearchCreate` · `onProductSearchDetail`                                                                                             | 3 maschere → `domain/documents/state/`                                                                | Ordine cliente + famiglia, Arrivo merce, Ordine fornitore, banco                                          | Gemello di `DocumentProductPanelStore`, che il 2/08 ha già risolto lo stato **del pannello prodotto**: la scelta «store» è già stata presa, questa è la sua metà mancante                                                                         |
| **E-6 · Giro dei contatori** — `refreshNumberProposal` + `onSeriesManagerClosed`, **mai separati**                                                                                                                         | 7 maschere → `domain/documents/state/`                                                                | le sette + banco                                                                                          | Due modi (riproponi / ricarica) della **stessa** operazione. ⚠️ Comporta **una decisione**: lo store oggi non ha dipendenze, e per fare il giro da sé dovrebbe ricevere `DocumentCountersService`                                                 |
| **E-7 · `acknowledgeConflictNumber`**                                                                                                                                                                                      | 7 maschere → `domain/documents/state/`                                                                | le sette + banco                                                                                          | L'estrazione **più piccola e più indipendente**: niente HTTP, niente contratto di numerazione. La divergenza (ordine fra `markNumberDirty` e `setNumber`) **c'è già stata** in questi stessi gestori                                              |
| **E-8 · Capacità di scansione HID**                                                                                                                                                                                        | nuova → `domain/documents/`                                                                           | banco, Ordine cliente, Arrivo merce                                                                       | §3. ⛔ Vincolata a **M1 e M2** (§4.E, misure tecniche non decisioni): si progetta il contratto, non si sceglie una soglia a tavolino                                                                                                              |

### 5.2 ⛔ Quattro voci che il contro-esame ha tolto o cambiato

Sono la prova che il contro-esame serviva.

| Voce                  | Prima                          | Dopo il contro-esame                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lineHasDiscount`     | GIÀ COMUNE, delegatore         | ⛔ Il **parser** è uno solo, ma un piano sotto la **persistenza dello sconto diverge**: è una decisione aperta, non un'estrazione                                                                                                                      |
| `lineUnitOfMeasure`   | DAVVERO COMUNE (91%)           | ⛔ **Allineamento prima, non estrazione.** I due lettori sono identici, ma la regola che entrambi i commenti dichiarano — «il documento è una fotografia» — è applicata da **uno solo**: l'Ordine cliente **sovrascrive sempre** l'unità dall'articolo |
| `isLineColumnVisible` | ORCHESTRAZIONE                 | **Mista**: il gate per documento resta orchestrazione, ma il gate su **flag tenant** è una regola duplicata **e già divergente** — va dichiarata come dato sulla colonna                                                                               |
| `confirmLineSort`     | GIÀ COMUNE, innesto di 2 righe | ⛔ L'innesto **non c'è** in una delle sei: `sales-document-form` dichiara il metodo e **nessun template lo chiama**. Un innesto dimenticabile va reso non dimenticabile                                                                                |

⭐ E `notifyAssignedNumberChanged` è stato **confermato** DAVVERO COMUNE ma con una **terza**
divergenza non rilevata dal censimento: il booleano «era una proposta?» arriva da due fonti non
equivalenti. Va deciso **prima** di estrarre, o l'estrazione ne sceglie una in silenzio.

### 5.3 ⛔ Le otto non sono otto refactor — riclassificato il 21/08/2026

**Criterio, dato dal proprietario**: bloccante è ciò che, non estratto, o costringe a una
dipendenza feature→feature illegale, o costringe il banco a scrivere una N-esima copia di una
fonte di verità già duplicata altrove. Tutto il resto è un miglioramento trasversale — reale,
ma rinviabile senza costo per la nuova maschera.

**Verificato prima di classificare** (non dedotto dai nomi): `STORE_SALE_LINE_COLUMNS`
(`domain/store-sales/models/store-sale-line-columns.config.ts`) non dichiara **nessuna** colonna
`sortable`, su nessuna delle sette colonne — e §6 conferma che il riordino manuale (`CdkDropList`)
non è previsto al banco («l'ordine è quello di scansione»). Il banco oggi (`store-sale-register.component.ts`)
non ha **nessuna** occorrenza di `onLineProductFocus`/`openLineProductSearch`/`onProductSearchCreate`/
`onProductSearchDetail`/`closeLineProductSearch`.

| Pezzo                                      | Classificazione                                                       | Perché                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E-1** motore larghezze colonne + T13     | ⛔ **BLOCCANTE**                                                      | Il banco usa colonne ridimensionabili (§2.13, RIUSO DIRETTO). `redistributeColumnWidths` vive dentro `features/sales-orders/` — usarlo da lì è un import cross-feature vietato da `regole-architettura`. Senza promozione a `shared/table-columns/`, il banco non ha una via legale per il ridimensionamento                                                                                      |
| **E-2** `applyLineSort` + `onLineDrop`     | ✅ **RINVIABILE**                                                     | Il banco **non ordina per colonna** (nessun `sortable` dichiarato) e **non riordina a mano** (§6: «l'ordine è quello di scansione»). Zero bisogno diretto: è pulizia delle altre sei maschere, non un prerequisito di questa                                                                                                                                                                      |
| **E-3** frase accessibile dell'ordinamento | ✅ **RINVIABILE**                                                     | Conseguenza diretta di E-2: senza colonne ordinabili, non c'è `aria-sort` da annunciare                                                                                                                                                                                                                                                                                                           |
| **E-4** `<th>` ordinabile (markup)         | ✅ **RINVIABILE**                                                     | Stessa ragione di E-2/E-3                                                                                                                                                                                                                                                                                                                                                                         |
| **E-5** stato ricerca prodotto in riga     | ⚠️ **NÉ L'UNO NÉ L'ALTRO — legato al passo 9, non a un prerequisito** | `app-document-line-product-cell` (che il banco riusa, §2.7) porta di suo l'«apertura ricerca»: nel momento in cui il passo 9 monta quella cella, la maschera deve gestire l'evento — o con lo store condiviso, o con una quarta copia locale. Non serve **prima** di iniziare (passi 0-7), serve **dentro** la costruzione della griglia righe: va fatto insieme al passo 9, non spostato a "poi" |
| **E-6** giro dei contatori                 | ⛔ **BLOCCANTE**                                                      | La numerazione comune con proposta è **decisa, non opzionale** (4.A, `11` A5). Senza estrarre, il banco duplicherebbe l'unico pezzo che manca — «riproponi/ricarica» — creando l'ottava copia di qualcosa già confermato comune a sette                                                                                                                                                           |
| **E-7** `acknowledgeConflictNumber`        | ⛔ **BLOCCANTE**                                                      | Diretta conseguenza di T7, già in cima alla lista di priorità del proprietario («conflitto numerazione»). Piccola e indipendente: nessuna ragione di rinviarla                                                                                                                                                                                                                                    |
| **E-8** capacità di scansione HID          | ✅ **RINVIABILE, per costruzione**                                    | Vincolata a M1 (misura con lettore vero, §4.E): non è rinviabile per pigrizia, è **impossibile da chiudere prima** di avere lo strumento in mano. Il piano la mette già per ultima (§8, passo 15)                                                                                                                                                                                                 |

> **Risultato: 3 bloccanti su 8 (E-1, E-6, E-7), non 8.** E-5 non è né l'uno né l'altro: è
> lavoro ordinario del passo 9, non una fase a parte. E-2/E-3/E-4 restano candidati validi — il
> contro-esame li aveva scritti bene — ma il banco può nascere e vivere senza di loro.

---

## 6. Che cosa resta specifico dell'Ordine cliente

Non passa al banco, e non entra in nessuna estrazione.

```text
DOMINIO         impegni di magazzino · stati dell'ordine (stateOptions, manualOrderState)
                evasione e ordini parziali (computePartialOrders, forceConcludeOrders)
                «Includi» / «Genera» · conversioni · duplicazione da documento
                trasporto e indirizzi (DDT vendita) · listini (document-listino.util)
ORCHESTRAZIONE  createLine · addLine · removeLine · requestRemoveLine
                openLineProductSearch · onLineProductSearchPick
                onProductCreatedFromPanel · onProductUpdatedFromPanel · attachPendingVariantToLine
                toggleLineSort · lineSortValue · lineSortKinds · isLineColumnSortable
                requestSaveDocument · patchFormFromOrder · canDeactivate · cancel
SOLO SUO        lineSortDisabledReason · lineSortAvailable
                le righe «documento collegato» (isReference, colspan, identityColumnCount)
                il riordino manuale delle righe (CdkDropList) — al banco l'ordine è quello di scansione
```

⚠️ **`createLine` è il caso da capire, perché sembra il candidato più ovvio e non lo è.** I nomi
divergono nel campo più basilare: la quantità si chiama `quantity` in Ordine cliente e Arrivo
merce, `orderedQuantity` in Ordine fornitore; l'Ordine fornitore richiede `variantId`, gli altri
due no. Fonderli richiederebbe di passare la forma dall'esterno — cioè un'API più grande del
corpo che sostituisce.

---

## 7. Che cosa resta specifico di Vendita/Reso

### 7.1 Il descrittore di modalità — dove vivono TUTTE le differenze

⛔ **Un descrittore discriminato, non booleani.** Le sei voci che il proprietario ha nominato:

```text
etichette e titolo          «Nuova vendita al banco» / «Nuovo reso al banco»
                            azione finale: «Concludi vendita» / «Concludi reso»
verso economico             vendita positiva  /  rettifica negativa
effetto fisico              scarico alla conclusione  /  rientro secondo la spunta di riga
«Carica giacenze»           assente (sempre vero)  /  spunta per riga, esposta
campi propri                pagamento (vendita)  ·  causale (reso)
```

⭐ **E il descrittore non decide quali campi esistono: decide quali colonne comuni si espongono.**
È la scoperta che rende la forma sostenibile — vedi 7.2.

### 7.2 ⭐ Il modello di riga PERSISTITO è già uno solo

**`DocumentLine` è la stessa tabella per Vendita e Reso: nessun campo esiste per l'una e non per
l'altra.** A livello di dati non c'è niente da unificare.

Le asimmetrie stanno nel **DTO d'ingresso**, e due delle tre si sciolgono guardando dove il dato
atterra:

| Sembra specifico del Reso             | Atterra su                                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `restockable` — «Carica giacenze»     | `DocumentLine.loadsStock`, **campo comune**. Sulla Vendita è forzato `true` e non si mostra     |
| `causale`                             | `Document.causalText` + `causalGenerationMode`, **colonne comuni**, già usate dall'Arrivo merce |
| `paymentMethod` / `paymentMethodNote` | colonne comuni del documento, esposte dalla Vendita e non dal Reso                              |

**Restano due asimmetrie vere, ed entrambe sono difetti (T3, T4), non forma del dominio:**

```text
Vendita   id? · variantId · quantity · unitPriceMinor  · discountPercent? · description? · vatCodeId?
Reso      id? · variantId · quantity · unitPriceMinor? · discountPercent? · description? · restockable
                                                    ↑                                      ↑
                                        opzionale, e «?? 0»            nessun vatCodeId in ingresso
```

> **Risposta alla domanda: sì, il modello di riga unico regge nei dati persistiti.** L'unico
> campo che deve restare **per-riga e specifico nell'esposizione** è `loadsStock` — che però
> esiste già su ogni riga documento. `vatCodeId` e `unitPriceMinor` **devono diventare simmetrici**:
> oggi non lo sono per difetto.

### 7.3 Il resto

```text
TENUTO DAL BANCO   lo stepper quantità sul desktop (l'Ordine cliente ce l'ha solo su card)
                   LocationContextService + isFixedSingleStore (sede unica come etichetta)
                   il beep di esito — che le altre due maschere non hanno
LEGACY, SI ELIMINA CartLine / carrello · il collegamento alla vendita origine del Reso
                   la distinzione «vendibile / non vendibile» · l'intero foglio pos__*
                   openQuickProductCreate (prefill da codice non risolto, non da riga)
```

---

## 8. Ordine di implementazione — **con lo stato al 21/08 sera**

⛔ **Non è un elenco di attività: è un ordine di dipendenza.** Ogni passo lascia l'albero in uno
stato valido e verificabile.

> ⭐ **I passi 0-7-bis sono CHIUSI**, con una sola eccezione dichiarata nel passo 3. Il testo
> originale di ciascuno è conservato sotto perché dice _perché_ quel passo esisteva — ma **non è
> più un lavoro da fare**. Il primo passo aperto è l'**8**.

```text
✅ 1 · T13         chiuso — 73c1fd49
✅ 2 · E-1         chiuso — 2412719d       (E-2/E-3/E-4 restano rinviabili, come già scritto)
⚠️ 3 · E-6 · E-7   PARZIALE: il lato SERVER è chiuso (T7B, 0e49cd21).
                   Il lato CLIENT — DocumentNumberField, DocumentNumberingStore,
                   DocumentCountersService.available — è T8B, e si fa DENTRO la
                   maschera nuova. ⛔ Non sulla vecchia pos.
✅ 4 · T1 + T2     chiuso — 7fd05142
✅ 5 · T3 + T4     chiuso — 52a25b71 · ea9d029d
✅ 6 · T6          chiuso — 4f537d0c
✅ 7 · T7 + T8A    chiuso — 0591624c · 0e49cd21 · 5318af8f
✅ 7-bis · T15     chiuso — 7bf89c0c · 3f149123 · 0ff13421
                   ⚠️ NON sul modello OnlineOrderEvent, come questo documento
                   ipotizzava: quel contratto deduplica EVENTI OSSERVATI con
                   identificativi esterni, e non regge un INTENTO DI SCRITTURA.
                   È nato un registro proprio (`creation_intents`) — la
                   dimostrazione sta in T15 §2.
⚠️ 8 · scheletro   PARZIALE — fatto il 21/08 (sera): descrittore di modalità,
                   UN modello di riga con i due payload, testata (sede ·
                   cliente · data) con pannello mobile, gate + stato vuoto,
                   caricamento per id, salvataggio create/update con l'intento
                   T15. ⛔ NON montata su nessuna rotta, per decisione del
                   proprietario: si monta quando avrà anche le righe.
                   Ricerca, scansione e aggiunta riga sono passate al passo 9,
                   con la griglia, per non scrivere markup provvisorio.
✅ 8-bis · E-5     chiuso — stato del pannello di ricerca in riga estratto in
                   `domain/documents/state/`, tre maschere migrate.
✅ 9 · righe       chiuso — griglia sulle celle comuni, STORE_SALE_LINE_COLUMNS
                   in uso, colonne e larghezze dal motore comune, spunta di
                   magazzino fissa, porta d'ingresso (ricerca + scansione),
                   avviso disponibilità. ⛔ Sempre NON montata su rotta.
✅ 10 · netto/ivato ASSORBITO nel passo 9 (decisione del proprietario,
                   21/08/2026): il selettore vive nella testata della colonna
                   Prezzo, quindi nasce con la colonna — `11` A4 lo diceva già,
                   «è parte della costruzione della tabella righe». Con lui è
                   entrato T5, il forcing «sempre ivato» lato server.
⛔ 11 …            DA QUI IN POI, TUTTO APERTO.
```

### Il confine del primo blocco — 21/08/2026

⛔ **Il passo 8 è stato ristretto a ciò che non produce markup da buttare.** La griglia
righe è del passo 9, e con lei la porta d'ingresso (ricerca e scansione), che vive
attaccata alla griglia: farla prima avrebbe voluto dire una resa provvisoria delle righe,
poi sostituita.

### ⛔ Quattro decisioni ricavate dal CODICE, e ritirate il 21/08/2026

Il primo blocco ne ha prodotte quattro, e il proprietario le ha ritirate lo stesso giorno. La
regola che ne discende vale per tutti i passi seguenti:

> **La fonte funzionale è la sezione A di `docs/11`.** Le sezioni B, questa mappa e il codice
> servono a individuare il gap e il modo di implementarlo, **non a cambiare A**. Ciò che non è
> scritto in A e non è stato confermato dal proprietario non si decide: si ferma come aperto.

| Ricavata dal codice                  | Perché era sbagliata                                                                                                                                                        | Ora                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Data in sola lettura in modifica** | il servizio ignorava `documentDate` in update, e da quel **comportamento osservato** è nata una regola di interfaccia. Un difetto del salvataggio si corregge, non si veste | `11` **A13**: default oggi, modificabile, caricata; il servizio la persiste senza rinumerare                                           |
| **Cliente solo sulla Vendita**       | dedotta dall'assenza di `customerId` nel DTO del Reso: un **gap tecnico** letto come regola                                                                                 | `11` **A13**: facoltativo su entrambi. DTO, servizio e client riallineati                                                              |
| **Sede unica come etichetta**        | ereditata dalla maschera legacy: un default che diventava una natura diversa del campo                                                                                      | `11` **A13**: controllo comune. Assegnata → esce di default; altrimenti si sceglie, e il gate blocca                                   |
| **`cash` come metodo predefinito**   | il DTO lo pretendeva — eredità della vecchia cassa — e da un vincolo tecnico è nato un dato che nessuno aveva scelto                                                        | `11` **A8**: pagamenti **differiti** al blocco Pagamenti/Tesoreria. Il DTO non lo pretende più, e l'assenza conserva il valore storico |

⭐ **E una quinta, di segno opposto, corretta dopo la misura**: il movimento di scarico
riallineava `createdAt` alla data documento corretta. `documentDate` e `createdAt` sono due
informazioni diverse (`11` A13) — un documento datato 19 e registrato il 21 è legittimo, ed è
il dato che riconosce un inserimento retrodatato. Il riallineamento è stato **ritirato**.

⏸ **Divergenza dichiarata e non risolta**: il motore di **carico** (Reso, Arrivo merce)
riallinea `createdAt` da prima di questo lavoro, quello di **scarico** ora no. Uniformarli
tocca l'Arrivo merce: è una decisione a sé, e non si prende di straforo.

⭐ **Ciò che invece è implementazione, non decisione**: note e causale viaggiano nel payload
pur non avendo ancora un campo. Il server riscrive la testata da ciò che riceve
(`notes: dto.notes?.trim() || null`), quindi ometterle **cancellerebbe** i valori a ogni
risalvataggio. Il pagamento no: lì la protezione è nel servizio, che senza metodo dichiarato
conserva quello persistito.

⚠️ **Un buco dichiarato, da chiudere nel passo che monta le rotte:** la maschera nuova
non implementa ancora `canDeactivate`, e `unsavedChangesGuard` in quel caso lascia uscire
**senza chiedere** (optional chaining, per costruzione). Il dialogo appartiene al piede:
o si fanno insieme, o si esce da un documento aperto senza che nessuno lo chieda.

### Conformità del Blocco 1 alla sezione A — 21/08/2026

⛔ **Solo il Blocco 1**, e solo contro `docs/11` sezione A: non è un censimento nuovo.

| Regola A                                                             | Implementazione Blocco 1                                                                                                     | Esito                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **A3** — il tipo è scelto alla creazione, la maschera non lo cambia  | `mode` dalla rotta, valore fisso, `requireStoreSaleMode` lancia se manca                                                     | ✅ conforme                                    |
| **A3** — Vendita e Reso condividono l'impianto, non il comportamento | un componente, un modello di riga, una collezione; le differenze nel descrittore                                             | ✅ conforme                                    |
| **A13** — testata: Location, Cliente (facoltativo), Data             | i tre campi, su **entrambi** i modi                                                                                          | ✅ conforme                                    |
| **A13** — Data: default oggi, modificabile, caricata dal documento   | campo sempre modificabile, `documentDate` sempre nel payload; servizio allineato                                             | ✅ conforme                                    |
| **A13** — senza Location valida non si prosegue                      | gate sulla sola sede + stato vuoto al posto delle righe                                                                      | ✅ conforme                                    |
| **A13** — il netto/ivato NON sta in testata                          | nessun controllo di modalità prezzo nella testata                                                                            | ✅ conforme                                    |
| **A5** — numerazione dal sistema comune                              | non implementata in questo blocco (T8B)                                                                                      | ⏳ fuori blocco, dichiarato                    |
| **A2** — una vendita conclusa si riapre, si modifica e si risalva    | caricamento per id, payload con `id` di documento e di riga, testata e righe conservate                                      | ✅ conforme (l'eliminazione resta al passo 14) |
| **A11** — il Reso non ha documento origine                           | nessun collegamento a una vendita: il cliente è un dato di testata, non un'origine                                           | ✅ conforme                                    |
| **A11-ter** — la spunta di riga decide il carico                     | `loadsStock` nel modello, `restockable` solo nel mapper verso il DTO                                                         | ✅ conforme                                    |
| **A18** — nessun movimento prima della conclusione                   | il blocco non tocca movimenti; li fa il server al salvataggio                                                                | ✅ conforme                                    |
| **A20** — densità e componenti comuni, nessuna palette propria       | `doc-form__*` globali, `app-document-mobile-panel`, token esistenti                                                          | ✅ conforme                                    |
| **A17** — l'azione finale dice «Concludi vendita» / «Concludi reso»  | nessuna azione in questo blocco: `save()` esiste, il pulsante è del piede                                                    | ⏳ fuori blocco, dichiarato                    |
| **A13** — la sede assegnata esce di default, altrimenti si sceglie   | controllo comune in entrambi i modi; precompila dalla sede assegnata, e con una sola non cambia natura                       | ✅ conforme                                    |
| **A13** — il cambio di sede è esplicito e autorizzato                | in modifica vince la sede persistita; il cambio lo fa l'operatore, il server verifica (T6)                                   | ✅ conforme                                    |
| **A8** — pagamenti differiti al blocco Pagamenti/Tesoreria           | nessun campo, nessun default, nessun trasporto. DTO non più obbligatorio; assente = non modificato, i valori storici restano | ✅ conforme                                    |
| **A13** — `documentDate` ≠ `createdAt`                               | la data documento si scrive; `StockMovement.createdAt` non la insegue più sullo scarico                                      | ✅ conforme                                    |
| _(non in A)_ — il motore di **carico** riallinea `createdAt`         | comportamento preesistente di Reso e Arrivo merce, non toccato                                                               | ⏸ **APERTO**: uniformarlo tocca l'Arrivo merce |

### Conformità del passo 9 (righe) alla sezione A — 21/08/2026

| Regola corrente                                                            | Comportamento nella maschera nuova                                                                                                   | Primitiva comune riusata                                                             | Esito                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **A3** — stessa struttura, effetti di dominio opposti                      | un form, un modello di riga, una collezione, una griglia. Il modo decide solo etichette ed effetti                                   | descrittore di modalità (passo 8)                                                    | ✅                                                 |
| **A11-ter / A18** — la spunta di riga decide il movimento                  | **un campo solo**, `loadsStock`, letto «Scarica giacenze» sulla Vendita e «Carica giacenze» sul Reso. Cella fissa, non nel selettore | modello riga comune; `restockable` resta solo nel mapper verso il DTO                | ✅                                                 |
| **A15** — colonne `Articolo · SKU · Q.tà · Prezzo · Sconto · IVA · Totale` | le sette dichiarate, SKU colonna vera, Totale calcolato                                                                              | `STORE_SALE_LINE_COLUMNS` (finora mai usato), `app-table-column-picker`              | ✅                                                 |
| **C 19/08** — il costo non esiste, nemmeno spento                          | non è dichiarato: non compare nel selettore, quindi non si può accendere                                                             | la lista propria del banco                                                           | ✅                                                 |
| **A15** — quantità con digitazione diretta e stepper                       | campo numerico più − / +                                                                                                             | —                                                                                    | ✅                                                 |
| **A15** — nome, quantità, prezzo, sconto modificabili                      | celle editabili sulla riga; sconto dal parser comune (cascate comprese)                                                              | `parseEffectiveDiscountPercent`                                                      | ✅                                                 |
| **A4** — netto/ivato nella **testata della colonna Prezzo**                | selettore nell'intestazione, modalità persistita e modificabile; il netto resta il dato                                              | `app-price-mode-menu`, `getPriceModePreference`, `document-vat.util`                 | ✅                                                 |
| **A4** — nessun forcing «sempre ivato»                                     | i due tipi entrano in `SALES_PRICE_MODE_TYPES`; il server non cabla più la modalità                                                  | contratto comune del percorso documenti                                              | ✅ (T5 chiuso)                                     |
| **A14** — una sola porta per pistola e tastiera                            | un campo unico; Invio conferma; il pannello di ricerca è quello condiviso                                                            | `BarcodeLookupService`, `app-document-product-search-panel`, **E-5** appena estratto | ✅                                                 |
| **A14** — la query digitata non crea righe                                 | la riga nasce solo da un articolo risolto o scelto                                                                                   | —                                                                                    | ✅                                                 |
| **A14** — stesso EAN due volte → incremento                                | la riga esistente cresce; nessuna riga gemella                                                                                       | —                                                                                    | ✅                                                 |
| **A14** — codice non trovato → segnale, nessuna riga                       | beep, messaggio in linea, campo pronto                                                                                               | —                                                                                    | ✅                                                 |
| **A14 / A19** — dopo l'aggiunta il campo torna pronto                      | si pulisce e riprende il fuoco                                                                                                       | —                                                                                    | ✅                                                 |
| **A18** — disponibilità: avviso, mai blocco                                | avviso sulla riga e in testa alla tabella; il salvataggio parte lo stesso                                                            | `VariantSummary` (giacenze per sede)                                                 | ✅                                                 |
| **A18** — nessun movimento prima della conclusione                         | la maschera non ha nessun percorso verso i movimenti                                                                                 | —                                                                                    | ✅                                                 |
| **§6** — niente ordinamento per colonna, niente riordino manuale           | intestazioni senza pulsante, nessun `CdkDropList`                                                                                    | —                                                                                    | ✅                                                 |
| **A8** — nessun pagamento in questo blocco                                 | invariato dal Blocco 1: né campo né trasporto                                                                                        | —                                                                                    | ✅                                                 |
| **A14** — battuta HID riconosciuta senza contaminare il campo attivo       | non implementata: la porta è quella con Invio                                                                                        | —                                                                                    | ⏳ blocco scanner (M1/M2, misura con lettore vero) |
| _(non in A)_ — **default della spunta** su una riga nuova                  | dal contratto documentale comune: `managesStock` dell'articolo                                                                       | `VariantSummary.managesStock`                                                        | ⏸ **APERTO**: A non lo dichiara, va confermato     |

```text
╔═ PRIMA DI TOCCARE LA MASCHERA ══════════════════════════════════════════════╗

 0 ·  L'unica vera decisione aperta (D1, §4.D) torna al proprietario: blocca
      SOLO la riga «Sconto extra» del piede (passo 12), non il resto.
      ⛔ M1/M2 (§4.E) non sono decisioni da prendere ora: sono misure che
      richiedono un LETTORE VERO in mano, e riguardano solo E-8 (passo 15).

 1 ·  T13 — promozione di column-width-distribution.util.ts a shared/table-columns/
      Prerequisito bloccante: senza, il banco non può usare il motore larghezze.
      Nessun cambio di comportamento. Test invariati.

 2 ·  E-1 motore larghezze colonne (con T13 come prerequisito bloccante).
      ⛔ Riclassificato 21/08 (§5.3): è la SOLA bloccante di questa fascia.
      E-2 riordino righe · E-3 frase accessibile · E-4 <th> ordinabile sono
      RINVIABILI — verificato che il banco non ordina per colonna (nessun
      `sortable` in STORE_SALE_LINE_COLUMNS) né riordina a mano (§6: l'ordine
      è quello di scansione). Farle ora resta un'opzione valida — correggono
      per strada quattro maschere ferme alla variante senza clamp — ma non
      condizionano l'inizio del passo 8.

 3 ·  E-6 giro contatori · E-7 conflitto numero — entrambe BLOCCANTI (§5.3):
      la numerazione comune con proposta è decisa (4.A), non opzionale.
      E-6 porta con sé la decisione «lo store riceve DocumentCountersService?».
      E-7 si può fare da sola ed è la più piccola.
      ⛔ E-5 (stato ricerca prodotto in riga) NON sta in questa fascia: si fa
      insieme al passo 9, quando la griglia monta `document-line-product-cell`
      — vedi §5.3.

╠═ IL PERCORSO DI SALVATAGGIO, PRIMA DELL'INTERFACCIA ════════════════════════╣

 4 ·  T1 + T2 — il client impara a mandare gli id.
      ⛔ Non un secondo contratto: si estendono i tipi client fino a quelli che
      il DTO server GIÀ accetta. Modello: saveGoodsReceipt.
      ⚠️ Attenzione a G-08: appena il client manda gli id di riga, mandare
      SEMPRE vatCodeId (o description, o prezzo) invece di ometterli quando
      non toccati vanifica il contratto binario dello snapshot — vale per
      TUTTI i campi fotografia, non solo l'IVA.

 5 ·  T3 + T4 — simmetria Vendita/Reso nel DTO: vatCodeId al Reso, prezzo non più «?? 0».
 6 ·  T6 — lo scope di sede si verifica anche sul documento esistente E su
      quella nuova richiesta: un operatore che vede A non deve poter portare
      un documento di B in A. Richiede prima di allargare il select di
      loadEditableStoreDocument.
 7 ·  T7 + T8 — payload di conflitto numero, serie per sede, numero per data.
 7-bis · T15 — idempotenza della creazione: claim transazionale sul modello
      OnlineOrderEvent (`docs/13` §11), prima che il client impari a ritentare
      da solo. Del motore comune, non specifica del banco.

╠═ LA MASCHERA ═══════════════════════════════════════════════════════════════╣

 8 ·  StoreSaleDocumentFormComponent, scheletro: testata doc-form + mobile panel,
      descrittore di modalità, UN modello di riga, UNA collezione.
      ⛔ Vendita e Reso COMPLETI da subito: ricerca, scansione, aggiunta riga,
      modifica, caricamento per id. Il vecchio pos non si tocca.
      ⚠️ FATTO IN PARTE il 21/08 — ricerca, scansione e aggiunta riga sono
      passate al passo 9, con la griglia: vedi «Il confine del primo blocco».

 9 ·  Righe desktop sulle celle condivise + STORE_SALE_LINE_COLUMNS (già scritto,
      mai usato) + DocumentLineFocusStore + motore larghezze del passo 2.
      ⛔ Qui, non prima: `document-line-product-cell` porta con sé l'apertura
      ricerca, quindi E-5 (stato del pannello di ricerca in riga) si estrae
      in questo stesso passo — vedi §5.3.
      ✅ FATTO il 21/08, con dentro la porta d'ingresso (ricerca e scansione)
      e il netto/ivato del passo 10.

10 ·  ✅ ASSORBITO nel passo 9 — il selettore vive nella testata della colonna
      Prezzo, quindi nasce con la colonna: `11` A4 lo diceva già («è parte
      della costruzione della tabella righe, non un lavoro autonomo che si
      possa fare prima»), e questa numerazione lo separava contro la specifica.
      Con lui è entrato T5 lato server: i due tipi del banco dentro
      SALES_PRICE_MODE_TYPES e il forcing «sempre ivato» rimosso.

11 ·  Card mobile: store-sale-line-card sopra app-document-line-card.

12 ·  Piede: computeDocumentTotals, note, azioni. Lo sconto extra entra qui
      SE D1 è chiusa; altrimenti resta la sola percentuale, dichiarata.

13 ·  Sostituzione: le rotte puntano alla maschera nuova, il vecchio componente
      e le 639 righe di pos__* si eliminano. O1·O2·O3·O4·O5·O7·O11·O12 si chiudono
      qui — non prima, e non uno per uno.

╠═ ELIMINAZIONE — è un lavoro a sé, non una riga della maschera ══════════════╣

14 ·  T9 + T10 + T11: i tre cancelli, i 14 effetti, i nove punti d'uso frontend.
      ⚠️ Il modello (Arrivo merce) è incompleto: non replicarne i due buchi.
      ⛔ E prima va decisa l'asimmetria E13: se delete si apre e cancel resta
      chiuso, la strada più distruttiva diventa l'unica disponibile.

╠═ SCANNER — trasversale, dopo M1/M2 ═════════════════════════════════════════╣

15 ·  E-8: la capacità comune nasce, e nasce per TUTTE E TRE le maschere.
      La consegna resta della maschera (§3). O13 si estingue qui.
      O15 — i test che oggi non esistono — nasce insieme alla capacità.
╚═════════════════════════════════════════════════════════════════════════════╝
```

### I test che il proprietario ha chiesto per lo scanner

Da scrivere col passo 15, e nessuno di questi esiste oggi:

```text
fuoco su Prezzo + scansione        → Prezzo invariato, articolo acquisito
fuoco su Quantità/Sconto/Nome      → campo invariato
digitazione umana normale          → NON intercettata come scanner
scansioni consecutive              → nessuna perdita, nessuna duplicazione
stesso EAN ripetuto                → il comportamento del documento (§3): banco incrementa,
                                     Ordine cliente incrementa, Arrivo merce riga nuova
EAN non trovato                    → nessuna riga fantasma
dopo la scansione                  → fuoco ripristinato coerentemente
```

⚠️ Più uno che il censimento ha reso necessario: **il doppio di `parseScanInput` negli spec
esistenti restituisce una stringa invece dell'oggetto `{quantità, codice}`** — un test che passa
su un doppio che non rispetta il contratto vero non prova niente.
